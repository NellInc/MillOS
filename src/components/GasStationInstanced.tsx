import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { EXTERIOR_LAYERS } from '../constants/renderLayers';
import React, { useRef, useMemo, useLayoutEffect } from 'react';
import { SceneText as Text } from './shared/SceneText';
import { PROCEDURAL_TEXTURES } from '../utils/sharedMaterials';
import { GeneratedBoundary, GeneratedModel } from './models/GeneratedModel';
import { GeneratedBoxSurface, GeneratedSurfaceMesh } from './models/GeneratedGeometrySurface';

// ============================================================================
// Shared surface textures
// ============================================================================
// `Texture.clone()` shares `.source`, so these cost a sampler binding and no
// extra upload. The procedural albedo generators are sRGB-tagged
// (`createColorDataTexture`), so a mesh carrying `tarmacColor` takes a white
// tint - a dark hex would multiply the same hue twice and crush the surface.
const cloneTiled = (source: THREE.Texture, x: number, y: number): THREE.Texture => {
  const texture = source.clone();
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(x, y);
  return texture;
};
const FORECOURT_MAP = cloneTiled(PROCEDURAL_TEXTURES.tarmacColor, 10, 7);
const FORECOURT_ROUGHNESS = cloneTiled(PROCEDURAL_TEXTURES.tarmacRoughness, 10, 7);
const SHOP_WALL_NORMAL = cloneTiled(PROCEDURAL_TEXTURES.panelNormal, 3, 2);
const SHOP_WALL_ROUGHNESS = cloneTiled(PROCEDURAL_TEXTURES.concreteRoughness, 3, 2);
const SHOP_WALL_NORMAL_SCALE = new THREE.Vector2(0.14, 0.14);
// Rendered blockwork: no albedo map, so the call sites keep their own `color`.
const SHOP_WALL_SURFACE = {
  roughness: 0.85,
  normalMap: SHOP_WALL_NORMAL,
  normalScale: SHOP_WALL_NORMAL_SCALE,
  roughnessMap: SHOP_WALL_ROUGHNESS,
} as const;

// ============================================================================
// Source palette and procedural maps remain authoritative.
const STATION_WALL_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#e0e0e0',
  ...SHOP_WALL_SURFACE,
});
const STATION_ROOF_MATERIAL = new THREE.MeshStandardMaterial({ color: '#b71c1c', roughness: 0.5 });
const STATION_POLE_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#757575',
  roughness: 0.5,
  metalness: 0.3,
});
const STATION_CABINET_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#fff3e0',
  roughness: 0.5,
});
// Designed forecourt geometry
// ============================================================================
// Every geometry in this section is module-level and drawn either through an
// InstancedMesh or as the station's one pylon, so its vertex count is a one-off
// scene cost at any instance count. No mesh in this file carries pointer
// handlers or a custom raycast, so none of them needs the picking proxy the
// corrugated silo shell does (`raycastSiloShell`, machines/CompactMachines.tsx).
//
// Profiles were designed and previewed in Blender before being transcribed -
// scripts/blender/specs/gas-station.json, run through
// scripts/blender/machine_part_preview.py. The numbers below are the ones that
// were looked at, not a retyped approximation.

/**
 * Forecourt canopy column.
 *
 * Rendered 0.5 m across and 5 m tall, four of them at (+/-6, 2.5, +/-4). The
 * previous `CylinderGeometry(0.25, 0.25, 5, 16)` was a bare tube - right
 * diameter, no story. A clad forecourt pillar has three features this profile
 * now carries, and all three survive the 11 m the pumps are seen from:
 *
 *  - a 940 mm kick skirt at full width, the scuff sleeve every real forecourt
 *    column wears. The apron plane sits at y=0.08, so 860 mm of it shows.
 *  - a chamfer and collar stepping down onto a slimmer 360 mm clad shaft. That
 *    step is what makes the skirt read as a base instead of as a ring; the
 *    first draft kept a 398 mm shaft and previewed as a dumbbell.
 *  - a conical haunch spreading back to full width at y=4.32 and holding it to
 *    y=4.40, the underside of the canopy fascia (a 0.4 m band centred on 4.6).
 *    Above 4.40 the column is inside the fascia box and invisible, so the
 *    profile spends nothing up there beyond a neck and a stub. Meeting the
 *    soffit exactly is safe here because what arrives at 4.40 is the capital's
 *    vertical wall - an edge contact, not a coplanar face. Contrast the pylon
 *    below, whose shoe ends in a horizontal annulus and so has to finish 60 mm
 *    inside the cabinet rather than flush with it.
 *
 * Envelope unchanged: max radius 0.25, y in [-2.5, 2.5], so the four instance
 * positions and the canopy slab above them need no retuning.
 *
 * The 16 segments are unchanged as well. They were raised from 8 for a
 * facet-chord reason that still holds, and re-bumping them would be a density
 * change wearing a design's clothes - the slimmer shaft improves the chord on
 * its own, from 98 mm to 70 mm. 17 x 14 = 238 vertices, shared by all four.
 */
function createCanopyColumnGeometry(): THREE.LatheGeometry {
  const profile = [
    new THREE.Vector2(0.0, -2.5), // underside cap centre, at apron level
    new THREE.Vector2(0.25, -2.5), // skirt rim - envelope max radius
    new THREE.Vector2(0.25, -1.56), // kick skirt top, 940 mm up
    new THREE.Vector2(0.236, -1.48), // skirt cap chamfer
    new THREE.Vector2(0.198, -1.43), // shoulder
    new THREE.Vector2(0.198, -1.36), // collar band
    new THREE.Vector2(0.18, -1.3), // step onto the clad shaft
    new THREE.Vector2(0.18, 1.24), // clad shaft, 360 mm across
    new THREE.Vector2(0.194, 1.32), // haunch springs
    new THREE.Vector2(0.25, 1.82), // haunch back to full width (world y 4.32)
    new THREE.Vector2(0.25, 1.9), // capital edge at the fascia soffit (4.40)
    new THREE.Vector2(0.205, 1.96), // neck into the fascia
    new THREE.Vector2(0.205, 2.5), // stub buried in the canopy slab
    new THREE.Vector2(0.0, 2.5),
  ];
  return new THREE.LatheGeometry(profile, 16);
}

/**
 * Dead Dino pylon sign pole.
 *
 * 8 m tall, carrying a 4 x 5 m cabinet whose underside is at y=4.70. Only the
 * bottom 4.70 m is ever visible - everything above that is inside the cabinet
 * box - and the previous `CylinderGeometry(0.15, 0.15, 8, 16)` spent that whole
 * visible run as one unbroken 300 mm pipe.
 *
 * A pylon reads by hierarchy, not by thickness:
 *  - a 1.12 m ground shroud at full width, the only move large enough to
 *    survive the 20-60 m this sign is actually read from;
 *  - a conical transition and collar onto a shaft that tapers 232 -> 208 mm
 *    over its run, so the pole looks carried rather than extruded;
 *  - a 340 mm mounting shoe flaring to 264 mm just under the cabinet and
 *    running 60 mm up inside it, so the shoe's top annulus is hidden instead of
 *    landing coplanar with the cabinet's underside and z-fighting it.
 *
 * Envelope unchanged: max radius 0.15, y in [-4, 4] about the mesh's y=4, so
 * the cabinet, borders and both dino logos above it stay exactly where they are.
 * 16 segments unchanged; the narrower shaft takes the facet chord from 59 mm to
 * 45 mm on its own. One singleton mesh: 17 x 14 = 238 vertices, once.
 */
