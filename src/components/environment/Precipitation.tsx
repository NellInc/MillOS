import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useGraphicsStore, type GraphicsQuality } from '../../stores/graphicsStore';
import { createAtmosphereState, sampleAtmosphere } from '../../simulation/atmosphere';
import { useReducedMotion } from '../../hooks/useReducedMotion';

/**
 * Rain, in the world.
 *
 * The weather model had a precipitation rate, and the only thing that drew it
 * was a DOM overlay raised by weather alerts: in the rain capture not one frame
 * showed a falling drop. This is one camera-local volume of streaks:
 *
 *   - ONE draw call: `LineSegments`, two vertices per drop, every drop's motion
 *     computed in the vertex shader from a per-drop seed and one time uniform.
 *     No per-frame buffer upload, no allocation, no shadow caster, no light.
 *   - TIER-AWARE: the drop count is a draw range over one buffer sized for the
 *     largest tier, so a tier or weather change never reallocates or recompiles.
 *   - NOT INDOORS: drops inside the hall's roofed footprint are discarded.
 *   - REDUCED MOTION: the streaks hold still (the rain still reads) instead of
 *     falling.
 *
 * Time is the render clock, not the game clock: rain falls at real speed under
 * any shift pace and keeps falling while the shift is paused, like the clouds.
 */
export const PRECIPITATION = {
  /** Half-width of the camera-local volume, metres. */
  halfExtent: 34,
  /** Height of the volume, metres, centred a little above the eye. */
  height: 36,
  /** Terminal velocity of rain, metres per second. */
  fallSpeed: 9.5,
  /** Streak length, metres: about 1/12 s of fall, a camera exposure's smear. */
  streak: 0.8,
  maxDrops: 7000,
  perTier: { low: 1400, medium: 3200, high: 5200, ultra: 7000 } satisfies Record<
    GraphicsQuality,
    number
  >,
  opacity: 0.34,
  color: '#c3cdd6',
} as const;

const HALL = SITE_LAYOUT.factory.bounds;

/** Drops are discarded under the hall roof. Mirrors the vertex shader. */
export function rainReachesPoint(x: number, y: number, z: number): boolean {
  const inside = x > HALL.minX && x < HALL.maxX && z > HALL.minZ && z < HALL.maxZ && y < HALL.maxY;
  return !inside;
}

export function precipitationDropCount(quality: GraphicsQuality, precipitation: number): number {
  if (!Number.isFinite(precipitation) || precipitation <= 0.01) return 0;
  const rate = Math.min(1, precipitation);
  const budget = PRECIPITATION.perTier[quality] ?? PRECIPITATION.perTier.medium;
  // A light shower is sparser, not just fainter.
  return Math.min(PRECIPITATION.maxDrops, Math.round(budget * (0.35 + 0.65 * rate)));
}

const f = (value: number) => value.toFixed(3);

