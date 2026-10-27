/**
 * The precision-authored windmill retains the accepted raw mesh frame and
 * single-mesh/material contract. Its static tower/cap and closed rigid lattice
 * parts share that one mesh; the surface and depth shaders turn the sail parts
 * through the same per-vertex attribute and angle owner.
 *
 * `scripts/craft-precise-windmill.mjs` derives it from the immutable accepted
 * parent. Straight joinery replaces the provider's softened beams and dented
 * plaster. White plaster, jointed stone, copper-brown cap and open timber sails
 * retain their identity through three authored 512px maps, including clean
 * tangent normals. Individually fitted panels retain source asymmetry; this
 * does not claim exact fourfold geometry or rotational balance.
 *
 * The raw hub Y/Z and X/radius gates below remain unchanged. Every authored
 * rotor vertex evaluates exactly one and every static vertex exactly zero;
 * every triangle is rigid, with no blended bridge between moving and fixed
 * parts. The narrow bearing separation is inside the hub assembly. Static foot
 * vertices beyond the X gate remain outside the entire rotor sweep.
 *
 * Actual-asset tests re-derive weights, triangle rigidity, separation, atlas
 * charts and swept bounds. Node normalisation, world roots, wind speed,
 * pause/reduced-motion/hidden-tab holds and surface/depth angle sharing remain
 * the existing runtime owners. Never silently renormalise this raw contract.
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
/** Weight ramps in across this x band, which is the retained bearing separation behind the sails. */
export const SAIL_X_IN = 0.216;
export const SAIL_X_OUT = 0.228;
/** Weight ramps back out across this radius band, which separates the authored rotor and static foot. */
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
 * tip swings past where the box used to end: the tips rotate about a hub
 * that is itself off-centre, so the swept envelope is wider in y and
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
  // The sails face +X, so a positive turn about +X reads anticlockwise from the
  // front; the angle decreases so they turn clockwise.
  useFrame((_state, delta) => {
    const { gameDay, gameTime, gameSpeed, weather, isTabVisible } =
      useGameSimulationStore.getState();
    if (reducedMotion || !isTabVisible || gameSpeed <= 0) return;
    const atmosphere = sampleAtmosphere(gameDay, gameTime, weather, atmosphereRef.current);
    angleRef.current.value =
      (angleRef.current.value - Math.min(delta, 0.1) * getWindmillAngularSpeed(atmosphere.wind)) %
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
