import { beforeEach, describe, expect, it } from 'vitest';
import {
  createWorkplace,
  restoreWorkplace,
  saveWorkplace,
  transitionWorkplace,
  type WorkplaceCommand,
} from '../simulation/bilateralWorkplace';
import {
  campaignOutcomes,
  campaignPressure,
  mondayMinute,
  requiredChecks,
  shiftResumable,
  WORKPLACE_CHECKS,
} from '../simulation/workplaceCampaign';
import { useWorkplaceStore } from './workplaceStore';
import type { WorkplaceState } from '../types/workplace';

/** A teaching season whose final shift a reload paused part-way. */
function pausedFinalShift(): WorkplaceState {
  let state: WorkplaceState = createWorkplace();
  const run = (command: WorkplaceCommand) => {
    const result = transitionWorkplace(state, command);
    state = result.state;
    return result;
  };
  const agree = () => {
    for (const actor of ['packing', 'mind'])
      for (const id of requiredChecks(actor))
        run({
          type: 'answerCheck',
          args: [actor, id, WORKPLACE_CHECKS.find((q) => q.id === id)!.correct],
        });
    run({ type: 'understand', args: ['packing'] });
    run({ type: 'vote', args: ['packing', true] });
    if (state.planId === 'cover') run({ type: 'consentToCover', args: ['packing', true] });
    run({ type: 'simulateResponses', args: [] });
  };
  run({ type: 'startCampaign', args: ['cooperative', 17] });
  for (let shift = 0; shift < 3; shift++) {
    if (shift !== 1)
      run({
        type: 'campaignDecision',
        args: [shift === 0 ? 'keep-target' : 'protect-refusal', 'coordinator'],
      });
    run({ type: 'respondToPressure', args: [campaignPressure(state)!.id, 'protect-boundary'] });
    agree();
    expect(run({ type: 'activate', args: [state.revision] }).changed).toBe(true);
    if (shift === 2) {
      run({ type: 'tick', args: [20, 0, false] });
      break;
    }
    while (state.phase === 'active') {
      if (
        state.campaign?.shift === 1 &&
        state.minute >= mondayMinute(state) &&
        state.campaign.decision === null
      )
        run({ type: 'campaignDecision', args: ['inspect', 'quality'] });
      run({ type: 'tick', args: [5, 0, false] });
    }
    while (state.members.some((m) => m.recoveryOwedMinutes > 0))
      run({ type: 'tick', args: [5, 0, false] });
    expect(run({ type: 'nextCampaignShift', args: [] }).changed).toBe(true);
  }
  return restoreWorkplace(saveWorkplace(state));
}

beforeEach(() => {
  useWorkplaceStore.setState({
    participationMode: 'solo',
    turn: null,
    workplace: createWorkplace(),
    completedCampaigns: [],
    leftCampaigns: [],
  });
});

describe('Workplace lane, seventh pass: a final shift a reload paused', () => {
  it('is not archived as a completed season while it can still resume', () => {
    const paused = pausedFinalShift();
    expect(paused.campaign?.shift).toBe(2);
    expect(shiftResumable(paused)).toBe(true);
    useWorkplaceStore.setState({ workplace: paused });
    const result = useWorkplaceStore.getState().archiveCampaign(paused.revision);
    // An archived season can never resume, so its record would read
    // "agreement pending" for good.
    const archived = useWorkplaceStore.getState().completedCampaigns;
    expect(archived.map((review) => campaignOutcomes(review).agreement.status)).toEqual([]);
    expect(result.changed).toBe(false);
    expect(result.reason).toMatch(/paused/);
    expect(useWorkplaceStore.getState().workplace).toBe(paused);
  });

  it('archives once the resumed shift is ended', () => {
    useWorkplaceStore.setState({ workplace: pausedFinalShift() });
    const store = useWorkplaceStore.getState();
    expect(store.resumeShift(store.workplace.revision).changed).toBe(true);
    expect(useWorkplaceStore.getState().stop().changed).toBe(true);
    const ended = useWorkplaceStore.getState().workplace;
    expect(shiftResumable(ended)).toBe(false);
    expect(useWorkplaceStore.getState().archiveCampaign(ended.revision).changed).toBe(true);
    expect(useWorkplaceStore.getState().completedCampaigns).toHaveLength(1);
  });
});
