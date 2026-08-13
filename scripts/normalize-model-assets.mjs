import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import {
  getBounds,
  NodeIO,
  PropertyType,
  VERSION as GLTF_TRANSFORM_VERSION,
} from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { simplifyPrimitive, weldPrimitive } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import draco3d from 'draco3dgltf';
import * as THREE from 'three';

const ROOT = process.cwd();
const SOURCE_ROOT = path.join(ROOT, 'assets', 'source', 'models');
const OUTPUT_ROOT = path.join(ROOT, 'public', 'models');
const REPORT_ROOT = path.join(ROOT, 'test-results', 'assets');
const DRY_RUN = process.argv.includes('--dry-run');

const paths = {
  forklift: {
    source: path.join(SOURCE_ROOT, 'forklift', 'forklift-original.glb'),
    output: path.join(OUTPUT_ROOT, 'forklift', 'forklift.glb'),
  },
  worker: {
    source: path.join(SOURCE_ROOT, 'worker', 'worker-original.glb'),
    output: path.join(OUTPUT_ROOT, 'worker', 'worker.glb'),
  },
  workerMasculine: {
    source: path.join(SOURCE_ROOT, 'worker-quaternius', 'worker-masculine-source.gltf'),
    output: path.join(OUTPUT_ROOT, 'worker', 'worker-masculine.glb'),
  },
  workerFeminine: {
    source: path.join(SOURCE_ROOT, 'worker-quaternius', 'worker-feminine-source.gltf'),
    output: path.join(OUTPUT_ROOT, 'worker', 'worker-feminine.glb'),
  },
  silo: {
    source: path.join(SOURCE_ROOT, 'machines', 'silo-unity-original.glb'),
    output: path.join(OUTPUT_ROOT, 'machines', 'silo.glb'),
  },
};
const legacyWorkerTexture = {
  source: path.join(SOURCE_ROOT, 'worker', 'Textures', 'texture-a.png'),
  output: path.join(OUTPUT_ROOT, 'worker', 'Textures', 'texture-a.png'),
};
const workerClipDefinitions = [
  ['Idle', 'worker-idle'],
  ['Walk', 'worker-walk'],
  ['Run', 'worker-run'],
  ['Idle_Neutral', 'worker-break'],
  ['Interact', 'worker-inspect'],
  ['Interact', 'worker-repair'],
  ['Idle_Neutral', 'worker-supervise'],
  ['Wave', 'worker-radio'],
  ['Interact', 'worker-sample'],
];
const WORKER_TARGET_HEIGHT = 1.72;

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

