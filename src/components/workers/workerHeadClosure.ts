import * as THREE from 'three';
import { deinterleaveGeometry } from 'three/addons/utils/BufferGeometryUtils.js';

const BASE = ['position', 'normal', 'uv', 'skinIndex', 'skinWeight'] as const;
const SIZES = { position: 3, normal: 3, uv: 2, skinIndex: 4, skinWeight: 4 } as const;
const RIM_TOLERANCE = 0.00005; // Separate Draco primitives differ by at most18 micrometres.
const CROWN_PIVOT = 0.18;
const CROWN_TOP = 0.203;

/** Fit the existing cuts over the actual restored head, not its former hole.
 * Working if every covered crown sample has at least2mm of outer-hair clearance.
 * The same affine mount carries cap, elastic, tail and its existing private motion.
 */
export const WORKER_HAIR_FIT = {
  offsetY: -0.008,
  masculine: { short: 1.28, medium: 1.22, curly: 1.22, ponytail: 1.28 },
  feminine: { short: 1.2, medium: 1.16, curly: 1.18, ponytail: 1.2 },
} as const;

function topology(mesh: THREE.SkinnedMesh, head: THREE.Object3D) {
  const geometry = mesh.geometry;
  const points: THREE.Vector3[] = [],
    representatives: number[] = [],
    ids: number[] = [];
  const welded = new Map<string, number>(),
    point = new THREE.Vector3();
  const inverse = head.matrixWorld.clone().invert();
  for (let i = 0; i < geometry.attributes.position.count; i++) {
    mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);
    if (!point.toArray().every(Number.isFinite)) return null;
    const key = point
      .toArray()
      .map((v) => Math.round(v * 1e6))
      .join(',');
    let id = welded.get(key);
    if (id === undefined) {
      id = points.length;
      welded.set(key, id);
      points.push(point.clone());
      representatives.push(i);
    }
    ids.push(id);
  }
  const parents = points.map((_, i) => i);
  const root = (i: number): number => {
    while (parents[i] !== i) i = parents[i];
    return i;
  };
  const edges = new Map<string, { a: number; b: number; count: number; consistent: boolean }>();
  const triangles: number[][] = [];
  for (let i = 0; i < geometry.index!.count; i += 3) {
    const vertices = [0, 1, 2].map((c) => geometry.index!.getX(i + c));
    const weldedIds = vertices.map((id) => ids[id]);
    if (new Set(weldedIds).size !== 3) return null;
    triangles.push(vertices);
    for (let c = 0; c < 3; c++) {
      const a = weldedIds[c],
        b = weldedIds[(c + 1) % 3];
      parents[root(a)] = root(b);
      const key = [a, b].sort((x, y) => x - y).join(',');
      const edge = edges.get(key);
      if (edge) {
        edge.count++;
        edge.consistent &&= edge.a === b && edge.b === a;
      } else edges.set(key, { a, b, count: 1, consistent: true });
    }
  }
  return { points, representatives, ids, root, edges, triangles };
}

/** Restore the real complementary scalp as skin, in the incumbent head draw.
 * Working if the original softened/coloured Skin prefix stays byte-exact,
 * the snapped rim deforms identically, bald heads close, and cached donors survive.
 */
