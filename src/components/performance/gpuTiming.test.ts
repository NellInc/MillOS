import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createGpuTiming } from './gpuTiming';

function fixture(supported = true) {
  let current: WebGLQuery | null = null;
  let available = false;
  let disjoint = false;
  let lost = false;
  let nanos = 2_500_000;
  const extension = { TIME_ELAPSED_EXT: 1, GPU_DISJOINT_EXT: 2, QUERY_COUNTER_BITS_EXT: 3 };
  const gl = {
    CURRENT_QUERY: 4,
    QUERY_RESULT_AVAILABLE: 5,
    QUERY_RESULT: 6,
    isContextLost: () => lost,
    getExtension: vi.fn(() => (supported ? extension : null)),
    getQuery: vi.fn((_target, property) => (property === 3 ? 64 : current)),
    getParameter: vi.fn(() => disjoint),
    getQueryParameter: vi.fn((_query, property) => (property === 5 ? available : nanos)),
    createQuery: vi.fn(() => ({}) as WebGLQuery),
    beginQuery: vi.fn((_target, query) => {
      if (current) throw new Error('Overlapping query');
      current = query;
    }),
    endQuery: vi.fn(() => {
      current = null;
    }),
    deleteQuery: vi.fn(),
  };
  const canvas = new EventTarget();
  const render = vi.fn(function (this: unknown, scene, camera) {
    return { receiver: this, scene, camera };
  });
  const renderer = {
    getContext: () => gl,
    domElement: canvas,
    render,
  } as unknown as THREE.WebGLRenderer;
  const callbacks = new Set<() => void>();
  const subscribe = vi.fn((callback: () => void) => {
    callbacks.add(callback);
    return () => callbacks.delete(callback);
  });
  const timer = createGpuTiming(renderer, subscribe);
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera();
  const frame = () => {
    timer.beginFrame();
    renderer.render(scene, camera);
    renderer.render(new THREE.Scene(), camera);
    for (const callback of callbacks) callback();
  };
  return {
    timer,
    renderer,
    render,
    gl,
    canvas,
    callbacks,
    frame,
    scene,
    camera,
    setAvailable: (value = true) => {
      available = value;
    },
    setDisjoint: (value = true) => {
      disjoint = value;
    },
    setNanos: (value: number) => {
      nanos = value;
    },
    setCurrent: (query: WebGLQuery | null) => {
      current = query;
    },
    setLost: (value: boolean) => {
      lost = value;
      canvas.dispatchEvent(new Event(value ? 'webglcontextlost' : 'webglcontextrestored'));
    },
  };
}

