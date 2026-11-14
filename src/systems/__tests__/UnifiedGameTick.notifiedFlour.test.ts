import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TickContext } from '../CentralTickSystem';
import { resetUnifiedTickState, unifiedGameTick } from '../UnifiedGameTick';
import { useBreakdownStore } from '../../stores/breakdownStore';
import { useMaterialFlowStore, type ProductionBatch } from '../../stores/materialFlowStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { useProductionStore } from '../../stores/productionStore';
import { canonicalProcessMachines } from '../../simulation/materialTransport';
import { useQCLabStore } from '../../stores/qcLabStore';
import { loadableStock } from '../../simulation/shipmentPlan';
import { useTruckScheduleStore } from '../../stores/truckScheduleStore';
import { useUIStore } from '../../stores/uiStore';
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
 * Plan 1.9's loose ends, carried to 3.2 and 3.4.
 * (a) Retesting only the stock held when the notice came closed the alert and
 *     freed flour packed from the named lots meanwhile, untested.
 * (c) The notice named only lots in the silos, so grain already in the mills
 *     and sifters (which carries its lots) still formed released flour.
 * Working if flour from the notified grain leaves hold only through its own
 * test or recall, and the notice names every lot with grain in process.
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

describe('a supplier notice and the notified flour', () => {
  beforeEach(() => {
    resetPlant();
    useMaterialFlowStore.getState().tickMaterialFlow(1, 1);
  });

  it('(a) frees flour packed from the named lots only through a test of it', () => {
    const { lots, packedBefore } = raise();
    const atRaise = [...supplierAlert().batchIds];
    expect(atRaise.length).toBeGreaterThan(0);
    const lotFlour = packUntilLotFlour(lots, packedBefore).map((batch) => batch.id);
    expect(lotFlour.length).toBeGreaterThan(0);
    for (const id of atRaise) if (batchById(id)?.disposition === 'hold') retestPress(id);
    // Whatever the alert did, no batch of the notified flour may ship untested.
    for (const id of lotFlour) {
      const batch = batchById(id)!;
      const tested = qc().qcLab.testHistory.some((test) => test.batchId === id);
      expect(loadableStock(batch) && !tested, id).toBe(false);
    }
  });

  it('(c) names the lots of grain already in the mills and sifters', () => {
    const inProcess = new Set<string>();
    flow().machineBuffers.forEach((buffer) => {
      if (buffer.machineType !== 'roller_mill' && buffer.machineType !== 'plansifter') return;
      for (const material of [...buffer.inputBuffer, ...buffer.outputBuffer])
        for (const source of material.sourceContributions ?? [])
          if (source.amount > 1) inProcess.add(source.lotId);
    });
    expect(inProcess.size).toBeGreaterThan(0);
    raise();
    expect(supplierAlert().sourceLotIds).toEqual(expect.arrayContaining([...inProcess]));
    for (const lotId of inProcess) expect(flow().sourceLots.get(lotId)?.disposition).toBe('hold');
  });
});
