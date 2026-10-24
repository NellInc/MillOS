import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useGraphicsStore } from '../../stores/graphicsStore';
import { RENDER_ORDER, SHADOW_CONFIG } from '../../constants/renderLayers';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import {
  createCelestialState,
  getOvercastDeck,
  getOvercastWeight,
  sampleAtmosphere,
  sampleCelestial,
} from '../../simulation/atmosphere';
import { getSmoothedGameTime } from '../../systems/DisplaySmoothing';
import {
  SKY_CLOUD_GLSL,
  CUMULUS_ATLAS_GLSL,
  getCloudNoiseTexture,
  getCumulusAtlas,
} from '../../shaders/skyClouds';
import { WORLD_SURFACE_STRENGTH } from '../../utils/worldSurface';
import { SURFACE_WETNESS, dampSurfaceWetness } from '../../shaders/surfaceWetness';
import { FOG_HORIZON_START, FOG_HORIZON_END } from '../../shaders/atmosphericFog';
import { neutraliseDaylightFill } from './SceneEnvironmentIBL';

/** Shared sunset tint for the sky and its mountain/terrain inscatter. */
export function getSkyTwilightWeight(solarElevation: number, twilight: number): number {
  // Clock-based twilight already reaches 29% at 16h, while the sun is still
  // 30 degrees high. Reserve the warm horizon for genuinely low solar angles.
  return (
    Math.min(0.72, twilight * 0.72) * (1 - THREE.MathUtils.smoothstep(solarElevation, 0.05, 0.35))
  );
}

/** After sunset, the upper sky and cloud fill stay blue while the warm band
 * recedes. Solar angle makes dawn follow the same continuous transition.
 * Working if blue-hour views retain cool cloud volume without changing noon
 * or deep night, and the horizon stops tinting the whole valley orange.
 */
export function getSkyBlueHourWeight(solarElevation: number, twilight: number): number {
  return (
    twilight *
    (1 - THREE.MathUtils.smoothstep(solarElevation, -0.24, -0.02)) *
    THREE.MathUtils.smoothstep(solarElevation, -0.52, -0.24)
  );
}

export function getSkyWarmHorizonWeight(solarElevation: number, twilight: number): number {
  return (
    getSkyTwilightWeight(solarElevation, twilight) *
    THREE.MathUtils.smoothstep(solarElevation, -0.26, -0.02)
  );
}

/** Low sun continues lighting high cloud edges after the disc is hidden.
 * Working if dawn/dusk retain a localized warm rim while noon/night are exact zero.
 */
// Paired rendered control, never a time-dependent cache key.
export const SKY_AFTERGLOW_STRENGTH = { value: 1 };

export function getSkyAfterglowWeight(solarElevation: number, twilight: number): number {
  return (
    Math.min(1, Math.max(0, twilight)) *
    0.72 *
    THREE.MathUtils.smoothstep(solarElevation, -0.4, -0.12) *
    (1 - THREE.MathUtils.smoothstep(solarElevation, -0.06, 0.18))
  );
}

/** Ambient and IBL reuse the rendered horizon, including its dusk shoulders.
 * Working if shaded stone follows the visible sky without another light,
 * changed fill intensity or a separate day/night palette erasing twilight.
 * With a `daylight`, the copy takes the daytime fill neutralisation; the
 * hemisphere sky and the IBL horizon band read this colour, so it reaches all
 * three fill terms while the rendered sky keeps its own blue.
 */
export function applySkyAmbientPalette(
  target: THREE.Color,
  renderedHorizon: THREE.Color,
  daylight?: number
): THREE.Color {
  target.copy(renderedHorizon);
  return daylight === undefined ? target : neutraliseDaylightFill(target, daylight);
}

/**
 * Lowest the shadowed key may rake, as a direction Y (about 7 degrees).
 * At the former 0.07 (4 degrees) the slab received 7% of the sunrise key against
 * a 2.5 sky fill, so the hall and silos threw no readable shadow at 06:00.
 */
export const KEY_MIN_ELEVATION = 0.125;

/** Reuse the one fitted shadow map after sunset; no duplicate moon energy.
 * Above-horizon endpoints retain their original direction. During crossover
 * the key passes continuously over the sky instead of snapping 180 degrees.
 * Working if noon is unchanged and night has source-aligned celestial shadows.
 */
export function celestialKeyDirection(
  target: THREE.Vector3,
  sun: readonly number[],
  moon: readonly number[],
  sunIntensity: number,
  moonIntensity: number
): THREE.Vector3 {
  const weight = moonIntensity / Math.max(0.00001, sunIntensity + moonIntensity);
  return target
    .set(
      THREE.MathUtils.lerp(sun[0], moon[0], weight),
      THREE.MathUtils.lerp(
        Math.max(KEY_MIN_ELEVATION, sun[1]),
        Math.max(KEY_MIN_ELEVATION, moon[1]),
        weight
      ),
      THREE.MathUtils.lerp(sun[2], moon[2], weight)
    )
    .normalize();
}

/** Clear air reveals the rock; cloudier weather closes the depth layers.
 * Weather extinction grows with each ring's own clear-air depth (far 0.32 is the
 * reference), so rain thickens the air WITH distance. A flat increment put the
 * village foothills at nearly the far range's value - one blue wall.
 */
export function getRidgeAerialWeight(clearAerial: number, cloudCoverage: number): number {
  const cloudiness = THREE.MathUtils.clamp((cloudCoverage - 0.2) / 0.7, 0, 1);
  const depth = THREE.MathUtils.clamp(clearAerial / 0.32, 0, 1);
  return clearAerial + (1 - clearAerial) * cloudiness * 0.85 * depth;
}

/**
 * Fair-weather share of the far ring's thinned lower-band haze
 * (RIDGE_ALPINE_PROFILE.lowBandAerial). That thinning is a clear-air contrast
 * choice; under rain cloud it left the far lower slopes at 0.42 behind a mid
 * foothill ring at 0.53, so the nearer hills hazed over the mountains behind
 * them and read as a fog band with a hard arced top (final3-med-rain farm).
 * On `getRidgeAerialWeight`'s cloudiness ramp, gone by 0.4 of it (cover 0.48),
 * before the foothills' distance haze can rise past the far lower band.
 */
export function getRidgeClearAir(cloudCoverage: number): number {
  const cloudiness = THREE.MathUtils.clamp((cloudCoverage - 0.2) / 0.7, 0, 1);
  return 1 - THREE.MathUtils.smoothstep(cloudiness, 0, 0.4);
}

/**
 * PCF penumbra radius in texels: three's default 1 in fair weather, about 3.1
 * under rain and 4 under a storm deck. The deck also scatters most of the key
 * (`overcastKeyScatter`), so what shadow remains is faint as well as soft.
 */
export function overcastShadowRadius(cloudCoverage: number): number {
  return 1 + 3 * getOvercastWeight(cloudCoverage);
}

/** Overcast daytime palette (sRGB display hexes), one per sky band. */
export const OVERCAST_SKY = {
  top: new THREE.Color('#8d969e'),
  horizon: new THREE.Color('#aeb4b8'),
  ground: new THREE.Color('#7d8680'),
  cloud: new THREE.Color('#b9bec2'),
  cloudShadow: new THREE.Color('#6f7780'),
} as const;
const OVERCAST_NIGHT = new THREE.Color('#0d1014');
const _overcastScratch = new THREE.Color();

/**
 * Pull one sky band toward a neutral overcast deck. Weather used to reach the
 * palette only through `lightMultiplier`, which darkens the blue rather than
 * greying it, so rain read as dusk. Exactly inert in fair weather (the overcast
 * weight is 0 at clear's 0.2 cover); the deck darkens with the day. The ambient,
 * hemisphere, IBL and fog all copy this palette, so they grey with it.
 */
export function blendSkyOvercast(
  target: THREE.Color,
  band: keyof typeof OVERCAST_SKY,
  visualDaylight: number,
  cloudCoverage: number
): THREE.Color {
  // Rain and storm close the deck (`getOvercastDeck`): the full neutral palette,
  // no blue left. Lighter cloud keeps the partial pull.
  const weight = Math.max(getOvercastWeight(cloudCoverage) * 0.9, getOvercastDeck(cloudCoverage));
  if (weight <= 0) return target;
  _overcastScratch
    .copy(OVERCAST_NIGHT)
    .lerp(OVERCAST_SKY[band], THREE.MathUtils.clamp(visualDaylight, 0, 1));
  return target.lerp(_overcastScratch, weight);
}

const optimizedSkyVertexShader = `
varying vec3 vDirection;

void main() {
  vDirection = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * Analytic sky.
 *
 * SOLAR SCATTERING IS THREE TERMS, NOT ONE. What shipped was a single
 * `pow(dot, 28.0) * 0.46` lobe tinted by the horizon colour: too tight to read
 * as an aureole at sunset, too weak to read as glare at noon, and the wrong
 * hue in both cases. The replacement separates the physics:
 *   - `mieBroad`  - the wide forward-scattering aureole that makes a sunset
 *                   read as a sunset. Strengthened as the sun drops, because
 *                   a low sun's light traverses far more atmosphere.
 *   - `mieTight`  - the near-disc flare, which is what survives at noon.
 *   - `rayleigh`  - the isotropic molecular lift, tinted by the zenith rather
 *                   than the horizon.
 *   - `haze`      - horizon inscatter. Clamped to height >= 0: the previous
 *                   `exp(-abs(height))` glowed symmetrically BELOW the horizon,
 *                   where the correct term is ground bounce, not sky.
 *
 * CLOUDS COME LAST so the scattering lights the sky the clouds sit in front of,
 * rather than bleeding through them.
 */
export const OPTIMIZED_SKY_FRAGMENT_SHADER = `
uniform vec3 topColor;
uniform vec3 horizonColor;
uniform vec3 groundColor;
uniform vec3 uSunTint;
uniform float cloudAmount;
uniform float daylight;
uniform float uSunOpacity;
uniform float uOvercastDeck;
uniform float uAfterglow;
uniform float uSkyAfterglowStrength;
uniform vec3 uAfterglowColor;
uniform vec3 sunDirection;
varying vec3 vDirection;

${SKY_CLOUD_GLSL}
${CUMULUS_ATLAS_GLSL}

