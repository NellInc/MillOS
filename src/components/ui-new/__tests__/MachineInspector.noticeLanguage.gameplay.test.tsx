/**
 * The bell keeps the Inspector's notices (and the physical session restores
 * them), so each must read in the language active when it is read, decimal
 * comma included, not the one it was filed in.
 * Working if a notice filed in English reads in Portuguese through alertText.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MachineInspector } from '../sidebar/MachineInspector';
import { MachineType, type MachineData } from '../../../types';
import { useProductionStore } from '../../../stores/productionStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useBreakdownStore } from '../../../stores/breakdownStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useUIStore } from '../../../stores/uiStore';
import { setLocale } from '../../../i18n';
import { alertText } from '../../../i18n/alertCopy';

const mill = (wear: number, status: MachineData['status'] = 'running'): MachineData => ({
  id: 'rm-lang',
  name: 'RM-LANG',
  type: MachineType.ROLLER_MILL,
  position: [0, 0, 0],
  size: [1, 1, 1],
  rotation: 0,
  status,
  metrics: { rpm: 100, temperature: 45, vibration: 1, load: 60, wear, efficiency: 95 },
  lastMaintenance: '2026-09-01',
  nextMaintenance: '2026-10-01',
});

let savedMachines: MachineData[];
let savedIncidents: ReturnType<typeof useOperationsCampaignStore.getState>['incidents'];

beforeEach(() => {
  vi.useFakeTimers();
  setLocale('en');
  savedMachines = useProductionStore.getState().machines;
  savedIncidents = useOperationsCampaignStore.getState().incidents;
  useBreakdownStore.getState().resetBreakdownStore();
  useUIStore.setState({ alerts: [] });
  useOperationsCampaignStore.setState({ incidents: [] });
});

afterEach(() => {
  vi.useRealTimers();
  setLocale('en');
  const game = useGameSimulationStore.getState();
  if (game.emergencyActive) game.resolveEmergency();
  useProductionStore.setState({ machines: savedMachines });
  useOperationsCampaignStore.setState({ incidents: savedIncidents });
  useUIStore.setState({ alerts: [] });
});

const restart = async (machine: MachineData) => {
  useProductionStore.setState({ machines: [machine] });
  render(<MachineInspector machine={machine} />);
  fireEvent.click(screen.getByText('Inspect'));
  fireEvent.click(screen.getByRole('button', { name: 'Restart Unit' }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000);
  });
  return useUIStore.getState().alerts.find((alert) => alert.id.startsWith('restart-rm-lang'))!;
};

describe('MachineInspector notices follow the language', () => {
  it('reads a restart notice in pt-BR after a switch', async () => {
    const notice = await restart(mill(10));
    expect(alertText(notice).title).toBe('Machine Restarted');

    setLocale('pt-BR');
    expect(alertText(notice)).toEqual({
      title: 'Máquina reiniciada',
      message: 'RM-LANG: reinício concluído com sucesso.',
    });
  });

  it('reads a still-worn restart notice in pt-BR, decimal comma included', async () => {
    const notice = await restart(mill(62.3, 'warning'));
    expect(alertText(notice).message).toMatch(/wear is still 62\.3% \(it warns from 60%\)/);

    setLocale('pt-BR');
    const text = alertText(notice);
    expect(text.title).toBe('Reiniciada, ainda desgastada');
    expect(text.message).toMatch(/o desgaste continua em 62,3% \(o alerta começa em 60%\)/);
  });

  it('reads an incident-held restart notice in pt-BR', async () => {
    useOperationsCampaignStore.setState({
      incidents: [
        {
          ...(savedIncidents[0] ?? {}),
          id: 'incident-dust',
          kind: 'dust_filter_pressure',
          affectedMachineId: 'rm-lang',
          phase: 'raised',
        } as (typeof savedIncidents)[number],
      ],
    });
    const notice = await restart(mill(10, 'warning'));
    expect(alertText(notice).title).toBe('Restarted, Still Warning');

    setLocale('pt-BR');
    expect(alertText(notice).title).toBe('Reiniciada, ainda em alerta');
  });

  it('reads a no-spare-parts notice in pt-BR', () => {
    useBreakdownStore.setState({
      partsInventory: { bearings: 0, belts: 0, filters: 0, motors: 0, sensors: 0 },
    });
    const machine = mill(62.3, 'warning');
    useProductionStore.setState({ machines: [machine] });
    render(<MachineInspector machine={machine} />);
    fireEvent.click(screen.getByRole('button', { name: 'Perform Maintenance' }));
    const notice = useUIStore
      .getState()
      .alerts.find((alert) => alert.id.startsWith('maintenance-noparts-rm-lang'))!;
    expect(alertText(notice).title).toBe('No Spare Parts');

    setLocale('pt-BR');
    expect(alertText(notice)).toEqual({
      title: 'Sem peças de reposição',
      message:
        'Não é possível fazer manutenção em RM-LANG: o estoque de peças está vazio. Aguarde uma entrega de peças.',
    });
  });
});
