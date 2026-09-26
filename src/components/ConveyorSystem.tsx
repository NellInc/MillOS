import { CONVEYOR_LAYOUT } from '../constants/siteLayout';
import { GeneratedBoundary } from './models/GeneratedModel';
import { GeneratedBoxSurface, GeneratedGeometrySurface } from './models/GeneratedGeometrySurface';
import React, { useRef, useMemo, useEffect, useLayoutEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useShallow } from 'zustand/react/shallow';
import { audioManager } from '../utils/audioManager';
import { useAudioInitialized } from '../hooks/useAudioState';
import { useGraphicsStore } from '../stores/graphicsStore';
// Note: Production counting moved to App.tsx interval-based system (scales with gameSpeed)
// Conveyor animation is now purely visual - no bag counting here
import { selectSafetyHoldActive, useGameSimulationStore } from '../stores/gameSimulationStore';
import { BAG_WEIGHT_KG, GrainQuality } from '../types';
import { SHARED_GEOMETRIES } from '../utils/sharedMaterials';
// The conveyor branch's surface finish. See `conveyors/conveyorSurfaces.ts` for
// why these are treated clones of the shared singletons rather than the
// singletons themselves.
import { CONVEYOR_MATERIALS, createBeltMaterial } from './conveyors/conveyorSurfaces';
import { FLOOR_LAYERS, POLYGON_OFFSET, RENDER_ORDER } from '../constants/renderLayers';
import { shouldRunThisFrame } from '../utils/frameThrottle';
import { useModelTextures } from '../utils/machineTextures';
import { createColorDataTexture, createLinearDataTexture } from '../utils/textureGenerator';
import {
  getFlourSackGeometry,
  getFlourSackMaterial,
  FLOUR_SACK_PRINT_GEOMETRY,
  FLOUR_SACK_HEIGHT,
  FLOUR_STRIPE_MATERIAL,
} from '../utils/flourSacks';

// Shared, immutable normal-scale for belt materials (inline `new THREE.Vector2`
// in JSX re-created the object every render, forcing a material prop diff).
// Raised from 0.5: the belt normal map is now the only thing carrying cleat
// relief, so it has to be readable at grazing angles.
const BELT_NORMAL_SCALE = new THREE.Vector2(0.85, 0.85);

// === BELT KINEMATICS ====================================================
// Every rate that the eye can compare is derived from ONE number. Before this,
// belt surface UV ran at 1.2 units/s, bags at 4-6 units/s and the drive roller
// rim at 0.36 units/s - cargo visibly slid along a stalled belt.

/** Belt surface speed in world units/sec at productionSpeed 1. */
const BELT_LINEAR_SPEED = 5.0;
/** World units covered by one texture tile (belt `repeat.x = length / 4`). */
const WORLD_UNITS_PER_TILE = 4;
/** Texture tiles per second at productionSpeed 1. */
const BELT_UV_RATE = BELT_LINEAR_SPEED / WORLD_UNITS_PER_TILE;

/**
 * Roller spin is DELIBERATELY not derived from `BELT_LINEAR_SPEED`.
 *
 * Physically correct rim speed on a 0.12 m roller is 41.7 rad/s. Roller
 * matrices are rewritten on a 3-frame throttle, i.e. a ~0.05 s step, which is
 * 2.08 rad per update against a 12-segment cylinder whose angular period is
 * 0.524 rad - the roller would strobe or appear to counter-rotate at
 * productionSpeed 1. These rates read as "spinning fast" without aliasing.
 */
const DRIVE_ROLLER_SPIN = 3; // rad/sec at productionSpeed 1
const IDLER_ROLLER_SPIN = 5; // rad/sec at productionSpeed 1

// Module-level registry for centralized conveyor audio updates
const conveyorAudioRegistry = new Map<string, { position: THREE.Vector3; isRunning: boolean }>();

export const registerConveyorAudio = (id: string, position: THREE.Vector3, isRunning: boolean) => {
  conveyorAudioRegistry.set(id, { position, isRunning });
};

export const unregisterConveyorAudio = (id: string) => {
  conveyorAudioRegistry.delete(id);
};

// Generate batch number in format: YYYYMMDD-XXX
const generateBatchNumber = (index: number): string => {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const batchNum = String(index + 1).padStart(3, '0');
  return `${dateStr}-${batchNum}`;
};

// Quality colors for batch labeling
const QUALITY_COLORS: Record<GrainQuality, string> = {
  premium: '#22c55e',
  standard: '#3b82f6',
  economy: '#f59e0b',
  mixed: '#8b5cf6',
};

// Module-level constants for position arrays to avoid recreating on each render
const SUPPORT_LEG_POSITIONS = [-25, -15, -5, 5, 15, 25] as const;
const ROLLER_SUPPORT_POSITIONS = [-10, 0, 10] as const;

// Pre-computed arrays for iteration (avoid Array.from on each render)

// Bag movement boundary (wraps from +BOUNDARY to -BOUNDARY)
export const BAG_BOUNDARY = (CONVEYOR_LAYOUT.shipping.length - 2) / 2;
export const FLOUR_BAG_BASE_Y = 0.5 + 0.3 + 0.1 / 2;

// === BELT SURFACE TEXTURES ==============================================
//
// The old belt map drew its ridges as `fillRect(0, y, size, 3)` - full-width
// bars at constant V, i.e. running ALONG the travel axis. Scrolling offset.x
// slid those bars along their own length and produced no perceptible motion.
// The one feature that WAS constant in U was a `#3b82f6` centre stripe, so the
// only motion cue on the belt was a row of bright blue bars.
//
// Cleats now run ACROSS the belt (constant U, spanning V) and are backed by a
// matching normal and roughness map generated from ONE height field.

/** Generated tile resolution. */
const BELT_TILE_PX = 512;
/**
 * Cleats per tile. A tile is 4 world units, so 8 gives a 0.5 m cleat pitch:
 * 64 px per cleat (well above the ~4-6 px mip floor) and, at
 * BELT_LINEAR_SPEED, only 0.33 cleat of travel per 60 Hz frame even at
 * productionSpeed 2 - comfortably clear of temporal aliasing.
 */
const BELT_CLEATS_PER_TILE = 8;
/** Height-to-slope gain for the belt normal map. */
const BELT_NORMAL_AMPLITUDE = 12;

interface BeltTextureSet {
  readonly map: THREE.DataTexture;
  readonly normal: THREE.DataTexture;
  readonly roughness: THREE.DataTexture;
}

let beltTextureSourceCache: BeltTextureSet | null = null;

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/**
 * Build the belt albedo / normal / roughness trio.
 *
 * Lazy: ~0.8 MB of CPU pixel work that must not land in the startup critical
 * path. The first mounted belt pays for it, every later belt clones.
 */
