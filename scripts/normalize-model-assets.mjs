import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import {
  getBounds,
  NodeIO,
  PropertyType,
  VERSION as GLTF_TRANSFORM_VERSION,
} from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { simplifyPrimitive, textureCompress, weldPrimitive } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import draco3d from 'draco3dgltf';
import * as THREE from 'three';

const ROOT = process.cwd();
const SOURCE_ROOT = path.join(ROOT, 'assets', 'source', 'models');
const OUTPUT_ROOT = path.join(ROOT, 'public', 'models');
const REPORT_ROOT = path.join(ROOT, 'test-results', 'assets');
const DRY_RUN = process.argv.includes('--dry-run');

/**
 * `--only=<id>[,<id>...]` restricts the run to named `GENERATED_ASSETS` rows.
 *
 * Without it a one-word change to a single spec - the reason this flag exists is
 * `farm-barn`'s texture budget - rewrites all thirty shipped GLBs plus the
 * forklift and both workers, which is fine on a clean tree and indefensible on a
 * tree with eighty uncommitted files.
 *
 * THE REPORT IS MERGED, NEVER REPLACED. `write-model-provenance.mjs` throws if
 * `test-results/assets/normalization.json` has no entry for every spec in the
 * table, and `validate:assets` reads the same file - so a filtered run that
 * wrote a one-asset report would break both, several commands later, with an
 * error that points at the wrong thing.
 */
const ONLY = (() => {
  const flag = process.argv.find((argument) => argument.startsWith('--only='));
  if (!flag) return null;
  const ids = flag
    .slice('--only='.length)
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  if (ids.length === 0) throw new Error('--only= was given with no asset ids.');
  return ids;
})();

const paths = {
  forklift: {
    source: path.join(SOURCE_ROOT, 'forklift', 'forklift-original.glb'),
    output: path.join(OUTPUT_ROOT, 'forklift', 'forklift.glb'),
  },
  silo: {
    source: path.join(SOURCE_ROOT, 'machines', 'silo-unity-original.glb'),
    output: path.join(OUTPUT_ROOT, 'machines', 'silo.glb'),
  },
};

async function sha256(file) {
  const bytes = await readFile(file);
  return createHash('sha256').update(bytes).digest('hex');
}

async function preserveSource(source, currentOutput) {
  await mkdir(path.dirname(source), { recursive: true });
  try {
    await stat(source);
    return;
  } catch {
    // The immutable source has not been captured yet.
  }
  try {
    await copyFile(currentOutput, source, fsConstants.COPYFILE_EXCL);
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
  }
}

async function writeBinaryGLB(io, output, document) {
  const temporary = `${output}.tmp.glb`;
  await io.write(temporary, document);
  const bytes = await readFile(temporary);
  if (bytes.length < 12 || bytes.readUInt32LE(0) !== 0x46546c67) {
    await rm(temporary, { force: true });
    throw new Error(`Refusing to replace ${output}: generated output is not a binary GLB`);
  }
  await rename(temporary, output);
  await rm(`${output}.bin`, { force: true });
}

async function createIO() {
  const [dracoDecoder, dracoEncoder] = await Promise.all([
    draco3d.createDecoderModule(),
    draco3d.createEncoderModule(),
  ]);
  return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'draco3d.decoder': dracoDecoder,
    'draco3d.encoder': dracoEncoder,
    'meshopt.decoder': MeshoptDecoder,
    'meshopt.encoder': MeshoptEncoder,
  });
}

function colorFactor(hex) {
  const color = new THREE.Color(hex);
  return [color.r, color.g, color.b, 1];
}

function slug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// Uniform root scaling includes translation, otherwise offset source nodes drift.
export function multiplyScale(node, factor) {
  if (!Number.isFinite(factor) || factor <= 0) throw new Error('Invalid model scale');
  node.setScale(node.getScale().map((value) => value * factor));
  node.setTranslation(node.getTranslation().map((value) => value * factor));
}

function centreSceneBelow(document, scene) {
  const bounds = getBounds(scene);
  const centreX = (bounds.min[0] + bounds.max[0]) / 2;
  const centreZ = (bounds.min[2] + bounds.max[2]) / 2;
  const offset = [-centreX, -bounds.min[1], -centreZ];

  const root = document.getRoot();
  if (root.listAnimations().length > 0 || root.listSkins().length > 0) {
    const pivot = document.createNode('Pivot').setTranslation(offset);
    scene.listChildren().forEach((node) => pivot.addChild(node));
    scene.addChild(pivot);
    return;
  }

  scene.listChildren().forEach((node) => {
    const translation = node.getTranslation();
    node.setTranslation([
      translation[0] + offset[0],
      translation[1] + offset[1],
      translation[2] + offset[2],
    ]);
  });
}

function removeUnreferencedForkliftResources(root) {
  const referencedMaterials = new Set();
  const removableAccessors = new Set();
  root.listMeshes().forEach((mesh) => {
    mesh.listPrimitives().forEach((primitive) => {
      const material = primitive.getMaterial();
      if (material) referencedMaterials.add(material);
      for (const semantic of ['TEXCOORD_0', 'TANGENT']) {
        const accessor = primitive.getAttribute(semantic);
        if (accessor) {
          removableAccessors.add(accessor);
          primitive.setAttribute(semantic, null);
        }
      }
    });
  });

  removableAccessors.forEach((accessor) => {
    const hasRuntimeParent = accessor
      .listParents()
      .some((parent) => parent.propertyType !== PropertyType.ROOT);
    if (!hasRuntimeParent) accessor.dispose();
  });

  root.listMaterials().forEach((material) => {
    if (!referencedMaterials.has(material)) material.dispose();
  });

  const referencedTextures = new Set();
  for (const material of referencedMaterials) {
    [
      material.getBaseColorTexture(),
      material.getEmissiveTexture(),
      material.getMetallicRoughnessTexture(),
      material.getNormalTexture(),
      material.getOcclusionTexture(),
    ].forEach((texture) => {
      if (texture) referencedTextures.add(texture);
    });
  }
  root.listTextures().forEach((texture) => {
    if (!referencedTextures.has(texture)) texture.dispose();
  });
}

