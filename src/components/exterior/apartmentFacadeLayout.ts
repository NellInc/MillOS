/**
 * FORM ON THE APARTMENT BLOCKS' STREET FACES.
 *
 * The generated apartments (`officeApartment`, 16.5 x 15 x 16.1 m, and its
 * three-storey cut `officeApartmentThree`, 12.6 m, both mounted 1.25 m along
 * local +z) are storeys of identical windows; the art wave weathered them, and
 * the shipping frame still read the four-storey block as stacked boxes. This
 * adds massing the shells do not have, on the face the site sees (local +x,
 * toward the factory): access galleries on the upper storeys, a stair tower
 * standing proud of the facade and over the roofline, a coping on top of it,
 * and the gallery columns that carry the deck edges to the ground.
 *
 * Apartment-local metres. Storey heights come from the facade shader's measured
 * window bands (`applyApartmentWindows` in GeneratedOfficeModel.tsx, whose
 * `apartmentFloorLow/High` uniforms these are): the three-storey cut keeps the
 * first two bands and lowers the top one.
 */
export type ApartmentFloors = 3 | 4;

const WINDOW_BANDS: Record<ApartmentFloors, readonly (readonly [number, number])[]> = {
  4: [
    [1.23, 3.15],
    [4.82, 6.74],
    [8.32, 10.15],
    [11.72, 13.67],
  ],
  3: [
    [1.23, 3.15],
    [4.82, 6.74],
    [8.22, 10.17],
  ],
};

const SHELL_HEIGHT: Record<ApartmentFloors, number> = { 4: 16.1, 3: 12.6 };

export function apartmentFacadeLayout(floors: ApartmentFloors) {
  const shell = {
    halfX: 8.25,
    minZ: 1.25 - 7.5,
    maxZ: 1.25 + 7.5,
    height: SHELL_HEIGHT[floors],
  } as const;
  const windowBands = WINDOW_BANDS[floors];
  /** Stair tower at the facade's -z end, rising 1.6 m over the roofline. */
  const stairTower = {
    minX: shell.halfX - 0.05,
    maxX: shell.halfX + 1.4,
    minZ: shell.minZ + 0.25,
    maxZ: -2.9,
    top: shell.height + 1.6,
  } as const;
  /** Gallery deck: slab depth out from the facade, thickness, rail height. */
  const gallery = {
    depth: 1.25,
    thickness: 0.2,
    railHeight: 1.0,
    /** Sunk into the facade so its back face is never coplanar with the shell's. */
    embed: 0.05,
    /** Slab tops: a storey below each upper window band's sill, rail top at the sill. */
    tops: windowBands.slice(1).map(([bottom]) => bottom - 1.0 + 0.03),
    /** Runs out of the stair tower's side (5 cm into it) to near the far corner. */
    minZ: stairTower.maxZ - 0.05,
    maxZ: shell.maxZ - 0.35,
  } as const;
  /**
   * Square concrete columns under the galleries' outer edge, ground to the top
   * rail: the vertical members that carry an access deck, and what turns
   * stacked horizontal bands into a framed facade. On the piers between
   * windows, so none stands in front of a pane: this face's four bays sit on a
   * 3.47 m pitch with 2.14 m panes centred at z -3.96, -0.49, 2.99 and 6.46
   * (the shader's side-facade `pitch` 0.200 and `paneWidth` 0.1233 of the
   * 17.38 m mesh depth, plus the 1.25 m mount offset). 0.15 m inside the
   * balustrade, clear of the rail and panel faces.
   */
  const columnSize = 0.3;
  const topRail = gallery.tops[gallery.tops.length - 1] + gallery.railHeight;
  const columns = [-2.22, 1.25, 4.72, 8.0]
    .filter((z) => z - columnSize / 2 > gallery.minZ && z + columnSize / 2 < gallery.maxZ)
    .map((z) => ({
      x: shell.halfX + gallery.depth - 0.3 - columnSize / 2,
      z,
      size: columnSize,
      bottom: 0,
      top: topRail,
    }));
  /** Window pane centres and width on this face, for the clearance test. */
  const panes = { centres: [-3.96, -0.49, 2.99, 6.46], width: 2.14 } as const;
  /**
   * Where each upper floor meets the stair: a landing slab seen across the lit
   * glazing slot at night. The galleries' slab tops are those floors.
   */
  const stairLandings = gallery.tops.map((top) => top - gallery.thickness / 2);
  /**
   * The stair's glazing slot, storey by storey between the landings, and
   * which storeys are lit at night: the same ones as the flats' windows.
   * `applyApartmentWindows` lights a storey when `mod(storey, 2) == 1`, so
   * at 18:30 one continuous cream strip stood beside a block lit on alternate
   * floors (final4 med-1830 farm and shipping).
   */
  const slot = { bottom: 1.2, top: stairTower.top - 1.4 } as const;
  const bounds = [slot.bottom, ...stairLandings, slot.top];
  const stairStoreys = bounds.slice(0, -1).map((bottom, storey) => ({
    storey,
    bottom,
    top: bounds[storey + 1],
    lit: apartmentStoreyLit(storey),
  }));
  return { shell, windowBands, stairTower, gallery, columns, panes, stairLandings, stairStoreys };
}

/** Whether a storey's flats are lit at night (`occupiedFloor` in the window shader). */
export function apartmentStoreyLit(storey: number): boolean {
  return storey % 2 === 1;
}

const FOUR = apartmentFacadeLayout(4);
export const APARTMENT_SHELL = FOUR.shell;
export const APARTMENT_WINDOW_BANDS = FOUR.windowBands;
export const APARTMENT_STAIR_TOWER = FOUR.stairTower;
export const APARTMENT_GALLERY = FOUR.gallery;
