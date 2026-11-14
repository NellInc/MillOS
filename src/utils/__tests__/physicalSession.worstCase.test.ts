import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import * as ts from 'typescript';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import { MachineType, type MachineData } from '../../types';
import { centralTick } from '../../systems/CentralTickSystem';
import { resetUnifiedTickState, unifiedGameTick } from '../../systems/UnifiedGameTick';
import { useProductionStore } from '../../stores/productionStore';
import { GENEALOGY_RETENTION, useMaterialFlowStore } from '../../stores/materialFlowStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useTruckScheduleStore } from '../../stores/truckScheduleStore';
import { useBreakdownStore } from '../../stores/breakdownStore';
import { useQCLabStore } from '../../stores/qcLabStore';
import { usePartnerProposalStore } from '../../stores/partnerProposalStore';
import { useChronicleStore } from '../../stores/chronicleStore';
import { useWorkplaceStore } from '../../stores/workplaceStore';
import { createWorkplace } from '../../simulation/bilateralWorkplace';
import { createInitialState } from '../../chronicle/engine';
import { DEFAULT_CHARTER } from '../../chronicle/charter';
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
  MAX_SAVE_BYTES,
  SAVED_LOGBOOK_TAIL,
} from '../physicalSession';
import { useSafetyStore } from '../../stores/safetyStore';
import { useAchievementsStore } from '../../stores/achievementsStore';
import { useUIStore } from '../../stores/uiStore';
import {
  registerReplayParticipant,
  REQUIRED_REPLAY_PARTICIPANTS,
} from '../../simulation/workplaceReplayRuntime';

// Plan wave 3c: the save's worst realistic case. The budget test measures a
// plant that only takes programmes for three days; this one adds every layer
// that writes to the saved stores at once: a Chronicle charter signed and
// played to about shift 20, a cooperative season under way, held off-spec
// stock and an open partner proposal, with the plant still shipping.
// Measured 2026-11-13 (plan wave 3c): the record grows with every lot the
// plant receives, because each parcel, belt load and batch carries one
// contribution per lot it ever mixed (1.6 MB at shift 21, 2.4 MB at day 14).
// Plan wave 3d bounded it: lots over three game days old merge into their
// grain's earlier stock (materialFlowStore retainGenealogy), and the save writes
// lot contributions compactly (physicalSession compactContributions).

/** The quarter-gate budget physicalSession.budget.test.ts pins (750,000 bytes). */
const BUDGET_BYTES = MAX_SAVE_BYTES * 0.25;
const HEADROOM = 0.15;

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

const size = (value: unknown) =>
  JSON.stringify(value, function (this: Record<string, unknown>, key, v: unknown) {
    const original = this[key];
    if (original instanceof Date) return { t: 'date', value: original.toISOString() };
    if (original instanceof Map) return { t: 'map', value: [...original] };
    return v;
  }).length;

/** Values decode's validateTree would visit, counted on the encoded record. */
function nodeCount(raw: string): number {
  let count = 0;
  const walk = (value: unknown) => {
    count += 1;
    if (value && typeof value === 'object')
      for (const inner of Object.values(value as Record<string, unknown>)) walk(inner);
  };
  walk(JSON.parse(raw));
  return count;
}

const nowMinute = () =>
  toSimulationMinutes({
    day: useGameSimulationStore.getState().gameDay,
    hour: useGameSimulationStore.getState().gameTime,
  });

function freshStores() {
  resetUnifiedTickState();
  useMaterialFlowStore.getState().resetMaterialFlow();
  useOperationsCampaignStore.getState().resetCampaign();
  useGameSimulationStore.getState().resetGameState();
  useTruckScheduleStore.getState().resetTruckSchedule();
  useBreakdownStore.getState().resetBreakdownStore();
  useQCLabStore.getState().resetQCLab();
  usePartnerProposalStore.getState().reset();
  useChronicleStore.setState({ chronicle: createInitialState() });
  useWorkplaceStore.setState({ workplace: createWorkplace() });
  useUIStore.setState({ alerts: [] });
  useProductionStore.setState({
    ...useProductionStore.getInitialState(),
    machines: makeRoster(SITE_LAYOUT, MachineType),
    productionSpeed: 1,
  });
}

interface PlayOptions {
  gameDays: number;
  /** Charter, season, held stock and an open proposal; false is plain play. */
  layers: boolean;
  /** Called every two game hours with the game day. */
  onSample?: (day: number) => boolean | void;
}

