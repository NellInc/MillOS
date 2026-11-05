/**
 * Focus rescue for a control that disables itself while focused.
 *
 * Chromium applies the HTML focus-fixup rule: a focused button that becomes
 * `disabled` (Maintain during its service delay, Restart, a busy action) loses
 * focus to <body>, firing focusout with no relatedTarget. A keyboard player's
 * next Tab then starts from the top of the page, and their next Space, meant for
 * the button, is the forklift emergency stop.
 *
 * This is the fallback behind the per-surface rescues: it waits until they have
 * had their turn, acts only if focus is still on <body>, lands on the control's
 * containing region, and hands focus back to the control when it is enabled
 * again while focus is still where it landed.
 * Working if Tab and Enter continue from the control's own panel.
 */

/** Marks a landing holding focus for a busy control; Space does nothing there. */
export const RESCUED_ATTRIBUTE = 'data-focus-rescued';
const RESCUE_DELAY_MS = 60;
const RETURN_WINDOW_MS = 15_000;
const LANDING =
  '[data-focus-landing], [role="dialog"], [role="region"], aside, section, nav, form, main';

type DisableableControl = HTMLElement & { disabled: boolean };

const isDisabledControl = (el: Element): el is DisableableControl =>
  'disabled' in el && (el as DisableableControl).disabled === true;

export function installFocusRescue(doc: Document = document): () => void {
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const observers = new Set<MutationObserver>();

  const onFocusOut = (event: FocusEvent) => {
    const control = event.target;
    if (event.relatedTarget || !(control instanceof HTMLElement)) return;
    if (!isDisabledControl(control)) return;
    const landing = control.parentElement?.closest<HTMLElement>(LANDING) ?? null;
    const timer = setTimeout(() => {
      timers.delete(timer);
      const active = doc.activeElement;
      if (active && active !== doc.body) return;
      if (control.isConnected && !control.disabled) {
        control.focus();
        return;
      }
      if (!landing?.isConnected) return;
      if (!landing.hasAttribute('tabindex')) landing.setAttribute('tabindex', '-1');
      landing.focus({ preventScroll: true });
      if (!control.isConnected) return;
      // While the control is busy, a Space meant for it must not become the
      // forklift stop (useKeyboardShortcuts skips a marked landing). The mark
      // goes as soon as focus leaves the landing.
      landing.setAttribute(RESCUED_ATTRIBUTE, '');
      const unmark = () => {
        landing.removeAttribute(RESCUED_ATTRIBUTE);
        landing.removeEventListener('focusout', unmark);
      };
      landing.addEventListener('focusout', unmark);
      // Hand focus back once the control is usable again, if it is still here.
      const observer = new MutationObserver(() => {
        if (control.disabled) return;
        stop();
        if (control.isConnected && doc.activeElement === landing) control.focus();
      });
      const expiry = setTimeout(() => stop(), RETURN_WINDOW_MS);
      const stop = () => {
        observer.disconnect();
        observers.delete(observer);
        clearTimeout(expiry);
        timers.delete(expiry);
      };
      timers.add(expiry);
      observers.add(observer);
      observer.observe(control, { attributes: true, attributeFilter: ['disabled'] });
    }, RESCUE_DELAY_MS);
    timers.add(timer);
  };

  doc.addEventListener('focusout', onFocusOut);
  return () => {
    doc.removeEventListener('focusout', onFocusOut);
    timers.forEach(clearTimeout);
    observers.forEach((observer) => observer.disconnect());
    timers.clear();
    observers.clear();
  };
}
