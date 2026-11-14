/**
 * Tempering as a decision (plan item 7.7), from the Chronicle's side: the
 * temper at the rolls follows the card's answers after their rest; wet grain
 * dried first stamps as treated, on the per-lot stamp and the plant-wide
 * figure alike; no flat payment dries a wet year any longer, and the wet-year
 * event lowers what the card's drying books instead; a chronicle saved before
 * tempering (mid wet year, treated or not) restores and plays to its end, and
 * its old dryer notice still translates (rule 7). The Datalinks entry says
 * what the card does, with the card's own figures.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from '../../i18n';
import { useChronicleStore } from '../../stores/chronicleStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { getKnowledgeEntries } from '../../stores/knowledgeStore';
import {
  cropPointsForReadings,
  stampPenaltyFor,
  type LotStampContext,
} from '../../simulation/lotQuality';
import { DEFAULT_CHARTER } from '../charter';
import { cropTreatmentCost, cropWheatPenalty } from '../cropYears';
import { chronicleEffect, chronicleTotals } from '../effects';
import {
  choiceFundValue,
  closeShift,
  createInitialState,
  cropEventMoot,
  effectInput,
  signCharter,
  treatCropDirectly,
  type ChronicleState,
} from '../engine';
import { EVENT_DECK, getEventDeck } from '../eventDeck';
import { localizedNotice } from '../presentation';
import { recordQuizQuestions } from '../quiz';
import {
  REFERENCE_DRYING_COST,
  TEMPER_COVER_MINUTES,
  TEMPER_REST_MINUTES,
  TEMPER_TARGET_PCT,
  sanitizeTemper,
  stepTemperState,
  temperAt,
  withTemperAnswer,
} from '../temper';
import type { CropYearState } from '../types';
import { pinEvidence } from './chronicleRun';

const baseline = { reportId: null, qcTestIds: [], challengeIds: [], orders: [] };
const wetCrop = (extra: Partial<CropYearState> = {}): CropYearState => ({
  index: 1,
  kind: 'wet',
  treated: false,
  ...extra,
});
const wetLot = {
  cropYear: 1,
  kind: 'wet' as const,
  moisturePct: 15.6,
  proteinPct: 11.2,
  fallingNumberS: 260,
};

function context(crop: CropYearState): LotStampContext {
  return { crop, relieved: [], otherPenalty: 0, cropOf: () => wetLot };
}

function wetChronicle(): ChronicleState {
  const state = signCharter(createInitialState(), DEFAULT_CHARTER, 41, baseline).state;
  return { ...state, crop: wetCrop() };
}

describe('the temper at the rolls', () => {
  it('follows an answer after its rest, for one shift of wheat', () => {
    const answered = withTemperAnswer(undefined, 'dry-first', 100);
    expect(answered.inForce).toBe('standard');
    expect(temperAt(answered, 100 + TEMPER_REST_MINUTES - 1)).toBe('standard');
    expect(temperAt(answered, 100 + TEMPER_REST_MINUTES)).toBe('dry-first');
    expect(temperAt(answered, 100 + TEMPER_REST_MINUTES + TEMPER_COVER_MINUTES)).toBe('standard');
    // The next shift's answer takes over once its own grain is at the rolls.
    const next = withTemperAnswer(answered, 'standard', 580);
    expect(temperAt(next, 650)).toBe('dry-first');
    expect(temperAt(next, 700)).toBe('standard');
    const stepped = stepTemperState(next, 230);
    expect(stepped.inForce).toBe('dry-first');
    expect(stepTemperState(stepped, 230)).toBe(stepped);
  });

  it('stamps wet grain dried first as treated, per lot and plant-wide', () => {
    const grain = [{ lotId: 'lot-1', amount: 15_000 }];
    const standard = wetCrop({ temper: { inForce: 'standard', schedule: [] } });
    const dried = wetCrop({ temper: { inForce: 'dry-first', schedule: [] } });
    expect(stampPenaltyFor(grain, context(standard))).toBe(5);
    expect(stampPenaltyFor(grain, context(dried))).toBe(0);
    expect(cropPointsForReadings(null, context(dried))).toBe(0);
    expect(cropWheatPenalty(standard, [])).toBe(5);
    expect(cropWheatPenalty(dried, [])).toBe(0);
    // A year that had no temper answer, or one dried by the old flat treatment.
    expect(cropWheatPenalty(wetCrop(), [])).toBe(5);
    expect(cropWheatPenalty(wetCrop({ treated: true }), [])).toBe(0);
  });

  it('reads a saved temper field by field', () => {
    expect(sanitizeTemper({ inForce: 'dry-first', schedule: [] })).toEqual({
      inForce: 'dry-first',
      schedule: [],
    });
    expect(
      sanitizeTemper({
        inForce: 'standard',
        schedule: [
          { option: 'dry-first', fromMinute: 10, untilMinute: 490 },
          { option: 'boil', fromMinute: 10, untilMinute: 490 },
          { option: 'standard', fromMinute: 'x', untilMinute: 490 },
        ],
      })
    ).toEqual({
      inForce: 'standard',
      schedule: [{ option: 'dry-first', fromMinute: 10, untilMinute: 490 }],
    });
    expect(sanitizeTemper({ inForce: 'boil' })).toBeUndefined();
    expect(sanitizeTemper(null)).toBeUndefined();
  });
});

describe('the wet year has no flat payment', () => {
  it('offers no treatment in place for a wet year, and refuses one', () => {
    expect(cropTreatmentCost('wet')).toBe(0);
    expect(cropTreatmentCost('sprouted')).toBe(200);
    const state = wetChronicle();
    expect(treatCropDirectly(state, EVENT_DECK).state).toBe(state);
  });

  it('turns the wet-year event to the temper card: no answer treats the year', () => {
    const event = EVENT_DECK.find((e) => e.id === 'evt-wet-intake')!;
    expect(event.choices.map((c) => c.id)).toEqual(['dryer', 'blend', 'mill-on']);
    for (const choice of event.choices) expect(choice.effect.treatCrop).toBeFalsy();
    const dryer = event.choices.find((c) => c.id === 'dryer')!;
    expect(dryer.effect.modifier).toMatchObject({ dryingEnergy: 0, shifts: 3 });
    // Review 2, finding 2: what it keeps off the books is credited in full, so
    // it is priced by the plans' margin, paid back in a third of its life: one
    // shift of drying for three.
    expect(dryer.cost?.fund).toBe(Math.round(REFERENCE_DRYING_COST));
    expect(choiceFundValue(wetChronicle(), dryer)).toBe(
      Math.round(3 * REFERENCE_DRYING_COST - Math.round(REFERENCE_DRYING_COST))
    );
    const hired = {
      ...wetChronicle(),
      modifiers: [{ ...dryer.effect.modifier!, id: 'm', sourceId: 'e', remainingShifts: 3 }],
    };
    expect(chronicleTotals(effectInput(hired)).dryingEnergy).toBe(0);
    expect(chronicleEffect(effectInput(hired), true).dryingEnergyMultiplier).toBe(0);
    // The falling-number event no longer answers a wet year.
    const falling = EVENT_DECK.find((e) => e.id === 'evt-low-falling-number')!;
    expect(falling.requires?.cropKinds).toEqual(['sprouted']);
    expect(REFERENCE_DRYING_COST).toBeGreaterThan(0);
  });

  it('takes the wet-year event off the desk once the dryer plan answers the year', () => {
    const event = EVENT_DECK.find((e) => e.id === 'evt-wet-intake')!;
    const state = wetChronicle();
    expect(cropEventMoot(state, event)).toBe(false);
    const dryer = {
      id: 'grain-dryer' as const,
      phase: 'installed' as const,
      contractorId: null,
      startedShift: 0,
      completesShift: 0,
      paidFund: 0,
      effectScale: 1,
      initiatedBy: 'player' as const,
    };
    expect(cropEventMoot({ ...state, improvements: [dryer] }, event)).toBe(true);
  });
});

describe('a chronicle saved before tempering', () => {
  afterEach(() => setLocale('en'));

  function savedMidWetYear(treated: boolean): Record<string, unknown> {
    let state = signCharter(createInitialState(), DEFAULT_CHARTER, 41, baseline).state;
    for (let i = 0; i < 12; i++)
      state = closeShift(state, pinEvidence(41, i, 3000), EVENT_DECK).state;
    expect(state.crop?.kind).toBe('wet');
    const saved = JSON.parse(JSON.stringify(state)) as Record<string, unknown>;
    saved.crop = { index: state.crop!.index, kind: 'wet', treated };
    return saved;
  }

  for (const treated of [false, true])
    it(`restores mid wet year (${treated ? 'treated by the old payment' : 'untreated'}) and plays to the end`, () => {
      useOperationsCampaignStore.getState().resetCampaign();
      const merge = useChronicleStore.persist.getOptions().merge!;
      let state = (
        merge({ chronicle: savedMidWetYear(treated) }, useChronicleStore.getState()) as ReturnType<
          typeof useChronicleStore.getState
        >
      ).chronicle;
      expect(state.crop?.temper).toBeUndefined();
      expect(cropWheatPenalty(state.crop, [])).toBe(treated ? 0 : 5);
      for (let i = state.shift; i < 70 && state.status === 'active'; i++)
        state = closeShift(state, pinEvidence(41, i, 3000), EVENT_DECK).state;
      expect(state.status).toBe('ended');
    });

  it('drops a temper this build cannot read and keeps one it can', () => {
    const merge = useChronicleStore.persist.getOptions().merge!;
    const restore = (temper: unknown) =>
      (
        merge(
          {
            chronicle: {
              ...savedMidWetYear(false),
              crop: { index: 1, kind: 'wet', treated: false, temper },
            },
          },
          useChronicleStore.getState()
        ) as ReturnType<typeof useChronicleStore.getState>
      ).chronicle.crop;
    expect(restore({ inForce: 'nonsense' })).toEqual({ index: 1, kind: 'wet', treated: false });
    expect(restore({ inForce: 'dry-first', schedule: [] })?.temper?.inForce).toBe('dry-first');
  });

  // Review 2, finding 5: before 7.7 the hired dryer lifted the wet-year
  // penalty. A save from then says so, in both languages, and its quiz asks
  // about what happened, not about the answer's effect today.
  const OLD_DRYER =
    'The dryer brings the intake down to storage moisture and the wet-year penalty lifts.';
  const preTemperSave = () => {
    const signed = signCharter(createInitialState(), DEFAULT_CHARTER, 41, baseline).state;
    return {
      ...signed,
      eventHistory: [
        { eventId: 'evt-wet-intake', shift: 11, choiceId: 'dryer', actor: 'player' as const },
      ],
      notices: [
        {
          id: 'notice-20',
          shift: 11,
          kind: 'event' as const,
          title: 'Wet grain at the intake: Hire a mobile dryer',
          body: OLD_DRYER,
          relatedId: 'event-7',
        },
      ],
    };
  };

  it('shows a dryer ruling saved before 7.7 as what it did then, in both languages', () => {
    const saved = preTemperSave().notices[0];
    expect(localizedNotice(saved)).toEqual(saved);
    setLocale('pt-BR');
    const local = localizedNotice(saved);
    expect(local.body).toBe(
      'O secador leva a recepção à umidade de armazenagem, e a penalidade do ano úmido é suspensa.'
    );
    expect(local.title).not.toBe(saved.title);
    const today = getEventDeck()
      .find((e) => e.id === 'evt-wet-intake')!
      .choices.find((c) => c.id === 'dryer')!.effect.result;
    expect(local.body).not.toBe(today);
  });

  it('grades the old ruling on what its save records, and asks nothing it cannot tell', () => {
    const question = (state: ReturnType<typeof preTemperSave>) =>
      recordQuizQuestions(state as never).find((q) => q.id.includes('evt-wet-intake'));
    const english = question(preTemperSave())!;
    expect(english.options[english.correctIndex]).toBe(OLD_DRYER);
    setLocale('pt-BR');
    const portuguese = question(preTemperSave())!;
    expect(portuguese.options[portuguese.correctIndex]).toMatch(/penalidade do ano úmido/);
    setLocale('en');
    // The notice is gone (notices are bounded): which result it had is unknown.
    expect(question({ ...preTemperSave(), notices: [] })).toBeUndefined();
    // A ruling made since 7.7 is graded on today's result.
    const today = EVENT_DECK.find((e) => e.id === 'evt-wet-intake')!.choices.find(
      (c) => c.id === 'dryer'
    )!.effect.result;
    const now = preTemperSave();
    now.notices[0].body = today;
    expect(question(now)!.options[question(now)!.correctIndex]).toBe(today);
  });
});

describe('the Datalinks entry and the card agree', () => {
  afterEach(() => setLocale('en'));

  it('names the target, the rest and where the decision is made, in both languages', () => {
    const entry = () => getKnowledgeEntries().find((e) => e.id === 'milling-cleaning-tempering')!;
    const hours = TEMPER_REST_MINUTES / 60;
    expect(entry().article).toContain(`approximately ${TEMPER_TARGET_PCT}%`);
    expect(entry().article).toContain(`rests it for ${hours} hours`);
    expect(entry().seeInAction.join('\n')).toMatch(/Tempering/);
    setLocale('pt-BR');
    expect(entry().article).toContain(`aproximadamente ${TEMPER_TARGET_PCT}%`);
    expect(entry().article).toContain(`por ${hours} horas`);
    expect(entry().seeInAction.join('\n')).toMatch(/Condicionamento/);
  });
});
