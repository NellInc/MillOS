import { act, cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IncidentReplayControls } from './IncidentReplayControls';
import { useIncidentReplayStore, type ReplayFrame } from '../../stores/incidentReplayStore';
import { useProductionStore } from '../../stores/productionStore';

const machine = (id: string, status: string) => ({ id, status, metrics: {} });

const calm: ReplayFrame = {
  timestamp: Date.parse('2026-10-31T19:10:05Z'),
  gameClock: { day: 0, hour: 10.5 },
  machineStates: [machine('rm-101', 'running'), machine('rm-102', 'running')],
  mobileEquipmentPositions: [],
  alerts: [],
};

const fault: ReplayFrame = {
  timestamp: Date.parse('2026-10-31T19:10:06Z'),
  gameClock: { day: 0, hour: 10.75 },
  machineStates: [machine('rm-101', 'critical'), machine('rm-102', 'running')],
  mobileEquipmentPositions: [],
  alerts: [{ id: 'breakdown-rm-101', type: 'critical', message: 'R.M. 101 has broken down.' }],
};

// Scrubbing the replay must show the plant as recorded in that frame, on the
// plant's own clock; a frame counter alone replays nothing.
describe('IncidentReplayControls shows the frame being replayed', () => {
  beforeEach(() => {
    useProductionStore.setState({
      machines: [
        { id: 'rm-101', name: 'R.M. 101' },
        { id: 'rm-102', name: 'R.M. 102' },
      ],
    } as never);
    useIncidentReplayStore.setState({
      replayMode: true,
      replayFrames: [calm, fault],
      currentReplayIndex: 0,
    });
  });
  afterEach(() => {
    cleanup();
    useIncidentReplayStore.setState({ replayMode: false, replayFrames: [], currentReplayIndex: 0 });
  });

  it('changes what it shows as the frame changes', () => {
    render(<IncidentReplayControls />);
    expect(screen.getByText(/Day 1, 10:30/)).toBeInTheDocument();
    expect(screen.queryByText('R.M. 101 has broken down.')).not.toBeInTheDocument();
    expect(screen.getByText('Running 2')).toBeInTheDocument();

    act(() => useIncidentReplayStore.getState().setReplayIndex(1));
    expect(screen.getByText(/Day 1, 10:45/)).toBeInTheDocument();
    expect(screen.getByText('R.M. 101 has broken down.')).toBeInTheDocument();
    expect(screen.getByText('Running 1')).toBeInTheDocument();
    expect(screen.getByText('Critical 1: R.M. 101')).toBeInTheDocument();
  });
});
