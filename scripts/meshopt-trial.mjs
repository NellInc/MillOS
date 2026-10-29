#!/usr/bin/env node
/** Offline codec-only trial. Runtime/source assets are read-only; no browser claims. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { gzipSync } from 'node:zlib';
import { NodeIO, VERSION } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { cloneDocument } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';

const ROOT = process.cwd();
const OUTPUT = path.join(ROOT, 'test-results/eq-tool-pilots-20261029/meshopt');
const assets = [
  ['tree', 'world/oak-trunk-unit.glb'],
  ['worker', 'worker/worker-masculine.glb'],
  ['village', 'village/townhall.glb'],
];
if (process.argv.length > 2) throw new Error('Usage: node scripts/meshopt-trial.mjs');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
});

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

function counts(document) {
  const root = document.getRoot();
  const primitives = root.listMeshes().flatMap((mesh) => mesh.listPrimitives());
  return {
    nodes: root.listNodes().length,
    meshes: root.listMeshes().length,
    primitives: primitives.length,
    vertices: primitives.reduce((n, p) => n + (p.getAttribute('POSITION')?.getCount() ?? 0), 0),
    triangles: primitives.reduce(
      (n, p) =>
        n +
        (p.getMode() === 4
          ? (p.getIndices()?.getCount() ?? p.getAttribute('POSITION')?.getCount() ?? 0) / 3
          : 0),
      0
    ),
    skins: root.listSkins().length,
    clips: root.listAnimations().map((clip) => clip.getName()),
  };
}

await mkdir(OUTPUT, { recursive: true });
const manifest = JSON.parse(await readFile('public/models/asset-manifest.json', 'utf8'));
const report = {
  scope:
    'NodeIO decode only, in-memory GLB bytes; excludes disk, network, browser/Three loading, GPU upload, startup and FPS',
  toolkit: VERSION,
  node: process.version,
  warmups: 3,
  samplesPerArm: 12,
  order: 'alternating baseline/candidate, reversed on odd sample',
  codec:
    'EXT_meshopt_compression, QUANTIZE encoder method WITHOUT quantize/reorder/weld/simplify transforms; no lossy filters',
  lod: 'None: tree attachment requires triangle correspondence; worker is skinned/animated; townhall glazing and authored trim consume geometry. No demonstrated LOD acceptance gap justifies changing them.',
  results: [],
};
for (const [id, relative] of assets) {
  const source = path.join(ROOT, 'public/models', relative);
  const original = await readFile(source);
  const baseline = await io.readBinary(original);
  const expected = await contract(baseline);
  const doc = cloneDocument(baseline);
  removeCodecs(doc);
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({
    method: EXTMeshoptCompression.EncoderMethod.QUANTIZE,
  });
  const candidate = await io.writeBinary(doc);
  const decoded = await io.readBinary(candidate);
  assert.deepEqual(await contract(decoded), expected, `${id}: decoded contract changed`);
  const definition = manifest.assets.find((asset) => asset.file === relative);
  assert.ok(definition, `${relative}: missing runtime manifest`);
  for (const name of definition.requiredNodes ?? [])
    assert.ok(
      decoded
        .getRoot()
        .listNodes()
        .some((node) => node.getName() === name)
    );
  for (const name of definition.requiredAnimations ?? [])
    assert.ok(
      decoded
        .getRoot()
        .listAnimations()
        .some((clip) => clip.getName() === name)
    );
  const filename = `${id}-meshopt.glb`;
  await writeFile(path.join(OUTPUT, filename), candidate);
  const arms = { baseline: original, candidate };
  for (let i = 0; i < report.warmups; i++)
    for (const bytes of Object.values(arms)) await io.readBinary(bytes);
  const timings = { baseline: [], candidate: [] };
  for (let i = 0; i < report.samplesPerArm; i++) {
    const order = i % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate'];
    for (const arm of order) {
      const start = performance.now();
      await io.readBinary(arms[arm]);
      timings[arm].push(performance.now() - start);
    }
  }
  const measures = Object.fromEntries(
    Object.entries(arms).map(([arm, bytes]) => {
      const sorted = [...timings[arm]].sort((a, b) => a - b);
      return [
        arm,
        {
          rawBytes: bytes.length,
          gzipBytes: gzipSync(bytes, { level: 9 }).length,
          decodeMs: {
            samples: timings[arm],
            median: (sorted[5] + sorted[6]) / 2,
            min: sorted[0],
            max: sorted.at(-1),
          },
        },
      ];
    })
  );
  assert.equal(hash(await readFile(source)), hash(original), `${id}: source changed during trial`);
  report.results.push({
    id,
    source: path.relative(ROOT, source),
    sourceSha256: hash(original),
    candidateFile: filename,
    candidateSha256: hash(candidate),
    contractExact: true,
    manifestRequiredExtensions: definition.requiredExtensions ?? [],
    counts: counts(baseline),
    ...measures,
  });
  await writeFile(path.join(OUTPUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    `${id}: ${original.length} -> ${candidate.length} bytes; gzip ${measures.baseline.gzipBytes} -> ${measures.candidate.gzipBytes}; Node median ${measures.baseline.decodeMs.median.toFixed(2)} -> ${measures.candidate.decodeMs.median.toFixed(2)} ms; decoded contract exact`
  );
}
console.log(`Evidence: ${path.relative(ROOT, OUTPUT)}/report.json`);
