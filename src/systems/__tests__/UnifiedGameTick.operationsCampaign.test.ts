import { beforeEach, describe, expect, it } from 'vitest';
import { useBreakdownStore } from '../../stores/breakdownStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useMaterialFlowStore } from '../../stores/materialFlowStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { useQCLabStore } from '../../stores/qcLabStore';
import { useTruckScheduleStore } from '../../stores/truckScheduleStore';
import { useUIStore } from '../../stores/uiStore';
import type { TickContext } from '../CentralTickSystem';
import { resetUnifiedTickState, unifiedGameTick } from '../UnifiedGameTick';

const context: TickContext = {
  deltaSeconds: 0.5,
  gameTime: 0,
  gameSpeed: 1,
  elapsedTime: 0,
  tickCount: 1,
};

describe('UnifiedGameTick operations campaign consequences', () => {
  beforeEach(() => {
    resetUnifiedTickState();
    useOperationsCampaignStore.getState().resetCampaign();
    useTruckScheduleStore.getState().resetTruckSchedule();
    useMaterialFlowStore.getState().resetMaterialFlow();
    useBreakdownStore.getState().resetBreakdownStore();
    useQCLabStore.getState().resetQCLab();
    useGameSimulationStore.getState().setWeather('clear');
    useUIStore.setState({ alerts: [] });

    // Synchronize the module-level dock edge detectors before each assertion.
    unifiedGameTick(context);
  });

  it('applies a delayed collection to the truck schedule exactly once', () => {
    useTruckScheduleStore.getState().setTruckActive('shipping', false);
    const incident = useOperationsCampaignStore.getState().triggerIncident('delayed_truck')!;
    expect(useTruckScheduleStore.getState().truckSchedule.shipping.nextArrivalMinutes).toBe(20);

    unifiedGameTick({ ...context, tickCount: 2 });

    // The arrival timer now runs on game minutes (0.5 s at 1x = 1/120 min).
    expect(useTruckScheduleStore.getState().truckSchedule.shipping.nextArrivalMinutes).toBeCloseTo(
      65 - 1 / 120,
      6
    );
    expect(
      useOperationsCampaignStore.getState().incidents.find((item) => item.id === incident.id)
        ?.effectApplied
    ).toBe(true);

    unifiedGameTick({ ...context, tickCount: 3 });
    expect(useTruckScheduleStore.getState().truckSchedule.shipping.nextArrivalMinutes).toBeCloseTo(
      65 - 2 / 120,
      6
    );
  });

  it('holds a delay raised while the truck is en route for its next scheduled arrival', () => {
    // The initial shipping truck is already active, so its timer is not running.
    const incident = useOperationsCampaignStore.getState().triggerIncident('delayed_truck')!;
    unifiedGameTick({ ...context, tickCount: 2 });
    expect(useTruckScheduleStore.getState().truckSchedule.shipping.nextArrivalMinutes).toBe(20);
    expect(
      useUIStore.getState().alerts.some((alert) => alert.id === `campaign-${incident.id}`)
    ).toBe(true);

    useTruckScheduleStore.getState().recordTruckDeparture('shipping', 30);
    const cadenceMinutes =
      useTruckScheduleStore.getState().truckSchedule.shipping.nextArrivalMinutes;
    unifiedGameTick({ ...context, tickCount: 3 });

    expect(useTruckScheduleStore.getState().truckSchedule.shipping.nextArrivalMinutes).toBeCloseTo(
      cadenceMinutes + 45 - 1 / 120,
      6
    );
    unifiedGameTick({ ...context, tickCount: 4 });
    expect(useTruckScheduleStore.getState().truckSchedule.shipping.nextArrivalMinutes).toBeCloseTo(
      cadenceMinutes + 45 - 2 / 120,
      6
    );
  });

  it('brings the next truck back to a dock once its arrival timer runs out', () => {
    useTruckScheduleStore.getState().recordTruckDeparture('receiving', 10);
    expect(useTruckScheduleStore.getState().truckSchedule.receiving.truckActive).toBe(false);
    const minutesToArrival =
      useTruckScheduleStore.getState().truckSchedule.receiving.nextArrivalMinutes;

    // At 180x one 0.5 s tick advances 1.5 game minutes.
    const ticks = Math.ceil(minutesToArrival / 1.5);
    for (let tick = 0; tick < ticks; tick += 1) {
      unifiedGameTick({ ...context, gameSpeed: 180, tickCount: 2 + tick });
    }

    expect(useTruckScheduleStore.getState().truckSchedule.receiving).toMatchObject({
      truckActive: true,
      arrivalReady: true,
      lifecyclePhase: 'approaching',
    });
  });

  it('couples severe rain into the shared weather simulation', () => {
    useOperationsCampaignStore.getState().triggerIncident('severe_rain');

    unifiedGameTick({ ...context, tickCount: 2 });

    expect(useGameSimulationStore.getState().weather).toBe('storm');
    expect(useUIStore.getState().alerts.at(-1)).toMatchObject({
      type: 'warning',
      title: 'Severe rain and drainage loading',
    });
  });

  it('turns a supplier notification into a real quality hold', () => {
    useOperationsCampaignStore.getState().triggerIncident('supplier_contamination');

    unifiedGameTick({ ...context, tickCount: 2 });

    expect(useQCLabStore.getState().qcLab.contaminationAlerts).toHaveLength(1);
    expect(useQCLabStore.getState().qcLab.contaminationAlerts[0]).toMatchObject({
      type: 'supplier_notification',
      resolved: false,
      resolution: null,
    });
    expect(useOperationsCampaignStore.getState().getIncidentEffect().dispatchBlocked).toBe(true);
  });

  it('applies control-link degradation through the same production multiplier path', () => {
    useOperationsCampaignStore.getState().triggerIncident('control_network_degraded');

    unifiedGameTick({ ...context, tickCount: 2 });

    expect(useOperationsCampaignStore.getState().getProductionMultiplier()).toBeLessThan(1);
    expect(useUIStore.getState().alerts.at(-1)?.title).toBe('Control network degraded');
  });
});
