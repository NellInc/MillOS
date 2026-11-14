import { beforeEach, describe, expect, it } from 'vitest';
import { useMaterialFlowStore, type ProductionBatch } from './materialFlowStore';
import {
  BENCH_TEST_MINUTES,
  benchQueue,
  getDispatchQualityStatus,
  prioritiseBenchTest,
  stepLabBench,
  useQCLabStore,
} from './qcLabStore';
import { useOperationsCampaignStore } from './operationsCampaignStore';
import { planShipment, shipmentOrdersFrom } from '../simulation/shipmentPlan';

// Plan items 3.2 and 3.4 (D6). The lab read every batch on fixed bands (A at
// 95, a pass from 70) and never the order's minimum, and a truck loaded any
// released batch for any order. Working if new flour waits for the bench, one
// test at a time on game minutes; a 93 batch fails the strong-white order (95)
// and is not loaded for it, and goes to the community order (92) instead,
// without stopping any truck.

const batch = (
  id: string,
  qualityScore: number,
  overrides: Partial<ProductionBatch> = {}
): ProductionBatch => ({
  id,
  disposition: 'released',
  packerId: 'packer-0',
  materialType: 'flour',
  producedKg: 1000,
  availableKg: 1000,
  simulationTime: 1,
  sourceContributions: [{ lotId: 'lot-00001', amount: 1000, path: ['silo-0', 'packer-0'] }],
  dispositionReason: null,
  qcTestIds: [],
  dispatchManifestIds: [],
  sealed: true,
  qualityScore,
  awaitingTest: true,
  ...overrides,
});

const orders = () => shipmentOrdersFrom(useOperationsCampaignStore.getState().orders);
const idle = () => false;
const step = (minutes: number) => stepLabBench(minutes, orders(), idle);
const flow = () => useMaterialFlowStore.getState();
const lab = () => useQCLabStore.getState().qcLab;

beforeEach(() => {
  useMaterialFlowStore.getState().resetMaterialFlow();
  useQCLabStore.getState().resetQCLab();
  // order-001 strong white (95, critical), order-003 community flour (92).
  useOperationsCampaignStore.getState().resetCampaign();
});

describe('the bench', () => {
  it('tests one batch at a time over BENCH_TEST_MINUTES of game time', () => {
    useMaterialFlowStore.setState({
      productionBatches: [batch('batch-00001', 97), batch('batch-00002', 97)],
    });
    step(1); // the first test starts, and its first minute counts
    expect(lab().bench?.batchId).toBe('batch-00001');
    expect(lab().bench?.progress).toBeCloseTo(1 / BENCH_TEST_MINUTES, 9);
    for (let minute = 1; minute < BENCH_TEST_MINUTES - 1; minute++) step(1);
    expect(lab().testHistory).toHaveLength(0);
    step(1);
    expect(lab().testHistory).toHaveLength(1);
    expect(flow().productionBatches[0].awaitingTest).toBeUndefined();
    expect(flow().productionBatches[1].awaitingTest).toBe(true);
    // Untested flour is not stock a truck may take.
    expect(flow().getDispatchableFinishedGoods()).toBe(1000);
  });

  it('reads a 93 batch against the strong-white order: fails it, holds it from it, offers it on', () => {
    useMaterialFlowStore.setState({ productionBatches: [batch('batch-00001', 93)] });
    for (let i = 0; i <= BENCH_TEST_MINUTES; i++) step(1);
    const result = lab().testHistory.at(-1)!;
    expect(result).toMatchObject({
      batchId: 'batch-00001',
      orderId: 'order-001',
      minimumQuality: 95,
      passed: false,
      disposition: 'released',
      qualityScore: 93,
    });
    // A miss against one order's minimum stops no truck.
    expect(getDispatchQualityStatus(lab(), flow().productionBatches)).toEqual({
      released: true,
      reason: null,
    });
    const plan = planShipment({
      orders: orders(),
      activeOrderId: 'order-001',
      truck: { materialType: 'flour', loadedKg: 0, capacityKg: 5000 },
      stock: flow().productionBatches,
    });
    expect(plan.loads.every((load) => load.orderId !== 'order-001')).toBe(true);
    expect(plan.loads).toEqual([{ batchId: 'batch-00001', orderId: 'order-003', kg: 1000 }]);
  });

  it('tests first the batch the operator put first, then the earliest-due order’s product', () => {
    const queue = benchQueue(
      [
        batch('batch-00001', 97, { materialType: 'semolina' }),
        batch('batch-00002', 97),
        batch('batch-00003', 97),
      ],
      orders(),
      idle,
      null
    );
    // order-001 (flour) falls due before order-002 (semolina).
    expect(queue.map((b) => b.id)).toEqual(['batch-00002', 'batch-00003', 'batch-00001']);
    useMaterialFlowStore.setState({
      productionBatches: [batch('batch-00002', 97), batch('batch-00003', 97)],
    });
    expect(prioritiseBenchTest('batch-00003')).toBe(true);
    step(1);
    expect(lab().bench?.batchId).toBe('batch-00003');
    expect(lab().benchFirst).toBeNull();
  });

  it('waits while a packer is still filling an open batch', () => {
    const open = batch('batch-00001', 97, { sealed: false });
    expect(benchQueue([open], orders(), () => true, null)).toEqual([]);
    expect(benchQueue([open], orders(), () => false, null).map((b) => b.id)).toEqual([
      'batch-00001',
    ]);
  });
});
