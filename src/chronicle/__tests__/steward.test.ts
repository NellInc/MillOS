/**
 * Part two of the Chronicle (docs/CHRONICLE.md, systems 16-24): the record,
 * scheduled events and chains, organisations, the certifier, desks, the long
 * night, the mill's character and the epilogue.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CHARTER } from '../charter';
import { CHRONICLE_SHIFTS } from '../cropYears';
import { standingOf } from '../certifier';
import { DESK_START_ROOM } from '../desks';
import {
  canAfford,
  chooseEventOption,
  choiceAvailable,
  closeShift,
  createInitialState,
  currentForecastChance,
  longNightScore,
  REINSTATEMENT_EVENT_ID,
  signCharter,
  treatmentPrice,
  type ChronicleState,
  type ShiftCloseEvidence,
} from '../engine';
import { EPILOGUE_SECTIONS, epilogue } from '../epilogue';
import { EVENT_DECK } from '../eventDeck';
import { HISTORY_NOTES } from '../history';
import {
  FRONT_HOLD_THRESHOLD,
  frontPreparation,
  LONG_NIGHT_EVENT_ID,
  LONG_NIGHT_SHIFT,
} from '../longNight';
import { improvementById } from '../plans';
import { describeEffect } from '../describe';
import { conditionMet, ENGINE_MARKS, MARKS, millCharacter } from '../record';
import { chronicleChance } from '../rng';
import { COURT_EVENT_IDS } from '../stewardDeck';
import type {
  ChronicleCondition,
  ChronicleEventEffect,
  ChronicleEventDefinition,
  DecisionMark,
  ForecastState,
} from '../types';

const baseline = { reportId: null, qcTestIds: [], challengeIds: [], orders: [] };
const signed = (seed = 11): ChronicleState =>
  signCharter(createInitialState(), { ...DEFAULT_CHARTER, mode: 'no_trials' }, seed, baseline)
    .state;

let minute = 0;
function evidence(overrides: Partial<ShiftCloseEvidence> = {}): ShiftCloseEvidence {
  minute += 480;
  return {
    report: {
      id: `steward-report-${minute}`,
      grade: 'A',
      endedAtMinute: minute,
      metrics: {
        revenue: 2000,
        energyCost: 0,
        automationCost: 0,
        wasteCost: 0,
        maintenanceCost: 0,
        demurrageCost: 0,
        latePenalties: 0,
        dispatchedKg: 3000,
        qualityFailureKg: 0,
        incidentsResolved: 0,
        automaticActions: 0,
      },
    },
    orders: [],
    incidents: [],
    challengeActive: false,
    challengeHistory: [],
    qcTests: [],
    ...overrides,
  };
}

const rich = (state: ChronicleState): ChronicleState => ({
  ...state,
  ledger: {
    ...state.ledger,
    fund: { ...state.ledger.fund, charter: 5000 },
    knowHow: { ...state.ledger.knowHow, grades: 500 },
  },
});

const mark = (id: string): DecisionMark => ({
  id,
  shift: 1,
  eventId: 'test',
  choiceId: 'test',
  actor: 'player',
});
const withMarks = (state: ChronicleState, ...ids: string[]): ChronicleState => ({
  ...state,
  marks: { ...state.marks, ...Object.fromEntries(ids.map((id) => [id, mark(id)])) },
});

function eventById(id: string): ChronicleEventDefinition {
  const event = EVENT_DECK.find((candidate) => candidate.id === id);
  if (!event) throw new Error(`no event ${id}`);
  return event;
}

/** Place one event as pending, as if it had just appeared. */
function pend(state: ChronicleState, eventId: string): ChronicleState {
  return {
    ...state,
    pendingEvents: [
      ...state.pendingEvents,
      {
        instanceId: `pending-${eventId}`,
        eventId,
        appearedShift: state.shift,
        lapsesShift: state.shift + 2,
      },
    ],
  };
}

function run(state: ChronicleState, shifts: number, deck = EVENT_DECK): ChronicleState {
  let next = state;
  for (let i = 0; i < shifts; i++) next = closeShift(next, evidence(), deck).state;
  return next;
}

