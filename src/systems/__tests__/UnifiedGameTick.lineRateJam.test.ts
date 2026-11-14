import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as ts from 'typescript';

// The jam at the slider's top (reported at line rates 1.6 and 2.0). With no
// order open (the book between programmes, while the partner's card waits)
// the tick passed no line plan, and every silo valve opened to every mill with
// no budget: both grains into one hopper, and packers filled with semolina no
// order wanted until a lane jammed and the open flour order got nothing.
// Working if, at the slider's maximum, grain leaves a silo only for the line's
// plan, a mill's hopper holds one grain at a time, no product is packed beyond
// what open orders owe by more than a batch, and every order ships on time.
// The real tick, stores and roster, as the grade-recovery test runs them.
vi.setConfig({ testTimeout: 300_000 });
import { SITE_LAYOUT } from '../../constants/siteLayout';
import { MachineType, type MachineData } from '../../types';
import { centralTick } from '../../systems/CentralTickSystem';
import { resetUnifiedTickState, unifiedGameTick } from '../../systems/UnifiedGameTick';
import { useProductionStore } from '../../stores/productionStore';
import { useMaterialFlowStore, type MaterialType } from '../../stores/materialFlowStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useTruckScheduleStore } from '../../stores/truckScheduleStore';
import { useBreakdownStore } from '../../stores/breakdownStore';
import { useQCLabStore } from '../../stores/qcLabStore';
import { usePartnerProposalStore } from '../../stores/partnerProposalStore';
import type { PartnerProposal } from '../../simulation/partnerProposals';
import { answerPartnerProposal } from '../partnerProposalRuntime';
import { toSimulationMinutes } from '../../simulation/simulationClock';
import { STANDARD_GAME_SPEED } from '../../simulation/pace';

/** The production-speed slider's maximum (SettingsPanel, max="2"). */
const SLIDER_MAXIMUM = 2;
/** Three shifts of game time. */
const RUN_MINUTES = 3 * 480;
/** One packed batch (PRODUCT_BATCH_TARGET_KG): changeover tails may round up to it. */
const BATCH_KG = 1000;

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
    productionSpeed: SLIDER_MAXIMUM,
  });
  fetchSpy = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(() =>
      Promise.reject(new Error('Optional services unavailable for offline audit'))
    );
  tickCount = 0;
  receivingDwell = 0;
});

afterEach(() => {
  fetchSpy.mockRestore();
  expect(Math.abs(useMaterialFlowStore.getState().getMaterialBalance().errorKg)).toBeLessThan(
    0.001
  );
});

function step() {
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
    gameSpeed: STANDARD_GAME_SPEED,
    gameTime: useGameSimulationStore.getState().gameTime,
    elapsedTime: tickCount * deltaSeconds,
    tickCount: ++tickCount,
  });
  const now = () =>
    toSimulationMinutes({
      day: useGameSimulationStore.getState().gameDay,
      hour: useGameSimulationStore.getState().gameTime,
    });
  if (
    useOperationsCampaignStore.getState().execution.dispatchLoad.status === 'ready' &&
    useTruckScheduleStore.getState().truckSchedule.shipping.transferReady
  )
    useTruckScheduleStore.getState().recordTruckDeparture('shipping', now());
  if (
    useTruckScheduleStore.getState().truckSchedule.receiving.transferReady &&
    ++receivingDwell >= 3
  ) {
    useTruckScheduleStore.getState().recordTruckDeparture('receiving', now());
    receivingDwell = 0;
  }
}

const GRAINS: ReadonlySet<MaterialType> = new Set(['wheat_grain', 'corn_grain']);

function siloKg(): number {
  let kg = 0;
  for (const buffer of useMaterialFlowStore.getState().machineBuffers.values())
    if (buffer.machineType === 'silo')
      for (const material of buffer.outputBuffer) kg += material.amount;
  return kg;
}

