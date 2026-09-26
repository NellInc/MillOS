import React, { useRef, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { shouldRunThisFrame } from '../utils/frameThrottle';
import { SceneText as Text } from './shared/SceneText';
import * as THREE from 'three';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import Fireflies from './effects/Fireflies';
import { Cat } from './scenery/Cat';
import {
  InstancedTreeField,
  InstancedGrassClutter,
  InstancedMulch,
  useVegetationDensity,
  type TreeInstance,
  type ClutterSpec,
} from './scenery/InstancedFoliage';
import { WindDriver, WIND_UNIFORMS } from './scenery/WindDriver';
import { HeartParticle } from './effects/HeartParticle';
import { playCritterSound } from '../utils/critterAudio';
import { audioManager } from '../utils/audioManager';
import { PROCEDURAL_TEXTURES } from '../utils/sharedMaterials';
import { InstancedLamps } from './village/InstancedVillageComponents';
import { EXTERIOR_LAYERS, POLYGON_OFFSET } from '../constants/renderLayers';
import {
  GeneratedBody,
  GeneratedBoundary,
  GeneratedModel,
  instanceScale,
  instanceYaw,
} from './models/GeneratedModel';
import { CreatureBody, type CreatureRigHandle } from './models/RiggedCreatureModel';
import { generateCobblestoneRoughness } from '../textures';
import { SITE_LAYOUT } from '../constants/siteLayout';

// ============================================================
// NORTHERN VALLEY VILLAGE
// Lego-style adorable village with colorful buildings
// Position, orientation and scale come from SITE_LAYOUT.landmarks.village.
// Local ground footprint: 70 × 130 metres
// ============================================================

// Color Palette
const COLORS = {
  // Buildings
  cream: '#f5f0e1',
  yellow: '#fef3c7',
  pink: '#fce7e7',
  blue: '#dbeafe',
  terracotta: '#ea8a5e',
  green: '#365314',
  // Roofs
  roofTile: '#c2410c',
  roofSlate: '#475569',
  thatch: '#d4a574',
  // Infrastructure
  cobble: '#6b7280',
  stone: '#a89f91',
  timber: '#3d2d1d',
  grass: '#4a7c59',
  water: '#3b82f6',
};

// Font URL - uses Vite's BASE_URL for correct path at any deployment location
const FONT_URL = `${import.meta.env.BASE_URL}fonts/MedievalSharp.ttf`;

// Hover affordance for the pettable animals, matching every other clickable
// object in the scene.
const setPointerCursor = () => {
  document.body.style.cursor = 'pointer';
};
const resetCursor = () => {
  document.body.style.cursor = 'auto';
};

// Shared materials with procedural textures
// Use OUTDOOR_MATERIALS.grass for consistency with other grass surfaces
import { OUTDOOR_MATERIALS } from '../utils/sharedMaterials';

// Create village-specific cobble textures - UVs in geometry handle tiling
// Clone shared textures (same as farmyard), repeat (1,1) - UV divisor controls stone size
const villageCobbleColor = PROCEDURAL_TEXTURES.cobblestoneColor.clone();
const villageCobbleNormal = PROCEDURAL_TEXTURES.cobblestoneNormal.clone();
// Roughness at 256/7 has the same cell count as the 512/14 albedo, so the
// polished crowns line up with the stones instead of drifting across them.
const villageCobbleRoughness = generateCobblestoneRoughness(256, 7).clone();
villageCobbleColor.wrapS = villageCobbleColor.wrapT = THREE.RepeatWrapping;
villageCobbleNormal.wrapS = villageCobbleNormal.wrapT = THREE.RepeatWrapping;
villageCobbleRoughness.wrapS = villageCobbleRoughness.wrapT = THREE.RepeatWrapping;
villageCobbleColor.repeat.set(1, 1);
villageCobbleNormal.repeat.set(1, 1);
villageCobbleRoughness.repeat.set(1, 1);
villageCobbleColor.needsUpdate = true;
villageCobbleNormal.needsUpdate = true;
villageCobbleRoughness.needsUpdate = true;

// Create roof textures with tiling for building scale (fewer repeats = larger tiles)
const clayTileColor = PROCEDURAL_TEXTURES.clayTilesColor.clone();
const clayTileNormal = PROCEDURAL_TEXTURES.clayTilesNormal.clone();
clayTileColor.wrapS = clayTileColor.wrapT = THREE.RepeatWrapping;
clayTileNormal.wrapS = clayTileNormal.wrapT = THREE.RepeatWrapping;
clayTileColor.repeat.set(1.25, 1.25);
clayTileNormal.repeat.set(1.25, 1.25);

const slateColor = PROCEDURAL_TEXTURES.slateColor.clone();
const slateNormal = PROCEDURAL_TEXTURES.slateNormal.clone();
slateColor.wrapS = slateColor.wrapT = THREE.RepeatWrapping;
slateNormal.wrapS = slateNormal.wrapT = THREE.RepeatWrapping;
slateColor.repeat.set(1.25, 1.25);
slateNormal.repeat.set(1.25, 1.25);

const thatchColor = PROCEDURAL_TEXTURES.thatchColor.clone();
const thatchNormal = PROCEDURAL_TEXTURES.thatchNormal.clone();
thatchColor.wrapS = thatchColor.wrapT = THREE.RepeatWrapping;
thatchNormal.wrapS = thatchNormal.wrapT = THREE.RepeatWrapping;
thatchColor.repeat.set(2, 2);
thatchNormal.repeat.set(2, 2);

// Create wall stucco textures with tiling for building scale
const stuccoColorTex = PROCEDURAL_TEXTURES.stuccoColor.clone();
const stuccoNormalTex = PROCEDURAL_TEXTURES.stuccoNormal.clone();
stuccoColorTex.wrapS = stuccoColorTex.wrapT = THREE.RepeatWrapping;
stuccoNormalTex.wrapS = stuccoNormalTex.wrapT = THREE.RepeatWrapping;
stuccoColorTex.repeat.set(2, 2);
stuccoNormalTex.repeat.set(2, 2);

const SM = {
  grass: OUTDOOR_MATERIALS.grass, // Use shared grass material for seamless matching
  stone: new THREE.MeshStandardMaterial({
    // Untinted: '#a08070' was desaturating a brick map that only looked washed
    // out because it was decoded as linear. The map now carries its own hue.
    color: '#ffffff',
    roughness: 0.85,
    map: PROCEDURAL_TEXTURES.brickColor,
    normalMap: PROCEDURAL_TEXTURES.brickNormal,
    normalScale: new THREE.Vector2(0.3, 0.3),
  }),
  // Half-timbering. The old `PROCEDURAL_TEXTURES.panelNormal` binding is
  // dropped, not replaced: that map's bevel is 0.64 px at 256, below one texel,
  // so the mip chain erases it and at normalScale 0.15 it contributed nothing.
  // Its correct replacement is a sheet-metal panel bevel, which is wrong for
  // oak beams - so the honest fix is no normal map and one less texture fetch.
  timber: new THREE.MeshStandardMaterial({
    color: COLORS.timber,
    roughness: 0.8,
  }),
  // The three roof maps already bake terracotta / slate-grey / straw. Their old
  // tints named the colour the map itself carries, so post-sRGB-decode they
  // multiplied the same hue twice.
  roofTile: new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.7,
    map: clayTileColor,
    normalMap: clayTileNormal,
    normalScale: new THREE.Vector2(0.4, 0.4),
  }),
  roofSlate: new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.5,
    map: slateColor,
    normalMap: slateNormal,
    normalScale: new THREE.Vector2(0.35, 0.35),
  }),
  thatch: new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.95,
    map: thatchColor,
    normalMap: thatchNormal,
    normalScale: new THREE.Vector2(0.5, 0.5),
  }),
  cream: new THREE.MeshStandardMaterial({
    color: COLORS.cream,
    roughness: 0.75,
    map: stuccoColorTex,
    normalMap: stuccoNormalTex,
    normalScale: new THREE.Vector2(0.25, 0.25),
  }),
  yellow: new THREE.MeshStandardMaterial({
    color: COLORS.yellow,
    roughness: 0.75,
    map: stuccoColorTex,
    normalMap: stuccoNormalTex,
    normalScale: new THREE.Vector2(0.25, 0.25),
  }),
  pink: new THREE.MeshStandardMaterial({
    color: COLORS.pink,
    roughness: 0.75,
    map: stuccoColorTex,
    normalMap: stuccoNormalTex,
    normalScale: new THREE.Vector2(0.25, 0.25),
  }),
  blue: new THREE.MeshStandardMaterial({
    color: COLORS.blue,
    roughness: 0.75,
    map: stuccoColorTex,
    normalMap: stuccoNormalTex,
    normalScale: new THREE.Vector2(0.25, 0.25),
  }),
  terracotta: new THREE.MeshStandardMaterial({
    color: COLORS.terracotta,
    roughness: 0.75,
    map: stuccoColorTex,
    normalMap: stuccoNormalTex,
    normalScale: new THREE.Vector2(0.3, 0.3),
  }),
  // Painted timber shutters - inert panel normal dropped (see `timber`).
  shutterGreen: new THREE.MeshStandardMaterial({
    color: COLORS.green,
    roughness: 0.7,
  }),
  // Water is a DIELECTRIC. metalness 0.3 tinted the specular with the albedo
  // and drained the blue; the look lives in roughness and the environment.
  water: new THREE.MeshStandardMaterial({ color: COLORS.water, roughness: 0.2, metalness: 0 }),
  white: new THREE.MeshStandardMaterial({
    color: '#e8e8e8', // Slight tint for white stucco
    roughness: 0.75,
    map: stuccoColorTex,
    normalMap: stuccoNormalTex,
    normalScale: new THREE.Vector2(0.25, 0.25),
  }),
  // Painted ironwork: hinges, lamp posts, window bars, animal eyes. The old
  // `normalMap: PROCEDURAL_TEXTURES.brushedMetal` fed a roughness/metalness/AO
  // pack to the normal decoder, which is a near-constant tilt of about
  // (-0.37, +0.90) across the whole surface - a uniform lighting bias on every
  // one of these parts rather than relief. Dropped; these are all well under
  // 0.25 m, where any tiled detail map mips to a constant anyway.
  black: new THREE.MeshStandardMaterial({
    color: '#1a1a1a',
    roughness: 0.5,
  }),
  red: new THREE.MeshStandardMaterial({ color: '#dc2626', roughness: 0.6 }),
  // Gilded trim: church cross, rose-window tracery, weathervane. F0 0.38, so a
  // genuine CONDUCTOR at metalness 1 (0.6 was the invalid half-metal band).
  // The `roughnessMap` is dropped rather than swapped for the ORM: every
  // consumer is a 0.04-0.3 m member, so a 512 map tiled once over it is below
  // one screen pixel and mips straight to its 0.582 mean. That mean is folded
  // into the authored roughness instead - same result, one less fetch.
  gold: new THREE.MeshStandardMaterial({
    color: '#d4af37',
    roughness: 0.32,
    metalness: 1,
  }),
  windowGlass: new THREE.MeshStandardMaterial({
    color: '#93c5fd',
    emissive: '#000000',
    emissiveIntensity: 0,
    roughness: 0.18,
    metalness: 0,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  }),
  clockFace: new THREE.MeshStandardMaterial({
    color: '#1e293b',
    emissive: '#000000',
    emissiveIntensity: 0,
    roughness: 0.5,
  }),
  // Gilded by day (F0 0.38, CONDUCTOR), repainted near-black at night by the
  // day/night effect below - and a conductor with a 0.01 albedo is a black
  // mirror, so the night state has to flip to metalness 0. Binary either way.
  clockHands: new THREE.MeshStandardMaterial({
    color: '#d4af37',
    roughness: 0.4,
    metalness: 1,
  }),
  // Smoke is particulate matter, not a light source: lit, so it greys into the
  // night sky instead of glowing against it.
  smoke: new THREE.MeshStandardMaterial({
    color: '#9ca3af',
    roughness: 1,
    metalness: 0,
    transparent: true,
    opacity: 0.4,
    depthWrite: false, // soft particle: depth writes cause hard sorting pops
  }),
};

// ===== SKYLINE ROOFS =====
// The church spire, the town hall cupola and the school bell cap are the three
// things in the village that break the treeline, so they are the three that get
// a designed profile rather than a primitive. Each is authored at world scale
// (radius and y are already metres) and each holds the exact envelope of the
// cone it replaces, because every one of them is positioned against a
// hand-tuned neighbour: the spire base is flush with the 4 m tower, the cupola
// eave overhangs the clock tower by 1.6 m, the bell cap overhangs the belfry
// beam by 0.4 m. Max radius and the y range are load-bearing numbers.
//
// All three buildings are singletons, so these vertices are a one-off scene
// cost (1078 across the three - 207 + 700 + 171, the counts three.js reports
// for these LatheGeometries) rather than a per-instance one, and none of the
// three meshes - nor any group above them, up to `authored-village-site` -
// carries a pointer handler, so none needs the picking proxy the corrugated
// silo shell does.

/**
 * Church spire - 4 m across, 6 m tall, carried to 19 m on the tower.
 *
 * A broach spire, not a cone. Bottom to top: a near-vertical 180 mm stone
 * capping course at the rim (a hard shadow line where the slate meets the
 * masonry), a sharp 250 mm break into the splayed skirt, then the long taper
 * carrying about 3.5% entasis - a convex swell peaking around a third of the
 * way up, which is what stops a tall spire reading as sagging inward. It closes
 * with a necking, an astragal ring, a ball finial and a spike that runs up
 * inside the gold cross above it.
 *
 * Eight sides is the design, not a budget: a broach spire IS octagonal, and at
 * this size the hips read as slate arrises running base to finial rather than
 * as facets on a circle. Verified in Blender at 19 m and at 9 m.
 *
 * Envelope preserved from ConeGeometry(2, 6, 16): max radius 2.0 on both x and
 * z (the 0 deg and 90 deg vertices), y from -3 to +3. Drift 0.00 mm.
 */
function createChurchSpireGeometry(): THREE.LatheGeometry {
  const profile = [
    new THREE.Vector2(0.0, -3.0), // underside cap centre
    new THREE.Vector2(2.0, -3.0), // rim - envelope max radius, flush with the tower
    new THREE.Vector2(1.99, -2.82), // capping course, near vertical
    new THREE.Vector2(1.74, -2.66), // hard break: the skirt springs
    new THREE.Vector2(1.585, -2.3), // splayed skirt
    new THREE.Vector2(1.404, -1.6), // taper with entasis from here up
    new THREE.Vector2(1.119, -0.6),
    new THREE.Vector2(0.788, 0.45),
    new THREE.Vector2(0.507, 1.3),
    new THREE.Vector2(0.355, 1.75),
    new THREE.Vector2(0.25, 2.06), // necking
    new THREE.Vector2(0.215, 2.2), // neck waist
    new THREE.Vector2(0.33, 2.28), // astragal ring, under-flare
    new THREE.Vector2(0.335, 2.37), // astragal top
    new THREE.Vector2(0.19, 2.43), // tuck in below the finial
    new THREE.Vector2(0.27, 2.5),
    new THREE.Vector2(0.3, 2.58), // ball equator
    new THREE.Vector2(0.26, 2.67),
    new THREE.Vector2(0.145, 2.75), // ball top
    new THREE.Vector2(0.08, 2.82), // spike
    new THREE.Vector2(0.055, 2.92), // enters the cross shaft here
    new THREE.Vector2(0.045, 3.0), // envelope max y
    new THREE.Vector2(0.0, 3.0),
  ];
  return new THREE.LatheGeometry(profile, 8);
}

const CHURCH_SPIRE = createChurchSpireGeometry();

/**
 * Town hall clock tower cupola - 7.2 m across, 4 m tall, top at 18 m.
 *
 * An ogee cupola (a welsche Haube), which is the civic answer to the church's
 * spire and deliberately not another one. It overhangs the 4 m box tower by
 * 1.6 m, so its eave underside is what you see from the square below: that gets
 * a 100 mm fascia band and a hard kick where the roof turns off the rim. Above
 * the kick a short convex dome shoulder rolls over at y = -0.46 into a long
 * concave sweep - the ogee inflection is the whole silhouette - and the crown
 * is a real one: necking, projecting cornice, a straight lantern drum, a second
 * cornice, then a fat ball and spike sized to still read at 40 m.
 *
 * Round where the spire is faceted, because a lead-covered dome is round. 24
 * segments: at 20 m the between-vertex inset is 31 mm, about a pixel, and 32
 * segments were indistinguishable in the Blender A/B for 224 more vertices.
 *
 * Envelope preserved from ConeGeometry(3.6, 4, 16): max radius 3.6, y from -2
 * to +2, so the 1.6 m overhang and the eave line are unmoved. Drift 0.00 mm.
 */
