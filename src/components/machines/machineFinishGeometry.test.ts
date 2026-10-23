import {
  SIFTER_LAYOUT,
  PACKER_HOPPER_LAYOUT,
  getMachineAssemblyScale,
} from '../../constants/siteLayout';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  MACHINE_FINISH_GEOMETRY,
  MILL_CONTROL_FACE,
  MILL_INSPECTION_COVERS,
  MILL_LOAD_DIAL,
  MILL_DRIVE_Z,
  MILL_MOTOR_CONDUIT,
  createMillMotorFins,
} from './machineFinishGeometry';
import { MACHINE_PART_GEOMETRY } from './CompactMachines';
import { DECAL_CELL, planMachineDecals } from './machineDecals';
import { MachineData, MachineType } from '../../types';

/**
 * Placards are planned INSTALLED, at the machine's real size. These checks
 * raycast the authored part geometry, so read each placard back into its
 * machine's authored metres first.
 */
function planAuthoredDecals(subsets: Parameters<typeof planMachineDecals>[0]) {
  const hosts = [...subsets.silos, ...subsets.mills, ...subsets.sifters, ...subsets.packers];
  return planMachineDecals(subsets).map((plate) => {
    const host = hosts.find((machine) => machine.id === plate.machineId)!;
    const scale = getMachineAssemblyScale(host);
    const origin = host.position;
    return {
      ...plate,
      position: plate.position.map(
        (value, axis) => origin[axis] + (value - origin[axis]) / scale[axis]
      ) as unknown as readonly [number, number, number],
      size: [plate.size[0] / scale[0], plate.size[1] / scale[1]] as const,
    };
  });
}

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
    // Accepted concept plates add bounded mill/packer assemblies, preserving
    // the existing sifter family budget and using three shared extra draws.
    const count = (name: keyof typeof MACHINE_FINISH_GEOMETRY) => {
      const geometry = MACHINE_FINISH_GEOMETRY[name];
      return (geometry.index?.count ?? geometry.attributes.position.count) / 3;
    };
    expect(count('millGuard') + count('millHardware') + count('millRecess')).toBeLessThan(3000);
    expect(
      count('sifterHardware') + count('sifterServiceFace') + count('sifterServiceRecess')
    ).toBe(1788);
    expect(count('packerCovers') + count('packerHardware') + count('packerRecess')).toBeLessThan(
      900
    );
    expect(triangles).toBeLessThan(5688);
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

  it('seats the mill gasket and folded rim on its casting without closing a grille aperture', () => {
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const guard = new THREE.Mesh(MACHINE_FINISH_GEOMETRY.millGuard, material);
    const gasket = new THREE.Mesh(MACHINE_FINISH_GEOMETRY.millRecess, material);
    try {
      for (const [x, y] of [
        [-2.04, 2.64],
        [2.04, 2.64],
        [0, 1.41],
        [0, 3.87],
      ]) {
        const ray = new THREE.Raycaster(new THREE.Vector3(x, y, 6), new THREE.Vector3(0, 0, -1));
        const rubber = ray.intersectObject(gasket)[0];
        const casting = ray.intersectObject(guard)[0];
        expect(rubber).toBeDefined();
        expect(casting).toBeDefined();
        expect(rubber.point.z - casting.point.z).toBeGreaterThan(0);
        expect(rubber.point.z - casting.point.z).toBeLessThan(0.04);
        // The gasket has a buried back, even where the shoulder stands forward.
        const back = new THREE.Raycaster(
          new THREE.Vector3(x, y, 2.5),
          new THREE.Vector3(0, 0, 1)
        ).intersectObject(gasket)[0];
        expect(back.point.z).toBeLessThan(casting.point.z);
      }
      for (const x of [-1.995, 1.995]) {
        const forward = new THREE.Raycaster(
          new THREE.Vector3(x, 2.6, 6),
          new THREE.Vector3(0, 0, -1)
        ).intersectObject(guard);
        const backward = new THREE.Raycaster(
          new THREE.Vector3(x, 2.6, 2.5),
          new THREE.Vector3(0, 0, 1)
        ).intersectObject(guard);
        expect(forward[0].point.z).toBeCloseTo(2.715, 5);
        // The first back-facing hit is the cheek's rear. The folded rim's
        // rear is the next interior face, before the cheek's front at2.6375.
        expect(backward.some((hit) => Math.abs(hit.point.z - 2.625) < 1e-5)).toBe(true);
        expect(forward.some((hit) => Math.abs(hit.point.z - 2.6375) < 1e-5)).toBe(true);
      }
      for (const y of [2.25, 2.615, 2.985, 3.35]) {
        const ray = new THREE.Raycaster(
          new THREE.Vector3(0, y, 6),
          new THREE.Vector3(0, 0, -1),
          0,
          3.5
        );
        expect(ray.intersectObjects([guard, gasket])).toHaveLength(0);
      }
    } finally {
      material.dispose();
    }
  });

  it('keeps barrel hinge leaves seated in the mill casing', () => {
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const guard = new THREE.Mesh(MACHINE_FINISH_GEOMETRY.millGuard, material);
    const hardware = new THREE.Mesh(MACHINE_FINISH_GEOMETRY.millHardware, material);
    try {
      for (const x of [-2.04, 2.04])
        for (const y of [2.05, 3.45]) {
          const ray = new THREE.Raycaster(
            new THREE.Vector3(x, y + 0.06, 6),
            new THREE.Vector3(0, 0, -1)
          );
          expect(ray.intersectObject(hardware)[0].point.z).toBeCloseTo(2.755, 5);
          // The leaf spans z2.6675..2.7025 and overlaps the 2.67m casting face.
          const support = ray.intersectObject(guard)[0];
          expect(support.point.z).toBeCloseTo(2.67, 5);
          expect(support.point.z).toBeGreaterThan(2.6675);
        }
    } finally {
      material.dispose();
    }
  });

  it('seats packer side gaskets on its real housing and keeps live front labels clear', () => {
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const body = new THREE.Mesh(MACHINE_PART_GEOMETRY.packerBody, material);
    body.position.y = 2.65;
    body.scale.set(3.7, 4.75, 3.45);
    body.updateMatrixWorld(true);
    const gasket = new THREE.Mesh(MACHINE_FINISH_GEOMETRY.packerRecess, material);
    const covers = new THREE.Mesh(MACHINE_FINISH_GEOMETRY.packerCovers, material);
    const hardware = new THREE.Mesh(MACHINE_FINISH_GEOMETRY.packerHardware, material);
    try {
      for (const side of [-1, 1])
        for (const [y, z] of [
          [2.3, 0],
          [3.9, 0],
          [3.1, 1.25],
          [3.1, -1.25],
        ]) {
          const ray = new THREE.Raycaster(
            new THREE.Vector3(side * 4, y, z),
            new THREE.Vector3(-side, 0, 0)
          );
          const rubber = ray.intersectObject(gasket)[0];
          const support = ray.intersectObject(body)[0];
          expect(rubber).toBeDefined();
          expect(support).toBeDefined();
          expect(Math.abs(rubber.point.x) - Math.abs(support.point.x)).toBeLessThan(0.025);
        }
      const packer = {
        id: 'packer-0',
        type: MachineType.PACKER,
        position: [0, 0, 0],
      } as MachineData;
      for (const decal of planMachineDecals({
        silos: [],
        mills: [],
        sifters: [],
        packers: [packer],
      })) {
        if (decal.cell === DECAL_CELL.hazardChevron) continue;
        for (const u of [-0.48, 0, 0.48])
          for (const v of [-0.48, 0, 0.48]) {
            const ray = new THREE.Raycaster(
              new THREE.Vector3(
                decal.position[0] + u * decal.size[0],
                decal.position[1] + v * decal.size[1],
                6
              ),
              new THREE.Vector3(0, 0, -1),
              0,
              6 - decal.position[2]
            );
            expect(ray.intersectObjects([covers, hardware])).toHaveLength(0);
          }
      }
      const hmi = new THREE.Raycaster(
        new THREE.Vector3(0, 4.05, 6),
        new THREE.Vector3(0, 0, -1),
        0,
        4.2
      );
      expect(hmi.intersectObjects([covers, hardware])).toHaveLength(0);
    } finally {
      material.dispose();
    }
  });

  it('clamps the existing hopper cone with a seated band without entering its pipe port', () => {
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const hopper = new THREE.Mesh(MACHINE_PART_GEOMETRY.hopper, material);
    hopper.position.y = PACKER_HOPPER_LAYOUT.centreY;
    hopper.scale.set(...PACKER_HOPPER_LAYOUT.scale);
    hopper.updateMatrixWorld(true);
    const hardware = new THREE.Mesh(MACHINE_FINISH_GEOMETRY.packerHardware, material);
    try {
      for (let index = 0; index < 24; index++) {
        const angle = (index * Math.PI) / 12;
        const outward = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
        const ray = new THREE.Raycaster(
          outward.clone().multiplyScalar(3).setY(5.045),
          outward.clone().negate()
        );
        const clamp = ray.intersectObject(hardware)[0];
        const cone = ray.intersectObject(hopper)[0];
        expect(clamp).toBeDefined();
        expect(cone).toBeDefined();
        expect(cone.distance - clamp.distance).toBeGreaterThan(0.01);
        expect(cone.distance - clamp.distance).toBeLessThan(0.1);
      }
      const pipe = new THREE.Raycaster(
        new THREE.Vector3(0, 7, 0),
        new THREE.Vector3(0, -1, 0),
        0,
        0.53
      );
      expect(pipe.intersectObject(hardware)).toHaveLength(0);
    } finally {
      material.dispose();
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

  it('broadens each sifter clamp into a seated shoe without moving its captive head', () => {
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const hardware = new THREE.Mesh(MACHINE_FINISH_GEOMETRY.sifterHardware, material);
    try {
      for (const side of [-1, 1])
        for (let tray = 0; tray < SIFTER_LAYOUT.trayCount; tray++) {
          const y = 0.67 + tray * SIFTER_LAYOUT.trayPitch;
          for (const z of [-1.8, 2]) {
            const hits = new THREE.Raycaster(
              new THREE.Vector3(side * 6, y, z),
              new THREE.Vector3(-side, 0, 0)
            ).intersectObject(hardware);
            // The foot reaches beyond the 110mm tie bar in Z, tapering inward
            // from a buried3.4m back to the unchanged3.56m captive-head envelope.
            expect(Math.abs(hits[0].point.x)).toBeGreaterThan(3.4);
            expect(Math.abs(hits[0].point.x)).toBeLessThan(3.5);
            expect(Math.abs(hits[1].point.x)).toBeCloseTo(3.4, 5);
          }
        }
    } finally {
      material.dispose();
    }
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
    const plates = planAuthoredDecals({ silos: [], mills: [], sifters: [machine], packers: [] });
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
    const plate = planAuthoredDecals({
      silos: [],
      mills: [machine],
      sifters: [],
      packers: [],
    }).find((decal) => decal.cell === DECAL_CELL.namePlate)!;
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
    const plate = planAuthoredDecals({
      silos: [],
      mills: [machine],
      sifters: [],
      packers: [],
    }).find((decal) => decal.rotationY === -Math.PI / 2)!;
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

describe('seated mill drive craft', () => {
  const ray = (mesh: THREE.Mesh, from: number[], direction: number[], far = 10) =>
    new THREE.Raycaster(
      new THREE.Vector3(...from),
      new THREE.Vector3(...direction),
      0,
      far
    ).intersectObject(mesh);
  it('keeps eleven small axial ribs inside the old envelope with open cooling and mounting relief', () => {
    const g = createMillMotorFins(),
      m = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
      fins = new THREE.Mesh(g, m);
    try {
      expect(g.index!.count / 3).toBe(220);
      expect(g.boundingBox!.min.x).toBeCloseTo(2.51, 5);
      expect(g.boundingBox!.max.x).toBeCloseTo(3.51, 5);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++)
        expect(Math.hypot(p.getY(i) - 1.65, p.getZ(i) - MILL_DRIVE_Z)).toBeLessThanOrEqual(
          0.730001
        );
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI) / 6,
          from = [3.02, 1.65 + Math.cos(a), MILL_DRIVE_Z + Math.sin(a)],
          direction = [0, -Math.cos(a), -Math.sin(a)];
        expect(ray(fins, from, direction, 0.38).length > 0).toBe(i !== 6);
        const gap = a + Math.PI / 12;
        expect(
          ray(
            fins,
            [3.02, 1.65 + Math.cos(gap), MILL_DRIVE_Z + Math.sin(gap)],
            [0, -Math.cos(gap), -Math.sin(gap)],
            0.38
          )
        ).toHaveLength(0);
      }
      const guard = new THREE.Mesh(MACHINE_FINISH_GEOMETRY.millGuard, m);
      const foot = ray(guard, [2.65, 1.015, MILL_DRIVE_Z], [0, -1, 0], 0.05)[0];
      expect(foot.point.y).toBeCloseTo(1, 6);
      expect(g.boundingBox!.min.y - foot.point.y).toBeGreaterThan(0.01);
    } finally {
      g.dispose();
      m.dispose();
    }
  });
  it('embeds every rib root and the terminal base through the real retained motor vibration sweep', () => {
    const m = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
      core = new THREE.Mesh(MACHINE_PART_GEOMETRY.roller, m),
      guard = new THREE.Mesh(MACHINE_FINISH_GEOMETRY.millGuard, m);
    // Exact frozen renderer transform: CompactMachines sets this20-sided core.
    core.position.set(3.02, 1.65, MILL_DRIVE_Z);
    core.scale.set(0.68, 1.35, 0.68);
    core.rotation.z = Math.PI / 2;
    core.updateMatrixWorld(true);
    try {
      const base = ray(guard, [2.95, 2.2, MILL_DRIVE_Z], [0, 1, 0], 0.2)[0].point.y;
      const crown = ray(core, [2.95, 2.8, MILL_DRIVE_Z], [0, -1, 0], 1)[0].point.y;
      for (let step = 0; step <= 20; step++) {
        const vibration = -0.012 + step * 0.0012;
        expect(crown - base - vibration).toBeGreaterThan(0.007);
        expect(crown - base - vibration).toBeLessThan(0.033);
        for (let i = 0; i < 12; i++)
          if (i !== 6)
            for (const side of [-1, 1]) {
              const point = new THREE.Vector3(3.02, 0.65, side * 0.014).applyAxisAngle(
                new THREE.Vector3(1, 0, 0),
                (i * Math.PI) / 6
              );
              point.y += 1.65 + vibration;
              point.z += MILL_DRIVE_Z;
              const hits = ray(core, [4, point.y, point.z], [-1, 0, 0], 2);
              expect(hits[0].point.x).toBeGreaterThan(3.51);
              expect(hits.at(-1)!.point.x).toBeLessThan(2.51);
            }
      }
    } finally {
      m.dispose();
    }
  });
  it('overlaps terminal body, gasket, lid and all four captive fasteners with ordinary solid geometry', () => {
    const m = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
      paint = new THREE.Mesh(MACHINE_FINISH_GEOMETRY.millGuard, m),
      rubber = new THREE.Mesh(MACHINE_FINISH_GEOMETRY.millRecess, m),
      hardware = new THREE.Mesh(MACHINE_FINISH_GEOMETRY.millHardware, m);
    try {
      const hits = ray(paint, [2.95, 2.8, MILL_DRIVE_Z], [0, -1, 0], 0.6);
      const heights = [...new Set(hits.map((h) => Math.round(h.point.y * 1e5) / 1e5))].sort(
        (a, b) => b - a
      );
      expect(heights.slice(0, 4)).toEqual([2.57, 2.535, 2.53, 2.31]);
      const gasket = ray(rubber, [2.95, 2.7, MILL_DRIVE_Z], [0, -1, 0], 0.3);
      expect(gasket[0].point.y).toBeGreaterThan(heights[1]);
      expect(gasket.at(-1)!.point.y).toBeLessThan(heights[2]);
      for (const x of [2.79, 3.11])
        for (const z of [MILL_DRIVE_Z - 0.18, MILL_DRIVE_Z + 0.18]) {
          const bolt = ray(hardware, [x, 2.65, z], [0, -1, 0], 0.1);
          expect(bolt[0].point.y).toBeCloseTo(2.591, 5);
          expect(bolt.at(-1)!.point.y).toBeLessThan(2.57);
          expect(ray(paint, [x, 2.65, z], [0, -1, 0], 0.1)[0].point.y).toBeCloseTo(2.57, 5);
        }
    } finally {
      m.dispose();
    }
  });
  it('buries both glands in their actual cast faces and houses each conduit endpoint', () => {
    const m = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
      paint = new THREE.Mesh(MACHINE_FINISH_GEOMETRY.millGuard, m),
      hardware = new THREE.Mesh(MACHINE_FINISH_GEOMETRY.millHardware, m);
    try {
      for (const end of [0, 1]) {
        const p = MILL_MOTOR_CONDUIT.getPoint(end),
          from = [2.6, p.y, p.z],
          direction = end === 0 ? [-1, 0, 0] : [1, 0, 0];
        const metal = ray(hardware, from, direction, 0.2),
          face = ray(paint, from, direction, 0.2)[0];
        const xs = metal.map((h) => h.point.x).sort((a, b) => a - b);
        expect(xs[0]).toBeLessThan(p.x);
        expect(xs.at(-1)!).toBeGreaterThan(p.x);
        expect(xs[0]).toBeLessThan(face.point.x);
        expect(xs.at(-1)!).toBeGreaterThan(face.point.x);
      }
      let x = 0;
      for (let i = 0; i <= 24; i++) {
        const p = MILL_MOTOR_CONDUIT.getPoint(i / 24);
        expect(p.toArray().every(Number.isFinite)).toBe(true);
        expect(p.x).toBeGreaterThanOrEqual(x);
        x = p.x;
        expect(p.y).toBeGreaterThanOrEqual(2.39);
        expect(p.y).toBeLessThanOrEqual(2.430001);
        expect(p.z).toBeCloseTo(MILL_DRIVE_Z, 6);
      }
    } finally {
      m.dispose();
    }
  });
});

it('keeps the full terminal gasket footprint housed beneath the clipped lid', () => {
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const gasket = new THREE.Mesh(MACHINE_FINISH_GEOMETRY.millRecess, material),
    lid = new THREE.Mesh(MACHINE_FINISH_GEOMETRY.millGuard, material);
  let supported = 0;
  try {
    for (let u = 0; u <= 30; u++)
      for (let v = 0; v <= 30; v++) {
        const x = 2.95 - 0.2265 + (u * 0.453) / 30,
          z = MILL_DRIVE_Z - 0.2515 + (v * 0.503) / 30;
        const ray = new THREE.Raycaster(
          new THREE.Vector3(x, 2.7, z),
          new THREE.Vector3(0, -1, 0),
          0,
          0.18
        );
        const rubber = ray.intersectObject(gasket)[0];
        if (!rubber) continue;
        const cap = ray.intersectObject(lid)[0];
        expect(cap).toBeDefined();
        expect(cap.point.y).toBeGreaterThan(rubber.point.y);
        supported++;
      }
    expect(supported).toBeGreaterThan(800);
  } finally {
    material.dispose();
  }
});

it('keeps no up-facing mill guard face flush with the 0.16 m factory plinth', () => {
  // The drive-motor base plate was 0.16 m tall, so its top lay exactly on the
  // milling plinth's top: 2.3 m^2 of coplanar up-facing faces under each mill.
  const geometry = MACHINE_FINISH_GEOMETRY.millGuard.toNonIndexed();
  const position = geometry.getAttribute('position');
  let flush = 0;
  for (let i = 0; i < position.count; i += 3) {
    const ys = [position.getY(i), position.getY(i + 1), position.getY(i + 2)];
    if (!ys.every((y) => Math.abs(y - 0.16) < 0.005)) continue;
    const a = new THREE.Vector3().fromBufferAttribute(position, i);
    const b = new THREE.Vector3().fromBufferAttribute(position, i + 1);
    const c = new THREE.Vector3().fromBufferAttribute(position, i + 2);
    // Down-facing faces at this height are leg soles, hidden inside the plate.
    if (b.sub(a).cross(c.sub(a)).y > 0) flush++;
  }
  geometry.dispose();
  expect(flush).toBe(0);
});
