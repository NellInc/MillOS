import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { appendFileSync, readFileSync } from 'node:fs';
import * as ts from 'typescript';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import { MachineType, type MachineData } from '../../types';
import { centralTick } from '../../systems/CentralTickSystem';
import { resetUnifiedTickState, unifiedGameTick } from '../../systems/UnifiedGameTick';
import { useProductionStore } from '../../stores/productionStore';
import {
  MAX_MATERIAL_MANIFESTS,
  MAX_PRODUCTION_BATCHES,
  useMaterialFlowStore,
} from '../../stores/materialFlowStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useTruckScheduleStore } from '../../stores/truckScheduleStore';
import { useBreakdownStore } from '../../stores/breakdownStore';
import { useQCLabStore } from '../../stores/qcLabStore';
import { toSimulationMinutes } from '../../simulation/simulationClock';
import {
  createTruckController,
  stepTruckController,
  type TruckControllerState,
} from '../../components/truckbay/truckController';
import type { TruckAnimState } from '../../components/truckbay/useTruckPhysics';
import type { TruckLifecyclePhase } from '../../stores/truckScheduleStore';
import {
  advanceTruckClock,
  TRUCK_CONTROLLER_STEP_SECONDS,
} from '../../components/truckbay/truckClock';
import { STANDARD_GAME_SPEED } from '../../simulation/pace';
import {
  capturePhysicalSession,
  decodePhysicalSession,
  encodePhysicalSession,
  installPhysicalSession,
  isPhysicalSessionRestoring,
  MAX_SAVE_BYTES,
} from '../physicalSession';
import { useSafetyStore } from '../../stores/safetyStore';
import { useAchievementsStore } from '../../stores/achievementsStore';
import { useUIStore } from '../../stores/uiStore';
import {
  registerReplayParticipant,
  REQUIRED_REPLAY_PARTICIPANTS,
} from '../../simulation/workplaceReplayRuntime';

// One parcel per transit tick in flight plus one merged retry parcel per type.
const MAX_PARCELS_PER_SEGMENT = 48;

// The real roster and the real dock predicates, exactly as the playable journey
// test executes them, so the save grows from the actual tick and truck yard.
function extract(file: string, pick: (node: ts.Node, sf: ts.SourceFile) => string | null) {
  const sf = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const out: string[] = [];
  const walk = (node: ts.Node) => {
    const hit = pick(node, sf);
    if (hit) out.push(hit);
    ts.forEachChild(node, walk);
  };
  walk(sf);
  return out;
}
const js = (src: string) =>
  ts.transpileModule(src, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
const rosterBodies = extract('src/components/MillScene.tsx', (node, sf) =>
  ts.isVariableDeclaration(node) &&
  node.name.getText(sf) === 'machines' &&
  node.initializer &&
  ts.isCallExpression(node.initializer) &&
  node.initializer.expression.getText(sf) === 'useMemo' &&
  node.initializer.arguments[0] &&
  ts.isArrowFunction(node.initializer.arguments[0])
    ? node.initializer.arguments[0].body.getText(sf)
    : null
);
expect(rosterBodies).toHaveLength(1);
const makeRoster = new Function(
  'SITE_LAYOUT',
  'MachineType',
  `${js(`function buildRoster() ${rosterBodies[0]}`)}; return buildRoster();`
) as (layout: typeof SITE_LAYOUT, types: typeof MachineType) => MachineData[];
const predicateNames = ['isTruckPhysicallyDocked', 'isTruckTransferReady', 'getTruckLifecycle'];
const predicates = extract('src/components/TruckBay.tsx', (node, sf) =>
  ts.isVariableDeclaration(node) && predicateNames.includes(node.name.getText(sf))
    ? `const ${node.getText(sf)};`
    : null
);
expect(predicates).toHaveLength(predicateNames.length);
const dock = new Function(
  js(predicates.join('\n')) + `;return {${predicateNames.join(',')}};`
)() as {
  isTruckPhysicallyDocked: (pose: TruckAnimState) => boolean;
  isTruckTransferReady: (pose: TruckAnimState) => boolean;
  getTruckLifecycle: (pose: TruckAnimState) => TruckLifecyclePhase;
};

const deltaSeconds = centralTick.getStats().tickInterval;
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
  fetchSpy = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(() => Promise.reject(new Error('offline')));
});
let removeOwners: (() => void)[] = [];
beforeEach(() => {
  removeOwners = REQUIRED_REPLAY_PARTICIPANTS.map((id) =>
    registerReplayParticipant(id, { capture: () => ({ id }), restore: () => {} })
  );
});
afterEach(() => {
  fetchSpy.mockRestore();
  removeOwners.forEach((remove) => remove());
});