const createBeltTextureSet = (): BeltTextureSet => {
  if (beltTextureSourceCache) return beltTextureSourceCache;

  const size = BELT_TILE_PX;
  const pitch = size / BELT_CLEATS_PER_TILE;

  // Cleat profile along U (belt travel): 8 px rise, 16 px crown, 8 px fall,
  // then a flat valley for the rest of the pitch.
  const cleat = new Float32Array(size);
  for (let x = 0; x < size; x++) {
    const p = x % pitch;
    cleat[x] = smoothstep(0, 8, p) * (1 - smoothstep(pitch * 0.375, pitch * 0.5, p));
  }

  // Lane profile across V: worn-down edges, and a polished centre lane where
  // product has been riding.
  const lane = new Float32Array(size);
  const laneMask = new Float32Array(size);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    const edge = smoothstep(0, 0.06, v) * (1 - smoothstep(0.94, 1, v));
    const centre = 1 - smoothstep(0.16, 0.2, Math.abs(v - 0.5));
    laneMask[y] = centre;
    lane[y] = (0.45 + 0.55 * edge) * (1 - 0.45 * centre);
  }

  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Deterministic rubber grain. Periods ~18 px and ~13 px, both above the
      // mip floor, so this survives minification instead of averaging flat.
      const grain = Math.sin(x * 0.35 + y * 0.21) * 0.5 + Math.sin(x * 0.11 - y * 0.47 + 1.7) * 0.5;
      height[y * size + x] = cleat[x] * lane[y] + grain * 0.04;
    }
  }

  const albedo = new Uint8Array(size * size * 4);
  const normal = new Uint8Array(size * size * 4);
  const roughness = new Uint8Array(size * size * 4);

  // Dark rubber. Authored against the sRGB transfer function - verified
  // offline at mean 0.052 linear (valley 0.020, crown 0.130), which is real
  // conveyor-rubber reflectance.
  //
  // These bytes are NOT the old ones. The previous canvas was never tagged
  // sRGB, so `#1f2937` was fed to the shader as 0.122 linear; tagging that same
  // byte correctly would have dropped it to 0.014 - i.e. black - which is the
  // opposite of fixing "belts read as flat dark quads".
  const valley = [54, 56, 60];
  const crown = [96, 100, 106];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const hc = Math.min(1, Math.max(0, cleat[x] * lane[y]));

      // --- albedo -------------------------------------------------------
      const noise = Math.sin((x * 7 + y * 13) * 0.1) * 5;
      // Polished lane sits slightly darker and much shinier than the cleats.
      const laneDarken = 1 - 0.12 * laneMask[y];
      for (let c = 0; c < 3; c++) {
        const value = (valley[c] + (crown[c] - valley[c]) * hc) * laneDarken + noise;
        albedo[i + c] = Math.max(0, Math.min(255, Math.round(value)));
      }
      albedo[i + 3] = 255;

      // --- normal (signed central differences, X and Y independent) ------
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;
      const ym = (y - 1 + size) % size;
      const yp = (y + 1) % size;
      const dhdx = (height[y * size + xp] - height[y * size + xm]) * BELT_NORMAL_AMPLITUDE;
      const dhdy = (height[yp * size + x] - height[ym * size + x]) * BELT_NORMAL_AMPLITUDE;
      const nx = -dhdx;
      const ny = -dhdy;
      const len = Math.sqrt(nx * nx + ny * ny + 1);
      normal[i] = Math.round(((nx / len) * 0.5 + 0.5) * 255);
      normal[i + 1] = Math.round(((ny / len) * 0.5 + 0.5) * 255);
      normal[i + 2] = Math.round((1 / len) * 0.5 * 255 + 127.5);
      normal[i + 3] = 255;

      // --- roughness ----------------------------------------------------
      // Written to R, G AND B: three samples `roughnessMap.g`. An R-only map
      // multiplies material roughness by zero.
      const rough = (0.92 - 0.37 * hc) * (1 - laneMask[y]) + 0.42 * laneMask[y];
      const byte = Math.round(Math.max(0, Math.min(1, rough)) * 255);
      roughness[i] = byte;
      roughness[i + 1] = byte;
      roughness[i + 2] = byte;
      roughness[i + 3] = 255;
    }
  }

  beltTextureSourceCache = {
    map: createColorDataTexture(albedo, size, size), // sRGB - hand-authored albedo
    normal: createLinearDataTexture(normal, size, size), // linear - data, not colour
    roughness: createLinearDataTexture(roughness, size, size),
  };
  return beltTextureSourceCache;
};

/**
 * Each conveyor owns its animated texture transforms. Sharing the module-level
 * source directly makes every mounted belt advance the same offset each frame.
 * three keeps separate `mapTransform` / `normalMapTransform` /
 * `roughnessMapTransform` uniforms, so all three offsets must be advanced in
 * lockstep or the relief slides off the albedo.
 */
const useConveyorBeltTextures = (length: number, anisotropy: number): BeltTextureSet => {
  const source = useMemo(() => createBeltTextureSet(), []);

  const textures = useMemo(() => {
    const repeatX = Math.max(1, length / WORLD_UNITS_PER_TILE);
    const cloneBelt = (texture: THREE.DataTexture): THREE.DataTexture => {
      const clone = texture.clone();
      clone.wrapS = THREE.RepeatWrapping;
      clone.wrapT = THREE.RepeatWrapping;
      clone.repeat.set(repeatX, 1);
      // A 55 m belt at 0.4-0.65 resolution scale shimmers badly without this.
      clone.anisotropy = anisotropy;
      clone.needsUpdate = true;
      return clone;
    };
    return {
      map: cloneBelt(source.map),
      normal: cloneBelt(source.normal),
      roughness: cloneBelt(source.roughness),
    };
  }, [length, source, anisotropy]);

  useEffect(
    () => () => {
      textures.map.dispose();
      textures.normal.dispose();
      textures.roughness.dispose();
    },
    [textures]
  );

  return textures;
};

// === BELT CONTACT DECAL =================================================

let beltContactTextureCache: THREE.DataTexture | null = null;

/**
 * 1x64 vertical alpha ramp used as an ambient contact shadow under each belt.
 *
 * A 55 m x 2.2 m structure floating 0.5 m off the floor laid down almost
 * nothing, so the belt read as pasted onto the slab. One triangle pair and one
 * texture fetch reads as contact darkening at EVERY tier - including `low`,
 * where there is no shadow-casting light at all.
 */
const getBeltContactTexture = (): THREE.DataTexture => {
  if (beltContactTextureCache) return beltContactTextureCache;

  const height = 64;
  const data = new Uint8Array(height * 4);
  for (let y = 0; y < height; y++) {
    const v = (y + 0.5) / height;
    const t = Math.abs(v * 2 - 1);
    const alpha = 0.42 * (1 - smoothstep(0.5, 1, t));
    data[y * 4] = 0;
    data[y * 4 + 1] = 0;
    data[y * 4 + 2] = 0;
    data[y * 4 + 3] = Math.round(alpha * 255);
  }

  beltContactTextureCache = createColorDataTexture(data, 1, height);
  return beltContactTextureCache;
};

let beltContactMaterialCache: THREE.MeshBasicMaterial | null = null;

const getBeltContactMaterial = (): THREE.MeshBasicMaterial => {
  if (beltContactMaterialCache) return beltContactMaterialCache;
  beltContactMaterialCache = new THREE.MeshBasicMaterial({
    color: '#000000',
    map: getBeltContactTexture(),
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: POLYGON_OFFSET.standard.factor,
    polygonOffsetUnits: POLYGON_OFFSET.standard.units,
    toneMapped: false,
  });
  return beltContactMaterialCache;
};

/**
 * Ambient contact shadow under a belt run.
 *
 * Mounted by `ConveyorSystem` in WORLD space rather than inside `ConveyorBelt`:
 * the central spine belt is wrapped in a group that already carries the 0.5
 * riser and a 90-degree Y rotation, so a decal positioned relative to the belt
 * component would float half a metre above the floor on that run.
 *
 * Y and polygon offset both come from `renderLayers.ts` - never invent a new
 * floor height (see the z-fighting decision tree in CLAUDE.md).
 */
const BeltContactShadow: React.FC<{
  x: number;
  z: number;
  length: number;
  width?: number;
  rotationY?: number;
}> = React.memo(({ x, z, length, width = 3.2, rotationY = 0 }) => (
  <mesh
    position={[x, FLOOR_LAYERS.wornPrimary, z]}
    rotation={[-Math.PI / 2, 0, rotationY]}
    renderOrder={RENDER_ORDER.floorEffects}
    material={getBeltContactMaterial()}
  >
    <planeGeometry args={[length, width]} />
  </mesh>
));

