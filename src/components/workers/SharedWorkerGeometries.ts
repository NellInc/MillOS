import * as THREE from 'three';
import {
  deinterleaveGeometry,
  mergeGeometries,
  toCreasedNormals,
} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/** Private civilian tailoring in the existing opaque body draw. All fittings
 * retain exact source-vertex skin weights, including the placket's centre seam.
 * Working if folds/fasteners remain seated through clips and the far merge,
 * without modifying cached bodies or adding a draw, texture or frame callback.
 */
export function createWorkerShirtTrim(source: THREE.SkinnedMesh, kind: 'collar' | 'shirt') {
  const original = source.geometry,
    names = ['position', 'normal', 'uv', 'skinIndex', 'skinWeight'];
  if (
    !original.index ||
    names.some((n) => !original.hasAttribute(n)) ||
    !(original.attributes.skinIndex.array instanceof Uint8Array)
  )
    return null;
  const neckIndex = source.skeleton.bones.findIndex((b) => b.name === 'Neck');
  if (neckIndex < 0) return null;
  const neck = new THREE.Vector3().setFromMatrixPosition(
    source.skeleton.boneInverses[neckIndex].clone().invert()
  );
  const a = original.attributes,
    positions: number[] = [],
    colours: number[] = [],
    uv: number[] = [],
    joints: number[] = [],
    weights: number[] = [],
    indices: number[] = [];
  const point = new THREE.Vector3(),
    normal = new THREE.Vector3(),
    triangle = new THREE.Triangle();
  const palette = (
    Array.isArray(source.material) ? source.material[0] : source.material
  ) as THREE.MeshStandardMaterial;
  const button = new THREE.Color('#bec1b1');
  button.setRGB(
    button.r / Math.max(0.001, palette.color.r),
    button.g / Math.max(0.001, palette.color.g),
    button.b / Math.max(0.001, palette.color.b)
  );
  function emit(id: number, delta: THREE.Vector3, tone: number | THREE.Color) {
    const index = positions.length / 3;
    point.fromBufferAttribute(a.position, id).add(delta);
    positions.push(...point.toArray());
    uv.push(a.uv.getX(id), a.uv.getY(id));
    for (let c = 0; c < 4; c++) {
      joints.push(a.skinIndex.getComponent(id, c));
      weights.push(a.skinWeight.getComponent(id, c));
    }
    colours.push(...(typeof tone === 'number' ? [tone, tone, tone] : tone.toArray()));
    return index;
  }
  function face(i: number, j: number, k: number, outward?: THREE.Vector3) {
    triangle.setFromPointsAndIndices(
      [i, j, k].map((n) => new THREE.Vector3().fromArray(positions, n * 3)),
      0,
      1,
      2
    );
    if (triangle.getArea() < 1e-12) return;
    if (outward && triangle.getNormal(new THREE.Vector3()).dot(outward) < 0) [j, k] = [k, j];
    indices.push(i, j, k);
  }
  const bounds = new THREE.Box3();
  for (let i = 0; i < a.position.count; i++)
    bounds.expandByPoint(point.fromBufferAttribute(a.position, i));
  const extent = Math.max(Math.abs(bounds.min.x), bounds.max.x),
    cache = new Map<number, number>();
  for (let i = 0; i < original.index.count; i += 3) {
    const ids = [0, 1, 2].map((c) => original.index!.getX(i + c)),
      points = ids.map((id) => new THREE.Vector3().fromBufferAttribute(a.position, id));
    triangle.set(points[0], points[1], points[2]);
    const centre = triangle.getMidpoint(new THREE.Vector3()),
      outward = triangle.getNormal(new THREE.Vector3());
    const collar =
      kind === 'collar' &&
      outward.z > 0.15 &&
      Math.abs(centre.x - neck.x) > 0.018 &&
      Math.abs(centre.x - neck.x) < 0.105 &&
      centre.y > neck.y - 0.062 &&
      centre.y < neck.y + 0.015 &&
      points.every((p) => p.y > neck.y - 0.09 && p.z > neck.z + 0.035);
    const side = Math.sign(centre.x),
      sleeve =
        kind === 'shirt' &&
        side !== 0 &&
        points.every((p) => p.x * side > extent - 0.05) &&
        centre.x * side > extent - 0.027;
    if (!collar && !sleeve) continue;
    const copy = ids.map((id) => {
      if (cache.has(id)) return cache.get(id)!;
      const x = a.position.getX(id),
        y = a.position.getY(id),
        t = THREE.MathUtils.clamp((Math.abs(x) - extent + 0.05) / 0.05, 0, 1);
      const fold = collar
        ? Math.exp(
            -(((Math.abs(x - neck.x) - 0.045) / 0.035) ** 2 + ((y - neck.y + 0.027) / 0.045) ** 2)
          )
        : Math.sin(t * Math.PI) ** 2;
      normal.fromBufferAttribute(a.normal, id).normalize();
      const index = emit(
        id,
        normal.clone().multiplyScalar(0.0008 + fold * (collar ? 0.004 : 0.002)),
        collar ? 1.04 + fold * 0.13 : 0.9 + fold * 0.14
      );
      cache.set(id, index);
      return index;
    });
    face(copy[0], copy[1], copy[2], outward);
  }
  const foldedTriangles = indices.length / 3;
  if (kind === 'shirt') {
    // Follow the actual central shirt seam. Moving an arbitrary interpolated
    // position with interpolated weights is a different deformation contract.
    const candidates = Array.from({ length: a.position.count }, (_, i) => i)
      .filter(
        (i) =>
          Math.abs(a.position.getX(i) - neck.x) < 0.003 &&
          a.position.getY(i) < neck.y - 0.009 &&
          a.position.getY(i) > neck.y - 0.12 &&
          a.position.getZ(i) > neck.z + 0.05
      )
      .sort((i, j) => a.position.getY(j) - a.position.getY(i));
    const rows: number[] = [];
    for (const id of candidates)
      if (!rows.some((other) => Math.abs(a.position.getY(other) - a.position.getY(id)) < 0.005))
        rows.push(id);
    if (rows.length < 3) return null;
    const strip = rows.map((id) =>
      [-1, 1].map((side) => {
        normal.fromBufferAttribute(a.normal, id).normalize();
        return emit(
          id,
          normal
            .clone()
            .multiplyScalar(0.0022)
            .add(new THREE.Vector3(side * 0.006, 0, 0)),
          side < 0 ? 0.87 : 1.04
        );
      })
    );
    const forward = new THREE.Vector3(0, 0, 1);
    for (let r = 0; r < rows.length - 1; r++) {
      face(strip[r][0], strip[r + 1][0], strip[r][1], forward);
      face(strip[r][1], strip[r + 1][0], strip[r + 1][1], forward);
    }
    const buttons = [rows[0], rows[Math.floor((rows.length - 1) / 2)], rows.at(-1)!];
    for (const id of buttons) {
      normal.fromBufferAttribute(a.normal, id).normalize();
      const right = new THREE.Vector3(0, 1, 0).cross(normal).normalize(),
        up = normal.clone().cross(right).normalize();
      const centre = emit(id, normal.clone().multiplyScalar(0.0044), button),
        ring = [];
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        ring.push(
          emit(
            id,
            normal
              .clone()
              .multiplyScalar(0.0024)
              .addScaledVector(right, Math.cos(angle) * 0.0028)
              .addScaledVector(up, Math.sin(angle) * 0.0028),
            button
          )
        );
      }
      for (let i = 0; i < 6; i++) face(centre, ring[i], ring[(i + 1) % 6], normal);
    }
  }
  if (!foldedTriangles) return null;
  const detail = new THREE.BufferGeometry();
  detail.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  detail.setAttribute(
    'normal',
    new THREE.Float32BufferAttribute(new Float32Array(positions.length), 3)
  );
  detail.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  detail.setAttribute('skinIndex', new THREE.Uint8BufferAttribute(joints, 4));
  detail.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  detail.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  detail.setIndex(indices);
  detail.computeVertexNormals();
  const base = original.clone();
  deinterleaveGeometry(base);
  for (const name of names) {
    const attribute = a[name];
    // Deinterleaving preserves logical components and the effective float GPU
    // contract. Interleaved attributes have no gpuType field; copying that
    // absence onto a plain attribute breaks the existing distant-body merge.
    (detail.attributes[name] as THREE.BufferAttribute).gpuType = (
      base.attributes[name] as THREE.BufferAttribute
    ).gpuType;
    detail.attributes[name].normalized = attribute.normalized;
  }
  if (!base.hasAttribute('color'))
    base.setAttribute(
      'color',
      new THREE.Float32BufferAttribute(new Float32Array(a.position.count * 3).fill(1), 3)
    );
  const result = mergeGeometries([base, detail]);
  base.dispose();
  detail.dispose();
  if (!result) return null;
  result.name = `worker-tailored-${kind}`;
  result.userData.workerTailoring = {
    kind,
    baseVertices: a.position.count,
    baseIndices: original.index.count,
    addedTriangles: indices.length / 3,
    foldedTriangles,
    attachment: 'source-vertex',
    maxDiscardedWeight: 0,
  };
  result.computeBoundingBox();
  result.computeBoundingSphere();
  return result;
}

