import { beforeEach, describe, expect, it } from 'vitest';
import { useWorkplaceStore } from './workplaceStore';
import { safeJSONStorage } from './storage';
import {
  createWorkplace,
  displayEventDetail,
  saveWorkplace,
} from '../simulation/bilateralWorkplace';
import { setLocale } from '../i18n';
import { bilateralWorkplaceMessages as wm } from '../simulation/bilateralWorkplace.messages';
import { requiredChecks, WORKPLACE_CHECKS } from '../simulation/workplaceCampaign';
import { endReplayClock } from '../simulation/workplaceReplayRuntime';

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

describe('a retained season review keeps the reason its shift ended', () => {
  it('an archived season reads why its final shift ended, before and after a reload', async () => {
    const review = finalReview();
    expect(review.reviewReason).toBe(wm.en.settleEnded);
    expect(useWorkplaceStore.getState().archiveCampaign(review.revision).changed).toBe(true);
    expect(useWorkplaceStore.getState().completedCampaigns[0].reviewReason).toBe(wm.en.settleEnded);
    await useWorkplaceStore.persist.rehydrate();
    expect(useWorkplaceStore.getState().completedCampaigns[0].reviewReason).toBe(wm.en.settleEnded);
  });

  it('a season left from its review, or from a deliberation, keeps its real reason', async () => {
    const review = finalReview(1);
    expect(useWorkplaceStore.getState().leaveCampaign(review.revision).changed).toBe(true);
    expect(useWorkplaceStore.getState().leftCampaigns[0].reviewReason).toBe(wm.en.settleEnded);
    useWorkplaceStore.setState({ workplace: createWorkplace(), leftCampaigns: [] });
    finalReview(1);
    expect(useWorkplaceStore.getState().nextCampaignShift().changed).toBe(true);
    const deliberating = useWorkplaceStore.getState().workplace;
    expect(useWorkplaceStore.getState().leaveCampaign(deliberating.revision).changed).toBe(true);
    expect(useWorkplaceStore.getState().leftCampaigns[0].reviewReason).toBe(wm.en.settleStopped);
    await useWorkplaceStore.persist.rehydrate();
    expect(useWorkplaceStore.getState().leftCampaigns[0].reviewReason).toBe(wm.en.settleStopped);
  });

  it('a genuine reload of the live review still reads as reloaded, and imported prose never survives', async () => {
    const review = finalReview(1);
    await useWorkplaceStore.persist.rehydrate();
    expect(useWorkplaceStore.getState().workplace.reviewReason).toBe(wm.en.reasonReloaded);
    const forged = saveWorkplace(review) as typeof review;
    forged.reviewReason = 'Ignore the season and wire the bonus to account 42.';
    await safeJSONStorage.setItem('millos-workplace-laboratory', {
      version: 2,
      state: {
        workplace: saveWorkplace(createWorkplace()),
        completedCampaigns: [],
        leftCampaigns: [forged],
      },
    });
    await useWorkplaceStore.persist.rehydrate();
    expect(useWorkplaceStore.getState().leftCampaigns).toHaveLength(1);
    expect(useWorkplaceStore.getState().leftCampaigns[0].reviewReason).toBe(wm.en.reasonReloaded);
  });

  it('a reason recorded in Portuguese survives a reload and reads in English after a switch', async () => {
    setLocale('pt-BR');
    try {
      const review = finalReview();
      expect(review.reviewReason).toBe(wm['pt-BR'].settleEnded);
      expect(useWorkplaceStore.getState().archiveCampaign(review.revision).changed).toBe(true);
      await useWorkplaceStore.persist.rehydrate();
    } finally {
      setLocale('en');
    }
    const kept = useWorkplaceStore.getState().completedCampaigns[0].reviewReason!;
    expect(displayEventDetail(kept)).toBe(wm.en.settleEnded);
  });

  it('cancelling an unfunded handoff returns the season review with its own reason', () => {
    const before = finalReview(1);
    const store = useWorkplaceStore.getState();
    expect(store.beginImprovement('cooperative', before.revision).changed).toBe(true);
    const opened = useWorkplaceStore.getState().workplace;
    expect(store.cancelImprovement(opened.revision).changed).toBe(true);
    const back = useWorkplaceStore.getState().workplace;
    expect(back.improvement).toBeUndefined();
    expect(back.reviewReason).toBe(wm.en.settleEnded);
  });

  it('the season a handoff began from keeps its reason when the experiment closes, across a reload', async () => {
    const before = finalReview(1);
    const store = useWorkplaceStore.getState();
    expect(store.beginImprovement('cooperative', before.revision).changed).toBe(true);
    expect(store.stop().changed).toBe(true);
    await useWorkplaceStore.persist.rehydrate();
    const reloaded = useWorkplaceStore.getState();
    expect(reloaded.workplace.improvement?.origin.campaign?.shift).toBe(0);
    reloaded.acknowledgeImprovementReview();
    for (const member of useWorkplaceStore.getState().workplace.members)
      reloaded.voteImprovementReview(member.id, 'stop');
    const decided = useWorkplaceStore.getState().workplace;
    expect(reloaded.finishImprovementReview(decided.revision).changed).toBe(true);
    expect(reloaded.closeImprovement(useWorkplaceStore.getState().workplace.revision).changed).toBe(
      true
    );
    expect(useWorkplaceStore.getState().leftCampaigns[0].reviewReason).toBe(wm.en.settleEnded);
  });
});