const cloneConveyorTexture = (
  source: THREE.Texture | null | undefined,
  repeatX: number
): THREE.Texture | null => {
  if (!source) return null;

  const texture = source.clone();
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, 1);
  texture.needsUpdate = true;
  return texture;
};

// Centralized audio manager component - updates all conveyors in one pass
const ConveyorAudioManager: React.FC<{ productionSpeed: number }> = ({ productionSpeed }) => {
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);

  useFrame(() => {
    // PERFORMANCE: Skip audio updates when tab hidden
    if (!isTabVisible) return;
    // Skip if no conveyors are registered (avoid per-frame loop when scene hidden)
    if (conveyorAudioRegistry.size === 0) return;
    // Throttle to every 4th frame (was 2nd frame per conveyor)
    // With 10-15 conveyors, this reduces from 150-225 updates/sec to 37-56 updates/sec
    if (!shouldRunThisFrame(4)) return;
    if (productionSpeed === 0) return;

    // Update all registered conveyors in one pass
    conveyorAudioRegistry.forEach((data, id) => {
      if (data.isRunning) {
        audioManager.updateConveyorSpatialVolume(id);
      }
    });
  });
  return null;
};

interface ConveyorSystemProps {
  productionSpeed: number;
}

interface FlourBag {
  id: string;
  position: [number, number, number];
  speed: number;
  rotation: number;
  // Batch tracking
  batchNumber: string;
  quality: GrainQuality;
  weight: number; // kg
}

// Quality distribution (weighted random selection)
const QUALITY_WEIGHTS: { quality: GrainQuality; weight: number }[] = [
  { quality: 'premium', weight: 0.3 },
  { quality: 'standard', weight: 0.5 },
  { quality: 'economy', weight: 0.15 },
  { quality: 'mixed', weight: 0.05 },
];

const getRandomQuality = (): GrainQuality => {
  const rand = Math.random();
  let cumulative = 0;
  for (const { quality, weight } of QUALITY_WEIGHTS) {
    cumulative += weight;
    if (rand < cumulative) return quality;
  }
  return 'standard';
};

// Even slots preserve clear space at all three quality counts, including the
// wrap seam. Random X positions allowed sacks and their printing to intersect.
export const getFlourBagStartX = (index: number, count: number): number =>
  -BAG_BOUNDARY + ((index + 0.5) * BAG_BOUNDARY * 2) / count;

export const ConveyorSystem = React.memo<ConveyorSystemProps>(({ productionSpeed }) => {
  const graphicsQuality = useGraphicsStore(useShallow((state) => state.graphics.quality));
  // Production totals remain owned by the simulation, not this visual loop.
  const bagCount = graphicsQuality === 'low' ? 8 : graphicsQuality === 'medium' ? 16 : 32;
  // A fire drill or emergency stop halts every belt, sack and conveyor hum,
  // matching the machines and forklifts the hold has already stopped.
  const safetyHold = useGameSimulationStore(selectSafetyHoldActive);
  const effectiveSpeed = safetyHold ? 0 : productionSpeed;

  const bags = useMemo(() => {
    const _bags: FlourBag[] = [];
    for (let i = 0; i < bagCount; i++) {
      _bags.push({
        id: `bag-${i}`,
        position: [getFlourBagStartX(i, bagCount), FLOUR_BAG_BASE_Y, 0],
        // Bags ride the belt: exactly belt surface speed, no per-bag variation.
        // Equal speed preserves the initial separation through every wrap.
        speed: BELT_LINEAR_SPEED,
        rotation: (Math.random() - 0.5) * 0.1,
        // Batch tracking
        batchNumber: generateBatchNumber(i),
        quality: getRandomQuality(),
        weight: BAG_WEIGHT_KG,
      });
    }
    return _bags;
  }, [bagCount]);

  return (
    <group>
      {/* Centralized audio manager - updates all conveyors in one pass */}
      <ConveyorAudioManager productionSpeed={effectiveSpeed} />

      {Object.values(CONVEYOR_LAYOUT).map((run) => (
        <BeltContactShadow
          key={run.id}
          x={run.position[0]}
          z={run.position[2]}
          length={run.length}
          width={run.width + 0.6}
          rotationY={run.rotationY}
        />
      ))}

      <MemoizedConveyorBelt
        position={[CONVEYOR_LAYOUT.main.position[0], 0.5, CONVEYOR_LAYOUT.main.position[2]]}
        length={CONVEYOR_LAYOUT.main.length}
        productionSpeed={effectiveSpeed}
      />
      <group position={[...CONVEYOR_LAYOUT.main.position]}>
        <SideRails position={[-2, 1.3, 0]} length={CONVEYOR_LAYOUT.main.length - 4} />
        {SUPPORT_LEG_POSITIONS.map((x) => (
          <SupportLeg key={x} position={[x, 0, 0]} />
        ))}
        <TensionMechanism position={[-30, 0.5, 0]} />
        <TensionMechanism position={[30, 0.5, 0]} />
      </group>

      <RollerConveyor
        position={[CONVEYOR_LAYOUT.roller.position[0], 0.5, CONVEYOR_LAYOUT.roller.position[2]]}
        productionSpeed={effectiveSpeed}
      />

      {/* The transfer runs down the right wall; its return delivers sacks along
          the mill row to the collection aisle. Cargo keeps two instanced draws. */}
      {[CONVEYOR_LAYOUT.transfer, CONVEYOR_LAYOUT.shipping].map((run) => (
        <group key={run.id} position={[...run.position]} rotation={[0, run.rotationY, 0]}>
          <MemoizedConveyorBelt
            position={[0, 0.5, 0]}
            length={run.length}
            productionSpeed={effectiveSpeed}
            enableAudio={false}
          />
          <SideRails
            position={[run.id === CONVEYOR_LAYOUT.shipping.id ? 2 : -2, 1.3, 0]}
            length={run.length - 4}
          />
          {SUPPORT_LEG_POSITIONS.filter((x) => Math.abs(x) < run.length / 2 - 1).map((x) => (
            <SupportLeg key={x} position={[x, 0, 0]} />
          ))}
          {run.id === CONVEYOR_LAYOUT.shipping.id && (
            <InstancedFlourBags bags={bags} productionSpeed={effectiveSpeed} />
          )}
        </group>
      ))}
    </group>
  );
});

// Bracket count: 11 positions × 2 brackets (front + back) = 22 brackets
const BRACKET_COUNT = 22;

// Enhanced Side Rails with detail - using InstancedMesh for brackets (22 → 1 draw call)
const SideRails: React.FC<{ position: [number, number, number]; length: number }> = React.memo(
  ({ position, length }) => {
    const bracketsRef = useRef<THREE.InstancedMesh>(null);

    // Temp objects for matrix calculations
    const tempMatrix = useMemo(() => new THREE.Matrix4(), []);
    const tempPosition = useMemo(() => new THREE.Vector3(), []);
    const tempScale = useMemo(() => new THREE.Vector3(1, 1, 1), []);
    const identityQuaternion = useMemo(() => new THREE.Quaternion(), []);

    // Initialize bracket positions on mount
    useEffect(() => {
      if (!bracketsRef.current) return;

      let instanceIndex = 0;
      for (let i = 0; i < 11; i++) {
        const x = -length / 2 + 2.5 + (i * (length - 5)) / 10;
        // Front bracket
        tempPosition.set(x, -0.15, -0.9);
        tempMatrix.compose(tempPosition, identityQuaternion, tempScale);
        bracketsRef.current.setMatrixAt(instanceIndex++, tempMatrix);
        // Back bracket
        tempPosition.set(x, -0.15, 0.9);
        tempMatrix.compose(tempPosition, identityQuaternion, tempScale);
        bracketsRef.current.setMatrixAt(instanceIndex++, tempMatrix);
      }
      bracketsRef.current.instanceMatrix.needsUpdate = true;
    }, [length, tempMatrix, tempPosition, tempScale, identityQuaternion]);

    return (
      <group position={position}>
        {/* Front rail - main structure keeps shadow */}
        <mesh position={[0, 0, -1]} castShadow>
          <boxGeometry args={[length, 0.1, 0.15]} />
          <primitive object={CONVEYOR_MATERIALS.steelDark} attach="material" />
        </mesh>
        {/* Back rail */}
        <mesh position={[0, 0, 1]} castShadow>
          <boxGeometry args={[length, 0.1, 0.15]} />
          <primitive object={CONVEYOR_MATERIALS.steelDark} attach="material" />
        </mesh>

        {/* Instanced brackets - 22 brackets in 1 draw call - NO SHADOWS for small parts */}
        <instancedMesh
          ref={bracketsRef}
          args={[SHARED_GEOMETRIES.bracketSmall, undefined, BRACKET_COUNT]}
        >
          <primitive object={CONVEYOR_MATERIALS.paintedSlate} attach="material" />
        </instancedMesh>
      </group>
    );
  }
);