/** Plays the real tick and truck yard; returns what the layers did. */
function play({ gameDays, layers, onSample }: PlayOptions) {
  freshStores();
  const controllers: Record<'shipping' | 'receiving', TruckControllerState> = {
    shipping: createTruckController('shipping'),
    receiving: createTruckController('receiving'),
  };
  const accumulators = { shipping: 0, receiving: 0 };
  const renderFrame = 1 / 60;
  const framesPerTick = Math.round(deltaSeconds / renderFrame);
  let tickCount = 0;
  let firstDelivered = false;
  let seasonStarted = false;
  let stalled = 0;
  let lastMinute = nowMinute();
  let nextSample = 120;
  let heldBatches = 0;
  let shippedBeforeLastDay = 0;
  const origin = nowMinute();
  const endMinute = gameDays * 1440;
  // Off-spec stock is put under a hold two game hours before the end, so it
  // is held when the record is taken.
  const holdAt = endMinute - 120;
  if (layers) {
    useChronicleStore.getState().sign(DEFAULT_CHARTER, 21);
    // The partner answers routine Chronicle events, so no dialog waits on input.
    useChronicleStore.setState((s) => ({ chronicle: { ...s.chronicle, delegation: 2 } }));
    // The partner asks before a service rather than deciding (the player's
    // choice of "Ask me"), so a service proposal can stand open in the record.
    usePartnerProposalStore.getState().setDelegation('service', 'ask');
  }
  useGameSimulationStore.getState().setGameSpeed(STANDARD_GAME_SPEED);
  const openProposal = () =>
    usePartnerProposalStore.getState().proposals.some((p) => p.status === 'open');
  // Past the end, play on (up to a game day) until a proposal stands open.
  for (;;) {
    const elapsed = nowMinute() - origin;
    if (elapsed >= endMinute && (!layers || openProposal() || elapsed >= endMinute + 1440)) break;
    if (elapsed >= endMinute - 1440 && shippedBeforeLastDay === 0)
      shippedBeforeLastDay = useMaterialFlowStore.getState().shippedKg || 1e-9;
    if (onSample && elapsed >= nextSample) {
      nextSample += 120;
      if (onSample(elapsed / 1440) === false) break;
    }
    if (!firstDelivered && useMaterialFlowStore.getState().shippedKg > 0) {
      firstDelivered = true;
      useGameSimulationStore.getState().setGameSpeed(120);
    }
    if (layers && firstDelivered && !seasonStarted)
      seasonStarted = useWorkplaceStore.getState().startMission('cooperative', 17).changed;
    // The next programme as soon as the book is closed, as canAcceptNextProgramme
    // reads it (a forfeited, cancelled order closes too). Left to the partner,
    // the open season's linked review keeps it from accepting.
    if (
      useOperationsCampaignStore
        .getState()
        .orders.every((o) => o.status === 'fulfilled' || o.status === 'cancelled')
    )
      useOperationsCampaignStore.getState().acceptNextProgramme();
    if (layers && heldBatches === 0 && elapsed >= holdAt) {
      // Half the stock on hand, so the plant backs up and still ships.
      const available = useMaterialFlowStore
        .getState()
        .productionBatches.filter((b) => b.availableKg > 0);
      const batchIds = available.slice(0, Math.ceil(available.length / 2)).map((b) => b.id);
      if (batchIds.length) {
        useQCLabStore.getState().triggerContaminationAlert({
          batchIds,
          severity: 'medium',
          controlSource: 'worst-case test',
        });
        heldBatches = batchIds.length;
      }
    }
    const pace = useGameSimulationStore.getState().gameSpeed;
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
          if (result.departedThisStep) trucks.recordTruckDeparture(lane, nowMinute());
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
    if (layers) useChronicleStore.getState().observe(false);
    // A hold that never lifts would loop for ever: fail with what holds it.
    const minute = nowMinute();
    stalled = minute > lastMinute ? 0 : stalled + 1;
    lastMinute = minute;
    if (stalled > 2000)
      throw new Error(
        `Plant clock stalled at ${minute}: holds ${JSON.stringify(useGameSimulationStore.getState().clockHolds)}`
      );
  }
  return {
    seasonStarted,
    heldBatches,
    shippedInLastDay: useMaterialFlowStore.getState().shippedKg - shippedBeforeLastDay,
    openProposal: openProposal(),
  };
}

