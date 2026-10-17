import * as THREE from 'three';
import { createSheepRestPose, sampleSheepRest } from '../../simulation/creatureMotion';

type Region = 'leftEar' | 'rightEar' | 'breath';
const smooth = THREE.MathUtils.smoothstep;
function weight(region: Region, x: number, y: number, z: number) {
  if (region === 'breath')
    return (
      smooth(y, 0.34, 0.48) *
      (1 - smooth(y, 0.74, 0.84)) *
      smooth(z, -0.44, -0.29) *
      (1 - smooth(z, 0.12, 0.22)) *
      smooth(Math.abs(x), 0.12, 0.21)
    );
  if ((region === 'leftEar' && x <= 0) || (region === 'rightEar' && x >= 0)) return 0;
  return (
    smooth(Math.abs(x), 0.145, 0.21) *
    smooth(y, 0.7, 0.74) *
    (1 - smooth(y, 0.81, 0.85)) *
    smooth(z, 0.27, 0.31) *
    (1 - smooth(z, 0.44, 0.49))
  );
}

/** Measured SheepBody regions, applied in rest metres before the original skin.
 * Working if ears/flanks move independently while hooves, face, coat and copies
 * remain exact; another topology keeps its untouched borrowed geometry.
 */
export function createSheepRestMotion(model: THREE.Object3D) {
  const mesh = model.getObjectByName('SheepBody') as THREE.SkinnedMesh | undefined;
  const source = mesh?.geometry;
  if (
    !mesh?.isSkinnedMesh ||
    source?.attributes.position?.count !== 4011 ||
    source.index?.count !== 17982 ||
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
  const regions: Region[] = ['leftEar', 'rightEar', 'breath'];
  const counts = [0, 0, 0];
  const entries: {
    index: number;
    region: Region;
    point: THREE.Vector3;
    normal: THREE.Vector3;
    weight: number;
    gradient: THREE.Vector3;
  }[] = [];
  const epsilon = 0.0001;
  for (let index = 0; index < source.attributes.position.count; index++) {
    const point = new THREE.Vector3()
      .fromBufferAttribute(source.attributes.position, index)
      .applyMatrix4(toModel);
    const { x, y, z } = point;
    for (let r = 0; r < regions.length; r++) {
      const region = regions[r],
        w = weight(region, x, y, z);
      if (w <= 0) continue;
      counts[r]++;
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
  if (counts[0] !== 66 || counts[1] !== 63 || counts[2] !== 907) return null;
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
  const pose = createSheepRestPose(),
    p = new THREE.Vector3(),
    n = new THREE.Vector3(),
    u = new THREE.Vector3(),
    gradient = new THREE.Vector3(),
    pivot = new THREE.Vector3();
  let lastTime = 0,
    lastSeed = 0,
    disposed = false;
  return {
    apply(seconds: number, seed: number) {
      if (disposed) return;
      const time = Number.isFinite(seconds) && seconds > 0 ? seconds : 0,
        identity = Number.isFinite(seed) ? seed : 0;
      if (time === lastTime && identity === lastSeed) return;
      lastTime = time;
      lastSeed = identity;
      sampleSheepRest(time, identity, pose);
      for (const entry of entries) {
        const { index, region, point, normal, weight: w } = entry,
          amount = pose[region];
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
          u.set(Math.sign(point.x) * 0.0035 * amount, 0, 0);
          p.addScaledVector(u, w);
        } else {
          const side = region === 'leftEar' ? 1 : -1,
            theta = -side * 0.2 * amount;
          pivot.set(side * 0.14, 0.82, 0.36);
          p.sub(pivot);
          u.set(-p.y, p.x, 0);
          angle = theta * w;
          gradient.multiplyScalar(theta);
        }
        // Inverse transpose of the tapered field, including its mask derivative.
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
