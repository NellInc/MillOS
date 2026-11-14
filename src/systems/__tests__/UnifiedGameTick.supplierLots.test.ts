import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TickContext } from '../CentralTickSystem';
import { resetUnifiedTickState, unifiedGameTick } from '../UnifiedGameTick';
import { useBreakdownStore } from '../../stores/breakdownStore';
import { useMaterialFlowStore, type ProductionBatch } from '../../stores/materialFlowStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { useProductionStore } from '../../stores/productionStore';
import { canonicalProcessMachines } from '../../simulation/materialTransport';
import {
  getDispatchQualityStatus,
  useQCLabStore,
  type ContaminationAlert,
} from '../../stores/qcLabStore';
import { useTruckScheduleStore } from '../../stores/truckScheduleStore';
import { useUIStore } from '../../stores/uiStore';
import {
  capturePhysicalSession,
  decodePhysicalSession,
  encodePhysicalSession,
} from '../../utils/physicalSession';
import {
  defaultSavedLogisticsLayout,
  useLogisticsLayoutStore,
} from '../../stores/logisticsLayoutStore';
import {
  registerReplayParticipant,
  REQUIRED_REPLAY_PARTICIPANTS,
} from '../../simulation/workplaceReplayRuntime';

// The scene owners a save captures; the tick tests mount no scene.
let removeOwners: (() => void)[] = [];
beforeEach(() => {
  removeOwners = REQUIRED_REPLAY_PARTICIPANTS.map((id) =>
    registerReplayParticipant(id, { capture: () => ({ phase: 'waiting' }), restore: () => {} })
  );
});
afterEach(() => removeOwners.forEach((remove) => remove()));

/*
 * 02 F5, 03 F3: the supplier notice held the stock already packed and named no
 * lots, so flour milled from the notified grain afterwards formed released and
 * shipped. Working if a batch packed from a lot that was in a silo when the
 * notice came stays held until the alert is released or recalled, and closing
 * the alert frees it.
 */

const context: TickContext = {
  deltaSeconds: 0.5,
  gameTime: 0,
  gameSpeed: 1,
  elapsedTime: 0,
  tickCount: 1,
};
let tickCount = 1;
const tick = () => unifiedGameTick({ ...context, tickCount: ++tickCount });
/** One plant second of packing, then the tick that reads it. */
const step = () => {
  useMaterialFlowStore.getState().tickMaterialFlow(1, 1);
  tick();
};

const flow = () => useMaterialFlowStore.getState();
const qc = () => useQCLabStore.getState();
const batchById = (id: string) => flow().productionBatches.find((batch) => batch.id === id);
const supplierAlert = () =>
  qc().qcLab.contaminationAlerts.find((alert) => alert.type === 'supplier_notification')!;
const lotsOf = (batch: ProductionBatch) => [
  ...new Set(batch.sourceContributions.map((source) => source.lotId)),
];
const dispatch = () => getDispatchQualityStatus(qc().qcLab, flow().productionBatches);

/** Lots with grain in a silo now. */
function siloLots(): string[] {
  const kg = new Map<string, number>();
  flow().machineBuffers.forEach((buffer) => {
    if (buffer.machineType !== 'silo') return;
    for (const material of [...buffer.inputBuffer, ...buffer.outputBuffer])
      for (const source of material.sourceContributions ?? [])
        kg.set(source.lotId, (kg.get(source.lotId) ?? 0) + source.amount);
  });
  return [...kg].filter(([, amount]) => amount > 1).map(([lotId]) => lotId);
}

