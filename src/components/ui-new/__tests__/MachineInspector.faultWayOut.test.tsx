import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MachineInspector } from '../sidebar/MachineInspector';
import { MachineType, type MachineData } from '../../../types';
import { useProductionStore } from '../../../stores/productionStore';
import { useBreakdownStore } from '../../../stores/breakdownStore';
import { useUIStore } from '../../../stores/uiStore';
import { resetUnitWork } from '../../../systems/unitService';
import { setLocale } from '../../../i18n';

// A state with no way out is a bug. Under a fault Maintain and Restart are
// both held, and the panel said only "Active repair work order.", leading
// nowhere. It now leads to the repair: a control that opens the work orders,
// and both held buttons carry the refusal's own words as their reason.

const machine: MachineData = {
  id: 'fault-mill',
  name: 'R.M. 103',
  type: MachineType.ROLLER_MILL,
  position: [0, 0, 0],
  size: [1, 1, 1],
  rotation: 0,
  status: 'running',
  metrics: { rpm: 100, temperature: 45, vibration: 1, load: 60, wear: 52.4, efficiency: 85 },
  lastMaintenance: '2026-09-01',
  nextMaintenance: '2026-10-01',
};

let savedMachines: MachineData[];
let savedBreakdowns: ReturnType<typeof useBreakdownStore.getState>;

beforeEach(() => {
  resetUnitWork();
  savedMachines = useProductionStore.getState().machines;
  savedBreakdowns = useBreakdownStore.getState();
  useBreakdownStore.setState({
    activeBreakdowns: [],
    workOrders: [],
    maintenanceSchedule: [],
    partsInventory: { filters: 3, bearings: 3, belts: 3, sensors: 3, motors: 3 },
  });
});
afterEach(() => {
  cleanup();
  resetUnitWork();
  setLocale('en');
  useProductionStore.setState({ machines: savedMachines });
  act(() => useBreakdownStore.setState(savedBreakdowns));
});

describe.each([
  ['en', 'Machine is under repair: complete the work order first.', 'Open the work order'],
  [
    'pt-BR',
    'A máquina está em reparo: conclua primeiro a ordem de serviço.',
    'Abrir a ordem de serviço',
  ],
] as const)('the Inspector under a fault (%s)', (locale, reason, open) => {
  beforeEach(() => setLocale(locale));

  it('leads to the work order, and both held buttons give the refusal as their reason', () => {
    useBreakdownStore.getState().triggerBreakdown(machine.id, machine.name, 'mechanical');
    useProductionStore.setState({ machines: [machine] });
    render(<MachineInspector machine={machine} />);
    fireEvent.click(screen.getByText(/^(Inspect|Inspecionar)/));

    const maintain = screen.getByRole('button', { name: /Perform Maintenance|Fazer manutenção/ });
    const restart = screen.getByRole('button', { name: /^(Restart Unit|Reiniciar unidade)$/ });
    expect(maintain).toBeDisabled();
    expect(restart).toBeDisabled();
    expect(maintain).toHaveAccessibleDescription(reason);
    expect(restart).toHaveAccessibleDescription(reason);

    const routes: unknown[] = [];
    const listen = (event: Event) => routes.push((event as CustomEvent).detail);
    window.addEventListener('millos:open-operations-workspace', listen);
    try {
      const way = screen.getByRole('button', { name: open });
      expect(way).toBeEnabled();
      expect(way).not.toHaveAttribute('title');
      fireEvent.click(way);
      expect(routes).toEqual(['overview']);
      expect(useUIStore.getState().maintenanceFocusRequested).toBe(true);
    } finally {
      window.removeEventListener('millos:open-operations-workspace', listen);
    }
  });
});
