import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { unifiedGameTick, resetUnifiedTickState } from '../UnifiedGameTick';
import { createEgressDrillSequencer } from '../egressDrillSequencer';
import { useWorkplaceStore } from '../../stores/workplaceStore';
import { createWorkplace } from '../../simulation/bilateralWorkplace';
import { useProductionStore } from '../../stores/productionStore';
import { useMaterialFlowStore } from '../../stores/materialFlowStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useBreakdownStore } from '../../stores/breakdownStore';
import { useTruckScheduleStore } from '../../stores/truckScheduleStore';
import { useQCLabStore } from '../../stores/qcLabStore';
import { useSafetyStore } from '../../stores/safetyStore';
import { useUIStore } from '../../stores/uiStore';
import { endReplayClock } from '../../simulation/workplaceReplayRuntime';
import { mockMachines } from '../../test/fixtures/mockMachines';

vi.setConfig({ testTimeout: 60_000 });

beforeEach(() => {
  endReplayClock();
  vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 8, 30, 8));
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  useUIStore.setState(useUIStore.getInitialState());
  resetUnifiedTickState();
  useWorkplaceStore.setState({ workplace: createWorkplace() });
  useMaterialFlowStore.getState().resetMaterialFlow();
  useOperationsCampaignStore.getState().resetCampaign();
  useGameSimulationStore.getState().resetGameState();
  useSafetyStore.getState().setForkliftEmergencyStop(false);
  useBreakdownStore.getState().resetBreakdownStore();
  useTruckScheduleStore.getState().resetTruckSchedule();
  useQCLabStore.getState().resetQCLab();
  useProductionStore.setState({
    ...useProductionStore.getInitialState(),
    machines: mockMachines.map((m) => ({ ...m, status: 'running' as const })),
    productionSpeed: 1,
  });
});
afterEach(() => {
  endReplayClock();
  useGameSimulationStore.getState().resetGameState();
  useSafetyStore.getState().setForkliftEmergencyStop(false);
  vi.restoreAllMocks();
});

const tick = (gameSpeed: number) =>
  unifiedGameTick({ deltaSeconds: 0.5, gameTime: 0, gameSpeed, elapsedTime: 0, tickCount: 1 });

// A drill that ends a handoff trial early can leave the member review owing
// recovery, which no one can deliver during the drill. The review's clock
// backstop re-held the clock every frame, so the drill's game-time sequencer
// could never verify a zone and the drill never ended by itself.
// Working if, once the player resumes, the drill completes on its own while the
// review stays held off plant time.
it('lets an egress drill finish over a handoff review that owes recovery', () => {
  const w = useWorkplaceStore.getState();
  expect(w.beginImprovement('cooperative', w.workplace.revision).changed).toBe(true);
  expect(w.proposeImprovement('buffer', 'maintenance').changed).toBe(true);
  w.acknowledgeImprovement();
  for (const m of useWorkplaceStore.getState().workplace.members) {
    w.understand(m.id);
    w.vote(m.id, true);
  }
  expect(w.activate(useWorkplaceStore.getState().workplace.revision).changed).toBe(true);
  useGameSimulationStore.getState().setGameSpeed(15);
  for (let n = 0; n < 40; n++) tick(15);
  expect(useWorkplaceStore.getState().workplace.phase).toBe('active');

  useGameSimulationStore.getState().startEmergencyDrill();
  tick(15);
  const settled = useWorkplaceStore.getState().workplace;
  expect(settled.phase).toBe('review');
  expect(settled.improvement?.verdict).toBeFalsy();
  // The member owes recovery (as after an early stop of extra work), so the
  // review is held by the overridable workplace backstop, not the derived
  // handoff decision hold, which by design waits for the review itself.
  useWorkplaceStore.setState({
    workplace: {
      ...settled,
      members: settled.members.map((m, i) => (i === 0 ? { ...m, recoveryOwedMinutes: 10 } : m)),
    },
  });
  const review = useWorkplaceStore.getState().workplace;

  // The player resumes the clock to let the drill run.
  useGameSimulationStore.getState().setGameSpeed(15);
  const drill = createEgressDrillSequencer();
  const reviewMinute = review.minute;
  for (let n = 0; n < 200 && useGameSimulationStore.getState().emergencyDrillMode; n++) {
    tick(15);
    drill({ deltaSeconds: 0.5, gameTime: 0, gameSpeed: 15, elapsedTime: 0, tickCount: n });
  }
  expect(useGameSimulationStore.getState().emergencyDrillMode).toBe(false);
  // The review itself gained no plant time.
  expect(useWorkplaceStore.getState().workplace.minute).toBe(reviewMinute);
  expect(useWorkplaceStore.getState().workplace.phase).toBe('review');
});
