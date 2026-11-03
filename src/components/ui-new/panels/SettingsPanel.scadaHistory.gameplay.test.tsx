import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./BuildCacheDiagnostics', () => ({ BuildCacheDiagnostics: () => null }));

// The order the reset touches the historian in, shared by both mocks below.
const calls: string[] = [];
const historyBehaviour: {
  init: () => Promise<void>;
  clearAll: () => Promise<void>;
} = {
  init: async () => {},
  clearAll: async () => {},
};
let stopBehaviour: () => Promise<void> = async () => {};
const serviceStop = vi.fn(() => {
  calls.push('service.stop');
  return stopBehaviour();
});
let serviceRunning = true;

vi.mock('../../../scada/HistoryStore', () => ({
  HistoryStore: class {
    init() {
      calls.push('history.init');
      return historyBehaviour.init();
    }
    clearAll() {
      calls.push('history.clearAll');
      return historyBehaviour.clearAll();
    }
    async close(flush?: boolean) {
      calls.push(`history.close(${String(flush)})`);
    }
  },
}));

vi.mock('../../../scada/SCADAService', () => ({
  peekSCADAService: () => (serviceRunning ? { stop: serviceStop } : null),
}));

import { SettingsPanel } from './SettingsPanel';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';

const originalLocation = window.location;

const confirmFullReset = (): ReturnType<typeof vi.fn> => {
  const reload = vi.fn(() => calls.push('reload'));
  Object.defineProperty(window, 'location', { configurable: true, value: { reload } });
  render(<SettingsPanel productionSpeed={1} setProductionSpeed={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Reset Simulation' }));
  fireEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', { name: 'Reset Everything' })
  );
  return reload;
};

// Reset Simulation swept every millos-* localStorage key and reloaded, but the
// SCADA trend history lives in IndexedDB (MillOS_SCADA). After the reload the
// History replay and trend charts still showed the plant from before the reset.
// Working if: the live service stops writing, the historian is cleared, and
// only then does the page reload; a blocked or hung IndexedDB never stops the
// reload.
describe('SettingsPanel Reset Simulation clears the SCADA history', () => {
  beforeEach(() => {
    calls.length = 0;
    serviceRunning = true;
    serviceStop.mockClear();
    stopBehaviour = async () => {};
    historyBehaviour.init = async () => {};
    historyBehaviour.clearAll = async () => {};
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
    useGameSimulationStore.getState().resetGameState();
  });

  it('stops the live service, clears the historian, then reloads', async () => {
    const reload = confirmFullReset();
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(calls).toEqual([
      'service.stop',
      'history.init',
      'history.clearAll',
      'history.close(false)',
      'reload',
    ]);
  });

  it('still clears the historian when no SCADA service was started', async () => {
    serviceRunning = false;
    const reload = confirmFullReset();
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(calls).toContain('history.clearAll');
    expect(calls.indexOf('history.clearAll')).toBeLessThan(calls.indexOf('reload'));
  });

  it('still reloads when the historian clear fails', async () => {
    historyBehaviour.clearAll = () => Promise.reject(new DOMException('blocked', 'UnknownError'));
    const reload = confirmFullReset();
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });

  it('still clears the historian when the live link never finishes disconnecting', async () => {
    vi.useFakeTimers();
    stopBehaviour = () => new Promise<void>(() => {});
    const reload = confirmFullReset();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(calls).toContain('history.clearAll');
  });

  // A slow stop's own close flushes the samples it buffered; when that lands
  // after the clear, pre-reset samples are written back before the reload.
  // Working if a stop that settles late is followed by a second clear.
  it('clears again after a stop that settles past its deadline', async () => {
    vi.useFakeTimers();
    stopBehaviour = () =>
      new Promise<void>((resolve) =>
        setTimeout(() => {
          calls.push('service.flush');
          resolve();
        }, 2_500)
      );
    const reload = confirmFullReset();
    await vi.advanceTimersByTimeAsync(6_000);
    expect(reload).toHaveBeenCalledTimes(1);
    const flushed = calls.indexOf('service.flush');
    expect(flushed).toBeGreaterThan(-1);
    expect(calls.lastIndexOf('history.clearAll')).toBeGreaterThan(flushed);
    expect(calls.lastIndexOf('history.clearAll')).toBeLessThan(calls.indexOf('reload'));
  });

  it('still reloads, within seconds, when IndexedDB never answers', async () => {
    vi.useFakeTimers();
    historyBehaviour.init = () => new Promise<void>(() => {});
    const reload = confirmFullReset();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  // The reload now waits on the clear. Cancel, the backdrop or Escape in that
  // window closed the dialog over a paused plant that then reloaded anyway, and
  // a second Reset from Settings was ignored. Working if the dialog stays up
  // and says the reset is running until the page reloads.
  it('Cancel and Escape cannot close the dialog once the reset has started', async () => {
    let release: () => void = () => {};
    historyBehaviour.clearAll = () => new Promise<void>((resolve) => (release = resolve));
    const reload = confirmFullReset();
    await waitFor(() => expect(calls).toContain('history.clearAll'));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    fireEvent.keyDown(dialog, { key: 'Escape' });
    // A closed dialog leaves through its exit animation; give it time to go.
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(screen.queryByRole('dialog')).toBeInTheDocument();
    expect(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Resetting...' })
    ).toHaveAttribute('aria-disabled', 'true');
    release();
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });

  it('a second press while the clear runs does not reset twice', async () => {
    let release: () => void = () => {};
    historyBehaviour.clearAll = () => new Promise<void>((resolve) => (release = resolve));
    const reload = confirmFullReset();
    await waitFor(() => expect(calls).toContain('history.clearAll'));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Resetting...' })
    );
    release();
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(calls.filter((call) => call === 'history.clearAll')).toHaveLength(1);
    expect(serviceStop).toHaveBeenCalledTimes(1);
  });
});
