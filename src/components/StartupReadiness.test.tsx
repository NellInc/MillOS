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
import { drawStartupFrame, registerStartupDrawOwner } from '../utils/startupReadiness';

let now = 0;
let renderTarget: THREE.WebGLRenderTarget | null = null;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera();
const gl = {
  info: { programs: [], memory: { geometries: 50, textures: 10 } },
  getContext: () => ({ isContextLost: () => probe.contextLost }),
  outputColorSpace: THREE.SRGBColorSpace,
  toneMapping: THREE.NeutralToneMapping,
  getRenderTarget: vi.fn(() => renderTarget),
  getActiveCubeFace: vi.fn(() => 2),
  getActiveMipmapLevel: vi.fn(() => 3),
  setRenderTarget: vi.fn(
    (target: THREE.WebGLRenderTarget | null, _face?: number, _mip?: number) => {
      renderTarget = target;
    }
  ),
  render: vi.fn((_scene: THREE.Scene, _camera: THREE.Camera) => {}),
  compile: vi.fn(
    (_object: THREE.Object3D, _camera: THREE.Camera, _scene?: THREE.Scene) =>
      new Set<THREE.Material>()
  ),
  properties: { get: vi.fn((_material: THREE.Material) => ({ programs: new Map() })) },
};
function frames(count = 60): void {
  for (let i = 0; i < count; i++) {
    now += 16;
    drawStartupFrame(null, () => gl.render(scene, camera));
    probe.callback?.({ gl });
  }
}
beforeEach(() => {
  now = 0;
  probe.beginTask.mockClear();
  probe.markReady.mockClear();
  probe.markReady.mockImplementation(() => {
    probe.startup.ready = true;
  });
  probe.markPrepared.mockClear();
  probe.contextLost = false;
  probe.startup = { pendingAssets: 0, pendingTasks: 0, revision: 0, ready: false, errors: 0 };
  renderTarget = null;
  gl.setRenderTarget.mockClear();
  gl.render.mockReset();
  gl.render.mockImplementation(() =>
    scene.onBeforeRender(gl as unknown as THREE.WebGLRenderer, scene, camera, renderTarget)
  );
  scene.clear();
  scene.environment = null;
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
    const worldMaterial = new THREE.MeshStandardMaterial();
    const worldProgram = {
      program: {} as WebGLProgram,
      isReady: vi.fn(() => true),
      getUniforms: vi.fn(),
      getAttributes: vi.fn(),
    };
    gl.compile.mockImplementation(
      (object: THREE.Object3D) => new Set([object === scene ? worldMaterial : material])
    );
    gl.properties.get.mockImplementation((candidate: THREE.Material) => ({
      programs: new Map(
        candidate === worldMaterial
          ? [['world', worldProgram]]
          : programs.map((p, i) => [String(i), p])
      ),
    }));
    return { programs, material };
  }
  const draw = () => drawStartupFrame(null, () => gl.render(scene, camera));

  it('withholds world draws and compilation until assets and batching finish', () => {
    const { programs } = truckPrograms();
    probe.startup.pendingAssets = 1;
    document.documentElement.dataset.millosStaticBatchesPending = '7';
    render(<StartupReadiness />);
    draw();
    draw();
    expect(gl.compile).not.toHaveBeenCalled();
    expect(gl.render).not.toHaveBeenCalled();
    expect(probe.beginTask).not.toHaveBeenCalled();
    for (const program of programs) {
      expect(program.getUniforms).not.toHaveBeenCalled();
      expect(program.getAttributes).not.toHaveBeenCalled();
    }
    frames();
    expect(probe.markReady).not.toHaveBeenCalled();
    expect(probe.markPrepared.mock.lastCall?.[0]).toBe(false);
  });

  it('never replaces either scene render hook or changes scene visibility', () => {
    truckPrograms();
    const before = scene.onBeforeRender;
    const after = scene.onAfterRender;
    render(<StartupReadiness />);
    draw();
    expect(scene.onBeforeRender).toBe(before);
    expect(scene.onAfterRender).toBe(after);
    expect(scene.visible).toBe(true);
  });

  it('surfaces a prewarm submission failure without retry or readiness certification', () => {
    truckPrograms();
    gl.compile.mockImplementation(() => {
      throw new Error('submission failed');
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<StartupReadiness />);
    draw();
    draw();
    frames();
    expect(gl.compile).toHaveBeenCalledTimes(1);
    expect(probe.startup.errors).toBe(1);
    expect(probe.startup.pendingTasks).toBe(0);
    expect(error).toHaveBeenCalledTimes(1);
    expect(probe.markReady).not.toHaveBeenCalled();
  });

  it('waits for every exact variant under the real scene callback before stable frames', () => {
    const { programs } = truckPrograms();
    const previous = scene.onBeforeRender;
    render(<StartupReadiness />);
    frames();
    expect(probe.markReady).not.toHaveBeenCalled();
    draw();
    expect(previous).not.toHaveBeenCalled();
    expect(gl.compile.mock.calls).toHaveLength(3);
    expect(gl.compile.mock.calls[0]).toEqual([scene, camera]);
    for (const args of gl.compile.mock.calls.slice(1))
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
    expect(gl.compile).toHaveBeenCalledTimes(3);
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

  it.each(['version', 'key', 'environment'])(
    're-prepares %s drift under the real callback with one continuous work barrier',
    (change) => {
      const { material, programs } = truckPrograms();
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      render(<StartupReadiness />);
      draw();
      if (change === 'version') material.needsUpdate = true;
      else if (change === 'key') material.customProgramCacheKey = () => 'late-finish';
      else scene.environment = new THREE.Texture();
      vi.advanceTimersByTime(10);
      expect(probe.startup.pendingTasks).toBe(1);
      expect(probe.beginTask).toHaveBeenCalledTimes(1);
      expect(probe.startup.errors).toBe(0);
      frames();
      vi.advanceTimersByTime(100);
      expect(gl.compile).toHaveBeenCalledTimes(6);
      expect(probe.markReady).not.toHaveBeenCalled();
      draw();
      expect(gl.compile).toHaveBeenCalledTimes(6);
      programs[1].isReady.mockReturnValue(true);
      vi.advanceTimersByTime(10);
      expect(probe.startup.pendingTasks).toBe(0);
      frames(44);
      expect(probe.markReady).not.toHaveBeenCalled();
      frames();
      expect(probe.markReady).toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    }
  );

  it('invalidates a ready preparation when its finish changes during the stable-frame window', () => {
    const { material, programs } = truckPrograms();
    programs[1].isReady.mockReturnValue(true);
    render(<StartupReadiness />);
    draw();
    vi.advanceTimersByTime(10);
    frames(30);
    expect(probe.startup.pendingTasks).toBe(0);
    material.needsUpdate = true;
    frames(20);
    expect(probe.startup.pendingTasks).toBe(1);
    expect(probe.markReady).not.toHaveBeenCalled();
    draw();
    vi.advanceTimersByTime(10);
    frames(44);
    expect(probe.markReady).not.toHaveBeenCalled();
    frames();
    expect(probe.markReady).toHaveBeenCalled();
  });

  it.each(['timeout', 'late-ready', 'no-next-callback', 'context-loss', 'disposed', 'metadata'])(
    'surfaces %s and never certifies a failed preparation',
    (failure) => {
      const { material, programs } = truckPrograms();
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      render(<StartupReadiness />);
      draw();
      if (failure === 'timeout' || failure === 'late-ready') {
        now = 15001;
        if (failure === 'late-ready') programs[1].isReady.mockReturnValue(true);
      } else if (failure === 'no-next-callback') {
        material.needsUpdate = true;
        vi.advanceTimersByTime(10);
        expect(probe.startup.pendingTasks).toBe(1);
        now = 15001;
      } else if (failure === 'context-loss') {
        probe.contextLost = true;
        material.needsUpdate = true;
      } else if (failure === 'disposed') {
        Reflect.deleteProperty(programs[0], 'program');
        material.needsUpdate = true;
      } else
        programs[0].getUniforms.mockImplementation(() => {
          throw new Error('shader metadata');
        });
      vi.advanceTimersByTime(failure === 'no-next-callback' ? 15000 : 10);
      expect(probe.startup.pendingTasks).toBe(0);
      expect(probe.startup.errors).toBe(1);
      expect(error).toHaveBeenCalledTimes(1);
      frames();
      draw();
      expect(gl.compile).toHaveBeenCalledTimes(3);
      expect(probe.markReady).not.toHaveBeenCalled();
      expect(probe.markPrepared.mock.lastCall?.[0]).not.toBe(true);
    }
  );

  it('counts a terminal disposal once during the final stable-frame window', () => {
    const { programs } = truckPrograms();
    programs[1].isReady.mockReturnValue(true);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<StartupReadiness />);
    draw();
    vi.advanceTimersByTime(10);
    frames(20);
    Reflect.deleteProperty(programs[0], 'program');
    frames();
    draw();
    expect(probe.startup.errors).toBe(1);
    expect(probe.startup.pendingTasks).toBe(0);
    expect(probe.markReady).not.toHaveBeenCalled();
  });

  it('rejects metadata initialization that completes beyond the original deadline', () => {
    const { programs } = truckPrograms();
    programs[1].isReady.mockReturnValue(true);
    programs[1].getAttributes.mockImplementation(() => {
      now = 15001;
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<StartupReadiness />);
    draw();
    vi.advanceTimersByTime(10);
    frames();
    expect(probe.startup.errors).toBe(1);
    expect(probe.startup.pendingTasks).toBe(0);
    expect(probe.markReady).not.toHaveBeenCalled();
  });

  it('does not extend the original deadline when a changed finish re-prepares', () => {
    const { material, programs } = truckPrograms();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<StartupReadiness />);
    draw();
    now = 14990;
    material.needsUpdate = true;
    vi.advanceTimersByTime(10);
    draw();
    programs[1].isReady.mockReturnValue(true);
    now = 15001;
    vi.advanceTimersByTime(10);
    expect(probe.startup.errors).toBe(1);
    expect(probe.startup.pendingTasks).toBe(0);
    frames();
    expect(probe.markReady).not.toHaveBeenCalled();
  });

  it('accepts only the actual two DoubleSide renderer increments and retires its object hooks', () => {
    const { material, programs } = truckPrograms();
    material.transparent = true;
    material.side = THREE.DoubleSide;
    programs[1].isReady.mockReturnValue(true);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
    const before = mesh.onBeforeRender,
      after = mesh.onAfterRender;
    scene.add(mesh);
    gl.compile.mockImplementation(() => {
      material.needsUpdate = true;
      material.needsUpdate = true;
      return new Set([material]);
    });
    gl.render.mockImplementation(() => {
      mesh.onBeforeRender(
        gl as unknown as THREE.WebGLRenderer,
        scene,
        camera,
        mesh.geometry,
        material,
        null
      );
      material.side = THREE.BackSide;
      material.needsUpdate = true;
      material.side = THREE.FrontSide;
      material.needsUpdate = true;
      material.side = THREE.DoubleSide;
      mesh.onAfterRender(
        gl as unknown as THREE.WebGLRenderer,
        scene,
        camera,
        mesh.geometry,
        material,
        null
      );
    });
    render(<StartupReadiness />);
    draw();
    vi.advanceTimersByTime(10);
    frames(35);
    expect(gl.compile).toHaveBeenCalledTimes(3);
    expect(probe.markReady).not.toHaveBeenCalled();
    material.needsUpdate = true;
    frames(20);
    vi.advanceTimersByTime(10);
    expect(gl.compile).toHaveBeenCalledTimes(6);
    expect(probe.markReady).not.toHaveBeenCalled();
    frames();
    expect(probe.markReady).toHaveBeenCalled();
    expect(mesh.onBeforeRender).toBe(before);
    expect(mesh.onAfterRender).toBe(after);
  });

  it('revokes completed preparation when new work starts and recompiles after it finishes', () => {
    const { programs } = truckPrograms();
    programs[1].isReady.mockReturnValue(true);
    render(<StartupReadiness />);
    draw();
    vi.advanceTimersByTime(10);
    frames(20);
    probe.startup.pendingAssets++;
    probe.startup.revision++;
    expect(drawStartupFrame(null, vi.fn())).toBe(false);
    expect(probe.startup.pendingTasks).toBe(1);
    probe.startup.pendingAssets--;
    probe.startup.revision++;
    draw();
    vi.advanceTimersByTime(10);
    expect(gl.compile).toHaveBeenCalledTimes(6);
    frames(44);
    expect(probe.markReady).not.toHaveBeenCalled();
    frames();
    expect(probe.markReady).toHaveBeenCalled();
  });

  it('restores the real beauty target, cube face and mip even when compilation throws', () => {
    truckPrograms();
    const original = new THREE.WebGLRenderTarget(8, 8);
    const beauty = new THREE.WebGLRenderTarget(16, 16);
    renderTarget = original;
    gl.compile.mockImplementation(() => {
      throw new Error('submission failed');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<StartupReadiness />);
    expect(drawStartupFrame(beauty, vi.fn())).toBe(false);
    expect(renderTarget).toBe(original);
    expect(gl.setRenderTarget.mock.lastCall).toEqual([original, 2, 3]);
    expect(scene.visible).toBe(true);
    expect(probe.startup.errors).toBe(1);
  });

  it('never counts suppressed CPU ticks or a throwing draw as rendered readiness', () => {
    const { programs } = truckPrograms();
    programs[1].isReady.mockReturnValue(true);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<StartupReadiness />);
    draw();
    vi.advanceTimersByTime(10);
    for (let i = 0; i < 80; i++) {
      now += 16;
      probe.callback?.({ gl });
    }
    expect(probe.markReady).not.toHaveBeenCalled();
    expect(probe.markPrepared.mock.lastCall?.[0]).toBe(false);
    expect(() =>
      drawStartupFrame(null, () => {
        throw new Error('render failed');
      })
    ).toThrow('render failed');
    expect(probe.startup.errors).toBe(1);
    frames();
    expect(probe.markReady).not.toHaveBeenCalled();
  });

  it('cancels borrowed work on unmount and preserves a later callback owner', () => {
    const { programs } = truckPrograms();
    const mounted = render(<StartupReadiness />);
    draw();
    const later = vi.fn();
    const releaseLater = registerStartupDrawOwner({
      prepare: later.mockReturnValue(true),
      fail: vi.fn(),
    });
    scene.onBeforeRender = later;
    mounted.unmount();
    vi.advanceTimersByTime(100);
    expect(probe.startup.pendingTasks).toBe(0);
    expect(probe.startup.errors).toBe(0);
    expect(scene.onBeforeRender).toBe(later);
    for (const program of programs) expect(program.getUniforms).not.toHaveBeenCalled();
    expect(drawStartupFrame(null, vi.fn())).toBe(true);
    releaseLater();
  });
});

describe('StartupReadiness actual work barriers', () => {
  it('rechecks the real context and work barriers when a prepared slow scene is opened', () => {
    render(<StartupReadiness />);
    for (let i = 0; i < 46; i++) {
      now += 60;
      drawStartupFrame(null, () => gl.render(scene, camera));
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
