import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkplaceImprovementPanel } from './WorkplaceImprovementPanel';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { cloneMaterialFlowData, useMaterialFlowStore } from '../../../stores/materialFlowStore';
import { useProductionStore } from '../../../stores/productionStore';
import {
  FrozenPackingAdvice,
  HandoffEpisodes,
  MatchedPackingRehearsal,
} from './WorkplacePackingEvidence';
import { captureCurrentPackingPlant } from '../../../stores/workplaceStore';
import { derivePackingAdvice } from '../../../simulation/workplaceAdvice';
const report = vi.fn();
beforeEach(() => {
  useWorkplaceStore.setState({ workplace: createWorkplace() });
  useOperationsCampaignStore.setState({ orders: [], activeOrderId: null });
  report.mockReset();
  useGameSimulationStore.getState().setGameSpeed(0);
});
afterEach(cleanup);
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name, exact: true }));
const mount = () =>
  render(
    <WorkplaceImprovementPanel
      profile="cooperative"
      activate={async () => {
        useWorkplaceStore.getState().activate(useWorkplaceStore.getState().workplace.revision);
      }}
      busy={false}
      report={report}
    />
  );

describe('choice-first handoff interface', () => {
  it('places keyboard focus on the decision region when a shift opens', async () => {
    mount();
    click('Open the handoff experiment');
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('region', { name: 'Handoff experiment' })
      )
    );
  });
  it('keeps unavailable stock and clocks out of the known-fact and smaller-delivery claims', () => {
    useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
    useOperationsCampaignStore.getState().initializeCampaign();
    const store = useWorkplaceStore.getState();
    store.beginImprovement('cooperative', store.workplace.revision);
    expect(useWorkplaceStore.getState().workplace.improvement!.mission).toBeDefined();
    useOperationsCampaignStore.setState({ orders: [], activeOrderId: null });
    store.setImprovementEpisode('late-truck');
    store.respondImprovementEpisode('packing', 'smaller-delivery');
    store.proposeImprovement('buffer', 'maintenance');
    store.acknowledgeImprovement();
    const state = useWorkplaceStore.getState().workplace;
    const advice = derivePackingAdvice(captureCurrentPackingPlant(state), 'buffer');
    expect(advice.reasonToAbstain).toBeTruthy();
    render(
      <>
        <FrozenPackingAdvice advice={advice} />
        <HandoffEpisodes state={state} report={report} />
      </>
    );
    expect(screen.queryByText(/0 kg released/)).not.toBeInTheDocument();
    expect(screen.queryByText('Captured material clock:')).not.toBeInTheDocument();
    expect(
      screen.getByText(/once released stock and the remaining commitment are known/)
    ).toBeInTheDocument();
  });
  it('automatically marks a paused comparison stale after a production setpoint change', async () => {
    const state = createWorkplace();
    render(<MatchedPackingRehearsal state={state} report={report} />);
    click('Run matched packing rehearsal');
    await waitFor(() =>
      expect(screen.getByLabelText('Matched packing results')).toBeInTheDocument()
    );
    act(() => useProductionStore.getState().setProductionSpeed(0.57));
    expect(
      screen.getByText('Inputs changed. This comparison is stale; capture again before using it.')
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Matched packing results')).not.toBeInTheDocument();
  });
  it('automatically marks a paused comparison stale after a real batch hold', async () => {
    const material = useMaterialFlowStore.getState();
    material.syncMachineProcessing(
      [...material.machineBuffers.keys()].map((id) => ({ id, status: 'running' }))
    );
    for (let i = 0; i < 120; i++) material.tickMaterialFlow(0.5, 1);
    const batch = useMaterialFlowStore.getState().productionBatches[0];
    expect(batch).toBeDefined();
    render(<MatchedPackingRehearsal state={createWorkplace()} report={report} />);
    click('Run matched packing rehearsal');
    await waitFor(() =>
      expect(screen.getByLabelText('Matched packing results')).toBeInTheDocument()
    );
    const buffers = useMaterialFlowStore.getState().machineBuffers;
    act(() =>
      useMaterialFlowStore.getState().setBatchDisposition([batch.id], 'hold', 'Paused quality hold')
    );
    expect(useMaterialFlowStore.getState().machineBuffers).toBe(buffers);
    expect(
      screen.getByText('Inputs changed. This comparison is stale; capture again before using it.')
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Matched packing results')).not.toBeInTheDocument();
  });
  it('offers three labelled planning episodes and an isolated, explicitly abstaining matched comparison', async () => {
    mount();
    click('Open the handoff experiment');
    const before = cloneMaterialFlowData(useMaterialFlowStore.getState());
    for (const id of ['late-truck', 'quality-hold', 'tight-cash']) {
      fireEvent.change(screen.getByLabelText('Pressure episode'), { target: { value: id } });
      click('Decline extra duty');
      expect(screen.getByRole('status')).toHaveTextContent('Extra duty is declined');
      expect(
        useWorkplaceStore.getState().workplace.members.every((m) => m.ballot === null && !m.sharing)
      ).toBe(true);
    }
    click('Maintenance proposes a small packing buffer');
    click('Hear the adviser response');
    expect(screen.getByText('The adviser abstains from a forecast')).toBeInTheDocument();
    click('Run matched packing rehearsal');
    await waitFor(() =>
      expect(screen.getByLabelText('Matched packing results')).toBeInTheDocument()
    );
    expect(
      screen.getByLabelText('Matched packing results').textContent?.match(/abstained/g)
    ).toHaveLength(3);
    expect(cloneMaterialFlowData(useMaterialFlowStore.getState())).toEqual(before);
    act(() => useGameSimulationStore.getState().setGameSpeed(180));
    expect(
      screen.getByText('Inputs changed. This comparison is stale; capture again before using it.')
    ).toBeInTheDocument();
  });
  it('offers canonical worker ideas, public challenge and individual decisions before execution', () => {
    mount();
    expect(screen.getByRole('combobox', { name: 'Handoff governance', exact: true })).toBeEnabled();
    expect(screen.getByRole('combobox', { name: 'Handoff mode', exact: true })).toBeEnabled();
    click('Open the handoff experiment');
    click('Maintenance proposes a small packing buffer');
    expect(screen.getByText('Selected for this trial.')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Challenge author', exact: true })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Approve and run handoff trial' })).toBeDisabled();
    click('Challenge this proposal');
    expect(screen.getByText(/Quality challenged forecast/)).toBeInTheDocument();
    click('Hear the adviser response');
    for (const role of ['Packing', 'Quality', 'Maintenance', 'Coordinator']) {
      click(`Confirm handoff understanding: ${role}`);
      click(`${role === 'Quality' ? 'Decline' : 'Approve'} handoff: ${role}`);
    }
    expect(screen.getByRole('button', { name: 'Approve and run handoff trial' })).toBeEnabled();
    expect(
      screen.getByText('Policy ballot: declined. Ordinary pay is unchanged.')
    ).toBeInTheDocument();
    expect(screen.getAllByText('Policy ballot: approved.')).toHaveLength(3);
    expect(useWorkplaceStore.getState().workplace.members.every((m) => !m.sharing)).toBe(true);
  });
  it('exposes all review endings and retains real pay when the next shift opens', () => {
    const store = useWorkplaceStore.getState();
    store.beginImprovement('team', store.workplace.revision);
    store.proposeImprovement('briefing', 'packing');
    store.acknowledgeImprovement();
    for (const m of useWorkplaceStore.getState().workplace.members) {
      store.understand(m.id);
      store.vote(m.id, true);
    }
    store.activate(useWorkplaceStore.getState().workplace.revision);
    store.tick(90, 500, false);
    mount();
    click('Hear the adviser review its forecast');
    for (const role of ['Packing', 'Quality', 'Maintenance', 'Coordinator'])
      fireEvent.change(screen.getByLabelText(`${role} review decision`), {
        target: { value: 'amend' },
      });
    click('Finalise handoff review');
    expect(screen.getByText(/Review recorded: amend/)).toBeInTheDocument();
    click('Open next handoff shift');
    expect(screen.getByText('The handoff experiment, shift 2')).toBeInTheDocument();
    expect(screen.getByText(/Retained earned pay/)).toBeInTheDocument();
    expect(
      useWorkplaceStore.getState().workplace.improvement?.history[0].snapshot.finance.wagesPaid
    ).toBe(108);
    act(() => store.stop());
  });
});
