import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MachineInspector } from '../sidebar/MachineInspector';
import { MachineType, type MachineData } from '../../../types';
import { useProductionStore } from '../../../stores/productionStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useBreakdownStore } from '../../../stores/breakdownStore';
import { useSafetyStore } from '../../../stores/safetyStore';
import { useUIStore } from '../../../stores/uiStore';
import { setLocale } from '../../../i18n';

// Restart idles the unit for a 2.5 s sequence on the wall clock. A reload in
// that window saves it idle (the session saves on pagehide), and the restored
// Inspector said only "Idle": nothing told the player the unit was stopped and
// that Restart Unit, folded away under Inspect, is what returns it. An AI safety
// decision leaves a unit idle the same way.
// Working if an idle unit outside a stop, a fault and a live restart names
// Restart Unit, in the language active now.
const idle: MachineData = {
  id: 'idle-mill',
  name: 'Idle mill',
  type: MachineType.ROLLER_MILL,
  position: [0, 0, 0],
  size: [1, 1, 1],
  rotation: 0,
  status: 'idle',
  metrics: { rpm: 0, temperature: 40, vibration: 1, load: 0, wear: 5, efficiency: 90 },
  lastMaintenance: '2026-09-01',
  nextMaintenance: '2026-10-01',
};

let savedMachines: MachineData[];

beforeEach(() => {
  vi.useFakeTimers();
  savedMachines = useProductionStore.getState().machines;
  useBreakdownStore.setState({ activeBreakdowns: [], workOrders: [] });
  useUIStore.setState({ alerts: [] });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  setLocale('en');
  const game = useGameSimulationStore.getState();
  if (game.emergencyActive) game.resolveEmergency();
  useProductionStore.setState({ machines: savedMachines });
  useBreakdownStore.setState({ activeBreakdowns: [], workOrders: [] });
  useSafetyStore.setState({ forkliftEmergencyStop: false });
});

const guidance = /Restart Unit.*returns it to service/;

describe('MachineInspector on a unit restored idle (a restart cut short by a reload)', () => {
  it('says the unit is stopped and that Restart Unit returns it to service', () => {
    useProductionStore.setState({ machines: [idle] });
    render(<MachineInspector machine={idle} />);
    expect(screen.getByText(guidance)).toBeTruthy();
    // The Restart it names is offered, and works.
    fireEvent.click(screen.getByText('Inspect'));
    const restart = screen.getByRole('button', { name: 'Restart Unit' });
    expect((restart as HTMLButtonElement).disabled).toBe(false);
  });

  it('reads in the language active now', () => {
    useProductionStore.setState({ machines: [idle] });
    act(() => setLocale('pt-BR'));
    render(<MachineInspector machine={idle} />);
    expect(screen.getByText(/Reiniciar unidade.*de volta à operação/)).toBeTruthy();
  });

  it('is not shown while the restart runs, or while a facility stop holds the unit', async () => {
    const running: MachineData = { ...idle, status: 'running' };
    useProductionStore.setState({ machines: [running] });
    render(<MachineInspector machine={running} />);
    fireEvent.click(screen.getByText('Inspect'));
    fireEvent.click(screen.getByRole('button', { name: 'Restart Unit' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(useProductionStore.getState().machines[0].status).toBe('idle');
    expect(screen.queryByText(/returns it to service/)).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(useProductionStore.getState().machines[0].status).toBe('running');

    act(() => useGameSimulationStore.getState().triggerEmergency('E-STOP'));
    expect(useProductionStore.getState().machines[0].status).toBe('idle');
    expect(screen.queryByText(/returns it to service/)).toBeNull();
  });

  // The sidebar keys the Inspector by machine, so selecting another unit and
  // coming back remounts it. A restart still running then read as a unit left
  // stopped, with Restart offered again for a second, overlapping sequence.
  it('knows a restart still running after the unit is reselected', async () => {
    const running: MachineData = { ...idle, status: 'running' };
    useProductionStore.setState({ machines: [running] });
    const first = render(<MachineInspector machine={running} />);
    fireEvent.click(screen.getByText('Inspect'));
    fireEvent.click(screen.getByRole('button', { name: 'Restart Unit' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    first.unmount();

    render(<MachineInspector machine={running} />);
    expect(useProductionStore.getState().machines[0].status).toBe('idle');
    expect(screen.queryByText(/returns it to service/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Restart Unit' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Restarting...' })).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(useProductionStore.getState().machines[0].status).toBe('running');
    expect(
      (screen.getByRole('button', { name: 'Restart Unit' }) as HTMLButtonElement).disabled
    ).toBe(false);
  });
});
