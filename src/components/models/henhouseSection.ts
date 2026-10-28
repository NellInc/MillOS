import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const HENHOUSE_FLOOR_Y = Math.fround(-0.28);
export const HENHOUSE_ROOM = { backX: -0.446, frontX: 0.083, halfZ: 0.27 } as const;

/** Section the real room above the floor, retaining the complete deck and supports.
 * Working if upper positive-Z triangles disappear, lower triangles survive and
 * crossing UV/normal attributes interpolate without modifying cached resources.
 */
export function createHenhouseSection(source: THREE.BufferGeometry): THREE.BufferGeometry {
  if (
    !source.getAttribute('position') ||
    !source.getAttribute('normal') ||
    !source.getAttribute('uv')
  )
    throw new Error('Henhouse section requires authored position, normal and UV attributes');
  const fields = Object.entries(source.attributes).map(([name, attribute]) => ({
    name,
    attribute,
    offset: 0,
    size: attribute.itemSize,
    values: [] as number[],
  }));
  let stride = 0;
  for (const field of fields) {
    field.offset = stride;
    stride += field.size;
  }
  const p = fields.find((field) => field.name === 'position')!.offset;
  const n = fields.find((field) => field.name === 'normal')!.offset;
  const read = (id: number) => {
    const result = new Array<number>(stride);
    for (const field of fields)
      for (let k = 0; k < field.size; k++)
        result[field.offset + k] = field.attribute.getComponent(id, k);
    return result;
  };
  const clip = (polygon: number[][], axis: number, plane: number, sign: number) => {
    const output: number[][] = [];
    if (!polygon.length) return output;
    let a = polygon.at(-1)!;
    let insideA = sign * (a[p + axis] - plane) <= 0;
    for (const b of polygon) {
      const insideB = sign * (b[p + axis] - plane) <= 0;
      if (insideA !== insideB) {
        const t = (plane - a[p + axis]) / (b[p + axis] - a[p + axis]);
        const v = a.map((value, k) => value + (b[k] - value) * t);
        for (let k = 0; k < 3; k++) v[p + k] = Math.fround(v[p + k]);
        v[p + axis] = plane;
        const length = Math.hypot(v[n], v[n + 1], v[n + 2]);
        if (length) for (let k = 0; k < 3; k++) v[n + k] /= length;
        output.push(v);
      }
      if (insideB) output.push(b);
      a = b;
      insideA = insideB;
    }
    return output;
  };
  const emit = (polygon: number[][]) => {
    for (let i = 1; i + 1 < polygon.length; i++) {
      const [a, b, c] = [polygon[0], polygon[i], polygon[i + 1]];
      const ab = [b[p] - a[p], b[p + 1] - a[p + 1], b[p + 2] - a[p + 2]];
      const ac = [c[p] - a[p], c[p + 1] - a[p + 1], c[p + 2] - a[p + 2]];
      if (
        Math.hypot(
          ab[1] * ac[2] - ab[2] * ac[1],
          ab[2] * ac[0] - ab[0] * ac[2],
          ab[0] * ac[1] - ab[1] * ac[0]
        ) < 1e-12
      )
        continue;
      for (const vertex of [a, b, c])
        for (const field of fields)
          for (let k = 0; k < field.size; k++) field.values.push(vertex[field.offset + k]);
    }
  };
  const count = source.index?.count ?? source.getAttribute('position').count;
  for (let i = 0; i < count; i += 3) {
    const triangle = [0, 1, 2].map((k) => read(source.index?.getX(i + k) ?? i + k));
    if (triangle.every((v) => v[p + 1] <= HENHOUSE_FLOOR_Y + 1e-7)) {
      emit(triangle);
      continue;
    }
    if (triangle.every((v) => v[p + 1] >= HENHOUSE_FLOOR_Y)) {
      emit(clip(triangle, 2, 0, 1));
      continue;
    }
    emit(clip(triangle, 1, HENHOUSE_FLOOR_Y, 1));
    emit(clip(clip(triangle, 1, HENHOUSE_FLOOR_Y, -1), 2, 0, 1));
  }
  const geometry = new THREE.BufferGeometry();
  for (const field of fields)
    geometry.setAttribute(field.name, new THREE.Float32BufferAttribute(field.values, field.size));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.name = 'henhouse-real-architectural-section';
  return geometry;
}

