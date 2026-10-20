import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { EXTERIOR_LAYERS } from '../../constants/renderLayers';
import { createLinearDataTexture, getTexture, hash } from '../../utils/textureGenerator';
import { buildYardWearLayout, type YardOilStain, type YardTyreTrack } from './yardWear';
import { YARD_WEAR_DEPTH } from './yardSurfaces';

/**
 * Tyre tracks and oil stains on both truck yards, laid from the trucks' real
 * paths (`yardWear.ts`). Two meshes for both yards: one for rubber, one for oil.
 *
 * They are PAINT, so they are lit (`meshStandardMaterial`) and take the
 * sun's shadow like the tarmac under them; an unlit decal would glow at
 * midnight exactly as the yard paint once did (see YARD PAINT IS LIT in
 * `TruckBay.tsx`). Depth follows the exterior overlay rules: overlay datum,
 * `exteriorOverlay` bias, no depth write (`YARD_WEAR_DEPTH`).
 *
 * Opacity is per ribbon and the lane ribbons stack (three axles and two
 * directions on one line), so the per-ribbon value is low on purpose.
 */

/** Metres of track per repeat of the tread texture. */
const TRACK_TEXTURE_PERIOD = 6;
const TRACK_OPACITY = 0.14;
const OIL_OPACITY = 0.55;
/** The stain mask's edge sits at this fraction of the quad's half-extent. */
const OIL_MASK_EDGE = 0.8;

const smoothstep = (edge0: number, edge1: number, value: number): number => {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/** Value noise on a lattice that wraps every `period` cells, so the map tiles. */
const wrappedNoise = (x: number, period: number, seed: number): number => {
  const cell = Math.floor(x);
  const f = x - cell;
  const s = f * f * (3 - 2 * f);
  const a = hash(((cell % period) + period) % period, seed);
  const b = hash((((cell + 1) % period) + period) % period, seed);
  return a + (b - a) * s;
};

const writeMask = (data: Uint8Array, index: number, value: number): void => {
  const byte = Math.round(Math.max(0, Math.min(1, value)) * 255);
  // alphaMap reads GREEN; R, G and B all carry the mask.
  data[index] = byte;
  data[index + 1] = byte;
  data[index + 2] = byte;
  data[index + 3] = 255;
};

/**
 * Tread mask. U crosses a dual pair (two tyres, four ribs each, 8 px per rib);
 * V runs along the track and tiles every TRACK_TEXTURE_PERIOD metres, with the
 * rubber laid down in patches rather than as a uniform stripe.
 */
const generateTreadMask = (): THREE.DataTexture => {
  const width = 64;
  const height = 128;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const v = y / height;
    for (let x = 0; x < width; x += 1) {
      const u = (x + 0.5) / width;
      const tyre = u < 0.5 ? 0 : 1;
      const t = (u - tyre * 0.5) * 2;
      const edge = smoothstep(0, 0.14, t) * smoothstep(1, 0.86, t);
      const rib = 0.72 + 0.28 * (0.5 + 0.5 * Math.cos(t * Math.PI * 8));
      const ribIndex = Math.min(3, Math.floor(t * 4));
      const patch = wrappedNoise(v * 16, 16, 11 + tyre * 5) * 0.6 + 0.4;
      const streak = wrappedNoise(v * 32, 32, 23 + ribIndex + tyre * 4) * 0.35 + 0.65;
      const grain = 0.9 + 0.1 * hash(x, y + 977);
      writeMask(data, (y * width + x) * 4, edge * rib * patch * streak * grain);
    }
  }
  return createLinearDataTexture(data, width, height);
};

/** One irregular drip: a darker core, a faint tide-mark rim, a ragged edge. */
const generateOilMask = (): THREE.DataTexture => {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = ((x + 0.5) / size) * 2 - 1;
      const dy = ((y + 0.5) / size) * 2 - 1;
      const distance = Math.hypot(dx, dy);
      const angle = (Math.atan2(dy, dx) / (Math.PI * 2) + 0.5) * 12;
      const edge =
        OIL_MASK_EDGE * (0.82 + 0.13 * wrappedNoise(angle, 12, 41)) +
        0.04 * wrappedNoise(angle * 3, 36, 43);
      const body = smoothstep(edge, edge - 0.18, distance);
      const core = 0.7 + 0.3 * smoothstep(edge * 0.7, 0, distance);
      const rim = 0.18 * Math.exp(-(((distance - edge * 0.88) / 0.05) ** 2));
      const grain = 0.88 + 0.12 * hash(x + 311, y);
      writeMask(data, (y * size + x) * 4, body * Math.min(1, core + rim) * grain);
    }
  }
  const texture = createLinearDataTexture(data, size, size);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
};

