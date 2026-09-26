import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fulfilComposerCapture,
  registerSceneCapture,
  requestScenePng,
  setComposerCaptureAvailable,
} from './sceneCapture';

function canvasReturning(dataUrl: string): HTMLCanvasElement {
  return { toDataURL: vi.fn(() => dataUrl) } as unknown as HTMLCanvasElement;
}

afterEach(() => {
  setComposerCaptureAvailable(false);
  registerSceneCapture(null);
  vi.useRealTimers();
});

describe('scene capture', () => {
  it('uses the synchronous renderer capture when no composer is mounted', async () => {
    registerSceneCapture(() => 'data:sync');
    await expect(requestScenePng()).resolves.toBe('data:sync');
  });

  it('waits for the composer frame instead of re-rendering without post-processing', async () => {
    const sync = vi.fn(() => 'data:sync');
    registerSceneCapture(sync);
    setComposerCaptureAvailable(true);

    const idle = canvasReturning('data:idle');
    fulfilComposerCapture(idle);
    expect(idle.toDataURL).not.toHaveBeenCalled();

    const first = requestScenePng();
    const second = requestScenePng();
    fulfilComposerCapture(canvasReturning('data:composed'));

    await expect(first).resolves.toBe('data:composed');
    await expect(second).resolves.toBe('data:composed');
    expect(sync).not.toHaveBeenCalled();
  });

  it('resolves null when no composer frame arrives', async () => {
    vi.useFakeTimers();
    setComposerCaptureAvailable(true);
    const pending = requestScenePng();
    vi.advanceTimersByTime(1000);
    await expect(pending).resolves.toBeNull();
  });

  it('falls back to the synchronous path when the composer unmounts mid-request', async () => {
    registerSceneCapture(() => 'data:sync');
    setComposerCaptureAvailable(true);
    const pending = requestScenePng();
    setComposerCaptureAvailable(false);
    await expect(pending).resolves.toBe('data:sync');
  });
});
