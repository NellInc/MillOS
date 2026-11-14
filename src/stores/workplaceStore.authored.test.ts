import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { useWorkplaceStore } from './workplaceStore';
import { useOperationsCampaignStore } from './operationsCampaignStore';
import { useGameSimulationStore } from './gameSimulationStore';
import {
  authoredWhy,
  createWorkplace,
  restoreWorkplace,
  saveWorkplace,
  transitionWorkplace,
} from '../simulation/bilateralWorkplace';
import { WORKPLACE_CHECKS, mondayMinute, requiredChecks } from '../simulation/workplaceCampaign';
import { endReplayClock } from '../simulation/workplaceReplayRuntime';
import { useWorkplaceAutoplay } from '../simulation/workplaceAutoplay';
import { fulfilFirstDelivery } from '../test/firstDelivery';
import { LOCALES, setLocale } from '../i18n';

const FIXTURES = join(__dirname, '../simulation/__tests__/fixtures/workplace-saves');
const fixture = (name: string) => JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'));

beforeEach(() => {
  setLocale('en');
  useWorkplaceAutoplay.getState().pause();
  endReplayClock();
  useGameSimulationStore.setState({
    emergencyActive: false,
    emergencyDrillMode: false,
    preEmergencyMachineStatuses: new Map(),
  });
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
  useOperationsCampaignStore.getState().initializeCampaign();
  fulfilFirstDelivery();
  useWorkplaceStore.setState({
    workplace: createWorkplace(),
    participationMode: 'solo',
    turn: null,
    completedCampaigns: [],
    leftCampaigns: [],
  });
});

const store = () => useWorkplaceStore.getState();
const workplace = () => store().workplace;
const must = (result: { changed: boolean; reason: string | null }) => {
  expect(result.changed, result.reason ?? '').toBe(true);
};

/** Packing's own part: its checks, understanding and ballot, then the others. */
function agreeAsPacking() {
  for (const id of requiredChecks('packing')) {
    const q = WORKPLACE_CHECKS.find((c) => c.id === id)!;
    if (workplace().campaign?.checks.packing?.[id] !== q.correct)
      must(store().answerCheck('packing', id, q.correct));
  }
  if (!workplace().members[0].understood) must(store().understand('packing'));
  if (workplace().members[0].ballot !== true) must(store().vote('packing', true));
  if (workplace().planId === 'cover' && workplace().members[0].coverConsent !== true)
    must(store().consentToCover('packing', true));
  store().simulateResponses({});
}

function runShift(shippedPerTick = 0) {
  must(store().activate(workplace().revision));
  for (let i = 0; i < 200 && workplace().phase === 'active'; i++)
    store().tick(5, shippedPerTick, false);
}

