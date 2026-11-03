import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MobilePanel } from './MobilePanel';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
vi.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: { div: 'div', aside: 'aside' },
}));

// PLAYTEST-6: the phone sheet's pace buttons are the same decision as the
// Overview buttons, by the same rule: a new running pace is logged, a pause or
// the pace already running is not.
describe('mobile pace buttons record the pace the player chose', () => {
  beforeEach(() => {
    useOperationsCampaignStore.getState().resetCampaign();
    useGameSimulationStore.setState({ gameSpeed: 30, clockHolds: [] });
  });
  afterEach(() => {
    cleanup();
    useGameSimulationStore.setState({ gameSpeed: 30, clockHolds: [] });
  });

  const operatorLines = () =>
    useOperationsCampaignStore
      .getState()
      .logbook.filter((entry) => entry.actor === 'operator')
      .map((entry) => entry.message);

  it('logs Fast, 2x and nothing for Standard or Pause', () => {
    render(<MobilePanel isVisible content="overview" onClose={vi.fn()} />);
    const group = screen.getAllByRole('group', { name: /pace/i })[0];
    fireEvent.click(within(group).getByRole('button', { name: 'Standard, 1x' }));
    fireEvent.click(within(group).getByRole('button', { name: 'Paused, inspect freely' }));
    expect(operatorLines()).toEqual([]);
    fireEvent.click(within(group).getByRole('button', { name: 'Fast, 2x' }));
    expect(useGameSimulationStore.getState().gameSpeed).toBe(60);
    expect(operatorLines()).toEqual(['Set the shift pace to Fast, 2x.']);
  });
});

// simulation.set-speed accepts any pace from 0 to 120. Below 0.1x the phone
// rounded to '0x' in running green beside a running clock; the desktop prints
// '<0.1x'. Working if both read the same.
describe('phone pace label below a tenth of standard', () => {
  afterEach(() => {
    cleanup();
    useGameSimulationStore.setState({ gameSpeed: 30, clockHolds: [] });
  });
  it('reads <0.1x, not 0x, while the clock runs', () => {
    useGameSimulationStore.setState({ gameSpeed: 2, clockHolds: [] });
    render(<MobilePanel isVisible content="overview" onClose={vi.fn()} />);
    expect(screen.getByText('<0.1x')).toBeInTheDocument();
    expect(screen.queryByText('0x')).toBeNull();
  });
});
