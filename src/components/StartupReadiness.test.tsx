import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

const probe = vi.hoisted(() => ({
  callback: null as null | ((state: unknown) => void),
  startup: { pendingAssets: 0, pendingTasks: 0, revision: 0, ready: false, errors: 0 },
  beginTask: vi.fn(),
  markReady: vi.fn(),
  markPrepared: vi.fn(),
  contextLost: false,
}));
vi.mock('@react-three/fiber', () => ({
  useThree: () => ({ gl, scene, camera }),
  useFrame: (callback: (state: unknown) => void) => {
    probe.callback = callback;
  },
}));
vi.mock('../utils/startupReadiness', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils/startupReadiness')>()),
  getStartupSnapshot: () => probe.startup,
  beginStartupTask: probe.beginTask,
  markStartupReady: probe.markReady,
  markStartupPrepared: probe.markPrepared,
}));
import { StartupReadiness } from './StartupReadiness';

let now = 0;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera();
const gl = {
  info: { programs: [], memory: { geometries: 50, textures: 10 } },
  getContext: () => ({ isContextLost: () => probe.contextLost }),
  compile: vi.fn(() => new Set<THREE.Material>()),
  properties: { get: vi.fn(() => ({ programs: new Map() })) },
};
function frames(count = 60): void {
  for (let i = 0; i < count; i++) {
    now += 16;
    probe.callback?.({ gl });
  }
}
beforeEach(() => {
  now = 0;
  probe.markReady.mockClear();
  probe.markPrepared.mockClear();
  probe.contextLost = false;
  probe.startup = { pendingAssets: 0, pendingTasks: 0, revision: 0, ready: false, errors: 0 };
  scene.clear();
  scene.onBeforeRender = vi.fn();
  gl.compile.mockReset();
  gl.compile.mockReturnValue(new Set());
  gl.properties.get.mockReset();
  gl.properties.get.mockReturnValue({ programs: new Map() });
  probe.beginTask.mockImplementation(() => {
    probe.startup.pendingTasks++;
    probe.startup.revision++;
    let released = false;
    return (failed = false) => {
      if (released) return;
      released = true;
      probe.startup.pendingTasks--;
      probe.startup.revision++;
      probe.startup.errors += Number(failed);
    };
  });
  document.documentElement.dataset.millosWorldReady = 'true';
  document.documentElement.dataset.millosStaticBatchesPending = '0';
  vi.spyOn(performance, 'now').mockImplementation(() => now);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete document.documentElement.dataset.millosWorldReady;
  delete document.documentElement.dataset.millosStaticBatchesPending;
});

