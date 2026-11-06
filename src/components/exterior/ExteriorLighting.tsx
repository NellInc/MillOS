import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { EXTERIOR_LAYERS, POLYGON_OFFSET, RENDER_ORDER } from '../../constants/renderLayers';
import { CANAL_FOOTBRIDGE_ACCESS } from '../../constants/publicRealmLayout';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { getRuntimeMode } from '../../runtime/runtimeMode';
import { getStartupSnapshot, startupDrawsOffscreen } from '../../utils/startupReadiness';
import { logger } from '../../utils/logger';

type ExteriorWeather = ReturnType<typeof useGameSimulationStore.getState>['weather'];

/** Working if the west walk has regularly spaced pools and no posts in its paving. */
export const WEST_FACTORY_PATH = {
  start: [-65, 0, 50] as [number, number, number],
  end: [-65, 0, -50] as [number, number, number],
  width: 2,
};
export const WEST_FACTORY_PATH_POOL_RADIUS = 11.5;
export const WEST_FACTORY_PATH_LAMPS: [number, number, number][] = [
  -48, -32, -16, 0, 16, 32, 48,
].map((z) => [-66.6, 0, z]);

/** Bank-mounted lanterns beside the real bridge approaches, clear of the walking strip.
 * Working if both feet touch dry ground and the pools stop before the canal water.
 */
export const CANAL_CROSSING_LAMPS = [-1, 1].map((side) => {
  const bridge = CANAL_FOOTBRIDGE_ACCESS;
  const edge = side < 0 ? bridge.minX : bridge.maxX;
  return {
    id: side < 0 ? 'west' : 'east',
    position: [
      edge + side * (bridge.steps * bridge.going + 1.5),
      EXTERIOR_LAYERS.ground,
      bridge.z + bridge.halfWidth + 0.75,
    ] as [number, number, number],
  };
});
export const CANAL_CROSSING_LIGHT = {
  // Midpoint of the delivered Victorian optic's 3.935-4.245 m aperture.
  height: 4.09,
  intensity: 110,
  distance: 20,
  color: '#ffe1a6',
  poolRadius: 3.7,
} as const;

/** A cabin-face lantern lights the bow well, clear of the cambered roof.
 * Working if its centre ray reaches teak, clear noon is dark and no shadow map is added.
 */
export const CANAL_BOAT_LANTERN = {
  mount: [0, 2.06, 3.72] as [number, number, number],
  bracket: [0, -0.13, -0.175] as [number, number, number],
  source: [0, -0.05, 0.12] as [number, number, number],
  tilt: (-35 * Math.PI) / 180,
  intensity: 24,
  distance: 3.4,
  color: '#ffdb9b',
} as const;

/** One warm pendant for the retained pair of picnic tables. The actual
 * carport's central soffit is3.686446551m in its delivered3.9m envelope.
 * Working if its cap touches that roof, both tables have a clear downward ray,
 * low tiers keep the shared lens/pool, and no extra shadow map is allocated.
 */
export const PICNIC_SHELTER_LIGHT = {
  measuredSoffit: 3.686446551176657,
  measuredRoofHeight: 3.9,
  intensity: 76,
  distance: 9,
  color: '#ffe1ac',
  poolRadius: 3.6,
  poolWidthScale: 1.3,
  housing: { topRadius: 0.48, bottomRadius: 0.52, height: 0.12 },
  lens: { topRadius: 0.42, bottomRadius: 0.4, height: 0.04 },
} as const;
export function picnicShelterLightLayout(width: number, height: number, depth: number) {
  const sourceY = height - 0.3,
    z = -depth / 4;
  const soffit =
    (PICNIC_SHELTER_LIGHT.measuredSoffit * (height + 0.4)) /
    PICNIC_SHELTER_LIGHT.measuredRoofHeight;
  const housingY = sourceY + 0.11;
  const housingTop = housingY + PICNIC_SHELTER_LIGHT.housing.height / 2;
  const stemTop = soffit - 0.015;
  return {
    source: [0, sourceY, z] as [number, number, number],
    housing: [0, housingY, z] as [number, number, number],
    lens: [0, sourceY + 0.035, z] as [number, number, number],
    cap: [0, stemTop, z] as [number, number, number],
    stem: [0, (stemTop + housingTop) / 2, z] as [number, number, number],
    stemLength: stemTop - housingTop,
    pool: [0, 0, z] as [number, number, number],
    poolRadius: Math.min(
      PICNIC_SHELTER_LIGHT.poolRadius,
      width / (2 * PICNIC_SHELTER_LIGHT.poolWidthScale) - 0.15,
      depth / 2 - 0.2
    ),
  };
}

