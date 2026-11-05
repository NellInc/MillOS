import * as THREE from 'three';
import { WATER_VISUAL_TIME, WATER_WIND } from './waterAppearance';

/**
 * Caustics on submerged beds: sunlight focused by the moving surface.
 *
 * Derived, not sampled. A ray refracting through a surface of height h(p)
 * lands on a bed d metres down displaced by roughly -d(1 - 1/n) grad h, so the
 * map from surface to bed has Jacobian J = I - d(1 - 1/n) Hess h, and the light
 * a bed point receives scales with 1 / |det J|. Where det J crosses zero the
 * rays fold and the bright caustic network appears. h is a sum of plane wave
 * trains, so Hess h is a sum of sin(theta) k k^T and every term is closed form.
 *
 * Each train is authored by `focus`: the depth at which it alone would fold.
 * That replaces a physical amplitude, which at the 0.5-12 mm swell of inland
 * water (WATER_PROFILES) would fold nothing at these depths; the cells are kept
 * at metre scale, like the surface ripples above them, so the bed reads at the
 * site cameras' 40-60 m and matches the model-scale world (D-016).
 *
 * The gain multiplies only the DIRECT light reaching the bed, after shadows.
 * Shaded beds and night stay as they were, and the mean over the bed stays at
 * one (`WATER_CAUSTIC_NORMALISE`), so the term redistributes light rather than
 * adding it. Working if a lit shallow bed shows a moving bright network, a bed
 * in shadow shows none, and the paired control moves pixels at an unchanged
 * mean luminance.
 */
export const WATER_CAUSTIC_TRAINS = [
  // Golden-angle headings, so no two trains share a lattice axis.
  // degrees from +x toward +z, rad/m, rad/s at profile speed 1, fold depth m
  { angle: 17, k: 3.6, omega: 1.5, focus: 0.42, phase: 0.0 },
  { angle: 154.5, k: 4.7, omega: -1.8, focus: 0.46, phase: 1.7 },
  { angle: 292, k: 5.9, omega: 2.1, focus: 0.52, phase: 4.1 },
  { angle: 69.5, k: 7.2, omega: -2.3, focus: 0.58, phase: 2.6 },
  { angle: 207, k: 8.8, omega: 2.6, focus: 0.64, phase: 5.3 },
  { angle: 344.5, k: 10.6, omega: -2.9, focus: 0.72, phase: 0.9 },
  { angle: 122, k: 12.9, omega: 3.2, focus: 0.82, phase: 3.4 },
] as const;

export const WATER_CAUSTIC_PROFILE = {
  /** Lens depth saturates here: deeper rays scatter, they do not fold harder. */
  lensCap: 0.45,
  /** Caustics grow in over the first few centimetres below the waterline. */
  shoreFade: 0.06,
  /** Below `clearDepth` the network blurs out at `blur` per metre. */
  clearDepth: 0.6,
  blur: 0.85,
  /** 1 / sqrt(det^2 + eps^2): eps bounds the fold spike at 1 / eps. */
  eps: 0.16,
  /**
   * A slow two-axis warp of the bed coordinate, metres, at these periods. It
   * bends every wavefront, so cell size and orientation wander across the bed.
   * Five straight trains at the `water` camera's 57 m read as a regular
   * diamond lattice (caustics-medium water and river, 2026-11-03).
   */
  warp: 0.25,
  warpPeriods: [5.3, 7.1],
  /**
   * Metres per pixel over which the whole network fades out. A caustic line
   * is a small fraction of a cell; once a pixel cannot hold one, the coarse
   * trains that are still resolved draw stripes, not caustics, so the bed
   * relaxes to plain light instead.
   */
  footprint: [0.05, 0.16],
  /** Wind scales the lens as it does the ripple slope. */
  wind: [0.7, 1.3],
} as const;

/** Shared by every bed: 1 on Medium and up, 0 on Low and in the paired control. */
export const WATER_CAUSTIC_STRENGTH = { value: 1 };

