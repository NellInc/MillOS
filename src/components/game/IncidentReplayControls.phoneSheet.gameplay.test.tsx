import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IncidentReplayControls } from './IncidentReplayControls';
import { useIncidentReplayStore, type ReplayFrame } from '../../stores/incidentReplayStore';
import { useMobileControlStore } from '../../stores/mobileControlStore';

const frame = (timestamp: number): ReplayFrame => ({
  timestamp,
  machineStates: [],
  mobileEquipmentPositions: [],
  alerts: [],
});

// On a phone, Enter replay lives in the Settings sheet. While a sheet is open
// the game interface root (where this bar renders) is inert and hidden behind
// it, so the replay appeared to do nothing and none of its controls could be
// pressed. Working if entering replay hands the screen to the replay bar.
describe('IncidentReplayControls entered from a phone sheet', () => {
  beforeEach(() => {
    useIncidentReplayStore.setState({
      replayMode: false,
      replayFrames: [frame(1), frame(2)],
      currentReplayIndex: 0,
    });
    useMobileControlStore.setState({ mobilePanelVisible: true, mobilePanelContent: 'settings' });
  });
  afterEach(() => {
    cleanup();
    useIncidentReplayStore.setState({ replayMode: false, replayFrames: [], currentReplayIndex: 0 });
    useMobileControlStore.setState({ mobilePanelVisible: false });
  });

  it('closes the open sheet so the replay bar can be used', () => {
    render(<IncidentReplayControls />);
    act(() => {
      useIncidentReplayStore.getState().setReplayMode(true);
    });
    expect(screen.getByRole('button', { name: 'Exit Replay' })).toBeInTheDocument();
    expect(useMobileControlStore.getState().mobilePanelVisible).toBe(false);
  });

  // The opener was the sheet's Enter replay button, gone with the sheet, so
  // Exit left focus on <body> (where Space stops every forklift). Working if
  // Exit hands focus to the dock instead.
  it('hands focus to the dock on Exit when the sheet that opened it is gone', () => {
    const Sheet = () => {
      const open = useMobileControlStore((state) => state.mobilePanelVisible);
      return open ? (
        <button type="button" onClick={() => useIncidentReplayStore.getState().setReplayMode(true)}>
          Enter replay
        </button>
      ) : null;
    };
    render(
      <>
        <button type="button" data-dock-mode="overview">
          Overview
        </button>
        <Sheet />
        <IncidentReplayControls />
      </>
    );
    const opener = screen.getByRole('button', { name: 'Enter replay' });
    opener.focus();
    act(() => {
      fireEvent.click(opener);
    });
    expect(screen.queryByRole('button', { name: 'Enter replay' })).not.toBeInTheDocument();
    const exit = screen.getByRole('button', { name: 'Exit Replay' });
    exit.focus();
    fireEvent.click(exit);
    expect(screen.queryByRole('button', { name: 'Exit Replay' })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Overview' }));
  });

  it('leaves a sheet opened during a replay alone', () => {
    useMobileControlStore.setState({ mobilePanelVisible: false });
    render(<IncidentReplayControls />);
    act(() => {
      useIncidentReplayStore.getState().setReplayMode(true);
    });
    act(() => {
      useMobileControlStore.setState({ mobilePanelVisible: true });
    });
    expect(useMobileControlStore.getState().mobilePanelVisible).toBe(true);
  });
});