/** The Overview panel's Retest and release: a conforming retest, then every open alert naming the batch. */
function retestPress(batchId: string) {
  const batch = batchById(batchId)!;
  const sourceLotIds = lotsOf(batch);
  qc().startQCTest(batch.packerId, {
    batchId,
    sourceLotIds,
    testType: 'retest',
    controlSource: 'Operator',
  });
  qc().completeQCTest({
    machineId: batch.packerId,
    batchId,
    sourceLotIds,
    testType: 'retest',
    controlSource: 'Operator',
    grade: 'B',
    moistureContent: 13,
    proteinLevel: 12,
    ashContent: 0.5,
    particleSize: 120,
    passed: true,
  });
  qc()
    .qcLab.contaminationAlerts.filter(
      (alert) => !alert.resolved && alert.batchIds.includes(batchId)
    )
    .forEach((alert) => qc().resolveContaminationAlert(alert.id, 'released', 'Operator', 'Retest'));
}

/** The Overview panel's Recall batch: every open alert naming it, else one of its own. */
function recallPress(batchId: string) {
  const open = qc()
    .qcLab.contaminationAlerts.filter(
      (alert) => !alert.resolved && alert.batchIds.includes(batchId)
    )
    .map((alert) => alert.id);
  const alertIds = open.length
    ? open
    : [qc().triggerContaminationAlert({ batchIds: [batchId], severity: 'high' })];
  alertIds.forEach((alertId) =>
    qc().resolveContaminationAlert(alertId, 'recalled', 'Operator', 'Recalled', [batchId])
  );
}

/** Raise the incident through the tick, as the Chronicle's event deck does. */
function raise() {
  const lots = siloLots();
  const packedBefore = new Set(flow().productionBatches.map((batch) => batch.id));
  useOperationsCampaignStore.getState().triggerIncident('supplier_contamination');
  tick();
  return { lots, packedBefore };
}

/**
 * Run the line until flour milled from the named grain is packed: the mills
 * start on their own opening stock, so silo grain reaches the packers later.
 */
function packUntilLotFlour(lots: readonly string[], packedBefore: ReadonlySet<string>) {
  const lotFlour = () =>
    flow().productionBatches.filter(
      (batch) =>
        !packedBefore.has(batch.id) &&
        batch.sourceContributions.some((source) => lots.includes(source.lotId))
    );
  for (let index = 0; index < 600 && lotFlour().length === 0; index += 1) step();
  return lotFlour();
}

/** Settle the alert one press at a time, with a tick of production between presses. */
function settleByPresses(
  press: (batchId: string) => void,
  current: () => ContaminationAlert = supplierAlert
): number {
  for (let presses = 1; presses <= 40; presses += 1) {
    const alert = current();
    const named = flow().productionBatches.find(
      (batch) => alert.batchIds.includes(batch.id) && batch.disposition === 'hold'
    );
    if (!named) throw new Error('An open alert names no batch the panel can act on');
    press(named.id);
    if (current().resolved) return presses;
    // While the investigation is open, its lots stay held whatever was pressed.
    for (const lotId of alert.sourceLotIds)
      expect(flow().sourceLots.get(lotId)?.disposition).toBe('hold');
    step();
  }
  throw new Error('The supplier alert never closed');
}

/** Nothing is left on hold, and flour milled after the close is packed released. */
function expectFreed() {
  expect(flow().productionBatches.filter((batch) => batch.disposition === 'hold')).toEqual([]);
  expect(dispatch()).toEqual({ released: true, reason: null });
  const producedBefore = flow().productionBatches.reduce((sum, batch) => sum + batch.producedKg, 0);
  for (let index = 0; index < 3; index += 1) step();
  const batches = flow().productionBatches;
  expect(batches.reduce((sum, batch) => sum + batch.producedKg, 0)).toBeGreaterThan(producedBefore);
  expect(batches.filter((batch) => batch.disposition === 'hold')).toEqual([]);
}

