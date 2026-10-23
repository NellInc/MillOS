import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import { MachineType, type MachineData } from '../../types';
import { buildSpoutRoutes, SPOUT_PIPE_RADIUS } from '../flow/spoutRoutes';
import { buildZoneSignPlacements } from './OptimizedFactoryInfrastructure';

/**
 * final-med-12 forklift (2100,45)-(2540,175): the vertical intake spout down
 * to R.M. 101 stood squarely in front of "03 SIFTING", blanking its lettering.
 * Every in-hall benchmark view must read each zone sign it frames: no spout
 * may cross the line of sight to the lettering.
 */

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
    anchors.map((anchor) => ({ ...anchor, type, size: [...size] }) as unknown as MachineData)
  );

/** Views framed from inside the hall. Cameras without a fov keep the canvas's (overview). */
const HALL_VIEWS = [
  'interior',
  'milling',
  'sifting',
  'packing',
  'processFloor',
  'forklift',
] as const;

const camera = (name: (typeof HALL_VIEWS)[number]) => {
  const pose = SITE_LAYOUT.cameras[name] as {
    position: readonly number[];
    target: readonly number[];
    fov?: number;
  };
  const view = new THREE.PerspectiveCamera(
    pose.fov ?? SITE_LAYOUT.cameras.overview.fov,
    16 / 9,
    0.5,
    300
  );
  view.position.set(pose.position[0], pose.position[1], pose.position[2]);
  view.lookAt(pose.target[0], pose.target[1], pose.target[2]);
  view.updateMatrixWorld(true);
  return view;
};

describe('zone wayfinding signs', () => {
  const samples = buildSpoutRoutes(canonicalMachines()).flatMap(({ curve, length }) => {
    const steps = Math.ceil(length / 0.08);
    return Array.from({ length: steps + 1 }, (_, i) => curve.getPointAt(i / steps));
  });

  it('keeps every framed sign readable past the spouting', () => {
    const blocked: string[] = [];
    let framed = 0;
    for (const name of HALL_VIEWS) {
      const view = camera(name);
      for (const sign of buildZoneSignPlacements()) {
        const centre = new THREE.Vector3(...sign.position);
        const normal = new THREE.Vector3(Math.sin(sign.rotationY), 0, Math.cos(sign.rotationY));
        if (normal.dot(view.position.clone().sub(centre)) <= 0) continue;
        const ndc = centre.clone().project(view);
        if (Math.abs(ndc.x) > 1 || Math.abs(ndc.y) > 1 || ndc.z > 1) continue;
        framed += 1;
        // The lettering: the left 80% of the board, its middle 60% in height.
        const along = new THREE.Vector3(Math.cos(sign.rotationY), 0, -Math.sin(sign.rotationY));
        // Only spouting inside the sight cone can hide the board.
        const cone = new THREE.Box3()
          .setFromPoints([view.position, centre])
          .expandByScalar(sign.width / 2 + SPOUT_PIPE_RADIUS);
        const near = samples.filter((sample) => cone.containsPoint(sample));
        let hidden = 0;
        let total = 0;
        for (let u = -0.4; u <= 0.3 + 1e-9; u += 0.05)
          for (let v = -0.3; v <= 0.3 + 1e-9; v += 0.15) {
            const point = centre
              .clone()
              .addScaledVector(along, u * sign.width)
              .add(new THREE.Vector3(0, v * sign.height, 0));
            const onScreen = point.clone().project(view);
            if (Math.abs(onScreen.x) > 1 || Math.abs(onScreen.y) > 1) continue;
            total += 1;
            const ray = new THREE.Line3(view.position, point);
            const closest = new THREE.Vector3();
            if (
              near.some(
                (sample) =>
                  ray.closestPointToPoint(sample, true, closest).distanceTo(sample) <
                  SPOUT_PIPE_RADIUS
              )
            )
              hidden += 1;
          }
        if (hidden > 0) blocked.push(`${name}: ${sign.label} ${hidden}/${total} lettering samples`);
      }
    }
    expect(framed).toBeGreaterThan(0);
    expect(blocked).toEqual([]);
  }, 60_000);

  it('keeps the boards on one wall apart and each over its own zone side of the hall', () => {
    const signs = buildZoneSignPlacements();
    for (let i = 0; i < signs.length; i += 1)
      for (let j = i + 1; j < signs.length; j += 1) {
        if (signs[i].position[0] !== signs[j].position[0]) continue;
        const gap =
          Math.abs(signs[i].position[2] - signs[j].position[2]) -
          (signs[i].width + signs[j].width) / 2;
        expect(gap, `${signs[i].label} / ${signs[j].label}`).toBeGreaterThanOrEqual(1);
      }
    const sifting = signs.find((sign) => sign.label.includes('SIFTING'))!;
    // Still over the sifting gallery (z 14.65-25.35).
    expect(sifting.position[2]).toBeGreaterThan(14.65);
    expect(sifting.position[2]).toBeLessThan(25.35);
  });
});
