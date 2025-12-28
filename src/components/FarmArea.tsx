import React, { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame, ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';

import Fireflies from './effects/Fireflies';
import { HeartParticle } from './effects/HeartParticle';
import { playCritterSound } from '../utils/critterAudio';
import { Cat } from './scenery/Cat';
import { PineTree } from './scenery/Tree';
import { DrainageCulvert } from './scenery/Tunnel';
import { PROCEDURAL_TEXTURES, OUTDOOR_MATERIALS } from '../utils/sharedMaterials';
import { FLOOR_LAYERS, EXTERIOR_LAYERS, POLYGON_OFFSET, RENDER_ORDER } from '../constants/renderLayers';

// Create farm-specific cobble textures with proper world-scale repeat
// Barnyard is 20x15 units, path is 3x14 units - tile every 10 units
const farmBarnyardCobbleColor = PROCEDURAL_TEXTURES.cobblestoneColor.clone();
const farmBarnyardCobbleNormal = PROCEDURAL_TEXTURES.cobblestoneNormal.clone();
farmBarnyardCobbleColor.wrapS = farmBarnyardCobbleColor.wrapT = THREE.RepeatWrapping;
farmBarnyardCobbleNormal.wrapS = farmBarnyardCobbleNormal.wrapT = THREE.RepeatWrapping;
farmBarnyardCobbleColor.repeat.set(2, 1.5); // 20/10, 15/10
farmBarnyardCobbleNormal.repeat.set(2, 1.5);
farmBarnyardCobbleColor.needsUpdate = true;
farmBarnyardCobbleNormal.needsUpdate = true;

const farmPathCobbleColor = PROCEDURAL_TEXTURES.cobblestoneColor.clone();
const farmPathCobbleNormal = PROCEDURAL_TEXTURES.cobblestoneNormal.clone();
farmPathCobbleColor.wrapS = farmPathCobbleColor.wrapT = THREE.RepeatWrapping;
farmPathCobbleNormal.wrapS = farmPathCobbleNormal.wrapT = THREE.RepeatWrapping;
farmPathCobbleColor.repeat.set(0.3, 1.4); // 3/10, 14/10
farmPathCobbleNormal.repeat.set(0.3, 1.4);
farmPathCobbleColor.needsUpdate = true;
farmPathCobbleNormal.needsUpdate = true;

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
  hayBale: new THREE.CylinderGeometry(0.5, 0.5, 0.8, 16),
  hayRing: new THREE.RingGeometry(0.2, 0.48, 16),
  troughBody: new THREE.BoxGeometry(1.5, 0.5, 0.6),
  troughWater: new THREE.BoxGeometry(1.3, 0.05, 0.45),
  troughLeg: new THREE.BoxGeometry(0.15, 0.2, 0.5),
  treeTrunk: new THREE.CylinderGeometry(0.4, 0.5, 4, 6),
  treeFoliage: new THREE.ConeGeometry(2.5, 6, 6),
  treeFoliageTop: new THREE.ConeGeometry(1.8, 4, 6),
  gardenFrame: new THREE.BoxGeometry(3, 0.3, 2),
  gardenSoil: new THREE.BoxGeometry(2.8, 0.15, 1.8),
  carrotTop: new THREE.ConeGeometry(0.08, 0.15, 6),
  carrotLeaf: new THREE.ConeGeometry(0.1, 0.2, 4),
  cabbage: new THREE.SphereGeometry(0.2, 8, 8),
  farmGround: new THREE.PlaneGeometry(45, 45),
  mudPuddle: new THREE.CircleGeometry(2, 16),
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
  windmillTower: new THREE.CylinderGeometry(0.8, 1.2, 6, 8),
  windmillCap: new THREE.ConeGeometry(1, 1.5, 8),
  windmillHub: new THREE.CylinderGeometry(0.2, 0.2, 0.3, 8),
  windmillBladeArm: new THREE.BoxGeometry(0.15, 3, 0.05),
  windmillBladeSail: new THREE.BoxGeometry(0.5, 2.5, 0.02),
  windmillDoor: new THREE.BoxGeometry(0.6, 1.6, 0.1),
  // Grain Field
  cornStalk: new THREE.CylinderGeometry(0.05, 0.08, 1.8, 4),
  cornLeaf: new THREE.ConeGeometry(0.1, 0.8, 3),
  // Scarecrow
  scarecrowPole: new THREE.CylinderGeometry(0.08, 0.08, 2.5, 5),
  scarecrowArm: new THREE.CylinderGeometry(0.06, 0.06, 1.8, 5),
  pumpkinHead: new THREE.SphereGeometry(0.35, 10, 10),
  strawHat: new THREE.ConeGeometry(0.6, 0.4, 8),
  crowBody: new THREE.ConeGeometry(0.1, 0.3, 4),
  crowHead: new THREE.SphereGeometry(0.08, 4, 4),
};

