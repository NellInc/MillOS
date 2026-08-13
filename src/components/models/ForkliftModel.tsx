/**
 * Forklift 3D Model Component
 *
 * Uses the delivery-validated GLTF asset recorded in
 * public/models/asset-manifest.json. Procedural geometry is the loading and
 * low-quality fallback.
 *
 * The runtime derivative is normalized to metres, centered on X/Z, grounded at
 * Y=0, and oriented with its forks facing positive Z.
 */

const FORKLIFT_MODEL_SCALE = 1;
/**
 * Fallback wheel radius, in metres.
 *
 * The authored GLB is measured at load instead (see `measureWheelRadius`),
 * because its two axles are NOT the same size: the drive wheels are 0.316 m and
 * the steered rear wheels 0.250 m. Driving both from one constant is a 28% slip
 * on the rear pair, and wheel slip is the classic tell that a vehicle is
 * animated rather than driven. This constant now only serves the two procedural
 * fallbacks, whose geometry is authored to match it exactly.
 */
const FORKLIFT_WHEEL_RADIUS = 0.32;
/** Rear wheel radius of the procedural fallbacks, matched to their geometry. */
const FORKLIFT_REAR_WHEEL_RADIUS = 0.25;

import React, { useRef, Suspense, useLayoutEffect, useMemo, useEffect } from 'react';
import { useDracoGLTF } from '../../utils/dracoLoader';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { MODEL_PATHS } from '../../utils/modelLoader';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useGraphicsStore } from '../../stores/graphicsStore';
import { useProductionStore } from '../../stores/productionStore';
import { applyVehicleSurface } from '../../utils/vehicleSurface';
import { RENDER_ORDER } from '../../constants/renderLayers';
import { SeatedVehicleOperator } from './VehicleOperator';

/**
 * Authored-GLB material overrides.
 *
 * The GLB ships six materials and ZERO textures, so every `baseColorFactor` is
 * a genuine linear albedo with nothing to double-multiply - there is no
 * compensating tint here to revert. What is wrong is the metalness: the safety
 * paint sits at 0.45 and the structural steel at 0.72, the physically invalid
 * band where the BRDF has neither a full diffuse albedo nor a real specular.
 * Paint is a dielectric under a clearcoat; steel is metalness 1. With
 * `scene.environment` bound, both finally have something to reflect.
 *
 * glTF `baseColorFactor` is LINEAR, and `THREE.Color` stores linear working
 * space, so the factors are written through `setRGB(..., LinearSRGBColorSpace)`
 * unchanged rather than being re-encoded as sRGB hex.
 *
 * Built PER CLONE, not at module scope: `scene.clone()` shares materials by
 * reference, so a module-level table would let one forklift's driven lamp
 * emissive overwrite the other's every frame.
 */
const linearColor = (r: number, g: number, b: number): THREE.Color =>
  new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace);

interface AuthoredForkliftMaterials {
  readonly byName: Record<string, THREE.Material>;
  /** Polished rod, applied by NODE name to the hydraulic rams only. */
  readonly ram: THREE.Material;
  readonly lampGlass: THREE.MeshStandardMaterial;
  readonly all: readonly THREE.Material[];
}

const createAuthoredForkliftMaterials = (grime: number): AuthoredForkliftMaterials => {
  const paint = applyVehicleSurface(
    new THREE.MeshPhysicalMaterial({
      name: 'painted-safety-amber',
      color: linearColor(0.6938718, 0.3231432, 0.0241576),
      roughness: 0.38,
      metalness: 0,
      clearcoat: 0.9,
      clearcoatRoughness: 0.09,
    }),
    { grime, grimeCeiling: 0.95 }
  );
  // Painted dark structure, NOT bare metal. The authored 0.72 metalness is in
  // the invalid band, but resolving it upward would be worse than resolving it
  // down: a near-black albedo at metalness 1 has no diffuse term and only a
  // 0.30-intensity, 64 x 32 environment to reflect, so it would render as a
  // hole. As a dielectric it keeps its ambient and hemisphere response and
  // gains a real Fresnel sheen, which is also what a painted mast actually is.
  const graphite = applyVehicleSurface(
    new THREE.MeshStandardMaterial({
      name: 'structural-graphite',
      color: linearColor(0.0388, 0.0508, 0.0592),
      roughness: 0.45,
      metalness: 0,
    }),
    { grime: grime * 0.8, grimeCeiling: 0.95 }
  );
  const rubber = new THREE.MeshStandardMaterial({
    name: 'industrial-rubber',
    color: linearColor(0.0056054, 0.0080232, 0.0097212),
    roughness: 0.96,
    metalness: 0,
  });
  const steel = applyVehicleSurface(
    new THREE.MeshStandardMaterial({
      name: 'galvanized-steel',
      // F0 lifted ~1.6x from the authored factor. Going 0.86 -> 1.0 metalness
      // removes the last of the diffuse term, and the only thing left to light
      // it is a 0.30-intensity environment.
      color: linearColor(0.2794, 0.3572, 0.4066),
      roughness: 0.32,
      metalness: 1,
    }),
    { grime, grimeCeiling: 1.05 }
  );
  const seat = new THREE.MeshPhysicalMaterial({
    name: 'operator-seat',
    color: linearColor(0.0295568, 0.0395462, 0.043735),
    roughness: 0.85,
    metalness: 0,
    sheen: 0.3,
    sheenRoughness: 0.6,
    sheenColor: new THREE.Color('#2a3238'),
  });
  // Warm, not cyan: the authored `emissiveFactor` of [0.35, 0.55, 0.62] makes
  // the work lamps glow like an aquarium. Driven from `isMoving` below.
  const lampGlass = new THREE.MeshStandardMaterial({
    name: 'lamp-glass',
    color: '#2a2418',
    emissive: '#ffd9a0',
    emissiveIntensity: 0,
    roughness: 0.08,
    metalness: 0,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    toneMapped: true,
  });
  // Chromed hydraulic rod. The roughness contrast against the 0.30 structural
  // steel is a strong "this is machinery" cue and costs nothing.
  const ram = new THREE.MeshStandardMaterial({
    name: 'hydraulic-rod',
    color: '#e9eef0',
    roughness: 0.17,
    metalness: 1,
  });
  const byName: Record<string, THREE.Material> = {
    'painted-safety-amber': paint,
    'structural-graphite': graphite,
    'industrial-rubber': rubber,
    'galvanized-steel': steel,
    'operator-seat': seat,
    'lamp-glass': lampGlass,
  };
  return { byName, ram, lampGlass, all: [paint, graphite, rubber, steel, seat, lampGlass, ram] };
};

/**
 * Draw order for forklift glazing.
 *
 * Matched to the truck's `VEHICLE_GLASS_RENDER_ORDER` so every vehicle pane in
 * the scene sorts against the same reference. MIGRATED to the shared
 * `RENDER_ORDER.vehicleGlass`; registered as `vehicle-glazing` in
 * `src/constants/depthRegistry.ts`.
 */
const COMPACT_GLASS_RENDER_ORDER = RENDER_ORDER.vehicleGlass;

/**
 * Nodes that get the polished-rod material.
 *
 * Only the FIRST of these telescopes. Measured from the GLB:
 * `forklift-hydraulic02-poles-19` is 0.692 m tall and thin in Z - the lift rod
 * pair. `forklift-hydraulic01-poles-23` is 0.135 m tall and 0.572 m wide, a
 * pump/cross-member housing; scaling it in Y would just inflate a lump.
 */
const RAM_NODE_NAMES = new Set(['forklift-hydraulic02-poles-19', 'forklift-hydraulic01-poles-23']);
const TELESCOPING_RAM_NODES = new Set(['forklift-hydraulic02-poles-19']);
/** Node name of the second mast stage. Its local +Y is genuinely vertical. */
const FORK_CARRIER_NODES = ['lift02_9', 'lift01_11'];