const TRAIN_DIRECTIONS = WATER_CAUSTIC_TRAINS.map(({ angle }) => {
  const radians = (angle * Math.PI) / 180;
  return [Math.cos(radians), Math.sin(radians)] as const;
});
const WARP_K = WATER_CAUSTIC_PROFILE.warpPeriods.map((period) => (Math.PI * 2) / period);

function lensDepth(depth: number, wind: number): number {
  const [calm, gust] = WATER_CAUSTIC_PROFILE.wind;
  const w = Math.min(1, Math.max(0, wind));
  return Math.min(depth, WATER_CAUSTIC_PROFILE.lensCap) * (calm + (gust - calm) * w);
}

/** Raw 1 / |det J| before normalisation. `time` is already speed-scaled. */
export function waterCausticRawGain(x: number, z: number, time: number, lens: number): number {
  const { warp } = WATER_CAUSTIC_PROFILE;
  const wx = x + warp * Math.sin((x * 0.8 + z * 0.6) * WARP_K[0] + time * 0.21 + 0.4);
  const wz = z + warp * Math.sin((-x * 0.6 + z * 0.8) * WARP_K[1] - time * 0.17 + 2.1);
  let a = 0;
  let b = 0;
  let c = 0;
  WATER_CAUSTIC_TRAINS.forEach((train, i) => {
    const [dx, dz] = TRAIN_DIRECTIONS[i];
    const theta = (wx * dx + wz * dz) * train.k - time * train.omega + train.phase;
    const s = (Math.sin(theta) * lens) / train.focus;
    a += s * dx * dx;
    b += s * dx * dz;
    c += s * dz * dz;
  });
  const det = (1 + a) * (1 + c) - b * b;
  return 1 / Math.sqrt(det * det + WATER_CAUSTIC_PROFILE.eps ** 2);
}

/**
 * Mean of the raw gain over the bed at lens 0, 0.025, ... 0.6 m (the cap at
 * full wind is 0.585), measured on a 200,000-point Halton set over 97 m and
 * 1,500 s; the shader divides it out by linear interpolation. An even quartic
 * fit of the first table left a 6% residual, which would have brightened the
 * mid-depth lake. waterCaustics.test.ts
 * re-measures the table on an independent sample.
 */
export const WATER_CAUSTIC_MEAN_STEP = 0.025;
export const WATER_CAUSTIC_MEAN = [
  0.9874, 0.9939, 1.0146, 1.0519, 1.1109, 1.1999, 1.3283, 1.4938, 1.6722, 1.837, 1.97, 2.0625,
  2.1154, 2.1351, 2.1285, 2.1012, 2.0605, 2.0115, 1.956, 1.8966, 1.835, 1.7722, 1.7095, 1.6476,
  1.5874,
] as const;

export function waterCausticMean(lens: number): number {
  const last = WATER_CAUSTIC_MEAN.length - 1;
  const at = Math.min(last, Math.max(0, lens / WATER_CAUSTIC_MEAN_STEP));
  const i = Math.min(last - 1, Math.floor(at));
  return WATER_CAUSTIC_MEAN[i] + (WATER_CAUSTIC_MEAN[i + 1] - WATER_CAUSTIC_MEAN[i]) * (at - i);
}

/**
 * CPU mirror of the shader: the multiplier on direct light at a bed point
 * `depth` metres below the surface. `time` is WATER_VISUAL_TIME x speed.
 */
export function waterCausticGain(
  x: number,
  z: number,
  time: number,
  depth: number,
  wind = WATER_WIND.value,
  strength = 1,
  footprintMetres = 0
): number {
  if (!(depth > 0) || strength <= 0) return 1;
  const { shoreFade, clearDepth, blur, footprint } = WATER_CAUSTIC_PROFILE;
  const lens = lensDepth(depth, wind);
  const gain = waterCausticRawGain(x, z, time, lens) / waterCausticMean(lens);
  const fade =
    THREE.MathUtils.smoothstep(depth, 0, shoreFade) *
    Math.exp(-Math.max(0, depth - clearDepth) * blur) *
    (1 - THREE.MathUtils.smoothstep(footprintMetres, footprint[0], footprint[1]));
  return 1 + (gain - 1) * fade * Math.min(1, strength);
}

