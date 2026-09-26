import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { resolveCameraCollision } from '../cameraCollision';
import {
  NAVIGATION_CODES,
  clampNavigationDelta,
  getNavigationIntent,
  isNavigationBlockedTarget,
  shouldHandleNavigationKey,
  shouldPreventNavigationDefault,
  syncOrbitTargetToAcceptedTranslation,
} from '../cameraNavigation';

describe('camera navigation input', () => {
  it('maps physical WASD, arrows, Q/E, and either Shift key consistently', () => {
    expect(getNavigationIntent(new Set(['KeyW', 'KeyA', 'KeyE', 'ShiftRight']))).toEqual({
      forward: 1,
      strafe: -1,
      vertical: 1,
      sprint: true,
      hasMotion: true,
    });
    expect(getNavigationIntent(new Set(['ArrowDown', 'ArrowRight', 'KeyQ']))).toEqual({
      forward: -1,
      strafe: 1,
      vertical: -1,
      sprint: false,
      hasMotion: true,
    });
    expect([...NAVIGATION_CODES]).toEqual(
      expect.arrayContaining(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE'])
    );
  });

  it('cancels opposing directions and does not treat Shift alone as movement', () => {
    expect(
      getNavigationIntent(new Set(['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft']))
    ).toEqual({ forward: 0, strafe: 0, vertical: 0, sprint: true, hasMotion: false });
  });

  it('blocks movement while an interface control or its child has focus', () => {
    const input = document.createElement('input');
    const button = document.createElement('button');
    const icon = document.createElement('span');
    const canvas = document.createElement('canvas');
    button.append(icon);

    expect(isNavigationBlockedTarget(input)).toBe(true);
    expect(isNavigationBlockedTarget(icon)).toBe(true);
    expect(isNavigationBlockedTarget(canvas)).toBe(false);
  });

  it('ignores modified shortcuts and keys already claimed by another control', () => {
    const normal = new KeyboardEvent('keydown', { code: 'KeyW' });
    const modified = new KeyboardEvent('keydown', { code: 'KeyW', ctrlKey: true });
    const claimed = new KeyboardEvent('keydown', { code: 'KeyW', cancelable: true });
    claimed.preventDefault();

    expect(shouldHandleNavigationKey(normal)).toBe(true);
    expect(shouldHandleNavigationKey(modified)).toBe(false);
    expect(shouldHandleNavigationKey(claimed)).toBe(false);
    expect(shouldPreventNavigationDefault('ArrowUp')).toBe(true);
    expect(shouldPreventNavigationDefault('KeyW')).toBe(false);
  });

  it('leaves navigation keys with native disclosures and their children', () => {
    const summary = document.createElement('summary');
    const child = document.createElement('span');
    summary.append(child);
    for (const target of [summary, child]) {
      expect(isNavigationBlockedTarget(target)).toBe(true);
      for (const code of ['ArrowDown', 'KeyW']) {
        let accepted = true;
        target.addEventListener(
          'keydown',
          (event) => {
            accepted = shouldHandleNavigationKey(event);
          },
          { once: true }
        );
        const event = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true });
        target.dispatchEvent(event);
        expect(accepted).toBe(false);
        expect(event.defaultPrevented).toBe(false);
      }
    }
  });

  it('caps resume spikes while preserving ordinary frame deltas', () => {
    expect(clampNavigationDelta(1 / 60)).toBeCloseTo(1 / 60);
    expect(clampNavigationDelta(0.5)).toBe(0.1);
    expect(clampNavigationDelta(Number.NaN)).toBe(0);
    expect(clampNavigationDelta(-1)).toBe(0);
  });
});

describe('orbit collision response', () => {
  it('moves the target only by the translation accepted by collision resolution', () => {
    const target = new THREE.Vector3(0, 5, 0);
    const targetBefore = target.clone();
    const cameraBefore = new THREE.Vector3(30, 5, 45);
    const collision = resolveCameraCollision(
      [cameraBefore.x, cameraBefore.y, cameraBefore.z],
      [30, 5, 55]
    );
    const cameraAfter = new THREE.Vector3(...collision.position);

    syncOrbitTargetToAcceptedTranslation(target, targetBefore, cameraBefore, cameraAfter);

    expect(collision.collidedWith).toBe('shipping-wall');
    expect(target.x).toBeCloseTo(0);
    expect(target.y).toBeCloseTo(5);
    expect(target.z).toBeCloseTo(4.35);
    const offsetAfter = cameraAfter.clone().sub(target);
    const offsetBefore = cameraBefore.clone().sub(targetBefore);
    expect(offsetAfter.x).toBeCloseTo(offsetBefore.x);
    expect(offsetAfter.y).toBeCloseTo(offsetBefore.y);
    expect(offsetAfter.z).toBeCloseTo(offsetBefore.z);
  });
});
