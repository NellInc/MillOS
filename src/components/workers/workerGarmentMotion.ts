import * as THREE from 'three';

/** Loose hems on already-private fitted cloth, before the existing skinning.
 * No cloth clock or idle oscillator: the owner supplies admitted delta and gait.
 * Working if the supported upper garment stays exact and a stopped hem settles
 * to its original buffers without changing another wearer or the distant body.
 */
export function createWorkerGarmentMotion(mesh: THREE.SkinnedMesh) {
  const geometry = mesh.geometry;
  const apron = geometry.userData.apronFit;
  const coat = geometry.userData.labCoatFit;
  const hem = apron?.hem ?? coat?.hem;
  const height = apron ? Math.min(0.2, (apron.waist - hem) * 0.65) : 0.16;
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const normal = geometry.getAttribute('normal') as THREE.BufferAttribute;
  const hip = mesh.skeleton.bones.findIndex((bone) => bone.name === 'Hips');
  if (
    (!apron && !coat) ||
    !Number.isFinite(hem) ||
    !Number.isFinite(height) ||
    height <= 0 ||
    !position ||
    !normal ||
    position instanceof THREE.InterleavedBufferAttribute ||
    normal instanceof THREE.InterleavedBufferAttribute ||
    hip < 0
  )
    return null;
  const centre = new THREE.Vector3().setFromMatrixPosition(
    mesh.skeleton.boneInverses[hip].clone().invert()
  );
  const rest = position.array.slice();
  const restNormal = normal.array.slice();
  const hinge = hem + height;
  const entries: Array<{
    index: number;
    weight: number;
    derivative: number;
    x: number;
    z: number;
    radius: number;
  }> = [];
  for (let index = coat?.tailStart ?? 0; index < position.count; index++) {
    const y = position.getY(index);
    if (y >= hinge) continue;
    const u = THREE.MathUtils.clamp((hinge - y) / height, 0, 1);
    const x = position.getX(index) - centre.x;
    const z = position.getZ(index) - centre.z;
    const radius = Math.hypot(x, z);
    if (coat && radius < 0.04) continue;
    entries.push({
      index,
      weight: u * u,
      derivative: y > hem ? (-2 * u) / height : 0,
      x: coat ? x / radius : 0,
      z: coat ? z / radius : 1,
      radius,
    });
  }
  if (!entries.length) return null;
  position.setUsage(THREE.DynamicDrawUsage);
  normal.setUsage(THREE.DynamicDrawUsage);
  geometry.boundingBox?.expandByScalar(0.02);
  if (geometry.boundingSphere) geometry.boundingSphere.radius += 0.02;
  let amount = 0;
  let applied = false;
  return {
    mesh,
    apply(delta: number, speed: number, stridePhase: number, resting: boolean) {
      if (!Number.isFinite(delta) || delta <= 0) return;
      const dt = THREE.MathUtils.clamp(delta, 0, 0.15);
      const pace = Number.isFinite(speed) ? THREE.MathUtils.clamp(speed / 1.4, 0, 1.5) : 0;
      const phase = Number.isFinite(stridePhase) ? stridePhase : 0;
      const target = resting
        ? 0
        : (apron ? 0.012 : 0.008) * pace * (0.775 + 0.225 * Math.sin(phase * 2 - 0.7));
      amount = THREE.MathUtils.damp(amount, target, 9, dt);
      if (amount < 0.000001) {
        amount = 0;
        if (applied) {
          position.array.set(rest);
          normal.array.set(restNormal);
          position.needsUpdate = normal.needsUpdate = true;
          applied = false;
        }
        return;
      }
      applied = true;
      for (const entry of entries) {
        const { index, weight, derivative, x, z, radius } = entry;
        const i = index * 3;
        position.setXYZ(
          index,
          rest[i] + amount * weight * x,
          rest[i + 1],
          rest[i + 2] + amount * weight * z
        );
        const nx = restNormal[i];
        const nz = restNormal[i + 2];
        const radial = nx * x + nz * z;
        const tangential = (nx * z - nz * x) / (coat ? 1 + (amount * weight) / radius : 1);
        const normalX = radial * x + tangential * z;
        const normalY = restNormal[i + 1] - amount * derivative * radial;
        const normalZ = radial * z - tangential * x;
        const length = Math.hypot(normalX, normalY, normalZ) || 1;
        normal.setXYZ(index, normalX / length, normalY / length, normalZ / length);
      }
      position.needsUpdate = normal.needsUpdate = true;
    },
  };
}
