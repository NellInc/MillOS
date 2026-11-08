import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  activateAimedInteractable,
  aimDistance,
  findAimedInteractable,
  registerWorldInteractable,
  updateAimedInteractable,
  useAimedInteractableStore,
  type WorldInteractable,
} from './worldInteractables';

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const unregisters: (() => void)[] = [];
const target = (overrides: Partial<WorldInteractable> = {}): WorldInteractable => {
  const t: WorldInteractable = {
    id: 'bell',
    prompt: 'ringBell',
    centre: v(0, 10, 0),
    radius: 0.85,
    reach: 14,
    activate: vi.fn(() => true),
    ...overrides,
  };
  unregisters.push(registerWorldInteractable(t));
  return t;
};

afterEach(() => {
  unregisters.splice(0).forEach((unregister) => unregister());
});

describe('world interactables', () => {
  it('meets an aim sphere along the view ray, within reach only', () => {
    const eye = v(0, 1.7, 6);
    const look = v(0, 10, 0).sub(eye).normalize();
    expect(aimDistance(eye, look, v(0, 10, 0), 0.85, 14)).toBeGreaterThan(9);
    // Looking away, or level along the ground, misses.
    expect(aimDistance(eye, look.clone().negate(), v(0, 10, 0), 0.85, 14)).toBeNull();
    expect(aimDistance(eye, v(0, 0, -1), v(0, 10, 0), 0.85, 14)).toBeNull();
    // Beyond reach it is out of range even when aimed squarely.
    const far = v(0, 1.7, 40);
    expect(aimDistance(far, v(0, 10, 0).sub(far).normalize(), v(0, 10, 0), 0.85, 14)).toBeNull();
  });

  it('activates the aimed target, publishes its prompt, and forgets it on unregister', () => {
    const bell = target();
    const eye = v(0, 1.7, 6);
    const look = v(0, 10, 0).sub(eye).normalize();
    updateAimedInteractable(eye, look);
    expect(useAimedInteractableStore.getState()).toMatchObject({
      aimedId: 'bell',
      prompt: 'ringBell',
    });
    expect(activateAimedInteractable(eye, look)).toBe(true);
    expect(bell.activate).toHaveBeenCalledTimes(1);
    expect(activateAimedInteractable(eye, v(0, 0, -1))).toBe(false);
    expect(bell.activate).toHaveBeenCalledTimes(1);
    unregisters.splice(0).forEach((unregister) => unregister());
    expect(useAimedInteractableStore.getState().aimedId).toBeNull();
    expect(findAimedInteractable(eye, look)).toBeNull();
  });

  it('picks the nearest of two targets on one ray', () => {
    target({ id: 'far', centre: v(0, 0, -10) });
    target({ id: 'near', centre: v(0, 0, -4) });
    expect(findAimedInteractable(v(0, 0, 0), v(0, 0, -1))?.id).toBe('near');
  });
});
