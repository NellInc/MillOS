import React, { useMemo } from 'react';
import * as THREE from 'three';
import { PlotGeometry } from '../../utils/authoredPlotGeometry';
import {
  WORLD_CRAFT_PALETTE as P,
  VILLAGE_REALM_PATHS,
  WORLD_REALM_PATHS,
  WORLD_REALM_PATCHES,
  FARM_REALM_PATHS,
  CANAL_FOOTBRIDGE_ACCESS,
  CANAL_BRIDGE_STEPS,
  type RealmPath,
  type RealmPatch,
} from '../../constants/publicRealmLayout';
import { EXTERIOR_LAYERS, POLYGON_OFFSET } from '../../constants/renderLayers';
import { sampleTerrainGroundHeight } from '../terrain/splatMapGenerator';
import { getTerrainGridSegments } from '../terrain/terrainTypes';
import { useGraphicsStore } from '../../stores/graphicsStore';

type Ground = (x: number, z: number) => number;
const flat: Ground = () => EXTERIOR_LAYERS.ground;
const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86 });
export const REALM_PAVING_MATERIAL = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.94,
  depthWrite: true,
  polygonOffset: true,
  polygonOffsetFactor: POLYGON_OFFSET.strong.factor,
  polygonOffsetUnits: POLYGON_OFFSET.strong.units,
});

