/**
 * WALKING PACE (D16): how fast a first-person body moves, shared by the
 * desktop and phone controllers.
 *
 * Inside the hall the player walks at a person's pace, beside colleagues who
 * walk at 1.25 m/s (communityLife.ts COMMUNITY_WALK_SPEED_MPS), so a forklift
 * lane is crossed at the speed the give-way was built for. The old 12 m/s walk
 * and 43 m/s sprint crossed the 100 m hall in two seconds.
 *
 * Sources (raw text read 2026-11-13):
 * - Wikipedia, "Walking": the average walking speed at crosswalks is about
 *   1.4 m/s (5.0 km/h); a brisk walk is around 6.5 km/h.
 * - Wikipedia, "Jogging": jogging speed is in general between 4 and 6 mph
 *   (1.8 to 2.7 m/s).
 * - Wikipedia, "Running", world-record speeds by distance: 7.92 m/s (men) and
 *   7.06 m/s (women) held over 800 m, 6.60 and 5.97 m/s over 5,000 m.
 *
 * Outside the hall the site is a few hundred metres across (the castle is
 * 394 m from the mill), so the walk there is a jog and Shift a run that a fit
 * person holds over that distance, well under the record speeds over 800 m.
 */
import { SITE_LAYOUT } from '../constants/siteLayout';

/** Inside the hall: an average walk, and a jog at the top of its range. */
export const HALL_WALK_SPEED = 1.4;
export const HALL_HURRY_SPEED = 2.7;
/** Outside the hall: a jog, and a run. */
export const SITE_WALK_SPEED = 2.7;
export const SITE_RUN_SPEED = 5;
/**
 * Climbing a silo ladder, metres a second up or down. Chosen for play: 32 m in
 * 40 s. It is not claimed as a measured climbing rate.
 */
export const LADDER_CLIMB_SPEED = 0.8;

/** The hall's inside face: its bounds less half the 0.55 m wall (HALL_WALL_DEPTH). */
const HALL_INSIDE = (() => {
  const { minX, maxX, minZ, maxZ } = SITE_LAYOUT.factory.bounds;
  const half = 0.55 / 2;
  return { minX: minX + half, maxX: maxX - half, minZ: minZ + half, maxZ: maxZ - half };
})();

/** True when (x, z) is on the hall floor, inside its walls. */
export function isInsideHall(x: number, z: number): boolean {
  return (
    x > HALL_INSIDE.minX && x < HALL_INSIDE.maxX && z > HALL_INSIDE.minZ && z < HALL_INSIDE.maxZ
  );
}

/** Ground speed, m/s, for a body at (x, z), walking or hurrying (Shift, the phone's sprint). */
export function walkingPace(x: number, z: number, hurry: boolean): number {
  if (isInsideHall(x, z)) return hurry ? HALL_HURRY_SPEED : HALL_WALK_SPEED;
  return hurry ? SITE_RUN_SPEED : SITE_WALK_SPEED;
}
