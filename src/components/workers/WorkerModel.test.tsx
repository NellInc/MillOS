import React from 'react';
import { render, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { getWorkerAppearance, type WorkerMotionState } from './workerTypes';
import {
  SHARED_WORKER_ACCESSORY_MATERIALS,
  SHARED_WORKER_MATERIALS,
} from './SharedWorkerMaterials';
import {
  SHARED_WORKER_GEOMETRY,
  WORKER_HEARING_FIT,
  WORKER_HAIR_GEOMETRIES,
  createWorkerHairMotion,
} from './SharedWorkerGeometries';
import * as hairShapes from './SharedWorkerGeometries';
import * as workerPoses from './workerPose';
import { COMMUNITY_ROSTER } from '../../simulation/communityLife';
import { createWorkerBodyLod, WORKER_BODY_LOD } from './workerBodyLod';
import {
  createWorkerWrenchHead,
  createWorkerTrowelBlade,
  createWorkerLoafGeometry,
  WORKER_TOOL_GEOMETRIES,
  createWorkerSampleVial,
  createWorkerSampleScoop,
  createWorkerHandheldMount,
  ToolAccessory,
} from './WorkerTools';

const harness = vi.hoisted(() => ({
  frame: null as null | ((state: unknown, delta: number) => void),
  asset: null as unknown,
  clone: null as null | ((scene: THREE.Group) => THREE.Group),
}));
vi.mock('@react-three/fiber', () => ({
  useFrame: (callback: (state: unknown, delta: number) => void) => {
    harness.frame = callback;
  },
  createPortal: (children: React.ReactNode) => children,
}));
vi.mock('../../utils/dracoLoader', () => ({ useDracoGLTF: () => harness.asset }));
vi.mock('three/addons/utils/SkeletonUtils.js', () => ({
  clone: (scene: THREE.Group) => harness.clone?.(scene) ?? scene,
}));
import {
  WorkerModel,
  shareWorkerSkin,
  createWorkerAccessoryPair,
  createWorkerHairMaterial,
  createBakerApron,
  createWorkerLabCoat,
  setWorkerPupilBlink,
  setWorkerPupilPose,
  softenSharedWorkerGeometry,
  createSharedWorkerCuffSockets,
  softenWorkerFaceNormals,
  workerGaitRates,
} from '../models/WorkerModel';
import { createWorkerGarmentMotion } from './workerGarmentMotion';

afterEach(() => {
  cleanup();
  harness.clone = null;
  vi.restoreAllMocks();
});
describe('paused worker pose transitions', () => {
  it('changes task/seat poses without advancing clip time when paused', () => {
    const scene = new THREE.Group();
    const body = new THREE.Group();
    body.name = 'Body';
    const hips = new THREE.Group();
    hips.name = 'Hips';
    body.add(hips);
    scene.add(body);
    const clips = [
      'idle',
      'walk',
      'run',
      'break',
      'inspect',
      'repair',
      'supervise',
      'radio',
      'sample',
    ].map(
      (name, index) =>
        new THREE.AnimationClip(`worker-${name}`, 2, [
          new THREE.NumberKeyframeTrack('Body.position[y]', [0, 2], [index, index + 1]),
        ])
    );
    harness.asset = { scene, animations: clips };
    const motion: WorkerMotionState = {
      activity: 'working',
      groundSpeed: 0,
      seated: false,
      phase: Math.PI,
      enabled: false,
    };
    render(
      <WorkerModel
        appearance={getWorkerAppearance('Engineer', '', 'crew-engineer')}
        motion={motion}
      />
    );
    harness.frame?.({}, 1 / 60);
    expect(body.position.y).toBeCloseTo(4.5); // inspect at deterministic half phase
    harness.frame?.({}, 100);
    expect(body.position.y).toBeCloseTo(4.5); // no clock advance, even a huge frame delta
    motion.activity = 'idle';
    harness.frame?.({}, 1 / 60);
    expect(body.position.y).toBeCloseTo(0.5);
    motion.activity = 'break';
    motion.seated = true;
    harness.frame?.({}, 1 / 60);
    const seatedHeight = body.position.y;
    expect(seatedHeight).toBeGreaterThan(0.5);
    expect(seatedHeight).toBeLessThan(0.6);
    harness.frame?.({}, 10);
    expect(body.position.y).toBe(seatedHeight);
    motion.seated = false;
    motion.cycling = true;
    motion.cyclePhase = 0;
    harness.frame?.({}, 1 / 60);
    const cyclingHeight = body.position.y;
    expect(cyclingHeight).toBeGreaterThan(0.9);
    expect(cyclingHeight).toBeLessThan(1);
    motion.cyclePhase = Math.PI / 2;
    harness.frame?.({}, 100);
    expect(body.position.y).toBeCloseTo(cyclingHeight);
    motion.activity = 'working';
    motion.cycling = false;
    harness.frame?.({}, 1 / 60);
    expect(body.position.y).toBeCloseTo(4.5);
  });
});

function mountAnimatedWorker(activity: WorkerMotionState['activity'] = 'idle', speed = 0) {
  const scene = new THREE.Group();
  const body = new THREE.Group();
  body.name = 'Body';
  scene.add(body);
  const clips = ['idle', 'walk', 'run', 'break', 'inspect'].map(
    (name, index) =>
      new THREE.AnimationClip(`worker-${name}`, 20, [
        new THREE.NumberKeyframeTrack('Body.position[y]', [0, 20], [index, index + 1]),
      ])
  );
  harness.asset = { scene, animations: clips };
  const motion: WorkerMotionState = {
    activity,
    groundSpeed: speed,
    seated: false,
    phase: 0,
    enabled: true,
    animationInterval: 1 / 30,
  };
  render(
    <WorkerModel
      appearance={getWorkerAppearance('Engineer', '', 'crew-engineer')}
      motion={motion}
    />
  );
  return { motion, body };
}

describe('animation scheduling and freezing', () => {
  it('matches relaxed walking cadence to actual metres travelled, without a minimum-speed floor', () => {
    const action = vi.spyOn(THREE.AnimationAction.prototype, 'play');
    mountAnimatedWorker('walking', 1.1 / 6);
    harness.frame?.({}, 1 / 30);
    const walk = action.mock.contexts.find((a) => a.getClip().name === 'worker-walk')!;
    expect(walk.timeScale).toBeLessThan(0.2);
    expect(walk.timeScale).toBeGreaterThan(0);
  });

  it('keeps a time-lapsed walker walking, with cadence matched to the ground it covers', () => {
    // A 1.25 m/s walker on a clock running 4x standard covers 5 m per real second.
    const fast = workerGaitRates(5, 1.352, 2.935, 4);
    expect(fast.clip).toBe('worker-walk');
    expect(fast.walk).toBeCloseTo(5 / 1.352, 9);
    // The same ground speed at real time is a run.
    expect(workerGaitRates(5, 1.352, 2.935, 1).clip).toBe('worker-run');
    // Half pace plays the walk at half cadence, still feet-planted.
    const slow = workerGaitRates(0.625, 1.352, 2.935, 0.5);
    expect(slow.clip).toBe('worker-walk');
    expect(slow.walk).toBeCloseTo(0.625 / 1.352, 9);
    // The ordinary real-time ceilings still bound an untimed or invalid scale.
    for (const scale of [undefined, 0, -2, Number.NaN, Infinity]) {
      expect(workerGaitRates(9, 1.352, 2.935, scale).walk).toBe(1.9);
      expect(workerGaitRates(9, 1.352, 2.935, scale).run).toBe(2.4);
    }
    expect(workerGaitRates(2.9, 1.352, 2.935, 1, 'worker-run').clip).toBe('worker-run');
  });

  it('plays the walk clip at time-lapse cadence instead of breaking into a run', () => {
    const action = vi.spyOn(THREE.AnimationAction.prototype, 'play');
    const { motion } = mountAnimatedWorker('walking', 0);
    motion.groundSpeed = 5;
    motion.gaitScale = 4;
    harness.frame?.({}, 1 / 30);
    const walk = action.mock.contexts.find((a) => a.getClip().name === 'worker-walk')!;
    const run = action.mock.contexts.find((a) => a.getClip().name === 'worker-run')!;
    expect(walk.timeScale).toBeGreaterThan(1.9);
    expect(walk.getEffectiveWeight()).toBeGreaterThan(run.getEffectiveWeight());
  });

  it('samples distant skeletons at 30 Hz while preserving elapsed animation time', () => {
    const { motion } = mountAnimatedWorker();
    const update = vi.spyOn(THREE.AnimationMixer.prototype, 'update');
    harness.frame?.({}, 0); // establish initial semantic state
    update.mockClear();
    for (let i = 0; i < 120; i++) harness.frame?.({}, 1 / 120);
    expect(update).toHaveBeenCalledTimes(30);
    expect(update.mock.calls.reduce((total, [dt]) => total + dt, 0)).toBeCloseTo(1);
    motion.enabled = false;
    update.mockClear();
    for (let i = 0; i < 60; i++) harness.frame?.({}, 1 / 60);
    expect(update).not.toHaveBeenCalled();
    motion.activity = 'working';
    harness.frame?.({}, 1 / 60);
    expect(update).toHaveBeenCalledExactlyOnceWith(0);
  });
  it('preserves a running stride when paused, instead of switching to idle or walk', () => {
    const { motion, body } = mountAnimatedWorker('walking', 4);
    for (let i = 0; i < 60; i++) harness.frame?.({}, 1 / 60);
    const before = body.position.y;
    motion.enabled = false;
    motion.groundSpeed = 0;
    harness.frame?.({}, 1 / 60);
    expect(body.position.y).toBe(before);
  });
  it('keeps cycling skeletons on the exact per-frame pedal phase', () => {
    const { motion } = mountAnimatedWorker();
    motion.cycling = true;
    const update = vi.spyOn(THREE.AnimationMixer.prototype, 'update');
    for (let i = 0; i < 12; i++) {
      motion.cyclePhase = i / 10;
      harness.frame?.({}, 1 / 120);
    }
    expect(update).toHaveBeenCalledTimes(12);
  });
});

describe('real authored duty and gait transitions', () => {
  for (const bodyType of ['masculine', 'feminine'] as const)
    it(`${bodyType} leaves a supported work stance smoothly and preserves horizontal gait and anatomy`, async () => {
      const { readFileSync } = await import('node:fs');
      const { NodeIO } = await import('@gltf-transform/core');
      const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions');
      const { default: draco3d } = await import('draco3dgltf');
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      const { clone } = await vi.importActual<typeof import('three/addons/utils/SkeletonUtils.js')>(
        'three/addons/utils/SkeletonUtils.js'
      );
      const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
        'draco3d.decoder': await draco3d.createDecoderModule(),
      });
      const document = await io.readBinary(
        new Uint8Array(readFileSync(`public/models/worker/worker-${bodyType}.glb`))
      );
      for (const extension of document.getRoot().listExtensionsUsed()) extension.dispose();
      const bytes = await io.writeBinary(document);
      const asset = await new GLTFLoader().parseAsync(bytes.buffer as ArrayBuffer, '');
      // The foot targets are independent bones. Measure the actual neutral
      // calf endpoint so interpolation cannot silently open an ankle seam.
      const neutral = clone(asset.scene),
        neutralMixer = new THREE.AnimationMixer(neutral);
      neutralMixer.clipAction(asset.animations.find((c) => c.name === 'worker-break')!).play();
      neutralMixer.update(0);
      neutral.updateMatrixWorld(true);
      const calfEnds = ['L', 'R'].map((side) =>
        neutral
          .getObjectByName('LowerLeg' + side)!
          .worldToLocal(
            neutral.getObjectByName('Foot' + side)!.getWorldPosition(new THREE.Vector3())
          )
      );
      neutralMixer.stopAllAction();
      neutralMixer.uncacheRoot(neutral);
      let model: THREE.Object3D | undefined;
      harness.clone = (source) => {
        model = clone(source);
        return model as THREE.Group;
      };
      harness.asset = asset;
      const play = vi.spyOn(THREE.AnimationAction.prototype, 'play');
      const makePose = workerPoses.createSeatedWorkerPose;
      let closureCalls = 0,
        inheritedReachMisses = 0,
        maxCutoffCorrection = 0;
      vi.spyOn(workerPoses, 'createSeatedWorkerPose').mockImplementation((...args) => {
        const pose = makePose(...args),
          close = pose.closeDutyTransition;
        pose.closeDutyTransition = (amount) => {
          const feet = ['L', 'R'].map((side) => args[0].getObjectByName('Foot' + side)!);
          const before = feet.map((foot) => foot.matrixWorld.elements.slice());
          const knees = ['L', 'R'].map((side) => args[0].getObjectByName('LowerLeg' + side)!);
          const beforeKnees = knees.map((knee) => knee.getWorldPosition(new THREE.Vector3()));
          const reachable = close(amount);
          if (!reachable) {
            // The unchanged gait itself has sub-3 mm endpoint error near full
            // extension. Preserve that source pose rather than lengthening a shin.
            expect(
              Math.min(amount, 1 - amount),
              'reach miss confined to source endpoint'
            ).toBeLessThan(0.02);
            knees.forEach((knee, i) =>
              expect(
                knee
                  .localToWorld(calfEnds[i].clone())
                  .distanceTo(feet[i].getWorldPosition(new THREE.Vector3()))
              ).toBeLessThan(0.003)
            );
            inheritedReachMisses++;
          }
          feet.forEach((foot, i) => expect(foot.matrixWorld.elements).toEqual(before[i]));
          if (Math.min(amount, 1 - amount) < 0.0001)
            knees.forEach(
              (knee, i) =>
                (maxCutoffCorrection = Math.max(
                  maxCutoffCorrection,
                  knee.getWorldPosition(new THREE.Vector3()).distanceTo(beforeKnees[i])
                ))
            );
          closureCalls++;
          return reachable;
        };
        return pose;
      });
      const motion: WorkerMotionState = {
        activity: 'working',
        groundSpeed: 0,
        seated: false,
        enabled: true,
        phase: bodyType === 'masculine' ? 0 : 3.462,
      };
      const view = render(
        <WorkerModel
          appearance={{ ...getWorkerAppearance('Engineer', '', 'duty-transition'), bodyType }}
          motion={motion}
        />
      );
      // Match the established portal mock: DOM refs do not have Three positions.
      const tool = view.container.querySelector(
        '[name="worker-held-tool"]'
      ) as unknown as THREE.Group;
      tool.position = new THREE.Vector3();
      const camera = new THREE.PerspectiveCamera();
      camera.position.set(0, 1.7, 5);
      const positions = () =>
        ['FootL', 'FootR'].map((n) =>
          model!.getObjectByName(n)!.getWorldPosition(new THREE.Vector3())
        );
      let before = positions(),
        largestStep = 0,
        largestAnkleSeam = 0;
      for (let frame = 0; frame < 480; frame++) {
        if (frame === 30) {
          motion.activity = 'walking';
          motion.groundSpeed = 1.1;
        }
        if (frame === 150) {
          motion.activity = 'working';
          motion.groundSpeed = 0;
        }
        if (frame === 240) motion.activity = 'idle';
        if (frame === 360) motion.activity = 'working';
        harness.frame?.({ camera }, 1 / 60);
        model!.updateMatrixWorld(true);
        const feet = positions();
        feet.forEach((p, i) => {
          largestStep = Math.max(largestStep, p.distanceTo(before[i]));
          const lower = model!.getObjectByName('LowerLeg' + ['L', 'R'][i])!;
          largestAnkleSeam = Math.max(
            largestAnkleSeam,
            lower.localToWorld(calfEnds[i].clone()).distanceTo(p)
          );
        });
        before = feet;
        if (frame === 145) {
          const walk = play.mock.contexts.find((a) => a.getClip().name === 'worker-walk')!;
          expect(walk.getEffectiveWeight()).toBeGreaterThan(0.999999);
          const control = clone(asset.scene),
            mixer = new THREE.AnimationMixer(control);
          const action = mixer
            .clipAction(asset.animations.find((c) => c.name === 'worker-walk')!)
            .play();
          action.time = walk.time;
          mixer.update(0);
          control.updateMatrixWorld(true);
          for (const name of [
            'FootL',
            'FootR',
            'UpperLegL',
            'LowerLegL',
            'UpperLegR',
            'LowerLegR',
          ]) {
            const actualBone = model!.getObjectByName(name)!,
              expectedBone = control.getObjectByName(name)!;
            if (name.startsWith('Foot'))
              actualBone.matrixWorld.elements.forEach((v, i) => {
                const delta = v - expectedBone.matrixWorld.elements[i];
                if (i === 13) {
                  expect(delta, `${name} bounded ground correction`).toBeGreaterThanOrEqual(-1e-6);
                  expect(delta).toBeLessThan(0.035);
                } else
                  expect(Math.abs(delta), `${name} original horizontal gait`).toBeLessThan(1e-6);
              });
            else {
              expect(actualBone.position.toArray()).toEqual(expectedBone.position.toArray());
              expect(actualBone.scale.toArray()).toEqual(expectedBone.scale.toArray());
            }
          }
          mixer.stopAllAction();
          mixer.uncacheRoot(control);
        }
      }
      process.stderr.write(
        JSON.stringify({
          bodyType,
          largestStep,
          largestAnkleSeam,
          closureCalls,
          inheritedReachMisses,
          maxCutoffCorrection,
        }) + '\n'
      );
      expect(closureCalls).toBeGreaterThan(100);
      expect(maxCutoffCorrection, 'continuous near pure-clip endpoints').toBeLessThan(0.001);
      expect(largestStep, 'continuous work/gait handover').toBeLessThan(0.08);
      expect(largestAnkleSeam, 'calf meets independent ankle through interpolation').toBeLessThan(
        0.02
      );
      const feet = positions();
      expect(Math.abs(feet[0].z - feet[1].z)).toBeLessThan(0.06);
      for (const name of ['LowerLegL', 'LowerLegR'])
        expect(model!.getObjectByName(name)!.scale.toArray()).toEqual([1, 1, 1]);
      motion.enabled = false;
      harness.frame?.({ camera }, 0);
      const paused = positions();
      harness.frame?.({ camera }, 10);
      positions().forEach((p, i) => expect(p.distanceTo(paused[i])).toBeLessThan(1e-9));
    }, 30000);
});

describe('worker skin sharing', () => {
  it('keeps one cloned skeleton per compatible skin without sharing between people', async () => {
    const { clone } = await vi.importActual<typeof import('three/addons/utils/SkeletonUtils.js')>(
      'three/addons/utils/SkeletonUtils.js'
    );
    const source = new THREE.Group();
    const body = new THREE.Bone();
    body.name = 'Body';
    const hips = new THREE.Bone();
    hips.name = 'Hips';
    body.add(hips);
    source.add(body);
    source.updateMatrixWorld(true);
    const skin = new THREE.Skeleton([body, hips]);
    for (let i = 0; i < 2; i++) {
      const mesh = new THREE.SkinnedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
      mesh.name = `worker-part-${i}`;
      mesh.bind(skin);
      source.add(mesh);
    }
    const clones: THREE.Group[] = [];
    harness.clone = (scene) => {
      const model = clone(scene);
      clones.push(model);
      return model;
    };
    harness.asset = { scene: source, animations: [] };
    const motion: WorkerMotionState = {
      activity: 'idle',
      groundSpeed: 0,
      seated: false,
      phase: 0,
      enabled: false,
    };
    render(
      <>
        <WorkerModel
          appearance={getWorkerAppearance('Engineer', '', 'engineer-one')}
          motion={motion}
        />
        <WorkerModel
          appearance={getWorkerAppearance('Engineer', '', 'engineer-two')}
          motion={motion}
        />
      </>
    );
    expect(clones).toHaveLength(2);
    const parts = clones.map((model) =>
      [0, 1].map((i) => model.getObjectByName(`worker-part-${i}`) as THREE.SkinnedMesh)
    );
    for (const [first, second] of parts) {
      expect(first.skeleton.bones[0]).toBe(second.skeleton.bones[0]);
      expect(first.skeleton).toBe(second.skeleton);
      expect(first.bindMatrix.equals(second.bindMatrix)).toBe(true);
    }
    expect(parts[0][0].skeleton).not.toBe(parts[1][0].skeleton);
    expect(parts[0][0].skeleton.bones[0]).not.toBe(parts[1][0].skeleton.bones[0]);
    expect(parts[0][0].skeleton.bones[0]).not.toBe(body);
    expect(source.getObjectByName('worker-part-0')).toHaveProperty('skeleton', skin);
  });
});

it('preserves distinct bind poses, bone order and independently owned bones', () => {
  const root = new THREE.Group();
  const bones = [new THREE.Bone(), new THREE.Bone()];
  const first = new THREE.Skeleton(bones);
  const reordered = new THREE.Skeleton([...bones].reverse());
  const independent = new THREE.Skeleton([new THREE.Bone(), new THREE.Bone()]);
  const differentBind = first.clone();
  differentBind.boneInverses = first.boneInverses.map((inverse) => inverse.clone());
  differentBind.boneInverses[0].makeTranslation(0, 1, 0);
  const meshes = [first, reordered, independent, differentBind].map((skin) => {
    const mesh = new THREE.SkinnedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    mesh.bind(skin, new THREE.Matrix4());
    root.add(mesh);
    return mesh;
  });
  expect(shareWorkerSkin(root)).toHaveLength(4);
  expect(meshes.map((mesh) => mesh.skeleton)).toEqual([
    first,
    reordered,
    independent,
    differentBind,
  ]);
});

