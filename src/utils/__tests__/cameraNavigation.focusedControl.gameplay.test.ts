import { afterEach, describe, expect, it } from 'vitest';
import { shouldHandleNavigationKey, shouldPreventNavigationDefault } from '../cameraNavigation';

/**
 * The camera listens on window, as CameraController and both walk controllers
 * install it. A mouse click on any HUD button (the tour's Next, a dock item)
 * leaves keyboard focus on that button, and W A S D then did nothing until the
 * player clicked the scene, while P, C and the number keys still worked. A
 * button, link or disclosure has no use for a letter or Shift; the arrows stay
 * with every control, since they move a selection or scroll its panel.
 */
const press = (target: Element, code: string) => {
  const event = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true });
  let handled = false;
  const listener = (e: KeyboardEvent) => {
    handled = shouldHandleNavigationKey(e);
    if (handled && shouldPreventNavigationDefault(e.code)) e.preventDefault();
  };
  window.addEventListener('keydown', listener);
  target.dispatchEvent(event);
  window.removeEventListener('keydown', listener);
  return { handled, prevented: event.defaultPrevented };
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

describe('camera keys with a HUD control focused', () => {
  it('drives the camera with W A S D, Q/E and Shift from a focused button, link or disclosure', () => {
    const next = make('<button type="button"><span>Next</span></button>');
    const link = make('<a href="#help">Help</a>');
    const summary = make('<details><summary>Camera controls</summary></details>').querySelector(
      'summary'
    )!;
    for (const target of [next, next.firstElementChild!, link, summary]) {
      for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft']) {
        expect({ code, ...press(target, code) }).toEqual({ code, handled: true, prevented: false });
      }
    }
  });

  it('leaves the arrows with every control, and every key with text and type-ahead fields', () => {
    const next = make('<button type="button">Next</button>');
    const tab = make('<div role="tab" tabindex="0">Overview</div>');
    expect(press(next, 'ArrowDown')).toEqual({ handled: false, prevented: false });
    expect(press(tab, 'ArrowRight')).toEqual({ handled: false, prevented: false });
    for (const html of [
      '<input type="text" />',
      '<textarea></textarea>',
      '<select><option>Wheat</option></select>',
      '<div role="menu"><div role="menuitem" tabindex="-1">Silos</div></div>',
      '<div role="listbox" tabindex="0"></div>',
      '<div role="combobox" tabindex="0"></div>',
      '<div contenteditable="true"></div>',
    ]) {
      const field = make(html);
      const target = (field.querySelector('[role="menuitem"]') as HTMLElement | null) ?? field;
      expect({ html, ...press(target, 'KeyW') }).toEqual({
        html,
        handled: false,
        prevented: false,
      });
    }
  });

  it('keeps a modal dialog in charge of every key, its buttons included', () => {
    const dialog = make(
      '<div role="dialog" aria-modal="true"><button type="button">Close</button></div>'
    );
    expect(press(dialog.querySelector('button')!, 'KeyW').handled).toBe(false);
  });
});

/**
 * A click on a modal's text leaves focus on <body> when the dialog box is not
 * itself focusable (the knowledge library, the lyrics, an AI reflection). The
 * camera then moved behind the modal and took the arrows from its scrolling
 * list, though every shortcut already stood down for an open modal.
 */
describe('camera keys with a modal open and focus on the page', () => {
  it('leaves every camera key to the open modal', () => {
    make(
      '<div role="dialog" aria-modal="true"><p>Lyrics</p><div style="overflow:auto"></div></div>'
    );
    expect(press(document.body, 'KeyW')).toEqual({ handled: false, prevented: false });
    expect(press(document.body, 'ArrowDown')).toEqual({ handled: false, prevented: false });
  });

  it('drives the camera from the page again once the modal has gone', () => {
    const dialog = make('<div role="dialog" aria-modal="true"><p>Lyrics</p></div>');
    dialog.remove();
    expect(press(document.body, 'KeyW').handled).toBe(true);
    expect(press(document.body, 'ArrowDown')).toEqual({ handled: true, prevented: true });
  });

  it('is not held by a non-modal dialog such as a Chronicle decision', () => {
    make('<div role="dialog" aria-modal="false"><p>Decision</p></div>');
    expect(press(document.body, 'KeyW').handled).toBe(true);
  });
});
