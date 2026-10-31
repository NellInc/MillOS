import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import * as THREE from 'three';
import {
  LOCK_GATE_JOINERY,
  LOCK_GATE_LAMPS,
  LOCK_GATE_LIGHT,
  LOCK_LAMP_HOUSING,
} from './AuthoredPropTrim';
import { readFileSync } from 'node:fs';
import { LOCK_GATE_MATERIAL } from './lockGateSurface';

it('resolves vertical oak grain, a damp waterline and a separate iron atlas tile', () => {
  const { map, bumpMap } = LOCK_GATE_MATERIAL;
  expect(map!.colorSpace).toBe(THREE.SRGBColorSpace);
  expect(bumpMap!.colorSpace).toBe(THREE.NoColorSpace);
  expect(map!.image.width).toBe(512);
  expect(map!.image.height).toBe(256);
  const pixels = (map as THREE.DataTexture).image.data;
  // Bright fibres saturate rather than wrapping through Uint8 to black.
  let minimum = 255;
  for (const value of pixels) minimum = Math.min(minimum, value);
  expect(minimum).toBeGreaterThan(60);
  const mean = (y: number, c: number) => {
    let total = 0;
    for (let x = 3; x < 444; x++) total += pixels[(y * 512 + x) * 4 + c];
    return total / 441;
  };
  expect(mean(82, 0)).toBeLessThan(mean(160, 0) * 0.85);
  expect(mean(82, 1)).toBeGreaterThan(mean(82, 0) * 1.12);
  expect(LOCK_GATE_MATERIAL.emissive.getHex()).toBe(0);
  expect(LOCK_GATE_MATERIAL.bumpScale).toBeLessThan(0.02);
  const uv = LOCK_GATE_JOINERY.getAttribute('uv');
  const u = Array.from({ length: uv.count }, (_, i) => uv.getX(i));
  expect(u.some((v) => v < 0.875)).toBe(true);
  expect(u.some((v) => v > 0.875)).toBe(true);
  expect(Math.min(...u)).toBeGreaterThan(0);
  expect(Math.max(...u)).toBeLessThan(1);
});

it('retains the lock seam and walkway clearance with one finite merged detail mesh', () => {
  const geometry = LOCK_GATE_JOINERY;
  for (const name of ['position', 'normal', 'uv', 'color'])
    expect(Array.from(geometry.getAttribute(name).array).every(Number.isFinite)).toBe(true);
  expect(geometry.getAttribute('position').count).toBe(12384);
  expect(geometry.boundingBox!.min.toArray()).toEqual([-5.65, -0.735, -3.92].map(Math.fround));
  expect(geometry.boundingBox!.max.toArray()).toEqual(
    [5.65, 2.348578929901123, 0.283].map(Math.fround)
  );
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  mesh.updateMatrixWorld(true);
  for (const y of [0.3, 1, 2.8]) {
    expect(
      new THREE.Raycaster(new THREE.Vector3(0, y, 3), new THREE.Vector3(0, 0, -1)).intersectObject(
        mesh
      )
    ).toHaveLength(0);
  }
  for (const x of [-3, 3]) {
    const hits = new THREE.Raycaster(
      new THREE.Vector3(x, 0.8, 3),
      new THREE.Vector3(0, 0, -1)
    ).intersectObject(mesh);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].point.z).toBeCloseTo(0.175, 3);
  }
  mesh.material.dispose();
});

