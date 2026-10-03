import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import * as ts from 'typescript';
import { unifiedGameTick, resetUnifiedTickState } from '../UnifiedGameTick';
import { useWorkplaceStore } from '../../stores/workplaceStore';
import { createWorkplace, workplaceCapacity } from '../../simulation/bilateralWorkplace';
import { useProductionStore } from '../../stores/productionStore';
import { useMaterialFlowStore } from '../../stores/materialFlowStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useBreakdownStore } from '../../stores/breakdownStore';
import { useTruckScheduleStore } from '../../stores/truckScheduleStore';
import { useQCLabStore } from '../../stores/qcLabStore';
import { useUIStore } from '../../stores/uiStore';
import { toSimulationMinutes } from '../../simulation/simulationClock';
import {
  campaignComplete,
  campaignOutcomes,
  requiredChecks,
  WORKPLACE_CHECKS,
} from '../../simulation/workplaceCampaign';
import type { WorkplacePlanId, WorkplaceState } from '../../types/workplace';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import { MachineType, type MachineData } from '../../types';
import {
  useWorkplaceReplayStore,
  exportWorkplaceReplayReport,
} from '../../stores/workplaceReplayStore';
import { useSafetyStore } from '../../stores/safetyStore';
import { centralTick } from '../CentralTickSystem';
import { captureUnifiedTickState } from '../UnifiedGameTick';
import * as scada from '../../scada/SCADAService';
import {
  REQUIRED_REPLAY_PARTICIPANTS,
  registerReplayParticipant,
  endReplayClock,
  workplaceSimulationRandom,
  workplaceSimulationNow,
  advanceReplayClock,
  beginReplayClock,
} from '../../simulation/workplaceReplayRuntime';

// Load the shipped machine assembly, following the existing playable-journey
// test. A copied machine table could make a disconnected capacity term pass.
const scene = ts.createSourceFile(
  'MillScene.tsx',
  readFileSync('src/components/MillScene.tsx', 'utf8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX
);
const bodies: string[] = [];
function findAssembly(node: ts.Node) {
  if (
    ts.isVariableDeclaration(node) &&
    node.name.getText(scene) === 'machines' &&
    node.initializer &&
    ts.isCallExpression(node.initializer) &&
    node.initializer.expression.getText(scene) === 'useMemo'
  ) {
    const factory = node.initializer.arguments[0];
    if (factory && ts.isArrowFunction(factory)) bodies.push(factory.body.getText(scene));
  }
  ts.forEachChild(node, findAssembly);
}
findAssembly(scene);
expect(bodies).toHaveLength(1);
const js = ts.transpileModule(`function assemble() ${bodies[0]}`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const assemble = new Function('SITE_LAYOUT', 'MachineType', `${js}; return assemble();`) as (
  layout: typeof SITE_LAYOUT,
  types: typeof MachineType
) => MachineData[];

let replayTick = 0;
let receivingDwell = 0;

function reset() {
  replayTick = 0;
  receivingDwell = 0;
  useUIStore.setState(useUIStore.getInitialState());
  resetUnifiedTickState();
  useWorkplaceStore.setState({ workplace: createWorkplace() });
  useMaterialFlowStore.setState(useMaterialFlowStore.getInitialState());
  useMaterialFlowStore.getState().resetMaterialFlow();
  useOperationsCampaignStore.getState().resetCampaign();
  useGameSimulationStore.getState().resetGameState();
  useBreakdownStore.getState().resetBreakdownStore();
  useTruckScheduleStore.getState().resetTruckSchedule();
  useQCLabStore.getState().resetQCLab();
  useProductionStore.setState({
    ...useProductionStore.getInitialState(),
    machines: assemble(SITE_LAYOUT, MachineType),
    productionSpeed: 1,
  });
}
beforeEach(() => {
  endReplayClock();
  // Fixed wall clock and random stream in every arm. No fake timers or forced
  // QC release: the production and dock authorities remain the real stores.
  vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 8, 30, 8));
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Offline synthetic replay'));
  reset();
});
afterEach(() => {
  endReplayClock();
  expect(vi.mocked(globalThis.fetch)).not.toHaveBeenCalled();
  expect(Math.abs(useMaterialFlowStore.getState().getMaterialBalance().errorKg)).toBeLessThan(
    0.001
  );
  expect(Math.abs(useMaterialFlowStore.getState().getGenealogyBalance().errorKg)).toBeLessThan(
    0.001
  );
  vi.restoreAllMocks();
});
const step = () =>
  unifiedGameTick({ deltaSeconds: 0.5, gameTime: 0, gameSpeed: 15, elapsedTime: 0, tickCount: 1 });