function resetPlant(openingTick = true) {
  tickCount = 1;
  resetUnifiedTickState();
  useLogisticsLayoutStore.getState().restoreSaved(defaultSavedLogisticsLayout());
  useMaterialFlowStore.getState().resetMaterialFlow();
  useOperationsCampaignStore.getState().resetCampaign();
  useTruckScheduleStore.getState().resetTruckSchedule();
  useBreakdownStore.getState().resetBreakdownStore();
  useQCLabStore.getState().resetQCLab();
  useUIStore.setState({ alerts: [] });
  // The scene's process roster, running, so spouts resolve and silo grain
  // reaches the packers.
  useProductionStore.getState().setMachines(
    canonicalProcessMachines().map((machine) => ({
      id: machine.id,
      name: machine.id,
      type: machine.type,
      position: [machine.position[0], machine.position[1], machine.position[2]],
      size: [machine.size[0], machine.size[1], machine.size[2]],
      rotation: 0,
      status: 'running',
      metrics: { rpm: 450, temperature: 60, vibration: 1, load: 80, wear: 5, efficiency: 100 },
      lastMaintenance: '2026-08-01',
      nextMaintenance: '2026-08-08',
    }))
  );
  if (openingTick) unifiedGameTick(context);
}

describe('a supplier notice holds the lots in the silos', () => {
  beforeEach(() => {
    resetPlant();
    // Packed stock on hand when the notice comes.
    useMaterialFlowStore.getState().tickMaterialFlow(1, 1);
  });

  it('names the silo lots, and flour packed from them afterwards forms on hold', () => {
    const { lots, packedBefore } = raise();
    expect(lots.length).toBeGreaterThan(0);
    const later = packUntilLotFlour(lots, packedBefore);
    expect(later.length).toBeGreaterThan(0);
    for (const batch of later) expect(batch.disposition).toBe('hold');

    // Re-pinned for plan 3.4 (1.9 (c)): the notice names the lots in process
    // as well as those in the silos, so the silo lots are a subset.
    expect(supplierAlert().sourceLotIds).toEqual(expect.arrayContaining(lots));
    for (const lotId of lots) expect(flow().sourceLots.get(lotId)?.disposition).toBe('hold');
  });

  it('closes on retests pressed while the line runs, and closing frees the lots', () => {
    const { lots, packedBefore } = raise();
    const lotFlour = packUntilLotFlour(lots, packedBefore);
    expect(lotFlour.length).toBeGreaterThan(0);
    const held = flow().productionBatches.filter((batch) => batch.disposition === 'hold');
    expect(held.length).toBeGreaterThanOrEqual(3);
    expect(dispatch().reason).toBe('unresolved_contamination');

    settleByPresses(retestPress);

    expect(supplierAlert()).toMatchObject({ resolved: true, resolution: 'released' });
    for (const lotId of lots) expect(flow().sourceLots.get(lotId)?.disposition).toBe('released');
    // Flour from the notified grain that was never pressed is freed by the close.
    for (const batch of lotFlour) expect(batchById(batch.id)?.disposition).toBe('released');
    expectFreed();
  });

  it('closes on recalls pressed one batch at a time without scrapping the silos', () => {
    const { lots, packedBefore } = raise();
    const lotFlour = packUntilLotFlour(lots, packedBefore);
    const named = new Set(supplierAlert().batchIds);

    settleByPresses(recallPress);

    expect(supplierAlert().resolved).toBe(true);
    // A recall pressed on a batch writes off that batch; the grain is not recalled.
    for (const lotId of lots) expect(flow().sourceLots.get(lotId)?.disposition).toBe('released');
    const recalled = flow().productionBatches.filter((batch) => batch.disposition === 'recalled');
    expect(recalled.length).toBeGreaterThan(0);
    for (const batch of recalled) expect(named.has(batch.id)).toBe(true);
    for (const batch of lotFlour) expect(batchById(batch.id)?.disposition).toBe('released');
    expectFreed();
  });

  // The incident can be resolved while its alert stays open, so a second
  // notice can name the same grain. Closing one alert leaves the lot held.
  it('keeps a lot held while another open alert names it', () => {
    const { lots, packedBefore } = raise();
    packUntilLotFlour(lots, packedBefore);
    const secondId = qc().triggerContaminationAlert({
      type: 'supplier_notification',
      severity: 'high',
      sourceLotIds: lots,
    });
    const second = () => qc().qcLab.contaminationAlerts.find((alert) => alert.id === secondId)!;
    const first = supplierAlert().id;
    const firstAlert = () => qc().qcLab.contaminationAlerts.find((alert) => alert.id === first)!;

    settleByPresses(recallPress, firstAlert);
    expect(firstAlert().resolved).toBe(true);
    expect(second().resolved).toBe(false);
    for (const lotId of lots) expect(flow().sourceLots.get(lotId)?.disposition).toBe('hold');
    expect(() =>
      decodePhysicalSession(encodePhysicalSession(capturePhysicalSession()))
    ).not.toThrow();

    settleByPresses(retestPress, second);
    expect(second().resolved).toBe(true);
    for (const lotId of lots) expect(flow().sourceLots.get(lotId)?.disposition).toBe('released');
    expectFreed();
  });

  it('keeps a mid-investigation save restorable', () => {
    const { lots, packedBefore } = raise();
    // A pass on flour from the notified grain releases that batch, not the lot.
    const [first] = packUntilLotFlour(lots, packedBefore);
    retestPress(first.id);
    expect(batchById(first.id)?.disposition).toBe('released');
    expect(supplierAlert().resolved).toBe(false);
    step();
    expect(batchById(first.id)?.disposition).toBe('released');

    const saved = decodePhysicalSession(encodePhysicalSession(capturePhysicalSession()));
    const open = saved.quality.qcLab.contaminationAlerts.find((alert) => !alert.resolved)!;
    expect(open.sourceLotIds.length).toBeGreaterThan(0);
    for (const lotId of open.sourceLotIds)
      expect(saved.material.sourceLots.get(lotId)?.disposition).toBe('hold');
  });
});

