/**
 * The plant as the Chronicle probe measured it (plan item 4.1, D3): every
 * Chronicle figure that rests on what the plant does reads it from here, so a
 * re-tune after the plant changes is one sweep and one edit.
 *
 * Measured by `src/systems/__tests__/chronicleProbe.playtest.test.ts`, which
 * drives the real central tick at the standard pace (30) with a charter signed
 * and prints a `measured` line from its runs (MILLOS_CHRONICLE_PROBE_GATES).
 * The figures are the plant harness's no-charter arm p (no input at all, the
 * partner's choice on every proposal; plantMeasure.playtest.test.ts,
 * MILLOS_PLANT_PARTNER_OUT), re-copied on the final tree of 14 November
 * (review 2, finding 9): ten shifts, 52 orders on time, 0 late, net 42,593.2.
 * The probe's `measured` line (the attentive style under a charter) is a check
 * on them, not their source. To re-tune, re-run arm p, copy its figures here,
 * and run the probe's gates again (docs/CHRONICLE.md, "Re-tuning on the
 * measured plant").
 */
export const MEASURED_PLANT = {
  /**
   * Kilograms dispatched a shift (shift report `dispatchedKg`), median of arm
   * p's ten: 17,500 to 25,000, median 20,500 (was 19,500, on the tree before
   * the plant's last fixes).
   */
  shiftKg: 20_500,
  /** The shift review's net (`shiftMargin`), mean: 4,259.3 (unchanged since 13 November). */
  shiftNet: 4_259,
  /** Energy booked a shift, mean: 176 (was 167). */
  shiftEnergyCost: 176,
  /** Revenue a shift, mean (the loyalty premium is a share of it): 18,038 (was 15,000). */
  shiftRevenue: 18_000,
} as const;

/**
 * Fund a measured shift reinvests (engine.ts derives REINVESTMENT_SHARE from it
 * and `shiftNet`). Set by the probe's fund gates: a buyer's fund must bind. At
 * 39.41 of 3,864 (1.02%) every buyer of the short form ended inside three
 * times the dearest plan and one full-length buyer about 48 over (wave 4c);
 * 38.8 of 4,259 (0.91%) was item 7c's tune (about 80 of a full buyer's end per
 * 1.0, and the wet-year dryer no longer takes 125 from the fund). On the final
 * plant (13 November, 15:45) four of sixteen full-length buyers still ended over
 * the cap (up to 1,561 against 1,380): every plan a Regional mill can buy is
 * installed by shift 45 to 58, so a full chronicle's last shifts only bank.
 * 35 (0.82%) left the richest attentive run 19 under it; 33.5 (0.79%) held
 * every buyer under it until the plant's temper card was fixed (judged silo by
 * silo), which raised wet-year revenue: one attentive run with the cards left
 * to their windows then ended at 1,450. 30 of 4,259 (0.70%) is the final tune.
 * A loyal customer adds about 27 more a shift (customers.ts).
 */
export const REINVESTED_PER_MEASURED_SHIFT = 30;

/**
 * Gold on a dispatch trial asks for this multiple of the measured pace over
 * the shifts gold allows; silver lands where the window's spares put it
 * (trials.ts gives each trial's figure).
 */
export const GOLD_PACE = 1.2;

/**
 * Grid Winter's energy cap, per kilogram dispatched over its window. The old
 * 0.08 sat ten times above the measured plant (0.005 to 0.014 a kg), so it
 * never bound. Set between what the partner's default plant books over a
 * window and what the same plant books when its output per hour is raised (the
 * early programme taken), so output per hour and the night shifts' cheaper power
 * decide it, as the card says.
 */
export const GRID_WINTER_MAX_ENERGY_PER_KG = 0.008;

/**
 * Energy per kg is judged and printed to four decimals: at the measured
 * 0.005 to 0.014 a kg, three decimals could not tell the levers apart.
 */
export const ENERGY_DIGITS = 4;
export const ENERGY_SCALE = 10 ** ENERGY_DIGITS;

/**
 * Gold in a 27-shift chronicle's windows, which have one spare shift where the
 * full form's have two. On the final plant of 14 November the skilled player
 * shipped 73,000 to 78,000 kg in a short window's first three shifts (1.19 to
 * 1.27 times the pace) and 97,000 to 110,000 in the Great Programme's four, so
 * 1.2 times the re-measured 20,500 (74,000) cost skilled gold in up to seven of
 * eight seeds on the Wet Harvest and the Bakers' Rush. 1.17 puts gold at
 * 72,000 and 96,000. An idle player still ships more than that in a short
 * window's four shifts, so no tonnage denies it silver without denying skilled
 * gold (docs/CHRONICLE.md, "the last tuning pass").
 */
export const SHORT_GOLD_PACE = 1.17;

/** A dispatch trial's tonnage: gold at `goldPace` times the pace over `goldShifts`, to the 500 kg. */
export function trialKg(
  goldShifts: number,
  pace: number = MEASURED_PLANT.shiftKg,
  goldPace: number = GOLD_PACE
): number {
  return Math.round((goldPace * pace * goldShifts) / 500) * 500;
}
