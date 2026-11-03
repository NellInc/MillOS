import { act, cleanup, render } from '@testing-library/react';
import { type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Same harness as App.compactSheetForklift: the Canvas renders nothing and
// each lazy chunk is a stub, so App's own effects run alone.
vi.mock('@react-three/fiber', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@react-three/fiber')>()),
  Canvas: ({ children }: { children?: ReactNode }) => (void children, null),
}));
vi.mock('./utils/recoverableLazy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./utils/recoverableLazy')>();
  return {
    ...actual,
    recoverableLazy: () => Object.assign(() => null, { preload: () => Promise.resolve() }),
  };
});
vi.mock('./components/LoadingScreen', () => ({ LoadingScreen: () => null }));
vi.mock('./hooks/useMobileDetection', () => ({
  useMobileDetection: () => ({
    isMobile: true,
    isSmallScreen: true,
    isCompactLayout: true,
    isTouchDevice: true,
    isLandscape: true,
  }),
}));

const { default: App } = await import('./App');
const { useUIStore } = await import('./stores/uiStore');

// A phone enters walk mode whenever it turns to landscape, including the first
// mount after a reload. The guided delivery (persisted as open) is written for
// the orbit view and is not shown in walk mode, so a player mid-delivery came
// back with no guide on screen. Working if an open guide keeps the orbit view.
describe('a phone in landscape with a guided delivery open', () => {
  afterEach(() => {
    cleanup();
    useUIStore.setState({ journeyVisible: false, fpsMode: false });
  });

  it('keeps the orbit view the guide is written for', async () => {
    useUIStore.setState({ journeyVisible: true, fpsMode: false });
    render(<App />);
    await act(async () => {});
    expect(useUIStore.getState().fpsMode).toBe(false);
  });

  it('still enters walk mode when no guide is open', async () => {
    useUIStore.setState({ journeyVisible: false, fpsMode: false });
    render(<App />);
    await act(async () => {});
    expect(useUIStore.getState().fpsMode).toBe(true);
  });
});
