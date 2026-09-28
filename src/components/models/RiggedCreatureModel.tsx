/**
 * Rigged farm and village creatures.
 *
 * Nine generated, Tripo-rigged GLBs normalized by
 * `scripts/normalize-model-assets.mjs` and declared in
 * `public/models/asset-manifest.json`. One component serves all of them because
 * the generator fits the **same 41-joint skeleton with the same bone names** to
 * quadrupeds, birds and bipeds alike - a crow and a horse differ only in the
 * numbers in `CREATURE_SPECS`, not in code.
 *
 * Animation is authored here rather than baked into the assets. Tripo's
 * `animate_retarget` presets are humanoid, and because the quadruped rig names
 * the front legs `Clavicle`/`Upperarm`/`Hand`, a biped idle maps straight onto
 * one and rears the animal onto its hind legs for the whole clip. The farm has
 * no locomotion to retarget onto in any case: every animal behaviour in
 * `FarmArea.tsx` is an imperative ref nudge from the single scene `useFrame`.
 * These components therefore expose an imperative handle instead of clips, and
 * the existing drivers keep ownership of *when* an animal grazes.
 *
 * ===========================================================================
 * NO WORLD SURFACE TREATMENT, AND THE REASON IS THE ALIASING FLOOR
 * ===========================================================================
 *
 * These nine are the last lit meshes in the world carrying no analytic surface
 * finish, and the reason they were missed is structural rather than an
 * oversight: they are `SkinnedMesh`, `StaticMeshBatch` excludes skinned meshes
 * before it reaches `isSupportedMaterial`, and nothing else applies
 * `applyWorldSurface` to a generated body. `test-results/pass6/flat-owners.mjs`
 * shows the split cleanly - every generated STRUCTURE (`pub-surface`,
 * `farmhouse-surface`, `coop-surface`, `fountain-surface`, ...) reads SHADED
 * because the batcher finishes even the candidates it declines to merge, and
 * every generated CREATURE (`cow-surface`, `sheep-surface`, `pig-surface`,
 * `chicken-surface`, `duck-surface`, `horse-surface`,
 * `cat-surface`, `crow-surface`) reads flat.
 *
 * They stay flat, on measured grounds rather than on the cost of doing it:
 *
 * 1. THE MESO TERM CANNOT SURVIVE. `paddock` is the closest camera that frames
 *    them, targeting the paddock centre about 16 m out, where a metre of world
 *    covers ~35 screen px at the capture viewport. `fabric`'s 0.055 m weave
 *    lands at 1.9 px and `skin`'s 0.028 m pore at 1.0 px - both below CLAUDE.md
 *    procedural rule 5's 4-6 px floor, which makes them detail that aliases and
 *    then mips to a flat constant. Only a 0.25-0.3 m period survives, and that
 *    is a period authored for vehicle panels and hedges, not for a 1.15 m sheep.
 *
 * 2. THE MACRO TERM HAS NO CORRECT SPACE. Its value is breaking up repeats -
 *    four sheep, five chickens, four ducks - and that needs a WORLD field, one
 *    field the animals stand at different points of. But they wander: a world
 *    field on a body that translates makes the detail swim over it, which is the
 *    failure pass 4 paid for on the workers and the reason `objectSpace: 1`
 *    exists. In object space all four sheep sample the same field and get
 *    identical mottling, which is not a fix for repetition at all.
 *
 * 3. THE BAKED ALBEDO IS ALREADY THE DETAIL. `test-results/pass6/texel-density.mjs`
 *    puts these at 197-876 texels per world metre - the densest assets in the
 *    set by a wide margin, because a 0.42 m chicken carries the same 512 map as
 *    a 12 m church. An analytic field laid over that is competing with authored
 *    detail rather than supplying missing detail.
 *
 * Overturn this with a measurement, not a preference: a capture showing the
 * creatures reading flat against their surroundings at a camera that resolves
 * them would be new evidence, and a per-creature profile with a period chosen
 * against that camera's px-per-metre would be the answer.
 */

