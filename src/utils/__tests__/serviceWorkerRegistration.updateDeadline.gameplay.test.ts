import { afterEach, describe, expect, it, vi } from 'vitest';
import { updateServiceWorker } from '../serviceWorkerRegistration';

const original = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');

// Build & cache diagnostics disables all four of its buttons while it checks.
// registration.update() fetches the worker script, and on a stalled connection
// it could hang, holding the buttons until a reload. Working if the check
// gives up after a deadline.
describe('Check for update on a stalled connection', () => {
  afterEach(() => {
    vi.useRealTimers();
    if (original) Object.defineProperty(navigator, 'serviceWorker', original);
    else delete (navigator as unknown as Record<string, unknown>).serviceWorker;
  });

  it('gives up after its deadline instead of waiting forever', async () => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistration: () => Promise.resolve({ update: () => new Promise(() => {}) }),
      },
    });
    let settled: boolean | undefined;
    void updateServiceWorker().then((result) => {
      settled = result;
    });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(settled).toBe(false);
  });
});
