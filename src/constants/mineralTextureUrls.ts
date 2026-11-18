export const MINERAL_KINDS = ['fieldstone', 'limestone'] as const;
export type MineralKind = (typeof MINERAL_KINDS)[number];

/** The ordered list is both the material's slot order and the loader cache key. */
export const mineralTextureUrls = (kind: MineralKind): string[] =>
  ['albedo', 'normal', 'roughness'].map(
    (role) => `${import.meta.env.BASE_URL}textures/material-maker/${kind}-${role}.png`
  );
