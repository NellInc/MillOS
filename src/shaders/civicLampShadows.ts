import * as THREE from 'three';
import {
  CIVIC_WORLD_LIGHTS,
  CIVIC_SHADOW_FACE_SIZE,
  CIVIC_SHADOW_ATLAS_SIZE,
  CIVIC_CUBE_FACE_BASES,
  CIVIC_SHADOW_CONVENTION,
  CIVIC_SOURCE_LOOKUP,
} from '../constants/civicSquareLighting';

export const CIVIC_SHADOW_KEY = 'millos-civic-lamp-visibility-v4';
export const CIVIC_SHADOW_STRENGTH = { value: 1 };
export const CIVIC_SHADOW_ATLAS: { value: THREE.Texture | null } = {
  value: null,
};
const sources = {
  value: CIVIC_WORLD_LIGHTS.map((l) => new THREE.Vector4(...l.position, l.distance)),
};
// Source origins, not receiver bounds. Moving a fixture must never silently
// bypass occlusion through an old hand-copied village envelope.
// Working if every manifest origin clears this early-out, including grove lamps.
const sourceBounds = [0, 2].map((axis) => ({
  min: Math.min(...CIVIC_WORLD_LIGHTS.map((l) => l.position[axis])) - 0.05,
  max: Math.max(...CIVIC_WORLD_LIGHTS.map((l) => l.position[axis])) + 0.05,
}));
type Hook = THREE.Material['onBeforeCompile'];
type Key = THREE.Material['customProgramCacheKey'];
const hooks = new WeakMap<
  THREE.Material,
  { before: Hook; key: Key; installed: Hook; installedKey: Key }
>();

export function validateCivicShadowBake(data: {
  convention?: string;
  faceBases?: unknown;
  sourceLookup?: unknown;
  faceSize?: number;
  atlasSize?: readonly number[];
  sources?: { id: string; position: readonly number[]; distance: number }[];
}): void {
  if (
    data.convention !== CIVIC_SHADOW_CONVENTION ||
    JSON.stringify(data.sourceLookup) !== JSON.stringify(CIVIC_SOURCE_LOOKUP) ||
    JSON.stringify(data.faceBases) !== JSON.stringify(CIVIC_CUBE_FACE_BASES) ||
    data.faceSize !== CIVIC_SHADOW_FACE_SIZE ||
    data.atlasSize?.some((v, i) => v !== CIVIC_SHADOW_ATLAS_SIZE[i]) ||
    data.atlasSize?.length !== 2 ||
    data.sources?.length !== CIVIC_WORLD_LIGHTS.length
  )
    throw new Error('Stale civic lamp visibility atlas: dimensions/source inventory changed');
  for (const [i, light] of CIVIC_WORLD_LIGHTS.entries()) {
    const baked = data.sources![i];
    if (
      baked.id !== light.id ||
      baked.distance !== light.distance ||
      baked.position.length !== 3 ||
      baked.position.some((v, k) => Math.abs(v - light.position[k]) > 0.00001)
    )
      throw new Error(`Stale civic lamp visibility atlas: ${light.id} moved`);
  }
}

/** Exact wrapper identity, never a cache-key/name heuristic. */
export function civicUnderlyingHooks(material: THREE.Material) {
  const entry = hooks.get(material);
  return entry &&
    material.onBeforeCompile === entry.installed &&
    material.customProgramCacheKey === entry.installedKey
    ? entry
    : undefined;
}

