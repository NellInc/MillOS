import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const startup = vi.hoisted(() => ({
  ready: false,
  opened: false,
  listeners: new Set<() => void>(),
}));
vi.mock('../startupReadiness', async (original) => ({
  ...(await original<typeof import('../startupReadiness')>()),
  getStartupSnapshot: () => ({ ready: startup.ready, opened: startup.opened }),
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
  MAX_SAVE_BYTES,
} from '../physicalSession';
import {
  registerReplayParticipant,
  REQUIRED_REPLAY_PARTICIPANTS,
  beginReplayClock,
  endReplayClock,
  notifyReplayRecordChanged,
} from '../../simulation/workplaceReplayRuntime';
import {
  MAX_MATERIAL_MANIFESTS,
  MAX_PRODUCTION_BATCHES,
  MAX_SOURCE_LOTS,
  useMaterialFlowStore,
} from '../../stores/materialFlowStore';
import { useProductionStore, PRODUCTION_DELEGATED_KEYS } from '../../stores/productionStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { useBreakdownStore } from '../../stores/breakdownStore';
import { useQCLabStore } from '../../stores/qcLabStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useSafetyStore } from '../../stores/safetyStore';
import { useUIStore } from '../../stores/uiStore';
import { captureUnifiedTickState, resetUnifiedTickState } from '../../systems/UnifiedGameTick';
import { MachineType } from '../../types';
import {
  useLogisticsLayoutStore,
  defaultSavedLogisticsLayout,
} from '../../stores/logisticsLayoutStore';
import {
  currentLogisticsLayout,
  planningObstacles,
  type LayoutSnapshot,
} from '../../simulation/layoutPlanning';
import { layoutPlanDxf } from '../../simulation/layoutPlanningExport';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import { createMachineObstacles } from '../../constants/factoryObstacles';
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
  startup.opened = false;
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

// A save written before a store gained a field lacked that key, and decode
// rejected it as an incomplete domain: the player's shift was lost on reload.
// Working if a save from before each added field still restores, and a newly
// added saved field fails this pin until it is given a fallback.
describe('saves written before a saved field was added', () => {
  it('restores a save that predates stopHeldForklifts and sessionIncidentCount', () => {
    useSafetyStore.getState().addSafetyIncident({ type: 'emergency', description: 'Stop' });
    const record = capturePhysicalSession();
    const older = JSON.parse(encodePhysicalSession(record)) as {
      game: Record<string, unknown>;
      safety: Record<string, unknown>;
    };
    delete older.game.stopHeldForklifts;
    delete older.safety.sessionIncidentCount;
    const saved = decodePhysicalSession(JSON.stringify(older));
    expect(saved.game.stopHeldForklifts).toBe(false);
    expect(saved.safety.sessionIncidentCount).toBe(saved.safety.safetyIncidents.length);
  });

  // Nell's console, 2026-11-07: "restore failed: Incomplete physical domain
  // operations.costRates", a save from before 18 October.
  it('restores a save that predates costRates, programmeCount and timeOfDayHeld', () => {
    const older = JSON.parse(encodePhysicalSession(capturePhysicalSession())) as {
      game: Record<string, unknown>;
      operations: Record<string, unknown>;
    };
    delete older.operations.costRates;
    delete older.operations.programmeCount;
    delete older.game.timeOfDayHeld;
    const saved = decodePhysicalSession(JSON.stringify(older));
    expect(saved.operations.costRates).toEqual({ maintenance: 0, demurrage: 0, late: 0 });
    expect(saved.operations.programmeCount).toBe(0);
    expect(saved.game.timeOfDayHeld).toBe(false);
  });

  // Nell's console, 2026-11-08: "restore failed: Incomplete physical domain
  // game.clockHolds", a save from before 18 October; past that field, the same
  // save carried maintenance.lastBreakdownTime, deleted on 19 October. Saves
  // written by every daily deployed build from 4 October on were decoded against
  // this code when it was fixed; each record from before 19 October has this shape.
  it('restores a save that predates clockHolds and still carries lastBreakdownTime', () => {
    const record = capturePhysicalSession();
    const older = JSON.parse(encodePhysicalSession(record)) as {
      game: Record<string, unknown>;
      maintenance: Record<string, unknown>;
    };
    delete older.game.clockHolds;
    older.maintenance.lastBreakdownTime = 0;
    const raw = JSON.stringify(older);
    const saved = decodePhysicalSession(raw);
    expect(saved.game.clockHolds).toEqual([]);
    expect('lastBreakdownTime' in saved.maintenance).toBe(false);
    localStorage.setItem(PHYSICAL_SESSION_KEY, raw);
    resetPlant();
    dispose = installPhysicalSession();
    expect(isPhysicalSessionRestoring()).toBe(true);
    expect(useGameSimulationStore.getState().clockHolds.map((hold) => hold.holder)).not.toContain(
      'restoreFailed'
    );
    expect(useUIStore.getState().alerts.map((alert) => alert.id)).not.toContain(
      'physical-save-unavailable'
    );
    expect(useMaterialFlowStore.getState().sessionId).toBe(record.material.sessionId);
  });

  it('pins the saved field set (add a fallback for any field added here)', () => {
    const capture = capturePhysicalSession() as unknown as Record<string, object>;
    const keys = Object.fromEntries(
      Object.keys(PINNED_SAVED_FIELDS).map((domain) => [
        domain,
        Object.keys(capture[domain]).sort(),
      ])
    );
    expect(keys).toEqual(PINNED_SAVED_FIELDS);
  });
});

const PINNED_SAVED_FIELDS: Record<string, string[]> = {
  production: [
    '_indices',
    '_metricTracking',
    'aiDecisions',
    'dailyBagsProduced',
    'dockStatus',
    'heatMapData',
    'machines',
    'metrics',
    'productionSpeed',
    'productionTarget',
    'scadaLive',
    'selectedMachine',
    'showHeatMap',
    'totalBagsProduced',
  ],
  material: [
    'batchSequence',
    'byproductKg',
    'byproductSourceContributions',
    'currentFlowRate',
    'currentPackerFlowRate',
    'initialInventoryKg',
    'lotSequence',
    'machineBuffers',
    'manifestSequence',
    'manifests',
    'network',
    'processGenealogy',
    'processSequence',
    'productionBatches',
    'receivedKg',
    'sessionId',
    'shippedKg',
    'shippedSourceContributions',
    'simulationTime',
    'sourceLots',
    'totalFlourProduced',
    'totalMaterialProcessed',
    'wasteKg',
    'wasteSourceContributions',
  ],
  operations: [
    'activeChallenge',
    'activeOrderId',
    'challengeHistory',
    'constraints',
    'costRates',
    'creditedBatchKg',
    'currentShiftKey',
    'currentShiftLabel',
    'economics',
    'elapsedMinutes',
    'execution',
    'incidents',
    'initialized',
    'lastMaterialSessionId',
    'lastWasteKg',
    'logbook',
    'orders',
    'processedManifestIds',
    'programmeCount',
    'reports',
    'sequence',
    'shiftMetrics',
    'shiftStartedAtMinute',
    'utilityAssets',
  ],
  game: [
    'activeSafetyEventId',
    'celebrations',
    'clockHolds',
    'crisisState',
    'currentShift',
    'drillMetrics',
    'emergencyActive',
    'emergencyDrillMode',
    'emergencyMachineId',
    'gameDay',
    'gameSpeed',
    'gameTime',
    'isTabVisible',
    'preEmergencyMachineStatuses',
    'safetyEvents',
    'shiftChangeActive',
    'shiftStartTime',
    'stopHeldForklifts',
    'timeOfDayHeld',
    'weather',
  ],
  maintenance: [
    'activeBreakdowns',
    'breakdownHistory',
    'idSequence',
    'maintenanceSchedule',
    'partsInventory',
    'predictiveAlerts',
    'workOrders',
  ],
  trucks: ['truckSchedule'],
  quality: ['qcLab'],
  safety: [
    '_incidentIndices',
    'forkliftEmergencyStop',
    'forkliftMetrics',
    'forkliftUpdateTimes',
    'incidentHeatMap',
    'safetyConfig',
    'safetyIncidents',
    'safetyMetrics',
    'sessionIncidentCount',
    'showIncidentHeatMap',
    'speedZones',
  ],
  achievements: ['achievements'],
  tick: [
    'bagCarry',
    'departureCount',
    'milestones',
    'receivingReady',
    'shippingDelay',
    'shippingLoad',
    'wearCarry',
  ],
  clock: ['tickCount', 'tickInterval'],
};

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
    // A paused save resumes ticking once restored (D-049): the pace under the pause.
    expect(useGameSimulationStore.getState().gameSpeed).toBeGreaterThan(0);
    expect(useProductionStore.getState().scadaLive).toBe(false);
  });

  // The bell was emptied by a reload while the breakdown it reported came back,
  // so the repair shortcut was gone and the critical-alert quiet hold lifted
  // with the machine still down. Working if the restored plant keeps its notices.
  it('restores the notices that describe the restored faults', () => {
    heldShift();
    useUIStore.getState().addAlert({
      id: 'breakdown-rm-101',
      type: 'critical',
      title: 'R.M. 101 broke down',
      message: 'Bearing failure',
      timestamp: new Date(),
      acknowledged: false,
    });
    localStorage.setItem(PHYSICAL_SESSION_KEY, encodePhysicalSession(capturePhysicalSession()));
    resetPlant();
    useUIStore.setState({ alerts: [] });
    dispose = installPhysicalSession();
    expect(useUIStore.getState().alerts.map((alert) => alert.id)).toContain('breakdown-rm-101');
    expect(useUIStore.getState().alerts[0]?.timestamp).toBeInstanceOf(Date);
  });

  it('restores once and saves actual holds after explicit slow-device access', () => {
    const id = heldShift();
    const saved = capturePhysicalSession();
    saved.tick.wearCarry.set('rm-101', 0.003);
    localStorage.setItem(PHYSICAL_SESSION_KEY, encodePhysicalSession(saved));
    resetPlant();
    dispose = installPhysicalSession();
    expect(isPhysicalSessionRestoring()).toBe(true);
    startup.opened = true;
    startup.listeners.forEach((f) => f());
    expect(startup.ready).toBe(false);
    expect(isPhysicalSessionRestoring()).toBe(false);
    expect(captureUnifiedTickState().wearCarry.get('rm-101')).toBe(0.003);
    expect(restored).toHaveLength(REQUIRED_REPLAY_PARTICIPANTS.length);
    ready();
    expect(restored).toHaveLength(REQUIRED_REPLAY_PARTICIPANTS.length);
    exit();
    const resumed = decodePhysicalSession(localStorage.getItem(PHYSICAL_SESSION_KEY)!);
    expect(resumed.material.productionBatches.find((b) => b.id === id)?.disposition).toBe('hold');
  });

  // The persist merge swaps an untouched old default speed-zone set for today's
  // defaults, but the physical restore then set the saved old six straight
  // back, so a returning player's Speed Zone Rate slider still did nothing.
  // Working if the restore adopts the zones the same way, and keeps an edited set.
  it('restores an untouched old speed-zone set as today’s defaults', () => {
    heldShift();
    const legacy = [
      ['zone-1', 0, 0, 5],
      ['zone-2', 0, 28, 4],
      ['zone-3', 0, -28, 4],
      ['zone-4', -28, 0, 3],
      ['zone-5', 28, 0, 3],
      ['zone-6', 0, 18, 4],
    ].map(([id, x, z, radius]) => ({ id, x, z, radius, name: `Old ${id}` })) as ReturnType<
      typeof useSafetyStore.getState
    >['speedZones'];
    const saved = capturePhysicalSession();
    saved.safety.speedZones = legacy;
    localStorage.setItem(PHYSICAL_SESSION_KEY, encodePhysicalSession(saved));
    resetPlant();
    dispose = installPhysicalSession();
    const ids = useSafetyStore.getState().speedZones.map((zone) => zone.id);
    expect(ids).not.toContain('zone-1');
    expect(ids.length).toBeGreaterThan(0);
    dispose();

    const edited = legacy.map((zone, index) => (index === 0 ? { ...zone, radius: 9 } : zone));
    saved.safety.speedZones = edited;
    localStorage.setItem(PHYSICAL_SESSION_KEY, encodePhysicalSession(saved));
    resetPlant();
    dispose = installPhysicalSession();
    expect(useSafetyStore.getState().speedZones.map((zone) => zone.id)).toContain('zone-1');
  });

  // A save from before part reservations can hold two diagnosed orders on one
  // part. The tick corrects that, but a session restores paused, so the newer
  // card read 'diagnosed' beside 'Awaiting stock' until the clock ran.
  // Working if the restore itself leaves only the covered order diagnosed.
  it('normalises two diagnosed orders on one part as the session restores', () => {
    heldShift();
    const [mill] = useProductionStore.getState().machines;
    useProductionStore
      .getState()
      .setMachines([
        ...useProductionStore.getState().machines,
        { ...mill, id: 'rm-102', name: 'R.M. 102' },
      ]);
    useBreakdownStore.setState((state) => ({
      partsInventory: { bearings: 9, belts: 9, filters: 9, motors: 9, sensors: 9 },
      workOrders: state.workOrders,
    }));
    useBreakdownStore.getState().triggerBreakdown('rm-101', 'R.M. 101', 'mechanical');
    useBreakdownStore.getState().triggerBreakdown('rm-102', 'R.M. 102', 'mechanical');
    const [first, second] = useBreakdownStore.getState().workOrders;
    expect([first?.phase, second?.phase]).toEqual(['diagnosed', 'diagnosed']);
    const saved = capturePhysicalSession();
    // Stock for exactly one of the two orders, as an older save could hold.
    const stock = { bearings: 0, belts: 0, filters: 0, motors: 0, sensors: 0 };
    for (const part of first.requiredParts) stock[part] += 1;
    saved.maintenance.partsInventory = stock;
    localStorage.setItem(PHYSICAL_SESSION_KEY, encodePhysicalSession(saved));
    resetPlant();
    dispose = installPhysicalSession();
    const phases = useBreakdownStore.getState().workOrders.map((w) => [w.id, w.phase]);
    expect(phases).toEqual([
      [first.id, 'diagnosed'],
      [second.id, 'awaiting_parts'],
    ]);
  });

  // The Mill Chronicle credits a shift close at once, but the plant record
  // waited for its 5 s autosave: a crash in between restored a campaign from
  // before a close the chronicle had already counted. A retained or forgotten
  // replay review writes the workplace at once too. Working if each writes the
  // plant record in the same microtask.
  it('saves the plant record at once when a shift closes or a replay review is kept', async () => {
    dispose = installPhysicalSession();
    ready();
    heldShift();
    useGameSimulationStore.getState().setGameSpeed(30);
    await Promise.resolve();
    // (Removing the key would read as Reset Simulation, which stops writes.)
    const stored = () => decodePhysicalSession(localStorage.getItem(PHYSICAL_SESSION_KEY)!);
    useOperationsCampaignStore.setState((state) => ({
      reports: [...state.reports, { ...(state.reports[0] ?? {}), id: 'report-close' } as never],
    }));
    await Promise.resolve();
    expect(stored().operations.reports.map((report) => report.id)).toContain('report-close');
    useGameSimulationStore.setState({ gameTime: 13.25 });
    notifyReplayRecordChanged();
    await Promise.resolve();
    expect(stored().game.gameTime).toBe(13.25);
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
    expect(useUIStore.getState().alerts.at(-1)?.message).toContain(
      'Settings > Simulation > Reset Simulation starts a fresh shift.'
    );
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
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const speed = useGameSimulationStore.getState().gameSpeed;
    try {
      exit();
      exit();
      expect(storage.setItem).toHaveBeenCalledWith(PHYSICAL_SESSION_KEY, expect.any(String));
      expect(localStorage.getItem(PHYSICAL_SESSION_KEY)).toBe(previous);
      // A failed write is announced once, names storage only for a quota error,
      // and never pauses the shift or turns autosave off.
      const notices = useUIStore
        .getState()
        .alerts.filter((a) => a.id === 'physical-autosave-skipped');
      expect(notices).toHaveLength(1);
      expect(notices[0]?.message).toContain('browser storage is full');
      expect(notices[0]?.message).toContain('last good save is kept');
      expect(useGameSimulationStore.getState().gameSpeed).toBe(speed);
      expect(storage.setItem).toHaveBeenCalledTimes(2);
      expect(String(logged.mock.calls[0]?.[1])).toContain('Full');
    } finally {
      logged.mockRestore();
    }
  });

  // The bell is restored with the plant, so a notice worded once kept its
  // filing language through a switch and a reload. Working if the autosave
  // notice carries keys and reads in Portuguese after a switch.
  it('files the autosave notice with keys, so it follows the language', async () => {
    const { alertText } = await import('../../i18n/alertCopy');
    const { setLocale } = await import('../../i18n');
    heldShift();
    localStorage.setItem(PHYSICAL_SESSION_KEY, encodePhysicalSession(capturePhysicalSession()));
    const storage = {
      getItem: (key: string) => localStorage.getItem(key),
      setItem: vi.fn((key: string, value: string) => localStorage.setItem(key, value)),
    };
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    try {
      dispose = installPhysicalSession(storage);
      ready();
      storage.setItem.mockImplementationOnce(() => {
        throw new Error('Non-finite saved value at x');
      });
      useGameSimulationStore.getState().setGameSpeed(30);
      vi.advanceTimersByTime(5000);
      const notice = useUIStore
        .getState()
        .alerts.find((a) => a.id === 'physical-autosave-skipped')!;
      expect(notice.title).toContain('Autosave');
      setLocale('pt-BR');
      expect(alertText(notice).title).not.toBe(notice.title);
    } finally {
      setLocale('en');
      vi.useRealTimers();
      logged.mockRestore();
    }
  });

  it('retries a failed autosave on the next interval without pausing the shift', () => {
    heldShift();
    const previous = encodePhysicalSession(capturePhysicalSession());
    localStorage.setItem(PHYSICAL_SESSION_KEY, previous);
    const storage = {
      getItem: (key: string) => localStorage.getItem(key),
      setItem: vi.fn((key: string, value: string) => localStorage.setItem(key, value)),
    };
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    try {
      dispose = installPhysicalSession(storage);
      ready();
      storage.setItem.mockImplementationOnce(() => {
        throw new Error('Non-finite saved value at x');
      });
      useGameSimulationStore.getState().setGameSpeed(30);
      vi.advanceTimersByTime(5000);
      expect(storage.setItem).toHaveBeenCalledTimes(1);
      expect(localStorage.getItem(PHYSICAL_SESSION_KEY)).toBe(previous);
      const notices = () =>
        useUIStore.getState().alerts.filter((a) => a.id === 'physical-autosave-skipped');
      expect(notices()).toHaveLength(1);
      expect(notices()[0]?.message).toContain('Autosave skipped');
      expect(notices()[0]?.message).not.toContain('storage');
      expect(String(logged.mock.calls[0]?.[1])).toContain('Non-finite saved value at x');
      vi.advanceTimersByTime(5000);
      expect(storage.setItem).toHaveBeenCalledTimes(2);
      expect(localStorage.getItem(PHYSICAL_SESSION_KEY)).not.toBe(previous);
      expect(useGameSimulationStore.getState().gameSpeed).toBe(30);
      expect(notices()).toHaveLength(1);
      // A later failure after a good write is announced again: re-raised,
      // unread and on top (one row per id since the bell dedupes by id).
      useUIStore.getState().acknowledgeAlert('physical-autosave-skipped');
      storage.setItem.mockImplementationOnce(() => {
        throw new Error('again');
      });
      useGameSimulationStore.getState().setGameSpeed(60);
      vi.advanceTimersByTime(5000);
      expect(notices()).toHaveLength(1);
      expect(notices()[0]?.acknowledged).toBe(false);
      expect(useUIStore.getState().alerts[0]?.id).toBe('physical-autosave-skipped');
      expect(useGameSimulationStore.getState().gameSpeed).toBe(60);
    } finally {
      vi.useRealTimers();
      logged.mockRestore();
    }
  });

  // A record written before the windows narrowed (up to the 1.5 M-char gate)
  // must load, and must not carry its fat tails into the first autosave, which
  // runs while the reload waits for consent and no tick trims anything.
  it('loads a legacy record with long histories, trimmed to the current windows', () => {
    const heldId = heldShift();
    const record = capturePhysicalSession();
    const held = record.material.productionBatches.find((b) => b.id === heldId)!;
    record.material.processGenealogy = Array.from({ length: 500 }, (_, i) => ({
      id: `process-${i}`,
      machineId: 'rm-101',
      inputType: 'wheat_grain' as const,
      inputKg: 1,
      outputs: [],
      wasteKg: 0,
      sourceContributions: [{ lotId: 'lot-opening-silo-0', amount: 1, path: ['silo-0'] }],
      simulationTime: i,
    }));
    record.material.productionBatches = [
      ...Array.from({ length: 200 }, (_, i) => ({
        ...held,
        id: `shipped-${i}`,
        availableKg: 0,
        disposition: 'shipped' as const,
      })),
      ...record.material.productionBatches,
    ];
    record.material.manifests = Array.from({ length: 200 }, (_, i) => ({
      id: `receiving-${i}`,
      kind: 'receiving' as const,
      dock: 'receiving' as const,
      requestedKg: 1,
      actualKg: 1,
      materials: [],
      sourceLots: [],
      productBatches: [],
      simulationTime: i,
    }));
    const saved = decodePhysicalSession(encodePhysicalSession(record));
    expect(saved.material.processGenealogy).toEqual([]);
    expect(saved.material.manifests.map((m) => m.id)).toEqual(
      record.material.manifests.slice(-MAX_MATERIAL_MANIFESTS).map((m) => m.id)
    );
    const shipped = saved.material.productionBatches.filter((b) => b.disposition === 'shipped');
    expect(shipped.map((b) => b.id)).toEqual(
      Array.from(
        { length: MAX_PRODUCTION_BATCHES },
        (_, i) => `shipped-${200 - MAX_PRODUCTION_BATCHES + i}`
      )
    );
    // The held batch the quality alert binds is never history.
    expect(saved.material.productionBatches.find((b) => b.id === heldId)?.disposition).toBe('hold');
  });

  // The lot window evicted oldest-first whatever a lot's state, so a held lot
  // bound to an open alert could vanish, and the decode then rejected the whole
  // record as 'Unbound source hold'. Working if filling past the window keeps
  // the held lot, the record restores, and the hold is still bound.
  it('never evicts a held lot from the lot window, so the record restores', () => {
    const lots = () => useMaterialFlowStore.getState().sourceLots;
    const heldLot = lots().keys().next().value as string;
    useQCLabStore.getState().triggerContaminationAlert({
      sourceLotIds: [heldLot],
      severity: 'medium',
      controlSource: 'test controller',
    });
    expect(lots().get(heldLot)?.disposition).toBe('hold');
    for (let i = 0; i <= MAX_SOURCE_LOTS; i++)
      expect(useMaterialFlowStore.getState().receiveGrainDelivery(1)).toBe(1);
    expect(lots().size).toBeLessThanOrEqual(MAX_SOURCE_LOTS + 1);
    expect(lots().get(heldLot)?.disposition).toBe('hold');
    const saved = decodePhysicalSession(encodePhysicalSession(capturePhysicalSession()));
    expect(saved.material.sourceLots.get(heldLot)?.disposition).toBe('hold');
    expect(saved.quality.qcLab.contaminationAlerts.find((a) => !a.resolved)?.sourceLotIds).toEqual([
      heldLot,
    ]);
  });

  // The play-test console logged 'Physical save is too large' every 5 s with a
  // notice that read like a one-off skip. Working if an oversized record raises
  // one notice and one log per failure run, saying a reload returns to the last
  // good save, and the shift keeps running.
  it('names an oversized record once per failure run, without pausing the shift', () => {
    heldShift();
    const previous = encodePhysicalSession(capturePhysicalSession());
    localStorage.setItem(PHYSICAL_SESSION_KEY, previous);
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    try {
      dispose = installPhysicalSession();
      ready();
      useGameSimulationStore.getState().setGameSpeed(30);
      const [machine] = useProductionStore.getState().machines;
      useProductionStore.setState({
        machines: [{ ...machine, name: 'x'.repeat(MAX_SAVE_BYTES / 2) }],
      });
      vi.advanceTimersByTime(5000);
      vi.advanceTimersByTime(5000);
      exit();
      expect(localStorage.getItem(PHYSICAL_SESSION_KEY)).toBe(previous);
      const notices = useUIStore
        .getState()
        .alerts.filter((a) => a.id === 'physical-autosave-skipped');
      expect(notices).toHaveLength(1);
      expect(notices[0]?.title).toBe('Autosave stopped');
      expect(notices[0]?.message).toContain('a reload returns to the last good save');
      expect(logged).toHaveBeenCalledTimes(1);
      expect(String(logged.mock.calls[0]?.[1])).toContain('Physical save is too large');
      expect(useGameSimulationStore.getState().gameSpeed).toBe(30);
    } finally {
      vi.useRealTimers();
      logged.mockRestore();
    }
  });

  it('preserves a record created by another tab before this tab writes its first save', () => {
    dispose = installPhysicalSession();
    ready();
    const elsewhere = encodePhysicalSession(capturePhysicalSession());
    localStorage.setItem(PHYSICAL_SESSION_KEY, elsewhere);
    useGameSimulationStore.getState().setGameSpeed(30);
    exit();
    expect(localStorage.getItem(PHYSICAL_SESSION_KEY)).toBe(elsewhere);
    // This tab stops saving but keeps running; the other tab owns the record.
    expect(useGameSimulationStore.getState().gameSpeed).toBe(30);
    expect(useUIStore.getState().alerts.at(-1)?.message).toContain('outside this tab');
    expect(useUIStore.getState().alerts.at(-1)?.message).not.toContain('paused');
    useGameSimulationStore.getState().setGameSpeed(60);
    exit();
    expect(localStorage.getItem(PHYSICAL_SESSION_KEY)).toBe(elsewhere);
    expect(useUIStore.getState().alerts).toHaveLength(1);
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

it('migrates old shift records and restores layout before owner motion, with the comparison carried', () => {
  heldShift();
  const old = capturePhysicalSession();
  delete (old as Partial<typeof old>).logistics;
  expect(decodePhysicalSession(encodePhysicalSession(old)).logistics).toEqual(
    defaultSavedLogisticsLayout()
  );
  const layout = currentLogisticsLayout();
  // A fresh copy from currentLogisticsLayout(); the tuple type is read-only.
  (layout.staging.shipping as unknown as number[])[0] = 18;
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

it('migrates a save holding an earlier default shipping route', () => {
  heldShift();
  // The default shipping route until 2026-10-20: [25, 42] -> [22.5, 43] was a
  // 158-degree reversal. Its fixed poses no longer match the default, which
  // the clearance check would refuse, halting the restore.
  const legacy: [number, number, number][] = [
    [-16, 0, 42],
    [12, 0, 42],
    [25, 0, 42],
    [22.5, 0, 43],
    [22.5, 0, 48],
    [26, 0, 48],
    [26, 0, 42],
    [-16, 0, 42],
  ];
  const saved = capturePhysicalSession();
  saved.logistics.layout.routes.shipping = legacy.map((point) => [...point]);
  saved.logistics.previous = structuredClone(saved.logistics.layout);
  const restored = decodePhysicalSession(encodePhysicalSession(saved)).logistics;
  expect(restored.layout.routes.shipping).toEqual(currentLogisticsLayout().routes.shipping);
  expect(restored.previous?.routes.shipping).toEqual(currentLogisticsLayout().routes.shipping);
  expect(restored.layout.routes.receiving).toEqual(saved.logistics.layout.routes.receiving);

  // A corner the player moved on the old east-end approach is not carried
  // across the hall to the new dock-door route: it returns to the default.
  saved.logistics.layout.routes.shipping[2] = [16, 0, 41.5];
  saved.logistics.previous = null;
  expect(
    decodePhysicalSession(encodePhysicalSession(saved)).logistics.layout.routes.shipping
  ).toEqual(currentLogisticsLayout().routes.shipping);

  // The squared-off route that followed, whose dropoff stood 22.5 m from the
  // trailer, migrates the same way.
  saved.logistics.layout.routes.shipping = [
    [-16, 0, 42],
    [12, 0, 42],
    [16, 0, 42],
    [22.5, 0, 42],
    [22.5, 0, 48],
    [28.5, 0, 48],
    [28.5, 0, 42],
    [-16, 0, 42],
  ];
  expect(
    decodePhysicalSession(encodePhysicalSession(saved)).logistics.layout.routes.shipping
  ).toEqual(currentLogisticsLayout().routes.shipping);

  // The dock-door route whose dropoff set the pallet on the channel floor
  // below a 2 m deck, and the receiving route whose pickup stood 28 m from its
  // trailer, migrate too.
  saved.logistics.layout.routes.shipping = [
    [-16, 0, 42],
    [-10, 0, 42],
    [-5, 0, 42],
    [0, 0, 42],
    [0, 0, 47.25],
    [0, 0, 42],
    [-8, 0, 42],
    [-16, 0, 42],
  ];
  saved.logistics.layout.routes.receiving = [
    [-28, 0, -43],
    [-28, 0, -38],
    [-28, 0, -30],
    [-28, 0, -22],
    [-35, 0, -22],
    [-35, 0, -38],
  ];
  const both = decodePhysicalSession(encodePhysicalSession(saved)).logistics.layout.routes;
  expect(both.shipping).toEqual(currentLogisticsLayout().routes.shipping);
  expect(both.receiving).toEqual(currentLogisticsLayout().routes.receiving);
});

it('restores a save from before real-size machines with the installed machine sizes', () => {
  heldShift();
  // Saves written before the process machines were installed at real size
  // carry their authored sizes. Rendering ignores `size`, but collision,
  // selection and the layout-plan export read it.
  const authored = {
    [MachineType.ROLLER_MILL]: [7.8, 6.7, 5.7],
    [MachineType.PLANSIFTER]: [7, 7.56, 7],
    [MachineType.PACKER]: [4, 6, 4],
  } as const;
  const saved = capturePhysicalSession();
  const [template] = saved.production.machines;
  saved.production.machines = [
    [SITE_LAYOUT.machines.rollerMills[0], MachineType.ROLLER_MILL],
    [SITE_LAYOUT.machines.sifters[0], MachineType.PLANSIFTER],
    [SITE_LAYOUT.machines.packers[0], MachineType.PACKER],
  ].map(([anchor, type]) => {
    const { id, position } = anchor as { id: string; position: readonly number[] };
    const kind = type as keyof typeof authored;
    return {
      ...template,
      id,
      type: kind,
      position: [...position] as [number, number, number],
      size: [...authored[kind]] as [number, number, number],
    };
  });
  const installed = {
    [MachineType.ROLLER_MILL]: SITE_LAYOUT.machineDimensions.rollerMill,
    [MachineType.PLANSIFTER]: SITE_LAYOUT.machineDimensions.sifter,
    [MachineType.PACKER]: SITE_LAYOUT.machineDimensions.packer,
  } as const;
  const restored = decodePhysicalSession(encodePhysicalSession(saved)).production.machines;
  for (const machine of restored)
    expect(machine.size, machine.id).toEqual([
      ...installed[machine.type as keyof typeof installed],
    ]);

  // Collision and selection envelopes, and the exported plan footprint, are
  // exactly those of the installed machines.
  const canonical = restored.map((machine) => ({
    ...machine,
    size: [...installed[machine.type as keyof typeof installed]] as [number, number, number],
  }));
  expect(createMachineObstacles(1, restored)).toEqual(createMachineObstacles(1, canonical));
  const snapshot = (machines: typeof restored): LayoutSnapshot => ({
    capturedAt: '2026-10-21',
    simulationTime: 0,
    machines,
    segments: [],
    buffers: [],
    obstacles: planningObstacles(),
    packerKgPerSecond: 0,
  });
  const plan = currentLogisticsLayout();
  expect(layoutPlanDxf(snapshot(restored), plan)).toEqual(layoutPlanDxf(snapshot(canonical), plan));
  const mill = restored.find((machine) => machine.type === MachineType.ROLLER_MILL)!;
  expect(mill.size[0]).toBeLessThan(4);
});

describe('save size and scene-owner visibility', () => {
  it('saves production without the delegated snapshot copies and still reads records that carry them', () => {
    heldShift();
    const saved = capturePhysicalSession();
    for (const key of PRODUCTION_DELEGATED_KEYS) expect(saved.production).not.toHaveProperty(key);
    // Records written before this change carry boot-time copies of the owners' data.
    const production = useProductionStore.getState() as unknown as Record<string, unknown>;
    const legacy = structuredClone(saved);
    Object.assign(
      legacy.production,
      structuredClone(Object.fromEntries(PRODUCTION_DELEGATED_KEYS.map((k) => [k, production[k]])))
    );
    expect(legacy.production).toHaveProperty('truckSchedule');
    const decoded = decodePhysicalSession(encodePhysicalSession(legacy));
    for (const key of PRODUCTION_DELEGATED_KEYS) expect(decoded.production).not.toHaveProperty(key);
    expect(decoded.quality.qcLab.contaminationAlerts).toHaveLength(1);
  });

  it('compacts legacy batch credit keys when a saved shift is restored', () => {
    heldShift();
    const saved = capturePhysicalSession();
    const legacyKey = JSON.stringify([
      saved.material.sessionId,
      'batch-0001',
      10,
      'flour',
      5000,
      [{ lotId: 'lot-0001', amount: 5000, path: ['silo-0', 'packer-0'] }],
    ]);
    saved.operations.creditedBatchKg = { [legacyKey]: 4900 };
    localStorage.setItem(PHYSICAL_SESSION_KEY, encodePhysicalSession(saved));
    resetPlant();
    dispose = installPhysicalSession();
    const credited = useOperationsCampaignStore.getState().creditedBatchKg;
    expect(Object.values(credited)).toEqual([4900]);
    expect(Object.keys(credited)[0]).not.toContain('lot-0001');
  });

  it('reports a scene owner that never registers, and never resumes a half-restored shift', () => {
    heldShift();
    useGameSimulationStore.getState().setGameSpeed(30);
    localStorage.setItem(PHYSICAL_SESSION_KEY, encodePhysicalSession(capturePhysicalSession()));
    resetPlant();
    // The truck bay fails to mount, so its continuation can never be restored.
    removeOwners.shift()?.();
    const notices = () =>
      useUIStore.getState().alerts.filter((a) => a.id === 'physical-scene-incomplete');
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    try {
      dispose = installPhysicalSession();
      ready();
      vi.advanceTimersByTime(5000);
      expect(notices()).toHaveLength(0);
      vi.advanceTimersByTime(20000);
      expect(notices()).toHaveLength(1);
      expect(notices()[0].type).toBe('warning');
      expect(notices()[0].message).toContain('paused');
      expect(isPhysicalSessionRestoring()).toBe(true);
      expect(useGameSimulationStore.getState().gameSpeed).toBe(0);
      vi.advanceTimersByTime(60000);
      expect(notices()).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('says so when losing a scene owner stops autosave in a running shift', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    try {
      dispose = installPhysicalSession();
      ready();
      useGameSimulationStore.getState().setGameSpeed(30);
      vi.advanceTimersByTime(5000);
      const written = localStorage.getItem(PHYSICAL_SESSION_KEY);
      expect(written).not.toBeNull();
      removeOwners.shift()?.();
      vi.advanceTimersByTime(25000);
      const notice = useUIStore.getState().alerts.find((a) => a.id === 'physical-scene-incomplete');
      expect(notice?.title).toBe('Autosave paused');
      // Play goes on; only saving stopped, and the last good record is kept.
      expect(useGameSimulationStore.getState().gameSpeed).toBe(30);
      expect(localStorage.getItem(PHYSICAL_SESSION_KEY)).toBe(written);
    } finally {
      vi.useRealTimers();
    }
  });
});
