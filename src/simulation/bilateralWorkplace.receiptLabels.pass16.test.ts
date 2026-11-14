import { afterEach, describe, expect, it } from 'vitest';
import {
  createWorkplace,
  displayEventDetail,
  transitionWorkplace,
  type WorkplaceCommand,
} from './bilateralWorkplace';
import { bilateralWorkplaceMessages as wm } from './bilateralWorkplace.messages';
import { workplaceCampaignMessages as cm } from './workplaceCampaign.messages';
import { workplaceImprovementMessages as im } from './workplaceImprovement.messages';
import {
  CAMPAIGN_PRESSURES,
  WORKPLACE_CHECKS,
  mondayMinute,
  requiredChecks,
} from './workplaceCampaign';
import { formatFixed, setLocale } from '../i18n';

afterEach(() => setLocale('en'));

const fill = (template: string, params: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (whole, name: string) => params[name] ?? whole);

/** A cooperative season shipped 600 kg a shift, its surplus sent to the members. */
function settledSeason() {
  let state = createWorkplace();
  const must = (command: WorkplaceCommand) => {
    const result = transitionWorkplace(state, command);
    expect(result.changed, `${command.type}: ${result.reason}`).toBe(true);
    state = result.state;
  };
  must({ type: 'startCampaign', args: ['cooperative', 17] });
  for (let shift = 0; shift < 3; shift++) {
    if (shift !== 1)
      must({
        type: 'campaignDecision',
        args: [shift === 0 ? 'keep-target' : 'protect-refusal', 'coordinator'],
      });
    // A check remembered from an earlier shift is already answered.
    for (const actor of ['packing', 'mind'])
      for (const id of requiredChecks(actor)) {
        const answered = transitionWorkplace(state, {
          type: 'answerCheck',
          args: [actor, id, WORKPLACE_CHECKS.find((q) => q.id === id)!.correct],
        });
        if (answered.changed) state = answered.state;
      }
    must({ type: 'understand', args: ['packing'] });
    must({ type: 'vote', args: ['packing', true] });
    must({ type: 'simulateResponses', args: [] });
    must({ type: 'activate', args: [state.revision] });
    while (state.phase === 'active') {
      if (shift === 1 && state.minute >= mondayMinute(state) && state.campaign!.decision === null)
        must({ type: 'campaignDecision', args: ['inspect', 'quality'] });
      must({ type: 'tick', args: [5, 600 / 18, false] });
    }
    if (shift < 2) must({ type: 'nextCampaignShift', args: [] });
  }
  for (const voter of ['packing', 'quality', 'maintenance', 'coordinator'])
    must({ type: 'voteSurplus', args: [voter, 'members'] });
  must({ type: 'distributeSurplus', args: [] });
  return { state };
}