const glslFloat = (value: number) => (Number.isInteger(value) ? value.toFixed(1) : String(value));

function trainGlsl(): string {
  return WATER_CAUSTIC_TRAINS.map((train, i) => {
    const [dx, dz] = TRAIN_DIRECTIONS[i];
    const d = `vec2(${dx.toFixed(6)}, ${dz.toFixed(6)})`;
    return `
    {
      vec2 dir = ${d};
      float theta = dot(warped, dir) * ${glslFloat(train.k)} - t * ${glslFloat(train.omega)}
        + ${glslFloat(train.phase)};
      // Footprint in radians per pixel, from derivatives taken above any branch.
      float resolved = 1.0 - smoothstep(0.7, 2.4,
        ${glslFloat(train.k)} * dot(abs(dir), footprint));
      float s = sin(theta) * resolved * lens / ${glslFloat(train.focus)};
      lensA += s * dir.x * dir.x;
      lensB += s * dir.x * dir.y;
      lensC += s * dir.y * dir.y;
    }`;
  }).join('');
}

/**
 * The bed term. `footprint` is fwidth(world.xz), which the caller takes in
 * uniform control flow; unresolved trains drop out rather than alias, so a far
 * bed relaxes toward a gain of one.
 */
export const WATER_CAUSTIC_GLSL = /* glsl */ `
uniform float uMillosCausticTime;
uniform float uMillosCausticWind;
uniform float uMillosCausticStrength;
uniform float uMillosCausticLevel;
uniform float uMillosCausticSpeed;
const float MILLOS_CAUSTIC_MEAN[${WATER_CAUSTIC_MEAN.length}] = float[](
  ${WATER_CAUSTIC_MEAN.map(glslFloat).join(', ')});
float millosCausticGain(vec2 world, vec2 footprint, float depth) {
  if (uMillosCausticStrength <= 0.0 || depth <= 0.0) return 1.0;
  float t = uMillosCausticTime * uMillosCausticSpeed;
  float lens = min(depth, ${glslFloat(WATER_CAUSTIC_PROFILE.lensCap)})
    * mix(${glslFloat(WATER_CAUSTIC_PROFILE.wind[0])}, ${glslFloat(WATER_CAUSTIC_PROFILE.wind[1])},
      clamp(uMillosCausticWind, 0.0, 1.0));
  float network = 1.0 - smoothstep(${glslFloat(WATER_CAUSTIC_PROFILE.footprint[0])},
    ${glslFloat(WATER_CAUSTIC_PROFILE.footprint[1])}, max(footprint.x, footprint.y));
  if (network <= 0.0) return 1.0;
  vec2 warped = world + ${glslFloat(WATER_CAUSTIC_PROFILE.warp)} * vec2(
    sin(dot(world, vec2(0.8, 0.6)) * ${WARP_K[0].toFixed(6)} + t * 0.21 + 0.4),
    sin(dot(world, vec2(-0.6, 0.8)) * ${WARP_K[1].toFixed(6)} - t * 0.17 + 2.1));
  float lensA = 0.0, lensB = 0.0, lensC = 0.0;
  ${trainGlsl()}
  float det = (1.0 + lensA) * (1.0 + lensC) - lensB * lensB;
  float meanAt = clamp(lens / ${glslFloat(WATER_CAUSTIC_MEAN_STEP)}, 0.0, ${glslFloat(WATER_CAUSTIC_MEAN.length - 1)});
  int meanIndex = min(int(meanAt), ${WATER_CAUSTIC_MEAN.length - 2});
  float mean = mix(MILLOS_CAUSTIC_MEAN[meanIndex], MILLOS_CAUSTIC_MEAN[meanIndex + 1],
    meanAt - float(meanIndex));
  float gain = inversesqrt(det * det + ${glslFloat(WATER_CAUSTIC_PROFILE.eps ** 2)}) / mean;
  float fade = smoothstep(0.0, ${glslFloat(WATER_CAUSTIC_PROFILE.shoreFade)}, depth)
    * exp(-max(0.0, depth - ${glslFloat(WATER_CAUSTIC_PROFILE.clearDepth)}) * ${glslFloat(WATER_CAUSTIC_PROFILE.blur)});
  return mix(1.0, gain, fade * network * min(uMillosCausticStrength, 1.0));
}
`;

