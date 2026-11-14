/**
 * A lot's readings reach the flour milled from it (plan item 3.1, intake).
 *
 * Before intake the crop year's penalty was one plant-wide figure: every kg of
 * flour packed under a sprouted year lost 9 points, whatever grain it was
 * milled from. Now the penalty is read from the grain itself: the mass-weighted
 * mean readings of the lots a portion of flour was milled from (the genealogy
 * already carries each lot's mass to the batch), so which grain went into
 * which silo decides the stamp.
 *
 * The readings are banded so that every lot a crop year draws (its mean plus
 * or minus its spread, cropYears.ts) falls in that year's band: a falling
 * number under 225 s reads as sprouted (the sprouted year draws 160-220, the
 * wet year 230-290), a moisture of 14.5% or more as wet (the wet year draws
 * 15.1-16.1, every sound year 13.6 or less). A silo of one year's lots
 * therefore stamps exactly the figure the plant-wide rule did, treated and
 * relieved years included, and only a mix of years (a blend) differs. The
 * band edges are game rules chosen against the crop-year table, not quoted
 * figures.
 *
 * A lot with no readings (opening stock, or a lot whose record left the
 * store's tail) reads as the year in force, which is today's behaviour. Pure.
 */
import { CROP_YEARS } from '../chronicle/cropYears';
import type { CropAttributes, CropKind, CropYearState } from '../chronicle/types';

/** Under this falling number (s) a mix reads as sprouted grain. */
export const SPROUTED_FALLING_NUMBER_S = 225;
/** At or over this moisture (%) a mix reads as wet grain. */
export const WET_MOISTURE_PCT = 14.5;

export interface LotReadings {
  moisturePct: number;
  proteinPct: number;
  fallingNumberS: number;
}

/** Everything the stamp's crop term needs, read from the Chronicle once a tick. */
export interface LotStampContext {
  /** The year in force. */
  crop: CropYearState;
  /** Crop kinds an installed plan relieves (effects.ts relievedCropKinds). */
  relieved: readonly CropKind[];
  /** Every other Chronicle quality modifier, summed before the clamp (chronicleTotals). */
  otherPenalty: number;
  /** A lot's stamped readings by id; absent for an unstamped or evicted lot. */
  cropOf: (lotId: string) => CropAttributes | undefined;
}

/** The year in force's mean readings: what an unstamped lot reads as. */
export function yearMeanReadings(kind: CropKind): LotReadings {
  const year = CROP_YEARS[kind];
  return {
    moisturePct: year.moisture.mean,
    proteinPct: year.protein.mean,
    fallingNumberS: year.fallingNumber.mean,
  };
}

/** The band a set of readings falls in, as the crop kind whose penalty it carries. */
export function readingsBand(readings: LotReadings): 'sprouted' | 'wet' | 'sound' {
  if (readings.fallingNumberS < SPROUTED_FALLING_NUMBER_S) return 'sprouted';
  if (readings.moisturePct >= WET_MOISTURE_PCT) return 'wet';
  return 'sound';
}

/**
 * The mass-weighted mean readings of some grain, by lot. Null with no mass.
 * Unstamped lots read as the year in force.
 */
export function mixReadings(
  contributions: ReadonlyArray<{ lotId: string; amount: number }>,
  context: Pick<LotStampContext, 'crop' | 'cropOf'>
): LotReadings | null {
  let mass = 0;
  let moisture = 0;
  let protein = 0;
  let falling = 0;
  const fallback = yearMeanReadings(context.crop.kind);
  for (const { lotId, amount } of contributions) {
    if (!(amount > 0)) continue;
    const crop = context.cropOf(lotId);
    mass += amount;
    moisture += (crop?.moisturePct ?? fallback.moisturePct) * amount;
    protein += (crop?.proteinPct ?? fallback.proteinPct) * amount;
    falling += (crop?.fallingNumberS ?? fallback.fallingNumberS) * amount;
  }
  if (mass <= 0) return null;
  return {
    moisturePct: moisture / mass,
    proteinPct: protein / mass,
    fallingNumberS: falling / mass,
  };
}

/**
 * Crop points a mix takes off wheat flour: its band's year penalty, or that
 * year's treated penalty when the year in force of that kind was treated or an
 * installed plan relieves it (cropYears.ts cropWheatPenalty, per band). Wet
 * grain the temper card dried first (plan item 7.7, chronicle/temper.ts) reads
 * as treated while that temper is the one at the rolls.
 */
export function cropPointsForReadings(
  readings: LotReadings | null,
  context: Pick<LotStampContext, 'crop' | 'relieved'>
): number {
  if (!readings) return cropPointsForKind(context.crop.kind, context);
  const band = readingsBand(readings);
  return band === 'sound' ? 0 : cropPointsForKind(band, context);
}

function cropPointsForKind(kind: CropKind, context: Pick<LotStampContext, 'crop' | 'relieved'>) {
  const year = CROP_YEARS[kind];
  const treated = context.crop.kind === kind && context.crop.treated;
  const dried = kind === 'wet' && context.crop.temper?.inForce === 'dry-first';
  return treated || dried || context.relieved.includes(kind)
    ? year.treatedPenalty
    : year.wheatPenalty;
}

/** The Chronicle's whole penalty on flour from this grain, clamped as chronicleEffect does. */
export function stampPenaltyFor(
  contributions: ReadonlyArray<{ lotId: string; amount: number }>,
  context: LotStampContext
): number {
  const points = cropPointsForReadings(mixReadings(contributions, context), context);
  return clampPenalty(context.otherPenalty + points);
}

/**
 * The penalty on the worst of several bins' grain (one bin per silo), each
 * read on its own: the lowest stamp any flour milled from them can carry. A
 * packed portion is a blend of the silos its mills draw on, in whatever
 * shares the spouts deliver (systems/__tests__/temperRuntime.test.ts), so it
 * can read wet or sprouted only if some silo does, and may whenever one does;
 * the bins' mean can read sound while one silo's flour is packed five points
 * down. With no grain in any bin, the year in force's (as stampPenaltyFor
 * reads no grain).
 */
export function worstBinPenalty(
  bins: ReadonlyArray<ReadonlyArray<{ lotId: string; amount: number }>>,
  context: LotStampContext
): number {
  let worst: number | null = null;
  for (const bin of bins)
    if (bin.some((source) => source.amount > 0))
      worst = Math.max(worst ?? 0, stampPenaltyFor(bin, context));
  return worst ?? stampPenaltyFor([], context);
}

/** chronicleEffect's clamp on the quality penalty. */
export function clampPenalty(value: number): number {
  return Math.min(12, Math.max(0, Number.isFinite(value) ? value : 0));
}
