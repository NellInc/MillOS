import { beforeEach, describe, expect, it } from 'vitest';
import { useMaterialFlowStore } from './materialFlowStore';
import { getDispatchQualityStatus, useQCLabStore } from './qcLabStore';

const completePassingRetest = (batchId: string, sourceLotIds: string[]) => {
  const qc = useQCLabStore.getState();
  qc.startQCTest('packer-0', {
    batchId,
    sourceLotIds,
    testType: 'retest',
    controlSource: 'Amina Patel',
  });
  return qc.completeQCTest({
    machineId: 'packer-0',
    batchId,
    sourceLotIds,
    testType: 'retest',
    controlSource: 'Amina Patel',
    controlNote: 'Retained sample conforms after investigation',
    grade: 'A',
    moistureContent: 13,
    proteinLevel: 12,
    ashContent: 0.5,
    particleSize: 120,
    passed: true,
  });
};

describe('QC batch genealogy lifecycle', () => {
  beforeEach(() => {
    useMaterialFlowStore.getState().resetMaterialFlow();
    useQCLabStore.getState().resetQCLab();
    useMaterialFlowStore.getState().tickMaterialFlow(4, 1);
  });

  it('propagates a source-lot hold to every affected packed batch', () => {
    const flow = useMaterialFlowStore.getState();
    const lotId = flow.productionBatches[0].sourceContributions[0].lotId;
    const affectedBefore = flow.productionBatches
      .filter((batch) => batch.sourceContributions.some((source) => source.lotId === lotId))
      .map((batch) => batch.id);

    const alertId = useQCLabStore.getState().triggerContaminationAlert({
      sourceLotIds: [lotId],
      controlSource: 'Amina Patel',
      controlNote: 'Foreign material confirmed in source sample',
    });
    const current = useMaterialFlowStore.getState();

    expect(alertId).toBe('contamination-00001');
    expect(current.sourceLots.get(lotId)?.disposition).toBe('hold');
    expect(
      current.productionBatches
        .filter((batch) => batch.disposition === 'hold')
        .map((batch) => batch.id)
    ).toEqual(expect.arrayContaining(affectedBefore));
    expect(
      getDispatchQualityStatus(useQCLabStore.getState().qcLab, current.productionBatches)
    ).toEqual({
      released: false,
      reason: 'unresolved_contamination',
    });
  });

  it('releases only conforming retested scope and retains the audit trail', () => {
    const flow = useMaterialFlowStore.getState();
    const [target, unaffected] = flow.productionBatches;
    const sourceLotIds = [...new Set(target.sourceContributions.map((source) => source.lotId))];
    const alertId = useQCLabStore.getState().triggerContaminationAlert({ batchIds: [target.id] });

    const test = completePassingRetest(target.id, sourceLotIds);
    expect(test.id).toBe('qc-00002');
    expect(test.testType).toBe('retest');
    expect(test.disposition).toBe('released');
    expect(useQCLabStore.getState().resolveContaminationAlert(alertId, 'released')).toBe(true);

    const currentFlow = useMaterialFlowStore.getState();
    expect(currentFlow.productionBatches.find((batch) => batch.id === target.id)).toMatchObject({
      disposition: 'released',
      qcTestIds: ['qc-00002'],
    });
    expect(
      currentFlow.productionBatches.find((batch) => batch.id === unaffected.id)?.qcTestIds
    ).toEqual([]);
    expect(
      useQCLabStore.getState().qcLab.dispositionHistory.map((record) => record.action)
    ).toEqual(['hold', 'retest', 'release']);
  });

  it('keeps recall terminal and excludes recalled mass from dispatch', () => {
    const target = useMaterialFlowStore.getState().productionBatches[0];
    const sourceLotIds = [...new Set(target.sourceContributions.map((source) => source.lotId))];
    const alertId = useQCLabStore.getState().triggerContaminationAlert({ batchIds: [target.id] });
    useQCLabStore.getState().resolveContaminationAlert(alertId, 'recalled');

    completePassingRetest(target.id, sourceLotIds);
    const beforeShip = useMaterialFlowStore.getState();
    expect(beforeShip.productionBatches.find((batch) => batch.id === target.id)?.disposition).toBe(
      'recalled'
    );
    beforeShip.shipFinishedGoods(1000);
    const manifest = useMaterialFlowStore.getState().manifests.at(-1)!;
    expect(manifest.productBatches.map((batch) => batch.batchId)).not.toContain(target.id);
  });
});

