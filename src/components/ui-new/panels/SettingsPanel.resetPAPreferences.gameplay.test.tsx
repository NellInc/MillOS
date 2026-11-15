import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./BuildCacheDiagnostics', () => ({ BuildCacheDiagnostics: () => null }));

import { SettingsPanel } from './SettingsPanel';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';

const PA_KEY = 'millos-pa';
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

const savedPA = (state: Record<string, unknown>) =>
  localStorage.setItem(PA_KEY, JSON.stringify({ state, version: 1 }));

// D-070: the PA's captions switch, voice switch, chosen voices and On or Off
// mode are the person's preferences, like sound and language, so Reset
// Simulation carries them across its millos-* sweep. The transcript is
// simulation history and goes.
// Working if a reset keeps those four and nothing else from millos-pa.
describe('Reset Simulation with the PA preferences carried across', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
    useGameSimulationStore.getState().resetGameState();
  });

  it('keeps captions, voice, chosen voices and PA mode, and clears the transcript', async () => {
    savedPA({
      announcements: [
        {
          id: 'ann-1',
          type: 'emergency',
          message: 'Facility stop engaged.',
          timestamp: '2026-11-13T08:00:00.000Z',
          dismissed: true,
          priority: 4,
          channel: 'safety',
        },
      ],
      mode: 'off',
      captionsEnabled: false,
      voiceEnabled: false,
      voiceNames: { en: 'Edwin', 'pt-BR': 'Marcelo' },
    });
    localStorage.setItem('millos-physical-session', '{"saved":true}');
    await resetEverything();
    expect(localStorage.getItem('millos-physical-session')).toBeNull();
    expect(JSON.parse(localStorage.getItem(PA_KEY) ?? 'null')).toEqual({
      state: {
        mode: 'off',
        captionsEnabled: false,
        voiceEnabled: false,
        voiceNames: { en: 'Edwin', 'pt-BR': 'Marcelo' },
      },
      version: 1,
    });
  });

  it('carries only what the store would restore', async () => {
    savedPA({
      mode: 'characterful',
      captionsEnabled: 'yes',
      voiceEnabled: true,
      voiceNames: { en: 'Nobody', 'pt-BR': 'Débora' },
    });
    await resetEverything();
    // A saved 'characterful' reads as On; a non-boolean switch falls back to
    // the default; a voice the catalogue lacks is dropped.
    expect(JSON.parse(localStorage.getItem(PA_KEY) ?? 'null')).toEqual({
      state: {
        mode: 'focused',
        captionsEnabled: true,
        voiceEnabled: true,
        voiceNames: { 'pt-BR': 'Débora' },
      },
      version: 1,
    });
  });

  it('still clears the saved shift when millos-pa cannot be parsed', async () => {
    localStorage.setItem(PA_KEY, '{"state":{"captionsEnabled":false');
    localStorage.setItem('millos-physical-session', '{"saved":true}');
    await resetEverything();
    expect(localStorage.getItem('millos-physical-session')).toBeNull();
    expect(localStorage.getItem(PA_KEY)).toBeNull();
  });

  it('writes no PA record when none was saved', async () => {
    localStorage.setItem('millos-physical-session', '{"saved":true}');
    await resetEverything();
    expect(localStorage.getItem('millos-physical-session')).toBeNull();
    expect(localStorage.getItem(PA_KEY)).toBeNull();
  });
});
