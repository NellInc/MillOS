import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OperationsPlayCard,
  FirstDeliveryJourney,
  ShiftDebrief,
  TeachingPace,
} from './PlayableShift';
import { CAMERA_PRESETS, useCameraStore } from '../../CameraController';
import { useUIStore } from '../../../stores/uiStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { useMaterialFlowStore } from '../../../stores/materialFlowStore';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
import {
  campaignRecord,
  requiredChecks,
  WORKPLACE_CHECKS,
} from '../../../simulation/workplaceCampaign';
import { MachineType } from '../../../types';
import type { MachineData } from '../../../types';
import type { OperationalIncident } from '../../../stores/operationsCampaignStore';
vi.mock('../../knowledge/LearningNote', () => ({ LearningNote: () => null }));

beforeEach(() => {
  useCameraStore.setState(useCameraStore.getInitialState(), true);
  useWorkplaceStore.setState({ workplace: createWorkplace() });
  useMaterialFlowStore.setState(useMaterialFlowStore.getInitialState(), true);
  useUIStore.setState(useUIStore.getInitialState(), true);
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
  useOperationsCampaignStore.getState().initializeCampaign();
});
afterEach(cleanup);

describe('playable shift UI', () => {
  it('starts an opt-in campaign bound to the actual customer and opens Autonomy', () => {
    const before = useOperationsCampaignStore.getState();
    const order = before.orders.find((item) => item.id === before.activeOrderId)!;
    const handler = vi.fn();
    window.addEventListener('millos:open-operations-workspace', handler);
    render(<OperationsPlayCard />);
    fireEvent.change(screen.getByLabelText('Working agreement profile'), {
      target: { value: 'team' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start linked cooperative campaign' }));
    const campaign = useWorkplaceStore.getState().workplace.campaign!;
    expect(campaign.profile).toBe('team');
    expect(campaign.mission?.orderId).toBe(order.id);
    expect(campaign.mission?.targetKg).toBe(order.requiredKg - order.shippedKg);
    expect(campaign.mission?.creditedKg).toBe(0);
    expect(useOperationsCampaignStore.getState().orders).toBe(before.orders);
    expect(useOperationsCampaignStore.getState().economics).toBe(before.economics);
    expect(useGameSimulationStore.getState().gameSpeed).toBe(30);
    expect(handler.mock.calls[0][0].detail).toBe('autonomy');
    expect(screen.getByLabelText('Active customer commitment', { exact: false })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Review working agreement' }));
    expect(handler.mock.calls[1][0].detail).toBe('autonomy');
    window.removeEventListener('millos:open-operations-workspace', handler);
  });
  it.each(['no-order', 'quality', 'challenge'] as const)('holds campaign opt-in for %s', (gate) => {
    const state = useOperationsCampaignStore.getState();
    if (gate === 'no-order') useOperationsCampaignStore.setState({ activeOrderId: null });
    if (gate === 'quality')
      useOperationsCampaignStore.setState({
        orders: state.orders.map((order) => ({ ...order, qualityFailureKg: 1 })),
      });
    if (gate === 'challenge') {
      useOperationsCampaignStore.setState({
        execution: {
          ...state.execution,
          stage: 'milling',
          sourceInventoryKg: 10000,
          qualityReleased: true,
        },
      });
      useOperationsCampaignStore.getState().startChallenge('power_recovery');
      expect(useOperationsCampaignStore.getState().activeChallenge).not.toBeNull();
    }
    render(<OperationsPlayCard />);
    expect(
      screen.getByRole('button', { name: 'Start linked cooperative campaign' })
    ).toBeDisabled();
    expect(useWorkplaceStore.getState().workplace.phase).toBe('idle');
  });
  it('keeps an existing laboratory run separate from ordinary play', () => {
    useWorkplaceStore.getState().startCampaign('toe-dip', 17);
    render(<OperationsPlayCard />);
    expect(
      screen.queryByRole('button', { name: 'Start linked cooperative campaign' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByLabelText('Active customer commitment', { exact: false })
    ).not.toBeDisabled();
  });
  it.each([0, 80, 100])(
    'debrief separates delivery, deferral and agreement outcomes at %s kg',
    (delivered) => {
      useWorkplaceStore.getState().startMission('team');
      const state = useWorkplaceStore.getState().workplace;
      const members = state.members.map((member) => ({ ...member, restMinutes: 15 }));
      const record = campaignRecord({ ...state, minute: 90, members });
      useWorkplaceStore.setState({
        workplace: {
          ...state,
          phase: 'review',
          minute: 90,
          members,
          campaign: {
            ...state.campaign!,
            shift: 2,
            decision: 'protect-refusal',
            repairs: 1,
            agreementProved: true,
            history: [
              { ...record, shift: 0, agreementProved: true },
              { ...record, shift: 1, agreementProved: true, inspectionComplete: true },
            ],
            mission: {
              ...state.campaign!.mission!,
              targetKg: 80,
              originalTargetKg: 100,
              creditedKg: delivered,
            },
          },
        },
      });
      useOperationsCampaignStore.setState({
        orders: useOperationsCampaignStore
          .getState()
          .orders.map((order) => ({ ...order, status: 'fulfilled' as const })),
      });
      render(<ShiftDebrief />);
      expect(
        screen.getByText(new RegExp(`Delivery: ${delivered ? 'met' : 'shortfall'}`))
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          new RegExp(
            `Working agreement: honoured. Combined outcome: ${delivered ? 'complete' : 'unfinished'}`
          )
        )
      ).toBeInTheDocument();
      expect(screen.getByText(/Agreed deferral: 20 kg/)).toBeInTheDocument();
      expect(
        screen.getByText(new RegExp(`Remaining full customer commitment: ${100 - delivered} kg`))
      ).toBeInTheDocument();
      if (delivered === 100)
        expect(screen.getByText(/Full customer commitment dispatched/)).toBeInTheDocument();
      else
        expect(screen.queryByText(/Full customer commitment dispatched/)).not.toBeInTheDocument();
      expect(
        screen.getByText(
          /Illustrative workplace credits, separate from main mill revenue and pounds/
        )
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Accept next delivery programme' })
      ).not.toBeDisabled();
      act(() =>
        useWorkplaceStore.setState({
          workplace: {
            ...useWorkplaceStore.getState().workplace,
            members: members.map((member, index) => ({
              ...member,
              recoveryOwedMinutes: index === 0 ? 5 : 0,
            })),
          },
        })
      );
      expect(screen.getByRole('button', { name: 'Accept next delivery programme' })).toBeDisabled();
    }
  );
  it('replays a real commitment and keeps production untouched', () => {
    const before = useOperationsCampaignStore.getState();
    render(<OperationsPlayCard />);
    fireEvent.click(screen.getByRole('button', { name: 'Replay guided delivery' }));
    expect(useUIStore.getState().journeyOrderId).toBe(before.activeOrderId);
    expect(useUIStore.getState().journeyVisible).toBe(true);
    expect(useOperationsCampaignStore.getState()).toBe(before);
    expect(screen.getByText('Adjust the challenge').closest('details')).not.toHaveAttribute('open');
  });
  it('records real machine selection and does not call packed output a delivery', () => {
    const campaign = useOperationsCampaignStore.getState();
    useUIStore.getState().startDeliveryJourney(campaign.activeOrderId);
    const onOpen = vi.fn();
    const { rerender } = render(
      <FirstDeliveryJourney selectedMachine={null} onOpenWorkspace={onOpen} />
    );
    expect(screen.getByRole('heading', { name: 'Inspect the line' })).toBeInTheDocument();
    rerender(
      <FirstDeliveryJourney
        selectedMachine={{ id: 'mill-1', type: MachineType.ROLLER_MILL } as MachineData}
        onOpenWorkspace={onOpen}
      />
    );
    expect(useUIStore.getState().inspectedMachineIds).toEqual(['mill-1']);
    expect(screen.queryByRole('heading', { name: 'Delivery fulfilled' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open operations' }));
    expect(onOpen).toHaveBeenCalledWith('scada');
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(useUIStore.getState().journeyVisible).toBe(false);
  });

  it('shows the actual truck load separately from dispatched customer credit', () => {
    const campaign = useOperationsCampaignStore.getState();
    useUIStore.getState().startDeliveryJourney(campaign.activeOrderId);
    useUIStore.getState().recordMachineInspection('mill-1');
    useOperationsCampaignStore.setState({
      execution: {
        ...campaign.execution,
        orderId: campaign.activeOrderId,
        stage: 'loading',
        dispatchLoad: { ...campaign.execution.dispatchLoad, loadedKg: 1500, capacityKg: 6000 },
      },
    });
    const before = useOperationsCampaignStore.getState();
    render(<FirstDeliveryJourney selectedMachine={null} onOpenWorkspace={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Loading the shipping truck' })).toBeInTheDocument();
    const progress = screen.getByRole('progressbar', { name: 'Shipping truck load' });
    expect(progress).toHaveAttribute('value', '1500');
    expect(progress).toHaveAttribute('max', '6000');
    expect(progress).toHaveAttribute('aria-valuetext', '1500 of 6000 kilograms on the truck');
    expect(screen.getByText(/Delivery: 0 kg dispatched/)).toBeInTheDocument();
    expect(useOperationsCampaignStore.getState()).toBe(before);
    act(() =>
      useOperationsCampaignStore.setState({
        execution: {
          ...before.execution,
          stage: 'dispatched',
          dispatchLoad: { ...before.execution.dispatchLoad, lastDispatchKg: 1500 },
        },
      })
    );
    expect(screen.getByRole('heading', { name: 'Truck departed' })).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });
  it('yields a fulfilled introduction to the live next action without changing receipts', () => {
    const state = useOperationsCampaignStore.getState();
    const first = state.orders[0];
    useUIStore.getState().startDeliveryJourney(first.id);
    useUIStore.getState().recordMachineInspection('mill-1');
    useOperationsCampaignStore.setState({
      orders: state.orders.map((order) => ({
        ...order,
        status: 'fulfilled' as const,
        shippedKg: order.requiredKg,
      })),
      execution: { ...state.execution, qualityReleased: true },
    });
    const before = useOperationsCampaignStore.getState();
    const onOpen = vi.fn();
    render(<FirstDeliveryJourney selectedMachine={null} onOpenWorkspace={onOpen} />);
    expect(screen.queryByRole('heading', { name: 'Your first delivery' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Delivery fulfilled' })).toBeInTheDocument();
    expect(screen.getByText('Programme complete, review your shift')).toBeInTheDocument();
    expect(
      screen.getByText('Delivery receipt and learning').closest('details')
    ).not.toHaveAttribute('open');
    fireEvent.click(screen.getByRole('button', { name: 'Review shift and next programme' }));
    expect(onOpen).toHaveBeenCalledWith('overview');
    expect(useOperationsCampaignStore.getState()).toBe(before);
  });
  it('shows one read-only deadline on both guidance surfaces, pauses with the clock and drops completed countdowns', () => {
    const campaign = useOperationsCampaignStore.getState();
    const order = campaign.orders.find((item) => item.id === campaign.activeOrderId)!;
    useUIStore.getState().startDeliveryJourney(order.id);
    useOperationsCampaignStore.setState({ elapsedMinutes: order.dueAtMinute - 65 });
    const before = useOperationsCampaignStore.getState();
    render(
      <>
        <FirstDeliveryJourney selectedMachine={null} onOpenWorkspace={vi.fn()} />
        <OperationsPlayCard />
      </>
    );
    expect(screen.getAllByLabelText('Delivery deadline')).toHaveLength(2);
    expect(screen.getAllByText('Due in 1h 5m (simulated)')).toHaveLength(2);
    expect(useOperationsCampaignStore.getState()).toBe(before);
    fireEvent.change(screen.getAllByLabelText('Shift pace')[0], { target: { value: '0' } });
    expect(screen.getAllByText('Due in 1h 5m (simulated)')).toHaveLength(2);
    act(() => useOperationsCampaignStore.setState({ elapsedMinutes: order.dueAtMinute + 0.1 }));
    expect(screen.getAllByText('Overdue by 1m (simulated)')).toHaveLength(2);
    act(() =>
      useOperationsCampaignStore.setState({
        orders: before.orders.map((item) =>
          item.id === order.id
            ? { ...item, status: 'fulfilled' as const, shippedKg: item.requiredKg }
            : item
        ),
      })
    );
    expect(screen.queryByLabelText('Delivery deadline')).not.toBeInTheDocument();
  });
  it('switches the real recipe from the shared desktop and compact commitment card', () => {
    const before = useOperationsCampaignStore.getState();
    render(<OperationsPlayCard />);
    fireEvent.change(screen.getByLabelText('Active customer commitment', { exact: false }), {
      target: { value: before.orders[1].id },
    });
    const after = useOperationsCampaignStore.getState();
    expect(after.activeOrderId).toBe(before.orders[1].id);
    expect(after.getActiveProductionPlan()?.sourceMaterial).toBe(
      before.orders[1].recipe.sourceMaterial
    );
    expect(after.orders.map((order) => order.shippedKg)).toEqual(
      before.orders.map((order) => order.shippedKg)
    );
    expect(after.economics).toBe(before.economics);
    expect(screen.getByRole('button', { name: 'Recover from a power sag' })).toBeDisabled();
  });
  it('routes the current blocker to its real workspace', () => {
    const state = useOperationsCampaignStore.getState();
    useOperationsCampaignStore.setState({
      execution: { ...state.execution, qualityReleased: false, stage: 'quality_hold' },
    });
    const handler = vi.fn();
    window.addEventListener('millos:open-operations-workspace', handler);
    render(<OperationsPlayCard />);
    fireEvent.click(screen.getByRole('button', { name: 'Review quality hold' }));
    expect(handler.mock.calls[0][0].detail).toBe('overview');
    window.removeEventListener('millos:open-operations-workspace', handler);
  });
  it('recovers only an applied, mitigated challenge and leaves delivery unfinished', () => {
    const state = useOperationsCampaignStore.getState();
    useOperationsCampaignStore.setState({
      execution: {
        ...state.execution,
        stage: 'milling',
        sourceInventoryKg: 10000,
        qualityReleased: true,
      },
    });
    render(<OperationsPlayCard />);
    fireEvent.click(screen.getByText('Adjust the challenge'));
    expect(screen.getByText(/New challenges allow 6 simulated hours/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Recover from a power sag' }));
    const run = useOperationsCampaignStore.getState().activeChallenge!;
    expect(run).not.toBeNull();
    expect(screen.getByLabelText('Active customer commitment', { exact: false })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge incident' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply incident mitigation' }));
    expect(
      screen.queryByRole('button', { name: 'Restore challenge controller' })
    ).not.toBeInTheDocument();
    act(() => useOperationsCampaignStore.getState().markIncidentEffectApplied(run.incidentId));
    fireEvent.click(screen.getByRole('button', { name: 'Restore challenge controller' }));
    const after = useOperationsCampaignStore.getState();
    expect(after.incidents.find((incident) => incident.id === run.incidentId)?.phase).toBe(
      'resolved'
    );
    expect(after.activeChallenge?.status).toBe('active');
    expect(after.orders.find((order) => order.id === run.orderId)?.shippedKg).toBe(0);
  });
  it('changes pace only by explicit choice', () => {
    useGameSimulationStore.setState({ gameSpeed: 180 });
    render(<TeachingPace />);
    expect(useGameSimulationStore.getState().gameSpeed).toBe(180);
    fireEvent.change(screen.getByLabelText('Shift pace'), { target: { value: '30' } });
    expect(useGameSimulationStore.getState().gameSpeed).toBe(30);
  });
  it('shows saved causal decisions and retains next-programme gate', () => {
    useOperationsCampaignStore.setState({
      reports: [
        {
          id: 'report',
          shiftKey: 'day-1',
          shiftLabel: 'Day one',
          startedAtMinute: 0,
          endedAtMinute: 480,
          metrics: useOperationsCampaignStore.getState().shiftMetrics,
          completedOrderIds: [],
          openRisks: ['Batch still held'],
          grade: 'C',
          summary: 'Delivery remained open.',
          gradeReasons: ['No qualifying dispatch'],
          decisions: ['Operator mitigated a power sag'],
        },
      ],
    });
    render(<ShiftDebrief />);
    fireEvent.click(screen.getByText('Read 1 saved report'));
    fireEvent.click(screen.getByText('Decisions during this shift'));
    expect(screen.getByText('Operator mitigated a power sag')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Accept next delivery programme' })).toBeDisabled();
  });
});

it('shows the actual line or shipping camera without changing production or awarding an inspection', () => {
  const campaign = useOperationsCampaignStore.getState();
  useUIStore.getState().startDeliveryJourney(campaign.activeOrderId);
  render(<FirstDeliveryJourney selectedMachine={null} onOpenWorkspace={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Show milling line' }));
  const milling = CAMERA_PRESETS.findIndex((preset) => preset.name === 'Milling');
  expect(useCameraStore.getState().activePreset).toBe(milling);
  expect(useCameraStore.getState().targetPosition?.toArray()).toEqual(
    CAMERA_PRESETS[milling].position
  );
  expect(useUIStore.getState().inspectedMachineIds).toEqual([]);
  expect(useOperationsCampaignStore.getState()).toBe(campaign);
  act(() => {
    useUIStore.getState().recordMachineInspection('mill-1');
    useOperationsCampaignStore.setState({
      execution: { ...campaign.execution, orderId: campaign.activeOrderId, stage: 'loading' },
    });
  });
  const loading = useOperationsCampaignStore.getState();
  fireEvent.click(screen.getByRole('button', { name: 'Expand delivery guide' }));
  fireEvent.click(screen.getByRole('button', { name: 'Show shipping bay' }));
  expect(useCameraStore.getState().activePreset).toBe(
    CAMERA_PRESETS.findIndex((preset) => preset.name === 'Shipping')
  );
  expect(useOperationsCampaignStore.getState()).toBe(loading);
  fireEvent.click(screen.getByRole('button', { name: 'Expand delivery guide' }));
  act(() => useUIStore.setState({ fpsMode: true }));
  useCameraStore.getState().cancelAnimation();
  const walking = useCameraStore.getState();
  fireEvent.click(screen.getByRole('button', { name: 'Show shipping bay' }));
  expect(useCameraStore.getState()).toBe(walking);
});

it('keeps real inspection tracking mounted in the compact scene guide and restores its lesson', () => {
  const campaign = useOperationsCampaignStore.getState();
  useUIStore.getState().startDeliveryJourney(campaign.activeOrderId);
  const onOpen = vi.fn();
  const { rerender } = render(
    <FirstDeliveryJourney selectedMachine={null} onOpenWorkspace={onOpen} />
  );
  const deadline = screen.getByLabelText('Delivery deadline').textContent;
  fireEvent.click(screen.getByRole('button', { name: 'Show milling line' }));
  expect(screen.getByLabelText('Delivery deadline')).toHaveTextContent(deadline!);
  expect(screen.getByRole('button', { name: 'Expand delivery guide' })).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Shift pace' })).toBeInTheDocument();
  expect(screen.getByText('Select a machine to record your inspection.')).toBeInTheDocument();
  expect(useUIStore.getState().journeyVisible).toBe(true);
  rerender(
    <FirstDeliveryJourney
      selectedMachine={{ id: 'mill-1', type: MachineType.ROLLER_MILL } as MachineData}
      onOpenWorkspace={onOpen}
    />
  );
  expect(useUIStore.getState().inspectedMachineIds).toEqual(['mill-1']);
  expect(screen.getByText(/Inspection: recorded/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Expand delivery guide' }));
  expect(screen.getByRole('combobox', { name: 'Shift pace' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Open operations' })).toBeInTheDocument();
  expect(useOperationsCampaignStore.getState()).toBe(campaign);
});

it.each(['mounted', 'lazy-mount', 'resolved', 'fps'] as const)(
  'reveals the existing response control for %s without performing it',
  async (mode) => {
    const incident: OperationalIncident = {
      id: 'response-navigation',
      kind: 'power_sag',
      title: 'Site power dip',
      description: 'A voltage dip reduces throughput.',
      phase: mode === 'resolved' ? 'resolved' : 'raised',
      severity: 'high',
      startedAtMinute: 0,
      acknowledgedAtMinute: null,
      resolvedAtMinute: mode === 'resolved' ? 0 : null,
      affectedMachineId: null,
      effectApplied: false,
    };
    useOperationsCampaignStore.setState({ incidents: [incident] });
    useUIStore.setState({ fpsMode: mode === 'fps' });
    const before = useOperationsCampaignStore.getState(),
      stock = useMaterialFlowStore.getState(),
      clock = useGameSimulationStore.getState();
    const scrollDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'scrollIntoView'
    );
    const scroll = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scroll,
    });
    try {
      if (mode === 'lazy-mount') useUIStore.getState().setOperationalFocusId(incident.id);
      render(<OperationsPlayCard />);
      if (mode !== 'lazy-mount')
        act(() => useUIStore.getState().setOperationalFocusId(incident.id));
      await waitFor(() => expect(useUIStore.getState().operationalFocusId).toBeNull());
      if (mode === 'mounted' || mode === 'lazy-mount') {
        expect(scroll).toHaveBeenCalledWith({ block: 'center', behavior: 'instant' });
        expect(
          screen.getByRole('button', { name: 'Acknowledge incident', exact: true })
        ).toHaveFocus();
      } else expect(scroll).not.toHaveBeenCalled();
      expect(useUIStore.getState().operationalFocusId).toBeNull();
      expect(useOperationsCampaignStore.getState()).toBe(before);
      expect(useMaterialFlowStore.getState()).toBe(stock);
      expect(useGameSimulationStore.getState()).toBe(clock);
    } finally {
      if (scrollDescriptor)
        Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', scrollDescriptor);
      else delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
    }
  }
);

it.each(['responding', 'recovering'] as const)(
  'keeps %s challenge progress outside collapsed setup without advancing it',
  (phase) => {
    const state = useOperationsCampaignStore.getState();
    useOperationsCampaignStore.setState({
      execution: {
        ...state.execution,
        stage: 'milling',
        sourceInventoryKg: 10000,
        qualityReleased: true,
      },
    });
    expect(useOperationsCampaignStore.getState().startChallenge('power_recovery')).toBe(true);
    if (phase === 'recovering') {
      const campaign = useOperationsCampaignStore.getState();
      useOperationsCampaignStore.setState({
        incidents: campaign.incidents.map((incident) => ({
          ...incident,
          phase: 'resolved' as const,
        })),
      });
    }
    const before = useOperationsCampaignStore.getState(),
      stock = useMaterialFlowStore.getState(),
      clock = useGameSimulationStore.getState();
    render(<OperationsPlayCard />);
    const progress = screen.getByRole('group', { name: 'Recovery challenge progress' });
    expect(progress.closest('details')).toBeNull();
    expect(progress).toHaveTextContent('0 / 1000 kg');
    expect(progress).toHaveTextContent('360 simulation minutes left');
    expect(progress).toHaveTextContent(
      phase === 'responding'
        ? 'Acknowledge the incident, then apply mitigation.'
        : 'Controller restored. Dispatch fresh, quality-released goods through the shipping bay.'
    );
    expect(useOperationsCampaignStore.getState()).toBe(before);
    expect(useMaterialFlowStore.getState()).toBe(stock);
    expect(useGameSimulationStore.getState()).toBe(clock);
  }
);

function queueControllerResponse() {
  const state = useOperationsCampaignStore.getState();
  useOperationsCampaignStore.setState({
    execution: {
      ...state.execution,
      stage: 'milling',
      sourceInventoryKg: 10000,
      qualityReleased: true,
    },
  });
  expect(useOperationsCampaignStore.getState().startChallenge('power_recovery')).toBe(true);
  const run = useOperationsCampaignStore.getState().activeChallenge!;
  useOperationsCampaignStore.getState().acknowledgeIncident(run.incidentId);
  useOperationsCampaignStore.getState().mitigateIncident(run.incidentId);
  return useOperationsCampaignStore.getState();
}
it.each([0, 30, 180])(
  'resumes the whole paused shift only on explicit choice, retaining a running %s pace',
  (speed) => {
    const campaign = queueControllerResponse(),
      stock = useMaterialFlowStore.getState();
    useGameSimulationStore.setState({ gameSpeed: speed });
    const clock = useGameSimulationStore.getState();
    render(<OperationsPlayCard />);
    const action = screen.getByRole('button', {
      name: speed === 0 ? 'Resume shift for controller response' : 'Awaiting simulation update',
    });
    expect(useGameSimulationStore.getState()).toBe(clock);
    expect(
      screen.getByText(
        speed === 0
          ? /Resumes the whole shift at relaxed pace/
          : /The shift is running at your chosen pace/
      )
    ).toBeInTheDocument();
    expect(
      screen
        .getByRole('group', { name: 'Recovery challenge progress' })
        .compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Abandon challenge' }).closest('details')
    ).not.toHaveAttribute('open');
    if (speed) expect(action).toBeDisabled();
    fireEvent.click(action);
    expect(useGameSimulationStore.getState().gameSpeed).toBe(speed || 30);
    expect(useOperationsCampaignStore.getState()).toBe(campaign);
    expect(useMaterialFlowStore.getState()).toBe(stock);
    expect(
      screen.queryByRole('button', { name: 'Restore challenge controller' })
    ).not.toBeInTheDocument();
  }
);
it.each(['deliberating', 'active', 'review'] as const)(
  'keeps explicit resume separate from programme eligibility during linked %s',
  (phase) => {
    const w = useWorkplaceStore.getState();
    expect(w.startMission('team').changed).toBe(true);
    if (phase !== 'deliberating') {
      w.campaignDecision('keep-target', 'coordinator');
      w.selectPlan('steady');
      for (const actor of ['packing', 'mind'])
        for (const id of requiredChecks(actor))
          w.answerCheck(actor, id, WORKPLACE_CHECKS.find((q) => q.id === id)!.correct);
      w.understand('packing');
      w.vote('packing', true);
      w.simulateResponses();
      expect(w.activate(useWorkplaceStore.getState().workplace.revision).changed).toBe(true);
      if (phase === 'review') w.tick(90, 0, false);
    }
    expect(useWorkplaceStore.getState().workplace.phase).toBe(phase);
    const campaign = queueControllerResponse(),
      agreement = useWorkplaceStore.getState().workplace,
      stock = useMaterialFlowStore.getState();
    useGameSimulationStore.setState({ gameSpeed: 0 });
    render(<OperationsPlayCard />);
    const action = screen.getByRole('button', { name: 'Resume shift for controller response' });
    expect(action).not.toBeDisabled();
    expect(screen.getByLabelText('Active customer commitment', { exact: false })).toBeDisabled();
    fireEvent.click(action);
    expect(useGameSimulationStore.getState().gameSpeed).toBe(30);
    expect(useOperationsCampaignStore.getState()).toBe(campaign);
    expect(useWorkplaceStore.getState().workplace).toBe(agreement);
    expect(useMaterialFlowStore.getState()).toBe(stock);
  }
);
it('routes completed-delivery response guidance to Overview without advancing the simulation', () => {
  const state = queueControllerResponse(),
    run = state.activeChallenge!;
  useUIStore.getState().startDeliveryJourney(run.orderId);
  useUIStore.getState().recordMachineInspection('mill-1');
  useOperationsCampaignStore.setState({
    orders: state.orders.map((order) => ({
      ...order,
      status: 'fulfilled',
      shippedKg: order.requiredKg,
    })),
  });
  const before = useOperationsCampaignStore.getState(),
    clock = useGameSimulationStore.getState(),
    onOpen = vi.fn();
  render(<FirstDeliveryJourney selectedMachine={null} onOpenWorkspace={onOpen} />);
  fireEvent.click(screen.getByRole('button', { name: 'Open current operations' }));
  expect(onOpen).toHaveBeenCalledWith('overview');
  expect(useOperationsCampaignStore.getState()).toBe(before);
  expect(useGameSimulationStore.getState()).toBe(clock);
});

it('compacts directly without moving the camera or changing customer/inspection credit', () => {
  const campaign = useOperationsCampaignStore.getState();
  useUIStore.getState().startDeliveryJourney(campaign.activeOrderId);
  render(<FirstDeliveryJourney selectedMachine={null} onOpenWorkspace={vi.fn()} />);
  const camera = useCameraStore.getState(),
    deadline = screen.getByLabelText('Delivery deadline').textContent;
  fireEvent.click(screen.getByRole('button', { name: 'Compact delivery guide' }));
  expect(screen.getByRole('button', { name: 'Expand delivery guide' })).toHaveFocus();
  expect(screen.getByRole('button', { name: 'Expand delivery guide' })).toHaveAttribute(
    'aria-expanded',
    'false'
  );
  expect(screen.getByLabelText('Delivery deadline')).toHaveTextContent(deadline!);
  expect(useCameraStore.getState()).toBe(camera);
  expect(useOperationsCampaignStore.getState()).toBe(campaign);
  expect(useUIStore.getState().inspectedMachineIds).toEqual([]);
  fireEvent.change(screen.getByRole('combobox', { name: 'Shift pace' }), {
    target: { value: '0' },
  });
  expect(useGameSimulationStore.getState().gameSpeed).toBe(0);
  fireEvent.click(screen.getByRole('button', { name: 'Expand delivery guide' }));
  expect(screen.getByRole('button', { name: 'Compact delivery guide' })).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: 'Compact delivery guide' }));
  fireEvent.click(screen.getByRole('button', { name: 'Close guided delivery' }));
  expect(useUIStore.getState().journeyVisible).toBe(false);
  expect(useOperationsCampaignStore.getState()).toBe(campaign);
});

it('keeps fulfilled receipts reachable after compacting without granting new customer credit', () => {
  const before = useOperationsCampaignStore.getState(),
    order = before.orders[0];
  useOperationsCampaignStore.setState({
    orders: before.orders.map((o) =>
      o.id === order.id ? { ...o, status: 'fulfilled', shippedKg: o.requiredKg } : o
    ),
  });
  useUIStore.getState().startDeliveryJourney(order.id);
  useUIStore.getState().recordMachineInspection('mill-1');
  const state = useOperationsCampaignStore.getState();
  render(<FirstDeliveryJourney selectedMachine={null} onOpenWorkspace={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Compact delivery guide' }));
  expect(screen.getByRole('heading', { name: 'Delivery fulfilled' })).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Shift pace' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Expand delivery guide' }));
  expect(screen.getByText('Delivery receipt and learning')).toBeInTheDocument();
  expect(useOperationsCampaignStore.getState()).toBe(state);
});

it.each([
  ['planning', 'Open line controls', 'scada'],
  ['quality_hold', 'Review delivery and QC', 'overview'],
] as const)(
  'opens the actual %s workspace from compact guidance without producing credit',
  (stage, label, workspace) => {
    const initial = useOperationsCampaignStore.getState();
    useOperationsCampaignStore.setState({ execution: { ...initial.execution, stage } });
    useUIStore.getState().startDeliveryJourney(initial.activeOrderId);
    useUIStore.getState().recordMachineInspection('rm-101');
    const before = useOperationsCampaignStore.getState(),
      camera = useCameraStore.getState(),
      open = vi.fn();
    render(<FirstDeliveryJourney selectedMachine={null} onOpenWorkspace={open} />);
    fireEvent.click(screen.getByRole('button', { name: 'Compact delivery guide' }));
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(open).toHaveBeenCalledWith(workspace);
    expect(useOperationsCampaignStore.getState()).toBe(before);
    expect(useCameraStore.getState()).toBe(camera);
    expect(screen.getByRole('combobox', { name: 'Shift pace' })).toBeInTheDocument();
  }
);