// Finite, metre-sized paving. Each surface is tessellated against the same
// rendered terrain grid, rather than hovering over a hill or cutting through it.
function patch(
  b: PlotGeometry,
  x: number,
  z: number,
  width: number,
  depth: number,
  colour: string,
  ground: Ground = flat
) {
  const g = new THREE.PlaneGeometry(
    width,
    depth,
    Math.max(1, Math.ceil(width / 1.5)),
    Math.max(1, Math.ceil(depth / 1.5))
  );
  g.rotateX(-Math.PI / 2).translate(x, 0, z);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) p.setY(i, ground(p.getX(i), p.getZ(i)));
  g.computeVertexNormals();
  b.add(g, colour);
}
// World paths are axis-aligned. Cut tiles around courts and previously laid
// paths, including partial-width intersections, rather than stacking finishes.
// Working if rays at both quays and path junctions find one paving surface.
function outsideFinishedSurfaces(tile: THREE.PlaneGeometry, courts: readonly RealmPatch[]) {
  if (!courts.length) return [tile];
  tile.computeBoundingBox();
  const bounds = tile.boundingBox!;
  let rectangles = [[bounds.min.x, bounds.max.x, bounds.min.z, bounds.max.z]];
  for (const court of courts) {
    rectangles = rectangles.flatMap(([x0, x1, z0, z1]) => {
      const left = Math.max(x0, court.x - court.halfX),
        right = Math.min(x1, court.x + court.halfX),
        front = Math.max(z0, court.z - court.halfZ),
        back = Math.min(z1, court.z + court.halfZ);
      if (left >= right || front >= back) return [[x0, x1, z0, z1]];
      return [
        [x0, x1, z0, front],
        [x0, x1, back, z1],
        [x0, left, front, back],
        [right, x1, front, back],
      ].filter(([a, b, c, d]) => b - a > 1e-6 && d - c > 1e-6);
    });
  }
  tile.dispose();
  return rectangles.map(([x0, x1, z0, z1]) =>
    new THREE.PlaneGeometry(x1 - x0, z1 - z0)
      .rotateX(-Math.PI / 2)
      .translate((x0 + x1) / 2, 0, (z0 + z1) / 2)
  );
}
function route(
  b: PlotGeometry,
  path: RealmPath,
  ground: Ground = flat,
  yard = false,
  courts: readonly RealmPatch[] = []
) {
  const dx = path.end[0] - path.start[0],
    dz = path.end[1] - path.start[1];
  const length = Math.hypot(dx, dz),
    angle = Math.atan2(dx, dz);
  const n = Math.ceil(length / 1.2),
    pitch = length / n;
  // Colour variation supplies joints with no individual tile meshes or textures.
  for (let i = 0; i < n; i++)
    for (let side = -1; side <= 1; side++) {
      const along = (i + 0.5) * pitch,
        across = (side * path.width) / 3;
      const g = new THREE.PlaneGeometry(path.width / 3 - 0.014, pitch - 0.014, 1, 1)
        .rotateX(-Math.PI / 2)
        .rotateY(angle)
        .translate(
          path.start[0] + Math.sin(angle) * along + Math.cos(angle) * across,
          0,
          path.start[1] + Math.cos(angle) * along - Math.sin(angle) * across
        );
      for (const tile of outsideFinishedSurfaces(g, courts)) {
        const p = tile.getAttribute('position');
        for (let j = 0; j < p.count; j++) p.setY(j, ground(p.getX(j), p.getZ(j)));
        tile.computeVertexNormals();
        b.add(
          tile,
          yard ? (i % 3 === 0 ? '#a4967a' : '#9a8b71') : i % 3 === 0 ? '#a39e8d' : P.paving
        );
      }
    }
}
function wall(
  b: PlotGeometry,
  a: readonly [number, number],
  c: readonly [number, number],
  height = 0.65,
  ground: Ground = flat
) {
  const dx = c[0] - a[0],
    dz = c[1] - a[1],
    length = Math.hypot(dx, dz),
    yaw = Math.atan2(dx, dz);
  const count = Math.ceil(length / 2);
  for (let i = 0; i < count; i++) {
    const x = a[0] + (dx * (i + 0.5)) / count,
      z = a[1] + (dz * (i + 0.5)) / count;
    const y = ground(x, z);
    b.box([0.36, height, length / count + 0.004], [x, y + height / 2, z], P.brick, yaw);
    b.box([0.48, 0.11, length / count - 0.014], [x, y + height + 0.055, z], P.stone, yaw);
  }
  for (const [x, z] of [a, c]) {
    const y = ground(x, z);
    b.box([0.5, height + 0.18, 0.5], [x, y + (height + 0.18) / 2, z], P.brick);
    b.box([0.61, 0.12, 0.61], [x, y + height + 0.24, z], P.stone);
  }
}
function planter(
  b: PlotGeometry,
  x: number,
  z: number,
  width: number,
  depth: number,
  ground: Ground = flat
) {
  const y = ground(x, z);
  b.box([width, 0.26, depth], [x, y + 0.13, z], P.brick);
  b.box([width - 0.17, 0.035, depth - 0.17], [x, y + 0.282, z], P.soil);
  const count = Math.max(2, Math.floor(width / 0.55));
  for (let i = 0; i < count; i++) {
    const px = x - width / 2 + 0.28 + (i * (width - 0.56)) / (count - 1);
    b.round([px, y + 0.47, z], [0.35, 0.25, depth * 0.4], P.leaf);
    if (i % 2 === 0) b.round([px, y + 0.67, z], [0.15, 0.11, 0.15], '#b49cbd');
  }
}
function bench(b: PlotGeometry, x: number, z: number, yaw = 0, ground: Ground = flat) {
  const start = b.parts.length;
  b.box([1.8, 0.12, 0.5], [0, 0.48, 0], P.oak);
  b.box([1.8, 0.38, 0.1], [0, 0.77, -0.24], P.oak);
  for (const side of [-1, 1]) b.box([0.11, 0.46, 0.44], [side * 0.66, 0.23, 0], P.iron);
  b.parts.slice(start).forEach((g) => g.rotateY(yaw).translate(x, ground(x, z), z));
}
function drain(
  b: PlotGeometry,
  x: number,
  z: number,
  length: number,
  yaw = 0,
  ground: Ground = flat
) {
  const start = b.parts.length;
  b.box([0.22, 0.025, length], [0, 0.004, 0], P.iron);
  for (let i = 0; i < Math.floor(length / 0.3); i++)
    b.box([0.2, 0.016, 0.045], [0, 0.025, -length / 2 + 0.16 + i * 0.3], P.slate);
  b.parts.slice(start).forEach((g) => g.rotateY(yaw).translate(x, ground(x, z), z));
}