it('retains per-mesh bind matrices and disposes only a redundant private palette', () => {
  const root = new THREE.Group();
  const bones = [new THREE.Bone()];
  const first = new THREE.Skeleton(bones);
  const duplicate = first.clone();
  const a = new THREE.SkinnedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  const b = new THREE.SkinnedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  a.bind(first, new THREE.Matrix4());
  b.bind(duplicate, new THREE.Matrix4().makeTranslation(0, 1, 0));
  root.add(a, b);
  const bind = b.bindMatrix.clone(),
    inverse = b.bindMatrixInverse.clone();
  const disposeDuplicate = vi.spyOn(duplicate, 'dispose');
  const disposeFirst = vi.spyOn(first, 'dispose');
  expect(shareWorkerSkin(root)).toEqual([first]);
  expect(b.skeleton).toBe(first);
  expect(b.bindMatrix.equals(bind)).toBe(true);
  expect(b.bindMatrixInverse.equals(inverse)).toBe(true);
  expect(disposeDuplicate).toHaveBeenCalledExactlyOnceWith();
  expect(disposeFirst).not.toHaveBeenCalled();
  expect(shareWorkerSkin(root)).toEqual([first]);
  expect(disposeDuplicate).toHaveBeenCalledTimes(1);
});

it('keeps shared fittings alive when one worker leaves and disposes individual accents', () => {
  harness.asset = { scene: new THREE.Group(), animations: [] };
  harness.clone = () => new THREE.Group();
  const motion: WorkerMotionState = {
    activity: 'idle',
    groundSpeed: 0,
    seated: false,
    phase: 0,
    enabled: false,
  };
  const engineer = getWorkerAppearance('Engineer', '', 'shared-fittings-engineer');
  const operator = getWorkerAppearance('Operator', '', 'shared-fittings-operator');
  const dispose = vi.spyOn(THREE.Material.prototype, 'dispose');
  const first = render(<WorkerModel appearance={engineer} motion={{ ...motion }} />);
  const second = render(<WorkerModel appearance={operator} motion={{ ...motion }} />);
  first.unmount();
  expect(dispose).toHaveBeenCalledTimes(1);
  const firstAccent = dispose.mock.contexts[0] as THREE.MeshStandardMaterial;
  expect(firstAccent.color.equals(new THREE.Color(engineer.accentColor))).toBe(true);
  expect(Object.values(SHARED_WORKER_ACCESSORY_MATERIALS)).not.toContain(firstAccent);
  second.unmount();
  expect(dispose).toHaveBeenCalledTimes(2);
  const secondAccent = dispose.mock.contexts[1] as THREE.MeshStandardMaterial;
  expect(secondAccent).not.toBe(firstAccent);
  expect(secondAccent.color.equals(new THREE.Color(operator.accentColor))).toBe(true);
  expect(Object.values(SHARED_WORKER_ACCESSORY_MATERIALS)).not.toContain(secondAccent);
});

function bodyFixture() {
  const model = new THREE.Group();
  const bone = new THREE.Bone();
  model.add(bone);
  const skin = new THREE.Skeleton([bone]);
  const sources = Array.from({ length: 5 }, (_, i) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([i, 0, 0, i, 1, 0, i, 0, 1], 3)
    );
    geometry.setAttribute(
      'normal',
      new THREE.Float32BufferAttribute([1, 0, 0, 1, 0, 0, 1, 0, 0], 3)
    );
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(12), 4));
    geometry.setAttribute(
      'skinWeight',
      new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4)
    );
    geometry.setIndex([0, 1, 2]);
    const material = new THREE.MeshStandardMaterial({
      color: i % 2 ? '#193a83' : '#e6bf84',
      side: THREE.DoubleSide,
    });
    material.visible = i !== 4; // A person whose authored hat is hidden.
    const mesh = new THREE.SkinnedMesh(geometry, material);
    mesh.castShadow = i !== 3;
    mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 6);
    mesh.bind(skin, new THREE.Matrix4());
    model.add(mesh);
    return mesh;
  });
  return { model, bone, skin, sources };
}

describe('distant worker body draws', () => {
  it('retains vertices, skin, linear role colours and the feet shadow contract', () => {
    const { model, bone, skin, sources } = bodyFixture();
    const inverses = skin.boneInverses.map((matrix) => matrix.clone());
    const lod = createWorkerBodyLod(model)!;
    expect(lod.meshes).toHaveLength(2);
    expect(lod.sources).toEqual(sources.slice(0, 4));
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 0, 100);
    lod.update(camera);
    expect(sources.map((mesh) => mesh.visible)).toEqual([false, false, false, false, true]);
    expect(sources[4].material).toHaveProperty('visible', false);
    expect(lod.meshes.map((mesh) => [mesh.visible, mesh.castShadow])).toEqual([
      [true, true],
      [true, false],
    ]);
    bone.position.y = 2;
    model.updateMatrixWorld(true);
    skin.update();
    let offset = 0;
    for (const source of sources.slice(0, 3)) {
      const merged = lod.meshes[0];
      for (let i = 0; i < 3; i++) {
        expect(merged.getVertexPosition(offset + i, new THREE.Vector3()).toArray()).toEqual(
          source.getVertexPosition(i, new THREE.Vector3()).toArray()
        );
        expect(merged.geometry.getAttribute('color').getX(offset + i)).toBeCloseTo(
          (source.material as THREE.MeshStandardMaterial).color.r
        );
      }
      offset += 3;
    }
    expect(lod.meshes[0].geometry.getAttribute('position').count).toBe(9);
    expect(lod.meshes[1].geometry.getAttribute('position').count).toBe(3);
    expect(lod.meshes.every((mesh) => mesh.skeleton === skin)).toBe(true);
    expect(skin.boneInverses.every((matrix, i) => matrix.equals(inverses[i]))).toBe(true);
    const disposeSkin = vi.spyOn(skin, 'dispose');
    const disposeSource = vi.spyOn(sources[0].geometry, 'dispose');
    const disposeFar = vi.spyOn(lod.meshes[0].geometry, 'dispose');
    lod.dispose();
    expect(disposeFar).toHaveBeenCalledTimes(1);
    expect(disposeSource).not.toHaveBeenCalled();
    expect(disposeSkin).not.toHaveBeenCalled();
  });

  it('switches paused workers with hysteresis and camera zoom, without affecting another rig', () => {
    const first = bodyFixture();
    const second = bodyFixture();
    const other = createWorkerBodyLod(second.model)!;
    harness.asset = { scene: first.model, animations: [] };
    const motion: WorkerMotionState = {
      activity: 'idle',
      groundSpeed: 0,
      seated: false,
      phase: 0,
      enabled: false,
    };
    render(
      <WorkerModel appearance={getWorkerAppearance('Engineer', '', 'lod-paused')} motion={motion} />
    );
    const camera = new THREE.PerspectiveCamera();
    const sample = (distance: number, zoom = 1) => {
      camera.position.z = distance;
      camera.zoom = zoom;
      for (let i = 0; i < WORKER_BODY_LOD.sampleEveryFrames; i++) harness.frame?.({ camera }, 0);
    };
    sample(100);
    expect(first.sources[0].visible).toBe(false);
    sample(75);
    expect(first.sources[0].visible).toBe(false);
    sample(100, 2);
    expect(first.sources[0].visible).toBe(true);
    sample(75);
    expect(first.sources[0].visible).toBe(true);
    expect(second.sources[0].visible).toBe(true);
    expect(other.meshes[0].visible).toBe(false);
    other.dispose();
  });

  it('keeps the full renderer for incompatible binds or mapped surfaces', () => {
    const fixture = bodyFixture();
    fixture.sources[0].bindMatrix.makeTranslation(1, 0, 0);
    expect(createWorkerBodyLod(fixture.model)).toBeNull();
    fixture.sources[0].bindMatrix.identity();
    (fixture.sources[0].material as THREE.MeshStandardMaterial).map = new THREE.Texture();
    expect(createWorkerBodyLod(fixture.model)).toBeNull();
    expect(fixture.sources.every((mesh) => mesh.visible)).toBe(true);
  });
});

it.each([
  {
    kind: 'glasses-temples' as const,
    x: 0.084,
    z: -0.052,
    scale: [1, 1, 1],
    rotationZ: 0,
  },
  { kind: 'hearing-cups' as const, x: 0.104, z: 0, scale: [1, 1, 1], rotationZ: Math.PI / 2 },
  { kind: 'vest-strips' as const, x: 0.078, z: 0, scale: [0.018, 0.135, 0.008], rotationZ: 0 },
])('retains both $kind through moving bone poses without disposing borrowed resources', (spec) => {
  const material = new THREE.MeshPhysicalMaterial();
  const pair = createWorkerAccessoryPair(spec.kind, material);
  const geometryDispose = vi.spyOn(pair.geometry, 'dispose');
  const materialDispose = vi.spyOn(material, 'dispose');
  const bone = new THREE.Bone();
  const person = new THREE.Group();
  person.add(bone);
  bone.add(pair);
  const originals = [-spec.x, spec.x].map((x) => {
    const mesh = new THREE.Mesh(pair.geometry, material);
    mesh.position.set(x, 0, spec.z);
    mesh.scale.fromArray(spec.scale);
    mesh.rotation.z = spec.kind === 'hearing-cups' && x > 0 ? -spec.rotationZ : spec.rotationZ;
    bone.add(mesh);
    return mesh;
  });
  expect(pair.count).toBe(2);
  expect(pair.matrixAutoUpdate).toBe(false);
  expect(pair.matrixWorldAutoUpdate).toBe(true);
  expect(pair.castShadow).toBe(false);
  expect(pair.receiveShadow).toBe(false);
  const positions = pair.geometry.getAttribute('position');
  for (const phase of [0, 0.7, 1.4]) {
    person.position.set(9 + phase, 1, -6);
    person.rotation.y = phase;
    bone.position.set(0, 1 + Math.sin(phase), 0.12);
    bone.rotation.set(phase * 0.4, 0, phase * 0.2);
    person.updateMatrixWorld(true);
    for (const [index, original] of originals.entries()) {
      const instance = new THREE.Matrix4();
      pair.getMatrixAt(index, instance);
      const world = pair.matrixWorld.clone().multiply(instance);
      for (let vertex = 0; vertex < positions.count; vertex++) {
        const p = new THREE.Vector3().fromBufferAttribute(positions, vertex);
        expect(
          p.clone().applyMatrix4(world).distanceTo(p.applyMatrix4(original.matrixWorld))
        ).toBeLessThan(1e-7);
      }
    }
    const expected = new THREE.Box3();
    originals.forEach((mesh) => expected.union(new THREE.Box3().setFromObject(mesh)));
    const actual = new THREE.Box3().setFromObject(pair);
    expect(actual.min.distanceTo(expected.min)).toBeLessThan(1e-7);
    expect(actual.max.distanceTo(expected.max)).toBeLessThan(1e-7);
  }
  pair.dispose();
  expect(geometryDispose).not.toHaveBeenCalled();
  expect(materialDispose).not.toHaveBeenCalled();
});

it('dresses residents in matte cloth without an industrial badge, while retaining worker PPE', () => {
  for (const role of ['Resident', 'Operator']) {
    const scene = new THREE.Group();
    const body = new THREE.Group();
    body.name = 'Worker_Body';
    scene.add(body);
    for (const name of ['Head', 'Chest']) {
      const bone = new THREE.Group();
      bone.name = name;
      scene.add(bone);
    }
    const vest = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    vest.material.name = 'Worker_Vest';
    body.add(vest);
    const strap = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    strap.material.name = 'Worker_Yellow';
    body.add(strap);
    harness.asset = { scene, animations: [] };
    const appearance = getWorkerAppearance(role, '#596e72', 'wardrobe-' + role);
    const motion: WorkerMotionState = {
      activity: 'idle',
      groundSpeed: 0,
      seated: false,
      phase: 0,
      enabled: false,
    };
    const view = render(<WorkerModel appearance={appearance} motion={motion} />);
    expect(!!view.container.querySelector('[name="worker-identity-badge"]')).toBe(
      role === 'Operator'
    );
    expect(vest.material.roughness).toBe(role === 'Operator' ? 0.6 : 0.86);
    expect(strap.material.roughness).toBe(role === 'Operator' ? 0.48 : 0.86);
    expect(strap.material.color.equals(new THREE.Color(appearance.hatColor))).toBe(
      role === 'Operator'
    );
    const glasses = view.container.querySelector('[name="worker-safety-glasses"]');
    expect(!!glasses).toBe(appearance.hasSafetyGlasses);
    if (glasses)
      expect(Number(glasses.getAttribute('position')?.split(',')[1])).toBeGreaterThan(0.09);
    view.unmount();
  }
});

it('uses the declared glove flag, zero extra hand draws and two-draw far LOD, then disposes only owned geometry', () => {
  for (const role of ['Operator', 'Engineer', 'Quality Control', 'Resident']) {
    const f = bodyFixture();
    f.bone.name = 'WristL';
    const torso = new THREE.Bone();
    torso.name = 'Chest';
    f.model.add(torso);
    const skin = new THREE.Skeleton([f.bone, torso]);
    const body = new THREE.Group();
    body.name = 'Worker_Body';
    f.model.add(body);
    const source = f.sources[0];
    body.add(source);
    const feet = new THREE.Group();
    feet.name = 'Worker_Feet';
    f.model.add(feet);
    feet.add(f.sources[3]);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1, 1], 3)
    );
    geometry.setAttribute(
      'normal',
      new THREE.Float32BufferAttribute(Array(6).fill([0, 0, 1]).flat(), 3)
    );
    geometry.setAttribute(
      'skinIndex',
      new THREE.Uint16BufferAttribute(
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
        4
      )
    );
    geometry.setAttribute(
      'skinWeight',
      new THREE.Float32BufferAttribute(Array(6).fill([1, 0, 0, 0]).flat(), 4)
    );
    geometry.setIndex([0, 1, 2, 3, 4, 5]);
    source.geometry = geometry;
    for (const m of f.sources) m.bind(skin, new THREE.Matrix4());
    (source.material as THREE.Material).name = 'Skin';
    const borrowed = vi.spyOn(geometry, 'dispose');
    harness.asset = { scene: f.model, animations: [] };
    const appearance = {
      ...getWorkerAppearance(role, '', 'gloves-' + role),
      tool: 'none' as const,
    };
    const view = render(
      <WorkerModel
        appearance={appearance}
        motion={{ activity: 'idle', groundSpeed: 0, seated: false, phase: 0, enabled: false }}
      />
    );
    expect(!!source.userData.workerGloves).toBe(appearance.hasGloves);
    expect(f.model.getObjectByName('worker-skinned-gloves')).toBeUndefined();
    expect(source.geometry.index!.count).toBe(6);
    if (appearance.hasGloves) {
      expect((source.material as THREE.MeshStandardMaterial).vertexColors).toBe(true);
      const bodyDispose = vi.spyOn(source.geometry, 'dispose');
      const camera = new THREE.PerspectiveCamera();
      camera.position.z = 100;
      for (let i = 0; i < 12; i++) harness.frame?.({ camera }, 0);
      expect(source.visible).toBe(false);
      const far: THREE.Mesh[] = [];
      f.model.traverse((o) => {
        if (['worker-distant-body', 'worker-distant-feet'].includes(o.name))
          far.push(o as THREE.Mesh);
      });
      expect(far.filter((m) => m.visible)).toHaveLength(2);
      camera.position.z = 5;
      for (let i = 0; i < 12; i++) harness.frame?.({ camera }, 0);
      expect(source.visible).toBe(true);
      view.unmount();
      expect(bodyDispose).toHaveBeenCalledOnce();
    } else view.unmount();
    expect(borrowed).not.toHaveBeenCalled();
  }
});

it('animates the renamed actual eye surface and freezes its closure through disabled semantic changes', () => {
  const scene = new THREE.Group();
  const head = new THREE.Group();
  head.name = 'Head';
  scene.add(head);
  const eyeRoot = new THREE.Group();
  eyeRoot.name = 'Worker_Head';
  scene.add(eyeRoot);
  const source = new THREE.BoxGeometry(0.11, 0.025, 0.009);
  source.translate(0, 0.103, 0.112);
  const eye = new THREE.Mesh(source, new THREE.MeshStandardMaterial());
  eye.material.name = 'Brown';
  eyeRoot.add(eye);
  harness.asset = { scene, animations: [] };
  const motion: WorkerMotionState = {
    activity: 'working',
    groundSpeed: 0,
    seated: false,
    phase: 1.72,
    enabled: true,
  };
  const view = render(
    <WorkerModel
      appearance={{ ...getWorkerAppearance('Engineer', '', 'w2'), tool: 'none' }}
      motion={motion}
    />
  );
  expect(eye.userData.workerBlink).toBe(true);
  expect(eye.geometry).not.toBe(source);
  harness.frame?.({}, 0.03);
  const closed = Array.from(eye.geometry.attributes.position.array);
  expect(closed).not.toEqual(Array.from(source.attributes.position.array));
  motion.enabled = false;
  harness.frame?.({}, 100);
  expect(Array.from(eye.geometry.attributes.position.array)).toEqual(closed);
  motion.activity = 'idle';
  harness.frame?.({}, 100);
  expect(Array.from(eye.geometry.attributes.position.array)).toEqual(closed);
  motion.enabled = true;
  for (let i = 0; i < 4; i++) harness.frame?.({}, 0.075);
  expect(Array.from(eye.geometry.attributes.position.array)).toEqual(
    Array.from(source.attributes.position.array)
  );
  view.unmount();
  expect(eye.geometry).toBe(source);
});

it('closes the existing pupil instances without moving their centres or scaling the bone mount', () => {
  const pair = createWorkerAccessoryPair('eye-pupils', SHARED_WORKER_ACCESSORY_MATERIALS.dark);
  const before = Array.from(pair.instanceMatrix.array);
  for (const closure of [0.3, 1, 0]) {
    setWorkerPupilBlink(pair, closure);
    for (let instance = 0; instance < 2; instance++) {
      expect(pair.instanceMatrix.array[instance * 16 + 5]).toBeCloseTo(
        0.008 * (1 - closure * 0.92),
        8
      );
      for (const element of [0, 10, 12, 13, 14])
        expect(pair.instanceMatrix.array[instance * 16 + element]).toBe(
          before[instance * 16 + element]
        );
    }
    expect(pair.visible).toBe(closure < 0.5);
    expect(pair.scale.toArray()).toEqual([1, 1, 1]);
  }
  expect(Array.from(pair.instanceMatrix.array)).toEqual(before);
  pair.dispose();
});

it('face normals retain sharp corners and incompatible skin seams', () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12), 3));
  geometry.setAttribute(
    'normal',
    new THREE.Float32BufferAttribute([0, 1, 0, 0.3, 0.954, 0, 1, 0, 0, -0.3, 0.954, 0], 3)
  );
  geometry.setAttribute(
    'skinIndex',
    new THREE.Uint16BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0], 4)
  );
  geometry.setAttribute(
    'skinWeight',
    new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4)
  );
  const result = softenWorkerFaceNormals(geometry)!;
  const v = (g: THREE.BufferGeometry, i: number) =>
    new THREE.Vector3().fromBufferAttribute(g.getAttribute('normal'), i).normalize();
  expect(v(result, 0).x).toBeGreaterThan(0.05);
  expect(v(result, 2).distanceTo(v(geometry, 2))).toBe(0);
  expect(v(result, 3).distanceTo(v(geometry, 3))).toBeLessThan(0.000001);
  const sourceDispose = vi.spyOn(geometry, 'dispose');
  result.dispose();
  expect(sourceDispose).not.toHaveBeenCalled();
});

it('mounted face finish disposes only its private geometry', () => {
  const source = new THREE.BoxGeometry(),
    scene = new THREE.Group(),
    head = new THREE.Group();
  head.name = 'Worker_Head';
  const material = new THREE.MeshStandardMaterial();
  material.name = 'Skin';
  const mesh = new THREE.Mesh(source, material);
  head.add(mesh);
  scene.add(head);
  harness.asset = { scene, animations: [] };
  const sourceDispose = vi.spyOn(source, 'dispose'),
    materialDispose = vi.spyOn(material, 'dispose');
  const { unmount } = render(
    <WorkerModel
      appearance={getWorkerAppearance('Shopkeeper', '', 'village-shopkeeper')}
      motion={{ activity: 'idle', groundSpeed: 0, seated: false, phase: 0, enabled: false }}
    />
  );
  const privateGeometry = mesh.geometry,
    ownedDispose = vi.spyOn(privateGeometry, 'dispose');
  expect(privateGeometry).not.toBe(source);
  expect(mesh.userData.workerSoftFace).toBe(true);
  unmount();
  expect(ownedDispose).toHaveBeenCalledOnce();
  expect(sourceDispose).not.toHaveBeenCalled();
  expect(materialDispose).not.toHaveBeenCalled();
});

