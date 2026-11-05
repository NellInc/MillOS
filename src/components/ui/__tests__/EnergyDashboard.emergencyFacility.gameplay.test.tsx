import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useAIConfigStore } from '../../../stores/aiConfigStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useProductionStore } from '../../../stores/productionStore';
import { EnergyDashboard } from '../EnergyDashboard';

const kw = (label: string): number => {
  const row = screen.getByText(label).closest('div.flex.items-center.justify-between');
  const value = row?.querySelector('span.font-mono')?.textContent ?? '';
  return Number.parseFloat(value);
};
const headline = (): number =>
  Number.parseFloat(screen.getByText('Emergency demand').previousElementSibling?.textContent ?? '');
const bannerKw = (label: string): number =>
  Number.parseFloat(screen.getByText(label).previousElementSibling?.textContent ?? '');

/**
 * During a facility emergency the headline bills emergency facility load only
 * (getSiteDemandKw), and the Machine Demand rows read 0 to match. The Facility
 * Base Load rows still listed the full lighting, HVAC and other load (70 kW at
 * night under a 46 kW headline), and the emergency total was rounded, so its
 * own banner parts (10.5 + 10 + 25) did not make the headline either.
 * Working if, in an emergency, the facility rows and the banner each add up to
 * the demand the headline bills.
 */
describe('EnergyDashboard: emergency facility rows add up to the billed headline', () => {
  const saved = {
    machines: useProductionStore.getState().machines,
    gameTime: useGameSimulationStore.getState().gameTime,
    emergencyActive: useGameSimulationStore.getState().emergencyActive,
    incidents: useOperationsCampaignStore.getState().incidents,
    show: useAIConfigStore.getState().showEnergyDashboard,
  };

  beforeEach(() => {
    useAIConfigStore.setState({ showEnergyDashboard: true });
    useProductionStore.setState({ machines: [] });
    useOperationsCampaignStore.setState({ incidents: [] });
    useGameSimulationStore.setState({ gameTime: 23, emergencyActive: true });
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

  it('lists the emergency facility load the headline bills, at night', () => {
    render(<EnergyDashboard />);
    expect(kw('Lighting')).toBeCloseTo(10.5, 5);
    expect(kw('HVAC')).toBeCloseTo(10, 5);
    expect(kw('Other')).toBeCloseTo(25, 5);
    expect(kw('Lighting') + kw('HVAC') + kw('Other')).toBeCloseTo(headline(), 5);
    expect(
      bannerKw('Lighting (30%)') + bannerKw('HVAC (50%)') + bannerKw('Base Systems')
    ).toBeCloseTo(headline(), 5);
  });

  it('lists the full facility load again once the emergency ends', () => {
    useGameSimulationStore.setState({ emergencyActive: false });
    render(<EnergyDashboard />);
    expect(kw('Lighting') + kw('HVAC') + kw('Other')).toBeCloseTo(70, 5);
  });
});
