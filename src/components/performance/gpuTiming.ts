import type * as THREE from 'three';

const SAMPLE_EVERY_FRAMES = 30;
const MAX_QUERIES = 4;
const MAX_SAMPLES = 120;

interface TimerExtension {
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
  QUERY_COUNTER_BITS_EXT: number;
}

export interface GpuTimingSnapshot {
  enabled: boolean;
  status: 'disabled' | 'ready' | 'unsupported' | 'context-lost' | 'error';
  /** First renderer.render through R3F's after-frame callback, including nested passes.
   * Elapsed GPU time can include scheduling/command gaps; it is not exclusive busy time.
   */
  scope: 'rendered-frame';
  sampleEveryFrames: number;
  sampleLimit: number;
  sampleCount: number;
  pendingQueries: number;
  skippedSamples: number;
  discardedSamples: number;
  averageMs: number | null;
  p95Ms: number | null;
  lastMs: number | null;
  error: string | null;
}

/** Opt-in, bounded timer queries. Never flush, finish, spin, or read an unavailable result.
 * Working if ordinary rendering stays unwrapped, sampled frames include the composer,
 * unavailable/disjoint data never becomes zero, and teardown preserves later owners.
 */
export function createGpuTiming(
  renderer: THREE.WebGLRenderer,
  subscribeAfterFrame: (callback: () => void) => () => void
) {
  // Three's declaration retains the legacy context union. Guard the WebGL2
  // query API before enabling, rather than assuming support from the renderer.
  const gl = renderer.getContext() as WebGL2RenderingContext;
  let extension: TimerExtension | null = null;
  let enabled = false;
  let status: GpuTimingSnapshot['status'] = 'disabled';
  let error: string | null = null;
  let frame = 0;
  let armed = false;
  let rendered = false;
  let active: WebGLQuery | null = null;
  let skipped = 0;
  let discarded = 0;
  let disposed = false;
  const samples: number[] = [];
  const slots: Array<{ query: WebGLQuery; pending: boolean }> = [];
  let releaseFrame: (() => void) | undefined;
  let restoreRender: (() => void) | undefined;

  const endActive = (discard = false) => {
    if (!active || !extension) return;
    const query = active;
    active = null;
    const slot = slots.find((item) => item.query === query);
    if (
      !gl.isContextLost() &&
      gl.getQuery(extension.TIME_ELAPSED_EXT, gl.CURRENT_QUERY) === query
    ) {
      gl.endQuery(extension.TIME_ELAPSED_EXT);
      if (slot) slot.pending = !discard;
    } else {
      discard = true;
    }
    if (discard) discarded++;
  };

  const clearQueries = () => {
    endActive(true);
    for (const { query } of slots) gl.deleteQuery(query);
    slots.length = 0;
    armed = false;
  };

  const fail = (cause: unknown) => {
    status = 'error';
    error = String(cause).slice(0, 300);
    try {
      clearQueries();
    } catch {
      // A diagnostic must never mask a render exception or context teardown.
    }
  };

  const safely = (operation: () => void) => {
    try {
      operation();
    } catch (cause) {
      fail(cause);
    }
  };

  const poll = () => {
    if (!extension) return;
    const disjoint = gl.getParameter(extension.GPU_DISJOINT_EXT);
    for (const slot of slots) {
      if (!slot.pending) continue;
      if (disjoint) {
        discarded++;
      } else {
        if (!gl.getQueryParameter(slot.query, gl.QUERY_RESULT_AVAILABLE)) continue;
        const ms = Number(gl.getQueryParameter(slot.query, gl.QUERY_RESULT)) / 1e6;
        if (Number.isFinite(ms) && ms > 0) {
          samples.push(ms);
          if (samples.length > MAX_SAMPLES) samples.shift();
        } else discarded++;
      }
      slot.pending = false;
    }
  };

  const detach = () => {
    releaseFrame?.();
    releaseFrame = undefined;
    restoreRender?.();
    restoreRender = undefined;
    safely(clearQueries);
  };

  const attach = () => {
    if (disposed || !enabled) return;
    if (gl.isContextLost()) {
      status = 'context-lost';
      return;
    }
    if (typeof gl.createQuery !== 'function') {
      status = 'unsupported';
      return;
    }
    extension = gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExtension | null;
    if (
      !extension ||
      Number(gl.getQuery(extension.TIME_ELAPSED_EXT, extension.QUERY_COUNTER_BITS_EXT)) <= 0
    ) {
      status = 'unsupported';
      return;
    }
    const descriptor = Object.getOwnPropertyDescriptor(renderer, 'render');
    if (descriptor && (!('value' in descriptor) || !descriptor.writable)) {
      throw new Error('Renderer render hook is not replaceable');
    }
    const original = renderer.render;
    const wrapped: typeof renderer.render = function (this: THREE.WebGLRenderer, scene, camera) {
      if (armed && !rendered && status === 'ready') {
        rendered = true;
        safely(() => {
          if (!extension) return;
          if (gl.getQuery(extension.TIME_ELAPSED_EXT, gl.CURRENT_QUERY)) {
            skipped++;
            return;
          }
          let slot = slots.find((item) => !item.pending);
          if (!slot && slots.length < MAX_QUERIES) {
            const query = gl.createQuery();
            if (query) {
              slot = { query, pending: false };
              slots.push(slot);
            }
          }
          if (!slot) {
            skipped++;
            return;
          }
          gl.beginQuery(extension.TIME_ELAPSED_EXT, slot.query);
          active = slot.query;
        });
      }
      try {
        return original.call(this, scene, camera);
      } catch (cause) {
        safely(() => endActive(true));
        throw cause;
      }
    };
    renderer.render = wrapped;
    restoreRender = () => {
      if (renderer.render !== wrapped) return;
      if (descriptor) Object.defineProperty(renderer, 'render', descriptor);
      else delete (renderer as Partial<THREE.WebGLRenderer>).render;
    };
    releaseFrame = subscribeAfterFrame(() => {
      if (!enabled || status !== 'ready') return;
      safely(() => endActive());
      armed = false;
    });
    status = 'ready';
  };

  const lost = () => {
    detach();
    samples.length = 0;
    if (enabled) status = 'context-lost';
  };
  const restored = () => {
    if (enabled) safely(attach);
  };
  renderer.domElement.addEventListener('webglcontextlost', lost);
  renderer.domElement.addEventListener('webglcontextrestored', restored);

  return {
    beginFrame() {
      if (!enabled || status !== 'ready') return;
      safely(() => {
        if (gl.isContextLost()) return lost();
        // An interrupted frame must not leave a query spanning a second frame.
        endActive(true);
        poll();
        armed = frame++ % SAMPLE_EVERY_FRAMES === 0;
        rendered = false;
      });
    },
    setEnabled(value: boolean) {
      if (disposed || value === enabled) return;
      detach();
      enabled = value;
      frame = skipped = discarded = 0;
      samples.length = 0;
      error = null;
      status = 'disabled';
      if (enabled) safely(attach);
    },
    reset() {
      safely(clearQueries);
      frame = skipped = discarded = 0;
      samples.length = 0;
    },
    snapshot(): GpuTimingSnapshot {
      const sorted = [...samples].sort((a, b) => a - b);
      return {
        enabled,
        status,
        scope: 'rendered-frame',
        sampleEveryFrames: SAMPLE_EVERY_FRAMES,
        sampleLimit: MAX_SAMPLES,
        sampleCount: samples.length,
        pendingQueries: slots.filter((slot) => slot.pending || slot.query === active).length,
        skippedSamples: skipped,
        discardedSamples: discarded,
        averageMs: samples.length
          ? samples.reduce((sum, ms) => sum + ms, 0) / samples.length
          : null,
        p95Ms: sorted.length ? sorted[Math.ceil(sorted.length * 0.95) - 1] : null,
        lastMs: samples.at(-1) ?? null,
        error,
      };
    },
    dispose() {
      detach();
      enabled = false;
      disposed = true;
      status = 'disabled';
      renderer.domElement.removeEventListener('webglcontextlost', lost);
      renderer.domElement.removeEventListener('webglcontextrestored', restored);
    },
  };
}
