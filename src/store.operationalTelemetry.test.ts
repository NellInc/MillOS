import { beforeEach, describe, expect, it } from 'vitest';
import {
  MILL_TAGS,
  OPERATION_TAG_IDS,
  UTILITY_ASSET_TAG_IDS,
  VEHICLE_TAG_IDS,
} from './scada/tagDatabase';
import { buildOperationalTelemetry } from './store';
import { useBreakdownStore } from './stores/breakdownStore';
import { getRecalledStock, useMaterialFlowStore } from './stores/materialFlowStore';
import { useOperationsCampaignStore } from './stores/operationsCampaignStore';
import { useQCLabStore } from './stores/qcLabStore';

describe('buildOperationalTelemetry', () => {
  beforeEach(() => {
    useMaterialFlowStore.getState().resetMaterialFlow();
    useBreakdownStore.getState().resetBreakdownStore();
    useQCLabStore.getState().resetQCLab();
    useOperationsCampaignStore.getState().resetCampaign();
  });

  it('projects the conserved flow ledger and maintenance stock into SCADA units', () => {
    const flow = useMaterialFlowStore.getState();
    const parts = useBreakdownStore.getState().partsInventory;
    const initial = buildOperationalTelemetry(flow, parts, useQCLabStore.getState().qcLab);

    expect(initial[OPERATION_TAG_IDS.rawInventory]).toBe(100);
    expect(initial[OPERATION_TAG_IDS.partsStock]).toBe(
      Object.values(parts).reduce((sum, count) => sum + count, 0)
    );
    expect(Math.abs(initial[OPERATION_TAG_IDS.materialBalanceError])).toBeLessThan(0.001);
    expect(initial[OPERATION_TAG_IDS.shippingReleased]).toBe(1);
    expect(initial[OPERATION_TAG_IDS.activeQualityHolds]).toBe(0);
    expect(initial[OPERATION_TAG_IDS.openWorkOrders]).toBe(0);

    flow.receiveGrainDelivery(1000);
    flow.tickMaterialFlow(1, 1);
    flow.shipFinishedGoods(50);
    const changed = buildOperationalTelemetry(
      useMaterialFlowStore.getState(),
      parts,
      useQCLabStore.getState().qcLab
    );

    expect(changed[OPERATION_TAG_IDS.lastReceiving]).toBe(1);
    expect(changed[OPERATION_TAG_IDS.lastShipping]).toBeCloseTo(0.05, 5);
    expect(changed[OPERATION_TAG_IDS.packerFlow]).toBeGreaterThan(0);
    expect(Math.abs(changed[OPERATION_TAG_IDS.materialBalanceError])).toBeLessThan(0.001);
  });

  it('publishes quality disposition, recall, work-order, and downtime provenance', () => {
    useMaterialFlowStore.getState().tickMaterialFlow(1, 1);
    const batches = useMaterialFlowStore.getState().productionBatches;
    useQCLabStore.getState().triggerContaminationAlert({ batchIds: [batches[0].id] });
    const recalledAlert = useQCLabStore
      .getState()
      .triggerContaminationAlert({ batchIds: [batches[1].id] });
    useQCLabStore.getState().resolveContaminationAlert(recalledAlert, 'recalled');
    useBreakdownStore.getState().triggerBreakdown('packer-0', 'Packer Line 1', 'mechanical');
    useBreakdownStore.getState().tickDowntime(37);

    const telemetry = buildOperationalTelemetry(
      useMaterialFlowStore.getState(),
      useBreakdownStore.getState().partsInventory,
      useQCLabStore.getState().qcLab,
      useBreakdownStore.getState().workOrders
    );
    expect(telemetry[OPERATION_TAG_IDS.activeQualityHolds]).toBe(1);
    // A batch recall scraps the batch on the spot, so nothing is left to deal
    // with and the recall tag stays normal; the batch remains on record.
    expect(
      useMaterialFlowStore
        .getState()
        .productionBatches.filter((batch) => batch.disposition === 'recalled')
    ).toHaveLength(1);
    expect(telemetry[OPERATION_TAG_IDS.recalledBatches]).toBe(0);
    expect(telemetry[OPERATION_TAG_IDS.openWorkOrders]).toBe(1);
    expect(telemetry[OPERATION_TAG_IDS.maintenanceDowntime]).toBe(37);
    expect(telemetry[OPERATION_TAG_IDS.shippingReleased]).toBe(0);
  });

  it('reads recalled batches HI only while the recalled lot is still in the plant', () => {
    const read = () =>
      buildOperationalTelemetry(
        useMaterialFlowStore.getState(),
        useBreakdownStore.getState().partsInventory,
        useQCLabStore.getState().qcLab
      )[OPERATION_TAG_IDS.recalledBatches];
    // Roller mill 101's opening grain: 500 kg upstream of the packers.
    const lotId = 'lot-opening-rm-101';
    const alertId = useQCLabStore.getState().triggerContaminationAlert({ sourceLotIds: [lotId] });
    useQCLabStore.getState().resolveContaminationAlert(alertId, 'recalled');

    let peak = 0;
    let ticks = 0;
    for (; ticks < 2000 && getRecalledStock(useMaterialFlowStore.getState()).kg > 0; ticks++) {
      useMaterialFlowStore.getState().tickMaterialFlow(1, 1);
      peak = Math.max(peak, read());
    }
    // Packing it formed recalled batches while the lot was being worked off...
    expect(peak).toBeGreaterThan(0);
    // ...and once none of the lot is left in the plant, the tag is normal again.
    expect(getRecalledStock(useMaterialFlowStore.getState()).kg).toBe(0);
    expect(read()).toBe(0);
    expect(ticks).toBeLessThan(2000);
  });

  it('publishes every visible utility vessel through its SCADA instruments', () => {
    const utilityAssets = useOperationsCampaignStore.getState().utilityAssets;
    const telemetry = buildOperationalTelemetry(
      useMaterialFlowStore.getState(),
      useBreakdownStore.getState().partsInventory,
      useQCLabStore.getState().qcLab,
      [],
      utilityAssets
    );
    const registeredIds = new Set(MILL_TAGS.map((tag) => tag.id));

    expect(utilityAssets).toHaveLength(5);
    utilityAssets.forEach((asset) => {
      const tagIds = UTILITY_ASSET_TAG_IDS[asset.id];
      expect(tagIds).toBeDefined();
      expect(registeredIds.has(tagIds.level)).toBe(true);
      expect(registeredIds.has(tagIds.temperature)).toBe(true);
      expect(registeredIds.has(tagIds.pressure)).toBe(true);
      expect(telemetry[tagIds.level]).toBe(asset.levelPercent);
      expect(telemetry[tagIds.temperature]).toBe(asset.temperatureC);
      expect(telemetry[tagIds.pressure]).toBe(asset.pressureBar);
    });
  });

  it('publishes distance-derived autonomous vehicle state without synthetic noise', () => {
    const telemetry = buildOperationalTelemetry(
      useMaterialFlowStore.getState(),
      useBreakdownStore.getState().partsInventory,
      useQCLabStore.getState().qcLab,
      [],
      [],
      [
        {
          id: 'forklift-1',
          type: 'forklift',
          speedMps: 1.25,
          steeringRadians: Math.PI / 12,
          phase: 'carrying',
          stopReason: 'none',
          articulationRadians: 0,
          transferReady: false,
        },
        {
          id: 'shipping-truck',
          type: 'truck',
          speedMps: -1.5,
          steeringRadians: 0.1,
          phase: 'transfer',
          stopReason: 'docked',
          articulationRadians: -Math.PI / 6,
          transferReady: true,
        },
      ]
    );

    expect(telemetry[VEHICLE_TAG_IDS['forklift-1'].speed]).toBe(1.25);
    expect(telemetry[VEHICLE_TAG_IDS['forklift-1'].steeringOrArticulation]).toBeCloseTo(15);
    expect(telemetry[VEHICLE_TAG_IDS['forklift-1'].phase]).toBe(1);
    expect(telemetry[VEHICLE_TAG_IDS['shipping-truck'].speed]).toBeCloseTo(5.4);
    expect(telemetry[VEHICLE_TAG_IDS['shipping-truck'].steeringOrArticulation]).toBeCloseTo(-30);
    expect(telemetry[VEHICLE_TAG_IDS['shipping-truck'].phase]).toBe(29);
    expect(telemetry[VEHICLE_TAG_IDS['shipping-truck'].interlock]).toBe(1);
  });
});