function createTownHallCupolaGeometry(): THREE.LatheGeometry {
  const profile = [
    new THREE.Vector2(0.0, -2.0), // eave underside centre
    new THREE.Vector2(3.6, -2.0), // eave rim - envelope max radius
    new THREE.Vector2(3.56, -1.9), // fascia band, near vertical
    new THREE.Vector2(3.3, -1.78), // eave kick
    new THREE.Vector2(3.16, -1.6), // convex dome shoulder
    new THREE.Vector2(2.92, -1.36),
    new THREE.Vector2(2.58, -1.08),
    new THREE.Vector2(2.16, -0.78),
    new THREE.Vector2(1.68, -0.46), // ogee inflection - steepest point
    new THREE.Vector2(1.24, -0.14), // concave sweep from here up
    new THREE.Vector2(0.9, 0.16),
    new THREE.Vector2(0.64, 0.42),
    new THREE.Vector2(0.46, 0.64),
    new THREE.Vector2(0.36, 0.8),
    new THREE.Vector2(0.32, 0.9), // necking
    new THREE.Vector2(0.3, 0.99), // neck waist
    new THREE.Vector2(0.52, 1.07), // lantern cornice, projecting
    new THREE.Vector2(0.5, 1.15), // lantern drum base
    new THREE.Vector2(0.5, 1.42), // lantern drum top
    new THREE.Vector2(0.55, 1.48), // upper cornice
    new THREE.Vector2(0.4, 1.55), // lantern cap rolls in
    new THREE.Vector2(0.26, 1.6),
    new THREE.Vector2(0.42, 1.7), // ball equator
    new THREE.Vector2(0.36, 1.81),
    new THREE.Vector2(0.2, 1.89), // ball top
    new THREE.Vector2(0.1, 1.95), // spike
    new THREE.Vector2(0.06, 2.0), // envelope max y
    new THREE.Vector2(0.0, 2.0),
  ];
  return new THREE.LatheGeometry(profile, 24);
}

const TOWNHALL_CUPOLA = createTownHallCupolaGeometry();

/**
 * School bell-tower cap - 2.8 m across, 2 m tall, skylined at 12.5 m.
 *
 * A cupola cap over the open belfry frame, and octagonal on purpose: the frame
 * below it is a square of four posts, and an octagon springing from a square is
 * the canonical belfry transition - the hips land on the posts and on the beam
 * midpoints. It overhangs the 2 m beam by 0.4 m, so it gets a 120 mm boarded
 * fascia and an eave kick like the town hall, then a bell-cast concave sweep
 * (steep off the eave, easing as it rises), a necking, a cornice ring and a
 * ball finial sized to still be a ball rather than a bump at 18 m.
 *
 * The eight sides cost nothing visually: in the Blender A/B against the same
 * profile lathed at 16 segments the two were indistinguishable at 18 m, and the
 * octagon is a little over half the vertices (171 against 323).
 *
 * Envelope preserved from ConeGeometry(1.4, 2, 16): max radius 1.4 on both x
 * and z, y from -1 to +1, so the cap still sits exactly on the beam at 10.5 m
 * with its 0.4 m overhang. Drift 0.00 mm.
 */
function createSchoolBellCapGeometry(): THREE.LatheGeometry {
  const profile = [
    new THREE.Vector2(0.0, -1.0), // eave underside centre
    new THREE.Vector2(1.4, -1.0), // eave rim - envelope max radius
    new THREE.Vector2(1.39, -0.88), // boarded fascia, near vertical
    new THREE.Vector2(1.16, -0.76), // eave kick
    new THREE.Vector2(0.94, -0.5), // bell-cast sweep, steep off the eave
    new THREE.Vector2(0.72, -0.2),
    new THREE.Vector2(0.5, 0.14),
    new THREE.Vector2(0.33, 0.42),
    new THREE.Vector2(0.26, 0.52),
    new THREE.Vector2(0.2, 0.6), // necking
    new THREE.Vector2(0.32, 0.66), // cornice ring, under-flare
    new THREE.Vector2(0.325, 0.73), // cornice top
    new THREE.Vector2(0.185, 0.78), // tuck in below the finial
    new THREE.Vector2(0.255, 0.845),
    new THREE.Vector2(0.275, 0.9), // ball equator
    new THREE.Vector2(0.22, 0.955),
    new THREE.Vector2(0.105, 0.985), // ball top
    new THREE.Vector2(0.045, 1.0), // envelope max y
    new THREE.Vector2(0.0, 1.0),
  ];
  return new THREE.LatheGeometry(profile, 8);
}

const SCHOOL_BELL_CAP = createSchoolBellCapGeometry();

// ===== CHIMNEY SMOKE =====
// Shared geometry; the materials are per-chimney because opacity is animated
// per puff and a module-level singleton would make every chimney in the
// village pulse in lockstep.
const smokePuffGeometry = new THREE.SphereGeometry(0.3, 8, 6);
const _smokeQ = new THREE.Quaternion();

/**
 * Three rising puffs per chimney.
 *
 * The animation used to be commented out for a perf test, which left three
 * COINCIDENT grey spheres frozen over every roof - visibly worse than no
 * smoke at all. Re-enabled behind the shared 1-in-3 frame throttle: at ~20 Hz
 * a drifting puff is indistinguishable from a 60 Hz one.
 */
const ChimneySmoke: React.FC<{ position: [number, number, number]; offset?: number }> = ({
  position,
  offset = 0,
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const smokeRefs = useRef<(THREE.Mesh | null)[]>([]);
  // The world wind direction expressed in this chimney's local frame. Each
  // building is yawed to face the street, so a fixed local axis would send the
  // plumes on the two sides of the street in opposite directions.
  const driftRef = useRef<THREE.Vector3 | null>(null);
  const materials = useMemo(() => [SM.smoke.clone(), SM.smoke.clone(), SM.smoke.clone()], []);

  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);

  useFrame((state) => {
    if (!shouldRunThisFrame(3)) return;
    if (!driftRef.current && groupRef.current) {
      // getWorldQuaternion updates the ancestor matrices itself, so this is
      // correct on the first frame. The chimney never moves after mount.
      groupRef.current.getWorldQuaternion(_smokeQ).invert();
      const { value: windDir } = WIND_UNIFORMS.uWindDir;
      driftRef.current = new THREE.Vector3(windDir.x, 0, windDir.y).applyQuaternion(_smokeQ);
    }
    const drift = driftRef.current;
    const time = state.clock.elapsedTime + offset;
    for (let i = 0; i < smokeRefs.current.length; i++) {
      const mesh = smokeRefs.current[i];
      if (!mesh) continue;
      const phase = (time * 0.5 + i * 0.67) % 2;
      mesh.position.y = phase * 2;
      // Drift downwind (the foliage's WIND_UNIFORMS direction) as it rises.
      const d = phase * phase * 0.35;
      mesh.position.x = drift ? d * drift.x : d;
      mesh.position.z = drift ? d * drift.z : 0;
      mesh.scale.setScalar(0.3 + phase * 0.45);
      materials[i].opacity = Math.max(0, 0.42 - phase * 0.21);
    }
  });

  return (
    <group ref={groupRef} position={position}>
      {[0, 1, 2].map((i) => (
        <mesh
          key={i}
          ref={(el) => {
            smokeRefs.current[i] = el;
          }}
          geometry={smokePuffGeometry}
          material={materials[i]}
        />
      ))}
    </group>
  );
};

