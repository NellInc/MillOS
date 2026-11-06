import { readFileSync } from 'node:fs';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  pendingAssets: 0,
  pendingTasks: 0,
  loadedAssets: 10,
  totalAssets: 10,
  errors: 0,
  revision: 0,
  prepared: false,
  opened: false,
  ready: false,
  deferredShaders: false,
  startedTasks: 0,
  finishedTasks: 0,
  shaderPrograms: 0,
  shaderProgramsReady: 0,
  settleFrames: 0,
}));
const beginTask = vi.hoisted(() =>
  vi.fn(() => {
    state.pendingTasks++;
    state.startedTasks++;
    state.revision++;
    let finished = false;
    return (failed = false) => {
      if (finished) return;
      finished = true;
      state.pendingTasks--;
      state.finishedTasks++;
      state.errors += Number(failed);
      state.revision++;
    };
  })
);
const flags = vi.hoisted(() => ({
  KNOWLEDGE_LOADING_QUOTES_ENABLED: false,
  IN_APP_REDUCED_MOTION_ENABLED: false,
}));
const openPrepared = vi.hoisted(() =>
  vi.fn(() => {
    state.opened = true;
    return true;
  })
);
const resetPreparation = vi.hoisted(() =>
  vi.fn(() => {
    state.prepared = false;
  })
);
vi.mock('../utils/startupReadiness', () => ({
  getStartupSnapshot: () => state,
  beginStartupTask: beginTask,
  subscribeStartup: () => () => undefined,
  openPreparedStartup: openPrepared,
  resetStartupPreparation: resetPreparation,
}));
vi.mock('../config/featureFlags', () => ({
  FEATURE_FLAGS: flags,
}));
vi.mock('./knowledge/LoadingQuote', () => {
  throw new Error('Optional feature load exceeded 15000ms');
});
import { LoadingScreen } from './LoadingScreen';
import { useGraphicsStore } from '../stores/graphicsStore';
import { useMotionPreferenceStore } from '../stores/motionPreferenceStore';

beforeEach(() => {
  vi.useFakeTimers();
  flags.KNOWLEDGE_LOADING_QUOTES_ENABLED = false;
  state.ready = false;
  state.prepared = false;
  state.opened = false;
  state.deferredShaders = false;
  state.errors = 0;
  state.pendingAssets = 0;
  state.pendingTasks = 0;
  state.loadedAssets = 10;
  state.totalAssets = 10;
  state.startedTasks = 0;
  state.finishedTasks = 0;
  state.shaderPrograms = 0;
  state.shaderProgramsReady = 0;
  state.settleFrames = 0;
  state.revision = 0;
  beginTask.mockClear();
  openPrepared.mockClear();
  resetPreparation.mockClear();
  useGraphicsStore.getState().setGraphicsQuality('low');
  delete document.documentElement.dataset.loaderFallback;
  document.documentElement.dataset.sceneReady = 'true';
  document.documentElement.dataset.millosWorldReady = 'true';
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  flags.IN_APP_REDUCED_MOTION_ENABLED = false;
  useMotionPreferenceStore.setState({ mode: 'system' });
  delete document.documentElement.dataset.sceneReady;
  delete document.documentElement.dataset.millosWorldReady;
});

