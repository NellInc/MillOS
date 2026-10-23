import * as THREE from 'three';

/** Inland water: metres of swell and independent micro-slope, never slowed ocean waves. */
export const WATER_PROFILES = {
  river: { speed: 0.38, waveHeight: 0.012, rippleStrength: 0.48, roughness: 0.14, shoreFoam: 0.12 },
  canal: { speed: 0.085, waveHeight: 0.002, rippleStrength: 0.14, roughness: 0.075, shoreFoam: 0 },
  lake: { speed: 0.065, waveHeight: 0.004, rippleStrength: 0.25, roughness: 0.1, shoreFoam: 0 },
  pond: { speed: 0.025, waveHeight: 0.0005, rippleStrength: 0.055, roughness: 0.065, shoreFoam: 0 },
  fountain: { speed: 0.7, waveHeight: 0.001, rippleStrength: 0.7, roughness: 0.18, shoreFoam: 0 },
} as const;

export type WaterKind = keyof typeof WATER_PROFILES;

/**
 * Sky weight of the analytic water reflection, as a function of N.V.
 *
 * Schlick's fifth power is the physical curve, and at the 18-25 degree views
 * every site camera has of the pond and canal it leaves 8-15% sky: the water
 * read as a flat dark-centre gel (water/village, final-med-12). A cubic keeps
 * water's 2% head-on floor and lets the far bank take the sky first.
 * Working if water lightens toward the far bank at noon and stays dark overhead.
 */
export const WATER_FRESNEL_EXPONENT = 3;
/**
 * The physical curve, kept where no metre-scale ripple is drawn (Low). The
 * cubic stands in for the tilted normals of that ripple; on an unbroken
 * mirror it laid 23% sky over the whole pond at the water camera's ~23 degree
 * view and erased the deep centre (final-low-12 against base-low-12).
 * Working if the Low pond keeps a dark centre and Medium is unchanged.
 */
export const WATER_FRESNEL_EXPONENT_FLAT = 5;
export function waterFresnel(normalDotView: number, rippleDetail = 1): number {
  const facing = Math.min(1, Math.max(0, normalDotView));
  const detail = Math.min(1, Math.max(0, rippleDetail));
  const exponent =
    WATER_FRESNEL_EXPONENT_FLAT + (WATER_FRESNEL_EXPONENT - WATER_FRESNEL_EXPONENT_FLAT) * detail;
  return Math.min(0.95, Math.max(0.02, 0.02 + 0.98 * (1 - facing) ** exponent));
}

/**
 * Mirrored cloud deck and cat's paws on Medium and up (`WATER_SKY_DETAIL`).
 * `deckScale` maps the reflected ray's deck offset (x/y, z/y) to noise cells,
 * `cloud` thresholds the deck noise (cover shifts it), `cloudWeight` is the
 * mirrored cloud's share of the sky colour; `pawScale` is gust cells per metre
 * (about 14 m patches), `paw` thresholds them and `pawReflectance` is the sky
 * weight a full patch adds at 0.5 wind.
 */
export const WATER_SKY_DETAIL_PROFILE = {
  /**
   * The ray meets the deck at xz / (y + deckLift): smooth at every elevation.
   * The former max(y, 0.12) floor kinked the mapping and, under a 0.28-wide
   * cloud ramp at 0.55 weight, printed a hard diagonal edge across the pond
   * (final4-med-12 water).
   */
  deckLift: 0.25,
  deckScale: 3.2,
  /**
   * The deck is a finite height above the water, so the mirrored point moves
   * with the reflection point as well as the reflected direction: a world term
   * of deckScale / deckHeightMetres cells per metre. On direction alone a 12 m
   * canal seen from 70-150 m mirrored one uniform patch of deck along its whole
   * 220 m (final5-med-12 village).
   */
  deckHeightMetres: 200,
  cloud: [0.42, 0.86],
  cloudWeight: 0.38,
  pawScale: 0.07,
  paw: [0.45, 0.85],
  pawReflectance: 0.07,
} as const;

/**
 * Natural body for the lake, pond and canal on Medium and up: `weight` of the
 * way from the authored cyan toward `tint` (normalised to unit luminance) at
 * the same luminance. final4-med-12 rubric: "saturated cyan"; round 5's olive
 * at 0.7 read muddy at dawn and dusk (final5-med-06, 18:30), so the tint is a
 * muted blue-green between the two.
 */
