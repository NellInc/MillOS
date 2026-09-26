/**
 * Layered sky clouds: tiling value-noise field, coverage masking, sun-side
 * silvering.
 *
 * WHAT IT REPLACES. The analytic sky drew "clouds" from six sin/cos terms
 * evaluated straight on the view direction. A unit direction spans [-1, 1], so
 * at frequencies 12 to 38 that is two to six cycles across the ENTIRE sky - an
 * interference lattice, not cloud shapes - and a band mask deliberately erased
 * it at the zenith, where clouds should be densest. The final blend capped at
 * `1.0 * 1.0 * 0.2 * 0.78 = 0.156`, so clear weather could never produce more
 * than a 15% tint. The sky was, in practice, an empty gradient.
 *
 * WHY A TEXTURE AND NOT A RUNTIME FBM. The dome covers essentially the whole
 * screen every frame, so its fragment cost is paid at full resolution. Two
 * mipmapped texture fetches are cheaper than the sixteen `sin()` calls that
 * ship today, and far cheaper than a per-pixel fbm loop. The octaves are
 * collapsed into the texture once, on the CPU, at module scope.
 *
 * THE SEAM. Commit ff00221 fixed a hard vertical line splitting the sky: the
 * old mapping used `theta = atan(dir.z, dir.x)`, which has a branch cut at the
 * -x meridian where theta jumps from +PI to -PI, and noise is not periodic
 * across that jump. The direction vector itself is continuous everywhere, so
 * this module keeps that commit's fix - project from `dir.xz` with a continuous elevation denominator -
 * and adds the second requirement the projection implies: because the
 * projection walks off the edge of the texture, the noise ITSELF has to tile,
 * or `RepeatWrapping` reintroduces a seam of its own. Hence the wrapped lattice
 * below, pinned by `__tests__/skyClouds.test.ts`.
 *
 * COVERAGE, NOT OPACITY. `cloudAmount` used to scale the blend, so overcast
 * weather produced a thicker uniform haze. Here it moves a THRESHOLD instead:
 * clear weather yields sparse but genuinely opaque cumulus, and storms close
 * the sky over. That is the difference between weather you can see and weather
 * you can only measure.
 */

import * as THREE from 'three';

export const CLOUD_NOISE_SIZE = 256;

/** Lattice frequency and weight per octave. Frequencies must divide the size. */
const CLOUD_OCTAVES: readonly (readonly [number, number])[] = [
  [4, 0.5],
  [8, 0.26],
  [16, 0.15],
  [32, 0.09],
];

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/**
 * Integer lattice hash, wrapped to the octave frequency.
 *
 * The wrap is the entire reason the field tiles: lattice cell `f` is the same
 * cell as `0`, so the interpolated value at u = 1 equals the value at u = 0.
 */
function latticeHash(ix: number, iy: number, frequency: number, seed: number): number {
  const x = ((ix % frequency) + frequency) % frequency;
  const y = ((iy % frequency) + frequency) % frequency;
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

function valueNoise(u: number, v: number, frequency: number, seed: number): number {
  const x = u * frequency;
  const y = v * frequency;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const n00 = latticeHash(ix, iy, frequency, seed);
  const n10 = latticeHash(ix + 1, iy, frequency, seed);
  const n01 = latticeHash(ix, iy + 1, frequency, seed);
  const n11 = latticeHash(ix + 1, iy + 1, frequency, seed);
  const top = n00 + (n10 - n00) * sx;
  const bottom = n01 + (n11 - n01) * sx;
  return top + (bottom - top) * sy;
}

/**
 * Build the tiling field and stretch it to fill [0, 1].
 *
 * Summed octaves cluster hard around 0.5, which would make the coverage
 * threshold operate on the steepest part of the distribution and turn a small
 * weather change into an all-or-nothing sky. Remapping against the measured
 * extent restores usable range on both sides of the threshold.
 */
function buildCloudNoise(size: number): Float32Array {
  const data = new Float32Array(size * size);
  let minimum = Infinity;
  let maximum = -Infinity;
  for (let y = 0; y < size; y += 1) {
    const v = y / size;
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      let sum = 0;
      for (let octave = 0; octave < CLOUD_OCTAVES.length; octave += 1) {
        const [frequency, weight] = CLOUD_OCTAVES[octave];
        sum += valueNoise(u, v, frequency, octave * 7 + 3) * weight;
      }
      data[y * size + x] = sum;
      if (sum < minimum) minimum = sum;
      if (sum > maximum) maximum = sum;
    }
  }
  const span = maximum - minimum || 1;
  for (let index = 0; index < data.length; index += 1) {
    data[index] = (data[index] - minimum) / span;
  }
  return data;
}

const cloudNoiseData = buildCloudNoise(CLOUD_NOISE_SIZE);

