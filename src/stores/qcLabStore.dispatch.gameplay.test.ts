/**
 * F24: a failed test holds dispatch only while the failed batch still has
 * stock on hold. Recalling that batch (the Overview panel's recall: an
 * investigation opened and resolved as recalled) scraps its mass, and the plant
 * must ship released stock again rather than wait for some other test to pass.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useMaterialFlowStore } from './materialFlowStore';
import { getDispatchQualityStatus, useQCLabStore } from './qcLabStore';

const dispatchStatus = () =>
  getDispatchQualityStatus(
    useQCLabStore.getState().qcLab,
    useMaterialFlowStore.getState().productionBatches
  );

const failBatch = (batchId: string) => {
  const qc = useQCLabStore.getState();
  qc.startQCTest('packer-0', { batchId });
  qc.completeQCTest({
    machineId: 'packer-0',
    batchId,
    grade: 'FAIL',
    moistureContent: 16,
    proteinLevel: 9,
    ashContent: 0.9,
    particleSize: 210,
    passed: false,
  });
};

const recallBatch = (batchId: string) => {
  const qc = useQCLabStore.getState();
  const alertId = qc.triggerContaminationAlert({ batchIds: [batchId], severity: 'high' });
  useQCLabStore.getState().resolveContaminationAlert(alertId, 'recalled');
};

describe('failed-test dispatch hold after a recall', () => {
  beforeEach(() => {
    useMaterialFlowStore.getState().resetMaterialFlow();
    useQCLabStore.getState().resetQCLab();
    useMaterialFlowStore.getState().tickMaterialFlow(4, 1);
  });

  it('holds dispatch while the failed batch is on hold', () => {
    const [failed] = useMaterialFlowStore.getState().productionBatches;
    failBatch(failed.id);
    expect(
      useMaterialFlowStore.getState().productionBatches.find((batch) => batch.id === failed.id)
        ?.disposition
    ).toBe('hold');
    expect(dispatchStatus()).toEqual({ released: false, reason: 'failed_quality_test' });
  });

  it('releases the plant once the failed batch is recalled', () => {
    const [failed] = useMaterialFlowStore.getState().productionBatches;
    failBatch(failed.id);
    recallBatch(failed.id);

    const recalled = useMaterialFlowStore
      .getState()
      .productionBatches.find((batch) => batch.id === failed.id)!;
    expect(recalled.disposition).toBe('recalled');
    // The latest test is still the failure; the batch it judged holds nothing.
    expect(useQCLabStore.getState().getLatestTestResult()?.passed).toBe(false);
    expect(dispatchStatus()).toEqual({ released: true, reason: null });
  });

  it('keeps an unscoped failed result holding the plant', () => {
    const qc = useQCLabStore.getState();
    qc.startQCTest('packer-0');
    qc.completeQCTest({
      machineId: 'packer-0',
      grade: 'FAIL',
      moistureContent: 16,
      proteinLevel: 9,
      ashContent: 0.9,
      particleSize: 210,
      passed: false,
    });
    expect(dispatchStatus()).toEqual({ released: false, reason: 'failed_quality_test' });
  });
});
