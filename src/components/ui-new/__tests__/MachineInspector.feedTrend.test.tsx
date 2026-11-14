import { act, cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MachineInspector } from '../sidebar/MachineInspector';
import { MachineType, type MachineData } from '../../../types';
import { useProductionStore } from '../../../stores/productionStore';
import { useBreakdownStore } from '../../../stores/breakdownStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { resetUnitWork } from '../../../systems/unitService';
import { setLocale } from '../../../i18n';

// Under a facility stop the Inspector, scrolled to Maintain, showed "Feed
// rate (t/h)" over a dotted rule and nothing else: the trend's caption sat
// under an empty figure. The feed reads 0.0 while stopped, and the trend is
// shown only when there is a recorded line to draw, captioned above it.

const mill: MachineData = {
  id: 'rm-101',
  name: 'R.M. 101',
  type: MachineType.ROLLER_MILL,
  position: [0, 0, 0],
  size: [1, 1, 1],
  rotation: 0,
  status: 'idle',
  metrics: { rpm: 0, temperature: 30, vibration: 0, load: 0, wear: 46.7, efficiency: 89 },
  lastMaintenance: '2026-09-01',
  nextMaintenance: '2026-10-01',
};

let savedMachines: MachineData[];
beforeEach(() => {
  setLocale('en');
  resetUnitWork();
  savedMachines = useProductionStore.getState().machines;
  useBreakdownStore.setState({ activeBreakdowns: [], workOrders: [] });
});
afterEach(() => {
  cleanup();
  resetUnitWork();
  useGameSimulationStore.setState({ emergencyActive: false });
  useProductionStore.setState({ machines: savedMachines });
});

describe('the Inspector’s feed reading under a facility stop', () => {
  it('reads 0.0 t/h and shows no caption without a line to draw', () => {
    act(() => useGameSimulationStore.setState({ emergencyActive: true }));
    useProductionStore.setState({ machines: [mill] });
    render(<MachineInspector machine={mill} />);
    const feed = screen.getByText('Feed rate').closest('div')!;
    expect(feed).toHaveTextContent('0.0');
    expect(screen.queryByText('Feed rate (t/h)')).toBeNull();
  });
});
