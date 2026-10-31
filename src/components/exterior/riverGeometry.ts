import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  getRiverCenterZ,
  sampleTerrainGroundHeight,
  type RiverChannelConfig,
} from '../terrain/splatMapGenerator';
import { createLakeReedLeaf, createLakeShoreStone } from './lakeShoreDetails';

import { PlotGeometry } from '../../utils/authoredPlotGeometry';
import {
  RIVER_FOOTBRIDGE_ACCESS,
  RIVER_FOOTBRIDGE_DECK,
  RIVER_FOOTBRIDGE_STEPS,
  RIVER_FOOTBRIDGE_LANDINGS,
} from '../../constants/siteLayout';

type ChannelPoint = readonly [number, number, number];

/** A sediment margin clipped from the actual bank faces, never a floating
 * ribbon. Upper feathering breaks the contour into grass and damp shingle.
 * Working if every vertex ray-hits the same quality-tier ground within 1 mm.
 */
export function createRiverShoreGeometry(
  terrain: THREE.BufferGeometry,
  waterLevel: number,
  datum: number
): THREE.BufferGeometry {
  // Carry the upper-bound distance through clipping with the position. That
  // distance stays exactly zero on the new contour, including sloping faces.
  type ShorePoint = readonly [number, number, number, number];
  const p = terrain.getAttribute('position');
  const index = terrain.getIndex();
  if (!p || !index) throw new Error('River shore needs the indexed terrain assembly');
  const lower = waterLevel - datum - 0.22;
  const positions: number[] = [],
    colors: number[] = [],
    uvs: number[] = [];
  const upper = (a: ChannelPoint) =>
    waterLevel - datum + 0.68 + 0.14 * Math.sin(a[0] * 0.18 + a[1] * 0.09);
  const clip = (poly: ShorePoint[], distance: (a: ShorePoint) => number) => {
    const out: ShorePoint[] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i],
        b = poly[(i + 1) % poly.length];
      const da = distance(a),
        db = distance(b);
      if (da >= 0) out.push(a);
      if (da >= 0 !== db >= 0) {
        const t = da / (da - db);
        out.push([
          a[0] + (b[0] - a[0]) * t,
          a[1] + (b[1] - a[1]) * t,
          a[2] + (b[2] - a[2]) * t,
          a[3] + (b[3] - a[3]) * t,
        ]);
      }
    }
    return out;
  };
  const wet = new THREE.Color('#727c68'),
    dry = new THREE.Color('#b9ac88'),
    grass = new THREE.Color('#667d4c');
  const tint = new THREE.Color();
  for (let i = 0; i < index.count; i += 3) {
    const tri: ShorePoint[] = [0, 1, 2].map((c) => {
      const v = index.getX(i + c);
      const point: ChannelPoint = [p.getX(v), p.getY(v), p.getZ(v)];
      return [...point, upper(point) - point[2]];
    });
    // No world-edge planes or dry meadow geometry enters this height band.
    const poly = clip(
      clip(tri, (a) => a[2] - lower),
      (a) => a[3]
    );
    for (let corner = 1; corner + 1 < poly.length; corner++) {
      const a = poly[0],
        b = poly[corner],
        c = poly[corner + 1];
      if (Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) < 1e-8) continue;
      for (const v of [a, b, c]) {
        const height = v[2] + datum - waterLevel;
        const dryMix = THREE.MathUtils.smoothstep(height, -0.12, 0.32);
        const grassMix = THREE.MathUtils.smoothstep(height, 0.27, 0.76);
        tint.copy(wet).lerp(dry, dryMix).lerp(grass, grassMix);
        const shade = 0.95 + 0.05 * Math.sin(v[0] * 0.67 + v[1] * 0.41);
        positions.push(v[0], v[2] + datum, -v[1]);
        // A lit, feathered top edge merges with the original turf below it.
        colors.push(
          tint.r * shade,
          tint.g * shade,
          tint.b * shade,
          THREE.MathUtils.smoothstep(v[3], 0, 0.34)
        );
        uvs.push(v[0] / 2, -v[1] / 2);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.name = 'terrain-fitted-river-shore';
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Sparse sedge and mineral pockets, sampled on the real banks at each tier.
 * Roots follow the bank rather than a nominal channel-width offset. All parts
 * merge into three static draws and stay below the dry paths and bridge landings.
 */
export function createRiverShoreDetails(
  config: RiverChannelConfig,
  segments: number,
  datum: number
) {
  const leaves: THREE.BufferGeometry[] = [],
    stones: THREE.BufferGeometry[] = [];
  const roots: THREE.Vector3[] = [],
    stoneSeats: THREE.Vector3[] = [],
    groundcoverRoots: THREE.Vector3[] = [];
  const mossPositions: number[] = [],
    mossNormals: number[] = [],
    mossColors: number[] = [],
    mossUVs: number[] = [];
  const mossAttachments: { stoneIndex: number; faceIndex: number }[] = [];
  const color = (geometry: THREE.BufferGeometry, hex: string) => {
    const c = new THREE.Color(hex),
      data = new Float32Array(geometry.getAttribute('position').count * 3);
    for (let i = 0; i < data.length; i += 3) data.set([c.r, c.g, c.b], i);
    geometry.setAttribute('color', new THREE.BufferAttribute(data, 3));
    return geometry;
  };
  const ground = (x: number, z: number) =>
    datum + sampleTerrainGroundHeight(x, z, segments, config);
  for (const [reach, x] of [-94, -65, -29, 38, 76, 111].entries()) {
    const side = reach % 2 ? -1 : 1;
    // Bracket the damp edge from the centre to dry ground on this side.
    const centre = getRiverCenterZ(x, config);
    let inside = config.width / 2,
      outside = inside + config.bankWidth + 12;
    for (let i = 0; i < 20; i++) {
      const d = (inside + outside) / 2;
      if (ground(x, centre + side * d) < config.waterLevel + 0.28) inside = d;
      else outside = d;
    }
    const edge = (inside + outside) / 2;
    for (let clump = 0; clump < 4; clump++) {
      const px = x + (clump - 1.5) * 0.36,
        pz = centre + side * (edge + Math.sin(clump * 2.4) * 0.23);
      const root = new THREE.Vector3(px, ground(px, pz) - 0.018, pz);
      roots.push(root);
      for (let blade = 0; blade < 7; blade++) {
        const height =
          (0.48 + ((blade * 3 + clump + reach) % 7) * 0.065) * (clump % 2 ? 0.76 : 1.18);
        leaves.push(
          color(
            createLakeReedLeaf(root, blade * 2.399 + reach, height, 0.13 + (blade % 3) * 0.09),
            ['#5d753e', '#809151', '#426442', '#8a8651'][(blade + reach) % 4]
          )
        );
      }
      if (clump % 2 === 0) {
        const direction = new THREE.Vector3(
          Math.sin(reach + clump) * 0.07,
          0.86 + clump * 0.08,
          Math.cos(reach) * 0.05
        );
        const tilt = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          direction.clone().normalize()
        );
        leaves.push(
          color(
            new THREE.CylinderGeometry(0.012, 0.019, direction.length(), 5)
              .applyQuaternion(tilt)
              .translate(...root.clone().addScaledVector(direction, 0.5).toArray()),
            '#667246'
          )
        );
        leaves.push(
          color(
            new THREE.CapsuleGeometry(0.035, 0.1, 2, 6)
              .applyQuaternion(tilt)
              .translate(...root.clone().addScaledVector(direction, 0.94).toArray()),
            '#6d5d46'
          )
        );
      }
    }
    for (let patch = 0; patch < 4; patch++) {
      const px = x + [-0.78, 0.12, 0.68, 1.02][patch],
        pz = centre + side * (edge + [0.04, 0.16, 0.09, -0.03][patch]);
      const root = new THREE.Vector3(px, ground(px, pz) - 0.018, pz);
      groundcoverRoots.push(root);
      if (patch === 0) {
        for (let frond = 0; frond < 3; frond++) {
          const yaw = frond * 2.399 + reach;
          const height = 0.24 + ((reach + frond) % 3) * 0.035;
          const bend = 0.15;
          const spine = createLakeReedLeaf(new THREE.Vector3(), yaw, height, bend);
          const p = spine.getAttribute('position');
          for (let v = 0; v < p.count; v++) {
            const t = Math.floor(v / 3) / 4,
              sx = Math.sin(yaw) * bend * t * t,
              sz = Math.cos(yaw) * bend * t * t;
            p.setX(v, sx + (p.getX(v) - sx) * 0.16);
            p.setZ(v, sz + (p.getZ(v) - sz) * 0.16);
          }
          spine.computeVertexNormals();
          leaves.push(color(spine.translate(...root.toArray()), '#4b6b43'));
          for (let pair = 0; pair < 4; pair++) {
            const t = 0.22 + pair * 0.18;
            const origin = new THREE.Vector3(
              root.x + Math.sin(yaw) * bend * t * t,
              root.y + height * (t - 0.16 * t * t),
              root.z + Math.cos(yaw) * bend * t * t
            );
            for (const side of [-1, 1])
              leaves.push(
                color(
                  createLakeReedLeaf(
                    new THREE.Vector3(),
                    yaw + side * (0.9 + pair * 0.05),
                    0.05 + (1 - t) * 0.04,
                    0.11 * (1 - t * 0.65)
                  )
                    .scale(0.65, 1, 0.65)
                    .translate(...origin.toArray()),
                  pair % 2 ? '#69804c' : '#426542'
                )
              );
          }
        }
      } else {
        for (let blade = 0; blade < 6; blade++)
          leaves.push(
            color(
              createLakeReedLeaf(
                root,
                blade * 2.399 + reach + patch,
                0.11 + ((blade + patch) % 3) * 0.035,
                0.13 + (blade % 2) * 0.04
              ),
              ['#5d7847', '#7d8758', '#476b43'][(blade + patch) % 3]
            )
          );
        if (patch === 2) {
          const top = root.clone().add(new THREE.Vector3(0.025, 0.27, 0.035));
          const stem = new THREE.QuadraticBezierCurve3(root, root.clone().lerp(top, 0.6), top);
          leaves.push(color(new THREE.TubeGeometry(stem, 3, 0.004, 3, false), '#62724c'));
          for (let petal = 0; petal < 5; petal++) {
            const flower = new THREE.BufferGeometry();
            flower.setAttribute(
              'position',
              new THREE.Float32BufferAttribute(
                [0, 0, 0, -0.016, 0.005, 0.025, 0, 0.012, 0.042, 0.016, 0.005, 0.025],
                3
              )
            );
            flower.setAttribute(
              'uv',
              new THREE.Float32BufferAttribute([0.5, 0, 0, 0.5, 0.5, 1, 1, 0.5], 2)
            );
            flower.setIndex([0, 1, 2, 0, 2, 3]);
            flower.computeVertexNormals();
            leaves.push(
              color(
                flower.rotateY((petal * Math.PI * 2) / 5 + reach).translate(...top.toArray()),
                reach % 2 ? '#a0a2a3' : '#8a9ba5'
              )
            );
          }
        }
      }
    }
    for (let rock = 0; rock < 8; rock++) {
      const pebble = rock >= 3;
      const px = x + (pebble ? Math.sin(rock * 2.399 + reach) * 1.25 : [-1.5, 1.4, -0.9][rock]),
        pz = centre + side * (edge - (pebble ? 0.08 + (rock % 3) * 0.06 : 0.3));
      const seat = new THREE.Vector3(px, ground(px, pz), pz);
      stoneSeats.push(seat);
      const geometry = createLakeShoreStone(
        pebble ? 0.045 + (rock % 4) * 0.016 : [0.24, 0.34, 0.19][rock],
        pebble ? 0.04 + (rock % 3) * 0.02 : 0.2 + reach * 0.01,
        reach + rock
      )
        .scale(1, pebble ? 0.22 : 1, 1)
        .rotateY(reach * 0.9 + rock * 0.4);
      const p = geometry.getAttribute('position');
      let lift = -Infinity;
      for (let v = 0; v < p.count; v++)
        lift = Math.max(lift, ground(px + p.getX(v), pz + p.getZ(v)) - p.getY(v));
      geometry.translate(px, lift - (pebble ? 0.008 : 0.025), pz);
      color(geometry, ['#7d8073', '#8a8374', '#72796f', '#95907e'][(rock + reach) % 4]);
      const colours = geometry.getAttribute('color'),
        normals = geometry.getAttribute('normal');
      for (let v = 0; v < p.count; v++) {
        const seam = 0.94 + 0.06 * Math.sin(p.getX(v) * 16 + p.getZ(v) * 11 + p.getY(v) * 7);
        colours.setXYZ(
          v,
          colours.getX(v) * seam,
          colours.getY(v) * (0.97 + 0.03 * normals.getY(v)),
          colours.getZ(v) * seam
        );
      }
      if (!pebble) {
        const index = geometry.index!;
        const candidates: {
          face: number;
          triangle: THREE.Triangle;
          normal: THREE.Vector3;
          centre: THREE.Vector3;
          seed: number;
        }[] = [];
        for (let face = 0; face < index.count / 3; face++) {
          const triangle = new THREE.Triangle(
            ...([0, 1, 2].map((c) =>
              new THREE.Vector3().fromBufferAttribute(p, index.getX(face * 3 + c))
            ) as [THREE.Vector3, THREE.Vector3, THREE.Vector3])
          );
          const normal = triangle.getNormal(new THREE.Vector3()),
            centre = triangle.getMidpoint(new THREE.Vector3());
          const seed = 0.5 + 0.5 * Math.sin(face * 17.1 + reach * 7.3 + rock * 2.4);
          if (normal.y > 0.15 && normal.z * -side > -0.25 && centre.y > config.waterLevel + 0.02)
            candidates.push({ face, triangle, normal, centre, seed });
        }
        candidates.sort((a, b) => b.seed - a.seed);
        for (const { face, triangle, normal, centre, seed } of candidates.slice(0, 3)) {
          const edges = [
            [triangle.a, triangle.b],
            [triangle.b, triangle.c],
            [triangle.c, triangle.a],
          ] as const;
          const radius =
            Math.min(
              ...edges.map(([a, b]) =>
                new THREE.Line3(a, b)
                  .closestPointToPoint(centre, true, new THREE.Vector3())
                  .distanceTo(centre)
              )
            ) *
            (0.5 + 0.2 * seed);
          const u = triangle.b.clone().sub(triangle.a).normalize(),
            v = new THREE.Vector3().crossVectors(normal, u);
          const ring = Array.from({ length: 8 }, (_, lobe) => {
            const a = (lobe * Math.PI) / 4 + seed;
            const r = radius * (0.84 + 0.14 * Math.sin(lobe * 2.3 + face));
            return centre
              .clone()
              .addScaledVector(u, Math.cos(a) * r)
              .addScaledVector(v, Math.sin(a) * r * 0.78);
          });
          for (let lobe = 0; lobe < 8; lobe++) {
            for (const point of [centre, ring[lobe], ring[(lobe + 1) % 8]]) {
              mossPositions.push(point.x, point.y, point.z);
              mossNormals.push(normal.x, normal.y, normal.z);
              mossUVs.push(point.x * 4, point.z * 4);
              const weights = triangle.getBarycoord(point, new THREE.Vector3())!;
              const base = new THREE.Color(0, 0, 0);
              for (let c = 0; c < 3; c++) {
                const source = index.getX(face * 3 + c),
                  weight = [weights.x, weights.y, weights.z][c];
                base.r += colours.getX(source) * weight;
                base.g += colours.getY(source) * weight;
                base.b += colours.getZ(source) * weight;
              }
              const tint = new THREE.Color('#42533a')
                .lerp(new THREE.Color('#68694a'), 0.5 + 0.5 * Math.sin(point.x * 61 + point.z * 83))
                .lerp(base, point === centre ? 0.12 : 0.65);
              mossColors.push(tint.r, tint.g, tint.b);
            }
            mossAttachments.push({ stoneIndex: stones.length, faceIndex: face });
          }
        }
      }
      stones.push(geometry);
    }
  }
  const merge = (parts: THREE.BufferGeometry[], name: string) => {
    const result = mergeGeometries(parts, false);
    parts.forEach((g) => g.dispose());
    if (!result) throw new Error(`Cannot assemble ${name}`);
    result.name = name;
    result.computeBoundingSphere();
    return result;
  };
  const moss = new THREE.BufferGeometry();
  moss.name = 'river-stone-facet-moss';
  moss.setAttribute('position', new THREE.Float32BufferAttribute(mossPositions, 3));
  moss.setAttribute('normal', new THREE.Float32BufferAttribute(mossNormals, 3));
  moss.setAttribute('color', new THREE.Float32BufferAttribute(mossColors, 3));
  moss.setAttribute('uv', new THREE.Float32BufferAttribute(mossUVs, 2));
  moss.setIndex(Array.from({ length: mossPositions.length / 3 }, (_, i) => i));
  moss.computeBoundingBox();
  moss.computeBoundingSphere();
  return {
    vegetation: merge(leaves, 'river-shore-reeds'),
    stones: merge(stones, 'river-shore-stones'),
    moss,
    mossAttachments,
    groundcoverRoots,
    roots,
    stoneSeats,
  };
}

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
  wall.lineTo(-12, 4.46);
  wall.lineTo(12, 4.46);
  wall.lineTo(18, 0.3);
  wall.lineTo(18, base);
  finishBore(wall);
  // Keep the original envelope and a continuous structural backing. The front
  // eight centimetres carry shallow ashlar relief, not separate drawn meshes.
  const backing = extrude(wall, 1.52, -0.72);
  const facing: THREE.BufferGeometry[] = [backing];
  const addFacing = (shape: THREE.Shape) => {
    const solid = extrude(shape, 0.09, -0.8, 1);
    // Rear caps sit inside the continuous backing and can never be seen.
    // Omit them rather than spending the fixed triangle budget on buried faces.
    const position = solid.getAttribute('position');
    const keep: number[] = [];
    for (let i = 0; i < position.count; i += 3) {
      if ([0, 1, 2].every((offset) => position.getZ(i + offset) > -0.711)) continue;
      keep.push(i, i + 1, i + 2);
    }
    solid.setIndex(keep);
    const visible = solid.toNonIndexed();
    solid.dispose();
    facing.push(visible);
  };
  type Point = readonly [number, number];
  const clip = (polygon: Point[], axis: 0 | 1, boundary: number, keepGreater: boolean) => {
    const result: Point[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i],
        b = polygon[(i + 1) % polygon.length];
      const insideA = keepGreater ? a[axis] >= boundary : a[axis] <= boundary;
      const insideB = keepGreater ? b[axis] >= boundary : b[axis] <= boundary;
      if (insideA) result.push(a);
      if (insideA !== insideB) {
        const t = (boundary - a[axis]) / (b[axis] - a[axis]);
        result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    return result;
  };
  // Split at the crown so clipping never connects disjoint banks across the
  // aperture. The existing voussoir ring owns the curved edge in front of this.
  const left: Point[] = [
    [-18, base],
    [-18, 0.01],
    [-12, 4.21],
    [0, 4.21],
  ];
  const facingRadius = outerRadius + 0.025;
  const lastAngle = Math.PI - Math.asin((base - spring) / facingRadius);
  for (let i = 0; i <= 14; i++) {
    const angle = Math.PI / 2 + ((lastAngle - Math.PI / 2) * i) / 14;
    left.push([Math.cos(angle) * facingRadius, spring + Math.sin(angle) * facingRadius]);
  }
  const halves = [left, left.map(([x, y]): Point => [-x, y]).reverse()];
  for (let row = 0; row < 5; row++) {
    const low = -2.45 + row * 1.34;
    const high = Math.min(low + 1.3, 4.22);
    const offset = row % 2 === 0 ? 0 : 3;
    for (let column = -4; column < 4; column++) {
      const xmin = column * 6 + offset + 0.025,
        xmax = xmin + 5.95;
      for (const half of halves) {
        let polygon = clip(half, 0, xmin, true);
        polygon = clip(polygon, 0, xmax, false);
        polygon = clip(polygon, 1, low, true);
        polygon = clip(polygon, 1, high, false);
        if (polygon.length < 3) continue;
        const area = polygon.reduce((sum, a, i) => {
          const b = polygon[(i + 1) % polygon.length];
          return sum + a[0] * b[1] - b[0] * a[1];
        }, 0);
        if (Math.abs(area) < 0.005) continue;
        const shape = new THREE.Shape(polygon.map(([x, y]) => new THREE.Vector2(x, y)));
        addFacing(shape);
      }
    }
  }
  // The coping sits INSIDE the old top outline, including both shoulders.
  // No taller parapet, protruding lip or additional draw call is introduced.
  const top: Point[] = [
    [-18, 0.3],
    [-12, 4.5],
    [12, 4.5],
    [18, 0.3],
  ];
  for (let segment = 0; segment < top.length - 1; segment++) {
    const a = top[segment],
      b = top[segment + 1];
    const pieces = segment === 1 ? 6 : 2;
    for (let i = 0; i < pieces; i++) {
      const jointInset = 0.02 / Math.hypot(b[0] - a[0], b[1] - a[1]);
      const t0 = i / pieces + jointInset,
        t1 = (i + 1) / pieces - jointInset;
      const x0 = a[0] + (b[0] - a[0]) * t0,
        y0 = a[1] + (b[1] - a[1]) * t0;
      const x1 = a[0] + (b[0] - a[0]) * t1,
        y1 = a[1] + (b[1] - a[1]) * t1;
      const shape = new THREE.Shape([
        new THREE.Vector2(x0, y0),
        new THREE.Vector2(x1, y1),
        new THREE.Vector2(x1, y1 - 0.25),
        new THREE.Vector2(x0, y0 - 0.25),
      ]);
      // Carry each coping stone across the original wall depth. The backing
      // is only 4 cm lower, so joints reveal solid masonry rather than holes.
      // Its rear face stays 1 cm inside the backing to avoid coplanar overlap.
      facing.push(extrude(shape, 1.59, -0.8, 1));
    }
  }
  const face = mergeGeometries(facing);
  facing.forEach((geometry) => geometry.dispose());
  if (!face) throw new Error('Could not assemble the river headwall facing');

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
      g.beam([x, 1.05, outer], [x, top + 1.05, deckEdge], 0.1, '#394a49');
      g.beam([x, 0.6, outer], [x, top + 0.6, deckEdge], 0.08, '#394a49');
      for (let i = 0; i <= 4; i++) {
        const t = i / 4;
        const y = top * t;
        const z = outer + (deckEdge - outer) * t;
        // Tops 1 cm under the handrail top (y + 1.1), not on it.
        g.box([0.12, 1.14, 0.12], [x, y + 0.52, z], '#394a49');
      }
    }
  }
  const geometry = g.finish();
  geometry.name = 'river-footbridge-ground-access';
  return geometry;
}

