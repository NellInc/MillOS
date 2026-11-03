/**
 * Whether a forklift can take a changed logistics route now.
 *
 * On autopilot the reconciler must place it on the new route; a corner it
 * cannot place is refused, and the planner says to try again from an
 * unchanged leg. Under manual control (driven, or returning to its lane) the
 * forklift is at its manual position, which the reconciler cannot place, and
 * it never runs a leg on its own; refusing would hold the apply until the
 * player drove it back. It takes the new route at once instead: the lane
 * return rejoins whatever route is current, so its motion is rebuilt there.
 */
export type ForkliftManualMode = 'none' | 'driven' | 'lane';

export type ForkliftRouteChange<M> = { kind: 'refuse' } | { kind: 'commit'; motion: M | null };

export function planForkliftRouteChange<M>(
  manualMode: ForkliftManualMode,
  reconcile: () => M | null
): ForkliftRouteChange<M> {
  if (manualMode !== 'none') return { kind: 'commit', motion: null };
  const motion = reconcile();
  return motion ? { kind: 'commit', motion } : { kind: 'refuse' };
}
