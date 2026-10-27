/** Explicit precision stage above the immutable historical farm repairs.
 * Working if only the two pinned parents can produce their exact reviewed
 * outputs, raw frames and old derivation survive, and stale receipts fail.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { NodeIO, getBounds, VERSION } from '@gltf-transform/core';
import { deriveCoop } from './craft-precise-coop.mjs';
import { deriveWindmill } from './craft-precise-windmill.mjs';
import {
  AUTHORING_SCRIPT,
  AUTHORING_SHA256,
  BASELINE_DIRECTORY,
  deriveFarmModel,
} from './reconcile-farm-models.mjs';

export const hashPrecision = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const PRECISION_FARM_MODELS = {
  'farm-coop': {
    specSHA256: '246e7ed903497e08ed3a2e20c0f1255e24621b0d5411c223c96aa28827ddd4ff',
    parent: 'assets/source/models/farm/coop-pre-precision.glb',
    parentSHA256: 'e6e1f4ff7184cd865c77d3952bbadccde7c51189580dfb0aaee823d7007a63b7',
    source: 'assets/source/models/farm/coop-tripo-original.glb',
    sourceSHA256: 'c1c59659ffda9b0078b2f823289b0757abaf035e3df09526611af3fea55ee0b1',
    prepared: 'assets/source/models/farm/coop-crafted.glb',
    preparedSHA256: 'b6c1f13bbb3e2b0b06d503bd452a130902c5ce5fc3f09d9eaa3d270730fad5f5',
    builder: 'scripts/craft-precise-coop.mjs',
    builderSHA256: '6fc3f9a33f0e9032b0bf43a045f90aa35d19b00f80c472d9d0fe936128baf424',
    outputSHA256: '577e172d9c9356ad02e26dc3712e4e0abaf0f4310e65e622bb48cb9880365880',
    manifestSHA256: '180e97c7e0a505a23020cce278c54a3103f098b497b37c45248f8bbe6fb16a78',
    scaleFactor: 2.99982,
  },
  'farm-windmill': {
    specSHA256: '80a22b738d659f6e4e3e7e0bb8b5e300ee1777f774cd500ac53edb458d11f8d7',
    parent: 'assets/source/models/farm/windmill-pre-precision.glb',
    parentSHA256: 'c2c99cbc01377a0da385b0eec5db7b6efad0d39d77bbddc5c41a6afde1541790',
    source: 'assets/source/models/farm/windmill-tripo-original.glb',
    sourceSHA256: '5ef615dce20d2b3fe6fe853d6068b3560bf81439b0b5044d58e8d20605474226',
    prepared: 'assets/source/models/farm/windmill-crafted.glb',
    preparedSHA256: 'ace4d30d3c1e580658a05a27b8e0bd141759b42e7139c5b15932cef7ca51741f',
    builder: 'scripts/craft-precise-windmill.mjs',
    builderSHA256: '872c4ac3e9ebcd080a6b06b616bd74d9ac5c6393b3896024b9e76abb09cffdb6',
    outputSHA256: '441bb5c8a19b6aa713c0b484633aa9c21baf56b1f1f34dfff369be5eeb20d604',
    manifestSHA256: '96dba790de11e35565d0c3b770acf0f4e15ba3906c216c25889cde249f7734f2',
    scaleFactor: 6.79571,
  },
};

const json = (value) => JSON.parse(JSON.stringify(value));
const materialState = (material) => ({
  baseColor: material.getBaseColorFactor(),
  metallic: material.getMetallicFactor(),
  roughness: material.getRoughnessFactor(),
  normalScale: material.getNormalScale(),
  alphaMode: material.getAlphaMode(),
  alphaCutoff: material.getAlphaCutoff(),
  doubleSided: material.getDoubleSided(),
  emissive: material.getEmissiveFactor(),
  bindings: [
    material.getBaseColorTexture(),
    material.getNormalTexture(),
    material.getMetallicRoughnessTexture(),
  ].map((texture) => texture?.getName()),
});
const nodeState = (root) =>
  root.listNodes().map((node) => ({
    name: node.getName(),
    matrix: node.getMatrix(),
    children: node.listChildren().map((child) => child.getName()),
    mesh: node.getMesh()?.getName(),
  }));

export async function derivePrecisionFarmModel(id, spec, manifest) {
  const entry = PRECISION_FARM_MODELS[id];
  assert(entry, 'Unknown precision farm model');
  assert.equal(spec.id, id);
  assert.equal(
    hashPrecision(JSON.stringify(spec)),
    entry.specSHA256,
    'Precision producer spec changed'
  );
  const [parent, source, prepared, builder] = await Promise.all([
    readFile(entry.parent),
    readFile(entry.source),
    readFile(entry.prepared),
    readFile(entry.builder),
  ]);
  assert.equal(hashPrecision(parent), entry.parentSHA256, 'Precision parent changed');
  assert.equal(hashPrecision(source), entry.sourceSHA256, 'Immutable provider changed');
  assert.equal(hashPrecision(prepared), entry.preparedSHA256, 'Historical preparation changed');
  assert.equal(hashPrecision(builder), entry.builderSHA256, 'Precision builder changed');
  assert.equal(
    hashPrecision(await readFile(AUTHORING_SCRIPT)),
    AUTHORING_SHA256,
    'Historical architecture author changed'
  );
  assert.equal(manifest?.version, 1, 'Precision manifest version changed');
  assert.equal(manifest?.units, 'metres', 'Precision manifest units changed');
  assert.deepEqual(
    manifest?.coordinateSystem,
    { up: '+Y', forward: '+Z', origin: 'bottom-centre' },
    'Precision manifest coordinates changed'
  );
  const rows = manifest.assets.filter((row) => row.id === id);
  assert.equal(rows.length, 1, 'Exactly one precision manifest row required');
  assert.equal(
    hashPrecision(JSON.stringify(rows[0])),
    entry.manifestSHA256,
    'Precision manifest changed'
  );
  let ancestor = { method: 'accepted-normalized-parent', sha256: entry.parentSHA256 };
  if (id === 'farm-coop') {
    const old = await deriveFarmModel(
      id,
      await readFile(path.join(BASELINE_DIRECTORY, 'coop.baseline.glb')),
      source,
      prepared,
      await readFile(AUTHORING_SCRIPT),
      manifest
    );
    assert.equal(hashPrecision(old.bytes), entry.parentSHA256, 'Historical parent replay changed');
    ancestor = old.receipt;
  }
  const derived = await (id === 'farm-coop' ? deriveCoop(parent) : deriveWindmill(parent));
  const bytes = Buffer.from(derived.bytes);
  assert.equal(hashPrecision(bytes), entry.outputSHA256, 'Precision output changed');
  const io = new NodeIO();
  const oldRoot = (await io.readBinary(parent)).getRoot();
  const root = (await io.readBinary(bytes)).getRoot();
  assert.deepEqual(nodeState(root), nodeState(oldRoot), 'Precision raw hierarchy/frame changed');
  assert.equal(root.listScenes().length, 1);
  assert.equal(root.listMeshes().length, 1);
  assert.equal(root.listMeshes()[0].listPrimitives().length, 1);
  assert.equal(root.listMaterials().length, 1);
  assert.equal(root.listTextures().length, 3);
  assert.equal(root.listSkins().length, 0);
  assert.equal(root.listAnimations().length, 0);
  assert.deepEqual(
    materialState(root.listMaterials()[0]),
    materialState(oldRoot.listMaterials()[0])
  );
  for (const texture of root.listTextures()) assert.deepEqual(texture.getSize(), [512, 512]);
  const primitive = root.listMeshes()[0].listPrimitives()[0];
  assert.deepEqual(primitive.listSemantics().sort(), ['NORMAL', 'POSITION', 'TEXCOORD_0']);
  const header = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString()).asset;
  assert.equal(header.generator, `MillOS generated-asset pipeline, glTF-Transform ${VERSION}`);
  const parentHeader = JSON.parse(
    parent.subarray(20, 20 + parent.readUInt32LE(12)).toString()
  ).asset;
  assert.equal(header.copyright, parentHeader.copyright);
  const measured = getBounds(root.listScenes()[0]);
  const bounds = {
    width: Number((measured.max[0] - measured.min[0]).toFixed(4)),
    height: Number((measured.max[1] - measured.min[1]).toFixed(4)),
    length: Number((measured.max[2] - measured.min[2]).toFixed(4)),
    minY: Number(measured.min[1].toFixed(5)),
    centreX: Number(((measured.min[0] + measured.max[0]) / 2).toFixed(5)),
    centreZ: Number(((measured.min[2] + measured.max[2]) / 2).toFixed(5)),
  };
  const contract = rows[0];
  for (const axis of ['width', 'height', 'length'])
    assert(bounds[axis] >= contract.bounds[axis][0] && bounds[axis] <= contract.bounds[axis][1]);
  assert(Math.abs(bounds.minY) <= contract.bounds.groundTolerance);
  assert(Math.abs(bounds.centreX) <= contract.bounds.centreTolerance);
  assert(Math.abs(bounds.centreZ) <= contract.bounds.centreTolerance);
  const renderVertices = primitive.getIndices().getCount();
  assert(renderVertices <= contract.maxRenderVertices);
  assert(bytes.length <= contract.maxFileBytes);
  const result = {
    id,
    file: `farm/${spec.slug}.glb`,
    bodyNode: root.listNodes()[0].getName(),
    geometryRefinement: {
      method: 'precision-farm-structure-v1',
      parent: entry.parent,
      parentSHA256: entry.parentSHA256,
      builder: entry.builder,
      builderSHA256: entry.builderSHA256,
      outputSHA256: entry.outputSHA256,
      ancestor,
      authoring: {
        receiptSHA256: hashPrecision(JSON.stringify(derived.receipt)),
        vertices: derived.receipt.vertices,
        triangles: derived.receipt.triangles,
        parts: derived.receipt.parts.length,
        // Detailed per-part construction remains reproducible in the builder receipt.
        // Working if replay catches any receipt change without duplicating its mesh inventory.
        ...(id === 'farm-coop'
          ? { retainedRoof: derived.receipt.roof, textureReceipts: derived.receipt.textureReceipts }
          : {
              rotorRadius: derived.receipt.rotorRadius,
              panelContract: derived.receipt.panelContract,
            }),
      },
    },
    blenderPreparation: {
      file: entry.prepared,
      sha256: entry.preparedSHA256,
      script: spec.preparationScript,
      method: spec.preparationMethod,
    },
    facingYaw: 0,
    scaleFactor: entry.scaleFactor,
    bounds,
    materials: 1,
    textures: 3,
    textureBytes: root
      .listTextures()
      .reduce((sum, texture) => sum + texture.getImage().byteLength, 0),
    renderVertices,
    joints: 0,
    outputBytes: bytes.length,
    sourceSha256: entry.sourceSHA256,
    outputSha256: entry.outputSHA256,
  };
  return { bytes, result };
}

export function assertPrecisionCurrentOutput(id, currentBytes) {
  const entry = PRECISION_FARM_MODELS[id];
  assert(entry, 'Unknown precision farm model');
  assert(
    [entry.parentSHA256, entry.outputSHA256].includes(hashPrecision(currentBytes)),
    'Unknown current precision asset'
  );
}

export async function assertPrecisionFarmNormalization(id, result, currentBytes, spec, manifest) {
  const expected = await derivePrecisionFarmModel(id, spec, manifest);
  assert.equal(hashPrecision(currentBytes), PRECISION_FARM_MODELS[id].outputSHA256);
  assert.deepEqual(
    json(result),
    json(expected.result),
    'Stale precision normalization/ancestor receipt'
  );
}
