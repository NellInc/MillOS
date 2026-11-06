/**
 * The sidebar keys the Inspector by machine, so selecting another unit and
 * coming back (or closing and reopening the sidebar) remounts it. Maintain's
 * 1.2 s service outlives that remount. The new Inspector forgot it, offered
 * Maintain again, and a second press serviced the unit twice for two parts.
 * Working if a reselected unit mid-service reads Performing Maintenance, its
 * Maintain and Restart stay locked, and the service lands once.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MachineInspector } from '../sidebar/MachineInspector';
import { MachineType, type MachineData } from '../../../types';
import { useProductionStore } from '../../../stores/productionStore';
import { useBreakdownStore } from '../../../stores/breakdownStore';
import { useUIStore } from '../../../stores/uiStore';

const mill: MachineData = {
  id: 'rm-remount',
  name: 'RM-REMOUNT',
  type: MachineType.ROLLER_MILL,
  position: [0, 0, 0],
  size: [1, 1, 1],
  rotation: 0,
  status: 'warning',
  metrics: { rpm: 100, temperature: 45, vibration: 1, load: 60, wear: 85, efficiency: 80 },
  lastMaintenance: '2026-09-01',
  nextMaintenance: '2026-10-01',
};

let savedMachines: MachineData[];

beforeEach(() => {
  vi.useFakeTimers();
  savedMachines = useProductionStore.getState().machines;
  useBreakdownStore.getState().resetBreakdownStore();
  useUIStore.setState({ alerts: [] });
});

afterEach(async () => {
  cleanup();
  // Let any service still in flight finish before the stores are put back.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000);
  });
  vi.useRealTimers();
  useProductionStore.setState({ machines: savedMachines });
  useBreakdownStore.getState().resetBreakdownStore();
  useUIStore.setState({ alerts: [] });
});

describe('MachineInspector Maintain across a remount', () => {
  it('services the unit once when Maintain is pressed again on the remounted Inspector', async () => {
    useProductionStore.setState({ machines: [mill] });
    const filtersBefore = useBreakdownStore.getState().partsInventory.filters;

    const first = render(<MachineInspector machine={mill} />);
    fireEvent.click(screen.getByRole('button', { name: 'Perform Maintenance' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    first.unmount();
    render(<MachineInspector machine={mill} />);
    fireEvent.click(screen.getByRole('button', { name: /^Perform(ing)? Maintenance/ }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    const live = useProductionStore.getState().machines.find((m) => m.id === mill.id)!;
    expect(live.maintenanceHistory ?? []).toHaveLength(1);
    expect(useBreakdownStore.getState().partsInventory.filters).toBe(filtersBefore - 1);
  });

  it('keeps the service in flight on the remounted Inspector and services once', async () => {
    useProductionStore.setState({ machines: [mill] });
    const filtersBefore = useBreakdownStore.getState().partsInventory.filters;

    const first = render(<MachineInspector machine={mill} />);
    fireEvent.click(screen.getByRole('button', { name: 'Perform Maintenance' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    // The player selects another unit and comes back mid-service.
    first.unmount();
    render(<MachineInspector machine={mill} />);

    const maintain = screen.getByRole('button', { name: /Performing Maintenance/ });
    expect((maintain as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByText('Inspect'));
    expect(
      (screen.getByRole('button', { name: 'Restart Unit' }) as HTMLButtonElement).disabled
    ).toBe(true);
    // A press on the locked control does nothing.
    fireEvent.click(maintain);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    const live = useProductionStore.getState().machines.find((m) => m.id === mill.id)!;
    expect(live.maintenanceHistory ?? []).toHaveLength(1);
    expect(useBreakdownStore.getState().partsInventory.filters).toBe(filtersBefore - 1);
    // Once the service lands, the remounted Inspector offers Maintain again.
    expect(screen.getByRole('button', { name: 'Perform Maintenance' })).toBeTruthy();
  });
});