/**
 * Per-material simplification ratios for the forklift's wheel hardware.
 *
 * Wheels are roughly 70% of this model's geometry and the two bolt clusters
 * alone are 21.6k of its 61k source vertices - about 2 cm of hardware on a
 * 2.5 m vehicle, which no in-scene camera resolves. Hubs are reduced with
 * them; they sit inboard of the tyre. Tyre treads (`wheel_rubberPattern`) are
 * deliberately left alone, because they carry the round silhouette and the
 * manifest holds the vehicle's width to a 0.1 m band.
 *
 * Ratios are targets, not guarantees. These meshes are hard-surface and flat
 * shaded, so 39-57% of their vertices are normal-split duplicates of a shared
 * position (measured: 10,889 verts over 4,255 unique positions on
 * `wheel_bolts.B`). meshopt locks those attribute seams as borders, so achieved
 * reduction is well short of the requested ratio. Welding by position instead
 * would unlock it, but only by discarding the split normals that keep bolt
 * heads and hub facets crisp at walk-up distance, which is a bad trade.
 *
 * The reduction happens here rather than by round-tripping the source through
 * a modeller. A Blender round trip was measured and rejected: it permutes both
 * glTF animation order (which this function renames by index) and mesh order
 * (which supplies the generated index names runtime code matches on, such as
 * `forklift-hydraulic02-poles-19`). Simplifying in place keeps every one of
 * those orderings byte-stable.
 */
const FORKLIFT_SIMPLIFY_RATIOS = new Map([
  ['wheel_bolts.B', 0.2],
  ['wheel_bolts.F', 0.2],
  ['wheel_metal.B', 0.35],
  ['wheel_metal.F', 0.35],
]);

/**
 * Source clip name -> runtime clip name. The previous implementation assigned
 * these by array index, which silently mislabels every clip if the source is
 * ever re-exported with a different animation order. Measured on this source, a
 * modeller round trip reorders them to fork_up/fork_down and
 * wheels_backward/wheel_forward, which would have made the forks lower on
 * `fork-raise` and the wheels spin backwards on `wheels-forward`.
 */
const FORKLIFT_CLIP_NAMES = new Map([
  ['fork_upDownForwardBack', 'fork-cycle'],
  ['fork_down', 'fork-lower'],
  ['fork_up', 'fork-raise'],
  ['wheel_forward', 'wheels-forward'],
  ['wheels_backward', 'wheels-reverse'],
]);

async function simplifyForkliftWheels(root) {
  await MeshoptSimplifier.ready;
  const applied = [];
  for (const mesh of root.listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const materialName = primitive.getMaterial()?.getName();
      const ratio = materialName ? FORKLIFT_SIMPLIFY_RATIOS.get(materialName) : undefined;
      if (ratio === undefined) continue;
      const before = primitive.getAttribute('POSITION')?.getCount() ?? 0;
      // simplifyPrimitive expects welded input; welding merges only bitwise
      // identical vertices, so it is lossless on its own.
      weldPrimitive(primitive);
      simplifyPrimitive(primitive, { simplifier: MeshoptSimplifier, ratio, error: 0.02 });
      applied.push({
        material: materialName,
        ratio,
        vertsBefore: before,
        vertsAfter: primitive.getAttribute('POSITION')?.getCount() ?? 0,
      });
    }
  }
  if (applied.length !== FORKLIFT_SIMPLIFY_RATIOS.size) {
    throw new Error(
      `Forklift simplification expected ${FORKLIFT_SIMPLIFY_RATIOS.size} target primitives, matched ${applied.length}. ` +
        'The source material names changed; re-check FORKLIFT_SIMPLIFY_RATIOS.'
    );
  }
  return applied;
}

async function normalizeForklift(io, source, output) {
  const document = await io.read(source);
  const root = document.getRoot();
  const scene = root.listScenes()[0];
  if (!scene) throw new Error('Forklift source has no scene');

  const material = (name, color, metallic, roughness) =>
    document
      .createMaterial(name)
      .setBaseColorFactor(colorFactor(color))
      .setMetallicFactor(metallic)
      .setRoughnessFactor(roughness);

  const materials = {
    paint: material('painted-safety-amber', '#d99a2b', 0.45, 0.42),
    dark: material('structural-graphite', '#263238', 0.72, 0.32),
    rubber: material('industrial-rubber', '#111619', 0, 0.88),
    metal: material('galvanized-steel', '#74828a', 0.86, 0.28),
    seat: material('control-seat', '#30383b', 0, 0.78),
    glass: material('lamp-glass', '#bcecff', 0, 0.12)
      .setEmissiveFactor([0.35, 0.55, 0.62])
      .setAlphaMode('BLEND')
      .setAlpha(0.72),
  };

  // Runs before the material swap below, which discards the source names this
  // keys on.
  const simplified = await simplifyForkliftWheels(root);

  root.listMeshes().forEach((mesh, index) => {
    let partName = mesh.getName() || `part-${index + 1}`;
    mesh.listPrimitives().forEach((primitive) => {
      const originalName = primitive.getMaterial()?.getName() || partName;
      const lowerName = originalName.toLowerCase();
      partName = originalName;
      const family = lowerName.includes('rubber')
        ? 'rubber'
        : lowerName.includes('glass')
          ? 'glass'
          : lowerName.includes('chair')
            ? 'seat'
            : /(metal|fork|hydraulic|handle|bolt|wheel_metal|steering)/.test(lowerName)
              ? 'metal'
              : /(base|frame|roof|light|accent)/.test(lowerName)
                ? 'paint'
                : 'dark';
      primitive.setMaterial(materials[family]);
    });
    mesh.setName(`forklift-${slug(partName)}-${String(index + 1).padStart(2, '0')}`);
  });

  root.listNodes().forEach((node) => {
    const mesh = node.getMesh();
    if (mesh && /^Object_/i.test(node.getName())) {
      node.setName(mesh.getName());
    }
  });

  const unmappedClips = [];
  root.listAnimations().forEach((animation) => {
    const runtimeName = FORKLIFT_CLIP_NAMES.get(animation.getName());
    if (runtimeName) {
      animation.setName(runtimeName);
    } else {
      unmappedClips.push(animation.getName());
    }
  });
  if (unmappedClips.length > 0) {
    throw new Error(
      `Forklift source has unmapped animation clips: ${unmappedClips.join(', ')}. ` +
        'Names drive the runtime clip contract; update FORKLIFT_CLIP_NAMES deliberately.'
    );
  }
  scene.setName('MillOS_Forklift');

  centreSceneBelow(document, scene);
  removeUnreferencedForkliftResources(root);

  const pivot = scene.listChildren()[0];
  if (pivot) {
    const orientation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0));
    pivot.setRotation([orientation.x, orientation.y, orientation.z, orientation.w]);
  }
  centreSceneBelow(document, scene);

  root
    .listExtensionsUsed()
    .filter((extension) => extension.extensionName === 'EXT_texture_webp')
    .forEach((extension) => extension.dispose());

  Object.assign(root.getAsset(), {
    generator: `MillOS asset pipeline, glTF-Transform ${GLTF_TRANSFORM_VERSION}`,
    copyright: 'Forklift by Mantas Stankaitis, CC BY 4.0',
  });

  await writeBinaryGLB(io, output, document);
  return {
    bounds: getBounds(scene),
    materials: root.listMaterials().length,
    textures: root.listTextures().length,
    animations: root.listAnimations().map((animation) => animation.getName()),
    simplified,
  };
}

