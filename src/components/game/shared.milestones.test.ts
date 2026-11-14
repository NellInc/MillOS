import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useProductionStore } from '../../stores/productionStore';
import { useAnnouncementsStore } from '../../stores/announcementsStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { useEventAnnouncementScheduler } from './shared';
import { sharedMessages } from './shared.messages';
import { audioManager } from '../../utils/audioManager';

vi.mock('../../scada/SCADAService', () => ({
  peekSCADAService: () => null,
}));

vi.mock('../../utils/audioManager', () => ({
  audioManager: { muted: false },
}));

// D11: the PA's one line of good news is the running programme delivered, the
// line the daily bag target used to have. Bags packed for no customer are not
// news at any count.
const campaign = () => useOperationsCampaignStore.getState();
const deliverAll = () =>
  useOperationsCampaignStore.setState({
    orders: campaign().orders.map((order) => ({
      ...order,
      shippedKg: order.requiredKg,
      status: 'fulfilled' as const,
      completedAtMinute: 100,
    })),
  });
const deliverOne = (id: string) =>
  useOperationsCampaignStore.setState({
    orders: campaign().orders.map((order) =>
      order.id === id
        ? { ...order, shippedKg: order.requiredKg, status: 'fulfilled' as const }
        : order
    ),
  });

describe('programme-delivered caption', () => {
  let addAnnouncement: ReturnType<typeof vi.fn>;
  const captions = () =>
    addAnnouncement.mock.calls
      .filter(([input]) => (input as { source?: string }).source === 'Production controller')
      .map(([input]) => input as { message: string; priority: number; type: string });

  beforeEach(() => {
    vi.useFakeTimers();
    campaign().resetCampaign();
    addAnnouncement = vi.fn();
    useAnnouncementsStore.setState({ mode: 'focused' });
    useProductionStore.setState({ addAnnouncement, machines: [], dailyBagsProduced: 0 } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
    audioManager.muted = false;
    campaign().resetCampaign();
  });

  it('says nothing for bags, one line for the delivered programme, at good-news priority', () => {
    const hook = renderHook(() => useEventAnnouncementScheduler());
    useProductionStore.setState({ dailyBagsProduced: 5000 });
    deliverOne('order-001');
    deliverOne('order-002');
    vi.advanceTimersByTime(5000);
    expect(captions()).toHaveLength(0);
    deliverOne('order-003');
    vi.advanceTimersByTime(15000);
    expect(captions()).toHaveLength(1);
    expect(captions()[0].message).toBe(sharedMessages.en.programmeDelivered);
    // Priority 4 is the red pulsing alarm tier; this is good news.
    expect(captions()[0].type).toBe('success');
    expect(captions()[0].priority).toBeLessThan(4);
    hook.unmount();
  });

  // A forfeit closes its order 'cancelled'. Two orders shipped and one
  // forfeited is a programme closed, not delivered: no good news (D-054).
  it('says nothing when the programme closes with a forfeited order', () => {
    const hook = renderHook(() => useEventAnnouncementScheduler());
    deliverOne('order-001');
    deliverOne('order-002');
    expect(campaign().forfeitOrder('order-003')).toBe(true);
    vi.advanceTimersByTime(15000);
    expect(campaign().orders.find((order) => order.id === 'order-003')?.status).toBe('cancelled');
    expect(captions()).toHaveLength(0);
    // The next programme, delivered whole, is still news.
    expect(campaign().acceptNextProgramme()).toBe(true);
    vi.advanceTimersByTime(5000);
    deliverAll();
    vi.advanceTimersByTime(5000);
    expect(captions()).toHaveLength(1);
    hook.unmount();
  });

  it('stays quiet about a programme delivered before a reload', () => {
    deliverAll();
    const hook = renderHook(() => useEventAnnouncementScheduler());
    vi.advanceTimersByTime(15000);
    expect(captions()).toHaveLength(0);
    hook.unmount();
  });

  // D15: mute silences sound only, so the delivery is captioned while muted,
  // once, and unmuting does not say it again.
  it('captions a programme delivered while muted at once, not again on unmute, and the next one too', () => {
    const hook = renderHook(() => useEventAnnouncementScheduler());
    audioManager.muted = true;
    deliverAll();
    vi.advanceTimersByTime(5000);
    expect(captions()).toHaveLength(1);
    audioManager.muted = false;
    vi.advanceTimersByTime(5000);
    expect(captions()).toHaveLength(1);
    // The next programme is accepted and delivered: said again.
    expect(campaign().acceptNextProgramme()).toBe(true);
    vi.advanceTimersByTime(5000);
    expect(captions()).toHaveLength(1);
    deliverAll();
    vi.advanceTimersByTime(5000);
    expect(captions()).toHaveLength(2);
    hook.unmount();
  });
});
