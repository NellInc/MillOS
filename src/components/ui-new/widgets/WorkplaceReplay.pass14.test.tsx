import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkplaceReplay } from './WorkplaceReplay';
import { setLocale } from '../../../i18n';
import type { WorkplaceCheckpointInfo, WorkplaceReplayRun } from '../../../types/workplaceReplay';

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
  remainingKg: 6000,
  seed: 17,
  gameDay: 0,
  gameTime: 14.5,
  sourceKg: 1250,
  faults: [],
  participantIds: [],
};
const run: WorkplaceReplayRun = {
  id: 'run1',
  checkpointId: 'checkpoint',
  profile: 'team',
  planId: 'steady',
  shiftPlans: [{ shift: 0, planId: 'steady' }],
  charter: {
    practices: ['rest', 'information', 'remedy'],
    workerAutonomy: 'team',
    governance: 'team-consent',
    aiAuthority: 'advice',
  },
  objectionsRaised: 0,
  objectionsResolved: 0,
  shiftCount: 1,
  elapsedMinutes: 90,
  agreementMinutes: 90,
  targetKg: 4800,
  deferredKg: 1200,
  dispatchedKg: 1250,
  remainingKg: 4750,
  manifestIds: ['manifest'],
  materialErrorKg: 0,
  genealogyErrorKg: 0,
  financial: {
    plantRevenue: 0,
    plantCosts: 0,
    workplaceWages: 0,
    compensation: 0,
    improvements: 0,
  },
  members: [],
  receipts: [],
  objections: [],
  refusalsRespected: 0,
  promisesKept: 0,
};

beforeEach(() => {
  setLocale('en');
  replay.checkpoint = checkpoint;
  replay.runs = [run];
});
afterEach(() => {
  cleanup();
  setLocale('en');
});

// The Lab groups every kilogram figure the way the delivery lines do ('6,000
// kg'); the replay panel in the same laboratory printed '6000.0 kg'.
// Working if the checkpoint and each run's dispatch line group their figures.
describe('replay kilogram figures, fourteenth pass', () => {
  it('groups the checkpoint and dispatch kilograms in both languages', () => {
    render(<WorkplaceReplay seed={17} validSeed navigate={() => {}} />);
    const line = screen.getByText(/^Checkpoint: Bakery/);
    expect(line).toHaveTextContent('6,000.0 kg remaining; source stock 1,250.0 kg');
    const dispatch = screen.getByText(/kg dispatched;/);
    expect(dispatch).toHaveTextContent(
      '1,250.0 kg dispatched; 4,750.0 kg full commitment remaining. Agreed target 4,800.0 kg; deferred 1,200.0 kg.'
    );
    act(() => setLocale('pt-BR'));
    expect(screen.getByText(/^Ponto de controle: Bakery/)).toHaveTextContent('6.000,0 kg');
    expect(screen.getByText(/kg expedidos;/)).toHaveTextContent('1.250,0 kg expedidos');
  });
});
