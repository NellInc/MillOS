import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HudResult } from './HudResult';
import { StatusHUD } from './StatusHUD';
import { useGameSimulationStore, type CelebrationEvent } from '../../../stores/gameSimulationStore';
import { useSafetyStore } from '../../../stores/safetyStore';
import { useUIStore } from '../../../stores/uiStore';
import { setLocale } from '../../../i18n';

vi.mock('../../../utils/audioManager', () => ({
  audioManager: { muted: true, playCycleBell: vi.fn() },
}));

// The result of a fulfilled order was cut to "Achievemen..." in English and
// "T." in Portuguese in the HUD row at 1280 px: the player never read the win.
// It now has its own line under the row, wrapped, never truncated, and below
// an emergency banner when one shows. Working if the whole sentence is there.

const fulfilled: CelebrationEvent = {
  type: 'order_fulfilled',
  customer: "Riverside Bakers' Cooperative",
  value: 6000,
  lateMinutes: 0,
  timestamp: 1,
};

function raise(event: CelebrationEvent) {
  act(() =>
    useGameSimulationStore.setState((state) => ({
      celebrations: { ...state.celebrations, milestoneQueue: [event] },
    }))
  );
}

beforeEach(() => {
  setLocale('en');
  useGameSimulationStore.getState().resetGameState();
  useSafetyStore.setState({ forkliftEmergencyStop: false });
  useUIStore.setState({ alerts: [] });
});
afterEach(() => {
  cleanup();
  setLocale('en');
  useSafetyStore.setState({ forkliftEmergencyStop: false });
  useGameSimulationStore.getState().resetGameState();
});

describe('the result line on the desktop HUD', () => {
  it('shows the whole result on its own line under the row, wrapped', () => {
    render(
      <>
        <StatusHUD />
        <HudResult />
      </>
    );
    raise(fulfilled);
    const chip = screen.getByTestId('hud-result');
    expect(chip).toHaveTextContent("Riverside Bakers' Cooperative: 6,000 kg, on time");
    expect(screen.getByRole('banner').contains(chip)).toBe(false);
    const words = chip.querySelector('span')!;
    expect(words.className).not.toMatch(/\btruncate\b/);
    expect(chip.parentElement!.className).toMatch(/\btop-14\b/);
  });

  it('reads whole in Portuguese', () => {
    setLocale('pt-BR');
    render(<HudResult />);
    raise(fulfilled);
    const chip = screen.getByTestId('hud-result');
    expect(chip.textContent).toMatch(/Riverside Bakers' Cooperative/);
    expect(chip.querySelector('span')!.className).not.toMatch(/\btruncate\b/);
  });

  it('sits below an emergency banner', () => {
    useSafetyStore.setState({ forkliftEmergencyStop: true });
    render(<HudResult />);
    raise(fulfilled);
    expect(screen.getByTestId('hud-result').parentElement!.className).toMatch(/top-\[6\.75rem\]/);
  });
});

describe('the result line on the phone', () => {
  // Under the bell it sat behind the music player (top 4rem, z-40).
  it('sits below the music player', () => {
    render(<HudResult compact />);
    raise(fulfilled);
    const line = screen.getByTestId('hud-result').parentElement!;
    expect(line.className).toMatch(/\+7\.25rem/);
  });
});
