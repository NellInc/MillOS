import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { STANDARD_GAME_SPEED } from '../simulation/pace';
import { resetUnifiedTickState, unifiedGameTick } from '../systems/UnifiedGameTick';
import type { TickContext } from '../systems/CentralTickSystem';
import { useMaterialFlowStore } from './materialFlowStore';
import { useQCLabStore } from './qcLabStore';
import { useTruckScheduleStore } from './truckScheduleStore';
import { useUIStore } from './uiStore';
import { useProductionStore } from './productionStore';
import { useSafetyStore } from './safetyStore';
import { useGameSimulationStore } from './gameSimulationStore';
import { useOperationsCampaignStore } from './operationsCampaignStore';
import { useLogisticsLayoutStore, defaultSavedLogisticsLayout } from './logisticsLayoutStore';
import { mockMachines } from '../test/fixtures/mockMachines';
import { setLocale } from '../i18n';

// The layout planner reads "controls matched" only when each window recorded
// exactly one operating condition. The condition used to carry every machine's
// status and the active order id, so an order rolling over, or a roller mill
// breaking down that the forklift routes never meet, read "controls changed"
// on almost every long run. The comparison is now judged on what bears on the
// layout: the pace and line speed, the packers and silos at the ends of the
// routes (a 'warning' packer still runs at full rate), the shipping dock's
// dispatch release and the forklift stop. The campaign's own order pacing,
// which follows each order's priority, is left out with the order.
// Working if a long run with order rollover still reads one condition, and a
// relevant change still reads two.

const tick = (index: number, gameSpeed = STANDARD_GAME_SPEED): TickContext => ({
  deltaSeconds: 0.5,
  gameTime: 0,
  gameSpeed,
  elapsedTime: 0,
  tickCount: index,
});
const conditions = () => useLogisticsLayoutStore.getState().observation.conditions;
const setStatus = (id: string, status: 'running' | 'idle' | 'warning' | 'critical') =>
  useProductionStore.setState((state) => ({
    machines: state.machines.map((m) => (m.id === id ? { ...m, status } : m)),
  }));
let tickIndex = 0;
const run = (count: number, gameSpeed = STANDARD_GAME_SPEED) => {
  for (let i = 0; i < count; i++) unifiedGameTick(tick(++tickIndex, gameSpeed));
};

describe('layout comparison conditions', () => {
  beforeEach(() => {
    setLocale('en');
    tickIndex = 0;
    resetUnifiedTickState();
    useGameSimulationStore.getState().resetGameState();
    useSafetyStore.getState().setForkliftEmergencyStop(false);
    useMaterialFlowStore.getState().resetMaterialFlow();
    useOperationsCampaignStore.getState().resetCampaign();
    useTruckScheduleStore.getState().resetTruckSchedule();
    useQCLabStore.getState().resetQCLab();
    useUIStore.setState({ alerts: [] });
    useProductionStore.setState({
      productionSpeed: 1,
      machines: mockMachines.map((m) => ({ ...m, metrics: { ...m.metrics } })),
    });
    useLogisticsLayoutStore.getState().restoreSaved(defaultSavedLogisticsLayout());
  });
  afterEach(() => {
    useSafetyStore.getState().setForkliftEmergencyStop(false);
    useProductionStore.setState({ machines: [], productionSpeed: 1 });
  });

  it('keeps one condition through an order rollover and an unrelated breakdown', () => {
    run(3);
    expect(conditions()).toHaveLength(1);
    const orders = useOperationsCampaignStore.getState().orders;
    const next = orders.find(
      (order) => order.id !== useOperationsCampaignStore.getState().activeOrderId
    );
    expect(next).toBeDefined();
    useOperationsCampaignStore.setState({ activeOrderId: next!.id });
    run(3);
    setStatus('rm-101', 'critical');
    setStatus('sifter-a', 'idle');
    run(3);
    // A packer at its wear warning is still running at the same rate.
    setStatus('packer-1', 'warning');
    run(3);
    expect(conditions()).toHaveLength(1);
  });

  it.each([
    ['a packer breaking down', () => setStatus('packer-1', 'critical')],
    ['a silo stopping', () => setStatus('silo-alpha', 'idle')],
    ['the line speed changing', () => useProductionStore.setState({ productionSpeed: 0.5 })],
    ['dispatch being held', () => useQCLabStore.getState().updateCertificationStatus('expired')],
    ['the forklifts being stopped', () => useSafetyStore.getState().setForkliftEmergencyStop(true)],
  ])('records %s as a changed control', (_label, change) => {
    run(3);
    expect(conditions()).toHaveLength(1);
    change();
    run(3);
    expect(conditions()).toHaveLength(2);
  });

  it('records a pace change as a changed control', () => {
    run(3);
    run(3, STANDARD_GAME_SPEED * 2);
    expect(conditions()).toHaveLength(2);
  });
});