let removeOwners: (() => void)[] = [];
function installHarness() {
  // A fixed random stream, as the workplace replay test pins it.
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.reject(new Error('offline')));
  removeOwners = REQUIRED_REPLAY_PARTICIPANTS.map((id) =>
    registerReplayParticipant(id, { capture: () => ({ id }), restore: () => {} })
  );
}
function removeHarness() {
  vi.restoreAllMocks();
  removeOwners.forEach((remove) => remove());
}

describe('the worst realistic save, at about shift 20', () => {
  let outcome: ReturnType<typeof play>;
  let raw = '';
  let bytes = 0;
  beforeAll(() => {
    installHarness();
    outcome = play({ gameDays: 7, layers: true });
    raw = encodePhysicalSession(capturePhysicalSession());
    bytes = raw.length * 2;
    const campaign = useOperationsCampaignStore.getState();
    const windowed = capturePhysicalSession();
    const unwindowed =
      bytes +
      (size(campaign.logbook) - size(windowed.operations.logbook)) * 2 +
      (size(campaign.reports) - size(windowed.operations.reports)) * 2;
    process.stderr.write(
      `\n[worst case] shift ${useChronicleStore.getState().chronicle.shift}: ${bytes} bytes ` +
        `(${((bytes / BUDGET_BYTES) * 100).toFixed(1)}% of ${BUDGET_BYTES}); ` +
        `without the logbook and report windows ${unwindowed} ` +
        `(${((unwindowed / BUDGET_BYTES) * 100).toFixed(1)}%); lots ${useMaterialFlowStore.getState().sourceLots.size}, ` +
        `shipped ${Math.round(useMaterialFlowStore.getState().shippedKg)} kg, received ${Math.round(useMaterialFlowStore.getState().receivedKg)} kg\n`
    );
  }, 900_000);
  afterAll(removeHarness);

  it('has every layer on, with the plant still shipping', () => {
    const chronicle = useChronicleStore.getState().chronicle;
    expect(chronicle.status).toBe('active');
    expect(chronicle.shift).toBeGreaterThanOrEqual(18);
    expect(outcome.seasonStarted).toBe(true);
    expect(useWorkplaceStore.getState().workplace.campaign).toBeTruthy();
    expect(outcome.heldBatches).toBeGreaterThan(0);
    expect(
      useMaterialFlowStore.getState().productionBatches.some((b) => b.disposition === 'hold')
    ).toBe(true);
    expect(outcome.openProposal).toBe(true);
    expect(outcome.shippedInLastDay).toBeGreaterThan(0);
  });

  it('stays 15% inside the write gate and the load node budget, and a fresh page restores it', () => {
    expect(bytes).toBeLessThan(MAX_SAVE_BYTES * 0.85);
    expect(nodeCount(raw)).toBeLessThan(200_000 * 0.85);
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
    const saved = decodePhysicalSession(raw);
    // The logbook is saved as a window: a tail, the open shift's lines, and
    // the latest programme acceptance.
    expect(saved.operations.logbook.length).toBeGreaterThanOrEqual(SAVED_LOGBOOK_TAIL);
    expect(saved.operations.logbook.length).toBeLessThan(160);
    expect(
      saved.operations.logbook.some((entry) => entry.wording?.key === 'logProgrammeAccepted')
    ).toBe(true);
  });

  // Met by the genealogy rule and the compact contributions (plan wave 3d):
  // 815,160 bytes here before them, about 519,000 after (31% headroom).
  it('meets the 15% headroom under the 750,000-byte budget', () => {
    expect(bytes).toBeLessThan(BUDGET_BYTES * (1 - HEADROOM));
  });
});

/**
 * A whole chronicle (63 shifts, 21 game days) of the worst case keeps saving,
 * and its record stops growing (plan wave 3d). The record swings with the
 * parcels on the belts (15 K to 260 K bytes of transit alone), so each window
 * of ten shifts is read by its largest record, sampled every two game hours.
 * Flat means: no window from shift 40 on holds a record more than
 * FLAT_TOLERANCE larger than the largest of shifts 30 to 39. Measured
 * 13 November: 716,434 / 730,344 / 762,320 / 755,624 bytes (lots on record
 * hold at the three-day window, 45 to 58; before the rule the record passed
 * 3,000,000 bytes at shift 40 and autosave stopped).
 */
