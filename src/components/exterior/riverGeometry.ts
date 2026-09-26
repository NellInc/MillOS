import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { RiverChannelConfig } from '../terrain/splatMapGenerator';

type ChannelPoint = readonly [number, number, number];

/** A continuous masonry portal around the finite channel end, in metres.
 * Working if the 20 m arch is backed by a solid spandrel, its bore stays open
 * above the water, and every footing extends below the four-metre bed.
 */
export function createRiverCulvertGeometries(): Record<
  'face' | 'ring' | 'earth' | 'darkness',
  THREE.BufferGeometry
> {
  const radius = 10;
  const spring = -7;
  const base = -5;
  const outerRadius = 11.15;
  const opening = (r = radius) => {
    const hole = new THREE.Path();
    const angle = Math.asin((base - spring) / r);
    const x = Math.sqrt(r * r - (base - spring) ** 2);
    hole.moveTo(-x, base);
    hole.absarc(0, spring, r, Math.PI - angle, angle, true);
    hole.lineTo(-x, base);
    hole.closePath();
    return hole;
  };
  const finishBore = (shape: THREE.Shape, r = radius) => {
    const angle = Math.asin((base - spring) / r);
    const x = Math.sqrt(r * r - (base - spring) ** 2);
    // This opening reaches the foundation edge. It is part of the outline,
    // not a polygon hole touching its parent edge, which Earcut can seal.
    shape.lineTo(x, base);
    shape.absarc(0, spring, r, angle, Math.PI - angle, false);
    shape.lineTo(-x, base);
    shape.closePath();
  };
  const extrude = (shape: THREE.Shape, depth: number, z = 0, curveSegments = 28) => {
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth,
      curveSegments,
      bevelEnabled: false,
    });
    geometry.translate(0, 0, z);
    return geometry;
  };

  const wall = new THREE.Shape();
  wall.moveTo(-18, base);
  wall.lineTo(-18, 0.3);
  wall.lineTo(-12, 4.5);
  wall.lineTo(12, 4.5);
  wall.lineTo(18, 0.3);
  wall.lineTo(18, base);
  finishBore(wall);
  const face = extrude(wall, 1.6, -0.8);

  // The backed ring has 4 cm mortar joints rather than metre-wide gaps.
  // Each of the 25 voussoirs is one wedge, with the central stone at the crown.
  const stones: THREE.BufferGeometry[] = [];
  const count = 25;
  const angle0 = Math.asin((base - spring) / outerRadius);
  const angle1 = Math.PI - angle0;
  for (let i = 0; i < count; i += 1) {
    const a = angle0 + ((angle1 - angle0) * i) / count + 0.002;
    const b = angle0 + ((angle1 - angle0) * (i + 1)) / count - 0.002;
    const stone = new THREE.Shape();
    stone.moveTo(Math.cos(a) * radius, spring + Math.sin(a) * radius);
    stone.absarc(0, spring, outerRadius, a, b, false);
    stone.lineTo(Math.cos(b) * radius, spring + Math.sin(b) * radius);
    stone.absarc(0, spring, radius, b, a, true);
    stone.closePath();
    const geometry = extrude(stone, 0.34, -1.02, 2);
    const colors = new Float32Array(geometry.getAttribute('position').count * 3);
    colors.fill(0.94 + 0.06 * Math.sin(i * 4.7) ** 2);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    stones.push(geometry);
  }
  const ring = mergeGeometries(stones);
  stones.forEach((stone) => stone.dispose());
  if (!ring) throw new Error('Could not assemble the river arch stones');

  const bank = new THREE.Shape();
  bank.moveTo(-27, base);
  bank.lineTo(-27, 0);
  bank.quadraticCurveTo(-21, 0, -14, 2.5);
  bank.quadraticCurveTo(0, 6, 14, 2.5);
  bank.quadraticCurveTo(21, 0, 27, 0);
  bank.lineTo(27, base);
  finishBore(bank, 10.18);
  const earth = extrude(bank, 18, 0.8);

  // A recessed dark termination conceals the finite terrain channel's cap.
  const shadow = new THREE.Shape();
  const bore = opening();
  shadow.curves = bore.curves;
  shadow.currentPoint.copy(bore.currentPoint);
  const darkness = extrude(shadow, 0.1, 3.5);
  const geometries = { face, ring, earth, darkness };
  for (const [name, geometry] of Object.entries(geometries)) {
    geometry.name = `river-culvert-${name}`;
    if (name === 'face' || name === 'ring') {
      const uv = geometry.getAttribute('uv');
      for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) / 3, uv.getY(i) / 3);
    }
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  }
  return geometries;
}