const vertexShader = /* glsl */ `
attribute vec3 aSeed;
attribute float aEnd;
uniform float uTime;
uniform vec2 uWind;
varying float vAlpha;
void main() {
  vec3 size = vec3( ${f(PRECIPITATION.halfExtent * 2)}, ${f(PRECIPITATION.height)}, ${f(PRECIPITATION.halfExtent * 2)} );
  // Fall and drift in a volume that wraps around the camera, so the field is
  // continuous as the camera moves and never runs out of drops.
  vec3 velocity = vec3( uWind.x, -${f(PRECIPITATION.fallSpeed)}, uWind.y );
  vec3 travel = velocity * uTime * ( 0.85 + 0.3 * aSeed.y );
  vec3 origin = cameraPosition - vec3( size.x * 0.5, size.y * 0.4, size.z * 0.5 );
  vec3 local = mod( aSeed * size + travel - origin, size );
  vec3 world = origin + local;
  // The tail trails behind the head along the velocity.
  world -= normalize( velocity ) * ${f(PRECIPITATION.streak)} * aEnd;
  bool indoors = world.x > ${f(HALL.minX)} && world.x < ${f(HALL.maxX)}
    && world.z > ${f(HALL.minZ)} && world.z < ${f(HALL.maxZ)} && world.y < ${f(HALL.maxY)};
  float eyeDistance = length( world - cameraPosition );
  // Thin near the eye (a drop on the lens reads as a scratch) and at the edge
  // of the volume, so the wrap is never seen.
  vAlpha = indoors ? 0.0
    : smoothstep( 1.5, 4.0, eyeDistance ) * ( 1.0 - smoothstep( ${f(PRECIPITATION.halfExtent * 0.6)}, ${f(PRECIPITATION.halfExtent)}, eyeDistance ) )
      * ( 1.0 - 0.5 * aEnd );
  gl_Position = projectionMatrix * viewMatrix * vec4( world, 1.0 );
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;
void main() {
  if ( vAlpha <= 0.001 ) discard;
  gl_FragColor = vec4( uColor, uOpacity * vAlpha );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function createRainGeometry(): THREE.BufferGeometry {
  const seeds = new Float32Array(PRECIPITATION.maxDrops * 2 * 3);
  const ends = new Float32Array(PRECIPITATION.maxDrops * 2);
  // Deterministic: the same field every load, so paired captures agree.
  let state = 0x9e3779b9;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
  for (let drop = 0; drop < PRECIPITATION.maxDrops; drop += 1) {
    const sx = random();
    const sy = random();
    const sz = random();
    for (let end = 0; end < 2; end += 1) {
      const vertex = drop * 2 + end;
      seeds.set([sx, sy, sz], vertex * 3);
      ends[vertex] = end;
    }
  }
  const geometry = new THREE.BufferGeometry();
  // `position` is required by three; the shader places every vertex itself.
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(seeds.length), 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
  geometry.setAttribute('aEnd', new THREE.BufferAttribute(ends, 1));
  geometry.setDrawRange(0, 0);
  return geometry;
}

export function Precipitation() {
  const quality = useGraphicsStore((state) => state.graphics.quality);
  const reducedMotion = useReducedMotion();
  const geometry = useMemo(() => createRainGeometry(), []);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        name: 'world-precipitation',
        vertexShader,
        fragmentShader,
        uniforms: {
          uTime: { value: 0 },
          uWind: { value: new THREE.Vector2() },
          uColor: { value: new THREE.Color(PRECIPITATION.color) },
          uOpacity: { value: PRECIPITATION.opacity },
        },
        transparent: true,
        depthWrite: false,
        fog: false,
        toneMapped: true,
      }),
    []
  );
  const atmosphere = useMemo(() => createAtmosphereState(), []);
  const lines = useMemo(() => {
    const segments = new THREE.LineSegments(geometry, material);
    segments.name = 'world-precipitation';
    // The volume follows the camera, so its bounds are wherever the eye is.
    segments.frustumCulled = false;
    segments.renderOrder = 5;
    return segments;
  }, [geometry, material]);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material]
  );

  useFrame((_, delta) => {
    const { gameDay, gameTime, weather, isTabVisible } = useGameSimulationStore.getState();
    const sample = sampleAtmosphere(gameDay, gameTime, weather, atmosphere);
    const drops = precipitationDropCount(quality, sample.precipitation);
    lines.visible = drops > 0 && isTabVisible;
    if (!lines.visible) return;
    geometry.setDrawRange(0, drops * 2);
    if (!reducedMotion) {
      // Wrapped well inside float precision; the field is periodic anyway.
      material.uniforms.uTime.value = (material.uniforms.uTime.value + Math.min(delta, 0.1)) % 3600;
    }
    // Wind slants the fall; storm rain drives hard.
    const wind = sample.wind * 3.2;
    (material.uniforms.uWind.value as THREE.Vector2).set(wind * 0.8, wind * 0.6);
    material.uniforms.uOpacity.value = PRECIPITATION.opacity * (0.7 + 0.3 * sample.precipitation);
  });

  return <primitive object={lines} />;
}
