import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./BuildCacheDiagnostics', () => ({ BuildCacheDiagnostics: () => null }));

import { SettingsPanel } from './SettingsPanel';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';

const originalLocation = window.location;

describe('SettingsPanel Reset Simulation with blocked site storage', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
    useGameSimulationStore.getState().resetGameState();
  });

  // Site data blocked: reading window.localStorage throws SecurityError. The
  // sweep threw out of the click, so "Reset Everything" paused the plant,
  // stopped every save and then did nothing, leaving its dialog open.
  // Working if the reset still reloads into a fresh boot.
  it('still reloads when reading localStorage throws', async () => {
    const reload = vi.fn();
    Object.defineProperty(window, 'location', { configurable: true, value: { reload } });
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<SettingsPanel productionSpeed={1} setProductionSpeed={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset Simulation' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reset Everything' }));
    // The reload follows the bounded SCADA history clear.
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });
});
