import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useMobileControlStore } from '../../stores/mobileControlStore';
import { DPad } from './DPad';

vi.mock('../../stores/uiStore', () => ({
  useUIStore: (selector: (state: { fpsMode: boolean }) => unknown) => selector({ fpsMode: true }),
}));

beforeEach(() => {
  vi.useFakeTimers();
  useMobileControlStore.setState({
    dpadMode: 'move',
    dpadDirection: null,
    mobilePanelVisible: false,
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// A screen reader's double tap (or Enter) on a direction gives a 0.4 s nudge.
// The nudges shared one timer, so a second direction pressed inside that window
// cancelled the first one's release: forward stayed held with nothing pressed
// and the camera kept walking. Working if every nudge ends on its own.
it('releases each nudged direction when two are pressed in quick succession', () => {
  render(<DPad />);
  fireEvent.click(screen.getByRole('button', { name: 'Move forward' }));
  act(() => vi.advanceTimersByTime(100));
  fireEvent.click(screen.getByRole('button', { name: 'Strafe right' }));
  expect(useMobileControlStore.getState().dpadDirection).not.toBeNull();
  act(() => vi.advanceTimersByTime(1000));
  expect(useMobileControlStore.getState().dpadDirection).toBeNull();
});

it('extends a repeated nudge on the same direction rather than stopping it early', () => {
  render(<DPad />);
  const forward = screen.getByRole('button', { name: 'Move forward' });
  fireEvent.click(forward);
  act(() => vi.advanceTimersByTime(300));
  fireEvent.click(forward);
  act(() => vi.advanceTimersByTime(300));
  expect(useMobileControlStore.getState().dpadDirection).toEqual({ x: 0, y: -1 });
  act(() => vi.advanceTimersByTime(200));
  expect(useMobileControlStore.getState().dpadDirection).toBeNull();
});