// Support leg with cross bracing - using shared materials
const SupportLeg: React.FC<{ position: [number, number, number] }> = React.memo(({ position }) => {
  return (
    <group position={position}>
      {/* Front leg - only main supports cast shadows */}
      <GeneratedBoxSurface
        asset="factorySteelUnit"
        size={[0.3, 0.5, 0.15]}
        material={CONVEYOR_MATERIALS.paintedDarkGray}
        position={[0, 0.25, -0.5]}
        castShadow
      />
      {/* Back leg */}
      <GeneratedBoxSurface
        asset="factorySteelUnit"
        size={[0.3, 0.5, 0.15]}
        material={CONVEYOR_MATERIALS.paintedDarkGray}
        position={[0, 0.25, 0.5]}
        castShadow
      />
      {/* Cross brace - no shadow for small part */}
      <GeneratedBoxSurface
        asset="factorySteelUnit"
        size={[0.08, 0.08, 0.9]}
        material={CONVEYOR_MATERIALS.paintedMediumGray}
        position={[0, 0.25, 0]}
        rotation={[0, 0, 0.3]}
      />
      {/* Foot pads - no shadow for floor-level parts */}
      <GeneratedBoxSurface
        asset="factorySteelUnit"
        size={[0.4, 0.04, 0.25]}
        material={CONVEYOR_MATERIALS.paintedBlack}
        position={[0, 0.02, -0.5]}
      />
      <GeneratedBoxSurface
        asset="factorySteelUnit"
        size={[0.4, 0.04, 0.25]}
        material={CONVEYOR_MATERIALS.paintedBlack}
        position={[0, 0.02, 0.5]}
      />
    </group>
  );
});

/**
 * Head pulley for the tension mechanisms at both ends of the main belt.
 *
 * Rendered 0.4 m across x 2 m long at x = +-27.5, sitting proud of its frame
 * at the belt terminus - the only conveyor drum the camera can walk up to.
 * It was two inline `CylinderGeometry(0.2, 0.2, 2, 16)` allocations, i.e. two
 * bare tubes; this is one shared geometry with the three things that identify
 * a drive pulley:
 *
 *   - a CROWN. The shell swells from 0.1878 at the faces to 0.2000 at
 *     mid-span - 12 mm of barrel, which is what makes a belt self-track. Real
 *     crown is ~1% and would be invisible; 6% reads as a barrel in silhouette
 *     and concentrates the specular band on the centreline, which is the whole
 *     point of having it.
 *   - a 3 mm rim chamfer. Short segment beside a long one, so LatheGeometry's
 *     length-weighted normal average leaves the face reading square. Earlier
 *     passes used a 7 mm chamfer and the whole drum previewed as a pill.
 *   - a DISHED END DISC recessed 36 mm inside the rim plane, with a raised hub
 *     boss at its centre. The end is what you see standing beside the pulley,
 *     and it was previously a flat blank.
 *
 * Envelope identical to the cylinder it replaces - max radius 0.2 at the crown
 * apex, y in [-1, 1] at the rim edges - so the pulley still spans the 2 m belt
 * width exactly and sits in the same 2.4 m frame.
 */
function createTensionPulleyGeometry(): THREE.LatheGeometry {
  const profile = [
    new THREE.Vector2(0.0, -0.984), // hub boss face centre (closes the end)
    new THREE.Vector2(0.046, -0.984), // hub boss OD
    new THREE.Vector2(0.052, -0.978), // boss chamfer
    new THREE.Vector2(0.052, -0.97), // boss wall
    new THREE.Vector2(0.058, -0.964), // boss root fillet
    new THREE.Vector2(0.15, -0.964), // end disc face, recessed 36 mm
    new THREE.Vector2(0.166, -0.98), // disc dish
    new THREE.Vector2(0.1848, -1.0), // shell rim edge - envelope y min
    new THREE.Vector2(0.1878, -0.997), // 3 mm rim chamfer
    new THREE.Vector2(0.1878, -0.92), // shell, straight before the crown
    new THREE.Vector2(0.194, -0.6), // crown rise
    new THREE.Vector2(0.1985, -0.3),
    new THREE.Vector2(0.2, 0.0), // crown apex - envelope max radius
    new THREE.Vector2(0.1985, 0.3),
    new THREE.Vector2(0.194, 0.6),
    new THREE.Vector2(0.1878, 0.92),
    new THREE.Vector2(0.1878, 0.997),
    new THREE.Vector2(0.1848, 1.0), // envelope y max
    new THREE.Vector2(0.166, 0.98),
    new THREE.Vector2(0.15, 0.964),
    new THREE.Vector2(0.058, 0.964),
    new THREE.Vector2(0.052, 0.97),
    new THREE.Vector2(0.052, 0.978),
    new THREE.Vector2(0.046, 0.984),
    new THREE.Vector2(0.0, 0.984),
  ];
  return new THREE.LatheGeometry(profile, 16);
}

const TENSION_PULLEY_GEOMETRY = createTensionPulleyGeometry();

// Belt tension adjustment mechanism - using shared materials
const TensionMechanism: React.FC<{ position: [number, number, number] }> = React.memo(
  ({ position }) => {
    return (
      <group position={position}>
        {/* Tension frame - main structure keeps shadow */}
        <mesh castShadow>
          <boxGeometry args={[0.6, 0.4, 2.4]} />
          <primitive object={CONVEYOR_MATERIALS.paintedMediumGray} attach="material" />
        </mesh>
        {/* Head pulley - NO SHADOW for small roller. Shared module-level
            geometry: the inline constructor here allocated one per mechanism. */}
        <mesh
          position={[0, 0.05, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          geometry={TENSION_PULLEY_GEOMETRY}
          material={CONVEYOR_MATERIALS.steel}
        />
        {/* Tension screws - no shadow for small parts */}
        <mesh position={[0.35, 0, -1]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.05, 0.05, 0.3, 8]} />
          <primitive object={CONVEYOR_MATERIALS.brass} attach="material" />
        </mesh>
        <mesh position={[0.35, 0, 1]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.05, 0.05, 0.3, 8]} />
          <primitive object={CONVEYOR_MATERIALS.brass} attach="material" />
        </mesh>
        {/* Bolt heads - no shadow for tiny parts */}
        <mesh position={[0.52, 0, -1]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.08, 0.08, 0.04, 6]} />
          <primitive object={CONVEYOR_MATERIALS.brass} attach="material" />
        </mesh>
        <mesh position={[0.52, 0, 1]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.08, 0.08, 0.04, 6]} />
          <primitive object={CONVEYOR_MATERIALS.brass} attach="material" />
        </mesh>
      </group>
    );
  }
);

