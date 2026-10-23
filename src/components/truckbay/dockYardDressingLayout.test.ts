import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import { protectedEgressApproaches, stagingBounds } from '../../simulation/layoutPlanning';
import { STAGING_LAYOUT } from './palletStagingLayout';
import { buildYardWearLayout, YARD_WEAR_PAVING } from './yardWear';
import {
  DOCK_APRON_ITEMS,
  DOCK_ISLAND_BOLLARDS,
  DOCK_ISLAND_ITEMS,
  DOCK_PALLET_ISLAND,
  PARKED_TRAILER_HALF,
  TRAILER_DROP_YARD,
  TRUCK_STAGING_LETTERING,
  dockDressingBounds,
  dockDressingFootprints,
  dockIslandBoxes,
  paintedLegendBounds,
  type DressingBox,
  type PlanRect,
} from './dockYardDressingLayout';

const meets = (a: Omit<PlanRect, 'id'>, b: Omit<PlanRect, 'id'>) =>
  a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ;

/**
 * The truck paths are checked against these footprints in
 * `truckController.test.ts` (SHIPPING_YARD_SOLIDS). This file checks the rest:
 * the dressing keeps off the dispatch box, the dock's protected pedestrian
 * approaches and itself, and the island's props stand on the island.
 */
describe('shipping dock yard dressing', () => {
  it('keeps every island prop inside the kerb', () => {
    const k = DOCK_PALLET_ISLAND.kerbWidth;
    for (const item of DOCK_ISLAND_ITEMS) {
      const b = dockDressingBounds(item);
      expect(b.minX, item.id).toBeGreaterThanOrEqual(DOCK_PALLET_ISLAND.minX + k);
      expect(b.maxX, item.id).toBeLessThanOrEqual(DOCK_PALLET_ISLAND.maxX - k);
      expect(b.minZ, item.id).toBeGreaterThanOrEqual(DOCK_PALLET_ISLAND.minZ + k);
      expect(b.maxZ, item.id).toBeLessThanOrEqual(DOCK_PALLET_ISLAND.maxZ - k);
    }
    for (const [x, z] of DOCK_ISLAND_BOLLARDS) {
      expect(x).toBeGreaterThan(DOCK_PALLET_ISLAND.minX);
      expect(x).toBeLessThan(DOCK_PALLET_ISLAND.maxX);
      expect(z).toBeGreaterThan(DOCK_PALLET_ISLAND.minZ);
      expect(z).toBeLessThan(DOCK_PALLET_ISLAND.maxZ);
    }
  });

  it('puts no two standing props in the same place', () => {
    // The dock board leans on a stack, so it alone may share plan with one.
    const items = [...DOCK_ISLAND_ITEMS, ...DOCK_APRON_ITEMS].filter(
      (item) => item.kind !== 'dockBoard'
    );
    for (let i = 0; i < items.length; i += 1)
      for (let j = i + 1; j < items.length; j += 1)
        expect(
          meets(dockDressingBounds(items[i]), dockDressingBounds(items[j])),
          `${items[i].id} / ${items[j].id}`
        ).toBe(false);
  });

  /**
   * The staging bay as the graded cameras see it. In plan nothing touched, yet
   * logistics-close read the jack's forks running into the spill bin and the
   * bin clipping the corner bollard (med-06, med-12): from (18, 3.8, 96) the
   * bollard, the bin and the jack stood on one line of sight, 0.1-0.5 m apart,
   * so their silhouettes merged. Two solids may overlap on screen only when a
   * metre or more of air separates them, which the eye reads as one in front
   * of the other. Rows of pallets are rows and are exempt from the screen test;
   * the dock board leans on its stack by design.
   */
  it('lays the staging-bay props out clear of each other, in plan and from both cameras', () => {
    const cameras = (['logisticsClose', 'shipping'] as const).map((name) => {
      const view = SITE_LAYOUT.cameras[name] as {
        position: readonly number[];
        target: readonly number[];
        fov?: number;
      };
      // The benchmark viewport is 16:9; an unset fov is the canvas default, 45.
      const camera = new THREE.PerspectiveCamera(view.fov ?? 45, 16 / 9, 0.5, 300);
      camera.position.set(view.position[0], view.position[1], view.position[2]);
      camera.lookAt(view.target[0], view.target[1], view.target[2]);
      camera.updateMatrixWorld();
      return { name, camera };
    });
    const point = new THREE.Vector3();
    /** Screen rect of a box in the 2560 x 1440 capture frame. */
    const onScreen = (box: DressingBox, camera: THREE.Camera) => {
      const r = [Infinity, -Infinity, Infinity, -Infinity];
      for (const x of [box.minX, box.maxX])
        for (const y of [box.minY, box.maxY])
          for (const z of [box.minZ, box.maxZ]) {
            point.set(x, y, z).project(camera);
            const px = ((point.x + 1) / 2) * 2560;
            const py = ((1 - point.y) / 2) * 1440;
            r[0] = Math.min(r[0], px);
            r[1] = Math.max(r[1], px);
            r[2] = Math.min(r[2], py);
            r[3] = Math.max(r[3], py);
          }
      return r;
    };
    const gap = (a: DressingBox, b: DressingBox) =>
      Math.hypot(
        Math.max(0, a.minX - b.maxX, b.minX - a.maxX),
        Math.max(0, a.minY - b.maxY, b.minY - a.maxY),
        Math.max(0, a.minZ - b.maxZ, b.minZ - a.maxZ)
      );
    const kinds = new Map<string, string>(DOCK_ISLAND_ITEMS.map((item) => [item.id, item.kind]));
    const pallets = (id: string) => ['load', 'palletStack'].includes(kinds.get(id) ?? '');
    const boxes = dockIslandBoxes();
    const failures: string[] = [];
    for (let i = 0; i < boxes.length; i += 1)
      for (let j = i + 1; j < boxes.length; j += 1) {
        const [a, b] = [boxes[i], boxes[j]];
        const pair = `${a.id} / ${b.id}`;
        if (pair === 'empties-mid / spare-board') continue;
        const row = pallets(a.id) && pallets(b.id);
        const air = gap(a, b);
        if (air < (row ? 0.1 : 0.25)) failures.push(`${pair}: ${air.toFixed(2)} m apart`);
        if (row || air >= 1) continue;
        for (const { name, camera } of cameras) {
          const [p, q] = [onScreen(a, camera), onScreen(b, camera)];
          const margin = 8;
          if (
            p[0] < q[1] + margin &&
            q[0] < p[1] + margin &&
            p[2] < q[3] + margin &&
            q[2] < p[3] + margin
          )
            failures.push(`${pair}: merge on screen in ${name}, ${air.toFixed(2)} m apart`);
        }
      }
    expect(failures).toEqual([]);
  });

  it('keeps off the dispatch box and the dock pedestrian approaches', () => {
    const staging = stagingBounds('shipping', [...STAGING_LAYOUT.shippingOrigin]);
    const approaches = protectedEgressApproaches();
    for (const rect of dockDressingFootprints()) {
      expect(meets(rect, staging), `${rect.id} in the dispatch box`).toBe(false);
      for (const approach of approaches)
        expect(meets(rect, approach), `${rect.id} on ${approach.id}`).toBe(false);
    }
  });
});