/** Flat mineral deck panels. Joints are flush, not a second coplanar overlay.
 * Working if every top ray agrees with the existing walking datum and bounds.
 */
export function createRiverFootbridgeDeckGeometry(): THREE.BufferGeometry {
  const g = new PlotGeometry();
  const [width, height, length] = RIVER_FOOTBRIDGE_DECK.size;
  const count = 18,
    joint = 0.022,
    panel = (length - (count - 1) * joint) / count;
  let z = -length / 2;
  for (let i = 0; i < count; i++) {
    g.box([width, height, panel], [0, 0, z + panel / 2], ['#a6a28f', '#a3a08e', '#aaa591'][i % 3]);
    z += panel;
    if (i < count - 1) {
      g.box([width, height, joint], [0, 0, z + joint / 2], '#817e70');
      z += joint;
    }
  }
  const geometry = g.finish();
  geometry.name = 'river-footbridge-flush-panels';
  return geometry;
}

/** Open heritage ironwork with flanged girders, seated on the original piers.
 * Working if the deck centre remains open and rail/approach tops meet at 3.5 m.
 */
export function createRiverFootbridgeFrameGeometry(): THREE.BufferGeometry {
  const g = new PlotGeometry();
  const [width, height, length] = RIVER_FOOTBRIDGE_DECK.size;
  const top = RIVER_FOOTBRIDGE_DECK.centre[1] + height / 2;
  const steel = '#394a49',
    trim = '#53615a';
  const bays = Math.ceil(length / 2.5),
    pitch = length / bays;
  for (const side of [-1, 1]) {
    const x = (side * width) / 2;
    g.box([0.13, 0.1, length], [x, top + 1.05, 0], trim);
    g.box([0.08, 0.08, length], [x, top + 0.6, 0], steel);
    g.box([0.1, 0.08, length], [x, top + 0.13, 0], steel);
    for (let i = 0; i <= bays; i++) {
      const z = -length / 2 + i * pitch;
      // Post tops 1 cm under the trim rail's top (top + 1.1): flush, steel and
      // trim shared a face on every post and at both stair junctions.
      g.box([0.12, 1.11, 0.12], [x, top + 0.535, z], steel);
      // End plates terminate at the span boundary, joining the existing stair posts.
      const plateZ = Math.max(-length / 2 + 0.13, Math.min(length / 2 - 0.13, z));
      g.box([0.26, 0.05, 0.26], [x, top + 0.01, plateZ], trim);
      if (i < bays) {
        const a = z + 0.06,
          b = z + pitch - 0.06;
        g.beam([x, top + 0.17, a], [x, top + 0.99, b], 0.045, steel);
        g.beam([x, top + 0.99, a], [x, top + 0.17, b], 0.045, steel);
      }
    }
  }
  for (const x of [-2, 0, 2]) {
    // Web ends 1 cm inside the trim flange ends, which shared its end faces.
    g.box([0.12, 1, length - 2.02], [x, 1.15, 0], steel);
    g.box([0.48, 0.15, length - 2], [x, 1.625, 0], trim);
    g.box([0.48, 0.12, length - 2], [x, 0.65, 0], steel);
  }
  for (let i = 0; i < 9; i++) g.box([5.5, 0.3, 0.4], [0, 1.2, -32 + i * 8], steel);
  for (let i = 0; i < 5; i++) {
    const z = -28 + i * 14;
    for (const x of [-2.2, 2.2]) g.box([0.8, 12, 0.8], [x, -4, z], steel);
    // Cap 2 cm deeper than the 0.8 m piers it crowns: equal depths put the
    // steel pier faces in the trim cap's end planes.
    g.box([5.4, 0.35, 0.84], [0, 1.45, z], trim);
    g.box([4, 0.4, 0.4], [0, -2, z], steel);
    g.beam([-2.2, -7, z], [2.2, -3, z], 0.2, steel);
    g.beam([2.2, -7, z], [-2.2, -3, z], 0.2, steel);
  }
  const geometry = g.finish();
  geometry.name = 'river-footbridge-open-ironwork';
  return geometry;
}

