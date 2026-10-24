/**
 * Crop years: harvest variation stamped on every receiving lot.
 *
 * The penalties are chosen against the recipe thresholds in
 * operationsCampaignStore (strong white 95, community flour 92, semolina 90,
 * with a released QC grade A reading 100). A wet year's 6 points fails strong
 * white (94 < 95) but leaves community flour (94 >= 92) and corn semolina
 * viable, so switching recipe or paying to condition are both real responses;
 * moisture meters take one point back. A sprouted year's 9 points fails every
 * wheat recipe (91 < 92) until the grain is blended.
 */
import { cropWeights } from './charter';
import { chronicleChance, chronicleStream, weightedPick } from './rng';
import type { Charter, CropAttributes, CropKind, CropYearDefinition, CropYearState } from './types';

export const SHIFTS_PER_CROP_YEAR = 9;
export const CROP_YEARS_PER_CHRONICLE = 7;
export const CHRONICLE_SHIFTS = SHIFTS_PER_CROP_YEAR * CROP_YEARS_PER_CHRONICLE;

export const CROP_YEARS: Record<CropKind, CropYearDefinition> = {
  typical: {
    kind: 'typical',
    label: 'Ordinary harvest',
    moisture: { mean: 13.2, spread: 0.4 },
    protein: { mean: 11.8, spread: 0.4 },
    fallingNumber: { mean: 320, spread: 25 },
    wheatPenalty: 0,
    treatedPenalty: 0,
    noteId: null,
  },
  bountiful: {
    kind: 'bountiful',
    label: 'Bountiful harvest',
    moisture: { mean: 13.0, spread: 0.3 },
    protein: { mean: 12.1, spread: 0.3 },
    fallingNumber: { mean: 340, spread: 20 },
    wheatPenalty: 0,
    treatedPenalty: 0,
    reinvestment: 0.05,
    noteId: 'history-corn-laws',
  },
  dry: {
    kind: 'dry',
    label: 'Hot, dry harvest',
    moisture: { mean: 11.6, spread: 0.4 },
    protein: { mean: 13.4, spread: 0.5 },
    fallingNumber: { mean: 360, spread: 25 },
    wheatPenalty: 0,
    treatedPenalty: 0,
    noteId: 'history-nilometer',
  },
  wet: {
    kind: 'wet',
    label: 'Wet harvest',
    moisture: { mean: 15.6, spread: 0.5 },
    protein: { mean: 11.2, spread: 0.4 },
    fallingNumber: { mean: 260, spread: 30 },
    wheatPenalty: 6,
    treatedPenalty: 0,
    noteId: 'history-grain-moisture',
  },
  sprouted: {
    kind: 'sprouted',
    label: 'Sprouted harvest',
    moisture: { mean: 14.6, spread: 0.5 },
    protein: { mean: 11.0, spread: 0.4 },
    fallingNumber: { mean: 190, spread: 30 },
    wheatPenalty: 9,
    treatedPenalty: 2,
    noteId: 'history-falling-number',
  },
};

/** Crop year index (0-based) for a closed-shift count. */
export function cropYearIndexForShift(shift: number): number {
  return Math.floor(Math.max(0, shift) / SHIFTS_PER_CROP_YEAR);
}

/**
 * The crop kind for a year. The first year is always ordinary so the player can
 * learn the mill; a historical chronicle's second year is the Wet Harvest trial.
 */
export function cropKindForYear(charter: Charter, yearIndex: number): CropKind {
  if (yearIndex === 0) return 'typical';
  if (charter.mode === 'historical' && yearIndex === 1) return 'wet';
  const weights = cropWeights(charter.grain);
  const kinds = Object.keys(weights) as CropKind[];
  return (
    weightedPick(
      kinds,
      (kind) => weights[kind],
      chronicleChance(charter.seed, 'crop', yearIndex)
    ) ?? 'typical'
  );
}

export function createCropYear(charter: Charter, yearIndex: number): CropYearState {
  return { index: yearIndex, kind: cropKindForYear(charter, yearIndex), treated: false };
}

function spreadDraw(mean: number, spread: number, draw: number): number {
  return Math.round((mean + (draw * 2 - 1) * spread) * 10) / 10;
}

/** Crop attributes for one delivery, keyed by the Chronicle's delivery counter. */
export function stampDelivery(
  charter: Charter,
  crop: CropYearState,
  deliveryIndex: number
): CropAttributes {
  const definition = CROP_YEARS[crop.kind];
  const next = chronicleStream(charter.seed, 'delivery', deliveryIndex);
  return {
    cropYear: crop.index,
    kind: crop.kind,
    moisturePct: spreadDraw(definition.moisture.mean, definition.moisture.spread, next()),
    proteinPct: spreadDraw(definition.protein.mean, definition.protein.spread, next()),
    fallingNumberS: Math.round(
      spreadDraw(definition.fallingNumber.mean, definition.fallingNumber.spread, next())
    ),
  };
}

/** Quality points the current crop year takes off wheat recipes. */
export function cropWheatPenalty(
  crop: CropYearState | null,
  relieved: readonly CropKind[]
): number {
  if (!crop) return 0;
  const definition = CROP_YEARS[crop.kind];
  if (crop.treated || relieved.includes(crop.kind)) return definition.treatedPenalty;
  return definition.wheatPenalty;
}

export interface QCReadings {
  grade: 'A' | 'B';
  moistureContent: number;
  proteinLevel: number;
  ashContent: number;
  particleSize: number;
  fallingNumber: number | null;
}

/** The readings the QC laboratory recorded before the Chronicle existed. */
export const DEFAULT_QC_READINGS: QCReadings = {
  grade: 'A',
  moistureContent: 13.2,
  proteinLevel: 11.8,
  ashContent: 0.52,
  particleSize: 120,
  fallingNumber: null,
};

/**
 * Laboratory readings for a batch from its stamped source lots, weighted by
 * mass. Lots without crop attributes (before a charter) give the old readings.
 */
export function qcReadingsForLots(
  lots: ReadonlyArray<{ crop?: CropAttributes; amountKg: number }>
): QCReadings {
  let mass = 0;
  let moisture = 0;
  let protein = 0;
  let falling = 0;
  for (const lot of lots) {
    if (!lot.crop || !(lot.amountKg > 0)) continue;
    mass += lot.amountKg;
    moisture += lot.crop.moisturePct * lot.amountKg;
    protein += lot.crop.proteinPct * lot.amountKg;
    falling += lot.crop.fallingNumberS * lot.amountKg;
  }
  if (mass <= 0) return DEFAULT_QC_READINGS;
  const moistureContent = Math.round((moisture / mass) * 10) / 10;
  const fallingNumber = Math.round(falling / mass);
  return {
    // Only far out-of-specification grain grades down; the crop-year penalty
    // carries the ordinary consequence, so one test never cliffs a recipe.
    grade: moistureContent > 16.5 || fallingNumber < 150 ? 'B' : 'A',
    moistureContent,
    proteinLevel: Math.round((protein / mass) * 10) / 10,
    ashContent: 0.52,
    particleSize: 120,
    fallingNumber,
  };
}

/** Fund cost to condition, dry or blend a crop year in place (base units). */
export function cropTreatmentCost(kind: CropKind): number {
  // Treating in place is the dearest route: events and plans do it cheaper.
  return kind === 'sprouted' || kind === 'wet' ? 200 : 0;
}
