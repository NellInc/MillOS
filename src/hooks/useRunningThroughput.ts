import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useProductionStore } from '../stores/productionStore';

/**
 * The packing rate a player reads, bags per game hour. The tick stops while the
 * clock is held, so metrics.throughput keeps its last value; a paused plant packs
 * nothing, so every rate surface reads 0 until the clock runs again (the
 * production target card always has). Display only: logic that asks whether the
 * line is idle still reads the store's own value.
 */
export function useRunningThroughput(): number {
  const throughput = useProductionStore((state) => state.metrics.throughput);
  const running = useGameSimulationStore((state) => state.gameSpeed > 0);
  return running && Number.isFinite(throughput) ? throughput : 0;
}
