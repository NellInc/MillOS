import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  persistedGameSpeed,
  selectPaceUnderPause,
  useGameSimulationStore,
} from '../gameSimulationStore';
import { incidentDescription, useSafetyStore } from '../safetyStore';
import { setLocale } from '../../i18n';
import { useProductionStore } from '../productionStore';
import { mockMachines } from '../../test/fixtures/mockMachines';

beforeEach(() => {
  useGameSimulationStore.getState().resetGameState();
  useSafetyStore.getState().setForkliftEmergencyStop(false);
  useSafetyStore.getState().clearSafetyIncidents();
});
afterEach(() => {
  useGameSimulationStore.getState().resetGameState();
  useSafetyStore.getState().setForkliftEmergencyStop(false);
  useProductionStore.getState().setMachines([]);
});

// A duct fire stops the whole plant, yet Safety > Analytics showed no incident.
// Drills are planned exercises and stay out of the log; a real stop does not.
// Working if an interlocked crisis is logged once, as an emergency.
describe('interlocked crisis and the incident log', () => {
  it('logs an interlocked crisis as an emergency incident', () => {
    useGameSimulationStore.getState().triggerCrisis('fire', 'high');
    const incidents = useSafetyStore.getState().safetyIncidents;
    expect(incidents.filter((i) => i.type === 'emergency')).toHaveLength(1);
  });
  it('reads a crisis logged in English in Portuguese after a switch', () => {
    setLocale('en');
    useGameSimulationStore.getState().triggerCrisis('fire', 'high');
    const [incident] = useSafetyStore.getState().safetyIncidents;
    const english = incidentDescription(incident);
    setLocale('pt-BR');
    try {
      expect(incidentDescription(incident)).not.toBe(english);
      expect(incidentDescription(incident)).toBe('condição de incêndio');
    } finally {
      setLocale('en');
    }
  });
  it('does not log a monitored (non-interlocked) crisis', () => {
    useGameSimulationStore.getState().triggerCrisis('weather', 'low');
    expect(useSafetyStore.getState().safetyIncidents).toHaveLength(0);
  });
});

// P and the pace menu pause and resume alike, and neither survives a reload:
// the sim starts with the clock ticking (Nell, 2026-11-07, D-049).
// Working if a reload after either pause resumes the pace that was running.
describe('a P pause ends with its page like a menu pause', () => {
  it('persists the pace underneath a shortcut hold', () => {
    useGameSimulationStore.getState().setGameSpeed(60);
    useGameSimulationStore.getState().holdClock('shortcut');
    expect(persistedGameSpeed(useGameSimulationStore.getState())).toBe(60);
  });
  it('still persists the chosen pace under a tour hold', () => {
    useGameSimulationStore.getState().setGameSpeed(60);
    useGameSimulationStore.getState().holdClock('tour');
    expect(persistedGameSpeed(useGameSimulationStore.getState())).toBe(60);
  });
});

// The shift review recorded a resume from the pace buttons (0 -> 30) but not
// from Resume or P, which make the same change. A pace is a decision when it
// differs from the pace running underneath the pause.
// Working if resuming at the same pace reads as no change from any control.
describe('pace running underneath a pause', () => {
  it('reads the pace a pause will return to', () => {
    const sim = useGameSimulationStore.getState();
    sim.setGameSpeed(60);
    expect(selectPaceUnderPause(useGameSimulationStore.getState())).toBe(60);
    useGameSimulationStore.getState().setGameSpeed(0);
    expect(selectPaceUnderPause(useGameSimulationStore.getState())).toBe(60);
    useGameSimulationStore.getState().holdClock('shortcut');
    expect(selectPaceUnderPause(useGameSimulationStore.getState())).toBe(60);
  });
});

// The player held the forklifts with Space, then a drill or facility stop came
// and went: its release also let the forklifts go. A stop releases only the
// hold it applied. Working if a forklift stop set before survives the release.
describe('a forklift stop set before a facility stop', () => {
  it.each([
    [
      'drill',
      () => useGameSimulationStore.getState().startEmergencyDrill(),
      () => useGameSimulationStore.getState().endEmergencyDrill(),
    ],
    [
      'facility stop',
      () => useGameSimulationStore.getState().triggerEmergency('E-STOP'),
      () => useGameSimulationStore.getState().resolveEmergency(),
    ],
    [
      'crisis',
      () => useGameSimulationStore.getState().triggerCrisis('fire', 'high'),
      () => useGameSimulationStore.getState().resolveCrisis(),
    ],
  ])('survives the end of a %s', (_label, start, end) => {
    useSafetyStore.getState().setForkliftEmergencyStop(true);
    start();
    end();
    expect(useSafetyStore.getState().forkliftEmergencyStop).toBe(true);
  });
  it('is left alone by a monitored crisis that never held it', () => {
    useSafetyStore.getState().setForkliftEmergencyStop(true);
    useGameSimulationStore.getState().triggerCrisis('weather', 'low');
    useGameSimulationStore.getState().resolveCrisis();
    expect(useSafetyStore.getState().forkliftEmergencyStop).toBe(true);
  });
  it('is released when the stop applied it', () => {
    useGameSimulationStore.getState().triggerEmergency('E-STOP');
    useGameSimulationStore.getState().resolveEmergency();
    expect(useSafetyStore.getState().forkliftEmergencyStop).toBe(false);
  });
});

// The inspector's maintenance log dated game day 0 and game day 1 both 'Day 1'.
// Working if day N of the clock reads Day N + 1, as every other plant stamp does.
describe('maintenance log day', () => {
  it('dates game day 0 and game day 1 apart', () => {
    useProductionStore
      .getState()
      .setMachines(
        mockMachines.map((m) =>
          m.id === 'rm-101'
            ? { ...m, status: 'running' as const, metrics: { ...m.metrics, wear: 40 } }
            : { ...m }
        )
      );
    const dates: string[] = [];
    for (const gameDay of [0, 1]) {
      useGameSimulationStore.setState({ gameDay, gameTime: 10 });
      useProductionStore.getState().updateMachineMetrics('rm-101', { wear: 40 });
      useProductionStore.getState().performMaintenance('rm-101');
      dates.push(
        useProductionStore.getState().machines.find((m) => m.id === 'rm-101')!
          .maintenanceHistory![0].date
      );
    }
    expect(dates[0]).not.toBe(dates[1]);
    expect(dates[0]).toContain('1');
    expect(dates[1]).toContain('2');
  });
});
