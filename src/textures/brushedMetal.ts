/**
 * Brushed Metal Texture Generator
 *
 * Generates procedural brushed metal with directional scratches.
 * Output: roughness/metalness/AO packed as RGB channels.
 */

import * as THREE from 'three';
import {
  getTexture,
  fbmNoise,
  fbmNoiseSigned,
  hash,
  createLinearDataTexture,
} from '../utils/textureGenerator';

export type ScratchDirection = 'horizontal' | 'vertical' | 'diagonal';

/** Zinc spangle has compact, nondirectional facets, without a cladding AO grid.
 * Periodic seeds keep the sheet continuous across the repeat boundary.
 * Working if R/B stay 255 and G varies isotropically inside a satin band.
 */
export const generateGalvanizedORM = (size = 256): THREE.DataTexture =>
  getTexture(`galvanized-orm-v1-${size}`, () => {
    const data = new Uint8Array(size * size * 4);
    const cells = 32;
    const wrap = (value: number) => ((value % cells) + cells) % cells;
    // The nine neighbouring periodic cells cover the nearest crystal centre.
    const seeds = Array.from({ length: cells * cells }, (_, index) => {
      const x = index % cells,
        y = Math.floor(index / cells);
      return { x: hash(x, y), y: hash(x + 71, y + 29), finish: hash(x + 11, y + 53) };
    });
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = (x * cells) / size,
          v = (y * cells) / size;
        const cx = Math.floor(u),
          cy = Math.floor(v);
        let distance = Infinity,
          finish = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const seed = seeds[wrap(cy + dy) * cells + wrap(cx + dx)];
            const d = (cx + dx + seed.x - u) ** 2 + (cy + dy + seed.y - v) ** 2;
            if (d < distance) {
              distance = d;
              finish = seed.finish;
            }
          }
        }
        const i = (y * size + x) * 4;
        data[i] = 255;
        data[i + 1] = Math.round((0.56 + finish * 0.1) * 255);
        data[i + 2] = 255;
        data[i + 3] = 255;
      }
    }
    return createLinearDataTexture(data, size, size);
  });

/** Fine horizontal corrugation on the drums; rolled sheet grain on the trim.
 * At eight height repeats, twenty ridges per tile give a 15.6 cm drum pitch.
 * Working if the signed relief is seamless and adds no embossed square grid.
 */
export const generateGalvanizedNormal = (corrugated: boolean, size = 256): THREE.DataTexture =>
  getTexture(`galvanized-normal-v1-${corrugated}-${size}`, () => {
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = (x / size) * Math.PI * 2,
          v = (y / size) * Math.PI * 2;
        const nx = Math.sin(u * 11) * Math.cos(v * 13) * 0.012;
        const ny =
          Math.sin(v * 11) * Math.cos(u * 13) * 0.012 + (corrugated ? Math.sin(v * 20) * 0.14 : 0);
        const length = Math.hypot(nx, ny, 1),
          i = (y * size + x) * 4;
        data[i] = Math.round(((nx / length) * 0.5 + 0.5) * 255);
        data[i + 1] = Math.round(((ny / length) * 0.5 + 0.5) * 255);
        data[i + 2] = Math.round(((1 / length) * 0.5 + 0.5) * 255);
        data[i + 3] = 255;
      }
    }
    return createLinearDataTexture(data, size, size);
  });

/**
 * Generates brushed metal texture with directional scratches.
 * Returns: roughness/metalness texture (R=roughness, G=metalness, B=AO)
 *
 * WARNING - channel order does NOT match what three reads. three samples
 * `roughnessMap.g` and `metalnessMap.b`, so assigning this as a `roughnessMap`
 * multiplies roughness by the METALNESS channel (a near-flat 0.90-1.00) and
 * produces no variation at all. Kept byte-identical for compatibility; use
 * `generateMachineORM` below for anything new.
 */
export const generateBrushedMetal = (
  size: number = 256,
  scratchDensity: number = 0.3,
  scratchDirection: ScratchDirection = 'horizontal'
): THREE.DataTexture => {
  return getTexture(`brushed-metal-${size}-${scratchDensity}-${scratchDirection}`, () => {
    const data = new Uint8Array(size * size * 4);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;

        // Base roughness with noise
        let roughness = 0.25 + fbmNoise(x * 0.02, y * 0.02, 2) * 0.15;

        // Directional scratches
        let scratchCoord: number;
        switch (scratchDirection) {
          case 'horizontal':
            scratchCoord = y;
            break;
          case 'vertical':
            scratchCoord = x;
            break;
          case 'diagonal':
            scratchCoord = (x + y) * 0.707;
            break;
        }

        // Multiple scratch frequencies for realism
        const scratch1 = Math.sin(
          scratchCoord * 0.5 + hash(Math.floor(scratchCoord * 0.1), 0) * 10
        );
        const scratch2 = Math.sin(scratchCoord * 2.0 + hash(Math.floor(scratchCoord * 0.3), 1) * 5);
        const scratch3 = Math.sin(scratchCoord * 8.0 + hash(Math.floor(scratchCoord * 0.5), 2) * 3);

        const scratchIntensity = scratch1 * 0.3 + scratch2 * 0.4 + scratch3 * 0.3;
        const scratchMask = hash(x * 0.1, y * 0.1) > 1 - scratchDensity ? 1 : 0;

        roughness += scratchIntensity * 0.1 * scratchMask;
        roughness = Math.max(0.15, Math.min(0.5, roughness));

        // High metalness
        const metalness = 0.9 + fbmNoise(x * 0.05, y * 0.05, 1) * 0.1;

        // Subtle AO in scratches
        const ao = 1.0 - Math.abs(scratchIntensity) * 0.1 * scratchMask;

        data[i] = Math.floor(roughness * 255); // R = roughness
        data[i + 1] = Math.floor(metalness * 255); // G = metalness
        data[i + 2] = Math.floor(ao * 255); // B = AO
        data[i + 3] = 255; // A = 1
      }
    }

    return createLinearDataTexture(data, size, size);
  });
};

