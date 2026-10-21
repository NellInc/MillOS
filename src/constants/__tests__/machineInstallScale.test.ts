import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { MachineType, type MachineData } from '../../types';
import { SITE_LAYOUT } from '../siteLayout';
import { buildSpoutRoutes, SPOUT_PIPE_RADIUS } from '../../components/flow/spoutRoutes';

/**
 * Real-world scale of the process machines against the people who work them.
 *
 * The art review measured the roller mills at about 3x a worker's height and the
 * packers at about 4x. In metres the mills stood 6.59 m to the top of the feed
 * inlet, the packers 6.47 m to the hopper and the plansifters 7.56 m above their
 * deck, while a worker is 1.72 m. Reference equipment: a double roller mill is
 * about 1.6-2.2 m of body with its inlet above that, a bagging scale with its
 * surge hopper 2.5-4 m, a plansifter 2.5-3 m. These bands pin what was fixed.
 */

const WORKER_GLBS = ['worker-masculine.glb', 'worker-feminine.glb'];

/** Bind-pose crown height of a worker GLB, through its node hierarchy. */
function workerStature(file: string): number {
  const buffer = fs.readFileSync(path.resolve(__dirname, '../../../public/models/worker', file));
  const gltf = JSON.parse(buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString('utf8'));
  let top = -Infinity;
  const walk = (index: number, parent: THREE.Matrix4) => {
    const node = gltf.nodes[index];
    const local = new THREE.Matrix4();
    if (node.matrix) local.fromArray(node.matrix);
    else
      local.compose(
        new THREE.Vector3(...(node.translation ?? [0, 0, 0])),
        new THREE.Quaternion(...(node.rotation ?? [0, 0, 0, 1])),
        new THREE.Vector3(...(node.scale ?? [1, 1, 1]))
      );
    const world = parent.clone().multiply(local);
    if (node.mesh !== undefined) {
      for (const primitive of gltf.meshes[node.mesh].primitives) {
        const accessor = gltf.accessors[primitive.attributes.POSITION];
        const box = new THREE.Box3(
          new THREE.Vector3(...accessor.min),
          new THREE.Vector3(...accessor.max)
        ).applyMatrix4(world);
        top = Math.max(top, box.max.y);
      }
    }
    for (const child of node.children ?? []) walk(child, world);
  };
  for (const root of gltf.scenes[gltf.scene ?? 0].nodes) walk(root, new THREE.Matrix4());
  return top;
}

const canonicalMachines = (): MachineData[] =>
  (
    [
      [SITE_LAYOUT.machines.silos, MachineType.SILO, SITE_LAYOUT.machineDimensions.silo],
      [
        SITE_LAYOUT.machines.rollerMills,
        MachineType.ROLLER_MILL,
        SITE_LAYOUT.machineDimensions.rollerMill,
      ],
      [SITE_LAYOUT.machines.sifters, MachineType.PLANSIFTER, SITE_LAYOUT.machineDimensions.sifter],
      [SITE_LAYOUT.machines.packers, MachineType.PACKER, SITE_LAYOUT.machineDimensions.packer],
    ] as const
  ).flatMap(([anchors, type, size]) =>
    anchors.map((anchor) => ({ ...anchor, position: [...anchor.position], type, size: [...size] }))
  ) as unknown as MachineData[];

