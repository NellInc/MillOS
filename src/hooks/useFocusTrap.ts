import { useEffect, RefObject } from 'react';

/**
 * Custom hook to trap focus within a modal dialog
 * Ensures keyboard users stay within the modal and can close with Escape
 *
 * @param ref - Reference to the modal container element
 * @param isOpen - Whether the modal is currently open
 * @param onClose - Callback to close the modal
 */
export const useFocusTrap = (ref: RefObject<HTMLElement>, isOpen: boolean, onClose: () => void) => {
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

    // Focus first element when modal opens
    getFocusable()[0]?.focus();

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      const focusable = getFocusable();
      if (focusable.length === 0) return;
      const firstFocusable = focusable[0];
      const lastFocusable = focusable[focusable.length - 1];

      if (e.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstFocusable) {
          e.preventDefault();
          lastFocusable.focus();
        }
      } else {
        // Tab
        if (document.activeElement === lastFocusable) {
          e.preventDefault();
          firstFocusable.focus();
        }
      }
    };

    const handleEscapeKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
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
  }, [isOpen, onClose, ref]);
};
