/**
 * The generated windmill, with its sails turning.
 *
 * WHY THIS IS NOT A GROUP WITH A `ref` ON IT. `farm/windmill.glb` is a single
 * mesh with a single material whose sails are modelled continuous with the cap:
 * welded by position it is **one** connected shell, so there is no sub-object
 * to lift out and spin. (The earlier "228 shells" reading counted components on
 * the index buffer without welding first, which splits at every UV and normal
 * seam; the welded answer is worse, not better.) A stationary windmill is the
 * most conspicuous dead animation the 30-asset swap cost, so the sails are
 * turned in the vertex shader instead, against a per-vertex weight baked from
 * the rest pose - the same thing a skin does, without a skeleton.
 *
 * WHY A WEIGHT RATHER THAN A CUT. Splitting the index buffer on a plane leaves
 * the triangles that straddle it torn open. A weight makes the seam deform
 * instead of tear, and - because the seam here is twelve vertices wide and sits
 * inside the axle boss - it deforms where nothing can see it.
 *
 * THE NUMBERS BELOW ARE MEASURED, NOT PICKED, and
 * `__tests__/generatedWindmill.test.ts` re-derives them from the shipped GLB so
 * a regenerated asset cannot silently invalidate them:
 *
 *   - Hub axis (0.0948, 0.031) in mesh-local Y/Z, fitted by minimising the
 *     residual of the sail mass under a quarter turn - the blades' own
 *     four-fold symmetry. The area-weighted centroid puts it 0.17 m away,
 *     because the slab also catches a little of the tower base; the symmetry
 *     fit does not care about that.
 *   - The x band 0.216..0.228 sits in a valley: the whole mesh has only ~126
 *     triangles between x 0.21 and 0.23, against 4,180 in the 0.23-0.28 slab
 *     the blades occupy.
 *   - The radius band 0.55..0.57 is EMPTY. Blade mass reaches r 0.538 about the
 *     hub; the only geometry beyond it is fifteen vertices of tower plinth at
 *     r 0.585-0.600. So the two are separated by a gap rather than by a
 *     threshold through the middle of something.
 *
 * Together those give 3,915 vertices fully turning, 2,272 fully static and 12
 * blended, with every partially weighted triangle inside r 0.052 of the axle.
 */

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useDracoGLTF } from '../../utils/dracoLoader';
import { GENERATED_ASSET_PATHS } from '../../utils/modelLoader';
import ErrorBoundary from '../ErrorBoundary';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { createAtmosphereState, sampleAtmosphere } from '../../simulation/atmosphere';
import { getWindmillAngularSpeed } from '../../simulation/ambientWorld';

/** Mesh-local Y of the sail axis. */
export const SAIL_HUB_Y = 0.0948;
/** Mesh-local Z of the sail axis. The sails turn about model-local +X. */
export const SAIL_HUB_Z = 0.031;
/** Weight ramps in across this x band, which is the sparse valley behind the sails. */
export const SAIL_X_IN = 0.216;
export const SAIL_X_OUT = 0.228;
/** Weight ramps back out across this radius band, which holds no vertices at all. */
export const SAIL_R_IN = 0.55;
export const SAIL_R_OUT = 0.57;

/**
 * Sail speed, in radians per second.
 *
 * Carried over unchanged from `WindmillPrimitiveBody`'s driver, which turned
 * its blade group at `time * 0.5`. Roughly 4.8 rpm, which is a working mill in
 * a decent breeze rather than a fairground ride.
 */
export const SAIL_ANGULAR_RATE = 0.5;

/**
 * Per-vertex sail weight from rest positions.
 *
 * Exported because the test re-derives the split from the shipped GLB with it,
 * rather than restating the expected counts against a copy of the rule.
 */
