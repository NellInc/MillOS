/** Authored local metres, before the landmark's scale, yaw and rock sink.
 * Working if the rendered stair treads and walking floors use this same array.
 */
export const CASTLE_ROCK_SINK = 0.2;
export const CASTLE_COURT_HEIGHT = 3.2;
export const CASTLE_STAIR_X = 7.2;
export const CASTLE_STAIR_WIDTH = 3.3;
export const CASTLE_ACCESS_LANTERNS = [
  [9.05, 3.1, 20.65],
  [5.35, 4.6, 16.15],
] as const;
export const CASTLE_STAIR_END = 24.7;
export const CASTLE_STAIR_RISE = 0.125;
export const CASTLE_STAIR_TREAD = 0.3;
export const CASTLE_STEPS = [
  ...Array.from({ length: 12 }, (_, i) => ({
    minZ: 24.7 - (i + 1) * 0.3,
    maxZ: 24.7 - i * 0.3,
    height: 0.2 + (i + 1) * 0.125,
  })),
  { minZ: 20.2, maxZ: 21.1, height: 1.7 },
  ...Array.from({ length: 12 }, (_, i) => ({
    minZ: 20.2 - (i + 1) * 0.3,
    maxZ: 20.2 - i * 0.3,
    height: 1.7 + (i + 1) * 0.125,
  })),
  { minZ: 15.7, maxZ: 16.6, height: 3.2 },
];

// Solid wings, gate piers and terrace parapets. Roofs are not walking floors.
// minX, maxX, minZ, maxZ, top (the base is the court datum).
export const CASTLE_WALLS = [
  [-11.65, 1.7, -17.1, 9.25, 25],
  [10.5, 15.55, -10.4, 11.8, 13],
  [10.4, 14.9, -12.9, -8.3, 27.15],
  [-14.6, -4.4, 9.3, 15.4, 11.4],
  [-1.8, 5.35, 11.5, 15.75, 11.4],
  [9.05, 16.2, 11.5, 15.75, 11.4],
  [0.15, 3.95, -15.9, -12.1, 35.5],
  [-15.86, -15.44, -15.6, 15.6, 4.35],
  [15.44, 15.86, -15.6, 15.6, 4.35],
  [-15.5, -2.1, 15.49, 15.91, 4.35],
] as const;

export const CASTLE_ROCK_OUTLINE = [
  [-19.35, -14.7],
  [-15.8, -18.35],
  [8.8, -19.17395],
  [17.9, -15.9],
  [19.35, -6],
  [18.6, 12.4],
  [13.7, 19.17395],
  [-11.5, 18.3],
  [-18.9, 12.7],
] as const;
