/** Bounded current-main repairs of two visible farm wall defects.
 * Preserve all existing roof faces and coop normals; current source is the default.
 * Every dependency and normalized input is pinned; unknown bytes fail before writes.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { NodeIO, getBounds } from '@gltf-transform/core';
import { refine as refineCoop } from './refine-coop-gable-candidate.mjs';
import { refine as refineFarmhouse } from './restore-farmhouse-walls.mjs';

export const BASELINE_COMMIT = '4853755ab449155105198b1ef0109cad9e767067';
export const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const RECONCILED_FARM_MODELS = Object.freeze({
  'farm-coop': Object.freeze({
    slug: 'coop',
    inputSHA256: '59d70ebe84a1daacd63c8b9be15a07febbceb14f3c34685ec19eeab50b3aff05',
    sourceSHA256: 'c1c59659ffda9b0078b2f823289b0757abaf035e3df09526611af3fea55ee0b1',
    preparedSHA256: 'b6c1f13bbb3e2b0b06d503bd452a130902c5ce5fc3f09d9eaa3d270730fad5f5',
    scaleFactor: 2.99982,
    manifestSHA256: '180e97c7e0a505a23020cce278c54a3103f098b497b37c45248f8bbe6fb16a78',
    outputSHA256: 'e6e1f4ff7184cd865c77d3952bbadccde7c51189580dfb0aaee823d7007a63b7',
  }),
  'farm-farmhouse': Object.freeze({
    slug: 'farmhouse',
    inputSHA256: '3915c901a1cbcfadb6b2997b89d622c38c4b2745dd265c4ff410d66bea615c6a',
    sourceSHA256: 'ebc862d40b2bc9df64c56e362be259f680a9241e4f1fa7893b8df56931306ba7',
    preparedSHA256: '38b423981f82f9591dc6fed298c828755300a5c0af5a6c00d62f8f96455074f3',
    scaleFactor: 6.00116,
    manifestSHA256: '5ad25e20050d2f410fd2a9554695083410af4ef08ca5dbf5d9a7360ba8ef215b',
    outputSHA256: '0a579e5c32dc08033d34a8c086dd99e5869eb43ce2639fc8c4203f59b8b6e599',
  }),
});

export const AUTHORING_SCRIPT = 'scripts/blender/refine_architecture_assets.py';
export const AUTHORING_SHA256 = 'ddd30879f2abb12b618a8e475c57ac2f7b708bf0f6958fbb0d626cfdedaeada2';
export const BASELINE_DIRECTORY = 'src/test/fixtures/farm-model-reconciliation';

export function assertFarmDependencies(id, sourceBytes, preparedBytes, authoringBytes, manifest) {
  const spec = RECONCILED_FARM_MODELS[id];
  assert(spec, 'Unknown reconciled farm model');
  assert.equal(hash(sourceBytes), spec.sourceSHA256, `${id}: exact immutable provider required`);
  assert.equal(hash(preparedBytes), spec.preparedSHA256, `${id}: changed prepared input`);
  assert.equal(hash(authoringBytes), AUTHORING_SHA256, `${id}: changed architecture author`);
  assert.equal(manifest?.version, 1, `${id}: changed manifest version`);
  assert.equal(manifest?.units, 'metres', `${id}: changed manifest units`);
  assert.deepEqual(
    manifest?.coordinateSystem,
    {
      up: '+Y',
      forward: '+Z',
      origin: 'bottom-centre',
    },
    `${id}: changed manifest coordinates`
  );
  const rows = manifest?.assets?.filter((entry) => entry.id === id);
  assert.equal(rows?.length, 1, `${id}: exactly one manifest entry required`);
  assert.equal(
    hash(JSON.stringify(rows[0])),
    spec.manifestSHA256,
    `${id}: changed manifest contract`
  );
}

export async function deriveFarmModel(
  id,
  baselineBytes,
  sourceBytes,
  preparedBytes,
  authoringBytes,
  manifest
) {
  assertFarmDependencies(id, sourceBytes, preparedBytes, authoringBytes, manifest);
  const spec = RECONCILED_FARM_MODELS[id];
  assert(spec, 'Unknown reconciled farm model');
  assert.equal(
    hash(baselineBytes),
    spec.inputSHA256,
    `${id}: exact accepted normalized input required`
  );
  assert.equal(hash(sourceBytes), spec.sourceSHA256, `${id}: exact immutable provider required`);
  const io = new NodeIO();
  const doc = await io.readBinary(baselineBytes);
  const source = await io.readBinary(sourceBytes);
  const steps = [
    id === 'farm-farmhouse'
      ? refineFarmhouse(doc, source, hash(baselineBytes), hash(sourceBytes))
      : refineCoop(doc, source, hash(baselineBytes), hash(sourceBytes)),
  ];
  const bytes = Buffer.from(await io.writeBinary(doc));
  assert.equal(hash(bytes), spec.outputSHA256, `${id}: final reviewed candidate required`);
  return {
    bytes,
    receipt: {
      method: 'current-main-wall-repair-v1',
      baselineCommit: BASELINE_COMMIT,
      preparedSHA256: spec.preparedSHA256,
      authoringSHA256: AUTHORING_SHA256,
      manifestSHA256: spec.manifestSHA256,
      inputSHA256: spec.inputSHA256,
      sourceSHA256: spec.sourceSHA256,
      outputSHA256: spec.outputSHA256,
      steps,
      status: 'Current-main bounded wall repair; native GPU acceptance pending',
    },
  };
}

export function assertFarmCurrentOutput(id, currentBytes) {
  const spec = RECONCILED_FARM_MODELS[id];
  assert(spec, 'Unknown reconciled farm model');
  assert(
    [spec.inputSHA256, spec.outputSHA256].includes(hash(currentBytes)),
    `${id}: refusing to replace an unknown current runtime asset`
  );
}

export async function assertFarmNormalization(
  id,
  result,
  currentBytes,
  baselineBytes,
  sourceBytes,
  preparedBytes,
  authoringBytes,
  manifest
) {
  assertFarmDependencies(id, sourceBytes, preparedBytes, authoringBytes, manifest);
  const spec = RECONCILED_FARM_MODELS[id];
  assert(spec, 'Unknown reconciled farm model');
  assert.equal(hash(currentBytes), spec.outputSHA256, `${id}: installed candidate differs`);
  assert.equal(result?.outputSha256, spec.outputSHA256, `${id}: stale normalization output`);
  assert.equal(result?.outputBytes, currentBytes.length, `${id}: stale normalization byte count`);
  assert.equal(result?.sourceSha256, spec.sourceSHA256, `${id}: stale published source hash`);
  assert.equal(hash(preparedBytes), spec.preparedSHA256, `${id}: changed prepared input`);
  assert.equal(
    result?.blenderPreparation?.sha256,
    spec.preparedSHA256,
    `${id}: stale prepared hash`
  );
  assert.equal(result?.id, id, `${id}: stale normalization id`);
  assert.equal(result?.file, `farm/${spec.slug}.glb`, `${id}: stale runtime path`);
  assert.equal(
    result?.blenderPreparation?.file,
    `assets/source/models/farm/${spec.slug}-crafted.glb`,
    `${id}: stale prepared path`
  );
  assert.equal(result?.blenderPreparation?.script, AUTHORING_SCRIPT, `${id}: stale author script`);
  const receipt = result?.geometryRefinement;
  assert.equal(
    receipt?.method,
    'current-main-wall-repair-v1',
    `${id}: missing composition receipt`
  );
  assert.equal(receipt?.inputSHA256, spec.inputSHA256, `${id}: stale accepted input`);
  assert.equal(receipt?.sourceSHA256, spec.sourceSHA256, `${id}: stale provider receipt`);
  assert.equal(receipt?.outputSHA256, spec.outputSHA256, `${id}: stale final receipt`);
  const expected = await deriveFarmModel(
    id,
    baselineBytes,
    sourceBytes,
    preparedBytes,
    authoringBytes,
    manifest
  );
  const io = new NodeIO();
  const json = (value) => JSON.parse(JSON.stringify(value));
  assert.deepEqual(json(receipt), json(expected.receipt), `${id}: stale derivation chain`);
  const root = (await io.readBinary(currentBytes)).getRoot();
  const bounds = getBounds(root.listScenes()[0]);
  const expectedBounds = {
    width: Number((bounds.max[0] - bounds.min[0]).toFixed(4)),
    height: Number((bounds.max[1] - bounds.min[1]).toFixed(4)),
    length: Number((bounds.max[2] - bounds.min[2]).toFixed(4)),
    minY: Number(bounds.min[1].toFixed(5)),
    centreX: Number(((bounds.min[0] + bounds.max[0]) / 2).toFixed(5)),
    centreZ: Number(((bounds.min[2] + bounds.max[2]) / 2).toFixed(5)),
  };
  assert.deepEqual(json(result.bounds), json(expectedBounds), `${id}: stale bounds`);
  const metrics = {
    materials: root.listMaterials().length,
    textures: root.listTextures().length,
    textureBytes: root.listTextures().reduce((n, t) => n + t.getImage().byteLength, 0),
    renderVertices: root
      .listMeshes()
      .reduce(
        (n, m) => n + m.listPrimitives().reduce((k, p) => k + p.getIndices().getCount(), 0),
        0
      ),
    joints: 0,
    facingYaw: 0,
    scaleFactor: spec.scaleFactor,
    bodyNode: `${spec.slug[0].toUpperCase()}${spec.slug.slice(1)}Body`,
  };
  for (const [key, value] of Object.entries(metrics))
    assert.equal(result[key], value, `${id}: stale ${key}`);
}
