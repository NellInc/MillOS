import { beforeEach, describe, expect, it } from 'vitest';
import { useIncidentReplayStore } from '../incidentReplayStore';

const frame = (timestamp: number) => ({
  timestamp,
  machineStates: [],
  mobileEquipmentPositions: [],
  alerts: [],
});

// The recording is a sliding 600-frame window that keeps moving while the
// player is out of replay. A kept index lands the next Enter Replay on an
// arbitrary frame (neither where they left nor the start of the recording).
describe('incident replay re-entry', () => {
  beforeEach(() => {
    useIncidentReplayStore.getState().setReplayMode(false);
    useIncidentReplayStore.getState().clearDiagnostics();
  });

  it('opens each replay at the start of the recording, as the first one does', () => {
    const store = useIncidentReplayStore.getState;
    for (let t = 0; t < 600; t += 1) store().recordReplayFrame(frame(t));
    store().setReplayMode(true);
    expect(store().getCurrentFrame()?.timestamp).toBe(0);
    store().setReplayIndex(300);
    store().setReplayMode(false);
    for (let t = 600; t < 800; t += 1) store().recordReplayFrame(frame(t));

    store().setReplayMode(true);
    expect(store().currentReplayIndex).toBe(0);
    expect(store().getCurrentFrame()?.timestamp).toBe(200);
  });
});
