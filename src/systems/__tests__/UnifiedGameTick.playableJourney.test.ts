import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as ts from 'typescript';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import { MachineType, type MachineData } from '../../types';
import { centralTick } from '../../systems/CentralTickSystem';
import { resetUnifiedTickState, unifiedGameTick } from '../../systems/UnifiedGameTick';
import { useProductionStore } from '../../stores/productionStore';
import { useMaterialFlowStore } from '../../stores/materialFlowStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useTruckScheduleStore } from '../../stores/truckScheduleStore';
import { useBreakdownStore } from '../../stores/breakdownStore';
import { useQCLabStore } from '../../stores/qcLabStore';
import { hasCommunityBakerySupply } from '../../simulation/communityLife';
import { deriveDeliveryJourney } from '../../components/ui-new/onboarding/deliveryJourney';
import { toSimulationMinutes } from '../../simulation/simulationClock';
import type { OperationsChallengeId } from '../../simulation/operationsPlay';
import {
  createTruckController,
  stepTruckController,
  type TruckControllerState,
} from '../../components/truckbay/truckController';
import type { TruckAnimState } from '../../components/truckbay/useTruckPhysics';
import type { TruckLifecyclePhase } from '../../stores/truckScheduleStore';

// Execute the actual current scene's roster factory, rather than duplicating a
// machine table. The final lane also couples the real truck controller and dock
// predicates. WebGL, React input and rendered truck motion remain native gates.
const sceneFile = ts.createSourceFile(
  'MillScene.tsx',
  readFileSync('src/components/MillScene.tsx', 'utf8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX
);
const bodies: string[] = [];
function findRoster(node: ts.Node) {
  if (
    ts.isVariableDeclaration(node) &&
    node.name.getText(sceneFile) === 'machines' &&
    node.initializer &&
    ts.isCallExpression(node.initializer) &&
    node.initializer.expression.getText(sceneFile) === 'useMemo'
  ) {
    const factory = node.initializer.arguments[0];
    if (factory && ts.isArrowFunction(factory)) bodies.push(factory.body.getText(sceneFile));
  }
  ts.forEachChild(node, findRoster);
}
findRoster(sceneFile);
expect(bodies).toHaveLength(1);
const rosterJS = ts.transpileModule(`function buildRoster() ${bodies[0]}`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const makeRoster = new Function(
  'SITE_LAYOUT',
  'MachineType',
  `${rosterJS}; return buildRoster();`
) as (layout: typeof SITE_LAYOUT, types: typeof MachineType) => MachineData[];
const deltaSeconds = centralTick.getStats().tickInterval;
const morningWindowTicks = Math.ceil((240 * 60) / (180 * deltaSeconds)) + 1;
let tickCount = 0;
let receivingDwell = 0;
let fetchCalls = 0;
let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetUnifiedTickState();
  useMaterialFlowStore.getState().resetMaterialFlow();
  useOperationsCampaignStore.getState().resetCampaign();
  useGameSimulationStore.getState().resetGameState();
  useTruckScheduleStore.getState().resetTruckSchedule();
  useBreakdownStore.getState().resetBreakdownStore();
  useQCLabStore.getState().resetQCLab();
  useProductionStore.setState({
    ...useProductionStore.getInitialState(),
    machines: makeRoster(SITE_LAYOUT, MachineType),
    productionSpeed: 1,
  });
  expect(
    useProductionStore
      .getState()
      .machines.map((m) => m.id)
      .sort()
  ).toEqual([...useMaterialFlowStore.getState().machineBuffers.keys()].sort());
  fetchCalls = 0;
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
    fetchCalls++;
    return Promise.reject(new Error('Optional services unavailable for offline audit'));
  });
  tickCount = 0;
  receivingDwell = 0;
});

afterEach(() => {
  fetchSpy.mockRestore();
  expect(fetchCalls).toBe(0);
  expect(Math.abs(useMaterialFlowStore.getState().getMaterialBalance().errorKg)).toBeLessThan(
    0.001
  );
  expect(Math.abs(useMaterialFlowStore.getState().getGenealogyBalance().errorKg)).toBeLessThan(
    0.001
  );
});

