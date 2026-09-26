import { afterAll, beforeAll, expect, it } from 'vitest';
import { NodeIO } from '@gltf-transform/core';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const io = new NodeIO();
const white = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
  'base64'
);
let root;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'millos-attribute-test-'));
});
afterAll(async () => {
  await rm(root, { recursive: true });
});

async function fixture(slug, repeat = false, nearPole = false, opposite = false) {
  const { Document } = await import('@gltf-transform/core');
  // Two distinct faces plus one exactly zero-area source triangle.
  const sourcePoints = [
    [-1, 0, 0],
    [1, 0, 0],
    [0, 2, 0],
    [-1, 0, 1],
    [1, 0, 1],
    [0, 2, 1],
    [0, 0, 0],
  ];
  if (nearPole) sourcePoints[2] = [1, 0, 1e-9];
  if (opposite) sourcePoints.splice(3, 3, sourcePoints[0], sourcePoints[2], sourcePoints[1]);
  await writeFile(
    `${root}/${slug}-geometry.json`,
    JSON.stringify({
      variants: [
        {
          parts: [
            {
              positions: sourcePoints.slice(0, 3).flat(),
              color: [0.8, 0.4, 0.2],
              sourceMap: false,
            },
            {
              positions: sourcePoints.slice(3, 6).flat(),
              color: [0.2, 0.6, 0.4],
              sourceMap: false,
            },
          ],
        },
      ],
    })
  );
  for (const source of [true, false]) {
    const d = new Document(),
      buffer = d.createBuffer();
    const order = source
      ? [0, 1, 2, 3, 4, 5, 6, 6, 6]
      : repeat
        ? [2, 0, 1, 2, 0, 1]
        : [5, 3, 4, 2, 0, 1];
    const points = order.map((i) =>
      source
        ? sourcePoints[i]
        : sourcePoints[i].map((v, k) => (v - [0, 1, opposite ? 0 : 0.5][k]) / 2)
    );
    const attribute = (type, values) =>
      d.createAccessor().setType(type).setArray(new Float32Array(values)).setBuffer(buffer);
    const texture = (name) => d.createTexture(name).setImage(white).setMimeType('image/png');
    const mat = d
      .createMaterial()
      .setBaseColorTexture(texture('colour'))
      .setBaseColorFactor(source ? [0.8, 0.4, 0.2, 1] : [0, 0, 1, 1]);
    if (!source)
      mat.setNormalTexture(texture('normal')).setMetallicRoughnessTexture(texture('roughness'));
    const p = d
      .createPrimitive()
      .setAttribute('POSITION', attribute('VEC3', points.flat()))
      .setAttribute(
        'NORMAL',
        attribute(
          'VEC3',
          order.flatMap(() => (source ? [0, 0, 1] : [0, 1, 0]))
        )
      )
      .setAttribute(
        'TEXCOORD_0',
        attribute(
          'VEC2',
          order.flatMap((i) => [i / 8, i / 16])
        )
      )
      .setIndices(
        d
          .createAccessor()
          .setType('SCALAR')
          .setArray(new Uint16Array(order.map((_, i) => i)))
          .setBuffer(buffer)
      )
      .setMaterial(mat);
    d.createScene().addChild(d.createNode().setMesh(d.createMesh().addPrimitive(p)));
    await io.write(`${root}/${slug}-${source ? 'authored-atlas' : 'tripo-original'}.glb`, d);
  }
}
const run = (slug, ...flags) =>
  execFileSync(
    process.execPath,
    [
      resolve('scripts/restore-authored-asset-attributes.mjs'),
      `--root=${root}`,
      `--slug=${slug}`,
      ...flags,
    ],
    { stdio: 'pipe', timeout: 20000 }
  );

it('restores reordered source attributes while preserving provider topology and maps', async () => {
  await fixture('valid');
  run('valid');
  const d = await io.read(`${root}/valid-authored-colour-normals-tripo-finish.glb`),
    p = d.getRoot().listMeshes()[0].listPrimitives()[0];
  expect(p.getMaterial().getBaseColorFactor()).toEqual([0.8, 0.4, 0.2, 1]);
  expect(p.getMaterial().getBaseColorTextureInfo().getTexCoord()).toBe(1);
  expect(p.getAttribute('TEXCOORD_1').getElement(0, [])).toEqual([5 / 8, 5 / 16]);
  expect(p.getAttribute('NORMAL').getElement(0, [])).toEqual([0, 0, 1]);
  expect(p.getAttribute('POSITION').getElement(0, [])).toEqual([0, 0.5, 0.25]);
  expect(p.getMaterial().getNormalTexture()).not.toBeNull();
  expect(p.getMaterial().getMetallicRoughnessTexture()).not.toBeNull();
  const receipt = JSON.parse(
    await readFile(`${root}/valid-authored-colour-normals-tripo-finish.json`, 'utf8')
  );
  expect(receipt.matchedTriangles).toBe(2);
  expect(receipt.omittedZeroAreaSourceTriangles).toBe(1);
  expect(() => run('valid')).toThrow();
});

