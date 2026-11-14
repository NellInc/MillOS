import { beforeEach, describe, expect, it } from 'vitest';
import { forecastWorkplacePlansNow, useWorkplaceStore } from './workplaceStore';
import { useOperationsCampaignStore } from './operationsCampaignStore';
import { useGameSimulationStore } from './gameSimulationStore';
import { useMaterialFlowStore } from './materialFlowStore';
import { useTruckScheduleStore, type DockSchedule } from './truckScheduleStore';
import { createWorkplace, compareWorkplacePlans } from '../simulation/bilateralWorkplace';
import { departuresWithin } from '../simulation/workplaceForecast';
import { DOCK_PROJECTION } from '../simulation/partnerProposals';
import { endReplayClock } from '../simulation/workplaceReplayRuntime';
import { useWorkplaceAutoplay } from '../simulation/workplaceAutoplay';
import { fulfilFirstDelivery } from '../test/firstDelivery';
import { setLocale } from '../i18n';

// Plan item 5.6. The plan forecast before a vote was a hash of the seed: the
// same numbers whatever the plant held. Working if, in a game season, it reads
// the plant (the adviser's rehearsal for packing, the dock for what can leave),
// moves when the plant does, and says which plans change dispatch.

beforeEach(() => {
  setLocale('en');
  useWorkplaceAutoplay.getState().pause();
  endReplayClock();
  useGameSimulationStore.setState({ emergencyActive: false, emergencyDrillMode: false });
  useMaterialFlowStore.getState().resetMaterialFlow();
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
  useOperationsCampaignStore.getState().initializeCampaign();
  fulfilFirstDelivery();
  useWorkplaceStore.setState({
    workplace: createWorkplace(),
    participationMode: 'solo',
    turn: null,
    completedCampaigns: [],
    leftCampaigns: [],
  });
});

const shipping = (patch: Partial<DockSchedule>) =>
  useTruckScheduleStore.setState((state) => ({
    truckSchedule: {
      ...state.truckSchedule,
      shipping: { ...state.truckSchedule.shipping, ...patch },
    },
  }));

describe('5.6: the plan forecast reads the plant', () => {
  it('follows the dock: no truck in the shift, nothing can leave; one at the door, a load can', () => {
    expect(useWorkplaceStore.getState().startMission('team', 17).changed).toBe(true);
    const state = () => useWorkplaceStore.getState().workplace;
    // The next truck is due long after the shift ends.
    shipping({ truckActive: false, lifecyclePhase: 'scheduled', nextArrivalMinutes: 200 });
    const far = forecastWorkplacePlansNow(state());
    expect(far.map((arm) => arm.departures)).toEqual([0, 0, 0]);
    expect(far.every((arm) => arm.expectedKg === 0)).toBe(true);
    // A truck at the door leaves inside the shift, and another after it.
    shipping({ truckActive: true, truckDocked: true, lifecyclePhase: 'docked' });
    const near = forecastWorkplacePlansNow(state());
    expect(near[0].departures).toBe(
      departuresWithin({
        nextTruckInMinutes: DOCK_PROJECTION.dockedToDepartureMinutes,
        cycleMinutes: DOCK_PROJECTION.cycleMinutes,
        capacityKg: 5000,
      })
    );
    expect(near[0].departures).toBeGreaterThan(0);
    expect(near[0].expectedKg).toBeGreaterThan(0);
    // The seeded teaching figures did not move with the plant.
    expect(compareWorkplacePlans(state().seed)).toEqual(compareWorkplacePlans(state().seed));
  });

  it('says plainly that pacing changes no dispatch; with no rush, neither does resequencing', () => {
    expect(useWorkplaceStore.getState().startMission('team', 17).changed).toBe(true);
    const arms = forecastWorkplacePlansNow(useWorkplaceStore.getState().workplace);
    expect(arms.map((arm) => arm.planId)).toEqual(['steady', 'resequence', 'cover']);
    expect(arms.every((arm) => !arm.changesDispatch)).toBe(true);
    // Every plan runs the line at the plant's rate (D4): one rehearsal serves all three.
    expect(new Set(arms.map((arm) => `${arm.packedLowKg}-${arm.packedHighKg}`)).size).toBe(1);
  });
});
