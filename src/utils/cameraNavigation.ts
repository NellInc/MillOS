import * as THREE from 'three';

/** Eye height above the sampled walkable surface, shared by every FPS controller. */
export const FIRST_PERSON_EYE_HEIGHT = 1.7;

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
  '[role="listbox"]',
  '[role="menuitem"]',
  '[role="radio"]',
  '[role="searchbox"]',
  '[role="slider"]',
  '[role="spinbutton"]',
  '[role="switch"]',
  '[role="tab"]',
  '[role="textbox"]',
  // A modal owns the keyboard, as it does for the shortcuts (useKeyboardShortcuts):
  // its scroll regions and its focused container take the arrows, and the world
  // behind it stays put. Working if arrows scroll the layout planner's drawing.
  '[role="dialog"][aria-modal="true"]',
].join(',');

/**
 * The controls that take letters (typing and type-ahead) or own every key (a
 * modal). A button, link or disclosure has no use for W A S D, Q/E or Shift, so
 * a mouse click on the tour's Next or a dock item no longer leaves the camera
 * dead until the scene is clicked, as P, C and the number keys never were. The
 * arrows still stay with every control above: they move its selection or
 * scroll its panel. Working if W moves the camera after clicking Next.
 */
const LETTER_TARGET_SELECTOR = [
  'input',
  'textarea',
  'select',
  '[contenteditable]:not([contenteditable="false"])',
  '[role="combobox"]',
  '[role="listbox"]',
  '[role="menu"]',
  '[role="menuitem"]',
  '[role="searchbox"]',
  '[role="spinbutton"]',
  '[role="textbox"]',
  '[role="dialog"][aria-modal="true"]',
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
 * control. The arrows (and a key whose code is not given) stay with buttons and
 * links as well as text fields, so a focused SCADA control keeps its arrows and
 * a modal keeps every key; letters and Shift stay only with text, type-ahead
 * and modal controls (LETTER_TARGET_SELECTOR).
 */
export function isNavigationBlockedTarget(target: EventTarget | null, code?: string): boolean {
  if (typeof Element === 'undefined' || !(target instanceof Element)) return false;
  // A click on a modal's text leaves focus on <body> when its box is not
  // focusable (the knowledge library, the lyrics): the open modal still owns
  // the keys, as it does for every shortcut (useKeyboardShortcuts).
  if (
    (target === document.body || target === document.documentElement) &&
    document.querySelector('[role="dialog"][aria-modal="true"]')
  )
    return true;
  const selector =
    code === undefined || SCROLLING_NAVIGATION_CODES.has(code)
      ? INTERACTIVE_TARGET_SELECTOR
      : LETTER_TARGET_SELECTOR;
  return target.closest(selector) !== null;
}

/** True when a keydown should enter the active camera key set. */
export function shouldHandleNavigationKey(event: KeyboardEvent): boolean {
  return (
    NAVIGATION_CODES.has(event.code) &&
    !event.defaultPrevented &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !isNavigationBlockedTarget(event.target, event.code)
  );
}

/**
 * Take a released key out of the camera key set. macOS browsers send no keyup
 * for a key let go while Cmd is held, so releasing Cmd releases everything
 * (a key still physically held repeats its keydown and re-enters).
 */
export function releaseNavigationKey(
  keys: Set<string>,
  event: Pick<KeyboardEvent, 'key' | 'code'>
): void {
  if (event.key === 'Meta') keys.clear();
  else keys.delete(event.code);
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