describe('retained truck first-use preparation', () => {
  function truckPrograms() {
    vi.useFakeTimers();
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    for (const name of ['shipping-truck', 'receiving-truck']) {
      const truck = new THREE.Group();
      truck.name = name;
      const full = new THREE.Group();
      full.name = 'truck-full-detail';
      full.visible = false;
      truck.add(full);
      scene.add(truck);
    }
    const material = new THREE.MeshStandardMaterial();
    const programs = [true, false].map((ready) => ({
      program: {} as WebGLProgram,
      isReady: vi.fn(() => ready),
      getUniforms: vi.fn(),
      getAttributes: vi.fn(),
    }));
    gl.compile.mockReturnValue(new Set([material]));
    gl.properties.get.mockReturnValue({
      programs: new Map(programs.map((p, i) => [String(i), p])),
    });
    return { programs, material };
  }
  const draw = () =>
    scene.onBeforeRender(gl as unknown as THREE.WebGLRenderer, scene, camera, null);

  it('waits for every exact variant under the real scene callback before stable frames', () => {
    const { programs } = truckPrograms();
    const previous = scene.onBeforeRender;
    render(<StartupReadiness />);
    frames();
    expect(probe.markReady).not.toHaveBeenCalled();
    draw();
    expect(previous).toHaveBeenCalledWith(gl, scene, camera, null);
    expect(gl.compile.mock.calls).toHaveLength(2);
    for (const args of gl.compile.mock.calls)
      expect(args).toEqual([expect.any(THREE.Group), camera, scene]);
    expect(probe.startup.pendingTasks).toBe(1);
    vi.advanceTimersByTime(10);
    expect(programs[0].getUniforms).toHaveBeenCalledTimes(1);
    expect(programs[1].getUniforms).not.toHaveBeenCalled();
    frames();
    expect(probe.markReady).not.toHaveBeenCalled();
    programs[1].isReady.mockReturnValue(true);
    vi.advanceTimersByTime(10);
    expect(programs[1].getUniforms).toHaveBeenCalledTimes(1);
    expect(probe.startup.pendingTasks).toBe(0);
    frames(44);
    expect(probe.markReady).not.toHaveBeenCalled();
    frames();
    expect(probe.markReady).toHaveBeenCalled();
    draw();
    expect(gl.compile).toHaveBeenCalledTimes(2);
  });

  it.each(['missing', 'empty'])('rejects a %s compiled-program map', (shape) => {
    truckPrograms();
    gl.properties.get.mockReturnValue(
      (shape === 'missing' ? {} : { programs: new Map() }) as ReturnType<typeof gl.properties.get>
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<StartupReadiness />);
    draw();
    vi.advanceTimersByTime(10);
    expect(probe.startup.errors).toBe(1);
    frames();
    expect(probe.markReady).not.toHaveBeenCalled();
  });

  it.each(['timeout', 'changed-configuration'])(
    'surfaces %s and never certifies a failed preparation',
    (failure) => {
      const { material } = truckPrograms();
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      render(<StartupReadiness />);
      draw();
      if (failure === 'timeout') now = 15001;
      else material.needsUpdate = true;
      vi.advanceTimersByTime(10);
      expect(probe.startup.pendingTasks).toBe(0);
      expect(probe.startup.errors).toBe(1);
      expect(error).toHaveBeenCalled();
      frames();
      expect(probe.markReady).not.toHaveBeenCalled();
      expect(probe.markPrepared.mock.lastCall?.[0]).not.toBe(true);
    }
  );

  it('cancels borrowed work on unmount and preserves a later callback owner', () => {
    const { programs } = truckPrograms();
    const mounted = render(<StartupReadiness />);
    draw();
    const later = vi.fn();
    scene.onBeforeRender = later;
    mounted.unmount();
    vi.advanceTimersByTime(100);
    expect(probe.startup.pendingTasks).toBe(0);
    expect(probe.startup.errors).toBe(0);
    expect(scene.onBeforeRender).toBe(later);
    for (const program of programs) expect(program.getUniforms).not.toHaveBeenCalled();
  });
});

describe('StartupReadiness actual work barriers', () => {
  it('rechecks the real context and work barriers when a prepared slow scene is opened', () => {
    render(<StartupReadiness />);
    for (let i = 0; i < 46; i++) {
      now += 60;
      probe.callback?.({ gl });
    }
    expect(probe.markReady).not.toHaveBeenCalled();
    const [prepared, guard] = probe.markPrepared.mock.lastCall!;
    expect(prepared).toBe(true);
    expect(guard()).toBe(true);
    probe.contextLost = true;
    expect(guard()).toBe(false);
    probe.contextLost = false;
    probe.startup.pendingAssets = 1;
    expect(guard()).toBe(false);
    probe.startup.pendingAssets = 0;
    probe.startup.revision++;
    expect(guard()).toBe(false);
  });
  it.each(['world', 'assets', 'tasks', 'batches', 'unregistered-batches'])(
    'keeps rendering behind the overlay while %s is incomplete',
    (barrier) => {
      if (barrier === 'world') delete document.documentElement.dataset.millosWorldReady;
      if (barrier === 'assets') probe.startup.pendingAssets = 1;
      if (barrier === 'tasks') probe.startup.pendingTasks = 1;
      if (barrier === 'batches') document.documentElement.dataset.millosStaticBatchesPending = '1';
      if (barrier === 'unregistered-batches') {
        delete document.documentElement.dataset.millosStaticBatchesPending;
      }
      render(<StartupReadiness />);
      frames();
      expect(probe.markReady).not.toHaveBeenCalled();
      probe.startup.pendingAssets = 0;
      probe.startup.pendingTasks = 0;
      document.documentElement.dataset.millosWorldReady = 'true';
      document.documentElement.dataset.millosStaticBatchesPending = '0';
      frames(44);
      expect(probe.markReady).not.toHaveBeenCalled();
      frames();
      expect(probe.markReady).toHaveBeenCalled();
    }
  );
});
