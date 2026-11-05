import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IncidentReplayControls } from './IncidentReplayControls';
import { useIncidentReplayStore, type ReplayFrame } from '../../stores/incidentReplayStore';

const frame = (timestamp: number): ReplayFrame => ({
  timestamp,
  machineStates: [],
  mobileEquipmentPositions: [],
  alerts: [],
});

// Exit Replay unmounts the whole bar, including the button just pressed.
// Working if focus goes back to the control that opened the replay.
describe('IncidentReplayControls exit focus', () => {
  beforeEach(() => {
    useIncidentReplayStore.setState({
      replayMode: false,
      replayFrames: [frame(1), frame(2)],
      currentReplayIndex: 0,
    });
  });
  afterEach(() => {
    cleanup();
    useIncidentReplayStore.setState({ replayMode: false, replayFrames: [], currentReplayIndex: 0 });
  });

  it('returns focus to the control that entered replay', () => {
    render(
      <>
        <button type="button" onClick={() => useIncidentReplayStore.getState().setReplayMode(true)}>
          Enter replay
        </button>
        <IncidentReplayControls />
      </>
    );
    const opener = screen.getByRole('button', { name: 'Enter replay' });
    opener.focus();
    act(() => {
      fireEvent.click(opener);
    });
    const exit = screen.getByRole('button', { name: 'Exit Replay' });
    exit.focus();
    fireEvent.click(exit);
    expect(screen.queryByRole('button', { name: 'Exit Replay' })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(opener);
  });
});