describe('authored held work props', () => {
  const ray = (g: THREE.BufferGeometry, x: number, y: number) => {
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const hits = new THREE.Raycaster(
      new THREE.Vector3(x, y, 1),
      new THREE.Vector3(0, 0, -1)
    ).intersectObject(new THREE.Mesh(g, material));
    material.dispose();
    return hits;
  };
  it('keeps cached fittings finite and seats paper, screen, vials and bread on their real supports', () => {
    const g = WORKER_TOOL_GEOMETRIES;
    for (const family of Object.values(g))
      for (const part of Object.values(family)) {
        for (const a of Object.values(part.attributes))
          expect(Array.from(a.array).every(Number.isFinite)).toBe(true);
        part.computeBoundingBox();
      }
    expect(g.clipboard.board.boundingBox!.max.z).toBeCloseTo(0.0075, 6);
    expect(0.0085 + g.clipboard.paper.boundingBox!.min.z).toBeCloseTo(0.0075, 6);
    expect(0.01 + g.clipboard.line.boundingBox!.min.z).toBeCloseTo(
      0.0085 + g.clipboard.paper.boundingBox!.max.z,
      6
    );
    expect(0.07 + g.clipboard.clip.boundingBox!.min.y).toBeLessThan(0.05); // clip extends onto paper
    const jaw = ray(g.clipboard.clip, 0, -0.022);
    expect(jaw[jaw.length - 1].point.z + 0.01).toBeCloseTo(
      0.0085 + g.clipboard.paper.boundingBox!.max.z,
      6
    );
    expect(0.006 + g.tablet.screen.boundingBox!.min.z).toBeCloseTo(
      g.tablet.body.boundingBox!.max.z,
      6
    );
    expect(g.sampleKit.tray.boundingBox!.max.y).toBeCloseTo(0.0125, 6); // shared bread support
    expect(0.045 + g.sampleKit.vial.boundingBox!.min.y).toBeLessThanOrEqual(
      g.sampleKit.tray.boundingBox!.max.y
    );
    expect(0.045 + g.sampleKit.vial.boundingBox!.min.y).toBeGreaterThan(0.009);
    expect(0.041 + g.sampleKit.cap.boundingBox!.min.y).toBeCloseTo(
      g.sampleKit.vial.boundingBox!.max.y,
      6
    );
    expect(SHARED_WORKER_MATERIALS.lensBlue.depthWrite).toBe(false);
  });
  it('models actual vial interiors and concave scoop surfaces rather than solid blocks', () => {
    const vial = createWorkerSampleVial(),
      scoop = createWorkerSampleScoop();
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const base = new THREE.Raycaster(
      new THREE.Vector3(0, 0.1, 0),
      new THREE.Vector3(0, -1, 0)
    ).intersectObject(new THREE.Mesh(vial, material))[0];
    expect(base.point.y).toBeCloseTo(-0.028, 6);
    expect(ray(scoop, 0, 0.025)[0].point.z).toBeCloseTo(-0.001, 6);
    expect(ray(scoop, 0.011, 0.025)[0].point.z).toBeCloseTo(0.005, 6);
    expect(ray(scoop, 0, -0.035).length).toBeGreaterThan(0);
    scoop.computeBoundingBox();
    expect(scoop.boundingBox!.max.y).toBeCloseTo(0.045, 6);
    expect(scoop.boundingBox!.min.y).toBeCloseTo(-0.045, 6);
    vial.dispose();
    scoop.dispose();
    material.dispose();
  });
  it('opens the engineer jaw while retaining both arms and its bridge inside the old envelope', () => {
    const g = createWorkerWrenchHead();
    g.computeBoundingBox();
    expect(ray(g, 0, 0.01)).toHaveLength(0);
    expect(ray(g, -0.02, 0.01).length).toBeGreaterThan(0);
    expect(ray(g, 0.02, 0.01).length).toBeGreaterThan(0);
    expect(ray(g, 0, -0.01).length).toBeGreaterThan(0);
    expect(g.boundingBox!.min.x).toBeCloseTo(-0.025, 6);
    expect(g.boundingBox!.max.y).toBeCloseTo(0.015, 6);
    g.dispose();
  });
  it('gives the gardener a tapered blade with the original shaft/tip contact range', () => {
    const g = createWorkerTrowelBlade();
    g.computeBoundingBox();
    expect(g.boundingBox!.min.y).toBeCloseTo(0.0575, 6);
    expect(g.boundingBox!.max.y).toBeCloseTo(0.1325, 6);
    expect(ray(g, 0, 0.11).length).toBeGreaterThan(0);
    expect(ray(g, 0.022, 0.13)).toHaveLength(0);
    g.dispose();
  });
  it('closes scored loaves on the real tray top with finite shared geometry and no extra product draw', () => {
    const g = createWorkerLoafGeometry();
    expect(g.boundingBox!.min.y).toBeCloseTo(0, 8);
    expect(g.boundingBox!.max.y).toBeLessThanOrEqual(0.040001);
    expect(g.boundingBox!.max.x + 0.07).toBeLessThan(0.19);
    expect(g.boundingBox!.max.z).toBeLessThan(0.12);
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(g, material);
    expect(
      new THREE.Raycaster(
        new THREE.Vector3(0, -0.03, 0),
        new THREE.Vector3(0, 1, 0)
      ).intersectObject(mesh)[0].point.y
    ).toBeCloseTo(0, 8);
    expect(new Set(g.getAttribute('color').array).size).toBeGreaterThan(30);
    expect(g.index!.count / 3).toBeLessThan(700);
    for (const a of Object.values(g.attributes))
      expect(Array.from(a.array).every(Number.isFinite)).toBe(true);
    g.dispose();
    material.dispose();
  });
});

it('shapes hollow PPE shells, cushions and a helmet-clearing arch within the retained mesh budget', () => {
  const cup = SHARED_WORKER_GEOMETRY.hearingCup;
  const p = cup.getAttribute('position'),
    colours = cup.getAttribute('color');
  expect(colours.count).toBe(p.count);
  expect(new Set(Array.from(colours.array))).toEqual(new Set([1, Math.fround(0.22)]));
  const b = cup.boundingBox!;
  expect(b.min.y).toBeCloseTo(-0.0125);
  expect(b.max.y).toBeCloseTo(0.028);
  expect(Math.max(-b.min.x, b.max.x, -b.min.z, b.max.z)).toBeLessThanOrEqual(0.038001);
  expect(SHARED_WORKER_GEOMETRY.hearingBand.boundingBox!.max.x).toBeLessThanOrEqual(0.134001);
  const band = new THREE.Mesh(SHARED_WORKER_GEOMETRY.hearingBand, new THREE.MeshBasicMaterial());
  band.updateMatrixWorld();
  // Adjustment rails physically enter the headband and both existing cup mounts.
  for (const side of [-1, 1]) {
    const hit = new THREE.Raycaster(
      new THREE.Vector3(side * 0.125, 0.005, 0.04),
      new THREE.Vector3(0, 0, -1)
    ).intersectObject(band)[0];
    expect(hit).toBeDefined();
    expect(hit.point.z).toBeCloseTo(0.007);
  }
  (band.material as THREE.Material).dispose();
  expect(p.count / 3).toBeLessThan(700);
});
it('keeps curved glasses attached to the lenses, and badge print against a rounded holder', () => {
  const temple = SHARED_WORKER_GEOMETRY.glassesTemple;
  temple.computeBoundingBox();
  expect(temple.boundingBox!.max.z - 0.052).toBeGreaterThanOrEqual(0.0039);
  expect(temple.boundingBox!.min.y).toBeLessThan(-0.01);
  expect(temple.boundingBox!.max.x).toBeLessThanOrEqual(0.00401);
  expect(temple.boundingBox!.min.x).toBeGreaterThanOrEqual(-0.00401);
  const badge = new THREE.Mesh(SHARED_WORKER_GEOMETRY.identityBadge, new THREE.MeshBasicMaterial());
  badge.updateMatrixWorld();
  for (const [x, y] of [
    [0, 0.033],
    [-0.017, -0.009],
    [0.015, -0.022],
  ]) {
    const hit = new THREE.Raycaster(
      new THREE.Vector3(x, y, 0.1),
      new THREE.Vector3(0, 0, -1)
    ).intersectObject(badge)[0];
    expect(hit.point.z).toBeCloseTo(0.0045);
  }
  (badge.material as THREE.Material).dispose();
  const radio = SHARED_WORKER_GEOMETRY.chestRadio;
  expect(radio.boundingBox!.max.z).toBeCloseTo(0.0145);
  expect(radio.getAttribute('position').count / 3).toBeLessThan(1000);
});

it('holds a walking clip through small speed fluctuations around the run crossover', () => {
  const play = vi.spyOn(THREE.AnimationAction.prototype, 'play');
  const appearance = getWorkerAppearance('Engineer', '', 'crew-engineer');
  const walkSpeed = (appearance.bodyType === 'masculine' ? 1.352 : 1.082) * appearance.bodyScale;
  const { motion } = mountAnimatedWorker('walking', walkSpeed * 1.44);
  for (let i = 0; i < 60; i++) harness.frame?.({}, 1 / 30);
  const run = play.mock.contexts.find((a) => a.getClip().name === 'worker-run')!;
  for (let i = 0; i < 60; i++) {
    motion.groundSpeed = walkSpeed * (i % 2 ? 1.449 : 1.451);
    harness.frame?.({}, 1 / 30);
  }
  expect(run.getEffectiveWeight()).toBeLessThan(0.01);
  motion.groundSpeed = walkSpeed * 1.65;
  for (let i = 0; i < 40; i++) harness.frame?.({}, 1 / 30);
  expect(run.getEffectiveWeight()).toBeGreaterThan(0.99);
  motion.groundSpeed = walkSpeed * 1.3;
  for (let i = 0; i < 40; i++) harness.frame?.({}, 1 / 30);
  expect(run.getEffectiveWeight()).toBeLessThan(0.01);
});

it('retains anatomical vertex colours in the existing two-draw distant body', () => {
  const { model, sources } = bodyFixture();
  const source = sources[0];
  const colours = new THREE.Float32BufferAttribute(
    [1.03, 0.96, 0.94, 1, 1, 1, 0.98, 0.97, 0.96],
    3
  );
  source.geometry.setAttribute('color', colours);
  (source.material as THREE.MeshStandardMaterial).vertexColors = true;
  const lod = createWorkerBodyLod(model)!;
  expect(lod.meshes).toHaveLength(2);
  const merged = lod.meshes[0].geometry.getAttribute('color');
  expect(merged.getX(0)).toBeCloseTo(
    (source.material as THREE.MeshStandardMaterial).color.r * 1.03,
    6
  );
  expect(merged.getY(0)).toBeCloseTo(
    (source.material as THREE.MeshStandardMaterial).color.g * 0.96,
    6
  );
  expect(source.geometry.getAttribute('color')).toBe(colours);
  lod.dispose();
});

it('uses the shared rounded pouch inside the original fitting envelope with an open rear belt channel', () => {
  const g = SHARED_WORKER_GEOMETRY.toolPouch;
  expect(g.groups).toHaveLength(0);
  expect(g.getAttribute('position').count / 3).toBeLessThan(1200);
  for (const a of Object.values(g.attributes))
    expect(Array.from(a.array).every(Number.isFinite)).toBe(true);
  const b = g.boundingBox!;
  [0.075, 0.105, 0.045].forEach((v, i) =>
    expect(b.getSize(new THREE.Vector3()).getComponent(i)).toBeCloseTo(v, 6)
  );
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    mesh = new THREE.Mesh(g, material);
  try {
    const hits = new THREE.Raycaster(
      new THREE.Vector3(-0.05, 0.02, -0.019),
      new THREE.Vector3(1, 0, 0)
    ).intersectObject(mesh);
    expect(hits.some((h) => h.point.x < -0.02)).toBe(true);
    expect(hits.some((h) => h.point.x > 0.02)).toBe(true);
    expect(hits.every((h) => Math.abs(h.point.x) > 0.02)).toBe(true);
    // The seam lies into the body front, and the fastener enters the layered flap.
    expect(0.0194 - 0.001).toBeLessThan(0.0185);
    expect(0.021 - 0.0015).toBeLessThan(0.0185 + 0.0056 / 2);
  } finally {
    material.dispose();
  }
});

it('runs hand articulation through the real frame callback and freezes/restores it on paused semantic changes', () => {
  const scene = new THREE.Group(),
    body = new THREE.Group(),
    hips = new THREE.Group(),
    finger = new THREE.Bone();
  body.name = 'Body';
  hips.name = 'Hips';
  finger.name = 'Index2L';
  scene.add(body);
  body.add(hips);
  hips.add(finger);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -1);
  const clips = ['idle', 'walk', 'run', 'repair'].map(
    (name) =>
      new THREE.AnimationClip(`worker-${name}`, 2, [
        new THREE.QuaternionKeyframeTrack(
          'Index2L.quaternion',
          [0, 2],
          name === 'run' ? [...q.toArray(), ...q.toArray()] : [0, 0, 0, 1, 0, 0, 0, 1]
        ),
      ])
  );
  harness.asset = { scene, animations: clips };
  const motion: WorkerMotionState = {
    activity: 'working',
    enabled: false,
    seated: false,
    groundSpeed: 0,
    phase: 0,
  };
  const { unmount } = render(
    <WorkerModel
      appearance={{
        ...getWorkerAppearance('Engineer', '', 'hand-regression'),
        tool: 'wrench',
        workAction: 'repair',
      }}
      motion={motion}
    />
  );
  harness.frame?.({}, 1 / 60);
  expect(finger.quaternion.angleTo(new THREE.Quaternion())).toBeGreaterThan(0.3);
  const held = finger.quaternion.toArray();
  harness.frame?.({}, 100);
  expect(finger.quaternion.toArray()).toEqual(held);
  motion.activity = 'walking';
  harness.frame?.({}, 1 / 60);
  expect(finger.quaternion.toArray()).toEqual([0, 0, 0, 1]);
  unmount();
});

it('equips the live inspection engineer with one shared belt surface and preserves other role cues', () => {
  const engineer = getWorkerAppearance('Engineer', '', 'mill-engineer');
  expect(engineer.hasToolBelt).toBe(true);
  expect(engineer.tool).toBe('tablet');
  expect(engineer.workAction).toBe('inspect');
  expect(getWorkerAppearance('Operator', '', 'mill-operator-east').hasToolBelt).toBe(false);
  const g = SHARED_WORKER_GEOMETRY.toolBelt,
    b = g.boundingBox!;
  expect(g.groups).toHaveLength(0);
  expect(g.getAttribute('position').count / 3).toBeLessThan(2200);
  expect(b.min.x).toBeCloseTo(-0.1775, 6);
  expect(b.max.x).toBeCloseTo(0.1775, 6);
  expect(b.min.y).toBeCloseTo(-0.0525, 6);
  expect(b.max.y).toBeCloseTo(0.0525, 6);
  expect(b.min.z).toBeCloseTo(-0.051, 6);
  expect(b.max.z).toBeCloseTo(0.0225, 6);
  for (const a of Object.values(g.attributes))
    expect(Array.from(a.array).every(Number.isFinite)).toBe(true);
});

it('resolves civilian hairstyles while retaining the original helmeted worker', () => {
  for (const [role, style] of [
    ['Resident', 'short'],
    ['Resident', 'medium'],
    ['Resident', 'curly'],
    ['Resident', 'ponytail'],
    ['Resident', 'bald'],
    ['Operator', 'curly'],
  ] as const) {
    const scene = new THREE.Group();
    const head = new THREE.Bone();
    head.name = 'Head';
    scene.add(head);
    harness.asset = { scene, animations: [] };
    const appearance = { ...getWorkerAppearance(role, '#596e72', 'hair-review'), hairStyle: style };
    const motion: WorkerMotionState = {
      activity: 'idle',
      groundSpeed: 0,
      seated: false,
      phase: 0,
      enabled: false,
    };
    const view = render(<WorkerModel appearance={appearance} motion={motion} />);
    const hair = view.container.querySelector('[name="worker-authored-hair"]');
    expect(!!hair).toBe(role === 'Resident' && style !== 'bald');
    view.unmount();
  }
});

it('shares bounded distinct civilian cuts with finite lit colour, normals and fixed scalp roots', () => {
  const signatures = new Set<string>();
  for (const [style, geometry] of Object.entries(WORKER_HAIR_GEOMETRIES)) {
    if (style === 'bald') {
      expect(geometry).toBeNull();
      continue;
    }
    const g = geometry!;
    const position = g.getAttribute('position');
    for (const name of ['position', 'normal', 'uv', 'color', 'hairFlex']) {
      const attribute = g.getAttribute(name);
      expect(attribute.count).toBe(position.count);
      expect(Array.from(attribute.array).every(Number.isFinite)).toBe(true);
    }
    expect(position.count / 3).toBeLessThan(1800);
    expect(g.boundingBox!.max.y).toBeGreaterThan(0.2);
    expect(g.boundingBox!.max.y).toBeLessThan(0.24);
    expect(g.boundingBox!.min.x).toBeGreaterThan(-0.13);
    expect(g.boundingBox!.max.x).toBeLessThan(0.13);
    expect(g.boundingBox!.max.z).toBeLessThan(0.13);
    const normals = g.getAttribute('normal');
    const n = new THREE.Vector3();
    for (let i = 0; i < normals.count; i++)
      expect(n.fromBufferAttribute(normals, i).length()).toBeCloseTo(1, 4);
    signatures.add(position.count + ':' + g.boundingBox!.min.toArray().join(','));
  }
  expect(signatures.size).toBe(4);
  const material = createWorkerHairMaterial('#c59a5b');
  expect(material.vertexColors).toBe(true);
  expect(material.roughness).toBe(0.84);
  expect(material.metalness).toBe(0);
  expect(material.type).toBe('MeshStandardMaterial');
  expect(material.color.equals(new THREE.Color('#c59a5b'))).toBe(true);
  material.dispose();
  const tied = WORKER_HAIR_GEOMETRIES.ponytail;
  const colour = tied.getAttribute('color'),
    flex = tied.getAttribute('hairFlex');
  let rootTie = 0,
    flexibleHair = 0;
  for (let i = 0; i < colour.count; i++) {
    if (flex.getX(i) === 0 && colour.getX(i) < 0.2) rootTie++;
    if (flex.getX(i) > 0 && colour.getX(i) > 0.6) flexibleHair++;
  }
  expect(rootTie).toBeGreaterThan(10);
  expect(flexibleHair).toBeGreaterThan(100);
});

it('moves only a privately owned tail, settles at rest and freezes at zero elapsed time', () => {
  const source = WORKER_HAIR_GEOMETRIES.ponytail;
  const original = source.attributes.position.array.slice();
  const hair = createWorkerHairMotion(source),
    other = createWorkerHairMotion(source);
  const p = hair.geometry.attributes.position,
    n = hair.geometry.attributes.normal;
  const weights = source.attributes.hairFlex;
  let walking = 0,
    resting = 0;
  const vec = new THREE.Vector3(),
    restPoint = new THREE.Vector3();
  let rootDrift = 0;
  for (let frame = 0; frame < 240; frame++) {
    hair.apply(frame / 60, 1 / 60, 2, false);
    for (let i = 0; i < p.count; i++) {
      if (weights.getX(i) === 0) {
        rootDrift = Math.max(
          rootDrift,
          Math.abs(p.getX(i) - source.attributes.position.getX(i)),
          Math.abs(p.getY(i) - source.attributes.position.getY(i)),
          Math.abs(p.getZ(i) - source.attributes.position.getZ(i))
        );
      } else
        walking = Math.max(
          walking,
          vec
            .fromBufferAttribute(p, i)
            .distanceTo(restPoint.fromBufferAttribute(source.attributes.position, i))
        );
    }
  }
  const frozen = p.array.slice();
  hair.apply(100, 0, 0, true);
  expect(p.array).toEqual(frozen);
  for (let frame = 240; frame < 720; frame++) {
    hair.apply(frame / 60, 1 / 60, 0, true);
    if (frame > 600)
      for (let i = 0; i < p.count; i++)
        resting = Math.max(
          resting,
          vec
            .fromBufferAttribute(p, i)
            .distanceTo(restPoint.fromBufferAttribute(source.attributes.position, i))
        );
  }
  expect(rootDrift).toBe(0);
  expect(walking).toBeGreaterThan(0.008);
  expect(walking).toBeLessThan(0.025);
  expect(resting).toBeLessThan(0.004);
  for (let i = 0; i < n.count; i++)
    expect(vec.fromBufferAttribute(n, i).length()).toBeCloseTo(1, 4);
  expect(source.attributes.position.array).toEqual(original);
  expect(other.geometry.attributes.position.array).toEqual(original);
  const sharedDispose = vi.spyOn(source, 'dispose'),
    ownedDispose = vi.spyOn(hair.geometry, 'dispose');
  hair.dispose();
  other.dispose();
  expect(ownedDispose).toHaveBeenCalledOnce();
  expect(sharedDispose).not.toHaveBeenCalled();
  const short = createWorkerHairMotion(WORKER_HAIR_GEOMETRIES.short);
  expect(short.geometry).toBe(WORKER_HAIR_GEOMETRIES.short);
  short.dispose();
});

