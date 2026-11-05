/**
 * Part three's saved English, read in Portuguese (CLAUDE.md, Chronicle rule 7).
 * Every fixture is written by the real engine; the adapter re-renders the ones
 * it recognises and leaves anything else exactly as stored.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from '../../i18n';
import { DEFAULT_CHARTER } from '../charter';
import { SHIFTS_PER_CROP_YEAR } from '../cropYears';
import {
  closeShift,
  createInitialState,
  meetNeed,
  policyBlockReason,
  proposePolicy,
  setBrief,
  setAusterity,
  setDelegation,
  setReserveAutofill,
  signCharter,
  withdrawProposal,
  type ChronicleState,
  type ShiftCloseEvidence,
} from '../engine';
import { EVENT_DECK } from '../eventDeck';
import {
  ADMINISTRATION_SHIFTS,
  assemblyBallots,
  BRIEFS,
  COUNTDOWN_SHIFTS,
  CREW_PROFILES,
  CREW_ROLE_IDS,
  crewProfileOf,
  getBriefs,
  getLadder,
  getPolicyLadders,
  getRedLines,
  getRung,
  getStandingConditions,
  getTemperaments,
  localizedCrewMember,
  POLICY_LADDERS,
  RED_LINES,
  STANDING_CONDITIONS,
  TEMPERAMENTS,
} from '../governance';
import {
  localizedBallotReason,
  localizedBlockReason,
  localizedConcession,
  localizedInitiative,
  localizedNotice,
} from '../presentation';
import type { ChronicleNotice, CrewMember, Initiative, PolicyLadder, PolicyRung } from '../types';

const baseline = { reportId: null, qcTestIds: [], challengeIds: [], orders: [] };
const signed = (seed = 11, plant: 'overhauled' | 'working' | 'tired' = 'overhauled') =>
  signCharter(
    createInitialState(),
    { ...DEFAULT_CHARTER, plant, mode: 'no_trials' },
    seed,
    baseline
  ).state;

let minute = 0;
function evidence(dispatchedKg = 3000, revenue = 2000): ShiftCloseEvidence {
  minute += 480;
  return {
    report: {
      id: `localization-report-${minute}`,
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

/** Everything the engine wrote across the scenarios, kept by id past the notice cap. */
const notices = new Map<string, ChronicleNotice>();
const initiatives = new Map<string, Initiative>();
function keep(state: ChronicleState): ChronicleState {
  // Separate scenarios reuse ids, so the whole record is the key.
  for (const notice of state.notices) notices.set(JSON.stringify(notice), notice);
  for (const entry of state.initiatives) initiatives.set(JSON.stringify(entry), entry);
  return state;
}

function run(
  state: ChronicleState,
  shifts: number,
  kg = 3000,
  deck = [] as typeof EVENT_DECK,
  revenue = 2000
) {
  let next = state;
  for (let i = 0; i < shifts && next.status === 'active'; i++)
    next = keep(closeShift(next, evidence(kg, revenue), deck).state);
  return next;
}

const rich = (state: ChronicleState): ChronicleState => ({
  ...state,
  ledger: {
    ...state.ledger,
    fund: { ...state.ledger.fund, charter: 5000 },
    knowHow: { ...state.ledger.knowHow, grades: 500 },
  },
});

const unlock = (state: ChronicleState, ladder: PolicyLadder): ChronicleState => ({
  ...state,
  governance: {
    ...state.governance,
    changedShift: { ...state.governance.changedShift, [ladder]: -10 },
  },
});

