/**
 * The taco truck's signage, in the truck's own frame (FactoryExterior's
 * `FoodTruck`: hatch side -X, cab +Z, ground y 0). The truck sells as
 * "La Molinita", an invented corn-tortilla stall beside the flour mill.
 *
 * One painted atlas carries all three faces; `scripts/author-taco-truck-sign.py`
 * draws it from the same rectangles and board outline as below, and
 * `tacoTruckSignLayout.test.ts` holds the two in step.
 */

export const TACO_SIGN_ATLAS = {
  url: `${import.meta.env.BASE_URL}textures/signage/taco-truck-la-molinita-v1.webp`,
  width: 2048,
  height: 1024,
  /** Pixel rectangles, image y down: [x, y, w, h]. */
  regions: {
    board: [0, 0, 2048, 640],
    valance: [0, 656, 1536, 256],
    menu: [1600, 656, 253, 352],
  },
} as const;

export type TacoSignRegion = keyof typeof TACO_SIGN_ATLAS.regions;

/** Roof board outline: 3.2 x 1.0 m, its top a cos^2 hump down to 0.8 m at the ends. */
export const TACO_BOARD = {
  width: 3.2,
  height: 1.0,
  shoulder: 0.8,
  corner: 0.06,
  /** Panel thickness and the painted faces' standoff from it (SURFACE_LAYERS.label). */
  depth: 0.06,
  standoff: 0.01,
  /** Plane centre in the truck frame: over the hatch, on the roof's hatch-side edge. */
  x: -1.4,
  bottomY: 2.62,
  z: -0.5,
} as const;

/** Board top edge (metres above its bottom) at `x` across the board, centred. */
export function tacoBoardTop(x: number): number {
  const { width, height, shoulder } = TACO_BOARD;
  return shoulder + (height - shoulder) * Math.cos((Math.PI * x) / width) ** 2;
}

/** The board outline as a closed polygon in board metres (x centred, y up from the bottom). */
export function tacoBoardOutline(samples = 48): [number, number][] {
  const { width, corner: r } = TACO_BOARD;
  const w = width / 2;
  const pts: [number, number][] = [];
  for (let i = 0; i <= 6; i++) {
    const a = -Math.PI / 2 + (i / 6) * (Math.PI / 2);
    pts.push([w - r + r * Math.cos(a), r + r * Math.sin(a)]);
  }
  for (let i = 0; i <= samples; i++) {
    const x = w - (2 * w * i) / samples;
    pts.push([x, tacoBoardTop(x)]);
  }
  for (let i = 0; i <= 6; i++) {
    const a = Math.PI + (i / 6) * (Math.PI / 2);
    pts.push([-w + r + r * Math.cos(a), r + r * Math.sin(a)]);
  }
  return pts;
}

/**
 * Two roof posts under the board and two gooseneck lamps over it. The lamp
 * lenses take the exterior lamp clock (D-044); the board is paint and stays
 * paint, unlit by any emissive term.
 */
export const TACO_BOARD_POSTS_Z = [-1.5, 0.5] as const;
export const TACO_BOARD_LAMPS_Z = [-1.4, 0.4] as const;
export const TACO_LAMP = { reach: 0.55, armY: 3.7, headDrop: 0.08 } as const;

/** The awning valance under the striped canopy, replacing the plain "TACOS" band. */
export const TACO_VALANCE = {
  /** Backing strip: centre and size (x thickness, y height, z width). */
  centre: [-2.37, 1.86, -0.5],
  size: [0.035, 0.3, 1.8],
} as const;

/**
 * Festoon bulbs on a wire hung 6 cm under the valance, clear of it: they used
 * to sit inside its bottom edge and glow at noon. They now follow the lamp
 * clock.
 */
export const TACO_FESTOON = {
  x: -2.37,
  bulbY: 1.6,
  radius: 0.05,
  wireY: 1.645,
  z: [-1.5, -1.0, -0.5, 0, 0.5],
  /** Drop cords from the valance's foot to the wire. */
  dropsZ: [-1.3, 0.3],
  colours: ['#ffd84a', '#ff7043', '#4fc3f7', '#c060d8', '#ffd84a'],
  /** Emissive intensity by day and the extra at full lamp level. */
  day: 0.04,
  night: 1.4,
} as const;

/** A-frame chalk menu on the forecourt beside the hatch. */
export const TACO_MENU_BOARD = {
  position: [-3.3, 0, 1.75],
  yaw: 0.45,
  /** One leaf: its wooden board, and the chalk face inset on it. */
  board: [0.03, 0.92, 0.62],
  face: [0.78, 0.56],
  lean: 0.2,
} as const;

/** Atlas UV (three's flipY convention) for a point at (u, v) in [0, 1] across a region, v up. */
export function tacoAtlasUv(region: TacoSignRegion, u: number, v: number): [number, number] {
  const [x, y, w, h] = TACO_SIGN_ATLAS.regions[region];
  return [(x + u * w) / TACO_SIGN_ATLAS.width, 1 - (y + (1 - v) * h) / TACO_SIGN_ATLAS.height];
}
