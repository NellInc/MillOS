import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { selectRestartPending, useGameSimulationStore } from '../gameSimulationStore';
import { useProductionStore } from '../productionStore';
import { useSafetyStore } from '../safetyStore';
import { useUIStore } from '../uiStore';
import { mockMachines } from '../../test/fixtures/mockMachines';
import { alertText } from '../../i18n/alertCopy';
import { setLocale } from '../../i18n';

// D13: clearing a facility stop or ending a drill releases the interlock and
// leaves every machine idle; a separate, deliberate Restart brings the line
// back (Machinery Directive 2006/42/EC, Annex I 1.2.4.3).
// Working if resolveEmergency leaves every machine idle until restartLine.
const statuses = () =>
  Object.fromEntries(useProductionStore.getState().machines.map((m) => [m.id, m.status]));
const running = () =>
  useProductionStore.getState().machines.filter((m) => m.status === 'running').length;
const restartAlert = () =>
  useUIStore.getState().alerts.find((alert) => alert.id === 'line-restart-pending');

describe('reset, then restart', () => {
  beforeEach(() => {
    useGameSimulationStore.getState().resetGameState();
    useSafetyStore.getState().setForkliftEmergencyStop(false);
    useProductionStore.getState().setMachines(mockMachines.map((m) => ({ ...m })));
    useUIStore.setState({ alerts: [] });
  });
  afterEach(() => {
    setLocale('en');
    useGameSimulationStore.getState().resetGameState();
    useSafetyStore.getState().setForkliftEmergencyStop(false);
    useProductionStore.getState().setMachines([]);
    useUIStore.setState({ alerts: [] });
  });

  it('CLEAR EMERGENCY leaves every machine idle until the line is restarted', () => {
    const before = statuses();
    expect(running()).toBeGreaterThan(0);
    useGameSimulationStore.getState().triggerEmergency('E-STOP');
    useGameSimulationStore.getState().resolveEmergency();

    const state = useGameSimulationStore.getState();
    expect(state.emergencyActive).toBe(false);
    expect(useSafetyStore.getState().forkliftEmergencyStop).toBe(false);
    expect(running()).toBe(0);
    expect(selectRestartPending(state)).toBe(true);

    useGameSimulationStore.getState().restartLine();
    expect(statuses()).toEqual(before);
    expect(selectRestartPending(useGameSimulationStore.getState())).toBe(false);
  });

  it('ending a drill leaves the line idle until the restart', () => {
    const before = statuses();
    useGameSimulationStore.getState().startEmergencyDrill();
    useGameSimulationStore.getState().endEmergencyDrill();
    expect(useGameSimulationStore.getState().emergencyDrillMode).toBe(false);
    expect(running()).toBe(0);
    useGameSimulationStore.getState().restartLine();
    expect(statuses()).toEqual(before);
  });

  it('keeps what the first stop recorded through a drill started before the restart', () => {
    const before = statuses();
    useGameSimulationStore.getState().triggerEmergency('E-STOP');
    useGameSimulationStore.getState().resolveEmergency();
    useGameSimulationStore.getState().startEmergencyDrill();
    expect(useGameSimulationStore.getState().emergencyDrillMode).toBe(true);
    useGameSimulationStore.getState().endEmergencyDrill();
    expect(running()).toBe(0);
    useGameSimulationStore.getState().restartLine();
    expect(statuses()).toEqual(before);
  });

  it('a restart does nothing while a stop holds', () => {
    useGameSimulationStore.getState().triggerEmergency('E-STOP');
    useGameSimulationStore.getState().restartLine();
    expect(running()).toBe(0);
    expect(useGameSimulationStore.getState().emergencyActive).toBe(true);
  });

  it('Reset to 10 AM while a restart is pending brings the line back', () => {
    const before = statuses();
    useGameSimulationStore.getState().triggerEmergency('E-STOP');
    useGameSimulationStore.getState().resolveEmergency();
    useGameSimulationStore.getState().clearPersistedState();
    expect(statuses()).toEqual(before);
    expect(restartAlert()).toBeUndefined();
  });

  it('restarts under a monitored crisis, which stops nothing', () => {
    const before = statuses();
    useGameSimulationStore.getState().triggerEmergency('E-STOP');
    useGameSimulationStore.getState().resolveEmergency();
    useGameSimulationStore.getState().triggerCrisis('weather', 'low');
    expect(useGameSimulationStore.getState().emergencyActive).toBe(false);
    useGameSimulationStore.getState().restartLine();
    expect(statuses()).toEqual(before);
  });

  it('takes the restart notice down while a second stop holds, and raises it on that clear', () => {
    useGameSimulationStore.getState().triggerEmergency('E-STOP');
    useGameSimulationStore.getState().resolveEmergency();
    expect(restartAlert()).toBeDefined();
    useGameSimulationStore.getState().startEmergencyDrill();
    expect(restartAlert()).toBeUndefined();
    useGameSimulationStore.getState().endEmergencyDrill();
    expect(restartAlert()).toBeDefined();
    useGameSimulationStore.getState().triggerEmergency('E-STOP');
    expect(restartAlert()).toBeUndefined();
  });

  it('rings the bell when the line waits for a restart, in both languages, and retires it on restart', () => {
    useGameSimulationStore.getState().triggerEmergency('E-STOP');
    expect(restartAlert()).toBeUndefined();
    useGameSimulationStore.getState().resolveEmergency();
    const alert = restartAlert();
    expect(alert).toBeDefined();
    expect(alertText(alert!).title).toBe('Line ready to restart');
    setLocale('pt-BR');
    expect(alertText(alert!).title).toBe('Linha pronta para reiniciar');
    useGameSimulationStore.getState().restartLine();
    expect(restartAlert()).toBeUndefined();
  });
});