// Cargo fade-in duration in seconds (fast for smooth but minimal overhead)
const CARGO_FADE_DURATION = 0.25;

interface ForkliftModelProps {
  hasCargo: boolean;
  isMoving: boolean;
  operatorName: string;
  speedMultiplier?: number;
  forkHeightRef?: React.MutableRefObject<number>; // Ref for fork animation - avoids re-renders
  mastTiltRef?: React.MutableRefObject<number>;
  steeringAngleRef?: React.MutableRefObject<number>;
  /** Road/mill-floor film strength, 0..1. Per fleet vehicle, not shared. */
  grime?: number;
}

/**
 * Compact-LOD tyre, 0.64 m across and 0.24 m wide.
 *
 * Drawn through the four-instance wheel `InstancedMesh`, so this is the only
 * round silhouette on an otherwise all-box model and the one part the eye
 * watches turn. `CylinderGeometry(0.32, 0.32, 0.24, 20)` was a bare drum: a
 * coin face-on, a sharp-cornered puck edge-on.
 *
 * Four features, all of which are still legible at 8 m (previewed at that
 * distance, and this LOD is drawn out to the 62 m tier cutoff):
 *  - a cushion-tyre tread held at full radius across the middle 128 mm,
 *  - a tight shoulder round-over in the outer 56 mm of each side, which is the
 *    single cue that separates a rubber tyre from a cut cylinder,
 *  - a rim flange stepped 14 mm proud of the wheel disc, so the tyre stands off
 *    the rim the way a bead does,
 *  - a hub pan dished 22 mm into the wheel face, which is the entire face-on
 *    read - without it the wheel is a flat disc.
 *
 * SYMMETRIC ON PURPOSE. Every wheel shares one `compactWheelOrientation`
 * quaternion, and that rotation sends the geometry's +Y face outboard on the
 * left pair and inboard on the right. One-sided detail - a hub cap on a single
 * face - would show on one side of the vehicle and be buried in the chassis on
 * the other.
 *
 * Envelope is byte-identical to the cylinder it replaces: max radius exactly
 * 0.32, which is both `FORKLIFT_WHEEL_RADIUS` (the spin integrator's divisor)
 * and the ground-contact radius, and y in [-0.12, 0.12]. The 20 radial segments
 * are carried over unchanged - the 100 mm facet argued for below still holds,
 * and the count also fixes the inscribed polygon's Z half-extent, so moving it
 * would drift the envelope on an axis nothing here needs to move.
 *
 * Designed and previewed in scripts/blender/specs/forklift-vehicles.json.
 */
function createCompactWheelGeometry(): THREE.LatheGeometry {
  const profile = [
    new THREE.Vector2(0.0, -0.084), // hub pan floor centre, dished into the face
    new THREE.Vector2(0.062, -0.084), // pan floor
    new THREE.Vector2(0.076, -0.106), // pan wall out to the wheel disc
    new THREE.Vector2(0.13, -0.106), // rim disc face
    new THREE.Vector2(0.148, -0.12), // rim flange - widest axial face
    new THREE.Vector2(0.25, -0.12), // bead sidewall
    new THREE.Vector2(0.296, -0.111), // sidewall turns into the shoulder
    new THREE.Vector2(0.315, -0.09), // shoulder round-over
    new THREE.Vector2(0.32, -0.064), // tread reaches full radius
    new THREE.Vector2(0.32, 0.064), // flat tread band - envelope max radius
    new THREE.Vector2(0.315, 0.09),
    new THREE.Vector2(0.296, 0.111),
    new THREE.Vector2(0.25, 0.12),
    new THREE.Vector2(0.148, 0.12),
    new THREE.Vector2(0.13, 0.106),
    new THREE.Vector2(0.076, 0.106),
    new THREE.Vector2(0.062, 0.084),
    new THREE.Vector2(0.0, 0.084),
  ];
  return new THREE.LatheGeometry(profile, 20);
}

/**
 * Compact-LOD rotating beacon, 0.16 m across and 0.13 m tall.
 *
 * Mounted at y = 2.19, the highest point on the vehicle and so the only part
 * regularly read against open sky rather than against the mill behind it.
 * `CylinderGeometry(0.08, 0.08, 0.13, 10)` gave it a flat top, which reads as a
 * drum rather than a lamp.
 *
 * Two constraints make this profile unusually spare, and both are worth
 * stating. The cab roof's top face is at y = 2.13 - local y = -0.06 - so the
 * bottom 5 mm of this profile is inside the roof and any detail spent there is
 * invisible. And at the distances this LOD covers, the whole lamp is under ten
 * pixels tall, so lens fresnel rings would average to a plain cylinder one mip
 * level down. Everything therefore goes into the silhouette above the roof
 * line: a narrow mounting collar, a skirt flaring to full radius, a short
 * barrel, and a dome. The dome also earns its place on the emissive, which has
 * somewhere for its highlight to fall off instead of clipping across a flat lid.
 *
 * Envelope unchanged: max radius 0.08, y in [-0.065, 0.065]. The 10 segments
 * carry over from the cylinder deliberately - a 0.16 m lamp does not need more,
 * and any other count moves the inscribed polygon's Z half-extent by ~3.9 mm.
 */
function createCompactBeaconGeometry(): THREE.LatheGeometry {
  const profile = [
    new THREE.Vector2(0.0, -0.065), // base cap centre, buried in the roof
    new THREE.Vector2(0.062, -0.065),
    new THREE.Vector2(0.068, -0.056), // mounting collar, emerging from the roof
    new THREE.Vector2(0.068, -0.04),
    new THREE.Vector2(0.08, -0.033), // lens skirt flares to full radius
    new THREE.Vector2(0.08, 0.012), // lens barrel - envelope max radius
    new THREE.Vector2(0.074, 0.03), // shoulder turns in
    new THREE.Vector2(0.057, 0.048), // dome
    new THREE.Vector2(0.031, 0.0605),
    new THREE.Vector2(0.0, 0.065), // apex - envelope max y
  ];
  return new THREE.LatheGeometry(profile, 10);
}

// Low quality retains a deliberately small shared visual. Medium and above use
// the authored derivative, which remains inside the measured draw-call budget.
const compactForkliftGeometry = {
  body: new RoundedBoxGeometry(1.45, 0.85, 2.15, 2, 0.1),
  counterweight: new RoundedBoxGeometry(1.35, 0.72, 0.55, 2, 0.12),
  glass: new THREE.BoxGeometry(1.02, 0.72, 0.035),
  sideGlass: new THREE.BoxGeometry(0.035, 0.72, 0.78),
  roof: new THREE.BoxGeometry(1.42, 0.1, 1.22),
  mast: new THREE.BoxGeometry(0.11, 2.2, 0.13),
  detailBox: new THREE.BoxGeometry(1, 1, 1),
  fork: new THREE.BoxGeometry(0.13, 0.08, 1.35),
  // Shaped tyre, not a drum - see createCompactWheelGeometry. Max radius is
  // still exactly FORKLIFT_WHEEL_RADIUS, which is the divisor the spin
  // integrator uses; the old 0.31 against a 0.32 divisor slipped 3%.
  // 20 radial segments, matching the ProceduralForklift tyre below: at 16 the
  // 0.64 m rim facets 125 mm, which reads while it spins, and 20 takes that to
  // 100 mm. All of it lands on ONE shared geometry drawn through the wheel
  // InstancedMesh - a one-off, not per wheel or per vehicle. Divisible by 4, so
  // the 0.32 m radius that sets ground contact is byte-identical.
  wheel: createCompactWheelGeometry(),
  pallet: new THREE.BoxGeometry(0.94, 0.12, 0.86),
  load: new THREE.BoxGeometry(0.84, 0.55, 0.76),
  beacon: createCompactBeaconGeometry(),
  // Deliberately still a torus. Two dished-lathe replacements were designed and
  // previewed (compactSteeringWheelREJECTED in the spec cited above) and both
  // rendered as a solid lid. A steering wheel is defined by its spokes, its hub
  // and the OPEN sectors between them, and none of those is a surface of
  // revolution; at 0.148 radius against 0.0156 half-thickness the part is 1:19
  // flat, so no lathe dish is deep enough to separate rim from web, and
  // LatheGeometry averages normals along the whole profile, which blurs the one
  // step that might have read. The hoop at least keeps the hole, which is this
  // part's entire silhouette at 0.3 m behind 0.5-opacity glass.
  steeringWheel: new THREE.TorusGeometry(0.13, 0.018, 6, 14),
};

