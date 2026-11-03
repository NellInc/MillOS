import type * as THREE from 'three';
import { createColorDataTexture, fbmNoise, getTexture } from '../utils/textureGenerator';
import { generateClayTiles } from './roofTiles';

/**
 * Riverside station's roof tiles: Carrickfergus's deeper brown-red rather
 * than the shared terracotta, at 256 px with the shared clay normal map's
 * 13 x 10 tile grid. One function, so the startup bake
 * (`sceneTextureRecipes.ts`) and `RailwayStation` land on the same
 * `getTexture` key and the station never generates it on the main thread.
 */
export const getRailwayStationTileMap = (): THREE.DataTexture =>
  generateClayTiles(256, { tileWidth: 20, tileHeight: 28, baseColor: '#9b5440', variation: 0.2 });

/**
 * One soft steam puff for the engine's camera-facing billboards: white, its
 * alpha falling smoothly from a lumpy core to nothing well inside the edge, so
 * no puff shows a rim. Baked at startup beside the roof tiles.
 */
export const getRailwaySteamPuffMap = (): THREE.DataTexture =>
  getTexture('railway-steam-puff-v1-64', () => {
    const size = 64;
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = (x + 0.5) / size - 0.5;
        const v = (y + 0.5) / size - 0.5;
        const lumps = fbmNoise(u * 5 + 3.1, v * 5 + 7.7, 3);
        const r = Math.hypot(u, v) * 2 * (0.82 + lumps * 0.36);
        const t = Math.min(1, Math.max(0, 1 - r));
        const alpha = t * t * (3 - 2 * t);
        const i = (y * size + x) * 4;
        const shade = 236 + Math.round(lumps * 19);
        data[i] = shade;
        data[i + 1] = shade;
        data[i + 2] = shade;
        data[i + 3] = Math.round(alpha * 255);
      }
    }
    return createColorDataTexture(data, size, size);
  });