// Shared Materials - with procedural textures
const SM = {
  barnRed: new THREE.MeshStandardMaterial({
    color: '#8B2323',
    roughness: 0.8,
    normalMap: PROCEDURAL_TEXTURES.panelNormal,
    normalScale: new THREE.Vector2(0.15, 0.15),
  }),
  barnRoof: new THREE.MeshStandardMaterial({
    color: '#4a4a4a',
    roughness: 0.7,
    normalMap: PROCEDURAL_TEXTURES.brushedMetal,
    normalScale: new THREE.Vector2(0.2, 0.2),
  }),
  whiteTrim: new THREE.MeshStandardMaterial({ color: '#f5f5f5', roughness: 0.6 }),
  barnDoor: new THREE.MeshStandardMaterial({
    color: '#5d4037',
    roughness: 0.8,
    normalMap: PROCEDURAL_TEXTURES.panelNormal,
    normalScale: new THREE.Vector2(0.2, 0.2),
  }),
  barnWindow: new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.9 }),
  gold: new THREE.MeshStandardMaterial({
    color: '#ffd700',
    roughness: 0.3,
    metalness: 0.7,
    roughnessMap: PROCEDURAL_TEXTURES.brushedMetal,
  }),
  darkMetal: new THREE.MeshStandardMaterial({
    color: '#424242',
    roughness: 0.4,
    metalness: 0.6,
    normalMap: PROCEDURAL_TEXTURES.brushedMetal,
    normalScale: new THREE.Vector2(0.15, 0.15),
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
    normalMap: PROCEDURAL_TEXTURES.panelNormal,
    normalScale: new THREE.Vector2(0.15, 0.15),
  }),
  woodLight: new THREE.MeshStandardMaterial({
    color: '#8d6e63',
    roughness: 0.85,
    normalMap: PROCEDURAL_TEXTURES.panelNormal,
    normalScale: new THREE.Vector2(0.1, 0.1),
  }),
  woodTan: new THREE.MeshStandardMaterial({
    color: '#a1887f',
    roughness: 0.8,
    normalMap: PROCEDURAL_TEXTURES.panelNormal,
    normalScale: new THREE.Vector2(0.1, 0.1),
  }),
  grass: OUTDOOR_MATERIALS.grass, // Use shared grass material for seamless matching
  mud: new THREE.MeshStandardMaterial({
    color: '#ffffff', // Let texture provide color
    roughness: 0.9,
    map: PROCEDURAL_TEXTURES.mudColor,
    roughnessMap: PROCEDURAL_TEXTURES.mudRoughness,
  }),
  soil: new THREE.MeshStandardMaterial({ color: '#3e2723', roughness: 1 }),
  stone: new THREE.MeshStandardMaterial({
    color: '#d7ccc8',
    roughness: 0.8,
    normalMap: PROCEDURAL_TEXTURES.panelNormal,
    normalScale: new THREE.Vector2(0.2, 0.2),
  }),
  water: new THREE.MeshStandardMaterial({
    color: '#64b5f6',
    roughness: 0.2,
    metalness: 0.1,
    transparent: true,
    opacity: 0.8,
  }),
  treeTrunk: new THREE.MeshStandardMaterial({
    color: '#5d4037',
    roughness: 0.9,
    normalMap: PROCEDURAL_TEXTURES.panelNormal,
    normalScale: new THREE.Vector2(0.15, 0.15),
  }),
  treeLeafDark: new THREE.MeshStandardMaterial({ color: '#2e7d32', roughness: 0.8 }),
  treeLeafLight: new THREE.MeshStandardMaterial({ color: '#388e3c', roughness: 0.8 }),
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
    normalMap: PROCEDURAL_TEXTURES.panelNormal,
    normalScale: new THREE.Vector2(0.05, 0.05),
  }),
  roofBrown: new THREE.MeshStandardMaterial({
    color: '#8B4513',
    roughness: 0.8,
    normalMap: PROCEDURAL_TEXTURES.panelNormal,
    normalScale: new THREE.Vector2(0.15, 0.15),
  }),
  chimneyRed: new THREE.MeshStandardMaterial({ color: '#8B0000', roughness: 0.8 }),
  windowBlue: new THREE.MeshStandardMaterial({ color: '#87ceeb', roughness: 0.2, metalness: 0.1 }),
  shutterGreen: new THREE.MeshStandardMaterial({ color: '#2e7d32', roughness: 0.7 }),
  coopBrown: new THREE.MeshStandardMaterial({
    color: '#8B4513',
    roughness: 0.85,
    normalMap: PROCEDURAL_TEXTURES.panelNormal,
    normalScale: new THREE.Vector2(0.15, 0.15),
  }),
  coopDark: new THREE.MeshStandardMaterial({ color: '#6d4c41', roughness: 0.85 }),
  coopRoof: new THREE.MeshStandardMaterial({ color: '#2e7d32', roughness: 0.7 }),
  windmillSail: new THREE.MeshStandardMaterial({
    color: '#f5f5f5',
    roughness: 0.7,
    side: THREE.DoubleSide,
  }),
  // Grain Field & Scarecrow
  cornGreen: new THREE.MeshStandardMaterial({
    color: '#8bc34a',
    roughness: 0.9,
    side: THREE.DoubleSide,
  }),
  pumpkinOrange: new THREE.MeshStandardMaterial({ color: '#ff6f00', roughness: 0.8 }),
  strawHat: new THREE.MeshStandardMaterial({ color: '#e6c229', roughness: 1 }),
  denimBlue: new THREE.MeshStandardMaterial({ color: '#1565c0', roughness: 0.9 }),
  plaidRed: new THREE.MeshStandardMaterial({ color: '#b71c1c', roughness: 0.9 }),
  crowBlack: new THREE.MeshStandardMaterial({ color: '#212121', roughness: 0.6 }),
};