/**
 * Every generated asset, with the one decision the pipeline cannot derive: how
 * big the thing is in metres.
 *
 * `target` is applied uniformly, never per axis, so the generated proportions
 * survive. `axis` says which dimension the target refers to - `max` is the
 * larger of the two horizontal extents, and is right for anything whose
 * footprint has to keep fitting its plot; `y` is for subjects read by height
 * (a pillar box, a fence panel); `x`/`z` pin a specific axis where the
 * shipped component's own dimension is the constraint.
 *
 * Targets come from the shipped components, measured two ways. Buildings use
 * the *body* box from source rather than the in-engine bounding box, because
 * most of these roofs are boxes yawed 45 degrees and an axis-aligned world box
 * around one is inflated by root two - the town hall measures 28.3 m across in
 * engine and is a 12 m building. Animals use realistic lengths, which is also
 * what the trial harness solved their neck reach against.
 *
 * `yaw` is zero almost everywhere: the generator put the front of every
 * building on +Z, which is the same convention `public/models/README.md`
 * already required. It is a field rather than an assumption because nothing
 * enforces that on the generator's side.
 */
const GENERATED_ASSET_ATTRIBUTION = 'Generated with Tripo3D for MillOS under an API plan';

/**
 * Exported so `scripts/write-model-provenance.mjs` can read the size decisions
 * from the table that made them, rather than keeping a second copy that goes
 * stale. Importing this module must therefore stay side-effect free, which is
 * what the entry-point guard on `main()` at the bottom of the file is for.
 */
/**
 * `texture` raises the resample above the 512 default for the six assets that
 * measure UNDER-RESOLVED against the capture cameras - all of them large, all
 * starved because one atlas is stretched over a big surface. The 4096-square
 * originals are preserved under `assets/source/models/`, so this costs no
 * generation credits, only bytes and GPU texture memory.
 *
 * Measured screen-pixels-per-texel at the nearest camera, before -> after:
 *   barn 4.64 -> 2.32, duckpond 3.18 -> 1.59, townhall 3.10 -> 1.55,
 *   castle 2.35 -> 1.18, marketstall 2.24 -> 1.12, farmhouse 1.61 -> 0.81.
 * The other 24 sit at 1.06 or below already; the cow is at 0.24, so raising it
 * would spend memory on detail no camera can see.
 */