it('runs hair motion on the existing worker frame, freezes pause, and cleans only the private tail', () => {
  const scene = new THREE.Group(),
    head = new THREE.Bone();
  head.name = 'Head';
  scene.add(head);
  harness.asset = { scene, animations: [] };
  const factory = vi.spyOn(hairShapes, 'createWorkerHairMotion');
  const motion: WorkerMotionState = {
    activity: 'walking',
    groundSpeed: 1.2,
    seated: false,
    phase: 0,
    enabled: true,
  };
  const appearance = {
    ...getWorkerAppearance('Resident', '#596e72', 'tail-motion'),
    hairStyle: 'ponytail' as const,
  };
  const view = render(<WorkerModel appearance={appearance} motion={motion} />);
  const hair = factory.mock.results[0].value as ReturnType<typeof createWorkerHairMotion>;
  const dispose = vi.spyOn(hair.geometry, 'dispose');
  const before = hair.geometry.attributes.position.array.slice();
  for (let frame = 0; frame < 30; frame++) harness.frame?.({}, 1 / 60);
  expect(hair.geometry.attributes.position.array).not.toEqual(before);
  motion.enabled = false;
  harness.frame?.({}, 1 / 60);
  const paused = hair.geometry.attributes.position.array.slice();
  harness.frame?.({}, 10);
  expect(hair.geometry.attributes.position.array).toEqual(paused);
  view.unmount();
  expect(dispose).toHaveBeenCalledOnce();
});

it('assigns stable civilian cut variation without changing industrial PPE or named profiles', () => {
  const styles = new Set<string>();
  for (let id = 0; id < 32; id++) {
    const a = getWorkerAppearance('Resident', '#596e72', 'civilian-' + id);
    expect(a).toEqual(getWorkerAppearance('Resident', '#596e72', 'civilian-' + id));
    styles.add(a.hairStyle);
    expect(a.hasHardHat).toBe(false);
  }
  expect(styles.size).toBe(5);
  const roster = COMMUNITY_ROSTER.map((person) => getWorkerAppearance(person.role, '', person.id));
  expect(new Set(roster.filter((a) => !a.hasHardHat).map((a) => a.hairStyle)).size).toBe(5);
  expect(getWorkerAppearance('Baker', '', 'village-baker').hairStyle).toBe('ponytail');
  expect(getWorkerAppearance('Cyclist', '', 'village-cyclist').hairStyle).toBe('ponytail');
  expect(getWorkerAppearance('Engineer', '', 'w2').hairStyle).toBe('ponytail');
  expect(getWorkerAppearance('Operator', '', 'mill-operator-west').hasHardHat).toBe(true);
});

it('mounts garden rise/return, freezes mid-rise and releases stance for walking', () => {
  const scene = new THREE.Group();
  const body = new THREE.Group();
  body.name = 'Body';
  scene.add(body);
  const hips = new THREE.Group();
  hips.name = 'Hips';
  hips.position.y = 0.82;
  body.add(hips);
  const clips = ['idle', 'break', 'walk', 'run'].map(
    (name) =>
      new THREE.AnimationClip(`worker-${name}`, 2, [
        new THREE.NumberKeyframeTrack('Body.position[y]', [0, 2], [0, 0]),
      ])
  );
  harness.asset = { scene, animations: clips };
  const motion: WorkerMotionState = {
    activity: 'working',
    groundSpeed: 0,
    seated: false,
    phase: 0,
    enabled: true,
    animationInterval: 1 / 60,
  };
  const appearance = getWorkerAppearance('Gardener', '', 'village-gardener');
  const { container } = render(<WorkerModel appearance={appearance} motion={motion} />);
  const tool = container.querySelector('[name="worker-held-tool"]') as unknown as THREE.Group;
  // DOM portal mock has no Three position; supply only the ref field used here.
  tool.position = new THREE.Vector3();
  const y = () => hips.getWorldPosition(new THREE.Vector3()).y;
  const crouched = y();
  expect(tool.visible).toBe(true);
  motion.activity = 'idle';
  harness.frame?.({}, 1 / 60);
  expect(y()).toBeGreaterThan(crouched);
  expect(y() - crouched).toBeLessThan(0.045 / appearance.heightScale);
  expect(tool.visible).toBe(false);
  const held = y();
  motion.enabled = false;
  for (let i = 0; i < 10; i++) harness.frame?.({}, 1);
  expect(y()).toBe(held);
  motion.enabled = true;
  for (let i = 0; i < 120; i++) harness.frame?.({}, 1 / 60);
  expect(y()).toBeGreaterThan(0.75);
  motion.activity = 'working';
  harness.frame?.({}, 1 / 60);
  expect(tool.visible).toBe(false);
  for (let i = 0; i < 120; i++) harness.frame?.({}, 1 / 60);
  expect(tool.visible).toBe(true);
  expect(y()).toBeCloseTo(crouched, 5);
  motion.activity = 'walking';
  motion.groundSpeed = 0.2;
  harness.frame?.({}, 1 / 60);
  expect(y()).toBeGreaterThan(0.75);
  expect(tool.visible).toBe(false);
  motion.activity = 'working';
  motion.groundSpeed = 0;
  motion.enabled = false;
  harness.frame?.({}, 1 / 60);
  expect(y()).toBeCloseTo(crouched, 5);
  expect(tool.visible).toBe(true);
  motion.activity = 'idle';
  harness.frame?.({}, 1 / 60);
  expect(y()).toBeGreaterThan(0.75);
  expect(tool.visible).toBe(false);
});

it('adds owned baker cloth to the cloned rig and disposes only its private resources', async () => {
  const { clone } = await vi.importActual<typeof import('three/addons/utils/SkeletonUtils.js')>(
    'three/addons/utils/SkeletonUtils.js'
  );
  const scene = new THREE.Group(),
    bones = ['Hips', 'Abdomen', 'Chest', 'UpperLegL', 'UpperLegR'].map((name) => {
      const b = new THREE.Bone();
      b.name = name;
      return b;
    });
  bones[0].position.y = 0.9;
  bones[1].position.y = 1;
  bones[2].position.y = 1.38;
  bones[3].position.set(0.1, 0.9, 0);
  bones[4].position.set(-0.1, 0.9, 0);
  scene.add(...bones);
  scene.updateMatrixWorld(true);
  const geometry = new THREE.BoxGeometry(0.4, 0.5, 0.25);
  geometry.translate(0, 1.15, 0);
  geometry.setAttribute(
    'skinIndex',
    new THREE.Uint8BufferAttribute(new Uint8Array(geometry.attributes.position.count * 4), 4)
  );
  const weights = new Float32Array(geometry.attributes.position.count * 4);
  for (let i = 0; i < weights.length; i += 4) weights[i] = 1;
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  const source = new THREE.SkinnedMesh(
    geometry,
    new THREE.MeshStandardMaterial({ side: THREE.DoubleSide })
  );
  source.bind(new THREE.Skeleton(bones));
  const group = new THREE.Group();
  group.name = 'Worker_Body';
  group.add(source);
  scene.add(group);
  const clones: THREE.Group[] = [];
  harness.clone = (s) => {
    const m = clone(s);
    clones.push(m);
    return m;
  };
  harness.asset = { scene, animations: [] };
  const motion: WorkerMotionState = {
    activity: 'idle',
    groundSpeed: 0,
    seated: false,
    phase: 0,
    enabled: false,
  };
  const { unmount } = render(
    <WorkerModel appearance={getWorkerAppearance('Baker', '', 'village-baker')} motion={motion} />
  );
  const apron = clones[0].getObjectByName('baker-authored-apron') as THREE.SkinnedMesh<
    THREE.BufferGeometry,
    THREE.MeshStandardMaterial
  >;
  expect(apron).toBeDefined();
  const disposeCloth = vi.spyOn(apron.geometry, 'dispose'),
    disposeMaterial = vi.spyOn(apron.material, 'dispose'),
    disposeSource = vi.spyOn(geometry, 'dispose');
  expect(scene.getObjectByName('baker-authored-apron')).toBeUndefined();
  unmount();
  expect(disposeCloth).toHaveBeenCalledTimes(1);
  expect(disposeMaterial).toHaveBeenCalledTimes(1);
  expect(disposeSource).not.toHaveBeenCalled();
  expect(createBakerApron(new THREE.Group())).toBeNull();
});

it('samples seat cue numbers without throttle or pause lag, and keeps legacy seating', () => {
  const scene = new THREE.Group(),
    body = new THREE.Group(),
    hips = new THREE.Group();
  body.name = 'Body';
  hips.name = 'Hips';
  body.position.y = 0.9;
  body.add(hips);
  scene.add(body);
  const clips = ['idle', 'walk', 'break'].map(
    (n) =>
      new THREE.AnimationClip('worker-' + n, 2, [
        new THREE.NumberKeyframeTrack('Body.position[y]', [0, 2], [0.9, 0.9]),
      ])
  );
  harness.asset = { scene, animations: clips };
  const motion: WorkerMotionState = {
    activity: 'break',
    seated: true,
    enabled: false,
    phase: 0,
    groundSpeed: 0,
    animationInterval: 1 / 15,
    seat: { amount: 1, support: 1, x: 0, z: 0, yaw: 0 },
  };
  render(
    <WorkerModel
      appearance={{
        ...getWorkerAppearance('Resident', '', 'seated-neighbour'),
        heightScale: 1,
        bodyScale: 1,
      }}
      motion={motion}
    />
  );
  const y = () => {
    scene.updateWorldMatrix(true, true);
    return hips.getWorldPosition(new THREE.Vector3()).y;
  };
  expect(y()).toBeCloseTo(0.55, 5);
  motion.seat!.amount = 0.5;
  harness.frame?.({}, 1 / 120);
  const half = y();
  expect(half).toBeGreaterThan(0.6);
  expect(half).toBeLessThan(0.85);
  harness.frame?.({}, 100);
  expect(y()).toBe(half);
  motion.seat!.amount = 0;
  harness.frame?.({}, 1 / 120);
  expect(y()).toBeCloseTo(0.9, 5);
  motion.enabled = true;
  motion.seat!.x = 0.1;
  harness.frame?.({}, 1 / 120);
  const before = hips.getWorldPosition(new THREE.Vector3()).x;
  motion.seat!.x = 0.2;
  harness.frame?.({}, 1 / 120);
  expect(hips.getWorldPosition(new THREE.Vector3()).x - before).toBeCloseTo(0.1, 5);
  motion.enabled = false;
  motion.seat = undefined;
  harness.frame?.({}, 0);
  expect(y()).toBeCloseTo(0.55, 5);
});

describe('owned duty preparation and release', () => {
  for (const role of ['Baker', 'Engineer'])
    it(`${role} mounts the correct work clip, owns its fade and gates truthful tool visibility`, () => {
      const original = workerPoses.createSeatedWorkerPose;
      let controller: ReturnType<typeof original> | undefined;
      vi.spyOn(workerPoses, 'createSeatedWorkerPose').mockImplementation((...args) => {
        controller = original(...args);
        vi.spyOn(controller, 'applyDuty');
        return controller;
      });
      const scene = new THREE.Group(),
        body = new THREE.Group(),
        hips = new THREE.Group();
      body.name = 'Body';
      hips.name = 'Hips';
      hips.position.y = 0.82;
      body.add(hips);
      scene.add(body);
      const wrist = new THREE.Group();
      wrist.name = 'WristL';
      body.add(wrist);
      const clips = [
        'idle',
        'walk',
        'run',
        'break',
        'inspect',
        'repair',
        'supervise',
        'radio',
        'sample',
      ].map(
        (name) =>
          new THREE.AnimationClip('worker-' + name, 2, [
            new THREE.NumberKeyframeTrack('Body.position[y]', [0, 2], [0, 0]),
          ])
      );
      harness.asset = { scene, animations: clips };
      const play = vi.spyOn(THREE.AnimationAction.prototype, 'play');
      const motion: WorkerMotionState = {
        activity: 'working',
        groundSpeed: 0,
        seated: false,
        phase: 0,
        enabled: true,
        animationInterval: 1 / 60,
      };
      const appearance = getWorkerAppearance(role, '', 'handover-' + role);
      const view = render(<WorkerModel appearance={appearance} motion={motion} />);
      const tool = view.container.querySelector(
        '[name="worker-held-tool"]'
      ) as unknown as THREE.Group;
      tool.position = new THREE.Vector3();
      const name = role === 'Baker' ? 'worker-break' : 'worker-inspect';
      expect(play.mock.contexts.find((a) => a.getClip().name === name)!.getEffectiveWeight()).toBe(
        1
      );
      expect(tool.visible).toBe(true);
      expect(controller!.applyDuty).toHaveBeenLastCalledWith(
        appearance.workAction,
        expect.anything(),
        1
      );
      harness.frame?.({}, 1 / 60);
      // A shared worker-break clip must not keep a baker's duty fully active.
      motion.activity = 'break';
      harness.frame?.({}, 1 / 60);
      expect(tool.visible).toBe(false);
      const amount = vi.mocked(controller!.applyDuty).mock.lastCall![2];
      expect(amount).toBeLessThan(1);
      expect(amount).toBeGreaterThan(0);
      motion.enabled = false;
      const calls = vi.mocked(controller!.applyDuty).mock.calls.length;
      for (let i = 0; i < 10; i++) harness.frame?.({}, 1);
      expect(vi.mocked(controller!.applyDuty).mock.calls.length).toBe(calls);
      motion.enabled = true;
      for (let i = 0; i < 100; i++) harness.frame?.({}, 1 / 60);
      const afterRelease = vi.mocked(controller!.applyDuty).mock.calls.length;
      motion.activity = 'walking';
      motion.groundSpeed = 0.4;
      for (let i = 0; i < 20; i++) harness.frame?.({}, 1 / 60);
      expect(vi.mocked(controller!.applyDuty).mock.calls.length).toBe(afterRelease);
      expect(tool.visible).toBe(false);
      motion.activity = 'working';
      motion.groundSpeed = 0;
      motion.animationInterval = 1 / 15;
      harness.frame?.({}, 1 / 60);
      expect(tool.visible).toBe(false);
      expect(vi.mocked(controller!.applyDuty).mock.lastCall![2]).toBeLessThan(0.1);
      for (let i = 0; i < 120; i++) harness.frame?.({}, 1 / 60);
      expect(tool.visible).toBe(true);
      // A disabled semantic change resolves immediately without clip-time advance.
      motion.enabled = false;
      motion.activity = 'idle';
      harness.frame?.({}, 1 / 60);
      expect(tool.visible).toBe(false);
      motion.activity = 'working';
      harness.frame?.({}, 1 / 60);
      expect(tool.visible).toBe(true);
      // Constraint ownership clears a residual duty before a seated break.
      motion.activity = 'break';
      motion.seated = true;
      harness.frame?.({}, 1 / 60);
      const count = vi.mocked(controller!.applyDuty).mock.calls.length;
      motion.seated = false;
      motion.activity = 'walking';
      motion.groundSpeed = 0.5;
      motion.enabled = true;
      harness.frame?.({}, 1 / 60);
      expect(vi.mocked(controller!.applyDuty).mock.calls.length).toBe(count);
      expect(tool.visible).toBe(false);
    });
});

it('admits face attention only with the existing pose delta and near-face visibility, preserving disabled semantic holds', () => {
  const scene = new THREE.Group(),
    head = new THREE.Bone();
  head.name = 'Head';
  scene.add(head);
  harness.asset = { scene, animations: [] };
  const gaze = vi.spyOn(workerPoses, 'sampleWorkerGaze');
  const motion: WorkerMotionState = {
    activity: 'idle',
    groundSpeed: 0,
    seated: false,
    phase: 0,
    enabled: true,
    animationInterval: 1 / 15,
    attentionYaw: 0.26,
  };
  const view = render(
    <WorkerModel
      appearance={{ ...getWorkerAppearance('Engineer', '', 'attention'), tool: 'none' }}
      motion={motion}
    />
  );
  harness.frame?.({}, 0.01); // The existing first semantic pose is admitted immediately.
  expect(gaze).toHaveBeenCalledOnce();
  gaze.mockClear();
  for (let i = 0; i < 6; i++) harness.frame?.({}, 0.01);
  expect(gaze).not.toHaveBeenCalled();
  harness.frame?.({}, 0.01);
  expect(gaze).toHaveBeenCalledOnce();
  expect(gaze.mock.calls[0][2]).toBeCloseTo(0.07);
  expect(gaze.mock.calls[0][3].horizontal).toBeGreaterThan(0);
  motion.enabled = false;
  harness.frame?.({}, 100);
  motion.activity = 'working';
  harness.frame?.({}, 100);
  expect(gaze).toHaveBeenCalledOnce();
  motion.enabled = true;
  motion.animationInterval = 0;
  const camera = new THREE.PerspectiveCamera();
  camera.position.z = 50;
  harness.frame?.({ camera }, 1 / 60);
  expect(gaze).toHaveBeenCalledOnce();
  camera.position.z = 2;
  harness.frame?.({ camera }, 1 / 60);
  expect(gaze).toHaveBeenCalledTimes(2);
  expect(gaze.mock.calls.at(-1)![0].lookPitch).toBeGreaterThan(0);
  expect(gaze.mock.calls.at(-1)![3].vertical).toBeLessThan(0);
  view.unmount();
});

it('retains the legacy neutral pair atomically for incomplete or nonfinite eye profiles', () => {
  const surface: workerPoses.WorkerEyeSurface = {
    centre: [-0.047, 0.108, 0.112],
    right: [1, 0, 0],
    up: [0, 1, 0],
    normal: [0, 0, 1],
    halfWidth: 0.01,
    halfHeight: 0.01,
  };
  for (const profiles of [[surface], [surface, { ...surface, halfWidth: NaN }]]) {
    const pair = createWorkerAccessoryPair(
      'eye-pupils',
      SHARED_WORKER_ACCESSORY_MATERIALS.dark,
      profiles,
      'masculine'
    );
    const original = Array.from(pair.instanceMatrix.array);
    setWorkerPupilPose(pair, 0, 1, 1);
    expect(Array.from(pair.instanceMatrix.array)).toEqual(original);
    expect(pair.userData.workerEyeSurfaces).toBeUndefined();
    setWorkerPupilBlink(pair, 1);
    expect(pair.visible).toBe(false);
    setWorkerPupilBlink(pair, 0);
    expect(Array.from(pair.instanceMatrix.array)).toEqual(original);
    pair.dispose();
  }
});

it('shares the admitted greeting envelope with facial detail and resets the far face without advancing a paused hello', () => {
  const scene = new THREE.Group(),
    head = new THREE.Bone();
  head.name = 'Head';
  scene.add(head);
  harness.asset = { scene, animations: [] };
  const expression = { mouth: null, apply: vi.fn(), refreshAttachment: vi.fn(), dispose: vi.fn() };
  vi.spyOn(workerPoses, 'createWorkerFaceExpression').mockReturnValue(expression);
  const motion: WorkerMotionState = {
    activity: 'idle',
    groundSpeed: 0,
    seated: false,
    phase: 0,
    enabled: true,
    greeting: true,
    greetingTargetId: 'neighbour',
  };
  const view = render(
    <WorkerModel appearance={getWorkerAppearance('Shopkeeper', '', 'face')} motion={motion} />
  );
  harness.frame?.({}, 1 / 60);
  expect(expression.apply).toHaveBeenCalledOnce();
  expect(expression.apply.mock.calls[0][0]).toBeGreaterThan(0);
  motion.enabled = false;
  harness.frame?.({}, 100);
  expect(expression.apply).toHaveBeenCalledOnce();
  motion.greeting = false;
  harness.frame?.({}, 100);
  expect(expression.apply).toHaveBeenCalledTimes(2);
  expect(expression.apply.mock.calls.at(-1)![0]).toBe(0);
  motion.enabled = true;
  motion.greeting = true;
  const camera = new THREE.PerspectiveCamera();
  camera.position.z = 50;
  harness.frame?.({ camera }, 1 / 60);
  expect(expression.apply.mock.calls.at(-1)![0]).toBe(0);
  const callsBeforeReveal = expression.apply.mock.calls.length;
  motion.enabled = false;
  camera.position.z = 2;
  harness.frame?.({ camera }, 1 / 60);
  expect(expression.refreshAttachment).toHaveBeenCalledOnce();
  expect(expression.apply.mock.calls.length).toBe(callsBeforeReveal);
  motion.enabled = true;
  harness.frame?.({ camera }, 1 / 60);
  expect(expression.apply.mock.calls.at(-1)![0]).toBeGreaterThan(0);
  view.unmount();
  expect(expression.dispose).toHaveBeenCalledOnce();
});