export interface WaterCausticOptions {
  /** World-space Y of the water surface over this bed, metres. */
  waterLevel: number;
  /** The water profile's speed, so the network moves with the surface above it. */
  speed: number;
  /**
   * A varying the host shader already writes with the world position. Omit it
   * and this injection writes its own.
   */
  worldVarying?: string;
  /**
   * GLSL bool expression, in terms of `causticWorld` (vec3), limiting the term
   * to the region the water actually covers (a river band, say).
   */
  region?: string;
}

type CausticUniforms = Record<string, THREE.IUniform>;

export function createWaterCausticUniforms(options: WaterCausticOptions): CausticUniforms {
  return {
    uMillosCausticTime: WATER_VISUAL_TIME,
    uMillosCausticWind: WATER_WIND,
    uMillosCausticStrength: WATER_CAUSTIC_STRENGTH,
    uMillosCausticLevel: { value: options.waterLevel },
    uMillosCausticSpeed: { value: options.speed },
  };
}

/**
 * Add the bed term to a MeshStandardMaterial program inside an existing or new
 * onBeforeCompile. It scales the direct light after `lights_fragment_end`, so
 * shadows, the sun's colour and its absence at night all carry through.
 */
export function injectWaterCaustics(
  shader: THREE.WebGLProgramParametersWithUniforms,
  options: WaterCausticOptions,
  uniforms: CausticUniforms = createWaterCausticUniforms(options)
): void {
  Object.assign(shader.uniforms, uniforms);
  const own = !options.worldVarying;
  const varying = options.worldVarying ?? 'vMillosCausticWorld';
  if (own) {
    shader.vertexShader = `varying vec3 vMillosCausticWorld;\n${shader.vertexShader}`.replace(
      '#include <worldpos_vertex>',
      '#include <worldpos_vertex>\nvMillosCausticWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;'
    );
  }
  const region = options.region ?? 'true';
  shader.fragmentShader =
    `${own ? 'varying vec3 vMillosCausticWorld;\n' : ''}${WATER_CAUSTIC_GLSL}\n${shader.fragmentShader}`.replace(
      '#include <lights_fragment_end>',
      `#include <lights_fragment_end>
    {
      vec3 causticWorld = ${varying};
      vec2 causticFootprint = fwidth(causticWorld.xz);
      float causticDepth = uMillosCausticLevel - causticWorld.y;
      if (${region}) {
        float causticGain = millosCausticGain(causticWorld.xz, causticFootprint, causticDepth);
        reflectedLight.directDiffuse *= causticGain;
        reflectedLight.directSpecular *= causticGain;
      }
    }`
    );
}

/** Own-injection form for a bed material that has no other shader work. */
export function applyWaterCaustics<T extends THREE.MeshStandardMaterial>(
  material: T,
  options: WaterCausticOptions,
  cacheKey: string
): T {
  const uniforms = createWaterCausticUniforms(options);
  material.onBeforeCompile = (shader) => injectWaterCaustics(shader, options, uniforms);
  material.customProgramCacheKey = () => cacheKey;
  material.userData.millosWaterCaustics = uniforms;
  material.needsUpdate = true;
  return material;
}