describe('TRUCK STAGING legend', () => {
  const legend = paintedLegendBounds(TRUCK_STAGING_LETTERING);
  const wear = buildYardWearLayout('shipping');

  it('stands on the yard paving, clear of the lane lines and the yard perimeter kit', () => {
    expect(legend.minX).toBeGreaterThan(YARD_WEAR_PAVING.minX + 2);
    expect(legend.maxX).toBeLessThan(YARD_WEAR_PAVING.maxX - 2);
    expect(legend.minZ).toBeGreaterThan(YARD_WEAR_PAVING.minZ + 2);
    expect(legend.maxZ).toBeLessThan(YARD_WEAR_PAVING.maxZ - 2);
    // Lane stripes (0.15 x 4 m) at x +/-18, every 10 m from the dock line.
    for (const x of [-18, 18])
      for (let z = 50; z <= 90; z += 10)
        expect(
          meets(legend, { minX: x - 0.6, maxX: x + 0.6, minZ: z - 2.5, maxZ: z + 2.5 }),
          `lane stripe ${x}, ${z}`
        ).toBe(false);
    // The weigh-scale deck at (-16, 100) and its booth (truckController.test.ts).
    expect(meets(legend, { minX: -20.7, maxX: -13.9, minZ: 92.75, maxZ: 107.25 })).toBe(false);
  });

  it('keeps clear of the pallet island and every piece of yard dressing', () => {
    for (const rect of dockDressingFootprints())
      expect(
        meets(legend, {
          minX: rect.minX - 1,
          maxX: rect.maxX + 1,
          minZ: rect.minZ - 1,
          maxZ: rect.maxZ + 1,
        }),
        rect.id
      ).toBe(false);
  });

  it('lies where no tyre track or oil stain is laid', () => {
    for (const track of wear.tracks)
      for (const sample of track.samples) {
        if (sample.weight < 0.01) continue;
        const r = track.width / 2 + 0.5;
        const inside =
          sample.x > legend.minX - r &&
          sample.x < legend.maxX + r &&
          sample.z > legend.minZ - r &&
          sample.z < legend.maxZ + r;
        expect(inside, `${track.id} at (${sample.x}, ${sample.z})`).toBe(false);
      }
    for (const stain of wear.stains) {
      const r = stain.radius * stain.stretch + 0.5;
      const inside =
        stain.x > legend.minX - r &&
        stain.x < legend.maxX + r &&
        stain.z > legend.minZ - r &&
        stain.z < legend.maxZ + r;
      expect(inside, `oil at (${stain.x}, ${stain.z})`).toBe(false);
    }
  });

  it('is what TruckBay paints, at both yards', () => {
    const source = readFileSync('src/components/TruckBay.tsx', 'utf8');
    expect(source.match(/TRUCK_STAGING_LETTERING\.text/g)).toHaveLength(2);
    expect(source).not.toMatch(/>\s*TRUCK STAGING\s*</);
  });
});

