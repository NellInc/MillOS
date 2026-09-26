import React, { useRef, useState, useMemo, useEffect, useLayoutEffect } from 'react';
import { useFrame, ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';

import Fireflies from './effects/Fireflies';
import { HeartParticle } from './effects/HeartParticle';
import { playCritterSound } from '../utils/critterAudio';
import { shouldRunThisFrame } from '../utils/frameThrottle';
import { Cat } from './scenery/Cat';
import { CreatureBody, type CreatureRigHandle } from './models/RiggedCreatureModel';
import {
  GeneratedBody,
  GeneratedBoundary,
  GeneratedModel,
  instanceScale,
  instanceYaw,
} from './models/GeneratedModel';
import { GeneratedWindmillBody } from './models/GeneratedWindmill';
import {
  InstancedTreeField,
  InstancedGrassClutter,
  InstancedMulch,
  useVegetationDensity,
  type TreeInstance,
  type ClutterSpec,
} from './scenery/InstancedFoliage';
import { WindDriver, applyWindShader } from './scenery/WindDriver';
import { composeWorldSurface } from '../utils/worldSurface';
import { DrainageCulvert } from './scenery/Tunnel';
import { PROCEDURAL_TEXTURES } from '../utils/sharedMaterials';
import { EXTERIOR_LAYERS, RENDER_ORDER } from '../constants/renderLayers';
import { SITE_LAYOUT } from '../constants/siteLayout';
import { generateCobblestoneRoughness } from '../textures';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { createAtmosphereState, sampleAtmosphere } from '../simulation/atmosphere';
import {
  createAnimalWanderPlan,
  getAnimalActivityMultiplier,
  getWindmillAngularSpeed,
  type WanderBounds,
} from '../simulation/ambientWorld';

/** Hoisted so the barnyard material does not allocate a Vector2 per render. */
const FARM_COBBLE_NORMAL_SCALE = new THREE.Vector2(0.4, 0.4);

/**
 * Every lathe profile in this file was designed and previewed in Blender before
 * it was written down - `scripts/blender/specs/gen_farm_windmill.py` generates
 * the points and probes them against the parts they have to sit against, and
 * `scripts/blender/machine_part_preview.py --spec scripts/blender/specs/
 * farm-windmill.json` renders each one at its real instance scale and viewing
 * distance. The numbers below are transcribed from that spec unchanged; if a
 * profile needs to move, change it there, look at the render, and copy back.
 */
const lathe = (points: [number, number][], segments: number) =>
  new THREE.LatheGeometry(
    points.map(([r, y]) => new THREE.Vector2(r, y)),
    segments
  );

/**
 * Barnyard wallow with an authored, asymmetric shoreline. The old circle only
 * became a smoother circle when its segment count doubled. This keeps the same
 * four-metre maximum footprint while turning the budget into a muddy outline
 * shaped by hoof traffic and drainage.
 */
function createMudPuddleGeometry(): THREE.ShapeGeometry {
  const outline: ReadonlyArray<readonly [number, number]> = [
    [2, 0],
    [1.78, 0.62],
    [1.45, 1.18],
    [0.83, 1.63],
    [0, 1.82],
    [-0.68, 1.67],
    [-1.43, 1.26],
    [-1.92, 0.58],
    [-2, 0],
    [-1.86, -0.72],
    [-1.34, -1.4],
    [-0.55, -1.82],
    [0, -2],
    [0.73, -1.72],
    [1.4, -1.35],
    [1.82, -0.68],
  ];
  const shape = new THREE.Shape();
  shape.moveTo(outline[0][0], outline[0][1]);
  outline.slice(1).forEach(([x, y]) => shape.lineTo(x, y));
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

/**
 * Windmill tower - replaces `CylinderGeometry(0.8, 1.2, 6, 20)`, a straight
 * truncated cone. Drawn once at scale 1.5, so 3.6 m across the base and 9 m
 * tall: the tallest thing in the farm and read against open sky.
 *
 * A tower mill is not a cone. Four features carry at 30 m and all four are in
 * this profile:
 *  - a splayed base course, giving a crisp ground line instead of a cut edge;
 *  - a BATTERED wall - the taper is concave, steeper at the foot and near
 *    vertical at the curb, which is what separates masonry from sheet pipe;
 *  - a corbelled reefing gallery at world y 1.86-2.06, the one horizontal break
 *    in the taper (a parapet ring above it was built and rejected on the render:
 *    shelf plus ring reads as a pipe coupling, one shelf reads as a balcony);
 *  - a curb band at world y 5.32-5.68, the ring the cap turns on and the collar
 *    the windshaft emerges from.
 *
 * The batter is load-bearing, not decoration. The blade arms sweep down to
 * world y 2.499 with their inner face at z = 0.975, and the straight cone this
 * replaces is 1.033 wide there - the sails have been passing through the
 * masonry. The battered wall is 0.901 at that height, so they now clear it by
 * 0.074 (0.11 m in world). Nothing between world y 2.5 and 6.0 exceeds 0.862.
 *
 * Envelope is identical to the cone: max radius 1.2, y in [-3, +3]. The top
 * radius is free (0.8 -> 0.64) because it is not on the envelope and is hidden
 * under the cap's underside disc; the narrower top is what turns the cap from a
 * lid into an overhanging crown.
 *
 * 34 profile points at the SAME 20 segments as before - 34 x 21 = 714 vertices
 * (LatheGeometry duplicates the seam ring, so it is points x (segments + 1);
 * the Blender harness prints points x segments and reads 34 low). Drawn once
 * for the single windmill, and it carries no pointer handlers, so it needs no
 * picking proxy.
 */
function createWindmillTowerGeometry(): THREE.LatheGeometry {
  return lathe(
    [
      [0.0, -3.0], // underside cap centre
      [1.2, -3.0], // ground line - envelope max radius
      [1.198, -2.93], // base course, near vertical
      [1.17, -2.88], // chamfer off the base course; the batter springs here
      [1.147, -2.687], // battered wall: concave, sampled every 0.193
      [1.125, -2.493],
      [1.102, -2.3],
      [1.08, -2.107],
      [1.057, -1.913],
      [1.036, -1.72],
      [1.014, -1.527],
      [0.992, -1.333],
      [0.971, -1.14],
      [1.036, -1.108], // gallery corbel springs off the wall
      [1.118, -1.066],
      [1.15, -1.03], // deck edge - the gallery's widest point
      [1.15, -0.986], // deck fascia
      [1.128, -0.962], // kerb chamfer
      [0.986, -0.938], // deck top - the flat that reads as a shadow line
      [0.948, -0.93], // wall resumes
      [0.904, -0.529], // battered wall continues, sampled every 0.401
      [0.862, -0.128],
      [0.821, 0.274],
      [0.782, 0.675],
      [0.744, 1.076],
      [0.708, 1.477],
      [0.674, 1.879],
      [0.646, 2.28],
      [0.8, 2.316], // curb band, corbelled sharply out
      [0.8, 2.68],
      [0.728, 2.72], // chamfer back to the wall
      [0.64, 2.78],
      [0.64, 3.0], // top - hidden under the cap
      [0.0, 3.0],
    ],
    20
  );
}

/**
 * Windmill cap - replaces `ConeGeometry(1, 1.5, 20)`, a plain spike. Drawn at
 * scale 1.5: 3 m across and 2.25 m tall, sitting on a 1.92 m tower top.
 *
 * An ogee ("boat") cap, the English tower-mill form: a boarded fascia with a
 * drip lip at the eave, a near-vertical skirt for the bottom third, a knuckle
 * where the flank turns over into the swell, then a neck, a finial ball and a
 * point. A first pass with the knuckle low read as a plain hemisphere at 9 m;
 * holding the skirt at ~0.93 until y = -0.23 is what makes the ogee legible.
 *
 * Envelope identical to the cone: max radius 1.0, y in [-0.75, +0.75]. That is
 * not a formality - the blade arms sweep vertically through the eave plane at
 * radius 0.975-1.025, so the eave rim holds 1.0 for a single ring at the bottom
 * and tucks in and up immediately, reaching 0.975 at y = -0.707 against the
 * cone's -0.7125. The pre-existing 25 mm graze is unchanged, not deepened.
 *
 * 28 points at the tower's 20 segments so their facet boundaries line up at the
 * eave. 588 vertices, drawn once.
 *
 * Known limit: LatheGeometry averages normals across adjacent profile segments,
 * so the drip lip is a shaded ring rather than a crease. At 9 m the cap reads as
 * dome-plus-eave; the ogee knuckle is the softest feature here. Duplicating the
 * lip's two points would harden it if that ever matters.
 */
function createWindmillCapGeometry(): THREE.LatheGeometry {
  return lathe(
    [
      [0.0, -0.75], // underside centre - envelope min y
      [0.965, -0.75], // underside, flat to just inside the rim
      [1.0, -0.744], // eave rim - envelope max radius
      [0.986, -0.716], // drip lip tucks in and up
      [0.948, -0.686], // head of the boarded fascia
      [0.936, -0.61], // skirt: the boarded flank runs near vertical
      [0.932, -0.48],
      [0.926, -0.35],
      [0.914, -0.232],
      [0.892, -0.128], // knuckle - the ogee turns over here
      [0.852, -0.032],
      [0.788, 0.07],
      [0.7, 0.17],
      [0.596, 0.262],
      [0.478, 0.344],
      [0.352, 0.414],
      [0.238, 0.462],
      [0.14, 0.5],
      [0.08, 0.52],
      [0.058, 0.538], // neck
      [0.052, 0.566],
      [0.136, 0.598], // finial ball
      [0.158, 0.64],
      [0.134, 0.684],
      [0.08, 0.712],
      [0.04, 0.73], // point
      [0.014, 0.75], // envelope max y
      [0.0, 0.75],
    ],
    20
  );
}

/**
 * Windshaft boss - replaces `CylinderGeometry(0.2, 0.2, 0.3, 12)`.
 *
 * The old hub was a plain drum lathed about Y and drawn with no rotation, so it
 * stood as a vertical peg while the sails turned about Z: the one part of the
 * windmill whose axis pointed the wrong way. This profile is lathed about the
 * same axis and the MESH is rotated a quarter turn about X so that axis lies
 * along Z. Rotating swaps which axes the half-extents fall on but not their
 * values or the centre, and the mesh is the only user of the geometry.
 *
 * The shape is a cast-iron poll end: a tail flange that stays buried in the
 * tower's curb band, a waisted barrel, a socket collar wide enough to span the
 * blade-arm plane (boss-local 0.075-0.125, where the arms actually cross), and
 * a domed nose that caps the crossing. The nose is deliberately shallow - the
 * envelope only leaves 0.034 of length past the collar.
 *
 * Envelope unchanged: max radius 0.2, axial half-length 0.15. 16 points at the
 * same 12 segments - 208 vertices, drawn once.
 */
function createWindmillHubGeometry(): THREE.LatheGeometry {
  return lathe(
    [
      [0.0, -0.15], // inboard face centre - envelope min axial
      [0.12, -0.15],
      [0.15, -0.138],
      [0.17, -0.12], // tail flange, buried in the tower curb
      [0.17, -0.094],
      [0.15, -0.08],
      [0.134, -0.03], // waisted barrel
      [0.138, 0.014],
      [0.184, 0.042], // sail-socket collar shoulder
      [0.2, 0.062], // collar - envelope max radius
      [0.2, 0.116], // collar band spans the blade-arm plane
      [0.186, 0.126],
      [0.15, 0.136], // nose cap
      [0.096, 0.146],
      [0.04, 0.15],
      [0.0, 0.15], // nose centre - envelope max axial
    ],
    12
  );
}

/**
 * Round hay bale - replaces `CylinderGeometry(0.5, 0.5, 0.8, 16)`.
 *
 * The smallest of these redesigns and the one closest to being left alone: the
 * cylinder's proportions were already right. What it lacked was corners. A
 * machine-rolled bale has no square edge anywhere - the ends roll over into the
 * barrel - and a hard 90 degree rim is what made it read as an oil drum at the
 * 4 m the farm path passes it. The rolled shoulder is the whole of the change
 * and the only part that carries; the wall between the shoulders is straight to
 * within 3 mm, which is honest to a net-wrapped bale and is not a barrel.
 *
 * Envelope unchanged: max radius 0.5 (now at mid-height rather than along the
 * whole wall), axial half-length 0.4. The end face is held flat out to r 0.44 so
 * the twine ring still lies on it; the ring's outer radius comes in to match.
 *
 * 15 points at the same 16 segments - 255 vertices, shared across four bales
 * (four draw calls, one one-off vertex cost).
 */
function createHayBaleGeometry(): THREE.LatheGeometry {
  return lathe(
    [
      [0.0, -0.4],
      [0.23, -0.4],
      [0.44, -0.4], // end face stays flat out to 0.44 for the twine ring
      [0.47, -0.39],
      [0.489, -0.366], // shoulder rolls over
      [0.497, -0.33],
      [0.4995, -0.255],
      [0.5, 0.0], // barrel bulge - envelope max radius
      [0.4995, 0.255],
      [0.497, 0.33],
      [0.489, 0.366],
      [0.47, 0.39],
      [0.44, 0.4],
      [0.23, 0.4],
      [0.0, 0.4],
    ],
    16
  );
}

// Create farm-specific cobble textures with proper world-scale repeat
// Barnyard is 20x15 units, path is 3x14 units - tile every 10 units
const farmBarnyardCobbleColor = PROCEDURAL_TEXTURES.cobblestoneColor.clone();
const farmBarnyardCobbleNormal = PROCEDURAL_TEXTURES.cobblestoneNormal.clone();
// 256/7 matches the cell count of the 512/14 albedo, so polished crowns sit on
// the stones rather than drifting across them.
const farmBarnyardCobbleRoughness = generateCobblestoneRoughness(256, 7).clone();
farmBarnyardCobbleColor.wrapS = farmBarnyardCobbleColor.wrapT = THREE.RepeatWrapping;
farmBarnyardCobbleNormal.wrapS = farmBarnyardCobbleNormal.wrapT = THREE.RepeatWrapping;
farmBarnyardCobbleRoughness.wrapS = farmBarnyardCobbleRoughness.wrapT = THREE.RepeatWrapping;
farmBarnyardCobbleColor.repeat.set(2, 1.5); // 20/10, 15/10
farmBarnyardCobbleNormal.repeat.set(2, 1.5);
farmBarnyardCobbleRoughness.repeat.set(2, 1.5);
farmBarnyardCobbleColor.needsUpdate = true;
farmBarnyardCobbleNormal.needsUpdate = true;
farmBarnyardCobbleRoughness.needsUpdate = true;

const farmPathCobbleColor = PROCEDURAL_TEXTURES.cobblestoneColor.clone();
const farmPathCobbleNormal = PROCEDURAL_TEXTURES.cobblestoneNormal.clone();
farmPathCobbleColor.wrapS = farmPathCobbleColor.wrapT = THREE.RepeatWrapping;
farmPathCobbleNormal.wrapS = farmPathCobbleNormal.wrapT = THREE.RepeatWrapping;
farmPathCobbleColor.repeat.set(0.3, 1.4); // 3/10, 14/10
farmPathCobbleNormal.repeat.set(0.3, 1.4);
farmPathCobbleColor.needsUpdate = true;
farmPathCobbleNormal.needsUpdate = true;

// Module-level reusable temp to avoid per-animal Vector3 allocation in useFrame (GC pressure)
const _animDir = new THREE.Vector3();

// ============================================================
// CUTE FARM AREA - North-West Corner (OPTIMIZED)
// Position: Center at [75, 0, 120] - by the lake
// A charming farm that "supplies the mill" with grain
//
// PERFORMANCE OPTIMIZATIONS:
// - Shared geometries/materials via module-level constants
// - Single useFrame for all animations (throttled to 15 FPS)
// - React.memo on static components
// - Animation throttling: windmill 30 FPS, animals 15 FPS
// ============================================================

// Shared Geometries - created once at module load
const SG = {
  fencePost: new THREE.CylinderGeometry(0.08, 0.1, 1, 6),
  hayBale: createHayBaleGeometry(),
  // 0.43 outer, not 0.48: the bale's end face is now flat only out to r 0.44
  // before the shoulder rolls away, and the old rim floated 44 mm off the hay.
  hayRing: new THREE.RingGeometry(0.2, 0.43, 16),
  troughBody: new THREE.BoxGeometry(1.5, 0.5, 0.6),
  troughWater: new THREE.BoxGeometry(1.3, 0.05, 0.45),
  troughLeg: new THREE.BoxGeometry(0.15, 0.2, 0.5),
  gardenFrame: new THREE.BoxGeometry(3, 0.3, 2),
  gardenSoil: new THREE.BoxGeometry(2.8, 0.15, 1.8),
  carrotTop: new THREE.ConeGeometry(0.08, 0.15, 6),
  carrotLeaf: new THREE.ConeGeometry(0.1, 0.2, 4),
  cabbage: new THREE.SphereGeometry(0.2, 8, 8),
  mudPuddle: createMudPuddleGeometry(),
  chickenBody: new THREE.SphereGeometry(0.2, 8, 8),
  chickenHead: new THREE.SphereGeometry(0.12, 8, 8),
  chickenBeak: new THREE.ConeGeometry(0.03, 0.08, 4),
  chickenComb: new THREE.BoxGeometry(0.08, 0.1, 0.02),
  chickenWattle: new THREE.SphereGeometry(0.03, 6, 6),
  chickenTail: new THREE.BoxGeometry(0.15, 0.02, 0.1),
  chickenLeg: new THREE.CylinderGeometry(0.015, 0.015, 0.15, 4),
  pigBody: new THREE.SphereGeometry(0.4, 12, 12),
  pigHead: new THREE.SphereGeometry(0.25, 10, 10),
  pigSnout: new THREE.CylinderGeometry(0.12, 0.12, 0.1, 8),
  pigNostril: new THREE.SphereGeometry(0.02, 6, 6),
  pigEar: new THREE.ConeGeometry(0.08, 0.15, 4),
  pigEye: new THREE.SphereGeometry(0.03, 6, 6),
  pigLeg: new THREE.CylinderGeometry(0.06, 0.05, 0.2, 6),
  pigTail: new THREE.TorusGeometry(0.06, 0.02, 8, 12, Math.PI * 1.5),
  cowBody: new THREE.SphereGeometry(0.5, 12, 12),
  cowSpot: new THREE.SphereGeometry(0.18, 8, 8),
  cowSpotSmall: new THREE.SphereGeometry(0.15, 8, 8),
  cowHead: new THREE.BoxGeometry(0.35, 0.3, 0.28),
  cowMuzzle: new THREE.BoxGeometry(0.15, 0.18, 0.22),
  cowNostril: new THREE.SphereGeometry(0.025, 6, 6),
  cowEye: new THREE.SphereGeometry(0.04, 6, 6),
  cowEar: new THREE.BoxGeometry(0.12, 0.06, 0.08),
  cowHorn: new THREE.ConeGeometry(0.03, 0.15, 6),
  cowLeg: new THREE.CylinderGeometry(0.06, 0.05, 0.4, 6),
  cowUdder: new THREE.SphereGeometry(0.12, 8, 8),
  cowTail: new THREE.CylinderGeometry(0.02, 0.015, 0.5, 6),
  cowTailTuft: new THREE.SphereGeometry(0.05, 6, 6),
  sheepBody: new THREE.SphereGeometry(0.45, 12, 12),
  sheepFluff: new THREE.SphereGeometry(0.15, 8, 8),
  sheepHead: new THREE.SphereGeometry(0.18, 10, 10),
  sheepEar: new THREE.BoxGeometry(0.1, 0.05, 0.08),
  sheepEye: new THREE.SphereGeometry(0.025, 6, 6),
  sheepLeg: new THREE.CylinderGeometry(0.04, 0.035, 0.25, 6),
  // The windmill is a 6 m landmark read against open sky. Segment counts here
  // are unchanged (20 for the tower and cap so their facets line up at the
  // eave, 12 for the hub); what changed is the shape - see the profile
  // factories above.
  //
  // Deliberately NOT applied to the trees below: their faceting reads as the
  // site's stylization rather than as a defect, and a smooth cone is no more
  // tree-like than a hexagonal one.
  windmillTower: createWindmillTowerGeometry(),
  windmillCap: createWindmillCapGeometry(),
  windmillHub: createWindmillHubGeometry(),
  windmillBladeArm: new THREE.BoxGeometry(0.15, 3, 0.05),
  windmillBladeSail: new THREE.BoxGeometry(0.5, 2.5, 0.02),
  // 0.18 deep, not 0.1: the battered wall drops from r 1.181 to 0.988 across
  // the door's height, so a 0.1 panel that sat flush at the sill floated 65 mm
  // off the wall at the head. Deeper and tilted (see the call site) it stays
  // 60-70 mm proud along its whole height instead.
  windmillDoor: new THREE.BoxGeometry(0.6, 1.6, 0.18),
  // Grain Field
  cornStalk: new THREE.CylinderGeometry(0.05, 0.08, 1.8, 4),
  cornLeaf: new THREE.ConeGeometry(0.1, 0.8, 3),
  crowBody: new THREE.ConeGeometry(0.1, 0.3, 4),
  crowHead: new THREE.SphereGeometry(0.08, 4, 4),
};

// Shared Materials - with procedural textures
const SM = {
  // Painted board siding. `PROCEDURAL_TEXTURES.panelNormal` is dropped here and
  // on every wood/stone/plaster material below rather than replaced: its bevel
  // is 0.64 px at 256, below one texel, so the mip chain erases it and at
  // normalScale 0.1-0.2 it was contributing nothing. The correct replacement
  // (`machinePanelNormal`) is a sheet-metal panel bevel and has no business on
  // barn boards - so the honest fix is no map and one less texture fetch.
  barnRed: new THREE.MeshStandardMaterial({
    color: '#8B2323',
    roughness: 0.8,
  }),
  // Sheet-metal barn roof - the one surface here a panel bevel actually fits.
  // The old `brushedMetal` binding decoded a roughness/metalness/AO pack as a
  // tangent normal, which is a near-constant tilt of about (-0.37, +0.90) over
  // the whole cone: a uniform lighting bias, not relief.
  barnRoof: new THREE.MeshStandardMaterial({
    color: '#4a4a4a',
    roughness: 0.7,
    normalMap: PROCEDURAL_TEXTURES.machinePanelNormal,
    normalScale: new THREE.Vector2(0.6, 0.6),
  }),
  whiteTrim: new THREE.MeshStandardMaterial({ color: '#f5f5f5', roughness: 0.6 }),
  barnDoor: new THREE.MeshStandardMaterial({
    color: '#5d4037',
    roughness: 0.8,
  }),
  barnWindow: new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.9 }),
  // Weathervane finial. F0 0.56 - a genuine CONDUCTOR at metalness 1 (0.7 was
  // the invalid half-metal band). The `roughnessMap` is dropped rather than
  // swapped for the ORM: the cone is 0.3 m, so a 512 map tiled once over it is
  // sub-pixel at any viewing distance and mips to its 0.582 mean. That mean is
  // folded into the authored roughness instead.
  gold: new THREE.MeshStandardMaterial({
    color: '#ffd700',
    roughness: 0.35,
    metalness: 1,
  }),
  // Weathervane spindle: a 0.1 m rod. F0 0.05 - painted iron, DIELECTRIC. Same
  // mis-decoded normal map as `barnRoof` had, dropped outright here because
  // nothing tiled onto a 0.1 m member survives the mip chain.
  darkMetal: new THREE.MeshStandardMaterial({
    color: '#424242',
    roughness: 0.55,
    metalness: 0,
  }),
  chickenFeather: new THREE.MeshStandardMaterial({ color: '#f5f5dc', roughness: 0.9 }),
  chickenBeak: new THREE.MeshStandardMaterial({ color: '#ff9800', roughness: 0.7 }),
  chickenComb: new THREE.MeshStandardMaterial({ color: '#d32f2f', roughness: 0.7 }),
  chickenTail: new THREE.MeshStandardMaterial({ color: '#5d4037', roughness: 0.8 }),
  pigPink: new THREE.MeshStandardMaterial({ color: '#ffb6c1', roughness: 0.8 }),
  pigSnout: new THREE.MeshStandardMaterial({ color: '#ff9999', roughness: 0.7 }),
  pigNostril: new THREE.MeshStandardMaterial({ color: '#cc6666', roughness: 0.8 }),
  black: new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.5 }),
  cowWhite: new THREE.MeshStandardMaterial({ color: '#f5f5f5', roughness: 0.85 }),
  cowBlack: new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.85 }),
  cowMuzzle: new THREE.MeshStandardMaterial({ color: '#ffcccc', roughness: 0.8 }),
  cowNostril: new THREE.MeshStandardMaterial({ color: '#333333', roughness: 0.8 }),
  cowHorn: new THREE.MeshStandardMaterial({ color: '#e0e0e0', roughness: 0.6 }),
  sheepWool: new THREE.MeshStandardMaterial({ color: '#f5f5f5', roughness: 1 }),
  sheepFace: new THREE.MeshStandardMaterial({ color: '#2d2d2d', roughness: 0.8 }),
  sheepEye: new THREE.MeshStandardMaterial({ color: '#ffd700', roughness: 0.5 }),
  woodBrown: new THREE.MeshStandardMaterial({
    color: '#5d4037',
    roughness: 0.9,
  }),
  woodLight: new THREE.MeshStandardMaterial({
    color: '#8d6e63',
    roughness: 0.85,
  }),
  woodTan: new THREE.MeshStandardMaterial({
    color: '#a1887f',
    roughness: 0.8,
  }),
  soil: new THREE.MeshStandardMaterial({ color: '#3e2723', roughness: 1 }),
  stone: new THREE.MeshStandardMaterial({
    color: '#d7ccc8',
    roughness: 0.8,
  }),
  // Water is a DIELECTRIC - metalness 0.1 was tinting the specular with the
  // pond's own blue and leaving it chalky now that there is an environment.
  water: new THREE.MeshStandardMaterial({
    color: '#64b5f6',
    roughness: 0.2,
    metalness: 0,
    transparent: true,
    opacity: 0.8,
    // Transparent overlay surface: writing depth made the water occlude
    // ground/objects behind it inconsistently by camera angle (sort flicker)
    depthWrite: false,
  }),
  hay: new THREE.MeshStandardMaterial({
    color: '#d4a574',
    roughness: 0.95,
    normalMap: PROCEDURAL_TEXTURES.rubberNormal,
    normalScale: new THREE.Vector2(0.2, 0.2),
  }),
  hayDark: new THREE.MeshStandardMaterial({ color: '#c4956a', roughness: 0.95 }),
  carrotOrange: new THREE.MeshStandardMaterial({ color: '#ff7043', roughness: 0.8 }),
  vegetableGreen: new THREE.MeshStandardMaterial({ color: '#4caf50', roughness: 0.8 }),
  cabbageGreen: new THREE.MeshStandardMaterial({ color: '#81c784', roughness: 0.85 }),
  houseWall: new THREE.MeshStandardMaterial({
    color: '#f5f5dc',
    roughness: 0.75,
  }),
  roofBrown: new THREE.MeshStandardMaterial({
    color: '#8B4513',
    roughness: 0.8,
  }),
  chimneyRed: new THREE.MeshStandardMaterial({ color: '#8B0000', roughness: 0.8 }),
  // Window glass: dielectric.
  windowBlue: new THREE.MeshStandardMaterial({ color: '#87ceeb', roughness: 0.2, metalness: 0 }),
  shutterGreen: new THREE.MeshStandardMaterial({ color: '#2e7d32', roughness: 0.7 }),
  coopBrown: new THREE.MeshStandardMaterial({
    color: '#8B4513',
    roughness: 0.85,
  }),
  coopDark: new THREE.MeshStandardMaterial({ color: '#6d4c41', roughness: 0.85 }),
  coopRoof: new THREE.MeshStandardMaterial({ color: '#2e7d32', roughness: 0.7 }),
  windmillSail: new THREE.MeshStandardMaterial({
    color: '#f5f5f5',
    roughness: 0.7,
    side: THREE.DoubleSide,
  }),
  // Grain field. White base: the old flat '#8bc34a' is now
  // supplied per stalk through `instanceColor` (see InstancedGrainField), so
  // keeping the tint here would multiply the crop colour twice.
  cornGreen: new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.9,
    side: THREE.DoubleSide,
  }),
  crowBlack: new THREE.MeshStandardMaterial({ color: '#212121', roughness: 0.6 }),
};

