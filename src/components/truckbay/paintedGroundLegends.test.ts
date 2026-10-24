import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import { stagingBounds } from '../../simulation/layoutPlanning';
import { SCENE_TEXT_MIN_EM_PIXELS } from '../shared/SceneText';
import {
  DOCK_KEEP_CLEAR,
  DOCK_KEEP_CLEAR_LETTERING,
  DOCK_LINE_WIDTH,
  spanOf,
} from './dockApronLayout';
import { dockDressingFootprints } from './dockYardDressingLayout';
import { STAGING_LAYOUT, stagingBox, stagingLegend } from './palletStagingLayout';
import { YARD_LANE_STRIPES, YARD_LANE_STRIPE_SIZE } from './yardSurfaces';

/**
 * The painted words on the truck yards must survive the grazing angle every
 * review camera sees them at. final7 med-12: FLOUR DISPATCH in front of the
 * staging box (logistics-close, full-res y 770-790) was 3 px tall and the
 * KEEP CLEAR words a row of dashes, while their outlines, the same paint at
 * 0.25 m, read clearly.
 *
 * Working if each legend reads upright and left to right from the cameras
 * that frame it, with an em of at least SCENE_TEXT_MIN_EM_PIXELS drawing-buffer
 * rows (the repo's own SDF legibility floor), and stays in its place on the
 * ground: clear of its box line, the lane dashes and the yard dressing.
 */

type CameraName = 'logisticsClose' | 'shipping' | 'receiving' | 'markings';

interface PlanLegend {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly fontSize: number;
  readonly stretch: number;
  readonly characters: number;
}

const project = (name: CameraName) => {
  const view = SITE_LAYOUT.cameras[name] as {
    position: readonly number[];
    target: readonly number[];
    fov?: number;
  };
  const camera = new THREE.PerspectiveCamera(view.fov ?? 45, 16 / 9, 0.5, 300);
  camera.position.set(view.position[0], view.position[1], view.position[2]);
  camera.lookAt(view.target[0], view.target[1], view.target[2]);
  camera.updateMatrixWorld();
  return (p: THREE.Vector3) => {
    const v = p.clone().project(camera);
    return { x: ((v.x + 1) / 2) * 2560, y: ((1 - v.y) / 2) * 1440, inFront: v.z < 1 };
  };
};

/** Screen measures of a flat legend: reading direction, letter-top direction, em length. */
const onScreen = (legend: PlanLegend, name: CameraName) => {
  const px = project(name);
  const reading = new THREE.Vector3(Math.cos(legend.yaw), 0, -Math.sin(legend.yaw));
  const up = new THREE.Vector3(-Math.sin(legend.yaw), 0, -Math.cos(legend.yaw));
  const centre = new THREE.Vector3(legend.x, 0, legend.z);
  const half = (legend.characters * 0.62 * legend.fontSize) / 2;
  const em = legend.fontSize * legend.stretch;
  const start = px(centre.clone().addScaledVector(reading, -half));
  const end = px(centre.clone().addScaledVector(reading, half));
  const base = px(centre.clone().addScaledVector(up, -em / 2));
  const top = px(centre.clone().addScaledVector(up, em / 2));
  // Letter height is the em's extent ACROSS the screen line the words run
  // along: seen obliquely, most of the em's slant length lies along the line
  // and only separates nothing.
  const rx = end.x - start.x;
  const ry = end.y - start.y;
  const ux = top.x - base.x;
  const uy = top.y - base.y;
  return {
    leftToRight: rx > Math.abs(ry),
    topsUp: base.y - top.y > 0,
    emPixels: Math.abs(rx * uy - ry * ux) / Math.hypot(rx, ry),
    inFrame: [start, end].every((p) => p.inFront && p.x > 0 && p.x < 2560 && p.y > 0 && p.y < 1440),
  };
};

const STAGING_ORIGIN = {
  shipping: STAGING_LAYOUT.shippingOrigin,
  receiving: STAGING_LAYOUT.receivingOrigin,
} as const;

const stagingPlan = (dock: 'shipping' | 'receiving'): PlanLegend => {
  const legend = stagingLegend(dock);
  const origin = STAGING_ORIGIN[dock];
  return {
    x: origin[0] + legend.x,
    z: origin[2] + legend.z,
    yaw: legend.yaw,
    fontSize: legend.fontSize,
    stretch: legend.stretch,
    characters: legend.text.length,
  };
};

/** KEEP CLEAR in world metres: the shipping dock group at z 50, receiving's under a pi turn at z -50. */
const keepClearPlan = (dock: 'shipping' | 'receiving'): PlanLegend => {
  const u = spanOf(DOCK_KEEP_CLEAR).centre;
  const sign = dock === 'shipping' ? 1 : -1;
  return {
    x: DOCK_KEEP_CLEAR.x * sign,
    z: sign * (50 + u),
    yaw: dock === 'shipping' ? 0 : Math.PI,
    fontSize: DOCK_KEEP_CLEAR_LETTERING.fontSize,
    stretch: DOCK_KEEP_CLEAR_LETTERING.stretch,
    characters: 'KEEP CLEAR'.length,
  };
};