/** Road hardware in the existing bridge-local coordinates. The old 12 m piers
 * pierced the wearing course. Foundations stay at -11 m; heads now seat below.
 * Working if no support intersects the 16 m carriageway above its 0.61 m datum.
 */
export function createRoadRiverBridgeFrameGeometry(): THREE.BufferGeometry {
  const g = new PlotGeometry();
  const steel = '#495958',
    trim = '#738077';
  for (const side of [-1, 1]) {
    const x = side * 8.5;
    const profile = new THREE.Shape();
    const points = [
      [-0.065, 0.96],
      [0.065, 1.06],
      [-0.065, 1.18],
      [0.065, 1.3],
      [0.045, 1.325],
      [-0.105, 1.18],
      [0.025, 1.06],
      [-0.085, 0.985],
    ];
    points.forEach(([px, y], i) => (i ? profile.lineTo(px, y) : profile.moveTo(px, y)));
    profile.closePath();
    g.add(
      new THREE.ExtrudeGeometry(profile, { depth: 70, bevelEnabled: false, steps: 1 }).translate(
        x,
        0,
        -35
      ),
      trim
    );
    // Rail 1 cm proud of each post side and post tops 1 cm under the rail top:
    // at equal widths and heights steel and trim shared both faces on all 42.
    g.box([0.14, 0.1, 70], [x, 1.66, 0], trim);
    for (let i = 0; i <= 20; i++) {
      const z = -35 + i * 3.5;
      g.box([0.12, 1.15, 0.14], [x, 1.125, z], steel);
      const plateZ = Math.max(-34.85, Math.min(34.85, z));
      g.box([0.28, 0.06, 0.3], [x, 0.62, plateZ], trim);
    }
  }
  for (const x of [-6, 0, 6]) {
    // Web top stops 1 cm inside the top flange (y 0.04): at 0.55 tall it
    // ended on the flange's top face and the two were coplanar along 68 m.
    // It also ends 1 cm inside the flange ends, which shared its end faces.
    g.box([0.16, 0.54, 67.98], [x, -0.23, 0], steel);
    g.box([0.6, 0.12, 68], [x, -0.01, 0], trim);
    g.box([0.6, 0.12, 68], [x, -0.51, 0], steel);
  }
  for (let i = 0; i < 5; i++) {
    const z = -28 + i * 14;
    for (const x of [-6, 6]) g.box([1.2, 10.1, 1.2], [x, -5.95, z], steel);
    g.box([15, 0.5, 1], [0, -0.75, z], trim);
    g.box([11, 0.6, 0.6], [0, -3, z], steel);
    g.beam([-6, -8.5, z], [0, -3.5, z], 0.3, steel);
    g.beam([6, -8.5, z], [0, -3.5, z], 0.3, steel);
  }
  const geometry = g.finish();
  geometry.name = 'road-river-bridge-seated-frame';
  return geometry;
}
