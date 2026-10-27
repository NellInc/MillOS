// @vitest-environment node
import { test, expect } from 'vitest';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import * as THREE from 'three';
import sharp from 'sharp';
import { deriveWindmill, PARENT_PATH, PARENT_SHA256 } from './craft-precise-windmill.mjs';
import {
  computeSailWeights,
  sweptBounds,
  SAIL_HUB_Y,
  SAIL_HUB_Z,
} from '../src/components/models/GeneratedWindmill';

const parent = await fs.readFile(PARENT_PATH);
const generated = await deriveWindmill(parent);
const doc = await new NodeIO().readBinary(generated.bytes);
const primitive = doc.getRoot().listMeshes()[0].listPrimitives()[0];
const position = new THREE.BufferAttribute(primitive.getAttribute('POSITION').getArray(), 3);
const indices = primitive.getIndices().getArray();
const weights = computeSailWeights(position);
const sha = (b) => createHash('sha256').update(b).digest('hex');

test('replays the exact immutable parent deterministically and rejects a changed input', async () => {
  expect(sha(parent)).toBe(PARENT_SHA256);
  expect(sha((await deriveWindmill(parent)).bytes)).toBe(sha(generated.bytes));
  const changed = Buffer.from(parent);
  changed[changed.length - 1] ^= 1;
  await expect(deriveWindmill(changed)).rejects.toThrow('parent SHA-256 mismatch');
  expect(sha(await fs.readFile(PARENT_PATH))).toBe(PARENT_SHA256);
  const before = await new NodeIO().readBinary(parent);
  expect(doc.getRoot().listNodes()[0].getMatrix()).toEqual(
    before.getRoot().listNodes()[0].getMatrix()
  );
  expect(doc.getRoot().listMeshes()).toHaveLength(1);
  expect(doc.getRoot().listMeshes()[0].listPrimitives()).toHaveLength(1);
  const binary = Buffer.from(generated.bytes);
  const assetHeader = JSON.parse(
    binary.subarray(20, 20 + binary.readUInt32LE(12)).toString()
  ).asset;
  expect(assetHeader.generator).toMatch(
    /^MillOS generated-asset pipeline, glTF-Transform v\d+\.\d+\.\d+$/
  );
  expect(doc.getRoot().getAsset().copyright).toBe(before.getRoot().getAsset().copyright);
  expect(doc.getRoot().listMaterials()).toHaveLength(1);
  expect(doc.getRoot().listTextures()).toHaveLength(3);
  expect(primitive.listSemantics().sort()).toEqual(['NORMAL', 'POSITION', 'TEXCOORD_0']);
  expect(position.count).toBeLessThanOrEqual(6989);
  expect(indices.length / 3).toBeLessThanOrEqual(8384);
  expect(generated.bytes.length).toBeLessThanOrEqual(393000);
});

test('contains closed rigid architectural parts and a clear full rotor sweep in the actual mesh', () => {
  const normal = primitive.getAttribute('NORMAL').getArray();
  for (let i = 0; i < normal.length; i += 3)
    expect(Math.hypot(normal[i], normal[i + 1], normal[i + 2])).toBeCloseTo(1, 4);
  for (const a of primitive.listAttributes())
    expect([...a.getArray()].every(Number.isFinite)).toBe(true);
  const get = (i) => new THREE.Vector3().fromBufferAttribute(position, i);
  let rotorMinX = Infinity,
    rotorRadius = 0;
  for (let i = 0; i < weights.length; i++) {
    expect(weights[i] === 0 || weights[i] === 1).toBe(true);
    if (weights[i]) {
      rotorMinX = Math.min(rotorMinX, position.getX(i));
      rotorRadius = Math.max(
        rotorRadius,
        Math.hypot(position.getY(i) - SAIL_HUB_Y, position.getZ(i) - SAIL_HUB_Z)
      );
    }
  }
  expect(rotorRadius).toBeLessThanOrEqual(0.538226562);
  let triangles = 0;
  for (const part of generated.receipt.parts) {
    const edge = new Map();
    let signedVolume = 0;
    const key = (v) =>
      v
        .toArray()
        .map((n) => Math.round(n * 1e7))
        .join(',');
    for (
      let t = part.triangleStart * 3;
      t < (part.triangleStart + part.triangleCount) * 3;
      t += 3
    ) {
      const ids = [indices[t], indices[t + 1], indices[t + 2]],
        points = ids.map(get);
      expect(ids.map((i) => weights[i])).toEqual([
        Number(part.rotor),
        Number(part.rotor),
        Number(part.rotor),
      ]);
      if (new THREE.Triangle(...points).getArea() < 1e-13) continue;
      signedVolume += points[0].dot(new THREE.Vector3().crossVectors(points[1], points[2])) / 6;
      for (let k = 0; k < 3; k++) {
        const a = key(points[k]),
          b = key(points[(k + 1) % 3]);
        edge.set(a + '>' + b, (edge.get(a + '>' + b) ?? 0) + 1);
      }
      if (!part.rotor && Math.max(...points.map((p) => p.x)) >= rotorMinX) {
        // All non-X-separated static geometry is the low stone foot. Every
        // convex triangle lies below the rotor's lowest possible swept point.
        expect(Math.max(...points.map((p) => p.y))).toBeLessThan(SAIL_HUB_Y - rotorRadius);
      }
    }
    for (const [directed, count] of edge) {
      const [a, b] = directed.split('>');
      expect(edge.get(b + '>' + a), part.name + ' closed edge').toBe(count);
    }
    expect(signedVolume, part.name + ' outward closed volume').toBeGreaterThan(1e-16);
    triangles += part.triangleCount;
  }
  expect(triangles).toBe(indices.length / 3);
  const sweep = sweptBounds(position, weights);
  const prior = new THREE.Box3(
    new THREE.Vector3(-0.293130339, -0.500353277, -0.507226563),
    new THREE.Vector3(0.292438657, 0.633026563, 0.569226563)
  );
  expect(prior.containsBox(sweep)).toBe(true);
});