/**
 * Compact (low-tier) forklift materials.
 *
 * This variant DOES render at `low`, where there is no composer and the
 * renderer's own Neutral curve is the only tone map. `toneMapped` is therefore
 * true on every emissive here: `toneMapped: false` plus an emissive above 1.0
 * clips to a flat white swatch on that path, whereas the Neutral curve rolls it
 * off. Inside a composer the flag is inert either way, because the composer
 * forces `gl.toneMapping` to `NoToneMapping`, so `true` is correct on both.
 *
 * Metalness follows the same dielectric/metal split as the authored model:
 * paint is 0 with a clearcoat, steel is 1.
 */
const compactForkliftMaterial = {
  yellow: new THREE.MeshPhysicalMaterial({
    color: '#f6a800',
    roughness: 0.4,
    metalness: 0,
    clearcoat: 0.85,
    clearcoatRoughness: 0.1,
  }),
  orange: new THREE.MeshPhysicalMaterial({
    color: '#d97706',
    roughness: 0.44,
    metalness: 0,
    clearcoat: 0.8,
    clearcoatRoughness: 0.12,
  }),
  // Painted dark trim: a dielectric, despite looking like metal.
  dark: new THREE.MeshStandardMaterial({
    color: '#262f38',
    roughness: 0.55,
    metalness: 0,
  }),
  steel: new THREE.MeshStandardMaterial({
    color: '#a4b0ba',
    roughness: 0.32,
    metalness: 1,
  }),
  tyre: new THREE.MeshStandardMaterial({ color: '#0f1216', roughness: 0.95, metalness: 0 }),
  // `depthWrite` was left at its default `true` on a transparent material,
  // which lets the glass occlude whatever is meant to show through it.
  glass: new THREE.MeshPhysicalMaterial({
    color: '#18292e',
    roughness: 0.07,
    metalness: 0,
    ior: 1.52,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  }),
  pallet: new THREE.MeshStandardMaterial({ color: '#8a6337', roughness: 0.9, metalness: 0 }),
  load: new THREE.MeshStandardMaterial({ color: '#e8d6ad', roughness: 0.75, metalness: 0 }),
  beaconMoving: new THREE.MeshStandardMaterial({
    color: '#4a3200',
    emissive: '#ff8c00',
    emissiveIntensity: 1.2,
    roughness: 0.35,
    metalness: 0,
    toneMapped: true,
  }),
  beaconStopped: new THREE.MeshStandardMaterial({
    color: '#3d0f0f',
    emissive: '#e02020',
    emissiveIntensity: 1.1,
    roughness: 0.35,
    metalness: 0,
    toneMapped: true,
  }),
  headlight: new THREE.MeshStandardMaterial({
    color: '#2a2a26',
    emissive: '#fff1bd',
    emissiveIntensity: 1.4,
    roughness: 0.1,
    metalness: 0,
    toneMapped: true,
  }),
  tailLight: new THREE.MeshStandardMaterial({
    color: '#3d1112',
    emissive: '#ef4444',
    emissiveIntensity: 1.2,
    roughness: 0.2,
    metalness: 0,
    toneMapped: true,
  }),
};

const compactWheelPositions: ReadonlyArray<readonly [number, number, number]> = [
  [-0.72, 0.33, 0.7],
  [0.72, 0.33, 0.7],
  [-0.72, 0.3, -0.83],
  [0.72, 0.3, -0.83],
];
const compactInstanceMatrix = new THREE.Matrix4();
const compactInstancePosition = new THREE.Vector3();
const compactInstanceScale = new THREE.Vector3(1, 1, 1);
const compactWheelOrientation = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(0, 0, Math.PI / 2)
);
const compactWheelSpin = new THREE.Quaternion();
const compactWheelSteering = new THREE.Quaternion();
const compactWheelQuaternion = new THREE.Quaternion();
const compactStaticQuaternion = new THREE.Quaternion();

interface CompactDetailInstance {
  readonly position: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
}

const compactDarkDetails: readonly CompactDetailInstance[] = [
  { position: [-0.52, 1.53, -0.82], scale: [0.08, 1.02, 0.08] },
  { position: [0.52, 1.53, -0.82], scale: [0.08, 1.02, 0.08] },
  { position: [-0.52, 1.53, 0.13], scale: [0.08, 1.02, 0.08] },
  { position: [0.52, 1.53, 0.13], scale: [0.08, 1.02, 0.08] },
  { position: [0, 1.05, -0.48], scale: [0.62, 0.13, 0.55] },
  { position: [0, 1.34, -0.74], scale: [0.62, 0.54, 0.12] },
  { position: [0, 1.34, 0.02], scale: [0.92, 0.2, 0.24] },
  { position: [-0.78, 0.47, -0.18], scale: [0.16, 0.1, 0.88] },
  { position: [0.78, 0.47, -0.18], scale: [0.16, 0.1, 0.88] },
  { position: [0, 0.7, -1.425], scale: [1.02, 0.34, 0.035] },
];

const compactMastCrossbars: readonly CompactDetailInstance[] = [0.56, 1.22, 1.88].map((y) => ({
  position: [0, y, 0],
  scale: [1.05, 0.1, 0.14],
}));

