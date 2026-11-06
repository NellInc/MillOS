import { afterEach, describe, expect, it } from 'vitest';
import { displayEventDetail } from './bilateralWorkplace';
import { bilateralWorkplaceMessages as wm } from './bilateralWorkplace.messages';
import { workplaceCampaignMessages as cm } from './workplaceCampaign.messages';
import { workplaceImprovementMessages as im } from './workplaceImprovement.messages';
import { CAMPAIGN_PRESSURES } from './workplaceCampaign';
import { setLocale } from '../i18n';

afterEach(() => setLocale('en'));

const fill = (template: string, params: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (whole, name: string) => params[name] ?? whole);

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
    const recorded = fill(wm.en.evSurplusDecided, { destination: 'members', amount: '12.00' });
    expect(displayEventDetail(recorded)).not.toMatch(/^members:/);
    expect(displayEventDetail(recorded)).toBe(
      fill(wm.en.evSurplusDecided, {
        destination: wm.en.recordDestinationMembers,
        amount: '12.00',
      })
    );
    setLocale('pt-BR');
    expect(displayEventDetail(recorded)).toBe(
      fill(wm['pt-BR'].evSurplusDecided, {
        destination: wm['pt-BR'].recordDestinationMembers,
        amount: '12,00',
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