// The crop sways. `SM.cornGreen` is consumed ONLY by the three InstancedMeshes
// inside `InstancedGrainField` (grep), and InstancedMesh is already excluded
// from StaticMeshBatch merging, so the `onBeforeCompile` this adds costs no
// batching. Do NOT do this to a building material.
applyWindShader(SM.cornGreen, {
  heightRef: 1.8,
  strengthScale: 1.4,
  cacheKey: 'millos_corn_v1',
});
// ...and then carries the vegetation finish on top of the sway. Composed, not
// applied: the wind injection owns the material's single `onBeforeCompile`
// slot, so `applyWorldSurface` declines it outright. `worldRest` samples the
// field at the rest vertex, because a 1.8 m stalk swaying 0.22 m at the tip
// travels most of a 0.3 m noise cell and the break-up would crawl up the crop
// on every gust. See `utils/worldSurface.composeWorldSurface`.
composeWorldSurface(SM.cornGreen, 'vegetation', {
  cacheKey: 'millos_corn_v1',
  worldRest: true,
});

/** Matching depth material so the crop's shadow sways with the crop. */
const cornDepthMaterial = new THREE.MeshDepthMaterial({
  depthPacking: THREE.RGBADepthPacking,
  side: THREE.DoubleSide,
});
applyWindShader(cornDepthMaterial, {
  heightRef: 1.8,
  strengthScale: 1.4,
  cacheKey: 'millos_corn_v1_depth',
});