describe('5.3: each call belongs to its role in a solo season (D5)', () => {
  it("the Coordinator makes Friday's call itself, with its reason, and the player cannot", () => {
    must(store().startCampaign('team', 17));
    const s = workplace();
    expect(s.campaign?.decision).toBe('renegotiate');
    const said = s.events.find((e) => e.kind === 'episode-decision');
    expect(said?.actorId).toBe('coordinator');
    expect(authoredWhy(s, 'coordinator')).toMatch(/stable sequence/);
    const refused = store().campaignDecision('keep-target', 'coordinator');
    expect(refused.changed).toBe(false);
    expect(refused.reasonCopy?.key).toBe('authoredRoleAnswers');
  });

  it('the adviser answers its own checks, so Packing alone approves the first shift', () => {
    must(store().startCampaign('team', 17));
    agreeAsPacking();
    expect(workplace().campaign?.adviserAcknowledged).toBe(true);
    must(store().activate(workplace().revision));
  });

  it("Quality starts Monday's inspection itself when the line holds", () => {
    must(store().startCampaign('team', 17));
    agreeAsPacking();
    runShift();
    must(store().nextCampaignShift());
    agreeAsPacking();
    must(store().activate(workplace().revision));
    const refused = store().campaignDecision('inspect', 'quality');
    expect(refused.changed).toBe(false);
    store().tick(mondayMinute(workplace()) + 1, 0, false);
    const s = workplace();
    expect(s.campaign?.decision).toBe('inspect');
    expect(s.campaign?.inspectionUntilMinute).not.toBeNull();
    expect(s.events.find((e) => e.kind === 'inspection-started')?.actorId).toBe('quality');
  });

  it("the Coordinator makes Thursday's call when the last shift opens", () => {
    must(store().startCampaign('team', 17));
    for (let shift = 0; shift < 2; shift++) {
      agreeAsPacking();
      runShift();
      must(store().nextCampaignShift());
    }
    expect(workplace().campaign?.shift).toBe(2);
    expect(workplace().campaign?.decision).toBe('protect-refusal');
  });

  it('a save from before 5b with the call still open gets it made on resume', () => {
    useWorkplaceStore.setState({
      workplace: restoreWorkplace(fixture('2026-11-13-pre-5b-shift0-deliberating-open-call.json')),
    });
    expect(workplace().campaign?.decision).toBeNull();
    must(store().resumeShift(workplace().revision));
    expect(workplace().campaign?.decision).not.toBeNull();
    agreeAsPacking();
    must(store().activate(workplace().revision));
  });

  it('a Monday saved held before 5b is inspected once it resumes', () => {
    useWorkplaceStore.setState({
      workplace: restoreWorkplace(fixture('2026-11-13-pre-5b-monday-held-uninspected.json')),
    });
    must(store().resumeShift(workplace().revision));
    agreeAsPacking();
    must(store().activate(workplace().revision));
    store().tick(1, 0, false);
    expect(workplace().campaign?.decision).toBe('inspect');
    for (let i = 0; i < 40 && workplace().phase === 'active'; i++) store().tick(5, 0, false);
    expect(workplace().minute).toBe(90);
  });

  it('the chair ballots: the player casts only Packing’s; the others vote from their values', () => {
    must(store().startCampaign('cooperative', 17));
    expect(store().elect('quality', 'coordinator').reasonCopy?.key).toBe('authoredRoleAnswers');
    const ballots = workplace().chairBallots;
    expect(ballots.packing).toBeUndefined();
    expect(Object.keys(ballots).sort()).toEqual(['coordinator', 'maintenance', 'quality']);
    expect(workplace().electedChair).toBeNull();
    must(store().elect('packing', ballots.coordinator));
    expect(workplace().electedChair).toBe(ballots.coordinator);
  });

  it('the sobras ballots: Packing’s alone is the player’s; the season settles', () => {
    must(store().startCampaign('cooperative', 17));
    for (let shift = 0; shift < 3; shift++) {
      agreeAsPacking();
      runShift(600 / 18);
      if (shift < 2) must(store().nextCampaignShift());
    }
    const s = workplace();
    expect(Object.keys(s.surplusBallots).sort()).toEqual(['coordinator', 'maintenance', 'quality']);
    expect(store().voteSurplus('quality', 'community').reasonCopy?.key).toBe('authoredRoleAnswers');
    must(store().voteSurplus('packing', 'members'));
    must(store().distributeSurplus());
    expect(workplace().sobras?.destination).toBe('members');
  });

  it('a final review saved with the player’s ballots for others keeps them and settles', () => {
    useWorkplaceStore.setState({
      workplace: restoreWorkplace(fixture('2026-11-13-pre-5b-final-review-ballots-cast.json')),
    });
    must(store().voteSurplus('packing', 'reserve'));
    must(store().voteSurplus('packing', 'members'));
    must(store().distributeSurplus());
  });

  it('the handoff verdict: the player casts Packing’s; the others answer from their values', () => {
    let s = createWorkplace('game', 17);
    const run = (type: string, ...args: unknown[]) => {
      const result = transitionWorkplace(s, { type, args } as never);
      expect(result.changed, `${type}: ${result.reason}`).toBe(true);
      s = result.state;
    };
    run('beginImprovement', 'cooperative', s.revision);
    run('proposeImprovement', 'briefing', 'packing');
    run('acknowledgeImprovement');
    for (const m of s.members) {
      run('understand', m.id);
      run('vote', m.id, true);
    }
    run('activate', s.revision);
    while (s.phase === 'active') run('tick', 10, 30, false);
    useWorkplaceStore.setState({ workplace: s });
    must(store().acknowledgeImprovementReview());
    const ballots = workplace().improvement!.ballots;
    expect(Object.keys(ballots).sort()).toEqual(['coordinator', 'maintenance', 'quality']);
    expect(store().voteImprovementReview('quality', 'stop').reasonCopy?.key).toBe(
      'authoredRoleAnswers'
    );
    must(store().voteImprovementReview('packing', 'adopt'));
    must(store().finishImprovementReview(workplace().revision));
    expect(workplace().improvement?.verdict).toBe('adopt');
  });

  it('every why-line is words, in both languages', () => {
    must(store().startCampaign('cooperative', 17));
    for (const locale of LOCALES) {
      setLocale(locale);
      for (const id of ['quality', 'maintenance', 'coordinator', 'mind']) {
        const why = authoredWhy(workplace(), id);
        expect(why.length, `${locale} ${id}`).toBeGreaterThan(0);
        expect(why).not.toMatch(/\d/);
      }
    }
  });
});

describe('5.2: checks are asked again only when their terms change', () => {
  it('passed checks carry to the next shift and survive a reload; new terms ask again', () => {
    must(store().startCampaign('cooperative', 17));
    agreeAsPacking();
    runShift();
    must(store().nextCampaignShift());
    const carried = workplace().campaign!;
    expect(carried.checks.packing).toEqual({
      refusal: 'individual',
      privacy: 'optional',
      repayment: 'retained',
    });
    // A plan change re-asks the vote, not the checks.
    must(store().selectPlan('cover'));
    expect(workplace().campaign!.checks.packing?.refusal).toBe('individual');
    // A reload expires consent; the checks' terms are unchanged.
    useWorkplaceStore.setState({ workplace: restoreWorkplace(saveWorkplace(workplace())) });
    must(store().resumeShift(workplace().revision));
    expect(workplace().campaign!.checks.packing?.privacy).toBe('optional');
    // New terms: every check is asked again.
    must(store().configure({ aiAuthority: 'advice' }));
    expect(workplace().campaign!.checks.packing ?? {}).toEqual({});
  });
});
