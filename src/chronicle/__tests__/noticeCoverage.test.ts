/**
 * The drift guard for read-time translation (CLAUDE.md, Chronicle rule 7).
 * The engine writes its log in English; `localizedNotice` and
 * `localizedInitiative` re-render a record only when it matches a template
 * exactly, so an engine sentence reworded without its template silently ships
 * English to pt-BR readers. This drives the engine through every notice- and
 * initiative-writing path it can reach and requires each record to re-render.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from '../../i18n';
import { DEFAULT_CHARTER } from '../charter';
import { CHRONICLE_SHIFTS } from '../cropYears';
import {
  acceptTraining,
  canAfford,
  choiceAvailable,
  chooseEventOption,
  closeShift,
  createInitialState,
  fireDidNotStart,
  planImprovement,
  releaseStrandedFire,
  resolveShortfall,
  setAusterity,
  setBrief,
  setDelegation,
  settleUnfinishedInstalls,
  signCharter,
  startInstall,
  type ChronicleState,
  type ShiftCloseEvidence,
} from '../engine';
import { EVENT_DECK } from '../eventDeck';
import { briefServes } from '../governance';
import { IMPROVEMENTS } from '../plans';
import { localizedInitiative, localizedNotice } from '../presentation';
import { chronicleChance } from '../rng';
import type { BriefId, Charter, ChronicleNotice, Initiative } from '../types';

const baseline = { reportId: null, qcTestIds: [], challengeIds: [], orders: [] };
const eventById = (id: string) => EVENT_DECK.find((event) => event.id === id)!;

let minute = 0;
function evidence(
  seed: number,
  index: number,
  revenue = 2000,
  dispatchedKg = 3000
): ShiftCloseEvidence {
  minute += 480;
  return {
    report: {
      id: `coverage-report-${minute}`,
      grade: index % 3 === 0 ? 'C' : 'A',
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
    qcTests: [{ id: `qc-${seed}-${index}-${minute}`, passed: true }],
  };
}

const notices = new Map<string, ChronicleNotice>();
const initiatives = new Map<string, Initiative>();
function keep(state: ChronicleState): ChronicleState {
  for (const notice of state.notices)
    notices.set(JSON.stringify([notice.title, notice.body, notice.kind, notice.relatedId]), notice);
  for (const entry of state.initiatives)
    initiatives.set(JSON.stringify([entry.summary, entry.reason, entry.kind]), entry);
  return state;
}

const signed = (seed: number, charter: Partial<Omit<Charter, 'seed'>> = {}) =>
  keep(signCharter(createInitialState(), { ...DEFAULT_CHARTER, ...charter }, seed, baseline).state);

const rich = (state: ChronicleState): ChronicleState => ({
  ...state,
  ledger: {
    ...state.ledger,
    fund: { ...state.ledger.fund, charter: 20_000 },
    knowHow: { ...state.ledger.knowHow, grades: 500 },
  },
});

type Player = 'lapse' | 'answer' | 'seeded' | 'delegate';

/** A whole chronicle, closing every shift and answering the desk as the player would. */
function play(
  seed: number,
  player: Player,
  brief: BriefId = 'conventional',
  charter = {},
  dispatchedKg = 3000
) {
  let state = signed(seed, charter);
  if (player === 'delegate') {
    state = keep(setBrief(rich(state), brief).state);
    state = keep(setDelegation(state, 3).state);
  }
  for (let i = 0; i < CHRONICLE_SHIFTS + 2 && state.status === 'active'; i++) {
    state = keep(closeShift(state, evidence(seed, i, 2000, dispatchedKg), EVENT_DECK).state);
    if (player === 'delegate')
      for (const plan of IMPROVEMENTS) state = keep(planImprovement(state, plan.id).state);
    if (player === 'lapse' || player === 'delegate') continue;
    state.pendingEvents.forEach((pending, j) => {
      const event = eventById(pending.eventId);
      const options = event.choices.filter(
        (c) => choiceAvailable(state, c) && canAfford(state, c.cost)
      );
      const roll = chronicleChance(seed, 'coverage', i * 10 + j);
      if (player === 'seeded' && roll < 0.2) return;
      const choice =
        player === 'answer'
          ? options.find((c) => c.id !== event.defaultChoiceId)
          : options[Math.floor(((roll - 0.2) / 0.8) * options.length)];
      if (choice)
        state = keep(
          chooseEventOption(state, pending.instanceId, choice.id, 'player', EVENT_DECK).state
        );
    });
    if (player === 'answer' && state.trainingOffered) state = keep(acceptTraining(state));
  }
  return keep(settleUnfinishedInstalls(state));
}

/** The paths a whole chronicle does not reliably reach. */
function edges() {
  const base = rich(signed(11));
  // The fire's stop held by another stop, or cleared outside the chronicle.
  const burning = { ...base, fire: { active: true, suppressing: false, resolveAtMinute: null } };
  keep(fireDidNotStart(burning));
  keep(releaseStrandedFire(burning));
  // Austerity on and off.
  keep(setAusterity(setAusterity(base, true), false));
  // A shortfall paid in full, with and without members' extra effort.
  for (const fund of [0, 100_000]) {
    let short: ChronicleState = {
      ...base,
      ledger: {
        ...base.ledger,
        fund: Object.fromEntries(
          Object.keys(base.ledger.fund).map((k) => [k, 0])
        ) as typeof base.ledger.fund,
      },
    };
    short = keep(closeShift(short, evidence(11, 1, 0), []).state);
    if (short.upkeepShortfall) {
      const paid = fund
        ? { ...short, ledger: { ...short.ledger, fund: { ...short.ledger.fund, charter: fund } } }
        : short;
      keep(resolveShortfall(paid, 'forced').state);
      keep(resolveShortfall(short, 'conserve').state);
    }
  }
  // An install still running when the chronicle closes.
  let planned = keep(planImprovement(base, IMPROVEMENTS[0].id).state);
  planned = keep(startInstall(planned, IMPROVEMENTS[0].id, 'player').state);
  keep(settleUnfinishedInstalls(planned));
}

