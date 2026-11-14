import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { reconcileSavedWeather, useGameSimulationStore } from '../gameSimulationStore';
import { useOperationsCampaignStore, type OperationalIncident } from '../operationsCampaignStore';

// 6.8: the sky cannot contradict a severe-rain incident. While one is open the
// weather is a storm and nothing sets it otherwise; when the last one closes
// the storm it brought lifts.
const severeRain = (phase: OperationalIncident['phase']): OperationalIncident => ({
  id: 'incident-rain-1',
  kind: 'severe_rain',
  title: 'Severe rain',
  description: 'Severe rain',
  phase,
  severity: 'high',
  startedAtMinute: 0,
  acknowledgedAtMinute: null,
  resolvedAtMinute: phase === 'resolved' ? 10 : null,
  affectedMachineId: null,
  effectApplied: true,
});
const weather = () => useGameSimulationStore.getState().weather;
// The lock is installed after module evaluation, so a test waits a microtask.
const settle = () => Promise.resolve();

describe('weather follows an open severe-rain incident', () => {
  beforeEach(async () => {
    await settle();
    useOperationsCampaignStore.setState({ incidents: [] });
    useGameSimulationStore.setState({ weather: 'clear' });
  });
  afterEach(() => {
    useOperationsCampaignStore.setState({ incidents: [] });
    useGameSimulationStore.setState({ weather: 'clear' });
  });

  it('refuses to clear the sky while a severe-rain incident is open', () => {
    useOperationsCampaignStore.setState({ incidents: [severeRain('raised')] });
    useGameSimulationStore.getState().setWeather('storm');
    useGameSimulationStore.getState().setWeather('clear');
    expect(weather()).toBe('storm');
    useGameSimulationStore.getState().setWeather('cloudy');
    expect(weather()).toBe('storm');
  });

  it('brings the storm when an open incident finds a clear sky (a restored save)', () => {
    useOperationsCampaignStore.setState({ incidents: [severeRain('mitigated')] });
    expect(weather()).toBe('storm');
  });

  it('lifts the storm when the last severe-rain incident closes', () => {
    useOperationsCampaignStore.setState({ incidents: [severeRain('raised')] });
    expect(weather()).toBe('storm');
    useOperationsCampaignStore.setState({ incidents: [severeRain('resolved')] });
    expect(weather()).toBe('clear');
  });

  it('puts the storm back over a direct write while the incident is open (a session restore)', () => {
    useOperationsCampaignStore.setState({ incidents: [severeRain('raised')] });
    useGameSimulationStore.setState({ weather: 'clear' });
    expect(weather()).toBe('storm');
  });

  it.each([
    // A storm whose incident closed with nothing to lift it.
    ['storm', 'clear'],
    // Any other saved sky is kept as saved.
    ['rain', 'rain'],
  ] as const)('reads a %s saved with no incident open as %s at start-up', (saved, loaded) => {
    useGameSimulationStore.setState({ weather: saved });
    reconcileSavedWeather();
    expect(weather()).toBe(loaded);
  });

  it('leaves a storm set with no incident alone (the benchmark weather route)', () => {
    useGameSimulationStore.getState().setWeather('storm');
    useOperationsCampaignStore.setState({ incidents: [] });
    expect(weather()).toBe('storm');
    useGameSimulationStore.getState().setWeather('rain');
    expect(weather()).toBe('rain');
  });
});
