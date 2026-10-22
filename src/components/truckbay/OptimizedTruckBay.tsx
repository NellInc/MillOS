import { GeneratedSurfaceMesh } from '../models/GeneratedGeometrySurface';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import {
  BUSINESS_BRANDS,
  heritagePrintSize,
  transportBrandForCompany,
} from '../scenery/HeritageSignage';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { selectSafetyHoldActive, useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useProductionStore } from '../../stores/productionStore';
import { useMaterialFlowStore } from '../../stores/materialFlowStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import {
  DECAL_OFFSET,
  FLOOR_LAYERS,
  POLYGON_OFFSET,
  RENDER_ORDER,
} from '../../constants/renderLayers';
import { toSimulationMinutes } from '../../simulation/simulationClock';
import { TRAILER_BED_Y } from '../../constants/dockLoading';
import { getRuntimeMode } from '../../runtime/runtimeMode';
import { createLinearDataTexture } from '../../utils/textureGenerator';
import { applyVehicleSurface } from '../../utils/vehicleSurface';
import { applyWorldSurface } from '../../utils/worldSurface';
import {
  TRUCK_CYCLE_SECONDS,
  applyTruckSafetyHold,
  calculateReceivingTruckState,
  calculateShippingTruckState,
  getTruckBenchmarkControllerStart,
  getTruckScheduleStatus,
  isTruckDockedPhase,
  resolveTrailerLoadSettle,
  type TruckAnimState,
} from './useTruckPhysics';

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const ROUNDED_BOX = new RoundedBoxGeometry(1, 1, 1, 3, 0.08);
// 24 radial segments, not 12: at 1.04 m diameter the old cylinder faceted
// visibly at dock range. The cost is ~340 triangles across one InstancedMesh
// draw call, and triangles are not this scene's constraint.
export const TRUCK_TYRE_WIDTH = 0.38;
/**
 * TYRE AND RIM, AS SECTIONS.
 *
 * The wheel was a closed 0.52 m cylinder with a 0.25 m disc pushed through it,
 * so from the side every wheel read as a flat black coin with a flat white
 * centre (shipping review: "flat disc wheels"). The tyre is now an open ring
 * with rounded shoulders and bulged sidewalls; the rim is a dished steel wheel
 * whose lip covers the tyre bead, set 4 cm into the wheel with a raised hub
 * boss. Points are (radius, axial), bottom face to top, so the lathe's normals
 * face out; the axle runs along the lathe axis.
 */
export const TRUCK_TYRE_PROFILE: readonly (readonly [number, number])[] = [
  [0.355, -0.165],
  [0.4, -0.188],
  [0.46, -0.19],
  [0.495, -0.182],
  [0.513, -0.162],
  [0.52, -0.13],
  [0.52, 0.13],
  [0.513, 0.162],
  [0.495, 0.182],
  [0.46, 0.19],
  [0.4, 0.188],
  [0.355, 0.165],
];
export const TRUCK_RIM_PROFILE: readonly (readonly [number, number])[] = [
  [0, -0.2],
  [0.09, -0.2],
  [0.11, -0.185],
  [0.125, -0.15],
  [0.29, -0.15],
  [0.33, -0.17],
  [0.36, -0.19],
  [0.372, -0.185],
  [0.372, 0.185],
  [0.36, 0.19],
  [0.33, 0.17],
  [0.29, 0.15],
  [0.125, 0.15],
  [0.11, 0.185],
  [0.09, 0.2],
  [0, 0.2],
];
const lathe = (profile: readonly (readonly [number, number])[], segments: number) =>
  new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    segments
  );
const WHEEL = lathe(TRUCK_TYRE_PROFILE, 24);
// Steering is flagged explicitly rather than inferred from array position:
// the old `index < 2` test silently steers the wrong wheels the moment the
// layout grows or is reordered, and it typechecks either way. The yard's tyre
// tracks (`yardWear.ts`) are laid from this same table.
export const TRUCK_WHEEL_LAYOUT = [
  // [x, y, z, isTrailer, isSteer, hasHub]
  [-1.38, 0.58, 3.7, false, true, true],
  [1.38, 0.58, 3.7, false, true, true],
  [-1.38, 0.58, 0.4, false, false, true],
  [1.38, 0.58, 0.4, false, false, true],
  [-1.0, 0.58, 0.4, false, false, false],
  [1.0, 0.58, 0.4, false, false, false],
  [-1.38, 0.58, -4.5, true, false, true],
  [1.38, 0.58, -4.5, true, false, true],
  [-1.0, 0.58, -4.5, true, false, false],
  [1.0, 0.58, -4.5, true, false, false],
  [-1.38, 0.58, -8.9, true, false, true],
  [1.38, 0.58, -8.9, true, false, true],
  [-1.0, 0.58, -8.9, true, false, false],
  [1.0, 0.58, -8.9, true, false, false],
] as const;
const HUB = lathe(TRUCK_RIM_PROFILE, 24);
const STEERING_WHEEL = new THREE.TorusGeometry(0.22, 0.025, 8, 18);
const FUEL_TANK = new THREE.CylinderGeometry(0.38, 0.38, 1.65, 16);
const EXHAUST_STACK = new THREE.CylinderGeometry(0.09, 0.11, 2.3, 10);
// Headlight spill belongs on the road. Translucent cone volumes turn into a
// faceted boulder when the two lamps overlap from an oblique camera angle.
// One feathered ground projection also costs one draw instead of two.
const HEADLIGHT_POOL = new THREE.PlaneGeometry(4.4, 9);
export const TRUCK_WHEEL_RADIUS = 0.52;

/**
 * Tyre tread relief, as a normal map rather than geometry.
 *
 * `CylinderGeometry` maps U around the circumference and V across the tyre
 * width, so the tile is repeated 24 times in U (one lug block per repeat, about
 * 0.14 m of tread) and once in V. The height field is differenced rather than
 * painted directly into the channels so the perturbation is SIGNED and the two
 * axes are decorrelated - an unsigned normal biases every texel the same way
 * and the relief cancels. Feature widths are kept at 6-10 px at 64 px so the
 * pattern survives the first mip instead of averaging to a flat constant.
 */
const TYRE_TREAD_NORMAL = (() => {
  const size = 64;
  const height = new Float32Array(size * size);
  const bump = (value: number, centre: number, width: number): number =>
    Math.exp(-((value - centre) ** 2) / width);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      // Two circumferential grooves across the tread, one lateral sipe per lug.
      const grooves = bump(v, 0.3, 0.0016) + bump(v, 0.7, 0.0016);
      const sipe = bump(u, 0.5, 0.0022);
      // Shoulder blocks fall away at the tread edges.
      const shoulder = bump(v, 0.02, 0.004) + bump(v, 0.98, 0.004);
      height[y * size + x] = 1 - grooves * 0.85 - sipe * 0.55 - shoulder * 0.4;
    }
  }
  const data = new Uint8Array(size * size * 4);
  const at = (x: number, y: number): number =>
    height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const dx = (at(x + 1, y) - at(x - 1, y)) * 0.5;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 0.5;
      const scale = 2.4;
      const nx = -dx * scale;
      const ny = -dy * scale;
      const length = Math.hypot(nx, ny, 1);
      data[i] = Math.round(((nx / length) * 0.5 + 0.5) * 255);
      data[i + 1] = Math.round(((ny / length) * 0.5 + 0.5) * 255);
      data[i + 2] = Math.round((1 / length) * 0.5 * 255 + 127.5);
      data[i + 3] = 255;
    }
  }
  const texture = createLinearDataTexture(data, size, size);
  texture.repeat.set(24, 1);
  texture.anisotropy = 4;
  return texture;
})();

/**
 * SURFACE TUNING NOTE.
 *
 * Every painted surface here used to sit at metalness 0.22-0.45 - the band
 * where the BRDF has neither a full diffuse albedo nor a real specular, which
 * is why the vehicles read as coloured plastic. Paint is a DIELECTRIC base
 * under a specular clearcoat, so painted panels are now metalness 0 with a
 * clearcoat, and metalness 1.0 is reserved for genuinely bare metal (chrome
 * bumper, exhaust stacks, wheel hubs, frame rails). With `scene.environment`
 * now bound, all of it finally has something to reflect.
 *
 * COLOUR-SPACE AUDIT: no material in this file carries BOTH a `color:` tint and
 * an albedo `map:`, so nothing here was compensating for the sRGB DataTexture
 * bug and no tint needed reverting. `tyre` keeps its dark `color:` because its
 * only map is a NORMAL map, which does not multiply albedo. The one mapped
 * material, `TruckIdentityDecals`, has no `color:` at all.
 */
/**
 * NO `envMapIntensity` APPEARS BELOW, AND THAT IS DELIBERATE.
 *
 * Verified in `three/src/renderers`: `WebGLMaterials.refreshUniformsStandard`
 * copies `material.envMapIntensity` into the uniform ONLY inside
 * `if ( material.envMap )`. Nothing here sets a per-material `envMap` - the
 * whole scene reflects `scene.environment` - and `WebGLRenderer` then
 * unconditionally assigns `m_uniforms.envMapIntensity.value =
 * scene.environmentIntensity` for every standard/physical material whose own
 * `envMap` is null. So on this scene `material.envMapIntensity` is a silent
 * no-op and the single global 0.30 governs every reflection. Writing one here
 * would read as a working knob and do nothing. Reflection strength is instead
 * compensated through the two properties that DO apply: base colour and
 * roughness. See the report for the cross-domain recommendation.
 */
const MATERIALS = {
  tyre: new THREE.MeshStandardMaterial({
    color: '#0e1012',
    roughness: 0.96,
    metalness: 0,
    normalMap: TYRE_TREAD_NORMAL,
    normalScale: new THREE.Vector2(0.85, 0.85),
  }),
  /** Flat rubber: mudflaps and dock seals. No tread. */
  rubber: new THREE.MeshStandardMaterial({ color: '#131518', roughness: 0.94, metalness: 0 }),
  /** Bare machined alloy. Genuine metal, so genuine metalness. */
  hub: new THREE.MeshStandardMaterial({ color: '#dfe6e8', roughness: 0.26, metalness: 1 }),
  /**
   * Polished chrome: bumper, exhaust stacks, mirror backs.
   *
   * Roughness is 0.26, not the 0.1 a mirror finish would suggest, and the base
   * colour is lifted. Both are compensation for the environment this scene
   * actually has: a 64 x 32 PMREM at `environmentIntensity` 0.30. A metalness-1
   * surface has no diffuse term at all, so its entire appearance is that
   * reflection plus the sun's specular lobe - at roughness 0.1 the lobe is too
   * narrow to catch the sun except at a glancing instant, and the rest of the
   * surface samples mip 0 of a 64-pixel-wide source. A broader lobe picks a
   * blurrier mip (hiding the low resolution) and holds a wider sun highlight.
   */
  chrome: new THREE.MeshStandardMaterial({ color: '#e8edef', roughness: 0.26, metalness: 1 }),
  /**
   * Automotive glass. Dark tint plus a real dielectric specular is what makes
   * glass read as glass; the old pale cyan plus emissive is exactly the
   * "plastic canopy" tell. Deliberately NOT `transmission`: any non-zero
   * transmission forces a full-screen transmission render target every frame.
   */
  glass: new THREE.MeshPhysicalMaterial({
    color: '#16262c',
    roughness: 0.06,
    metalness: 0,
    ior: 1.52,
    specularIntensity: 1,
    reflectivity: 0.5,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  }),
  grille: new THREE.MeshStandardMaterial({ color: '#2b3439', roughness: 0.45, metalness: 1 }),
  interior: new THREE.MeshStandardMaterial({ color: '#242c31', roughness: 0.85, metalness: 0 }),
  /** Retroreflective conspicuity tape. Per-strip colour rides `instanceColor`. */
  conspicuityTape: new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.28,
    metalness: 0,
  }),
  dock: new THREE.MeshStandardMaterial({ color: '#77848a', roughness: 0.88 }),
  dockDark: new THREE.MeshStandardMaterial({ color: '#314148', roughness: 0.78 }),
  canopy: new THREE.MeshStandardMaterial({ color: '#566970', roughness: 0.58, metalness: 0.42 }),
  door: new THREE.MeshStandardMaterial({ color: '#24353b', roughness: 0.7, metalness: 0.34 }),
  trailerTrim: new THREE.MeshStandardMaterial({
    color: '#8a959c',
    roughness: 0.45,
    metalness: 0.9,
  }),
  signal: new THREE.MeshBasicMaterial({ color: '#55d98a', toneMapped: false }),
  safety: new THREE.MeshBasicMaterial({
    color: '#f4c84a',
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: POLYGON_OFFSET.exteriorOverlay.factor,
    polygonOffsetUnits: POLYGON_OFFSET.exteriorOverlay.units,
  }),
} as const;

