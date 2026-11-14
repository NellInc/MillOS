import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MultiObjectiveDashboard } from './MultiObjectiveDashboard';
import { useAIConfigStore } from '../../stores/aiConfigStore';
import { useProductionStore } from '../../stores/productionStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { setLocale } from '../../i18n';
import { MachineType, type MachineData } from '../../types';

// The capture pass: at 1280x720 the dashboard covered the production tracker
// and the soundtrack bar, and said "All objectives balanced optimally." beside
// 354 kW against a 250 kW target. Working if it sits clear of the left column
// and scrolls in itself, and its summary names what is off target.

const rollerMills = (load: number): MachineData[] =>
  [101, 102, 103, 104, 105, 106, 107, 108].map((n) => ({
    id: `rm-${n}`,
    name: `rm-${n}`,
    type: MachineType.ROLLER_MILL,
    position: [0, 0, 0],
    size: [1, 1, 1],
    rotation: 0,
    status: 'running',
    metrics: { rpm: 0, temperature: 40, vibration: 1, load, wear: 10, efficiency: 95 },
    lastMaintenance: '',
    nextMaintenance: '',
  }));

describe('the multi-objective dashboard after the capture pass', () => {
  const original = useProductionStore.getState();
  const originalShow = useAIConfigStore.getState();
  const originalTime = useGameSimulationStore.getState().gameTime;

  beforeEach(() => {
    setLocale('en');
    useOperationsCampaignStore.getState().resetCampaign();
    useAIConfigStore.setState({ showMultiObjective: true, showEnergyDashboard: false });
    useGameSimulationStore.setState({ gameTime: 12, emergencyActive: false });
  });
  afterEach(() => {
    cleanup();
    setLocale('en');
    useAIConfigStore.setState({
      showMultiObjective: originalShow.showMultiObjective,
      showEnergyDashboard: originalShow.showEnergyDashboard,
    });
    useProductionStore.setState({ machines: original.machines, metrics: original.metrics });
    useGameSimulationStore.setState({ gameTime: originalTime });
  });

  // Plan 7.9: energy is off target when the bill's overdrive penalty applies,
  // not against a 250 kW figure no rule read; carbon is gone.
  it('names energy when the line runs above 100%, the rate the bill penalises', () => {
    useProductionStore.setState({
      machines: rollerMills(100),
      metrics: { ...original.metrics, quality: 99 },
      productionSpeed: 1.2,
    });
    render(<MultiObjectiveDashboard />);
    expect(screen.queryByText(/balanced/)).toBeNull();
    expect(screen.getByText('Off target: Energy.')).toBeInTheDocument();
    expect(screen.queryByText('Carbon')).toBeNull();
    act(() => setLocale('pt-BR'));
    expect(screen.getByText('Fora da meta: Energia.')).toBeInTheDocument();
    useProductionStore.setState({ productionSpeed: original.productionSpeed });
  });

  it('reads a plant drawing its rated power at 100% as on target', () => {
    useProductionStore.setState({
      machines: rollerMills(100),
      metrics: { ...original.metrics, quality: 99 },
      productionSpeed: 1,
    });
    render(<MultiObjectiveDashboard />);
    expect(screen.getByText('All objectives on target.')).toBeInTheDocument();
    expect(screen.getByText('Order minimum: 95')).toBeInTheDocument();
    useProductionStore.setState({ productionSpeed: original.productionSpeed });
  });

  it('names quality below its target', () => {
    useProductionStore.setState({ machines: [], metrics: { ...original.metrics, quality: 93 } });
    render(<MultiObjectiveDashboard />);
    expect(screen.getByText('Off target: Quality.')).toBeInTheDocument();
  });

  it('says every objective is on target only when every figure is', () => {
    useProductionStore.setState({ machines: [], metrics: { ...original.metrics, quality: 99 } });
    render(<MultiObjectiveDashboard />);
    expect(screen.getByText('All objectives on target.')).toBeInTheDocument();
  });

  it('sits right of the left column at desktop width and scrolls in itself', () => {
    render(<MultiObjectiveDashboard />);
    const region = screen.getByRole('region', { name: 'Multi-objective dashboard' });
    expect(region.className).toMatch(/lg:left-\[22rem\]/);
    expect(region.className).toMatch(/lg:top-28/);
    expect(region.className).toMatch(/overflow-y-auto/);
    expect(region.className).toMatch(/max-h-/);
  });

  it('steps right of the energy dashboard when both are open', () => {
    useAIConfigStore.setState({ showEnergyDashboard: true });
    render(<MultiObjectiveDashboard />);
    const region = screen.getByRole('region', { name: 'Multi-objective dashboard' });
    expect(region.className).toMatch(/lg:left-\[43\.5rem\]/);
  });
});