const FLAT_TOLERANCE = 0.1;
describe('a whole chronicle of the worst case', () => {
  const largest = new Map<number, number>();
  let refusedAtShift: number | null = null;
  beforeAll(() => {
    installHarness();
    try {
      play({
        gameDays: 21,
        layers: true,
        onSample: (day) => {
          const shift = Math.ceil(day * 3 - 1e-9);
          try {
            const bytes = encodePhysicalSession(capturePhysicalSession()).length * 2;
            largest.set(shift, Math.max(largest.get(shift) ?? 0, bytes));
          } catch {
            refusedAtShift ??= shift;
            return false;
          }
        },
      });
    } finally {
      removeHarness();
    }
    process.stderr.write(
      `\n[whole chronicle] largest record by ten shifts: ${[30, 40, 50, 60]
        .map((from) => `${from}-${from + 9}: ${windowMax(from)}`)
        .join(', ')}\n`
    );
  }, 3_600_000);
  const windowMax = (from: number) =>
    Math.max(...[...largest].filter(([s]) => s >= from && s < from + 10).map(([, b]) => b));

  it('saves to the last shift', () => {
    expect(refusedAtShift).toBeNull();
    expect(Math.max(...largest.keys())).toBeGreaterThanOrEqual(63);
    expect(Math.max(...largest.values())).toBeLessThan(BUDGET_BYTES * 1.5);
  });

  it(`stays flat from shift 30 to 63, within ${FLAT_TOLERANCE * 100}%`, () => {
    const base = windowMax(30);
    for (const from of [40, 50, 60])
      expect(windowMax(from), `shifts ${from}-${from + 9}`).toBeLessThanOrEqual(
        base * (1 + FLAT_TOLERANCE)
      );
  });
});

// The measurement behind the genealogy decision (plan wave 3c). Not a gate:
// SAVE_CURVE=<days> prints, per game day, the largest record of those taken
// every two game hours: as saved, its node count, a lossless compact form of
// the lot contributions (a path table and [lot, kg, path] rows), and per-path
// share cuts that fold released lots under 0.1%, 1% and 2% of their path into
// the rest of it, with the mass so reattributed and the memberships dropped.
type Contribution = { lotId: string; amount: number; path: string[] };
const isContributions = (value: unknown): value is Contribution[] =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every(
    (c) =>
      !!c &&
      typeof c === 'object' &&
      Object.keys(c).length === 3 &&
      typeof (c as Contribution).lotId === 'string' &&
      typeof (c as Contribution).amount === 'number' &&
      Array.isArray((c as Contribution).path)
  );
function sessionBytes(transform: (list: Contribution[]) => unknown): number {
  return (
    JSON.stringify(capturePhysicalSession(), function (this: Record<string, unknown>, key, v) {
      const original = this[key];
      if (original instanceof Date) return { t: 'date', value: original.toISOString() };
      if (original instanceof Map) return { t: 'map', value: [...original] };
      return isContributions(v) ? transform(v) : v;
    }).length * 2
  );
}
const compactBytes = () =>
  sessionBytes((list) => {
    const paths = [...new Set(list.map((c) => c.path.join('>')))];
    return {
      t: 'lots',
      value: [paths, list.map((c) => [c.lotId, c.amount, paths.indexOf(c.path.join('>'))])],
    };
  });
function cutBytes(threshold: number): { bytes: number; movedKg: number; dropped: number } {
  const lots = useMaterialFlowStore.getState().sourceLots;
  let movedKg = 0;
  let dropped = 0;
  const bytes = sessionBytes((list) => {
    const byPath = new Map<string, Contribution[]>();
    for (const c of list) {
      const key = c.path.join('>');
      byPath.set(key, [...(byPath.get(key) ?? []), c]);
    }
    const out: Contribution[] = [];
    for (const group of byPath.values()) {
      const total = group.reduce((n, c) => n + c.amount, 0);
      const keep = group.filter(
        (c) =>
          c.amount >= threshold * total ||
          (lots.get(c.lotId)?.disposition ?? 'released') !== 'released'
      );
      if (keep.length === 0) {
        out.push(...group);
        continue;
      }
      const kept = keep.reduce((n, c) => n + c.amount, 0);
      movedKg += total - kept;
      dropped += group.length - keep.length;
      for (const c of keep) out.push({ ...c, amount: (c.amount * total) / kept });
    }
    return out;
  });
  return { bytes, movedKg, dropped };
}

/**
 * Bytes of each saved section, one sample a shift (the record's largest of the
 * two-hourly samples in that shift): every domain of the record, and the
 * material, operations and quality domains field by field. Not a gate:
 * SAVE_SECTIONS=<days> prints the table (plan wave 3d, the genealogy rule).
 */
