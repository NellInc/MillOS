/**
 * Things in the world a first-person player can activate by looking at them.
 *
 * E and a left click are the activation (`FirstPersonController`'s
 * `interact`). Forklifts keep their own reach test and always come first; this
 * registry is for everything else, starting with the school bell. An owner
 * registers a target with an aim sphere and a reach, keeps its world centre
 * current, and unregisters on unmount.
 *
 * Aiming is a ray from the eye along the view direction against each target's
 * sphere: no scene traversal and no allocation per frame, so the controller
 * can ask every frame. The nearest target hit within its reach wins.
 */
import * as THREE from 'three';
import { create } from 'zustand';

/** Prompt copy keys; the text lives in `FirstPersonController.messages.ts`. */
export type WorldInteractPrompt = 'ringBell' | 'greet' | 'windmillLesson' | 'henhouseInspection';

export interface WorldInteractable {
  id: string;
  prompt: WorldInteractPrompt;
  /** World-space centre of the aim sphere; the owner keeps it current. */
  centre: THREE.Vector3;
  /** Aim sphere radius, m. */
  radius: number;
  /** Farthest eye-to-centre distance the activation works from, m. */
  reach: number;
  /** Do the thing. True when it acted. */
  activate: () => boolean;
  /**
   * A moving target (a resident): the centre is read from this object's
   * position, `followHeight` up, at each aim, and a hidden object is skipped.
   * Its parent must carry no transform (the resident roots' group does not).
   */
  follow?: THREE.Object3D;
  followHeight?: number;
}

const registry = new Map<string, WorldInteractable>();

interface AimedInteractableState {
  aimedId: string | null;
  prompt: WorldInteractPrompt | null;
  setAimed: (target: WorldInteractable | null) => void;
}

export const useAimedInteractableStore = create<AimedInteractableState>()((set, get) => ({
  aimedId: null,
  prompt: null,
  setAimed: (target) => {
    const id = target?.id ?? null;
    if (get().aimedId !== id) set({ aimedId: id, prompt: target?.prompt ?? null });
  },
}));

export function registerWorldInteractable(target: WorldInteractable): () => void {
  registry.set(target.id, target);
  return () => {
    if (registry.get(target.id) !== target) return;
    registry.delete(target.id);
    if (useAimedInteractableStore.getState().aimedId === target.id) {
      useAimedInteractableStore.getState().setAimed(null);
    }
  };
}

const _toCentre = new THREE.Vector3();

/**
 * Distance along a unit ray from `origin` to where it first meets the sphere,
 * or null when it misses, the sphere is behind, or its centre is beyond reach.
 */
export function aimDistance(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  centre: THREE.Vector3,
  radius: number,
  reach: number
): number | null {
  _toCentre.subVectors(centre, origin);
  const distanceSq = _toCentre.lengthSq();
  if (distanceSq > reach * reach) return null;
  const along = _toCentre.dot(direction);
  const missSq = distanceSq - along * along;
  const radiusSq = radius * radius;
  if (missSq > radiusSq) return null;
  if (distanceSq <= radiusSq) return 0;
  if (along <= 0) return null;
  return along - Math.sqrt(radiusSq - missSq);
}

/** The nearest registered target the view ray meets within its reach. */
export function findAimedInteractable(
  origin: THREE.Vector3,
  direction: THREE.Vector3
): WorldInteractable | null {
  let best: WorldInteractable | null = null;
  let bestDistance = Infinity;
  for (const target of registry.values()) {
    const follow = target.follow;
    if (follow) {
      if (!follow.visible || follow.parent?.visible === false) continue;
      target.centre.copy(follow.position);
      target.centre.y += target.followHeight ?? 0;
    }
    const distance = aimDistance(origin, direction, target.centre, target.radius, target.reach);
    if (distance !== null && distance < bestDistance) {
      best = target;
      bestDistance = distance;
    }
  }
  return best;
}

/** Refresh the aimed target (and so the crosshair prompt) for this view ray. */
export function updateAimedInteractable(origin: THREE.Vector3, direction: THREE.Vector3): void {
  useAimedInteractableStore.getState().setAimed(findAimedInteractable(origin, direction));
}

/** Activate whatever the view ray is on. True when something acted. */
export function activateAimedInteractable(
  origin: THREE.Vector3,
  direction: THREE.Vector3
): boolean {
  return findAimedInteractable(origin, direction)?.activate() ?? false;
}

/** Forget the aimed target (leaving first person). */
export const clearAimedInteractable = (): void =>
  useAimedInteractableStore.getState().setAimed(null);
