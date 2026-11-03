import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkplaceReplay } from './WorkplaceReplay';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
import { setLocale } from '../../../i18n';
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
}));

const run = (): WorkplaceReplayRun => ({
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
  receipts: [
    {
      shift: 0,
      events: [
        { id: 'e-1', minute: 0, actorId: 'quality', kind: 'objection', detail: 'one' },
        { id: 'e-2', minute: 0, actorId: 'system', kind: 'settled', detail: 'two' },
      ],
    },
  ],
  objections: [],
  refusalsRespected: 0,
  promisesKept: 0,
});

beforeEach(() => {
  replay.checkpoint = null;
  replay.runs = [];
  vi.clearAllMocks();
  useGameSimulationStore.setState({ gameSpeed: 180 });
  useWorkplaceStore.setState({ workplace: createWorkplace() });
});
afterEach(() => {
  cleanup();
  setLocale('en');
});

describe('replay receipts, fourth pass', () => {
  it('names who acted by role, not by id', () => {
    replay.runs = [run()];
    render(<WorkplaceReplay seed={17} validSeed navigate={() => undefined} />);
    expect(screen.getByText('Minute 0.0, Quality: one')).toBeInTheDocument();
    expect(screen.getByText('Minute 0.0, System: two')).toBeInTheDocument();
  });

  it('lists checkpoint faults by their label in the language chosen', () => {
    replay.checkpoint = {
      id: 'checkpoint',
      orderId: 'o',
      customer: 'Local customer',
      remainingKg: 600,
      sourceKg: 800,
      gameDay: 0,
      gameTime: 10,
      seed: 17,
      faults: [{ machineName: 'R.M. 101', type: 'vibration_failure' }],
      participantIds: [],
    };
    setLocale('pt-BR');
    render(<WorkplaceReplay seed={17} validSeed navigate={() => undefined} />);
    expect(screen.getByText(/Falhas: R\.M\. 101: falha por vibração\./)).toBeInTheDocument();
  });
});
