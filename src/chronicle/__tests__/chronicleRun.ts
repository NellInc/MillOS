/**
 * A seeded whole-chronicle run for the length tests (plan item 4.2): closes
 * every shift on fixed evidence and answers the desk the same way every time.
 */
import { DEFAULT_CHARTER } from '../charter';
import { CHRONICLE_SHIFTS } from '../cropYears';
import {
  canAfford,
  choiceAvailable,
  chooseEventOption,
  closeShift,
  createInitialState,
  planImprovement,
  setDelegation,
  signCharter,
  startInstall,
  type ChronicleState,
  type ShiftCloseEvidence,
} from '../engine';
import { EVENT_DECK } from '../eventDeck';
import { IMPROVEMENTS } from '../plans';
import { chronicleChance } from '../rng';
import type { Charter } from '../types';

const baseline = { reportId: null, qcTestIds: [], challengeIds: [], orders: [] };

export function pinEvidence(seed: number, index: number, kg: number): ShiftCloseEvidence {
  const minute = (index + 1) * 480;
  return {
    report: {
      id: `pin-${seed}-${index}`,
      grade: index % 5 === 0 ? 'C' : index % 3 === 0 ? 'B' : 'A',
      endedAtMinute: minute,
      metrics: {
        revenue: 2000 + (index % 4) * 300,
        energyCost: 150 + (index % 3) * 40,
        automationCost: 0,
        wasteCost: 0,
        maintenanceCost: 0,
        demurrageCost: 0,
        latePenalties: 0,
        dispatchedKg: kg + (index % 4) * 400,
        qualityFailureKg: index % 11 === 7 ? 120 : 0,
        incidentsResolved: 0,
        automaticActions: 0,
        commitmentMinutes: 0,
      },
    },
    orders: [],
    incidents: [],
    challengeActive: false,
    challengeHistory: [],
    qcTests: index % 2 === 0 ? [{ id: `qc-${seed}-${index}`, passed: true }] : [],
  };
}

export type PinPlayer = 'lapse' | 'answer' | 'delegate';

export interface PlayResult {
  state: ChronicleState;
  /** A rolling digest of the state after every close, so no mid-run change is evicted. */
  trail: string;
}

/** A whole seeded chronicle, answering the desk the same way every time. */
export function playChronicle(
  seed: number,
  player: PinPlayer,
  charter: Partial<Omit<Charter, 'seed'>> = {},
  kg = 3000,
  onClose?: (state: ChronicleState) => void
): PlayResult {
  let state = signCharter(
    createInitialState(),
    { ...DEFAULT_CHARTER, ...charter },
    seed,
    baseline
  ).state;
  if (player === 'delegate') state = setDelegation(state, 3).state;
  let trail = digest(state);
  for (let i = 0; i < CHRONICLE_SHIFTS + 3 && state.status === 'active'; i++) {
    state = closeShift(state, pinEvidence(seed, i, kg), EVENT_DECK).state;
    trail = digestText(trail + digest(state));
    onClose?.(state);
    if (player === 'lapse') continue;
    if (player === 'delegate') {
      for (const plan of IMPROVEMENTS) state = planImprovement(state, plan.id).state;
      continue;
    }
    for (const [j, pending] of state.pendingEvents.entries()) {
      const event = EVENT_DECK.find((candidate) => candidate.id === pending.eventId);
      if (!event) continue;
      const options = event.choices.filter(
        (c) => choiceAvailable(state, c) && canAfford(state, c.cost)
      );
      const roll = chronicleChance(seed, 'pin', i * 10 + j);
      const choice = options[Math.floor(roll * options.length)];
      if (choice)
        state = chooseEventOption(state, pending.instanceId, choice.id, 'player', EVENT_DECK).state;
    }
    const plan = IMPROVEMENTS[i % IMPROVEMENTS.length];
    state = planImprovement(state, plan.id).state;
    state = startInstall(state, plan.id, 'player').state;
  }
  return { state, trail };
}

/** The state's digest, quiz fields left out. */
export function digest(state: ChronicleState): string {
  return digestText(JSON.stringify(state, (key, value) => (/quiz/i.test(key) ? undefined : value)));
}

/** cyrb53. */
function digestText(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
