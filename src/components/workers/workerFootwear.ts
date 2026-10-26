import * as THREE from 'three';

type Point = { p: THREE.Vector3; uv: THREE.Vector2; weights: Map<number, number> };
type Feature = 'toe' | 'laces';
const ATTRIBUTES = ['position', 'normal', 'uv', 'skinIndex', 'skinWeight'] as const;

/** Fitted construction in the existing private near shoe draw. Existing Foot/LowerLeg
 * weights interpolate over the actual instep triangles. Original skin/UV/topology prefixes and the
 * entire Foot-bind contact box stay exact. Working if both feet keep seated and
 * walking contact, with closed fittings and no distant draw/buffer change.
 */
export function createWorkerFootwear(source: THREE.SkinnedMesh, kind: 'boot' | 'shoe') {
  const original = source.geometry,
    a = original.attributes;
  if (
    !original.index ||
    ATTRIBUTES.some((name) => !a[name] || a[name].count !== a.position.count) ||
    Object.keys(a).some((name) => !ATTRIBUTES.includes(name as (typeof ATTRIBUTES)[number])) ||
    Object.keys(original.morphAttributes).length
  )
    return null;
  const feet = ['L', 'R'].map((side) =>
    source.skeleton.bones.findIndex((bone) => bone.name.replace(/[._]/g, '') === `Foot${side}`)
  );
  if (feet.some((joint) => joint < 0)) return null;
  const local = feet.map((joint) =>
      source.skeleton.boneInverses[joint].clone().multiply(source.bindMatrix)
    ),
    boxes = feet.map(() => new THREE.Box3()),
    bodyBox = new THREE.Box3(),
    point = new THREE.Vector3();
  for (let i = 0; i < a.position.count; i++) {
    point.fromBufferAttribute(a.position, i);
    bodyBox.expandByPoint(point);
    feet.forEach((joint, side) => {
      if (
        [0, 1, 2, 3].some(
          (c) => a.skinIndex.getComponent(i, c) === joint && a.skinWeight.getComponent(i, c) > 0.001
        )
      )
        boxes[side].expandByPoint(point.clone().applyMatrix4(local[side]));
    });
  }
  if (boxes.some((box) => box.isEmpty())) return null;
  const lowerLegs = feet.map((_, side) =>
    source.skeleton.bones.findIndex(
      (bone) => bone.name.replace(/[._]/g, '') === `LowerLeg${['L', 'R'][side]}`
    )
  );
  if (lowerLegs.some((joint) => joint < 0)) return null;
  const vertexWeights = (i: number) => {
    const result = new Map<number, number>();
    for (let c = 0; c < 4; c++) {
      const w = a.skinWeight.getComponent(i, c);
      if (w > 0) result.set(a.skinIndex.getComponent(i, c), w);
    }
    return result;
  };
  const belongs = (i: number, side: number) => {
    const weights = vertexWeights(i);
    return (
      weights.size > 0 &&
      [...weights].every(
        ([joint, w]) => Number.isFinite(w) && [feet[side], lowerLegs[side]].includes(joint)
      ) &&
      Math.abs([...weights.values()].reduce((a, b) => a + b, 0) - 1) < 1e-5
    );
  };
  const triangles: { ids: number[]; side: number; points: Point[] }[] = [],
    tops = feet.map(() => new THREE.Box3());
  for (let i = 0; i < a.position.count; i++)
    feet.forEach((joint, side) => {
      if ((vertexWeights(i).get(joint) ?? 0) > 0.001)
        tops[side].expandByPoint(point.fromBufferAttribute(a.position, i));
    });
  for (let i = 0; i < original.index.count; i += 3) {
    const ids = [0, 1, 2].map((c) => original.index!.getX(i + c)),
      side = feet.findIndex(
        (joint, side) =>
          ids.every((id) => belongs(id, side)) &&
          ids.some((id) => (vertexWeights(id).get(joint) ?? 0) > 0.05)
      );
    if (side < 0 || ids.some((id) => a.position.getY(id) > 0.16)) continue;
    const points = ids.map((id) => ({
        p: new THREE.Vector3().fromBufferAttribute(a.position, id),
        uv: new THREE.Vector2(a.uv.getX(id), a.uv.getY(id)),
        weights: vertexWeights(id),
      })),
      normal = new THREE.Triangle(
        ...(points.map((v) => v.p) as [THREE.Vector3, THREE.Vector3, THREE.Vector3])
      ).getNormal(new THREE.Vector3());
    if (normal.y <= 0.7) continue;
    triangles.push({ ids, side, points });
  }
  if (tops.some((box) => box.isEmpty())) return null;
  const positions: number[] = [],
    uvs: number[] = [],
    skin: Map<number, number>[] = [],
    indices: number[] = [],
    tones: THREE.Color[] = [],
    wallEdges = new Map<string, number[]>(),
    patches: {
      side: number;
      feature: Feature;
      start: number;
      vertices: number;
      donor: number[];
      cut: number;
    }[] = [];
  const material = source.material as THREE.MeshStandardMaterial;
  if (!material.isMeshStandardMaterial || Array.isArray(source.material)) return null;
  const lace = new THREE.Color('#a59c7c');
  lace.setRGB(lace.r / material.color.r, lace.g / material.color.g, lace.b / material.color.b);
  if (!lace.toArray().every(Number.isFinite)) return null;
  // Parallel lift preserves shared roof edges across faceted donor triangles.
  const lift = new THREE.Vector3(0, 1, 0);
  const clip = (polygon: Point[], distance: (p: THREE.Vector3) => number) => {
    const result: Point[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i],
        b = polygon[(i + 1) % polygon.length],
        da = distance(a.p),
        db = distance(b.p);
      if (da >= 0) result.push(a);
      if (da < 0 !== db < 0) {
        const t = da / (da - db);
        const weights = new Map<number, number>();
        for (const joint of new Set([...a.weights.keys(), ...b.weights.keys()]))
          weights.set(
            joint,
            (a.weights.get(joint) ?? 0) * (1 - t) + (b.weights.get(joint) ?? 0) * t
          );
        result.push({ p: a.p.clone().lerp(b.p, t), uv: a.uv.clone().lerp(b.uv, t), weights });
      }
    }
    return result.filter(
      (v, i) => v.p.distanceToSquared(result[(i + 1) % result.length].p) > 1e-14
    );
  };
  function ribbon(
    polygon: Point[],
    side: number,
    feature: Feature,
    over: boolean,
    donor: number[],
    cut: number
  ) {
    if (polygon.length < 3) return;
    const outer = polygon.map((v) =>
        v.p.clone().addScaledVector(lift, feature === 'laces' ? (over ? 0.0026 : 0.002) : 0.001)
      ),
      inner = polygon.map((v) => v.p.clone().addScaledVector(lift, -0.0006)),
      points = [...inner, ...outer].map(
        (v) => new THREE.Vector3(Math.fround(v.x), Math.fround(v.y), Math.fround(v.z))
      );
    if (
      points.some(
        (p) =>
          !bodyBox.containsPoint(p) ||
          !boxes[side].containsPoint(p.clone().applyMatrix4(local[side]))
      )
    )
      return;
    const start = positions.length / 3,
      n = polygon.length,
      faces: number[] = [];
    for (let i = 1; i < n - 1; i++) faces.push(n, n + i, n + i + 1, 0, i + 1, i);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      faces.push(i, j, n + j, i, n + j, n + i);
    }
    const triangle = new THREE.Triangle();
    for (let i = 0; i < faces.length; i += 3)
      if (
        triangle.set(points[faces[i]], points[faces[i + 1]], points[faces[i + 2]]).getArea() < 1e-12
      )
        return;
    points.forEach((p, i) => {
      positions.push(...p.toArray());
      uvs.push(...polygon[i % n].uv.toArray());
      skin.push(polygon[i % n].weights);
      tones.push(feature === 'laces' ? lace : new THREE.Color(0.62, 0.62, 0.62));
    });
    // Adjacent donor triangles meet along one fitted ribbon. Cancel their
    // internal side walls, retaining closed continuous outer construction.
    for (let i = 0; i < n; i++) {
      const key = [polygon[i].p, polygon[(i + 1) % n].p]
          .map((p) =>
            p
              .toArray()
              .map((v) => Math.round(v * 1e6))
              .join(',')
          )
          .sort()
          .join('/'),
        edge = side + ':' + cut + ':' + key;
      const entries = wallEdges.get(edge) ?? [];
      entries.push(indices.length + (n - 2) * 6 + i * 6);
      wallEdges.set(edge, entries);
    }
    indices.push(...faces.map((v) => start + v));
    patches.push({
      side,
      feature,
      start,
      vertices: points.length,
      donor,
      cut,
    });
  }
  const cuts = [
    { feature: 'toe', row: 0.83, slope: 0 },
    { feature: 'laces', row: 0.6, slope: -0.35 },
    { feature: 'laces', row: 0.6, slope: 0.35 },
    { feature: 'laces', row: 0.72, slope: 0 },
  ] as const;
  for (const { ids, side, points } of triangles) {
    const box = tops[side],
      width = box.max.x - box.min.x,
      length = box.max.z - box.min.z,
      centre = (box.min.x + box.max.x) / 2;
    for (const [cut, { feature, row, slope }] of cuts.entries()) {
      const z = box.min.z + length * row,
        halfWidth = width * (feature === 'toe' ? 0.35 : 0.27),
        thickness = feature === 'toe' ? 0.001 : 0.0015,
        line = (p: THREE.Vector3) => p.z - z + slope * (p.x - centre);
      let polygon = clip(points, (p) => p.x - centre + halfWidth);
      polygon = clip(polygon, (p) => centre + halfWidth - p.x);
      polygon = clip(polygon, (p) => thickness - line(p));
      polygon = clip(polygon, (p) => thickness + line(p));
      ribbon(polygon, side, feature, slope > 0, ids, cut);
    }
  }
  const internal = new Set<number>();
  for (const edges of wallEdges.values()) {
    if (edges.length > 2) return null;
    if (edges.length === 2)
      for (const start of edges) for (let i = 0; i < 6; i++) internal.add(start + i);
  }
  const shell = indices.filter((_, i) => !internal.has(i));
  if (
    !shell.length ||
    shell.length / 3 > 640 ||
    feet.some((_, side) =>
      cuts.some((_, cut) => !patches.some((p) => p.side === side && p.cut === cut))
    )
  )
    return null;
  const detail = new THREE.BufferGeometry();
  detail.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  detail.setIndex(shell);
  detail.computeVertexNormals();
  const geometry = original.clone(),
    count = a.position.count + positions.length / 3;
  for (const name of ATTRIBUTES) {
    const attribute = a[name],
      interleaved = attribute instanceof THREE.InterleavedBufferAttribute,
      array = interleaved ? attribute.data.array : attribute.array,
      Constructor = array.constructor as { new (length: number): typeof array },
      copy = new THREE.BufferAttribute(
        new Constructor(count * attribute.itemSize),
        attribute.itemSize,
        attribute.normalized
      );
    copy.gpuType = (attribute as THREE.BufferAttribute).gpuType ?? THREE.FloatType;
    copy.setUsage(interleaved ? attribute.data.usage : attribute.usage);
    for (let i = 0; i < count; i++)
      for (let c = 0; c < attribute.itemSize; c++) {
        const j = i - a.position.count;
        const value =
          j < 0
            ? attribute.getComponent(i, c)
            : name === 'position'
              ? positions[j * 3 + c]
              : name === 'normal'
                ? detail.attributes.normal.getComponent(j, c)
                : name === 'uv'
                  ? uvs[j * 2 + c]
                  : name === 'skinIndex'
                    ? ([...skin[j].keys()][c] ?? 0)
                    : ([...skin[j].values()][c] ?? 0);
        copy.setComponent(i, c, value);
      }
    geometry.setAttribute(name, copy);
  }
  const colours = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const y = i < a.position.count ? a.position.getY(i) : 1,
      tone = kind === 'shoe' && y < 0.022 ? 0.48 : kind === 'shoe' && y < 0.032 ? 1.3 : 1;
    colours.set(
      i < a.position.count ? [tone, tone, tone] : tones[i - a.position.count].toArray(),
      i * 3
    );
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  geometry.setIndex([
    ...Array.from({ length: original.index.count }, (_, i) => original.index!.getX(i)),
    ...shell.map((i) => i + a.position.count),
  ]);
  geometry.name = 'worker-fitted-footwear';
  geometry.userData.workerFootwear = {
    originalVertices: a.position.count,
    originalIndices: original.index.count,
    addedTriangles: shell.length / 3,
    patches,
  };
  detail.dispose();
  return geometry;
}