describe('trailer drop yard', () => {
  const underATrailer = (x: number) =>
    TRAILER_DROP_YARD.trailers.some(
      (trailer) =>
        Math.abs(x - trailer.x) <
        PARKED_TRAILER_HALF.width + TRAILER_DROP_YARD.bayLines.width / 2 + 0.3
    );

  it('stands every trailer on the pad, in a bay of its own', () => {
    const { pad, trailers, bayLines } = TRAILER_DROP_YARD;
    for (const trailer of trailers) {
      expect(Math.abs(trailer.x) + PARKED_TRAILER_HALF.width).toBeLessThan(pad.width / 2);
      expect(Math.abs(trailer.z) + PARKED_TRAILER_HALF.length).toBeLessThan(pad.depth / 2);
      // Bay lines either side of it, and none under it.
      expect(bayLines.xs.some((x) => x < trailer.x - PARKED_TRAILER_HALF.width)).toBe(true);
      expect(bayLines.xs.some((x) => x > trailer.x + PARKED_TRAILER_HALF.width)).toBe(true);
      expect(trailer.z - PARKED_TRAILER_HALF.length).toBeGreaterThan(bayLines.z0);
      expect(trailer.z + PARKED_TRAILER_HALF.length).toBeLessThan(bayLines.z1);
    }
    for (const x of bayLines.xs) expect(underATrailer(x), `line at ${x}`).toBe(false);
  });

  it('rejects the old lines, which ran down each trailer centreline', () => {
    for (const x of [-6, 0, 6]) expect(underATrailer(x)).toBe(true);
  });
});
