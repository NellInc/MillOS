import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useMaterialFlowStore, type ProductionBatch } from '../../../stores/materialFlowStore';
import { BatchGenealogySection, GameSpeedControls } from './OverviewPanel';

// PLAYTEST-14: batch kilograms are grouped like every other mass in Overview.
describe('Overview batch masses are grouped', () => {
  const originalFlow = useMaterialFlowStore.getState();
  afterEach(() => {
    cleanup();
    useMaterialFlowStore.setState(originalFlow, true);
  });

  it('reads 1,250.0 kg, never 1250.0 kg, in the batch row and the recall question', () => {
    const batch: ProductionBatch = {
      id: 'big',
      disposition: 'hold',
      packerId: 'packer-1',
      materialType: 'flour',
      producedKg: 1250,
      availableKg: 1250,
      simulationTime: 1,
      sourceContributions: [],
      dispositionReason: null,
      qcTestIds: [],
      dispatchManifestIds: [],
      sealed: true,
    };
    useMaterialFlowStore.setState({ productionBatches: [batch], sourceLots: new Map() });
    render(<BatchGenealogySection />);
    expect(screen.getByText(/1,250\.0 kg available/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Recall batch' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/1,250\.0 kg/);
  });
});

// PLAYTEST-6: the quality controls pressed in Overview are the player's decisions.
describe('Overview batch controls record the decision', () => {
  const originalFlow = useMaterialFlowStore.getState();
  beforeEach(() => useOperationsCampaignStore.getState().resetCampaign());
  afterEach(() => {
    cleanup();
    useMaterialFlowStore.setState(originalFlow, true);
  });

  it('logs Test batch, Place hold, Retest and release and a confirmed recall', () => {
    const batch = (id: string): ProductionBatch => ({
      id,
      disposition: 'released',
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
    useMaterialFlowStore.setState({
      productionBatches: [batch('batch-0001')],
      sourceLots: new Map(),
    });
    render(<BatchGenealogySection />);
    fireEvent.click(screen.getByRole('button', { name: 'Test batch' }));
    fireEvent.click(screen.getByRole('button', { name: 'Place hold' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retest and release' }));
    fireEvent.click(screen.getByRole('button', { name: 'Place hold' }));
    fireEvent.click(screen.getByRole('button', { name: 'Recall batch' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm recall' }));
    expect(
      useOperationsCampaignStore
        .getState()
        .logbook.filter((entry) => entry.actor === 'operator')
        .map((entry) => entry.message)
    ).toEqual([
      'Tested BATCH-0001 in the lab.',
      'Put BATCH-0001 on quality hold.',
      'Retested BATCH-0001.',
      'Put BATCH-0001 on quality hold.',
      'Recalled BATCH-0001 and wrote it off.',
    ]);
  });
});

// PLAYTEST-6: a pace the player chooses in Overview is one of their decisions.
describe('Overview pace buttons record the pace the player chose', () => {
  beforeEach(() => {
    useOperationsCampaignStore.getState().resetCampaign();
    useGameSimulationStore.setState({ gameSpeed: 30, clockHolds: [] });
  });
  afterEach(() => {
    cleanup();
    useGameSimulationStore.setState({ gameSpeed: 30, clockHolds: [] });
  });

  const operatorLines = () =>
    useOperationsCampaignStore
      .getState()
      .logbook.filter((entry) => entry.actor === 'operator')
      .map((entry) => entry.message);

  it('logs a new pace as an operator decision', () => {
    render(<GameSpeedControls />);
    fireEvent.click(screen.getByRole('button', { name: 'Fast, 2x' }));
    expect(useGameSimulationStore.getState().gameSpeed).toBe(60);
    expect(operatorLines()).toEqual(['Set the shift pace to Fast, 2x.']);
  });

  it('logs nothing for a pause or for the pace already running', () => {
    render(<GameSpeedControls />);
    fireEvent.click(screen.getByRole('button', { name: 'Standard, 1x' }));
    fireEvent.click(screen.getByRole('button', { name: 'Paused, inspect freely' }));
    expect(operatorLines()).toEqual([]);
  });
});
