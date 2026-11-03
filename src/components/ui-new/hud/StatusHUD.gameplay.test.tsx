import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StatusHUD } from './StatusHUD';
import { useUIStore } from '../../../stores/uiStore';
import type { AlertData } from '../../../types';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { STANDARD_GAME_SPEED } from '../../../simulation/pace';
import { setLocale } from '../../../i18n';

const alert = (id: string, title: string): AlertData => ({
  id,
  type: 'warning',
  title,
  message: `${title} message`,
  timestamp: new Date(),
  acknowledged: false,
});

/** The focus hand-off runs on the next frame. */
const flushFrame = () =>
  act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
  });

describe('StatusHUD notifications under the keyboard', () => {
  beforeEach(() => {
    useUIStore.setState({ alerts: [alert('a', 'First'), alert('b', 'Second')] });
  });

  it('leaves Escape to a modal dialog opened over the open notifications', () => {
    render(
      <>
        <StatusHUD />
        <div role="dialog" aria-modal="true" aria-label="Reset Simulation">
          <button type="button">Cancel</button>
        </div>
      </>
    );
    fireEvent.click(screen.getByRole('button', { name: /^Notifications/ }));
    const modalEscape = vi.fn();
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    cancel.addEventListener('keydown', modalEscape);
    cancel.focus();
    fireEvent.keyDown(cancel, { key: 'Escape' });
    expect(modalEscape).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog', { name: 'Notifications' })).toBeInTheDocument();
  });

  it('leaves Escape to a text field, which clears its own text', () => {
    render(
      <>
        <StatusHUD />
        <input type="search" aria-label="Search transcript" />
      </>
    );
    fireEvent.click(screen.getByRole('button', { name: /^Notifications/ }));
    const field = screen.getByRole('searchbox', { name: 'Search transcript' });
    field.focus();
    const event = fireEvent.keyDown(field, { key: 'Escape' });
    expect(event).toBe(true);
    expect(screen.getByRole('dialog', { name: 'Notifications' })).toBeInTheDocument();
  });

  it('keeps focus in the list when Acknowledge or Dismiss removes the focused button', async () => {
    render(<StatusHUD />);
    fireEvent.click(screen.getByRole('button', { name: /^Notifications/ }));
    // Opening hands focus to Close on the next frame; let that land first.
    await flushFrame();
    const acknowledge = screen.getByRole('button', { name: 'Acknowledge First' });
    acknowledge.focus();
    fireEvent.click(acknowledge);
    await flushFrame();
    expect(screen.getByRole('button', { name: 'Dismiss First' })).toHaveFocus();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss First' }));
    await flushFrame();
    expect(screen.getByRole('button', { name: 'Acknowledge Second' })).toHaveFocus();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss Second' }));
    await flushFrame();
    expect(screen.getByRole('button', { name: 'Close notifications' })).toHaveFocus();
  });
});

// PLAYTEST-3: once the P notice fades and the delivery card has gone, the HUD
// is the one surface left that can say the plant is paused, and by whom.
describe('StatusHUD paused state', () => {
  beforeEach(() => {
    setLocale('en');
    useUIStore.setState({ alerts: [] });
    useGameSimulationStore.setState({ gameSpeed: STANDARD_GAME_SPEED, clockHolds: [] });
  });
  afterEach(() => setLocale('en'));

  it('shows nothing while the clock runs', () => {
    render(<StatusHUD />);
    expect(screen.queryByText('Paused')).not.toBeInTheDocument();
  });

  it('shows a player pause and names how to resume it', () => {
    useGameSimulationStore.getState().setGameSpeed(0);
    render(<StatusHUD />);
    expect(screen.getByText('Paused')).toBeInTheDocument();
    expect(
      screen.getByLabelText('Paused. Press P or choose a pace to resume.')
    ).toBeInTheDocument();
  });

  it('names another holder, follows the clock, and speaks pt-BR', () => {
    render(<StatusHUD />);
    act(() => useGameSimulationStore.getState().holdClock('tour'));
    expect(screen.getByText('Paused for the tour')).toBeInTheDocument();
    expect(
      screen.getByLabelText('Paused for the tour. It resumes when the tour closes.')
    ).toBeInTheDocument();
    act(() => setLocale('pt-BR'));
    expect(screen.getByText('Pausado para o tour')).toBeInTheDocument();
    act(() => useGameSimulationStore.getState().releaseClock('tour'));
    expect(screen.queryByText('Pausado para o tour')).not.toBeInTheDocument();
  });
});
