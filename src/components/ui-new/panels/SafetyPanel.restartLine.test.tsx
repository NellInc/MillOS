import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useProductionStore } from '../../../stores/productionStore';
import { useSafetyStore } from '../../../stores/safetyStore';
import { useEgressPreviewStore } from '../../../systems/egressPreview';
import { audioManager } from '../../../utils/audioManager';
import { mockMachines } from '../../../test/fixtures/mockMachines';
import { setLocale } from '../../../i18n';
import { SafetyPanel } from './SafetyPanel';

const running = () =>
  useProductionStore.getState().machines.filter((m) => m.status === 'running').length;

beforeEach(() => {
  vi.spyOn(audioManager, 'stopEmergencyStopAlarm').mockImplementation(() => {});
  vi.spyOn(audioManager, 'startEmergencyStopAlarm').mockImplementation(() => {});
  vi.spyOn(audioManager, 'playEmergencyStop').mockImplementation(() => {});
  useGameSimulationStore.getState().resetGameState();
  useProductionStore.getState().setMachines(mockMachines.map((m) => ({ ...m })));
});
afterEach(() => {
  cleanup();
  setLocale('en');
  useGameSimulationStore.getState().resetGameState();
  useGameSimulationStore.setState({ safetyEvents: [], activeSafetyEventId: null });
  useSafetyStore.setState({ forkliftEmergencyStop: false });
  useProductionStore.getState().setMachines([]);
  vi.restoreAllMocks();
});

// D13: CLEAR releases the interlock; the line restarts only from RESTART LINE,
// which takes the focus CLEAR had, as the next thing to do.
describe('Safety panel: reset, then restart', () => {
  it('CLEAR leaves the line idle and RESTART LINE brings it back', () => {
    const before = running();
    render(<SafetyPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'TRIGGER EMERGENCY STOP' }));
    fireEvent.click(screen.getByRole('button', { name: 'Trigger emergency stop' }));
    expect(screen.queryByRole('button', { name: 'RESTART LINE' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'CLEAR EMERGENCY' }));
    expect(running()).toBe(0);
    const restart = screen.getByRole('button', { name: 'RESTART LINE' });
    expect(document.activeElement).toBe(restart);
    // The emergency stop stays available while the line waits.
    expect(screen.getByRole('button', { name: 'TRIGGER EMERGENCY STOP' })).toBeEnabled();

    fireEvent.click(restart);
    expect(running()).toBe(before);
    expect(screen.queryByRole('button', { name: 'RESTART LINE' })).not.toBeInTheDocument();
  });

  it('offers the restart after END DRILL, in Portuguese too', () => {
    setLocale('pt-BR');
    render(<SafetyPanel />);
    act(() => useGameSimulationStore.getState().startEmergencyDrill());
    fireEvent.click(screen.getByRole('button', { name: 'ENCERRAR SIMULADO' }));
    expect(running()).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'REINICIAR LINHA' }));
    expect(running()).toBeGreaterThan(0);
  });

  it('shows the drill record once the drill ends', () => {
    render(<SafetyPanel />);
    act(() => {
      const game = useGameSimulationStore.getState();
      game.startEmergencyDrill();
      game.markZoneVerified('front', {
        zoneId: 'front',
        result: 'clear',
        clock: { day: 0, hour: 10.5 },
      });
      game.markZoneVerified('back', {
        zoneId: 'back',
        result: 'alternative',
        alternative: 'east',
        blockedBy: ['FLT01'],
        clock: { day: 0, hour: 10.55 },
      });
      game.endEmergencyDrill();
    });
    const record = screen.getByRole('list', { name: 'Drill record' });
    expect(record.textContent).toContain('Front Service Egress: own route clear, Day 1, 10:30');
    expect(record.textContent).toContain(
      'Back Service Egress: verified by the East Service Egress route, FLT01 on its own, Day 1, 10:33'
    );
    expect(record.textContent).toContain('West Service Egress: not verified');
  });

  it('has no weather control, and draws the egress routes while its controls are open', () => {
    const { unmount } = render(<SafetyPanel />);
    expect(screen.queryByRole('group', { name: 'Weather conditions' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Set weather/ })).not.toBeInTheDocument();
    expect(useEgressPreviewStore.getState().openPanels).toBe(1);
    fireEvent.click(screen.getByRole('tab', { name: 'Analytics' }));
    expect(useEgressPreviewStore.getState().openPanels).toBe(0);
    fireEvent.click(screen.getByRole('tab', { name: 'Controls' }));
    unmount();
    expect(useEgressPreviewStore.getState().openPanels).toBe(0);
  });
});
