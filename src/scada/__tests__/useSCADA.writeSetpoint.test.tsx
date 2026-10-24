import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SCADAMode } from '../types';
import { useSCADA } from '../useSCADA';

const mocks = vi.hoisted(() => ({
  mode: 'simulation' as SCADAMode,
  initialize: vi.fn(),
  write: vi.fn(async () => true),
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
  getState: () => ({ connected: true, mode: mocks.mode }),
  getActiveFaults: () => [],
  updateMachineStates: vi.fn(),
  writeSetpoint: mocks.write,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.initialize.mockResolvedValue(service);
});
afterEach(cleanup);

describe('useSCADA().writeSetpoint, the operator UI path', () => {
  it('writes as the operator in simulation mode', async () => {
    mocks.mode = 'simulation';
    const { result } = renderHook(() => useSCADA());
    await waitFor(() => expect(result.current.isConnected).toBe(true));
    await act(async () => {
      await expect(result.current.writeSetpoint('RM101.ST001.SP', 1400)).resolves.toBe(true);
    });
    expect(mocks.write).toHaveBeenCalledWith('RM101.ST001.SP', 1400, 'operator');
  });

  it.each(['live', 'hybrid'] as const)(
    'refuses in %s mode without reaching the adapter (live writes stay default-denied)',
    async (mode) => {
      mocks.mode = mode;
      const { result } = renderHook(() => useSCADA());
      await waitFor(() => expect(result.current.mode).toBe(mode));
      await act(async () => {
        await expect(result.current.writeSetpoint('RM101.ST001.SP', 1400)).resolves.toBe(false);
      });
      expect(mocks.write).not.toHaveBeenCalled();
    }
  );
});