/**
 * CPU twin of the GPU fetch: wrapped bilinear sample of the same array.
 *
 * Exported so anything that needs the cloud field OFF the GPU - cloud shadows
 * on the key light being the obvious one - reads the identical data and cannot
 * drift out of sync with what the sky is drawing.
 */
export function sampleCloudNoise(u: number, v: number): number {
  const size = CLOUD_NOISE_SIZE;
  const x = u * size;
  const y = v * size;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const wrap = (value: number): number => ((value % size) + size) % size;
  const x0 = wrap(ix);
  const y0 = wrap(iy);
  const x1 = wrap(ix + 1);
  const y1 = wrap(iy + 1);
  const n00 = cloudNoiseData[y0 * size + x0];
  const n10 = cloudNoiseData[y0 * size + x1];
  const n01 = cloudNoiseData[y1 * size + x0];
  const n11 = cloudNoiseData[y1 * size + x1];
  const top = n00 + (n10 - n00) * fx;
  const bottom = n01 + (n11 - n01) * fx;
  return top + (bottom - top) * fy;
}

/**
 * Coverage threshold for a given cloud amount.
 *
 * Shared by the shader and by any CPU consumer, so "is this direction inside a
 * cloud" has exactly one answer. Inverted on purpose: more cloud means a LOWER
 * threshold, so more of the field passes.
 */
export function cloudCoverThreshold(cloudAmount: number): number {
  return 0.7 + (0.24 - 0.7) * clamp01(cloudAmount);
}

let cloudNoiseTexture: THREE.DataTexture | null = null;

/** Lazily upload the field as a tiling single-channel texture. */
export function getCloudNoiseTexture(): THREE.DataTexture {
  if (cloudNoiseTexture) return cloudNoiseTexture;
  const bytes = new Uint8Array(cloudNoiseData.length);
  for (let index = 0; index < cloudNoiseData.length; index += 1) {
    bytes[index] = Math.round(clamp01(cloudNoiseData[index]) * 255);
  }
  const texture = new THREE.DataTexture(bytes, CLOUD_NOISE_SIZE, CLOUD_NOISE_SIZE, THREE.RedFormat);
  texture.name = 'MillOS Cloud Noise';
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  // Raw scalar coverage, not colour. Tagging it sRGB would gamma-decode the
  // mask and push every cloud edge in the sky toward transparent.
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  cloudNoiseTexture = texture;
  return texture;
}

/**
 * Fragment-stage cloud layer.
 *
 * Expects `uCloudNoise` (sampler2D), `uCloudDrift` and `uCirrusDrift` (vec2,
 * pre-wrapped to [0,1) on the CPU so long sessions cannot lose texture-space
 * precision), `uCloudLit`, `uCloudShadow` and `uSunTint` (vec3).
 *
 * Returns rgb = lit cloud colour, a = coverage to blend over the sky.
 */
export const SKY_CLOUD_GLSL = /* glsl */ `
uniform sampler2D uCloudNoise;
uniform vec2 uCloudDrift;
uniform vec2 uCirrusDrift;
uniform vec3 uCloudLit;
uniform vec3 uCloudShadow;

vec4 millosSkyClouds( vec3 dir, float cloudAmount, vec3 sunDir, vec3 sunTint ) {
	// Branch-cut-free projection compresses distant banks toward the horizon.
	vec2 p = dir.xz / ( abs( dir.y ) + 0.12 ) * 0.65;

	vec2 cloudUv = p * 1.1 + uCloudDrift;
	float cumulus = texture2D( uCloudNoise, cloudUv ).r;
	float cirrus = texture2D( uCloudNoise, p * 0.19 + uCirrusDrift + vec2( 0.37, 0.11 ) ).r;
	float shape = cumulus * 0.78 + cirrus * 0.22;

	// COVERAGE, not opacity: the threshold moves, the blend stays near opaque.
	float cover = mix( ${cloudCoverThreshold(0).toFixed(2)}, ${cloudCoverThreshold(1).toFixed(2)}, clamp( cloudAmount, 0.0, 1.0 ) );
	float mask = smoothstep( cover, cover + 0.09, shape );

	// The projection already pinches toward the zenith, so only the horizon
	// needs a fade, and it has to be SHALLOW. A cut at 0.14 looks reasonable in
	// isolation and is wrong for this scene: the overview camera pitches 23
	// degrees down, so its entire visible sky band sits below 0.16 elevation and
	// a 0.14 fade deletes every cloud from the money shot. Real cloud decks run
	// all the way to the horizon, compressed - which is exactly what the
	// projection already does.
	mask *= smoothstep( -0.06, 0.045, dir.y );

	float mu = max( dot( dir, sunDir ), 0.0 );

	// Shape-dependent self-shading makes each bank read as volume even away
	// from the sun. One offset tap lights its sunward slope; thicker cores shade.
	vec2 sunward = sunDir.xz / max( length( sunDir.xz ), 0.01 );
	float slope = texture2D( uCloudNoise, cloudUv + sunward * 0.008 ).r - cumulus;
	float thickness = smoothstep( cover, cover + 0.28, shape );
	float faceLight = clamp( 0.82 - thickness * 0.23 + slope * 3.0, 0.32, 0.96 );
	vec3 lit = mix( uCloudShadow, uCloudLit, faceLight );

	// Silver lining. rim is high exactly where the field is just BELOW the
	// coverage threshold, i.e. at the ragged edge of a cloud, so the blow-out
	// lands on edges facing the sun instead of on whole cloud bodies.
	float rim = 1.0 - smoothstep( cover, cover + 0.05, shape );
	lit += sunTint * rim * mask * pow( mu, 9.0 ) * 0.9;

	return vec4( lit, mask * 0.92 );
}
`;

