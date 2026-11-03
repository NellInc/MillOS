/**
 * Who is driving which forklift, for first-person mode.
 *
 * `drivenId` is the forklift the player sits in; `inReachId` the one close
 * enough to board, which also tells the F shortcut that F means "board" rather
 * than "fullscreen". Both are session state, never persisted: a reload starts
 * on foot with both forklifts on autopilot.
 *
 * The controls and the per-forklift boardable flag are plain mutable objects,
 * written and read every frame without a render.
 */
import { create } from 'zustand';

interface ForkliftDriveState {
  drivenId: string | null;
  inReachId: string | null;
  board: (id: string) => void;
  exit: () => void;
  setInReach: (id: string | null) => void;
}

export const useForkliftDriveStore = create<ForkliftDriveState>((set, get) => ({
  drivenId: null,
  inReachId: null,
  board: (id) => {
    if (forkliftBoardable.get(id) !== true) return;
    set({ drivenId: id, inReachId: null });
  },
  exit: () => {
    if (get().drivenId === null) return;
    set({ drivenId: null });
    resetManualForkliftInput();
  },
  setInReach: (id) => {
    if (get().inReachId !== id) set({ inReachId: id });
  },
}));

/** Each control in -1..1: throttle (W/S), steer (+1 right, A/D), lift (+1 raise, Q/E). */
interface ManualDriveInputState {
  throttle: number;
  steer: number;
  lift: number;
}

/** The driver's controls, written by the first-person controller each frame. */
export const manualForkliftInput: ManualDriveInputState = {
  throttle: 0,
  steer: 0,
  lift: 0,
};

export const resetManualForkliftInput = (): void => {
  manualForkliftInput.throttle = 0;
  manualForkliftInput.steer = 0;
  manualForkliftInput.lift = 0;
};

/** In-world fleet tags (the SCADA vehicle names, tagDatabase FLT01/FLT02). */
export const FORKLIFT_FLEET_TAGS: Readonly<Record<string, string>> = {
  'forklift-1': 'FLT01',
  'forklift-2': 'FLT02',
};

/**
 * Whether each forklift can be boarded now (ForkliftSystem): false while it
 * works a pickup or dropoff, so the player never interrupts a lift half-way,
 * while its operator climbs in or out, and, with the operator seated, when
 * there is nowhere safe for them to step down or a safety stop holds them.
 */
export const forkliftBoardable = new Map<string, boolean>();
