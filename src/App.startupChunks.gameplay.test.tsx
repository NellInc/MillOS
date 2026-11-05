import { describe, expect, it, vi } from 'vitest';

// Two startup contracts App sets up as it loads, before anything renders.
const captured = vi.hoisted(() => ({ lazyOptions: [] as unknown[] }));

vi.mock('@react-three/fiber', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@react-three/fiber')>()),
  Canvas: () => null,
}));
vi.mock('./utils/recoverableLazy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./utils/recoverableLazy')>();
  return {
    ...actual,
    recoverableLazy: (_importer: unknown, options?: unknown) => {
      captured.lazyOptions.push(options);
      return Object.assign(() => null, { preload: () => Promise.resolve() });
    },
  };
});
vi.mock('./components/LoadingScreen', () => ({ LoadingScreen: () => null }));

const { plantClockAt } = await import('./stores/historicalPlaybackStore');
const { startSharedTextureBake } = await import('./utils/sharedTextureBake');
await import('./App');

describe('App startup', () => {
  // The texture bake keeps its own 20 s deadline. Inside a scene chunk's
  // importer it ran down that chunk's 15 s download budget, so a slow device
  // ended startup on 'Loading could not finish' and Reload.
  // Working if both scene chunks wait for the bake outside their budget.
  it('waits for the texture bake before the scene chunks start their import budget', () => {
    const gated = captured.lazyOptions.filter(
      (options) =>
        (options as { awaitBefore?: unknown } | undefined)?.awaitBefore === startSharedTextureBake
    );
    expect(gated).toHaveLength(2);
  });

  // History replay labels SCADA samples with the plant clock it sampled while
  // they were recorded. The sampler started at the first replay use, so every
  // sample recorded before it fell back to the wall clock.
  // Working if the plant clock is sampled from the moment the app loads.
  it('samples the plant clock for history replay from the moment the app loads', () => {
    expect(plantClockAt(Date.now())).toBeDefined();
  });
});
