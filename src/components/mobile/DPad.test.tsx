import { cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useMobileControlStore } from '../../stores/mobileControlStore';
import { DPad } from './DPad';

vi.mock('../../stores/uiStore', () => ({
  useUIStore: (selector: (state: { fpsMode: boolean }) => unknown) => selector({ fpsMode: true }),
}));

beforeEach(() => {
  useMobileControlStore.setState({ dpadMode: 'move', dpadDirection: null });
});
afterEach(cleanup);

it('uses CSS scroll suppression and releases movement on touch end or cancellation', () => {
  render(<DPad />);
  const forward = screen.getByRole('button', { name: 'Move forward' });
  expect(forward.style.touchAction).toBe('none');
  for (const end of ['touchEnd', 'touchCancel'] as const) {
    const startEvent = createEvent.touchStart(forward, { cancelable: true });
    fireEvent(forward, startEvent);
    expect(startEvent.defaultPrevented).toBe(false);
    expect(useMobileControlStore.getState().dpadDirection).toEqual({ x: 0, y: -1 });
    const endEvent = createEvent[end](forward, { cancelable: true });
    fireEvent(forward, endEvent);
    expect(endEvent.defaultPrevented).toBe(false);
    expect(useMobileControlStore.getState().dpadDirection).toBeNull();
  }
});

it('clears a held movement when the controls unmount', () => {
  const { unmount } = render(<DPad />);
  fireEvent.touchStart(screen.getByRole('button', { name: 'Move back' }));
  expect(useMobileControlStore.getState().dpadDirection).toEqual({ x: 0, y: 1 });
  unmount();
  expect(useMobileControlStore.getState().dpadDirection).toBeNull();
});