// Every saved store as a freshly loaded page holds it, before any restore.
function freshPage() {
  for (const store of [
    useProductionStore,
    useMaterialFlowStore,
    useOperationsCampaignStore,
    useGameSimulationStore,
    useBreakdownStore,
    useTruckScheduleStore,
    useQCLabStore,
    useSafetyStore,
    useAchievementsStore,
  ] as const)
    (store as { setState: (s: unknown, replace: true) => void }).setState(
      store.getInitialState(),
      true
    );
  resetUnifiedTickState();
}

// Same tagging as encodePhysicalSession, without its size gate, so a domain can
// be measured past the budget.
const size = (value: unknown) =>
  JSON.stringify(value, function (this: Record<string, unknown>, key, v: unknown) {
    const original = this[key];
    if (original instanceof Date) return { t: 'date', value: original.toISOString() };
    if (original instanceof Map) return { t: 'map', value: [...original] };
    return v;
  }).length;

function play(gameDays: number, acceptProgrammes: boolean) {
  const controllers: Record<'shipping' | 'receiving', TruckControllerState> = {
    shipping: createTruckController('shipping'),
    receiving: createTruckController('receiving'),
  };
  const accumulators = { shipping: 0, receiving: 0 };
  const renderFrame = 1 / 60;
  const framesPerTick = Math.round(deltaSeconds / renderFrame);
  let tickCount = 0;
  let firstDelivered = false;
  const samples: {
    hour: number;
    domains: Record<string, number>;
    fields: Record<string, number>;
  }[] = [];
  const startMinute = () =>
    toSimulationMinutes({
      day: useGameSimulationStore.getState().gameDay,
      hour: useGameSimulationStore.getState().gameTime,
    });
  const origin = startMinute();
  let nextSample = 0;
  useGameSimulationStore.getState().setGameSpeed(STANDARD_GAME_SPEED);
  while (startMinute() - origin < gameDays * 1440) {
    // Standard pace through the first delivery, then 4x, as the play-test did.
    if (!firstDelivered && useMaterialFlowStore.getState().shippedKg > 0) {
      firstDelivered = true;
      useGameSimulationStore.getState().setGameSpeed(120);
    }
    const pace = useGameSimulationStore.getState().gameSpeed;
    if (
      acceptProgrammes &&
      useOperationsCampaignStore.getState().orders.every((o) => o.status === 'fulfilled')
    )
      useOperationsCampaignStore.getState().acceptNextProgramme();
    for (let frame = 0; frame < framesPerTick; frame++) {
      for (const lane of ['receiving', 'shipping'] as const) {
        const clock = advanceTruckClock(
          accumulators[lane],
          renderFrame,
          pace,
          controllers[lane].motion.speed
        );
        accumulators[lane] = clock.accumulator;
        for (let s = 0; s < clock.steps; s++) {
          const trucks = useTruckScheduleStore.getState();
          const campaign = useOperationsCampaignStore.getState();
          const result = stepTruckController(controllers[lane], {
            deltaSeconds: TRUCK_CONTROLLER_STEP_SECONDS,
            arrivalReady: trucks.truckSchedule[lane].arrivalReady,
            safetyHold: false,
            serviceComplete:
              lane === 'receiving' || campaign.execution.dispatchLoad.status === 'ready',
            speedMultiplier: campaign.getIncidentEffect().vehicleSpeedMultiplier,
          });
          controllers[lane] = result.state;
          if (trucks.truckSchedule[lane].arrivalReady && result.state.active)
            trucks.consumeTruckArrival(lane);
          if (result.departedThisStep) trucks.recordTruckDeparture(lane, startMinute());
          if (trucks.truckSchedule[lane].truckDocked !== dock.isTruckPhysicallyDocked(result.pose))
            trucks.setTruckDocked(lane, dock.isTruckPhysicallyDocked(result.pose));
          if (
            useTruckScheduleStore.getState().truckSchedule[lane].transferReady !==
            dock.isTruckTransferReady(result.pose)
          )
            trucks.setTruckTransferReady(lane, dock.isTruckTransferReady(result.pose));
          if (
            useTruckScheduleStore.getState().truckSchedule[lane].lifecyclePhase !==
            dock.getTruckLifecycle(result.pose)
          )
            trucks.setTruckLifecycle(lane, dock.getTruckLifecycle(result.pose));
        }
      }
    }
    unifiedGameTick({
      deltaSeconds,
      gameSpeed: pace,
      gameTime: useGameSimulationStore.getState().gameTime,
      elapsedTime: tickCount * deltaSeconds,
      tickCount: ++tickCount,
    });
    const minute = startMinute() - origin;
    if (minute >= nextSample) {
      nextSample += 60;
      const session = capturePhysicalSession() as unknown as Record<string, unknown>;
      const domains: Record<string, number> = {};
      const fields: Record<string, number> = {};
      for (const [name, value] of Object.entries(session)) {
        domains[name] = size(value);
        if (value && typeof value === 'object' && !Array.isArray(value))
          for (const [field, inner] of Object.entries(value))
            fields[`${name}.${field}`] = size(inner) ?? 0;
      }
      samples.push({ hour: minute / 60, domains, fields });
    }
  }
  return samples;
}

