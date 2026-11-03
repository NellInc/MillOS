import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AlertSystem } from '../AlertSystem';
import { useUIStore } from '../../stores/uiStore';

vi.mock('../../utils/audioManager', () => ({ audioManager: { playAlert: vi.fn() } }));

const politeRegion = () => document.querySelector('[role="status"][aria-live="polite"]');

const hold = (message: string, at: number) => ({
  id: 'dispatch-quality-hold-cycle-7',
  type: 'warning' as const,
  title: 'Dispatch held for quality',
  message,
  timestamp: new Date(at),
  acknowledged: false,
  announce: 'polite' as const,
});

// The shipping tick files a quality hold again under the same id when the same
// load is held again (or for a new reason): the bell moves it to the top,
// unread, but the screen-reader path keyed what it had read by id alone, so the
// second hold was never read. Working if a hold raised again is read again,
// while acknowledging it stays silent.
describe('AlertSystem reads an announced alert raised again under its id', () => {
  beforeEach(() => useUIStore.setState({ alerts: [] }));
  afterEach(() => cleanup());

  it('reads the second quality hold on the same load', () => {
    render(<AlertSystem />);
    act(() => useUIStore.getState().addAlert(hold('Moisture 15.8% over limit.', 1_000)));
    expect(politeRegion()).toHaveTextContent('Moisture 15.8% over limit.');

    act(() => useUIStore.getState().acknowledgeAlert('dispatch-quality-hold-cycle-7'));
    expect(politeRegion()).toHaveTextContent('Moisture 15.8% over limit.');

    act(() => useUIStore.getState().addAlert(hold('Ash 0.62% over limit.', 60_000)));
    expect(politeRegion()).toHaveTextContent('Ash 0.62% over limit.');
  });
});
