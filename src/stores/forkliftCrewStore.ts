/**
 * The live link between each forklift and its operator: CommunityLife steps
 * the crew (forkliftCrew.ts) and owns the operator's body; ForkliftSystem drives
 * the vehicle, reports whether it is parked for them, and carries a seated
 * operator's body along with it after it moves. Plain mutable records, read and
 * written every frame without a render.
 *
 * `heartbeat` is when CommunityLife last stepped the crew. If it stops (people
 * switched off for a benchmark, or not mounted) the forklifts work as they did
 * before crews existed, so nothing ever waits for an operator who is not there.
 */
import type { Object3D } from 'three';
import type {
  ForkliftCrewHandover,
  ForkliftCrewState,
  ForkliftParkedAt,
} from '../simulation/forkliftCrew';

export interface ForkliftCrewLive {
  state: ForkliftCrewState | null;
  /** performance.now() of the last crew step, in ms. */
  heartbeat: number;
  /** Written by the forklift. */
  parkedAt: ForkliftParkedAt;
  /** Written by the forklift: its pose this frame. */
  vehicle: { x: number; y: number; z: number; heading: number } | null;
  /**
   * performance.now() of the forklift's last frame, in ms. Stale (forklifts
   * switched off or unmounted), the operator follows their routine on foot.
   */
  vehicleHeartbeat: number;
  /**
   * Written by the forklift: where its operator would step down right now.
   * Scratch, rewritten every frame: copy it before keeping it.
   */
  handover: { -readonly [K in keyof ForkliftCrewHandover]: ForkliftCrewHandover[K] } | null;
  /** Written by CommunityLife: the operator's root, for the forklift to seat. */
  operatorRoot: Object3D | null;
}

const live = new Map<string, ForkliftCrewLive>();

export function forkliftCrewLive(forkliftId: string): ForkliftCrewLive {
  let entry = live.get(forkliftId);
  if (!entry) {
    entry = {
      state: null,
      heartbeat: -Infinity,
      parkedAt: null,
      vehicle: null,
      vehicleHeartbeat: -Infinity,
      handover: null,
      operatorRoot: null,
    };
    live.set(forkliftId, entry);
  }
  return entry;
}

/**
 * A stale heartbeat (one second) means nobody is stepping the crew. Both sides
 * step every frame, so the other's last beat is at most one frame old: callers
 * pass this frame's length as `frameMs`, or the first frame after a hitch or a
 * tab return (over a second long) read as a stop, and for that frame an
 * operator's held hour slipped and the forklift worked unmanned.
 */
const FORKLIFT_CREW_HEARTBEAT_MS = 1000;
const heartbeatFresh = (beat: number, now: number, frameMs: number): boolean =>
  now - beat < FORKLIFT_CREW_HEARTBEAT_MS + (Number.isFinite(frameMs) ? Math.max(0, frameMs) : 0);
export const isForkliftCrewActive = (entry: ForkliftCrewLive, now: number, frameMs = 0): boolean =>
  entry.state !== null && heartbeatFresh(entry.heartbeat, now, frameMs);
/** Whether the forklift itself is running (its own heartbeat). */
export const isForkliftRunning = (entry: ForkliftCrewLive, now: number, frameMs = 0): boolean =>
  heartbeatFresh(entry.vehicleHeartbeat, now, frameMs);
