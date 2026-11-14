import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MultiObjectiveDashboard } from './MultiObjectiveDashboard';
import { useAIConfigStore } from '../../stores/aiConfigStore';
import { useProductionStore } from '../../stores/productionStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { useChronicleStore } from '../../stores/chronicleStore';
import { getSiteDemandKw } from '../../utils/energyCalculations';
import { formatGrouped } from '../../i18n';
import { MachineType, type MachineData } from '../../types';

// The plant MillScene builds: five silos, four roller mills, three sifters and
// three packing lines.
const PLANT: Array<[string, MachineType]> = [
  ...[0, 1, 2, 3, 4].map((i): [string, MachineType] => [`silo-${i}`, MachineType.SILO]),
  ...[101, 102, 103, 104].map((i): [string, MachineType] => [`rm-${i}`, MachineType.ROLLER_MILL]),
  ...['a', 'b', 'c'].map((i): [string, MachineType] => [`sifter-${i}`, MachineType.PLANSIFTER]),
  ...[0, 1, 2].map((i): [string, MachineType] => [`packer-${i}`, MachineType.PACKER]),
];
const plant = (status: MachineData['status'], load: number): MachineData[] =>
  PLANT.map(([id, type]) => ({
    id,
    name: id,
    type,
    position: [0, 0, 0],
    size: [1, 1, 1],
    rotation: 0,
    status,
    metrics: { rpm: 0, temperature: 40, vibration: 1, load, wear: 10, efficiency: 95 },
    lastMaintenance: '',
    nextMaintenance: '',
  }));

// The Energy dashboard (U) and this one (Y) can be open together. Each showed
// its own kW and kg CO2/h for the same plant: this one summed a private table
// of running machines only, without the facility load, the standby draw, or
// the incident and Chronicle multipliers the campaign bills at.
describe('the multi-objective energy and carbon objectives', () => {
  const original = useProductionStore.getState();
  const originalShow = useAIConfigStore.getState().showMultiObjective;
  const originalGame = useGameSimulationStore.getState();

  beforeEach(() => {
    useAIConfigStore.setState({ showMultiObjective: true });
    useGameSimulationStore.setState({ gameTime: 12, gameSpeed: 1, emergencyActive: false });
  });
  afterEach(() => {
    cleanup();
    useAIConfigStore.setState({ showMultiObjective: originalShow });
    useProductionStore.setState({
      machines: original.machines,
      metrics: original.metrics,
      dailyBagsProduced: original.dailyBagsProduced,
    });
    useGameSimulationStore.setState({
      gameTime: originalGame.gameTime,
      gameSpeed: originalGame.gameSpeed,
      emergencyActive: originalGame.emergencyActive,
    });
  });

  const billedKw = () => {
    const game = useGameSimulationStore.getState();
    const campaign = useOperationsCampaignStore.getState();
    const wheat = campaign.getActiveProductionPlan()?.sourceMaterial === 'wheat_grain';
    return (
      getSiteDemandKw(useProductionStore.getState().machines, game.gameTime, game.emergencyActive) *
      campaign.getIncidentEffect().energyMultiplier *
      useChronicleStore.getState().getEffect(wheat).energyMultiplier
    );
  };
  const card = (label: string) => screen.getByText(label).parentElement as HTMLElement;

  it('shows the site demand the Energy dashboard shows and the campaign bills', () => {
    // The plant running at 60%, one mill tripped to standby and one sifter alarmed.
    const machines = plant('running', 60).map((machine) =>
      machine.id === 'rm-101'
        ? { ...machine, status: 'critical' as const }
        : machine.id === 'sifter-b'
          ? { ...machine, status: 'warning' as const }
          : machine
    );
    useProductionStore.setState({ machines });
    render(<MultiObjectiveDashboard />);
    const kw = billedKw();
    expect(card('Energy')).toHaveTextContent(`${formatGrouped(Math.round(kw * 10) / 10)}kW`);
    expect(screen.queryByText('Carbon')).toBeNull();
  });

  // Plan 7.9: the summary follows the rules the bill applies. A well-run plant
  // at 100% is on target however many kW it draws; above 100% the overdrive
  // penalty applies, and the summary says so.
  it('reads a well-run, fully running plant at 100% as on target', () => {
    useProductionStore.setState({
      machines: plant('running', 75),
      metrics: { ...original.metrics, throughput: 300, quality: 99 },
      dailyBagsProduced: 0,
      productionSpeed: 1,
    });
    useGameSimulationStore.setState({ gameTime: 13 });
    render(<MultiObjectiveDashboard />);
    expect(screen.getByText('All objectives on target.')).toBeInTheDocument();
  });

  it('names energy once the line runs above 100%', () => {
    useProductionStore.setState({
      machines: plant('warning', 100),
      metrics: { ...original.metrics, throughput: 300, quality: 99 },
      dailyBagsProduced: 0,
      productionSpeed: 1.4,
    });
    useGameSimulationStore.setState({ gameTime: 20 });
    render(<MultiObjectiveDashboard />);
    expect(screen.getByText(/^Off target: .*Energy\.$/)).toBeInTheDocument();
    useProductionStore.setState({ productionSpeed: 1 });
  });
});
