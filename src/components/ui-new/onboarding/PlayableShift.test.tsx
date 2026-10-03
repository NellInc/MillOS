import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OperationsPlayCard,
  FirstDeliveryJourney,
  ShiftDebrief,
  TeachingPace,
} from './PlayableShift';
import { useUIStore } from '../../../stores/uiStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { useMaterialFlowStore } from '../../../stores/materialFlowStore';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
import { campaignRecord } from '../../../simulation/workplaceCampaign';
import { MachineType } from '../../../types';
import type { MachineData } from '../../../types';
vi.mock('../../knowledge/LearningNote', () => ({ LearningNote: () => null }));

beforeEach(() => {
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
