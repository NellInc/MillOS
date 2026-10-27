import * as THREE from 'three';
import { createCowRestPose, sampleCowRest } from '../../simulation/creatureMotion';

type Region = 'leftEar' | 'rightEar' | 'tail' | 'breath';
const smooth = THREE.MathUtils.smoothstep;
function weight(region: Region, x: number, y: number, z: number) {
  if (region === 'tail') return 1 - smooth(y, 0.78, 0.92);
  if (region === 'breath')
    return (
      smooth(y, 0.5, 0.64) *
      (1 - smooth(y, 0.94, 1.02)) *
      smooth(z, -0.55, -0.4) *
      (1 - smooth(z, 0.12, 0.26)) *
      smooth(Math.abs(x), 0.16, 0.23)
    );
  return smooth(Math.abs(x), 0.19, 0.25);
}

/** Real CowBody regions in immutable rest metres, before the corrected skin.
 * Working if ears/tail/flanks move independently, hooves/horns stay exact and
 * disposal restores the post-walking geometry before its owner releases it.
 */
export function createCowRestMotion(model: THREE.Object3D) {
  const mesh = model.getObjectByName('CowBody') as THREE.SkinnedMesh | undefined;
  const source = mesh?.geometry;
  if (
    !mesh?.isSkinnedMesh ||
    source?.attributes.position?.count !== 4138 ||
    source.index?.count !== 17958 ||
    !source.attributes.normal ||
    !source.attributes.skinWeight
  )
    return null;
  model.updateWorldMatrix(true, false);
  model.updateMatrixWorld(true);
  const toModel = new THREE.Matrix4().copy(model.matrixWorld).invert().multiply(mesh.matrixWorld);
  const toMesh = toModel.clone().invert();
  const normalToModel = new THREE.Matrix3().getNormalMatrix(toModel);
  const normalToMesh = new THREE.Matrix3().getNormalMatrix(toMesh);
  const points: THREE.Vector3[] = [],
    ids: number[] = [],
    nodes: THREE.Vector3[] = [];
  const weld = new Map<string, number>();
  for (let i = 0; i < source.attributes.position.count; i++) {
    const point = new THREE.Vector3()
      .fromBufferAttribute(source.attributes.position, i)
      .applyMatrix4(toModel);
    points.push(point);
    const key = point
      .toArray()
      .map((v) => v.toFixed(5))
      .join(',');
    if (!weld.has(key)) {
      weld.set(key, nodes.length);
      nodes.push(point);
    }
    ids.push(weld.get(key)!);
  }
  const edges = nodes.map(() => new Set<number>());
  for (let i = 0; i < source.index.count; i += 3)
    for (const [a, b] of [
      [0, 1],
      [1, 2],
      [2, 0],
    ]) {
      const x = ids[source.index.getX(i + a)],
        y = ids[source.index.getX(i + b)];
      edges[x].add(y);
      edges[y].add(x);
    }
  // Weld only the analysis graph. The ears and horns are separate branches;
  // the hanging tail is separate from the nearby inner hind-hoof surface.
  const component = (allowed: (p: THREE.Vector3) => boolean, seed: THREE.Vector3) => {
    let start = -1,
      distance = Infinity;
    nodes.forEach((p, i) => {
      const d = p.distanceToSquared(seed);
      if (allowed(p) && d < distance) {
        start = i;
        distance = d;
      }
    });
    if (start < 0) return new Set<number>();
    const queue = [start],
      found = new Set(queue);
    for (let i = 0; i < queue.length; i++)
      for (const next of edges[queue[i]])
        if (!found.has(next) && allowed(nodes[next])) {
          found.add(next);
          queue.push(next);
        }
    return new Set(ids.flatMap((id, i) => (found.has(id) ? [i] : [])));
  };
  const regions = {
    leftEar: component(
      (p) => p.x > 0.19 && p.y > 0.98 && p.z > 0.43,
      new THREE.Vector3(0.31, 1.09, 0.51)
    ),
    rightEar: component(
      (p) => p.x < -0.19 && p.y > 0.98 && p.z > 0.43,
      new THREE.Vector3(-0.26, 1.09, 0.66)
    ),
    tail: component(
      (p) => p.x > 0.04 && p.x < 0.25 && p.z < -0.8 && p.y < 0.95,
      new THREE.Vector3(0.12, 0.34, -0.87)
    ),
  };
  if (regions.leftEar.size !== 41 || regions.rightEar.size !== 27 || regions.tail.size !== 437)
    return null;
  const names: Region[] = ['leftEar', 'rightEar', 'tail', 'breath'];
  const entries: {
    index: number;
    region: Region;
    point: THREE.Vector3;
    normal: THREE.Vector3;
    weight: number;
    gradient: THREE.Vector3;
  }[] = [];
  const epsilon = 0.0001;
  for (let index = 0; index < points.length; index++) {
    const point = points[index],
      { x, y, z } = point;
    let admitted = false;
    for (const region of names) {
      if (region !== 'breath' && !regions[region].has(index)) continue;
      const w = weight(region, x, y, z);
      if (w <= 0) continue;
      if (admitted) return null;
      admitted = true;
      entries.push({
        index,
        region,
        point,
        weight: w,
        normal: new THREE.Vector3()
          .fromBufferAttribute(source.attributes.normal, index)
          .applyMatrix3(normalToModel)
          .normalize(),
        gradient: new THREE.Vector3(
          weight(region, x + epsilon, y, z) - weight(region, x - epsilon, y, z),
          weight(region, x, y + epsilon, z) - weight(region, x, y - epsilon, z),
          weight(region, x, y, z + epsilon) - weight(region, x, y, z - epsilon)
        ).multiplyScalar(1 / (2 * epsilon)),
      });
    }
  }
  const copy = (a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) => {
    const values = new Float32Array(a.count * 3);
    for (let i = 0; i < a.count; i++) {
      values[i * 3] = a.getX(i);
      values[i * 3 + 1] = a.getY(i);
      values[i * 3 + 2] = a.getZ(i);
    }
    return new THREE.BufferAttribute(values, 3).setUsage(THREE.DynamicDrawUsage);
  };
  const geometry = source.clone(),
    positions = copy(source.attributes.position),
    normals = copy(source.attributes.normal);
  geometry.setAttribute('position', positions);
  geometry.setAttribute('normal', normals);
  mesh.geometry = geometry;
  const pose = createCowRestPose(),
    p = new THREE.Vector3(),
    n = new THREE.Vector3(),
    u = new THREE.Vector3(),
    gradient = new THREE.Vector3(),
    pivot = new THREE.Vector3();
  let lastTime = 0,
    lastSeed = 0,
    onset: number | null = null,
    disposed = false;
  return {
    apply(seconds: number, seed: number) {
      if (disposed) return;
      const time = Number.isFinite(seconds) && seconds > 0 ? seconds : 0,
        identity = Number.isFinite(seed) ? seed : 0;
      if (time === lastTime && identity === lastSeed) return;
      if (time === 0) onset = null;
      else if (onset === null || time < lastTime) onset = time;
      lastTime = time;
      lastSeed = identity;
      sampleCowRest(time, identity, pose);
      const admission = onset === null ? 0 : smooth(time - onset, 0, 0.7);
      for (const entry of entries) {
        const { index, region, point, normal, weight: w } = entry,
          amount = pose[region] * admission;
        if (amount === 0) {
          positions.setXYZ(
            index,
            source.attributes.position.getX(index),
            source.attributes.position.getY(index),
            source.attributes.position.getZ(index)
          );
          normals.setXYZ(
            index,
            source.attributes.normal.getX(index),
            source.attributes.normal.getY(index),
            source.attributes.normal.getZ(index)
          );
          continue;
        }
        p.copy(point);
        n.copy(normal);
        gradient.copy(entry.gradient);
        let angle = 0;
        if (region === 'breath') {
          u.set(Math.sign(point.x) * 0.004 * amount, 0, 0);
          p.addScaledVector(u, w);
        } else {
          const theta =
            region === 'tail' ? 0.18 * amount : (region === 'leftEar' ? -1 : 1) * 0.16 * amount;
          if (region === 'tail') pivot.set(0.11, 0.97, -0.82);
          else if (region === 'leftEar') pivot.set(0.19, 1.095, 0.52);
          else pivot.set(-0.19, 1.095, 0.65);
          p.sub(pivot);
          u.set(-p.y, p.x, 0);
          angle = theta * w;
          gradient.multiplyScalar(theta);
        }
        n.addScaledVector(gradient, -u.dot(n) / (1 + gradient.dot(u)));
        if (region !== 'breath') {
          const c = Math.cos(angle),
            s = Math.sin(angle);
          p.set(p.x * c - p.y * s, p.x * s + p.y * c, p.z).add(pivot);
          n.set(n.x * c - n.y * s, n.x * s + n.y * c, n.z);
        }
        p.applyMatrix4(toMesh);
        n.applyMatrix3(normalToMesh).normalize();
        positions.setXYZ(index, p.x, p.y, p.z);
        normals.setXYZ(index, n.x, n.y, n.z);
      }
      positions.needsUpdate = normals.needsUpdate = true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (mesh.geometry === geometry) mesh.geometry = source;
      geometry.dispose();
    },
  };
}
