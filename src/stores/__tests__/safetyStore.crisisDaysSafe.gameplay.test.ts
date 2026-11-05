/**
 * Days Safe ("Dias sem ocorrência") is reset by a blocked-route forklift stop,
 * yet a Mill Chronicle duct fire that stops the whole plant left it counting:
 * the Overview read "Days Safe 14" beside a Last Event of "just now" for a fire.
 * The operator's own stops (Space, the Safety panel E-stop) stay out of it: a
 * stop the player chose is not a lapse.
 * Working if a plant-stopping crisis resets Days Safe and an operator stop
 * does not.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSafetyStore } from '../safetyStore';
import { useGameSimulationStore } from '../gameSimulationStore';

vi.mock('../../utils/audioManager', () => ({
  audioManager: new Proxy({}, { get: () => () => undefined }),
}));

const metrics = {
  nearMisses: 0,
  safetyStops: 0,
  routeConflicts: 0,
  lastIncidentTime: null,
  daysSinceIncident: 14,
};

beforeEach(() => {
  useSafetyStore.setState({ safetyIncidents: [], safetyMetrics: { ...metrics } });
});

afterEach(() => {
  const game = useGameSimulationStore.getState();
  if (game.crisisState.active) game.resolveCrisis();
  if (game.emergencyActive) game.resolveEmergency();
  useSafetyStore.setState({
    safetyIncidents: [],
    safetyMetrics: { ...metrics, daysSinceIncident: 0 },
    forkliftEmergencyStop: false,
  });
});

describe('Days Safe after a plant-stopping crisis', () => {
  it('resets when a duct fire stops the plant', () => {
    useGameSimulationStore.getState().triggerCrisis('fire', 'high', { source: 'chronicle' });
    expect(useSafetyStore.getState().safetyIncidents).toHaveLength(1);
    expect(useSafetyStore.getState().safetyMetrics.daysSinceIncident).toBe(0);
  });

  it('keeps counting through a stop the operator chose', () => {
    useSafetyStore.getState().addSafetyIncident({
      type: 'emergency',
      description: 'Facility emergency stop triggered from the Safety panel',
      descriptionKey: 'facilityStop',
    });
    expect(useSafetyStore.getState().safetyMetrics.daysSinceIncident).toBe(14);
  });
});