// ---------------------------------------------------------------------------
// Registry integrity: no dead marks, no dangling ids
// ---------------------------------------------------------------------------

function effectsOf(event: ChronicleEventDefinition): ChronicleEventEffect[] {
  return event.choices.flatMap((choice) => [
    choice.effect,
    ...(choice.variants ?? []).map((variant) => variant.effect),
  ]);
}

function conditionMarks(condition: ChronicleCondition | undefined): string[] {
  if (!condition) return [];
  return [
    ...(condition.marks?.all ?? []),
    ...(condition.marks?.any ?? []),
    ...(condition.marks?.none ?? []),
    ...(condition.anyOf ?? []).flatMap(conditionMarks),
  ];
}

function conditions(event: ChronicleEventDefinition): ChronicleCondition[] {
  return [
    ...(event.requires?.marks ? [{ marks: event.requires.marks }] : []),
    ...event.choices.flatMap((choice) => [
      ...(choice.requires ? [choice.requires] : []),
      ...(choice.variants ?? []).map((variant) => variant.when),
    ]),
    ...(event.echoes ?? []).map((echo) => echo.when),
  ];
}

describe('the record has no dead marks', () => {
  const set = new Set<string>([
    ...ENGINE_MARKS,
    ...EVENT_DECK.flatMap((event) => effectsOf(event).flatMap((effect) => effect.marks ?? [])),
  ]);
  const read = new Set<string>([
    ...EVENT_DECK.flatMap((event) => conditions(event).flatMap(conditionMarks)),
    ...EPILOGUE_SECTIONS.flatMap((section) =>
      section.slides.flatMap((slide) => conditionMarks(slide.when))
    ),
    // The long night and standing forecast relief read marks from the registry.
    ...Object.entries(MARKS)
      .filter(([, definition]) => definition.prepares?.length || definition.forecastRelief)
      .map(([id]) => id),
  ]);

  it('registers every mark that is set or read', () => {
    for (const id of [...set, ...read]) expect(MARKS[id], id).toBeDefined();
  });

  it('sets every registered mark somewhere', () => {
    for (const id of Object.keys(MARKS)) expect(set.has(id), id).toBe(true);
  });

  it('reads every mark it sets, beyond its leaning', () => {
    for (const id of set) expect(read.has(id), `${id} is set and never read`).toBe(true);
  });

  it('points every follow-up and chain at a real event, and reaches every chained event', () => {
    const ids = new Set(EVENT_DECK.map((event) => event.id));
    const reached = new Set<string>([REINSTATEMENT_EVENT_ID]);
    for (const event of EVENT_DECK) {
      for (const effect of effectsOf(event)) {
        const followUps = !effect.followUp
          ? []
          : Array.isArray(effect.followUp)
            ? effect.followUp
            : [effect.followUp];
        for (const followUp of followUps) {
          expect(ids.has(followUp.eventId), followUp.eventId).toBe(true);
          reached.add(followUp.eventId);
        }
        for (const id of effect.resolveChain ?? []) expect(ids.has(id), id).toBe(true);
      }
    }
    for (const event of EVENT_DECK.filter((candidate) => candidate.chained))
      expect(reached.has(event.id), event.id).toBe(true);
  });

  it('names only real plans and notes in conditions', () => {
    const all = (condition: ChronicleCondition): ChronicleCondition[] => [
      condition,
      ...(condition.anyOf ?? []).flatMap(all),
    ];
    for (const event of EVENT_DECK) {
      for (const condition of conditions(event).flatMap(all)) {
        if (condition.plan) expect(improvementById(condition.plan), condition.plan).toBeDefined();
        if (condition.note)
          expect(HISTORY_NOTES.some((note) => note.id === condition.note)).toBe(true);
      }
    }
  });

  it('gives every event a default that is free, needs nothing and exists', () => {
    for (const event of EVENT_DECK) {
      const choice = event.choices.find((c) => c.id === event.defaultChoiceId);
      expect(choice, event.id).toBeDefined();
      expect(choice!.cost?.fund ?? 0, event.id).toBe(0);
      expect(choice!.cost?.knowHow ?? 0, event.id).toBe(0);
      expect(
        Object.values(choice!.cost?.attention ?? {}).every((n) => !n),
        event.id
      ).toBe(true);
      expect(choice!.requires, event.id).toBeUndefined();
    }
  });

  it('places every scheduled event inside the chronicle', () => {
    for (const event of EVENT_DECK.filter((candidate) => candidate.scheduled))
      expect(event.scheduled!.shift).toBeLessThan(CHRONICLE_SHIFTS);
  });

  it('keeps all chance in rng.ts', () => {
    for (const file of [
      'stewardDeck',
      'record',
      'longNight',
      'epilogue',
      'certifier',
      'desks',
      'stakeholders',
      'engine',
    ])
      expect(
        readFileSync(join(process.cwd(), 'src/chronicle', `${file}.ts`), 'utf8').includes(
          'Math.random'
        ),
        file
      ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Scheduled events, chains, echoes and variants
// ---------------------------------------------------------------------------

describe('scheduled events and chains', () => {
  it('places a scheduled event once at its shift without touching the draw rules', () => {
    let state = signed();
    state = run(state, 3);
    const placed = state.pendingEvents.filter((p) => p.eventId === 'evt-standby-cover');
    expect(placed).toHaveLength(1);
    expect(state.firedScheduled).toContain('evt-standby-cover');
    expect(state.lastEventId).not.toBe('evt-standby-cover');
    state = { ...state, pendingEvents: [] };
    state = run(state, 2);
    expect(state.pendingEvents.some((p) => p.eventId === 'evt-standby-cover')).toBe(false);
  });

  it('waits while a recovery challenge runs', () => {
    let state = signed();
    state = run(state, 2);
    state = closeShift(state, evidence({ challengeActive: true }), EVENT_DECK).state;
    expect(state.firedScheduled).not.toContain('evt-standby-cover');
    state = run(state, 1);
    expect(state.firedScheduled).toContain('evt-standby-cover');
  });

  it('runs arbitration one case a shift when the player rules', () => {
    let state = rich(signed());
    state = pend(state, COURT_EVENT_IDS[0]);
    state = chooseEventOption(
      state,
      `pending-${COURT_EVENT_IDS[0]}`,
      'advance',
      'player',
      EVENT_DECK
    ).state;
    expect(state.marks['grower-advanced']?.actor).toBe('player');
    expect(state.followUps.map((f) => f.eventId)).toEqual([COURT_EVENT_IDS[1]]);
    state = run(state, 1);
    expect(state.pendingEvents.some((p) => p.eventId === COURT_EVENT_IDS[1])).toBe(true);
  });

  it('hands the rest of the day to the AI partner when the first case lapses, ruling each case once', () => {
    let state = signed();
    state = run(state, 6);
    expect(state.pendingEvents.some((p) => p.eventId === COURT_EVENT_IDS[0])).toBe(true);
    state = run(state, 2);
    for (const id of ['grower-terminated', 'haulier-terminated', 'granary-pasta', 'sacks-kept'])
      expect(state.marks[id]?.actor, id).toBe('ai-partner');
    // No case is scheduled again, but the last ruling's own consequence still comes due.
    expect(state.followUps.filter((f) => COURT_EVENT_IDS.includes(f.eventId as never))).toEqual([]);
    expect(state.followUps.map((f) => f.eventId)).toContain('evt-sacks-short-again');
    state = run(state, 4);
    expect(state.pendingEvents.some((p) => COURT_EVENT_IDS.includes(p.eventId as never))).toBe(
      false
    );
    expect(state.eventHistory.filter((e) => e.eventId === COURT_EVENT_IDS[1])).toHaveLength(1);
  });

  it('echoes the grievance the record caused, and the default reads it too', () => {
    let state = withMarks(signed(), 'grower-terminated', 'haulier-terminated');
    state = { ...state, shift: 32 };
    state = closeShift(state, evidence(), EVENT_DECK).state;
    const meeting = state.pendingEvents.find((p) => p.eventId === 'evt-valley-meeting');
    expect(meeting?.echo?.because).toBe(
      'Because the hail-struck farm’s contract was ended at arbitration'
    );
    const haulier = state.stakeholders.find((s) => s.id === 'haulier')!.value;
    state = chooseEventOption(state, meeting!.instanceId, 'close', 'player', EVENT_DECK).state;
    expect(state.stakeholders.find((s) => s.id === 'haulier')!.value).toBe(haulier - 8);
    expect(state.notices.at(-1)?.body).toMatch(/^Because Valley Haulage’s contract was ended/);
  });

  it('names no cause a save from before part two never made', () => {
    // An old save passes over the standby cover, so no cover mark exists.
    const state = closeShift({ ...signed(), shift: 32 }, evidence(), EVENT_DECK).state;
    const meeting = state.pendingEvents.find((p) => p.eventId === 'evt-valley-meeting');
    expect(meeting).toBeDefined();
    expect(meeting?.echo).toBeUndefined();
  });

  it('locks a choice whose condition fails and says why on the button data', () => {
    let state = pend(rich(signed()), 'evt-valley-meeting');
    const speak = eventById('evt-valley-meeting').choices.find((c) => c.id === 'speak')!;
    expect(choiceAvailable(state, speak)).toBe(false);
    const unchanged = chooseEventOption(
      state,
      'pending-evt-valley-meeting',
      'speak',
      'player',
      EVENT_DECK
    ).state;
    expect(unchanged).toBe(state);
    state = withMarks(state, 'cover-intake');
    expect(choiceAvailable(state, speak)).toBe(true);
  });

  it('brings a debt back and makes breaking it cost more than refusing would have', () => {
    let state = pend(rich(signed()), 'evt-court-granary');
    state = chooseEventOption(
      state,
      'pending-evt-court-granary',
      'compensate',
      'player',
      EVENT_DECK
    ).state;
    expect(state.marks['owed-pasta']).toBeDefined();
    const due = state.followUps.find((f) => f.eventId === 'evt-debt-pasta')!;
    expect(due.dueShift - state.shift).toBe(12);
    const pasta = state.customers.find((c) => c.id === 'pasta')!.value;
    state = pend(state, 'evt-debt-pasta');
    state = chooseEventOption(
      state,
      'pending-evt-debt-pasta',
      'refuse',
      'player',
      EVENT_DECK
    ).state;
    expect(state.marks['owed-pasta']).toBeUndefined();
    expect(state.marks['promise-broken']).toBeDefined();
    expect(state.customers.find((c) => c.id === 'pasta')!.value).toBe(pasta - 20);
  });
});

// ---------------------------------------------------------------------------
// Organisations, the certifier and desks
// ---------------------------------------------------------------------------

describe('organisations who show up', () => {
  it('signs with four organisations at neutral', () => {
    expect(signed().stakeholders.map((s) => [s.id, s.value])).toEqual([
      ['growers', 50],
      ['haulier', 50],
      ['village', 50],
      ['federation', 50],
    ]);
  });

  it('lets a warm haulier take points off road works and warm growers off treatment', () => {
    const forecast: ForecastState = {
      id: 'f',
      kind: 'delayed_truck',
      issuedShift: 0,
      dueShift: 2,
      chance: 0,
      mitigated: false,
      mitigatedBy: null,
      paidFund: 0,
      status: 'pending',
    };
    const base = { ...signed(), crop: { index: 1, kind: 'wet' as const, treated: false } };
    const warm = {
      ...base,
      stakeholders: base.stakeholders.map((s) =>
        s.id === 'haulier' || s.id === 'growers' ? { ...s, value: 80 } : s
      ),
    };
    expect(currentForecastChance(warm, forecast)).toBeCloseTo(
      currentForecastChance(base, forecast) - 0.1
    );
    expect(treatmentPrice(warm)).toBe(Math.round(treatmentPrice(base) * 0.75));
  });

  it('moves several parties with one ruling', () => {
    let state = pend(rich(signed()), 'evt-court-granary');
    state = chooseEventOption(
      state,
      'pending-evt-court-granary',
      'keep',
      'player',
      EVENT_DECK
    ).state;
    expect(state.customers.find((c) => c.id === 'pasta')!.value).toBe(62);
    expect(state.stakeholders.find((s) => s.id === 'village')!.value).toBe(35);
  });
});

describe('the certifier', () => {
  it('moves in hundredths from recorded evidence', () => {
    let state = signed();
    state = closeShift(
      state,
      evidence({
        qcTests: [
          { id: 'qc-1', passed: true },
          { id: 'qc-2', passed: true },
        ],
      }),
      []
    ).state;
    expect(state.certifier.score).toBe(516);
    const failing = evidence();
    failing.report.metrics.qualityFailureKg = 200;
    state = closeShift(state, failing, []).state;
    expect(state.certifier.score).toBe(491);
    expect(standingOf(state.certifier)).toBe(4);
  });

  it('suspends on a backdated log, cools every customer, and always schedules a way back', () => {
    let state = pend(rich(signed()), 'evt-cleaning-log');
    const before = state.customers.map((c) => c.value);
    state = chooseEventOption(
      state,
      'pending-evt-cleaning-log',
      'backdate',
      'player',
      EVENT_DECK
    ).state;
    expect(state.certifier.suspended).toBe(true);
    expect(state.customers.map((c) => c.value)).toEqual(before.map((v) => v - 10));
    expect(state.followUps.some((f) => f.eventId === REINSTATEMENT_EVENT_ID)).toBe(true);
    // An unanswered audit reschedules itself; there is always a way out.
    state = pend(state, REINSTATEMENT_EVENT_ID);
    state = chooseEventOption(
      state,
      `pending-${REINSTATEMENT_EVENT_ID}`,
      'wait',
      'chronicle',
      EVENT_DECK
    ).state;
    expect(state.followUps.filter((f) => f.eventId === REINSTATEMENT_EVENT_ID)).toHaveLength(2);
    state = pend({ ...state, pendingEvents: [] }, REINSTATEMENT_EVENT_ID);
    state = chooseEventOption(
      state,
      `pending-${REINSTATEMENT_EVENT_ID}`,
      'open',
      'player',
      EVENT_DECK
    ).state;
    expect(state.certifier).toEqual({ score: 400, suspended: false });
  });

  it('holds the era while suspended and gates the last two eras on standing', async () => {
    const { reachedEra } = await import('../plans');
    expect(reachedEra('district', 12, 400, 5, 'historical', 3)).toBe('district');
    expect(reachedEra('district', 12, 400, 5, 'historical', 5)).toBe('regional');
    expect(reachedEra('district', 12, 400, 5, 'historical', 6)).toBe('federated');
    expect(reachedEra('village', 12, 400, 5, 'historical', 9, true)).toBe('village');
  });
});

describe('desks of attention', () => {
  it('charges, locks when empty, refills each close and widens with use', () => {
    let state = rich(signed());
    const cost = { attention: { council: 1 } };
    expect(state.desks.council.points).toBe(DESK_START_ROOM);
    for (let i = 0; i < DESK_START_ROOM; i++) {
      state = pend(state, 'evt-court-short-weight');
      state = chooseEventOption(
        state,
        'pending-evt-court-short-weight',
        'dock',
        'player',
        EVENT_DECK
      ).state;
    }
    expect(state.desks.council.points).toBe(0);
    expect(canAfford(state, cost)).toBe(false);
    state = closeShift(state, evidence(), []).state;
    expect(state.desks.council.points).toBe(1);
    state = { ...state, desks: { ...state.desks, council: { points: 2, room: 2, spent: 3 } } };
    state = pend(state, 'evt-court-short-weight');
    state = chooseEventOption(
      state,
      'pending-evt-court-short-weight',
      'dock',
      'player',
      EVENT_DECK
    ).state;
    expect(state.desks.council).toEqual({ points: 1, room: 3, spent: 4 });
  });
});

// ---------------------------------------------------------------------------
// The long night, the character and the epilogue
// ---------------------------------------------------------------------------

describe('the long night', () => {
  const night = (state: ChronicleState, choiceId: string) => {
    const pending = pend({ ...state, shift: LONG_NIGHT_SHIFT }, LONG_NIGHT_EVENT_ID);
    return chooseEventOption(
      pending,
      `pending-${LONG_NIGHT_EVENT_ID}`,
      choiceId,
      'player',
      EVENT_DECK
    );
  };

  it('is telegraphed two shifts ahead with each front’s preparation', () => {
    let state = { ...signed(), shift: LONG_NIGHT_SHIFT - 3 };
    state = closeShift(state, evidence(), EVENT_DECK).state;
    expect(state.longNightTelegraphed).toBe(true);
    expect(state.notices.some((n) => n.title.startsWith('The long night comes'))).toBe(true);
  });

  it('lets the unprepared front fall and raise its real incident', () => {
    const step = night(signed(), 'intake');
    expect(step.state.marks['held-intake']).toBeDefined();
    expect(step.state.marks['fell-floor']).toBeDefined();
    expect(step.commands).toEqual([
      { type: 'raise_incident', kind: 'power_sag', reason: 'The long night' },
    ]);
    expect(longNightScore(step.state)).toBe(0);
  });

  it('holds the other front on its preparation alone, and scores it', () => {
    let state = withMarks(signed(), 'cover-floor', 'switchgear-surveyed');
    expect(frontPreparation(state, 'floor')).toBe(FRONT_HOLD_THRESHOLD);
    const step = night(state, 'intake');
    expect(step.state.marks['held-floor']).toBeDefined();
    expect(step.commands).toEqual([]);
    expect(longNightScore(step.state)).toBe(3);
    state = withMarks(signed(), 'cover-thin', 'culvert-rebuilt');
    expect(frontPreparation(state, 'intake')).toBe(1.5);
  });

  it('defaults to the AI partner holding the roller floor', () => {
    const event = eventById(LONG_NIGHT_EVENT_ID);
    expect(event.defaultChoiceId).toBe('partner');
    const step = night(signed(), 'partner');
    expect(step.state.marks['held-floor']?.actor).toBe('ai-partner');
  });
});

describe('the mill’s character and the epilogue', () => {
  it('names the mill only when one leaning leads by two', () => {
    expect(millCharacter(signed()).title).toBe('the Steady Mill');
    expect(
      millCharacter(withMarks(signed(), 'grower-advanced', 'cover-intake', 'granary-kept')).title
    ).toBe('the Steady Mill');
    expect(millCharacter(withMarks(signed(), 'grower-advanced', 'cover-intake')).title).toBe(
      'the Growers’ Mill'
    );
  });

  it('chooses one slide per section from the record', () => {
    const state = withMarks(
      signed(),
      'held-intake',
      'held-floor',
      'grower-advanced',
      'granary-village',
      'promise-kept'
    );
    const entries = epilogue(state);
    expect(entries[0].id).toBe('character');
    expect(entries.find((e) => e.id === 'long-night')?.text).toMatch(/^Both fronts held/);
    expect(entries.find((e) => e.id === 'growers')?.text).toMatch(/seed grower/);
    expect(entries.find((e) => e.id === 'granary')?.text).toMatch(/lease plates/);
    expect(entries.find((e) => e.id === 'haulier')).toBeUndefined();
  });
});

describe('a whole chronicle', () => {
  function playThrough(seed: number, answer: boolean): ChronicleState {
    let state = signed(seed);
    for (let i = 0; i < CHRONICLE_SHIFTS + 2 && state.status === 'active'; i++) {
      state = closeShift(
        state,
        evidence({ qcTests: [{ id: `qc-${seed}-${i}`, passed: true }] }),
        EVENT_DECK
      ).state;
      if (!answer) continue;
      for (const pending of state.pendingEvents) {
        const event = eventById(pending.eventId);
        const choice = event.choices.find(
          (c) =>
            choiceAvailable(state, c) && canAfford(state, c.cost) && c.id !== event.defaultChoiceId
        );
        if (choice)
          state = chooseEventOption(
            state,
            pending.instanceId,
            choice.id,
            'player',
            EVENT_DECK
          ).state;
      }
    }
    return state;
  }

  it('runs to its epilogue with every decision lapsing', () => {
    for (const seed of [3, 11, 29]) {
      const state = playThrough(seed, false);
      expect(state.status, `seed ${seed}`).toBe('ended');
      // The long night happened and the AI partner held the roller floor.
      expect(state.marks['held-floor']?.actor, `seed ${seed}`).toBe('ai-partner');
      expect(state.marks['grower-terminated']?.actor).toBe('ai-partner');
      expect(epilogue(state).length).toBeGreaterThan(2);
      expect(state.pendingEvents.map((p) => [p.eventId, p.appearedShift])).toEqual([]);
    }
  });

  it('runs to its epilogue when a player answers everything', () => {
    for (const seed of [3, 11, 29]) {
      const state = playThrough(seed, true);
      expect(state.status, `seed ${seed}`).toBe('ended');
      expect(Object.keys(state.marks).length).toBeGreaterThan(8);
      expect(state.marks['held-intake'] ?? state.marks['held-floor']).toBeDefined();
      for (const id of Object.keys(state.marks)) expect(MARKS[id], id).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Found in review: each case here was a confirmed defect
// ---------------------------------------------------------------------------

/** A seeded player: sometimes lets a decision lapse, otherwise picks any choice it can take. */
function seededPlay(seed: number): ChronicleState {
  let state = signed(seed);
  for (let i = 0; i < CHRONICLE_SHIFTS + 2 && state.status === 'active'; i++) {
    state = closeShift(
      state,
      evidence({ qcTests: [{ id: `qc-${seed}-${i}`, passed: true }] }),
      EVENT_DECK
    ).state;
    state.pendingEvents.forEach((pending, j) => {
      const roll = chronicleChance(seed, 'policy', i * 10 + j);
      if (roll < 0.2) return;
      const event = eventById(pending.eventId);
      const options = event.choices.filter(
        (c) => choiceAvailable(state, c) && canAfford(state, c.cost)
      );
      const choice = options[Math.floor(((roll - 0.2) / 0.8) * options.length)];
      if (choice)
        state = chooseEventOption(state, pending.instanceId, choice.id, 'player', EVENT_DECK).state;
    });
  }
  return state;
}

describe('what review found', () => {
  it('reaches every epilogue slide in seeded play, so no slide reads a mark in name only', () => {
    const shown = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) {
      const state = seededPlay(seed);
      for (const section of EPILOGUE_SECTIONS) {
        const index = section.slides.findIndex((slide) => conditionMet(state, slide.when));
        if (index >= 0) shown.add(`${section.id}:${index}`);
      }
    }
    const missing = EPILOGUE_SECTIONS.flatMap((section) =>
      section.slides.map((_, index) => `${section.id}:${index}`)
    ).filter((key) => !shown.has(key));
    expect(missing).toEqual([]);
  });

  it('never lets a forecast strike on the closing shift', () => {
    const forecast: ForecastState = {
      id: 'forecast-late',
      kind: 'power_sag',
      issuedShift: CHRONICLE_SHIFTS - 2,
      dueShift: CHRONICLE_SHIFTS,
      chance: 0.95,
      mitigated: false,
      mitigatedBy: null,
      paidFund: 0,
      status: 'pending',
    };
    const state = { ...signed(), shift: CHRONICLE_SHIFTS - 1, forecasts: [forecast] };
    const step = closeShift(state, evidence(), EVENT_DECK);
    expect(step.state.status).toBe('ended');
    expect(step.commands.some((c) => c.type === 'raise_incident')).toBe(false);
    for (let seed = 1; seed <= 40; seed++) {
      let run = signed(seed);
      for (let i = 0; i < CHRONICLE_SHIFTS; i++) {
        const next = closeShift(run, evidence(), EVENT_DECK);
        if (next.state.status === 'ended')
          expect(
            next.commands.some((c) => c.type === 'raise_incident'),
            `seed ${seed}`
          ).toBe(false);
        run = next.state;
      }
      expect(run.forecasts.every((f) => f.dueShift < CHRONICLE_SHIFTS)).toBe(true);
    }
  });

  it('delivers the reinstatement audit through ordinary play, never past the last placing shift', () => {
    let state = pend({ ...rich(signed()), shift: 20 }, 'evt-cleaning-log');
    state = chooseEventOption(
      state,
      'pending-evt-cleaning-log',
      'backdate',
      'player',
      EVENT_DECK
    ).state;
    state = run(state, 3);
    expect(state.pendingEvents.some((p) => p.eventId === REINSTATEMENT_EVENT_ID)).toBe(true);
    // Late in the chronicle a follow-up lands on the last shift that can still place it.
    let late = pend({ ...rich(signed()), shift: 60 }, REINSTATEMENT_EVENT_ID);
    late = withMarks({ ...late, certifier: { score: 100, suspended: true } }, 'log-backdated');
    late = chooseEventOption(
      late,
      `pending-${REINSTATEMENT_EVENT_ID}`,
      'wait',
      'player',
      EVENT_DECK
    ).state;
    expect(late.followUps.at(-1)?.dueShift).toBe(CHRONICLE_SHIFTS - 1);
    late = run({ ...late, pendingEvents: [] }, 2);
    expect(late.pendingEvents.some((p) => p.eventId === REINSTATEMENT_EVENT_ID)).toBe(true);
    // The temptation itself is never offered too late for the audit to follow.
    expect(eventById('evt-cleaning-log').requires?.maxShift).toBeLessThanOrEqual(
      CHRONICLE_SHIFTS - 7
    );
  });

  it('holds the era through a shift close while the approval is suspended', () => {
    const installed = ['moisture-meters', 'spare-parts-store', 'drainage-works'].map((id) => ({
      id,
      phase: 'installed' as const,
      contractorId: null,
      startedShift: 0,
      completesShift: 1,
      paidFund: 0,
      effectScale: 1,
      initiatedBy: 'player' as const,
    }));
    const ready = { ...rich(signed()), improvements: installed };
    const suspended = closeShift(
      { ...ready, certifier: { score: 100, suspended: true } },
      evidence(),
      []
    ).state;
    expect(suspended.era).toBe('village');
    expect(closeShift(ready, evidence(), []).state.era).toBe('cooperative');
  });

  it('never lets a lapse alone raise a dispatch-blocking incident', () => {
    // A critical incident stops dispatch; it has to be a choice on its button, never
    // what happens because "Think it over" ran out.
    for (const event of EVENT_DECK) {
      const choice = event.choices.find((c) => c.id === event.defaultChoiceId)!;
      expect(choice.effect.incident, event.id).not.toBe('supplier_contamination');
    }
    const lot = eventById('evt-lot-notification');
    expect(lot.choices.find((c) => c.effect.incident === 'supplier_contamination')?.id).toBe(
      'hold'
    );
    expect(lot.choices.filter((c) => c.aiRecommended).map((c) => c.id)).toEqual(['test']);
  });

  it('uses every kind of condition that opens a better option', () => {
    const choiceConditions = EVENT_DECK.flatMap((event) =>
      event.choices.flatMap((choice) => (choice.requires ? [choice.requires] : []))
    );
    expect(choiceConditions.some((c) => c.plan)).toBe(true);
    expect(choiceConditions.some((c) => c.note)).toBe(true);
    expect(choiceConditions.some((c) => c.minStanding !== undefined)).toBe(true);
    expect(choiceConditions.some((c) => c.marks?.all?.length)).toBe(true);
  });

  it('says on the button what an errand prepares and what a hand-over will rule', () => {
    const culvert = eventById('evt-culvert-mason').choices.find((c) => c.id === 'rebuild')!;
    expect(describeEffect(culvert.effect)).toContain(
      'prepares the intake and grain stores for the long night'
    );
    const handOver = eventById('evt-court-short-weight').choices.find((c) => c.id === 'partner')!;
    expect(describeEffect(handOver.effect)).toContain(
      'the AI partner rules the rest: ended Valley Haulage’s contract for the abandoned run'
    );
  });

  it('hands over without dropping a ruling’s own later consequence', () => {
    let state = signed();
    state = run(state, 8);
    expect(state.marks['sacks-kept']?.actor).toBe('ai-partner');
    expect(state.followUps.some((f) => f.eventId === 'evt-sacks-short-again')).toBe(true);
  });
});
