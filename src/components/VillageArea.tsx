import React, { useRef, useEffect } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import { useShallow } from 'zustand/react/shallow';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import Fireflies from './effects/Fireflies';
import { Cat } from './scenery/Cat';
import { Tree, OakTree, BirchTree } from './scenery/Tree';
import { HeartParticle } from './effects/HeartParticle';
import { playCritterSound } from '../utils/critterAudio';
import { audioManager } from '../utils/audioManager';
import { PROCEDURAL_TEXTURES } from '../utils/sharedMaterials';
import { InstancedLamps } from './village/InstancedVillageComponents';

// ============================================================
// CHARMING EUROPEAN VILLAGE - West of Canal
// Lego-style adorable village with colorful buildings
// Position: [-190, 0, 0] (west of canal at -145)
// Size: ~60×120 units
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

// Shared materials with procedural textures
// Use OUTDOOR_MATERIALS.grass for consistency with other grass surfaces
import { OUTDOOR_MATERIALS } from '../utils/sharedMaterials';

// Create village-specific cobble textures - UVs in geometry handle tiling
// Clone shared textures (same as farmyard), repeat (1,1) - UV divisor controls stone size
const villageCobbleColor = PROCEDURAL_TEXTURES.cobblestoneColor.clone();
const villageCobbleNormal = PROCEDURAL_TEXTURES.cobblestoneNormal.clone();
villageCobbleColor.wrapS = villageCobbleColor.wrapT = THREE.RepeatWrapping;
villageCobbleNormal.wrapS = villageCobbleNormal.wrapT = THREE.RepeatWrapping;
villageCobbleColor.repeat.set(1, 1);
villageCobbleNormal.repeat.set(1, 1);
villageCobbleColor.needsUpdate = true;
villageCobbleNormal.needsUpdate = true;

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
  cobble: new THREE.MeshStandardMaterial({
    color: '#9a9a9a', // Tint to correct washed-out texture
    roughness: 0.85,
    map: villageCobbleColor,
    normalMap: villageCobbleNormal,
    normalScale: new THREE.Vector2(0.4, 0.4),
  }),
  stone: new THREE.MeshStandardMaterial({
    color: '#a08070', // Warmer brick-like stone color
    roughness: 0.85,
    map: PROCEDURAL_TEXTURES.brickColor,
    normalMap: PROCEDURAL_TEXTURES.brickNormal,
    normalScale: new THREE.Vector2(0.3, 0.3),
  }),
  timber: new THREE.MeshStandardMaterial({
    color: COLORS.timber,
    roughness: 0.8,
    normalMap: PROCEDURAL_TEXTURES.panelNormal,
    normalScale: new THREE.Vector2(0.15, 0.15),
  }),
  roofTile: new THREE.MeshStandardMaterial({
    color: '#d4a090', // Tint for terracotta tiles
    roughness: 0.7,
    map: clayTileColor,
    normalMap: clayTileNormal,
    normalScale: new THREE.Vector2(0.4, 0.4),
  }),
  roofSlate: new THREE.MeshStandardMaterial({
    color: '#8090a0', // Tint for slate gray
    roughness: 0.5,
    map: slateColor,
    normalMap: slateNormal,
    normalScale: new THREE.Vector2(0.35, 0.35),
  }),
  thatch: new THREE.MeshStandardMaterial({
    color: '#c0a080', // Tint for golden straw
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
  shutterGreen: new THREE.MeshStandardMaterial({
    color: COLORS.green,
    roughness: 0.7,
    normalMap: PROCEDURAL_TEXTURES.panelNormal,
    normalScale: new THREE.Vector2(0.1, 0.1),
  }),
  water: new THREE.MeshStandardMaterial({ color: COLORS.water, roughness: 0.2, metalness: 0.3 }),
  white: new THREE.MeshStandardMaterial({
    color: '#e8e8e8', // Slight tint for white stucco
    roughness: 0.75,
    map: stuccoColorTex,
    normalMap: stuccoNormalTex,
    normalScale: new THREE.Vector2(0.25, 0.25),
  }),
  black: new THREE.MeshStandardMaterial({
    color: '#1a1a1a',
    roughness: 0.5,
    normalMap: PROCEDURAL_TEXTURES.brushedMetal,
    normalScale: new THREE.Vector2(0.1, 0.1),
  }),
  red: new THREE.MeshStandardMaterial({ color: '#dc2626', roughness: 0.6 }),
  gold: new THREE.MeshStandardMaterial({
    color: '#d4af37',
    roughness: 0.4,
    metalness: 0.6,
    roughnessMap: PROCEDURAL_TEXTURES.brushedMetal,
  }),
  glass: new THREE.MeshStandardMaterial({
    color: '#93c5fd',
    roughness: 0.1,
    metalness: 0.2,
    transparent: true,
    opacity: 0.7,
  }),
  smoke: new THREE.MeshBasicMaterial({ color: '#9ca3af', transparent: true, opacity: 0.4 }),
};

// ===== CHIMNEY SMOKE =====
// PERF FIX: Pre-create smoke materials at module level to avoid clone() in render
const smokeMaterials = [
  SM.smoke.clone(),
  SM.smoke.clone(),
  SM.smoke.clone(),
];

const ChimneySmoke: React.FC<{ position: [number, number, number]; offset?: number }> = ({
  position,
}) => {
  const smokeRefs = useRef<(THREE.Mesh | null)[]>([]);

  // PERF TEST: Disable animation completely
  // useFrame((state) => {
  //   // Throttle smoke animation to every 3rd frame (~20 FPS)
  //   frameCount.current++;
  //   if (frameCount.current % 3 !== 0) return;
  //
  //   const time = state.clock.elapsedTime + offset;
  //   smokeRefs.current.forEach((mesh, i) => {
  //     if (mesh) {
  //       const phase = (time * 0.5 + i * 0.3) % 2;
  //       mesh.position.y = phase * 2;
  //       mesh.scale.setScalar(0.3 + phase * 0.4);
  //       (mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.5 - phase * 0.25);
  //     }
  //   });
  // });

  return (
    <group position={position}>
      {[0, 1, 2].map((i) => (
        <mesh
          key={i}
          ref={(el) => {
            smokeRefs.current[i] = el;
          }}
        >
          <sphereGeometry args={[0.3, 8, 6]} />
          <primitive object={smokeMaterials[i]} attach="material" />
        </mesh>
      ))}
    </group>
  );
};

// ===== COTTAGE =====
const Cottage = React.memo<{
  position: [number, number, number];
  rotation?: number;
  wallColor?: keyof typeof SM;
  roofType?: 'tile' | 'thatch' | 'slate';
  hasGarden?: boolean;
  isNight?: boolean;
}>(
  ({
    position,
    rotation = 0,
    wallColor = 'cream',
    roofType = 'tile',
    hasGarden = true,
    isNight = false,
  }) => {
    const wallMat = SM[wallColor] || SM.cream;
    const roofMat =
      roofType === 'thatch' ? SM.thatch : roofType === 'slate' ? SM.roofSlate : SM.roofTile;

    return (
      <group position={position} rotation={[0, rotation, 0]}>
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
        {/* Chimney smoke */}
        <ChimneySmoke position={[1.5, 7, 0]} offset={Math.random() * 10} />
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
            <mesh>
              <boxGeometry args={[0.8, 1, 0.05]} />
              {isNight ? (
                <meshBasicMaterial color="#fbbf24" />
              ) : (
                <primitive object={SM.glass} attach="material" />
              )}
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
  }
);
Cottage.displayName = 'Cottage';

// ===== SHOP BUILDING =====
const ShopBuilding = React.memo<{
  position: [number, number, number];
  rotation?: number;
  wallColor?: keyof typeof SM;
  signText?: string;
  awningColor?: string;
  isNight?: boolean;
}>(
  ({
    position,
    rotation = 0,
    wallColor = 'yellow',
    signText = 'SHOP',
    awningColor = '#dc2626',
    isNight = false,
  }) => {
    const wallMat = SM[wallColor] || SM.yellow;

    return (
      <group position={position} rotation={[0, rotation, 0]}>
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
        <mesh position={[1.2, 1.5, 2.6]}>
          <boxGeometry args={[2.8, 2.5, 0.1]} />
          {isNight ? (
            <meshBasicMaterial color="#fbbf24" />
          ) : (
            <primitive object={SM.glass} attach="material" />
          )}
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
  }
);
ShopBuilding.displayName = 'ShopBuilding';

// ===== CHURCH =====
const ChurchBuilding = React.memo<{
  position: [number, number, number];
  rotation?: number;
  isNight?: boolean;
}>(({ position, rotation = 0, isNight = false }) => (
  <group position={position} rotation={[0, rotation, 0]}>
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
    {/* Spire - proper cone */}
    <mesh position={[0, 16, -5]} castShadow>
      <coneGeometry args={[2, 6, 8]} />
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
      {/* Main glass segments - radiating colors */}
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <mesh key={i} position={[0, 0, 0.01]} rotation={[0, 0, (i * Math.PI) / 4]}>
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
            metalness={0.1}
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
        <mesh position={[5.01, 4, z]}>
          <boxGeometry args={[0.1, 3, 1.5]} />
          {isNight ? (
            <meshStandardMaterial
              color="#fef3c7"
              emissive="#fef3c7"
              emissiveIntensity={2}
              toneMapped={false}
            />
          ) : (
            <primitive object={SM.glass} attach="material" />
          )}
        </mesh>
        <mesh position={[-5.01, 4, z]}>
          <boxGeometry args={[0.1, 3, 1.5]} />
          {isNight ? (
            <meshStandardMaterial
              color="#fef3c7"
              emissive="#fef3c7"
              emissiveIntensity={2}
              toneMapped={false}
            />
          ) : (
            <primitive object={SM.glass} attach="material" />
          )}
        </mesh>
      </React.Fragment>
    ))}
  </group>
));
ChurchBuilding.displayName = 'ChurchBuilding';