it('fits continuous protective rims to the real clear lenses, bridge and temple fronts', () => {
  const frame = SHARED_WORKER_GEOMETRY.glassesBridge,
    material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    mesh = new THREE.Mesh(frame, material),
    lens = new THREE.Mesh(SHARED_WORKER_GEOMETRY.glassesLens, material),
    temple = new THREE.Mesh(SHARED_WORKER_GEOMETRY.glassesTemple, material);
  const hit = (object: THREE.Mesh, x: number, y: number) => {
    object.updateMatrixWorld(true);
    return new THREE.Raycaster(
      new THREE.Vector3(x, y, 0.2),
      new THREE.Vector3(0, 0, -1)
    ).intersectObject(object)[0];
  };
  expect(frame.boundingBox!.min.x).toBeCloseTo(-0.0835, 6);
  expect(frame.boundingBox!.max.x).toBeCloseTo(0.0835, 6);
  expect(frame.boundingBox!.max.y).toBeCloseTo(0.021, 6);
  expect(frame.getAttribute('position').count / 3).toBeLessThan(1500);
  for (const a of Object.values(frame.attributes))
    expect(Array.from(a.array).every(Number.isFinite)).toBe(true);
  for (const side of [-1, 1]) {
    lens.position.x = side * 0.047;
    temple.position.set(side * 0.084, 0, -0.052);
    expect(hit(mesh, side * 0.047, 0)).toBeUndefined();
    expect(hit(lens, side * 0.047, 0).point.z).toBeCloseTo(0.005, 6);
    // Sample all four straight rim sides, including the bridge and temple joints.
    for (const [x, y] of [
      [side * 0.082, 0],
      [side * 0.012, 0],
      [side * 0.047, 0.0195],
      [side * 0.047, -0.0195],
    ]) {
      const rim = hit(mesh, x, y),
        clear = hit(lens, x, y);
      expect(rim).toBeDefined();
      expect(clear).toBeDefined();
      const back = (object: THREE.Mesh) =>
        new THREE.Raycaster(
          new THREE.Vector3(x, y, -0.2),
          new THREE.Vector3(0, 0, 1)
        ).intersectObject(object)[0].point.z;
      // Curved lens and bevelled rim fronts need not be coplanar. Their solid
      // intervals must overlap, rather than float next to each other.
      expect(
        Math.min(rim.point.z, clear.point.z) - Math.max(back(mesh), back(lens))
      ).toBeGreaterThan(0.0005);
    }
    // The curved temple is an open-ended tube. Cross its closed section at the
    // joint, rather than casting down its empty bore toward the far ear hook.
    const across = new THREE.Raycaster(
      new THREE.Vector3(side * 0.2, 0, 0.002),
      new THREE.Vector3(-side, 0, 0)
    );
    temple.updateMatrixWorld(true);
    const joint = across.intersectObject(mesh)[0].point.x * side;
    const walls = across.intersectObject(temple).map((h) => h.point.x * side);
    expect(walls[0]).toBeGreaterThan(joint);
    expect(walls.at(-1)).toBeLessThan(joint);
  }
  // Preserve the original six-sided capsule bridge's actual face, not an
  // ideal analytic cylinder that the retained geometry never represented.
  expect(hit(mesh, 0, 0).point.z).toBeCloseTo(0.005 * Math.cos(Math.PI / 6), 6);
  material.dispose();
});

it('admits bounded walking attention, holds it exactly when paused and releases it without steering the body', () => {
  const scene = new THREE.Group(),
    head = new THREE.Bone(),
    body = new THREE.Bone();
  head.name = 'Head';
  body.name = 'Body';
  body.add(head);
  scene.add(body);
  harness.asset = { scene, animations: [] };
  const motion: WorkerMotionState = {
    activity: 'walking',
    groundSpeed: 1,
    seated: false,
    phase: 0,
    enabled: true,
    attentionYaw: 5,
  };
  render(
    <WorkerModel
      appearance={{ ...getWorkerAppearance('Resident', '', 'route-test'), tool: 'none' }}
      motion={motion}
    />
  );
  for (let i = 0; i < 60; i++) harness.frame?.({}, 1 / 60);
  expect(head.rotation.y).toBeGreaterThan(0.18);
  expect(head.rotation.y).toBeLessThan(0.3);
  expect(body.quaternion.toArray()).toEqual([0, 0, 0, 1]);
  const held = head.quaternion.clone();
  motion.enabled = false;
  motion.attentionYaw = 0;
  for (let i = 0; i < 5; i++) harness.frame?.({}, 100);
  expect(head.quaternion.equals(held)).toBe(true);
  motion.enabled = true;
  for (let i = 0; i < 120; i++) harness.frame?.({}, 1 / 60);
  expect(Math.abs(head.rotation.y)).toBeLessThan(0.09);
  motion.attentionYaw = NaN;
  harness.frame?.({}, 1 / 60);
  expect(head.quaternion.toArray().every(Number.isFinite)).toBe(true);
});

it('mounts civilian tailoring in existing body draws, preserves PPE and disposes only private trim', () => {
  const shared = new THREE.BoxGeometry(0.2, 0.3, 0.1).translate(0, 1.35, 0),
    count = shared.attributes.position.count;
  shared.setAttribute('skinIndex', new THREE.Uint8BufferAttribute(new Uint8Array(count * 4), 4));
  const weights = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) weights[i * 4] = 1;
  shared.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  const borrowed = vi.spyOn(shared, 'dispose'),
    owned: THREE.BufferGeometry[] = [],
    dispose: Array<ReturnType<typeof vi.spyOn>> = [];
  const builder = vi.spyOn(hairShapes, 'createWorkerShirtTrim').mockImplementation((mesh, kind) => {
    const g = mesh.geometry.clone();
    g.name = 'worker-tailored-' + kind;
    g.userData.workerTailoring = { kind };
    owned.push(g);
    dispose.push(vi.spyOn(g, 'dispose'));
    return g;
  });
  function asset() {
    const scene = new THREE.Group(),
      node = new THREE.Group(),
      neck = new THREE.Bone();
    node.name = 'Worker_Body';
    neck.name = 'Neck';
    scene.add(node, neck);
    const skin = new THREE.Skeleton([neck]);
    for (const name of ['Worker_Vest', 'LightBrown']) {
      const material = new THREE.MeshStandardMaterial();
      material.name = name;
      const m = new THREE.SkinnedMesh(shared, material);
      node.add(m);
      m.bind(skin);
    }
    return { scene, animations: [] };
  }
  const motion: WorkerMotionState = {
    activity: 'idle',
    groundSpeed: 0,
    seated: false,
    phase: 0,
    enabled: false,
  };
  harness.asset = asset();
  const appearance = {
    ...getWorkerAppearance('Shopkeeper', '', 'tailoring-owner'),
    bodyType: 'masculine' as const,
  };
  const view = render(<WorkerModel appearance={appearance} motion={motion} />);
  expect(builder).toHaveBeenCalledTimes(2);
  expect(builder.mock.calls.map((c) => c[1])).toEqual(['collar', 'shirt']);
  view.unmount();
  dispose.forEach((d) => expect(d).toHaveBeenCalledOnce());
  expect(borrowed).not.toHaveBeenCalled();
  builder.mockClear();
  harness.asset = asset();
  const ppe = render(
    <WorkerModel
      appearance={{
        ...getWorkerAppearance('Engineer', '', 'tailoring-ppe'),
        bodyType: 'masculine',
      }}
      motion={motion}
    />
  );
  expect(builder).not.toHaveBeenCalled();
  ppe.unmount();
  expect(borrowed).not.toHaveBeenCalled();
  expect(owned).toHaveLength(2);
  builder.mockClear();
  builder
    .mockImplementationOnce((mesh) => {
      const g = mesh.geometry.clone();
      dispose.push(vi.spyOn(g, 'dispose'));
      return g;
    })
    .mockImplementationOnce(() => null);
  harness.asset = asset();
  const unsupported = render(<WorkerModel appearance={appearance} motion={motion} />);
  expect(builder).toHaveBeenCalledTimes(2);
  expect(dispose.at(-1)).toHaveBeenCalledOnce();
  unsupported.unmount();
  expect(dispose.at(-1)).toHaveBeenCalledOnce();
  expect(borrowed).not.toHaveBeenCalled();
});

it('leaves unsupported clothing complete rather than adding partial fittings', () => {
  const mesh = new THREE.SkinnedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()),
    source = mesh.geometry,
    dispose = vi.spyOn(source, 'dispose');
  expect(hairShapes.createWorkerShirtTrim(mesh, 'collar')).toBeNull();
  expect(mesh.geometry).toBe(source);
  expect(dispose).not.toHaveBeenCalled();
});

it('rounds arm tube seams with corner-angle weights while preserving sharp and incompatible corners', () => {
  function fan(split: boolean) {
    const positions: number[] = [],
      normals: number[] = [],
      ids: number[] = [];
    const add = (tilt: number, start: number, end: number, joint = 1) => {
      const origin = new THREE.Vector3(),
        u = new THREE.Vector3(1, 0, 0),
        v = new THREE.Vector3(0, Math.cos(tilt), Math.sin(tilt)),
        n = u.clone().cross(v);
      for (const p of [
        origin,
        u.clone().multiplyScalar(Math.cos(start)).addScaledVector(v, Math.sin(start)),
        u.clone().multiplyScalar(Math.cos(end)).addScaledVector(v, Math.sin(end)),
      ]) {
        positions.push(...p.toArray());
        normals.push(...n.toArray());
        ids.push(joint, 0, 0, 0);
      }
    };
    if (split) {
      add(0, 0, Math.PI / 4);
      add(0, Math.PI / 4, Math.PI / 2);
    } else add(0, 0, Math.PI / 2);
    add((55 * Math.PI) / 180, 0, Math.PI / 6);
    // An opposing surface is sharp against both tube faces. A 90-degree
    // face here would also be only35degrees from the second face.
    add(Math.PI, 0, Math.PI / 3);
    add((-55 * Math.PI) / 180, 0, Math.PI / 6, 2);
    const g = new THREE.BufferGeometry(),
      weights = new Float32Array(ids.length);
    for (let i = 0; i < weights.length; i += 4) weights[i] = 1;
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    g.setAttribute('skinIndex', new THREE.Uint8BufferAttribute(ids, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
    g.setIndex(Array.from({ length: positions.length / 3 }, (_, i) => i));
    return g;
  }
  const a = fan(false),
    b = fan(true),
    aa = softenWorkerFaceNormals(a, [1])!,
    bb = softenWorkerFaceNormals(b, [1])!,
    n = (g: THREE.BufferGeometry, i: number) =>
      new THREE.Vector3().fromBufferAttribute(g.attributes.normal, i),
    expected = new THREE.Vector3(0, 0, Math.PI / 2)
      .addScaledVector(
        new THREE.Vector3(0, -Math.sin((55 * Math.PI) / 180), Math.cos((55 * Math.PI) / 180)),
        Math.PI / 6
      )
      .normalize();
  expect(n(aa, 0).distanceTo(expected)).toBeLessThan(1e-6);
  expect(n(bb, 0).distanceTo(expected)).toBeLessThan(1e-6);
  expect(n(aa, 3).distanceTo(expected)).toBeLessThan(1e-6);
  expect(n(aa, 9).distanceTo(n(a, 9))).toBeLessThan(1e-6);
  const legacy = softenWorkerFaceNormals(a)!;
  expect(n(aa, 6).distanceTo(n(legacy, 6))).toBeLessThan(1e-6);
  for (const key of ['position', 'skinIndex', 'skinWeight'])
    expect(aa.attributes[key].array).toEqual(a.attributes[key].array);
  expect(aa.index!.array).toEqual(a.index!.array);
  for (const g of [a, b, aa, bb, legacy]) g.dispose();
});

it('mounts the real-joint arm profile on body skin only and disposes private geometry', () => {
  const scene = new THREE.Group(),
    body = new THREE.Group(),
    head = new THREE.Group(),
    source = new THREE.BoxGeometry(0.2, 0.3, 0.1),
    skin = new THREE.MeshStandardMaterial();
  body.name = 'Worker_Body';
  head.name = 'Worker_Head';
  skin.name = 'Skin';
  const bones = ['UpperArmL', 'LowerArmL', 'UpperArmR', 'LowerArmR', 'WristL'].map((name) => {
    const b = new THREE.Bone();
    b.name = name;
    return b;
  });
  const count = source.attributes.position.count,
    weights = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) weights[i * 4] = 1;
  source.setAttribute('skinIndex', new THREE.Uint8BufferAttribute(new Uint8Array(count * 4), 4));
  source.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  scene.add(body, head, ...bones);
  const m = new THREE.SkinnedMesh(source, skin);
  body.add(m);
  m.bind(new THREE.Skeleton(bones));
  const face = new THREE.Mesh(source, skin);
  head.add(face);
  harness.asset = { scene, animations: [] };
  const borrowed = vi.spyOn(source, 'dispose'),
    material = vi.spyOn(skin, 'dispose');
  const view = render(
    <WorkerModel
      appearance={getWorkerAppearance('Engineer', '', 'arm-wiring')}
      motion={{ activity: 'idle', groundSpeed: 0, seated: false, phase: 0, enabled: false }}
    />
  );
  expect(m.userData.workerSoftArms).toBe(true);
  expect(face.userData.workerSoftArms).toBeUndefined();
  expect(face.userData.workerSoftFace).toBe(true);
  const owned = vi.spyOn(m.geometry, 'dispose');
  view.unmount();
  expect(owned).toHaveBeenCalledOnce();
  expect(borrowed).not.toHaveBeenCalled();
  expect(material).not.toHaveBeenCalled();
});

it('gives Quality Control a private ivory coat on the existing rig and keeps unrelated roles and borrowed assets intact', async () => {
  const { readFileSync } = await import('node:fs'),
    { NodeIO } = await import('@gltf-transform/core'),
    { ALL_EXTENSIONS } = await import('@gltf-transform/extensions'),
    { default: draco } = await import('draco3dgltf'),
    { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const { clone } = await vi.importActual<typeof import('three/addons/utils/SkeletonUtils.js')>(
    'three/addons/utils/SkeletonUtils.js'
  );
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'draco3d.decoder': await draco.createDecoderModule() });
  for (const bodyType of ['masculine', 'feminine'] as const) {
    const doc = await io.readBinary(
      new Uint8Array(readFileSync(`public/models/worker/worker-${bodyType}.glb`))
    );
    for (const e of doc.getRoot().listExtensionsUsed()) e.dispose();
    const bytes = await io.writeBinary(doc),
      asset = await new GLTFLoader().parseAsync(bytes.buffer as ArrayBuffer, ''),
      clones: THREE.Group[] = [],
      borrowed: Array<ReturnType<typeof vi.spyOn>> = [];
    asset.scene.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (m.isSkinnedMesh) borrowed.push(vi.spyOn(m.geometry, 'dispose'));
    });
    harness.asset = asset;
    harness.clone = (s) => {
      const copy = clone(s) as THREE.Group;
      clones.push(copy);
      return copy;
    };
    const appearance = { ...getWorkerAppearance('Quality', '#176557', 'mill-quality'), bodyType };
    const motion: WorkerMotionState = {
      activity: 'working',
      groundSpeed: 0,
      seated: false,
      phase: 0,
      enabled: false,
    };
    const view = render(<WorkerModel appearance={appearance} motion={motion} />),
      model = clones[0],
      coat = model.getObjectByName('quality-authored-lab-coat') as THREE.SkinnedMesh<
        THREE.BufferGeometry,
        THREE.MeshStandardMaterial
      >;
    expect(coat).toBeDefined();
    expect(asset.scene.getObjectByName(coat.name)).toBeUndefined();
    expect(coat.material.color.equals(new THREE.Color('#eef0e7'))).toBe(true);
    expect(coat.geometry.userData.labCoatFit.sourceSupported).toBe(true);
    const privateGeometry = vi.spyOn(coat.geometry, 'dispose'),
      privateMaterial = vi.spyOn(coat.material, 'dispose');
    let far = 0;
    model.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (m.name === 'worker-distant-body' || m.name === 'worker-distant-feet') far++;
      if (m.isSkinnedMesh && /^Worker_Vest-/.test((m.material as THREE.Material).name))
        expect(
          (m.material as THREE.MeshStandardMaterial).color.equals(new THREE.Color('#eef0e7'))
        ).toBe(true);
    });
    expect(far).toBe(2);
    view.unmount();
    expect(privateGeometry).toHaveBeenCalledOnce();
    expect(privateMaterial).toHaveBeenCalledOnce();
    borrowed.forEach((d) => expect(d).not.toHaveBeenCalled());
    const other = render(
      <WorkerModel
        appearance={{
          ...getWorkerAppearance('Engineer', '#176557', 'engineer-unchanged'),
          bodyType,
        }}
        motion={motion}
      />
    );
    expect(clones[1].getObjectByName('quality-authored-lab-coat')).toBeUndefined();
    other.unmount();
    borrowed.forEach((d) => expect(d).not.toHaveBeenCalled());
  }
});

it.each(['clipboard', 'tablet', 'sample-kit'] as const)(
  '%s uses its fitted datum rather than another hidden root offset',
  (tool) => {
    const view = render(<ToolAccessory tool={tool} />),
      assembly = view.container.querySelector('[name="held-' + tool + '-assembly"]');
    expect(assembly).not.toBeNull();
    expect(assembly!.getAttribute('position')).toBeNull();
    expect(assembly!.getAttribute('rotation')).toBeNull();
  }
);
it('preserves unsupported and incomplete-model tool mounts', () => {
  const model = new THREE.Group();
  expect(createWorkerHandheldMount(model, 'tablet')).toBeNull();
  for (const tool of ['none', 'wrench', 'radio', 'magnifier', 'bread-tray', 'trowel'] as const)
    expect(createWorkerHandheldMount(model, tool)).toBeNull();
});

it('keeps both padded faces inward and leaves a real air chamber behind the ear aperture', () => {
  const material = new THREE.MeshBasicMaterial(),
    cup = new THREE.Mesh(SHARED_WORKER_GEOMETRY.hearingCup, material);
  cup.updateMatrixWorld(true);
  const ray = (y: number, direction: number, radius: number) =>
    new THREE.Raycaster(
      new THREE.Vector3(radius, y, 0),
      new THREE.Vector3(0, direction, 0)
    ).intersectObject(cup)[0];
  expect(ray(-0.04, 1, 0.006).point.y).toBeGreaterThan(0.017);
  expect(ray(0.08, -1, 0.006).point.y).toBeGreaterThan(0.026);
  expect(ray(-0.04, 1, 0.03).point.y).toBeCloseTo(-0.0125, 6);
  for (const bodyType of ['masculine', 'feminine'] as const) {
    const pair = createWorkerAccessoryPair('hearing-cups', material, undefined, bodyType);
    for (const [i, side] of [-1, 1].entries()) {
      const matrix = new THREE.Matrix4();
      pair.getMatrixAt(i, matrix);
      const pad = new THREE.Vector3(0, -1, 0).transformDirection(matrix);
      expect(pad.dot(new THREE.Vector3(-side, 0, 0))).toBeGreaterThan(0.999999);
      expect(new THREE.Vector3().setFromMatrixPosition(matrix).x).toBeCloseTo(
        side * WORKER_HEARING_FIT[bodyType].halfWidth,
        7
      );
    }
    pair.dispose();
  }
  material.dispose();
});

it('fits both original ear tips inside the cavity and carries the band clear of each real helmet', async () => {
  const { readFileSync } = await import('node:fs'),
    { NodeIO } = await import('@gltf-transform/core'),
    { ALL_EXTENSIONS } = await import('@gltf-transform/extensions'),
    { default: draco } = await import('draco3dgltf'),
    { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'draco3d.decoder': await draco.createDecoderModule(),
  });
  for (const bodyType of ['masculine', 'feminine'] as const) {
    const doc = await io.readBinary(
      new Uint8Array(readFileSync(`public/models/worker/worker-${bodyType}.glb`))
    );
    for (const e of doc.getRoot().listExtensionsUsed()) e.dispose();
    const bytes = await io.writeBinary(doc),
      asset = await new GLTFLoader().parseAsync(bytes.buffer as ArrayBuffer, '');
    asset.scene.updateMatrixWorld(true);
    const head = asset.scene.getObjectByName('Head')!,
      inverse = head.matrixWorld.clone().invert(),
      skin: THREE.Vector3[] = [],
      helmet = new THREE.BufferGeometry(),
      borrowed: Array<{ geometry: THREE.BufferGeometry; positions: Float32Array }> = [];
    asset.scene.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isSkinnedMesh || !m.parent?.name.includes('Worker_Head') || Array.isArray(m.material))
        return;
      const p = m.geometry.attributes.position,
        positions: number[] = [];
      borrowed.push({ geometry: m.geometry, positions: new Float32Array(p.array) });
      for (let i = 0; i < p.count; i++) {
        const q = new THREE.Vector3().fromBufferAttribute(p, i);
        m.applyBoneTransform(i, q);
        q.applyMatrix4(m.matrixWorld).applyMatrix4(inverse);
        if (m.material.name === 'Skin') skin.push(q);
        positions.push(...q.toArray());
      }
      if (m.material.name === 'Worker_Yellow') {
        helmet.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        if (m.geometry.index) helmet.setIndex(m.geometry.index.clone());
      }
    });
    const fit = WORKER_HEARING_FIT[bodyType],
      material = new THREE.MeshBasicMaterial(),
      shell = new THREE.Mesh(SHARED_WORKER_GEOMETRY.hearingCup, material),
      pair = createWorkerAccessoryPair('hearing-cups', material, undefined, bodyType);
    shell.updateMatrixWorld(true);
    for (const [i, side] of [-1, 1].entries()) {
      const ear = skin.reduce((a, b) => (side * b.x > side * a.x ? b : a)).clone(),
        matrix = new THREE.Matrix4();
      pair.getMatrixAt(i, matrix);
      ear.sub(new THREE.Vector3(...fit.centre)).applyMatrix4(matrix.invert());
      expect(Math.hypot(ear.x, ear.z)).toBeLessThan(0.025);
      expect(ear.y).toBeGreaterThan(-0.0125);
      const inner = new THREE.Raycaster(
        new THREE.Vector3(ear.x, -0.04, ear.z),
        new THREE.Vector3(0, 1, 0)
      ).intersectObject(shell)[0];
      expect(inner.point.y - ear.y).toBeGreaterThan(0.006);
    }
    const hatMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
      hat = new THREE.Mesh(helmet, hatMaterial),
      origin = new THREE.Vector3(fit.centre[0], 0.175, fit.centre[2]);
    hat.updateMatrixWorld(true);
    for (let step = 1; step < 24; step++) {
      const angle = (step * Math.PI) / 24,
        point = new THREE.Vector3(
          fit.centre[0] + 0.128 * Math.cos(angle),
          fit.centre[1] + 0.002 + 0.128 * fit.bandScaleY * Math.sin(angle),
          fit.centre[2]
        ),
        distance = point.distanceTo(origin),
        hits = new THREE.Raycaster(origin, point.clone().sub(origin).normalize()).intersectObject(
          hat
        );
      if (hits.length) expect(distance - hits.at(-1)!.distance).toBeGreaterThan(0.01);
    }
    for (const b of borrowed) expect(b.geometry.attributes.position.array).toEqual(b.positions);
    pair.dispose();
    helmet.dispose();
    material.dispose();
    hatMaterial.dispose();
  }
});