/**
 * The analytic finish on the trim, semantic by semantic.
 *
 * `applyVehicleSurface` below already carries the bodywork - cab, trailer skin,
 * gravity grime, panel ribs. What it never reached is the TRIM, and
 * `test-results/pass7/unfinished-models.mjs` names it: 16.4 m of conspicuity
 * tape on every trailer, which is the largest single untreated row on either
 * vehicle, plus the chrome, hubs, grille, cab interior and mudflaps.
 *
 * WORLD SPACE would be wrong for all of it and none of these profiles use it -
 * `vehicle`, `metal` and `signage` are read here through `resolveSurfaceProfile`
 * only where the material's own description already implies the right family;
 * everything else is stated, because a truck's chrome and its mudflaps are both
 * "dark, smooth, metalness-ish" to a resolver and are not the same surface.
 *
 * DELIBERATELY ABSENT, each on an existing rule:
 *   glass                       transparent at 0.55 - declined by construction
 *   signal, safety              `MeshBasicMaterial`; unlit on purpose
 *   amber / red side markers    emissive at 0.35; `isOutOfSurfaceScope` declines
 *                               emitters, and a marker lamp represents EMITTED
 *                               light rather than a reflecting surface
 *   tyre                        already carries a tread normal map
 */
applyWorldSurface(MATERIALS.rubber, 'vehicle');
applyWorldSurface(MATERIALS.hub, 'metal');
applyWorldSurface(MATERIALS.chrome, 'metal');
applyWorldSurface(MATERIALS.grille, 'metal');
applyWorldSurface(MATERIALS.interior, 'fabric');
// Retroreflective tape, and `signage` is the profile authored for exactly this
// class: the lightest in the set, because a conspicuity stripe weathered into
// the background has been broken rather than finished. Per-strip colour rides
// `instanceColor`, which `<color_fragment>` applies before this modulates it.
applyWorldSurface(MATERIALS.conspicuityTape, 'signage');
applyWorldSurface(MATERIALS.trailerTrim, 'metal');
applyWorldSurface(MATERIALS.dock, 'masonry');
applyWorldSurface(MATERIALS.dockDark, 'masonry');
applyWorldSurface(MATERIALS.canopy, 'metal');
applyWorldSurface(MATERIALS.door, 'painted');

/**
 * Draw order for vehicle glazing.
 *
 * The cab windows set `depthWrite: false` and had no `renderOrder`, so as
 * `cabRoll` / `cabPitch` animate the default distance heuristic could swap the
 * windscreen and the two side panes against the interior meshes behind them and
 * pop. Sits above the opaque default (0) and below the floor overlays (5+),
 * which never contend with a cab window.
 *
 * MIGRATED to `RENDER_ORDER.vehicleGlass` so the truck cab and the forklift
 * canopy sort against one central reference instead of two literals that could
 * drift apart. Registered as `vehicle-glazing` in `constants/depthRegistry.ts`.
 */
const VEHICLE_GLASS_RENDER_ORDER = RENDER_ORDER.vehicleGlass;

/** Hour boundaries at which running lights come on. */
const LIGHTS_ON_BEFORE_HOUR = 7;
const LIGHTS_ON_AFTER_HOUR = 18;

/** Height of the tractor's roll centre, and the drive axle it pitches about. */
const CAB_ROLL_CENTRE_Y = 0.9;
const CAB_PITCH_CENTRE_Z = 0.4;

/**
 * CAB GREEBLES ARE HIDDEN ONCE THEY ARE SMALLER THAN A PIXEL.
 *
 * A truck is the one thing in the truck bay `StaticMeshBatch` can never touch:
 * `hasExcludedAncestor` matches `shipping-truck` / `receiving-truck` by name, so
 * every one of these ~50 objects is its own draw call in every frame it survives
 * frustum culling. That is correct - they move - but it makes the vehicles the
 * largest un-batchable block in the scene, and the exterior benchmark cameras
 * look at them from 100 to 175 m.
 *
 * At 1280 px across a 79-degree horizontal field, one world metre is 1280 /
 * (2 d tan 39.7deg) px, so at 115 m a metre is 6.7 px. The parts gated here are
 * 0.05-0.24 m across (window pillars, mirror glass, and the dash behind
 * 0.55-opacity glazing) - between a third of a pixel and one and a half. The
 * silhouette parts are NOT gated: the cab shell, roof fairing, greenhouse
 * glazing, grille, bumper, exhaust stacks, every lamp, the wheels and the whole
 * trailer stay at every distance, so the vehicle's read never changes.
 *
 * `visible` is written imperatively from `useFrame`, not held in React state:
 * a state flip would re-render fifty JSX elements on a threshold crossing for a
 * change three lines of `Object3D` writes can make.
 */
const CAB_DETAIL_VISIBLE_DISTANCE = 100;
const CAB_DETAIL_HIDDEN_DISTANCE = 115;

interface TruckVisualProps {
  readonly colour: string;
  readonly stateRef: React.MutableRefObject<TruckAnimState>;
  readonly wheelRotationRef: React.MutableRefObject<number>;
  readonly company?: string;
  readonly plateNumber?: string;
  /**
   * Road-film strength, 0..1. Deliberately a prop: the two trucks share a
   * module-level material table, and identical wear on both reads as a tiling
   * artefact. The grime-carrying materials are cloned per truck so the two can
   * differ, which by itself stops them reading as clones.
   */
  readonly grime?: number;
  /** Conserved outbound load progress, used for a subtle trailer suspension settle. */
  readonly loadRatio?: number;
}

function TruckIdentityDecals({
  company,
  plateNumber,
  colour,
}: {
  readonly company: string;
  readonly plateNumber: string;
  readonly colour: string;
}) {
  const brand = transportBrandForCompany(company);
  const artwork = useTexture(BUSINESS_BRANDS[brand ?? 'mill'].primary);
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const context = canvas.getContext('2d');
    if (context) {
      context.fillStyle = brand ? BUSINESS_BRANDS[brand].field : '#eef1ed';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = colour;
      context.fillRect(0, 0, 36, canvas.height);
      if (brand) {
        // The authored wordmark enters the existing atlas, never a third decal.
        const image = artwork.image as { width: number; height: number };
        const [width, height] = heritagePrintSize(910, 162, image.width, image.height);
        context.drawImage(
          artwork.image as CanvasImageSource,
          530 - width / 2,
          96 - height / 2,
          width,
          height
        );
      } else {
        // Unknown carriers retain their actual company name, never another logo.
        context.fillStyle = '#19272b';
        context.font = '700 80px Inter, Arial, sans-serif';
        context.fillText(company, 78, 112);
      }
      context.fillStyle = brand ? '#fff0d2' : '#526469';
      context.font = '600 30px Inter, Arial, sans-serif';
      context.fillText(`MILL LOGISTICS  •  ${plateNumber}`, 82, 219);
      context.fillStyle = '#d5a429';
      context.fillRect(78, 238, 870, 4);
    }
    const canvasTexture = new THREE.CanvasTexture(canvas);
    canvasTexture.colorSpace = THREE.SRGBColorSpace;
    canvasTexture.anisotropy = 4;
    return canvasTexture;
  }, [colour, company, plateNumber, brand, artwork]);
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.55,
        // Painted signwriting is a dielectric. 0.08 was the invalid band.
        metalness: 0,
        polygonOffset: true,
        polygonOffsetFactor: DECAL_OFFSET.wall.factor,
        polygonOffsetUnits: DECAL_OFFSET.wall.units,
      }),
    [texture]
  );

  useEffect(
    () => () => {
      material.dispose();
      texture.dispose();
    },
    [material, texture]
  );

  return (
    <>
      {/* Signwriting panels clear the accent band's outer face at |x|=1.33.
          Their inner face is at 1.3325, so the band cannot cover the copy.
          The trailer remains the caster. */}
      <mesh
        geometry={UNIT_BOX}
        material={material}
        name="trailer-identity-left"
        position={[-1.35, 2.55, -5.65]}
        rotation={[0, -Math.PI / 2, 0]}
        scale={[8.2, 2.05, 0.035]}
        receiveShadow
      />
      <mesh
        geometry={UNIT_BOX}
        material={material}
        name="trailer-identity-right"
        position={[1.35, 2.55, -5.65]}
        rotation={[0, Math.PI / 2, 0]}
        scale={[8.2, 2.05, 0.035]}
        receiveShadow
      />
    </>
  );
}

/** One entry of a static instanced detail batch: position + scale on a unit box. */
export interface DetailInstance {
  readonly position: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
}

