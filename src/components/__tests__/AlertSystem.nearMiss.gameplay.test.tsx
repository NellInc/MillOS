import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AlertSystem } from '../AlertSystem';
import { useSafetyStore } from '../../stores/safetyStore';
import { useUIStore } from '../../stores/uiStore';

vi.mock('../../utils/audioManager', () => ({ audioManager: { playAlert: vi.fn() } }));

describe('AlertSystem near-miss announcements', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useSafetyStore.setState({
      safetyMetrics: {
        nearMisses: 0,
        safetyStops: 0,
        routeConflicts: 0,
        lastIncidentTime: null,
        daysSinceIncident: 127,
      },
      forkliftEmergencyStop: false,
    });
    useUIStore.setState({ alerts: [] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // Four wordings, picked at random: one in four near misses repeats the last
  // one's words, and an alert region whose text does not change is not read.
  // Working if every near miss filed in the bell is also read out.
  it('reads a second near miss worded like the first', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    render(<AlertSystem />);
    await act(async () => vi.advanceTimersByTimeAsync(100));
    const region = () => document.querySelector('[role="alert"]')!;
    await act(async () => {
      useSafetyStore.getState().recordSafetyStop();
      await vi.advanceTimersByTimeAsync(100);
    });
    const first = region().textContent;
    expect(first).toContain('Near-Miss Avoided');
    await act(async () => {
      useSafetyStore.getState().recordSafetyStop();
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(useUIStore.getState().alerts.filter((a) => a.type === 'safety')).toHaveLength(2);
    expect(region().textContent?.trimEnd()).toBe(first?.trimEnd());
    expect(region().textContent).not.toBe(first);
  });

  // The bell keeps near misses (and a reload restores them) but they were filed
  // as text only. Working if a near miss reads in Portuguese after a switch.
  it('files a near miss with keys, so the bell follows the language', async () => {
    const { alertText } = await import('../../i18n/alertCopy');
    const { setLocale } = await import('../../i18n');
    vi.spyOn(Math, 'random').mockReturnValue(0);
    render(<AlertSystem />);
    await act(async () => vi.advanceTimersByTimeAsync(100));
    await act(async () => {
      useSafetyStore.getState().recordSafetyStop();
      await vi.advanceTimersByTimeAsync(100);
    });
    const notice = useUIStore.getState().alerts.find((a) => a.type === 'safety')!;
    setLocale('pt-BR');
    try {
      expect(alertText(notice).title).not.toBe(notice.title);
      expect(alertText(notice).message).not.toBe(notice.message);
    } finally {
      setLocale('en');
    }
  });
});