/** The cached source graph, maps and geometry remain untouched. */
export function prepareHenhouseSection(source: THREE.Object3D) {
  const model = source.clone(true);
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  let frame: THREE.Matrix4 | null = null;
  model.updateMatrixWorld(true);
  model.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (frame) throw new Error('Henhouse section expects the single authored CoopBody mesh');
    frame = mesh.matrixWorld.clone();
    mesh.geometry = createHenhouseSection(mesh.geometry);
    geometries.push(mesh.geometry);
    const cloneMaterial = (sourceMaterial: THREE.Material) => {
      const material = sourceMaterial.clone();
      material.side = THREE.FrontSide;
      materials.push(material);
      return material;
    };
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map(cloneMaterial)
      : cloneMaterial(mesh.material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
  if (!frame) throw new Error('Henhouse needs a loaded generated CoopBody');
  return {
    model,
    frame: frame as THREE.Matrix4,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}

/** Metre-authored joinery and dry nesting material, kept below 4,000 triangles. */
export function createHenhouseInterior(scale: number) {
  const parts = {
    wood: [] as THREE.BufferGeometry[],
    straw: [] as THREE.BufferGeometry[],
    egg: [] as THREE.BufferGeometry[],
    metal: [] as THREE.BufferGeometry[],
    water: [] as THREE.BufferGeometry[],
    lens: [] as THREE.BufferGeometry[],
  };
  type Kind = keyof typeof parts;
  const add = (
    kind: Kind,
    geometry: THREE.BufferGeometry,
    position: THREE.Vector3Tuple,
    rotation: THREE.Vector3Tuple = [0, 0, 0]
  ) => {
    geometry.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rotation)));
    geometry.translate(...position);
    geometry.scale(scale, scale, scale);
    const plain = geometry.index ? geometry.toNonIndexed() : geometry;
    if (plain !== geometry) geometry.dispose();
    parts[kind].push(plain);
  };
  const box = (kind: Kind, p: THREE.Vector3Tuple, size: THREE.Vector3Tuple) =>
    add(kind, new THREE.BoxGeometry(...size), p);
  // Genuine back-wall lining and cut returns stop just inside the existing shell.
  box('wood', [-0.433, -0.055, -0.128], [0.009, 0.43, 0.25]);
  box('wood', [-0.18, -0.055, -0.257], [0.49, 0.43, 0.009]);
  box('wood', [-0.435, 0.061, -0.004], [0.014, 0.682, 0.014]);
  // Front return begins above the real entrance lintel, never through its opening.
  box('wood', [0.073, 0.237, -0.004], [0.014, 0.344, 0.014]);
  box('wood', [-0.18, 0.402, -0.004], [0.52, 0.014, 0.018]);
  // Two sheltered nest boxes against the back wall, open toward the section.
  for (const x of [-0.335, -0.17]) {
    box('wood', [x, -0.247, -0.177], [0.15, 0.012, 0.135]);
    box('wood', [x, -0.145, -0.177], [0.155, 0.012, 0.14]);
    for (const side of [-1, 1])
      box('wood', [x + side * 0.073, -0.196, -0.177], [0.009, 0.1, 0.135]);
    box('wood', [x, -0.227, -0.108], [0.15, 0.024, 0.009]);
    add(
      'straw',
      new THREE.TorusGeometry(0.043, 0.009, 4, 16),
      [x, -0.233, -0.176],
      [Math.PI / 2, 0, 0]
    );
    for (let i = 0; i < 18; i++) {
      const a = i * 2.399963;
      const radius = 0.018 + (i % 4) * 0.008;
      add(
        'straw',
        new THREE.BoxGeometry(0.035, 0.0015, 0.0014),
        [x + Math.cos(a) * radius, -0.232 + (i % 3) * 0.001, -0.176 + Math.sin(a) * radius],
        [0, a, 0]
      );
    }
  }
  for (const [x, z] of [
    [-0.347, -0.175],
    [-0.322, -0.185],
    [-0.17, -0.175],
  ])
    add('egg', new THREE.SphereGeometry(0.009, 10, 6).scale(0.8, 1.2, 0.8), [x, -0.221, z]);
  // A supported narrow perch occupies the rear half, leaving the +X exit clear.
  add(
    'wood',
    new THREE.CylinderGeometry(0.009, 0.009, 0.36, 10),
    [-0.19, -0.126, -0.045],
    [0, 0, Math.PI / 2]
  );
  for (const x of [-0.35, -0.03]) box('wood', [x, -0.202, -0.045], [0.014, 0.15, 0.018]);
  for (const [x, z] of [
    [-0.3, 0.155],
    [-0.14, 0.155],
  ]) {
    add('metal', new THREE.CylinderGeometry(0.034, 0.026, 0.022, 20, 1, true), [x, -0.257, z]);
    add(x < -0.2 ? 'straw' : 'water', new THREE.CylinderGeometry(0.03, 0.03, 0.003, 20), [
      x,
      -0.249,
      z,
    ]);
  }
  box('metal', [-0.18, 0.11, -0.21], [0.045, 0.018, 0.025]);
  box('lens', [-0.18, 0.098, -0.21], [0.034, 0.005, 0.018]);
  return Object.fromEntries(
    Object.entries(parts).map(([name, items]) => {
      const geometry = mergeGeometries(items, false)!;
      items.forEach((item) => item.dispose());
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      return [name, geometry];
    })
  ) as Record<Kind, THREE.BufferGeometry>;
}

export interface HenhouseTime {
  source: number;
  admitted: number;
}
/** Uses only admitted simulation seconds; holds never accumulate catch-up motion. */
export function sampleHenhouseTime(
  previous: HenhouseTime,
  source: number,
  running: boolean
): number {
  return previous.admitted + (running ? Math.max(0, source - previous.source) : 0);
}
export function sampleHenhouseGrain(t: number, out: THREE.Vector3): THREE.Vector3 {
  const u = ((t % 1) + 1) % 1;
  return out.set(-0.3 + u * 0.018, -0.246 + Math.sin(u * Math.PI) * 0.009, 0.155 - u * 0.045);
}
