import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { DAILY_TARGET_BAGS, useProductionStore } from '../../stores/productionStore';
import { useAnnouncementsStore } from '../../stores/announcementsStore';
import { useEventAnnouncementScheduler } from './shared';
import { sharedMessages } from './shared.messages';
import { audioManager } from '../../utils/audioManager';

vi.mock('../../scada/SCADAService', () => ({
  peekSCADAService: () => null,
}));

vi.mock('../../utils/audioManager', () => ({
  audioManager: { muted: false },
}));

// GC-16: a reload part-way through a day restores dailyBagsProduced; the PA must
// not caption a target the player made before the reload. Only the target
// itself is announced (D-054); 25-90% were routine readouts.
describe('daily-target caption across a reload', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('stays quiet about a target already made, and about the readouts on the way', () => {
    vi.useFakeTimers();
    const addAnnouncement = vi.fn();
    useAnnouncementsStore.setState({ mode: 'focused' });
    useProductionStore.setState({
      addAnnouncement,
      machines: [],
      dailyBagsProduced: DAILY_TARGET_BAGS * 1.05,
    } as never);

    const hook = renderHook(() => useEventAnnouncementScheduler());
    vi.advanceTimersByTime(5000);
    const milestoneCaptions = () =>
      addAnnouncement.mock.calls.filter(
        ([input]) => (input as { source?: string }).source === 'Production controller'
      );
    expect(milestoneCaptions()).toHaveLength(0);

    // A new day: 25, 50, 75 and 90% pass in silence, and the target is said.
    useProductionStore.setState({ dailyBagsProduced: 0 });
    for (const share of [0.3, 0.6, 0.8, 0.95]) {
      useProductionStore.setState({ dailyBagsProduced: DAILY_TARGET_BAGS * share });
      vi.advanceTimersByTime(5000);
    }
    expect(milestoneCaptions()).toHaveLength(0);
    useProductionStore.setState({ dailyBagsProduced: DAILY_TARGET_BAGS });
    vi.advanceTimersByTime(5000);
    expect(milestoneCaptions()).toHaveLength(1);
    expect((milestoneCaptions()[0][0] as { message: string }).message).toBe(
      sharedMessages.en.milestone100
    );
    hook.unmount();
  });
});

// A new day zeroes the count. The PA only noticed when a poll caught the
// count under 10%, and it does not poll while muted, so muting across a
// rollover silenced the next day's milestone captions.
describe('daily-target caption across a muted day rollover', () => {
  afterEach(() => {
    vi.useRealTimers();
    audioManager.muted = false;
  });

  it('captions the new day after a rollover it slept through', () => {
    vi.useFakeTimers();
    const addAnnouncement = vi.fn();
    const setDay = (dailyBagsProduced: number) =>
      useProductionStore.setState({
        dailyBagsProduced,
        productionTarget: { targetBags: DAILY_TARGET_BAGS, producedBags: dailyBagsProduced },
      } as never);
    const captions = () =>
      addAnnouncement.mock.calls
        .filter(([input]) => (input as { source?: string }).source === 'Production controller')
        .map(([input]) => (input as { message: string }).message);

    useAnnouncementsStore.setState({ mode: 'focused' });
    useProductionStore.setState({ addAnnouncement, machines: [] } as never);
    setDay(0);
    const hook = renderHook(() => useEventAnnouncementScheduler());
    setDay(DAILY_TARGET_BAGS);
    vi.advanceTimersByTime(5000);
    expect(captions()).toHaveLength(1);
    expect(captions()[0]).toBe(sharedMessages.en.milestone100);

    audioManager.muted = true;
    setDay(0); // the day closes while muted
    setDay(Math.round(DAILY_TARGET_BAGS * 0.2));
    vi.advanceTimersByTime(5000);
    audioManager.muted = false;
    setDay(DAILY_TARGET_BAGS);
    vi.advanceTimersByTime(5000);

    expect(captions()).toHaveLength(2);
    expect(captions()[1]).toBe(sharedMessages.en.milestone100);
    hook.unmount();
  });
});

// Priority 4 is the critical tier: a red pulsing card, an assertive screen-reader
// interrupt, and the one caption that ignores "PA captions: off". Reaching the
// daily target is good news, and it was raised there.
describe('daily-target reached caption', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is not raised at the critical tier', () => {
    vi.useFakeTimers();
    const addAnnouncement = vi.fn();
    useAnnouncementsStore.setState({ mode: 'focused' });
    useProductionStore.setState({ addAnnouncement, machines: [], dailyBagsProduced: 0 } as never);
    const hook = renderHook(() => useEventAnnouncementScheduler());
    useProductionStore.setState({ dailyBagsProduced: DAILY_TARGET_BAGS });
    vi.advanceTimersByTime(5000);
    const reached = addAnnouncement.mock.calls
      .map(([input]) => input as { message: string; priority: number; type: string })
      .find((input) => input.message === sharedMessages.en.milestone100);
    expect(reached?.type).toBe('success');
    expect(reached?.priority).toBeLessThan(4);
    hook.unmount();
  });
});
