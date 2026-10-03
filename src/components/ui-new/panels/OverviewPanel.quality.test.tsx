import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useMaterialFlowStore, type ProductionBatch } from '../../../stores/materialFlowStore';
import { useQCLabStore, type ContaminationAlert } from '../../../stores/qcLabStore';
import { BatchGenealogySection } from './OverviewPanel';

const batch = (
  id: string,
  disposition: ProductionBatch['disposition'] = 'released'
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
const rowIds = () => screen.getAllByRole('listitem').map((item) => item.textContent?.split(',')[0]);

describe('Overview batch quality recovery', () => {
  const originalFlow = useMaterialFlowStore.getState();
  const originalQC = useQCLabStore.getState();

  beforeEach(() => {
    useMaterialFlowStore.setState({ productionBatches: [], sourceLots: new Map() });
    useQCLabStore.getState().resetQCLab();
  });

  afterEach(() => {
    cleanup();
    useMaterialFlowStore.setState(originalFlow, true);
    useQCLabStore.setState(originalQC, true);
  });

  it('keeps old held batches and investigations ahead of recent output after live production', () => {
    useMaterialFlowStore.setState({
      productionBatches: [batch('old-held', 'hold'), batch('old-alert'), batch('recent-1')],
    });
    useQCLabStore.setState((state) => ({
      qcLab: { ...state.qcLab, contaminationAlerts: [alert('old-alert')] },
    }));
    render(<BatchGenealogySection />);

    act(() => {
      useMaterialFlowStore.setState((state) => ({
        productionBatches: [
          ...state.productionBatches,
          ...[2, 3, 4, 5, 6].map((index) => batch(`recent-${index}`)),
        ],
      }));
    });

    expect(row('old-held').getByRole('button', { name: 'Retest and release' })).toBeEnabled();
    expect(row('old-held').getByRole('button', { name: 'Recall batch' })).toBeEnabled();
    expect(row('old-alert').getByRole('status')).toHaveTextContent('Investigation active');
    expect(screen.getAllByRole('listitem')).toHaveLength(6);
    expect(rowIds()[0]).toContain('OLD-ALERT');
    expect(rowIds()[1]).toContain('OLD-HELD');
    expect(screen.queryByText('RECENT-2')).not.toBeInTheDocument();
    fireEvent.click(row('old-held').getByRole('button', { name: 'Trace batch' }));
    expect(screen.getByRole('region', { name: 'Trace for old-held' })).toBeInTheDocument();
    fireEvent.click(row('old-held').getByRole('button', { name: 'Retest and release' }));
    expect(useMaterialFlowStore.getState().productionBatches[0].disposition).toBe('released');
  });

  it('reacts to alert creation and resolution without new production', () => {
    useMaterialFlowStore.setState({
      productionBatches: [batch('old'), ...[1, 2, 3, 4].map((index) => batch(`recent-${index}`))],
    });
    render(<BatchGenealogySection />);
    expect(screen.queryByText('OLD')).not.toBeInTheDocument();

    act(() => {
      useQCLabStore.setState((state) => ({
        qcLab: { ...state.qcLab, contaminationAlerts: [alert('old')] },
      }));
    });
    expect(row('old').getByRole('status')).toHaveTextContent('Investigation active');
    expect(screen.getAllByRole('listitem')).toHaveLength(5);

    act(() => {
      useQCLabStore.setState((state) => ({
        qcLab: {
          ...state.qcLab,
          contaminationAlerts: [{ ...alert('old'), resolved: true, resolution: 'released' }],
        },
      }));
    });
    expect(screen.queryByText('OLD')).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
  });

  it('retains every held batch without duplicating recent actionable batches', () => {
    useMaterialFlowStore.setState({
      productionBatches: [
        ...[1, 2, 3, 4, 5, 6].map((index) => batch(`held-${index}`, 'hold')),
        batch('recent'),
      ],
    });
    render(<BatchGenealogySection />);

    expect(screen.getAllByRole('button', { name: 'Retest and release' })).toHaveLength(6);
    expect(screen.getAllByRole('listitem')).toHaveLength(7);
    expect(screen.getAllByText('HELD-6')).toHaveLength(1);
  });

  it('bounds resolved release history to the latest four batches', () => {
    useMaterialFlowStore.setState({
      productionBatches: [1, 2, 3, 4, 5, 6].map((index) => batch(`released-${index}`)),
    });
    render(<BatchGenealogySection />);

    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    expect(screen.queryByText('RELEASED-2')).not.toBeInTheDocument();
    expect(rowIds()[0]).toContain('RELEASED-6');
  });

  it('preserves terminal dispositions and never offers their retest or release controls', () => {
    useMaterialFlowStore.setState({
      productionBatches: [batch('recalled', 'recalled'), batch('shipped', 'shipped')],
    });
    useQCLabStore.setState((state) => ({
      qcLab: { ...state.qcLab, contaminationAlerts: [alert('recalled')] },
    }));
    render(<BatchGenealogySection />);

    for (const id of ['recalled', 'shipped']) {
      expect(row(id).getByRole('button', { name: 'Trace batch' })).toBeEnabled();
      expect(row(id).queryByRole('button', { name: 'Retest and release' })).not.toBeInTheDocument();
      expect(row(id).queryByRole('button', { name: 'Test batch' })).not.toBeInTheDocument();
      expect(row(id).queryByRole('button', { name: 'Place hold' })).not.toBeInTheDocument();
    }
    expect(useMaterialFlowStore.getState().productionBatches[0].disposition).toBe('recalled');
  });
});
