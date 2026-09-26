import console from 'node:console';
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
const isCommand = Boolean(
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
);
const cliArguments = isCommand ? process.argv.slice(2) : [];
const DRY_RUN = cliArguments.includes('--dry-run');
// Reject unknown flags before any derivative is written. Working if a help
// probe or misspelled selector cannot accidentally trigger a full rebuild.
// Importers own their flags. Working if scoped provenance can import the spec
// table while an invalid normalizer command still fails before any write.
const unknownArguments = cliArguments.filter(
  (argument) => argument !== '--dry-run' && !argument.startsWith('--only=')
);
if (unknownArguments.length)
  throw new Error(`Unsupported arguments: ${unknownArguments.join(', ')}`);

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
  const flag = cliArguments.find((argument) => argument.startsWith('--only='));
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

/**
 * Index bitwise-identical vertices without simplifying the authored surface.
 * Normals, UVs, colours, skin weights and morph targets all participate in the
 * weld. Working if expanding the resulting indices reproduces every original
 * corner attribute, and only accessors with no consumer are discarded.
 */
export function indexGeneratedGeometry(document) {
  const root = document.getRoot();
  for (const mesh of root.listMeshes()) {
    for (const primitive of mesh.listPrimitives()) weldPrimitive(primitive);
  }
  for (const accessor of root.listAccessors()) {
    if (accessor.listParents().every((parent) => parent === root)) accessor.dispose();
  }
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
    id: 'world-park-trunk-unit',
    slug: 'park-trunk-unit',
    area: 'world',
    target: 3,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'park-trunk-unit-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Authored palette, corner normals and shadow flags restored with Tripo normal/roughness. Source nondegenerate triangle shape retained. Runtime material layers, original maps, transforms and dynamic nodes remain live.',
    surface: {
      normalScale: 0.2,
      doubleSided: false,
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: 'c93c94ab-6e7a-46ef-880a-f6bbcbc3ce7f',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-park-canopy-zero-unit',
    slug: 'park-canopy-zero-unit',
    area: 'world',
    target: 3.9584999084472656,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'park-canopy-zero-unit-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Authored palette, corner normals and shadow flags restored with Tripo normal/roughness. 16 provider-omitted exact reverse leaf faces restored from their retained counterparts; original alpha maps and wind remain live. Runtime material layers, original maps, transforms and dynamic nodes remain live.',
    surface: {
      normalScale: 0.2,
      doubleSided: false,
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: 'ccbc16b5-290c-4012-a0f0-bc82010e3d8c',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-park-canopy-one-unit',
    slug: 'park-canopy-one-unit',
    area: 'world',
    target: 4.567499876022339,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'park-canopy-one-unit-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Authored palette, corner normals and shadow flags restored with Tripo normal/roughness. 16 provider-omitted exact reverse leaf faces restored from their retained counterparts; original alpha maps and wind remain live. Runtime material layers, original maps, transforms and dynamic nodes remain live.',
    surface: {
      normalScale: 0.2,
      doubleSided: false,
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: '97831f23-7046-453d-b555-b65a49ca575f',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-park-canopy-two-unit',
    slug: 'park-canopy-two-unit',
    area: 'world',
    target: 3.6540002822875977,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'park-canopy-two-unit-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Authored palette, corner normals and shadow flags restored with Tripo normal/roughness. 16 provider-omitted exact reverse leaf faces restored from their retained counterparts; original alpha maps and wind remain live. Runtime material layers, original maps, transforms and dynamic nodes remain live.',
    surface: {
      normalScale: 0.2,
      doubleSided: false,
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: '08ed547e-207e-47d4-a2d3-e4f0aad2c3fc',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-oak-trunk-unit',
    slug: 'oak-trunk-unit',
    area: 'world',
    target: 2.599999856948852,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'oak-trunk-unit-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Authored palette, corner normals and shadow flags restored with Tripo normal/roughness. Source nondegenerate triangle shape retained. Runtime material layers, original maps, transforms and dynamic nodes remain live.',
    surface: {
      normalScale: 0.2,
      doubleSided: false,
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: '7d22c234-01d6-42ae-aed9-4ac9fe6c4c14',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-oak-canopy-unit',
    slug: 'oak-canopy-unit',
    area: 'world',
    target: 3.1464998722076416,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'oak-canopy-unit-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Authored palette, corner normals and shadow flags restored with Tripo normal/roughness. 16 provider-omitted exact reverse leaf faces restored from their retained counterparts; original alpha maps and wind remain live. Runtime material layers, original maps, transforms and dynamic nodes remain live.',
    surface: {
      normalScale: 0.2,
      doubleSided: false,
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: '4657c239-72d9-428d-89b4-aa896f3feb0e',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-birch-trunk-unit',
    slug: 'birch-trunk-unit',
    area: 'world',
    target: 3.099999856948852,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'birch-trunk-unit-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Authored palette, corner normals and shadow flags restored with Tripo normal/roughness. Source nondegenerate triangle shape retained. Runtime material layers, original maps, transforms and dynamic nodes remain live.',
    surface: {
      normalScale: 0.2,
      doubleSided: false,
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: 'bc27f22c-8486-49c4-8d15-7e4b4e4e7293',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-birch-canopy-unit',
    slug: 'birch-canopy-unit',
    area: 'world',
    target: 3.044999837875366,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'birch-canopy-unit-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Authored palette, corner normals and shadow flags restored with Tripo normal/roughness. 16 provider-omitted exact reverse leaf faces restored from their retained counterparts; original alpha maps and wind remain live. Runtime material layers, original maps, transforms and dynamic nodes remain live.',
    surface: {
      normalScale: 0.2,
      doubleSided: false,
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: '9b8492c2-fa6a-4c94-82f7-630eda3c5ebe',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-pine-trunk-unit',
    slug: 'pine-trunk-unit',
    area: 'world',
    target: 3,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'pine-trunk-unit-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Authored palette, corner normals and shadow flags restored with Tripo normal/roughness. Source nondegenerate triangle shape retained. Runtime material layers, original maps, transforms and dynamic nodes remain live.',
    surface: {
      normalScale: 0.2,
      doubleSided: false,
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: '48039a71-d4ec-4d57-96eb-e7b666d38ecd',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-pine-canopy-unit',
    slug: 'pine-canopy-unit',
    area: 'world',
    target: 3.85699999332428,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'pine-canopy-unit-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Authored palette, corner normals and shadow flags restored with Tripo normal/roughness. 16 provider-omitted exact reverse leaf faces restored from their retained counterparts; original alpha maps and wind remain live. Runtime material layers, original maps, transforms and dynamic nodes remain live.',
    surface: {
      normalScale: 0.2,
      doubleSided: false,
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: '7591025d-0b0b-475a-acfc-bfc8f2ae4405',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-flour-sack-unit',
    slug: 'flour-sack-unit',
    area: 'world',
    target: 0.3,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'flour-sack-unit-pillow-profile.glb',
    preparationScript: 'scripts/refine-flour-sack-geometry.mjs',
    preparationMethod:
      'The same 84 authored triangles reshaped to the current lay-flat sack and smooth corner normals. Existing Tripo atlas UVs, texture bytes, palette and shadow flags retained by exact triangle correspondence. Runtime attachment still verifies the current authored topology.',
    surface: {
      normalScale: 0.2,
      doubleSided: false,
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: 'dfd9d32d-8a4b-4082-9ae5-9aec7613751c',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-spouting-flange-unit',
    slug: 'spouting-flange-unit',
    area: 'world',
    target: 0.11999999731779099,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'spouting-flange-unit-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Authored palette, corner normals and shadow flags restored with Tripo normal/roughness. Source nondegenerate triangle shape retained. Runtime material layers, original maps, transforms and dynamic nodes remain live.',
    surface: {
      normalScale: 0.2,
      doubleSided: false,
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: 'c86528c0-2f19-4864-8a8d-90743cedd09e',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-spouting-column-unit',
    slug: 'spouting-column-unit',
    area: 'world',
    target: 1,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'spouting-column-unit-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Authored palette, corner normals and shadow flags restored with Tripo normal/roughness. Source nondegenerate triangle shape retained. Runtime material layers, original maps, transforms and dynamic nodes remain live.',
    surface: {
      normalScale: 0.2,
      doubleSided: false,
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: '64e0c620-1010-4748-9e4f-52cb8308b5d6',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-spouting-crossbeam-unit',
    slug: 'spouting-crossbeam-unit',
    area: 'world',
    target: 1,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'spouting-crossbeam-unit-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Authored palette, corner normals and shadow flags restored with Tripo normal/roughness. Source nondegenerate triangle shape retained. Runtime material layers, original maps, transforms and dynamic nodes remain live.',
    surface: {
      normalScale: 0.2,
      doubleSided: false,
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: 'f2bc9f2c-c8d6-4c53-bd48-ad10268bdaea',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-forklift-chassis-unit',
    slug: 'forklift-chassis-unit',
    area: 'world',
    target: 0.808435320854187,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'forklift-chassis-unit-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Authored palette, corner normals and shadow flags restored with Tripo normal/roughness. Twelve identical coincident source faces and two zero-area faces omitted; licensed original GLB and dynamic rig unchanged. Runtime material layers, original maps, transforms and dynamic nodes remain live.',
    surface: {
      normalScale: 0.2,
      doubleSided: false,
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: '6a0e7b0b-abc6-4427-9f40-fec5db5ce723',
    retrievedAt: '2026-09-08',
    sourcePage: 'https://sketchfab.com/3d-models/forklift-d40cae50e04145dd997cdca415cd72ad',
    license: 'CC-BY-4.0 geometry; Tripo3D API-plan normal/roughness output',
    attribution: 'Forklift by Mantas Stankaitis; chassis normal/roughness treatment by Tripo3D',
  },
  {
    id: 'world-truck-cab-unit',
    slug: 'truck-cab-unit',
    area: 'world',
    target: 1,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'truck-cab-unit-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Authored palette, corner normals and shadow flags restored with Tripo normal/roughness. Source nondegenerate triangle shape retained. Runtime material layers, original maps, transforms and dynamic nodes remain live.',
    surface: {
      normalScale: 0.2,
      doubleSided: false,
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: '303f80a8-e3ca-47fc-81fb-43111d33082c',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-truck-trailer-unit',
    slug: 'truck-trailer-unit',
    area: 'world',
    target: 1,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'truck-trailer-unit-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Authored palette, corner normals and shadow flags restored with Tripo normal/roughness. Source nondegenerate triangle shape retained. Runtime material layers, original maps, transforms and dynamic nodes remain live.',
    surface: {
      normalScale: 0.2,
      doubleSided: false,
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: '2cdaee51-449f-4e49-b8b0-f27f51756d2c',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-truck-tyre-unit',
    slug: 'truck-tyre-unit',
    area: 'world',
    target: 0.3799999952316284,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'truck-tyre-unit-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Authored palette, corner normals and shadow flags restored with Tripo normal/roughness. Source nondegenerate triangle shape retained. Runtime material layers, original maps, transforms and dynamic nodes remain live.',
    surface: {
      // The near-flat atlas needs this strength to survive black rubber shading.
      // Working if the on/off control changes tyre pixels with the authored tread retained.
      normalScale: 2,
      doubleSided: false,
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: '75a87ad9-0e6a-4293-98a9-922fb32dbe9f',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-victorian-portal-unit',
    slug: 'victorian-portal-unit',
    area: 'world',
    target: 10,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'victorian-portal-unit-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Authored palette, corner normals and shadow flags restored with Tripo normal/roughness. Source nondegenerate triangle shape retained. Runtime material layers, original maps, transforms and dynamic nodes remain live.',
    surface: {
      normalScale: 0.2,
      doubleSided: false,
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: '248509a1-22fe-46c2-9320-2a32bdbdc8eb',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-industrial-portal-unit',
    slug: 'industrial-portal-unit',
    area: 'world',
    target: 1,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'industrial-portal-unit-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Authored palette, corner normals and shadow flags restored with Tripo normal/roughness. Source nondegenerate triangle shape retained. Runtime material layers, original maps, transforms and dynamic nodes remain live.',
    surface: {
      normalScale: 0.2,
      doubleSided: false,
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: '4e065cdb-2c72-4dd6-a73c-4f67424607c8',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-drainage-pipe-unit',
    slug: 'drainage-pipe-unit',
    area: 'world',
    target: 1,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'drainage-pipe-unit-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Authored palette, corner normals and shadow flags restored with Tripo normal/roughness. Source nondegenerate triangle shape retained. Runtime material layers, original maps, transforms and dynamic nodes remain live.',
    surface: {
      normalScale: 0.2,
      doubleSided: false,
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: 'ce2a3f04-29c6-4bea-bf7e-7933ed125399',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-fence-post-unit',
    slug: 'fence-post-unit',
    area: 'world',
    target: 2.4000000953674316,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'fence-post-unit-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact source triangles, palette, corner normals and per-part shadow flags retained with Tripo normal/roughness; dynamic nodes, glass, light faces and text remain live.',
    surface: {
      normalScale: 0.2,
      doubleSided: false,
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: 'e4268da4-994c-4e1b-a12e-741219444e1e',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-fence-rail-unit',
    slug: 'fence-rail-unit',
    area: 'world',
    target: 0.1100001335144043,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'fence-rail-unit-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact source triangles, palette, corner normals and per-part shadow flags retained with Tripo normal/roughness; dynamic nodes, glass, light faces and text remain live.',
    surface: {
      normalScale: 0.2,
      doubleSided: false,
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: 'ee98f62b-5fd9-48f1-90d5-a4b18f4fcb79',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-hedge-unit',
    slug: 'hedge-unit',
    area: 'world',
    target: 0.6000000238418579,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'hedge-unit-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact source triangles, palette, corner normals and per-part shadow flags retained with Tripo normal/roughness; dynamic nodes, glass, light faces and text remain live.',
    surface: {
      normalScale: 0.2,
      doubleSided: false,
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: '5e187fbc-55ca-423f-9e85-919a39ac5fa4',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-bridge-housing-unit',
    slug: 'bridge-housing-unit',
    area: 'world',
    target: 1.5000000000000009,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'bridge-housing-unit-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact source triangles, palette, corner normals and per-part shadow flags retained with Tripo normal/roughness; dynamic nodes, glass, light faces and text remain live.',
    surface: {
      normalScale: 0.2,
      doubleSided: false,
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: '1323b84e-2759-4120-8998-dd1a7fcb4e8f',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-bridge-support-unit',
    slug: 'bridge-support-unit',
    area: 'world',
    target: 0.5000000000000003,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'bridge-support-unit-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact source triangles, palette, corner normals and per-part shadow flags retained with Tripo normal/roughness; dynamic nodes, glass, light faces and text remain live.',
    surface: {
      normalScale: 0.2,
      doubleSided: false,
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: '0e6a4e56-f769-4677-8e48-4284857e815d',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-factory-steel-unit',
    slug: 'factory-steel-unit',
    area: 'world',
    target: 1,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'factory-steel-unit-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact source triangles, palette, corner normals and per-part shadow flags retained with Tripo normal/roughness; dynamic nodes, glass, light faces and text remain live.',
    surface: {
      normalScale: 0.2,
      doubleSided: false,
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: '1fbce930-0b8b-4eb9-93e7-ccca999ddde2',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-factory-concrete-unit',
    slug: 'factory-concrete-unit',
    area: 'world',
    target: 1,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'factory-concrete-unit-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact source triangles, palette, corner normals and per-part shadow flags retained with Tripo normal/roughness; dynamic nodes, glass, light faces and text remain live.',
    surface: {
      normalScale: 0.2,
      doubleSided: false,
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: '6d75e421-4a3f-47b6-8e2f-6833a4aa243e',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-city-masonry-unit',
    slug: 'city-masonry-unit',
    area: 'world',
    target: 1,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'city-masonry-unit-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact source triangles, palette, corner normals and per-part shadow flags retained with Tripo normal/roughness; dynamic nodes, glass, light faces and text remain live.',
    surface: {
      normalScale: 0.2,
      doubleSided: false,
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: 'e31e84f0-491a-4307-a6d4-9f57844112ec',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-station-sign-pole-unit',
    slug: 'station-sign-pole-unit',
    area: 'world',
    target: 8,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'station-sign-pole-unit-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact source triangles, palette, corner normals and per-part shadow flags retained with Tripo normal/roughness; dynamic nodes, glass, light faces and text remain live.',
    surface: {
      normalScale: 0.2,
      doubleSided: false,
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: '604093d6-6e12-447c-9944-20dbc86b2be5',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-station-sign-cabinet-unit',
    slug: 'station-sign-cabinet-unit',
    area: 'world',
    target: 5,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'station-sign-cabinet-unit-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact source triangles, palette, corner normals and per-part shadow flags retained with Tripo normal/roughness; dynamic nodes, glass, light faces and text remain live.',
    surface: {
      normalScale: 0.2,
      doubleSided: false,
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: '732b68f6-e7fc-4c2c-a86e-67191265d2c4',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-station-wall-unit',
    slug: 'station-wall-unit',
    area: 'world',
    target: 5,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'station-wall-unit-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact source triangles, palette, corner normals and per-part shadow flags retained with Tripo normal/roughness; dynamic nodes, glass, light faces and text remain live.',
    surface: {
      normalScale: 0.2,
      doubleSided: false,
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: '294bac36-35e3-4256-a662-d7436d0a0373',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-station-roof-unit',
    slug: 'station-roof-unit',
    area: 'world',
    target: 0.5,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'station-roof-unit-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact source triangles, palette, corner normals and per-part shadow flags retained with Tripo normal/roughness; dynamic nodes, glass, light faces and text remain live.',
    surface: {
      normalScale: 0.2,
      doubleSided: false,
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: '941d53f1-455a-40b1-bf26-5293d2edf123',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-machine-silo-unit',
    slug: 'machine-silo-unit',
    area: 'world',
    target: 0.9999999999999999,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'machine-silo-unit-shallow-profile.glb',
    preparationScript: 'scripts/refine-silo-geometry.mjs',
    preparationMethod:
      'Local shallow-corrugation remap to the current authored shell; all 10304 retained atlas triangles, UVs, palette, textures and indices preserved. Original 64 zero-area pole faces remain omitted.',
    surface: {
      normalScale: 0.2,
      doubleSided: false,
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
      'Local topology-preserving shallow corrugation',
    ],
    taskId: '280f46bc-2bac-47f2-b100-219afb3547a0',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-machine-mill-unit',
    slug: 'machine-mill-unit',
    area: 'world',
    target: 1.0000000507273592,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'machine-mill-unit-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Authored same-topology cast-shoulder remap in CompactMachines.tsx, with preserved Tripo atlas, normal/roughness textures, palette and shadow flags. Live fittings follow the reshaped service face.',
    surface: {
      normalScale: 0.2,
      doubleSided: false,
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
      'Local authored cast-shoulder geometry refinement',
    ],
    taskId: '18781120-5ebf-4edd-9e4d-f554c828b60a',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-machine-sifter-unit',
    slug: 'machine-sifter-unit',
    area: 'world',
    target: 1.0000001423394544,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'machine-sifter-unit-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact source triangles, palette, corner normals and per-part shadow flags retained with Tripo normal/roughness; dynamic nodes, glass, light faces and text remain live.',
    surface: {
      normalScale: 0.2,
      doubleSided: false,
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: '43e061f5-127a-495f-8aae-41917f7b0691',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-machine-packer-unit',
    slug: 'machine-packer-unit',
    area: 'world',
    target: 1,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'machine-packer-unit-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact source triangles, palette, corner normals and per-part shadow flags retained with Tripo normal/roughness; dynamic nodes, glass, light faces and text remain live.',
    surface: {
      normalScale: 0.2,
      doubleSided: false,
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: 'dad65541-98a6-499e-bbde-9ff528883960',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-dock-leveler-plate',
    slug: 'dock-leveler-plate',
    area: 'world',
    target: 0.15000000596046448,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'dock-leveler-plate-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact source triangles, palette, corner normals and per-part shadow flags retained with Tripo normal/roughness; dynamic nodes, glass, light faces and text remain live.',
    surface: {
      normalScale: 0.2,
      doubleSided: false,
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: '7c2af21c-6eca-4aee-9602-bd592e1cde3b',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-dock-leveler-lip',
    slug: 'dock-leveler-lip',
    area: 'world',
    target: 0.10000000521540642,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'dock-leveler-lip-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact source triangles, palette, corner normals and per-part shadow flags retained with Tripo normal/roughness; dynamic nodes, glass, light faces and text remain live.',
    surface: {
      normalScale: 0.2,
      doubleSided: false,
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: '0a8f3d79-d06a-421e-b10c-f66a7f4a4ea1',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-dock-door-panel',
    slug: 'dock-door-panel',
    area: 'world',
    target: 4,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'dock-door-panel-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact source triangles, palette, corner normals and per-part shadow flags retained with Tripo normal/roughness; dynamic nodes, glass, light faces and text remain live.',
    surface: {
      normalScale: 0.2,
      doubleSided: false,
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: 'b15ff01b-07b7-46d7-b03a-5121d40c4fa5',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-dock-door-frame',
    slug: 'dock-door-frame',
    area: 'world',
    target: 5.25,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'dock-door-frame-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact source triangles, palette, corner normals and per-part shadow flags retained with Tripo normal/roughness; dynamic nodes, glass, light faces and text remain live.',
    surface: {
      normalScale: 0.2,
      doubleSided: false,
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: 'c48a6490-0b77-4835-a582-440c8108826a',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-dock-shelter-side',
    slug: 'dock-shelter-side',
    area: 'world',
    target: 3.5,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'dock-shelter-side-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact source triangles, palette, corner normals and per-part shadow flags retained with Tripo normal/roughness; dynamic nodes, glass, light faces and text remain live.',
    surface: {
      normalScale: 0.2,
      doubleSided: false,
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: 'b31aec1f-2344-4ebc-a5ee-d34fb4213cd4',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-dock-shelter-top',
    slug: 'dock-shelter-top',
    area: 'world',
    target: 0.2999999523162842,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'dock-shelter-top-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact source triangles, palette, corner normals and per-part shadow flags retained with Tripo normal/roughness; dynamic nodes, glass, light faces and text remain live.',
    surface: {
      normalScale: 0.2,
      doubleSided: false,
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: '04b72e04-e281-4cee-a0cf-35e5ba9bd755',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-dock-shelter-frame',
    slug: 'dock-shelter-frame',
    area: 'world',
    target: 4.099999904632568,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'dock-shelter-frame-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact source triangles, palette, corner normals and per-part shadow flags retained with Tripo normal/roughness; dynamic nodes, glass, light faces and text remain live.',
    surface: {
      normalScale: 0.2,
      doubleSided: false,
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: '49704b73-65d1-4347-9fb1-ce37d4bd58b2',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-pallet-staging-body',
    slug: 'pallet-staging-body',
    area: 'world',
    target: 0.8949999790638685,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'pallet-staging-body-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact source triangles, palette, corner normals and per-part shadow flags retained with Tripo normal/roughness; dynamic nodes, glass, light faces and text remain live.',
    surface: {
      normalScale: 0.2,
      doubleSided: false,
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: '6d57f23e-2345-4443-a6a3-abe44cfd274d',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-wheel-chock-body',
    slug: 'wheel-chock-body',
    area: 'world',
    target: 0.2750000041723252,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'wheel-chock-body-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact source triangles, palette, corner normals and per-part shadow flags retained with Tripo normal/roughness; dynamic nodes, glass, light faces and text remain live.',
    surface: {
      normalScale: 0.2,
      doubleSided: false,
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: '28445681-8a76-49bc-8d5b-ce4cbd243317',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-dock-bumper-rubber',
    slug: 'dock-bumper-rubber',
    area: 'world',
    target: 0.4000000059604645,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'dock-bumper-rubber-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact source triangles, palette, corner normals and per-part shadow flags retained with Tripo normal/roughness; dynamic nodes, glass, light faces and text remain live.',
    surface: {
      normalScale: 0.2,
      doubleSided: false,
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: 'c9b0922f-9e4a-499f-9126-3cb2e4b3c837',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-cupid-authored-body',
    slug: 'cupid-authored-body',
    area: 'world',
    target: 2.330000028014183,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'cupid-authored-body-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact source triangles, palette, corner normals and per-part shadow flags retained with Tripo normal/roughness; dynamic nodes, glass, light faces and text remain live.',
    surface: {
      normalScale: 0.2,
      doubleSided: true,
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: 'cdfcffae-8363-4395-a402-9b59aeaaac6e',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-frog-authored-body',
    slug: 'frog-authored-body',
    area: 'world',
    target: 0.24999999813901513,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'frog-authored-body-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact source triangles, palette, corner normals and per-part shadow flags retained with Tripo normal/roughness; dynamic nodes, glass, light faces and text remain live.',
    surface: {
      normalScale: 0.2,
      doubleSided: false,
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: '388f9529-a67c-404e-b1ea-b3fe7e011936',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-yard-access-node-body',
    slug: 'yard-access-node-body',
    area: 'world',
    target: 1.0999999642372131,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'yard-access-node-body-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact source triangles, palette, corner normals and per-part shadow flags retained with Tripo normal/roughness; dynamic nodes, glass, light faces and text remain live.',
    surface: { doubleSided: false, normalScale: 0.2 },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: '4272c639-c53a-45e9-b625-0ecfef614b81',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-yard-air-hose-body',
    slug: 'yard-air-hose-body',
    area: 'world',
    target: 3.325000047683716,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'yard-air-hose-body-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact source triangles, palette, corner normals and per-part shadow flags retained with Tripo normal/roughness; dynamic nodes, glass, light faces and text remain live.',
    surface: { doubleSided: false, normalScale: 0.2 },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: '96b6b089-f51a-4715-a03b-aa6d6a84e752',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-yard-bumper-body',
    slug: 'yard-bumper-body',
    area: 'world',
    target: 0.5,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'yard-bumper-body-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact source triangles, palette, corner normals and per-part shadow flags retained with Tripo normal/roughness; dynamic nodes, glass, light faces and text remain live.',
    surface: { doubleSided: false, normalScale: 0.2 },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: 'e9e1c5e4-72ad-47e2-bafe-9e561eea834d',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-yard-compactor-body',
    slug: 'yard-compactor-body',
    area: 'world',
    target: 2.650000143051148,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'yard-compactor-body-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact source triangles, palette, corner normals and per-part shadow flags retained with Tripo normal/roughness; dynamic nodes, glass, light faces and text remain live.',
    surface: { doubleSided: false, normalScale: 0.2 },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: 'f78c30a6-28de-419e-b3ca-c52eda775ac1',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-yard-crane-body',
    slug: 'yard-crane-body',
    area: 'world',
    target: 0.9500000178813934,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'yard-crane-body-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact source triangles, palette, corner normals and per-part shadow flags retained with Tripo normal/roughness; dynamic nodes, glass, light faces and text remain live.',
    surface: { doubleSided: false, normalScale: 0.2 },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: 'd21e7b3b-f29e-4bd9-b8fa-63e7c3f50783',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-yard-dock-plate-body',
    slug: 'yard-dock-plate-body',
    area: 'world',
    target: 0.15000000409781933,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'yard-dock-plate-body-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact source triangles, palette, corner normals and per-part shadow flags retained with Tripo normal/roughness; dynamic nodes, glass, light faces and text remain live.',
    surface: { doubleSided: false, normalScale: 0.2 },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: 'cc8d3fa9-75fc-4bea-a6c2-95312ffdaf9c',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-yard-dumpster-body',
    slug: 'yard-dumpster-body',
    area: 'world',
    target: 2.6072733461856843,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'yard-dumpster-body-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact source triangles, palette, corner normals and per-part shadow flags retained with Tripo normal/roughness; dynamic nodes, glass, light faces and text remain live.',
    surface: { doubleSided: false, normalScale: 0.2 },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: '2abc993f-f425-41f8-bf8f-834e33d41002',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-yard-extinguisher-body',
    slug: 'yard-extinguisher-body',
    area: 'world',
    target: 1.024999976158142,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'yard-extinguisher-body-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact source triangles, palette, corner normals and per-part shadow flags retained with Tripo normal/roughness; dynamic nodes, glass, light faces and text remain live.',
    surface: { doubleSided: false, normalScale: 0.2 },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: '3b0a180a-62c8-49c6-ba2c-d42420f13d51',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-yard-fuel-island-body',
    slug: 'yard-fuel-island-body',
    area: 'world',
    target: 6.250000005960464,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'yard-fuel-island-body-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact source triangles, palette, corner normals and per-part shadow flags retained with Tripo normal/roughness; dynamic nodes, glass, light faces and text remain live.',
    surface: { doubleSided: false, normalScale: 0.2 },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: '36d6cd78-3ed8-480b-8ab8-a77a50cdc10d',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-yard-guard-shack-body',
    slug: 'yard-guard-shack-body',
    area: 'world',
    target: 3.0999999046325684,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'yard-guard-shack-body-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact source triangles, palette, corner normals and per-part shadow flags retained with Tripo normal/roughness; dynamic nodes, glass, light faces and text remain live.',
    surface: { doubleSided: false, normalScale: 0.2 },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: 'b2054150-5d2c-46aa-b9af-deebf12112b8',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-yard-intercom-body',
    slug: 'yard-intercom-body',
    area: 'world',
    target: 1.5499999523162842,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'yard-intercom-body-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact source triangles, palette, corner normals and per-part shadow flags retained with Tripo normal/roughness; dynamic nodes, glass, light faces and text remain live.',
    surface: { doubleSided: false, normalScale: 0.2 },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: 'f0e8fa90-3051-49c9-9d16-3f99247b2206',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-yard-jockey-body',
    slug: 'yard-jockey-body',
    area: 'world',
    target: 2.099999910593033,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'yard-jockey-body-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact source triangles, palette, corner normals and per-part shadow flags retained with Tripo normal/roughness; dynamic nodes, glass, light faces and text remain live.',
    surface: { doubleSided: false, normalScale: 0.2 },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: '4b05b0a4-9e5a-4780-8b2a-a94f97cda731',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-yard-maintenance-body',
    slug: 'yard-maintenance-body',
    area: 'world',
    target: 8.090000182390213,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'yard-maintenance-body-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact source triangles, palette, corner normals and per-part shadow flags retained with Tripo normal/roughness; dynamic nodes, glass, light faces and text remain live.',
    surface: { doubleSided: false, normalScale: 0.2 },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: '80a3d61c-a89c-42c7-ba95-9cc3f26433e2',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-yard-manifest-body',
    slug: 'yard-manifest-body',
    area: 'world',
    target: 0.699999988079071,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'yard-manifest-body-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact source triangles, palette, corner normals and per-part shadow flags retained with Tripo normal/roughness; dynamic nodes, glass, light faces and text remain live.',
    surface: { doubleSided: false, normalScale: 0.2 },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: '931161b3-1679-4336-84bb-470c8d330472',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-yard-pallet-charger-body',
    slug: 'yard-pallet-charger-body',
    area: 'world',
    target: 1.5000000119209291,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'yard-pallet-charger-body-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact source triangles, palette, corner normals and per-part shadow flags retained with Tripo normal/roughness; dynamic nodes, glass, light faces and text remain live.',
    surface: { doubleSided: false, normalScale: 0.2 },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: 'bee7ab69-a97d-4a48-bc94-a7d42c2eae72',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-yard-safety-mirror-body',
    slug: 'yard-safety-mirror-body',
    area: 'world',
    target: 0.8999999761581421,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'yard-safety-mirror-body-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact source triangles, palette, corner normals and per-part shadow flags retained with Tripo normal/roughness; dynamic nodes, glass, light faces and text remain live.',
    surface: { doubleSided: false, normalScale: 0.2 },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: '1cf60bd5-d4b2-4fb7-b5b3-3ca818f48d68',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-yard-scale-kiosk-body',
    slug: 'yard-scale-kiosk-body',
    area: 'world',
    target: 1.9499999284744263,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'yard-scale-kiosk-body-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact source triangles, palette, corner normals and per-part shadow flags retained with Tripo normal/roughness; dynamic nodes, glass, light faces and text remain live.',
    surface: { doubleSided: false, normalScale: 0.2 },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: 'aca88291-568a-431b-bd5e-15e6a272ec2d',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-yard-stretch-wrap-body',
    slug: 'yard-stretch-wrap-body',
    area: 'world',
    target: 3.0000000007450582,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'yard-stretch-wrap-body-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact source triangles, palette, corner normals and per-part shadow flags retained with Tripo normal/roughness; dynamic nodes, glass, light faces and text remain live.',
    surface: { doubleSided: false, normalScale: 0.2 },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: 'c8555e16-69ac-407d-9dd6-5e793d54b62c',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-yard-telemetry-body',
    slug: 'yard-telemetry-body',
    area: 'world',
    target: 7.599999904632568,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'yard-telemetry-body-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact source triangles, palette, corner normals and per-part shadow flags retained with Tripo normal/roughness; dynamic nodes, glass, light faces and text remain live.',
    surface: { doubleSided: false, normalScale: 0.2 },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: '33fda9ee-9d89-4908-a9be-1d1d9500f399',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-yard-tire-inspection-body',
    slug: 'yard-tire-inspection-body',
    area: 'world',
    target: 2.599999952316285,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'yard-tire-inspection-body-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact source triangles, palette, corner normals and per-part shadow flags retained with Tripo normal/roughness; dynamic nodes, glass, light faces and text remain live.',
    surface: { doubleSided: false, normalScale: 0.2 },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: '118453ff-ad1f-4f45-8931-0c75e690a231',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-yard-truck-wash-body',
    slug: 'yard-truck-wash-body',
    area: 'world',
    target: 8.300000190734863,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'yard-truck-wash-body-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact source triangles, palette, corner normals and per-part shadow flags retained with Tripo normal/roughness; dynamic nodes, glass, light faces and text remain live.',
    surface: { doubleSided: false, normalScale: 0.2 },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: '8f88dab7-d01c-4545-9f10-f3d99a0f9e5d',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-yard-weight-scale-body',
    slug: 'yard-weight-scale-body',
    area: 'world',
    target: 3.274500332772732,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'yard-weight-scale-body-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact source triangles, palette, corner normals and per-part shadow flags retained with Tripo normal/roughness; dynamic nodes, glass, light faces and text remain live.',
    surface: { doubleSided: false, normalScale: 0.2 },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute and shadow restoration',
    ],
    taskId: '13e42070-6b9f-4a24-9b2e-ed0c78e4c4d3',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-grain-silo-large-shell',
    slug: 'grain-silo-large-shell',
    area: 'world',
    target: 39.79999923706055,
    axis: 'y',
    texture: 1024,
    yaw: 0,
    preparedSource: 'grain-silo-large-shell-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact source geometry, palette and corner normals retained with Tripo normal/roughness; utility seams split without changing ordered triangles; light faces remain runtime authored.',
    surface: {
      normalScale: 0.2,
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute restoration',
    ],
    taskId: 'fe4a2d0f-1cd2-4b79-a754-092c1e77a750',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-grain-silo-small-shell',
    slug: 'grain-silo-small-shell',
    area: 'world',
    target: 34,
    axis: 'y',
    texture: 1024,
    yaw: 0,
    preparedSource: 'grain-silo-small-shell-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact source geometry, palette and corner normals retained with Tripo normal/roughness; utility seams split without changing ordered triangles; light faces remain runtime authored.',
    surface: {
      normalScale: 0.2,
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute restoration',
    ],
    taskId: '4de88c97-a359-4830-a446-5bc554f6afab',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-grain-elevator-authored-body',
    slug: 'grain-elevator-authored-body',
    area: 'world',
    target: 57.19343423843384,
    axis: 'y',
    texture: 1024,
    yaw: 0,
    preparedSource: 'grain-elevator-authored-body-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact source geometry, palette and corner normals retained with Tripo normal/roughness; utility seams split without changing ordered triangles; light faces remain runtime authored.',
    surface: {
      normalScale: 0.2,
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute restoration',
    ],
    taskId: '2b2c04f8-bb47-48fc-b110-14bef61540c5',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-utility-fuel-shell',
    slug: 'utility-fuel-shell',
    area: 'world',
    target: 6,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'utility-fuel-shell-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact source geometry, palette and corner normals retained with Tripo normal/roughness; utility seams split without changing ordered triangles; light faces remain runtime authored.',
    surface: {
      metalness: 0.03,
      roughness: 0.64,
      normalScale: 0.2,
      emissive: [0.12882483009010298, 0.13964799929627628, 0.14103680247388187],
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute restoration',
    ],
    taskId: 'b59600a7-a20b-4705-8a68-ace4bdc9ca79',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-utility-process-shell',
    slug: 'utility-process-shell',
    area: 'world',
    target: 5,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'utility-process-shell-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact source geometry, palette and corner normals retained with Tripo normal/roughness; utility seams split without changing ordered triangles; light faces remain runtime authored.',
    surface: {
      metalness: 0.03,
      roughness: 0.64,
      normalScale: 0.2,
      emissive: [0.153898669461789, 0.15833203143932992, 0.152437181671171],
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute restoration',
    ],
    taskId: '145312ad-2484-4351-918a-bac8d85c1c14',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-propane-large-shell',
    slug: 'propane-large-shell',
    area: 'world',
    target: 8,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'propane-large-shell-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact source geometry, palette and corner normals retained with Tripo normal/roughness; utility seams split without changing ordered triangles; light faces remain runtime authored.',
    surface: {
      metalness: 0.03,
      roughness: 0.64,
      normalScale: 0.2,
      emissive: [0.15833203143932992, 0.1613284836069522, 0.15536829842119604],
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute restoration',
    ],
    taskId: 'abf80b98-583e-4333-b1b0-b78c30d1c456',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-propane-small-shell',
    slug: 'propane-small-shell',
    area: 'world',
    target: 6.3999998569488525,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'propane-small-shell-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact source geometry, palette and corner normals retained with Tripo normal/roughness; utility seams split without changing ordered triangles; light faces remain runtime authored.',
    surface: {
      metalness: 0.03,
      roughness: 0.64,
      normalScale: 0.2,
      emissive: [0.15833203143932992, 0.1613284836069522, 0.15536829842119604],
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute restoration',
    ],
    taskId: '7f9f5fd5-77d7-41be-91cf-d716cd16ef1b',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-wooden-bollard',
    slug: 'wooden-bollard',
    area: 'world',
    target: 0.800000011920929,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'wooden-bollard-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact source geometry, palette and corner normals retained with Tripo normal/roughness; utility seams split without changing ordered triangles; light faces remain runtime authored.',
    surface: {
      normalScale: 0.2,
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute restoration',
    ],
    taskId: '0287dced-4279-4fc2-b99e-4a632b9cecc9',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-metal-bollard',
    slug: 'metal-bollard',
    area: 'world',
    target: 0.800000011920929,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'metal-bollard-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact source geometry, palette and corner normals retained with Tripo normal/roughness; utility seams split without changing ordered triangles; light faces remain runtime authored.',
    surface: {
      normalScale: 0.2,
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute restoration',
    ],
    taskId: 'b6a3c11d-24b1-48c2-8dfe-5de5fc60de61',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-wooden-footbridge',
    slug: 'wooden-footbridge',
    area: 'world',
    target: 2.0499999761581424,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'wooden-footbridge-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact source geometry, palette and corner normals retained with Tripo normal/roughness; utility seams split without changing ordered triangles; light faces remain runtime authored.',
    surface: {
      normalScale: 0.2,
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute restoration',
    ],
    taskId: '646c4bb0-323c-4212-9244-3635ab389a2d',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-lock-gate-structure',
    slug: 'lock-gate-structure',
    area: 'world',
    target: 3.825000047683716,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'lock-gate-structure-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact source geometry, palette and corner normals retained with Tripo normal/roughness; utility seams split without changing ordered triangles; light faces remain runtime authored.',
    surface: {
      normalScale: 0.2,
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute restoration',
    ],
    taskId: '0365d3e4-80a5-4393-85af-9a735e5128b7',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-dock-canopy-structure',
    slug: 'dock-canopy-structure',
    area: 'world',
    target: 6.199999809265137,
    axis: 'y',
    texture: 512,
    yaw: 0,
    preparedSource: 'dock-canopy-structure-retained-lit-surfaces.glb',
    preparationScript: 'scripts/prepare-dock-canopy-surfaces.mjs',
    preparationMethod:
      'Exact source geometry, palette and corner normals retained with Tripo normal/roughness; utility seams split without changing ordered triangles; light faces remain runtime authored.',
    surface: {
      normalScale: 0.2,
    },
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute restoration',
    ],
    taskId: '3298deec-527b-44e6-baf1-96057d30ba27',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-station-counter',
    slug: 'station-counter',
    area: 'world',
    target: 1.0449999570846558,
    axis: 'y',
    texture: 256,
    yaw: 0,
    preparedSource: 'station-counter-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact authored geometry, source normals and linear vertex colours. Tripo normal and roughness maps retained.',
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute restoration',
    ],
    taskId: 'cd0777eb-5aef-41c3-963e-c027bd351897',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-station-register',
    slug: 'station-register',
    area: 'world',
    target: 0.40000009536743164,
    axis: 'y',
    texture: 256,
    yaw: 0,
    preparedSource: 'station-register-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact authored geometry, source normals and linear vertex colours. Tripo normal and roughness maps retained.',
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute restoration',
    ],
    taskId: '5d342374-fbc7-4b9b-b602-febc8e924bc3',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-station-card-reader',
    slug: 'station-card-reader',
    area: 'world',
    target: 0.08000004291534424,
    axis: 'y',
    texture: 256,
    yaw: 0,
    preparedSource: 'station-card-reader-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact authored geometry, source normals and linear vertex colours. Tripo normal and roughness maps retained.',
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute restoration',
    ],
    taskId: '11a724d4-7449-4e3e-ac0c-fcde52a9eec8',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-station-shelving',
    slug: 'station-shelving',
    area: 'world',
    target: 4,
    axis: 'y',
    texture: 256,
    yaw: 0,
    preparedSource: 'station-shelving-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact authored geometry, source normals and linear vertex colours. Tripo normal and roughness maps retained.',
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute restoration',
    ],
    taskId: '61236a73-25c7-4700-884b-becb7b973e79',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-station-drinks-cabinet',
    slug: 'station-drinks-cabinet',
    area: 'world',
    target: 3,
    axis: 'y',
    texture: 256,
    yaw: 0,
    preparedSource: 'station-drinks-cabinet-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact authored geometry, source normals and linear vertex colours. Tripo normal and roughness maps retained.',
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute restoration',
    ],
    taskId: '4b5c1e09-7c9f-4c57-b3d8-8c7ea97fcc19',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-station-coffee-machine',
    slug: 'station-coffee-machine',
    area: 'world',
    target: 2.200000071525574,
    axis: 'y',
    texture: 256,
    yaw: 0,
    preparedSource: 'station-coffee-machine-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact authored geometry, source normals and linear vertex colours. Tripo normal and roughness maps retained.',
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute restoration',
    ],
    taskId: '0b021666-4d0d-4ee4-b531-70d50cefe535',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-station-slushie-machine',
    slug: 'station-slushie-machine',
    area: 'world',
    target: 1.799999928474426,
    axis: 'y',
    texture: 256,
    yaw: 0,
    preparedSource: 'station-slushie-machine-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact authored geometry, source normals and linear vertex colours. Tripo normal and roughness maps retained.',
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute restoration',
    ],
    taskId: '9691065b-2376-4a46-af3b-03036bd1c354',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-station-grill',
    slug: 'station-grill',
    area: 'world',
    target: 0.40000003576278687,
    axis: 'y',
    texture: 256,
    yaw: 0,
    preparedSource: 'station-grill-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact authored geometry, source normals and linear vertex colours. Tripo normal and roughness maps retained.',
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute restoration',
    ],
    taskId: 'c484d245-466a-47e3-b033-f3f54ec2e2c7',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-station-magazine-rack',
    slug: 'station-magazine-rack',
    area: 'world',
    target: 1.200000071525574,
    axis: 'y',
    texture: 256,
    yaw: 0,
    preparedSource: 'station-magazine-rack-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Exact authored geometry, source normals and linear vertex colours. Tripo normal and roughness maps retained.',
    pipeline: [
      'Blender authored atlas',
      'texture v3.0-20250812, pbr:true, bake:false',
      'Source attribute restoration',
    ],
    taskId: '10904636-678e-43e8-a34d-d0d728376d7e',
    retrievedAt: '2026-09-08',
  },
  {
    id: 'world-fuel-pump-shell',
    slug: 'fuel-pump-shell',
    area: 'world',
    target: 1.8,
    axis: 'y',
    texture: 256,
    yaw: Math.PI / 2,
    preparedSource: 'fuel-pump-shell-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Blender authored geometry; --vertex-colour transfers solid linear palette and hard-surface normals by exact triangle correspondence; Tripo normal and roughness maps retained.',
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
    preparedSource: 'station-canopy-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Blender authored geometry; --vertex-colour transfers solid linear palette and hard-surface normals by exact triangle correspondence; Tripo normal and roughness maps retained.',
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
    preparedSource: 'checkpoint-booth-authored-vertex-colour-tripo-finish.glb',
    preparationScript: 'scripts/restore-authored-asset-attributes.mjs',
    preparationMethod:
      'Blender authored geometry; --vertex-colour transfers solid linear palette and hard-surface normals by exact triangle correspondence; Tripo normal and roughness maps retained.',
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
  surface.setName(`${spec.slug}-surface`).setMetallicFactor(spec.surface?.metalness ?? 0);
  if (spec.surface?.roughness !== undefined) surface.setRoughnessFactor(spec.surface.roughness);
  if (spec.surface?.normalScale !== undefined) surface.setNormalScale(spec.surface.normalScale);
  if (spec.surface?.doubleSided !== undefined) surface.setDoubleSided(spec.surface.doubleSided);
  if (spec.surface?.emissive) surface.setEmissiveFactor(spec.surface.emissive);

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

  indexGeneratedGeometry(document);
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
if (isCommand) {
  if (unknownArguments.length)
    throw new Error(`Unsupported arguments: ${unknownArguments.join(', ')}`);
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  });
}
