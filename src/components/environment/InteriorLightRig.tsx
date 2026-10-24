import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { createAtmosphereState, sampleAtmosphere } from '../../simulation/atmosphere';
import * as THREE from 'three';
import { FLOOR_LAYERS, POLYGON_OFFSET, RENDER_ORDER } from '../../constants/renderLayers';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import { useGraphicsStore, type GraphicsQuality } from '../../stores/graphicsStore';

/**
 * Fifteen real ceiling fittings and additive floor pools, lit by one source per
 * row of fittings. Counts stay fixed within a tier: changing a light uniform
 * must never recompile every lit material.
 *
 * Each source is a point light in three's terms but is SHADED AS A LINE: every
 * light marked `decay === 0` is evaluated by `shaders/interiorLighting.ts` as a
 * finite fluorescent row along world X, spanning the fixture grid, with a
 * down-facing optic and a small uplight. An isotropic point on the centre-line
 * lit only the faces that looked back at x = 0 - one plansifter in three - and
 * no placement of two points can light a row of machines alike; a row of
 * fittings does. Radiance under the row centre equals the old point light's.
 * Working if the three plansifters' camera-facing faces read alike at night,
 * the silo battery stays outside the rows, and no source, shadow map, exposure
 * or ambient term is added.
 */
export const FIXTURE_GRID_X = [-28, -14, 0, 14, 28] as const;
/** Physical housings, lenses and all fifteen floor pools share this grid. */
export const FIXTURE_GRID_Z = [-16, 22, SITE_LAYOUT.factory.zones.milling] as const;
export const ZONE_LIGHT_HEIGHT = SITE_LAYOUT.factory.bounds.maxY - 4.5;

/** Match the old directly-below-fixture radiance at the unchanged floor height. */
export const ZONE_LIGHT_INTENSITY = 380 / ZONE_LIGHT_HEIGHT ** 2;
export const ZONE_LIGHT_DECAY = 0;
/** Keep every actual outdoor silo surface beyond the source spheres. */
export const ZONE_LIGHT_DISTANCE = 44;
export const ZONE_LIGHT_COLOR = '#fff1db';

const REFERENCE_GRID_Z = [-8, 30] as const;
const REFERENCE_LIGHT_INTENSITY = 380;

/** Existing continuous daylight compensation; invalid input stays at noon.
 * Every tier draws the same two rows, so there is no per-tier gain.
 * The reference is a same-page illumination control, never a quality override.
 * Working if the night fade stays smooth and switching the reference restores
 * exactly the old positions, intensity and decay without remounting any lamp.
 */
export function zoneWorkLightIntensity(
  daylight: number,
  _quality: GraphicsQuality = 'medium',
  referenceBanks = false
): number {
  const t = Number.isFinite(daylight) ? THREE.MathUtils.clamp(daylight, 0, 1) : 1;
  const darkness = 1 - t * t * (3 - 2 * t);
  const base = referenceBanks ? REFERENCE_LIGHT_INTENSITY : ZONE_LIGHT_INTENSITY;
  return base * (1 + 0.65 * darkness);
}

/** Floor pool footprint. The housings are 6.2 x 0.78; light spreads. */
export const FLOOR_POOL_SCALE = [13, 6.5] as const;
export const FLOOR_POOL_OPACITY = 0.3;

const POOL_TEXTURE_WIDTH = 64;
const POOL_TEXTURE_HEIGHT = 32;

/**
 * Anisotropy of the pool falloff.
 *
 * The fixtures are long strips, so the pool has to stay bright further along
 * its length than across its width even after the quad's own 2:1 aspect. Below
 * 1 the falloff reaches further along U.
 */
const POOL_LENGTHWISE_FALLOFF = 0.62;

/** Row centres below the two working rows of fittings, clear of the housings. */
export const ZONE_LIGHT_POSITIONS: readonly (readonly [number, number, number])[] =
  FIXTURE_GRID_Z.slice(0, 2).map((z) => [0, ZONE_LIGHT_HEIGHT, z] as const);
/** Kept as a name: every tier now draws the same two rows. */
export const REDUCED_ZONE_LIGHT_POSITIONS = ZONE_LIGHT_POSITIONS;
const REFERENCE_POSITIONS: readonly (readonly [number, number, number])[] = REFERENCE_GRID_Z.map(
  (z) => [0, ZONE_LIGHT_HEIGHT, z] as const
);

/** Two sources on both arms and every tier; no camera-driven light removal. */
export function zoneLightPositions(
  _quality: GraphicsQuality,
  referenceBanks = false
): readonly (readonly [number, number, number])[] {
  return referenceBanks ? REFERENCE_POSITIONS : ZONE_LIGHT_POSITIONS;
}

