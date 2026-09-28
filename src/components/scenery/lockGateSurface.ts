import * as THREE from 'three';
import {
  createColorDataTexture,
  createLinearDataTexture,
  smoothNoise,
} from '../../utils/textureGenerator';

/** Seven vertical oak boards and one iron tile, shared by both gate leaves.
 * Working if grain follows each board, the damp band meets y=0.15, and metal
 * samples only the last tile. No new shader, model download or animated work.
 */
export function createLockGateSurface() {
  const width = 512,
    height = 256;
  const albedo = new Uint8Array(width * height * 4);
  const relief = new Uint8Array(albedo.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tile = Math.floor(x / 64),
        u = (x % 64) / 63,
        v = y / (height - 1);
      const noise = smoothNoise(x * 0.18, y * 0.11);
      let r: number, g: number, b: number, h: number;
      if (tile < 7) {
        const warp = smoothNoise(tile * 7 + u * 2, v * 3) * 1.8;
        const grain = Math.sin(u * 68 + warp + tile * 3.1);
        const split = Math.pow(Math.max(0, Math.sin(u * 39 + warp * 0.7 + tile)), 18);
        const fibre = 0.86 + grain * 0.065 + noise * 0.15 - split * 0.3;
        const damp = 1 - THREE.MathUtils.smoothstep(v + (noise - 0.5) * 0.09, 0.34, 0.46);
        r = fibre * (1 - damp * 0.36);
        g = fibre * (1 - damp * 0.19);
        b = fibre * (1 - damp * 0.43);
        h = 0.5 + grain * 0.06 + noise * 0.035 - split * 0.15;
      } else {
        // Quiet pitting, with neutral values so authored iron/bronze colours survive.
        r = g = b = 0.84 + noise * 0.16;
        h = 0.5 + (noise - 0.5) * 0.12;
      }
      const i = (y * width + x) * 4;
      albedo.set(
        [r, g, b, 1].map((value) => Math.round(THREE.MathUtils.clamp(value, 0, 1) * 255)),
        i
      );
      relief.set([h * 255, h * 255, h * 255, 255], i);
    }
  }
  const map = createColorDataTexture(albedo, width, height);
  const bumpMap = createLinearDataTexture(relief, width, height);
  for (const texture of [map, bumpMap]) {
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.name = texture === map ? 'lock-oak-iron-albedo' : 'lock-oak-iron-relief';
  }
  return new THREE.MeshStandardMaterial({
    name: 'lock-weathered-oak-and-iron',
    color: '#ffffff',
    vertexColors: true,
    map,
    bumpMap,
    bumpScale: 0.014,
    roughness: 0.88,
    metalness: 0.08,
  });
}

export const LOCK_GATE_MATERIAL = createLockGateSurface();