/**
 * Titles that are proper names, the same in both languages (GLOSSARY.md, "Never
 * translate"); their bodies must still re-render.
 */
const PROPER_NAME_TITLES = ['Mondragon'];

afterEach(() => setLocale('en'));

describe('every notice the engine writes has a pt-BR template', () => {
  for (const seed of [3, 11, 29]) {
    for (const player of ['lapse', 'answer', 'seeded'] as const) play(seed, player);
    for (const brief of ['conventional', 'standards', 'thrift', 'neighbour'] as const)
      play(seed, 'delegate', brief);
  }
  play(7, 'answer', 'conventional', { plant: 'tired', fortune: 'hard', customers: 'demanding' });
  // A short chronicle's trials carry their own briefings and figures (item 4.2).
  for (const seed of [3, 29]) play(seed, 'answer', 'conventional', { length: 'short' });
  play(5, 'answer', 'conventional', { length: 'short' }, 0);
  // Trials missed for want of dispatch: the failures, and training offered and taken.
  play(5, 'answer', 'conventional', {}, 0);
  edges();

  it('reaches the paths it guards', () => {
    const titles = [...notices.values()].map((notice) => notice.title);
    for (const pattern of [
      /: lapsed$/,
      /^Training mode is available$/,
      /^Training mode on$/,
      /: no longer needed$/,
      /^Duct fire stop released$/,
      /^Duct cleared during the stop$/,
      / not commissioned$/,
      /^Forced maintenance$/,
    ])
      expect(
        titles.some((title) => pattern.test(title)),
        String(pattern)
      ).toBe(true);
    expect(
      [...notices.values()].some((n) => /^Upkeep paid in full: \d+ from the fund\.$/.test(n.body))
    ).toBe(true);
    // A ruling's result carrying its changes, on the player's, the lapse's and the partner's path.
    for (const title of [/: (?!lapsed$)[^(]+$/, /: lapsed$/, / \(ruled by the AI partner\)$/])
      expect(
        [...notices.values()].some(
          (n) => n.kind === 'event' && title.test(n.title) && / [+-]\d+(?:\.\d+)?\)$/.test(n.body)
        ),
        String(title)
      ).toBe(true);
    expect(
      [...initiatives.values()].some(
        (entry) => / brief/.test(entry.reason) && entry.kind === 'install'
      )
    ).toBe(true);
    expect(notices.size).toBeGreaterThan(150);
  });

  it('re-renders every notice in pt-BR, title and body', () => {
    setLocale('pt-BR');
    const english = [...notices.values()].filter((notice) => {
      const local = localizedNotice(notice);
      const sameTitle = local.title === notice.title && !PROPER_NAME_TITLES.includes(notice.title);
      return sameTitle || local.body === notice.body;
    });
    expect(english.map((n) => `${n.kind} [${n.relatedId}] ${n.title} | ${n.body}`)).toEqual([]);
  });

  it('re-renders every initiative in pt-BR, summary and reason', () => {
    setLocale('pt-BR');
    const english = [...initiatives.values()].filter((entry) => {
      const local = localizedInitiative(entry);
      return local.summary === entry.summary || local.reason === entry.reason;
    });
    expect(english.map((e) => `${e.kind} [${e.targetId}] ${e.summary} | ${e.reason}`)).toEqual([]);
  });
});

describe('the partner’s install reason names the brief that ranked the plan', () => {
  /** One delegated close with every plan drawn up and the fund to install one. */
  const delegatedInstall = (brief: BriefId) => {
    let state = keep(setBrief(rich(signed(11, { mode: 'no_trials' })), brief).state);
    state = keep(setDelegation(state, 3).state);
    for (const plan of IMPROVEMENTS) state = keep(planImprovement(state, plan.id).state);
    state = closeShift(state, evidence(11, 1), []).state;
    return state.initiatives.find((entry) => entry.kind === 'install')!;
  };

  it('keeps the conventional sentence byte for byte', () => {
    expect(delegatedInstall('conventional').reason).toBe(
      'The cheapest ready plan, leaving 3 shifts of upkeep in reserve.'
    );
  });

  it('says a thrift-brief install was ranked by the thrift brief, in both languages', () => {
    const entry = delegatedInstall('thrift');
    const plan = IMPROVEMENTS.find((candidate) => candidate.id === entry.targetId)!;
    expect(entry.reason).toBe(
      briefServes('thrift', plan)
        ? 'The thrift brief takes the ready plans that serve it first; this was the cheapest of them over a crop year, leaving 3 shifts of upkeep in reserve.'
        : 'No ready plan serves the thrift brief, so this was the cheapest over a crop year, leaving 3 shifts of upkeep in reserve.'
    );
    setLocale('pt-BR');
    const local = localizedInitiative(entry);
    expect(local.reason).toContain('orientação Economia');
    expect(local.reason).toContain('ao longo de um ano agrícola');
    expect(local.summary).not.toBe(entry.summary);
  });
});
