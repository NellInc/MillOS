import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MachineType, type MachineData } from '../../../types';
import { maintenanceRecordText, useProductionStore } from '../../../stores/productionStore';
import { setLocale } from '../../../i18n';

vi.mock('../../../scada/useSCADA', () => ({
  useSCADATag: () => ({ value: null, history: [], loadHistory: vi.fn(async () => {}) }),
}));

const { MachineInspector } = await import('../sidebar/MachineInspector');

const mill: MachineData = {
  id: 'rm-101',
  name: 'R.M. 101',
  type: MachineType.ROLLER_MILL,
  position: [0, 0, 0],
  size: [1, 1, 1],
  rotation: 0,
  status: 'running',
  metrics: { rpm: 100, temperature: 45, vibration: 1, load: 60, wear: 62.3, efficiency: 90 },
  lastMaintenance: '2026-09-01',
  nextMaintenance: '2026-10-01',
};

afterEach(() => {
  cleanup();
  setLocale('en');
  useProductionStore.getState().setMachines([]);
});

// The maintenance log was worded once, at service time, so after a switch to
// pt-BR every earlier entry read in English with an English decimal point.
// Working if the inspector words each record in the language active now.
describe('Machine Inspector maintenance log language', () => {
  it('shows a record made in English in Portuguese after a switch', () => {
    setLocale('en');
    useProductionStore.getState().setMachines([{ ...mill }]);
    expect(useProductionStore.getState().performMaintenance('rm-101').success).toBe(true);
    const serviced = useProductionStore.getState().machines[0];
    const record = serviced.maintenanceHistory![0];
    setLocale('pt-BR');
    const portuguese = maintenanceRecordText(record);
    expect(portuguese.notes).not.toBe(record.notes);
    const { container } = render(<MachineInspector machine={serviced} />);
    fireEvent.click(container.querySelector('[aria-controls="machine-maintenance-logs"]')!);
    expect(screen.getByText(portuguese.notes)).toBeInTheDocument();
    expect(screen.queryByText(record.notes)).toBeNull();
  });
});
