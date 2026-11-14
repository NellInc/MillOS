/**
 * The game's own milestones that do not need the plant to run (plan 2.3,
 * report 09 P3): a quality hold settled, a cooperative season seen through,
 * a Chronicle charter signed. Each is earned through its store's own action,
 * never by a state that was already true or that arrived by a replace. The
 * plant-driven ones (on-time delivery, A shift, programme, challenge) are in
 * achievementsStore.session.gameplay.test.ts. Decision Review's own count
 * (report 09 D4) is pinned here too.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAchievementTracker } from '../hooks/useAchievementTracker';
import { useAchievementsStore } from './achievementsStore';
import { useQCLabStore } from './qcLabStore';
import { useWorkplaceStore } from './workplaceStore';
import { useChronicleStore } from './chronicleStore';
import { useOperationsCampaignStore } from './operationsCampaignStore';
import { useProductionStore } from './productionStore';
import { useUIStore } from './uiStore';
import { useGameSimulationStore } from './gameSimulationStore';
import { useMaterialFlowStore } from './materialFlowStore';
import { DEFAULT_CHARTER } from '../chronicle/charter';
import { createInitialState } from '../chronicle/engine';
import {
  createWorkplace,
  transitionWorkplace,
  type WorkplaceCommand,
} from '../simulation/bilateralWorkplace';
import {
  CAMPAIGN_PRESSURES,
  requiredChecks,
  WORKPLACE_CHECKS,
} from '../simulation/workplaceCampaign';
import type { WorkplaceState } from '../types/workplace';
import type { AIDecision } from '../types';

const achievement = (id: string) => useAchievementsStore.getState().getAchievement(id);

/** A teaching season run to the start of its third and final shift, by its own transitions. */
function finalShiftUnderway(): WorkplaceState {
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
    run({ type: 'respondToPressure', args: [CAMPAIGN_PRESSURES[shift].id, 'protect-boundary'] });
    agree();
    expect(run({ type: 'activate', args: [state.revision] }).changed).toBe(true);
    if (shift === 2) {
      run({ type: 'tick', args: [20, 0, false] });
      break;
    }
    while (state.phase === 'active') {
      if (state.campaign?.shift === 1 && state.minute >= 25 && state.campaign.decision === null)
        run({ type: 'campaignDecision', args: ['inspect', 'quality'] });
      run({ type: 'tick', args: [5, 0, false] });
    }
    while (state.members.some((m) => m.recoveryOwedMinutes > 0))
      run({ type: 'tick', args: [5, 0, false] });
    expect(run({ type: 'nextCampaignShift', args: [] }).changed).toBe(true);
  }
  return state;
}

beforeEach(() => {
  useAchievementsStore.getState().resetAchievements();
  useUIStore.setState({ alerts: [] });
  useQCLabStore.getState().resetQCLab();
  useMaterialFlowStore.getState().resetMaterialFlow();
  useOperationsCampaignStore.getState().resetCampaign();
  useChronicleStore.setState({ chronicle: createInitialState() });
  useProductionStore.setState({ aiDecisions: [], machines: [] });
  useWorkplaceStore.setState({
    participationMode: 'solo',
    turn: null,
    workplace: createWorkplace(),
    completedCampaigns: [],
    leftCampaigns: [],
  });
});
afterEach(() => {
  useChronicleStore.setState({ chronicle: createInitialState() });
  useGameSimulationStore.getState().resetGameState();
  useAchievementsStore.getState().resetAchievements();
});

describe('Hold Cleared', () => {
  it('is earned when a recall settles a held batch, not when the hold is raised', () => {
    const hook = renderHook(() => useAchievementTracker());
    const qc = useQCLabStore.getState();
    const alertId = qc.triggerContaminationAlert({ batchIds: ['batch-test-1'], severity: 'high' });
    expect(achievement('first-hold-resolved')?.unlocked).toBe(false);
    expect(
      useQCLabStore
        .getState()
        .resolveContaminationAlert(alertId, 'recalled', 'Operator', 'Recalled', ['batch-test-1'])
    ).toBe(true);
    expect(achievement('first-hold-resolved')?.unlocked).toBe(true);
    hook.unmount();
  });

  it('is not earned by a lab restored with its investigations already closed', () => {
    const qc = useQCLabStore.getState();
    const alertId = qc.triggerContaminationAlert({ batchIds: ['batch-test-1'] });
    useQCLabStore
      .getState()
      .resolveContaminationAlert(alertId, 'recalled', 'Operator', 'Recalled', ['batch-test-1']);
    const settled = structuredClone(useQCLabStore.getState().qcLab);
    useQCLabStore.getState().resetQCLab();
    const hook = renderHook(() => useAchievementTracker());
    useQCLabStore.setState({ qcLab: settled });
    expect(achievement('first-hold-resolved')?.unlocked).toBe(false);
    hook.unmount();
  });
});

