import { BAG_WEIGHT_KG } from '../../types';
import type { ProductionBatch } from '../../stores/materialFlowStore';

/** Finished flour only. Other products and quarantined lots remain in their
 * existing buffers. Working if dispatch, hold and release change visible bags
 * without creating inventory or rounding a partial bag up to a full one.
 */
export const STAGING_LAYOUT = {
  columns: 5,
  rows: 10,
  pitchX: 2.2,
  pitchZ: 1.75,
  scale: 1.4,
  bagsPerPallet: 12,
  shippingOrigin: [16, 0, 70.75] as const,
  receivingOrigin: [-12, 0, -55] as const,
};
export const STAGING_PALLET_CAPACITY = STAGING_LAYOUT.columns * STAGING_LAYOUT.rows;
export const STAGING_BAG_CAPACITY = STAGING_PALLET_CAPACITY * STAGING_LAYOUT.bagsPerPallet;

export function getStagedFlourBagCount(batches: readonly ProductionBatch[]): number {
  const kg = batches.reduce(
    (sum, batch) =>
      sum +
      (batch.materialType === 'flour' &&
      batch.disposition === 'released' &&
      Number.isFinite(batch.availableKg)
        ? Math.max(0, batch.availableKg)
        : 0),
    0
  );
  return Math.min(STAGING_BAG_CAPACITY, Math.floor(kg / BAG_WEIGHT_KG));
}

/** Local metres. Fill from the dispatch edge back toward the building. */
export function stagedPalletPosition(index: number): [number, number, number] {
  return [
    (index % STAGING_LAYOUT.columns) * STAGING_LAYOUT.pitchX,
    0.06 * STAGING_LAYOUT.scale,
    -Math.floor(index / STAGING_LAYOUT.columns) * STAGING_LAYOUT.pitchZ,
  ];
}
