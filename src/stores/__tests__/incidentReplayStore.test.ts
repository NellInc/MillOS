import { beforeEach, describe, expect, it } from 'vitest';
import { useIncidentReplayStore } from '../incidentReplayStore';
import { useGameSimulationStore } from '../gameSimulationStore';

const frame = (timestamp: number) => ({
  timestamp,
  machineStates: [{ id: 'RM-101', status: 'running', metrics: { rpm: 1200 } }],
  mobileEquipmentPositions: [
    { id: 'service-rover-1', position: [0, 0, 0] as [number, number, number], task: 'Inspect' },
  ],
  alerts: [],
});

describe('incident replay diagnostics', () => {
  beforeEach(() => {
    useIncidentReplayStore.getState().clearDiagnostics();
    useIncidentReplayStore.getState().setReplayMode(false);
  });

  it('records bounded frames and pauses recording during replay', () => {
    for (let index = 0; index < 620; index += 1) {
      useIncidentReplayStore.getState().recordReplayFrame(frame(index));
    }
    expect(useIncidentReplayStore.getState().replayFrames).toHaveLength(600);
    expect(useIncidentReplayStore.getState().replayFrames[0].timestamp).toBe(20);

    useIncidentReplayStore.getState().setReplayMode(true);
    useIncidentReplayStore.getState().recordReplayFrame(frame(9999));
    expect(useIncidentReplayStore.getState().replayFrames.at(-1)?.timestamp).toBe(619);
  });

  it('exports build, seed, commands, and privacy guarantees without credentials', () => {
    useIncidentReplayStore.getState().recordCommand({
      timestamp: 100,
      category: 'safety',
      action: 'facility_stop_active',
      targetId: 'safety-1',
      data: { simulated: false },
    });
    useIncidentReplayStore.getState().recordReplayFrame(frame(100));

    const exported = useIncidentReplayStore.getState().createDiagnosticExport();
    expect(exported.schemaVersion).toBe(1);
    expect(exported.buildId).toBeTruthy();
    expect(exported.simulationSeed).toBeTruthy();
    expect(exported.commands).toHaveLength(1);
    expect(exported.frames).toHaveLength(1);
    expect(exported.privacy).toEqual({
      credentialsIncluded: false,
      personalDataIncluded: false,
      bounded: true,
    });
    expect(JSON.stringify(exported)).not.toMatch(/api[_-]?key|token|password/i);
  });

  // The replay bar reads a frame on the plant clock, as the maintenance log
  // does; the recorder only sends a wall-clock timestamp.
  it('stamps each recorded frame with the plant clock at capture', () => {
    useGameSimulationStore.setState({ gameDay: 2, gameTime: 14.25 });
    useIncidentReplayStore.getState().recordReplayFrame(frame(500));
    expect(useIncidentReplayStore.getState().replayFrames.at(-1)?.gameClock).toEqual({
      day: 2,
      hour: 14.25,
    });
  });
});
