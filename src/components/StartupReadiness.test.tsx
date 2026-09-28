import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const probe = vi.hoisted(() => ({
  callback: null as null | ((state: unknown) => void),
  startup: { pendingAssets: 0, pendingTasks: 0, revision: 0, ready: false },
  markReady: vi.fn(),
}));
vi.mock('@react-three/fiber', () => ({
  useFrame: (callback: (state: unknown) => void) => {
    probe.callback = callback;
  },
}));
vi.mock('../utils/startupReadiness', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils/startupReadiness')>()),
  getStartupSnapshot: () => probe.startup,
  markStartupReady: probe.markReady,
}));
import { StartupReadiness } from './StartupReadiness';

let now = 0;
const gl = {
  info: { programs: [], memory: { geometries: 50, textures: 10 } },
  getContext: () => ({ isContextLost: () => false }),
};
function frames(count = 60): void {
  for (let i = 0; i < count; i++) {
    now += 16;
    probe.callback?.({ gl });
  }
}
beforeEach(() => {
  now = 0;
  probe.markReady.mockClear();
  probe.startup = { pendingAssets: 0, pendingTasks: 0, revision: 0, ready: false };
  document.documentElement.dataset.millosWorldReady = 'true';
  document.documentElement.dataset.millosStaticBatchesPending = '0';
  vi.spyOn(performance, 'now').mockImplementation(() => now);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete document.documentElement.dataset.millosWorldReady;
  delete document.documentElement.dataset.millosStaticBatchesPending;
});

describe('StartupReadiness actual work barriers', () => {
  it.each(['world', 'assets', 'tasks', 'batches', 'unregistered-batches'])(
    'keeps rendering behind the overlay while %s is incomplete',
    (barrier) => {
      if (barrier === 'world') delete document.documentElement.dataset.millosWorldReady;
      if (barrier === 'assets') probe.startup.pendingAssets = 1;
      if (barrier === 'tasks') probe.startup.pendingTasks = 1;
      if (barrier === 'batches') document.documentElement.dataset.millosStaticBatchesPending = '1';
      if (barrier === 'unregistered-batches') {
        delete document.documentElement.dataset.millosStaticBatchesPending;
      }
      render(<StartupReadiness />);
      frames();
      expect(probe.markReady).not.toHaveBeenCalled();
      probe.startup.pendingAssets = 0;
      probe.startup.pendingTasks = 0;
      document.documentElement.dataset.millosWorldReady = 'true';
      document.documentElement.dataset.millosStaticBatchesPending = '0';
      frames(44);
      expect(probe.markReady).not.toHaveBeenCalled();
      frames();
      expect(probe.markReady).toHaveBeenCalled();
    }
  );
});
