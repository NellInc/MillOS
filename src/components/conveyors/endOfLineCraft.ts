import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { applyWorldSurface } from '../../utils/worldSurface';
import { EOL_INFEED, EOL_PALLETISER, EOL_WRAPPER } from './endOfLineLayout';

type Point = readonly [number, number, number];
type Role = 'frame' | 'guard' | 'steel' | 'dark' | 'film';

/** Painted sheet and extrusions are dielectric; only exposed hardware is metal.
 * Working if the original blue/yellow palette reads under the existing hall lights.
 */
export const END_OF_LINE_MATERIALS = {
  frame: applyWorldSurface(
    new THREE.MeshStandardMaterial({ name: 'eol-blue-paint', color: '#3d5466', roughness: 0.5 }),
    'painted'
  ),
  guard: applyWorldSurface(
    new THREE.MeshStandardMaterial({ name: 'eol-yellow-paint', color: '#d9a520', roughness: 0.55 }),
    'painted'
  ),
  steel: applyWorldSurface(
    new THREE.MeshStandardMaterial({
      name: 'eol-bare-steel',
      color: '#b7bfc2',
      roughness: 0.4,
      metalness: 1,
    }),
    'metal'
  ),
  dark: applyWorldSurface(
    new THREE.MeshStandardMaterial({ name: 'eol-dark-paint', color: '#2a3136', roughness: 0.6 }),
    'painted'
  ),
  film: new THREE.MeshStandardMaterial({ name: 'eol-film-roll', color: '#e7ecee', roughness: 0.3 }),
} as const;

/** One cached static assembly, in world metres. It owns no production or motion.
 * Closed construction parts are premerged by the five incumbent material roles.
 * Working if supports fit the published cell and every slide/bracket meets its neighbour.
 */
