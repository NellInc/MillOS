import React from 'react';
import { render, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { getWorkerAppearance, type WorkerMotionState } from './workerTypes';

const harness = vi.hoisted(() => ({
  frame: null as null | ((state: unknown, delta: number) => void),
  asset: null as unknown,
}));
vi.mock('@react-three/fiber', () => ({
  useFrame: (callback: (state: unknown, delta: number) => void) => {
    harness.frame = callback;
  },
  createPortal: (children: React.ReactNode) => children,
}));
vi.mock('../../utils/dracoLoader', () => ({ useDracoGLTF: () => harness.asset }));
vi.mock('three/addons/utils/SkeletonUtils.js', () => ({ clone: (scene: THREE.Group) => scene }));
import { WorkerModel } from '../models/WorkerModel';

afterEach(() => {
  cleanup();
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