export const WATER_NATURAL_PROFILE = {
  weight: 0.55,
  tint: [0.74, 1.07, 0.8],
} as const;

/** CPU mirror of the shader's natural-body shift, on a linear colour. */
export function naturalWaterBody(colour: THREE.Color, weight: number): THREE.Color {
  const luma = colour.r * 0.2126 + colour.g * 0.7152 + colour.b * 0.0722;
  const [r, g, b] = WATER_NATURAL_PROFILE.tint;
  const tintLuma = r * 0.2126 + g * 0.7152 + b * 0.0722;
  return colour.lerp(new THREE.Color(r, g, b).multiplyScalar(luma / tintLuma), weight);
}

/**
 * Far-bank reflection on bounded water (Medium and up). The reflected ray is
 * walked to the shore (`bankRadii`, metres: an ellipse, or straight walls
 * across U on a `crossOnly` canal); where it has risen less than the bank it
 * sees bank rather than sky, and the reflected sky darkens to `shade` at the
 * same hue. The bank's height is `bankMetres`, wandering by `bankVariation`
 * along the shore and broken by a finer reed and shrub term (`reedVariation`
 * at `reedScale`); the darkening ramps over `ramp` x that height. Round 5 put
 * a constant olive-green there over a 0.8 m ramp: a flat teal band along the
 * far shore (final5-med-06, 18:30, 22:00 water).
 */
export const WATER_BANK_PROFILE = {
  bankMetres: 1.0,
  bankVariation: 0.4,
  reedVariation: 0.35,
  reedScale: 9,
  ramp: [0.3, 1.7],
  shade: 0.45,
} as const;

/** CPU mirror of the bank term on the reflected colour: darker, same hue. */
export function waterBankReflection(reflected: THREE.Color, bankHit: number): THREE.Color {
  const hit = Math.min(1, Math.max(0, bankHit));
  return reflected.multiplyScalar(1 + (WATER_BANK_PROFILE.shade - 1) * hit);
}

/**
 * CPU mirror of the mirrored-cloud deck coordinate (time term omitted): the
 * reflected direction projected onto the deck plus the reflection point's own
 * offset under it.
 */
export function waterDeckCoord(
  reflected: THREE.Vector3,
  worldX: number,
  worldZ: number
): THREE.Vector2 {
  const { deckLift, deckScale, deckHeightMetres } = WATER_SKY_DETAIL_PROFILE;
  const perMetre = Number((deckScale / deckHeightMetres).toFixed(4));
  const lift = reflected.y + deckLift;
  return new THREE.Vector2(
    (reflected.x / lift) * deckScale + worldX * perMetre,
    (reflected.z / lift) * deckScale + worldZ * perMetre
  );
}

/**
 * Night sheen on still water (lake, pond, canal; Medium and up). Steep views
 * reflect the zenith, nearly black at night, over a body lit at 14%: the lake
 * centre went near-black at 22:00 (final5-med-22 water). After dark the
 * reflectance keeps `floor` and the reflection leans `horizon` of the way to
 * the night horizon's glow. Full below daylight[0], none above daylight[1]
 * (18:30 is 0.23, 19:00 is 0.046).
 */
export const WATER_NIGHT_PROFILE = {
  floor: 0.16,
  horizon: 0.5,
  daylight: [0.0, 0.3],
} as const;

/** Reflectance floor of the night sheen at a daylight value. */
export function waterNightSheen(daylight: number): number {
  const [start, end] = WATER_NIGHT_PROFILE.daylight;
  return WATER_NIGHT_PROFILE.floor * (1 - THREE.MathUtils.smoothstep(daylight, start, end));
}

/** Paired control for the bank reflection: 0 restores the sky exactly. */
export const WATER_BANK_DETAIL = { value: 1 };
/** Paired control for the deck and paws: 0 restores the earlier sky exactly. */
export const WATER_SKY_DETAIL = { value: 1 };
/** The displayed sky's cloud amount and lit cloud colour, written each frame. */
export const WATER_CLOUD_COVER = { value: 0.2 };
export const WATER_CLOUD_TONE = { value: new THREE.Color('#f4f6f2') };

/** Owned by WaterAnimationManager; small retained PBR surfaces share the same weather and pause. */
export const WATER_VISUAL_TIME = { value: 0 };
export const WATER_WIND = { value: 0.2 };