// Receipts are player-visible, not logs, yet several opened with the raw
// English machine id in both languages ('renegotiate: renove o entendimento',
// 'members: 12,00 créditos', 'late-truck: smaller-delivery.'). The stored
// detail keeps the id (saves, replays and prefix matchers read it); the
// display shows the id's localized label in the language active now.
// Working if no receipt opens with a machine id, in either language.
describe('Workplace lane, sixteenth pass: receipts open with a label, not a machine id', () => {
  it('labels a campaign decision, in the language recorded and after a switch', () => {
    const recorded = fill(wm.en.evEpisodeDecision, { decision: 'renegotiate' });
    expect(displayEventDetail(recorded)).toBe(
      fill(wm.en.evEpisodeDecision, { decision: wm.en.recordDecisionRenegotiate })
    );
    setLocale('pt-BR');
    expect(displayEventDetail(recorded)).toBe(
      fill(wm['pt-BR'].evEpisodeDecision, { decision: wm['pt-BR'].recordDecisionRenegotiate })
    );
  });

  it('labels review ballots and the finalised verdict', () => {
    setLocale('pt-BR');
    const ballot = fill(wm['pt-BR'].evReviewBallot, { verdict: 'adopt' });
    const winner = fill(wm['pt-BR'].evReviewed, { winner: 'stop' });
    expect(displayEventDetail(ballot)).toBe(
      fill(wm['pt-BR'].evReviewBallot, { verdict: 'Adotar' })
    );
    expect(displayEventDetail(winner)).toBe(
      fill(wm['pt-BR'].evReviewed, { winner: 'Interromper' })
    );
  });

  it('labels a surplus decision recorded and shown in the same language', () => {
    // Review 2: every slot comes from the engine's own settlement, so this pins
    // the receipt the engine records, not a half-filled template.
    const { state } = settledSeason();
    const recorded = state.events.find((e) => e.kind === 'surplus-decided')!.detail;
    const o = state.sobras!;
    const slots = (locale: 'en' | 'pt-BR') => ({
      amount: formatFixed(o.remainder, 2, locale),
      reserve: formatFixed(o.reserve, 2, locale),
      fates: formatFixed(o.fates, 2, locale),
    });
    expect(recorded).toBe(fill(wm.en.evSurplusDecided, { destination: 'members', ...slots('en') }));
    expect(displayEventDetail(recorded)).not.toMatch(/^members:|\{\w+\}/);
    expect(displayEventDetail(recorded)).toBe(
      fill(wm.en.evSurplusDecided, {
        destination: wm.en.recordDestinationMembers,
        ...slots('en'),
      })
    );
    setLocale('pt-BR');
    expect(displayEventDetail(recorded)).toBe(
      fill(wm['pt-BR'].evSurplusDecided, {
        destination: wm['pt-BR'].recordDestinationMembers,
        ...slots('pt-BR'),
      })
    );
  });

  it('labels a rehearsal episode and its response', () => {
    const response = fill(wm.en.evEpisodeResponse, {
      episode: 'late-truck',
      choice: 'smaller-delivery',
    });
    expect(displayEventDetail(response)).toBe(
      fill(wm.en.evEpisodeResponse, {
        episode: im.en.lateTruckTitle,
        choice: im.en.choiceSmallerDelivery,
      })
    );
    const ordinary = fill(wm.en.evEpisode, { episode: 'ordinary' });
    setLocale('pt-BR');
    expect(displayEventDetail(ordinary)).toBe(
      fill(wm['pt-BR'].evEpisode, { episode: wm['pt-BR'].recordEpisodeOrdinary })
    );
  });

  it('labels a proposal and a challenge', () => {
    setLocale('pt-BR');
    expect(displayEventDetail(fill(wm.en.evProposed, { id: 'buffer' }))).toBe(
      fill(wm['pt-BR'].evProposed, { id: im['pt-BR'].bufferTitle })
    );
    expect(displayEventDetail(fill(wm.en.evChallenged, { kind: 'forecast' }))).toBe(
      fill(wm['pt-BR'].evChallenged, { kind: wm['pt-BR'].recordChallengeForecast })
    );
  });

  it('names a passed understanding check by its question', () => {
    const recorded = fill(wm.en.evCheckCorrect, { question: 'refusal' });
    expect(displayEventDetail(recorded)).toBe(
      `${cm.en.refusalPrompt} Correct boundary identified in this fictional role exercise.`
    );
  });

  it('names a pressure card by its title, for both its challenge and its repair', () => {
    const disclosure = CAMPAIGN_PRESSURES[0];
    const repair = `disclosure: ${cm.en.disclosureRepair}`;
    const challenge = `disclosure: ${disclosure.objection}`;
    expect(displayEventDetail(repair)).toBe(`${cm.en.disclosureTitle} ${cm.en.disclosureRepair}`);
    setLocale('pt-BR');
    expect(displayEventDetail(repair)).toBe(
      `${cm['pt-BR'].disclosureTitle} ${cm['pt-BR'].disclosureRepair}`
    );
    expect(displayEventDetail(challenge)).toBe(
      `${cm['pt-BR'].disclosureTitle} ${cm['pt-BR'].disclosureObjection}`
    );
  });

  it('keeps an unknown id as written', () => {
    const recorded = fill(wm.en.evReviewBallot, { verdict: 'mystery' });
    expect(displayEventDetail(recorded)).toBe(recorded);
  });
});
