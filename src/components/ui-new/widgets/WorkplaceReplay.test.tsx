import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkplaceReplay, WorkplaceReplayGuide, WorkplaceReplayResume } from './WorkplaceReplay';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
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
beforeEach(() => {
  replay.checkpoint = null;
  replay.runs = [];
  replay.guided = false;
  replay.activeRunId = null;
  vi.clearAllMocks();
  replay.capture.mockReturnValue({ changed: true, reason: null });
  replay.begin.mockReturnValue({ changed: true, reason: null });
  replay.record.mockReturnValue({ changed: false, reason: 'Complete recovery before review.' });
  replay.forget.mockReturnValue({ changed: true, reason: null });
  useGameSimulationStore.setState({ gameSpeed: 180 });
  useWorkplaceStore.setState({ workplace: createWorkplace() });
});
afterEach(cleanup);

const navigate = vi.fn();
describe('Matched plant replay interface', () => {
  it('pauses, captures and begins a real toe-dip run without forging consent', () => {
    const before = useWorkplaceStore.getState().workplace;
    render(<WorkplaceReplay seed={17} validSeed navigate={navigate} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start guided plant replay' }));
    expect(useGameSimulationStore.getState().gameSpeed).toBe(0);
    expect(replay.capture).toHaveBeenCalledWith(17);
    expect(replay.begin).toHaveBeenCalledWith('toe-dip');
    expect(replay.setGuided).toHaveBeenCalledWith(true);
    expect(navigate).toHaveBeenCalledWith('Shift');
    expect(useWorkplaceStore.getState().workplace).toBe(before);
  });
  it('shows a guard reason and does not begin or guide after capture rejection', () => {
    replay.capture.mockReturnValue({
      changed: false,
      reason: 'External SCADA control blocks capture.',
    });
    render(<WorkplaceReplay seed={17} validSeed navigate={navigate} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start guided plant replay' }));
    expect(screen.getByRole('status')).toHaveTextContent('External SCADA control blocks capture.');
    expect(replay.begin).not.toHaveBeenCalled();
    expect(replay.setGuided).not.toHaveBeenCalled();
  });
  it('does not enable guide after begin rejects and disables invalid seed', () => {
    replay.begin.mockReturnValue({ changed: false, reason: 'Settle obligations first.' });
    const view = render(<WorkplaceReplay seed={17} validSeed navigate={navigate} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start guided plant replay' }));
    expect(screen.getByRole('status')).toHaveTextContent('Settle obligations first.');
    expect(replay.setGuided).not.toHaveBeenCalled();
    view.rerender(<WorkplaceReplay seed={0} validSeed={false} navigate={navigate} />);
    expect(screen.getByRole('button', { name: 'Start guided plant replay' })).toBeDisabled();
  });
  it('shows actual dispatch, separate currencies and unequal horizons', () => {
    replay.checkpoint = {
      customer: 'Local customer',
      remainingKg: 600,
      sourceKg: 800,
      gameDay: 0,
      gameTime: 10,
      seed: 17,
      faults: [],
    };
    const run = {
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
      objectionsRaised: 2,
      objectionsResolved: 1,
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
      refusalsRespected: 1,
      promisesKept: 0,
    } satisfies WorkplaceReplayRun;
    replay.runs = [
      run,
      {
        ...run,
        id: 'run2',
        profile: 'cooperative',
        elapsedMinutes: 180,
        shiftCount: 2,
        manifestIds: ['manifest', 'manifest-2'],
      },
    ];
    render(<WorkplaceReplay seed={17} validSeed navigate={navigate} />);
    expect(screen.getByText(/Unequal horizons/)).toBeInTheDocument();
    expect(screen.getAllByText(/123.0 kg dispatched/)).toHaveLength(2);
    expect(screen.getByText(/1 shift; 90.0 elapsed minutes/)).toBeInTheDocument();
    expect(screen.getByText(/2 shifts; 180.0 elapsed minutes/)).toBeInTheDocument();
    expect(screen.getByText(/kg; 1 dispatch manifest\./)).toBeInTheDocument();
    expect(screen.getByText(/kg; 2 dispatch manifests\./)).toBeInTheDocument();
    expect(screen.getAllByText('Plant accounts, pounds sterling')).toHaveLength(2);
    expect(screen.getAllByText('Illustrative workplace credits')).toHaveLength(2);
    expect(screen.getAllByText(/Actual charter: team work choice/)).toHaveLength(2);
    expect(screen.getAllByText(/Cumulative objections resolved 1 of 2/)).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Retain actual run review' }));
    expect(screen.getByRole('status')).toHaveTextContent('Complete recovery before review.');
  });
  it('guide navigation and ending do not submit workplace actions', () => {
    replay.guided = true;
    const before = useWorkplaceStore.getState().workplace;
    render(<WorkplaceReplayGuide section="Agreement / Voices" navigate={navigate} />);
    expect(screen.getByText(/Quality may refuse without explaining/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next guide section' }));
    expect(navigate).toHaveBeenCalledWith('Review');
    fireEvent.click(screen.getByRole('button', { name: 'End guide' }));
    expect(replay.setGuided).toHaveBeenCalledWith(false);
    expect(useWorkplaceStore.getState().workplace).toBe(before);
    expect(replay.begin).not.toHaveBeenCalled();
  });
  it('offers a real clock resume only after an active replay agreement', () => {
    replay.activeRunId = 'run';
    useGameSimulationStore.setState({ gameSpeed: 0 });
    const view = render(<WorkplaceReplayResume />);
    expect(screen.queryByRole('button', { name: /Resume agreed replay/ })).not.toBeInTheDocument();
    useWorkplaceStore.setState({ workplace: { ...createWorkplace(), phase: 'active' } });
    view.rerender(<WorkplaceReplayResume />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Resume agreed replay at teaching pace (30×)' })
    );
    expect(useGameSimulationStore.getState().gameSpeed).toBe(30);
    expect(replay.begin).not.toHaveBeenCalled();
  });
});