// Radial depth, RG16 linear bytes. Each source owns one row of six faces.
// Receiver UV0/UV1, albedo, normals, wind and window shaders are untouched.
const shadowGLSL = `
uniform sampler2D civicDepthAtlas;
uniform float civicShadowStrength;
uniform vec4 civicSources[${CIVIC_WORLD_LIGHTS.length}];
vec3 civicToWorld(vec3 v) {
  return vec3(dot(viewMatrix[0].xyz, v), dot(viewMatrix[1].xyz, v), dot(viewMatrix[2].xyz, v));
}
float civicDepthPass(vec2 uv, float receiver, float range) {
  vec2 rg = texture2D(civicDepthAtlas, uv).rg;
  float depth = (rg.r * 65280.0 + rg.g * 255.0) / 65535.0 * range;
  return step(receiver - (0.035 + receiver * 0.003), depth);
}
vec3 civicFaceDirection(float face, vec2 p) {
  ${CIVIC_CUBE_FACE_BASES.map((axes, i) => `if (face < ${i + 0.5}) return vec3(${axes[0].map((v) => `${v}.0`).join(',')}) + p.x * vec3(${axes[1].map((v) => `${v}.0`).join(',')}) + p.y * vec3(${axes[2].map((v) => `${v}.0`).join(',')});`).join('\n  ')}
  return vec3(0.0, 0.0, -1.0);
}
void civicProject(vec3 direction, out float face, out vec2 p) {
  vec3 a = abs(direction);
  if (a.x >= a.y && a.x >= a.z) {
    face = direction.x > 0.0 ? 0.0 : 1.0;
    p = vec2(direction.x > 0.0 ? -direction.z : direction.z, -direction.y) / max(a.x, 0.0001);
  } else if (a.y >= a.z) {
    face = direction.y > 0.0 ? 2.0 : 3.0;
    p = vec2(direction.x, direction.y > 0.0 ? direction.z : -direction.z) / max(a.y, 0.0001);
  } else {
    face = direction.z > 0.0 ? 4.0 : 5.0;
    p = vec2(direction.z > 0.0 ? direction.x : -direction.x, -direction.y) / max(a.z, 0.0001);
  }
}
float civicVisibility(vec3 lightView, vec3 receiverView) {
  if (civicShadowStrength < 0.001) return 1.0;
  vec3 source = civicToWorld(lightView) + cameraPosition;
  // Distant unrelated sources take no atlas samples. Matched positions are
  // derived from the actual landmark transform, not a duplicate world offset.
  if (source.x < ${sourceBounds[0].min.toFixed(3)} || source.x > ${sourceBounds[0].max.toFixed(3)} || source.z < ${sourceBounds[1].min.toFixed(3)} || source.z > ${sourceBounds[1].max.toFixed(3)}) return 1.0;
  vec2 size = vec2(${CIVIC_SHADOW_ATLAS_SIZE[0]}.0, ${CIVIC_SHADOW_ATLAS_SIZE[1]}.0);
  float slot = mod(dot(floor(source * ${CIVIC_SOURCE_LOOKUP.quantization}.0 + ${CIVIC_SOURCE_LOOKUP.bias}), vec3(${CIVIC_SOURCE_LOOKUP.coefficients.map((v) => `${v}.0`).join(',')})), ${CIVIC_SOURCE_LOOKUP.slots}.0);
  vec2 lookup = vec2(${CIVIC_SOURCE_LOOKUP.origin[0]}.0 + mod(slot, ${CIVIC_SOURCE_LOOKUP.width}.0), floor(slot / ${CIVIC_SOURCE_LOOKUP.width}.0));
  float encoded = floor(texture2D(civicDepthAtlas, (lookup + 0.5) / size).r * 255.0 + 0.5);
  // Zero means no civic source. Bounds precede dynamic uniform indexing.
  if (encoded < 1.0 || encoded > ${CIVIC_WORLD_LIGHTS.length}.0) return 1.0;
  int i = int(encoded) - 1;
  vec3 delta = source - civicSources[i].xyz;
  if (dot(delta, delta) >= 0.0004) return 1.0;
  vec3 direction = civicToWorld(receiverView - lightView);
  float receiver = length(direction);
  float face;
  vec2 p;
  civicProject(direction, face, p);
  // Reproject edge-crossing PCF taps into the neighboring cube face.
  // Half-texel bounds then prevent sampling another lamp's atlas row.
  float visibility = 0.0;
  for (int tap = 0; tap < 5; tap++) {
    vec2 offset = tap == 1 ? vec2(1.0, 0.0) : tap == 2 ? vec2(-1.0, 0.0)
      : tap == 3 ? vec2(0.0, 1.0) : tap == 4 ? vec2(0.0, -1.0) : vec2(0.0);
    float tapFace;
    vec2 tapP;
    civicProject(civicFaceDirection(face, p + offset * (2.0 / ${CIVIC_SHADOW_FACE_SIZE}.0)), tapFace, tapP);
    vec2 origin = vec2(tapFace, float(i)) * ${CIVIC_SHADOW_FACE_SIZE}.0;
    vec2 at = (tapP * 0.5 + 0.5) * ${CIVIC_SHADOW_FACE_SIZE}.0;
    vec2 uv = (origin + clamp(at, vec2(0.5), vec2(${CIVIC_SHADOW_FACE_SIZE - 0.5}))) / size;
    visibility += civicDepthPass(uv, receiver, civicSources[i].w);
  }
  return mix(1.0, visibility * 0.2, civicShadowStrength);
}
`;

