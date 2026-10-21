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
export function waterFresnel(normalDotView: number): number {
  const facing = Math.min(1, Math.max(0, normalDotView));
  return Math.min(0.95, Math.max(0.02, 0.02 + 0.98 * (1 - facing) ** WATER_FRESNEL_EXPONENT));
}

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
