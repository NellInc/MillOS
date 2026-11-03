/**
 * The campaign's supplier contamination incident holds every batch in stock
 * with a canned note. Batch Genealogy renders a hold reason through its key;
 * the supplier note's key must resolve in the qcLab catalogue, or the reason
 * stays in the language the incident was raised in. Working if the hold reason
 * follows a language switch (the tick files the note with this key).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setLocale } from '../../i18n';
import { useMaterialFlowStore } from '../materialFlowStore';
import { useQCLabStore } from '../qcLabStore';
import { dispositionReasonText } from '../../components/ui-new/panels/OverviewPanel';

describe('supplier contamination hold reason', () => {
  beforeEach(() => {
    setLocale('en');
    useMaterialFlowStore.getState().resetMaterialFlow();
    useQCLabStore.getState().resetQCLab();
  });
  afterEach(() => setLocale('en'));

  it('reads in the language active now', () => {
    useMaterialFlowStore.getState().tickMaterialFlow(1, 1);
    const batchIds = useMaterialFlowStore
      .getState()
      .productionBatches.filter((batch) => batch.availableKg > 0)
      .map((batch) => batch.id);
    expect(batchIds.length).toBeGreaterThan(0);
    useQCLabStore.getState().triggerContaminationAlert({
      type: 'supplier_notification',
      severity: 'high',
      batchIds,
      controlSource: 'Operations campaign controller',
      controlNote: 'Supplier notification requires traceability review before dispatch release.',
      controlNoteKey: { catalog: 'qcLab', key: 'supplierTraceabilityNote' },
    });
    const batch = useMaterialFlowStore.getState().productionBatches[0];
    expect(batch.disposition).toBe('hold');
    const reason = () =>
      dispositionReasonText(batch.dispositionReason!, batch.dispositionReasonKey);
    expect(reason()).toContain('Supplier notification requires traceability review');

    setLocale('pt-BR');
    expect(reason()).toContain('A notificação do fornecedor exige revisão de rastreabilidade');
  });
});