export const GENERATED_ASSETS = [
  {
    id: 'world-fuel-pump-shell',
    slug: 'fuel-pump-shell',
    area: 'world',
    target: 1.8,
    axis: 'y',
    texture: 256,
    yaw: Math.PI / 2,
    preparedSource: 'fuel-pump-shell-authored-colour-normals-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Blender one-material authored atlas; exact triangle correspondence restores palette and hard-surface normals, Tripo normal and roughness maps retained.',
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute restoration',
    ],
    taskId: '4bdb2403-19c1-4414-a945-beb3b4f8e736',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-station-canopy',
    slug: 'station-canopy',
    area: 'world',
    target: 16.5,
    axis: 'x',
    texture: 512,
    yaw: 0,
    preparedSource: 'station-canopy-authored-colour-normals-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Blender one-material authored atlas; exact triangle correspondence restores palette and hard-surface normals, Tripo normal and roughness maps retained.',
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute restoration',
    ],
    taskId: '8a5228aa-86df-4d0f-a787-4afe8d5f19d6',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-checkpoint-booth',
    slug: 'checkpoint-booth',
    area: 'world',
    target: 4.3,
    axis: 'x',
    texture: 512,
    yaw: 0,
    preparedSource: 'checkpoint-booth-authored-colour-normals-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Blender one-material authored atlas; exact triangle correspondence restores palette and hard-surface normals, Tripo normal and roughness maps retained.',
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute restoration',
    ],
    taskId: '3131e52d-c089-4c2d-a00e-1ffa098550c4',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-brick-carport',
    slug: 'brick-carport',
    area: 'world',
    target: 10.6,
    axis: 'x',
    texture: 1024,
    yaw: 0,
    preparedSource: 'brick-carport-roof-repaired.glb',
    preparationScript: 'scripts/blender/repair_carport_roof.py',
    preparationMethod:
      'Replace 5564 folded roof faces with a clean bevelled cap; retain provider brickwork and atlas, one material, non-degenerate UVs.',
    fitDimensions: [10.6, 3.9, 8.6],
    pipeline: [
      'image_to_model v3.1-20260211, smart_low_poly:true, texture:true, pbr:true',
      'Blender area-weighted normals',
    ],
    taskId: 'c0dfd1e4-4c21-4f2b-bbc2-cbcb8d825253',
    retrievedAt: '2026-09-07',
  },
  {
    id: 'world-path-lamp-victorian',
    slug: 'path-lamp-victorian',
    area: 'world',
    target: 4.45,
    axis: 'y',
    texture: 256,
    yaw: 0,
    preparedSource: 'path-lamp-victorian-blender-cleanup.glb',
    pipeline: [
      'image_to_model v3.1-20260211, smart_low_poly:true, texture:true, pbr:true',
      'Blender area-weighted normals',
    ],
    taskId: 'd0a365e4-851b-496f-9e1b-7343af2b1857',
    retrievedAt: '2026-09-07',
  },
  {
    id: 'world-path-lamp-modern',
    slug: 'path-lamp-modern',
    area: 'world',
    target: 4.25,
    axis: 'y',
    texture: 256,
    yaw: 0,
    preparedSource: 'path-lamp-modern-blender-cleanup.glb',
    pipeline: [
      'image_to_model v3.1-20260211, smart_low_poly:true, texture:true, pbr:true',
      'Blender area-weighted normals',
    ],
    taskId: '2efe4b42-80b9-4819-993c-83993e9d5236',
    retrievedAt: '2026-09-07',
  },
  {
    id: 'world-info-sign',
    slug: 'info-sign',
    area: 'world',
    target: 1.55,
    axis: 'y',
    texture: 256,
    yaw: 0,
    preparedSource: 'info-sign-blender-cleanup.glb',
    pipeline: [
      'image_to_model v3.1-20260211, smart_low_poly:true, texture:true, pbr:true',
      'Blender area-weighted normals',
    ],
    taskId: 'f66e1797-0d66-4e74-81cd-119456b357f4',
    retrievedAt: '2026-09-07',
  },
  {
    id: 'world-cute-car-hatchback',
    slug: 'cute-car-hatchback',
    area: 'world',
    target: 2.92,
    axis: 'x',
    texture: 512,
    yaw: 0,
    preparedSource: 'cute-car-hatchback-lamps.glb',
    preparationScript: 'scripts/blender/repair_car_rear_lamps.py',
    preparationMethod:
      'Area-weighted normals followed by rear-lamp vertex tint, preserving the atlas, front lamps and one material.',
    pipeline: [
      'image_to_model v3.1-20260211, smart_low_poly:true, texture:true, pbr:true',
      'Blender weighted normals and rear-lamp vertex tint',
    ],
    taskId: '9de63797-04ca-4f9a-95c3-5cad2e02bcfa',
    retrievedAt: '2026-09-07',
  },
  {
    id: 'world-cute-car-pickup',
    slug: 'cute-car-pickup',
    area: 'world',
    target: 4.12,
    axis: 'x',
    texture: 512,
    yaw: 0,
    preparedSource: 'cute-car-pickup-proportioned.glb',
    preparationScript: 'scripts/blender/repair_pickup_proportions.py',
    preparationMethod:
      'Area-weighted normals, rear-lamp vertex tint, then shorten upper body to authored 1.58 m height while preserving lowest 0.78 m and wheels.',
    pipeline: [
      'image_to_model v3.1-20260211, smart_low_poly:true, texture:true, pbr:true',
      'Blender weighted normals, rear lamps and upper-body proportion correction',
    ],
    taskId: '69c7a569-d67b-4cc3-96f4-7cfcc3283a26',
    retrievedAt: '2026-09-07',
  },

  {
    id: 'world-food-truck',
    slug: 'food-truck',
    area: 'world',
    target: 7.975,
    axis: 'z',
    texture: 512,
    yaw: Math.PI,
    preparedSource: 'food-truck-proportioned.glb',
    preparationScript: 'scripts/blender/repair_food_truck.py',
    preparationMethod:
      'Shorten only the upper body to the authored 2.65 m overall height, leaving the lowest 0.9 m and wheel vertices unchanged; recalculate area-weighted normals.',
    pipeline: [
      'image_to_model v3.1-20260211, smart_low_poly:true, texture:true, pbr:true',
      'Blender upper-body proportion correction and area-weighted normals',
    ],
    taskId: 'd1e9b696-7db8-4430-9c2a-7927ec78d428',
    retrievedAt: '2026-09-07',
  },
  {
    id: 'world-office-apartment-three',
    slug: 'office-apartment-three',
    area: 'world',
    target: 16.5,
    axis: 'x',
    texture: 1024,
    yaw: -Math.PI / 2,
    fitDimensions: [16.5, 12.6, 15],
    preparedSource: 'office-apartment-three-blender-cleanup.glb',
    preparationScript: 'scripts/blender/cut_apartment_floor.py',
    preparationMethod:
      'Remove one 3.5 m middle storey at floor bands; preserve roof, entrance and remaining windows at full scale. Recalculate area-weighted normals.',
    pipeline: [
      'image_to_model v3.1-20260211, smart_low_poly:true, texture:true, pbr:true',
      'Blender middle-storey removal and area-weighted normals',
    ],
    taskId: 'da878c89-f8e0-4aef-8efa-ad18b47edced',
    retrievedAt: '2026-09-07',
  },
  {
    id: 'world-canal-boat',
    slug: 'canal-boat',
    area: 'world',
    target: 12.95,
    axis: 'z',
    texture: 1024,
    preparedSource: 'canal-boat-blender-cleanup.glb',
    pipeline: [
      'image_to_model v3.1-20260211, smart_low_poly:true, texture:true, pbr:true',
      'Blender area-weighted normals',
    ],
    taskId: 'aa7ac592-5e84-4ab6-8afa-c6c24f317718',
    retrievedAt: '2026-09-07',
  },
  {
    id: 'world-cute-car-suv',
    slug: 'cute-car-suv',
    area: 'world',
    target: 3.72,
    axis: 'x',
    texture: 512,
    yaw: 0,
    fitDimensions: [3.72, 1.705, 1.96],
    preparedSource: 'cute-car-suv-blender-cleanup.glb',
    pipeline: [
      'image_to_model v3.1-20260211, smart_low_poly:true, texture:true, pbr:true',
      'Blender area-weighted normals',
    ],
    taskId: 'a2420114-f0df-4cc1-8287-48860f2a61e7',
    retrievedAt: '2026-09-07',
  },
  {
    id: 'world-kiosk-cafe',
    slug: 'kiosk-cafe',
    area: 'world',
    target: 5.6,
    axis: 'x',
    texture: 512,
    yaw: -Math.PI / 2,
    preparedSource: 'kiosk-cafe-blender-cleanup.glb',
    pipeline: [
      'image_to_model v3.1-20260211, smart_low_poly:true, texture:true, pbr:true',
      'Blender area-weighted normals',
    ],
    taskId: 'af78663e-ae54-446d-b977-bd2e0558951b',
    retrievedAt: '2026-09-07',
  },
  {
    id: 'world-office-apartment',
    slug: 'office-apartment',
    area: 'world',
    target: 16.5,
    axis: 'x',
    texture: 1024,
    yaw: -Math.PI / 2,
    fitDimensions: [16.5, 16.1, 15],
    preparedSource: 'office-apartment-blender-cleanup.glb',
    pipeline: [
      'image_to_model v3.1-20260211, smart_low_poly:true, texture:true, pbr:true',
      'Blender area-weighted normals',
    ],
    taskId: 'da878c89-f8e0-4aef-8efa-ad18b47edced',
    retrievedAt: '2026-09-07',
  },

  {
    id: 'world-cute-car-sedan',
    slug: 'cute-car-sedan',
    area: 'world',
    target: 3.52,
    axis: 'x',
    texture: 512,
    preparedSource: 'cute-car-sedan-blender-cleanup.glb',
    pipeline: [
      'image_to_model v3.1-20260211, smart_low_poly:true, texture:true, pbr:true',
      'Blender area-weighted normals',
    ],
    taskId: '47b0f068-58d6-4536-be42-ae4e54933379',
    retrievedAt: '2026-09-07',
  },
  {
    id: 'world-small-office',
    slug: 'small-office',
    area: 'world',
    target: 14.5,
    axis: 'x',
    texture: 1024,
    fitDimensions: [14.5, 8.22, 10.5],
    preparedSource: 'small-office-blender-cleanup.glb',
    pipeline: [
      'image_to_model v3.1-20260211, smart_low_poly:true, texture:true, pbr:true',
      'Blender area-weighted normals',
    ],
    taskId: 'b1feb03a-e73c-41f9-9d87-c700355b9088',
    retrievedAt: '2026-09-07',
  },
  {
    id: 'world-caravan',
    slug: 'caravan',
    area: 'world',
    target: 6.455,
    axis: 'z',
    texture: 512,
    preparedSource: 'caravan-blender-cleanup.glb',
    pipeline: [
      'image_to_model v3.1-20260211, smart_low_poly:true, texture:true, pbr:true',
      'Blender area-weighted normals',
    ],
    taskId: '74dfba72-6a36-4a79-9488-fdf13e062ec6',
    retrievedAt: '2026-09-07',
  },
  {
    id: 'world-waste-bin',
    slug: 'waste-bin',
    area: 'world',
    target: 0.8,
    axis: 'y',
    texture: 256,
    fitDimensions: [0.56, 0.8, 0.56],
    pipeline: ['image_to_model v3.1-20260211, smart_low_poly:true, texture:true, pbr:true'],
    taskId: '1f3a23d9-67d1-4d82-ba7e-ef465f02de42',
    retrievedAt: '2026-09-07',
  },
  {
    id: 'world-picnic-table',
    slug: 'picnic-table',
    area: 'world',
    target: 1.8,
    axis: 'x',
    texture: 512,
    pipeline: ['image_to_model v3.1-20260211, smart_low_poly:true, texture:true, pbr:true'],
    taskId: '41922669-dd09-4d8c-9d66-e49c1fcac9f2',
    retrievedAt: '2026-09-07',
  },
  {
    id: 'world-nissen-hut',
    slug: 'nissen-hut',
    area: 'world',
    target: 5.2,
    axis: 'x',
    yaw: Math.PI / 2,
    texture: 1024,
    fitDimensions: [5.2, 2.5, 12.4],
    simplifyRatio: 0.65,
    pipeline: ['image_to_model v3.1-20260211, smart_low_poly:true, texture:true, pbr:true'],
    taskId: 'ea5ddd22-5a22-4a02-a124-4d909f669928',
    retrievedAt: '2026-09-07',
  },
  {
    id: 'world-park-bench',
    slug: 'park-bench',
    area: 'world',
    target: 1.8,
    axis: 'x',
    yaw: -Math.PI / 2,
    texture: 512,
    pipeline: ['image_to_model v3.1-20260211, smart_low_poly:true, texture:true, pbr:true'],
    taskId: 'bc6438f9-16aa-452e-80ef-c835629d88c1',
    retrievedAt: '2026-09-07',
  },
  {
    id: 'world-bus-shelter',
    slug: 'bus-shelter',
    area: 'world',
    target: 4.4,
    axis: 'x',
    yaw: -Math.PI / 2,
    texture: 512,
    fitDimensions: [4.4, 2.99, 2.3],
    pipeline: ['image_to_model v3.1-20260211, smart_low_poly:true, texture:true, pbr:true'],
    taskId: 'ea364612-95ec-42f3-a771-36dbecbd0bb9',
    retrievedAt: '2026-09-07',
  },
  // Reference-guided Tripo v3.1 mascot. Rotate its long +Z axis into the pylon's +X.
  {
    id: 'world-dino-mascot',
    slug: 'dino-mascot',
    area: 'world',
    target: 1.9558,
    axis: 'x',
    yaw: -Math.PI / 2,
    texture: 512,
    pipeline: ['image_to_model v3.1-20260211, smart_low_poly:true, texture:true, pbr:true'],
    taskId: '09017288-088f-4811-85e4-fefc3660fc71',
    retrievedAt: '2026-09-07',
  },
  // Farm animals. Rigged, so the runtime can drive a neck chain; see
  // `src/components/models/RiggedCreatureModel.tsx`.
  { id: 'farm-cow', slug: 'cow', area: 'farm', target: 1.805, axis: 'z', rigged: true },
  { id: 'farm-sheep', slug: 'sheep', area: 'farm', target: 1.15, axis: 'max', rigged: true },
  { id: 'farm-pig', slug: 'pig', area: 'farm', target: 1.25, axis: 'max', rigged: true },
  { id: 'farm-horse', slug: 'horse', area: 'farm', target: 2.35, axis: 'max', rigged: true },
  { id: 'farm-chicken', slug: 'chicken', area: 'farm', target: 0.42, axis: 'max', rigged: true },
  { id: 'farm-crow', slug: 'crow', area: 'farm', target: 0.42, axis: 'max', rigged: true },
  { id: 'farm-duck', slug: 'duck', area: 'farm', target: 0.5, axis: 'max', rigged: true },
  { id: 'village-cat', slug: 'cat', area: 'village', target: 0.5, axis: 'y', rigged: true },

  // Farm structures and props.
  // TEXTURE BUDGETS ARE MEASURED, NOT ESTIMATED. `texture:` above 512 has to be
  // justified in SCREEN PIXELS PER TEXEL at the closest benchmark camera that
  // actually contains the asset - `test-results/pass6/texel-density.mjs` prints
  // it for all thirty, from the shipped GLB's own UV layout, the world
  // placements in `VillageArea`/`FarmArea` and the cameras in `SITE_LAYOUT`.
  //
  // Measured 2026-08-18: NOTHING in this table is under-resolved. Every asset
  // reads at or below 1.0 px/texel at its closest camera, and so does the
  // WORST-RESOLVED TENTH of each one's surface area (`village-townhall` peaks at
  // 1.01, `farm-barn` at 0.85). Four consecutive work orders carried "barn is
  // the only generated asset measurably under-resolved: 2.32 px/texel at 1024"
  // as a standing recommendation with no probe in the repo behind it. It is off
  // by about 3.6x and points the wrong way: the barn reads 0.64 px/texel at
  // `paddock`, its closest camera at 29 m, so taking it to 2048 would spend
  // roughly 37 MB of GPU texture memory to reach 0.32 - four times the memory
  // for detail no camera in the set can resolve. Left at 1024.
  { id: 'farm-barn', slug: 'barn', area: 'farm', target: 10, axis: 'max', texture: 1024 },
  { id: 'farm-coop', slug: 'coop', area: 'farm', target: 3, axis: 'max' },
  { id: 'farm-farmhouse', slug: 'farmhouse', area: 'farm', target: 6, axis: 'max', texture: 1024 },
  // The call site multiplies by 1.5, so the asset carries the unscaled size.
  { id: 'farm-windmill', slug: 'windmill', area: 'farm', target: 5.84, axis: 'max' },
  { id: 'farm-haybale', slug: 'haybale', area: 'farm', target: 1.5, axis: 'max' },
  // Yawed a quarter turn: these two are elongated props with no front, and the
  // generator laid both along Z where the shipped components run along X.
  {
    id: 'farm-watertrough',
    slug: 'watertrough',
    area: 'farm',
    target: 1.5,
    axis: 'max',
    yaw: Math.PI / 2,
  },
  {
    id: 'farm-gardenbed',
    slug: 'gardenbed',
    area: 'farm',
    target: 3,
    axis: 'max',
    yaw: Math.PI / 2,
  },
  // One panel, sized by HEIGHT. The generated panel is 1 x 0.64 x 0.12, so a
  // 3 m width would stand 1.9 m tall - a stockade, against the 1.05 m post-and
  // rail it replaces. `FenceSection` tiles the panel to reach the length it is
  // asked for.
  { id: 'farm-fence', slug: 'fence', area: 'farm', target: 1.05, axis: 'y' },

  // Village structures and props.
  { id: 'village-cottage', slug: 'cottage', area: 'village', target: 5, axis: 'max' },
  { id: 'village-shop', slug: 'shop', area: 'village', target: 6, axis: 'max' },
  { id: 'village-church', slug: 'church', area: 'village', target: 12, axis: 'max' },
  {
    id: 'village-townhall',
    slug: 'townhall',
    area: 'village',
    target: 12,
    axis: 'max',
    texture: 1024,
  },
  { id: 'village-pub', slug: 'pub', area: 'village', target: 8, axis: 'max' },
  { id: 'village-school', slug: 'school', area: 'village', target: 10, axis: 'max' },
  { id: 'village-forge', slug: 'forge', area: 'village', target: 7, axis: 'max' },
  { id: 'village-wishingwell', slug: 'wishingwell', area: 'village', target: 2.4, axis: 'max' },
  {
    id: 'village-marketstall',
    slug: 'marketstall',
    area: 'village',
    target: 2.8,
    axis: 'max',
    texture: 1024,
  },
  { id: 'village-postbox', slug: 'postbox', area: 'village', target: 1.5, axis: 'y' },
  // Sized by HEIGHT. The corrected fountain still came back as tall as it is
  // wide (0.95 x 1.00 x 0.96 in the unit box) where the shipped one is a low
  // two-tier basin, so matching its 7 m pool would stand a 7.3 m monument in the
  // village square. Height 3.32 m matches the shipped silhouette and gives a
  // 3.1 m pool.
  { id: 'village-fountain', slug: 'fountain', area: 'village', target: 3.32, axis: 'y' },
  {
    id: 'village-duckpond',
    slug: 'duckpond',
    area: 'village',
    target: 11,
    axis: 'max',
    texture: 1024,
  },
  // Placed through SITE_LAYOUT at scale 1.5, so the asset carries 1/1.5 of the
  // in-engine footprint.
  {
    id: 'village-castle',
    slug: 'castle',
    area: 'village',
    target: 38.7,
    axis: 'max',
    texture: 1024,
  },
];

