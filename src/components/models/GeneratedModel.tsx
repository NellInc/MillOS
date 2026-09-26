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
 * walk, and none of them has a skin. Geometry and materials are shared by the
 * clone, so N of a building costs N draw calls and one upload.
 */

import React, { useMemo } from 'react';
import type * as THREE from 'three';
import { useDracoGLTF } from '../../utils/dracoLoader';
import { GENERATED_ASSET_PATHS, type GeneratedAssetId } from '../../utils/modelLoader';
import ErrorBoundary from '../ErrorBoundary';

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
 * NOT A TINT, DELIBERATELY. `Cottage` and `ShopBuilding` still carry
 * `wallColor` props, and wiring them to the generated body would multiply a
 * baked albedo by a colour - the exact symptom-fix pattern CLAUDE.md records
 * for the village cobbles, where a `#9a9a9a` compensator was hiding a decode
 * bug. Geometry variation costs nothing and lies to no one.
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
  scale,
  sink,
  castShadow,
  receiveShadow,
}) => {
  const { scene } = useDracoGLTF(GENERATED_ASSET_PATHS[asset]);

  const model = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const authoredCast = mesh.userData.authoredCastShadow;
      const authoredReceive = mesh.userData.authoredReceiveShadow;
      mesh.castShadow = castShadow ?? (typeof authoredCast === 'boolean' ? authoredCast : true);
      mesh.receiveShadow =
        receiveShadow ?? (typeof authoredReceive === 'boolean' ? authoredReceive : true);
    });
    return clone;
  }, [scene, castShadow, receiveShadow]);

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
  scale,
  sink,
  castShadow,
  receiveShadow,
  fallback,
}) => (
  <GeneratedBoundary fallback={fallback}>
    <GeneratedModel
      asset={asset}
      scale={scale}
      sink={sink}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
    />
  </GeneratedBoundary>
);

GeneratedBody.displayName = 'GeneratedBody';