export function computeSailWeights(position: THREE.BufferAttribute): Float32Array {
  const weights = new Float32Array(position.count);
  for (let i = 0; i < position.count; i += 1) {
    const radius = Math.hypot(position.getY(i) - SAIL_HUB_Y, position.getZ(i) - SAIL_HUB_Z);
    weights[i] =
      THREE.MathUtils.smoothstep(position.getX(i), SAIL_X_IN, SAIL_X_OUT) *
      (1 - THREE.MathUtils.smoothstep(radius, SAIL_R_IN, SAIL_R_OUT));
  }
  return weights;
}

/**
 * Bounds that hold for every sail angle.
 *
 * A bounding volume fitted to the rest pose culls the mill the moment a blade
 * tip swings past where the box used to end: the tips reach r 0.538 about a hub
 * that is itself off-centre, so the swept envelope is a full 0.1 wider in y and
 * z than the static one. Swept rather than inflated by a guessed margin,
 * because the sweep of a rotation about a known axis is exactly computable -
 * every weighted vertex traces a circle of its own radius.
 */
export function sweptBounds(position: THREE.BufferAttribute, weights: Float32Array): THREE.Box3 {
  const box = new THREE.Box3();
  const point = new THREE.Vector3();
  let sailRadius = 0;
  let sailMinX = Infinity;
  let sailMaxX = -Infinity;
  for (let i = 0; i < position.count; i += 1) {
    if (weights[i] > 0.001) {
      sailRadius = Math.max(
        sailRadius,
        Math.hypot(position.getY(i) - SAIL_HUB_Y, position.getZ(i) - SAIL_HUB_Z)
      );
      sailMinX = Math.min(sailMinX, position.getX(i));
      sailMaxX = Math.max(sailMaxX, position.getX(i));
      // A partially weighted vertex traces a shorter arc, but bounding it by
      // the full circle costs nothing and cannot be wrong.
      continue;
    }
    box.expandByPoint(point.set(position.getX(i), position.getY(i), position.getZ(i)));
  }
  if (sailRadius > 0) {
    box.expandByPoint(point.set(sailMinX, SAIL_HUB_Y - sailRadius, SAIL_HUB_Z - sailRadius));
    box.expandByPoint(point.set(sailMaxX, SAIL_HUB_Y + sailRadius, SAIL_HUB_Z + sailRadius));
  }
  return box;
}

/**
 * GLSL for the turn, shared by the surface material and the depth material.
 *
 * Both need it or the mill's shadow keeps still while the mill turns, which
 * reads as a bug in the lighting rather than as a windmill - the same trap
 * `InstancedGrainField` already documents for the crop's custom depth material.
 */
const SAIL_PARS = /* glsl */ `
attribute float aSailWeight;
uniform float uSailAngle;
const vec2 millosSailHub = vec2(${SAIL_HUB_Y.toFixed(6)}, ${SAIL_HUB_Z.toFixed(6)});
vec2 millosTurnSail(vec2 offset, float angle) {
  float s = sin(angle);
  float c = cos(angle);
  return vec2(offset.x * c - offset.y * s, offset.x * s + offset.y * c);
}
`;

/**
 * A FUNCTION rather than two locals shared between the hooks, and that is a
 * fix rather than a preference.
 *
 * `MeshDepthMaterial`'s vertex shader has no `#include <beginnormal_vertex>` -
 * a depth pass has no use for a normal - so the earlier version, which computed
 * `sailSin`/`sailCos` in the normal hook and reused them in the position hook,
 * compiled on the surface material and failed on the depth material with four
 * undeclared identifiers. Each injection is self-contained now, and the second
 * sin/cos pair costs a vertex shader nothing.
 *
 * Caught by `capture:art`'s own `consoleErrors`, which is exactly the reason
 * CLAUDE.md says a non-empty diagnostics array is a finding rather than noise.
 */
const SAIL_NORMAL = /* glsl */ `
objectNormal.yz = millosTurnSail(objectNormal.yz, uSailAngle * aSailWeight);
`;

const SAIL_POSITION = /* glsl */ `
transformed.yz = millosSailHub + millosTurnSail(transformed.yz - millosSailHub, uSailAngle * aSailWeight);
`;