it('bounds the actual replay plant horizon at a fractional agreement end and holds review time', () => {
  agree('steady');
  useWorkplaceStore.getState().tick(89.9, 0, false);
  beginReplayClock(17, Date.UTC(2026, 9, 2));
  useGameSimulationStore.getState().setGameSpeed(30);
  const before = useOperationsCampaignStore.getState().elapsedMinutes;
  unifiedGameTick({ deltaSeconds: 0.5, gameTime: 0, gameSpeed: 30, elapsedTime: 1, tickCount: 1 });
  expect(useOperationsCampaignStore.getState().elapsedMinutes - before).toBeCloseTo(0.1, 8);
  expect(useWorkplaceStore.getState().workplace.minute).toBe(90);
  expect(useGameSimulationStore.getState().gameSpeed).toBe(0);
  const held = useOperationsCampaignStore.getState();
  const material = useMaterialFlowStore.getState();
  const clock = workplaceSimulationNow();
  // A stale callback context cannot advance the held review.
  unifiedGameTick({ deltaSeconds: 0.5, gameTime: 0, gameSpeed: 30, elapsedTime: 2, tickCount: 2 });
  expect(useOperationsCampaignStore.getState()).toBe(held);
  expect(useMaterialFlowStore.getState()).toBe(material);
  expect(workplaceSimulationNow()).toBe(clock);
  endReplayClock();
});

it('holds replay discussion and requires an explicit bounded resume to repay review recovery', () => {
  const store = useWorkplaceStore.getState();
  store.start('game', 17);
  beginReplayClock(17, Date.UTC(2026, 9, 2));
  useGameSimulationStore.getState().setGameSpeed(30);
  const beforeDiscussion = useOperationsCampaignStore.getState();
  step();
  expect(useOperationsCampaignStore.getState()).toBe(beforeDiscussion);
  expect(useGameSimulationStore.getState().gameSpeed).toBe(0);
  store.selectPlan('cover');
  store.simulateResponses();
  expect(store.activate(useWorkplaceStore.getState().workplace.revision).changed).toBe(true);
  store.tick(3, 0, false);
  store.stop();
  const earned = structuredClone(useWorkplaceStore.getState().workplace.finance);
  store.tick(9.9, 0, false);
  expect(
    useWorkplaceStore.getState().workplace.members.some((member) => member.recoveryOwedMinutes > 0)
  ).toBe(true);
  const beforeResume = useOperationsCampaignStore.getState();
  step();
  expect(useOperationsCampaignStore.getState()).toBe(beforeResume);
  useGameSimulationStore.getState().setGameSpeed(30);
  const elapsed = useOperationsCampaignStore.getState().elapsedMinutes;
  unifiedGameTick({ deltaSeconds: 0.5, gameTime: 0, gameSpeed: 30, elapsedTime: 1, tickCount: 1 });
  expect(useOperationsCampaignStore.getState().elapsedMinutes - elapsed).toBeCloseTo(0.1, 8);
  expect(
    useWorkplaceStore
      .getState()
      .workplace.members.every((member) => member.recoveryOwedMinutes === 0)
  ).toBe(true);
  expect(useWorkplaceStore.getState().workplace.finance).toEqual(earned);
  expect(useGameSimulationStore.getState().gameSpeed).toBe(0);
});

it('keeps ordinary cooperative review under the player’s plant pace control', () => {
  agree('steady');
  useWorkplaceStore.getState().tick(89.9, 0, false);
  useGameSimulationStore.getState().setGameSpeed(30);
  unifiedGameTick({ deltaSeconds: 0.5, gameTime: 0, gameSpeed: 30, elapsedTime: 1, tickCount: 1 });
  expect(useWorkplaceStore.getState().workplace.phase).toBe('review');
  expect(useGameSimulationStore.getState().gameSpeed).toBe(30);
});
function agree(
  plan: 'steady' | 'resequence' | 'cover',
  mode: 'game' | 'workshop' = 'game',
  seed = 1
) {
  const s = useWorkplaceStore.getState();
  s.start(mode, seed);
  s.selectPlan(plan);
  if (mode === 'game') s.simulateResponses();
  else
    for (const m of s.workplace.members) {
      s.understand(m.id);
      s.vote(m.id, true);
    }
  expect(s.activate(useWorkplaceStore.getState().workplace.revision).changed).toBe(true);
}

it('the agreed capacity reaches the real material tick and changes actual packed mass under matched conditions', () => {
  const run = (plan: 'steady' | 'resequence') => {
    reset();
    agree(plan);
    const flow = useMaterialFlowStore.getState();
    const spy = vi.spyOn(flow, 'tickMaterialFlow');
    for (let i = 0; i < 80; i++) step();
    const expectedCapacity = plan === 'steady' ? 0.78 : 0.9;
    expect(spy.mock.calls[0]?.[1]).toBeCloseTo(
      useOperationsCampaignStore.getState().getProductionMultiplier() * expectedCapacity
    );
    spy.mockRestore();
    const realFlow = useMaterialFlowStore.getState();
    expect(Math.abs(realFlow.getMaterialBalance().errorKg)).toBeLessThan(0.001);
    return realFlow.productionBatches.reduce((kg, batch) => kg + batch.availableKg, 0);
  };
  const protectedMass = run('steady');
  const improvedMass = run('resequence');
  expect(protectedMass).toBeGreaterThan(0);
  expect(improvedMass).toBeGreaterThan(protectedMass);
});

it('workshop agreements do not alter plant pacing or silently accrue wages on the plant clock', () => {
  agree('steady', 'workshop');
  const flow = useMaterialFlowStore.getState();
  const spy = vi.spyOn(flow, 'tickMaterialFlow');
  step();
  expect(spy.mock.calls[0]?.[1]).toBeCloseTo(
    useOperationsCampaignStore.getState().getProductionMultiplier()
  );
  spy.mockRestore();
  expect(useWorkplaceStore.getState().workplace.minute).toBe(0);
  expect(useWorkplaceStore.getState().workplace.finance.wagesPaid).toBe(0);
});