it('mounts two shielded shared-clock lights on the real uprights outside the crossing', () => {
  expect(LOCK_GATE_LAMPS.map((lamp) => lamp.id)).toEqual(['west', 'east']);
  expect(LOCK_GATE_LIGHT.distance).toBeLessThanOrEqual(8.5);
  const b = LOCK_LAMP_HOUSING.boundingBox!;
  const vertices = LOCK_LAMP_HOUSING.getAttribute('position');
  for (let i = 0; i < vertices.count; i++)
    if (vertices.getY(i) + 3 > 3.075) expect(vertices.getZ(i)).toBeGreaterThan(0.5); // clear the actual entire deck

  expect(LOCK_LAMP_HOUSING.getAttribute('position').count / 3).toBe(72);
  for (const name of ['position', 'normal', 'color'])
    expect(Array.from(LOCK_LAMP_HOUSING.getAttribute(name).array).every(Number.isFinite)).toBe(
      true
    );
  for (const lamp of LOCK_GATE_LAMPS) {
    expect(Math.abs(lamp.post[0])).toBe(5.3);
    expect(b.min.z).toBeCloseTo(0.25, 5); // actual post face
    expect(lamp.source[1]).toBeGreaterThan(3.075); // actual deck top
    expect(lamp.source[2] - 0.12).toBeGreaterThan(0.5); // lens clear of deck
    expect(Math.abs(lamp.post[0]) - Math.max(Math.abs(b.min.x), Math.abs(b.max.x))).toBeGreaterThan(
      5
    );
  }
  const source = readFileSync('src/components/scenery/AuthoredPropTrim.tsx', 'utf8');
  expect(source).toContain('intensity={disabled ? 0 : LOCK_GATE_LIGHT.intensity}');
  expect(source).toContain('material={EXTERIOR_LAMP_LENS_MATERIAL}');
  const world = readFileSync('src/components/FactoryExterior.tsx', 'utf8');
  expect(world.match(/<LockGateLighting/g)).toHaveLength(1);
  // The existing helper is the authority for direction, dimmer registration,
  // cleanup and absence of local shadow maps, already exercised by its suite.
  expect(source).toContain('<ExteriorDownlight');
});

type ClosedPart = { name: string; owner: 'fixed_post' | 'leaf'; start: number; count: number };
type Point2 = [number, number];
const retainedVertices = 10368;
const originalStreams = {
  position: 'cb75d38eb83043fe601090f07556806d85ff1955c8f2b349f12970fa3e576c57',
  normal: 'f30e027e3685060333d510ceced6025f7f8af645f3120b1d30cf8f7438d4052e',
  uv: '82dad0687c560bcff6ae0c49b8dc4b7f972bb8f757b632822aa7cd4391a1abfd',
  color: 'abb1545526fdb1c2ff56d4e667512ff09b9dd16a335b909d7ce70ccabbb3e1e0',
};
function closedParts() {
  const parts = LOCK_GATE_JOINERY.userData.lockGateClosedParts as ClosedPart[];
  expect(Array.isArray(parts)).toBe(true);
  return parts;
}
function partNamed(name: string) {
  const part = closedParts().find((item) => item.name === name);
  if (!part) throw new Error(`Missing lock hardware: ${name}`);
  return part;
}
function partVertices(part: ClosedPart) {
  const position = LOCK_GATE_JOINERY.getAttribute('position');
  return Array.from({ length: part.count }, (_, i) =>
    new THREE.Vector3().fromBufferAttribute(position, part.start + i)
  );
}
function partTriangles(part: ClosedPart) {
  const vertices = partVertices(part);
  return Array.from({ length: vertices.length / 3 }, (_, i) => vertices.slice(i * 3, i * 3 + 3));
}
function polygonArea(polygon: Point2[]) {
  return (
    Math.abs(
      polygon.reduce((sum, a, i) => {
        const b = polygon[(i + 1) % polygon.length];
        return sum + a[0] * b[1] - b[0] * a[1];
      }, 0)
    ) / 2
  );
}
// Clip one cap triangle against another to detect any positive overlap area.
function capOverlapArea(subject: Point2[], clip: Point2[]) {
  let polygon = subject;
  const signed = clip.reduce((sum, a, i) => {
    const b = clip[(i + 1) % 3];
    return sum + a[0] * b[1] - b[0] * a[1];
  }, 0);
  for (let i = 0; i < 3; i++) {
    const a = clip[i],
      b = clip[(i + 1) % 3];
    const distance = (p: Point2) =>
      Math.sign(signed) * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]));
    const result: Point2[] = [];
    for (let j = 0; j < polygon.length; j++) {
      const p = polygon[j],
        q = polygon[(j + 1) % polygon.length];
      const dp = distance(p),
        dq = distance(q);
      if (dp >= -1e-12) result.push(p);
      if ((dp > 0 && dq < 0) || (dp < 0 && dq > 0)) {
        const t = dp / (dp - dq);
        result.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
      }
    }
    polygon = result;
  }
  return polygonArea(polygon);
}