/** Packed stock of a product beyond what the open orders for it still owe. */
function surplusKg(product: 'flour' | 'semolina'): number {
  const packed = useMaterialFlowStore
    .getState()
    .productionBatches.filter(
      (batch) =>
        batch.materialType === product &&
        batch.disposition !== 'shipped' &&
        batch.disposition !== 'recalled'
    )
    .reduce((sum, batch) => sum + batch.availableKg, 0);
  const owed = useOperationsCampaignStore
    .getState()
    .orders.filter(
      (order) =>
        order.recipe.finishedMaterial === product &&
        order.status !== 'fulfilled' &&
        order.status !== 'cancelled'
    )
    .reduce((sum, order) => sum + Math.max(0, order.requiredKg - order.shippedKg), 0);
  return packed - owed;
}

it('at the slider maximum, grain leaves a silo only for the plan, one grain per hopper, and every order ships on time', () => {
  // Grain leaving the silos on a tick the line has no plan for.
  let planlessKg = 0;
  let planlessTicks = 0;
  const tickMaterialFlow = useMaterialFlowStore.getState().tickMaterialFlow;
  useMaterialFlowStore.setState({
    tickMaterialFlow: (dt, speed, plan, quality, options) => {
      const before = siloKg();
      tickMaterialFlow(dt, speed, plan, quality, options);
      if (!plan) {
        planlessTicks += 1;
        planlessKg += Math.max(0, before - siloKg());
      }
    },
  });
  const mixed = new Map<string, number>();
  let worstSemolinaSurplus = -Infinity;
  const late = new Set<string>();
  const held = new Set<number>();
  // The player asks to be asked about programmes, and holds each one once.
  usePartnerProposalStore.getState().setDelegation('programme', 'ask');
  try {
    while (useOperationsCampaignStore.getState().elapsedMinutes < RUN_MINUTES) {
      step();
      // Held, the book stands empty for the hour between programmes.
      for (const proposal of usePartnerProposalStore.getState().proposals) {
        if (proposal.kind !== 'programme' || proposal.status !== 'open') continue;
        const count = (proposal as PartnerProposal<'programme'>).facts.programmeCount;
        if (held.has(count)) continue;
        held.add(count);
        expect(answerPartnerProposal(proposal.id, 'hold', 'operator')).toBeTruthy();
      }
      const minute = Math.round(useOperationsCampaignStore.getState().elapsedMinutes);
      for (const buffer of useMaterialFlowStore.getState().machineBuffers.values()) {
        if (buffer.machineType !== 'roller_mill' || mixed.has(buffer.machineId)) continue;
        const grains = buffer.inputBuffer.filter(
          (material) => GRAINS.has(material.type) && material.amount > 1e-6
        );
        if (grains.length > 1) mixed.set(buffer.machineId, minute);
      }
      worstSemolinaSurplus = Math.max(worstSemolinaSurplus, surplusKg('semolina'));
      for (const order of useOperationsCampaignStore.getState().orders)
        if (order.status === 'late') late.add(order.id);
    }
  } finally {
    useMaterialFlowStore.setState({ tickMaterialFlow });
  }
  const orders = useOperationsCampaignStore.getState().orders;
  // The book was empty at some point, so the case was exercised.
  expect(held.size).toBeGreaterThan(2);
  expect(planlessTicks).toBeGreaterThan(0);
  expect.soft(planlessKg, `grain left the silos on ${planlessTicks} ticks with no plan`).toBe(0);
  expect
    .soft(Object.fromEntries(mixed), 'mill hoppers holding two grains (first minute)')
    .toEqual({});
  expect
    .soft(worstSemolinaSurplus, 'semolina packed beyond what orders owe')
    .toBeLessThanOrEqual(BATCH_KG);
  expect.soft([...late], 'orders late').toEqual([]);
  expect(orders.filter((order) => order.status === 'fulfilled').length).toBeGreaterThan(6);
});
