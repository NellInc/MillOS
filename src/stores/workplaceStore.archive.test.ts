import { beforeEach, describe, expect, it } from 'vitest';
import { useWorkplaceStore } from './workplaceStore';
import { useOperationsCampaignStore } from './operationsCampaignStore';
import { useMaterialFlowStore } from './materialFlowStore';
import { safeJSONStorage } from './storage';
import { createWorkplace, saveWorkplace } from '../simulation/bilateralWorkplace';
import {
  campaignOutcomes,
  campaignTotals,
  requiredChecks,
  WORKPLACE_CHECKS,
} from '../simulation/workplaceCampaign';
import { beginReplayClock, endReplayClock } from '../simulation/workplaceReplayRuntime';

beforeEach(async () => {
  endReplayClock();
  await safeJSONStorage.removeItem('millos-workplace-laboratory');
  useWorkplaceStore.setState({
    workplace: createWorkplace(),
    completedCampaigns: [],
    leftCampaigns: [],
  });
});

function finalReview(shifts = 3) {
  const store = useWorkplaceStore.getState();
  expect(store.startCampaign('cooperative', 17).changed).toBe(true);
  for (let shift = 0; shift < shifts; shift++) {
    if (shift !== 1)
      expect(
        store.campaignDecision(shift === 0 ? 'keep-target' : 'protect-refusal', 'coordinator')
          .changed
      ).toBe(true);
    for (const actor of ['packing', 'mind']) {
      for (const check of requiredChecks(actor))
        store.answerCheck(
          actor,
          check,
          WORKPLACE_CHECKS.find((question) => question.id === check)!.correct
        );
      if (actor === 'packing') store.understand(actor);
    }
    store.vote('packing', true);
    store.simulateResponses();
    expect(store.activate(useWorkplaceStore.getState().workplace.revision).changed).toBe(true);
    while (useWorkplaceStore.getState().workplace.phase === 'active') {
      const state = useWorkplaceStore.getState().workplace;
      if (shift === 1 && state.minute >= 25 && !state.campaign?.decision)
        store.campaignDecision('inspect', 'quality');
      store.tick(5, 0, false);
    }
    if (shift < shifts - 1) expect(store.nextCampaignShift().changed).toBe(true);
  }
  return useWorkplaceStore.getState().workplace;
}