function scenarios() {
  // The assembly: four eager members whose needs sit on run-to-failure, and two
  // (one of each profile) who need intake kept off "any lot".
  let state = rich(signed());
  state = {
    ...state,
    governance: {
      ...state.governance,
      crew: CREW_ROLE_IDS.map((id, index) => {
        const profile = CREW_PROFILES[id][index % 2];
        // The lab technician is even-handed and untouched by either change, so abstains.
        if (index === 3)
          return {
            ...profile,
            temperament: 'even' as const,
            prefers: { ladder: 'orders' as const, rung: 1 as const },
            need: { ...profile.need, ladder: 'orders' as const, rung: 0 as const },
          };
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
  // Carried 3 to 2 with one abstaining, two outvoted; the growers' red line starts counting.
  state = keep(proposePolicy(state, 'intake', 0).state);
  state = run(state, 1);
  // Does not carry (0 to 5, one abstaining); a concession turns one vote; then withdrawn.
  state = keep(proposePolicy(state, 'maintenance', 0).state);
  state = keep(meetNeed(state, 'head-miller').state);
  state = keep(withdrawProposal(state));
  // An objection met outright.
  state = keep(meetNeed(state, 'packing').state);
  state = run(state, 1);
  // Back off "any lot": the yard hand's objection is lifted and the warning withdrawn.
  state = keep(proposePolicy(unlock(state, 'intake'), 'intake', 1).state);
  state = keep(setBrief(state, 'thrift').state);
  state = keep(setReserveAutofill(state, true));
  keep(setReserveAutofill(state, false));

  // A red line acted on.
  let line = rich(signed(12));
  line = {
    ...line,
    governance: {
      ...line.governance,
      crew: CREW_ROLE_IDS.map((id) => ({
        ...CREW_PROFILES[id][0],
        temperament: 'eager' as const,
        prefers: { ladder: 'maintenance' as const, rung: 1 as const },
        need: { ...CREW_PROFILES[id][0].need, ladder: 'maintenance' as const, rung: 0 as const },
      })),
    },
  };
  line = keep(proposePolicy(line, 'stock', 0).state);
  run(line, COUNTDOWN_SHIFTS + 1);

  // Deferred maintenance: raised after two shifts of austerity, cleared after three out of it.
  let austere = setAusterity(rich(signed()), true);
  austere = run(austere, 3);
  run(setAusterity(austere, false), 4);

  // Tired machinery stands from signing and clears once three plans are installed.
  const tired = rich(signed(11, 'tired'));
  run(
    {
      ...tired,
      improvements: ['moisture-meters', 'spare-parts-store', 'members-library'].map((id) => ({
        id,
        phase: 'installed' as const,
        contractorId: null,
        startedShift: 0,
        completesShift: 0,
        paidFund: 0,
        effectScale: 0,
        initiatedBy: 'player' as const,
      })),
    },
    1
  );

  // Worn rolls raised and cleared.
  let rolls = rich(signed(11, 'tired'));
  rolls = {
    ...rolls,
    governance: {
      ...rolls.governance,
      policies: { ...rolls.governance.policies, maintenance: 0 },
    },
  };
  rolls = run(rolls, 4);
  rolls = {
    ...rolls,
    governance: { ...rolls.governance, policies: { ...rolls.governance.policies, maintenance: 1 } },
  };
  run(rolls, 4);

  // Returns, a missed quota, the administrator arriving and leaving.
  let year = run(rich(signed()), SHIFTS_PER_CROP_YEAR, 3000);
  year = run(year, SHIFTS_PER_CROP_YEAR, 3500);
  year = run(year, SHIFTS_PER_CROP_YEAR * 2, 500);
  run(year, ADMINISTRATION_SHIFTS);

  // Three cooled organisations bring the administrator, setting an open proposal
  // aside; a grant changed while it stays is kept when it leaves.
  const cooled = rich(signed());
  let administered = run(
    {
      ...cooled,
      stakeholders: cooled.stakeholders.map((party) => ({ ...party, value: 0 })),
      governance: {
        ...cooled.governance,
        proposal: {
          ladder: 'orders',
          from: 1,
          to: 2,
          proposedShift: cooled.shift,
          concessions: [],
        },
      },
    },
    1
  );
  administered = keep(setDelegation(administered, 3).state);
  run(administered, ADMINISTRATION_SHIFTS);

  // The reserve covering upkeep, then giving its last.
  const broke = (balance: number) => {
    const state = signed();
    return {
      ...state,
      ledger: {
        ...state.ledger,
        fund: Object.fromEntries(
          Object.keys(state.ledger.fund).map((key) => [key, 0])
        ) as typeof state.ledger.fund,
      },
      governance: {
        ...state.governance,
        reserve: { balance, autofill: false, drawn: 0 },
      },
    };
  };
  run(broke(10_000), 1, 3000, [], 0);
  run(broke(1), 1, 3000, [], 0);

  // The partner on a brief: a forecast it guards, and a routine event it answers.
  const guarded = setBrief(rich(signed()), 'standards').state;
  run(
    {
      ...guarded,
      delegation: 2,
      modifiers: [
        {
          id: 'm',
          sourceId: 'test',
          label: 'Clean filters',
          remainingShifts: 9,
          forecastChance: -0.15,
        },
      ],
      forecasts: [
        {
          id: 'forecast-90',
          kind: 'dust_filter_pressure',
          issuedShift: guarded.shift,
          dueShift: guarded.shift + 5,
          chance: 0.3,
          mitigated: false,
          mitigatedBy: null,
          paidFund: 0,
          status: 'pending',
        },
      ],
    },
    1
  );
  const workshop = EVENT_DECK.find((event) => event.id === 'evt-millwrights-workshop')!;
  const thrifty = setBrief(rich(signed()), 'thrift').state;
  run(
    {
      ...thrifty,
      delegation: 1,
      pendingEvents: [
        {
          instanceId: 'event-91',
          eventId: workshop.id,
          appearedShift: thrifty.shift,
          lapsesShift: thrifty.shift + 3,
        },
      ],
    },
    1,
    3000,
    [workshop]
  );
}

/** Notices part three writes, by their English title. */
const GOVERNANCE_TITLES: Array<[string, RegExp]> = [
  ['carried', /^The assembly carries the /],
  ['not carried', /^The assembly does not carry the /],
  ['withdrawn', /^Proposal withdrawn$/],
  ['need met', /’s need is met$/],
  ['objection met', /’s objection is met$/],
  ['brief', /^The AI partner’s brief: /],
  ['autofill', /^Reserve autofill (on|off)$/],
  ['reserve drawn', /^Drawn from the co-op reserve$/],
  ['return', /^Crop year \d+ return filed$/],
  ['administrator arrives', /^The federation sends an administrator$/],
  ['administrator leaves', /^The administrator leaves$/],
  ['red line acts', / acts on its warning$/],
  ['red line withdrawn', / withdraws its warning$/],
  ['countdown', /: \d+ shifts$/],
  [
    'condition',
    new RegExp(
      `^(${Object.values(STANDING_CONDITIONS)
        .map((c) => c.label)
        .join('|')})(: cleared)?$`
    ),
  ],
];

/** English that must not survive a recognised re-rendering. */
const ENGLISH = /\b(the|their|they|is|was|of|and|to|policy|brief|shifts?|quota)\b/;

afterEach(() => setLocale('en'));

describe('part three presentation copies', () => {
  it('are the English definitions themselves in English', () => {
    setLocale('en');
    expect(getPolicyLadders()).toEqual(POLICY_LADDERS);
    expect(getStandingConditions()).toEqual(STANDING_CONDITIONS);
    expect(getTemperaments()).toEqual(TEMPERAMENTS);
    expect(getRedLines()).toEqual(RED_LINES);
    expect(getBriefs()).toEqual(BRIEFS);
    for (const id of CREW_ROLE_IDS)
      for (const profile of CREW_PROFILES[id])
        expect(localizedCrewMember(profile)).toEqual(profile);
  });

  it('translate every label and fill every number slot from the English', () => {
    setLocale('pt-BR');
    const ladders = getPolicyLadders();
    POLICY_LADDERS.forEach((raw, index) => {
      const local = ladders[index];
      expect(local.label).not.toBe(raw.label);
      expect(local.id).toBe(raw.id);
      raw.rungs.forEach((rung, step) => {
        const translated = local.rungs[step];
        expect(translated.label).not.toBe(rung.label);
        expect(translated.effectText).not.toBe(rung.effectText);
        expect(translated.effectText).not.toMatch(/\{n\d+\}|\d\.\d/);
        // Every English number is there, in order, in pt-BR form.
        const numbers = (text: string) => text.match(/\d+(?:[.,]\d+)?/g) ?? [];
        expect(numbers(translated.effectText).map((n) => n.replace(',', '.'))).toEqual(
          numbers(rung.effectText)
        );
        expect(translated.effect).toBe(rung.effect);
      });
    });
    expect(getRung('maintenance', 0).effectText).toContain('x0,85');
    for (const condition of Object.values(STANDING_CONDITIONS)) {
      const local = getStandingConditions()[condition.id];
      for (const field of ['label', 'effectText', 'clearText'] as const)
        expect(local[field]).not.toBe(condition[field]);
      expect(local.effectText).not.toMatch(/\{n\d+\}|\d\.\d/);
      expect(local.effect).toBe(condition.effect);
    }
    for (const [id, temperament] of Object.entries(TEMPERAMENTS)) {
      expect(getTemperaments()[id as keyof typeof TEMPERAMENTS].label).not.toBe(temperament.label);
      expect(getTemperaments()[id as keyof typeof TEMPERAMENTS].rule).not.toBe(temperament.rule);
    }
    RED_LINES.forEach((line, index) => expect(getRedLines()[index].reason).not.toBe(line.reason));
  });

  it('look a saved crew member up by its profile, and keep an unknown one as stored', () => {
    setLocale('pt-BR');
    for (const id of CREW_ROLE_IDS)
      CREW_PROFILES[id].forEach((profile, index) => {
        const saved = structuredClone(profile);
        expect(crewProfileOf(saved)).toBe(index);
        const local = localizedCrewMember(saved);
        expect(saved).toEqual(profile);
        // Only the words change: ids, steps and the fund stay as saved.
        expect({
          ...local,
          role: '',
          value: '',
          need: { ...local.need, text: '', concession: '' },
        }).toEqual({
          ...profile,
          role: '',
          value: '',
          need: { ...profile.need, text: '', concession: '' },
        });
        for (const text of [local.role, local.value, local.need.text, local.need.concession])
          expect([
            profile.role,
            profile.value,
            profile.need.text,
            profile.need.concession,
          ]).not.toContain(text);
        expect(localizedConcession(profile.need.concession, saved)).toBe(local.need.concession);
      });
    const edited: CrewMember = { ...CREW_PROFILES.lab[0], value: 'a value from another build' };
    expect(crewProfileOf(edited)).toBeNull();
    expect(localizedCrewMember(edited)).toBe(edited);
    expect(localizedConcession(edited.need.concession, edited)).toBe(edited.need.concession);
  });
});

describe('saved part-three sentences', () => {
  scenarios();

  it('the scenarios wrote every kind of part-three notice and initiative', () => {
    const kinds = new Set(
      [...notices.values()].flatMap((notice) =>
        GOVERNANCE_TITLES.filter(([, title]) => title.test(notice.title)).map(([kind]) => kind)
      )
    );
    expect([...kinds].sort()).toEqual(GOVERNANCE_TITLES.map(([kind]) => kind).sort());
    // Standing conditions the plant raises and clears, as the engine wrote them.
    const titles = new Set([...notices.values()].map((notice) => notice.title));
    for (const title of [
      'Deferred maintenance',
      'Deferred maintenance: cleared',
      'Tired machinery: cleared',
      'Worn roll surfaces',
      'Worn roll surfaces: cleared',
    ])
      expect(titles, title).toContain(title);
    const carried = [...notices.values()].filter((n) => /carries the/.test(n.title));
    expect(carried.some((n) => /outvoted/.test(n.body))).toBe(true);
    expect(carried.some((n) => /objection is lifted/.test(n.body))).toBe(true);
    // Every composite shape the engine writes was reached.
    const bodies = [...notices.values()].map((notice) => `${notice.title} | ${notice.body}`);
    for (const shape of [
      /carries the .* \| Carried \d+ to \d+, \d+ abstaining\./,
      /does not carry the .* \| \d+ for, \d+ against, \d+ abstaining\./,
      /^The federation sends an administrator \| \d+ of the valley’s organisations have cooled .* The order book change before the assembly is set aside\.$/,
      /^The administrator leaves \| .*keeps the grant you set\.$/,
      /^The administrator leaves \| .*back where it was\.$/,
      /^Drawn from the co-op reserve \| .*the reserve covered \d+\.$/,
      /^Drawn from the co-op reserve \| .*gave its last \d+, and the rest is short\.$/,
      /return filed \| .* against a quota of [\d,]+ kg\. Quota met: .*raises next year’s quota/,
      /return filed \| .*Quota missed by [\d,]+ kg\./,
    ])
      expect(
        bodies.some((body) => shape.test(body)),
        String(shape)
      ).toBe(true);
    const reasons = [...initiatives.values()].map((entry) => entry.reason);
    expect(reasons.some((reason) => /threshold of the standards first brief/.test(reason))).toBe(
      true
    );
    expect(reasons.some((reason) => /the thrift brief:/.test(reason))).toBe(true);
  });

  it('re-renders every recognised notice in pt-BR and leaves the saved record unchanged', () => {
    const governance = [...notices.values()].filter((notice) =>
      GOVERNANCE_TITLES.some(([, title]) => title.test(notice.title))
    );
    expect(governance.length).toBeGreaterThan(20);
    for (const notice of governance) {
      const saved = structuredClone(notice);
      setLocale('en');
      expect(localizedNotice(notice)).toBe(notice);
      setLocale('pt-BR');
      const local = localizedNotice(notice);
      expect(local, `${notice.title} / ${notice.body}`).not.toBe(notice);
      expect(local.title, notice.title).not.toBe(notice.title);
      expect(local.body, notice.body).not.toBe(notice.body);
      expect(`${local.title} ${local.body}`, notice.body).not.toMatch(ENGLISH);
      expect({ ...local, title: notice.title, body: notice.body }).toEqual(notice);
      expect(notice).toEqual(saved);
    }
  });

  it('re-renders brief-bearing initiative reasons, and older "above" reasons', () => {
    setLocale('pt-BR');
    const governed = [...initiatives.values()].filter((entry) => / brief/.test(entry.reason));
    expect(governed.length).toBeGreaterThanOrEqual(2);
    for (const entry of governed) {
      const saved = structuredClone(entry);
      const local = localizedInitiative(entry);
      expect(local.reason, entry.reason).not.toBe(entry.reason);
      expect(local.reason).toMatch(/orientação/);
      expect(local.summary, entry.summary).not.toBe(entry.summary);
      expect(entry).toEqual(saved);
    }
    const mitigation = governed.find((entry) => entry.kind === 'mitigation')!;
    const older = {
      ...mitigation,
      reason: 'The forecast stood at 45%, above the 40% threshold.',
    };
    expect(localizedInitiative(older).reason).toBe(
      'A previsão estava em 45%, acima do limite de 40%.'
    );
    const current = {
      ...mitigation,
      reason: 'The forecast stood at 45%, at or above the 40% threshold.',
    };
    expect(localizedInitiative(current).reason).toBe(
      'A previsão estava em 45%, igual ou acima do limite de 40%.'
    );
  });

  it('keeps unknown, edited and wrongly anchored records exactly as stored', () => {
    setLocale('pt-BR');
    const sample = (pattern: RegExp) => [...notices.values()].find((n) => pattern.test(n.title))!;
    const carried = sample(/carries the/);
    const condition = [...notices.values()].find((n) => n.title === 'Worn roll surfaces')!;
    const countdown = sample(/: \d+ shifts$/);
    const filed = sample(/return filed/);
    const records = [
      { ...carried, body: `${carried.body} The miller’s cat objects.` },
      { ...carried, title: 'The assembly carries the tea change' },
      { ...condition, relatedId: 'thin-stocks' },
      { ...condition, body: condition.body.replace('To clear:', 'To clean:') },
      { ...countdown, relatedId: null },
      { ...countdown, kind: 'event' as const },
      { ...filed, body: `${filed.body} Bonus: cake.` },
      { ...sample(/^Proposal withdrawn$/), kind: 'ledger' as const },
    ];
    for (const record of records) expect(localizedNotice(record)).toBe(record);
    const mitigation = [...initiatives.values()].find((entry) => entry.kind === 'mitigation')!;
    const edited = { ...mitigation, reason: `${mitigation.reason} Probably.` };
    expect(localizedInitiative(edited)).toBe(edited);
  });
});

describe('live part-three sentences', () => {
  it('renders every ballot reason the crew can give, and leaves an unknown one', () => {
    const reasons: Array<[string, CrewMember]> = [];
    for (const pick of [0, 1] as const) {
      const crew = CREW_ROLE_IDS.map((id) => CREW_PROFILES[id][pick]);
      for (const ladder of POLICY_LADDERS)
        for (const from of [0, 1, 2] as PolicyRung[])
          for (const to of [from - 1, from + 1].filter((r) => r >= 0 && r <= 2) as PolicyRung[])
            for (const objections of [
              [],
              crew.map((member) => ({
                memberId: member.id,
                ladder: ladder.id,
                rung: from,
                raisedShift: 1,
              })),
              crew.map((member) => ({
                memberId: member.id,
                ladder: ladder.id === 'stock' ? ('orders' as const) : ('stock' as const),
                rung: 1 as const,
                raisedShift: 1,
              })),
            ])
              for (const concessions of [[], crew.map((member) => member.id)])
                assemblyBallots(
                  { crew, objections },
                  { ladder: ladder.id, from, to, concessions }
                ).forEach((ballot) =>
                  reasons.push([ballot.reason, crew.find((m) => m.id === ballot.memberId)!])
                );
    }
    // Every template is reached.
    for (const fragment of [
      'is met another way',
      'cuts against',
      'lifts their objection',
      'still stands',
      'moves toward',
      'moves away',
      'back a change',
      'distrust',
      'does not touch',
    ])
      expect(
        reasons.some(([reason]) => reason.includes(fragment)),
        fragment
      ).toBe(true);
    setLocale('en');
    for (const [reason, member] of reasons)
      expect(localizedBallotReason(reason, member)).toBe(reason);
    setLocale('pt-BR');
    for (const [reason, member] of reasons) {
      const local = localizedBallotReason(reason, member);
      expect(local, reason).not.toBe(reason);
      expect(local, reason).not.toMatch(ENGLISH);
    }
    const stranger = { ...CREW_PROFILES.yard[0], value: 'a value from another build' };
    const theirs = 'it moves toward what they value: a value from another build';
    expect(localizedBallotReason(theirs, stranger)).toBe(theirs);
    expect(localizedBallotReason('it does not touch them', stranger)).toBe('não lhe diz respeito');
    expect(localizedBallotReason('a reason from another build', undefined)).toBe(
      'a reason from another build'
    );
  });

  it('renders every reason a step cannot be proposed, and leaves an unknown one', () => {
    const state = rich(signed());
    const poor = {
      ...signed(),
      ledger: { ...signed().ledger, knowHow: { ...signed().ledger.knowHow, grades: 0 } },
    };
    const proposed = proposePolicy(
      {
        ...state,
        governance: {
          ...state.governance,
          crew: CREW_ROLE_IDS.map((id) => ({
            ...CREW_PROFILES[id][0],
            temperament: 'cautious' as const,
          })),
        },
      },
      'stock',
      2
    ).state;
    const changed = (shift: number) => ({
      ...state,
      governance: {
        ...state.governance,
        changedShift: { ...state.governance.changedShift, orders: shift },
      },
    });
    const reasons = [
      policyBlockReason({ ...state, status: 'ended' }, 'orders', 2),
      policyBlockReason(
        {
          ...state,
          governance: {
            ...state.governance,
            administration: { untilShift: 9, previousDelegation: 0 },
          },
        },
        'orders',
        2
      ),
      policyBlockReason(state, 'orders', 1),
      policyBlockReason(changed(state.shift - 2), 'orders', 2),
      policyBlockReason(changed(state.shift), 'orders', 2),
      policyBlockReason(state, 'maintenance', 2),
      policyBlockReason(proposed, 'orders', 2),
      policyBlockReason(poor, 'orders', 2),
    ];
    expect(reasons.every((reason) => reason !== null)).toBe(true);
    expect(new Set(reasons).size).toBe(reasons.length);
    setLocale('pt-BR');
    for (const reason of reasons as string[]) {
      const local = localizedBlockReason(reason);
      expect(local, reason).not.toBe(reason);
      expect(local, reason).not.toMatch(ENGLISH);
    }
    expect(localizedBlockReason(reasons[3]!)).toBe('mudou há pouco: falta 1 turno');
    expect(localizedBlockReason(reasons[5]!)).toBe('requer Monitoramento de vibração');
    expect(localizedBlockReason('needs a miracle')).toBe('needs a miracle');
    setLocale('en');
    for (const reason of reasons as string[]) expect(localizedBlockReason(reason)).toBe(reason);
  });

  it('names ladders and steps for a saved policy in the reader’s language', () => {
    setLocale('pt-BR');
    expect(getLadder('orders').label).toBe('Carteira de pedidos');
    expect(getRung('stock', 2).label).toBe('Reserva estratégica');
  });
});

describe('standing-condition notices', () => {
  it('re-render for every condition, raised or cleared, and only under its own id', () => {
    // The engine's two shapes (engine.ts, assessConditions' notices), for every definition.
    for (const condition of Object.values(STANDING_CONDITIONS)) {
      const raised: ChronicleNotice = {
        id: 'notice-3',
        shift: 4,
        kind: 'ledger',
        title: condition.label,
        body: `${condition.effectText.charAt(0).toUpperCase()}${condition.effectText.slice(1)}. To clear: ${condition.clearText}.`,
        relatedId: condition.id,
      };
      const cleared: ChronicleNotice = {
        ...raised,
        title: `${condition.label}: cleared`,
        body: 'Its effect has lifted.',
      };
      setLocale('en');
      expect(localizedNotice(raised)).toBe(raised);
      setLocale('pt-BR');
      const local = getStandingConditions()[condition.id];
      expect(localizedNotice(raised)).toEqual({
        ...raised,
        title: local.label,
        body: `${local.effectText.charAt(0).toUpperCase()}${local.effectText.slice(1)}. Para resolver: ${local.clearText}.`,
      });
      expect(localizedNotice(cleared)).toEqual({
        ...cleared,
        title: `Condição encerrada: ${local.label}`,
        body: 'O efeito deixou de valer.',
      });
      for (const stray of [
        { ...raised, relatedId: null },
        { ...raised, kind: 'event' as const },
        { ...cleared, body: 'Its effect has mostly lifted.' },
        { ...raised, title: `${condition.label}!` },
      ])
        expect(localizedNotice(stray)).toBe(stray);
    }
  });
});