// Shared geometries and materials for drive rollers (created once at module level to avoid GC pressure)
//
// NOT redesigned, deliberately: these three are dead geometry. The group that
// draws them is gated on `showDetails = enableProceduralTextures`, which is
// `false` on all four presets (graphicsStore.ts, GRAPHICS_PRESETS low/medium/
// high/ultra), and even ungated the rollers sit at y in [0, 0.3] inside a
// frame box that spans [-0.25, 0.25] under a belt slab at [0.25, 0.35] - fully
// enclosed, as the comment on `showMotor` below already says. The conveyor drum
// that IS visible is the tension mechanism's head pulley; see
// `createTensionPulleyGeometry`.
const DRIVE_ROLLER_MAIN_GEOMETRY = new THREE.CylinderGeometry(0.12, 0.12, 1.9, 12);
const DRIVE_ROLLER_CAP_GEOMETRY = new THREE.CylinderGeometry(0.15, 0.15, 0.05, 12);
const DRIVE_ROLLER_BEARING_GEOMETRY = new THREE.BoxGeometry(0.15, 0.15, 0.08);
// Use shared textured materials from sharedMaterials module
const DRIVE_ROLLER_MAIN_MATERIAL = CONVEYOR_MATERIALS.steel;
const DRIVE_ROLLER_CAP_MATERIAL = CONVEYOR_MATERIALS.steelDark;
const DRIVE_ROLLER_BEARING_MATERIAL = CONVEYOR_MATERIALS.paintedSlate;

export const ConveyorBelt: React.FC<{
  position: [number, number, number];
  length: number;
  productionSpeed: number;
  enableAudio?: boolean;
}> = ({ position, length, productionSpeed, enableAudio = true }) => {
  const beltRef = useRef<THREE.Mesh>(null);
  const driveRollerRef = useRef<THREE.Group>(null);
  // Roller count derived from the belt's actual length (one every 4 units,
  // inset 2 from each end). The old module-level 13-roller constant was tuned
  // for the length=55 main belt (this formula still yields 13 there) and left
  // rollers floating 4-12 units past the end of the shorter length=38 central
  // spine belt.
  const driveRollerIndices = useMemo(
    () => Array.from({ length: Math.max(1, Math.floor((length - 4) / 4) + 1) }),
    [length]
  );
  const posX = position[0];
  const posY = position[1];
  const posZ = position[2];
  const conveyorId = `conveyor-main-${posX}-${posZ}`;
  const { quality, enableProceduralTextures, anisotropyLevel } = useGraphicsStore(
    useShallow((state) => ({
      quality: state.graphics.quality,
      enableProceduralTextures: state.graphics.enableProceduralTextures,
      anisotropyLevel: state.graphics.anisotropyLevel,
    }))
  );
  const beltTextures = useConveyorBeltTextures(length, anisotropyLevel);
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);
  // Throttle roller animation more aggressively on non-ultra to cut per-frame work
  const movementThrottle = quality === 'ultra' ? 1 : 3;

  // Load conveyor PBR textures (high/ultra only)
  const sourceConveyorTextures = useModelTextures('conveyor');
  const conveyorTextures = useMemo(() => {
    const repeatX = Math.max(1, length / 4);
    return {
      color: cloneConveyorTexture(sourceConveyorTextures.color, repeatX),
      normal: cloneConveyorTexture(sourceConveyorTextures.normal, repeatX),
      roughness: cloneConveyorTexture(sourceConveyorTextures.roughness, repeatX),
    };
  }, [
    length,
    sourceConveyorTextures.color,
    sourceConveyorTextures.normal,
    sourceConveyorTextures.roughness,
  ]);

  useEffect(
    () => () => {
      conveyorTextures.color?.dispose();
      conveyorTextures.normal?.dispose();
      conveyorTextures.roughness?.dispose();
    },
    [conveyorTextures]
  );

  // Position vector for audio registry (reused, never recreated)
  const positionVec = useMemo(() => new THREE.Vector3(posX, posY, posZ), [posX, posY, posZ]);

  // Start conveyor sound and register for centralized audio updates. The hum
  // follows the belt: it stops when the belt stops and restarts with it.
  const running = productionSpeed > 0;
  const audioReady = useAudioInitialized();
  useEffect(() => {
    if (!enableAudio || !audioReady || !running) return;
    audioManager.startConveyorSound(conveyorId, posX, posY, posZ);
    registerConveyorAudio(conveyorId, positionVec, true);
    return () => {
      audioManager.stopConveyorSound(conveyorId);
      unregisterConveyorAudio(conveyorId);
    };
  }, [conveyorId, enableAudio, audioReady, running, posX, posY, posZ, positionVec]);

  // Exactly one map set is bound and scrolled. `enableMachineTextures` is
  // currently false on every tier so the KTX2 path is dead, but if it is turned
  // back on the procedural normal/roughness must not be silently dropped.
  const activeMaps = useMemo(
    () =>
      conveyorTextures.color
        ? {
            map: conveyorTextures.color,
            normal: conveyorTextures.normal ?? undefined,
            roughness: conveyorTextures.roughness ?? undefined,
          }
        : {
            map: beltTextures.map,
            normal: beltTextures.normal,
            roughness: beltTextures.roughness,
          },
    [conveyorTextures, beltTextures]
  );

  // The belt's own material object, so the analytic surface treatment can be
  // attached to it. `createBeltMaterial` owns the profile; this owns the
  // LIFETIME - R3F disposes materials it constructed from JSX, and this one it
  // did not.
  const beltMaterial = useMemo(
    () =>
      createBeltMaterial({
        map: activeMaps.map,
        normal: activeMaps.normal,
        roughness: activeMaps.roughness,
        normalScale: BELT_NORMAL_SCALE,
      }),
    [activeMaps]
  );
  useEffect(() => () => beltMaterial.dispose(), [beltMaterial]);

  useFrame((_, delta) => {
    // PERFORMANCE: Skip animations when tab hidden or production stopped
    if (!isTabVisible || productionSpeed === 0) return;
    // Skip animations on low graphics
    if (quality === 'low') return;

    // UV SCROLL RUNS EVERY FRAME, OUTSIDE THE THROTTLE. This is three float
    // writes. At the previous 3-frame throttle the belt advanced a full cleat
    // per update and simply looked stationary - the 60 Hz write is a
    // requirement of the cleats reading as motion at all, not polish.
    const uvDelta = Math.min(delta, 0.1);
    const scrollAmount = uvDelta * productionSpeed * BELT_UV_RATE;
    // three keeps a SEPARATE transform uniform per map slot, so all three
    // offsets must advance together or the relief slides off the albedo.
    activeMaps.map.offset.x = (activeMaps.map.offset.x + scrollAmount) % 1;
    if (activeMaps.normal) {
      activeMaps.normal.offset.x = (activeMaps.normal.offset.x + scrollAmount) % 1;
    }
    if (activeMaps.roughness) {
      activeMaps.roughness.offset.x = (activeMaps.roughness.offset.x + scrollAmount) % 1;
    }

    // Roller matrix work stays throttled - see DRIVE_ROLLER_SPIN.
    if (!shouldRunThisFrame(movementThrottle)) return;
    const cappedDelta = Math.min(delta * movementThrottle, 0.1);

    // Animate drive rollers - wrap to prevent float precision issues
    if (driveRollerRef.current) {
      driveRollerRef.current.rotation.z =
        (driveRollerRef.current.rotation.z + cappedDelta * productionSpeed * DRIVE_ROLLER_SPIN) %
        (Math.PI * 2);
    }
    // Audio updates now handled by centralized ConveyorAudioManager
  });

  const showDetails = enableProceduralTextures;
  // The motor housing is the only detail group that sits OUTSIDE the frame box
  // (z=1.3 against a frame half-depth of 1.1), so it is the only one worth
  // ungating. The 13 drive rollers per belt are fully enclosed by that frame -
  // showing them costs draw calls for geometry the camera can never see.
  const showMotor = quality !== 'low';

  return (
    <group position={position}>
      {/* Belt surface with scrolling texture - PBR on high/ultra, procedural fallback on low/medium */}
      <mesh ref={beltRef} receiveShadow position={[0, 0.3, 0]}>
        <boxGeometry args={[length, 0.1, 2]} />
        <primitive object={beltMaterial} attach="material" />
      </mesh>

      {/* Belt frame */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[length, 0.5, 2.2]} />
        <primitive object={CONVEYOR_MATERIALS.paintedMediumGray} attach="material" />
      </mesh>

      {/* Drive rollers at intervals - NO SHADOWS for small rotating parts */}
      {showDetails &&
        driveRollerIndices.map((_, i) => {
          const x = -length / 2 + 2 + i * 4;
          return (
            <group key={i} ref={i === 0 ? driveRollerRef : undefined} position={[x, 0.15, 0]}>
              {/* Main roller */}
              <mesh
                rotation={[Math.PI / 2, 0, 0]}
                geometry={DRIVE_ROLLER_MAIN_GEOMETRY}
                material={DRIVE_ROLLER_MAIN_MATERIAL}
              />
              {/* Roller end caps */}
              <mesh
                position={[0, 0, -1]}
                rotation={[Math.PI / 2, 0, 0]}
                geometry={DRIVE_ROLLER_CAP_GEOMETRY}
                material={DRIVE_ROLLER_CAP_MATERIAL}
              />
              <mesh
                position={[0, 0, 1]}
                rotation={[Math.PI / 2, 0, 0]}
                geometry={DRIVE_ROLLER_CAP_GEOMETRY}
                material={DRIVE_ROLLER_CAP_MATERIAL}
              />
              {/* Bearing housings */}
              <mesh
                position={[0, 0, -1.05]}
                geometry={DRIVE_ROLLER_BEARING_GEOMETRY}
                material={DRIVE_ROLLER_BEARING_MATERIAL}
              />
              <mesh
                position={[0, 0, 1.05]}
                geometry={DRIVE_ROLLER_BEARING_GEOMETRY}
                material={DRIVE_ROLLER_BEARING_MATERIAL}
              />
            </group>
          );
        })}

      {/* Motor housing at one end */}
      {showMotor && (
        <group position={[-length / 2 + 1, -0.1, 1.3]}>
          <GeneratedBoxSurface
            asset="factorySteelUnit"
            size={[0.8, 0.6, 0.5]}
            material={CONVEYOR_MATERIALS.industrialBlue}
            castShadow
          />
          {/* Motor shaft - NO SHADOW for small part */}
          <mesh position={[0, 0.1, -0.3]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.08, 0.08, 0.3, 8]} />
            <primitive object={CONVEYOR_MATERIALS.shaft} attach="material" />
          </mesh>
          {/* Ventilation grille - z offset increased to 0.28 to prevent z-fighting with motor housing front face at z=0.25 */}
          <mesh position={[0, 0, 0.28]}>
            <planeGeometry args={[0.5, 0.35]} />
            <meshBasicMaterial
              color="#1a1a1a"
              depthWrite={false}
              polygonOffset
              polygonOffsetFactor={POLYGON_OFFSET.standard.factor}
              polygonOffsetUnits={POLYGON_OFFSET.standard.units}
            />
          </mesh>
          {/* Warning label */}
          <mesh position={[0.41, 0.1, 0]} rotation={[0, Math.PI / 2, 0]}>
            <planeGeometry args={[0.2, 0.15]} />
            <primitive object={CONVEYOR_MATERIALS.warningYellow} attach="material" />
          </mesh>
        </group>
      )}
    </group>
  );
};