it('admits briefing attention only in stationary idle, freezes it at pause and clears missing legacy cues', () => {
  const scene = new THREE.Group(),
    body = new THREE.Group(),
    hips = new THREE.Group(),
    abdomen = new THREE.Bone(),
    head = new THREE.Bone();
  body.name = 'Body';
  hips.name = 'Hips';
  abdomen.name = 'Abdomen';
  head.name = 'Head';
  scene.add(body);
  body.add(hips);
  hips.add(abdomen);
  abdomen.add(head);
  harness.asset = {
    scene,
    animations: ['idle', 'walk', 'run', 'inspect', 'break'].map(
      (name) =>
        new THREE.AnimationClip(`worker-${name}`, 2, [
          new THREE.NumberKeyframeTrack('Body.position[y]', [0, 2], [0, 0]),
        ])
    ),
  };
  const originalSample = workerPoses.sampleWorkerGesture;
  const sample = vi.spyOn(workerPoses, 'sampleWorkerGesture'),
    wave = vi.spyOn(workerPoses, 'sampleWorkerGreeting');
  const motion: WorkerMotionState = {
    activity: 'idle',
    briefing: true,
    greeting: true,
    groundSpeed: 0,
    seated: false,
    phase: 3,
    enabled: false,
  };
  const view = render(
    <WorkerModel
      appearance={getWorkerAppearance('Engineer', '', 'briefing-renderer')}
      motion={motion}
    />
  );
  harness.frame?.({}, 1 / 60);
  expect(sample.mock.calls.at(-1)![0]).toBe('briefing');
  expect(sample.mock.calls.at(-1)![1]).toBe(3);
  expect(wave).not.toHaveBeenCalled();
  const held = head.quaternion.toArray(),
    calls = sample.mock.calls.length;
  harness.frame?.({}, 100);
  expect(head.quaternion.toArray()).toEqual(held);
  expect(sample.mock.calls).toHaveLength(calls);
  motion.briefing = undefined;
  motion.greeting = false;
  harness.frame?.({}, 100);
  expect(sample.mock.calls.at(-1)![0]).toBe('idle');
  expect(sample.mock.calls.at(-1)![1]).toBe(3);
  expect(new THREE.Quaternion().fromArray(held).angleTo(head.quaternion)).toBeGreaterThan(0.05);
  motion.briefing = true;
  motion.activity = 'working';
  harness.frame?.({}, 1 / 60);
  expect(sample.mock.calls.at(-1)![0]).toBe('inspect');
  motion.activity = 'idle';
  motion.seated = true;
  harness.frame?.({}, 1 / 60);
  expect(sample.mock.calls.at(-1)![0]).toBe('rest');
  motion.seated = false;
  motion.groundSpeed = 1;
  motion.activity = 'walking';
  harness.frame?.({}, 1 / 60);
  expect(sample.mock.calls.at(-1)![0]).toBe('idle');
  motion.activity = 'idle';
  motion.groundSpeed = 0;
  motion.cartGrip = 'push';
  harness.frame?.({}, 1 / 60);
  expect(sample.mock.calls.at(-1)![0]).toBe('idle');
  motion.cartGrip = undefined;
  motion.seat = { amount: 0.3, support: 0.6, x: 0, z: 0, yaw: 0 };
  harness.frame?.({}, 1 / 60);
  expect(sample.mock.calls.at(-1)![0]).toBe('idle');
  motion.seat = undefined;
  motion.enabled = true;
  harness.frame?.({}, 1 / 60);
  expect(sample.mock.calls.at(-1)![0]).toBe('briefing');
  expect(sample.mock.calls.at(-1)![1]).toBeGreaterThan(3);
  motion.briefing = false;
  motion.attentionYaw = 0.26;
  motion.greeting = true;
  motion.greetingYaw = 0.4;
  motion.greetingTargetId = 'previous-neighbour';
  for (let frame = 0; frame < 15; frame++) harness.frame?.({}, 0.05);
  motion.briefing = true;
  motion.enabled = false;
  const wavesBefore = wave.mock.calls.length;
  harness.frame?.({}, 0.05);
  const [kind, time, target] = sample.mock.calls.at(-1)!;
  expect(kind).toBe('briefing');
  expect(wave).toHaveBeenCalledTimes(wavesBefore);
  const expected = originalSample('briefing', time, workerPoses.createWorkerGesture());
  expect(target.lookYaw).toBe(expected.lookYaw);
  expect(target.lookPitch).toBe(expected.lookPitch);
  view.unmount();
});

it.each(['masculine', 'feminine'] as const)(
  '%s uses the authored neutral standing clip for briefing and hands back the real gait cleanly',
  async (bodyType) => {
    const { readFileSync } = await import('node:fs');
    const { NodeIO } = await import('@gltf-transform/core');
    const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions');
    const { default: draco } = await import('draco3dgltf');
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const { clone } = await vi.importActual<typeof import('three/addons/utils/SkeletonUtils.js')>(
      'three/addons/utils/SkeletonUtils.js'
    );
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
      'draco3d.decoder': await draco.createDecoderModule(),
    });
    const document = await io.readBinary(
      new Uint8Array(readFileSync(`public/models/worker/worker-${bodyType}.glb`))
    );
    for (const extension of document.getRoot().listExtensionsUsed()) extension.dispose();
    const bytes = await io.writeBinary(document);
    const asset = await new GLTFLoader().parseAsync(bytes.buffer as ArrayBuffer, '');
    const neutral = clone(asset.scene),
      neutralMixer = new THREE.AnimationMixer(neutral);
    neutralMixer.clipAction(asset.animations.find((c) => c.name === 'worker-break')!).play();
    neutralMixer.update(0);
    neutral.updateMatrixWorld(true);
    const calfEnds = ['L', 'R'].map((side) =>
      neutral
        .getObjectByName('LowerLeg' + side)!
        .worldToLocal(neutral.getObjectByName('Foot' + side)!.getWorldPosition(new THREE.Vector3()))
    );
    neutralMixer.stopAllAction();
    neutralMixer.uncacheRoot(neutral);
    let model: THREE.Object3D;
    harness.clone = (source) => (model = clone(source)) as THREE.Group;
    harness.asset = asset;
    const play = vi.spyOn(THREE.AnimationAction.prototype, 'play');
    const motion: WorkerMotionState = {
      activity: 'idle',
      briefing: true,
      groundSpeed: 0,
      seated: false,
      enabled: false,
      phase: 2.3,
    };
    const view = render(
      <WorkerModel
        appearance={{
          ...getWorkerAppearance('Engineer', '', 'neutral-briefing'),
          bodyType,
          bodyScale: 1,
          heightScale: 1,
        }}
        motion={motion}
      />
    );
    const tool = view.container.querySelector(
      '[name="worker-held-tool"]'
    ) as unknown as THREE.Group;
    tool.position = new THREE.Vector3();
    const actions = Object.fromEntries(play.mock.contexts.map((a) => [a.getClip().name, a]));
    // Mount must select the same neutral base as an admitted frame.
    expect(actions['worker-break'].getEffectiveWeight()).toBe(1);
    const feet = () =>
      ['FootL', 'FootR'].map((n) =>
        model!.getObjectByName(n)!.getWorldPosition(new THREE.Vector3())
      );
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 1.7, 5);
    const frame = () => {
      harness.frame?.({ camera }, 1 / 60);
      model!.updateMatrixWorld(true);
    };
    frame();
    expect(Math.abs(feet()[0].z - feet()[1].z)).toBeLessThan(0.06);
    motion.enabled = true;
    let previous = feet(),
      maxStep = 0,
      maxSeam = 0;
    for (let i = 0; i < 270; i++) {
      if (i === 30) {
        motion.briefing = false;
        motion.activity = 'walking';
        motion.groundSpeed = 1.1;
      }
      if (i === 150) {
        motion.briefing = true;
        motion.activity = 'idle';
        motion.groundSpeed = 0;
      }
      frame();
      const current = feet();
      current.forEach((p, j) => {
        maxStep = Math.max(maxStep, p.distanceTo(previous[j]));
        const calf = model!.getObjectByName('LowerLeg' + ['L', 'R'][j])!;
        maxSeam = Math.max(maxSeam, calf.localToWorld(calfEnds[j].clone()).distanceTo(p));
      });
      previous = current;
      if (i === 145) {
        expect(actions['worker-walk'].getEffectiveWeight()).toBeGreaterThan(0.99999);
        const control = clone(asset.scene),
          mixer = new THREE.AnimationMixer(control),
          action = mixer.clipAction(asset.animations.find((c) => c.name === 'worker-walk')!).play();
        action.time = actions['worker-walk'].time;
        mixer.update(0);
        control.updateMatrixWorld(true);
        for (const name of ['FootL', 'FootR', 'UpperLegL', 'UpperLegR', 'LowerLegL', 'LowerLegR']) {
          const actualBone = model!.getObjectByName(name)!,
            expectedBone = control.getObjectByName(name)!;
          if (name.startsWith('Foot'))
            actualBone.matrixWorld.elements.forEach((v, k) => {
              const delta = v - expectedBone.matrixWorld.elements[k];
              if (k === 13) {
                expect(delta).toBeGreaterThanOrEqual(-1e-6);
                expect(delta).toBeLessThan(0.035);
              } else expect(Math.abs(delta)).toBeLessThan(1e-6);
            });
          else {
            expect(actualBone.position.toArray()).toEqual(expectedBone.position.toArray());
            expect(actualBone.scale.toArray()).toEqual(expectedBone.scale.toArray());
          }
        }
        mixer.stopAllAction();
        mixer.uncacheRoot(control);
      }
    }
    expect(maxStep, 'admitted neutral/gait handover').toBeLessThan(0.08);
    expect(maxSeam, 'actual calf meets the independent boot through handover').toBeLessThan(0.02);
    expect(actions['worker-break'].getEffectiveWeight()).toBeGreaterThan(0.99999);
    expect(Math.abs(feet()[0].z - feet()[1].z)).toBeLessThan(0.06);
    for (const side of ['L', 'R']) {
      const foot = model!.getObjectByName('Foot' + side)!;
      let sole = Infinity,
        hits = 0;
      model!.traverse((object) => {
        const mesh = object as THREE.SkinnedMesh;
        if (!mesh.isSkinnedMesh || !mesh.parent?.name.includes('Worker_Feet')) return;
        mesh.skeleton.update();
        const joint = mesh.skeleton.bones.indexOf(foot as THREE.Bone),
          indices = mesh.geometry.attributes.skinIndex,
          weights = mesh.geometry.attributes.skinWeight;
        for (let i = 0; i < indices.count; i++) {
          if (
            ![0, 1, 2, 3].some(
              (j) => indices.getComponent(i, j) === joint && weights.getComponent(i, j) > 0.5
            )
          )
            continue;
          sole = Math.min(
            sole,
            mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld).y
          );
          hits++;
        }
      });
      expect(hits).toBeGreaterThan(8);
      expect(sole, 'actual neutral boot sole').toBeGreaterThan(-0.003);
      expect(sole, 'actual neutral boot sole').toBeLessThan(0.003);
    }

    motion.enabled = false;
    frame();
    const held = feet(),
      head = model!.getObjectByName('Head')!.quaternion.toArray();
    harness.frame?.({ camera }, 100);
    feet().forEach((p, j) => expect(p.distanceTo(held[j])).toBeLessThan(1e-9));
    expect(model!.getObjectByName('Head')!.quaternion.toArray()).toEqual(head);
    motion.briefing = undefined;
    frame();
    expect(actions['worker-idle'].getEffectiveWeight()).toBe(1);
    expect(Math.abs(feet()[0].z - feet()[1].z)).toBeGreaterThan(0.2);
    process.stderr.write(
      JSON.stringify({ bodyType, briefingMaxStep: maxStep, briefingMaxSeam: maxSeam }) + '\n'
    );
    view.unmount();
  },
  30000
);

describe('startup softening of the borrowed worker bodies', () => {
  /**
   * Normals of `softenWorkerFaceNormals(geometry, [])` and `(geometry, armJoints)`
   * per mesh, sha256 first 16 hex, taken on 3d2af742 before the shared copy.
   */
  const GOLDEN_3D2AF742: Record<string, string> = {
    'masculine Worker_Body/Cube027': 'a849228b045644a2:f7778a43dd6fb9b5',
    'masculine Worker_Body/Cube027_1': 'ce757321d8b43a23:07f3ffe365471a8c',
    'masculine Worker_Body/Cube027_2': '7b6d676270b682b1:b2ddd717d8523de9',
    'masculine Worker_Body/Cube027_3': 'e5e77fdc4ccd9872:348b5c71c9200f7d',
    'masculine Worker_Feet/Cube028': '2fa49cbb348d98b8:2fa49cbb348d98b8',
    'masculine Worker_Feet/Cube028_1': 'c9930b1b04945fd0:c9930b1b04945fd0',
    'masculine Worker_Head/Cube031': '6c813997736f594d:6c813997736f594d',
    'masculine Worker_Head/Cube031_1': '0c10dfb22c9e2f1c:0c10dfb22c9e2f1c',
    'masculine Worker_Head/Cube031_2': '7246d24fed3b4e23:7246d24fed3b4e23',
    'masculine Worker_Head/Cube031_3': '1fad107c809982a4:1fad107c809982a4',
    'masculine Worker_Head/Cube031_4': 'c735b0ea88dfb534:c735b0ea88dfb534',
    'masculine Worker_Legs/Cube029': 'f48f0d50d96efa47:f48f0d50d96efa47',
    'masculine Worker_Legs/Cube029_1': '72c1e319f6458a43:72c1e319f6458a43',
    'feminine Worker_Body/Cube009': 'dc7cd997c8d00453:a65fcd1ee5ca632e',
    'feminine Worker_Body/Cube009_1': '676cf630581c38c3:a0d932d883038919',
    'feminine Worker_Body/Cube009_2': '017cf401a189c196:45ea9d944d79404b',
    'feminine Worker_Body/Cube009_3': '88132651e7a25157:06bb6cbd330c9989',
    'feminine Worker_Feet/Cube055': '57a93d47d2e83dd6:57a93d47d2e83dd6',
    'feminine Worker_Feet/Cube055_1': '3f810d8093a4210b:3f810d8093a4210b',
    'feminine Worker_Head/Cube035': '9a1d9c901d4a0b90:9a1d9c901d4a0b90',
    'feminine Worker_Head/Cube035_1': '463e8706dfe0a52d:463e8706dfe0a52d',
    'feminine Worker_Head/Cube035_2': '9f2a72fc99624732:9f2a72fc99624732',
    'feminine Worker_Head/Cube035_3': '0962d2e74b1952bc:0962d2e74b1952bc',
    'feminine Worker_Legs/Cube056': 'ab8860098d4f10e2:ab8860098d4f10e2',
    'feminine Worker_Legs/Cube056_1': '8548ae280242199d:8548ae280242199d',
  };

  const loadWorker = async (bodyType: 'masculine' | 'feminine') => {
    const { readFileSync } = await import('node:fs'),
      { NodeIO } = await import('@gltf-transform/core'),
      { ALL_EXTENSIONS } = await import('@gltf-transform/extensions'),
      { default: draco } = await import('draco3dgltf'),
      { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const io = new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({ 'draco3d.decoder': await draco.createDecoderModule() });
    const doc = await io.readBinary(
      new Uint8Array(readFileSync(`public/models/worker/worker-${bodyType}.glb`))
    );
    for (const e of doc.getRoot().listExtensionsUsed()) e.dispose();
    const bytes = await io.writeBinary(doc);
    return new GLTFLoader().parseAsync(bytes.buffer as ArrayBuffer, '');
  };

  const digest = async (array: ArrayBufferView) => {
    const { createHash } = await import('node:crypto');
    return createHash('sha256')
      .update(new Uint8Array(array.buffer, array.byteOffset, array.byteLength))
      .digest('hex')
      .slice(0, 16);
  };

  /** Every attribute, index and field a renderer or later fitting step reads. */
  const bytesOf = async (geometry: THREE.BufferGeometry) => ({
    index: geometry.index ? await digest(geometry.index.array) : null,
    attributes: await Promise.all(
      Object.entries(geometry.attributes).map(async ([name, a]) => [
        name,
        a.itemSize,
        a.normalized,
        await digest((a as THREE.BufferAttribute).array),
      ])
    ),
    morph: Object.keys(geometry.morphAttributes),
    groups: geometry.groups,
    box: geometry.boundingBox?.min.toArray().concat(geometry.boundingBox.max.toArray()) ?? null,
    name: geometry.name,
  });

  it('hands each worker a private copy of one softening per borrowed geometry', async () => {
    for (const bodyType of ['masculine', 'feminine'] as const) {
      const asset = await loadWorker(bodyType);
      const meshes: THREE.SkinnedMesh[] = [];
      asset.scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.SkinnedMesh);
      });
      expect(meshes.length).toBeGreaterThan(10);
      for (const mesh of meshes) {
        const arms: number[] = [];
        if (mesh.isSkinnedMesh)
          mesh.skeleton.bones.forEach((bone, index) => {
            if (/^(UpperArm|LowerArm)[LR]$/.test(bone.name)) arms.push(index);
          });
        const source = mesh.geometry,
          normal = source.getAttribute('normal') as THREE.BufferAttribute,
          label = `${bodyType} ${mesh.parent?.name}/${mesh.name}`;
        const hashes: string[] = [];
        for (const joints of [[], arms]) {
          const direct = softenWorkerFaceNormals(source, joints)!;
          const reads = vi.spyOn(normal, 'getX');
          const first = softenSharedWorkerGeometry(source, joints)!;
          const softened = reads.mock.calls.length;
          expect(softened, label).toBeGreaterThan(0);
          const second = softenSharedWorkerGeometry(source, joints)!;
          expect(reads.mock.calls.length, `${label} repeat reads`).toBe(softened);
          reads.mockRestore();
          expect(await bytesOf(first), label).toEqual(await bytesOf(direct));
          expect(await bytesOf(second), label).toEqual(await bytesOf(direct));
          expect(second.userData).toBe(direct.userData);
          expect(second).not.toBe(first);
          for (const name of Object.keys(first.attributes))
            expect(second.getAttribute(name).array).not.toBe(first.getAttribute(name).array);
          hashes.push(await digest(first.getAttribute('normal').array));
          first.dispose();
          second.dispose();
          direct.dispose();
        }
        expect(hashes.join(':'), label).toBe(GOLDEN_3D2AF742[label]);
      }
      // A re-uploaded source normal buffer is softened afresh, never served stale.
      const body = meshes.find((m) => m.parent?.name === 'Worker_Body')!;
      const before = softenSharedWorkerGeometry(body.geometry)!;
      const normal = body.geometry.getAttribute('normal') as THREE.BufferAttribute;
      normal.setX(0, -normal.getX(0));
      normal.needsUpdate = true;
      const after = softenSharedWorkerGeometry(body.geometry)!;
      expect(await bytesOf(after)).toEqual(await bytesOf(softenWorkerFaceNormals(body.geometry)!));
      expect(await bytesOf(after)).not.toEqual(await bytesOf(before));
    }
  }, 120_000);

  it('builds a second identical worker without re-reading the borrowed normals', async () => {
    const { clone } = await vi.importActual<typeof import('three/addons/utils/SkeletonUtils.js')>(
      'three/addons/utils/SkeletonUtils.js'
    );
    for (const bodyType of ['masculine', 'feminine'] as const) {
      const asset = await loadWorker(bodyType);
      const clones: THREE.Group[] = [];
      harness.asset = asset;
      harness.clone = (s) => {
        const copy = clone(s) as THREE.Group;
        clones.push(copy);
        return copy;
      };
      const reads: Array<ReturnType<typeof vi.spyOn>> = [];
      asset.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) reads.push(vi.spyOn(m.geometry.getAttribute('normal'), 'getX'));
      });
      const readCount = () => reads.reduce((n, spy) => n + spy.mock.calls.length, 0);
      const appearance = { ...getWorkerAppearance('Engineer', '#176557', 'crowd'), bodyType };
      const motion: WorkerMotionState = {
        activity: 'working',
        groundSpeed: 0,
        seated: false,
        phase: 0,
        enabled: false,
      };
      const first = render(<WorkerModel appearance={appearance} motion={motion} />);
      const firstReads = readCount();
      expect(firstReads).toBeGreaterThan(0);
      const second = render(<WorkerModel appearance={appearance} motion={motion} />);
      // Softening was ~41,700 of the first worker's reads (masculine); the few
      // dozen left are other fittings that read the borrowed buffers directly.
      // Before the shared copy the second worker repeated all of them.
      expect(readCount() - firstReads, bodyType).toBeLessThan(firstReads / 100);
      expect(clones).toHaveLength(2);
      // The two workers carry the same geometry bytes, mesh for mesh, in private buffers.
      const dump = async (model: THREE.Group) => {
        const out: unknown[] = [];
        const meshes: THREE.Mesh[] = [];
        model.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
        });
        for (const m of meshes) out.push([m.name, await bytesOf(m.geometry)]);
        return out;
      };
      expect(await dump(clones[1])).toEqual(await dump(clones[0]));
      const owned: THREE.BufferGeometry[] = [];
      clones[0].traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && m.userData.workerSoftFace) owned.push(m.geometry);
      });
      expect(owned.length).toBeGreaterThan(0);
      clones[1].traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) expect(owned).not.toContain(m.geometry);
      });
      first.unmount();
      second.unmount();
    }
  }, 120_000);
});

