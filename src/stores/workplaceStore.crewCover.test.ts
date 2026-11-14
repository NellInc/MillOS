import { beforeEach, describe, expect, it } from 'vitest';
import { MachineType, type MachineData } from '../types';
import { forecastWorkplacePlansNow, planPlantEffect, useWorkplaceStore } from './workplaceStore';
import { useOperationsCampaignStore } from './operationsCampaignStore';
import { useGameSimulationStore } from './gameSimulationStore';
import { useMaterialFlowStore, type ProductionBatch } from './materialFlowStore';
import { stepLabBench, useQCLabStore } from './qcLabStore';
import { useBreakdownStore } from './breakdownStore';
import { useProductionStore } from './productionStore';
import { shipmentOrdersFrom } from '../simulation/shipmentPlan';
import { createWorkplace } from '../simulation/bilateralWorkplace';
import {
  ABSENCE_MINUTES,
  WORKPLACE_CHECKS,
  requiredChecks,
  seasonDraw,
  type CrewRole,
} from '../simulation/workplaceCampaign';
import { crewAtWork } from '../simulation/workplaceCrew';
import {
  beginUnitService,
  resetUnitWork,
  serviceAwaitingCrew,
  stepUnitWork,
} from '../systems/unitService';
import { endReplayClock } from '../simulation/workplaceReplayRuntime';
import { useWorkplaceAutoplay } from '../simulation/workplaceAutoplay';
import { fulfilFirstDelivery } from '../test/firstDelivery';
import { capturePhysicalSession } from '../utils/physicalSession';
import { setLocale } from '../i18n';
import type { WorkplaceState } from '../types/workplace';

// Plan item 5.4 (D4). "Invite voluntary cover" changed nothing the plant
// reads. An absence is a pressure of the season, on the one shift its draw
// gives the repeat-cover pressure: one authored role (Maintenance when it is
// the drawn decliner, else Quality) is away for that shift's first
// ABSENCE_MINUTES. The lab's bench starts no new test while Quality is away; a
// service asked for while Maintenance is away starts on its return (nothing
// taken meanwhile), and one already under way pauses. Working if cover agreed
// turns waiting work into work that runs, the work always starts once the
// absence ends, and a season with no absence drawn never waits at all.