const CASES: ReadonlyArray<{
  readonly label: string;
  readonly plan: PlanLegend;
  readonly cameras: readonly CameraName[];
}> = [
  {
    label: 'FLOUR DISPATCH',
    plan: stagingPlan('shipping'),
    cameras: ['logisticsClose', 'shipping'],
  },
  { label: 'EMPTY PALLETS', plan: stagingPlan('receiving'), cameras: ['markings'] },
  {
    label: 'shipping KEEP CLEAR',
    plan: keepClearPlan('shipping'),
    cameras: ['logisticsClose', 'shipping'],
  },
  { label: 'receiving KEEP CLEAR', plan: keepClearPlan('receiving'), cameras: ['markings'] },
];

describe('painted ground legends', () => {
  for (const { label, plan, cameras } of CASES)
    for (const camera of cameras)
      it(`${label} reads upright, left to right and large enough from ${camera}`, () => {
        const seen = onScreen(plan, camera);
        expect(seen.inFrame, 'in frame').toBe(true);
        expect(seen.leftToRight, 'left to right').toBe(true);
        expect(seen.topsUp, 'letter tops up the screen').toBe(true);
        expect(seen.emPixels, 'em on screen, drawing-buffer rows').toBeGreaterThanOrEqual(
          SCENE_TEXT_MIN_EM_PIXELS
        );
      });

  it('fits the KEEP CLEAR capitals inside their box and its words across it', () => {
    const { fontSize, stretch } = DOCK_KEEP_CLEAR_LETTERING;
    const inner = DOCK_KEEP_CLEAR.u1 - DOCK_KEEP_CLEAR.u0 - 2 * DOCK_LINE_WIDTH;
    expect(0.73 * fontSize * stretch).toBeLessThanOrEqual(inner - 0.2);
    expect('KEEP CLEAR'.length * 0.65 * fontSize).toBeLessThanOrEqual(
      DOCK_KEEP_CLEAR.width - 2 * DOCK_LINE_WIDTH - 0.4
    );
  });

  for (const dock of ['shipping', 'receiving'] as const)
    it(`${dock}: paints the staging legend beside its box, clear of the line, lanes and dressing`, () => {
      const legend = stagingLegend(dock);
      const box = stagingBox(dock);
      const origin = STAGING_ORIGIN[dock];
      const halfWidth = (legend.text.length * 0.65 * legend.fontSize) / 2;
      const capHalf = (0.73 * legend.fontSize * legend.stretch) / 2;
      // No wider than its box, and off the box's outer line edge.
      expect(halfWidth * 2).toBeLessThanOrEqual(box.width);
      const lineOuter = box.depth / 2 + DOCK_LINE_WIDTH / 2;
      expect(Math.abs(legend.z - box.centreZ) - capHalf).toBeGreaterThanOrEqual(lineOuter + 0.1);
      // On the yard side of the box: +z at shipping, -z at receiving.
      expect(Math.sign(legend.z - box.centreZ)).toBe(dock === 'shipping' ? 1 : -1);
      // The box the planner reserves, the lane dashes and the yard dressing.
      const rect = {
        minX: origin[0] + legend.x - halfWidth,
        maxX: origin[0] + legend.x + halfWidth,
        minZ: origin[2] + legend.z - capHalf,
        maxZ: origin[2] + legend.z + capHalf,
      };
      const meets = (b: { minX: number; maxX: number; minZ: number; maxZ: number }) =>
        rect.minX < b.maxX && b.minX < rect.maxX && rect.minZ < b.maxZ && b.minZ < rect.maxZ;
      expect(meets(stagingBounds(dock, [...origin]))).toBe(false);
      const [stripeWidth, stripeLength] = YARD_LANE_STRIPE_SIZE;
      for (const lane of Object.values(YARD_LANE_STRIPES))
        for (const z of lane.zs)
          expect(
            meets({
              minX: lane.x - stripeWidth / 2,
              maxX: lane.x + stripeWidth / 2,
              minZ: lane.originZ + z - stripeLength / 2,
              maxZ: lane.originZ + z + stripeLength / 2,
            }),
            `lane dash ${lane.x}, ${lane.originZ + z}`
          ).toBe(false);
      if (dock === 'shipping')
        for (const footprint of dockDressingFootprints())
          expect(meets(footprint), footprint.id).toBe(false);
    });

  it('is what PalletStaging and TruckBay paint', () => {
    const staging = readFileSync('src/components/truckbay/PalletStaging.tsx', 'utf8');
    expect(staging).toContain('stagingLegend(dock)');
    expect(staging).toContain('scale={[1, legend.stretch, 1]}');
    const truckBay = readFileSync('src/components/TruckBay.tsx', 'utf8');
    const keepClear = truckBay.slice(0, truckBay.indexOf('>\n      KEEP CLEAR\n'));
    const text = keepClear.slice(keepClear.lastIndexOf('<Text'));
    expect(text).toContain('fontSize={DOCK_KEEP_CLEAR_LETTERING.fontSize}');
    expect(text).toContain('scale={[1, DOCK_KEEP_CLEAR_LETTERING.stretch, 1]}');
    expect(text).toContain('anchorY="middle"');
  });
});