describe('process machine installed scale', () => {
  it('measures the workers at a real stature', () => {
    for (const file of WORKER_GLBS) {
      const stature = workerStature(file);
      expect(stature, file).toBeGreaterThan(1.65);
      expect(stature, file).toBeLessThan(1.8);
    }
  });

  it('installs each process machine within its real-equipment height band', () => {
    const stature = workerStature('worker-masculine.glb');
    const routes = buildSpoutRoutes(canonicalMachines());
    // Heights are read where the steel actually ends: the spout endpoint on each
    // inlet, which the route builder seats on the installed hopper or inlet.
    const intakeTop = (id: string) => {
      const route = routes.find((r) => r.family === 'intake' && r.toMachineId === id)!;
      return route.curve.getPointAt(1).y - SITE_LAYOUT.machines.rollerMills[0].position[1];
    };
    const sifterTop = (id: string) => {
      const route = routes.find((r) => r.family === 'pneumatic' && r.toMachineId === id)!;
      return route.curve.getPointAt(1).y - SITE_LAYOUT.datum.mezzanine;
    };
    const packerTop = (id: string) => {
      const route = routes.find((r) => r.family === 'finished' && r.toMachineId === id)!;
      return route.curve.getPointAt(1).y;
    };
    for (const { id } of SITE_LAYOUT.machines.rollerMills) {
      expect(intakeTop(id), `${id} with its feed inlet`).toBeGreaterThan(2.2);
      expect(intakeTop(id), `${id} with its feed inlet`).toBeLessThan(2.8);
      expect(intakeTop(id) / stature, `${id} against a worker`).toBeLessThan(1.6);
    }
    for (const { id } of SITE_LAYOUT.machines.sifters) {
      expect(sifterTop(id), `${id} above its deck`).toBeGreaterThan(2.5);
      expect(sifterTop(id), `${id} above its deck`).toBeLessThan(4);
    }
    for (const { id } of SITE_LAYOUT.machines.packers) {
      expect(packerTop(id), `${id} with its surge hopper`).toBeGreaterThan(3);
      expect(packerTop(id), `${id} with its surge hopper`).toBeLessThan(4.2);
    }
    expect(SITE_LAYOUT.machineDimensions.rollerMill[1]).toBeLessThan(2.8);
    expect(SITE_LAYOUT.machineDimensions.packer[1]).toBeLessThan(4.2);
    expect(SITE_LAYOUT.machineDimensions.sifter[1]).toBeLessThan(4);
    // The silos were already real: 32 m bins, 12 m across.
    expect(SITE_LAYOUT.machineDimensions.silo).toEqual([12, 32, 12]);
  });

  it('keeps every spout run that drops below head height over its own machine', () => {
    const machines = canonicalMachines();
    const routes = buildSpoutRoutes(machines);
    const footprint = (id: string) => {
      const machine = machines.find((m) => m.id === id)!;
      return {
        minX: machine.position[0] - machine.size[0] / 2,
        maxX: machine.position[0] + machine.size[0] / 2,
        minZ: machine.position[2] - machine.size[2] / 2,
        maxZ: machine.position[2] + machine.size[2] / 2,
      };
    };
    for (const route of routes.filter((r) => r.family !== 'finished')) {
      const mill = route.family === 'intake' ? route.toMachineId : route.fromMachineId;
      const bounds = footprint(mill);
      for (const point of route.curve.getSpacedPoints(600)) {
        if (point.y - SPOUT_PIPE_RADIUS >= 2.3) continue;
        // A pipe below 2.3 m anywhere off the machine is a head-height bar
        // across the milling aisle.
        expect(
          point.x >= bounds.minX &&
            point.x <= bounds.maxX &&
            point.z >= bounds.minZ &&
            point.z <= bounds.maxZ,
          `${route.family} ${route.fromMachineId}->${route.toMachineId} at ${point.toArray()}`
        ).toBe(true);
      }
    }
  });

  it('aims the milling camera at the installed mills, not the gallery above them', () => {
    // The 5.5 m aim was the middle of a 6.59 m mill; at real size it looks at
    // the mezzanine soffit. The process-floor view shares this pose.
    const { milling, processFloor } = SITE_LAYOUT.cameras;
    expect(processFloor).toEqual(milling);
    expect(milling.target[1]).toBeGreaterThanOrEqual(1.5);
    expect(milling.target[1]).toBeLessThanOrEqual(2);
    expect(milling.target[1]).toBeLessThan(SITE_LAYOUT.machineDimensions.rollerMill[1]);
  });

  it('keeps the intake drop and the pneumatic lift on each mill apart', () => {
    const routes = buildSpoutRoutes(canonicalMachines());
    for (const { id } of SITE_LAYOUT.machines.rollerMills) {
      const intake = routes.find((r) => r.family === 'intake' && r.toMachineId === id)!;
      const lift = routes.find((r) => r.family === 'pneumatic' && r.fromMachineId === id)!;
      const a = intake.curve.getSpacedPoints(400);
      const b = lift.curve.getSpacedPoints(400);
      let nearest = Infinity;
      for (const p of a) for (const q of b) nearest = Math.min(nearest, p.distanceTo(q));
      expect(nearest, id).toBeGreaterThan(SPOUT_PIPE_RADIUS * 2);
    }
  });
});