describe('opt-in non-blocking rendered-frame GPU timing', () => {
  it('does no GPU queries or render wrapping until explicitly enabled', () => {
    const f = fixture();
    f.frame();
    expect(f.renderer.render).toBe(f.render);
    expect(f.gl.getExtension).not.toHaveBeenCalled();
    expect(f.callbacks.size).toBe(0);
    expect(f.timer.snapshot()).toMatchObject({
      status: 'disabled',
      averageMs: null,
      sampleCount: 0,
    });
    f.timer.dispose();
  });

  it('brackets all render calls in a sampled frame and reads only a later available result', () => {
    const f = fixture();
    f.timer.setEnabled(true);
    f.frame();
    expect(f.gl.beginQuery).toHaveBeenCalledTimes(1);
    expect(f.gl.endQuery).toHaveBeenCalledTimes(1);
    expect(f.render.mock.results[0].value).toEqual({
      receiver: f.renderer,
      scene: f.scene,
      camera: f.camera,
    });
    f.frame();
    expect(
      f.gl.getQueryParameter.mock.calls.some(([, property]) => property === f.gl.QUERY_RESULT)
    ).toBe(false);
    expect(f.timer.snapshot()).toMatchObject({ pendingQueries: 1, averageMs: null });
    const reads = f.gl.getQueryParameter.mock.calls.length;
    f.timer.snapshot();
    expect(f.gl.getQueryParameter).toHaveBeenCalledTimes(reads);
    f.setAvailable();
    f.frame();
    expect(f.timer.snapshot()).toMatchObject({
      sampleCount: 1,
      averageMs: 2.5,
      p95Ms: 2.5,
      lastMs: 2.5,
    });
    f.timer.setEnabled(false);
    expect(f.renderer.render).toBe(f.render);
    expect(f.callbacks.size).toBe(0);
    expect(f.gl.deleteQuery).toHaveBeenCalledTimes(1);
    f.timer.dispose();
  });

  it('bounds outstanding queries and skips sampling instead of waiting', () => {
    const f = fixture();
    f.timer.setEnabled(true);
    for (let i = 0; i < 301; i++) f.frame();
    expect(f.gl.createQuery).toHaveBeenCalledTimes(4);
    expect(f.timer.snapshot()).toMatchObject({
      pendingQueries: 4,
      skippedSamples: 7,
      sampleCount: 0,
    });
    f.setAvailable();
    f.frame();
    for (let i = 0; i < 30; i++) f.frame();
    expect(f.gl.createQuery).toHaveBeenCalledTimes(4);
    f.timer.dispose();
  });

  it('discards disjoint and invalid results without reporting a zero GPU cost', () => {
    const f = fixture();
    f.timer.setEnabled(true);
    f.frame();
    f.setDisjoint();
    f.frame();
    expect(f.timer.snapshot()).toMatchObject({
      discardedSamples: 1,
      sampleCount: 0,
      averageMs: null,
    });
    f.setDisjoint(false);
    f.setAvailable();
    f.setNanos(Number.NaN);
    for (let i = 0; i < 31; i++) f.frame();
    expect(f.timer.snapshot()).toMatchObject({
      discardedSamples: 2,
      sampleCount: 0,
      averageMs: null,
    });
    f.timer.dispose();
  });

  it('never starts over or ends another owner query', () => {
    const f = fixture();
    const foreign = {} as WebGLQuery;
    f.timer.setEnabled(true);
    f.setCurrent(foreign);
    f.frame();
    expect(f.gl.beginQuery).not.toHaveBeenCalled();
    expect(f.gl.endQuery).not.toHaveBeenCalled();
    expect(f.timer.snapshot().skippedSamples).toBe(1);
    f.timer.dispose();
    expect(f.gl.endQuery).not.toHaveBeenCalled();
  });

  it('resets active/pending work without letting old results enter the new window', () => {
    const f = fixture();
    f.timer.setEnabled(true);
    f.frame();
    f.timer.reset();
    f.setAvailable();
    expect(f.timer.snapshot()).toMatchObject({ sampleCount: 0, pendingQueries: 0 });
    f.timer.beginFrame();
    f.renderer.render(f.scene, f.camera);
    f.timer.reset();
    expect(f.gl.endQuery).toHaveBeenCalledTimes(2);
    expect(f.timer.snapshot().sampleCount).toBe(0);
    f.timer.dispose();
  });

  it('preserves original render failures and later render-hook owners during cleanup', () => {
    const f = fixture();
    f.timer.setEnabled(true);
    f.render.mockImplementationOnce(() => {
      throw new Error('native render failed');
    });
    f.timer.beginFrame();
    expect(() => f.renderer.render(f.scene, f.camera)).toThrow('native render failed');
    expect(f.gl.endQuery).toHaveBeenCalledTimes(1);
    const wrapped = f.renderer.render;
    const later = vi.fn((...args: Parameters<typeof wrapped>) => wrapped.apply(f.renderer, args));
    f.renderer.render = later;
    f.timer.dispose();
    expect(f.renderer.render).toBe(later);
    f.renderer.render(f.scene, f.camera);
    expect(f.gl.beginQuery).toHaveBeenCalledTimes(1);
  });

  it('reports unavailable support and recovers after context restoration', () => {
    const unsupported = fixture(false);
    unsupported.timer.setEnabled(true);
    unsupported.frame();
    expect(unsupported.timer.snapshot()).toMatchObject({ status: 'unsupported', averageMs: null });
    expect(unsupported.renderer.render).toBe(unsupported.render);
    unsupported.timer.dispose();
    const f = fixture();
    f.timer.setEnabled(true);
    f.frame();
    f.setLost(true);
    expect(f.timer.snapshot()).toMatchObject({
      status: 'context-lost',
      pendingQueries: 0,
      averageMs: null,
    });
    expect(f.renderer.render).toBe(f.render);
    f.setLost(false);
    f.frame();
    expect(f.timer.snapshot().status).toBe('ready');
    f.timer.dispose();
  });

  it('bounds the retained result history and fails open on driver API exceptions', () => {
    const f = fixture();
    f.timer.setEnabled(true);
    f.setAvailable();
    for (let i = 0; i < 3700; i++) f.frame();
    expect(f.timer.snapshot().sampleCount).toBe(120);
    f.gl.getParameter.mockImplementationOnce(() => {
      throw new Error('driver query failed');
    });
    expect(f.frame).not.toThrow();
    expect(f.timer.snapshot()).toMatchObject({
      status: 'error',
      error: 'Error: driver query failed',
    });
    f.timer.dispose();
  });
});
