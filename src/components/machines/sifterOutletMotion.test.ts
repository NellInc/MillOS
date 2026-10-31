import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { writeSifterSockInstance } from './CompactMachines';
import { SIFTER_SUSPENSION } from './sifterSuspension';
import { SITE_LAYOUT, installMachinePoint } from '../../constants/siteLayout';
import { MachineType, type MachineData } from '../../types';
import { buildSpoutRoutes } from '../flow/spoutRoutes';
import { sampleMachineVisualPhase } from '../../simulation/machineMotion';
vi.mock('../../utils/critterAudio', () => ({ playCritterSound: vi.fn() }));
const machine = {
  ...SITE_LAYOUT.machines.sifters[0],
  type: MachineType.PLANSIFTER,
  size: [...SITE_LAYOUT.machineDimensions.sifter],
} as unknown as MachineData;
const mesh = () =>
  new THREE.InstancedMesh(
    new THREE.CylinderGeometry(1, 1, 1, 20),
    new THREE.MeshBasicMaterial(),
    1
  );
const read = (m: THREE.InstancedMesh) => {
  const matrix = new THREE.Matrix4();
  m.getMatrixAt(0, matrix);
  return matrix;
};
describe('current suspended sifter outlet', () => {
  it('follows the upper casing through a full orbit with its lower mouth on the unchanged route', () => {
    const m = mesh(),
      object = new THREE.Object3D();
    const top = installMachinePoint(machine, [0, SIFTER_SUSPENSION.sock.top, 0]);
    const bottom = installMachinePoint(machine, [0, SIFTER_SUSPENSION.sock.bottom, 0]);
    const route = buildSpoutRoutes([
      machine,
      {
        ...SITE_LAYOUT.machines.packers[0],
        type: MachineType.PACKER,
        size: [...SITE_LAYOUT.machineDimensions.packer],
      } as unknown as MachineData,
    ])[0];
    expect(route.curve.getPointAt(0).toArray()).toEqual(bottom);
    for (let step = 0; step <= 100; step++) {
      const phase = (step * Math.PI * 2) / 100,
        dx = Math.sin(phase) * 0.055,
        dz = Math.cos(phase) * 0.055;
      writeSifterSockInstance(m, 0, object, machine, dx, dz);
      const matrix = read(m);
      expect(
        new THREE.Vector3(0, 0.5, 0)
          .applyMatrix4(matrix)
          .distanceTo(new THREE.Vector3(top[0] + dx, top[1], top[2] + dz))
      ).toBeLessThan(2e-6);
      expect(
        new THREE.Vector3(0, -0.5, 0)
          .applyMatrix4(matrix)
          .distanceTo(new THREE.Vector3(bottom[0], bottom[1] - 0.01, bottom[2]))
      ).toBeLessThan(2e-6);
      // The cap tilt stays buried: underframe has 25 mm of upper overlap,
      // and the lower cap is tucked 10 mm over the stationary inlet.
      const capTilt =
        (Math.hypot(dx, dz) / (top[1] - bottom[1] + 0.01)) * SIFTER_SUSPENSION.sock.radius * 0.5;
      expect(capTilt).toBeLessThan(0.01);
      // Rotation/scale has orthogonal axes; ordinary instanced normal handling remains valid.
      const x = new THREE.Vector3().setFromMatrixColumn(matrix, 0),
        y = new THREE.Vector3().setFromMatrixColumn(matrix, 1);
      expect(Math.abs(x.dot(y))).toBeLessThan(1e-7);
    }
    m.geometry.dispose();
    (m.material as THREE.Material).dispose();
  });
  it('holds and resumes the same sock pose on the current active-time clock', () => {
    const m = mesh(),
      object = new THREE.Object3D(),
      clock = { sampleTime: 0, phaseTime: null as number | null };
    const pose = (time: number, operating: boolean) => {
      const phase = sampleMachineVisualPhase(clock, time, operating);
      writeSifterSockInstance(
        m,
        0,
        object,
        machine,
        phase === null ? 0 : Math.sin(phase * 10) * 0.055,
        phase === null ? 0 : Math.cos(phase * 10) * 0.055
      );
      return [...read(m).elements];
    };
    const running = pose(1.7, true);
    expect(pose(20, false)).toEqual(running);
    expect(pose(40, false)).toEqual(running);
    expect(pose(40.1, true)).not.toEqual(running);
    m.geometry.dispose();
    (m.material as THREE.Material).dispose();
  });
});
