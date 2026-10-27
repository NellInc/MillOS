// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { NodeIO, getBounds, VERSION } from '@gltf-transform/core';
import sharp from 'sharp';
import * as THREE from 'three';
import { deriveCoop, PARENT_PATH, PARENT_SHA256, ROOF_TRIANGLES } from './craft-precise-coop.mjs';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
let parent, result, before, after, mesh;
beforeAll(async () => {
  parent = await readFile(PARENT_PATH);
  result = await deriveCoop(parent);
  const io = new NodeIO();
  before = await io.readBinary(parent);
  after = await io.readBinary(result.bytes);
  const node = after.getRoot().listNodes()[0],
    p = node.getMesh().listPrimitives()[0],
    g = new THREE.BufferGeometry();
  for (const [key, name] of [
    ['POSITION', 'position'],
    ['NORMAL', 'normal'],
    ['TEXCOORD_0', 'uv'],
  ])
    g.setAttribute(
      name,
      new THREE.BufferAttribute(p.getAttribute(key).getArray(), key === 'TEXCOORD_0' ? 2 : 3)
    );
  g.setIndex(new THREE.BufferAttribute(p.getIndices().getArray(), 1));
  mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.FrontSide }));
  mesh.updateMatrixWorld(true);
});
function hits(origin, direction, far = 5) {
  return new THREE.Raycaster(
    new THREE.Vector3(...origin),
    new THREE.Vector3(...direction),
    0,
    far
  ).intersectObject(mesh);
}
describe('exact-parent coop architecture', () => {
  it('rejects unknown parents and deterministically retains the existing resource and envelope contracts', async () => {
    const altered = Buffer.from(parent);
    altered[altered.length - 1] ^= 1;
    await expect(deriveCoop(altered)).rejects.toThrow('Exact accepted');
    expect(hash(parent)).toBe(PARENT_SHA256);
    expect((await deriveCoop(parent)).bytes).toEqual(result.bytes);
    expect(result.bytes.length).toBeLessThanOrEqual(437000);
    // Inspect serialized bytes: NodeIO.readBinary supplies its own generator label.
    const header = JSON.parse(
      result.bytes.subarray(20, 20 + result.bytes.readUInt32LE(12)).toString()
    ).asset;
    expect(header.generator).toBe(`MillOS generated-asset pipeline, glTF-Transform ${VERSION}`);
    const oldHeader = JSON.parse(
      parent.subarray(20, 20 + parent.readUInt32LE(12)).toString()
    ).asset;
    expect(header.copyright).toBe(oldHeader.copyright);
    expect(result.receipt.triangles).toBeGreaterThanOrEqual(3000);
    expect(result.receipt.triangles).toBeLessThanOrEqual(4500);
    expect(result.receipt.renderVertices).toBeLessThanOrEqual(25200);
    expect(after.getRoot().listNodes()).toHaveLength(1);
    expect(after.getRoot().listMeshes()).toHaveLength(1);
    expect(after.getRoot().listMaterials()).toHaveLength(1);
    expect(after.getRoot().listTextures()).toHaveLength(3);
    expect(after.getRoot().listNodes()[0].getName()).toBe('CoopBody');
    expect(after.getRoot().listNodes()[0].getMatrix()).toEqual(
      before.getRoot().listNodes()[0].getMatrix()
    );
    const a = getBounds(before.getRoot().listScenes()[0]),
      b = getBounds(after.getRoot().listScenes()[0]);
    for (const key of ['min', 'max'])
      for (let c = 0; c < 3; c++) expect(b[key][c]).toBeCloseTo(a[key][c], 6);
    const m = after.getRoot().listMaterials()[0];
    expect(m.getDoubleSided()).toBe(false);
    expect(m.getBaseColorFactor()).toEqual([1, 1, 1, 1]);
    expect(m.getMetallicFactor()).toBe(0);
    expect(m.getRoughnessFactor()).toBe(1);
    for (const t of after.getRoot().listTextures())
      expect(await sharp(t.getImage()).metadata()).toMatchObject({ width: 512, height: 512 });
  });
  it('preserves every actual roof corner component, including UVs and normals, in the true output assembly', () => {
    const p = before.getRoot().listMeshes()[0].listPrimitives()[0],
      q = after.getRoot().listMeshes()[0].listPrimitives()[0];
    for (let t = 0; t < ROOF_TRIANGLES.count; t++)
      for (let c = 0; c < 3; c++)
        for (const key of ['POSITION', 'NORMAL', 'TEXCOORD_0']) {
          const a = p
              .getAttribute(key)
              .getElement(p.getIndices().getScalar((ROOF_TRIANGLES.start + t) * 3 + c), []),
            b = q.getAttribute(key).getElement(q.getIndices().getScalar(t * 3 + c), []);
          expect(b).toEqual(a);
        }
    expect(result.receipt.roof.verifiedOutputSHA256).toEqual(result.receipt.roof.attributeSHA256);
    // Every preserved roof UV is outside both modified atlas patches.
    for (let i = 0; i < ROOF_TRIANGLES.count * 3; i++)
      expect(
        q.getAttribute('TEXCOORD_0').getElement(q.getIndices().getScalar(i), [])[0]
      ).toBeGreaterThan(0.36);
  });
  it('has physical front-door/vent openings, joined wire, wall, sill, supports and a grounded non-floating ramp', () => {
    const { frontX, backX, floorY, groundY, rampEndX } = result.receipt.contacts;
    // Open entrance and gable cubby see the real back wall, not an opaque front infill.
    expect(hits([frontX + 0.2, -0.12, 0.02], [-1, 0, 0])[0].point.x).toBeLessThan(backX + 0.01);
    expect(hits([frontX + 0.2, 0.28, 0.02], [-1, 0, 0])[0].point.x).toBeLessThan(backX + 0.01);
    expect(hits([frontX + 0.2, -0.12, 0], [-1, 0, 0])[0].point.x).toBeCloseTo(
      frontX + 0.019 + 0.00145 * Math.cos(Math.PI / 6),
      5
    );
    expect(hits([frontX + 0.2, 0.07, 0], [-1, 0, 0])[0].point.x).toBeGreaterThan(frontX + 0.02);
    for (const x of [backX + 0.018, frontX - 0.018])
      for (const z of [-0.248, 0.248]) {
        const ground = hits([x, groundY - 0.1, z], [0, 1, 0])[0];
        expect(ground.point.y).toBeCloseTo(groundY, 6);
        expect(hits([x, floorY + 0.04, z], [0, -1, 0])[0].point.y).toBeGreaterThan(floorY);
      }
    const x0 = frontX + 0.02;
    for (let i = 0; i <= 10; i++) {
      const x = x0 + ((rampEndX - x0) * i) / 10;
      const expected = floorY + 0.012 + ((x - x0) * (groundY - floorY)) / (rampEndX - x0);
      // Start above the ramp, below the legitimate doorway lintel and wire.
      const y = hits([x - 0.000001, expected + 0.02, 0.02], [0, -1, 0], 0.04)[0].point.y;
      expect(y).toBeGreaterThanOrEqual(expected - 1e-5);
      expect(y - expected).toBeLessThan(0.012);
    }
    expect(hits([rampEndX - 0.00001, groundY - 0.02, 0.02], [0, 1, 0])[0].point.y).toBeCloseTo(
      groundY,
      4
    );
  });
  it('uses finite authored UVs, physical nondegenerate outward faces and hard-edged planar boards', () => {
    const p = after.getRoot().listMeshes()[0].listPrimitives()[0],
      pos = p.getAttribute('POSITION'),
      norm = p.getAttribute('NORMAL'),
      uv = p.getAttribute('TEXCOORD_0'),
      index = p.getIndices();
    for (const a of [pos, norm, uv]) expect([...a.getArray()].every(Number.isFinite)).toBe(true);
    for (let i = 0; i < uv.getCount(); i++) {
      const t = uv.getElement(i, []);
      expect(t.every((v) => v >= 0 && v <= 1)).toBe(true);
    }
    for (let i = 716 * 3; i < index.getCount(); i += 3) {
      const ids = [0, 1, 2].map((c) => index.getScalar(i + c)),
        v = ids.map((j) => new THREE.Vector3(...pos.getElement(j, []))),
        triangle = new THREE.Triangle(...v),
        n = triangle.getNormal(new THREE.Vector3());
      expect(triangle.getArea()).toBeGreaterThan(1e-12);
      for (const j of ids) {
        const normal = new THREE.Vector3(...norm.getElement(j, []));
        expect(normal.length()).toBeCloseTo(1, 5);
        // Cylindrical wire uses smooth radial normals over six physical sides.
        expect(normal.dot(n)).toBeGreaterThan(0.8);
      }
    }
    const board = result.receipt.parts.find((p) => p.name === 'side-board-1-4');
    expect(board.triangles).toBeGreaterThan(12);
    expect(board.triangles).toBeLessThanOrEqual(44);
  });
});
