import React, { useMemo, useRef, useEffect, useLayoutEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { SceneText as Text } from './shared/SceneText';
import { useFrame, ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useGraphicsStore } from '../stores/graphicsStore';
import { playCritterSound } from '../utils/critterAudio';
import { HeartParticle } from './effects/HeartParticle';
import {
  EXTERIOR_LAYERS,
  FLOOR_LAYERS,
  POLYGON_OFFSET,
  RENDER_ORDER,
  SURFACE_LAYERS,
} from '../constants/renderLayers';
import { BULK_STORAGE_GALLERY, RIVER_FOOTBRIDGE_DECK, SITE_LAYOUT } from '../constants/siteLayout';
import { createDisplacedGeometry } from './terrain/TerrainGround';
import { getTerrainGridSegments, TERRAIN_BOUNDS } from './terrain/terrainTypes';
import {
  getRiverCenterZ,
  getRiverHeightfield,
  MILLOS_RIVER_CONFIG,
} from './terrain/splatMapGenerator';
import { createRiverCulvertGeometries, createRiverSurfaceGeometry } from './exterior/riverGeometry';
import { UTILITY_ASSET_DEFINITIONS } from '../constants/utilityAssets';
import {
  createAtmosphereState,
  createCelestialState,
  sampleAtmosphere,
  sampleCelestial,
} from '../simulation/atmosphere';
import { positionRegistry } from '../utils/positionRegistry';
import { PROCEDURAL_TEXTURES, TREE_MATERIALS } from '../utils/sharedMaterials';
import { generateMachineORM } from '../textures';
import { createCheckpointGateState, stepCheckpointGate } from './exterior/checkpointLogic';
import {
  EXTERIOR_LAMP_LENS_MATERIAL,
  ExteriorLampDriver,
  ExteriorLampPool,
} from './exterior/ExteriorLighting';
// OUTDOOR_MATERIALS removed - grass plane now handled by TerrainGround
import { GasStation } from './GasStationInstanced';
import { GeneratedBoundary, GeneratedModel } from './models/GeneratedModel';
import { GeneratedLampModel } from './models/GeneratedLampModel';
import { GeneratedPaintedModel } from './models/GeneratedPaintedModel';
import { GeneratedOfficeModel } from './models/GeneratedOfficeModel';
import { GeneratedBoatModel } from './models/GeneratedBoatModel';
import {
  GeneratedBoxSurface,
  GeneratedGeometrySurface,
  GeneratedSurfaceMesh,
} from './models/GeneratedGeometrySurface';
import {
  createVictorianTunnelPortalGeometry,
  createVictorianTunnelSideGeometry,
  ROAD_TUNNEL_EARTH_MATERIAL,
  RoadTunnel,
} from './scenery/Tunnel';
import {
  SimpleTreeInstances,
  ParkBenchInstances,
  MAIN_EXTERIOR_TREES,
  MAIN_EXTERIOR_BENCHES,
  PARKLAND_TREES,
  PARKLAND_BENCHES,
  FRONT_PARKLAND_TREES,
  FRONT_PARKLAND_BENCHES,
  TREE_FOLIAGE_VARIANTS,
  TREE_FOLIAGE_MATERIALS,
  treeJitterFromPosition,
  groundedTreePosition,
  SHARED_TREE_TRUNK,
  TREE_BRANCH_GEOMETRY,
} from './exterior/ExteriorVegetation';
import {
  createOrganicLakeBankGeometry,
  createOrganicLakeSurfaceGeometry,
} from './exterior/organicLakeGeometry';
interface FactoryExteriorProps {
  floorWidth?: number;
  floorDepth?: number;
  showFactoryShell?: boolean;
}

const PROPANE_COMPOUND_CENTRE = SITE_LAYOUT.serviceYard.propaneCompound.position;
const UTILITY_TANK_FARM_CENTRE = SITE_LAYOUT.serviceYard.utilityTankFarm.position;

const TANK_SUPPORT_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#64707a',
  roughness: 0.68,
  metalness: 0.08,
});
const TANK_FITTING_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#7c8991',
  roughness: 0.48,
  metalness: 0.22,
});
const UTILITY_CONCRETE_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#a9afb0',
  roughness: 0.92,
  metalness: 0,
});
const UTILITY_CURB_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#858d8e',
  roughness: 0.88,
  metalness: 0,
});
const UTILITY_RAIL_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#aeb8ba',
  roughness: 0.58,
  metalness: 0.18,
});
const UTILITY_SAFETY_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#e4a90c',
  roughness: 0.58,
  metalness: 0.04,
});

// ---------------------------------------------------------------------------
// SHARED EXTERIOR SURFACE TEXTURES
// ---------------------------------------------------------------------------
// `Texture.clone()` shares `.source`, so a tiling variant costs a second
// sampler binding and no extra GPU upload. Deliberately few clones exist: the
// merge key in `performance/StaticMeshBatch.tsx` includes texture identity and
// repeat, so one clone per call site would splinter every road into its own
// batch group. Three tarmac tilings cover every paved surface on the site.
//
// COLOUR SPACE - READ BEFORE CHANGING ANY `color` BELOW.
// `generateTarmac`/`generateBrick`/`generateConcrete` author sRGB bytes and
// return them through `createColorDataTexture`, which tags SRGBColorSpace, so
// the sampled albedo is already the correct linear reflectance (~0.055 for
// weathered asphalt). A non-white `color` on a mesh carrying one of these maps
// multiplies the same hue a second time. Surfaces that gain a map here
// therefore take `#ffffff`, or a deliberate hue-preserving lift where the tint
// encodes a distinct variant - never the old dark compensating hex.
const cloneTiledTexture = (source: THREE.Texture, x: number, y: number): THREE.Texture => {
  const texture = source.clone();
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(x, y);
  return texture;
};

/** Footpaths and small forecourt aprons. */
const TARMAC_PATH_MAP = cloneTiledTexture(PROCEDURAL_TEXTURES.tarmacColor, 4, 4);
const TARMAC_PATH_ROUGHNESS = cloneTiledTexture(PROCEDURAL_TEXTURES.tarmacRoughness, 4, 4);
/** Carriageways - access roads, connecting roads, bridge decks. */
const TARMAC_ROAD_MAP = cloneTiledTexture(PROCEDURAL_TEXTURES.tarmacColor, 12, 12);
const TARMAC_ROAD_ROUGHNESS = cloneTiledTexture(PROCEDURAL_TEXTURES.tarmacRoughness, 12, 12);
/** Large open pours - car parks, station forecourts. */
const TARMAC_LOT_MAP = cloneTiledTexture(PROCEDURAL_TEXTURES.tarmacColor, 25, 25);
const TARMAC_LOT_ROUGHNESS = cloneTiledTexture(PROCEDURAL_TEXTURES.tarmacRoughness, 25, 25);

// ---------------------------------------------------------------------------
// CANAL
// ---------------------------------------------------------------------------
// 434 m of untextured surface across the two canals - the largest genuinely
// unfinished block left in this branch once shader-injected surfacing is
// discounted, and the whole of the village district's waterfront. The tilings
// are cut for the 220 x 12 m main canal at `[-145, 0, -5]`; the 70 x 8 m spur
// at `[-145, 0, -110]` therefore reads about 3x coarser. That is the same
// deliberate trade the dock openings make - one clone per surface class rather
// than one per call site, because texture identity is part of the
// `StaticMeshBatch` merge key - and the spur sits in the far parkland where no
// review camera frames it.
//
// COLOUR SPACE: both albedo sources come through `createColorDataTexture`, so the
// sampled albedo is already correct linear reflectance and each surface takes
// `#ffffff`. The old `#7d6d5e` / `#5d6d7e` / `#2c3e50` hexes are gone rather
// than kept as tints - keeping them would multiply the same hue twice, which is
// the double-darkening CLAUDE.md records for the village cobbles.

/** Towpath: 3 m wide x 220 m. Compacted gravel; ~3 m per tile. */
const TOWPATH_MAP = cloneTiledTexture(PROCEDURAL_TEXTURES.mudColor, 1, 73);
const TOWPATH_ROUGHNESS = cloneTiledTexture(PROCEDURAL_TEXTURES.mudRoughness, 1, 73);
/** Canal walls: 1.5 m high x 220 m of coursed stone; ~2 m per tile. */
const CANAL_WALL_MAP = cloneTiledTexture(PROCEDURAL_TEXTURES.concreteColor, 110, 1);
const CANAL_WALL_ROUGHNESS = cloneTiledTexture(PROCEDURAL_TEXTURES.concreteRoughness, 110, 1);
const CANAL_WALL_NORMAL = cloneTiledTexture(PROCEDURAL_TEXTURES.panelNormal, 110, 1);
const CANAL_WALL_NORMAL_SCALE = new THREE.Vector2(0.25, 0.25);

/** Coarse brick for the 6m Victorian tunnel portal. */
const VICTORIAN_PORTAL_FACE = createVictorianTunnelPortalGeometry();
const VICTORIAN_PORTAL_EXIT = createVictorianTunnelPortalGeometry(11, 7, 1);
const PORTAL_BRICK_MAP = cloneTiledTexture(PROCEDURAL_TEXTURES.brickColor, 2, 3);
const PORTAL_BRICK_NORMAL = cloneTiledTexture(PROCEDURAL_TEXTURES.brickNormal, 2, 3);
const PORTAL_BRICK_NORMAL_SCALE = new THREE.Vector2(0.45, 0.45);
const VICTORIAN_PORTAL_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#ffffff',
  map: PORTAL_BRICK_MAP,
  normalMap: PORTAL_BRICK_NORMAL,
  normalScale: PORTAL_BRICK_NORMAL_SCALE,
  roughness: 0.88,
});
/** Cast/rendered concrete for outbuilding walls and stone dressings. */
const OUTBUILDING_CONCRETE_ROUGHNESS = cloneTiledTexture(
  PROCEDURAL_TEXTURES.concreteRoughness,
  3,
  2
);
const OUTBUILDING_PANEL_NORMAL = cloneTiledTexture(PROCEDURAL_TEXTURES.panelNormal, 3, 2);
const OUTBUILDING_NORMAL_SCALE = new THREE.Vector2(0.14, 0.14);

// ---------------------------------------------------------------------------
// ROAD PAINT
// ---------------------------------------------------------------------------
// Markings were `meshBasicMaterial` at pure #ffffff / #f1c40f: unlit, so they
// never darkened through the day/night cycle, never took the sun's shadow, and
// never sat in the same tonal range as the surface they are painted on - flat
// cut-out quads floating on the asphalt. Real thermoplastic road paint is a
// chalky off-white that weathers grey, and it is lit.
//
// These are spread onto `<meshStandardMaterial>` rather than being shared
// material instances because each call site still supplies its own
// polygonOffset pair, which is what holds the paint above the road. The
// material TYPE, `receiveShadow` and `renderOrder` are all components of the
// StaticMeshBatch merge key, so every marking in the file is converted in one
// pass - a partial conversion would split one merge group into two.
const ROAD_PAINT_WHITE = {
  color: '#d8d4c8',
  roughness: 0.78,
  metalness: 0,
  // A small emissive floor keeps markings legible under the night ambient
  // instead of going fully black, without making them glow in daylight.
  emissive: '#141310',
  emissiveIntensity: 0.2,
  depthWrite: false,
} as const;

const ROAD_PAINT_YELLOW = {
  ...ROAD_PAINT_WHITE,
  color: '#d9bb3f',
  emissive: '#151004',
} as const;

// ---------------------------------------------------------------------------
// PERIMETER FENCE
// ---------------------------------------------------------------------------
// The fence frames the whole site and had no map of any kind. The panel normal
// runs ALONG each member (1x8 up a post, 24x1 down a rail) so the grain reads
// as drawn steel rather than a tiled patch, and metalness drops because these
// are painted sections - the same reasoning as the silo volumes.
// CHANNEL ORDER MATTERS. `PROCEDURAL_TEXTURES.brushedMetal` is
// generateBrushedMetal, which packs R=roughness, G=metalness, B=AO - three
// reads a roughnessMap from GREEN, so binding it here would silently multiply
// roughness by the METALNESS channel. `generateMachineORM` is the glTF order
// (R=AO, G=roughness, B=metal) and is what this file must use. The 512/vertical
// /96 variant is already built by machineSurfaces.ts and
// OptimizedFactoryInfrastructure.tsx, and `getTexture` memoises on that key, so
// this is a cache hit: no extra generation pass and no extra GPU upload.
// Do NOT also bind it as a metalnessMap - its B channel is a constant 1.
const FENCE_ORM = generateMachineORM(512, 'vertical', 96);
const FENCE_POST_NORMAL = cloneTiledTexture(PROCEDURAL_TEXTURES.panelNormal, 1, 8);
const FENCE_POST_ROUGHNESS = cloneTiledTexture(FENCE_ORM, 1, 8);
const FENCE_RAIL_NORMAL = cloneTiledTexture(PROCEDURAL_TEXTURES.panelNormal, 24, 1);
const FENCE_RAIL_ROUGHNESS = cloneTiledTexture(FENCE_ORM, 24, 1);
const FENCE_NORMAL_SCALE = new THREE.Vector2(0.2, 0.2);

const FENCE_POST_SURFACE = {
  color: '#37474f',
  roughness: 0.72,
  metalness: 0.1,
  normalMap: FENCE_POST_NORMAL,
  normalScale: FENCE_NORMAL_SCALE,
  roughnessMap: FENCE_POST_ROUGHNESS,
} as const;

const FENCE_RAIL_SURFACE = {
  color: '#455a64',
  roughness: 0.72,
  metalness: 0.1,
  normalMap: FENCE_RAIL_NORMAL,
  normalScale: FENCE_NORMAL_SCALE,
  roughnessMap: FENCE_RAIL_ROUGHNESS,
} as const;

const FENCE_POST_GEOMETRY = new THREE.BoxGeometry(0.15, 2.4, 0.15);
const FENCE_RAIL_MATERIAL = new THREE.MeshStandardMaterial(FENCE_RAIL_SURFACE);
const HEDGE_SURFACE_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#2d5a27',
  roughness: 0.95,
});
const BRIDGE_HOUSING_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#b0b3ac',
  roughness: 0.6,
  metalness: 0.4,
});
const BRIDGE_SUPPORT_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#777d79',
  roughness: 0.5,
  metalness: 0.5,
});

// Shared surface for the untextured outbuilding shells. No albedo map, so each
// call site KEEPS its own `color` - with no map the colour is the albedo and
// resetting it would flatten every shed to the same hue.
const OUTBUILDING_SURFACE = {
  roughness: 0.85,
  normalMap: OUTBUILDING_PANEL_NORMAL,
  normalScale: OUTBUILDING_NORMAL_SCALE,
  roughnessMap: OUTBUILDING_CONCRETE_ROUGHNESS,
} as const;

// ---------------------------------------------------------------------------
// GROUND CONTACT BLOBS
// ---------------------------------------------------------------------------
// ONE module-level unit plane, scaled per instance. `StaticMeshBatch` keys
// instancing on `geometrySignature`, which includes geometry `parameters` but
// NOT the matrix scale, so a shared unit plane collapses every blob in a cell
// into a single InstancedMesh. Writing `<planeGeometry args={[w, h]} />` per
// prop would turn one draw call back into one per blob.
const GROUND_BLOB_GEOMETRY = new THREE.PlaneGeometry(1, 1);

// One shared material as well as one shared geometry: transparent materials are
// rejected by `getInstanceColor`, so blobs can only ever instance (never merge),
// and instancing wants an identical material signature across every blob.
// Built lazily because `CAR_SHADOW_TEXTURE` is declared further down the file.
let groundBlobMaterial: THREE.MeshBasicMaterial | null = null;
const getGroundBlobMaterial = (): THREE.MeshBasicMaterial => {
  if (!groundBlobMaterial) {
    groundBlobMaterial = new THREE.MeshBasicMaterial({
      map: CAR_SHADOW_TEXTURE,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
  }
  return groundBlobMaterial;
};

/**
 * Y datum for contact blobs.
 *
 * Was 0.06, "just above TerrainGround's 0.05 default" - but that default was
 * itself 7 cm off the site's declared ground datum and has been corrected to
 * `SITE_LAYOUT.datum.terrain`. Left at 0.06 these decals would hang 8 cm in the
 * air under every parked car. `groundOverlay` is the layer CLAUDE.md's
 * decision tree already names for a marking on the exterior ground, and it sits
 * 1 cm above both the terrain and the authored asphalt beneath it.
 */
const GROUND_BLOB_Y = EXTERIOR_LAYERS.groundOverlay;

// ---------------------------------------------------------------------------
// GRAVITY WEATHERING
// ---------------------------------------------------------------------------
// `PROCEDURAL_TEXTURES.rust` is generateRustPattern(256, 0.3, 'down') - built
// with a downward streak bias and a real alpha channel (alpha = rust
// intensity, zero where clean), and until now it had no consumer at all.
//
// Deliberately a decal quad and NOT an `onBeforeCompile` injection:
// `StaticMeshBatch.isSupportedMaterial` rejects any material carrying an own
// `onBeforeCompile` or `customProgramCacheKey`, so a shader-based weathering
// layer would evict every wall it touched from batching permanently. Decals
// leave the base materials batch-eligible.
//
// Same instancing discipline as GroundBlob: one module-level unit plane and one
// module-level material, sized through the mesh `scale`. Transparent materials
// can only instance, never merge, so shared geometry is what keeps this cheap.
const GRIME_GEOMETRY = new THREE.PlaneGeometry(1, 1);
const GRIME_MATERIAL = new THREE.MeshBasicMaterial({
  map: PROCEDURAL_TEXTURES.rust,
  transparent: true,
  opacity: 0.28,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: POLYGON_OFFSET.standard.factor,
  polygonOffsetUnits: POLYGON_OFFSET.standard.units,
});

/**
 * A rain-streak / rust-bleed decal on a vertical surface. Keep one plane per
 * wall face: two overlapping transparent quads on the same wall sort by
 * distance and can flicker against each other. Place only BELOW a horizontal
 * edge where water would actually run - applied uniformly it reads as smeared
 * dirt rather than gravity.
 */
const GrimeStreak: React.FC<{
  position: [number, number, number];
  width: number;
  height: number;
  rotation?: [number, number, number];
}> = React.memo(({ position, width, height, rotation }) => (
  <mesh
    geometry={GRIME_GEOMETRY}
    material={GRIME_MATERIAL}
    position={position}
    rotation={rotation}
    scale={[width, height, 1]}
  />
));
GrimeStreak.displayName = 'GrimeStreak';

/**
 * Soft contact darkening under a static yard prop. The sun shadow frustum does
 * not reach the outer yard (parking lot, tunnel, gas station, lake), and there
 * is no shadow pass at all on `low`, so without this props meet the ground on a
 * hard unshaded seam. Deliberately not the CuteCar y=0.01, which is below the
 * terrain and survives only on its polygonOffset.
 *
 * Overlapping blobs double-darken (alpha over alpha), so keep neighbours at
 * least one radius apart, and keep them away from the displaced terrain within
 * ~20 units of the river canyon at z=-145 where a flat quad would clip.
 */
const GroundBlob: React.FC<{
  /** Ground-plane centre; Y is fixed to the blob datum. */
  position: [number, number];
  /** World-space diameter along X. */
  scale: number;
  /** World-space diameter along Z; defaults to `scale`. */
  scaleZ?: number;
  /** Override for props standing on their own foundation slab. */
  y?: number;
}> = React.memo(({ position, scale, scaleZ, y = GROUND_BLOB_Y }) => (
  <mesh
    geometry={GROUND_BLOB_GEOMETRY}
    material={getGroundBlobMaterial()}
    position={[position[0], y, position[1]]}
    rotation={[-Math.PI / 2, 0, 0]}
    scale={[scale, scaleZ ?? scale, 1]}
    renderOrder={RENDER_ORDER.floorEffects}
  />
));
GroundBlob.displayName = 'GroundBlob';

// Simple low-poly tree component
// Foliage: irregular icosahedron clusters merged into ONE geometry per variant
// (module-level, shared with the instanced parkland trees — single source in
// ExteriorVegetation.tsx) so each tree costs 2 draw calls (trunk + canopy).
const SimpleTree: React.FC<{ position: [number, number, number]; scale?: number }> = React.memo(
  ({ position, scale = 1 }) => {
    // Deterministic per-tree variant, rotation and scale jitter from position hash
    const { variant, rotY, jitter } = useMemo(() => treeJitterFromPosition(position), [position]);
    const quality = useGraphicsStore((state) => state.graphics.quality);
    const groundPosition = useMemo(
      () => groundedTreePosition(position, quality),
      [position, quality]
    );

    return (
      <group
        name="tree-single"
        position={groundPosition}
        scale={scale * jitter}
        rotation={[0, rotY, 0]}
      >
        {/* Trunk - the same designed bole the instanced parkland trees use.
            This was an inline `cylinderGeometry args={[0.3, 0.4, 3, 6]}`, so
            these six individually-placed trees kept a straight 6-sided cone
            while the 24 instanced ones got a root flare and a knee. Sharing the
            geometry rather than copying its numbers keeps the two paths from
            drifting apart again; it arrives pre-translated with its base at
            y = 0, so the mesh no longer carries the +1.5 offset. */}
        <GeneratedSurfaceMesh
          asset="parkTrunkUnit"
          geometry={SHARED_TREE_TRUNK}
          material={TREE_MATERIALS.trunk}
          castShadow
        />
        <mesh
          geometry={TREE_BRANCH_GEOMETRY}
          material={TREE_MATERIALS.trunk}
          castShadow
          receiveShadow
        />
        {/* Canopy - merged icosahedron cluster, single draw call */}
        <GeneratedSurfaceMesh
          asset={
            (['parkCanopyZeroUnit', 'parkCanopyOneUnit', 'parkCanopyTwoUnit'] as const)[variant]
          }
          geometry={TREE_FOLIAGE_VARIANTS[variant]}
          material={TREE_FOLIAGE_MATERIALS[variant]}
          castShadow
        />
      </group>
    );
  }
);

// Simple park bench
const ParkBench: React.FC<{ position: [number, number, number]; rotation?: number }> = React.memo(
  ({ position, rotation = 0 }) => (
    <group position={position} rotation={[0, rotation, 0]}>
      <GeneratedBoundary
        fallback={
          <group>
            {/* Seat */}
            <mesh position={[0, 0.45, 0]} castShadow>
              <boxGeometry args={[1.8, 0.1, 0.5]} />
              <meshStandardMaterial color="#8d6e63" roughness={0.7} />
            </mesh>
            {/* Backrest */}
            <mesh position={[0, 0.75, -0.2]} rotation={[0.2, 0, 0]} castShadow>
              <boxGeometry args={[1.8, 0.5, 0.08]} />
              <meshStandardMaterial color="#8d6e63" roughness={0.7} />
            </mesh>
            {/* Legs */}
            {[-0.7, 0.7].map((x, i) => (
              <mesh key={i} position={[x, 0.22, 0]} castShadow>
                <boxGeometry args={[0.1, 0.45, 0.4]} />
                <meshStandardMaterial color="#424242" roughness={0.6} metalness={0.3} />
              </mesh>
            ))}
          </group>
        }
      >
        <GeneratedModel asset="parkBench" />
      </GeneratedBoundary>
    </group>
  )
);

// Small office building - module-level shared materials (procedural stucco walls)
const officeWallColor = PROCEDURAL_TEXTURES.stuccoColor.clone();
const officeWallNormal = PROCEDURAL_TEXTURES.stuccoNormal.clone();
officeWallColor.wrapS = officeWallColor.wrapT = THREE.RepeatWrapping;
officeWallNormal.wrapS = officeWallNormal.wrapT = THREE.RepeatWrapping;
officeWallColor.repeat.set(3, 2);
officeWallNormal.repeat.set(3, 2);

const OFFICE_MATERIALS = {
  wall: new THREE.MeshStandardMaterial({
    color: '#8fa3ad',
    roughness: 0.8,
    map: officeWallColor,
    normalMap: officeWallNormal,
    normalScale: new THREE.Vector2(0.3, 0.3),
  }),
  trim: new THREE.MeshStandardMaterial({ color: '#546e7a', roughness: 0.6 }),
  frame: new THREE.MeshStandardMaterial({ color: '#37474f', roughness: 0.5, metalness: 0.4 }),
  glassDay: new THREE.MeshStandardMaterial({ color: '#90caf9', metalness: 0.3, roughness: 0.15 }),
  glassNight: new THREE.MeshStandardMaterial({
    color: '#ffd28a',
    emissive: '#ffb74d',
    emissiveIntensity: 0.9,
    roughness: 0.3,
  }),
  hvac: new THREE.MeshStandardMaterial({ color: '#9e9e9e', roughness: 0.5, metalness: 0.5 }),
  door: new THREE.MeshStandardMaterial({ color: '#5d4037', roughness: 0.8 }),
};

// Inset window with thin frame; glass sits behind the frame so it reads recessed
const OfficeWindow: React.FC<{
  position: [number, number, number];
  lit: boolean;
  width?: number;
  height?: number;
}> = React.memo(({ position, lit, width = 2, height = 2.5 }) => (
  <group position={position}>
    {/* Frame - top/bottom/left/right, slightly proud of the wall */}
    <mesh position={[0, height / 2, 0.06]} material={OFFICE_MATERIALS.frame}>
      <boxGeometry args={[width + 0.12, 0.1, 0.1]} />
    </mesh>
    <mesh position={[0, -height / 2, 0.06]} material={OFFICE_MATERIALS.frame}>
      <boxGeometry args={[width + 0.12, 0.1, 0.1]} />
    </mesh>
    <mesh position={[-width / 2, 0, 0.06]} material={OFFICE_MATERIALS.frame}>
      <boxGeometry args={[0.1, height + 0.12, 0.1]} />
    </mesh>
    <mesh position={[width / 2, 0, 0.06]} material={OFFICE_MATERIALS.frame}>
      <boxGeometry args={[0.1, height + 0.12, 0.1]} />
    </mesh>
    {/* Glass - recessed behind the frame */}
    <mesh
      position={[0, 0, 0.02]}
      material={lit ? OFFICE_MATERIALS.glassNight : OFFICE_MATERIALS.glassDay}
      userData={{ dynamic: true }}
    >
      <planeGeometry args={[width, height]} />
    </mesh>
  </group>
));
OfficeWindow.displayName = 'OfficeWindow';

export const SmallOffice: React.FC<{
  position: [number, number, number];
  size?: [number, number, number];
  rotation?: number;
}> = React.memo(({ position, size = [12, 8, 10], rotation = 0 }) => {
  const isNight = useGameSimulationStore(
    useShallow((state) => state.gameTime >= 20 || state.gameTime < 6)
  );

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <GeneratedBoundary
        fallback={
          <group>
            {' '}
            {/* Main building - procedural stucco walls */}
            <mesh
              position={[0, size[1] / 2, 0]}
              castShadow
              receiveShadow
              material={OFFICE_MATERIALS.wall}
            >
              <boxGeometry args={[size[0], size[1], size[2]]} />
            </mesh>
            {/* Roof slab */}
            <mesh position={[0, size[1] + 0.15, 0]} castShadow material={OFFICE_MATERIALS.trim}>
              <boxGeometry args={[size[0] + 0.3, 0.3, size[2] + 0.3]} />
            </mesh>
            {/* Parapet - four low walls around the roof edge */}
            <mesh
              position={[0, size[1] + 0.55, size[2] / 2 + 0.1]}
              castShadow
              material={OFFICE_MATERIALS.trim}
            >
              <boxGeometry args={[size[0] + 0.5, 0.5, 0.15]} />
            </mesh>
            <mesh
              position={[0, size[1] + 0.55, -(size[2] / 2 + 0.1)]}
              castShadow
              material={OFFICE_MATERIALS.trim}
            >
              <boxGeometry args={[size[0] + 0.5, 0.5, 0.15]} />
            </mesh>
            <mesh
              position={[size[0] / 2 + 0.1, size[1] + 0.55, 0]}
              castShadow
              material={OFFICE_MATERIALS.trim}
            >
              <boxGeometry args={[0.15, 0.5, size[2] + 0.5]} />
            </mesh>
            <mesh
              position={[-(size[0] / 2 + 0.1), size[1] + 0.55, 0]}
              castShadow
              material={OFFICE_MATERIALS.trim}
            >
              <boxGeometry args={[0.15, 0.5, size[2] + 0.5]} />
            </mesh>
            {/* Rooftop HVAC unit */}
            <group position={[size[0] / 5, size[1] + 0.75, -size[2] / 6]}>
              <mesh castShadow material={OFFICE_MATERIALS.hvac}>
                <boxGeometry args={[2, 0.9, 1.4]} />
              </mesh>
              {/* Fan grille on top */}
              <mesh
                position={[0, 0.47, 0]}
                rotation={[-Math.PI / 2, 0, 0]}
                material={OFFICE_MATERIALS.frame}
              >
                <circleGeometry args={[0.5, 12]} />
              </mesh>
            </group>
            {/* Windows - front (raised to avoid overlap with door); middle bay dark for variety */}
            {[-3, 0, 3].map((x, i) => (
              <OfficeWindow
                key={`front-${i}`}
                position={[x, size[1] / 2 + 0.8, size[2] / 2 + 0.01]}
                lit={isNight && i !== 1}
              />
            ))}
            {/* Door with frame */}
            <mesh position={[0, 1.2, size[2] / 2 + 0.02]} material={OFFICE_MATERIALS.door}>
              <planeGeometry args={[1.5, 2.4]} />
            </mesh>
            <mesh position={[0, 2.45, size[2] / 2 + 0.05]} material={OFFICE_MATERIALS.frame}>
              <boxGeometry args={[1.7, 0.1, 0.08]} />
            </mesh>
          </group>
        }
      >
        <group scale={[size[0] / 14, size[1] / 7, size[2] / 10]}>
          <GeneratedOfficeModel isNight={isNight} />
        </group>
      </GeneratedBoundary>
    </group>
  );
});
SmallOffice.displayName = 'SmallOffice';

// Nissen hut - semi-cylindrical corrugated building
const NissenHut: React.FC<{
  position: readonly [number, number, number];
  length?: number;
  rotation?: number;
}> = ({ position, length = 12, rotation = 0 }) => {
  const radius = 2.5;

  // Create semi-circular arc shape for extrusion
  const arcShape = useMemo(() => {
    const shape = new THREE.Shape();
    // Start at bottom-left of the semicircle
    shape.moveTo(-radius, 0);
    // Draw arc from left to right (bottom half of circle, which curves UP when viewed)
    shape.absarc(0, 0, radius, Math.PI, 0, true); // counterclockwise from PI to 0
    shape.lineTo(-radius, 0); // close the shape
    return shape;
  }, [radius]);

  const extrudeSettings = useMemo(
    () => ({
      steps: 1,
      depth: length,
      bevelEnabled: false,
    }),
    [length]
  );

  return (
    <group position={[position[0], position[1], position[2]]} rotation={[0, rotation, 0]}>
      <GeneratedBoundary
        fallback={
          <group>
            {/* Semi-cylindrical roof/walls - corrugated iron using ExtrudeGeometry */}
            <mesh position={[0, 0, -length / 2]} castShadow receiveShadow>
              <extrudeGeometry args={[arcShape, extrudeSettings]} />
              <meshStandardMaterial
                color="#6b7280"
                roughness={0.7}
                metalness={0.4}
                side={THREE.DoubleSide}
              />
            </mesh>

            {/* End walls - semi-circular caps matching the cylinder cross-section */}
            {[-length / 2, length / 2].map((z, i) => (
              <group key={`end-${i}`} position={[0, 0, z]}>
                {/* Semi-circular end wall - rotated to face outward */}
                <mesh rotation={[0, i === 0 ? Math.PI : 0, 0]} castShadow receiveShadow>
                  <circleGeometry args={[radius, 16, 0, Math.PI]} />
                  <meshStandardMaterial color="#5a6268" roughness={0.8} side={THREE.DoubleSide} />
                </mesh>
                {/* Door on front end only */}
                {i === 0 && (
                  <mesh position={[0, 1, -0.05]} rotation={[0, Math.PI, 0]}>
                    <planeGeometry args={[1.5, 2]} />
                    <meshStandardMaterial color="#3e2723" roughness={0.9} />
                  </mesh>
                )}
              </group>
            ))}

            {/* Foundation/base */}
            <mesh position={[0, 0.1, 0]} receiveShadow>
              <boxGeometry args={[radius * 2 + 0.2, 0.2, length + 0.4]} />
              <meshStandardMaterial color="#4a4a4a" roughness={0.9} />
            </mesh>
          </group>
        }
      >
        <group scale={[1, 1, (length + 0.4) / 12.4]}>
          <GeneratedModel asset="nissenHut" />
          {/* Tripo mirrored the front door onto the rear. Retain the authored
              closed rear wall; 6.16 m clears the measured 6.1515 m door relief. */}
          <mesh position={[0, 0, 6.16]} castShadow receiveShadow>
            <circleGeometry args={[2.5, 48, 0, Math.PI]} />
            <meshStandardMaterial color="#5a6268" roughness={0.8} />
          </mesh>
        </group>
      </GeneratedBoundary>
    </group>
  );
};

// Office apartment building - multi-story
const OfficeApartment: React.FC<{
  position: [number, number, number];
  floors?: number;
  rotation?: number;
}> = ({ position, floors = 4, rotation = 0 }) => {
  const floorHeight = 3.5;
  const buildingHeight = floors * floorHeight;
  const width = 16;
  const depth = 12;

  const primitiveBuilding = (
    <group>
      {' '}
      {/* Main building structure */}
      <mesh position={[0, buildingHeight / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, buildingHeight, depth]} />
        <meshStandardMaterial color="#8d9db6" roughness={0.7} />
      </mesh>
      {/* Floor bands */}
      {Array.from({ length: floors }).map((_, floor) => (
        <mesh key={`band-${floor}`} position={[0, floor * floorHeight + floorHeight - 0.1, 0]}>
          <boxGeometry args={[width + 0.2, 0.2, depth + 0.2]} />
          <meshStandardMaterial color="#667292" roughness={0.6} />
        </mesh>
      ))}
      {/* Windows - front and back */}
      {Array.from({ length: floors }).map((_, floor) =>
        [-5, -1.5, 1.5, 5].map((x, winIdx) => (
          <React.Fragment key={`win-${floor}-${winIdx}`}>
            {/* Front window */}
            <mesh position={[x, floor * floorHeight + floorHeight / 2 + 0.5, depth / 2 + 0.05]}>
              <planeGeometry args={[2.2, 2]} />
              <meshStandardMaterial color="#87ceeb" metalness={0.3} roughness={0.2} />
            </mesh>
            {/* Back window */}
            <mesh
              position={[x, floor * floorHeight + floorHeight / 2 + 0.5, -depth / 2 - 0.05]}
              rotation={[0, Math.PI, 0]}
            >
              <planeGeometry args={[2.2, 2]} />
              <meshStandardMaterial color="#87ceeb" metalness={0.3} roughness={0.2} />
            </mesh>
          </React.Fragment>
        ))
      )}
      {/* Side windows */}
      {Array.from({ length: floors }).map((_, floor) =>
        [-3, 0, 3].map((z, winIdx) => (
          <React.Fragment key={`side-win-${floor}-${winIdx}`}>
            {/* Left side */}
            <mesh
              position={[-width / 2 - 0.05, floor * floorHeight + floorHeight / 2 + 0.5, z]}
              rotation={[0, -Math.PI / 2, 0]}
            >
              <planeGeometry args={[2, 2]} />
              <meshStandardMaterial color="#87ceeb" metalness={0.3} roughness={0.2} />
            </mesh>
            {/* Right side */}
            <mesh
              position={[width / 2 + 0.05, floor * floorHeight + floorHeight / 2 + 0.5, z]}
              rotation={[0, Math.PI / 2, 0]}
            >
              <planeGeometry args={[2, 2]} />
              <meshStandardMaterial color="#87ceeb" metalness={0.3} roughness={0.2} />
            </mesh>
          </React.Fragment>
        ))
      )}
      {/* Main entrance */}
      <group position={[0, 0, depth / 2]}>
        {/* Entrance canopy */}
        <mesh position={[0, 3, 1.5]} castShadow>
          <boxGeometry args={[5, 0.3, 3]} />
          <meshStandardMaterial color="#546e7a" roughness={0.5} />
        </mesh>
        {/* Entrance columns */}
        {[-2, 2].map((x, i) => (
          <mesh key={`col-${i}`} position={[x, 1.5, 2.5]} castShadow>
            <cylinderGeometry args={[0.2, 0.2, 3, 8]} />
            <meshStandardMaterial color="#78909c" roughness={0.5} />
          </mesh>
        ))}
        {/* Glass doors */}
        <mesh position={[0, 1.3, 0.1]}>
          <planeGeometry args={[3, 2.6]} />
          <meshStandardMaterial color="#64b5f6" metalness={0.4} roughness={0.1} />
        </mesh>
      </group>
      {/* Roof structure */}
      <mesh position={[0, buildingHeight + 0.3, 0]} castShadow>
        <boxGeometry args={[width + 0.5, 0.6, depth + 0.5]} />
        <meshStandardMaterial color="#546e7a" roughness={0.6} />
      </mesh>
      {/* Roof equipment */}
      <mesh position={[-4, buildingHeight + 1.2, 0]} castShadow>
        <boxGeometry args={[3, 1.8, 4]} />
        <meshStandardMaterial color="#757575" roughness={0.7} />
      </mesh>
      <mesh position={[4, buildingHeight + 0.8, 2]} castShadow>
        <boxGeometry args={[2, 1, 2]} />
        <meshStandardMaterial color="#616161" roughness={0.7} />
      </mesh>
    </group>
  );
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <GeneratedBoundary fallback={primitiveBuilding}>
        {floors === 4 || floors === 3 ? (
          <group position={[0, 0, 1.25]}>
            <GeneratedModel asset={floors === 4 ? 'officeApartment' : 'officeApartmentThree'} />
          </group>
        ) : (
          primitiveBuilding
        )}
      </GeneratedBoundary>
    </group>
  );
};

// Perimeter fence section - optimized with InstancedMesh
const FenceSection: React.FC<{
  start: [number, number, number];
  end: [number, number, number];
  postSpacing?: number;
}> = React.memo(({ start, end, postSpacing = 8 }) => {
  const dx = end[0] - start[0];
  const dz = end[2] - start[2];
  const length = Math.sqrt(dx * dx + dz * dz);
  const angle = Math.atan2(dx, dz);
  const postCount = Math.floor(length / postSpacing) + 1;
  const meshRef = useRef<THREE.InstancedMesh>(null);

  // Memoize post positions
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Layout effect + explicit bounds: three caches an InstancedMesh's bounding
  // sphere the first time it is frustum-tested and never invalidates it, so a
  // sphere built from identity matrices would cull the posts wrongly.
  useLayoutEffect(() => {
    if (!meshRef.current) return;

    for (let i = 0; i < postCount; i++) {
      const t = postCount > 1 ? i / (postCount - 1) : 0;
      dummy.position.set(start[0] + dx * t, 1.2, start[2] + dz * t);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
    meshRef.current.computeBoundingBox();
    meshRef.current.computeBoundingSphere();
  }, [postCount, start, dx, dz, dummy]);

  return (
    <group name="factory-exterior-content">
      {/* Fence posts - instanced */}
      <instancedMesh ref={meshRef} args={[undefined, undefined, postCount]} castShadow>
        <primitive object={FENCE_POST_GEOMETRY} attach="geometry" />
        <meshStandardMaterial {...FENCE_POST_SURFACE} />
        <GeneratedBoundary fallback={null}>
          <GeneratedGeometrySurface
            asset="fencePostUnit"
            fitEnvelope
            original={FENCE_POST_GEOMETRY}
            meshRef={meshRef}
          />
        </GeneratedBoundary>
      </instancedMesh>

      {/* Horizontal rails */}
      <group
        position={[(start[0] + end[0]) / 2, 0, (start[2] + end[2]) / 2]}
        rotation={[0, -angle, 0]}
      >
        {/* Rails thickened 0.08 -> 0.11: at 190 units of run the old section
            was sub-pixel from any exterior camera and the fence read as three
            aliasing hairlines rather than a structure. */}
        {/* Top rail */}
        <GeneratedBoxSurface
          asset="fenceRailUnit"
          size={[0.11, 0.11, length]}
          material={FENCE_RAIL_MATERIAL}
          position={[0, 2.2, 0]}
          castShadow
        />
        {/* Middle rail */}
        <GeneratedBoxSurface
          asset="fenceRailUnit"
          size={[0.11, 0.11, length]}
          material={FENCE_RAIL_MATERIAL}
          position={[0, 1.2, 0]}
          castShadow
        />
        {/* Bottom rail */}
        <GeneratedBoxSurface
          asset="fenceRailUnit"
          size={[0.11, 0.11, length]}
          material={FENCE_RAIL_MATERIAL}
          position={[0, 0.4, 0]}
          castShadow
        />
      </group>
    </group>
  );
});

// Water colors
const WATER_COLORS = {
  deep: '#173f4a', // Deep blue-green water
  shallow: '#2d6670', // Mineral-rich shallows
  surface: '#6d989e', // Muted sky reflection
  edge: '#1d3c42', // Wet bank transition
  pond: '#2b6871', // Decorative pond water
};

// The former `WATER_DEPTH_MATERIALS` pair is gone. Every consumer painted a
// full-footprint MeshStandardMaterial plane a few centimetres BENEATH an
// opaque (`transparent: false`, `gl_FragColor.a = 1.0`) water surface of the
// same outline and the same rotation, at a lower `renderOrder`, so it was
// rasterised first and then completely overdrawn: one wasted draw call and one
// wasted full-lit PBR fill each, now with four point lights, a shadowed sun and
// an IBL lookup per fragment. Removing them also closes a latent artefact - the
// water vertex shader displaces +/-0.035 in Y, which is larger than the 0.03
// gap the pond left, so wave troughs cut through and flashed the plane. That is
// exactly the failure the `Lake` comment below records as already fixed by
// deleting its own equivalent disc.

const waterMaterials = new Set<THREE.ShaderMaterial>();
const DEFAULT_WATER_FLOW = [0.25, 1] as const;

// Sky palette for the water's analytic reflection. Two stops plus a twilight
// push is enough: the reflection is a broad, low-frequency term and a real
// probe would cost a render target this budget does not have.
const WATER_ZENITH_DAY = new THREE.Color('#3f7fd0');
const WATER_ZENITH_NIGHT = new THREE.Color('#0a1024');
const WATER_HORIZON_DAY = new THREE.Color('#cfe3f2');
const WATER_HORIZON_NIGHT = new THREE.Color('#141c2e');
const WATER_HORIZON_TWILIGHT = new THREE.Color('#e0995c');
const WATER_OVERCAST = new THREE.Color('#9aa7b0');
const WATER_SUN_TINT = new THREE.Color('#fff2d5');
// useFrame scratch - never allocate per frame.
const _waterZenith = new THREE.Color();
const _waterHorizon = new THREE.Color();
const _waterSun = new THREE.Color();
const _waterCelestial = createCelestialState();
const _waterAtmosphere = createAtmosphereState();

const WaterAnimationManager: React.FC = () => {
  useFrame(() => {
    const { gameDay, gameTime, weather, isTabVisible } = useGameSimulationStore.getState();
    if (!isTabVisible) return;
    if (waterMaterials.size === 0) return;
    const atmosphere = sampleAtmosphere(gameDay, gameTime, weather, _waterAtmosphere);
    const celestial = sampleCelestial(atmosphere, _waterCelestial);
    const daylight = atmosphere.daylight * atmosphere.lightMultiplier;
    const time = atmosphere.simulationMinutes * 0.38;

    _waterZenith.copy(WATER_ZENITH_NIGHT).lerp(WATER_ZENITH_DAY, daylight);
    _waterHorizon.copy(WATER_HORIZON_NIGHT).lerp(WATER_HORIZON_DAY, daylight);
    _waterHorizon.lerp(WATER_HORIZON_TWILIGHT, Math.min(1, atmosphere.twilight) * 0.55);
    // Cloud cover flattens both stops toward a grey overcast dome.
    const overcast = atmosphere.cloudCoverage * 0.7;
    _waterZenith.lerp(WATER_OVERCAST, overcast);
    _waterHorizon.lerp(WATER_OVERCAST, overcast);
    _waterSun.copy(WATER_SUN_TINT).multiplyScalar(celestial.sunOpacity * (0.35 + daylight * 0.65));

    waterMaterials.forEach((material) => {
      const uniforms = material.uniforms;
      uniforms.uTime.value = time;
      uniforms.uWetness.value = atmosphere.wetness;
      uniforms.uPrecipitation.value = atmosphere.precipitation;
      uniforms.uWind.value = atmosphere.wind;
      uniforms.uDaylight.value = daylight;
      uniforms.uSkyZenith.value.copy(_waterZenith);
      uniforms.uSkyHorizon.value.copy(_waterHorizon);
      uniforms.uSunColour.value.copy(_waterSun);
      uniforms.uSunDirection.value.set(
        celestial.sunDirection[0],
        celestial.sunDirection[1],
        celestial.sunDirection[2]
      );
    });
  });
  return null;
};

interface UnifiedWaterSurfaceMaterialProps {
  deep?: string;
  shallow?: string;
  reflection?: string;
  flowSpeed?: number;
  flowDirection?: readonly [number, number];
  opacity?: number;
  radial?: boolean;
  /**
   * Measure shore distance ACROSS the flow only. A river or canal is authored
   * as a run of separate plane segments, so a four-sided edge distance puts a
   * full-strength foam band 1-2 units in from every segment END - a ladder of
   * bright transverse bars down the watercourse, doubled where the 0.5-unit
   * segment overlaps stack. Lakes and ponds are `radial` and unaffected.
   */
  crossOnly?: boolean;
}

const UnifiedWaterSurfaceMaterial: React.FC<UnifiedWaterSurfaceMaterialProps> = ({
  deep = '#153747',
  shallow = '#3f7f8c',
  reflection = '#b9dce3',
  flowSpeed = 0.25,
  flowDirection = DEFAULT_WATER_FLOW,
  opacity = 0.88,
  radial = false,
  crossOnly = false,
}) => {
  const flowX = flowDirection[0];
  const flowY = flowDirection[1];
  const material = useMemo(() => {
    const direction = new THREE.Vector2(flowX, flowY);
    if (direction.lengthSq() < 0.0001) direction.set(0, 1);
    direction.normalize();
    const crossFlow = new THREE.Vector2(-direction.y, direction.x);
    // The three ripple axes are constant for the life of the material. They
    // used to be `normalize()`d once PER FRAGMENT; hoisting them to uniforms is
    // bit-identical output for three fewer inverse square roots per pixel.
    const rippleA = crossFlow.clone().multiplyScalar(0.16).add(direction).normalize();
    const rippleB = crossFlow.clone().multiplyScalar(-0.31).add(direction).normalize();
    const rippleC = crossFlow.clone().multiplyScalar(0.48).add(direction).normalize();
    const value = new THREE.ShaderMaterial({
      name: 'MillOS Unified Water Surface',
      uniforms: {
        uTime: { value: 0 },
        uDeep: { value: new THREE.Color(deep) },
        uShallow: { value: new THREE.Color(shallow) },
        uReflection: { value: new THREE.Color(reflection) },
        uFlowDirection: { value: direction },
        uCrossFlow: { value: crossFlow },
        uRippleA: { value: rippleA },
        uRippleB: { value: rippleB },
        uRippleC: { value: rippleC },
        uFlowSpeed: { value: flowSpeed },
        uOpacity: { value: opacity },
        uRadial: { value: radial ? 1 : 0 },
        uCrossOnly: { value: crossOnly ? 1 : 0 },
        uWetness: { value: 0 },
        uPrecipitation: { value: 0 },
        uWind: { value: 0.2 },
        uDaylight: { value: 1 },
        uSkyZenith: { value: WATER_ZENITH_DAY.clone() },
        uSkyHorizon: { value: WATER_HORIZON_DAY.clone() },
        uSunColour: { value: WATER_SUN_TINT.clone() },
        uSunDirection: { value: new THREE.Vector3(0.35, 0.86, 0.37) },
        ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      },
      vertexShader: `
        #include <fog_pars_vertex>
        uniform float uTime;
        uniform vec2 uFlowDirection;
        uniform vec2 uCrossFlow;
        uniform float uFlowSpeed;
        uniform float uWind;
        varying vec2 vUv;
        varying float vWave;
        varying vec3 vWorldPosition;
        varying vec3 vWorldNormal;
        void main() {
          vUv = uv;
          vec2 crossFlow = uCrossFlow;
          float along = dot(position.xy, uFlowDirection);
          float across = dot(position.xy, crossFlow);
          float waveA = sin(along * 0.32 + uTime * uFlowSpeed);
          float waveB = cos(across * 0.44 - uTime * uFlowSpeed * 0.71);
          vWave = (waveA + waveB) * 0.5;
          vec2 waveDerivative =
            cos(along * 0.32 + uTime * uFlowSpeed) * 0.32 * uFlowDirection
            - sin(across * 0.44 - uTime * uFlowSpeed * 0.71) * 0.44 * crossFlow;
          float windAmplitude = mix(0.75, 1.45, clamp(uWind, 0.0, 1.0));
          vec2 heightDerivative = waveDerivative * 0.0175 * windAmplitude;
          vec3 displaced = position;
          displaced.z += vWave * 0.035 * windAmplitude;
          vec3 localNormal = normalize(vec3(-heightDerivative.x, -heightDerivative.y, 1.0));
          vWorldNormal = normalize(mat3(modelMatrix) * localNormal);
          vWorldPosition = (modelMatrix * vec4(displaced, 1.0)).xyz;
          vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }
      `,
      fragmentShader: `
        #include <fog_pars_fragment>
        uniform vec3 uDeep;
        uniform vec3 uShallow;
        uniform vec3 uReflection;
        uniform vec2 uRippleA;
        uniform vec2 uRippleB;
        uniform vec2 uRippleC;
        uniform float uTime;
        uniform float uFlowSpeed;
        uniform float uOpacity;
        uniform float uRadial;
        uniform float uCrossOnly;
        uniform float uWetness;
        uniform float uPrecipitation;
        uniform float uDaylight;
        uniform vec3 uSkyZenith;
        uniform vec3 uSkyHorizon;
        uniform vec3 uSunColour;
        uniform vec3 uSunDirection;
        varying vec2 vUv;
        varying float vWave;
        varying vec3 vWorldPosition;
        varying vec3 vWorldNormal;
        void main() {
          vec2 centred = vUv * 2.0 - 1.0;

          // Three travelling wave trains in world space. UV-scaled phases
          // forced every surface to carry the same number of waves, stretching
          // broad white bands across long canals and compressing them on small
          // ponds. World-space wavelengths stay physically consistent and
          // continue seamlessly between neighbouring water meshes.
          vec2 waterCoord = vWorldPosition.xz;
          float phaseA = dot(waterCoord, uRippleA) * 2.05 + uTime * uFlowSpeed * 1.62;
          float phaseC = dot(waterCoord, uRippleC) * 1.35 + uTime * uFlowSpeed * 0.63;
          float rippleA = sin(phaseA);
          float phaseB =
            dot(waterCoord, uRippleB) * 3.10 - uTime * uFlowSpeed * 1.09 + rippleA * 0.48;
          float rippleB = sin(phaseB);
          float rippleC = cos(phaseC);
          vec2 rainTile = fract(vWorldPosition.xz * 0.19) - 0.5;
          float rainDistance = length(rainTile);
          float rainRipple =
            sin(rainDistance * 46.0 - uTime * 2.1) *
            (1.0 - smoothstep(0.08, 0.5, rainDistance)) *
            uPrecipitation;
          float ripples =
            rippleA * 0.54 +
            rippleB * 0.26 +
            rippleC * 0.10 +
            vWave * 0.06 +
            rainRipple * 0.08;

          // DEPTH IS DISTANCE FROM THE BANK, not a UV ramp. The old
          // 0.48 + vUv.y * 0.16 gradient ran across the mesh regardless of
          // where the shore actually was, so one side of every pond read as
          // permanently deeper than the other.
          // planeGeometry maps UV.x across the mesh width, so crossEdge is the
          // cross-stream distance to the bank; boxEdge also counts the two
          // ends, which is what a pond-shaped plane wants and a river does not.
          float crossEdge = min(vUv.x, 1.0 - vUv.x);
          float boxEdge = min(crossEdge, min(vUv.y, 1.0 - vUv.y));
          float linearEdge = mix(boxEdge, crossEdge, uCrossOnly);
          float radialEdge = 1.0 - length(centred);
          float edge = max(mix(linearEdge, radialEdge, uRadial), 0.0);
          float depth = clamp(smoothstep(0.0, 0.34, edge) + ripples * 0.045, 0.0, 1.0);
          vec3 colour = mix(uShallow, uDeep, depth);

          // Micro-relief from the analytic derivatives of the same three wave
          // trains. The vertex stage carries the long swell; this is the
          // centimetre chop that makes the reflection break up. No texture
          // fetch, no second pass - purely ALU, which is the budget we have.
          vec2 slope =
            cos(phaseA) * 2.05 * 0.0180 * uRippleA
            + cos(phaseB) * 3.10 * 0.0085 * uRippleB
            - sin(phaseC) * 1.35 * 0.0140 * uRippleC;
          vec3 normal = normalize(
            vWorldNormal + vec3(slope.x + rainRipple * 0.018, 0.0, slope.y - rainRipple * 0.018)
          );

          vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
          float fresnel = pow(1.0 - max(dot(normal, viewDirection), 0.0), 4.0);

          // Reflection without a render target: bounce the view ray off the
          // perturbed normal and read a two-stop analytic sky whose colours are
          // pushed every frame from the same atmosphere sample that drives the
          // real sky, sun and fog.
          vec3 reflected = reflect(-viewDirection, normal);
          vec3 skyColour = mix(uSkyHorizon, uSkyZenith, sqrt(clamp(reflected.y, 0.0, 1.0)));
          vec3 reflectionColour = mix(uReflection, skyColour, 0.75);
          float reflectance = clamp(0.03 + fresnel * 0.72, 0.0, 0.85);
          colour = mix(colour, reflectionColour, reflectance);

          // Specular sun: a tight glitter lobe plus a broad sheen. Both are
          // tone-mapped with the rest of the frame (this shader runs
          // <tonemapping_fragment>), so they roll off on the no-composer path
          // instead of clipping to a flat white blob.
          float sunAlignment = max(dot(reflected, uSunDirection), 0.0);
          float glitter = pow(sunAlignment, 160.0) * 1.6 + pow(sunAlignment, 24.0) * 0.10;
          colour += uSunColour * glitter * uDaylight;

          float crestSignal = rippleA * 0.7 + rippleB * 0.22 + rippleC * 0.08;
          float crest = smoothstep(0.78, 1.0, crestSignal);
          colour = mix(colour, uReflection, crest * (0.025 + 0.035 * uDaylight));

          // Shore foam that breathes with the swell rather than a static rim,
          // with a finer lace line right on the waterline.
          float swell = sin(uTime * uFlowSpeed * 0.9 + crestSignal * 1.7) * 0.5 + 0.5;
          float foamBand = 1.0 - smoothstep(0.0, 0.055 + swell * 0.030, edge);
          float lace = smoothstep(0.45, 1.0, foamBand) * (0.55 + 0.45 * rippleB);
          vec3 foamColour = mix(vec3(0.72, 0.82, 0.83), uReflection, 0.35);
          colour = mix(colour, foamColour, clamp(foamBand * 0.42 + lace * 0.30, 0.0, 0.85));

          // Damp margin so the bank mesh and the water meet on a wet
          // transition rather than a cut edge.
          float shore = smoothstep(0.0, 0.03, edge);
          colour = mix(vec3(0.16, 0.26, 0.26), colour, shore);

          colour = mix(uDeep * 0.92, colour, clamp(uOpacity, 0.0, 1.0));
          // Unlit shader: without this the water stayed full daylight blue at
          // midnight while every lit surface around it went dark.
          colour *= mix(0.42, 1.0, clamp(uDaylight + uWetness * 0.08, 0.0, 1.0));

          gl_FragColor = vec4(colour, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }
      `,
      // Opt in to scene fog. Without it the lake, river and canals stayed clear
      // and saturated while every bank around them hazed out with distance.
      fog: true,
      transparent: false,
      depthWrite: true,
      // DoubleSide retained. A flat ground quad has no backfacing triangles
      // seen from above, so FrontSide would cull nothing - while
      // the river sits at its declared level inside the terrain channel, where a
      // first-person eye on the canyon floor would be BELOW the surface and
      // the water would simply vanish. No gain, real risk.
      side: THREE.DoubleSide,
    });
    // MANUALLY VERSIONED, never derived from time or randomness - see the
    // documented `Date.now()` cache-key bug. Bump this whenever the shader
    // source above changes or a stale cached program will be reused.
    value.customProgramCacheKey = () => 'millos-unified-water-v9';
    return value;
  }, [crossOnly, deep, flowSpeed, flowX, flowY, opacity, radial, reflection, shallow]);

  useEffect(() => {
    waterMaterials.add(material);
    return () => {
      waterMaterials.delete(material);
      material.dispose();
    };
  }, [material]);

  return <primitive object={material} attach="material" />;
};

// Still canal water surface - shiny reflective without animation
const StillCanalWater: React.FC<{
  width: number;
  length: number;
  position?: [number, number, number];
}> = ({ width, length, position = [0, 0, 0] }) => {
  // CRITICAL: Guard against NaN/zero dimensions to prevent PlaneGeometry errors
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 10;
  const safeLength = Number.isFinite(length) && length > 0 ? length : 10;

  // KEPT AT 0.15. Not terrain clearance any more - the terrain datum is -0.02 -
  // but the canal's own stack: the towpath sits at `EXTERIOR_LAYERS.ground`
  // beside the walls, and this surface has to read as water held between banks
  // rather than a film lying on them.
  const waterY = 0.15;

  return (
    <group>
      {/* No depth plane: it sat 0.04 below an opaque surface of identical
          outline and was overdrawn every frame. See the note above the
          `waterMaterials` set. */}
      <mesh
        position={[position[0], waterY, position[2]]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        renderOrder={RENDER_ORDER.waterSurface}
      >
        <planeGeometry args={[safeWidth, safeLength]} />
        <UnifiedWaterSurfaceMaterial
          deep={WATER_COLORS.deep}
          shallow={WATER_COLORS.shallow}
          reflection="#86aeb5"
          flowSpeed={0.12}
          opacity={0.9}
          crossOnly
        />
      </mesh>
    </group>
  );
};

// Industrial Canal component - straight waterway with stone walls
const Canal: React.FC<{
  position: readonly [number, number, number];
  length: number;
  width: number;
  rotation?: number;
}> = ({ position, length, width, rotation = 0 }) => {
  // CRITICAL: Guard against NaN/zero dimensions to prevent PlaneGeometry errors
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 12;
  const safeLength = Number.isFinite(length) && length > 0 ? length : 10;

  return (
    <group position={[position[0], position[1], position[2]]} rotation={[0, rotation, 0]}>
      {/* Still shiny water surface for canal */}
      <StillCanalWater width={safeWidth - 1} length={safeLength} position={[0, -0.15, 0]} />
      {/* No bed or depth-wash planes: the canal water is opaque and meets the
          wall faces edge to edge, so from above anything below it was overdrawn
          every frame. */}
      {/* Left canal wall */}
      <mesh position={[-safeWidth / 2, 0.3, 0]} castShadow receiveShadow>
        <boxGeometry args={[1, 1.5, safeLength]} />
        <meshStandardMaterial
          color="#ffffff"
          map={CANAL_WALL_MAP}
          roughnessMap={CANAL_WALL_ROUGHNESS}
          normalMap={CANAL_WALL_NORMAL}
          normalScale={CANAL_WALL_NORMAL_SCALE}
          roughness={0.9}
        />
      </mesh>
      {/* Right canal wall */}
      <mesh position={[safeWidth / 2, 0.3, 0]} castShadow receiveShadow>
        <boxGeometry args={[1, 1.5, safeLength]} />
        <meshStandardMaterial
          color="#ffffff"
          map={CANAL_WALL_MAP}
          roughnessMap={CANAL_WALL_ROUGHNESS}
          normalMap={CANAL_WALL_NORMAL}
          normalScale={CANAL_WALL_NORMAL_SCALE}
          roughness={0.9}
        />
      </mesh>
      {/* Towpath along the left bank. Sits on the site's ground datum with the
          `exteriorTop` offset holding it above the terrain, per CLAUDE.md's
          exterior stack - it used to be lifted to 0.08 to clear
          `TerrainGround`'s old 0.05 default, which now floats it 10 cm. */}
      <mesh
        position={[-safeWidth / 2 - 2, EXTERIOR_LAYERS.ground, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[3, safeLength]} />
        <meshStandardMaterial
          color="#ffffff"
          map={TOWPATH_MAP}
          roughnessMap={TOWPATH_ROUGHNESS}
          roughness={0.9}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET.exteriorTop.factor}
          polygonOffsetUnits={POLYGON_OFFSET.exteriorTop.units}
        />
      </mesh>
      {/* Mooring posts */}
      {[-safeLength / 3, 0, safeLength / 3].map((z, i) => (
        <mesh key={`mooring-${i}`} position={[-safeWidth / 2 - 0.3, 0.8, z]} castShadow>
          <cylinderGeometry args={[0.15, 0.15, 1.5, 8]} />
          <meshStandardMaterial color="#3d2d1d" roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
};

// English Narrowboat - cute traditional canal boat with roses and castles style
const CANAL_PORTHOLE_GLASS_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#add8e6',
  emissive: '#000000',
  emissiveIntensity: 0,
  metalness: 0.5,
  roughness: 0.1,
});

export const CanalBoat: React.FC<{
  position: [number, number, number];
  rotation?: number;
  hullColor?: string;
  cabinColor?: string;
}> = React.memo(
  ({
    position,
    rotation = 0,
    hullColor = '#1e3a5a', // Traditional dark blue
    cabinColor = '#8b2323', // Traditional burgundy red
  }) => {
    const isNight = useGameSimulationStore(
      useShallow((state) => state.gameTime >= 20 || state.gameTime < 6)
    );
    useEffect(() => {
      CANAL_PORTHOLE_GLASS_MATERIAL.color.set(isNight ? '#ffaa00' : '#add8e6');
      CANAL_PORTHOLE_GLASS_MATERIAL.emissive.set(isNight ? '#ffaa00' : '#000000');
      CANAL_PORTHOLE_GLASS_MATERIAL.emissiveIntensity = isNight ? 2 : 0;
      CANAL_PORTHOLE_GLASS_MATERIAL.metalness = isNight ? 0.15 : 0.5;
      CANAL_PORTHOLE_GLASS_MATERIAL.roughness = isNight ? 0.35 : 0.1;
    }, [isNight]);

    // Narrowboat dimensions (scaled for scene)
    const boatLength = 12;
    const boatWidth = 2.4; // Slightly wider for better proportion
    const hullHeight = 0.9;
    const cabinHeight = 1.5;
    const cabinLength = 7.5;

    return (
      <group position={position} rotation={[0, rotation, 0]}>
        <GeneratedBoundary
          fallback={
            <group>
              {' '}
              {/* ===== UPGRADED NARROWBOAT HULL ===== */}
              {/* Main Hull Body - smoother darker metal */}
              <mesh position={[0, -0.1, 0]} castShadow receiveShadow>
                <boxGeometry args={[boatWidth, hullHeight, boatLength - 2.5]} />
                <meshStandardMaterial color={hullColor} roughness={0.4} metalness={0.3} />
              </mesh>
              {/* Tapered Bow Section */}
              <group position={[0, 0, boatLength / 2 - 1.25]}>
                <mesh position={[0, -0.1, 1]} rotation={[Math.PI / 2, Math.PI, 0]} castShadow>
                  <cylinderGeometry
                    args={[0.1, boatWidth / 2, 2, 8, 1, false, Math.PI / 2, Math.PI]}
                  />
                  <meshStandardMaterial color={hullColor} roughness={0.4} metalness={0.3} />
                </mesh>
                <mesh position={[0, -0.1, 1]} rotation={[Math.PI / 2, 0, 0]} castShadow>
                  <cylinderGeometry
                    args={[0.1, boatWidth / 2, 2, 8, 1, false, Math.PI / 2, Math.PI]}
                  />
                  <meshStandardMaterial color={hullColor} roughness={0.4} metalness={0.3} />
                </mesh>
                {/* Bow Deck */}
                <mesh position={[0, 0.35, 1]} castShadow>
                  <cylinderGeometry args={[boatWidth / 2 - 0.2, boatWidth / 2 - 0.2, 0.1, 16]} />
                  <meshStandardMaterial color="#5d4e37" roughness={0.9} />
                </mesh>
              </group>
              {/* Tapered Stern Section */}
              <group position={[0, 0, -boatLength / 2 + 1.25]}>
                <mesh position={[0, -0.1, -0.5]} castShadow>
                  <boxGeometry args={[boatWidth, hullHeight, 1]} />
                  <meshStandardMaterial color={hullColor} roughness={0.4} metalness={0.3} />
                </mesh>
                {/* Stern Deck */}
                <mesh position={[0, 0.36, -0.2]} castShadow>
                  <boxGeometry args={[boatWidth - 0.2, 0.05, 2.5]} />
                  <meshStandardMaterial color="#5d4e37" roughness={0.9} />
                </mesh>
              </group>
              {/* Rubbing Strakes (Protective Rails) - More detailed */}
              {[-0.2, 0.1].map((y, i) => (
                <group key={`strake-${i}`} position={[0, y, 0]}>
                  <mesh position={[boatWidth / 2 + 0.05, 0, 0]} castShadow>
                    <boxGeometry args={[0.1, 0.1, boatLength - 3]} />
                    <meshStandardMaterial color="#111" roughness={0.8} />
                  </mesh>
                  <mesh position={[-boatWidth / 2 - 0.05, 0, 0]} castShadow>
                    <boxGeometry args={[0.1, 0.1, boatLength - 3]} />
                    <meshStandardMaterial color="#111" roughness={0.8} />
                  </mesh>
                </group>
              ))}
              {/* ===== CABIN ===== */}
              <group position={[0, 0.4, -0.5]}>
                {/* Main Cabin Structure */}
                <mesh position={[0, cabinHeight / 2, 0]} castShadow receiveShadow>
                  <boxGeometry args={[boatWidth - 0.4, cabinHeight, cabinLength]} />
                  <meshStandardMaterial color={cabinColor} roughness={0.6} />
                </mesh>

                {/* Painted Panels (Roses & Castles style) */}
                {[-1, 0, 1].map((xOffset) => (
                  <mesh position={[0, cabinHeight / 2, xOffset * 2]} key={`panel-${xOffset}`}>
                    <boxGeometry args={[boatWidth - 0.35, cabinHeight - 0.4, 1.5]} />
                    <meshStandardMaterial color="#a03030" roughness={0.6} />
                  </mesh>
                ))}

                {/* Windows - Proper portholes and rectangle windows */}
                {[-2.5, -1, 0.5, 2].map((z, i) => (
                  <React.Fragment key={`win-${i}`}>
                    {/* Port */}
                    <group position={[-boatWidth / 2 + 0.2, 0.9, z]}>
                      <mesh rotation={[0, 0, Math.PI / 2]}>
                        <cylinderGeometry args={[0.25, 0.25, 0.1, 16]} />
                        <meshStandardMaterial color="#d4af37" metalness={0.8} roughness={0.2} />
                      </mesh>
                      <mesh
                        rotation={[0, 0, Math.PI / 2]}
                        position={[0.02, 0, 0]}
                        userData={{ dynamic: true }}
                      >
                        <cylinderGeometry args={[0.2, 0.2, 0.1, 16]} />
                        <primitive object={CANAL_PORTHOLE_GLASS_MATERIAL} attach="material" />
                      </mesh>
                    </group>
                    {/* Starboard */}
                    <group position={[boatWidth / 2 - 0.2, 0.9, z]}>
                      <mesh rotation={[0, 0, Math.PI / 2]}>
                        <cylinderGeometry args={[0.25, 0.25, 0.1, 16]} />
                        <meshStandardMaterial color="#d4af37" metalness={0.8} roughness={0.2} />
                      </mesh>
                      <mesh
                        rotation={[0, 0, Math.PI / 2]}
                        position={[-0.02, 0, 0]}
                        userData={{ dynamic: true }}
                      >
                        <cylinderGeometry args={[0.2, 0.2, 0.1, 16]} />
                        <primitive object={CANAL_PORTHOLE_GLASS_MATERIAL} attach="material" />
                      </mesh>
                    </group>
                  </React.Fragment>
                ))}

                {/* Roof Accessories Restored */}

                {/* Chimney - Brass and Smoke */}
                <group position={[0.5, cabinHeight + 0.6, -1.5]}>
                  <mesh castShadow>
                    <cylinderGeometry args={[0.15, 0.18, 1, 12]} />
                    <meshStandardMaterial color="#b8860b" metalness={0.8} roughness={0.3} />
                  </mesh>
                  <mesh position={[0, 0.5, 0]} rotation={[Math.PI / 2, 0, 0]}>
                    <torusGeometry args={[0.18, 0.04, 8, 16]} />
                    <meshStandardMaterial color="#b8860b" metalness={0.8} roughness={0.3} />
                  </mesh>
                  {/* Rain Cap */}
                  <mesh position={[0, 0.8, 0]} rotation={[0, 0, 0.4]}>
                    <cylinderGeometry args={[0.2, 0.01, 0.1, 8]} />
                    <meshStandardMaterial color="#333" />
                  </mesh>
                </group>

                {/* Roof Storage Box */}
                <mesh position={[-0.4, cabinHeight + 0.3, 1]} castShadow>
                  <boxGeometry args={[0.6, 0.3, 1.2]} />
                  <meshStandardMaterial color="#5d4e37" roughness={0.9} />
                </mesh>

                {/* Lantern on Roof */}
                <group position={[0, cabinHeight + 0.15, 3]}>
                  <mesh castShadow>
                    <boxGeometry args={[0.2, 0.3, 0.2]} />
                    <meshStandardMaterial color="#222" metalness={0.6} />
                  </mesh>
                  <mesh position={[0, 0, 0]} material={EXTERIOR_LAMP_LENS_MATERIAL}>
                    <boxGeometry args={[0.15, 0.25, 0.15]} />
                  </mesh>
                </group>
              </group>
              {/* ===== DECK DETAILS ===== */}
              {/* Tiller (Steering) - Distinctive Z shape */}
              <group position={[0, 1.1, -boatLength / 2 + 1.5]}>
                <mesh rotation={[0.5, 0, 0]}>
                  <cylinderGeometry args={[0.04, 0.04, 0.8]} />
                  <meshStandardMaterial color="#8b4513" />
                </mesh>
                <mesh position={[0, 0.4, -0.4]} rotation={[1.8, 0, 0]}>
                  <cylinderGeometry args={[0.035, 0.035, 1]} />
                  <meshStandardMaterial color="#ccc" metalness={0.7} />
                </mesh>
                <mesh position={[0, 0.4, -0.9]}>
                  <sphereGeometry args={[0.06]} />
                  <meshStandardMaterial color="#d4af37" metalness={0.8} />
                </mesh>
              </group>
              {/* Cratch Board (Front triangular cover frame) */}
              <group position={[0, 0.8, boatLength / 2 - 1.2]}>
                <mesh rotation={[-0.4, 0, 0]}>
                  <boxGeometry args={[boatWidth - 0.4, 0.8, 0.05]} />
                  {/* depthWrite off: this fill is coplanar with the wireframe frame below */}
                  <meshStandardMaterial color="#222" transparent opacity={0.4} depthWrite={false} />
                </mesh>
                <mesh rotation={[-0.4, 0, 0]} position={[0, 0, 0]}>
                  <boxGeometry args={[boatWidth - 0.4, 0.8, 0.05]} />
                  <meshStandardMaterial color="#333" wireframe />
                </mesh>
              </group>
              {/* Rope Coils on Bow */}
              <group position={[0, 0.4, boatLength / 2 - 0.5]}>
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                  <torusGeometry args={[0.3, 0.08, 8, 16]} />
                  <meshStandardMaterial color="#c2b280" roughness={1} />
                </mesh>
                <mesh rotation={[Math.PI / 2, 0, 0.5]} position={[0.2, 0.05, 0.1]}>
                  <torusGeometry args={[0.25, 0.07, 8, 16]} />
                  <meshStandardMaterial color="#c2b280" roughness={1} />
                </mesh>
              </group>
            </group>
          }
        >
          {/* Hull-top measurement puts the waterline 0.6 m above its keel. */}
          <group position={[0, -0.6, 0.275]}>
            <GeneratedBoatModel isNight={isNight} />
          </group>
          <group position={[0, 2.6, 2.5]}>
            <mesh castShadow>
              <boxGeometry args={[0.2, 0.3, 0.2]} />
              <meshStandardMaterial color="#222222" metalness={0.6} />
            </mesh>
            <mesh material={EXTERIOR_LAMP_LENS_MATERIAL}>
              <boxGeometry args={[0.15, 0.25, 0.21]} />
            </mesh>
          </group>
        </GeneratedBoundary>
      </group>
    );
  }
);

// Natural Lake component - irregular shape with shoreline
const Lake: React.FC<{
  position: readonly [number, number, number];
  size: [number, number];
  depth?: number;
}> = ({ position, size, depth: _depth = 0.5 }) => {
  // CRITICAL: Guard against NaN/undefined/zero dimensions which cause
  // "computeBoundingSphere(): Computed radius is NaN" errors in THREE.js
  const safeW = Number.isFinite(size?.[0]) && size[0] > 0 ? size[0] : 20;
  const safeH = Number.isFinite(size?.[1]) && size[1] > 0 ? size[1] : 20;
  const mainRadiusX = Math.max(0.1, safeW / 2 - 1);
  const mainRadiusZ = Math.max(0.1, safeH / 2 - 1);
  const shoreRadiusX = Math.max(0.1, safeW / 2 + 1.2);
  const shoreRadiusZ = Math.max(0.1, safeH / 2 + 1.2);
  const waterGeometry = useMemo(
    () => createOrganicLakeSurfaceGeometry(mainRadiusX, mainRadiusZ),
    [mainRadiusX, mainRadiusZ]
  );
  const bankGeometry = useMemo(
    () => createOrganicLakeBankGeometry(mainRadiusX, mainRadiusZ, shoreRadiusX, shoreRadiusZ),
    [mainRadiusX, mainRadiusZ, shoreRadiusX, shoreRadiusZ]
  );
  useEffect(
    () => () => {
      waterGeometry.dispose();
      bankGeometry.dispose();
    },
    [bankGeometry, waterGeometry]
  );
  // grassRadius removed - grass now handled by TerrainGround system

  return (
    <group position={[position[0], position[1], position[2]]}>
      {/* Grass around lake - REMOVED: now handled by TerrainGround system */}
      {/* One organic bank mesh replaces the exposed concentric shoreline disc. */}
      <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <primitive object={bankGeometry} attach="geometry" />
        <meshStandardMaterial vertexColors roughness={0.96} metalness={0} />
      </mesh>
      {/* The opaque water shader carries its own depth gradient. Keeping a
          second disc directly beneath its animated wave troughs caused the
          two surfaces to cross and flash dark triangles at dusk. */}
      {/* Main water surface. KEPT AT 0.15 for the reason the note above gives:
          the opaque water shader carries its own depth gradient and its wave
          troughs cut below the surface, so this is set by what the waves do,
          not by where the terrain is. */}
      <mesh
        position={[0, 0.15, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        renderOrder={RENDER_ORDER.waterSurface}
      >
        <primitive object={waterGeometry} attach="geometry" />
        <UnifiedWaterSurfaceMaterial
          deep="#143b48"
          shallow="#4a8790"
          reflection="#c4e0e4"
          flowSpeed={0.1}
          opacity={0.85}
          radial
        />
      </mesh>
      {/* Reeds/vegetation patches */}
      {[
        [-safeW / 3, safeH / 4],
        [safeW / 4, -safeH / 3],
        [-safeW / 4, -safeH / 4],
      ].map(([x, z], i) => (
        <group key={`reeds-${i}`} position={[x, 0, z]}>
          {[0, 0.3, -0.3, 0.15, -0.15].map((offset, j) => (
            <mesh key={j} position={[offset, 0.4, offset * 0.5]} castShadow>
              <cylinderGeometry args={[0.02, 0.04, 1, 4]} />
              <meshStandardMaterial color="#4a6741" roughness={0.9} />
            </mesh>
          ))}
        </group>
      ))}
      {/* Willow trees by lake */}
      {/* Off the beach, clear of the victorian lamp at (-safeW / 2 - 2, 0) that
          this willow's trunk used to stand against, and of the LAKE sign at
          (-safeW / 2 - 5, -5). */}
      <SimpleTree position={[-safeW / 2 - 5, 0, 6]} scale={1.3} />
      <SimpleTree position={[safeW / 3, 0, safeH / 2 + 6]} scale={1.1} />
      {/* Park bench overlooking lake */}
      <ParkBench position={[safeW / 2 + 4, 0, 0]} rotation={-Math.PI / 2} />
    </group>
  );
};

const RIVER_CULVERT_GEOMETRIES = createRiverCulvertGeometries();
const RIVER_CULVERT_STONE = new THREE.MeshStandardMaterial({
  color: '#d4d2c9',
  map: PROCEDURAL_TEXTURES.concreteColor,
  roughnessMap: PROCEDURAL_TEXTURES.concreteRoughness,
  roughness: 0.96,
});
const RIVER_CULVERT_RING = RIVER_CULVERT_STONE.clone();
RIVER_CULVERT_RING.color.set('#eceae0');
RIVER_CULVERT_RING.vertexColors = true;
const RIVER_CULVERT_DARKNESS = new THREE.MeshBasicMaterial({
  color: '#030505',
  side: THREE.DoubleSide,
});

const RiverTunnel: React.FC<{
  position: [number, number, number];
  width: number;
  rotation?: number;
  flowDirection: 'in' | 'out';
}> = React.memo(({ position, width, rotation = 0, flowDirection }) => (
  <group
    name="river-culvert"
    position={position}
    rotation={[0, rotation + (flowDirection === 'in' ? Math.PI : 0), 0]}
    scale={width / 20}
  >
    <mesh
      name="river-culvert-headwall"
      geometry={RIVER_CULVERT_GEOMETRIES.face}
      material={RIVER_CULVERT_STONE}
      castShadow
      receiveShadow
    />
    <mesh
      name="river-culvert-arch"
      geometry={RIVER_CULVERT_GEOMETRIES.ring}
      material={RIVER_CULVERT_RING}
      castShadow
      receiveShadow
    />
    <mesh
      name="river-culvert-bank"
      geometry={RIVER_CULVERT_GEOMETRIES.earth}
      material={ROAD_TUNNEL_EARTH_MATERIAL}
      castShadow
      receiveShadow
    />
    <mesh
      name="river-culvert-recess"
      geometry={RIVER_CULVERT_GEOMETRIES.darkness}
      material={RIVER_CULVERT_DARKNESS}
    />
  </group>
));

// The visible river and its shoreline share the actual terrain assembly.
const River: React.FC = React.memo(() => {
  const config = MILLOS_RIVER_CONFIG;
  const {
    position: [riverX, riverZ],
    length,
    width,
    waterLevel,
  } = config;
  const quality = useGraphicsStore((state) => state.graphics.quality);
  const segments = getTerrainGridSegments(quality);
  const surface = useMemo(() => {
    const heightfield = getRiverHeightfield(config);
    const terrain = createDisplacedGeometry(
      TERRAIN_BOUNDS.maxX - TERRAIN_BOUNDS.minX,
      TERRAIN_BOUNDS.maxZ - TERRAIN_BOUNDS.minZ,
      segments,
      heightfield.data,
      heightfield.resolution,
      config.depth,
      TERRAIN_BOUNDS
    );
    try {
      return createRiverSurfaceGeometry(terrain, config, waterLevel, SITE_LAYOUT.datum.terrain);
    } finally {
      terrain.dispose();
    }
  }, [segments, config, waterLevel]);
  useEffect(() => () => surface.dispose(), [surface]);
  const startZ = getRiverCenterZ(riverX - length / 2, config) - riverZ;
  const endZ = getRiverCenterZ(riverX + length / 2, config) - riverZ;

  return (
    <group position={[riverX, 0, riverZ]} name="river-channel">
      <mesh
        name="terrain-fitted-river-water"
        position={[0, waterLevel, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        renderOrder={RENDER_ORDER.waterSurface}
      >
        <primitive object={surface} attach="geometry" />
        <UnifiedWaterSurfaceMaterial
          deep="#123746"
          shallow="#3b7d8a"
          reflection="#c0e1e6"
          flowSpeed={0.504}
          flowDirection={[1, 0.16]}
          opacity={0.9}
          crossOnly
        />
      </mesh>
      {/* Girder footbridge spanning both sloped banks. */}
      <group position={[0, 0, 0]}>
        {/* The collider reads this same deck centre and physical envelope. */}
        <mesh
          name="river-footbridge-deck"
          position={[
            RIVER_FOOTBRIDGE_DECK.centre[0] - riverX,
            RIVER_FOOTBRIDGE_DECK.centre[1],
            RIVER_FOOTBRIDGE_DECK.centre[2] - riverZ,
          ]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[...RIVER_FOOTBRIDGE_DECK.size]} />
          <meshStandardMaterial color="#6b7280" roughness={0.8} />
        </mesh>
        {/* Bridge railings */}
        {[-1, 1].map((side, i) => (
          <mesh key={`railing-${i}`} position={[side * 3.1875, 2.7, 0]} castShadow>
            <boxGeometry args={[0.3, 1, width * 2 + 30]} />
            <meshStandardMaterial color="#4b5563" roughness={0.7} />
          </mesh>
        ))}
        {/* Bridge support structure - extends down into canyon */}
        {/* Main longitudinal beams under the deck */}
        {[-2, 0, 2].map((xOff, i) => (
          <mesh key={`main-beam-${i}`} position={[xOff, 1.2, 0]} castShadow>
            <boxGeometry args={[0.4, 1.2, width * 2 + 28]} />
            <meshStandardMaterial color="#374151" roughness={0.6} metalness={0.3} />
          </mesh>
        ))}
        {/* Cross beams connecting the main beams */}
        {Array.from({ length: 9 }, (_, i) => {
          const zPos = -32 + i * 8;
          return (
            <mesh key={`cross-beam-${i}`} position={[0, 1.2, zPos]} castShadow>
              <boxGeometry args={[5.5, 0.3, 0.4]} />
              <meshStandardMaterial color="#374151" roughness={0.6} metalness={0.3} />
            </mesh>
          );
        })}
        {/* Vertical pier columns extending down to canyon floor */}
        {/* Foundations extend below the river bed. */}
        {Array.from({ length: 5 }, (_, i) => {
          const zPos = -28 + i * 14; // 5 piers spread across the span
          return (
            <group key={`pier-${i}`}>
              {/* Left pier */}
              <mesh position={[-2.2, -4, zPos]} castShadow>
                <boxGeometry args={[0.8, 12, 0.8]} />
                <meshStandardMaterial color="#4b5563" roughness={0.7} metalness={0.2} />
              </mesh>
              {/* Right pier */}
              <mesh position={[2.2, -4, zPos]} castShadow>
                <boxGeometry args={[0.8, 12, 0.8]} />
                <meshStandardMaterial color="#4b5563" roughness={0.7} metalness={0.2} />
              </mesh>
              {/* Cross brace between piers */}
              <mesh position={[0, -2, zPos]} castShadow>
                <boxGeometry args={[4, 0.4, 0.4]} />
                <meshStandardMaterial color="#374151" roughness={0.6} metalness={0.3} />
              </mesh>
              {/* Diagonal bracing */}
              <mesh position={[-1, -5, zPos]} rotation={[0, 0, Math.PI / 4]} castShadow>
                <boxGeometry args={[0.2, 6, 0.2]} />
                <meshStandardMaterial color="#374151" roughness={0.6} metalness={0.3} />
              </mesh>
              <mesh position={[1, -5, zPos]} rotation={[0, 0, -Math.PI / 4]} castShadow>
                <boxGeometry args={[0.2, 6, 0.2]} />
                <meshStandardMaterial color="#374151" roughness={0.6} metalness={0.3} />
              </mesh>
            </group>
          );
        })}
      </group>
      {/* Both five-metre foundations extend below the four-metre channel bed. */}
      <RiverTunnel
        position={[-length / 2 - 2, 0, startZ]}
        width={width}
        rotation={-Math.PI / 2}
        flowDirection="out"
      />
      <RiverTunnel
        position={[length / 2 + 2, 0, endZ]}
        width={width}
        rotation={-Math.PI / 2}
        flowDirection="in"
      />
    </group>
  );
});

// Animated frog that hops on lily pads
const AnimatedFrog: React.FC<{
  position: [number, number, number];
  rotation?: number;
  hopOffset?: number;
}> = ({ position, rotation = 0, hopOffset = 0 }) => {
  const frogRef = useRef<THREE.Group>(null);
  const heartCounter = useRef(0);
  const hoveredRef = useRef(false);
  const [isExcited, setIsExcited] = useState(false);
  const [hearts, setHearts] = useState<{ id: number; pos: [number, number, number] }[]>([]);

  const handlePet = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    setIsExcited(true);
    playCritterSound('frog');
    const id = ++heartCounter.current;
    setHearts((prev: { id: number; pos: [number, number, number] }[]) => [
      ...prev,
      { id, pos: [0, 0.5, 0] },
    ]);
  };

  const removeHeart = (id: number) => {
    setHearts((prev: { id: number; pos: [number, number, number] }[]) =>
      prev.filter((h) => h.id !== id)
    );
  };

  useEffect(() => {
    if (isExcited) {
      const t = setTimeout(() => setIsExcited(false), 500);
      return () => clearTimeout(t);
    }
  }, [isExcited]);

  // Only reset the cursor if this frog set it, so unmounting cannot clobber
  // another element's hover state.
  useEffect(
    () => () => {
      if (hoveredRef.current) document.body.style.cursor = 'auto';
    },
    []
  );

  useFrame((state) => {
    if (frogRef.current) {
      if (isExcited) {
        // Rapid hop / shudder
        const t = state.clock.elapsedTime * 30;
        frogRef.current.position.y = position[1] + Math.abs(Math.sin(t)) * 0.1;
        frogRef.current.rotation.x = 0;
        return;
      }

      // Create a hopping animation
      const time = state.clock.elapsedTime + hopOffset;
      const hopCycle = time * 0.8; // Slower hop frequency
      const hopPhase = hopCycle % 3; // Hop every 3 seconds

      if (hopPhase < 0.3) {
        // Hopping up
        const hopProgress = hopPhase / 0.3;
        frogRef.current.position.y = position[1] + Math.sin(hopProgress * Math.PI) * 0.3;
        frogRef.current.rotation.x = -hopProgress * 0.3; // Lean forward while hopping
      } else {
        // Sitting
        frogRef.current.position.y = position[1];
        frogRef.current.rotation.x = 0;
      }
    }
  });

  return (
    <group
      position={position}
      rotation={[0, rotation, 0]}
      onClick={handlePet}
      onPointerOver={(e) => {
        e.stopPropagation();
        hoveredRef.current = true;
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        hoveredRef.current = false;
        document.body.style.cursor = 'auto';
      }}
    >
      <group ref={frogRef}>
        <GeneratedBoundary
          fallback={
            <>
              <mesh castShadow>
                <sphereGeometry args={[0.12, 12, 8]} />
                <meshStandardMaterial color="#4a7c3f" roughness={0.8} />
              </mesh>
              <mesh position={[0.1, 0.04, 0]} castShadow>
                <sphereGeometry args={[0.08, 10, 8]} />
                <meshStandardMaterial color="#5a8c4f" roughness={0.8} />
              </mesh>
              <mesh position={[0.14, 0.1, 0.04]} castShadow>
                <sphereGeometry args={[0.03, 8, 6]} />
                <meshStandardMaterial color="#2d4a2a" roughness={0.6} />
              </mesh>
              <mesh position={[0.14, 0.1, -0.04]} castShadow>
                <sphereGeometry args={[0.03, 8, 6]} />
                <meshStandardMaterial color="#2d4a2a" roughness={0.6} />
              </mesh>
              <mesh position={[-0.1, -0.04, 0.08]} rotation={[0, 0, 0.5]} castShadow>
                <capsuleGeometry args={[0.025, 0.1, 4, 6]} />
                <meshStandardMaterial color="#3d6b35" roughness={0.8} />
              </mesh>
              <mesh position={[-0.1, -0.04, -0.08]} rotation={[0, 0, 0.5]} castShadow>
                <capsuleGeometry args={[0.025, 0.1, 4, 6]} />
                <meshStandardMaterial color="#3d6b35" roughness={0.8} />
              </mesh>
              <mesh position={[0.06, -0.06, 0.06]} castShadow>
                <capsuleGeometry args={[0.02, 0.05, 4, 6]} />
                <meshStandardMaterial color="#3d6b35" roughness={0.8} />
              </mesh>
              <mesh position={[0.06, -0.06, -0.06]} castShadow>
                <capsuleGeometry args={[0.02, 0.05, 4, 6]} />
                <meshStandardMaterial color="#3d6b35" roughness={0.8} />
              </mesh>
            </>
          }
        >
          <group position={[0.0155862, -0.11999997, 3e-8]}>
            <GeneratedModel asset="frogAuthoredBody" />
          </group>
        </GeneratedBoundary>
        <mesh position={[0.16, 0.11, 0.04]}>
          <sphereGeometry args={[0.015, 6, 6]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        <mesh position={[0.16, 0.11, -0.04]}>
          <sphereGeometry args={[0.015, 6, 6]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      </group>

      {hearts.map((h: { id: number; pos: [number, number, number] }) => (
        <HeartParticle key={h.id} position={h.pos} onComplete={() => removeHeart(h.id)} />
      ))}
    </group>
  );
};

// Cupid/Eros statue for pond centerpiece
const CupidStatue: React.FC<{
  position: [number, number, number];
}> = ({ position }) => (
  <group position={position}>
    <GeneratedBoundary
      fallback={
        <>
          <mesh position={[0, 0.15, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.6, 0.7, 0.3, 8]} />
            <meshStandardMaterial color="#8b9298" roughness={0.85} />
          </mesh>
          <mesh position={[0, 0.7, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.35, 0.45, 0.8, 8]} />
            <meshStandardMaterial color="#9ca3ab" roughness={0.8} />
          </mesh>
          <mesh position={[0, 1.2, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.5, 0.4, 0.2, 8]} />
            <meshStandardMaterial color="#a8b0b8" roughness={0.75} />
          </mesh>
          <group position={[0, 1.5, 0]}>
            {/* Body/torso */}
            <mesh position={[0, 0.3, 0]} castShadow>
              <capsuleGeometry args={[0.15, 0.3, 8, 12]} />
              <meshStandardMaterial color="#e8dcd0" roughness={0.6} metalness={0.1} />
            </mesh>
            {/* Head */}
            <mesh position={[0, 0.65, 0]} castShadow>
              <sphereGeometry args={[0.12, 12, 10]} />
              <meshStandardMaterial color="#ebe0d4" roughness={0.55} metalness={0.1} />
            </mesh>
            {/* Curly hair */}
            <mesh position={[0, 0.72, 0]} castShadow>
              <sphereGeometry args={[0.11, 10, 8]} />
              <meshStandardMaterial color="#d4c8bc" roughness={0.7} />
            </mesh>
            {/* Left wing */}
            <group position={[-0.1, 0.4, -0.12]} rotation={[0.2, -0.4, 0.3]}>
              <mesh castShadow>
                <coneGeometry args={[0.2, 0.5, 4]} />
                <meshStandardMaterial color="#f0e8e0" roughness={0.5} side={THREE.DoubleSide} />
              </mesh>
            </group>
            {/* Right wing */}
            <group position={[0.1, 0.4, -0.12]} rotation={[0.2, 0.4, -0.3]}>
              <mesh castShadow>
                <coneGeometry args={[0.2, 0.5, 4]} />
                <meshStandardMaterial color="#f0e8e0" roughness={0.5} side={THREE.DoubleSide} />
              </mesh>
            </group>
            {/* Left arm - holding bow */}
            <mesh position={[-0.18, 0.35, 0.05]} rotation={[0, 0, -0.8]} castShadow>
              <capsuleGeometry args={[0.04, 0.15, 4, 8]} />
              <meshStandardMaterial color="#e8dcd0" roughness={0.6} metalness={0.1} />
            </mesh>
            {/* Right arm - drawing bowstring */}
            <mesh position={[0.15, 0.4, 0.08]} rotation={[0.5, 0, 0.6]} castShadow>
              <capsuleGeometry args={[0.04, 0.15, 4, 8]} />
              <meshStandardMaterial color="#e8dcd0" roughness={0.6} metalness={0.1} />
            </mesh>
            {/* Bow */}
            <group position={[-0.28, 0.3, 0.1]} rotation={[0, 0, 0.2]}>
              <mesh castShadow>
                <torusGeometry args={[0.15, 0.015, 8, 12, Math.PI]} />
                <meshStandardMaterial color="#c4a87c" roughness={0.7} />
              </mesh>
            </group>
            {/* Legs */}
            <mesh position={[-0.06, 0, 0]} rotation={[0, 0, 0.1]} castShadow>
              <capsuleGeometry args={[0.05, 0.2, 4, 8]} />
              <meshStandardMaterial color="#e8dcd0" roughness={0.6} metalness={0.1} />
            </mesh>
            <mesh position={[0.06, 0, 0]} rotation={[0, 0, -0.1]} castShadow>
              <capsuleGeometry args={[0.05, 0.2, 4, 8]} />
              <meshStandardMaterial color="#e8dcd0" roughness={0.6} metalness={0.1} />
            </mesh>
          </group>
        </>
      }
    >
      <group position={[0, -1e-8, 0]}>
        <GeneratedModel asset="cupidAuthoredBody" />
      </group>
    </GeneratedBoundary>
  </group>
);

// Small decorative pond
const Pond: React.FC<{
  position: readonly [number, number, number];
  radius: number;
}> = ({ position, radius }) => {
  // Fixed lily pad positions and rotations (avoid Math.random in render)
  const lilyPads = useMemo(
    () => [
      { x: -radius * 0.3, z: radius * 0.2, rot: 0.5, frogRot: Math.PI * 0.3, hopOffset: 0 },
      { x: radius * 0.4, z: -radius * 0.1, rot: 2.1, frogRot: -Math.PI * 0.5, hopOffset: 1.2 },
      { x: -radius * 0.1, z: -radius * 0.4, rot: 4.2, frogRot: Math.PI * 0.8, hopOffset: 2.5 },
      { x: radius * 0.2, z: radius * 0.35, rot: 1.0, frogRot: -Math.PI * 0.2, hopOffset: 0.7 },
      { x: -radius * 0.45, z: -radius * 0.15, rot: 3.5, frogRot: Math.PI * 0.6, hopOffset: 1.8 },
    ],
    [radius]
  );

  return (
    <group position={[position[0], position[1], position[2]]}>
      {/* Surrounding grass - REMOVED: now handled by TerrainGround system */}
      {/* Stone kerb. KEPT AT 0.08, and no longer as terrain clearance: the
          terrain datum moved from 0.05 to -0.02, so this now stands 10 cm proud
          of the bank, which is what a pond kerb should do. Dropping it to the
          ground datum with the rest of the exterior stack would flatten a
          deliberate silhouette AND open a 22 cm step down to the water below.
          The offset is unchanged and still holds it clear of the terrain. */}
      {/* The two ponds are 21 m and 13 m across and both are read flat-on from
          the bank, where a 24-gon is 2.7 m of dead-straight stone kerb per
          facet - the one silhouette here that has nothing else to hide behind.
          48 halves it. The water disc below carries the same count so the
          kerb and the waterline stay concentric; both are flat fans, so this
          is a few dozen vertices for the whole feature. */}
      <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <ringGeometry args={[radius - 0.3, radius + 0.5, 48]} />
        <meshStandardMaterial
          color="#7d8590"
          roughness={0.85}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
        />
      </mesh>
      {/* Water surface. KEPT AT 0.15, and independently justified rather than
          terrain clearance: the wave displacement is +/-0.035, so the trough of
          this surface reaches 0.115 and it has to clear the kerb at 0.08 by
          more than that. The 0.12 depth disc that used to sit here was both
          invisible (opaque surface of the same radius 0.03 above it) and
          actively harmful, for the same reason - troughs cut below 0.12 and
          flashed it through. `WATER_LAYERS.surface` is 0.08 and is what the
          OPEN water on the site uses; a kerbed pond is not that case. */}
      <mesh
        position={[0, 0.15, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        renderOrder={RENDER_ORDER.waterSurface}
      >
        {/* 48 to match the stone kerb. The wave displacement in
            UnifiedWaterSurfaceMaterial only moves rim vertices on a disc fan,
            so the extra segments buy a smoother waterline as well. */}
        <circleGeometry args={[radius - 0.5, 48]} />
        <UnifiedWaterSurfaceMaterial
          deep="#183f4b"
          shallow="#4c8990"
          reflection="#c6e2e2"
          flowSpeed={0.08}
          opacity={0.9}
          radial
        />
      </mesh>
      {/* Lily pads with frogs */}
      {lilyPads.map((pad, i) => (
        <group key={`lilypad-${i}`}>
          {/* Lily pad - floating on water surface */}
          <mesh
            position={[pad.x, 0.16, pad.z]}
            rotation={[-Math.PI / 2, pad.rot, 0]}
            renderOrder={RENDER_ORDER.waterFloating}
          >
            <circleGeometry args={[0.5, 12]} />
            <meshStandardMaterial color="#3d6b4f" roughness={0.7} side={THREE.DoubleSide} />
          </mesh>
          {/* Lily pad notch effect - darker center */}
          <mesh
            position={[pad.x, 0.165, pad.z]}
            rotation={[-Math.PI / 2, pad.rot, 0]}
            renderOrder={RENDER_ORDER.waterFloating + 1}
          >
            <ringGeometry args={[0.1, 0.25, 12]} />
            <meshStandardMaterial color="#2d5a3f" roughness={0.8} side={THREE.DoubleSide} />
          </mesh>
          {/* Frog on the lily pad */}
          <AnimatedFrog
            position={[pad.x, 0.21, pad.z]}
            rotation={pad.frogRot}
            hopOffset={pad.hopOffset}
          />
        </group>
      ))}
      {/* Cupid/Eros statue in center - raised to stand on pond bottom */}
      <CupidStatue position={[0, 0.15, 0]} />
      {/* Bench nearby */}
      <ParkBench position={[radius + 2, 0, 0]} rotation={-Math.PI / 2} />
    </group>
  );
};

// Cute kiosk cafe
const KioskCafe: React.FC<{
  position: [number, number, number];
  rotation?: number;
}> = ({ position, rotation = 0 }) => {
  const woodColor = '#8b5a2b';
  const accentColor = '#e74c3c'; // Red accent for awning
  const creamColor = '#fdf5e6'; // Cream for contrast

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <GeneratedBoundary
        fallback={
          <group>
            {' '}
            {/* Base platform */}
            <mesh position={[0, 0.05, 0]} receiveShadow castShadow>
              <cylinderGeometry args={[2.2, 2.4, 0.1, 8]} />
              <meshStandardMaterial color="#8b7355" roughness={0.9} />
            </mesh>
            {/* Main octagonal hut body */}
            <mesh position={[0, 1.4, 0]} castShadow receiveShadow>
              <cylinderGeometry args={[1.8, 2, 2.7, 8]} />
              <meshStandardMaterial color={woodColor} roughness={0.75} />
            </mesh>
            {/* Roof - conical with overhang */}
            <mesh position={[0, 3.2, 0]} castShadow>
              <coneGeometry args={[2.8, 1.8, 8]} />
              <meshStandardMaterial color={accentColor} roughness={0.6} />
            </mesh>
            {/* Roof trim */}
            <mesh position={[0, 2.35, 0]} castShadow>
              <torusGeometry args={[2.1, 0.08, 8, 8]} />
              <meshStandardMaterial color="#5d4037" roughness={0.7} />
            </mesh>
            {/* Roof finial - cute little ball on top */}
            <mesh position={[0, 4.2, 0]} castShadow>
              <sphereGeometry args={[0.15, 12, 12]} />
              <meshStandardMaterial color="#f4d03f" roughness={0.3} metalness={0.5} />
            </mesh>
            {/* Serving window - front */}
            <group position={[0, 1.5, 1.85]}>
              {/* Window frame */}
              <mesh castShadow>
                <boxGeometry args={[1.4, 1.2, 0.15]} />
                <meshStandardMaterial color="#5d4037" roughness={0.7} />
              </mesh>
              {/* Window opening (dark) */}
              <mesh position={[0, 0, 0.05]}>
                <boxGeometry args={[1.1, 0.9, 0.1]} />
                <meshStandardMaterial color="#1a1a2e" roughness={0.9} />
              </mesh>
              {/* Serving counter shelf */}
              <mesh position={[0, -0.5, 0.3]} castShadow>
                <boxGeometry args={[1.6, 0.1, 0.6]} />
                <meshStandardMaterial color={woodColor} roughness={0.7} />
              </mesh>
            </group>
            {/* Cute striped awning over window */}
            <group position={[0, 2.3, 2.2]}>
              {/* Awning frame */}
              <mesh rotation={[0.4, 0, 0]} castShadow>
                <boxGeometry args={[1.8, 0.05, 1.2]} />
                <meshStandardMaterial color={accentColor} roughness={0.6} />
              </mesh>
              {/* Awning stripes - alternating red and cream */}
              {[-0.6, -0.2, 0.2, 0.6].map((x, i) => (
                <mesh key={`stripe-${i}`} position={[x, 0.045, 0]} rotation={[0.4, 0, 0]}>
                  <boxGeometry args={[0.35, 0.03, 1.2]} />
                  <meshStandardMaterial
                    color={i % 2 === 0 ? accentColor : creamColor}
                    roughness={0.6}
                  />
                </mesh>
              ))}
              {/* Scalloped edge */}
              {[-0.7, -0.35, 0, 0.35, 0.7].map((x, i) => (
                <mesh
                  key={`scallop-${i}`}
                  position={[x, -0.27, 0.6]}
                  rotation={[0.4, 0, 0]}
                  castShadow
                >
                  <sphereGeometry args={[0.12, 8, 8]} />
                  <meshStandardMaterial
                    color={i % 2 === 0 ? accentColor : creamColor}
                    roughness={0.6}
                  />
                </mesh>
              ))}
            </group>
            {/* Menu board sign */}
            <group position={[1.5, 2.8, 1.2]} rotation={[0, -0.4, 0]}>
              {/* Sign post */}
              <mesh position={[0, -0.8, 0]} castShadow>
                <cylinderGeometry args={[0.05, 0.05, 1.6, 8]} />
                <meshStandardMaterial color="#5d4037" roughness={0.8} />
              </mesh>
              {/* Sign board */}
              <mesh castShadow>
                <boxGeometry args={[0.8, 0.6, 0.06]} />
                <meshStandardMaterial color={creamColor} roughness={0.8} />
              </mesh>
              {/* Sign frame */}
              <mesh position={[0, 0, -0.02]}>
                <boxGeometry args={[0.9, 0.7, 0.02]} />
                <meshStandardMaterial color="#5d4037" roughness={0.7} />
              </mesh>
            </group>
            {/* Flower boxes on sides */}
            {[
              { pos: [1.4, 0.6, 1.2] as [number, number, number], rot: -0.4 },
              { pos: [-1.4, 0.6, 1.2] as [number, number, number], rot: 0.4 },
            ].map(({ pos, rot }, i) => (
              <group key={`flowerbox-${i}`} position={pos} rotation={[0, rot, 0]}>
                {/* Box */}
                <mesh castShadow>
                  <boxGeometry args={[0.8, 0.35, 0.3]} />
                  <meshStandardMaterial color="#6d4c41" roughness={0.85} />
                </mesh>
                {/* Flowers */}
                {[-0.25, 0, 0.25].map((x, j) => (
                  <mesh key={`flower-${j}`} position={[x, 0.3, 0]} castShadow>
                    <sphereGeometry args={[0.12, 8, 8]} />
                    <meshStandardMaterial
                      color={['#ff6b9d', '#ffd93d', '#ff8fab'][j]}
                      roughness={0.7}
                    />
                  </mesh>
                ))}
                {/* Greenery */}
                <mesh position={[0, 0.2, 0]} castShadow>
                  <sphereGeometry args={[0.3, 8, 8]} />
                  <meshStandardMaterial color="#4a7c59" roughness={0.85} />
                </mesh>
              </group>
            ))}
          </group>
        }
      >
        <GeneratedModel asset="kioskCafe" />
        {/* Cute striped awning over window */}
        <group position={[0, 2.3, 2.2]}>
          {/* Awning frame */}
          <mesh rotation={[0.4, 0, 0]} castShadow>
            <boxGeometry args={[1.8, 0.05, 1.2]} />
            <meshStandardMaterial color={accentColor} roughness={0.6} />
          </mesh>
          {/* Awning stripes - alternating red and cream */}
          {[-0.6, -0.2, 0.2, 0.6].map((x, i) => (
            <mesh key={`stripe-${i}`} position={[x, 0.045, 0]} rotation={[0.4, 0, 0]}>
              <boxGeometry args={[0.35, 0.03, 1.2]} />
              <meshStandardMaterial
                color={i % 2 === 0 ? accentColor : creamColor}
                roughness={0.6}
              />
            </mesh>
          ))}
          {/* Scalloped edge */}
          {[-0.7, -0.35, 0, 0.35, 0.7].map((x, i) => (
            <mesh key={`scallop-${i}`} position={[x, -0.27, 0.6]} rotation={[0.4, 0, 0]} castShadow>
              <sphereGeometry args={[0.12, 8, 8]} />
              <meshStandardMaterial
                color={i % 2 === 0 ? accentColor : creamColor}
                roughness={0.6}
              />
            </mesh>
          ))}
        </group>
      </GeneratedBoundary>
      {/* Outdoor seating area - small table with umbrella */}
      <group position={[0, 0, 6]}>
        {/* Table */}
        <mesh position={[0, 0.7, 0]} castShadow>
          <cylinderGeometry args={[0.6, 0.6, 0.06, 16]} />
          <meshStandardMaterial color={woodColor} roughness={0.7} />
        </mesh>
        {/* Table leg */}
        <mesh position={[0, 0.35, 0]} castShadow>
          <cylinderGeometry args={[0.08, 0.1, 0.7, 8]} />
          <meshStandardMaterial color="#5d4037" roughness={0.7} />
        </mesh>
        {/* Umbrella pole */}
        <mesh position={[0, 1.6, 0]} castShadow>
          <cylinderGeometry args={[0.04, 0.04, 2.2, 8]} />
          <meshStandardMaterial color="#5d4037" roughness={0.6} />
        </mesh>
        {/* Umbrella canopy */}
        <mesh position={[0, 2.6, 0]} castShadow>
          <coneGeometry args={[1.5, 0.6, 8]} />
          <meshStandardMaterial color={accentColor} roughness={0.6} side={THREE.DoubleSide} />
        </mesh>
        {/* Umbrella finial */}
        <mesh position={[0, 2.95, 0]} castShadow>
          <sphereGeometry args={[0.08, 8, 8]} />
          <meshStandardMaterial color="#f4d03f" roughness={0.4} metalness={0.4} />
        </mesh>
        {/* Two small stools */}
        {[
          [-0.9, 0, 0.5],
          [0.9, 0, 0.5],
        ].map((p, i) => (
          <group key={`stool-${i}`} position={p as [number, number, number]}>
            <mesh position={[0, 0.4, 0]} castShadow>
              <cylinderGeometry args={[0.25, 0.25, 0.06, 12]} />
              <meshStandardMaterial color={woodColor} roughness={0.7} />
            </mesh>
            <mesh position={[0, 0.2, 0]} castShadow>
              <cylinderGeometry args={[0.06, 0.08, 0.4, 8]} />
              <meshStandardMaterial color="#5d4037" roughness={0.7} />
            </mesh>
          </group>
        ))}
      </group>

      {/* A small fascia gives the painted lettering a real surface. */}
      <mesh position={[0, 1.74, 2.95]} castShadow>
        <boxGeometry args={[1.7, 0.32, 0.055]} />
        <meshStandardMaterial color="#5d4037" roughness={0.7} />
      </mesh>
      <Text
        position={[0, 1.74, 2.981]}
        fontSize={0.23}
        surface="painted"
        color="#fdf5e6"
        anchorX="center"
        anchorY="middle"
        fontWeight="bold"
      >
        CAFE
      </Text>
    </group>
  );
};

// Cute vintage caravan/trailer
const Caravan: React.FC<{
  position: [number, number, number];
  rotation?: number;
  color?: string;
}> = ({ position, rotation = 0, color = '#e8d5b7' }) => {
  const accentColor = '#2e7d32'; // Retro green trim
  const wheelColor = '#424242';

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <GeneratedBoundary
        fallback={
          <group>
            {/* Main body - rounded rectangular shape */}
            <mesh position={[0, 1.1, 0]} castShadow receiveShadow>
              <boxGeometry args={[2.4, 1.8, 5]} />
              <meshStandardMaterial color={color} roughness={0.7} />
            </mesh>

            {/* Rounded roof */}
            <mesh position={[0, 2.1, 0]} castShadow>
              <boxGeometry args={[2.2, 0.3, 4.8]} />
              <meshStandardMaterial color={color} roughness={0.7} />
            </mesh>
            <mesh position={[0, 2.25, 0]} castShadow>
              <boxGeometry args={[1.8, 0.15, 4.6]} />
              <meshStandardMaterial color={color} roughness={0.7} />
            </mesh>

            {/* Bottom trim stripe */}
            <mesh position={[0, 0.35, 0]}>
              <boxGeometry args={[2.45, 0.15, 5.05]} />
              <meshStandardMaterial color={accentColor} roughness={0.6} />
            </mesh>

            {/* Top trim stripe */}
            <mesh position={[0, 1.95, 0]}>
              <boxGeometry args={[2.45, 0.1, 5.05]} />
              <meshStandardMaterial color={accentColor} roughness={0.6} />
            </mesh>

            {/* Front end (rounded) */}
            <mesh position={[0, 1.1, 2.4]} rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[0.9, 0.9, 2.2, 16, 1, false, 0, Math.PI]} />
              <meshStandardMaterial color={color} roughness={0.7} />
            </mesh>

            {/* Hitch/tongue */}
            <mesh position={[0, 0.5, 3.2]} castShadow>
              <boxGeometry args={[0.15, 0.1, 1.2]} />
              <meshStandardMaterial color={wheelColor} roughness={0.5} metalness={0.4} />
            </mesh>
            {/* Hitch coupling */}
            <mesh position={[0, 0.5, 3.8]} castShadow>
              <sphereGeometry args={[0.12, 8, 8]} />
              <meshStandardMaterial color={wheelColor} roughness={0.4} metalness={0.5} />
            </mesh>

            {/* Door - right side */}
            <mesh position={[1.21, 1.0, 0.5]}>
              <boxGeometry args={[0.05, 1.4, 0.8]} />
              <meshStandardMaterial color="#5d4037" roughness={0.8} />
            </mesh>
            {/* Door window */}
            <mesh position={[1.23, 1.3, 0.5]}>
              <boxGeometry args={[0.02, 0.5, 0.5]} />
              <meshStandardMaterial color="#90caf9" roughness={0.2} metalness={0.3} />
            </mesh>
            {/* Door handle */}
            <mesh position={[1.25, 0.9, 0.2]}>
              <boxGeometry args={[0.04, 0.08, 0.15]} />
              <meshStandardMaterial color="#bdbdbd" roughness={0.3} metalness={0.6} />
            </mesh>

            {/* Windows - left side */}
            {[-0.8, 0.8].map((z, i) => (
              <mesh key={`win-l-${i}`} position={[-1.21, 1.3, z]}>
                <boxGeometry args={[0.05, 0.6, 0.7]} />
                <meshStandardMaterial color="#90caf9" roughness={0.2} metalness={0.3} />
              </mesh>
            ))}
            {/* Window - right side (back) */}
            <mesh position={[1.21, 1.3, -0.8]}>
              <boxGeometry args={[0.05, 0.6, 0.7]} />
              <meshStandardMaterial color="#90caf9" roughness={0.2} metalness={0.3} />
            </mesh>

            {/* Rear window */}
            <mesh position={[0, 1.4, -2.51]}>
              <boxGeometry args={[1.2, 0.5, 0.05]} />
              <meshStandardMaterial color="#90caf9" roughness={0.2} metalness={0.3} />
            </mesh>

            {/* Wheels */}
            {[-0.9, 0.9].map((x, i) => (
              <group key={`wheel-${i}`} position={[x, 0.35, -1]}>
                {/* Tire */}
                <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
                  <cylinderGeometry args={[0.35, 0.35, 0.2, 16]} />
                  <meshStandardMaterial color="#1a1a1a" roughness={0.9} />
                </mesh>
                {/* Hubcap */}
                <mesh position={[x > 0 ? 0.11 : -0.11, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                  <cylinderGeometry args={[0.18, 0.18, 0.05, 12]} />
                  <meshStandardMaterial color="#bdbdbd" roughness={0.3} metalness={0.6} />
                </mesh>
                {/* Wheel well/fender */}
                <mesh position={[0, 0.25, 0]} castShadow>
                  <boxGeometry args={[0.3, 0.35, 0.5]} />
                  <meshStandardMaterial color={color} roughness={0.7} />
                </mesh>
              </group>
            ))}

            {/* Awning rolled up on side */}
            <mesh position={[-1.35, 2.0, 0]} castShadow>
              <cylinderGeometry args={[0.12, 0.12, 3, 8]} />
              <meshStandardMaterial color="#f57c00" roughness={0.7} />
            </mesh>

            {/* Small steps at door */}
            <mesh position={[1.5, 0.15, 0.5]} castShadow>
              <boxGeometry args={[0.4, 0.1, 0.5]} />
              <meshStandardMaterial color={wheelColor} roughness={0.6} metalness={0.3} />
            </mesh>

            {/* Propane tank on tongue */}
            <mesh position={[0.3, 0.6, 2.8]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <capsuleGeometry args={[0.12, 0.3, 4, 8]} />
              <meshStandardMaterial color="#f5f5f5" roughness={0.5} />
            </mesh>

            {/* Roof vent */}
            <mesh position={[0, 2.4, 0]} castShadow>
              <boxGeometry args={[0.4, 0.15, 0.4]} />
              <meshStandardMaterial color="#f5f5f5" roughness={0.5} />
            </mesh>

            {/* Cute flower box on window */}
            <group position={[-1.35, 0.9, 0.8]}>
              <mesh castShadow>
                <boxGeometry args={[0.2, 0.15, 0.5]} />
                <meshStandardMaterial color="#6d4c41" roughness={0.85} />
              </mesh>
              {/* Flowers */}
              {[-0.15, 0, 0.15].map((z, i) => (
                <mesh key={`flower-${i}`} position={[0, 0.15, z]} castShadow>
                  <sphereGeometry args={[0.08, 6, 6]} />
                  <meshStandardMaterial
                    color={['#e91e63', '#ffeb3b', '#e91e63'][i]}
                    roughness={0.7}
                  />
                </mesh>
              ))}
            </group>
          </group>
        }
      >
        <group position={[0.115, 0, 0.6925]}>
          <GeneratedModel asset="caravan" />
        </group>
      </GeneratedBoundary>
    </group>
  );
};

/**
 * A small asphalt hardstanding, for vehicles that would otherwise be parked on
 * grass.
 *
 * Two sites needed one and neither had it: the taco truck at (135, 42) sits
 * 5.5 m clear of the car park's east kerb, and the three `CuteCar`s beside the
 * gas station stand in open field 15 m south of the forecourt apron. Both read
 * exactly as what they are - vehicles abandoned in a meadow - on the `carpark`
 * and `forecourt` review cameras.
 *
 * Follows CLAUDE.md's exterior stack rather than inventing a Y offset: the pad
 * shares the site's ground datum with the terrain and separates from it by
 * `polygonOffset` alone, at `exteriorMid` so it draws over the grass channel and
 * under any road or marking laid on top of it. Reuses `TARMAC_LOT_MAP`, so it
 * costs no new texture and matches the car park it is a satellite of.
 */
const Hardstanding: React.FC<{
  position: [number, number, number];
  size: [number, number];
  rotation?: number;
}> = ({ position, size, rotation = 0 }) => (
  <mesh
    position={[position[0], EXTERIOR_LAYERS.ground, position[2]]}
    rotation={[-Math.PI / 2, 0, rotation]}
    receiveShadow
  >
    <planeGeometry args={size} />
    <meshStandardMaterial
      color="#ffffff"
      roughness={0.9}
      map={TARMAC_LOT_MAP}
      roughnessMap={TARMAC_LOT_ROUGHNESS}
      polygonOffset
      polygonOffsetFactor={POLYGON_OFFSET.exteriorMid.factor}
      polygonOffsetUnits={POLYGON_OFFSET.exteriorMid.units}
    />
  </mesh>
);

// Cute food truck
const FoodTruck: React.FC<{
  position: [number, number, number];
  rotation?: number;
  color?: string;
  name?: string;
}> = ({ position, rotation = 0, color = '#ff6b6b', name = 'TACOS' }) => {
  const trimColor = '#ffffff';

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <GeneratedBoundary
        fallback={
          <group>
            {' '}
            {/* Main truck body */}
            <mesh position={[0, 1.2, 0]} castShadow receiveShadow>
              <boxGeometry args={[2.8, 2.2, 6]} />
              <meshStandardMaterial color={color} roughness={0.6} />
            </mesh>
            {/* Cab section (front) */}
            <mesh position={[0, 0.9, 3.5]} castShadow receiveShadow>
              <boxGeometry args={[2.6, 1.6, 1.5]} />
              <meshStandardMaterial color={color} roughness={0.6} />
            </mesh>
            {/* Cab roof (slightly lower) */}
            <mesh position={[0, 1.8, 3.5]} castShadow>
              <boxGeometry args={[2.5, 0.15, 1.4]} />
              <meshStandardMaterial color={color} roughness={0.6} />
            </mesh>
            {/* Windshield */}
            <mesh position={[0, 1.1, 4.26]} rotation={[0.15, 0, 0]}>
              <boxGeometry args={[2.2, 1.0, 0.08]} />
              <meshStandardMaterial color="#64b5f6" roughness={0.1} metalness={0.4} />
            </mesh>
            {/* Side windows - cab */}
            {[-1.31, 1.31].map((x, i) => (
              <mesh key={`cab-win-${i}`} position={[x, 1.1, 3.5]}>
                <boxGeometry args={[0.05, 0.7, 1.0]} />
                <meshStandardMaterial color="#64b5f6" roughness={0.1} metalness={0.4} />
              </mesh>
            ))}
            {/* Serving window (left side) */}
            <group position={[-1.41, 1.4, -0.5]}>
              {/* Window opening */}
              <mesh>
                <boxGeometry args={[0.05, 1.2, 2.0]} />
                <meshStandardMaterial color="#1a1a2e" roughness={0.9} />
              </mesh>
              {/* Window frame */}
              <mesh position={[-0.03, 0, 0]}>
                <boxGeometry args={[0.08, 1.4, 2.2]} />
                <meshStandardMaterial color={trimColor} roughness={0.5} />
              </mesh>
              {/* Serving counter/shelf */}
              <mesh position={[-0.4, -0.5, 0]} castShadow>
                <boxGeometry args={[0.8, 0.08, 2.0]} />
                <meshStandardMaterial color="#5d4037" roughness={0.7} />
              </mesh>
            </group>
            {/* Awning over serving window */}
            <group position={[-1.8, 2.1, -0.5]}>
              <mesh rotation={[0, 0, -0.4]} castShadow>
                <boxGeometry args={[1.2, 0.08, 2.4]} />
                <meshStandardMaterial color="#f57c00" roughness={0.6} />
              </mesh>
              {/* Awning stripes */}
              {[-0.8, -0.4, 0, 0.4, 0.8].map((z, i) => (
                <mesh key={`awn-${i}`} position={[0, -0.03, z]} rotation={[0, 0, -0.4]}>
                  <boxGeometry args={[1.2, 0.04, 0.35]} />
                  <meshStandardMaterial
                    color={i % 2 === 0 ? '#f57c00' : '#fff3e0'}
                    roughness={0.6}
                  />
                </mesh>
              ))}
            </group>
            {/* Trim stripe */}
            <mesh position={[0, 0.4, 0]}>
              <boxGeometry args={[2.85, 0.15, 6.05]} />
              <meshStandardMaterial color={trimColor} roughness={0.5} />
            </mesh>
            {/* Roof equipment - AC unit */}
            <mesh position={[0.5, 2.45, 0]} castShadow>
              <boxGeometry args={[1.0, 0.4, 1.2]} />
              <meshStandardMaterial color="#9e9e9e" roughness={0.5} metalness={0.3} />
            </mesh>
            {/* Roof vent */}
            <mesh position={[-0.5, 2.4, -1]} castShadow>
              <cylinderGeometry args={[0.2, 0.25, 0.3, 8]} />
              <meshStandardMaterial color="#757575" roughness={0.5} metalness={0.4} />
            </mesh>
            {/* Wheels */}
            {[
              [-1.0, 2.5],
              [1.0, 2.5],
              [-1.0, -1.8],
              [1.0, -1.8],
            ].map(([x, z], i) => (
              <group key={`wheel-${i}`} position={[x, 0.4, z]}>
                <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
                  <cylinderGeometry args={[0.4, 0.4, 0.25, 16]} />
                  <meshStandardMaterial color="#1a1a1a" roughness={0.9} />
                </mesh>
                <mesh position={[x > 0 ? 0.14 : -0.14, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                  <cylinderGeometry args={[0.2, 0.2, 0.06, 12]} />
                  <meshStandardMaterial color="#bdbdbd" roughness={0.3} metalness={0.6} />
                </mesh>
              </group>
            ))}
            {/* Headlights */}
            {[-0.8, 0.8].map((x, i) => (
              <mesh key={`hl-${i}`} position={[x, 0.7, 4.28]} castShadow>
                <cylinderGeometry args={[0.15, 0.15, 0.08, 12]} />
                <meshStandardMaterial
                  color="#ffeb3b"
                  roughness={0.3}
                  emissive="#ffeb3b"
                  emissiveIntensity={0.2}
                />
              </mesh>
            ))}
            {/* Bumper */}
            <mesh position={[0, 0.35, 4.35]} castShadow>
              <boxGeometry args={[2.4, 0.2, 0.15]} />
              <meshStandardMaterial color="#424242" roughness={0.5} metalness={0.4} />
            </mesh>
            {/* Rear lights */}
            {[-1.0, 1.0].map((x, i) => (
              <mesh key={`tl-${i}`} position={[x, 0.8, -3.01]}>
                <boxGeometry args={[0.3, 0.2, 0.05]} />
                <meshStandardMaterial
                  color="#ef5350"
                  roughness={0.4}
                  emissive="#ef5350"
                  emissiveIntensity={0.1}
                />
              </mesh>
            ))}
            {/* Menu board on side */}
            <group position={[-1.45, 1.4, 1.5]} rotation={[0, -0.1, 0]}>
              <mesh castShadow>
                <boxGeometry args={[0.08, 0.8, 0.6]} />
                <meshStandardMaterial color="#2d2d2d" roughness={0.8} />
              </mesh>
            </group>
            {/* Name sign on top */}
            <Text
              position={[-1.42, 1.9, -0.5]}
              rotation={[0, -Math.PI / 2, 0]}
              fontSize={0.35}
              color="#ffffff"
              anchorX="center"
              anchorY="middle"
              fontWeight="bold"
            >
              {name}
            </Text>
            {/* Decorative string lights (just little spheres) */}
            {[-1.5, -1.0, -0.5, 0, 0.5].map((z, i) => (
              <mesh key={`light-${i}`} position={[-1.5, 2.25, z]} castShadow>
                <sphereGeometry args={[0.06, 8, 8]} />
                <meshStandardMaterial
                  color={['#ffeb3b', '#ff7043', '#4fc3f7', '#ab47bc', '#ffeb3b'][i]}
                  emissive={['#ffeb3b', '#ff7043', '#4fc3f7', '#ab47bc', '#ffeb3b'][i]}
                  emissiveIntensity={0.3}
                  roughness={0.4}
                />
              </mesh>
            ))}
            {/* Small generator on back */}
            <mesh position={[0, 0.3, -3.3]} castShadow>
              <boxGeometry args={[0.8, 0.5, 0.5]} />
              <meshStandardMaterial color="#616161" roughness={0.6} metalness={0.3} />
            </mesh>
          </group>
        }
      >
        <group position={[-0.3991, 0, 0.4375]}>
          <GeneratedModel asset="foodTruck" />
        </group>
        {/* Measured outer awning edge, clear of the generated service window. */}
        <mesh position={[-2.37, 1.86, -0.5]}>
          <boxGeometry args={[0.035, 0.3, 1.8]} />
          <meshStandardMaterial color="#343e36" roughness={0.7} />
        </mesh>
        <Text
          position={[-2.39, 1.86, -0.5]}
          rotation={[0, -Math.PI / 2, 0]}
          fontSize={0.23}
          surface="painted"
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
          fontWeight="bold"
        >
          {name}
        </Text>

        {/* Decorative string lights (just little spheres) */}
        {[-1.5, -1.0, -0.5, 0, 0.5].map((z, i) => (
          <mesh key={`light-${i}`} position={[-2.4, 1.67, z]} castShadow>
            <sphereGeometry args={[0.06, 8, 8]} />
            <meshStandardMaterial
              color={['#ffeb3b', '#ff7043', '#4fc3f7', '#ab47bc', '#ffeb3b'][i]}
              emissive={['#ffeb3b', '#ff7043', '#4fc3f7', '#ab47bc', '#ffeb3b'][i]}
              emissiveIntensity={0.3}
              roughness={0.4}
            />
          </mesh>
        ))}

        {/* Rear lights */}
        {[-1.0, 1.0].map((x, i) => (
          <mesh key={`tl-${i}`} position={[x, 0.8, -3.56]}>
            <boxGeometry args={[0.3, 0.2, 0.05]} />
            <meshStandardMaterial
              color="#ef5350"
              roughness={0.4}
              emissive="#ef5350"
              emissiveIntensity={0.1}
            />
          </mesh>
        ))}

        {/* Small generator on back */}
        <mesh position={[0, 0.3, -3.75]} castShadow>
          <boxGeometry args={[0.8, 0.5, 0.5]} />
          <meshStandardMaterial color="#616161" roughness={0.6} metalness={0.3} />
        </mesh>
      </GeneratedBoundary>
    </group>
  );
};

// Brick carport/shelter structure - outdoor seating area with brick pillars
const BrickCarport: React.FC<{
  position: [number, number, number];
  rotation?: number;
  size?: [number, number, number]; // width, height, depth
}> = ({ position, rotation = 0, size = [8, 3.5, 6] }) => {
  const [width, height, depth] = size;

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <GeneratedBoundary
        fallback={
          <group>
            {/* Brick pillars at corners */}
            {[
              [-width / 2 + 0.3, 0.3],
              [width / 2 - 0.3, 0.3],
              [-width / 2 + 0.3, -depth / 2 + 0.3],
              [width / 2 - 0.3, -depth / 2 + 0.3],
            ].map(([x, z], i) => (
              <mesh key={`pillar-${i}`} position={[x, height / 2, z]} castShadow receiveShadow>
                <boxGeometry args={[0.5, height, 0.5]} />
                <meshStandardMaterial
                  // Was #b5836d, compensating for the albedo being read as linear.
                  // brickColor is sRGB-tagged now, so any tint double-multiplies.
                  color="#ffffff"
                  roughness={0.85}
                  map={PROCEDURAL_TEXTURES.brickColor}
                  normalMap={PROCEDURAL_TEXTURES.brickNormal}
                  normalScale={new THREE.Vector2(0.3, 0.3)}
                />
              </mesh>
            ))}

            {/* Roof structure */}
            <mesh position={[0, height + 0.15, -depth / 4]} castShadow receiveShadow>
              <boxGeometry args={[width + 0.4, 0.3, depth + 0.4]} />
              <meshStandardMaterial
                color="#6b4423"
                roughness={0.8}
                normalMap={PROCEDURAL_TEXTURES.panelNormal}
                normalScale={new THREE.Vector2(0.15, 0.15)}
              />
            </mesh>

            {/* Roof tiles/covering */}
            <mesh position={[0, height + 0.35, -depth / 4]} castShadow>
              <boxGeometry args={[width + 0.6, 0.1, depth + 0.6]} />
              <meshStandardMaterial color="#8b4513" roughness={0.9} />
            </mesh>
          </group>
        }
      >
        <group
          position={[0, 0, -depth / 4]}
          scale={[(width + 0.6) / 10.6, (height + 0.4) / 3.9, (depth + 0.6) / 8.6]}
        >
          <GeneratedModel asset="brickCarport" />
        </group>
      </GeneratedBoundary>
      {/* Floor/paved area */}
      <mesh position={[0, 0.02, -depth / 4]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial
          // Was #b0b0b0 - same compensating tint; cobblestone measured 3.9x
          // darker after the colour-space fix, so the tint has to go.
          color="#ffffff"
          roughness={0.9}
          map={PROCEDURAL_TEXTURES.cobblestoneColor}
          normalMap={PROCEDURAL_TEXTURES.cobblestoneNormal}
        />
      </mesh>

      {/* Picnic tables under the shelter */}
      {[-2, 2].map((x, i) => (
        <group key={`table-${i}`} position={[x, 0, -depth / 4]}>
          <GeneratedBoundary
            fallback={
              <group>
                {/* Table top */}
                <mesh position={[0, 0.75, 0]} castShadow>
                  <boxGeometry args={[1.8, 0.08, 0.8]} />
                  <meshStandardMaterial color="#8b6914" roughness={0.8} />
                </mesh>
                {/* Benches */}
                {[-0.55, 0.55].map((z, j) => (
                  <mesh key={`bench-${j}`} position={[0, 0.45, z]} castShadow>
                    <boxGeometry args={[1.8, 0.05, 0.3]} />
                    <meshStandardMaterial color="#8b6914" roughness={0.8} />
                  </mesh>
                ))}
                {/* Table legs */}
                {[-0.7, 0.7].map((lx, k) => (
                  <mesh key={`leg-${k}`} position={[lx, 0.4, 0]} castShadow>
                    <boxGeometry args={[0.08, 0.8, 0.6]} />
                    <meshStandardMaterial color="#5d4037" roughness={0.9} />
                  </mesh>
                ))}
              </group>
            }
          >
            <GeneratedModel asset="picnicTable" />
          </GeneratedBoundary>
        </group>
      ))}
    </group>
  );
};

// Gravel/paved path component
const GravelPath: React.FC<{
  start: [number, number, number];
  end: [number, number, number];
  width?: number;
  type?: 'gravel' | 'paved' | 'cobble';
}> = ({ start, end, width = 2, type = 'gravel' }) => {
  const dx = end[0] - start[0];
  const dz = end[2] - start[2];
  const rawLength = Math.sqrt(dx * dx + dz * dz);
  const angle = Math.atan2(dx, dz);
  const midX = (start[0] + end[0]) / 2;
  const midZ = (start[2] + end[2]) / 2;

  // CRITICAL: Guard against NaN/zero dimensions to prevent PlaneGeometry errors
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 2;
  const safeLength = Number.isFinite(rawLength) && rawLength > 0 ? rawLength : 0.1;

  // Hue-preserving lifts over a shared tarmac albedo. Each keeps its own cast
  // (gravel warm and pale, paved neutral, cobble browner) so the three path
  // types still read apart, but none of them re-multiplies the map's hue.
  const colors = {
    gravel: '#e6e0d2',
    paved: '#c9ced2',
    cobble: '#d8cec2',
  };

  // On the site's ground datum, held above the terrain by polygonOffset alone -
  // the exterior stack CLAUDE.md documents, and what the canal towpath above
  // already does. The literal 0.08 this replaces was chosen to clear
  // `TerrainGround`'s old 0.05 default; the terrain now renders at
  // `SITE_LAYOUT.datum.terrain` (-0.02), which left the path floating 10 cm over
  // ground that already paints a path under it.
  const pathY = EXTERIOR_LAYERS.ground;

  return (
    <group position={[midX, pathY, midZ]} rotation={[0, -angle, 0]}>
      {/* Path surface. The negative offset is now load-bearing rather than
          belt-and-braces: it is the whole of the separation from the terrain's
          `exteriorBase` +6. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[safeWidth, safeLength]} />
        <meshStandardMaterial
          color={colors[type]}
          roughness={0.95}
          map={TARMAC_PATH_MAP}
          roughnessMap={TARMAC_PATH_ROUGHNESS}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
        />
      </mesh>
      {/* Path borders - slightly above path surface */}
      {[-1, 1].map((side, i) => (
        <mesh
          key={i}
          position={[side * (safeWidth / 2 + 0.1), 0.01, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[0.15, safeLength]} />
          <meshStandardMaterial
            color="#57534e"
            roughness={0.9}
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-3}
            polygonOffsetUnits={-3}
          />
        </mesh>
      ))}
    </group>
  );
};

// Curved path section for connecting paths
const CurvedPath: React.FC<{
  position: [number, number, number];
  radius: number;
  radiusZ?: number;
  startAngle: number;
  endAngle: number;
  width?: number;
  type?: 'gravel' | 'paved';
}> = ({ position, radius, radiusZ, startAngle, endAngle, width = 2, type = 'gravel' }) => {
  const segments = Math.max(8, Math.ceil(Math.abs(endAngle - startAngle) / (Math.PI / 16)));
  const angleStep = (endAngle - startAngle) / segments;

  // CRITICAL: Guard against NaN/zero dimensions to prevent PlaneGeometry errors
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 2;
  const safeRadius = Number.isFinite(radius) && radius > 0 ? radius : 1;
  const safeRadiusZ = Number.isFinite(radiusZ) && (radiusZ ?? 0) > 0 ? (radiusZ ?? 1) : safeRadius;

  // Same hue-preserving lift as GravelPath: the tarmac map now supplies the
  // albedo, so these tints only carry the warm/neutral cast that tells the two
  // path types apart.
  const colors = {
    gravel: '#dcd6c6',
    paved: '#bfc6cb',
  };

  // Ground datum plus polygonOffset, as GravelPath above - the literal 0.08 was
  // clearance for `TerrainGround`'s old 0.05 default and floats 10 cm now.
  const pathY = EXTERIOR_LAYERS.ground;

  return (
    <group position={[position[0], pathY, position[2]]}>
      {Array.from({ length: segments }).map((_, i) => {
        const angle1 = startAngle + i * angleStep;
        const angle2 = startAngle + (i + 1) * angleStep;
        const x1 = Math.cos(angle1) * safeRadius;
        const z1 = Math.sin(angle1) * safeRadiusZ;
        const x2 = Math.cos(angle2) * safeRadius;
        const z2 = Math.sin(angle2) * safeRadiusZ;
        const midX = (x1 + x2) / 2;
        const midZ = (z1 + z2) / 2;
        const rawSegLength = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(z2 - z1, 2));
        const safeSegLength =
          Number.isFinite(rawSegLength) && rawSegLength > 0 ? rawSegLength : 0.1;
        const segAngle = Math.atan2(z2 - z1, x2 - x1);

        return (
          <group key={i} position={[midX, 0, midZ]} rotation={[0, -segAngle, 0]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
              <planeGeometry args={[safeSegLength + 0.25, safeWidth]} />
              <meshStandardMaterial
                color={colors[type]}
                roughness={0.95}
                map={TARMAC_PATH_MAP}
                roughnessMap={TARMAC_PATH_ROUGHNESS}
                depthWrite={false}
                polygonOffset
                polygonOffsetFactor={-2}
                polygonOffsetUnits={-2}
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
};

// Footbridge over water
const FootBridge: React.FC<{
  position: [number, number, number];
  length: number;
  width?: number;
  rotation?: number;
  style?: 'wooden' | 'stone' | 'iron';
}> = ({ position, length, width = 3, rotation = 0, style = 'wooden' }) => {
  const colors = {
    wooden: { deck: '#8b5a2b', rail: '#6b4423', support: '#5d4037' },
    stone: { deck: '#6b7280', rail: '#4b5563', support: '#374151' },
    iron: { deck: '#374151', rail: '#1f2937', support: '#111827' },
  };
  const c = colors[style];

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <GeneratedBoundary
        enabled={length === 14 && width === 2.5 && style === 'wooden'}
        fallback={
          <>
            {/* Bridge deck */}
            <mesh position={[0, 1.2, 0]} castShadow receiveShadow>
              <boxGeometry args={[width, 0.2, length]} />
              <meshStandardMaterial color={c.deck} roughness={0.8} />
            </mesh>
            {/* Deck planks detail */}
            {style === 'wooden' &&
              Array.from({ length: Math.floor(length / 0.4) }).map((_, i) => (
                <mesh key={i} position={[0, 1.32, -length / 2 + 0.2 + i * 0.4]} castShadow>
                  <boxGeometry args={[width - 0.1, 0.03, 0.35]} />
                  <meshStandardMaterial color="#7a4a1b" roughness={0.9} />
                </mesh>
              ))}
            {/* Support beams underneath */}
            {[-length / 3, 0, length / 3].map((z, i) => (
              <mesh key={`support-${i}`} position={[0, 0.5, z]} castShadow>
                <boxGeometry args={[width + 0.5, 0.3, 0.4]} />
                <meshStandardMaterial color={c.support} roughness={0.85} />
              </mesh>
            ))}
            {/* Vertical supports */}
            {[-length / 3, length / 3].map((z, i) => (
              <React.Fragment key={`vert-${i}`}>
                <mesh position={[-width / 2 - 0.1, 0.6, z]} castShadow>
                  <boxGeometry args={[0.25, 1.2, 0.25]} />
                  <meshStandardMaterial color={c.support} roughness={0.8} />
                </mesh>
                <mesh position={[width / 2 + 0.1, 0.6, z]} castShadow>
                  <boxGeometry args={[0.25, 1.2, 0.25]} />
                  <meshStandardMaterial color={c.support} roughness={0.8} />
                </mesh>
              </React.Fragment>
            ))}
            {/* Railings */}
            {[-1, 1].map((side, i) => (
              <group key={`rail-${i}`} position={[side * (width / 2 + 0.15), 0, 0]}>
                {/* Top rail */}
                <mesh position={[0, 2, 0]} castShadow>
                  <boxGeometry args={[0.1, 0.1, length - 0.5]} />
                  <meshStandardMaterial color={c.rail} roughness={0.7} />
                </mesh>
                {/* Railing posts */}
                {Array.from({ length: Math.floor(length / 1.5) + 1 }).map((_, j) => (
                  <mesh key={j} position={[0, 1.6, -length / 2 + 0.5 + j * 1.5]} castShadow>
                    <boxGeometry args={[0.08, 0.9, 0.08]} />
                    <meshStandardMaterial color={c.rail} roughness={0.75} />
                  </mesh>
                ))}
              </group>
            ))}
          </>
        }
      >
        <group position={[0, 0, 0.02]}>
          <GeneratedModel asset="woodenFootbridge" />
        </group>
      </GeneratedBoundary>
    </group>
  );
};

// Canal lock gate
const LockGate: React.FC<{
  position: [number, number, number];
  width: number;
  rotation?: number;
}> = ({ position, width, rotation = 0 }) => (
  <group position={position} rotation={[0, rotation, 0]}>
    <GeneratedBoundary
      enabled={width === 10}
      fallback={
        <>
          {/* Gate posts */}
          {[-width / 2 - 0.3, width / 2 + 0.3].map((x, i) => (
            <mesh key={i} position={[x, 1.5, 0]} castShadow>
              <boxGeometry args={[0.5, 3, 0.5]} />
              <meshStandardMaterial color="#374151" roughness={0.7} metalness={0.3} />
            </mesh>
          ))}
          {/* Gate doors (closed) */}
          {[-1, 1].map((side, i) => (
            <mesh key={`door-${i}`} position={[(side * width) / 4, 0.5, 0]} castShadow>
              <boxGeometry args={[width / 2 - 0.2, 2.5, 0.3]} />
              <meshStandardMaterial color="#1f2937" roughness={0.8} />
            </mesh>
          ))}
          {/* Operating beam */}
          <mesh position={[0, 2.8, -2]} rotation={[0.1, 0, 0]} castShadow>
            <boxGeometry args={[0.15, 0.15, 4]} />
            <meshStandardMaterial color="#78350f" roughness={0.85} />
          </mesh>
          {/* Walkway across top */}
          <mesh position={[0, 3, 0]} castShadow>
            <boxGeometry args={[width + 1.5, 0.15, 1]} />
            <meshStandardMaterial color="#6b7280" roughness={0.8} />
          </mesh>
        </>
      }
    >
      <group position={[0, -0.75, -1.748748]}>
        <GeneratedModel asset="lockGateStructure" receiveShadow={false} />
      </group>
    </GeneratedBoundary>
  </group>
);

// Lamp post for paths
const PathLamp: React.FC<{
  position: [number, number, number];
  style?: 'modern' | 'victorian';
}> = React.memo(({ position, style = 'modern' }) => (
  <group position={position}>
    <ExteriorLampPool radius={style === 'victorian' ? 5.5 : 4.8} />
    <GeneratedBoundary
      fallback={
        <group>
          {/* Pole */}
          <mesh position={[0, 2, 0]} castShadow>
            <cylinderGeometry args={[0.08, 0.1, 4, 8]} />
            <meshStandardMaterial
              color={style === 'victorian' ? '#1f2937' : '#6b7280'}
              roughness={0.5}
              metalness={0.4}
            />
          </mesh>
          {/* Lamp head */}
          {style === 'victorian' ? (
            <group position={[0, 4.2, 0]}>
              <mesh castShadow>
                <boxGeometry args={[0.4, 0.5, 0.4]} />
                <meshStandardMaterial color="#1f2937" roughness={0.5} metalness={0.3} />
              </mesh>
              <mesh position={[0, -0.1, 0]} material={EXTERIOR_LAMP_LENS_MATERIAL}>
                <boxGeometry args={[0.3, 0.25, 0.3]} />
              </mesh>
            </group>
          ) : (
            <group position={[0, 4.1, 0]}>
              <mesh castShadow>
                <cylinderGeometry args={[0.2, 0.15, 0.3, 8]} />
                <meshStandardMaterial color="#4b5563" roughness={0.5} metalness={0.4} />
              </mesh>
              <mesh position={[0, -0.1, 0]} material={EXTERIOR_LAMP_LENS_MATERIAL}>
                <cylinderGeometry args={[0.12, 0.15, 0.15, 8]} />
              </mesh>
            </group>
          )}
        </group>
      }
    >
      <GeneratedLampModel style={style} />
    </GeneratedBoundary>
  </group>
));

// Bollard for paths and waterside
const Bollard: React.FC<{
  position: [number, number, number];
  type?: 'wood' | 'metal' | 'stone';
}> = React.memo(({ position, type = 'metal' }) => {
  const colors = {
    wood: '#5d4037',
    metal: '#374151',
    stone: '#6b7280',
  };
  return (
    <GeneratedBoundary
      enabled={type !== 'stone'}
      fallback={
        <mesh position={[position[0], position[1] + 0.4, position[2]]} castShadow>
          <cylinderGeometry args={[0.12, 0.15, 0.8, 8]} />
          <meshStandardMaterial
            color={colors[type]}
            roughness={type === 'metal' ? 0.5 : 0.85}
            metalness={type === 'metal' ? 0.4 : 0}
          />
        </mesh>
      }
    >
      <group position={position}>
        <GeneratedModel
          asset={type === 'metal' ? 'metalBollard' : 'woodenBollard'}
          receiveShadow={false}
        />
      </group>
    </GeneratedBoundary>
  );
});

// Information sign
const InfoSign: React.FC<{
  position: [number, number, number];
  text: string;
  rotation?: number;
}> = ({ position, text, rotation = 0 }) => (
  <group position={position} rotation={[0, rotation, 0]}>
    <GeneratedBoundary
      fallback={
        <group>
          {/* Post */}
          <mesh position={[0, 0.6, 0]} castShadow>
            <boxGeometry args={[0.1, 1.2, 0.1]} />
            <meshStandardMaterial color="#5d4037" roughness={0.85} />
          </mesh>
          {/* Sign board */}
          <mesh position={[0, 1.3, 0.08]} castShadow>
            <boxGeometry args={[0.8, 0.5, 0.05]} />
            <meshStandardMaterial color="#1f2937" roughness={0.7} />
          </mesh>
        </group>
      }
    >
      <GeneratedModel asset="infoSign" />
    </GeneratedBoundary>
    {/* Text */}
    <Text
      position={[0, 1.3, 0.12]}
      fontSize={0.12}
      surface="painted"
      color="#ffffff"
      anchorX="center"
      anchorY="middle"
    >
      {text}
    </Text>
  </group>
);

// Flower bed / hedge border
const HedgeRow: React.FC<{
  start: [number, number, number];
  end: [number, number, number];
  height?: number;
  width?: number;
}> = ({ start, end, height = 0.8, width = 0.6 }) => {
  const dx = end[0] - start[0];
  const dz = end[2] - start[2];
  const length = Math.sqrt(dx * dx + dz * dz);
  const angle = Math.atan2(dx, dz);
  const midX = (start[0] + end[0]) / 2;
  const midZ = (start[2] + end[2]) / 2;

  return (
    <GeneratedBoxSurface
      asset="hedgeUnit"
      size={[width, height, length]}
      material={HEDGE_SURFACE_MATERIAL}
      position={[midX, height / 2, midZ]}
      rotation={[0, -angle, 0]}
      castShadow
    />
  );
};

// Picnic table
const PicnicTable: React.FC<{
  position: [number, number, number];
  rotation?: number;
}> = ({ position, rotation = 0 }) => (
  <group position={position} rotation={[0, rotation, 0]}>
    <GeneratedBoundary
      fallback={
        <group>
          {/* Table top */}
          <mesh position={[0, 0.75, 0]} castShadow>
            <boxGeometry args={[1.8, 0.08, 0.8]} />
            <meshStandardMaterial color="#8b5a2b" roughness={0.85} />
          </mesh>
          {/* Bench seats */}
          {[-0.6, 0.6].map((z, i) => (
            <mesh key={i} position={[0, 0.45, z]} castShadow>
              <boxGeometry args={[1.8, 0.06, 0.3]} />
              <meshStandardMaterial color="#8b5a2b" roughness={0.85} />
            </mesh>
          ))}
          {/* Legs */}
          {[
            [-0.7, -0.4],
            [-0.7, 0.4],
            [0.7, -0.4],
            [0.7, 0.4],
          ].map(([x, z], i) => (
            <mesh key={i} position={[x, 0.35, z]} castShadow>
              <boxGeometry args={[0.08, 0.7, 0.08]} />
              <meshStandardMaterial color="#5d4037" roughness={0.9} />
            </mesh>
          ))}
          {/* Cross braces */}
          {[-0.7, 0.7].map((x, i) => (
            <mesh key={i} position={[x, 0.25, 0]} rotation={[0, 0, 0]} castShadow>
              <boxGeometry args={[0.06, 0.06, 0.9]} />
              <meshStandardMaterial color="#5d4037" roughness={0.9} />
            </mesh>
          ))}
        </group>
      }
    >
      <GeneratedModel asset="picnicTable" />
    </GeneratedBoundary>
  </group>
);

// Waste bin
const WasteBin: React.FC<{
  position: [number, number, number];
}> = ({ position }) => (
  <group position={position}>
    <GeneratedBoundary
      fallback={
        <group>
          <mesh position={[0, 0.4, 0]} castShadow>
            <cylinderGeometry args={[0.25, 0.22, 0.8, 8]} />
            <meshStandardMaterial color="#374151" roughness={0.6} metalness={0.3} />
          </mesh>
          {/* Rim */}
          <mesh position={[0, 0.82, 0]} castShadow>
            <torusGeometry args={[0.25, 0.03, 8, 16]} />
            <meshStandardMaterial color="#1f2937" roughness={0.5} metalness={0.4} />
          </mesh>
        </group>
      }
    >
      <GeneratedModel asset="wasteBin" />
    </GeneratedBoundary>
  </group>
);

// Curved text that wraps around a cylinder surface
const CurvedText: React.FC<{
  text: string;
  radius: number;
  height: number;
  fontSize?: number;
  color?: string;
  arcAngle?: number; // Total arc angle in radians (default: auto-calculate based on text)
  startAngle?: number; // Starting angle in radians (default: 0, facing +Z)
}> = ({ text, radius, height, fontSize = 2, color = '#1e293b', arcAngle, startAngle = 0 }) => {
  const chars = text.split('');
  const charCount = chars.length;

  // Estimate character width (approximately 0.6 * fontSize for most fonts)
  const charWidth = fontSize * 0.6;
  const totalTextWidth = charWidth * charCount;

  // Calculate arc angle needed to fit text, or use provided arcAngle
  // Arc length = radius * angle, so angle = arcLength / radius
  const calculatedArcAngle = arcAngle ?? totalTextWidth / radius;

  // Calculate angle step between characters
  const angleStep = calculatedArcAngle / Math.max(charCount - 1, 1);

  // Start angle offset to center the text
  const centerOffset = calculatedArcAngle / 2;

  return (
    <group position={[0, height, 0]}>
      {chars.map((char, i) => {
        // Calculate angle for this character (centered around startAngle)
        const angle = startAngle - centerOffset + i * angleStep;

        // Position on cylinder surface (slightly offset outward for visibility)
        const x = (radius + 0.1) * Math.sin(angle);
        const z = (radius + 0.1) * Math.cos(angle);

        // Rotation to face outward (perpendicular to cylinder surface)
        const rotationY = angle;

        return (
          <Text
            key={i}
            position={[x, 0, z]}
            rotation={[0, rotationY, 0]}
            fontSize={fontSize}
            color={color}
            anchorX="center"
            anchorY="middle"
          >
            {char}
          </Text>
        );
      })}
    </group>
  );
};

// Industrial grain silo - typical flour mill storage
// European-style covered bus stop with advertisements
const BusStop: React.FC<{
  position: [number, number, number];
  rotation?: number;
}> = ({ position, rotation = 0 }) => {
  const shelterWidth = 4;
  const shelterDepth = 1.8;
  const shelterHeight = 2.8;
  // Measured GLB end faces are at abs(x) 1.959 and 2.002 m.
  const adPanelCentre = 1.98;
  const adPanelWidth = 1.4;
  const adPanelHeight = 2;

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Generated structure only: authored glass, adverts and timetable remain live. */}
      <GeneratedBoundary
        fallback={
          <group>
            {/* Ground platform */}
            <mesh position={[0, 0.05, 0]} castShadow receiveShadow>
              <boxGeometry args={[shelterWidth + 0.4, 0.1, shelterDepth + 0.4]} />
              <meshStandardMaterial color="#6b7280" roughness={0.9} />
            </mesh>

            {/* Corner posts - dark green metal */}
            {[
              [-shelterWidth / 2, shelterDepth / 2],
              [shelterWidth / 2, shelterDepth / 2],
              [-shelterWidth / 2, -shelterDepth / 2],
              [shelterWidth / 2, -shelterDepth / 2],
            ].map(([x, z], i) => (
              <mesh key={i} position={[x, shelterHeight / 2, z]} castShadow>
                <boxGeometry args={[0.08, shelterHeight, 0.08]} />
                <meshStandardMaterial color="#1f4e3d" roughness={0.4} metalness={0.6} />
              </mesh>
            ))}

            {/* Roof */}
            <mesh position={[0, shelterHeight + 0.15, 0]} castShadow>
              <boxGeometry args={[shelterWidth + 0.3, 0.08, shelterDepth + 0.5]} />
              <meshStandardMaterial color="#1f4e3d" roughness={0.4} metalness={0.6} />
            </mesh>
            {[-1, 1].map((side) => (
              <group key={side} position={[side * adPanelCentre, 0, 0]}>
                <mesh position={[0, shelterHeight / 2, 0]} castShadow>
                  <boxGeometry args={[0.044, shelterHeight - 0.2, shelterDepth - 0.2]} />
                  <meshStandardMaterial color="#1f4e3d" roughness={0.4} metalness={0.6} />
                </mesh>
              </group>
            ))}
            {/* Bench */}
            <group position={[0, 0, -shelterDepth / 2 + 0.35]}>
              <mesh position={[0, 0.45, 0]} castShadow>
                <boxGeometry args={[shelterWidth - 0.5, 0.08, 0.4]} />
                <meshStandardMaterial color="#8b5a2b" roughness={0.8} />
              </mesh>
              {[-1.2, 0, 1.2].map((x, i) => (
                <mesh key={i} position={[x, 0.22, 0]} castShadow>
                  <boxGeometry args={[0.08, 0.44, 0.35]} />
                  <meshStandardMaterial color="#1f4e3d" roughness={0.4} metalness={0.6} />
                </mesh>
              ))}
            </group>
          </group>
        }
      >
        <GeneratedModel asset="busShelter" />
      </GeneratedBoundary>
      <mesh position={[0, shelterHeight + 0.06, 0]}>
        <boxGeometry args={[shelterWidth - 0.1, 0.04, shelterDepth + 0.3]} />
        <meshStandardMaterial color="#a7f3d0" transparent opacity={0.3} roughness={0.1} />
      </mesh>

      {/* Back panel - glass */}
      <mesh position={[0, shelterHeight / 2, -shelterDepth / 2 - 0.02]}>
        <boxGeometry args={[shelterWidth - 0.1, shelterHeight - 0.3, 0.04]} />
        <meshStandardMaterial color="#e0f2fe" transparent opacity={0.4} roughness={0.1} />
      </mesh>

      {/* LEFT AD PANEL - Millos Flour */}
      <group position={[-adPanelCentre, 0, 0]}>
        <mesh position={[-0.03, adPanelHeight / 2 + 0.3, 0]} rotation={[0, -Math.PI / 2, 0]}>
          <planeGeometry args={[adPanelWidth, adPanelHeight]} />
          <meshStandardMaterial color="#fff8e1" roughness={0.5} />
        </mesh>
        <mesh position={[0.03, adPanelHeight / 2 + 0.3, 0]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[adPanelWidth, adPanelHeight]} />
          <meshStandardMaterial color="#fff8e1" roughness={0.5} />
        </mesh>
        {/* Front ad content */}
        <group position={[-0.04, adPanelHeight / 2 + 0.3, 0]} rotation={[0, -Math.PI / 2, 0]}>
          <mesh position={[0, 0.65, 0.001]}>
            <planeGeometry args={[1.3, 0.35]} />
            <meshStandardMaterial color="#fbbf24" roughness={0.5} />
          </mesh>
          <Text
            position={[0, 0.65, 0.002]}
            fontSize={0.14}
            color="#1e3a5f"
            fontWeight="bold"
            anchorX="center"
            anchorY="middle"
          >
            MillOS FLOUR
          </Text>
          <Text
            position={[0, -0.6, 0.002]}
            fontSize={0.1}
            color="#4a5568"
            anchorX="center"
            anchorY="middle"
          >
            Bake With Love!
          </Text>
          <group position={[0, 0.05, 0.002]}>
            <mesh>
              <capsuleGeometry args={[0.18, 0.25, 8, 12]} />
              <meshStandardMaterial color="#d4a574" roughness={0.6} />
            </mesh>
            {[-0.1, 0, 0.1].map((x, i) => (
              <mesh key={i} position={[x, 0.12, 0.15]} rotation={[0.3, 0, 0]}>
                <boxGeometry args={[0.04, 0.12, 0.02]} />
                <meshStandardMaterial color="#8b5a2b" roughness={0.7} />
              </mesh>
            ))}
          </group>
        </group>
        {/* Back ad content */}
        <group position={[0.04, adPanelHeight / 2 + 0.3, 0]} rotation={[0, Math.PI / 2, 0]}>
          <mesh position={[0, 0.65, 0.001]}>
            <planeGeometry args={[1.3, 0.35]} />
            <meshStandardMaterial color="#fbbf24" roughness={0.5} />
          </mesh>
          <Text
            position={[0, 0.65, 0.002]}
            fontSize={0.14}
            color="#1e3a5f"
            fontWeight="bold"
            anchorX="center"
            anchorY="middle"
          >
            MillOS FLOUR
          </Text>
          <Text
            position={[0, -0.6, 0.002]}
            fontSize={0.1}
            color="#4a5568"
            anchorX="center"
            anchorY="middle"
          >
            Bake With Love!
          </Text>
          <group position={[0, 0.05, 0.002]}>
            <mesh>
              <capsuleGeometry args={[0.18, 0.25, 8, 12]} />
              <meshStandardMaterial color="#d4a574" roughness={0.6} />
            </mesh>
            {[-0.1, 0, 0.1].map((x, i) => (
              <mesh key={i} position={[x, 0.12, 0.15]} rotation={[0.3, 0, 0]}>
                <boxGeometry args={[0.04, 0.12, 0.02]} />
                <meshStandardMaterial color="#8b5a2b" roughness={0.7} />
              </mesh>
            ))}
          </group>
        </group>
      </group>

      {/* RIGHT AD PANEL - Dead Dino */}
      <group position={[adPanelCentre, 0, 0]}>
        <mesh position={[0.03, adPanelHeight / 2 + 0.3, 0]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[adPanelWidth, adPanelHeight]} />
          <meshStandardMaterial color="#e8f5e9" roughness={0.5} />
        </mesh>
        <mesh position={[-0.03, adPanelHeight / 2 + 0.3, 0]} rotation={[0, -Math.PI / 2, 0]}>
          <planeGeometry args={[adPanelWidth, adPanelHeight]} />
          <meshStandardMaterial color="#e8f5e9" roughness={0.5} />
        </mesh>
        {/* Front ad content */}
        <group position={[0.04, adPanelHeight / 2 + 0.3, 0]} rotation={[0, Math.PI / 2, 0]}>
          <mesh position={[0, 0.65, 0.001]}>
            <planeGeometry args={[1.3, 0.35]} />
            <meshStandardMaterial color="#e65100" roughness={0.5} />
          </mesh>
          <Text
            position={[0, 0.65, 0.002]}
            fontSize={0.12}
            color="#ffffff"
            fontWeight="bold"
            anchorX="center"
            anchorY="middle"
            surface="painted"
          >
            DEAD DINO
          </Text>
          <Text
            position={[0, -0.65, 0.002]}
            fontSize={0.08}
            color="#4a5568"
            anchorX="center"
            anchorY="middle"
          >
            Fill Up & Smile!
          </Text>
          <group position={[0, 0, 0.002]} scale={0.45} name="DeadDinoAdvertRelief">
            <GeneratedBoundary
              fallback={
                <group>
                  <mesh>
                    <sphereGeometry args={[0.5, 12, 10]} />
                    <meshStandardMaterial color="#4caf50" roughness={0.6} />
                  </mesh>
                  <mesh position={[0.35, 0.35, 0]}>
                    <sphereGeometry args={[0.32, 12, 10]} />
                    <meshStandardMaterial color="#4caf50" roughness={0.6} />
                  </mesh>
                  <group position={[0.45, 0.42, 0.22]}>
                    <mesh rotation={[0, 0, Math.PI / 4]}>
                      <boxGeometry args={[0.12, 0.03, 0.02]} />
                      <meshBasicMaterial color="#212121" />
                    </mesh>
                    <mesh rotation={[0, 0, -Math.PI / 4]}>
                      <boxGeometry args={[0.12, 0.03, 0.02]} />
                      <meshBasicMaterial color="#212121" />
                    </mesh>
                  </group>
                </group>
              }
            >
              <group position={[0, -0.65, 0.07]} scale={[0.7, 0.7, 0.1]}>
                <GeneratedModel asset="dinoMascot" />
              </group>
            </GeneratedBoundary>
          </group>
          <Text
            position={[0, -0.4, 0.002]}
            fontSize={0.1}
            color="#e65100"
            fontWeight="bold"
            anchorX="center"
            anchorY="middle"
          >
            Just 99p/L
          </Text>
        </group>
        {/* Back ad content */}
        <group position={[-0.04, adPanelHeight / 2 + 0.3, 0]} rotation={[0, -Math.PI / 2, 0]}>
          <mesh position={[0, 0.65, 0.001]}>
            <planeGeometry args={[1.3, 0.35]} />
            <meshStandardMaterial color="#e65100" roughness={0.5} />
          </mesh>
          <Text
            position={[0, 0.65, 0.002]}
            fontSize={0.12}
            color="#ffffff"
            fontWeight="bold"
            anchorX="center"
            anchorY="middle"
            surface="painted"
          >
            DEAD DINO
          </Text>
          <Text
            position={[0, -0.65, 0.002]}
            fontSize={0.08}
            color="#4a5568"
            anchorX="center"
            anchorY="middle"
          >
            Fill Up & Smile!
          </Text>
          <group position={[0, 0, 0.002]} scale={0.45} name="DeadDinoAdvertRelief">
            <GeneratedBoundary
              fallback={
                <group>
                  <mesh>
                    <sphereGeometry args={[0.5, 12, 10]} />
                    <meshStandardMaterial color="#4caf50" roughness={0.6} />
                  </mesh>
                  <mesh position={[0.35, 0.35, 0]}>
                    <sphereGeometry args={[0.32, 12, 10]} />
                    <meshStandardMaterial color="#4caf50" roughness={0.6} />
                  </mesh>
                  <group position={[0.45, 0.42, 0.22]}>
                    <mesh rotation={[0, 0, Math.PI / 4]}>
                      <boxGeometry args={[0.12, 0.03, 0.02]} />
                      <meshBasicMaterial color="#212121" />
                    </mesh>
                    <mesh rotation={[0, 0, -Math.PI / 4]}>
                      <boxGeometry args={[0.12, 0.03, 0.02]} />
                      <meshBasicMaterial color="#212121" />
                    </mesh>
                  </group>
                </group>
              }
            >
              <group position={[0, -0.65, 0.07]} scale={[0.7, 0.7, 0.1]}>
                <GeneratedModel asset="dinoMascot" />
              </group>
            </GeneratedBoundary>
          </group>
          <Text
            position={[0, -0.4, 0.002]}
            fontSize={0.1}
            color="#e65100"
            fontWeight="bold"
            anchorX="center"
            anchorY="middle"
          >
            Just 99p/L
          </Text>
        </group>
      </group>

      {/* Bus stop pole and sign */}
      <group position={[shelterWidth / 2 + 0.8, 0, shelterDepth / 2]}>
        <mesh position={[0, 1.8, 0]} castShadow>
          <cylinderGeometry args={[0.06, 0.06, 3.6, 8]} />
          <meshStandardMaterial color="#1f4e3d" roughness={0.4} metalness={0.6} />
        </mesh>
        <mesh position={[0, 3.3, 0]} castShadow>
          <cylinderGeometry args={[0.35, 0.35, 0.06, 16]} />
          <meshStandardMaterial color="#dc2626" roughness={0.5} />
        </mesh>
        <mesh position={[0, 3.3, 0.035]}>
          <circleGeometry args={[0.28, 16]} />
          <meshStandardMaterial color="#ffffff" roughness={0.85} />
        </mesh>
        <mesh position={[0, 2.9, 0.04]} castShadow>
          <boxGeometry args={[0.5, 0.25, 0.04]} />
          <meshStandardMaterial color="#1f2937" roughness={0.6} />
        </mesh>
        <Text
          position={[0, 2.9, 0.07]}
          fontSize={0.12}
          color="#fef3c7"
          anchorX="center"
          anchorY="middle"
          surface="painted"
        >
          42
        </Text>
      </group>

      {/* Timetable */}
      <mesh position={[0, 1.6, -shelterDepth / 2 + 0.02]} castShadow>
        <boxGeometry args={[0.6, 0.8, 0.04]} />
        <meshStandardMaterial color="#1f2937" roughness={0.6} />
      </mesh>
      <mesh position={[0, 1.6, -shelterDepth / 2 + 0.05]}>
        <planeGeometry args={[0.5, 0.7]} />
        <meshStandardMaterial color="#f5f5f5" roughness={0.85} />
      </mesh>
      <Text
        position={[0, 1.85, -shelterDepth / 2 + 0.06]}
        fontSize={0.06}
        color="#1f2937"
        fontWeight="bold"
        anchorX="center"
        anchorY="middle"
      >
        TIMETABLE
      </Text>
      <Text
        position={[0, 1.65, -shelterDepth / 2 + 0.06]}
        fontSize={0.04}
        color="#4b5563"
        anchorX="center"
        anchorY="middle"
      >
        Route 42 to Town Centre
      </Text>
    </group>
  );
};

/**
 * Bolted grain-bin geometry for the two exterior silo landmarks.
 *
 * These are the biggest objects on the site - 12 m x 35 m and 10 m x 30 m - and
 * the only ones visible from every corner of it, and they were a smooth
 * `CylinderGeometry` drum, a smooth `ConeGeometry` roof and a plain tapered
 * cylinder for a cap: three primitives that together read as a plastic bottle.
 * The machine-bank silos in `src/components/machines/CompactMachines.tsx`
 * already carry a corrugated shell and a rolled-eave bin roof. These are the
 * same family at five times the size.
 *
 * Every profile below was designed and previewed in Blender before it was
 * ported: the numbers are transcribed from
 * `scripts/blender/specs/grain-silos-exterior.json`, rendered with
 * `scripts/blender/machine_part_preview.py` at both the across-the-site
 * distance (62 m) and first-person walk-up distance (14 m), and from the orbit
 * camera's 34-degree elevation, which is the only view that shows the roof.
 *
 * Each profile keeps the EXACT envelope of the primitive it replaces - the
 * harness reports 0.00 mm drift on all of them - because these parts are
 * stacked by hand-tuned offsets: the roof eave overhangs the drum by 0.3 m, the
 * fill-cap flange lands on the roof peak, the plinth leaves a 0.5 m ledge. Any
 * drift here turns a fix into a new bug.
 */
const SILO_SHEET_INSET = 0.14; // sheet face, inset so the hoops stand proud
const SILO_SEAM_INSET = 0.17; // lap groove at each course boundary
const SILO_BASE_SKIRT = 0.55; // anchor flange at the foot of the wall
const SILO_EAVE_RING = 0.78; // heavier ring the roof lands on
const SILO_COURSE_TARGET = 1.1; // nominal rolled-sheet course height, metres
const SILO_RADIAL_SEGMENTS = 48; // 0.79 m facets on the 12 m drum (was 24 at HEAD)

/**
 * Bin wall: sheet courses, lap seams and stiffener hoops.
 *
 * The wall is built from SHEET COURSES, not from fine corrugation. Real bin
 * corrugation has a ~100 mm pitch; at the 60-100 m these silos are actually
 * viewed from that is under a pixel and averages straight back to a smooth
 * cylinder. A 1.08 m sheet course is ~13 px at the same distance, and it is the
 * feature the eye uses to read a bin's scale, because it already knows how tall
 * a steel sheet is. That works out at 31 courses on the 35 m silo and 26 on the
 * 30 m one.
 *
 * Three radii, and the envelope is the largest of them:
 *   `radius`                  stiffener hoops, base skirt, eave ring
 *   `radius` - 0.14           the sheet face - hoops stand 140 mm proud of it
 *   `radius` - 0.17           the lap groove at each course boundary
 * Insetting the wall instead of standing the hoops proud of it is what keeps
 * max radius exactly `radius`. It also lifts the `CurvedText` brand mark, which
 * is placed at exactly `radius`, off a wall it used to be coplanar with.
 *
 * Every fourth course is a stiffener hoop - except where one would land on the
 * brand mark at 0.6 * height. That run is left as clear sheet on purpose, the
 * way a real bin's painted mark is.
 *
 * This replaces twelve meshes per silo, not one. The eleven `TorusGeometry`
 * "corrugation rings" went with it: three.js lays a torus in the XY plane and
 * they carried no rotation, so they stood INSIDE the drum as vertical hoops and
 * all that ever escaped the wall was a thin lens at +/-X. The preview harness
 * counts its own lathe rebuild of the drum at 192 -> 6,000 verts; in three.js
 * the real figures are 292 for `CylinderGeometry(radius, radius, height, 48)`
 * and 6,125 for this lathe on the 35 m silo (5,194 on the 30 m one), against
 * 11 x 225 = 2,475 verts of broken torus deleted alongside.
 *
 * Two silos exist and neither carries pointer handlers - the first-person
 * controller collides against analytic boxes, not scene raycasts - so this
 * needs no picking proxy the way `raycastSiloShell` does in CompactMachines.
 * The geometry is cached per (radius, height) at module level so a re-render
 * never rebuilds it.
 *
 * A leaner 1.6 m course variant was built and previewed too (spec entry
 * `grain_silo_shell_lean`, 1,824 verts cheaper) and rejected: it reads as an
 * oil drum, and no rolled steel sheet is 1.6 m tall.
 */
function createGrainSiloShellGeometry(radius: number, height: number): THREE.LatheGeometry {
  const face = radius - SILO_SHEET_INSET;
  const seam = radius - SILO_SEAM_INSET;
  const wallFrom = SILO_BASE_SKIRT + 0.07;
  const wallTo = height - SILO_EAVE_RING;
  const courses = Math.max(6, Math.round((wallTo - wallFrom) / SILO_COURSE_TARGET));
  const course = (wallTo - wallFrom) / courses;
  const brandFrom = 0.52 * height;
  const brandTo = 0.7 * height;

  const profile: THREE.Vector2[] = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(radius, 0), // base skirt - envelope max radius
    new THREE.Vector2(radius, SILO_BASE_SKIRT),
    new THREE.Vector2(face, wallFrom),
  ];
  for (let i = 0; i < courses; i += 1) {
    const y = wallFrom + i * course;
    const hoop = i % 4 === 3 && (y + 0.74 * course < brandFrom || y + 0.3 * course > brandTo);
    if (hoop) {
      profile.push(
        new THREE.Vector2(face, y + 0.05 * course),
        new THREE.Vector2(face, y + 0.24 * course),
        new THREE.Vector2(radius, y + 0.3 * course), // hoop, 140 mm proud
        new THREE.Vector2(radius, y + 0.74 * course),
        new THREE.Vector2(face, y + 0.8 * course),
        new THREE.Vector2(face, y + 0.92 * course),
        new THREE.Vector2(seam, y + course) // lap groove
      );
    } else {
      profile.push(
        new THREE.Vector2(face, y + 0.05 * course),
        new THREE.Vector2(face, y + 0.92 * course),
        new THREE.Vector2(seam, y + course) // lap groove
      );
    }
  }
  profile.push(
    new THREE.Vector2(face, wallTo + 0.1),
    new THREE.Vector2(radius, wallTo + 0.2), // eave ring
    new THREE.Vector2(radius, height),
    new THREE.Vector2(0, height)
  );
  // The drum mesh sits at [0, height / 2, 0], so the lathe has to be centred.
  for (const point of profile) point.y -= height / 2;

  return new THREE.LatheGeometry(profile, SILO_RADIAL_SEGMENTS);
}

/**
 * Bin roof: rolled eave, drip lip, 24 radial panel seams, peak collar.
 *
 * Radial seams are what a bin roof actually shows, because it is built from
 * overlapping wedge panels - and unlike the 4.7 m machine-bank roof, where
 * ribs were previewed and rejected as indistinguishable at viewing distance,
 * this roof is 12.6 m across and the orbit camera looks DOWN on it. The seams
 * are its main contribution to the scene from the default view.
 *
 * `LatheGeometry` cannot modulate radius by angle, so this is a hand-built
 * surface: `THREE.LatheGeometry`'s exact vertex layout, winding and UV
 * convention with `rib` folded into the radius. The modulation is faded out
 * with a sine at both ends of the slope so the eave rim and the peak collar
 * stay perfectly circular - which is what holds the envelope at radius + 0.3
 * and lets the fill cap's flange land flush on the peak.
 *
 * The seam column is wrapped rather than duplicated so `computeVertexNormals`
 * does not split normals at phi = 0 and draw a bright line up one panel.
 *
 * The preview harness counts 192 -> 1,152 verts against the cone; in three.js
 * the real figures are 195 for `ConeGeometry(radius + 0.3, radius * 0.8, 48)`
 * and 1,152 here (2,112 triangles against the cone's 96), once per silo.
 */
function createGrainSiloRoofGeometry(radius: number): THREE.BufferGeometry {
  const SEGMENTS = 96; // two per drum facet, so the eave never reads polygonal
  const RIBS = 24; // 1.65 m panels on the 12.6 m roof
  const RIB_DEPTH = 0.16;

  const outer = radius + 0.3; // eave rim - envelope max radius
  const half = radius * 0.4; // half the cone height - envelope max y
  // (radius fraction of `outer`, y fraction of `half`)
  const shape: Array<[number, number]> = [
    [0.0, -1.0],
    [1.0, -1.0], // eave rim
    [0.99, -0.925], // rolled drip lip, curls up and in
    [0.952, -0.875], // fascia returns onto the slope
    [0.667, -0.333],
    [0.317, 0.354],
    [0.162, 0.658], // knuckle: the pitch breaks into the peak collar
    [0.095, 0.742],
    [0.089, 0.812], // collar shoulder
    [0.089, 0.958],
    [0.07, 1.0], // collar top chamfer
    [0.0, 1.0],
  ];
  const points = shape.map(([r, y]) => new THREE.Vector2(outer * r, half * y));
  const ribFrom = -0.925 * half; // drip lip: seams start above it
  const ribTo = 0.658 * half; // knuckle: seams stop below the collar

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const rows = points.length;
  for (let i = 0; i < SEGMENTS; i += 1) {
    const phi = (i / SEGMENTS) * Math.PI * 2;
    const rib = (1 - Math.cos(RIBS * phi)) / 2;
    const sin = Math.sin(phi);
    const cos = Math.cos(phi);
    for (let j = 0; j < rows; j += 1) {
      const span = Math.min(Math.max((points[j].y - ribFrom) / (ribTo - ribFrom), 0), 1);
      const fade = Math.sin(Math.PI * span);
      const r = Math.max(points[j].x - RIB_DEPTH * rib * fade, 0);
      positions.push(r * sin, points[j].y, r * cos);
      uvs.push(i / SEGMENTS, j / (rows - 1));
    }
  }
  for (let i = 0; i < SEGMENTS; i += 1) {
    const base = i * rows;
    const next = ((i + 1) % SEGMENTS) * rows;
    for (let j = 0; j < rows - 1; j += 1) {
      indices.push(base + j, next + j, base + j + 1);
      indices.push(next + j + 1, base + j + 1, next + j);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Roof fill cap: base flange, collar, overhanging rolled lid, lift-eye bead.
 *
 * `CylinderGeometry(0.8, 1, 1.5, 24)` was a plain tapered drum sitting on the
 * roof apex - the one object on the silo with clear sky behind it on every
 * side, and the least shaped. A real bin's fill cap is a collar with a lid
 * that overhangs it, and the overhang is what reads: it puts a shadow line
 * right where the silhouette narrows.
 *
 * Authored at world size rather than as a unit envelope, because the component
 * gives both silos the same 2 m cap - so this is one shared geometry, and it
 * keeps the replaced envelope exactly (max radius 1.0, y in [-0.75, 0.75]).
 * 24 segments, unchanged: the part is 2 m across and 39 m up.
 */
function createGrainSiloFillCapGeometry(): THREE.LatheGeometry {
  const profile = [
    new THREE.Vector2(0.0, -0.75),
    new THREE.Vector2(1.0, -0.75), // base flange rim - envelope max radius
    new THREE.Vector2(1.0, -0.66), // flange edge
    new THREE.Vector2(0.8, -0.6), // step in to the collar
    new THREE.Vector2(0.75, -0.52), // collar shoulder
    new THREE.Vector2(0.75, 0.16), // collar
    new THREE.Vector2(0.79, 0.2), // lid underside
    new THREE.Vector2(0.95, 0.26), // lid skirt overhangs the collar
    new THREE.Vector2(0.94, 0.36), // rolled rim
    new THREE.Vector2(0.86, 0.44), // rim rolls back onto the lid
    new THREE.Vector2(0.58, 0.6), // lid dome
    new THREE.Vector2(0.28, 0.7),
    new THREE.Vector2(0.12, 0.715), // neck under the lift-eye boss
    // A lathe cannot make a discrete lug, so this is the ring bead the eye
    // bolt would be welded into - a bright rim on the apex, not an ear.
    new THREE.Vector2(0.17, 0.735),
    new THREE.Vector2(0.09, 0.75), // envelope max y
    new THREE.Vector2(0.0, 0.75),
  ];
  return new THREE.LatheGeometry(profile, 24);
}

const GRAIN_SILO_FILL_CAP = createGrainSiloFillCapGeometry();

/**
 * Both silos are authored from `radius`/`height` props rather than from a unit
 * envelope, so the shell and roof cannot be one shared geometry the way the
 * cap is - a non-uniform scale would stretch the sheet courses differently on
 * each silo. Two entries land in each cache instead, built once.
 */
const grainSiloShells = new Map<string, THREE.LatheGeometry>();
const grainSiloRoofs = new Map<number, THREE.BufferGeometry>();

const getGrainSiloShell = (radius: number, height: number): THREE.LatheGeometry => {
  const key = `${radius}x${height}`;
  let geometry = grainSiloShells.get(key);
  if (!geometry) {
    geometry = createGrainSiloShellGeometry(radius, height);
    grainSiloShells.set(key, geometry);
  }
  return geometry;
};

const getGrainSiloRoof = (radius: number): THREE.BufferGeometry => {
  let geometry = grainSiloRoofs.get(radius);
  if (!geometry) {
    geometry = createGrainSiloRoofGeometry(radius);
    grainSiloRoofs.set(radius, geometry);
  }
  return geometry;
};

export const GrainSilo: React.FC<{
  position: [number, number, number];
  radius?: number;
  height?: number;
  color?: string;
}> = ({ position, radius = 5, height = 30, color = '#94a3b8' }) => (
  <group position={position}>
    <GeneratedBoundary
      enabled={
        (radius === 6 && height === 35 && color === '#94a3b8') ||
        (radius === 5 && height === 30 && color === '#a3b1c6')
      }
      fallback={
        <>
          {/* Bin wall - sheet courses, lap seams and stiffener hoops, cut into one
        lathe by `createGrainSiloShellGeometry`. This mesh also carries the
        eleven separate `TorusGeometry` "corrugation rings" that used to stand
        vertically INSIDE the drum: the hoops are part of the profile now, so
        they are actually around the wall, and eleven meshes per silo are gone
        with them. */}
          <mesh
            geometry={getGrainSiloShell(radius, height)}
            position={[0, height / 2, 0]}
            castShadow
            receiveShadow
          >
            {/* PAINTED steel, so dielectric. These metalness values are tuned
          against the sky-derived PMREM on `scene.environment`
          (environmentIntensity 0.30); if that probe is removed or its
          intensity changes materially, revisit them together. Bare hardware
          (ladder, cage, vents) deliberately keeps its high metalness so the
          fitting/volume contrast reads. */}
            <meshStandardMaterial color={color} roughness={0.66} metalness={0.15} />
          </mesh>
          {/* Bin roof - rolled eave, drip lip and 24 radial panel seams. The 12.6 m
        eave keeps exactly the cone's radius + 0.3 overhang. */}
          <mesh
            geometry={getGrainSiloRoof(radius)}
            position={[0, height + radius * 0.4, 0]}
            castShadow
          >
            <meshStandardMaterial color="#475569" roughness={0.58} metalness={0.2} />
          </mesh>
        </>
      }
    >
      <GeneratedModel
        asset={radius === 6 ? 'grainSiloLargeShell' : 'grainSiloSmallShell'}
        receiveShadow={true}
      />
    </GeneratedBoundary>
    {/* Fill cap - collar with an overhanging rolled lid. One shared geometry:
        the component gives both silos the same 2 m cap. */}
    <mesh geometry={GRAIN_SILO_FILL_CAP} position={[0, height + radius * 0.8, 0]} castShadow>
      <meshStandardMaterial color="#374151" roughness={0.4} metalness={0.6} />
    </mesh>
    {/* Access ladder */}
    <group position={[radius - 0.1, 0, 0]}>
      {/* Rails */}
      <mesh position={[-0.15, height / 2, 0]} castShadow>
        <boxGeometry args={[0.08, height, 0.08]} />
        <meshStandardMaterial color="#fbbf24" roughness={0.4} metalness={0.5} />
      </mesh>
      <mesh position={[0.15, height / 2, 0]} castShadow>
        <boxGeometry args={[0.08, height, 0.08]} />
        <meshStandardMaterial color="#fbbf24" roughness={0.4} metalness={0.5} />
      </mesh>
      {/* Rungs */}
      {Array.from({ length: Math.floor(height / 0.5) }).map((_, i) => (
        <mesh key={`rung-${i}`} position={[0, 0.5 + i * 0.5, 0]} castShadow>
          <boxGeometry args={[0.35, 0.04, 0.04]} />
          <meshStandardMaterial color="#fbbf24" roughness={0.4} metalness={0.5} />
        </mesh>
      ))}
      {/* Safety cage */}
      <mesh position={[0.3, height / 2 + 5, 0]}>
        <cylinderGeometry args={[0.5, 0.5, height - 10, 8, 1, true]} />
        <meshStandardMaterial
          color="#fbbf24"
          roughness={0.4}
          metalness={0.5}
          wireframe
          transparent
          opacity={0.8}
        />
      </mesh>
    </group>
    {/* Foundation ring. A shaped batter was rendered and rejected: this low,
        grazing-angle part reads as one concrete mass, so the original 24-sided
        frustum is the more disciplined geometry. */}
    <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
      <cylinderGeometry args={[radius + 0.5, radius + 0.8, 0.6, 24]} />
      <meshStandardMaterial color="#6b7280" roughness={0.9} />
    </mesh>
    {/* Contact darkening at the terrain datum. The opaque foundation ring
        (outer radius +0.8) writes depth first and rejects the middle of the
        blob, so what survives is the soft annulus spreading out from the
        plinth - which is what a ground shadow actually looks like. Putting the
        blob on TOP of the ring instead would leave its outer rim floating
        0.55 above the ground. */}
    <GroundBlob position={[0, 0]} scale={radius * 3.1} />
    {/* Company marking on silo - curved to wrap around cylinder */}
    <CurvedText text="MillOS" radius={radius} height={height * 0.6} fontSize={2} color="#1e293b" />
  </group>
);

// Open braced elevator: the two bucket legs stay visible through the steelwork.
// Working if all four supports meet the foundation and the gallery still joins
// the head at its authored endpoint, with no solid facade masking the legs.
const ELEVATOR_STEEL = new THREE.MeshStandardMaterial({
  color: '#869795',
  roughness: 0.52,
  metalness: 1,
});
const ELEVATOR_FOUNDATION = new THREE.MeshStandardMaterial({ color: '#92968e', roughness: 0.92 });
const ELEVATOR_HEAD = new THREE.MeshStandardMaterial({
  color: '#32666a',
  roughness: 0.64,
  metalness: 0,
});

export const GrainElevator: React.FC<{
  position: [number, number, number];
}> = ({ position }) => {
  const beams: {
    position: [number, number, number];
    size: [number, number, number];
    rotation?: [number, number, number];
  }[] = [];
  for (const x of [-3.5, 3.5]) {
    for (const z of [-2.5, 2.5]) {
      beams.push({ position: [x, 22.5, z], size: [0.55, 44, 0.55] });
    }
  }
  for (let bay = 0; bay < 7; bay++) {
    const y = 4 + bay * 6;
    for (const z of [-2.5, 2.5]) {
      beams.push({ position: [0, y, z], size: [7.5, 0.35, 0.35] });
      beams.push({
        position: [0, y + 3, z],
        size: [Math.hypot(7, 6), 0.18, 0.18],
        rotation: [0, 0, (bay % 2 ? -1 : 1) * Math.atan2(6, 7)],
      });
    }
    for (const x of [-3.5, 3.5]) {
      beams.push({ position: [x, y, 0], size: [0.35, 0.35, 5.5] });
      beams.push({
        position: [x, y + 3, 0],
        size: [0.18, 0.18, Math.hypot(5, 6)],
        rotation: [(bay % 2 ? -1 : 1) * Math.atan2(6, 5), 0, 0],
      });
    }
  }
  return (
    <group position={position} name="open-grain-elevator">
      {beams.map((beam, index) => (
        <GeneratedBoxSurface
          key={index}
          asset="factorySteelUnit"
          {...beam}
          material={ELEVATOR_STEEL}
          castShadow
          receiveShadow
        />
      ))}
      {[-1.2, 1.2].map((x) => (
        <GeneratedBoxSurface
          key={x}
          asset="bridgeHousingUnit"
          position={[x, 22.5, 0]}
          size={[1.35, 44, 1.35]}
          material={ELEVATOR_STEEL}
          castShadow
          receiveShadow
        />
      ))}
      <GeneratedBoxSurface
        asset="bridgeHousingUnit"
        position={[0, 46.5, 0]}
        size={[9, 7, 7]}
        material={ELEVATOR_HEAD}
        castShadow
        receiveShadow
      />
      {Array.from({ length: 15 }, (_, index) => (
        <GeneratedBoxSurface
          key={index}
          asset="factorySteelUnit"
          position={[-4.25 + index * 0.607, 46.5, 3.55]}
          size={[0.055, 6.9, 0.1]}
          material={ELEVATOR_HEAD}
          castShadow
        />
      ))}
      <GeneratedBoxSurface
        asset="factorySteelUnit"
        position={[0, 50.2, 0]}
        size={[9.8, 0.4, 7.8]}
        material={ELEVATOR_STEEL}
        castShadow
        receiveShadow
      />
      <GeneratedBoxSurface
        asset="factoryConcreteUnit"
        position={[0, 0.5, 0]}
        size={[11, 1, 9]}
        material={ELEVATOR_FOUNDATION}
        castShadow
        receiveShadow
      />
      <GeneratedBoxSurface
        asset="bridgeHousingUnit"
        position={[0, 2.1, 0]}
        size={[5.5, 3.2, 3.5]}
        material={ELEVATOR_HEAD}
        castShadow
        receiveShadow
      />
      <Text
        position={[0, 47.1, 3.63]}
        fontSize={1.1}
        color="#e8eeeb"
        anchorX="center"
        anchorY="middle"
        fontWeight="bold"
        surface="painted"
      >
        MillOS
      </Text>
    </group>
  );
};

// Connecting conveyor bridge between structures
export const ConveyorBridge: React.FC<{
  start: [number, number, number];
  end: [number, number, number];
}> = ({ start, end }) => {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const dz = end[2] - start[2];
  const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const orientation = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(dx, dy, dz).normalize()
  );

  const bays = Math.max(1, Math.ceil(length / 5));
  const bayLength = length / bays;
  const braceLength = Math.hypot(bayLength, 0.8);

  return (
    <group
      name="bulk-conveyor-gallery"
      position={[(start[0] + end[0]) / 2, (start[1] + end[1]) / 2, (start[2] + end[2]) / 2]}
      quaternion={orientation}
    >
      {/* The grain path stays enclosed. Side walkways and their braced support
          remain open, rather than stretching one solid box across the skyline. */}
      <GeneratedBoxSurface
        name="gallery-enclosed-conveyor"
        asset="bridgeHousingUnit"
        size={[1, 0.45, length]}
        position={[0, -0.15, 0]}
        material={BRIDGE_HOUSING_MATERIAL}
        castShadow
        receiveShadow
      />
      <GeneratedBoxSurface
        name="gallery-walkway"
        asset="bridgeSupportUnit"
        size={[2.4, 0.12, length]}
        position={[0, -0.5, 0]}
        material={BRIDGE_SUPPORT_MATERIAL}
        castShadow
        receiveShadow
      />
      {[-1, 1].map((side) => (
        <group key={side}>
          {[0.76, 0.16, -1.34].map((y) => (
            <mesh
              key={y}
              name="gallery-longitudinal-rail"
              position={[side * 1.14, y, 0]}
              castShadow
            >
              <boxGeometry args={[0.08, 0.08, length]} />
              <primitive object={BRIDGE_SUPPORT_MATERIAL} attach="material" />
            </mesh>
          ))}
          {Array.from({ length: bays + 1 }, (_, i) => (
            <mesh
              key={`post-${i}`}
              name="gallery-guardrail-post"
              position={[side * 1.14, 0.16, -length / 2 + i * bayLength]}
              castShadow
            >
              <boxGeometry args={[0.08, 1.2, 0.08]} />
              <primitive object={BRIDGE_SUPPORT_MATERIAL} attach="material" />
            </mesh>
          ))}
          {Array.from({ length: bays }, (_, i) => (
            <mesh
              key={`brace-${i}`}
              name="gallery-truss-brace"
              position={[side * 1.14, -0.94, -length / 2 + (i + 0.5) * bayLength]}
              rotation={[(i % 2 ? -1 : 1) * Math.atan2(0.8, bayLength), 0, 0]}
              castShadow
            >
              <boxGeometry args={[0.1, 0.1, braceLength]} />
              <primitive object={BRIDGE_SUPPORT_MATERIAL} attach="material" />
            </mesh>
          ))}
        </group>
      ))}
      {Array.from({ length: bays + 1 }, (_, i) => (
        <mesh
          key={`cross-${i}`}
          name="gallery-cross-member"
          position={[0, -0.64, -length / 2 + i * bayLength]}
          castShadow
        >
          <boxGeometry args={[2.4, 0.16, 0.14]} />
          <primitive object={BRIDGE_SUPPORT_MATERIAL} attach="material" />
        </mesh>
      ))}
    </group>
  );
};

// Loading dock canopy for trucks
export const LoadingDockCanopy: React.FC<{
  position: [number, number, number];
  width?: number;
  depth?: number;
  rotation?: number;
}> = ({ position, width = 15, depth = 8, rotation = 0 }) => (
  <group position={position} rotation={[0, rotation, 0]}>
    <GeneratedBoundary
      enabled={width === 20 && depth === 5}
      fallback={
        <>
          {/* Canopy roof */}
          <mesh position={[0, 6, 0]} castShadow receiveShadow>
            <boxGeometry args={[width, 0.2, depth]} />
            <meshStandardMaterial color="#374151" roughness={0.5} metalness={0.5} />
          </mesh>
          {/* Corrugated roof panels */}
          {Array.from({ length: Math.floor(depth / 2) }).map((_, i) => (
            <mesh key={`panel-${i}`} position={[0, 6.15, -depth / 2 + 1 + i * 2]} castShadow>
              <boxGeometry args={[width - 0.2, 0.1, 0.5]} />
              <meshStandardMaterial color="#64748b" roughness={0.5} metalness={0.5} />
            </mesh>
          ))}
          {/* Support columns */}
          {[
            [-width / 2 + 1, depth / 2 - 1],
            [width / 2 - 1, depth / 2 - 1],
            [-width / 2 + 1, -depth / 2 + 1],
            [width / 2 - 1, -depth / 2 + 1],
          ].map(([x, z], i) => (
            <mesh key={`col-${i}`} position={[x, 3, z]} castShadow>
              <cylinderGeometry args={[0.2, 0.25, 6, 8]} />
              <meshStandardMaterial color="#475569" roughness={0.5} metalness={0.5} />
            </mesh>
          ))}
          {/* Lighting fixtures */}
          {[-width / 3, 0, width / 3].map((x, i) => (
            <group key={`light-${i}`} position={[x, 5.7, 0]}>
              <mesh castShadow>
                <boxGeometry args={[0.8, 0.2, 0.4]} />
                <meshStandardMaterial color="#1f2937" roughness={0.5} metalness={0.4} />
              </mesh>
              <mesh position={[0, -0.1, 0]} material={EXTERIOR_LAMP_LENS_MATERIAL}>
                <boxGeometry args={[0.6, 0.08, 0.3]} />
              </mesh>
            </group>
          ))}
          {/* Gutter */}
          <mesh position={[0, 5.8, depth / 2]} castShadow>
            <boxGeometry args={[width + 0.5, 0.3, 0.4]} />
            <meshStandardMaterial color="#64748b" roughness={0.6} metalness={0.5} />
          </mesh>
        </>
      }
    >
      <group position={[0, 0, 0.1]}>
        <GeneratedModel asset="dockCanopyStructure" />
      </group>
      {[-width / 3, 0, width / 3].map((x, i) => (
        <mesh key={`light-face-${i}`} position={[x, 5.6, 0]} material={EXTERIOR_LAMP_LENS_MATERIAL}>
          <boxGeometry args={[0.6, 0.08, 0.3]} />
        </mesh>
      ))}
    </GeneratedBoundary>
  </group>
);

/**
 * Torispherical ("dished") pressure-vessel head, normalised to the shell radius.
 *
 * A cylinder capped with two hemispheres is a pill, and that is what both tanks
 * on this site used to be. A real vessel head is not a hemisphere: it is a
 * shallow spherical crown blended into the shell through a tight knuckle, and
 * the knuckle is the feature - it puts a shoulder on the silhouette where the
 * barrel stops being a barrel. These are ASME "2:1 ellipsoidal equivalent"
 * proportions: crown radius 0.90 D (1.8 R), knuckle radius 0.17 D (0.34 R). The
 * knuckle sweeps 63.124 degrees off the shell tangent onto the crown, which
 * makes the head 0.497694 R deep.
 *
 * Points are (radius, depth back from the pole), both x the shell radius,
 * running pole -> flange. Designed and previewed in Blender at the tanks' real
 * viewing distances - scripts/blender/specs/tanks-exterior.json, rendered with
 * scripts/blender/machine_part_preview.py. These are those numbers verbatim.
 *
 * The flatter ASME flanged-and-dished proportions (crown 1.0 D, knuckle 0.06 D,
 * depth 0.339 R) were rendered alongside and lost: at 30 m the end just faded
 * off and the tank read as a drum with lids.
 */
const VESSEL_HEAD: ReadonlyArray<readonly [number, number]> = [
  [0.0, 0.0], // pole
  [0.210597, 0.012362],
  [0.418301, 0.049279],
  [0.62026, 0.110243],
  [0.813699, 0.194418], // crown/knuckle tangent
  [0.890385, 0.247649],
  [0.949705, 0.31973],
  [0.987185, 0.405227],
  [1.0, 0.497694], // knuckle meets the straight flange
];

/**
 * 24 earned on its own terms, not inherited: the largest barrel is 6 m across
 * and lies at eye height, so 24 is a 0.78 m chord, and the knuckle needs that
 * much radial resolution or the shoulder shades as a hexagon rather than a
 * curve. State the baseline plainly - the last committed barrel was 16 and its
 * end caps 12, so this is not "unchanged"; 24 is kept because of the chord.
 *
 * 24 is also a 15 degree step, the same grid as the saddle cradles below
 * (12 segments over a half turn), which is why those are 12 and should stay 12.
 * The propane warning band takes 24 for the same reason and must not go below
 * 20: it is only 0.02 m proud, so at 12 its flats fall 0.03 m inside a 24-gon
 * shell's vertices and the stripe gets swallowed.
 */
const VESSEL_SEGMENTS = 24;
/** Weld groove: floor inset, floor half-width, mouth half-width - all x radius. */
const VESSEL_SEAM_DEPTH = 0.02;
const VESSEL_SEAM_FLAT = 0.013;
const VESSEL_SEAM_LIP = 0.02;

/**
 * A whole pressure vessel - both dished heads, the shell and the two
 * head-to-shell weld seams - as one lathe.
 *
 * Envelope is preserved exactly: max radius `radius`, axis range
 * +-(length / 2 + radius), the same box the cylinder-plus-two-hemispheres
 * occupied. That is not free. A dished head tangent to the shell whose depth
 * equals R is provably the hemisphere (solve Rc - (Rc - rk) sin b = R with
 * cos b = (R - rk)/(Rc - rk) and Rc = R falls out for every knuckle radius), so
 * a torispherical head cannot fill the old extent on its own. It does not have
 * to: real heads have a STRAIGHT FLANGE before the knuckle, and here that
 * flange is exactly R - depth = 0.502306 R long, which absorbs the difference
 * and simply reads as more cylinder. The tank stops being a pill and becomes a
 * bullet - long barrel, quick dish - which is the correct silhouette anyway.
 *
 * The flange length falls out so that the weld seams land exactly on
 * +-length/2, where the old barrel ended.
 *
 * The seams are grooves, not proud beads. A bead is what a real weld looks like
 * but it would push past `radius` and break the envelope; the groove reads as
 * the same dark ring at distance and its widest point IS the shell radius. A
 * third seam at mid-shell was tried and cut: at 30 m one central ring read as
 * two drums bolted together, and halving its depth did not rescue it.
 */
function createVesselGeometry(radius: number, length: number): THREE.LatheGeometry {
  const half = length / 2 + radius;
  const points: THREE.Vector2[] = [];

  // Bottom head, pole first, so the profile runs strictly bottom-to-top and
  // LatheGeometry's normals face outward.
  for (const [r, depth] of VESSEL_HEAD) {
    points.push(new THREE.Vector2(r * radius, -(half - depth * radius)));
  }
  const floor = radius * (1 - VESSEL_SEAM_DEPTH);
  const flat = VESSEL_SEAM_FLAT * radius;
  const lip = VESSEL_SEAM_LIP * radius;
  const seam = (y: number) => {
    points.push(new THREE.Vector2(radius, y - lip));
    points.push(new THREE.Vector2(floor, y - flat));
    points.push(new THREE.Vector2(floor, y + flat));
    points.push(new THREE.Vector2(radius, y + lip));
  };
  seam(-length / 2);
  seam(length / 2);
  for (let i = VESSEL_HEAD.length - 1; i >= 0; i -= 1) {
    const [r, depth] = VESSEL_HEAD[i];
    points.push(new THREE.Vector2(r * radius, half - depth * radius));
  }

  return new THREE.LatheGeometry(points, VESSEL_SEGMENTS);
}

/**
 * Shared vessel geometry, keyed by size.
 *
 * Both tank components take their dimensions as props, so the geometry cannot
 * be a single module constant - but there are only four distinct sizes on the
 * whole site (the two 3 x 10 storage tanks share one). Caching collapses what
 * was fifteen inline `<cylinderGeometry>`/`<sphereGeometry>` instances across
 * five tanks into four geometries, and folds each tank's three meshes into one.
 * Neither tank carries pointer handlers, so no picking proxy is needed.
 */
const VESSEL_GEOMETRY_CACHE = new Map<string, THREE.LatheGeometry>();
const VESSEL_WARNING_BAND_CACHE = new Map<number, THREE.LatheGeometry>();

function vesselGeometry(radius: number, length: number): THREE.LatheGeometry {
  const key = `${radius}x${length}`;
  let geometry = VESSEL_GEOMETRY_CACHE.get(key);
  if (!geometry) {
    geometry = createVesselGeometry(radius, length);
    VESSEL_GEOMETRY_CACHE.set(key, geometry);
  }
  return geometry;
}

/**
 * Rolled warning band for vertical vessels. Its lips tuck 4 mm into the shell,
 * then chamfer out to the same radius + 0.02 envelope as the previous band.
 * The 24-sided sweep therefore carries an actual pressed profile rather than
 * being a generic segment-count increase on a cylinder.
 */
function vesselWarningBandGeometry(radius: number): THREE.LatheGeometry {
  let geometry = VESSEL_WARNING_BAND_CACHE.get(radius);
  if (!geometry) {
    geometry = new THREE.LatheGeometry(
      [
        new THREE.Vector2(radius - 0.004, -0.15),
        new THREE.Vector2(radius + 0.012, -0.146),
        new THREE.Vector2(radius + 0.02, -0.132),
        new THREE.Vector2(radius + 0.02, 0.132),
        new THREE.Vector2(radius + 0.012, 0.146),
        new THREE.Vector2(radius - 0.004, 0.15),
      ],
      VESSEL_SEGMENTS
    );
    VESSEL_WARNING_BAND_CACHE.set(radius, geometry);
  }
  return geometry;
}

// Industrial storage tank - horizontal cylindrical tank with legs
export const StorageTank: React.FC<{
  assetId?: string;
  position: [number, number, number];
  length?: number;
  radius?: number;
  rotation?: number;
  color?: string;
  accentColor?: string;
  label?: string;
}> = ({
  assetId,
  position,
  length = 8,
  radius = 2.5,
  rotation = 0,
  color = '#e5e7eb',
  accentColor = '#2f6f8f',
  label = 'UTILITY',
}) => {
  const centreY = radius + 1.5;

  return (
    <group
      position={position}
      rotation={[0, rotation, 0]}
      name={assetId}
      userData={{ assetId, equipmentType: 'utility-tank' }}
    >
      <GeneratedBoundary
        enabled={
          (radius === 3 && length === 10 && color === '#dce4e5') ||
          (radius === 2.5 && length === 8 && color === '#eef1ed')
        }
        fallback={
          <>
            {/* Dished pressure-vessel heads, straight flanges, and recessed weld
          seams form one cached watertight geometry. This preserves the
          operational asset identity and calibrated paint from the campaign
          pass while replacing the pill-like capsule silhouette. */}
            <mesh
              geometry={vesselGeometry(radius, length)}
              position={[0, centreY, 0]}
              rotation={[0, 0, Math.PI / 2]}
              castShadow
              receiveShadow
            >
              <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={0.18}
                roughness={0.64}
                metalness={0.03}
                envMapIntensity={0.72}
              />
            </mesh>
          </>
        }
      >
        <group position={[0, 1.5, 0]}>
          <GeneratedModel
            asset={radius === 3 ? 'utilityFuelShell' : 'utilityProcessShell'}
            receiveShadow={true}
          />
        </group>
      </GeneratedBoundary>
      {/* Identification bands make the vessel orientation readable even in
          overcast and night lighting without adding a light or emissive hack. */}
      {[-length / 3, length / 3].map((x) => (
        <mesh
          key={`band-${x}`}
          position={[x, centreY, 0]}
          rotation={[0, Math.PI / 2, 0]}
          castShadow
        >
          <torusGeometry args={[radius + 0.035, 0.085, 8, 24]} />
          <meshStandardMaterial
            color={accentColor}
            roughness={0.64}
            metalness={0.03}
            envMapIntensity={0.72}
          />
        </mesh>
      ))}
      {/* Support legs - 4 saddle supports */}
      {[-length / 3, length / 3].map((x, i) => (
        <group key={`legs-${i}`} position={[x, 0, 0]}>
          {/* Left leg */}
          <mesh material={TANK_SUPPORT_MATERIAL} position={[0, 0.75, -radius * 0.7]} castShadow>
            <boxGeometry args={[0.4, 1.5, 0.4]} />
          </mesh>
          {/* Right leg */}
          <mesh material={TANK_SUPPORT_MATERIAL} position={[0, 0.75, radius * 0.7]} castShadow>
            <boxGeometry args={[0.4, 1.5, 0.4]} />
          </mesh>
          {/* Cross brace */}
          <mesh material={TANK_SUPPORT_MATERIAL} position={[0, 0.4, 0]} castShadow>
            <boxGeometry args={[0.3, 0.3, radius * 1.4]} />
          </mesh>
          {/* Saddle */}
          <mesh
            material={TANK_SUPPORT_MATERIAL}
            position={[0, 1.5, 0]}
            rotation={[0, 0, Math.PI / 2]}
            castShadow
          >
            <cylinderGeometry
              args={[radius + 0.1, radius + 0.1, 0.6, 12, 1, false, Math.PI, Math.PI]}
            />
          </mesh>
        </group>
      ))}
      <GroundBlob position={[0, 0]} scale={length + 3} scaleZ={radius * 3.4} />
      {/* Pipe fittings on top */}
      <mesh material={TANK_FITTING_MATERIAL} position={[0, radius * 2 + 1.62, 0]} castShadow>
        <cylinderGeometry args={[0.3, 0.3, 0.8, 8]} />
      </mesh>
      <mesh
        material={TANK_FITTING_MATERIAL}
        position={[length / 4, radius * 2 + 1.58, 0]}
        castShadow
      >
        <cylinderGeometry args={[0.2, 0.2, 0.6, 8]} />
      </mesh>
      {/* Ladder access */}
      <group position={[0, 0, -radius - 0.2]}>
        <mesh position={[0, radius + 1.5, 0]} castShadow>
          <boxGeometry args={[0.08, radius * 2 + 1, 0.08]} />
          <meshStandardMaterial color="#fbbf24" roughness={0.4} metalness={0.5} />
        </mesh>
        <mesh position={[0.3, radius + 1.5, 0]} castShadow>
          <boxGeometry args={[0.08, radius * 2 + 1, 0.08]} />
          <meshStandardMaterial color="#fbbf24" roughness={0.4} metalness={0.5} />
        </mesh>
        {/* Rungs */}
        {Array.from({ length: 8 }).map((_, i) => (
          <mesh key={`rung-${i}`} position={[0.15, 0.5 + i * 0.5, 0]} castShadow>
            <boxGeometry args={[0.25, 0.04, 0.04]} />
            <meshStandardMaterial color="#fbbf24" roughness={0.4} metalness={0.5} />
          </mesh>
        ))}
      </group>
      <Text
        position={[0, centreY, radius + 0.08]}
        fontSize={0.42}
        color="#27343a"
        anchorX="center"
        anchorY="middle"
        fontWeight="bold"
      >
        {label}
      </Text>
    </group>
  );
};

// Propane tank - smaller vertical cylindrical tank
export const PropaneTank: React.FC<{
  assetId?: string;
  position: [number, number, number];
  height?: number;
  radius?: number;
  color?: string;
  accentColor?: string;
}> = ({
  assetId,
  position,
  height = 4,
  radius = 1.2,
  color = '#f1f3ef',
  accentColor = '#b83a32',
}) => (
  <group position={position} name={assetId} userData={{ assetId, equipmentType: 'lpg-vessel' }}>
    <GeneratedBoundary
      enabled={
        color === '#f1f3ef' &&
        ((radius === 1.5 && height === 5) || (radius === 1.2 && height === 4))
      }
      fallback={
        <>
          {/* The same cached dished-head vessel family as the horizontal utility
        tanks. The lower head is deliberately buried while the upper knuckle
        and weld line remain readable above the containment pad. */}
          <mesh
            geometry={vesselGeometry(radius, height)}
            position={[0, height / 2 + 0.5, 0]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial
              color={color}
              emissive={color}
              emissiveIntensity={0.18}
              roughness={0.64}
              metalness={0.03}
              envMapIntensity={0.72}
            />
          </mesh>
        </>
      }
    >
      <group position={[0, radius === 1.5 ? -1 : -0.7, 0]}>
        <GeneratedModel
          asset={radius === 1.5 ? 'propaneLargeShell' : 'propaneSmallShell'}
          receiveShadow={true}
        />
      </group>
    </GeneratedBoundary>
    {/* Support legs - 3 legs */}
    {[0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].map((angle, i) => (
      <mesh
        key={`leg-${i}`}
        position={[Math.sin(angle) * (radius + 0.2), 0.25, Math.cos(angle) * (radius + 0.2)]}
        castShadow
      >
        <boxGeometry args={[0.25, 0.5, 0.25]} />
        <meshStandardMaterial color="#374151" roughness={0.6} metalness={0.4} />
      </mesh>
    ))}
    {/* Valve assembly on top */}
    <mesh position={[0, height + radius + 0.75, 0]} castShadow>
      <cylinderGeometry args={[0.15, 0.2, 0.4, 8]} />
      <meshStandardMaterial color="#374151" roughness={0.4} metalness={0.6} />
    </mesh>
    <mesh position={[0, height + radius + 1.05, 0]} castShadow>
      <boxGeometry args={[0.4, 0.2, 0.4]} />
      <meshStandardMaterial color="#1f2937" roughness={0.4} metalness={0.6} />
    </mesh>
    {/* Pressure gauge */}
    <mesh position={[radius + 0.1, height * 0.7, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
      <cylinderGeometry args={[0.15, 0.15, 0.1, 12]} />
      <meshStandardMaterial color="#1f2937" roughness={0.5} metalness={0.4} />
    </mesh>
    {/* Rolled warning band, with tucked lips and a chamfered face. */}
    <mesh
      geometry={vesselWarningBandGeometry(radius)}
      position={[0, height * 0.3 + 0.5, 0]}
      castShadow
    >
      <meshStandardMaterial
        color={accentColor}
        roughness={0.64}
        metalness={0.03}
        envMapIntensity={0.72}
      />
    </mesh>
  </group>
);

const UtilityTankFarm: React.FC = React.memo(() => (
  <group
    position={UTILITY_TANK_FARM_CENTRE}
    rotation={[0, SITE_LAYOUT.serviceYard.utilityTankFarm.rotation, 0]}
    name="utility-tank-farm"
  >
    {/* Raised containment pad. Its underside meets the shared exterior datum,
        so it neither floats nor competes with TerrainGround. */}
    <mesh position={[0, EXTERIOR_LAYERS.ground + 0.09, 0]} receiveShadow>
      <boxGeometry args={[22, 0.18, 42]} />
      <primitive object={UTILITY_CONCRETE_MATERIAL} attach="material" />
    </mesh>
    {/* Low bund walls contain a spill while keeping the vessels readable from
        the yard camera and leaving the west-side service access unobstructed. */}
    {[
      { position: [0, 0.23, -21] as [number, number, number], size: [22, 0.34, 0.28] },
      { position: [0, 0.23, 21] as [number, number, number], size: [22, 0.34, 0.28] },
      { position: [11, 0.23, 0] as [number, number, number], size: [0.28, 0.34, 42] },
      { position: [-11, 0.23, -12] as [number, number, number], size: [0.28, 0.34, 18] },
      { position: [-11, 0.23, 12] as [number, number, number], size: [0.28, 0.34, 18] },
    ].map(({ position, size }, index) => (
      <mesh key={`tank-bund-${index}`} position={position} castShadow receiveShadow>
        <boxGeometry args={size as [number, number, number]} />
        <primitive object={UTILITY_CURB_MATERIAL} attach="material" />
      </mesh>
    ))}
    {UTILITY_ASSET_DEFINITIONS.filter((asset) => asset.compound === 'tank_farm').map((asset) => (
      <StorageTank
        key={asset.id}
        assetId={asset.id}
        position={[...asset.relativePosition]}
        length={asset.length}
        radius={asset.radius}
        color={asset.color}
        accentColor={asset.accentColor}
        label={asset.label}
      />
    ))}
  </group>
));
UtilityTankFarm.displayName = 'UtilityTankFarm';

const PropaneSafetyCompound: React.FC = React.memo(() => {
  const railSegments: Array<{
    position: [number, number, number];
    size: [number, number, number];
  }> = [
    { position: [0, 1.25, -4.5], size: [12, 0.1, 0.1] },
    { position: [0, 1.25, 4.5], size: [12, 0.1, 0.1] },
    { position: [6, 1.25, 0], size: [0.1, 0.1, 9] },
    { position: [-6, 1.25, -3.25], size: [0.1, 0.1, 2.5] },
    { position: [-6, 1.25, 3.25], size: [0.1, 0.1, 2.5] },
    { position: [0, 2.2, -4.5], size: [12, 0.1, 0.1] },
    { position: [0, 2.2, 4.5], size: [12, 0.1, 0.1] },
    { position: [6, 2.2, 0], size: [0.1, 0.1, 9] },
    { position: [-6, 2.2, -3.25], size: [0.1, 0.1, 2.5] },
    { position: [-6, 2.2, 3.25], size: [0.1, 0.1, 2.5] },
  ];

  return (
    <group position={PROPANE_COMPOUND_CENTRE} name="propane-safety-compound">
      <mesh position={[0, EXTERIOR_LAYERS.ground + 0.08, 0]} receiveShadow>
        <boxGeometry args={[12, 0.16, 9]} />
        <primitive object={UTILITY_CONCRETE_MATERIAL} attach="material" />
      </mesh>
      {[
        [-6, -4.5],
        [-6, -2],
        [-6, 2],
        [-6, 4.5],
        [6, -4.5],
        [6, 4.5],
      ].map(([x, z], index) => (
        <mesh key={`lpg-post-${index}`} position={[x, 1.2, z]} castShadow>
          <boxGeometry args={[0.14, 2.4, 0.14]} />
          <primitive object={UTILITY_RAIL_MATERIAL} attach="material" />
        </mesh>
      ))}
      {railSegments.map(({ position, size }, index) => (
        <mesh key={`lpg-rail-${index}`} position={position} castShadow>
          <boxGeometry args={size} />
          <primitive object={UTILITY_RAIL_MATERIAL} attach="material" />
        </mesh>
      ))}
      {[-3, 0, 3].map((z) => (
        <mesh key={`lpg-bollard-${z}`} position={[-6.6, 0.72, z]} castShadow>
          <cylinderGeometry args={[0.13, 0.16, 1.4, 10]} />
          <primitive object={UTILITY_SAFETY_MATERIAL} attach="material" />
        </mesh>
      ))}
      {UTILITY_ASSET_DEFINITIONS.filter((asset) => asset.compound === 'propane').map((asset) => (
        <PropaneTank
          key={asset.id}
          assetId={asset.id}
          position={[...asset.relativePosition]}
          height={asset.height}
          radius={asset.radius}
          color={asset.color}
          accentColor={asset.accentColor}
        />
      ))}
      {/* Warning plate clamped between the east rails (1.25 and 2.2), so the
          lettering is painted on something instead of hovering over the fence. */}
      <mesh position={[6.05, 1.725, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.04, 0.9, 6.2]} />
        <meshStandardMaterial color="#f4f1e8" roughness={0.7} />
      </mesh>
      <Text
        position={[6.08, 1.725, 0]}
        rotation={[0, Math.PI / 2, 0]}
        fontSize={0.34}
        color="#7f1d1d"
        anchorX="center"
        anchorY="middle"
        fontWeight="bold"
        surface="painted"
      >
        LPG · NO IGNITION SOURCES
      </Text>
    </group>
  );
});
PropaneSafetyCompound.displayName = 'PropaneSafetyCompound';

// Optimized car component - good looks with efficient rendering
// Uses React.memo, reduced geometry segments, consolidated meshes
export const CuteCar: React.FC<{
  position: [number, number, number];
  rotation?: number;
  color?: string;
  style?: 'sedan' | 'hatchback' | 'suv' | 'pickup';
}> = React.memo(({ position, rotation = 0, color = '#ef4444', style = 'sedan' }) => {
  // Memoize dimensions lookup
  const { d, cabinX, cabinY } = useMemo(() => {
    const dimensions = {
      sedan: {
        bodyLength: 3.2,
        bodyWidth: 1.4,
        bodyHeight: 0.7,
        cabinLength: 1.8,
        cabinHeight: 0.65,
      },
      hatchback: {
        bodyLength: 2.6,
        bodyWidth: 1.3,
        bodyHeight: 0.65,
        cabinLength: 1.4,
        cabinHeight: 0.6,
      },
      suv: {
        bodyLength: 3.4,
        bodyWidth: 1.6,
        bodyHeight: 0.9,
        cabinLength: 2.2,
        cabinHeight: 0.75,
      },
      pickup: {
        bodyLength: 3.8,
        bodyWidth: 1.5,
        bodyHeight: 0.75,
        cabinLength: 1.2,
        cabinHeight: 0.7,
      },
    };
    const dim = dimensions[style];
    return {
      d: dim,
      cabinX: style === 'pickup' ? -0.5 : 0,
      cabinY: 0.4 + dim.bodyHeight / 2 + dim.cabinHeight / 2,
    };
  }, [style]);

  const darkColor = '#2d3748';
  const trimColor = '#4a5568';

  const primitiveBody = (
    <group>
      {/* Main body - single shadow-casting mesh */}
      <mesh position={[0, 0.4, 0]} castShadow>
        <boxGeometry args={[d.bodyLength, d.bodyHeight, d.bodyWidth]} />
        <meshStandardMaterial color={color} roughness={0.35} metalness={0.4} />
      </mesh>

      {/* Cabin/roof */}
      <mesh position={[cabinX, cabinY, 0]} castShadow>
        <boxGeometry args={[d.cabinLength, d.cabinHeight, d.bodyWidth - 0.1]} />
        <meshStandardMaterial color={color} roughness={0.35} metalness={0.4} />
      </mesh>
      {/* Roof cap - inset box softens the hard cabin roofline */}
      <mesh position={[cabinX, cabinY + d.cabinHeight / 2 + 0.025, 0]} castShadow>
        <boxGeometry args={[d.cabinLength * 0.82, 0.06, (d.bodyWidth - 0.1) * 0.82]} />
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.45} />
      </mesh>

      {/* Window pillars - A and C combined per side */}
      {[-1, 1].map((side) => (
        <group key={`pillars-${side}`}>
          <mesh
            position={[cabinX + d.cabinLength / 2 - 0.06, cabinY, side * (d.bodyWidth / 2 - 0.04)]}
          >
            <boxGeometry args={[0.08, d.cabinHeight + 0.02, 0.06]} />
            <meshStandardMaterial color={darkColor} roughness={0.6} />
          </mesh>
          {style !== 'pickup' && (
            <mesh
              position={[
                cabinX - d.cabinLength / 2 + 0.06,
                cabinY,
                side * (d.bodyWidth / 2 - 0.04),
              ]}
            >
              <boxGeometry args={[0.08, d.cabinHeight + 0.02, 0.06]} />
              <meshStandardMaterial color={darkColor} roughness={0.6} />
            </mesh>
          )}
          {/* B-pillar */}
          <mesh position={[cabinX - 0.05, cabinY, side * (d.bodyWidth / 2 - 0.03)]}>
            <boxGeometry args={[0.06, d.cabinHeight + 0.02, 0.04]} />
            <meshStandardMaterial color={darkColor} roughness={0.6} />
          </mesh>
        </group>
      ))}

      {/* Roof rails for SUV only */}
      {style === 'suv' &&
        [-1, 1].map((side) => (
          <mesh
            key={`roof-rail-${side}`}
            position={[cabinX, cabinY + d.cabinHeight / 2 + 0.03, side * (d.bodyWidth / 2 - 0.12)]}
          >
            <boxGeometry args={[d.cabinLength - 0.3, 0.04, 0.05]} />
            <meshStandardMaterial color="#718096" roughness={0.4} metalness={0.6} />
          </mesh>
        ))}

      {/* Windows - front and back */}
      <mesh position={[cabinX + d.cabinLength / 2 - 0.05, cabinY, 0]}>
        <boxGeometry args={[0.02, d.cabinHeight - 0.18, d.bodyWidth - 0.3]} />
        <meshStandardMaterial
          color="#a8d4e6"
          transparent
          opacity={0.75}
          metalness={0.7}
          roughness={0.05}
        />
      </mesh>
      {style !== 'pickup' && (
        <mesh position={[cabinX - d.cabinLength / 2 + 0.05, cabinY, 0]}>
          <boxGeometry args={[0.02, d.cabinHeight - 0.18, d.bodyWidth - 0.3]} />
          <meshStandardMaterial
            color="#a8d4e6"
            transparent
            opacity={0.75}
            metalness={0.7}
            roughness={0.05}
          />
        </mesh>
      )}

      {/* Side windows - simplified to one per side */}
      {[-1, 1].map((side) => (
        <mesh key={`side-window-${side}`} position={[cabinX, cabinY, side * (d.bodyWidth / 2)]}>
          <boxGeometry args={[d.cabinLength - 0.25, d.cabinHeight - 0.18, 0.02]} />
          <meshStandardMaterial
            color="#a8d4e6"
            transparent
            opacity={0.75}
            metalness={0.7}
            roughness={0.05}
          />
        </mesh>
      ))}

      {/* Door handles - simplified */}
      {[-1, 1].map((side) => (
        <group key={`door-${side}`}>
          <mesh position={[0.15, 0.45, side * (d.bodyWidth / 2 + 0.01)]}>
            <boxGeometry args={[0.12, 0.04, 0.02]} />
            <meshStandardMaterial color="#9ca3af" metalness={0.8} roughness={0.2} />
          </mesh>
          {style !== 'pickup' && (
            <mesh position={[-0.7, 0.45, side * (d.bodyWidth / 2 + 0.01)]}>
              <boxGeometry args={[0.12, 0.04, 0.02]} />
              <meshStandardMaterial color="#9ca3af" metalness={0.8} roughness={0.2} />
            </mesh>
          )}
        </group>
      ))}

      {/* Side mirrors - simplified to single mesh per side */}
      {[-1, 1].map((side) => (
        <mesh
          key={`mirror-${side}`}
          position={[
            cabinX + d.cabinLength / 2 - 0.15,
            cabinY - 0.15,
            side * (d.bodyWidth / 2 + 0.15),
          ]}
        >
          <boxGeometry args={[0.1, 0.07, 0.06]} />
          <meshStandardMaterial color={color} roughness={0.4} metalness={0.3} />
        </mesh>
      ))}

      {/* Front grille - single mesh */}
      <mesh position={[d.bodyLength / 2 + 0.01, 0.32, 0]}>
        <boxGeometry args={[0.04, 0.22, d.bodyWidth * 0.5]} />
        <meshStandardMaterial color={darkColor} roughness={0.7} />
      </mesh>

      {/* Headlights - simplified */}
      {[-0.4, 0.4].map((z, i) => (
        <mesh key={`headlight-${i}`} position={[d.bodyLength / 2 + 0.02, 0.38, z]}>
          <boxGeometry args={[0.06, 0.16, 0.26]} />
          <meshBasicMaterial color="#fffde7" />
        </mesh>
      ))}

      {/* Taillights - simplified */}
      {[-0.45, 0.45].map((z, i) => (
        <mesh key={`taillight-${i}`} position={[-d.bodyLength / 2 - 0.02, 0.38, z]}>
          <boxGeometry args={[0.05, 0.14, 0.2]} />
          <meshBasicMaterial color="#dc2626" />
        </mesh>
      ))}

      {/* License plates */}
      <mesh position={[d.bodyLength / 2 + 0.02, 0.18, 0]}>
        <boxGeometry args={[0.02, 0.08, 0.25]} />
        <meshStandardMaterial color="#f7fafc" roughness={0.5} />
      </mesh>
      <mesh position={[-d.bodyLength / 2 - 0.02, 0.18, 0]}>
        <boxGeometry args={[0.02, 0.08, 0.25]} />
        <meshStandardMaterial color="#f7fafc" roughness={0.5} />
      </mesh>

      {/* Wheels - optimized with fewer segments */}
      {[
        [d.bodyLength / 2 - 0.5, -d.bodyWidth / 2 - 0.05],
        [d.bodyLength / 2 - 0.5, d.bodyWidth / 2 + 0.05],
        [-d.bodyLength / 2 + 0.5, -d.bodyWidth / 2 - 0.05],
        [-d.bodyLength / 2 + 0.5, d.bodyWidth / 2 + 0.05],
      ].map(([x, z], i) => (
        <group key={`wheel-${i}`} position={[x, 0.22, z]} rotation={[Math.PI / 2, 0, 0]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.27, 0.27, 0.16, 10]} />
            <meshStandardMaterial color="#1a1a1a" roughness={0.95} />
          </mesh>
          <mesh position={[0, z > 0 ? 0.08 : -0.08, 0]}>
            <cylinderGeometry args={[0.15, 0.15, 0.03, 10]} />
            <meshStandardMaterial color="#a0aec0" metalness={0.8} roughness={0.2} />
          </mesh>
        </group>
      ))}

      {/* Bumpers - simplified */}
      <mesh position={[d.bodyLength / 2 + 0.1, 0.18, 0]} castShadow>
        <boxGeometry args={[0.12, 0.18, d.bodyWidth - 0.15]} />
        <meshStandardMaterial color={trimColor} roughness={0.7} metalness={0.2} />
      </mesh>
      <mesh position={[-d.bodyLength / 2 - 0.1, 0.18, 0]} castShadow>
        <boxGeometry args={[0.12, 0.18, d.bodyWidth - 0.15]} />
        <meshStandardMaterial color={trimColor} roughness={0.7} metalness={0.2} />
      </mesh>

      {/* Pickup truck bed */}
      {style === 'pickup' && (
        <group>
          <mesh position={[0.9, 0.45, 0]} castShadow>
            <boxGeometry args={[1.4, 0.1, d.bodyWidth - 0.1]} />
            <meshStandardMaterial color={color} roughness={0.5} />
          </mesh>
          {[-1, 1].map((side) => (
            <mesh
              key={`bed-wall-${side}`}
              position={[0.9, 0.7, side * (d.bodyWidth / 2 - 0.08)]}
              castShadow
            >
              <boxGeometry args={[1.4, 0.4, 0.08]} />
              <meshStandardMaterial color={color} roughness={0.5} />
            </mesh>
          ))}
          <mesh position={[1.62, 0.65, 0]} castShadow>
            <boxGeometry args={[0.08, 0.3, d.bodyWidth - 0.25]} />
            <meshStandardMaterial color={color} roughness={0.5} />
          </mesh>
        </group>
      )}
    </group>
  );

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <GeneratedBoundary fallback={primitiveBody}>
        {style === 'sedan' ? (
          <GeneratedPaintedModel asset="cuteCarSedan" color={color} profile="ochre" />
        ) : style === 'suv' ? (
          <GeneratedPaintedModel asset="cuteCarSuv" color={color} profile="green" />
        ) : style === 'hatchback' ? (
          <GeneratedPaintedModel asset="cuteCarHatchback" color={color} profile="blue" />
        ) : (
          <GeneratedPaintedModel asset="cuteCarPickup" color={color} profile="ochre" />
        )}
      </GeneratedBoundary>
      {/* Shadow underneath - soft radial-gradient blob (alpha falloff, no hard edges) */}
      <mesh
        position={[0, 0.01, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={RENDER_ORDER.floorEffects}
      >
        <planeGeometry args={[d.bodyLength + 1.2, d.bodyWidth + 0.9]} />
        <meshBasicMaterial
          map={CAR_SHADOW_TEXTURE}
          transparent
          opacity={0.85}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-4}
          polygonOffsetUnits={-4}
        />
      </mesh>
    </group>
  );
});

// Shared soft radial-gradient shadow blob for parked cars (created once at module load)
const createCarShadowTexture = (): THREE.CanvasTexture => {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(32, 32, 6, 32, 32, 32);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(0.6, 'rgba(0,0,0,0.3)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};
const CAR_SHADOW_TEXTURE = createCarShadowTexture();

// Car colors palette - fun and varied
const CAR_COLORS = [
  '#ef4444', // Red
  '#3b82f6', // Blue
  '#22c55e', // Green
  '#f59e0b', // Amber
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#f97316', // Orange
  '#64748b', // Slate gray
  '#1f2937', // Dark gray
  '#ffffff', // White
  '#fbbf24', // Yellow
];

// Parking lot with cute parked cars
const ParkingLot: React.FC<{
  position: [number, number, number];
  rows?: number;
  spotsPerRow?: number;
  rotation?: number;
}> = ({ position, rows = 2, spotsPerRow = 5, rotation = 0 }) => {
  // Generate random but consistent car placements
  const cars = useMemo(() => {
    const carList: Array<{
      row: number;
      spot: number;
      color: string;
      style: 'sedan' | 'hatchback' | 'suv' | 'pickup';
      occupied: boolean;
    }> = [];

    for (let row = 0; row < rows; row++) {
      for (let spot = 0; spot < spotsPerRow; spot++) {
        // ~75% occupancy rate
        const occupied = (row * spotsPerRow + spot) % 4 !== 2;
        if (occupied) {
          const styles: Array<'sedan' | 'hatchback' | 'suv' | 'pickup'> = [
            'sedan',
            'hatchback',
            'suv',
            'pickup',
          ];
          carList.push({
            row,
            spot,
            color: CAR_COLORS[(row * spotsPerRow + spot * 3) % CAR_COLORS.length],
            style: styles[(row + spot) % styles.length],
            occupied: true,
          });
        }
      }
    }
    return carList;
  }, [rows, spotsPerRow]);

  const spotWidth = 3.5;
  const spotDepth = 5;
  const aisleWidth = 6;
  const totalWidth = spotsPerRow * spotWidth;
  const totalDepth = rows * spotDepth + (rows > 1 ? aisleWidth : 0);

  /**
   * World Z of a row's centre line. ONE definition, used by the markings and by
   * the cars, because they were two copies of the same expression and a copy is
   * where they drift apart.
   *
   * The expression they shared was `row * (spotDepth + aisleWidth / 2) -
   * totalDepth / 2 + spotDepth / 2`, which is wrong twice over: the pitch
   * between two rows facing across an aisle is a full bay plus a full aisle
   * (11 m), not a bay plus half an aisle (8 m), and the result was not centred
   * in the slab it was drawn on - rows landed at -5.5 and 2.5 inside a lot
   * spanning -8..8, so the whole bay block sat 3 m north of its own tarmac with
   * a bald margin along the south edge. Both are visible on the `carpark`
   * review camera.
   */
  const rowCentreZ = (row: number): number =>
    row * (spotDepth + aisleWidth) - (totalDepth - spotDepth) / 2;

  // The exterior stack from CLAUDE.md: lot and markings share the site's ground
  // datum and separate by polygonOffset, the lot at -2 against the terrain's
  // `exteriorBase` +6 and the markings at `exteriorOverlay` -4 above that. The
  // literals these replace (0.08 / 0.09) were clearance for `TerrainGround`'s
  // old 0.05 default and now float the whole lot 10 cm off the ground.
  const asphaltY = EXTERIOR_LAYERS.ground;
  const markingsY = EXTERIOR_LAYERS.groundOverlay;

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Asphalt surface, on the ground datum */}
      <mesh position={[0, asphaltY, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[totalWidth + 4, totalDepth + 4]} />
        <meshStandardMaterial
          color="#ffffff"
          roughness={0.9}
          map={TARMAC_LOT_MAP}
          roughnessMap={TARMAC_LOT_ROUGHNESS}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
        />
      </mesh>

      {/* Parking spot markings */}
      {Array.from({ length: rows }).map((_, row) => (
        <group key={`row-${row}`} position={[0, markingsY, rowCentreZ(row)]}>
          {/* Spot dividers */}
          {Array.from({ length: spotsPerRow + 1 }).map((_, spot) => (
            <mesh
              key={`divider-${row}-${spot}`}
              position={[spot * spotWidth - totalWidth / 2, 0, 0]}
              rotation={[-Math.PI / 2, 0, 0]}
              receiveShadow
              renderOrder={RENDER_ORDER.floorMarkings}
            >
              <planeGeometry args={[0.15, spotDepth - 0.5]} />
              <meshStandardMaterial
                {...ROAD_PAINT_WHITE}
                polygonOffset
                polygonOffsetFactor={POLYGON_OFFSET.exteriorOverlay.factor}
                polygonOffsetUnits={POLYGON_OFFSET.exteriorOverlay.units}
              />
            </mesh>
          ))}
          {/* Front line of row */}
          <mesh
            position={[0, 0, spotDepth / 2 - 0.25]}
            rotation={[-Math.PI / 2, 0, 0]}
            receiveShadow
            renderOrder={RENDER_ORDER.floorMarkings}
          >
            <planeGeometry args={[totalWidth, 0.15]} />
            <meshStandardMaterial
              {...ROAD_PAINT_WHITE}
              polygonOffset
              polygonOffsetFactor={POLYGON_OFFSET.exteriorOverlay.factor}
              polygonOffsetUnits={POLYGON_OFFSET.exteriorOverlay.units}
            />
          </mesh>
        </group>
      ))}

      {/* Parked cars */}
      {cars.map((car, i) => {
        const xPos = car.spot * spotWidth - totalWidth / 2 + spotWidth / 2;
        const zPos = rowCentreZ(car.row);
        // Slight random offset for natural look
        const xOffset = (((car.spot * 7) % 5) - 2) * 0.1;
        const zOffset = (((car.row * 11 + car.spot) % 5) - 2) * 0.15;
        const rotOffset = (((car.spot * 3) % 5) - 2) * 0.02;

        return (
          <CuteCar
            key={`car-${i}`}
            position={[xPos + xOffset, 0, zPos + zOffset]}
            // A bay is `spotWidth` (3.5 m) across in X and `spotDepth` (5 m)
            // deep in Z: the dividers are the SHORT ticks running along Z and
            // the long line across each row is its front edge. `CuteCar` is
            // modelled length-along-local-X, so a quarter turn is exactly what
            // puts its length down the bay - this is right and was right before.
            //
            // It did not look right, and the reason was not the cars. A 5 m
            // carriageway ran straight through the lot at the same ground datum
            // (see the ConnectingRoad note at the call site) and the two rows
            // were pitched 8 m apart instead of 11 and sat 3 m off-centre on
            // their own tarmac. With those two fixed the cars sit in their bays.
            // Recorded because a quarter turn was removed here on the strength
            // of a frame that was showing a different fault, and putting it back
            // cost a build and a capture.
            rotation={Math.PI / 2 + rotOffset}
            color={car.color}
            style={car.style}
          />
        );
      })}

      {/* Corner bollards */}
      {[
        [-totalWidth / 2 - 1.5, -totalDepth / 2 - 1.5],
        [totalWidth / 2 + 1.5, -totalDepth / 2 - 1.5],
        [-totalWidth / 2 - 1.5, totalDepth / 2 + 1.5],
        [totalWidth / 2 + 1.5, totalDepth / 2 + 1.5],
      ].map(([x, z], i) => (
        <mesh key={`bollard-${i}`} position={[x, 0.4, z]} castShadow>
          <cylinderGeometry args={[0.15, 0.15, 0.8, 8]} />
          <meshStandardMaterial color="#fbbf24" roughness={0.5} />
        </mesh>
      ))}

      {/* Parking sign */}
      <group position={[totalWidth / 2 + 2, 0, 0]}>
        {/* Sign pole */}
        <mesh position={[0, 1.5, 0]} castShadow>
          <cylinderGeometry args={[0.08, 0.08, 3, 8]} />
          <meshStandardMaterial color="#6b7280" roughness={0.5} metalness={0.3} />
        </mesh>
        {/* Sign */}
        <mesh position={[0, 2.8, 0]} castShadow>
          <boxGeometry args={[1.2, 1.2, 0.1]} />
          <meshStandardMaterial color="#3b82f6" roughness={0.5} />
        </mesh>
        {/* P letter */}
        <Text
          position={[0, 2.8, 0.06]}
          fontSize={0.7}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
          fontWeight="bold"
          surface="painted"
        >
          P
        </Text>
      </group>

      {/* Small trees at corners for decoration */}
      <SimpleTree position={[-totalWidth / 2 - 3, 0, -totalDepth / 2 - 3]} scale={0.6} />
      <SimpleTree position={[totalWidth / 2 + 3, 0, totalDepth / 2 + 3]} scale={0.7} />
    </group>
  );
};

// Victorian Brick Tunnel Entrance - decorative industrial gatehouse style
const TunnelEntrance: React.FC<{
  position: [number, number, number];
  rotation?: number;
  length?: number;
}> = ({ position, rotation = 0, length = 14 }) => {
  const tunnelWidth = 9;
  const tunnelHeight = 6;
  const sideGeometry = useMemo(() => createVictorianTunnelSideGeometry(length), [length]);
  useEffect(() => () => sideGeometry.dispose(), [sideGeometry]);
  // Victorian Red Brick. The albedo is now the procedural brick map, whose
  // bytes are sRGB-tagged and already carry the right reflectance, so the tint
  // is white - the old flat `#8d4004` would multiply the same hue twice and
  // render the portal near-black. Coarse 2x3 repeat suits a 6m opening.
  const brickSurface = {
    color: '#ffffff',
    map: PORTAL_BRICK_MAP,
    normalMap: PORTAL_BRICK_NORMAL,
    normalScale: PORTAL_BRICK_NORMAL_SCALE,
    roughness: 0.88,
  } as const;
  // Portland Stone dressings keep their colour: with no albedo map the `color`
  // IS the albedo. They gain only a roughness break-up map.
  const stoneColor = '#a89f91';

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* ===== TUNNEL INTERIOR ===== */}
      {/* Road surface inside the tunnel. Ground datum with its own -2 offset,
          matching the `ConnectingRoad` carriageway it continues; the 0.15 it
          replaces was clearance for `TerrainGround`'s old 0.05 default and left
          a 17 cm step where the open road met the portal. */}
      <mesh position={[0, EXTERIOR_LAYERS.ground, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[tunnelWidth - 1, length + 2]} />
        <meshStandardMaterial
          // Hue-preserving lift, not a reset to white: this is damp tarmac
          // under a portal, so it stays warmer and darker than the open road
          // while the map now supplies the aggregate and the wear polish.
          color="#b0a89f"
          roughness={0.9}
          map={TARMAC_ROAD_MAP}
          roughnessMap={TARMAC_ROAD_ROUGHNESS}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
        />
      </mesh>

      {/* Tunnel Lining (Dark Brick) - Tilted away from map center */}
      {/* User Instruction: "90 degrees, away from the center of the map" */}
      <mesh position={[0, 2.5, 0]} rotation={[Math.PI / 2, Math.PI / 2, 0]}>
        {/* args: [topRadius, bottomRadius, height, segments, openEnded, thetaStart, thetaLength] */}
        {/* Rotation X=PI/2 tilts it horizontally, Y=PI/2 orients it away from center */}
        <cylinderGeometry
          args={[
            tunnelWidth / 2 - 0.5,
            tunnelWidth / 2 - 0.5,
            length + 0.1,
            32,
            1,
            true,
            0,
            Math.PI,
          ]}
        />
        <meshStandardMaterial
          // Soot-blackened lining: a deliberate dark variant of the same brick,
          // lifted well above the old flat #3e2723 because the map now carries
          // most of the darkness itself.
          color="#9a8880"
          roughness={0.92}
          map={PORTAL_BRICK_MAP}
          normalMap={PORTAL_BRICK_NORMAL}
          normalScale={PORTAL_BRICK_NORMAL_SCALE}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Carry the barrel vault down to the ground instead of leaving its
          lower sides open beneath the spring line. One shared draw, 24 tris. */}
      <mesh geometry={sideGeometry} castShadow receiveShadow>
        <meshStandardMaterial {...brickSurface} color="#9a8880" roughness={0.92} />
      </mesh>

      {/* ===== ENTRANCE FACADE (Main visual part) ===== */}
      {/* Rotated 180 degrees so decorative greebles face outward toward factory */}
      <group position={[0, 0, -length / 2 - 0.1]} rotation={[0, Math.PI, 0]}>
        {/* A true arch opening, shared with the lining. The former three boxes
            left a square hole, while the inverted stone trim fell underground. */}
        <GeneratedSurfaceMesh
          asset="victorianPortalUnit"
          geometry={VICTORIAN_PORTAL_FACE}
          material={VICTORIAN_PORTAL_MATERIAL}
          castShadow
          receiveShadow
        />

        {/* Rain streaking down the brick columns from under the cornice.
            SURFACE_LAYERS.decal off the 1.2-deep column face (front at z=0.6). */}
        {[-tunnelWidth / 2 - 1, tunnelWidth / 2 + 1].map((x) => (
          <GrimeStreak
            key={`portal-grime-${x}`}
            position={[x, tunnelHeight / 2 - 0.6, 0.6 + SURFACE_LAYERS.decal]}
            width={2.4}
            height={5.4}
          />
        ))}

        {/* Stone Archway Trim */}
        <mesh position={[0, tunnelHeight / 2 - 0.5, 0.65]} castShadow>
          {/* The half torus opens upwards; its inner radius meets the bore. */}
          <torusGeometry args={[tunnelWidth / 2, 0.6, 8, 16, Math.PI]} />
          <meshStandardMaterial
            color={stoneColor}
            roughness={0.82}
            roughnessMap={OUTBUILDING_CONCRETE_ROUGHNESS}
          />
        </mesh>

        {/* Keystone */}
        <mesh position={[0, 7.35, 0.7]} castShadow>
          <boxGeometry args={[1.2, 1.1, 1.4]} />
          <meshStandardMaterial
            color={stoneColor}
            roughness={0.78}
            roughnessMap={OUTBUILDING_CONCRETE_ROUGHNESS}
          />
        </mesh>

        {/* Base Plinths (Stone) */}
        <mesh position={[-tunnelWidth / 2 - 1, 1, 0.1]} castShadow>
          <boxGeometry args={[3.2, 2, 1.4]} />
          <meshStandardMaterial
            color={stoneColor}
            roughness={0.84}
            roughnessMap={OUTBUILDING_CONCRETE_ROUGHNESS}
          />
        </mesh>
        <mesh position={[tunnelWidth / 2 + 1, 1, 0.1]} castShadow>
          <boxGeometry args={[3.2, 2, 1.4]} />
          <meshStandardMaterial
            color={stoneColor}
            roughness={0.84}
            roughnessMap={OUTBUILDING_CONCRETE_ROUGHNESS}
          />
        </mesh>

        {/* Cornice / Coping Stones at top */}
        <mesh position={[0, tunnelHeight + 3, 0]} castShadow>
          <boxGeometry args={[tunnelWidth + 6, 0.6, 1.6]} />
          <meshStandardMaterial
            color={stoneColor}
            roughness={0.84}
            roughnessMap={OUTBUILDING_CONCRETE_ROUGHNESS}
          />
        </mesh>

        {/* Decorative Parapet on top */}
        <group position={[0, tunnelHeight + 4, 0]}>
          <mesh position={[0, -0.2, 0]}>
            <boxGeometry args={[tunnelWidth + 5, 0.8, 1]} />
            <meshStandardMaterial {...brickSurface} />
          </mesh>
          {/* Spikes/Finials */}
          {[-6, -3, 0, 3, 6].map((x) => (
            <mesh position={[x, 0.6, 0]} key={x}>
              <sphereGeometry args={[0.4]} />
              <meshStandardMaterial
                color={stoneColor}
                roughness={0.84}
                roughnessMap={OUTBUILDING_CONCRETE_ROUGHNESS}
              />
            </mesh>
          ))}
        </group>

        {/* Lanterns on sides */}
        {[-tunnelWidth / 2 - 1, tunnelWidth / 2 + 1].map((x) => (
          <group position={[x, tunnelHeight / 2 + 1, 0.8]} key={x}>
            <mesh>
              <boxGeometry args={[0.5, 0.8, 0.5]} />
              <meshStandardMaterial color="#222" metalness={0.6} />
            </mesh>
            <mesh position={[0, 0, 0]} material={EXTERIOR_LAMP_LENS_MATERIAL}>
              <boxGeometry args={[0.3, 0.6, 0.6]} />
            </mesh>
          </group>
        ))}

        {/* Date Plaque */}
        <group position={[0, 8.3, 0.66]}>
          <mesh>
            <boxGeometry args={[3, 0.7, 0.1]} />
            <meshStandardMaterial
              color={stoneColor}
              roughness={0.84}
              roughnessMap={OUTBUILDING_CONCRETE_ROUGHNESS}
            />
          </mesh>
          <Text
            position={[0, 0, 0.06]}
            fontSize={0.5}
            color="#3e2723"
            anchorX="center"
            anchorY="middle"
          >
            1892
          </Text>
        </group>
      </group>

      {/* ===== EXIT FACADE (Simpler version) ===== */}
      <group position={[0, 0, length / 2 + 0.1]}>
        <mesh geometry={VICTORIAN_PORTAL_EXIT} castShadow receiveShadow>
          <meshStandardMaterial {...brickSurface} />
        </mesh>
        <mesh position={[0, tunnelHeight + 1, 0]} castShadow>
          <boxGeometry args={[tunnelWidth + 4, 1.5, 1]} />
          <meshStandardMaterial {...brickSurface} />
        </mesh>
        {[-tunnelWidth / 2 - 1.6, tunnelWidth / 2 + 1.6].map((x) => (
          <GrimeStreak
            key={`exit-grime-${x}`}
            position={[x, tunnelHeight / 2 + 0.4, 0.5 + SURFACE_LAYERS.decal]}
            width={2.2}
            height={4.6}
          />
        ))}
        <mesh position={[0, tunnelHeight + 1.8, 0]} castShadow>
          <boxGeometry args={[tunnelWidth + 4.4, 0.4, 1.2]} />
          <meshStandardMaterial
            color={stoneColor}
            roughness={0.84}
            roughnessMap={OUTBUILDING_CONCRETE_ROUGHNESS}
          />
        </mesh>
      </group>

      {/* Ivy/Foliage Growing on it (Procedural cubes for now) */}
      {[
        { pos: [-tunnelWidth / 2 - 2, 1, -length / 2 + 0.5], scale: [1, 2, 1] },
        { pos: [tunnelWidth / 2 + 2, 2, -length / 2 + 0.5], scale: [1.2, 3, 0.8] },
        { pos: [-tunnelWidth / 2 - 1.5, 4, -length / 2 + 0.2], scale: [0.8, 1, 0.5] },
      ].map((item, i) => (
        <mesh position={item.pos as [number, number, number]} key={i} castShadow>
          <boxGeometry args={item.scale as [number, number, number]} />
          <meshStandardMaterial color="#2d5a27" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
};

// Connecting road segment from tunnel to parking lot
const ConnectingRoad: React.FC<{
  start: [number, number, number];
  end: [number, number, number];
  width?: number;
}> = ({ start, end, width = 6 }) => {
  const dx = end[0] - start[0];
  const dz = end[2] - start[2];
  const length = Math.sqrt(dx * dx + dz * dz);
  const angle = Math.atan2(dx, dz);
  const midX = (start[0] + end[0]) / 2;
  const midZ = (start[2] + end[2]) / 2;

  // Ground datum for the carriageway, ground-overlay datum for the paint, with
  // the existing negative offsets (-2 road, -3 lines) doing the separating
  // against the terrain's `exteriorBase` +6. The literals these replace
  // (0.08 / 0.09) cleared `TerrainGround`'s old 0.05 default, so the road has
  // been standing 10 cm proud of the road the terrain splat paints beneath it.
  //
  // `CheckpointBarrier` draws its stop lines onto this carriageway and had to
  // move with it - the two are one surface, in two components.
  const roadY = EXTERIOR_LAYERS.ground;
  const linesY = EXTERIOR_LAYERS.groundOverlay;

  return (
    <group>
      {/* Road surface, on the ground datum */}
      <mesh position={[midX, roadY, midZ]} rotation={[-Math.PI / 2, 0, angle]} receiveShadow>
        <planeGeometry args={[width, length]} />
        <meshStandardMaterial
          color="#ffffff"
          roughness={0.85}
          map={TARMAC_ROAD_MAP}
          roughnessMap={TARMAC_ROAD_ROUGHNESS}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
        />
      </mesh>

      {/* Edge lines - slightly above road surface */}
      <mesh
        position={[
          midX - Math.cos(angle) * (width / 2 - 0.2),
          linesY,
          midZ + Math.sin(angle) * (width / 2 - 0.2),
        ]}
        rotation={[-Math.PI / 2, 0, angle]}
        receiveShadow
      >
        <planeGeometry args={[0.15, length]} />
        <meshStandardMaterial
          {...ROAD_PAINT_WHITE}
          polygonOffset
          polygonOffsetFactor={-3}
          polygonOffsetUnits={-3}
        />
      </mesh>
      <mesh
        position={[
          midX + Math.cos(angle) * (width / 2 - 0.2),
          linesY,
          midZ - Math.sin(angle) * (width / 2 - 0.2),
        ]}
        rotation={[-Math.PI / 2, 0, angle]}
        receiveShadow
      >
        <planeGeometry args={[0.15, length]} />
        <meshStandardMaterial
          {...ROAD_PAINT_WHITE}
          polygonOffset
          polygonOffsetFactor={-3}
          polygonOffsetUnits={-3}
        />
      </mesh>

      {/* Center dashed line - above road surface */}
      {Array.from({ length: Math.floor(length / 4) }).map((_, i) => {
        const t = (i * 4 + 2) / length;
        const x = start[0] + dx * t;
        const z = start[2] + dz * t;
        return (
          <mesh
            key={`dash-${i}`}
            position={[x, linesY, z]}
            rotation={[-Math.PI / 2, 0, angle]}
            receiveShadow
          >
            <planeGeometry args={[0.15, 2]} />
            <meshStandardMaterial
              {...ROAD_PAINT_YELLOW}
              depthWrite={false}
              polygonOffset
              polygonOffsetFactor={-3}
              polygonOffsetUnits={-3}
            />
          </mesh>
        );
      })}
      {/* Grass verges REMOVED - now handled by TerrainGround system */}
    </group>
  );
};

// Checkpoint Charlie style barrier gate with animated lifting arms
// DESIGN: Booth sits BESIDE the road, barrier arms span ACROSS the road
// Barriers automatically raise when trucks approach
const CheckpointBarrier: React.FC<{
  position: [number, number, number];
  rotation?: number;
  label?: string;
  roadWidth?: number;
  checkpointType?: 'shipping' | 'receiving';
}> = ({ position, rotation = 0, label = 'CHECKPOINT', roadWidth = 16, checkpointType }) => {
  const checkpointRootRef = useRef<THREE.Group>(null);
  const barrierArmRef = useRef<THREE.Group>(null);
  const barrierArm2Ref = useRef<THREE.Group>(null);
  const lightRef = useRef<THREE.MeshBasicMaterial>(null);
  const light2Ref = useRef<THREE.MeshBasicMaterial>(null);
  const openRef = useRef(false);
  const gateStateRef = useRef(createCheckpointGateState());
  const dock = checkpointType ?? (position[2] > 0 ? 'shipping' : 'receiving');
  const checkpointPosition = useMemo(
    () => ({ x: position[0], z: position[2] }),
    [position[0], position[2]]
  );

  // Follow the same live tractor and trailer poses that are rendered in the
  // yard. This replaces the old duplicate clock animation, which could open a
  // barrier for an imaginary truck while the visible one remained elsewhere.
  useFrame((state, delta) => {
    const time = state.clock.elapsedTime;
    gateStateRef.current = stepCheckpointGate(
      gateStateRef.current,
      checkpointPosition,
      positionRegistry.get(`${dock}-truck-cab`),
      positionRegistry.get(`${dock}-truck-trailer`),
      delta
    );
    openRef.current = gateStateRef.current.open;
    const targetAngle = openRef.current ? Math.PI / 2 : 0;
    const safeDelta = Math.min(Math.max(delta, 0), 0.1);

    if (barrierArmRef.current) {
      barrierArmRef.current.rotation.z = THREE.MathUtils.damp(
        barrierArmRef.current.rotation.z,
        targetAngle,
        5.2,
        safeDelta
      );
    }
    if (barrierArm2Ref.current) {
      barrierArm2Ref.current.rotation.z = THREE.MathUtils.damp(
        barrierArm2Ref.current.rotation.z,
        targetAngle,
        5.2,
        safeDelta
      );
    }

    const currentAngle = barrierArmRef.current?.rotation.z ?? 0;
    const armMoving = Math.abs(currentAngle - targetAngle) > 0.04;
    const armRaised = currentAngle > Math.PI / 2 - 0.12;
    const flash = Math.sin(time * 7) > 0;
    const signalColor = armMoving
      ? flash
        ? 0xffb000
        : 0x4a2600
      : armRaised && openRef.current
        ? 0x35d46f
        : 0xef2929;
    if (lightRef.current) {
      lightRef.current.color.setHex(signalColor);
    }
    if (light2Ref.current) {
      light2Ref.current.color.setHex(signalColor);
    }
    if (checkpointRootRef.current) {
      checkpointRootRef.current.userData.gateOpen = openRef.current;
      checkpointRootRef.current.userData.gatePhase = armMoving
        ? openRef.current
          ? 'opening'
          : 'closing'
        : openRef.current
          ? 'open'
          : 'closed';
      checkpointRootRef.current.userData.clearanceSecondsRemaining =
        gateStateRef.current.clearanceSecondsRemaining;
      checkpointRootRef.current.userData.armAngle = currentAngle;
    }
  });

  // Arms span half the road from each side
  const armLength = roadWidth / 2 + 1;
  const boothWidth = 3.5;
  const boothDepth = 3;
  const boothHeight = 3.5;
  // Booth offset: positioned beside the road (half road width + gap + half booth)
  const boothOffset = roadWidth / 2 + 2 + boothWidth / 2;

  return (
    <group
      ref={checkpointRootRef}
      name={`${dock}-checkpoint`}
      position={position}
      rotation={[0, rotation, 0]}
      userData={{
        noStaticBatch: true,
        dynamic: true,
        gateOpen: false,
        gatePhase: 'closed',
        clearanceSecondsRemaining: 0,
        armAngle: 0,
      }}
    >
      {/* ===== CHECKPOINT BOOTH (beside road on LEFT side) ===== */}
      <group position={[-boothOffset, 0, 0]}>
        {/* Booth base/platform */}
        <mesh position={[0, 0.15, 0]} castShadow receiveShadow>
          <boxGeometry args={[boothWidth + 1, 0.3, boothDepth + 1]} />
          <meshStandardMaterial color="#4b5563" roughness={0.8} />
        </mesh>

        <GeneratedBoundary
          fallback={
            <>
              {/* Main booth structure */}
              <mesh position={[0, boothHeight / 2 + 0.3, 0]} castShadow receiveShadow>
                <boxGeometry args={[boothWidth, boothHeight, boothDepth]} />
                <meshStandardMaterial color="#f5f5f4" roughness={0.6} />
              </mesh>

              {/* Booth roof */}
              <mesh position={[0, boothHeight + 0.5, 0]} castShadow>
                <boxGeometry args={[boothWidth + 0.8, 0.3, boothDepth + 0.8]} />
                <meshStandardMaterial color="#1f2937" roughness={0.5} />
              </mesh>
            </>
          }
        >
          <group position={[0, 0.3, 0]}>
            <GeneratedModel asset="checkpointBooth" />
          </group>
        </GeneratedBoundary>

        {/* Windows - front and back */}
        {[boothDepth / 2 + 0.01, -boothDepth / 2 - 0.01].map((z, i) => (
          <mesh key={`window-${i}`} position={[0, boothHeight / 2 + 0.8, z]}>
            <planeGeometry args={[boothWidth - 0.6, 1.5]} />
            <meshStandardMaterial
              color="#87ceeb"
              transparent
              opacity={0.6}
              metalness={0.5}
              roughness={0.1}
              side={THREE.DoubleSide}
            />
          </mesh>
        ))}

        {/* Side windows */}
        {[boothWidth / 2 + 0.01, -boothWidth / 2 - 0.01].map((x, i) => (
          <mesh
            key={`side-window-${i}`}
            position={[x, boothHeight / 2 + 0.8, 0]}
            rotation={[0, Math.PI / 2, 0]}
          >
            <planeGeometry args={[boothDepth - 0.4, 1.5]} />
            <meshStandardMaterial
              color="#87ceeb"
              transparent
              opacity={0.6}
              metalness={0.5}
              roughness={0.1}
              side={THREE.DoubleSide}
            />
          </mesh>
        ))}

        {/* Checkpoint sign on roof */}
        <mesh position={[0, boothHeight + 1.2, 0]} castShadow>
          <boxGeometry args={[boothWidth + 0.4, 0.7, 0.2]} />
          <meshStandardMaterial color="#1e3a8a" roughness={0.5} />
        </mesh>
        <Text
          position={[0, boothHeight + 1.2, 0.12]}
          fontSize={0.3}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
          surface="painted"
        >
          {label}
        </Text>
        <Text
          position={[0, boothHeight + 1.2, -0.12]}
          fontSize={0.3}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
          rotation={[0, Math.PI, 0]}
          surface="painted"
        >
          {label}
        </Text>
      </group>

      {/* ===== BARRIER 1 - LEFT EDGE OF ROAD (inbound lane at z=+3) ===== */}
      <group position={[-roadWidth / 2 - 0.5, 0, 3]}>
        {/* Barrier post */}
        <mesh position={[0, 1.5, 0]} castShadow>
          <boxGeometry args={[0.4, 3, 0.4]} />
          <meshStandardMaterial color="#dc2626" roughness={0.5} />
        </mesh>
        {/* Warning light housing */}
        <mesh position={[0, 3.2, 0]} castShadow>
          <boxGeometry args={[0.5, 0.4, 0.5]} />
          <meshStandardMaterial color="#1f2937" roughness={0.5} />
        </mesh>
        <mesh position={[0.26, 3.2, 0]}>
          <circleGeometry args={[0.15, 12]} />
          <meshBasicMaterial ref={lightRef} color="#ff0000" />
        </mesh>

        {/* Barrier arm pivot - swings inward across road */}
        <group
          ref={barrierArmRef}
          name={`${dock}-checkpoint-inbound-arm`}
          position={[0, 2.9, 0]}
          userData={{ noStaticBatch: true, dynamic: true }}
        >
          <mesh position={[armLength / 2, 0, 0]} castShadow>
            <boxGeometry args={[armLength, 0.2, 0.2]} />
            <meshStandardMaterial color="#ffffff" roughness={0.5} />
          </mesh>
          {/* Red stripes */}
          {Array.from({ length: Math.floor(armLength / 1.2) }).map((_, i) => (
            <mesh key={`stripe1-${i}`} position={[0.6 + i * 1.2, 0, 0.11]} castShadow>
              <boxGeometry args={[0.5, 0.21, 0.02]} />
              <meshStandardMaterial color="#dc2626" roughness={0.5} />
            </mesh>
          ))}
          {/* Counterweight */}
          <mesh position={[-0.4, 0, 0]} castShadow>
            <boxGeometry args={[0.6, 0.3, 0.3]} />
            <meshStandardMaterial color="#374151" roughness={0.6} />
          </mesh>
          {/* End reflector */}
          <mesh position={[armLength + 0.15, 0, 0]} castShadow>
            <boxGeometry args={[0.3, 0.3, 0.3]} />
            <meshStandardMaterial color="#dc2626" roughness={0.5} />
          </mesh>
        </group>
      </group>

      {/* ===== BARRIER 2 - RIGHT EDGE OF ROAD (outbound lane at z=-3) ===== */}
      <group position={[roadWidth / 2 + 0.5, 0, -3]}>
        {/* Barrier post */}
        <mesh position={[0, 1.5, 0]} castShadow>
          <boxGeometry args={[0.4, 3, 0.4]} />
          <meshStandardMaterial color="#dc2626" roughness={0.5} />
        </mesh>
        {/* Warning light housing */}
        <mesh position={[0, 3.2, 0]} castShadow>
          <boxGeometry args={[0.5, 0.4, 0.5]} />
          <meshStandardMaterial color="#1f2937" roughness={0.5} />
        </mesh>
        <mesh position={[-0.26, 3.2, 0]}>
          <circleGeometry args={[0.15, 12]} />
          <meshBasicMaterial ref={light2Ref} color="#ff0000" />
        </mesh>

        {/* Barrier arm pivot - swings inward across road (rotated 180°) */}
        <group
          ref={barrierArm2Ref}
          name={`${dock}-checkpoint-outbound-arm`}
          position={[0, 2.9, 0]}
          rotation={[0, Math.PI, 0]}
          userData={{ noStaticBatch: true, dynamic: true }}
        >
          <mesh position={[armLength / 2, 0, 0]} castShadow>
            <boxGeometry args={[armLength, 0.2, 0.2]} />
            <meshStandardMaterial color="#ffffff" roughness={0.5} />
          </mesh>
          {/* Red stripes */}
          {Array.from({ length: Math.floor(armLength / 1.2) }).map((_, i) => (
            <mesh key={`stripe2-${i}`} position={[0.6 + i * 1.2, 0, 0.11]} castShadow>
              <boxGeometry args={[0.5, 0.21, 0.02]} />
              <meshStandardMaterial color="#dc2626" roughness={0.5} />
            </mesh>
          ))}
          {/* Counterweight */}
          <mesh position={[-0.4, 0, 0]} castShadow>
            <boxGeometry args={[0.6, 0.3, 0.3]} />
            <meshStandardMaterial color="#374151" roughness={0.6} />
          </mesh>
          {/* End reflector */}
          <mesh position={[armLength + 0.15, 0, 0]} castShadow>
            <boxGeometry args={[0.3, 0.3, 0.3]} />
            <meshStandardMaterial color="#dc2626" roughness={0.5} />
          </mesh>
        </group>
      </group>

      {/* Stop lines painted onto `ConnectingRoad`'s carriageway. They take the
          ground-overlay datum because the road they mark took the ground datum:
          the old literals (0.09 here, 0.08 there) were a matched pair of
          clearances for `TerrainGround`'s vanished 0.05 default, and moving one
          without the other would have left the paint hanging 10 cm over its
          own road. -3 keeps them in front of the carriageway's -2. */}
      <mesh
        position={[0, EXTERIOR_LAYERS.groundOverlay, 5]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={RENDER_ORDER.floorMarkings}
        receiveShadow
      >
        <planeGeometry args={[roadWidth, 0.5]} />
        <meshStandardMaterial
          {...ROAD_PAINT_WHITE}
          polygonOffset
          polygonOffsetFactor={-3}
          polygonOffsetUnits={-3}
        />
      </mesh>
      <mesh
        position={[0, EXTERIOR_LAYERS.groundOverlay, -5]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={RENDER_ORDER.floorMarkings}
        receiveShadow
      >
        <planeGeometry args={[roadWidth, 0.5]} />
        <meshStandardMaterial
          {...ROAD_PAINT_WHITE}
          polygonOffset
          polygonOffsetFactor={-3}
          polygonOffsetUnits={-3}
        />
      </mesh>

      {/* Safety bollards at road edges */}
      {[
        [-roadWidth / 2 - 0.5, 6],
        [roadWidth / 2 + 0.5, 6],
        [-roadWidth / 2 - 0.5, -6],
        [roadWidth / 2 + 0.5, -6],
      ].map(([x, z], i) => (
        <mesh key={`bollard-${i}`} position={[x, 0.5, z]} castShadow>
          <cylinderGeometry args={[0.2, 0.2, 1, 8]} />
          <meshStandardMaterial color="#fbbf24" roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
};

// Factory exterior walls with large signs - positioned OUTSIDE the existing factory elements
export const FactoryExterior: React.FC<FactoryExteriorProps> = ({ showFactoryShell = true }) => {
  // Wall dimensions - positioned outside the factory floor
  const wallHeight = 20; // Same height for ALL walls
  const wallThickness = 0.4;

  // Exterior wall positions - these are OUTSIDE the existing factory elements
  // Factory floor extends to about x=±60, z=±80 (for truck yards)
  // Main building is roughly x=±55, z=±45 where service egress doors are
  const buildingHalfWidth = 58; // X extent (slightly outside the x=±55 doors)
  const buildingFrontZ = 48; // Front wall Z (behind the z=42 front doors)
  const buildingBackZ = -48; // Back wall Z (behind the z=-45 back doors)

  // Dock opening dimensions - per-wall widths match the <OpenDockOpening> frames
  // mounted in MillScene (shipping front width=30, receiving back width=18); height
  // matches the 14-tall frames so the steel frame/bollards/stripes frame a real hole,
  // not solid wall.
  const frontDockOpeningWidth = 30; // matches <OpenDockOpening width={30}> shipping
  const backDockOpeningWidth = 18; // matches <OpenDockOpening width={18}> receiving
  const dockOpeningHeight = 14;

  // Colors
  const wallColor = '#475569';
  const trimColor = '#374151';

  return (
    <group>
      <ExteriorLampDriver />
      <WaterAnimationManager />
      {/* ========== EXTERIOR GRASS GROUND ========== */}
      {/* DISABLED: Replaced by TerrainGround unified terrain system */}
      {/* This plane at y=-0.2 was occluding the river channel displacement (y=-2.52) */}
      {/*
      <mesh position={[0, -0.2, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[600, 600]} />
        <meshStandardMaterial color="#4a7c59" />
      </mesh>
      */}

      {showFactoryShell && (
        <>
          {/* ========== FRONT WALL (Z+) with single centered dock opening ========== */}
          {/* Left section - FULL HEIGHT - extends PAST side wall for clean corner */}
          <mesh
            position={[
              -((buildingHalfWidth + wallThickness) / 2 + frontDockOpeningWidth / 4),
              wallHeight / 2,
              buildingFrontZ,
            ]}
            castShadow
            receiveShadow
          >
            <boxGeometry
              args={[
                buildingHalfWidth + wallThickness - frontDockOpeningWidth / 2,
                wallHeight,
                wallThickness,
              ]}
            />
            <meshStandardMaterial
              color={wallColor}
              roughness={0.8}
              metalness={0.2}
              side={THREE.DoubleSide}
              normalMap={PROCEDURAL_TEXTURES.panelNormal}
              normalScale={new THREE.Vector2(0.2, 0.2)}
            />
          </mesh>

          {/* Right section - FULL HEIGHT - extends PAST side wall for clean corner */}
          <mesh
            position={[
              (buildingHalfWidth + wallThickness) / 2 + frontDockOpeningWidth / 4,
              wallHeight / 2,
              buildingFrontZ,
            ]}
            castShadow
            receiveShadow
          >
            <boxGeometry
              args={[
                buildingHalfWidth + wallThickness - frontDockOpeningWidth / 2,
                wallHeight,
                wallThickness,
              ]}
            />
            <meshStandardMaterial
              color={wallColor}
              roughness={0.8}
              metalness={0.2}
              side={THREE.DoubleSide}
              normalMap={PROCEDURAL_TEXTURES.panelNormal}
              normalScale={new THREE.Vector2(0.2, 0.2)}
            />
          </mesh>

          {/* Section above the centered dock opening */}
          <mesh
            position={[0, wallHeight - (wallHeight - dockOpeningHeight) / 2, buildingFrontZ]}
            castShadow
            receiveShadow
          >
            <boxGeometry
              args={[frontDockOpeningWidth, wallHeight - dockOpeningHeight, wallThickness]}
            />
            <meshStandardMaterial
              color={wallColor}
              roughness={0.8}
              metalness={0.2}
              side={THREE.DoubleSide}
              normalMap={PROCEDURAL_TEXTURES.panelNormal}
              normalScale={new THREE.Vector2(0.2, 0.2)}
            />
          </mesh>

          {/* Front wall trim */}
          <mesh position={[0, wallHeight + 0.3, buildingFrontZ]}>
            <boxGeometry args={[buildingHalfWidth * 2 + 1, 0.6, 0.8]} />
            <meshStandardMaterial
              color={trimColor}
              roughness={0.6}
              metalness={0.4}
              side={THREE.DoubleSide}
            />
          </mesh>

          {/* ========== FRONT SERVICE ENTRANCES ========== */}
          {/* Left service entrance at x=-45, positioned 1.5 units in front of wall */}
          <group position={[-45, 0, buildingFrontZ + 1.5]}>
            {/* Concrete entrance platform/steps */}
            <mesh position={[0, 0.2, 1.5]} castShadow receiveShadow>
              <boxGeometry args={[5, 0.4, 4]} />
              <meshStandardMaterial color="#6b7280" roughness={0.9} />
            </mesh>
            <mesh position={[0, 0.08, 3.5]} castShadow receiveShadow>
              <boxGeometry args={[5, 0.16, 1.5]} />
              <meshStandardMaterial color="#6b7280" roughness={0.9} />
            </mesh>
            {/* Door surround - protruding frame structure */}
            <mesh position={[0, 1.8, -0.3]} castShadow>
              <boxGeometry args={[4.5, 3.8, 1]} />
              <meshStandardMaterial color="#4b5563" roughness={0.7} metalness={0.3} />
            </mesh>
            {/* Door opening recess */}
            <mesh position={[0, 1.6, 0.1]}>
              <boxGeometry args={[3.2, 3.2, 0.5]} />
              <meshStandardMaterial color="#1f2937" roughness={0.9} />
            </mesh>
            {/* Double doors - industrial blue */}
            <mesh position={[-0.75, 1.55, 0.4]} castShadow>
              <boxGeometry args={[1.4, 3, 0.15]} />
              <meshStandardMaterial color="#1e3a5f" roughness={0.5} metalness={0.4} />
            </mesh>
            <mesh position={[0.75, 1.55, 0.4]} castShadow>
              <boxGeometry args={[1.4, 3, 0.15]} />
              <meshStandardMaterial color="#1e3a5f" roughness={0.5} metalness={0.4} />
            </mesh>
            {/* Glass panels on doors */}
            <mesh position={[-0.75, 1.9, 0.5]}>
              <boxGeometry args={[1, 2, 0.04]} />
              <meshStandardMaterial
                color="#87ceeb"
                transparent
                opacity={0.5}
                metalness={0.6}
                roughness={0.1}
              />
            </mesh>
            <mesh position={[0.75, 1.9, 0.5]}>
              <boxGeometry args={[1, 2, 0.04]} />
              <meshStandardMaterial
                color="#87ceeb"
                transparent
                opacity={0.5}
                metalness={0.6}
                roughness={0.1}
              />
            </mesh>
            {/* Door handles - vertical pull bars */}
            <mesh position={[-0.2, 1.5, 0.55]}>
              <boxGeometry args={[0.08, 0.7, 0.08]} />
              <meshStandardMaterial color="#d4d4d4" metalness={0.8} roughness={0.2} />
            </mesh>
            <mesh position={[0.2, 1.5, 0.55]}>
              <boxGeometry args={[0.08, 0.7, 0.08]} />
              <meshStandardMaterial color="#d4d4d4" metalness={0.8} roughness={0.2} />
            </mesh>
            {/* Metal awning/canopy */}
            <mesh position={[0, 3.9, 0.8]} castShadow>
              <boxGeometry args={[5, 0.15, 2.5]} />
              <meshStandardMaterial color="#374151" roughness={0.5} metalness={0.5} />
            </mesh>
            {/* Awning support brackets */}
            <mesh position={[-2, 3.4, 0.3]} rotation={[0.5, 0, 0]} castShadow>
              <boxGeometry args={[0.12, 1, 0.12]} />
              <meshStandardMaterial color="#4b5563" metalness={0.5} />
            </mesh>
            <mesh position={[2, 3.4, 0.3]} rotation={[0.5, 0, 0]} castShadow>
              <boxGeometry args={[0.12, 1, 0.12]} />
              <meshStandardMaterial color="#4b5563" metalness={0.5} />
            </mesh>
            {/* Handrails */}
            <mesh position={[-2.3, 0.6, 1.5]} castShadow>
              <boxGeometry args={[0.1, 1.2, 0.1]} />
              <meshStandardMaterial color="#6b7280" metalness={0.6} />
            </mesh>
            <mesh position={[2.3, 0.6, 1.5]} castShadow>
              <boxGeometry args={[0.1, 1.2, 0.1]} />
              <meshStandardMaterial color="#6b7280" metalness={0.6} />
            </mesh>
            <mesh position={[-2.3, 1.2, 2]} castShadow>
              <boxGeometry args={[0.1, 0.1, 4]} />
              <meshStandardMaterial color="#6b7280" metalness={0.6} />
            </mesh>
            <mesh position={[2.3, 1.2, 2]} castShadow>
              <boxGeometry args={[0.1, 0.1, 4]} />
              <meshStandardMaterial color="#6b7280" metalness={0.6} />
            </mesh>
            {/* Yellow safety bollards */}
            <mesh position={[-3.2, 0.5, 2.5]} castShadow>
              <cylinderGeometry args={[0.18, 0.18, 1, 12]} />
              <meshStandardMaterial color="#eab308" roughness={0.5} />
            </mesh>
            <mesh position={[3.2, 0.5, 2.5]} castShadow>
              <cylinderGeometry args={[0.18, 0.18, 1, 12]} />
              <meshStandardMaterial color="#eab308" roughness={0.5} />
            </mesh>
            {/* Exterior light fixture */}
            <mesh position={[0, 4.2, 0]} castShadow>
              <boxGeometry args={[0.6, 0.35, 0.5]} />
              <meshStandardMaterial color="#374151" roughness={0.5} metalness={0.4} />
            </mesh>
            <mesh position={[0, 4.05, 0.3]}>
              <boxGeometry args={[0.4, 0.2, 0.25]} />
              <meshBasicMaterial color="#fef3c7" />
            </mesh>
          </group>

          {/* Right service entrance at x=45, positioned 1.5 units in front of wall */}
          <group position={[45, 0, buildingFrontZ + 1.5]}>
            {/* Concrete entrance platform/steps */}
            <mesh position={[0, 0.2, 1.5]} castShadow receiveShadow>
              <boxGeometry args={[5, 0.4, 4]} />
              <meshStandardMaterial color="#6b7280" roughness={0.9} />
            </mesh>
            <mesh position={[0, 0.08, 3.5]} castShadow receiveShadow>
              <boxGeometry args={[5, 0.16, 1.5]} />
              <meshStandardMaterial color="#6b7280" roughness={0.9} />
            </mesh>
            {/* Door surround - protruding frame structure */}
            <mesh position={[0, 1.8, -0.3]} castShadow>
              <boxGeometry args={[4.5, 3.8, 1]} />
              <meshStandardMaterial color="#4b5563" roughness={0.7} metalness={0.3} />
            </mesh>
            {/* Door opening recess */}
            <mesh position={[0, 1.6, 0.1]}>
              <boxGeometry args={[3.2, 3.2, 0.5]} />
              <meshStandardMaterial color="#1f2937" roughness={0.9} />
            </mesh>
            {/* Double doors - industrial blue */}
            <mesh position={[-0.75, 1.55, 0.4]} castShadow>
              <boxGeometry args={[1.4, 3, 0.15]} />
              <meshStandardMaterial color="#1e3a5f" roughness={0.5} metalness={0.4} />
            </mesh>
            <mesh position={[0.75, 1.55, 0.4]} castShadow>
              <boxGeometry args={[1.4, 3, 0.15]} />
              <meshStandardMaterial color="#1e3a5f" roughness={0.5} metalness={0.4} />
            </mesh>
            {/* Glass panels on doors */}
            <mesh position={[-0.75, 1.9, 0.5]}>
              <boxGeometry args={[1, 2, 0.04]} />
              <meshStandardMaterial
                color="#87ceeb"
                transparent
                opacity={0.5}
                metalness={0.6}
                roughness={0.1}
              />
            </mesh>
            <mesh position={[0.75, 1.9, 0.5]}>
              <boxGeometry args={[1, 2, 0.04]} />
              <meshStandardMaterial
                color="#87ceeb"
                transparent
                opacity={0.5}
                metalness={0.6}
                roughness={0.1}
              />
            </mesh>
            {/* Door handles - vertical pull bars */}
            <mesh position={[-0.2, 1.5, 0.55]}>
              <boxGeometry args={[0.08, 0.7, 0.08]} />
              <meshStandardMaterial color="#d4d4d4" metalness={0.8} roughness={0.2} />
            </mesh>
            <mesh position={[0.2, 1.5, 0.55]}>
              <boxGeometry args={[0.08, 0.7, 0.08]} />
              <meshStandardMaterial color="#d4d4d4" metalness={0.8} roughness={0.2} />
            </mesh>
            {/* Metal awning/canopy */}
            <mesh position={[0, 3.9, 0.8]} castShadow>
              <boxGeometry args={[5, 0.15, 2.5]} />
              <meshStandardMaterial color="#374151" roughness={0.5} metalness={0.5} />
            </mesh>
            {/* Awning support brackets */}
            <mesh position={[-2, 3.4, 0.3]} rotation={[0.5, 0, 0]} castShadow>
              <boxGeometry args={[0.12, 1, 0.12]} />
              <meshStandardMaterial color="#4b5563" metalness={0.5} />
            </mesh>
            <mesh position={[2, 3.4, 0.3]} rotation={[0.5, 0, 0]} castShadow>
              <boxGeometry args={[0.12, 1, 0.12]} />
              <meshStandardMaterial color="#4b5563" metalness={0.5} />
            </mesh>
            {/* Handrails */}
            <mesh position={[-2.3, 0.6, 1.5]} castShadow>
              <boxGeometry args={[0.1, 1.2, 0.1]} />
              <meshStandardMaterial color="#6b7280" metalness={0.6} />
            </mesh>
            <mesh position={[2.3, 0.6, 1.5]} castShadow>
              <boxGeometry args={[0.1, 1.2, 0.1]} />
              <meshStandardMaterial color="#6b7280" metalness={0.6} />
            </mesh>
            <mesh position={[-2.3, 1.2, 2]} castShadow>
              <boxGeometry args={[0.1, 0.1, 4]} />
              <meshStandardMaterial color="#6b7280" metalness={0.6} />
            </mesh>
            <mesh position={[2.3, 1.2, 2]} castShadow>
              <boxGeometry args={[0.1, 0.1, 4]} />
              <meshStandardMaterial color="#6b7280" metalness={0.6} />
            </mesh>
            {/* Yellow safety bollards */}
            <mesh position={[-3.2, 0.5, 2.5]} castShadow>
              <cylinderGeometry args={[0.18, 0.18, 1, 12]} />
              <meshStandardMaterial color="#eab308" roughness={0.5} />
            </mesh>
            <mesh position={[3.2, 0.5, 2.5]} castShadow>
              <cylinderGeometry args={[0.18, 0.18, 1, 12]} />
              <meshStandardMaterial color="#eab308" roughness={0.5} />
            </mesh>
            {/* Exterior light fixture */}
            <mesh position={[0, 4.2, 0]} castShadow>
              <boxGeometry args={[0.6, 0.35, 0.5]} />
              <meshStandardMaterial color="#374151" roughness={0.5} metalness={0.4} />
            </mesh>
            <mesh position={[0, 4.05, 0.3]}>
              <boxGeometry args={[0.4, 0.2, 0.25]} />
              <meshBasicMaterial color="#fef3c7" />
            </mesh>
          </group>

          {/* ========== FRONT SIGN - Large Red Sign (similar to truck signage) ========== */}
          <group position={[0, wallHeight / 2 + 2, buildingFrontZ + 1.5]}>
            {/* Main sign background - Red like the truck signs */}
            <mesh frustumCulled={false}>
              <boxGeometry args={[80, 10, 0.5]} />
              <meshBasicMaterial color="#dc2626" />
            </mesh>
            {/* Gold trim border */}
            <mesh position={[0, 0, 0.3]} frustumCulled={false}>
              <boxGeometry args={[82, 10.6, 0.15]} />
              <meshBasicMaterial color="#fbbf24" />
            </mesh>
            {/* Inner red panel */}
            <mesh position={[0, 0, 0.4]} frustumCulled={false}>
              <boxGeometry args={[79, 9.5, 0.1]} />
              <meshBasicMaterial color="#b91c1c" />
            </mesh>
            {/* Company name */}
            <Text
              position={[0, 1.5, 0.6]}
              fontSize={5}
              color="#ffffff"
              anchorX="center"
              anchorY="middle"
              fontWeight="bold"
              outlineWidth={0.1}
              outlineColor="#7f1d1d"
            >
              MillOS GRAIN MILL
            </Text>
            {/* Tagline */}
            <Text
              position={[0, -2.5, 0.6]}
              fontSize={1.8}
              color="#fef3c7"
              anchorX="center"
              anchorY="middle"
            >
              EST. 1952 • QUALITY FLOUR PRODUCTS
            </Text>
          </group>

          {/* ========== BACK WALL (Z-) with dock opening ========== */}
          {/* Left section - FULL HEIGHT - extends PAST side wall for clean corner */}
          <mesh
            position={[
              -((buildingHalfWidth + wallThickness) / 2 + backDockOpeningWidth / 4),
              wallHeight / 2,
              buildingBackZ,
            ]}
            castShadow
            receiveShadow
          >
            <boxGeometry
              args={[
                buildingHalfWidth + wallThickness - backDockOpeningWidth / 2,
                wallHeight,
                wallThickness,
              ]}
            />
            <meshStandardMaterial
              color={wallColor}
              roughness={0.8}
              metalness={0.2}
              side={THREE.DoubleSide}
              normalMap={PROCEDURAL_TEXTURES.panelNormal}
              normalScale={new THREE.Vector2(0.2, 0.2)}
            />
          </mesh>
          {/* Right section - FULL HEIGHT - extends PAST side wall for clean corner */}
          <mesh
            position={[
              (buildingHalfWidth + wallThickness) / 2 + backDockOpeningWidth / 4,
              wallHeight / 2,
              buildingBackZ,
            ]}
            castShadow
            receiveShadow
          >
            <boxGeometry
              args={[
                buildingHalfWidth + wallThickness - backDockOpeningWidth / 2,
                wallHeight,
                wallThickness,
              ]}
            />
            <meshStandardMaterial
              color={wallColor}
              roughness={0.8}
              metalness={0.2}
              side={THREE.DoubleSide}
              normalMap={PROCEDURAL_TEXTURES.panelNormal}
              normalScale={new THREE.Vector2(0.2, 0.2)}
            />
          </mesh>
          {/* Section above dock opening - matches wall height */}
          <mesh
            position={[0, wallHeight - (wallHeight - dockOpeningHeight) / 2, buildingBackZ]}
            castShadow
            receiveShadow
          >
            <boxGeometry
              args={[backDockOpeningWidth, wallHeight - dockOpeningHeight, wallThickness]}
            />
            <meshStandardMaterial
              color={wallColor}
              roughness={0.8}
              metalness={0.2}
              side={THREE.DoubleSide}
              normalMap={PROCEDURAL_TEXTURES.panelNormal}
              normalScale={new THREE.Vector2(0.2, 0.2)}
            />
          </mesh>

          {/* Back wall trim */}
          <mesh position={[0, wallHeight + 0.3, buildingBackZ]}>
            <boxGeometry args={[buildingHalfWidth * 2 + 1, 0.6, 0.8]} />
            <meshStandardMaterial
              color={trimColor}
              roughness={0.6}
              metalness={0.4}
              side={THREE.DoubleSide}
            />
          </mesh>

          {/* ========== BACK EMERGENCY EXITS - Realistic Industrial Style ========== */}
          {/* Left emergency exit at x=-45 - positioned 1.5 units out from wall */}
          <group position={[-45, 0, buildingBackZ - 1.5]} rotation={[0, Math.PI, 0]}>
            {/* Concrete landing pad */}
            <mesh position={[0, 0.15, 1.5]} castShadow receiveShadow>
              <boxGeometry args={[4, 0.3, 3.5]} />
              <meshStandardMaterial color="#6b7280" roughness={0.9} />
            </mesh>
            {/* Door surround - protruding frame structure */}
            <mesh position={[0, 1.6, -0.2]} castShadow>
              <boxGeometry args={[3.5, 3.4, 0.8]} />
              <meshStandardMaterial color="#4b5563" roughness={0.7} metalness={0.3} />
            </mesh>
            {/* Door opening recess */}
            <mesh position={[0, 1.5, 0.15]}>
              <boxGeometry args={[2.5, 3, 0.4]} />
              <meshStandardMaterial color="#1f2937" roughness={0.9} />
            </mesh>
            {/* Steel fire door - industrial green */}
            <mesh position={[0, 1.5, 0.4]} castShadow>
              <boxGeometry args={[2, 2.8, 0.12]} />
              <meshStandardMaterial color="#365314" roughness={0.6} metalness={0.4} />
            </mesh>
            {/* Small reinforced window */}
            <mesh position={[0, 2.1, 0.5]}>
              <boxGeometry args={[0.5, 0.6, 0.03]} />
              <meshStandardMaterial
                color="#64748b"
                transparent
                opacity={0.5}
                metalness={0.6}
                roughness={0.2}
              />
            </mesh>
            {/* Wire mesh on window */}
            <mesh position={[0, 2.1, 0.52]}>
              <boxGeometry args={[0.48, 0.58, 0.01]} />
              <meshStandardMaterial color="#374151" wireframe transparent opacity={0.6} />
            </mesh>
            {/* Crash bar / panic hardware */}
            <mesh position={[0, 1.3, 0.5]}>
              <boxGeometry args={[1.5, 0.12, 0.1]} />
              <meshStandardMaterial color="#9ca3af" metalness={0.7} roughness={0.3} />
            </mesh>
            {/* Door closer at top */}
            <mesh position={[0.6, 2.75, 0.45]}>
              <boxGeometry args={[0.5, 0.15, 0.1]} />
              <meshStandardMaterial color="#374151" metalness={0.5} />
            </mesh>
            {/* EXIT sign above door - standard emergency */}
            <mesh position={[0, 3.4, 0.3]}>
              <boxGeometry args={[1, 0.45, 0.1]} />
              <meshStandardMaterial color="#dc2626" emissive="#dc2626" emissiveIntensity={0.5} />
            </mesh>
            {/* Running man pictogram area */}
            <mesh position={[0, 3.4, 0.36]}>
              <boxGeometry args={[0.8, 0.35, 0.02]} />
              <meshBasicMaterial color="#ffffff" />
            </mesh>
            {/* Wall-mounted emergency light */}
            <mesh position={[0, 3.8, 0.2]} castShadow>
              <boxGeometry args={[0.6, 0.22, 0.15]} />
              <meshStandardMaterial color="#e5e7eb" roughness={0.4} />
            </mesh>
            <mesh position={[0, 3.7, 0.3]}>
              <boxGeometry args={[0.5, 0.1, 0.06]} />
              <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={0.6} />
            </mesh>
            {/* Kick plate at bottom of door */}
            <mesh position={[0, 0.25, 0.48]}>
              <boxGeometry args={[1.9, 0.4, 0.03]} />
              <meshStandardMaterial color="#6b7280" metalness={0.6} roughness={0.4} />
            </mesh>
            {/* Yellow hazard stripes on ground */}
            <mesh position={[0, FLOOR_LAYERS.safetyMain, 2]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[3.5, 2]} />
              <meshStandardMaterial
                color="#eab308"
                roughness={0.8}
                polygonOffset
                polygonOffsetFactor={POLYGON_OFFSET.standard.factor}
                polygonOffsetUnits={POLYGON_OFFSET.standard.units}
              />
            </mesh>
          </group>

          {/* Right emergency exit at x=45 - positioned 1.5 units out from wall */}
          <group position={[45, 0, buildingBackZ - 1.5]} rotation={[0, Math.PI, 0]}>
            {/* Concrete landing pad */}
            <mesh position={[0, 0.15, 1.5]} castShadow receiveShadow>
              <boxGeometry args={[4, 0.3, 3.5]} />
              <meshStandardMaterial color="#6b7280" roughness={0.9} />
            </mesh>
            {/* Door surround - protruding frame structure */}
            <mesh position={[0, 1.6, -0.2]} castShadow>
              <boxGeometry args={[3.5, 3.4, 0.8]} />
              <meshStandardMaterial color="#4b5563" roughness={0.7} metalness={0.3} />
            </mesh>
            {/* Door opening recess */}
            <mesh position={[0, 1.5, 0.15]}>
              <boxGeometry args={[2.5, 3, 0.4]} />
              <meshStandardMaterial color="#1f2937" roughness={0.9} />
            </mesh>
            {/* Steel fire door - industrial green */}
            <mesh position={[0, 1.5, 0.4]} castShadow>
              <boxGeometry args={[2, 2.8, 0.12]} />
              <meshStandardMaterial color="#365314" roughness={0.6} metalness={0.4} />
            </mesh>
            {/* Small reinforced window */}
            <mesh position={[0, 2.1, 0.5]}>
              <boxGeometry args={[0.5, 0.6, 0.03]} />
              <meshStandardMaterial
                color="#64748b"
                transparent
                opacity={0.5}
                metalness={0.6}
                roughness={0.2}
              />
            </mesh>
            {/* Wire mesh on window */}
            <mesh position={[0, 2.1, 0.52]}>
              <boxGeometry args={[0.48, 0.58, 0.01]} />
              <meshStandardMaterial color="#374151" wireframe transparent opacity={0.6} />
            </mesh>
            {/* Crash bar / panic hardware */}
            <mesh position={[0, 1.3, 0.5]}>
              <boxGeometry args={[1.5, 0.12, 0.1]} />
              <meshStandardMaterial color="#9ca3af" metalness={0.7} roughness={0.3} />
            </mesh>
            {/* Door closer at top */}
            <mesh position={[0.6, 2.75, 0.45]}>
              <boxGeometry args={[0.5, 0.15, 0.1]} />
              <meshStandardMaterial color="#374151" metalness={0.5} />
            </mesh>
            {/* EXIT sign above door - standard emergency */}
            <mesh position={[0, 3.4, 0.3]}>
              <boxGeometry args={[1, 0.45, 0.1]} />
              <meshStandardMaterial color="#dc2626" emissive="#dc2626" emissiveIntensity={0.5} />
            </mesh>
            {/* Running man pictogram area */}
            <mesh position={[0, 3.4, 0.36]}>
              <boxGeometry args={[0.8, 0.35, 0.02]} />
              <meshBasicMaterial color="#ffffff" />
            </mesh>
            {/* Wall-mounted emergency light */}
            <mesh position={[0, 3.8, 0.2]} castShadow>
              <boxGeometry args={[0.6, 0.22, 0.15]} />
              <meshStandardMaterial color="#e5e7eb" roughness={0.4} />
            </mesh>
            <mesh position={[0, 3.7, 0.3]}>
              <boxGeometry args={[0.5, 0.1, 0.06]} />
              <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={0.6} />
            </mesh>
            {/* Kick plate at bottom of door */}
            <mesh position={[0, 0.25, 0.48]}>
              <boxGeometry args={[1.9, 0.4, 0.03]} />
              <meshStandardMaterial color="#6b7280" metalness={0.6} roughness={0.4} />
            </mesh>
            {/* Yellow hazard stripes on ground */}
            <mesh position={[0, FLOOR_LAYERS.safetyMain, 2]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[3.5, 2]} />
              <meshStandardMaterial
                color="#eab308"
                roughness={0.8}
                polygonOffset
                polygonOffsetFactor={POLYGON_OFFSET.standard.factor}
                polygonOffsetUnits={POLYGON_OFFSET.standard.units}
              />
            </mesh>
          </group>

          {/* ========== BACK SIGN - Large Red Sign (matching front sign) ========== */}
          <group position={[0, wallHeight / 2 + 2, buildingBackZ - 1.5]} rotation={[0, Math.PI, 0]}>
            {/* Main sign background - Red like the truck signs */}
            <mesh frustumCulled={false}>
              <boxGeometry args={[80, 10, 0.5]} />
              <meshBasicMaterial color="#dc2626" />
            </mesh>
            {/* Gold trim border */}
            <mesh position={[0, 0, 0.3]} frustumCulled={false}>
              <boxGeometry args={[82, 10.6, 0.15]} />
              <meshBasicMaterial color="#fbbf24" />
            </mesh>
            {/* Inner red panel */}
            <mesh position={[0, 0, 0.4]} frustumCulled={false}>
              <boxGeometry args={[79, 9.5, 0.1]} />
              <meshBasicMaterial color="#b91c1c" />
            </mesh>
            {/* Company name */}
            <Text
              position={[0, 1.5, 0.6]}
              fontSize={5}
              color="#ffffff"
              anchorX="center"
              anchorY="middle"
              fontWeight="bold"
              outlineWidth={0.1}
              outlineColor="#7f1d1d"
            >
              MillOS GRAIN MILL
            </Text>
            {/* Tagline */}
            <Text
              position={[0, -2.5, 0.6]}
              fontSize={1.8}
              color="#fef3c7"
              anchorX="center"
              anchorY="middle"
            >
              EST. 1952 • QUALITY FLOUR PRODUCTS
            </Text>
          </group>

          {/* ========== LEFT SIDE WALL (X-) with service egress ========== */}
          {/* Side walls end INSIDE front/back walls - front/back walls wrap around corners */}
          {/* Service egress opening in the wall, West Exit */}
          {(() => {
            const sideWallLength = Math.abs(buildingFrontZ - buildingBackZ) - wallThickness * 2;
            const doorWidth = 3;
            const doorHeight = 3;
            const doorZ = 0;
            const frontSegmentLength = sideWallLength / 2 - doorWidth / 2;
            const backSegmentLength = sideWallLength / 2 - doorWidth / 2;
            const frontSegmentZ = doorZ + doorWidth / 2 + frontSegmentLength / 2;
            const backSegmentZ = doorZ - doorWidth / 2 - backSegmentLength / 2;

            return (
              <>
                {/* Front section of left wall */}
                <mesh
                  position={[-buildingHalfWidth, wallHeight / 2, frontSegmentZ]}
                  castShadow
                  receiveShadow
                >
                  <boxGeometry args={[wallThickness, wallHeight, frontSegmentLength]} />
                  <meshStandardMaterial
                    color={wallColor}
                    roughness={0.8}
                    metalness={0.2}
                    side={THREE.DoubleSide}
                  />
                </mesh>
                {/* Back section of left wall */}
                <mesh
                  position={[-buildingHalfWidth, wallHeight / 2, backSegmentZ]}
                  castShadow
                  receiveShadow
                >
                  <boxGeometry args={[wallThickness, wallHeight, backSegmentLength]} />
                  <meshStandardMaterial
                    color={wallColor}
                    roughness={0.8}
                    metalness={0.2}
                    side={THREE.DoubleSide}
                  />
                </mesh>
                {/* Section above door opening */}
                <mesh
                  position={[-buildingHalfWidth, doorHeight + (wallHeight - doorHeight) / 2, doorZ]}
                  castShadow
                  receiveShadow
                >
                  <boxGeometry args={[wallThickness, wallHeight - doorHeight, doorWidth]} />
                  <meshStandardMaterial
                    color={wallColor}
                    roughness={0.8}
                    metalness={0.2}
                    side={THREE.DoubleSide}
                  />
                </mesh>
                {/* West service egress, exterior side */}
                <group
                  position={[-buildingHalfWidth - 0.3, 0, doorZ]}
                  rotation={[0, Math.PI / 2, 0]}
                >
                  <mesh position={[0, doorHeight / 2, 0]} castShadow>
                    <boxGeometry args={[doorWidth + 0.3, doorHeight + 0.15, 0.15]} />
                    <meshStandardMaterial color="#374151" roughness={0.6} metalness={0.3} />
                  </mesh>
                  <mesh position={[0, doorHeight / 2, 0.08]}>
                    <boxGeometry args={[doorWidth - 0.3, doorHeight - 0.2, 0.1]} />
                    <meshStandardMaterial color="#1f2937" roughness={0.8} />
                  </mesh>
                  <mesh position={[-0.7, doorHeight / 2, 0.15]} castShadow>
                    <boxGeometry args={[1.2, doorHeight - 0.4, 0.08]} />
                    <meshStandardMaterial color="#dc2626" roughness={0.5} metalness={0.3} />
                  </mesh>
                  <mesh position={[0.7, doorHeight / 2, 0.15]} castShadow>
                    <boxGeometry args={[1.2, doorHeight - 0.4, 0.08]} />
                    <meshStandardMaterial color="#dc2626" roughness={0.5} metalness={0.3} />
                  </mesh>
                  <mesh position={[-0.7, doorHeight * 0.65, 0.2]}>
                    <boxGeometry args={[0.6, 0.8, 0.02]} />
                    <meshStandardMaterial
                      color="#1e3a5f"
                      transparent
                      opacity={0.7}
                      roughness={0.1}
                    />
                  </mesh>
                  <mesh position={[0.7, doorHeight * 0.65, 0.2]}>
                    <boxGeometry args={[0.6, 0.8, 0.02]} />
                    <meshStandardMaterial
                      color="#1e3a5f"
                      transparent
                      opacity={0.7}
                      roughness={0.1}
                    />
                  </mesh>
                  <mesh position={[-0.7, doorHeight * 0.4, 0.2]}>
                    <boxGeometry args={[0.8, 0.08, 0.05]} />
                    <meshStandardMaterial color="#fbbf24" roughness={0.85} />
                  </mesh>
                  <mesh position={[0.7, doorHeight * 0.4, 0.2]}>
                    <boxGeometry args={[0.8, 0.08, 0.05]} />
                    <meshStandardMaterial color="#fbbf24" roughness={0.85} />
                  </mesh>
                  <mesh position={[0, doorHeight + 0.4, 0.1]}>
                    <boxGeometry args={[1.5, 0.4, 0.08]} />
                    <meshStandardMaterial
                      color="#dc2626"
                      emissive="#dc2626"
                      emissiveIntensity={0.3}
                    />
                  </mesh>
                  <mesh position={[0, doorHeight + 0.7, 0.1]}>
                    <boxGeometry args={[0.6, 0.15, 0.1]} />
                    <meshStandardMaterial
                      color="#22c55e"
                      emissive="#22c55e"
                      emissiveIntensity={0.5}
                    />
                  </mesh>
                </group>
                {/* West service egress, interior side */}
                <group
                  position={[-buildingHalfWidth + 0.3, 0, doorZ]}
                  rotation={[0, -Math.PI / 2, 0]}
                >
                  <mesh position={[0, doorHeight / 2, 0]} castShadow>
                    <boxGeometry args={[doorWidth + 0.3, doorHeight + 0.15, 0.15]} />
                    <meshStandardMaterial color="#374151" roughness={0.6} metalness={0.3} />
                  </mesh>
                  <mesh position={[-0.7, doorHeight / 2, 0.15]} castShadow>
                    <boxGeometry args={[1.2, doorHeight - 0.4, 0.08]} />
                    <meshStandardMaterial color="#dc2626" roughness={0.5} metalness={0.3} />
                  </mesh>
                  <mesh position={[0.7, doorHeight / 2, 0.15]} castShadow>
                    <boxGeometry args={[1.2, doorHeight - 0.4, 0.08]} />
                    <meshStandardMaterial color="#dc2626" roughness={0.5} metalness={0.3} />
                  </mesh>
                  <mesh position={[-0.7, doorHeight * 0.65, 0.2]}>
                    <boxGeometry args={[0.6, 0.8, 0.02]} />
                    <meshStandardMaterial
                      color="#1e3a5f"
                      transparent
                      opacity={0.7}
                      roughness={0.1}
                    />
                  </mesh>
                  <mesh position={[0.7, doorHeight * 0.65, 0.2]}>
                    <boxGeometry args={[0.6, 0.8, 0.02]} />
                    <meshStandardMaterial
                      color="#1e3a5f"
                      transparent
                      opacity={0.7}
                      roughness={0.1}
                    />
                  </mesh>
                  <mesh position={[-0.7, doorHeight * 0.4, 0.2]}>
                    <boxGeometry args={[0.8, 0.08, 0.05]} />
                    <meshStandardMaterial color="#fbbf24" roughness={0.85} />
                  </mesh>
                  <mesh position={[0.7, doorHeight * 0.4, 0.2]}>
                    <boxGeometry args={[0.8, 0.08, 0.05]} />
                    <meshStandardMaterial color="#fbbf24" roughness={0.85} />
                  </mesh>
                  <mesh position={[0, doorHeight + 0.4, 0.1]}>
                    <boxGeometry args={[1.5, 0.4, 0.08]} />
                    <meshStandardMaterial
                      color="#dc2626"
                      emissive="#dc2626"
                      emissiveIntensity={0.3}
                    />
                  </mesh>
                </group>
              </>
            );
          })()}
          <mesh position={[-buildingHalfWidth, wallHeight + 0.3, 0]}>
            <boxGeometry
              args={[0.8, 0.6, Math.abs(buildingFrontZ - buildingBackZ) - wallThickness * 2 + 0.5]}
            />
            <meshStandardMaterial
              color={trimColor}
              roughness={0.6}
              metalness={0.4}
              side={THREE.DoubleSide}
            />
          </mesh>

          {/* ========== RIGHT SIDE WALL (X+) with service egress ========== */}
          {/* Service egress opening in the wall, East Exit */}
          {(() => {
            const sideWallLength = Math.abs(buildingFrontZ - buildingBackZ) - wallThickness * 2;
            const doorWidth = 3;
            const doorHeight = 3;
            const doorZ = 0;
            const frontSegmentLength = sideWallLength / 2 - doorWidth / 2;
            const backSegmentLength = sideWallLength / 2 - doorWidth / 2;
            const frontSegmentZ = doorZ + doorWidth / 2 + frontSegmentLength / 2;
            const backSegmentZ = doorZ - doorWidth / 2 - backSegmentLength / 2;

            return (
              <>
                {/* Front section of right wall */}
                <mesh
                  position={[buildingHalfWidth, wallHeight / 2, frontSegmentZ]}
                  castShadow
                  receiveShadow
                >
                  <boxGeometry args={[wallThickness, wallHeight, frontSegmentLength]} />
                  <meshStandardMaterial
                    color={wallColor}
                    roughness={0.8}
                    metalness={0.2}
                    side={THREE.DoubleSide}
                  />
                </mesh>
                {/* Back section of right wall */}
                <mesh
                  position={[buildingHalfWidth, wallHeight / 2, backSegmentZ]}
                  castShadow
                  receiveShadow
                >
                  <boxGeometry args={[wallThickness, wallHeight, backSegmentLength]} />
                  <meshStandardMaterial
                    color={wallColor}
                    roughness={0.8}
                    metalness={0.2}
                    side={THREE.DoubleSide}
                  />
                </mesh>
                {/* Section above door opening */}
                <mesh
                  position={[buildingHalfWidth, doorHeight + (wallHeight - doorHeight) / 2, doorZ]}
                  castShadow
                  receiveShadow
                >
                  <boxGeometry args={[wallThickness, wallHeight - doorHeight, doorWidth]} />
                  <meshStandardMaterial
                    color={wallColor}
                    roughness={0.8}
                    metalness={0.2}
                    side={THREE.DoubleSide}
                  />
                </mesh>
                {/* East service egress, exterior side */}
                <group
                  position={[buildingHalfWidth + 0.3, 0, doorZ]}
                  rotation={[0, -Math.PI / 2, 0]}
                >
                  <mesh position={[0, doorHeight / 2, 0]} castShadow>
                    <boxGeometry args={[doorWidth + 0.3, doorHeight + 0.15, 0.15]} />
                    <meshStandardMaterial color="#374151" roughness={0.6} metalness={0.3} />
                  </mesh>
                  <mesh position={[0, doorHeight / 2, 0.08]}>
                    <boxGeometry args={[doorWidth - 0.3, doorHeight - 0.2, 0.1]} />
                    <meshStandardMaterial color="#1f2937" roughness={0.8} />
                  </mesh>
                  <mesh position={[-0.7, doorHeight / 2, 0.15]} castShadow>
                    <boxGeometry args={[1.2, doorHeight - 0.4, 0.08]} />
                    <meshStandardMaterial color="#dc2626" roughness={0.5} metalness={0.3} />
                  </mesh>
                  <mesh position={[0.7, doorHeight / 2, 0.15]} castShadow>
                    <boxGeometry args={[1.2, doorHeight - 0.4, 0.08]} />
                    <meshStandardMaterial color="#dc2626" roughness={0.5} metalness={0.3} />
                  </mesh>
                  <mesh position={[-0.7, doorHeight * 0.65, 0.2]}>
                    <boxGeometry args={[0.6, 0.8, 0.02]} />
                    <meshStandardMaterial
                      color="#1e3a5f"
                      transparent
                      opacity={0.7}
                      roughness={0.1}
                    />
                  </mesh>
                  <mesh position={[0.7, doorHeight * 0.65, 0.2]}>
                    <boxGeometry args={[0.6, 0.8, 0.02]} />
                    <meshStandardMaterial
                      color="#1e3a5f"
                      transparent
                      opacity={0.7}
                      roughness={0.1}
                    />
                  </mesh>
                  <mesh position={[-0.7, doorHeight * 0.4, 0.2]}>
                    <boxGeometry args={[0.8, 0.08, 0.05]} />
                    <meshStandardMaterial color="#fbbf24" roughness={0.85} />
                  </mesh>
                  <mesh position={[0.7, doorHeight * 0.4, 0.2]}>
                    <boxGeometry args={[0.8, 0.08, 0.05]} />
                    <meshStandardMaterial color="#fbbf24" roughness={0.85} />
                  </mesh>
                  <mesh position={[0, doorHeight + 0.4, 0.1]}>
                    <boxGeometry args={[1.5, 0.4, 0.08]} />
                    <meshStandardMaterial
                      color="#dc2626"
                      emissive="#dc2626"
                      emissiveIntensity={0.3}
                    />
                  </mesh>
                  <mesh position={[0, doorHeight + 0.7, 0.1]}>
                    <boxGeometry args={[0.6, 0.15, 0.1]} />
                    <meshStandardMaterial
                      color="#22c55e"
                      emissive="#22c55e"
                      emissiveIntensity={0.5}
                    />
                  </mesh>
                </group>
                {/* East service egress, interior side */}
                <group
                  position={[buildingHalfWidth - 0.3, 0, doorZ]}
                  rotation={[0, Math.PI / 2, 0]}
                >
                  <mesh position={[0, doorHeight / 2, 0]} castShadow>
                    <boxGeometry args={[doorWidth + 0.3, doorHeight + 0.15, 0.15]} />
                    <meshStandardMaterial color="#374151" roughness={0.6} metalness={0.3} />
                  </mesh>
                  <mesh position={[-0.7, doorHeight / 2, 0.15]} castShadow>
                    <boxGeometry args={[1.2, doorHeight - 0.4, 0.08]} />
                    <meshStandardMaterial color="#dc2626" roughness={0.5} metalness={0.3} />
                  </mesh>
                  <mesh position={[0.7, doorHeight / 2, 0.15]} castShadow>
                    <boxGeometry args={[1.2, doorHeight - 0.4, 0.08]} />
                    <meshStandardMaterial color="#dc2626" roughness={0.5} metalness={0.3} />
                  </mesh>
                  <mesh position={[-0.7, doorHeight * 0.65, 0.2]}>
                    <boxGeometry args={[0.6, 0.8, 0.02]} />
                    <meshStandardMaterial
                      color="#1e3a5f"
                      transparent
                      opacity={0.7}
                      roughness={0.1}
                    />
                  </mesh>
                  <mesh position={[0.7, doorHeight * 0.65, 0.2]}>
                    <boxGeometry args={[0.6, 0.8, 0.02]} />
                    <meshStandardMaterial
                      color="#1e3a5f"
                      transparent
                      opacity={0.7}
                      roughness={0.1}
                    />
                  </mesh>
                  <mesh position={[-0.7, doorHeight * 0.4, 0.2]}>
                    <boxGeometry args={[0.8, 0.08, 0.05]} />
                    <meshStandardMaterial color="#fbbf24" roughness={0.85} />
                  </mesh>
                  <mesh position={[0.7, doorHeight * 0.4, 0.2]}>
                    <boxGeometry args={[0.8, 0.08, 0.05]} />
                    <meshStandardMaterial color="#fbbf24" roughness={0.85} />
                  </mesh>
                  <mesh position={[0, doorHeight + 0.4, 0.1]}>
                    <boxGeometry args={[1.5, 0.4, 0.08]} />
                    <meshStandardMaterial
                      color="#dc2626"
                      emissive="#dc2626"
                      emissiveIntensity={0.3}
                    />
                  </mesh>
                </group>
              </>
            );
          })()}
          <mesh position={[buildingHalfWidth, wallHeight + 0.3, 0]}>
            <boxGeometry
              args={[0.8, 0.6, Math.abs(buildingFrontZ - buildingBackZ) - wallThickness * 2 + 0.5]}
            />
            <meshStandardMaterial
              color={trimColor}
              roughness={0.6}
              metalness={0.4}
              side={THREE.DoubleSide}
            />
          </mesh>
        </>
      )}

      {/* CORNER COLUMNS REMOVED - were causing visual protrusion issues */}

      {/* ========== PERIMETER FENCE ========== */}
      {/* Fence around property - with gate openings for truck access */}
      {/* Shipping road at x=20 (width 16, spans x=12-28), Receiving road at x=-20 (spans x=-28 to -12) */}
      <group>
        {/* Front fence (Z+) - left section (ends before receiving road area) */}
        <FenceSection start={[-95, 0, 85]} end={[-32, 0, 85]} />
        {/* Front fence - right section (starts after shipping road area) */}
        <FenceSection start={[32, 0, 85]} end={[95, 0, 85]} />

        {/* Back fence (Z-) - left section (ends before receiving road area) */}
        <FenceSection start={[-95, 0, -85]} end={[-32, 0, -85]} />
        {/* Back fence - right section (starts after shipping road area) */}
        <FenceSection start={[32, 0, -85]} end={[95, 0, -85]} />

        {/* Left fence (X-) */}
        <FenceSection start={[-95, 0, -85]} end={[-95, 0, 85]} />

        {/* Right fence (X+) */}
        <FenceSection start={[95, 0, -85]} end={[95, 0, 85]} />

        {/* Gate posts - front entrance (at fence gap edges) */}
        {[-32, 32].map((x, i) => (
          <group key={`gate-front-${i}`} position={[x, 0, 85]}>
            <mesh position={[0, 1.5, 0]} castShadow>
              <boxGeometry args={[0.4, 3, 0.4]} />
              <meshStandardMaterial color="#263238" roughness={0.5} metalness={0.4} />
            </mesh>
            <mesh position={[0, 3.2, 0]} castShadow>
              <sphereGeometry args={[0.25, 8, 8]} />
              <meshStandardMaterial color="#37474f" roughness={0.4} metalness={0.5} />
            </mesh>
          </group>
        ))}

        {/* Gate posts - back entrance (at fence gap edges) */}
        {[-32, 32].map((x, i) => (
          <group key={`gate-back-${i}`} position={[x, 0, -85]}>
            <mesh position={[0, 1.5, 0]} castShadow>
              <boxGeometry args={[0.4, 3, 0.4]} />
              <meshStandardMaterial color="#263238" roughness={0.5} metalness={0.4} />
            </mesh>
            <mesh position={[0, 3.2, 0]} castShadow>
              <sphereGeometry args={[0.25, 8, 8]} />
              <meshStandardMaterial color="#37474f" roughness={0.4} metalness={0.5} />
            </mesh>
          </group>
        ))}
      </group>

      {/* ========== GROUND PLANE EXTENSION ========== */}
      {/* DISABLED: Now handled by unified TerrainGround system above */}
      {/* Old polygon-offset surfaces removed to eliminate z-fighting */}

      {/* ========== ACCESS ROADS FOR TRUCKS ========== */}
      {/* Front road (shipping trucks) - extends from z=135 to z=280 */}
      <group position={[20, 0, 195]}>
        {/* Road surface - DISABLED: handled by TerrainGround */}
        {/* Road edge lines - white - on the ground-overlay datum */}
        <mesh
          position={[-7.5, EXTERIOR_LAYERS.groundOverlay, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          receiveShadow
        >
          <planeGeometry args={[0.3, 170]} />
          <meshStandardMaterial
            {...ROAD_PAINT_WHITE}
            polygonOffset
            polygonOffsetFactor={POLYGON_OFFSET.exteriorOverlay.factor}
            polygonOffsetUnits={POLYGON_OFFSET.exteriorOverlay.units}
          />
        </mesh>
        <mesh
          position={[7.5, EXTERIOR_LAYERS.groundOverlay, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          receiveShadow
        >
          <planeGeometry args={[0.3, 170]} />
          <meshStandardMaterial
            {...ROAD_PAINT_WHITE}
            polygonOffset
            polygonOffsetFactor={POLYGON_OFFSET.exteriorOverlay.factor}
            polygonOffsetUnits={POLYGON_OFFSET.exteriorOverlay.units}
          />
        </mesh>
        {/* Center dashed line - yellow */}
        {Array.from({ length: 17 }).map((_, i) => (
          <mesh
            key={`front-dash-${i}`}
            position={[0, EXTERIOR_LAYERS.groundOverlay, -75 + i * 10]}
            rotation={[-Math.PI / 2, 0, 0]}
            receiveShadow
          >
            <planeGeometry args={[0.25, 5]} />
            <meshStandardMaterial
              {...ROAD_PAINT_YELLOW}
              polygonOffset
              polygonOffsetFactor={POLYGON_OFFSET.exteriorOverlay.factor}
              polygonOffsetUnits={POLYGON_OFFSET.exteriorOverlay.units}
            />
          </mesh>
        ))}
        {/* Grass shoulders - DISABLED: handled by TerrainGround */}
      </group>

      {/* Back road (receiving trucks) - extends from z=-135 to z=-280 */}
      <group position={[-20, 0, -195]}>
        {/* Road surface - DISABLED: handled by TerrainGround */}
        {/* Road edge lines - white - on the ground-overlay datum */}
        <mesh
          position={[-7.5, EXTERIOR_LAYERS.groundOverlay, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          receiveShadow
        >
          <planeGeometry args={[0.3, 170]} />
          <meshStandardMaterial
            {...ROAD_PAINT_WHITE}
            polygonOffset
            polygonOffsetFactor={POLYGON_OFFSET.exteriorOverlay.factor}
            polygonOffsetUnits={POLYGON_OFFSET.exteriorOverlay.units}
          />
        </mesh>
        <mesh
          position={[7.5, EXTERIOR_LAYERS.groundOverlay, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          receiveShadow
        >
          <planeGeometry args={[0.3, 170]} />
          <meshStandardMaterial
            {...ROAD_PAINT_WHITE}
            polygonOffset
            polygonOffsetFactor={POLYGON_OFFSET.exteriorOverlay.factor}
            polygonOffsetUnits={POLYGON_OFFSET.exteriorOverlay.units}
          />
        </mesh>
        {/* Center dashed line - yellow */}
        {Array.from({ length: 17 }).map((_, i) => (
          <mesh
            key={`back-dash-${i}`}
            position={[0, EXTERIOR_LAYERS.groundOverlay, -75 + i * 10]}
            rotation={[-Math.PI / 2, 0, 0]}
            receiveShadow
          >
            <planeGeometry args={[0.25, 5]} />
            <meshStandardMaterial
              {...ROAD_PAINT_YELLOW}
              polygonOffset
              polygonOffsetFactor={POLYGON_OFFSET.exteriorOverlay.factor}
              polygonOffsetUnits={POLYGON_OFFSET.exteriorOverlay.units}
            />
          </mesh>
        ))}
        {/* Grass shoulders - DISABLED: handled by TerrainGround */}
      </group>

      {/* ========== ROAD BRIDGE OVER RIVER CANYON ========== */}
      {/* Back road crosses river at z=-145, road centered at x=-20 */}
      <group position={[-20, 0, -145]}>
        {/* Road deck - spans the canyon */}
        <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
          <boxGeometry args={[18, 0.6, 70]} />
          <meshStandardMaterial color="#4b5563" roughness={0.85} />
        </mesh>
        {/* Carriageway wearing course on top of the structural deck */}
        <mesh position={[0, 0.61, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[16, 68]} />
          <meshStandardMaterial
            color="#ffffff"
            roughness={0.9}
            map={TARMAC_ROAD_MAP}
            roughnessMap={TARMAC_ROAD_ROUGHNESS}
          />
        </mesh>
        {/* Guard rails */}
        {[-1, 1].map((side, i) => (
          <mesh key={`road-rail-${i}`} position={[side * 8.5, 1.2, 0]} castShadow>
            <boxGeometry args={[0.3, 1.5, 70]} />
            <meshStandardMaterial color="#6b7280" roughness={0.7} metalness={0.2} />
          </mesh>
        ))}
        {/* Vertical pier columns - similar to footbridge */}
        {Array.from({ length: 5 }, (_, i) => {
          const zPos = -28 + i * 14;
          return (
            <group key={`road-pier-${i}`}>
              {/* Left pier */}
              <mesh position={[-6, -5, zPos]} castShadow>
                <boxGeometry args={[1.2, 12, 1.2]} />
                <meshStandardMaterial color="#4b5563" roughness={0.7} metalness={0.2} />
              </mesh>
              {/* Right pier */}
              <mesh position={[6, -5, zPos]} castShadow>
                <boxGeometry args={[1.2, 12, 1.2]} />
                <meshStandardMaterial color="#4b5563" roughness={0.7} metalness={0.2} />
              </mesh>
              {/* Cross brace */}
              <mesh position={[0, -3, zPos]} castShadow>
                <boxGeometry args={[11, 0.6, 0.6]} />
                <meshStandardMaterial color="#374151" roughness={0.6} metalness={0.3} />
              </mesh>
              {/* Diagonal bracing */}
              <mesh position={[-3, -6, zPos]} rotation={[0, 0, Math.PI / 4]} castShadow>
                <boxGeometry args={[0.3, 7, 0.3]} />
                <meshStandardMaterial color="#374151" roughness={0.6} metalness={0.3} />
              </mesh>
              <mesh position={[3, -6, zPos]} rotation={[0, 0, -Math.PI / 4]} castShadow>
                <boxGeometry args={[0.3, 7, 0.3]} />
                <meshStandardMaterial color="#374151" roughness={0.6} metalness={0.3} />
              </mesh>
            </group>
          );
        })}
      </group>

      {/* ========== CHECKPOINT BARRIERS AT TRUCK BAY ENTRANCES ========== */}
      {/* Front checkpoint - shipping dock entrance (on the road at z=110) */}
      <CheckpointBarrier
        position={[20, 0, 110]}
        rotation={0}
        label="SHIPPING"
        checkpointType="shipping"
      />

      {/* Back checkpoint - receiving dock entrance (on the road at z=-110) */}
      <CheckpointBarrier
        position={[-20, 0, -110]}
        rotation={Math.PI}
        label="RECEIVING"
        checkpointType="receiving"
      />

      {/* ========== PARKLAND AREA (Front-right) - trees/benches use instanced versions ========== */}
      <group position={[75, 0, 100]}>
        {/* Grass disc DELETED. It sat at y=-0.15 with exteriorBase polygonOffset
            (authored against the old -0.02 ground datum) while TerrainGround
            renders at y=0.05 with a splat-mapped, textured grass channel: the
            disc was either fully buried - a draw call and a shadow receiver for
            nothing - or punching through as a flat untextured green patch on
            otherwise textured ground. Raising its Y is NOT the fix; that puts
            untextured green beside textured green and reintroduces the boundary
            seam the EXTERIOR_LAYERS comment block warns against. If a distinct
            parkland tint is wanted it belongs in
            terrain/splatMapGenerator.ts, which is the terrain owner's file. */}

        {/* Trees and benches now rendered via instanced components */}

        {/* Parkland path. Ground datum with `exteriorTop`, per the block comment
            on the grass disc above: the 0.15 it replaces was authored against
            `TerrainGround`'s old 0.05 default and stood 17 cm over grass the
            terrain splat already paints. */}
        <mesh
          position={[0, EXTERIOR_LAYERS.ground, -12]}
          rotation={[-Math.PI / 2, 0, 0]}
          receiveShadow
        >
          <planeGeometry args={[3, 8]} />
          <meshStandardMaterial
            color="#c9ced2"
            roughness={0.85}
            map={TARMAC_PATH_MAP}
            roughnessMap={TARMAC_PATH_ROUGHNESS}
            polygonOffset
            polygonOffsetFactor={POLYGON_OFFSET.exteriorTop.factor}
            polygonOffsetUnits={POLYGON_OFFSET.exteriorTop.units}
          />
        </mesh>
      </group>
      {/* Front parkland instanced trees/benches (absolute positions) */}
      <SimpleTreeInstances trees={FRONT_PARKLAND_TREES} />
      <ParkBenchInstances benches={FRONT_PARKLAND_BENCHES} />

      {/* ========== SMALL OFFICE BUILDINGS ========== */}
      {/* Admin office - front left outside fence */}
      <SmallOffice position={[-45, 0, 110]} size={[14, 7, 10]} rotation={0} />
      <GroundBlob position={[-45, 110]} scale={19} scaleZ={15} />

      {/* Security/visitor office - near front gate */}
      <group position={[-25, 0, 115]}>
        <GroundBlob position={[0, 0]} scale={9.5} scaleZ={8.5} />
        <mesh position={[0, 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[6, 4, 5]} />
          <meshStandardMaterial color="#607d8b" {...OUTBUILDING_SURFACE} />
        </mesh>
        <mesh position={[0, 4.3, 0]} castShadow>
          <boxGeometry args={[6.5, 0.5, 5.5]} />
          <meshStandardMaterial color="#455a64" {...OUTBUILDING_SURFACE} />
        </mesh>
        {/* Window */}
        <mesh position={[0, 2.2, 2.55]}>
          <planeGeometry args={[4, 2]} />
          <meshStandardMaterial color="#90caf9" metalness={0.4} roughness={0.2} />
        </mesh>
        {/* "SECURITY" sign */}
        <Text
          position={[0, 3.5, 2.6]}
          fontSize={0.4}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
          surface="painted"
        >
          SECURITY
        </Text>
      </group>

      {/* Maintenance shed - back area */}
      <group position={[80, 0, -75]}>
        <GroundBlob position={[0, 0]} scale={14} scaleZ={12} />
        <mesh position={[0, 2.5, 0]} castShadow receiveShadow>
          <boxGeometry args={[10, 5, 8]} />
          <meshStandardMaterial color="#6d4c41" {...OUTBUILDING_SURFACE} />
        </mesh>
        {/* Pitched roof */}
        <mesh position={[0, 5.5, 0]} rotation={[0, 0, 0]} castShadow>
          <boxGeometry args={[11, 1, 9]} />
          <meshStandardMaterial color="#5d4037" {...OUTBUILDING_SURFACE} />
        </mesh>
        {/* Large door */}
        <mesh position={[0, 1.5, 4.05]}>
          <planeGeometry args={[6, 3]} />
          <meshStandardMaterial color="#3e2723" roughness={0.9} />
        </mesh>
      </group>

      {/* ========== STREET LAMPS ========== */}
      {[
        [-50, 80],
        [50, 80],
        [-50, -80],
        [50, -80],
        [-90, 0],
        [90, 0],
      ].map(([x, z], i) => (
        <group key={`lamp-${i}`} position={[x, 0, z]}>
          <GroundBlob position={[0, 0]} scale={2.4} />
          <ExteriorLampPool radius={7} />
          {/* Pole */}
          <mesh position={[0, 3, 0]} castShadow>
            <cylinderGeometry args={[0.1, 0.15, 6, 8]} />
            <meshStandardMaterial color="#37474f" roughness={0.68} metalness={0.12} />
          </mesh>
          {/* Lamp head */}
          <mesh position={[0, 6.2, 0]}>
            <cylinderGeometry args={[0.4, 0.3, 0.5, 8]} />
            <meshStandardMaterial color="#263238" roughness={0.5} metalness={0.4} />
          </mesh>
          {/* Light bulb area */}
          <mesh position={[0, 5.9, 0]} material={EXTERIOR_LAMP_LENS_MATERIAL}>
            <cylinderGeometry args={[0.25, 0.35, 0.3, 8]} />
          </mesh>
        </group>
      ))}

      {/* ========== PARKING AREA MARKINGS (Front) ========== */}
      <group position={[60, EXTERIOR_LAYERS.groundOverlay, 70]}>
        {[0, 1, 2, 3, 4].map((i) => (
          <mesh
            key={`parking-${i}`}
            position={[i * 4 - 8, 0, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            receiveShadow
          >
            <planeGeometry args={[0.15, 5]} />
            <meshStandardMaterial
              {...ROAD_PAINT_WHITE}
              polygonOffset
              polygonOffsetFactor={POLYGON_OFFSET.exteriorOverlay.factor}
              polygonOffsetUnits={POLYGON_OFFSET.exteriorOverlay.units}
            />
          </mesh>
        ))}
      </group>

      {/* ========== GAS STATION ========== */}
      <GasStation position={[-85, 0, 140]} rotation={0} />
      {/* Shop block contact shadow. The station's own canopy columns are an
          InstancedMesh inside GasStationInstanced and are thin enough that the
          real sun shadow carries them on high/ultra. */}
      <GroundBlob position={[-97, 140]} scale={11} scaleZ={13} />

      {/* Caravan parked behind gas station */}
      <Caravan position={[-100, 0, 125]} rotation={0.3} color="#f5e6d3" />

      {/* ========== BUS STOP ========== */}
      {/* European-style bus shelter on shipping road, past checkpoint, near farm */}
      <BusStop position={[29, 0, 140]} rotation={-Math.PI / 2} />

      {/* ========== VISITOR PARKING LOT WITH CUTE CARS ========== */}
      {/* Parking lot positioned outside east fence (fence is at x=95) */}
      <ParkingLot position={[120, 0, 50]} rows={2} spotsPerRow={6} rotation={0} />

      {/* Tunnel entrance - connects to external road network */}
      <TunnelEntrance position={[160, 0, 50]} rotation={Math.PI / 2} length={15} />

      {/* Truck road tunnels at each end of the valley (v0.30 blocky design). */}
      {Object.values(SITE_LAYOUT.roadTunnels).map((tunnel) => (
        <RoadTunnel key={tunnel.id} position={tunnel.position} rotation={tunnel.rotation} />
      ))}
      <GroundBlob position={[160, 50]} scale={22} scaleZ={26} />

      {/* Connecting road from tunnel exit to parking lot */}
      <ConnectingRoad start={[147, 0, 50]} end={[135, 0, 50]} width={6} />

      {/* Road from parking lot towards factory gate.
          IT MUST STOP AT THE LOT, NOT CROSS IT. This ran (120,35) -> (120,70),
          which is a 5 m carriageway with a dashed centre line laid straight
          through the middle of `ParkingLot` at (120, 0, 50) - the lot spans
          x 107.5..132.5 and z 40..60, and both surfaces sit on
          `EXTERIOR_LAYERS.ground`, so the road drew over the bay markings at
          the same datum. On the `carpark` review camera that reads as cars
          parked across their lines with a yellow dash running through the
          middle of the lot, which is exactly what it is. Measured rather than
          eyeballed: the live scene reported two coplanar slabs at y -0.02
          centred (120, 50) and (120, 52.5) with bounding radii 16.01 and 17.68,
          and 17.68 is sqrt(2.5^2 + 17.5^2) - the road, to the centimetre.
          Now two stubs that meet the lot's south and north kerbs. */}
      <ConnectingRoad start={[120, 0, 28]} end={[120, 0, 39.5]} width={5} />
      <ConnectingRoad start={[120, 0, 60.5]} end={[120, 0, 70]} width={5} />

      {/* Road connecting parking area to front entrance gate */}
      <ConnectingRoad start={[105, 0, 85]} end={[120, 0, 70]} width={5} />

      {/* A few extra parked cars near the gas station for variety, on a layby
          rather than in the field they were standing in. */}
      <Hardstanding position={[-70, 0, 125.5]} size={[17, 7]} />
      <CuteCar
        position={[-75, 0, 125]}
        rotation={Math.PI * 0.9}
        color="#3b82f6"
        style="hatchback"
      />
      <CuteCar position={[-70, 0, 125]} rotation={Math.PI * 1.1} color="#f59e0b" style="sedan" />
      <CuteCar position={[-65, 0, 126]} rotation={Math.PI} color="#22c55e" style="suv" />

      {/* ========== NISSEN HUTS ========== */}
      {/* Storage hut near back fence */}
      <NissenHut {...SITE_LAYOUT.exteriorFeatures.nissenHuts[0]} />
      <GroundBlob position={[-75, -100]} scale={12} scaleZ={18} />
      {/* Equipment hut near side */}
      <NissenHut {...SITE_LAYOUT.exteriorFeatures.nissenHuts[1]} />
      <GroundBlob position={[85, -100]} scale={14} scaleZ={12} />

      {/* ========== OFFICE APARTMENT BUILDINGS ========== */}
      {/* Main office block - front left (moved right to not occlude kiosk parasol) */}
      <OfficeApartment position={[-78, 0, 95]} floors={4} rotation={0} />
      <GroundBlob position={[-78, 95]} scale={20} scaleZ={16} />
      {/* Smaller office block - back right */}
      <OfficeApartment position={[100, 0, -100]} floors={3} rotation={Math.PI} />
      <GroundBlob position={[100, -100]} scale={18} scaleZ={14} />

      {/* ========== ADDITIONAL SMALL BUILDINGS ========== */}
      {/* Weighbridge office */}
      <group position={[30, 0, 120]}>
        <GroundBlob position={[0, 0]} scale={7} scaleZ={6} />
        <mesh position={[0, 1.5, 0]} castShadow receiveShadow>
          <boxGeometry args={[4, 3, 3]} />
          <meshStandardMaterial color="#90a4ae" {...OUTBUILDING_SURFACE} />
        </mesh>
        <mesh position={[0, 3.2, 0]} castShadow>
          <boxGeometry args={[4.5, 0.4, 3.5]} />
          <meshStandardMaterial color="#607d8b" {...OUTBUILDING_SURFACE} />
        </mesh>
        <mesh position={[0, 1.5, 1.55]}>
          <planeGeometry args={[3, 2]} />
          <meshStandardMaterial color="#81d4fa" metalness={0.3} roughness={0.2} />
        </mesh>
        <Text
          position={[0, 2.8, 1.6]}
          fontSize={0.3}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
          surface="painted"
        >
          WEIGHBRIDGE
        </Text>
        {/* Weighbridge platform */}
        <mesh position={[0, 0.1, 6]} receiveShadow>
          <boxGeometry args={[4, 0.2, 8]} />
          <meshStandardMaterial color="#616161" roughness={0.8} />
        </mesh>
      </group>

      {/* Substation */}
      <group position={[-70, 0, -60]}>
        <GroundBlob position={[0, 0]} scale={8} scaleZ={7} />
        <mesh position={[0, 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[5, 4, 4]} />
          <meshStandardMaterial color="#78909c" {...OUTBUILDING_SURFACE} />
        </mesh>
        <mesh position={[0, 4.3, 0]} castShadow>
          <boxGeometry args={[5.5, 0.4, 4.5]} />
          <meshStandardMaterial color="#546e7a" {...OUTBUILDING_SURFACE} />
        </mesh>
        {/* Warning sign */}
        <mesh position={[2.55, 2, 0]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[1, 1]} />
          <meshStandardMaterial color="#ffc107" roughness={0.85} />
        </mesh>
        <Text
          position={[2.6, 2, 0]}
          fontSize={0.15}
          color="#000000"
          anchorX="center"
          anchorY="middle"
          rotation={[0, Math.PI / 2, 0]}
        >
          DANGER
        </Text>
        {/* Electrical equipment on roof */}
        <mesh position={[0, 4.8, 0]} castShadow>
          <cylinderGeometry args={[0.3, 0.3, 1, 8]} />
          <meshStandardMaterial color="#424242" roughness={0.6} metalness={0.4} />
        </mesh>
      </group>

      {/* Instanced trees and benches for draw call optimization (~48 -> 7 draw calls) */}
      <SimpleTreeInstances trees={MAIN_EXTERIOR_TREES} />
      <ParkBenchInstances benches={MAIN_EXTERIOR_BENCHES} />

      {/* Second parkland area - back left (trees/benches use instanced versions) */}
      {/* Moved further from riverbank (was z=-110, now z=-90) */}
      <group position={[-85, 0, -90]}>
        {/* Second sub-terrain grass disc deleted for the same reason. */}
        {/* Trees and bench now rendered via instanced components */}
      </group>
      {/* Parkland instanced trees/benches (absolute positions) */}
      <SimpleTreeInstances trees={PARKLAND_TREES} />
      <ParkBenchInstances benches={PARKLAND_BENCHES} />

      {/* ========== WATER FEATURES & WATERWAY INFRASTRUCTURE ========== */}
      {/* Historically, grain mills were built near waterways for power and transport */}

      {/* Industrial Canal - West side (for barge transport of grain and flour) */}
      {/* Extended to connect with the branch canal at z=-110 */}
      <Canal {...SITE_LAYOUT.exteriorFeatures.canal} />

      {/* Cute English narrowboat moored on the canal */}
      <CanalBoat position={[-145, 0.1, 15]} rotation={0} />

      {/* Canal Lock Gate - controls water level for barge access */}
      <LockGate position={[-145, 0, 50]} width={10} rotation={0} />

      {/* Wooden docks removed - were floating in canal */}

      {/* Footbridge over canal - connects factory area to west */}
      {/* Rotation=PI/2 to span across canal (east-west) rather than along it */}
      <FootBridge
        position={[-145, 0, -50]}
        length={14}
        width={2.5}
        rotation={Math.PI / 2}
        style="wooden"
      />

      {/* Lake in front-right area - scenic water feature */}
      <Lake
        position={SITE_LAYOUT.exteriorFeatures.lake.position}
        size={[...SITE_LAYOUT.exteriorFeatures.lake.size]}
        depth={0.5}
      />

      {/* Food truck (taco truck) parked next to the parking lot, on its own
          apron - it spans x 132..138 and the lot's tarmac ends at 132.5. */}
      <Hardstanding position={[135.5, 0, 42]} size={[9, 6.5]} />
      <FoodTruck position={[135, 0, 42]} rotation={Math.PI / 2} color="#ff6b6b" name="TACOS" />

      {/* Brick carport shelter next to taco truck - outdoor eating area */}
      <BrickCarport position={[145, 0, 35]} rotation={0} size={[10, 3.5, 8]} />

      {/* River segment - runs along the back boundary */}
      <River />

      {/* Small decorative pond near the front office buildings */}
      <Pond {...SITE_LAYOUT.exteriorFeatures.ponds[0]} />

      {/* Upturned shopping trolley abandoned in the canal - classic British waterway decor */}
      <group position={[-143, 0.1, 36.5]} rotation={[Math.PI * 0.85, 0.35, 0.2]}>
        {/* Top rim frame */}
        {[
          [-0.24, 0.24, 0],
          [0.24, 0.24, 0],
        ].map(([x, y, z], i) => (
          <mesh key={`rim-long-${i}`} position={[x, y, z]} castShadow>
            <boxGeometry args={[0.025, 0.025, 1.0]} />
            <meshStandardMaterial color="#6b7280" roughness={0.5} metalness={0.7} />
          </mesh>
        ))}
        {[
          [0, 0.24, -0.5],
          [0, 0.24, 0.5],
        ].map(([x, y, z], i) => (
          <mesh key={`rim-short-${i}`} position={[x, y, z]} castShadow>
            <boxGeometry args={[0.5, 0.025, 0.025]} />
            <meshStandardMaterial color="#6b7280" roughness={0.5} metalness={0.7} />
          </mesh>
        ))}
        {/* Corner posts */}
        {[
          [-0.24, 0, -0.5],
          [0.24, 0, -0.5],
          [-0.24, 0, 0.5],
          [0.24, 0, 0.5],
        ].map(([x, y, z], i) => (
          <mesh key={`corner-${i}`} position={[x, y, z]} castShadow>
            <boxGeometry args={[0.025, 0.5, 0.025]} />
            <meshStandardMaterial color="#5b6370" roughness={0.5} metalness={0.7} />
          </mesh>
        ))}
        {/* Long side wire mesh - horizontal wires */}
        {[-0.24, 0.24].map((x, xi) => (
          <group key={`side-h-${xi}`}>
            {[-0.15, 0, 0.15].map((y, yi) => (
              <mesh key={`wire-h-${yi}`} position={[x, y, 0]} castShadow>
                <boxGeometry args={[0.012, 0.012, 0.98]} />
                <meshStandardMaterial color="#7a8a9a" roughness={0.5} metalness={0.7} />
              </mesh>
            ))}
          </group>
        ))}
        {/* Long side wire mesh - vertical wires */}
        {[-0.24, 0.24].map((x, xi) => (
          <group key={`side-v-${xi}`}>
            {[-0.35, -0.17, 0, 0.17, 0.35].map((z, zi) => (
              <mesh key={`wire-v-${zi}`} position={[x, 0, z]} castShadow>
                <boxGeometry args={[0.012, 0.46, 0.012]} />
                <meshStandardMaterial color="#7a8a9a" roughness={0.5} metalness={0.7} />
              </mesh>
            ))}
          </group>
        ))}
        {/* Short end wire mesh - horizontal wires */}
        {[-0.5, 0.5].map((z, zi) => (
          <group key={`end-h-${zi}`}>
            {[-0.15, 0, 0.15].map((y, yi) => (
              <mesh key={`wire-eh-${yi}`} position={[0, y, z]} castShadow>
                <boxGeometry args={[0.46, 0.012, 0.012]} />
                <meshStandardMaterial color="#7a8a9a" roughness={0.5} metalness={0.7} />
              </mesh>
            ))}
          </group>
        ))}
        {/* Short end wire mesh - vertical wires */}
        {[-0.5, 0.5].map((z, zi) => (
          <group key={`end-v-${zi}`}>
            {[-0.15, 0, 0.15].map((x, xi) => (
              <mesh key={`wire-ev-${xi}`} position={[x, 0, z]} castShadow>
                <boxGeometry args={[0.012, 0.46, 0.012]} />
                <meshStandardMaterial color="#7a8a9a" roughness={0.5} metalness={0.7} />
              </mesh>
            ))}
          </group>
        ))}
        {/* Bottom mesh - frame */}
        {[
          [-0.24, -0.24, 0],
          [0.24, -0.24, 0],
        ].map(([x, y, z], i) => (
          <mesh key={`bot-long-${i}`} position={[x, y, z]} castShadow>
            <boxGeometry args={[0.02, 0.02, 0.98]} />
            <meshStandardMaterial color="#5b6370" roughness={0.5} metalness={0.7} />
          </mesh>
        ))}
        {[
          [0, -0.24, -0.5],
          [0, -0.24, 0.5],
        ].map(([x, y, z], i) => (
          <mesh key={`bot-short-${i}`} position={[x, y, z]} castShadow>
            <boxGeometry args={[0.5, 0.02, 0.02]} />
            <meshStandardMaterial color="#5b6370" roughness={0.5} metalness={0.7} />
          </mesh>
        ))}
        {/* Bottom mesh - grid wires */}
        {[-0.3, -0.1, 0.1, 0.3].map((z, i) => (
          <mesh key={`bot-wire-x-${i}`} position={[0, -0.24, z]} castShadow>
            <boxGeometry args={[0.46, 0.01, 0.01]} />
            <meshStandardMaterial color="#7a8a9a" roughness={0.5} metalness={0.7} />
          </mesh>
        ))}
        {[-0.12, 0, 0.12].map((x, i) => (
          <mesh key={`bot-wire-z-${i}`} position={[x, -0.24, 0]} castShadow>
            <boxGeometry args={[0.01, 0.01, 0.98]} />
            <meshStandardMaterial color="#7a8a9a" roughness={0.5} metalness={0.7} />
          </mesh>
        ))}
        {/* Handle bar */}
        <mesh position={[0, 0.35, -0.55]} castShadow>
          <boxGeometry args={[0.4, 0.03, 0.03]} />
          <meshStandardMaterial color="#374151" roughness={0.4} metalness={0.7} />
        </mesh>
        {/* Handle uprights */}
        {[-0.15, 0.15].map((x, i) => (
          <mesh key={`handle-${i}`} position={[x, 0.3, -0.52]} castShadow>
            <boxGeometry args={[0.025, 0.15, 0.025]} />
            <meshStandardMaterial color="#374151" roughness={0.4} metalness={0.7} />
          </mesh>
        ))}
        {/* Wheels (pointing up since upturned) */}
        {[
          [-0.18, -0.28, 0.4],
          [0.18, -0.28, 0.4],
          [-0.18, -0.28, -0.4],
          [0.18, -0.28, -0.4],
        ].map(([x, y, z], i) => (
          <group key={`wheel-${i}`} position={[x, y, z]}>
            <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.06, 0.06, 0.03, 12]} />
              <meshStandardMaterial color="#1f2937" roughness={0.8} />
            </mesh>
            <mesh position={[0, 0.04, 0]} castShadow>
              <boxGeometry args={[0.03, 0.08, 0.03]} />
              <meshStandardMaterial color="#4b5563" roughness={0.5} metalness={0.6} />
            </mesh>
          </group>
        ))}
        {/* Child seat flap - wire mesh */}
        <group position={[0, 0.1, 0.52]} rotation={[0.3, 0, 0]}>
          {[-0.1, 0, 0.1].map((y, i) => (
            <mesh key={`seat-h-${i}`} position={[0, y, 0]} castShadow>
              <boxGeometry args={[0.32, 0.01, 0.01]} />
              <meshStandardMaterial color="#7a8a9a" roughness={0.5} metalness={0.6} />
            </mesh>
          ))}
          {[-0.12, 0, 0.12].map((x, i) => (
            <mesh key={`seat-v-${i}`} position={[x, 0, 0]} castShadow>
              <boxGeometry args={[0.01, 0.22, 0.01]} />
              <meshStandardMaterial color="#7a8a9a" roughness={0.5} metalness={0.6} />
            </mesh>
          ))}
        </group>
        {/* Rust/algae patches */}
        <mesh position={[0.15, 0.1, 0.3]}>
          <sphereGeometry args={[0.06, 8, 6]} />
          <meshStandardMaterial color="#7c5e3a" roughness={0.9} transparent opacity={0.7} />
        </mesh>
        <mesh position={[-0.1, -0.1, -0.2]}>
          <sphereGeometry args={[0.05, 8, 6]} />
          <meshStandardMaterial color="#4a6741" roughness={0.95} transparent opacity={0.6} />
        </mesh>
      </group>

      {/* Abandoned bicycle in the canal - another classic British waterway find */}
      <group position={[-147.5, 0.05, 54]} rotation={[0.25, 0.7, 0.1]}>
        {/* Front wheel */}
        <mesh position={[0.45, 0.35, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <torusGeometry args={[0.35, 0.025, 8, 24]} />
          <meshStandardMaterial color="#4b5563" roughness={0.6} metalness={0.5} />
        </mesh>
        {/* Front spokes */}
        {[0, 60, 120].map((angle, i) => (
          <mesh
            key={`fspoke-${i}`}
            position={[0.45, 0.35, 0]}
            rotation={[Math.PI / 2, 0, (angle * Math.PI) / 180]}
            castShadow
          >
            <boxGeometry args={[0.02, 0.65, 0.02]} />
            <meshStandardMaterial color="#6b7280" roughness={0.5} metalness={0.6} />
          </mesh>
        ))}
        {/* Rear wheel */}
        <mesh position={[-0.45, 0.35, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <torusGeometry args={[0.35, 0.025, 8, 24]} />
          <meshStandardMaterial color="#4b5563" roughness={0.6} metalness={0.5} />
        </mesh>
        {/* Rear spokes */}
        {[0, 60, 120].map((angle, i) => (
          <mesh
            key={`rspoke-${i}`}
            position={[-0.45, 0.35, 0]}
            rotation={[Math.PI / 2, 0, (angle * Math.PI) / 180]}
            castShadow
          >
            <boxGeometry args={[0.02, 0.65, 0.02]} />
            <meshStandardMaterial color="#6b7280" roughness={0.5} metalness={0.6} />
          </mesh>
        ))}
        {/* Main frame - top tube */}
        <mesh position={[0, 0.55, 0]} rotation={[0, 0, 0]} castShadow>
          <boxGeometry args={[0.75, 0.04, 0.04]} />
          <meshStandardMaterial color="#1e40af" roughness={0.5} metalness={0.4} />
        </mesh>
        {/* Main frame - down tube */}
        <mesh position={[0.15, 0.45, 0]} rotation={[0, 0, 0.4]} castShadow>
          <boxGeometry args={[0.5, 0.04, 0.04]} />
          <meshStandardMaterial color="#1e40af" roughness={0.5} metalness={0.4} />
        </mesh>
        {/* Main frame - seat tube */}
        <mesh position={[-0.2, 0.45, 0]} rotation={[0, 0, -0.15]} castShadow>
          <boxGeometry args={[0.04, 0.45, 0.04]} />
          <meshStandardMaterial color="#1e40af" roughness={0.5} metalness={0.4} />
        </mesh>
        {/* Fork */}
        <mesh position={[0.45, 0.5, 0]} rotation={[0, 0, 0.1]} castShadow>
          <boxGeometry args={[0.03, 0.35, 0.03]} />
          <meshStandardMaterial color="#4b5563" roughness={0.5} metalness={0.5} />
        </mesh>
        {/* Handlebars */}
        <mesh position={[0.45, 0.7, 0]} castShadow>
          <boxGeometry args={[0.08, 0.03, 0.45]} />
          <meshStandardMaterial color="#374151" roughness={0.4} metalness={0.6} />
        </mesh>
        {/* Seat */}
        <mesh position={[-0.25, 0.7, 0]} castShadow>
          <boxGeometry args={[0.2, 0.04, 0.12]} />
          <meshStandardMaterial color="#1f2937" roughness={0.8} />
        </mesh>
        {/* Pedal crank */}
        <mesh position={[0, 0.35, 0]} rotation={[Math.PI / 2, 0, 0.3]} castShadow>
          <boxGeometry args={[0.25, 0.03, 0.03]} />
          <meshStandardMaterial color="#4b5563" roughness={0.5} metalness={0.6} />
        </mesh>
        {/* Rust patches */}
        <mesh position={[0.1, 0.5, 0.03]}>
          <sphereGeometry args={[0.05, 6, 6]} />
          <meshStandardMaterial color="#8b5a2b" roughness={0.9} transparent opacity={0.6} />
        </mesh>
        <mesh position={[-0.35, 0.4, -0.02]}>
          <sphereGeometry args={[0.04, 6, 6]} />
          <meshStandardMaterial color="#6b5b3a" roughness={0.9} transparent opacity={0.5} />
        </mesh>
      </group>

      {/* Cute kiosk cafe by the pond - facing toward the water */}
      <KioskCafe position={[-108, 0, 105]} rotation={Math.PI} />

      {/* Canal branch connecting main canal to the river */}
      {/* Canal branch connecting main canal to the river */}
      <Canal {...SITE_LAYOUT.exteriorFeatures.canalBranch} />

      {/* Additional smaller pond near back parkland - moved away from river canyon */}
      <Pond {...SITE_LAYOUT.exteriorFeatures.ponds[1]} />

      {/* ========== LANDMARKS ========== */}

      {/* Fairytale Castle moved to MillScene (Global Landmark) */}

      {/* ========== INDUSTRIAL STRUCTURES ========== */}

      {/* Loading dock canopy - FRONT (shipping) */}
      <LoadingDockCanopy position={[0, 0, 58]} width={20} depth={5} rotation={0} />

      {/* Loading dock canopy - BACK (receiving) */}
      <LoadingDockCanopy position={[0, 0, -58]} width={20} depth={5} rotation={Math.PI} />

      {/* The elevator feeds the same five bins used by the production model. */}
      <GrainElevator position={[...SITE_LAYOUT.bulkStorage.elevator.position]} />
      <ConveyorBridge
        start={[...BULK_STORAGE_GALLERY.head]}
        end={[...BULK_STORAGE_GALLERY.nearBin]}
      />
      <ConveyorBridge
        start={[...BULK_STORAGE_GALLERY.nearBin]}
        end={[...BULK_STORAGE_GALLERY.farBin]}
      />

      {/* Utility compounds use the site-layout anchors as their sole placement
          authority, including containment, access control and safety clearance. */}
      <UtilityTankFarm />
      <PropaneSafetyCompound />

      {/* ========== PATHS & WALKWAYS ========== */}

      {/* Main path from factory front gate to canal towpath */}
      <GravelPath start={[-95, 0, 85]} end={[-130, 0, 85]} width={3} type="paved" />
      <GravelPath start={[-130, 0, 85]} end={[-130, 0, 50]} width={2.5} type="gravel" />

      {/* Path to the lake area */}
      <GravelPath start={[95, 0, 85]} end={[120, 0, 100]} width={2.5} type="paved" />
      <CurvedPath
        position={[120, 0, 100]}
        radius={8}
        startAngle={-Math.PI / 2}
        endAngle={0}
        width={2.5}
        type="paved"
      />

      {/* Lakeside walking path - around the lake */}
      <CurvedPath
        position={[120, 0, 120]}
        radius={24.5}
        radiusZ={19.5}
        startAngle={0}
        endAngle={Math.PI * 2}
        width={2}
        type="gravel"
      />

      {/* Path from back gate to river */}
      <GravelPath start={[0, 0, -85]} end={[0, 0, -125]} width={3} type="paved" />

      {/* Riverbank path removed - was crossing through river */}

      {/* Path to front pond */}
      <GravelPath start={[-100, 0, 95]} end={[-125, 0, 105]} width={2} type="gravel" />
      <CurvedPath
        position={[-125, 0, 105]}
        radius={14}
        startAngle={0}
        endAngle={Math.PI * 1.5}
        width={1.8}
        type="gravel"
      />

      {/* Factory perimeter path - west side */}
      <GravelPath start={[-65, 0, 50]} end={[-65, 0, -50]} width={2} type="paved" />

      {/* Factory perimeter path - east side */}
      <GravelPath start={[65, 0, 50]} end={[65, 0, -50]} width={2} type="paved" />

      {/* Cross path at rear - behind factory */}
      <GravelPath start={[-65, 0, -60]} end={[65, 0, -60]} width={2} type="paved" />

      {/* Path to east pond */}
      <GravelPath start={[100, 0, -85]} end={[115, 0, -110]} width={1.8} type="gravel" />

      {/* ========== PATH AMENITIES & FURNITURE ========== */}

      {/* Victorian lamps along canal towpath */}
      <PathLamp position={[-155, 0, 80]} style="victorian" />
      <PathLamp position={[-155, 0, 40]} style="victorian" />
      <PathLamp position={[-155, 0, 0]} style="victorian" />
      <PathLamp position={[-155, 0, -40]} style="victorian" />
      <PathLamp position={[-155, 0, -80]} style="victorian" />

      {/* Modern lamps along factory paths */}
      <PathLamp position={[-65, 0, 30]} style="modern" />
      <PathLamp position={[-65, 0, -30]} style="modern" />
      <PathLamp position={[65, 0, 30]} style="modern" />
      <PathLamp position={[65, 0, -30]} style="modern" />

      {/* Lamps around lake */}
      <PathLamp position={[98, 0, 120]} style="victorian" />
      <PathLamp position={[142, 0, 120]} style="victorian" />
      <PathLamp position={[120, 0, 142]} style="victorian" />

      {/* Lamps along river path - moved back from canyon edge */}
      <PathLamp position={[-60, 0, -110]} style="modern" />
      <PathLamp position={[0, 0, -110]} style="modern" />
      <PathLamp position={[60, 0, -110]} style="modern" />

      {/* Bollards along canal edge */}
      <Bollard position={[-137, 0, -25]} type="wood" />
      <Bollard position={[-137, 0, -15]} type="wood" />
      <Bollard position={[-137, 0, 15]} type="wood" />
      <Bollard position={[-137, 0, 25]} type="wood" />

      {/* Bollards at dock areas */}
      <Bollard position={[-138, 0, -32]} type="metal" />
      <Bollard position={[-138, 0, 32]} type="metal" />

      {/* Information signs */}
      <InfoSign position={[-154, 0, 85]} text="CANAL" rotation={Math.PI / 4} />
      <InfoSign position={[95, 0, 115]} text="LAKE" rotation={-Math.PI / 4} />
      <InfoSign position={[10, 0, -110]} text="RIVER" rotation={0} />
      <InfoSign position={[-137, 0, -45]} text="DOCK" rotation={Math.PI / 2} />

      {/* Picnic area by the lake */}
      <PicnicTable position={[145, 0, 105]} rotation={Math.PI / 6} />
      <PicnicTable position={[150, 0, 130]} rotation={-Math.PI / 4} />
      <WasteBin position={[148, 0, 118]} />

      {/* Picnic area by canal */}
      <PicnicTable position={[-160, 0, 60]} rotation={Math.PI / 2} />
      <WasteBin position={[-158, 0, 70]} />

      {/* Benches along paths - now rendered via instanced components above */}

      {/* Hedges bordering paths */}
      <HedgeRow start={[-130, 0, 90]} end={[-130, 0, 60]} height={0.6} width={0.5} />
      <HedgeRow start={[95, 0, 90]} end={[110, 0, 100]} height={0.5} width={0.4} />
      <HedgeRow start={[-10, 0, -128]} end={[10, 0, -128]} height={0.5} width={0.4} />

      {/* Trees along waterways, by river, and by lake - now rendered via instanced components above */}
    </group>
  );
};

export default FactoryExterior;
