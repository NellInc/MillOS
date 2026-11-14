/**
 * Local playtest funnel for the Chronicle. It records where a player gets to
 * in each charter, and whether they come back to it in a later session.
 *
 * - LOCAL ONLY. It is written to this browser's localStorage under
 *   `millos-chronicle-funnel` and never sent anywhere. A playtester can copy it
 *   from devtools: `JSON.parse(localStorage['millos-chronicle-funnel'])`.
 * - It observes the Chronicle store and never writes to it, so it cannot change
 *   play. It is not installed in benchmark runtime (src/main.tsx), so captures
 *   see the plant unchanged.
 * - A new shift is detected by report id, never by count (Chronicle rule 3).
 *
 * The questions it answers:
 * - Did they sign a charter at all?
 * - How many shifts did they close before stopping?
 * - Did they abandon the charter, or reach its end?
 * - Did they return to it in a later session?
 * - How many decisions did they make themselves, and how many were delegated?
 * - How often did a completed programme's charter offer bring them here?
 *
 * Working if a charter's outcome, shift count and session count match what was
 * played, and a benchmark run writes no funnel key.
 */
import type { ChronicleState } from './engine';
import { chronicleLength } from './schedule';
import type { ChronicleLength } from './types';

export const FUNNEL_STORAGE_KEY = 'millos-chronicle-funnel';
/** Oldest charters drop off past this, so the log stays small. */
export const MAX_FUNNEL_CHARTERS = 20;

export interface CharterFunnel {
  /** The charter's seed, which identifies it across reloads. */
  seed: number;
  /**
   * 63 shifts (full) or 27 (short), so outcomes can be read per length (item
   * 4.2, D3). Absent in logs written before lengths, which were all full.
   */
  length?: ChronicleLength;
  /** When it was signed, in epoch ms; null if it was signed before the funnel existed. */
  signedAt: number | null;
  /** Sessions in which this charter was in play. 1 means the player never came back to it. */
  sessions: number;
  shiftsClosed: number;
  /** The Chronicle shift number when last observed. */
  lastShift: number;
  /** Event choices the player made themselves. */
  decisions: number;
  /** Event choices made by the AI partner or by the Chronicle on the player's behalf. */
  delegatedDecisions: number;
  /** Quiz questions answered for the first time during this charter. */
  quizAnswered: number;
  outcome: 'active' | 'ended' | 'abandoned';
  /** When it ended or was abandoned, in epoch ms. */
  closedAt: number | null;
  /** Last time something happened in it (sign, shift, decision, close), in epoch ms. */
  lastActivityAt: number | null;
}

export interface FunnelLog {
  version: 1;
  /** App sessions started, whether or not a charter was in play. */
  sessions: number;
  chartersSigned: number;
  /**
   * Times the charter offer on a completed programme's card opened the
   * Chronicle with no charter in play. Logs written before it existed read 0.
   */
  charterOffersOpened: number;
  charters: CharterFunnel[];
}

export function emptyFunnelLog(): FunnelLog {
  return { version: 1, sessions: 0, chartersSigned: 0, charterOffersOpened: 0, charters: [] };
}

type Observed = Pick<
  ChronicleState,
  'status' | 'charter' | 'shift' | 'lastReportId' | 'eventHistory' | 'quizAnswered'
>;

function newCharter(seed: number, signedAt: number | null, state: Observed): CharterFunnel {
  return {
    seed,
    length: chronicleLength(state.charter),
    signedAt,
    sessions: 1,
    shiftsClosed: 0,
    lastShift: state.shift,
    decisions: 0,
    delegatedDecisions: 0,
    quizAnswered: 0,
    outcome: 'active',
    closedAt: null,
    lastActivityAt: signedAt,
  };
}

function replaceCharter(log: FunnelLog, next: CharterFunnel): FunnelLog {
  return {
    ...log,
    charters: log.charters.map((c) => (c.seed === next.seed && c.outcome === 'active' ? next : c)),
  };
}

function activeCharter(log: FunnelLog, seed: number | undefined): CharterFunnel | undefined {
  if (seed === undefined) return undefined;
  return log.charters.find((c) => c.seed === seed && c.outcome === 'active');
}

function withCharter(log: FunnelLog, charter: CharterFunnel, signed: boolean): FunnelLog {
  const charters = [...log.charters, charter].slice(-MAX_FUNNEL_CHARTERS);
  return { ...log, charters, chartersSigned: log.chartersSigned + (signed ? 1 : 0) };
}

/**
 * Fold one Chronicle state change into the log. Pure: returns the same log
 * object when nothing worth recording changed, so callers can skip the write.
 */
