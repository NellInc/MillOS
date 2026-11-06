import { afterEach, describe, expect, it } from 'vitest';
import { shouldHandleNavigationKey } from '../cameraNavigation';

/**
 * Dragging a Settings slider (production speed, volume, graphics) or ticking
 * a checkbox leaves keyboard focus on that input. A slider, checkbox or radio
 * takes the arrows and Space, never a letter, yet W A S D and Q/E did nothing
 * until the player clicked the scene, as a focused button once did. Working if
 * the letters drive the camera from those inputs, the arrows stay with them,
 * and a text or number field still keeps every key.
 */
const handled = (target: Element, code: string) => {
  const event = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true });
  let result = false;
  const listener = (e: KeyboardEvent) => {
    result = shouldHandleNavigationKey(e);
  };
  window.addEventListener('keydown', listener);
  target.dispatchEvent(event);
  window.removeEventListener('keydown', listener);
  return result;
};

const make = (html: string) => {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.append(host);
  return host.firstElementChild as HTMLElement;
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('camera letters from a focused non-text input', () => {
  it('drives the camera from a slider, checkbox or radio, and leaves them their arrows', () => {
    for (const html of [
      '<input type="range" min="0" max="2" />',
      '<input type="checkbox" />',
      '<input type="radio" name="r" />',
    ]) {
      const input = make(html);
      for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft']) {
        expect({ html, code, handled: handled(input, code) }).toEqual({
          html,
          code,
          handled: true,
        });
      }
      expect({ html, handled: handled(input, 'ArrowLeft') }).toEqual({ html, handled: false });
    }
  });

  it('still leaves every key with text, search and number fields', () => {
    for (const html of [
      '<input />',
      '<input type="text" />',
      '<input type="search" />',
      '<input type="number" />',
      '<input type="password" />',
    ]) {
      expect({ html, handled: handled(make(html), 'KeyW') }).toEqual({ html, handled: false });
    }
  });
});
