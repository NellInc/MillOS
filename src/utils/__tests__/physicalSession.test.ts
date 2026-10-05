import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const startup = vi.hoisted(() => ({ ready: false, listeners: new Set<() => void>() }));
vi.mock('../startupReadiness', async (original) => ({
  ...(await original<typeof import('../startupReadiness')>()),
  getStartupSnapshot: () => ({ ready: startup.ready }),
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
  isPhysicalSessionRestoring,
  PHYSICAL_SESSION_KEY,
} from '../physicalSession';
import {
  registerReplayParticipant,
  REQUIRED_REPLAY_PARTICIPANTS,
  beginReplayClock,
  endReplayClock,
} from '../../simulation/workplaceReplayRuntime';
import { useMaterialFlowStore } from '../../stores/materialFlowStore';
import { useProductionStore } from '../../stores/productionStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { useBreakdownStore } from '../../stores/breakdownStore';
import { useQCLabStore } from '../../stores/qcLabStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useUIStore } from '../../stores/uiStore';
import { captureUnifiedTickState, resetUnifiedTickState } from '../../systems/UnifiedGameTick';
import { MachineType } from '../../types';
import {
  useLogisticsLayoutStore,
  defaultSavedLogisticsLayout,
} from '../../stores/logisticsLayoutStore';
import { currentLogisticsLayout } from '../../simulation/layoutPlanning';
import { registerLogisticsVehicle } from '../../simulation/logisticsRuntime';

let dispose: (() => void) | undefined;
let removeOwners: (() => void)[] = [];
let restored: unknown[];
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
const ready = () => {
  startup.ready = true;
  startup.listeners.forEach((f) => f());
};
const exit = () => window.dispatchEvent(new Event('pagehide'));
beforeEach(() => {
  resetPlant();
  localStorage.clear();
  startup.ready = false;
  restored = [];
  useUIStore.setState({ alerts: [] });
  removeOwners = REQUIRED_REPLAY_PARTICIPANTS.map((id) =>
    registerReplayParticipant(id, {
      capture: () => ({ phase: 'waiting', value: 17 }),
      restore: (value) => restored.push(value),
    })
  );
});
afterEach(() => {
  dispose?.();
  dispose = undefined;
  removeOwners.forEach((f) => f());
  endReplayClock();
  vi.restoreAllMocks();
  resetPlant();
});

function heldShift() {
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
  useQCLabStore.getState().triggerContaminationAlert({
    batchIds: [batch.id],
    severity: 'medium',
    controlSource: 'test controller',
  });
  useOperationsCampaignStore.getState().initializeCampaign();
  useGameSimulationStore.getState().setGameSpeed(0);
  return batch.id;
}

describe('atomic local physical shift continuation', () => {
  it('roundtrips actual stock, maps, dated quality holds and immutable actions', () => {
    const id = heldShift();
    const saved = decodePhysicalSession(encodePhysicalSession(capturePhysicalSession()));
    expect(saved.material.machineBuffers).toBeInstanceOf(Map);
    expect(saved.material.network.downstreamMap).toBeInstanceOf(Map);
    expect(saved.material.productionBatches.find((b) => b.id === id)?.disposition).toBe('hold');
    expect(saved.quality.qcLab.contaminationAlerts[0].timestamp).toBeInstanceOf(Date);
    expect(saved.material).not.toHaveProperty('shipFinishedGoods');
    expect(saved.production).not.toHaveProperty('updateMachineStatus');
    expect(saved).not.toHaveProperty('workplace');
  });

  it('restores holds, parts, repairs and session credit before ticking, then restores real owner continuations after mount', () => {
    const id = heldShift();
    const fault = useBreakdownStore
      .getState()
      .triggerBreakdown('rm-101', 'R.M. 101', 'mechanical')!;
    useBreakdownStore.getState().startRepair(fault.id);
    useProductionStore.getState().updateMachineStatus('rm-101', 'critical');
    const saved = capturePhysicalSession();
    saved.tick.wearCarry.set('rm-101', 0.003);
    const bytes = encodePhysicalSession(saved);
    localStorage.setItem(PHYSICAL_SESSION_KEY, bytes);
    resetPlant();
    dispose = installPhysicalSession();
    expect(isPhysicalSessionRestoring()).toBe(true);
    expect(useMaterialFlowStore.getState().sessionId).toBe(saved.material.sessionId);
    expect(
      useMaterialFlowStore.getState().productionBatches.find((b) => b.id === id)?.disposition
    ).toBe('hold');
    expect(useQCLabStore.getState().qcLab.contaminationAlerts).toEqual(
      saved.quality.qcLab.contaminationAlerts
    );
    expect(useBreakdownStore.getState().partsInventory).toEqual(saved.maintenance.partsInventory);
    expect(useBreakdownStore.getState().workOrders[0].phase).toBe('repairing');
    expect(useProductionStore.getState().machines.find((m) => m.id === 'rm-101')?.status).toBe(
      'critical'
    );
    expect(useMaterialFlowStore.getState().getMaterialBalance().errorKg).toBeCloseTo(0, 5);
    expect(useOperationsCampaignStore.getState().processedManifestIds).toEqual(
      saved.operations.processedManifestIds
    );
    expect(restored).toEqual([]);
    // React's existing unified-tick mount resets carry. Readiness restores it afterward.
    resetUnifiedTickState();
    ready();
    expect(isPhysicalSessionRestoring()).toBe(false);
    expect(captureUnifiedTickState().wearCarry.get('rm-101')).toBe(0.003);
    expect(restored).toHaveLength(REQUIRED_REPLAY_PARTICIPANTS.length);
    expect(useGameSimulationStore.getState().gameSpeed).toBe(0);
    expect(useProductionStore.getState().scadaLive).toBe(false);
  });

  it('flushes the latest held batch on page exit without waiting for autosave', () => {
    dispose = installPhysicalSession();
    ready();
    const id = heldShift();
    exit();
    const saved = decodePhysicalSession(localStorage.getItem(PHYSICAL_SESSION_KEY)!);
    expect(saved.material.productionBatches.find((b) => b.id === id)?.disposition).toBe('hold');
    expect(saved.quality.qcLab.contaminationAlerts[0].resolved).toBe(false);
  });

  it('holds a running shift through scene mount and restores its setpoint after mount defaults', () => {
    heldShift();
    useGameSimulationStore.getState().setGameSpeed(30);
    useProductionStore.getState().setProductionSpeed(0.6);
    localStorage.setItem(PHYSICAL_SESSION_KEY, encodePhysicalSession(capturePhysicalSession()));
    resetPlant();
    dispose = installPhysicalSession();
    expect(useGameSimulationStore.getState().gameSpeed).toBe(0);
    // App initializes its local production-speed default during mount.
    useProductionStore.getState().setProductionSpeed(0.8);
    ready();
    expect(useGameSimulationStore.getState().gameSpeed).toBe(30);
    expect(useProductionStore.getState().productionSpeed).toBe(0.6);
  });

  it('rejects incomplete, unbalanced, unbound and executable fields before restoring anything', () => {
    heldShift();
    const good = capturePhysicalSession();
    const badVersion = structuredClone(good);
    (badVersion as { version: number }).version = 99;
    const badMass = structuredClone(good);
    badMass.material.shippedKg += 1;
    const badHold = structuredClone(good);
    badHold.quality.qcLab.contaminationAlerts[0].batchIds = ['absent'];
    const missingOwners = structuredClone(good);
    missingOwners.participants = [];
    const action = JSON.parse(encodePhysicalSession(good));
    action.material.shipFinishedGoods = 'injected';
    const negativeLedger = structuredClone(good);
    negativeLedger.material.wasteKg = -1;
    negativeLedger.material.byproductKg += good.material.wasteKg + 1;
    const badMachine = JSON.parse(encodePhysicalSession(good));
    badMachine.production.machines = [null];
    const badOrder = JSON.parse(encodePhysicalSession(good));
    badOrder.operations.orders = [null];
    const badParts = structuredClone(good);
    badParts.maintenance.partsInventory.bearings = -1;
    for (const raw of [
      encodePhysicalSession(badVersion),
      encodePhysicalSession(badMass),
      encodePhysicalSession(badHold),
      encodePhysicalSession(missingOwners),
      JSON.stringify(action),
      encodePhysicalSession(negativeLedger),
      JSON.stringify(badMachine),
      JSON.stringify(badOrder),
      encodePhysicalSession(badParts),
    ]) {
      expect(() => decodePhysicalSession(raw)).toThrow();
      expect(useMaterialFlowStore.getState().sessionId).toBe(good.material.sessionId);
    }
    const invalid = '{"version":1}';
    localStorage.setItem(PHYSICAL_SESSION_KEY, invalid);
    dispose = installPhysicalSession();
    ready();
    exit();
    expect(localStorage.getItem(PHYSICAL_SESSION_KEY)).toBe(invalid);
    expect(useUIStore.getState().alerts.at(-1)?.title).toBe('Shift save needs attention');
    expect(useGameSimulationStore.getState().gameSpeed).toBe(0);
  });

  it('makes storage failure visible and retains the previous complete record', () => {
    heldShift();
    const previous = encodePhysicalSession(capturePhysicalSession());
    localStorage.setItem(PHYSICAL_SESSION_KEY, previous);
    // Spy on the injected storage used by this save, not a host Storage prototype.
    // Node 26's browser storage can expose methods from a different prototype.
    const storage = {
      getItem: (key: string) => localStorage.getItem(key),
      setItem: vi.fn((key: string, value: string) => localStorage.setItem(key, value)),
    };
    dispose = installPhysicalSession(storage);
    ready();
    storage.setItem.mockImplementation(() => {
      throw new DOMException('Full', 'QuotaExceededError');
    });
    exit();
    expect(storage.setItem).toHaveBeenCalledWith(PHYSICAL_SESSION_KEY, expect.any(String));
    expect(localStorage.getItem(PHYSICAL_SESSION_KEY)).toBe(previous);
    expect(useUIStore.getState().alerts.at(-1)?.message).toContain('could not be saved');
    expect(useGameSimulationStore.getState().gameSpeed).toBe(0);
  });

  it('preserves a record created by another tab before this tab writes its first save', () => {
    dispose = installPhysicalSession();
    ready();
    const elsewhere = encodePhysicalSession(capturePhysicalSession());
    localStorage.setItem(PHYSICAL_SESSION_KEY, elsewhere);
    useGameSimulationStore.getState().setGameSpeed(30);
    exit();
    expect(localStorage.getItem(PHYSICAL_SESSION_KEY)).toBe(elsewhere);
    expect(useGameSimulationStore.getState().gameSpeed).toBe(0);
    expect(useUIStore.getState().alerts.at(-1)?.message).toContain('outside this tab');
  });

  it('does not resurrect a deliberate Reset Simulation or persist experimental replay state', () => {
    dispose = installPhysicalSession();
    ready();
    exit();
    expect(localStorage.getItem(PHYSICAL_SESSION_KEY)).not.toBeNull();
    localStorage.clear();
    exit();
    expect(localStorage.getItem(PHYSICAL_SESSION_KEY)).toBeNull();
    dispose();
    dispose = installPhysicalSession();
    beginReplayClock(123, 1000);
    exit();
    expect(localStorage.getItem(PHYSICAL_SESSION_KEY)).toBeNull();
  });

  it('handles blocked browser storage without throwing through application bootstrap', () => {
    const blocked = {
      getItem: () => {
        throw new Error('Blocked');
      },
      setItem: () => {
        throw new Error('Blocked');
      },
    };
    expect(() => {
      dispose = installPhysicalSession(blocked);
    }).not.toThrow();
    expect(useUIStore.getState().alerts.at(-1)?.title).toBe('Shift save needs attention');
  });
});

it('migrates old shift records and restores layout before owner motion, with comparisons invalidated', () => {
  heldShift();
  const old = capturePhysicalSession();
  delete (old as Partial<typeof old>).logistics;
  expect(decodePhysicalSession(encodePhysicalSession(old)).logistics).toEqual(
    defaultSavedLogisticsLayout()
  );
  const layout = currentLogisticsLayout();
  layout.staging.shipping[0] = 18;
  useLogisticsLayoutStore
    .getState()
    .restoreSaved({ layout, previous: currentLogisticsLayout(), revision: 3 });
  const saved = capturePhysicalSession();
  localStorage.setItem(PHYSICAL_SESSION_KEY, encodePhysicalSession(saved));
  resetPlant();
  let installed: unknown;
  removeOwners.push(
    registerLogisticsVehicle('shipping', {
      prepare: () => () => {},
      restore: (points) => {
        installed = points;
      },
    })
  );
  removeOwners.push(
    registerReplayParticipant(REQUIRED_REPLAY_PARTICIPANTS[0], {
      capture: () => ({}),
      restore: () => {
        expect(installed).toEqual(layout.routes.shipping);
        expect(useLogisticsLayoutStore.getState().layout).toEqual(layout);
      },
    })
  );
  dispose = installPhysicalSession();
  ready();
  expect(isPhysicalSessionRestoring()).toBe(false);
  expect(useLogisticsLayoutStore.getState().revision).toBe(3);
  expect(useLogisticsLayoutStore.getState().observation.activeSeconds).toBe(0);
  saved.logistics.layout.staging.shipping = [0, 0, 73];
  expect(() => decodePhysicalSession(encodePhysicalSession(saved))).toThrow('invalid clearance');
});
