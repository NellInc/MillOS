import * as THREE from 'three';

/** The actual precision tower's longitudinal section, in its retained raw frame. */
export const WINDMILL_SECTION_Z = Math.fround(0.006);
const HUB_Y = 0.0948;
const HUB_Z = 0.031;
const CLOSED_LIDS = [-0.438, 0.075, 0.065, 0.091];

/** Clip architecture, never the moving rotor or its fixed bearing. New wall
 * lining/section returns belong to the interior assembly. No global clipping,
 * shader discard or source mutation. Working if crossing triangles retain
 * interpolated UVs/normals and every original rotor triangle survives exactly.
 */
export function createWindmillCutawayGeometry(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const position = source.getAttribute('position');
  const weights = source.getAttribute('aSailWeight');
  if (!position || !source.getAttribute('normal') || !source.getAttribute('uv') || !weights)
    throw new Error('Windmill section needs the authored position/normal/UV/rotor attributes');
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
  const normal = fields.find((field) => field.name === 'normal')!.offset;
  const read = (index: number) => {
    const vertex = new Array<number>(stride);
    for (const field of fields)
      for (let k = 0; k < field.size; k++)
        vertex[field.offset + k] = field.attribute.getComponent(index, k);
    return vertex;
  };
  const emit = (vertices: number[][]) => {
    for (const vertex of vertices)
      for (const field of fields)
        for (let k = 0; k < field.size; k++) field.values.push(vertex[field.offset + k]);
  };
  const intersection = (a: number[], b: number[]) => {
    const t = (WINDMILL_SECTION_Z - a[p + 2]) / (b[p + 2] - a[p + 2]);
    const vertex = a.map((value, k) => value + (b[k] - value) * t);
    // Test degeneracy in the Float32 representation we actually upload.
    // Otherwise near-plane vertices can become identical only after emission.
    for (let k = 0; k < 3; k++) vertex[p + k] = Math.fround(vertex[p + k]);
    vertex[p + 2] = WINDMILL_SECTION_Z;
    const length = Math.hypot(vertex[normal], vertex[normal + 1], vertex[normal + 2]);
    if (length > 0) for (let k = 0; k < 3; k++) vertex[normal + k] /= length;
    return vertex;
  };
  const count = source.index?.count ?? position.count;
  for (let i = 0; i < count; i += 3) {
    const ids = [0, 1, 2].map((k) => source.index?.getX(i + k) ?? i + k);
    const rotor = ids.map((id) => weights.getX(id));
    if (!rotor.every((weight) => weight === rotor[0]) || ![0, 1].includes(rotor[0]))
      throw new Error('Windmill section requires rigid, unblended rotor triangles');
    const triangle = ids.map(read);
    const bearing = triangle.every(
      (v) => v[p] > 0.166 && Math.hypot(v[p + 1] - HUB_Y, v[p + 2] - HUB_Z) < 0.028
    );
    if (rotor[0] === 1 || bearing) {
      emit(triangle);
      continue;
    }
    // The source cylinders/lathe have solid horizontal lids. A working shaft
    // cannot pass through those discs; the interior supplies real floor/curb rims.
    if (CLOSED_LIDS.some((y) => triangle.every((v) => Math.abs(v[p + 1] - y) < 1e-6))) continue;
    const polygon: number[][] = [];
    let previous = triangle[2];
    let previousInside = previous[p + 2] <= WINDMILL_SECTION_Z;
    for (const vertex of triangle) {
      const inside = vertex[p + 2] <= WINDMILL_SECTION_Z;
      if (inside !== previousInside) polygon.push(intersection(previous, vertex));
      if (inside) polygon.push(vertex);
      previous = vertex;
      previousInside = inside;
    }
    for (let k = 1; k + 1 < polygon.length; k++) {
      const [a, b, c] = [polygon[0], polygon[k], polygon[k + 1]];
      const ab = [b[p] - a[p], b[p + 1] - a[p + 1], b[p + 2] - a[p + 2]];
      const ac = [c[p] - a[p], c[p + 1] - a[p + 1], c[p + 2] - a[p + 2]];
      if (
        Math.hypot(
          ab[1] * ac[2] - ab[2] * ac[1],
          ab[2] * ac[0] - ab[0] * ac[2],
          ab[0] * ac[1] - ab[1] * ac[0]
        ) > 1e-12
      )
        emit([a, b, c]);
    }
  }
  const geometry = new THREE.BufferGeometry();
  for (const field of fields)
    geometry.setAttribute(field.name, new THREE.Float32BufferAttribute(field.values, field.size));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.name = 'windmill-architectural-section';
  return geometry;
}