it('preserves the original four vertex streams and appends exactly 24 parts / 672 triangles', () => {
  const geometry = LOCK_GATE_JOINERY;
  expect(geometry.index).toBeNull();
  expect(geometry.groups).toHaveLength(0);
  let addedBytes = 0;
  for (const [name, sha256] of Object.entries(originalStreams)) {
    const attribute = geometry.getAttribute(name) as THREE.BufferAttribute;
    expect(attribute.array).toBeInstanceOf(Float32Array);
    expect(attribute.normalized).toBe(false);
    const prefixBytes = retainedVertices * attribute.itemSize * Float32Array.BYTES_PER_ELEMENT;
    const prefix = new Uint8Array(attribute.array.buffer, attribute.array.byteOffset, prefixBytes);
    expect(createHash('sha256').update(prefix).digest('hex'), `Original ${name} stream`).toBe(
      sha256
    );
    addedBytes += attribute.array.byteLength - prefixBytes;
  }
  expect(addedBytes).toBe(88704);
  const expected = new Map<string, [number, ClosedPart['owner']]>();
  for (const side of ['west', 'east']) {
    for (const hinge of ['lower', 'upper']) {
      for (const [kind, count, owner] of [
        ['fixed-bearing', 144, 'fixed_post'],
        ['fixed-mount-tab', 36, 'fixed_post'],
        ['fixed-pin', 60, 'fixed_post'],
        ['leaf-sleeve', 144, 'leaf'],
        ['leaf-ear', 36, 'leaf'],
      ] as const)
        expected.set(`${side}-${hinge}-${kind}`, [count, owner]);
    }
    expected.set(`${side}-outer-stile`, [36, 'leaf']);
    expected.set(`${side}-lever-exact-union`, [132, 'leaf']);
  }
  const parts = closedParts();
  expect(parts).toHaveLength(24);
  expect(new Set(parts.map((part) => part.name))).toEqual(new Set(expected.keys()));
  let start = retainedVertices;
  const bounds = new THREE.Box3();
  for (const part of parts) {
    expect([part.count, part.owner], part.name).toEqual(expected.get(part.name));
    expect(part.start).toBe(start);
    start += part.count;
    for (const vertex of partVertices(part)) bounds.expandByPoint(vertex);
  }
  expect(start).toBe(12384);
  expect((start - retainedVertices) / 3).toBe(672);
  expect(bounds.min.toArray()).toEqual([-5.65, -0.7299999594688416, -3.92].map(Math.fround));
  expect(bounds.max.toArray()).toEqual([5.65, 2.08, 0.12].map(Math.fround));
});

it('keeps every east and west hardware solid closed with outward winding and matching normals', () => {
  const normal = LOCK_GATE_JOINERY.getAttribute('normal');
  const key = (point: THREE.Vector3) =>
    point
      .toArray()
      .map((value) => Math.round(value * 1e7))
      .join(',');
  for (const part of closedParts()) {
    const edges = new Map<string, { count: number; direction: number }>();
    const faces = new Set<string>();
    const origin = new THREE.Box3()
      .setFromPoints(partVertices(part))
      .getCenter(new THREE.Vector3());
    let volume = 0;
    partTriangles(part).forEach(([a, b, c], triangle) => {
      const cross = b.clone().sub(a).cross(c.clone().sub(a));
      expect(cross.length(), `${part.name}: degenerate face`).toBeGreaterThan(1e-10);
      for (let corner = 0; corner < 3; corner++) {
        const n = new THREE.Vector3().fromBufferAttribute(
          normal,
          part.start + triangle * 3 + corner
        );
        expect(n.length()).toBeCloseTo(1, 5);
        expect(n.dot(cross.clone().normalize()), `${part.name}: normal`).toBeGreaterThan(0.99999);
      }
      const keys = [a, b, c].map(key),
        face = [...keys].sort().join('|');
      expect(faces.has(face), `${part.name}: duplicate face`).toBe(false);
      faces.add(face);
      for (let i = 0; i < 3; i++) {
        const from = keys[i],
          to = keys[(i + 1) % 3],
          edgeKey = [from, to].sort().join('|');
        const edge = edges.get(edgeKey) ?? { count: 0, direction: 0 };
        edge.count++;
        edge.direction += from < to ? 1 : -1;
        edges.set(edgeKey, edge);
      }
      volume +=
        a
          .clone()
          .sub(origin)
          .dot(b.clone().sub(origin).cross(c.clone().sub(origin))) / 6;
    });
    for (const edge of edges.values()) expect(edge, part.name).toEqual({ count: 2, direction: 0 });
    expect(volume, `${part.name}: outward volume`).toBeGreaterThan(0);
    if (part.name.endsWith('lever-exact-union')) expect(volume).toBeCloseTo(0.089572, 6);
  }
});