/**
 * `objectNormal` has to be turned BEFORE `defaultnormal_vertex` derives
 * `transformedNormal` from it, so the normal hook is the earlier of the two.
 * The position replace is the one that matters on the depth material, where the
 * normal hook is simply absent and its `replace` is a no-op.
 */
function injectSailRotation(
  shader: { vertexShader: string; uniforms: Record<string, THREE.IUniform> },
  angle: THREE.IUniform
): void {
  shader.uniforms.uSailAngle = angle;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${SAIL_PARS}`)
    .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n${SAIL_NORMAL}`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>\n${SAIL_POSITION}`);
}

/**
 * A stable key, per CLAUDE.md's shader-cache rule: it must change when the
 * shader's configuration changes and never otherwise. There is exactly one
 * configuration here, so it is a constant - a timestamp or a counter would
 * recompile the program every frame.
 */
const SAIL_CACHE_KEY = 'windmill_sails_v1';

export const GeneratedWindmillModel: React.FC = () => {
  const { scene } = useDracoGLTF(GENERATED_ASSET_PATHS.windmill);
  const angleRef = useRef<THREE.IUniform>({ value: 0 });
  const atmosphereRef = useRef(createAtmosphereState());
  const reducedMotion = useReducedMotion();

  const model = useMemo(() => {
    const clone = scene.clone(true);
    const angle = angleRef.current;
    clone.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      // Cloned, not mutated in place: `useGLTF` caches the source scene, and
      // both the attribute and the shader hook below would otherwise leak into
      // every later consumer of this asset - and back into this one on remount.
      const geometry = mesh.geometry.clone();
      const position = geometry.getAttribute('position') as THREE.BufferAttribute;
      const weights = computeSailWeights(position);
      geometry.setAttribute('aSailWeight', new THREE.BufferAttribute(weights, 1));
      const box = sweptBounds(position, weights);
      geometry.boundingBox = box;
      geometry.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
      mesh.geometry = geometry;

      const source = mesh.material as THREE.Material;
      const material = source.clone();
      material.onBeforeCompile = (shader) => injectSailRotation(shader, angle);
      material.customProgramCacheKey = () => SAIL_CACHE_KEY;
      mesh.material = material;

      // The shadow pass runs its own material, so the turn has to be injected
      // there too. `MeshDepthMaterial` with RGBA packing is what three uses for
      // a directional light's shadow map.
      const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
      depth.onBeforeCompile = (shader) => injectSailRotation(shader, angle);
      depth.customProgramCacheKey = () => `${SAIL_CACHE_KEY}_depth`;
      mesh.customDepthMaterial = depth;
    });
    return clone;
  }, [scene]);

  // Integrate active time, shared with the primitive's atmospheric speed.
  // Pausing or resuming never jumps to a later wall-clock sail angle.
  useFrame((_state, delta) => {
    const { gameDay, gameTime, gameSpeed, weather, isTabVisible } =
      useGameSimulationStore.getState();
    if (reducedMotion || !isTabVisible || gameSpeed <= 0) return;
    const atmosphere = sampleAtmosphere(gameDay, gameTime, weather, atmosphereRef.current);
    angleRef.current.value =
      (angleRef.current.value + Math.min(delta, 0.1) * getWindmillAngularSpeed(atmosphere.wind)) %
      (Math.PI * 2);
  });

  return <primitive object={model} />;
};

GeneratedWindmillModel.displayName = 'GeneratedWindmillModel';

/**
 * The turning generated mill with both of its safety nets, matching
 * `GeneratedBody`. The fallback is still `WindmillPrimitiveBody`, whose own
 * blade group turns from the scene driver, so the sails move on either path.
 */
export const GeneratedWindmillBody: React.FC<{ fallback: React.ReactNode }> = ({ fallback }) => (
  <ErrorBoundary fallback={fallback}>
    <React.Suspense fallback={fallback}>
      <GeneratedWindmillModel />
    </React.Suspense>
  </ErrorBoundary>
);

GeneratedWindmillBody.displayName = 'GeneratedWindmillBody';