function generatedAssetPaths(spec) {
  return {
    source: path.join(SOURCE_ROOT, spec.area, `${spec.slug}-tripo-original.glb`),
    output: path.join(OUTPUT_ROOT, spec.area, `${spec.slug}.glb`),
  };
}

/**
 * The neck chain every rigged creature's runtime driver addresses. Tripo fits
 * the same 41-joint skeleton with the same bone names to quadrupeds, birds and
 * bipeds alike, which is what lets one driver serve a crow and a horse. Pinned
 * so a re-generated source that renames or drops a joint fails the pipeline
 * rather than silently shipping an animal whose head does not move.
 */
const CREATURE_REQUIRED_JOINTS = [
  'Root',
  'Hip',
  'Spine01',
  'Spine02',
  'NeckTwist01',
  'NeckTwist02',
  'Head',
];

/** Node-name -> world matrix for every node reachable from a scene. */
function collectWorldMatrices(scene) {
  const worlds = new Map();
  const visit = (node, parentMatrix) => {
    const local = new THREE.Matrix4().compose(
      new THREE.Vector3(...node.getTranslation()),
      new THREE.Quaternion(...node.getRotation()),
      new THREE.Vector3(...node.getScale())
    );
    const world = parentMatrix ? parentMatrix.clone().multiply(local) : local;
    worlds.set(node.getName(), world);
    node.listChildren().forEach((child) => visit(child, world));
  };
  scene.listChildren().forEach((node) => visit(node, null));
  return worlds;
}

