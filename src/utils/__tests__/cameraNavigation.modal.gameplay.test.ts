import { afterEach, describe, expect, it } from 'vitest';
import { shouldHandleNavigationKey, shouldPreventNavigationDefault } from '../cameraNavigation';

/**
 * The camera listens on window for W A S D, Q/E and the arrows, and takes the
 * arrows' default. A modal dialog owns the keyboard: the layout planner's
 * drawing is a focusable scroll region (tabIndex 0), and a click on a modal's
 * text focuses its tabIndex -1 container. Neither is a control, so the arrows
 * scrolled nothing and moved the world behind the modal instead.
 */
const press = (target: Element, code: string) => {
  const event = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true });
  let handled = false;
  // The camera's own listener, as CameraController installs it.
  const listener = (e: KeyboardEvent) => {
    handled = shouldHandleNavigationKey(e);
    if (handled && shouldPreventNavigationDefault(e.code)) e.preventDefault();
  };
  window.addEventListener('keydown', listener);
  target.dispatchEvent(event);
  window.removeEventListener('keydown', listener);
  return { handled, prevented: event.defaultPrevented };
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('camera keys under a modal dialog', () => {
  it("leaves the arrows to a modal's scroll region and never moves the camera behind it", () => {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.tabIndex = -1;
    const region = document.createElement('div');
    region.setAttribute('role', 'region');
    region.tabIndex = 0;
    dialog.append(region);
    document.body.append(dialog);

    expect(press(region, 'ArrowDown')).toEqual({ handled: false, prevented: false });
    expect(press(dialog, 'ArrowRight')).toEqual({ handled: false, prevented: false });
    expect(press(dialog, 'KeyW').handled).toBe(false);
  });

  it('still drives the camera from the scene and from a non-modal card', () => {
    const card = document.createElement('section');
    const heading = document.createElement('h2');
    heading.tabIndex = -1;
    card.append(heading);
    document.body.append(card);

    expect(press(document.body, 'ArrowDown')).toEqual({ handled: true, prevented: true });
    expect(press(heading, 'KeyW').handled).toBe(true);
  });

  // The Achievements panel stopped being aria-modal (so Space, P and Escape
  // work while it is merely open), and with that W/A/S/D and the arrows pressed
  // inside it moved the camera instead of scrolling the list. Working if keys
  // pressed inside a [data-owns-keys] panel stay with it, and keys with focus
  // on the page still drive the camera while it is open.
  it('leaves keys pressed inside a floating panel that owns them to that panel', () => {
    const panel = document.createElement('div');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('data-owns-keys', '');
    panel.tabIndex = -1;
    const list = document.createElement('ul');
    list.tabIndex = 0;
    panel.append(list);
    document.body.append(panel);

    expect(press(panel, 'KeyW').handled).toBe(false);
    expect(press(list, 'ArrowDown')).toEqual({ handled: false, prevented: false });
    expect(press(document.body, 'KeyW').handled).toBe(true);
  });
});
