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
  delete document.documentElement.dataset.sceneReady;
  delete document.documentElement.dataset.millosWorldReady;
});

describe('LoadingScreen final readiness', () => {
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
    fireEvent.click(screen.getByRole('button', { name: 'Continue while preparing' }));
    await act(async () => vi.advanceTimersByTimeAsync(250));
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(document.documentElement.dataset.loaderFallback).toBe('true');
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
