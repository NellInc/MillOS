import { act, cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useMobileControlStore } from '../../stores/mobileControlStore';
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

// Opening a sheet makes the pad inert; a thumb still on a direction may never
// deliver its touchend there, and the camera kept drifting behind the sheet.
// Working if opening a sheet releases a held direction.
it('releases a held movement when a phone sheet opens over the pad', () => {
  render(<DPad />);
  fireEvent.touchStart(screen.getByRole('button', { name: 'Move forward' }));
  expect(useMobileControlStore.getState().dpadDirection).toEqual({ x: 0, y: -1 });
  act(() => useMobileControlStore.setState({ mobilePanelVisible: true }));
  expect(useMobileControlStore.getState().dpadDirection).toBeNull();
});

// VoiceOver and TalkBack activate a control with a click, not a touch, so a
// screen-reader double tap on 'Move forward' moved nothing. Working if a click
// with no touch behind it gives a short nudge, and a real touch is not doubled.
it('nudges once on a click with no touch behind it', () => {
  vi.useFakeTimers();
  try {
    render(<DPad />);
    const forward = screen.getByRole('button', { name: 'Move forward' });
    fireEvent.click(forward);
    expect(useMobileControlStore.getState().dpadDirection).toEqual({ x: 0, y: -1 });
    act(() => vi.advanceTimersByTime(1000));
    expect(useMobileControlStore.getState().dpadDirection).toBeNull();
    fireEvent.touchStart(forward);
    fireEvent.touchEnd(forward);
    fireEvent.click(forward);
    expect(useMobileControlStore.getState().dpadDirection).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

// The click a browser synthesizes follows the touchend, not the touchstart. A
// hold longer than the second the guard measured from touchstart let that
// click through as a nudge, so the camera moved on for 0.4 s after the thumb
// lifted. Working if releasing a long hold leaves the pad still.
it('does not nudge on the click that follows a long hold', () => {
  vi.useFakeTimers();
  try {
    render(<DPad />);
    const forward = screen.getByRole('button', { name: 'Move forward' });
    fireEvent.touchStart(forward);
    act(() => vi.advanceTimersByTime(1500));
    fireEvent.touchEnd(forward);
    expect(useMobileControlStore.getState().dpadDirection).toBeNull();
    fireEvent.click(forward);
    expect(useMobileControlStore.getState().dpadDirection).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

// In pt-BR the D-pad's forward button and the tour's Next were both 'Avançar',
// so a screen reader offered two identical buttons that do different things.
// The glossary keeps 'Avançar' for Next. Working if the names differ.
it('does not share its pt-BR name with the tour Next button', async () => {
  const { setLocale, translate } = await import('../../i18n');
  const { dPadMessages } = await import('./DPad.messages');
  const { onboardingGuideMessages } = await import('../ui-new/onboarding/OnboardingGuide.messages');
  setLocale('pt-BR');
  try {
    const next = translate(onboardingGuideMessages, 'next');
    for (const key of ['moveForward', 'moveBack'] as const)
      expect(translate(dPadMessages, key)).not.toBe(next);
  } finally {
    setLocale('en');
  }
});
