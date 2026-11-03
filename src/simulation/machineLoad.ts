import type { MachineData } from '../types';

/**
 * Store-owned machine load in simulation mode: 50 + line rate * 30 while
 * running, 0 when idle or on a 0% line, held for a breakdown, eased 10% per
 * update and snapped once within 0.05. The SCADA bridge (store.ts) and the
 * offline machine model (MachineSimulationController) both use this one formula.
 * A 0% line rate once meant "paused" (the hold kept load where it was); pause
 * is the game clock now, and a 0% line feeds the rolls nothing, so its load
 * falls with its vibration and feed instead of freezing at the last rate's.
 * Working if: SCADA's feed-derived load (itself driven by this load) is never
 * written back, so mills hold ~80% at nominal pace instead of climbing to 100%.
 */
export function storeOwnedLoad(
  machine: { status: MachineData['status']; metrics: Pick<MachineData['metrics'], 'load'> },
  productionSpeed: number,
  /** Fraction of the gap closed this update; 0.1 is one standard step. */
  easeFraction = 0.1
): number {
  const current = machine.metrics.load;
  const isRunning =
    productionSpeed > 0 && (machine.status === 'running' || machine.status === 'warning');
  let target = current;
  if (isRunning) target = 50 + productionSpeed * 30;
  else if (machine.status !== 'critical') target = 0;
  const clamp = (n: number): number => Math.max(0, Math.min(100, n));
  if (!Number.isFinite(current)) return Number.isFinite(target) ? clamp(target) : 0;
  const ease = Number.isFinite(easeFraction) ? Math.max(0, Math.min(1, easeFraction)) : 0.1;
  const next = current + (target - current) * ease;
  return clamp(Math.abs(target - next) < 0.05 ? target : next);
}