describe('a supplier notice raised before anything was packed', () => {
  beforeEach(() => resetPlant(false));

  it('gains a batch the panel can close it from', () => {
    expect(flow().productionBatches.filter((batch) => batch.availableKg > 0)).toEqual([]);
    const { lots, packedBefore } = raise();
    // Re-pinned for plan 3.4 (1.9 (c)): the notice now names the grain in
    // process too, so flour packed on the raising tick may already be bound.
    // The notice itself named no packed batch.
    expect(qc().qcLab.dispositionHistory.find((r) => r.action === 'hold')?.batchIds).toEqual([]);
    expect(lots.length).toBeGreaterThan(0);
    // Until the notified grain is packed the alert holds lots and no batch.
    const lotFlour = packUntilLotFlour(lots, packedBefore);
    expect(lotFlour.length).toBeGreaterThan(0);
    expect(supplierAlert().batchIds.length).toBeGreaterThan(0);

    settleByPresses(retestPress);

    expect(supplierAlert().resolved).toBe(true);
    expectFreed();
  });
});

// A save from before the alert named lots: an open supplier alert holding
// packed batches only. It restores, a tick leaves it as saved, and it closes.
describe('an open supplier alert saved before it named lots', () => {
  beforeEach(() => {
    resetPlant();
    useMaterialFlowStore.getState().tickMaterialFlow(1, 1);
  });

  it('restores, is left as saved by the tick, and closes cleanly', () => {
    const stock = flow()
      .productionBatches.filter((batch) => batch.availableKg > 0)
      .map((batch) => batch.id);
    qc().triggerContaminationAlert({
      type: 'supplier_notification',
      severity: 'high',
      batchIds: stock,
    });
    // The record exactly as an older build wrote it.
    const saved = decodePhysicalSession(encodePhysicalSession(capturePhysicalSession()));
    const legacy: ContaminationAlert = saved.quality.qcLab.contaminationAlerts[0];
    expect(legacy.sourceLotIds).toEqual([]);
    useQCLabStore.setState({ qcLab: saved.quality.qcLab });
    const restored = qc().qcLab.contaminationAlerts;

    step();
    expect(qc().qcLab.contaminationAlerts[0]).toEqual(restored[0]);

    settleByPresses(retestPress);
    expect(supplierAlert().resolved).toBe(true);
    expect(dispatch()).toEqual({ released: true, reason: null });
  });
});