// Isolated clock component to prevent full building re-renders
const TownHallClock: React.FC<{ position: [number, number, number]; isNight: boolean }> =
  React.memo(({ position, isNight }) => {
    const gameTime = useGameSimulationStore((state) => state.gameTime);
    const lastChimeHourRef = useRef(-1);

    // Play clock chime on the hour
    useEffect(() => {
      const currentHour = Math.floor(gameTime);
      // Only chime when crossing an hour boundary
      if (currentHour !== lastChimeHourRef.current && gameTime % 1 < 0.05) {
        audioManager.playClockChime(currentHour);
        lastChimeHourRef.current = currentHour;
      }
    }, [gameTime]);

    // Clock hands: hour hand rotates once per 12 hours, minute hand once per hour
    const hourAngle = (gameTime / 12) * Math.PI * 2;
    const minuteAngle = (((gameTime % 1) * 60) / 60) * Math.PI * 2;

    return (
      <group position={position}>
        {/* Clock face */}
        <mesh position={[0, 0, 0]}>
          <circleGeometry args={[1.2, 16]} />
          <primitive object={SM.white} attach="material" />
        </mesh>
        <mesh position={[0, 0, 0.01]}>
          <circleGeometry args={[1.1, 16]} />
          {isNight ? (
            <meshStandardMaterial
              color="#ffffff"
              emissive="#ffffff"
              emissiveIntensity={1.5}
              toneMapped={false}
            />
          ) : (
            <meshStandardMaterial color="#1e293b" roughness={0.5} />
          )}
        </mesh>
        {/* Hour hand - arrow shaped */}
        <group position={[0, 0, 0.05]} rotation={[0, 0, -hourAngle + Math.PI / 2]}>
          <mesh position={[0.2, 0, 0]}>
            <boxGeometry args={[0.5, 0.1, 0.02]} />
            {isNight ? (
              <primitive object={SM.black} attach="material" />
            ) : (
              <primitive object={SM.gold} attach="material" />
            )}
          </mesh>
          <mesh position={[0.5, 0, 0]} rotation={[Math.PI / 2, 0, Math.PI / 2]}>
            <coneGeometry args={[0.12, 0.2, 4]} />
            {isNight ? (
              <primitive object={SM.black} attach="material" />
            ) : (
              <primitive object={SM.gold} attach="material" />
            )}
          </mesh>
        </group>
        {/* Minute hand - arrow shaped, longer */}
        <group position={[0, 0, 0.06]} rotation={[0, 0, -minuteAngle + Math.PI / 2]}>
          <mesh position={[0.3, 0, 0]}>
            <boxGeometry args={[0.7, 0.08, 0.02]} />
            {isNight ? (
              <primitive object={SM.black} attach="material" />
            ) : (
              <primitive object={SM.gold} attach="material" />
            )}
          </mesh>
          <mesh position={[0.7, 0, 0]} rotation={[Math.PI / 2, 0, Math.PI / 2]}>
            <coneGeometry args={[0.1, 0.18, 4]} />
            {isNight ? (
              <primitive object={SM.black} attach="material" />
            ) : (
              <primitive object={SM.gold} attach="material" />
            )}
          </mesh>
        </group>
        {/* Clock center cap */}
        <mesh position={[0, 0, 0.07]}>
          <cylinderGeometry args={[0.08, 0.08, 0.02, 8]} />
          <primitive object={SM.gold} attach="material" />
        </mesh>
      </group>
    );
  });
