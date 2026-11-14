import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const startup = vi.hoisted(() => ({ ready: false, listeners: new Set<() => void>() }));
vi.mock('../startupReadiness', async (original) => ({
  ...(await original<typeof import('../startupReadiness')>()),
  getStartupSnapshot: () => ({ ready: startup.ready, opened: false }),
  subscribeStartup: (callback: () => void) => {
    startup.listeners.add(callback);
    return () => startup.listeners.delete(callback);
  },
}));
import {
  capturePhysicalSession,
  decodePhysicalSession,
  encodePhysicalSession,
  installPhysicalSession,
  PHYSICAL_SESSION_KEY,
} from '../physicalSession';
import {
  registerReplayParticipant,
  REQUIRED_REPLAY_PARTICIPANTS,
  endReplayClock,
} from '../../simulation/workplaceReplayRuntime';
import { useMaterialFlowStore } from '../../stores/materialFlowStore';
import { useProductionStore } from '../../stores/productionStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { useBreakdownStore } from '../../stores/breakdownStore';
import { useQCLabStore } from '../../stores/qcLabStore';
import {
  LINE_RESTART_ALERT_ID,
  selectRestartPending,
  useGameSimulationStore,
} from '../../stores/gameSimulationStore';
import { useUIStore } from '../../stores/uiStore';
import { resetUnifiedTickState } from '../../systems/UnifiedGameTick';
import {
  useLogisticsLayoutStore,
  defaultSavedLogisticsLayout,
} from '../../stores/logisticsLayoutStore';
import { MachineType } from '../../types';

// The far side of D13 and 6.4 in a saved session: a stop saved mid-way, a line
// saved waiting for its restart, and a drill's record all come back with a
// way out (CLEAR, then RESTART LINE).
let dispose: (() => void) | undefined;
let removeOwners: (() => void)[] = [];
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
const runningMill = () =>
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
const millStatus = () =>
  useProductionStore.getState().machines.find((m) => m.id === 'rm-101')?.status;
const restoreSaved = () => {
  localStorage.setItem(PHYSICAL_SESSION_KEY, encodePhysicalSession(capturePhysicalSession()));
  resetPlant();
  useUIStore.setState({ alerts: [] });
  dispose = installPhysicalSession();
  startup.ready = true;
  startup.listeners.forEach((f) => f());
};

beforeEach(() => {
  resetPlant();
  localStorage.clear();
  startup.ready = false;
  useUIStore.setState({ alerts: [] });
  removeOwners = REQUIRED_REPLAY_PARTICIPANTS.map((id) =>
    registerReplayParticipant(id, { capture: () => ({}), restore: () => {} })
  );
  runningMill();
  useOperationsCampaignStore.getState().initializeCampaign();
});
afterEach(() => {
  dispose?.();
  dispose = undefined;
  removeOwners.forEach((f) => f());
  endReplayClock();
  vi.restoreAllMocks();
  resetPlant();
});

describe('a saved stop, restart and drill record', () => {
  it('restores a stop saved in force; CLEAR leaves the mill idle and RESTART LINE runs it', () => {
    useGameSimulationStore.getState().triggerEmergency('E-STOP');
    restoreSaved();
    expect(useGameSimulationStore.getState().emergencyActive).toBe(true);
    expect(millStatus()).toBe('idle');
    useGameSimulationStore.getState().resolveEmergency();
    expect(millStatus()).toBe('idle');
    expect(selectRestartPending(useGameSimulationStore.getState())).toBe(true);
    useGameSimulationStore.getState().restartLine();
    expect(millStatus()).toBe('running');
  });

  it('restores a line saved waiting for its restart, with its notice', () => {
    useGameSimulationStore.getState().triggerEmergency('E-STOP');
    useGameSimulationStore.getState().resolveEmergency();
    restoreSaved();
    expect(selectRestartPending(useGameSimulationStore.getState())).toBe(true);
    expect(useUIStore.getState().alerts.some((a) => a.id === LINE_RESTART_ALERT_ID)).toBe(true);
    useGameSimulationStore.getState().restartLine();
    expect(millStatus()).toBe('running');
  });

  it('keeps a drill record through encode and decode', () => {
    const game = useGameSimulationStore.getState();
    game.startEmergencyDrill();
    game.markZoneVerified('west', {
      zoneId: 'west',
      result: 'alternative',
      alternative: 'east',
      blockedBy: ['FLT02'],
      clock: { day: 0, hour: 10.1 },
    });
    game.endEmergencyDrill();
    const saved = decodePhysicalSession(encodePhysicalSession(capturePhysicalSession()));
    const drill = saved.game.safetyEvents.find((event) => event.kind === 'fire_drill');
    expect(drill?.drillZones?.find((zone) => zone.zoneId === 'west')).toEqual({
      zoneId: 'west',
      result: 'alternative',
      alternative: 'east',
      blockedBy: ['FLT02'],
      clock: { day: 0, hour: 10.1 },
    });
    expect(drill?.drillStartClock).toEqual({ day: 0, hour: 10 });
  });
});
