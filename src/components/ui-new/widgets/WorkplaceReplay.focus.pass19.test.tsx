import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WorkplaceReplay } from './WorkplaceReplay';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useWorkplaceReplayStore } from '../../../stores/workplaceReplayStore';
import { endReplayClock } from '../../../simulation/workplaceReplayRuntime';
import { setLocale } from '../../../i18n';

// Browsers run the focus fixup rule: a focused control that becomes disabled
// loses focus to <body>. jsdom does not, so the test does what the browser does
// (jsdom's blur() ignores a disabled element; removing a focused one does not).
const fixupFocus = () => {
  const active = document.activeElement as HTMLButtonElement | null;
  if (!active || active === document.body || !active.disabled) return;
  const sink = document.createElement('div');
  sink.tabIndex = -1;
  document.body.appendChild(sink);
  sink.focus();
  sink.remove();
};

beforeEach(() => {
  setLocale('en');
  endReplayClock();
  useWorkplaceReplayStore.setState(useWorkplaceReplayStore.getInitialState());
  useGameSimulationStore.getState().setGameSpeed(30);
});
afterEach(() => {
  cleanup();
  useGameSimulationStore.getState().setGameSpeed(0);
});

// "Pause plant for capture" disables itself once the plant is paused, with
// focus on it; a browser then drops focus to <body>, where Space is the
// forklift emergency stop. Capture is the next step.
// Working if focus lands on "Capture paused plant" after pausing.
describe('pausing the plant for a replay capture (pass nineteen)', () => {
  it('moves focus to the capture control', async () => {
    render(<WorkplaceReplay seed={17} validSeed navigate={() => {}} />);
    const pause = screen.getByRole('button', { name: 'Pause plant for capture' });
    pause.focus();
    fireEvent.click(pause);
    expect(useGameSimulationStore.getState().gameSpeed).toBe(0);
    expect(pause).toBeDisabled();
    fixupFocus();
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    });
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Capture paused plant' })
    );
  });
});