it('keeps an unexcited ponytail neutral and restores exact rest after locomotion', () => {
  const source = WORKER_HAIR_GEOMETRIES.ponytail;
  const hair = createWorkerHairMotion(source);
  try {
    const rest = source.attributes.position.array.slice();
    const restNormals = source.attributes.normal.array.slice();
    hair.apply(1.1, 1 / 60, 0, true);
    expect(
      hair.geometry.attributes.position.array,
      'resting hair has no independent oscillator'
    ).toEqual(rest);
    for (let i = 0; i < 120; i++) hair.apply(i / 60, 1 / 60, 1.5, false);
    expect(hair.geometry.attributes.position.array).not.toEqual(rest);
    for (let i = 120; i < 720; i++) hair.apply(i / 60, 1 / 60, 0, true);
    expect(hair.geometry.attributes.position.array, 'stopped hair genuinely settles').toEqual(rest);
    expect(hair.geometry.attributes.normal.array).toEqual(restNormals);
    const version = hair.geometry.attributes.position.version;
    hair.apply(20, 1 / 60, 0, true);
    expect(hair.geometry.attributes.position.version).toBe(version);
  } finally {
    hair.dispose();
  }
});

it.each(['short', 'medium', 'curly', 'ponytail'] as const)(
  '%s civilian hair has a real crown, finite sculpt normals and a continuous seam within its original budget',
  (style) => {
    const g = WORKER_HAIR_GEOMETRIES[style],
      p = g.attributes.position,
      n = g.attributes.normal,
      uv = g.attributes.uv;
    const a = new THREE.Vector3(),
      b = new THREE.Vector3(),
      c = new THREE.Vector3(),
      face = new THREE.Vector3(),
      mean = new THREE.Vector3();
    expect(p.count / 3).toBeLessThan(1800);
    for (let i = 0; i < p.count; i += 3) {
      a.fromBufferAttribute(p, i);
      b.fromBufferAttribute(p, i + 1);
      c.fromBufferAttribute(p, i + 2);
      face.subVectors(b, a).cross(c.clone().sub(a));
      expect(face.lengthSq(), `${style} collapsed crown`).toBeGreaterThan(1e-14);
      mean
        .fromBufferAttribute(n, i)
        .add(new THREE.Vector3().fromBufferAttribute(n, i + 1))
        .add(new THREE.Vector3().fromBufferAttribute(n, i + 2));
      expect(face.dot(mean), `${style} outward finish`).toBeGreaterThan(0);
    }
    let checked = 0;
    for (let i = 0; i < p.count; i++) {
      if (Math.abs(uv.getX(i)) > 1e-7 || uv.getY(i) <= 0 || uv.getY(i) >= 1) continue;
      const opposite = Array.from({ length: p.count }, (_, j) => j).find(
        (j) =>
          Math.abs(uv.getX(j) - 1) < 1e-7 &&
          Math.abs(uv.getY(j) - uv.getY(i)) < 1e-7 &&
          new THREE.Vector3().fromBufferAttribute(p, j).distanceTo(a.fromBufferAttribute(p, i)) <
            1e-6
      );
      if (opposite === undefined) continue;
      expect(
        new THREE.Vector3().fromBufferAttribute(n, opposite).distanceTo(b.fromBufferAttribute(n, i))
      ).toBeLessThan(1e-4);
      checked++;
    }
    expect(checked).toBeGreaterThan(5);
    expect(g.boundingBox!.max.y).toBeLessThan(0.24);
    expect(g.boundingBox!.min.x).toBeGreaterThan(-0.13);
    expect(g.boundingBox!.max.x).toBeLessThan(0.13);
    expect(g.boundingBox!.max.z).toBeLessThan(0.13);
  }
);

it.each(['masculine', 'feminine'] as const)(
  '%s closes private civilian heads before LOD and keeps helmet/fallback scalp ownership intact',
  async (bodyType) => {
    const { readFileSync } = await import('node:fs'),
      { NodeIO } = await import('@gltf-transform/core'),
      { ALL_EXTENSIONS } = await import('@gltf-transform/extensions'),
      { default: draco } = await import('draco3dgltf'),
      { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const { clone } = await vi.importActual<typeof import('three/addons/utils/SkeletonUtils.js')>(
      'three/addons/utils/SkeletonUtils.js'
    );
    const io = new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({ 'draco3d.decoder': await draco.createDecoderModule() });
    const document = await io.readBinary(
      new Uint8Array(readFileSync(`public/models/worker/worker-${bodyType}.glb`))
    );
    for (const extension of document.getRoot().listExtensionsUsed()) extension.dispose();
    const bytes = await io.writeBinary(document),
      asset = await new GLTFLoader().parseAsync(bytes.buffer as ArrayBuffer, '');
    const borrowed = new Set<THREE.BufferGeometry>();
    asset.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) borrowed.add(m.geometry);
    });
    const sourceDispose = [...borrowed].map((g) => vi.spyOn(g, 'dispose'));
    harness.asset = asset;
    const copies: THREE.Group[] = [];
    harness.clone = (s) => {
      const c = clone(s) as THREE.Group;
      copies.push(c);
      return c;
    };
    const motion: WorkerMotionState = {
      activity: 'idle',
      groundSpeed: 0,
      seated: false,
      phase: 0,
      enabled: false,
    };
    const appearance = {
      ...getWorkerAppearance('Resident', '#597665', 'bus-departing'),
      bodyType,
      hairStyle: 'bald' as const,
    };
    const first = render(<WorkerModel appearance={appearance} motion={motion} />);
    const second = render(
      <WorkerModel appearance={{ ...appearance, skinTone: '#d3a080' }} motion={{ ...motion }} />
    );
    const closed = (model: THREE.Group) => {
      let found!: THREE.SkinnedMesh;
      model.traverse((o) => {
        const m = o as THREE.SkinnedMesh;
        if (m.isSkinnedMesh && m.geometry.name === 'worker-closed-head-skin') found = m;
      });
      return found;
    };
    const a = closed(copies[0]),
      b = closed(copies[1]);
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(a.geometry).not.toBe(b.geometry);
    expect(a.skeleton).not.toBe(b.skeleton);
    expect(a.geometry.userData.workerScalpClosure.triangles).toBe(
      bodyType === 'masculine' ? 140 : 178
    );
    expect(first.container.querySelector('[name="worker-authored-hair"]')).toBeNull();
    const cuffs = (model: THREE.Group) => {
      const found: THREE.SkinnedMesh[] = [];
      model.traverse((object) => {
        const mesh = object as THREE.SkinnedMesh;
        if (mesh.isSkinnedMesh && mesh.geometry.userData.workerCuffSockets) found.push(mesh);
      });
      return found;
    };
    const cuffA = cuffs(copies[0]),
      cuffB = cuffs(copies[1]);
    expect(cuffA).toHaveLength(bodyType === 'feminine' ? 1 : 0);
    expect(cuffB).toHaveLength(bodyType === 'feminine' ? 1 : 0);
    const cuffDisposeA = cuffA[0] ? vi.spyOn(cuffA[0].geometry, 'dispose') : undefined;
    const cuffDisposeB = cuffB[0] ? vi.spyOn(cuffB[0].geometry, 'dispose') : undefined;
    if (bodyType === 'feminine') {
      expect(cuffA[0].geometry).not.toBe(cuffB[0].geometry);
      expect(cuffA[0].geometry.userData.workerCuffSockets.removedCapOffsets).toHaveLength(54);
      expect(cuffA[0].geometry.userData.workerCuffSockets.addedTriangles).toBe(90);
    }
    let near = 0,
      far = 0,
      footwear = 0,
      draws = 0;
    copies[0].traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isSkinnedMesh) return;
      draws++;
      footwear += (m.geometry.userData.workerFootwear?.addedTriangles ?? 0) * 3;
      if (m.name.startsWith('worker-distant-')) far += m.geometry.index!.count;
      else if (!Array.isArray(m.material) && m.material.visible) near += m.geometry.index!.count;
    });
    let sourceDraws = 0;
    asset.scene.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) sourceDraws++;
    });
    expect(draws).toBe(sourceDraws + 2);
    expect(footwear).toBeGreaterThan(0);
    expect(far).toBe(near - footwear);
    const disposeA = vi.spyOn(a.geometry, 'dispose'),
      disposeB = vi.spyOn(b.geometry, 'dispose');
    first.unmount();
    expect(disposeA).toHaveBeenCalledOnce();
    expect(disposeB).not.toHaveBeenCalled();
    if (cuffDisposeA) expect(cuffDisposeA).toHaveBeenCalledOnce();
    if (cuffDisposeB) expect(cuffDisposeB).not.toHaveBeenCalled();
    sourceDispose.forEach((spy) => expect(spy).not.toHaveBeenCalled());
    second.unmount();
    expect(disposeB).toHaveBeenCalledOnce();
    for (const mode of ['helmet', 'rejected'] as const) {
      harness.clone = (s) => {
        const c = clone(s) as THREE.Group;
        copies.push(c);
        if (mode === 'rejected')
          c.traverse((o) => {
            const m = o as THREE.SkinnedMesh;
            if (
              m.isSkinnedMesh &&
              m.parent?.name.includes('Worker_Head') &&
              !Array.isArray(m.material) &&
              ['Eyebrows', 'DarkBrown'].includes(m.material.name)
            )
              m.bindMatrix.elements[12] += 0.01;
          });
        return c;
      };
      const view = render(
        <WorkerModel
          appearance={{ ...appearance, hasHardHat: mode === 'helmet', hairStyle: 'short' }}
          motion={{ ...motion }}
        />
      );
      const model = copies.at(-1)!;
      expect(closed(model)).toBeUndefined();
      let brow!: THREE.SkinnedMesh;
      model.traverse((o) => {
        const m = o as THREE.SkinnedMesh;
        if (
          m.isSkinnedMesh &&
          m.parent?.name.includes('Worker_Head') &&
          !Array.isArray(m.material) &&
          /^(Eyebrows|DarkBrown)-/.test(m.material.name)
        )
          brow = m;
      });
      let original!: THREE.SkinnedMesh;
      asset.scene.traverse((o) => {
        const m = o as THREE.SkinnedMesh;
        if (
          m.isSkinnedMesh &&
          m.parent?.name.includes('Worker_Head') &&
          !Array.isArray(m.material) &&
          ['Eyebrows', 'DarkBrown'].includes(m.material.name)
        )
          original = m;
      });
      expect(brow.geometry.index!.count).toBe(original.geometry.index!.count);
      expect(view.container.querySelector('[name="worker-authored-hair"]')).toBeNull();
      view.unmount();
    }
    sourceDispose.forEach((spy) => expect(spy).not.toHaveBeenCalled());
  }
);

it.each(['masculine', 'feminine'] as const)(
  '%s loose workwear hems follow admitted gait, preserve support and settle exactly',
  async (bodyType) => {
    const { readFileSync } = await import('node:fs');
    const { NodeIO } = await import('@gltf-transform/core');
    const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions');
    const { default: draco } = await import('draco3dgltf');
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const { clone } = await vi.importActual<typeof import('three/addons/utils/SkeletonUtils.js')>(
      'three/addons/utils/SkeletonUtils.js'
    );
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
      'draco3d.decoder': await draco.createDecoderModule(),
    });
    const doc = await io.readBinary(
      new Uint8Array(readFileSync(`public/models/worker/worker-${bodyType}.glb`))
    );
    for (const extension of doc.getRoot().listExtensionsUsed()) extension.dispose();
    const bytes = await io.writeBinary(doc);
    const asset = await new GLTFLoader().parseAsync(bytes.buffer as ArrayBuffer, '');
    for (const make of [createBakerApron, createWorkerLabCoat]) {
      const a = make(clone(asset.scene))!;
      const b = make(clone(asset.scene))!;
      const untouched = b.geometry.attributes.position.array.slice();
      const rest = a.geometry.attributes.position.array.slice();
      const restNormal = a.geometry.attributes.normal.array.slice();
      const attributes = Object.fromEntries(
        Object.entries(a.geometry.attributes)
          .filter(([key]) => !['position', 'normal'].includes(key))
          .map(([key, value]) => [key, value.array.slice()])
      );
      const topology = a.geometry.index!.array.slice();
      const controller = createWorkerGarmentMotion(a)!;
      expect(controller).not.toBeNull();
      const fit = a.geometry.userData.apronFit ?? a.geometry.userData.labCoatFit;
      const hinge =
        fit.hem +
        (a.geometry.userData.apronFit ? Math.min(0.2, (fit.waist - fit.hem) * 0.65) : 0.16);
      let movement = 0;
      for (let frame = 1; frame <= 90; frame++)
        controller.apply(1 / 60, 1.1, (frame / 60) * 4.8, false);
      for (let i = 0; i < a.geometry.attributes.position.count; i++) {
        const p = a.geometry.attributes.position;
        const distance = Math.hypot(
          p.getX(i) - rest[i * 3],
          p.getY(i) - rest[i * 3 + 1],
          p.getZ(i) - rest[i * 3 + 2]
        );
        movement = Math.max(movement, distance);
        if (rest[i * 3 + 1] >= hinge || i < (fit.tailStart ?? 0)) expect(distance).toBe(0);
        const n = a.geometry.attributes.normal;
        expect(Number.isFinite(n.getX(i) + n.getY(i) + n.getZ(i))).toBe(true);
        if (distance > 0) expect(Math.hypot(n.getX(i), n.getY(i), n.getZ(i))).toBeCloseTo(1, 5);
        expect(p.getY(i)).toBe(rest[i * 3 + 1]);
      }
      expect(movement).toBeGreaterThan(0.003);
      expect(movement).toBeLessThan(0.013);
      const held = a.geometry.attributes.position.array.slice();
      const version = a.geometry.attributes.position.version;
      for (const delta of [0, -1, NaN, Infinity]) controller.apply(delta, 2, 20, false);
      expect(a.geometry.attributes.position.array).toEqual(held);
      expect(a.geometry.attributes.position.version).toBe(version);
      for (let frame = 0; frame < 180; frame++) controller.apply(1 / 60, 0, frame, true);
      expect(a.geometry.attributes.position.array).toEqual(rest);
      expect(a.geometry.attributes.normal.array).toEqual(restNormal);
      const settledVersion = a.geometry.attributes.position.version;
      controller.apply(0.1, 0, 100, false);
      expect(a.geometry.attributes.position.version).toBe(settledVersion);
      expect(b.geometry.attributes.position.array).toEqual(untouched);
      expect(a.geometry.index!.array).toEqual(topology);
      for (const [key, value] of Object.entries(attributes))
        expect(a.geometry.attributes[key].array).toEqual(value);
      const byRate: Float32Array[] = [];
      for (const hz of [30, 60, 120]) {
        const garment = make(clone(asset.scene))!;
        const motion = createWorkerGarmentMotion(garment)!;
        for (let frame = 1; frame <= hz * 2; frame++)
          motion.apply(1 / hz, 1.1, (frame / hz) * 4.8, false);
        byRate.push(new Float32Array(garment.geometry.attributes.position.array));
      }
      for (const candidate of byRate.slice(1)) {
        let max = 0;
        for (let i = 0; i < candidate.length; i++)
          max = Math.max(max, Math.abs(candidate[i] - byRate[0][i]));
        expect(max).toBeLessThan(0.0003);
      }
      const instances: THREE.Group[] = [];
      harness.asset = asset;
      harness.clone = (scene) => {
        const copy = clone(scene);
        instances.push(copy);
        return copy;
      };
      const motion: WorkerMotionState = {
        activity: 'walking',
        groundSpeed: 1.1,
        seated: false,
        phase: 0.7,
        enabled: true,
      };
      const appearance = {
        ...getWorkerAppearance(
          make === createBakerApron ? 'Baker' : 'Quality',
          '',
          'garment-mount'
        ),
        bodyType,
      };
      const view = render(<WorkerModel appearance={appearance} motion={motion} />);
      // This DOM harness needs the same Three-style ref used by the existing
      // mounted tool tests; the native check retains the actual R3F group.
      const tool = view.container.querySelector(
        '[name="worker-held-tool"]'
      ) as unknown as THREE.Group;
      if (tool) tool.position = new THREE.Vector3();
      const cloth = instances[0].getObjectByName(a.name) as THREE.SkinnedMesh;
      const start = cloth.geometry.attributes.position.array.slice();
      const disposed = vi.spyOn(cloth.geometry, 'dispose');
      const far = instances[0].getObjectByName('worker-distant-body') as THREE.SkinnedMesh;
      const farRest = far.geometry.attributes.position.array.slice();
      for (let frame = 0; frame < 60; frame++) harness.frame?.({}, 1 / 60);
      expect(cloth.geometry.attributes.position.array).not.toEqual(start);
      expect(far.geometry.attributes.position.array).toEqual(farRest);
      motion.enabled = false;
      const hold = cloth.geometry.attributes.position.array.slice();
      harness.frame?.({}, 10);
      expect(cloth.geometry.attributes.position.array).toEqual(hold);
      motion.enabled = true;
      motion.activity = 'idle';
      motion.groundSpeed = 0;
      for (let frame = 0; frame < 180; frame++) harness.frame?.({}, 1 / 60);
      expect(cloth.geometry.attributes.position.array).toEqual(start);
      view.unmount();
      expect(disposed).toHaveBeenCalledOnce();
    }
  }
);

