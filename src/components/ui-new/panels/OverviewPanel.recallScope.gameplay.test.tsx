import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useMaterialFlowStore, type ProductionBatch } from '../../../stores/materialFlowStore';
import { useQCLabStore, type ContaminationAlert } from '../../../stores/qcLabStore';
import { BatchGenealogySection } from './OverviewPanel';

const batch = (id: string): ProductionBatch => ({
  id,
  disposition: 'hold',
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

const alert = (id: string, batchIds: string[]): ContaminationAlert => ({
  id,
  type: 'contamination',
  severity: 'medium',
  timestamp: new Date(0),
  sourceLotIds: [],
  batchIds,
  controlNote: 'Quality investigation',
  resolved: false,
  resolution: null,
  resolvedAt: null,
});

const row = (id: string) => within(screen.getByText(id.toUpperCase()).closest('li')!);
const disposition = (id: string) =>
  useMaterialFlowStore.getState().productionBatches.find((candidate) => candidate.id === id)
    ?.disposition;

const recall = (id: string) => {
  fireEvent.click(row(id).getByRole('button', { name: 'Recall batch' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm recall' }));
};

// The confirmation says "this batch is written off": a recall pressed on one
// batch of a multi-batch investigation scraps that batch alone, and settles
// every open investigation that named it.
describe('Overview Recall batch writes off the batch it names', () => {
  const originalFlow = useMaterialFlowStore.getState();
  const originalQC = useQCLabStore.getState();

  beforeEach(() => {
    useQCLabStore.getState().resetQCLab();
  });

  afterEach(() => {
    cleanup();
    useMaterialFlowStore.setState(originalFlow, true);
    useQCLabStore.setState(originalQC, true);
  });

  it('leaves the other batches of a supplier investigation on hold', () => {
    useMaterialFlowStore.setState({
      productionBatches: ['b-1', 'b-2', 'b-3'].map(batch),
      sourceLots: new Map(),
    });
    useQCLabStore.setState((state) => ({
      qcLab: { ...state.qcLab, contaminationAlerts: [alert('supplier', ['b-1', 'b-2', 'b-3'])] },
    }));
    render(<BatchGenealogySection />);

    recall('b-2');

    expect(disposition('b-2')).toBe('recalled');
    expect(disposition('b-1')).toBe('hold');
    expect(disposition('b-3')).toBe('hold');
    const open = useQCLabStore.getState().qcLab.contaminationAlerts[0];
    expect(open.resolved).toBe(false);
    expect(open.batchIds).toEqual(['b-1', 'b-3']);
  });

  it('settles every open investigation that named the recalled batch', () => {
    useMaterialFlowStore.setState({
      productionBatches: [batch('b-1')],
      sourceLots: new Map(),
    });
    useQCLabStore.setState((state) => ({
      qcLab: {
        ...state.qcLab,
        contaminationAlerts: [alert('first', ['b-1']), alert('second', ['b-1'])],
      },
    }));
    render(<BatchGenealogySection />);

    recall('b-1');

    expect(disposition('b-1')).toBe('recalled');
    expect(
      useQCLabStore.getState().qcLab.contaminationAlerts.map((candidate) => candidate.resolved)
    ).toEqual([true, true]);
  });
});
