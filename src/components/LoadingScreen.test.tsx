import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  pendingAssets: 0,
  pendingTasks: 0,
  loadedAssets: 10,
  totalAssets: 10,
  errors: 0,
  revision: 0,
  ready: false,
}));
vi.mock('../utils/startupReadiness', () => ({
  getStartupSnapshot: () => state,
  subscribeStartup: () => () => undefined,
}));
vi.mock('../config/featureFlags', () => ({
  FEATURE_FLAGS: { KNOWLEDGE_LOADING_QUOTES_ENABLED: false },
}));
import { LoadingScreen } from './LoadingScreen';

beforeEach(() => {
  vi.useFakeTimers();
  state.ready = false;
  state.errors = 0;
  delete document.documentElement.dataset.loaderFallback;
  document.documentElement.dataset.sceneReady = 'true';
  document.documentElement.dataset.millosWorldReady = 'true';
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.sceneReady;
  delete document.documentElement.dataset.millosWorldReady;
});

describe('LoadingScreen final readiness', () => {
  it('keeps keyboard focus on the cover before recovery and cycles the live Reload control', async () => {
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
    const reload = screen.getByRole('button', { name: 'Reload' });
    fireEvent.keyDown(cover, { key: 'Tab' });
    expect(reload).toHaveFocus();
    fireEvent.keyDown(reload, { key: 'Tab' });
    expect(reload).toHaveFocus();
    fireEvent.keyDown(reload, { key: 'Tab', shiftKey: true });
    expect(reload).toHaveFocus();
    fireEvent.keyDown(reload, { key: 'Escape' });
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

  it('offers recovery after prolonged startup without automatically revealing the scene', async () => {
    render(<LoadingScreen />);
    await act(async () => vi.advanceTimersByTimeAsync(60000));
    expect(screen.getByRole('progressbar')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeVisible();
    expect(document.documentElement.dataset.loaderFallback).toBeUndefined();
    expect(screen.queryByRole('button', { name: 'Continue while preparing' })).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(1);
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
    expect(screen.getByRole('button', { name: 'Reload' })).toBeVisible();
    expect(screen.getByRole('progressbar')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Continue while preparing' })).toBeNull();
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
