import { useUIStore } from '../../stores/uiStore';

/**
 * The one route to the repair surface: Overview, scrolled to its maintenance
 * section (#overview-maintenance), which consumes the focus request even while
 * its panel is still loading. The shift card's Repair next action and the bell's
 * Open repair on a fault both take it. Working if either lands the player on the
 * work orders, not at the top of Overview.
 */
export function openRepairWorkspace(): void {
  useUIStore.getState().requestMaintenanceFocus();
  window.dispatchEvent(new CustomEvent('millos:open-operations-workspace', { detail: 'overview' }));
}

// The unit whose Inspector should put focus on Maintain when it shows. Held
// here, not in a store: it is a one-shot request between two components.
let maintainFocusFor: string | null = null;
const maintainFocusListeners = new Set<() => void>();
const setMaintainFocus = (machineId: string | null) => {
  if (maintainFocusFor === machineId) return;
  maintainFocusFor = machineId;
  maintainFocusListeners.forEach((listener) => listener());
};

/**
 * The route for a worn unit with no fault: select it, so its Inspector opens,
 * and put focus on Maintain there, the routine service at one part. A fault
 * goes to the work orders instead (openRepairWorkspace).
 * Working if a wear notice's Open repair lands on that unit's Maintain.
 */
export function openMachineService(
  machineId: string,
  focusMachine: (machineId: string) => void
): void {
  setMaintainFocus(machineId);
  focusMachine(machineId);
}

export const subscribeMaintainFocus = (listener: () => void): (() => void) => {
  maintainFocusListeners.add(listener);
  return () => {
    maintainFocusListeners.delete(listener);
  };
};

/** The unit a Maintain focus request is waiting for, or null. */
export const pendingMaintainFocus = (): string | null => maintainFocusFor;

/** Consume the request for this unit: true once, when it was the one asked for. */
export function takeMaintainFocus(machineId: string): boolean {
  if (maintainFocusFor !== machineId) return false;
  setMaintainFocus(null);
  return true;
}
