import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useGraphicsStore } from '../../stores/graphicsStore';
import { RENDER_ORDER, SHADOW_CONFIG } from '../../constants/renderLayers';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import {
  createCelestialState,
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
import { FOG_HORIZON_START, FOG_HORIZON_END } from '../../shaders/atmosphericFog';

/** Shared sunset tint for the sky and its mountain/terrain inscatter. */
export function getSkyTwilightWeight(solarElevation: number, twilight: number): number {
  // Clock-based twilight already reaches 29% at 16h, while the sun is still
  // 30 degrees high. Reserve the warm horizon for genuinely low solar angles.
  return (
    Math.min(0.72, twilight * 0.72) * (1 - THREE.MathUtils.smoothstep(solarElevation, 0.05, 0.35))
  );
}

/** Clear air reveals the rock; cloudier weather closes the depth layers. */
export function getRidgeAerialWeight(clearAerial: number, cloudCoverage: number): number {
  const cloudiness = THREE.MathUtils.clamp((cloudCoverage - 0.2) / 0.7, 0, 1);
  return clearAerial + (1 - clearAerial) * cloudiness * 0.68;
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
const optimizedSkyFragmentShader = `
uniform vec3 topColor;
uniform vec3 horizonColor;
uniform vec3 groundColor;
uniform vec3 uSunTint;
uniform float cloudAmount;
uniform float daylight;
uniform float uSunOpacity;
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

  vec4 clouds = millosSkyClouds(direction, cloudAmount, sunDir, uSunTint);
  float fieldStrength = mix( 1.0, 0.12 + smoothstep( 0.4, 0.85, cloudAmount ) * 0.88, uCloudAtlasReady );
  sky = mix(sky, clouds.rgb, clouds.a * fieldStrength);
  vec4 banks = millosCumulusBanks( direction, cloudAmount, sunDir, uSunTint );
  sky = mix( sky, banks.rgb, banks.a );

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
 * WRAPPED LAMBERT, not clamped: a mountainside 300 units away is lit by the
 * whole sky hemisphere, not by the sun alone, so the terminator has to wrap
 * past 90 degrees or the shadowed side goes black and reads as a hole.
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
const ridgeVertexShader = `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vRidgeColor;
varying vec3 vRidgeNormal;
varying vec3 vRidgePosition;
varying float vRidgeHeight;
varying float vRidgeDistance;
attribute float ridgeHeight;

void main() {
  vRidgeColor = color;
  vRidgeNormal = normalize(mat3(modelMatrix) * normal);
  vRidgePosition = position;
  vRidgeHeight = ridgeHeight;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vRidgeDistance = length(mvPosition.xyz);
  gl_Position = projectionMatrix * mvPosition;
  #include <logdepthbuf_vertex>
}
`;

const ridgeFragmentShader = `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform vec3 uShadowTint;
uniform vec3 uInscatter;
uniform float uAerial;
uniform float uDetailStrength;
uniform float uWorldAnchored;
varying vec3 vRidgeColor;
varying vec3 vRidgeNormal;
varying vec3 vRidgePosition;
varying float vRidgeHeight;
varying float vRidgeDistance;

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

void main() {
  #include <logdepthbuf_fragment>
  vec3 normal = normalize(vRidgeNormal);
  // Metre-space geology, stable on the mountain's rest mesh. The existing
  // paired surface control can remove this finish without reloading the page.
  vec3 p = vRidgePosition;
  // Two continuous vertical projections avoid both an angular seam and the
  // collapsed stripes of one oblique planar projection around a whole ring.
  float faceWeight = abs(normal.x) / max(0.001, abs(normal.x) + abs(normal.z));
  float rock = smoothstep(0.48, 0.84,
    vRidgeHeight + (ridgeNoise(p.xz * 0.055) - 0.5) * 0.22);
  float forest = ridgeFbm(p.xz * 0.18 + p.y * 0.045);
  float veins = mix(ridgeFbm(p.xy * vec2(0.11, 0.16)),
    ridgeFbm(p.zy * vec2(0.11, 0.16)), faceWeight);
  float scree = ridgeFbm(p.xz * 0.48 + p.y * 0.62 + veins * 3.0);
  float meadow = smoothstep(0.42, 0.68, ridgeFbm(p.xz * 0.043));
  // Separate broad meadow and woodland patches from the mineral upper slopes.
  // These values are linear albedo, before lighting and atmospheric extinction.
  // Working if the paired surface control removes the patches without changing the silhouette.
  vec3 vegetation = mix(vec3(0.068, 0.104, 0.032),
    vec3(0.21, 0.245, 0.074), meadow);
  float finish = mix(0.5 + forest * 1.15, 0.4 + veins * 0.8 + scree * 0.32, rock);
  vec3 detailedAlbedo = mix(vegetation, vRidgeColor, rock) * finish;
  vec3 albedo = mix(vRidgeColor, detailedAlbedo, uDetailStrength);
  float relief = mix(forest * 0.32, veins * 0.7 + scree * 0.16, rock) * uDetailStrength;
  vec3 dx = dFdx(p), dy = dFdy(p);
  vec3 rx = cross(dy, normal), ry = cross(normal, dx);
  float determinant = dot(dx, rx);
  if (abs(determinant) > 0.000001) {
    normal = normalize(abs(determinant) * normal - sign(determinant) *
      (dFdx(relief) * rx + dFdy(relief) * ry));
  }
  float ndl = clamp(dot(normal, uSunDirection) * 0.5 + 0.5, 0.0, 1.0);
  vec3 lit = albedo * mix(uShadowTint, uSunColor, pow(ndl, 0.9));

  lit.r = mix(lit.r, uInscatter.r, clamp(uAerial * 0.80, 0.0, 1.0));
  lit.g = mix(lit.g, uInscatter.g, clamp(uAerial * 1.00, 0.0, 1.0));
  lit.b = mix(lit.b, uInscatter.b, clamp(uAerial * 1.20, 0.0, 1.0));

  // Valley haze. Air pools in the valleys, so they sit further back than the
  // peaks that rise out of it - the cue that turns a silhouette into a range.
  lit = mix(lit, uInscatter, (1.0 - vRidgeHeight) * uAerial * 0.20);
  // Blend into the actual remote landscape before reaching the far plane.
  // An opaque fog-colour fade made near peaks paler than the distant range.
  float opacity = 1.0 - uWorldAnchored * smoothstep(
    ${FOG_HORIZON_START.toFixed(1)}, ${(FOG_HORIZON_END - 32).toFixed(1)}, vRidgeDistance);

  gl_FragColor = vec4(lit, opacity);
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
  float maria = smoothstep(0.42, 0.68, noise(position * 2.1) + noise(position * 5.4) * 0.22);
  float surface = noise(position * 18.0) * 0.13 + noise(position * 37.0) * 0.06;
  float craters =
      crater(position, normalize(vec3(0.32, 0.18, 0.93)), 0.2) +
      crater(position, normalize(vec3(-0.48, 0.36, 0.8)), 0.16) +
      crater(position, normalize(vec3(0.62, -0.34, 0.7)), 0.12) +
      crater(position, normalize(vec3(-0.2, -0.58, 0.79)), 0.1);
  vec3 highland = vec3(0.78, 0.8, 0.79);
  vec3 lowland = vec3(0.34, 0.39, 0.43);
  vec3 colour = mix(highland, lowland, maria * 0.72);
  colour *= 0.86 + surface - craters * 0.28;
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
moonMaterial.customProgramCacheKey = () => 'millos-procedural-moon-v1';
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
}: MountainRidgeSpec): THREE.BufferGeometry {
  const segments = MOUNTAIN_RIDGE_SEGMENTS;
  const rows = MOUNTAIN_RIDGE_ROWS;
  const positions: number[] = [];
  const vertexColors: number[] = [];
  const ridgeHeights: number[] = [];
  const indices: number[] = [];
  const palette = colors.map((color) => new THREE.Color(color));

  for (let index = 0; index <= segments; index += 1) {
    const progress = index === segments ? 0 : index / segments;
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
    const profile = floor + ((rolling + massif + ridge) / 1.07) * (0.98 - floor);
    const height = THREE.MathUtils.lerp(minHeight, maxHeight, profile);
    const baseRadius =
      radius + Math.sin(angle * 5 + seed) * 1.5 + Math.sin(angle * 13 - seed) * 0.55;
    const facetTint =
      0.9 + Math.sin(angle * 11 + seed * 2.4) * 0.065 + Math.sin(angle * 23 - seed) * 0.032;

    for (let row = 0; row < rows; row += 1) {
      const heightRatio = row / (rows - 1);
      const shoulderRipple =
        Math.sin(angle * 9 + seed * 1.7 + heightRatio * 0.6) * slopeDepth * heightRatio * 0.035 +
        Math.sin(angle * 19 + seed + heightRatio * 0.4) *
          slopeDepth *
          Math.sin(heightRatio * Math.PI) *
          0.12;
      const localRadius = baseRadius + slopeDepth * Math.pow(heightRatio, 1.55) + shoulderRipple;
      const terraceHeight =
        baseY +
        height * (heightRatio * 0.16 + Math.pow(heightRatio, 1.24) * 0.84) -
        ((1 - Math.cos(angle * 17 + seed)) * 0.028 +
          Math.pow(1 - Math.abs(Math.sin(angle * 47 + seed + heightRatio * 0.8)), 5) * 0.055) *
          height *
          Math.sin(heightRatio * Math.PI);
      positions.push(
        Math.cos(angle) * localRadius,
        row === 0 && baseClosureY !== undefined ? baseClosureY : terraceHeight,
        Math.sin(angle) * localRadius
      );
      // Combined so the haze pools where the ring is BOTH low on the slope and
      // in a valley of the profile, which is where real air collects.
      ridgeHeights.push(THREE.MathUtils.clamp(heightRatio * 0.55 + profile * 0.45, 0, 1));

      const rockBlend = THREE.MathUtils.smoothstep(heightRatio, 0.12, 0.78);
      const snowAmount =
        THREE.MathUtils.smoothstep(profile, snowLine - 0.09, snowLine + 0.13) *
        THREE.MathUtils.smoothstep(heightRatio, 0.7, 0.98);
      const color = palette[0]
        .clone()
        .lerp(palette[1], rockBlend)
        .lerp(palette[2], snowAmount)
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
  maxHeight: 155,
  slopeDepth: 55,
  valleyFloor: 0.17,
  snowLine: 0.73,
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
  maxHeight: 100,
  slopeDepth: 150,
  valleyFloor: 0.07,
  snowLine: 0.77,
  seed: 1.83,
  colors: ['#3f5548', '#6e7873', '#eaf0f2'],
});
const nearHillGeometry = createMountainRidgeGeometry({
  // Real broad foothills begin beyond the playable perimeter. Their fixed
  // origin keeps them behind the groves while supplying natural parallax.
  radius: SITE_LAYOUT.world.radius + 16,
  baseY: -2,
  minHeight: 2,
  // Lower foothills leave the distant ranges and grain elevator distinct.
  // Working if the overview ridge stays below the gantry instead of forming a cone above it.
  maxHeight: 45,
  slopeDepth: 112,
  valleyFloor: 0.025,
  snowLine: 1.1,
  seed: 3.41,
  colors: ['#435536', '#62704d', '#93a08f'],
});

/** Actual backdrop meshes, shared with the site-visibility regression check. */
export const MOUNTAIN_RIDGE_GEOMETRIES = [
  farMountainGeometry,
  midMountainGeometry,
  nearHillGeometry,
] as const;

const dayTop = new THREE.Color('#70aed8');
const nightTop = new THREE.Color('#071426');
const dayHorizon = new THREE.Color('#a3cce2');
const nightHorizon = new THREE.Color('#26364b');
const dawnHorizon = new THREE.Color('#e8a66d');
// Ground bounce, not more sky. This band is what the dome shows below the
// horizon, and it was '#a6cbd5' - a paler blue than the sky above it, which
// reads as a second sky rather than as light coming back off the site. The
// exterior grass albedo is '#365844' (`exterior/OptimizedExterior.tsx`), so
// the correct colour here is that albedo scattered back up through haze.
const dayGround = new THREE.Color('#8fae9e');
const nightGround = new THREE.Color('#1e2f42');
const dayCloud = new THREE.Color('#f4f6f2');
const nightCloud = new THREE.Color('#4d586a');
// Unlit cloud bottoms. '#596575' was a night blue applied all day, so overcast
// cloud read as a bruise rather than as grey volume.
const dayCloudShadow = new THREE.Color('#93a0ad');
const nightCloudShadow = new THREE.Color('#28303f');
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
const cameraForwardScratch = new THREE.Vector3();

/**
 * One material per range. Broad fixed foothills supply parallax, with aerial
 * extinction separating them from the camera-locked remote horizon.
 */
function createRidgeMaterial(
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
    // Fixed hills blend with the remote range in the far-distance guard.
    // The existing opaque site depth keeps every tree and structure in front.
    transparent: worldAnchored,
    depthWrite: !worldAnchored,
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
      uWorldAnchored: { value: worldAnchored ? 1 : 0 },
    },
  });
  material.userData.clearAerial = aerial;
  material.customProgramCacheKey = () => 'millos-ridge-aerial-geology-v6';
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
      fragmentShader: optimizedSkyFragmentShader,
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
        // Pre-wrapped to [0,1) on the CPU every frame. Scrolling the texture
        // from a raw simulation-minute count instead would lose texture-space
        // precision over a long session and the clouds would visibly step.
        uCloudDrift: { value: new THREE.Vector2() },
        uCirrusDrift: { value: new THREE.Vector2() },
        uCloudNoise: { value: getCloudNoiseTexture() },
        uCloudAtlas: { value: getCumulusAtlas().texture },
        uCloudAtlasReady: getCumulusAtlas().ready,
        cloudAmount: { value: 0.2 },
        daylight: { value: 1 },
        sunDirection: { value: new THREE.Vector3(0.5, 0.75, -0.4).normalize() },
      },
    });
    material.customProgramCacheKey = () => 'millos-optimized-sky-v8';
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
    if (!useGameSimulationStore.getState().isTabVisible) return;
    const { gameDay, gameTime, gameSpeed, weather } = useGameSimulationStore.getState();
    const smoothedGameTime = getSmoothedGameTime(gameTime, delta, gameSpeed);
    const atmosphere = sampleAtmosphere(gameDay, smoothedGameTime, weather);
    const celestial = sampleCelestial(atmosphere, celestialStateRef.current);
    const visualDaylight = atmosphere.daylight * atmosphere.lightMultiplier;
    const response = 3.2;

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
    targetTopScratch.copy(nightTop).lerp(dayTop, visualDaylight);
    targetHorizonScratch
      .copy(nightHorizon)
      .lerp(dayHorizon, visualDaylight)
      .lerp(dawnHorizon, getSkyTwilightWeight(atmosphere.solarElevation, atmosphere.twilight));
    targetGroundScratch.copy(nightGround).lerp(dayGround, visualDaylight);
    targetCloudScratch.copy(nightCloud).lerp(dayCloud, visualDaylight);
    targetCloudShadowScratch.copy(nightCloudShadow).lerp(dayCloudShadow, visualDaylight);
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
      sunLightRef.current.position.set(
        sunDirectionScratch.x * 120,
        Math.max(8, sunDirectionScratch.y * 120),
        sunDirectionScratch.z * 120
      );
      sunLightRef.current.intensity = THREE.MathUtils.damp(
        sunLightRef.current.intensity,
        celestial.sunLightIntensity,
        response,
        delta
      );
      colorScratch.copy(lightDay).lerp(lightGolden, celestial.goldenHour);
      sunLightRef.current.color.copy(colorScratch);
    }
    if (moonLightRef.current) {
      moonLightRef.current.position.set(
        moonDirectionScratch.x * 110,
        Math.max(12, moonDirectionScratch.y * 110),
        moonDirectionScratch.z * 110
      );
      moonLightRef.current.intensity = THREE.MathUtils.damp(
        moonLightRef.current.intensity,
        celestial.moonLightIntensity,
        response,
        delta
      );
    }
    if (ambientLightRef.current) {
      ambientLightRef.current.intensity = THREE.MathUtils.damp(
        ambientLightRef.current.intensity,
        celestial.ambientLightIntensity,
        response,
        delta
      );
      colorScratch.copy(nightHorizon).lerp(dayHorizon, visualDaylight);
      ambientLightRef.current.color.copy(colorScratch);
    }
    if (starsMaterialRef.current) {
      starsMaterialRef.current.opacity = THREE.MathUtils.damp(
        starsMaterialRef.current.opacity,
        celestial.starOpacity * 0.82,
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
    for (const ridgeMaterial of ridgeMaterials.all) {
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
