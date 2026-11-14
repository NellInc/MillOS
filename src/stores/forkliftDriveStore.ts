/**
 * Who is driving which forklift, for first-person mode.
 *
 * `drivenId` is the forklift the player sits in; `inReachId` the one close
 * enough to board with E or a left click (F is only fullscreen, D-053). Both
 * are session state, never persisted: a reload starts
 * on foot with both forklifts on autopilot.
 *
 * The controls and the per-forklift boardable flag are plain mutable objects,
 * written and read every frame without a render.
 */
import { create } from 'zustand';

/** The job a driven forklift is lined up for at one of its stations (D-060). */
export type ForkliftWorkOffer = 'pickup' | 'dropoff';
/** Why the driver's pick or drop was refused (forkliftWork.ts manualWorkRefusal). */
export type ForkliftWorkRefusal = 'forksRaised' | 'forksLow' | 'tooFast';

interface ForkliftDriveState {
  drivenId: string | null;
  inReachId: string | null;
  /**
   * The pick or drop the driven forklift is lined up for now, published by
   * ForkliftSystem when it changes; null away from its stations.
   */
  workOffer: ForkliftWorkOffer | null;
  /** Why the last request was refused, until the offer changes or the driver asks again. */
  workRefusal: ForkliftWorkRefusal | null;
  board: (id: string) => void;
  exit: () => void;
  setInReach: (id: string | null) => void;
  setWorkOffer: (offer: ForkliftWorkOffer | null) => void;
  setWorkRefusal: (refusal: ForkliftWorkRefusal | null) => void;
  /**
   * The driver asks for the pick or drop on offer (the activation in the cab:
   * E, or the phone's button). True when a job was on offer, so the press is
   * spent on it and does not also step the driver down. ForkliftSystem runs it,
   * or refuses it with a reason, on its next frame.
   */
  requestWork: () => boolean;
}

export const useForkliftDriveStore = create<ForkliftDriveState>((set, get) => ({
  drivenId: null,
  inReachId: null,
  workOffer: null,
  workRefusal: null,
  board: (id) => {
    if (forkliftBoardable.get(id) !== true) return;
    set({ drivenId: id, inReachId: null });
  },
  exit: () => {
    if (get().drivenId === null) return;
    set({ drivenId: null, workOffer: null, workRefusal: null });
    resetManualForkliftInput();
  },
  setInReach: (id) => {
    if (get().inReachId !== id) set({ inReachId: id });
  },
  setWorkOffer: (offer) => {
    if (get().workOffer !== offer) set({ workOffer: offer, workRefusal: null });
  },
  setWorkRefusal: (refusal) => {
    if (get().workRefusal !== refusal) set({ workRefusal: refusal });
  },
  requestWork: () => {
    if (get().drivenId === null || get().workOffer === null) return false;
    manualForkliftWork.requested = true;
    if (get().workRefusal !== null) set({ workRefusal: null });
    return true;
  },
}));

/** A pick or drop the driver has asked for, taken by ForkliftSystem on its next frame. */
export const manualForkliftWork = { requested: false };

/** Each control in -1..1: throttle (W/S), steer (+1 right, A/D), lift (+1 raise, R/Q). */
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
  manualForkliftWork.requested = false;
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
