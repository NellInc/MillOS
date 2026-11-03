import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useMaterialFlowStore, type ProductionBatch } from './materialFlowStore';
import { getDispatchQualityStatus, useQCLabStore } from './qcLabStore';

const batch = (id: string): ProductionBatch => ({
  id,
  disposition: 'released',
  packerId: 'packer-0',
  materialType: 'flour',
  producedKg: 1000,
  availableKg: 1000,
  simulationTime: 1,
  sourceContributions: [],
  dispositionReason: null,
  qcTestIds: [],
  dispatchManifestIds: [],
  sealed: true,
});

const retest = (batchId: string, passed: boolean) => {
  const qc = useQCLabStore.getState();
  qc.startQCTest('packer-0', { batchId, testType: 'retest' });
  return qc.completeQCTest({
    machineId: 'packer-0',
    batchId,
    testType: 'retest',
    grade: passed ? 'A' : 'FAIL',
    moistureContent: 13,
    proteinLevel: 12,
    ashContent: 0.5,
    particleSize: 120,
    passed,
  });
};

/** The Overview panel's retest path: release every open alert naming the batch. */
const releaseAfterRetest = (batchId: string) =>
  useQCLabStore
    .getState()
    .qcLab.contaminationAlerts.filter(
      (alert) => !alert.resolved && alert.batchIds.includes(batchId)
    )
    .forEach((alert) =>
      useQCLabStore.getState().resolveContaminationAlert(alert.id, 'released', 'QC', 'Retest')
    );

const disposition = (id: string) =>
  useMaterialFlowStore.getState().productionBatches.find((candidate) => candidate.id === id)
    ?.disposition;

// Pass 3 playtest: a supplier notification held every batch in one alert, and
// one passing retest released all of them untested.
describe('a multi-batch contamination alert settles batch by batch', () => {
  const originalFlow = useMaterialFlowStore.getState();
  let alertId = '';

  beforeEach(() => {
    useQCLabStore.getState().resetQCLab();
    useMaterialFlowStore.setState({
      productionBatches: [batch('b-1'), batch('b-2'), batch('b-3')],
      sourceLots: new Map(),
    });
    alertId = useQCLabStore.getState().triggerContaminationAlert({
      type: 'supplier_notification',
      severity: 'high',
      batchIds: ['b-1', 'b-2', 'b-3'],
    });
  });

  afterEach(() => {
    useMaterialFlowStore.setState(originalFlow, true);
    useQCLabStore.getState().resetQCLab();
  });

  const alert = () =>
    useQCLabStore.getState().qcLab.contaminationAlerts.find((item) => item.id === alertId)!;

  it('releases only the batch whose retest passed', () => {
    retest('b-1', true);
    releaseAfterRetest('b-1');
    expect(disposition('b-1')).toBe('released');
    expect(disposition('b-2')).toBe('hold');
    expect(disposition('b-3')).toBe('hold');
    expect(alert().resolved).toBe(false);
    expect(alert().batchIds).toEqual(['b-2', 'b-3']);
    expect(
      getDispatchQualityStatus(
        useQCLabStore.getState().qcLab,
        useMaterialFlowStore.getState().productionBatches
      ).reason
    ).toBe('unresolved_contamination');
  });

  it('closes the investigation once every batch it held is settled', () => {
    retest('b-1', true);
    releaseAfterRetest('b-1');
    retest('b-2', true);
    releaseAfterRetest('b-2');
    useQCLabStore
      .getState()
      .resolveContaminationAlert(alertId, 'recalled', 'QC', 'Recall', ['b-3']);
    expect(disposition('b-3')).toBe('recalled');
    expect(alert()).toMatchObject({ resolved: true, resolution: 'recalled' });
    expect(
      getDispatchQualityStatus(
        useQCLabStore.getState().qcLab,
        useMaterialFlowStore.getState().productionBatches
      )
    ).toEqual({ released: true, reason: null });
    expect(
      useQCLabStore
        .getState()
        .qcLab.dispositionHistory.filter((record) => record.referenceId === alertId)
        .map((record) => [record.action, record.batchIds])
    ).toEqual([
      ['hold', ['b-1', 'b-2', 'b-3']],
      ['release', ['b-1']],
      ['release', ['b-2']],
      ['recall', ['b-3']],
    ]);
  });

  it('recalls only the batch the recall names', () => {
    useQCLabStore
      .getState()
      .resolveContaminationAlert(alertId, 'recalled', 'QC', 'Recall', ['b-2']);
    expect(disposition('b-2')).toBe('recalled');
    expect(disposition('b-1')).toBe('hold');
    expect(disposition('b-3')).toBe('hold');
    expect(alert().batchIds).toEqual(['b-1', 'b-3']);
  });

  it('keeps a recall without a batch scope the whole investigation', () => {
    useQCLabStore.getState().resolveContaminationAlert(alertId, 'recalled');
    expect(['b-1', 'b-2', 'b-3'].map(disposition)).toEqual(['recalled', 'recalled', 'recalled']);
    expect(alert().resolved).toBe(true);
  });

  it('releases nothing on a failed retest and nothing it has no evidence for', () => {
    retest('b-1', false);
    expect(useQCLabStore.getState().resolveContaminationAlert(alertId, 'released')).toBe(false);
    expect(['b-1', 'b-2', 'b-3'].map(disposition)).toEqual(['hold', 'hold', 'hold']);
    expect(alert().resolved).toBe(false);
  });

  it('does not count a pass recorded before the alert as evidence', () => {
    useQCLabStore.getState().resetQCLab();
    useMaterialFlowStore.setState({ productionBatches: [batch('b-1'), batch('b-2')] });
    retest('b-1', true);
    const later = useQCLabStore.getState().triggerContaminationAlert({ batchIds: ['b-1', 'b-2'] });
    expect(useQCLabStore.getState().resolveContaminationAlert(later, 'released')).toBe(false);
    expect(['b-1', 'b-2'].map(disposition)).toEqual(['hold', 'hold']);
  });

  it('closes an investigation whose remaining batches already left hold elsewhere', () => {
    // A second, single-batch alert recalls b-2 and b-3 is recalled by its own;
    // the supplier alert must not then hold dispatch over batches with no controls.
    retest('b-1', true);
    releaseAfterRetest('b-1');
    useMaterialFlowStore.getState().setBatchDisposition(['b-2', 'b-3'], 'recalled', 'Scrapped');
    useQCLabStore.getState().resolveContaminationAlert(alertId, 'released');
    expect(alert().resolved).toBe(true);
  });
});

