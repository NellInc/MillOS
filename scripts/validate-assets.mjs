import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { getBounds, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import draco3d from 'draco3dgltf';

const ROOT = process.cwd();
const MODELS_ROOT = path.join(ROOT, 'public', 'models');
const MANIFEST_PATH = path.join(MODELS_ROOT, 'asset-manifest.json');
const REPORT_PATH = path.join(ROOT, 'test-results', 'assets', 'validation.json');

async function collectFiles(directory, extension) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await collectFiles(absolute, extension)));
    } else if (entry.name.toLowerCase().endsWith(extension)) {
      found.push(absolute);
    }
  }
  return found;
}

function parseGLBJSON(bytes) {
  if (bytes.length < 20 || bytes.readUInt32LE(0) !== 0x46546c67) {
    throw new Error('Invalid GLB header');
  }
  if (bytes.readUInt32LE(4) !== 2) throw new Error('Only glTF 2.0 is supported');
  const jsonLength = bytes.readUInt32LE(12);
  const jsonType = bytes.readUInt32LE(16);
  if (jsonType !== 0x4e4f534a) throw new Error('GLB JSON chunk is missing');
  return JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength).trim());
}

function externalDependencies(json) {
  const uris = [
    ...(json.buffers ?? []).map((buffer) => buffer.uri),
    ...(json.images ?? []).map((image) => image.uri),
  ].filter((uri) => typeof uri === 'string');
  return uris.filter((uri) => !uri.startsWith('data:'));
}

function inRange(value, range) {
  return value >= range[0] && value <= range[1];
}

function rounded(value, precision = 5) {
  const scale = 10 ** precision;
  return Math.round(value * scale) / scale;
}

function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function addCheck(checks, errors, name, passed, detail) {
  checks.push({ name, passed, detail });
  if (!passed) errors.push(`${name}: ${detail}`);
}

function getSceneRenderVertexCount(scene) {
  let count = 0;
  const visit = (node) => {
    const mesh = node.getMesh();
    mesh?.listPrimitives().forEach((primitive) => {
      count +=
        primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION')?.getCount() ?? 0;
    });
    node.listChildren().forEach(visit);
  };
  scene.listChildren().forEach(visit);
  return count;
}

async function createIO() {
  const dracoDecoder = await draco3d.createDecoderModule();
  return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'draco3d.decoder': dracoDecoder,
    'meshopt.decoder': MeshoptDecoder,
  });
}

