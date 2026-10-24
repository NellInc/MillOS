import { BAG_WEIGHT_KG } from '../../types';
import type { ProductionBatch } from '../../stores/materialFlowStore';
import { DOCK_LINE_WIDTH, PAINTED_GROUND_LETTER_STRETCH } from './dockApronLayout';

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

/**
 * The painted box round each dock's staged pallets, in the staging group's
 * local metres: the shipping box holds the whole 5 x 10 grid, the receiving
 * box the two stacks of empty returns.
 */
export function stagingBox(dock: 'shipping' | 'receiving'): {
  centreX: number;
  centreZ: number;
  width: number;
  depth: number;
} {
  if (dock === 'receiving') return { centreX: 1.1, centreZ: 0, width: 4.2, depth: 2 };
  return {
    centreX: ((STAGING_LAYOUT.columns - 1) * STAGING_LAYOUT.pitchX) / 2,
    centreZ: -((STAGING_LAYOUT.rows - 1) * STAGING_LAYOUT.pitchZ) / 2,
    width: (STAGING_LAYOUT.columns - 1) * STAGING_LAYOUT.pitchX + 2,
    depth: (STAGING_LAYOUT.rows - 1) * STAGING_LAYOUT.pitchZ + 2,
  };
}

/** The words painted beside each staging box. */
export const STAGING_LEGEND_TEXT = {
  shipping: 'FLOUR DISPATCH',
  receiving: 'EMPTY PALLETS',
} as const;

/**
 * A conservative advance for Inter capitals and spaces, em per character
 * (FLOUR DISPATCH averages 0.62).
 */
const LEGEND_EM_PER_CHARACTER = 0.65;
/** Clear ground between the box's outer line edge and the capitals, metres. */
const LEGEND_GAP = 0.3;
/** Font size cap, metres: 1.5 m of stretched em, 18 drawing-buffer rows from `logisticsClose`. */
const LEGEND_MAX_FONT_SIZE = 0.6;

/**
 * Where the staging legend is painted, in the staging group's local metres.
 * It lies outside the box on its YARD side, letter tops toward the dock, so it
 * reads upright from the yard cameras at both docks: receiving's yard is -z,
 * so its legend is on the -z side and turned half a revolution. Capitals fill
 * 0.73 of the stretched em, centred on the line's middle (`anchorY` middle).
 */
export function stagingLegend(dock: 'shipping' | 'receiving'): {
  text: string;
  x: number;
  z: number;
  yaw: number;
  fontSize: number;
  stretch: number;
} {
  const box = stagingBox(dock);
  const text = STAGING_LEGEND_TEXT[dock];
  // As large as the paint can be without running past the box's ends.
  const fontSize = Math.min(
    LEGEND_MAX_FONT_SIZE,
    box.width / (text.length * LEGEND_EM_PER_CHARACTER)
  );
  const stretch = PAINTED_GROUND_LETTER_STRETCH;
  const yard = dock === 'shipping' ? 1 : -1;
  const capHalf = (0.73 * fontSize * stretch) / 2;
  return {
    text,
    x: box.centreX,
    z: box.centreZ + yard * (box.depth / 2 + DOCK_LINE_WIDTH / 2 + LEGEND_GAP + capHalf),
    yaw: dock === 'shipping' ? 0 : Math.PI,
    fontSize,
    stretch,
  };
}

/** Local metres. Fill from the dispatch edge back toward the building. */
export function stagedPalletPosition(index: number): [number, number, number] {
  return [
    (index % STAGING_LAYOUT.columns) * STAGING_LAYOUT.pitchX,
    0.06 * STAGING_LAYOUT.scale,
    -Math.floor(index / STAGING_LAYOUT.columns) * STAGING_LAYOUT.pitchZ,
  ];
}
