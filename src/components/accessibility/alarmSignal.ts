import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useSafetyStore } from '../../stores/safetyStore';

/**
 * Whether the plant's alarm is signalling: a live emergency, an egress drill,
 * or the forklift emergency stop. The visual alarm devices and the alert
 * pager show it as light; the sounders and the PA carry it as sound.
 * Read inside frame loops: two store reads, no allocation.
 */
export function isAlarmSignalling(): boolean {
  const game = useGameSimulationStore.getState();
  return (
    game.emergencyActive ||
    game.emergencyDrillMode ||
    useSafetyStore.getState().forkliftEmergencyStop === true
  );
}

/**
 * The strobe's state at a render-clock time: one flash a second, on for a
 * fifth of it. That is the rate visual alarm devices use (0.5 to 2 Hz), well
 * under the 3 Hz above which flashing can trigger photosensitive seizures.
 * Under reduced motion the lamp is held steadily on instead.
 */
export function strobeOn(seconds: number, reducedMotion: boolean): boolean {
  if (reducedMotion) return true;
  const t = Number.isFinite(seconds) ? seconds - Math.floor(seconds) : 0;
  return t < 0.2;
}
