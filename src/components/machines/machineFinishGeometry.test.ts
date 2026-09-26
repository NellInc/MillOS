import { SIFTER_LAYOUT } from '../../constants/siteLayout';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  MACHINE_FINISH_GEOMETRY,
  MILL_CONTROL_FACE,
  MILL_INSPECTION_COVERS,
  MILL_LOAD_DIAL,
} from './machineFinishGeometry';
import { MACHINE_PART_GEOMETRY } from './CompactMachines';
import { DECAL_CELL, planMachineDecals } from './machineDecals';
import { MachineData, MachineType } from '../../types';

describe('instanced machine finish geometry', () => {
  it('keeps the fittings finite with usable normals and a bounded triangle budget', () => {
    let triangles = 0;
    for (const geometry of Object.values(MACHINE_FINISH_GEOMETRY)) {
      const position = geometry.getAttribute('position');
      const normal = geometry.getAttribute('normal');
      expect(normal.count).toBe(position.count);
      for (let index = 0; index < position.count; index += 1) {
        expect(Number.isFinite(position.getX(index))).toBe(true);
        expect(Number.isFinite(position.getY(index))).toBe(true);
        expect(Number.isFinite(position.getZ(index))).toBe(true);
        expect(Math.hypot(normal.getX(index), normal.getY(index), normal.getZ(index))).toBeCloseTo(
          1,
          5
        );
      }
      triangles += (geometry.index?.count ?? position.count) / 3;
      expect(geometry.groups).toHaveLength(0);
    }
    // Shared prototypes; the two fascia roles replace the old service-plate batches.
    expect(triangles).toBeLessThan(4500);
  });

  it('fits inside the existing machine service envelope', () => {
    for (const [name, geometry] of Object.entries(MACHINE_FINISH_GEOMETRY)) {
      const bounds = geometry.boundingBox!;
      if (name === 'millGuard') expect(bounds.min.y).toBeCloseTo(0, 6);
      else expect(bounds.min.y).toBeGreaterThan(0);
      expect(bounds.min.x).toBeGreaterThanOrEqual(-3.8);
      expect(bounds.max.x).toBeLessThanOrEqual(3.8);
      expect(bounds.min.z).toBeGreaterThanOrEqual(-3.25);
      expect(bounds.max.z).toBeLessThanOrEqual(3.25);
      expect(bounds.max.y, name).toBeLessThan(
        name === 'sifterHardware'
          ? SIFTER_LAYOUT.inletCentreY + SIFTER_LAYOUT.inletHeight / 2
          : 6.59
      );
    }
  });

  it('seats the service covers on the casing without covering the side serial plate', () => {
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const body = new THREE.Mesh(MACHINE_PART_GEOMETRY.millBody, material);
    body.scale.set(4.8, 4.7, 3.8);
    body.position.y = 2.7;
    body.updateMatrixWorld();
    for (const [x, y, z] of MILL_INSPECTION_COVERS) {
      for (const dy of [-0.25, 0, 0.25]) {
        const ray = new THREE.Raycaster(
          new THREE.Vector3(-6, y + dy, z),
          new THREE.Vector3(1, 0, 0)
        );
        const hit = ray.intersectObject(body)[0];
        expect(hit).toBeDefined();
        expect(Math.abs(hit.point.x - (x + 0.06))).toBeLessThan(0.035);
      }
      // The serial plate and its fasteners occupy the central side panel.
      expect(y + 0.31 < 1.69 || y - 0.31 > 3.61).toBe(true);
    }
    material.dispose();
  });

  it('seats the load dial inside its rim without a captive bolt over the face', () => {
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const guard = new THREE.Mesh(MACHINE_FINISH_GEOMETRY.millGuard, material);
    const hardware = new THREE.Mesh(MACHINE_FINISH_GEOMETRY.millHardware, material);
    const [x, y, z] = MILL_LOAD_DIAL.position;
    for (let i = 0; i < 16; i++) {
      const angle = (i * Math.PI) / 8;
      for (const radius of [0, 0.21]) {
        const ray = new THREE.Raycaster(
          new THREE.Vector3(-6, y + Math.sin(angle) * radius, z + Math.cos(angle) * radius),
          new THREE.Vector3(1, 0, 0)
        );
        const hit = ray.intersectObject(guard)[0];
        expect(hit).toBeDefined();
        expect(hit.point.x - x).toBeCloseTo(0.015, 5);
        ray.far = 6 + x + 0.001;
        expect(ray.intersectObject(hardware)).toHaveLength(0);
      }
    }
    material.dispose();
  });

  it('leaves the active rolls visible through the narrow inspection apertures', () => {
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    for (const geometry of [
      MACHINE_FINISH_GEOMETRY.millGuard,
      MACHINE_FINISH_GEOMETRY.millHardware,
    ]) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.updateMatrixWorld();
      for (const [x, y] of [
        [-0.8, 2.25],
        [0.8, 2.25],
        [-0.8, 3.35],
        [0.8, 3.35],
      ]) {
        const ray = new THREE.Raycaster(new THREE.Vector3(x, y, 6), new THREE.Vector3(0, 0, -1));
        expect(ray.intersectObject(mesh), `${geometry.name} occludes ${x}, ${y}`).toHaveLength(0);
      }
    }
    material.dispose();
  });

  it('encloses most of the roll chamber behind the cast service face', () => {
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(MACHINE_FINISH_GEOMETRY.millGuard, material);
    let covered = 0;
    let samples = 0;
    for (let x = -1.7; x <= 1.7; x += 0.2) {
      for (let y = 1.5; y <= 3.8; y += 0.05) {
        const ray = new THREE.Raycaster(new THREE.Vector3(x, y, 6), new THREE.Vector3(0, 0, -1));
        if (ray.intersectObject(mesh).length > 0) covered++;
        samples++;
      }
    }
    expect(covered / samples).toBeGreaterThan(0.9);
    expect(covered / samples).toBeLessThan(0.98);
    material.dispose();
  });

  it('cuts four recessed inspection slots into one seated casting', () => {
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const guard = new THREE.Mesh(MACHINE_FINISH_GEOMETRY.millGuard, material);
    for (const y of [2.25, 2.615, 2.985, 3.35]) {
      for (const x of [-1.2, 0, 1.2]) {
        const ray = new THREE.Raycaster(
          new THREE.Vector3(x, y, 6),
          new THREE.Vector3(0, 0, -1),
          0,
          3.5
        );
        expect(ray.intersectObject(guard), `closed slot at ${x}, ${y}`).toHaveLength(0);
        // Both lands are cast metal, and sit on the same former cover plane.
        for (const dy of [-0.07, 0.07]) {
          ray.ray.origin.y = y + dy;
          const hit = ray.intersectObject(guard)[0];
          expect(hit).toBeDefined();
          expect(hit.point.z).toBeCloseTo(2.6375, 5);
        }
      }
      // A shallow inward bevel, rather than a detached rail above the face.
      const ray = new THREE.Raycaster(
        new THREE.Vector3(0, y + 0.04, 6),
        new THREE.Vector3(0, 0, -1)
      );
      const hit = ray.intersectObject(guard)[0];
      expect(hit).toBeDefined();
      expect(hit.point.z).toBeGreaterThan(2.6275);
      expect(hit.point.z).toBeLessThan(2.6375);
    }
    material.dispose();
  });

  it('seats the live HMI on a closed sloping shoulder with a clear screen aperture', () => {
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const guard = new THREE.Mesh(MACHINE_FINISH_GEOMETRY.millGuard, material);
    const hardware = new THREE.Mesh(MACHINE_FINISH_GEOMETRY.millHardware, material);
    const rotation = new THREE.Matrix4().makeRotationX(MILL_CONTROL_FACE.rotationX);
    const normal = new THREE.Vector3(0, 0, 1).transformDirection(rotation);
    for (const x of [-0.35, 0, 0.35])
      for (const y of [-0.2, 0, 0.2]) {
        const centre = new THREE.Vector3(x, y, 0)
          .applyMatrix4(rotation)
          .add(new THREE.Vector3(...MILL_CONTROL_FACE.position));
        const ray = new THREE.Raycaster(centre.clone().add(normal), normal.clone().negate());
        const hit = ray.intersectObject(guard)[0];
        expect(hit).toBeDefined();
        // HMI depth is 90 mm. Its rear seats into the casting by about 5 mm.
        expect(hit.distance - 1).toBeGreaterThan(0.02);
        expect(hit.distance - 1).toBeLessThan(0.045);
        ray.far = 1.04;
        expect(ray.intersectObject(hardware)).toHaveLength(0);
      }
    // Side views must hit the cast cheek instead of an open triangular gap.
    for (const side of [-1, 1])
      for (const [y, z] of [
        [4.03, 2.3],
        [4.3, 2.05],
      ]) {
        const ray = new THREE.Raycaster(
          new THREE.Vector3(side * 5, y, z),
          new THREE.Vector3(-side, 0, 0)
        );
        const hit = ray.intersectObject(guard)[0];
        expect(hit).toBeDefined();
        expect(Math.abs(hit.point.x)).toBeCloseTo(2.11, 2);
      }
    material.dispose();
  });

  it('opens the four side louvres inside their painted access cover', () => {
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const guard = new THREE.Mesh(MACHINE_FINISH_GEOMETRY.millGuard, material);
    for (const y of [2.25, 2.63, 3.01, 3.39]) {
      for (const z of [-1.05, -0.5, 0.05]) {
        const ray = new THREE.Raycaster(
          new THREE.Vector3(-6, y, z),
          new THREE.Vector3(1, 0, 0),
          0,
          4
        );
        expect(ray.intersectObject(guard)).toHaveLength(0);
        ray.ray.origin.y = y + 0.12;
        expect(ray.intersectObject(guard).length).toBeGreaterThan(0);
      }
    }
    material.dispose();
  });

  it('puts the sifter clamps on both service sides, without covering its screen', () => {
    const geometry = MACHINE_FINISH_GEOMETRY.sifterHardware;
    expect(geometry.boundingBox!.min.z).toBeLessThan(-3.1);
    expect(geometry.boundingBox!.max.z).toBeGreaterThan(3.1);
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);
    const ray = new THREE.Raycaster(new THREE.Vector3(0, 2.2, 6), new THREE.Vector3(0, 0, -1));
    expect(ray.intersectObject(mesh)).toHaveLength(0);
    material.dispose();
  });

  it('seats the sifter HMI and actual placards inside a recessed service bay', () => {
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const fascia = new THREE.Mesh(MACHINE_FINISH_GEOMETRY.sifterServiceFace, material);
    const fittings = new THREE.Mesh(MACHINE_FINISH_GEOMETRY.sifterHardware, material);
    const recess = new THREE.Mesh(MACHINE_FINISH_GEOMETRY.sifterServiceRecess, material);
    for (const x of [-0.39, 0, 0.39]) {
      for (const y of [1.97, 2.2, 2.43]) {
        const ray = new THREE.Raycaster(new THREE.Vector3(x, y, 6), new THREE.Vector3(0, 0, -1));
        expect(ray.intersectObjects([fascia, fittings])).toHaveLength(0);
        const hit = ray.intersectObject(recess)[0];
        expect(hit).toBeDefined();
        // The 80 mm screen's rear is exactly on its actual backing.
        expect(hit.point.z).toBeCloseTo(3.145 - 0.08 / 2, 5);
      }
    }
    const machine = {
      id: 'sifter-A',
      type: MachineType.PLANSIFTER,
      position: [0, 0, 0],
    } as MachineData;
    const plates = planMachineDecals({ silos: [], mills: [], sifters: [machine], packers: [] });
    for (const plate of plates) {
      expect(plate.machineId).toBe(machine.id);
      if (plate.cell === DECAL_CELL.hazardChevron) continue;
      for (const u of [-0.48, 0, 0.48])
        for (const v of [-0.48, 0, 0.48]) {
          const origin = new THREE.Vector3(
            plate.position[0] + u * plate.size[0],
            plate.position[1] + v * plate.size[1],
            6
          );
          const ray = new THREE.Raycaster(origin, new THREE.Vector3(0, 0, -1));
          expect(ray.intersectObjects([fascia, fittings])).toHaveLength(0);
          const hit = ray.intersectObject(recess)[0];
          expect(hit).toBeDefined();
          expect(plate.position[2] - hit.point.z).toBeCloseTo(0.015, 5);
        }
    }
    material.dispose();
  });

  it('gives the sifter separate upper service covers while retaining all seven side clamps', () => {
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const fascia = new THREE.Mesh(MACHINE_FINISH_GEOMETRY.sifterServiceFace, material);
    for (const y of [3.74, 4.49, 5.28]) {
      const ray = new THREE.Raycaster(new THREE.Vector3(1.3, y, 6), new THREE.Vector3(0, 0, -1));
      expect(ray.intersectObject(fascia)[0].point.z).toBeCloseTo(3.195, 5);
    }
    for (const y of [4.115, 4.895]) {
      const ray = new THREE.Raycaster(new THREE.Vector3(1.3, y, 6), new THREE.Vector3(0, 0, -1));
      expect(ray.intersectObject(fascia)).toHaveLength(0);
    }
    const clamps = new THREE.Mesh(MACHINE_FINISH_GEOMETRY.sifterHardware, material);
    for (let tray = 0; tray < SIFTER_LAYOUT.trayCount; tray++) {
      const ray = new THREE.Raycaster(
        new THREE.Vector3(-6, 0.67 + tray * SIFTER_LAYOUT.trayPitch, -1.9),
        new THREE.Vector3(1, 0, 0)
      );
      expect(ray.intersectObject(clamps)[0].point.x).toBeCloseTo(-3.56, 5);
    }
    expect(SIFTER_LAYOUT.trayCount).toBe(7);
    material.dispose();
  });

  it('keeps the actual mill nameplate visible on the lower service strip', () => {
    const machine = {
      id: 'mill-1',
      type: MachineType.ROLLER_MILL,
      position: [0, 0, 0],
    } as MachineData;
    const plate = planMachineDecals({ silos: [], mills: [machine], sifters: [], packers: [] }).find(
      (decal) => decal.cell === DECAL_CELL.namePlate
    )!;
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    for (const geometry of [
      MACHINE_FINISH_GEOMETRY.millGuard,
      MACHINE_FINISH_GEOMETRY.millHardware,
    ]) {
      const mesh = new THREE.Mesh(geometry, material);
      for (const dx of [-0.49, 0, 0.49]) {
        for (const dy of [-0.49, 0, 0.49]) {
          const ray = new THREE.Raycaster(
            new THREE.Vector3(
              plate.position[0] + plate.size[0] * dx,
              plate.position[1] + plate.size[1] * dy,
              6
            ),
            new THREE.Vector3(0, 0, -1)
          );
          expect(ray.intersectObject(mesh)).toHaveLength(0);
        }
      }
    }
    expect(plate.position[1] - plate.size[1] / 2).toBeGreaterThan(1.08 - 0.46 / 2);
    expect(plate.position[1] + plate.size[1] / 2).toBeLessThan(1.08 + 0.46 / 2);
    expect(plate.position[2]).toBeGreaterThan(1.99 + 0.12 / 2);
    material.dispose();
  });

  it('seats the real side serial plate outside its cover, clear of vents and bolts', () => {
    const machine = {
      id: 'rm-101',
      type: MachineType.ROLLER_MILL,
      position: [0, 0, 0],
    } as MachineData;
    const plate = planMachineDecals({ silos: [], mills: [machine], sifters: [], packers: [] }).find(
      (decal) => decal.rotationY === -Math.PI / 2
    )!;
    expect(plate.cell).toBe(DECAL_CELL.mill101);
    expect(plate.position[2] - plate.size[0] / 2).toBeGreaterThan(0.2);
    expect(plate.position[1] + plate.size[1] / 2).toBeLessThan(3.45 - 0.08);
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const body = new THREE.Mesh(MACHINE_PART_GEOMETRY.millBody, material);
    body.scale.set(4.8, 4.7, 3.8);
    body.position.y = 2.7;
    const meshes = [body, new THREE.Mesh(MACHINE_FINISH_GEOMETRY.millGuard, material)];
    meshes.forEach((mesh) => mesh.updateMatrixWorld());
    for (const u of [-0.48, 0, 0.48])
      for (const v of [-0.48, 0, 0.48]) {
        const origin = new THREE.Vector3(
          -6,
          plate.position[1] + v * plate.size[1],
          plate.position[2] + u * plate.size[0]
        );
        const hit = new THREE.Raycaster(origin, new THREE.Vector3(1, 0, 0)).intersectObjects(
          meshes
        )[0];
        expect(hit).toBeDefined();
        const gap = hit.point.x - plate.position[0];
        expect(gap).toBeGreaterThan(0.005);
        expect(gap).toBeLessThan(0.035);
      }
    material.dispose();
  });
});