TownHallClock.displayName = 'TownHallClock';

// ===== TOWN HALL =====
const TownHall = React.memo<{ position: [number, number, number]; rotation?: number }>(
  ({ position, rotation = 0 }) => {
    // PERF: Use shallow equality to only re-render on day/night switch, not every tick
    const isNight = useGameSimulationStore(
      useShallow((state) => state.gameTime >= 20 || state.gameTime < 6)
    );

    return (
      <group position={position} rotation={[0, rotation, 0]}>
        {/* Main building */}
        <mesh position={[0, 3.5, 0]} castShadow receiveShadow>
          <boxGeometry args={[12, 7, 10]} />
          <primitive object={SM.cream} attach="material" />
        </mesh>

        {/* Office Windows (Added for night emissives) */}
        {/* Front Windows (flanking entrance) */}
        {[-4, 4].map((x, i) => (
          <mesh key={`win-front-${i}`} position={[x, 3.5, 5.01]}>
            <boxGeometry args={[1.5, 2.5, 0.1]} />
            {isNight ? (
              <meshStandardMaterial
                color="#fef3c7"
                emissive="#fef3c7"
                emissiveIntensity={2}
                toneMapped={false}
              />
            ) : (
              <primitive object={SM.glass} attach="material" />
            )}
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
              >
                <boxGeometry args={[1.5, 2.5, 0.1]} />
                {isNight ? (
                  <meshStandardMaterial
                    color="#fef3c7"
                    emissive="#fef3c7"
                    emissiveIntensity={2}
                    toneMapped={false}
                  />
                ) : (
                  <primitive object={SM.glass} attach="material" />
                )}
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
        {/* Tower roof - proper cone */}
        <mesh position={[0, 16, 0]} castShadow>
          <coneGeometry args={[3.6, 4, 8]} />
          <primitive object={SM.roofSlate} attach="material" />
        </mesh>

        {/* Clock Face & Hands - Isolated Component */}
        <TownHallClock position={[0, 12, 2.01]} isNight={isNight} />

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
  }
);
TownHall.displayName = 'TownHall';

// ===== PUB =====
const Pub = React.memo<{
  position: [number, number, number];
  rotation?: number;
  isNight?: boolean;
}>(({ position, rotation = 0, isNight = false }) => (
  <group position={position} rotation={[0, rotation, 0]}>
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
    {/* Chimney smoke */}
    <ChimneySmoke position={[3, 8.2, 0]} offset={5} />
    {/* Door */}
    <mesh position={[0, 1.2, 3.01]}>
      <boxGeometry args={[1.5, 2.4, 0.1]} />
      <primitive object={SM.timber} attach="material" />
    </mesh>
    {/* Windows */}
    {[-2.5, 2.5].map((x, i) => (
      <mesh key={i} position={[x, 2, 3.02]}>
        <boxGeometry args={[1.2, 1.2, 0.05]} />
        {isNight ? (
          <meshBasicMaterial color="#fbbf24" />
        ) : (
          <primitive object={SM.glass} attach="material" />
        )}
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
Pub.displayName = 'Pub';

// ===== SCHOOL =====
const School = React.memo<{
  position: [number, number, number];
  rotation?: number;
  isNight?: boolean;
}>(({ position, rotation = 0, isNight = false }) => (
  <group position={position} rotation={[0, rotation, 0]}>
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
    <mesh position={[0, 11.5, 0]} castShadow>
      <coneGeometry args={[1.4, 2, 8]} />
      <primitive object={SM.roofSlate} attach="material" />
    </mesh>
    {/* Windows - row */}
    {[-3, -1, 1, 3].map((x, i) => (
      <mesh key={i} position={[x, 3.5, 3.51]}>
        <boxGeometry args={[1.2, 2, 0.05]} />
        {isNight ? (
          <meshBasicMaterial color="#fef3c7" />
        ) : (
          <primitive object={SM.glass} attach="material" />
        )}
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
School.displayName = 'School';

// ===== WISHING WELL =====
const WishingWell = React.memo<{ position: [number, number, number] }>(({ position }) => (
  <group position={position}>
    {/* Stone base */}
    <mesh position={[0, 0.4, 0]} castShadow>
      <cylinderGeometry args={[1, 1.2, 0.8, 12]} />
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
    {/* Wooden posts */}
    {[-0.7, 0.7].map((x, i) => (
      <mesh key={i} position={[x, 1.5, 0]} castShadow>
        <boxGeometry args={[0.15, 2.2, 0.15]} />
        <primitive object={SM.timber} attach="material" />
      </mesh>
    ))}
    {/* Roof */}
    <mesh position={[0, 2.8, 0]} castShadow>
      <coneGeometry args={[1.2, 1, 8]} />
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
WishingWell.displayName = 'WishingWell';

// ===== STREET LAMP =====
const VillageLamp = React.memo<{ position: [number, number, number]; isNight?: boolean }>(
  ({ position, isNight = false }) => (
    <group position={position}>
      <mesh position={[0, 2, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.12, 4, 8]} />
        <primitive object={SM.black} attach="material" />
      </mesh>
      <mesh position={[0, 4.3, 0]}>
        <boxGeometry args={[0.5, 0.6, 0.5]} />
        <primitive object={SM.black} attach="material" />
      </mesh>
      <mesh position={[0, 4.3, 0]}>
        <boxGeometry args={[0.35, 0.45, 0.35]} />
        {isNight ? (
          <>
            <meshStandardMaterial
              color="#ffaa00"
              emissive="#ffaa00"
              emissiveIntensity={2}
              toneMapped={false}
            />
            <pointLight color="#ffaa00" intensity={1} distance={15} decay={2} castShadow={false} />
          </>
        ) : (
          <meshStandardMaterial color="#333333" roughness={0.6} />
        )}
      </mesh>
    </group>
  )
);
VillageLamp.displayName = 'VillageLamp';

// ===== DUCK COMPONENT =====
const Duck = React.memo<{
  position: [number, number, number];
  delay: number;
  onClick: (pos: [number, number, number]) => void;
}>(({ position, delay: _delay, onClick }) => {
  const groupRef = useRef<THREE.Group>(null);
  const [isExcited, setIsExcited] = React.useState(false);

  // PERF TEST: Disable animation
  // useFrame((state) => {
  //   if (!groupRef.current) return;
  //   const time = state.clock.elapsedTime;
  //
  //   // Base bobbing
  //   let yOffset = Math.sin(time * 2 + delay) * 0.02;
  //   let rotOffset = Math.sin(time * 0.5 + delay) * 0.1;
  //
  //   // Excitement override
  //   if (isExcited) {
  //     yOffset += Math.abs(Math.sin(time * 15)) * 0.1; // Rapid hop
  //     rotOffset += Math.sin(time * 20) * 0.2; // Wiggle
  //   }
  //
  //   groupRef.current.position.y = position[1] + yOffset;
  //   groupRef.current.rotation.y = rotOffset;
  // });

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
    <group ref={groupRef} position={[position[0], position[1], position[2]]} onClick={handleClick}>
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
  );
});
Duck.displayName = 'Duck';

// ===== DUCK POND =====
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

  return (
    <group position={position}>
      {/* Shore ring - raised above village cobbles (y=0.12) */}
      <mesh position={[0, 0.15, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <ringGeometry args={[5.5, 7, 24]} />
        <meshStandardMaterial
          color="#a89f91"
          roughness={0.9}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
        />
      </mesh>
      {/* Water pond - thin disc that fits nicely */}
      <mesh position={[0, 0.15, 0]}>
        <cylinderGeometry args={[5.5, 5.5, 0.08, 32]} />
        <meshStandardMaterial
          color="#3b82f6"
          roughness={0.1}
          metalness={0.6}
          polygonOffset
          polygonOffsetFactor={-4}
          polygonOffsetUnits={-4}
        />
      </mesh>
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
      {/* Lily pads - floating on water surface */}
      {[
        [-2, 0.33, 0],
        [1, 0.33, -1.5],
        [-0.5, 0.33, 2.5],
      ].map(([x, y, z], i) => (
        <mesh
          key={`lily-${i}`}
          position={[x as number, y as number, z as number]}
          rotation={[-Math.PI / 2, 0, i]}
        >
          <circleGeometry args={[0.4, 12]} />
          <meshStandardMaterial color="#22c55e" roughness={0.9} depthWrite={false} />
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
const MarketStall = React.memo<{
  position: [number, number, number];
  rotation?: number;
  color1?: string;
  color2?: string;
}>(({ position, rotation = 0, color1 = '#dc2626', color2 = '#fef3c7' }) => (
  <group position={position} rotation={[0, rotation, 0]}>
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
));
MarketStall.displayName = 'MarketStall';

// ===== POSTBOX =====
const Postbox = React.memo<{ position: [number, number, number]; rotation?: number }>(
  ({ position, rotation = 0 }) => (
    <group position={position} rotation={[0, rotation, 0]}>
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
  )
);
Postbox.displayName = 'Postbox';

// ===== FOUNTAIN =====
const Fountain = React.memo<{ position: [number, number, number] }>(({ position }) => (
  <group position={position}>
    {/* Base pool */}
    <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
      <cylinderGeometry args={[3, 3.5, 0.6, 16]} />
      <primitive object={SM.stone} attach="material" />
    </mesh>
    {/* Lower water - visible disc */}
    <mesh position={[0, 0.65, 0]}>
      <cylinderGeometry args={[2.8, 2.8, 0.1, 16]} />
      <primitive object={SM.water} attach="material" />
    </mesh>
    {/* Center column */}
    <mesh position={[0, 1.5, 0]} castShadow>
      <cylinderGeometry args={[0.3, 0.4, 2.4, 12]} />
      <primitive object={SM.stone} attach="material" />
    </mesh>
    {/* Top bowl */}
    <mesh position={[0, 2.8, 0]} castShadow>
      <cylinderGeometry args={[1, 0.8, 0.4, 12]} />
      <primitive object={SM.stone} attach="material" />
    </mesh>
    <mesh position={[0, 2.95, 0]}>
      <cylinderGeometry args={[0.8, 0.8, 0.15, 12]} />
      <primitive object={SM.water} attach="material" />
    </mesh>
    {/* Bird perched on edge */}
    <group
      position={[0.7, 3.1, 0]}
      rotation={[0, -0.5, 0]}
      onClick={(e) => {
        e.stopPropagation();
        playCritterSound('bird');
      }}
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
));
Fountain.displayName = 'Fountain';

// ===== HORSE =====
// Redesigned v3: Detailed segmented model, clearer proportions
const Horse = React.memo<{ position: [number, number, number]; rotation?: number; color?: string }>(
  ({ position, rotation = 0, color = '#8d6e63' }) => {
    const [isExcited, setIsExcited] = React.useState(false);
    const [hearts, setHearts] = React.useState<{ id: number; pos: [number, number, number] }[]>([]);
    const groupRef = React.useRef<THREE.Group>(null);

    const handlePet = (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      setIsExcited(true);
      playCritterSound('horse');
      const id = Date.now();
      setHearts((prev) => [...prev, { id, pos: [0, 2.5, 0] }]);
    };

    const removeHeart = (id: number) => {
      setHearts((prev) => prev.filter((h) => h.id !== id));
    };

    // PERF TEST: Disable animation
    // useFrame((state) => {
    //   if (groupRef.current && isExcited) {
    //     const t = state.clock.elapsedTime * 15;
    //     groupRef.current.rotation.z = Math.sin(t) * 0.05; // Shake
    //     groupRef.current.position.y = Math.abs(Math.sin(t * 0.5)) * 0.1; // Rear up slightly
    //   } else if (groupRef.current) {
    //     groupRef.current.rotation.z = 0;
    //     groupRef.current.position.y = 0;
    //   }
    // });

    React.useEffect(() => {
      if (isExcited) {
        const t = setTimeout(() => setIsExcited(false), 800);
        return () => clearTimeout(t);
      }
    }, [isExcited]);

    return (
      <group position={position} rotation={[0, rotation, 0]} scale={0.6} onClick={handlePet}>
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
const Forge = React.memo<{ position: [number, number, number]; rotation?: number }>(
  ({ position, rotation = 0 }) => (
    <group position={position} rotation={[0, rotation, 0]}>
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
      {/* Chimney smoke */}
      <ChimneySmoke position={[-2, 8.8, 0]} offset={2} />
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
      {/* Hitched Horse */}
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

// Memoized rounded ground shape with proper UVs for tiling
const villageGroundShape = createRoundedRectShape(70, 130, 12);
const villageGroundGeometry = new THREE.ShapeGeometry(villageGroundShape, 24);

// Recompute UVs - scale for texture tiling (1 tile per 25 units for large cobblestones)
const uvAttr = villageGroundGeometry.attributes.uv;
const posAttr = villageGroundGeometry.attributes.position;
const HW = 35,
  HH = 65;
const UV_SCALE = 25; // Larger = bigger stones (farmyard-like)

for (let i = 0; i < posAttr.count; i++) {
  const x = posAttr.getX(i);
  const y = posAttr.getY(i);
  uvAttr.setXY(i, (x + HW) / UV_SCALE, (y + HH) / UV_SCALE);
}
uvAttr.needsUpdate = true;

// Cobble material with edge feathering via custom shader injection
// Uses module-level villageCobbleColor and villageCobbleNormal textures
// polygonOffset with NEGATIVE values pushes toward camera, preventing z-fighting with TerrainGround
const villageCobbleMaterial = new THREE.MeshStandardMaterial({
  color: '#9a9a9a', // Tint to correct washed-out texture appearance
  map: villageCobbleColor,
  normalMap: villageCobbleNormal,
  normalScale: new THREE.Vector2(0.4, 0.4),
  roughness: 0.85,
  transparent: true,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
});

// Inject feathering into the shader based on world position
villageCobbleMaterial.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader.replace(
    '#include <common>',
    `#include <common>
    varying vec2 vLocalPos;`
  );
  shader.vertexShader = shader.vertexShader.replace(
    '#include <worldpos_vertex>',
    `#include <worldpos_vertex>
    vLocalPos = worldPosition.xz + vec2(190.0, 0.0);`
  );
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <common>',
    `#include <common>
    varying vec2 vLocalPos;`
  );
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <dithering_fragment>',
    `#include <dithering_fragment>
    vec2 q = abs(vLocalPos) - vec2(23.0, 53.0);
    float d = 12.0 - min(max(q.x, q.y), 0.0) - length(max(q, 0.0));
    float feather = clamp(d * 0.16667, 0.0, 1.0);
    gl_FragColor.a *= mix(feather, 1.0, smoothstep(15.0, 30.0, vLocalPos.x));`
  );
};

// ===== MAIN VILLAGE COMPONENT =====
export const VillageArea: React.FC = () => {
  // Selector optimization: Only re-render when night status CHANGES
  const isNight = useGameSimulationStore((state) => state.gameTime >= 20 || state.gameTime < 6);

  return (
    <group position={[-190, 0, 0]}>
      {/* Rounded cobblestone ground - positioned well above TerrainGround (y=0.05) to prevent z-fighting */}
      <mesh position={[0, 0.12, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <primitive object={villageGroundGeometry} attach="geometry" />
        <primitive object={villageCobbleMaterial} attach="material" />
      </mesh>

      {/* === CHURCH === */}
      <ChurchBuilding position={[0, 0, -40]} rotation={0} isNight={isNight} />

      {/* === TOWN HALL === */}
      <TownHall position={[0, 0, 20]} rotation={Math.PI} />

      {/* === PUB === */}
      <Pub position={[-25, 0, -15]} rotation={Math.PI / 2} isNight={isNight} />

      {/* === SCHOOL === */}
      <School position={[22, 0, 40]} rotation={-Math.PI / 2} isNight={isNight} />

      {/* === FORGE === */}
      <Forge position={[-22, 0, -55]} rotation={Math.PI / 2} />

      {/* === SHOPS === */}
      <ShopBuilding
        position={[20, 0, 5]}
        rotation={-Math.PI / 2}
        wallColor="pink"
        signText="BAKER"
        awningColor="#f472b6"
        isNight={isNight}
      />
      <ShopBuilding
        position={[20, 0, -10]}
        rotation={-Math.PI / 2}
        wallColor="terracotta"
        signText="BUTCHER"
        awningColor="#dc2626"
        isNight={isNight}
      />
      <ShopBuilding
        position={[-20, 0, 30]}
        rotation={Math.PI / 2}
        wallColor="blue"
        signText="GENERAL STORE"
        awningColor="#3b82f6"
        isNight={isNight}
      />

      {/* === COTTAGES === */}
      <Cottage
        position={[-25, 0, -35]}
        rotation={Math.PI / 2}
        wallColor="cream"
        roofType="thatch"
        isNight={isNight}
      />
      <Cottage
        position={[25, 0, -35]}
        rotation={-Math.PI / 2}
        wallColor="pink"
        roofType="slate"
        isNight={isNight}
      />
      <Cottage
        position={[25, 0, -50]}
        rotation={-Math.PI / 2}
        wallColor="blue"
        roofType="thatch"
        isNight={isNight}
      />
      <Cottage
        position={[-25, 0, 45]}
        rotation={Math.PI / 2}
        wallColor="terracotta"
        roofType="tile"
        hasGarden={false}
        isNight={isNight}
      />
      <Cottage
        position={[25, 0, 55]}
        rotation={-Math.PI / 2}
        wallColor="cream"
        roofType="slate"
        isNight={isNight}
      />

      {/* === WISHING WELL === */}
      <WishingWell position={[-10, 0, -5]} />
      {/* Observer Cat on the Well Rim */}
      <Cat position={[-10, 0.8, -4.3]} rotation={2.5} color="#1a1a1a" />

      {/* === MARKET STALLS === */}
      <MarketStall position={[-8, 0, 10]} rotation={0} color1="#dc2626" />
      <MarketStall position={[8, 0, 10]} rotation={0} color1="#3b82f6" />
      <MarketStall position={[-8, 0, 2]} rotation={0} color1="#22c55e" />
      <MarketStall position={[8, 0, 2]} rotation={0} color1="#f59e0b" />

      {/* === FOUNTAIN in market square === */}
      <Fountain position={[0, 0, 6]} />

      {/* === DUCK POND === */}
      <DuckPond position={[20, 0, 25]} />

      {/* === STREET LAMPS (Instanced for performance) === */}
      <InstancedLamps isNight={isNight} />

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
          <mesh position={[0, 0.25, -0.2]} castShadow>
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

      {/* === TREES === Using textured tree components */}
      <OakTree position={[-30, 0, -55]} scale={1.2} />
      <BirchTree position={[30, 0, -60]} scale={1.0} />
      <OakTree position={[-30, 0, 55]} scale={1.3} />
      <Tree type="oak" position={[30, 0, 65]} scale={1.1} />
      <BirchTree position={[-30, 0, 0]} scale={0.9} />
      <OakTree position={[30, 0, 20]} scale={1.2} />
      <Tree type="birch" position={[-30, 0, 25]} scale={1.0} />

      {/* Magical Nighttime Fireflies for Village */}
      <Fireflies
        count={50}
        bounds={{ minX: -40, maxX: 40, minY: 0.5, maxY: 6, minZ: -70, maxZ: 70 }}
        color="#ffeb3b"
      />
    </group>
  );
};
