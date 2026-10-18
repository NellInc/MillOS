import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCameraStore, CAMERA_PRESETS } from '../../CameraController';
import { WorkplaceImprovementPanel } from './WorkplaceImprovementPanel';
import { WorkplaceParticipation } from './WorkplaceParticipation';
import { turnChecks, type RoleCommand } from '../../../simulation/workplaceParticipation';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { cloneMaterialFlowData, useMaterialFlowStore } from '../../../stores/materialFlowStore';
import { useQCLabStore } from '../../../stores/qcLabStore';
import { useTruckScheduleStore } from '../../../stores/truckScheduleStore';
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
  useWorkplaceStore.setState({
    workplace: createWorkplace(),
    participationMode: 'solo',
    turn: null,
  });
  useOperationsCampaignStore.setState({ orders: [], activeOrderId: null });
  report.mockReset();
  useGameSimulationStore.getState().setGameSpeed(0);
});
afterEach(cleanup);
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name, exact: true }));
const mount = (participation = false) =>
  render(
    <>
      {participation && <WorkplaceParticipation report={report} />}
      <WorkplaceImprovementPanel
        profile="cooperative"
        activate={async () => {
          useWorkplaceStore.getState().activate(useWorkplaceStore.getState().workplace.revision);
        }}
        busy={false}
        report={report}
      />
    </>
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
    useProductionStore.getState().setProductionSpeed(1);
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

describe('predict then rehearse together', () => {
  it('freezes the optional prediction, refuses a false verdict on abstention and resets only the comparison', async () => {
    const state = useWorkplaceStore.getState().workplace;
    const stock = cloneMaterialFlowData(useMaterialFlowStore.getState());
    const speed = useGameSimulationStore.getState().gameSpeed;
    render(<MatchedPackingRehearsal state={state} report={report} />);
    const prediction = screen.getByRole('combobox', {
      name: 'Our packing prediction (optional)',
      exact: true,
    });
    expect(prediction).toHaveValue('');
    fireEvent.change(prediction, { target: { value: 'higher' } });
    click('Run matched packing rehearsal');
    await waitFor(() => expect(prediction).toBeDisabled());
    const review = await screen.findByRole('region', { name: 'Packing prediction review' });
    expect(
      within(review).getByText(/Our prediction: Buffer range entirely above/)
    ).toBeInTheDocument();
    expect(within(review).getByText(/insufficient matching evidence/)).toBeInTheDocument();
    expect(within(review).queryByText(/support our prediction/)).not.toBeInTheDocument();
    expect(
      within(review).getByText(/More packed stock does not establish a truck departure/)
    ).toBeInTheDocument();
    click('Prepare another prediction');
    expect(
      screen.queryByRole('region', { name: 'Packing prediction review' })
    ).not.toBeInTheDocument();
    expect(prediction).toBeEnabled();
    expect(prediction).toHaveValue('');
    await waitFor(() => expect(prediction).toHaveFocus());
    expect(useWorkplaceStore.getState().workplace).toBe(state);
    expect(cloneMaterialFlowData(useMaterialFlowStore.getState())).toEqual(stock);
    expect(useGameSimulationStore.getState().gameSpeed).toBe(speed);
    expect(report).not.toHaveBeenCalled();
  });

  it('allows a skipped prediction and suppresses all learning conclusions when inputs change', async () => {
    render(<MatchedPackingRehearsal state={createWorkplace()} report={report} />);
    click('Run matched packing rehearsal');
    const review = await screen.findByRole('region', { name: 'Packing prediction review' });
    expect(within(review).getByText(/none recorded for this run/)).toBeInTheDocument();
    act(() => useGameSimulationStore.getState().setGameSpeed(30));
    expect(
      screen.queryByRole('region', { name: 'Packing prediction review' })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('comparison is stale');
  });
});

it('shows proposal and episode controls only to their current owner in separate turns', () => {
  const store = useWorkplaceStore.getState();
  store.setParticipationMode('separate-turns');
  store.beginImprovement('cooperative', store.workplace.revision, undefined, 'workshop');
  mount();
  const packing = screen.getByRole('button', { name: 'Packing proposes a paid handoff briefing' });
  const maintenance = screen.getByRole('button', {
    name: 'Maintenance proposes a small packing buffer',
  });
  expect(packing).toBeDisabled();
  expect(maintenance).toBeDisabled();
  expect(screen.getByLabelText('Pressure episode')).toBeEnabled();
  act(() => useWorkplaceStore.getState().startTurn('packing'));
  expect(packing).toBeEnabled();
  expect(maintenance).toBeDisabled();
  expect(screen.getByLabelText('Pressure episode')).toBeDisabled();
  click('Packing proposes a paid handoff briefing');
  expect(useWorkplaceStore.getState().turn).toBeNull();
  expect(screen.getByRole('button', { name: 'Hear the adviser response' })).toBeDisabled();
  expect(screen.getByLabelText('Challenge author')).toBeDisabled();
  expect(screen.getByLabelText('Challenge author')).toHaveValue('');
});

it('requires the adviser checks, then keeps understanding, policy choice and handover deliberate', async () => {
  const get = () => useWorkplaceStore.getState();
  get().setParticipationMode('separate-turns');
  get().beginImprovement('cooperative', get().workplace.revision, undefined, 'workshop');
  get().startTurn('maintenance');
  get().runTurnCommand(get().turn!.token, {
    type: 'proposeImprovement',
    args: ['buffer', 'maintenance'],
  });
  get().startTurn('mind');
  mount(true);
  expect(screen.getByRole('button', { name: 'Hear the adviser response' })).toBeDisabled();
  for (const q of turnChecks(get().workplace))
    fireEvent.change(screen.getByLabelText(`Turn check: ${q.id}`), {
      target: { value: q.correct },
    });
  expect(screen.getByRole('button', { name: 'Hear the adviser response' })).toBeEnabled();
  click('Hear the adviser response');
  expect(get().turn).toBeNull();
  fireEvent.change(screen.getByLabelText('Hand over to fictional role'), {
    target: { value: 'packing' },
  });
  click('Begin participant turn');
  await waitFor(() => expect(screen.getByText(/Only Packing may/)).toHaveFocus());
  const understand = screen.getByRole('button', { name: 'Confirm handoff understanding: Packing' });
  const approve = screen.getByRole('button', { name: 'Approve handoff: Packing' });
  expect(understand).toBeDisabled();
  const finance = structuredClone(get().workplace.finance);
  for (const q of turnChecks(get().workplace))
    fireEvent.change(screen.getByLabelText(`Turn check: ${q.id}`), {
      target: { value: q.correct },
    });
  expect(
    get().workplace.members.every((member) => !member.understood && member.ballot === null)
  ).toBe(true);
  expect(understand).toBeEnabled();
  expect(approve).toBeDisabled();
  click('Confirm handoff understanding: Packing');
  expect(approve).toBeEnabled();
  click('Decline handoff: Packing');
  expect(get().workplace.members.find((member) => member.id === 'packing')?.ballot).toBe(false);
  expect(
    get()
      .workplace.members.filter((member) => member.id !== 'packing')
      .every((member) => member.ballot === null)
  ).toBe(true);
  expect(get().workplace.finance).toEqual(finance);
  click('End participant turn');
  await waitFor(() => expect(screen.getByLabelText('Hand over to fictional role')).toHaveFocus());
});

it('keeps review ballots with each owner and final settlement with the facilitator', () => {
  const get = () => useWorkplaceStore.getState();
  get().setParticipationMode('separate-turns');
  get().beginImprovement('cooperative', get().workplace.revision, undefined, 'workshop');
  const command = (actor: string, action: RoleCommand) => {
    get().startTurn(actor);
    if (get().workplace.phase === 'deliberating')
      for (const q of turnChecks(get().workplace))
        get().answerTurnCheck(get().turn!.token, q.id, q.correct);
    expect(get().runTurnCommand(get().turn!.token, action).changed).toBe(true);
    get().endTurn();
  };
  command('maintenance', { type: 'proposeImprovement', args: ['buffer', 'maintenance'] });
  command('mind', { type: 'acknowledgeImprovement', args: [] });
  get().stop();
  command('mind', { type: 'acknowledgeImprovementReview', args: [] });
  get().startTurn('packing');
  mount();
  for (const member of get().workplace.members) {
    const select = screen.getByLabelText(`${member.role} review decision`);
    if (member.id !== 'packing') {
      expect(select).toBeDisabled();
      act(() => get().startTurn(member.id));
    }
    expect(select).toBeEnabled();
    fireEvent.change(select, { target: { value: 'amend' } });
    expect(get().turn).toBeNull();
    expect(get().workplace.improvement?.ballots[member.id]).toBe('amend');
  }
  const settle = screen.getByRole('button', { name: 'Finalise handoff review' });
  expect(settle).toBeEnabled();
  act(() => get().startTurn('quality'));
  expect(settle).toBeDisabled();
  act(() => get().endTurn());
  click('Finalise handoff review');
  expect(get().workplace.improvement?.verdict).toBe('amend');
  const next = screen.getByRole('button', { name: 'Open next handoff shift' });
  expect(next).toBeEnabled();
  act(() => get().startTurn('packing'));
  expect(get().turn?.actorId).toBe('packing');
  expect(next).toBeDisabled();
});

it('offers a review discussion and isolated next-test prediction without recording a decision', async () => {
  const store = useWorkplaceStore.getState();
  store.beginImprovement('cooperative', store.workplace.revision);
  store.proposeImprovement('briefing', 'packing');
  store.acknowledgeImprovement();
  for (const member of useWorkplaceStore.getState().workplace.members) {
    store.understand(member.id);
    store.vote(member.id, true);
  }
  store.activate(useWorkplaceStore.getState().workplace.revision);
  store.tick(12, 0, false);
  store.stop();
  const before = useWorkplaceStore.getState().workplace;
  const stock = cloneMaterialFlowData(useMaterialFlowStore.getState());
  mount();
  const review = screen.getByRole('region', { name: 'Handoff learning review' });
  expect(within(review).getByText('What did this handoff teach us?')).toBeInTheDocument();
  expect(within(review).getByText(/Ended after 12.0 of 90 minutes/)).toBeInTheDocument();
  expect(within(review).getByText(/current paused plant inputs/)).toBeInTheDocument();
  click('Run matched packing rehearsal');
  const reflection = await screen.findByRole('region', { name: 'Packing prediction review' });
  expect(within(reflection).getByText(/insufficient matching evidence/)).toBeInTheDocument();
  expect(useWorkplaceStore.getState().workplace).toBe(before);
  expect(cloneMaterialFlowData(useMaterialFlowStore.getState())).toEqual(stock);
  expect(useGameSimulationStore.getState().gameSpeed).toBe(0);
  expect(before.improvement?.ballots).toEqual({});
  expect(report).not.toHaveBeenCalled();
});

it('offers workshop reflection without a physical packing comparison or automatic review ballot', () => {
  const store = useWorkplaceStore.getState();
  store.beginImprovement('team', store.workplace.revision, undefined, 'workshop');
  store.proposeImprovement('briefing', 'packing');
  store.acknowledgeImprovement();
  for (const member of useWorkplaceStore.getState().workplace.members) {
    store.understand(member.id);
    store.vote(member.id, true);
  }
  store.activate(useWorkplaceStore.getState().workplace.revision);
  store.stop();
  const before = useWorkplaceStore.getState().workplace;
  mount();
  const review = screen.getByRole('region', { name: 'Handoff learning review' });
  expect(within(review).getByText(/Workshop records no plant shipment/)).toBeInTheDocument();
  expect(
    within(review).queryByText('Compare matched packing alternatives')
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText('Packing review decision')).toBeDisabled();
  expect(useWorkplaceStore.getState().workplace).toBe(before);
  expect(before.improvement?.reviewAcknowledged).toBe(false);
});

it('lets roles inspect current plant views while abstaining facts remain unknown and agreement stays untouched', () => {
  const state = useWorkplaceStore.getState().workplace;
  const advice = derivePackingAdvice(captureCurrentPackingPlant(state), 'briefing');
  expect(advice.reasonToAbstain).toBeTruthy();
  const before = JSON.stringify(state);
  const stock = cloneMaterialFlowData(useMaterialFlowStore.getState());
  render(<FrozenPackingAdvice advice={advice} />);
  const inspections = screen.getByRole('group', { name: 'Inspect evidence together' });
  expect(within(inspections).getByText('Packing')).toBeInTheDocument();
  expect(within(inspections).getByText('Quality')).toBeInTheDocument();
  expect(within(inspections).getByText('Maintenance')).toBeInTheDocument();
  expect(within(inspections).getByText('Coordinator')).toBeInTheDocument();
  expect(within(inspections).queryByText(/0 kg released/)).not.toBeInTheDocument();
  for (const [action, destination] of [
    ['View packing floor', 'Packing'],
    ['View quality observation point', 'Packing'],
    ['View milling line', 'Milling'],
    ['View shipping dock', 'Shipping'],
  ]) {
    fireEvent.click(within(inspections).getByRole('button', { name: action, exact: true }));
    const camera = useCameraStore.getState();
    expect(camera.activePreset).toBe(CAMERA_PRESETS.findIndex((p) => p.name === destination));
    expect(camera.targetPosition?.toArray()).toEqual(CAMERA_PRESETS[camera.activePreset!].position);
  }
  expect(useGameSimulationStore.getState().gameSpeed).toBe(0);
  expect(JSON.stringify(useWorkplaceStore.getState().workplace)).toBe(before);
  expect(cloneMaterialFlowData(useMaterialFlowStore.getState())).toEqual(stock);
});

it('keeps the quality-boundary experiment unavailable when the captured comparison abstains', async () => {
  render(<MatchedPackingRehearsal state={createWorkplace()} report={report} />);
  click('Run matched packing rehearsal');
  await screen.findByLabelText('Matched packing results');
  expect(
    screen.getByRole('button', { name: 'Rehearse withheld dispatch release', exact: true })
  ).toBeDisabled();
  expect(
    screen.getByText(/Resolve missing captured facts before this exercise/)
  ).toBeInTheDocument();
});

it('freezes and resets the quality hypothesis, preserves original results and suppresses both on changed inputs', async () => {
  useMaterialFlowStore.getState().resetMaterialFlow();
  useQCLabStore.getState().resetQCLab();
  useTruckScheduleStore.getState().resetTruckSchedule();
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
  const operations = useOperationsCampaignStore.getState();
  operations.initializeCampaign();
  const material = useMaterialFlowStore.getState();
  const source = operations.orders.find((o) => o.id === operations.activeOrderId)!.recipe
    .sourceMaterial;
  const sourceInventoryKg = [...material.machineBuffers.values()].reduce(
    (sum, buffer) =>
      sum +
      [...buffer.inputBuffer, ...buffer.outputBuffer].reduce(
        (n, m) => n + (m.type === source ? m.amount : 0),
        0
      ),
    0
  );
  operations.tickCampaign(0.5, {
    materialSessionId: material.sessionId,
    shiftKey: 'quality-exercise',
    shiftLabel: 'Morning',
    manifests: material.manifests,
    productionBatches: material.productionBatches,
    totalEnergyKw: 0,
    averageQuality: 99,
    wasteKg: 0,
    storageUtilization: 0,
    shippingDocked: false,
    receivingDocked: false,
    dispatchReleased: true,
    sourceInventoryKg,
    finishedAvailableKg: 0,
    releasedFinishedKg: 0,
    dispatchLoad: {
      cycleId: 'quality-exercise',
      status: 'away',
      loadedKg: 0,
      capacityKg: 5000,
      materialType: 'flour',
      blockReason: null,
      lastDispatchKg: 0,
    },
    openWorkOrders: 0,
  });
  const state = useWorkplaceStore.getState().workplace;
  expect(captureCurrentPackingPlant(state).reasonToAbstain).toBeNull();
  const before = cloneMaterialFlowData(useMaterialFlowStore.getState());
  const accounts = useOperationsCampaignStore.getState();
  render(<MatchedPackingRehearsal state={state} report={report} />);
  click('Run matched packing rehearsal');
  await screen.findByLabelText('Matched packing results');
  const prediction = screen.getByRole('combobox', { name: 'Our quality prediction (optional)' });
  fireEvent.change(prediction, { target: { value: 'override' } });
  click('Rehearse withheld dispatch release');
  const result = await screen.findByRole('region', { name: 'Quality boundary results' });
  expect(prediction).toBeDisabled();
  expect(within(result).getByText(/Recorded idea: Higher pacing can replace/)).toBeInTheDocument();
  expect(
    within(result).getByText(/original departure bounds were already zero/)
  ).toBeInTheDocument();
  expect(within(result).getAllByText(/with withheld release:/)).toHaveLength(3);
  expect(cloneMaterialFlowData(useMaterialFlowStore.getState())).toEqual(before);
  expect(useOperationsCampaignStore.getState()).toBe(accounts);
  expect(useWorkplaceStore.getState().workplace).toBe(state);
  expect(useGameSimulationStore.getState().gameSpeed).toBe(0);
  click('Reset quality prediction');
  expect(
    screen.queryByRole('region', { name: 'Quality boundary results' })
  ).not.toBeInTheDocument();
  expect(prediction).toHaveValue('');
  expect(prediction).toBeEnabled();
  await waitFor(() => expect(prediction).toHaveFocus());
  expect(screen.getByLabelText('Matched packing results')).toBeInTheDocument();
  click('Rehearse withheld dispatch release');
  await screen.findByRole('region', { name: 'Quality boundary results' });
  act(() => useProductionStore.getState().setProductionSpeed(0.66));
  expect(
    screen.queryByRole('region', { name: 'Quality boundary results' })
  ).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Matched packing results')).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('comparison is stale');
});