/** One entry per ceiling fixture. */
export function floorPoolPositions(): [number, number][] {
  return FIXTURE_GRID_X.flatMap((x) => FIXTURE_GRID_Z.map((z) => [x, z] as [number, number]));
}

/**
 * Soft elliptical falloff for the floor pools.
 *
 * Authored in alpha because the material blends additively: three's
 * `AdditiveBlending` is `(SrcAlpha, One)`, so alpha is the falloff and the RGB
 * stays a flat tint.
 */
export function createLightPoolTexture(
  width: number = POOL_TEXTURE_WIDTH,
  height: number = POOL_TEXTURE_HEIGHT
): THREE.DataTexture {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = ((x + 0.5) / width - 0.5) * 2 * POOL_LENGTHWISE_FALLOFF;
      const dy = ((y + 0.5) / height - 0.5) * 2;
      const radius = Math.min(1, Math.hypot(dx, dy));
      const alpha = Math.pow(1 - radius, 2.3);
      const offset = (y * width + x) * 4;
      data[offset] = 255;
      data[offset + 1] = 255;
      data[offset + 2] = 255;
      data[offset + 3] = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

const _poolMatrix = new THREE.Matrix4();
const _poolPosition = new THREE.Vector3();
const _poolQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
const _poolScale = new THREE.Vector3(FLOOR_POOL_SCALE[0], FLOOR_POOL_SCALE[1], 1);

export function InteriorLightRig() {
  // Source count follows only the tier. Anything that adaptive
  // quality mutates inside a tier would re-run this selector without changing
  // the light count, and anything that changes the count more often than the
  // tier does is the recompile storm the note above exists to avoid.
  const quality = useGraphicsStore((state) => state.graphics.quality);
  const referenceLighting = useGraphicsStore(
    (state) => state.graphics.perfDebug.disableLightingPolish
  );
  const referenceBanks = useGraphicsStore(
    (state) => state.graphics.perfDebug.disableInteriorLightBanks
  );
  const zoneLights = zoneLightPositions(quality, referenceBanks);
  const poolsRef = useRef<THREE.InstancedMesh>(null);
  const rigRef = useRef<THREE.Group>(null);
  const atmosphere = useMemo(() => createAtmosphereState(), []);
  useFrame(() => {
    const { gameDay, gameTime, weather } = useGameSimulationStore.getState();
    const daylight = referenceLighting
      ? 1
      : sampleAtmosphere(gameDay, gameTime, weather, atmosphere).daylight;
    const intensity = zoneWorkLightIntensity(daylight, quality, referenceBanks);
    for (const child of rigRef.current?.children ?? []) {
      if (child instanceof THREE.PointLight) child.intensity = intensity;
    }
  });
  const positions = useMemo(() => floorPoolPositions(), []);
  const poolTexture = useMemo(() => createLightPoolTexture(), []);
  const poolGeometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const poolMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: poolTexture,
        color: '#ffedce',
        transparent: true,
        opacity: FLOOR_POOL_OPACITY,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
        polygonOffset: true,
        polygonOffsetFactor: POLYGON_OFFSET.standard.factor,
        polygonOffsetUnits: POLYGON_OFFSET.standard.units,
      }),
    [poolTexture]
  );

  useEffect(() => {
    poolMaterial.color.set(referenceLighting ? '#ffe0a0' : '#ffedce');
  }, [poolMaterial, referenceLighting]);

  useEffect(
    () => () => {
      poolMaterial.dispose();
      poolGeometry.dispose();
      poolTexture.dispose();
    },
    [poolMaterial, poolGeometry, poolTexture]
  );

  useEffect(() => {
    const mesh = poolsRef.current;
    if (!mesh) return;
    positions.forEach(([x, z], index) => {
      _poolPosition.set(x, FLOOR_LAYERS.puddle, z);
      _poolMatrix.compose(_poolPosition, _poolQuaternion, _poolScale);
      mesh.setMatrixAt(index, _poolMatrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [positions]);

  return (
    <group ref={rigRef} name="interior-light-rig">
      {zoneLights.map((position, index) => (
        <pointLight
          key={`zone-light-${index}`}
          name={`interior-zone-light-${index}`}
          position={position as unknown as [number, number, number]}
          color={referenceLighting ? '#ffe8b0' : ZONE_LIGHT_COLOR}
          intensity={zoneWorkLightIntensity(1, quality, referenceBanks)}
          distance={ZONE_LIGHT_DISTANCE}
          decay={referenceBanks ? 2 : ZONE_LIGHT_DECAY}
          castShadow={false}
        />
      ))}
      <instancedMesh
        ref={poolsRef}
        name="interior-light-pools"
        args={[poolGeometry, poolMaterial, positions.length]}
        renderOrder={RENDER_ORDER.floorEffects}
      />
    </group>
  );
}
