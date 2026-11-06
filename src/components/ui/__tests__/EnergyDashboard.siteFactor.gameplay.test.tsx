import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useAIConfigStore } from '../../../stores/aiConfigStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import {
  useOperationsCampaignStore,
  type OperationalIncident,
} from '../../../stores/operationsCampaignStore';
import { useProductionStore } from '../../../stores/productionStore';
import { EnergyDashboard } from '../EnergyDashboard';

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

const kw = (label: string): number => {
  const row = screen.getByText(label).closest('div.flex.items-center.justify-between');
  const value = row?.querySelector('span.font-mono')?.textContent ?? '';
  return Number.parseFloat(value);
};
const headline = (): number =>
  Number.parseFloat(screen.getByText('Current demand').previousElementSibling?.textContent ?? '');

/**
 * The headline bills the site at the incident and Chronicle energy factor, but
 * the parts listed below it are the unfactored demand. During a power sag the
 * facility rows read 68 kW under a 47.6 kW headline, with nothing on the panel
 * saying why. Working if the panel names the factor whenever it is not 1, so
 * its parts times that factor make the headline.
 */
describe('EnergyDashboard: the parts reconcile with the billed headline', () => {
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
    useGameSimulationStore.setState({ emergencyActive: false, gameTime: 12 });
    useOperationsCampaignStore.setState({ incidents: [] });
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

  it('names the site factor during a power sag, so the parts times it make the headline', () => {
    useOperationsCampaignStore.setState({ incidents: [powerSag] });
    render(<EnergyDashboard />);
    const parts = kw('Lighting') + kw('HVAC') + kw('Other');
    expect(parts).toBeCloseTo(68, 5);
    expect(headline()).toBeCloseTo(47.6, 5);
    const factor = screen.getByText('Site conditions').closest('div.rounded-lg');
    expect(factor?.textContent).toContain('×0.70');
    expect(parts * 0.7).toBeCloseTo(headline(), 5);
  });

  it('shows no site factor while the site is billed at its plain demand', () => {
    render(<EnergyDashboard />);
    expect(screen.queryByText('Site conditions')).toBeNull();
    expect(headline()).toBeCloseTo(kw('Lighting') + kw('HVAC') + kw('Other'), 5);
  });
});
