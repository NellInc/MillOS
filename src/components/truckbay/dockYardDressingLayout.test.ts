import { describe, expect, it } from 'vitest';
import { protectedEgressApproaches, stagingBounds } from '../../simulation/layoutPlanning';
import { STAGING_LAYOUT } from './palletStagingLayout';
import {
  DOCK_APRON_ITEMS,
  DOCK_ISLAND_BOLLARDS,
  DOCK_ISLAND_ITEMS,
  DOCK_PALLET_ISLAND,
  PARKED_TRAILER_HALF,
  TRAILER_DROP_YARD,
  dockDressingBounds,
  dockDressingFootprints,
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
