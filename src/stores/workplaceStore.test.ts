import { beforeEach, describe, expect, it } from 'vitest';
import { useWorkplaceStore } from './workplaceStore';
import { createWorkplace } from '../simulation/bilateralWorkplace';
import { safeJSONStorage } from './storage';

beforeEach(async () => {
  await safeJSONStorage.removeItem('millos-workplace-laboratory');
  useWorkplaceStore.setState({ workplace: createWorkplace() });
});

describe('workplace store atomic publication and persistence', () => {
  it('publishes only accepted transitions', () => {
    let notifications = 0;
    const unsubscribe = useWorkplaceStore.subscribe(() => {
      notifications += 1;
    });
    const store = useWorkplaceStore.getState();
    const initial = store.workplace;
    expect(store.activate(initial.revision).changed).toBe(false);
    expect(notifications).toBe(0);
    expect(store.start('game', 2).changed).toBe(true);
    expect(notifications).toBe(1);
    expect(store.start('game', 2).changed).toBe(true);
    expect(notifications).toBe(2);
    unsubscribe();
  });
  it('reloads paid active obligations into a non-authoritative review', async () => {
    const store = useWorkplaceStore.getState();
    store.start('game');
    store.selectPlan('cover');
    store.simulateResponses();
    store.activate(useWorkplaceStore.getState().workplace.revision);
    store.tick(3, 40, false);
    const running = useWorkplaceStore.getState().workplace;
    expect(running.phase).toBe('active');
    await useWorkplaceStore.persist.rehydrate();
    const reloaded = useWorkplaceStore.getState().workplace;
    expect(reloaded.phase).toBe('review');
    expect(reloaded.finance.compensationPaid).toBeCloseTo(2.4);
    expect(reloaded.finance.cash).toBeCloseTo(running.finance.cash);
    expect(reloaded.activeCoverMemberId).toBeNull();
    store.tick(10, 500, false);
    const recovered = useWorkplaceStore.getState().workplace;
    expect(recovered.shippedKg).toBe(reloaded.shippedKg);
    expect(recovered.finance).toEqual(reloaded.finance);
    expect(recovered.promisesKept).toBe(1);
    expect(recovered.members.every((m) => m.recoveryOwedMinutes === 0)).toBe(true);
  });
  it('does not merge executable fields or malformed saved authority', async () => {
    await safeJSONStorage.setItem('millos-workplace-laboratory', {
      version: 1,
      state: { workplace: { phase: 'active', cash: 1e99 }, activate: 'poison' },
    });
    await useWorkplaceStore.persist.rehydrate();
    expect(useWorkplaceStore.getState().workplace).toEqual(createWorkplace());
    expect(typeof useWorkplaceStore.getState().activate).toBe('function');
  });
});
