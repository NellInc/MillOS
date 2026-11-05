import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./BuildCacheDiagnostics', () => ({ BuildCacheDiagnostics: () => null }));

import { SettingsPanel } from './SettingsPanel';
import { useAnnouncementsStore } from '../../../stores/announcementsStore';
import { setLocale } from '../../../i18n';

// Clear transcript turns itself off once no dismissed line is left. A natively
// disabled button that holds focus loses it (the browser's focus fixup), and
// the page's fallback rescue (utils/focusRescue) then parks focus on the whole
// Audio section and never hands it back, because the button stays disabled:
// the next Tab started again at Mute. jsdom has no focus fixup, so the native
// `disabled` attribute is the proxy here. Working if the button reads as
// unavailable and keeps focus after it clears.
describe('Clear transcript keeps focus', () => {
  beforeEach(() => {
    setLocale('en');
    useAnnouncementsStore.setState({
      announcements: [],
      lastAnnouncementTime: {},
      mode: 'focused',
    });
  });
  afterEach(() => {
    cleanup();
    useAnnouncementsStore.setState({ announcements: [], lastAnnouncementTime: {} });
  });

  it('stays focusable and reads unavailable after clearing the last dismissed line', () => {
    useAnnouncementsStore.setState({
      announcements: [
        {
          id: 'old',
          type: 'info',
          message: 'Shift change in five minutes.',
          timestamp: new Date(),
          priority: 1,
          dismissed: true,
        },
      ],
    });
    render(<SettingsPanel productionSpeed={1} setProductionSpeed={() => {}} />);
    const clear = screen.getByRole('button', { name: 'Clear transcript' });
    clear.focus();
    fireEvent.click(clear);
    expect(useAnnouncementsStore.getState().announcements).toHaveLength(0);
    // Native `disabled` makes a focused control unfocusable; aria-disabled does not.
    expect(clear).not.toBeDisabled();
    expect(clear).toHaveAttribute('aria-disabled', 'true');
    expect(document.activeElement).toBe(clear);
  });

  it('does nothing while unavailable, so a showing caption is not cleared', () => {
    const showing = {
      id: 'live',
      type: 'info' as const,
      message: 'Truck at dock 2.',
      timestamp: new Date(),
      priority: 1,
    };
    useAnnouncementsStore.setState({ announcements: [showing] });
    render(<SettingsPanel productionSpeed={1} setProductionSpeed={() => {}} />);
    const clear = screen.getByRole('button', { name: 'Clear transcript' });
    expect(clear).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(clear);
    expect(useAnnouncementsStore.getState().announcements).toEqual([showing]);
  });
});