describe('LoadingScreen final readiness', () => {
  it('names the work holding the cover, and only the phase is announced', async () => {
    const view = render(<LoadingScreen />);
    const live = () => screen.getByRole('progressbar').getAttribute('aria-valuetext');
    for (const [next, phase, count] of [
      [{ pendingAssets: 2, loadedAssets: 8, totalAssets: 10 }, 'Downloading', '8 of 10 files'],
      [
        { pendingAssets: 0, loadedAssets: 10, pendingTasks: 1, startedTasks: 3, finishedTasks: 2 },
        'Building the world',
        '2 of 3 parts',
      ],
      [
        { pendingAssets: 3, loadedAssets: 10, totalAssets: 13, pendingTasks: 0, finishedTasks: 3 },
        'Downloading',
        '10 of 13 files',
      ],
      [
        { pendingAssets: 0, loadedAssets: 13, shaderPrograms: 40, shaderProgramsReady: 12 },
        'Compiling shaders',
        '12 of 40',
      ],
      [
        { shaderProgramsReady: 40, settleFrames: 20 },
        'Settling the animation',
        '20 of 45 frames on time',
      ],
    ] as const) {
      Object.assign(state, next);
      view.rerender(<LoadingScreen />);
      expect(live()).toBe(phase);
      // The count is visual: the live status holds the phase alone.
      const status = screen.getByText(count, { exact: false });
      expect(status).toHaveAttribute('aria-hidden', 'true');
      expect(status.parentElement).toHaveAttribute('aria-live', 'polite');
      expect(status.parentElement?.firstChild?.textContent).toBe(phase);
    }
    await act(async () => vi.advanceTimersByTimeAsync(60000));
    expect(screen.queryByRole('button', { name: 'Reload' })).toBeNull();
    expect(screen.queryByText(/keep waiting or reload/)).toBeNull();
    expect(screen.getByRole('progressbar')).toBeVisible();
  });

  it('fills through every kind of startup work and never moves backwards', () => {
    const bar = () => Number(screen.getByRole('progressbar').getAttribute('aria-valuenow'));
    Object.assign(state, { pendingAssets: 8, loadedAssets: 2, totalAssets: 10 });
    const view = render(<LoadingScreen />);
    // Downloads are 10% of the bar (STARTUP_PHASE_WEIGHTS).
    expect(bar()).toBe(2);
    // The held-asset run read 94, 92, 53, 94, 84, 95: each wave of newly
    // queued assets grew the total and pulled the bar back.
    for (const [next, shown] of [
      [{ pendingAssets: 5, loadedAssets: 5, totalAssets: 10 }, 5],
      [{ pendingAssets: 15, loadedAssets: 5, totalAssets: 20 }, 5],
      [{ pendingAssets: 5, loadedAssets: 15, totalAssets: 20 }, 8],
      [{ pendingAssets: 0, loadedAssets: 20, totalAssets: 20 }, 10],
      [{ pendingAssets: 30, loadedAssets: 20, totalAssets: 50 }, 10],
      // The old bar stopped at 95 here, whatever was still left to do.
      [{ pendingAssets: 0, loadedAssets: 50, startedTasks: 4, finishedTasks: 4 }, 55],
      [{ shaderPrograms: 100, shaderProgramsReady: 50 }, 73],
      [{ shaderProgramsReady: 100, settleFrames: 45 }, 99],
    ] as const) {
      Object.assign(state, next);
      view.rerender(<LoadingScreen />);
      expect(bar()).toBe(shown);
    }
    state.ready = true;
    view.rerender(<LoadingScreen />);
    expect(bar()).toBe(100);
  });

  it('offers low graphics within seconds once a complete world is confirmed slow', async () => {
    useGraphicsStore.getState().setGraphicsQuality('medium');
    state.prepared = true;
    const view = render(<LoadingScreen />);
    await act(async () => vi.advanceTimersByTimeAsync(4999));
    expect(screen.queryByRole('button', { name: 'Use low graphics' })).toBeNull();
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(
      screen.getByText('The scene is loaded, but animation is still slow on this device.')
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Use low graphics' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Open loaded scene (slow)' })).toBeVisible();
    // A >1 s hitch restarts the frame window without any resource change. The
    // way out must not flicker away on the device it was offered to.
    state.prepared = false;
    view.rerender(<LoadingScreen />);
    expect(screen.getByRole('button', { name: 'Use low graphics' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Open loaded scene (slow)' })).toBeVisible();
    expect(
      screen.getByText('The scene is loaded, but animation is still slow on this device.')
    ).toBeVisible();
    expect(screen.queryByText(/taking longer than usual/)).toBeNull();
    // A real resource change is a new world to judge.
    state.revision++;
    view.rerender(<LoadingScreen />);
    expect(screen.queryByRole('button', { name: 'Use low graphics' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open loaded scene (slow)' })).toBeNull();
  });

  // A deferred truck prewarm is offered through the slow-device path; the
  // status must name what is unfinished, not claim the animation is slow.
  it('says the trucks are still being prepared when a deferred prewarm is offered', async () => {
    state.prepared = true;
    state.deferredShaders = true;
    render(<LoadingScreen minimumLoadTimeMs={0} />);
    await act(async () => vi.advanceTimersByTimeAsync(5000));
    expect(
      screen.getByText('The scene is loaded, but the delivery trucks are still being prepared.')
    ).toBeVisible();
    expect(screen.queryByText(/animation is still slow/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reload' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open loaded scene (slow)' }));
    expect(openPrepared).toHaveBeenCalledTimes(1);
  });

  it('keeps "Open loaded scene" through a hitch in the same revision, and it still opens', async () => {
    useGraphicsStore.getState().setGraphicsQuality('medium');
    state.prepared = true;
    const view = render(<LoadingScreen minimumLoadTimeMs={0} />);
    await act(async () => vi.advanceTimersByTimeAsync(5000));
    const open = screen.getByRole('button', { name: 'Open loaded scene (slow)' });
    // The hitch: the frame window restarts, nothing else changes.
    state.prepared = false;
    view.rerender(<LoadingScreen minimumLoadTimeMs={0} />);
    expect(screen.getByRole('button', { name: 'Open loaded scene (slow)' })).toBe(open);
    fireEvent.click(open);
    expect(openPrepared).toHaveBeenCalledTimes(1);
    expect(state.ready).toBe(false);
    view.rerender(<LoadingScreen minimumLoadTimeMs={0} />);
    await act(async () => vi.advanceTimersByTimeAsync(250));
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('does not offer low graphics for a brief slow window that clears', async () => {
    useGraphicsStore.getState().setGraphicsQuality('medium');
    state.prepared = true;
    const view = render(<LoadingScreen />);
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    state.prepared = false;
    view.rerender(<LoadingScreen />);
    await act(async () => vi.advanceTimersByTimeAsync(10000));
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('says why low graphics is offered after a long load', async () => {
    useGraphicsStore.getState().setGraphicsQuality('medium');
    render(<LoadingScreen />);
    await act(async () => vi.advanceTimersByTimeAsync(29999));
    expect(screen.queryByText(/taking longer than usual/)).toBeNull();
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(
      screen.getByText(
        'Loading is taking longer than usual. Low graphics can help on a slower device.'
      )
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Use low graphics' })).toBeVisible();
  });

  // A tab opened in the background cannot become ready: rendering and the
  // readiness probe stop while it is hidden. The 30 s timer ran on wall time,
  // so the player came back to "taking longer than usual" and an offer to drop
  // to Low, a choice that is then kept for every later visit.
  // Working if only visible time counts towards the slow-load offer.
  it('counts only visible time towards the slow-load offer', async () => {
    useGraphicsStore.getState().setGraphicsQuality('medium');
    let visibility: DocumentVisibilityState = 'visible';
    const visibilitySpy = vi
      .spyOn(document, 'visibilityState', 'get')
      .mockImplementation(() => visibility);
    try {
      render(<LoadingScreen />);
      await act(async () => vi.advanceTimersByTimeAsync(10_000));
      visibility = 'hidden';
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await act(async () => vi.advanceTimersByTimeAsync(60_000));
      visibility = 'visible';
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      expect(screen.queryByRole('button', { name: 'Use low graphics' })).toBeNull();
      expect(screen.queryByText(/taking longer than usual/)).toBeNull();
      await act(async () => vi.advanceTimersByTimeAsync(19_999));
      expect(screen.queryByRole('button', { name: 'Use low graphics' })).toBeNull();
      await act(async () => vi.advanceTimersByTimeAsync(1));
      expect(screen.getByRole('button', { name: 'Use low graphics' })).toBeVisible();
    } finally {
      visibilitySpy.mockRestore();
    }
  });

  // The slow-world confirmation ran on wall time too. Nothing renders while
  // the tab is hidden, so `prepared` keeps its last value and the 5 s ran out
  // in the background: a world slow for a moment before the player switched
  // tabs came back latched as slow, offering Low (a choice that is kept).
  // Working if only visible time confirms a slow world.
  it('counts only visible time towards confirming a slow world', async () => {
    useGraphicsStore.getState().setGraphicsQuality('medium');
    state.prepared = true;
    let visibility: DocumentVisibilityState = 'visible';
    const visibilitySpy = vi
      .spyOn(document, 'visibilityState', 'get')
      .mockImplementation(() => visibility);
    try {
      render(<LoadingScreen />);
      await act(async () => vi.advanceTimersByTimeAsync(2_000));
      visibility = 'hidden';
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await act(async () => vi.advanceTimersByTimeAsync(20_000));
      visibility = 'visible';
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      expect(screen.queryByRole('button', { name: 'Use low graphics' })).toBeNull();
      expect(screen.queryByText(/animation is still slow/)).toBeNull();
      await act(async () => vi.advanceTimersByTimeAsync(2_999));
      expect(screen.queryByRole('button', { name: 'Use low graphics' })).toBeNull();
      await act(async () => vi.advanceTimersByTimeAsync(1));
      expect(screen.getByRole('button', { name: 'Use low graphics' })).toBeVisible();
    } finally {
      visibilitySpy.mockRestore();
    }
  });

  it('never lets optional quote failure invalidate scene startup', async () => {
    flags.KNOWLEDGE_LOADING_QUOTES_ENABLED = true;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<LoadingScreen recoveryDelayMs={1} minimumLoadTimeMs={0} />);
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(beginTask).not.toHaveBeenCalled();
    expect(state.pendingTasks).toBe(0);
    expect(state.errors).toBe(0);
    expect(screen.getByRole('dialog', { name: 'Loading MillOS' })).toBeVisible();
  });

  it('offers explicit access only to a prepared slow world and leaves strict readiness false', async () => {
    state.prepared = true;
    const view = render(<LoadingScreen recoveryDelayMs={1} minimumLoadTimeMs={0} />);
    await act(async () => vi.advanceTimersByTimeAsync(2));
    expect(screen.getByRole('progressbar')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Open loaded scene (slow)' }));
    expect(openPrepared).toHaveBeenCalledTimes(1);
    expect(state.ready).toBe(false);
    view.rerender(<LoadingScreen recoveryDelayMs={1} minimumLoadTimeMs={0} />);
    await act(async () => vi.advanceTimersByTimeAsync(250));
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('invalidates preparation before switching to low graphics without bypassing the cover', async () => {
    useGraphicsStore.getState().setGraphicsQuality('medium');
    state.prepared = true;
    render(<LoadingScreen recoveryDelayMs={1} minimumLoadTimeMs={0} />);
    await act(async () => vi.advanceTimersByTimeAsync(2));
    fireEvent.click(screen.getByRole('button', { name: 'Use low graphics' }));
    expect(resetPreparation).toHaveBeenCalledTimes(1);
    expect(useGraphicsStore.getState().graphics.quality).toBe('low');
    expect(screen.getByRole('progressbar')).toBeVisible();
    expect(openPrepared).not.toHaveBeenCalled();
  });

  it('keeps keyboard focus on the cover when Use low graphics removes itself', async () => {
    useGraphicsStore.getState().setGraphicsQuality('medium');
    render(
      <>
        <LoadingScreen recoveryDelayMs={1} minimumLoadTimeMs={0} />
        <button>Covered application control</button>
      </>
    );
    await act(async () => vi.advanceTimersByTimeAsync(2));
    const lowGraphics = screen.getByRole('button', { name: 'Use low graphics' });
    lowGraphics.focus();
    fireEvent.click(lowGraphics);
    expect(screen.queryByRole('button', { name: 'Use low graphics' })).toBeNull();
    const cover = screen.getByRole('dialog', { name: 'Loading MillOS' });
    expect(cover).toHaveFocus();
    fireEvent.keyDown(cover, { key: 'Tab' });
    expect(screen.getByRole('button', { name: 'Covered application control' })).not.toHaveFocus();
  });

  it('does not offer slow access after a loading error', async () => {
    state.prepared = true;
    state.errors = 1;
    render(<LoadingScreen recoveryDelayMs={1} minimumLoadTimeMs={0} />);
    await act(async () => vi.advanceTimersByTimeAsync(2));
    expect(screen.queryByRole('button', { name: 'Open loaded scene (slow)' })).toBeNull();
    expect(screen.getByRole('progressbar')).toBeVisible();
  });
  it('keeps the application mounted when the optional quote import fails', async () => {
    flags.KNOWLEDGE_LOADING_QUOTES_ENABLED = true;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <>
        <LoadingScreen recoveryDelayMs={1} />
        <button>Application control</button>
      </>
    );

    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(screen.getByRole('dialog', { name: 'Loading MillOS' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Application control' })).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  it('keeps keyboard focus on the cover without a routine reload control', async () => {
    render(
      <>
        <LoadingScreen />
        <button>Covered application control</button>
      </>
    );
    const cover = screen.getByRole('dialog', { name: 'Loading MillOS' });
    expect(cover).toHaveFocus();
    expect(fireEvent.keyDown(cover, { key: 'Tab' })).toBe(false);
    expect(cover).toHaveFocus();
    expect(fireEvent.keyDown(cover, { key: 'Tab', shiftKey: true })).toBe(false);
    expect(cover).toHaveFocus();

    await act(async () => vi.advanceTimersByTimeAsync(31000));
    expect(screen.queryByRole('button', { name: 'Reload' })).toBeNull();
    fireEvent.keyDown(cover, { key: 'Tab' });
    expect(cover).toHaveFocus();
    fireEvent.keyDown(cover, { key: 'Tab', shiftKey: true });
    expect(cover).toHaveFocus();
    fireEvent.keyDown(cover, { key: 'Escape' });
    expect(cover).toHaveFocus();
    expect(screen.getByRole('progressbar')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Covered application control' })).not.toHaveFocus();
  });

  it('keeps the overlay through first-frame, asset completion and the old 8-second timeout', async () => {
    render(<LoadingScreen />);
    await act(async () => vi.advanceTimersByTimeAsync(9000));
    expect(screen.getByRole('progressbar', { name: 'Loading MillOS' })).toBeVisible();
    expect(document.documentElement.dataset.loaderFallback).toBeUndefined();
    expect(screen.queryByRole('button', { name: 'Continue while preparing' })).toBeNull();
  });

  // At Low graphics a load that stops moving (an asset fetch with no timeout)
  // left only the progress bar: no control at all. A slow device still gets no
  // routine reload prompt (the test below), but nothing moving for 90 s is a
  // stall. Working if the cover then says so and offers Reload.
  it('offers Reload when nothing has moved for 90 seconds, at Low graphics', async () => {
    render(<LoadingScreen />);
    await act(async () => vi.advanceTimersByTimeAsync(60000));
    expect(screen.queryByRole('button', { name: 'Reload' })).toBeNull();
    await act(async () => vi.advanceTimersByTimeAsync(35000));
    expect(screen.getByText('Loading has not moved for a while.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeVisible();
  });

  it('keeps prolonged preparation covered without a reload prompt or automatic reveal', async () => {
    render(<LoadingScreen />);
    await act(async () => vi.advanceTimersByTimeAsync(60000));
    expect(screen.getByRole('progressbar')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Reload' })).toBeNull();
    expect(document.documentElement.dataset.loaderFallback).toBeUndefined();
    expect(screen.queryByRole('button', { name: 'Continue while preparing' })).toBeNull();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    await act(async () => vi.advanceTimersByTimeAsync(250));
    expect(screen.getByRole('progressbar')).toBeVisible();
    expect(state.ready).toBe(false);
  });

  it('keeps error recovery covered even when an obsolete fallback marker is present', async () => {
    state.errors = 1;
    document.documentElement.dataset.loaderFallback = 'true';
    render(<LoadingScreen />);
    await act(async () => vi.advanceTimersByTimeAsync(60000));
    expect(screen.getByText('Some resources could not be loaded.')).toBeVisible();
    // Reversed from cdd997ce: a known error can never clear, so the cover must
    // offer an explicit way out rather than strand the visitor.
    expect(screen.getByRole('button', { name: 'Reload' })).toBeVisible();
    expect(screen.getByRole('progressbar')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Continue while preparing' })).toBeNull();
  });

  it('offers Reload as soon as an error is known, with a truthful status and a held focus trap', async () => {
    useGraphicsStore.getState().setGraphicsQuality('medium');
    state.errors = 1;
    render(
      <>
        <LoadingScreen />
        <button>Covered application control</button>
      </>
    );
    // No 30-second wait once the error is already known.
    await act(async () => vi.advanceTimersByTimeAsync(10));
    expect(screen.getByText('Loading could not finish')).toBeVisible();
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuetext',
      'Loading could not finish'
    );
    expect(screen.getByText('Some resources could not be loaded.')).toBeVisible();
    const reload = screen.getByRole('button', { name: 'Reload' });
    // A quality switch cannot clear an error, so it is not offered as a way out.
    expect(screen.queryByRole('button', { name: 'Use low graphics' })).toBeNull();

    const cover = screen.getByRole('dialog', { name: 'Loading MillOS' });
    cover.focus();
    fireEvent.keyDown(cover, { key: 'Tab' });
    expect(reload).toHaveFocus();
    fireEvent.keyDown(reload, { key: 'Tab' });
    expect(reload).toHaveFocus();
    fireEvent.keyDown(reload, { key: 'Tab', shiftKey: true });
    expect(reload).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Covered application control' })).not.toHaveFocus();
  });

  it('never leaves a low-quality load with an error and no control', async () => {
    state.errors = 1;
    render(<LoadingScreen />);
    await act(async () => vi.advanceTimersByTimeAsync(60000));
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Reload']);
  });

  it('hands over immediately with reduced motion, only after real readiness', async () => {
    vi.stubGlobal('matchMedia', () => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const view = render(<LoadingScreen />);
    await act(async () => vi.advanceTimersByTimeAsync(60000));
    expect(screen.getByRole('progressbar')).toBeVisible();
    state.ready = true;
    view.rerender(<LoadingScreen />);
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('hands over immediately when the in-app Reduce motion is On and the OS is not', async () => {
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    flags.IN_APP_REDUCED_MOTION_ENABLED = true;
    useMotionPreferenceStore.setState({ mode: 'reduce' });
    state.ready = true;
    render(<LoadingScreen />);
    await act(async () => vi.advanceTimersByTimeAsync(700));
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('keeps the 220 ms fade for a saved On while the in-app control is gated off', async () => {
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    flags.IN_APP_REDUCED_MOTION_ENABLED = false;
    useMotionPreferenceStore.setState({ mode: 'reduce' });
    state.ready = true;
    render(<LoadingScreen />);
    await act(async () => vi.advanceTimersByTimeAsync(700));
    await act(async () => vi.advanceTimersByTimeAsync(0));
    // Still mounted, fading out over 220 ms.
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTimeAsync(250));
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('reveals only when final readiness and the minimum display time are satisfied', async () => {
    state.ready = true;
    render(<LoadingScreen />);
    await act(async () => vi.advanceTimersByTimeAsync(699));
    expect(screen.getByRole('progressbar')).toBeVisible();
    await act(async () => vi.advanceTimersByTimeAsync(1));
    await act(async () => vi.advanceTimersByTimeAsync(250));
    expect(screen.queryByRole('progressbar')).toBeNull();
  });
});

it('uses the MillOS mark for both loading covers and the sidebar inset without changing readiness', () => {
  const view = render(<LoadingScreen />);
  const image = view.container.querySelector('img')!;
  expect(image.getAttribute('src')).toContain('textures/signage/millos-mark-v1.webp');
  expect(image.getAttribute('width')).toBe('56');
  expect(image.getAttribute('height')).toBe('56');
  expect(image.getAttribute('aria-hidden')).toBe('true');
  expect(image.getAttribute('alt')).toBe('');
  expect(screen.getByRole('progressbar')).toBeVisible();
  for (const file of [
    'index.html',
    'src/components/LoadingScreen.tsx',
    'src/components/ui-new/sidebar/ContextSidebar.tsx',
  ]) {
    const source = readFileSync(file, 'utf8');
    expect(source).toContain('millos-mark-v1.webp');
    // The factory emoji, by code point: the lint rule forbids it as a literal.
    expect(source).not.toContain(String.fromCodePoint(0x1f3ed));
  }
  const html = readFileSync('index.html', 'utf8');
  expect(html).toContain('%BASE_URL%textures/signage/millos-mark-v1.png');
  expect(html).toContain('width="56"');
});
