import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TagValue } from '../types';
import { useSCADATag } from '../useSCADA';
import { MILL_TAGS } from '../tagDatabase';

const mocks = vi.hoisted(() => ({
  enabled: true,
  initialize: vi.fn(),
  shutdown: vi.fn(),
  values: vi.fn(),
  alarms: vi.fn(),
  offValues: vi.fn(),
  offAlarms: vi.fn(),
  history: vi.fn(),
  notify: null as ((values: TagValue[]) => void) | null,
}));
vi.mock('../SCADAService', () => ({
  initializeSCADA: mocks.initialize,
  shutdownSCADA: mocks.shutdown,
  getSCADAService: () => service,
}));
vi.mock('../../stores/graphicsStore', () => ({
  useGraphicsStore: (select: (state: { graphics: { enableSCADA: boolean } }) => unknown) =>
    select({ graphics: { enableSCADA: mocks.enabled } }),
}));
const service = {
  subscribeToValues: mocks.values,
  subscribeToAlarms: mocks.alarms,
  getState: () => ({ connected: true, mode: 'simulation' }),
  getHistory: mocks.history,
};
const tagId = MILL_TAGS.find((tag) => tag.machineId === 'rm-101' && tag.group === 'FLOW')!.id;
const reading: TagValue = { tagId, value: 12.4, quality: 'GOOD', timestamp: 100 };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.enabled = true;
  mocks.notify = null;
  mocks.initialize.mockResolvedValue(service);
  mocks.values.mockImplementation((notify: (values: TagValue[]) => void) => {
    mocks.notify = notify;
    notify([reading]);
    return mocks.offValues;
  });
  mocks.alarms.mockReturnValue(mocks.offAlarms);
  mocks.history.mockResolvedValue([{ timestamp: 100, value: 12.4, quality: 'GOOD' }]);
});
afterEach(cleanup);

describe('standalone SCADA tag views', () => {
  it('receives a real tag and history without mounting the SCADA panel', async () => {
    const { result } = renderHook(() => useSCADATag(tagId));
    await waitFor(() => expect(result.current.value).toEqual(reading));
    await act(() => result.current.loadHistory(300000));
    expect(result.current.history).toEqual([{ timestamp: 100, value: 12.4, quality: 'GOOD' }]);
    expect(mocks.initialize).toHaveBeenCalledTimes(1);
    expect(mocks.history).toHaveBeenCalledWith(tagId, expect.any(Number), expect.any(Number));
  });

  it('shares one subscription and never stops the application-owned historian', async () => {
    const first = renderHook(() => useSCADATag(tagId));
    const second = renderHook(() => useSCADATag(tagId));
    await waitFor(() => expect(second.result.current.value).toEqual(reading));
    first.unmount();
    expect(mocks.offValues).not.toHaveBeenCalled();
    act(() => mocks.notify?.([{ ...reading, value: 14.2, timestamp: 200 }]));
    expect(second.result.current.value?.value).toBe(14.2);
    second.unmount();
    expect(mocks.values).toHaveBeenCalledTimes(1);
    expect(mocks.offValues).toHaveBeenCalledTimes(1);
    expect(mocks.offAlarms).toHaveBeenCalledTimes(1);
    expect(mocks.shutdown).not.toHaveBeenCalled();
  });

  it('does not connect for an empty tag or disabled SCADA', () => {
    const empty = renderHook(() => useSCADATag(''));
    empty.unmount();
    mocks.enabled = false;
    renderHook(() => useSCADATag(tagId));
    expect(mocks.initialize).not.toHaveBeenCalled();
  });

  it('clears the tag when SCADA is disabled', async () => {
    const hook = renderHook(() => useSCADATag(tagId));
    await waitFor(() => expect(hook.result.current.value).toEqual(reading));
    mocks.enabled = false;
    hook.rerender();
    await waitFor(() => expect(hook.result.current.value).toBeUndefined());
    expect(mocks.offValues).toHaveBeenCalledTimes(1);
  });

  it('discards an initialization that finishes after its view has closed', async () => {
    let resolve!: (value: typeof service) => void;
    mocks.initialize.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      })
    );
    const closed = renderHook(() => useSCADATag(tagId));
    closed.unmount();
    const current = renderHook(() => useSCADATag(tagId));
    await act(async () => resolve(service));
    await waitFor(() => expect(current.result.current.value).toEqual(reading));
    expect(mocks.values).toHaveBeenCalledTimes(1);
  });
});
