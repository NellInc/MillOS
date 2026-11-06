import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useMobileControlStore } from '../../stores/mobileControlStore';
import { useForkliftDriveStore } from '../../stores/forkliftDriveStore';
import { DPad } from './DPad';

vi.mock('../../stores/uiStore', () => ({
  useUIStore: (selector: (state: { fpsMode: boolean }) => unknown) => selector({ fpsMode: true }),
}));

beforeEach(() => {
  useMobileControlStore.setState({
    dpadMode: 'move',
    dpadDirection: null,
    mobilePanelVisible: false,
  });
  useForkliftDriveStore.setState({ drivenId: null, inReachId: null });
});
afterEach(() => {
  cleanup();
  useForkliftDriveStore.setState({ drivenId: null, inReachId: null });
});

// In a seat the D-pad is throttle and steering (MobileFirstPersonController):
// left and right turn the forklift, they do not strafe. A screen reader player
// heard 'Strafe left' for a button that steered the truck.
it('names the D-pad by what it does in a forklift seat, and by walking again on stepping down', () => {
  useForkliftDriveStore.setState({ drivenId: 'forklift-1' });
  const { rerender } = render(<DPad />);
  for (const name of ['Drive forward', 'Reverse', 'Steer left', 'Steer right'])
    expect(screen.getByRole('button', { name })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Strafe left' })).not.toBeInTheDocument();

  // The names change the direction they send not at all: left still steers left.
  fireEvent.touchStart(screen.getByRole('button', { name: 'Steer left' }));
  expect(useMobileControlStore.getState().dpadDirection).toEqual({ x: -1, y: 0 });
  fireEvent.touchEnd(screen.getByRole('button', { name: 'Steer left' }));

  useForkliftDriveStore.setState({ drivenId: null });
  rerender(<DPad />);
  for (const name of ['Move forward', 'Move back', 'Strafe left', 'Strafe right'])
    expect(screen.getByRole('button', { name })).toBeInTheDocument();
});