/** A fitted laboratory coat extension on the delivered body's own skin.
 * Existing upper clothes remain the torso; sleeves borrow actual forearms,
 * and independent side panels leave real front/rear walking vents.
 * Working if sampling elbows and seated/walking hips retain cloth support,
 * with one private opaque draw and the incumbent two-draw distant body.
 */
export function createWorkerLabCoatGeometry(
  source: THREE.SkinnedMesh,
  onTriangle?: (triangle: number, donor: THREE.SkinnedMesh, face: number) => void
) {
  const bones = source.skeleton.bones;
  const rest = (name: string) => {
    const index = bones.findIndex((bone) => bone.name === name);
    return index < 0
      ? null
      : new THREE.Vector3().setFromMatrixPosition(
          source.skeleton.boneInverses[index].clone().invert()
        );
  };
  const hip = rest('Hips');
  if (!hip || bones.length > 256) return null;
  type Vertex = { p: THREE.Vector3; n: THREE.Vector3; weights: Map<number, number>; id?: number };
  type Face = {
    vertices: Vertex[];
    triangle: THREE.Triangle;
    leg: boolean;
    mesh: THREE.SkinnedMesh;
    face: number;
  };
  const trunk: Face[] = [],
    arms: Face[] = [];
  let shirtBottom = Infinity,
    sleeveEnd = 0;
  source.parent?.parent?.traverse((object) => {
    const mesh = object as THREE.SkinnedMesh;
    if (
      !mesh.isSkinnedMesh ||
      !/Worker_(Body|Legs)$/.test(mesh.parent?.name ?? '') ||
      !mesh.bindMatrix.equals(source.bindMatrix) ||
      !mesh.bindMatrixInverse.equals(source.bindMatrixInverse) ||
      !mesh.skeleton.bones.every(
        (bone, i) =>
          bone === bones[i] && mesh.skeleton.boneInverses[i].equals(source.skeleton.boneInverses[i])
      )
    )
      return;
    const a = mesh.geometry.attributes;
    if (!['position', 'normal', 'skinIndex', 'skinWeight'].every((key) => a[key])) return;
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (/^(White|LightBrown)(-|$)/.test(material.name)) {
      for (let i = 0; i < a.position.count; i++) {
        shirtBottom = Math.min(shirtBottom, a.position.getY(i));
        sleeveEnd = Math.max(sleeveEnd, Math.abs(a.position.getX(i)));
      }
    }
    const vertex = (id: number): Vertex => {
      const weights = new Map<number, number>();
      for (let k = 0; k < 4; k++) {
        const weight = a.skinWeight.getComponent(id, k);
        if (weight > 0) weights.set(a.skinIndex.getComponent(id, k), weight);
      }
      return {
        id,
        p: new THREE.Vector3().fromBufferAttribute(a.position, id),
        n: new THREE.Vector3().fromBufferAttribute(a.normal, id),
        weights,
      };
    };
    const index = mesh.geometry.index;
    for (let i = 0; i < (index?.count ?? a.position.count); i += 3) {
      const vertices = [0, 1, 2].map((c) => vertex(index?.getX(i + c) ?? i + c));
      const arm = vertices.some((v) =>
        [...v.weights].some(
          ([j, w]) => /UpperArm|LowerArm|Wrist|Finger/.test(bones[j].name) && w > 0.15
        )
      );
      const face = {
        mesh,
        face: i / 3,
        leg: mesh.parent?.name === 'Worker_Legs',
        vertices,
        triangle: new THREE.Triangle(
          ...(vertices.map((v) => v.p) as [THREE.Vector3, THREE.Vector3, THREE.Vector3])
        ),
      };
      if (!arm) trunk.push(face);
      else if (/^Skin(-|$)/.test(material.name)) arms.push(face);
    }
  });
  if (!Number.isFinite(shirtBottom) || !arms.length || !trunk.length) return null;
  const positions: number[] = [],
    colours: number[] = [],
    skin: number[] = [],
    weights: number[] = [],
    indices: number[] = [];
  let maxDiscardedWeight = 0;
  const emit = (p: THREE.Vector3, support: Map<number, number>, tone = 1) => {
    const ranked = [...support].filter(([, w]) => w > 1e-9).sort((a, b) => b[1] - a[1]);
    maxDiscardedWeight = Math.max(
      maxDiscardedWeight,
      ranked.slice(4).reduce((s, [, w]) => s + w, 0)
    );
    const kept = ranked.slice(0, 4),
      total = kept.reduce((s, [, w]) => s + w, 0);
    if (total <= 0) throw new Error('Laboratory coat requires real skin support');
    const id = positions.length / 3;
    positions.push(...p.toArray());
    colours.push(tone, tone, tone);
    for (let k = 0; k < 4; k++) {
      skin.push(kept[k]?.[0] ?? 0);
      weights.push((kept[k]?.[1] ?? 0) / total);
    }
    return id;
  };
  const blend = (a: Vertex, b: Vertex, t: number): Vertex => {
    const support = new Map<number, number>();
    for (const [j, w] of a.weights) support.set(j, w * (1 - t));
    for (const [j, w] of b.weights) support.set(j, (support.get(j) ?? 0) + w * t);
    return {
      p: a.p.clone().lerp(b.p, t),
      n: a.n.clone().lerp(b.n, t).normalize(),
      weights: support,
    };
  };
  const clipped = (
    polygon: Vertex[],
    limit: number,
    side: number,
    above: boolean,
    axis: 'x' | 'y' = 'x'
  ) => {
    const result: Vertex[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i],
        b = polygon[(i + 1) % polygon.length],
        da = (a.p[axis] * side - limit) * (above ? 1 : -1),
        db = (b.p[axis] * side - limit) * (above ? 1 : -1);
      if (da >= 0) result.push(a);
      if (da >= 0 !== db >= 0) result.push(blend(a, b, da / (da - db)));
    }
    return result;
  };
  const sleeves: { side: number; start: number; count: number; cuff: number; proximal: number }[] =
    [];
  for (const side of [-1, 1]) {
    const wrist = rest(side > 0 ? 'WristL' : 'WristR');
    if (!wrist) return null;
    const proximal = sleeveEnd - 0.032,
      cuff = Math.abs(wrist.x) - 0.014,
      start = positions.length / 3;
    const welded = new Map<string, number>();
    for (const face of arms) {
      if (face.vertices.some((v) => v.p.x * side < 0)) continue;
      const polygon = clipped(clipped(face.vertices, proximal, side, true), cuff, side, false);
      const ids = polygon.map((v) => {
        const seam = THREE.MathUtils.smoothstep(v.p.x * side, cuff - 0.014, cuff - 0.004);
        const shoulderOverlap =
          1 - THREE.MathUtils.smoothstep(v.p.x * side, proximal, proximal + 0.055);
        const p = v.p.clone().addScaledVector(v.n, 0.005 + shoulderOverlap * 0.004 + seam * 0.0015);
        const key =
          p
            .toArray()
            .map((n) => Math.round(n * 1e6))
            .join(',') +
          ':' +
          [...v.weights]
            .sort((a, b) => a[0] - b[0])
            .map(([j, w]) => `${j}:${Math.round(w * 1e6)}`)
            .join(',');
        const old = welded.get(key);
        if (old !== undefined) return old;
        const id = emit(p, v.weights, 1 - seam * 0.055);
        welded.set(key, id);
        return id;
      });
      for (let i = 1; i < ids.length - 1; i++) {
        onTriangle?.(indices.length / 3, face.mesh, face.face);
        indices.push(ids[0], ids[i], ids[i + 1]);
      }
    }
    sleeves.push({ side, start, count: positions.length / 3 - start, cuff, proximal });
  }
  const top = hip.y + 0.085,
    hem = hip.y - 0.28,
    ventTop = hip.y + 0.025;
  const tailStart = positions.length / 3;
  const tailFaces = trunk.filter((face) => face.leg);
  // Material islands duplicate vertices with different normals. A shared rest
  // normal field keeps their cloth offsets seated together, without touching
  // any source attribute or changing the source's actual skin support.
  const supportKey = (v: Vertex) =>
    v.p
      .toArray()
      .map((n) => Math.round(n * 1e5))
      .join(',') +
    ':' +
    [...v.weights]
      .sort((a, b) => a[0] - b[0])
      .map(([j, w]) => `${j}:${Math.round(w * 1e5)}`)
      .join(',');
  const normals = new Map<string, THREE.Vector3>();
  for (const face of tailFaces) {
    const normal = new THREE.Vector3()
      .subVectors(face.triangle.b, face.triangle.a)
      .cross(new THREE.Vector3().subVectors(face.triangle.c, face.triangle.a));
    for (const v of face.vertices) {
      const key = supportKey(v);
      if (!normals.has(key)) normals.set(key, new THREE.Vector3());
      normals.get(key)!.add(normal);
    }
  }
  for (const face of tailFaces)
    for (const v of face.vertices) v.n.copy(normals.get(supportKey(v))!).normalize();
  const shellFaces: number[] = [];
  const welded = new Map<string, number>();
  const pushTail = (face: Face, polygon: Vertex[], tone = 1, pocket = false) => {
    const ids = polygon.map((v) => {
      const radial = v.n.clone().setY(0);
      if (radial.lengthSq() < 0.001) radial.set(v.p.x - hip.x, 0, v.p.z - hip.z);
      radial.normalize();
      const flare = THREE.MathUtils.smoothstep(top - v.p.y, 0.02, 0.3);
      const p = v.p.clone().addScaledVector(radial, 0.004 + flare * 0.012 + (pocket ? 0.003 : 0));
      const key =
        p
          .toArray()
          .map((n) => Math.round(n * 1e6))
          .join(',') +
        ':' +
        tone +
        ':' +
        [...v.weights]
          .sort((a, b) => a[0] - b[0])
          .map(([j, w]) => `${j}:${Math.round(w * 1e6)}`)
          .join(',');
      const previous = welded.get(key);
      if (previous !== undefined) return previous;
      const id = emit(p, v.weights, tone);
      welded.set(key, id);
      return id;
    });
    for (let i = 1; i < ids.length - 1; i++) {
      const a = new THREE.Vector3().fromArray(positions, ids[0] * 3),
        b = new THREE.Vector3().fromArray(positions, ids[i] * 3),
        c = new THREE.Vector3().fromArray(positions, ids[i + 1] * 3);
      if (new THREE.Triangle(a, b, c).getArea() > 1e-12) {
        if (!pocket) shellFaces.push(indices.length / 3);
        onTriangle?.(indices.length / 3, face.mesh, face.face);
        indices.push(ids[0], ids[i], ids[i + 1]);
      }
    }
  };
  // The waist retains its continuous source topology. Lower coat tails remain
  // open medially, with separate front/rear vents and original thigh support.
  for (const face of tailFaces) {
    if (face.triangle.getMidpoint(new THREE.Vector3()).y <= top)
      pushTail(face, clipped(face.vertices, ventTop, 1, true, 'y'));
    for (const side of [-1, 1]) {
      const centre = face.triangle.getMidpoint(new THREE.Vector3()),
        normal = face.triangle.getNormal(new THREE.Vector3());
      if (
        centre.y < hip.y - 0.065 &&
        Math.abs(centre.x - hip.x) < 0.11 &&
        normal.x * side < -0.55 &&
        Math.abs(normal.x) > Math.abs(normal.z) * 1.4
      )
        continue;
      const lower = clipped(
        clipped(clipped(face.vertices, hem, 1, true, 'y'), ventTop, 1, false, 'y'),
        side * hip.x + 0.005,
        side,
        true
      );
      pushTail(face, lower);
      if (normal.z < 0.3) continue;
      const pocket = clipped(
        clipped(
          clipped(
            clipped(face.vertices, hip.y - 0.075, 1, true, 'y'),
            hip.y + 0.055,
            1,
            false,
            'y'
          ),
          side * hip.x + 0.055,
          side,
          true
        ),
        side * hip.x + 0.14,
        side,
        false
      );
      pushTail(face, pocket, 1.035, true);
      pushTail(face, clipped(pocket, hip.y + 0.044, 1, true, 'y'), 0.86, true);
    }
  }
  // Join the real shirt hem to the real upper tail outline. Each endpoint
  // keeps its own source support; no overlapping translated shirt/belt islands.
  const hull = <T extends { p: THREE.Vector3 }>(items: T[]) => {
    const unique = new Map<string, T>();
    for (const v of items) unique.set(`${Math.round(v.p.x * 1e6)},${Math.round(v.p.z * 1e6)}`, v);
    const points = [...unique.values()].sort((a, b) => a.p.x - b.p.x || a.p.z - b.p.z);
    const cross = (a: T, b: T, c: T) =>
      (b.p.x - a.p.x) * (c.p.z - a.p.z) - (b.p.z - a.p.z) * (c.p.x - a.p.x);
    const chain = (a: T[]) => {
      const result: T[] = [];
      for (const p of a) {
        while (result.length > 1 && cross(result.at(-2)!, result.at(-1)!, p) < -1e-10) result.pop();
        result.push(p);
      }
      result.pop();
      return result;
    };
    return [...chain(points), ...chain(points.slice().reverse())].sort(
      (a, b) => Math.atan2(a.p.z - hip.z, a.p.x - hip.x) - Math.atan2(b.p.z - hip.z, b.p.x - hip.x)
    );
  };
  const rim = [...new Set(shellFaces.flatMap((t) => indices.slice(t * 3, t * 3 + 3)))]
    .map((id) => ({
      id,
      p: new THREE.Vector3().fromArray(positions, id * 3),
    }))
    .filter((v) => v.p.y > ventTop + 1e-5);
  const canonical: typeof rim = [],
    remap = new Map<number, number>();
  let seamWeldMaxDistance = 0;
  const supportDistance = (i: number, j: number) => {
    const delta = new Map<number, number>();
    for (let k = 0; k < 4; k++) {
      delta.set(skin[i * 4 + k], (delta.get(skin[i * 4 + k]) ?? 0) + weights[i * 4 + k]);
      delta.set(skin[j * 4 + k], (delta.get(skin[j * 4 + k]) ?? 0) - weights[j * 4 + k]);
    }
    return [...delta.values()].reduce((s, n) => s + Math.abs(n), 0);
  };
  for (const v of rim) {
    const previous = canonical.find(
      (w) => w.p.distanceTo(v.p) < 0.001 && supportDistance(w.id, v.id) < 0.04
    );
    if (previous) {
      remap.set(v.id, previous.id);
      seamWeldMaxDistance = Math.max(seamWeldMaxDistance, previous.p.distanceTo(v.p));
    } else canonical.push(v);
  }
  for (let i = 0; i < indices.length; i++) indices[i] = remap.get(indices[i]) ?? indices[i];
  const rimIds = new Set(canonical.map((v) => v.id)),
    edges = new Map<string, number>();
  for (const face of shellFaces)
    for (let k = 0; k < 3; k++) {
      const t = face * 3;
      const i = indices[t + k],
        j = indices[t + ((k + 1) % 3)];
      if (i === j || !rimIds.has(i) || !rimIds.has(j)) continue;
      const key = [Math.min(i, j), Math.max(i, j)].join(',');
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  const neighbours = new Map<number, number[]>();
  for (const [key, n] of edges) {
    if (n !== 1) continue;
    const [i, j] = key.split(',').map(Number);
    for (const [u, v] of [
      [i, j],
      [j, i],
    ]) {
      if (!neighbours.has(u)) neighbours.set(u, []);
      neighbours.get(u)!.push(v);
    }
  }
  if ([...neighbours.values()].some((ns) => ns.length !== 2)) return null;
  const loops: number[][] = [],
    visited = new Set<number>();
  for (const start of neighbours.keys()) {
    if (visited.has(start)) continue;
    const loop: number[] = [];
    let current = start,
      previous = -1;
    do {
      if (visited.has(current)) return null;
      visited.add(current);
      loop.push(current);
      const next = neighbours.get(current)!.find((n) => n !== previous)!;
      previous = current;
      current = next;
    } while (current !== start);
    loops.push(loop);
  }
  const outline = loops.sort((a, b) => b.length - a.length)[0] ?? [];
  const lower = outline.map((id) => ({ id, p: new THREE.Vector3().fromArray(positions, id * 3) }));
  const area = lower.reduce((sum, v, i) => {
    const w = lower[(i + 1) % lower.length];
    return sum + v.p.x * w.p.z - w.p.x * v.p.z;
  }, 0);
  if (area < 0) lower.reverse();
  const start = lower.reduce(
    (best, v, i) =>
      Math.atan2(v.p.z - hip.z, v.p.x - hip.x) <
      Math.atan2(lower[best].p.z - hip.z, lower[best].p.x - hip.x)
        ? i
        : best,
    0
  );
  lower.push(...lower.splice(0, start));
  // Ease the sewn rim after topology canonicalization. Every adjoining shell
  // face uses the same indices, so a small cloth allowance cannot split it.
  for (const { id, p } of lower) {
    p.addScaledVector(new THREE.Vector3(p.x - hip.x, 0, p.z - hip.z).normalize(), 0.002);
    positions.splice(id * 3, 3, ...p.toArray());
  }

  const hemSources: { p: THREE.Vector3; v: Vertex; mesh: THREE.SkinnedMesh }[] = [];
  for (const face of trunk) {
    const material = Array.isArray(face.mesh.material) ? face.mesh.material[0] : face.mesh.material;
    if (face.leg || !/^(White|LightBrown)(-|$)/.test(material.name)) continue;
    for (const v of face.vertices)
      if (v.p.y < shirtBottom + 0.045) hemSources.push({ p: v.p, v, mesh: face.mesh });
  }
  const upperHem = hull(hemSources).map(({ p, v, mesh }) => {
    const radial = v.n.clone().setY(0);
    if (radial.lengthSq() < 0.001) radial.set(p.x - hip.x, 0, p.z - hip.z);
    const id = emit(p.clone().addScaledVector(radial.normalize(), 0.005), v.weights);
    return { id, vertex: v.id!, mesh: mesh.name };
  });
  if (lower.length < 4 || upperHem.length < 4) return null;
  const bridgeStart = indices.length / 3;
  const upper = upperHem.map((v) => ({
    ...v,
    p: new THREE.Vector3().fromArray(positions, v.id * 3),
  }));
  // The native waist is serrated. Equal normalized circumference can connect
  // a front shirt vertex to the rear waist. Keep source-edge order and choose
  // the cyclic registration/zipper with the shortest local cross-edges.
  let steps: number[] = [],
    best = Infinity,
    registration = 0;
  for (let start = 0; start < lower.length; start++) {
    const width = lower.length + 1,
      cost = new Float64Array((upper.length + 1) * width).fill(Infinity),
      from = new Uint8Array(cost.length);
    cost[0] = 0;
    for (let u = 0; u <= upper.length; u++)
      for (let l = 0; l <= lower.length; l++) {
        const index = u * width + l,
          current = cost[index];
        if (u < upper.length) {
          const next = index + width,
            value =
              current +
              upper[(u + 1) % upper.length].p.distanceToSquared(
                lower[(l + start) % lower.length].p
              );
          if (value < cost[next]) {
            cost[next] = value;
            from[next] = 0;
          }
        }
        if (l < lower.length) {
          const next = index + 1,
            value =
              current +
              upper[u % upper.length].p.distanceToSquared(lower[(l + 1 + start) % lower.length].p);
          if (value < cost[next]) {
            cost[next] = value;
            from[next] = 1;
          }
        }
      }
    if (cost.at(-1)! >= best) continue;
    best = cost.at(-1)!;
    registration = start;
    const path: number[] = [];
    let u = upper.length,
      l = lower.length;
    while (u || l) {
      const step = from[u * width + l];
      path.push(step);
      if (step === 0) u--;
      else l--;
    }
    steps = path.reverse();
  }
  lower.push(...lower.splice(0, registration));
  const bridge = (i: number, j: number, k: number) => {
    const points = [i, j, k].map((id) => new THREE.Vector3().fromArray(positions, id * 3)),
      t = new THREE.Triangle(...(points as [THREE.Vector3, THREE.Vector3, THREE.Vector3])),
      radial = t.getMidpoint(new THREE.Vector3()).sub(hip).setY(0);
    if (t.getNormal(new THREE.Vector3()).dot(radial) < 0) [j, k] = [k, j];
    indices.push(i, j, k);
  };
  let u = 0,
    l = 0;
  for (const step of steps) {
    if (step === 0) {
      bridge(
        upper[u % upper.length].id,
        lower[l % lower.length].id,
        upper[(u + 1) % upper.length].id
      );
      u++;
    } else {
      bridge(
        upper[u % upper.length].id,
        lower[l % lower.length].id,
        lower[(l + 1) % lower.length].id
      );
      l++;
    }
  }
  const bridgeCount = indices.length / 3 - bridgeStart;
  const tailCount = positions.length / 3 - tailStart;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.setAttribute('skinIndex', new THREE.Uint8BufferAttribute(skin, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.labCoatFit = {
    sleeves,
    tailStart,
    tailCount,
    top,
    hem,
    ventTop,
    bridgeStart,
    bridgeCount,
    seamWeldMaxDistance,
    upperHem,
    lowerHem: lower.map((v) => v.id),
    sourceSupported: true,
    maxDiscardedWeight,
  };
  return geometry;
}

/** A short linen work apron in the source skin's bind coordinates. It shares
 * the existing palette and indexed Uint8 joints, including the distant merge.
 * Working if the bib follows torso flexion and the hem follows the two thighs
 * without a separate animation loop or a seam between rigid panels.
 */
export function createWorkerApronGeometry(source: THREE.SkinnedMesh) {
  const joints = ['Hips', 'Abdomen', 'Chest', 'UpperLegL', 'UpperLegR'].map((name) =>
    source.skeleton.bones.findIndex((bone) => bone.name === name)
  );
  if (joints.some((index) => index < 0 || index > 255)) return null;
  const rest = joints.map((index) =>
    new THREE.Vector3().setFromMatrixPosition(
      new THREE.Matrix4().copy(source.skeleton.boneInverses[index]).invert()
    )
  );
  const hip = rest[0],
    abdomen = rest[1],
    chest = rest[2];
  const waist = abdomen.y,
    top = chest.y + 0.015,
    hem = hip.y - 0.15;
  const cloud: THREE.Vector3[] = [];
  type Face = { triangle: THREE.Triangle; ids: number[]; mesh: THREE.SkinnedMesh };
  const trouserFaces: Face[] = [],
    torsoFaces: Face[] = [];
  let maxDiscardedWeight = 0;
  source.parent?.parent?.traverse((object) => {
    const mesh = object as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh || !/Worker_(Body|Legs)/.test(mesh.parent?.name ?? '')) return;
    const attribute = mesh.geometry.getAttribute('position');
    for (let i = 0; i < attribute.count; i++) {
      const point = new THREE.Vector3().fromBufferAttribute(attribute, i);
      if (Math.abs(point.x - hip.x) < 0.26) cloud.push(point);
    }
    // Donors must describe this same rest/bind frame. Never borrow a nearby
    // mesh's palette merely because its joint names happen to match.
    if (
      !mesh.bindMatrix.equals(source.bindMatrix) ||
      !mesh.bindMatrixInverse.equals(source.bindMatrixInverse) ||
      !mesh.skeleton.bones.every(
        (bone, i) =>
          bone === source.skeleton.bones[i] &&
          mesh.skeleton.boneInverses[i].equals(source.skeleton.boneInverses[i])
      )
    )
      return;
    const index = mesh.geometry.index;
    const normal = new THREE.Vector3();
    for (let i = 0; i < (index?.count ?? attribute.count); i += 3) {
      const ids = [0, 1, 2].map((offset) => index?.getX(i + offset) ?? i + offset);
      const points = ids.map((id) => new THREE.Vector3().fromBufferAttribute(attribute, id));
      const triangle = new THREE.Triangle(points[0], points[1], points[2]);
      const centre = triangle.getMidpoint(new THREE.Vector3());
      if (mesh.parent?.name === 'Worker_Legs') {
        // Transfer only from the front hip/thigh surface, never the back.
        if (
          centre.y >= hem - 0.08 &&
          centre.y <= hip.y + 0.13 &&
          centre.z >= hip.z &&
          triangle.getNormal(normal).z > 0.1
        )
          trouserFaces.push({ triangle, ids, mesh });
      }
      if (centre.y > hip.y - 0.08 && centre.y < top + 0.08 && Math.abs(centre.x - hip.x) < 0.26) {
        const arm = ids.some((id) => {
          let weight = 0;
          for (let k = 0; k < 4; k++) {
            const bone =
              mesh.skeleton.bones[mesh.geometry.attributes.skinIndex.getComponent(id, k)];
            if (/UpperArm|LowerArm|Wrist|Finger/.test(bone.name))
              weight += mesh.geometry.attributes.skinWeight.getComponent(id, k);
          }
          return weight > 0.15;
        });
        if (!arm) torsoFaces.push({ triangle, ids, mesh });
      }
    }
  });
  if (!cloud.length) return null;
  function frontSample(y: number) {
    let front = -Infinity;
    for (const point of cloud) if (Math.abs(point.y - y) < 0.065) front = Math.max(front, point.z);
    return Number.isFinite(front) ? front : hip.z + 0.15;
  }
  // The old sliding maximum jumped whenever a source vertex entered its band.
  // Fit a continuous front through the actual hem/hip/waist/bib envelope instead.
  // Working if cloth rows stay smooth while the existing posed clearance holds.
  const profile = [hem, hip.y, waist, top].map((y) => ({ y, z: frontSample(y) }));
  function frontAt(y: number) {
    for (let i = 1; i < profile.length; i++) {
      const a = profile[i - 1],
        b = profile[i];
      if (y <= b.y) return THREE.MathUtils.lerp(a.z, b.z, THREE.MathUtils.smoothstep(y, a.y, b.y));
    }
    return profile.at(-1)!.z;
  }
  // Front cloth and its sewn details share one (x,y) attachment field. Sampling
  // again from an offset pocket would choose different weights and tear its seam.
  const frontRay = new THREE.Ray(),
    samplePoint = new THREE.Vector3();
  function torsoAt(x: number, y: number, radial = false, z = hip.z + 1) {
    const origin = new THREE.Vector3(x, y, radial ? z : hip.z + 1);
    frontRay.set(origin, new THREE.Vector3(0, 0, -1));
    if (radial) {
      frontRay.origin.set(hip.x, y, hip.z);
      frontRay.direction.copy(origin).sub(frontRay.origin).normalize();
    }
    let face: Face | undefined,
      distance = radial ? -Infinity : Infinity;
    const point = new THREE.Vector3(),
      barycentric = new THREE.Vector3();
    for (const candidate of torsoFaces) {
      if (!radial && candidate.triangle.getNormal(samplePoint).z < 0.1) continue;
      const hit = frontRay.intersectTriangle(
        candidate.triangle.a,
        candidate.triangle.b,
        candidate.triangle.c,
        false,
        samplePoint
      );
      if (!hit) continue;
      const d = hit.distanceToSquared(frontRay.origin);
      if (radial ? d > distance : d < distance) {
        face = candidate;
        distance = d;
        point.copy(hit);
      }
    }
    if (!face && !radial) {
      origin.set(x, y, frontAt(y));
      for (const candidate of torsoFaces) {
        if (candidate.triangle.getNormal(samplePoint).z < 0.1) continue;
        candidate.triangle.closestPointToPoint(origin, samplePoint);
        const d = (samplePoint.x - x) ** 2 + (samplePoint.y - y) ** 2;
        if (d < distance) {
          face = candidate;
          distance = d;
          point.copy(samplePoint);
        }
      }
    }
    if (!face) return null;
    face.triangle.getBarycoord(point, barycentric);
    return { face, point, barycentric };
  }
  // Fit the waist width to the actual trunk cross-section rather than a fixed
  // wide ellipse. Working if the webbing hugs both bodies during real clips.
  let waistRadius = 0;
  for (const { triangle } of torsoFaces)
    for (const [a, b] of [
      [triangle.a, triangle.b],
      [triangle.b, triangle.c],
      [triangle.c, triangle.a],
    ])
      if ((a.y - waist) * (b.y - waist) <= 0 && a.y !== b.y) {
        const x = THREE.MathUtils.lerp(a.x, b.x, (waist - a.y) / (b.y - a.y));
        waistRadius = Math.max(waistRadius, Math.abs(x - hip.x));
      }
  const waistWidth = THREE.MathUtils.clamp(waistRadius * 0.94, 0.15, 0.205);
  const torsoBlend = (y: number) => THREE.MathUtils.smoothstep(y, hip.y - 0.02, waist + 0.03);
  function widthAt(y: number) {
    const bib = THREE.MathUtils.smoothstep(y, waist, top),
      skirt = 1 - THREE.MathUtils.smoothstep(y, hem, waist);
    return THREE.MathUtils.lerp(
      0.215 - 0.035 * skirt * skirt,
      THREE.MathUtils.lerp(waistWidth, 0.112, bib),
      torsoBlend(y)
    );
  }
  const positions: number[] = [],
    colours: number[] = [],
    indices: number[] = [];
  const skinIndices: number[] = [],
    weights: number[] = [];
  const linen = new THREE.Color('#ded6bc'),
    stitch = new THREE.Color('#526e69');
  const pocket = new THREE.Color('#eee3c9'),
    strap = new THREE.Color('#46635f');
  function vertex(x: number, y: number, z: number, colour: THREE.Color, tone = 1, belt = false) {
    positions.push(x, y, z);
    colours.push(colour.r * tone, colour.g * tone, colour.b * tone);
    // Around the hip, the exported trousers already blend into the thighs
    // above the Hips joint. A guessed height ramp leaves cloth behind in runs.
    // Use same-side front triangles' barycentric weights in that fitted region.
    const transferred = new Map<number, number>();
    const torso = torsoAt(x, y, belt, z);
    const upperBlend = torso ? (belt ? 1 : z > hip.z ? torsoBlend(y) : 0) : 0;
    const blend = z > hip.z ? 1 - THREE.MathUtils.smoothstep(y, hip.y + 0.075, hip.y + 0.12) : 0;
    let nearest = Infinity;
    let face: (typeof trouserFaces)[number] | undefined;
    const point = new THREE.Vector3(x, y, z),
      closest = new THREE.Vector3();
    const barycentric = new THREE.Vector3();
    if (blend > 0) {
      for (const candidate of trouserFaces) {
        const centre = candidate.triangle.getMidpoint(closest);
        if ((centre.x - hip.x) * (x - hip.x) < 0) continue;
        candidate.triangle.closestPointToPoint(point, closest);
        const distance = closest.distanceToSquared(point);
        if (distance < nearest) {
          nearest = distance;
          face = candidate;
          candidate.triangle.getBarycoord(closest, barycentric);
        }
      }
    }
    const offset = weights.length;
    if (y < hip.y) {
      const leg = THREE.MathUtils.smoothstep(hip.y - y, 0, 0.07);
      const side = x >= hip.x ? 1 : 0;
      skinIndices.push(joints[0], joints[3], joints[4], 0);
      weights.push(1 - leg, leg * side, leg * (1 - side), 0);
    } else {
      const upper = y >= abdomen.y;
      const amount = THREE.MathUtils.clamp(
        upper ? (y - abdomen.y) / (chest.y - abdomen.y) : (y - hip.y) / (abdomen.y - hip.y),
        0,
        1
      );
      skinIndices.push(joints[upper ? 1 : 0], joints[upper ? 2 : 1], 0, 0);
      weights.push(1 - amount, amount, 0, 0);
    }
    function transfer(donor: Face, bary: THREE.Vector3, amount: number) {
      for (const [joint, weight] of transferred) transferred.set(joint, weight * (1 - amount));
      for (let corner = 0; corner < 3; corner++)
        for (let k = 0; k < 4; k++) {
          const id = donor.ids[corner];
          const sourceIndex = donor.mesh.geometry.attributes.skinIndex.getComponent(id, k);
          const joint = source.skeleton.bones.indexOf(donor.mesh.skeleton.bones[sourceIndex]);
          const weight =
            donor.mesh.geometry.attributes.skinWeight.getComponent(id, k) *
            bary.getComponent(corner) *
            amount;
          if (joint >= 0 && joint <= 255 && weight > 0)
            transferred.set(joint, (transferred.get(joint) ?? 0) + weight);
        }
    }
    if (face || upperBlend > 0) {
      for (let k = 0; k < 4; k++) {
        const joint = skinIndices[offset + k];
        transferred.set(joint, (transferred.get(joint) ?? 0) + weights[offset + k]);
      }
      if (face) transfer(face, barycentric, blend);
      if (torso && upperBlend > 0) transfer(torso.face, torso.barycentric, upperBlend);
      const ranked = [...transferred].sort((a, b) => b[1] - a[1]);
      maxDiscardedWeight = Math.max(
        maxDiscardedWeight,
        ranked.slice(4).reduce((sum, entry) => sum + entry[1], 0)
      );
      const sorted = ranked.slice(0, 4);
      const total = sorted.reduce((sum, entry) => sum + entry[1], 0);
      if (total > 0)
        for (let influence = 0; influence < 4; influence++) {
          skinIndices[offset + influence] = sorted[influence]?.[0] ?? 0;
          weights[offset + influence] = (sorted[influence]?.[1] ?? 0) / total;
        }
    }
  }
  function panel(
    columns: number,
    rows: number,
    point: (u: number, v: number) => [number, number, number],
    colour: THREE.Color,
    shade = false,
    vent = false,
    belt = false
  ) {
    const start = positions.length / 3;
    for (let row = 0; row <= rows; row++)
      for (let column = 0; column <= columns; column++) {
        const u = column / columns,
          v = row / rows,
          p = point(u, v);
        vertex(...p, colour, shade ? 0.95 + 0.05 * Math.cos(u * Math.PI * 10 + v * 4) : 1, belt);
        if (row < rows && column < columns) {
          // A real centre vent lets the two lower flaps follow opposite thighs.
          // Blending both legs through one sheet pulls the hem into the trousers.
          if (vent && p[1] < hip.y && column === 9) continue;
          const a = start + row * (columns + 1) + column,
            b = a + columns + 1;
          indices.push(a, b + 1, b, a, a + 1, b + 1);
        }
      }
  }
  function shape(u: number, v: number): [number, number, number] {
    const y = THREE.MathUtils.lerp(top, hem, v);
    const aboveWaist = THREE.MathUtils.smoothstep(y, waist, top);
    const width = widthAt(y);
    const across = u * 2 - 1;
    const fold = 0.004 * Math.sin(across * Math.PI * 3 + v * 0.8) * (1 - aboveWaist);
    const x = hip.x + across * width;
    const clothY = y - (1 - across * across) * 0.008 * (1 - v);
    // Bridge source shirt/trouser hems with a draped profile, rather than
    // reproducing the hard geometric step of one garment underneath another.
    const fitBase = waist + 0.06;
    const span = (top - fitBase) / 4;
    const band = Math.min(3, Math.max(0, Math.floor((clothY - fitBase) / span)));
    const lowY = fitBase + band * span,
      highY = lowY + span;
    const low = torsoAt(x, lowY),
      high = torsoAt(x, highY);
    const fittedZ =
      low && high
        ? THREE.MathUtils.lerp(
            low.point.z,
            high.point.z,
            THREE.MathUtils.smoothstep(clothY, lowY, highY)
          )
        : undefined;
    const looseZ =
      frontAt(y) +
      0.032 +
      0.018 * (1 - aboveWaist) +
      // Wrap the sides toward the hips instead of projecting a wide flat
      // shield into the resting/swinging hands. The split hem stays free.
      across * across * THREE.MathUtils.lerp(-0.03, -0.02, aboveWaist) +
      fold;
    return [
      x,
      clothY,
      fittedZ !== undefined
        ? THREE.MathUtils.lerp(
            looseZ,
            fittedZ + 0.018 + 0.006 * aboveWaist + fold * 0.35,
            torsoBlend(clothY)
          )
        : looseZ,
    ];
  }
  panel(20, 24, shape, linen, true, true);
  // Sewn edges sit on the same folded cloth rather than floating straight lines.
  for (const edge of [0, 1])
    panel(
      1,
      24,
      (u, v) => {
        const p = shape(edge === 0 ? u * 0.012 : 1 - u * 0.012, v);
        p[2] += 0.0015;
        return p;
      },
      stitch
    );
  for (const edge of [0, 1])
    panel(
      20,
      1,
      (u, v) => {
        const p = shape(u, edge === 0 ? v * 0.009 : 1 - v * 0.009);
        p[2] += 0.0015;
        return p;
      },
      stitch,
      false,
      edge === 1
    );
  function clothAt(x: number, y: number) {
    const width = widthAt(y);
    return shape(0.5 + x / (2 * width), (top - y) / (top - hem));
  }
  const pocketTop = waist + 0.075,
    pocketBottom = waist - 0.065;
  panel(
    10,
    6,
    (u, v) => {
      const p = clothAt((u * 2 - 1) * 0.105, THREE.MathUtils.lerp(pocketTop, pocketBottom, v));
      p[2] += 0.008 + 0.022 * Math.sin(u * Math.PI) * Math.sin(((1 - v) * Math.PI) / 2);
      return p;
    },
    pocket,
    true
  );
  panel(
    10,
    1,
    (u, v) => {
      const p = clothAt((u * 2 - 1) * 0.105, pocketTop - v * 0.006);
      p[2] += 0.01 + 0.022 * Math.sin(u * Math.PI);
      return p;
    },
    stitch
  );
  // Soft waist webbing and a small tied bow retain the back silhouette too.
  let back = Infinity;
  for (const p of cloud) if (Math.abs(p.y - waist) < 0.06) back = Math.min(back, p.z);
  if (!Number.isFinite(back)) back = hip.z - 0.12;
  const backFit = torsoAt(hip.x, waist, true, hip.z - 1);
  if (backFit) back = backFit.point.z;
  panel(
    32,
    1,
    (u, v) => {
      const angle = u * Math.PI * 2,
        y = waist + (v - 0.5) * 0.025;
      const dx = Math.sin(angle),
        dz = Math.cos(angle);
      const fit = torsoAt(hip.x + dx, y, true, hip.z + dz);
      return fit
        ? [fit.point.x + dx * 0.008, y, fit.point.z + dz * 0.008]
        : [hip.x + dx * waistWidth, y, hip.z + dz * 0.12];
    },
    strap,
    false,
    false,
    true
  );
  for (const side of [-1, 1]) {
    panel(
      12,
      1,
      (u, v) => [
        hip.x + side * Math.sin(u * Math.PI) * 0.065,
        waist - Math.sin(u * Math.PI * 2) * 0.022 + (v - 0.5) * 0.015,
        back - 0.025 - Math.sin(u * Math.PI) * 0.015,
      ],
      strap
    );
    panel(
      12,
      1,
      (u, v) => [
        hip.x + side * (0.075 + u * 0.014 + (v - 0.5) * 0.018),
        top + Math.sin(u * Math.PI) * 0.1,
        THREE.MathUtils.lerp(clothAt(side * 0.075, top)[2], back - 0.008, u),
      ],
      strap
    );
  }
  // A few teal stitches form a small grain sprig, no text or extra decal draw.
  const markY = top - 0.105;
  for (let i = 0; i < 5; i++)
    for (const side of [-1, 1])
      panel(
        1,
        1,
        (u, v) => {
          const y = markY + i * 0.014 + u * 0.012;
          const p = clothAt(side * (u * 0.022 + (v - 0.5) * 0.003), y);
          p[2] += 0.002;
          return p;
        },
        stitch
      );
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.setAttribute('skinIndex', new THREE.Uint8BufferAttribute(skinIndices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  geometry.setIndex(indices);
  geometry.userData.apronFit = { maxDiscardedWeight, waist, hem };
  geometry.computeVertexNormals();
  // These generated and decoded worker attributes are non-interleaved buffers.
  // Preserve the source upload metadata as well as its array layout for merging.
  for (const name of ['position', 'normal', 'skinIndex', 'skinWeight']) {
    (geometry.getAttribute(name) as THREE.BufferAttribute).gpuType = (
      source.geometry.getAttribute(name) as THREE.BufferAttribute
    ).gpuType;
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Metre-space civilian cuts, seated on the measured Head-space scalp.
 * Each style is one shared lit surface. Industrial exports keep their own hair.
 * Working if front hairlines clear the eyes and the five styles resolve distinctly.
 */
export function createWorkerHair(style: 'short' | 'medium' | 'curly' | 'ponytail') {
  const positions: number[] = [],
    normals: number[] = [],
    uvs: number[] = [];
  const colours: number[] = [],
    flex: number[] = [],
    indices: number[] = [];
  const segments = 24,
    rings = 10;
  const rx = style === 'curly' ? 0.116 : 0.111;
  const ry = style === 'medium' ? 0.126 : 0.116;
  const rz = style === 'medium' ? 0.114 : 0.107;
  const normal = new THREE.Vector3(),
    point = new THREE.Vector3();
  const along = new THREE.Vector3(),
    across = new THREE.Vector3();
  const thetaLow = new THREE.Vector3(),
    thetaHigh = new THREE.Vector3();
  const phiLow = new THREE.Vector3(),
    phiHigh = new THREE.Vector3();
  const partAngle = style === 'medium' ? -0.48 : 0.42;
  const sample = (theta: number, phi: number, out: THREE.Vector3) => {
    const sin = Math.sin(phi),
      front = Math.max(0, Math.cos(theta));
    const sweep = theta + phi * (style === 'medium' ? 0.72 : 0.48);
    const partDistance = Math.atan2(Math.sin(sweep - partAngle), Math.cos(sweep - partAngle));
    const part = style === 'curly' ? 0 : Math.exp(-((partDistance / 0.14) ** 2));
    const lock = 0.5 + 0.5 * Math.cos(sweep * (style === 'curly' ? 7 : 5) + phi * 0.8);
    // Broad locks and a narrow part are real sculpt, seated outside the same scalp.
    // Working if their normal field follows the curved surface, within the old envelope.
    const frontSweep = Math.atan2(
      Math.sin(theta + 0.45 + phi * 0.6),
      Math.cos(theta + 0.45 + phi * 0.6)
    );
    const forelock =
      style === 'curly' ? 0 : Math.exp(-((frontSweep / 0.65) ** 2) - ((phi - 0.85) / 0.65) ** 2);
    const relief = sin * (0.0018 + lock * 0.003 + forelock * 0.008 - part * 0.0013);
    const originalWave =
      style === 'curly'
        ? 0.005 * Math.sin(theta * 7 + phi * 8)
        : 0.006 * Math.sin(theta * 6 + phi * 2.5);
    // The borrowed Skin is open behind the ears. Keep its proven temple coverage,
    // tapering toward the original seated field rather than cutting a window in it.
    // Working if real skin-plus-hair rays close both heads without enlarging the ear cover.
    const temple = Math.sin(theta) ** 8 * THREE.MathUtils.smoothstep(phi, 0.95, 1.35);
    const radial = THREE.MathUtils.lerp(1 + relief / rx, 1 + (sin * originalWave) / rx, temple);
    return out.set(
      rx * sin * Math.sin(theta) * radial,
      0.09 + ry * Math.cos(phi) + sin * sin * (0.003 * Math.sin(theta - 0.6) + front * 0.002),
      0.01 + rz * sin * Math.cos(theta) * radial
    );
  };
  for (let row = 0; row <= rings; row++) {
    for (let column = 0; column <= segments; column++) {
      const theta = (column / segments) * Math.PI * 2;
      const front = Math.max(0, Math.cos(theta));
      const back = Math.max(0, -Math.cos(theta));
      const hairline =
        1.64 -
        front ** 3 * (0.63 + (style === 'medium' ? 0.1 : 0.06) * Math.sin(theta + 0.35)) +
        back * (style === 'medium' ? 0.6 : 0.25) +
        0.04 * Math.sin(theta * 4 + 0.5);
      const phi = (row / rings) * hairline;
      sample(theta, phi, point);
      positions.push(...point.toArray());
      if (row === 0) normal.set(0, 1, 0);
      else {
        sample(theta - 0.0002, phi, thetaLow);
        sample(theta + 0.0002, phi, thetaHigh);
        sample(theta, phi - 0.0002, phiLow);
        sample(theta, phi + 0.0002, phiHigh);
        normal.subVectors(phiHigh, phiLow).cross(along.subVectors(thetaHigh, thetaLow)).normalize();
      }
      normals.push(...normal.toArray());
      uvs.push(column / segments, row / rings);
      const sweep = theta + phi * (style === 'medium' ? 0.72 : 0.48);
      const distance = Math.atan2(Math.sin(sweep - partAngle), Math.cos(sweep - partAngle));
      const part = style === 'curly' ? 0 : Math.exp(-((distance / 0.14) ** 2));
      const lock = 0.5 + 0.5 * Math.cos(sweep * (style === 'curly' ? 7 : 5) + phi * 0.8);
      const tone = THREE.MathUtils.lerp(0.9, 0.74 + 0.24 * lock - part * 0.12, Math.sin(phi));
      colours.push(tone, tone, tone);
      flex.push(0);
      if (row < rings && column < segments) {
        const a = row * (segments + 1) + column,
          b = a + segments + 1;
        // A real crown fan: the former first triangle collapsed at every pole vertex.
        if (row > 0) indices.push(a, b, a + 1);
        indices.push(b, b + 1, a + 1);
      }
    }
  }
  // A tucked front cut edge; the nape retains its soft open contour, without a visible loop.
  // Separate edge normals retain the fine cut instead of rounding it into the face.
  const edgeStart = positions.length / 3;
  for (let column = 0; column <= segments; column++) {
    const id = rings * (segments + 1) + column;
    point.fromArray(positions, id * 3);
    const inner = across.set(point.x * 0.985, point.y + 0.0015, 0.01 + (point.z - 0.01) * 0.985);
    const next = new THREE.Vector3().fromArray(
      positions,
      (rings * (segments + 1) + ((column + 1) % segments)) * 3
    );
    normal.subVectors(inner, point).cross(along.subVectors(next, point)).normalize();
    for (const vertex of [point, inner]) {
      positions.push(...vertex.toArray());
      normals.push(...normal.toArray());
      uvs.push(column / segments, vertex === point ? 0 : 1);
      const tone = colours[id * 3] * 0.9;
      colours.push(tone, tone, tone);
      flex.push(0);
    }
    if (column < segments && Math.cos(((column + 0.5) / segments) * Math.PI * 2) > 0.05) {
      const a = edgeStart + column * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const cap = new THREE.BufferGeometry();
  cap.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  cap.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  cap.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  cap.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  cap.setAttribute('hairFlex', new THREE.Float32BufferAttribute(flex, 1));
  cap.setIndex(indices);
  const parts = [cap];
  if (style === 'curly') {
    const locks = [
      [-0.06, 0.177, 0.07],
      [0, 0.19, 0.082],
      [0.055, 0.181, 0.065],
      [-0.085, 0.171, 0.005],
      [-0.035, 0.203, 0.025],
      [0.025, 0.208, 0.018],
      [0.078, 0.183, 0.012],
      [-0.065, 0.176, -0.052],
      [-0.02, 0.194, -0.045],
      [0.04, 0.193, -0.05],
      [0.08, 0.16, -0.045],
      [-0.035, 0.137, -0.085],
      [0.026, 0.151, -0.084],
    ];
    for (let lock = 0; lock < locks.length; lock++) {
      let curl: THREE.BufferGeometry = new THREE.SphereGeometry(1, 8, 6)
        .scale(0.039 + (lock % 3) * 0.001, 0.026 + (lock % 3) * 0.001, 0.037)
        .rotateY(lock * 0.71)
        .translate(...(locks[lock] as [number, number, number]));
      const vertices = curl.getAttribute('position'),
        centre = new THREE.Vector3(...(locks[lock] as [number, number, number]));
      for (let i = 0; i < vertices.count; i++) {
        point.fromBufferAttribute(vertices, i).sub(centre);
        const angle = Math.atan2(point.x, point.z),
          height = point.y / (0.026 + (lock % 3) * 0.001);
        const lobe =
          0.965 + 0.035 * Math.cos(angle * 3 + lock * 0.71) * Math.max(0, 1 - height * height);
        point.multiplyScalar(lobe).add(centre);
        vertices.setXYZ(i, point.x, point.y, point.z);
      }
      const smooth = toCreasedNormals(curl, Math.PI / 2);
      curl.dispose();
      curl = smooth;
      fittingTint(curl, 0.8 + (lock % 3) * 0.07);
      curl.setAttribute(
        'hairFlex',
        new THREE.Float32BufferAttribute(new Float32Array(curl.attributes.position.count), 1)
      );
      parts.push(curl);
    }
  }
  if (style === 'ponytail') {
    const path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.124, -0.088),
      new THREE.Vector3(0, 0.105, -0.123),
      new THREE.Vector3(0.008, 0.045, -0.144),
      new THREE.Vector3(0.016, -0.013, -0.14),
    ]);
    const tail = new THREE.TubeGeometry(path, 10, 1, 10, false);
    const pos = tail.attributes.position,
      n = tail.attributes.normal;
    const weights = new Float32Array(pos.count);
    const point = new THREE.Vector3(),
      centre = new THREE.Vector3();
    for (let index = 0; index < pos.count; index++) {
      const t = Math.floor(index / 11) / 10;
      path.getPointAt(t, centre);
      point
        .fromBufferAttribute(pos, index)
        .sub(centre)
        .multiplyScalar(
          0.025 * (1 - t * 0.76) * (1 + 0.1 * Math.cos(((index % 11) / 10) * Math.PI * 6 + t * 2))
        )
        .add(centre);
      pos.setXYZ(index, point.x, point.y, point.z);
      weights[index] = THREE.MathUtils.smoothstep(t, 0.12, 1);
    }
    tail.computeVertexNormals();
    n.needsUpdate = true;
    fittingTint(tail, 0.9);
    const tailColour = tail.getAttribute('color');
    for (let index = 0; index < pos.count; index++) {
      const t = Math.floor(index / 11) / 10;
      // A dark elastic at the root makes the tied shape legible in one material.
      const tone =
        t <= 0.1
          ? 0.16
          : 0.67 + 0.3 * (0.5 + 0.5 * Math.cos(((index % 11) / 10) * Math.PI * 6 + t * 2));
      tailColour.setXYZ(index, tone, tone, tone);
    }
    tail.setAttribute('hairFlex', new THREE.Float32BufferAttribute(weights, 1));
    parts.push(tail);
    const tip = new THREE.SphereGeometry(0.006, 10, 6).translate(0.016, -0.013, -0.14);
    fittingTint(tip, 0.9);
    tip.setAttribute(
      'hairFlex',
      new THREE.Float32BufferAttribute(new Float32Array(tip.attributes.position.count).fill(1), 1)
    );
    parts.push(tip);
  }
  const result = assembleWorkerFitting(parts);
  result.name = `worker-hair-${style}`;
  return result;
}

export const WORKER_HAIR_GEOMETRIES = {
  short: createWorkerHair('short'),
  medium: createWorkerHair('medium'),
  curly: createWorkerHair('curly'),
  ponytail: createWorkerHair('ponytail'),
  bald: null,
};

/** Private flexible tail, with exact unmoving cap/root vertices and shared static cuts.
 * Working if walking produces a small tip response, rest settles, pause freezes,
 * and disposing one wearer never disposes a shared hairstyle.
 */
export function createWorkerHairMotion(source: THREE.BufferGeometry) {
  const weights = source.getAttribute('hairFlex');
  const dynamic = Array.from(weights.array).some((value) => value > 0);
  const geometry = dynamic ? source.clone() : source;
  const rest = source.getAttribute('position'),
    restNormal = source.getAttribute('normal');
  const position = geometry.getAttribute('position') as THREE.BufferAttribute,
    normals = geometry.getAttribute('normal') as THREE.BufferAttribute;
  if (dynamic) {
    position.setUsage(THREE.DynamicDrawUsage);
    normals.setUsage(THREE.DynamicDrawUsage);
    geometry.boundingBox?.expandByScalar(0.025);
    geometry.boundingSphere!.radius += 0.04;
  }
  const point = new THREE.Vector3(),
    normal = new THREE.Vector3();
  const rotation = new THREE.Quaternion(),
    euler = new THREE.Euler();
  const pivot = new THREE.Vector3(0, 0.124, -0.088);
  let energy = 0,
    applied = false;
  return {
    geometry,
    apply(seconds: number, delta: number, speed: number, resting: boolean) {
      if (!dynamic || !Number.isFinite(delta) || delta <= 0) return;
      const dt = THREE.MathUtils.clamp(delta, 0, 0.15);
      const pace = Number.isFinite(speed) ? THREE.MathUtils.clamp(speed, 0, 2) : 0;
      energy = THREE.MathUtils.damp(energy, resting ? 0 : pace, 6, dt);
      // No independent idle oscillator. A stopped tail decays to its exact source,
      // then stops uploading unchanged buffers. Zero-delta holds return above.
      // Working if quiet wearers stay neutral and each moving wearer settles privately.
      if (energy < 0.00001) {
        energy = 0;
        if (applied) {
          position.array.set(rest.array);
          normals.array.set(restNormal.array);
          position.needsUpdate = true;
          normals.needsUpdate = true;
          applied = false;
        }
        return;
      }
      applied = true;
      const t = Number.isFinite(seconds) ? seconds : 0;
      const sway = Math.sin(t * 4.8) * energy * 0.055;
      const bounce = Math.sin(t * 9.6) * energy * 0.025;
      for (let index = 0; index < position.count; index++) {
        const weight = weights.getX(index);
        if (weight === 0) continue;
        rotation.setFromEuler(euler.set(bounce * weight, 0, sway * weight));
        point.fromBufferAttribute(rest, index).sub(pivot).applyQuaternion(rotation).add(pivot);
        normal.fromBufferAttribute(restNormal, index).applyQuaternion(rotation).normalize();
        position.setXYZ(index, point.x, point.y, point.z);
        normals.setXYZ(index, normal.x, normal.y, normal.z);
      }
      position.needsUpdate = true;
      normals.needsUpdate = true;
    },
    dispose() {
      if (dynamic) geometry.dispose();
    },
  };
}

/** Shared fittings use real metre dimensions and stay within the old mounts.
 * Working if shells/cushions read separately without extra meshes or textures.
 */
function assembleWorkerFitting(parts: THREE.BufferGeometry[]) {
  const plain = parts.map((part) => (part.index ? part.toNonIndexed() : part));
  const result = mergeGeometries(plain);
  new Set([...parts, ...plain]).forEach((part) => part.dispose());
  if (!result) throw new Error('Worker fitting attributes must match');
  result.computeBoundingBox();
  result.computeBoundingSphere();
  return result;
}
function fittingTint(geometry: THREE.BufferGeometry, value: number) {
  const colours = new Float32Array(geometry.getAttribute('position').count * 3).fill(value);
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  return geometry;
}
/** Measured in the original bodies' Head rest frames. The ear tips sit in
 * the cup aperture; the arch clears the original hard-hat crowns.
 * Working if both real rigs retain ear/dome clearance through bone motion.
 */
export const WORKER_HEARING_FIT = {
  masculine: { centre: [0.0004, 0.104, 0.032], halfWidth: 0.104, bandScaleY: 1.42 },
  feminine: { centre: [0.00035, 0.111, 0.015], halfWidth: 0.094, bandScaleY: 1.34 },
} as const;

export function createWorkerHearingCup() {
  // The inner wall and roof surround a real air chamber. A solid box here
  // crossed the ear when the cushion was moved down to its anatomical seat.
  // Working if a ray through the seal's opening first meets the inner dome.
  const shell = new THREE.LatheGeometry(
    [
      [0.027, -0.0055],
      [0.035, -0.0055],
      [0.035, 0.006],
      [0.034, 0.0075],
      [0.034, 0.009],
      [0.035, 0.0105],
      [0.033, 0.018],
      [0.027, 0.024],
      [0.016, 0.027],
      [0, 0.028],
      [0, 0.018],
      [0.018, 0.018],
      [0.025, 0.014],
      [0.027, 0.005],
      [0.027, -0.0055],
    ].map(([r, y]) => new THREE.Vector2(r, y)),
    16
  ).scale(1, 1, 0.038 / 0.035);
  const cushion = new THREE.LatheGeometry(
    [
      [0.027, -0.0125],
      [0.033, -0.0125],
      [0.035, -0.01],
      [0.035, -0.0075],
      [0.031, -0.0055],
      [0.027, -0.0055],
      [0.027, -0.0125],
    ].map(([r, y]) => new THREE.Vector2(r, y)),
    16
  );
  return assembleWorkerFitting([fittingTint(shell, 1), fittingTint(cushion, 0.22)]);
}
export function createWorkerHearingBand() {
  const band = new THREE.TorusGeometry(0.128, 0.006, 6, 24, Math.PI).scale(1, 1, 0.65);
  const parts: THREE.BufferGeometry[] = [band];
  for (const side of [-1, 1])
    parts.push(
      new RoundedBoxGeometry(0.016, 0.036, 0.014, 1, 0.003).translate(side * 0.125, 0.005, 0)
    );
  return assembleWorkerFitting(parts);
}
export function createWorkerGlassesTemple() {
  // The front end enters the lens at z=.004; the rear curls gently over the ear.
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0.056),
    new THREE.Vector3(0, 0, 0.013),
    new THREE.Vector3(0, -0.001, -0.029),
    new THREE.Vector3(0, -0.012, -0.052),
  ]);
  return new THREE.TubeGeometry(path, 9, 0.004, 6, false);
}
/** Fitted protective rims, in the unchanged lens mount's metres. The bridge
 * owns this one shared draw; optical centres stay open and temples stay separate.
 * Working if both clear lenses meet continuous bevelled rims and their bridge.
 */
export function createWorkerGlassesFrame() {
  const parts: THREE.BufferGeometry[] = [
    new THREE.CapsuleGeometry(0.005, 0.024, 2, 6).rotateZ(Math.PI / 2),
  ];
  function rounded(path: THREE.Path, w: number, h: number, r: number) {
    path.moveTo(-w + r, -h);
    path.lineTo(w - r, -h);
    path.quadraticCurveTo(w, -h, w, -h + r);
    path.lineTo(w, h - r);
    path.quadraticCurveTo(w, h, w - r, h);
    path.lineTo(-w + r, h);
    path.quadraticCurveTo(-w, h, -w, h - r);
    path.lineTo(-w, -h + r);
    path.quadraticCurveTo(-w, -h, -w + r, -h);
    path.closePath();
  }
  for (const x of [-0.047, 0.047]) {
    const rim = new THREE.Shape(),
      opening = new THREE.Path();
    rounded(rim, 0.0359, 0.0204, 0.0074);
    rounded(opening, 0.0332, 0.0177, 0.0047);
    rim.holes.push(opening);
    parts.push(
      new THREE.ExtrudeGeometry(rim, {
        depth: 0.006,
        bevelEnabled: true,
        bevelSize: 0.0006,
        bevelThickness: 0.0006,
        bevelSegments: 1,
        steps: 1,
        curveSegments: 4,
      }).translate(x, 0, -0.003)
    );
  }
  return assembleWorkerFitting(parts);
}
export function createWorkerChestRadio() {
  const parts: THREE.BufferGeometry[] = [new RoundedBoxGeometry(0.052, 0.082, 0.026, 2, 0.006)];
  for (let row = 0; row < 4; row++)
    parts.push(
      new RoundedBoxGeometry(0.031, 0.0028, 0.003, 1, 0.001).translate(
        0,
        0.015 - row * 0.008,
        0.013
      )
    );
  return assembleWorkerFitting(parts);
}

/** Rounded pouch, flap, rear belt loop and closed seam/fastener fittings.
 * Working if all details attach inside the original 75 x 105 x 45 mm envelope.
 */
export function createWorkerToolPouch() {
  const parts: THREE.BufferGeometry[] = [
    new RoundedBoxGeometry(0.075, 0.105, 0.036, 2, 0.006).translate(0, 0, 0.0005),
    new RoundedBoxGeometry(0.072, 0.039, 0.0056, 2, 0.0025).translate(0, 0.031, 0.0185),
    new RoundedBoxGeometry(0.055, 0.045, 0.002, 1, 0.0008).translate(0, 0.024, -0.0215),
    new RoundedBoxGeometry(0.012, 0.014, 0.003, 1, 0.001).translate(0, 0.025, 0.021),
    new THREE.BoxGeometry(0.055, 0.0015, 0.002).translate(0, -0.04, 0.0194),
  ];
  for (const side of [-1, 1]) {
    parts.push(
      new RoundedBoxGeometry(0.004, 0.045, 0.005, 1, 0.001).translate(side * 0.0255, 0.024, -0.0195)
    );
    parts.push(
      new THREE.BoxGeometry(0.0015, 0.058, 0.002).translate(side * 0.0275, -0.011, 0.0194)
    );
  }
  return assembleWorkerFitting(parts);
}

function createWorkerToolBelt(pouch: THREE.BufferGeometry) {
  return assembleWorkerFitting([
    new THREE.BoxGeometry(0.32, 0.026, 0.032).translate(0, 0.012, -0.035),
    pouch.clone().translate(-0.14, 0, 0),
    pouch.clone().translate(0.14, 0, 0),
  ]);
}
const TOOL_POUCH = createWorkerToolPouch();

// Immutable shared accessories. Instance disposal must never dispose these.
export const SHARED_WORKER_GEOMETRY = {
  toolPouch: TOOL_POUCH,
  toolBelt: createWorkerToolBelt(TOOL_POUCH),
  hearingCup: createWorkerHearingCup(),
  hearingBand: createWorkerHearingBand(),
  glassesTemple: createWorkerGlassesTemple(),
  identityBadge: new RoundedBoxGeometry(0.062, 0.082, 0.009, 2, 0.004),
  chestRadio: createWorkerChestRadio(),
  eyePupil: new THREE.SphereGeometry(1, 10, 6),
  glassesLens: new RoundedBoxGeometry(0.073, 0.042, 0.01, 2, 0.008),
  glassesBridge: createWorkerGlassesFrame(),
};

/** Actual skinned eye-front centres in Head local space, not raw bind vertices.
 * Working if facial fittings stay centred on both bodies throughout their clips.
 */
export const WORKER_EYE_CENTRES = {
  masculine: [0.0004, 0.108, 0.112],
  feminine: [0.00035, 0.103, 0.114],
} as const;
