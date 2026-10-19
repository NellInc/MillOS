/**
 * Generated rigid structures and props.
 *
 * Generated GLBs normalized by
 * `scripts/normalize-model-assets.mjs` and declared in
 * `public/models/asset-manifest.json`. These bodies have no internal rig. A
 * runtime parent can still move them, as the yard jockey does. Source shadow
 * flags survive atlas consolidation; older assets retain the true defaults.
 *
 * `Object3D.clone` rather than `SkeletonUtils.clone` is deliberate and safe
 * here: the SkeletonUtils rebinding these assets do not need costs a skeleton
 * walk, and none of them has a skin. Geometry and textures are shared by the
 * clone. Village glazing clones materials for the shared night-lighting shader;
 * explicit market cloth clones only colour attributes and its material; all atlas
 * textures remain shared. Station bodies clone owned palette/rounded-canopy geometry. Barn joinery uses
 * one owned merged geometry, retaining its source roof, cupola and floor.
 */

import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useDracoGLTF } from '../../utils/dracoLoader';
import { GENERATED_ASSET_PATHS, type GeneratedAssetId } from '../../utils/modelLoader';
import ErrorBoundary from '../ErrorBoundary';
import { applyWorldSurface } from '../../utils/worldSurface';
import { CLOSED_DOUBLE_FACED_ASSETS } from './closedDoubleFacedAssets';
import {
  createMarketCanopyGeometry,
  createBarnJoineryGeometry,
  createPosterStationGeometry,
} from '../scenery/AuthoredPropTrim';
import {
  applyCastlePaving,
  applyFarmWindows,
  applyShopWindows,
  createShopDisplayGeometry,
  applyVillageWindows,
  applyForgeWindows,
  type VillageShopTrade,
} from './GeneratedOfficeModel';

/**
 * The utility and LPG vessel shells.
 *
 * Their GLBs carry a metallicRoughness map whose green channel is a near
 * constant 60/255, so the effective roughness is 0.64 x 0.24 = 0.15 - glossy
 * plastic, which is what the art review named on every tank in tank-farm,
 * packing and silos. The packed normal map is flat (std 0.6/255) and inert.
 * The owned clone drops both, takes a painted-steel roughness, and wears the
 * `painted` world-surface finish: metre-scale tonal drift and roughness
 * break-up sampled in world space, so no UV unwrap is needed. No profile
 * overrides on purpose - a batched clone is re-finished from its profile alone
 * (`applyBatchWorldSurface`), so an override here would be lost there.
 */
const VESSEL_SHELLS = new Set<GeneratedAssetId>([
  'utilityFuelShell',
  'utilityProcessShell',
  'propaneLargeShell',
  'propaneSmallShell',
]);
/** Weathered two-pack paint on steel: satin, not gloss. */
const VESSEL_SHELL_ROUGHNESS = 0.5;

const VILLAGE_GLAZING = new Set<GeneratedAssetId>([
  'cottage',
  'shop',
  'church',
  'townhall',
  'pub',
  'school',
  'forge',
  'castle',
]);

/**
 * Per-instance variation for a cloned asset, derived from where it stands.
 *
 * THE PROBLEM THIS ANSWERS. Both review agents named the same thing
 * independently and it was the strongest criticism either of them made: five
 * cottages, three shops, four market stalls, three Holsteins and four sheep are
 * each ONE model with ONE texture, and yaw is the only thing that differs.
 * "Three market stalls are visually identical - same awning, same crate
 * arrangement, near-same rotation. No per-instance colour, rotation or scale
 * variation anywhere."
 *
 * Geometry variation preserves the authored whole-building albedo. Shops
 * additionally select explicit trade paint on their green joinery swatch,
 * leaving the masonry, linen, roof and glazing unchanged. Market cloth uses
 * explicit trade colours while retaining its shared atlas weave and cream
 * stripes. The old wallColor
 * prop still belongs only to the primitive fallback; it is never multiplied
 * into the delivered atlas.
 *
 * DETERMINISTIC, from the call site's own position rather than `Math.random`.
 * A random draw here re-rolls on every remount, which defeats `React.memo`,
 * makes two captures of the same commit disagree, and would put a building in a
 * different place in the control arm of an A/B than in the treatment. The
 * cottage's chimney smoke already had exactly this bug and the fix was the same
 * substitution.
 *
 * @param position the instance's own site-space position
 * @param seed distinguishes independent channels drawn from the same position
 * @returns a stable value in [0, 1)
 */
export function instanceNoise(position: readonly [number, number, number], seed = 0): number {
  const value = Math.sin(position[0] * 12.9898 + position[2] * 78.233 + seed * 37.719) * 43758.5453;
  return value - Math.floor(value);
}