describe('a sibling batch test does not release a batch that failed its own test', () => {
  beforeEach(() => {
    useMaterialFlowStore.getState().resetMaterialFlow();
    useQCLabStore.getState().resetQCLab();
    useMaterialFlowStore.getState().tickMaterialFlow(4, 1);
  });

  const lotsOf = (batchId: string) => [
    ...new Set(
      useMaterialFlowStore
        .getState()
        .productionBatches.find((batch) => batch.id === batchId)!
        .sourceContributions.map((source) => source.lotId)
    ),
  ];

  it('keeps the failed batch held when a later batch from the same lot passes', () => {
    const failed = useMaterialFlowStore
      .getState()
      .productionBatches.find((batch) => batch.packerId === 'packer-0')!;
    const qc = useQCLabStore.getState();
    qc.startQCTest('packer-0', { batchId: failed.id, sourceLotIds: lotsOf(failed.id) });
    qc.completeQCTest({
      machineId: 'packer-0',
      batchId: failed.id,
      sourceLotIds: lotsOf(failed.id),
      grade: 'FAIL',
      moistureContent: 16,
      proteinLevel: 9,
      ashContent: 0.9,
      particleSize: 210,
      passed: false,
    });
    expect(
      useMaterialFlowStore.getState().productionBatches.find((batch) => batch.id === failed.id)
        ?.disposition
    ).toBe('hold');

    // The same lot keeps packing on line 0; its new product forms a held batch.
    useMaterialFlowStore.getState().tickMaterialFlow(2, 1);
    const sibling = useMaterialFlowStore
      .getState()
      .productionBatches.find(
        (batch) =>
          batch.packerId === 'packer-0' &&
          batch.id !== failed.id &&
          batch.sourceContributions.some((source) => lotsOf(failed.id).includes(source.lotId))
      )!;
    expect(sibling.disposition).toBe('hold');

    completePassingRetest(sibling.id, lotsOf(sibling.id));

    const batches = useMaterialFlowStore.getState().productionBatches;
    expect(batches.find((batch) => batch.id === sibling.id)?.disposition).toBe('released');
    // The failed batch was never retested: it must not become dispatchable.
    expect(batches.find((batch) => batch.id === failed.id)?.disposition).toBe('hold');
  });

  it('keeps a batch under its own open investigation held', () => {
    const [investigated, sibling] = useMaterialFlowStore
      .getState()
      .productionBatches.filter((batch) => batch.packerId === 'packer-0');
    expect(sibling).toBeUndefined();
    const qc = useQCLabStore.getState();
    qc.triggerContaminationAlert({ batchIds: [investigated.id] });
    // A lot-wide hold from another test, then a passing test of new product.
    useMaterialFlowStore.getState().setLotDisposition(lotsOf(investigated.id), 'hold', 'lot hold');
    useMaterialFlowStore.getState().tickMaterialFlow(2, 1);
    const fresh = useMaterialFlowStore
      .getState()
      .productionBatches.find(
        (batch) => batch.packerId === 'packer-0' && batch.id !== investigated.id
      )!;
    completePassingRetest(fresh.id, lotsOf(fresh.id));

    expect(
      useMaterialFlowStore
        .getState()
        .productionBatches.find((batch) => batch.id === investigated.id)?.disposition
    ).toBe('hold');
  });
});
