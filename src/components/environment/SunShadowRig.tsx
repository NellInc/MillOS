import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { SITE_LAYOUT } from '../../constants/siteLayout';

/**
 * Sun shadow rig.
 *
 * The scene has exactly one shadow-casting light (`sun-key-light`, owned by
 * `OptimizedSkySystem`) and exactly one shadow cascade. This component decides,
 * every third frame, where that single cascade should sit.
 *
 * THREE THINGS IT HAS TO GET RIGHT, IN ORDER OF HOW BADLY THEY LOOK WHEN WRONG:
 *
 * 1. COVERAGE. Outside the orthographic box, three's shadow lookup fails its
 *    frustum test and returns *lit*. Indoors that is catastrophic rather than
 *    merely missing: the roof is two solid 60 x 100 slabs with `castShadow`, so
 *    the interior is one continuous roof shadow, and any part of the floor that
 *    falls outside the box turns into a hard-edged patch of full sunlight in the
 *    middle of a covered building. The interior box is therefore fitted to the
 *    whole envelope and pinned to the site centre, not to the camera.
 *
 * 2. TEXEL SNAPPING. A box that follows the camera re-samples the same world
 *    surface at a different sub-texel offset every frame, so every shadow edge
 *    crawls. The fix is to quantise the box centre, in light space, to whole
 *    shadow-map texels. Without it a moving camera looks worse than no shadow.
 *
 * 3. BIAS. The correct normal offset is a function of the world size of one
 *    texel, and this rig spans 90 to 220 world units on a map that may be 1024
 *    or 4096 - a 10x range. A constant `normalBias` is either acne at the wide
 *    end or peter-panning at the tight end, so it is recomputed from the fit.
 *
 * ORDERING: this component must run its `useFrame` AFTER `OptimizedSkySystem`,
 * which writes `sun-key-light.position` every frame from the solar direction.
 * It does that by being mounted after `<OptimizedSkySystem />` in
 * `OptimizedFactoryEnvironment` - R3F sorts subscribers by priority with a
 * stable sort, so equal priorities keep subscription (mount) order. A render
 * priority above 0 is NOT an option: R3F treats any non-zero priority as "the
 * app renders manually" and stops calling `gl.render` entirely.
 */

const SUN_LIGHT_NAME = 'sun-key-light';
const WALL_ENVELOPE_NAME = 'persistent-factory-wall-envelope';

/** Interior receiver coverage retains its texel density after bins move outdoors. */
export const FACTORY_SHADOW_VOLUME = {
  centre: [0, (SITE_LAYOUT.factory.bounds.maxY + 1) / 2, 0] as const,
  half: [62, (SITE_LAYOUT.factory.bounds.maxY + 5) / 2, 52] as const,
};

/**
 * An exterior caster only needs extra DEPTH in an interior shadow map. Its
 * shadow shares the receiver's light-space XY, so widening the map wastes
 * floor resolution. Working if external silos cast into the hall while the
 * receiver texel budget remains unchanged.
 */
export function factoryOccluderDepth(x: number, y: number, z: number): number {
  const [cx, cy, cz] = FACTORY_SHADOW_VOLUME.centre;
  let depth = projectedHalfExtent(x, y, z, ...FACTORY_SHADOW_VOLUME.half);
  const include = (px: number, py: number, pz: number, hx: number, hy: number, hz: number) => {
    depth = Math.max(
      depth,
      Math.abs(x * (px - cx) + y * (py - cy) + z * (pz - cz)) +
        projectedHalfExtent(x, y, z, hx, hy, hz)
    );
  };
  const size = SITE_LAYOUT.machineDimensions.silo;
  for (const {
    position: [px, py, pz],
  } of SITE_LAYOUT.machines.silos) {
    include(px, py + size[1] / 2, pz, size[0] / 2 + 1, size[1] / 2 + 1, size[2] / 2 + 1);
  }
  const tower = SITE_LAYOUT.bulkStorage.elevator;
  include(
    tower.position[0],
    tower.position[1] + tower.height / 2,
    tower.position[2],
    tower.footprint[0] / 2 + 1,
    tower.height / 2 + 1,
    tower.footprint[1] / 2 + 1
  );
  return depth;
}

/**
 * World box the cascade covers while the camera is outside the building.
 *
 * `halfExtent` is the ceiling, not the working value: the box is sized to how
 * far the camera is actually looking. A fixed 110 spends the same 1024 texels
 * on a 220-unit box whether the shot is the site-wide `overview` (which needs
 * every unit of it) or `water`, whose subject is 55 units away. On the close
 * cameras that was both a quarter of the shadow-map resolution thrown away and
 * a shadow pass re-submitting the village and the tree line for nothing.
 */