interface StaticPartTransform {
  position: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
}

const SHEEP_FLUFF_PARTS: readonly StaticPartTransform[] = [
  { position: [0.2, 0.7, 0.2] },
  { position: [-0.2, 0.75, 0.15] },
  { position: [0, 0.8, -0.2] },
  { position: [0.15, 0.65, -0.25] },
];
const SHEEP_EAR_PARTS: readonly StaticPartTransform[] = [
  { position: [0.35, 0.65, 0.15], rotation: [0, 0.5, 0.5] },
  { position: [0.35, 0.65, -0.15], rotation: [0, -0.5, -0.5] },
];
const SHEEP_EYE_PARTS: readonly StaticPartTransform[] = [
  { position: [0.52, 0.6, 0.08] },
  { position: [0.52, 0.6, -0.08] },
];
const SHEEP_LEG_PARTS: readonly StaticPartTransform[] = [
  { position: [0.2, 0.12, 0.18] },
  { position: [0.2, 0.12, -0.18] },
  { position: [-0.2, 0.12, 0.18] },
  { position: [-0.2, 0.12, -0.18] },
];
const CHICKEN_LEG_PARTS: readonly StaticPartTransform[] = [
  { position: [0.05, 0.08, 0.05] },
  { position: [0.05, 0.08, -0.05] },
];
const PIG_NOSTRIL_PARTS: readonly StaticPartTransform[] = [
  { position: [0.61, 0.37, 0.04] },
  { position: [0.61, 0.37, -0.04] },
];
const PIG_EAR_PARTS: readonly StaticPartTransform[] = [
  { position: [0.25, 0.6, 0.15], rotation: [0.5, 0.3, 0] },
  { position: [0.25, 0.6, -0.15], rotation: [0.5, -0.3, 0] },
];
const PIG_EYE_PARTS: readonly StaticPartTransform[] = [
  { position: [0.5, 0.48, 0.12] },
  { position: [0.5, 0.48, -0.12] },
];
const PIG_LEG_PARTS: readonly StaticPartTransform[] = [
  { position: [0.15, 0.1, 0.2] },
  { position: [0.15, 0.1, -0.2] },
  { position: [-0.15, 0.1, 0.2] },
  { position: [-0.15, 0.1, -0.2] },
];
const COW_NOSTRIL_PARTS: readonly StaticPartTransform[] = [
  { position: [0.88, 0.62, 0.05] },
  { position: [0.88, 0.62, -0.05] },
];
const COW_EYE_PARTS: readonly StaticPartTransform[] = [
  { position: [0.7, 0.78, 0.12] },
  { position: [0.7, 0.78, -0.12] },
];
const COW_EAR_PARTS: readonly StaticPartTransform[] = [
  { position: [0.5, 0.82, 0.18], rotation: [0, 0.5, 0.3] },
  { position: [0.5, 0.82, -0.18], rotation: [0, -0.5, -0.3] },
];
const COW_HORN_PARTS: readonly StaticPartTransform[] = [
  { position: [0.45, 0.92, 0.1], rotation: [0, 0, 0.3] },
  { position: [0.45, 0.92, -0.1], rotation: [0, 0, -0.3] },
];
const COW_LEG_PARTS: readonly StaticPartTransform[] = [
  { position: [0.3, 0.2, 0.25] },
  { position: [0.3, 0.2, -0.25] },
  { position: [-0.35, 0.2, 0.25] },
  { position: [-0.35, 0.2, -0.25] },
];

const InstancedAnimalParts = React.memo<{
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  transforms: readonly StaticPartTransform[];
  castShadow?: boolean;
}>(({ geometry, material, transforms, castShadow = false }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const object = useMemo(() => new THREE.Object3D(), []);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    transforms.forEach((transform, index) => {
      object.position.fromArray(transform.position);
      object.rotation.set(...(transform.rotation ?? [0, 0, 0]));
      object.scale.fromArray(transform.scale ?? [1, 1, 1]);
      object.updateMatrix();
      mesh.setMatrixAt(index, object.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [object, transforms]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, transforms.length]}
      castShadow={castShadow}
      dispose={null}
    />
  );
});
InstancedAnimalParts.displayName = 'InstancedAnimalParts';