function multiplyScale(node, factor) {
  const scale = node.getScale();
  node.setScale([scale[0] * factor, scale[1] * factor, scale[2] * factor]);
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
    seat: material('operator-seat', '#30383b', 0, 0.78),
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

function selectWorkerAnimation(document, sourceName, targetName) {
  const sourceAnimation = document
    .getRoot()
    .listAnimations()
    .find((animation) => animation.getName() === sourceName);
  if (!sourceAnimation) throw new Error(`Worker animation ${sourceName} is missing`);

  const targetAnimation = document.createAnimation(targetName);
  const samplerMap = new Map();
  for (const sourceSampler of sourceAnimation.listSamplers()) {
    const targetSampler = document
      .createAnimationSampler(`${targetName}-sampler`)
      .setInput(sourceSampler.getInput())
      .setOutput(sourceSampler.getOutput())
      .setInterpolation(sourceSampler.getInterpolation());
    samplerMap.set(sourceSampler, targetSampler);
    targetAnimation.addSampler(targetSampler);
  }

  for (const sourceChannel of sourceAnimation.listChannels()) {
    const targetSampler = samplerMap.get(sourceChannel.getSampler());
    const targetNode = sourceChannel.getTargetNode();
    const targetPath = sourceChannel.getTargetPath();
    if (!targetSampler || !targetNode || !targetPath) continue;
    const targetChannel = document
      .createAnimationChannel(`${targetName}-${targetNode.getName()}-${targetPath}`)
      .setTargetNode(targetNode)
      .setTargetPath(targetPath)
      .setSampler(targetSampler);
    targetAnimation.addChannel(targetChannel);
  }

  return targetAnimation;
}

async function normalizeAuthoredWorker(io, source, output, bodyType) {
  const document = await io.read(source);
  const root = document.getRoot();
  const scene = root.listScenes()[0];
  if (!scene) throw new Error(`${bodyType} worker source has no scene`);

  const sourceAnimations = [...root.listAnimations()];
  for (const [sourceName, targetName] of workerClipDefinitions) {
    selectWorkerAnimation(document, sourceName, targetName);
  }
  sourceAnimations.forEach((animation) => animation.dispose());

  const initialBounds = getBounds(scene);
  const initialHeight = initialBounds.max[1] - initialBounds.min[1];
  const scaleFactor = initialHeight > 0 ? WORKER_TARGET_HEIGHT / initialHeight : 1;
  scene.listChildren().forEach((node) => multiplyScale(node, scaleFactor));
  centreSceneBelow(document, scene);
  scene.setName(`MillOS_Worker_${bodyType}`);
  Object.assign(root.getAsset(), {
    generator: `MillOS v0.40 worker pipeline, glTF-Transform ${GLTF_TRANSFORM_VERSION}`,
    copyright: `Ultimate Modular ${bodyType === 'masculine' ? 'Men' : 'Women'} Worker by Quaternius, CC0 1.0`,
  });

  await writeBinaryGLB(io, output, document);
  return {
    bounds: getBounds(scene),
    materials: root.listMaterials().length,
    textures: root.listTextures().length,
    animations: root.listAnimations().map((animation) => animation.getName()),
  };
}

async function main() {
  for (const asset of Object.values(paths)) {
    await preserveSource(asset.source, asset.output);
  }
  await preserveSource(legacyWorkerTexture.source, legacyWorkerTexture.output);

  if (DRY_RUN) {
    console.log(
      'Source assets are preserved. Run without --dry-run to create runtime derivatives.'
    );
    return;
  }

  const io = await createIO();
  const results = {
    generatedAt: new Date().toISOString(),
    sourcePolicy: 'immutable',
    forklift: await normalizeForklift(io, paths.forklift.source, paths.forklift.output),
    worker: {
      action: 'compatibility-derivative-retained',
      reason:
        'The compact Kenney fallback has an independently validated Draco and two-clip contract. The historical source normalizer cannot reproduce that derivative exactly.',
    },
    workerMasculine: await normalizeAuthoredWorker(
      io,
      paths.workerMasculine.source,
      paths.workerMasculine.output,
      'masculine'
    ),
    workerFeminine: await normalizeAuthoredWorker(
      io,
      paths.workerFeminine.source,
      paths.workerFeminine.output,
      'feminine'
    ),
    silo: {
      action: 'quarantined',
      reason:
        'The source is a 0.42 metre detail tank with a missing external texture, not a production silo.',
    },
  };

  await rm(paths.silo.output, { force: true });
  await rm(path.join(OUTPUT_ROOT, 'worker', 'baseColor.jpg'), { force: true });
  await rm(legacyWorkerTexture.output, { force: true });
  await mkdir(REPORT_ROOT, { recursive: true });
  for (const [id, asset] of Object.entries(paths)) {
    results[id].sourceSha256 = await sha256(asset.source);
    if (id !== 'silo') {
      results[id].outputSha256 = await sha256(asset.output);
      results[id].outputBytes = (await stat(asset.output)).size;
    }
  }

  const reportPath = path.join(REPORT_ROOT, 'normalization.json');
  await writeFile(reportPath, `${JSON.stringify(results, null, 2)}\n`);
  console.log(`Normalized forklift and worker assets. Report: ${reportPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