// An open investigation stops every truck, so one that no longer holds any
// stock, and offers no control to close it, must not keep stopping them.
describe('an investigation that holds nothing does not hold dispatch', () => {
  const originalFlow = useMaterialFlowStore.getState();

  beforeEach(() => useQCLabStore.getState().resetQCLab());
  afterEach(() => {
    useMaterialFlowStore.setState(originalFlow, true);
    useQCLabStore.getState().resetQCLab();
  });

  const dispatch = () =>
    getDispatchQualityStatus(
      useQCLabStore.getState().qcLab,
      useMaterialFlowStore.getState().productionBatches
    );

  it('ignores a supplier notice raised while no packed stock existed', () => {
    useMaterialFlowStore.setState({ productionBatches: [], sourceLots: new Map() });
    // UnifiedGameTick's supplier_contamination passes the stock it finds: none.
    useQCLabStore.getState().triggerContaminationAlert({
      type: 'supplier_notification',
      severity: 'high',
      batchIds: [],
    });
    // Later output is released, and the truck must be able to take it.
    useMaterialFlowStore.setState({ productionBatches: [batch('b-new')] });
    expect(dispatch()).toEqual({ released: true, reason: null });
  });

  it('releases dispatch after a recall settles a batch two alerts named', () => {
    useMaterialFlowStore.setState({ productionBatches: [batch('b-1')], sourceLots: new Map() });
    const qc = useQCLabStore.getState();
    const placedHold = qc.triggerContaminationAlert({ batchIds: ['b-1'] });
    qc.triggerContaminationAlert({ type: 'supplier_notification', batchIds: ['b-1'] });
    // The Overview panel recalls through the first open alert naming the batch.
    useQCLabStore.getState().resolveContaminationAlert(placedHold, 'recalled');
    expect(disposition('b-1')).toBe('recalled');
    expect(dispatch()).toEqual({ released: true, reason: null });
  });

  it('still holds dispatch while an open alert names a batch on hold', () => {
    useMaterialFlowStore.setState({ productionBatches: [batch('b-1')], sourceLots: new Map() });
    useQCLabStore.getState().triggerContaminationAlert({ batchIds: ['b-1'] });
    expect(dispatch().reason).toBe('unresolved_contamination');
  });
});