const setCompactInstances = (
  mesh: THREE.InstancedMesh | null,
  instances: readonly CompactDetailInstance[]
): void => {
  if (!mesh) return;
  instances.forEach(({ position, scale }, index) => {
    compactInstancePosition.set(...position);
    compactInstanceScale.set(...scale);
    compactInstanceMatrix.compose(
      compactInstancePosition,
      compactStaticQuaternion,
      compactInstanceScale
    );
    mesh.setMatrixAt(index, compactInstanceMatrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  compactInstanceScale.set(1, 1, 1);
};

const CompactForklift: React.FC<ForkliftModelProps> = ({
  hasCargo,
  isMoving,
  operatorName,
  forkHeightRef,
  mastTiltRef,
  steeringAngleRef,
}) => {
  const modelRef = useRef<THREE.Group>(null);
  const wheelRef = useRef<THREE.InstancedMesh>(null);
  const mastRef = useRef<THREE.InstancedMesh>(null);
  const mastCrossbarRef = useRef<THREE.InstancedMesh>(null);
  const forkRef = useRef<THREE.InstancedMesh>(null);
  const darkDetailRef = useRef<THREE.InstancedMesh>(null);
  const sideGlassRef = useRef<THREE.InstancedMesh>(null);
  const headlightRef = useRef<THREE.InstancedMesh>(null);
  const tailLightRef = useRef<THREE.InstancedMesh>(null);
  const mastAssemblyTiltRef = useRef<THREE.Group>(null);
  const forkAssemblyRef = useRef<THREE.Group>(null);
  const wheelAngleRef = useRef(0);
  const worldPositionRef = useRef(new THREE.Vector3());
  const previousWorldPositionRef = useRef(new THREE.Vector3());
  const hasPreviousWorldPositionRef = useRef(false);
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);

  useLayoutEffect(() => {
    setCompactInstances(darkDetailRef.current, compactDarkDetails);
    setCompactInstances(mastCrossbarRef.current, compactMastCrossbars);
    setCompactInstances(sideGlassRef.current, [
      { position: [-0.61, 1.56, -0.34], scale: [1, 1, 1] },
      { position: [0.61, 1.56, -0.34], scale: [1, 1, 1] },
    ]);
    setCompactInstances(headlightRef.current, [
      { position: [-0.44, 0.82, 1.015], scale: [0.28, 0.2, 0.04] },
      { position: [0.44, 0.82, 1.015], scale: [0.28, 0.2, 0.04] },
    ]);
    setCompactInstances(tailLightRef.current, [
      { position: [-0.46, 0.75, -1.445], scale: [0.25, 0.18, 0.04] },
      { position: [0.46, 0.75, -1.445], scale: [0.25, 0.18, 0.04] },
    ]);

    if (mastRef.current) {
      [-0.48, 0.48].forEach((x, index) => {
        compactInstancePosition.set(x, 1.22, 0);
        compactInstanceMatrix.compose(
          compactInstancePosition,
          compactStaticQuaternion,
          compactInstanceScale
        );
        mastRef.current?.setMatrixAt(index, compactInstanceMatrix);
      });
      mastRef.current.instanceMatrix.needsUpdate = true;
      mastRef.current.computeBoundingSphere();
    }

    if (forkRef.current) {
      [-0.31, 0.31].forEach((x, index) => {
        compactInstancePosition.set(x, 0.32, 0.65);
        compactInstanceMatrix.compose(
          compactInstancePosition,
          compactStaticQuaternion,
          compactInstanceScale
        );
        forkRef.current?.setMatrixAt(index, compactInstanceMatrix);
      });
      forkRef.current.instanceMatrix.needsUpdate = true;
      forkRef.current.computeBoundingSphere();
    }

    if (wheelRef.current) {
      wheelRef.current.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      compactWheelPositions.forEach(([x, y, z], index) => {
        compactInstancePosition.set(x, y, z);
        compactInstanceMatrix.compose(
          compactInstancePosition,
          compactWheelOrientation,
          compactInstanceScale
        );
        wheelRef.current?.setMatrixAt(index, compactInstanceMatrix);
      });
      wheelRef.current.instanceMatrix.needsUpdate = true;
      wheelRef.current.computeBoundingSphere();
    }
  }, []);

  useFrame(() => {
    if (!isTabVisible) {
      hasPreviousWorldPositionRef.current = false;
      return;
    }

    if (forkAssemblyRef.current) {
      forkAssemblyRef.current.position.y = forkHeightRef?.current ?? 0;
    }
    if (mastAssemblyTiltRef.current) {
      mastAssemblyTiltRef.current.rotation.x = mastTiltRef?.current ?? 0;
    }

    if (!modelRef.current || !wheelRef.current) return;
    modelRef.current.getWorldPosition(worldPositionRef.current);
    if (!hasPreviousWorldPositionRef.current) {
      previousWorldPositionRef.current.copy(worldPositionRef.current);
      hasPreviousWorldPositionRef.current = true;
    } else {
      const distance = worldPositionRef.current.distanceTo(previousWorldPositionRef.current);
      previousWorldPositionRef.current.copy(worldPositionRef.current);
      if (isMoving && distance > 0 && distance <= 2) {
        wheelAngleRef.current += distance / FORKLIFT_WHEEL_RADIUS;
      }
    }

    compactWheelSpin.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, wheelAngleRef.current);

    compactWheelPositions.forEach(([x, y, z], index) => {
      compactWheelSteering.setFromAxisAngle(
        THREE.Object3D.DEFAULT_UP,
        index >= 2 ? (steeringAngleRef?.current ?? 0) : 0
      );
      compactWheelQuaternion
        .copy(compactWheelSteering)
        .multiply(compactWheelOrientation)
        .multiply(compactWheelSpin);
      compactInstancePosition.set(x, y, z);
      compactInstanceMatrix.compose(
        compactInstancePosition,
        compactWheelQuaternion,
        compactInstanceScale
      );
      wheelRef.current?.setMatrixAt(index, compactInstanceMatrix);
    });
    wheelRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <group ref={modelRef} name="compact-forklift-model" dispose={null}>
      <mesh
        geometry={compactForkliftGeometry.body}
        material={compactForkliftMaterial.yellow}
        position={[0, 0.72, -0.08]}
        castShadow
        receiveShadow
      />
      <mesh
        geometry={compactForkliftGeometry.counterweight}
        material={compactForkliftMaterial.orange}
        position={[0, 0.64, -1.13]}
        castShadow
        receiveShadow
      />
      <instancedMesh
        ref={darkDetailRef}
        args={[
          compactForkliftGeometry.detailBox,
          compactForkliftMaterial.dark,
          compactDarkDetails.length,
        ]}
        castShadow
        receiveShadow
      />
      <mesh
        geometry={compactForkliftGeometry.glass}
        material={compactForkliftMaterial.glass}
        position={[0, 1.55, 0.18]}
        renderOrder={COMPACT_GLASS_RENDER_ORDER}
      />
      <instancedMesh
        ref={sideGlassRef}
        args={[compactForkliftGeometry.sideGlass, compactForkliftMaterial.glass, 2]}
        renderOrder={COMPACT_GLASS_RENDER_ORDER}
      />
      <mesh
        geometry={compactForkliftGeometry.roof}
        material={compactForkliftMaterial.yellow}
        position={[0, 2.08, -0.35]}
        castShadow
        receiveShadow
      />
      <group position={[0, 1.03, -0.52]} scale={0.68}>
        <SeatedVehicleOperator name={operatorName} />
      </group>
      <mesh
        geometry={compactForkliftGeometry.steeringWheel}
        material={compactForkliftMaterial.dark}
        position={[0, 1.33, -0.28]}
        rotation={[-0.38, 0, 0]}
        castShadow
        receiveShadow
      />
      <group ref={mastAssemblyTiltRef} name="compact-forklift-mast" position={[0, 0, 1.14]}>
        <instancedMesh
          ref={mastRef}
          args={[compactForkliftGeometry.mast, compactForkliftMaterial.steel, 2]}
          castShadow
          receiveShadow
        />
        <instancedMesh
          ref={mastCrossbarRef}
          args={[
            compactForkliftGeometry.detailBox,
            compactForkliftMaterial.steel,
            compactMastCrossbars.length,
          ]}
          castShadow
          receiveShadow
        />
        <group ref={forkAssemblyRef}>
          <mesh
            geometry={compactForkliftGeometry.detailBox}
            material={compactForkliftMaterial.steel}
            position={[0, 0.62, 0.06]}
            scale={[1.02, 0.32, 0.13]}
            castShadow
            receiveShadow
          />
          <instancedMesh
            ref={forkRef}
            args={[compactForkliftGeometry.fork, compactForkliftMaterial.steel, 2]}
            castShadow
            receiveShadow
          />
          <group position={[0, 0.43, 0.66]} visible={hasCargo}>
            <mesh
              geometry={compactForkliftGeometry.pallet}
              material={compactForkliftMaterial.pallet}
              castShadow
              receiveShadow
            />
            <mesh
              geometry={compactForkliftGeometry.load}
              material={compactForkliftMaterial.load}
              position={[0, 0.33, 0]}
              castShadow
              receiveShadow
            />
          </group>
        </group>
      </group>
      <instancedMesh
        ref={wheelRef}
        args={[compactForkliftGeometry.wheel, compactForkliftMaterial.tyre, 4]}
        castShadow
        receiveShadow
      />
      <mesh
        geometry={compactForkliftGeometry.beacon}
        material={
          isMoving ? compactForkliftMaterial.beaconMoving : compactForkliftMaterial.beaconStopped
        }
        position={[0, 2.19, -0.35]}
        receiveShadow
      />
      <instancedMesh
        ref={headlightRef}
        args={[compactForkliftGeometry.detailBox, compactForkliftMaterial.headlight, 2]}
      />
      <instancedMesh
        ref={tailLightRef}
        args={[compactForkliftGeometry.detailBox, compactForkliftMaterial.tailLight, 2]}
      />
    </group>
  );
};

// GLTF Model version
interface AuthoredWheelNode {
  readonly object: THREE.Object3D;
  readonly baseQuaternion: THREE.Quaternion;
  readonly steered: boolean;
  /** Measured from the GLB at load. The two axles are different sizes. */
  readonly radius: number;
}

interface AuthoredMastNode {
  readonly object: THREE.Object3D;
  readonly baseQuaternion: THREE.Quaternion;
}

/**
 * The fork carriage, plus the direction it actually travels.
 *
 * WHY THE AXIS IS MEASURED. The carriage node sits several levels down a
 * pivot-baked export in which each node carries a compensating rotation, so its
 * `position` is expressed in a rotated parent frame - writing `position.y`
 * moves the carriage along whatever direction that frame's +Y happens to be,
 * not up. On this GLB `lift01_11`'s local +Y resolves to (0, 0.37, 0.93) in
 * model space: raising the forks pushed them mostly FORWARD, out of the mast,
 * while the separately-mounted cargo group rose vertically and detached from
 * them. Deriving the axis from the parent's world quaternion is correct for any
 * node in any export, and it keeps working when the mast tilts, because the
 * parent's rotation is applied after this offset.
 */
interface AuthoredCarrierNode {
  readonly object: THREE.Object3D;
  readonly basePosition: THREE.Vector3;
  readonly liftAxis: THREE.Vector3;
  /** Parent-local units per metre of model-space travel. */
  readonly metresToLocal: number;
  /**
   * Ceiling on travel, measured from the mast's own height.
   *
   * Correcting the axis takes real carriage travel from 14 cm to the full
   * `FORK_LIFT_HEIGHT` of 1.2 m on a mast that measures 1.57 m, and the lift
   * cycle runs continuously. Bounding it against the authored geometry means a
   * wrong assumption degrades to "the mast does not extend far enough" rather
   * than to forks punching out through the top of the mast every two seconds.
   */
  readonly maxLift: number;
}

interface AuthoredRamNode {
  readonly object: THREE.Object3D;
  readonly basePositionY: number;
  readonly baseScaleY: number;
  readonly geometryMinY: number;
}

const authoredWheelSpin = new THREE.Quaternion();
const authoredWheelSteering = new THREE.Quaternion();
const authoredMastTilt = new THREE.Quaternion();
const authoredMastAxis = new THREE.Vector3(1, 0, 0);
const authoredModelUp = new THREE.Vector3(0, 1, 0);
const authoredScratchBox = new THREE.Box3();
const authoredScratchSize = new THREE.Vector3();
const authoredScratchQuaternion = new THREE.Quaternion();
const authoredScratchScale = new THREE.Vector3();

/**
 * Wheel radius from the node's own bounds, in model space.
 *
 * The wheel pair is spread along X with its axle along X, so the Y and Z
 * extents are both the diameter. Guarded: a decode that returns a degenerate or
 * absurd box falls back to the authored constant rather than dividing the spin
 * by something near zero.
 */
const measureWheelRadius = (node: THREE.Object3D): number => {
  authoredScratchBox.setFromObject(node);
  if (authoredScratchBox.isEmpty()) return FORKLIFT_WHEEL_RADIUS;
  authoredScratchBox.getSize(authoredScratchSize);
  const radius = Math.max(authoredScratchSize.y, authoredScratchSize.z) * 0.5;
  return Number.isFinite(radius) && radius > 0.05 && radius < 1.5 ? radius : FORKLIFT_WHEEL_RADIUS;
};

const GLTFForklift: React.FC<ForkliftModelProps> = ({
  hasCargo,
  isMoving,
  operatorName,
  forkHeightRef,
  mastTiltRef,
  steeringAngleRef,
  grime = 0.7,
}) => {
  const { scene } = useDracoGLTF(MODEL_PATHS.forklift);
  const modelRef = useRef<THREE.Group>(null);
  const cargoRef = useRef<THREE.Group>(null);
  const cargoMastRef = useRef<THREE.Group>(null);
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);

  // Cargo fade-in refs (no re-renders)
  const cargoOpacityRef = useRef(hasCargo ? 1 : 0);
  const prevHasCargoRef = useRef(hasCargo);
  const cargoMaterialsRef = useRef<THREE.MeshStandardMaterial[]>([]);
  const wheelNodesRef = useRef<AuthoredWheelNode[]>([]);
  const travelDistanceRef = useRef(0);
  const mastRootRef = useRef<AuthoredMastNode | null>(null);
  const forkCarrierRef = useRef<AuthoredCarrierNode | null>(null);
  const ramNodesRef = useRef<AuthoredRamNode[]>([]);
  const worldPositionRef = useRef(new THREE.Vector3());
  const previousWorldPositionRef = useRef(new THREE.Vector3());
  const hasPreviousWorldPositionRef = useRef(false);
  const lampLitRef = useRef<boolean | null>(null);

  const materials = useMemo(() => createAuthoredForkliftMaterials(grime), [grime]);
  useEffect(() => () => materials.all.forEach((material) => material.dispose()), [materials]);

  // Clone the scene, remap its materials, and capture the animated nodes.
  const clonedScene = React.useMemo(() => {
    const clone = scene.clone();
    // Local transforms are cloned but world matrices are not, and both the
    // wheel measurement and the lift-axis derivation read world transforms.
    clone.updateMatrixWorld(true);
    wheelNodesRef.current = [];
    mastRootRef.current = null;
    forkCarrierRef.current = null;
    ramNodesRef.current = [];
    const carrierCandidates = new Map<string, THREE.Object3D>();
    // Collected into an array rather than written straight to the ref, for the
    // same reason the wheel nodes are: control-flow analysis narrows a null-reset
    // ref (or a null-initialised local) to `null` and cannot see the assignment
    // inside the traverse callback, so reading it back below would type as
    // `never`. An array element access is not narrowed that way.
    const mastCandidates: AuthoredMastNode[] = [];
    clone.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        const isRam = RAM_NODE_NAMES.has(child.name);
        const sourceName = (mesh.material as THREE.Material | undefined)?.name ?? '';
        const replacement = isRam ? materials.ram : materials.byName[sourceName];
        if (replacement) mesh.material = replacement;
        if (TELESCOPING_RAM_NODES.has(child.name) && mesh.geometry) {
          mesh.geometry.computeBoundingBox();
          ramNodesRef.current.push({
            object: child,
            basePositionY: child.position.y,
            baseScaleY: child.scale.y,
            geometryMinY: mesh.geometry.boundingBox?.min.y ?? 0,
          });
        }
      }
      const name = child.name.toLowerCase();
      if (name === 'wheelsb_1' || name === 'wheelsf_3') {
        wheelNodesRef.current.push({
          object: child,
          baseQuaternion: child.quaternion.clone(),
          steered: name === 'wheelsb_1',
          radius: measureWheelRadius(child),
        });
      }
      if (FORK_CARRIER_NODES.includes(child.name)) carrierCandidates.set(child.name, child);
      if (name === 'hydraulics_front_13') {
        mastCandidates.push({ object: child, baseQuaternion: child.quaternion.clone() });
      }
    });

    const carrier = FORK_CARRIER_NODES.map((nodeName) => carrierCandidates.get(nodeName)).find(
      Boolean
    );
    const mastNode = mastCandidates[0] ?? null;
    mastRootRef.current = mastNode;
    const mastRoot = mastNode?.object;
    let maxLift = 0.95;
    if (mastRoot) {
      authoredScratchBox.setFromObject(mastRoot);
      if (!authoredScratchBox.isEmpty()) {
        authoredScratchBox.getSize(authoredScratchSize);
        maxLift = THREE.MathUtils.clamp(authoredScratchSize.y * 0.6, 0.3, 1.6);
      }
    }
    if (carrier) {
      const parent = carrier.parent;
      if (parent) {
        parent.getWorldQuaternion(authoredScratchQuaternion);
        parent.getWorldScale(authoredScratchScale);
      } else {
        authoredScratchQuaternion.identity();
        authoredScratchScale.set(1, 1, 1);
      }
      const liftAxis = authoredModelUp
        .clone()
        .applyQuaternion(authoredScratchQuaternion.invert())
        .normalize();
      const parentScale = Math.abs(authoredScratchScale.y);
      forkCarrierRef.current = {
        object: carrier,
        basePosition: carrier.position.clone(),
        liftAxis,
        metresToLocal: parentScale > 1e-6 ? 1 / parentScale : 1,
        maxLift,
      };
    }
    return clone;
  }, [materials, scene]);

  // Drive visible pose from the authoritative parent transform. Wheel rotation
  // is distance-correct, so frame rate and speed changes cannot alter slip.
  useFrame((_, delta) => {
    if (!isTabVisible) {
      hasPreviousWorldPositionRef.current = false;
      return;
    }
    if (!modelRef.current) return;
    const animationDelta = delta * Math.max(0, useProductionStore.getState().productionSpeed);

    const mastTilt = mastTiltRef?.current ?? 0;
    if (mastRootRef.current) {
      authoredMastTilt.setFromAxisAngle(authoredMastAxis, mastTilt);
      mastRootRef.current.object.quaternion
        .copy(mastRootRef.current.baseQuaternion)
        .multiply(authoredMastTilt);
    }
    if (cargoMastRef.current) {
      cargoMastRef.current.rotation.x = mastTilt;
    }

    const forkHeight = forkHeightRef?.current ?? 0;
    const carrier = forkCarrierRef.current;
    const carriageLift = carrier ? Math.min(forkHeight, carrier.maxLift) : forkHeight;
    if (carrier) {
      carrier.object.position
        .copy(carrier.basePosition)
        .addScaledVector(carrier.liftAxis, carriageLift * carrier.metresToLocal);
    }
    // Rams telescope at half the carriage rate, which is what a two-stage mast
    // does. Scaling about the node origin would drop the rod through its own
    // mount, so the base is pinned using the node's own geometry bounds.
    if (ramNodesRef.current.length > 0) {
      const extension = 1 + carriageLift * 0.42;
      ramNodesRef.current.forEach((ram) => {
        ram.object.scale.y = ram.baseScaleY * extension;
        ram.object.position.y =
          ram.basePositionY + ram.geometryMinY * ram.baseScaleY * (1 - extension);
      });
    }
    // The cargo rides the forks, so it tracks the CLAMPED travel. Using the
    // raw request here is how the pallet floats off the tines.
    if (cargoRef.current && forkHeightRef) {
      cargoRef.current.position.y = 0.34 + carriageLift;
    }

    // Work lamps follow the vehicle, not the clock: a forklift running inside
    // the mill has them on. Switched at the state boundary rather than ramped.
    if (lampLitRef.current !== isMoving) {
      lampLitRef.current = isMoving;
      materials.lampGlass.emissiveIntensity = isMoving ? 3.5 : 0;
    }

    // Cargo fade-in animation (ref-based, no re-renders)
    if (hasCargo && !prevHasCargoRef.current) {
      cargoOpacityRef.current = 0;
    }
    prevHasCargoRef.current = hasCargo;

    const targetOpacity = hasCargo ? 1 : 0;
    if (cargoOpacityRef.current !== targetOpacity) {
      const fadeSpeed = 1 / CARGO_FADE_DURATION;
      if (hasCargo) {
        cargoOpacityRef.current = Math.min(1, cargoOpacityRef.current + animationDelta * fadeSpeed);
      } else {
        cargoOpacityRef.current = 0;
      }
      const opacity = cargoOpacityRef.current;
      cargoMaterialsRef.current.forEach((mat) => {
        if (mat) {
          mat.opacity = opacity;
          mat.visible = opacity > 0.01;
        }
      });
    }

    modelRef.current.getWorldPosition(worldPositionRef.current);
    if (!hasPreviousWorldPositionRef.current) {
      previousWorldPositionRef.current.copy(worldPositionRef.current);
      hasPreviousWorldPositionRef.current = true;
    } else {
      const distance = worldPositionRef.current.distanceTo(previousWorldPositionRef.current);
      previousWorldPositionRef.current.copy(worldPositionRef.current);
      if (isMoving && distance > 0 && distance <= 2) {
        travelDistanceRef.current += distance;
      }
    }

    // Distance is accumulated once and divided by EACH node's own radius, so
    // the 0.316 m drive wheels and the 0.250 m steered wheels both roll without
    // slip instead of sharing one divisor.
    wheelNodesRef.current.forEach(({ object, baseQuaternion, steered, radius }) => {
      authoredWheelSpin.setFromAxisAngle(
        THREE.Object3D.DEFAULT_UP,
        travelDistanceRef.current / radius
      );
      authoredWheelSteering.setFromAxisAngle(
        THREE.Object3D.DEFAULT_UP,
        steered ? (steeringAngleRef?.current ?? 0) : 0
      );
      object.quaternion
        .copy(authoredWheelSteering)
        .multiply(baseQuaternion)
        .multiply(authoredWheelSpin);
    });
  });

  return (
    <group ref={modelRef}>
      <primitive object={clonedScene} scale={FORKLIFT_MODEL_SCALE} />
      <group position={[0, 0.93, -0.22]} scale={0.68}>
        <SeatedVehicleOperator name={operatorName} />
      </group>
      {/* Add cargo on top if needed - always mounted, opacity animated */}
      <group ref={cargoMastRef} name="authored-forklift-cargo-mast">
        <group
          ref={cargoRef}
          position={[0, 0.34, 1.02]}
          visible={hasCargo || cargoOpacityRef.current > 0.01}
        >
          <mesh castShadow receiveShadow>
            <boxGeometry args={[0.9, 0.12, 0.8]} />
            <meshStandardMaterial
              ref={(mat) => {
                if (mat) cargoMaterialsRef.current[0] = mat;
              }}
              color="#a16207"
              transparent
              opacity={cargoOpacityRef.current}
            />
          </mesh>
          <mesh castShadow receiveShadow position={[0, 0.34, 0]}>
            <boxGeometry args={[0.82, 0.56, 0.72]} />
            <meshStandardMaterial
              ref={(mat) => {
                if (mat) cargoMaterialsRef.current[1] = mat;
              }}
              color="#fef3c7"
              transparent
              opacity={cargoOpacityRef.current}
            />
          </mesh>
        </group>
      </group>
    </group>
  );
};