function sectionBytes(): Record<string, number> {
  // Measured as saved: each domain of the encoded record, raw.
  const raw = encodePhysicalSession(capturePhysicalSession());
  const record = JSON.parse(raw) as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const [domain, value] of Object.entries(record)) {
    out[domain] = JSON.stringify(value).length * 2;
    if (
      ['material', 'operations', 'quality', 'production', 'logistics'].includes(domain) &&
      value &&
      typeof value === 'object'
    )
      for (const [key, inner] of Object.entries(
        domain === 'quality' ? (value as { qcLab: object }).qcLab : (value as object)
      ))
        out[`${domain}.${key}`] = JSON.stringify(inner).length * 2;
  }
  out.total = raw.length * 2;
  return out;
}

it.runIf(process.env.SAVE_SECTIONS)(
  'measures each saved section by shift, with every layer on',
  () => {
    installHarness();
    try {
      const byShift = new Map<number, Record<string, number>>();
      play({
        gameDays: Number(process.env.SAVE_SECTIONS),
        layers: true,
        onSample: (day) => {
          const shift = Math.ceil(day * 3 - 1e-9);
          let sample: Record<string, number>;
          try {
            sample = sectionBytes();
          } catch {
            return false;
          }
          const previous = byShift.get(shift);
          if (!previous || sample.total > previous.total) byShift.set(shift, sample);
        },
      });
      const keys = Object.keys(byShift.get(1) ?? {}).filter((key) =>
        [...byShift.values()].some((s) => (s[key] ?? 0) > 2000)
      );
      process.stderr.write(
        `\nSECTIONS shift | ${keys.join(' | ')}\n` +
          [...byShift.entries()]
            .map(([shift, s]) => `SECTIONS ${shift} | ${keys.map((k) => s[k] ?? 0).join(' | ')}`)
            .join('\n') +
          `\nSECTIONS lots ${useMaterialFlowStore.getState().sourceLots.size} chronicle shift ${useChronicleStore.getState().chronicle.shift}\n`
      );
    } finally {
      removeHarness();
    }
  },
  3_600_000
);

/** Where the lot contributions sit, and how much of each lot is still on site. */
function genealogyProbe(): string {
  const flow = useMaterialFlowStore.getState();
  const onSite = new Map<string, number>();
  const entries: Record<string, number> = {};
  const paths = new Set<string>();
  const count = (where: string, list: readonly Contribution[] | undefined, scale = 1) => {
    for (const c of list ?? []) {
      entries[where] = (entries[where] ?? 0) + 1;
      paths.add(c.path.join('>'));
      if (where !== 'shipped' && where !== 'waste' && where !== 'byproduct')
        onSite.set(c.lotId, (onSite.get(c.lotId) ?? 0) + c.amount * scale);
    }
  };
  flow.machineBuffers.forEach((b) => {
    for (const m of [...b.inputBuffer, ...b.outputBuffer])
      count(b.machineType, m.sourceContributions);
  });
  for (const s of flow.network.segments)
    for (const p of s.inTransit) count('transit', p.sourceContributions);
  for (const b of flow.productionBatches)
    if (b.availableKg > 0)
      count('batch', b.sourceContributions, b.producedKg > 0 ? b.availableKg / b.producedKg : 0);
    else entries.batchShipped = (entries.batchShipped ?? 0) + b.sourceContributions.length;
  count('shipped', flow.shippedSourceContributions);
  count('waste', flow.wasteSourceContributions);
  count('byproduct', flow.byproductSourceContributions);
  const kg = [...onSite.values()];
  const over = (t: number) => kg.filter((v) => v > t).length;
  return (
    `PROBE lots ${flow.sourceLots.size} onSite ${kg.length} >1kg ${over(1)} >15kg ${over(15)} >150kg ${over(150)} >1500kg ${over(1500)} paths ${paths.size}\n` +
    `PROBE entries ${JSON.stringify(entries)}\n` +
    `PROBE lots ${JSON.stringify(
      [...flow.sourceLots.values()].reduce<Record<string, number>>((acc, lot) => {
        const key = `${lot.disposition}${lot.mergedInto ? '-merged' : ''}${lot.receivedAtMinute === undefined ? '-unstamped' : ''}`;
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {})
    )} earlier ${JSON.stringify(
      ['lot-earlier-wheat', 'lot-earlier-corn'].map((id) => [
        id,
        flow.sourceLots.get(id)?.disposition ?? null,
        Math.round(flow.sourceLots.get(id)?.receivedKg ?? 0),
      ])
    )} alerts ${JSON.stringify(
      useQCLabStore
        .getState()
        .qcLab.contaminationAlerts.filter((a) => !a.resolved)
        .map((a) => [a.id, a.sourceLotIds.length, a.batchIds.length])
    )}\n`
  );
}

