/**
 * TerrainGround - Unified ground mesh for MillOS
 *
 * Uses CPU-side vertex displacement for river channel banks.
 * This approach modifies geometry vertices directly in JavaScript,
 * which is more reliable than shader injection for debugging.
 *
 * The plane is rotated -PI/2 around X axis, so:
 * - Local Y becomes World Z (depth)
 * - To displace in World Y (up/down), we modify local Z
 */

import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { TerrainMaterial } from './TerrainMaterial';
import {
  generateSplatMap,
  getRiverHeightfield,
  sampleValleyRelief,
  MILLOS_TERRAIN_REGIONS,
  MILLOS_RIVER_CONFIG,
  type RiverChannelConfig,
} from './splatMapGenerator';
import { TERRAIN_BOUNDS, SPLAT_BOUNDS, TERRAIN_TINTS, type TerrainBounds } from './terrainTypes';
import {
  generateGrassSurface,
  generateTarmacSurface,
  generateDirtSurface,
  generateDirtGravel,
  generateTerrainMacro,
} from './terrainTextures';
import { PROCEDURAL_TEXTURES } from '../../utils/sharedMaterials';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import { useGraphicsStore } from '../../stores/graphicsStore';

interface TerrainGroundProps {
  debug?: boolean;
  yPosition?: number;
  resolution?: number;
  regions?: typeof MILLOS_TERRAIN_REGIONS;
  receiveShadow?: boolean;
  enableRiverChannel?: boolean;
  riverConfig?: RiverChannelConfig;
  segments?: number;
  useTestHeightmap?: boolean;
}

/**
 * Opaque draw order for the terrain: last.
 *
 * three sorts the opaque list by `groupOrder`, then `renderOrder`, then
 * `material.id`, and only THEN by depth (`painterSortStable`). Front-to-back
 * ordering therefore only ever happens *within* one material, so with no
 * explicit `renderOrder` this mesh took whatever slot its material's creation
 * order happened to give it - and it is loaded lazily, so that slot was neither
 * stable nor chosen.
 *
 * Being the bottom-most surface on the site, every fragment of it that sits
 * under the factory shell, a silo, a truck, a tree, a village roof or any of
 * the authored road / path / parking planes is a fragment that must not be
 * shaded. Drawing last is what lets early-Z reject those before the fragment
 * shader runs; drawing early means shading them and then throwing them away.
 * The saving is therefore bounded below by zero and never negative.
 *
 * 1, specifically: every opaque mesh in the scene uses the default 0. The
 * positive values in `RENDER_ORDER` (vehicleGlass 3, water 8/9, floorEffects 5,
 * floorMarkings 10 and above) are all `depthWrite: false` overlays that live in
 * the transparent list, which three sorts and draws separately after all
 * opaque - so this cannot reorder anything against them.
 *
 * This has to be on the MESH and it has to have no `<group renderOrder>` above
 * it: `projectObject` turns an ancestor group's `renderOrder` into `groupOrder`
 * for its descendants, and `groupOrder` is compared BEFORE `renderOrder`, so a
 * wrapped mesh would only be sorted against its siblings. Verified: the only
 * two ordered groups in `src/` are `HeatMapPoint` and
 * `OptimizedFactoryInfrastructure`, and `MillScene` mounts `TerrainGround` as a
 * direct child of its plain root `<group>`.
 */
const TERRAIN_OPAQUE_RENDER_ORDER = 1;

/**
 * Create geometry with CPU-side vertex displacement from heightmap
 */
export function createDisplacedGeometry(
  width: number,
  height: number,
  segments: number,
  heightmapData: Uint8Array | null,
  heightmapResolution: number,
  displacementDepth: number,
  _bounds: TerrainBounds
): THREE.PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(width, height, segments, segments);
  const positions = geometry.attributes.position;
  const uvs = geometry.attributes.uv;

  for (let i = 0; i < positions.count; i++) {
    // Get UV coordinates for this vertex
    const u = uvs.getX(i);
    const v = uvs.getY(i);

    // Sample heightmap at this UV (RGBA format, R channel = height)
    const px = Math.floor(u * (heightmapResolution - 1));
    const py = Math.floor(v * (heightmapResolution - 1));
    const idx = (py * heightmapResolution + px) * 4; // RGBA stride
    const heightValue = heightmapData ? heightmapData[idx] / 255 : 1; // Normalize to 0-1

    // Calculate displacement with 1.0 (255) as baseline (pure canyon, no raised banks):
    // - 0 = canyon floor (carve DOWN by displacementDepth)
    // - 1 = terrain (no displacement)
    // The plane will be rotated -PI/2 around X, so local Z becomes world Y
    const displacement =
      (heightValue - 1) * displacementDepth +
      sampleValleyRelief(positions.getX(i), -positions.getY(i));

    // Modify the Z coordinate (which becomes world Y after rotation)
    const currentZ = positions.getZ(i);
    positions.setZ(i, currentZ + displacement);
  }

  // Mark position attribute as needing update
  positions.needsUpdate = true;

  // Recompute normals for proper lighting on displaced terrain
  geometry.computeVertexNormals();

  return geometry;
}

