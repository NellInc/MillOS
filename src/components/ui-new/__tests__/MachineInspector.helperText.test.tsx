import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MachineInspector } from '../sidebar/MachineInspector';
import { machineInspectorMessages } from '../sidebar/MachineInspector.messages';
import { MachineType, type MachineData } from '../../../types';
import { useProductionStore } from '../../../stores/productionStore';
import { useBreakdownStore } from '../../../stores/breakdownStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { resetUnitWork } from '../../../systems/unitService';
import { setLocale, translate } from '../../../i18n';

// D14 (D-012): the Inspector keeps values, costs on buttons and refusals at a
// held control; it drops hints, advice tails and explanatory title tooltips.
// Working if no button carries a title, an idle or worn unit shows no hint,
// and a facility stop says why Restart is held, visibly, at the button.

const machine: MachineData = {
  id: 'help-mill',
  name: 'Help mill',
  type: MachineType.ROLLER_MILL,
  position: [0, 0, 0],
  size: [1, 1, 1],
  rotation: 0,
  status: 'running',
  metrics: { rpm: 100, temperature: 45, vibration: 1, load: 60, wear: 52.4, efficiency: 85 },
  lastMaintenance: '2026-09-01',
  nextMaintenance: '2026-10-01',
};

const CUT = [
  /Something's off/,
  /Algo não está certo/,
  /Mill Overview/,
  /Visão geral do moinho/,
  /Maintenance lowers wear/,
  /A manutenção reduz o desgaste/,
  /full efficiency/,
  /eficiência total/,
  /very lucky/,
  /muita sorte/,
  /Reduces machine wear/,
  /Reduz o desgaste/,
];

const body = () => document.body.textContent ?? '';
const noHelper = () => {
  for (const pattern of CUT) expect(body()).not.toMatch(pattern);
  for (const button of screen.getAllByRole('button')) expect(button).not.toHaveAttribute('title');
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
  useGameSimulationStore.setState({ emergencyActive: false, emergencyDrillMode: false });
  useProductionStore.setState({ machines: savedMachines });
  act(() => useBreakdownStore.setState(savedBreakdowns));
});

const show = (unit: MachineData) => {
  useProductionStore.setState({ machines: [unit] });
  render(<MachineInspector machine={unit} />);
  fireEvent.click(screen.getByText(/^(Inspect|Inspecionar)/));
};

describe.each(['en', 'pt-BR'] as const)('MachineInspector without helper text (%s)', (locale) => {
  beforeEach(() => setLocale(locale));

  it('shows a worn, a warning and an idle unit without hints or titles', () => {
    for (const status of ['running', 'warning', 'idle'] as const) {
      show({ ...machine, status });
      noHelper();
      cleanup();
    }
  });

  it('shows the maintenance record without its joke', () => {
    show(machine);
    const logs = /Maintenance Logs|registros de manutenção/;
    fireEvent.click(screen.getByRole('button', { name: logs }));
    const empty = locale === 'en' ? 'No maintenance on record.' : 'Nenhuma manutenção registrada.';
    expect(screen.getByText(empty)).toBeVisible();
    noHelper();
  });

  it('names an active repair in one clause', () => {
    useBreakdownStore.getState().triggerBreakdown(machine.id, machine.name, 'mechanical');
    show(machine);
    expect(
      screen.getByText(
        locale === 'en'
          ? 'Machine is under repair: complete the work order first.'
          : 'A máquina está em reparo: conclua primeiro a ordem de serviço.'
      )
    ).toBeVisible();
    noHelper();
  });

  it('says at the held Restart that the facility stop holds it', () => {
    useGameSimulationStore.setState({ emergencyActive: true });
    show(machine);
    const line =
      locale === 'en'
        ? 'The facility is stopped. Clear the stop before restarting a unit.'
        : 'O moinho está parado. Libere a parada antes de reiniciar uma máquina.';
    const restart = screen.getByRole('button', { name: /^(Restart Unit|Reiniciar unidade)$/ });
    expect(restart).toBeDisabled();
    expect(screen.getByText(line)).toBeVisible();
    expect(restart).toHaveAccessibleDescription(line);
    noHelper();
    act(() => useGameSimulationStore.setState({ emergencyActive: false }));
    expect(screen.queryByText(line)).toBeNull();
    expect(restart).not.toHaveAttribute('aria-describedby');
  });
});

describe('MachineInspector values keep their value and drop the advice', () => {
  it('reads wear, cost, service minimum and the trend caption as values', () => {
    expect(
      translate(machineInspectorMessages, 'wearThresholds', {
        warning: '60',
        breakdown: '90',
        efficiency: '85',
      })
    ).toBe('Warning at 60%, breakdown at 90%. Efficiency 85%.');
    expect(
      translate(machineInspectorMessages, 'maintenanceCost', { part: 'filters', count: '3' })
    ).toBe('Uses 1 spare part: filters (3 in stock), returned if a fault ends the service.');
    expect(
      translate(machineInspectorMessages, 'maintenanceCostHeld', {
        part: 'filters',
        count: '3',
        held: '1',
      })
    ).toBe(
      'Uses 1 spare part: filters (3 in stock, 1 held for repairs), returned if a fault ends the service.'
    );
    expect(
      translate(machineInspectorMessages, 'maintenanceBelowMinimum', {
        wear: '5.0',
        minimum: '30.0',
      })
    ).toBe('Not needed yet: wear 5.0% is below the 30.0% service minimum.');
    expect(translate(machineInspectorMessages, 'trendCaption', { unit: 't/h' })).toBe(
      'Feed rate (t/h)'
    );
    expect(machineInspectorMessages['pt-BR'].maintenanceCost({ part: 'filters', count: '3' })).toBe(
      'Usa 1 peça de reposição: filtros (3 em estoque), devolvida se uma falha interromper a manutenção.'
    );
  });

  it('files a still-worn or incident-held restart without a lecture', () => {
    const worn = { name: 'R.M. 101', wear: 62.3, threshold: 60 };
    expect(machineInspectorMessages.en.machineRestartedWornMessage(worn)).toBe(
      'R.M. 101 restarted, but wear is still 62.3% (it warns from 60%).'
    );
    expect(machineInspectorMessages['pt-BR'].machineRestartedWornMessage(worn)).toBe(
      'R.M. 101 reiniciou, mas o desgaste continua em 62,3% (o alerta começa em 60%).'
    );
    expect(machineInspectorMessages.en.machineRestartedIncidentMessage).not.toMatch(
      /does not clear/
    );
    expect(machineInspectorMessages['pt-BR'].machineRestartedIncidentMessage).not.toMatch(
      /não o resolve/
    );
  });

  it('keeps no catalogue key for a cut hint', () => {
    for (const locale of ['en', 'pt-BR'] as const)
      for (const key of ['warningGuidance', 'maintenanceTitle'])
        expect(Object.keys(machineInspectorMessages[locale])).not.toContain(key);
  });
});
