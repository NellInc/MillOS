import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./BuildCacheDiagnostics', () => ({ BuildCacheDiagnostics: () => null }));

import { SettingsPanel } from './SettingsPanel';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { AUDIO_SETTINGS_KEY } from '../../../utils/audioManager';
import { LOCALE_STORAGE_KEY } from '../../../i18n';

const renderPanel = () =>
  render(<SettingsPanel productionSpeed={1} setProductionSpeed={() => {}} />);

describe('SettingsPanel simulation resets', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    useGameSimulationStore.getState().resetGameState();
  });

  it('Reset to 10 AM keeps the chosen pace and says customer orders keep their clock', () => {
    useGameSimulationStore.setState({ gameTime: 16, gameSpeed: 0 });
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Reset to 10 AM' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent(/customer orders and their deadlines/i);
    expect(dialog).toHaveTextContent(/Reset Simulation/);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reset to 10 AM' }));
    expect(useGameSimulationStore.getState().gameTime).toBe(10);
    expect(useGameSimulationStore.getState().gameSpeed).toBe(0);
  });

  // Runs last: Reset Simulation suspends persistence for the rest of the page.
  it('Reset Simulation clears saved progress but keeps sound and language preferences', () => {
    localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify({ version: 2, muted: true }));
    localStorage.setItem(LOCALE_STORAGE_KEY, 'pt-BR');
    localStorage.setItem('millos-autonomous-operations', '{}');
    localStorage.setItem('millos-physical-session', '{}');
    localStorage.setItem('millos-gpu-settings', '{}');
    localStorage.setItem('unrelated-site-key', 'kept');
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Reset Simulation' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent(/sound and language settings are kept/i);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reset Everything' }));
    expect(localStorage.getItem(AUDIO_SETTINGS_KEY)).toContain('"muted":true');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('pt-BR');
    expect(localStorage.getItem('millos-autonomous-operations')).toBeNull();
    expect(localStorage.getItem('millos-physical-session')).toBeNull();
    expect(localStorage.getItem('millos-gpu-settings')).toBeNull();
    expect(localStorage.getItem('unrelated-site-key')).toBe('kept');
  });
});
