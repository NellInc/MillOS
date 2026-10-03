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
  useWorkplaceStore.setState({ workplace: createWorkplace(), completedCampaigns: [] });
});

function finalReview() {
  const store = useWorkplaceStore.getState();
  expect(store.startCampaign('cooperative', 17).changed).toBe(true);
  for (let shift = 0; shift < 3; shift++) {
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
    if (shift < 2) expect(store.nextCampaignShift().changed).toBe(true);
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
