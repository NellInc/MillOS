import * as THREE from 'three';

type Corner = { point: THREE.Vector3; donor: number };
type Edge = [number, number];
const EPSILON = 1e-7;
const CLEARANCE = 0.001;

/** Private, rigidly skinned recessed hems for the known feminine trouser export.
 * Unsupported inputs keep their authored geometry. Working if the shell's
 * oriented boundary closes without changing any original attribute bytes.
 */
export function createWorkerCuffSockets(
  trousers: THREE.SkinnedMesh,
  ankleSkin: THREE.SkinnedMesh
): THREE.BufferGeometry | null {
  const source = trousers.geometry;
  const skin = ankleSkin.geometry;
  const attributes = source.attributes;
  const allowed = ['position', 'normal', 'uv', 'skinIndex', 'skinWeight'];
  if (
    !source.index ||
    source.index.count % 3 !== 0 ||
    source.groups.length > 1 ||
    (source.groups.length === 1 &&
      (source.groups[0].start !== 0 || source.groups[0].count !== source.index.count)) ||
    source.drawRange.start !== 0 ||
    source.drawRange.count !== Infinity ||
    Object.keys(source.morphAttributes).length ||
    Object.keys(skin.morphAttributes).length ||
    Object.keys(attributes).some((name) => !allowed.includes(name)) ||
    allowed.some((name) => !attributes[name]) ||
    trousers.skeleton !== ankleSkin.skeleton ||
    trousers.bindMode !== ankleSkin.bindMode ||
    !trousers.bindMatrix.equals(ankleSkin.bindMatrix) ||
    !trousers.bindMatrixInverse.equals(ankleSkin.bindMatrixInverse) ||
    !trousers.matrixWorld.equals(ankleSkin.matrixWorld)
  )
    return null;
  const p = attributes.position;
  const skinP = skin.getAttribute('position');
  const skinJ = skin.getAttribute('skinIndex');
  const skinW = skin.getAttribute('skinWeight');
  if (
    !skinP ||
    !skinJ ||
    !skinW ||
    p.count === 0 ||
    skinP.itemSize !== 3 ||
    skinJ.itemSize !== 4 ||
    skinW.itemSize !== 4 ||
    skinJ.count !== skinP.count ||
    skinW.count !== skinP.count ||
    (skin.index?.count ?? skinP.count) % 3 !== 0
  )
    return null;
  for (const name of allowed) {
    const attribute = attributes[name];
    if (
      (!(attribute instanceof THREE.BufferAttribute) &&
        !(attribute instanceof THREE.InterleavedBufferAttribute)) ||
      attribute.normalized ||
      attribute.count !== p.count ||
      attribute.itemSize !== (name === 'uv' ? 2 : name.startsWith('skin') ? 4 : 3)
    )
      return null;
  }
  const position = (i: number) => new THREE.Vector3().fromBufferAttribute(p, i);
  const rigidJoint = (
    index: number,
    joints: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
    weights: THREE.BufferAttribute | THREE.InterleavedBufferAttribute
  ) => {
    let joint = -1;
    for (let c = 0; c < 4; c++) {
      const weight = weights.getComponent(index, c);
      if (weight === 0) continue;
      if (weight !== 1 || joint !== -1) return -1;
      joint = joints.getComponent(index, c);
    }
    return Number.isInteger(joint) &&
      /^LowerLeg[.]?[LR]$/.test(trousers.skeleton.bones[joint]?.name ?? '')
      ? joint
      : -1;
  };
  const keys = new Map<string, number>();
  const representatives: number[] = [];
  const welded: number[] = [];
  for (let i = 0; i < p.count; i++) {
    const values = [p.getX(i), p.getY(i), p.getZ(i)];
    const influences: [number, number][] = [];
    for (let c = 0; c < 4; c++) {
      const joint = attributes.skinIndex.getComponent(i, c);
      const weight = attributes.skinWeight.getComponent(i, c);
      if (
        !Number.isInteger(joint) ||
        joint < 0 ||
        joint >= trousers.skeleton.bones.length ||
        !Number.isFinite(weight) ||
        weight < 0
      )
        return null;
      if (weight > 0) influences.push([joint, weight]);
    }
    if (!values.every(Number.isFinite)) return null;
    for (const name of ['normal', 'uv'])
      for (let c = 0; c < attributes[name].itemSize; c++)
        if (!Number.isFinite(attributes[name].getComponent(i, c))) return null;
    // Exact positions and effective skin weights weld split export corners;
    // unused weight slots do not create a fictitious physical boundary.
    influences.sort(([a], [b]) => a - b);
    const key = `${values.join(',')};${JSON.stringify(influences)}`;
    let id = keys.get(key);
    if (id === undefined) {
      id = representatives.length;
      keys.set(key, id);
      representatives.push(i);
    }
    welded.push(id);
  }
  const edgeKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);
  const capEdges = new Map<string, Edge[]>();
  const shellEdges = new Map<string, Edge[]>();
  const removedCapOffsets: number[] = [];
  const retained: number[] = [];
  const capVertices: number[] = [];
  const originalTriangles: THREE.Triangle[] = [];
  const originalIndex = source.index;
  for (let offset = 0; offset < originalIndex.count; offset += 3) {
    const ids = [0, 1, 2].map((c) => originalIndex.getX(offset + c));
    if (ids.some((i) => !Number.isInteger(i) || i < 0 || i >= p.count)) return null;
    const triangle = new THREE.Triangle(
      ...(ids.map(position) as [THREE.Vector3, THREE.Vector3, THREE.Vector3])
    );
    if (triangle.getArea() < 1e-10) return null;
    originalTriangles.push(triangle);
    const cap =
      triangle.getMidpoint(new THREE.Vector3()).y < 0.18 &&
      triangle.getNormal(new THREE.Vector3()).y < -0.9;
    if (cap) {
      if (ids.some((i) => rigidJoint(i, attributes.skinIndex, attributes.skinWeight) < 0))
        return null;
      removedCapOffsets.push(offset);
      capVertices.push(...ids);
    } else retained.push(...ids);
    const map = cap ? capEdges : shellEdges;
    for (let c = 0; c < 3; c++) {
      const a = welded[ids[c]],
        b = welded[ids[(c + 1) % 3]];
      const key = edgeKey(a, b);
      const edges = map.get(key) ?? [];
      edges.push([a, b]);
      map.set(key, edges);
    }
  }
  if (removedCapOffsets.length !== 54) return null;
  const boundary: Edge[] = [];
  for (const [key, edges] of capEdges) {
    if (edges.length === 2) {
      if (edges[0][0] !== edges[1][1] || edges[0][1] !== edges[1][0]) return null;
    } else if (edges.length === 1) {
      const opposite = shellEdges.get(key);
      if (
        opposite?.length !== 1 ||
        opposite[0][0] !== edges[0][1] ||
        opposite[0][1] !== edges[0][0]
      )
        return null;
      boundary.push(edges[0]);
    } else return null;
  }
  if (boundary.length !== 18) return null;
  const next = new Map<number, number>();
  const incoming = new Set<number>();
  for (const [a, b] of boundary) {
    if (next.has(a) || incoming.has(b)) return null;
    next.set(a, b);
    incoming.add(b);
  }
  const loops: number[][] = [];
  const visited = new Set<number>();
  for (const [start] of boundary) {
    if (visited.has(start)) continue;
    const loop: number[] = [];
    let current = start;
    while (!visited.has(current)) {
      visited.add(current);
      loop.push(representatives[current]);
      const successor = next.get(current);
      if (successor === undefined) return null;
      current = successor;
    }
    if (current !== start || loop.length !== 9) return null;
    loops.push(loop);
  }
  if (loops.length !== 2) return null;
  const corners: Corner[] = [];
  const patchIndices: number[] = [];
  const socketData: object[] = [];
  const patchTriangles: THREE.Triangle[] = [];
  const addTriangle = (a: Corner, b: Corner, c: Corner) => {
    const triangle = new THREE.Triangle(a.point, b.point, c.point);
    if (triangle.getArea() < 1e-10) return false;
    const start = p.count + corners.length;
    corners.push(a, b, c);
    patchIndices.push(start, start + 1, start + 2);
    patchTriangles.push(triangle);
    return true;
  };
  for (const loop of loops) {
    const joint = rigidJoint(loop[0], attributes.skinIndex, attributes.skinWeight);
    if (
      joint < 0 ||
      loop.some((i) => rigidJoint(i, attributes.skinIndex, attributes.skinWeight) !== joint)
    )
      return null;
    const skinPoints: THREE.Vector3[] = [];
    for (let i = 0; i < skinP.count; i++) {
      const point = new THREE.Vector3().fromBufferAttribute(skinP, i);
      if (!Number.isFinite(point.lengthSq())) return null;
      if (point.y > 0.14 && point.y < 0.22 && Math.sign(point.x) === Math.sign(p.getX(loop[0]))) {
        if (rigidJoint(i, skinJ, skinW) !== joint) return null;
        skinPoints.push(point);
      }
    }
    if (skinPoints.length < 9) return null;
    const skinTop = Math.max(...skinPoints.map((v) => v.y));
    const topPoints = skinPoints.filter((v) => Math.abs(v.y - skinTop) < EPSILON);
    const centre = new THREE.Vector3();
    // Weld split corners before measuring the ankle centre.
    const uniqueTop = [...new Map(topPoints.map((v) => [v.toArray().join(','), v])).values()];
    uniqueTop.forEach((v) => centre.add(v));
    centre.divideScalar(uniqueTop.length);
    const outer = loop.map((donor) => ({ point: position(donor), donor }));
    const capMinimum = Math.min(
      ...capVertices
        .filter((i) => rigidJoint(i, attributes.skinIndex, attributes.skinWeight) === joint)
        .map((i) => p.getY(i))
    );
    const lipY = capMinimum;
    const roofY = skinTop + 0.004;
    if (lipY < 0.13 || roofY > 0.23 || roofY <= Math.max(...outer.map((v) => v.point.y)))
      return null;
    const inner = outer.map(({ point, donor }) => ({
      point: new THREE.Vector3(
        centre.x + (point.x - centre.x) * 0.9,
        lipY,
        centre.z + (point.z - centre.z) * 0.9
      ),
      donor,
    }));
    // The bevel descends inward. A flat ring at the cap minimum falls outside
    // its sloping outer envelope, so inset the lip from the actual cap surface.
    for (const corner of inner) {
      const ray = new THREE.Ray(
        new THREE.Vector3(corner.point.x, 0.3, corner.point.z),
        new THREE.Vector3(0, -1, 0)
      );
      let floor = -Infinity;
      for (const offset of removedCapOffsets) {
        const points = [0, 1, 2].map((c) => position(originalIndex.getX(offset + c)));
        const hit = ray.intersectTriangle(
          points[0],
          points[1],
          points[2],
          false,
          new THREE.Vector3()
        );
        if (hit) floor = Math.max(floor, hit.y);
      }
      if (!Number.isFinite(floor)) return null;
      corner.point.y = floor + 0.002;
    }
    const roof = inner.map(({ point, donor }) => ({
      point: new THREE.Vector3(point.x, roofY, point.z),
      donor,
    }));
    const roofCentre = { point: new THREE.Vector3(centre.x, roofY, centre.z), donor: loop[0] };
    // These directed edges follow the removed cap, cancelling the retained shell.
    for (let i = 0; i < loop.length; i++) {
      const j = (i + 1) % loop.length;
      if (
        !addTriangle(outer[i], outer[j], inner[j]) ||
        !addTriangle(outer[i], inner[j], inner[i]) ||
        !addTriangle(inner[i], inner[j], roof[j]) ||
        !addTriangle(inner[i], roof[j], roof[i]) ||
        !addTriangle(roof[i], roof[j], roofCentre)
      )
        return null;
    }
    socketData.push({
      joint,
      bone: trousers.skeleton.bones[joint].name,
      donorIndices: loop,
      centre: centre.toArray(),
      innerScale: 0.9,
      lipY,
      innerHeights: inner.map((v) => v.point.y),
      roofY,
      skinTop,
      roofClearance: roofY - skinTop,
      outer: outer.map((v) => v.point.toArray()),
      inner: inner.map((v) => v.point.toArray()),
    });
  }
  // Reject any intersection or sub-millimetre separation from the actual skin,
  // including the lip and wall. Roof height alone cannot establish a cavity.
  const skinAt = (i: number) => skin.index?.getX(i) ?? i;
  const skinTriangles: THREE.Triangle[] = [];
  for (let i = 0; i < (skin.index?.count ?? skinP.count); i += 3) {
    const ids = [0, 1, 2].map((c) => skinAt(i + c));
    if (ids.some((index) => !Number.isInteger(index) || index < 0 || index >= skinP.count))
      return null;
    const points = ids.map((index) => new THREE.Vector3().fromBufferAttribute(skinP, index));
    if (points.some((point) => !Number.isFinite(point.lengthSq()))) return null;
    skinTriangles.push(
      new THREE.Triangle(...(points as [THREE.Vector3, THREE.Vector3, THREE.Vector3]))
    );
  }
  const box = (triangle: THREE.Triangle) =>
    new THREE.Box3().setFromPoints([triangle.a, triangle.b, triangle.c]);
  const skinBoxes = skinTriangles.map(box);
  const boxGap = (a: THREE.Box3, b: THREE.Box3) =>
    Math.hypot(
      Math.max(0, a.min.x - b.max.x, b.min.x - a.max.x),
      Math.max(0, a.min.y - b.max.y, b.min.y - a.max.y),
      Math.max(0, a.min.z - b.max.z, b.min.z - a.max.z)
    );
  let minimumSkinClearance = Infinity;
  const clearanceBySurface = { lip: Infinity, wall: Infinity, roof: Infinity };
  for (const [patchIndex, a] of patchTriangles.entries()) {
    const part = patchIndex % 5 < 2 ? 'lip' : patchIndex % 5 < 4 ? 'wall' : 'roof';
    const bounds = box(a);
    for (const [skinIndex, b] of skinTriangles.entries()) {
      if (boxGap(bounds, skinBoxes[skinIndex]) > clearanceBySurface[part]) continue;
      const distance = triangleDistance(a, b);
      if (!Number.isFinite(distance) || distance < CLEARANCE) return null;
      minimumSkinClearance = Math.min(minimumSkinClearance, distance);
      clearanceBySurface[part] = Math.min(clearanceBySurface[part], distance);
    }
  }
  // Prove that the replacement does not cross the original closed volume.
  // Contacts on the preserved outer boundary are the only allowed contacts.
  const boundaryLines = boundary.map(
    ([a, b]) => new THREE.Line3(position(representatives[a]), position(representatives[b]))
  );
  const onBoundary = (point: THREE.Vector3) =>
    boundaryLines.some(
      (line) =>
        line.closestPointToPoint(point, true, new THREE.Vector3()).distanceToSquared(point) <=
        EPSILON * EPSILON
    );
  const crosses = (a: THREE.Triangle, b: THREE.Triangle) => {
    const points = [a.a, a.b, a.c];
    const normal = b.getNormal(new THREE.Vector3());
    if (points.every((point) => Math.abs(normal.dot(point.clone().sub(b.a))) < EPSILON)) {
      // Ray/triangle intersection intentionally omits coplanar contacts. Clip
      // them in the triangle plane so an overlapping patch cannot slip through.
      let polygon = points;
      const other = [b.a, b.b, b.c];
      for (let side = 0; side < 3 && polygon.length; side++) {
        const origin = other[side],
          tangent = other[(side + 1) % 3].clone().sub(origin);
        const signed = (point: THREE.Vector3) =>
          normal.dot(tangent.clone().cross(point.clone().sub(origin)));
        const clipped: THREE.Vector3[] = [];
        for (let i = 0; i < polygon.length; i++) {
          const start = polygon[i],
            end = polygon[(i + 1) % polygon.length];
          const from = signed(start),
            to = signed(end);
          if (from >= 0) clipped.push(start);
          if (from < 0 !== to < 0) clipped.push(start.clone().lerp(end, from / (from - to)));
        }
        polygon = clipped;
      }
      if (polygon.some((point) => !onBoundary(point))) return true;
    }
    for (let i = 0; i < 3; i++) {
      const start = points[i],
        direction = points[(i + 1) % 3].clone().sub(start);
      const length = direction.length();
      if (!length) return true;
      const hit = new THREE.Ray(start, direction.divideScalar(length)).intersectTriangle(
        b.a,
        b.b,
        b.c,
        false,
        new THREE.Vector3()
      );
      if (hit && hit.distanceTo(start) <= length + EPSILON && !onBoundary(hit)) return true;
    }
    return false;
  };
  const originalBoxes = originalTriangles.map((triangle) => box(triangle).expandByScalar(EPSILON));
  for (const patch of patchTriangles) {
    const bounds = box(patch);
    for (const [index, original] of originalTriangles.entries()) {
      if (!bounds.intersectsBox(originalBoxes[index])) continue;
      if (crosses(patch, original) || crosses(original, patch)) return null;
    }
  }
  // With no shell crossings, an interior seed per connected socket decides
  // which side of the original shell the entire replacement occupies.
  for (const data of socketData as { centre: number[]; roofY: number }[]) {
    const seed = new THREE.Vector3(data.centre[0], data.roofY, data.centre[2]);
    const ray = new THREE.Ray(seed, new THREE.Vector3(0.811, 0.331, 0.483).normalize());
    const hits: number[] = [];
    for (const original of originalTriangles) {
      const hit = ray.intersectTriangle(
        original.a,
        original.b,
        original.c,
        false,
        new THREE.Vector3()
      );
      if (hit) {
        const distance = hit.distanceTo(seed);
        if (distance < EPSILON) return null;
        if (!hits.some((value) => Math.abs(value - distance) < EPSILON)) hits.push(distance);
      }
    }
    if (hits.length % 2 !== 1) return null;
  }
  // Check closure in physical position + compatible skin space, so split normals
  // cannot hide cracks, doubled edges or a backwards-facing replacement.
  const closure = new Map<string, { count: number; direction: number }>();
  const pointKey = (point: THREE.Vector3, donor: number) =>
    `${point.toArray().join(',')};${rigidJoint(donor, attributes.skinIndex, attributes.skinWeight)}`;
  const edge = (a: string, b: string) => {
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    const state = closure.get(key) ?? { count: 0, direction: 0 };
    state.count++;
    state.direction += a < b ? 1 : -1;
    closure.set(key, state);
  };
  for (const [a, b] of boundary)
    edge(
      pointKey(position(representatives[b]), representatives[b]),
      pointKey(position(representatives[a]), representatives[a])
    );
  for (let i = 0; i < corners.length; i += 3)
    for (let c = 0; c < 3; c++) {
      const a = corners[i + c],
        b = corners[i + ((c + 1) % 3)];
      edge(pointKey(a.point, a.donor), pointKey(b.point, b.donor));
    }
  if ([...closure.values()].some((value) => value.count !== 2 || value.direction !== 0))
    return null;
  const result = source.clone();
  for (const name of allowed) {
    const original = attributes[name];
    const Constructor = original.array.constructor as { new (length: number): THREE.TypedArray };
    const array = new Constructor((p.count + corners.length) * original.itemSize);
    // Preserve logical component bytes, discarding only interleaved padding.
    for (let i = 0; i < p.count; i++)
      for (let c = 0; c < original.itemSize; c++) {
        const offset =
          original instanceof THREE.InterleavedBufferAttribute
            ? i * original.data.stride + original.offset + c
            : i * original.itemSize + c;
        array[i * original.itemSize + c] = original.array[offset];
      }
    for (let i = 0; i < corners.length; i++) {
      const corner = corners[i];
      const normal = patchTriangles[Math.floor(i / 3)].getNormal(new THREE.Vector3());
      const values =
        name === 'position'
          ? corner.point.toArray()
          : name === 'normal'
            ? normal.toArray()
            : Array.from({ length: original.itemSize }, (_, c) =>
                original.getComponent(corner.donor, c)
              );
      if (
        !values.every(Number.isFinite) ||
        (name === 'normal' && Math.abs(normal.length() - 1) > EPSILON)
      ) {
        result.dispose();
        return null;
      }
      array.set(values, (p.count + i) * original.itemSize);
    }
    const attribute = new THREE.BufferAttribute(array, original.itemSize, original.normalized);
    attribute.gpuType = (original as THREE.BufferAttribute).gpuType ?? THREE.FloatType;
    attribute.setUsage(
      original instanceof THREE.InterleavedBufferAttribute ? original.data.usage : original.usage
    );
    result.setAttribute(name, attribute);
  }
  result.setIndex([...retained, ...patchIndices]);
  result.clearGroups();
  if (source.groups.length)
    result.addGroup(0, retained.length + patchIndices.length, source.groups[0].materialIndex);
  result.userData.workerCuffSockets = {
    removedCapOffsets,
    originalVertexCount: p.count,
    originalIndexCount: originalIndex.count,
    retainedIndexCount: retained.length,
    addedVertexCount: corners.length,
    addedTriangles: patchTriangles.length,
    minimumSkinClearance,
    clearanceBySurface,
    sockets: socketData,
  };
  result.computeBoundingBox();
  result.computeBoundingSphere();
  return result;
}