const buildTrackGeometry = (tracks: readonly YardTyreTrack[]): THREE.BufferGeometry => {
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  for (const track of tracks) {
    const { samples } = track;
    const base = positions.length / 3;
    const uMax = track.single ? 0.5 : 1;
    let travelled = 0;
    samples.forEach((sample, index) => {
      if (index > 0) {
        const previous = samples[index - 1];
        travelled += Math.hypot(sample.x - previous.x, sample.z - previous.z);
      }
      const before = samples[Math.max(0, index - 1)];
      const after = samples[Math.min(samples.length - 1, index + 1)];
      const length = Math.hypot(after.x - before.x, after.z - before.z) || 1;
      // Left of the direction of travel, in the ground plane.
      const nx = (after.z - before.z) / length;
      const nz = -(after.x - before.x) / length;
      const half = track.width / 2;
      positions.push(sample.x + nx * half, 0, sample.z + nz * half);
      positions.push(sample.x - nx * half, 0, sample.z - nz * half);
      const v = travelled / TRACK_TEXTURE_PERIOD;
      uvs.push(0, v, uMax, v);
      colors.push(1, 1, 1, sample.weight, 1, 1, 1, sample.weight);
      if (index > 0) {
        const a = base + (index - 1) * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    });
  }
  return finishGeometry(positions, uvs, colors, indices);
};

const buildStainGeometry = (stains: readonly YardOilStain[]): THREE.BufferGeometry => {
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  for (const stain of stains) {
    const base = positions.length / 3;
    const across = stain.radius / OIL_MASK_EDGE;
    const along = across * stain.stretch;
    const cos = Math.cos(stain.rotation);
    const sin = Math.sin(stain.rotation);
    for (const [cu, cv] of [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ] as const) {
      const lx = (cu * 2 - 1) * across;
      const lz = (cv * 2 - 1) * along;
      positions.push(stain.x + lx * cos + lz * sin, 0, stain.z - lx * sin + lz * cos);
      uvs.push(cu, cv);
      colors.push(1, 1, 1, stain.opacity);
    }
    indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
  return finishGeometry(positions, uvs, colors, indices);
};

const finishGeometry = (
  positions: number[],
  uvs: number[],
  colors: number[],
  indices: number[]
): THREE.BufferGeometry => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute(
    'normal',
    new THREE.Float32BufferAttribute(
      Array.from({ length: positions.length / 3 }, () => [0, 1, 0]).flat(),
      3
    )
  );
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  // RGBA: the alpha is per-sample wear, which three applies as vertexAlphas.
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
};

export const YardWearMarks: React.FC = () => {
  const { trackGeometry, stainGeometry } = useMemo(() => {
    const shipping = buildYardWearLayout('shipping');
    const receiving = buildYardWearLayout('receiving');
    return {
      trackGeometry: buildTrackGeometry([...shipping.tracks, ...receiving.tracks]),
      stainGeometry: buildStainGeometry([...shipping.stains, ...receiving.stains]),
    };
  }, []);
  const treadMask = useMemo(() => getTexture('yard-tyre-tread-mask', generateTreadMask), []);
  const oilMask = useMemo(() => getTexture('yard-oil-drip-mask', generateOilMask), []);

  useEffect(
    () => () => {
      trackGeometry.dispose();
      stainGeometry.dispose();
    },
    [trackGeometry, stainGeometry]
  );

  return (
    <group name="yard-wear-marks" position={[0, EXTERIOR_LAYERS.groundOverlay, 0]}>
      <mesh geometry={trackGeometry} receiveShadow>
        <meshStandardMaterial
          color="#24211e"
          alphaMap={treadMask}
          opacity={TRACK_OPACITY}
          vertexColors
          roughness={0.92}
          metalness={0}
          {...YARD_WEAR_DEPTH}
        />
      </mesh>
      <mesh geometry={stainGeometry} receiveShadow>
        <meshStandardMaterial
          color="#16120e"
          alphaMap={oilMask}
          opacity={OIL_OPACITY}
          vertexColors
          roughness={0.4}
          metalness={0}
          {...YARD_WEAR_DEPTH}
        />
      </mesh>
    </group>
  );
};
