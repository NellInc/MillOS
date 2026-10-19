import { beforeEach, describe, expect, it } from 'vitest';
import { resetUnifiedTickState, unifiedGameTick } from '../UnifiedGameTick';
import type { TickContext } from '../CentralTickSystem';
import { useMaterialFlowStore } from '../../stores/materialFlowStore';
import { useQCLabStore } from '../../stores/qcLabStore';
import { useTruckScheduleStore } from '../../stores/truckScheduleStore';
import { useUIStore } from '../../stores/uiStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import {
  useLogisticsLayoutStore,
  defaultSavedLogisticsLayout,
} from '../../stores/logisticsLayoutStore';

const tickContext: TickContext = {
  deltaSeconds: 0.5,
  gameTime: 0,
  gameSpeed: 1,
  elapsedTime: 0,
  tickCount: 0,
};

/** The two clicks the Overview offers: Place hold, then Recall batch. */
function holdAndRecall(batchId: string) {
  const qc = useQCLabStore.getState();
  const alertId = qc.triggerContaminationAlert({ batchIds: [batchId], severity: 'medium' });
  expect(useQCLabStore.getState().resolveContaminationAlert(alertId, 'recalled')).toBe(true);
}

function shipOneTruck(from: number) {
  const trucks = useTruckScheduleStore.getState();
  trucks.setTruckDocked('shipping', true);
  trucks.setTruckTransferReady('shipping', true);
  for (let index = 0; index < 20; index += 1)
    unifiedGameTick({ ...tickContext, tickCount: from + index });
  trucks.setTruckTransferReady('shipping', false);
  trucks.setTruckDocked('shipping', false);
  trucks.setTruckLifecycle('shipping', 'departing');
  unifiedGameTick({ ...tickContext, tickCount: from + 21 });
  trucks.recordTruckDeparture('shipping', 30);
  unifiedGameTick({ ...tickContext, tickCount: from + 22 });
}

describe('a recalled batch is written off instead of wedging dispatch', () => {
  beforeEach(() => {
    resetUnifiedTickState();
    useLogisticsLayoutStore.getState().restoreSaved(defaultSavedLogisticsLayout());
    useMaterialFlowStore.getState().resetMaterialFlow();
    useOperationsCampaignStore.getState().resetCampaign();
    useTruckScheduleStore.getState().resetTruckSchedule();
    useQCLabStore.getState().resetQCLab();
    useUIStore.setState({ alerts: [] });
    unifiedGameTick(tickContext);
    // Genuine packed output from more than one packer, so one batch can be
    // recalled while another of the same material is still released.
    useMaterialFlowStore.getState().tickMaterialFlow(1, 1);
  });

  it('ships the remaining released flour after one batch is recalled', () => {
    const before = useMaterialFlowStore
      .getState()
      .productionBatches.filter((batch) => batch.availableKg > 0);
    expect(before.length).toBeGreaterThan(1);
    const recalled = before[0];
    holdAndRecall(recalled.id);

    shipOneTruck(1);

    const shipped = useMaterialFlowStore.getState();
    expect(shipped.shippedKg).toBeGreaterThan(0);
    expect(useOperationsCampaignStore.getState().execution.dispatchLoad.lastDispatchKg).toBe(
      shipped.shippedKg
    );
    expect(
      shipped.manifests.at(-1)?.productBatches.some((entry) => entry.batchId === recalled.id)
    ).toBe(false);
    expect(useOperationsCampaignStore.getState().execution.qualityReleased).toBe(true);
  });

  it('writes recalled mass off as waste and keeps both balances closed', () => {
    const recalled = useMaterialFlowStore
      .getState()
      .productionBatches.find((batch) => batch.availableKg > 0)!;
    const wasteBefore = useMaterialFlowStore.getState().wasteKg;

    holdAndRecall(recalled.id);

    const flow = useMaterialFlowStore.getState();
    const after = flow.productionBatches.find((batch) => batch.id === recalled.id)!;
    expect(after.disposition).toBe('recalled');
    // The mass leaves the packer, so it no longer fills a fifth of its buffer.
    expect(after.availableKg).toBe(0);
    expect(flow.wasteKg).toBeCloseTo(wasteBefore + recalled.availableKg, 6);
    const packed = flow.machineBuffers
      .get(recalled.packerId)!
      .outputBuffer.flatMap((material) => material.productBatches ?? []);
    expect(packed.some((contribution) => contribution.batchId === recalled.id)).toBe(false);
    expect(Math.abs(flow.getGenealogyBalance().errorKg)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(flow.getMaterialBalance().errorKg)).toBeLessThanOrEqual(0.01);
  });

  it('keeps a recall terminal: a later retest cannot release it', () => {
    const batch = useMaterialFlowStore
      .getState()
      .productionBatches.find((candidate) => candidate.availableKg > 0)!;
    holdAndRecall(batch.id);
    useMaterialFlowStore.getState().setBatchDisposition([batch.id], 'released', 'retest');
    expect(
      useMaterialFlowStore.getState().productionBatches.find((b) => b.id === batch.id)?.disposition
    ).toBe('recalled');
  });

  it('names the dock cost when an open investigation holds a docked truck', () => {
    const batch = useMaterialFlowStore
      .getState()
      .productionBatches.find((candidate) => candidate.availableKg > 0)!;
    useQCLabStore.getState().triggerContaminationAlert({ batchIds: [batch.id] });
    const trucks = useTruckScheduleStore.getState();
    trucks.setTruckDocked('shipping', true);
    trucks.setTruckTransferReady('shipping', true);
    unifiedGameTick({ ...tickContext, tickCount: 2 });
    const hold = useUIStore.getState().alerts.find((a) => a.id.startsWith('dispatch-quality-hold'));
    expect(hold?.message).toContain('£120.00 per game hour');
  });
});
