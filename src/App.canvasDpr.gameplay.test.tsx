import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGraphicsStore } from './stores/graphicsStore';

// The canvas resolution is devicePixelRatio x Resolution Scale. Moving the
// window to another screen (or zooming) changes devicePixelRatio, and the
// canvas kept the old ratio until something else re-rendered App. Working if
// the canvas follows the resolution media query, and agrees with the slider.
const captured = vi.hoisted(() => ({ dpr: [] as unknown[] }));

vi.mock('@react-three/fiber', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@react-three/fiber')>()),
  Canvas: ({ dpr }: { dpr?: unknown }) => {
    captured.dpr.push(dpr);
    return null;
  },
}));
vi.mock('./utils/recoverableLazy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./utils/recoverableLazy')>();
  return {
    ...actual,
    recoverableLazy: () => Object.assign(() => null, { preload: () => Promise.resolve() }),
  };
});
vi.mock('./components/LoadingScreen', () => ({ LoadingScreen: () => null }));

const { default: App } = await import('./App');

const originalDpr = window.devicePixelRatio;
const setDpr = (value: number) =>
  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value });

type Listener = () => void;
let queries: { media: string; listeners: Set<Listener> }[] = [];
const fireResolutionChange = (from: number) => {
  for (const query of queries.filter((q) => q.media === `(resolution: ${from}dppx)`)) {
    for (const listener of [...query.listeners]) listener();
  }
};
const lastDpr = () => captured.dpr[captured.dpr.length - 1];

describe('App canvas resolution', () => {
  let storedGraphics: ReturnType<typeof useGraphicsStore.getState>['graphics'];
  beforeEach(() => {
    captured.dpr = [];
    queries = [];
    storedGraphics = useGraphicsStore.getState().graphics;
    vi.stubGlobal('matchMedia', (media: string) => {
      const query = { media, listeners: new Set<Listener>() };
      queries.push(query);
      return {
        media,
        matches: false,
        addEventListener: (_type: string, listener: Listener) => query.listeners.add(listener),
        removeEventListener: (_type: string, listener: Listener) =>
          query.listeners.delete(listener),
        addListener: () => {},
        removeListener: () => {},
      };
    });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    setDpr(originalDpr);
    useGraphicsStore.setState({ graphics: storedGraphics });
  });

  it('follows a devicePixelRatio change reported by the resolution media query', () => {
    setDpr(1);
    useGraphicsStore.getState().setGraphicsQuality('high');
    useGraphicsStore.getState().setGraphicsSetting('resolutionScale', 1);
    render(<App />);
    expect(lastDpr()).toBe(1);
    setDpr(2);
    act(() => fireResolutionChange(1));
    expect(lastDpr()).toBe(2);
  });

  it('holds a DPR-2 Low canvas at the 1x cap the slider stops at', () => {
    setDpr(2);
    useGraphicsStore.getState().setGraphicsQuality('low');
    useGraphicsStore.getState().setGraphicsSetting('resolutionScale', 0.75);
    render(<App />);
    expect(lastDpr()).toBe(1);
  });
});