async function validateAsset(io, definition) {
  const file = path.join(MODELS_ROOT, definition.file);
  const checks = [];
  const errors = [];
  const bytes = await readFile(file);
  const json = parseGLBJSON(bytes);
  const dependencies = externalDependencies(json);
  const document = await io.read(file);
  const root = document.getRoot();
  const scene = root.listScenes()[0];
  if (!scene) throw new Error(`${definition.id} has no scene`);

  const bounds = getBounds(scene);
  const dimensions = {
    width: bounds.max[0] - bounds.min[0],
    height: bounds.max[1] - bounds.min[1],
    length: bounds.max[2] - bounds.min[2],
  };
  const centre = {
    x: (bounds.min[0] + bounds.max[0]) / 2,
    z: (bounds.min[2] + bounds.max[2]) / 2,
  };
  const materialNames = root.listMaterials().map((material) => material.getName());
  const nodeNames = new Set(root.listNodes().map((node) => node.getName()));
  const animationNames = new Set(root.listAnimations().map((animation) => animation.getName()));
  const extensionsUsed = root.listExtensionsUsed().map((extension) => extension.extensionName);
  const renderVertices = getSceneRenderVertexCount(scene);
  const textureBytes = root
    .listTextures()
    .reduce((total, texture) => total + (texture.getImage()?.byteLength ?? 0), 0);

  addCheck(
    checks,
    errors,
    'self-contained',
    !definition.selfContained || dependencies.length === 0,
    dependencies.length === 0 ? 'no external dependencies' : dependencies.join(', ')
  );
  addCheck(
    checks,
    errors,
    'file-size',
    bytes.length <= definition.maxFileBytes,
    `${bytes.length} <= ${definition.maxFileBytes} bytes`
  );
  addCheck(
    checks,
    errors,
    'material-budget',
    root.listMaterials().length <= definition.maxMaterials,
    `${root.listMaterials().length} <= ${definition.maxMaterials}`
  );
  addCheck(
    checks,
    errors,
    'texture-budget',
    root.listTextures().length <= definition.maxTextures,
    `${root.listTextures().length} <= ${definition.maxTextures}, ${textureBytes} encoded bytes`
  );
  addCheck(
    checks,
    errors,
    'vertex-budget',
    renderVertices <= definition.maxRenderVertices,
    `${renderVertices} <= ${definition.maxRenderVertices}`
  );
  addCheck(
    checks,
    errors,
    'width',
    inRange(dimensions.width, definition.bounds.width),
    `${rounded(dimensions.width)} in [${definition.bounds.width.join(', ')}]`
  );
  addCheck(
    checks,
    errors,
    'height',
    inRange(dimensions.height, definition.bounds.height),
    `${rounded(dimensions.height)} in [${definition.bounds.height.join(', ')}]`
  );
  addCheck(
    checks,
    errors,
    'length',
    inRange(dimensions.length, definition.bounds.length),
    `${rounded(dimensions.length)} in [${definition.bounds.length.join(', ')}]`
  );
  addCheck(
    checks,
    errors,
    'grounded',
    Math.abs(bounds.min[1]) <= definition.bounds.groundTolerance,
    `minY ${rounded(bounds.min[1])}, tolerance ${definition.bounds.groundTolerance}`
  );
  addCheck(
    checks,
    errors,
    'centred',
    Math.abs(centre.x) <= definition.bounds.centreTolerance &&
      Math.abs(centre.z) <= definition.bounds.centreTolerance,
    `centre (${rounded(centre.x)}, ${rounded(centre.z)}), tolerance ${definition.bounds.centreTolerance}`
  );
  addCheck(
    checks,
    errors,
    'material-names',
    materialNames.every(Boolean) && new Set(materialNames).size === materialNames.length,
    materialNames.join(', ')
  );

  for (const requiredNode of definition.requiredNodes) {
    addCheck(
      checks,
      errors,
      `node:${requiredNode}`,
      nodeNames.has(requiredNode),
      nodeNames.has(requiredNode) ? 'present' : 'missing'
    );
  }
  for (const requiredAnimation of definition.requiredAnimations) {
    addCheck(
      checks,
      errors,
      `animation:${requiredAnimation}`,
      animationNames.has(requiredAnimation),
      animationNames.has(requiredAnimation) ? 'present' : 'missing'
    );
  }
  if (definition.requiredSkinCount !== undefined) {
    addCheck(
      checks,
      errors,
      'skin-count',
      root.listSkins().length === definition.requiredSkinCount,
      `${root.listSkins().length} === ${definition.requiredSkinCount}`
    );
  }
  if (definition.requiredJointCount !== undefined) {
    root.listSkins().forEach((skin, index) => {
      addCheck(
        checks,
        errors,
        `skin:${index}:joint-count`,
        skin.listJoints().length === definition.requiredJointCount,
        `${skin.listJoints().length} === ${definition.requiredJointCount}`
      );
    });
  }
  for (const requiredExtension of definition.requiredExtensions ?? []) {
    addCheck(
      checks,
      errors,
      `extension:${requiredExtension}`,
      extensionsUsed.includes(requiredExtension),
      extensionsUsed.includes(requiredExtension) ? 'present' : 'missing'
    );
  }

  return {
    id: definition.id,
    file: definition.file,
    sha256: hash(bytes),
    fileBytes: bytes.length,
    bounds: {
      min: bounds.min.map((value) => rounded(value)),
      max: bounds.max.map((value) => rounded(value)),
      dimensions: Object.fromEntries(
        Object.entries(dimensions).map(([key, value]) => [key, rounded(value)])
      ),
    },
    counts: {
      materials: root.listMaterials().length,
      textures: root.listTextures().length,
      textureBytes,
      renderVertices,
      nodes: root.listNodes().length,
      meshes: root.listMeshes().length,
      animations: root.listAnimations().length,
    },
    extensions: extensionsUsed,
    checks,
    passed: errors.length === 0,
    errors,
  };
}

async function main() {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  if (manifest.version !== 1 || !Array.isArray(manifest.assets)) {
    throw new Error('Unsupported or malformed asset manifest');
  }

  const files = (await collectFiles(MODELS_ROOT, '.glb'))
    .map((file) => path.relative(MODELS_ROOT, file))
    .sort();
  const declared = manifest.assets.map((asset) => asset.file).sort();
  const undeclared = files.filter((file) => !declared.includes(file));
  const missing = declared.filter((file) => !files.includes(file));

  const io = await createIO();
  const results = [];
  for (const definition of manifest.assets) {
    results.push(await validateAsset(io, definition));
  }

  const report = {
    generatedAt: new Date().toISOString(),
    manifestVersion: manifest.version,
    passed:
      undeclared.length === 0 && missing.length === 0 && results.every((result) => result.passed),
    inventory: { files, declared, undeclared, missing },
    results,
  };
  await mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);

  for (const result of results) {
    console.log(
      `${result.id}: ${result.passed ? 'PASS' : 'FAIL'}, ${result.fileBytes} bytes, ${result.counts.materials} materials, ${result.counts.textures} textures, ${result.counts.renderVertices} render vertices`
    );
    result.errors.forEach((error) => console.error(`  ${error}`));
  }
  if (undeclared.length > 0) console.error(`Undeclared GLBs: ${undeclared.join(', ')}`);
  if (missing.length > 0) console.error(`Missing GLBs: ${missing.join(', ')}`);
  console.log(`Report: ${REPORT_PATH}`);

  if (!report.passed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
