import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { sampleTerrainGroundHeight, type RiverChannelConfig } from '../terrain/splatMapGenerator';

import { PlotGeometry } from '../../utils/authoredPlotGeometry';
import {
  RIVER_FOOTBRIDGE_ACCESS,
  RIVER_FOOTBRIDGE_DECK,
  RIVER_FOOTBRIDGE_STEPS,
  RIVER_FOOTBRIDGE_LANDINGS,
} from '../../constants/siteLayout';

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
  const extrude = (shape: THREE.Shape, depth: number, z = 0, curveSegments = 28, steps = 1) => {
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth,
      steps,
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
  const earth = extrude(bank, 26, 0.8, 10, 4);
  const bankPosition = earth.getAttribute('position');
  // The old uniform extrusion ended in a four-metre vertical turf slab.
  // Beyond the dark recess, taper the roof into dry meadow beyond the
  // rounded channel end (the high-tier bed is still submerged at z=18.8). Keep the
  // entrance bore unchanged and bury the back edge below the ground datum.
  for (let i = 0; i < bankPosition.count; i++) {
    const y = bankPosition.getY(i);
    if (y > -0.08) {
      const fade = 1 - THREE.MathUtils.smoothstep(bankPosition.getZ(i), 4, 26.8);
      bankPosition.setY(i, -0.08 + (y + 0.08) * fade);
    }
  }
  earth.computeVertexNormals();

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

/** Match the far turf edge to the actual canyon triangles, rather than the
 * zero-height plateau. The tail and lateral feet blend into it; the central entrance stays open.
 */
export function fitRiverCulvertBank(
  source: THREE.BufferGeometry,
  worldX: number,
  worldZ: number,
  rotation: number,
  segments: number,
  datum: number
) {
  const geometry = source.clone();
  const p = geometry.getAttribute('position');
  const cos = Math.cos(rotation),
    sin = Math.sin(rotation);
  for (let i = 0; i < p.count; i++) {
    const roofWeight = THREE.MathUtils.clamp((p.getY(i) + 5) / 4.92, 0, 1);
    const x = p.getX(i),
      z = p.getZ(i);
    const ground =
      datum +
      sampleTerrainGroundHeight(worldX + x * cos + z * sin, worldZ - x * sin + z * cos, segments);
    const rearWeight = THREE.MathUtils.smoothstep(z, 4, 26.8);
    const sideWeight = THREE.MathUtils.smoothstep(Math.abs(x), 18, 27);
    // The lateral feet meet the same sloping canyon as the tail. Keep the
    // central entrance untouched, and bury the perimeter by eight centimetres.
    const groundOffset =
      ground * Math.max(rearWeight, sideWeight) - 0.08 * sideWeight * (1 - rearWeight);
    p.setY(i, p.getY(i) + groundOffset * roofWeight);
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
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

/** One lit, merged approach assembly. Foundations reach the actual sloped bank;
 * broad landings meet dry ground, and iron handrails continue the existing deck.
 */
export function createRiverFootbridgeAccessGeometry(): THREE.BufferGeometry {
  const g = new PlotGeometry();
  const b = RIVER_FOOTBRIDGE_DECK;
  const a = RIVER_FOOTBRIDGE_ACCESS;
  for (const step of [...RIVER_FOOTBRIDGE_STEPS, ...RIVER_FOOTBRIDGE_LANDINGS]) {
    g.box(
      [b.size[0], step.top - a.baseY, step.maxZ - step.minZ],
      [b.centre[0], (step.top + a.baseY) / 2, (step.minZ + step.maxZ) / 2],
      '#b4af9f'
    );
  }
  for (const side of [-1, 1]) {
    const deckEdge = b.centre[2] + (side * b.size[2]) / 2;
    const outer = deckEdge + side * a.steps * a.going;
    const top = b.centre[1] + b.size[1] / 2;
    for (const edge of [-1, 1]) {
      const x = b.centre[0] + (edge * b.size[0]) / 2;
      g.beam([x, 1, outer], [x, top + 1, deckEdge], 0.1, '#394a49');
      for (let i = 0; i <= 4; i++) {
        const t = i / 4;
        const y = top * t;
        const z = outer + (deckEdge - outer) * t;
        g.box([0.12, 1.1, 0.12], [x, y + 0.5, z], '#394a49');
      }
    }
  }
  const geometry = g.finish();
  geometry.name = 'river-footbridge-ground-access';
  return geometry;
}