function createSignPoleGeometry(): THREE.LatheGeometry {
  const profile = [
    new THREE.Vector2(0.0, -4.0), // base cap centre, at apron level
    new THREE.Vector2(0.15, -4.0), // shroud rim - envelope max radius
    new THREE.Vector2(0.15, -2.88), // shroud wall, 1.12 m tall
    new THREE.Vector2(0.144, -2.8), // shroud cap chamfer
    new THREE.Vector2(0.12, -2.62), // conical transition onto the shaft
    new THREE.Vector2(0.12, -2.48), // base collar band
    new THREE.Vector2(0.116, -2.4), // weld step onto the shaft
    new THREE.Vector2(0.104, 0.22), // tapered shaft, 232 -> 208 mm
    new THREE.Vector2(0.102, 0.34), // under the mounting shoe
    new THREE.Vector2(0.132, 0.42), // shoe flare (world y 4.42)
    new THREE.Vector2(0.132, 0.76), // shoe top, 60 mm inside the cabinet
    new THREE.Vector2(0.092, 0.8), // step onto the stub
    new THREE.Vector2(0.092, 4.0), // stub inside the cabinet
    new THREE.Vector2(0.0, 4.0),
  ];
  return new THREE.LatheGeometry(profile, 16);
}

/**
 * Fuel nozzle spout.
 *
 * 120 mm long. The old `CylinderGeometry(0.015, 0.012, 0.12, 6)` was a barely
 * tapered stub; a real spout is mostly a slim barrel with two collars that do
 * all the reading:
 *
 *  - an 18.4 mm barrel with a rolled lip at the tip;
 *  - a splash sleeve stepping up behind it;
 *  - a full-width 30 mm vapour-recovery boot at the handle end, then the boss.
 *
 * Kept at 6 sides on purpose. Rendering the identical profile at 12 segments
 * was indistinguishable at 0.45 m (the closest a first-person camera gets) and
 * cost 2.01 mm of envelope: three.js puts lathe vertices ON the circle, so a
 * hexagon's z half-extent is 0.866r while any multiple of 4 gives r. Six holds
 * max radius 0.015 and y in [-0.06, 0.06] exactly.
 *
 * 7 x 12 = 84 vertices, shared across the four pumps.
 */
function createNozzleSpoutGeometry(): THREE.LatheGeometry {
  const profile = [
    new THREE.Vector2(0.0, -0.06), // tip cap centre
    new THREE.Vector2(0.0084, -0.06), // tip bore lip
    new THREE.Vector2(0.0104, -0.057), // rolled tip flare
    new THREE.Vector2(0.0092, -0.053), // back off the roll
    new THREE.Vector2(0.0092, -0.013), // barrel, 18.4 mm across
    new THREE.Vector2(0.011, -0.008), // step up to the splash sleeve
    new THREE.Vector2(0.011, 0.009), // splash sleeve
    new THREE.Vector2(0.015, 0.015), // vapour boot rim - envelope max radius
    new THREE.Vector2(0.015, 0.034), // boot band
    new THREE.Vector2(0.0126, 0.041), // shoulder onto the boss
    new THREE.Vector2(0.0126, 0.06), // boss at the handle face
    new THREE.Vector2(0.0, 0.06),
  ];
  return new THREE.LatheGeometry(profile, 6);
}

/**
 * Hose swivel at the pump - a hex union nut, and hexagonal on purpose.
 *
 * The old `CylinderGeometry(0.035, 0.035, 0.06, 6)` was already six-sided by
 * accident. A union nut genuinely is a hexagon, so the six sides stay and the
 * budget goes into the profile instead: a flange washer against the pump skin,
 * a chamfer onto 26 mm of wrench flat, a chamfer off it, and a 56 mm crimped
 * ferrule that swallows the 50 mm hose. Holding 6 also keeps the envelope
 * exactly - max radius 0.035, y in [-0.03, 0.03] - for the same
 * inscribed-polygon reason as the spout.
 *
 * 7 x 9 = 63 vertices, shared across the four pumps.
 */
function createHoseSwivelGeometry(): THREE.LatheGeometry {
  const profile = [
    new THREE.Vector2(0.0, -0.03), // pump-face cap centre
    new THREE.Vector2(0.03, -0.03), // flange washer rim
    new THREE.Vector2(0.03, -0.0245), // washer edge
    new THREE.Vector2(0.0262, -0.02), // chamfer up onto the nut
    new THREE.Vector2(0.035, -0.014), // flats begin - envelope max radius
    new THREE.Vector2(0.035, 0.012), // 26 mm of wrench flat
    new THREE.Vector2(0.028, 0.0225), // chamfer off the flats
    new THREE.Vector2(0.028, 0.03), // crimped ferrule at the hose
    new THREE.Vector2(0.0, 0.03),
  ];
  return new THREE.LatheGeometry(profile, 6);
}

// ---------------------------------------------------------------------------
// Pump hose: a drape, not a rod.
// ---------------------------------------------------------------------------
// The old hose was `CylinderGeometry(0.025, 0.025, 0.6, 6)` - a rigid stick.
// Worse, as placed it met nothing at either end: its upper end sat at
// (y 0.776, z 1.283) while the swivel it was meant to leave was at
// (y 0.55, z 1.25), so it hung 226 mm off nothing and speared straight through
// the nozzle-holder box on the way down.
//
// A hanging hose is a plane curve, which `LatheGeometry` cannot express but a
// torus arc can, and a torus arc has closed-form endpoints - so the fit is
// checked by arithmetic rather than by eye. The arc is fitted to run from the
// swivel's ferrule mouth to the top face of the nozzle handle:
//
//   start (ring angle 0)          -> y 0.5501, z 1.3400  (ferrule mouth 1.35)
//   end   (ring angle HOSE_ARC)   -> y 0.3201, z 1.5301  (handle top 1.5278)
//
// A deeper droop was tried and rejected by measurement, not taste: past ~120
// degrees the arc swings back inboard far enough to re-enter the nozzle-holder
// box (world z 1.20-1.30). At 110 degrees the hose clears the holder face by
// 8.5 mm and the pump island by 94 mm, with 350 mm of hose over a 298 mm span.
//
// This is the one part here whose envelope deliberately changes - it is a
// different curve, not a reshaped rod. The only things that position it are the
// four matrices in `pumpHoseData` below, in this file, updated in the same
// change; nothing outside this module references the hose geometry.
//
// 9 x 21 = 189 vertices, shared across the four pumps.
const HOSE_ARC_RADIUS = 0.18209;
const HOSE_ARC = 1.91986; // 110 degrees of sweep
const HOSE_ARC_START = 2.87233; // 164.573 degrees - puts ring angle 0 on the swivel
const HOSE_CENTRE_Y = 0.50166;
const HOSE_CENTRE_Z = 1.51556; // mirrored to -Z for the back-to-back pump
// The shaped spout's rear shoulder must meet the rotated handle rather than
// merely overlap it in elevation. At the old 0.750 m offset their transformed
// bounds left a measured 5.24 mm air gap. 0.7448 closes that gap without
// changing the hose, swivel, handle, or pump envelopes.
const NOZZLE_SPOUT_Z_OFFSET = 0.7448;
// The one placement change here, and it is forced: at the old 0.35 the swivel
// sat at z=1.25 entirely inside the opaque nozzle-holder box (world z
// 1.20-1.30, y 0.35-0.85), so its shape was never drawn at all and the hose had
// nowhere visible to start. 0.42 puts it 50 mm proud of the holder face with
// the flange still tucked 10 mm inside, so there is no gap to see through.
const SWIVEL_Z_OFFSET = 0.42;

// The old z=0.30 buried the X inside the head (radius 0.45). The head surface
// at the eye centre reaches z=0.412. This exposes the glyph's front face,
// preserving the existing silhouette and geometry budget.
// Reproduced by scripts/blender/dino_sign_preview.py with matched ray probes.
export const DINO_EYE_FRONT_Z = 0.445;

// Small edge radii catch the light without changing pump clearance or layout.
// These shared meshes replace boxes, adding no objects or material instances.
export const createFuelPumpBodyGeometry = (): RoundedBoxGeometry =>
  new RoundedBoxGeometry(0.6, 1.6, 0.5, 1, 0.035);
export const createPumpIslandGeometry = (): RoundedBoxGeometry =>
  new RoundedBoxGeometry(10, 0.2, 3, 1, 0.08);

