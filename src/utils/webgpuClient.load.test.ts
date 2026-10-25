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
    vi.stubGlobal(
      'Worker',
      class {
        terminate() {}
      }
    );
    vi.stubGlobal('navigator', { ...globalThis.navigator, gpu: {} });
  });
  afterEach(() => vi.unstubAllGlobals());

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

  it('does not retry any other failure', async () => {
    create.mockRejectedValue(new Error('The WebGPU device was lost while loading the model.'));
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

  it('clears every store even when one of them fails, and is done if nothing is left', async () => {
    cache.remove
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('IndexedDB: no such store'))
      .mockResolvedValueOnce(undefined);
    cache.has.mockResolvedValue(false);
    await expect(WebGPUClient.deleteModelCache(MODEL)).resolves.toBeUndefined();
    // Cache API and IndexedDB for the pinned copy, then the old unpinned copy.
    expect(cache.remove).toHaveBeenCalledTimes(3);
    expect(cache.remove.mock.calls.map(([, config]) => config.cacheBackend)).toEqual([
      'cache',
      'indexeddb',
      'cache',
    ]);
  });

  it('reports a failure that left a copy behind', async () => {
    cache.remove.mockRejectedValue(new Error('Cache API locked'));
    cache.has.mockResolvedValue(true);
    await expect(WebGPUClient.deleteModelCache(MODEL)).rejects.toThrow('Cache API locked');
  });
});
