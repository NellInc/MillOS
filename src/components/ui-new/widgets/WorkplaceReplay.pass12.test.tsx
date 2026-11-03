import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkplaceReplay } from './WorkplaceReplay';
import { setLocale } from '../../../i18n';
import type { WorkplaceCheckpointInfo } from '../../../types/workplaceReplay';

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
  selectReplayRunLive: () => false,
  exportWorkplaceReplayReport: () => '{"runs":[]}',
}));

const checkpoint: WorkplaceCheckpointInfo = {
  id: 'checkpoint',
  orderId: 'order-1',
  customer: 'Bakery',
  remainingKg: 600,
  seed: 17,
  gameDay: 0,
  gameTime: 14.5,
  sourceKg: 1200,
  faults: [],
  participantIds: [],
};

beforeEach(() => {
  setLocale('en');
  replay.checkpoint = checkpoint;
});
afterEach(() => {
  cleanup();
  setLocale('en');
});

// Every other plant stamp (maintenance log, incident replay, alerts) reads the
// first game day as Day 1 and the hour as a clock time. The checkpoint read the
// same instant as "Day 0, hour 14.50". Working if it says "Day 1, 14:30".
describe('replay checkpoint time, twelfth pass', () => {
  it('names the checkpoint on the plant clock every other surface uses', () => {
    render(<WorkplaceReplay seed={17} validSeed navigate={() => {}} />);
    expect(screen.getByText(/^Checkpoint: Bakery/)).toHaveTextContent('Day 1, 14:30');
    act(() => setLocale('pt-BR'));
    expect(screen.getByText(/^Ponto de controle: Bakery/)).toHaveTextContent('Dia 1, 14:30');
  });
});