it('plant clock pause does not consume cover consent or simulate paid burden', () => {
  agree('steady');
  const before = structuredClone(useWorkplaceStore.getState().workplace);
  unifiedGameTick({ deltaSeconds: 0.5, gameTime: 0, gameSpeed: 0, elapsedTime: 0, tickCount: 1 });
  expect(useWorkplaceStore.getState().workplace).toEqual(before);
});

it('a safety stop ends optional work without removing earned compensation or rest debt', () => {
  const s = useWorkplaceStore.getState();
  s.start('game');
  s.selectPlan('cover');
  s.simulateResponses();
  expect(s.activate(useWorkplaceStore.getState().workplace.revision).changed).toBe(true);
  s.tick(3, 0, false);
  useGameSimulationStore.getState().triggerEmergency();
  step();
  const after = useWorkplaceStore.getState().workplace;
  expect(after.phase).toBe('review');
  expect(after.finance.compensationPaid).toBeCloseTo(2.4);
  expect(after.members.some((m) => m.recoveryOwedMinutes > 0)).toBe(true);
  expect(useMaterialFlowStore.getState().shippedKg).toBe(0);
});

// This fixture supplies only dock arrival/departure lifecycle signals, just as
// playableJourney does. Real loading, certification, manifests and money come
// from unifiedGameTick. It does not model physical truck travel or human work.
function replayStep() {
  const trucks = useTruckScheduleStore.getState();
  for (const dock of ['receiving', 'shipping'] as const) {
    if (trucks.truckSchedule[dock].truckActive && !trucks.truckSchedule[dock].truckDocked) {
      trucks.setTruckDocked(dock, true);
      trucks.setTruckTransferReady(dock, true);
    }
  }
  unifiedGameTick({
    deltaSeconds: 0.5,
    gameSpeed: 15,
    gameTime: useGameSimulationStore.getState().gameTime,
    elapsedTime: replayTick * 0.5,
    tickCount: ++replayTick,
  });
  const now = toSimulationMinutes({
    day: useGameSimulationStore.getState().gameDay,
    hour: useGameSimulationStore.getState().gameTime,
  });
  if (
    useOperationsCampaignStore.getState().execution.dispatchLoad.status === 'ready' &&
    useTruckScheduleStore.getState().truckSchedule.shipping.transferReady
  ) {
    useTruckScheduleStore.getState().recordTruckDeparture('shipping', now);
  }
  if (
    useTruckScheduleStore.getState().truckSchedule.receiving.transferReady &&
    ++receivingDwell >= 3
  ) {
    useTruckScheduleStore.getState().recordTruckDeparture('receiving', now);
    receivingDwell = 0;
  }
}

function finishShift() {
  useGameSimulationStore.getState().setGameSpeed(15);
  for (let i = 0; i < 720 && useWorkplaceStore.getState().workplace.minute < 90; i++) replayStep();
  expect(useWorkplaceStore.getState().workplace.minute).toBe(90);
  expect(useWorkplaceStore.getState().workplace.phase).toBe('review');
}

function replayResult() {
  const flow = useMaterialFlowStore.getState();
  const workplace = useWorkplaceStore.getState().workplace;
  const availablePackedKg = flow.productionBatches.reduce((kg, b) => kg + b.availableKg, 0);
  const shipments = flow.manifests.filter((m) => m.kind === 'shipping');
  expect(shipments.reduce((kg, m) => kg + m.actualKg, 0)).toBeCloseTo(flow.shippedKg, 6);
  expect(workplace.shippedKg).toBeLessThanOrEqual(flow.shippedKg + 1e-8);
  expect(workplace.finance.operatingRevenue).toBeCloseTo(workplace.shippedKg * 0.5, 6);
  expect(workplace.finance.operatingCost).toBeCloseTo(workplace.shippedKg * 0.2, 6);
  const materialBalance = flow.getMaterialBalance();
  const genealogyBalance = flow.getGenealogyBalance();
  expect(Math.abs(materialBalance.errorKg)).toBeLessThan(0.001);
  expect(Math.abs(genealogyBalance.errorKg)).toBeLessThan(0.001);
  return {
    planId: workplace.planId,
    governance: workplace.governance,
    elapsedMinutes: workplace.minute,
    plantElapsedMinutes: useOperationsCampaignStore.getState().elapsedMinutes,
    availablePackedKg,
    shippedKg: flow.shippedKg,
    packedAvailablePlusShippedKg: availablePackedKg + flow.shippedKg,
    shipments: structuredClone(shipments),
    workplaceShippedKg: workplace.shippedKg,
    finance: { ...workplace.finance },
    members: workplace.members.map((m) => ({
      id: m.id,
      earnedPay: m.earnedPay,
      compensationPaid: m.compensationPaid,
      extraMinutes: m.extraMinutes,
      restMinutes: m.restMinutes,
      recoveryMinutes: m.recoveryMinutes,
      recoveryOwedMinutes: m.recoveryOwedMinutes,
      refusalRespected: m.refusalRespected,
    })),
    materialBalance,
    genealogyBalance,
    quality: {
      certification: useQCLabStore.getState().qcLab.certificationStatus,
      executionStage: useOperationsCampaignStore.getState().execution.stage,
      dispatch: { ...useOperationsCampaignStore.getState().execution.dispatchLoad },
      batchDispositions: flow.productionBatches.map((b) => ({
        id: b.id,
        disposition: b.disposition,
        availableKg: b.availableKg,
      })),
    },
    optionalNetworkCalls: vi.mocked(globalThis.fetch).mock.calls.length,
  };
}

