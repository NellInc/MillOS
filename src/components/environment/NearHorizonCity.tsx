import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { RENDER_ORDER } from '../../constants/renderLayers';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { getExteriorLampLevel } from '../exterior/ExteriorLighting';

const deterministicNoise = (index: number, channel: number): number => {
  const value = Math.sin(index * 91.731 + channel * 37.117 + 8.913) * 43758.5453;
  return value - Math.floor(value);
};

export const HORIZON_CITY_SEGMENTS = 96;
export const HORIZON_CITY_BASE_RADIUS = SITE_LAYOUT.world.horizonRadius - 2;
export const HORIZON_CITY_BASE_Y = -2;
// The same south-east skyline sector used by the v0.30 horizon ring.
export const HORIZON_CITY_START_ANGLE = Math.PI * -0.35;
export const HORIZON_CITY_END_ANGLE = Math.PI * -0.05;

/**
 * Build one continuous distant silhouette rather than a collection of nearby
 * boxes. Repeating each height across several segments gives the skyline flat
 * roofs and occasional stepped or spired landmarks while the low infill keeps
 * the horizon closed between buildings.
 */
export const buildHorizonCityProfile = (segments = HORIZON_CITY_SEGMENTS): number[] => {
  const heights = new Array<number>(segments + 1).fill(0);
  let cursor = 0;

  while (cursor <= segments) {
    if (deterministicNoise(cursor, 0) < 0.38) {
      heights[cursor] = 1.8 + deterministicNoise(cursor, 1) * 2.2;
      cursor += 1;
      continue;
    }

    const width = 2 + Math.floor(deterministicNoise(cursor, 2) * 4);
    const landmark = deterministicNoise(cursor, 3) > 0.92;
    const stepBack = !landmark && deterministicNoise(cursor, 4) > 0.72;
    const buildingHeight = 7 + deterministicNoise(cursor, 5) * 16 + (landmark ? 10 : 0);
    const centre = Math.floor(width / 2);

    for (let offset = 0; offset < width && cursor <= segments; offset += 1) {
      const crown = stepBack ? 0.82 + Math.sin(((offset + 0.5) / width) * Math.PI) * 0.18 : 1;
      const spire = landmark && offset === centre ? 1.18 : 1;
      heights[cursor] = buildingHeight * crown * spire;
      cursor += 1;
    }

    const gap = 1 + Math.floor(deterministicNoise(cursor, 6) * 2);
    for (let offset = 0; offset < gap && cursor <= segments; offset += 1) {
      heights[cursor] = 2 + deterministicNoise(cursor, 7) * 2.4;
      cursor += 1;
    }
  }

  // Close the sector without a visible height discontinuity at either edge.
  const edgeHeight = (heights[0] + heights[segments]) / 2;
  heights[0] = edgeHeight;
  heights[segments] = edgeHeight;
  return heights;
};

export function createHorizonCityGeometry(
  heights: readonly number[],
  radius = HORIZON_CITY_BASE_RADIUS,
  baseY = HORIZON_CITY_BASE_Y,
  startAngle = HORIZON_CITY_START_ANGLE,
  endAngle = HORIZON_CITY_END_ANGLE
): THREE.BufferGeometry {
  const segments = heights.length - 1;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  heights.forEach((height, index) => {
    const progress = segments === 0 ? 0 : index / segments;
    const angle = THREE.MathUtils.lerp(startAngle, endAngle, progress);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const textureX = progress * 42;
    positions.push(x, baseY, z, x, baseY + height, z);
    uvs.push(textureX, 0, textureX, height / 3.2);
  });

  for (let segment = 0; segment < segments; segment += 1) {
    const bottomLeft = segment * 2;
    const topLeft = bottomLeft + 1;
    const bottomRight = bottomLeft + 2;
    const topRight = bottomLeft + 3;
    indices.push(bottomLeft, bottomRight, topLeft, bottomRight, topRight, topLeft);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Keep the skyline in the optical horizon frame. X and Z follow the camera
 * like the mountain rings; Y remains on the terrain datum so it cannot float.
 */
export function syncHorizonBackdropPosition(
  target: THREE.Vector3,
  cameraPosition: Pick<THREE.Vector3, 'x' | 'z'>
): void {
  target.x = cameraPosition.x;
  target.z = cameraPosition.z;
}

const CITY_VERTEX_SHADER = /* glsl */ `
varying vec2 vCityUv;

void main() {
  vCityUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const CITY_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uDayBody;
uniform vec3 uNightBody;
uniform vec3 uDayHaze;
uniform vec3 uWindowLight;
uniform float uLampLevel;
varying vec2 vCityUv;

float cityHash(vec2 cell) {
  return fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  float night = smoothstep(0.2, 0.88, uLampLevel);
  vec3 body = mix(mix(uDayBody, uDayHaze, 0.24), uNightBody, night);

  vec2 cell = floor(vCityUv);
  vec2 local = fract(vCityUv);
  float windowShape =
    step(0.18, local.x) * step(local.x, 0.72) *
    step(0.22, local.y) * step(local.y, 0.66);
  float occupied = step(0.34, cityHash(cell));
  float windowLight = windowShape * occupied * night;
  vec3 colour = mix(body, uWindowLight, windowLight * 0.88);

  gl_FragColor = vec4(colour, 1.0);
}
`;

/** A camera-centred city silhouette nested into the mountain skybox. */
export const NearHorizonCity: React.FC = () => {
  const cityGroupRef = useRef<THREE.Group>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const profile = useMemo(() => buildHorizonCityProfile(), []);
  const geometry = useMemo(() => createHorizonCityGeometry(profile), [profile]);
  const initialLightLevel = getExteriorLampLevel(
    useGameSimulationStore.getState().gameTime,
    useGameSimulationStore.getState().weather
  );
  const lightTargetRef = useRef(initialLightLevel);
  const lightLevelRef = useRef(initialLightLevel);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useEffect(
    () =>
      useGameSimulationStore.subscribe((state) => {
        lightTargetRef.current = getExteriorLampLevel(state.gameTime, state.weather);
      }),
    []
  );

  useFrame((state, delta) => {
    if (cityGroupRef.current) {
      syncHorizonBackdropPosition(cityGroupRef.current.position, state.camera.position);
    }
    lightLevelRef.current = THREE.MathUtils.damp(
      lightLevelRef.current,
      lightTargetRef.current,
      3.2,
      Math.min(Math.max(delta, 0), 0.1)
    );
    if (materialRef.current) {
      materialRef.current.uniforms.uLampLevel.value = lightLevelRef.current;
    }
  });

  return (
    <group ref={cityGroupRef} name="near-horizon-city" dispose={null}>
      <mesh name="horizon-city-silhouette" geometry={geometry} renderOrder={RENDER_ORDER.cityNear}>
        <shaderMaterial
          ref={materialRef}
          name="horizon-city-atmosphere"
          vertexShader={CITY_VERTEX_SHADER}
          fragmentShader={CITY_FRAGMENT_SHADER}
          uniforms={{
            uDayBody: { value: new THREE.Color('#607986') },
            uNightBody: { value: new THREE.Color('#0c1723') },
            uDayHaze: { value: new THREE.Color('#a2bbc3') },
            uWindowLight: { value: new THREE.Color('#ffd18a') },
            uLampLevel: { value: initialLightLevel },
          }}
          side={THREE.DoubleSide}
          depthWrite
          depthTest
          toneMapped={false}
          dithering
        />
      </mesh>
    </group>
  );
};
