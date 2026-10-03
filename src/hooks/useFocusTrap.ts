import { useEffect, useRef, RefObject } from 'react';

/**
 * Custom hook to trap focus within a modal dialog
 * Ensures keyboard users stay within the modal and can close with Escape
 *
 * @param ref - Reference to the modal container element
 * @param isOpen - Whether the modal is currently open
 * @param onClose - Callback to close the modal
 */
export const useFocusTrap = (ref: RefObject<HTMLElement>, isOpen: boolean, onClose: () => void) => {
  // Callers often pass an inline onClose. Reading it through a ref keeps the
  // trap effect keyed on isOpen alone, so a parent re-render does not re-run
  // the trap, steal focus back to the first control, and bounce it out again.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen || !ref.current) return;

    const modalElement = ref.current;
    const FOCUSABLE_SELECTOR =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

    // Query live on demand — modal contents can change while open (e.g. the AI
    // settings backend toggle adds/removes the key input and footer buttons), so
    // a NodeList snapshotted at mount would point at detached nodes after a switch.
    const getFocusable = () =>
      Array.from(modalElement.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));

    // Store the element that had focus before opening modal
    const previouslyFocusedElement = document.activeElement as HTMLElement;

    // Loading dialogs can start empty and add their recovery control later.
    // Working if an empty focusable dialog retains Tab, then uses live controls.
    (getFocusable()[0] ?? modalElement).focus();

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      const focusable = getFocusable();
      if (focusable.length === 0) {
        e.preventDefault();
        modalElement.focus();
        return;
      }
      const firstFocusable = focusable[0];
      const lastFocusable = focusable[focusable.length - 1];
      const focusOnContainer = !focusable.includes(document.activeElement as HTMLElement);

      if (e.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstFocusable || focusOnContainer) {
          e.preventDefault();
          lastFocusable.focus();
        }
      } else {
        // Tab
        if (document.activeElement === lastFocusable || focusOnContainer) {
          e.preventDefault();
          firstFocusable.focus();
        }
      }
    };

    const handleEscapeKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
      }
    };

    // Add event listeners
    modalElement.addEventListener('keydown', handleTabKey);
    modalElement.addEventListener('keydown', handleEscapeKey);

    // Cleanup: restore focus to previous element
    return () => {
      modalElement.removeEventListener('keydown', handleTabKey);
      modalElement.removeEventListener('keydown', handleEscapeKey);

      // Return focus to element that opened the modal
      if (previouslyFocusedElement && previouslyFocusedElement.focus) {
        previouslyFocusedElement.focus();
      }
    };
  }, [isOpen, ref]);
};