it.runIf(process.env.SAVE_PROBE)(
  'probes where the genealogy sits',
  () => {
    installHarness();
    try {
      const out: string[] = [];
      play({
        gameDays: Number(process.env.SAVE_PROBE),
        layers: true,
        onSample: (day) => {
          if (Math.abs(day * 3 - Math.round(day * 3)) < 0.05 && Math.round(day * 3) % 3 === 0)
            out.push(`PROBE shift ${Math.round(day * 3)}\n${genealogyProbe()}`);
        },
      });
      process.stderr.write(`\n${out.join('')}`);
    } finally {
      removeHarness();
    }
  },
  3_600_000
);

// The old-record fixture (fixtures/physical-saves/2026-11-13-long-genealogy.json.gz):
// SAVE_FIXTURE=<days> plays the plain plant with the retention rule off and
// prints the record as a build from before the rule wrote it (no compact
// contributions, no receipt minutes), gzipped and in base64.
it.runIf(process.env.SAVE_FIXTURE)(
  'writes a record from before the genealogy rule (fixture)',
  () => {
    installHarness();
    GENEALOGY_RETENTION.enabled = false;
    try {
      play({ gameDays: Number(process.env.SAVE_FIXTURE), layers: false });
      const raw = JSON.stringify(
        capturePhysicalSession(),
        function (this: Record<string, unknown>, key, v: unknown) {
          const original = this[key];
          if (original instanceof Date)
            return { __millosPhysicalType: 'date', value: original.toISOString() };
          if (original instanceof Map) return { __millosPhysicalType: 'map', value: [...original] };
          return v;
        }
      );
      process.stdout.write(`\nFIXTURE ${gzipSync(raw).toString('base64')}\n`);
    } finally {
      GENEALOGY_RETENTION.enabled = true;
      removeHarness();
    }
  },
  3_600_000
);

// The version 2 fixture (fixtures/physical-saves/2026-11-13-compact-v2.json.gz):
// SAVE_FIXTURE_V2=<days> plays the plain plant and prints the record as this
// build writes it (compact contributions), gzipped and in base64.
it.runIf(process.env.SAVE_FIXTURE_V2)(
  'writes a record in the compact form (fixture)',
  () => {
    installHarness();
    try {
      play({ gameDays: Number(process.env.SAVE_FIXTURE_V2), layers: false });
      const raw = encodePhysicalSession(capturePhysicalSession());
      process.stdout.write(`\nFIXTURE ${gzipSync(raw).toString('base64')}\n`);
    } finally {
      removeHarness();
    }
  },
  3_600_000
);

it.runIf(process.env.SAVE_CURVE)(
  'measures the record by game day, with and without the layers',
  () => {
    installHarness();
    try {
      for (const layers of [true, false]) {
        let refusedOn: string | null = null;
        const best = new Map<number, number[]>();
        play({
          gameDays: Number(process.env.SAVE_CURVE),
          layers,
          onSample: (day) => {
            const whole = Math.ceil(day - 1e-9);
            let encoded = 0;
            let nodes = 0;
            try {
              const raw = encodePhysicalSession(capturePhysicalSession());
              encoded = raw.length * 2;
              nodes = nodeCount(raw);
            } catch {
              refusedOn ??= day.toFixed(2);
              return false;
            }
            const previous = best.get(whole);
            if (previous && encoded <= previous[0]) return;
            const cuts = [0.001, 0.01, 0.02].map(cutBytes);
            best.set(whole, [
              encoded,
              nodes,
              compactBytes(),
              ...cuts.flatMap((c) => [c.bytes, c.movedKg, c.dropped]),
            ]);
          },
        });
        process.stderr.write(
          `\nCURVE layers=${layers} write gate refused at game day ${refusedOn ?? 'never'}\n` +
            'CURVE day | bytes | nodes | compact | cut 0.1% bytes/kg moved/dropped | cut 1% | cut 2%\n' +
            [...best.entries()]
              .map(
                ([day, v]) =>
                  `CURVE ${day} | ${v[0]} | ${v[1]} | ${v[2]} | ${v[3]}/${Math.round(v[4])}/${v[5]} | ${v[6]}/${Math.round(v[7])}/${v[8]} | ${v[9]}/${Math.round(v[10])}/${v[11]}`
              )
              .join('\n') +
            '\n'
        );
      }
    } finally {
      removeHarness();
    }
  },
  3_600_000
);
