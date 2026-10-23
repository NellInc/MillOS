import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement, Suspense } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { importWithBoundedRetry, recoverableLazy } from '../recoverableLazy';
import { getStartupSnapshot } from '../startupReadiness';

describe('importWithBoundedRetry', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('returns the first successful import result', async () => {
    const importer = vi.fn().mockResolvedValue({ default: 'feature' });

    await expect(
      importWithBoundedRetry(importer, { attempts: 2, attemptTimeoutMs: 50, retryDelayMs: 0 })
    ).resolves.toEqual({ default: 'feature' });
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it('recovers from a transient import failure within the attempt budget', async () => {
    const importer = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary network failure'))
      .mockResolvedValueOnce({ default: 'feature' });

    await expect(
      importWithBoundedRetry(importer, { attempts: 2, attemptTimeoutMs: 50, retryDelayMs: 0 })
    ).resolves.toEqual({ default: 'feature' });
    expect(importer).toHaveBeenCalledTimes(2);
  });

  it('rejects after the bounded attempt budget is exhausted', async () => {
    const importer = vi.fn().mockRejectedValue(new Error('chunk unavailable'));

    await expect(
      importWithBoundedRetry(importer, { attempts: 2, attemptTimeoutMs: 50, retryDelayMs: 0 })
    ).rejects.toThrow('chunk unavailable');
    expect(importer).toHaveBeenCalledTimes(2);
  });

  it('times out an import that never settles', async () => {
    vi.useFakeTimers();
    const importer = vi.fn(() => new Promise<never>(() => undefined));
    const result = importWithBoundedRetry(importer, {
      attempts: 1,
      attemptTimeoutMs: 25,
      retryDelayMs: 0,
    });

    const expectation = expect(result).rejects.toThrow('Optional feature load exceeded 25ms');
    await vi.advanceTimersByTimeAsync(25);
    await expectation;
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it('still accepts a stalled first request that lands during the retry', async () => {
    vi.useFakeTimers();
    // A browser shares one module request per URL, so the retry can stall on
    // the same fetch while the first one is what eventually arrives.
    const importer = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(() => resolve({ default: 'late' }), 40))
      )
      .mockImplementationOnce(() => new Promise<never>(() => undefined));
    const result = importWithBoundedRetry(importer, {
      attempts: 2,
      attemptTimeoutMs: 25,
      retryDelayMs: 0,
    });

    const expectation = expect(result).resolves.toEqual({ default: 'late' });
    await vi.advanceTimersByTimeAsync(45);
    await expectation;
    expect(importer).toHaveBeenCalledTimes(2);
  });
});

describe('recoverableLazy preload', () => {
  afterEach(cleanup);

  it('renders a preloaded module without suspending and without a second import', async () => {
    const importer = vi.fn(async () => ({
      default: () => createElement('span', null, 'ready'),
    }));
    const Deferred = recoverableLazy(importer);
    await Deferred.preload();
    expect(importer).toHaveBeenCalledTimes(1);

    const { container } = render(
      createElement(
        Suspense,
        { fallback: createElement('i', null, 'fallback') },
        createElement(Deferred)
      )
    );
    // Synchronous: a suspended render would show the fallback first.
    expect(container.textContent).toBe('ready');
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it('a failed preload settles quietly and the render imports again', async () => {
    const importer = vi
      .fn()
      .mockRejectedValueOnce(new Error('dropped request'))
      .mockResolvedValueOnce({ default: () => createElement('span', null, 'ready') });
    const Deferred = recoverableLazy(importer, { attempts: 1, retryDelayMs: 0 });
    await expect(Deferred.preload()).resolves.toBeUndefined();

    const { findByText } = render(
      createElement(Suspense, { fallback: null }, createElement(Deferred))
    );
    expect(await findByText('ready')).toBeTruthy();
    expect(importer).toHaveBeenCalledTimes(2);
  });
});

describe('recoverableLazy startup accounting', () => {
  afterEach(cleanup);

  it('holds readiness for a lazy module until its import really resolves', async () => {
    const initial = getStartupSnapshot().pendingTasks;
    let resolve!: (module: { default: () => null }) => void;
    const Deferred = recoverableLazy(
      () =>
        new Promise<{ default: () => null }>((done) => {
          resolve = done;
        })
    );
    render(createElement(Suspense, { fallback: null }, createElement(Deferred)));
    expect(getStartupSnapshot().pendingTasks).toBe(initial + 1);
    await act(async () => resolve({ default: () => null }));
    expect(getStartupSnapshot().pendingTasks).toBe(initial);
  });
});