function step(gameSpeed = useGameSimulationStore.getState().gameSpeed) {
  // Public dock transitions supply only lifecycle signals. Flour, lot genealogy,
  // loading amounts, manifests and campaign credit are exclusively computed by
  // the production/material/campaign authorities.
  const trucks = useTruckScheduleStore.getState();
  for (const dock of ['receiving', 'shipping'] as const) {
    const schedule = trucks.truckSchedule[dock];
    if (schedule.truckActive && !schedule.truckDocked) {
      trucks.setTruckDocked(dock, true);
      trucks.setTruckTransferReady(dock, true);
    }
  }
  unifiedGameTick({
    deltaSeconds,
    gameSpeed,
    gameTime: useGameSimulationStore.getState().gameTime,
    elapsedTime: tickCount * deltaSeconds,
    tickCount: ++tickCount,
  });
  const campaign = useOperationsCampaignStore.getState();
  if (
    campaign.execution.dispatchLoad.status === 'ready' &&
    useTruckScheduleStore.getState().truckSchedule.shipping.transferReady
  ) {
    useTruckScheduleStore.getState().recordTruckDeparture(
      'shipping',
      toSimulationMinutes({
        day: useGameSimulationStore.getState().gameDay,
        hour: useGameSimulationStore.getState().gameTime,
      })
    );
  }
  if (
    useTruckScheduleStore.getState().truckSchedule.receiving.transferReady &&
    ++receivingDwell >= 3
  ) {
    useTruckScheduleStore.getState().recordTruckDeparture(
      'receiving',
      toSimulationMinutes({
        day: useGameSimulationStore.getState().gameDay,
        hour: useGameSimulationStore.getState().gameTime,
      })
    );
    receivingDwell = 0;
  }
}

it('fulfils the bakery commitment within its actual default-speed morning window', () => {
  expect(useGameSimulationStore.getState().gameSpeed).toBe(180);
  for (let i = 0; i < morningWindowTicks; i++) step();

  const campaign = useOperationsCampaignStore.getState();
  expect(campaign.orders[0]).toMatchObject({ status: 'fulfilled', qualityFailureKg: 0 });
  expect(campaign.orders[0].completedAtMinute).toBeLessThanOrEqual(campaign.orders[0].dueAtMinute);
  expect(hasCommunityBakerySupply(campaign.orders, campaign.elapsedMinutes)).toBe(true);
  expect(campaign.reports.length).toBeGreaterThan(0);
});

it('recovers actual certification hold and dispatches within the default morning window', () => {
  useQCLabStore.getState().updateCertificationStatus('expired');
  for (let i = 0; i < 30; i++) step();
  expect(useMaterialFlowStore.getState().shippedKg).toBe(0);
  expect(
    useMaterialFlowStore.getState().productionBatches.some((batch) => batch.availableKg > 0)
  ).toBe(true);
  expect(useOperationsCampaignStore.getState().execution.stage).toBe('quality_hold');

  useQCLabStore.getState().updateCertificationStatus('valid');
  for (let i = 30; i < morningWindowTicks; i++) step();

  expect(useOperationsCampaignStore.getState().orders[0].status).toBe('fulfilled');
});

it.each(['power_recovery', 'packaging_recovery', 'network_recovery'] as OperationsChallengeId[])(
  'allows timely recovery of %s at the actual default pace',
  (challengeId) => {
    step();
    expect(useOperationsCampaignStore.getState().startChallenge(challengeId)).toBe(true);
    const run = useOperationsCampaignStore.getState().activeChallenge!;
    step();
    expect(
      useOperationsCampaignStore.getState().incidents.find((i) => i.id === run.incidentId)
        ?.effectApplied
    ).toBe(true);
    // Give the player ten real seconds to notice the event before responding.
    for (let i = 0; i < Math.ceil(10 / deltaSeconds); i++) step();
    useOperationsCampaignStore.getState().acknowledgeIncident(run.incidentId);
    useOperationsCampaignStore.getState().mitigateIncident(run.incidentId);
    expect(useOperationsCampaignStore.getState().finishChallengeRecovery()).toBe(true);
    for (let i = 0; i < 400 && useOperationsCampaignStore.getState().activeChallenge; i++) step();

    expect(useOperationsCampaignStore.getState().challengeHistory.at(-1)?.status).toBe('completed');
  }
);