it('leaves four real sleeve bores clear of the fixed pins and leaf ears', () => {
  for (const [side, sign] of [
    ['west', -1],
    ['east', 1],
  ] as const) {
    for (const [hinge, height] of [
      ['lower', 0.35],
      ['upper', 1.25],
    ] as const) {
      const name = `${side}-${hinge}`;
      const sleeve = partNamed(`${name}-leaf-sleeve`);
      const pin = partNamed(`${name}-fixed-pin`);
      const ear = partNamed(`${name}-leaf-ear`);
      const bearing = partNamed(`${name}-fixed-bearing`);
      const triangles = partTriangles(sleeve);
      // Centre and off-centre pin-space rays traverse an empty sleeve bore;
      // the nearby annulus ray is a positive control against empty geometry.
      const hitsAt = (offset: number) => {
        const ray = new THREE.Ray(
          new THREE.Vector3(sign * 4.99 + offset, 3, 0),
          new THREE.Vector3(0, -1, 0)
        );
        return triangles.filter(([a, b, c]) =>
          ray.intersectTriangle(a, b, c, false, new THREE.Vector3())
        );
      };
      expect(hitsAt(0)).toHaveLength(0);
      expect(hitsAt(0.02)).toHaveLength(0);
      expect(hitsAt(-0.02)).toHaveLength(0);
      expect(hitsAt(0.04).length).toBeGreaterThan(0);
      const radii = (part: ClosedPart) =>
        partVertices(part).map((p) => Math.hypot(p.x - sign * 4.99, p.z));
      const boreRadius = Math.min(...radii(sleeve));
      const pinRadius = Math.max(...radii(pin));
      expect(boreRadius).toBeCloseTo(0.026, 6);
      expect(pinRadius).toBeCloseTo(0.02, 6);
      expect((boreRadius * Math.sqrt(3)) / 2 - pinRadius).toBeGreaterThan(0.002515);
      const earOuter = Math.max(...partVertices(ear).map((p) => sign * p.x));
      expect(4.99 - boreRadius - earOuter).toBeCloseTo(0.011, 5);
      const sleeveBounds = new THREE.Box3().setFromPoints(partVertices(sleeve));
      const bearingBounds = new THREE.Box3().setFromPoints(partVertices(bearing));
      expect(sleeveBounds.min.y).toBeCloseTo(height - 0.07, 6);
      expect(sleeveBounds.min.y).toBeCloseTo(bearingBounds.max.y, 6);
    }
  }
});

it('uses one exact-union lever per side with ten nonoverlapping triangles on each cap', () => {
  const outline: Point2[] = [
    [4.79, 0],
    [4.93, 0],
    [4.93, -0.27],
    [5.58, -0.27],
    [5.58, -0.34],
    [5.65, -0.34],
    [5.65, -3.92],
    [5.51, -3.92],
    [5.51, -0.41],
    [4.86, -0.41],
    [4.86, -0.34],
    [4.79, -0.34],
  ];
  const key = (p: Point2) => p.map((value) => Math.round(value * 1e6)).join(',');
  for (const [side, sign] of [
    ['west', -1],
    ['east', 1],
  ] as const) {
    const triangles = partTriangles(partNamed(`${side}-lever-exact-union`));
    expect(triangles).toHaveLength(44);
    for (const y of [1.93, 2.07]) {
      const caps = triangles.filter((face) => face.every((p) => Math.abs(p.y - y) < 1e-6));
      expect(caps).toHaveLength(10);
      for (const [a, b, c] of caps) {
        const normalY = b.clone().sub(a).cross(c.clone().sub(a)).y;
        expect(Math.sign(normalY)).toBe(y === 2.07 ? 1 : -1);
      }
      const projected = caps.map((face) => face.map((p): Point2 => [sign * p.x, p.z]));
      expect(new Set(projected.flat().map(key))).toEqual(new Set(outline.map(key)));
      expect(projected.reduce((sum, triangle) => sum + polygonArea(triangle), 0)).toBeCloseTo(
        0.6398,
        5
      );
      for (let i = 0; i < projected.length; i++)
        for (let j = i + 1; j < projected.length; j++) {
          expect(
            capOverlapArea(projected[i], projected[j]),
            `${side} cap ${y}: faces ${i}/${j}`
          ).toBeLessThan(1e-9);
        }
    }
  }
});