function yawScene(scene, radians) {
  if (!radians) return;
  const yaw = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, radians, 0));
  scene.listChildren().forEach((node) => {
    const rotation = new THREE.Quaternion(...node.getRotation()).premultiply(yaw);
    node.setRotation([rotation.x, rotation.y, rotation.z, rotation.w]);
    const translation = new THREE.Vector3(...node.getTranslation()).applyQuaternion(yaw);
    node.setTranslation([translation.x, translation.y, translation.z]);
  });
}

function titleCase(slug) {
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

/**
 * One generated asset, from the immutable source to a runtime GLB.
 *
 * Four things here are not obvious and were each paid for during the trial
 * (`test-results/tripo-probe-20260815/FINDINGS.md`):
 *
 * 1. **A creature's facing is read off the skeleton, never the bounding box.**
 *    An animal is longer than it is wide on either, so a longest-axis heuristic
 *    cannot tell front from back - it ships a model facing backwards, which
 *    inverts the sign of the graze pitch. Measured on the horse, that made its
 *    "graze" lift the nose 245 mm. `Head` is compared against `Hip` along Z.
 * 2. **`centreSceneBelow` inserts a `Pivot` node** when the document has a
 *    skin, rather than translating the scene children. Both the skinned mesh
 *    node and the joints then sit under that pivot, so the bind matrix and the
 *    joint world matrices pick up the same offset and the skinning stays right.
 * 3. **The generator emits 4096-square maps** - 1.1 to 2.2 MB of JPEG per
 *    asset. 512 is the resolution these surfaces can actually resolve at any
 *    in-scene camera distance, and it is a 95% saving.
 * 4. **The metallic factor is forced to zero.** Tripo ships `metallic: 1.0`
 *    alongside an ORM map, so every surface reads as polished metal wherever
 *    that map's blue channel is not black. Roughness is left alone.
 */
async function normalizeGeneratedAsset(io, spec) {
  const { source, output } = generatedAssetPaths(spec);
  if (spec.preparedSource && path.basename(spec.preparedSource) !== spec.preparedSource)
    throw new Error('Blender derivative must be a sibling source file');
  const prepared = spec.preparedSource
    ? path.join(path.dirname(source), spec.preparedSource)
    : null;
  const document = await io.read(prepared ?? source);
  const root = document.getRoot();
  const scene = root.listScenes()[0];
  if (!scene) throw new Error(`${spec.id} source has no scene`);
  if (spec.simplifyRatio) {
    // Reuse the wheel pipeline's attribute-aware simplifier, retaining UV seams.
    await MeshoptSimplifier.ready;
    for (const mesh of root.listMeshes())
      for (const primitive of mesh.listPrimitives()) {
        weldPrimitive(primitive);
        simplifyPrimitive(primitive, {
          simplifier: MeshoptSimplifier,
          ratio: spec.simplifyRatio,
          error: 0.005,
        });
      }
  }

  let facingYaw = 0;
  if (spec.rigged) {
    const missingJoints = CREATURE_REQUIRED_JOINTS.filter(
      (joint) => !root.listNodes().some((node) => node.getName() === joint)
    );
    if (missingJoints.length > 0) {
      throw new Error(
        `${spec.id} is missing rig joints the runtime driver addresses: ${missingJoints.join(', ')}. ` +
          'Re-check the generated rig before regenerating this asset.'
      );
    }
    // Face +Z, derived from the skeleton. A 180-degree flip is not enough: the
    // generator laid the cow, horse, crow and duck along Z but the
    // sheep, pig and chicken along X, so a front/back test alone leaves three of
    // the eight standing broadside. The Head-minus-Hip vector gives the heading
    // directly, and its horizontal angle from +Z is the rotation to undo.
    const worlds = collectWorldMatrices(scene);
    const head = new THREE.Vector3().setFromMatrixPosition(worlds.get('Head'));
    const hip = new THREE.Vector3().setFromMatrixPosition(worlds.get('Hip'));
    const heading = new THREE.Vector2(head.x - hip.x, head.z - hip.z);
    if (heading.lengthSq() < 1e-8) {
      throw new Error(
        `${spec.id} has Head and Hip at the same horizontal position, so its facing cannot be derived from the rig.`
      );
    }
    // Snapped to the nearest quarter turn. The generator authors these
    // axis-aligned, so the residual angle is head-turn noise in the rest pose -
    // and honouring it leaves the model standing askew: the horse's raw heading
    // was -166 degrees, and the 14-degree remainder inflated its axis-aligned
    // width from 0.27 to 0.95. The skeleton still chooses *which* quarter turn;
    // only the sub-90-degree remainder is discarded.
    const rawYaw = -Math.atan2(heading.x, heading.y);
    facingYaw = Math.round(rawYaw / (Math.PI / 2)) * (Math.PI / 2);
    yawScene(scene, facingYaw);
  } else {
    yawScene(scene, spec.yaw ?? 0);
  }

  const initialBounds = getBounds(scene);
  const extent = {
    x: initialBounds.max[0] - initialBounds.min[0],
    y: initialBounds.max[1] - initialBounds.min[1],
    z: initialBounds.max[2] - initialBounds.min[2],
  };
  const measured = spec.axis === 'max' ? Math.max(extent.x, extent.z) : extent[spec.axis];
  const scaleFactor = measured > 0 ? spec.target / measured : 1;
  scene.listChildren().forEach((node) => multiplyScale(node, scaleFactor));
  if (spec.fitDimensions) {
    // Architectural overlays still speak the authored metre envelope.
    const scaledBounds = getBounds(scene);
    const factors = spec.fitDimensions.map(
      (target, i) => target / (scaledBounds.max[i] - scaledBounds.min[i])
    );
    if (factors.some((factor) => !Number.isFinite(factor) || factor < 0.8 || factor > 1.2))
      throw new Error(`${spec.id}: envelope fitting exceeds the 20 percent preservation limit`);
    const pivot = document.createNode('EnvelopeFit').setScale(factors);
    scene.listChildren().forEach((node) => pivot.addChild(node));
    scene.addChild(pivot);
  }
  centreSceneBelow(document, scene);

  const surface = root.listMaterials()[0];
  if (!surface) throw new Error(`${spec.id} has no material`);
  surface.setName(`${spec.slug}-surface`).setMetallicFactor(0);

  const meshNode = spec.rigged
    ? root.listNodes().find((node) => node.getSkin())
    : root.listNodes().find((node) => node.getMesh());
  const bodyName = `${titleCase(spec.slug)}Body`;
  if (meshNode) {
    meshNode.getMesh()?.setName(`${spec.slug}-mesh`);
    meshNode.setName(bodyName);
  }
  root.listTextures().forEach((texture) => {
    const slot = /normal/i.test(texture.getName() ?? '')
      ? 'normal'
      : /orm|rough|metal/i.test(texture.getName() ?? '')
        ? 'orm'
        : 'albedo';
    texture.setName(`${spec.slug}-${slot}`);
  });

  // No encoder is passed: `sharp` is not a declared dependency of this repo, and
  // the built-in fallback resamples and re-encodes without one. Quality-related
  // options are ignored in that mode, which is why none are set here.
  //
  // Size is per asset, because texel density is per asset. One 512-square atlas
  // stretched over a 10 m barn is 15 texels per metre; the same atlas on a 1.8 m
  // cow is 356. Measured against the capture cameras
  // (`test-results/.../texel-density.mjs`), the cow is over-resolved by 4x and
  // the barn under-resolved by nearly 5x - so a single global number is wrong in
  // both directions and only the starved assets are raised.
  const textureSize = spec.texture ?? 512;
  await document.transform(
    textureCompress({ targetFormat: 'jpeg', resize: [textureSize, textureSize] })
  );

  scene.setName(`MillOS_${titleCase(spec.area)}_${titleCase(spec.slug)}`);
  Object.assign(root.getAsset(), {
    generator: `MillOS generated-asset pipeline, glTF-Transform ${GLTF_TRANSFORM_VERSION}`,
    copyright: GENERATED_ASSET_ATTRIBUTION,
  });

  await writeBinaryGLB(io, output, document);
  const finalBounds = getBounds(scene);
  return {
    id: spec.id,
    file: path.relative(OUTPUT_ROOT, output),
    bodyNode: bodyName,
    blenderPreparation: prepared
      ? {
          file: path.relative(ROOT, prepared),
          sha256: await sha256(prepared),
          script: spec.preparationScript ?? 'scripts/blender/weighted_asset_normals.py',
          method:
            spec.preparationMethod ??
            'Weld coincident vertices at 1e-6 source units, area-weighted normals, weight 75; no added triangles',
        }
      : undefined,
    facingYaw: Number(facingYaw.toFixed(4)),
    scaleFactor: Number(scaleFactor.toFixed(5)),
    bounds: {
      width: Number((finalBounds.max[0] - finalBounds.min[0]).toFixed(4)),
      height: Number((finalBounds.max[1] - finalBounds.min[1]).toFixed(4)),
      length: Number((finalBounds.max[2] - finalBounds.min[2]).toFixed(4)),
      minY: Number(finalBounds.min[1].toFixed(5)),
      centreX: Number(((finalBounds.min[0] + finalBounds.max[0]) / 2).toFixed(5)),
      centreZ: Number(((finalBounds.min[2] + finalBounds.max[2]) / 2).toFixed(5)),
    },
    materials: root.listMaterials().length,
    textures: root.listTextures().length,
    textureBytes: root
      .listTextures()
      .reduce((total, texture) => total + (texture.getImage()?.byteLength ?? 0), 0),
    renderVertices: root
      .listMeshes()
      .reduce(
        (total, mesh) =>
          total +
          mesh
            .listPrimitives()
            .reduce(
              (sub, primitive) =>
                sub +
                (primitive.getIndices()?.getCount() ??
                  primitive.getAttribute('POSITION')?.getCount() ??
                  0),
              0
            ),
        0
      ),
    joints: root.listSkins()[0]?.listJoints().length ?? 0,
    outputBytes: (await stat(output)).size,
  };
}

async function main() {
  const reportPath = path.join(REPORT_ROOT, 'normalization.json');
  const selected = ONLY
    ? GENERATED_ASSETS.filter((spec) => ONLY.includes(spec.id))
    : GENERATED_ASSETS;
  if (ONLY) {
    // A typo in `--only=` that silently normalizes nothing, prints a cheerful
    // summary and leaves the old derivative in place is the exact failure this
    // whole flag is supposed to make safe.
    const unknown = ONLY.filter((id) => !GENERATED_ASSETS.some((spec) => spec.id === id));
    if (unknown.length > 0) {
      throw new Error(
        `--only= names ${unknown.join(', ')}, which is not in GENERATED_ASSETS. ` +
          `Known ids: ${GENERATED_ASSETS.map((spec) => spec.id).join(', ')}`
      );
    }
  }

  for (const asset of Object.values(paths)) {
    await mkdir(path.dirname(asset.output), { recursive: true });
    await preserveSource(asset.source, asset.output);
  }

  if (DRY_RUN) {
    console.log(
      'Autonomous equipment sources are preserved. Run without --dry-run to create runtime derivatives.'
    );
    return;
  }

  const io = await createIO();
  // A filtered run leaves the forklift and the untouched generated
  // assets exactly as they were, so their rows have to come
  // from the report on disk rather than from a normalization that did not run.
  const previous = ONLY ? JSON.parse(await readFile(reportPath, 'utf8')) : null;
  if (ONLY && !Array.isArray(previous?.generated)) {
    throw new Error(
      `--only= needs an existing ${reportPath} to merge into. Run a full ` +
        '`npm run normalize-models` once first.'
    );
  }
  const results = ONLY
    ? { ...previous, generatedAt: new Date().toISOString(), partialRun: ONLY }
    : {
        generatedAt: new Date().toISOString(),
        sourcePolicy: 'immutable',
        forklift: await normalizeForklift(io, paths.forklift.source, paths.forklift.output),
        silo: {
          action: 'quarantined',
          reason:
            'The source is a 0.42 metre detail tank with a missing external texture, not a production silo.',
        },
        generated: [],
      };

  // Keyed, not appended: a filtered run REPLACES the row for the asset it
  // rebuilt and leaves every other row exactly as the last full run wrote it.
  const generatedById = new Map(results.generated.map((entry) => [entry.id, entry]));

  for (const spec of selected) {
    const { source, output } = generatedAssetPaths(spec);
    await mkdir(path.dirname(output), { recursive: true });
    const result = await normalizeGeneratedAsset(io, spec);
    result.sourceSha256 = await sha256(source);
    result.outputSha256 = await sha256(output);
    generatedById.set(result.id, result);
    console.log(
      `${spec.id.padEnd(22)} scale ${String(result.scaleFactor).padStart(9)}  ` +
        `${result.bounds.width} x ${result.bounds.height} x ${result.bounds.length} m  ` +
        `${Math.round(result.outputBytes / 1024)} KB`
    );
  }
  // Table order, so the report does not reshuffle itself on a filtered run.
  results.generated = GENERATED_ASSETS.map((spec) => generatedById.get(spec.id)).filter(Boolean);

  if (!ONLY) {
    await rm(paths.silo.output, { force: true });
  }
  await mkdir(REPORT_ROOT, { recursive: true });
  if (!ONLY) {
    for (const [id, asset] of Object.entries(paths)) {
      results[id].sourceSha256 = await sha256(asset.source);
      if (id !== 'silo') {
        results[id].outputSha256 = await sha256(asset.output);
        results[id].outputBytes = (await stat(asset.output)).size;
      }
    }
  }

  await writeFile(reportPath, `${JSON.stringify(results, null, 2)}\n`);
  console.log(
    ONLY
      ? `Normalized ${selected.length} of ${GENERATED_ASSETS.length} generated assets ` +
          `(${ONLY.join(', ')}); the rest of the report is carried forward. Report: ${reportPath}`
      : `Normalized forklift and ${GENERATED_ASSETS.length} generated assets. Report: ${reportPath}`
  );
}

// Only normalize when run as a command. This module also exports
// GENERATED_ASSETS for the provenance writer, and an import that rewrote every
// GLB as a side effect would be a trap - not least because a normalization pass
// rewrites `public/models/forklift/forklift.glb` by 4 bytes of unrelated drift.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  });
}
