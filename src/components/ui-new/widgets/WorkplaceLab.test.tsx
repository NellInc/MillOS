import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkplaceLab } from './WorkplaceLab';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useMaterialFlowStore } from '../../../stores/materialFlowStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { createWorkplace, workplaceReadiness } from '../../../simulation/bilateralWorkplace';
import {
  CAMPAIGN_SHIFTS,
  WORKPLACE_CHECKS,
  requiredChecks,
  campaignRecord,
} from '../../../simulation/workplaceCampaign';
import { executeAgentCommand } from '../../../agent/client/executeAgentCommand';
import type { AgentCommandClientResult } from '../../../agent/client/executeAgentCommand';

vi.mock('../../../agent/client/executeAgentCommand', () => ({ executeAgentCommand: vi.fn() }));
const execute = vi.mocked(executeAgentCommand);
const open = (name: string) => fireEvent.click(screen.getByRole('button', { name, exact: true }));
const prepare = (mode: 'game' | 'workshop' = 'game') => {
  const store = useWorkplaceStore.getState();
  store.start(mode, 17);
  store.selectPlan('steady');
  for (const member of useWorkplaceStore.getState().workplace.members) {
    store.understand(member.id);
    store.vote(member.id, true);
  }
};
const result = (status: 'verified' | 'rejected', message?: string): AgentCommandClientResult =>
  ({
    preview: {
      status: status === 'verified' ? 'requires-approval' : 'denied',
      authority: { reasons: message ? [message] : [] },
      problems: [],
    },
    approval: null,
    receipt: {
      status,
      receiptId: 'receipt-workplace-42',
      problems: message ? [{ code: 'stale', severity: 'blocking', message }] : [],
    },
  }) as AgentCommandClientResult;

beforeEach(() => {
  useMaterialFlowStore.setState(useMaterialFlowStore.getInitialState(), true);
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
  useOperationsCampaignStore.getState().initializeCampaign();
  useWorkplaceStore.setState({ workplace: createWorkplace() });
  useGameSimulationStore.setState({ gameSpeed: 180 });
  execute.mockReset();
});
afterEach(cleanup);

