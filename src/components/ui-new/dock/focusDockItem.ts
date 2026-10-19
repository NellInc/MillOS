import type { DockMode } from './Dock';

/**
 * Moves keyboard focus to a dock item, the stable place to land when the card
 * whose button was pressed (the tour, the guided delivery) closes and takes
 * that button with it. Working if Tab continues from the dock, not from the
 * top of the page.
 */
export function focusDockItem(mode: DockMode = 'overview'): void {
  document.querySelector<HTMLElement>(`[data-dock-mode="${mode}"]`)?.focus();
}
