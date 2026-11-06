import { beforeEach, describe, expect, it } from 'vitest';
import {
  captureSavedLogisticsLayout,
  defaultSavedLogisticsLayout,
  useLogisticsLayoutStore,
  validateSavedLogisticsLayout,
  type LogisticsObservation,
} from './logisticsLayoutStore';
import { currentLogisticsLayout } from '../simulation/layoutPlanning';
import { canonicalProcessMachines } from '../simulation/materialTransport';

const observed = (activeSeconds: number, packedKg: number): LogisticsObservation => ({
  activeSeconds,
  materialSeconds: activeSeconds,
  packedKg,
  shippedKg: packedKg / 2,
  vehicleMetres: 40,
  completedUnloads: 1,
  conditions: ['[100,30]'],
});

beforeEach(() => {
  useLogisticsLayoutStore.getState().restoreSaved(defaultSavedLogisticsLayout());
});

describe('LayoutPlanner before/after comparison across a reload', () => {
  it('carries the sealed before, the current run and its session through capture and restore', () => {
    const before = observed(600, 900);
    const after = observed(120, 200);
    useLogisticsLayoutStore.setState({
      layout: currentLogisticsLayout(),
      previous: currentLogisticsLayout(),
      revision: 1,
      sessionId: 'material-session-a',
      before,
      observation: after,
      retainedAfter: null,
    });
    // A reload: the record goes through JSON and the load-time validation.
    const saved = validateSavedLogisticsLayout(
      JSON.parse(JSON.stringify(captureSavedLogisticsLayout())),
      canonicalProcessMachines()
    );
    useLogisticsLayoutStore.getState().restoreSaved(defaultSavedLogisticsLayout());
    useLogisticsLayoutStore.getState().restoreSaved(saved);
    const state = useLogisticsLayoutStore.getState();
    expect(state.before).toEqual(before);
    expect(state.observation).toEqual(after);
    expect(state.sessionId).toBe('material-session-a');
    // The restored material session keeps accumulating into the same run.
    state.observe('material-session-a', 60, 60, 100, 50, '[100,30]');
    expect(useLogisticsLayoutStore.getState().before).toEqual(before);
    expect(useLogisticsLayoutStore.getState().observation.activeSeconds).toBe(180);
  });

  it('restores an older record, or one with a malformed comparison, without one', () => {
    useLogisticsLayoutStore.setState({ sessionId: 's', before: observed(1, 1) });
    useLogisticsLayoutStore
      .getState()
      .restoreSaved({ layout: currentLogisticsLayout(), previous: null, revision: 2 });
    expect(useLogisticsLayoutStore.getState().before).toBeNull();
    expect(useLogisticsLayoutStore.getState().observation.activeSeconds).toBe(0);

    const raw = {
      layout: currentLogisticsLayout(),
      previous: null,
      revision: 2,
      comparison: { sessionId: 's', observation: { activeSeconds: 'x' }, before: null },
    };
    const saved = validateSavedLogisticsLayout(raw, canonicalProcessMachines());
    expect(saved.revision).toBe(2);
    useLogisticsLayoutStore.getState().restoreSaved(saved);
    expect(useLogisticsLayoutStore.getState().before).toBeNull();
    expect(useLogisticsLayoutStore.getState().observation.activeSeconds).toBe(0);
  });
});
