import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Alarm } from '../../scada/types';
import { useProductionStore } from '../../stores/productionStore';
import { useUIStore } from '../../stores/uiStore';
import { renderHook } from '@testing-library/react';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { chooseNotice, isCriticalConditionActive, usePAScheduler } from './shared';

const scada = vi.hoisted(() => ({ alarms: [] as Alarm[] }));

vi.mock('../../scada/SCADAService', () => ({
  peekSCADAService: () => ({ getActiveAlarms: () => scada.alarms }),
}));

vi.mock('../../utils/audioManager', () => ({
  audioManager: { muted: false },
}));

const REASSURING = [
  'The mill is calm. This is a measured condition, not optimism.',
  'Process path verified, receiving through packing. All interlocks ready.',
];

const articulationHiHi = (state: Alarm['state']): Alarm => ({
  id: 'TRUCK_SHIPPING.PT001.PV-HIHI',
  tagId: 'TRUCK_SHIPPING.PT001.PV',
  tagName: 'Shipping Truck Articulation',
  type: 'HIHI',
  state,
  priority: 'CRITICAL',
  value: 40,
  threshold: 38,
  timestamp: 0,
  disposition: 'IN_SERVICE',
});

const sampleMessages = (runs: number): Set<string> => {
  const seen = new Set<string>();
  for (let i = 0; i < runs; i++) seen.add(chooseNotice(12).message);
  return seen;
};

describe('ambient PA reassurance lines', () => {
  beforeEach(() => {
    scada.alarms = [];
    useProductionStore.setState({ machines: [] });
    useUIStore.setState({ alerts: [] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('can say the mill is calm when nothing critical is active', () => {
    expect(isCriticalConditionActive()).toBe(false);
    const seen = sampleMessages(4000);
    expect(REASSURING.some((line) => seen.has(line))).toBe(true);
  });

  it('never says the mill is calm while a SCADA critical alarm is standing', () => {
    // The SCADA banner reads 'Critical alarms active!'; the bell alert may
    // have been dismissed, so the UI alert list alone is not enough.
    scada.alarms = [articulationHiHi('UNACK')];
    expect(isCriticalConditionActive()).toBe(true);
    const seen = sampleMessages(4000);
    for (const line of REASSURING) expect(seen.has(line)).toBe(false);
  });

  it('does not treat a returned-to-normal critical as active', () => {
    scada.alarms = [articulationHiHi('RTN_UNACK')];
    expect(isCriticalConditionActive()).toBe(false);
  });

  it('treats an unacknowledged critical UI alert as active', () => {
    useUIStore.setState({
      alerts: [
        {
          id: 'breakdown-1',
          type: 'critical',
          title: 'Breakdown',
          message: 'R.M. 101 bearing overheat',
          timestamp: new Date(),
          acknowledged: false,
        },
      ],
    });
    expect(isCriticalConditionActive()).toBe(true);
  });
});

describe('ambient PA scheduler and the shift clock', () => {
  afterEach(() => {
    vi.useRealTimers();
    useGameSimulationStore.getState().resetGameState();
  });
  it('stays quiet over a paused shift and speaks again once the clock runs', () => {
    vi.useFakeTimers();
    const addAnnouncement = vi.fn();
    useProductionStore.setState({ addAnnouncement } as never);
    useGameSimulationStore.getState().holdClock('tour');
    const hook = renderHook(() => usePAScheduler());
    vi.advanceTimersByTime(400_000);
    expect(addAnnouncement).not.toHaveBeenCalled();
    useGameSimulationStore.getState().releaseClock('tour');
    vi.advanceTimersByTime(400_000);
    expect(addAnnouncement).toHaveBeenCalled();
    hook.unmount();
  });
});