describe('Workplace laboratory interface', () => {
  it('stages the direct third-shift chapter and exposes its pressure controls without consent', () => {
    useWorkplaceStore.getState().startCampaign('team', 17);
    const state = useWorkplaceStore.getState().workplace;
    useWorkplaceStore.setState({
      workplace: { ...state, campaign: { ...state.campaign!, shift: 2 } },
    });
    useWorkplaceStore.getState().campaignDecision('protect-refusal', 'coordinator');
    const before = useWorkplaceStore.getState().workplace;
    render(<WorkplaceLab />);
    expect(screen.getByRole('region', { name: 'Pressure chapter' })).toBeInTheDocument();
    expect(screen.getByText('Thursday: a fresh offer')).toBeInTheDocument();
    expect(
      screen.getByText('Pressure card: Yesterday’s volunteer again?').closest('details')
    ).toHaveAttribute('open');
    open('Go to Agreement / Voices controls');
    expect(screen.getByRole('button', { name: 'Agreement / Voices', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(useWorkplaceStore.getState().workplace).toBe(before);
    expect(execute).not.toHaveBeenCalled();
  });

  it('switches decision structures without changing physical work or money', () => {
    useWorkplaceStore.getState().startCampaign('cooperative', 17);
    const before = useWorkplaceStore.getState().workplace;
    render(<WorkplaceLab />);
    open('Practices');
    open('Apply Coordinator-led');
    const after = useWorkplaceStore.getState().workplace;
    expect(after.governance).toBe('consultative');
    expect(after.workerAutonomy).toBe('directed');
    expect(after.finance).toEqual(before.finance);
    expect(after.planId).toBe(before.planId);
    expect(screen.getByRole('button', { name: 'Apply Coordinator-led' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    open('Apply Team agreement');
    expect(useWorkplaceStore.getState().workplace.governance).toBe('team-consent');
  });

  it('plays a blocked privacy demand and leaves remedy approval with Quality', () => {
    useWorkplaceStore.getState().startCampaign('cooperative', 17);
    render(<WorkplaceLab />);
    fireEvent.click(screen.getByText('Pressure card: A private reason for refusal?'));
    open('Try the demand (blocked and challenged)');
    expect(screen.getByText(/Demand blocked and challenged/)).toBeInTheDocument();
    expect(useWorkplaceStore.getState().workplace.members.every((member) => !member.sharing)).toBe(
      true
    );
    open('Restate protected terms');
    expect(useWorkplaceStore.getState().workplace.objections[0].status).toBe('open');
    open('Review the challenge and remedy');
    fireEvent.change(screen.getByLabelText('Resolving author for privacy'), {
      target: { value: 'quality' },
    });
    open('Author confirms resolution');
    expect(useWorkplaceStore.getState().workplace.objections[0].status).toBe('resolved');
    expect(execute).not.toHaveBeenCalled();
  });

  it('compares the same physical plan under three charters without a productivity bonus', () => {
    useWorkplaceStore.getState().startCampaign('cooperative', 17);
    render(<WorkplaceLab />);
    open('Experiment');
    open('Compare management approaches');
    const forecasts = screen
      .getAllByText(/Matched forecast:/)
      .map((element) => element.textContent);
    expect(forecasts).toHaveLength(3);
    expect(new Set(forecasts).size).toBe(1);
    expect(screen.getByText(/Governance grants no production bonus/)).toBeInTheDocument();
  });

  it('shows public relationship receipts and identifies missing legacy evidence', () => {
    const store = useWorkplaceStore.getState();
    store.startCampaign('cooperative', 17);
    store.respondToPressure('disclosure', 'accept-demand');
    const state = useWorkplaceStore.getState().workplace;
    const record = campaignRecord(state);
    delete record.relationshipEvents;
    useWorkplaceStore.setState({
      workplace: { ...state, campaign: { ...state.campaign!, shift: 1, history: [record] } },
    });
    render(<WorkplaceLab />);
    open('Review');
    fireEvent.click(screen.getByText('Relationship record across shifts'));
    expect(
      screen.getByText('This older save has no relationship receipts for this shift.')
    ).toBeInTheDocument();
    const relationship = screen.getByText('Relationship record across shifts').closest('details')!;
    expect(
      within(relationship).getByText(/Quality challenges compulsory explanation sharing/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/predictable packing handoff/)).not.toBeInTheDocument();
  });
  it('shows the actual bound target and deferred installment without rewriting the customer order', () => {
    useWorkplaceStore.getState().startMission('team', 17);
    const before = useOperationsCampaignStore.getState().orders;
    const mission = useWorkplaceStore.getState().workplace.campaign!.mission!;
    render(<WorkplaceLab />);
    expect(
      screen.getByRole('button', {
        name: `Keep the ${mission.originalTargetKg.toFixed(0)} kg commitment`,
      })
    ).toBeInTheDocument();
    open(`Negotiate an ${(mission.originalTargetKg * 0.8).toFixed(0)} kg installment`);
    expect(
      screen.getByText(
        new RegExp(`Agreed deferral: ${(mission.originalTargetKg * 0.2).toFixed(0)} kg`)
      )
    ).toBeInTheDocument();
    expect(useOperationsCampaignStore.getState().orders).toBe(before);
    open('Review');
    expect(screen.getByText(/Delivery: pending/)).toBeInTheDocument();
    expect(screen.getByText(/Working agreement: pending/)).toBeInTheDocument();
    expect(
      screen.getByText(/Illustrative workplace credits, separate from main mill revenue and pounds/)
    ).toBeInTheDocument();
  });
  it('reports a fair zero-output run as a delivery shortfall and remembers the previous shift', () => {
    useWorkplaceStore.getState().startMission('team', 17);
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
        },
      },
    });
    render(<WorkplaceLab />);
    expect(
      screen.getByText(
        new RegExp(
          `Remaining customer commitment: ${state.campaign!.mission!.originalTargetKg.toFixed(0)} kg`
        )
      )
    ).toBeInTheDocument();
    expect(screen.getByText(/The adviser corrected its reuse of old consent/)).toBeInTheDocument();
    open('Review');
    expect(screen.getByText(/Delivery: shortfall/)).toBeInTheDocument();
    expect(
      screen.getByText(/Working agreement: honoured. Combined outcome: unfinished/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/Living Cooperative campaign complete:/)).not.toBeInTheDocument();
    expect(
      screen.getByText(
        new RegExp(
          `Remaining full customer commitment: ${state.campaign!.mission!.originalTargetKg.toFixed(0)} kg`
        )
      )
    ).toBeInTheDocument();
    act(() => {
      const current = useWorkplaceStore.getState().workplace;
      const mission = current.campaign!.mission!;
      useWorkplaceStore.setState({
        workplace: {
          ...current,
          campaign: {
            ...current.campaign!,
            repairs: 0,
            mission: {
              ...mission,
              targetKg: mission.originalTargetKg * 0.8,
              creditedKg: mission.originalTargetKg,
            },
          },
        },
      });
    });
    expect(screen.getByText(/Delivery: met/)).toBeInTheDocument();
    expect(
      screen.getByText(/Working agreement: incomplete. Combined outcome: unfinished/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Remaining full customer commitment: 0 kg. Full customer commitment dispatched/
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        new RegExp(
          `Agreed deferral: ${(state.campaign!.mission!.originalTargetKg * 0.2).toFixed(0)} kg`
        )
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/commitment remains open until dispatched/)).not.toBeInTheDocument();
  });
  it('returns the laboratory to view when changing sections in a scrolled workspace', () => {
    render(<WorkplaceLab />);
    const lab = screen.getByRole('region', { name: 'Workplace laboratory' });
    lab.scrollIntoView = vi.fn();
    open('Review');
    expect(lab.scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'instant' });
  });

  it('requires an explicit game start before changing the teaching clock', () => {
    render(<WorkplaceLab />);
    expect(useGameSimulationStore.getState().gameSpeed).toBe(180);
    expect(
      screen.getByText(/No real worker data or independently authenticated ballots/)
    ).toBeInTheDocument();
    open('Start playable shift at teaching pace (15×)');
    expect(useGameSimulationStore.getState().gameSpeed).toBe(15);
    expect(useWorkplaceStore.getState().workplace.phase).toBe('deliberating');
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([
    ['workshop', 'Start manual workshop'],
    ['pilot', 'Prepare pilot charter'],
  ])('%s start leaves the plant clock unchanged', (mode, label) => {
    render(<WorkplaceLab />);
    fireEvent.change(screen.getByLabelText('Mode'), { target: { value: mode } });
    open(label);
    expect(useGameSimulationStore.getState().gameSpeed).toBe(180);
    expect(useWorkplaceStore.getState().workplace.mode).toBe(mode);
    open('Agreement / Voices');
    expect(
      screen.queryByRole('button', { name: 'Hear simulated team responses' })
    ).not.toBeInTheDocument();
    expect(
      useWorkplaceStore.getState().workplace.members.every((member) => member.ballot === null)
    ).toBe(true);
    if (mode === 'pilot')
      expect(screen.getByRole('button', { name: 'Approve and run agreement' })).toBeDisabled();
    expect(execute).not.toHaveBeenCalled();
  });

  it('keeps optional preferences out of rendered content until consent, then revokes them', () => {
    useWorkplaceStore.getState().start('workshop', 17);
    const member = useWorkplaceStore.getState().workplace.members[0];
    render(<WorkplaceLab />);
    open('Agreement / Voices');
    expect(screen.queryByText(member.preference, { exact: false })).not.toBeInTheDocument();
    expect(screen.getByText(`Public boundary: ${member.publicBoundary}`)).toBeInTheDocument();
    open(`Share preference for shift planning: ${member.role}`);
    expect(screen.getByText(member.preference, { exact: false })).toBeInTheDocument();
    open(`Revoke preference sharing: ${member.role}`);
    expect(screen.queryByText(member.preference, { exact: false })).not.toBeInTheDocument();
  });

  it('keeps policy approval independent of extra-work consent', () => {
    prepare();
    const store = useWorkplaceStore.getState();
    store.selectPlan('cover');
    store.configure({ governance: 'member-vote' });
    for (const member of useWorkplaceStore.getState().workplace.members) {
      store.understand(member.id);
      store.vote(member.id, true);
    }
    render(<WorkplaceLab />);
    open('Agreement / Voices');
    expect(screen.getByText(/must separately consent/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve and run agreement' })).toBeDisabled();
    open('Decline cover: Packing');
    expect(useWorkplaceStore.getState().workplace.members[0].ballot).toBe(true);
    expect(useWorkplaceStore.getState().workplace.members[0].coverConsent).toBe(false);
    expect(workplaceReadiness(useWorkplaceStore.getState().workplace).allowed).toBe(false);
  });

  it('shows the prohibited rush reason and invalidates previous role agreement on plan change', () => {
    prepare();
    render(<WorkplaceLab />);
    const rush = screen.getByRole('radio', { name: /Rush/ });
    fireEvent.click(rush);
    const state = useWorkplaceStore.getState().workplace;
    expect(state.planId).toBe('rush');
    expect(state.members.every((member) => !member.understood && member.ballot === null)).toBe(
      true
    );
    expect(screen.getByText(/Prohibited:/)).toBeInTheDocument();
    open('Agreement / Voices');
    expect(screen.getByRole('button', { name: 'Approve and run agreement' })).toBeDisabled();
  });

  it('runs the agent path only on explicit approval with the exact revision', async () => {
    prepare();
    const revision = useWorkplaceStore.getState().workplace.revision;
    execute.mockResolvedValue(result('verified'));
    render(<WorkplaceLab />);
    open('Agreement / Voices');
    expect(execute).not.toHaveBeenCalled();
    open('Approve and run agreement');
    await waitFor(() =>
      expect(screen.getByText('Causal receipt: receipt-workplace-42')).toBeInTheDocument()
    );
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        capabilityId: 'workplace.activate-plan',
        targetUri: 'millos://simulation/local',
        parameters: { revision },
      }),
      expect.objectContaining({
        approveIfRequired: true,
        approvalReason: expect.stringContaining(`revision ${revision}`),
      })
    );
    expect(screen.getByText(/Execution: verified/)).toBeInTheDocument();
  });

  it('displays denied or stale reasons without claiming execution success', async () => {
    prepare();
    execute.mockResolvedValue(result('rejected', 'Agreement revision is stale. Deliberate again.'));
    render(<WorkplaceLab />);
    open('Agreement / Voices');
    open('Approve and run agreement');
    await waitFor(() => expect(screen.getByText(/Preview: denied/)).toBeInTheDocument());
    expect(screen.getByText(/Agreement revision is stale/)).toBeInTheDocument();
    expect(useWorkplaceStore.getState().workplace.phase).toBe('deliberating');
  });

  it('reports unavailable runtime errors and prevents duplicate busy approvals', async () => {
    prepare();
    let reject: (error: Error) => void = () => undefined;
    execute.mockImplementation(
      () =>
        new Promise((_, rejectPromise) => {
          reject = rejectPromise;
        })
    );
    render(<WorkplaceLab />);
    open('Agreement / Voices');
    open('Approve and run agreement');
    expect(screen.getByRole('button', { name: 'Checking agreement…' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Checking agreement…' }));
    expect(execute).toHaveBeenCalledTimes(1);
    await act(async () => reject(new Error('MillOS agent runtime v2 is not installed.')));
    expect(screen.getByText('MillOS agent runtime v2 is not installed.')).toBeInTheDocument();
  });

  it('records workshop agreement locally with no agent or clock effect', () => {
    prepare('workshop');
    render(<WorkplaceLab />);
    open('Agreement / Voices');
    open('Record workshop agreement');
    expect(useWorkplaceStore.getState().workplace.phase).toBe('active');
    expect(execute).not.toHaveBeenCalled();
    expect(useGameSimulationStore.getState().gameSpeed).toBe(180);
  });

  it('separates axes, disables active configuration and has wrapping section controls', () => {
    prepare('workshop');
    render(<WorkplaceLab />);
    const sections = screen.getByLabelText('Workplace sections');
    expect(sections).toHaveClass('flex-wrap');
    open('Practices');
    expect(screen.getByLabelText('Worker decisions')).toBeEnabled();
    expect(screen.getByLabelText('Shared governance')).toBeEnabled();
    expect(screen.getByLabelText('AI authority')).toBeEnabled();
    act(() => {
      useWorkplaceStore.getState().activate(useWorkplaceStore.getState().workplace.revision);
    });
    expect(screen.getByLabelText('Worker decisions')).toBeDisabled();
    expect(screen.getByLabelText('Shared governance')).toBeDisabled();
    expect(screen.getByLabelText('AI authority')).toBeDisabled();
  });

  it('advances workshop time manually, reports delivered rest and leaves plant output untouched', () => {
    prepare('workshop');
    useWorkplaceStore.getState().activate(useWorkplaceStore.getState().workplace.revision);
    render(<WorkplaceLab />);
    open('Advance rehearsal by 5 minutes');
    expect(useWorkplaceStore.getState().workplace.minute).toBe(5);
    expect(screen.getByText(/Five modeled rehearsal minutes recorded/)).toBeInTheDocument();
    expect(useWorkplaceStore.getState().workplace.shippedKg).toBe(0);
    expect(useGameSimulationStore.getState().gameSpeed).toBe(180);
    expect(execute).not.toHaveBeenCalled();
    open('Agreement / Voices');
    expect(screen.getAllByText(/recovery owed 0.0 min/)).toHaveLength(4);
  });

  it('permits a pilot charter draft while denying role and execution inputs', () => {
    useWorkplaceStore.getState().start('pilot', 17);
    render(<WorkplaceLab />);
    open('Practices');
    fireEvent.change(screen.getByLabelText('Worker decisions'), {
      target: { value: 'individual' },
    });
    expect(useWorkplaceStore.getState().workplace.workerAutonomy).toBe('individual');
    open('Shift');
    fireEvent.click(screen.getByRole('radio', { name: /Resequence together/ }));
    expect(useWorkplaceStore.getState().workplace.planId).toBe('resequence');
    open('Agreement / Voices');
    expect(screen.getByRole('button', { name: 'Policy yes: Packing' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Share preference for shift planning: Packing' })
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Approve and run agreement' })).toBeDisabled();
    expect(execute).not.toHaveBeenCalled();
  });

  it('requires the original objection author to confirm a resolution', () => {
    prepare('workshop');
    const store = useWorkplaceStore.getState();
    store.object('mind', 'authority');
    render(<WorkplaceLab />);
    open('Agreement / Voices');
    expect(screen.getByRole('button', { name: 'Author confirms resolution' })).toBeDisabled();
    const selector = screen.getByLabelText('Resolving author for authority');
    expect(within(selector).getAllByRole('option')).toHaveLength(2);
    fireEvent.change(selector, { target: { value: 'mind' } });
    open('Author confirms resolution');
    expect(useWorkplaceStore.getState().workplace.objections[0].status).toBe('resolved');
  });

  it('compares all arms without plant effects and excludes the mind from member ballots', () => {
    render(<WorkplaceLab />);
    open('Experiment');
    fireEvent.change(screen.getByLabelText('Experiment seed'), { target: { value: '42' } });
    open('Compare all plans with this seed');
    expect(screen.getAllByText(/forecast .* kg;/)).toHaveLength(4);
    expect(screen.getByText(/Illustrative model forecasts/)).toBeInTheDocument();
    open('Review');
    expect(
      within(screen.getByLabelText('Member voter')).queryByRole('option', { name: 'AI mind' })
    ).not.toBeInTheDocument();
    expect(useGameSimulationStore.getState().gameSpeed).toBe(180);
    expect(execute).not.toHaveBeenCalled();
  });
});

describe('Living Cooperative campaign interface', () => {
  const answer = (role: string, questionId: string, value: string) => {
    const question = WORKPLACE_CHECKS.find((check) => check.id === questionId)!;
    fireEvent.change(screen.getByLabelText(`${role}: ${question.prompt}`), { target: { value } });
  };

  it('starts only explicitly with the selected profile and a 30× local clock', () => {
    render(<WorkplaceLab />);
    expect(useGameSimulationStore.getState().gameSpeed).toBe(180);
    fireEvent.change(screen.getByLabelText('Adoption profile'), { target: { value: 'team' } });
    open('Start Living Cooperative campaign');
    expect(useWorkplaceStore.getState().workplace.campaign?.profile).toBe('team');
    expect(useGameSimulationStore.getState().gameSpeed).toBe(30);
    expect(screen.getByText(`Shift 1 of 3: ${CAMPAIGN_SHIFTS[0].title}`)).toBeInTheDocument();
    expect(execute).not.toHaveBeenCalled();
  });

  it('requires Packing and adviser answers, clarifies mistakes and keeps sharing optional', () => {
    useWorkplaceStore.getState().startCampaign('team', 17);
    render(<WorkplaceLab />);
    open('Agreement / Voices');
    for (const questionId of requiredChecks('packing')) {
      const question = WORKPLACE_CHECKS.find((check) => check.id === questionId)!;
      expect(screen.getByLabelText(`Packing: ${question.prompt}`)).toHaveValue('');
    }
    answer('Packing', 'refusal', 'majority');
    open('Confirm understanding: Packing');
    expect(useWorkplaceStore.getState().workplace.members[0].understood).toBe(false);
    expect(
      screen.getByText(/individual consent|correct|understanding/i, { selector: '[role="status"]' })
    ).toBeInTheDocument();
    for (const questionId of requiredChecks('packing')) {
      answer(
        'Packing',
        questionId,
        WORKPLACE_CHECKS.find((check) => check.id === questionId)!.correct
      );
    }
    open('Confirm understanding: Packing');
    expect(useWorkplaceStore.getState().workplace.members[0].understood).toBe(true);
    for (const questionId of requiredChecks('mind')) {
      answer(
        'Adviser',
        questionId,
        WORKPLACE_CHECKS.find((check) => check.id === questionId)!.correct
      );
    }
    expect(useWorkplaceStore.getState().workplace.campaign?.adviserAcknowledged).toBe(true);
    expect(useWorkplaceStore.getState().workplace.members[0].sharing).toBe(false);
    open('Policy no: Packing');
    open('Hear simulated team responses');
    expect(useWorkplaceStore.getState().workplace.members[0].ballot).toBe(false);
    expect(useWorkplaceStore.getState().workplace.members[0].sharing).toBe(false);
  });

  it('records episode decisions and locks quality inspection until the active hold', () => {
    useWorkplaceStore.getState().startCampaign('toe-dip', 17);
    render(<WorkplaceLab />);
    open(CAMPAIGN_SHIFTS[0].choices[1].label);
    expect(useWorkplaceStore.getState().workplace.campaign?.decision).toBe('renegotiate');
    expect(screen.getByText('Recorded decision: renegotiate.')).toBeInTheDocument();
    act(() => {
      const current = useWorkplaceStore.getState().workplace;
      useWorkplaceStore.setState({
        workplace: { ...current, campaign: { ...current.campaign!, shift: 1, decision: null } },
      });
    });
    expect(
      screen.getByRole('button', { name: CAMPAIGN_SHIFTS[1].choices[0].label })
    ).toBeDisabled();
    act(() => {
      const current = useWorkplaceStore.getState().workplace;
      useWorkplaceStore.setState({ workplace: { ...current, phase: 'active', minute: 25 } });
    });
    expect(screen.getByRole('button', { name: CAMPAIGN_SHIFTS[1].choices[0].label })).toBeEnabled();
    open(CAMPAIGN_SHIFTS[1].choices[1].label);
    expect(useWorkplaceStore.getState().workplace.campaign?.inspectionComplete).toBe(false);
  });

  it('retains cumulative outcomes through the next shift instead of replaying the campaign', () => {
    const store = useWorkplaceStore.getState();
    store.startCampaign('team', 17);
    store.campaignDecision('renegotiate', 'coordinator');
    store.stop();
    render(<WorkplaceLab />);
    open('Review');
    expect(screen.getByText('Cumulative campaign evidence')).toBeInTheDocument();
    open('Continue to next campaign shift');
    const state = useWorkplaceStore.getState().workplace;
    expect(state.campaign?.shift).toBe(1);
    expect(state.campaign?.history).toHaveLength(1);
    expect(screen.getByText(`Shift 2 of 3: ${CAMPAIGN_SHIFTS[1].title}`)).toBeInTheDocument();
    open('Review');
    expect(screen.getByText(/Shift 1: Friday: the urgent order/)).toBeInTheDocument();
  });
});
