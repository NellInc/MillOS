import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkplaceReplay } from './WorkplaceReplay';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
import { MANAGEMENT_APPROACHES } from '../../../simulation/workplaceCampaign';
import { setLocale } from '../../../i18n';
import type { WorkplaceProfile } from '../../../types/workplace';
import type { WorkplaceReplayRun } from '../../../types/workplaceReplay';

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
  selectReplayRunLive: (state: { activeRunId: string | null; runs: Array<{ id: string }> }) =>
    state.activeRunId !== null && !state.runs.some((run) => run.id === state.activeRunId),
}));

const run = (profile: WorkplaceProfile): WorkplaceReplayRun => ({
  id: `run-${profile}`,
  checkpointId: 'checkpoint',
  profile,
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
  targetKg: 600,
  deferredKg: 0,
  dispatchedKg: 123,
  remainingKg: 477,
  manifestIds: ['manifest'],
  materialErrorKg: 0,
  genealogyErrorKg: 0,
  financial: {
    plantRevenue: 200,
    plantCosts: 50,
    workplaceWages: 32,
    compensation: 8,
    improvements: 40,
  },
  members: [],
  receipts: [],
  objections: [],
  refusalsRespected: 0,
  promisesKept: 0,
});

beforeEach(() => {
  setLocale('en');
  replay.checkpoint = {
    id: 'checkpoint',
    orderId: 'order',
    customer: 'Local customer',
    remainingKg: 600,
    sourceKg: 800,
    gameDay: 0,
    gameTime: 10,
    seed: 17,
    faults: [],
  };
  replay.runs = [];
  replay.activeRunId = null;
  useGameSimulationStore.setState({ gameSpeed: 180, clockHolds: [], emergencyActive: false });
  useWorkplaceStore.setState({ workplace: createWorkplace() });
});
afterEach(() => {
  cleanup();
  setLocale('en');
});

// A retained replay run named its charter route by internal id in English
// ("toe-dip actual run", "toe-dip: Steady pacing"), where the setup form and
// the Portuguese label name it ("Coordinator-led"). Working if each run reads
// by the approach's title.
describe('a retained replay run names its approach, not its id (pass fifteen)', () => {
  it.each(['toe-dip', 'team', 'cooperative'] as const)('names the %s approach', (profile) => {
    replay.runs = [run(profile)];
    render(<WorkplaceReplay seed={17} validSeed navigate={vi.fn()} />);
    const title = MANAGEMENT_APPROACHES.find((a) => a.id === profile)!.title;
    const article = screen.getByRole('article', { name: `${title} actual run` });
    expect(article.querySelector('h5')?.textContent).toMatch(new RegExp(`^${title}: `));
  });
});
