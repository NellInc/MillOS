/**
 * SCADA's Total Power tag and the Energy dashboard's headline describe the same
 * thing, the site's electrical demand, and the dashboard's is the figure the
 * campaign bills. The tag was a synthetic 800 kW scaled by a fixed 65% load:
 * ~870 kW on a plant drawing a few hundred, the same with every machine idle,
 * and the same during an emergency stop. Working if the tag reads the
 * dashboard's figure.
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { currentOperationalTelemetry } from './store';
import { EnergyDashboard } from './components/ui/EnergyDashboard';
import { useAIConfigStore } from './stores/aiConfigStore';
import { useGameSimulationStore } from './stores/gameSimulationStore';
import { useMaterialFlowStore } from './stores/materialFlowStore';
import {
  useOperationsCampaignStore,
  type OperationalIncident,
} from './stores/operationsCampaignStore';
import { useProductionStore } from './stores/productionStore';
import { MachineType, type MachineData } from './types';

const TOTAL_POWER = 'UTILITY.PT002.PV';

const machine = (
  id: string,
  type: MachineType,
  status: MachineData['status'],
  load = 80
): MachineData => ({
  id,
  name: id,
  type,
  position: [0, 0, 0],
  size: [1, 1, 1],
  rotation: 0,
  status,
  metrics: { rpm: 1200, temperature: 50, vibration: 1.5, load, wear: 0, efficiency: 100 },
  lastMaintenance: '2026-09-01',
  nextMaintenance: '2026-10-01',
});

const powerSag: OperationalIncident = {
  id: 'incident-power-sag',
  kind: 'power_sag',
  title: 'Power sag',
  description: 'Grid voltage dip',
  phase: 'raised',
  severity: 'medium',
  startedAtMinute: 0,
  acknowledgedAtMinute: null,
  resolvedAtMinute: null,
  affectedMachineId: null,
  effectApplied: true,
};

const headlineKw = (label: string) =>
  Number(
    (screen.getByText(label).previousElementSibling?.textContent ?? '')
      .replace(/kW/, '')
      .replace(/,/g, '')
      .trim()
  );

describe('SCADA Total Power', () => {
  const saved = {
    machines: useProductionStore.getState().machines,
    gameTime: useGameSimulationStore.getState().gameTime,
    emergencyActive: useGameSimulationStore.getState().emergencyActive,
    incidents: useOperationsCampaignStore.getState().incidents,
    show: useAIConfigStore.getState().showEnergyDashboard,
  };
  beforeEach(() => {
    useMaterialFlowStore.getState().resetMaterialFlow();
    useAIConfigStore.setState({ showEnergyDashboard: true });
    useGameSimulationStore.setState({ gameTime: 12, emergencyActive: false });
    useOperationsCampaignStore.setState({ incidents: [powerSag] });
    useProductionStore.setState({
      machines: [
        machine('rm-101', MachineType.ROLLER_MILL, 'running'),
        machine('rm-102', MachineType.ROLLER_MILL, 'warning'),
        machine('sifter-a', MachineType.PLANSIFTER, 'running'),
        machine('packer-0', MachineType.PACKER, 'idle'),
      ],
    });
  });
  afterEach(() => {
    cleanup();
    useProductionStore.setState({ machines: saved.machines });
    useGameSimulationStore.setState({
      gameTime: saved.gameTime,
      emergencyActive: saved.emergencyActive,
    });
    useOperationsCampaignStore.setState({ incidents: saved.incidents });
    useAIConfigStore.setState({ showEnergyDashboard: saved.show });
  });

  it('reads the demand the Energy dashboard shows and the campaign bills', () => {
    render(<EnergyDashboard />);
    const shown = headlineKw('Current demand');
    expect(shown).toBeGreaterThan(0);
    expect(currentOperationalTelemetry()[TOTAL_POWER]).toBeCloseTo(shown, 1);

    // Every machine stopped: the demand falls on both surfaces alike.
    act(() =>
      useProductionStore.setState({
        machines: useProductionStore
          .getState()
          .machines.map((m) => ({ ...m, status: 'idle' as const })),
      })
    );
    const idle = headlineKw('Current demand');
    expect(idle).toBeLessThan(shown);
    expect(currentOperationalTelemetry()[TOTAL_POWER]).toBeCloseTo(idle, 1);

    // An emergency drops the site to emergency-mode load.
    act(() => useGameSimulationStore.setState({ emergencyActive: true }));
    expect(currentOperationalTelemetry()[TOTAL_POWER]).toBeCloseTo(
      headlineKw('Emergency demand'),
      1
    );
  });
});