// ============================================================================
// Module-level shared geometries (singleton instances)
// ============================================================================
const GEOMETRIES = {
  pumpBody: createFuelPumpBodyGeometry(),
  pumpIsland: createPumpIslandGeometry(),
  pumpCap: new RoundedBoxGeometry(0.7, 0.2, 0.6, 1, 0.035),
  shelfProduct: new THREE.BoxGeometry(0.15, 0.25, 0.2),
  drinkBottle: new THREE.CylinderGeometry(0.1, 0.1, 0.4, 8),
  canopyColumn: createCanopyColumnGeometry(),
  signPole: createSignPoleGeometry(),
  magazine: new THREE.BoxGeometry(0.6, 0.35, 0.02),
  // Pump hose/handle geometries
  hoseSegment: new THREE.TorusGeometry(HOSE_ARC_RADIUS, 0.025, 8, 20, HOSE_ARC),
  nozzleHandle: new THREE.BoxGeometry(0.06, 0.15, 0.04),
  nozzleSpout: createNozzleSpoutGeometry(),
  hoseConnector: createHoseSwivelGeometry(),
};

// ============================================================================
// Module-level shared materials (singleton instances with vertexColors)
// ============================================================================
const MATERIALS = {
  shelfProduct: new THREE.MeshStandardMaterial({
    color: '#ffffff', // White base - instance colors will tint this
    roughness: 0.3,
    metalness: 0.1,
  }),
  drinkBottle: new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.15,
    metalness: 0.05,
    transparent: true,
    opacity: 0.85,
  }),
  canopyColumn: new THREE.MeshStandardMaterial({
    color: '#9e9e9e',
    roughness: 0.4,
    metalness: 0.3,
  }),
  magazine: new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.4,
  }),
  // Pump hose/handle materials
  hose: new THREE.MeshStandardMaterial({
    color: '#1a1a1a',
    roughness: 0.8,
    // The hose is a torus ARC, and three.js does not cap an arc's two ends the
    // way CylinderGeometry capped the rod this replaced. Both mouths are seated
    // into neighbours but neither is fully swallowed - the handle mouth is a
    // 50 mm ring whose centre sits only 1.6 mm under the handle's top face, so
    // about half of it stands proud. DoubleSide shows the tube's inner wall
    // there instead of a see-through backface. Four small instances; the culling
    // saving given up is nil.
    side: THREE.DoubleSide,
  }),
  nozzleMetal: new THREE.MeshStandardMaterial({
    color: '#2d2d2d',
    roughness: 0.4,
    metalness: 0.6,
  }),
  nozzleGrip: new THREE.MeshStandardMaterial({
    color: '#1565c0', // Blue grip (could also be green/red for fuel types)
    roughness: 0.6,
  }),
};

// ============================================================================
// Color definitions - bright, saturated retail product colors
// ============================================================================
const SHELF_PRODUCT_COLORS = ['#ff1744', '#ffea00', '#00e676', '#2979ff', '#d500f9']; // Vivid red, yellow, green, blue, purple
const DRINK_BOTTLE_COLORS = ['#ff1744', '#00e676', '#ff9100', '#00b0ff']; // Red, green, orange, cyan
const MAGAZINE_COLORS = ['#ff5252', '#448aff', '#ffff00']; // Red, blue, bright yellow

// ============================================================================
// Instanced Gas Station Component
// ============================================================================
interface GasStationProps {
  position?: [number, number, number];
  rotation?: number;
}

// The GLB retains the exact shell. Screens, holders, hoses and nozzles stay live.
const FuelPumpShell = () => (
  <GeneratedBoundary
    fallback={
      <>
        <mesh position={[0, 0.9, 0]} geometry={GEOMETRIES.pumpBody} castShadow>
          <meshStandardMaterial color="#ffffff" roughness={0.5} />
        </mesh>
        <mesh position={[0, 1.8, 0]} geometry={GEOMETRIES.pumpCap} castShadow>
          <meshStandardMaterial color="#e65100" roughness={0.5} />
        </mesh>
      </>
    }
  >
    <group position={[0, 0.1, 0]}>
      <GeneratedModel asset="fuelPumpShell" />
    </group>
  </GeneratedBoundary>
);

