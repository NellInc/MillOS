/**
 * Rigged farm and village creatures.
 *
 * Nine generated, Tripo-rigged GLBs normalized by
 * `scripts/normalize-model-assets.mjs` and declared in
 * `public/models/asset-manifest.json`. One component serves all of them because
 * the generator fits the **same 41-joint skeleton with the same bone names** to
 * quadrupeds, birds and bipeds alike. Cow/pig limbs need the measured corrective
 * chains below; the other species retain their original imperative poses.
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

import React, { useEffect, useImperativeHandle, useMemo } from 'react';
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { useDracoGLTF } from '../../utils/dracoLoader';
import { CREATURE_ASSET_PATHS, type CreatureId } from '../../utils/modelLoader';
import ErrorBoundary from '../ErrorBoundary';
import { createSheepRestMotion } from './sheepRestMotion';
import { createChickenWalk } from './chickenWalk';
import {
  createHorseRestPose,
  sampleHorseRest,
  sampleHoofStep,
} from '../../simulation/creatureMotion';

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
  /** Optional for older handles/fallbacks; the owner retains clock/hold control. */
  setResting?(seconds: number, seed: number): void;
}

const smooth = THREE.MathUtils.smoothstep;
type HorseRegion = 'leftEar' | 'rightEar' | 'tail' | 'breath';
function horseRegionWeight(region: HorseRegion, x: number, y: number, z: number): number {
  if (region === 'breath')
    return (
      smooth(y, 0.78, 0.94) *
      (1 - smooth(y, 1.22, 1.3)) *
      smooth(z, -0.78, -0.62) *
      (1 - smooth(z, 0.15, 0.28)) *
      smooth(Math.abs(x), 0.12, 0.22)
    );
  if (region === 'tail') return 1 - smooth(y, 1.1, 1.2);
  if ((region === 'leftEar' && x <= 0) || (region === 'rightEar' && x >= 0)) return 0;
  return (
    smooth(y, 1.56, 1.65) *
    smooth(z, 0.48, 0.62) *
    (1 - smooth(z, 0.93, 1.02)) *
    smooth(Math.abs(x), 0.025, 0.055)
  );
}

/**
 * The shipped horse has no ear/tail joints. Finish those regions in fixed model
 * rest space BEFORE skinning, using private geometry, never a shared material or
 * shader. These metre masks belong to HorseBody's measured 4,224-vertex asset;
 * an incompatible replacement keeps its original geometry. Working if only the
 * measured ears/tail/ribs move, neutral is byte-exact, and other copies survive.
 */