const applyDetailInstances = (
  mesh: THREE.InstancedMesh | null,
  instances: readonly DetailInstance[],
  scratch: THREE.Object3D
): void => {
  if (!mesh) return;
  instances.forEach(({ position, scale }, index) => {
    scratch.position.set(...position);
    scratch.rotation.set(0, 0, 0);
    scratch.scale.set(...scale);
    scratch.updateMatrix();
    mesh.setMatrixAt(index, scratch.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
};

// ---------------------------------------------------------------------------
// STATIC DETAIL LAYOUTS
//
// TRAILER FRAME (local, cab forward = +Z): skin at x = +/-1.275, y 0.325-4.575,
// z -11.35 to -0.15. Anything standing proud of the skin sits at |x| = 1.30 or
// beyond - 0.025 m of clearance, which is well above the `SURFACE_LAYERS.decal`
// standoff and cannot z-fight.
//
// WHY THE SKIRTS AND ARCHES EXIST AT ALL: the wheel cylinders lie along X and
// occupy |x| 1.19-1.57, while the skin is at 1.275, so roughly a third of every
// tyre is buried in the bodywork with a hard intersection line. Real trailers
// explain that line with a fender and an aero skirt; without them, adding wheel
// detail only makes the intersection more obvious. Raising the trailer floor to
// clear the wheels is NOT an option - the chassis rail top is the cargo bed the
// dock deck is built to (TRAILER_BED_Y, constants/dockLoading).
// ---------------------------------------------------------------------------

const TRAILER_SKIN_DETAILS: readonly DetailInstance[] = [
  // Wheel arches over each tandem axle. Width spans x 1.245-1.595, which
  // reaches past the outer tyre face at 1.57 - a fender narrower than its tyre
  // is worse than none, because it draws the eye to the overhang.
  { position: [-1.42, 1.25, -4.5], scale: [0.35, 0.16, 1.6] },
  { position: [1.42, 1.25, -4.5], scale: [0.35, 0.16, 1.6] },
  { position: [-1.42, 1.25, -8.9], scale: [0.35, 0.16, 1.6] },
  { position: [1.42, 1.25, -8.9], scale: [0.35, 0.16, 1.6] },
  // Aero side skirts, forward and between the tandems.
  { position: [-1.29, 0.79, -2.6], scale: [0.05, 0.9, 2.2] },
  { position: [1.29, 0.79, -2.6], scale: [0.05, 0.9, 2.2] },
  { position: [-1.29, 0.79, -6.7], scale: [0.05, 0.9, 2.8] },
  { position: [1.29, 0.79, -6.7], scale: [0.05, 0.9, 2.8] },
];

/** The underride guard bar across the trailer's tail; the dock leveler lip stops short of it. */
export const TRAILER_UNDERRIDE_GUARD: DetailInstance = {
  position: [0, 0.52, -11.62],
  scale: [2.4, 0.18, 0.12],
};

const TRAILER_FRAME_DETAILS: readonly DetailInstance[] = [
  // Sliding tandem slide rails.
  { position: [-1.05, 0.42, -6.7], scale: [0.14, 0.2, 5.6] },
  { position: [1.05, 0.42, -6.7], scale: [0.14, 0.2, 5.6] },
  // ICC rear underride guard.
  TRAILER_UNDERRIDE_GUARD,
  { position: [-0.85, 0.9, -11.58], scale: [0.12, 0.74, 0.1] },
  { position: [0.85, 0.9, -11.58], scale: [0.12, 0.74, 0.1] },
];

/** Closed rear door leaves (one each side of the centre line), 0.1 m thick. */
export const TRAILER_REAR_DOOR = { z: -11.38, depth: 0.1 } as const;

/** Rear lamp cluster, mounted on the closed doors' outer face (z -11.43). Each
 * 0.08 m housing is seated 2 cm into the door leaf, so its lens stands 6 cm
 * proud. At z -11.38/-11.39 the reverse and signal lenses lay exactly on the
 * door face (a 0 mm coplanar pair that flickered against the door paint) and
 * the brake lamps sat 1 cm inside the doors, where they never showed.
 */
export const TRAILER_REAR_LAMPS: readonly (DetailInstance & {
  readonly lamp: 'brake' | 'reverse' | 'left-signal' | 'right-signal';
})[] = [
  { lamp: 'brake', position: [-0.72, 1.05, -11.45], scale: [0.42, 0.28, 0.08] },
  { lamp: 'brake', position: [0.72, 1.05, -11.45], scale: [0.42, 0.28, 0.08] },
  // Reverse lamps are a PAIR. The old cluster had exactly one, offset to the
  // left, which reads as a modelling slip from any rear angle.
  { lamp: 'reverse', position: [-0.25, 1.05, -11.45], scale: [0.26, 0.24, 0.08] },
  { lamp: 'reverse', position: [0.25, 1.05, -11.45], scale: [0.26, 0.24, 0.08] },
  // Signals at 1.1, not 1.08: 6 cm from the brake lamps leaves room for both housings.
  // Signals at 1.1, not 1.08: 6 cm to the brake lamps leaves room for both housings.
  { lamp: 'left-signal', position: [-1.1, 1.05, -11.45], scale: [0.22, 0.24, 0.08] },
  { lamp: 'right-signal', position: [1.1, 1.05, -11.45], scale: [0.22, 0.24, 0.08] },
];

/** Emissive colours of the rear lamp lenses (display sRGB). */
export const TRUCK_REAR_LAMP_EMISSIVE = { brake: '#ff1f26', signal: '#ff9b19' } as const;

/** Rear lamp emissive intensities for one frame. Brake lamps double as tail
 * lamps, which is how a real rear cluster works. Each lit value keeps the lens's
 * peak near the Neutral tone curve's shoulder: at 4.5 the curve blended a lit
 * brake lamp a third of the way to white, and it read pink; signals at 4.2 read
 * pale yellow. Braking stays clearly brighter than the tail lamp.
 */
export function truckRearLampIntensities(
  state: Pick<TruckAnimState, 'brakeLights' | 'reverseLights' | 'leftSignal' | 'rightSignal'>,
  lightsOn: boolean
) {
  return {
    brake: state.brakeLights ? 1.2 : lightsOn ? 0.55 : 0.15,
    reverse: state.reverseLights ? 4.5 : 0.1,
    leftSignal: state.leftSignal ? 1.2 : 0.12,
    rightSignal: state.rightSignal ? 1.2 : 0.12,
  };
}

// Hang from the underframe down to just above the road, aligned with the tyre
// they trail: x 1.165-1.585 against a tyre at 1.19-1.57.
export const TRAILER_MUDFLAPS: readonly DetailInstance[] = [
  { position: [-1.375, 0.21, -9.74], scale: [0.42, 0.42, 0.03] },
  { position: [1.375, 0.21, -9.74], scale: [0.42, 0.42, 0.03] },
  { position: [-1.375, 0.21, -0.42], scale: [0.4, 0.4, 0.03] },
  { position: [1.375, 0.21, -0.42], scale: [0.4, 0.4, 0.03] },
];

// ---------------------------------------------------------------------------
// EDGES, HOUSINGS, HANGERS AND BEVELS
//
// final-med-12 logistics-close read the trailer as a stack of untreated boxes:
// cube lamps standing on the doors, a pure black box for each mud flap, a box
// body with nothing on its edges, and a box cab. A box van is in fact a box;
// what makes one read as built is its extruded aluminium edge framing, lamps
// sunk in housings, and flaps hung from a bar. All of it is lit matter.
// ---------------------------------------------------------------------------

/**
 * Aluminium corner posts on all four vertical edges, outboard of the skin
 * (x 1.28-1.36) so the rear door hinges at x 1.28 still swing clear. The rear
 * pair runs 2 cm past the door face; the front pair stops short of the first
 * conspicuity strip.
 */
export const TRAILER_CORNER_POSTS: readonly DetailInstance[] = [-1, 1].flatMap((side) => [
  { position: [side * 1.32, 2.45, -11.35] as const, scale: [0.08, 4.25, 0.2] as const },
  { position: [side * 1.32, 2.45, -0.18] as const, scale: [0.08, 4.25, 0.14] as const },
]);

/** Top side rails along both roof edges, above the clearance lamps (y 4.52). */
export const TRAILER_TOP_RAILS: readonly DetailInstance[] = [-1, 1].map((side) => ({
  position: [side * 1.3, 4.575, -5.75] as const,
  scale: [0.06, 0.09, 11.2] as const,
}));

/** Posts and rails share one aluminium batch. */
const TRAILER_EDGE_TRIM: readonly DetailInstance[] = [
  ...TRAILER_CORNER_POSTS,
  ...TRAILER_TOP_RAILS,
];

/** Lamp housing wall thickness and its z span: from 1 cm inside the door to 4 cm past the lens. */
const LAMP_BEZEL = { wall: 0.03, front: -11.53, back: -11.42 } as const;

/** Four walls round each rear lamp lens, their face 4 cm proud of the lens. */
export const TRAILER_LAMP_BEZELS: readonly DetailInstance[] = TRAILER_REAR_LAMPS.flatMap(
  ({ position: [x, y], scale: [w, h] }) => {
    const t = LAMP_BEZEL.wall;
    const z = (LAMP_BEZEL.front + LAMP_BEZEL.back) / 2;
    const d = LAMP_BEZEL.back - LAMP_BEZEL.front;
    return [
      { position: [x, y + h / 2 + t / 2, z] as const, scale: [w + 2 * t, t, d] as const },
      { position: [x, y - h / 2 - t / 2, z] as const, scale: [w + 2 * t, t, d] as const },
      { position: [x - w / 2 - t / 2, y, z] as const, scale: [t, h, d] as const },
      { position: [x + w / 2 + t / 2, y, z] as const, scale: [t, h, d] as const },
    ];
  }
);

/** A steel hanger bar across the top of each flap: the flap's one lit edge. */
export const TRAILER_MUDFLAP_HANGERS: readonly DetailInstance[] = TRAILER_MUDFLAPS.map(
  ({ position: [x, y, z], scale: [w, h] }) => ({
    position: [x, y + h / 2 + 0.015, z] as const,
    scale: [w + 0.04, 0.07, 0.07] as const,
  })
);

/**
 * The cab-over's front, bevelled: a hood lip sloping back from the grille to
 * the windscreen, a chamfered sill under the grille, and a sloped nose on the
 * roof fairing. Each is a plate tipped about x (`rotationX`, radians).
 */
export const TRUCK_CAB_BEVELS: readonly (DetailInstance & {
  readonly part: 'hood' | 'grille-surround' | 'fairing-nose';
  readonly rotationX: number;
})[] = [
  { part: 'hood', position: [0, 1.72, 4.98], scale: [2.3, 0.42, 0.1], rotationX: -0.55 },
  {
    part: 'grille-surround',
    position: [0, 0.84, 4.97],
    scale: [1.84, 0.14, 0.08],
    rotationX: 0.6,
  },
  { part: 'fairing-nose', position: [0, 3.68, 4.58], scale: [2.62, 0.48, 0.08], rotationX: -0.9 },
];

/** The cab shell box: x +/-1.275, y 0.475-2.025, z 1.4-4.9. */
export const TRUCK_CAB_SHELL = { position: [0, 1.25, 3.15], scale: [2.55, 1.55, 3.5] } as const;

export const CAB_DETAILS: readonly DetailInstance[] = [
  // Steer axle fenders. The drive axle had a matching pair: flat 1.55 m slabs
  // 0.3 m outboard of the cab, running from behind the cab back to under the
  // trailer nose with nothing holding them, which read as a chassis rail
  // sticking out behind the cab (shipping review). The drive tyres' own
  // mudflaps (TRAILER_MUDFLAPS at z -0.42) are what a tractor carries there.
  { position: [-1.42, 1.25, 3.7], scale: [0.35, 0.16, 1.55] },
  { position: [1.42, 1.25, 3.7], scale: [0.35, 0.16, 1.55] },
  // Mirror arms, which the floating mirror heads never had.
  { position: [-1.42, 2.9, 4.32], scale: [0.24, 0.05, 0.05] },
  { position: [1.42, 2.9, 4.32], scale: [0.24, 0.05, 0.05] },
  { position: [-1.53, 2.62, 4.05], scale: [0.05, 0.62, 0.05] },
  { position: [1.53, 2.62, 4.05], scale: [0.05, 0.62, 0.05] },
  // Cab entry steps.
  { position: [-1.3, 0.55, 2.7], scale: [0.1, 0.06, 0.7] },
  { position: [1.3, 0.55, 2.7], scale: [0.1, 0.06, 0.7] },
  // Sun visor over the windscreen.
  { position: [0, 3.32, 4.92], scale: [2.5, 0.09, 0.34] },
  // Roof fairing side extenders.
  { position: [-1.33, 3.0, 1.95], scale: [0.08, 1.4, 1.0] },
  { position: [1.33, 3.0, 1.95], scale: [0.08, 1.4, 1.0] },
];

/** Grille bar heights over the 0.62 m grille plate (y 0.89-1.51). */
const TRUCK_GRILLE_BARS = [0.98, 1.1, 1.22, 1.34, 1.46] as const;

/**
 * The two corner deflectors: 0.62 m chamfers from the cab side (x 1.29,
 * z 4.42) round to the front face (x 0.98, z 4.95), 0.1 m thick.
 */
export const TRUCK_CORNER_DEFLECTORS = [-1, 1].map((side) => ({
  x: side * 1.09,
  z: 4.67,
  yaw: side * -0.555,
}));

/** Amber DOT side markers plus the two front upper clearance lamps. */
const AMBER_MARKERS: readonly DetailInstance[] = [
  ...([-1.6, -4.4, -7.2, -10.0] as const).flatMap((z) => [
    { position: [-1.31, 1.45, z] as const, scale: [0.05, 0.1, 0.24] as const },
    { position: [1.31, 1.45, z] as const, scale: [0.05, 0.1, 0.24] as const },
  ]),
  { position: [-1.28, 4.46, -0.4], scale: [0.06, 0.12, 0.18] },
  { position: [1.28, 4.46, -0.4], scale: [0.06, 0.12, 0.18] },
];

/** Red rear clearance lamps and the three-lamp identification bar. */
const RED_MARKERS: readonly DetailInstance[] = [
  { position: [-1.28, 4.46, -11.1], scale: [0.06, 0.12, 0.18] },
  { position: [1.28, 4.46, -11.1], scale: [0.06, 0.12, 0.18] },
  { position: [-0.3, 4.52, -11.32], scale: [0.14, 0.1, 0.08] },
  { position: [0, 4.52, -11.32], scale: [0.14, 0.1, 0.08] },
  { position: [0.3, 4.52, -11.32], scale: [0.14, 0.1, 0.08] },
  { position: [-1.31, 1.45, -11.05], scale: [0.05, 0.1, 0.24] },
  { position: [1.31, 1.45, -11.05], scale: [0.05, 0.1, 0.24] },
];

/**
 * ICC conspicuity striping: the alternating red/white tape every road-legal
 * trailer carries. Colour rides `instanceColor`, so all 22 strips are one draw
 * call. `instanceColor` multiplies `diffuseColor` only, which is exactly right
 * here - the tape is albedo, not emissive.
 */
const CONSPICUITY_TAPE = (() => {
  const strips: { instance: DetailInstance; red: boolean }[] = [];
  for (let index = 0; index < 11; index += 1) {
    const z = -0.7 - index * 1.0;
    const red = index % 2 === 0;
    strips.push({ instance: { position: [-1.305, 1.02, z], scale: [0.04, 0.26, 0.86] }, red });
    strips.push({ instance: { position: [1.305, 1.02, z], scale: [0.04, 0.26, 0.86] }, red });
  }
  return strips;
})();

const TAPE_RED = new THREE.Color('#c0271f');
const TAPE_WHITE = new THREE.Color('#e9e6dd');

export function OptimizedTruckVisual({
  colour,
  stateRef,
  wheelRotationRef,
  company = 'MILL LOGISTICS',
  plateNumber = 'MILL 001',
  grime = 0.7,
  loadRatio = 0,
}: TruckVisualProps) {
  const cabRef = useRef<THREE.Group>(null);
  const trailerRef = useRef<THREE.Group>(null);
  const leftDoorRef = useRef<THREE.Group>(null);
  const rightDoorRef = useRef<THREE.Group>(null);
  const wheelsRef = useRef<THREE.InstancedMesh>(null);
  const hubsRef = useRef<THREE.InstancedMesh>(null);
  const landingGearRef = useRef<THREE.InstancedMesh>(null);
  const trailerSkinDetailRef = useRef<THREE.InstancedMesh>(null);
  const trailerFrameDetailRef = useRef<THREE.InstancedMesh>(null);
  const mudflapRef = useRef<THREE.InstancedMesh>(null);
  const tapeRef = useRef<THREE.InstancedMesh>(null);
  const amberMarkerRef = useRef<THREE.InstancedMesh>(null);
  const redMarkerRef = useRef<THREE.InstancedMesh>(null);
  const cabDetailRef = useRef<THREE.InstancedMesh>(null);
  const cabBevelRef = useRef<THREE.InstancedMesh>(null);
  const trailerEdgeRef = useRef<THREE.InstancedMesh>(null);
  const lampBezelRef = useRef<THREE.InstancedMesh>(null);
  const mudflapHangerRef = useRef<THREE.InstancedMesh>(null);
  const beamRef = useRef<THREE.Group>(null);
  const wheelDummyRef = useRef(new THREE.Object3D());
  const landingGearDummyRef = useRef(new THREE.Object3D());
  const detailDummyRef = useRef(new THREE.Object3D());
  const lightsOnRef = useRef(false);
  const nearDetailGroupsRef = useRef<THREE.Group[]>([]);
  const nearDetailVisibleRef = useRef(true);

  // Callback ref so the gated groups can be scattered through the cab and
  // trailer without four named refs and four hand-written assignments.
  const registerNearDetail = useCallback((group: THREE.Group | null) => {
    if (!group) return;
    const groups = nearDetailGroupsRef.current;
    if (!groups.includes(group)) groups.push(group);
  }, []);

  // LAMP MATERIALS. `toneMapped` is deliberately TRUE, not false.
  //
  // While the composer is mounted it forces `gl.toneMapping` to
  // `NoToneMapping`, which makes `<tonemapping_fragment>` compile away and
  // renders `material.toneMapped` inert - so on every tier that draws a truck
  // the flag changes nothing. It only bites on a no-composer path, where
  // `toneMapped: false` clamps a >1.0 emissive to a flat white swatch instead
  // of letting the Neutral curve roll it off. `true` is therefore correct on
  // both paths and needs no `isPostProcessingActive` branch. (This component is
  // never mounted at `low` in any case: `MillScene` gates it on
  // `!isLowGraphics`.)
  const brakeMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#3d1112',
        emissive: TRUCK_REAR_LAMP_EMISSIVE.brake,
        emissiveIntensity: 0.15,
        roughness: 0.22,
        metalness: 0,
        toneMapped: true,
      }),
    []
  );
  const reverseMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#c4ced0',
        emissive: '#ffffff',
        emissiveIntensity: 0.1,
        roughness: 0.2,
        metalness: 0,
        toneMapped: true,
      }),
    []
  );
  const leftSignalMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#6b4409',
        emissive: TRUCK_REAR_LAMP_EMISSIVE.signal,
        emissiveIntensity: 0.12,
        roughness: 0.22,
        metalness: 0,
        toneMapped: true,
      }),
    []
  );
  const rightSignalMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#6b4409',
        emissive: TRUCK_REAR_LAMP_EMISSIVE.signal,
        emissiveIntensity: 0.12,
        roughness: 0.22,
        metalness: 0,
        toneMapped: true,
      }),
    []
  );
  // Headlamps were `MeshBasicMaterial` cream boxes: permanently full-bright and
  // never switched by anything. A dark reflector lens with a driven emissive is
  // what reads as a lamp when it is off, which is most of the time.
  const headlightMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#2a2a26',
        emissive: '#ffe9b8',
        emissiveIntensity: 0.12,
        roughness: 0.09,
        metalness: 0,
        toneMapped: true,
      }),
    []
  );
  const amberMarkerMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#5d3f0b',
        emissive: '#ffa428',
        emissiveIntensity: 0.35,
        roughness: 0.22,
        metalness: 0,
        toneMapped: true,
      }),
    []
  );
  const redMarkerMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#3d1112',
        emissive: '#ff2a2a',
        emissiveIntensity: 0.35,
        roughness: 0.22,
        metalness: 0,
        toneMapped: true,
      }),
    []
  );
  const beamMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
        uniforms: {
          beamColor: { value: new THREE.Color('#ffe0a3') },
          beamOpacity: { value: 0.16 },
        },
        vertexShader: /* glsl */ `
          varying vec2 vUv;

          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 beamColor;
          uniform float beamOpacity;
          varying vec2 vUv;

          void main() {
            // PlaneGeometry's positive UV Y maps toward local negative Z after
            // the horizontal rotation. Flip it so zero is at the lamps and one
            // travels forward down the road.
            float distanceAlong = 1.0 - vUv.y;
            float halfWidth = mix(0.06, 0.48, distanceAlong);
            float lateralDistance = abs(vUv.x - 0.5);
            float lateralFade = 1.0 - smoothstep(halfWidth * 0.52, halfWidth, lateralDistance);
            float nearFade = smoothstep(0.0, 0.09, distanceAlong);
            float farFade = 1.0 - smoothstep(0.5, 1.0, distanceAlong);
            float centreSeparation = 0.82 + 0.18 * cos((vUv.x - 0.5) * 13.0);
            float alpha = lateralFade * nearFade * farFade * centreSeparation * beamOpacity;
            if (alpha < 0.002) discard;
            gl_FragColor = vec4(beamColor, alpha);
          }
        `,
      }),
    []
  );

  // PAINT. Dielectric base plus a clearcoat, which is what automotive paint
  // physically is. `metalness: 0.32` sat in the band where the BRDF has neither
  // a full diffuse albedo nor a real specular. No `map:`, so `color` is the
  // genuine albedo and stays.
  //
  // THE CAB WEARS TOO. The trailer and the chassis below have carried
  // `applyVehicleSurface` since it was written; the cab did not, and the audit
  // read the result exactly as it was - `MeshPhysicalMaterial #2e87ac` and
  // `#c65d35`, 19 m each over three meshes, two of the largest flat rows left in
  // `world-logistics`. A spotless cab towing a weathered trailer is the
  // inconsistency a viewer notices without being able to name it.
  //
  // Grime is scaled DOWN from the trailer's: a cab is washed and a trailer is
  // not, and the clearcoat is what the dirt actually kills first (the surface
  // module reaches `material.clearcoat` for that reason). `ribPitch` stays 0 -
  // a cab has no ribs, and a rib term on a smooth panel is a corrugation that
  // is not there.
  //
  // `grimeCeiling` IS THE WHOLE PARAMETER AND IT IS IN WORLD METRES. The first
  // build of this used 1.15, reasoning that a washed cab should carry less film
  // than a trailer at 1.75 - and 1.15 m is BELOW the cab. `millosFall` is
  // `1 - smoothstep( floor, ceiling, worldY )`, so above the ceiling the term is
  // exactly zero, and the treatment was inert on the only part it was applied
  // to: the audit reported the material shaded, the frame did not move, and the
  // cab crop's mean luminance went 81.69 -> 81.70. That is `machineSurfaces.ts`'s
  // saturated-smoothstep trap, arrived at from the other side.
  //
  // A tractor cab spans roughly y 1.0-3.2 m. 2.2 puts full film on the steps and
  // lower panels, fades it out across the door, and leaves the roof clean, which
  // is where road spray actually stops.
  const cabMaterial = useMemo(
    () =>
      applyVehicleSurface(
        new THREE.MeshPhysicalMaterial({
          color: colour,
          roughness: 0.34,
          metalness: 0,
          clearcoat: 1,
          clearcoatRoughness: 0.06,
        }),
        { grime: grime * 0.45, grimeCeiling: 2.2 }
      ),
    [colour, grime]
  );
  const accentMaterial = useMemo(() => {
    const accent = new THREE.Color(colour);
    accent.offsetHSL(0, 0.08, 0.12);
    // The old `emissive` was a fake fill for a scene with no environment. Paint
    // does not glow, and there is an IBL now.
    return applyVehicleSurface(
      new THREE.MeshPhysicalMaterial({
        color: accent,
        roughness: 0.3,
        metalness: 0,
        clearcoat: 1,
        clearcoatRoughness: 0.05,
      }),
      { grime: grime * 0.45, grimeCeiling: 2.2 }
    );
  }, [colour, grime]);

  // Per-truck clones so the two trucks can wear differently. Shared grime on a
  // module-level material gives both trucks pixel-identical wear, which reads
  // as a tiling artefact and kills the effect outright.
  const trailerMaterial = useMemo(
    () =>
      applyVehicleSurface(
        new THREE.MeshPhysicalMaterial({
          color: '#e8e7e1',
          roughness: 0.42,
          metalness: 0,
          clearcoat: 0.55,
          clearcoatRoughness: 0.16,
        }),
        { grime: grime * 0.72, grimeCeiling: 1.75, ribPitch: 0.62, ribDepth: 0.1 }
      ),
    [grime]
  );
  const frameMaterial = useMemo(
    () =>
      applyVehicleSurface(
        new THREE.MeshStandardMaterial({ color: '#8a959c', roughness: 0.45, metalness: 0.9 }),
        { grime, grimeCeiling: 1.5 }
      ),
    [grime]
  );

  useEffect(
    () => () => {
      brakeMaterial.dispose();
      reverseMaterial.dispose();
      leftSignalMaterial.dispose();
      rightSignalMaterial.dispose();
      headlightMaterial.dispose();
      amberMarkerMaterial.dispose();
      redMarkerMaterial.dispose();
      beamMaterial.dispose();
      cabMaterial.dispose();
      accentMaterial.dispose();
      trailerMaterial.dispose();
      frameMaterial.dispose();
    },
    [
      accentMaterial,
      amberMarkerMaterial,
      beamMaterial,
      brakeMaterial,
      cabMaterial,
      frameMaterial,
      headlightMaterial,
      leftSignalMaterial,
      redMarkerMaterial,
      reverseMaterial,
      rightSignalMaterial,
      trailerMaterial,
    ]
  );

  const wheelLayout = TRUCK_WHEEL_LAYOUT;

  // Every tyre is an open ring now, so every wheel carries its rim; an inner
  // dual's rim face is the bare steel a real inner dual shows.
  const hubLayout = wheelLayout;

  const updateWheelMatrices = (state: TruckAnimState, wheelRotation: number): void => {
    const wheels = wheelsRef.current;
    const hubs = hubsRef.current;
    if (!wheels || !hubs) return;
    const object = wheelDummyRef.current;
    const trailerCos = Math.cos(state.trailerAngle);
    const trailerSin = Math.sin(state.trailerAngle);
    wheelLayout.forEach(([baseX, y, baseZ, isTrailer, isSteer], index) => {
      const x = isTrailer ? baseX * trailerCos + baseZ * trailerSin : baseX;
      const z = isTrailer ? -baseX * trailerSin + baseZ * trailerCos : baseZ;
      const steer = isSteer ? state.steeringAngle : 0;
      object.position.set(x, y, z);
      // 'YXZ' spins the wheel about its own axle before yawing it; the default
      // 'XYZ' spun it about the parent X axis, so a steered or articulated wheel
      // wobbled once per revolution.
      object.rotation.set(
        wheelRotation,
        (isTrailer ? state.trailerAngle : 0) + steer,
        Math.PI / 2,
        'YXZ'
      );
      object.updateMatrix();
      wheels.setMatrixAt(index, object.matrix);
      hubs.setMatrixAt(index, object.matrix);
    });
    wheels.instanceMatrix.needsUpdate = true;
    hubs.instanceMatrix.needsUpdate = true;
  };

  const updateLandingGearMatrices = (amount: number): void => {
    const landingGear = landingGearRef.current;
    if (!landingGear) return;
    const object = landingGearDummyRef.current;
    const deployed = THREE.MathUtils.clamp(amount, 0, 1);
    const legLength = THREE.MathUtils.lerp(0.18, 0.5, deployed);
    const legCentreY = 0.62 - legLength / 2;
    const footY = THREE.MathUtils.lerp(0.46, 0.07, deployed);

    [-0.92, 0.92].forEach((x, side) => {
      object.position.set(x, legCentreY, -1.85);
      object.rotation.set(0, 0, 0);
      object.scale.set(0.12, legLength, 0.12);
      object.updateMatrix();
      landingGear.setMatrixAt(side, object.matrix);

      object.position.set(x, footY, -1.85);
      object.scale.set(0.44, 0.1, 0.38);
      object.updateMatrix();
      landingGear.setMatrixAt(side + 2, object.matrix);
    });
    landingGear.instanceMatrix.needsUpdate = true;
  };

  // Static batches are written once. They ride the same shared `UNIT_BOX` that
  // the rest of the truck uses, so none of this allocates geometry.
  //
  // The material identities ARE dependencies even though nothing here reads
  // them: they are part of each `instancedMesh`'s `args`, and R3F reconstructs
  // an object whose `args` change. A stale `[]` would leave the rebuilt meshes
  // with an all-zero instance matrix and the whole batch invisible.
  useLayoutEffect(() => {
    const scratch = detailDummyRef.current;
    applyDetailInstances(trailerSkinDetailRef.current, TRAILER_SKIN_DETAILS, scratch);
    applyDetailInstances(trailerFrameDetailRef.current, TRAILER_FRAME_DETAILS, scratch);
    applyDetailInstances(mudflapRef.current, TRAILER_MUDFLAPS, scratch);
    applyDetailInstances(cabDetailRef.current, CAB_DETAILS, scratch);
    applyDetailInstances(trailerEdgeRef.current, TRAILER_EDGE_TRIM, scratch);
    applyDetailInstances(lampBezelRef.current, TRAILER_LAMP_BEZELS, scratch);
    applyDetailInstances(mudflapHangerRef.current, TRAILER_MUDFLAP_HANGERS, scratch);
    const bevels = cabBevelRef.current;
    if (bevels) {
      TRUCK_CAB_BEVELS.forEach(({ position, scale, rotationX }, index) => {
        scratch.position.set(...position);
        scratch.rotation.set(rotationX, 0, 0);
        scratch.scale.set(...scale);
        scratch.updateMatrix();
        bevels.setMatrixAt(index, scratch.matrix);
      });
      scratch.rotation.set(0, 0, 0);
      bevels.instanceMatrix.needsUpdate = true;
      bevels.computeBoundingSphere();
    }
    applyDetailInstances(amberMarkerRef.current, AMBER_MARKERS, scratch);
    applyDetailInstances(redMarkerRef.current, RED_MARKERS, scratch);
    applyDetailInstances(
      tapeRef.current,
      CONSPICUITY_TAPE.map((strip) => strip.instance),
      scratch
    );
    const tape = tapeRef.current;
    if (tape) {
      CONSPICUITY_TAPE.forEach((strip, index) => {
        tape.setColorAt(index, strip.red ? TAPE_RED : TAPE_WHITE);
      });
      if (tape.instanceColor) tape.instanceColor.needsUpdate = true;
    }
    scratch.scale.set(1, 1, 1);
  }, [amberMarkerMaterial, cabMaterial, frameMaterial, redMarkerMaterial, trailerMaterial]);

  useLayoutEffect(() => {
    wheelsRef.current?.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    hubsRef.current?.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    landingGearRef.current?.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    updateWheelMatrices(stateRef.current, wheelRotationRef.current);
    updateLandingGearMatrices(stateRef.current.landingGearAmount);
    wheelsRef.current?.computeBoundingSphere();
    hubsRef.current?.computeBoundingSphere();
    landingGearRef.current?.computeBoundingSphere();
  });

  useFrame(({ camera }) => {
    const state = stateRef.current;

    // `state.x` / `state.z` ARE this vehicle's world position: the parent group
    // in `TruckBay` is written straight from them every frame and carries no
    // other offset. Reading them avoids both a stale `matrixWorld` and a
    // `getWorldPosition` allocation inside the frame loop.
    const cameraDx = camera.position.x - state.x;
    const cameraDz = camera.position.z - state.z;
    const cameraDistanceSquared =
      cameraDx * cameraDx + camera.position.y * camera.position.y + cameraDz * cameraDz;
    // Hysteresis band, so a camera parked on the threshold cannot flicker the
    // detail set on and off.
    const detailThreshold = nearDetailVisibleRef.current
      ? CAB_DETAIL_HIDDEN_DISTANCE
      : CAB_DETAIL_VISIBLE_DISTANCE;
    const detailVisible = cameraDistanceSquared <= detailThreshold * detailThreshold;
    if (detailVisible !== nearDetailVisibleRef.current) {
      nearDetailVisibleRef.current = detailVisible;
      for (const group of nearDetailGroupsRef.current) group.visible = detailVisible;
    }

    if (cabRef.current) {
      cabRef.current.rotation.x = state.cabPitch;
      cabRef.current.rotation.z = state.cabRoll;
      // Move the rotation pivot off the cab origin (y = 0, on the road) and up
      // onto the springs: roll about a centre ~0.9 m up, pitch about the drive
      // axle at z = 0.4. Rotating about the origin tips the whole tractor like
      // a rigid model on a stick; rotating about the roll centre is what makes
      // the same angle read as suspension. The wheels are a sibling
      // `InstancedMesh`, not children of this group, so they correctly stay put
      // while the body moves against them.
      const rollSin = Math.sin(state.cabRoll);
      const pitchSin = Math.sin(state.cabPitch);
      cabRef.current.position.x = rollSin * CAB_ROLL_CENTRE_Y;
      cabRef.current.position.y =
        pitchSin * CAB_PITCH_CENTRE_Z + (1 - Math.cos(state.cabRoll)) * CAB_ROLL_CENTRE_Y;
      cabRef.current.position.z = (1 - Math.cos(state.cabPitch)) * CAB_PITCH_CENTRE_Z;
    }
    if (trailerRef.current) {
      trailerRef.current.rotation.y = state.trailerAngle;
      trailerRef.current.position.y = -resolveTrailerLoadSettle(loadRatio);
      trailerRef.current.userData.loadRatio = THREE.MathUtils.clamp(loadRatio, 0, 1);
    }

    // Running lights are switched at the day/night boundary, never lerped. A
    // per-frame intensity ramp on an emissive is the closest thing this scene
    // has to the animated-light behaviour that CLAUDE.md blames for the
    // historic post-processing flicker.
    const hour = useGameSimulationStore.getState().gameTime;
    const lightsOn = hour < LIGHTS_ON_BEFORE_HOUR || hour >= LIGHTS_ON_AFTER_HOUR;
    if (lightsOn !== lightsOnRef.current) {
      lightsOnRef.current = lightsOn;
      headlightMaterial.emissiveIntensity = lightsOn ? 5.5 : 0.12;
      amberMarkerMaterial.emissiveIntensity = lightsOn ? 2.6 : 0.35;
      redMarkerMaterial.emissiveIntensity = lightsOn ? 2.6 : 0.35;
    }
    // Assigned every frame, not inside the transition: `visible` is also a JSX
    // prop, so any re-render of this component would otherwise re-hide the beam
    // until the next day/night boundary - potentially a whole game day away.
    if (beamRef.current) beamRef.current.visible = lightsOn;

    const lamps = truckRearLampIntensities(state, lightsOn);
    brakeMaterial.emissiveIntensity = lamps.brake;
    reverseMaterial.emissiveIntensity = lamps.reverse;
    leftSignalMaterial.emissiveIntensity = lamps.leftSignal;
    rightSignalMaterial.emissiveIntensity = lamps.rightSignal;

    const doorAngle = state.doorOpenAmount * 1.32;
    if (leftDoorRef.current) leftDoorRef.current.rotation.y = doorAngle;
    if (rightDoorRef.current) rightDoorRef.current.rotation.y = -doorAngle;

    updateWheelMatrices(state, wheelRotationRef.current);
    updateLandingGearMatrices(state.landingGearAmount);
  });

  return (
    <group dispose={null}>
      <group ref={cabRef}>
        <GeneratedSurfaceMesh
          asset="truckCabUnit"
          geometry={ROUNDED_BOX}
          material={cabMaterial}
          position={[...TRUCK_CAB_SHELL.position]}
          scale={[...TRUCK_CAB_SHELL.scale]}
          castShadow
          receiveShadow
        />
        <mesh
          geometry={ROUNDED_BOX}
          material={accentMaterial}
          position={[0, 3.74, 3.08]}
          scale={[2.7, 0.32, 3.15]}
          castShadow
          receiveShadow
        />
        <mesh
          geometry={UNIT_BOX}
          material={cabMaterial}
          position={[0, 2.78, 1.48]}
          scale={[2.55, 1.62, 0.18]}
          castShadow
          receiveShadow
        />
        {/* 0.18 m window pillars. They sit inside the greenhouse the roof
            fairing already shadows, so they neither read nor cast at range. */}
        <group ref={registerNearDetail}>
          {[-1.18, 1.18].map((x) => (
            <mesh
              key={`front-pillar-${x}`}
              geometry={UNIT_BOX}
              material={cabMaterial}
              position={[x, 2.72, 4.83]}
              scale={[0.18, 1.5, 0.18]}
              receiveShadow
            />
          ))}
          {[-1.18, 1.18].map((x) => (
            <mesh
              key={`rear-pillar-${x}`}
              geometry={UNIT_BOX}
              material={cabMaterial}
              position={[x, 2.72, 1.58]}
              scale={[0.18, 1.5, 0.18]}
              receiveShadow
            />
          ))}
        </group>
        {/* Glazing draws after the opaque cab so the interior behind it cannot
            swap in front as the cab rolls. `depthWrite` stays off. */}
        <mesh
          geometry={UNIT_BOX}
          material={MATERIALS.glass}
          position={[0, 2.55, 4.91]}
          scale={[2.18, 1.25, 0.06]}
          renderOrder={VEHICLE_GLASS_RENDER_ORDER}
        />
        <mesh
          geometry={UNIT_BOX}
          material={MATERIALS.glass}
          position={[-1.29, 2.55, 3.3]}
          scale={[0.06, 1.2, 2.2]}
          renderOrder={VEHICLE_GLASS_RENDER_ORDER}
        />
        <mesh
          geometry={UNIT_BOX}
          material={MATERIALS.glass}
          position={[1.29, 2.55, 3.3]}
          scale={[0.06, 1.2, 2.2]}
          renderOrder={VEHICLE_GLASS_RENDER_ORDER}
        />
        {/* Windscreen centre bar and the whole cab interior. The interior sits
            behind 0.55-opacity glazing that is NOT gated, so at range the cab
            reads exactly as it did: a dark greenhouse. */}
        <group ref={registerNearDetail}>
          <mesh
            geometry={UNIT_BOX}
            material={MATERIALS.chrome}
            position={[0, 2.55, 4.96]}
            scale={[0.09, 1.28, 0.08]}
            receiveShadow
          />
          <mesh
            geometry={UNIT_BOX}
            material={MATERIALS.interior}
            position={[0, 2.05, 4.12]}
            rotation={[-0.14, 0, 0]}
            scale={[2.05, 0.24, 0.72]}
            receiveShadow
          />
          <mesh
            geometry={STEERING_WHEEL}
            material={MATERIALS.interior}
            position={[-0.48, 2.28, 4.18]}
            rotation={[-0.34, 0, 0]}
          />
          <mesh
            geometry={ROUNDED_BOX}
            material={MATERIALS.interior}
            position={[-0.48, 1.48, 3.25]}
            scale={[0.78, 0.24, 0.76]}
            receiveShadow
          />
        </group>
        <mesh
          geometry={UNIT_BOX}
          material={MATERIALS.grille}
          position={[0, 1.2, 4.94]}
          scale={[1.7, 0.62, 0.08]}
          castShadow
          receiveShadow
        />
        {/* Grille bars and surround, standing 3-5 cm proud of the dark grille
            plate, so the front reads as a grille rather than a painted panel. */}
        {TRUCK_GRILLE_BARS.map((y) => (
          <mesh
            key={`grille-bar-${y}`}
            geometry={UNIT_BOX}
            material={MATERIALS.chrome}
            position={[0, y, 5.0]}
            scale={[1.62, 0.045, 0.05]}
            receiveShadow
          />
        ))}
        {[-0.875, 0.875].map((x) => (
          <mesh
            key={`grille-post-${x}`}
            geometry={UNIT_BOX}
            material={cabMaterial}
            position={[x, 1.2, 4.99]}
            scale={[0.07, 0.7, 0.06]}
            receiveShadow
          />
        ))}
        {/* Corner deflectors: the cab's front corners chamfered back to its
            sides, as a cab-over's wind deflectors are. Without them the cab was
            a box with a flat front (shipping review). */}
        {TRUCK_CORNER_DEFLECTORS.map(({ x, z, yaw }) => (
          <mesh
            key={`deflector-${x}`}
            geometry={ROUNDED_BOX}
            material={cabMaterial}
            position={[x, 1.27, z]}
            rotation={[0, yaw, 0]}
            scale={[0.1, 1.45, 0.62]}
            castShadow
            receiveShadow
          />
        ))}
        <mesh
          geometry={ROUNDED_BOX}
          material={MATERIALS.chrome}
          position={[0, 0.68, 4.78]}
          scale={[2.7, 0.28, 0.38]}
          castShadow
          receiveShadow
        />
        <mesh
          geometry={UNIT_BOX}
          material={headlightMaterial}
          position={[-0.74, 0.96, 4.99]}
          scale={[0.48, 0.28, 0.06]}
          receiveShadow
        />
        <mesh
          geometry={UNIT_BOX}
          material={headlightMaterial}
          position={[0.74, 0.96, 4.99]}
          scale={[0.48, 0.28, 0.06]}
          receiveShadow
        />
        {/* Ground spill, not light volumes. Deliberately NOT a `spotLight`: this
            component mounts lazily, mid-session, and taking NUM_SPOT_LIGHTS
            from 0 to 2 changes the program cache key of every material in the
            scene, so the whole scene would recompile at that moment. The
            feathered projection reads as illuminated tarmac without putting a
            visible solid into the air. */}
        <group ref={beamRef} visible={false}>
          <mesh
            geometry={HEADLIGHT_POOL}
            material={beamMaterial}
            position={[0, 0.045, 9.15]}
            rotation={[-Math.PI / 2, 0, 0]}
            renderOrder={8}
          />
        </group>
        {/* Mirror glass, 0.06 m thick. The mirror ARMS live in `CAB_DETAILS`
            and are not gated, so the mirror silhouette survives. */}
        <group ref={registerNearDetail}>
          <mesh
            geometry={UNIT_BOX}
            material={MATERIALS.chrome}
            position={[-1.55, 2.62, 4.05]}
            scale={[0.06, 0.68, 0.26]}
            receiveShadow
          />
          <mesh
            geometry={UNIT_BOX}
            material={MATERIALS.chrome}
            position={[1.55, 2.62, 4.05]}
            scale={[0.06, 0.68, 0.26]}
            receiveShadow
          />
        </group>
        {/* Fenders, mirror arms, steps, sun visor, roof extenders - one call. */}
        <instancedMesh
          ref={cabDetailRef}
          name="tractor-detail"
          args={[UNIT_BOX, frameMaterial, CAB_DETAILS.length]}
          castShadow
          receiveShadow
        />
        {/* Hood lip, grille sill and fairing nose, in the cab paint. */}
        <instancedMesh
          ref={cabBevelRef}
          name="tractor-bevels"
          args={[ROUNDED_BOX, cabMaterial, TRUCK_CAB_BEVELS.length]}
          castShadow
          receiveShadow
        />
        {/* Two chassis rails with a crossmember, not a 2.35 m slab: the gap
            between the cab back and the trailer nose shows a frame. */}
        {[-0.45, 0.45].map((x) => (
          <mesh
            key={`rail-${x}`}
            geometry={UNIT_BOX}
            material={frameMaterial}
            position={[x, 0.82, 2.05]}
            scale={[0.2, 0.3, 4.3]}
            castShadow
            receiveShadow
          />
        ))}
        <mesh
          geometry={UNIT_BOX}
          material={frameMaterial}
          position={[0, 0.82, 0.05]}
          scale={[1.1, 0.22, 0.16]}
          receiveShadow
        />
        {/* Fuel tank straps, from the rails out to the tanks. */}
        {[-1, 1].flatMap((side) =>
          [1.05, 2.15].map((z) => (
            <mesh
              key={`strap-${side}-${z}`}
              geometry={UNIT_BOX}
              material={frameMaterial}
              position={[side * 0.92, 0.72, z]}
              scale={[0.8, 0.05, 0.08]}
              receiveShadow
            />
          ))
        )}
        {/* Fuel tanks run FORE-AFT along the frame rails. The old
            `rotation={[0, 0, Math.PI / 2]}` laid the 1.65 m cylinder across the
            truck, so each tank stuck a metre out past the cab skin. */}
        {/* Frame-rail fuel tanks. They tuck under the cab, between the wheels,
            in the shadow the cab shell already casts. */}
        <group ref={registerNearDetail}>
          {[-1.3, 1.3].map((x) => (
            <mesh
              key={`fuel-tank-${x}`}
              geometry={FUEL_TANK}
              material={MATERIALS.chrome}
              position={[x, 0.8, 1.6]}
              rotation={[Math.PI / 2, 0, 0]}
              castShadow
              receiveShadow
            />
          ))}
        </group>
        {/* Stacks stay VISIBLE at every range - two 2.3 m verticals either side
            of the cab are part of the vehicle's read - but 0.22 m of diameter is
            one texel of a 1024 map fitted to a 180+ m box, so they do not cast. */}
        {[-1.03, 1.03].map((x) => (
          <mesh
            key={`exhaust-${x}`}
            geometry={EXHAUST_STACK}
            material={MATERIALS.chrome}
            position={[x, 2.25, 1.3]}
            receiveShadow
          />
        ))}
      </group>

      <group ref={trailerRef} position={[0, 0, 0]}>
        <GeneratedSurfaceMesh
          asset="truckTrailerUnit"
          geometry={ROUNDED_BOX}
          material={trailerMaterial}
          position={[0, 2.45, -5.75]}
          scale={[2.55, 4.25, 11.2]}
          castShadow
          receiveShadow
        />
        {/* Accent bands lie 0.06 m proud of a trailer skin that already casts;
            their own shadow is entirely inside the trailer's. */}
        <mesh
          geometry={UNIT_BOX}
          material={accentMaterial}
          position={[-1.3, 2.45, -5.35]}
          scale={[0.06, 0.56, 9.6]}
          receiveShadow
        />
        <mesh
          geometry={UNIT_BOX}
          material={accentMaterial}
          position={[1.3, 2.45, -5.35]}
          scale={[0.06, 0.56, 9.6]}
          receiveShadow
        />
        <mesh
          geometry={UNIT_BOX}
          material={frameMaterial}
          position={[0, TRAILER_BED_Y - 0.09, -5.75]}
          scale={[2.68, 0.18, 11.4]}
          castShadow
          receiveShadow
        />
        {/* 0.12 m legs and their pads, under a trailer nose that already casts. */}
        <group ref={registerNearDetail}>
          <instancedMesh
            ref={landingGearRef}
            name="trailer-landing-gear"
            args={[UNIT_BOX, frameMaterial, 4]}
            receiveShadow
          />
        </group>
        {/* Skirts and wheel arches, in the body colour. */}
        <instancedMesh
          ref={trailerSkinDetailRef}
          name="trailer-skin-detail"
          args={[UNIT_BOX, trailerMaterial, TRAILER_SKIN_DETAILS.length]}
          castShadow
          receiveShadow
        />
        {/* Slide rails and the ICC rear underride guard. */}
        <instancedMesh
          ref={trailerFrameDetailRef}
          name="trailer-frame-detail"
          args={[UNIT_BOX, frameMaterial, TRAILER_FRAME_DETAILS.length]}
          castShadow
          receiveShadow
        />
        {/* 0.03 m flaps trailing 0.4 m tyres that already cast. */}
        <group ref={registerNearDetail}>
          {/* Rounded, so their edges catch the light a black box never did. */}
          <instancedMesh
            ref={mudflapRef}
            name="trailer-mudflaps"
            args={[ROUNDED_BOX, MATERIALS.rubber, TRAILER_MUDFLAPS.length]}
            receiveShadow
          />
          <instancedMesh
            ref={mudflapHangerRef}
            name="trailer-mudflap-hangers"
            args={[UNIT_BOX, MATERIALS.chrome, TRAILER_MUDFLAP_HANGERS.length]}
            receiveShadow
          />
        </group>
        {/* Aluminium corner posts and roof rails: the box's edges, framed. */}
        <instancedMesh
          ref={trailerEdgeRef}
          name="trailer-edge-trim"
          args={[UNIT_BOX, MATERIALS.trailerTrim, TRAILER_EDGE_TRIM.length]}
          castShadow
          receiveShadow
        />
        {/* Rear lamp housings: each lens sits 4 cm inside its own walls. */}
        <instancedMesh
          ref={lampBezelRef}
          name="trailer-lamp-housings"
          args={[UNIT_BOX, frameMaterial, TRAILER_LAMP_BEZELS.length]}
          receiveShadow
        />
        <instancedMesh
          ref={tapeRef}
          name="trailer-conspicuity-tape"
          args={[UNIT_BOX, MATERIALS.conspicuityTape, CONSPICUITY_TAPE.length]}
          receiveShadow
        />
        <instancedMesh
          ref={amberMarkerRef}
          name="trailer-amber-markers"
          args={[UNIT_BOX, amberMarkerMaterial, AMBER_MARKERS.length]}
        />
        <instancedMesh
          ref={redMarkerRef}
          name="trailer-red-markers"
          args={[UNIT_BOX, redMarkerMaterial, RED_MARKERS.length]}
        />
        {/* Roof cap: 0.12 m proud of the trailer roof, fully inside the box's
            own shadow at any sun angle that lights the roof at all. */}
        <mesh
          geometry={UNIT_BOX}
          material={frameMaterial}
          position={[0, 4.62, -5.75]}
          scale={[2.62, 0.12, 11.3]}
          receiveShadow
        />
        <group ref={leftDoorRef} position={[-1.28, 2.45, TRAILER_REAR_DOOR.z]}>
          <mesh
            geometry={UNIT_BOX}
            material={trailerMaterial}
            position={[0.64, 0, 0]}
            scale={[1.24, 3.78, TRAILER_REAR_DOOR.depth]}
            castShadow
            receiveShadow
          />
        </group>
        <group ref={rightDoorRef} position={[1.28, 2.45, TRAILER_REAR_DOOR.z]}>
          <mesh
            geometry={UNIT_BOX}
            material={trailerMaterial}
            position={[-0.64, 0, 0]}
            scale={[1.24, 3.78, TRAILER_REAR_DOOR.depth]}
            castShadow
            receiveShadow
          />
        </group>
        {/* REAR LAMP CLUSTER - inside `trailerRef`, not beside it.
            These meshes used to sit at the root, so they did not take
            `trailerAngle`. The trailer yaws up to 0.176 rad and the cluster is
            11.4 m behind the pivot, which threw the lamps up to 2 m clear of
            the trailer every time the combination turned in. */}
        {TRAILER_REAR_LAMPS.map(({ lamp, position, scale }, index) => (
          <mesh
            key={index}
            geometry={UNIT_BOX}
            material={
              lamp === 'brake'
                ? brakeMaterial
                : lamp === 'reverse'
                  ? reverseMaterial
                  : lamp === 'left-signal'
                    ? leftSignalMaterial
                    : rightSignalMaterial
            }
            position={position}
            scale={scale}
            receiveShadow
          />
        ))}
        <TruckIdentityDecals company={company} plateNumber={plateNumber} colour={colour} />
      </group>

      <instancedMesh
        ref={wheelsRef}
        args={[WHEEL, MATERIALS.tyre, wheelLayout.length]}
        castShadow
        receiveShadow
      />
      {/* Rims sit inside tyres that already cast: their shadow is a strict
          subset of the wheel's, so they do not cast. */}
      <instancedMesh ref={hubsRef} args={[HUB, MATERIALS.hub, hubLayout.length]} receiveShadow />
    </group>
  );
}

