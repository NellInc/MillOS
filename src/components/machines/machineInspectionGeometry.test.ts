import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  createMachineInspectionGeometry,
  machineInspectionKind,
  sampleMachineInspectionGrain,
} from './machineInspectionGeometry';
import { setInstanceMatrix, writeSiloFillInstance } from './CompactMachines';
import { getMachineAssemblyScale } from '../../constants/siteLayout';
import { MachineType, type MachineData } from '../../types';
const machine = (type: MachineType): MachineData => ({
  id: 'test',
  name: 'Installed',
  type,
  position: [12, 9, -6],
  size: [4.5, 16, 4.5],
  rotation: 0,
  status: 'running',
  metrics: { rpm: 100, temperature: 40, vibration: 1, load: 50, wear: 1, efficiency: 90 },
  lastMaintenance: '',
  nextMaintenance: '',
});
describe('installed explanatory machine sections', () => {
  it.each([MachineType.ROLLER_MILL, MachineType.PLANSIFTER, MachineType.PACKER, MachineType.SILO])(
    'has finite fitted, bounded, owned geometry for %s',
    (type) => {
      const m = machine(type),
        parts = createMachineInspectionGeometry(m),
        scale = getMachineAssemblyScale(m);
      let tris = 0;
      for (const geometry of Object.values(parts))
        if (geometry) {
          const positions = geometry.attributes.position,
            normals = geometry.attributes.normal;
          for (let i = 0; i < positions.count; i++) {
            expect(Number.isFinite(positions.getX(i) + positions.getY(i) + positions.getZ(i))).toBe(
              true
            );
            expect(Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i))).toBeCloseTo(1, 4);
          }
          geometry.computeBoundingBox();
          expect(geometry.boundingBox!.max.x).toBeLessThan(3.4 * scale[0]);
          expect(geometry.boundingBox!.max.y).toBeLessThan(16.6 * scale[1]);
          tris += (geometry.index?.count ?? positions.count) / 3;
        }
      expect(tris).toBeLessThan(18000);
      if (type === MachineType.ROLLER_MILL) {
        parts.roller!.computeBoundingBox();
        expect(parts.roller!.boundingBox!.max.x).toBeCloseTo((3.25 * 0.4) / 2, 5);
      }
      if (type === MachineType.SILO) {
        parts.grain!.computeBoundingBox();
        expect(parts.grain!.boundingBox!.min.y).toBe(0);
        expect(parts.grain!.boundingBox!.max.y).toBe(1);
      }
      Object.values(parts).forEach((g) => g?.dispose());
    }
  );
  it('suppresses only selected indices, through animated canonical writes, and restores current transforms', () => {
    const geometry = new THREE.BoxGeometry(),
      material = new THREE.MeshBasicMaterial(),
      mesh = new THREE.InstancedMesh(geometry, material, 2),
      object = new THREE.Object3D(),
      matrix = new THREE.Matrix4();
    mesh.userData.inspectionHiddenIndices = new Set([0]);
    for (let tick = 0; tick < 3; tick++)
      for (let i = 0; i < 2; i++) setInstanceMatrix(mesh, i, object, [i, 1 + tick, 0], [2, 3, 4]);
    mesh.getMatrixAt(0, matrix);
    expect(matrix.determinant()).toBe(0);
    mesh.getMatrixAt(1, matrix);
    expect(matrix.determinant()).toBe(24);
    expect(matrix.elements[13]).toBe(3);
    delete mesh.userData.inspectionHiddenIndices;
    setInstanceMatrix(mesh, 0, object, [0, 8, 0], [2, 3, 4]);
    mesh.getMatrixAt(0, matrix);
    expect(matrix.determinant()).toBe(24);
    expect(matrix.elements[13]).toBe(8);
    mesh.userData.inspectionHiddenIndices = new Set([0]);
    writeSiloFillInstance(mesh, 0, object, machine(MachineType.SILO), 0.9);
    mesh.getMatrixAt(0, matrix);
    expect(matrix.determinant()).toBe(0);
    geometry.dispose();
    material.dispose();
  });
  it('samples only finite bounded grain routes and excludes control-room subjects', () => {
    const p = new THREE.Vector3();
    for (const kind of ['mill', 'sifter', 'packer'])
      for (let stage = 0; stage < 4; stage++)
        for (const t of [0, 0.5, 1]) {
          sampleMachineInspectionGrain(kind, stage, t, p);
          expect(p.toArray().every(Number.isFinite)).toBe(true);
          expect(p.length()).toBeLessThan(7);
        }
    expect(machineInspectionKind(MachineType.CONTROL_ROOM)).toBeNull();
  });
});
