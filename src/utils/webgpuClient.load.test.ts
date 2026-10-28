import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const create = vi.hoisted(() => vi.fn());
const cache = vi.hoisted(() => ({ remove: vi.fn(), has: vi.fn() }));
vi.mock('@mlc-ai/web-llm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@mlc-ai/web-llm')>()),
  CreateWebWorkerMLCEngine: create,
  deleteModelAllInfoInCache: cache.remove,
  hasModelInCache: cache.has,
}));

import { isCacheWriteError, WebGPUClient } from './webgpuClient';

const MODEL = 'Qwen3.5-4B-q4f16_1-MLC';
const engine = { unload: async () => undefined };

describe('loading when the browser cache refuses the download', () => {
  beforeEach(() => {
    create.mockReset();
    cache.has.mockReset().mockResolvedValue(false);
    vi.stubGlobal(
      'Worker',
      class {
        terminate() {}
      }
    );
    vi.stubGlobal('navigator', { ...globalThis.navigator, gpu: {} });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('loads the pinned IndexedDB copy directly when the Cache API has no offline copy', async () => {
    cache.has.mockImplementation(async (_id, config) => config.cacheBackend === 'indexeddb');
    create.mockImplementation(async (_worker, _id, { appConfig }) => {
      if (appConfig.cacheBackend !== 'indexeddb') throw new Error('Failed to fetch');
      return engine;
    });
    const client = new WebGPUClient();
    expect(await WebGPUClient.isModelCached(MODEL)).toBe(true);
    expect(await client.load(undefined, MODEL, true)).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
    const config = create.mock.calls[0][2].appConfig;
    expect(config.cacheBackend).toBe('indexeddb');
    const record = config.model_list.find(
      (entry: { model_id: string }) => entry.model_id === MODEL
    );
    expect(record.model).toContain('/resolve/');
    expect(record.integrity).toBeDefined();
    expect(create.mock.calls[0][1]).toHaveLength(2);
  });

  it('retries once through IndexedDB after a refused Cache API write', async () => {
    create
      .mockRejectedValueOnce(new Error('NetworkError: Cache.add() encountered a network error'))
      .mockResolvedValueOnce(engine);
    const client = new WebGPUClient();
    expect(await client.load(undefined, MODEL, false)).toBe(true);
    expect(create).toHaveBeenCalledTimes(2);
    // web-llm's prebuilt config names the Cache API itself.
    expect(create.mock.calls[0][2].appConfig.cacheBackend).toBe('cache');
    expect(create.mock.calls[1][2].appConfig.cacheBackend).toBe('indexeddb');
    expect(client.isConnected()).toBe(true);
  });

  it.each([
    'The WebGPU device was lost while loading the model.',
    'Integrity check failed for model library',
    'Failed to fetch',
  ])('does not retry a non-write failure: %s', async (message) => {
    create.mockRejectedValue(new Error(message));
    const client = new WebGPUClient();
    expect(await client.load(undefined, MODEL, false)).toBe(false);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('gives up if IndexedDB refuses too', async () => {
    create.mockRejectedValue(new Error('QuotaExceededError: storage quota exceeded'));
    const client = new WebGPUClient();
    expect(await client.load(undefined, MODEL, false)).toBe(false);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('cancels during cache discovery without starting the engine', async () => {
    let release: (value: boolean) => void = () => undefined;
    let started: () => void = () => undefined;
    const discoveryStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    cache.has.mockImplementationOnce(() => {
      started();
      return new Promise<boolean>((resolve) => {
        release = resolve;
      });
    });
    const client = new WebGPUClient();
    const loading = client.load(undefined, MODEL);
    await discoveryStarted;
    client.cancelLoad();
    expect(await loading).toBe(false);
    release(true);
    await Promise.resolve();
    expect(create).not.toHaveBeenCalled();
    cache.has.mockResolvedValue(false);
    create.mockResolvedValue(engine);
    expect(await client.load(undefined, MODEL)).toBe(true);
  });

  it('recognises the refusals', () => {
    expect(isCacheWriteError(new Error('Cache.add() encountered a network error'))).toBe(true);
    expect(isCacheWriteError('QuotaExceededError')).toBe(true);
    expect(isCacheWriteError(new Error('Failed to fetch'))).toBe(false);
  });
});

describe('deleting a downloaded model', () => {
  beforeEach(() => {
    cache.remove.mockReset();
    cache.has.mockReset();
  });

  it('attempts every store and preserves a deletion failure even with no cached tensors', async () => {
    cache.remove
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('IndexedDB: no such store'))
      .mockResolvedValueOnce(undefined);
    cache.has.mockResolvedValue(false);
    await expect(WebGPUClient.deleteModelCache(MODEL)).rejects.toThrow('IndexedDB: no such store');
    // Both the pinned and old unpinned URLs in each backend.
    expect(cache.remove).toHaveBeenCalledTimes(4);
    expect(cache.remove.mock.calls.map(([, config]) => config.cacheBackend)).toEqual([
      'cache',
      'indexeddb',
      'cache',
      'indexeddb',
    ]);
  });

  it('succeeds when every artifact deletion completes', async () => {
    cache.remove.mockResolvedValue(undefined);
    await expect(WebGPUClient.deleteModelCache(MODEL)).resolves.toBeUndefined();
    expect(cache.remove).toHaveBeenCalledTimes(4);
    expect(cache.has).not.toHaveBeenCalled();
  });

  it('reports a failure that left a copy behind', async () => {
    cache.remove.mockRejectedValue(new Error('Cache API locked'));
    cache.has.mockResolvedValue(true);
    await expect(WebGPUClient.deleteModelCache(MODEL)).rejects.toThrow('Cache API locked');
  });
});

describe('failed deletion verification', () => {
  beforeEach(() => {
    cache.remove.mockReset().mockRejectedValue(new Error('Cache deletion refused'));
    cache.has.mockReset();
  });

  it('reports a surviving legacy copy even when no pinned copy remains', async () => {
    cache.has.mockImplementation(async (_id, config) => {
      const record = config.model_list.find(
        (entry: { model_id: string }) => entry.model_id === MODEL
      );
      return !record.model.includes('/resolve/') && config.cacheBackend === 'indexeddb';
    });
    await expect(WebGPUClient.deleteModelCache(MODEL)).rejects.toThrow('Cache deletion refused');
  });

  it.each(['WASM', 'chat config'])(
    'reports partial deletion when tensors are gone but %s removal fails',
    async (artifact) => {
      const failure = new Error(`${artifact} deletion refused`);
      cache.remove.mockResolvedValue(undefined).mockRejectedValueOnce(failure);
      // web-llm's hasModelInCache checks tensors only, not these remaining artifacts.
      cache.has.mockResolvedValue(false);
      await expect(WebGPUClient.deleteModelCache(MODEL)).rejects.toBe(failure);
      expect(cache.remove).toHaveBeenCalledTimes(4);
    }
  );

  it('does not treat an unreadable failed store as absent', async () => {
    cache.has.mockRejectedValue(new Error('Storage unavailable'));
    await expect(WebGPUClient.deleteModelCache(MODEL)).rejects.toThrow('Cache deletion refused');
  });
});