test('uses deliberate atlas charts and clean normal surfacing for plaster, copper, stone and timber', async () => {
  const material = primitive.getMaterial(),
    uv = primitive.getAttribute('TEXCOORD_0').getArray();
  const colour = await sharp(material.getBaseColorTexture().getImage())
    .raw()
    .toBuffer({ resolveWithObject: true });
  const normal = await sharp(material.getNormalTexture().getImage())
    .raw()
    .toBuffer({ resolveWithObject: true });
  const orm = await sharp(material.getMetallicRoughnessTexture().getImage())
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (const image of [colour, normal, orm])
    expect([image.info.width, image.info.height]).toEqual([512, 512]);
  expect(material.getBaseColorFactor()).toEqual([1, 1, 1, 1]);
  expect(material.getMetallicFactor()).toBe(0);
  expect(material.getDoubleSided()).toBe(false);
  const palette = ['plaster', 'stone', 'copper', 'wood', 'door', 'iron', 'mortar', 'limestone'];
  for (const part of generated.receipt.parts)
    for (let i = part.vertexStart; i < part.vertexStart + part.vertexCount; i++) {
      const u = uv[i * 2],
        v = uv[i * 2 + 1],
        tile = Math.floor(u * 4) + Math.floor(v * 2) * 4;
      expect(palette[tile], part.name + ' real chart').toBe(part.style);
      const x = Math.floor(u * 512),
        y = Math.floor(v * 512),
        at = (y * 512 + x) * normal.info.channels;
      expect(Math.abs(normal.data[at] - 128)).toBeLessThanOrEqual(2);
      expect(Math.abs(normal.data[at + 1] - 128)).toBeLessThanOrEqual(2);
      expect(normal.data[at + 2]).toBeGreaterThan(250);
    }
  const geometry = new THREE.BufferGeometry()
    .setAttribute('position', position)
    .setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(Array.from(indices));
  const surface = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  const sample = (point, direction) => {
    const hit = new THREE.Raycaster(
      new THREE.Vector3(...point),
      new THREE.Vector3(...direction),
      0,
      2
    ).intersectObject(surface)[0];
    expect(hit).toBeDefined();
    const x = Math.min(511, Math.floor(hit.uv.x * 512)),
      y = Math.min(511, Math.floor(hit.uv.y * 512)),
      at = (y * 512 + x) * colour.info.channels;
    return [...colour.data.subarray(at, at + 3)];
  };
  const plaster = sample([0.6, -0.15, 0.006], [-1, 0, 0]);
  expect(Math.min(...plaster)).toBeGreaterThan(185);
  expect(Math.abs(plaster[0] - plaster[1])).toBeLessThan(8);
  const copper = sample([-0.03, 0.4, 0.006], [0, -1, 0]);
  expect(copper[0]).toBeGreaterThan(copper[1] * 1.35);
  expect(copper[1]).toBeGreaterThan(copper[2] * 1.2);
  const wood = sample(
    [0.6, 0.0948 + (0.3 - 0.040183) / Math.SQRT2, 0.031 + (0.3 + 0.040183) / Math.SQRT2],
    [-1, 0, 0]
  );
  expect(wood[0]).toBeGreaterThan(wood[1] * 1.2);
  expect(wood[1]).toBeGreaterThan(wood[2] * 1.2);
  geometry.dispose();
  surface.material.dispose();
  expect(new Set(colour.data).size).toBeGreaterThan(40);
});