function report(label: string, samples: ReturnType<typeof play>) {
  const first = samples[0];
  const last = samples.at(-1)!;
  const hours = last.hour - first.hour;
  const total = (s: (typeof samples)[number]) => Object.values(s.domains).reduce((a, b) => a + b);
  const rows = Object.keys(last.fields)
    .map((k) => ({
      field: k,
      start: first.fields[k] ?? 0,
      end: last.fields[k],
      perHour: Math.round((last.fields[k] - (first.fields[k] ?? 0)) / hours),
    }))
    .filter((r) => r.end > 2000 || r.perHour > 50)
    .sort((a, b) => b.perHour - a.perHour);
  const text =
    `\n[${label}] ${hours.toFixed(1)} game h, total ${total(first)} -> ${total(last)} chars ` +
    `(${Math.round((total(last) - total(first)) / hours)} chars/game h)\n` +
    Object.keys(last.domains)
      .map(
        (d) =>
          `  ${d}: ${first.domains[d]} -> ${last.domains[d]} (${Math.round((last.domains[d] - first.domains[d]) / hours)}/h)`
      )
      .join('\n') +
    '\n  fields:\n' +
    rows.map((r) => `    ${r.field}: ${r.start} -> ${r.end} (${r.perHour}/h)`).join('\n') +
    '\n  curve (total chars by game hour): ' +
    samples
      .filter((_, i) => i % 6 === 0)
      .map((s) => `${s.hour.toFixed(0)}h=${total(s)}`)
      .join(' ');
  if (process.env.GROWTH_OUT) appendFileSync(process.env.GROWTH_OUT, text);
  return total(last);
}

// The stranger play-test lost every autosave after about one game day at 4x:
// each history was capped, but the caps' equilibrium (~2.3 M chars, dominated by
// a 500-record process log) sat above the 1.5 M-char gate. Working if three game
// days of either play pattern encode through the real gate at a quarter of it,
// with every retained window at its pinned cap.
it('pins the retained history windows', () => {
  expect(MAX_PRODUCTION_BATCHES).toBe(32);
  expect(MAX_MATERIAL_MANIFESTS).toBe(32);
});

it.each([
  ['idle after the programme', false],
  ['accepting each next programme', true],
] as const)(
  'keeps three game days at 4x within a quarter of the save budget, %s',
  (label, acceptProgrammes) => {
    const samples = play(3, acceptProgrammes);
    report(label, samples);
    const raw = encodePhysicalSession(capturePhysicalSession());
    expect(raw.length * 2).toBeLessThan(MAX_SAVE_BYTES * 0.25);
    const saved = decodePhysicalSession(raw);
    // The process log is an in-memory window; reload honesty rides on stock,
    // batch contributions and the ledger, which the decode validates.
    expect(saved.material.processGenealogy).toEqual([]);
    expect(
      saved.material.productionBatches.filter((b) => b.disposition === 'shipped').length
    ).toBeLessThanOrEqual(MAX_PRODUCTION_BATCHES);
    expect(saved.material.manifests.length).toBeLessThanOrEqual(MAX_MATERIAL_MANIFESTS);
    // A backed-up belt holds its mass as one retry parcel per type, not one per tick.
    for (const segment of saved.material.network.segments)
      expect(segment.inTransit.length).toBeLessThanOrEqual(MAX_PARCELS_PER_SEGMENT);
    // Plateau, not growth: the last game day adds little to the record.
    const total = (s: (typeof samples)[number]) => Object.values(s.domains).reduce((a, b) => a + b);
    expect(total(samples.at(-1)!) - total(samples.at(-25)!)).toBeLessThan(MAX_SAVE_BYTES * 0.05);

    // A reload decodes against a fresh page's stores, not the playing ones: a
    // genuine mid-play record failed there with 'Invalid physical field'.
    freshPage();
    expect(() => decodePhysicalSession(raw)).not.toThrow();
    const storage = { getItem: () => raw, setItem: vi.fn() };
    const alerts = useUIStore.getState().alerts.length;
    const dispose = installPhysicalSession(storage);
    try {
      expect(useUIStore.getState().alerts.slice(alerts)).toEqual([]);
      expect(isPhysicalSessionRestoring()).toBe(true);
      expect(useMaterialFlowStore.getState().shippedKg).toBe(saved.material.shippedKg);
    } finally {
      dispose();
    }
  },
  600_000
);
