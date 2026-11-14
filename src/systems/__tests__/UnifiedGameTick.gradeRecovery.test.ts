import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as ts from 'typescript';

// Plan item 3.4, the way out. A worn line packs flour under strong white's 95
// minimum: none of it is loaded or paid for the strong-white order, which
// waits. Working if, once the line is serviced, flour that meets 95 is
// packed, tested and shipped to that order, and every kilogram it is paid for
// met its minimum. The real tick, stores and roster, as playableJourney runs
// them (its step(): docks set by hand, no rendered yard).
vi.setConfig({ testTimeout: 180_000 });
import { SITE_LAYOUT } from '../../constants/siteLayout';
import { MachineType, type MachineData } from '../../types';
import { centralTick } from '../../systems/CentralTickSystem';
import { resetUnifiedTickState, unifiedGameTick } from '../../systems/UnifiedGameTick';
import {
  calculateEfficiency,
  getWearConfig,
  useProductionStore,
} from '../../stores/productionStore';
import { useMaterialFlowStore } from '../../stores/materialFlowStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useTruckScheduleStore } from '../../stores/truckScheduleStore';
import { useBreakdownStore } from '../../stores/breakdownStore';
import { useQCLabStore } from '../../stores/qcLabStore';
import { usePartnerProposalStore } from '../../stores/partnerProposalStore';
import type { PartnerProposal } from '../../simulation/partnerProposals';
import { answerPartnerProposal } from '../partnerProposalRuntime';
import { DISPATCH_HOLD_MINUTES, type DispatchFacts } from '../../simulation/dispatchProposal';
import { toSimulationMinutes } from '../../simulation/simulationClock';

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
  usePartnerProposalStore.getState().reset();
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

const flow = () => useMaterialFlowStore.getState();
const PRODUCT_PATH = new Set(['ROLLER_MILL', 'PLANSIFTER', 'PACKER']);

/** Wear each product-path unit to six points short of its failure. */
function wearLine() {
  useProductionStore.setState((state) => ({
    machines: state.machines.map((machine) => {
      if (!PRODUCT_PATH.has(machine.type)) return machine;
      const wear = getWearConfig(machine.type).breakdownThreshold - 6;
      return {
        ...machine,
        metrics: { ...machine.metrics, wear, efficiency: calculateEfficiency(wear, machine.type) },
      };
    }),
  }));
}

/** Every batch credited to an order, with the stamp it was packed at, seen so far. */
const stamps = new Map<string, number | undefined>();
const dispatchLedger: PartnerProposal[] = [];
function remember() {
  for (const batch of flow().productionBatches) stamps.set(batch.id, batch.qualityScore);
  for (const proposal of usePartnerProposalStore.getState().proposals) {
    const at = dispatchLedger.findIndex((known) => known.id === proposal.id);
    if (at >= 0) dispatchLedger[at] = proposal;
    else dispatchLedger.push(proposal);
  }
}

it('holds strong white off worn flour, and ships it in spec once the line is serviced', () => {
  wearLine();
  const strongWhite = () => useOperationsCampaignStore.getState().orders[0];
  expect(strongWhite().recipe.minimumQuality).toBe(95);
  // Two trucks' worth of game time on the worn line.
  for (
    let i = 0;
    i < 1400 && flow().manifests.filter((m) => m.kind === 'shipping').length < 2;
    i++
  ) {
    step();
    remember();
  }
  expect(useProductionStore.getState().metrics.quality).toBeLessThan(95);
  expect(strongWhite().shippedKg).toBe(0);
  expect(strongWhite().qualityFailureKg).toBe(0);
  // The truck's question (plan item 3.4): flour under 95 at the dock that the
  // community order takes. Unanswered, the partner sends it.
  const dispatches = dispatchLedger.filter((proposal) => proposal.kind === 'dispatch');
  expect(dispatches.length).toBeGreaterThan(0);
  for (const proposal of dispatches)
    expect(proposal.resolution).toMatchObject({ optionId: 'send', decidedBy: 'partner' });

  // Service every unit on the product path, as Maintain does.
  for (const machine of useProductionStore.getState().machines)
    if (PRODUCT_PATH.has(machine.type))
      expect(useProductionStore.getState().performMaintenance(machine.id).success).toBe(true);
  for (let i = 0; i < 4000 && strongWhite().shippedKg <= 0; i++) {
    step();
    remember();
  }
  expect(strongWhite().shippedKg).toBeGreaterThan(0);
  for (const order of useOperationsCampaignStore.getState().orders) {
    expect(order.qualityFailureKg).toBe(0);
    for (const batchId of order.batchIds) {
      const stamp = stamps.get(batchId);
      if (stamp !== undefined)
        expect(stamp, `${order.id} ${batchId}`).toBeGreaterThanOrEqual(
          order.recipe.minimumQuality - 1e-6
        );
    }
  }
});

it('answered "hold", the truck waits at the dock for in-spec flour, for a bounded time', () => {
  // The player answers the truck's question, so the card must ask it.
  usePartnerProposalStore.getState().setDelegation('dispatch', 'ask');
  wearLine();
  let heldTicks = 0;
  let answered: { cycleId: string; atMinute: number } | null = null;
  for (let i = 0; i < 2000 && !answered; i++) {
    step();
    const open = usePartnerProposalStore
      .getState()
      .proposals.find((proposal) => proposal.kind === 'dispatch' && proposal.status === 'open');
    if (open && answerPartnerProposal(open.id, 'hold', 'operator'))
      answered = {
        cycleId: (open.facts as DispatchFacts).cycleId,
        atMinute: useOperationsCampaignStore.getState().elapsedMinutes,
      };
  }
  expect(answered).not.toBeNull();
  // Within the hold the truck on that cycle does not leave on its stock-out.
  while (
    useOperationsCampaignStore.getState().elapsedMinutes <
    answered!.atMinute + DISPATCH_HOLD_MINUTES - 1
  ) {
    step();
    const load = useOperationsCampaignStore.getState().execution.dispatchLoad;
    if (load.cycleId !== answered!.cycleId) break;
    if (load.status === 'loading') heldTicks++;
    expect(
      load.status === 'ready' && load.loadedKg < load.capacityKg - 1e-6 && heldTicks === 0
    ).toBe(false);
  }
  expect(heldTicks).toBeGreaterThan(0);
  // And it is released when the hold runs out.
  for (let i = 0; i < 400; i++) {
    step();
    if (useOperationsCampaignStore.getState().execution.dispatchLoad.cycleId !== answered!.cycleId)
      break;
  }
  expect(useOperationsCampaignStore.getState().execution.dispatchLoad.cycleId).not.toBe(
    answered!.cycleId
  );
});