export const EXTERIOR_SHADOW_VOLUME = {
  minHalfExtent: 70,
  halfExtent: 110,
  centreY: 20,
  halfY: 25,
};

/** How the exterior box grows with view distance, before clamping. */
export const EXTENT_GROUND_FRACTION = 0.65;
export const EXTENT_BASE = 30;

/**
 * How far ahead of the camera the exterior box is centred, as a fraction of its
 * half extent.
 *
 * DELIBERATE GENERALISATION of a flat 0.35. The lead is derived from where the
 * view ray meets the ground and then clamped into this band, because a fixed
 * fraction is wrong at both ends. The `overview` camera sits at [112, 74, 112]
 * looking at [0, 7, 2]: its view ray meets y=0 at about (-12, 0, -10), so a flat
 * 0.35 * 110 = 38.5 lead centres the box at (84, 84) and clips the factory - the
 * subject of that shot - from x = -60 back to x = -25. Half the ground distance
 * centres it at (50, 51) and covers the whole envelope. The upper clamp keeps a
 * near-horizontal view (first person, level gaze) from pushing the box so far
 * forward that the player leaves it.
 */
export const LEAD_MIN_FRACTION = 0.2;
export const LEAD_MAX_FRACTION = 0.85;
export const LEAD_GROUND_FRACTION = 0.5;

/**
 * Half extents are rounded up to this many world units.
 *
 * The fitted extent is a continuous function of the solar direction, and the
 * texel size is derived from it, so an unquantised extent changes the texel grid
 * every tick and defeats the snapping in point 2 above. Quantising means the
 * grid is stable for minutes of simulated time at a stretch.
 */
export const EXTENT_QUANTUM = 4;

/** `normalBias`, in world-space texels of the current fit. */
export const NORMAL_BIAS_TEXELS = 1.6;

/** Clamp for the derived normal bias, in world units. */
export const NORMAL_BIAS_RANGE = { min: 0.02, max: 0.4 };

/** World units of slack between the shadow camera's near plane and the box. */
export const SHADOW_DEPTH_MARGIN = 25;

/** Frames between full refits. Repositioning still happens every frame. */
export const SHADOW_REFIT_INTERVAL = 3;

/**
 * Key-light intensity below which the shadow map is not redrawn. Below this the
 * key contributes nothing visible, so its shadow cannot be seen either.
 */
export const SHADOW_MIN_INTENSITY = 0.02;

/**
 * Refit ticks spent looking for the wall envelope before giving up.
 *
 * `getObjectByName` walks the whole graph. The envelope mounts with the scene,
 * so this only ever covers a few startup frames - the cap exists so a renamed
 * or removed group degrades into "no wall casters" rather than a scene traverse
 * on every third frame for the rest of the session.
 */
export const CASTER_PATCH_ATTEMPTS = 240;

/**
 * Above this |sunDir.y| the default up vector is degenerate.
 *
 * At clear noon `sampleCelestial` returns a solar direction of exactly (0, 1, 0)
 * - the existing atmosphere test asserts it, and the benchmark harness defaults
 * to `--time=12`. `Matrix4.lookAt` perturbs its way out of the zero cross
 * product rather than producing NaN, but the basis it lands on flips
 * discontinuously as the sun crosses vertical, which rotates the texel grid and
 * pops every shadow edge. Switching the up vector to +Z through the degenerate
 * band keeps the basis continuous where it matters.
 */
export const VERTICAL_SUN_THRESHOLD = 0.99;

const ORIGIN = new THREE.Vector3(0, 0, 0);
const UP_Y = new THREE.Vector3(0, 1, 0);
const UP_Z = new THREE.Vector3(0, 0, 1);

// Scratch. Nothing in this module allocates inside useFrame.
const _sunDirection = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _volumeCentre = new THREE.Vector3();
const _lightSpaceCentre = new THREE.Vector3();
const _lightPosition = new THREE.Vector3();
const _worldFromLight = new THREE.Matrix4();
const _lightFromWorld = new THREE.Matrix4();

/**
 * Half extent of an axis-aligned world box, measured along an arbitrary axis.
 *
 * The support function of a box: the projection of its half-diagonal onto the
 * axis is the sum of the per-axis half sizes weighted by |component|. Three
 * absolute values and three multiplies replaces transforming eight corners.
 */
export function projectedHalfExtent(
  axisX: number,
  axisY: number,
  axisZ: number,
  halfX: number,
  halfY: number,
  halfZ: number
): number {
  return Math.abs(axisX) * halfX + Math.abs(axisY) * halfY + Math.abs(axisZ) * halfZ;
}

