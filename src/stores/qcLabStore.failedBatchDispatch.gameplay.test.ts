/**
 * A failed test holds dispatch while the batch it judged is still on hold
 * (qcLabStore.dispatch.gameplay.test.ts). Only the newest test was read, so a
 * test of some other batch decided it: passing a second batch, or failing and
 * recalling one, lifted the hold while the first failed batch sat on hold.
 * Working if the hold lifts only when every failed batch is retested good or
 * recalled.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useMaterialFlowStore } from './materialFlowStore';
import { getDispatchQualityStatus, useQCLabStore, type QCGrade } from './qcLabStore';

const dispatchStatus = () =>
  getDispatchQualityStatus(
    useQCLabStore.getState().qcLab,
    useMaterialFlowStore.getState().productionBatches
  );

const testBatch = (batchId: string, grade: QCGrade) => {
  const qc = useQCLabStore.getState();
  qc.startQCTest('packer-0', { batchId });
  qc.completeQCTest({
    machineId: 'packer-0',
    batchId,
    grade,
    moistureContent: 14,
    proteinLevel: 11,
    ashContent: 0.6,
    particleSize: 180,
    passed: grade !== 'FAIL',
  });
};

const recallBatch = (batchId: string) => {
  const qc = useQCLabStore.getState();
  const alertId = qc.triggerContaminationAlert({ batchIds: [batchId], severity: 'high' });
  useQCLabStore.getState().resolveContaminationAlert(alertId, 'recalled');
};

const twoBatches = (): [string, string] => {
  for (let i = 0; i < 400 && useMaterialFlowStore.getState().productionBatches.length < 2; i++) {
    useMaterialFlowStore.getState().tickMaterialFlow(4, 1);
  }
  const [first, second] = useMaterialFlowStore.getState().productionBatches;
  expect(second).toBeDefined();
  return [first.id, second.id];
};

describe('failed-test dispatch hold with more than one batch', () => {
  beforeEach(() => {
    useMaterialFlowStore.getState().resetMaterialFlow();
    useQCLabStore.getState().resetQCLab();
  });

  it('is not lifted by a passing test of another batch', () => {
    const [failed, other] = twoBatches();
    testBatch(failed, 'FAIL');
    expect(dispatchStatus().reason).toBe('failed_quality_test');
    testBatch(other, 'A');
    expect(dispatchStatus()).toEqual({ released: false, reason: 'failed_quality_test' });
  });

  it('is not lifted by recalling a later failed batch', () => {
    const [failed, other] = twoBatches();
    testBatch(failed, 'FAIL');
    testBatch(other, 'FAIL');
    recallBatch(other);
    expect(dispatchStatus()).toEqual({ released: false, reason: 'failed_quality_test' });
  });

  it('lifts once the failed batch passes its own retest', () => {
    const [failed, other] = twoBatches();
    testBatch(failed, 'FAIL');
    testBatch(other, 'A');
    testBatch(failed, 'B');
    expect(dispatchStatus()).toEqual({ released: true, reason: null });
  });
});
