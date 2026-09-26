import * as THREE from 'three';

/** Allow low production-floor views to look up, with floor clipping handled by navigation. */
export const ORBIT_POLAR_LIMITS = {
  min: 0.2,
  max: (Math.PI * 2) / 3,
} as const;

/** Physical key positions shared by orbit and first-person camera modes. */
export const NAVIGATION_CODES: ReadonlySet<string> = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyQ',
  'KeyE',
  'ShiftLeft',
  'ShiftRight',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
]);

const SCROLLING_NAVIGATION_CODES: ReadonlySet<string> = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
]);

const INTERACTIVE_TARGET_SELECTOR = [
  'input',
  'textarea',
  'select',
  'button',
  'summary',
  'a[href]',
  '[contenteditable]:not([contenteditable="false"])',
  '[role="button"]',
  '[role="checkbox"]',
  '[role="combobox"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="radio"]',
  '[role="searchbox"]',
  '[role="slider"]',
  '[role="spinbutton"]',
  '[role="switch"]',
  '[role="tab"]',
  '[role="textbox"]',
].join(',');

export interface NavigationIntent {
  readonly forward: number;
  readonly strafe: number;
  readonly vertical: number;
  readonly sprint: boolean;
  readonly hasMotion: boolean;
}

/**
 * Camera movement must stay inactive while an operator is using an interface
 * control. This covers buttons and links as well as ordinary text fields, so a
 * focused modal or SCADA control cannot move the world behind it.
 */
export function isNavigationBlockedTarget(target: EventTarget | null): boolean {
  if (typeof Element === 'undefined' || !(target instanceof Element)) return false;
  return target.closest(INTERACTIVE_TARGET_SELECTOR) !== null;
}

/** True when a keydown should enter the active camera key set. */
export function shouldHandleNavigationKey(event: KeyboardEvent): boolean {
  return (
    NAVIGATION_CODES.has(event.code) &&
    !event.defaultPrevented &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !isNavigationBlockedTarget(event.target)
  );
}

/** Arrow keys scroll the document unless the camera consumes their default. */
export function shouldPreventNavigationDefault(code: string): boolean {
  return SCROLLING_NAVIGATION_CODES.has(code);
}

/** Resolve opposing keys and aliases into one deterministic movement intent. */
export function getNavigationIntent(keys: ReadonlySet<string>): NavigationIntent {
  const forward =
    Number(keys.has('KeyW') || keys.has('ArrowUp')) -
    Number(keys.has('KeyS') || keys.has('ArrowDown'));
  const strafe =
    Number(keys.has('KeyD') || keys.has('ArrowRight')) -
    Number(keys.has('KeyA') || keys.has('ArrowLeft'));
  const vertical = Number(keys.has('KeyE')) - Number(keys.has('KeyQ'));

  return {
    forward,
    strafe,
    vertical,
    sprint: keys.has('ShiftLeft') || keys.has('ShiftRight'),
    hasMotion: forward !== 0 || strafe !== 0 || vertical !== 0,
  };
}

/**
 * Avoid a camera leap after a suspended tab resumes while retaining exact
 * frame-rate independence down to ten rendered frames per second.
 */
export function clampNavigationDelta(delta: number): number {
  return Number.isFinite(delta) && delta > 0 ? Math.min(delta, 0.1) : 0;
}

/**
 * Keep the orbit target translated by the camera movement that collision
 * resolution actually accepted. Without this correction, a blocked camera
 * leaves its target beyond the wall and the view twists on every held key.
 */
export function syncOrbitTargetToAcceptedTranslation(
  target: THREE.Vector3,
  targetBeforeMove: THREE.Vector3,
  cameraBeforeMove: THREE.Vector3,
  cameraAfterCollision: THREE.Vector3
): void {
  target.set(
    targetBeforeMove.x + cameraAfterCollision.x - cameraBeforeMove.x,
    targetBeforeMove.y + cameraAfterCollision.y - cameraBeforeMove.y,
    targetBeforeMove.z + cameraAfterCollision.z - cameraBeforeMove.z
  );
}