// Memoize ConveyorBelt to prevent re-renders when productionSpeed changes
const MemoizedConveyorBelt = React.memo(ConveyorBelt);

/**
 * Gravity-conveyor idler, rendered 0.3 m across x 2 m long and instanced 25
 * times down the packing line. It stands 25 mm proud of the side rails, so it
 * is the one conveyor part the camera looks straight down at.
 *
 * The barrel is DELIBERATELY straight. A drive drum is crowned so the belt
 * tracks (`createTensionPulleyGeometry` above); a free-spinning gravity roller
 * is not, and crowning one would be wrong hardware rather than extra detail.
 * Looking down the line you read 25 roller ENDS, so the whole design went
 * there: an 8 mm rolled rim chamfer, a 26 mm rim face, a 38 mm bearing pocket,
 * and a hub boss standing 16 mm PROUD of that pocket floor, on the axis the
 * axle stub at z = +-1.05 runs out along. Proud, not sunk: an earlier pass put
 * the hub face 56 mm inboard - deeper than the 38 mm floor it was supposed to
 * rise from - which builds a second counterbore, not a boss. Previewed from a
 * 30-degree elevation (the machine_part_preview camera is broadside and
 * physically cannot see an end face) and again at 9 degrees, because a shallow
 * recess and a low dome are the same image until something casts a shadow.
 *
 * Envelope identical to `CylinderGeometry(0.15, 0.15, 2, 16)` - max radius
 * 0.15 on the barrel, y in [-1, 1] at the rim faces - so the rollers still
 * meet the axle stubs and clear the rails at z = +-1.2.
 */
function createIdlerRollerGeometry(): THREE.LatheGeometry {
  const profile = [
    new THREE.Vector2(0.0, -0.978), // hub boss face centre (closes the end)
    new THREE.Vector2(0.042, -0.978), // hub boss OD, 16 mm proud of the floor
    new THREE.Vector2(0.048, -0.972), // boss face chamfer
    new THREE.Vector2(0.048, -0.966), // boss wall
    new THREE.Vector2(0.054, -0.962), // boss root fillet, down on the floor
    new THREE.Vector2(0.098, -0.962), // bearing pocket floor, 38 mm deep
    new THREE.Vector2(0.104, -0.968), // pocket wall fillet
    new THREE.Vector2(0.104, -0.994), // pocket wall
    new THREE.Vector2(0.11, -1.0), // pocket mouth chamfer - envelope y min
    new THREE.Vector2(0.133, -1.0), // rim face, 26 mm annulus
    new THREE.Vector2(0.142, -0.991), // rolled rim chamfer
    new THREE.Vector2(0.15, -0.983), // chamfer meets the barrel - max radius
    new THREE.Vector2(0.15, 0.983), // straight barrel
    new THREE.Vector2(0.142, 0.991),
    new THREE.Vector2(0.133, 1.0), // envelope y max
    new THREE.Vector2(0.11, 1.0),
    new THREE.Vector2(0.104, 0.994),
    new THREE.Vector2(0.104, 0.968),
    new THREE.Vector2(0.098, 0.962),
    new THREE.Vector2(0.054, 0.962),
    new THREE.Vector2(0.048, 0.966),
    new THREE.Vector2(0.048, 0.972),
    new THREE.Vector2(0.042, 0.978),
    new THREE.Vector2(0.0, 0.978),
  ];
  return new THREE.LatheGeometry(profile, 16);
}

// Shared geometries for instanced rollers (created once at module level)
const ROLLER_GEOMETRY = createIdlerRollerGeometry();
/**
 * Axle stub, left as a plain 8-sided slug on purpose.
 *
 * A waisted two-collar spring axle was designed and previewed
 * (`roller_axle_rejected` in scripts/blender/specs/conveyors-spouting.json):
 * at the true 0.1 m x 0.1 m size it rendered as two soft octagonal lumps
 * rather than hardware. The physically correct answer - a hex prism - cannot
 * hold the envelope, because a regular hexagon's max|x| and max|z| differ by
 * 13.4% and the harness reports that as 6.7 mm of drift. An octagonal slug at
 * this size is already inside the site's stylization budget.
 */
const AXLE_GEOMETRY = new THREE.CylinderGeometry(0.05, 0.05, 0.1, 8);
const ROLLER_COUNT = 25;

