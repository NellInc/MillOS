import React from 'react';

export const MODAL_SELECTOR =
  '[role="dialog"][aria-modal="true"], [role="alertdialog"], dialog[open]';

const modalOnPage = () =>
  typeof document !== 'undefined' && document.querySelector(MODAL_SELECTOR) !== null;

/**
 * Whether a modal dialog is on screen, watched only while `enabled` (something
 * that should step aside for one is up), so a quiet page runs no observer.
 * Element additions and the attributes that make a dialog modal are watched,
 * not text changes. The page is read at render too, so an overlay that
 * appears over a dialog already open is hidden from its first frame.
 */
export function useModalDialogOpen(enabled: boolean): boolean {
  // The state only re-renders on a change; the page decides what is shown now.
  const [, setOpen] = React.useState(false);
  React.useEffect(() => {
    if (!enabled || typeof MutationObserver === 'undefined') {
      setOpen(false);
      return;
    }
    const check = () => setOpen(modalOnPage());
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['role', 'aria-modal', 'open'],
    });
    return () => observer.disconnect();
  }, [enabled]);
  return enabled && modalOnPage();
}
