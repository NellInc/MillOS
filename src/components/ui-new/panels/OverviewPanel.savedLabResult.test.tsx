import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const startup = vi.hoisted(() => ({ ready: false, opened: false }));
vi.mock('../../../utils/startupReadiness', async (original) => ({
  ...(await original<typeof import('../../../utils/startupReadiness')>()),
  getStartupSnapshot: () => ({ ready: startup.ready, opened: startup.opened }),
  subscribeStartup: () => () => undefined,
}));
import {
  capturePhysicalSession,
  encodePhysicalSession,
  installPhysicalSession,
  isPhysicalSessionRestoring,
  PHYSICAL_SESSION_KEY,
} from '../../../utils/physicalSession';
import {
  registerReplayParticipant,
  REQUIRED_REPLAY_PARTICIPANTS,
  endReplayClock,
} from '../../../simulation/workplaceReplayRuntime';
import { useMaterialFlowStore } from '../../../stores/materialFlowStore';
import { useProductionStore } from '../../../stores/productionStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useBreakdownStore } from '../../../stores/breakdownStore';
import { useQCLabStore } from '../../../stores/qcLabStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useUIStore } from '../../../stores/uiStore';
import { resetUnifiedTickState } from '../../../systems/UnifiedGameTick';
import {
  useLogisticsLayoutStore,
  defaultSavedLogisticsLayout,
} from '../../../stores/logisticsLayoutStore';
import { MachineType } from '../../../types';
import { BatchGenealogySection } from './OverviewPanel';

const resetPlant = () => {
  useMaterialFlowStore.getState().resetMaterialFlow();
  useProductionStore.setState(useProductionStore.getInitialState(), true);
  useOperationsCampaignStore.getState().resetCampaign();
  useBreakdownStore.getState().resetBreakdownStore();
  useQCLabStore.getState().resetQCLab();
  useGameSimulationStore.getState().resetGameState();
  resetUnifiedTickState();
  useLogisticsLayoutStore.getState().restoreSaved(defaultSavedLogisticsLayout());
};

// Lab results saved before the lab recorded a falling number carry no such
// field. Working if such a save restores and its result still shows.
describe('a save whose lab results predate the falling number', () => {
  let dispose: (() => void) | undefined;
  let removeOwners: (() => void)[] = [];

  beforeEach(() => {
    resetPlant();
    localStorage.clear();
    useUIStore.setState({ alerts: [] });
    removeOwners = REQUIRED_REPLAY_PARTICIPANTS.map((id) =>
      registerReplayParticipant(id, {
        capture: () => ({ phase: 'waiting', value: 17 }),
        restore: () => undefined,
      })
    );
  });
  afterEach(() => {
    cleanup();
    dispose?.();
    dispose = undefined;
    removeOwners.forEach((remove) => remove());
    endReplayClock();
    resetPlant();
  });

  it('restores and shows the result without a falling number', () => {
    useProductionStore.getState().setMachines([
      {
        id: 'rm-101',
        name: 'R.M. 101',
        type: MachineType.ROLLER_MILL,
        position: [0, 0, 0],
        size: [1, 1, 1],
        rotation: 0,
        status: 'running',
        metrics: { rpm: 450, temperature: 60, vibration: 1, load: 80, wear: 25, efficiency: 100 },
        lastMaintenance: '2026-08-01',
        nextMaintenance: '2026-08-08',
      },
    ]);
    useMaterialFlowStore.getState().tickMaterialFlow(20, 1);
    const batch = useMaterialFlowStore.getState().productionBatches[0];
    expect(batch.availableKg).toBeGreaterThan(0);
    // The shape every test result had before: no fallingNumber key.
    useQCLabStore.getState().completeQCTest({
      machineId: batch.packerId,
      batchId: batch.id,
      sourceLotIds: [],
      grade: 'A',
      moistureContent: 13.2,
      proteinLevel: 11.8,
      ashContent: 0.52,
      particleSize: 120,
      passed: true,
    });
    const raw = encodePhysicalSession(capturePhysicalSession());
    const saved = JSON.parse(raw) as { quality: { qcLab: { testHistory: object[] } } };
    expect(saved.quality.qcLab.testHistory).toHaveLength(1);
    expect('fallingNumber' in saved.quality.qcLab.testHistory[0]).toBe(false);

    localStorage.setItem(PHYSICAL_SESSION_KEY, raw);
    resetPlant();
    dispose = installPhysicalSession();
    expect(isPhysicalSessionRestoring()).toBe(true);
    expect(useUIStore.getState().alerts.map((alert) => alert.id)).not.toContain(
      'physical-save-unavailable'
    );
    const restored = useQCLabStore.getState().qcLab.testHistory;
    expect(restored).toHaveLength(1);
    expect(restored[0].fallingNumber).toBeUndefined();

    render(<BatchGenealogySection />);
    const shown = within(screen.getByRole('group', { name: `Lab result ${restored[0].id}` }));
    expect(shown.getByText('Moisture 13.2%')).toBeInTheDocument();
    expect(shown.getByText('Protein 11.8%')).toBeInTheDocument();
    // No falling number is read without a stamped crop year, so none is shown.
    expect(shown.queryByText(/Falling number/)).toBeNull();
  });
});