// Three curved, metre-scaled wave trains. Screen filtering removes unresolved
// slopes before specular shading, so quiet water stays quiet at a distance.
export const WATER_MICRO_NORMAL_GLSL = `
  vec2 millosWaterSlope(vec2 p, float t, float strength) {
    float c = dot(p, vec2(0.6, -0.8)) * 4.9 + t * 0.63;
    float a = dot(p, vec2(0.96, 0.28)) * 7.3 + t * 1.62 + cos(c) * 0.85;
    float b = dot(p, vec2(-0.45, 0.89)) * 11.7 - t * 1.09 + sin(a) * 0.35;
    vec3 filterWidth = vec3(fwidth(a), fwidth(b), fwidth(c));
    vec3 resolved = 1.0 - smoothstep(vec3(0.7), vec3(2.4), filterWidth);
    vec2 dc = -sin(c) * 4.9 * vec2(0.6, -0.8);
    vec2 da = cos(a) * (7.3 * vec2(0.96, 0.28) + dc * 0.85);
    vec2 db = cos(b) * (11.7 * vec2(-0.45, 0.89) + da * 0.35);
    return (da * resolved.x * 0.0048 + db * resolved.y * 0.0015
      + dc * resolved.z * 0.0028) * strength;
  }
`;

/** Pure water surfaces retain standard scene lights, environment, fog and tone mapping. */
export function applyWaterRipples(
  material: THREE.MeshStandardMaterial,
  time = WATER_VISUAL_TIME,
  kind: WaterKind = 'pond'
) {
  const profile = WATER_PROFILES[kind];
  material.roughness = profile.roughness;
  material.metalness = 0;
  material.name = `MillOS ${kind} water`;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.millosWaterTime = time;
    shader.uniforms.millosWaterWind = WATER_WIND;
    shader.uniforms.millosWaterSpeed = { value: profile.speed };
    shader.uniforms.millosWaterStrength = { value: profile.rippleStrength };
    shader.vertexShader = `varying vec3 vMillosWaterPosition;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvMillosWaterPosition = (modelMatrix * vec4(position, 1.0)).xyz;'
    );
    shader.fragmentShader = `
      varying vec3 vMillosWaterPosition;
      uniform float millosWaterTime;
      uniform float millosWaterWind;
      uniform float millosWaterSpeed;
      uniform float millosWaterStrength;
      ${WATER_MICRO_NORMAL_GLSL}
      ${shader.fragmentShader}`.replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      vec2 waterSlope = millosWaterSlope(vMillosWaterPosition.xz,
        millosWaterTime * millosWaterSpeed,
        millosWaterStrength * mix(0.7, 1.25, clamp(millosWaterWind, 0.0, 1.0)));
      normal = normalize(normal + mat3(viewMatrix) * vec3(waterSlope.x, 0.0, waterSlope.y));`
    );
  };
  material.customProgramCacheKey = () => 'millos-lit-water-ripples-v2';
}

/** Aerated splash footprints, shaded as matter. Each merged disc keeps its own UVs. */
export function applyFountainFoam(material: THREE.MeshStandardMaterial, time = WATER_VISUAL_TIME) {
  material.roughness = 0.65;
  material.metalness = 0;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.millosFoamTime = time;
    shader.vertexShader = `varying vec2 vMillosFoamUv;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvMillosFoamUv = uv;'
    );
    shader.fragmentShader = `
      varying vec2 vMillosFoamUv;
      uniform float millosFoamTime;
      ${shader.fragmentShader}`.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      vec2 foamGrid = vMillosFoamUv * 13.0;
      vec2 foamCell = floor(foamGrid);
      float foamSeed = fract(sin(dot(foamCell, vec2(127.1, 311.7))) * 43758.5453);
      float bubble = length(fract(foamGrid) - 0.5);
      float bubbleRim = smoothstep(0.15, 0.3, bubble) * (1.0 - smoothstep(0.3, 0.48, bubble));
      float foamEdge = 1.0 - smoothstep(0.55, 1.0, length(vMillosFoamUv * 2.0 - 1.0));
      float turnover = 0.7 + 0.3 * sin(millosFoamTime * 4.0 + foamSeed * 6.283185);
      diffuseColor.rgb *= mix(vec3(0.65, 0.78, 0.73), vec3(1.0), bubbleRim);
      diffuseColor.a *= foamEdge * (0.35 + 0.65 * bubbleRim) * turnover;`
    );
  };
  material.customProgramCacheKey = () => 'millos-fountain-impact-foam-v1';
}