function triangleDistance(a: THREE.Triangle, b: THREE.Triangle): number {
  const av = [a.a, a.b, a.c],
    bv = [b.a, b.b, b.c];
  let distance = Infinity;
  const closest = new THREE.Vector3();
  for (const point of av)
    distance = Math.min(distance, point.distanceTo(b.closestPointToPoint(point, closest)));
  for (const point of bv)
    distance = Math.min(distance, point.distanceTo(a.closestPointToPoint(point, closest)));
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) {
      const p = av[i],
        q = av[(i + 1) % 3],
        r = bv[j],
        s = bv[(j + 1) % 3];
      const direction = q.clone().sub(p),
        length = direction.length();
      if (length > 0) {
        const hit = new THREE.Ray(p, direction.divideScalar(length)).intersectTriangle(
          b.a,
          b.b,
          b.c,
          false,
          new THREE.Vector3()
        );
        if (hit && hit.distanceTo(p) <= length + EPSILON) return 0;
      }
      const reverse = s.clone().sub(r),
        reverseLength = reverse.length();
      if (reverseLength > 0) {
        const hit = new THREE.Ray(r, reverse.divideScalar(reverseLength)).intersectTriangle(
          a.a,
          a.b,
          a.c,
          false,
          new THREE.Vector3()
        );
        if (hit && hit.distanceTo(r) <= reverseLength + EPSILON) return 0;
      }
      // Closest points on two finite segments, including parallel edges.
      const u = q.clone().sub(p),
        v = s.clone().sub(r),
        w = p.clone().sub(r);
      const aa = u.dot(u),
        bb = u.dot(v),
        cc = v.dot(v),
        dd = u.dot(w),
        ee = v.dot(w);
      const denominator = aa * cc - bb * bb;
      let t =
        denominator > 1e-20 ? THREE.MathUtils.clamp((bb * ee - cc * dd) / denominator, 0, 1) : 0;
      let k = cc > 0 ? (bb * t + ee) / cc : 0;
      if (k < 0) {
        k = 0;
        t = aa > 0 ? THREE.MathUtils.clamp(-dd / aa, 0, 1) : 0;
      } else if (k > 1) {
        k = 1;
        t = aa > 0 ? THREE.MathUtils.clamp((bb - dd) / aa, 0, 1) : 0;
      }
      distance = Math.min(
        distance,
        p.clone().addScaledVector(u, t).distanceTo(r.clone().addScaledVector(v, k))
      );
    }
  return distance;
}
