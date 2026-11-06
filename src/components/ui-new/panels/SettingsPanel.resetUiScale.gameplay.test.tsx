import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./BuildCacheDiagnostics', () => ({ BuildCacheDiagnostics: () => null }));

import { SettingsPanel } from './SettingsPanel';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { UI_STORAGE_KEY } from '../../../stores/uiStore';

const originalLocation = window.location;

const resetEverything = async () => {
  const reload = vi.fn();
  Object.defineProperty(window, 'location', { configurable: true, value: { reload } });
  render(<SettingsPanel productionSpeed={1} setProductionSpeed={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Reset Simulation' }));
  const dialog = screen.getByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Reset Everything' }));
  await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
};

// Reset Simulation carries the interface scale across its millos-* sweep by
// reading it out of millos-ui first. That read shared one try with the sweep,
// so a millos-ui the app had already survived (unparseable, which the store's
// rehydration tolerates) threw before the sweep ran: the page reloaded with
// every saved shift still in place, and Reset Everything had done nothing.
// Working if an unreadable millos-ui costs only the scale, never the reset.
describe('Reset Simulation with the interface scale carried across', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
    useGameSimulationStore.getState().resetGameState();
  });

  it('still clears the saved shift when millos-ui cannot be parsed', async () => {
    localStorage.setItem(UI_STORAGE_KEY, '{"state":{"uiScale":1.2');
    localStorage.setItem('millos-physical-session', '{"saved":true}');
    localStorage.setItem('millos-autonomous-operations', '{}');
    await resetEverything();
    expect(localStorage.getItem('millos-physical-session')).toBeNull();
    expect(localStorage.getItem('millos-autonomous-operations')).toBeNull();
    expect(localStorage.getItem(UI_STORAGE_KEY)).toBeNull();
  });

  it('keeps a readable interface scale and nothing else from millos-ui', async () => {
    localStorage.setItem(
      UI_STORAGE_KEY,
      JSON.stringify({ state: { uiScale: 1.25, hasSeenIntro: true }, version: 2 })
    );
    localStorage.setItem('millos-physical-session', '{"saved":true}');
    await resetEverything();
    expect(localStorage.getItem('millos-physical-session')).toBeNull();
    expect(JSON.parse(localStorage.getItem(UI_STORAGE_KEY) ?? 'null')).toEqual({
      state: { uiScale: 1.25 },
      version: 2,
    });
  });
});