/**
 * Neutral photographic cumulus detail, shared for the scene lifetime. The
 * procedural field remains active until the image has actually loaded.
 * Working if a failed atlas request leaves the existing weather sky intact,
 * and every graphics tier shares one colour-correct RGBA upload.
 */
interface CumulusAtlas {
  texture: THREE.Texture;
  ready: { value: number };
}
let cumulusAtlas: CumulusAtlas | null = null;
export function getCumulusAtlas(): CumulusAtlas {
  if (cumulusAtlas) return cumulusAtlas;
  const ready = { value: 0 };
  const texture = new THREE.TextureLoader().load(
    `${import.meta.env.BASE_URL}textures/clouds-cumulus-v1.png`,
    () => {
      ready.value = 1;
    },
    undefined,
    () => {
      ready.value = 0;
    }
  );
  texture.name = 'MillOS Cumulus Atlas';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  cumulusAtlas = { texture, ready };
  return cumulusAtlas;
}

/**
 * One extra texture fetch, no extra geometry or draw call. Longitude repeats
 * an integer number of times and its random seeds use the wrapped column,
 * so both sides of atan's branch cut sample the same cell and atlas texel.
 * The cells fade before the polar singularity. The original projection still
 * supplies cirrus, the zenith, overcast weather and the loading fallback.
 */
export const CUMULUS_ATLAS_GLSL = /* glsl */ `
uniform sampler2D uCloudAtlas;
uniform float uCloudAtlasReady;

vec4 millosCumulusBanks( vec3 dir, float amount, vec3 sunDir, vec3 sunTint ) {
  if ( uCloudAtlasReady < 0.5 || dir.y < -0.02 || dir.y > 0.90 ) return vec4( 0.0 );
  // Integer repeat count and wrapped cell seeds close the azimuth branch cut.
  float longitude = atan( dir.z, dir.x ) / 6.28318530718;
  vec2 grid = vec2( longitude * 36.0 + uCloudDrift.x * 36.0, dir.y * 8.0 );
  float column = mod( floor( grid.x ), 36.0 );
  float columnSeed = fract( sin( column * 127.1 + 311.7 ) * 43758.5453 );
  grid.y += ( columnSeed - 0.5 ) * 0.5;
  vec2 cell = floor( grid );
  float seed = fract( sin( column * 127.1 + cell.y * 311.7 ) * 43758.5453 );
  float chosen = floor( fract( seed * 7.131 ) * 4.0 );
  vec2 tile = vec2( mod( chosen, 2.0 ), floor( chosen / 2.0 ) );
  float size = 1.2 + fract( seed * 13.21 ) * 0.65;
  vec2 local = ( fract( grid ) - 0.5 ) * size + 0.5;
  local.y += ( fract( seed * 23.17 ) - 0.5 ) * 0.20;
  local.x = mix( local.x, 1.0 - local.x, step( 0.5, fract( seed * 17.13 ) ) );
  float bounds = step( 0.0, local.x ) * step( local.x, 1.0 ) * step( 0.0, local.y ) * step( local.y, 1.0 );
  vec4 cloud = texture2D( uCloudAtlas, ( tile + clamp( local, 0.002, 0.998 ) ) * 0.5 );
  float coverageWeight = smoothstep( seed - 0.10, seed + 0.10, 0.12 + amount * 0.9 );
  float alpha = cloud.a * bounds * coverageWeight * smoothstep( -0.02, 0.045, dir.y ) * ( 1.0 - smoothstep( 0.62, 0.90, dir.y ) ) * uCloudAtlasReady;
  alpha *= mix( 0.55, 1.0, smoothstep( 0.04, 0.25, dir.y ) );
  float light = clamp( ( cloud.r - 0.20 ) / 0.80, 0.0, 1.0 );
  vec3 colour = mix( uCloudShadow, uCloudLit, light );
  float mu = max( dot( dir, sunDir ), 0.0 );
  colour += sunTint * pow( mu, 9.0 ) * ( 1.0 - cloud.a ) * 0.25;
  return vec4( colour, alpha );
}

`;
