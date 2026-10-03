/** In-memory, component-owned continuation state for the synthetic replay lab. */
interface ReplayParticipant<T> {
  capture: () => T;
  restore: (state: T) => void;
}
const participants = new Map<string, ReplayParticipant<unknown>>();
export const REQUIRED_REPLAY_PARTICIPANTS = [
  'trucks',
  'forklift:forklift-1',
  'forklift:forklift-2',
  'forklift-crossings',
  'personnel',
  'machine-metrics',
  'app-controls',
] as const;

export function registerReplayParticipant<T>(id: string, participant: ReplayParticipant<T>) {
  const owner = participant as ReplayParticipant<unknown>;
  participants.set(id, owner);
  return () => {
    if (participants.get(id) === owner) participants.delete(id);
  };
}

export function captureReplayParticipants() {
  return [...participants].map(([id, owner]) => ({
    id,
    owner,
    value: structuredClone(owner.capture()),
  }));
}
export type ReplayParticipants = ReturnType<typeof captureReplayParticipants>;
export function replayParticipantsAvailable(snapshot: ReplayParticipants) {
  return snapshot.every(({ id, owner }) => participants.get(id) === owner);
}
export function missingReplayParticipants() {
  return REQUIRED_REPLAY_PARTICIPANTS.filter((id) => !participants.has(id));
}
let restoring = false;
export const isWorkplaceReplayRestoring = () => restoring;
export function restoreReplayParticipants(snapshot: ReplayParticipants) {
  if (!replayParticipantsAvailable(snapshot)) throw new Error('Replay scene changed.');
  restoring = true;
  try {
    snapshot.forEach(({ owner, value }) => owner.restore(structuredClone(value)));
  } finally {
    restoring = false;
  }
}

interface ReplayClock {
  epoch: number;
  milliseconds: number;
  randomState: number;
}
let clock: ReplayClock | null = null;
export const isWorkplaceReplayActive = () => clock !== null;
export function beginReplayClock(seed: number, epoch: number) {
  clock = { epoch, milliseconds: 0, randomState: seed >>> 0 || 1 };
}
export function endReplayClock() {
  clock = null;
}
export function advanceReplayClock(milliseconds: number) {
  if (clock && Number.isFinite(milliseconds) && milliseconds > 0)
    clock.milliseconds += milliseconds;
}
export const workplaceSimulationNow = () => (clock ? clock.epoch + clock.milliseconds : Date.now());
export function workplaceSimulationRandom() {
  if (!clock) return Math.random();
  let x = clock.randomState;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  clock.randomState = x >>> 0;
  return clock.randomState / 4294967296;
}
