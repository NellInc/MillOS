import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkplaceReplay } from './WorkplaceReplay';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';

const replay = vi.hoisted(() => ({
  checkpoint: null as unknown,
  runs: [] as unknown[],
  guided: false,
  activeRunId: null as string | null,
  capture: vi.fn(),
  begin: vi.fn(),
  record: vi.fn(),
  forget: vi.fn(),
  setGuided: vi.fn(),
}));
vi.mock('../../../stores/workplaceReplayStore', () => ({
  useWorkplaceReplayStore: Object.assign(
    (selector?: (state: typeof replay) => unknown) => (selector ? selector(replay) : replay),
    { getState: () => replay }
  ),
  exportWorkplaceReplayReport: () => '{"runs":[]}',
}));
beforeEach(() => {
  vi.clearAllMocks();
  replay.capture.mockReturnValue({ changed: true, reason: null });
  replay.begin.mockReturnValue({ changed: true, reason: null });
  useGameSimulationStore.setState({ gameSpeed: 60, clockHolds: [] });
  useWorkplaceStore.setState({ workplace: createWorkplace() });
});
afterEach(cleanup);

const guide = () => {
  render(<WorkplaceReplay seed={17} validSeed navigate={() => undefined} />);
  fireEvent.click(screen.getByRole('button', { name: 'Start guided plant replay' }));
};

describe('Guided replay clock', () => {
  it('gives the plant back its pace when the capture is refused', () => {
    replay.capture.mockReturnValue({ changed: false, reason: 'Open order required.' });
    guide();
    expect(screen.getByRole('status')).toHaveTextContent('Open order required.');
    expect(useGameSimulationStore.getState().gameSpeed).toBe(60);
    expect(useGameSimulationStore.getState().clockHolds).toEqual([]);
  });

  it('gives the plant back its pace when the replay cannot begin', () => {
    replay.begin.mockReturnValue({ changed: false, reason: 'Settle obligations first.' });
    guide();
    expect(useGameSimulationStore.getState().gameSpeed).toBe(60);
  });

  it('keeps the hold when the guided replay begins', () => {
    guide();
    expect(useGameSimulationStore.getState().gameSpeed).toBe(0);
  });

  it('leaves an earlier workplace hold in place after a refusal', () => {
    useGameSimulationStore.getState().holdClock('workplace');
    replay.capture.mockReturnValue({ changed: false, reason: 'Open order required.' });
    guide();
    expect(useGameSimulationStore.getState().gameSpeed).toBe(0);
    expect(useGameSimulationStore.getState().clockHolds.at(-1)?.holder).toBe('workplace');
  });
});
