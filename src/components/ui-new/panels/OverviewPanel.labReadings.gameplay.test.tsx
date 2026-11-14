import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  useMaterialFlowStore,
  type ProductionBatch,
  type SourceLot,
} from '../../../stores/materialFlowStore';
import { useQCLabStore } from '../../../stores/qcLabStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import type { CropAttributes } from '../../../chronicle/types';
import { BatchGenealogySection } from './OverviewPanel';

const lot = (id: string, crop?: CropAttributes): SourceLot => ({
  id,
  materialType: 'wheat_grain',
  origin: 'receiving',
  sourceManifestId: null,
  supplier: 'Test farm',
  receivedKg: 1000,
  simulationTime: 0,
  disposition: 'released',
  dispositionReason: null,
  ...(crop ? { crop } : {}),
});

const batch = (id: string, lotId: string, qualityScore?: number): ProductionBatch => ({
  id,
  disposition: 'released',
  packerId: 'packer-1',
  materialType: 'flour',
  producedKg: 50,
  availableKg: 50,
  simulationTime: 1,
  sourceContributions: [{ lotId, amount: 50, path: ['silo-1', 'packer-1'] }],
  dispositionReason: null,
  qcTestIds: [],
  dispatchManifestIds: [],
  sealed: true,
  ...(qualityScore !== undefined ? { qualityScore } : {}),
});

// A sprouted crop year (260 +/- 30 s): this lot was stamped low.
const SPROUTED: CropAttributes = {
  cropYear: 2,
  kind: 'sprouted',
  moisturePct: 13.6,
  proteinPct: 11.4,
  fallingNumberS: 232,
};

const row = (id: string) => within(screen.getByText(id.toUpperCase()).closest('li')!);

describe('the QC lab shows what it measures', () => {
  const originalFlow = useMaterialFlowStore.getState();
  const originalQC = useQCLabStore.getState();

  beforeEach(() => {
    useQCLabStore.getState().resetQCLab();
    useOperationsCampaignStore.getState().resetCampaign();
  });
  afterEach(() => {
    cleanup();
    useMaterialFlowStore.setState(originalFlow, true);
    useQCLabStore.setState(originalQC, true);
  });

  it('records and shows a sprouted-year falling number under 250, beside the order limit', () => {
    useMaterialFlowStore.setState({
      productionBatches: [batch('batch-0001', 'lot-sprouted', 93)],
      sourceLots: new Map([['lot-sprouted', lot('lot-sprouted', SPROUTED)]]),
    });
    render(<BatchGenealogySection />);
    fireEvent.click(row('batch-0001').getByRole('button', { name: 'Test batch' }));

    const result = useQCLabStore.getState().qcLab.testHistory.at(-1)!;
    expect(result.fallingNumber).toBe(232);
    expect(result.fallingNumber!).toBeLessThan(250);

    const shown = within(screen.getByRole('group', { name: `Lab result ${result.id}` }));
    expect(shown.getByText('Falling number 232 s')).toBeInTheDocument();
    expect(shown.getByText('Moisture 13.6%')).toBeInTheDocument();
    expect(shown.getByText('Protein 11.4%')).toBeInTheDocument();
    // The one limit the game has: the serving order's minimum quality, as its
    // own readout beside the quality (pt-BR read "99,3, Farinha" as one list).
    expect(shown.getByText('Quality 93.0')).toBeInTheDocument();
    expect(shown.getByText('Strong white bread flour minimum 95')).toBeInTheDocument();
  });

  it('shows the long-standing readings, and no falling number, for unstamped lots', () => {
    useMaterialFlowStore.setState({
      productionBatches: [batch('batch-0002', 'lot-plain', 97)],
      sourceLots: new Map([['lot-plain', lot('lot-plain')]]),
    });
    render(<BatchGenealogySection />);
    fireEvent.click(row('batch-0002').getByRole('button', { name: 'Test batch' }));

    const result = useQCLabStore.getState().qcLab.testHistory.at(-1)!;
    expect('fallingNumber' in result).toBe(false);
    const shown = within(screen.getByRole('group', { name: `Lab result ${result.id}` }));
    expect(shown.getByText('Moisture 13.2%')).toBeInTheDocument();
    expect(shown.getByText('Protein 11.8%')).toBeInTheDocument();
    // No falling number is read without a stamped crop year, so none is shown.
    expect(shown.queryByText(/Falling number/)).toBeNull();
  });

  it('shows the three readings on each source lot in the trace', () => {
    useMaterialFlowStore.setState({
      productionBatches: [batch('batch-0003', 'lot-sprouted', 93)],
      sourceLots: new Map([['lot-sprouted', lot('lot-sprouted', SPROUTED)]]),
    });
    render(<BatchGenealogySection />);
    fireEvent.click(row('batch-0003').getByRole('button', { name: 'Trace batch' }));
    const trace = within(screen.getByRole('region', { name: 'Trace for batch-0003' }));
    expect(trace.getByText('Moisture 13.6%')).toBeInTheDocument();
    expect(trace.getByText('Protein 11.4%')).toBeInTheDocument();
    expect(trace.getByText('Falling number 232 s')).toBeInTheDocument();
  });
});

// Every lab control in Overview is pressed by the player, so the lab's own
// records name the operator, in the campaign logbook's word for one.
describe('player lab actions are attributed to the operator', () => {
  const originalFlow = useMaterialFlowStore.getState();
  const originalQC = useQCLabStore.getState();

  beforeEach(() => {
    useQCLabStore.getState().resetQCLab();
    useOperationsCampaignStore.getState().resetCampaign();
  });
  afterEach(() => {
    cleanup();
    useMaterialFlowStore.setState(originalFlow, true);
    useQCLabStore.setState(originalQC, true);
  });

  it('test, hold, retest and recall all record the operator as their source', () => {
    useMaterialFlowStore.setState({
      productionBatches: [batch('batch-0004', 'lot-plain', 97)],
      sourceLots: new Map([['lot-plain', lot('lot-plain')]]),
    });
    render(<BatchGenealogySection />);
    fireEvent.click(screen.getByRole('button', { name: 'Test batch' }));
    fireEvent.click(screen.getByRole('button', { name: 'Place hold' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retest and release' }));
    fireEvent.click(screen.getByRole('button', { name: 'Place hold' }));
    fireEvent.click(screen.getByRole('button', { name: 'Recall batch' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm recall' }));

    const { testHistory, dispositionHistory } = useQCLabStore.getState().qcLab;
    expect(testHistory.map((test) => test.testType)).toEqual(['initial', 'retest']);
    expect(dispositionHistory.map((record) => record.action)).toEqual([
      'test',
      'hold',
      'retest',
      'release',
      'hold',
      'recall',
    ]);
    expect(new Set(testHistory.map((test) => test.controlSource))).toEqual(new Set(['Operator']));
    expect(new Set(dispositionHistory.map((record) => record.controlSource))).toEqual(
      new Set(['Operator'])
    );
  });
});
