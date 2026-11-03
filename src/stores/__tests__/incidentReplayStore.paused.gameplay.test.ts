import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useIncidentReplayStore, type ReplayFrame } from '../incidentReplayStore';
import { useGameSimulationStore } from '../gameSimulationStore';

const frame = (timestamp: number, status: string, alertIds: string[] = []): ReplayFrame => ({
  timestamp,
  machineStates: [{ id: 'RM-101', status, metrics: { rpm: 1200 } }],
  mobileEquipmentPositions: [],
  alerts: alertIds.map((id) => ({ id, type: 'critical', message: id })),
});

// The recorder samples once a wall second. A player who pauses (P) to look
// into an incident filled the 600-frame window with copies of the paused
// plant in ten minutes, pushing the incident itself out of Incident Replay.
// Working if a pause records nothing new until something on the plant changes.
describe('incident replay recording while the plant is paused', () => {
  let savedSpeed: number;
  beforeEach(() => {
    savedSpeed = useGameSimulationStore.getState().gameSpeed;
    useIncidentReplayStore.getState().setReplayMode(false);
    useIncidentReplayStore.getState().clearDiagnostics();
  });
  afterEach(() => {
    useGameSimulationStore.setState({ gameSpeed: savedSpeed });
  });

  it('keeps the incident in the recording through a long pause', () => {
    const store = useIncidentReplayStore.getState;
    store().recordReplayFrame(frame(0, 'running'));
    store().recordReplayFrame(frame(1, 'critical', ['fault-1']));
    useGameSimulationStore.setState({ gameSpeed: 0 });
    // Fifteen minutes paused, one sample a second.
    for (let t = 2; t < 902; t += 1) store().recordReplayFrame(frame(t, 'critical', ['fault-1']));

    const frames = store().replayFrames;
    expect(frames.map((f) => f.machineStates[0].status)).toContain('running');
    expect(frames.length).toBeLessThan(10);
  });

  it('still records a change made while paused', () => {
    const store = useIncidentReplayStore.getState;
    store().recordReplayFrame(frame(0, 'critical', ['fault-1']));
    useGameSimulationStore.setState({ gameSpeed: 0 });
    store().recordReplayFrame(frame(1, 'critical', ['fault-1']));
    store().recordReplayFrame(frame(2, 'idle', ['fault-1']));
    store().recordReplayFrame(frame(3, 'idle', []));

    expect(store().replayFrames.map((f) => f.timestamp)).toEqual([0, 2, 3]);
  });
});
