import { beforeEach, describe, expect, it } from 'vitest';
import { useProductionStore } from '../productionStore';
import { useTruckScheduleStore } from '../truckScheduleStore';

/**
 * Overview's Dock Status cards (and the yard's holographic board) read
 * productionStore.dockStatus, which nothing wrote: it showed "Receiving: Clear,
 * next truck in 12 min" and "Shipping: Clear" for the whole session while trucks
 * docked, unloaded and left. Working if the cards follow the truck schedule.
 */
describe('dock status follows the truck schedule', () => {
  beforeEach(() => {
    useTruckScheduleStore.getState().resetTruckSchedule();
  });

  it('reads a docked shipping truck as loading and a departing one as departing', () => {
    useTruckScheduleStore.getState().setTruckDocked('shipping', true);
    expect(useProductionStore.getState().dockStatus.shipping.status).toBe('loading');
    useTruckScheduleStore.getState().setTruckLifecycle('shipping', 'departing');
    expect(useProductionStore.getState().dockStatus.shipping.status).toBe('departing');
  });

  it('counts the next arrival down in whole game minutes after a departure', () => {
    useTruckScheduleStore.getState().recordTruckDeparture('receiving', 30);
    expect(useProductionStore.getState().dockStatus.receiving).toEqual({
      status: 'clear',
      etaMinutes: 12,
    });
    useTruckScheduleStore.getState().tickArrivals(4.5);
    expect(useProductionStore.getState().dockStatus.receiving).toEqual({
      status: 'clear',
      etaMinutes: 8,
    });
  });

  it('reads an approaching truck as arriving', () => {
    useTruckScheduleStore.getState().recordTruckDeparture('shipping', 30);
    useTruckScheduleStore.getState().tickArrivals(60);
    expect(useProductionStore.getState().dockStatus.shipping.status).toBe('arriving');
  });
});
