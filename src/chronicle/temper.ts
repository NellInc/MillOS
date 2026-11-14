/**
 * Tempering as a decision (plan item 7.7). Before milling, wheat is tempered:
 * water is added to bring it to approximately 15% moisture, and it stands for
 * 2 to 24 hours so the water can work into the kernel (Kansas State MF-2353,
 * stores/millingSources.ts). The plant tempers every lot to its intake reading
 * and rests it for 2 hours, the shortest rest that source gives.
 *
 * A wet crop year's wheat comes in above that target, and the year takes its
 * points off wheat flour (cropYears.ts). The temper card (simulation/
 * temperProposal.ts) asks, once a shift, whether to dry the shift's wheat
 * first, which removes the wet year's points from flour milled from it, at
 * the energy the drying books. An answer covers one shift's wheat and reaches
 * the rolls after its rest; until then the line mills grain tempered as
 * before. The plant's silos stay full (measured: plantFloor.playtest.test.ts),
 * so the rest never withholds grain from the line; it is priced as the hours
 * before the answer reaches the flour.
 *
 * Kept on the crop year (CropYearState.temper), so it ends with the year and
 * every reader of the crop's penalty (the tick's per-lot stamp, the margin
 * card, the plant-wide figure) reads the same answer. Pure.
 *
 * Game rules here, not quoted figures: the dried moisture (under the wet band,
 * simulation/lotQuality.ts WET_MOISTURE_PCT) and the drying energy, a game
 * price, unsourced and quoted nowhere.
 */
import { OFF_PEAK_TARIFF_PER_KWH, PEAK_TARIFF_PER_KWH } from '../utils/energyCalculations';
import { CROP_YEARS } from './cropYears';
import { MEASURED_PLANT } from './measuredPlant';
import type { TemperEntry, TemperOptionId, TemperState } from './types';

export const TEMPER_OPTION_IDS: readonly TemperOptionId[] = ['standard', 'dry-first'];
/** The tempering target, approximately (MF-2353). */
export const TEMPER_TARGET_PCT = 15;
/** The plant's rest: 2 hours, the shortest of MF-2353's 2 to 24. */
export const TEMPER_REST_MINUTES = 120;
/** One answer covers one shift's wheat. */
export const TEMPER_COVER_MINUTES = 480;
/** Dried grain's moisture (a game rule: under the wet band's 14.5%). */
export const DRIED_MOISTURE_PCT = 14;
/** kWh to take a kilogram of water out of grain (a game price, unsourced, quoted nowhere). */
export const DRYING_KWH_PER_KG_WATER = 1.2;
/**
 * The wheat a measured shift mills: its dispatched flour over the conversion
 * ratios a kilogram of wheat goes through (materialFlowStore: 0.72 x 0.95).
 */
export const SHIFT_WHEAT_KG = Math.round(MEASURED_PLANT.shiftKg / (0.72 * 0.95));
/**
 * What drying a measured shift's wheat of a wet year's mean moisture costs at
 * the day's mean tariff (twelve hours each of peak and off-peak): what the
 * engine values a change to drying energy against.
 */
export const REFERENCE_DRYING_COST =
  Math.round(
    waterToDryKg(SHIFT_WHEAT_KG, CROP_YEARS.wet.moisture.mean) *
      DRYING_KWH_PER_KG_WATER *
      ((PEAK_TARIFF_PER_KWH + OFF_PEAK_TARIFF_PER_KWH) / 2) *
      100
  ) / 100;
/** Answers kept: one shift's and the next. */
const MAX_ENTRIES = 4;

/** The temper at the rolls at a minute: the latest answer whose grain is there, else the standard. */
export function temperAt(temper: TemperState | undefined, minute: number): TemperOptionId {
  if (!temper) return 'standard';
  for (let i = temper.schedule.length - 1; i >= 0; i--) {
    const entry = temper.schedule[i];
    if (entry.fromMinute <= minute && minute < entry.untilMinute) return entry.option;
  }
  return 'standard';
}

/** The temper the line will be on once every answer given has reached the rolls. */
export function temperAhead(temper: TemperState | undefined): TemperOptionId {
  return temper?.schedule.at(-1)?.option ?? temper?.inForce ?? 'standard';
}

/** An answer given at `minute`: its shift's wheat reaches the rolls after the rest. */
export function withTemperAnswer(
  temper: TemperState | undefined,
  option: TemperOptionId,
  minute: number
): TemperState {
  const fromMinute = minute + TEMPER_REST_MINUTES;
  const entry: TemperEntry = {
    option,
    fromMinute,
    untilMinute: fromMinute + TEMPER_COVER_MINUTES,
  };
  const kept = (temper?.schedule ?? []).filter((e) => e.untilMinute > minute);
  return {
    inForce: temperAt(temper, minute),
    schedule: [...kept, entry].slice(-MAX_ENTRIES),
  };
}

/** The temper as it stands at `minute`; the same object when nothing changed. */
export function stepTemperState(temper: TemperState, minute: number): TemperState {
  const inForce = temperAt(temper, minute);
  const schedule = temper.schedule.filter((entry) => entry.untilMinute > minute);
  if (inForce === temper.inForce && schedule.length === temper.schedule.length) return temper;
  return { inForce, schedule };
}

/**
 * The water drying takes out of a mass of grain from its moisture to the
 * dried moisture, in kilograms (mass balance on the dry matter); 0 when the
 * grain is already at or under it.
 */
export function waterToDryKg(grainKg: number, moisturePct: number): number {
  if (!(grainKg > 0) || !(moisturePct > DRIED_MOISTURE_PCT)) return 0;
  return (grainKg * (moisturePct - DRIED_MOISTURE_PCT)) / (100 - DRIED_MOISTURE_PCT);
}

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const isOption = (value: unknown): value is TemperOptionId =>
  (TEMPER_OPTION_IDS as readonly unknown[]).includes(value);

/** A saved temper, re-read field by field; undefined when this build cannot read it. */
export function sanitizeTemper(value: unknown): TemperState | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (!isOption(record.inForce)) return undefined;
  const schedule = Array.isArray(record.schedule)
    ? record.schedule.flatMap((entry): TemperEntry[] => {
        if (!entry || typeof entry !== 'object') return [];
        const e = entry as Record<string, unknown>;
        return isOption(e.option) &&
          isNumber(e.fromMinute) &&
          isNumber(e.untilMinute) &&
          e.untilMinute > e.fromMinute
          ? [{ option: e.option, fromMinute: e.fromMinute, untilMinute: e.untilMinute }]
          : [];
      })
    : [];
  return { inForce: record.inForce, schedule: schedule.slice(-MAX_ENTRIES) };
}