// ---------------------------------------------------------------------------
// PARKED TRAILERS
//
// The trailer drop yard held three bare 3 x 4 x 12 m boxes on a dark pad, each
// with two posts and four black discs: the overview frame read the nearest one
// as an untextured placeholder. A dropped trailer is the trailer the trucks
// tow, standing on its landing gear with its tractor gone, so this draws the
// same trailer - skin, ribs and grime, skirts and arches, under-frame, rear
// doors and lamps, conspicuity tape, tandem wheels - with nothing animated.
// Every repeated part across every parked trailer is one instanced draw.
// ---------------------------------------------------------------------------

export interface ParkedTrailerPlacement {
  /** Coupling point (the trailer-local origin), world metres. */
  readonly position: readonly [number, number, number];
  /** Yaw; the nose faces local +z. */
  readonly rotation: number;
  /** Accent stripe colour (display sRGB). */
  readonly accent: string;
}

/** Trailer-local parts, each a scaled unit box. */
interface TrailerPart {
  readonly position: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
}

/** Landing gear standing on its sand shoes, cranked fully down. */
const PARKED_LANDING_GEAR: readonly TrailerPart[] = [-0.92, 0.92].flatMap((x) => [
  { position: [x, 0.37, -1.85] as const, scale: [0.12, 0.5, 0.12] as const },
  { position: [x, 0.07, -1.85] as const, scale: [0.44, 0.1, 0.38] as const },
]);
const PARKED_FRAME_PARTS: readonly TrailerPart[] = [
  ...TRAILER_FRAME_DETAILS,
  ...PARKED_LANDING_GEAR,
  // Gear crank on the kerb side and the cross-shaft between the legs.
  { position: [1.1, 0.62, -1.85], scale: [0.3, 0.04, 0.04] },
  { position: [0, 0.62, -1.85], scale: [1.84, 0.06, 0.06] },
  // Under-frame and roof cap, as on the towed trailer.
  { position: [0, TRAILER_BED_Y - 0.09, -5.75], scale: [2.68, 0.18, 11.4] },
  { position: [0, 4.62, -5.75], scale: [2.62, 0.12, 11.3] },
];
const PARKED_ACCENTS: readonly TrailerPart[] = [-1.3, 1.3].map((x) => ({
  position: [x, 2.45, -5.35] as const,
  scale: [0.06, 0.56, 9.6] as const,
}));
const PARKED_DOORS: readonly TrailerPart[] = [-0.64, 0.64].map((x) => ({
  position: [x, 2.45, TRAILER_REAR_DOOR.z] as const,
  scale: [1.24, 3.78, TRAILER_REAR_DOOR.depth] as const,
}));
/** Only the trailer's own flaps: the pair at z -0.42 trail the tractor's drive axle. */
const PARKED_MUDFLAPS = TRAILER_MUDFLAPS.filter(({ position }) => position[2] < -1);
const PARKED_WHEELS = TRUCK_WHEEL_LAYOUT.filter(([, , , isTrailer]) => isTrailer);

