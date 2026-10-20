/**
 * Startup bake of the shared procedural textures, off the main thread.
 *
 * `sharedMaterials.ts` generates ~34 procedural textures at module evaluation.
 * On the main thread that was ~5.8 s of synchronous work inside the scene
 * chunk, which froze the loading cover and stalled loader parsing. This runs
 * the same recipes (`sharedTextureRecipes.ts`) in a small worker pool, rebuilds
 * each result with `textureBakeCodec.ts` and seeds the `getTexture` cache, so
 * when the scene chunk evaluates every generator call is a cache hit. The
 * scene chunk's own module-level textures (`sceneTextureRecipes.ts`, ~1.1 s
 * more) ride the same pool; `startupTextureRecipes.ts` combines the two.
 *
 * Nothing here can change what renders: a recipe that is not baked in time
 * (no Worker support, a worker error, the timeout) is simply generated on the
 * main thread as before, and a seed never replaces a texture already cached.
 *
 * Working if `millos:texture-bake-end` reports every recipe baked and a CPU
 * profile of startup shows no generator self-time on the main thread.
 */
import { seedGeneratedTexture } from './textureGenerator';
import { isBakedTexture, restoreGeneratedTexture } from './textureBakeCodec';
import { STARTUP_TEXTURE_BAKE_ORDER, type StartupTextureRecipeName } from './startupTextureRecipes';

/**
 * Upper bound on how long the scene chunk waits for the bake. A hung or
 * starved worker must degrade to the old main-thread path, never hang startup.
 */
export const SHARED_TEXTURE_BAKE_TIMEOUT_MS = 20_000;

/** At most this many workers, and always one core left for the main thread. */
const MAX_BAKE_WORKERS = 4;

export interface SharedTextureBakeResult {
  baked: number;
  seeded: number;
  failed: number;
  total: number;
  workers: number;
  elapsedMs: number;
  outcome: 'complete' | 'partial' | 'timeout' | 'unsupported';
}

let bakePromise: Promise<SharedTextureBakeResult> | null = null;

const now = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

const mark = (name: string, detail?: unknown): void => {
  try {
    performance.mark(name, detail === undefined ? undefined : { detail });
  } catch {
    /* marks are diagnostics only */
  }
};

const bakeWorkerCount = (): number => {
  const cores =
    typeof navigator !== 'undefined' && Number.isFinite(navigator.hardwareConcurrency)
      ? navigator.hardwareConcurrency
      : 2;
  return Math.max(1, Math.min(MAX_BAKE_WORKERS, cores - 1));
};

const runBake = (): Promise<SharedTextureBakeResult> => {
  const started = now();
  const total = STARTUP_TEXTURE_BAKE_ORDER.length;
  if (typeof Worker === 'undefined') {
    return Promise.resolve({
      baked: 0,
      seeded: 0,
      failed: 0,
      total,
      workers: 0,
      elapsedMs: 0,
      outcome: 'unsupported',
    });
  }

  mark('millos:texture-bake-start');
  return new Promise((resolve) => {
    const queue: StartupTextureRecipeName[] = [...STARTUP_TEXTURE_BAKE_ORDER];
    const live = new Set<Worker>();
    const busy = new Map<Worker, StartupTextureRecipeName>();
    let baked = 0;
    let seeded = 0;
    let failed = 0;
    let workers = 0;
    let settled = false;

    const finish = (outcome: SharedTextureBakeResult['outcome']): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      live.forEach((worker) => worker.terminate());
      live.clear();
      busy.clear();
      const result: SharedTextureBakeResult = {
        baked,
        seeded,
        failed,
        total,
        workers,
        elapsedMs: Math.round(now() - started),
        outcome,
      };
      mark('millos:texture-bake-end', result);
      resolve(result);
    };

    const timer = setTimeout(() => finish('timeout'), SHARED_TEXTURE_BAKE_TIMEOUT_MS);

    const settleIfDone = (): void => {
      if (busy.size > 0) return;
      if (queue.length > 0 && live.size > 0) return;
      finish(baked === total ? 'complete' : 'partial');
    };

    const dispatch = (worker: Worker): void => {
      const recipe = queue.shift();
      if (!recipe) {
        worker.terminate();
        live.delete(worker);
        settleIfDone();
        return;
      }
      busy.set(worker, recipe);
      worker.postMessage({ type: 'bake', recipe });
    };

    const retire = (worker: Worker): void => {
      // The in-flight recipe is not re-queued: the main thread generates it
      // lazily if nothing else does, which is the old behaviour for that map.
      if (busy.delete(worker)) failed += 1;
      worker.terminate();
      live.delete(worker);
      settleIfDone();
    };

    const onMessage = (worker: Worker, data: unknown): void => {
      if (settled) return;
      const message = data as { type?: unknown; textures?: unknown } | null;
      if (message?.type === 'baked' && Array.isArray(message.textures)) {
        for (const entry of message.textures) {
          if (!isBakedTexture(entry)) continue;
          if (seedGeneratedTexture(entry.key, restoreGeneratedTexture(entry))) seeded += 1;
        }
        baked += 1;
      } else {
        failed += 1;
      }
      busy.delete(worker);
      dispatch(worker);
    };

    const count = Math.min(bakeWorkerCount(), queue.length);
    for (let i = 0; i < count; i += 1) {
      let worker: Worker | null = null;
      try {
        worker = new Worker(new URL('./sharedTextureBakeWorker.ts', import.meta.url), {
          type: 'module',
          name: `millos-texture-bake-${i}`,
        });
      } catch {
        worker?.terminate();
        continue;
      }
      const active = worker;
      live.add(active);
      workers += 1;
      active.onmessage = (event: MessageEvent<unknown>) => onMessage(active, event.data);
      active.onerror = (event) => {
        event.preventDefault?.();
        retire(active);
      };
      active.onmessageerror = () => retire(active);
      dispatch(active);
    }
    if (live.size === 0) finish('unsupported');
  });
};

/**
 * Start the bake once; later calls return the same promise. It never rejects:
 * the result says how much was baked, and whatever was not is generated on
 * the main thread exactly as before.
 */
export const startSharedTextureBake = (): Promise<SharedTextureBakeResult> => {
  bakePromise ??= runBake();
  return bakePromise;
};

/**
 * Wrap a lazy chunk import whose module graph includes `sharedMaterials.ts`,
 * so the chunk evaluates after the bake has seeded the texture cache.
 */
export const afterSharedTextureBake =
  <T>(load: () => Promise<T>): (() => Promise<T>) =>
  () =>
    startSharedTextureBake().then(load);
