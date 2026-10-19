import { useUIStore } from '../../stores/uiStore';

/**
 * The one route to the repair surface: Overview, scrolled to its maintenance
 * section (#overview-maintenance), which consumes the focus request even while
 * its panel is still loading. The shift card's Repair next action and the bell's
 * Open repair both take it. Working if either lands the player on the work
 * orders, not at the top of Overview.
 */
export function openRepairWorkspace(): void {
  useUIStore.getState().requestMaintenanceFocus();
  window.dispatchEvent(new CustomEvent('millos:open-operations-workspace', { detail: 'overview' }));
}
