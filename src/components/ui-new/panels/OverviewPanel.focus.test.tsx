import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useMaterialFlowStore, type ProductionBatch } from '../../../stores/materialFlowStore';
import { useQCLabStore, type ContaminationAlert } from '../../../stores/qcLabStore';
import { setLocale } from '../../../i18n';
import { BatchGenealogySection } from './OverviewPanel';

// Keyboard operability of the batch actions: an action that removes its own
// button must not drop focus to the page, and an open trace must stay closable.

const batch = (
  id: string,
  disposition: ProductionBatch['disposition'],
  qualityScore = 99
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

/** Focus a control and activate it the way a keyboard user does. */
const press = (element: HTMLElement) => {
  element.focus();
  fireEvent.click(element);
};

describe('Overview batch actions keep keyboard focus', () => {
  const originalFlow = useMaterialFlowStore.getState();
  const originalQC = useQCLabStore.getState();

  beforeEach(() => {
    setLocale('en');
    useMaterialFlowStore.setState({ productionBatches: [], sourceLots: new Map() });
    useQCLabStore.getState().resetQCLab();
  });

  afterEach(() => {
    cleanup();
    useMaterialFlowStore.setState(originalFlow, true);
    useQCLabStore.setState(originalQC, true);
  });

  const holdWithAlert = (id: string, quality = 99) => {
    useMaterialFlowStore.setState({ productionBatches: [batch(id, 'hold', quality)] });
    useQCLabStore.setState((state) => ({
      qcLab: { ...state.qcLab, contaminationAlerts: [alert(id)] },
    }));
  };

  it('moves focus to Confirm recall when the confirmation opens', () => {
    holdWithAlert('held');
    render(<BatchGenealogySection />);
    press(row('held').getByRole('button', { name: 'Recall batch' }));
    expect(document.activeElement).toBe(
      row('held').getByRole('button', { name: 'Confirm recall' })
    );
  });

  it('returns focus to Recall batch when the confirmation is cancelled', () => {
    holdWithAlert('held');
    render(<BatchGenealogySection />);
    press(row('held').getByRole('button', { name: 'Recall batch' }));
    press(row('held').getByRole('button', { name: 'Cancel' }));
    expect(document.activeElement).toBe(row('held').getByRole('button', { name: 'Recall batch' }));
  });

  it('lands on the batch trace after a confirmed recall', () => {
    holdWithAlert('held');
    render(<BatchGenealogySection />);
    press(row('held').getByRole('button', { name: 'Recall batch' }));
    press(row('held').getByRole('button', { name: 'Confirm recall' }));
    expect(useMaterialFlowStore.getState().productionBatches[0].disposition).toBe('recalled');
    expect(document.activeElement).toBe(row('held').getByRole('button', { name: 'Trace batch' }));
  });

  it('lands on the batch trace after a passing retest releases it', () => {
    holdWithAlert('held');
    render(<BatchGenealogySection />);
    press(row('held').getByRole('button', { name: 'Retest and release' }));
    expect(useMaterialFlowStore.getState().productionBatches[0].disposition).toBe('released');
    expect(document.activeElement).toBe(row('held').getByRole('button', { name: 'Trace batch' }));
  });

  it('lands on the batch trace after placing a hold', () => {
    useMaterialFlowStore.setState({ productionBatches: [batch('fresh', 'released')] });
    render(<BatchGenealogySection />);
    press(row('fresh').getByRole('button', { name: 'Place hold' }));
    expect(useMaterialFlowStore.getState().productionBatches[0].disposition).toBe('hold');
    expect(document.activeElement).toBe(row('fresh').getByRole('button', { name: 'Trace batch' }));
  });

  it('closes an open trace once its batch leaves the list', () => {
    useMaterialFlowStore.setState({ productionBatches: [batch('old', 'released')] });
    render(<BatchGenealogySection />);
    fireEvent.click(row('old').getByRole('button', { name: 'Trace batch' }));
    expect(screen.getByRole('region', { name: 'Trace for old' })).toBeInTheDocument();
    // Four newer batches push it off the recent list, taking Hide trace with it.
    act(() => {
      useMaterialFlowStore.setState({
        productionBatches: [
          batch('old', 'released'),
          ...['n1', 'n2', 'n3', 'n4'].map((id) => batch(id, 'released')),
        ],
      });
    });
    expect(screen.queryByText('OLD')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Trace for old' })).toBeNull();
  });
});