// ===== COTTAGE =====
const CottagePrimitiveBody = React.memo<{
  wallColor?: keyof typeof SM;
  roofType?: 'tile' | 'thatch' | 'slate';
  hasGarden?: boolean;
}>(({ wallColor = 'cream', roofType = 'tile', hasGarden = true }) => {
  const wallMat = SM[wallColor] || SM.cream;
  const roofMat =
    roofType === 'thatch' ? SM.thatch : roofType === 'slate' ? SM.roofSlate : SM.roofTile;

  return (
    <group>
      {/* Main building */}
      <mesh position={[0, 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[5, 4, 4]} />
        <primitive object={wallMat} attach="material" />
      </mesh>
      {/* Cute cone roof - Lego style */}
      <mesh position={[0, 5.5, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[4, 3, 4]} />
        <primitive object={roofMat} attach="material" />
      </mesh>
      {/* Chimney */}
      <mesh position={[1.5, 6, 0]} castShadow>
        <boxGeometry args={[0.6, 1.5, 0.6]} />
        <primitive object={SM.stone} attach="material" />
      </mesh>
      {/* Door */}
      <mesh position={[0, 1.2, 2.01]}>
        <boxGeometry args={[1, 2.2, 0.1]} />
        <primitive object={SM.timber} attach="material" />
      </mesh>
      {/* Windows */}
      {[
        [-1.5, 2.5],
        [1.5, 2.5],
      ].map(([x, y], i) => (
        <group key={i} position={[x, y, 2.01]}>
          <mesh userData={{ dynamic: true }}>
            <boxGeometry args={[0.8, 1, 0.05]} />
            <primitive object={SM.windowGlass} attach="material" />
          </mesh>
          <mesh position={[0, 0, 0.03]}>
            <boxGeometry args={[0.1, 1.1, 0.02]} />
            <primitive object={SM.white} attach="material" />
          </mesh>
          <mesh position={[0, 0, 0.03]}>
            <boxGeometry args={[0.9, 0.1, 0.02]} />
            <primitive object={SM.white} attach="material" />
          </mesh>
        </group>
      ))}
      {/* Shutters */}
      {[
        [-2, 2.5],
        [2, 2.5],
      ].map(([x, y], i) => (
        <mesh key={`shutter-${i}`} position={[x, y, 2.01]}>
          <boxGeometry args={[0.25, 1, 0.05]} />
          <primitive object={SM.shutterGreen} attach="material" />
        </mesh>
      ))}
      {/* Flower boxes - under windows (split to avoid door) */}
      {[-1.5, 1.5].map((x, i) => (
        <group key={`flowerbox-${i}`} position={[x, 1.8, 2.1]}>
          <mesh castShadow>
            <boxGeometry args={[1, 0.2, 0.3]} />
            <primitive object={SM.timber} attach="material" />
          </mesh>
          {/* Flowers */}
          {[-0.3, 0, 0.3].map((off, j) => (
            <mesh key={`flower-${j}`} position={[off, 0.25, 0]} castShadow>
              <sphereGeometry args={[0.12, 8, 8]} />
              <meshStandardMaterial
                color={['#f472b6', '#fbbf24', '#f87171'][(i + j) % 3]}
                roughness={0.8}
              />
            </mesh>
          ))}
        </group>
      ))}
      {/* Garden fence */}
      {hasGarden && (
        <group position={[0, 0, 4]}>
          {[-2, 0, 2].map((x, i) => (
            <mesh key={i} position={[x, 0.4, 0]} castShadow>
              <boxGeometry args={[2, 0.8, 0.1]} />
              <primitive object={SM.white} attach="material" />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
});
CottagePrimitiveBody.displayName = 'CottagePrimitiveBody';

/**
 * `wallColor` and `roofType` no longer select a variant: there is one generated
 * cottage, and every instance wears it. The props stay because the primitive
 * fallback still honours them and because the call sites read better naming the
 * house they asked for - but a village of six identical cottages is a real cost
 * of this swap, and the fix is more generations rather than a colour tint,
 * which on a baked albedo washes the whole building.
 */
export const Cottage = React.memo<{
  position: [number, number, number];
  rotation?: number;
  wallColor?: keyof typeof SM;
  roofType?: 'tile' | 'thatch' | 'slate';
  hasGarden?: boolean;
}>(({ position, rotation = 0, wallColor = 'cream', roofType = 'tile', hasGarden = true }) => (
  // Yaw and scale jitter on the WRAPPER, so the chimney below moves with the
  // roof it stands on and the primitive fallback varies identically.
  <group
    position={position}
    rotation={[0, rotation + instanceYaw(position), 0]}
    scale={instanceScale(position)}
  >
    <GeneratedBody
      asset="cottage"
      fallback={
        <CottagePrimitiveBody wallColor={wallColor} roofType={roofType} hasGarden={hasGarden} />
      }
    />
    {/* Hoisted out of the body so one chimney smokes on either path. Seated on
        the generated cottage's ridge (4.33 m) rather than the primitive's 7 m
        one; the phase is still deterministic from the cottage's own position,
        because Math.random() here re-rolled the smoke on every remount and
        defeated memoisation. */}
    <ChimneySmoke position={[1.2, 4.6, 0]} offset={position[0] * 0.31 + position[2] * 0.17} />
  </group>
));
Cottage.displayName = 'Cottage';

// ===== SHOP BUILDING =====
const ShopBuildingPrimitiveBody = React.memo<{
  wallColor?: keyof typeof SM;
  signText?: string;
  awningColor?: string;
}>(({ wallColor = 'yellow', signText = 'SHOP', awningColor = '#dc2626' }) => {
  const wallMat = SM[wallColor] || SM.yellow;

  return (
    <group>
      {/* Main building */}
      <mesh position={[0, 2.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[6, 5, 5]} />
        <primitive object={wallMat} attach="material" />
      </mesh>
      {/* Pyramid roof */}
      <mesh position={[0, 6.5, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[5, 3, 4]} />
        <primitive object={SM.roofTile} attach="material" />
      </mesh>
      {/* Shop window - resized and moved to avoid door */}
      <mesh position={[1.2, 1.5, 2.6]} userData={{ dynamic: true }}>
        <boxGeometry args={[2.8, 2.5, 0.1]} />
        <primitive object={SM.windowGlass} attach="material" />
      </mesh>
      {/* Door */}
      <mesh position={[-2, 1.2, 2.6]}>
        <boxGeometry args={[1, 2.2, 0.1]} />
        <primitive object={SM.timber} attach="material" />
      </mesh>
      {/* Awning */}
      <mesh position={[0, 3.2, 3.5]} rotation={[0.4, 0, 0]} castShadow>
        <boxGeometry args={[5.5, 0.1, 2]} />
        <meshStandardMaterial color={awningColor} roughness={0.7} />
      </mesh>
      {/* Sign */}
      <Text
        position={[0, 4.5, 2.6]}
        fontSize={0.5}
        color="#1e293b"
        anchorX="center"
        anchorY="middle"
        font={FONT_URL}
      >
        {signText}
      </Text>
    </group>
  );
});
ShopBuildingPrimitiveBody.displayName = 'ShopBuildingPrimitiveBody';

const ShopBuilding = React.memo<{
  position: [number, number, number];
  rotation?: number;
  wallColor?: keyof typeof SM;
  signText?: string;
  awningColor?: string;
}>(({ position, rotation = 0, wallColor, signText, awningColor }) => (
  <group
    position={position}
    rotation={[0, rotation + instanceYaw(position), 0]}
    scale={instanceScale(position)}
  >
    <GeneratedBody
      asset="shop"
      fallback={
        <ShopBuildingPrimitiveBody
          wallColor={wallColor}
          signText={signText}
          awningColor={awningColor}
        />
      }
    />
  </group>
));
ShopBuilding.displayName = 'ShopBuilding';

// ===== CHURCH =====
const ChurchBuildingPrimitiveBody = React.memo<{ isNight?: boolean }>(({ isNight = false }) => (
  <group>
    {/* Main nave */}
    <mesh position={[0, 4, 0]} castShadow receiveShadow>
      <boxGeometry args={[10, 8, 12]} />
      <primitive object={SM.stone} attach="material" />
    </mesh>
    {/* Pyramid roof */}
    <mesh position={[0, 10, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
      <coneGeometry args={[9, 4, 4]} />
      <primitive object={SM.roofSlate} attach="material" />
    </mesh>
    {/* Tower */}
    <mesh position={[0, 8, -5]} castShadow>
      <boxGeometry args={[4, 10, 4]} />
      <primitive object={SM.stone} attach="material" />
    </mesh>
    {/* Broach spire - see createChurchSpireGeometry. Capping course, skirt
        break, entasis, astragal and ball finial, on eight slate hips. */}
    <mesh position={[0, 16, -5]} castShadow>
      <primitive object={CHURCH_SPIRE} attach="geometry" />
      <primitive object={SM.roofSlate} attach="material" />
    </mesh>
    {/* Cross on spire */}
    <group position={[0, 19.5, -5]}>
      <mesh>
        <boxGeometry args={[0.15, 1.2, 0.15]} />
        <primitive object={SM.gold} attach="material" />
      </mesh>
      <mesh position={[0, 0.3, 0]}>
        <boxGeometry args={[0.7, 0.15, 0.15]} />
        <primitive object={SM.gold} attach="material" />
      </mesh>
    </group>
    {/* Door */}
    <mesh position={[0, 1.85, 6.01]}>
      <boxGeometry args={[2, 3.5, 0.2]} />
      <primitive object={SM.timber} attach="material" />
    </mesh>
    {/* Stained glass rose window */}
    <group position={[0, 5.5, 6.02]}>
      {/* Background - deep blue */}
      <mesh position={[0, 0, 0]}>
        <circleGeometry args={[1.4, 24]} />
        <meshStandardMaterial color="#1e3a5f" roughness={0.3} />
      </mesh>
      {/* Main glass segments - radiating colors. thetaStart alone places each
          wedge; a mesh rotation on top would land wedge i at i*90 degrees. */}
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <mesh key={i} position={[0, 0, 0.01]} userData={{ dynamic: true }}>
          <circleGeometry args={[1.3, 3, (i * Math.PI) / 4, Math.PI / 4]} />
          <meshStandardMaterial
            color={
              [
                '#dc2626',
                '#f59e0b',
                '#22c55e',
                '#3b82f6',
                '#8b5cf6',
                '#ec4899',
                '#14b8a6',
                '#eab308',
              ][i]
            }
            roughness={0.2}
            metalness={0}
            transparent
            opacity={0.9}
            emissive={
              [
                '#dc2626',
                '#f59e0b',
                '#22c55e',
                '#3b82f6',
                '#8b5cf6',
                '#ec4899',
                '#14b8a6',
                '#eab308',
              ][i]
            }
            emissiveIntensity={isNight ? 3 : 0.2}
          />
        </mesh>
      ))}
      {/* Gold tracery spokes */}
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <mesh key={`spoke-${i}`} position={[0, 0, 0.02]} rotation={[0, 0, (i * Math.PI) / 4]}>
          <boxGeometry args={[0.04, 1.3, 0.01]} />
          <primitive object={SM.gold} attach="material" />
        </mesh>
      ))}
      {/* Outer gold frame */}
      <mesh position={[0, 0, 0.02]}>
        <ringGeometry args={[1.35, 1.5, 24]} />
        <primitive object={SM.gold} attach="material" />
      </mesh>
      {/* Middle gold ring */}
      <mesh position={[0, 0, 0.02]}>
        <ringGeometry args={[0.7, 0.78, 16]} />
        <primitive object={SM.gold} attach="material" />
      </mesh>
      {/* Center medallion */}
      <mesh position={[0, 0, 0.03]}>
        <circleGeometry args={[0.35, 16]} />
        <meshStandardMaterial
          color="#fef3c7"
          emissive="#fcd34d"
          emissiveIntensity={0.4}
          roughness={0.3}
        />
      </mesh>
      {/* Inner gold ring */}
      <mesh position={[0, 0, 0.04]}>
        <ringGeometry args={[0.28, 0.35, 16]} />
        <primitive object={SM.gold} attach="material" />
      </mesh>
      {/* Cross in center */}
      <mesh position={[0, 0, 0.05]}>
        <boxGeometry args={[0.05, 0.22, 0.01]} />
        <primitive object={SM.gold} attach="material" />
      </mesh>
      <mesh position={[0, 0, 0.05]}>
        <boxGeometry args={[0.16, 0.05, 0.01]} />
        <primitive object={SM.gold} attach="material" />
      </mesh>
    </group>
    {/* Side windows */}
    {[-3, 0, 3].map((z, i) => (
      <React.Fragment key={i}>
        <mesh position={[5.01, 4, z]} userData={{ dynamic: true }}>
          <boxGeometry args={[0.1, 3, 1.5]} />
          <primitive object={SM.windowGlass} attach="material" />
        </mesh>
        <mesh position={[-5.01, 4, z]} userData={{ dynamic: true }}>
          <boxGeometry args={[0.1, 3, 1.5]} />
          <primitive object={SM.windowGlass} attach="material" />
        </mesh>
      </React.Fragment>
    ))}
  </group>
));
ChurchBuildingPrimitiveBody.displayName = 'ChurchBuildingPrimitiveBody';

const ChurchBuilding = React.memo<{
  position: [number, number, number];
  rotation?: number;
  isNight?: boolean;
}>(({ position, rotation = 0, isNight = false }) => (
  <group position={position} rotation={[0, rotation, 0]}>
    <GeneratedBody
      asset="church"
      scale={1.5}
      fallback={<ChurchBuildingPrimitiveBody isNight={isNight} />}
    />
  </group>
));
ChurchBuilding.displayName = 'ChurchBuilding';

/**
 * The town hall's hourly chime, with no geometry of its own.
 *
 * Split out of `TownHallClock` because that component lives inside
 * `TownHallPrimitiveBody`, which the generated town hall replaces - so the
 * chime, an audio feature with nothing to do with which body renders, went
 * silent the moment the asset shipped. The generated tower carries its own
 * baked clock face, so only the FACE is body-specific; the chime is not, and
 * it now mounts in `TownHall` beside the body.
 */
const TownHallChime: React.FC = React.memo(() => {
  const gameTime = useGameSimulationStore((state) => state.gameTime);
  const prevTimeRef = useRef<number | null>(null);

  useEffect(() => {
    // Detect the hour boundary being CROSSED rather than sampling a window
    // after it: at 10x a single tick advances a quarter hour and would step
    // straight over a fixed window most hours.
    const prev = prevTimeRef.current;
    prevTimeRef.current = gameTime;
    if (prev === null) return; // never bong on mount
    if (Math.floor(prev) === Math.floor(gameTime)) return;
    const elapsed = (((gameTime - prev) % 24) + 24) % 24;
    // Only strike while time flows at roughly normal speed. At 10x/60x, or
    // after a jump, the hour is skipped rather than chimed every few seconds.
    if (elapsed > 0.1) return;
    audioManager.playClockChime(Math.floor(gameTime));
  }, [gameTime]);

  return null;
});
TownHallChime.displayName = 'TownHallChime';

// Isolated clock component to prevent full building re-renders. Face and hands
// only - the chime is `TownHallChime` above, so it survives the asset swap.
const TownHallClock: React.FC<{ position: [number, number, number] }> = React.memo(
  ({ position }) => {
    const gameTime = useGameSimulationStore((state) => state.gameTime);

    // Clock hands: hour hand rotates once per 12 hours, minute hand once per hour
    const hourAngle = (gameTime / 12) * Math.PI * 2;
    const minuteAngle = (((gameTime % 1) * 60) / 60) * Math.PI * 2;

    return (
      <group position={position} userData={{ dynamic: true }}>
        {/* Clock face */}
        <mesh position={[0, 0, 0]}>
          <circleGeometry args={[1.2, 16]} />
          <primitive object={SM.white} attach="material" />
        </mesh>
        <mesh position={[0, 0, 0.01]}>
          <circleGeometry args={[1.1, 16]} />
          <primitive object={SM.clockFace} attach="material" />
        </mesh>
        {/* Hour hand - arrow shaped */}
        <group position={[0, 0, 0.05]} rotation={[0, 0, -hourAngle + Math.PI / 2]}>
          <mesh position={[0.2, 0, 0]}>
            <boxGeometry args={[0.5, 0.1, 0.02]} />
            <primitive object={SM.clockHands} attach="material" />
          </mesh>
          <mesh position={[0.5, 0, 0]} rotation={[Math.PI / 2, 0, Math.PI / 2]}>
            <coneGeometry args={[0.12, 0.2, 4]} />
            <primitive object={SM.clockHands} attach="material" />
          </mesh>
        </group>
        {/* Minute hand - arrow shaped, longer */}
        <group position={[0, 0, 0.06]} rotation={[0, 0, -minuteAngle + Math.PI / 2]}>
          <mesh position={[0.3, 0, 0]}>
            <boxGeometry args={[0.7, 0.08, 0.02]} />
            <primitive object={SM.clockHands} attach="material" />
          </mesh>
          <mesh position={[0.7, 0, 0]} rotation={[Math.PI / 2, 0, Math.PI / 2]}>
            <coneGeometry args={[0.1, 0.18, 4]} />
            <primitive object={SM.clockHands} attach="material" />
          </mesh>
        </group>
        {/* Clock center cap */}
        <mesh position={[0, 0, 0.07]}>
          <cylinderGeometry args={[0.08, 0.08, 0.02, 8]} />
          <primitive object={SM.gold} attach="material" />
        </mesh>
      </group>
    );
  }
);
TownHallClock.displayName = 'TownHallClock';

// ===== TOWN HALL =====
const TownHallPrimitiveBody = React.memo(() => {
  return (
    <group>
      {/* Main building */}
      <mesh position={[0, 3.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[12, 7, 10]} />
        <primitive object={SM.cream} attach="material" />
      </mesh>

      {/* Office Windows (Added for night emissives) */}
      {/* Front Windows (flanking entrance) */}
      {[-4, 4].map((x, i) => (
        <mesh key={`win-front-${i}`} position={[x, 3.5, 5.01]} userData={{ dynamic: true }}>
          <boxGeometry args={[1.5, 2.5, 0.1]} />
          <primitive object={SM.windowGlass} attach="material" />
        </mesh>
      ))}
      {/* Side Windows */}
      {[-1, 0, 1].map((zOffset, i) => (
        <React.Fragment key={`win-side-${i}`}>
          {[-6.01, 6.01].map((x, j) => (
            <mesh
              key={`win-side-${i}-${j}`}
              position={[x, 3.5, zOffset * 3]}
              rotation={[0, Math.PI / 2, 0]}
              userData={{ dynamic: true }}
            >
              <boxGeometry args={[1.5, 2.5, 0.1]} />
              <primitive object={SM.windowGlass} attach="material" />
            </mesh>
          ))}
        </React.Fragment>
      ))}

      {/* Pyramid roof */}
      <mesh position={[0, 9, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[10, 4, 4]} />
        <primitive object={SM.roofSlate} attach="material" />
      </mesh>
      {/* Clock tower */}
      <mesh position={[0, 11, 0]} castShadow>
        <boxGeometry args={[4, 6, 4]} />
        <primitive object={SM.cream} attach="material" />
      </mesh>
      {/* Ogee cupola - see createTownHallCupolaGeometry. Fascia and eave kick
            on the 1.6 m overhang, dome shoulder rolling into a concave sweep,
            lantern drum and ball finial. */}
      <mesh position={[0, 16, 0]} castShadow>
        <primitive object={TOWNHALL_CUPOLA} attach="geometry" />
        <primitive object={SM.roofSlate} attach="material" />
      </mesh>

      {/* Clock Face & Hands - Isolated Component */}
      <TownHallClock position={[0, 12, 2.01]} />

      {/* Grand entrance - raised to meet steps */}
      <mesh position={[0, 2.4, 5.01]}>
        <boxGeometry args={[3, 3, 0.2]} />
        <primitive object={SM.timber} attach="material" />
      </mesh>
      {/* Steps - ascending toward building */}
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[0, 0.15 + i * 0.3, 7 - i * 0.5]} castShadow receiveShadow>
          <boxGeometry args={[5 - i * 0.5, 0.3, 1]} />
          <primitive object={SM.stone} attach="material" />
        </mesh>
      ))}
      {/* Columns */}
      {[-2.5, 2.5].map((x, i) => (
        <mesh key={i} position={[x, 2, 5.5]} castShadow>
          <cylinderGeometry args={[0.3, 0.35, 4, 12]} />
          <primitive object={SM.white} attach="material" />
        </mesh>
      ))}
      {/* Lintel across columns */}
      <mesh position={[0, 4.2, 5.5]} castShadow>
        <boxGeometry args={[5.5, 0.4, 0.5]} />
        <primitive object={SM.white} attach="material" />
      </mesh>
      {/* TOWN HALL text */}
      <Text
        position={[0, 6, 5.1]}
        fontSize={0.6}
        color="#1e293b"
        anchorX="center"
        anchorY="middle"
        font={FONT_URL}
      >
        TOWN HALL
      </Text>
    </group>
  );
});
TownHallPrimitiveBody.displayName = 'TownHallPrimitiveBody';

export const TownHall = React.memo<{ position: [number, number, number]; rotation?: number }>(
  ({ position, rotation = 0 }) => (
    <group position={position} rotation={[0, rotation, 0]}>
      <GeneratedBody asset="townhall" fallback={<TownHallPrimitiveBody />} />
      {/* Hoisted out of the body so the hour still strikes on either path. The
          generated tower's clock face is baked into its albedo, so only the
          moving hands are lost by the swap - the sound is not. */}
      <TownHallChime />
    </group>
  )
);
TownHall.displayName = 'TownHall';

// ===== PUB =====
const PubPrimitiveBody = React.memo(() => (
  <group>
    {/* Main building - timber frame style */}
    <mesh position={[0, 2.5, 0]} castShadow receiveShadow>
      <boxGeometry args={[8, 5, 6]} />
      <primitive object={SM.cream} attach="material" />
    </mesh>
    {/* Timber beams - vertical */}
    {[
      [-3.5, 2.5],
      [0, 2.5],
      [3.5, 2.5],
    ].map(([x, y], i) => (
      <mesh key={i} position={[x, y, 3.01]} castShadow>
        <boxGeometry args={[0.3, 5, 0.15]} />
        <primitive object={SM.timber} attach="material" />
      </mesh>
    ))}
    {/* Horizontal beams */}
    {[1, 3, 4.5].map((y, i) => (
      <mesh key={`h-${i}`} position={[0, y, 3.01]} castShadow>
        <boxGeometry args={[8, 0.2, 0.15]} />
        <primitive object={SM.timber} attach="material" />
      </mesh>
    ))}
    {/* Pyramid roof */}
    <mesh position={[0, 6.5, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
      <coneGeometry args={[6.5, 3, 4]} />
      <primitive object={SM.thatch} attach="material" />
    </mesh>
    {/* Chimney */}
    <mesh position={[3, 7, 0]} castShadow>
      <boxGeometry args={[0.8, 2, 0.8]} />
      <primitive object={SM.stone} attach="material" />
    </mesh>
    {/* Door */}
    <mesh position={[0, 1.2, 3.01]}>
      <boxGeometry args={[1.5, 2.4, 0.1]} />
      <primitive object={SM.timber} attach="material" />
    </mesh>
    {/* Windows */}
    {[-2.5, 2.5].map((x, i) => (
      <mesh key={i} position={[x, 2, 3.02]} userData={{ dynamic: true }}>
        <boxGeometry args={[1.2, 1.2, 0.05]} />
        <primitive object={SM.windowGlass} attach="material" />
      </mesh>
    ))}
    {/* Hanging sign */}
    <group position={[4.5, 3.5, 0]}>
      <mesh>
        <boxGeometry args={[0.1, 1.5, 0.1]} />
        <primitive object={SM.black} attach="material" />
      </mesh>
      <mesh position={[0.8, -0.5, 0]}>
        <boxGeometry args={[1.5, 1, 0.1]} />
        <primitive object={SM.timber} attach="material" />
      </mesh>
      <Text
        position={[0.8, -0.5, 0.1]}
        fontSize={0.15}
        color="#fef3c7"
        anchorX="center"
        anchorY="middle"
        font={FONT_URL}
      >
        THE FLOUR{'\n'}& BARREL
      </Text>
    </group>
    {/* Outdoor seating */}
    {[-2, 2].map((x, i) => (
      <group key={i} position={[x, 0, 5]}>
        <mesh position={[0, 0.6, 0]} castShadow>
          <boxGeometry args={[1.2, 0.08, 1.2]} />
          <primitive object={SM.timber} attach="material" />
        </mesh>
        <mesh position={[0, 0.3, 0]} castShadow>
          <cylinderGeometry args={[0.08, 0.08, 0.6, 8]} />
          <primitive object={SM.timber} attach="material" />
        </mesh>
      </group>
    ))}
  </group>
));
PubPrimitiveBody.displayName = 'PubPrimitiveBody';

const Pub = React.memo<{
  position: [number, number, number];
  rotation?: number;
}>(({ position, rotation = 0 }) => (
  <group position={position} rotation={[0, rotation, 0]}>
    <GeneratedBody asset="pub" fallback={<PubPrimitiveBody />} />
    {/* Hoisted out of the body, or the pub's chimney stops smoking the moment
        the generated body renders - the same orphaning the cottage's smoke was
        already saved from. Re-seated on the generated chimney mouth rather than
        the primitive's: the largest up-facing surface in the top of `pub.glb`
        is 0.10 m2 at y = 5.55, centroid x 1.91, z -0.06. The primitive's
        [3, 8.2, 0] would smoke from mid-air 2.6 m above a 5.56 m building. */}
    <ChimneySmoke position={[1.95, 5.6, -0.06]} offset={5} />
  </group>
));
Pub.displayName = 'Pub';

// ===== SCHOOL =====
const SchoolPrimitiveBody = React.memo(() => (
  <group>
    {/* Main building */}
    <mesh position={[0, 3, 0]} castShadow receiveShadow>
      <boxGeometry args={[10, 6, 7]} />
      <primitive object={SM.cream} attach="material" />
    </mesh>
    {/* Pyramid roof */}
    <mesh position={[0, 7.5, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
      <coneGeometry args={[8, 3, 4]} />
      <primitive object={SM.roofSlate} attach="material" />
    </mesh>
    {/* Bell tower - open frame with posts */}
    <group position={[0, 9, 0]}>
      {/* Four corner posts */}
      {[
        [-0.85, -0.85],
        [0.85, -0.85],
        [-0.85, 0.85],
        [0.85, 0.85],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, 0, z]} castShadow>
          <boxGeometry args={[0.3, 3, 0.3]} />
          <primitive object={SM.cream} attach="material" />
        </mesh>
      ))}
      {/* Top beam connecting posts */}
      <mesh position={[0, 1.35, 0]} castShadow>
        <boxGeometry args={[2, 0.3, 2]} />
        <primitive object={SM.cream} attach="material" />
      </mesh>

      {/* Bell - realistic lathe profile */}
      <group
        position={[0, 0.7, 0]}
        scale={1.5}
        onClick={(e) => {
          e.stopPropagation();
          playCritterSound('bell');
        }}
        onPointerOver={() => {
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          document.body.style.cursor = 'auto';
        }}
      >
        {/* Bell body using lathe geometry for proper curve */}
        <mesh rotation={[Math.PI, 0, 0]}>
          <latheGeometry
            args={[
              // Profile points for bell shape: [x, y] from top to bottom
              [
                new THREE.Vector2(0.08, 0), // Top center (narrow)
                new THREE.Vector2(0.12, 0.05), // Shoulder
                new THREE.Vector2(0.15, 0.12), // Upper body
                new THREE.Vector2(0.18, 0.22), // Mid body
                new THREE.Vector2(0.24, 0.32), // Lower body (widening)
                new THREE.Vector2(0.32, 0.4), // Waist
                new THREE.Vector2(0.38, 0.45), // Lip start
                new THREE.Vector2(0.4, 0.48), // Lip flare
                new THREE.Vector2(0.38, 0.5), // Lip bottom edge
              ],
              16, // Segments around
            ]}
          />
          <primitive object={SM.gold} attach="material" />
        </mesh>
        {/* Mounting yoke */}
        <mesh position={[0, 0.08, 0]}>
          <boxGeometry args={[0.08, 0.12, 0.3]} />
          <primitive object={SM.timber} attach="material" />
        </mesh>
        {/* Clapper rod */}
        <mesh position={[0, -0.2, 0]}>
          <cylinderGeometry args={[0.015, 0.015, 0.25, 6]} />
          <primitive object={SM.black} attach="material" />
        </mesh>
        {/* Clapper ball */}
        <mesh position={[0, -0.35, 0]}>
          <sphereGeometry args={[0.05, 8, 8]} />
          <primitive object={SM.black} attach="material" />
        </mesh>
      </group>
    </group>
    {/* Belfry cap - see createSchoolBellCapGeometry. An octagon springing from
        the square post frame: fascia, eave kick, bell-cast sweep, ball finial. */}
    <mesh position={[0, 11.5, 0]} castShadow>
      <primitive object={SCHOOL_BELL_CAP} attach="geometry" />
      <primitive object={SM.roofSlate} attach="material" />
    </mesh>
    {/* Windows - row */}
    {[-3, -1, 1, 3].map((x, i) => (
      <mesh key={i} position={[x, 3.5, 3.51]} userData={{ dynamic: true }}>
        <boxGeometry args={[1.2, 2, 0.05]} />
        <primitive object={SM.windowGlass} attach="material" />
      </mesh>
    ))}
    {/* Door */}
    <mesh position={[0, 1.5, 3.51]}>
      <boxGeometry args={[1.5, 3, 0.1]} />
      <primitive object={SM.timber} attach="material" />
    </mesh>
    {/* Sign */}
    <Text
      position={[0, 5.5, 3.6]}
      fontSize={0.4}
      color="#1e293b"
      anchorX="center"
      anchorY="middle"
      font={FONT_URL}
    >
      SCHOOL
    </Text>
  </group>
));
SchoolPrimitiveBody.displayName = 'SchoolPrimitiveBody';

const School = React.memo<{
  position: [number, number, number];
  rotation?: number;
}>(({ position, rotation = 0 }) => (
  <group position={position} rotation={[0, rotation, 0]}>
    {/* Sunk 0.84 m: the generated school is the one asset in the set that
        arrives standing on its own turf disc, which reads as a lawn dropped on
        the village cobbles. Measured off the GLB with the albedo sampled per
        triangle - the disc's top face is 44.6 m2 of up-facing green at
        y = 0.75-0.80, and the building stands on it, so 0.84 puts BOTH the
        lawn and the building's base 40 mm under the ground datum at y = -0.02
        (0.70 against the old 0.12 cobble sheet, shifted by the same 0.14 m).
        The bushes and the two markers rooted in the disc stay above ground and
        read as planting beside the school. Sinking further would bury the
        doorway; sinking less leaves 44 m2 of green coplanar with the cobbles.
        The other 29 assets were checked the same way and none is green. */}
    <GeneratedBody asset="school" sink={0.84} fallback={<SchoolPrimitiveBody />} />
  </group>
));
School.displayName = 'School';

/**
 * (radius, y) pairs into the Vector2[] THREE.LatheGeometry wants.
 *
 * Every profile below is transcribed verbatim from a spec that was drawn,
 * rendered and judged in Blender (`scripts/blender/specs/village-water.json`),
 * and that harness prints its points as (r, y). Keeping the same form here
 * means the numbers in the source are the numbers that were approved rather
 * than a retyped-from-memory approximation of them.
 */
const latheProfile = (points: readonly (readonly [number, number])[]): THREE.Vector2[] =>
  points.map(([r, y]) => new THREE.Vector2(r, y));

// ===== WISHING WELL =====

/**
 * Drystone kerb for the wishing well.
 *
 * 2.4 m across and 0.8 m tall, standing on the village cobbles at y=0.12 - so
 * the bottom 120 mm is buried and the widest ring is placed just clear of the
 * paving rather than at the very foot, where nobody would ever see it. The
 * previous `CylinderGeometry(1, 1.2, 0.8, 12)` was a plain tapered drum: the
 * 12-gon read as coursing, but there were no courses in it to read.
 *
 * Deliberately still a 12-gon (`LatheGeometry` at 12 segments is the same
 * inscribed polygon the cylinder was), because at 2.4 m across the 41 mm inset
 * between vertices reads as dressed masonry and sanding it smooth would lose
 * that. What is new is the profile: four battered courses, each stepping in at
 * a joint, under a capstone that projects 190 mm and throws a shadow onto them.
 * The projection is the feature that carries - a well is recognisable by its
 * coping long before its stonework is.
 *
 * The flat top is held at exactly y=+0.40 out to radius 1.07. The Cat prop is
 * seated at world y=0.80 on this face and the dark mouth disc sits at 0.81 with
 * radius 0.75, so any weathering that pulled the top ring below +0.40 would
 * unseat the cat and lift the disc off the stone. Envelope: max radius 1.20,
 * y in [-0.40, 0.40] - identical to the cylinder.
 */
const WELL_KERB = new THREE.LatheGeometry(
  latheProfile([
    [1.06, -0.4], // footing, below the paving
    [1.14, -0.32],
    [1.2, -0.255], // plinth course - envelope max radius, 45 mm above the cobbles
    [1.11, -0.23], // first coursing joint
    [1.1, -0.09],
    [1.02, -0.062], // second coursing joint
    [1.01, 0.1],
    [0.94, 0.128], // third coursing joint
    [0.93, 0.212], // the drum's narrowest course
    [1.1, 0.246], // capstone springs out over the courses
    [1.12, 0.262],
    [1.12, 0.366], // capstone face
    [1.07, 0.4], // weathered arris
    [0.0, 0.4], // flat coping top - the cat sits here
  ]),
  12
);

/**
 * Thatched roof for the wishing well.
 *
 * 2.4 m across at 2.8 m - just above head height on a walk-up prop with a
 * pettable cat on its rim, so it is read from two or three metres and mostly
 * from below. `ConeGeometry(1.2, 1, 16)` gave it a straight-sided pitch and a
 * knife-edged rim, which is the one thing thatch never has.
 *
 * Three features, all of them silhouette rather than surface: a fat rolled eave
 * (a 190 mm quarter-round where the straw is cut and combed), a bell-cast
 * slope whose pitch steepens monotonically from ~30 deg at the skirt to ~72 deg
 * at the peak, and the tied bundle at the apex with its binding ring. The
 * bell-cast is what stops it reading as a lampshade: real thatch is flared at
 * the eave because the straw is laid over a tilting fillet.
 *
 * The underside cap is kept. The timber posts run up inside it and the eave is
 * at 2.30, so opening the underside would show their tops floating in a hollow.
 *
 * The bell-cast is also why the posts are 2.0 m and not the 2.2 m they were
 * under the cone. A straight cone is at radius 0.84 at world 2.60; this
 * profile is at 0.689 there, and the posts' corners stand 0.7786 from the
 * axis, so a post that used to be swallowed now pokes a timber block out
 * through the straw. Any future change to this slope has to re-check that
 * clearance against the 20-gon INSCRIBED radius (r * cos(pi/20)), not r.
 *
 * Envelope: max radius 1.20 at the eave, y in [-0.50, 0.50] - identical to the
 * cone. 20 segments leaves a 15 mm crease at the eave radius.
 */
const WELL_ROOF = new THREE.LatheGeometry(
  latheProfile([
    [0.0, -0.5], // underside cap centre
    [1.2, -0.5], // eave outer edge - envelope max radius
    [1.198, -0.47],
    [1.18, -0.443],
    [1.14, -0.421], // rolled thatch edge
    [1.085, -0.407],
    [1.01, -0.398], // the roll flattens into the skirt
    [0.809, -0.281],
    [0.636, -0.164],
    [0.48, -0.047], // slope steepens through the middle
    [0.341, 0.07],
    [0.235, 0.187],
    [0.171, 0.288],
    [0.14, 0.382], // straw gathers under the binding
    [0.185, 0.42], // binding ring
    [0.165, 0.458],
    [0.08, 0.486],
    [0.0, 0.5], // apex - envelope max y
  ]),
  20
);

const WishingWellPrimitiveBody = React.memo(() => (
  <group>
    {/* Stone kerb - see WELL_KERB for the coursing and the cat's seat. */}
    <mesh position={[0, 0.4, 0]} castShadow>
      <primitive object={WELL_KERB} attach="geometry" />
      <primitive object={SM.stone} attach="material" />
    </mesh>
    {/* Dark hole at top of well */}
    <mesh position={[0, 0.81, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[0.75, 24]} />
      <meshBasicMaterial color="#0a0a0a" />
    </mesh>
    {/* Water inside (deeper) */}
    <mesh position={[0, 0.15, 0]}>
      <cylinderGeometry args={[0.7, 0.7, 0.3, 12]} />
      <primitive object={SM.water} attach="material" />
    </mesh>
    {/* Wooden posts. Top at world 2.40, not the 2.60 the straight cone used to
        swallow - see WELL_ROOF. The bottom stays at 0.40, buried in the kerb,
        so the visible run from the coping to the eave is unchanged. */}
    {[-0.7, 0.7].map((x, i) => (
      <mesh key={i} position={[x, 1.4, 0]} castShadow>
        <boxGeometry args={[0.15, 2.0, 0.15]} />
        <primitive object={SM.timber} attach="material" />
      </mesh>
    ))}
    {/* Thatched roof - see WELL_ROOF for the eave roll and the bell-cast. */}
    <mesh position={[0, 2.8, 0]} castShadow>
      <primitive object={WELL_ROOF} attach="geometry" />
      <primitive object={SM.thatch} attach="material" />
    </mesh>
    {/* Bucket */}
    <mesh position={[0, 1.2, 0]} castShadow>
      <cylinderGeometry args={[0.2, 0.15, 0.3, 8]} />
      <primitive object={SM.timber} attach="material" />
    </mesh>
    {/* Rope */}
    <mesh position={[0, 2, 0]}>
      <cylinderGeometry args={[0.02, 0.02, 1.5, 6]} />
      <meshStandardMaterial color="#8b7355" roughness={0.9} />
    </mesh>
  </group>
));
WishingWellPrimitiveBody.displayName = 'WishingWellPrimitiveBody';

const WishingWell = React.memo<{ position: [number, number, number] }>(({ position }) => (
  <group position={position}>
    <GeneratedBody asset="wishingwell" fallback={<WishingWellPrimitiveBody />} />
  </group>
));
WishingWell.displayName = 'WishingWell';

// ===== DUCK COMPONENT =====
/**
 * Quarter turn: the parts below are authored facing +X and the generated duck
 * faces +Z with the rest of the roster, so without it the fallback bird points
 * 90 degrees away from the one that ships.
 */
const DuckPrimitiveBody = React.memo(() => (
  <group rotation={[0, -Math.PI / 2, 0]}>
    <mesh castShadow>
      <sphereGeometry args={[0.25, 8, 8]} />
      <meshStandardMaterial color="#fef3c7" roughness={0.8} />
    </mesh>
    <mesh position={[0.2, 0.1, 0]} castShadow>
      <sphereGeometry args={[0.15, 8, 8]} />
      <meshStandardMaterial color="#fef3c7" roughness={0.8} />
    </mesh>
    <mesh position={[0.35, 0.1, 0]} rotation={[0, 0, -0.3]}>
      <boxGeometry args={[0.1, 0.05, 0.08]} />
      <meshStandardMaterial color="#f97316" roughness={0.6} />
    </mesh>
  </group>
));
DuckPrimitiveBody.displayName = 'DuckPrimitiveBody';

const Duck = React.memo<{
  position: [number, number, number];
  delay: number;
  onClick: (pos: [number, number, number]) => void;
}>(({ position, delay, onClick }) => {
  const groupRef = useRef<THREE.Group>(null);
  const rigRef = useRef<CreatureRigHandle>(null);
  const dabbleRef = useRef(0);
  const shakenRef = useRef(false);
  const [isExcited, setIsExcited] = React.useState(false);

  // Restored: a pond of perfectly still ducks beside animated water reads as
  // broken. Runs on the shared 1-in-4 throttle (~15 Hz), which is plenty for a
  // 2 cm bob - and it drops to every frame's worth of work only when petted.
  useFrame((state) => {
    if (!groupRef.current) return;
    if (!isExcited && !shouldRunThisFrame(4)) return;
    const time = state.clock.elapsedTime;

    let yOffset = Math.sin(time * 2 + delay) * 0.02;
    let rotOffset = Math.sin(time * 0.5 + delay) * 0.1;

    if (isExcited) {
      yOffset += Math.abs(Math.sin(time * 15)) * 0.1; // Rapid hop
      rotOffset += Math.sin(time * 20) * 0.2; // Wiggle
    }

    groupRef.current.position.y = position[1] + yOffset;
    groupRef.current.rotation.y = rotOffset;

    // Dabbling. `stride` stays unused for this species - a bird floating on a
    // pond has nothing to swing its legs against - so the neck is the whole of
    // its rig motion. Head down in short dips rather than held under, and the
    // dip is suppressed while it is being petted so the bird looks up at you.
    const rig = rigRef.current;
    if (!rig) return;
    const target = isExcited ? 0 : Math.max(0, Math.sin(time * 0.9 + delay * 1.7)) ** 3;
    dabbleRef.current = THREE.MathUtils.lerp(dabbleRef.current, target, 0.12);
    // Shake first, graze second: every setter on the handle rebuilds the whole
    // pose from the rest quaternions and calls `updateMatrixWorld`, so writing
    // both unconditionally would double this bird's rig cost to no effect.
    // The shake is written only while it is live, plus once more to clear it.
    if (isExcited) rig.setHeadShake(Math.sin(time * 20) * 0.3);
    else if (shakenRef.current) rig.setHeadShake(0);
    shakenRef.current = isExcited;
    rig.setGraze(dabbleRef.current);
  });

  // Reset excitement
  React.useEffect(() => {
    if (isExcited) {
      const timer = setTimeout(() => setIsExcited(false), 1000);
      return () => clearTimeout(timer);
    }
  }, [isExcited]);

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    setIsExcited(true);
    playCritterSound('duck');
    onClick(position);
  };

  return (
    <group
      ref={groupRef}
      position={[position[0], position[1], position[2]]}
      onClick={handleClick}
      onPointerOver={setPointerCursor}
      onPointerOut={resetCursor}
    >
      <CreatureBody creature="duck" ref={rigRef} fallback={<DuckPrimitiveBody />} />
    </group>
  );
});
Duck.displayName = 'Duck';

// ===== DUCK POND =====

/**
 * Kerbed bank around the duck pond.
 *
 * 14 m across, walked around and leaned on. It was `RingGeometry(5.5, 7, 32)`
 * laid flat: a zero-thickness annulus painted on the cobbles, needing a
 * polygonOffset to stay out of a depth fight with them, and leaving the water
 * disc's 80 mm cut edge standing exposed above it as a bright blue band with a
 * visibly polygonal outline.
 *
 * This is the one object in this file whose envelope deliberately changes:
 * there is no zero-drift version of "flat annulus becomes a shaped bank". It
 * gains 150 mm of y half-extent. Nothing in the scene is positioned against
 * the ring's extent - DuckPond is a singleton at [20, 0, 25], the ducks float
 * at y=0.35 inside radius 2.5, and the lily pads at y=0.33 inside radius 2.6 -
 * so the only relationships that matter are the two this profile is designed
 * around, and both are held:
 *
 *   - The inner lip is at radius 5.44, at y=+0.07 (world 0.220), overhanging
 *     the r=5.5 water top at world 0.19. At 48 segments the lip's own facet
 *     midpoints fall to 5.4283, and the 32-segment water disc's fall to
 *     5.5*cos(pi/32) = 5.4736. Lip max 5.44 < water min 5.4736, so the stone
 *     covers the water's cut edge at every angle around the pond rather than
 *     beating in and out of it. Under the lip the profile turns back out and
 *     down to 5.51, which undercuts it and lays a shadow line on the water.
 *   - The outer edge reaches world 0.118 and then drops a skirt to 0.090,
 *     which passes through the cobble sheet at 0.12. That is an intersection,
 *     not a coplanar surface, so the polygonOffset hack the flat ring needed
 *     is gone with it.
 *
 * Between the two, a 340 mm flat coping at world 0.30 - 180 mm of readable
 * kerb above the paving - rolling over into a gravel apron. Max radius stays
 * exactly 7.0. One shared geometry, one instance, 637 vertices; no pointer
 * handler is on this mesh (they are on the Ducks), so nothing raycasts it.
 *
 * Traversed OUTER to INNER on purpose: LatheGeometry derives its winding and
 * normals from the order of the profile, and an open sheet walked the other
 * way faces downwards and is culled by the default FrontSide material. The
 * Blender preview cannot catch that - workbench does not backface cull - so
 * the direction is checked against three's own normals instead.
 */
const POND_SHORE = new THREE.LatheGeometry(
  latheProfile([
    [7.0, -0.06], // skirt, buried under the paving
    [7.0, -0.032], // outer edge - envelope max radius, unchanged
    [6.85, -0.024], // gravel apron levels out at the cobbles
    [6.68, 0.008],
    [6.56, 0.048],
    [6.45, 0.096], // coping rolls over
    [6.3, 0.136],
    [6.12, 0.15], // the flat you can sit on
    [5.78, 0.15], // coping top - world 0.30
    [5.66, 0.116],
    [5.57, 0.062], // inner face of the kerb drops to the water
    [5.51, 0.038], // undercut: shadow line where stone meets water
    [5.44, 0.07], // lip crest, overhangs the waterline
  ]),
  48
);

/** The pond's own bank and water, kept as the generated pond's fallback. */
const DuckPondBasin = React.memo(() => (
  <group>
    <mesh position={[0, 0.15, 0]} receiveShadow>
      <primitive object={POND_SHORE} attach="geometry" />
      <meshStandardMaterial color="#a89f91" roughness={0.9} side={THREE.DoubleSide} />
    </mesh>
    {/* Water pond - thin disc, its rim tucked under the kerb's lip. */}
    <mesh position={[0, 0.15, 0]}>
      <cylinderGeometry args={[5.5, 5.5, 0.08, 32]} />
      <meshStandardMaterial
        color="#3b82f6"
        roughness={0.1}
        // Water is a dielectric. At metalness 0.6 the pond was reflecting
        // its own blue albedo as specular and reading as chalky enamel.
        metalness={0}
        // No polygonOffset. It carried -4/-4 to win against the flat annulus
        // that used to be the shore, which itself carried -2/-2 against the
        // cobbles. POND_SHORE is a solid bank now and its lip crosses over
        // this disc with only 2.6 mm of clearance at r=5.5; a negative offset
        // is applied along the view ray, so at the grazing angles you read a
        // 14 m pond from it is worth centimetres of depth and would push the
        // blue back out through the stone. Nothing here is coplanar with
        // anything - the disc's wall intersects the cobble sheet at 0.12
        // rather than lying on it - so no bias is needed in either direction.
      />
    </mesh>
  </group>
));
DuckPondBasin.displayName = 'DuckPondBasin';

const DuckPond = React.memo<{ position: [number, number, number] }>(({ position }) => {
  // Local heart particles state
  const [hearts, setHearts] = React.useState<{ id: number; pos: [number, number, number] }[]>([]);

  const addHeart = React.useCallback((pos: [number, number, number]) => {
    const id = Date.now() + Math.random();
    // Spawning heart slighty above duck
    setHearts((prev) => [...prev, { id, pos: [pos[0], pos[1] + 1, pos[2]] }]);
  }, []);

  const removeHeart = React.useCallback((id: number) => {
    setHearts((prev) => prev.filter((h) => h.id !== id));
  }, []);

  // A duck unmounted while hovered must not leave the pointer cursor stuck.
  useEffect(() => resetCursor, []);

  return (
    <group position={position}>
      {/* Shore kerb - see POND_SHORE. The lathe is built about its own Y axis,
          so unlike the flat ring it replaces it takes no -PI/2 rotation, and
          its skirt intersects the cobble sheet instead of lying on it, so it
          needs no polygonOffset either. Shadow contract is unchanged from the
          flat ring - receive only. A single-sided open sheet renders its BACK
          side into the shadow map by three's default shadowSide, so asking a
          kerb like this to cast buys a peeled shadow, not a better one.

          DoubleSide because the profile reverses radial direction at the
          undercut: the inner face's normals point INWARD, the lip's point
          OUTWARD, so no single winding orients both and one of the two is
          backfacing from any given eye. Most viewpoints are fine - the inner
          face is front-facing from above ~31 deg and hidden behind the coping
          edge below that - but the band in between opens a see-through slot at
          the waterline onto the water disc's cut edge, which is the artefact
          this profile exists to hide. This removes the class rather than one
          observed hole. No geometry cost, back faces light correctly (three
          flips the normal), shadows unaffected - the mesh only receives. */}
      {/* The generated pond carries its own bank and water surface, so the
          primitive kerb and water disc are fallback-only.
          Sunk 0.45 m, measured rather than guessed. Weighting the asset's
          horizontal triangles by AREA puts its water plane at y = 0.80 (48 m2
          of surface between 0.78 and 0.84); a vertex histogram says 1.22,
          because it counts the crinkly bank rather than one big flat disc, and
          that estimate buried the water under the cobbles. The ducks float at
          0.35, so 0.80 - 0.35 seats the water under them and leaves the bank
          proud of the ground.
          `sink` rather than a wrapper group because a wrapper sinks the
          FALLBACK too, and `DuckPondBasin` has no bank to hide - it was going
          0.45 m under the cobbles whenever the GLB failed to load. */}
      <GeneratedBody asset="duckpond" sink={0.45} fallback={<DuckPondBasin />} />
      {/* Ducks - floating on water surface */}
      <group>
        {[
          [2, 0.35, 1],
          [-1, 0.35, -2],
          [0, 0.35, 2],
          [1.5, 0.35, -1.5],
        ].map(([x, y, z], i) => (
          <Duck
            key={i}
            position={[x as number, y as number, z as number]}
            delay={i}
            onClick={() => addHeart([x as number, y as number, z as number])}
          />
        ))}
      </group>
      {/* Lily pads - floating just above the generated water, which after the
          0.45 sink is a crinkled 0.33-0.39 band. Opaque, so they write depth;
          a bias keeps the crinkle from biting through them. */}
      {[
        [-2, 0.395, 0],
        [1, 0.395, -1.5],
        [-0.5, 0.395, 2.5],
      ].map(([x, y, z], i) => (
        <mesh
          key={`lily-${i}`}
          position={[x as number, y as number, z as number]}
          rotation={[-Math.PI / 2, 0, i]}
        >
          <circleGeometry args={[0.4, 12]} />
          <meshStandardMaterial
            color="#22c55e"
            roughness={0.9}
            polygonOffset
            polygonOffsetFactor={-1}
            polygonOffsetUnits={-1}
          />
        </mesh>
      ))}
      {/* Render Active Hearts */}
      {hearts.map((h) => (
        <HeartParticle key={h.id} position={h.pos} onComplete={() => removeHeart(h.id)} />
      ))}
    </group>
  );
});
DuckPond.displayName = 'DuckPond';

// ===== MARKET STALL =====
const MarketStallPrimitiveBody = React.memo<{ color1?: string; color2?: string }>(
  ({ color1 = '#dc2626', color2 = '#fef3c7' }) => (
    <group>
      {/* Table top */}
      <mesh position={[0, 0.9, 0]} castShadow>
        <boxGeometry args={[2.8, 0.1, 1.8]} />
        <primitive object={SM.timber} attach="material" />
      </mesh>
      {/* Base/Legs with bracing */}
      <group position={[0, 0.45, 0]}>
        {[
          [-1.2, 0.7],
          [1.2, 0.7],
          [-1.2, -0.7],
          [1.2, -0.7],
        ].map(([x, z], i) => (
          <mesh key={i} position={[x, 0, z]} castShadow>
            <boxGeometry args={[0.1, 0.9, 0.1]} />
            <primitive object={SM.timber} attach="material" />
          </mesh>
        ))}
        {/* Cross bracing sides */}
        {[-0.7, 0.7].map((z, i) => (
          <mesh key={`brace-${i}`} position={[0, 0.2, z]} rotation={[0, 0, Math.PI / 2]}>
            <boxGeometry args={[0.1, 2.4, 0.05]} />
            <primitive object={SM.timber} attach="material" />
          </mesh>
        ))}
      </group>

      {/* Roof Frame Posts */}
      {[
        [-1.3, 0.8],
        [1.3, 0.8],
      ].map(([x, z], i) => (
        <mesh key={`post-${i}`} position={[x, 1.6, z]} castShadow>
          <cylinderGeometry args={[0.04, 0.04, 1.6, 8]} />
          <primitive object={SM.timber} attach="material" />
        </mesh>
      ))}

      {/* Striped Awning - constructed from multiple segments */}
      <group position={[0, 2.4, 0.2]} rotation={[0.4, 0, 0]}>
        {[-1.4, -1.0, -0.6, -0.2, 0.2, 0.6, 1.0, 1.4].map((x, i) => (
          <mesh key={i} position={[x, 0, 0]} receiveShadow>
            <boxGeometry args={[0.4, 0.05, 2.2]} />
            <meshStandardMaterial color={i % 2 === 0 ? color1 : color2} roughness={0.9} />
          </mesh>
        ))}
      </group>

      {/* Merchandise on table */}
      <group position={[0, 1, 0]}>
        {/* Crate 1 */}
        <group position={[-0.8, 0.15, 0.2]} rotation={[0, 0.2, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.6, 0.3, 0.6]} />
            <primitive object={SM.timber} attach="material" />
          </mesh>
          {/* Apples */}
          {[
            [-0.15, 0.2, -0.15],
            [0.15, 0.2, -0.15],
            [-0.15, 0.2, 0.15],
            [0.15, 0.2, 0.15],
            [0, 0.25, 0],
          ].map(([x, y, z], i) => (
            <mesh key={i} position={[x, y, z]}>
              <sphereGeometry args={[0.1, 8, 8]} />
              <meshStandardMaterial color="#ef4444" />
            </mesh>
          ))}
        </group>

        {/* Cheese wheels */}
        <group position={[0.6, 0.1, -0.3]}>
          <mesh position={[0, 0, 0]} castShadow>
            <cylinderGeometry args={[0.2, 0.2, 0.15, 16]} />
            <meshStandardMaterial color="#fbbf24" />
          </mesh>
          <mesh position={[0.1, 0.15, 0.1]} castShadow>
            <cylinderGeometry args={[0.15, 0.15, 0.12, 16]} />
            <meshStandardMaterial color="#fcd34d" />
          </mesh>
        </group>

        {/* Sacks */}
        <mesh position={[0.2, 0.2, 0.4]} rotation={[0.2, 0.1, 0]} castShadow>
          <sphereGeometry args={[0.25, 12, 12]} />
          <meshStandardMaterial color="#d6d3d1" roughness={1} />
        </mesh>
      </group>
    </group>
  )
);
MarketStallPrimitiveBody.displayName = 'MarketStallPrimitiveBody';

/**
 * Produce on a stall counter. Four sets, one per pitch.
 *
 * THE DRESSING IS THE FREE HALF OF THE CLONE FIX. Both independent judges named
 * the same thing as the strongest criticism of the generated set: one model, one
 * baked texture, yaw the only variation. Four `marketstall` instances stand 8 m
 * apart in two rows and there is exactly one stall GLB. The paid answer is a
 * second and third generated markings variant; the free answer, which an earlier
 * blind A/B already demonstrated, is that a shared FRAME reads as a market
 * rather than as copy-paste as soon as the GOODS differ - so it is taken here
 * before anything is spent.
 *
 * Not a tint on the body. `Cottage.wallColor` and `ShopBuilding.wallColor` still
 * exist and still drive their fallbacks, and wiring either to a generated body
 * would multiply a hand-picked colour into an albedo that already carries one -
 * the exact double-tint CLAUDE.md records for the village cobbles. These are
 * additive meshes standing ON the counter, so the baked albedo is untouched.
 *
 * COUNTER HEIGHT IS MEASURED, NOT INHERITED. The fallback's table top sits at
 * 0.9 m, which is a fact about the PRIMITIVE. `test-results/pass6/stall-surfaces.mjs`
 * histograms up-facing triangle area by height on the shipped GLB: the generated
 * stall's counter is a 1.445 m2 spike at y 0.85, three times the next bin,
 * spanning x -0.51..0.48 and z -0.90..0.86. Everything below is placed inside
 * that rectangle and stands on that plane. Goods reach y 1.2 at most; the awning
 * underside is at 1.75, so nothing intersects it.
 *
 * All of this is plain static geometry with no injection, so `StaticMeshBatch`
 * merges it into the village batch and `applyBatchWorldSurface` finishes it -
 * these add produce to the frame, not draw calls to the budget.
 */
const STALL_GOODS_MATERIALS = {
  crate: new THREE.MeshStandardMaterial({ color: '#8d6a45', roughness: 0.92 }),
  apple: new THREE.MeshStandardMaterial({ color: '#c0392b', roughness: 0.55 }),
  cabbage: new THREE.MeshStandardMaterial({ color: '#6b8e3d', roughness: 0.78 }),
  pumpkin: new THREE.MeshStandardMaterial({ color: '#c9702a', roughness: 0.7 }),
  cheese: new THREE.MeshStandardMaterial({ color: '#d9b45a', roughness: 0.68 }),
  loaf: new THREE.MeshStandardMaterial({ color: '#b0763f', roughness: 0.85 }),
  sack: new THREE.MeshStandardMaterial({ color: '#c8bda3', roughness: 1 }),
  cloth: new THREE.MeshStandardMaterial({ color: '#8a6f8e', roughness: 0.95 }),
};

/** Shared primitives, so four dressed stalls cost eight geometries in total. */
const STALL_GOODS_GEOMETRY = {
  crate: new THREE.BoxGeometry(1, 1, 1),
  round: new THREE.SphereGeometry(0.5, 10, 8),
  wheel: new THREE.CylinderGeometry(0.5, 0.5, 1, 14),
  loaf: new THREE.CapsuleGeometry(0.5, 0.6, 3, 8),
};

interface StallGood {
  geometry: keyof typeof STALL_GOODS_GEOMETRY;
  material: keyof typeof STALL_GOODS_MATERIALS;
  position: [number, number, number];
  scale: [number, number, number];
  rotation?: [number, number, number];
}

/** The counter plane, measured off the shipped GLB. */
const STALL_COUNTER_Y = 0.85;

/**
 * Four dressings. Each is a different TRADE, not a recolour of the same one:
 * the point is that a passer-by reads four merchants, and two stalls of
 * differently-coloured apples read as one merchant with a paint problem.
 */
const STALL_DRESSINGS: readonly (readonly StallGood[])[] = [
  // Greengrocer: an open crate of apples and two cabbages.
  [
    {
      geometry: 'crate',
      material: 'crate',
      position: [-0.05, 0.13, -0.5],
      scale: [0.62, 0.26, 0.62],
    },
    {
      geometry: 'round',
      material: 'apple',
      position: [-0.19, 0.32, -0.62],
      scale: [0.16, 0.14, 0.16],
    },
    {
      geometry: 'round',
      material: 'apple',
      position: [0.08, 0.32, -0.6],
      scale: [0.16, 0.14, 0.16],
    },
    {
      geometry: 'round',
      material: 'apple',
      position: [-0.05, 0.33, -0.36],
      scale: [0.16, 0.14, 0.16],
    },
    {
      geometry: 'round',
      material: 'cabbage',
      position: [0.02, 0.13, 0.31],
      scale: [0.26, 0.24, 0.26],
    },
    {
      geometry: 'round',
      material: 'cabbage',
      position: [-0.18, 0.12, 0.56],
      scale: [0.23, 0.21, 0.23],
    },
  ],
  // Dairy: stacked cheese wheels and a folded cloth.
  [
    {
      geometry: 'wheel',
      material: 'cheese',
      position: [-0.12, 0.09, -0.45],
      scale: [0.42, 0.18, 0.42],
    },
    {
      geometry: 'wheel',
      material: 'cheese',
      position: [-0.12, 0.26, -0.45],
      scale: [0.34, 0.16, 0.34],
    },
    {
      geometry: 'wheel',
      material: 'cheese',
      position: [0.14, 0.08, 0.12],
      scale: [0.38, 0.16, 0.38],
    },
    {
      geometry: 'crate',
      material: 'cloth',
      position: [-0.02, 0.05, 0.62],
      scale: [0.7, 0.1, 0.42],
      rotation: [0, 0.18, 0],
    },
  ],
  // Baker: loaves laid across the counter and a flour sack against the post.
  [
    {
      geometry: 'loaf',
      material: 'loaf',
      position: [-0.16, 0.1, -0.55],
      scale: [0.19, 0.34, 0.19],
      rotation: [Math.PI / 2, 0, 0.1],
    },
    {
      geometry: 'loaf',
      material: 'loaf',
      position: [0.1, 0.1, -0.5],
      scale: [0.19, 0.34, 0.19],
      rotation: [Math.PI / 2, 0, -0.16],
    },
    {
      geometry: 'loaf',
      material: 'loaf',
      position: [-0.04, 0.1, -0.2],
      scale: [0.19, 0.34, 0.19],
      rotation: [Math.PI / 2, 0, 0.05],
    },
    { geometry: 'round', material: 'sack', position: [0.06, 0.19, 0.5], scale: [0.42, 0.38, 0.34] },
    {
      geometry: 'round',
      material: 'sack',
      position: [-0.22, 0.16, 0.66],
      scale: [0.34, 0.32, 0.3],
    },
  ],
  // Autumn produce: pumpkins, which are the only goods big enough to break the
  // counter's silhouette from the square camera 8 m away.
  [
    {
      geometry: 'round',
      material: 'pumpkin',
      position: [-0.14, 0.19, -0.5],
      scale: [0.4, 0.34, 0.4],
    },
    {
      geometry: 'round',
      material: 'pumpkin',
      position: [0.14, 0.16, -0.16],
      scale: [0.34, 0.28, 0.34],
    },
    {
      geometry: 'round',
      material: 'pumpkin',
      position: [-0.06, 0.15, 0.28],
      scale: [0.31, 0.26, 0.31],
    },
    {
      geometry: 'crate',
      material: 'crate',
      position: [0.06, 0.11, 0.66],
      scale: [0.56, 0.22, 0.5],
      rotation: [0, -0.22, 0],
    },
  ],
];

const StallGoods = React.memo<{ dressing: number }>(({ dressing }) => (
  <group position={[0, STALL_COUNTER_Y, 0]}>
    {STALL_DRESSINGS[dressing % STALL_DRESSINGS.length].map((good, index) => (
      <mesh
        key={index}
        position={good.position}
        rotation={good.rotation}
        scale={good.scale}
        castShadow
        receiveShadow
      >
        <primitive object={STALL_GOODS_GEOMETRY[good.geometry]} attach="geometry" />
        <primitive object={STALL_GOODS_MATERIALS[good.material]} attach="material" />
      </mesh>
    ))}
  </group>
));
StallGoods.displayName = 'StallGoods';

/**
 * `color1` / `color2` chose the awning stripes. There is one generated stall, so
 * every pitch in the market now wears the same dyed canvas - which is what the
 * standing art verdict asked for ("saturated primaries... plastic toys"), but
 * it is also one stall repeated. Kept as props for the fallback.
 */
const MarketStall = React.memo<{
  position: [number, number, number];
  rotation?: number;
  color1?: string;
  color2?: string;
  /**
   * Which of `STALL_DRESSINGS` this pitch sells. Explicit rather than hashed
   * from the position: four stalls and four dressings should be a bijection,
   * and `instanceNoise` would happily give two of them the same trade.
   */
  dressing?: number;
}>(({ position, rotation = 0, color1, color2, dressing = 0 }) => (
  // The four stalls stand in two rows 8 m apart and were the clearest case
  // either reviewer named - "same awning, same crate arrangement, near-same
  // rotation". Yaw is what a market stall actually varies in.
  <group
    position={position}
    rotation={[0, rotation + instanceYaw(position), 0]}
    scale={instanceScale(position)}
  >
    <GeneratedBody
      asset="marketstall"
      fallback={<MarketStallPrimitiveBody color1={color1} color2={color2} />}
    />
    {/* INSIDE the yawed group, so the goods turn with the counter they stand
        on. Outside it they would slide off the table by up to 0.1 m at the
        3.4 degree jitter, which is enough to float one crate in mid-air. */}
    <StallGoods dressing={dressing} />
  </group>
));
MarketStall.displayName = 'MarketStall';

// ===== POSTBOX =====
const PostboxPrimitiveBody = React.memo(() => (
  <group>
    {/* Main cylinder body */}
    <mesh position={[0, 0.65, 0]} castShadow>
      <cylinderGeometry args={[0.28, 0.28, 1.3, 12]} />
      <primitive object={SM.red} attach="material" />
    </mesh>
    {/* Flatter dome top - like real British pillar box */}
    <mesh position={[0, 1.22, 0]} castShadow>
      <sphereGeometry args={[0.28, 12, 6, 0, Math.PI * 2, 0, Math.PI / 3]} />
      <primitive object={SM.red} attach="material" />
    </mesh>
    {/* Mail slot - higher up like real pillar box */}
    <mesh position={[0, 1.05, 0.29]}>
      <boxGeometry args={[0.22, 0.06, 0.02]} />
      <primitive object={SM.black} attach="material" />
    </mesh>
    {/* Collection times plate */}
    <mesh position={[0, 0.5, 0.29]}>
      <boxGeometry args={[0.18, 0.12, 0.01]} />
      <primitive object={SM.white} attach="material" />
    </mesh>
  </group>
));
PostboxPrimitiveBody.displayName = 'PostboxPrimitiveBody';

const Postbox = React.memo<{ position: [number, number, number]; rotation?: number }>(
  ({ position, rotation = 0 }) => (
    <group position={position} rotation={[0, rotation, 0]}>
      <GeneratedBody asset="postbox" fallback={<PostboxPrimitiveBody />} />
    </group>
  )
);
Postbox.displayName = 'Postbox';

// ===== FOUNTAIN =====
// Animated water assets - module level, shared by the single fountain instance.
// Deterministic canvas texture (no Math.random) with wavy highlight streaks.
const createFountainWaterTexture = (): THREE.CanvasTexture => {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#5c8a6a';
    ctx.fillRect(0, 0, 64, 64);
    ctx.strokeStyle = 'rgba(220, 240, 255, 0.35)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      const y = i * 8 + 4;
      for (let x = 0; x <= 64; x += 4) {
        const yy = y + Math.sin((x / 64) * Math.PI * 2 + i * 1.7) * 3;
        if (x === 0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};

// Separate texture instances: surface and falling water scroll at different rates
const fountainWaterTexture = createFountainWaterTexture();
const fountainFallTexture = createFountainWaterTexture();

const fountainWaterMaterial = new THREE.MeshStandardMaterial({
  color: '#7fb2d8',
  map: fountainWaterTexture,
  transparent: true,
  opacity: 0.85,
  roughness: 0.15,
  metalness: 0, // dielectric - see the pond material
});

// Narrow additive falling-water sheath (transparent overlay - depthWrite off is correct)
const fountainFallMaterial = new THREE.MeshBasicMaterial({
  color: '#cfe8ff',
  map: fountainFallTexture,
  transparent: true,
  opacity: 0.3,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
});

/**
 * Moulded basin for the market fountain.
 *
 * 7 m across and 0.6 m tall, the centrepiece of the market square with four
 * stalls set around it - walk-up-and-lean-on geometry, not a distant
 * silhouette. `CylinderGeometry(3, 3.5, 0.6, 32)` was a bare tapered drum: no
 * plinth, no coping, nothing for a shadow to catch on.
 *
 * The profile is a stone basin read from the bottom up: a splayed plinth whose
 * widest ring sits at y=-0.186 (world 0.114, just under the cobble sheet at
 * 0.12, so the flare washes into the paving rather than hovering above it); a
 * bowl wall with a slight entasis, slimmest at 3.11; a quirk - a recessed
 * groove at 3.13 - and then the coping springing out over it to a rolled crest
 * at 3.35 before turning in to the flat rim band. The quirk is the feature
 * that does the work at distance: it is what puts a hard shadow line under the
 * coping, and a moulding without one reads as a smooth bulge.
 *
 * The last three points dish the top face 38 mm below the rim between radius
 * 2.6 and the centre. The water sheet lies in that dish with its underside
 * open, and at 0.85 opacity the stone shows through it as apparent depth.
 *
 * Envelope: max radius 3.50, y in [-0.30, 0.30] - identical to the cylinder.
 * 627 vertices, one shared geometry on a single instance, no pointer handler.
 */
const FOUNTAIN_POOL = new THREE.LatheGeometry(
  latheProfile([
    [3.34, -0.3], // foot, below the paving
    [3.43, -0.238],
    [3.5, -0.186], // plinth top - envelope max radius
    [3.45, -0.16], // plinth wash
    [3.26, -0.112],
    [3.16, -0.036],
    [3.11, 0.042], // entasis - the wall's slimmest point
    [3.12, 0.104],
    [3.135, 0.15],
    [3.13, 0.182], // quirk: the groove that throws the coping's shadow
    [3.26, 0.212], // coping springs out over the groove
    [3.34, 0.248],
    [3.35, 0.268], // coping roll crest
    [3.3, 0.29],
    [3.18, 0.3], // coping outer top edge
    [2.85, 0.3], // coping band inner edge
    [2.6, 0.292],
    [1.5, 0.272],
    [0.0, 0.262], // dished floor centre, 38 mm below the rim
  ]),
  32
);

/**
 * Water surface in the base pool.
 *
 * `CylinderGeometry(2.8, 2.8, 0.1, 32)` gave the pool a 100 mm vertical blue
 * wall standing proud of the stone - a coaster, not a body of water. This is
 * the same envelope drawn as a sheet: nearly flat across the middle, then
 * sweeping down over the last 400 mm of radius to die into the coping at
 * (2.80, -0.05). The waterline stops being an edge and becomes a curve.
 *
 * Open at both ends on purpose. The inner ring at radius 0.30 is swallowed by
 * the pedestal, whose radius over this height is 0.38 - the hole can never
 * show. There is no bottom cap because the sheet lies directly on the pool's
 * dished top face, which is what should be visible through it.
 *
 * Envelope: max radius 2.80, y in [-0.05, 0.05] - identical to the cylinder,
 * so the mesh stays at y=0.65 and the ripple ring above it does not move.
 * Held at the pool's 32 segments: same count, same vertex angles, so the stone
 * margin outboard of the waterline is constant all the way round.
 *
 * Traversed OUTER to INNER, and that direction is load-bearing rather than
 * stylistic: LatheGeometry takes its winding and its normals from the order of
 * the profile, so an open sheet walked inner-to-outer comes out facing
 * downwards and is culled by the default FrontSide material. It renders
 * identically in the Blender preview either way - workbench does not backface
 * cull - so this is a mistake the previews cannot catch.
 */
const FOUNTAIN_WATER = new THREE.LatheGeometry(
  latheProfile([
    [2.8, -0.05], // waterline - dies into the coping band; envelope max r and -y
    [2.74, -0.038],
    [2.62, -0.014],
    [2.4, 0.01],
    [1.95, 0.03],
    [1.3, 0.042],
    [0.62, 0.048],
    [0.3, 0.05], // inner ring - inside the pedestal; envelope max +y
  ]),
  32
);

/**
 * Baluster pedestal carrying the upper bowl.
 *
 * 2.4 m tall, and only the top 1.9 m of it is ever seen: everything below
 * world 0.70 is inside the pool's stone or its water. `CylinderGeometry(0.3,
 * 0.4, 2.4, 12)` put its widest ring at the very bottom, where it is buried.
 * Here the max-radius ring is a base torus at y=-0.80 - world 0.70, right at
 * the waterline - so the envelope's widest point is also the moulding a viewer
 * actually reads, and the shaft appears to rise out of the water on a foot.
 *
 * Above it: a shaft with an entasis bellying to 0.29 at mid-height, a neck
 * with an astragal bead, and a capital that coves out to a 0.315 abacus at
 * y=+1.02. The abacus is deliberately below y=+1.10 (world 2.52 against the
 * bowl's underside at 2.60): put any higher and the capital is swallowed by
 * the bowl and the pedestal reads as a pipe pushed through a saucer.
 *
 * Radius over world 0.60-0.70 stays 0.38, comfortably outside the water
 * sheet's 0.30 inner hole. Envelope: max radius 0.40, y in [-1.20, 1.20] -
 * identical to the cylinder. 20 segments: the mouldings are turned stone and
 * want roundness, and 0.4 m across that leaves a 5 mm inset.
 */
const FOUNTAIN_PEDESTAL = new THREE.LatheGeometry(
  latheProfile([
    [0.38, -1.2], // buried in the pool floor
    [0.38, -0.86],
    [0.4, -0.8], // base torus at the waterline - envelope max radius
    [0.37, -0.74],
    [0.3, -0.69], // fillet in to the shaft
    [0.285, -0.56],
    [0.29, -0.3], // entasis - the shaft's belly
    [0.28, 0.0],
    [0.255, 0.32],
    [0.225, 0.64],
    [0.205, 0.76], // neck
    [0.22, 0.815], // astragal bead
    [0.203, 0.865],
    [0.245, 0.925], // capital coves out
    [0.295, 0.985],
    [0.315, 1.02], // abacus - world 2.52, clear of the bowl underside at 2.60
    [0.31, 1.07],
    [0.285, 1.095],
    [0.285, 1.2], // stub swallowed by the bowl
    [0.0, 1.2],
  ]),
  20
);

/**
 * Upper tier - the tazza the fountain falls from.
 *
 * 2 m across at 2.8 m, so it is read from below by anyone standing in the
 * square: the underside is more visible than the inside. `CylinderGeometry(1,
 * 0.8, 0.4, 12)` gave that underside a flat disc and the rim a square edge.
 *
 * This sweeps the underside as a cove springing off the pedestal's capital at
 * radius 0.26 - inside the pedestal's 0.281 inscribed radius at that height,
 * so the joint can never gap - and out to a rim that rolls over at 1.00. A
 * quirk at 0.905 undercuts the rim so it reads as a lip rather than a
 * thickening, the same trick as the pool coping.
 *
 * Left solid. The bowl's own water disc (radius 0.8, opaque, 25 mm proud of
 * the rim) covers everything a hollow would have revealed, so hollowing it
 * would be vertices spent on a surface no camera can reach.
 *
 * Envelope: max radius 1.00 at the rim, y in [-0.20, 0.20] - identical to the
 * cylinder.
 */
const FOUNTAIN_BOWL = new THREE.LatheGeometry(
  latheProfile([
    [0.26, -0.2], // springs off the pedestal capital - envelope min y
    [0.36, -0.198],
    [0.48, -0.186],
    [0.6, -0.162],
    [0.71, -0.126], // cove underside
    [0.805, -0.078],
    [0.875, -0.022],
    [0.915, 0.034],
    [0.93, 0.08],
    [0.905, 0.11], // quirk: shadow line beneath the rim
    [0.948, 0.142],
    [1.0, 0.176], // rim crest - envelope max radius
    [0.985, 0.2], // rolled inward - envelope max +y
    [0.86, 0.2],
    [0.0, 0.2], // flat top, under the bowl water
  ]),
  24
);

const FountainPrimitiveBody = React.memo(() => {
  const rippleRef = useRef<THREE.Mesh>(null);
  const rippleMaterialRef = useRef<THREE.MeshStandardMaterial>(null);

  useFrame((state, delta) => {
    // Throttle to every 3rd frame; compensate delta (ConveyorSystem convention)
    const throttle = 3;
    if (!shouldRunThisFrame(throttle)) return;
    const cappedDelta = Math.min(delta * throttle, 0.1);

    // Scroll water surface slowly; falling water streams downward fast
    fountainWaterTexture.offset.x += cappedDelta * 0.02;
    fountainWaterTexture.offset.y += cappedDelta * 0.035;
    fountainFallTexture.offset.y -= cappedDelta * 0.9;

    // Faint ripple ring expanding from the column
    if (rippleRef.current && rippleMaterialRef.current) {
      const phase = (state.clock.elapsedTime * 0.35) % 1;
      const s = 1 + phase * 1.6;
      rippleRef.current.scale.set(s, s, 1);
      rippleMaterialRef.current.opacity = 0.28 * (1 - phase);
    }
  });

  return (
    <group>
      {/* Base pool - see FOUNTAIN_POOL for the plinth, quirk and coping. */}
      <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
        <primitive object={FOUNTAIN_POOL} attach="geometry" />
        <primitive object={SM.stone} attach="material" />
      </mesh>
      {/* Lower water - animated scrolling surface, drawn as a feathered sheet
          that dies into the coping rather than a slab standing on it. */}
      <mesh position={[0, 0.65, 0]}>
        <primitive object={FOUNTAIN_WATER} attach="geometry" />
        <primitive object={fountainWaterMaterial} attach="material" />
      </mesh>
      {/* Ripple ring - faint, expands outward from the column */}
      <mesh ref={rippleRef} position={[0, 0.72, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.5, 0.75, 24]} />
        {/* Lit: a ripple is water, not a light source, so it must not glow at night. */}
        <meshStandardMaterial
          ref={rippleMaterialRef}
          color="#dbeafe"
          roughness={0.2}
          metalness={0}
          transparent
          opacity={0.28}
          depthWrite={false}
        />
      </mesh>
      {/* Pedestal - see FOUNTAIN_PEDESTAL for the base torus and the capital. */}
      <mesh position={[0, 1.5, 0]} castShadow>
        <primitive object={FOUNTAIN_PEDESTAL} attach="geometry" />
        <primitive object={SM.stone} attach="material" />
      </mesh>
      {/* Upper tier - see FOUNTAIN_BOWL for the cove underside and rolled rim. */}
      <mesh position={[0, 2.8, 0]} castShadow>
        <primitive object={FOUNTAIN_BOWL} attach="geometry" />
        <primitive object={SM.stone} attach="material" />
      </mesh>
      <mesh position={[0, 2.95, 0]}>
        <cylinderGeometry args={[0.8, 0.8, 0.15, 12]} />
        <primitive object={SM.water} attach="material" />
      </mesh>
      {/* Falling water - narrow open-ended cone from top bowl to pool */}
      <mesh position={[0, 1.85, 0]}>
        <cylinderGeometry args={[0.22, 0.55, 2.2, 12, 1, true]} />
        <primitive object={fountainFallMaterial} attach="material" />
      </mesh>
      {/* Bird perched on edge */}
      <group
        position={[0.7, 3.1, 0]}
        rotation={[0, -0.5, 0]}
        onClick={(e) => {
          e.stopPropagation();
          playCritterSound('bird');
        }}
        onPointerOver={setPointerCursor}
        onPointerOut={resetCursor}
      >
        <mesh position={[0, 0.1, 0]}>
          <sphereGeometry args={[0.12, 8, 8]} />
          <meshStandardMaterial color="#4a4a4a" />
        </mesh>
        <mesh position={[0, 0, 0.08]}>
          <sphereGeometry args={[0.08, 8, 8]} />
          <meshStandardMaterial color="#4a4a4a" />
        </mesh>
        <mesh position={[0, 0, 0.15]}>
          <coneGeometry args={[0.03, 0.08, 4]} />
          <meshStandardMaterial color="#ffa500" />
        </mesh>
      </group>
    </group>
  );
});
FountainPrimitiveBody.displayName = 'FountainPrimitiveBody';

/**
 * Water plane of the generated basin, in the asset's own metres.
 *
 * Measured the way the duck pond's `sink` was, by AREA-weighting the asset's
 * up-facing triangles rather than counting vertices: 4.41 m2 of horizontal
 * surface sits at y 1.25 between radius 0.34 and 1.30, which is a flat annulus
 * of water inside a coping whose own top is at 1.45 and whose outer edge is at
 * 1.57. A vertex histogram would have picked the coping, because the coping is
 * where the triangles are.
 */
const GENERATED_FOUNTAIN_WATER_Y = 1.25;
const GENERATED_FOUNTAIN_WATER_INNER = 0.36;
const GENERATED_FOUNTAIN_WATER_OUTER = 1.28;

/**
 * Overlay material for the generated basin.
 *
 * Shares `fountainWaterTexture` with the primitive - one scroll drives both -
 * but at a third of the opacity, because this lies OVER a baked water surface
 * rather than standing in for one. At 0.85 it would replace the asset's own
 * water with a canvas texture, which is the swap running backwards.
 */
const generatedFountainWaterMaterial = new THREE.MeshStandardMaterial({
  color: '#9ecbe8',
  map: fountainWaterTexture,
  transparent: true,
  opacity: 0.3,
  roughness: 0.15,
  metalness: 0,
  depthWrite: false,
});

/**
 * The two animations the fountain swap cost, put back on the generated basin.
 *
 * The generated fountain is a single mesh carrying its own static water, so
 * unlike the windmill there is no rigid sub-assembly to drive - but neither
 * lost animation was ever geometry. One is a texture scroll and the other is a
 * ring that grows and fades, and both can be laid over the asset at its own
 * measured water height.
 *
 * Rendered INSIDE `GeneratedBoundary` rather than hoisted beside it, which is
 * the difference from `ChimneySmoke`: the primitive fountain still owns water
 * of its own at y 0.65, so an overlay that rendered on both paths would float a
 * second sheet 0.6 m above the fallback's basin. Here it renders only once the
 * GLB has resolved - exactly when the asset's own water is what is underneath.
 */
const GeneratedFountainWater: React.FC = () => {
  const rippleRef = useRef<THREE.Mesh>(null);
  const rippleMaterialRef = useRef<THREE.MeshStandardMaterial>(null);

  useFrame((state, delta) => {
    const throttle = 3;
    if (!shouldRunThisFrame(throttle)) return;
    const cappedDelta = Math.min(delta * throttle, 0.1);
    fountainWaterTexture.offset.x += cappedDelta * 0.02;
    fountainWaterTexture.offset.y += cappedDelta * 0.035;

    if (rippleRef.current && rippleMaterialRef.current) {
      const phase = (state.clock.elapsedTime * 0.35) % 1;
      // Grows from the pedestal to the coping: 0.34 to 1.3 over the asset's
      // own annulus, rather than the primitive's 1x to 2.6x of a 0.5 m ring.
      const s = 1 + phase * 2.4;
      rippleRef.current.scale.set(s, s, 1);
      rippleMaterialRef.current.opacity = 0.26 * (1 - phase);
    }
  });

  return (
    <group>
      {/* Sheet over the asset's own water. 8 mm proud: enough to win the depth
          test at every angle this square is read from, far too little to read
          as a step at the coping. `depthWrite` is off, as for every transparent
          overlay in this file. */}
      <mesh position={[0, GENERATED_FOUNTAIN_WATER_Y + 0.008, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[GENERATED_FOUNTAIN_WATER_INNER, GENERATED_FOUNTAIN_WATER_OUTER, 48]} />
        <primitive object={generatedFountainWaterMaterial} attach="material" />
      </mesh>
      {/* Ripple ring, expanding from the column. */}
      <mesh
        ref={rippleRef}
        position={[0, GENERATED_FOUNTAIN_WATER_Y + 0.014, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <ringGeometry args={[0.38, 0.5, 32]} />
        {/* Lit: a ripple is water, not a light source, so it must not glow at night. */}
        <meshStandardMaterial
          ref={rippleMaterialRef}
          color="#dbeafe"
          roughness={0.2}
          metalness={0}
          transparent
          opacity={0.26}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
};
GeneratedFountainWater.displayName = 'GeneratedFountainWater';

/**
 * The generated basin with its water moving again.
 *
 * The swap cost the scroll and the ripple because both lived on meshes inside
 * `FountainPrimitiveBody`; `GeneratedFountainWater` puts them back over the
 * asset's own surface. The falling-water sheath is deliberately NOT restored -
 * the primitive's cone runs between two heights this asset does not share, and
 * guessing where a generated spout ends is how the duck pond lost three cycles.
 */
const Fountain = React.memo<{ position: [number, number, number] }>(({ position }) => (
  <group position={position}>
    <GeneratedBoundary fallback={<FountainPrimitiveBody />}>
      <GeneratedModel asset="fountain" />
      <GeneratedFountainWater />
    </GeneratedBoundary>
  </group>
));
Fountain.displayName = 'Fountain';

// ===== HORSE =====
// Redesigned v3: Detailed segmented model, clearer proportions
const Horse = React.memo<{ position: [number, number, number]; rotation?: number; color?: string }>(
  ({ position, rotation = 0, color = '#8d6e63' }) => {
    const [isExcited, setIsExcited] = React.useState(false);
    const [hearts, setHearts] = React.useState<{ id: number; pos: [number, number, number] }[]>([]);
    const groupRef = React.useRef<THREE.Group>(null);
    // Monotonic id avoids React key collisions on rapid pets (as Cat and Crow).
    const nextHeartId = React.useRef(0);

    // A horse unmounted while hovered must not leave the pointer cursor stuck.
    React.useEffect(() => resetCursor, []);

    const handlePet = (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      setIsExcited(true);
      playCritterSound('horse');
      const id = nextHeartId.current++;
      setHearts((prev) => [...prev, { id, pos: [0, 2.5, 0] }]);
    };

    const removeHeart = (id: number) => {
      setHearts((prev) => prev.filter((h) => h.id !== id));
    };

    // Restored. Only does work while the animal is actually excited, so the
    // steady-state cost is one ref check per frame.
    useFrame((state) => {
      const group = groupRef.current;
      if (!group) return;
      if (isExcited) {
        const t = state.clock.elapsedTime * 15;
        group.rotation.z = Math.sin(t) * 0.05; // Shake
        group.position.y = Math.abs(Math.sin(t * 0.5)) * 0.1; // Rear up slightly
      } else if (group.position.y !== 0 || group.rotation.z !== 0) {
        group.rotation.z = 0;
        group.position.y = 0;
      }
    });

    React.useEffect(() => {
      if (isExcited) {
        const t = setTimeout(() => setIsExcited(false), 800);
        return () => clearTimeout(t);
      }
    }, [isExcited]);

    return (
      <group
        position={position}
        rotation={[0, rotation, 0]}
        scale={0.6}
        onClick={handlePet}
        onPointerOver={setPointerCursor}
        onPointerOut={resetCursor}
      >
        <group ref={groupRef}>
          {/* Main Body Group */}
          <group position={[0, 1.4, 0]}>
            {/* Torso */}
            <mesh castShadow rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.55, 0.6, 1.2, 12]} />
              <meshStandardMaterial color={color} />
            </mesh>
            {/* Shoulders */}
            <mesh position={[0, 0.1, 0.7]} castShadow>
              <sphereGeometry args={[0.62, 12, 12]} />
              <meshStandardMaterial color={color} />
            </mesh>
            {/* Hindquarters */}
            <mesh position={[0, 0.15, -0.7]} castShadow>
              <sphereGeometry args={[0.65, 12, 12]} />
              <meshStandardMaterial color={color} />
            </mesh>
          </group>

          {/* Neck - Max upright/proud */}
          <group position={[0, 2.1, 0.9]} rotation={[0.4, 0, 0]}>
            <mesh position={[0, 0.5, 0]} castShadow>
              <cylinderGeometry args={[0.25, 0.45, 1.2, 12]} />
              <meshStandardMaterial color={color} />
            </mesh>
            {/* Mane */}
            <mesh position={[0, 0.4, -0.3]} rotation={[0, 0, 0]}>
              <boxGeometry args={[0.1, 1.3, 0.2]} />
              <meshStandardMaterial color="#3e2723" />
            </mesh>
          </group>

          {/* Head */}
          <group position={[0, 3.1, 1.6]} rotation={[0.3, 0, 0]}>
            <mesh castShadow>
              <boxGeometry args={[0.35, 0.35, 0.7]} />
              <meshStandardMaterial color={color} />
            </mesh>
            <mesh position={[0, -0.05, 0.35]} castShadow>
              <boxGeometry args={[0.25, 0.25, 0.4]} />
              <meshStandardMaterial color="#5d4037" />
            </mesh>
            {/* Ears - Larger and more prominent */}
            {[-0.12, 0.12].map((x, i) => (
              <mesh key={i} position={[x, 0.35, -0.2]} rotation={[0.2, 0, x > 0 ? -0.3 : 0.3]}>
                <coneGeometry args={[0.08, 0.2, 4]} />
                <meshStandardMaterial color={color} />
              </mesh>
            ))}
            {/* Eyes - Moved to side of head */}
            {[-0.16, 0.16].map((x, i) => (
              <mesh key={i} position={[x, 0.1, 0.1]}>
                <sphereGeometry args={[0.065, 8, 8]} />
                <meshStandardMaterial color="black" />
              </mesh>
            ))}
            {/* Forelock */}
            <mesh position={[0, 0.2, 0.2]} rotation={[0.2, 0, 0]}>
              <boxGeometry args={[0.05, 0.2, 0.3]} />
              <meshStandardMaterial color="#3e2723" />
            </mesh>
          </group>

          {/* Legs */}
          {/* Front Left */}
          <group position={[-0.35, 1.4, 0.7]}>
            <mesh position={[0, -0.4, 0]}>
              <cylinderGeometry args={[0.12, 0.15, 0.8, 8]} />
              <meshStandardMaterial color={color} />
            </mesh>
            <mesh position={[0, -1.1, 0]}>
              <cylinderGeometry args={[0.1, 0.11, 0.7, 8]} />
              <meshStandardMaterial color={color} />
            </mesh>
            <mesh position={[0, -1.5, 0]}>
              <cylinderGeometry args={[0.12, 0.15, 0.15, 8]} />
              <meshStandardMaterial color="#1a1110" />
            </mesh>
          </group>
          {/* Front Right */}
          <group position={[0.35, 1.4, 0.7]}>
            <mesh position={[0, -0.4, 0]}>
              <cylinderGeometry args={[0.12, 0.15, 0.8, 8]} />
              <meshStandardMaterial color={color} />
            </mesh>
            <mesh position={[0, -1.1, 0]}>
              <cylinderGeometry args={[0.1, 0.11, 0.7, 8]} />
              <meshStandardMaterial color={color} />
            </mesh>
            <mesh position={[0, -1.5, 0]}>
              <cylinderGeometry args={[0.12, 0.15, 0.15, 8]} />
              <meshStandardMaterial color="#1a1110" />
            </mesh>
          </group>
          {/* Back Left */}
          <group position={[-0.35, 1.4, -0.7]}>
            <mesh position={[0, -0.3, 0]}>
              <cylinderGeometry args={[0.14, 0.18, 0.8, 8]} />
              <meshStandardMaterial color={color} />
            </mesh>
            <mesh position={[0, -1.0, 0]}>
              <cylinderGeometry args={[0.1, 0.12, 0.8, 8]} />
              <meshStandardMaterial color={color} />
            </mesh>
            <mesh position={[0, -1.5, 0]}>
              <cylinderGeometry args={[0.12, 0.15, 0.15, 8]} />
              <meshStandardMaterial color="#1a1110" />
            </mesh>
          </group>
          {/* Back Right */}
          <group position={[0.35, 1.4, -0.7]}>
            <mesh position={[0, -0.3, 0]}>
              <cylinderGeometry args={[0.14, 0.18, 0.8, 8]} />
              <meshStandardMaterial color={color} />
            </mesh>
            <mesh position={[0, -1.0, 0]}>
              <cylinderGeometry args={[0.1, 0.12, 0.8, 8]} />
              <meshStandardMaterial color={color} />
            </mesh>
            <mesh position={[0, -1.5, 0]}>
              <cylinderGeometry args={[0.12, 0.15, 0.15, 8]} />
              <meshStandardMaterial color="#1a1110" />
            </mesh>
          </group>

          {/* Tail */}
          <group position={[0, 1.7, -1.0]} rotation={[0.2, 0, 0]}>
            <mesh position={[0, -0.4, -0.2]} rotation={[-0.2, 0, 0]}>
              <cylinderGeometry args={[0.08, 0.15, 1.2, 8]} />
              <meshStandardMaterial color="#3e2723" />
            </mesh>
          </group>
        </group>
        {/* Local Hearts */}
        {hearts.map((h) => (
          <HeartParticle key={h.id} position={h.pos} onComplete={() => removeHeart(h.id)} />
        ))}
      </group>
    );
  }
);
Horse.displayName = 'Horse';

// ===== BLACKSMITH / FORGE =====
const ForgePrimitiveBody = React.memo(() => (
  <group>
    {/* Main building */}
    <mesh position={[0, 2.5, 0]} castShadow receiveShadow>
      <boxGeometry args={[7, 5, 6]} />
      <primitive object={SM.timber} attach="material" />
    </mesh>
    {/* Pyramid roof - raised to clear walls */}
    <mesh position={[0, 6.0, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
      <coneGeometry args={[5.5, 2.5, 4]} />
      <primitive object={SM.roofSlate} attach="material" />
    </mesh>
    {/* Large chimney */}
    <mesh position={[-2, 7, 0]} castShadow>
      <boxGeometry args={[1.5, 3, 1.5]} />
      <primitive object={SM.stone} attach="material" />
    </mesh>
    {/* Open front */}
    <mesh position={[0, 1.5, 3.01]}>
      <boxGeometry args={[4, 3, 0.1]} />
      <primitive object={SM.black} attach="material" />
    </mesh>
    {/* Anvil outside */}
    <mesh position={[2, 0.4, 4]} castShadow>
      <boxGeometry args={[0.6, 0.8, 0.4]} />
      <primitive object={SM.black} attach="material" />
    </mesh>
    {/* Sign */}
    <Text
      position={[0, 4.5, 3.1]}
      fontSize={0.35}
      color="#fef3c7"
      anchorX="center"
      anchorY="middle"
      font={FONT_URL}
    >
      BLACKSMITH
    </Text>
  </group>
));
ForgePrimitiveBody.displayName = 'ForgePrimitiveBody';

const Forge = React.memo<{ position: [number, number, number]; rotation?: number }>(
  ({ position, rotation = 0 }) => (
    <group position={position} rotation={[0, rotation, 0]}>
      <GeneratedBody asset="forge" fallback={<ForgePrimitiveBody />} />
      {/* Both hoisted out of the body. The horse is a whole animal that
          vanished from the village when the generated forge replaced the
          primitive one; it stands on the ground, so its coordinates are
          unchanged. The smoke is re-seated on the generated chimney: the
          highest up-facing surface in `forge.glb` is 0.89 m2 at y = 5.70,
          centroid x -0.41, z 1.75, against the primitive's [-2, 8.8, 0]. */}
      <ChimneySmoke position={[-0.4, 5.75, 1.75]} offset={2} />
      <Horse position={[-4, 0, 4]} rotation={Math.PI / 4} color="#795548" />
    </group>
  )
);
Forge.displayName = 'Forge';

// ===== ROUNDED VILLAGE GROUND =====
// Creates a rounded rectangle shape for naturalistic village boundary
const createRoundedRectShape = (width: number, height: number, radius: number): THREE.Shape => {
  const shape = new THREE.Shape();
  const hw = width / 2;
  const hh = height / 2;
  const r = Math.min(radius, hw, hh);

  shape.moveTo(-hw + r, -hh);
  shape.lineTo(hw - r, -hh);
  shape.quadraticCurveTo(hw, -hh, hw, -hh + r);
  shape.lineTo(hw, hh - r);
  shape.quadraticCurveTo(hw, hh, hw - r, hh);
  shape.lineTo(-hw + r, hh);
  shape.quadraticCurveTo(-hw, hh, -hw, hh - r);
  shape.lineTo(-hw, -hh + r);
  shape.quadraticCurveTo(-hw, -hh, -hw + r, -hh);

  return shape;
};

/** Building envelopes also locate the paths to their centre-facing entrances. */
export const VILLAGE_BUILDING_FOOTPRINTS = [
  { x: 0, z: -40, halfX: 9.5, halfZ: 7.5 }, // 18 m generated nave, including planting clearance
  { x: 0, z: -45, halfX: 3, halfZ: 3 }, // bell tower
  { x: 0, z: 20, halfX: 6.5, halfZ: 6.5 }, // town hall
  { x: -25, z: -15, halfX: 5, halfZ: 5 }, // pub
  { x: 22, z: 40, halfX: 5.5, halfZ: 5.5 }, // school
  { x: -22, z: -55, halfX: 5, halfZ: 5 }, // forge
  { x: 20, z: 5, halfX: 4, halfZ: 3.5 }, // baker
  { x: 20, z: -10, halfX: 4, halfZ: 3.5 }, // butcher
  { x: -20, z: 30, halfX: 4, halfZ: 3.5 }, // general store
  { x: -25, z: -35, halfX: 3.5, halfZ: 3.5 },
  { x: 25, z: -35, halfX: 3.5, halfZ: 3.5 },
  { x: 25, z: -50, halfX: 3.5, halfZ: 3.5 },
  { x: -25, z: 45, halfX: 3.5, halfZ: 3.5 },
  { x: 25, z: 55, halfX: 3.5, halfZ: 3.5 },
] as const;

/** Through streets stay clear of the buildings, well and pond. */
export const VILLAGE_STREET_CORRIDORS = [
  { x: -13, z: -36, halfX: 2.5, halfZ: 24 },
  { x: -12, z: 44, halfX: 2.5, halfZ: 18 },
  { x: 13, z: -23, halfX: 2.5, halfZ: 37 },
  { x: 10.25, z: 37, halfX: 2.5, halfZ: 25 },
  { x: 0, z: -56, halfX: 13, halfZ: 2.5 },
  { x: -0.875, z: 55, halfX: 11.125, halfZ: 2.5 },
] as const;

/**
 * One plan controls the existing cobble sheet and verge scatter.
 * Working if the square and entrances remain connected, with clear streets
 * and grass between the plots instead of a single 70 by 130 metre apron.
 */
export const VILLAGE_PAVED_AREAS = [
  { x: 0, z: 8, halfX: 16, halfZ: 20 },
  { x: 0, z: -40, halfX: 12, halfZ: 12 },
  ...VILLAGE_STREET_CORRIDORS,
  ...VILLAGE_BUILDING_FOOTPRINTS.filter((building) => Math.abs(building.x) > 10).map(
    ({ x, z, halfX }) => {
      const side = Math.sign(x);
      const streetX = side < 0 ? (z < -12 ? -13 : -12) : z <= 12 ? 13 : 10.25;
      const entranceX = x - side * halfX;
      return {
        x: (streetX + entranceX) / 2,
        z,
        halfX: Math.abs(entranceX - streetX) / 2 + 0.5,
        halfZ: 1.5,
      };
    }
  ),
] as const;

export const VILLAGE_COBBLE_TILE_METRES = 6;

// Memoized rounded ground shape with proper UVs for tiling
const villageGroundShape = createRoundedRectShape(70, 130, 12);
export const VILLAGE_GROUND_GEOMETRY = new THREE.ShapeGeometry(villageGroundShape, 24);

// The 512 / 14-cell texture resolves to roughly 17 cm stones at this repeat.
const uvAttr = VILLAGE_GROUND_GEOMETRY.attributes.uv;
const posAttr = VILLAGE_GROUND_GEOMETRY.attributes.position;
const HW = 35,
  HH = 65;

for (let i = 0; i < posAttr.count; i++) {
  const x = posAttr.getX(i);
  const y = posAttr.getY(i);
  uvAttr.setXY(i, (x + HW) / VILLAGE_COBBLE_TILE_METRES, (y + HH) / VILLAGE_COBBLE_TILE_METRES);
}
uvAttr.needsUpdate = true;

// Cobble material with edge feathering via custom shader injection
// Uses module-level villageCobbleColor and villageCobbleNormal textures
// polygonOffset with NEGATIVE values pushes toward camera, preventing z-fighting with TerrainGround
export const VILLAGE_GROUND_MATERIAL = new THREE.MeshStandardMaterial({
  // Was '#9a9a9a' to "correct washed-out texture appearance" - that wash was
  // the linear-decode bug, now fixed in the texture layer. Tinting on top of a
  // correctly decoded albedo double-darkens the square.
  color: '#ffffff',
  map: villageCobbleColor,
  normalMap: villageCobbleNormal,
  normalScale: new THREE.Vector2(0.4, 0.4),
  roughnessMap: villageCobbleRoughness,
  roughness: 1.0,
  transparent: true,
  polygonOffset: true,
  polygonOffsetFactor: POLYGON_OFFSET.moderate.factor,
  polygonOffsetUnits: POLYGON_OFFSET.moderate.units,
});

// Feather in the authored village coordinates, including its current yaw and
// scale. The former world-X offset pinned the mask to the abandoned site.
const villageWorldToLocal = new THREE.Matrix4()
  .compose(
    new THREE.Vector3(...SITE_LAYOUT.landmarks.village.position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...SITE_LAYOUT.landmarks.village.rotation)),
    new THREE.Vector3().setScalar(SITE_LAYOUT.landmarks.village.scale)
  )
  .invert();
VILLAGE_GROUND_MATERIAL.onBeforeCompile = (shader) => {
  shader.uniforms.uVillageWorldToLocal = { value: villageWorldToLocal };
  shader.uniforms.uVillagePavingRegions = {
    value: VILLAGE_PAVED_AREAS.map(
      ({ x, z, halfX, halfZ }) => new THREE.Vector4(x, z, halfX, halfZ)
    ),
  };
  shader.vertexShader = shader.vertexShader.replace(
    '#include <common>',
    `#include <common>
    uniform mat4 uVillageWorldToLocal;
    varying vec2 vLocalPos;`
  );
  shader.vertexShader = shader.vertexShader.replace(
    '#include <worldpos_vertex>',
    `#include <worldpos_vertex>
    vec4 millosVillageWorldPosition = modelMatrix * vec4(transformed, 1.0);
    vLocalPos = (uVillageWorldToLocal * millosVillageWorldPosition).xz;`
  );
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <common>',
    `#include <common>
    varying vec2 vLocalPos;
    uniform vec4 uVillagePavingRegions[${VILLAGE_PAVED_AREAS.length}];`
  );
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <dithering_fragment>',
    `#include <dithering_fragment>
    vec2 q = abs(vLocalPos) - vec2(23.0, 53.0);
    float d = 12.0 - min(max(q.x, q.y), 0.0) - length(max(q, 0.0));
    float feather = clamp(d * 0.16667, 0.0, 1.0);
    float pavedDistance = 1000.0;
    for (int i = 0; i < ${VILLAGE_PAVED_AREAS.length}; i++) {
      vec4 region = uVillagePavingRegions[i];
      vec2 pavingEdge = abs(vLocalPos - region.xy) - region.zw;
      pavedDistance = min(pavedDistance, max(pavingEdge.x, pavingEdge.y));
    }
    gl_FragColor.a *= feather * (1.0 - smoothstep(-0.25, 0.35, pavedDistance));`
  );
};
// Stable cache key so the feathering-injected variant gets its own compiled
// program and never shares a cache slot with a plain MeshStandardMaterial of
// identical params (which would render without the edge feathering).
VILLAGE_GROUND_MATERIAL.customProgramCacheKey = () => 'villageCobble_feather_v3';

// ============================================================
// VEGETATION LAYOUT (village-local coordinates)
// ============================================================

/** Same seven trees as before, now drawn by the instanced card-canopy field. */
const VILLAGE_TREES: readonly TreeInstance[] = [
  { position: [-30, 0, -55], scale: 1.2, type: 'oak' },
  { position: [30, 0, -60], scale: 1.0, type: 'birch' },
  { position: [-30, 0, 55], scale: 1.3, type: 'oak' },
  { position: [30, 0, 65], scale: 1.1, type: 'oak' },
  { position: [-30, 0, 0], scale: 0.9, type: 'birch' },
  { position: [30, 0, 20], scale: 1.2, type: 'oak' },
  { position: [-30, 0, 25], scale: 1.0, type: 'birch' },
];

const VILLAGE_TREE_SPOTS: readonly (readonly [number, number])[] = VILLAGE_TREES.map(
  (t) => [t.position[0], t.position[2]] as const
);

/**
 * Decal height. The village cobble sheet and the terrace under it both sit on
 * the ground datum (`EXTERIOR_LAYERS.ground`, -0.02), so a mulch ring takes the
 * overlay layer 1 cm above it - InstancedMulch's own default. Safe because the
 * material never writes depth and carries an `exteriorOverlay` polygon offset.
 * Divided by the authored scale, as the ground mesh is.
 */
const VILLAGE_DECAL_Y = EXTERIOR_LAYERS.groundOverlay / SITE_LAYOUT.landmarks.village.scale;

/** Building and water footprints no tuft may grow inside. */
const VILLAGE_BLOCKERS = [
  ...VILLAGE_BUILDING_FOOTPRINTS,
  { x: -10, z: -5, halfX: 2.2, halfZ: 2.2 }, // wishing well
  { x: 0, z: 6, halfX: 3.2, halfZ: 3.2 }, // fountain
  { x: 20, z: 25, halfX: 6, halfZ: 6 }, // duck pond
  { x: 0, z: 6, halfX: 10, halfZ: 10 }, // market square walking space
] as const;

/** Wall bases, rims and trunks: the junctions that read as a razor edge with
 *  nothing growing at them. */
const VILLAGE_WALL_BASES: readonly (readonly [number, number])[] = [
  [-5.6, -34],
  [5.6, -34],
  [-5.6, -46],
  [5.6, -46],
  [0, -33.4],
  [-2.6, -47.6],
  [2.6, -47.6],
  [-5.2, 26],
  [5.2, 26],
  [-5.2, 14],
  [5.2, 14],
  [-29, -15],
  [-21, -15],
  [-25, -19],
  [-25, -11],
  [17, 40],
  [27, 40],
  [22, 35],
  [22, 45],
  [-26, -55],
  [-18, -55],
  [-22, -59],
  [17, 5],
  [23, 5],
  [17, -10],
  [23, -10],
  [-23, 30],
  [-17, 30],
  [-27.6, -35],
  [-22.4, -35],
  [-25, -37.6],
  [22.4, -35],
  [27.6, -35],
  [25, -37.6],
  [22.4, -50],
  [27.6, -50],
  [25, -52.6],
  [-27.6, 45],
  [-22.4, 45],
  [-25, 42.4],
  [22.4, 55],
  [27.6, 55],
  [25, 57.6],
  [-10, -7.2],
  [-12.2, -5],
  [0, 8.6],
  [2.6, 6],
  [-30, -55],
  [30, -60],
  [-30, 55],
  [30, 65],
  [-30, 0],
  [30, 20],
  [-30, 25],
];

/**
 * Weeds in the joints at the base of every wall, well rim and trunk.
 * `openExclude` covers the whole area, so only attractor-pulled tufts survive
 * and the paved square itself stays clear.
 */
const VILLAGE_WEEDS: ClutterSpec = {
  count: 360,
  bounds: { minX: -34, maxX: 34, minZ: -64, maxZ: 64 },
  exclude: VILLAGE_BLOCKERS,
  openExclude: [{ x: 0, z: 0, halfX: 40, halfZ: 70 }],
  attractors: VILLAGE_WALL_BASES,
  // 5 mm under the -0.02 ground datum the cobble sheet sits on: sinking a
  // card base is invisible, floating one is not.
  y: (EXTERIOR_LAYERS.ground - 0.005) / SITE_LAYOUT.landmarks.village.scale,
  cullDistance: 95,
};

/** Rough verge grass in the ring outside the paved core. */
const VILLAGE_VERGE: ClutterSpec = {
  count: 620,
  bounds: { minX: -34, maxX: 34, minZ: -64, maxZ: 64 },
  exclude: [...VILLAGE_BLOCKERS, ...VILLAGE_PAVED_AREAS],
  // The terrace terrain is on the -0.02 ground datum; sink the blade roots 5 mm.
  y: (EXTERIOR_LAYERS.ground - 0.005) / SITE_LAYOUT.landmarks.village.scale,
  cullDistance: 130,
};

// ===== MAIN VILLAGE COMPONENT =====
export const VillageArea: React.FC = () => {
  // Selector optimization: Only re-render when night status CHANGES
  const isNight = useGameSimulationStore((state) => state.gameTime >= 20 || state.gameTime < 6);

  useEffect(() => {
    SM.windowGlass.color.set(isNight ? '#fef3c7' : '#93c5fd');
    SM.windowGlass.emissive.set(isNight ? '#f59e0b' : '#000000');
    SM.windowGlass.emissiveIntensity = isNight ? 1.8 : 0;
    SM.windowGlass.opacity = isNight ? 0.92 : 0.72;
    SM.clockFace.color.set(isNight ? '#ffffff' : '#1e293b');
    SM.clockFace.emissive.set(isNight ? '#ffffff' : '#000000');
    SM.clockFace.emissiveIntensity = isNight ? 1.5 : 0;
    SM.clockHands.color.set(isNight ? '#111827' : '#d4af37');
    // Binary, not a dimmer. '#111827' is F0 0.01 - far too dark to be a
    // conductor, so the night state is painted iron and the day state is gilt.
    SM.clockHands.metalness = isNight ? 0 : 1;
  }, [isNight]);

  // Clutter budget follows the graphics tier: cut-out cards are fill-rate
  // work, so 'low' drops them entirely rather than shrinking them.
  const density = useVegetationDensity();
  const weedSpec = useMemo<ClutterSpec>(() => ({ ...VILLAGE_WEEDS, density }), [density]);
  const vergeSpec = useMemo<ClutterSpec>(() => ({ ...VILLAGE_VERGE, density }), [density]);

  return (
    <group
      name="authored-village-site"
      position={SITE_LAYOUT.landmarks.village.position}
      rotation={SITE_LAYOUT.landmarks.village.rotation}
      scale={SITE_LAYOUT.landmarks.village.scale}
    >
      {/* Rounded cobblestone ground, seated on the village terrace. Divide
          the local ground offset by the authored scale.

          `VILLAGE_GROUND_MATERIAL` already carries `POLYGON_OFFSET.moderate` (-2)
          against the terrain's `exteriorBase` (+6), which is the whole of the
          separation now - and the material's alpha feathering wants it that
          way: the plaza is meant to dissolve into the grass at its rim, and a
          feathered edge held 14 cm in the air is a feathered edge with a
          shadow gap under it. The 0.12 this replaces was clearance for
          `TerrainGround`'s old 0.05 default. */}
      <mesh
        position={[0, EXTERIOR_LAYERS.ground / SITE_LAYOUT.landmarks.village.scale, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <primitive object={VILLAGE_GROUND_GEOMETRY} attach="geometry" />
        <primitive object={VILLAGE_GROUND_MATERIAL} attach="material" />
      </mesh>

      {/* === CHURCH === */}
      <ChurchBuilding position={[0, 0, -40]} rotation={0} isNight={isNight} />

      {/* === TOWN HALL === */}
      <TownHall position={[0, 0, 20]} rotation={Math.PI} />

      {/* === PUB === */}
      <Pub position={[-25, 0, -15]} rotation={Math.PI / 2} />

      {/* === SCHOOL === */}
      <School position={[22, 0, 40]} rotation={-Math.PI / 2} />

      {/* === FORGE === */}
      <Forge position={[-22, 0, -55]} rotation={Math.PI / 2} />

      {/* === SHOPS === */}
      <ShopBuilding
        position={[20, 0, 5]}
        rotation={-Math.PI / 2}
        wallColor="pink"
        signText="BAKER"
        awningColor="#f472b6"
      />
      <ShopBuilding
        position={[20, 0, -10]}
        rotation={-Math.PI / 2}
        wallColor="terracotta"
        signText="BUTCHER"
        awningColor="#dc2626"
      />
      <ShopBuilding
        position={[-20, 0, 30]}
        rotation={Math.PI / 2}
        wallColor="blue"
        signText="GENERAL STORE"
        awningColor="#3b82f6"
      />

      {/* === COTTAGES === */}
      <Cottage
        position={[-25, 0, -35]}
        rotation={Math.PI / 2}
        wallColor="cream"
        roofType="thatch"
      />
      <Cottage position={[25, 0, -35]} rotation={-Math.PI / 2} wallColor="pink" roofType="slate" />
      <Cottage position={[25, 0, -50]} rotation={-Math.PI / 2} wallColor="blue" roofType="thatch" />
      <Cottage
        position={[-25, 0, 45]}
        rotation={Math.PI / 2}
        wallColor="terracotta"
        roofType="tile"
        hasGarden={false}
      />
      <Cottage position={[25, 0, 55]} rotation={-Math.PI / 2} wallColor="cream" roofType="slate" />

      {/* === WISHING WELL === */}
      <WishingWell position={[-10, 0, -5]} />
      {/* Observer Cat on the Well Rim */}
      <Cat position={[-10, 0.8, -4.3]} rotation={2.5} color="#1a1a1a" />

      {/* === MARKET STALLS === */}
      <MarketStall position={[-8, 0, 10]} rotation={0} color1="#dc2626" dressing={0} />
      <MarketStall position={[8, 0, 10]} rotation={0} color1="#3b82f6" dressing={1} />
      <MarketStall position={[-8, 0, 2]} rotation={0} color1="#22c55e" dressing={2} />
      <MarketStall position={[8, 0, 2]} rotation={0} color1="#f59e0b" dressing={3} />

      {/* === FOUNTAIN in market square === */}
      <Fountain position={[0, 0, 6]} />

      {/* === DUCK POND === */}
      <DuckPond position={[20, 0, 25]} />

      {/* === STREET LAMPS (Instanced for performance) === */}
      <InstancedLamps />

      {/* === POSTBOX === */}
      <Postbox position={[12, 0, 25]} rotation={-Math.PI / 2} />

      {/* === BENCHES === */}
      {[
        [-5, 18],
        [5, 18],
        [-12, -25],
        [12, 35],
      ].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]} rotation={[0, i > 1 ? Math.PI / 2 : 0, 0]}>
          <mesh position={[0, 0.4, 0]} castShadow>
            <boxGeometry args={[1.5, 0.08, 0.5]} />
            <primitive object={SM.timber} attach="material" />
          </mesh>
          {/* Backrest standing on the seat's rear strip (0.44-0.94), reclined
              slightly. It used to span 0.00-0.50 - a skirt under the seat. */}
          <mesh position={[0, 0.69, -0.2]} rotation={[-0.12, 0, 0]} castShadow>
            <boxGeometry args={[1.5, 0.5, 0.08]} />
            <primitive object={SM.timber} attach="material" />
          </mesh>
          {[-0.6, 0.6].map((lx, li) => (
            <mesh key={li} position={[lx, 0.2, 0]} castShadow>
              <boxGeometry args={[0.08, 0.4, 0.5]} />
              <primitive object={SM.black} attach="material" />
            </mesh>
          ))}
        </group>
      ))}

      {/* === TREES === One instanced draw per species per part (4 total) */}
      <InstancedTreeField trees={VILLAGE_TREES} />
      <InstancedMulch spots={VILLAGE_TREE_SPOTS} y={VILLAGE_DECAL_Y} radius={2.1} />

      {/* === GROUND CLUTTER === weeds at wall bases, verge grass off the cobble */}
      <InstancedGrassClutter spec={weedSpec} />
      <InstancedGrassClutter spec={vergeSpec} />

      {/* Advances the one shared wind clock. Idempotent per frame, so the
          farm mounting its own driver does not double the wind speed. */}
      <WindDriver />

      {/* Magical Nighttime Fireflies for Village */}
      <Fireflies
        count={50}
        bounds={{ minX: -40, maxX: 40, minY: 0.5, maxY: 6, minZ: -70, maxZ: 70 }}
        color="#ffeb3b"
      />
    </group>
  );
};