/**
 * Yaw jitter in radians, +/- 0.06 (3.4 degrees).
 *
 * Bounded on purpose. The placement audit that cleared all 108 instances for
 * seating and overlap was run at the authored yaws, and a rotation grows an
 * axis-aligned footprint by up to `length * sin(angle)` - 0.36 m on a 6 m
 * building here, against the 8 m the closest pair of market stalls are apart.
 * Enough to break the stamped-out reading, small enough that no cleared
 * placement can become an overlap.
 */
export const instanceYaw = (position: readonly [number, number, number]): number =>
  (instanceNoise(position, 1) - 0.5) * 0.12;

/**
 * Uniform scale in [0.96, 1.04].
 *
 * Uniform rather than per-axis: these bodies carry a baked albedo and a
 * non-uniform scale stretches its texel density visibly along one axis, which
 * is a worse artefact than the sameness it would be fixing.
 */
export const instanceScale = (position: readonly [number, number, number]): number =>
  0.96 + instanceNoise(position, 2) * 0.08;

export interface GeneratedModelProps {
  asset: GeneratedAssetId;
  /** Explicit authored shop paint; other assets retain their existing palette. */
  shopTrade?: VillageShopTrade;
  /** Explicit market cloth trade; all non-canvas asset pixels remain authored. */
  marketDressing?: number;
  /**
   * Uniform scale. The assets are authored at their shipped size, so this is
   * for the handful of call sites that genuinely want a variant - a smaller
   * outbuilding, a taller landmark - not for correcting the asset.
   */
  scale?: number;
  /** Override an authored shadow flag, or retain the historical true default. */
  castShadow?: boolean;
  /** Match the source mesh shadow-reception contract. */
  receiveShadow?: boolean;
  /**
   * Metres of the asset's OWN body to bury below the call site's origin.
   *
   * Several generated assets ship a base they were never asked for - a turf
   * disc under a building, a bank around a pond - which reads as ground where
   * the scene already has ground. Sinking hides it under the sheet that is
   * really there. Every value must be measured off the GLB (area-weighted
   * horizontal triangles; see `test-results/.../waterplane.mjs`), never
   * estimated from a render: the duck pond cost three cycles to a guess.
   *
   * Deliberately NOT applied to the `fallback`. The primitives were authored
   * standing on y=0, so sinking them would bury geometry that has no plate to
   * hide - the pond's kerb went 0.45 m under the cobbles while this lived in a
   * wrapper group around both bodies.
   *
   * Expressed in the asset's own metres, so it composes with `scale` the way a
   * reader expects rather than being silently multiplied by it.
   */
  sink?: number;
}