describe('Season Through', () => {
  it('is earned when the final shift ends, not by a season put in place at its end', () => {
    const underway = finalShiftUnderway();
    expect(underway.campaign?.shift).toBe(2);
    expect(underway.phase).toBe('active');
    const hook = renderHook(() => useAchievementTracker());
    // Put in place (a different season from the one the store held): no event.
    useWorkplaceStore.setState({ workplace: underway });
    expect(achievement('first-season')?.unlocked).toBe(false);
    // The player ends the final shift (the store's own Stop).
    expect(useWorkplaceStore.getState().stop().changed).toBe(true);
    const ended = useWorkplaceStore.getState().workplace;
    expect(ended).toMatchObject({ phase: 'review', campaign: { shift: 2 } });
    expect(achievement('first-season')?.unlocked).toBe(true);
    hook.unmount();
  });

  it('is earned when the final shift runs to its end on the clock (run, not stopped)', () => {
    const hook = renderHook(() => useAchievementTracker());
    useWorkplaceStore.setState({ workplace: finalShiftUnderway() });
    const phase = () => useWorkplaceStore.getState().workplace.phase;
    for (let step = 0; step < 200 && phase() === 'active'; step++)
      useWorkplaceStore.getState().tick(5, 0, false);
    expect(useWorkplaceStore.getState().workplace).toMatchObject({
      phase: 'review',
      campaign: { shift: 2 },
    });
    expect(achievement('first-season')?.unlocked).toBe(true);
    hook.unmount();
  });

  it('is not earned by a season already at its final review', () => {
    useWorkplaceStore.setState({ workplace: finalShiftUnderway() });
    useWorkplaceStore.getState().stop();
    const reviewed = useWorkplaceStore.getState().workplace;
    useWorkplaceStore.setState({ workplace: createWorkplace() });
    const hook = renderHook(() => useAchievementTracker());
    useWorkplaceStore.setState({ workplace: reviewed });
    expect(achievement('first-season')?.unlocked).toBe(false);
    hook.unmount();
  });
});

describe('Charter Signed', () => {
  it('is earned by signing, and not by a Chronicle already signed when tracking starts', () => {
    useChronicleStore.getState().sign(DEFAULT_CHARTER, 21);
    const hook = renderHook(() => useAchievementTracker());
    expect(achievement('charter-signed')?.unlocked).toBe(false);
    hook.unmount();

    useChronicleStore.setState({ chronicle: createInitialState() });
    const again = renderHook(() => useAchievementTracker());
    useChronicleStore.getState().sign(DEFAULT_CHARTER, 21);
    expect(achievement('charter-signed')?.unlocked).toBe(true);
    again.unmount();
  });
});

describe('Decision Review counts deferrals, First Preference counts answers', () => {
  const pending = (id: string): AIDecision =>
    ({
      id,
      timestamp: new Date(),
      type: 'optimization',
      action: 'Adjust roller gap',
      reasoning: 'Test',
      confidence: 80,
      impact: 'Test',
      status: 'pending',
      priority: 'medium',
    }) as AIDecision;

  it('counts each response once, as its own kind', () => {
    useProductionStore.setState({ aiDecisions: [pending('d-1'), pending('d-2')] });
    const hook = renderHook(() => useAchievementTracker());
    const production = useProductionStore.getState();
    production.recordDecisionResponse('d-1', 'accepted');
    expect(achievement('first-preference')?.unlocked).toBe(true);
    expect(achievement('vote-participant')?.progress).toBe(0);

    production.recordDecisionResponse('d-2', 'deferred');
    expect(achievement('vote-participant')?.progress).toBe(1);
    expect(achievement('collaborative-spirit')?.progress).toBe(1);
    // Answered on its return: the answer counts as well, the deferral not again.
    useProductionStore.getState().recordDecisionResponse('d-2', 'accepted');
    expect(achievement('collaborative-spirit')?.progress).toBe(2);
    expect(achievement('vote-participant')?.progress).toBe(1);
    hook.unmount();
  });
});