// Longer source journeys cover changeover and replay, including mixed old/new
// work in progress. Physical truck travel and interactive maintenance remain
// separate browser acceptance questions.
function completeProgramme() {
  for (
    let i = 0;
    i < 1200 && useOperationsCampaignStore.getState().orders.some((o) => o.status !== 'fulfilled');
    i++
  )
    step();
  expect(useOperationsCampaignStore.getState().orders.every((o) => o.status === 'fulfilled')).toBe(
    true
  );
  expect(useOperationsCampaignStore.getState().orders.every((o) => o.qualityFailureKg === 0)).toBe(
    true
  );
}

it.each([30, 180])(
  'completes all real recipes and replays without resetting physical stock at %ix',
  (speed) => {
    useGameSimulationStore.getState().setGameSpeed(speed);
    completeProgramme();
    expect(useMaterialFlowStore.getState().shippedKg).toBeCloseTo(18000, 6);
    const physicalBefore = useMaterialFlowStore.getState().shippedKg;
    const sessionBefore = useMaterialFlowStore.getState().sessionId;
    expect(useOperationsCampaignStore.getState().acceptNextProgramme()).toBe(true);
    expect(useMaterialFlowStore.getState().sessionId).toBe(sessionBefore);
    expect(useMaterialFlowStore.getState().shippedKg).toBe(physicalBefore);
    completeProgramme();
    expect(useMaterialFlowStore.getState().shippedKg - physicalBefore).toBeCloseTo(9000, 6);
    expect(useMaterialFlowStore.getState().sessionId).toBe(sessionBefore);
    expect(useOperationsCampaignStore.getState().reports.length).toBeGreaterThan(0);
  }
);

it('improves worn-machine quality through real preventive service and parts consumption', () => {
  completeProgramme();
  expect(useOperationsCampaignStore.getState().acceptNextProgramme()).toBe(true);
  completeProgramme();
  const production = useProductionStore.getState();
  const qualityBefore = production.metrics.quality;
  const materialBefore = useMaterialFlowStore.getState().getMaterialBalance();
  const partsBefore = { ...useBreakdownStore.getState().partsInventory };
  const worn = production.machines.filter((m) => m.metrics.efficiency < 100);
  expect(worn.length).toBeGreaterThan(0);
  for (const machine of worn) {
    const parts = useBreakdownStore.getState();
    expect(parts.getBreakdownForMachine(machine.id)).toBeUndefined();
    const part =
      machine.type === MachineType.ROLLER_MILL
        ? 'bearings'
        : machine.type === MachineType.PLANSIFTER
          ? 'filters'
          : 'belts';
    parts.scheduleMaintenanceTask({
      machineId: machine.id,
      machineName: machine.name,
      scheduledTime: useGameSimulationStore.getState().gameTime,
      type: 'preventive',
      priority: 'medium',
      partsNeeded: [part],
    });
    const task = useBreakdownStore
      .getState()
      .maintenanceSchedule.find((t) => t.machineId === machine.id && !t.completed)!;
    parts.completeMaintenanceTask(task.id);
    expect(
      useBreakdownStore.getState().maintenanceSchedule.find((t) => t.id === task.id)?.completed
    ).toBe(true);
    expect(production.performMaintenance(machine.id).success).toBe(true);
  }
  const partsAfter = useBreakdownStore.getState().partsInventory;
  expect(
    Object.values(partsBefore).reduce((a, b) => a + b, 0) -
      Object.values(partsAfter).reduce((a, b) => a + b, 0)
  ).toBe(worn.length);
  // Servicing changes machines and consumes parts, never the material ledger.
  expect(useMaterialFlowStore.getState().getMaterialBalance()).toEqual(materialBefore);
  step();
  expect(useProductionStore.getState().metrics.quality).toBeGreaterThan(qualityBefore);
  expect(useOperationsCampaignStore.getState().orders.every((o) => o.qualityFailureKg === 0)).toBe(
    true
  );
});