import React, { useImperativeHandle, useMemo } from 'react';
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { useDracoGLTF } from '../../utils/dracoLoader';
import { CREATURE_ASSET_PATHS, type CreatureId } from '../../utils/modelLoader';
import ErrorBoundary from '../ErrorBoundary';

export type { CreatureId };

export interface CreatureRigHandle {
  /** 0 keeps the head up and alert, 1 puts the muzzle or beak in the sward. */
  setGraze(amount: number): void;
  /** Lateral head sweep in radians, for the pet response. */
  setHeadShake(angle: number): void;
  /**
   * Leg swing. `phase` is a free-running angle in radians; `amount` blends the
   * swing in and out, so an animal that stops walking settles rather than
   * snapping to its rest pose.
   */
  setStride(phase: number, amount: number): void;
}

/**
 * Per-species reach, solved rather than guessed.
 *
 * `FarmArea.tsx`'s original grazing constant was a 0.15-0.45 rad nod tuned for a
 * rigid box head on a sphere body. Necks differ about fivefold across this
 * roster, so one number cannot serve them: on an anatomically proportioned cow
 * that value is a twitch, and on a crow it would fold the bird in half.
 *
 * These come from sweeping bend against head counter-rotation on the **shipped**
 * GLBs and taking the pose that puts the nose nearest the sward, subject to two
 * rejections that were both paid for during the trial:
 *
 * 1. **Nose behind the neck pivot.** Past a point the chain curls the head back
 *    under the chest and more bend stops being more grazing.
 * 2. **Nose below the floor.** Without that test the pig drove its snout 185 mm
 *    through the ground, because "minimise nose height" is not the same goal as
 *    "reach the grass". The target is `min(0.06, restY * 0.18)`, not zero.
 *
 * `reached` records where each nose actually ends up. The cow bottoming out at
 * 0.26 m and the horse at 0.44 m are rig limits - those necks curl rather than
 * extend - not tuning misses. In scene the grass clutter covers the gap.
 */
interface CreatureSpec {
  /** Total neck bend at full graze, split down the chain. */
  bend: number;
  /** Head counter-rotation. Without it the head points at the animal's knees. */
  counter: number;
  /** Leg swing amplitude in radians; 0 for anything that does not walk. */
  stride: number;
  /** Solved nose height at full bend, in metres. Recorded, not used. */
  reached: number;
}

const CREATURE_SPECS: Record<CreatureId, CreatureSpec> = {
  cow: { bend: 2.1, counter: 0.9, stride: 0.36, reached: 0.255 },
  sheep: { bend: 2.6, counter: 0.7, stride: 0.3, reached: 0.326 },
  pig: { bend: 1.2, counter: 0.6, stride: 0.3, reached: 0.062 },
  horse: { bend: 1.9, counter: 0.6, stride: 0.36, reached: 0.44 },
  chicken: { bend: 2.5, counter: 0.4, stride: 0.25, reached: 0.059 },
  crow: { bend: 2.0, counter: 0.4, stride: 0, reached: 0.042 },
  duck: { bend: 2.6, counter: 0.6, stride: 0.2, reached: 0.095 },
  // A sleeping cat does not graze, but it still carries a rig, so it keeps the
  // handle; its driver simply never asks for a bend.
  cat: { bend: 0, counter: 0, stride: 0, reached: 0 },
};

const GRAZE_CHAIN: ReadonlyArray<readonly [string, number]> = [
  ['Spine02', 0.1],
  ['NeckTwist01', 0.46],
  ['NeckTwist02', 0.44],
];

/**
 * Leg swing, as diagonal pairs.
 *
 * Signs put front-left with hind-right, the diagonal support pattern. A four-
 * legged animal's true walk is a four-beat lateral sequence rather than a
 * two-beat diagonal, but at these speeds across a paddock the difference is not
 * resolvable, and the alternative on offer was no leg motion at all: the wander
 * state machine has these animals moving roughly 80% of the time, so the glide,
 * not the graze, is what a viewer mostly sees.
 *
 * The front legs swing at `Forearm`, not `Upperarm`, and that is a measured
 * choice rather than an anatomical one. `Upperarm`'s skin weights reach up over
 * the withers, so rotating it backwards drags the topline into a visible crease
 * across the shoulder - present at 0.42 rad and still present at 0.30, which is
 * how it was identified as deformation rather than amplitude. The elbow carries
 * almost no body skin and reads the same at this distance. The control that
 * settled it is a zero-amplitude pose: it renders identical to rest, so the
 * crease was the pose and not accumulated drift. Hind legs stay on `Thigh`,
 * which does not crease.
 */