/**
 * Generates a machine ORM map in glTF channel order.
 *
 *   R = ambient occlusion  (three reads `aoMap.r`)
 *   G = roughness          (three reads `roughnessMap.g`)
 *   B = metalness          (three reads `metalnessMap.b`)
 *
 * Assign the SAME texture object to `aoMap`, `roughnessMap` and `metalnessMap`
 * on a MeshStandardMaterial - no uv2 is required, `Texture.channel` defaults
 * to 0. `aoMap` only affects indirect light, so it is invisible until
 * `scene.environment` exists.
 *
 * IMPORTANT for callers: this map is a real multiplier, unlike the old
 * `generateBrushedMetal` (which multiplied by ~0.95 and did nothing). Base
 * `roughness` values must be RE-AUTHORED UPWARD when switching, or metals
 * become up to 2.7x shinier than intended.
 */
export const generateMachineORM = (
  size: number = 512,
  brushDirection: ScratchDirection = 'horizontal',
  panelPitch: number = 128
): THREE.DataTexture => {
  /** Deep-scratch groove width in pixels. Below ~3 px the mipmap erases it. */
  const GROOVE_PX = 3;

  return getTexture(`machine-orm-${size}-${brushDirection}-${panelPitch}`, () => {
    const data = new Uint8Array(size * size * 4);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const nx = x / size;
        const ny = y / size;

        // Coordinate the brush runs along.
        let brushCoord: number;
        let acrossCoord: number;
        switch (brushDirection) {
          case 'vertical':
            brushCoord = y;
            acrossCoord = x;
            break;
          case 'diagonal':
            brushCoord = (x + y) * 0.707;
            acrossCoord = (x - y) * 0.707;
            break;
          case 'horizontal':
          default:
            brushCoord = x;
            acrossCoord = y;
            break;
        }

        // --- ROUGHNESS (G) -------------------------------------------------
        // Brush streaks vary ACROSS the brush direction, so they read as long
        // parallel lines rather than as noise. Periods held above ~5 px.
        const streakA = Math.sin(acrossCoord * 0.42 + hash(Math.floor(acrossCoord * 0.08), 3) * 6);
        const streakB = Math.sin(acrossCoord * 1.05 + hash(Math.floor(acrossCoord * 0.2), 7) * 4);
        const streak = streakA * 0.6 + streakB * 0.4;

        // Occasional deep scratch running along the brush. GROOVE_PX wide, NOT
        // one pixel: a 1 px groove is below the mipmap floor and would average
        // away entirely one mip level down - the same inert-detail failure as
        // the 0.64 px panel bevel. The groove is soft-edged across its width so
        // it survives filtering rather than aliasing.
        const grooveId = Math.floor(acrossCoord / GROOVE_PX);
        const grooveOffset = acrossCoord / GROOVE_PX - grooveId;
        const isGroove = hash(grooveId * 13, 91) > 0.955;
        const grooveRun = fbmNoise(brushCoord * 0.02, grooveId * 0.5, 2);
        const grooveProfile = Math.sin(grooveOffset * Math.PI);
        const groove = isGroove && grooveRun > 0.42 ? grooveProfile : 0;

        // Broad breakup: cast/rolled stock is not uniform.
        const breakup = fbmNoiseSigned(nx * 6, ny * 6, 4) * 0.15;
        const grime = Math.max(0, fbmNoise(nx * 2.2 + 11, ny * 2.2 + 5, 3) - 0.55) * 0.5;

        let roughness = 0.55 + streak * 0.14 + breakup + grime;
        roughness += groove * 0.22;
        roughness = Math.max(0.35, Math.min(0.85, roughness));

        // --- AMBIENT OCCLUSION (R) -----------------------------------------
        // Darker inside scratch grooves and along panel seams.
        const seamX = Math.min(x % panelPitch, panelPitch - (x % panelPitch));
        const seamY = Math.min(y % panelPitch, panelPitch - (y % panelPitch));
        const seamDist = Math.min(seamX, seamY);
        const seamAO = seamDist < 6 ? (1 - seamDist / 6) * 0.25 : 0;
        const ao = Math.max(0.6, 1 - seamAO - groove * 0.12 - grime * 0.3);

        // --- METALNESS (B) --------------------------------------------------
        // Binary: bare metal everywhere on a machine housing. Kept explicit so
        // a future painted region can drop it to 0 without a shader change.
        const metalness = 1;

        data[i] = Math.floor(ao * 255);
        data[i + 1] = Math.floor(roughness * 255);
        data[i + 2] = Math.floor(metalness * 255);
        data[i + 3] = 255;
      }
    }

    return createLinearDataTexture(data, size, size);
  });
};