it('rejects a duplicated provider face even when triangle counts agree', async () => {
  await fixture('duplicate', true);
  try {
    run('duplicate');
    throw Error('Unexpected acceptance');
  } catch (e) {
    expect(e.stderr?.toString()).toContain('Provider repeats a source triangle');
  }
});

it('stores solid source colours as vertices without sampling the colour atlas', async () => {
  await fixture('vertex');
  run('vertex', '--vertex-colour');
  const d = await io.read(`${root}/vertex-authored-vertex-colour-tripo-finish.glb`),
    p = d.getRoot().listMeshes()[0].listPrimitives()[0];
  expect(p.getMaterial().getBaseColorTexture()).toBeNull();
  expect(p.getAttribute('TEXCOORD_1')).toBeNull();
  expect(p.getMaterial().getBaseColorFactor()).toEqual([1, 1, 1, 1]);
  expect(p.getAttribute('COLOR_0').getElement(0, [])[1]).toBeCloseTo(0.6);
  expect(p.getAttribute('COLOR_0').getElement(3, [])[0]).toBeCloseTo(0.8);
  expect(p.getMaterial().getNormalTexture()).not.toBeNull();
});

it('explicit splitting preserves every ordered position and provider UV', async () => {
  await fixture('split');
  run('split', '--vertex-colour', '--split-vertices');
  const d = await io.read(`${root}/split-authored-vertex-colour-tripo-finish.glb`);
  const p = d.getRoot().listMeshes()[0].listPrimitives()[0];
  const original = await io.read(`${root}/split-tripo-original.glb`);
  const q = original.getRoot().listMeshes()[0].listPrimitives()[0];
  for (const semantic of ['POSITION', 'TEXCOORD_0'])
    for (let i = 0; i < q.getIndices().getCount(); i++)
      expect(p.getAttribute(semantic).getElement(p.getIndices().getScalar(i), [])).toEqual(
        q.getAttribute(semantic).getElement(q.getIndices().getScalar(i), [])
      );
  expect(p.getAttribute('NORMAL').getElement(0, [])).toEqual([0, 0, 1]);
});

it('partitions reordered triangles by source shadow flags without duplicating faces', async () => {
  await fixture('shadows');
  const file = `${root}/shadows-geometry.json`;
  const geometry = JSON.parse(await readFile(file, 'utf8'));
  geometry.variants[0].parts.forEach((part, i) => {
    part.castShadow = i === 0;
    part.receiveShadow = i === 1;
  });
  await writeFile(file, JSON.stringify(geometry));
  run('shadows', '--vertex-colour', '--authored-shadows');
  const d = await io.read(`${root}/shadows-authored-vertex-colour-tripo-finish.glb`);
  const nodes = d
    .getRoot()
    .listNodes()
    .filter((node) => node.getMesh());
  expect(nodes).toHaveLength(2);
  expect(d.getRoot().listMaterials()).toHaveLength(1);
  for (const node of nodes) {
    const primitive = node.getMesh().listPrimitives()[0];
    expect(primitive.getIndices().getCount()).toBe(3);
    const z = primitive
      .getAttribute('POSITION')
      .getElement(primitive.getIndices().getScalar(0), [])[2];
    expect(node.getExtras()).toEqual({ authoredCastShadow: z < 0, authoredReceiveShadow: z > 0 });
    expect(primitive.getMaterial().getNormalTexture()).not.toBeNull();
  }
  expect(d.getRoot().listMeshes()).toHaveLength(2);
});

it('refuses to invent missing source shadow flags', async () => {
  await fixture('missing-shadows');
  expect(() => run('missing-shadows', '--vertex-colour', '--authored-shadows')).toThrow();
});

it('keeps three distinct corners at almost-coincident sphere poles', async () => {
  await fixture('near-pole', false, true);
  run('near-pole', '--vertex-colour', '--split-vertices');
  const receipt = JSON.parse(
    await readFile(`${root}/near-pole-authored-vertex-colour-tripo-finish.json`, 'utf8')
  );
  expect(receipt.matchedTriangles).toBe(2);
});

