/**
 * One time model for the whole plant.
 *
 * `gameSpeed` is game seconds per real second: the clock, customer deadlines,
 * wear, wages and the cooperative ledger all advance by it. Everything physical
 * (material flow, packing, loading, trucks, forklifts, repair downtime) runs on
 * plant time, which is a FIXED fraction of game time. So a pace control scales
 * the whole world together, and a delivery that is feasible at one pace is
 * feasible at every pace. Before this, plant physics ran on real seconds while
 * deadlines ran on the clock, and at the old 180x default the first order could
 * not physically be delivered on time.
 *
 * Standard pace is the speed at which plant physics plays at its authored rate:
 * 3 packers at 25 kg per plant second is about 9 t per game hour, a realistic
 * mill, and an articulated truck crosses the yard at road speed.
 * Working if `completedAtMinute` for the guided programme agrees at every pace
 * in PACE_GAME_SPEEDS (UnifiedGameTick.playableJourney.test.ts).
 */
export const STANDARD_GAME_SPEED = 30;

/** Plant seconds that elapse per game second, at every pace. */
export const PLANT_SECONDS_PER_GAME_SECOND = 1 / STANDARD_GAME_SPEED;

/** The paces a player can choose. 0 pauses; the rest are 1/2x, 1x, 2x and 4x. */
export const PACE_GAME_SPEEDS = [0, 15, 30, 60, 120] as const;
export type PaceGameSpeed = (typeof PACE_GAME_SPEEDS)[number];

/**
 * The fastest pace. Above 4x the trucks' fixed-step controller cannot keep its
 * per-frame travel bound on an ordinary laptop, so a faster clock would again
 * outrun the vehicles it is meant to accelerate.
 */
export const MAX_GAME_SPEED = 120;

export const isPaceGameSpeed = (value: number): value is PaceGameSpeed =>
  (PACE_GAME_SPEEDS as readonly number[]).includes(value);

/** How much faster than standard pace the whole plant runs: 0 when paused. */
export function plantTimeScale(gameSpeed: number): number {
  return Number.isFinite(gameSpeed) && gameSpeed > 0
    ? Math.min(gameSpeed, MAX_GAME_SPEED) / STANDARD_GAME_SPEED
    : 0;
}

/** Plant seconds for a span of real seconds at the given pace. */
export function plantSecondsForRealSeconds(realSeconds: number, gameSpeed: number): number {
  return Number.isFinite(realSeconds) && realSeconds > 0
    ? realSeconds * plantTimeScale(gameSpeed)
    : 0;
}

/** Plant seconds for a span of game seconds; the same at every pace. */
export function plantSecondsForGameSeconds(gameSeconds: number): number {
  return Number.isFinite(gameSeconds) && gameSeconds > 0
    ? gameSeconds * PLANT_SECONDS_PER_GAME_SECOND
    : 0;
}

/**
 * Saves written before the single time model used 180 as "Standard, 1x" and
 * offered 1800 and 10800. Each maps to the pace it meant to the player: the old
 * default to today's standard, the time-lapse buttons to the fastest pace.
 */
export function migrateLegacyGameSpeed(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value === 180) return STANDARD_GAME_SPEED;
  return Math.min(MAX_GAME_SPEED, value);
}

/**
 * Bags per GAME hour from a packer flow in kg per plant second. The HUD, the
 * daily target and the deadlines are all read on the game clock, so the rate
 * is too: three packers at 25 kg/s read 360 bags/h, not 10,800.
 */
export function bagsPerGameHour(kgPerPlantSecond: number, bagWeightKg: number): number {
  return Number.isFinite(kgPerPlantSecond) && Number.isFinite(bagWeightKg) && bagWeightKg > 0
    ? Math.round(
        (Math.max(0, kgPerPlantSecond) * 3600 * PLANT_SECONDS_PER_GAME_SECOND) / bagWeightKg
      )
    : 0;
}
