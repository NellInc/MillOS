/**
 * The bill charges a working unit more above a 100% line rate (machineLoad
 * lineOverdrive). The SCADA energy feed and the two dashboards print the same
 * figure. Working if, at 160%, each reads the billed demand, which differs
 * from the figure at 100%.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { currentOperationalTelemetry } from '../store';
import { TOTAL_POWER_TAG_ID } from '../scada/tagDatabase';
import { useProductionStore } from '../stores/productionStore';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useOperationsCampaignStore } from '../stores/operationsCampaignStore';
import { useAIConfigStore } from '../stores/aiConfigStore';
import { MultiObjectiveDashboard } from '../components/ui/MultiObjectiveDashboard';
import { getMachineEnergyByType, getSiteDemandKw, lineEnergyFactor } from './energyCalculations';
import { formatGrouped, setLocale } from '../i18n';
import { MachineType, type MachineData } from '../types';

const PLANT: Array<[string, MachineType]> = [
  ...[101, 102, 103, 104].map((i): [string, MachineType] => [`rm-${i}`, MachineType.ROLLER_MILL]),
  ...['a', 'b', 'c'].map((i): [string, MachineType] => [`sifter-${i}`, MachineType.PLANSIFTER]),
  ...[0, 1, 2].map((i): [string, MachineType] => [`packer-${i}`, MachineType.PACKER]),
];
const plant = (): MachineData[] =>
  PLANT.map(([id, type]) => ({
    id,
    name: id,
    type,
    position: [0, 0, 0],
    size: [1, 1, 1],
    rotation: 0,
    status: 'running',
    metrics: { rpm: 0, temperature: 40, vibration: 1, load: 98, wear: 10, efficiency: 95 },
    lastMaintenance: '',
    nextMaintenance: '',
  }));

describe('the above-100% energy penalty on every energy display', () => {
  const original = useProductionStore.getState();
  beforeEach(() => {
    setLocale('en');
    useOperationsCampaignStore.getState().resetCampaign();
    useGameSimulationStore.setState({ gameTime: 12, emergencyActive: false });
    useProductionStore.setState({ machines: plant(), productionSpeed: 1.6 });
  });
  afterEach(() => {
    cleanup();
    useAIConfigStore.setState({ showMultiObjective: false });
    useProductionStore.setState({
      machines: original.machines,
      productionSpeed: original.productionSpeed,
    });
  });

  it('the SCADA energy feed bills the rate', () => {
    const machines = useProductionStore.getState().machines;
    const billed = getSiteDemandKw(machines, 12, false, 1.6);
    expect(billed).toBeGreaterThan(getSiteDemandKw(machines, 12, false, 1));
    expect(currentOperationalTelemetry()[TOTAL_POWER_TAG_ID]).toBeCloseTo(billed, 6);
  });

  it("the per-type rows sum to the site's machine demand at the rate", () => {
    const machines = useProductionStore.getState().machines;
    const rows = getMachineEnergyByType(machines, 1.6).reduce((n, row) => n + row.totalEnergy, 0);
    const facilityOnly = getSiteDemandKw([], 12, false, 1.6);
    expect(rows).toBeCloseTo(getSiteDemandKw(machines, 12, false, 1.6) - facilityOnly, 6);
    expect(lineEnergyFactor(1.6)).toBeCloseTo(1.9, 9);
  });

  it('the multi-objective energy card shows the billed demand and names the penalty', () => {
    useAIConfigStore.setState({ showMultiObjective: true });
    render(<MultiObjectiveDashboard />);
    const kw = getSiteDemandKw(useProductionStore.getState().machines, 12, false, 1.6);
    const card = screen.getByText('Energy').parentElement as HTMLElement;
    expect(card).toHaveTextContent(`${formatGrouped(Math.round(kw * 10) / 10)}kW`);
    expect(card).toHaveTextContent('Peak tariff £0.15/kWh');
    expect(card).toHaveTextContent('Rate 160%: ×1.90 power above 100%');
    expect(screen.getByText(/^Off target: .*Energy\.$/)).toBeInTheDocument();
  });
});