const STRIDE_CHAIN: ReadonlyArray<readonly [string, number]> = [
  ['L_Forearm', 1],
  ['R_Thigh', 1],
  ['R_Forearm', -1],
  ['L_Thigh', -1],
];
const REST_BONES = [
  'Spine02',
  'NeckTwist01',
  'NeckTwist02',
  'Head',
  'L_Forearm',
  'R_Forearm',
  'L_Thigh',
  'R_Thigh',
] as const;

/**
 * Model-space axes, not world axes.
 *
 * Every asset faces +Z, so a positive rotation about model +X drops the nose.
 * Working in model space rather than world space is what makes this survive the
 * two rotations between a rig and the world: an animal yaws as it wanders
 * (`updateAnimalMovement` writes `rotation.y`), and the whole farm sits under a
 * `[0, PI, 0]` site transform. A world axis would drift with both.
 */
const PITCH_AXIS = new THREE.Vector3(1, 0, 0);
const YAW_AXIS = new THREE.Vector3(0, 1, 0);

/** Clearance added to the bind-pose sphere so a grazing head is never culled. */
const POSE_BOUNDS_MARGIN = 0.35;

const _parentQuaternion = new THREE.Quaternion();
const _rootQuaternion = new THREE.Quaternion();
const _axis = new THREE.Vector3();
const _delta = new THREE.Quaternion();
const _bindBox = new THREE.Box3();
const _centre = new THREE.Vector3();

/**
 * Rotate a bone about an axis given in the model root's frame.
 *
 * `Object3D.rotateOnWorldAxis` is wrong here: it premultiplies in *parent*
 * space, which equals world space only when the parent is unrotated, and these
 * bones sit deep in a rotated chain. A local Euler is wrong too - the rig's
 * bone axes are not model-aligned, so `Head.rotation.x` yaws the muzzle
 * sideways instead of nodding it. Converting the axis into the parent's frame
 * first is the only form that behaves.
 */
function rotateBoneInRootSpace(
  bone: THREE.Object3D | undefined,
  rootQuaternion: THREE.Quaternion,
  axis: THREE.Vector3,
  angle: number
): void {
  if (!bone?.parent || !angle) return;
  bone.parent.getWorldQuaternion(_parentQuaternion).invert().multiply(rootQuaternion);
  _axis.copy(axis).applyQuaternion(_parentQuaternion).normalize();
  bone.quaternion.premultiply(_delta.setFromAxisAngle(_axis, angle));
}

export interface RiggedCreatureModelProps {
  creature: CreatureId;
}

