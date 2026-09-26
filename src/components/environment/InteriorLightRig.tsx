import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { FLOOR_LAYERS, POLYGON_OFFSET, RENDER_ORDER } from '../../constants/renderLayers';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import { useGraphicsStore, type GraphicsQuality } from '../../stores/graphicsStore';

/**
 * Interior lighting.
 *
 * The building has fifteen ceiling fixtures. Every one of them was emissive
 * geometry and nothing else: a bright strip on the ceiling that put no light on
 * the floor, so the interior had no pools, no falloff between bays, and no
 * reason for the eye to read depth down the length of the hall.
 *
 * TWO PARTS, DELIBERATELY UNEQUAL:
 *
 * 1. FOUR real point lights, across the production hall. Four is a ceiling, not a
 *    budget guess. Three's forward renderer puts every point light in the
 *    uniform block of every lit material with no per-object culling, so light
 *    count is a per-fragment cost paid across the entire frame - including the
 *    exterior cameras where these contribute nothing at all. Fifteen would not
 *    hold the frame budget, and the four are placed on the work aisles so the
 *    falloff lands where the machinery is.
 *
 * 2. FIFTEEN additive floor pools, one per fixture, as a single InstancedMesh.
 *    This is what actually sells the fixture grid: the pools sit under all
 *    fifteen housings, including the x = +/-42 outer rows the point lights
 *    cannot reach, and they cost one draw call and no shader lights.
 *
 * The two are complementary. The point lights supply real falloff on geometry
 * and real shading direction; the pools supply the graphic read of a lit floor.
 */

/** Ceiling fixture grid, harvested from `OptimizedFactoryInfrastructure`. */
export const FIXTURE_GRID_X = [-28, -14, 0, 14, 28] as const;
export const FIXTURE_GRID_Z = [-30, -8, 38] as const;

/** Height the four zone lights hang at, below the shared ceiling emitter plane. */
export const ZONE_LIGHT_HEIGHT = SITE_LAYOUT.factory.bounds.maxY - 4.5;

/**
 * Intensity of one zone light.
 *
 * Three has used physical falloff since r155, so with `decay` 2 the irradiance
 * at the floor is `intensity / d^2` scaled by the cutoff window
 * `(1 - (d/distance)^4)^2`. At d = 17.5 and `distance` 44 that window is 0.951,
 * so 300 lands on about 0.93 directly under a fixture - a little over four
 * times the 0.22 ambient term, which is a readable pool rather than a hotspot.
 */
export const ZONE_LIGHT_INTENSITY = 300;

/** Cutoff radius. Beyond it the light contributes exactly zero. */
export const ZONE_LIGHT_DISTANCE = 44;

export const ZONE_LIGHT_COLOR = '#ffe8b0';

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

/**
 * Four lights across two ceiling banks. The front bank clears the pneumatic
 * risers instead of placing a point source against the middle sifter's inlet.
 * Working if every zone is lit and no live process pipe receives a hotspot.
 */
export const ZONE_LIGHT_POSITIONS: readonly (readonly [number, number, number])[] = [
  -8, 38,
].flatMap((z) => [-14, 14].map((x) => [x, ZONE_LIGHT_HEIGHT, z] as const));

/**
 * The two lights `low` and `medium` keep, one at each bank's centre.
 *
 * WHY A POINT LIGHT IS AN EXTERIOR COST AT ALL. `NUM_POINT_LIGHTS` is a program
 * define and three's forward renderer has no per-object light culling, so
 * `lights_fragment_begin` unrolls a full `RE_Direct_Physical` - GGX specular
 * plus Lambert diffuse - for every one of these on every fragment of every lit
 * material in the frame. There is no early-out around it either: the loop tests
 * `directLight.visible` only to gate a shadow lookup, never the BRDF. So on the
 * `yard`, `farm` and `overview` cameras, where the nearest of these hangs
 * inside a building whose 44-unit cutoff reaches nothing on screen, each light
 * is a per-pixel evaluation of a term that is identically zero. The scene is
 * fill-bound - the harness measures 4.0 ms for the terrain shader against zero
 * draw calls, and half the pixel count buys back 36% of the frame - so this is
 * exactly the kind of cost that shows up in the average.
 *
 * WHY NOT SWITCH THEM OFF WHEN THE CAMERA IS OUTSIDE. Because it would work,
 * and then cost more than it saved. `projectObject` collects a light only when
 * `object.layers.test(camera.layers)` passes and only when `object.visible`, so
 * either switch really does drop `numPointLights` - and `numPointLights` is in
 * the program cache key, so the old program falls to refcount zero and
 * `releaseProgram` deletes it. Every walk in or out of a doorway would then
 * recompile every material in the scene. `intensity = 0` avoids the recompile
 * and saves nothing: the light stays in the uniform block and the BRDF still
 * runs. The only recompile-safe form is a count that moves with the quality
 * tier, which already rebuilds programs at the low/medium boundary because that
 * is where `castShadow` on the sun - and therefore `NUM_DIR_LIGHT_SHADOWS` -
 * changes.
 *
 * WHAT IS TRADED. Intensity and cutoff are identical between tiers, so the
 * floor directly under a fixture is unchanged and the arithmetic below is
 * checkable without a screenshot. The two central sources retain about 80-90%
 * of the full set's centre-line irradiance, with a larger loss at the outer mills.
 * That is a real dimming on `medium`, against ambient 0.22, hemisphere 0.22 and the
 * IBL - and still far more interior modelling than the zero point lights this
 * building had before the fixtures were lit at all. `high` and `ultra` keep all
 * four. The fifteen floor pools are untouched on every tier, and they are what
 * carries the graphic read of the fixture grid.
 */
export const REDUCED_ZONE_LIGHT_POSITIONS: readonly (readonly [number, number, number])[] = [
  -8, 38,
].map((z) => [0, ZONE_LIGHT_HEIGHT, z] as const);

/** Zone lights for a quality tier. Full set above `medium`, reduced at or below. */
export function zoneLightPositions(
  quality: GraphicsQuality
): readonly (readonly [number, number, number])[] {
  return quality === 'high' || quality === 'ultra'
    ? ZONE_LIGHT_POSITIONS
    : REDUCED_ZONE_LIGHT_POSITIONS;
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
  // Subscribed narrowly to the tier and nothing else. Anything that adaptive
  // quality mutates inside a tier would re-run this selector without changing
  // the light count, and anything that changes the count more often than the
  // tier does is the recompile storm the note above exists to avoid.
  const quality = useGraphicsStore((state) => state.graphics.quality);
  const zoneLights = zoneLightPositions(quality);
  const poolsRef = useRef<THREE.InstancedMesh>(null);
  const positions = useMemo(() => floorPoolPositions(), []);
  const poolTexture = useMemo(() => createLightPoolTexture(), []);
  const poolGeometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const poolMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: poolTexture,
        color: '#ffe0a0',
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
    <group name="interior-light-rig">
      {zoneLights.map((position) => (
        <pointLight
          key={`zone-light-${position[0]}-${position[2]}`}
          name={`interior-zone-light-${position[0]}-${position[2]}`}
          position={position as unknown as [number, number, number]}
          color={ZONE_LIGHT_COLOR}
          intensity={ZONE_LIGHT_INTENSITY}
          distance={ZONE_LIGHT_DISTANCE}
          decay={2}
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
