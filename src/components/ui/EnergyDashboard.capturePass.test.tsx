import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { EnergyDashboard } from './EnergyDashboard';
import { useAIConfigStore } from '../../stores/aiConfigStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { setLocale } from '../../i18n';

// The capture pass: the energy dashboard covered the soundtrack bar, its
// bottom tiles went under the dock in Portuguese and its title wrapped; and
// captions sat under its values to explain them (D-012). Working if it sits
// clear of the left column, scrolls inside itself, and carries no caption.

const CAPTIONS_EN = [
  'Inefficient operation',
  'Wear past service point',
  'Wear past warning level',
  'Fed: 70-100% of base energy; unfed: standby',
  '8 kW day to 35 kW night',
  '20 to 30 to 45 to 35 kW curve',
  'Security, IT, fire systems',
];
const CAPTIONS_PT = [
  'Operação ineficiente',
  'Desgaste acima do ponto de serviço',
  'Alimentado: 70-100% da energia base; sem alimentação: espera',
];

describe('the energy dashboard after the capture pass', () => {
  const originalShow = useAIConfigStore.getState().showEnergyDashboard;
  beforeEach(() => {
    setLocale('en');
    useAIConfigStore.setState({ showEnergyDashboard: true });
    useGameSimulationStore.setState({ gameTime: 12, emergencyActive: false });
  });
  afterEach(() => {
    cleanup();
    setLocale('en');
    useAIConfigStore.setState({ showEnergyDashboard: originalShow });
  });

  it('carries no explanatory caption under a value', () => {
    render(<EnergyDashboard />);
    for (const caption of CAPTIONS_EN) expect(screen.queryByText(caption)).toBeNull();
    act(() => setLocale('pt-BR'));
    for (const caption of CAPTIONS_PT) expect(screen.queryByText(caption)).toBeNull();
  });

  it('keeps the headline label for screen readers only', () => {
    render(<EnergyDashboard />);
    expect(screen.getByText('Current demand').className).toMatch(/\bsr-only\b/);
  });

  it('sits right of the left column, above the dock, and scrolls in itself', () => {
    render(<EnergyDashboard />);
    const region = screen.getByRole('region', { name: 'Energy dashboard' });
    expect(region.className).toMatch(/lg:left-\[22rem\]/);
    expect(region.className).toMatch(/lg:top-28/);
    expect(region.className).toMatch(/lg:max-h-\[calc\(100dvh-14\.5rem\)\]/);
    expect(region.className).toMatch(/overflow-y-auto/);
  });

  it('keeps its title on one line', () => {
    setLocale('pt-BR');
    render(<EnergyDashboard />);
    expect(screen.getByText('Painel de energia').className).toMatch(/whitespace-nowrap/);
  });
});