/** Round a fitted half extent up to the quantisation grid. */
export function quantiseExtent(value: number, quantum: number = EXTENT_QUANTUM): number {
  if (!Number.isFinite(value) || value <= 0) return quantum;
  return Math.ceil(value / quantum) * quantum;
}

/** Quantise a light-space coordinate to whole shadow-map texels. */
export function snapToTexel(value: number, texel: number): number {
  if (!Number.isFinite(value)) return 0;
  if (!Number.isFinite(texel) || texel <= 0) return value;
  return Math.round(value / texel) * texel;
}

/** Normal offset for a fit, in world units. */
export function normalBiasForTexel(texel: number): number {
  const raw = NORMAL_BIAS_TEXELS * texel;
  if (!Number.isFinite(raw)) return NORMAL_BIAS_RANGE.min;
  return Math.min(NORMAL_BIAS_RANGE.max, Math.max(NORMAL_BIAS_RANGE.min, raw));
}

/** True when the camera's ground position is inside the factory footprint. */
export function isInsideFactoryFootprint(x: number, z: number): boolean {
  const bounds = SITE_LAYOUT.factory.bounds;
  return x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;
}

/**
 * Half extent of the exterior box for a given view distance.
 *
 * `groundDistance` is the horizontal distance from the camera to where its view
 * ray meets y=0; a negative value (level or upward gaze, so no intersection)
 * asks for the maximum.
 */
export function exteriorHalfExtent(groundDistance: number): number {
  const { minHalfExtent, halfExtent } = EXTERIOR_SHADOW_VOLUME;
  if (!Number.isFinite(groundDistance) || groundDistance < 0) return halfExtent;
  const fitted = EXTENT_GROUND_FRACTION * groundDistance + EXTENT_BASE;
  return Math.min(halfExtent, Math.max(minHalfExtent, fitted));
}

/**
 * How far ahead of the camera to centre the exterior box, in world units.
 *
 * Same `groundDistance` convention as {@link exteriorHalfExtent}.
 */
export function exteriorLeadDistance(
  groundDistance: number,
  halfExtent: number,
  planarMaxComponent = 1
): number {
  const minimum = LEAD_MIN_FRACTION * halfExtent;
  const maximum = LEAD_MAX_FRACTION * halfExtent;
  if (!Number.isFinite(groundDistance) || groundDistance < 0) return maximum;
  const preferred = Math.min(maximum, Math.max(minimum, LEAD_GROUND_FRACTION * groundDistance));
  // A shallow overview can saturate the extent before half-distance lead
  // leaves space for up-sun casters. Move the same box toward its receiver.
  // One metre covers the final texel snap; two metres keep the camera inside.
  // Working if every authored exterior view retains the 30-degree caster
  // margin without enlarging the shadow map's world extent or its texels.
  const axis = Number.isFinite(planarMaxComponent)
    ? THREE.MathUtils.clamp(planarMaxComponent, Math.SQRT1_2, 1)
    : 1;
  const casterMargin = EXTERIOR_SHADOW_VOLUME.halfY / Math.tan(Math.PI / 6) + 1;
  const receiverLead = groundDistance - (halfExtent - casterMargin) / axis;
  const cameraLimit = (halfExtent - 2) / axis;
  return Math.min(cameraLimit, Math.max(preferred, receiverLead));
}