it('rejects reversed winding even when the unordered vertices match', async () => {
  await fixture('reversed');
  const file = `${root}/reversed-tripo-original.glb`;
  const d = await io.read(file);
  const p = d.getRoot().listMeshes()[0].listPrimitives()[0];
  const indices = p.getIndices();
  const first = indices.getScalar(0);
  indices.setScalar(0, indices.getScalar(1));
  indices.setScalar(1, first);
  await io.write(file, d);
  try {
    run('reversed', '--vertex-colour');
    throw Error('Unexpected acceptance');
  } catch (error) {
    expect(error.stderr?.toString()).toContain('Triangle winding');
  }
});

it('requires opt-in for omitted numerical slivers and records their strict area limit', async () => {
  await fixture('sliver', false, true);
  const sourceFile = `${root}/sliver-authored-atlas.glb`;
  const source = await io.read(sourceFile);
  source
    .getRoot()
    .listMeshes()[0]
    .listPrimitives()[0]
    .getAttribute('POSITION')
    .setElement(2, [1, 0, 1e-20]);
  await io.write(sourceFile, source);
  const file = `${root}/sliver-tripo-original.glb`;
  const result = await io.read(file);
  result
    .getRoot()
    .listMeshes()[0]
    .listPrimitives()[0]
    .getIndices()
    .setArray(new Uint16Array([0, 1, 2]));
  await io.write(file, result);
  expect(() => run('sliver', '--vertex-colour')).toThrow();
  run('sliver', '--vertex-colour', '--split-vertices', '--omit-numerical-slivers');
  const receipt = JSON.parse(
    await readFile(`${root}/sliver-authored-vertex-colour-tripo-finish.json`, 'utf8')
  );
  expect(receipt.matchedTriangles).toBe(1);
  expect(receipt.omittedNumericallyNegligibleSourceTriangles).toBe(2);
  expect(receipt.minimumNormalizedDoubleArea).toBe(Number.EPSILON * 16);
});

it('still rejects a missing ordinary face with numerical-sliver opt-in', async () => {
  await fixture('missing-face');
  const file = `${root}/missing-face-tripo-original.glb`;
  const result = await io.read(file);
  result
    .getRoot()
    .listMeshes()[0]
    .listPrimitives()[0]
    .getIndices()
    .setArray(new Uint16Array([0, 1, 2]));
  await io.write(file, result);
  expect(() => run('missing-face', '--vertex-colour', '--omit-numerical-slivers')).toThrow();
});

it('retains deliberately opposite source faces as distinct oriented triangles', async () => {
  await fixture('two-sides', false, false, true);
  run('two-sides', '--vertex-colour', '--split-vertices');
  const receipt = JSON.parse(
    await readFile(`${root}/two-sides-authored-vertex-colour-tripo-finish.json`, 'utf8')
  );
  expect(receipt.matchedTriangles).toBe(2);
});

async function removeProviderFace(slug, opposite) {
  await fixture(slug, false, false, opposite);
  const file = `${root}/${slug}-tripo-original.glb`;
  const result = await io.read(file);
  result
    .getRoot()
    .listMeshes()[0]
    .listPrimitives()[0]
    .getIndices()
    .setArray(new Uint16Array([0, 1, 2]));
  await io.write(file, result);
  const geometryFile = `${root}/${slug}-geometry.json`;
  const geometry = JSON.parse(await readFile(geometryFile, 'utf8'));
  for (const part of geometry.variants[0].parts) part.preserveOppositeWinding = true;
  await writeFile(geometryFile, JSON.stringify(geometry));
}

it('restores only an explicitly recorded reverse face without changing the paid source file', async () => {
  await removeProviderFace('missing-reverse', true);
  const file = `${root}/missing-reverse-tripo-original.glb`;
  const before = await readFile(file);
  expect(() => run('missing-reverse', '--vertex-colour', '--split-vertices')).toThrow();
  run('missing-reverse', '--vertex-colour', '--split-vertices', '--restore-opposite-faces');
  const receipt = JSON.parse(
    await readFile(`${root}/missing-reverse-authored-vertex-colour-tripo-finish.json`, 'utf8')
  );
  expect(receipt.matchedTriangles).toBe(2);
  expect(receipt.restoredOppositeSourceTriangles).toBe(1);
  expect(await readFile(file)).toEqual(before);
});

it('rejects an ordinary missing face even with reverse-face restoration enabled', async () => {
  await removeProviderFace('missing-unrelated', false);
  expect(() =>
    run('missing-unrelated', '--vertex-colour', '--split-vertices', '--restore-opposite-faces')
  ).toThrow();
});
