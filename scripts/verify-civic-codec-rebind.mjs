#!/usr/bin/env node
/** Verify one explicitly recorded codec-only caster substitution. The original
 * bake is preserved, never relabelled as a rebake. Working if old/new decoded
 * contracts match exactly and every other bake field and atlas byte is unchanged. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { cloneDocument } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
function removeCodecs(document) {
  for (const extension of document.getRoot().listExtensionsUsed()) {
    if (/^(KHR_draco_mesh_compression|EXT_meshopt_compression)$/.test(extension.extensionName))
      extension.dispose();
  }
}

// A triangle codec may rotate its three indices, preserving winding and every
// corner. No vertex, triangle or attribute is removed or approximated here.
function indexSignature(accessor, triangular) {
  const values = Array.from(accessor.getArray());
  if (!triangular) return hash(JSON.stringify(values));
  const triangles = [];
  for (let i = 0; i < values.length; i += 3) {
    const triangle = values.slice(i, i + 3);
    const start = triangle.indexOf(Math.min(...triangle));
    triangles.push(...triangle.slice(start), ...triangle.slice(0, start));
  }
  return hash(JSON.stringify(triangles));
}

async function contract(document) {
  const root = document.getRoot();
  const clone = cloneDocument(document);
  removeCodecs(clone);
  const { json } = await io.writeJSON(clone);
  const triangleIndices = new Set();
  for (const mesh of root.listMeshes())
    for (const primitive of mesh.listPrimitives())
      if (primitive.getMode() === 4 && primitive.getIndices())
        triangleIndices.add(primitive.getIndices());
  // Compare actual decoded bytes of attributes, skin matrices and clip tracks,
  // plus all JSON metadata, material/texture links, hierarchy and transforms.
  json.accessors = root.listAccessors().map((accessor) => ({
    name: accessor.getName(),
    type: accessor.getType(),
    normalized: accessor.getNormalized(),
    count: accessor.getCount(),
    values: triangleIndices.has(accessor)
      ? indexSignature(accessor, true)
      : hash(
          new Uint8Array(
            accessor.getArray().buffer,
            accessor.getArray().byteOffset,
            accessor.getArray().byteLength
          )
        ),
  }));
  delete json.buffers;
  delete json.bufferViews;
  delete json.asset.generator;
  for (const image of json.images ?? []) delete image.uri;
  return { metadata: json, images: root.listTextures().map((texture) => hash(texture.getImage())) };
}

const metadataPath = 'public/textures/civic-square-lamp-depth.json';
const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
const entries = metadata.codecEquivalence;
assert.equal(entries?.length, 1, 'Expected the one reviewed townhall codec substitution');
const record = entries[0];
assert.equal(record.asset, 'public/models/village/townhall.glb');
assert.equal(record.algorithm, 'meshopt-trial-decoded-contract-v1');
assert.equal(record.status, 'codec-equivalent substitution; atlas not rebaked');
assert.equal(record.verifierSha256, hash(await readFile(fileURLToPath(import.meta.url))));
const old = execFileSync('git', ['show', `${record.originalCommit}:${record.asset}`]);
const current = await readFile(record.asset);
assert.equal(hash(old), record.originalCasterSha256);
assert.equal(hash(current), record.currentCasterSha256);
assert.equal(metadata.casterPins.glb[record.asset], record.currentCasterSha256);
const before = await contract(await io.readBinary(old));
const after = await contract(await io.readBinary(current));
assert.deepEqual(after, before, 'Decoded caster contract changed; rebake is required');
assert.equal(hash(JSON.stringify(before)), record.decodedContractSha256);
assert.equal(record.originalInputSha256, metadata.inputSha256);
assert.equal(record.originalAtlasSha256, metadata.atlasSha256);
assert.equal(
  hash(await readFile('public/textures/civic-square-lamp-depth.png')),
  metadata.atlasSha256
);
assert.equal(
  hash(await readFile('scripts/blender/bake_civic_lamp_depth.py')),
  metadata.bakerSha256
);
const originalMetadata = JSON.parse(
  execFileSync('git', ['show', `${record.originalCommit}:${metadataPath}`], { encoding: 'utf8' })
);
const retained = structuredClone(metadata);
delete retained.codecEquivalence;
retained.casterPins.glb[record.asset] = record.originalCasterSha256;
assert.deepEqual(retained, originalMetadata, 'Unreviewed bake metadata mutation');
console.log('CIVIC_CODEC_EQUIVALENCE_PASS', record.decodedContractSha256);