// Static components with React.memo
const Barn = React.memo<{ position: [number, number, number] }>(({ position }) => (
  <group position={position}>
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
    <mesh position={[0, 5, 4.05]}>
      <circleGeometry args={[0.8, 16]} />
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
Barn.displayName = 'Barn';

const ChickenCoop = React.memo<{ position: [number, number, number] }>(({ position }) => (
  <group position={position}>
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
ChickenCoop.displayName = 'ChickenCoop';

const FenceSection = React.memo<{
  position: [number, number, number];
  rotation?: number;
  length?: number;
}>(({ position, rotation = 0, length = 4 }) => {
  const railGeom = useMemo(() => new THREE.BoxGeometry(length, 0.08, 0.06), [length]);
  return (
    <group position={position} rotation={[0, rotation, 0]}>
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
FenceSection.displayName = 'FenceSection';

const HayBale = React.memo<{ position: [number, number, number]; rotation?: number }>(
  ({ position, rotation = 0 }) => (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.4, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <primitive object={SG.hayBale} attach="geometry" />
        <primitive object={SM.hay} attach="material" />
      </mesh>
      <mesh position={[0, 0.4, 0.41]}>
        <primitive object={SG.hayRing} attach="geometry" />
        <primitive object={SM.hayDark} attach="material" />
      </mesh>
    </group>
  )
);
HayBale.displayName = 'HayBale';

const WaterTrough = React.memo<{ position: [number, number, number]; rotation?: number }>(
  ({ position, rotation = 0 }) => (
    <group position={position} rotation={[0, rotation, 0]}>
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
  )
);
WaterTrough.displayName = 'WaterTrough';

const GardenBed = React.memo<{ position: [number, number, number] }>(({ position }) => (
  <group position={position}>
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
GardenBed.displayName = 'GardenBed';

const Farmhouse = React.memo<{ position: [number, number, number] }>(({ position }) => (
  <group position={position}>
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
Farmhouse.displayName = 'Farmhouse';

// FarmTree - Uses imported PineTree with textured bark
const FarmTree = React.memo<{ position: [number, number, number] }>(({ position }) => (
  <PineTree position={position} scale={1.2} />
));
FarmTree.displayName = 'FarmTree';

const Sheep = React.memo<{
  position: [number, number, number];
  rotation?: number;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
  groupRef?: React.RefObject<THREE.Group | null>;
}>(({ position, rotation = 0, onClick, groupRef }) => (
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
  >
    <mesh position={[0, 0.5, 0]} castShadow>
      <primitive object={SG.sheepBody} attach="geometry" />
      <primitive object={SM.sheepWool} attach="material" />
    </mesh>
    {[
      [0.2, 0.7, 0.2],
      [-0.2, 0.75, 0.15],
      [0, 0.8, -0.2],
      [0.15, 0.65, -0.25],
    ].map((pos, i) => (
      <mesh key={i} position={pos as [number, number, number]} castShadow>
        <primitive object={SG.sheepFluff} attach="geometry" />
        <primitive object={SM.sheepWool} attach="material" />
      </mesh>
    ))}
    <mesh position={[0.4, 0.55, 0]} castShadow>
      <primitive object={SG.sheepHead} attach="geometry" />
      <primitive object={SM.sheepFace} attach="material" />
    </mesh>
    <mesh position={[0.35, 0.65, 0.15]} rotation={[0, 0.5, 0.5]} castShadow>
      <primitive object={SG.sheepEar} attach="geometry" />
      <primitive object={SM.sheepFace} attach="material" />
    </mesh>
    <mesh position={[0.35, 0.65, -0.15]} rotation={[0, -0.5, -0.5]} castShadow>
      <primitive object={SG.sheepEar} attach="geometry" />
      <primitive object={SM.sheepFace} attach="material" />
    </mesh>
    <mesh position={[0.52, 0.6, 0.08]}>
      <primitive object={SG.sheepEye} attach="geometry" />
      <primitive object={SM.sheepEye} attach="material" />
    </mesh>
    <mesh position={[0.52, 0.6, -0.08]}>
      <primitive object={SG.sheepEye} attach="geometry" />
      <primitive object={SM.sheepEye} attach="material" />
    </mesh>
    {[
      [0.2, 0.12, 0.18],
      [0.2, 0.12, -0.18],
      [-0.2, 0.12, 0.18],
      [-0.2, 0.12, -0.18],
    ].map((pos, i) => (
      <mesh key={i} position={pos as [number, number, number]} castShadow>
        <primitive object={SG.sheepLeg} attach="geometry" />
        <primitive object={SM.sheepFace} attach="material" />
      </mesh>
    ))}
  </group>
));
Sheep.displayName = 'Sheep';

// Animated components with refs for centralized animation
// Movement interface
interface AnimalState {
  target: THREE.Vector3;
  isIdle: boolean;
  idleTime: number;
}

const Chicken: React.FC<{
  position: [number, number, number];
  rotation?: number;
  groupRef: React.RefObject<THREE.Group | null>;
  animRef: React.RefObject<THREE.Group | null>;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
}> = ({ position, rotation = 0, groupRef, animRef, onClick }) => (
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
  >
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
    <mesh position={[0.05, 0.08, 0.05]} castShadow>
      <primitive object={SG.chickenLeg} attach="geometry" />
      <primitive object={SM.chickenBeak} attach="material" />
    </mesh>
    <mesh position={[0.05, 0.08, -0.05]} castShadow>
      <primitive object={SG.chickenLeg} attach="geometry" />
      <primitive object={SM.chickenBeak} attach="material" />
    </mesh>
  </group>
);

const Pig: React.FC<{
  position: [number, number, number];
  rotation?: number;
  groupRef: React.RefObject<THREE.Group | null>;
  tailRef: React.RefObject<THREE.Mesh | null>;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
}> = ({ position, rotation = 0, groupRef, tailRef, onClick }) => (
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
  >
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
    <mesh position={[0.61, 0.37, 0.04]}>
      <primitive object={SG.pigNostril} attach="geometry" />
      <primitive object={SM.pigNostril} attach="material" />
    </mesh>
    <mesh position={[0.61, 0.37, -0.04]}>
      <primitive object={SG.pigNostril} attach="geometry" />
      <primitive object={SM.pigNostril} attach="material" />
    </mesh>
    <mesh position={[0.25, 0.6, 0.15]} rotation={[0.5, 0.3, 0]} castShadow>
      <primitive object={SG.pigEar} attach="geometry" />
      <primitive object={SM.pigPink} attach="material" />
    </mesh>
    <mesh position={[0.25, 0.6, -0.15]} rotation={[0.5, -0.3, 0]} castShadow>
      <primitive object={SG.pigEar} attach="geometry" />
      <primitive object={SM.pigPink} attach="material" />
    </mesh>
    <mesh position={[0.5, 0.48, 0.12]}>
      <primitive object={SG.pigEye} attach="geometry" />
      <primitive object={SM.black} attach="material" />
    </mesh>
    <mesh position={[0.5, 0.48, -0.12]}>
      <primitive object={SG.pigEye} attach="geometry" />
      <primitive object={SM.black} attach="material" />
    </mesh>
    {[
      [0.15, 0.1, 0.2],
      [0.15, 0.1, -0.2],
      [-0.15, 0.1, 0.2],
      [-0.15, 0.1, -0.2],
    ].map((pos, i) => (
      <mesh key={i} position={pos as [number, number, number]} castShadow>
        <primitive object={SG.pigLeg} attach="geometry" />
        <primitive object={SM.pigPink} attach="material" />
      </mesh>
    ))}
    <mesh ref={tailRef} position={[-0.4, 0.45, 0]} rotation={[0, 0, 0.5]} castShadow>
      <primitive object={SG.pigTail} attach="geometry" />
      <primitive object={SM.pigPink} attach="material" />
    </mesh>
  </group>
);

const Cow: React.FC<{
  position: [number, number, number];
  rotation?: number;
  groupRef: React.RefObject<THREE.Group | null>;
  headRef: React.RefObject<THREE.Group | null>;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
}> = ({ position, rotation = 0, groupRef, headRef, onClick }) => (
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
  >
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
      <mesh position={[0.88, 0.62, 0.05]}>
        <primitive object={SG.cowNostril} attach="geometry" />
        <primitive object={SM.cowNostril} attach="material" />
      </mesh>
      <mesh position={[0.88, 0.62, -0.05]}>
        <primitive object={SG.cowNostril} attach="geometry" />
        <primitive object={SM.cowNostril} attach="material" />
      </mesh>
      <mesh position={[0.7, 0.78, 0.12]}>
        <primitive object={SG.cowEye} attach="geometry" />
        <primitive object={SM.black} attach="material" />
      </mesh>
      <mesh position={[0.7, 0.78, -0.12]}>
        <primitive object={SG.cowEye} attach="geometry" />
        <primitive object={SM.black} attach="material" />
      </mesh>
      <mesh position={[0.5, 0.82, 0.18]} rotation={[0, 0.5, 0.3]} castShadow>
        <primitive object={SG.cowEar} attach="geometry" />
        <primitive object={SM.cowWhite} attach="material" />
      </mesh>
      <mesh position={[0.5, 0.82, -0.18]} rotation={[0, -0.5, -0.3]} castShadow>
        <primitive object={SG.cowEar} attach="geometry" />
        <primitive object={SM.cowWhite} attach="material" />
      </mesh>
      <mesh position={[0.45, 0.92, 0.1]} rotation={[0, 0, 0.3]} castShadow>
        <primitive object={SG.cowHorn} attach="geometry" />
        <primitive object={SM.cowHorn} attach="material" />
      </mesh>
      <mesh position={[0.45, 0.92, -0.1]} rotation={[0, 0, -0.3]} castShadow>
        <primitive object={SG.cowHorn} attach="geometry" />
        <primitive object={SM.cowHorn} attach="material" />
      </mesh>
    </group>
    {[
      [0.3, 0.2, 0.25],
      [0.3, 0.2, -0.25],
      [-0.35, 0.2, 0.25],
      [-0.35, 0.2, -0.25],
    ].map((pos, i) => (
      <mesh key={i} position={pos as [number, number, number]} castShadow>
        <primitive object={SG.cowLeg} attach="geometry" />
        <primitive object={SM.cowWhite} attach="material" />
      </mesh>
    ))}
    <mesh position={[-0.15, 0.25, 0]} castShadow>
      <primitive object={SG.cowUdder} attach="geometry" />
      <primitive object={SM.cowMuzzle} attach="material" />
    </mesh>
    <mesh position={[-0.65, 0.7, 0]} rotation={[0, 0, 0.8]} castShadow>
      <primitive object={SG.cowTail} attach="geometry" />
      <primitive object={SM.cowWhite} attach="material" />
    </mesh>
    <mesh position={[-0.85, 0.45, 0]} castShadow>
      <primitive object={SG.cowTailTuft} attach="geometry" />
      <primitive object={SM.cowBlack} attach="material" />
    </mesh>
  </group>
);

const WindmillComp: React.FC<{
  position: [number, number, number];
  scale?: number;
  bladesRef: React.RefObject<THREE.Group | null>;
}> = ({ position, scale = 1, bladesRef }) => (
  <group position={position} scale={scale}>
    <mesh position={[0, 3, 0]} castShadow>
      <primitive object={SG.windmillTower} attach="geometry" />
      <primitive object={SM.stone} attach="material" />
    </mesh>
    <mesh position={[0, 6.5, 0]} castShadow>
      <primitive object={SG.windmillCap} attach="geometry" />
      <primitive object={SM.woodBrown} attach="material" />
    </mesh>
    <mesh position={[0, 5.5, 0.9]} castShadow>
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
    <mesh position={[0, 0.9, 1.15]}>
      <primitive object={SG.windmillDoor} attach="geometry" />
      <primitive object={SM.woodBrown} attach="material" />
    </mesh>
  </group>
);

// ===== HORSE (Adapted from VillageArea) =====
const Horse = React.memo<{
  position: [number, number, number];
  rotation?: number;
  color?: string;
  isPaint?: boolean;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
}>(({ position, rotation = 0, color = '#8d6e63', isPaint = false, onClick }) => (
  <group
    position={position}
    rotation={[0, rotation, 0]}
    scale={0.6}
    onClick={(e) => {
      if (onClick) {
        e.stopPropagation();
        onClick(e);
      }
    }}
  >
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
      </mesh>{' '}
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
      </mesh>{' '}
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
        <meshStandardMaterial color={isPaint ? '#f5f5f5' : '#3e2723'} />{' '}
        {/* White tail tip option or mixed */}
      </mesh>
    </group>
  </group>
));
Horse.displayName = 'Horse';

const Crow = React.memo<{ position: [number, number, number]; rotation?: number }>(
  ({ position, rotation = 0 }) => {
    const [isExcited, setIsExcited] = useState(false);
    const [hearts, setHearts] = useState<{ id: number; pos: [number, number, number] }[]>([]);

    const handlePet = (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      setIsExcited(true);
      playCritterSound('crow');
      const id = Date.now();
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
      <group position={position} rotation={[0, rotation, 0]} scale={0.6} onClick={handlePet}>
        <group rotation={[isExcited ? 0.5 : 0, 0, 0]} position={[0, isExcited ? 0.2 : 0, 0]}>
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
        {hearts.map((h) => (
          <HeartParticle key={h.id} position={h.pos} onComplete={() => removeHeart(h.id)} />
        ))}
      </group>
    );
  }
);
Crow.displayName = 'Crow';

const Scarecrow = React.memo<{ position: [number, number, number]; rotation?: number }>(
  ({ position, rotation = 0 }) => (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Pole */}
      <mesh position={[0, 1.25, 0]} castShadow>
        <primitive object={SG.scarecrowPole} attach="geometry" />
        <primitive object={SM.woodBrown} attach="material" />
      </mesh>
      {/* Arms */}
      <mesh position={[0, 1.8, 0]} rotation={[0, 0, 1.57]} castShadow>
        <primitive object={SG.scarecrowArm} attach="geometry" />
        <primitive object={SM.woodBrown} attach="material" />
      </mesh>
      {/* Shirt */}
      <mesh position={[0, 1.8, 0]} castShadow>
        <boxGeometry args={[0.55, 0.9, 0.3]} />
        <primitive object={SM.plaidRed} attach="material" />
      </mesh>
      {/* Straw hands */}
      <mesh position={[0.9, 1.8, 0]}>
        <sphereGeometry args={[0.15, 8, 8]} />
        <primitive object={SM.hay} attach="material" />
      </mesh>
      <mesh position={[-0.9, 1.8, 0]}>
        <sphereGeometry args={[0.15, 8, 8]} />
        <primitive object={SM.hay} attach="material" />
      </mesh>
      {/* Jeans */}
      <group position={[0, 1.0, 0]}>
        <mesh position={[-0.15, 0, 0]}>
          <boxGeometry args={[0.18, 0.9, 0.22]} />
          <primitive object={SM.denimBlue} attach="material" />
        </mesh>
        <mesh position={[0.15, 0, 0]}>
          <boxGeometry args={[0.18, 0.9, 0.22]} />
          <primitive object={SM.denimBlue} attach="material" />
        </mesh>
      </group>
      {/* Scarf */}
      <mesh position={[0, 2.25, 0]} rotation={[0.2, 0, 0]}>
        <torusGeometry args={[0.2, 0.08, 8, 16]} />
        <meshStandardMaterial color="#d32f2f" />
      </mesh>
      {/* Head */}
      <mesh position={[0, 2.5, 0]} castShadow>
        <primitive object={SG.pumpkinHead} attach="geometry" />
        <primitive object={SM.pumpkinOrange} attach="material" />
      </mesh>
      {/* Eyes/Mouth */}
      <mesh position={[0.12, 2.55, 0.28]} rotation={[0.2, 0.2, 0]}>
        <coneGeometry args={[0.06, 0.05, 3]} />
        <meshStandardMaterial color="#3e2723" />
      </mesh>
      <mesh position={[-0.12, 2.55, 0.28]} rotation={[0.2, -0.2, 0]}>
        <coneGeometry args={[0.06, 0.05, 3]} />
        <meshStandardMaterial color="#3e2723" />
      </mesh>
      <mesh position={[0, 2.45, 0.3]} rotation={[0, 0, 0]}>
        <torusGeometry args={[0.08, 0.02, 3, 8, 3]} /> {/* Smile */}
        <meshStandardMaterial color="#3e2723" />
      </mesh>
      {/* Hat */}
      <mesh position={[0, 2.85, 0]} castShadow>
        <primitive object={SG.strawHat} attach="geometry" />
        <primitive object={SM.strawHat} attach="material" />
      </mesh>
      {/* Crow on Hat */}
      <Crow position={[0.2, 3.05, 0]} rotation={0.5} />
    </group>
  )
);
Scarecrow.displayName = 'Scarecrow';

const InstancedGrainField = React.memo(() => {
  const stalksRef = useRef<THREE.InstancedMesh>(null);
  const leaves1Ref = useRef<THREE.InstancedMesh>(null);
  const leaves2Ref = useRef<THREE.InstancedMesh>(null);
  const count = 15 * 20;

  useEffect(() => {
    if (!stalksRef.current || !leaves1Ref.current || !leaves2Ref.current) return;

    // Temp objects for matrix calculations
    const parent = new THREE.Object3D();
    const leaf = new THREE.Object3D();
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

        idx++;
      }
    }

    stalksRef.current.instanceMatrix.needsUpdate = true;
    leaves1Ref.current.instanceMatrix.needsUpdate = true;
    leaves2Ref.current.instanceMatrix.needsUpdate = true;
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

// Main component with single useFrame for all animations

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
    Array.from({ length: 5 }, () => ({
      target: new THREE.Vector3(12 + (Math.random() - 0.5) * 8, 0, -5 + (Math.random() - 0.5) * 8),
      isIdle: false,
      idleTime: 0,
    }))
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
  const pigStates = useRef<AnimalState[]>(
    Array.from({ length: 3 }, () => ({
      target: new THREE.Vector3(-12 + (Math.random() - 0.5) * 4, 0, -5 + (Math.random() - 0.5) * 4),
      isIdle: false,
      idleTime: 0,
    }))
  );

  // --- Cow Refs & State ---
  const cowRefs = useMemo(
    () => Array.from({ length: 3 }, () => React.createRef<THREE.Group>()),
    []
  );
  const cowHeadRefs = useMemo(
    () => Array.from({ length: 3 }, () => React.createRef<THREE.Group>()),
    []
  );
  const cowStates = useRef<AnimalState[]>(
    Array.from({ length: 3 }, () => ({
      target: new THREE.Vector3(5 + (Math.random() - 0.5) * 15, 0, 15 + (Math.random() - 0.5) * 8),
      isIdle: false,
      idleTime: 0,
    }))
  );

  const sheepRefs = useMemo(
    () => Array.from({ length: 4 }, () => React.createRef<THREE.Group>()),
    []
  );

  const windmillBladesRef = useRef<THREE.Group>(null);
  const frameCountRef = useRef(0);

  // Petting interaction state
  const [hearts, setHearts] = React.useState<
    { id: number; pos: [number, number, number]; startTime: number }[]
  >([]);
  const nextHeartId = useRef(0);

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

      // Debug log to confirm click
      console.log(`[FarmArea] Petting ${type} at index ${index}`);
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
        // Pick new target within bounds
        state.target.set(
          bounds.minX + Math.random() * (bounds.maxX - bounds.minX),
          yOffset,
          bounds.minZ + Math.random() * (bounds.maxZ - bounds.minZ)
        );
      }
    } else {
      // Move towards target
      const currentPos = ref.position;
      const direction = new THREE.Vector3().subVectors(state.target, currentPos);
      const dist = direction.length();

      if (dist < 0.1) {
        state.isIdle = true;
        state.idleTime = 2 + Math.random() * 4; // Idle for 2-6 seconds
      } else {
        direction.normalize();

        // Smooth rotation
        const targetRotation = Math.atan2(direction.x, direction.z);
        ref.rotation.y = THREE.MathUtils.lerp(ref.rotation.y, targetRotation, delta * 5);

        // Move
        currentPos.add(direction.multiplyScalar(speed * delta));
      }
    }
  };

  // SINGLE useFrame - THROTTLED/BATCHED
  useFrame((state, delta) => {
    frameCountRef.current++;
    const time = state.clock.elapsedTime;

    // Windmill: every 2nd frame (30 FPS)
    if (frameCountRef.current % 2 === 0 && windmillBladesRef.current) {
      windmillBladesRef.current.rotation.z = time * 0.5;
    }

    // Animals: every 2nd frame for smooth movement (30 FPS)
    // We update movement slightly more often than the body animations (pecking/wagging)
    if (frameCountRef.current % 2 === 0) {
      const adjustDelta = delta * 2; // Compensate for skipping frames

      // Chickens
      chickenRefs.forEach((ref, i) => {
        updateAnimalMovement(
          ref.current,
          chickenStates.current[i],
          adjustDelta,
          1.5, // Speed
          { minX: 9, maxX: 15, minZ: -8, maxZ: -2 } // Bounds (tighter, near coop)
        );
      });

      // Pigs
      pigRefs.forEach((ref, i) => {
        updateAnimalMovement(
          ref.current,
          pigStates.current[i],
          adjustDelta,
          0.8, // Speed
          { minX: -14, maxX: -10, minZ: -7, maxZ: -3 } // Bounds
        );
      });

      // Cows
      cowRefs.forEach((ref, i) => {
        updateAnimalMovement(
          ref.current,
          cowStates.current[i],
          adjustDelta,
          0.5, // Speed
          { minX: -5, maxX: 15, minZ: 10, maxZ: 20 } // Bounds
        );
      });
    }

    // Jump/Wiggle Animations for Petting (Every 2nd frame)
    if (frameCountRef.current % 2 === 0) {
      chickenJumpStates.current.forEach((val, i) => {
        if (val > 0 && chickenRefs[i].current) {
          chickenRefs[i].current.position.y = Math.sin(val * Math.PI) * 0.5;
          chickenJumpStates.current[i] = Math.max(0, val - delta * 3);
          if (chickenJumpStates.current[i] === 0) chickenRefs[i].current.position.y = 0;
        }
      });

      pigJumpStates.current.forEach((val, i) => {
        if (val > 0 && pigRefs[i].current) {
          // Pigs wiggle
          pigRefs[i].current.rotation.z = Math.sin(val * 20) * 0.1;
          pigJumpStates.current[i] = Math.max(0, val - delta * 2);
          if (pigJumpStates.current[i] === 0) pigRefs[i].current.rotation.z = 0;
        }
      });

      // Cows just shake head vigorously?
      cowJumpStates.current.forEach((val, i) => {
        if (val > 0 && cowHeadRefs[i].current) {
          cowHeadRefs[i].current.rotation.z = Math.sin(val * 15) * 0.2;
          cowJumpStates.current[i] = Math.max(0, val - delta * 2);
          if (cowJumpStates.current[i] === 0) cowHeadRefs[i].current.rotation.z = 0;
        }
      });

      // Sheep Jump
      sheepJumpStates.current.forEach((val, i) => {
        if (val > 0 && sheepRefs[i].current) {
          sheepRefs[i].current.position.y = Math.sin(val * Math.PI) * 0.5;
          sheepJumpStates.current[i] = Math.max(0, val - delta * 3);
          if (sheepJumpStates.current[i] === 0) sheepRefs[i].current.position.y = 0;
        }
      });
    }

    // Body animations (Pecking, Wagging, Grazing)
    // Throttle to every 4th frame (15 FPS)
    if (frameCountRef.current % 4 !== 0) return;

    chickenAnimRefs.forEach((ref, i) => {
      // Pecking motion only when idle
      if (ref.current && chickenStates.current[i].isIdle) {
        ref.current.rotation.x = Math.sin(time * 10 + chickenOffsets[i]) * 0.2 + 0.2;
      } else if (ref.current) {
        // Reset when moving
        ref.current.rotation.x = THREE.MathUtils.lerp(ref.current.rotation.x, 0, 0.1);
      }
    });

    pigTailRefs.forEach((ref, i) => {
      if (ref.current) ref.current.rotation.z = Math.sin(time * 5 + pigOffsets[i]) * 0.3;
    });

    cowHeadRefs.forEach((ref, i) => {
      // Grazing motion only when idle
      if (ref.current && cowStates.current[i].isIdle) {
        ref.current.rotation.x = Math.sin(time * 0.5 + cowOffsets[i]) * 0.15 + 0.3; // Head down
      } else if (ref.current) {
        ref.current.rotation.x = THREE.MathUtils.lerp(ref.current.rotation.x, 0, 0.1); // Head up
      }
    });
  });

  const chickenData = useMemo(
    () => [
      { pos: [13, 0, -3] as [number, number, number], rot: 0.5 },
      { pos: [14, 0, -4] as [number, number, number], rot: -0.3 },
      { pos: [11, 0, -2.5] as [number, number, number], rot: 1.2 },
      { pos: [13.5, 0, -6] as [number, number, number], rot: 2.1 },
      { pos: [10.5, 0, -4.5] as [number, number, number], rot: -1.5 },
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

  return (
    <group position={[75, 0, 120]} rotation={[0, Math.PI, 0]}>
      {/* Farm grass ground - exteriorBase */}
      <mesh position={[0, EXTERIOR_LAYERS.ground, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <primitive object={SG.farmGround} attach="geometry" />
        <primitive object={SM.grass} attach="material" />
      </mesh>
      {/* Cobblestone courtyard in front of barn - exteriorMid (on top of grass) */}
      <mesh
        position={[0, EXTERIOR_LAYERS.ground, -10]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[20, 15]} />
        <meshStandardMaterial
          map={farmBarnyardCobbleColor}
          normalMap={farmBarnyardCobbleNormal}
          roughness={0.85}
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET.exteriorMid.factor}
          polygonOffsetUnits={POLYGON_OFFSET.exteriorMid.units}
        />
      </mesh>
      {/* Cobblestone path to farmhouse - exteriorTop (on top of courtyard) */}
      <mesh
        position={[-10, EXTERIOR_LAYERS.ground, 5]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[3, 14]} />
        <meshStandardMaterial
          map={farmPathCobbleColor}
          normalMap={farmPathCobbleNormal}
          roughness={0.85}
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET.exteriorTop.factor}
          polygonOffsetUnits={POLYGON_OFFSET.exteriorTop.units}
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
          onClick={() => handlePet(c.pos, 'chicken', i)}
        />
      ))}
      <group position={[-12, 0, -5]}>
        <FenceSection position={[0, 0, -3]} length={6} />
        <FenceSection position={[0, 0, 3]} length={6} />
        <FenceSection position={[-3, 0, 0]} rotation={Math.PI / 2} length={6} />
        <FenceSection position={[3, 0, 0]} rotation={Math.PI / 2} length={6} />
        <mesh
          position={[0, EXTERIOR_LAYERS.ground, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={RENDER_ORDER.floorEffects}
        >
          <primitive object={SG.mudPuddle} attach="geometry" />
          <primitive object={SM.mud} attach="material" />
        </mesh>
        {/** Pigs are now positioned at top level relative to FarmArea, not inside this group, 
             so that they can move freely within the fence bounds defined in world/farm space.
             Wait, if I move them out of this group, I need to adjust their initial coordinates 
             and bounds to be relative to the FarmArea origin. 
             Result: I will render them at the FarmArea level but use coordinates that place them here.
             The fence is at [-12, 0, -5].
        */}
      </group>
      {pigData.map((p, i) => (
        <Pig
          key={`pig-${i}`}
          position={p.pos}
          rotation={p.rot}
          groupRef={pigRefs[i]}
          tailRef={pigTailRefs[i]}
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
        <FenceSection position={[-10, 0, 0]} rotation={Math.PI / 2} length={5} />
        <FenceSection position={[-10, 0, -4]} rotation={Math.PI / 2} length={5} />
        <FenceSection position={[10, 0, 0]} rotation={Math.PI / 2} length={5} />
        <FenceSection position={[10, 0, -4]} rotation={Math.PI / 2} length={5} />
      </group>
      {cowData.map((c, i) => (
        <Cow
          key={`cow-${i}`}
          position={c.pos}
          rotation={c.rot}
          groupRef={cowRefs[i]}
          headRef={cowHeadRefs[i]}
          onClick={() => handlePet(c.pos, 'cow', i)}
        />
      ))}

      <WindmillComp position={[15, 0, -15]} scale={1.5} bladesRef={windmillBladesRef} />
      <Sheep
        position={[6, 0, -2]}
        rotation={0.6}
        groupRef={sheepRefs[0]}
        onClick={() => handlePet([6, 0, -2], 'sheep', 0)}
      />
      <Sheep
        position={[7, 0, 1]}
        rotation={-0.4}
        groupRef={sheepRefs[1]}
        onClick={() => handlePet([7, 0, 1], 'sheep', 1)}
      />
      <Sheep
        position={[8, 0, 5]}
        rotation={1.8}
        groupRef={sheepRefs[2]}
        onClick={() => handlePet([8, 0, 5], 'sheep', 2)}
      />
      <Sheep
        position={[-8, 0, 5]}
        rotation={2.5}
        groupRef={sheepRefs[3]}
        onClick={() => handlePet([-8, 0, 5], 'sheep', 3)}
      />
      <WaterTrough position={[0, 0, -4]} />
      <HayBale position={[6, 0, -2]} rotation={0.3} />
      <HayBale position={[6.5, 0, 0]} rotation={-0.2} />
      <HayBale position={[6.2, 0.8, -1]} rotation={0.5} />
      {/* Sleeping Orange Cat between hay bales */}
      <Cat position={[6.25, 0, -1]} rotation={0.5} color="#f97316" pose="sleeping" />
      <HayBale position={[-6, 0, 3]} rotation={1.2} />
      <FarmTree position={[-32, 0, -20]} />
      <FarmTree position={[28, 0, -12]} />
      <FarmTree position={[-35, 0, 25]} />
      <FarmTree position={[32, 0, 22]} />
      <FarmTree position={[-28, 0, -25]} />

      {/* Drainage Culvert under the farm path */}
      <DrainageCulvert position={[0, -0.3, -30]} rotation={Math.PI / 2} length={6} radius={0.6} />

      {/* Grain Field Background */}
      <group position={[0, 0, -42]}>
        {/* Simple Grain Field - Instanced Loops */}
        {/* Simple Grain Field - Instanced Loops */}
        <InstancedGrainField />

        {/* Cute Scarecrow in the middle */}
        <Scarecrow position={[0, 0, 0]} rotation={0.2} />
      </group>

      {/* Paint Horse next to hay bales */}
      <Horse
        position={[8, 0, -1]}
        rotation={-Math.PI / 2}
        color="#8d6e63"
        isPaint={true}
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