export function injectCivicLampShadows(shader: THREE.WebGLProgramParametersWithUniforms): void {
  // Authored geometry clones retain their source callback. A later wrapper
  // may therefore reach the same shader twice. Exact owned uniform references
  // and the retained full helper prove this injection, never just a name/key.
  // Working if copied host callbacks preserve one declaration and one effect.
  if (
    shader.uniforms.civicDepthAtlas === CIVIC_SHADOW_ATLAS &&
    shader.uniforms.civicShadowStrength === CIVIC_SHADOW_STRENGTH &&
    shader.uniforms.civicSources === sources &&
    shader.fragmentShader.includes(shadowGLSL)
  )
    return;
  shader.uniforms.civicDepthAtlas = CIVIC_SHADOW_ATLAS;
  shader.uniforms.civicShadowStrength = CIVIC_SHADOW_STRENGTH;
  shader.uniforms.civicSources = sources;
  let chunk = THREE.ShaderChunk.lights_fragment_begin;
  for (const type of ['point', 'spot']) {
    const variable = `${type}Light`;
    const call = `get${type === 'point' ? 'Point' : 'Spot'}LightInfo( ${variable}, geometryPosition, directLight );`;
    if (chunk.split(call).length !== 2)
      throw new Error('Three civic shadow incident-light contract changed');
    chunk = chunk.replace(
      call,
      `${call}\nif (directLight.visible) directLight.color *= civicVisibility(${variable}.position, geometryPosition);`
    );
  }
  if (!shader.fragmentShader.includes('#include <lights_fragment_begin>'))
    throw new Error('Civic shadows require the retained Standard light assembly');
  shader.fragmentShader =
    shadowGLSL + shader.fragmentShader.replace('#include <lights_fragment_begin>', chunk);
}

/** Compose the retained host once. Clones are rewired by the scene installer. */
export function applyCivicLampShadows(material: THREE.Material): boolean {
  // Troika's getter invokes the base, then its user callback. Assigning a
  // wrapper that calls that getter re-enters itself and expands shader caches.
  // Finish the retained base before derivation, preserving its accessor/host.
  // Working if real derived text compiles once and repeated sweeps stay inert.
  const derived = material as THREE.Material & {
    isDerivedMaterial?: boolean;
    baseMaterial?: THREE.Material;
  };
  if (derived.isDerivedMaterial) {
    return derived.baseMaterial && derived.baseMaterial !== material
      ? applyCivicLampShadows(derived.baseMaterial)
      : false;
  }
  if (!(material instanceof THREE.MeshStandardMaterial) || civicUnderlyingHooks(material))
    return false;
  const before = material.onBeforeCompile;
  const key = material.customProgramCacheKey;
  const baseKey = key.call(material);
  const installed: Hook = function (this: THREE.Material, shader, renderer) {
    before.call(this, shader, renderer);
    injectCivicLampShadows(shader);
  };
  const installedKey: Key = () => `${baseKey}|${CIVIC_SHADOW_KEY}`;
  hooks.set(material, { before, key, installed, installedKey });
  material.onBeforeCompile = installed;
  material.customProgramCacheKey = installedKey;
  material.needsUpdate = true;
  return true;
}
