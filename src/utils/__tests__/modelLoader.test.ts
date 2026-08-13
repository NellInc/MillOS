import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkModelExists, isBundledModel } from '../modelLoader';

describe('modelLoader', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('recognises delivery-validated bundled models without a network probe', () => {
    expect(isBundledModel('forklift')).toBe(true);
    expect(isBundledModel('worker')).toBe(true);
    expect(isBundledModel('silo')).toBe(false);
  });

  it('coalesces concurrent availability checks for optional models', async () => {
    const fetchMock = vi.fn(async () => {
      await Promise.resolve();
      return new Response(null, {
        status: 200,
        headers: { 'Content-Type': 'model/gltf-binary' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const path = '/models/test/optional-model.glb';
    const [first, second] = await Promise.all([checkModelExists(path), checkModelExists(path)]);

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(path, {
      method: 'HEAD',
      signal: expect.any(AbortSignal),
    });
  });

  it('aborts an availability probe that exceeds its deadline', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      (_path: string, options: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          options.signal?.addEventListener(
            'abort',
            () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
            { once: true }
          );
        })
    );
    vi.stubGlobal('fetch', fetchMock);

    const check = checkModelExists('/models/test/hung-model.glb', 25);
    await vi.advanceTimersByTimeAsync(25);

    await expect(check).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it('retries a transient failure after the negative cache expires', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-13T00:00:00Z'));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: { 'Content-Type': 'model/gltf-binary' },
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    const path = '/models/test/transient-model.glb';
    await expect(checkModelExists(path)).resolves.toBe(false);
    await expect(checkModelExists(path)).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(30_001);
    await expect(checkModelExists(path)).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects an HTML SPA fallback as a missing model', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<!doctype html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        })
      )
    );

    await expect(checkModelExists('/models/test/spa-fallback.glb')).resolves.toBe(false);
  });
});
