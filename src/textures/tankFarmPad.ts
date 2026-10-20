/**
 * The tank farm bund slab's size and drip layout, from the same vessel table
 * the tanks are placed from. Moved verbatim out of `FactoryExterior.tsx` so the
 * startup bake worker can build the slab's maps from the identical layout (and
 * so land on the identical `getTexture` keys); free of React and DOM access.
 */
import { UTILITY_ASSET_DEFINITIONS } from '../constants/utilityAssets';
import { containmentLayoutForVessels } from './containmentPad';

export const TANK_FARM_PAD_SIZE = { width: 22, height: 0.18, depth: 42 } as const;
export const TANK_FARM_PAD_LAYOUT = containmentLayoutForVessels(
  TANK_FARM_PAD_SIZE.width,
  TANK_FARM_PAD_SIZE.depth,
  UTILITY_ASSET_DEFINITIONS.filter((asset) => asset.compound === 'tank_farm').map((asset) => ({
    x: asset.relativePosition[0],
    z: asset.relativePosition[2],
    length: asset.length ?? 8,
    radius: asset.radius,
  }))
);
