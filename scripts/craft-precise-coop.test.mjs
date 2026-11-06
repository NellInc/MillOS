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
  it('authors the roof on the parent soffit planes the runtime interior sits under', () => {
    // Asset loop 2026-11-06 (D-031, kept as improved): the roof is authored
    // (lofted ribbed sheets on a closed slab) and no parent triangle is copied,
    // so the old per-corner roof copy no longer applies. What the runtime
    // henhouse interior relies on is kept: the slab underside lies exactly on
    // the parent's two measured soffit planes and covers each of them.
    expect(result.receipt.roof.parentTrianglesCopied).toBe(0);
    const p = before.getRoot().listMeshes()[0].listPrimitives()[0],
      q = after.getRoot().listMeshes()[0].listPrimitives()[0];
    const triangle = (primitive, t) => {
      const position = primitive.getAttribute('POSITION'),
        index = primitive.getIndices();
      return new THREE.Triangle(
        ...[0, 1, 2].map(
          (c) => new THREE.Vector3(...position.getElement(index.getScalar(t * 3 + c), []))
        )
      );
    };
    const soffits = result.receipt.roof.soffitPlanesFromParentTriangles;
    expect(soffits).toHaveLength(2);
    for (const t of soffits) {
      expect(t).toBeGreaterThanOrEqual(ROOF_TRIANGLES.start);
      expect(t).toBeLessThan(ROOF_TRIANGLES.start + ROOF_TRIANGLES.count);
      const source = triangle(p, t),
        plane = source.getPlane(new THREE.Plane()),
        normal = source.getNormal(new THREE.Vector3());
      let area = 0;
      for (let i = 0; i < q.getIndices().getCount() / 3; i++) {
        const o = triangle(q, i);
        if (
          [o.a, o.b, o.c].every((v) => Math.abs(plane.distanceToPoint(v)) < 1e-5) &&
          o.getNormal(new THREE.Vector3()).dot(normal) > 0.9999
        )
          area += o.getArea();
      }
      expect(area).toBeGreaterThanOrEqual(source.getArea());
    }
  });
  it('has physical front-door/vent openings, joined wire, wall, sill, supports and a grounded non-floating ramp', () => {
    const { frontX, backX, floorY, groundY, rampEndX, doorOpening, ventOpening } =
      result.receipt.contacts;
    // Asset loop 2026-11-06: the rebuilt coop has a round-headed pop-hole and a
    // louvred gable vent where the old one had a tall wired entrance, so the
    // rays aim at the openings the builder reports. Both still see the real
    // back wall, not an opaque front infill, and the wall beside the pop-hole is solid.
    const doorY = (doorOpening.y[0] + doorOpening.y[1]) / 2,
      ventY = (ventOpening.y[0] + ventOpening.y[1]) / 2;
    expect(doorOpening.x).toBe(frontX);
    for (const z of [0, 0.02, doorOpening.z[1] - 0.01])
      expect(hits([frontX + 0.2, doorY, z], [-1, 0, 0])[0].point.x).toBeLessThan(backX + 0.01);
    expect(hits([frontX + 0.2, ventY, 0], [-1, 0, 0])[0].point.x).toBeLessThan(backX + 0.01);
    expect(hits([frontX + 0.2, doorY, 0.2], [-1, 0, 0])[0].point.x).toBeGreaterThan(frontX);
    for (const x of [backX + 0.018, frontX - 0.018])
      for (const z of [-0.248, 0.248]) {
        const ground = hits([x, groundY - 0.1, z], [0, 1, 0])[0];
        expect(ground.point.y).toBeCloseTo(groundY, 6);
        expect(hits([x, floorY + 0.04, z], [0, -1, 0])[0].point.y).toBeGreaterThan(floorY);
      }
    // The ramp deck runs from the pop-hole threshold (0.5 mm under its sill)
    // down to a ground sill at the foot, which carries it on the ground.
    const x0 = frontX + 0.0345,
      y0 = doorOpening.y[0] - 0.0005,
      y1 = groundY + 0.0275;
    for (let i = 0; i <= 10; i++) {
      const x = x0 + 0.002 + ((rampEndX - 0.005 - x0) * i) / 10;
      const expected = y0 + ((x - x0) * (y1 - y0)) / (rampEndX - x0);
      // Start above the ramp deck, below the pop-hole head.
      const y = hits([x - 0.000001, expected + 0.02, 0.02], [0, -1, 0], 0.04)[0].point.y;
      expect(y).toBeGreaterThanOrEqual(expected - 1e-5);
      expect(y - expected).toBeLessThan(0.012);
    }
    for (const x of [rampEndX - 0.04, rampEndX - 0.02, rampEndX - 0.002])
      expect(hits([x, groundY - 0.02, 0.02], [0, 1, 0])[0].point.y).toBeCloseTo(groundY, 4);
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
