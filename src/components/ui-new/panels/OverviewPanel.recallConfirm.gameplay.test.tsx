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
  qualityScore: 98,
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

/**
 * Recall batch asks once before scrapping the batch. An ask the player walked
 * away from (they released the batch with a retest instead) must not come
 * back by itself: placing the batch on hold later showed the recall question
 * again, unasked, as an alert.
 */
describe('Overview recall confirmation', () => {
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

  it('is not shown again after the batch leaves hold and is held once more', () => {
    useMaterialFlowStore.setState({ productionBatches: [batch('b-1')], sourceLots: new Map() });
    useQCLabStore.setState((state) => ({
      qcLab: { ...state.qcLab, contaminationAlerts: [alert('contamination-00001', ['b-1'])] },
    }));
    render(<BatchGenealogySection />);

    fireEvent.click(row('b-1').getByRole('button', { name: 'Recall batch' }));
    expect(screen.getByRole('button', { name: 'Confirm recall' })).toBeTruthy();

    // The player retests instead of answering; the batch passes and is released.
    fireEvent.click(row('b-1').getByRole('button', { name: /Retest/ }));
    expect(
      useMaterialFlowStore.getState().productionBatches.find((candidate) => candidate.id === 'b-1')
        ?.disposition
    ).toBe('released');

    fireEvent.click(row('b-1').getByRole('button', { name: 'Place hold' }));
    expect(
      useMaterialFlowStore.getState().productionBatches.find((candidate) => candidate.id === 'b-1')
        ?.disposition
    ).toBe('hold');
    expect(screen.queryByRole('button', { name: 'Confirm recall' })).toBeNull();
  });
});