it.each(['masculine', 'feminine'] as const)(
  '%s fits closed near footwear while preserving source, distant skin and contact boxes',
  async (bodyType) => {
    const { readFileSync } = await import('node:fs'),
      { NodeIO } = await import('@gltf-transform/core'),
      { ALL_EXTENSIONS } = await import('@gltf-transform/extensions'),
      { default: draco } = await import('draco3dgltf'),
      { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js'),
      { createWorkerFootwear } = await import('./workerFootwear'),
      { createWorkerBodyLod } = await import('./workerBodyLod');
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
      'draco3d.decoder': await draco.createDecoderModule(),
    });
    const document = await io.readBinary(
      new Uint8Array(readFileSync(`public/models/worker/worker-${bodyType}.glb`))
    );
    for (const extension of document.getRoot().listExtensionsUsed()) extension.dispose();
    const bytes = await io.writeBinary(document),
      asset = await new GLTFLoader().parseAsync(bytes.buffer as ArrayBuffer, ''),
      model = asset.scene;
    shareWorkerSkin(model);
    model.updateMatrixWorld(true);
    let foot!: THREE.SkinnedMesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    model.traverse((object) => {
      const mesh = object as typeof foot;
      if (!mesh.isSkinnedMesh) return;
      mesh.castShadow = !mesh.parent?.name.includes('Worker_Feet');
      if (
        mesh.parent?.name.includes('Worker_Feet') &&
        mesh.material.name === (bodyType === 'masculine' ? 'Grey' : 'Black')
      )
        foot = mesh;
    });
    expect(foot).toBeDefined();
    const original = foot.geometry,
      material = foot.material.clone();
    foot.material = material;
    material.color.set(bodyType === 'masculine' ? '#313b43' : '#232b33');
    const lod = createWorkerBodyLod(model);
    expect(lod).not.toBeNull();
    const distant: THREE.SkinnedMesh[] = [];
    model.traverse((o) => {
      if (o.name.startsWith('worker-distant-')) distant.push(o as THREE.SkinnedMesh);
    });
    const attributes = (g: THREE.BufferGeometry) =>
      JSON.stringify({
        index: Array.from(g.index!.array),
        attributes: Object.fromEntries(
          Object.entries(g.attributes).map(([key, a]) => [
            key,
            Array.from({ length: a.count * a.itemSize }, (_, i) =>
              a.getComponent(Math.floor(i / a.itemSize), i % a.itemSize)
            ),
          ])
        ),
      });
    const farBefore = distant.map((mesh) => attributes(mesh.geometry)),
      sourceBefore = attributes(original);
    const footBoxes = (g: THREE.BufferGeometry) =>
      ['FootL', 'FootR'].map((name) => {
        const joint = foot.skeleton.bones.findIndex((b) => b.name === name),
          box = new THREE.Box3(),
          p = new THREE.Vector3();
        for (let i = 0; i < g.attributes.position.count; i++)
          if (
            [0, 1, 2, 3].some(
              (c) =>
                g.attributes.skinIndex.getComponent(i, c) === joint &&
                g.attributes.skinWeight.getComponent(i, c) > 0.001
            )
          )
            box.expandByPoint(
              p
                .fromBufferAttribute(g.attributes.position, i)
                .applyMatrix4(foot.bindMatrix)
                .applyMatrix4(foot.skeleton.boneInverses[joint])
            );
        return box;
      });
    const boxes = footBoxes(original),
      kind = bodyType === 'masculine' ? 'boot' : 'shoe';
    const fitted = createWorkerFootwear(foot, kind)!;
    expect(fitted).not.toBeNull();
    expect(fitted).not.toBe(original);
    const craft = fitted.userData.workerFootwear;
    expect(craft.addedTriangles).toBeGreaterThan(200);
    expect(craft.addedTriangles).toBeLessThanOrEqual(640);
    expect(fitted.index!.count).toBe(original.index!.count + craft.addedTriangles * 3);
    for (const [key, attribute] of Object.entries(original.attributes)) {
      const copy = fitted.attributes[key];
      expect(copy).not.toBe(attribute);
      expect(copy.normalized).toBe(attribute.normalized);
      expect(copy.array.constructor).toBe(attribute.array.constructor);
      expect((copy as THREE.BufferAttribute).gpuType).toBe(
        (attribute as THREE.BufferAttribute).gpuType ?? THREE.FloatType
      );
      for (let i = 0; i < attribute.count; i++)
        for (let c = 0; c < attribute.itemSize; c++)
          expect(copy.getComponent(i, c)).toBe(attribute.getComponent(i, c));
    }
    for (let i = 0; i < original.index!.count; i++)
      expect(fitted.index!.getX(i)).toBe(original.index!.getX(i));
    expect(footBoxes(fitted).map((b) => [b.min.toArray(), b.max.toArray()])).toEqual(
      boxes.map((b) => [b.min.toArray(), b.max.toArray()])
    );
    for (const side of [0, 1])
      for (const feature of ['toe', 'laces'])
        expect(
          craft.patches.filter(
            (p: { side: number; feature: string }) => p.side === side && p.feature === feature
          ).length
        ).toBeGreaterThan(1);
    for (const side of [0, 1])
      for (const cut of [0, 1, 2, 3])
        expect(
          craft.patches.some((p: { side: number; cut: number }) => p.side === side && p.cut === cut)
        ).toBe(true);
    const triangle = new THREE.Triangle(),
      p = new THREE.Vector3(),
      edges = new Map<string, number>();
    let volume = 0;
    for (let index = original.index!.count; index < fitted.index!.count; index += 3) {
      const points = [0, 1, 2].map((c) =>
        new THREE.Vector3().fromBufferAttribute(
          fitted.attributes.position,
          fitted.index!.getX(index + c)
        )
      );
      expect(triangle.set(points[0], points[1], points[2]).getArea()).toBeGreaterThan(1e-12);
      volume += points[0].dot(new THREE.Vector3().crossVectors(points[1], points[2])) / 6;
      for (let c = 0; c < 3; c++) {
        const key = [points[c], points[(c + 1) % 3]]
          .map((p) =>
            p
              .toArray()
              .map((v) => Math.round(v * 1e6))
              .join(',')
          )
          .sort()
          .join('/');
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    }
    expect(
      [...edges.values()].every((n) => n === 2),
      'continuous fittings are closed across donor triangles'
    ).toBe(true);
    expect(volume).toBeGreaterThan(0);
    for (const patch of craft.patches) {
      const joint = foot.skeleton.bones.findIndex((b) => b.name === ['FootL', 'FootR'][patch.side]);
      for (
        let i = original.attributes.position.count + patch.start;
        i < original.attributes.position.count + patch.start + patch.vertices;
        i++
      ) {
        const weights = [0, 1, 2, 3].map((c) => fitted.attributes.skinWeight.getComponent(i, c));
        expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
        const calf = foot.skeleton.bones.findIndex(
          (b) => b.name === ['LowerLegL', 'LowerLegR'][patch.side]
        );
        for (let c = 0; c < 4; c++)
          if (weights[c] > 0)
            expect([joint, calf]).toContain(fitted.attributes.skinIndex.getComponent(i, c));
        expect(
          p.fromBufferAttribute(fitted.attributes.position, i).toArray().every(Number.isFinite)
        ).toBe(true);
        expect(
          new THREE.Vector3().fromBufferAttribute(fitted.attributes.normal, i).length()
        ).toBeCloseTo(1, 5);
      }
    }
    foot.geometry = fitted;
    // The box is also a seated-controller input. In addition to its exact
    // equality above, sweep the real exported clips to ensure the new upper
    // fittings never become a lower ground-contact point than the old soles.
    const mixer = new THREE.AnimationMixer(model),
      bootMeshes: THREE.SkinnedMesh[] = [];
    model.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (m.isSkinnedMesh && m.parent?.name.includes('Worker_Feet')) bootMeshes.push(m);
    });
    let samples = 0,
      lowerContact = 0,
      attachmentGap = 0,
      outerSigned = Infinity;
    let currentPose = '',
      gapAt: unknown,
      buriedAt: unknown;
    const measure = () => {
      model.updateMatrixWorld(true);
      bootMeshes.forEach((mesh) => mesh.skeleton.update());
      for (const side of ['L', 'R']) {
        let oldMin = Infinity,
          newMin = Infinity;
        for (const mesh of bootMeshes) {
          const g = mesh.geometry,
            count = g === fitted ? craft.originalVertices : g.attributes.position.count,
            joint = mesh.skeleton.bones.findIndex((b) => b.name === 'Foot' + side);
          for (let i = 0; i < g.attributes.position.count; i++) {
            if (
              ![0, 1, 2, 3].some(
                (c) =>
                  g.attributes.skinIndex.getComponent(i, c) === joint &&
                  g.attributes.skinWeight.getComponent(i, c) > 0.001
              )
            )
              continue;
            const y = mesh.getVertexPosition(i, p).applyMatrix4(mesh.matrixWorld).y;
            newMin = Math.min(newMin, y);
            if (i < count) oldMin = Math.min(oldMin, y);
          }
        }
        lowerContact = Math.max(lowerContact, oldMin - newMin);
      }
      for (const patch of craft.patches) {
        const posed = patch.donor.map((id: number) =>
            foot.getVertexPosition(id, new THREE.Vector3()).applyMatrix4(foot.matrixWorld)
          ),
          donor = new THREE.Triangle(posed[0], posed[1], posed[2]),
          normal = donor.getNormal(new THREE.Vector3());
        for (let j = 0; j < patch.vertices; j++) {
          const actual = foot
            .getVertexPosition(craft.originalVertices + patch.start + j, new THREE.Vector3())
            .applyMatrix4(foot.matrixWorld);
          const gap = actual.distanceTo(donor.closestPointToPoint(actual, new THREE.Vector3()));
          if (gap > attachmentGap) {
            attachmentGap = gap;
            gapAt = {
              pose: currentPose,
              cut: patch.cut,
              donor: patch.donor,
              vertex: j,
              rest: new THREE.Vector3()
                .fromBufferAttribute(
                  fitted.attributes.position,
                  craft.originalVertices + patch.start + j
                )
                .toArray(),
            };
          }
          if (j >= patch.vertices / 2) {
            const signed = actual.clone().sub(donor.a).dot(normal);
            if (signed < outerSigned) {
              outerSigned = signed;
              buriedAt = { pose: currentPose, cut: patch.cut, donor: patch.donor, vertex: j };
            }
          }
        }
      }
      samples++;
    };
    for (const clip of asset.animations) {
      mixer.stopAllAction();
      const action = mixer.clipAction(clip).play();
      for (let step = 0; step < 12; step++) {
        currentPose = clip.name + ':' + step;
        action.time = (clip.duration * step) / 12;
        mixer.update(0);
        measure();
      }
    }
    mixer.stopAllAction();
    const breakClip = asset.animations.find((c) => c.name === 'worker-break')!,
      action = mixer.clipAction(breakClip).play(),
      pose = workerPoses.createSeatedWorkerPose(model, 1, 1, breakClip),
      gesture = workerPoses.createWorkerGesture();
    const duties = [
      'bake',
      'sample',
      'operate',
      'inspect',
      'repair',
      'radio',
      'supervise',
    ] as const;
    for (const mode of ['seat', 'cycling', 'garden', ...duties] as const)
      for (let step = 0; step < 12; step++) {
        currentPose = mode + ':' + step;
        pose.restore();
        action.time = (breakClip.duration * step) / 12;
        mixer.update(0);
        model.updateMatrixWorld(true);
        if (mode === 'seat')
          pose.applySeat({ amount: step / 11, support: (step % 3) / 2, x: 0, z: 0, yaw: 0 });
        else if (mode === 'cycling') pose.applyCycling((step / 12) * Math.PI * 2);
        else if (mode === 'garden')
          pose.applyGarden(
            true,
            workerPoses.sampleWorkerGesture('garden', step * 0.5, gesture),
            1 / 30,
            true
          );
        else
          pose.applyDuty(
            mode,
            workerPoses.sampleWorkerGesture(mode, step * 0.5, gesture),
            step / 11
          );
        measure();
      }
    pose.restore();
    process.stdout.write(
      JSON.stringify({
        bodyType,
        footwearTriangles: craft.addedTriangles,
        poseSamples: samples,
        lowerContact,
        attachmentGap,
        outerSigned,
        gapAt,
        buriedAt,
      }) + '\n'
    );
    expect(samples).toBeGreaterThanOrEqual(204);
    expect(lowerContact, 'neither foot acquires a lower posed sole').toBe(0);
    expect(
      attachmentGap,
      'fitted trim stays within 5mm of its actual posed donor ' +
        JSON.stringify({ gapAt, buriedAt, outerSigned })
    ).toBeLessThanOrEqual(0.005);
    expect(outerSigned, 'outer fittings remain above the posed donor surface').toBeGreaterThan(0);
    mixer.stopAllAction();
    mixer.uncacheRoot(model);
    expect(distant.map((mesh) => attributes(mesh.geometry))).toEqual(farBefore);
    expect(distant.length).toBe(2);
    expect(attributes(original)).toBe(sourceBefore);
    const second = createWorkerFootwear({ ...foot, geometry: original } as typeof foot, kind)!;
    expect(second).not.toBeNull();
    expect(second).not.toBe(fitted);
    expect(attributes(second)).toBe(attributes(fitted));
    const malformed = original.clone();
    malformed.deleteAttribute('skinWeight');
    foot.geometry = malformed;
    expect(createWorkerFootwear(foot, kind)).toBeNull();
    expect(attributes(original)).toBe(sourceBefore);
    fitted.dispose();
    second.dispose();
    malformed.dispose();
    material.dispose();
    lod!.dispose();
  }
);

it('recesses both feminine cuff caps with private cached skins and continuous pose clearance', async () => {
  const { readFileSync } = await import('node:fs');
  const { NodeIO } = await import('@gltf-transform/core');
  const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions');
  const { default: draco } = await import('draco3dgltf');
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'draco3d.decoder': await draco.createDecoderModule(),
  });
  const document = await io.readBinary(
    new Uint8Array(readFileSync('public/models/worker/worker-feminine.glb'))
  );
  for (const extension of document.getRoot().listExtensionsUsed()) extension.dispose();
  const bytes = await io.writeBinary(document);
  const asset = await new GLTFLoader().parseAsync(bytes.buffer as ArrayBuffer, '');
  shareWorkerSkin(asset.scene);
  asset.scene.updateMatrixWorld(true);
  let source!: THREE.SkinnedMesh, skin!: THREE.SkinnedMesh;
  asset.scene.traverse((object) => {
    const mesh = object as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh || Array.isArray(mesh.material)) return;
    if (mesh.parent?.name === 'Worker_Legs' && mesh.material.name === 'Brown_02') source = mesh;
    if (mesh.parent?.name === 'Worker_Feet' && mesh.material.name === 'Skin') skin = mesh;
  });
  expect(source).toBeDefined();
  expect(skin).toBeDefined();
  const first = source.clone(),
    second = source.clone(),
    ankle = skin.clone();
  first.geometry = softenSharedWorkerGeometry(source.geometry)!;
  second.geometry = first.geometry.clone();
  ankle.geometry = softenSharedWorkerGeometry(skin.geometry)!;
  const softened = first.geometry,
    secondSoftened = second.geometry;
  const secondNormal = second.geometry.getAttribute('normal') as THREE.BufferAttribute;
  secondNormal.setXYZ(0, 0, 1, 0);
  const closest = vi.spyOn(THREE.Triangle.prototype, 'closestPointToPoint');
  const fitted = createSharedWorkerCuffSockets(first, ankle, source.geometry, skin.geometry)!;
  expect(fitted).not.toBeNull();
  const fittingCalls = closest.mock.calls.length;
  expect(fittingCalls).toBeGreaterThan(0);
  const other = createSharedWorkerCuffSockets(second, ankle, source.geometry, skin.geometry)!;
  expect(closest.mock.calls.length).toBe(fittingCalls);
  expect(other).not.toBe(fitted);
  expect(other.userData.workerCuffSockets).not.toBe(fitted.userData.workerCuffSockets);
  expect([
    other.getAttribute('normal').getX(0),
    other.getAttribute('normal').getY(0),
    other.getAttribute('normal').getZ(0),
  ]).toEqual([0, 1, 0]);
  source.geometry.getAttribute('uv').needsUpdate = true;
  const rebuilt = createSharedWorkerCuffSockets(first, ankle, source.geometry, skin.geometry)!;
  expect(closest.mock.calls.length).toBeGreaterThan(fittingCalls);
  closest.mockRestore();
  ankle.matrixWorld.elements[12] += 0.01;
  expect(createSharedWorkerCuffSockets(first, ankle, source.geometry, skin.geometry)).toBeNull();
  ankle.matrixWorld.copy(skin.matrixWorld);
  const malformed = first.clone();
  malformed.geometry = first.geometry.clone();
  malformed.geometry.setAttribute(
    'unsupported',
    new THREE.Float32BufferAttribute(new Float32Array(first.geometry.attributes.position.count), 1)
  );
  expect(
    createSharedWorkerCuffSockets(malformed, ankle, source.geometry, skin.geometry)
  ).toBeNull();
  const info = fitted.userData.workerCuffSockets;
  expect(info.removedCapOffsets).toHaveLength(54);
  expect(info.sockets).toHaveLength(2);
  expect(info.addedTriangles).toBe(90);
  expect(info.addedVertexCount).toBe(270);
  for (const [name, original] of Object.entries(softened.attributes)) {
    const attribute = fitted.getAttribute(name),
      Constructor = original.array.constructor as typeof Float32Array;
    const values = new Constructor(
      Array.from({ length: original.count * original.itemSize }, (_, i) =>
        original.getComponent(Math.floor(i / original.itemSize), i % original.itemSize)
      )
    );
    expect(
      new Uint8Array(attribute.array.buffer, attribute.array.byteOffset, values.byteLength),
      name
    ).toEqual(new Uint8Array(values.buffer));
  }
  const removed = new Set(info.removedCapOffsets as number[]),
    retained: number[] = [];
  for (let i = 0; i < softened.index!.count; i += 3)
    if (!removed.has(i)) for (let c = 0; c < 3; c++) retained.push(softened.index!.getX(i + c));
  expect(Array.from(fitted.index!.array).slice(0, retained.length)).toEqual(retained);
  const p = fitted.getAttribute('position'),
    n = fitted.getAttribute('normal'),
    joints = fitted.getAttribute('skinIndex'),
    weights = fitted.getAttribute('skinWeight');
  const key = (i: number) =>
    [p.getX(i), p.getY(i), p.getZ(i)].map((v) => v.toFixed(7)).join(',') +
    ';' +
    [0, 1, 2, 3]
      .filter((c) => weights.getComponent(i, c) > 0)
      .map((c) => [joints.getComponent(i, c), weights.getComponent(i, c)])
      .sort(([a], [b]) => a - b)
      .join(',');
  const edges = new Map<string, { count: number; direction: number }>(),
    touched = new Set<string>();
  for (let i = 0; i < fitted.index!.count; i += 3) {
    const ids = [0, 1, 2].map((c) => fitted.index!.getX(i + c));
    if (i >= retained.length) {
      const t = new THREE.Triangle(
        ...(ids.map((j) => new THREE.Vector3().fromBufferAttribute(p, j)) as [
          THREE.Vector3,
          THREE.Vector3,
          THREE.Vector3,
        ])
      );
      expect(t.getArea()).toBeGreaterThan(1e-10);
    }
    for (let c = 0; c < 3; c++) {
      const a = key(ids[c]),
        b = key(ids[(c + 1) % 3]),
        edge = [a, b].sort().join('|'),
        old = edges.get(edge) ?? { count: 0, direction: 0 };
      old.count++;
      old.direction += a < b ? 1 : -1;
      edges.set(edge, old);
      if (i >= retained.length) touched.add(edge);
    }
  }
  for (const edge of touched) expect(edges.get(edge)).toEqual({ count: 2, direction: 0 });
  for (let i = info.originalVertexCount; i < p.count; i++) {
    expect(new THREE.Vector3().fromBufferAttribute(n, i).length()).toBeCloseTo(1, 5);
    expect(weights.getX(i)).toBe(1);
  }
  first.geometry = fitted;
  const mixer = new THREE.AnimationMixer(asset.scene),
    point = new THREE.Vector3();
  let maxMixedY = -Infinity,
    poses = 0;
  const sp = ankle.geometry.getAttribute('position'),
    sj = ankle.geometry.getAttribute('skinIndex'),
    sw = ankle.geometry.getAttribute('skinWeight'),
    at = (i: number) => ankle.geometry.index?.getX(i) ?? i;
  for (const clip of asset.animations) {
    mixer.stopAllAction();
    mixer.clipAction(clip).reset().play();
    for (let step = 0; step < 8; step++) {
      mixer.setTime((clip.duration * step) / 8);
      asset.scene.updateMatrixWorld(true);
      first.skeleton.update();
      for (const socket of info.sockets) {
        const joint = socket.joint as number,
          bone = first.skeleton.bones[joint];
        const inverse = first.bindMatrixInverse
          .clone()
          .multiply(bone.matrixWorld)
          .multiply(first.skeleton.boneInverses[joint])
          .multiply(first.bindMatrix)
          .invert();
        const minimumPatchY = Math.min(
          ...(socket.outer as number[][]).map((v) => v[1]),
          ...(socket.innerHeights as number[])
        );
        for (let i = 0; i < (ankle.geometry.index?.count ?? sp.count); i += 3) {
          const ids = [0, 1, 2].map((c) => at(i + c));
          if (!ids.every((j) => Math.sign(sp.getX(j)) === Math.sign(socket.centre[0]))) continue;
          const rigid = ids.every((j) =>
            [0, 1, 2, 3].every(
              (c) =>
                sw.getComponent(j, c) === 0 ||
                (sw.getComponent(j, c) === 1 && sj.getComponent(j, c) === joint)
            )
          );
          if (rigid) continue;
          for (const j of ids) {
            const y = ankle.getVertexPosition(j, point).applyMatrix4(inverse).y;
            maxMixedY = Math.max(maxMixedY, y);
            expect(y, clip.name + ' mixed ankle stays below cuff').toBeLessThan(
              minimumPatchY - 1e-5
            );
          }
        }
        for (let i = info.originalVertexCount; i < p.count; i++)
          if (joints.getX(i) === joint) {
            const restored = first.getVertexPosition(i, point).applyMatrix4(inverse);
            expect(restored.distanceTo(new THREE.Vector3().fromBufferAttribute(p, i))).toBeLessThan(
              1e-5
            );
          }
      }
      poses++;
    }
  }
  expect(poses).toBe(72);
  console.log(
    JSON.stringify({
      cuffPoseSamples: poses,
      maxMixedY,
      minimumSkinClearance: info.minimumSkinClearance,
      addedTriangles: info.addedTriangles,
      removedCaps: info.removedCapOffsets.length,
    })
  );
  mixer.stopAllAction();
  mixer.uncacheRoot(asset.scene);
  for (const geometry of [
    fitted,
    other,
    rebuilt,
    softened,
    secondSoftened,
    ankle.geometry,
    malformed.geometry,
  ])
    geometry.dispose();
}, 60000);