// Execute the actual dock's lifecycle predicates too. Unlike step(), this lane
// waits for the real fixed-step approach, safety service and departure phases.
const truckBayFile = ts.createSourceFile(
  'TruckBay.tsx',
  readFileSync('src/components/TruckBay.tsx', 'utf8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX
);
const predicateNames = ['isTruckPhysicallyDocked', 'isTruckTransferReady', 'getTruckLifecycle'];
const predicates: string[] = [];
function findTruckPredicates(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && predicateNames.includes(node.name.getText(truckBayFile)))
    predicates.push(`const ${node.getText(truckBayFile)};`);
  ts.forEachChild(node, findTruckPredicates);
}
findTruckPredicates(truckBayFile);
expect(predicates).toHaveLength(predicateNames.length);
const dockPredicates = new Function(
  ts.transpileModule(predicates.join('\n'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText + `;return {${predicateNames.join(',')}};`
)() as {
  isTruckPhysicallyDocked: (pose: TruckAnimState) => boolean;
  isTruckTransferReady: (pose: TruckAnimState) => boolean;
  getTruckLifecycle: (pose: TruckAnimState) => TruckLifecyclePhase;
};

it('completes the guided programme through real truck travel and recipe changeovers', () => {
  const controllers: Record<'shipping' | 'receiving', TruckControllerState> = {
    shipping: createTruckController('shipping'),
    receiving: createTruckController('receiving'),
  };
  useGameSimulationStore.getState().setGameSpeed(30);
  for (
    let tick = 0;
    tick < 1920 &&
    !useOperationsCampaignStore.getState().orders.every((o) => o.status === 'fulfilled');
    tick++
  ) {
    // Ten physical 20 Hz controller steps per ordinary 2 Hz simulation tick.
    for (let frame = 0; frame < 10; frame++) {
      for (const dock of ['receiving', 'shipping'] as const) {
        const trucks = useTruckScheduleStore.getState();
        const campaign = useOperationsCampaignStore.getState();
        const result = stepTruckController(controllers[dock], {
          deltaSeconds: 0.05,
          arrivalReady: trucks.truckSchedule[dock].arrivalReady,
          safetyHold: false,
          serviceComplete:
            dock === 'receiving' || campaign.execution.dispatchLoad.status === 'ready',
          speedMultiplier: campaign.getIncidentEffect().vehicleSpeedMultiplier,
        });
        controllers[dock] = result.state;
        if (trucks.truckSchedule[dock].arrivalReady && result.state.active)
          trucks.consumeTruckArrival(dock);
        if (result.departedThisStep)
          trucks.recordTruckDeparture(
            dock,
            toSimulationMinutes({
              day: useGameSimulationStore.getState().gameDay,
              hour: useGameSimulationStore.getState().gameTime,
            })
          );
        if (
          trucks.truckSchedule[dock].truckDocked !==
          dockPredicates.isTruckPhysicallyDocked(result.pose)
        )
          trucks.setTruckDocked(dock, dockPredicates.isTruckPhysicallyDocked(result.pose));
        if (
          useTruckScheduleStore.getState().truckSchedule[dock].transferReady !==
          dockPredicates.isTruckTransferReady(result.pose)
        )
          trucks.setTruckTransferReady(dock, dockPredicates.isTruckTransferReady(result.pose));
        if (
          useTruckScheduleStore.getState().truckSchedule[dock].lifecyclePhase !==
          dockPredicates.getTruckLifecycle(result.pose)
        )
          trucks.setTruckLifecycle(dock, dockPredicates.getTruckLifecycle(result.pose));
      }
    }
    unifiedGameTick({
      deltaSeconds,
      gameSpeed: 30,
      gameTime: useGameSimulationStore.getState().gameTime,
      elapsedTime: tickCount * deltaSeconds,
      tickCount: ++tickCount,
    });
    expect(
      useMaterialFlowStore.getState().manifests.filter((m) => m.kind === 'shipping').length
    ).toBeLessThanOrEqual(useTruckScheduleStore.getState().truckSchedule.shipping.departureCount);
  }
  const orders = useOperationsCampaignStore.getState().orders;
  expect(orders).toHaveLength(3);
  expect(orders.every((o) => o.status === 'fulfilled')).toBe(true);
  expect(orders.every((o) => o.completedAtMinute! <= o.dueAtMinute)).toBe(true);
  expect(orders.every((o) => o.manifestIds.length > 0 && o.qualityFailureKg === 0)).toBe(true);
  expect(useMaterialFlowStore.getState().shippedKg).toBeCloseTo(18000, 6);
  expect(useTruckScheduleStore.getState().truckSchedule.shipping.departureCount).toBe(5);
});