export const getExteriorLampLevel = (gameTime: number, weather: ExteriorWeather): number => {
  const hour = (((Number.isFinite(gameTime) ? gameTime : 12) % 24) + 24) % 24;
  const solarElevation = Math.sin(((hour - 6) / 24) * Math.PI * 2);
  // Start before the sky loses its daylight; fully on by sunset, symmetric at dawn.
  const darkness = 1 - THREE.MathUtils.smoothstep(solarElevation, 0.08, 0.42);

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
  readonly light: THREE.PointLight | THREE.SpotLight;
  readonly baseIntensity: number;
  readonly gain?: { value: number };
}

const pointLights = new Set<RegisteredPointLight>();

/** Shared dimmer for building windows and lamp glass. No shader recompilation. */
export const EXTERIOR_LAMP_LEVEL = { value: 0 };

/**
 * A lamp is a punctual light only while it could light anything. At zero
 * intensity it adds nothing to a pixel, yet it is still a slot in every lit
 * program and an upload every frame: at noon on Low, 35 of the 38 punctual
 * lights were dark lamps, about a quarter of the frame on a slow CPU. So the
 * driver hides them while the lamp level is off and has faded out, and shows
 * them the moment it rises. Hiding changes the light count in three's program
 * key, so the other state's programs are compiled once after startup
 * (LAMP_PREWARM_DELAY_MS) and dusk switches programs instead of compiling them.
 * Working if day and night look as before, and the lamps-on moment does not
 * stall once the prewarm has run.
 */
let lampsShown = false;
let lampLevelOverride: number | null = null;
let lampVariantsPrewarmed = false;
const LAMP_FADED_OUT = 0.001;
const LAMP_PREWARM_DELAY_MS = 5000;
const showLamps = (shown: boolean): void => {
  lampsShown = shown;
  pointLights.forEach(({ light }) => {
    light.visible = shown;
  });
};

interface LampInstrument {
  setLevelOverride: (level: number | null) => void;
  status: () => { shown: boolean; prewarmed: boolean; lamps: number };
}
declare global {
  interface Window {
    /** Benchmark only: drive the lamp level and read the lamp state. */
    __MILLOS_LAMPS__?: LampInstrument;
  }
}

/** One scalar driver for every exterior lens, pool, and real high-quality light. */
export const ExteriorLampDriver: React.FC = () => {
  const { gl, scene, camera } = useThree();
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

  // The starting state, before the first draw, so the startup prewarm compiles
  // the lamps as they will be drawn.
  useLayoutEffect(() => showLamps(targetRef.current > 0), []);

  // Compile the other lamp state once, in one synchronous task, so no frame is
  // drawn with it. Three keeps every variant a material has compiled until the
  // material is disposed, so dusk and dawn then reuse these programs.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let idle: number | undefined;
    const run = () => {
      if (cancelled || lampVariantsPrewarmed || pointLights.size === 0) return;
      const shown = lampsShown;
      const previous = gl.getRenderTarget();
      const cubeFace = gl.getActiveCubeFace();
      const mipLevel = gl.getActiveMipmapLevel();
      // Any non-XR target keys programs alike, so a 1x1 stands in for the
      // composer's beauty target without touching it.
      const offscreen = startupDrawsOffscreen() ? new THREE.WebGLRenderTarget(1, 1) : null;
      showLamps(!shown);
      try {
        gl.setRenderTarget(offscreen);
        gl.compile(scene, camera);
        lampVariantsPrewarmed = true;
      } catch (error) {
        logger.warn('Lamp shader prewarm failed; dusk will compile instead', error);
      } finally {
        gl.setRenderTarget(previous, cubeFace, mipLevel);
        showLamps(shown);
        offscreen?.dispose();
      }
    };
    const schedule = () => {
      timer = setTimeout(() => {
        if (typeof window.requestIdleCallback === 'function')
          idle = window.requestIdleCallback(run, { timeout: 5000 });
        else run();
      }, LAMP_PREWARM_DELAY_MS);
    };
    if (getStartupSnapshot().ready) schedule();
    else window.addEventListener('millos:startup-ready', schedule, { once: true });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener('millos:startup-ready', schedule);
      if (idle !== undefined) window.cancelIdleCallback?.(idle);
    };
  }, [gl, scene, camera]);

  useEffect(() => {
    if (!getRuntimeMode().benchmark) return;
    const instrument: LampInstrument = {
      setLevelOverride: (level) => {
        lampLevelOverride = level === null ? null : THREE.MathUtils.clamp(level, 0, 1);
      },
      status: () => ({
        shown: lampsShown,
        prewarmed: lampVariantsPrewarmed,
        lamps: pointLights.size,
      }),
    };
    window.__MILLOS_LAMPS__ = instrument;
    return () => {
      if (window.__MILLOS_LAMPS__ === instrument) delete window.__MILLOS_LAMPS__;
      lampLevelOverride = null;
    };
  }, []);

  useFrame((_, delta) => {
    const target = lampLevelOverride ?? targetRef.current;
    levelRef.current = THREE.MathUtils.damp(
      levelRef.current,
      target,
      3.8,
      Math.min(Math.max(delta, 0), 0.1)
    );
    const level = levelRef.current;
    // Shown as soon as the target rises; hidden only once it has faded out,
    // so nothing pops off mid-fade. Written on change only.
    const shown = target > 0 || level > LAMP_FADED_OUT;
    if (shown !== lampsShown) showLamps(shown);
    EXTERIOR_LAMP_LEVEL.value = level;
    EXTERIOR_LAMP_LENS_MATERIAL.emissiveIntensity = 0.06 + level * 3.4;
    // Additive pools are deliberately restrained. At full night they should
    // reveal the road surface and fixture spacing without merging into a flat
    // amber carpet when several yard poles overlap.
    LAMP_POOL_MATERIAL.opacity = level * 0.24;
    // Skip the additive draw entirely while it would add nothing (clear days).
    LAMP_POOL_MATERIAL.visible = LAMP_POOL_MATERIAL.opacity > 0.002;
    pointLights.forEach(({ light, baseIntensity, gain }) => {
      light.intensity = baseIntensity * level * (gain?.value ?? 1);
    });
  });

  return null;
};