describe('completed cooperative campaign archive', () => {
  it('archives a completed review before opening a fresh non-authoritative exercise', () => {
    const before = finalReview();
    const physical = useMaterialFlowStore.getState();
    const operations = useOperationsCampaignStore.getState();
    expect(useWorkplaceStore.getState().archiveCampaign(before.revision).changed).toBe(true);
    const { workplace, completedCampaigns } = useWorkplaceStore.getState();
    expect(workplace.phase).toBe('idle');
    expect(workplace.revision).toBeGreaterThan(before.revision);
    expect(workplace.campaign).toBeNull();
    expect(
      workplace.members.every(
        (m) => !m.sharing && !m.understood && m.coverConsent === null && m.ballot === null
      )
    ).toBe(true);
    expect(completedCampaigns).toHaveLength(1);
    expect(campaignOutcomes(completedCampaigns[0])).toEqual(campaignOutcomes(before));
    expect(campaignOutcomes(completedCampaigns[0]).delivery.status).toBe('shortfall');
    expect(campaignTotals(completedCampaigns[0]).members).toEqual(campaignTotals(before).members);
    expect(completedCampaigns[0].members.every((m) => m.preference === '')).toBe(true);
    expect(useMaterialFlowStore.getState()).toBe(physical);
    expect(useOperationsCampaignStore.getState()).toBe(operations);
    expect(useWorkplaceStore.getState().startCampaign('team', 23).changed).toBe(true);
    expect(useWorkplaceStore.getState().completedCampaigns).toHaveLength(1);
  });

  it('rejects stale review authority and an ongoing matched replay', () => {
    const before = finalReview();
    expect(useWorkplaceStore.getState().archiveCampaign(before.revision - 1).changed).toBe(false);
    beginReplayClock(17, 1);
    expect(useWorkplaceStore.getState().archiveCampaign(before.revision).changed).toBe(false);
    endReplayClock();
    expect(useWorkplaceStore.getState().workplace).toBe(before);
    expect(useWorkplaceStore.getState().completedCampaigns).toEqual([]);
  });

  it('cannot erase a recovery debt or an unresolved objection', () => {
    const settled = finalReview();
    const owed = structuredClone(settled);
    owed.members[0].recoveryOwedMinutes = 5;
    useWorkplaceStore.setState({ workplace: owed });
    expect(useWorkplaceStore.getState().archiveCampaign(owed.revision).changed).toBe(false);
    const challenged = structuredClone(settled);
    challenged.objections.push({
      id: 'o-guard',
      actorId: 'packing',
      kind: 'burden',
      statement: 'Review burden',
      status: 'open',
      resolution: null,
    });
    useWorkplaceStore.setState({ workplace: challenged });
    expect(useWorkplaceStore.getState().archiveCampaign(challenged.revision).changed).toBe(false);
    expect(useWorkplaceStore.getState().completedCampaigns).toEqual([]);
  });

  it('retains the archive across reload without restoring private information or executable state', async () => {
    const review = finalReview();
    useWorkplaceStore.getState().archiveCampaign(review.revision);
    const outcome = campaignOutcomes(review);
    await useWorkplaceStore.persist.rehydrate();
    const saved = useWorkplaceStore.getState();
    expect(saved.workplace.phase).toBe('idle');
    expect(saved.completedCampaigns).toHaveLength(1);
    expect(campaignOutcomes(saved.completedCampaigns[0])).toEqual(outcome);
    expect(
      saved.completedCampaigns[0].members.every(
        (m) => !m.sharing && !m.understood && m.coverConsent === null
      )
    ).toBe(true);
    expect(typeof saved.archiveCampaign).toBe('function');
  });

  it('migrates version-one saves and discards malformed imported archives', async () => {
    const old = createWorkplace('workshop', 17);
    await safeJSONStorage.setItem('millos-workplace-laboratory', {
      version: 1,
      state: {
        workplace: saveWorkplace(old),
        completedCampaigns: [{ phase: 'active', cash: 1e99 }],
        archiveCampaign: 'poison',
      },
    });
    await useWorkplaceStore.persist.rehydrate();
    expect(useWorkplaceStore.getState().workplace.mode).toBe('workshop');
    expect(useWorkplaceStore.getState().completedCampaigns).toEqual([]);
    expect(typeof useWorkplaceStore.getState().archiveCampaign).toBe('function');
  });
});

