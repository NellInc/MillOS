import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  currentLogisticsLayout,
  DEFAULT_PLANNING_ASSUMPTIONS,
  optimizeLogisticsLayout,
  planningObstacles,
} from '../simulation/layoutPlanning';
import { registerLogisticsVehicle } from '../simulation/logisticsRuntime';
import { useLogisticsLayoutStore, defaultSavedLogisticsLayout } from './logisticsLayoutStore';
import { canonicalProcessMachines } from '../simulation/materialTransport';
import { useProductionStore } from './productionStore';
import { useGameSimulationStore } from './gameSimulationStore';
import { useSafetyStore } from './safetyStore';
import { useMaterialFlowStore } from './materialFlowStore';
import { spoutMachineKey } from '../components/flow/spoutRoutes';
import type { MachineData } from '../types';

// The planner shows `retainedAfter ?? observation` against `before`. Apply and
// undo both need the shift paused, so a player can apply a proposal and undo
// it, or apply a second one, before a single tick has run. The window that
// closed then measured nothing, and it was sealed anyway: an undo kept an
// empty "after" on screen for good (every rate Pending, and the run under the
// restored layout never shown), and a second apply sealed an empty "before"
// over the baseline the player had collected.
// Working if a window that ran no time is never sealed over a measured one.

const removals: Array<() => void> = [];
const proposal = () =>
  optimizeLogisticsLayout(
    currentLogisticsLayout(),
    DEFAULT_PLANNING_ASSUMPTIONS,
    planningObstacles()
  ).proposal;
const key = () => spoutMachineKey(useProductionStore.getState().machines);
const shown = () => {
  const s = useLogisticsLayoutStore.getState();
  return { before: s.before, after: s.retainedAfter ?? s.observation };
};

describe('a layout window that measured nothing', () => {
  beforeEach(() => {
    useLogisticsLayoutStore.getState().restoreSaved(defaultSavedLogisticsLayout());
    useProductionStore.setState({
      machines: canonicalProcessMachines() as MachineData[],
      productionSpeed: 1,
      scadaLive: false,
    });
    useGameSimulationStore.getState().resetGameState();
    useGameSimulationStore.getState().setGameSpeed(0);
    useSafetyStore.getState().setForkliftEmergencyStop(false);
    useMaterialFlowStore.getState().resetMaterialFlow();
    for (const dock of ['shipping', 'receiving'] as const)
      removals.push(registerLogisticsVehicle(dock, { prepare: () => () => {}, restore: () => {} }));
  });
  afterEach(() => removals.splice(0).forEach((remove) => remove()));

  it('an undo before the applied layout ran keeps collecting the baseline it interrupted', () => {
    const store = useLogisticsLayoutStore.getState();
    const session = useMaterialFlowStore.getState().sessionId;
    store.observe(session, 600, 600, 900, 300, 'same');
    expect(store.apply(proposal(), 0, key()).changed).toBe(true);
    expect(store.undoApplied(1, key()).changed).toBe(true);
    // Play resumes under the restored layout.
    store.observe(session, 60, 60, 90, 30, 'same');
    const { after } = shown();
    expect(after.activeSeconds).toBe(660);
    expect(after.packedKg).toBe(990);
  });

  it('a second apply before the first ran keeps the measured baseline as its before', () => {
    const store = useLogisticsLayoutStore.getState();
    const session = useMaterialFlowStore.getState().sessionId;
    store.observe(session, 600, 600, 900, 300, 'same');
    const first = proposal();
    expect(store.apply(first, 0, key()).changed).toBe(true);
    // A second proposal, applied while still paused.
    const second = structuredClone(first);
    (second.staging.shipping as unknown as number[])[0] += 0.5;
    const result = store.apply(second, 1, key());
    expect(result.changed).toBe(true);
    expect(shown().before?.activeSeconds).toBe(600);
    expect(shown().before?.packedKg).toBe(900);
    // Undo returns to the first proposal, which never ran: the baseline stays
    // the before, and the run under the restored layout is the after.
    expect(store.undoApplied(2, key()).changed).toBe(true);
    store.observe(session, 60, 60, 90, 30, 'same');
    expect(shown().before?.activeSeconds).toBe(600);
    expect(shown().after.activeSeconds).toBe(60);
  });

  it('a measured after window is still sealed by undo', () => {
    const store = useLogisticsLayoutStore.getState();
    const session = useMaterialFlowStore.getState().sessionId;
    store.observe(session, 600, 600, 900, 300, 'same');
    expect(store.apply(proposal(), 0, key()).changed).toBe(true);
    store.observe(session, 120, 120, 200, 80, 'same');
    expect(store.undoApplied(1, key()).changed).toBe(true);
    store.observe(session, 60, 60, 90, 30, 'same');
    expect(shown().before?.activeSeconds).toBe(600);
    expect(shown().after.activeSeconds).toBe(120);
  });
});