const PARKED_SKIN = applyVehicleSurface(
  new THREE.MeshPhysicalMaterial({
    color: '#e3e2dc',
    roughness: 0.46,
    metalness: 0,
    clearcoat: 0.4,
    clearcoatRoughness: 0.22,
  }),
  { grime: 0.85, grimeCeiling: 1.75, ribPitch: 0.62, ribDepth: 0.1 }
);
const PARKED_FRAME = applyVehicleSurface(
  new THREE.MeshStandardMaterial({ color: '#8a959c', roughness: 0.5, metalness: 0.85 }),
  { grime: 1, grimeCeiling: 1.5 }
);
const PARKED_ACCENT = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 });
/** Unlit lamps on a parked trailer: coloured lenses, no emission. */
const PARKED_RED_LENS = new THREE.MeshStandardMaterial({ color: '#5a1416', roughness: 0.25 });
const PARKED_AMBER_LENS = new THREE.MeshStandardMaterial({ color: '#7a5214', roughness: 0.25 });

function writeParkedInstances(
  mesh: THREE.InstancedMesh | null,
  placements: readonly ParkedTrailerPlacement[],
  parts: readonly TrailerPart[],
  colour?: (placement: ParkedTrailerPlacement, part: number) => THREE.Color
): void {
  if (!mesh) return;
  const placement = new THREE.Matrix4();
  const part = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  let index = 0;
  for (const trailer of placements) {
    placement.compose(
      position.set(...trailer.position),
      quaternion.setFromAxisAngle(up, trailer.rotation),
      scale.set(1, 1, 1)
    );
    parts.forEach((item, partIndex) => {
      part.compose(position.set(...item.position), quaternion.identity(), scale.set(...item.scale));
      mesh.setMatrixAt(index, part.premultiply(placement));
      if (colour) mesh.setColorAt(index, colour(trailer, partIndex));
      index += 1;
    });
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
}

function writeParkedWheels(
  mesh: THREE.InstancedMesh | null,
  placements: readonly ParkedTrailerPlacement[]
): void {
  if (!mesh) return;
  const placement = new THREE.Matrix4();
  const object = new THREE.Object3D();
  let index = 0;
  for (const trailer of placements) {
    placement.makeRotationY(trailer.rotation).setPosition(...trailer.position);
    for (const [x, y, z] of PARKED_WHEELS) {
      object.position.set(x, y, z);
      object.rotation.set(0, 0, Math.PI / 2, 'YXZ');
      object.scale.set(1, 1, 1);
      object.updateMatrix();
      mesh.setMatrixAt(index, object.matrix.clone().premultiply(placement));
      index += 1;
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
}

/** Dropped trailers standing on their landing gear, all parts instanced. */
export function ParkedTrailers({
  placements,
}: {
  readonly placements: readonly ParkedTrailerPlacement[];
}) {
  const skin = useRef<THREE.InstancedMesh>(null);
  const frame = useRef<THREE.InstancedMesh>(null);
  const accents = useRef<THREE.InstancedMesh>(null);
  const doors = useRef<THREE.InstancedMesh>(null);
  const flaps = useRef<THREE.InstancedMesh>(null);
  const tape = useRef<THREE.InstancedMesh>(null);
  const red = useRef<THREE.InstancedMesh>(null);
  const amber = useRef<THREE.InstancedMesh>(null);
  const lamps = useRef<THREE.InstancedMesh>(null);
  const wheels = useRef<THREE.InstancedMesh>(null);
  const rims = useRef<THREE.InstancedMesh>(null);
  const n = placements.length;
  useLayoutEffect(() => {
    writeParkedInstances(skin.current, placements, TRAILER_SKIN_DETAILS);
    writeParkedInstances(frame.current, placements, PARKED_FRAME_PARTS);
    writeParkedInstances(
      accents.current,
      placements,
      PARKED_ACCENTS,
      (trailer) => new THREE.Color(trailer.accent)
    );
    writeParkedInstances(doors.current, placements, PARKED_DOORS);
    writeParkedInstances(flaps.current, placements, PARKED_MUDFLAPS);
    writeParkedInstances(
      tape.current,
      placements,
      CONSPICUITY_TAPE.map((strip) => strip.instance),
      (_trailer, index) => (CONSPICUITY_TAPE[index].red ? TAPE_RED : TAPE_WHITE)
    );
    writeParkedInstances(red.current, placements, RED_MARKERS);
    writeParkedInstances(amber.current, placements, AMBER_MARKERS);
    writeParkedInstances(lamps.current, placements, TRAILER_REAR_LAMPS);
    writeParkedWheels(wheels.current, placements);
    writeParkedWheels(rims.current, placements);
  }, [placements]);
  return (
    <group name="parked-trailers">
      {placements.map((trailer, index) => (
        <group key={index} position={[...trailer.position]} rotation={[0, trailer.rotation, 0]}>
          <GeneratedSurfaceMesh
            asset="truckTrailerUnit"
            geometry={ROUNDED_BOX}
            material={PARKED_SKIN}
            position={[0, 2.45, -5.75]}
            scale={[2.55, 4.25, 11.2]}
            castShadow
            receiveShadow
          />
        </group>
      ))}
      <instancedMesh
        ref={skin}
        args={[UNIT_BOX, PARKED_SKIN, n * TRAILER_SKIN_DETAILS.length]}
        castShadow
        receiveShadow
      />
      <instancedMesh
        ref={frame}
        args={[UNIT_BOX, PARKED_FRAME, n * PARKED_FRAME_PARTS.length]}
        castShadow
        receiveShadow
      />
      <instancedMesh
        ref={accents}
        args={[UNIT_BOX, PARKED_ACCENT, n * PARKED_ACCENTS.length]}
        receiveShadow
      />
      <instancedMesh
        ref={doors}
        args={[UNIT_BOX, PARKED_SKIN, n * PARKED_DOORS.length]}
        castShadow
        receiveShadow
      />
      <instancedMesh ref={flaps} args={[UNIT_BOX, MATERIALS.rubber, n * PARKED_MUDFLAPS.length]} />
      <instancedMesh
        ref={tape}
        args={[UNIT_BOX, MATERIALS.conspicuityTape, n * CONSPICUITY_TAPE.length]}
        receiveShadow
      />
      <instancedMesh ref={red} args={[UNIT_BOX, PARKED_RED_LENS, n * RED_MARKERS.length]} />
      <instancedMesh ref={amber} args={[UNIT_BOX, PARKED_AMBER_LENS, n * AMBER_MARKERS.length]} />
      <instancedMesh
        ref={lamps}
        args={[UNIT_BOX, PARKED_RED_LENS, n * TRAILER_REAR_LAMPS.length]}
      />
      <instancedMesh
        ref={wheels}
        args={[WHEEL, MATERIALS.tyre, n * PARKED_WHEELS.length]}
        castShadow
        receiveShadow
      />
      <instancedMesh
        ref={rims}
        args={[HUB, MATERIALS.hub, n * PARKED_WHEELS.length]}
        receiveShadow
      />
    </group>
  );
}

interface DockMarkingInstance {
  readonly position: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
  readonly rotationY?: number;
}

function DockMarkings() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const instances = useMemo<readonly DockMarkingInstance[]>(() => {
    const markings: DockMarkingInstance[] = [
      {
        position: [-2.2, FLOOR_LAYERS.truckMarkings, 10],
        scale: [0.22, 0.02, 20],
      },
      {
        position: [2.2, FLOOR_LAYERS.truckMarkings, 10],
        scale: [0.22, 0.02, 20],
      },
      {
        position: [-5.4, FLOOR_LAYERS.truckMarkings, 12],
        scale: [0.12, 0.02, 22],
      },
      {
        position: [5.4, FLOOR_LAYERS.truckMarkings, 12],
        scale: [0.12, 0.02, 22],
      },
      {
        position: [0, FLOOR_LAYERS.truckMarkings, 22.5],
        scale: [10.8, 0.02, 0.28],
      },
    ];
    for (let index = 0; index < 6; index += 1) {
      const z = 7 + index * 2.4;
      markings.push({
        position: [-4.05, FLOOR_LAYERS.truckMarkings, z],
        scale: [2.4, 0.02, 0.16],
        rotationY: -0.62,
      });
      markings.push({
        position: [4.05, FLOOR_LAYERS.truckMarkings, z],
        scale: [2.4, 0.02, 0.16],
        rotationY: 0.62,
      });
    }
    return markings;
  }, []);

  useLayoutEffect(() => {
    if (!ref.current) return;
    const object = new THREE.Object3D();
    instances.forEach((instance, index) => {
      object.position.set(...instance.position);
      object.scale.set(...instance.scale);
      object.rotation.set(0, instance.rotationY ?? 0, 0);
      object.updateMatrix();
      ref.current?.setMatrixAt(index, object.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [instances]);

  return <instancedMesh ref={ref} args={[UNIT_BOX, MATERIALS.safety, instances.length]} />;
}

function DockLabel({ receiving }: { readonly receiving: boolean }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const context = canvas.getContext('2d');
    if (context) {
      context.fillStyle = '#15272d';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = receiving ? '#65b7dc' : '#e16a4b';
      context.fillRect(0, 0, 28, canvas.height);
      context.fillStyle = '#eef5f3';
      context.font = '700 82px Inter, Arial, sans-serif';
      context.fillText(receiving ? 'RECEIVING 01' : 'SHIPPING 01', 72, 112);
      context.fillStyle = '#9ec2c1';
      context.font = '500 30px Inter, Arial, sans-serif';
      context.fillText(receiving ? 'RAW GRAIN INTAKE' : 'FINISHED GOODS DISPATCH', 76, 178);
    }
    const canvasTexture = new THREE.CanvasTexture(canvas);
    canvasTexture.colorSpace = THREE.SRGBColorSpace;
    return canvasTexture;
  }, [receiving]);
  const material = useMemo(
    () => new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }),
    [texture]
  );

  useEffect(
    () => () => {
      material.dispose();
      texture.dispose();
    },
    [material, texture]
  );

  return (
    <mesh
      geometry={UNIT_BOX}
      material={material}
      position={[0, 9.1, 0.42]}
      scale={[9.4, 2.35, 0.08]}
    />
  );
}

function DockInfrastructure({
  z,
  receiving,
}: {
  readonly z: number;
  readonly receiving?: boolean;
}) {
  const rotation = receiving ? Math.PI : 0;
  return (
    <group position={[0, 0, z]} rotation={[0, rotation, 0]} dispose={null}>
      <mesh
        geometry={ROUNDED_BOX}
        material={MATERIALS.dock}
        position={[-3.85, 1, 3.15]}
        scale={[3.25, 2, 6.3]}
        castShadow
        receiveShadow
      />
      <mesh
        geometry={ROUNDED_BOX}
        material={MATERIALS.dock}
        position={[3.85, 1, 3.15]}
        scale={[3.25, 2, 6.3]}
        castShadow
        receiveShadow
      />
      <mesh
        geometry={UNIT_BOX}
        material={MATERIALS.dockDark}
        position={[0, 0.16, 3.4]}
        scale={[3.9, 0.28, 6.5]}
        receiveShadow
      />
      <mesh
        geometry={UNIT_BOX}
        material={MATERIALS.door}
        position={[0, 4.75, 0.26]}
        scale={[7.2, 8.7, 0.28]}
        castShadow
      />
      <mesh
        geometry={UNIT_BOX}
        material={MATERIALS.trailerTrim}
        position={[-4.05, 4.8, 0.42]}
        scale={[0.42, 9.3, 0.35]}
      />
      <mesh
        geometry={UNIT_BOX}
        material={MATERIALS.trailerTrim}
        position={[4.05, 4.8, 0.42]}
        scale={[0.42, 9.3, 0.35]}
      />
      <mesh
        geometry={UNIT_BOX}
        material={MATERIALS.trailerTrim}
        position={[0, 8.95, 0.42]}
        scale={[8.5, 0.42, 0.35]}
      />
      <mesh
        geometry={ROUNDED_BOX}
        material={MATERIALS.canopy}
        position={[0, 7.65, 5.1]}
        scale={[12.2, 0.38, 9.8]}
        castShadow
      />
      <mesh
        geometry={UNIT_BOX}
        material={MATERIALS.canopy}
        position={[-5.65, 3.8, 8.9]}
        scale={[0.34, 7.6, 0.34]}
        castShadow
      />
      <mesh
        geometry={UNIT_BOX}
        material={MATERIALS.canopy}
        position={[5.65, 3.8, 8.9]}
        scale={[0.34, 7.6, 0.34]}
        castShadow
      />
      <mesh
        geometry={ROUNDED_BOX}
        material={MATERIALS.dockDark}
        position={[-1.35, 1.2, 0.72]}
        scale={[0.62, 0.82, 0.62]}
      />
      <mesh
        geometry={ROUNDED_BOX}
        material={MATERIALS.dockDark}
        position={[1.35, 1.2, 0.72]}
        scale={[0.62, 0.82, 0.62]}
      />
      <mesh
        geometry={UNIT_BOX}
        material={MATERIALS.signal}
        position={[-4.55, 6.35, 0.62]}
        scale={[0.34, 0.34, 0.12]}
      />
      <mesh
        geometry={UNIT_BOX}
        material={MATERIALS.signal}
        position={[4.55, 6.35, 0.62]}
        scale={[0.34, 0.34, 0.12]}
      />
      <DockMarkings />
      <DockLabel receiving={Boolean(receiving)} />
    </group>
  );
}

interface OptimizedTruckBayProps {
  readonly showShipping: boolean;
  readonly showReceiving: boolean;
}

export function OptimizedTruckBay({ showShipping, showReceiving }: OptimizedTruckBayProps) {
  const runtimeMode = getRuntimeMode();
  const benchmarkControllerStart = runtimeMode.benchmark
    ? getTruckBenchmarkControllerStart(runtimeMode.benchmarkScene)
    : null;
  const initialControllerTime = benchmarkControllerStart ?? 0;
  const initialShippingCycle = initialControllerTime % TRUCK_CYCLE_SECONDS;
  const initialReceivingCycle =
    (initialControllerTime + TRUCK_CYCLE_SECONDS / 2) % TRUCK_CYCLE_SECONDS;
  const shippingRootRef = useRef<THREE.Group>(null);
  const receivingRootRef = useRef<THREE.Group>(null);
  const shippingStateRef = useRef<TruckAnimState>(
    calculateShippingTruckState(initialShippingCycle, initialControllerTime)
  );
  const receivingStateRef = useRef<TruckAnimState>(
    calculateReceivingTruckState(initialReceivingCycle, initialControllerTime)
  );
  const shippingWheelRotation = useRef(0);
  const receivingWheelRotation = useRef(0);
  const priorSimulationTimeRef = useRef(0);
  const simulationTimeInitializedRef = useRef(false);
  const controllerTimeRef = useRef(initialControllerTime);
  const priorDocked = useRef({ shipping: false, receiving: false });
  const priorSchedule = useRef({ shipping: '', receiving: '' });
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);
  const safetyHoldActive = useGameSimulationStore(selectSafetyHoldActive);
  const outboundLoadRatio = useOperationsCampaignStore((state) =>
    Math.min(
      1,
      state.execution.dispatchLoad.loadedKg / Math.max(1, state.execution.dispatchLoad.capacityKg)
    )
  );
  const setTruckDocked = useProductionStore((state) => state.setTruckDocked);
  const recordTruckDeparture = useProductionStore((state) => state.recordTruckDeparture);
  const updateDockStatus = useProductionStore((state) => state.updateDockStatus);

  useFrame(() => {
    if (!isTabVisible) return;
    const simulationTime = useMaterialFlowStore.getState().simulationTime;
    const simulationDelta = simulationTimeInitializedRef.current
      ? Math.max(0, simulationTime - priorSimulationTimeRef.current)
      : 0;
    if (!simulationTimeInitializedRef.current) {
      controllerTimeRef.current = benchmarkControllerStart ?? simulationTime * 0.45;
    }
    simulationTimeInitializedRef.current = true;
    priorSimulationTimeRef.current = simulationTime;
    const controllerDelta = safetyHoldActive ? 0 : simulationDelta * 0.45;
    controllerTimeRef.current += controllerDelta;
    const adjustedTime = controllerTimeRef.current;
    const shippingCycle = adjustedTime % TRUCK_CYCLE_SECONDS;
    const receivingCycle = (adjustedTime + TRUCK_CYCLE_SECONDS / 2) % TRUCK_CYCLE_SECONDS;
    const shippingBase = calculateShippingTruckState(shippingCycle, adjustedTime);
    const receivingBase = calculateReceivingTruckState(receivingCycle, adjustedTime);
    const shipping = safetyHoldActive ? applyTruckSafetyHold(shippingBase) : shippingBase;
    const receiving = safetyHoldActive ? applyTruckSafetyHold(receivingBase) : receivingBase;
    shippingStateRef.current = shipping;
    receivingStateRef.current = receiving;
    shippingWheelRotation.current += (shipping.speed * controllerDelta) / TRUCK_WHEEL_RADIUS;
    receivingWheelRotation.current += (receiving.speed * controllerDelta) / TRUCK_WHEEL_RADIUS;

    if (shippingRootRef.current) {
      shippingRootRef.current.position.set(shipping.x, 0, shipping.z);
      shippingRootRef.current.rotation.y = shipping.rotation;
      shippingRootRef.current.userData.phase = shipping.phase;
    }
    if (receivingRootRef.current) {
      receivingRootRef.current.position.set(receiving.x, 0, receiving.z);
      receivingRootRef.current.rotation.y = receiving.rotation;
      receivingRootRef.current.userData.phase = receiving.phase;
    }

    const shippingDocked = isTruckDockedPhase(shipping.phase);
    const receivingDocked = isTruckDockedPhase(receiving.phase);
    if (shippingDocked !== priorDocked.current.shipping) {
      const wasDocked = priorDocked.current.shipping;
      priorDocked.current.shipping = shippingDocked;
      setTruckDocked('shipping', shippingDocked);
      if (wasDocked && !shippingDocked) {
        const { gameDay, gameTime } = useGameSimulationStore.getState();
        recordTruckDeparture('shipping', toSimulationMinutes({ day: gameDay, hour: gameTime }));
      }
    }
    if (receivingDocked !== priorDocked.current.receiving) {
      const wasDocked = priorDocked.current.receiving;
      priorDocked.current.receiving = receivingDocked;
      setTruckDocked('receiving', receivingDocked);
      if (wasDocked && !receivingDocked) {
        const { gameDay, gameTime } = useGameSimulationStore.getState();
        recordTruckDeparture('receiving', toSimulationMinutes({ day: gameDay, hour: gameTime }));
      }
    }

    const schedules = {
      shipping: getTruckScheduleStatus(shippingCycle),
      receiving: getTruckScheduleStatus(receivingCycle),
    };
    (['shipping', 'receiving'] as const).forEach((dock) => {
      const schedule = schedules[dock];
      const key = `${schedule.status}:${schedule.etaMinutes}`;
      if (key !== priorSchedule.current[dock]) {
        priorSchedule.current[dock] = key;
        updateDockStatus(dock, schedule);
      }
    });
  });

  return (
    <group name="optimized-truck-logistics" dispose={null}>
      {showShipping && (
        <>
          <DockInfrastructure z={50} />
          <group
            ref={shippingRootRef}
            name="shipping-truck"
            position={[shippingStateRef.current.x, 0, shippingStateRef.current.z]}
            rotation={[0, shippingStateRef.current.rotation, 0]}
          >
            <OptimizedTruckVisual
              colour="#cf4f35"
              stateRef={shippingStateRef}
              wheelRotationRef={shippingWheelRotation}
              company="FLOUR EXPRESS"
              plateNumber="FLR 2847"
              loadRatio={outboundLoadRatio}
            />
          </group>
        </>
      )}
      {showReceiving && (
        <>
          <DockInfrastructure z={-50} receiving />
          <group
            ref={receivingRootRef}
            name="receiving-truck"
            position={[receivingStateRef.current.x, 0, receivingStateRef.current.z]}
            rotation={[0, receivingStateRef.current.rotation, 0]}
          >
            <OptimizedTruckVisual
              colour="#2678a3"
              stateRef={receivingStateRef}
              wheelRotationRef={receivingWheelRotation}
              company="GRAIN CO"
              plateNumber="GRN 5921"
            />
          </group>
        </>
      )}
    </group>
  );
}
