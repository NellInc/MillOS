import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FaultInjection } from '../types';
import { useSCADA } from '../useSCADA';

/**
 * The Simulation Lab lists the faults the adapter is running. The list lived in
 * each hook instance's own state and started empty, so closing and reopening
 * the SCADA panel while a fault ran (or reading it from a second surface) showed
 * no active fault and no Clear all faults button. Working if every instance
 * shows the adapter's faults from its first render.
 */
const mocks = vi.hoisted(() => ({
  initialize: vi.fn(),
  faults: [] as Array<{
    tagId: string;
    faultType: FaultInjection['faultType'];
    startTime: number;
    duration: number;
    severity: number;
  }>,
}));
vi.mock('../SCADAService', () => ({
  initializeSCADA: mocks.initialize,
  shutdownSCADA: vi.fn(),
  getSCADAService: () => service,
  peekSCADAService: () => service,
}));
vi.mock('../../stores/graphicsStore', () => ({
  useGraphicsStore: (select: (state: { graphics: { enableSCADA: boolean } }) => unknown) =>
    select({ graphics: { enableSCADA: true } }),
}));
const service = {
  subscribeToValues: vi.fn(() => () => undefined),
  subscribeToAlarms: vi.fn(() => () => undefined),
  getState: () => ({ connected: true, mode: 'simulation' }),
  getActiveFaults: () => [...mocks.faults],
  injectFault: (fault: FaultInjection) => {
    mocks.faults.push({
      tagId: fault.tagId,
      faultType: fault.faultType,
      startTime: Date.now(),
      duration: fault.duration ?? 0,
      severity: fault.severity ?? 1,
    });
  },
  updateMachineStates: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.faults = [];
  mocks.initialize.mockResolvedValue(service);
});
afterEach(cleanup);

describe('useSCADA().activeFaults', () => {
  it('shows a running fault to a panel opened after it was injected', async () => {
    const first = renderHook(() => useSCADA());
    await waitFor(() => expect(first.result.current.isConnected).toBe(true));
    act(() => {
      first.result.current.injectFault({
        tagId: 'RM101.TT001.PV',
        faultType: 'spike',
        duration: 10_000,
        severity: 1.5,
      });
    });
    expect(first.result.current.activeFaults).toHaveLength(1);
    first.unmount();

    const reopened = renderHook(() => useSCADA());
    await waitFor(() => expect(reopened.result.current.isConnected).toBe(true));
    expect(reopened.result.current.activeFaults.map((fault) => fault.faultType)).toEqual(['spike']);
  });
});