const midpoint = (a: ChannelPoint, b: ChannelPoint): ChannelPoint => [
  (a[0] + b[0]) / 2,
  (a[1] + b[1]) / 2,
  (a[2] + b[2]) / 2,
];

/** Clip the actual displaced ground triangles at one level water surface.
 * The input has TerrainGround's local axes: X east, Y south-to-north,
 * Z height. Output is local to the river anchor, for a -PI/2 X rotation.
 * Working if every open shoreline edge touches that same terrain mesh,
 * including the rounded channel ends inside the existing culverts.
 */
export function createRiverSurfaceGeometry(
  terrain: THREE.BufferGeometry,
  config: RiverChannelConfig,
  waterLevel: number,
  terrainDatum: number
): THREE.BufferGeometry {
  const cut = waterLevel - terrainDatum;
  const waterDepth = config.depth + cut;
  if (
    !Number.isFinite(cut) ||
    cut >= 0 ||
    !Number.isFinite(waterDepth) ||
    waterLevel <= terrainDatum - config.depth ||
    waterDepth <= 0
  )
    throw new Error('River water must lie between the channel bed and dry ground');

  const position = terrain.getAttribute('position');
  const index = terrain.getIndex();
  if (!position || !index) throw new Error('River surface needs the indexed terrain assembly');
  const triangles: [ChannelPoint, ChannelPoint, ChannelPoint][] = [];
  let longestEdgeSquared = 0;

  for (let offset = 0; offset < index.count; offset += 3) {
    const source: ChannelPoint[] = [0, 1, 2].map((corner) => {
      const i = index.getX(offset + corner);
      return [position.getX(i), position.getY(i), position.getZ(i)];
    });
    const clipped: ChannelPoint[] = [];
    for (let edge = 0; edge < 3; edge += 1) {
      const a = source[edge];
      const b = source[(edge + 1) % 3];
      const aInside = a[2] <= cut;
      const bInside = b[2] <= cut;
      if (aInside) clipped.push(a);
      if (aInside !== bInside) {
        const t = (cut - a[2]) / (b[2] - a[2]);
        clipped.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, cut]);
      }
    }
    for (let i = 1; i + 1 < clipped.length; i += 1) {
      const a = clipped[0],
        b = clipped[i],
        c = clipped[i + 1];
      const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (Math.abs(area) < 1e-9) continue;
      triangles.push([a, b, c]);
      for (const [p, q] of [
        [a, b],
        [b, c],
        [c, a],
      ])
        longestEdgeSquared = Math.max(longestEdgeSquared, (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2);
    }
  }

  if (triangles.length === 0) throw new Error('Terrain has no submerged river channel');

  // Equal subdivision on every clipped face keeps shared edges coincident.
  // Six metres bounds the 19.6 m vertex swell period at both terrain tiers;
  // the centimetre-scale chop remains in the existing fragment shader.
  const divisions = Math.max(0, Math.ceil(Math.log2(Math.sqrt(longestEdgeSquared) / 6)));
  const positions: number[] = [],
    uvs: number[] = [];
  const emit = (a: ChannelPoint, b: ChannelPoint, c: ChannelPoint, remaining: number) => {
    if (remaining > 0) {
      const ab = midpoint(a, b),
        bc = midpoint(b, c),
        ca = midpoint(c, a);
      emit(a, ab, ca, remaining - 1);
      emit(ab, b, bc, remaining - 1);
      emit(ca, bc, c, remaining - 1);
      emit(ab, bc, ca, remaining - 1);
      return;
    }
    for (const point of [a, b, c]) {
      positions.push(point[0] - config.position[0], point[1] + config.position[1], 0);
      // crossEdge = min(U, 1-U) in the shared water shader. Encoding actual
      // submerged depth in U/2 puts both banks at zero, with no centre seam.
      const depth = THREE.MathUtils.clamp((cut - point[2]) / waterDepth, 0, 1);
      uvs.push(
        depth * 0.5,
        THREE.MathUtils.clamp((point[0] - config.position[0]) / config.length + 0.5, 0, 1)
      );
    }
  };
  for (const triangle of triangles) emit(...triangle, divisions);

  const raw = new THREE.BufferGeometry();
  raw.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  raw.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  raw.computeVertexNormals();
  const geometry = mergeVertices(raw, 1e-5);
  raw.dispose();
  geometry.name = 'terrain-fitted-river-water';
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.riverSurface = {
    waterLevel,
    terrainDatum,
    terrainVertices: position.count,
    subdivisions: divisions,
  };
  return geometry;
}