// Module-level temp objects to avoid GC pressure in useFrame
const _tempEuler = new THREE.Euler();

// Instanced roller conveyor - 25 rollers rendered in 1 draw call
export const RollerConveyor: React.FC<{
  position: [number, number, number];
  productionSpeed: number;
  enableAudio?: boolean;
}> = ({ position, productionSpeed, enableAudio = true }) => {
  const rollersRef = useRef<THREE.InstancedMesh>(null);
  const axlesRef = useRef<THREE.InstancedMesh>(null);
  const posX = position[0];
  const posY = position[1];
  const posZ = position[2];
  const conveyorId = `conveyor-roller-${posX}-${posZ}`;
  const { quality, enableProceduralTextures } = useGraphicsStore(
    useShallow((state) => ({
      quality: state.graphics.quality,
      enableProceduralTextures: state.graphics.enableProceduralTextures,
    }))
  );
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);
  const movementThrottle = quality === 'ultra' ? 1 : 3;

  // Position vector for audio registry (reused, never recreated)
  const positionVec = useMemo(() => new THREE.Vector3(posX, posY, posZ), [posX, posY, posZ]);

  // Store rotations per roller for animation
  const rotationsRef = useRef<Float32Array>(new Float32Array(ROLLER_COUNT));

  // Temp objects for matrix calculations (reused each frame)
  const tempMatrix = useMemo(() => new THREE.Matrix4(), []);
  const tempPosition = useMemo(() => new THREE.Vector3(), []);
  const tempQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const tempScale = useMemo(() => new THREE.Vector3(1, 1, 1), []);

  // Initialize roller positions on mount
  useEffect(() => {
    if (!rollersRef.current) return;

    const baseRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));

    for (let i = 0; i < ROLLER_COUNT; i++) {
      tempPosition.set(-12 + i * 1, 0.25, 0);
      tempMatrix.compose(tempPosition, baseRotation, tempScale);
      rollersRef.current.setMatrixAt(i, tempMatrix);
    }
    rollersRef.current.instanceMatrix.needsUpdate = true;
  }, [tempMatrix, tempPosition, tempScale]);

  // Initialize axle positions on mount
  useEffect(() => {
    if (!axlesRef.current || quality === 'low') return;

    const baseRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));

    for (let i = 0; i < ROLLER_COUNT; i++) {
      // Front axle
      tempPosition.set(-12 + i * 1, 0.25, -1.05);
      tempMatrix.compose(tempPosition, baseRotation, tempScale);
      axlesRef.current.setMatrixAt(i * 2, tempMatrix);

      // Back axle
      tempPosition.set(-12 + i * 1, 0.25, 1.05);
      tempMatrix.compose(tempPosition, baseRotation, tempScale);
      axlesRef.current.setMatrixAt(i * 2 + 1, tempMatrix);
    }
    axlesRef.current.instanceMatrix.needsUpdate = true;
  }, [tempMatrix, tempPosition, tempScale, quality]);

  // Start roller conveyor sound and register for centralized audio updates;
  // silent while the rollers are stopped.
  const running = productionSpeed > 0;
  const audioReady = useAudioInitialized();
  useEffect(() => {
    if (!enableAudio || !audioReady || !running) return;
    audioManager.startConveyorSound(conveyorId, posX, posY, posZ);
    registerConveyorAudio(conveyorId, positionVec, true);
    return () => {
      audioManager.stopConveyorSound(conveyorId);
      unregisterConveyorAudio(conveyorId);
    };
  }, [conveyorId, enableAudio, audioReady, running, posX, posY, posZ, positionVec]);

  useFrame((_, delta) => {
    // PERFORMANCE: Skip animations when tab hidden or production stopped
    if (!isTabVisible || productionSpeed === 0) return;
    // Skip animations on low graphics
    if (quality === 'low') return;
    if (!rollersRef.current) return;
    if (!shouldRunThisFrame(movementThrottle)) return;

    // Cap delta to prevent huge jumps when tab regains focus (max 100ms)
    const cappedDelta = Math.min(delta * movementThrottle, 0.1);

    // Update rotations for each roller
    for (let i = 0; i < ROLLER_COUNT; i++) {
      const speedVariation = 1 + Math.sin(i * 0.5) * 0.1;
      rotationsRef.current[i] =
        (rotationsRef.current[i] +
          cappedDelta * productionSpeed * IDLER_ROLLER_SPIN * speedVariation) %
        (Math.PI * 2);

      // Update instance matrix with new rotation (reuse module-level Euler).
      //
      // The spin goes in the Y slot, NOT Z. three composes an 'XYZ' Euler as
      // Rx * Ry * Rz, so the Z term is applied to the vector FIRST, before the
      // X term stands the cylinder up: `set(PI/2, 0, theta)` swung the roller
      // axis from +Z at theta=0 to -X at theta=PI/2, i.e. every roller slewed
      // from across the line to along it as it "span". Verified against three
      // directly - (0,1,0) through set(PI/2, 0, PI/2) lands at (-1, 0, 0),
      // through set(PI/2, theta, 0) it stays (0, 0, 1) for every theta.
      // A smooth tube half hid this; the designed roller ends do not.
      tempPosition.set(-12 + i * 1, 0.25, 0);
      _tempEuler.set(Math.PI / 2, rotationsRef.current[i], 0);
      tempQuaternion.setFromEuler(_tempEuler);
      tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
      rollersRef.current.setMatrixAt(i, tempMatrix);
    }
    rollersRef.current.instanceMatrix.needsUpdate = true;

    // Audio updates now handled by centralized ConveyorAudioManager
  });

  // `enableProceduralTextures` is false on every tier, so this used to hide the
  // axles unconditionally. They are one instanced draw call; gate them on the
  // tier instead and leave the store flag meaning "generate texture atlases".
  const showDetails = enableProceduralTextures || quality !== 'low';

  return (
    <group position={position}>
      {/* Frame with detail */}
      <mesh position={[0, -0.05, 0]}>
        <boxGeometry args={[30, 0.2, 2.5]} />
        <primitive object={CONVEYOR_MATERIALS.steelDark} attach="material" />
      </mesh>

      {/* Side rails - main structure gets shadows */}
      <mesh position={[0, 0.2, -1.2]} castShadow>
        <boxGeometry args={[30, 0.35, 0.1]} />
        <primitive object={CONVEYOR_MATERIALS.paintedSlate} attach="material" />
      </mesh>
      <mesh position={[0, 0.2, 1.2]} castShadow>
        <boxGeometry args={[30, 0.35, 0.1]} />
        <primitive object={CONVEYOR_MATERIALS.paintedSlate} attach="material" />
      </mesh>

      {/* Instanced Rollers - 25 rollers in 1 draw call - NO SHADOW for rotating parts */}
      <instancedMesh ref={rollersRef} args={[ROLLER_GEOMETRY, undefined, ROLLER_COUNT]}>
        {/* The branch's one flat row (25 m over 25 instances), now finished in
            OBJECT space because these spin - see `conveyorSurfaces.ts`. */}
        <primitive object={CONVEYOR_MATERIALS.roller} attach="material" />
      </instancedMesh>

      {/* Instanced Axle ends - 50 axles in 1 draw call (only on medium+ quality) */}
      {showDetails && (
        <instancedMesh ref={axlesRef} args={[AXLE_GEOMETRY, undefined, ROLLER_COUNT * 2]}>
          <primitive object={CONVEYOR_MATERIALS.steelDark} attach="material" />
        </instancedMesh>
      )}

      {/* End stops */}
      <mesh position={[-14.5, 0.3, 0]} castShadow>
        <boxGeometry args={[0.3, 0.4, 2.6]} />
        <primitive object={CONVEYOR_MATERIALS.warningRed} attach="material" />
      </mesh>
      <mesh position={[14.5, 0.3, 0]} castShadow>
        <boxGeometry args={[0.3, 0.4, 2.6]} />
        <primitive object={CONVEYOR_MATERIALS.warningRed} attach="material" />
      </mesh>

      {/* Support legs - using shared materials, no shadows for small parts */}
      {ROLLER_SUPPORT_POSITIONS.map((x, i) => (
        <group key={i} position={[x, -0.3, 0]}>
          <mesh position={[0, 0, -1]} geometry={SHARED_GEOMETRIES.legVertical}>
            <primitive object={CONVEYOR_MATERIALS.paintedDarkGray} attach="material" />
          </mesh>
          <mesh position={[0, 0, 1]} geometry={SHARED_GEOMETRIES.legVertical}>
            <primitive object={CONVEYOR_MATERIALS.paintedDarkGray} attach="material" />
          </mesh>
        </group>
      ))}
    </group>
  );
};