/**
 * Main terrain ground component with CPU-side vertex displacement
 * Memoized to prevent re-renders from parent component changes
 */
export const TerrainGround = React.memo(function TerrainGround({
  debug = false,
  /**
   * THE SITE'S DECLARED GROUND DATUM, not a number of its own.
   *
   * This was 0.05, which put the bottom-most surface on the site 7 cm ABOVE
   * every authored plane it is supposed to sit under (`EXTERIOR_LAYERS.ground`
   * = `SITE_LAYOUT.datum.terrain` = -0.02) and 5 cm above the interior factory
   * slab at y = 0. Nothing looked wrong at review distance because this
   * material carries `POLYGON_OFFSET.exteriorBase`, and a factor-4 depth bias
   * is large enough to hide 7 cm of wrong-side geometry at 30 m.
   *
   * It is not large enough at 2 m, where the depth buffer resolves finely, so
   * the terrain punched through the floor as a speckled band. MEASURED: it
   * filled the lower third of `personnel-feminine` and the lower right of
   * `personnel-close`, `shipping` and `receiving` - four of the twelve
   * art-review scenes - and vanished under
   * `setPerfDebug({ disableTerrain: true })`, which is what identified it.
   *
   * On the datum, the whole documented stack in CLAUDE.md's "Exterior Ground
   * Z-Fighting Prevention" works as written: terrain and the authored planes
   * share one Y and separate by `polygonOffset` alone (base 4 behind, mid 2,
   * top 0, overlay -2), and the interior slab at y = 0 is now genuinely above
   * the terrain rather than winning a bias fight it should never have been in.
   */
  yPosition = SITE_LAYOUT.datum.terrain,
  resolution = 1024,
  regions = MILLOS_TERRAIN_REGIONS,
  receiveShadow = true,
  enableRiverChannel = true,
  riverConfig = MILLOS_RIVER_CONFIG,
  segments = 128,
}: TerrainGroundProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  // The terrain is the first consumer of anisotropyLevel anywhere in src/; it
  // was a declared-but-unused graphics setting until now.
  const graphicsQuality = useGraphicsStore((state) => state.graphics.quality);
  const anisotropyLevel = useGraphicsStore((state) => state.graphics.anisotropyLevel);
  // `low` has no post-processing composer, coarse terrain geometry and
  // the tightest fill budget, so it keeps the original two-tap shader.
  const surfaceDetail = graphicsQuality !== 'low';
  // The second macro tap (38 world units, rotated) is the one per-fragment cost
  // that `medium` was paying at ultra's rate. Medium is the tier the frame
  // budget is defended on, it renders at resolutionScale 0.6, and its own
  // surface maps are filtered at anisotropy 4 - a second decorrelating
  // frequency band on top of that is detail it cannot show. Dropping it there
  // takes pure-grass fragments from 5 taps to 4, and the shader re-gains the
  // remaining tap so the variation keeps the same RMS strength - medium differs
  // from high in the macro's frequency content, not in how strong it is.
  // Everything that actually carries the terrain's character on medium -
  // albedo, normals, per-channel roughness, cavity AO, height blending, the
  // 175-unit macro variation and the grass tile break - is untouched, so the
  // ground stays clearly ahead of the flat untextured plane it replaced.
  const macroNearDetail = graphicsQuality === 'high' || graphicsQuality === 'ultra';

  // Calculate terrain dimensions from the GEOMETRY bounds (unchanged at +/-600
  // so the plane still meets SkySystem's 650-radius ground disc).
  const width = TERRAIN_BOUNDS.maxX - TERRAIN_BOUNDS.minX;
  const height = TERRAIN_BOUNDS.maxZ - TERRAIN_BOUNDS.minZ;
  const centerX = (TERRAIN_BOUNDS.minX + TERRAIN_BOUNDS.maxX) / 2;
  const centerZ = (TERRAIN_BOUNDS.minZ + TERRAIN_BOUNDS.maxZ) / 2;

  // Splat map is painted over the much smaller SPLAT_BOUNDS, with the same
  // texel count. Anisotropy is deliberately NOT a dependency here:
  // the splat is stretched across 560 units so its UV
  // derivative is tiny, mipmaps (now enabled) are what stop its edges crawling.
  const splatMap = useMemo(
    () => generateSplatMap(regions, resolution, SPLAT_BOUNDS),
    [regions, resolution]
  );

  // Terrain surface data. Generated lazily on first mount and memoised in the
  // shared texture cache, so a quality toggle never regenerates them.
  const dirtTexture = useMemo(() => generateDirtGravel(256), []);
  const surfaceMaps = useMemo(
    () =>
      surfaceDetail
        ? {
            grass: generateGrassSurface(256),
            tarmac: generateTarmacSurface(256),
            dirt: generateDirtSurface(256),
            // 256, not 128: the alpha channel now carries the grass tile break
            // that used to cost its own texture tap, and that channel needs the
            // resolution. See generateTerrainMacro.
            macro: generateTerrainMacro(256),
          }
        : null,
    [surfaceDetail]
  );

  // Apply anisotropic filtering to the tiling textures this domain owns. These
  // have a large UV derivative at grazing angles, which is exactly where
  // anisotropy pays. The shared grass/tarmac albedo singletons already run at
  // anisotropy 16 and are deliberately left alone.
  useEffect(() => {
    const level = Math.max(1, anisotropyLevel);
    const owned = [dirtTexture, surfaceMaps?.grass, surfaceMaps?.tarmac, surfaceMaps?.dirt];
    for (const texture of owned) {
      if (texture && texture.anisotropy !== level) {
        texture.anisotropy = level;
        texture.needsUpdate = true;
      }
    }
  }, [anisotropyLevel, dirtTexture, surfaceMaps]);

  // Water clips against this same field and quality-tier triangle grid.
  const heightmapData = useMemo(
    () => (enableRiverChannel ? getRiverHeightfield(riverConfig) : null),
    [enableRiverChannel, riverConfig]
  );

  // Create geometry with CPU-side displacement
  const geometry = useMemo(
    () =>
      createDisplacedGeometry(
        width,
        height,
        segments,
        heightmapData?.data ?? null,
        heightmapData?.resolution ?? 1,
        riverConfig.depth,
        TERRAIN_BOUNDS
      ),
    [width, height, segments, heightmapData, riverConfig.depth]
  );

  // Dispose GPU resources on replacement/unmount. R3F does not auto-dispose a
  // <primitive> geometry it does not own, and the splatMap DataTexture is a GPU
  // resource too; without this, every graphics-quality change orphans the prior
  // vertex buffer / texture. Cleanup only fires when the resource is replaced or
  // the component unmounts, so visuals are unaffected.
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => splatMap.dispose(), [splatMap]);

  return (
    <mesh
      ref={meshRef}
      position={[centerX, yPosition, centerZ]}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow={receiveShadow}
      frustumCulled={false}
      renderOrder={TERRAIN_OPAQUE_RENDER_ORDER}
    >
      <primitive object={geometry} attach="geometry" />
      {debug ? (
        // Debug mode: Show wireframe to see displacement
        <meshStandardMaterial color="#4a7c59" wireframe={true} side={THREE.DoubleSide} />
      ) : (
        // Splat-map material: grass, asphalt yard, roads, dirt verges.
        // The colour props are TINTS multiplying the albedo taps - see
        // TERRAIN_TINTS. Asphalt and road share one albedo at two tiling
        // scales, which is both physically right and one sampler cheaper.
        <TerrainMaterial
          splatMap={splatMap}
          grassColor={TERRAIN_TINTS.grass}
          asphaltColor={TERRAIN_TINTS.asphalt}
          roadColor={TERRAIN_TINTS.road}
          dirtColor={TERRAIN_TINTS.dirt}
          grassTexture={PROCEDURAL_TEXTURES.grassColor}
          asphaltTexture={PROCEDURAL_TEXTURES.tarmacColor}
          dirtTexture={dirtTexture}
          grassSurface={surfaceMaps?.grass}
          tarmacSurface={surfaceMaps?.tarmac}
          dirtSurface={surfaceMaps?.dirt}
          macroNoise={surfaceMaps?.macro}
          macroNearAmount={macroNearDetail ? 1 : 0}
          grassScale={6.5}
          // Match the adjacent 60 m yard's eighteen repeats. The former
          // 9 m tile enlarged aggregate into 22.5 cm stones; strong normals
          // then made the paved apron read as broken gravel in close views.
          asphaltScale={10 / 3}
          roadScale={10 / 3}
          dirtScale={4.5}
          normalStrength={[1.0, 0.18, 0.14, 0.95]}
          roughnessRemap={[1.0, 1.0, 0.94, 1.0]}
          aoIntensity={0.8}
          blendSharpness={0.18}
          bounds={SPLAT_BOUNDS}
        />
      )}
    </mesh>
  );
});

export default TerrainGround;
