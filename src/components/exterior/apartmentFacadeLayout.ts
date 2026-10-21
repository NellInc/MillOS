/**
 * FORM ON THE FOUR-STOREY APARTMENT'S STREET FACE.
 *
 * The generated apartment (`officeApartment`, 16.5 x 15 x 16.1 m, mounted 1.25 m
 * along local +z) is four identical storeys of identical windows; the art wave
 * weathered it, and the shipping frame still read it as stacked boxes. This adds
 * massing the shell does not have, on the face the site sees (local +x, toward
 * the factory): access galleries on the upper three storeys, a stair tower
 * standing proud of the facade and over the roofline, and a coping on top of it.
 *
 * Apartment-local metres. Storey heights come from the facade shader's measured
 * window bands (`applyApartmentWindows` in GeneratedOfficeModel.tsx): windows
 * run 1.23-3.15, 4.82-6.74, 8.32-10.15 and 11.72-13.67 m.
 */
export const APARTMENT_SHELL = {
  halfX: 8.25,
  minZ: 1.25 - 7.5,
  maxZ: 1.25 + 7.5,
  height: 16.1,
} as const;

export const APARTMENT_WINDOW_BANDS: readonly (readonly [number, number])[] = [
  [1.23, 3.15],
  [4.82, 6.74],
  [8.32, 10.15],
  [11.72, 13.67],
];

/** Stair tower at the facade's -z end, rising 1.6 m over the roofline. */
export const APARTMENT_STAIR_TOWER = {
  minX: APARTMENT_SHELL.halfX - 0.05,
  maxX: APARTMENT_SHELL.halfX + 1.4,
  minZ: APARTMENT_SHELL.minZ + 0.25,
  maxZ: -2.9,
  top: APARTMENT_SHELL.height + 1.6,
} as const;

/** Gallery deck: slab depth out from the facade, thickness, rail height. */
export const APARTMENT_GALLERY = {
  depth: 1.25,
  thickness: 0.2,
  railHeight: 1.0,
  /** Sunk into the facade so its back face is never coplanar with the shell's. */
  embed: 0.05,
  /** Slab tops: a storey below each upper window band's sill, rail top at the sill. */
  tops: APARTMENT_WINDOW_BANDS.slice(1).map(([bottom]) => bottom - 1.0 + 0.03),
  /** Runs out of the stair tower's side (5 cm into it) to near the far corner. */
  minZ: APARTMENT_STAIR_TOWER.maxZ - 0.05,
  maxZ: APARTMENT_SHELL.maxZ - 0.35,
} as const;
