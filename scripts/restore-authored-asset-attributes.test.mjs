import { afterAll, beforeAll, expect, it } from 'vitest';
import { NodeIO } from '@gltf-transform/core';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
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

async function fixture(slug, repeat = false) {
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
  for (const source of [true, false]) {
    const d = new Document(),
      buffer = d.createBuffer();
    const order = source
      ? [0, 1, 2, 3, 4, 5, 6, 6, 6]
      : repeat
        ? [2, 0, 1, 2, 0, 1]
        : [5, 3, 4, 2, 0, 1];
    const points = order.map((i) =>
      source ? sourcePoints[i] : sourcePoints[i].map((v, k) => (v - [0, 1, 0.5][k]) / 2)
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
const run = (slug) =>
  execFileSync(
    process.execPath,
    [resolve('scripts/restore-authored-asset-attributes.mjs'), `--root=${root}`, `--slug=${slug}`],
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
