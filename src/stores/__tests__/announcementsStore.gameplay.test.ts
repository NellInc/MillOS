import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAnnouncementsStore, type AnnouncementInput } from '../announcementsStore';

const reset = () =>
  useAnnouncementsStore.setState({
    announcements: [],
    lastAnnouncementTime: {},
    mode: 'focused',
    captionsEnabled: true,
    context: { onboarding: false, scadaFocus: false, userInput: false, safetyCritical: false },
  });

const live = () => useAnnouncementsStore.getState().announcements.filter((a) => !a.dismissed);

describe('announcementsStore gameplay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-02T08:00:00Z'));
    reset();
  });

  it('setting the PA to Off retires queued routine captions but keeps safety-critical ones', () => {
    const store = useAnnouncementsStore.getState();
    store.addAnnouncement({
      type: 'info',
      message: 'Dust extraction stable.',
      priority: 2,
      channel: 'operational',
    });
    store.addAnnouncement({
      type: 'success',
      message: 'Halfway to the daily target.',
      priority: 3,
      channel: 'operational',
    });
    store.addAnnouncement({
      type: 'emergency',
      message: 'Critical alarm at R.M. 101.',
      priority: 4,
      channel: 'operational',
    });
    expect(live()).toHaveLength(3);

    useAnnouncementsStore.getState().setMode('off');

    // Off quiets routine traffic: a caption queued a moment ago must not play
    // on after the player turned the PA off. The transcript keeps it.
    expect(live().map((a) => a.message)).toEqual(['Critical alarm at R.M. 101.']);
    expect(useAnnouncementsStore.getState().announcements).toHaveLength(3);
  });

  it('captions a forklift stop engaged again soon after it was released', () => {
    const stop: AnnouncementInput = {
      type: 'emergency',
      message: 'Forklift emergency stop.',
      priority: 4,
      channel: 'safety',
      topic: 'forklift-stop',
      copy: { catalog: 'keyboardShortcutsPA', key: 'forkliftStop' },
    };
    useAnnouncementsStore.getState().addAnnouncement(stop);
    expect(live()).toHaveLength(1);

    // Released: the producer retires the topic (shared.tsx retireForkliftStopLines).
    vi.advanceTimersByTime(3000);
    useAnnouncementsStore
      .getState()
      .dismissMatching((announcement) => announcement.topic === 'forklift-stop');
    expect(live()).toHaveLength(0);

    // Engaged again within the 15 s cooldown: a new stop, so a new caption.
    vi.advanceTimersByTime(5000);
    useAnnouncementsStore.getState().addAnnouncement(stop);
    expect(live()).toHaveLength(1);
  });

  it('still holds a plain repeat of a topic line that is still showing', () => {
    const stop: AnnouncementInput = {
      type: 'emergency',
      message: 'Forklift emergency stop.',
      priority: 4,
      channel: 'safety',
      topic: 'forklift-stop',
      copy: { catalog: 'keyboardShortcutsPA', key: 'forkliftStop' },
    };
    useAnnouncementsStore.getState().addAnnouncement(stop);
    vi.advanceTimersByTime(2000);
    useAnnouncementsStore.getState().addAnnouncement(stop);
    expect(useAnnouncementsStore.getState().announcements).toHaveLength(1);
  });
});