function createCraft(): Record<Role, THREE.BufferGeometry> {
  const parts: Record<Role, THREE.BufferGeometry[]> = {
    frame: [],
    guard: [],
    steel: [],
    dark: [],
    film: [],
  };
  const box = (role: Role, at: Point, size: Point) =>
    parts[role].push(new THREE.BoxGeometry(...size).translate(...at));
  const cover = (role: Role, at: Point, size: Point, radius: number) => {
    const raw = new RoundedBoxGeometry(...size, 1, radius);
    parts[role].push(mergeVertices(raw).translate(...at));
    raw.dispose();
  };
  const cylinder = (
    role: Role,
    at: Point,
    radius: number,
    depth: number,
    axis: 'y' | 'z',
    sides = 8
  ) => {
    const geometry = new THREE.CylinderGeometry(radius, radius, depth, sides);
    if (axis === 'z') geometry.rotateX(Math.PI / 2);
    parts[role].push(geometry.translate(...at));
  };
  // Eight-sided extrusion: true millimetre edge breaks, flat cut ends, no inflated bounds.
  const extrusion = (role: Role, at: Point, size: Point, axis: 'x' | 'y' | 'z', bevel = 0.008) => {
    const [u, v, depth] =
      axis === 'x'
        ? [size[2], size[1], size[0]]
        : axis === 'y'
          ? [size[0], size[2], size[1]]
          : [size[0], size[1], size[2]];
    const x = u / 2,
      y = v / 2,
      b = Math.min(bevel, u / 4, v / 4);
    const shape = new THREE.Shape(
      [
        [-x + b, -y],
        [x - b, -y],
        [x, -y + b],
        [x, y - b],
        [x - b, y],
        [-x + b, y],
        [-x, y - b],
        [-x, -y + b],
      ].map(([px, py]) => new THREE.Vector2(px, py))
    );
    const raw = new THREE.ExtrudeGeometry(shape, { depth, steps: 1, bevelEnabled: false });
    raw.clearGroups();
    raw.translate(0, 0, -depth / 2);
    if (axis === 'x') raw.rotateY(Math.PI / 2);
    else if (axis === 'y') raw.rotateX(-Math.PI / 2);
    parts[role].push(mergeVertices(raw).translate(...at));
    raw.dispose();
  };
  const lathe = (
    role: Role,
    at: Point,
    profile: readonly (readonly [number, number])[],
    sides: number
  ) => {
    const geometry = new THREE.LatheGeometry(
      profile.map(([r, y]) => new THREE.Vector2(r, y)),
      sides
    );
    // Lathe's zero-radius cap rings contain collapsed triangles; retain only real faces.
    const index = geometry.index!,
      position = geometry.getAttribute('position'),
      indices: number[] = [];
    const a = new THREE.Vector3(),
      b = new THREE.Vector3(),
      c = new THREE.Vector3();
    for (let i = 0; i < index.count; i += 3) {
      a.fromBufferAttribute(position, index.getX(i));
      b.fromBufferAttribute(position, index.getX(i + 1));
      c.fromBufferAttribute(position, index.getX(i + 2));
      if (b.sub(a).cross(c.sub(a)).lengthSq() > 1e-16)
        indices.push(index.getX(i), index.getX(i + 1), index.getX(i + 2));
    }
    geometry.setIndex(indices);
    parts[role].push(geometry.translate(...at));
  };

  const { minX, maxX, minZ, maxZ, top } = EOL_INFEED;
  const width = maxZ - minZ,
    length = maxX - minX,
    cz = (minZ + maxZ) / 2;
  for (const z of [minZ + 0.08, maxZ - 0.08])
    extrusion('frame', [(minX + maxX) / 2, top - 0.08, z], [length, 0.16, 0.08], 'x', 0.006);
  for (const x of [minX + 0.1, maxX - 0.1]) {
    for (const z of [minZ + 0.1, maxZ - 0.1]) {
      extrusion(
        'frame',
        [x, (top - 0.16 + 0.025) / 2, z],
        [0.07, top - 0.16 - 0.025, 0.07],
        'y',
        0.006
      );
      extrusion('dark', [x, 0.0225, z], [0.14, 0.045, 0.14], 'y', 0.015);
    }
    extrusion('frame', [x, 0.28, cz], [0.06, 0.06, width - 0.2], 'z', 0.005);
  }
  for (let i = 0; i < 8; i++) {
    const x = minX + 0.12 + (i * (length - 0.24)) / 7;
    cylinder('steel', [x, top - 0.05, cz], 0.05, width - 0.2, 'z', 12);
    for (const z of [minZ + 0.06, maxZ - 0.06])
      cylinder('steel', [x, top - 0.05, z], 0.035, 0.12, 'z');
  }

  const p = EOL_PALLETISER,
    px = (p.minX + p.maxX) / 2,
    pz = (p.minZ + p.maxZ) / 2;
  const railY = p.height,
    bridgeX = px + 0.15;
  for (const x of [p.minX + 0.07, p.maxX - 0.07])
    for (const z of [p.minZ + 0.07, p.maxZ - 0.07]) {
      extrusion('frame', [x, (0.035 + p.height) / 2, z], [0.105, p.height - 0.035, 0.105], 'y');
      extrusion('dark', [x, 0.0275, z], [0.14, 0.055, 0.14], 'y', 0.015);
    }
  for (const z of [p.minZ + 0.07, p.maxZ - 0.07])
    extrusion('frame', [px, railY, z], [p.maxX - p.minX, 0.18, 0.14], 'x');
  for (const x of [p.minX + 0.07, p.maxX - 0.07])
    extrusion('frame', [x, railY, pz], [0.14, 0.18, p.maxZ - p.minZ], 'z');
  extrusion('guard', [bridgeX, railY - 0.19, pz], [0.18, 0.2, p.maxZ - p.minZ - 0.2], 'z');
  for (const z of [p.minZ + 0.1, p.maxZ - 0.1])
    extrusion('dark', [bridgeX, railY - 0.075, z], [0.34, 0.1, 0.16], 'x');
  extrusion('dark', [bridgeX, 2.6, pz], [0.19, 0.66, 0.19], 'y', 0.012);
  extrusion('steel', [bridgeX, 2.2, pz], [0.12, 0.58, 0.12], 'y', 0.006);
  extrusion('dark', [bridgeX, 1.86, pz], [0.95, 0.16, 0.7], 'y', 0.028);
  cylinder('steel', [bridgeX, 1.955, pz], 0.105, 0.07, 'y', 12);
  for (const z of [p.minZ + 0.07, p.maxZ - 0.07])
    for (const y of [0.55, 1.1])
      extrusion('guard', [px, y + 0.025, z], [p.maxX - p.minX - 0.14, 0.05, 0.05], 'x', 0.005);

  const { table, mast } = EOL_WRAPPER;
  lathe(
    'dark',
    [table.x, 0, table.z],
    [
      [0, 0],
      [0.925, 0],
      [table.radius, 0.018],
      [table.radius, 0.092],
      [0.925, table.height],
      [0, table.height],
    ],
    32
  );
  extrusion('frame', [mast.x, 0.04, mast.z], [0.7, 0.08, 0.3], 'y', 0.025);
  extrusion('frame', [mast.x, mast.height / 2, mast.z], [0.2, mast.height, 0.2], 'y');
  // Two folded gussets seat inside the corrected base, not in a neighbouring aisle.
  for (const side of [-1, 1]) {
    const shape = new THREE.Shape([
      new THREE.Vector2(0, 0),
      new THREE.Vector2(side * 0.2, 0),
      new THREE.Vector2(0, 0.3),
    ]);
    const raw = new THREE.ExtrudeGeometry(shape, { depth: 0.035, steps: 1, bevelEnabled: false });
    raw.clearGroups();
    parts.frame.push(mergeVertices(raw).translate(mast.x + side * 0.085, 0.075, mast.z - 0.0175));
    raw.dispose();
  }
  cover('dark', [mast.x + 0.3, 0.65, mast.z], [0.32, 0.8, 0.28], 0.025);
  box('steel', [mast.x + 0.13, 0.65, mast.z], [0.1, 0.26, 0.18]);
  for (const side of [-1, 1])
    box('steel', [mast.x + side * 0.063, 1.34, mast.z + 0.107], [0.028, 2.34, 0.025]);
  extrusion('dark', [mast.x, 1.35, mast.z + 0.19], [0.27, 0.4, 0.22], 'y', 0.012);
  cover('guard', [mast.x, 1.35, mast.z + 0.24], [0.42, 0.62, 0.28], 0.025);
  const rollZ = mast.z + 0.44;
  lathe(
    'film',
    [mast.x, 1.35, rollZ],
    [
      [0.018, -0.25],
      [0.061, -0.25],
      [0.07, -0.235],
      [0.07, 0.235],
      [0.061, 0.25],
      [0.018, 0.25],
      [0.018, -0.25],
    ],
    16
  );
  cylinder('steel', [mast.x, 1.35, rollZ], 0.014, 0.62, 'y', 8);
  for (const side of [-1, 1]) {
    cylinder('steel', [mast.x, 1.35 + side * 0.257, rollZ], 0.032, 0.025, 'y');
    box('dark', [mast.x, 1.35 + side * 0.285, mast.z + 0.385], [0.09, 0.035, 0.17]);
  }

  return Object.fromEntries(
    Object.entries(parts).map(([role, pieces]) => {
      const merged = mergeGeometries(pieces, false);
      pieces.forEach((g) => g.dispose());
      if (!merged) throw new Error(`Cannot assemble end-of-line ${role}`);
      merged.name = `eol-fabrication-${role}`;
      merged.computeBoundingBox();
      merged.computeBoundingSphere();
      return [role, merged];
    })
  ) as Record<Role, THREE.BufferGeometry>;
}

export const END_OF_LINE_CRAFT = createCraft();
