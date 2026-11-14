/**
 * Whether the step-free egress routes and refuges are drawn on the floor
 * (EgressRouteFloor): while the Safety panel's controls are open, so a player
 * preparing a drill sees which routes a stopped forklift would block, and
 * during a drill. A count, because the desktop sidebar and the phone panel
 * each mount their own Safety panel. Page state: never saved, and never set in
 * a benchmark or capture run, which open no panel.
 */
import { create } from 'zustand';

export const useEgressPreviewStore = create<{ openPanels: number }>(() => ({ openPanels: 0 }));

/** Show the routes while a Safety panel's controls are open; returns the release. */
export function showEgressRoutes(): () => void {
  useEgressPreviewStore.setState((state) => ({ openPanels: state.openPanels + 1 }));
  let released = false;
  return () => {
    if (released) return;
    released = true;
    useEgressPreviewStore.setState((state) => ({ openPanels: Math.max(0, state.openPanels - 1) }));
  };
}