// Forklift model preload disabled - using procedural fallback
// useGLTF.preload(MODEL_PATHS.forklift);

// Procedural fallback (improved from original)
const ProceduralForklift: React.FC<ForkliftModelProps> = ({
  hasCargo,
  isMoving,
  forkHeightRef,
  mastTiltRef,
}) => {
  const modelRef = useRef<THREE.Group>(null);
  const wheelRefs = useRef<THREE.Mesh[]>([]);
  const mastAssemblyRef = useRef<THREE.Group>(null);
  const forkTiltRef = useRef<THREE.Group>(null);
  const cargoTiltRef = useRef<THREE.Group>(null);
  const forksRef = useRef<THREE.Group>(null);
  const cargoRef = useRef<THREE.Group>(null);
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);
  const worldPositionRef = useRef(new THREE.Vector3());
  const previousWorldPositionRef = useRef(new THREE.Vector3());
  const hasPreviousWorldPositionRef = useRef(false);

  // Cargo fade-in refs (no re-renders)
  const cargoOpacityRef = useRef(hasCargo ? 1 : 0);
  const prevHasCargoRef = useRef(hasCargo);
  const cargoMaterialsRef = useRef<THREE.MeshStandardMaterial[]>([]);

  useFrame((_, delta) => {
    if (!isTabVisible) {
      hasPreviousWorldPositionRef.current = false;
      return;
    }
    const animationDelta = delta * Math.max(0, useProductionStore.getState().productionSpeed);

    // Update fork height directly from ref (no re-render needed)
    const forkHeight = forkHeightRef?.current ?? 0;
    if (forksRef.current) {
      forksRef.current.position.y = forkHeight;
    }
    if (cargoRef.current) {
      cargoRef.current.position.y = 0.6 + forkHeight;
    }
    const mastTilt = mastTiltRef?.current ?? 0;
    if (mastAssemblyRef.current) mastAssemblyRef.current.rotation.x = mastTilt;
    if (forkTiltRef.current) forkTiltRef.current.rotation.x = mastTilt;
    if (cargoTiltRef.current) cargoTiltRef.current.rotation.x = mastTilt;

    // Cargo fade-in animation (ref-based, no re-renders)
    if (hasCargo && !prevHasCargoRef.current) {
      // Cargo just spawned - start fade from 0
      cargoOpacityRef.current = 0;
    }
    prevHasCargoRef.current = hasCargo;

    // Animate opacity towards target
    const targetOpacity = hasCargo ? 1 : 0;
    if (cargoOpacityRef.current !== targetOpacity) {
      const fadeSpeed = 1 / CARGO_FADE_DURATION;
      if (hasCargo) {
        cargoOpacityRef.current = Math.min(1, cargoOpacityRef.current + animationDelta * fadeSpeed);
      } else {
        cargoOpacityRef.current = 0; // Instant hide on unload
      }
      // Update all cargo materials directly
      const opacity = cargoOpacityRef.current;
      cargoMaterialsRef.current.forEach((mat) => {
        if (mat) {
          mat.opacity = opacity;
          mat.visible = opacity > 0.01;
        }
      });
    }

    if (!modelRef.current) return;
    modelRef.current.getWorldPosition(worldPositionRef.current);
    if (!hasPreviousWorldPositionRef.current) {
      previousWorldPositionRef.current.copy(worldPositionRef.current);
      hasPreviousWorldPositionRef.current = true;
      return;
    }

    const distance = worldPositionRef.current.distanceTo(previousWorldPositionRef.current);
    previousWorldPositionRef.current.copy(worldPositionRef.current);
    if (!isMoving || distance <= 0 || distance > 2) return;
    wheelRefs.current.forEach((wheel, index) => {
      // Front and rear radii differ, and both must equal the geometry below.
      const radius = index < 2 ? FORKLIFT_WHEEL_RADIUS : FORKLIFT_REAR_WHEEL_RADIUS;
      if (wheel) wheel.rotation.x += distance / radius;
    });
  });

  const setWheelRef = (index: number) => (el: THREE.Mesh | null) => {
    if (el) wheelRefs.current[index] = el;
  };

  return (
    <group ref={modelRef}>
      {/* Main body - more detailed */}
      <mesh castShadow position={[0, 0.6, 0]}>
        <boxGeometry args={[1.5, 1, 2.5]} />
        <meshStandardMaterial color="#f59e0b" metalness={0.4} roughness={0.5} />
      </mesh>

      {/* Body details - side panels */}
      <mesh castShadow position={[-0.76, 0.6, 0]}>
        <boxGeometry args={[0.02, 0.8, 2.3]} />
        <meshStandardMaterial color="#d97706" metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh castShadow position={[0.76, 0.6, 0]}>
        <boxGeometry args={[0.02, 0.8, 2.3]} />
        <meshStandardMaterial color="#d97706" metalness={0.5} roughness={0.4} />
      </mesh>

      {/* Engine cover with vents */}
      <mesh castShadow position={[0, 0.85, -0.8]}>
        <boxGeometry args={[1.3, 0.5, 0.8]} />
        <meshStandardMaterial color="#ea580c" metalness={0.3} roughness={0.6} />
      </mesh>
      {/* Vent grilles */}
      {[-0.3, 0, 0.3].map((x, i) => (
        <mesh key={i} position={[x, 0.86, -0.41]}>
          <boxGeometry args={[0.15, 0.3, 0.02]} />
          <meshStandardMaterial color="#1f2937" />
        </mesh>
      ))}

      {/* Counterweight */}
      <mesh castShadow position={[0, 0.4, -1.35]}>
        <boxGeometry args={[1.4, 0.6, 0.3]} />
        <meshStandardMaterial color="#374151" metalness={0.7} roughness={0.3} />
      </mesh>

      {/* Cabin - glass effect */}
      <mesh castShadow position={[0, 1.4, -0.3]}>
        <boxGeometry args={[1.3, 1.2, 1.2]} />
        <meshStandardMaterial color="#1f2937" metalness={0.2} roughness={0.8} />
      </mesh>
      {/* Cabin windows */}
      <mesh position={[0, 1.5, 0.32]}>
        <boxGeometry args={[1.1, 0.8, 0.02]} />
        <meshStandardMaterial
          color="#60a5fa"
          metalness={0.9}
          roughness={0.1}
          transparent
          opacity={0.6}
        />
      </mesh>
      <mesh position={[-0.66, 1.5, -0.3]}>
        <boxGeometry args={[0.02, 0.8, 1.0]} />
        <meshStandardMaterial
          color="#60a5fa"
          metalness={0.9}
          roughness={0.1}
          transparent
          opacity={0.6}
        />
      </mesh>
      <mesh position={[0.66, 1.5, -0.3]}>
        <boxGeometry args={[0.02, 0.8, 1.0]} />
        <meshStandardMaterial
          color="#60a5fa"
          metalness={0.9}
          roughness={0.1}
          transparent
          opacity={0.6}
        />
      </mesh>

      {/* Roof with ROPS (Roll Over Protection) */}
      <mesh castShadow position={[0, 2.1, -0.3]}>
        <boxGeometry args={[1.5, 0.1, 1.4]} />
        <meshStandardMaterial color="#f59e0b" metalness={0.4} roughness={0.5} />
      </mesh>
      {/* ROPS pillars */}
      {[
        [-0.65, -0.85],
        [-0.65, 0.25],
        [0.65, -0.85],
        [0.65, 0.25],
      ].map(([x, z], i) => (
        <mesh key={i} castShadow position={[x, 1.75, z]}>
          <boxGeometry args={[0.08, 0.8, 0.08]} />
          <meshStandardMaterial color="#374151" metalness={0.8} roughness={0.2} />
        </mesh>
      ))}

      {/* Steering wheel hint */}
      <mesh position={[0.2, 1.3, 0.1]} rotation={[0.3, 0, 0]}>
        <torusGeometry args={[0.12, 0.02, 8, 16]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>

      {/* Seat */}
      <mesh castShadow position={[0, 1.1, -0.4]}>
        <boxGeometry args={[0.5, 0.1, 0.5]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
      <mesh castShadow position={[0, 1.4, -0.6]}>
        <boxGeometry args={[0.5, 0.5, 0.1]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>

      {/* Mast - hydraulic system */}
      <group ref={mastAssemblyRef} position={[0, 0, 1.3]}>
        {/* Main mast rails */}
        {[-0.5, 0, 0.5].map((x, i) => (
          <mesh key={i} castShadow position={[x, 1.2, 0]}>
            <boxGeometry args={[0.08, 2.2, 0.12]} />
            <meshStandardMaterial color="#374151" metalness={0.8} roughness={0.2} />
          </mesh>
        ))}
        {/* Hydraulic cylinder */}
        <mesh castShadow position={[0, 1.0, -0.1]}>
          <cylinderGeometry args={[0.06, 0.06, 1.8, 12]} />
          <meshStandardMaterial color="#6b7280" metalness={0.9} roughness={0.1} />
        </mesh>
        {/* Hydraulic lines */}
        <mesh position={[-0.2, 0.8, -0.08]}>
          <cylinderGeometry args={[0.015, 0.015, 1.4, 8]} />
          <meshStandardMaterial color="#1f2937" />
        </mesh>
        <mesh position={[0.2, 0.8, -0.08]}>
          <cylinderGeometry args={[0.015, 0.015, 1.4, 8]} />
          <meshStandardMaterial color="#1f2937" />
        </mesh>
        {/* Cross bars */}
        {[0.3, 1.0, 1.7].map((y, i) => (
          <mesh key={i} castShadow position={[0, y, 0]}>
            <boxGeometry args={[1.1, 0.06, 0.06]} />
            <meshStandardMaterial color="#4b5563" metalness={0.7} roughness={0.3} />
          </mesh>
        ))}
      </group>

      {/* Forks - with thickness, animated via useFrame */}
      <group ref={forkTiltRef} position={[0, 0, 1.3]}>
        <group ref={forksRef} position={[0, 0, 0]}>
          {[-0.3, 0.3].map((x, i) => (
            <group key={i} position={[x, 0.3, 0.5]}>
              <mesh castShadow>
                <boxGeometry args={[0.12, 0.06, 1.3]} />
                <meshStandardMaterial color="#6b7280" metalness={0.85} roughness={0.15} />
              </mesh>
              {/* Fork tip bevel */}
              <mesh castShadow position={[0, 0.015, 0.68]} rotation={[0.15, 0, 0]}>
                <boxGeometry args={[0.12, 0.03, 0.1]} />
                <meshStandardMaterial color="#6b7280" metalness={0.85} roughness={0.15} />
              </mesh>
              {/* Fork vertical section */}
              <mesh castShadow position={[0, 0.25, -0.6]}>
                <boxGeometry args={[0.12, 0.5, 0.08]} />
                <meshStandardMaterial color="#6b7280" metalness={0.85} roughness={0.15} />
              </mesh>
            </group>
          ))}
        </group>
      </group>

      {/* Wheels - larger with tread */}
      {[
        [-0.7, 0.3, 0.8],
        [0.7, 0.3, 0.8],
        [-0.7, 0.25, -0.9],
        [0.7, 0.25, -0.9],
      ].map((pos, i) => (
        <group key={i} position={pos as [number, number, number]}>
          {/* Tire */}
          <mesh ref={setWheelRef(i)} castShadow rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry
              args={[
                i < 2 ? FORKLIFT_WHEEL_RADIUS : FORKLIFT_REAR_WHEEL_RADIUS,
                i < 2 ? FORKLIFT_WHEEL_RADIUS : FORKLIFT_REAR_WHEEL_RADIUS,
                0.22,
                20,
              ]}
            />
            <meshStandardMaterial color="#1f2937" roughness={0.9} />
          </mesh>
          {/* Hub */}
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.12, 0.12, 0.24, 12]} />
            <meshStandardMaterial color="#f59e0b" metalness={0.6} roughness={0.4} />
          </mesh>
          {/* Lug nuts */}
          {[0, 1, 2, 3, 4].map((j) => (
            <mesh key={j} position={[0.12, 0, 0]} rotation={[0, 0, (j * Math.PI * 2) / 5]}>
              <mesh position={[0, 0.08, 0]}>
                <cylinderGeometry args={[0.015, 0.015, 0.03, 6]} />
                <meshStandardMaterial color="#374151" metalness={0.8} roughness={0.2} />
              </mesh>
            </mesh>
          ))}
        </group>
      ))}

      {/* Headlights */}
      {[-0.5, 0.5].map((x, i) => (
        <mesh key={i} position={[x, 0.8, 1.26]}>
          <cylinderGeometry args={[0.08, 0.08, 0.05, 12]} />
          <meshStandardMaterial color="#fef3c7" emissive="#fef3c7" emissiveIntensity={0.5} />
        </mesh>
      ))}

      {/* Tail lights */}
      {[-0.55, 0.55].map((x, i) => (
        <mesh key={i} position={[x, 0.7, -1.26]}>
          <boxGeometry args={[0.1, 0.15, 0.03]} />
          <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.3} />
        </mesh>
      ))}

      {/* Side mirrors */}
      {[-0.75, 0.75].map((x, i) => (
        <group key={i} position={[x, 1.6, 0.4]}>
          <mesh>
            <boxGeometry args={[0.02, 0.1, 0.08]} />
            <meshStandardMaterial color="#1f2937" />
          </mesh>
          <mesh position={[x > 0 ? 0.03 : -0.03, 0, 0]}>
            <boxGeometry args={[0.02, 0.12, 0.1]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.9} roughness={0.1} />
          </mesh>
        </group>
      ))}

      {/* Cargo (pallet with boxes) - always mounted, opacity animated via useFrame */}
      <group ref={cargoTiltRef} position={[0, 0, 1.3]}>
        <group
          ref={cargoRef}
          position={[0, 0.6, 0.7]}
          visible={hasCargo || cargoOpacityRef.current > 0.01}
        >
          {/* Pallet */}
          <mesh castShadow>
            <boxGeometry args={[1, 0.12, 1]} />
            <meshStandardMaterial
              ref={(mat) => {
                if (mat) cargoMaterialsRef.current[0] = mat;
              }}
              color="#a16207"
              roughness={0.8}
              transparent
              opacity={cargoOpacityRef.current}
            />
          </mesh>
          {/* Pallet slats */}
          {[-0.35, 0, 0.35].map((z, i) => (
            <mesh key={i} position={[0, -0.05, z]}>
              <boxGeometry args={[1, 0.02, 0.15]} />
              <meshStandardMaterial
                ref={(mat) => {
                  if (mat) cargoMaterialsRef.current[1 + i] = mat;
                }}
                color="#92400e"
                roughness={0.9}
                transparent
                opacity={cargoOpacityRef.current}
              />
            </mesh>
          ))}
          {/* Stacked boxes */}
          <mesh castShadow position={[0, 0.38, 0]}>
            <boxGeometry args={[0.85, 0.5, 0.85]} />
            <meshStandardMaterial
              ref={(mat) => {
                if (mat) cargoMaterialsRef.current[4] = mat;
              }}
              color="#fef3c7"
              roughness={0.7}
              transparent
              opacity={cargoOpacityRef.current}
            />
          </mesh>
          {/* Box strapping */}
          <mesh position={[0, 0.38, 0.43]}>
            <boxGeometry args={[0.86, 0.05, 0.01]} />
            <meshStandardMaterial
              ref={(mat) => {
                if (mat) cargoMaterialsRef.current[5] = mat;
              }}
              color="#3b82f6"
              transparent
              opacity={cargoOpacityRef.current}
            />
          </mesh>
          <mesh position={[0, 0.38, -0.43]}>
            <boxGeometry args={[0.86, 0.05, 0.01]} />
            <meshStandardMaterial
              ref={(mat) => {
                if (mat) cargoMaterialsRef.current[6] = mat;
              }}
              color="#3b82f6"
              transparent
              opacity={cargoOpacityRef.current}
            />
          </mesh>
        </group>
      </group>
    </group>
  );
};

const DetailedForkliftModel: React.FC<ForkliftModelProps> = (props) => {
  return (
    <Suspense fallback={<ProceduralForklift {...props} />}>
      <GLTFForklift {...props} />
    </Suspense>
  );
};

// Main export. Low keeps the compact fallback. Medium and above use the
// normalized authored vehicle so the default experience has a credible cab,
// mast, tyres, and operator silhouette.
export const ForkliftModel: React.FC<ForkliftModelProps> = (props) => {
  const quality = useGraphicsStore((state) => state.graphics.quality);

  if (quality === 'low') {
    return <CompactForklift {...props} />;
  }

  return <DetailedForkliftModel {...props} />;
};

export default ForkliftModel;
