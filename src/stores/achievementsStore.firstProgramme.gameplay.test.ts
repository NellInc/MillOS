import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAchievementTracker } from '../hooks/useAchievementTracker';
import { useAchievementsStore } from './achievementsStore';
import { useOperationsCampaignStore, type CampaignActor } from './operationsCampaignStore';

/**
 * "First programme accepted" is for something the player did (plan tail, after
 * wave 3d). Since the partner takes the next programme early when no open order
 * is at risk, a programme can be accepted by the partner (logged as the
 * controller) or an agent, and the tracker earned it on any acceptance. Working
 * if only the player's own acceptance earns it.
 */
const earned = () =>
  useAchievementsStore.getState().achievements.find((a) => a.id === 'first-programme')?.unlocked;

/** The guided delivery made, its programme's other two orders still open. */
function firstDeliveryMade() {
  useOperationsCampaignStore.getState().resetCampaign();
  useOperationsCampaignStore.setState((state) => ({
    orders: state.orders.map((order) =>
      order.id === 'order-001' ? { ...order, status: 'fulfilled', completedAtMinute: 10 } : order
    ),
  }));
}

describe('the first programme achievement', () => {
  let unmount: () => void;
  beforeEach(() => {
    useAchievementsStore.getState().resetAchievements();
    unmount = renderHook(() => useAchievementTracker()).unmount;
  });
  afterEach(() => unmount());

  it.each(['controller', 'agent'] as CampaignActor[])(
    'is not earned when the %s takes a programme',
    (actor) => {
      firstDeliveryMade();
      expect(
        useOperationsCampaignStore.getState().acceptNextProgramme(actor, { early: true })
      ).toBe(true);
      expect(earned()).toBe(false);
    }
  );

  it("is earned on the player's own acceptance", () => {
    firstDeliveryMade();
    expect(
      useOperationsCampaignStore.getState().acceptNextProgramme('operator', { early: true })
    ).toBe(true);
    expect(earned()).toBe(true);
  });
});