export const RiggedCreatureModel = React.forwardRef<CreatureRigHandle, RiggedCreatureModelProps>(
  ({ creature }, ref) => {
    const { scene } = useDracoGLTF(CREATURE_ASSET_PATHS[creature]);

    const prepared = useMemo(() => {
      // `Object3D.clone(true)` leaves every copy bound to the ORIGINAL skeleton,
      // so every animal of a species poses identically no matter what is set on
      // them. SkeletonUtils rebinds.
      const model = cloneSkeleton(scene) as THREE.Group;
      model.name = `creature-${creature}`;
      const bones = new Map<string, THREE.Object3D>();
      const rest = new Map<string, THREE.Quaternion>();
      const skinned: THREE.SkinnedMesh[] = [];

      _bindBox.makeEmpty();
      model.traverse((object) => {
        if ((object as THREE.Bone).isBone) bones.set(object.name, object);
        const mesh = object as THREE.SkinnedMesh;
        if (!mesh.isSkinnedMesh) return;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.geometry.computeBoundingBox();
        if (mesh.geometry.boundingBox) _bindBox.union(mesh.geometry.boundingBox);
        skinned.push(mesh);
      });

      for (const name of REST_BONES) {
        const bone = bones.get(name);
        if (bone) rest.set(name, bone.quaternion.clone());
      }

      // A skinned bounding volume derived from whatever pose happens to be
      // current on the first cull clips the head off mid-graze. Recompute from
      // the bind box and inflate once, never scale in place, so a remount cannot
      // compound the margin.
      _bindBox.getCenter(_centre);
      const radius = _bindBox.isEmpty()
        ? 1.4
        : _centre.distanceTo(_bindBox.max) + POSE_BOUNDS_MARGIN;
      for (const mesh of skinned) {
        mesh.boundingSphere = new THREE.Sphere(_centre.clone(), radius);
        mesh.frustumCulled = true;
      }

      return { model, bones, rest };
    }, [scene, creature]);

    useImperativeHandle(ref, () => {
      const { model, bones, rest } = prepared;
      const spec = CREATURE_SPECS[creature];
      // Both channels are stored and the whole pose is rebuilt from the rest
      // quaternions on every write. `rotateBoneInRootSpace` premultiplies, so
      // a setter that only added its own delta would wind the neck up
      // progressively - and the channels are driven on different throttles
      // (the pet response every second frame, grazing every fourth), so
      // neither can be relied on to reset the other.
      let graze = 0;
      let shake = 0;
      let stridePhase = 0;
      let strideAmount = 0;
      const apply = () => {
        model.getWorldQuaternion(_rootQuaternion);
        for (const name of REST_BONES) {
          const bone = bones.get(name);
          const restQuaternion = rest.get(name);
          if (bone && restQuaternion) bone.quaternion.copy(restQuaternion);
        }
        for (const [name, share] of GRAZE_CHAIN) {
          rotateBoneInRootSpace(
            bones.get(name),
            _rootQuaternion,
            PITCH_AXIS,
            graze * spec.bend * share
          );
        }
        const head = bones.get('Head');
        rotateBoneInRootSpace(head, _rootQuaternion, PITCH_AXIS, -graze * spec.counter);
        rotateBoneInRootSpace(head, _rootQuaternion, YAW_AXIS, shake);
        if (strideAmount > 0.001 && spec.stride > 0) {
          const swing = Math.sin(stridePhase) * spec.stride * strideAmount;
          for (const [name, sign] of STRIDE_CHAIN) {
            rotateBoneInRootSpace(bones.get(name), _rootQuaternion, PITCH_AXIS, swing * sign);
          }
        }
        // Refresh so the next call reads this pose's parent orientations
        // rather than the one before it; the bend shares are calibrated
        // against that sequencing.
        model.updateMatrixWorld(true);
      };
      return {
        setGraze(amount: number) {
          graze = THREE.MathUtils.clamp(amount, 0, 1);
          apply();
        },
        setHeadShake(angle: number) {
          shake = angle;
          apply();
        },
        setStride(phase: number, amount: number) {
          stridePhase = phase;
          strideAmount = THREE.MathUtils.clamp(amount, 0, 1);
          apply();
        },
      };
    }, [prepared, creature]);

    return <primitive object={prepared.model} />;
  }
);

RiggedCreatureModel.displayName = 'RiggedCreatureModel';

export interface CreatureBodyProps extends RiggedCreatureModelProps {
  /**
   * The primitive this creature replaces. Kept, not deleted: it is what a
   * viewer sees while the GLB streams in, and what they keep seeing if the file
   * is missing from a deployment.
   */
  fallback: React.ReactNode;
}

/**
 * A rigged creature with both of its safety nets.
 *
 * Suspense covers the load, the boundary covers the failure. Without the
 * boundary a missing or corrupt GLB rethrows out of `useGLTF` and takes the
 * whole surrounding subtree down.
 */
export const CreatureBody = React.forwardRef<CreatureRigHandle, CreatureBodyProps>(
  ({ creature, fallback }, ref) => (
    <ErrorBoundary fallback={fallback}>
      <React.Suspense fallback={fallback}>
        <RiggedCreatureModel ref={ref} creature={creature} />
      </React.Suspense>
    </ErrorBoundary>
  )
);

CreatureBody.displayName = 'CreatureBody';