function villageRealm() {
  const paving = new PlotGeometry(),
    solid = new PlotGeometry();
  VILLAGE_REALM_PATHS.forEach((p) => route(paving, p));
  // Shop thresholds and square margins bring the frontages into one civic room.
  for (const z of [-10, 5]) patch(paving, 16.2, z, 2.5, 6.3, P.paving);
  patch(paving, -16.2, 30, 2.3, 6.2, P.paving);
  for (const x of [-14.8, 14.8]) {
    patch(paving, x, 4, 0.35, 29, P.brick);
    drain(solid, x, 4, 20);
  }
  patch(paving, 0, -10.65, 29.7, 0.36, P.brick);
  patch(paving, 0, 10.5, 12.8, 1.4, P.paving);
  // A calm central rectangle frames the fountain and markets, with open ends.
  for (const z of [-0.7, 12.6]) patch(paving, 0, z, 23, 0.32, P.stone);
  for (const x of [-11.5, 11.5]) patch(paving, x, 5.95, 0.32, 13, P.stone);
  // Churchyard enclosure. Broad gate aligns with the actual front portal.
  wall(solid, [-9.4, -50.6], [-9.4, -29], 0.68);
  wall(solid, [9.4, -50.6], [9.4, -29], 0.68);
  wall(solid, [-9.4, -50.6], [9.4, -50.6], 0.68);
  wall(solid, [-9.4, -29], [-2.4, -29], 0.68);
  wall(solid, [2.4, -29], [9.4, -29], 0.68);
  for (const x of [-7.65, 7.65]) {
    planter(solid, x, -32.2, 1.8, 2.3);
    bench(solid, x, -38, x < 0 ? Math.PI / 2 : -Math.PI / 2);
  }
  // Pub courtyard at its street-facing side, with a gap to the entrance.
  patch(paving, -18.45, -15, 3, 13.5, P.paving);
  wall(solid, [-32.1, -22.1], [-18, -22.1], 0.52);
  wall(solid, [-32.1, -7.9], [-18, -7.9], 0.52);
  wall(solid, [-32.1, -22.1], [-32.1, -7.9], 0.52);
  for (const z of [-20.5, -9.5]) {
    planter(solid, -19.1, z, 2, 1);
    bench(solid, -18.7, z + (z < -15 ? 1.25 : -1.25), Math.PI / 2);
  }
  // School's front playground and boundary, clear of the adjacent cottage.
  patch(paving, 15.2, 40, 2.1, 10.8, P.paving);
  wall(solid, [14.1, 32.1], [29, 32.1], 0.44);
  wall(solid, [14.1, 47.9], [29, 47.9], 0.44);
  wall(solid, [29, 32.1], [29, 47.9], 0.44);
  planter(solid, 26.5, 33, 2.1, 0.95);
  planter(solid, 26.5, 47, 2.1, 0.95);
  // Square planting occupies edges, with no planters in through streets.
  for (const x of [-6.4, 6.4]) planter(solid, x, -9.4, 2.7, 1.1);
  for (const z of [-16, 9.8]) planter(solid, 17.1, z, 1.15, 1.1);
  return { paving: paving.finish(), solid: solid.finish() };
}
export const VILLAGE_REALM_GEOMETRY = villageRealm();

