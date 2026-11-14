import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setLocale } from '../../../i18n';
import { useMaterialFlowStore, type ProductionBatch } from '../../../stores/materialFlowStore';
import { useQCLabStore } from '../../../stores/qcLabStore';
import { BatchGenealogySection } from './OverviewPanel';

/**
 * Batch Genealogy printed each batch's disposition reason as the text stored
 * when the reason was written, so after a language switch every reason stayed
 * in the old language. Working if the canned reasons (hold, test, release,
 * recall, dispatch, inherited) follow the current language, an operator's own
 * note stays as written, and a batch saved before reasons carried a key still
 * shows its stored text.
 */
const row = (id: string) => within(screen.getByText(id.toUpperCase()).closest('li')!);

const batch = (id: string, patch: Partial<ProductionBatch> = {}): ProductionBatch => ({
  id,
  disposition: 'hold',
  packerId: 'packer-0',
  materialType: 'flour',
  producedKg: 50,
  availableKg: 50,
  simulationTime: 1,
  sourceContributions: [],
  dispositionReason: null,
  qcTestIds: [],
  dispatchManifestIds: [],
  sealed: true,
  ...patch,
});

describe('Batch Genealogy reasons across a language switch', () => {
  const originalFlow = useMaterialFlowStore.getState();
  const originalQC = useQCLabStore.getState();

  beforeEach(() => {
    setLocale('en');
    useMaterialFlowStore.setState({
      productionBatches: [batch('batch-a', { disposition: 'released' }), batch('batch-b')],
      sourceLots: new Map(),
    });
    useQCLabStore.getState().resetQCLab();
  });

  afterEach(() => {
    cleanup();
    act(() => setLocale('en'));
    useMaterialFlowStore.setState(originalFlow, true);
    useQCLabStore.setState(originalQC, true);
  });

  it('renders a hold placed in English in Portuguese after the switch', () => {
    render(<BatchGenealogySection />);
    fireEvent.click(row('batch-a').getByRole('button', { name: 'Place hold' }));
    // The player pressed it, so it never reads as automated.
    expect(
      row('batch-a').getByText('contamination-00001: Targeted quality hold placed by hand')
    ).toBeInTheDocument();
    expect(row('batch-a').queryByText(/Automated/)).toBeNull();

    act(() => setLocale('pt-BR'));
    expect(
      row('batch-a').getByText(
        'contamination-00001: Retenção de qualidade direcionada aplicada manualmente'
      )
    ).toBeInTheDocument();
  });

  it('renders test, recall and dispatch reasons in the current language', () => {
    const qc = useQCLabStore.getState();
    qc.startQCTest('packer-0', { batchId: 'batch-b' });
    const result = qc.completeQCTest({
      machineId: 'packer-0',
      batchId: 'batch-b',
      grade: 'A',
      moistureContent: 13,
      proteinLevel: 11,
      ashContent: 0.5,
      particleSize: 150,
      passed: true,
    });
    const alertId = useQCLabStore.getState().triggerContaminationAlert({ batchIds: ['batch-a'] });
    useQCLabStore.getState().resolveContaminationAlert(alertId, 'recalled');
    render(<BatchGenealogySection />);
    expect(row('batch-b').getByText(`Test ${result.id}: A`)).toBeInTheDocument();
    expect(row('batch-a').getByText(`Material recalled under ${alertId}`)).toBeInTheDocument();

    act(() => setLocale('pt-BR'));
    expect(row('batch-b').getByText(`Teste ${result.id}: A`)).toBeInTheDocument();
    expect(row('batch-a').getByText(`Material recolhido conforme ${alertId}`)).toBeInTheDocument();
  });

  it('renders the dispatch and inherited reasons the material ledger writes', () => {
    const flow = useMaterialFlowStore.getState();
    flow.resetMaterialFlow();
    useMaterialFlowStore.getState().tickMaterialFlow(1, 1);
    useMaterialFlowStore.getState().shipFinishedGoods(1000);
    // Product packed from a held lot inherits the lot's hold.
    useMaterialFlowStore.getState().setLotDisposition(['lot-opening-packer-1'], 'hold', 'x');
    useMaterialFlowStore.getState().tickMaterialFlow(1, 1);
    render(<BatchGenealogySection />);
    expect(screen.getAllByText('Fully dispatched').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Inherited source-lot disposition').length).toBeGreaterThan(0);

    act(() => setLocale('pt-BR'));
    expect(screen.queryAllByText('Fully dispatched')).toHaveLength(0);
    expect(screen.getAllByText('Totalmente expedido').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Destinação herdada do lote de origem').length).toBeGreaterThan(0);
  });

  it('keeps an operator note as written and a keyless saved reason as stored', () => {
    useMaterialFlowStore.setState({
      productionBatches: [
        batch('batch-a'),
        batch('batch-b', { dispositionReason: 'Old saved reason', disposition: 'released' }),
      ],
    });
    useQCLabStore.getState().triggerContaminationAlert({
      batchIds: ['batch-a'],
      controlNote: 'Sieve tear found by night shift',
    });
    render(<BatchGenealogySection />);
    act(() => setLocale('pt-BR'));
    expect(
      row('batch-a').getByText('contamination-00001: Sieve tear found by night shift')
    ).toBeInTheDocument();
    expect(row('batch-b').getByText('Old saved reason')).toBeInTheDocument();
  });
});

/**
 * The trace printed each lot's supplier as the text stored when the lot was
 * created ("Opening inventory" at store start, "Scheduled farm intake" per
 * delivery), so a lot made before a language switch kept the old language.
 */
describe('Batch trace suppliers across a language switch', () => {
  const originalFlow = useMaterialFlowStore.getState();
  const originalQC = useQCLabStore.getState();

  afterEach(() => {
    cleanup();
    act(() => setLocale('en'));
    useMaterialFlowStore.setState(originalFlow, true);
    useQCLabStore.setState(originalQC, true);
  });

  it('renders opening-stock and delivered lots in the current language', () => {
    setLocale('en');
    useQCLabStore.getState().resetQCLab();
    useMaterialFlowStore.getState().resetMaterialFlow();
    useMaterialFlowStore.getState().receiveGrainDelivery(1000);
    const flow = useMaterialFlowStore.getState();
    const delivered = [...flow.sourceLots.values()].find((lot) => lot.origin === 'receiving')!;
    useMaterialFlowStore.getState().tickMaterialFlow(1, 1);
    // A batch drawing on both an opening lot and the delivered lot.
    const [first] = useMaterialFlowStore.getState().productionBatches;
    useMaterialFlowStore.setState((state) => ({
      productionBatches: state.productionBatches.map((candidate) =>
        candidate.id === first.id
          ? {
              ...candidate,
              sourceContributions: [
                ...candidate.sourceContributions,
                { lotId: delivered.id, amount: 1, path: ['silo-4', 'packer-0'] },
              ],
            }
          : candidate
      ),
    }));
    render(<BatchGenealogySection />);
    fireEvent.click(row(first.id).getByRole('button', { name: 'Trace batch' }));
    const trace = () => within(screen.getByRole('region', { name: `Trace for ${first.id}` }));
    expect(trace().getAllByText(/Opening inventory/).length).toBeGreaterThan(0);
    expect(trace().getByText(/Scheduled farm intake/)).toBeInTheDocument();

    act(() => setLocale('pt-BR'));
    const traceBr = () => within(screen.getByRole('region', { name: `Rastreio de ${first.id}` }));
    expect(traceBr().queryAllByText(/Opening inventory/)).toHaveLength(0);
    expect(traceBr().getAllByText(/Estoque inicial/).length).toBeGreaterThan(0);
    expect(traceBr().getByText(/Recebimento programado da fazenda/)).toBeInTheDocument();
  });
});