export const GasStation = React.memo<GasStationProps>(
  ({ position = [-85, 0, 140], rotation = 0 }) => {
    // Refs for instanced meshes
    const shelfProductsRef = useRef<THREE.InstancedMesh>(null);
    const drinkBottlesRef = useRef<THREE.InstancedMesh>(null);
    const magazinesRef = useRef<THREE.InstancedMesh>(null);
    // Pump hose/nozzle refs (4 pumps total)
    const hoseSegmentsRef = useRef<THREE.InstancedMesh>(null);
    const hoseConnectorsRef = useRef<THREE.InstancedMesh>(null);
    const nozzleHandlesRef = useRef<THREE.InstancedMesh>(null);
    const nozzleSpoutsRef = useRef<THREE.InstancedMesh>(null);

    // Pre-compute shelf product positions and colors (3 shelves x 5 products = 15)
    const shelfProductData = useMemo(() => {
      const positions: [number, number, number][] = [];
      const colors: THREE.Color[] = [];

      // Shop interior offset: [-12, 0, 0] relative to gas station
      // Shelf unit offset: [-3, 0, 0] relative to interior
      // Combined: [-15, 0, 0] relative to gas station center
      const baseX = -15 + 0.35; // -12 (interior) + -3 (shelf) + 0.35 (product offset)
      const shelfYValues = [0.9, 1.7, 2.5]; // Three shelf heights
      const zPositions = [-2, -1, 0, 1, 2]; // 5 products per shelf

      shelfYValues.forEach((y) => {
        zPositions.forEach((zIdx, prodIdx) => {
          positions.push([baseX, y + 0.15, zIdx * 0.9]);
          colors.push(new THREE.Color(SHELF_PRODUCT_COLORS[prodIdx]));
        });
      });

      return { positions, colors };
    }, []);

    // Pre-compute drink bottle positions and colors (4 columns x 3 rows = 12)
    const drinkBottleData = useMemo(() => {
      const positions: [number, number, number][] = [];
      const colors: THREE.Color[] = [];

      // Shop interior offset: [-12, 0, 0]
      // Fridge offset: [0, 0, -4]
      // Combined: [-12, 0, -4] relative to gas station center
      const baseX = -12;
      const baseZ = -4 + 0.1; // Fridge z + offset
      const xPositions = [-1.2, -0.4, 0.4, 1.2]; // 4 columns
      const yPositions = [0.6, 1.5, 2.4]; // 3 rows

      xPositions.forEach((x, colIdx) => {
        yPositions.forEach((y) => {
          positions.push([baseX + x, y, baseZ]);
          colors.push(new THREE.Color(DRINK_BOTTLE_COLORS[colIdx]));
        });
      });

      return { positions, colors };
    }, []);

    // Pre-compute canopy column positions (4 columns)
    const canopyColumnData = useMemo(() => {
      const positions: [number, number, number][] = [
        [-6, 2.5, -4],
        [-6, 2.5, 4],
        [6, 2.5, -4],
        [6, 2.5, 4],
      ];
      return { positions };
    }, []);

    // Pre-compute magazine positions and colors (3 magazines)
    const magazineData = useMemo(() => {
      const positions: [number, number, number][] = [];
      const rotations: THREE.Euler[] = [];
      const colors: THREE.Color[] = [];

      // Shop interior offset: [-12, 0, 0]
      // Magazine rack offset: [1.5, 0, 3]
      // Combined: [-10.5, 0, 3] relative to gas station center
      const baseX = -10.5;
      const baseZ = 3 + 0.22; // rack z + offset
      const yOffsets = [0, 0.3, 0.6];

      yOffsets.forEach((yOffset, i) => {
        positions.push([baseX, 0.2 + yOffset * 0.5, baseZ]);
        rotations.push(new THREE.Euler(0.3, 0, 0));
        colors.push(new THREE.Color(MAGAZINE_COLORS[i]));
      });

      return { positions, rotations, colors };
    }, []);

    // Pre-compute pump hose/nozzle positions (4 pumps: 2 pairs back-to-back)
    const pumpHoseData = useMemo(() => {
      const hoseMatrices: THREE.Matrix4[] = [];
      const connectorMatrices: THREE.Matrix4[] = [];
      const handleMatrices: THREE.Matrix4[] = [];
      const spoutMatrices: THREE.Matrix4[] = [];

      const matrix = new THREE.Matrix4();
      const quaternion = new THREE.Quaternion();
      const scale = new THREE.Vector3(1, 1, 1);
      const pos = new THREE.Vector3();

      // New layout: pump pairs at x = -3 and +3, each pair back-to-back at z = ±0.9
      const pairXPositions = [-3, 3];

      pairXPositions.forEach((pairX) => {
        // Pump facing +Z (at z=0.9, rotated 90° around Y)
        // Hose drapes out toward +Z.
        const plusZPumpZ = 0.9;
        // THREE.Euler 'XYZ' composes Rx*Ry*Rz, so this spins the torus about
        // its own axis by HOSE_ARC_START first and then stands the ring up in
        // the YZ plane. Ring angle a then lands at
        // (y = centreY + R*sin(a + start), z = centreZ + R*cos(a + start)).
        pos.set(pairX, HOSE_CENTRE_Y, HOSE_CENTRE_Z);
        quaternion.setFromEuler(new THREE.Euler(0, -Math.PI / 2, HOSE_ARC_START));
        matrix.compose(pos, quaternion, scale);
        hoseMatrices.push(matrix.clone());

        // +Y of the swivel is its ferrule, so it has to point away from the
        // pump. This was a plain cylinder before and symmetric either way.
        pos.set(pairX, 0.55, plusZPumpZ + SWIVEL_Z_OFFSET);
        quaternion.setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
        matrix.compose(pos, quaternion, scale);
        connectorMatrices.push(matrix.clone());

        pos.set(pairX, 0.25, plusZPumpZ + 0.65);
        quaternion.setFromEuler(new THREE.Euler(-0.3, 0, 0));
        matrix.compose(pos, quaternion, scale);
        handleMatrices.push(matrix.clone());

        pos.set(pairX, 0.15, plusZPumpZ + NOZZLE_SPOUT_Z_OFFSET);
        quaternion.setFromEuler(new THREE.Euler(-0.8, 0, 0));
        matrix.compose(pos, quaternion, scale);
        spoutMatrices.push(matrix.clone());

        // Pump facing -Z (at z=-0.9, rotated -90° around Y)
        // Hose drapes out toward -Z: the same arc with +PI/2 about Y, which
        // mirrors z and leaves y alone.
        const minusZPumpZ = -0.9;
        pos.set(pairX, HOSE_CENTRE_Y, -HOSE_CENTRE_Z);
        quaternion.setFromEuler(new THREE.Euler(0, Math.PI / 2, HOSE_ARC_START));
        matrix.compose(pos, quaternion, scale);
        hoseMatrices.push(matrix.clone());

        pos.set(pairX, 0.55, minusZPumpZ - SWIVEL_Z_OFFSET);
        quaternion.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
        matrix.compose(pos, quaternion, scale);
        connectorMatrices.push(matrix.clone());

        pos.set(pairX, 0.25, minusZPumpZ - 0.65);
        quaternion.setFromEuler(new THREE.Euler(0.3, 0, 0));
        matrix.compose(pos, quaternion, scale);
        handleMatrices.push(matrix.clone());

        pos.set(pairX, 0.15, minusZPumpZ - NOZZLE_SPOUT_Z_OFFSET);
        quaternion.setFromEuler(new THREE.Euler(0.8, 0, 0));
        matrix.compose(pos, quaternion, scale);
        spoutMatrices.push(matrix.clone());
      });

      return { hoseMatrices, connectorMatrices, handleMatrices, spoutMatrices };
    }, []);

    // Instance writes run in layout effects and recompute bounds: three caches an
    // InstancedMesh's bounding sphere the first time it is frustum-tested and never
    // invalidates it, so a sphere taken from identity matrices culls the goods
    // and hoses whenever the island centre leaves the frame.

    // Initialize shelf products
    useLayoutEffect(() => {
      if (!shelfProductsRef.current) return;

      const matrix = new THREE.Matrix4();
      shelfProductData.positions.forEach((pos, i) => {
        matrix.setPosition(pos[0], pos[1], pos[2]);
        shelfProductsRef.current!.setMatrixAt(i, matrix);
        shelfProductsRef.current!.setColorAt(i, shelfProductData.colors[i]);
      });
      shelfProductsRef.current.instanceMatrix.needsUpdate = true;
      shelfProductsRef.current.computeBoundingBox();
      shelfProductsRef.current.computeBoundingSphere();
      if (shelfProductsRef.current.instanceColor) {
        shelfProductsRef.current.instanceColor.needsUpdate = true;
      }
    }, [shelfProductData]);

    // Initialize drink bottles
    useLayoutEffect(() => {
      if (!drinkBottlesRef.current) return;

      const matrix = new THREE.Matrix4();
      drinkBottleData.positions.forEach((pos, i) => {
        matrix.setPosition(pos[0], pos[1], pos[2]);
        drinkBottlesRef.current!.setMatrixAt(i, matrix);
        drinkBottlesRef.current!.setColorAt(i, drinkBottleData.colors[i]);
      });
      drinkBottlesRef.current.instanceMatrix.needsUpdate = true;
      drinkBottlesRef.current.computeBoundingBox();
      drinkBottlesRef.current.computeBoundingSphere();
      if (drinkBottlesRef.current.instanceColor) {
        drinkBottlesRef.current.instanceColor.needsUpdate = true;
      }
    }, [drinkBottleData]);

    // Initialize magazines
    useLayoutEffect(() => {
      if (!magazinesRef.current) return;

      const matrix = new THREE.Matrix4();
      const quaternion = new THREE.Quaternion();
      const scale = new THREE.Vector3(1, 1, 1);
      const posVec = new THREE.Vector3();

      magazineData.positions.forEach((pos, i) => {
        quaternion.setFromEuler(magazineData.rotations[i]);
        posVec.set(pos[0], pos[1], pos[2]);
        matrix.compose(posVec, quaternion, scale);
        magazinesRef.current!.setMatrixAt(i, matrix);
        magazinesRef.current!.setColorAt(i, magazineData.colors[i]);
      });
      magazinesRef.current.instanceMatrix.needsUpdate = true;
      magazinesRef.current.computeBoundingBox();
      magazinesRef.current.computeBoundingSphere();
      if (magazinesRef.current.instanceColor) {
        magazinesRef.current.instanceColor.needsUpdate = true;
      }
    }, [magazineData]);

    // Initialize pump hoses and nozzles
    useLayoutEffect(() => {
      // Hose segments
      if (hoseSegmentsRef.current) {
        pumpHoseData.hoseMatrices.forEach((m, i) => {
          hoseSegmentsRef.current!.setMatrixAt(i, m);
        });
        hoseSegmentsRef.current.instanceMatrix.needsUpdate = true;
        hoseSegmentsRef.current.computeBoundingBox();
        hoseSegmentsRef.current.computeBoundingSphere();
      }
      // Connectors
      if (hoseConnectorsRef.current) {
        pumpHoseData.connectorMatrices.forEach((m, i) => {
          hoseConnectorsRef.current!.setMatrixAt(i, m);
        });
        hoseConnectorsRef.current.instanceMatrix.needsUpdate = true;
        hoseConnectorsRef.current.computeBoundingBox();
        hoseConnectorsRef.current.computeBoundingSphere();
      }
      // Handles
      if (nozzleHandlesRef.current) {
        pumpHoseData.handleMatrices.forEach((m, i) => {
          nozzleHandlesRef.current!.setMatrixAt(i, m);
        });
        nozzleHandlesRef.current.instanceMatrix.needsUpdate = true;
        nozzleHandlesRef.current.computeBoundingBox();
        nozzleHandlesRef.current.computeBoundingSphere();
      }
      // Spouts
      if (nozzleSpoutsRef.current) {
        pumpHoseData.spoutMatrices.forEach((m, i) => {
          nozzleSpoutsRef.current!.setMatrixAt(i, m);
        });
        nozzleSpoutsRef.current.instanceMatrix.needsUpdate = true;
        nozzleSpoutsRef.current.computeBoundingBox();
        nozzleSpoutsRef.current.computeBoundingSphere();
      }
    }, [pumpHoseData]);

    return (
      <group position={position} rotation={[0, rotation, 0]}>
        {/* ========== STATION BUILDING ========== */}
        <group position={[-12, 0, 0]}>
          {/* Back wall (solid) */}
          <GeneratedBoxSurface
            asset="stationWallUnit"
            size={[0.2, 5, 10]}
            material={STATION_WALL_MATERIAL}
            position={[-3.9, 2.5, 0]}
            castShadow
            receiveShadow
          />
          {/* Left side wall (solid) */}
          <GeneratedBoxSurface
            asset="stationWallUnit"
            size={[8, 5, 0.2]}
            material={STATION_WALL_MATERIAL}
            position={[0, 2.5, -4.9]}
            castShadow
            receiveShadow
          />
          {/* Right side wall (with door opening) - top section */}
          <GeneratedBoxSurface
            asset="stationWallUnit"
            size={[8, 2, 0.2]}
            material={STATION_WALL_MATERIAL}
            position={[0, 4, 4.9]}
            castShadow
            receiveShadow
          />
          {/* Right side wall - left of door */}
          <GeneratedBoxSurface
            asset="stationWallUnit"
            size={[2.5, 3, 0.2]}
            material={STATION_WALL_MATERIAL}
            position={[-2.65, 1.5, 4.9]}
            castShadow
            receiveShadow
          />
          {/* Right side wall - right of door */}
          <GeneratedBoxSurface
            asset="stationWallUnit"
            size={[2.5, 3, 0.2]}
            material={STATION_WALL_MATERIAL}
            position={[2.65, 1.5, 4.9]}
            castShadow
            receiveShadow
          />
          {/* Front wall - large glass window section (transparent) */}
          <mesh position={[3.9, 2.5, 0]}>
            <boxGeometry args={[0.2, 5, 10]} />
            <meshStandardMaterial
              color="#81d4fa"
              transparent
              opacity={0.3}
              metalness={0.4}
              roughness={0.1}
              side={2}
            />
          </mesh>
        </group>

        {/* Building roof */}
        <GeneratedBoxSurface
          asset="stationRoofUnit"
          size={[9, 0.5, 11]}
          material={STATION_ROOF_MATERIAL}
          position={[-12, 5.3, 0]}
          castShadow
        />

        {/* Door */}
        <mesh position={[-12, 1.2, 5]}>
          <planeGeometry args={[1.2, 2.4]} />
          <meshStandardMaterial color="#424242" roughness={0.7} side={2} />
        </mesh>

        {/* ========== SHOP INTERIOR (visible through window) ========== */}
        <group position={[-12, 0, 0]}>
          {/* Interior floor - checkered tiles */}
          <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[7.5, 9.5]} />
            <meshStandardMaterial color="#e8e8e8" roughness={0.8} />
          </mesh>

          {/* Checkout counter near window */}
          <group position={[3, 0, -1]}>
            <GeneratedBoundary
              fallback={
                <>
                  {/* Counter base */}
                  <mesh position={[0, 0.5, 0]} castShadow>
                    <boxGeometry args={[1.5, 1, 2.5]} />
                    <meshStandardMaterial color="#5d4037" roughness={0.7} />
                  </mesh>
                  {/* Counter top */}
                  <mesh position={[0, 1.02, 0]} castShadow>
                    <boxGeometry args={[1.6, 0.05, 2.6]} />
                    <meshStandardMaterial color="#37474f" roughness={0.4} metalness={0.3} />
                  </mesh>
                </>
              }
            >
              <GeneratedModel asset="stationCounter" receiveShadow={false} />
            </GeneratedBoundary>
            <GeneratedBoundary
              fallback={
                <>
                  {/* Cash register */}
                  <mesh position={[0, 1.25, 0]} castShadow>
                    <boxGeometry args={[0.5, 0.4, 0.4]} />
                    <meshStandardMaterial color="#212121" roughness={0.5} />
                  </mesh>
                </>
              }
            >
              <group position={[0, 1.05, 0]}>
                <GeneratedModel asset="stationRegister" receiveShadow={false} />
              </group>
            </GeneratedBoundary>
            {/* Register screen */}
            <mesh position={[0.26, 1.35, 0]} rotation={[0, 0, 0.2]}>
              <planeGeometry args={[0.3, 0.2]} />
              <meshBasicMaterial color="#4fc3f7" />
            </mesh>
            <GeneratedBoundary
              fallback={
                <>
                  {/* Card reader */}
                  <mesh position={[0, 1.1, 0.6]} castShadow>
                    <boxGeometry args={[0.15, 0.08, 0.2]} />
                    <meshStandardMaterial color="#37474f" roughness={0.5} />
                  </mesh>
                </>
              }
            >
              <group position={[0, 1.06, 0.6]}>
                <GeneratedModel asset="stationCardReader" receiveShadow={false} />
              </group>
            </GeneratedBoundary>
          </group>

          {/* Product shelves - back wall */}
          <group position={[-3, 0, 0]}>
            <GeneratedBoundary
              fallback={
                <>
                  {/* Shelf unit frame */}
                  <mesh position={[0, 2, 0]} castShadow>
                    <boxGeometry args={[0.3, 4, 6]} />
                    <meshStandardMaterial color="#5d4037" roughness={0.8} />
                  </mesh>
                  {/* Shelves */}
                  {[0.8, 1.6, 2.4, 3.2].map((y, i) => (
                    <mesh key={`shelf-${i}`} position={[0.2, y, 0]} castShadow>
                      <boxGeometry args={[0.6, 0.08, 5.5]} />
                      <meshStandardMaterial color="#8d6e63" roughness={0.7} />
                    </mesh>
                  ))}
                </>
              }
            >
              <group position={[0.175, 0, 0]}>
                <GeneratedModel asset="stationShelving" receiveShadow={false} />
              </group>
            </GeneratedBoundary>
          </group>

          {/* Refrigerated drinks cabinet - side wall */}
          <group position={[0, 0, -4]}>
            <GeneratedBoundary
              fallback={
                <>
                  {/* Cabinet frame */}
                  <mesh position={[0, 1.5, 0]} castShadow>
                    <boxGeometry args={[4, 3, 0.8]} />
                    <meshStandardMaterial color="#37474f" roughness={0.5} metalness={0.3} />
                  </mesh>
                </>
              }
            >
              <GeneratedModel asset="stationDrinksCabinet" receiveShadow={false} />
            </GeneratedBoundary>
            {/* Glass front */}
            <mesh position={[0, 1.5, 0.41]}>
              <boxGeometry args={[3.8, 2.8, 0.02]} />
              <meshStandardMaterial color="#b3e5fc" transparent opacity={0.4} roughness={0.1} />
            </mesh>
          </group>

          {/* Coffee machine */}
          <group position={[2, 0, -3.5]}>
            <GeneratedBoundary
              fallback={
                <>
                  <mesh position={[0, 1.1, 0]} castShadow>
                    <boxGeometry args={[0.8, 2.2, 0.6]} />
                    <meshStandardMaterial color="#212121" roughness={0.4} metalness={0.4} />
                  </mesh>
                  {/* Cup dispenser */}
                  <mesh position={[0, 0.3, 0.35]} castShadow>
                    <cylinderGeometry args={[0.15, 0.12, 0.3, 12]} />
                    <meshStandardMaterial color="#424242" roughness={0.5} />
                  </mesh>
                </>
              }
            >
              <group position={[0, 0, 0.1]}>
                <GeneratedModel asset="stationCoffeeMachine" receiveShadow={false} />
              </group>
            </GeneratedBoundary>
            {/* Coffee display panel */}
            <mesh position={[0.41, 1.5, 0]} rotation={[0, Math.PI / 2, 0]}>
              <planeGeometry args={[0.4, 0.5]} />
              <meshBasicMaterial color="#4caf50" />
            </mesh>
          </group>

          {/* Slushie machine - Dead Dino branded! */}
          <group position={[2, 0, -2]}>
            <GeneratedBoundary
              fallback={
                <mesh position={[0, 0.9, 0]} castShadow>
                  <boxGeometry args={[0.7, 1.8, 0.5]} />
                  <meshStandardMaterial color="#e65100" roughness={0.4} />
                </mesh>
              }
            >
              <GeneratedModel asset="stationSlushieMachine" receiveShadow={false} />
            </GeneratedBoundary>
            {/* Slushie tanks */}
            {[-0.15, 0.15].map((x, i) => (
              <mesh key={`slush-${i}`} position={[x, 1.3, 0.1]} castShadow>
                <cylinderGeometry args={[0.12, 0.12, 0.6, 12]} />
                <meshStandardMaterial
                  color={i === 0 ? '#e53935' : '#2196f3'}
                  transparent
                  opacity={0.7}
                  roughness={0.2}
                />
              </mesh>
            ))}
            {/* "SLUSH" label */}
            <mesh position={[0.36, 0.5, 0]} rotation={[0, Math.PI / 2, 0]}>
              <planeGeometry args={[0.3, 0.3]} />
              <meshBasicMaterial color="#fff3e0" />
            </mesh>
          </group>

          {/* Hot dog roller grill */}
          <group position={[2, 0, -0.5]}>
            <GeneratedBoundary
              fallback={
                <mesh position={[0, 0.9, 0]} castShadow>
                  <boxGeometry args={[0.6, 0.4, 0.5]} />
                  <meshStandardMaterial color="#9e9e9e" roughness={0.4} metalness={0.5} />
                </mesh>
              }
            >
              <group position={[0, 0.7, 0]}>
                <GeneratedModel asset="stationGrill" receiveShadow={false} />
              </group>
            </GeneratedBoundary>
            {/* Hot dogs */}
            {[-0.15, 0, 0.15].map((z, i) => (
              <mesh
                key={`hotdog-${i}`}
                position={[0, 1.15, z]}
                rotation={[0, 0, Math.PI / 2]}
                castShadow
              >
                <cylinderGeometry args={[0.04, 0.04, 0.4, 8]} />
                <meshStandardMaterial color="#c97a5d" roughness={0.6} />
              </mesh>
            ))}
            {/* Glass cover */}
            <mesh position={[0, 1.25, 0]}>
              <boxGeometry args={[0.55, 0.25, 0.45]} />
              <meshStandardMaterial color="#e3f2fd" transparent opacity={0.3} roughness={0.1} />
            </mesh>
          </group>

          {/* Magazine/newspaper rack near door */}
          <group position={[1.5, 0, 3]}>
            <GeneratedBoundary
              fallback={
                <mesh position={[0, 0.6, 0]} castShadow>
                  <boxGeometry args={[0.8, 1.2, 0.4]} />
                  <meshStandardMaterial color="#5d4037" roughness={0.8} />
                </mesh>
              }
            >
              <GeneratedModel asset="stationMagazineRack" receiveShadow={false} />
            </GeneratedBoundary>
          </group>

          {/* Interior ceiling light */}
          <mesh position={[0, 4.5, 0]}>
            <boxGeometry args={[1.5, 0.1, 1.5]} />
            <meshBasicMaterial color="#fff9c4" />
          </mesh>
        </group>

        {/* ========== CANOPY STRUCTURE ========== */}
        <GeneratedBoundary
          fallback={
            <>
              {/* Canopy roof */}
              <mesh position={[0, 5, 0]} castShadow>
                <boxGeometry args={[16, 0.4, 12]} />
                <meshStandardMaterial color="#f5f5f5" roughness={0.4} />
              </mesh>
              {/* Canopy fascia with Dead Dino orange brand color */}
              <mesh position={[0, 4.6, 0]}>
                <boxGeometry args={[16.5, 0.4, 12.5]} />
                <meshStandardMaterial color="#e65100" roughness={0.5} />
              </mesh>
              <instancedMesh
                args={[GEOMETRIES.canopyColumn, MATERIALS.canopyColumn, 4]}
                castShadow
                onUpdate={(mesh) => {
                  const matrix = new THREE.Matrix4();
                  canopyColumnData.positions.forEach((pos, i) => {
                    matrix.setPosition(...pos);
                    mesh.setMatrixAt(i, matrix);
                  });
                  mesh.instanceMatrix.needsUpdate = true;
                }}
              />
            </>
          }
        >
          <GeneratedModel asset="stationCanopy" />
        </GeneratedBoundary>

        {/* ========== FUEL PUMPS (back-to-back, line toward shop) ========== */}
        {/* Single island running along X axis toward shop */}
        <mesh position={[0, 0.1, 0]} geometry={GEOMETRIES.pumpIsland} receiveShadow>
          <meshStandardMaterial color="#616161" roughness={0.8} />
        </mesh>

        {/* Pump pairs at x=-3 and x=+3, back-to-back facing +Z and -Z */}
        {[-3, 3].map((x) => (
          <group key={`pump-pair-${x}`} position={[x, 0, 0]}>
            {/* Pump facing +Z (serves vehicles on +Z side) - screen & nozzle face outward */}
            <group position={[0, 0, 0.9]} rotation={[0, -Math.PI / 2, 0]}>
              <FuelPumpShell />
              {/* Screen */}
              <mesh position={[0.31, 1.1, 0]} rotation={[0, Math.PI / 2, 0]}>
                <planeGeometry args={[0.3, 0.4]} />
                <meshBasicMaterial color="#000000" />
              </mesh>
              {/* Nozzle holder */}
              <mesh position={[0.35, 0.6, 0]} castShadow>
                <boxGeometry args={[0.1, 0.5, 0.4]} />
                <meshStandardMaterial color="#212121" roughness={0.6} />
              </mesh>
            </group>

            {/* Pump facing -Z (serves vehicles on -Z side) - screen & nozzle face outward */}
            <group position={[0, 0, -0.9]} rotation={[0, Math.PI / 2, 0]}>
              <FuelPumpShell />
              {/* Screen */}
              <mesh position={[0.31, 1.1, 0]} rotation={[0, Math.PI / 2, 0]}>
                <planeGeometry args={[0.3, 0.4]} />
                <meshBasicMaterial color="#000000" />
              </mesh>
              {/* Nozzle holder */}
              <mesh position={[0.35, 0.6, 0]} castShadow>
                <boxGeometry args={[0.1, 0.5, 0.4]} />
                <meshStandardMaterial color="#212121" roughness={0.6} />
              </mesh>
            </group>
          </group>
        ))}

        {/* ========== DEAD DINO SIGN ========== */}
        <group position={[10, 0, 0]}>
          {/* Sign pole - see createSignPoleGeometry. Ground shroud, tapered
              shaft and a mounting shoe under the cabinet, still 16 sides and
              still radius 0.15 by y +/-4, so everything stacked above is
              untouched. */}
          <GeneratedSurfaceMesh
            asset="stationSignPoleUnit"
            geometry={GEOMETRIES.signPole}
            material={STATION_POLE_MATERIAL}
            position={[0, 4, 0]}
            castShadow
          />
          {/* Sign cabinet.
              THE FIELD AND THE FRAME WERE THE WRONG WAY ROUND. The orange was
              the 4 x 5 carcass and the cream was a 3.7 x 4.7 panel laid over
              it, which leaves 150 mm of orange showing as a rim: the comment
              said "orange for fun retro gas station vibe" and the sign rendered
              as a white board with a thin red edge. Swapped, so the large area
              is the brand colour and the cream is a 150 mm keyline.

              It also fixes a second fault that is not about layout. These are
              inline materials inside `FactoryExterior`'s batch root, so they
              take their finish from `resolveBatchSurfaceProfile`, which is
              blind to colour by construction and can only answer `masonry` or
              `painted`. `painted`'s macro and meso terms are authored for
              cladding and read as grey cloud on a 3.7 x 4.7 m flat panel - on
              the `forecourt` review camera the sign face was visibly grubby.
              A saturated field carries that modulation as honest weathering
              instead of as dirt on white. The real lever - letting a call site
              name the profile a BATCHED material should take, so this could ask
              for `signage` - does not exist yet; this is the third site to want
              it (see the thatch note in `utils/worldSurface.ts` and the
              outbuilding roofs in the `masonry` profile). */}
          <GeneratedBoxSurface
            asset="stationSignCabinetUnit"
            size={[4, 5, 0.3]}
            material={STATION_CABINET_MATERIAL}
            position={[0, 7.2, 0]}
            castShadow
          />
          {/* Brand field - front. Lifted from #e65100: that decodes to a deep
              rust which, once the batcher's `painted` mottling is on it, read as
              a weathered brown board rather than a forecourt sign. */}
          <mesh position={[0, 7.2, 0.16]}>
            <boxGeometry args={[3.7, 4.7, 0.02]} />
            <meshStandardMaterial color="#f57c1f" roughness={0.5} />
          </mesh>
          {/* Brand field - back */}
          <mesh position={[0, 7.2, -0.16]}>
            <boxGeometry args={[3.7, 4.7, 0.02]} />
            <meshStandardMaterial color="#f57c1f" roughness={0.5} />
          </mesh>

          {/* Cute Dead Dino Logo - FRONT */}
          <group position={[0, 7.8, 0.25]}>
            <GeneratedBoundary
              fallback={
                <group>
                  {/* Dino body - chubby oval */}
                  <mesh position={[0, 0, 0]} castShadow>
                    <sphereGeometry args={[0.7, 16, 12]} />
                    <meshStandardMaterial color="#4caf50" roughness={0.6} />
                  </mesh>
                  {/* NO BELLY SPHERE, deliberately.
                A 0.45 m pale sphere at z +0.3 - straight at the reader - punched
                a light disc through the middle of the logo; moving it to the
                flank at z 0 only made the disc smaller, because a lighter sphere
                nested inside a darker one of similar radius protrudes wherever
                the outer one is thinnest. On a PYLON SIGN read at 20-60 m the
                logo has to work as a silhouette, and an internal highlight is
                the one thing that cannot. Both captures are in
                test-results/art-review/defects{,-final}/sign-zoom.png. The
                cuteness lives in the X eyes, the tongue and the stubby limbs,
                all of which survive at distance because they break the outline
                rather than sitting inside it. */}
                  {/* Dino head */}
                  <mesh position={[0.5, 0.5, 0]} castShadow>
                    <sphereGeometry args={[0.45, 14, 12]} />
                    <meshStandardMaterial color="#4caf50" roughness={0.6} />
                  </mesh>
                  {/* Dino snout */}
                  <mesh position={[0.85, 0.4, 0]} castShadow>
                    <sphereGeometry args={[0.25, 12, 10]} />
                    <meshStandardMaterial color="#4caf50" roughness={0.6} />
                  </mesh>
                  {/* X eyes (dead!) - left eye */}
                  <group position={[0.65, 0.6, DINO_EYE_FRONT_Z]}>
                    <mesh rotation={[0, 0, Math.PI / 4]}>
                      <boxGeometry args={[0.18, 0.04, 0.02]} />
                      <meshBasicMaterial color="#212121" />
                    </mesh>
                    <mesh rotation={[0, 0, -Math.PI / 4]}>
                      <boxGeometry args={[0.18, 0.04, 0.02]} />
                      <meshBasicMaterial color="#212121" />
                    </mesh>
                  </group>
                  {/* X eyes - right eye */}
                  <group position={[0.55, 0.6, -0.25]}>
                    <mesh rotation={[0, 0, Math.PI / 4]}>
                      <boxGeometry args={[0.18, 0.04, 0.02]} />
                      <meshBasicMaterial color="#212121" />
                    </mesh>
                    <mesh rotation={[0, 0, -Math.PI / 4]}>
                      <boxGeometry args={[0.18, 0.04, 0.02]} />
                      <meshBasicMaterial color="#212121" />
                    </mesh>
                  </group>
                  {/* Tongue sticking out (cute!) */}
                  <mesh position={[0.95, 0.25, 0.1]} rotation={[0, 0, -0.3]}>
                    <boxGeometry args={[0.15, 0.08, 0.06]} />
                    <meshStandardMaterial color="#f48fb1" roughness={0.4} />
                  </mesh>
                  {/* Tiny arms (T-Rex style) */}
                  <mesh position={[0.25, 0.1, 0.5]} rotation={[0.3, 0.5, 0.2]} castShadow>
                    <capsuleGeometry args={[0.08, 0.2, 4, 8]} />
                    <meshStandardMaterial color="#4caf50" roughness={0.6} />
                  </mesh>
                  <mesh position={[0.25, 0.1, -0.5]} rotation={[-0.3, -0.5, 0.2]} castShadow>
                    <capsuleGeometry args={[0.08, 0.2, 4, 8]} />
                    <meshStandardMaterial color="#4caf50" roughness={0.6} />
                  </mesh>
                  {/* Stubby legs */}
                  <mesh position={[-0.2, -0.6, 0.35]} castShadow>
                    <capsuleGeometry args={[0.12, 0.25, 4, 8]} />
                    <meshStandardMaterial color="#4caf50" roughness={0.6} />
                  </mesh>
                  <mesh position={[-0.2, -0.6, -0.35]} castShadow>
                    <capsuleGeometry args={[0.12, 0.25, 4, 8]} />
                    <meshStandardMaterial color="#4caf50" roughness={0.6} />
                  </mesh>
                  {/* Tail */}
                  <mesh position={[-0.7, -0.1, 0]} rotation={[0, 0, 0.4]} castShadow>
                    <coneGeometry args={[0.2, 0.8, 8]} />
                    <meshStandardMaterial color="#4caf50" roughness={0.6} />
                  </mesh>
                  {/* Back spikes (cute bumps) */}
                  {[-0.3, -0.1, 0.1, 0.3].map((x, i) => (
                    <mesh key={`spike-${i}`} position={[x, 0.65 - Math.abs(x) * 0.3, 0]} castShadow>
                      <coneGeometry args={[0.08, 0.18, 6]} />
                      <meshStandardMaterial color="#81c784" roughness={0.6} />
                    </mesh>
                  ))}
                </group>
              }
            >
              {/* Shallow outward relief keeps the opposite mascot behind the board. */}
              <group position={[0.1224, -0.845, 0.31]} scale={[1, 1, 0.45]}>
                <GeneratedModel asset="dinoMascot" />
              </group>
            </GeneratedBoundary>
          </group>

          {/* Cute Dead Dino Logo - BACK (mirrored).
              THE SIGN HAS TWO OF EVERYTHING, which is worth stating because it
              cost a build to learn: the `forecourt` review camera stands north
              of the forecourt looking south, so what it frames is this face, not
              the front one. A fix applied to the FRONT logo alone changes
              nothing in that capture and looks like the fix failed. */}
          <group position={[0, 7.8, -0.25]} rotation={[0, Math.PI, 0]}>
            <GeneratedBoundary
              fallback={
                <group>
                  {/* Dino body - chubby oval */}
                  <mesh position={[0, 0, 0]} castShadow>
                    <sphereGeometry args={[0.7, 16, 12]} />
                    <meshStandardMaterial color="#4caf50" roughness={0.6} />
                  </mesh>
                  {/* No belly sphere - see the front logo for why. */}
                  {/* Dino head */}
                  <mesh position={[0.5, 0.5, 0]} castShadow>
                    <sphereGeometry args={[0.45, 14, 12]} />
                    <meshStandardMaterial color="#4caf50" roughness={0.6} />
                  </mesh>
                  {/* Dino snout */}
                  <mesh position={[0.85, 0.4, 0]} castShadow>
                    <sphereGeometry args={[0.25, 12, 10]} />
                    <meshStandardMaterial color="#4caf50" roughness={0.6} />
                  </mesh>
                  {/* X eyes (dead!) - left eye */}
                  <group position={[0.65, 0.6, DINO_EYE_FRONT_Z]}>
                    <mesh rotation={[0, 0, Math.PI / 4]}>
                      <boxGeometry args={[0.18, 0.04, 0.02]} />
                      <meshBasicMaterial color="#212121" />
                    </mesh>
                    <mesh rotation={[0, 0, -Math.PI / 4]}>
                      <boxGeometry args={[0.18, 0.04, 0.02]} />
                      <meshBasicMaterial color="#212121" />
                    </mesh>
                  </group>
                  {/* X eyes - right eye */}
                  <group position={[0.55, 0.6, -0.25]}>
                    <mesh rotation={[0, 0, Math.PI / 4]}>
                      <boxGeometry args={[0.18, 0.04, 0.02]} />
                      <meshBasicMaterial color="#212121" />
                    </mesh>
                    <mesh rotation={[0, 0, -Math.PI / 4]}>
                      <boxGeometry args={[0.18, 0.04, 0.02]} />
                      <meshBasicMaterial color="#212121" />
                    </mesh>
                  </group>
                  {/* Tongue sticking out (cute!) */}
                  <mesh position={[0.95, 0.25, 0.1]} rotation={[0, 0, -0.3]}>
                    <boxGeometry args={[0.15, 0.08, 0.06]} />
                    <meshStandardMaterial color="#f48fb1" roughness={0.4} />
                  </mesh>
                  {/* Tiny arms (T-Rex style) */}
                  <mesh position={[0.25, 0.1, 0.5]} rotation={[0.3, 0.5, 0.2]} castShadow>
                    <capsuleGeometry args={[0.08, 0.2, 4, 8]} />
                    <meshStandardMaterial color="#4caf50" roughness={0.6} />
                  </mesh>
                  <mesh position={[0.25, 0.1, -0.5]} rotation={[-0.3, -0.5, 0.2]} castShadow>
                    <capsuleGeometry args={[0.08, 0.2, 4, 8]} />
                    <meshStandardMaterial color="#4caf50" roughness={0.6} />
                  </mesh>
                  {/* Stubby legs */}
                  <mesh position={[-0.2, -0.6, 0.35]} castShadow>
                    <capsuleGeometry args={[0.12, 0.25, 4, 8]} />
                    <meshStandardMaterial color="#4caf50" roughness={0.6} />
                  </mesh>
                  <mesh position={[-0.2, -0.6, -0.35]} castShadow>
                    <capsuleGeometry args={[0.12, 0.25, 4, 8]} />
                    <meshStandardMaterial color="#4caf50" roughness={0.6} />
                  </mesh>
                  {/* Tail */}
                  <mesh position={[-0.7, -0.1, 0]} rotation={[0, 0, 0.4]} castShadow>
                    <coneGeometry args={[0.2, 0.8, 8]} />
                    <meshStandardMaterial color="#4caf50" roughness={0.6} />
                  </mesh>
                  {/* Back spikes (cute bumps) */}
                  {[-0.3, -0.1, 0.1, 0.3].map((x, i) => (
                    <mesh
                      key={`spike-back-${i}`}
                      position={[x, 0.65 - Math.abs(x) * 0.3, 0]}
                      castShadow
                    >
                      <coneGeometry args={[0.08, 0.18, 6]} />
                      <meshStandardMaterial color="#81c784" roughness={0.6} />
                    </mesh>
                  ))}
                </group>
              }
            >
              {/* Shallow outward relief keeps the opposite mascot behind the board. */}
              <group position={[0.1224, -0.845, 0.31]} scale={[1, 1, 0.45]}>
                <GeneratedModel asset="dinoMascot" />
              </group>
            </GeneratedBoundary>
          </group>

          {/* "DEAD" text - front */}
          <Text
            position={[0, 6.5, 0.2]}
            fontSize={0.55}
            color="#212121"
            fontWeight="bold"
            anchorX="center"
            anchorY="middle"
          >
            DEAD
          </Text>
          {/* "DINO" text - front */}
          <Text
            position={[0, 5.9, 0.2]}
            fontSize={0.55}
            color="#212121"
            fontWeight="bold"
            anchorX="center"
            anchorY="middle"
          >
            DINO
          </Text>
          {/* Tagline - front */}
          <Text
            position={[0, 5.35, 0.2]}
            fontSize={0.22}
            // Cream, not the old #5d4037 brown: the field under this text is now
            // the brand orange, and dark brown on #e65100 was the least legible
            // thing on the sign at the 20-60 m this pylon is read from.
            color="#fff3e0"
            anchorX="center"
            anchorY="middle"
            surface="painted"
          >
            Premium Fossil Fuel
          </Text>

          {/* "DEAD" text - back */}
          <Text
            position={[0, 6.5, -0.2]}
            rotation={[0, Math.PI, 0]}
            fontSize={0.55}
            color="#212121"
            fontWeight="bold"
            anchorX="center"
            anchorY="middle"
          >
            DEAD
          </Text>
          {/* "DINO" text - back */}
          <Text
            position={[0, 5.9, -0.2]}
            rotation={[0, Math.PI, 0]}
            fontSize={0.55}
            color="#212121"
            fontWeight="bold"
            anchorX="center"
            anchorY="middle"
          >
            DINO
          </Text>
          {/* Tagline - back */}
          <Text
            position={[0, 5.35, -0.2]}
            rotation={[0, Math.PI, 0]}
            fontSize={0.22}
            // Cream, not the old #5d4037 brown: the field under this text is now
            // the brand orange, and dark brown on #e65100 was the least legible
            // thing on the sign at the 20-60 m this pylon is read from.
            color="#fff3e0"
            anchorX="center"
            anchorY="middle"
            surface="painted"
          >
            Premium Fossil Fuel
          </Text>
        </group>

        {/* Match the current terrain datum. Polygon offset separates the asphalt;
            the obsolete 0.08 datum left the apron floating 10 cm above grass. */}
        <mesh
          position={[0, EXTERIOR_LAYERS.ground, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          receiveShadow
        >
          <planeGeometry args={[20, 14]} />
          <meshStandardMaterial
            color="#ffffff"
            roughness={0.85}
            map={FORECOURT_MAP}
            roughnessMap={FORECOURT_ROUGHNESS}
            polygonOffset
            polygonOffsetFactor={-2}
            polygonOffsetUnits={-2}
          />
        </mesh>

        {/* ========== INSTANCED ELEMENTS ========== */}

        {/* Instanced Shelf Products (15 total: 3 shelves x 5 products) */}
        <instancedMesh
          ref={shelfProductsRef}
          args={[GEOMETRIES.shelfProduct, MATERIALS.shelfProduct, 15]}
          castShadow
        />

        {/* Instanced Drink Bottles (12 total: 4 columns x 3 rows) */}
        <instancedMesh
          ref={drinkBottlesRef}
          args={[GEOMETRIES.drinkBottle, MATERIALS.drinkBottle, 12]}
          castShadow
        />

        {/* Instanced Magazines (3 total) */}
        <instancedMesh
          ref={magazinesRef}
          args={[GEOMETRIES.magazine, MATERIALS.magazine, 3]}
          castShadow
        />

        {/* ========== INSTANCED PUMP HOSES & NOZZLES (4 pumps) ========== */}

        {/* Hose segments */}
        <instancedMesh
          ref={hoseSegmentsRef}
          args={[GEOMETRIES.hoseSegment, MATERIALS.hose, 4]}
          castShadow
        />

        {/* Hose connectors (attach to pump) */}
        <instancedMesh
          ref={hoseConnectorsRef}
          args={[GEOMETRIES.hoseConnector, MATERIALS.nozzleMetal, 4]}
          castShadow
        />

        {/* Nozzle handles (grip) */}
        <instancedMesh
          ref={nozzleHandlesRef}
          args={[GEOMETRIES.nozzleHandle, MATERIALS.nozzleGrip, 4]}
          castShadow
        />

        {/* Nozzle spouts */}
        <instancedMesh
          ref={nozzleSpoutsRef}
          args={[GEOMETRIES.nozzleSpout, MATERIALS.nozzleMetal, 4]}
          castShadow
        />
      </group>
    );
  }
);

GasStation.displayName = 'GasStation';