export const ExteriorLampPool: React.FC<{
  radius?: number;
  /** Optional source-plane geometry. The caller owns its lifetime. */
  geometry?: THREE.BufferGeometry;
}> = ({ radius = 5, geometry }) => (
  <mesh
    geometry={geometry ?? LAMP_POOL_GEOMETRY}
    material={LAMP_POOL_MATERIAL}
    dispose={geometry ? null : undefined}
    position={[0, 0.045, 0]}
    rotation={[-Math.PI / 2, 0, 0]}
    scale={[radius, radius, 1]}
    renderOrder={RENDER_ORDER.floorMarkings}
  />
);

export const ExteriorPointLight: React.FC<{
  name?: string;
  gain?: { value: number };
  position: [number, number, number];
  intensity: number;
  distance: number;
  color?: THREE.ColorRepresentation;
}> = ({ name, gain, position, intensity, distance, color = '#fef3c7' }) => {
  const lightRef = useRef<THREE.PointLight>(null);

  useLayoutEffect(() => {
    const light = lightRef.current;
    if (!light) return undefined;
    const registration = { light, baseIntensity: intensity, gain };
    pointLights.add(registration);
    light.visible = lampsShown;
    return () => {
      pointLights.delete(registration);
    };
  }, [intensity, gain]);

  return (
    <pointLight
      ref={lightRef}
      name={name}
      position={position}
      intensity={0}
      distance={distance}
      color={color}
    />
  );
};

/** Downward canopy banks share the lamp clock and never allocate a shadow map. */
export const ExteriorDownlight: React.FC<{
  name: string;
  gain?: { value: number };
  position: [number, number, number];
  intensity: number;
  distance: number;
  color: THREE.ColorRepresentation;
  angle?: number;
  penumbra?: number;
}> = ({ name, gain, position, intensity, distance, color, angle = 1.24, penumbra = 0.7 }) => {
  const lightRef = useRef<THREE.SpotLight>(null);
  const target = useMemo(() => new THREE.Object3D(), []);
  useLayoutEffect(() => {
    const light = lightRef.current;
    if (!light) return;
    const registration = { light, baseIntensity: intensity, gain };
    pointLights.add(registration);
    light.visible = lampsShown;
    return () => {
      pointLights.delete(registration);
    };
  }, [intensity, gain]);
  return (
    <group position={position}>
      <primitive object={target} position={[0, -1, 0]} />
      <spotLight
        ref={lightRef}
        name={name}
        position={[0, 0, 0]}
        target={target}
        color={color}
        intensity={0}
        distance={distance}
        decay={2}
        angle={angle}
        penumbra={penumbra}
        castShadow={false}
      />
    </group>
  );
};