export function stepFunnel(log: FunnelLog, prev: Observed, next: Observed, now: number): FunnelLog {
  const prevSeed = prev.status !== 'unsigned' ? prev.charter?.seed : undefined;
  const nextSeed = next.status !== 'unsigned' ? next.charter?.seed : undefined;
  let out = log;

  // The previous charter left play: abandoned (back to unsigned) or replaced.
  if (prev.status === 'active' && prevSeed !== undefined && nextSeed !== prevSeed) {
    const closing = activeCharter(out, prevSeed);
    if (closing)
      out = replaceCharter(out, {
        ...closing,
        outcome: 'abandoned',
        closedAt: now,
        lastActivityAt: now,
      });
  }

  if (next.status === 'unsigned' || nextSeed === undefined) return out;

  let charter = activeCharter(out, nextSeed);
  if (!charter) {
    // Only a charter seen being signed counts as signed in this log.
    if (next.status !== 'active' || prevSeed === nextSeed) return out;
    out = withCharter(out, newCharter(nextSeed, now, next), true);
    charter = activeCharter(out, nextSeed)!;
  }

  let updated = charter;
  if (next.lastReportId !== null && next.lastReportId !== prev.lastReportId) {
    updated = { ...updated, shiftsClosed: updated.shiftsClosed + 1, lastActivityAt: now };
  }
  if (next.shift !== updated.lastShift) updated = { ...updated, lastShift: next.shift };
  if (next.eventHistory.length > prev.eventHistory.length) {
    const fresh = next.eventHistory.slice(prev.eventHistory.length);
    const own = fresh.filter((e) => e.actor === 'player').length;
    updated = {
      ...updated,
      decisions: updated.decisions + own,
      delegatedDecisions: updated.delegatedDecisions + fresh.length - own,
      lastActivityAt: now,
    };
  }
  if (next.quizAnswered.length > prev.quizAnswered.length) {
    updated = {
      ...updated,
      quizAnswered: updated.quizAnswered + next.quizAnswered.length - prev.quizAnswered.length,
    };
  }
  if (next.status === 'ended' && prev.status !== 'ended') {
    updated = { ...updated, outcome: 'ended', closedAt: now, lastActivityAt: now };
  }
  return updated === charter ? out : replaceCharter(out, updated);
}

/**
 * Count a new app session. A charter already in play at load gets a second (or
 * later) session, which is the "did they come back" signal. One signed before
 * the funnel existed is adopted with an unknown sign time.
 */
export function startFunnelSession(log: FunnelLog, current: Observed): FunnelLog {
  const out = { ...log, sessions: log.sessions + 1 };
  if (current.status !== 'active' || current.charter === null) return out;
  const seed = current.charter.seed;
  const charter = activeCharter(out, seed);
  if (charter) return replaceCharter(out, { ...charter, sessions: charter.sessions + 1 });
  return withCharter(out, newCharter(seed, null, current), false);
}

export function parseFunnelLog(raw: string | null): FunnelLog {
  if (!raw) return emptyFunnelLog();
  try {
    const value = JSON.parse(raw) as Partial<FunnelLog> | null;
    if (
      value?.version !== 1 ||
      !Array.isArray(value.charters) ||
      typeof value.sessions !== 'number' ||
      typeof value.chartersSigned !== 'number'
    )
      return emptyFunnelLog();
    // Same version: the counter is new, so an older log gains it at zero.
    const offers = value.charterOffersOpened;
    return {
      ...(value as FunnelLog),
      charterOffersOpened:
        typeof offers === 'number' && Number.isFinite(offers) && offers >= 0 ? offers : 0,
    };
  } catch {
    return emptyFunnelLog();
  }
}

interface ObservableStore {
  getState: () => { chronicle: ChronicleState };
  subscribe: (
    listener: (state: { chronicle: ChronicleState }, prev: { chronicle: ChronicleState }) => void
  ) => () => void;
}

interface FunnelStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

/** Merely reading `localStorage` throws in Safari with all cookies blocked and
 * in sandboxed iframes; that must not take startup down with it. */
function browserStorage(): FunnelStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Set while a funnel is installed; a benchmark run never installs one. */
let recordCharterOffer: (() => void) | null = null;

/**
 * The charter offer on a completed programme's card was pressed. Counted only
 * by an installed funnel, and only when no charter is in play (an open charter
 * is not being offered). Never writes storage of its own.
 * Working if the count rises once per press here and a benchmark run writes nothing.
 */
export function noteCharterOfferOpened(): void {
  recordCharterOffer?.();
}

/**
 * Start observing. Returns the unsubscribe. Storage failures (private mode,
 * full quota) disable the funnel quietly; they never reach play.
 */
export function installChronicleFunnel(
  store: ObservableStore,
  storage: FunnelStorage | null = browserStorage(),
  now: () => number = Date.now
): () => void {
  if (!storage) return () => {};
  let log: FunnelLog;
  const save = () => {
    try {
      storage.setItem(FUNNEL_STORAGE_KEY, JSON.stringify(log));
    } catch {
      // Quota or privacy mode: drop the record, keep the game.
    }
  };
  try {
    log = startFunnelSession(
      parseFunnelLog(storage.getItem(FUNNEL_STORAGE_KEY)),
      store.getState().chronicle
    );
  } catch {
    return () => {};
  }
  save();
  const record = () => {
    if (store.getState().chronicle.status !== 'unsigned') return;
    log = { ...log, charterOffersOpened: log.charterOffersOpened + 1 };
    save();
  };
  recordCharterOffer = record;
  const unsubscribe = store.subscribe((state, prev) => {
    if (state.chronicle === prev.chronicle) return;
    const next = stepFunnel(log, prev.chronicle, state.chronicle, now());
    if (next === log) return;
    log = next;
    save();
  });
  return () => {
    if (recordCharterOffer === record) recordCharterOffer = null;
    unsubscribe();
  };
}