export function SunShadowRig(): null {
  const scene = useThree((state) => state.scene);
  const lightRef = useRef<THREE.DirectionalLight | null>(null);
  const distanceRef = useRef(SHADOW_DEPTH_MARGIN + EXTERIOR_SHADOW_VOLUME.halfExtent);
  const centreRef = useRef(new THREE.Vector3());
  const frameRef = useRef(0);
  const castersPatchedRef = useRef<THREE.Object3D[]>([]);
  const casterAttemptsRef = useRef(0);

  // The light lives in a sibling component, so it cannot be handed over as a
  // prop without either lifting it or threading a context through
  // `OptimizedFactoryEnvironment`. Resolve it by name and release the target on
  // unmount.
  useEffect(() => {
    return () => {
      const light = lightRef.current;
      if (light && light.target.parent === scene) scene.remove(light.target);
      // Hand the light back the way it was found. The refit below latches
      // `shadow.autoUpdate` off and drives `needsUpdate` by hand; leaving it
      // off on a light this rig no longer drives freezes the shadow map at
      // whatever it last contained, which is what an HMR swap or a StrictMode
      // remount would otherwise produce.
      if (light) light.shadow.autoUpdate = true;
      lightRef.current = null;
      for (const object of castersPatchedRef.current) object.castShadow = false;
      castersPatchedRef.current = [];
    };
  }, [scene]);

  useFrame((state) => {
    let light = lightRef.current;
    if (!light) {
      const found = scene.getObjectByName(SUN_LIGHT_NAME);
      if (!(found instanceof THREE.DirectionalLight)) return;
      light = found;
      lightRef.current = light;
      // R3F's `<directionalLight>` leaves `light.target` as a detached
      // Object3D. Its `matrixWorld` is never updated by the render loop, so
      // writing `target.position` on a detached target moves nothing at all and
      // the shadow silently keeps aiming at the world origin.
      if (light.target.parent !== scene) scene.add(light.target);
    }
    if (!light.castShadow) return;

    const camera = state.camera;
    const shouldRefit = frameRef.current % SHADOW_REFIT_INTERVAL === 0;
    frameRef.current += 1;

    // THE WALL ENVELOPE MUST CAST, OR SUN POURS THROUGH SOLID WALLS.
    //
    // `OptimizedFactoryInfrastructure` marks the roof slabs and the columns
    // `castShadow` but leaves the wall segments `receiveShadow` only. That was
    // invisible while the shadow pass was off. With it on it is a hard bug: at
    // the app's default 10:00 the sun sits at 60 degrees, the roof's shadow is
    // displaced 19 units downsun, and a 19 x 100 band of interior floor along
    // the upsun wall gets lit straight through a solid wall.
    //
    // Patched here rather than in that file both because this rig owns scene
    // shadow configuration and because the file is out of scope. Transparent
    // materials are skipped on purpose: that leaves the glazing non-casting, so
    // the clerestory bays now throw real bands of sunlight onto the interior
    // floor - the effect the change is actually for.
    if (
      shouldRefit &&
      castersPatchedRef.current.length === 0 &&
      casterAttemptsRef.current < CASTER_PATCH_ATTEMPTS
    ) {
      casterAttemptsRef.current += 1;
      const envelope = scene.getObjectByName(WALL_ENVELOPE_NAME);
      envelope?.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh || mesh.castShadow) return;
        const material = mesh.material;
        const transparent = Array.isArray(material)
          ? material.some((entry) => entry.transparent)
          : Boolean(material?.transparent);
        if (transparent) return;
        mesh.castShadow = true;
        castersPatchedRef.current.push(mesh);
      });
    }

    // `OptimizedSkySystem` writes this position from the solar direction every
    // frame, so reading it back is how the rig stays in step with the sky
    // without reaching into that component's clock.
    _sunDirection.copy(light.position);
    if (_sunDirection.lengthSq() < 1e-6) return;
    _sunDirection.normalize();

    if (shouldRefit) {
      const inside = isInsideFactoryFootprint(camera.position.x, camera.position.z);
      let halfX: number;
      let halfY: number;
      let halfZ: number;

      if (inside) {
        _volumeCentre.set(
          FACTORY_SHADOW_VOLUME.centre[0],
          FACTORY_SHADOW_VOLUME.centre[1],
          FACTORY_SHADOW_VOLUME.centre[2]
        );
        halfX = FACTORY_SHADOW_VOLUME.half[0];
        halfY = FACTORY_SHADOW_VOLUME.half[1];
        halfZ = FACTORY_SHADOW_VOLUME.half[2];
      } else {
        camera.getWorldDirection(_forward);
        // Where the view ray meets the ground, expressed as a horizontal
        // distance. A ray that never descends yields -1, which both helpers
        // below read as "use the maximum".
        const groundDistance =
          _forward.y < -0.05 && camera.position.y > 0
            ? (-camera.position.y / _forward.y) * Math.hypot(_forward.x, _forward.z)
            : -1;
        halfX = exteriorHalfExtent(groundDistance);
        halfY = EXTERIOR_SHADOW_VOLUME.halfY;
        halfZ = halfX;
        const planar = Math.hypot(_forward.x, _forward.z);
        const axis =
          planar > 1e-4 ? Math.max(Math.abs(_forward.x), Math.abs(_forward.z)) / planar : 1;
        const lead = exteriorLeadDistance(groundDistance, halfX, axis);
        const leadX = planar > 1e-4 ? (_forward.x / planar) * lead : 0;
        const leadZ = planar > 1e-4 ? (_forward.z / planar) * lead : 0;
        _volumeCentre.set(
          camera.position.x + leadX,
          EXTERIOR_SHADOW_VOLUME.centreY,
          camera.position.z + leadZ
        );
      }

      // Basis three itself will use. `DirectionalLightShadow.updateMatrices`
      // aims the shadow camera with `Object3D.lookAt`, which reads
      // `shadow.camera.up` - so the up vector is assigned here as well, or the
      // snap below would be computed in a basis the renderer does not share and
      // would quietly do nothing.
      const up = Math.abs(_sunDirection.y) > VERTICAL_SUN_THRESHOLD ? UP_Z : UP_Y;
      light.shadow.camera.up.copy(up);
      _worldFromLight.lookAt(_sunDirection, ORIGIN, up);
      _lightFromWorld.copy(_worldFromLight).invert();

      // Columns of the world-from-light basis are the light-space axes in world
      // coordinates.
      const basis = _worldFromLight.elements;
      const extentX = projectedHalfExtent(basis[0], basis[1], basis[2], halfX, halfY, halfZ);
      const extentY = projectedHalfExtent(basis[4], basis[5], basis[6], halfX, halfY, halfZ);
      const extentZ = inside
        ? factoryOccluderDepth(basis[8], basis[9], basis[10])
        : projectedHalfExtent(basis[8], basis[9], basis[10], halfX, halfY, halfZ);

      // One square box keeps a single texel size, which keeps the snap below to
      // one quantum instead of two.
      const halfExtent = quantiseExtent(Math.max(extentX, extentY));
      const texel = (2 * halfExtent) / Math.max(1, light.shadow.mapSize.x);

      _lightSpaceCentre.copy(_volumeCentre).applyMatrix4(_lightFromWorld);
      _lightSpaceCentre.setX(snapToTexel(_lightSpaceCentre.x, texel));
      _lightSpaceCentre.setY(snapToTexel(_lightSpaceCentre.y, texel));
      centreRef.current.copy(_lightSpaceCentre).applyMatrix4(_worldFromLight);

      const distance = extentZ + SHADOW_DEPTH_MARGIN;
      distanceRef.current = distance;

      const shadowCamera = light.shadow.camera;
      shadowCamera.left = -halfExtent;
      shadowCamera.right = halfExtent;
      shadowCamera.top = halfExtent;
      shadowCamera.bottom = -halfExtent;
      shadowCamera.near = SHADOW_DEPTH_MARGIN;
      shadowCamera.far = distance + extentZ;
      shadowCamera.updateProjectionMatrix();

      light.shadow.normalBias = normalBiasForTexel(texel);

      // THE SHADOW MAP IS RE-RENDERED ON REFIT FRAMES ONLY.
      //
      // A shadow pass is a second submission of every caster in the box, and
      // the exterior box is 220 units across - it holds the yard, the terrain,
      // the village edge and the tree line. Measured at 1280x720 DPR 1.2 on the
      // medium preset, refreshing it every frame put `water` at 53.9 fps and
      // `farm` at 54.6 against a 55 floor. At one in three it is the same image
      // for two thirds less cost.
      //
      // What this trades: casters that move are up to two frames stale in the
      // shadow map. At the measured frame rates that is under 40 ms - about 5 cm
      // for the inspection camera and 17 cm for a forklift at full speed, against a
      // shadow whose own texel is 12 to 22 cm wide. The error is smaller than
      // the sampling grid it lands on.
      //
      // Safe because `WebGLShadowMap` skips `shadow.updateMatrices` on the
      // frames it skips the render, so `shadow.matrix` stays in step with the
      // map that was actually drawn. A stale matrix over a fresh map - which is
      // what refitting without redrawing would produce - is what makes shadows
      // slide off their casters.
      //
      // Refit but do not redraw while the key is dark: at night the sun damps
      // to zero and a full caster pass would be spent on a light that
      // contributes nothing. The stale map stays paired with its own matrix, and
      // the first refit above the threshold at dawn redraws it. A map that has
      // never been drawn (a session that starts at night) is drawn once.
      light.shadow.autoUpdate = false;
      if (light.intensity > SHADOW_MIN_INTENSITY || light.shadow.map === null) {
        light.shadow.needsUpdate = true;
      }
    }

    // Every frame, not only on a refit: the sky rewrites `light.position` from
    // the solar direction on the two frames in between, and leaving that stand
    // would point the light at the world origin instead of the fitted centre -
    // rotating the whole cascade twice out of every three frames.
    _lightPosition.copy(centreRef.current).addScaledVector(_sunDirection, distanceRef.current);
    light.position.copy(_lightPosition);
    light.target.position.copy(centreRef.current);
    light.target.updateMatrixWorld();
  });

  return null;
}