beforeEach(() => {
  resetUnitWork();
  setLocale('en');
  useWorkplaceAutoplay.getState().pause();
  endReplayClock();
  useGameSimulationStore.setState({
    emergencyActive: false,
    emergencyDrillMode: false,
    preEmergencyMachineStatuses: new Map(),
  });
  useMaterialFlowStore.getState().resetMaterialFlow();
  useQCLabStore.getState().resetQCLab();
  useBreakdownStore.getState().resetBreakdownStore();
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

const store = () => useWorkplaceStore.getState();
const workplace = () => store().workplace;
const must = (result: { changed: boolean; reason: string | null }) => {
  expect(result.changed, result.reason ?? '').toBe(true);
};

/** A season seed whose draw has `role` away, and the shift it is away on. */
function drawWith(role: CrewRole): { seed: number; shift: number } {
  for (let seed = 1; seed < 500; seed++) {
    const draw = seasonDraw(seed);
    if ((draw.decliner === 'maintenance') === (role === 'maintenance'))
      return { seed, shift: draw.pressures.indexOf('repeat-cover') };
  }
  throw new Error(`no seed has ${role} away`);
}

function agree(plan: WorkplaceState['planId']) {
  if (workplace().planId !== plan) must(store().selectPlan(plan));
  for (const id of requiredChecks('packing')) {
    const q = WORKPLACE_CHECKS.find((c) => c.id === id)!;
    if (workplace().campaign?.checks.packing?.[id] !== q.correct)
      must(store().answerCheck('packing', id, q.correct));
  }
  if (!workplace().members[0].understood) must(store().understand('packing'));
  if (workplace().members[0].ballot !== true) must(store().vote('packing', true));
  if (plan === 'cover' && workplace().members[0].coverConsent !== true)
    must(store().consentToCover('packing', true));
  store().simulateResponses({});
  must(store().activate(workplace().revision));
}
const finishShift = () => {
  for (let i = 0; i < 40 && workplace().phase === 'active'; i++) store().tick(5, 0, false);
};

/** Through the shifts before the absence, steady, to the absence shift's deliberation. */
function toAbsence(role: CrewRole, before: WorkplaceState['planId'] = 'steady'): void {
  const { seed, shift } = drawWith(role);
  must(store().startCampaign('team', seed));
  for (let i = 0; i < shift; i++) {
    agree(before);
    finishShift();
    must(store().nextCampaignShift());
  }
  expect(workplace().campaign?.shift).toBe(shift);
}

const awaiting = (): ProductionBatch => ({
  id: 'batch-00007',
  disposition: 'released',
  packerId: 'packer-2',
  materialType: 'semolina',
  producedKg: 800,
  availableKg: 800,
  simulationTime: 1,
  sourceContributions: [{ lotId: 'lot-00001', amount: 800, path: ['silo-4', 'packer-2'] }],
  dispositionReason: null,
  qcTestIds: [],
  dispatchManifestIds: [],
  sealed: true,
  qualityScore: 95,
  awaitingTest: true,
});
const bench = (minutes: number) =>
  stepLabBench(
    minutes,
    shipmentOrdersFrom(useOperationsCampaignStore.getState().orders),
    () => false
  );
const lab = () => useQCLabStore.getState().qcLab;

const worn = (): MachineData => ({
  id: 'rm-101',
  name: 'R.M. 101',
  type: MachineType.ROLLER_MILL,
  position: [0, 0, 0],
  size: [1, 1, 1],
  rotation: 0,
  status: 'warning',
  metrics: { rpm: 1400, temperature: 50, vibration: 2, load: 74, wear: 70, efficiency: 73 },
  lastMaintenance: '2026-08-01T00:00:00.000Z',
  nextMaintenance: '2026-08-08T00:00:00.000Z',
});
const minutesLeft = () =>
  useBreakdownStore.getState().maintenanceSchedule.find((t) => t.machineId === 'rm-101')
    ?.serviceMinutesLeft;
const parts = () =>
  Object.values(useBreakdownStore.getState().partsInventory).reduce((n, k) => n + k, 0);
const unit = () => useProductionStore.getState().machines.find((m) => m.id === 'rm-101')!;

describe('5.4: an absence is one shift of the season, and cover keeps its work going', () => {
  it('a season with no absence drawn never holds the bench or a service', () => {
    useProductionStore.setState({ machines: [worn()], productionSpeed: 1 });
    must(store().startCampaign('team', drawWith('quality').seed));
    // A season begun before draws keeps the fixed order and has no absence.
    useWorkplaceStore.setState({
      workplace: { ...workplace(), campaign: { ...workplace().campaign!, draw: undefined } },
    });
    for (let shift = 0; shift < 3; shift++) {
      agree('steady');
      expect(crewAtWork('quality') && crewAtWork('maintenance')).toBe(true);
      useQCLabStore.getState().resetQCLab();
      useMaterialFlowStore.setState({ productionBatches: [awaiting()] });
      bench(1);
      expect(lab().bench?.batchId).toBe('batch-00007');
      finishShift();
      if (shift < 2) must(store().nextCampaignShift());
    }
  });

  it('a drawn season waits only on its absence shift', () => {
    const { seed, shift } = drawWith('quality');
    must(store().startCampaign('team', seed));
    for (let i = 0; i < 3; i++) {
      agree('steady');
      expect(crewAtWork('quality')).toBe(i !== shift);
      finishShift();
      if (i < 2) must(store().nextCampaignShift());
    }
  });

  it('Quality away: the bench starts no test until it is back', () => {
    toAbsence('quality');
    agree('steady');
    useMaterialFlowStore.setState({ productionBatches: [awaiting()] });
    bench(1);
    expect(lab().bench ?? null).toBeNull();
    store().tick(ABSENCE_MINUTES, 0, false);
    bench(1);
    expect(lab().bench?.batchId).toBe('batch-00007');
  });

  // Review 2: release stays with a member qualified for it. Maintenance is
  // (its eligible tasks), so its cover runs the bench at once, and its own
  // services wait while it covers; the forecast and the effect line say so.
  it('Quality away, Maintenance covers: the test runs at once; Maintenance’s services wait', () => {
    toAbsence('quality');
    const arms = forecastWorkplacePlansNow(workplace());
    const arm = (id: string) => arms.find((a) => a.planId === id)!;
    expect(arm('steady')).toMatchObject({
      benchWaitMinutes: ABSENCE_MINUTES,
      serviceWaitMinutes: 0,
    });
    expect(arm('cover')).toMatchObject({
      benchWaitMinutes: 0,
      serviceWaitMinutes: ABSENCE_MINUTES,
    });
    expect(planPlantEffect(workplace(), 'cover').join(' ')).toMatch(
      /^Cover by Maintenance runs Quality’s lab tests until minute 10; Maintenance’s own work waits/
    );
    agree('cover');
    expect(workplace().activeCoverMemberId).toBe('maintenance');
    useMaterialFlowStore.setState({ productionBatches: [awaiting()] });
    bench(1);
    expect(lab().bench?.batchId).toBe('batch-00007');
    expect(crewAtWork('quality')).toBe(true);
    expect(crewAtWork('maintenance')).toBe(false);
    store().tick(ABSENCE_MINUTES, 0, false);
    expect(crewAtWork('maintenance')).toBe(true);
  });

  it('Quality away, only an unqualified volunteer covers: no test starts, and the line says why', () => {
    // Maintenance spent its season's cover on the shift before.
    toAbsence('quality', 'cover');
    expect(planPlantEffect(workplace(), 'cover').join(' ')).toMatch(
      /^Release stays with qualified quality staff, so cover runs no lab test/
    );
    const cover = forecastWorkplacePlansNow(workplace()).find((a) => a.planId === 'cover')!;
    expect(cover.benchWaitMinutes).toBe(ABSENCE_MINUTES);
    agree('cover');
    expect(workplace().activeCoverMemberId).toBe('packing');
    useMaterialFlowStore.setState({ productionBatches: [awaiting()] });
    bench(1);
    expect(lab().bench?.batchId).toBeUndefined();
    store().tick(ABSENCE_MINUTES, 0, false);
    bench(1);
    expect(lab().bench?.batchId).toBe('batch-00007');
  });

  it('Maintenance away: a service asked for does not begin, takes nothing, and begins on its return', () => {
    useProductionStore.setState({ machines: [worn()], productionSpeed: 1 });
    toAbsence('maintenance');
    agree('steady');
    const stock = parts();
    expect(beginUnitService('rm-101')).toEqual({ started: false, reason: 'awaiting-crew' });
    expect(serviceAwaitingCrew('rm-101')).toBe(true);
    stepUnitWork(5 * 60);
    expect(minutesLeft()).toBeUndefined();
    expect(parts()).toBe(stock);
    expect(unit().status).toBe('warning');
    store().tick(ABSENCE_MINUTES, 0, false);
    stepUnitWork(60);
    expect(serviceAwaitingCrew('rm-101')).toBe(false);
    expect(minutesLeft()).toBeGreaterThan(0);
    expect(parts()).toBe(stock - 1);
  });

  // The wait was held in unitService's memory and lost on a reload. The
  // partner would not ask again: it counts "awaiting-crew" as a service asked
  // (partnerProposalRuntime serviceAsked) and asks once per wear notice unless
  // every ask lacked a part (partnerProposals serviceKind.raise). So the wait
  // is saved with the maintenance domain. Working if a service asked for while
  // Maintenance is away still starts on their return after a reload.
  it('Maintenance away: a waiting service survives a reload and begins on their return', () => {
    useProductionStore.setState({ machines: [worn()], productionSpeed: 1 });
    toAbsence('maintenance');
    agree('steady');
    const stock = parts();
    expect(beginUnitService('rm-101')).toEqual({ started: false, reason: 'awaiting-crew' });
    // The save's maintenance domain, as capturePhysicalSession writes it.
    const saved = JSON.parse(JSON.stringify(capturePhysicalSession().maintenance)) as ReturnType<
      typeof capturePhysicalSession
    >['maintenance'];
    // A reload: the store starts fresh and the save restores it; the tick then
    // mounts and resets the unit-work memory (resetUnifiedTickState).
    useBreakdownStore.getState().resetBreakdownStore();
    useBreakdownStore.setState(saved);
    resetUnitWork();
    expect(serviceAwaitingCrew('rm-101')).toBe(true);
    stepUnitWork(5 * 60);
    expect(minutesLeft()).toBeUndefined();
    expect(parts()).toBe(stock);
    store().tick(ABSENCE_MINUTES, 0, false);
    stepUnitWork(60);
    expect(serviceAwaitingCrew('rm-101')).toBe(false);
    expect(minutesLeft()).toBeGreaterThan(0);
    expect(parts()).toBe(stock - 1);
  });

  it('Maintenance away: a service already under way pauses, then runs on', () => {
    useProductionStore.setState({ machines: [worn()], productionSpeed: 1 });
    toAbsence('maintenance');
    // Begun before the absence shift is worked: nobody is away yet.
    expect(beginUnitService('rm-101').started).toBe(true);
    const full = minutesLeft()!;
    agree('steady');
    stepUnitWork(5 * 60);
    expect(minutesLeft()).toBe(full);
    store().tick(ABSENCE_MINUTES, 0, false);
    stepUnitWork(5 * 60);
    expect(minutesLeft()).toBeCloseTo(full - 5, 9);
  });

  it('Maintenance away with cover agreed: the service begins at once', () => {
    useProductionStore.setState({ machines: [worn()], productionSpeed: 1 });
    toAbsence('maintenance');
    agree('cover');
    expect(workplace().activeCoverMemberId).not.toBe('maintenance');
    expect(beginUnitService('rm-101').started).toBe(true);
    const full = minutesLeft()!;
    stepUnitWork(5 * 60);
    expect(minutesLeft()).toBeCloseTo(full - 5, 9);
  });

  it('with no season the bench and the service never wait', () => {
    useProductionStore.setState({ machines: [worn()], productionSpeed: 1 });
    useMaterialFlowStore.setState({ productionBatches: [awaiting()] });
    bench(1);
    expect(lab().bench?.batchId).toBe('batch-00007');
    expect(beginUnitService('rm-101').started).toBe(true);
    const full = minutesLeft()!;
    stepUnitWork(5 * 60);
    expect(minutesLeft()).toBeCloseTo(full - 5, 9);
  });
});