void main() {
  vec3 direction = normalize(vDirection);
  float height = direction.y;
  vec3 sunDir = normalize(sunDirection);

  float upperBlend = smoothstep(-0.02, 0.46, height);
  vec3 sky = mix(horizonColor, topColor, upperBlend);
  // Widened from a ~10 degree cut: the old edge read as a hard line wherever
  // the terrain did not reach the bottom of the dome.
  sky = mix(groundColor, sky, smoothstep(-0.35, 0.03, height));

  float mu = max(dot(direction, sunDir), 0.0);
  float horizonWeight = mix(1.0, 2.4, 1.0 - abs(sunDir.y));
  float mieBroad = pow(mu, 6.0) * 0.20 * horizonWeight;
  float mieTight = pow(mu, 220.0) * 1.35;
  float rayleigh = (1.0 + mu * mu) * 0.045;
  float haze = exp(-max(height, 0.0) * 5.5) * (0.025 + daylight * 0.055);
  sky += uSunTint * (mieBroad + mieTight) * uSunOpacity;
  sky += topColor * rayleigh * daylight + horizonColor * haze;

  // The hidden solar disc and the still-lit high atmosphere have separate lifetimes.
  // Bound this band by elevation and actual solar azimuth, rather than tinting all sky.
  float sunward = max(dot(direction.xz / max(length(direction.xz), 0.0001),
    sunDir.xz / max(length(sunDir.xz), 0.0001)), 0.0);
  float afterglow = uAfterglow * uSkyAfterglowStrength * pow(sunward, 2.0) *
    (1.0 - smoothstep(0.08, 0.38, height)) * smoothstep(-0.02, 0.04, height);
  sky = mix(sky, uAfterglowColor * 0.45 + vec3(0.0, 0.03, 0.06), afterglow * 0.55);
  sky += uAfterglowColor * afterglow * 0.86;
  vec4 clouds = millosSkyClouds(direction, cloudAmount, sunDir, uSunTint);
  // High cloud shoulders keep seeing the hidden sun after the low air cools.
  // Reuse coverage for rim/core separation: no extra cloud texture samples.
  // Working if warm edges sit above a cool horizon without orange cloud cores.
  float cloudAfterglow = uAfterglow * uSkyAfterglowStrength * pow(sunward, 2.0) *
    smoothstep(-0.02, 0.06, height) * (1.0 - smoothstep(0.32, 0.70, height));
  float cloudRim = 4.0 * clouds.a * (1.0 - clouds.a);
  clouds.rgb += uAfterglowColor * cloudAfterglow * (0.08 + cloudRim * 0.72);
  float fieldStrength = mix( 1.0, 0.12 + smoothstep( 0.4, 0.85, cloudAmount ) * 0.88, uCloudAtlasReady );
  sky = mix(sky, clouds.rgb, clouds.a * fieldStrength);
  vec4 banks = millosCumulusBanks( direction, cloudAmount, sunDir, uSunTint );
  float bankRim = 4.0 * banks.a * (1.0 - banks.a);
  banks.rgb += uAfterglowColor * cloudAfterglow * (0.06 + bankRim * 0.62);
  sky = mix( sky, banks.rgb, banks.a );

  // RAIN IS A CLOSED DECK. The cloud field above keeps its gaps at any cover,
  // so rain read as blue sky and white cumulus. Under a closed deck the dome
  // is the cloud base: shadowed grey overhead, the lit underside toward the
  // horizon haze, the field's own structure kept as faint mottling. Exactly
  // inert while uOvercastDeck is 0 (clear and cloudy).
  float deckShade = 0.5 + 0.3 * clouds.a + 0.2 * banks.a;
  vec3 overcastDeck = mix( uCloudShadow, uCloudLit, deckShade * ( 1.0 - 0.35 * upperBlend ) );
  overcastDeck = mix( overcastDeck, horizonColor, 1.0 - smoothstep( 0.0, 0.22, height ) );
  sky = mix( sky, overcastDeck, uOvercastDeck * smoothstep( -0.06, 0.0, height ) );

  gl_FragColor = vec4(sky, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/**
 * Mountain ridge material.
 *
 * WHY THE RIDGES NEEDED A SHADER AT ALL. They were `MeshBasicMaterial` with
 * vertex colours - unlit, so no slope on any of the three rings caught the sun
 * and `computeVertexNormals()` produced normals nothing consumed. Depth existed
 * in the geometry and was invisible in the image: flat grey cut-outs pasted on
 * the sky, which is exactly how the baseline capture reads.
 *
 * Wooded foothills retain wrapped diffuse light. Alpine planes use the
 * directional sun plus the same nonzero blue sky fill: compressing their
 * incidence into a half-range erased the relief on exposed mineral faces.
 *
 * PER-CHANNEL AERIAL PERSPECTIVE is the cue that actually separates the rings.
 * Single-scattering extinction is
 *   L = L_surface * exp(-beta * d) + L_inscatter * (1 - exp(-beta * d))
 * i.e. a per-channel mix whose weight is largest where beta is largest. Rayleigh
 * beta goes as lambda^-4, so BLUE carries the largest weight and red the
 * smallest: a distant ridge takes on the sky's blue rather than keeping it.
 * Getting this backwards - which is easy, because blue is also the channel
 * extinguished hardest along the direct path - drives the ridges toward a
 * grey-green rather than toward the sky, and the range reads as fog-white paint
 * instead of air. `uInscatter` is the SAME colour the fog is using this frame,
 * so the backdrop and the atmosphere in front of it cannot disagree.
 */
/** Compact support fits the existing 3x3 seed stencil at every fragment.
 * Working if maximum radius times largest axis stays below 1 + seedInset,
 * and overlapping crowns have no discontinuous nearest-owner boundary.
 */
export const RIDGE_CANOPY_PROFILE = {
  seedInset: 0.1,
  radius: [0.6, 0.95],
  axis: [0.8, 1.1],
  amplitude: [0.55, 0.95],
} as const;

/**
 * Fixed foothills behind the far range take at least its haze.
 *
 * The far ring is centred on the camera; the mid and near rings are fixed to
 * the site. From the farm camera the far side of the mid ring stands 616-662 m
 * out, behind the far range's crest (radius + slopeDepth, 573 m), and where
 * that crest is low its rows rise over it. They took the foothill cap (the far
 * lower band, 0.55 of the far weight in clear air) while the crest rows in
 * front keep the full far weight, so the farther hill read darker than the
 * range before it: a dark lens on the shoulder (final5-med-22 farm, x 300-475
 * y 160-180). Past the crest, by `ramp` metres of horizontal camera distance,
 * they now take at least the far weight. Round 6 sank those vertices instead,
 * which also cut the overview's hill behind the silos (569-592 m, a
 * continuation of the hill in front of the crest): a pale hole at 06:00 and a
 * staircase at 19:00 (final6-med-06, final6-med-19). Nothing moves now, and
 * the ramp starts past that hill line.
 */
export const RIDGE_BEHIND_RANGE_HAZE = { ramp: [12, 45] } as const;

/** CPU mirror of the behind-the-range weight at a horizontal camera distance. */
export function getRidgeBehindRangeHaze(groundDistance: number): number {
  const crest = FAR_MOUNTAIN_SPEC.radius + FAR_MOUNTAIN_SPEC.slopeDepth;
  const [start, end] = RIDGE_BEHIND_RANGE_HAZE.ramp;
  return THREE.MathUtils.smoothstep(groundDistance, crest + start, crest + end);
}

/** CPU mirror of an anchored fragment's haze once the behind-the-range floor applies. */
export function getRidgeBehindRangeAerial(
  groundDistance: number,
  anchoredAerial: number,
  far: number
): number {
  return THREE.MathUtils.lerp(
    anchoredAerial,
    Math.max(anchoredAerial, far),
    getRidgeBehindRangeHaze(groundDistance)
  );
}

const ridgeVertexShader = `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vRidgeColor;
varying vec3 vRidgeNormal;
varying vec3 vRidgePosition;
varying float vRidgeHeight;
varying float vRidgeSnow;
varying float vRidgeDistance;
varying float vRidgeGroundDistance;
attribute float ridgeHeight;
attribute float ridgeSnow;
// 1 on the fixed foothills. The camera-locked range scales its view-space
// position along each view ray (getFarRidgeDepthPush): the same pixels, a
// greater depth, so no fixed hill can be drawn behind the "infinite" range.
uniform float uDepthPush;

void main() {
  vRidgeColor = color;
  vRidgeNormal = normalize(mat3(modelMatrix) * normal);
  vRidgePosition = position;
  vRidgeHeight = ridgeHeight;
  vRidgeSnow = ridgeSnow;
  // Horizontal distance from the camera (RIDGE_BEHIND_RANGE_HAZE).
  vRidgeGroundDistance = length((modelMatrix * vec4(position, 1.0)).xz - cameraPosition.xz);
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vRidgeDistance = length(mvPosition.xyz);
  gl_Position = projectionMatrix * vec4(mvPosition.xyz * uDepthPush, 1.0);
  #include <logdepthbuf_vertex>
}
`;

export const RIDGE_SNOW_STRENGTH = { value: 1 };

/**
 * Hedged fields on the fixed foothills' gentle slopes.
 *
 * The woodland finish alone spans 0.047-0.067 linear red, and aerial haze at
 * 150-300 m flattened that to one dark-green gradient over a third of the
 * village frame (final-med-12). A mill's hinterland is farmed: rotated parcels
 * of pasture and hay on the gentle ground, hedgerows on every boundary, a few
 * copses, with the existing woodland kept on steep banks and crests.
 * Linear albedo; `cell` and `hedgeMetres` are metres on the rest mesh.
 */
export const RIDGE_FIELD_PROFILE = {
  cell: [58, 41],
  hedgeMetres: 0.9,
  pasture: [0.08, 0.122, 0.048],
  hay: [0.122, 0.128, 0.058],
  woodland: [0.052, 0.078, 0.047],
  /**
   * Farmed where the ground is gentle, by normal.y. Each of the 17 terrace rows
   * carries a near-constant slope, so the former 0.82-0.93 gate flipped along
   * whole rows: hard horizontal seams between the patchwork and plain wooded
   * bands (village, final-med-12). A wide ramp broken by +/-`edgeBreak` of a
   * 50 m field lets the wood edge wander across rows and fade into the fields.
   */
  slopeGate: [0.76, 0.95],
  edgeBreak: 0.08,
  /**
   * Copses: irregular 15-40 m woods inside the farmland, in place of isolated
   * 3.8 m field-tree discs. A flat dark disc on a slope seen at a grazing angle
   * foreshortens into an ellipse that reads as a hole, about 12 of them per
   * village frame. Thresholds on a 0-1 fbm.
   */
  copse: [0.63, 0.74],
  /**
   * The wooded masks read as flat dark ovals from the village (final3-med-12,
   * the rubric's "blotches"): at 150-450 m the 3.7 m crowns carried +/-11%
   * albedo and 0.24 m of relief, which the aerial mix erased. Crowns now span
   * `crownTone`, groups of crowns (`clump`, about 6 m) shade with relief while
   * they resolve (`clumpFootprint`, metres per pixel), both outlines wander by
   * `rag` on a ~9 m field, and a `fringe` of lighter `scrub` with scattered
   * trees runs outside each stand line. Linear albedo.
   */
  /**
   * Round 4's values (crowns 0.74-1.24, clumps +/-16% on 6 m and 2.4 m cells
   * to 2 m/px, a 9 m rag, 0.08-wide stand edges on a 45 m fbm, strays to
   * 6 m/px) read as hard camouflage mottling at the village's 0.5-1.5 m/px
   * (final4-med-06, low-12 and med-12). Now: crowns +/-11% about a slightly
   * lighter mean (less contrast against the fields), faint broad clumps
   * (`clumpScale` cycles per metre) that fade from 1 m/px, a slow rag
   * (`ragScale`), wide stand edges (`woodsEdge`, `copse`) on lower-frequency
   * fields (`standScale`: woods, copses) for larger coherent stands, and
   * strays only where single trees resolve (`strayFootprint`). final5 low-12
   * and med-12 still read faintly as camouflage: crowns +/-9%, clumps +/-5%,
   * and stand edges (0.2) and copse outlines (0.11) ramp wider again.
   */
  crownTone: [1.0, 0.19],
  crownReliefMetres: 0.55,
  clump: 0.05,
  clumpScale: [0.07, 0.15],
  clumpReliefMetres: 0.8,
  clumpFootprint: [1.0, 4.0],
  rag: 0.05,
  ragScale: 0.05,
  standScale: [0.015, 0.018],
  woodsEdge: [0.4, 0.6],
  strayFootprint: [0.6, 1.2],
  fringe: 0.1,
  scrub: [0.09, 0.122, 0.054],
  /**
   * Night: parcels take `nightTone`'s hue once `uFieldDaylight` reaches 0
   * (`getRidgeFieldDaylight`: full by 0.3 daylight, so 18:30 keeps about 80% of
   * its hue; none by 0.05, 19:00), and keep `nightVariation` of their luminance
   * step about it once `uFieldTone` reaches 0 (`getRidgeFieldTone`: full by
   * 0.2, so 18:30 at 0.23 keeps its patchwork, none by 0.06, so 19:00 at 0.046
   * has none). Half the step kept at 19:00 brought the hedgerows and parcel
   * facets back as diagonal creases on the dark hill (final5-med-19). One shared ramp at [0.08, 0.5]
   * took 70% of the hue and half the patchwork by 18:30, and a night tone 25%
   * below the fields darkened them: one near-black mass at dusk
   * (final4-med-1830 village). `nightTone` sits near the hill's area mean.
   */
  nightTone: [0.078, 0.111, 0.059],
  nightVariation: 0.3,
  fieldDaylight: [0.05, 0.3],
  fieldTone: [0.06, 0.2],
} as const;

/**
 * Distance haze on the two fixed foothill rings. Their clear-air weights (near
 * 0.1, mid 0.2, weather-damped by `getRidgeAerialWeight`) are pinned at
 * `distances`, the metres from the village camera to the middle of each ring's
 * visible slope, and run linearly between them, clamped to `run` beyond. Both
 * rings evaluate the same function, so where the near crest stands in front of
 * the mid ring the two meet at nearly one value instead of a 0.1 step.
 */
export const RIDGE_ANCHORED_AERIAL = {
  // Village camera probe (r4-land, base-village-19): the near ring's visible
  // slope spans 206-351 m, the mid ring's 329-453 m.
  distances: [250, 390],
  // Out to the far ring's own distance (about 545 m), where the farthest
  // foothill fragments meet its weight; never hazier than it (the `z` cap).
  run: [-0.5, 2.2],
} as const;

/**
 * CPU mirror of the anchored rings' distance haze, for tests and calibration.
 * The ceiling is the far range's LOWER BAND, which in clear air carries only
 * `lowBandAerial` of the far weight (getRidgeClearAir). Capped at the full far
 * weight instead, every foothill beyond about 560 m (farm, overview, water,
 * shipping and tank-farm cameras) hazed past the mountains behind it and read
 * as a flat blue-grey backdrop band (final4-med-12).
 */
export function getAnchoredRidgeAerial(
  distance: number,
  near: number,
  mid: number,
  far = Infinity,
  clearAir = 0
): number {
  const [d0, d1] = RIDGE_ANCHORED_AERIAL.distances;
  const run = THREE.MathUtils.clamp((distance - d0) / (d1 - d0), ...RIDGE_ANCHORED_AERIAL.run);
  const ceiling = far * THREE.MathUtils.lerp(RIDGE_ALPINE_PROFILE.lowBandAerial, 1, 1 - clearAir);
  return Math.min(ceiling, Math.max(0, THREE.MathUtils.lerp(near, mid, run)));
}

/** Shared by both anchored materials; the frame loop writes each ring's damped weight. */
export const RIDGE_ANCHORED_AERIAL_SPAN = { value: new THREE.Vector3(0.1, 0.2, 0.32) };

/** Day weight of the hill fields' hue (RIDGE_FIELD_PROFILE.night*). */
export function getRidgeFieldDaylight(daylight: number): number {
  const [start, end] = RIDGE_FIELD_PROFILE.fieldDaylight;
  return THREE.MathUtils.smoothstep(daylight, start, end);
}

/** Day weight of the hill fields' full tonal range: patchwork and hedgerows. */
export function getRidgeFieldTone(daylight: number): number {
  const [start, end] = RIDGE_FIELD_PROFILE.fieldTone;
  return THREE.MathUtils.smoothstep(daylight, start, end);
}
const glslVec3 = (value: readonly number[]) => `vec3(${value.map((v) => v.toFixed(3)).join(', ')})`;

/** Linear mineral albedo and metre-scale relief, independent of baked snow.
 * Working if sheer faces reveal stone while upper shoulders retain white caps.
 */
export const RIDGE_ALPINE_PROFILE = {
  mineralShade: [0.68, 1.12],
  steepSnow: 0.1,
  shoulderSnow: 0.84,
  gullySnow: 0.28,
  reliefMetres: 0.38,
  /**
   * Mineral substrate under and below the snow. It used to switch from
   * vegetation on vRidgeSnow's 0.05-0.30 ramp: 3 m of altitude (12 m per snow
   * unit) at world y 56-59, which on a camera-locked ring is a dead-straight
   * line, with a flat haze-blue slab of near-uniform vegetation below it
   * (overview, final-med-12). The ramp is now wide and broken by the vein and
   * scrub fields, steep low faces show outcrops, and the lowland vegetation
   * carries stands of scrub. Linear albedo.
   */
  /** Half-range of the snow line's altitude break, metres (12 m per snow unit). */
  snowBreakMetres: 13,
  substrateRamp: [0.0, 0.55],
  substrateBreak: 0.6,
  outcrop: [0.5, 0.74],
  /**
   * Shaded conifer gully to lit meadow spur. The former 0.046-0.104 pair (1.6x
   * luminance) came through the far ring's 0.32 aerial mix as about 1.1x, so
   * the lower band read as one blue-grey slab (overview, final-med-12); this
   * span keeps about 1.27x after the haze.
   */
  lowland: [
    [0.028, 0.046, 0.03],
    [0.13, 0.145, 0.085],
  ],
  /**
   * Weathered outcrop rock. The outcrops used to take `vRidgeColor`, whose
   * low-row value is the '#42574c' forest green, so they were a no-op exactly
   * on the band that needed them.
   */
  outcropAlbedo: [0.16, 0.165, 0.15],
  /** Pale scree and bare rock on the fall-line ribs of the lower band. */
  ribAlbedo: [0.21, 0.215, 0.2],
  /**
   * Fall-line spurs and gullies on the lower band, metres of relief across a
   * ~25 m cell: enough for faces to turn to and from the sun at 400 m, where
   * the metre-scale vein relief is unresolved.
   */
  spurMetres: 4.5,
  /**
   * Far-ring aerial weight below the snow line, as a fraction of the full
   * term. The band sits at 540 m under a 0.32 aerial mix over 0.03-0.05 lit
   * radiance, so the haze was ~90% of every pixel and the ribs, runnels and
   * spurs above moved about one level (overview, art3land-after4-med12).
   */
  lowBandAerial: 0.55,
  /**
   * Snow units (12 m each) on the broken snow altitude over which the haze
   * thins: full at -0.4 and above, so the snow (which starts at +0.35) and the
   * upper rock under it keep exactly their pixels; a 24 m ramp draws no line.
   */
  lowBandRamp: [-2.4, -0.4],
  /**
   * Run out from the ring's foot, as a fraction of its slope depth, over which
   * the crest rows keep their full haze: they are the horizon silhouette.
   */
  crestGuard: [0.72, 0.92],
} as const;

const ridgeFragmentShader = `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform vec3 uShadowTint;
uniform vec3 uInscatter;
uniform float uAerial;
uniform float uDetailStrength;
uniform float uSnowStrength;
uniform float uWorldAnchored;
uniform float uWoodlandStrength;
uniform float uAlpineStrength;
uniform float uSnowDatum;
uniform float uRingRadius;
uniform float uSlopeDepth;
uniform float uLowAerialStrength;
uniform float uFieldDaylight;
uniform float uFieldTone;
uniform vec3 uAnchoredAerial;
uniform float uDistanceAerialStrength;
uniform float uClearAir;
varying vec3 vRidgeColor;
varying vec3 vRidgeNormal;
varying vec3 vRidgePosition;
varying float vRidgeHeight;
varying float vRidgeSnow;
varying float vRidgeDistance;
varying float vRidgeGroundDistance;

float ridgeHash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
float ridgeNoise(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(ridgeHash(cell), ridgeHash(cell + vec2(1.0, 0.0)), f.x),
    mix(ridgeHash(cell + vec2(0.0, 1.0)), ridgeHash(cell + vec2(1.0)), f.x), f.y);
}
float ridgeFbm(vec2 p) {
  return ridgeNoise(p) * 0.54 + ridgeNoise(p * 2.03 + 7.2) * 0.28 +
    ridgeNoise(p * 4.11 - 3.8) * 0.18;
}
// Overlapping compact crowns have continuous shoulders and no nearest-owner
// crease network. Kernel-weighted species remain continuous between stands.
vec2 ridgeCanopy(vec2 p) {
  vec2 base = floor(p), local = fract(p);
  float uncovered = 1.0, weightSum = 0.0, speciesSum = 0.0;
  for (int x = -1; x <= 1; x++) {
    for (int z = -1; z <= 1; z++) {
      vec2 offset = vec2(float(x), float(z));
      float a = ridgeHash(base + offset);
      float b = ridgeHash(base + offset + vec2(53.1, 7.7));
      float c = ridgeHash(base + offset + vec2(17.7, 39.2));
      float d = ridgeHash(base + offset + vec2(71.9, 5.3));
      vec2 delta = offset + ${RIDGE_CANOPY_PROFILE.seedInset.toFixed(2)}
        + vec2(a, b) * ${(1 - RIDGE_CANOPY_PROFILE.seedInset * 2).toFixed(2)} - local;
      vec2 rotation = vec2(cos(d * 6.2831853), sin(d * 6.2831853));
      vec2 rotated = vec2(dot(delta, rotation), dot(delta, vec2(-rotation.y, rotation.x)));
      vec2 axes = mix(vec2(${RIDGE_CANOPY_PROFILE.axis[0].toFixed(2)}),
        vec2(${RIDGE_CANOPY_PROFILE.axis[1].toFixed(2)}), vec2(b, a));
      float radius = mix(${RIDGE_CANOPY_PROFILE.radius[0].toFixed(2)},
        ${RIDGE_CANOPY_PROFILE.radius[1].toFixed(2)}, c);
      vec2 shaped = rotated / (axes * radius);
      float shoulder = max(0.0, 1.0 - dot(shaped, shaped));
      float weight = mix(${RIDGE_CANOPY_PROFILE.amplitude[0].toFixed(2)},
        ${RIDGE_CANOPY_PROFILE.amplitude[1].toFixed(2)}, fract(a + d)) * shoulder * shoulder;
      uncovered *= 1.0 - weight;
      weightSum += weight;
      speciesSum += weight * a;
    }
  }
  return vec2(1.0 - uncovered, speciesSum / max(weightSum, 0.0001));
}

void main() {
  #include <logdepthbuf_fragment>
  vec3 normal = normalize(vRidgeNormal);
  // Metre-space geology, stable on the mountain's rest mesh. The existing
  // paired surface control can remove this finish without reloading the page.
  vec3 p = vRidgePosition;
  // Two continuous vertical projections avoid both an angular seam and the
  // collapsed stripes of one oblique planar projection around a whole ring.
  float faceWeight = abs(normal.x) / max(0.001, abs(normal.x) + abs(normal.z));
  vec3 detailedAlbedo;
  float relief;
  // Scales the aerial term; only the far range's lower band sets it below 1.
  float aerialScale = 1.0;
  if (uWorldAnchored > 0.5 && uWoodlandStrength > 0.5) {
    // Continuous stands carry quieter variation than the former thresholded
    // meadow/forest product. Bounded noise fields and nine crown candidates
    // remain fixed in metres on the real slopes, without extra tree draws.
    vec2 drift = vec2(ridgeNoise(p.xz * 0.012 + vec2(2.0, 9.0)),
      ridgeNoise(p.xz * 0.012 + vec2(23.0, 1.0))) - 0.5;
    vec2 grove = p.xz + drift * 9.0;
    float stand = ridgeFbm(grove * 0.027 + vec2(17.2, 3.4));
    vec2 canopy = ridgeCanopy(grove * 0.27);
    float needles = ridgeNoise(grove * 0.71 + p.y * 0.07);
    float footprint = max(length(dFdx(p.xz)), length(dFdy(p.xz)));
    float crownVisibility = 1.0 - smoothstep(0.45, 1.8, footprint);
    float crown = mix(0.5, canopy.x * (0.75 + needles * 0.5),
      crownVisibility);
    float gentleSlope = smoothstep(0.70, 0.97, abs(normal.y));
    float glade = smoothstep(0.69, 0.90, stand) * gentleSlope * gentleSlope;
    vec3 woodland = mix(vec3(0.047, 0.074, 0.046), vec3(0.067, 0.092, 0.052), stand);
    woodland = mix(woodland, vec3(0.079, 0.110, 0.060), glade * 0.6);
    float speciesTone = mix(1.0, 0.96 + canopy.y * 0.08, crownVisibility * min(crown, 1.0));
    // Stand-scale clumps (RIDGE_FIELD_PROFILE.clump): groups of crowns that
    // still resolve where single crowns do not, so a wood carries canopy
    // texture rather than reading as one flat dark oval.
    float clumpVisibility = 1.0 - smoothstep(${RIDGE_FIELD_PROFILE.clumpFootprint[0].toFixed(2)},
      ${RIDGE_FIELD_PROFILE.clumpFootprint[1].toFixed(2)}, footprint);
    float clump = mix(0.5, ridgeNoise(grove * ${RIDGE_FIELD_PROFILE.clumpScale[0].toFixed(3)} + vec2(4.1, 7.3)) * 0.6
      + ridgeNoise(grove * ${RIDGE_FIELD_PROFILE.clumpScale[1].toFixed(3)} + vec2(1.3, 2.9)) * 0.4, clumpVisibility);
    detailedAlbedo = woodland * (${RIDGE_FIELD_PROFILE.crownTone[0].toFixed(2)}
      + crown * ${RIDGE_FIELD_PROFILE.crownTone[1].toFixed(2)}) * speciesTone
      * (${(1 - RIDGE_FIELD_PROFILE.clump).toFixed(2)} + clump * ${(RIDGE_FIELD_PROFILE.clump * 2).toFixed(2)});
    float ledge = (1.0 - smoothstep(0.58, 0.84, abs(normal.y)))
      * smoothstep(0.36, 0.68, stand);
    detailedAlbedo = mix(detailedAlbedo, vec3(0.085, 0.092, 0.077)
      * (0.92 + needles * 0.12), ledge * 0.38);
    // Sub-metre canopy relief across roughly 3.7m crowns, below the existing
    // crest undulation. Sub-pixel relief fades out with the same field.
    relief = (crown * ${RIDGE_FIELD_PROFILE.crownReliefMetres.toFixed(2)} * crownVisibility
      + (clump - 0.5) * ${RIDGE_FIELD_PROFILE.clumpReliefMetres.toFixed(2)} * clumpVisibility) * uDetailStrength;
    // Hedged parcels on gentle ground (RIDGE_FIELD_PROFILE). A rotated grid
    // wobbled by the existing drift field, so boundaries are not ruled lines.
    // Each parcel is pasture, hay or left wooded; steep banks stay woodland.
    // Working if the village hill reads as fields, hedges and trees.
    vec2 fieldQ = vec2(dot(p.xz, vec2(0.82, 0.57)), dot(p.xz, vec2(-0.57, 0.82))) + drift * 16.0;
    vec2 fieldSize = vec2(${RIDGE_FIELD_PROFILE.cell[0].toFixed(1)}, ${RIDGE_FIELD_PROFILE.cell[1].toFixed(1)});
    vec2 fieldId = floor(fieldQ / fieldSize);
    vec2 fieldEdge = min(fract(fieldQ / fieldSize), 1.0 - fract(fieldQ / fieldSize)) * fieldSize;
    float edge = min(fieldEdge.x, fieldEdge.y);
    float edgeAa = max(fwidth(edge), 0.05);
    // Coverage-weighted: once a hedge is under a pixel wide it thins in tone
    // rather than widening into a dark road across the hill.
    float hedge = (1.0 - smoothstep(${RIDGE_FIELD_PROFILE.hedgeMetres.toFixed(2)} - edgeAa,
      ${RIDGE_FIELD_PROFILE.hedgeMetres.toFixed(2)} + edgeAa, edge))
      * min(1.0, ${RIDGE_FIELD_PROFILE.hedgeMetres.toFixed(2)} / edgeAa);
    float parcelUse = ridgeHash(fieldId + vec2(3.7, 11.1));
    // Farmed/wooded edge across the terrace rows (RIDGE_FIELD_PROFILE.slopeGate).
    // The fbm's working range is about 0.3-0.7, so 2.5 normalises it to +/-1.
    float woodEdge = (ridgeFbm(p.xz * 0.02 + vec2(6.1, 2.7)) - 0.5)
      * ${(RIDGE_FIELD_PROFILE.edgeBreak * 2.5).toFixed(3)};
    // Both wood outlines wander slowly (RIDGE_FIELD_PROFILE.rag, ragScale): on
    // the fbm alone a copse was a smooth oval, which read as a hole; a 9 m rag
    // turned every outline into camouflage.
    float rag = (ridgeNoise(p.xz * ${RIDGE_FIELD_PROFILE.ragScale.toFixed(3)} + vec2(5.1, 1.7)) - 0.5)
      * ${RIDGE_FIELD_PROFILE.rag.toFixed(2)};
    float copseField = ridgeFbm(p.xz * ${RIDGE_FIELD_PROFILE.standScale[1].toFixed(3)} + vec2(12.3, 4.9)) + rag * 0.7;
    float copse = smoothstep(${RIDGE_FIELD_PROFILE.copse[0].toFixed(2)}, ${RIDGE_FIELD_PROFILE.copse[1].toFixed(2)},
      copseField);
    // A wooded parcel's stand draws back from its boundary into ragged woods,
    // leaving a hedged margin of pasture. Wooded whole, it was an unhedged block
    // whose grid edge lay near-horizontal on screen: a ruled band across the
    // village hill (art3land-after-med12, village (0,300)-(1060,425)).
    float margin = 1.0 - smoothstep(0.0, 14.0, edge);
    float woodParcel = 1.0 - step(0.4, parcelUse);
    float woodsField = ridgeFbm(p.xz * ${RIDGE_FIELD_PROFILE.standScale[0].toFixed(3)} + vec2(2.2, 8.4))
      + 0.12 - margin * 0.3 + rag;
    float woods = woodParcel * smoothstep(${RIDGE_FIELD_PROFILE.woodsEdge[0].toFixed(2)},
      ${RIDGE_FIELD_PROFILE.woodsEdge[1].toFixed(2)}, woodsField);
    // Outside each stand line a lighter fringe of scrub with scattered trees
    // thins out into the field, instead of the canopy stopping on a dark rim.
    float fringe = max(woodParcel * smoothstep(${(RIDGE_FIELD_PROFILE.woodsEdge[0] - RIDGE_FIELD_PROFILE.fringe).toFixed(3)},
      ${(RIDGE_FIELD_PROFILE.woodsEdge[0] + 0.01).toFixed(3)}, woodsField),
      smoothstep(${(RIDGE_FIELD_PROFILE.copse[0] - RIDGE_FIELD_PROFILE.fringe).toFixed(3)},
        ${(RIDGE_FIELD_PROFILE.copse[0] + 0.01).toFixed(3)}, copseField))
      * (1.0 - max(copse, woods));
    float strays = fringe * smoothstep(0.58, 0.74, ridgeNoise(grove * 0.2 + vec2(8.8, 3.1)))
      * (1.0 - smoothstep(${RIDGE_FIELD_PROFILE.strayFootprint[0].toFixed(2)},
        ${RIDGE_FIELD_PROFILE.strayFootprint[1].toFixed(2)}, footprint));
    float farmed = smoothstep(${RIDGE_FIELD_PROFILE.slopeGate[0].toFixed(2)}, ${RIDGE_FIELD_PROFILE.slopeGate[1].toFixed(2)},
      abs(normal.y) + woodEdge) * (1.0 - copse) * (1.0 - woods) * (1.0 - strays);
    vec3 crop = mix(${glslVec3(RIDGE_FIELD_PROFILE.pasture)}, ${glslVec3(RIDGE_FIELD_PROFILE.hay)},
      step(0.8, parcelUse) * (0.6 + 0.4 * ridgeHash(fieldId + vec2(9.2, 1.4))));
    crop *= 0.9 + stand * 0.14 + (ridgeHash(fieldId + vec2(5.5, 2.2)) - 0.5) * 0.16;
    crop = mix(crop, ${glslVec3(RIDGE_FIELD_PROFILE.scrub)} * (0.9 + needles * 0.2), fringe * 0.75);
    float openField = farmed * (1.0 - hedge);
    vec3 hedgerow = ${glslVec3(RIDGE_FIELD_PROFILE.woodland)} * (0.85 + needles * 0.2);
    detailedAlbedo = mix(detailedAlbedo, hedgerow, farmed * hedge);
    detailedAlbedo = mix(detailedAlbedo, crop, openField);
    relief = mix(relief, 0.0, openField) + farmed * hedge * 0.35 * uDetailStrength;
    // Moonlight and dusk carry tone, not hue (RIDGE_FIELD_PROFILE.night). Hay
    // and pasture differ mostly in red, which a dim blue key under a warm
    // twilight inscatter turns into purple and red parcels: large straight-
    // edged facets across the village hill at 18:30-22:00 (final3-med-19).
    // Toward night each parcel takes one shared hue, then (later, so dusk
    // keeps its patchwork and hedgerows) a compressed luminance step, and the
    // canopy relief settles with it.
    vec3 fieldMean = ${glslVec3(RIDGE_FIELD_PROFILE.nightTone)};
    float fieldTone = dot(detailedAlbedo, vec3(0.2126, 0.7152, 0.0722))
      / dot(fieldMean, vec3(0.2126, 0.7152, 0.0722));
    float fieldKeep = mix(${RIDGE_FIELD_PROFILE.nightVariation.toFixed(2)}, 1.0, uFieldTone);
    detailedAlbedo = mix(fieldMean, mix(fieldMean * fieldTone, detailedAlbedo, uFieldDaylight), fieldKeep);
    relief *= fieldKeep;
  } else if (uWorldAnchored < 0.5 && uAlpineStrength > 0.5) {
    // Retain the true mineral vertex palette under deposited snow.
    // Subordinate isotropic mineral variation leaves the real peak-rooted
    // buttresses in charge of the large planes, without painted vertical pleats.
    float drift = (ridgeNoise(p.xz * 0.018) - 0.5) * 4.0;
    float footprint = max(length(dFdx(p)), length(dFdy(p)));
    float fineVisibility = 1.0 - smoothstep(0.7, 2.4, footprint);
    vec2 projectionX = vec2((p.x + drift) * 0.065, p.y * 0.065);
    vec2 projectionZ = vec2((p.z + drift) * 0.065, p.y * 0.065);
    float coarse = mix(ridgeNoise(projectionX), ridgeNoise(projectionZ), faceWeight);
    float veins = mix(coarse,
      mix(ridgeFbm(projectionX), ridgeFbm(projectionZ), faceWeight), fineVisibility);
    veins = mix(0.5, veins, 1.0 - smoothstep(2.4, 6.0, footprint));
    float strata = mix(0.5, mix(ridgeNoise(p.xy * vec2(0.075, 0.14)),
      ridgeNoise(p.zy * vec2(0.075, 0.14)), faceWeight), fineVisibility);
    float scree = mix(0.5, ridgeNoise(p.xz * 0.22 + p.y * 0.06), fineVisibility);
    float rock = smoothstep(0.38, 0.74,
      vRidgeHeight + (ridgeNoise(p.xz * 0.055) - 0.5) * 0.18);
    // Lower slopes: stands of scrub in the forest and rock outcrops on the
    // steeper faces, and a substrate edge broken across the whole snow band
    // (RIDGE_ALPINE_PROFILE.substrateRamp) instead of a fixed-height cut.
    // Working if the overview range carries geology from crest to foothills.
    float scrub = ridgeFbm(p.xz * 0.021 + vec2(p.y * 0.013, 4.1));
    // The vertex snow attribute saturates 6 m either side of the datum, so any
    // ramp on it is a fixed-altitude cut: a ruled line on a camera-locked ring.
    // Read the unclamped altitude in the same units and break it by tens of
    // metres with an 80 m field plus the veins. Working if the snow line and
    // substrate edge wander across the overview range instead of ruling it.
    float snowAltitude = clamp((p.y - uSnowDatum) / 12.0 + 0.5, -3.0, 4.0);
    // The fbm's working range is about 0.3-0.7, so 3.2 and 1.0 normalise the
    // two fields to roughly +/-1 snow unit before the metre scale.
    float snowBreak = ((ridgeFbm(p.xz * 0.012 + vec2(3.3, 8.1)) - 0.5) * 3.2 + (veins - 0.5) * 1.0)
      * ${(RIDGE_ALPINE_PROFILE.snowBreakMetres / 12).toFixed(3)};
    // Fall-line spurs and gullies: stretched five to one down the slope, on
    // the same two vertical projections as the veins. Conifers keep to the
    // gullies, meadow and scrub to the spurs. Working if the overview's lower
    // band shows lit ribs and dark runnels under the haze instead of a slab.
    float spur = mix(ridgeNoise(vec2((p.x + drift) * 0.04, p.y * 0.008)),
      ridgeNoise(vec2((p.z + drift) * 0.04, p.y * 0.008)), faceWeight);
    vec3 vegetation = mix(${glslVec3(RIDGE_ALPINE_PROFILE.lowland[0])},
      ${glslVec3(RIDGE_ALPINE_PROFILE.lowland[1])},
      smoothstep(0.3, 0.74, scrub * 0.55 + spur * 0.45))
      * (0.9 + ridgeNoise(p.xz * 0.07) * 0.2);
    vec3 mineral = vRidgeColor * mix(${RIDGE_ALPINE_PROFILE.mineralShade[0].toFixed(2)},
      ${RIDGE_ALPINE_PROFILE.mineralShade[1].toFixed(2)}, 0.42 + veins * 0.28 + strata * 0.18)
      * (0.93 + scree * 0.12);
    float outcrop = smoothstep(${RIDGE_ALPINE_PROFILE.outcrop[0].toFixed(2)},
      ${RIDGE_ALPINE_PROFILE.outcrop[1].toFixed(2)}, veins + (scree - 0.5) * 0.3)
      * (1.0 - smoothstep(0.78, 0.95, normal.y)) * 0.85;
    float substrate = smoothstep(${RIDGE_ALPINE_PROFILE.substrateRamp[0].toFixed(2)},
      ${RIDGE_ALPINE_PROFILE.substrateRamp[1].toFixed(2)},
      snowAltitude + snowBreak + (veins - 0.5) * ${RIDGE_ALPINE_PROFILE.substrateBreak.toFixed(2)}
      + (scrub - 0.5) * 0.3);
    vec3 lowSlope = mix(vegetation, ${glslVec3(RIDGE_ALPINE_PROFILE.outcropAlbedo)}
      * (0.88 + scree * 0.24), outcrop);
    detailedAlbedo = mix(lowSlope, mineral, max(rock, substrate));
    // Spurs and couloirs cut the rock as well as the forest: under the big
    // massifs vRidgeHeight puts rock at ~1 down to the foot, so a vegetation-
    // only term left the overview band unchanged. The whole band below the
    // snow line takes lit ribs and darker runnels.
    float lowBand = 1.0 - smoothstep(-0.2, 0.6, snowAltitude + snowBreak);
    // Thinner haze below the snow line (RIDGE_ALPINE_PROFILE.lowBandAerial),
    // so that relief reaches the screen. Full at the snow, the upper rock and
    // the crest rows (radial run from the ring's foot), which keep the
    // horizon's air; the ramp rides the broken snow altitude, so no line.
    // Working if on/off/on (uLowAerialStrength) moves only the lower band.
    float ringRun = clamp((length(p.xz) - uRingRadius) / max(uSlopeDepth, 1.0), 0.0, 1.0);
    float belowSnow = 1.0 - smoothstep(${RIDGE_ALPINE_PROFILE.lowBandRamp[0].toFixed(2)},
      ${RIDGE_ALPINE_PROFILE.lowBandRamp[1].toFixed(2)}, snowAltitude + snowBreak);
    aerialScale = mix(1.0, ${RIDGE_ALPINE_PROFILE.lowBandAerial.toFixed(2)}, belowSnow
      * (1.0 - smoothstep(${RIDGE_ALPINE_PROFILE.crestGuard[0].toFixed(2)},
        ${RIDGE_ALPINE_PROFILE.crestGuard[1].toFixed(2)}, ringRun)) * uLowAerialStrength * uClearAir);
    // At 540 m the band's lit radiance is ~0.03 linear under a ~0.23
    // inscatter, so only an albedo span survives the haze: pale scree on the
    // ribs (RIDGE_ALPINE_PROFILE.ribAlbedo), dark forest down the runnels.
    // The 15 m veins break the 25 m spurs, so ribs end in scree fans instead
    // of running as soft vertical curtains that read as rain.
    float gully = spur * 0.6 + veins * 0.4;
    float rib = smoothstep(0.55, 0.66, gully) * lowBand;
    float runnel = (1.0 - smoothstep(0.34, 0.45, gully)) * lowBand;
    detailedAlbedo = mix(detailedAlbedo, ${glslVec3(RIDGE_ALPINE_PROFILE.ribAlbedo)}
      * (0.88 + scree * 0.24), rib * 0.8);
    detailedAlbedo = mix(detailedAlbedo, ${glslVec3(RIDGE_ALPINE_PROFILE.lowland[0])}, runnel * 0.7);
    float snowPotential = smoothstep(0.35, 0.65,
      snowAltitude + snowBreak) * uSnowStrength;
    float shoulder = smoothstep(0.35, 0.72, max(0.0, normal.y));
    float pocket = smoothstep(0.48, 0.76, veins) * smoothstep(0.04, 0.32, normal.y);
    float accumulation = clamp(${RIDGE_ALPINE_PROFILE.steepSnow.toFixed(2)}
      + shoulder * ${RIDGE_ALPINE_PROFILE.shoulderSnow.toFixed(2)}
      + pocket * ${RIDGE_ALPINE_PROFILE.gullySnow.toFixed(2)}, 0.0, 1.0);
    // Keep recognizable upper caps even where a sharp summit normal is steep.
    // The original potential still excludes all lower ground from snow.
    float summit = smoothstep(0.76, 0.91, vRidgeHeight + (veins - 0.5) * 0.08) * 0.40;
    float snow = snowPotential * max(accumulation, summit);
    vec3 settledSnow = mix(vec3(0.70, 0.78, 0.86), vec3(0.84, 0.88, 0.92),
      0.55 + veins * 0.22);
    detailedAlbedo = mix(detailedAlbedo, settledSnow, snow);
    relief = (veins * ${RIDGE_ALPINE_PROFILE.reliefMetres.toFixed(2)}
      + strata * 0.08 + scree * 0.025 * fineVisibility
      + (spur - 0.5) * ${RIDGE_ALPINE_PROFILE.spurMetres.toFixed(2)} * lowBand)
      * uDetailStrength * (1.0 - snow * 0.85);
  } else {
    // Retain the far range's geology/snow exactly. The private woodland control
    // also admits the previous wooded finish for a same-page paired comparison.
    float rock = smoothstep(0.48, 0.84,
      vRidgeHeight + (ridgeNoise(p.xz * 0.055) - 0.5) * 0.22) * (1.0 - uWorldAnchored);
    float forest = ridgeFbm(p.xz * 0.18 + p.y * 0.045);
    float veins = mix(ridgeFbm(p.xy * vec2(0.11, 0.16)),
      ridgeFbm(p.zy * vec2(0.11, 0.16)), faceWeight);
    float scree = ridgeFbm(p.xz * 0.48 + p.y * 0.62 + veins * 3.0);
    float meadow = smoothstep(0.42, 0.68, ridgeFbm(p.xz * 0.043));
    // Separate broad meadow and woodland patches from the mineral upper slopes.
    // These values are linear albedo, before lighting and atmospheric extinction.
    // Working if the paired surface control removes the patches without changing the silhouette.
    // The foothills are wooded, with clearings rather than a bright meadow
    // blanket. Reuse the two existing scales, so the finish keeps its sample budget.
    float clearing = meadow * smoothstep(0.42, 0.66, forest);
    vec3 vegetation = mix(vec3(0.054, 0.084, 0.050),
      vec3(0.101, 0.139, 0.085), clearing);
    float finish = mix(0.88 + forest * 0.32, 0.4 + veins * 0.8 + scree * 0.32, rock);
    detailedAlbedo = mix(vegetation, vRidgeColor, rock) * finish;
    // Preserve snow through the mineral finish. Shallow shoulders retain cover,
    // steep faces expose rock; gullies soften the boundary without more samples.
    // Working if far caps read white while fixed low foothills remain wooded.
    float snow = smoothstep(0.35, 0.65, vRidgeSnow + (veins - 0.5) * 0.25)
      * (0.84 + 0.16 * smoothstep(0.08, 0.70, normal.y)) * uSnowStrength;
    detailedAlbedo = mix(detailedAlbedo, vec3(0.81, 0.86, 0.91) * (0.92 + scree * 0.08), snow);
    relief = mix(forest * 0.32, veins * 0.7 + scree * 0.16, rock) * uDetailStrength * (1.0 - snow * 0.8);
  }
  vec3 albedo = mix(vRidgeColor, detailedAlbedo, uDetailStrength);
  vec3 dx = dFdx(p), dy = dFdy(p);
  vec3 rx = cross(dy, normal), ry = cross(normal, dx);
  float determinant = dot(dx, rx);
  if (abs(determinant) > 0.000001) {
    normal = normalize(abs(determinant) * normal - sign(determinant) *
      (dFdx(relief) * rx + dFdy(relief) * ry));
  }
  float ndl = clamp(dot(normal, uSunDirection) * 0.5 + 0.5, 0.0, 1.0);
  // Existing sky fill keeps alpine shadow planes readable without halving
  // directional incidence. Working if bare-rock planes retain sun-facing
  // contrast while woodland and the legacy comparison keep their exact light.
  if (uWorldAnchored < 0.5 && uAlpineStrength > 0.5) {
    float alpineSun = smoothstep(0.0, 0.20, uSunDirection.y);
    ndl = mix(ndl, max(0.0, dot(normal, uSunDirection)), alpineSun);
  }
  vec3 lit = albedo * mix(uShadowTint, uSunColor, pow(ndl, 0.9));

  // The fixed foothills take their haze from distance, not from which ring
  // they are (RIDGE_ANCHORED_AERIAL). A constant 0.1 / 0.2 per ring drew a
  // hard step wherever the near crest overlaps the mid ring: the village seam,
  // and in rain (0.28 / 0.53) a pale band with dark near hilltops floating on
  // it. The two ends follow each ring's weather-damped weight.
  float aerial = uAerial;
  if (uWorldAnchored > 0.5) {
    float aerialRun = clamp((vRidgeDistance - ${RIDGE_ANCHORED_AERIAL.distances[0].toFixed(1)})
      / ${(RIDGE_ANCHORED_AERIAL.distances[1] - RIDGE_ANCHORED_AERIAL.distances[0]).toFixed(1)},
      ${RIDGE_ANCHORED_AERIAL.run[0].toFixed(2)}, ${RIDGE_ANCHORED_AERIAL.run[1].toFixed(2)});
    // Never hazier than the far range's lower band behind it, which clear air
    // thins to lowBandAerial (getAnchoredRidgeAerial).
    float anchoredAerial = min(uAnchoredAerial.z * mix(${RIDGE_ALPINE_PROFILE.lowBandAerial.toFixed(2)}, 1.0, 1.0 - uClearAir),
      max(0.0, mix(uAnchoredAerial.x, uAnchoredAerial.y, aerialRun)));
    // Behind the far crest, never clearer than the range in front of it,
    // whose crest rows keep the full far weight (RIDGE_BEHIND_RANGE_HAZE).
    float behindRange = smoothstep(uRingRadius + uSlopeDepth + ${RIDGE_BEHIND_RANGE_HAZE.ramp[0].toFixed(1)},
      uRingRadius + uSlopeDepth + ${RIDGE_BEHIND_RANGE_HAZE.ramp[1].toFixed(1)}, vRidgeGroundDistance);
    anchoredAerial = mix(anchoredAerial, max(anchoredAerial, uAnchoredAerial.z), behindRange);
    aerial = mix(uAerial, anchoredAerial, uDistanceAerialStrength);
  }
  lit.r = mix(lit.r, uInscatter.r, clamp(aerial * aerialScale * 0.80, 0.0, 1.0));
  lit.g = mix(lit.g, uInscatter.g, clamp(aerial * aerialScale * 1.00, 0.0, 1.0));
  lit.b = mix(lit.b, uInscatter.b, clamp(aerial * aerialScale * 1.20, 0.0, 1.0));

  // Valley haze. Air pools in the valleys, so they sit further back than the
  // peaks that rise out of it - the cue that turns a silhouette into a range.
  // Leave the snow shoulders clear while a cool veil settles between massifs.
  // The far range's 0.28 veil sat on top of its 0.32 aerial term and pressed
  // the lower band to one blue-grey slab (overview, final-med-12); 0.2 keeps
  // the valley veil and lets the lowland geology through.
  // Fixed wooded hills keep more contrast than the remote range.
  float valleyAir = (1.0 - smoothstep(0.18, 0.82, vRidgeHeight)) *
    aerial * mix(0.2, 0.16, uWorldAnchored);
  lit = mix(lit, uInscatter, valleyAir);
  // Solid land always writes depth. A height-based alpha feather exposed sky
  // through overlapping foothills below 15 m, creating floating ribbons.
  // Blend distant colour into the atmosphere without cutting holes in terrain.
  // Working if the lake-camera regression ray meets opaque land at every height.
  float horizonFade = uWorldAnchored * smoothstep(
    ${FOG_HORIZON_START.toFixed(1)}, ${(FOG_HORIZON_END - 32).toFixed(1)}, vRidgeDistance);
  lit = mix(lit, uInscatter, horizonFade);
  gl_FragColor = vec4(lit, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const moonVertexShader = `
varying vec3 vObjectPosition;
varying vec3 vViewNormal;

void main() {
  vObjectPosition = normalize(position);
  vViewNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const moonFragmentShader = `
uniform float opacity;
varying vec3 vObjectPosition;
varying vec3 vViewNormal;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0)), f.x), f.y),
    f.z
  );
}

float crater(vec3 position, vec3 centre, float radius) {
  float distanceToCentre = length(position - centre);
  float bowl = 1.0 - smoothstep(0.0, radius * 0.72, distanceToCentre);
  float rim = smoothstep(radius * 0.72, radius, distanceToCentre) *
      (1.0 - smoothstep(radius, radius * 1.18, distanceToCentre));
  return bowl * 0.42 - rim * 0.24;
}

void main() {
  vec3 position = normalize(vObjectPosition);
  // Soft, low-contrast maria and shallow craters: at its ~70 px display size
  // a high-contrast disc read as blotches (two crater 'eyes' over a dark
  // mare 'mouth' at 18:30). The full moon's maria are ~0.8 of the highlands.
  float maria = smoothstep(0.36, 0.74, noise(position * 2.1) + noise(position * 5.4) * 0.22);
  float surface = noise(position * 18.0) * 0.13 + noise(position * 37.0) * 0.06;
  float craters =
      crater(position, normalize(vec3(0.32, 0.18, 0.93)), 0.2) +
      crater(position, normalize(vec3(-0.48, 0.36, 0.8)), 0.16) +
      crater(position, normalize(vec3(0.62, -0.34, 0.7)), 0.12) +
      crater(position, normalize(vec3(-0.2, -0.58, 0.79)), 0.1);
  vec3 highland = vec3(0.78, 0.8, 0.79);
  vec3 lowland = vec3(0.5, 0.54, 0.56);
  vec3 colour = mix(highland, lowland, maria * 0.6);
  colour *= 0.86 + surface * 0.6 - craters * 0.12;
  float facing = clamp(vViewNormal.z, 0.0, 1.0);
  colour *= 0.58 + pow(facing, 0.32) * 0.46;
  colour += vec3(0.2, 0.28, 0.38) * pow(1.0 - facing, 3.0) * 0.16;
  gl_FragColor = vec4(clamp(colour, 0.0, 1.0), opacity);
  #include <colorspace_fragment>
}
`;

function createRadialGlowTexture(size: number): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x + 0.5) / size - 0.5;
      const dy = (y + 0.5) / size - 0.5;
      const distance = Math.sqrt(dx * dx + dy * dy) * 2;
      const alpha = Math.pow(Math.max(0, 1 - distance), 2.4);
      const offset = (y * size + x) * 4;
      data[offset] = 255;
      data[offset + 1] = 255;
      data[offset + 2] = 255;
      data[offset + 3] = Math.round(alpha * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Sun disc size.
 *
 * At the former 345 m distance the original 5.2 radius subtended 1.73 degrees and
 * read as a cartoon blob. The later 2.2 radius was physically restrained but
 * disappeared inside the analytic Mie glare at normal display resolution.
 * 3.4 subtends 1.13 degrees: deliberately stylised, legible beside the authored
 * moon, and still compact enough to retain a crisp glare silhouette.
 * The parent group preserves that angular size at the remote celestial distance.
 */
const sunGeometry = new THREE.SphereGeometry(3.4, 24, 16);
const sunGlowGeometry = new THREE.SphereGeometry(5.6, 20, 14);
const moonGeometry = new THREE.SphereGeometry(7.4, 32, 24);
const SKY_RADIUS = 180;
// Module-level like the sun and moon geometries: shared across remounts and
// intentionally never disposed (the sky group opts out with dispose={null}).
const skyDomeGeometry = new THREE.SphereGeometry(SKY_RADIUS, 28, 16);
export const CELESTIAL_RADIUS = 930;
const CELESTIAL_SCALE = CELESTIAL_RADIUS / 345;
const STAR_RADIUS = 950;
const radialGlowTexture = createRadialGlowTexture(64);
const sunCoreMaterial = new THREE.MeshBasicMaterial({
  color: '#fff0b3',
  fog: false,
  toneMapped: false,
  transparent: true,
  opacity: 1,
  depthWrite: false,
});
const sunGlowMaterial = new THREE.MeshBasicMaterial({
  color: '#ffcf72',
  fog: false,
  toneMapped: false,
  transparent: true,
  opacity: 0.46,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
const sunHaloMaterial = new THREE.SpriteMaterial({
  map: radialGlowTexture,
  color: '#ffc05c',
  transparent: true,
  opacity: 0.34,
  blending: THREE.AdditiveBlending,
  depthTest: true,
  depthWrite: false,
  toneMapped: false,
  // `SpriteMaterial` defaults `fog` to true and three's sprite shader does
  // include the fog chunk, so this sprite - camera-locked at 345, i.e. past
  // where any fog model has saturated - was additively blending the FOG COLOUR
  // rather than its own gold. The sun's halo was the horizon's colour all day.
  fog: false,
});
const moonMaterial = new THREE.ShaderMaterial({
  name: 'MillOS Procedural Moon',
  vertexShader: moonVertexShader,
  fragmentShader: moonFragmentShader,
  uniforms: { opacity: { value: 0 } },
  transparent: true,
  depthTest: true,
  depthWrite: false,
  fog: false,
  toneMapped: false,
});
moonMaterial.customProgramCacheKey = () => 'millos-procedural-moon-v2';
const moonHaloMaterial = new THREE.SpriteMaterial({
  map: radialGlowTexture,
  color: '#9fc8f2',
  transparent: true,
  opacity: 0,
  blending: THREE.AdditiveBlending,
  depthTest: true,
  depthWrite: false,
  toneMapped: false,
  fog: false,
});

function createStarGeometry(count: number, angleOffset: number): THREE.BufferGeometry {
  const positions = new Float32Array(count * 3);
  const colours = new Float32Array(count * 3);
  const tints = [
    new THREE.Color('#ffffff'),
    new THREE.Color('#dcecff'),
    new THREE.Color('#fff0d2'),
    new THREE.Color('#c8dcff'),
  ];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let index = 0; index < count; index += 1) {
    const normalizedY = count === 1 ? 0.5 : index / (count - 1);
    const vertical = 0.02 + normalizedY * 0.96;
    const radial = Math.sqrt(1 - vertical * vertical);
    const angle = index * goldenAngle + angleOffset;
    positions[index * 3] = Math.cos(angle) * radial * STAR_RADIUS;
    positions[index * 3 + 1] = vertical * STAR_RADIUS;
    positions[index * 3 + 2] = Math.sin(angle) * radial * STAR_RADIUS;
    const tint = tints[index % tints.length];
    colours[index * 3] = tint.r;
    colours[index * 3 + 1] = tint.g;
    colours[index * 3 + 2] = tint.b;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

const starGeometry = createStarGeometry(640, 0);
const brightStarGeometry = createStarGeometry(48, 0.73);

interface MountainRidgeSpec {
  radius: number;
  baseY: number;
  /** Close the optical backdrop below the real terrain and river bed. */
  baseClosureY?: number;
  minHeight: number;
  maxHeight: number;
  slopeDepth: number;
  valleyFloor: number;
  snowLine: number;
  seed: number;
  colors: readonly [string, string, string];
  rollingHills?: boolean;
  /** Broad far-face basin depth; the original foot, crest and envelope stay exact. */
  alpineReliefMetres?: number;
}

/**
 * Angular resolution of one ridge ring.
 *
 * Raised from 192. At a ring radius of 248 to 318 world units, 192 segments put
 * a facet edge every 1.875 degrees, which is plainly visible as straight
 * chords along a summit. 384 halves that, and the whole backdrop is still only
 * 19,635 vertices across all three rings - nothing at a 60k-245k triangle
 * budget. Exported because the geometry test asserts ring closure at the
 * final segment and must not hard-code the number.
 */
export const MOUNTAIN_RIDGE_SEGMENTS = 384;
export const MOUNTAIN_RIDGE_ROWS = 17;

/**
 * A deterministic inward-facing mountain slope preserves the authored horizon
 * in one compact draw per depth layer. Seventeen radial terraces create real depth
 * from the site to the summit, while continuous periodic profiles close the
 * ring without a horizon seam.
 *
 * Emits three attributes: `position`, `color` (TRUE ALBEDO - forest, rock,
 * snow, with no aerial perspective baked in, because the material applies that
 * per channel at runtime), and `ridgeHeight`, the normalised terrace height the
 * material uses to pool haze in the valleys.
 */
export function createMountainRidgeGeometry({
  radius,
  baseY,
  baseClosureY,
  minHeight,
  maxHeight,
  slopeDepth,
  valleyFloor,
  snowLine,
  seed,
  colors,
  rollingHills = false,
  alpineReliefMetres = 0,
}: MountainRidgeSpec): THREE.BufferGeometry {
  const segments = MOUNTAIN_RIDGE_SEGMENTS;
  const backRows = rollingHills ? 6 : 0;
  const rows = MOUNTAIN_RIDGE_ROWS + backRows;
  const positions: number[] = [];
  const vertexColors: number[] = [];
  const ridgeHeights: number[] = [];
  const ridgeSnow: number[] = [];
  const indices: number[] = [];
  const palette = colors.map((color) => new THREE.Color(color));

  const columns = Array.from({ length: segments }, (_, index) => {
    const progress = index / segments;
    const angle = progress * Math.PI * 2;
    // Broad positive lobes form separated massifs. Sharper ridged harmonics
    // break each massif into individual peaks, while the very low valley floor
    // lets the terrain hide the ring between ranges instead of exposing a
    // continuous horizontal shelf.
    const massif = Math.pow(Math.max(0, Math.sin(angle * 3 + seed * 0.7)), 2.2) * 0.48;
    const ridge =
      Math.pow(1 - Math.abs(Math.sin(angle * 7 - seed * 1.2)), 2.2) * 0.3 +
      Math.pow(1 - Math.abs(Math.sin(angle * 13 + seed * 2.1)), 3.4) * 0.16 +
      Math.pow(1 - Math.abs(Math.sin(angle * 23 - seed * 0.8)), 4) * 0.06;
    const rolling =
      (Math.sin(angle * 2 - seed) * 0.5 + 0.5) * 0.045 +
      (Math.sin(angle * 11 + seed * 1.4) * 0.5 + 0.5) * 0.025;
    // The far ring's raised valley is needed to hide the world seam. Adding
    // it to a full-amplitude massif then clamping flattened entire summits.
    // Fit the positive field (maximum 1.07) into the remaining vertical span.
    const floor = Math.max(0.025, valleyFloor);
    const hill =
      0.36 * (0.5 + 0.5 * Math.sin(angle * 3 + seed)) +
      0.3 * (0.5 + 0.5 * Math.sin(angle * 5 - seed * 1.3)) +
      0.19 * (0.5 + 0.5 * Math.sin(angle * 9 + seed * 2)) +
      0.1 * (0.5 + 0.5 * Math.sin(angle * 13 - seed));
    const profile =
      floor + (rollingHills ? hill : (rolling + massif + ridge) / 1.07) * (0.98 - floor);
    const height = THREE.MathUtils.lerp(minHeight, maxHeight, profile);
    const baseRadius =
      radius + Math.sin(angle * 5 + seed) * 1.5 + Math.sin(angle * 13 - seed) * 0.55;
    const facetTint =
      0.9 + Math.sin(angle * 11 + seed * 2.4) * 0.065 + Math.sin(angle * 23 - seed) * 0.032;

    return { angle, profile, height, baseRadius, facetTint };
  });
  // Root broad buttresses in the actual prominent skyline peaks. The previous
  // 47th-harmonic recess was narrower than one column and read as pleated cloth.
  // A few asymmetric, widening spurs leave connected basins between them.
  // Working if the existing grid shades as planes descending from real peaks,
  // while the optical silhouette, buried closure and grounded rings stay exact.
  const circularDistance = (a: number, b: number) => {
    const distance = Math.abs(a - b) % segments;
    return Math.min(distance, segments - distance);
  };
  const peaks: number[] = [];
  if (!rollingHills && alpineReliefMetres > 0) {
    const candidates = columns
      .map((column, index) => ({ ...column, index }))
      .filter(
        ({ height, index }) =>
          height > maxHeight * 0.28 &&
          height > columns[(index + segments - 1) % segments].height &&
          height >= columns[(index + 1) % segments].height
      )
      .sort((a, b) => b.height - a.height || a.index - b.index);
    for (const { index } of candidates) {
      if (peaks.every((peak) => circularDistance(peak, index) >= 20)) peaks.push(index);
      if (peaks.length === 10) break;
    }
  }

  for (let index = 0; index <= segments; index += 1) {
    const { angle, profile, height, baseRadius, facetTint } = columns[index % segments];
    for (let row = 0; row < rows; row += 1) {
      const risingRatio = Math.min(row, MOUNTAIN_RIDGE_ROWS - 1) / (MOUNTAIN_RIDGE_ROWS - 1);
      const descent = Math.max(0, row - MOUNTAIN_RIDGE_ROWS + 1) / Math.max(1, backRows);
      const heightRatio = risingRatio * (1 - THREE.MathUtils.smoothstep(descent, 0, 1));
      const radialRatio = rollingHills ? risingRatio : Math.pow(risingRatio, 1.55);
      // The former sinusoidal radial ripple reversed some lower terraces by
      // 1.79 m, producing back-facing holes. Keep wooded slopes monotonic and
      // close them behind the crest. Working if daytime village views have
      // continuous banks and every radial step advances toward the outer foot.
      const shoulderRipple = rollingHills
        ? slopeDepth *
          radialRatio *
          (Math.sin(angle * 9 + seed * 1.7) * 0.035 + Math.sin(angle * 19 + seed) * 0.055)
        : Math.sin(angle * 9 + seed * 1.7 + heightRatio * 0.6) * slopeDepth * heightRatio * 0.035 +
          Math.sin(angle * 19 + seed + heightRatio * 0.4) *
            slopeDepth *
            Math.sin(heightRatio * Math.PI) *
            0.12;
      const gully = Math.pow(1 - Math.abs(Math.sin(angle * 47 + seed + heightRatio * 0.8)), 5);
      const localRadius = baseRadius + slopeDepth * (radialRatio + descent * 0.72) + shoulderRipple;
      // Sub-metre canopy undulation breaks a mathematically smooth wooded
      // crest. It tapers off before the foot, preserving the terrain join,
      // and uses the existing segments rather than a ring of extra tree draws.
      const canopy = rollingHills
        ? Math.abs(Math.sin(angle * 71 + seed) * Math.sin(angle * 113 - seed)) *
          0.6 *
          THREE.MathUtils.smoothstep(heightRatio, 0.72, 1)
        : 0;
      const originalHeight =
        baseY +
        canopy +
        height * (heightRatio * 0.16 + Math.pow(heightRatio, 1.24) * 0.84) -
        ((1 - Math.cos(angle * 17 + seed)) * 0.028 + gully * 0.055) *
          height *
          Math.sin(heightRatio * Math.PI);
      let basin = 0;
      if (peaks.length && row > 0 && row < MOUNTAIN_RIDGE_ROWS - 1) {
        let support = 0;
        const widening = Math.pow(1 - heightRatio, 0.8);
        for (const peak of peaks) {
          const variation = Math.sin(peak * 1.7 + seed);
          for (const side of [-1, 1]) {
            const reach = side < 0 ? 12 + variation * 3 : 17 - variation * 4;
            const centre = peak + side * reach * widening;
            const width = 2 + (1 - heightRatio) * (side < 0 ? 3.2 : 4.6);
            const distance = circularDistance(index % segments, centre) / width;
            support = Math.max(support, Math.exp(-distance * distance * 1.4));
          }
        }
        basin =
          Math.min(30, Math.max(0, alpineReliefMetres), height * 0.25) *
          (1 - support) *
          Math.sin(heightRatio * Math.PI) ** 2 *
          THREE.MathUtils.smoothstep(originalHeight, 30, 90);
      }
      const terraceHeight = originalHeight - basin;
      // The 0.6 coupling preserves outward radial progress even where the
      // asymmetric branches turn into a basin. Working if every visible row
      // advances in both radius and altitude inside the original envelope.
      const carvedRadius = localRadius + basin * 0.6;
      positions.push(
        Math.cos(angle) * carvedRadius,
        row === 0 && baseClosureY !== undefined ? baseClosureY : terraceHeight,
        Math.sin(angle) * carvedRadius
      );
      // Combined so the haze pools where the ring is BOTH low on the slope and
      // in a valley of the profile, which is where real air collects.
      ridgeHeights.push(THREE.MathUtils.clamp(heightRatio * 0.55 + profile * 0.45, 0, 1));

      const rockBlend = THREE.MathUtils.smoothstep(heightRatio, 0.12, 0.78);
      // Altitude forms continuous caps instead of multiplying two dilute
      // summit masks. The fragment finish adds an irregular narrow snow edge.
      // Working if high visible peaks have cap interiors and low hills stay bare.
      const snowAmount = THREE.MathUtils.clamp(
        (terraceHeight - (baseY + maxHeight * snowLine)) / 12 + 0.5,
        0,
        1
      );
      ridgeSnow.push(snowAmount);
      const color = palette[0]
        .clone()
        .lerp(palette[1], rockBlend)
        .multiplyScalar(facetTint * (0.9 + heightRatio * 0.1));
      vertexColors.push(color.r, color.g, color.b);
    }
  }

  for (let segment = 0; segment < segments; segment += 1) {
    for (let row = 0; row < rows - 1; row += 1) {
      const lowerLeft = segment * rows + row;
      const lowerRight = (segment + 1) * rows + row;
      const upperRight = lowerRight + 1;
      const upperLeft = lowerLeft + 1;
      indices.push(lowerLeft, lowerRight, upperLeft, lowerRight, upperRight, upperLeft);
    }
  }
  // A shallow view from the northern village can see past the terrain edge
  // and beneath an open ridge. Close its bottom with the existing rim vertices,
  // below every real surface. This costs no draw or vertex and preserves peaks.
  // Working if the reproduced village-camera gap ray hits the closed backdrop.
  if (baseClosureY !== undefined)
    for (let segment = 1; segment < segments - 1; segment += 1)
      indices.push(0, (segment + 1) * rows, segment * rows);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(vertexColors, 3));
  geometry.setAttribute('ridgeHeight', new THREE.Float32BufferAttribute(ridgeHeights, 1));
  geometry.setAttribute('ridgeSnow', new THREE.Float32BufferAttribute(ridgeSnow, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

// A camera-locked backdrop must clear the whole site's diameter. The former
// 248 m inner slope sliced through groves from the opposite side of the mill.
// Working if rays to all grounded woodland stay in front of every ridge.
const horizonRadius = SITE_LAYOUT.world.radius * 2 + 8;
export const FAR_MOUNTAIN_SPEC: MountainRidgeSpec = {
  radius: horizonRadius,
  baseY: -8,
  baseClosureY: -100,
  // The far ring also hides the terrain rim. Its lowest summit stays above
  // 20 m while the taller massifs gain their own shoulders and eroded gullies.
  // Working if the closed-ring test holds and overview shows no ground seam.
  minHeight: 10,
  maxHeight: 205,
  slopeDepth: 55,
  alpineReliefMetres: 30,
  valleyFloor: 0.13,
  // Cover the upper shoulders visible from the village, not just the tips.
  // The former 86 m datum left most of the visible range bare. This 62 m
  // line retains exposed lower rock and snow-free wooded intermediate hills.
  // Working if the village's high peaks have continuous irregular white caps.
  snowLine: 0.34,
  seed: 0.37,
  // TRUE ALBEDO. These three arrays used to be pre-hazed blue-greys, i.e. they
  // had aerial perspective painted into them, which is why the far ring read as
  // a flat grey cut-out under any lighting. The haze is applied per channel at
  // runtime now, so the geometry carries rock and snow and nothing else.
  colors: ['#42574c', '#717a76', '#e9eff2'],
};
const farMountainGeometry = createMountainRidgeGeometry(FAR_MOUNTAIN_SPEC);
const midMountainGeometry = createMountainRidgeGeometry({
  radius: SITE_LAYOUT.world.radius + 67,
  baseY: -3,
  minHeight: 3,
  maxHeight: 72,
  slopeDepth: 150,
  valleyFloor: 0.07,
  snowLine: 1.1,
  rollingHills: true,
  seed: 1.83,
  colors: ['#465d40', '#647451', '#c5cdbc'],
});
const nearHillGeometry = createMountainRidgeGeometry({
  // Real broad foothills begin beyond the playable perimeter. Their fixed
  // origin keeps them behind the groves while supplying natural parallax.
  radius: SITE_LAYOUT.world.radius + 16,
  baseY: -2,
  minHeight: 2,
  // Lower foothills leave the distant ranges and grain elevator distinct.
  // Working if the overview ridge stays below the gantry instead of forming a cone above it.
  maxHeight: 40,
  slopeDepth: 112,
  valleyFloor: 0.025,
  snowLine: 1.1,
  rollingHills: true,
  seed: 3.41,
  colors: ['#435536', '#62704d', '#93a08f'],
});

/** Actual backdrop meshes, shared with the site-visibility regression check. */
export const MOUNTAIN_RIDGE_GEOMETRIES = [
  farMountainGeometry,
  midMountainGeometry,
  nearHillGeometry,
] as const;

/**
 * The camera-locked range's nearest on-screen radius (its foot, about 516 m)
 * and the fixed foothills' farthest radius from the site origin over the rows
 * that face the site (their crests, about 485 m). The closure row is buried.
 */
const FAR_RIDGE_FOOT_RADIUS = (() => {
  const position = farMountainGeometry.getAttribute('position');
  const rows = position.count / (MOUNTAIN_RIDGE_SEGMENTS + 1);
  let radius = Infinity;
  for (let i = 0; i < position.count; i++)
    if (i % rows !== 0) radius = Math.min(radius, Math.hypot(position.getX(i), position.getZ(i)));
  return radius;
})();
const FIXED_RIDGE_CREST_RADIUS = (() => {
  let radius = 0;
  for (const geometry of [midMountainGeometry, nearHillGeometry]) {
    const position = geometry.getAttribute('position');
    const rows = position.count / (MOUNTAIN_RIDGE_SEGMENTS + 1);
    for (let i = 0; i < position.count; i++)
      if (i % rows < MOUNTAIN_RIDGE_ROWS)
        radius = Math.max(radius, Math.hypot(position.getX(i), position.getZ(i)));
  }
  return radius;
})();
/** Slack for crest height against camera height, in metres. */
const FAR_RIDGE_DEPTH_MARGIN = 12;
/**
 * Ceiling on the push: the range's farthest point (about 593 m) times this
 * stays in front of the sun disc (CELESTIAL_RADIUS less its halo) and inside
 * the camera far plane.
 */
const FAR_RIDGE_MAX_DEPTH_PUSH = 1.5;

/**
 * How far to push the camera-locked range back in depth, for a camera at
 * (x, z).
 *
 * The far ring follows the camera, so it is always 516-593 m away; the fixed
 * foothills sit on the site origin, so a camera 145 m off-centre (overview)
 * sees their far crests up to 630 m away, and the water and farm cameras up
 * to 706 m. Those crests lost to the "infinitely far" range in the depth
 * test: a pale far peak over the green ridge in overview, a stepped notch in
 * the hill behind the shed roof in silos, and the range's dark lower band
 * standing in front of the foothills at the top of water (final7-med-12).
 *
 * The vertex stage scales the range's view-space position along each view
 * ray by this factor. The silhouette is unchanged to the pixel, only its
 * depth moves, and only as far as this camera needs: terrain and anything
 * else beyond the old 516 m stays hidden wherever it was. 1 at the centre.
 */
export function getFarRidgeDepthPush(cameraX: number, cameraZ: number): number {
  const offset =
    Number.isFinite(cameraX) && Number.isFinite(cameraZ) ? Math.hypot(cameraX, cameraZ) : 0;
  return THREE.MathUtils.clamp(
    (FIXED_RIDGE_CREST_RADIUS + offset + FAR_RIDGE_DEPTH_MARGIN) / FAR_RIDGE_FOOT_RADIUS,
    1,
    FAR_RIDGE_MAX_DEPTH_PUSH
  );
}

const dayTop = new THREE.Color('#70aed8');
const nightTop = new THREE.Color('#071426');
const blueHourTop = new THREE.Color('#294b7b');
const dayHorizon = new THREE.Color('#a3cce2');
const nightHorizon = new THREE.Color('#384a64');
const dawnHorizon = new THREE.Color('#e8a66d');
const blueHourHorizon = new THREE.Color('#7186ad');
// Ground bounce, not more sky. This band is what the dome shows below the
// horizon, and it was '#a6cbd5' - a paler blue than the sky above it, which
// reads as a second sky rather than as light coming back off the site. The
// exterior grass albedo is '#365844' (`exterior/OptimizedExterior.tsx`), so
// the correct colour here is that albedo scattered back up through haze.
const dayGround = new THREE.Color('#8fae9e');
const nightGround = new THREE.Color('#1e2f42');
const dayCloud = new THREE.Color('#f4f6f2');
const nightCloud = new THREE.Color('#4d586a');
const blueHourCloud = new THREE.Color('#7184a2');
// Unlit cloud bottoms. '#596575' was a night blue applied all day, so overcast
// cloud read as a bruise rather than as grey volume.
const dayCloudShadow = new THREE.Color('#93a0ad');
const nightCloudShadow = new THREE.Color('#28303f');
const blueHourCloudShadow = new THREE.Color('#293b5d');
const lightDay = new THREE.Color('#fff1cf');
const lightGolden = new THREE.Color('#ffb15d');
const sunCoreNoon = new THREE.Color('#fff8d8');
const sunCoreGolden = new THREE.Color('#ffd064');
const sunHaloNoon = new THREE.Color('#ffe6a6');
const sunHaloGolden = new THREE.Color('#ff9f43');

// RIDGE LIGHTING, NOT RIDGE COLOUR.
//
// These replace the nine `farMountainDay` / `midMountainNight` / ... tints that
// used to be multiplied over the whole ring. Those were doing two jobs at once
// - time of day AND distance - and could do neither well, because a single
// multiply cannot make one side of a peak catch the sun. They are now a key and
// a fill: the ridge shader mixes between them by a wrapped lambert term, and
// distance is handled separately by the per-channel aerial ramp.
const ridgeSunDay = new THREE.Color('#fff2d6');
const ridgeSunGolden = new THREE.Color('#ffb478');
const ridgeSunNight = new THREE.Color('#39527a');
const ridgeShadowDay = new THREE.Color('#5d7d96');
const ridgeShadowNight = new THREE.Color('#161f2e');

const colorScratch = new THREE.Color();
const targetTopScratch = new THREE.Color();
const targetHorizonScratch = new THREE.Color();
const targetGroundScratch = new THREE.Color();
const targetCloudScratch = new THREE.Color();
const targetCloudShadowScratch = new THREE.Color();
const targetSunCoreScratch = new THREE.Color();
const targetSunHaloScratch = new THREE.Color();
const ridgeSunScratch = new THREE.Color();
const ridgeShadowScratch = new THREE.Color();
const inscatterScratch = new THREE.Color();
const sunDirectionScratch = new THREE.Vector3();
const moonDirectionScratch = new THREE.Vector3();
const keyDirectionScratch = new THREE.Vector3();
const keyMoonColour = new THREE.Color('#9bbce5');
const cameraForwardScratch = new THREE.Vector3();

/**
 * One material per range. Broad fixed foothills supply parallax, with aerial
 * extinction separating them from the camera-locked remote horizon.
 */
export function createRidgeMaterial(
  aerial: number,
  name: string,
  worldAnchored = false
): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    name,
    vertexShader: ridgeVertexShader,
    fragmentShader: ridgeFragmentShader,
    vertexColors: true,
    side: THREE.FrontSide,
    // Occlusion is per fragment, including overlapping low skirts. Sorting
    // transparent whole rings cannot represent solid intersecting landscapes.
    transparent: false,
    depthWrite: true,
    fog: false,
    // Tone mapped, unlike the emissive celestial bodies: these are opaque
    // surfaces sitting directly against the fogged terrain, so they have to
    // travel through the same curve the terrain does or the horizon seams.
    toneMapped: true,
    uniforms: {
      uSunDirection: { value: new THREE.Vector3(0.5, 0.75, -0.4).normalize() },
      uSunColor: { value: ridgeSunDay.clone() },
      uShadowTint: { value: ridgeShadowDay.clone() },
      uInscatter: { value: new THREE.Color('#b9dce7') },
      uAerial: { value: aerial },
      uDetailStrength: WORLD_SURFACE_STRENGTH,
      uSnowStrength: RIDGE_SNOW_STRENGTH,
      uWorldAnchored: { value: worldAnchored ? 1 : 0 },
      // Per-material, unlike global surface/snow isolation. Working if a
      // woodland comparison cannot retint the far range or another surface.
      uWoodlandStrength: { value: worldAnchored ? 1 : 0 },
      // Far-only and private: comparison cannot retint the finished woodland.
      // Working if on/off/on leaves every other control and buffer unchanged.
      uAlpineStrength: { value: worldAnchored ? 0 : 1 },
      // World altitude where the far range's ridgeSnow attribute is 0.5.
      uSnowDatum: {
        value: FAR_MOUNTAIN_SPEC.baseY + FAR_MOUNTAIN_SPEC.maxHeight * FAR_MOUNTAIN_SPEC.snowLine,
      },
      // The far ring's foot radius and slope depth, for its crest-row guard.
      uRingRadius: { value: FAR_MOUNTAIN_SPEC.radius },
      uSlopeDepth: { value: FAR_MOUNTAIN_SPEC.slopeDepth },
      // Private paired control for the lower-band haze. Working if 0 restores
      // the full aerial term pixel for pixel.
      uLowAerialStrength: { value: 1 },
      // Night compression of the hill fields (RIDGE_FIELD_PROFILE.night*).
      uFieldDaylight: { value: 1 },
      uFieldTone: { value: 1 },
      // Distance haze on the fixed foothills (RIDGE_ANCHORED_AERIAL), with a
      // private paired control: 0 restores the per-ring constant exactly.
      uAnchoredAerial: RIDGE_ANCHORED_AERIAL_SPAN,
      uDistanceAerialStrength: { value: 1 },
      // 1 in fair weather, toward 0 under rain cloud (getRidgeClearAir).
      uClearAir: { value: 1 },
      // Clip-space depth push; the far ring's is set per frame from the camera.
      uDepthPush: { value: 1 },
    },
  });
  material.userData.clearAerial = aerial;
  material.customProgramCacheKey = () => 'millos-ridge-aerial-geology-v28';
  return material;
}

/**
 * Default-quality animated skybox and lighting.
 *
 * One analytic sky, sun, star field, and atmosphere clock now anchor every
 * quality preset. High and Ultra add bounded lighting and post-processing
 * layers without swapping the user into a different horizon or weather model.
 */
export function OptimizedSkySystem() {
  const scene = useThree((state) => state.scene);
  const quality = useGraphicsStore((state) => state.graphics.quality);
  const enableHighResShadows = useGraphicsStore((state) => state.graphics.enableHighResShadows);
  const configuredShadowMapSize = useGraphicsStore((state) => state.graphics.shadowMapSize);
  // Every tier except `low` casts sun shadows. `low` is the one forward-only
  // preset: no composer, no shadow pass. See the `shadows` prop in `App.tsx`,
  // which must agree - a light with `castShadow` under a Canvas with
  // `shadows={false}` allocates nothing and silently does nothing.
  const enableSceneShadows = quality !== 'low';
  // The store's shadow-resolution setting is now authoritative. It previously
  // was not: `enableHighResShadows` is false in all four presets, so this
  // collapsed to a hard-coded 1024 and the `shadowMapSize` slider moved
  // nothing at all. The high-res switch is the only override left.
  const shadowMapSize = enableHighResShadows ? 4096 : configuredShadowMapSize;
  const skyGroupRef = useRef<THREE.Group>(null);
  const horizonGroupRef = useRef<THREE.Group>(null);
  const sunRef = useRef<THREE.Group>(null);
  const moonRef = useRef<THREE.Group>(null);
  const starsMaterialRef = useRef<THREE.PointsMaterial>(null);
  const brightStarsMaterialRef = useRef<THREE.PointsMaterial>(null);
  const sunLightRef = useRef<THREE.DirectionalLight>(null);
  const moonLightRef = useRef<THREE.DirectionalLight>(null);
  const ambientLightRef = useRef<THREE.AmbientLight>(null);
  const backgroundColorRef = useRef(dayTop.clone());
  const celestialStateRef = useRef(createCelestialState());

  const skyMaterial = useMemo(() => {
    const material = new THREE.ShaderMaterial({
      name: 'MillOS Optimized Analytic Sky',
      vertexShader: optimizedSkyVertexShader,
      fragmentShader: OPTIMIZED_SKY_FRAGMENT_SHADER,
      side: THREE.BackSide,
      depthTest: false,
      depthWrite: false,
      fog: false,
      // ONE TONE CURVE ON BOTH PATHS, AND THE SKY IS ON IT.
      //
      // This was `false`, with a note about preventing a dark zenith band. That
      // reasoning no longer holds and the flag had become actively harmful.
      // Since the composer mounts from `medium` upward it renders to its own
      // linear target and applies Neutral to the finished COMPOSITE, at which
      // point `toneMapped` is inert - so medium and above already tone map the
      // sky. Only `low`, which has no composer, was leaving the sky off the
      // curve while every fogged surface it meets stayed on it. The two tiers
      // therefore drew visibly different skies (measured at the `overview`
      // camera: zenith 178,217,232 on low against 163,207,225 on medium).
      //
      // A raw ShaderMaterial does not get tone mapping from this flag alone -
      // the flag only defines TONE_MAPPING - so the fragment shader includes
      // `<tonemapping_fragment>` explicitly, before `<colorspace_fragment>`.
      toneMapped: true,
      uniforms: {
        topColor: { value: dayTop.clone() },
        horizonColor: { value: dayHorizon.clone() },
        groundColor: { value: dayGround.clone() },
        uCloudLit: { value: dayCloud.clone() },
        uCloudShadow: { value: dayCloudShadow.clone() },
        uSunTint: { value: sunHaloNoon.clone() },
        uSunOpacity: { value: 1 },
        uOvercastDeck: { value: 0 },
        // Pre-wrapped to [0,1) on the CPU every frame. Scrolling the texture
        // from a raw simulation-minute count instead would lose texture-space
        // precision over a long session and the clouds would visibly step.
        uCloudDrift: { value: new THREE.Vector2() },
        uCirrusDrift: { value: new THREE.Vector2() },
        uCloudNoise: { value: getCloudNoiseTexture() },
        uCloudAtlas: { value: getCumulusAtlas().texture },
        uCloudAtlasReady: getCumulusAtlas().ready,
        uAfterglow: { value: 0 },
        uSkyAfterglowStrength: SKY_AFTERGLOW_STRENGTH,
        uAfterglowColor: { value: new THREE.Color('#ffb66f') },
        cloudAmount: { value: 0.2 },
        daylight: { value: 1 },
        sunDirection: { value: new THREE.Vector3(0.5, 0.75, -0.4).normalize() },
      },
    });
    material.customProgramCacheKey = () => 'millos-optimized-sky-v14';
    return material;
  }, []);

  const ridgeMaterials = useMemo(() => {
    // Clear-air separation leaves the slope lighting visible. Overcast and
    // storm conditions raise extinction from these baselines every frame.
    const far = createRidgeMaterial(0.32, 'MillOS Ridge Aerial: Far');
    const mid = createRidgeMaterial(0.2, 'MillOS Ridge Aerial: Mid', true);
    const near = createRidgeMaterial(0.1, 'MillOS Ridge Aerial: Near', true);
    // `all` is materialised here rather than built per frame: iterating a
    // freshly constructed array inside useFrame is an allocation at animation
    // rate, which is what the GC rules in CLAUDE.md exist to prevent.
    return { far, mid, near, all: [far, mid, near] as const };
  }, []);

  useEffect(() => {
    const materials = ridgeMaterials;
    return () => {
      for (const material of materials.all) material.dispose();
    };
  }, [ridgeMaterials]);

  useEffect(() => () => skyMaterial.dispose(), [skyMaterial]);

  // `DirectionalLightShadow` allocates its depth target once and never resizes
  // it, so changing `shadow.mapSize` on a light that has already rendered is a
  // no-op until the old target is thrown away. That is reachable two ways: the
  // Settings resolution control, and `adaptiveQuality` swapping the whole
  // preset object mid-session (1024 <-> 2048). Without this the map silently
  // keeps its first resolution for the rest of the session.
  useEffect(() => {
    const light = sunLightRef.current;
    if (!light) return;
    light.shadow.map?.dispose();
    light.shadow.map = null;
    light.shadow.needsUpdate = true;
  }, [shadowMapSize]);

  useEffect(() => {
    const previousBackground = scene.background;
    scene.background = backgroundColorRef.current;
    return () => {
      if (scene.background === backgroundColorRef.current) {
        scene.background = previousBackground;
      }
    };
  }, [scene]);

  // OLD CONTRACT GUARD. `App.tsx` declares `<fogExp2 attach="fog" .../>`, but
  // this component is the single owner of fog and must not silently stop
  // fogging if it is ever mounted under a scene that still carries the linear
  // `THREE.Fog` this replaced - the loader preview, a test harness, or a
  // partially reverted tree. Installing one here costs nothing when the scene
  // already has the right kind and keeps the density damping below meaningful.
  useEffect(() => {
    const previousFog = scene.fog;
    if (previousFog instanceof THREE.FogExp2) return;
    const fog = new THREE.FogExp2('#b9dce7', 0.002);
    scene.fog = fog;
    return () => {
      if (scene.fog === fog) scene.fog = previousFog;
    };
  }, [scene]);

  useFrame((state, delta) => {
    if (skyGroupRef.current) {
      skyGroupRef.current.position.x = state.camera.position.x;
      skyGroupRef.current.position.y = state.camera.position.y;
      skyGroupRef.current.position.z = state.camera.position.z;
    }
    // The remote mountain ring is an optical horizon rather than site geometry.
    // Keeping their horizontal origin at the camera preserves continuous
    // parallax-free distance and prevents the far slopes clipping as the
    // inspection camera traverses the authored site. Their vertical datum stays tied
    // to the terrain so the ranges never float with camera height.
    if (horizonGroupRef.current) {
      horizonGroupRef.current.position.x = state.camera.position.x;
      horizonGroupRef.current.position.z = state.camera.position.z;
    }
    ridgeMaterials.far.uniforms.uDepthPush.value = getFarRidgeDepthPush(
      state.camera.position.x,
      state.camera.position.z
    );
    if (!useGameSimulationStore.getState().isTabVisible) return;
    const { gameDay, gameTime, gameSpeed, weather, timeOfDayHeld } =
      useGameSimulationStore.getState();
    // A held clock (capture mode) is not extrapolated ahead of the store.
    const smoothedGameTime = getSmoothedGameTime(gameTime, delta, timeOfDayHeld ? 0 : gameSpeed);
    const atmosphere = sampleAtmosphere(gameDay, smoothedGameTime, weather);
    const celestial = sampleCelestial(atmosphere, celestialStateRef.current);
    const visualDaylight = atmosphere.daylight * atmosphere.lightMultiplier;
    const response = 3.2;
    SURFACE_WETNESS.value = dampSurfaceWetness(SURFACE_WETNESS.value, atmosphere.wetness, delta);

    // Cloud scroll, wrapped to one texture period on the CPU. `simulationMinutes`
    // grows without bound (day * 1440), so feeding it straight into a texture
    // coordinate loses mantissa bits over a long session and the field starts
    // stepping between texels. Wrapping here keeps the uniform inside [0,1).
    const cloudTime = atmosphere.simulationMinutes * (0.35 + atmosphere.wind * 1.15);
    const cloudDrift = skyMaterial.uniforms.uCloudDrift.value as THREE.Vector2;
    const cirrusDrift = skyMaterial.uniforms.uCirrusDrift.value as THREE.Vector2;
    cloudDrift.set((cloudTime * 0.00042) % 1, (cloudTime * 0.00017) % 1);
    cirrusDrift.set((cloudTime * -0.00019) % 1, (cloudTime * 0.00009) % 1);
    skyMaterial.uniforms.daylight.value = THREE.MathUtils.damp(
      skyMaterial.uniforms.daylight.value,
      visualDaylight,
      response,
      delta
    );
    skyMaterial.uniforms.cloudAmount.value = THREE.MathUtils.damp(
      skyMaterial.uniforms.cloudAmount.value,
      atmosphere.cloudCoverage,
      response,
      delta
    );
    skyMaterial.uniforms.uOvercastDeck.value = THREE.MathUtils.damp(
      skyMaterial.uniforms.uOvercastDeck.value,
      getOvercastDeck(atmosphere.cloudCoverage),
      response,
      delta
    );
    skyMaterial.uniforms.uAfterglow.value = THREE.MathUtils.damp(
      skyMaterial.uniforms.uAfterglow.value,
      getSkyAfterglowWeight(atmosphere.solarElevation, atmosphere.twilight) *
        (1 - atmosphere.cloudCoverage * 0.6),
      response,
      delta
    );
    const blueHour = getSkyBlueHourWeight(atmosphere.solarElevation, atmosphere.twilight);
    targetTopScratch.copy(nightTop).lerp(dayTop, visualDaylight).lerp(blueHourTop, blueHour);
    targetHorizonScratch
      .copy(nightHorizon)
      .lerp(dayHorizon, visualDaylight)
      .lerp(blueHourHorizon, blueHour)
      .lerp(dawnHorizon, getSkyWarmHorizonWeight(atmosphere.solarElevation, atmosphere.twilight));
    targetGroundScratch.copy(nightGround).lerp(dayGround, visualDaylight);
    targetCloudScratch
      .copy(nightCloud)
      .lerp(dayCloud, visualDaylight)
      .lerp(blueHourCloud, blueHour);
    targetCloudShadowScratch
      .copy(nightCloudShadow)
      .lerp(dayCloudShadow, visualDaylight)
      .lerp(blueHourCloudShadow, blueHour);
    const cover = atmosphere.cloudCoverage;
    blendSkyOvercast(targetTopScratch, 'top', visualDaylight, cover);
    blendSkyOvercast(targetHorizonScratch, 'horizon', visualDaylight, cover);
    blendSkyOvercast(targetGroundScratch, 'ground', visualDaylight, cover);
    blendSkyOvercast(targetCloudScratch, 'cloud', visualDaylight, cover);
    blendSkyOvercast(targetCloudShadowScratch, 'cloudShadow', visualDaylight, cover);
    const colourAlpha = 1 - Math.exp(-response * delta);
    skyMaterial.uniforms.topColor.value.lerp(targetTopScratch, colourAlpha);
    skyMaterial.uniforms.horizonColor.value.lerp(targetHorizonScratch, colourAlpha);
    skyMaterial.uniforms.groundColor.value.lerp(targetGroundScratch, colourAlpha);
    skyMaterial.uniforms.uCloudLit.value.lerp(targetCloudScratch, colourAlpha);
    skyMaterial.uniforms.uCloudShadow.value.lerp(targetCloudShadowScratch, colourAlpha);
    // `SceneEnvironmentIBL` reads `scene.background` as the zenith band of the
    // image-based environment, so this assignment is a contract, not a detail:
    // every sky palette change above propagates into what metal reflects.
    backgroundColorRef.current.copy(skyMaterial.uniforms.topColor.value);

    sunDirectionScratch.fromArray(celestial.sunDirection);
    moonDirectionScratch.fromArray(celestial.moonDirection);
    const sunX = sunDirectionScratch.x * CELESTIAL_RADIUS;
    const sunY = sunDirectionScratch.y * CELESTIAL_RADIUS;
    const sunZ = sunDirectionScratch.z * CELESTIAL_RADIUS;
    skyMaterial.uniforms.sunDirection.value.copy(sunDirectionScratch);
    sunCoreMaterial.opacity = THREE.MathUtils.damp(
      sunCoreMaterial.opacity,
      celestial.sunOpacity,
      response,
      delta
    );
    sunGlowMaterial.opacity = THREE.MathUtils.damp(
      sunGlowMaterial.opacity,
      celestial.sunOpacity * 0.46,
      response,
      delta
    );
    // The halo supports the readable core without becoming the sun's apparent
    // size on its own. Golden hour earns a wider, warmer aureole.
    sunHaloMaterial.opacity = THREE.MathUtils.damp(
      sunHaloMaterial.opacity,
      celestial.sunOpacity * (0.22 + celestial.goldenHour * 0.2),
      response,
      delta
    );
    targetSunCoreScratch.copy(sunCoreNoon).lerp(sunCoreGolden, celestial.goldenHour);
    targetSunHaloScratch.copy(sunHaloNoon).lerp(sunHaloGolden, celestial.goldenHour);
    sunCoreMaterial.color.lerp(targetSunCoreScratch, colourAlpha);
    sunGlowMaterial.color.lerp(targetSunHaloScratch, colourAlpha);
    sunHaloMaterial.color.lerp(targetSunHaloScratch, colourAlpha);
    skyMaterial.uniforms.uSunTint.value.lerp(targetSunHaloScratch, colourAlpha);
    skyMaterial.uniforms.uSunOpacity.value = THREE.MathUtils.damp(
      skyMaterial.uniforms.uSunOpacity.value,
      celestial.sunOpacity,
      response,
      delta
    );
    if (sunRef.current) {
      sunRef.current.position.set(sunX, sunY, sunZ);
      sunRef.current.visible = sunCoreMaterial.opacity > 0.005;
    }
    moonMaterial.uniforms.opacity.value = THREE.MathUtils.damp(
      moonMaterial.uniforms.opacity.value,
      celestial.moonOpacity,
      response,
      delta
    );
    moonHaloMaterial.opacity = THREE.MathUtils.damp(
      moonHaloMaterial.opacity,
      celestial.moonOpacity * 0.13,
      response,
      delta
    );
    if (moonRef.current) {
      moonRef.current.position.set(
        moonDirectionScratch.x * CELESTIAL_RADIUS,
        moonDirectionScratch.y * CELESTIAL_RADIUS,
        moonDirectionScratch.z * CELESTIAL_RADIUS
      );
      moonRef.current.quaternion.copy(state.camera.quaternion);
      moonRef.current.visible = moonMaterial.uniforms.opacity.value > 0.005;
    }
    if (sunLightRef.current) {
      const totalKey = celestial.sunLightIntensity + celestial.moonLightIntensity;
      celestialKeyDirection(
        keyDirectionScratch,
        celestial.sunDirection,
        celestial.moonDirection,
        celestial.sunLightIntensity,
        celestial.moonLightIntensity
      );
      sunLightRef.current.position.set(
        keyDirectionScratch.x * 120,
        keyDirectionScratch.y * 120,
        keyDirectionScratch.z * 120
      );
      sunLightRef.current.intensity = THREE.MathUtils.damp(
        sunLightRef.current.intensity,
        totalKey,
        response,
        delta
      );
      colorScratch.copy(lightDay).lerp(lightGolden, celestial.goldenHour);
      colorScratch.lerp(keyMoonColour, celestial.moonLightIntensity / Math.max(0.00001, totalKey));
      sunLightRef.current.color.copy(colorScratch);
      // An overcast deck is a broad source: widen the penumbra with the same
      // weight that moves the key into fill. A uniform, never a recompile.
      sunLightRef.current.shadow.radius = overcastShadowRadius(atmosphere.cloudCoverage);
    }
    if (moonLightRef.current) {
      moonLightRef.current.position.set(
        moonDirectionScratch.x * 110,
        Math.max(12, moonDirectionScratch.y * 110),
        moonDirectionScratch.z * 110
      );
      // Moon energy lives in the single shadowed key, never in both sources.
      moonLightRef.current.intensity = 0;
    }
    if (ambientLightRef.current) {
      ambientLightRef.current.intensity = THREE.MathUtils.damp(
        ambientLightRef.current.intensity,
        celestial.ambientLightIntensity,
        response,
        delta
      );
      applySkyAmbientPalette(
        ambientLightRef.current.color,
        skyMaterial.uniforms.horizonColor.value,
        useGraphicsStore.getState().graphics.perfDebug.disableLightingPolish
          ? undefined
          : atmosphere.daylight
      );
    }
    if (starsMaterialRef.current) {
      starsMaterialRef.current.opacity = THREE.MathUtils.damp(
        starsMaterialRef.current.opacity,
        celestial.faintStarOpacity * 0.82,
        response,
        delta
      );
    }
    if (brightStarsMaterialRef.current) {
      brightStarsMaterialRef.current.opacity = THREE.MathUtils.damp(
        brightStarsMaterialRef.current.opacity,
        celestial.starOpacity,
        response,
        delta
      );
    }
    // SUN-DIRECTION INSCATTER. The single strongest missing depth cue: with a
    // flat fog colour, looking into the sun and looking away from it produced
    // identical haze. One dot product per frame warms the whole screen's haze
    // toward the sun and cools it away - and because the ridge material takes
    // the same colour, the backdrop and the air in front of it agree exactly.
    state.camera.getWorldDirection(cameraForwardScratch);
    const sunAlignment = Math.max(0, cameraForwardScratch.dot(sunDirectionScratch));
    const inscatterMie = Math.pow(sunAlignment, 3.5) * 0.42 * celestial.sunOpacity;
    inscatterScratch
      .copy(skyMaterial.uniforms.horizonColor.value)
      .lerp(targetSunHaloScratch, inscatterMie);

    const mountainTwilight =
      getSkyTwilightWeight(atmosphere.solarElevation, atmosphere.twilight) * 0.8;
    ridgeSunScratch
      .copy(ridgeSunNight)
      .lerp(ridgeSunDay, visualDaylight)
      .lerp(ridgeSunGolden, mountainTwilight);
    ridgeShadowScratch.copy(ridgeShadowNight).lerp(ridgeShadowDay, visualDaylight);
    const fieldDaylight = getRidgeFieldDaylight(atmosphere.daylight);
    const fieldTone = getRidgeFieldTone(atmosphere.daylight);
    const clearAir = getRidgeClearAir(atmosphere.cloudCoverage);
    for (const ridgeMaterial of ridgeMaterials.all) {
      ridgeMaterial.uniforms.uFieldDaylight.value = fieldDaylight;
      ridgeMaterial.uniforms.uFieldTone.value = fieldTone;
      ridgeMaterial.uniforms.uClearAir.value = clearAir;
      ridgeMaterial.uniforms.uSunDirection.value.copy(sunDirectionScratch);
      ridgeMaterial.uniforms.uSunColor.value.lerp(ridgeSunScratch, colourAlpha);
      ridgeMaterial.uniforms.uShadowTint.value.lerp(ridgeShadowScratch, colourAlpha);
      ridgeMaterial.uniforms.uInscatter.value.lerp(inscatterScratch, colourAlpha);
      ridgeMaterial.uniforms.uAerial.value = THREE.MathUtils.damp(
        ridgeMaterial.uniforms.uAerial.value,
        getRidgeAerialWeight(ridgeMaterial.userData.clearAerial, atmosphere.cloudCoverage),
        response,
        delta
      );
    }
    RIDGE_ANCHORED_AERIAL_SPAN.value.set(
      ridgeMaterials.near.uniforms.uAerial.value,
      ridgeMaterials.mid.uniforms.uAerial.value,
      ridgeMaterials.far.uniforms.uAerial.value
    );

    const fog = state.scene.fog;
    if (fog instanceof THREE.FogExp2) {
      fog.color.lerp(inscatterScratch, colourAlpha);
      fog.density = THREE.MathUtils.damp(fog.density, atmosphere.fogDensity, response, delta);
    }
  });

  return (
    <>
      <group ref={skyGroupRef} name="optimized-sky-system" dispose={null}>
        <mesh
          name="analytic-sky-dome"
          material={skyMaterial}
          renderOrder={RENDER_ORDER.skyDome}
          geometry={skyDomeGeometry}
          frustumCulled={false}
        />
        <points
          name="star-field"
          geometry={starGeometry}
          renderOrder={RENDER_ORDER.stars}
          frustumCulled={false}
        >
          {/* fog={false}: `PointsMaterial` defaults it to true and three's
              points shader includes the fog chunk, so a star field camera-locked
              at radius 352 was being mixed 100% into the fog colour - the stars
              were rendering as fog-coloured dots, not as stars. */}
          <pointsMaterial
            ref={starsMaterialRef}
            vertexColors
            size={1.1 * (STAR_RADIUS / 352)}
            transparent
            opacity={0}
            depthWrite={false}
            sizeAttenuation
            fog={false}
            toneMapped={false}
          />
        </points>
        <points
          name="bright-star-field"
          geometry={brightStarGeometry}
          renderOrder={RENDER_ORDER.stars + 1}
          frustumCulled={false}
        >
          <pointsMaterial
            ref={brightStarsMaterialRef}
            vertexColors
            size={2.05 * (STAR_RADIUS / 352)}
            transparent
            opacity={0}
            depthWrite={false}
            sizeAttenuation
            fog={false}
            toneMapped={false}
          />
        </points>
        <group ref={sunRef} name="sun-visual" visible={false} scale={CELESTIAL_SCALE}>
          <sprite
            name="sun-halo"
            material={sunHaloMaterial}
            scale={[30, 30, 1]}
            renderOrder={RENDER_ORDER.sunMoon - 1}
          />
          <mesh
            name="sun-glow"
            geometry={sunGlowGeometry}
            material={sunGlowMaterial}
            renderOrder={RENDER_ORDER.sunMoon}
          />
          <mesh
            name="sun-core"
            geometry={sunGeometry}
            material={sunCoreMaterial}
            renderOrder={RENDER_ORDER.sunMoon + 1}
          />
        </group>
        <group ref={moonRef} name="moon-visual" visible={false} scale={CELESTIAL_SCALE}>
          <sprite
            name="moon-halo"
            material={moonHaloMaterial}
            scale={[24, 24, 1]}
            renderOrder={RENDER_ORDER.sunMoon - 1}
          />
          <mesh
            name="moon-surface"
            geometry={moonGeometry}
            material={moonMaterial}
            renderOrder={RENDER_ORDER.sunMoon}
          />
        </group>
      </group>

      <group ref={horizonGroupRef} name="optimized-horizon-backdrop" dispose={null}>
        {/* The remote horizon retains its own air rather than receiving
            saturated scene fog. Fixed foothills share the far-plane guard. */}
        <mesh
          name="far-mountain-ring"
          geometry={farMountainGeometry}
          material={ridgeMaterials.far}
          renderOrder={RENDER_ORDER.mountains - 20}
          frustumCulled={false}
        />
      </group>
      <group name="site-foothills" dispose={null}>
        <mesh
          name="mid-mountain-ring"
          geometry={midMountainGeometry}
          material={ridgeMaterials.mid}
          renderOrder={RENDER_ORDER.mountains - 10}
          frustumCulled={false}
        />
        <mesh
          name="near-hill-ring"
          geometry={nearHillGeometry}
          material={ridgeMaterials.near}
          renderOrder={RENDER_ORDER.mountains}
          frustumCulled={false}
        />
      </group>

      <ambientLight
        ref={ambientLightRef}
        name="celestial-ambient-light"
        intensity={0.22}
        color="#c9e7f4"
      />
      {/* The single shadow-casting light in the scene, per CLAUDE.md. Its
          orthographic frustum is NOT declared here: `SunShadowRig` fits
          left/right/top/bottom, near/far, position, target and `normalBias` to
          the view every third frame. Hard-coding an 85 x 100 box here fought
          that fit and, at 1024 texels, wasted most of the map on empty sky. */}
      <directionalLight
        ref={sunLightRef}
        name="sun-key-light"
        position={[70, 120, -55]}
        intensity={3.1}
        color="#fff1cf"
        castShadow={enableSceneShadows}
        shadow-mapSize={[shadowMapSize, shadowMapSize]}
        shadow-camera-near={10}
        shadow-camera-far={260}
        shadow-bias={SHADOW_CONFIG.bias}
        shadow-normalBias={SHADOW_CONFIG.normalBias}
      />
      <directionalLight
        ref={moonLightRef}
        name="moon-fill-light"
        position={[-70, 80, 55]}
        intensity={0}
        color="#9bbce5"
        castShadow={false}
      />
    </>
  );
}