export const GeneratedModel: React.FC<GeneratedModelProps> = ({
  asset,
  shopTrade,
  marketDressing,
  scale,
  sink,
  castShadow,
  receiveShadow,
}) => {
  const { scene } = useDracoGLTF(GENERATED_ASSET_PATHS[asset]);

  const { model, materials, geometries } = useMemo(() => {
    const materials: THREE.Material[] = [];
    const geometries: THREE.BufferGeometry[] = [];
    const clone = scene.clone(true);
    clone.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (
        asset === 'marketstall' &&
        marketDressing !== undefined &&
        mesh.material instanceof THREE.MeshStandardMaterial
      ) {
        const geometry = createMarketCanopyGeometry(mesh.geometry, marketDressing);
        if (geometry !== mesh.geometry) {
          const material = mesh.material.clone();
          material.vertexColors = true;
          mesh.geometry = geometry;
          mesh.material = material;
          geometries.push(geometry);
          materials.push(material);
        }
      }
      if (
        (asset === 'stationCanopy' || asset === 'fuelPumpShell') &&
        mesh.material instanceof THREE.MeshStandardMaterial
      ) {
        const geometry = createPosterStationGeometry(mesh.geometry, asset);
        if (geometry !== mesh.geometry) {
          const material = mesh.material.clone();
          material.vertexColors = true;
          // Enamel catches existing sky/forecourt lamps on this owned clone.
          // Working if cached maps stay shared and no light/shader is added.
          if (asset === 'fuelPumpShell') {
            material.roughness = 0.36;
            material.metalness = 0.12;
          }
          mesh.geometry = geometry;
          mesh.material = material;
          geometries.push(geometry);
          materials.push(material);
        }
      }
      if (VESSEL_SHELLS.has(asset) && mesh.material instanceof THREE.MeshStandardMaterial) {
        const material = mesh.material.clone();
        material.roughnessMap = null;
        material.metalnessMap = null;
        material.normalMap = null;
        material.roughness = VESSEL_SHELL_ROUGHNESS;
        applyWorldSurface(material, 'painted');
        mesh.material = material;
        materials.push(material);
      }
      if (
        (VILLAGE_GLAZING.has(asset) || asset === 'farmhouse' || asset === 'barn') &&
        mesh.material instanceof THREE.MeshStandardMaterial
      ) {
        const material = mesh.material.clone();
        // Lancet glazing and forge workrooms keep their architectural character.
        if (asset === 'farmhouse' || asset === 'barn') {
          if (asset === 'barn') {
            const geometry = createBarnJoineryGeometry(mesh.geometry);
            if (geometry !== mesh.geometry) {
              mesh.geometry = geometry;
              geometries.push(geometry);
              material.vertexColors = true;
            }
          }
          applyFarmWindows(material, asset);
        } else if (asset === 'shop' && shopTrade) {
          applyShopWindows(material, shopTrade);
          const geometry = createShopDisplayGeometry(mesh.geometry, shopTrade);
          if (geometry !== mesh.geometry) {
            mesh.geometry = geometry;
            geometries.push(geometry);
          }
        } else if (asset === 'forge') {
          applyForgeWindows(material);
        } else {
          applyVillageWindows(
            material,
            undefined,
            asset !== 'church',
            asset === 'church'
              ? 'stained'
              : asset === 'castle'
                ? 'castle'
                : asset === 'pub'
                  ? 'amber'
                  : asset === 'townhall'
                    ? 'civic'
                    : 'glass'
          );
          if (asset === 'castle') applyCastlePaving(material);
        }
        mesh.material = material;
        materials.push(material);
      }
      // Both faces of every thin part are modelled, so the authored
      // DoubleSide only makes each sheet's back face fight its partner's
      // front. See `closedDoubleFacedAssets.ts` for the geometry contract.
      if (
        CLOSED_DOUBLE_FACED_ASSETS.has(asset) &&
        mesh.material instanceof THREE.Material &&
        mesh.material.side !== THREE.FrontSide
      ) {
        const owned = materials.includes(mesh.material) ? mesh.material : mesh.material.clone();
        owned.side = THREE.FrontSide;
        if (owned !== mesh.material) {
          mesh.material = owned;
          materials.push(owned);
        }
      }
      const authoredCast = mesh.userData.authoredCastShadow;
      const authoredReceive = mesh.userData.authoredReceiveShadow;
      mesh.castShadow = castShadow ?? (typeof authoredCast === 'boolean' ? authoredCast : true);
      mesh.receiveShadow =
        receiveShadow ?? (typeof authoredReceive === 'boolean' ? authoredReceive : true);
    });
    return { model: clone, materials, geometries };
  }, [scene, asset, shopTrade, marketDressing, castShadow, receiveShadow]);
  useEffect(
    () => () => {
      materials.forEach((material) => material.dispose());
      geometries.forEach((geometry) => geometry.dispose());
    },
    [materials, geometries]
  );

  return (
    <primitive
      object={model}
      scale={scale}
      position={sink ? [0, -sink * (scale ?? 1), 0] : undefined}
    />
  );
};

GeneratedModel.displayName = 'GeneratedModel';

export interface GeneratedBodyProps extends GeneratedModelProps {
  /**
   * The primitive this asset replaces. Kept, not deleted: it is what a viewer
   * sees while the GLB streams in, and what they keep seeing if the file is
   * missing from a deployment.
   */
  fallback: React.ReactNode;
}

/**
 * A generated body with both of its safety nets.
 *
 * Suspense covers the load, the boundary covers the failure. Without the
 * boundary a missing or corrupt GLB rethrows out of `useGLTF` and takes the
 * whole surrounding subtree down - which is the opposite of degrading, and the
 * reason `modelLoader.ts` avoids optional model paths in the first place.
 */
export const GeneratedBoundary: React.FC<{
  fallback: React.ReactNode;
  children: React.ReactNode;
  /** Unknown dimensional or colour variants keep their authored geometry. */
  enabled?: boolean;
}> = ({ fallback, children, enabled = true }) =>
  enabled ? (
    <ErrorBoundary fallback={<>{fallback}</>}>
      <React.Suspense fallback={fallback}>{children}</React.Suspense>
    </ErrorBoundary>
  ) : (
    <>{fallback}</>
  );

GeneratedBoundary.displayName = 'GeneratedBoundary';

export const GeneratedBody: React.FC<GeneratedBodyProps> = ({
  asset,
  shopTrade,
  marketDressing,
  scale,
  sink,
  castShadow,
  receiveShadow,
  fallback,
}) => (
  <GeneratedBoundary fallback={fallback}>
    <GeneratedModel
      asset={asset}
      shopTrade={shopTrade}
      marketDressing={marketDressing}
      scale={scale}
      sink={sink}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
    />
  </GeneratedBoundary>
);

GeneratedBody.displayName = 'GeneratedBody';