export function createWorldRealm(segments: number) {
  const ground: Ground = (x, z) =>
    EXTERIOR_LAYERS.ground + sampleTerrainGroundHeight(x, z, segments);
  const paving = new PlotGeometry(),
    solid = new PlotGeometry();
  const finished: RealmPatch[] = [...WORLD_REALM_PATCHES];
  for (const p of WORLD_REALM_PATHS) {
    route(paving, p, ground, false, finished);
    const horizontal = p.start[1] === p.end[1];
    finished.push({
      x: (p.start[0] + p.end[0]) / 2,
      z: (p.start[1] + p.end[1]) / 2,
      halfX: Math.abs(p.end[0] - p.start[0]) / 2 + (horizontal ? 0 : p.width / 2),
      halfZ: Math.abs(p.end[1] - p.start[1]) / 2 + (horizontal ? p.width / 2 : 0),
    });
  }
  for (const r of WORLD_REALM_PATCHES)
    patch(paving, r.x, r.z, r.halfX * 2, r.halfZ * 2, P.paving, ground);
  const bridge = CANAL_FOOTBRIDGE_ACCESS;
  for (const step of CANAL_BRIDGE_STEPS) {
    const x = (step.minX + step.maxX) / 2;
    solid.box(
      [step.maxX - step.minX, step.top + 0.02 - 0.06, bridge.halfWidth * 2],
      [x, (step.top - 0.06 - 0.02) / 2, bridge.z],
      P.brick
    );
    solid.box(
      [step.maxX - step.minX, 0.06, bridge.halfWidth * 2],
      [x, step.top - 0.03, bridge.z],
      P.stone
    );
  }
  for (const edge of [bridge.minX, bridge.maxX]) {
    const side = edge === bridge.minX ? -1 : 1;
    const outer = edge + side * bridge.steps * bridge.going;
    for (const z of [bridge.z - 1.39, bridge.z + 1.39]) {
      solid.beam([outer, 0.97, z], [edge, bridge.deckY + 0.9, z], 0.075, P.iron);
      for (const t of [0, 0.5, 1]) {
        const x = outer + (edge - outer) * t;
        const top = 0.97 + (bridge.deckY + 0.9 - 0.97) * t;
        const base =
          CANAL_BRIDGE_STEPS.find((s) => x >= s.minX - 1e-6 && x <= s.maxX + 1e-6)?.top ??
          bridge.deckY;
        solid.box([0.075, top - base, 0.075], [x, (top + base) / 2, z], P.iron);
      }
    }
  }
  // Interrupted towpath edging. Access points and the bridge are deliberately open.
  for (const [a, c] of [
    [-84, -62],
    [-46, 8],
    [24, 54],
    [65, 83],
  ] as const)
    wall(solid, [-156.3, a], [-156.3, c], 0.22, ground);
  for (const z of [14, 23]) planter(solid, -159, z, 2, 1, ground);
  // Low apron borders belong behind the station parking, never across its access.
  for (const [a, c] of [
    [-109, -101],
    [-92.9, -81],
  ] as const)
    wall(solid, [a, 123.75], [c, 123.75], 0.38, ground);
  for (const x of [-103, -91, -57, -33]) planter(solid, x, 123.75, 2.4, 1.3, ground);
  wall(solid, [-53, 118.2], [-47, 118.2], 0.25, ground);
  wall(solid, [-43, 118.2], [-37, 118.2], 0.25, ground);
  drain(solid, -80.2, 132.5, 6, Math.PI / 2, ground);
  // A finished quay uses actual coping-level rings; no decorative floating docks.
  for (const z of [9, 21]) {
    const g = new THREE.TorusGeometry(0.16, 0.045, 5, 10)
      .rotateX(Math.PI / 2)
      .translate(-151.1, 1.07, z);
    solid.add(g, P.iron);
  }
  return { paving: paving.finish(), solid: solid.finish() };
}
function farmRealm() {
  const paving = new PlotGeometry(),
    solid = new PlotGeometry();
  FARM_REALM_PATHS.forEach((p) => route(paving, p, flat, true));
  // A gravel shoulder joins the barn court to the working track and windmill.
  patch(paving, 5.3, -8.4, 8.7, 1.8, '#9a8b71');
  wall(solid, [5.7, -10.5], [5.7, -26.4], 0.28);
  wall(solid, [10.3, -10.5], [10.3, -13.5], 0.28);
  wall(solid, [10.3, -16.5], [10.3, -26.4], 0.28);
  // The farmhouse threshold has a low herb border, outside the animal paddock.
  planter(solid, -19.9, 12, 1.1, 3.6);
  planter(solid, -19.9, 18, 1.1, 3.6);
  drain(solid, 8, -27.3, 3.4, Math.PI / 2);
  return { paving: paving.finish(), solid: solid.finish() };
}
export const FARM_REALM_GEOMETRY = farmRealm();
function Realm({
  name,
  geometry,
}: {
  name: string;
  geometry: { paving: THREE.BufferGeometry; solid: THREE.BufferGeometry };
}) {
  return (
    <group name={name} dispose={null}>
      <mesh
        name={`${name}-paving`}
        geometry={geometry.paving}
        material={REALM_PAVING_MATERIAL}
        receiveShadow
      />
      <mesh
        name={`${name}-joinery`}
        geometry={geometry.solid}
        material={material}
        castShadow
        receiveShadow
      />
    </group>
  );
}
export const VillagePublicRealm = React.memo(() => (
  <Realm name="village-public-realm" geometry={VILLAGE_REALM_GEOMETRY} />
));
export const FarmPublicRealm = React.memo(() => (
  <Realm name="farm-public-realm" geometry={FARM_REALM_GEOMETRY} />
));
export function WorldPublicRealm() {
  const quality = useGraphicsStore((s) => s.graphics.quality);
  const segments = getTerrainGridSegments(quality);
  const geometry = useMemo(() => createWorldRealm(segments), [segments]);
  React.useEffect(
    () => () => {
      geometry.paving.dispose();
      geometry.solid.dispose();
    },
    [geometry]
  );
  return <Realm name="world-public-realm" geometry={geometry} />;
}
