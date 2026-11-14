/**
 * Maintain stays pressable with no free part, so the click can say why it did
 * nothing. The bell holds ten notices: one refusal per click filled it with
 * copies and pushed out the wear warnings and holds the player still needed.
 * Working if repeated Maintain clicks with no part keep one notice per unit.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MachineInspector } from '../sidebar/MachineInspector';
import { MachineType, type MachineData } from '../../../types';
import { useProductionStore } from '../../../stores/productionStore';
import { useBreakdownStore } from '../../../stores/breakdownStore';
import { useUIStore } from '../../../stores/uiStore';

const mill: MachineData = {
  id: 'rm-parts',
  name: 'RM-PARTS',
  type: MachineType.ROLLER_MILL,
  position: [0, 0, 0],
  size: [1, 1, 1],
  rotation: 0,
  status: 'warning',
  metrics: { rpm: 100, temperature: 45, vibration: 1, load: 60, wear: 62, efficiency: 90 },
  lastMaintenance: '2026-09-01',
  nextMaintenance: '2026-10-01',
};

let savedMachines: MachineData[];

beforeEach(() => {
  vi.useFakeTimers();
  savedMachines = useProductionStore.getState().machines;
  useBreakdownStore.getState().resetBreakdownStore();
  useBreakdownStore.setState({
    partsInventory: { bearings: 0, belts: 0, filters: 0, motors: 0, sensors: 0 },
  });
  useUIStore.setState({ alerts: [] });
});

afterEach(() => {
  vi.useRealTimers();
  useProductionStore.setState({ machines: savedMachines });
  useBreakdownStore.getState().resetBreakdownStore();
  useUIStore.setState({ alerts: [] });
});

describe('MachineInspector Maintain with no spare part', () => {
  it('keeps one No Spare Parts notice however often it is pressed', () => {
    useUIStore.getState().addAlert({
      id: 'wear-warning-sifter-a',
      type: 'warning',
      title: 'Wear warning',
      message: 'Plansifter A has reached its wear warning.',
      timestamp: new Date(),
      acknowledged: false,
    });
    useProductionStore.setState({ machines: [mill] });
    render(<MachineInspector machine={mill} />);
    const maintain = screen.getByRole('button', { name: /^Perform Maintenance/ });
    for (let click = 0; click < 12; click += 1) {
      vi.advanceTimersByTime(5);
      fireEvent.click(maintain);
    }

    const alerts = useUIStore.getState().alerts;
    expect(alerts.filter((alert) => alert.title === 'No Spare Parts')).toHaveLength(1);
    // The refusal is news again at the top, unread.
    expect(alerts[0]).toMatchObject({ title: 'No Spare Parts', acknowledged: false });
    // Older notices survive the repeated refusal.
    expect(alerts.some((alert) => alert.id === 'wear-warning-sifter-a')).toBe(true);
  });
});