// Static components with React.memo
const BarnPrimitiveBody = React.memo(() => (
  <group>
    <mesh position={[0, 3, 0]} castShadow receiveShadow>
      <boxGeometry args={[10, 6, 8]} />
      <primitive object={SM.barnRed} attach="material" />
    </mesh>
    <mesh position={[0, 11, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
      <cylinderGeometry args={[0, 6.5, 10, 4]} />
      <primitive object={SM.barnRoof} attach="material" />
    </mesh>
    <mesh position={[0, 0.15, 4.01]}>
      <boxGeometry args={[10.2, 0.3, 0.1]} />
      <primitive object={SM.whiteTrim} attach="material" />
    </mesh>
    <mesh position={[5.01, 3, 0]}>
      <boxGeometry args={[0.1, 6.2, 8.2]} />
      <primitive object={SM.whiteTrim} attach="material" />
    </mesh>
    <mesh position={[-5.01, 3, 0]}>
      <boxGeometry args={[0.1, 6.2, 8.2]} />
      <primitive object={SM.whiteTrim} attach="material" />
    </mesh>
    <mesh position={[-1.5, 2, 4.05]}>
      <boxGeometry args={[2.5, 4, 0.1]} />
      <primitive object={SM.barnDoor} attach="material" />
    </mesh>
    <mesh position={[1.5, 2, 4.05]}>
      <boxGeometry args={[2.5, 4, 0.1]} />
      <primitive object={SM.barnDoor} attach="material" />
    </mesh>
    {[-1.5, 1.5].map((x) => (
      <React.Fragment key={x}>
        <mesh position={[x, 2, 4.1]} rotation={[0, 0, Math.PI / 4]}>
          <boxGeometry args={[0.15, 5, 0.05]} />
          <primitive object={SM.whiteTrim} attach="material" />
        </mesh>
        <mesh position={[x, 2, 4.1]} rotation={[0, 0, -Math.PI / 4]}>
          <boxGeometry args={[0.15, 5, 0.05]} />
          <primitive object={SM.whiteTrim} attach="material" />
        </mesh>
      </React.Fragment>
    ))}
    {/* Gable louvre: a 1.6 m near-black disc face-on against red siding, so its
        OUTLINE is the whole read and a 16-gon showed its corners (0.312 m facet
        chord). 32 halves that for 16 vertices on a mesh drawn once, and stays a
        multiple of 4 so the disc still reaches exactly +-0.8. */}
    <mesh position={[0, 5, 4.05]}>
      <circleGeometry args={[0.8, 32]} />
      <primitive object={SM.barnWindow} attach="material" />
    </mesh>
    <mesh position={[0, 16.75, 0]} castShadow>
      <cylinderGeometry args={[0.05, 0.05, 1.5, 8]} />
      <primitive object={SM.darkMetal} attach="material" />
    </mesh>
    <mesh position={[0.3, 17.25, 0]} castShadow>
      <coneGeometry args={[0.15, 0.6, 4]} />
      <primitive object={SM.gold} attach="material" />
    </mesh>
  </group>
));
BarnPrimitiveBody.displayName = 'BarnPrimitiveBody';

export const Barn = React.memo<{ position: [number, number, number] }>(({ position }) => (
  <group position={position}>
    <GeneratedBody asset="barn" fallback={<BarnPrimitiveBody />} />
  </group>
));
Barn.displayName = 'Barn';

const ChickenCoopPrimitiveBody = React.memo(() => (
  <group>
    <mesh position={[0, 0.8, 0]} castShadow receiveShadow>
      <boxGeometry args={[3, 1.6, 2.5]} />
      <primitive object={SM.coopBrown} attach="material" />
    </mesh>
    {/* A-Frame Roof */}
    <mesh position={[0, 2.3, 0.75]} rotation={[Math.PI / 4, 0, 0]} castShadow>
      <boxGeometry args={[3.5, 0.15, 2]} />
      <primitive object={SM.coopRoof} attach="material" />
    </mesh>
    <mesh position={[0, 2.3, -0.75]} rotation={[-Math.PI / 4, 0, 0]} castShadow>
      <boxGeometry args={[3.5, 0.15, 2]} />
      <primitive object={SM.coopRoof} attach="material" />
    </mesh>
    {/* Raised Door */}
    <mesh position={[1.51, 0.68, 0]}>
      <boxGeometry args={[0.1, 0.6, 0.5]} />
      <primitive object={SM.black} attach="material" />
    </mesh>
    {/* Ramp - Reversed slope */}
    <mesh position={[2.2, 0.2, 0]} rotation={[0, 0, -0.4]} castShadow>
      <boxGeometry args={[1.5, 0.08, 0.4]} />
      <primitive object={SM.woodTan} attach="material" />
    </mesh>
    <mesh position={[-1.6, 0.6, 0]} castShadow>
      <boxGeometry args={[0.5, 0.8, 2]} />
      <primitive object={SM.coopDark} attach="material" />
    </mesh>
  </group>
));
ChickenCoopPrimitiveBody.displayName = 'ChickenCoopPrimitiveBody';

const ChickenCoop = React.memo<{ position: [number, number, number] }>(({ position }) => (
  <group position={position}>
    <GeneratedBody asset="coop" fallback={<ChickenCoopPrimitiveBody />} />
  </group>
));
ChickenCoop.displayName = 'ChickenCoop';

const FenceSectionPrimitiveBody = React.memo<{ length: number }>(({ length }) => {
  const railGeom = useMemo(() => new THREE.BoxGeometry(length, 0.08, 0.06), [length]);
  // Dispose the per-instance rail geometry on unmount / length change
  // (matches the Machines.tsx convention; previously leaked on remount).
  useEffect(() => () => railGeom.dispose(), [railGeom]);
  return (
    <group>
      <mesh position={[-length / 2, 0.5, 0]} castShadow>
        <primitive object={SG.fencePost} attach="geometry" />
        <primitive object={SM.woodBrown} attach="material" />
      </mesh>
      <mesh position={[length / 2, 0.5, 0]} castShadow>
        <primitive object={SG.fencePost} attach="geometry" />
        <primitive object={SM.woodBrown} attach="material" />
      </mesh>
      <mesh position={[0, 0.7, 0]} castShadow>
        <primitive object={railGeom} attach="geometry" />
        <primitive object={SM.woodLight} attach="material" />
      </mesh>
      <mesh position={[0, 0.35, 0]} castShadow>
        <primitive object={railGeom} attach="geometry" />
        <primitive object={SM.woodLight} attach="material" />
      </mesh>
    </group>
  );
});
FenceSectionPrimitiveBody.displayName = 'FenceSectionPrimitiveBody';

/**
 * A run of fence, tiled from one generated panel.
 *
 * The asset is a single 1.636 m panel sized by HEIGHT rather than width: at a
 * 3 m width the generated panel would stand 1.9 m tall, a stockade against the
 * 1.05 m post-and-rail it replaces.
 *
 * Panel count is the nearest whole number of panels to the requested run, and
 * the remainder is taken up by stretching each panel along its own length. That
 * stretch reaches about 22% in the worst case here (a 4 m run becomes two 2 m
 * panels), which reads on the posts at walk-up distance but keeps the run
 * continuous and exactly the length the caller asked for - fences here form
 * closed enclosures, so a run that is short by a panel leaves a corner open.
 */
const FENCE_PANEL_LENGTH = 1.6359;

const FenceSection = React.memo<{
  position: [number, number, number];
  rotation?: number;
  length?: number;
}>(({ position, rotation = 0, length = 4 }) => {
  const panels = Math.max(1, Math.round(length / FENCE_PANEL_LENGTH));
  const step = length / panels;
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <GeneratedBoundary fallback={<FenceSectionPrimitiveBody length={length} />}>
        {Array.from({ length: panels }, (_, index) => (
          <group
            key={`panel-${index}`}
            position={[-length / 2 + step * (index + 0.5), 0, 0]}
            scale={[step / FENCE_PANEL_LENGTH, 1, 1]}
          >
            <GeneratedModel asset="fence" />
          </group>
        ))}
      </GeneratedBoundary>
    </group>
  );
});
FenceSection.displayName = 'FenceSection';

const HayBalePrimitiveBody = React.memo(() => (
  <group>
    <mesh position={[0, 0.4, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
      <primitive object={SG.hayBale} attach="geometry" />
      <primitive object={SM.hay} attach="material" />
    </mesh>
    <mesh position={[0, 0.4, 0.41]}>
      <primitive object={SG.hayRing} attach="geometry" />
      <primitive object={SM.hayDark} attach="material" />
    </mesh>
  </group>
));
HayBalePrimitiveBody.displayName = 'HayBalePrimitiveBody';

const HayBale = React.memo<{ position: [number, number, number]; rotation?: number }>(
  ({ position, rotation = 0 }) => (
    <group
      position={position}
      rotation={[0, rotation + instanceYaw(position), 0]}
      scale={instanceScale(position)}
    >
      <GeneratedBody asset="haybale" fallback={<HayBalePrimitiveBody />} />
    </group>
  )
);
HayBale.displayName = 'HayBale';

const WaterTroughPrimitiveBody = React.memo(() => (
  <group>
    <mesh position={[0, 0.3, 0]} castShadow>
      <primitive object={SG.troughBody} attach="geometry" />
      <primitive object={SM.woodBrown} attach="material" />
    </mesh>
    <mesh position={[0, 0.5, 0]}>
      <primitive object={SG.troughWater} attach="geometry" />
      <primitive object={SM.water} attach="material" />
    </mesh>
    {[-0.6, 0.6].map((x, i) => (
      <mesh key={i} position={[x, 0.1, 0]} castShadow>
        <primitive object={SG.troughLeg} attach="geometry" />
        <primitive object={SM.woodBrown} attach="material" />
      </mesh>
    ))}
  </group>
));
WaterTroughPrimitiveBody.displayName = 'WaterTroughPrimitiveBody';

const WaterTrough = React.memo<{ position: [number, number, number]; rotation?: number }>(
  ({ position, rotation = 0 }) => (
    <group position={position} rotation={[0, rotation, 0]}>
      <GeneratedBody asset="watertrough" fallback={<WaterTroughPrimitiveBody />} />
    </group>
  )
);
WaterTrough.displayName = 'WaterTrough';

const GardenBedPrimitiveBody = React.memo(() => (
  <group>
    <mesh position={[0, 0.15, 0]} receiveShadow>
      <primitive object={SG.gardenFrame} attach="geometry" />
      <primitive object={SM.woodBrown} attach="material" />
    </mesh>
    <mesh position={[0, 0.25, 0]} receiveShadow>
      <primitive object={SG.gardenSoil} attach="geometry" />
      <primitive object={SM.soil} attach="material" />
    </mesh>
    {[-0.8, -0.4, 0, 0.4, 0.8].map((x, i) => (
      <group key={`carrot-${i}`} position={[x, 0.35, -0.5]}>
        <mesh castShadow>
          <primitive object={SG.carrotTop} attach="geometry" />
          <primitive object={SM.carrotOrange} attach="material" />
        </mesh>
        <mesh position={[0, 0.12, 0]} castShadow>
          <primitive object={SG.carrotLeaf} attach="geometry" />
          <primitive object={SM.vegetableGreen} attach="material" />
        </mesh>
      </group>
    ))}
    {[-0.6, 0, 0.6].map((x, i) => (
      <mesh key={`cabbage-${i}`} position={[x, 0.4, 0.4]} castShadow>
        <primitive object={SG.cabbage} attach="geometry" />
        <primitive object={SM.cabbageGreen} attach="material" />
      </mesh>
    ))}
  </group>
));
GardenBedPrimitiveBody.displayName = 'GardenBedPrimitiveBody';

const GardenBed = React.memo<{ position: [number, number, number] }>(({ position }) => (
  <group position={position}>
    <GeneratedBody asset="gardenbed" fallback={<GardenBedPrimitiveBody />} />
  </group>
));
GardenBed.displayName = 'GardenBed';

const FarmhousePrimitiveBody = React.memo(() => (
  <group>
    <mesh position={[0, 2, 0]} castShadow receiveShadow>
      <boxGeometry args={[6, 4, 5]} />
      <primitive object={SM.houseWall} attach="material" />
    </mesh>
    <mesh position={[0, 7.25, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
      <cylinderGeometry args={[0, 4, 6.5, 4]} />
      <primitive object={SM.roofBrown} attach="material" />
    </mesh>
    <mesh position={[2, 5.5, 0]} castShadow>
      <boxGeometry args={[0.8, 2, 0.8]} />
      <primitive object={SM.chimneyRed} attach="material" />
    </mesh>
    <mesh position={[0, 1.2, 2.51]}>
      <boxGeometry args={[1.2, 2.2, 0.1]} />
      <primitive object={SM.barnDoor} attach="material" />
    </mesh>
    {[
      [-1.8, 2.5, 2.51],
      [1.8, 2.5, 2.51],
    ].map((pos, i) => (
      <group key={i} position={pos as [number, number, number]}>
        <mesh>
          <boxGeometry args={[1, 1.2, 0.1]} />
          <primitive object={SM.windowBlue} attach="material" />
        </mesh>
        <mesh position={[0, 0, 0.06]}>
          <boxGeometry args={[1.1, 0.08, 0.05]} />
          <primitive object={SM.whiteTrim} attach="material" />
        </mesh>
        <mesh position={[0, 0, 0.06]}>
          <boxGeometry args={[0.08, 1.3, 0.05]} />
          <primitive object={SM.whiteTrim} attach="material" />
        </mesh>
      </group>
    ))}
    {[-2.4, -1.2, 1.2, 2.4].map((x, i) => (
      <mesh key={`shutter-${i}`} position={[x, 2.5, 2.51]}>
        <boxGeometry args={[0.3, 1.2, 0.08]} />
        <primitive object={SM.shutterGreen} attach="material" />
      </mesh>
    ))}
    <mesh position={[0, 0.15, 3.2]} receiveShadow>
      <boxGeometry args={[4, 0.3, 1.5]} />
      <primitive object={SM.woodLight} attach="material" />
    </mesh>
    {[-1.5, 1.5].map((x, i) => (
      <mesh key={i} position={[x, 1.2, 3.8]} castShadow>
        <cylinderGeometry args={[0.1, 0.1, 2.1, 8]} />
        <primitive object={SM.whiteTrim} attach="material" />
      </mesh>
    ))}
    <mesh position={[0, 2.3, 3.5]} rotation={[0.2, 0, 0]} castShadow>
      <boxGeometry args={[4.5, 0.15, 2]} />
      <primitive object={SM.roofBrown} attach="material" />
    </mesh>
  </group>
));
FarmhousePrimitiveBody.displayName = 'FarmhousePrimitiveBody';

export const Farmhouse = React.memo<{ position: [number, number, number] }>(({ position }) => (
  <group position={position}>
    <GeneratedBody asset="farmhouse" fallback={<FarmhousePrimitiveBody />} />
  </group>
));
Farmhouse.displayName = 'Farmhouse';

/**
 * Quarter turn, for the reason spelled out on `CowPrimitiveBody`: every part
 * below is authored facing local +X, the generated sheep faces +Z like the rest
 * of the roster, and the two bodies have to be interchangeable or the fallback
 * points a sheep 90 degrees away from where the shipped one points.
 */
const SheepPrimitiveBody = React.memo(() => (
  <group rotation={[0, -Math.PI / 2, 0]}>
    <mesh position={[0, 0.5, 0]} castShadow>
      <primitive object={SG.sheepBody} attach="geometry" />
      <primitive object={SM.sheepWool} attach="material" />
    </mesh>
    <InstancedAnimalParts
      geometry={SG.sheepFluff}
      material={SM.sheepWool}
      transforms={SHEEP_FLUFF_PARTS}
      castShadow
    />
    <mesh position={[0.4, 0.55, 0]} castShadow>
      <primitive object={SG.sheepHead} attach="geometry" />
      <primitive object={SM.sheepFace} attach="material" />
    </mesh>
    <InstancedAnimalParts
      geometry={SG.sheepEar}
      material={SM.sheepFace}
      transforms={SHEEP_EAR_PARTS}
      castShadow
    />
    <InstancedAnimalParts
      geometry={SG.sheepEye}
      material={SM.sheepEye}
      transforms={SHEEP_EYE_PARTS}
    />
    <InstancedAnimalParts
      geometry={SG.sheepLeg}
      material={SM.sheepFace}
      transforms={SHEEP_LEG_PARTS}
      castShadow
    />
  </group>
));
SheepPrimitiveBody.displayName = 'SheepPrimitiveBody';

// Hover affordance for the pettable animals, matching every other clickable
// object in the scene.
const setPointerCursor = () => {
  document.body.style.cursor = 'pointer';
};
const resetCursor = () => {
  document.body.style.cursor = 'auto';
};

const Sheep = React.memo<{
  position: [number, number, number];
  rotation?: number;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
  groupRef?: React.RefObject<THREE.Group | null>;
  rigRef?: React.RefObject<CreatureRigHandle | null>;
}>(({ position, rotation = 0, onClick, groupRef, rigRef }) => (
  // Four sheep of one model, standing still. Scale variation reads as age
  // rather than as a stamped-out copy, and unlike the wandering animals the
  // sheep keep their authored yaw, so the jitter survives.
  <group
    ref={groupRef}
    position={position}
    rotation={[0, rotation + instanceYaw(position), 0]}
    scale={instanceScale(position)}
    onClick={(e) => {
      if (onClick) {
        e.stopPropagation();
        onClick(e);
      }
    }}
    onPointerOver={onClick ? setPointerCursor : undefined}
    onPointerOut={onClick ? resetCursor : undefined}
  >
    <CreatureBody creature="sheep" ref={rigRef} fallback={<SheepPrimitiveBody />} />
  </group>
));
Sheep.displayName = 'Sheep';

// Animated components with refs for centralized animation
// Movement interface
interface AnimalState {
  target: THREE.Vector3;
  isIdle: boolean;
  idleTime: number;
  seed: number;
  sequenceStep: number;
}

// Every wander box is convex and clear of solid obstacles, so no straight leg
// between two targets can cross one. The chickens range on the coop's ramp side
// (the coop spans x 10.5-13.5 and its primitive ramp reaches x ~14.9), clear of
// the sheep at (9, -4); the cows keep 1.2 m off the paddock fence lines at
// x -5/15 and z 9/21, as the pigs already do inside their pen.
const CHICKEN_WANDER_BOUNDS: WanderBounds = { minX: 15.2, maxX: 18.5, minZ: -8.5, maxZ: -1.5 };
const PIG_WANDER_BOUNDS: WanderBounds = { minX: -14, maxX: -10, minZ: -7, maxZ: -3 };
const COW_WANDER_BOUNDS: WanderBounds = { minX: -3.8, maxX: 13.8, minZ: 10.6, maxZ: 19.4 };

const createAnimalState = (seed: number, bounds: WanderBounds): AnimalState => {
  const plan = createAnimalWanderPlan(seed, 0, bounds);
  return {
    target: new THREE.Vector3(plan.x, 0, plan.z),
    isIdle: false,
    idleTime: 0,
    seed,
    sequenceStep: 1,
  };
};

const _farmAtmosphere = createAtmosphereState();

/**
 * Quarter turn, same as `CowPrimitiveBody` and for the same measured reason:
 * the parts are authored facing +X while `updateAnimalMovement` steers by
 * `atan2(direction.x, direction.z)`, which aligns local +Z to the heading. An
 * unrotated primitive bird walks broadside to wherever it is going - the sidle
 * recorded against this component - and points 90 degrees off the generated
 * bird it stands in for.
 *
 * The turn is on the OUTER group, outside `animRef`, so the peck driver's
 * `rotation.z` write still tips the bird beak-down in the frame it was
 * calibrated in rather than rolling it sideways.
 */
const ChickenPrimitiveBody: React.FC<{
  animRef: React.RefObject<THREE.Group | null>;
}> = ({ animRef }) => (
  <group rotation={[0, -Math.PI / 2, 0]}>
    <group ref={animRef}>
      <mesh position={[0, 0.25, 0]} castShadow>
        <primitive object={SG.chickenBody} attach="geometry" />
        <primitive object={SM.chickenFeather} attach="material" />
      </mesh>
      <mesh position={[0.15, 0.4, 0]} castShadow>
        <primitive object={SG.chickenHead} attach="geometry" />
        <primitive object={SM.chickenFeather} attach="material" />
      </mesh>
      <mesh position={[0.28, 0.38, 0]} rotation={[0, 0, -0.3]} castShadow>
        <primitive object={SG.chickenBeak} attach="geometry" />
        <primitive object={SM.chickenBeak} attach="material" />
      </mesh>
      <mesh position={[0.15, 0.52, 0]} castShadow>
        <primitive object={SG.chickenComb} attach="geometry" />
        <primitive object={SM.chickenComb} attach="material" />
      </mesh>
      <mesh position={[0.2, 0.32, 0]} castShadow>
        <primitive object={SG.chickenWattle} attach="geometry" />
        <primitive object={SM.chickenComb} attach="material" />
      </mesh>
      <mesh position={[-0.2, 0.35, 0]} rotation={[0, 0, 0.8]} castShadow>
        <primitive object={SG.chickenTail} attach="geometry" />
        <primitive object={SM.chickenTail} attach="material" />
      </mesh>
    </group>
    <InstancedAnimalParts
      geometry={SG.chickenLeg}
      material={SM.chickenBeak}
      transforms={CHICKEN_LEG_PARTS}
      castShadow
    />
  </group>
);

const Chicken: React.FC<{
  position: [number, number, number];
  rotation?: number;
  groupRef: React.RefObject<THREE.Group | null>;
  animRef: React.RefObject<THREE.Group | null>;
  rigRef: React.RefObject<CreatureRigHandle | null>;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
}> = ({ position, rotation = 0, groupRef, animRef, rigRef, onClick }) => (
  <group
    ref={groupRef}
    position={position}
    rotation={[0, rotation, 0]}
    onClick={(e) => {
      if (onClick) {
        e.stopPropagation();
        onClick(e);
      }
    }}
    onPointerOver={onClick ? setPointerCursor : undefined}
    onPointerOut={onClick ? resetCursor : undefined}
  >
    <CreatureBody
      creature="chicken"
      ref={rigRef}
      fallback={<ChickenPrimitiveBody animRef={animRef} />}
    />
  </group>
);

/**
 * Quarter turn, for the same reason as the chicken above: authored facing +X,
 * steered as though it faced +Z. The tail wag is written on `tailRef`, which is
 * inside this group, so its axis is unchanged by the turn.
 */
const PigPrimitiveBody: React.FC<{
  tailRef: React.RefObject<THREE.Mesh | null>;
}> = ({ tailRef }) => (
  <group rotation={[0, -Math.PI / 2, 0]}>
    <mesh position={[0, 0.35, 0]} castShadow>
      <primitive object={SG.pigBody} attach="geometry" />
      <primitive object={SM.pigPink} attach="material" />
    </mesh>
    <mesh position={[0.35, 0.4, 0]} castShadow>
      <primitive object={SG.pigHead} attach="geometry" />
      <primitive object={SM.pigPink} attach="material" />
    </mesh>
    <mesh position={[0.55, 0.35, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
      <primitive object={SG.pigSnout} attach="geometry" />
      <primitive object={SM.pigSnout} attach="material" />
    </mesh>
    <InstancedAnimalParts
      geometry={SG.pigNostril}
      material={SM.pigNostril}
      transforms={PIG_NOSTRIL_PARTS}
    />
    <InstancedAnimalParts
      geometry={SG.pigEar}
      material={SM.pigPink}
      transforms={PIG_EAR_PARTS}
      castShadow
    />
    <InstancedAnimalParts geometry={SG.pigEye} material={SM.black} transforms={PIG_EYE_PARTS} />
    <InstancedAnimalParts
      geometry={SG.pigLeg}
      material={SM.pigPink}
      transforms={PIG_LEG_PARTS}
      castShadow
    />
    <mesh ref={tailRef} position={[-0.4, 0.45, 0]} rotation={[0, 0, 0.5]} castShadow>
      <primitive object={SG.pigTail} attach="geometry" />
      <primitive object={SM.pigPink} attach="material" />
    </mesh>
  </group>
);

/**
 * The generated pig rig stops at `Head`, so it has no tail joint and the
 * primitive's tail wag has no counterpart on it. `tailRef` therefore stays
 * wired to the fallback body, where it still animates if the GLB is missing;
 * `primitiveBodyLeaves.test.ts` records that as a deliberate exception rather
 * than letting it pass silently, because a ref threaded into a fallback is the
 * same defect class as a component nested in one.
 *
 * `rigRef` is the channel that survives the swap: rooting and leg swing on the
 * generated body, driven from the same wander state the tail wag reads.
 */
const Pig: React.FC<{
  position: [number, number, number];
  rotation?: number;
  groupRef: React.RefObject<THREE.Group | null>;
  tailRef: React.RefObject<THREE.Mesh | null>;
  rigRef: React.RefObject<CreatureRigHandle | null>;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
}> = ({ position, rotation = 0, groupRef, tailRef, rigRef, onClick }) => (
  // Scale only, for the same reason as the cow: the wander driver owns yaw.
  <group
    ref={groupRef}
    position={position}
    rotation={[0, rotation, 0]}
    scale={instanceScale(position)}
    onClick={(e) => {
      if (onClick) {
        e.stopPropagation();
        onClick(e);
      }
    }}
    onPointerOver={onClick ? setPointerCursor : undefined}
    onPointerOut={onClick ? resetCursor : undefined}
  >
    <CreatureBody creature="pig" ref={rigRef} fallback={<PigPrimitiveBody tailRef={tailRef} />} />
  </group>
);

/**
 * Primitive cow, kept as the Suspense fallback for the rigged GLB.
 *
 * The quarter turn is not decoration. Every part below is authored facing local
 * +X, but `updateAnimalMovement` steers with `Math.atan2(direction.x,
 * direction.z)`, which aligns local **+Z** to the heading - so an unrotated cow
 * walks broadside to wherever it is going. The generated asset faces +Z per
 * `public/models/README.md`, and this turn puts the primitive in the same frame
 * so the fallback and the real asset are interchangeable.
 */
/** Wander speed (0.5 m/s) over a ~0.9 m stride, in radians per second. */
const COW_STRIDE_RATE = 3.5;
/**
 * Chicken leg swing. A bird's real cadence at 1.5 m/s is roughly 38 rad/s,
 * which aliases into nonsense against the 15 Hz throttle this driver runs on;
 * 12 rad/s keeps about eight samples per stride and reads as a walk.
 */
const CHICKEN_STRIDE_RATE = 12;
/**
 * Pig leg swing. Same derivation as the cow's - `2 * PI * speed / stride` - at
 * the 0.8 m/s wander speed this driver uses and a roughly 0.5 m stride for an
 * animal a third of a cow's length. At the 15 Hz throttle that is nine samples
 * per cycle, above the cow's and below the chicken's.
 */
const PIG_STRIDE_RATE = 10;

const CowPrimitiveBody: React.FC<{
  headRef: React.RefObject<THREE.Group | null>;
}> = ({ headRef }) => (
  <group rotation={[0, -Math.PI / 2, 0]}>
    <mesh position={[0, 0.6, 0]} scale={[1.3, 1, 1]} castShadow>
      <primitive object={SG.cowBody} attach="geometry" />
      <primitive object={SM.cowWhite} attach="material" />
    </mesh>
    <mesh position={[0.2, 0.8, 0.3]} castShadow>
      <primitive object={SG.cowSpot} attach="geometry" />
      <primitive object={SM.cowBlack} attach="material" />
    </mesh>
    <mesh position={[-0.3, 0.5, -0.25]} castShadow>
      <primitive object={SG.cowSpotSmall} attach="geometry" />
      <primitive object={SM.cowBlack} attach="material" />
    </mesh>
    <group ref={headRef}>
      <mesh position={[0.6, 0.7, 0]} castShadow>
        <primitive object={SG.cowHead} attach="geometry" />
        <primitive object={SM.cowWhite} attach="material" />
      </mesh>
      <mesh position={[0.8, 0.6, 0]} castShadow>
        <primitive object={SG.cowMuzzle} attach="geometry" />
        <primitive object={SM.cowMuzzle} attach="material" />
      </mesh>
      <InstancedAnimalParts
        geometry={SG.cowNostril}
        material={SM.cowNostril}
        transforms={COW_NOSTRIL_PARTS}
      />
      <InstancedAnimalParts geometry={SG.cowEye} material={SM.black} transforms={COW_EYE_PARTS} />
      <InstancedAnimalParts
        geometry={SG.cowEar}
        material={SM.cowWhite}
        transforms={COW_EAR_PARTS}
        castShadow
      />
      <InstancedAnimalParts
        geometry={SG.cowHorn}
        material={SM.cowHorn}
        transforms={COW_HORN_PARTS}
        castShadow
      />
    </group>
    <InstancedAnimalParts
      geometry={SG.cowLeg}
      material={SM.cowWhite}
      transforms={COW_LEG_PARTS}
      castShadow
    />
    <mesh position={[-0.15, 0.25, 0]} castShadow>
      <primitive object={SG.cowUdder} attach="geometry" />
      <primitive object={SM.cowMuzzle} attach="material" />
    </mesh>
    {/* The tail hangs down and back off the rump. It used to be rotated +0.8,
        which swung it up and forward and left the tuft as a black sphere
        floating 20 cm clear of the tip; the taper is the tell, since
        `cowTail`'s thin end (0.015 against 0.02) is its -Y end and pointed into
        the body. The tuft now sits just past that tip. */}
    <mesh position={[-0.65, 0.7, 0]} rotation={[0, 0, -0.7]} castShadow>
      <primitive object={SG.cowTail} attach="geometry" />
      <primitive object={SM.cowWhite} attach="material" />
    </mesh>
    <mesh position={[-0.83, 0.49, 0]} castShadow>
      <primitive object={SG.cowTailTuft} attach="geometry" />
      <primitive object={SM.cowBlack} attach="material" />
    </mesh>
  </group>
);

/**
 * One paddock cow: the wandering group, with the rigged GLB inside it and the
 * primitive as the Suspense fallback.
 *
 * The group stays owned here rather than inside either body, so
 * `updateAnimalMovement` keeps writing one transform whichever body is mounted,
 * and a deployment without `public/models/farm/cow.glb` degrades to the
 * primitive rather than to an empty paddock.
 */
const PaddockCow: React.FC<{
  position: [number, number, number];
  rotation?: number;
  groupRef: React.RefObject<THREE.Group | null>;
  headRef: React.RefObject<THREE.Group | null>;
  rigRef: React.RefObject<CreatureRigHandle | null>;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
}> = ({ position, rotation = 0, groupRef, headRef, rigRef, onClick }) => (
  // Scale only, no yaw jitter: `updateAnimalMovement` writes `rotation.y` on
  // this group every other frame, so a jittered yaw would be overwritten within
  // one frame of the herd starting to wander. Three identical Holsteins were
  // named by both reviewers; size is the channel that survives the driver.
  <group
    ref={groupRef}
    position={position}
    rotation={[0, rotation, 0]}
    scale={instanceScale(position)}
    onClick={(e) => {
      if (onClick) {
        e.stopPropagation();
        onClick(e);
      }
    }}
    onPointerOver={onClick ? setPointerCursor : undefined}
    onPointerOut={onClick ? resetCursor : undefined}
  >
    <CreatureBody creature="cow" ref={rigRef} fallback={<CowPrimitiveBody headRef={headRef} />} />
  </group>
);

const WindmillPrimitiveBody: React.FC<{
  bladesRef: React.RefObject<THREE.Group | null>;
}> = ({ bladesRef }) => (
  <group>
    <mesh position={[0, 3, 0]} castShadow>
      <primitive object={SG.windmillTower} attach="geometry" />
      <primitive object={SM.stone} attach="material" />
    </mesh>
    <mesh position={[0, 6.5, 0]} castShadow>
      <primitive object={SG.windmillCap} attach="geometry" />
      <primitive object={SM.woodBrown} attach="material" />
    </mesh>
    {/* Quarter turn about X lays the boss along Z, the axis the sails turn
        about. Its tail stays buried in the tower's curb band and its collar
        spans the plane the blade arms cross in. */}
    <mesh position={[0, 5.5, 0.9]} rotation={[Math.PI / 2, 0, 0]} castShadow>
      <primitive object={SG.windmillHub} attach="geometry" />
      <primitive object={SM.woodBrown} attach="material" />
    </mesh>
    <group ref={bladesRef} position={[0, 5.5, 1]}>
      {[0, 1, 2, 3].map((i) => (
        <group key={i} rotation={[0, 0, (i * Math.PI) / 2]}>
          <mesh position={[0, 1.5, 0]} castShadow>
            <primitive object={SG.windmillBladeArm} attach="geometry" />
            <primitive object={SM.woodLight} attach="material" />
          </mesh>
          <mesh position={[0.2, 1.5, 0.02]} castShadow>
            <primitive object={SG.windmillBladeSail} attach="geometry" />
            <primitive object={SM.windmillSail} attach="material" />
          </mesh>
        </group>
      ))}
    </group>
    {/* Re-seated for the battered wall. A flat panel cannot hug a curve, so the
        door is leaned back by the wall's own slope over its height (r 1.181 at
        the sill, 0.988 at the head: atan(0.193 / 1.6) = 6.87 deg) and centred
        on the wall radius at its mid-height. It then stands 65-72 mm proud (72
        at the sill, 69 mid, 65 at the head) instead of wedging. */}
    <mesh position={[0, 0.9, 1.059]} rotation={[-0.1199, 0, 0]}>
      <primitive object={SG.windmillDoor} attach="geometry" />
      <primitive object={SM.woodBrown} attach="material" />
    </mesh>
  </group>
);
WindmillPrimitiveBody.displayName = 'WindmillPrimitiveBody';

/**
 * The mill, turning on both paths.
 *
 * The swap cost this animation and has now given it back. The generated asset
 * is a single mesh whose sails are modelled continuous with the cap - welded by
 * position it is one connected shell, so there is nothing to lift out and put
 * a `ref` on - and `GeneratedWindmillBody` therefore turns the sails in the
 * vertex shader against a weight baked from the rest pose. See that file for
 * the measurements that place the hub axis and the two bands.
 *
 * `bladesRef` stays wired to the primitive, which is the only body whose blades
 * are a group the scene driver can write to. It is null whenever the GLB has
 * loaded, so the driver's write is already skipped on the shipping path.
 */
export const WindmillComp: React.FC<{
  position: [number, number, number];
  scale?: number;
  bladesRef: React.RefObject<THREE.Group | null>;
}> = ({ position, scale = 1, bladesRef }) => (
  <group position={position} scale={scale}>
    <GeneratedWindmillBody fallback={<WindmillPrimitiveBody bladesRef={bladesRef} />} />
  </group>
);

// ===== HORSE (Adapted from VillageArea) =====
const HorsePrimitiveBody = React.memo<{ color?: string; isPaint?: boolean }>(
  ({ color = '#8d6e63', isPaint = false }) => (
    <group scale={0.6}>
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

        {/* Paint Spots (if isPaint is true) */}
        {isPaint && (
          <>
            <mesh position={[0.4, 0.2, 0.3]} rotation={[0, 1, 0]}>
              <sphereGeometry args={[0.3, 8, 8]} />
              <meshStandardMaterial color="#f5f5f5" />
            </mesh>
            <mesh position={[-0.4, 0.1, -0.4]} rotation={[0, -1, 0]}>
              <sphereGeometry args={[0.35, 8, 8]} />
              <meshStandardMaterial color="#f5f5f5" />
            </mesh>
            <mesh position={[0, 0.5, 0]}>
              <sphereGeometry args={[0.4, 8, 8]} />
              <meshStandardMaterial color="#f5f5f5" />
            </mesh>
          </>
        )}
      </group>

      {/* Neck - Max upright/proud */}
      <group position={[0, 2.1, 0.9]} rotation={[0.4, 0, 0]}>
        <mesh position={[0, 0.5, 0]} castShadow>
          <cylinderGeometry args={[0.25, 0.45, 1.2, 12]} />
          <meshStandardMaterial color={color} />
        </mesh>
        {/* Paint Spot on Neck */}
        {isPaint && (
          <mesh position={[0.15, 0.6, 0.1]} rotation={[0, 0, -0.2]}>
            <sphereGeometry args={[0.2, 8, 8]} />
            <meshStandardMaterial color="#f5f5f5" />
          </mesh>
        )}
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
        {/* Face Blaze (if paint) */}
        {isPaint && (
          <mesh position={[0, 0.18, 0.2]} rotation={[0.1, 0, 0]}>
            <boxGeometry args={[0.15, 0.02, 0.4]} />
            <meshStandardMaterial color="#f5f5f5" />
          </mesh>
        )}
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
          <meshStandardMaterial color={isPaint ? '#f5f5f5' : color} />
        </mesh>
        {/* White sock */}
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
          <meshStandardMaterial color={isPaint ? '#f5f5f5' : color} />
        </mesh>
        {/* White sock */}
        <mesh position={[0, -1.5, 0]}>
          <cylinderGeometry args={[0.12, 0.15, 0.15, 8]} />
          <meshStandardMaterial color="#1a1110" />
        </mesh>
      </group>

      {/* Tail */}
      <group position={[0, 1.7, -1.0]} rotation={[0.2, 0, 0]}>
        <mesh position={[0, -0.4, -0.2]} rotation={[-0.2, 0, 0]}>
          <cylinderGeometry args={[0.08, 0.15, 1.2, 8]} />
          <meshStandardMaterial color={isPaint ? '#f5f5f5' : '#3e2723'} />
          {/* White tail tip option or mixed */}
        </mesh>
      </group>
    </group>
  )
);
HorsePrimitiveBody.displayName = 'HorsePrimitiveBody';

/**
 * The generated horse is one paint horse, so the `color` and `isPaint` props no
 * longer select a coat - they are kept because the primitive fallback still
 * honours them, and because the call sites read better naming the animal they
 * asked for. A second coat is a second generation, not a tint: colouring a
 * material that carries a baked albedo washes the whole hide.
 */
const Horse = React.memo<{
  position: [number, number, number];
  rotation?: number;
  color?: string;
  isPaint?: boolean;
  rigRef?: React.RefObject<CreatureRigHandle | null>;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
}>(({ position, rotation = 0, color = '#8d6e63', isPaint = false, rigRef, onClick }) => (
  <group
    position={position}
    rotation={[0, rotation, 0]}
    onClick={(e) => {
      if (onClick) {
        e.stopPropagation();
        onClick(e);
      }
    }}
    onPointerOver={onClick ? setPointerCursor : undefined}
    onPointerOut={onClick ? resetCursor : undefined}
  >
    <CreatureBody
      creature="horse"
      ref={rigRef}
      fallback={<HorsePrimitiveBody color={color} isPaint={isPaint} />}
    />
  </group>
));
Horse.displayName = 'Horse';

const CrowPrimitiveBody = React.memo(() => (
  <group scale={0.6}>
    <mesh position={[0, 0.15, 0]}>
      <primitive object={SG.crowBody} attach="geometry" />
      <primitive object={SM.crowBlack} attach="material" />
    </mesh>
    <mesh position={[0, 0.35, 0.1]}>
      <primitive object={SG.crowHead} attach="geometry" />
      <primitive object={SM.crowBlack} attach="material" />
    </mesh>
    {/* Beak */}
    <mesh position={[0, 0.35, 0.18]} rotation={[1.5, 0, 0]}>
      <coneGeometry args={[0.03, 0.1, 4]} />
      <meshStandardMaterial color="#fb8c00" />
    </mesh>
    {/* Wings */}
    <mesh position={[0.12, 0.2, 0]} rotation={[0, 0, -0.5]}>
      <boxGeometry args={[0.05, 0.25, 0.15]} />
      <primitive object={SM.crowBlack} attach="material" />
    </mesh>
    <mesh position={[-0.12, 0.2, 0]} rotation={[0, 0, 0.5]}>
      <boxGeometry args={[0.05, 0.25, 0.15]} />
      <primitive object={SM.crowBlack} attach="material" />
    </mesh>
    {/* Tail */}
    <mesh position={[0, 0.1, -0.15]} rotation={[-0.5, 0, 0]}>
      <boxGeometry args={[0.1, 0.2, 0.02]} />
      <primitive object={SM.crowBlack} attach="material" />
    </mesh>
  </group>
));
CrowPrimitiveBody.displayName = 'CrowPrimitiveBody';

/**
 * Crow stab rate. A corvid's investigative peck is a fast, repeated stab rather
 * than a held graze, so this runs well above the cow's 0.5 rad/s bob; at the
 * 15 Hz throttle 4.2 rad/s still leaves nine samples per dip.
 */
const CROW_PECK_RATE = 4.2;
/**
 * Fraction of the cycle the bird spends with its head down. `smoothstep` over
 * the peak of a sine keeps it up and alert most of the time, which is what
 * separates a crow from a grazer.
 */
const CROW_PECK_DUTY = 0.62;

const Crow = React.memo<{ position: [number, number, number]; rotation?: number }>(
  ({ position, rotation = 0 }) => {
    const [isExcited, setIsExcited] = useState(false);
    const [hearts, setHearts] = useState<{ id: number; pos: [number, number, number] }[]>([]);
    const nextHeartId = useRef(0);
    const rigRef = useRef<CreatureRigHandle>(null);
    const shakenRef = useRef(false);
    // Perch phase, seeded off the crow's own position so two birds on two
    // perches would not stab in lockstep. Deterministic, unlike Math.random,
    // which re-rolls on every remount.
    const phase = useMemo(() => position[0] * 1.7 + position[2] * 0.9, [position]);

    // `stride: 0` for this species - a perched bird has nothing to swing - so
    // the whole of its rig motion is the neck. Runs on the shared 1-in-4
    // throttle; the pet response takes the head off the peck and into a shake
    // for as long as it lasts, rather than adding the two into a scribble.
    useFrame((state) => {
      const rig = rigRef.current;
      if (!rig) return;
      if (!shouldRunThisFrame(4)) return;
      const time = state.clock.elapsedTime;
      if (isExcited) {
        rig.setHeadShake(Math.sin(time * 18) * 0.35);
        shakenRef.current = true;
        rig.setGraze(0);
        return;
      }
      // Cleared once rather than every sample: each setter rebuilds the whole
      // pose and calls `updateMatrixWorld`, so an unconditional write here
      // would double the bird's rig cost for a value that has not changed.
      if (shakenRef.current) {
        rig.setHeadShake(0);
        shakenRef.current = false;
      }
      const wave = Math.sin(time * CROW_PECK_RATE + phase);
      rig.setGraze(THREE.MathUtils.smoothstep(wave, CROW_PECK_DUTY, 1));
    });

    const handlePet = (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      setIsExcited(true);
      playCritterSound('crow');
      const id = nextHeartId.current++;
      setHearts((prev) => [...prev, { id, pos: [0, 1.0, 0] }]);
    };

    const removeHeart = (id: number) => {
      setHearts((prev) => prev.filter((h) => h.id !== id));
    };

    useEffect(() => {
      if (isExcited) {
        const t = setTimeout(() => setIsExcited(false), 500);
        return () => clearTimeout(t);
      }
    }, [isExcited]);

    return (
      <group
        position={position}
        rotation={[0, rotation, 0]}
        onClick={handlePet}
        onPointerOver={setPointerCursor}
        onPointerOut={resetCursor}
      >
        <group rotation={[isExcited ? 0.5 : 0, 0, 0]} position={[0, isExcited ? 0.2 : 0, 0]}>
          <CreatureBody creature="crow" ref={rigRef} fallback={<CrowPrimitiveBody />} />
        </group>

        {hearts.map((h) => (
          <HeartParticle key={h.id} position={h.pos} onComplete={() => removeHeart(h.id)} />
        ))}
      </group>
    );
  }
);
Crow.displayName = 'Crow';

const InstancedGrainField = React.memo(() => {
  const stalksRef = useRef<THREE.InstancedMesh>(null);
  const leaves1Ref = useRef<THREE.InstancedMesh>(null);
  const leaves2Ref = useRef<THREE.InstancedMesh>(null);
  const count = 15 * 20;

  // The custom depth material carries the same wind injection, or the crop's
  // shadow stays rigid while the crop itself sways - which reads as a bug in
  // the lighting rather than as weather.
  useEffect(() => {
    [stalksRef.current, leaves1Ref.current, leaves2Ref.current].forEach((mesh) => {
      if (mesh) mesh.customDepthMaterial = cornDepthMaterial;
    });
  }, []);

  // Layout, not passive: a frame rendered before the matrices land would cache
  // an origin-sized bounding sphere and cull the whole 30 x 21 m crop.
  useLayoutEffect(() => {
    if (!stalksRef.current || !leaves1Ref.current || !leaves2Ref.current) return;

    // Temp objects for matrix calculations
    const parent = new THREE.Object3D();
    const leaf = new THREE.Object3D();
    const tint = new THREE.Color();
    let idx = 0;

    for (let r = 0; r < 15; r++) {
      for (let c = 0; c < 20; c++) {
        // Stable randomness based on grid position
        const rnd = Math.sin(r * 20 + c) * 1000;
        const rndScale = 0.8 + (Math.abs(rnd) % 0.4);
        const rndRot = Math.abs(rnd) % Math.PI;
        const rndOffsetX = Math.sin(rnd) * 0.5;
        const rndOffsetZ = Math.cos(rnd) * 0.5;

        const x = (c - 10) * 1.5 + rndOffsetX;
        const z = (r - 7) * 1.5 + rndOffsetZ;

        // Set parent transform (Stalk base)
        parent.position.set(x, 0, z);
        parent.rotation.set(0, rndRot, 0);
        parent.scale.set(rndScale, rndScale, rndScale);
        parent.updateMatrix();

        // Stalk mesh (offset locally by 0.9y)
        leaf.position.set(0, 0.9, 0);
        leaf.rotation.set(0, 0, 0);
        leaf.scale.set(1, 1, 1);
        leaf.updateMatrix();
        leaf.matrix.premultiply(parent.matrix);
        stalksRef.current.setMatrixAt(idx, leaf.matrix);

        // Leaf 1
        leaf.position.set(0, 1.2, 0.2);
        leaf.rotation.set(0.5, 0, 0);
        leaf.scale.set(1, 1, 1);
        leaf.updateMatrix();
        leaf.matrix.premultiply(parent.matrix);
        leaves1Ref.current.setMatrixAt(idx, leaf.matrix);

        // Leaf 2
        leaf.position.set(0, 1.0, -0.2);
        leaf.rotation.set(-0.5, 0, 0);
        leaf.scale.set(1, 1, 1);
        leaf.updateMatrix();
        leaf.matrix.premultiply(parent.matrix);
        leaves2Ref.current.setMatrixAt(idx, leaf.matrix);

        // Per-stalk tint: a 300-stalk field on one flat green reads as a
        // printed texture. Rides `instanceColor`, NOT `vertexColors` - the
        // geometry has no `color` attribute and USE_COLOR in the vertex stage
        // would multiply by an absent attribute (0,0,0,1) and blacken the crop.
        // Brackets the old flat '#8bc34a' (HSL ~0.244/0.50/0.53): green where
        // the crop is still young, golden where it has ripened.
        const ripeness = Math.abs(Math.sin(r * 3.7 + c * 1.9)) % 1;
        tint.setHSL(0.26 - ripeness * 0.11, 0.46 + ripeness * 0.16, 0.46 + ripeness * 0.12);
        stalksRef.current.setColorAt(idx, tint);
        leaves1Ref.current.setColorAt(idx, tint);
        leaves2Ref.current.setColorAt(idx, tint);

        idx++;
      }
    }

    stalksRef.current.instanceMatrix.needsUpdate = true;
    leaves1Ref.current.instanceMatrix.needsUpdate = true;
    leaves2Ref.current.instanceMatrix.needsUpdate = true;
    if (stalksRef.current.instanceColor) stalksRef.current.instanceColor.needsUpdate = true;
    if (leaves1Ref.current.instanceColor) leaves1Ref.current.instanceColor.needsUpdate = true;
    if (leaves2Ref.current.instanceColor) leaves2Ref.current.instanceColor.needsUpdate = true;
    // setMatrixAt never invalidates InstancedMesh.boundingSphere.
    stalksRef.current.computeBoundingSphere();
    leaves1Ref.current.computeBoundingSphere();
    leaves2Ref.current.computeBoundingSphere();
  }, []);

  return (
    <group>
      <instancedMesh ref={stalksRef} args={[undefined, undefined, count]} castShadow>
        <primitive object={SG.cornStalk} attach="geometry" />
        <primitive object={SM.cornGreen} attach="material" />
      </instancedMesh>
      <instancedMesh ref={leaves1Ref} args={[undefined, undefined, count]} castShadow>
        <primitive object={SG.cornLeaf} attach="geometry" />
        <primitive object={SM.cornGreen} attach="material" />
      </instancedMesh>
      <instancedMesh ref={leaves2Ref} args={[undefined, undefined, count]} castShadow>
        <primitive object={SG.cornLeaf} attach="geometry" />
        <primitive object={SM.cornGreen} attach="material" />
      </instancedMesh>
    </group>
  );
});
InstancedGrainField.displayName = 'InstancedGrainField';

// ============================================================
// VEGETATION LAYOUT (farm-local coordinates; group is at [75, 0, 120] and
// rotated PI about Y, so these are pre-rotation values)
// ============================================================

/** The same five conifers as before, now one instanced draw for the stand. */
const FARM_TREES: readonly TreeInstance[] = [
  { position: [-32, 0, -20], scale: 1.2, type: 'pine' },
  { position: [28, 0, -12], scale: 1.2, type: 'pine' },
  { position: [-35, 0, 25], scale: 1.2, type: 'pine' },
  { position: [32, 0, 22], scale: 1.2, type: 'pine' },
  { position: [-28, 0, -25], scale: 1.2, type: 'pine' },
];

const FARM_TREE_SPOTS: readonly (readonly [number, number])[] = FARM_TREES.map(
  (t) => [t.position[0], t.position[2]] as const
);

/** The farm pad is flattened to the -0.02 ground datum and the trees stand on
 *  open terrain, so the mulch takes the overlay layer 1 cm above it -
 *  InstancedMulch's own default. */
const FARM_DECAL_Y = EXTERIOR_LAYERS.groundOverlay;

const FARM_BLOCKERS = [
  { x: 0, z: 0, halfX: 6, halfZ: 5 }, // barn
  { x: 12, z: -5, halfX: 2.6, halfZ: 2.4 }, // chicken coop
  { x: -10, z: 12, halfX: 5.5, halfZ: 4.5 }, // farmhouse
  { x: -15, z: 16, halfX: 2.2, halfZ: 1.6 }, // garden bed
  { x: -15, z: 19, halfX: 2.2, halfZ: 1.6 }, // garden bed
  { x: 15, z: -15, halfX: 2.6, halfZ: 2.6 }, // windmill
  { x: -12, z: -5, halfX: 3.4, halfZ: 3.4 }, // pig pen + mud puddle
  { x: 8, z: 8, halfX: 4, halfZ: 2 }, // culvert crossing
  { x: 0, z: -30, halfX: 4, halfZ: 2 }, // culvert crossing
  { x: 6.3, z: -1, halfX: 1.8, halfZ: 2.6 }, // hay bale stack
] as const;

/** Swept yard and ploughed crop rows: no wild grass in either. */
const FARM_OPEN_BLOCKERS = [
  { x: 0, z: 0, halfX: 11, halfZ: 9 }, // barnyard cobble
  { x: 0, z: -42, halfX: 18, halfZ: 14 }, // grain field
] as const;

const FARM_ATTRACTORS: readonly (readonly [number, number])[] = [
  // barn walls
  [-5.3, -4.3],
  [5.3, -4.3],
  [-5.3, 4.3],
  [5.3, 4.3],
  [0, -4.4],
  [-5.4, 0],
  [5.4, 0],
  // chicken coop
  [10.2, -5],
  [13.8, -5],
  [12, -6.6],
  [12, -3.4],
  // farmhouse
  [-14.4, 12],
  [-5.6, 12],
  [-10, 8.4],
  [-10, 15.6],
  // pig-pen fence runs
  [-12, -8.2],
  [-14, -8.2],
  [-10, -8.2],
  [-12, -1.8],
  [-14, -1.8],
  [-10, -1.8],
  [-15.2, -5],
  [-15.2, -7],
  [-15.2, -3],
  [-8.8, -5],
  [-8.8, -7],
  [-8.8, -3],
  // garden beds, trough, windmill base
  [-17.4, 16],
  [-17.4, 19],
  [-12.6, 17.5],
  [0, -5.6],
  [15, -17.8],
  [15, -12.2],
  // hay bales
  [6, -3.4],
  [7.8, 0],
  [-7.4, 3],
  // tree bases
  [-32, -20],
  [28, -12],
  [-35, 25],
  [32, 22],
  [-28, -25],
];

const FARM_CLUTTER: ClutterSpec = {
  count: 700,
  bounds: { minX: -38, maxX: 36, minZ: -30, maxZ: 32 },
  exclude: FARM_BLOCKERS,
  openExclude: FARM_OPEN_BLOCKERS,
  attractors: FARM_ATTRACTORS,
  // 5 mm under the ground datum: sinking a card base is invisible, floating
  // one is not.
  y: EXTERIOR_LAYERS.ground - 0.005,
  cullDistance: 120,
};

// Main component with single useFrame for all animations
export const FarmArea: React.FC = () => {
  // --- Chicken Refs & State ---
  const chickenRefs = useMemo(
    () => Array.from({ length: 5 }, () => React.createRef<THREE.Group>()),
    []
  );
  const chickenAnimRefs = useMemo(
    () => Array.from({ length: 5 }, () => React.createRef<THREE.Group>()),
    []
  );
  const chickenStates = useRef<AnimalState[]>(
    Array.from({ length: 5 }, (_, index) => createAnimalState(100 + index, CHICKEN_WANDER_BOUNDS))
  );

  // --- Pig Refs & State ---
  const pigRefs = useMemo(
    () => Array.from({ length: 3 }, () => React.createRef<THREE.Group>()),
    []
  );
  const pigTailRefs = useMemo(
    () => Array.from({ length: 3 }, () => React.createRef<THREE.Mesh>()),
    []
  );
  const pigRigRefs = useMemo(
    () => Array.from({ length: 3 }, () => React.createRef<CreatureRigHandle>()),
    []
  );
  // Root depth and leg-swing blend per pig, held here for the same reason the
  // cow's are: the driver owns the amount and each body owns the pose.
  const pigRoot = useRef<number[]>(new Array(3).fill(0));
  const pigStride = useRef<number[]>(new Array(3).fill(0));
  const pigStates = useRef<AnimalState[]>(
    Array.from({ length: 3 }, (_, index) => createAnimalState(200 + index, PIG_WANDER_BOUNDS))
  );

  // --- Cow Refs & State ---
  const cowRefs = useMemo(
    () => Array.from({ length: 3 }, () => React.createRef<THREE.Group>()),
    []
  );
  // Head group of the primitive fallback. Null once the rigged GLB has
  // streamed in - `cowRigRefs` is the live channel from that point on.
  const cowHeadRefs = useMemo(
    () => Array.from({ length: 3 }, () => React.createRef<THREE.Group>()),
    []
  );
  const chickenRigRefs = useMemo(
    () => Array.from({ length: 5 }, () => React.createRef<CreatureRigHandle>()),
    []
  );
  // Peck depth and leg-swing blend per bird, held here for the same reason the
  // cow's are: the rigged body and the primitive fallback express them
  // differently, so the driver owns the amount and each body owns the pose.
  const chickenPeck = useRef<number[]>(new Array(5).fill(0));
  const chickenStride = useRef<number[]>(new Array(5).fill(0));

  const cowRigRefs = useMemo(
    () => Array.from({ length: 3 }, () => React.createRef<CreatureRigHandle>()),
    []
  );
  // Graze amount per cow, 0 (head up) to 1 (muzzle in the sward). Held here
  // rather than read back off a transform because the two bodies express it
  // differently - a neck chain on the rig, one group rotation on the primitive.
  const cowGraze = useRef<number[]>(new Array(3).fill(0));
  // Leg-swing blend, the complement of grazing. Only the rigged body has legs
  // that can swing; the primitive fallback has four fixed cylinders.
  const cowStride = useRef<number[]>(new Array(3).fill(0));
  const cowStates = useRef<AnimalState[]>(
    Array.from({ length: 3 }, (_, index) => createAnimalState(300 + index, COW_WANDER_BOUNDS))
  );

  const sheepRefs = useMemo(
    () => Array.from({ length: 4 }, () => React.createRef<THREE.Group>()),
    []
  );
  const sheepRigRefs = useMemo(
    () => Array.from({ length: 4 }, () => React.createRef<CreatureRigHandle>()),
    []
  );
  // Graze amount per sheep. Unlike the cow there is no stride channel: these
  // four are placed around the barnyard rather than inside a paddock and have
  // no wander state, so a leg swing would be marching on the spot.
  const sheepGraze = useRef<number[]>(new Array(4).fill(0));

  // The horse is a single static animal, so it carries one handle rather than
  // an array, and grazes without a stride for the same reason the sheep do.
  const horseRigRef = useRef<CreatureRigHandle>(null);
  const horseGraze = useRef(0);
  const horseShakeState = useRef(0);

  const windmillBladesRef = useRef<THREE.Group>(null);
  const windmillAngleRef = useRef(0);
  const frameCountRef = useRef(0);

  // Petting interaction state
  const [hearts, setHearts] = React.useState<
    { id: number; pos: [number, number, number]; startTime: number }[]
  >([]);
  const nextHeartId = useRef(0);

  // Every pettable animal here mounts and unmounts with the farm, so one reset
  // keeps a hovered animal from leaving the pointer cursor stuck.
  useEffect(() => resetCursor, []);

  // Refs for jumping animation intensity (0 to 1)
  const chickenJumpStates = useRef<number[]>(new Array(5).fill(0));
  const pigJumpStates = useRef<number[]>(new Array(3).fill(0));
  const cowJumpStates = useRef<number[]>(new Array(3).fill(0));
  const sheepJumpStates = useRef<number[]>(new Array(4).fill(0)); // 4 sheep

  const handlePet = React.useCallback(
    (
      pos: [number, number, number],
      type: 'chicken' | 'pig' | 'cow' | 'sheep' | 'horse',
      index: number
    ) => {
      // Spawn heart
      setHearts((prev) => [
        ...prev,
        {
          id: nextHeartId.current++,
          pos: [pos[0], pos[1] + 2, pos[2]],
          startTime: Date.now(),
        },
      ]);

      // Trigger jump animation
      if (type === 'chicken') chickenJumpStates.current[index] = 1.0;
      if (type === 'pig') pigJumpStates.current[index] = 1.0;
      // Cows are too heavy to jump, maybe just wiggle?
      if (type === 'cow') cowJumpStates.current[index] = 1.0;
      if (type === 'sheep') sheepJumpStates.current[index] = 1.0;
      // The horse answers on its rig rather than on a group transform; see the
      // shake driver in `useFrame`.
      if (type === 'horse') horseShakeState.current = 1.0;

      playCritterSound(type);
    },
    []
  );

  const removeHeart = React.useCallback((id: number) => {
    setHearts((prev) => prev.filter((h) => h.id !== id));
  }, []);

  // Animation offsets
  const chickenOffsets = useMemo(() => [0, 1.2, 2.4, 3.6, 4.8], []);
  const pigOffsets = useMemo(() => [0, 1.5, 3], []);
  const cowOffsets = useMemo(() => [0, 2, 4], []);
  // Spread across a full period rather than the 0-4 the older lists use: four
  // sheep standing in one barnyard with nothing else to distinguish them read
  // as a single animal duplicated if their heads rise and fall together.
  const sheepOffsets = useMemo(() => [0, 1.6, 3.1, 4.7], []);

  // Movement Helpers
  const updateAnimalMovement = (
    ref: THREE.Group | null,
    state: AnimalState,
    delta: number,
    speed: number,
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
    yOffset: number = 0
  ) => {
    if (!ref) return;

    if (state.isIdle) {
      state.idleTime -= delta;
      if (state.idleTime <= 0) {
        state.isIdle = false;
      }
    } else {
      // Move towards target
      const currentPos = ref.position;
      const direction = _animDir.subVectors(state.target, currentPos);
      // Horizontal only: a pet-jump's y offset must not bleed into the step
      // or the arrival test.
      direction.y = 0;
      const dist = direction.length();

      if (dist < 0.1) {
        state.isIdle = true;
        const nextPlan = createAnimalWanderPlan(state.seed, state.sequenceStep, bounds);
        state.sequenceStep += 1;
        state.target.set(nextPlan.x, yOffset, nextPlan.z);
        state.idleTime = nextPlan.idleSeconds;
      } else {
        direction.normalize();

        // Smooth rotation along the SHORTEST arc. A plain lerp toward atan2's
        // [-PI, PI] result spins the animal ~340 degrees whenever its heading
        // crosses +/-PI.
        const targetRotation = Math.atan2(direction.x, direction.z);
        const turn = Math.atan2(
          Math.sin(targetRotation - ref.rotation.y),
          Math.cos(targetRotation - ref.rotation.y)
        );
        ref.rotation.y += turn * Math.min(1, delta * 5);

        // Move
        currentPos.add(direction.multiplyScalar(speed * delta));
      }
    }
  };

  // SINGLE useFrame - THROTTLED/BATCHED
  useFrame((state, delta) => {
    const { gameDay, gameTime, gameSpeed, weather, isTabVisible } =
      useGameSimulationStore.getState();
    if (!isTabVisible || gameSpeed <= 0) return;

    // Cap delta for tab-switch recovery (prevents large jumps after tab is inactive)
    const cappedDelta = Math.min(delta, 0.1);
    frameCountRef.current++;
    const time = state.clock.elapsedTime;
    const atmosphere = sampleAtmosphere(gameDay, gameTime, weather, _farmAtmosphere);
    const animalActivity = getAnimalActivityMultiplier(weather, gameTime);

    // Windmill: every 2nd frame (30 FPS)
    if (frameCountRef.current % 2 === 0 && windmillBladesRef.current) {
      windmillAngleRef.current += cappedDelta * 2 * getWindmillAngularSpeed(atmosphere.wind);
      windmillBladesRef.current.rotation.z = windmillAngleRef.current;
    }

    // Animals: every 2nd frame for smooth movement (30 FPS)
    // We update movement slightly more often than the body animations (pecking/wagging)
    if (frameCountRef.current % 2 === 0) {
      const adjustDelta = cappedDelta * 2 * animalActivity; // Compensate for skipped frames

      // Chickens
      chickenRefs.forEach((ref, i) => {
        updateAnimalMovement(
          ref.current,
          chickenStates.current[i],
          adjustDelta,
          1.5, // Speed
          CHICKEN_WANDER_BOUNDS
        );
      });

      // Pigs
      pigRefs.forEach((ref, i) => {
        updateAnimalMovement(
          ref.current,
          pigStates.current[i],
          adjustDelta,
          0.8, // Speed
          PIG_WANDER_BOUNDS
        );
      });

      // Cows
      cowRefs.forEach((ref, i) => {
        updateAnimalMovement(
          ref.current,
          cowStates.current[i],
          adjustDelta,
          0.5, // Speed
          COW_WANDER_BOUNDS
        );
      });
    }

    // Jump/Wiggle Animations for Petting (Every 2nd frame)
    if (frameCountRef.current % 2 === 0) {
      chickenJumpStates.current.forEach((val, i) => {
        if (val > 0 && chickenRefs[i].current) {
          chickenRefs[i].current.position.y = Math.sin(val * Math.PI) * 0.5;
          chickenJumpStates.current[i] = Math.max(0, val - cappedDelta * 3);
          if (chickenJumpStates.current[i] === 0) chickenRefs[i].current.position.y = 0;
        }
      });

      pigJumpStates.current.forEach((val, i) => {
        if (val > 0 && pigRefs[i].current) {
          // Pigs wiggle
          pigRefs[i].current.rotation.z = Math.sin(val * 20) * 0.1;
          pigJumpStates.current[i] = Math.max(0, val - cappedDelta * 2);
          if (pigJumpStates.current[i] === 0) pigRefs[i].current.rotation.z = 0;
        }
      });

      // The horse has no jump state of its own - it is a single static animal
      // with no wander group to bounce - so the pet response lives entirely on
      // its rig, as a lateral head sweep. Same decay rate as the cow's.
      if (horseShakeState.current > 0) {
        const angle = Math.sin(horseShakeState.current * 15) * 0.25;
        horseShakeState.current = Math.max(0, horseShakeState.current - cappedDelta * 2);
        horseRigRef.current?.setHeadShake(horseShakeState.current === 0 ? 0 : angle);
      }

      // Cows shake their heads. A shake is a lateral sweep, so it belongs on
      // the vertical axis; the old `rotation.z` write was the nod axis, which
      // made the pet response a vertical bob and left grazing (on `rotation.x`)
      // as a sideways roll of the whole head.
      cowJumpStates.current.forEach((val, i) => {
        if (val <= 0) return;
        const angle = Math.sin(val * 15) * 0.2;
        cowJumpStates.current[i] = Math.max(0, val - cappedDelta * 2);
        const settled = cowJumpStates.current[i] === 0 ? 0 : angle;
        const rig = cowRigRefs[i].current;
        if (rig) rig.setHeadShake(settled);
        else if (cowHeadRefs[i].current) cowHeadRefs[i].current.rotation.y = settled;
      });

      // Sheep Jump
      sheepJumpStates.current.forEach((val, i) => {
        if (val > 0 && sheepRefs[i].current) {
          sheepRefs[i].current.position.y = Math.sin(val * Math.PI) * 0.5;
          sheepJumpStates.current[i] = Math.max(0, val - cappedDelta * 3);
          if (sheepJumpStates.current[i] === 0) sheepRefs[i].current.position.y = 0;
        }
      });
    }

    // Body animations (Pecking, Wagging, Grazing)
    // Throttle to every 4th frame (15 FPS)
    if (frameCountRef.current % 4 !== 0) return;

    // Pecking, only when idle. Peckers dip repeatedly where a grazer holds the
    // pose, so this oscillates the whole 0-1 range rather than sitting near the
    // top of it the way the cow's graze does.
    chickenAnimRefs.forEach((ref, i) => {
      const idle = chickenStates.current[i].isIdle;
      const target = idle ? 0.5 + Math.sin(time * 3 + chickenOffsets[i]) * 0.5 : 0;
      chickenPeck.current[i] = THREE.MathUtils.lerp(chickenPeck.current[i], target, 0.25);
      chickenStride.current[i] = THREE.MathUtils.lerp(chickenStride.current[i], idle ? 0 : 1, 0.15);
      const rig = chickenRigRefs[i].current;
      if (rig) {
        rig.setGraze(chickenPeck.current[i]);
        rig.setStride(time * CHICKEN_STRIDE_RATE + chickenOffsets[i], chickenStride.current[i]);
      } else if (ref.current) {
        // Local Z, negative, because the primitive bird is authored facing +X:
        // `rotation.x` rolled the whole body sideways about its own length
        // instead of tipping it beak-down, the same transposition the cow's
        // graze carried. `animRef` wraps the body but not the legs, so the bird
        // tips over its feet rather than the feet leaving the ground.
        ref.current.rotation.z = -chickenPeck.current[i] * 0.4;
      }
    });

    pigTailRefs.forEach((ref, i) => {
      if (ref.current) ref.current.rotation.z = Math.sin(time * 5 + pigOffsets[i]) * 0.3;
    });

    // Rooting rather than grazing: a pig works the ground in short shoves, so
    // this drives the full depth when idle and eases out of it when walking,
    // the same shape as the cow's graze on a faster clock. `bend: 1.2` is the
    // shallowest in the roster because the solved pose already puts the snout
    // at 0.062 m - any more and it goes through the ground.
    pigRigRefs.forEach((rigRef, i) => {
      const rig = rigRef.current;
      if (!rig) return;
      const idle = pigStates.current[i].isIdle;
      const target = idle ? 0.75 + Math.sin(time * 1.6 + pigOffsets[i]) * 0.25 : 0;
      pigRoot.current[i] = THREE.MathUtils.lerp(pigRoot.current[i], target, 0.15);
      pigStride.current[i] = THREE.MathUtils.lerp(pigStride.current[i], idle ? 0 : 1, 0.15);
      rig.setGraze(pigRoot.current[i]);
      rig.setStride(time * PIG_STRIDE_RATE + pigOffsets[i], pigStride.current[i]);
    });

    // Sheep and the horse have no wander state, so their graze is not gated on
    // idleness - it is a slow, continuous crop with the head coming up between
    // mouthfuls. The floor of the sine is what stops four sheep and a horse
    // from standing nose-down for the whole session.
    sheepRigRefs.forEach((rigRef, i) => {
      const rig = rigRef.current;
      if (!rig) return;
      const target = 0.6 + Math.sin(time * 0.35 + sheepOffsets[i]) * 0.4;
      sheepGraze.current[i] = THREE.MathUtils.lerp(sheepGraze.current[i], target, 0.08);
      rig.setGraze(sheepGraze.current[i]);
    });

    if (horseRigRef.current) {
      // Slower and shallower than the sheep. `reached: 0.44` is a rig limit -
      // that neck curls rather than extends - so driving it to a hard 1.0 buys
      // no more reach and only holds the pose longer.
      const target = 0.55 + Math.sin(time * 0.28) * 0.35;
      horseGraze.current = THREE.MathUtils.lerp(horseGraze.current, target, 0.06);
      horseRigRef.current.setGraze(horseGraze.current);
    }

    // Grazing, expressed as an amount rather than an angle so the same driver
    // serves the rigged neck chain and the primitive fallback's head group.
    // Easing both ways rather than snapping to the idle value: a deforming neck
    // shows the step that a rigid box head hid.
    cowHeadRefs.forEach((ref, i) => {
      const idle = cowStates.current[i].isIdle;
      const target = idle ? 0.85 + Math.sin(time * 0.5 + cowOffsets[i]) * 0.15 : 0;
      cowGraze.current[i] = THREE.MathUtils.lerp(cowGraze.current[i], target, 0.1);
      cowStride.current[i] = THREE.MathUtils.lerp(cowStride.current[i], idle ? 0 : 1, 0.12);
      const rig = cowRigRefs[i].current;
      if (rig) {
        rig.setGraze(cowGraze.current[i]);
        // Phase is free-running rather than integrated, so it cannot drift out
        // of step with the clock when frames are dropped. COW_STRIDE_RATE is
        // the 0.5 m/s wander speed over a roughly 0.9 m stride.
        rig.setStride(time * COW_STRIDE_RATE + cowOffsets[i], cowStride.current[i]);
      } else if (ref.current) {
        // Nose down is a negative rotation about the primitive's local Z, its
        // pitch axis. The previous `rotation.x` write rolled the head sideways
        // about the cow's own length instead - visible as a head cocked 30 cm
        // off the body's midline rather than as a nod.
        ref.current.rotation.z = -cowGraze.current[i] * 0.45;
      }
    });
  });

  const chickenData = useMemo(
    () => [
      // Inside CHICKEN_WANDER_BOUNDS, so the first leg cannot cross the coop.
      { pos: [15.8, 0, -3] as [number, number, number], rot: 0.5 },
      { pos: [17, 0, -4.2] as [number, number, number], rot: -0.3 },
      { pos: [16, 0, -7] as [number, number, number], rot: 1.2 },
      { pos: [18, 0, -5.8] as [number, number, number], rot: 2.1 },
      { pos: [15.6, 0, -5.4] as [number, number, number], rot: -1.5 },
    ],
    []
  );
  const pigData = useMemo(
    () => [
      { pos: [-12, 0, -5] as [number, number, number], rot: 0.8 },
      { pos: [-11, 0, -6] as [number, number, number], rot: -0.5 },
      { pos: [-13, 0, -4] as [number, number, number], rot: 1.5 },
    ],
    []
  );
  const cowData = useMemo(
    () => [
      { pos: [0, 0, 15] as [number, number, number], rot: 0.3 },
      { pos: [5, 0, 18] as [number, number, number], rot: -0.8 },
      { pos: [8, 0, 13] as [number, number, number], rot: 1.5 },
    ],
    []
  );

  // Alpha-cut clutter is fill-rate work, so the tier drops it rather than
  // shrinking it: 0 / 0.35 / 1 / 1 for low / medium / high / ultra.
  const density = useVegetationDensity();
  const clutterSpec = useMemo<ClutterSpec>(() => ({ ...FARM_CLUTTER, density }), [density]);

  return (
    <group
      name="authored-farm-site"
      position={SITE_LAYOUT.landmarks.farm.position}
      rotation={SITE_LAYOUT.landmarks.farm.rotation}
      scale={SITE_LAYOUT.landmarks.farm.scale}
    >
      {/* Barnyard cobblestone ground, on the ground datum the farm pad is
          flattened to, so the animals standing on it at y 0 are not buried.
          Coplanar with the terrain; its -2/-2 offset against the terrain's
          exteriorBase holds the depth order. */}
      <mesh position={[0, EXTERIOR_LAYERS.ground, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[20, 15]} />
        {/* Untinted: the cobble albedo now decodes as sRGB, so the old
            '#9a9a9a' compensator would darken the yard twice. */}
        <meshStandardMaterial
          color="#ffffff"
          map={farmBarnyardCobbleColor}
          normalMap={farmBarnyardCobbleNormal}
          normalScale={FARM_COBBLE_NORMAL_SCALE}
          roughnessMap={farmBarnyardCobbleRoughness}
          roughness={1.0}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
        />
      </mesh>
      <Barn position={[0, 0, 0]} />
      <ChickenCoop position={[12, 0, -5]} />
      <Farmhouse position={[-10, 0, 12]} />
      <GardenBed position={[-15, 0, 16]} />
      <GardenBed position={[-15, 0, 19]} />

      {/* Drainage culvert under the farm road - provides water drainage from fields */}
      <DrainageCulvert position={[8, -0.3, 8]} rotation={Math.PI / 2} length={6} radius={0.6} />
      {chickenData.map((c, i) => (
        <Chicken
          key={`chicken-${i}`}
          position={c.pos}
          rotation={c.rot}
          groupRef={chickenRefs[i]}
          animRef={chickenAnimRefs[i]}
          rigRef={chickenRigRefs[i]}
          onClick={() => handlePet(c.pos, 'chicken', i)}
        />
      ))}
      <group position={[-12, 0, -5]}>
        {/* The crow's only mount was the straw effigy the uncrewed contract
            removes (`config/humanPresencePolicy.test.ts`). Re-seated on the
            pen's corner post rather than deleted: `farm/crow.glb` is a rigged
            asset that was already declared, validated and bundled, and an
            unmounted one is exactly the silent loss
            `__tests__/primitiveBodyLeaves.test.ts` exists to catch. The post is
            a 1 m cylinder centred at y 0.5, so its cap is at 1.0. */}
        <Crow position={[3, 1, -3]} rotation={-0.6} />
        <FenceSection position={[0, 0, -3]} length={6} />
        <FenceSection position={[0, 0, 3]} length={6} />
        <FenceSection position={[-3, 0, 0]} rotation={Math.PI / 2} length={6} />
        <FenceSection position={[3, 0, 0]} rotation={Math.PI / 2} length={6} />
        {/* Mud puddle. Was lifted to 0.08 to clear `TerrainGround`'s old 0.05
            default; that default is now the site's declared ground datum
            (-0.02), so 0.08 would hang this decal 10 cm in the air - visible at
            the 4 m `paddock` review camera. `groundOverlay` is the layer
            CLAUDE.md's decision tree names for a marking on exterior ground,
            and the polygonOffset below is what actually keeps it clear. */}
        <mesh
          position={[0, EXTERIOR_LAYERS.groundOverlay, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={RENDER_ORDER.floorEffects}
        >
          <primitive object={SG.mudPuddle} attach="geometry" />
          <meshStandardMaterial
            color="#5c4d3d"
            map={PROCEDURAL_TEXTURES.mudColor}
            roughnessMap={PROCEDURAL_TEXTURES.mudRoughness}
            roughness={0.9}
            transparent
            opacity={0.95}
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-2}
            polygonOffsetUnits={-2}
          />
        </mesh>
        {/* The pigs render at FarmArea level, not in this pen group, so they
            wander in farm coordinates (PIG_WANDER_BOUNDS) around the pen at
            [-12, 0, -5]. */}
      </group>
      {pigData.map((p, i) => (
        <Pig
          key={`pig-${i}`}
          position={p.pos}
          rotation={p.rot}
          groupRef={pigRefs[i]}
          tailRef={pigTailRefs[i]}
          rigRef={pigRigRefs[i]}
          onClick={() => handlePet(p.pos, 'pig', i)}
        />
      ))}

      <group position={[5, 0, 15]}>
        {[-8, -3, 2, 7].map((x) => (
          <React.Fragment key={`fence-h-${x}`}>
            <FenceSection position={[x, 0, -6]} length={5} />
            <FenceSection position={[x, 0, 6]} length={5} />
          </React.Fragment>
        ))}
        {/* Side runs, 4 m rather than 5. Two 5 m runs centred 4 m apart span
            z -6.5..-1.5 and -2.5..2.5, so they OVERLAP by a full metre - a
            doubled panel and a doubled post on both sides of the paddock,
            measured at 40% AABB intersection in the assembled scene. At 4 m
            they abut exactly at z = -2 and cover the same z -6..2 the run at
            z = -6 needs. The primitive fence hid this because it was two thin
            rails; a solid generated panel does not. */}
        <FenceSection position={[-10, 0, 0]} rotation={Math.PI / 2} length={4} />
        <FenceSection position={[-10, 0, -4]} rotation={Math.PI / 2} length={4} />
        <FenceSection position={[10, 0, 0]} rotation={Math.PI / 2} length={4} />
        <FenceSection position={[10, 0, -4]} rotation={Math.PI / 2} length={4} />
      </group>
      {cowData.map((c, i) => (
        <PaddockCow
          key={`cow-${i}`}
          position={c.pos}
          rotation={c.rot}
          groupRef={cowRefs[i]}
          headRef={cowHeadRefs[i]}
          rigRef={cowRigRefs[i]}
          onClick={() => handlePet(c.pos, 'cow', i)}
        />
      ))}

      <WindmillComp position={[15, 0, -15]} scale={1.5} bladesRef={windmillBladesRef} />
      {/* Moved off [6, 0, -2], which is the exact coordinate of the first
          HayBale below - the two interpenetrated, and a camera aimed at the
          bale returned a close-up of a sheep. The bale is the one that cannot
          move: the third bale at [6.2, 0.8, -1] is stacked on this pair and the
          cat sleeps between them. Clear of the barn (x -5..5), the coop
          ([12, 0, -5]) and the horse ([8, 0, -1]). */}
      <Sheep
        position={[9, 0, -4]}
        rotation={0.6}
        groupRef={sheepRefs[0]}
        rigRef={sheepRigRefs[0]}
        onClick={() => handlePet([9, 0, -4], 'sheep', 0)}
      />
      {/* Moved off [7, 0, 1], 1.12 m from the hay bale at [6.5, 0, 0]: measured
          in the assembled scene the two boxes overlapped by 0.74 m in x, 22% of
          the smaller body, so this sheep stood partly inside a bale. Same defect
          class as the water trough the barn swallowed - a neighbour that was
          fine against a thin primitive and is not against a solid generated one.
          [7, 0, 2.5] clears the bale by 2.55 m and the sheep at [8, 0, 5] by
          2.69 m, which still reads as a flock, and stays clear of the barn
          (x -5..5, z -5..5), the horse at [8, 0, -1] and the paddock fence run
          at z = 9. */}
      <Sheep
        position={[7, 0, 2.5]}
        rotation={-0.4}
        groupRef={sheepRefs[1]}
        rigRef={sheepRigRefs[1]}
        onClick={() => handlePet([7, 0, 2.5], 'sheep', 1)}
      />
      <Sheep
        position={[8, 0, 5]}
        rotation={1.8}
        groupRef={sheepRefs[2]}
        rigRef={sheepRigRefs[2]}
        onClick={() => handlePet([8, 0, 5], 'sheep', 2)}
      />
      <Sheep
        position={[-8, 0, 5]}
        rotation={2.5}
        groupRef={sheepRefs[3]}
        rigRef={sheepRigRefs[3]}
        onClick={() => handlePet([-8, 0, 5], 'sheep', 3)}
      />
      {/* Moved off [0, 0, -4], which the generated barn swallowed: the primitive
          barn's box is [10, 6, 8] and spans z -4..4, so the trough sat exactly
          against its rear wall, but the generated barn is 10 m DEEP and spans
          z -5..5. Measured in the assembled scene, 80% of the trough's volume
          was inside the barn's box (`placement-audit.mjs`). This is the defect
          class the swap creates - the envelope changed and the neighbour did
          not move - so any prop tucked against a replaced building is suspect.
          [-6.5, ., -2] clears the barn's x extent (-4.68..4.68) and puts the
          trough on the barnyard flank where the animals are, rather than hidden
          behind the building. It stands at y 0 like every other animal and
          prop, now that the barnyard sheet sits on the ground datum. */}
      <WaterTrough position={[-6.5, 0, -2]} />
      <HayBale position={[6, 0, -2]} rotation={0.3} />
      <HayBale position={[6.5, 0, 0]} rotation={-0.2} />
      <HayBale position={[6.2, 0.8, -1]} rotation={0.5} />
      {/* Sleeping Orange Cat between hay bales */}
      <Cat position={[6.25, 0, -1]} rotation={0.5} color="#f97316" pose="sleeping" />
      <HayBale position={[-6, 0, 3]} rotation={1.2} />
      {/* Shelter belt: two instanced draws for the whole stand */}
      <InstancedTreeField trees={FARM_TREES} />
      <InstancedMulch spots={FARM_TREE_SPOTS} y={FARM_DECAL_Y} radius={2.3} />

      {/* Ground clutter around fence lines, wall bases and trunks */}
      <InstancedGrassClutter spec={clutterSpec} />

      {/* Shared wind clock (idempotent - the village mounts one too) */}
      <WindDriver />

      {/* Drainage Culvert under the farm path */}
      <DrainageCulvert position={[0, -0.3, -30]} rotation={Math.PI / 2} length={6} radius={0.6} />

      {/* Grain Field Background */}
      <group position={[0, 0, -42]}>
        {/* Simple Grain Field - Instanced Loops */}
        <InstancedGrainField />
      </group>

      {/* Paint Horse next to hay bales */}
      <Horse
        position={[8, 0, -1]}
        rotation={-Math.PI / 2}
        color="#8d6e63"
        isPaint={true}
        rigRef={horseRigRef}
        onClick={() => handlePet([8, 0, -1], 'horse', 0)}
      />

      {/* Render Active Hearts */}
      {hearts.map((h) => (
        <HeartParticle key={h.id} position={h.pos} onComplete={() => removeHeart(h.id)} />
      ))}

      {/* Magical Nighttime Fireflies */}
      <Fireflies
        count={60}
        bounds={{ minX: -20, maxX: 20, minY: 0.5, maxY: 4, minZ: -20, maxZ: 20 }}
        color="#ccff66"
      />
    </group>
  );
};
