import * as THREE from 'three';
import { createColorDataTexture, createLinearDataTexture } from '../../utils/textureGenerator';

// One 256px atlas for the whole static plot. The large white quadrant protects
// joinery/soil from plant colour, including ordinary distance mips. These are
// surface marks, not baked lighting. Working if non-crop UVs remain neutral,
// veins follow their leaves, and every crop stays opaque and lit at night.
export const ALLOTMENT_TILES = {
  crown: [136, 8, 247, 119],
  leaf: [8, 136, 119, 247],
  root: [136, 136, 247, 247],
} as const;
export type AllotmentSurface = keyof typeof ALLOTMENT_TILES;
const SIZE = 256;
export const ALLOTMENT_TEXTURES = (() => {
  const colour = new Uint8Array(SIZE * SIZE * 4),
    finish = new Uint8Array(colour.length);
  for (let i = 0; i < colour.length; i += 4) {
    colour.set([255, 255, 255, 255], i);
    finish.set([128, 214, 214, 255], i);
  }
  for (const [kind, [left, bottom, right, top]] of Object.entries(ALLOTMENT_TILES)) {
    for (let y = bottom - 4; y <= top + 4; y++)
      for (let x = left - 4; x <= right + 4; x++) {
        const u = (THREE.MathUtils.clamp(x, left, right) - left) / (right - left),
          v = (THREE.MathUtils.clamp(y, bottom, top) - bottom) / (top - bottom);
        const wave = u * Math.PI * 2;
        const mottle = Math.sin(wave * 4 + Math.sin(v * 13)) * Math.cos(v * 19 + wave);
        // The crown has three overlapping curled leaf margins. Both edges are
        // periodic so its spherical seam does not turn into a painted stripe.
        const fold = Math.pow(0.5 + 0.5 * Math.cos(wave * 3 + Math.sin(v * Math.PI) * 1.3), 18);
        const midrib = Math.exp(-Math.pow((u - 0.5) * 36, 2));
        const branch = Math.exp(
          -Math.pow(Math.sin((v - Math.abs(u - 0.5) * 0.72) * Math.PI * 8) * 10, 2)
        );
        const fibers = Math.pow(0.5 + 0.5 * Math.cos(wave * 12 + Math.sin(v * 7)), 5);
        const vein = kind === 'crown' ? branch * (1 - fold) : midrib + branch * 0.25;
        const stain = THREE.MathUtils.smoothstep(0.6 - v + mottle * 0.15, 0, 0.5);
        const tone =
          kind === 'root'
            ? 239 - stain * 48 + mottle * 5
            : kind === 'crown'
              ? 220 + vein * 17 - fold * 28 + mottle * 5
              : 225 + midrib * 22 + fibers * 5 + mottle * 4;
        const height = kind === 'root' ? 128 + mottle * 3 : 128 + vein * 9 - fold * 8 + fibers * 2;
        const roughness = kind === 'root' ? 238 : 208 - vein * 14 + mottle * 4;
        const i = (y * SIZE + x) * 4;
        colour.set(
          [tone, tone + (kind === 'root' ? -6 : 3), tone - (kind === 'root' ? 15 : 2), 255].map(
            (value) => Math.round(THREE.MathUtils.clamp(value, 0, 255))
          ),
          i
        );
        finish.set([Math.round(height), Math.round(roughness), Math.round(roughness), 255], i);
      }
  }
  const map = createColorDataTexture(colour, SIZE, SIZE),
    detail = createLinearDataTexture(finish, SIZE, SIZE);
  map.name = 'allotment-leaf-wax-and-veins';
  detail.name = 'allotment-linear-leaf-relief';
  // Keep the atlas's large neutral quadrant at the same mip as its crops.
  for (const texture of [map, detail]) {
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
  }
  return { map, detail };
})();

export const ALLOTMENT_MATERIAL = new THREE.MeshStandardMaterial({
  name: 'allotment-vegetables-and-joinery',
  vertexColors: true,
  map: ALLOTMENT_TEXTURES.map,
  roughnessMap: ALLOTMENT_TEXTURES.detail,
  bumpMap: ALLOTMENT_TEXTURES.detail,
  bumpScale: 0.00065,
  roughness: 1,
  metalness: 0,
});

/** Preserve native leaf/root UV orientation, then isolate it inside its island.
 * Working if the returned plot still merges as one material, with no plant draws.
 */
export function finishAllotmentSurface(geometry: THREE.BufferGeometry, kind: AllotmentSurface) {
  const uv = geometry.getAttribute('uv'),
    [left, bottom, right, top] = ALLOTMENT_TILES[kind];
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(
      i,
      (left + THREE.MathUtils.clamp(uv.getX(i), 0, 1) * (right - left) + 0.5) / SIZE,
      (bottom + THREE.MathUtils.clamp(uv.getY(i), 0, 1) * (top - bottom) + 0.5) / SIZE
    );
  }
  geometry.userData.allotmentSurface = kind;
}

export function neutralAllotmentSurface(geometry: THREE.BufferGeometry) {
  if (geometry.userData.allotmentSurface) return;
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, 32 / SIZE, 32 / SIZE);
}