// === FLOUR SACK ==========================================================

export {
  getFlourSackGeometry,
  FLOUR_STRIPE_GEOMETRY,
  FLOUR_STRIPE_MATERIAL,
} from '../utils/flourSacks';

export const BAG_BODY_OFFSET = new THREE.Matrix4().makeTranslation(0, FLOUR_SACK_HEIGHT / 2, 0);
// Body and all five printed faces share the same belt-contact datum.
export const BAG_STRIPE_OFFSET = BAG_BODY_OFFSET.clone();
const BAG_SCALE = new THREE.Vector3(1, 1, 1);
const BAG_UP = new THREE.Vector3(0, 1, 0);
const BAG_IDLE_COLOR = new THREE.Color('#ffffff');
const BAG_HOVER_COLOR = new THREE.Color('#ffd99a');

export function advanceBagPosition(
  currentX: number,
  speed: number,
  productionSpeed: number,
  delta: number
): number {
  const cappedDelta = Math.min(Math.max(delta, 0), 0.1);
  const next = currentX + speed * Math.max(0, productionSpeed) * cappedDelta;
  if (next <= BAG_BOUNDARY) return next;
  return -BAG_BOUNDARY + ((next - BAG_BOUNDARY) % (BAG_BOUNDARY * 2));
}

/**
 * Medium previously rendered 30 sacks as 60 individual draws. The body and
 * quality stripe now remain independently shaded, animated and pickable in two
 * instanced draws. One tooltip follows the selected instance.
 */
const InstancedFlourBags: React.FC<{
  bags: FlourBag[];
  productionSpeed: number;
}> = React.memo(({ bags, productionSpeed }) => {
  const bodiesRef = useRef<THREE.InstancedMesh>(null);
  const stripesRef = useRef<THREE.InstancedMesh>(null);
  const tooltipRef = useRef<THREE.Group>(null);
  const positionsRef = useRef<number[]>(bags.map((bag) => bag.position[0]));
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);
  const groupPosition = useMemo(() => new THREE.Vector3(), []);
  const groupRotation = useMemo(() => new THREE.Quaternion(), []);
  const groupMatrix = useMemo(() => new THREE.Matrix4(), []);
  const instanceMatrix = useMemo(() => new THREE.Matrix4(), []);
  const qualityColours = useMemo(
    () => bags.map((bag) => new THREE.Color(QUALITY_COLORS[bag.quality]).multiplyScalar(0.12)),
    [bags]
  );

  const writeMatrices = (): void => {
    const bodies = bodiesRef.current;
    const stripes = stripesRef.current;
    if (!bodies || !stripes) return;

    for (let index = 0; index < bags.length; index += 1) {
      const bag = bags[index];
      groupPosition.set(positionsRef.current[index], bag.position[1], bag.position[2]);
      groupRotation.setFromAxisAngle(BAG_UP, bag.rotation);
      groupMatrix.compose(groupPosition, groupRotation, BAG_SCALE);

      instanceMatrix.multiplyMatrices(groupMatrix, BAG_BODY_OFFSET);
      bodies.setMatrixAt(index, instanceMatrix);
      instanceMatrix.multiplyMatrices(groupMatrix, BAG_STRIPE_OFFSET);
      stripes.setMatrixAt(index, instanceMatrix);
    }

    bodies.instanceMatrix.needsUpdate = true;
    stripes.instanceMatrix.needsUpdate = true;
  };

  useLayoutEffect(() => {
    const bodies = bodiesRef.current;
    const stripes = stripesRef.current;
    if (!bodies || !stripes) return;

    positionsRef.current = bags.map((bag) => bag.position[0]);
    bodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    stripes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let index = 0; index < bags.length; index += 1) {
      bodies.setColorAt(index, BAG_IDLE_COLOR);
      stripes.setColorAt(index, qualityColours[index]);
    }
    if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
    if (stripes.instanceColor) stripes.instanceColor.needsUpdate = true;
    writeMatrices();
    bodies.computeBoundingSphere();
    stripes.computeBoundingSphere();
    setHoveredIndex(null);
  }, [bags, qualityColours]);

  useEffect(() => {
    const bodies = bodiesRef.current;
    if (!bodies) return;
    for (let index = 0; index < bags.length; index += 1) {
      bodies.setColorAt(index, index === hoveredIndex ? BAG_HOVER_COLOR : BAG_IDLE_COLOR);
    }
    if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
  }, [bags.length, hoveredIndex]);

  useFrame((_, delta) => {
    if (isTabVisible && productionSpeed > 0) {
      for (let index = 0; index < bags.length; index += 1) {
        positionsRef.current[index] = advanceBagPosition(
          positionsRef.current[index],
          bags[index].speed,
          productionSpeed,
          delta
        );
      }
      writeMatrices();
    }

    if (hoveredIndex !== null && tooltipRef.current) {
      const bag = bags[hoveredIndex];
      tooltipRef.current.position.set(
        positionsRef.current[hoveredIndex],
        bag.position[1] + 0.8,
        bag.position[2]
      );
    }
  });

  const hoveredBag = hoveredIndex === null ? null : bags[hoveredIndex];

  return (
    <group dispose={null}>
      <instancedMesh
        ref={bodiesRef}
        args={[getFlourSackGeometry(), getFlourSackMaterial(), bags.length]}
        castShadow
        receiveShadow
        onPointerOver={(event) => {
          event.stopPropagation();
          if (event.instanceId !== undefined) setHoveredIndex(event.instanceId);
        }}
        onPointerOut={() => setHoveredIndex(null)}
      >
        <GeneratedBoundary fallback={null}>
          <GeneratedGeometrySurface
            asset={'flourSackUnit'}
            original={getFlourSackGeometry()}
            meshRef={bodiesRef}
          />
        </GeneratedBoundary>
      </instancedMesh>
      <instancedMesh
        ref={stripesRef}
        args={[FLOUR_SACK_PRINT_GEOMETRY, FLOUR_STRIPE_MATERIAL, bags.length]}
        receiveShadow
      />

      {hoveredBag && (
        <group ref={tooltipRef}>
          <Html center distanceFactor={10}>
            <div className="pointer-events-none min-w-[120px] rounded-lg border border-slate-700 bg-slate-900/95 px-3 py-2 shadow-xl backdrop-blur">
              <div className="text-xs font-mono font-bold text-white">{hoveredBag.batchNumber}</div>
              <div className="mt-1 text-[10px] text-slate-400">
                <div className="flex justify-between">
                  <span>Quality:</span>
                  <span
                    style={{ color: QUALITY_COLORS[hoveredBag.quality] }}
                    className="font-medium capitalize"
                  >
                    {hoveredBag.quality}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Weight:</span>
                  <span className="text-white">{hoveredBag.weight} kg</span>
                </div>
              </div>
            </div>
          </Html>
        </group>
      )}
    </group>
  );
});