describe('leaving a cooperative season early', () => {
  it('keeps the earned pay and receipts as a season left early, not a completed one, across a reload', async () => {
    const before = finalReview(1);
    expect(before.phase).toBe('review');
    expect(before.campaign?.shift).toBe(0);
    const store = useWorkplaceStore.getState();
    expect(store.leaveCampaign(before.revision - 1).changed).toBe(false);
    expect(store.leaveCampaign(before.revision).changed).toBe(true);
    const { workplace, completedCampaigns, leftCampaigns } = useWorkplaceStore.getState();
    expect(workplace.phase).toBe('idle');
    expect(workplace.campaign).toBeNull();
    expect(workplace.revision).toBeGreaterThan(before.revision);
    expect(completedCampaigns).toEqual([]);
    expect(leftCampaigns).toHaveLength(1);
    expect(leftCampaigns[0].campaign?.shift).toBe(0);
    expect(campaignOutcomes(leftCampaigns[0]).accounts).toEqual(campaignOutcomes(before).accounts);
    expect(campaignOutcomes(leftCampaigns[0]).accounts.wages).toBeCloseTo(108);
    expect(campaignTotals(leftCampaigns[0]).members).toEqual(campaignTotals(before).members);
    expect(leftCampaigns[0].members.every((m) => m.preference === '')).toBe(true);
    await useWorkplaceStore.persist.rehydrate();
    const saved = useWorkplaceStore.getState();
    expect(saved.workplace.phase).toBe('idle');
    expect(saved.completedCampaigns).toEqual([]);
    expect(saved.leftCampaigns).toHaveLength(1);
    expect(campaignOutcomes(saved.leftCampaigns[0]).accounts).toEqual(
      campaignOutcomes(before).accounts
    );
    expect(saved.startCampaign('team', 23).changed).toBe(true);
  });

  it('leaves from a later deliberation, and refuses a running shift, a debt, the final review and a replay', () => {
    const reviewed = finalReview(1);
    const store = useWorkplaceStore.getState();
    expect(store.nextCampaignShift().changed).toBe(true);
    const deliberating = useWorkplaceStore.getState().workplace;
    expect(deliberating.phase).toBe('deliberating');
    beginReplayClock(17, 1);
    expect(store.leaveCampaign(deliberating.revision).changed).toBe(false);
    endReplayClock();
    const running = structuredClone(deliberating);
    running.phase = 'active';
    running.finance.wageReserve = 108;
    useWorkplaceStore.setState({ workplace: running });
    expect(store.leaveCampaign(running.revision).changed).toBe(false);
    const owed = structuredClone(reviewed);
    owed.members[0].recoveryOwedMinutes = 5;
    useWorkplaceStore.setState({ workplace: owed });
    expect(store.leaveCampaign(owed.revision).changed).toBe(false);
    useWorkplaceStore.setState({ workplace: deliberating });
    expect(store.leaveCampaign(deliberating.revision).changed).toBe(true);
    const left = useWorkplaceStore.getState().leftCampaigns[0];
    // The unworked deliberation is recorded as stopped, never as a worked shift.
    expect(left.phase).toBe('review');
    expect(left.campaign?.shift).toBe(1);
    expect(left.minute).toBe(0);
    expect(left.campaign?.history).toHaveLength(1);
    expect(useWorkplaceStore.getState().workplace.campaign).toBeNull();
    useWorkplaceStore.setState({ workplace: createWorkplace(), leftCampaigns: [] });
    const final = finalReview();
    expect(useWorkplaceStore.getState().leaveCampaign(final.revision).changed).toBe(false);
    expect(useWorkplaceStore.getState().leftCampaigns).toEqual([]);
  });

  it('discards a malformed left-season record on reload', async () => {
    await safeJSONStorage.setItem('millos-workplace-laboratory', {
      version: 2,
      state: {
        workplace: saveWorkplace(createWorkplace()),
        completedCampaigns: [],
        leftCampaigns: [{ phase: 'active', cash: 1e99 }, saveWorkplace(createWorkplace())],
      },
    });
    await useWorkplaceStore.persist.rehydrate();
    expect(useWorkplaceStore.getState().leftCampaigns).toEqual([]);
  });
});

describe('closing a handoff experiment opened from a season', () => {
  it.each([
    [1, 'leftCampaigns'],
    [3, 'completedCampaigns'],
  ] as const)(
    'keeps the season it began from (%i shifts) in %s once the decided experiment closes',
    (shifts, kept) => {
      const before = finalReview(shifts);
      const store = useWorkplaceStore.getState();
      expect(store.beginImprovement('cooperative', before.revision).changed).toBe(true);
      // A final season review leaves too little cash for a paid trial, so the
      // team ends the shift unworked and decides it.
      expect(store.stop().changed).toBe(true);
      expect(useWorkplaceStore.getState().workplace.phase).toBe('review');
      store.acknowledgeImprovementReview();
      for (const member of useWorkplaceStore.getState().workplace.members)
        store.voteImprovementReview(member.id, 'stop');
      const decided = useWorkplaceStore.getState().workplace;
      expect(store.finishImprovementReview(decided.revision).changed).toBe(true);
      const revision = useWorkplaceStore.getState().workplace.revision;
      expect(store.closeImprovement(revision).changed).toBe(true);
      const after = useWorkplaceStore.getState();
      expect(after.workplace).toMatchObject({ phase: 'idle', campaign: null });
      expect(after.workplace.improvement).toBeUndefined();
      expect(after[kept]).toHaveLength(1);
      expect(after[kept][0].campaign?.shift).toBe(before.campaign?.shift);
      expect(campaignOutcomes(after[kept][0]).accounts).toEqual(campaignOutcomes(before).accounts);
      expect(after.startCampaign('team', 23).changed).toBe(true);
    }
  );
});
