import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createWorkplace, transitionWorkplace } from './bilateralWorkplace';
import { campaignLearningReview, campaignRecord, campaignStory } from './workplaceCampaign';
import { improvementEpisodeOutcome, improvementLearningReview } from './workplaceImprovement';
import { packingInspectionPrompts } from './workplaceAdvice';
import type { PackingAdvice } from '../types/workplaceAdvice';
import type { WorkplaceMission, WorkplaceState } from '../types/workplace';
import { setLocale } from '../i18n';

beforeEach(() => setLocale('en'));
afterEach(() => setLocale('en'));

const mission = (overrides: Partial<WorkplaceMission> = {}): WorkplaceMission => ({
  orderId: 'order-1',
  customer: 'Bakery',
  materialSessionId: 'session',
  startingShippedKg: 0,
  originalTargetKg: 6000,
  targetKg: 6000,
  observedShippedKg: 1250,
  creditedKg: 1250,
  manifestIds: [],
  evidence: 'current',
  ...overrides,
});

function seasonInReview(): WorkplaceState {
  const state = transitionWorkplace(createWorkplace(), {
    type: 'startCampaign',
    args: ['cooperative', 17, mission({ creditedKg: 0, observedShippedKg: 0 })],
  }).state;
  const record = campaignRecord({ ...state, minute: 90 });
  return {
    ...state,
    phase: 'review',
    minute: 90,
    campaign: {
      ...state.campaign!,
      shift: 1,
      mission: mission(),
      history: [{ ...record, shift: 0 }],
    },
  };
}

// Every delivery line groups kilograms ('6,000 kg', formatKg); the season story
// beside the shift briefing and the review's learning prompts printed the same
// commitment as '4750 kg' and '1250.0 kg'. Working if each groups its figures.
describe('kilogram figures in the workplace review copy, fourteenth pass', () => {
  it('groups the season story and the campaign learning review', () => {
    const state = seasonInReview();
    const story = campaignStory(state).join(' ');
    expect(story).toContain('4,750 kg');
    expect(story).not.toMatch(/\b4750 kg/);
    const review = campaignLearningReview(state)!.evidence.join(' ');
    expect(review).toContain('1,250.0 kg credited');
    expect(review).toContain('4,750.0 kg');
    setLocale('pt-BR');
    expect(campaignStory(state).join(' ')).toContain('4.750 kg');
    expect(campaignLearningReview(state)!.evidence.join(' ')).toContain('1.250,0 kg');
  });

  it('groups the handoff learning review and the smaller-delivery outcome', () => {
    let state = createWorkplace('game', 17);
    state = transitionWorkplace(state, {
      type: 'beginImprovement',
      args: ['cooperative', state.revision, mission()],
    }).state;
    state = {
      ...state,
      phase: 'review',
      minute: 90,
      shippedKg: 1250,
      improvement: {
        ...state.improvement!,
        mission: mission(),
        episode: { id: 'late-truck', actorId: 'packing', choice: 'smaller-delivery' },
      },
    };
    const evidence = improvementLearningReview(state)!.evidence.join(' ');
    expect(evidence).toContain('1,250.0 kg');
    expect(evidence).toContain('4,750.0 kg');
    expect(evidence).not.toMatch(/\b4750\.0 kg/);
    expect(improvementEpisodeOutcome(state, 5000)).toContain('2,375');
  });

  it('groups the frozen inspection facts beside the modelled packing range', () => {
    const advice = {
      reasonToAbstain: null,
      evidence: {
        releasedPackedKg: 1200,
        heldPackedKg: 3400,
        qualityRelease: true,
        processingMachines: 3,
        totalMachines: 15,
        truckStatus: 'loading',
        truckLoadedKg: 1500,
        truckCapacityKg: 20000,
        missingFacts: [],
      },
    } as unknown as PackingAdvice;
    const [packing, , , coordinator] = packingInspectionPrompts(advice);
    expect(packing.fact).toContain('1,200');
    expect(packing.fact).toContain('3,400');
    expect(coordinator.fact).toContain('1,500 kg loaded / 20,000 kg capacity');
  });
});