export function createHorseRestMotion(model: THREE.Object3D) {
  const mesh = model.getObjectByName('HorseBody') as THREE.SkinnedMesh | undefined;
  const source = mesh?.geometry;
  if (
    !mesh?.isSkinnedMesh ||
    !source ||
    source.attributes.position?.count !== 4224 ||
    !source.attributes.normal ||
    !source.attributes.skinWeight
  )
    return null;
  model.updateWorldMatrix(true, false);
  model.updateMatrixWorld(true);
  const toModel = new THREE.Matrix4().copy(model.matrixWorld).invert().multiply(mesh.matrixWorld);
  const toMesh = toModel.clone().invert();
  const normalToModel = new THREE.Matrix3().getNormalMatrix(toModel);
  const normalToMesh = new THREE.Matrix3().getNormalMatrix(toMesh);
  const points = Array.from({ length: source.attributes.position.count }, (_, i) =>
    new THREE.Vector3().fromBufferAttribute(source.attributes.position, i).applyMatrix4(toModel)
  );
  // The tail curves left to x=-.296m, overlapping the hind legs in X. Its
  // connected surface BELOW the attachment is distinct, even though the whole
  // horse is one mesh. Weld only this analysis graph, preserving every UV seam.
  const links = points.map(() => [] as number[]);
  const welded = new Map<string, number[]>();
  const keys = points.map((p) => `${p.x.toFixed(5)},${p.y.toFixed(5)},${p.z.toFixed(5)}`);
  points.forEach((_, i) => {
    const group = welded.get(keys[i]);
    if (group) group.push(i);
    else welded.set(keys[i], [i]);
  });
  if (!source.index) return null;
  for (let i = 0; i < source.index.count; i += 3) {
    const a = source.index.getX(i),
      b = source.index.getX(i + 1),
      c = source.index.getX(i + 2);
    links[a].push(b, c);
    links[b].push(a, c);
    links[c].push(a, b);
  }
  let seed = -1;
  points.forEach((p, i) => {
    if (p.y < 0.6 && (seed < 0 || p.z < points[seed].z)) seed = i;
  });
  if (seed < 0) return null;
  const tail = new Set<number>([seed]),
    pending = [seed];
  while (pending.length) {
    const i = pending.pop()!;
    for (const j of [...links[i], ...welded.get(keys[i])!]) {
      if (tail.has(j) || points[j].y >= 1.2) continue;
      tail.add(j);
      pending.push(j);
    }
  }
  // Fail closed for another asset/topology: never attach a tail field to a leg.
  if (
    tail.size !== 257 ||
    [...tail].some((i) => {
      const p = points[i];
      return p.y < 0.35 || p.z > -1.02 || Math.abs(p.x) > 0.31;
    })
  )
    return null;
  const regions: HorseRegion[] = ['leftEar', 'rightEar', 'tail', 'breath'];
  const counts = [0, 0, 0, 0];
  const entries: {
    index: number;
    region: HorseRegion;
    point: THREE.Vector3;
    normal: THREE.Vector3;
    weight: number;
    gradient: THREE.Vector3;
  }[] = [];
  const epsilon = 0.0001;
  for (let index = 0; index < source.attributes.position.count; index++) {
    const point = points[index];
    const { x, y, z } = point;
    for (let r = 0; r < regions.length; r++) {
      const region = regions[r];
      if (region === 'tail' && !tail.has(index)) continue;
      const weight = horseRegionWeight(region, x, y, z);
      if (weight <= 0) continue;
      counts[r]++;
      const gradient = new THREE.Vector3(
        horseRegionWeight(region, x + epsilon, y, z) - horseRegionWeight(region, x - epsilon, y, z),
        horseRegionWeight(region, x, y + epsilon, z) - horseRegionWeight(region, x, y - epsilon, z),
        horseRegionWeight(region, x, y, z + epsilon) - horseRegionWeight(region, x, y, z - epsilon)
      ).multiplyScalar(1 / (2 * epsilon));
      if (region === 'tail') {
        const t = THREE.MathUtils.clamp((y - 1.1) / 0.1, 0, 1);
        gradient.set(0, (-6 * t * (1 - t)) / 0.1, 0);
      }
      entries.push({
        index,
        region,
        point,
        weight,
        gradient,
        normal: new THREE.Vector3()
          .fromBufferAttribute(source.attributes.normal, index)
          .applyMatrix3(normalToModel)
          .normalize(),
      });
    }
  }
  if (counts.some((count) => count < 20)) return null;
  const geometry = source.clone();
  // GLTFLoader may interleave position/normal/UV in one borrowed buffer.
  // Give ONLY the two written channels independent contiguous owned storage.
  const copyChannel = (attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) => {
    const values = new Float32Array(attribute.count * 3);
    for (let i = 0; i < attribute.count; i++) {
      values[i * 3] = attribute.getX(i);
      values[i * 3 + 1] = attribute.getY(i);
      values[i * 3 + 2] = attribute.getZ(i);
    }
    return new THREE.BufferAttribute(values, 3);
  };
  const positions = copyChannel(source.attributes.position);
  const normals = copyChannel(source.attributes.normal);
  geometry.setAttribute('position', positions);
  geometry.setAttribute('normal', normals);
  positions.setUsage(THREE.DynamicDrawUsage);
  normals.setUsage(THREE.DynamicDrawUsage);
  mesh.geometry = geometry;
  const pose = createHorseRestPose();
  const p = new THREE.Vector3(),
    n = new THREE.Vector3(),
    u = new THREE.Vector3(),
    g = new THREE.Vector3(),
    pivot = new THREE.Vector3();
  let lastTime = 0,
    lastSeed = 0,
    disposed = false;
  return {
    apply(seconds: number, seed: number) {
      if (disposed) return;
      const time = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
      const identity = Number.isFinite(seed) ? seed : 0;
      if (time === lastTime && identity === lastSeed) return;
      lastTime = time;
      lastSeed = identity;
      sampleHorseRest(time, identity, pose);
      for (const entry of entries) {
        const { index, region, point, normal, weight, gradient } = entry;
        const amount = pose[region];
        if (amount === 0) {
          positions.setXYZ(
            index,
            source.attributes.position.getX(index),
            source.attributes.position.getY(index),
            source.attributes.position.getZ(index)
          );
          normals.setXYZ(
            index,
            source.attributes.normal.getX(index),
            source.attributes.normal.getY(index),
            source.attributes.normal.getZ(index)
          );
          continue;
        }
        p.copy(point);
        n.copy(normal);
        g.copy(gradient);
        let angle = 0;
        if (region === 'breath') {
          u.set(Math.sign(point.x) * 0.003 * amount, 0, 0);
          p.addScaledVector(u, weight);
        } else {
          const side = region === 'leftEar' ? 1 : -1;
          pivot.set(
            region === 'tail' ? 0 : side * 0.1,
            region === 'tail' ? 1.22 : 1.56,
            region === 'tail' ? -1.02 : 0.68
          );
          const theta = amount * (region === 'tail' ? 0.24 : -side * 0.2);
          angle = theta * weight;
          p.sub(pivot);
          u.set(-p.y, p.x, 0);
          g.multiplyScalar(theta);
        }
        // Inverse-transpose of the tapered field, including mask derivatives.
        // Rotating normals by just angle*weight leaves false seams at its edge.
        n.addScaledVector(g, -u.dot(n) / (1 + g.dot(u)));
        if (region !== 'breath') {
          const c = Math.cos(angle),
            s = Math.sin(angle);
          p.set(p.x * c - p.y * s, p.x * s + p.y * c, p.z).add(pivot);
          n.set(n.x * c - n.y * s, n.x * s + n.y * c, n.z);
        }
        p.applyMatrix4(toMesh);
        n.applyMatrix3(normalToMesh).normalize();
        positions.setXYZ(index, p.x, p.y, p.z);
        normals.setXYZ(index, n.x, n.y, n.z);
      }
      positions.needsUpdate = normals.needsUpdate = true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (mesh.geometry === geometry) mesh.geometry = source;
      geometry.dispose();
    },
  };
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

/**
 * The actual generated cow gives BOTH forehooves to R_Hand; the pig gives its
 * rear soles to Waist. Rotating those humanoid joints cannot make four feet.
 * Fit private chains to the measured normalized limb surfaces instead. Original
 * positions, normals, UVs, topology, materials and all non-leg weights survive.
 * This is deliberately cow/pig-only; the finished horse rig is unchanged.
 */
export function createQuadrupedWalk(model: THREE.Group, species: CreatureId) {
  if (species !== 'cow' && species !== 'pig') return null;
  const cow = species === 'cow';
  const anchors = cow
    ? [
        [0.118, 0.239],
        [-0.221, 0.171],
        [0.141, -0.698],
        [-0.214, -0.7],
      ]
    : [
        [0.141, 0.158],
        [-0.14, 0.169],
        [0.126, -0.403],
        [-0.127, -0.4],
      ];
  model.updateMatrixWorld(true);
  const chainRoot = new THREE.Group();
  chainRoot.name = 'quadruped-stride';
  model.add(chainRoot);
  const legs = anchors.map(([x, z], i) => {
    const hip = new THREE.Vector3(x, cow ? 0.65 : 0.36, z + (i < 2 ? 0 : 0.06));
    const knee = new THREE.Vector3(x, cow ? 0.32 : 0.18, z - (cow ? 0.14 : 0.1));
    const sole = new THREE.Vector3(x, cow ? 0.06 : 0.05, z);
    const upper = new THREE.Bone(),
      lower = new THREE.Bone(),
      hoof = new THREE.Bone();
    upper.name = `stride-${i}-upper`;
    lower.name = `stride-${i}-lower`;
    hoof.name = `stride-${i}-hoof`;
    upper.position.copy(hip);
    lower.position.subVectors(knee, hip);
    hoof.position.subVectors(sole, knee);
    chainRoot.add(upper);
    upper.add(lower);
    lower.add(hoof);
    return { upper, lower, hoof, hip, sole, u: lower.position.clone(), l: hoof.position.clone() };
  });
  model.updateMatrixWorld(true);
  const joints = legs.flatMap((leg) => [leg.upper, leg.lower, leg.hoof]);
  const meshes: THREE.SkinnedMesh[] = [];
  model.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(o as THREE.SkinnedMesh);
  });
  // SkeletonUtils.clone shares the inverse ARRAY with the cached source.
  // Copy both array and matrices before extending it, once per actual skeleton.
  const starts = new Map<THREE.Skeleton, number>();
  const poseOwners = new Map<THREE.Skeleton, string[]>();
  for (const mesh of meshes) {
    const skeleton = mesh.skeleton;
    if (starts.has(skeleton)) continue;
    starts.set(skeleton, skeleton.bones.length);
    poseOwners.set(
      skeleton,
      skeleton.bones.map((bone) => {
        let parent: THREE.Object3D | null = bone;
        while (parent) {
          if (GRAZE_CHAIN.some(([name]) => name === parent!.name) || parent.name === 'Head')
            return parent.name;
          parent = parent.parent;
        }
        return 'neutral';
      })
    );
    // The normalized GLB carries its metre conversion in the rest skin matrix,
    // not bindMatrix (which is identity). Identity new binds would shrink feet.
    const restSkin = new THREE.Matrix4().multiplyMatrices(
      skeleton.bones[0].matrixWorld,
      skeleton.boneInverses[0]
    );
    skeleton.bones = [...skeleton.bones, ...joints];
    skeleton.boneInverses = [
      ...skeleton.boneInverses.map((inverse) => inverse.clone()),
      ...joints.map((joint) => joint.matrixWorld.clone().invert().multiply(restSkin)),
    ];
    skeleton.init();
  }
  const owned: {
    mesh: THREE.SkinnedMesh;
    source: THREE.BufferGeometry;
    geometry: THREE.BufferGeometry;
  }[] = [];
  const fitting = { maximumDiscardedWeight: 0, maximumFieldsTouched: 0, witness: null as unknown };
  const point = new THREE.Vector3();
  const smooth = THREE.MathUtils.smoothstep;
  for (const mesh of meshes) {
    const source = mesh.geometry,
      geometry = source.clone();
    const points = Array.from({ length: source.attributes.position.count }, (_, v) =>
      mesh.getVertexPosition(v, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld)
    );
    // A Cartesian depth cut sliced calf skin and caught the cow's tail tuft.
    // Follow actual surface connectivity from the four sole bands instead.
    // Exact-position UV/normal seams are neighbours for fitting only; render
    // topology and attributes remain untouched. The body-height cutoff prevents
    // a path down the tail from its attachment high on the rump.
    const adjacent: number[][] = points.map(() => []);
    const weld = new Map<string, number>();
    for (let v = 0; v < points.length; v++) {
      const key = `${source.attributes.position.getX(v)},${source.attributes.position.getY(v)},${source.attributes.position.getZ(v)}`;
      const previous = weld.get(key);
      if (previous === undefined) weld.set(key, v);
      else {
        adjacent[v].push(previous);
        adjacent[previous].push(v);
      }
    }
    const index = source.index!;
    for (let t = 0; t < index.count; t += 3) {
      const ids = [index.getX(t), index.getX(t + 1), index.getX(t + 2)];
      for (let n = 0; n < 3; n++) {
        const a = ids[n],
          b = ids[(n + 1) % 3];
        adjacent[a].push(b);
        adjacent[b].push(a);
      }
    }
    // Fifth field protects the real head/neck skin and feathers the adjoining
    // body. Its four distinct original pose owners cannot share a fifth slot
    // with a leg; those original weights must remain untouched.
    const distances = new Float64Array(points.length * 5).fill(Infinity);
    const queue: { vertex: number; leg: number; distance: number }[] = [];
    // Local binary min-heap: one load-time fit, no scan or allocation per frame.
    const enqueue = (vertex: number, leg: number, distance: number) => {
      let child = queue.length;
      queue.push({ vertex, leg, distance });
      while (child > 0) {
        const parent = (child - 1) >> 1;
        if (queue[parent].distance <= distance) break;
        queue[child] = queue[parent];
        child = parent;
      }
      queue[child] = { vertex, leg, distance };
    };
    for (let v = 0; v < points.length; v++) {
      for (let n = 0; n < 4; n++) {
        const joint = source.attributes.skinIndex.getComponent(v, n);
        const owner = poseOwners.get(mesh.skeleton)![joint];
        if (
          source.attributes.skinWeight.getComponent(v, n) > 0.000001 &&
          (owner === 'Head' || owner === 'NeckTwist01' || owner === 'NeckTwist02')
        ) {
          distances[v * 5 + 4] = 0;
          enqueue(v, 4, 0);
          break;
        }
      }
      if (points[v].y >= (cow ? 0.12 : 0.08)) continue;
      let leg = 0;
      for (let i = 1; i < legs.length; i++)
        if (points[v].distanceToSquared(legs[i].sole) < points[v].distanceToSquared(legs[leg].sole))
          leg = i;
      distances[v * 5 + leg] = 0;
      enqueue(v, leg, 0);
    }
    while (queue.length) {
      const current = queue[0],
        last = queue.pop()!;
      if (queue.length) {
        let parent = 0;
        while (parent * 2 + 1 < queue.length) {
          let child = parent * 2 + 1;
          if (child + 1 < queue.length && queue[child + 1].distance < queue[child].distance)
            child++;
          if (queue[child].distance >= last.distance) break;
          queue[parent] = queue[child];
          parent = child;
        }
        queue[parent] = last;
      }
      const { vertex, leg, distance } = current;
      if (distance !== distances[vertex * 5 + leg]) continue;
      for (const next of adjacent[vertex]) {
        if (points[next].y >= (cow ? 0.65 : 0.36)) continue;
        const candidate = distance + points[vertex].distanceTo(points[next]);
        if (
          candidate >= distances[next * 5 + leg] ||
          candidate >= (leg === 4 ? 0.1 : cow ? 0.65 : 0.38)
        )
          continue;
        distances[next * 5 + leg] = candidate;
        enqueue(next, leg, candidate);
      }
    }
    const indices = geometry.getAttribute('skinIndex'),
      weights = geometry.getAttribute('skinWeight');
    for (let v = 0; v < indices.count; v++) {
      point.copy(points[v]);
      // Overlapping fields blend softly under the belly. A hard nearest-owner
      // switch or narrow zero band pulls this bridge apart as the legs alternate.
      const fields = legs.map(
        (_, i) =>
          (1 - smooth(distances[v * 5 + i], cow ? 0.25 : 0.1, cow ? 0.55 : 0.28)) *
          (1 - smooth(point.y, cow ? 0.37 : 0.18, cow ? 0.65 : 0.36)) *
          smooth(distances[v * 5 + 4], 0, 0.1)
      );
      const fit = Math.max(...fields),
        total = fields.reduce((sum, weight) => sum + weight, 0);
      if (fit <= 0) continue;
      fitting.maximumFieldsTouched = Math.max(
        fitting.maximumFieldsTouched,
        fields.filter((v) => v > 0.000001).length
      );
      const hoof = 1 - smooth(point.y, cow ? 0.12 : 0.08, cow ? 0.22 : 0.19);
      // Pig knees have a short, thick surface. Spread the bend over that real
      // leg, rather than switching lower/upper ownership across a 3 cm band.
      const upper = smooth(point.y, cow ? 0.24 : 0.19, cow ? 0.4 : 0.31);
      const ordered = [0, 1, 2, 3].sort((a, b) => fields[b] - fields[a]);
      // The support fields extend 0.1 m beyond their positive skin influence.
      const competitors = [0, 1, 2, 3].filter((i) => i !== ordered[0]);
      const secondDistance = Math.min(...competitors.map((i) => distances[v * 5 + i]));
      const bridge = 1 - smooth(secondDistance, cow ? 0.55 : 0.28, cow ? 0.65 : 0.38);
      const tie = smooth(fields[ordered[1]] / fields[ordered[0]], 0.5, 1);
      // All retained old joints in a pose-owner class move rigidly together.
      // Merge those equivalent influences before reserving the two leg slots.
      // Top-four truncation alone makes a new weight suddenly appear when it
      // overtakes an old one, creating a crease even with a smooth fit field.
      const groups = new Map<string, { joint: number; weight: number; largest: number }>();
      for (let n = 0; n < 4; n++) {
        const joint = indices.getComponent(v, n),
          weight = weights.getComponent(v, n);
        const owner = poseOwners.get(mesh.skeleton)![joint],
          group = groups.get(owner);
        if (group) {
          group.weight += weight;
          if (weight > group.largest) {
            group.joint = joint;
            group.largest = weight;
          }
        } else groups.set(owner, { joint, weight, largest: weight });
      }
      // Settle the small belly attachment into its neutral body frame BEFORE
      // the second leg arrives. These old owners are identical during walking;
      // forcing a calf transition here instead sheared the short pig ankle.
      // Head/neck skin is protected, and this body-owner transfer is smooth.
      const support = groups.get('neutral') ?? groups.values().next().value!;
      for (const group of groups.values())
        if (group !== support) {
          support.weight += group.weight * bridge;
          group.weight *= 1 - bridge;
        }
      const influences = [
        ...[...groups.values()].map(({ joint, weight }) => ({ joint, weight: weight * (1 - fit) })),
        ...ordered.slice(0, 2).flatMap((i) => {
          const weight = (fields[i] / total) * fit,
            base = starts.get(mesh.skeleton)! + i * 3;
          // The belly bridge needs one upper influence per competing leg.
          // Ease the dominant calf into that same upper influence before an
          // owner tie; no five-weight truncation seam and no virtual limb scale.
          // One continuous coordinate selects ADJACENT joints only: hoof (0),
          // calf (1), upper (2). Independent upper/hoof ramps can require three
          // new transforms while two old body owners still need their slots.
          const baseCoordinate = 1 - hoof + upper;
          const coordinate = i === ordered[0] ? baseCoordinate + (2 - baseCoordinate) * tie : 2;
          const footShare = Math.max(0, 1 - coordinate),
            upperShare = Math.max(0, coordinate - 1);
          return [
            { joint: base, weight: weight * upperShare },
            { joint: base + 1, weight: weight * (1 - footShare - upperShare) },
            { joint: base + 2, weight: weight * footShare },
          ];
        }),
      ].sort((a, b) => b.weight - a.weight);
      const discarded = influences.slice(4).reduce((sum, influence) => sum + influence.weight, 0);
      if (discarded > fitting.maximumDiscardedWeight) {
        fitting.maximumDiscardedWeight = discarded;
        fitting.witness = {
          v,
          point: point.toArray(),
          fields,
          groups: [...groups.entries()],
          influences,
        };
      }
      influences.length = 4;
      const sum = influences.reduce((n, influence) => n + influence.weight, 0);
      for (let n = 0; n < 4; n++) {
        indices.setComponent(v, n, influences[n].joint);
        weights.setComponent(v, n, influences[n].weight / sum);
      }
    }
    mesh.geometry = geometry;
    owned.push({ mesh, source, geometry });
  }
  const target = new THREE.Vector3(),
    direction = new THREE.Vector3(),
    knee = new THREE.Vector3();
  const along = new THREE.Vector3(),
    lowerAim = new THREE.Vector3(),
    parent = new THREE.Quaternion();
  const step = { forward: 0, lift: 0 };
  return {
    fitting,
    apply(phase: number, amount: number) {
      for (let i = 0; i < legs.length; i++) {
        const leg = legs[i];
        leg.upper.quaternion.identity();
        leg.lower.quaternion.identity();
        leg.hoof.quaternion.identity();
        if (amount <= 0) continue;
        sampleHoofStep(species, i, phase, step);
        target.copy(leg.sole);
        target.z += step.forward * amount;
        target.y += step.lift * amount;
        direction.subVectors(target, leg.hip);
        const u = leg.u.length(),
          l = leg.l.length(),
          distance = direction.length();
        // Never stretch a limb or silently install an unreachable target.
        if (distance >= u + l || distance <= Math.abs(u - l)) continue;
        direction.divideScalar(distance);
        const a = (u * u - l * l + distance * distance) / (2 * distance);
        const h = Math.sqrt(Math.max(0, u * u - a * a));
        along.set(0, -direction.z, direction.y);
        knee.copy(leg.hip).addScaledVector(direction, a).addScaledVector(along, h);
        leg.upper.quaternion
          .setFromUnitVectors(
            along.subVectors(knee, leg.hip).normalize(),
            direction.copy(leg.u).normalize()
          )
          .invert();
        lowerAim.subVectors(target, knee).normalize();
        parent.copy(leg.upper.quaternion).invert();
        leg.lower.quaternion.setFromUnitVectors(
          direction.copy(leg.l).normalize(),
          lowerAim.applyQuaternion(parent)
        );
        leg.hoof.quaternion.copy(leg.lower.quaternion).invert().multiply(parent);
      }
    },
    dispose() {
      for (const { mesh, source, geometry } of owned) {
        mesh.geometry = source;
        geometry.dispose();
      }
      model.remove(chainRoot);
    },
  };
}

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

      const walking =
        creature === 'chicken' ? createChickenWalk(model) : createQuadrupedWalk(model, creature);
      const resting =
        creature === 'horse'
          ? createHorseRestMotion(model)
          : creature === 'sheep'
            ? createSheepRestMotion(model)
            : null;
      return {
        model,
        bones,
        rest,
        resting,
        walking,
        skeletons: [...new Set(skinned.map((mesh) => mesh.skeleton))],
      };
    }, [scene, creature]);

    // Only private palettes and horse/sheep/cow/pig geometry are owned here.
    useEffect(
      () => () => {
        prepared.resting?.dispose();
        prepared.walking?.dispose();
        prepared.skeletons.forEach((skeleton) => skeleton.dispose());
      },
      [prepared]
    );

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
        if (prepared.walking) {
          prepared.walking.apply(stridePhase, strideAmount);
        } else if (strideAmount > 0.001 && spec.stride > 0) {
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
        setResting(seconds: number, seed: number) {
          prepared.resting?.apply(seconds, seed);
        },
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

    return <primitive object={prepared.model} dispose={null} />;
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
