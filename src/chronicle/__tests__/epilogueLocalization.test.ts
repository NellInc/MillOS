/**
 * The epilogue read in Brazilian Portuguese (CLAUDE.md, Chronicle rule 7):
 * `localizedEpilogue` has the same sections as `epilogue()`, is identical to it
 * in English, and leaves no part-three English behind in pt-BR.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { acceptOffer, OFFER_DECK } from './administratorOffer';
import { setLocale } from '../../i18n';
import { DEFAULT_CHARTER } from '../charter';
import { SHIFTS_PER_CROP_YEAR } from '../cropYears';
import {
  closeShift,
  createInitialState,
  meetNeed,
  proposePolicy,
  setBrief,
  signCharter,
  type ChronicleState,
  type ShiftCloseEvidence,
} from '../engine';
import { epilogue, GOVERNANCE_EPILOGUE_SECTIONS, localizedEpilogue } from '../epilogue';
import { copy } from '../epilogue.messages';
import { EVENT_DECK } from '../eventDeck';
import { COUNTDOWN_SHIFTS, CREW_PROFILES, CREW_ROLE_IDS } from '../governance';

const baseline = { reportId: null, qcTestIds: [], challengeIds: [], orders: [] };

let minute = 0;
function evidence(dispatchedKg: number, revenue = 2000): ShiftCloseEvidence {
  minute += 480;
  return {
    report: {
      id: `epilogue-report-${minute}`,
      grade: 'B',
      endedAtMinute: minute,
      metrics: {
        revenue,
        energyCost: 0,
        automationCost: 0,
        wasteCost: 0,
        maintenanceCost: 0,
        demurrageCost: 0,
        latePenalties: 0,
        dispatchedKg,
        qualityFailureKg: 0,
        incidentsResolved: 0,
        automaticActions: 0,
        commitmentMinutes: 0,
      },
    },
    orders: [],
    incidents: [],
    challengeActive: false,
    challengeHistory: [],
    qcTests: [],
  };
}

function run(state: ChronicleState, shifts: number, kg = 3000, deck = [] as typeof EVENT_DECK) {
  let next = state;
  for (let i = 0; i < shifts && next.status === 'active'; i++)
    next = acceptOffer(closeShift(next, evidence(kg), [...deck, ...OFFER_DECK]).state);
  return next;
}

/**
 * One chronicle that uses part three throughout: an assembly that outvotes two
 * needs and meets one another way, a red line acted on, the partner answering
 * on the thrift brief, a quota raised then missed twice, and the administrator.
 */
function partThreeRun(): ChronicleState {
  let state = signCharter(
    createInitialState(),
    { ...DEFAULT_CHARTER, mode: 'no_trials' },
    11,
    baseline
  ).state;
  state = {
    ...state,
    ledger: {
      ...state.ledger,
      fund: { ...state.ledger.fund, charter: 5000 },
      knowHow: { ...state.ledger.knowHow, grades: 500 },
    },
    governance: {
      ...state.governance,
      crew: CREW_ROLE_IDS.map((id, index) => {
        const profile = CREW_PROFILES[id][index % 2];
        return index < 4
          ? {
              ...profile,
              temperament: 'eager' as const,
              prefers: { ladder: 'maintenance' as const, rung: 1 as const },
              need: { ...profile.need, ladder: 'maintenance' as const, rung: 0 as const },
            }
          : { ...profile, need: { ...profile.need, ladder: 'intake' as const, rung: 0 as const } };
      }),
    },
  };
  // Intake to "any lot": carried over two needs, and the growers' red line counts down.
  state = proposePolicy(state, 'intake', 0).state;
  state = meetNeed(state, 'packing').state;
  state = run(state, COUNTDOWN_SHIFTS + 1);
  // The partner answers a routine event on the thrift brief.
  const workshop = EVENT_DECK.find((event) => event.id === 'evt-millwrights-workshop')!;
  state = setBrief(state, 'thrift').state;
  state = run(
    {
      ...state,
      delegation: 1,
      pendingEvents: [
        {
          instanceId: 'event-91',
          eventId: workshop.id,
          appearedShift: state.shift,
          lapsesShift: state.shift + 3,
        },
      ],
    },
    1,
    3000,
    [workshop]
  );
  state = { ...state, delegation: 0 };
  // A quota beaten and raised, then missed until the administrator comes.
  state = run(state, SHIFTS_PER_CROP_YEAR, 3500);
  state = run(state, SHIFTS_PER_CROP_YEAR * 2, 500);
  // The workshop answer the partner took leaves no mark, so one partner decision
  // is added to the record, as governance.test.ts does for the brief sentence.
  return {
    ...state,
    marks: {
      ...state.marks,
      'partner-decision': {
        id: 'partner-decision',
        shift: state.shift,
        eventId: workshop.id,
        choiceId: 'notes',
        actor: 'ai-partner',
      },
    },
  };
}

afterEach(() => setLocale('en'));

describe('the localized epilogue', () => {
  const state = partThreeRun();

  it('the run reached part three’s sections and the partner’s brief', () => {
    setLocale('en');
    const ids = epilogue(state).map((entry) => entry.id);
    for (const id of ['crew', 'plan', 'warnings', 'administration']) expect(ids).toContain(id);
    expect(epilogue(state).find((entry) => entry.id === 'partner')?.text).toMatch(
      / It worked to the thrift brief\.$/
    );
  });

  it('is identical to epilogue() in English', () => {
    setLocale('en');
    expect(localizedEpilogue(state)).toEqual(epilogue(state));
    // The partner's single decision, and the conventional brief that names nothing.
    const one = {
      ...state,
      governance: { ...state.governance, brief: 'conventional' as const },
      marks: {
        x: { id: 'x', shift: 1, eventId: 'e', choiceId: 'c', actor: 'ai-partner' as const },
      },
    };
    expect(localizedEpilogue(one)).toEqual(epilogue(one));
    expect(epilogue(one).find((entry) => entry.id === 'partner')?.text).toBe(
      'The AI partner made the one decision in the record.'
    );
  });

  it('has the same sections in pt-BR, with no part-three English left', () => {
    setLocale('en');
    const english = epilogue(state);
    setLocale('pt-BR');
    const local = localizedEpilogue(state);
    expect(local.map((entry) => entry.id)).toEqual(english.map((entry) => entry.id));
    english.forEach((entry, index) => {
      expect(local[index].title, entry.title).not.toBe(entry.title);
      expect(local[index].text, entry.text).not.toBe(entry.text);
    });
    const governanceEnglish = GOVERNANCE_EPILOGUE_SECTIONS.flatMap((section) => [
      section.title,
      ...section.slides.map((slide) => slide.text),
    ]);
    const shown = local.flatMap((entry) => [entry.title, entry.text]).join('\n');
    for (const text of [...governanceEnglish, 'It worked to the', 'thrift', 'brief'])
      expect(shown, text).not.toContain(text);
    expect(local.find((entry) => entry.id === 'partner')?.text).toMatch(
      / Trabalhou conforme a orientação Economia\.$/
    );
  });

  it('has Portuguese for every part-three title and slide, reached or not', () => {
    setLocale('pt-BR');
    for (const section of GOVERNANCE_EPILOGUE_SECTIONS) {
      expect(copy(section.title), section.title).not.toBe(section.title);
      for (const slide of section.slides) expect(copy(slide.text), slide.text).not.toBe(slide.text);
    }
    expect(copy('The AI partner made the one decision in the record.')).not.toMatch(/AI partner/);
  });
});
