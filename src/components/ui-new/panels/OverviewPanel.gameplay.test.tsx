import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useMaterialFlowStore, type ProductionBatch } from '../../../stores/materialFlowStore';
import { useQCLabStore, type ContaminationAlert } from '../../../stores/qcLabStore';
import { setLocale } from '../../../i18n';
import { BatchGenealogySection } from './OverviewPanel';

const batch = (
  id: string,
  disposition: ProductionBatch['disposition'],
  qualityScore: number
): ProductionBatch => ({
  id,
  disposition,
  packerId: 'packer-1',
  materialType: 'flour',
  producedKg: 50,
  availableKg: 50,
  simulationTime: 1,
  sourceContributions: [],
  dispositionReason: null,
  qcTestIds: [],
  dispatchManifestIds: [],
  sealed: true,
  qualityScore,
});

const alert = (batchId: string): ContaminationAlert => ({
  id: `alert-${batchId}`,
  type: 'contamination',
  severity: 'medium',
  timestamp: new Date(0),
  sourceLotIds: [],
  batchIds: [batchId],
  controlNote: 'Quality investigation',
  resolved: false,
  resolution: null,
  resolvedAt: null,
});

const row = (id: string) => within(screen.getByText(id.toUpperCase()).closest('li')!);
const disposition = (id: string) =>
  useMaterialFlowStore.getState().productionBatches.find((candidate) => candidate.id === id)
    ?.disposition;

describe('Overview batch genealogy gameplay', () => {
  const originalFlow = useMaterialFlowStore.getState();
  const originalQC = useQCLabStore.getState();

  beforeEach(() => {
    setLocale('en');
    useMaterialFlowStore.setState({ productionBatches: [], sourceLots: new Map() });
    useQCLabStore.getState().resetQCLab();
  });

  afterEach(() => {
    cleanup();
    setLocale('en');
    useMaterialFlowStore.setState(originalFlow, true);
    useQCLabStore.setState(originalQC, true);
  });

  it('keeps a held batch on hold when its retest fails', () => {
    useMaterialFlowStore.setState({ productionBatches: [batch('held-bad', 'hold', 60)] });
    useQCLabStore.setState((state) => ({
      qcLab: { ...state.qcLab, contaminationAlerts: [alert('held-bad')] },
    }));
    render(<BatchGenealogySection />);

    fireEvent.click(row('held-bad').getByRole('button', { name: 'Retest and release' }));

    expect(useQCLabStore.getState().qcLab.testHistory.at(-1)?.grade).toBe('FAIL');
    expect(disposition('held-bad')).toBe('hold');
    expect(useQCLabStore.getState().qcLab.contaminationAlerts[0].resolved).toBe(false);
    expect(useQCLabStore.getState().qcLab.dispositionHistory.at(-1)?.note).not.toMatch(
      /conforming/i
    );
    // The way out is still offered.
    expect(row('held-bad').getByRole('button', { name: 'Recall batch' })).toBeEnabled();
  });

  it('still releases a held batch whose retest passes', () => {
    useMaterialFlowStore.setState({ productionBatches: [batch('held-good', 'hold', 97)] });
    useQCLabStore.setState((state) => ({
      qcLab: { ...state.qcLab, contaminationAlerts: [alert('held-good')] },
    }));
    render(<BatchGenealogySection />);

    fireEvent.click(row('held-good').getByRole('button', { name: 'Retest and release' }));

    expect(disposition('held-good')).toBe('released');
    expect(useQCLabStore.getState().qcLab.contaminationAlerts[0].resolved).toBe(true);
  });

  it('counts one source lot and one batch in the singular', () => {
    useMaterialFlowStore.setState({
      productionBatches: [batch('only', 'released', 99)],
      sourceLots: new Map([['lot-1', {} as never]]),
    });
    render(<BatchGenealogySection />);
    expect(screen.getByText('1 source lot, 1 production batch')).toBeInTheDocument();
  });

  it('shows a balance that rounds to zero without a doubled sign', () => {
    setLocale('pt-BR');
    useMaterialFlowStore.setState({
      getGenealogyBalance: () =>
        ({ errorKg: -0.001 }) as ReturnType<
          ReturnType<typeof useMaterialFlowStore.getState>['getGenealogyBalance']
        >,
    });
    render(<BatchGenealogySection />);
    expect(screen.getByText('Genealogia +0,00 kg')).toBeInTheDocument();
  });

  it('keeps the plural for more than one', () => {
    useMaterialFlowStore.setState({
      productionBatches: [batch('a', 'released', 99), batch('b', 'released', 99)],
      sourceLots: new Map([
        ['lot-1', {} as never],
        ['lot-2', {} as never],
      ]),
    });
    render(<BatchGenealogySection />);
    expect(screen.getByText('2 source lots, 2 production batches')).toBeInTheDocument();
    cleanup();
    setLocale('pt-BR');
    useMaterialFlowStore.setState({
      productionBatches: [batch('only', 'released', 99)],
      sourceLots: new Map([['lot-1', {} as never]]),
    });
    render(<BatchGenealogySection />);
    expect(screen.getByText('1 lote de origem, 1 lote de produção')).toBeInTheDocument();
  });
});