export function createWorkerHeadClosure(
  skin: THREE.SkinnedMesh,
  donor: THREE.SkinnedMesh,
  head: THREE.Object3D
): THREE.BufferGeometry | null {
  const original = skin.geometry,
    hair = donor.geometry;
  const attributes = Object.keys(original.attributes);
  const compatible =
    original.index &&
    hair.index &&
    !original.groups.length &&
    !hair.groups.length &&
    !Object.keys(original.morphAttributes).length &&
    !Object.keys(hair.morphAttributes).length &&
    attributes.every((name) => [...BASE, 'color'].includes(name)) &&
    BASE.every(
      (name) =>
        original.hasAttribute(name) &&
        hair.hasAttribute(name) &&
        original.attributes[name].itemSize === SIZES[name] &&
        hair.attributes[name].itemSize === SIZES[name]
    ) &&
    skin.bindMode === donor.bindMode &&
    skin.matrixWorld.equals(donor.matrixWorld) &&
    skin.bindMatrix.equals(donor.bindMatrix) &&
    skin.bindMatrixInverse.equals(donor.bindMatrixInverse) &&
    skin.skeleton.bones.length === donor.skeleton.bones.length &&
    skin.skeleton.bones.every(
      (bone, i) =>
        bone === donor.skeleton.bones[i] &&
        skin.skeleton.boneInverses[i].equals(donor.skeleton.boneInverses[i])
    );
  const headIndex = skin.skeleton.bones.indexOf(head as THREE.Bone);
  if (!compatible || headIndex < 0) return null;
  for (const geometry of [original, hair]) {
    if (geometry.index!.count % 3) return null;
    for (let i = 0; i < geometry.index!.count; i++) {
      const vertex = geometry.index!.getX(i);
      if (!Number.isInteger(vertex) || vertex < 0 || vertex >= geometry.attributes.position.count)
        return null;
    }
    for (const name of BASE) {
      const attribute = geometry.attributes[name];
      if (attribute.count !== geometry.attributes.position.count) return null;
      for (let i = 0; i < attribute.count; i++)
        for (let c = 0; c < attribute.itemSize; c++)
          if (!Number.isFinite(attribute.getComponent(i, c))) return null;
    }
    for (let i = 0; i < geometry.attributes.position.count; i++) {
      let total = 0;
      for (let c = 0; c < 4; c++) {
        const joint = geometry.attributes.skinIndex.getComponent(i, c);
        const weight = geometry.attributes.skinWeight.getComponent(i, c);
        if (
          !Number.isInteger(joint) ||
          joint < 0 ||
          joint >= skin.skeleton.bones.length ||
          !Number.isFinite(weight) ||
          weight < 0
        )
          return null;
        total += weight;
      }
      if (Math.abs(total - 1) > 0.00001) return null;
    }
  }
  const skinGraph = topology(skin, head),
    capGraph = topology(donor, head);
  if (!skinGraph || !capGraph) return null;
  const skinRim = new Set(
    [...skinGraph.edges.values()].filter((e) => e.count === 1).flatMap((e) => [e.a, e.b])
  );
  const components = new Map<number, number[][]>();
  for (const triangle of capGraph.triangles) {
    const id = capGraph.root(capGraph.ids[triangle[0]]);
    if (!components.has(id)) components.set(id, []);
    components.get(id)!.push(triangle);
  }
  const matches: Array<{ triangles: number[][]; seam: Map<number, number> }> = [];
  for (const [id, triangles] of components) {
    const edges = [...capGraph.edges.values()].filter((e) => capGraph.root(e.a) === id);
    const rim = edges.filter((e) => e.count === 1);
    if (
      edges.some((e) => e.count > 2 || !e.consistent) ||
      rim.length < 12 ||
      new Set(triangles.flat().map((v) => capGraph.ids[v])).size -
        edges.length +
        triangles.length !==
        1
    )
      continue;
    const seam = new Map<number, number>();
    for (const vertex of new Set(rim.flatMap((e) => [e.a, e.b]))) {
      const candidates = [...skinRim].filter(
        (other) => capGraph.points[vertex].distanceTo(skinGraph.points[other]) < RIM_TOLERANCE
      );
      if (candidates.length !== 1) break;
      seam.set(vertex, candidates[0]);
    }
    if (
      seam.size !== new Set(rim.flatMap((e) => [e.a, e.b])).size ||
      new Set(seam.values()).size !== seam.size
    )
      continue;
    const reversed = rim.every((edge) => {
      const a = seam.get(edge.a)!,
        b = seam.get(edge.b)!;
      const opposite = skinGraph.edges.get([a, b].sort((x, y) => x - y).join(','));
      return opposite?.count === 1 && opposite.a === b && opposite.b === a;
    });
    if (reversed) matches.push({ triangles, seam });
  }
  if (matches.length !== 1) return null;
  const { triangles, seam } = matches[0];
  const vertices = [...new Set(triangles.flat())];
  const crown = Math.max(...vertices.map((i) => capGraph.points[capGraph.ids[i]].y));
  const ratio = (CROWN_TOP - CROWN_PIVOT) / (crown - CROWN_PIVOT);
  if (!(ratio > 0.3 && ratio < 1)) return null;
  const intoHead = head.matrixWorld
    .clone()
    .invert()
    .multiply(skin.matrixWorld)
    .multiply(skin.bindMatrixInverse)
    .multiply(head.matrixWorld)
    .multiply(skin.skeleton.boneInverses[headIndex])
    .multiply(skin.bindMatrix);
  if (Math.abs(intoHead.determinant()) < 1e-12) return null;
  const fromHead = intoHead.clone().invert();
  const positions = new Map<number, THREE.Vector3>(),
    snapped = new Map<number, number>();
  for (const vertex of vertices) {
    const skinVertex = seam.get(capGraph.ids[vertex]);
    const point = new THREE.Vector3();
    if (skinVertex !== undefined) {
      const source = skinGraph.representatives[skinVertex];
      snapped.set(vertex, source);
      point.fromBufferAttribute(original.attributes.position, source);
    } else {
      const rest = capGraph.points[capGraph.ids[vertex]];
      point.fromBufferAttribute(hair.attributes.position, vertex);
      if (rest.y > CROWN_PIVOT) {
        for (let c = 0; c < 4; c++) {
          const weight = hair.attributes.skinWeight.getComponent(vertex, c);
          const joint = hair.attributes.skinIndex.getComponent(vertex, c);
          if (weight > 0.000001 && joint !== headIndex) return null;
        }
        const t = (rest.y - CROWN_PIVOT) / (crown - CROWN_PIVOT);
        // C1 at the pivot, with strictly positive slope: min=(4*ratio-1)/3.
        // The rim and mixed Head/Neck vertices never enter this crown-only map.
        const y =
          CROWN_PIVOT + (crown - CROWN_PIVOT) * (ratio * t + (1 - ratio) * t * (1 - t) ** 2);
        point.copy(rest).setY(y).applyMatrix4(fromHead);
      }
    }
    positions.set(vertex, point);
  }
  const normals = new Map<number, THREE.Vector3>();
  const cross = new THREE.Vector3(),
    along = new THREE.Vector3();
  for (const [a, b, c] of triangles) {
    cross
      .subVectors(positions.get(b)!, positions.get(a)!)
      .cross(along.subVectors(positions.get(c)!, positions.get(a)!));
    if (cross.lengthSq() < 1e-18) return null;
    const reference = new THREE.Vector3()
      .fromBufferAttribute(hair.attributes.normal, a)
      .add(new THREE.Vector3().fromBufferAttribute(hair.attributes.normal, b))
      .add(new THREE.Vector3().fromBufferAttribute(hair.attributes.normal, c));
    if (cross.dot(reference) <= 0) return null;
    for (const vertex of [a, b, c]) {
      const id = capGraph.ids[vertex];
      if (!normals.has(id)) normals.set(id, new THREE.Vector3());
      normals.get(id)!.add(cross);
    }
  }
  const result = original.clone();
  deinterleaveGeometry(result);
  const offset = original.attributes.position.count;
  const emitted = new Map(vertices.map((vertex, i) => [vertex, offset + i]));
  for (const [name, source] of Object.entries(result.attributes)) {
    const typed = source as THREE.BufferAttribute;
    const Constructor = typed.array.constructor as { new (length: number): THREE.TypedArray };
    const array = new Constructor((offset + vertices.length) * source.itemSize);
    array.set(typed.array);
    const attribute = new THREE.BufferAttribute(array, source.itemSize, source.normalized);
    const input = original.attributes[name] as THREE.BufferAttribute;
    attribute.name = input.name;
    const interleaved = original.attributes[name] as THREE.InterleavedBufferAttribute;
    attribute.setUsage(
      interleaved.isInterleavedBufferAttribute ? interleaved.data.usage : input.usage
    );
    attribute.gpuType = input.gpuType ?? THREE.FloatType;
    for (const vertex of vertices) {
      const index = emitted.get(vertex)!,
        skinVertex = snapped.get(vertex);
      if (skinVertex !== undefined) {
        const begin = skinVertex * source.itemSize;
        array.set(typed.array.subarray(begin, begin + source.itemSize), index * source.itemSize);
      } else if (name === 'position') {
        attribute.setXYZ(index, ...positions.get(vertex)!.toArray());
      } else if (name === 'normal') {
        const normal = normals.get(capGraph.ids[vertex])!.clone().normalize();
        attribute.setXYZ(index, normal.x, normal.y, normal.z);
      } else {
        for (let c = 0; c < source.itemSize; c++)
          attribute.setComponent(
            index,
            c,
            name === 'color' ? 1 : hair.attributes[name].getComponent(vertex, c)
          );
      }
    }
    result.setAttribute(name, attribute);
  }
  const Constructor = original.index!.array.constructor as {
    new (length: number): THREE.TypedArray;
  };
  const index = new Constructor(original.index!.count + triangles.length * 3);
  index.set(original.index!.array);
  triangles.flat().forEach((vertex, i) => {
    index[original.index!.count + i] = emitted.get(vertex)!;
  });
  result.setIndex(new THREE.BufferAttribute(index, 1));
  result.name = 'worker-closed-head-skin';
  result.userData.workerScalpClosure = {
    triangles: triangles.length,
    sourceVertices: offset,
    seam: [...snapped].map(([vertex, skinVertex]) => [emitted.get(vertex)!, skinVertex]),
  };
  result.computeBoundingBox();
  result.computeBoundingSphere();
  return result;
}
