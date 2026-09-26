import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { POLYGON_OFFSET, RENDER_ORDER } from '../../constants/renderLayers';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';

type ExteriorWeather = ReturnType<typeof useGameSimulationStore.getState>['weather'];

export const getExteriorLampLevel = (gameTime: number, weather: ExteriorWeather): number => {
  const hour = (((Number.isFinite(gameTime) ? gameTime : 12) % 24) + 24) % 24;
  let darkness = 0;
  if (hour >= 19 || hour < 5) darkness = 1;
  else if (hour < 7) darkness = (7 - hour) / 2;
  else if (hour >= 17) darkness = (hour - 17) / 2;

  const weatherFloor =
    weather === 'storm' ? 0.7 : weather === 'rain' ? 0.42 : weather === 'cloudy' ? 0.14 : 0;
  return Math.max(darkness, weatherFloor);
};

const createLampPoolTexture = (): THREE.DataTexture => {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x + 0.5) / size - 0.5;
      const dy = (y + 0.5) / size - 0.5;
      const distance = Math.sqrt(dx * dx + dy * dy) * 2;
      const alpha = Math.pow(Math.max(0, 1 - distance), 2.2);
      const offset = (y * size + x) * 4;
      // Keep hue in the material, not in both the texture and material. The
      // previous double tint produced opaque mustard circles at full night.
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
};

export const EXTERIOR_LAMP_LENS_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#fff2bd',
  emissive: '#ffd37a',
  emissiveIntensity: 0.06,
  roughness: 0.28,
  metalness: 0,
  transparent: true,
  opacity: 0.88,
});

const LAMP_POOL_MATERIAL = new THREE.MeshBasicMaterial({
  color: '#ffe8b8',
  map: createLampPoolTexture(),
  transparent: true,
  opacity: 0,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  toneMapped: true,
  polygonOffset: true,
  polygonOffsetFactor: POLYGON_OFFSET.exteriorOverlay.factor,
  polygonOffsetUnits: POLYGON_OFFSET.exteriorOverlay.units,
});
const LAMP_POOL_GEOMETRY = new THREE.CircleGeometry(1, 28);

interface RegisteredPointLight {
  readonly light: THREE.PointLight;
  readonly baseIntensity: number;
}

const pointLights = new Set<RegisteredPointLight>();

/** One scalar driver for every exterior lens, pool, and real high-quality light. */
export const ExteriorLampDriver: React.FC = () => {
  const targetRef = useRef(
    getExteriorLampLevel(
      useGameSimulationStore.getState().gameTime,
      useGameSimulationStore.getState().weather
    )
  );
  const levelRef = useRef(targetRef.current);

  useEffect(
    () =>
      useGameSimulationStore.subscribe((state) => {
        targetRef.current = getExteriorLampLevel(state.gameTime, state.weather);
      }),
    []
  );

  useFrame((_, delta) => {
    levelRef.current = THREE.MathUtils.damp(
      levelRef.current,
      targetRef.current,
      3.8,
      Math.min(Math.max(delta, 0), 0.1)
    );
    const level = levelRef.current;
    EXTERIOR_LAMP_LENS_MATERIAL.emissiveIntensity = 0.06 + level * 3.4;
    // Additive pools are deliberately restrained. At full night they should
    // reveal the road surface and fixture spacing without merging into a flat
    // amber carpet when several yard poles overlap.
    LAMP_POOL_MATERIAL.opacity = level * 0.24;
    // Skip the additive draw entirely while it would add nothing (clear days).
    LAMP_POOL_MATERIAL.visible = LAMP_POOL_MATERIAL.opacity > 0.002;
    pointLights.forEach(({ light, baseIntensity }) => {
      light.intensity = baseIntensity * level;
    });
  });

  return null;
};

export const ExteriorLampPool: React.FC<{ radius?: number }> = ({ radius = 5 }) => (
  <mesh
    geometry={LAMP_POOL_GEOMETRY}
    material={LAMP_POOL_MATERIAL}
    position={[0, 0.045, 0]}
    rotation={[-Math.PI / 2, 0, 0]}
    scale={[radius, radius, 1]}
    renderOrder={RENDER_ORDER.floorMarkings}
  />
);

export const ExteriorPointLight: React.FC<{
  position: [number, number, number];
  intensity: number;
  distance: number;
  color?: THREE.ColorRepresentation;
}> = ({ position, intensity, distance, color = '#fef3c7' }) => {
  const lightRef = useRef<THREE.PointLight>(null);

  useLayoutEffect(() => {
    const light = lightRef.current;
    if (!light) return undefined;
    const registration = { light, baseIntensity: intensity };
    pointLights.add(registration);
    return () => {
      pointLights.delete(registration);
    };
  }, [intensity]);

  return (
    <pointLight
      ref={lightRef}
      position={position}
      intensity={0}
      distance={distance}
      color={color}
    />
  );
};