// Hash the exact source bytes loaded by this test, rather than reporting an
// unrelated HEAD or hashing potentially changed files only after the replay.
const sourceHashes = Object.fromEntries(
  [
    'src/components/MillScene.tsx',
    'src/constants/siteLayout.ts',
    'src/simulation/bilateralWorkplace.ts',
    'src/simulation/workplaceCampaign.ts',
    'src/stores/workplaceStore.ts',
    'src/stores/materialFlowStore.ts',
    'src/stores/productionStore.ts',
    'src/stores/qcLabStore.ts',
    'src/stores/truckScheduleStore.ts',
    'src/stores/operationsCampaignStore.ts',
    'src/systems/UnifiedGameTick.ts',
  ].map((path) => [path, createHash('sha256').update(readFileSync(path)).digest('hex')])
);
function emitEvidence(name: string, results: unknown) {
  const dir = process.env.MILLOS_WORKPLACE_EVIDENCE_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${name}.json`),
    JSON.stringify(
      {
        schema: 'millos-workplace-actual-physics-replay',
        version: 1,
        scope:
          'Synthetic local store simulation with real production assembly and dispatch authorities. No human participants, health data, human wellbeing or real workplace efficacy evidence. Dock travel is a lifecycle fixture.',
        inputs: {
          seed: 17,
          random: 'Math.random fixed to 0.5 in every arm',
          wallClockUtc: '2026-09-30T08:00:00.000Z',
          deltaSeconds: 0.5,
          gameSpeed: 15,
          shiftMinutes: 90,
          initialMaterialBalance: initialConditions.materialBalance,
          initialCertification: initialConditions.certification,
          initialMachines: initialConditions.machines,
        },
        sourceHashes,
        results,
      },
      null,
      2
    ) + '\n'
  );
}
function plantConditions() {
  return {
    materialBalance: useMaterialFlowStore.getState().getMaterialBalance(),
    certification: useQCLabStore.getState().qcLab.certificationStatus,
    machines: structuredClone(useProductionStore.getState().machines),
  };
}
// Assigned at the actual per-arm reset, never a copied inventory fixture.
let initialConditions: ReturnType<typeof plantConditions>;

it('replays 90 matched modeled minutes for real packing and dispatch, with no governance bonus', () => {
  const run = (plan: WorkplacePlanId, governance: WorkplaceState['governance'] = 'member-vote') => {
    reset();
    const conditions = plantConditions();
    if (initialConditions) expect(conditions).toEqual(initialConditions);
    else initialConditions = conditions;
    const s = useWorkplaceStore.getState();
    expect(s.start('game', 17).changed).toBe(true);
    if (governance !== s.workplace.governance)
      expect(s.configure({ governance }).changed).toBe(true);
    s.selectPlan(plan);
    expect(s.simulateResponses().changed).toBe(true);
    expect(s.activate(useWorkplaceStore.getState().workplace.revision).changed).toBe(true);
    const activeTerms = structuredClone(useWorkplaceStore.getState().workplace);
    finishShift();
    const actual = replayResult();
    expect(actual.workplaceShippedKg).toBeCloseTo(actual.shippedKg, 6);
    expect(actual.elapsedMinutes).toBe(90);
    expect(actual.members.every((m) => m.restMinutes === 15 && m.recoveryOwedMinutes === 0)).toBe(
      true
    );
    expect(actual.finance.wagesPaid).toBeCloseTo(108);
    return { activeTerms, actual };
  };
  const steady = run('steady');
  const resequence = run('resequence');
  const cover = run('cover');
  expect(steady.actual.packedAvailablePlusShippedKg).toBeGreaterThan(0);
  expect(resequence.actual.packedAvailablePlusShippedKg).toBeGreaterThan(
    steady.actual.packedAvailablePlusShippedKg
  );
  expect(cover.actual.packedAvailablePlusShippedKg).toBeGreaterThan(
    steady.actual.packedAvailablePlusShippedKg
  );
  expect(cover.actual.finance.compensationPaid).toBeCloseTo(8);
  expect(cover.actual.members.reduce((n, m) => n + m.extraMinutes, 0)).toBeCloseTo(10);
  expect(cover.actual.members.reduce((n, m) => n + m.recoveryMinutes, 0)).toBeCloseTo(10);
  const consultative = run('steady', 'consultative');
  const team = run('steady', 'team-consent');
  const physical = (r: ReturnType<typeof run>) => ({
    mass: r.actual.packedAvailablePlusShippedKg,
    shipped: r.actual.shippedKg,
    shipments: r.actual.shipments.map((m) => ({
      actualKg: m.actualKg,
      simulationTime: m.simulationTime,
    })),
    material: r.actual.materialBalance,
    genealogy: r.actual.genealogyBalance,
  });
  expect(physical(consultative)).toEqual(physical(steady));
  expect(physical(team)).toEqual(physical(steady));
  emitEvidence('matched-replay', { steady, resequence, cover, consultative, team });
});

function agreeCampaignCover() {
  const s = useWorkplaceStore.getState();
  s.selectPlan('cover');
  for (const actor of ['packing', 'mind']) {
    for (const id of requiredChecks(actor)) {
      expect(
        s.answerCheck(actor, id, WORKPLACE_CHECKS.find((q) => q.id === id)!.correct).changed
      ).toBe(true);
    }
  }
  s.understand('packing');
  s.vote('packing', true);
  s.consentToCover('packing', true);
  expect(s.simulateResponses().changed).toBe(true);
  expect(s.activate(useWorkplaceStore.getState().workplace.revision).changed).toBe(true);
  return useWorkplaceStore.getState().workplace.activeCoverMemberId;
}

it('runs all three real campaign shifts with inspection, retained pay and rotating fresh consent', () => {
  initialConditions = plantConditions();
  const s = useWorkplaceStore.getState();
  expect(s.startCampaign('cooperative', 17).changed).toBe(true);
  expect(s.campaignDecision('renegotiate', 'coordinator').changed).toBe(true);
  expect(useWorkplaceStore.getState().workplace.targetKg).toBe(480);
  const volunteers: (string | null)[] = [];
  const results: ReturnType<typeof replayResult>[] = [];
  for (let shift = 0; shift < 3; shift++) {
    const shippedBefore = useMaterialFlowStore.getState().shippedKg;
    if (shift === 2) {
      expect(s.campaignDecision('penalize-refusal', 'coordinator').changed).toBe(false);
      expect(s.campaignDecision('protect-refusal', 'coordinator').changed).toBe(true);
      expect(useWorkplaceStore.getState().workplace.campaign?.repairs).toBe(1);
    }
    volunteers.push(agreeCampaignCover());
    if (shift === 1) {
      while (useWorkplaceStore.getState().workplace.minute < 25) replayStep();
      expect(workplaceCapacity(useWorkplaceStore.getState().workplace)).toBe(0);
      expect(s.campaignDecision('skip-inspection', 'coordinator').changed).toBe(false);
      expect(s.campaignDecision('inspect', 'quality').changed).toBe(true);
      const qcBefore = structuredClone(useQCLabStore.getState().qcLab);
      const tickMaterialFlow = useMaterialFlowStore.getState().tickMaterialFlow;
      const spy = vi.spyOn(useMaterialFlowStore.getState(), 'tickMaterialFlow');
      for (let i = 0; i < 40; i++) {
        expect(workplaceCapacity(useWorkplaceStore.getState().workplace)).toBe(0);
        replayStep();
        expect(spy.mock.calls.at(-1)?.[1]).toBeCloseTo(0);
      }
      spy.mockRestore();
      useMaterialFlowStore.setState({ tickMaterialFlow });
      expect(useWorkplaceStore.getState().workplace.minute).toBe(30);
      expect(useWorkplaceStore.getState().workplace.campaign?.inspectionComplete).toBe(true);
      expect(workplaceCapacity(useWorkplaceStore.getState().workplace)).toBe(0.78);
      expect(useQCLabStore.getState().qcLab).toEqual(qcBefore);
    }
    finishShift();
    results.push(replayResult());
    expect(useWorkplaceStore.getState().workplace.shippedKg).toBeCloseTo(
      useMaterialFlowStore.getState().shippedKg - shippedBefore,
      6
    );
    const closing = structuredClone(useWorkplaceStore.getState().workplace);
    expect(closing.members.find((m) => m.id === 'quality')?.refusalRespected).toBe(true);
    if (shift < 2) {
      expect(s.nextCampaignShift().changed).toBe(true);
      const opened = useWorkplaceStore.getState().workplace;
      expect(opened.finance.cash).toBe(closing.finance.cash);
      expect(opened.campaign?.history[shift].finance).toEqual(closing.finance);
      expect(opened.campaign?.history[shift].members.map((m) => m.recoveryOwedMinutes)).toEqual(
        closing.members.map((m) => m.recoveryOwedMinutes)
      );
      expect(opened.members.every((m) => m.coverConsent === null && m.ballot === null)).toBe(true);
      expect(opened.campaign?.checks).toEqual({});
    }
  }
  expect(volunteers.slice(0, 2)).toEqual(['maintenance', 'packing']);
  expect(campaignComplete(useWorkplaceStore.getState().workplace)).toBe(true);
  emitEvidence('three-shift-campaign', {
    volunteers,
    results,
    finalCampaign: structuredClone(useWorkplaceStore.getState().workplace),
  });
});

it('binds the three-shift game to actual selected-order dispatch without double-crediting mill money', () => {
  initialConditions = plantConditions();
  const operations = useOperationsCampaignStore.getState();
  operations.initializeCampaign();
  const before = structuredClone(useOperationsCampaignStore.getState().orders);
  const revenueBefore = useOperationsCampaignStore.getState().economics.revenue;
  const s = useWorkplaceStore.getState();
  expect(s.startMission('cooperative', 17).changed).toBe(true);
  expect(useOperationsCampaignStore.getState().orders).toEqual(before);
  expect(useOperationsCampaignStore.getState().economics.revenue).toBe(revenueBefore);
  const binding = structuredClone(useWorkplaceStore.getState().workplace.campaign!.mission!);
  const reviews = [];
  for (let shift = 0; shift < 3; shift++) {
    if (shift !== 1)
      expect(
        s.campaignDecision(shift === 0 ? 'renegotiate' : 'protect-refusal', 'coordinator').changed
      ).toBe(true);
    agreeCampaignCover();
    if (shift === 1) {
      while (useWorkplaceStore.getState().workplace.minute < 25) replayStep();
      expect(s.campaignDecision('inspect', 'quality').changed).toBe(true);
    }
    finishShift();
    const workplace = useWorkplaceStore.getState().workplace;
    const actualOrder = useOperationsCampaignStore
      .getState()
      .orders.find((o) => o.id === binding.orderId)!;
    expect(workplace.campaign!.mission!.creditedKg).toBeCloseTo(
      actualOrder.shippedKg - binding.startingShippedKg,
      6
    );
    expect(workplace.campaign!.mission!.manifestIds).toEqual(actualOrder.manifestIds);
    expect(workplace.campaign!.mission!.evidence).toBe('current');
    reviews.push({
      workplace: structuredClone(workplace),
      physical: replayResult(),
      actualOrder: structuredClone(actualOrder),
    });
    if (shift < 2) expect(s.nextCampaignShift().changed).toBe(true);
  }
  const outcome = campaignOutcomes(useWorkplaceStore.getState().workplace);
  expect(useMaterialFlowStore.getState().shippedKg).toBeGreaterThan(0);
  expect(outcome.agreement.status).toBe('honoured');
  expect(outcome.accounts.wages).toBeCloseTo(324);
  expect(outcome.delivery.targetKg).toBe(binding.originalTargetKg * 0.8);
  expect(outcome.delivery.deferredKg).toBe(binding.originalTargetKg * 0.2);
  expect(outcome.complete).toBe(outcome.delivery.deliveredKg + 1e-6 >= outcome.delivery.targetKg);
  const revenue = useOperationsCampaignStore.getState().economics.revenue;
  expect(revenue).toBeGreaterThan(revenueBefore);
  s.tick(0, 1e9, false);
  expect(campaignOutcomes(useWorkplaceStore.getState().workplace)).toEqual(outcome);
  expect(useOperationsCampaignStore.getState().economics.revenue).toBe(revenue);
  emitEvidence('linked-mission', { binding, reviews, outcome, mainMillRevenue: revenue });
});

it('actual expired certification continues to block dispatch throughout a workplace replay', () => {
  initialConditions = plantConditions();
  agree('cover', 'game', 17);
  useQCLabStore.getState().updateCertificationStatus('expired');
  finishShift();
  const actual = replayResult();
  expect(actual.availablePackedKg).toBeGreaterThan(0);
  expect(actual.shippedKg).toBe(0);
  expect(actual.shipments).toHaveLength(0);
  expect(actual.quality.certification).toBe('expired');
  expect(actual.quality.executionStage).toBe('quality_hold');
  emitEvidence('certification-hold', actual);
});

it('the real material tick time-weights cover expiry when a coarse step crosses minute ten', () => {
  agree('cover');
  for (let i = 0; i < 79; i++) replayStep();
  expect(useWorkplaceStore.getState().workplace.minute).toBe(9.875);
  const tickMaterialFlow = useMaterialFlowStore.getState().tickMaterialFlow;
  const spy = vi.spyOn(useMaterialFlowStore.getState(), 'tickMaterialFlow');
  const operationsMultiplier = useOperationsCampaignStore.getState().getProductionMultiplier();
  unifiedGameTick({
    deltaSeconds: 0.5,
    gameSpeed: 30,
    gameTime: useGameSimulationStore.getState().gameTime,
    elapsedTime: replayTick * 0.5,
    tickCount: ++replayTick,
  });
  expect(spy.mock.calls.at(-1)?.[1]).toBeCloseTo(operationsMultiplier * ((0.98 + 0.78) / 2));
  spy.mockRestore();
  useMaterialFlowStore.setState({ tickMaterialFlow });
  const after = useWorkplaceStore.getState().workplace;
  expect(after.minute).toBe(10.125);
  expect(after.coverRemainingMinutes).toBe(0);
  expect(after.members.reduce((n, m) => n + m.extraMinutes, 0)).toBe(10);
  expect(after.finance.compensationPaid).toBeCloseTo(8);
  expect(workplaceCapacity(after)).toBe(0.78);
});

describe('whole operational checkpoint replay', () => {
  let unregister: Array<() => void> = [];
  const actorState = { routeDistance: 3, operationMinute: 1 };
  function checkpoint() {
    useSafetyStore.setState(useSafetyStore.getInitialState());
    useOperationsCampaignStore.getState().initializeCampaign();
    useGameSimulationStore.getState().setGameSpeed(0);
    useWorkplaceReplayStore.getState().forget();
    actorState.routeDistance = 3;
    unregister = REQUIRED_REPLAY_PARTICIPANTS.map((id) =>
      registerReplayParticipant(id, {
        capture: () => ({ ...actorState }),
        restore: (saved) => Object.assign(actorState, saved),
      })
    );
    expect(useWorkplaceReplayStore.getState().capture(17)).toEqual({ changed: true, reason: null });
    return useWorkplaceReplayStore.getState();
  }
  function approve(plan: 'steady' | 'resequence' | 'cover') {
    const s = useWorkplaceStore.getState();
    s.campaignDecision('keep-target', 'coordinator');
    s.selectPlan(plan);
    for (const actor of ['packing', 'mind'])
      for (const id of requiredChecks(actor))
        s.answerCheck(actor, id, WORKPLACE_CHECKS.find((q) => q.id === id)!.correct);
    s.understand('packing');
    s.vote('packing', true);
    if (plan === 'cover') s.consentToCover('packing', true);
    s.simulateResponses();
    expect(s.activate(useWorkplaceStore.getState().workplace.revision).changed).toBe(true);
  }
  afterEach(() => {
    unregister.forEach((fn) => fn());
    unregister = [];
    endReplayClock();
    centralTick.reset();
    useWorkplaceReplayStore.setState(useWorkplaceReplayStore.getInitialState());
  });
  it('restores material maps, QC holds, faults, parts, clock and hidden tick state without inheriting consent', () => {
    useBreakdownStore.getState().triggerBreakdown('mill-a', 'Test mill', 'mechanical');
    useQCLabStore.setState({
      qcLab: { ...useQCLabStore.getState().qcLab, certificationStatus: 'expired' },
    });
    const lab = checkpoint();
    const conditions = plantConditions();
    const faults = structuredClone(useBreakdownStore.getState().activeBreakdowns);
    const parts = structuredClone(useBreakdownStore.getState().partsInventory);
    const tick = captureUnifiedTickState();
    expect(lab.begin('cooperative').changed).toBe(true);
    approve('steady');
    finishShift();
    useGameSimulationStore.getState().setGameSpeed(0);
    expect(lab.record().changed).toBe(true);
    const priorRevision = useWorkplaceStore.getState().workplace.revision;
    actorState.routeDistance = 999;
    useBreakdownStore.setState({ partsInventory: { ...parts, bearings: 0 } });
    useQCLabStore.setState({
      qcLab: { ...useQCLabStore.getState().qcLab, certificationStatus: 'valid' },
    });
    expect(lab.begin('team').changed).toBe(true);
    expect(plantConditions()).toEqual(conditions);
    expect(useBreakdownStore.getState().activeBreakdowns).toEqual(faults);
    expect(useBreakdownStore.getState().partsInventory).toEqual(parts);
    expect(captureUnifiedTickState()).toEqual(tick);
    expect(actorState.routeDistance).toBe(3);
    const fresh = useWorkplaceStore.getState().workplace;
    expect(fresh.revision).toBeGreaterThan(priorRevision);
    expect(fresh.phase).toBe('deliberating');
    expect(fresh.aiActions).toBe(0);
    expect(fresh.campaign?.checks).toEqual({});
    expect(
      fresh.members.every(
        (m) => !m.sharing && !m.understood && m.ballot === null && m.coverConsent === null
      )
    ).toBe(true);
    expect(useGameSimulationStore.getState().gameSpeed).toBe(0);
    expect(useWorkplaceReplayStore.getState().runs).toHaveLength(1);
  });
  it('uses the same checkpoint for real dispatch runs, retains costs and has no charter production multiplier', () => {
    const lab = checkpoint();
    const run = (profile: 'toe-dip' | 'team' | 'cooperative', plan: 'steady' | 'resequence') => {
      expect(lab.begin(profile).changed).toBe(true);
      replayTick = 0;
      receivingDwell = 0;
      approve(plan);
      finishShift();
      useGameSimulationStore.getState().setGameSpeed(0);
      expect(lab.record().changed).toBe(true);
      return { record: useWorkplaceReplayStore.getState().runs.at(-1)!, physical: replayResult() };
    };
    const a = run('toe-dip', 'steady');
    const b = run('cooperative', 'steady');
    const c = run('team', 'resequence');
    expect(a.record.checkpointId).toBe(b.record.checkpointId);
    expect(a.physical.packedAvailablePlusShippedKg).toEqual(
      b.physical.packedAvailablePlusShippedKg
    );
    expect(a.record.dispatchedKg).toEqual(b.record.dispatchedKg);
    expect(a.record.elapsedMinutes).toBe(90);
    expect(a.record.financial.workplaceWages).toBeCloseTo(108);
    expect(c.record.financial.improvements).toBe(40);
    expect(c.physical.packedAvailablePlusShippedKg).toBeGreaterThan(
      a.physical.packedAvailablePlusShippedKg
    );
    expect(c.record.manifestIds.length).toBeGreaterThan(0);
    expect(c.record.remainingKg).toBeGreaterThanOrEqual(0);
    expect(Math.abs(c.record.materialErrorKg)).toBeLessThan(0.001);
    emitEvidence('checkpoint-replay', { records: useWorkplaceReplayStore.getState().runs });
  });
  it('refuses to erase earned cover and recovery through capture, rewind, record or forget', () => {
    const lab = checkpoint();
    lab.begin('cooperative');
    approve('cover');
    useWorkplaceStore.getState().tick(3, 0, false);
    useWorkplaceStore.getState().stop();
    const before = useWorkplaceStore.getState().workplace;
    expect(before.finance.compensationPaid).toBeGreaterThan(0);
    for (const action of [
      () => lab.capture(18),
      () => lab.begin('team'),
      () => lab.record(),
      () => lab.forget(),
    ])
      expect(action().changed).toBe(false);
    expect(useWorkplaceStore.getState().workplace).toBe(before);
  });
  it('preflights owner identity, material session and safety before any rewind mutation', () => {
    const lab = checkpoint();
    const material = useMaterialFlowStore.getState();
    useGameSimulationStore.getState().triggerEmergency();
    expect(lab.begin('team').reason).toMatch(/safety hold/);
    useGameSimulationStore.getState().resolveEmergency();
    useGameSimulationStore.getState().setGameSpeed(0);
    useMaterialFlowStore.setState({ sessionId: 'foreign-session' });
    expect(lab.begin('team').reason).toMatch(/material session changed/);
    useMaterialFlowStore.setState({ sessionId: material.sessionId });
    unregister[0]();
    expect(lab.begin('team').reason).toMatch(/scene changed/);
    expect(useMaterialFlowStore.getState().machineBuffers).toBe(material.machineBuffers);
  });
  it('denies live and hybrid SCADA even when disconnected', () => {
    useSafetyStore.setState(useSafetyStore.getInitialState());
    const service = vi.spyOn(scada, 'peekSCADAService');
    for (const mode of ['live', 'hybrid'] as const) {
      service.mockReturnValue({ getState: () => ({ mode }) } as scada.SCADAService);
      useGameSimulationStore.getState().setGameSpeed(0);
      expect(useWorkplaceReplayStore.getState().capture(17).reason).toMatch(/never live or hybrid/);
    }
  });
  it('stops an active replay before another material tick when local control becomes live', () => {
    const lab = checkpoint();
    lab.begin('cooperative');
    approve('steady');
    const flow = useMaterialFlowStore.getState();
    vi.spyOn(scada, 'peekSCADAService').mockReturnValue({
      getState: () => ({ mode: 'live' }),
    } as scada.SCADAService);
    step();
    expect(useWorkplaceStore.getState().workplace.phase).toBe('review');
    expect(useGameSimulationStore.getState().gameSpeed).toBe(0);
    expect(useMaterialFlowStore.getState().machineBuffers).toBe(flow.machineBuffers);
    expect(lab.record().changed).toBe(false);
  });
  it('exports public conduct only, without raw checkpoints, private preference or authority', () => {
    const lab = checkpoint();
    lab.begin('cooperative');
    approve('cover');
    const active = useWorkplaceStore.getState().workplace;
    useWorkplaceStore.setState({
      workplace: {
        ...active,
        members: active.members.map((m) => ({ ...m, preference: 'PRIVATE REASON', sharing: true })),
        events: [
          ...active.events,
          {
            id: 'public-event',
            minute: 0,
            actorId: 'packing',
            kind: 'privacy-consent',
            detail: 'PRIVATE REASON',
          },
        ],
      },
    });
    finishShift();
    lab.record();
    const report = exportWorkplaceReplayReport();
    expect(report).not.toContain('PRIVATE REASON');
    for (const field of ['machineBuffers', 'sharing', 'coverConsent', 'randomState'])
      expect(report).not.toContain(`"${field}":`);
    expect(
      JSON.parse(report).runs[0].members.some((m: { extraMinutes: number }) => m.extraMinutes > 0)
    ).toBe(true);
    useWorkplaceReplayStore.setState(useWorkplaceReplayStore.getInitialState());
    expect(useWorkplaceReplayStore.getState().begin('team').changed).toBe(false);
  });
  it('replays the fault random stream and logical time while preserving normal fallback behaviour', () => {
    const lab = checkpoint();
    lab.begin('toe-dip');
    const values = [workplaceSimulationRandom(), workplaceSimulationRandom()];
    const now = workplaceSimulationNow();
    advanceReplayClock(1000);
    expect(workplaceSimulationNow()).toBe(now + 1000);
    useWorkplaceStore.getState().stop();
    useGameSimulationStore.getState().setGameSpeed(0);
    expect(lab.begin('team').changed).toBe(true);
    expect([workplaceSimulationRandom(), workplaceSimulationRandom()]).toEqual(values);
    expect(workplaceSimulationNow()).toBe(now);
    endReplayClock();
    expect(workplaceSimulationRandom()).toBe(0.5);
  });
  it('restores the tick phase and discards stale queued work without deleting callback registrations', () => {
    centralTick.register('kept', vi.fn(), 50);
    centralTick.tick(1, 8, 15);
    const before = centralTick.captureClock();
    expect(centralTick.getLazyQueueLength()).toBe(1);
    centralTick.restoreClock(before);
    expect(centralTick.getStats().callbacks).toContain('kept');
    expect(centralTick.getLazyQueueLength()).toBe(0);
    expect(centralTick.tick(100, 8, 15)).toBe(false);
    expect(centralTick.tick(100.5, 8, 15)).toBe(true);
    expect(centralTick.getStats().tickCount).toBe(before.tickCount + 1);
  });
});
