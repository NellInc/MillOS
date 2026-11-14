/**
 * Achievements in a default session, through the real writers (plan 1.14 and
 * 2.3; report 09 D2, P3). A fresh session boots its line at 0.8 (App.tsx: the
 * boot effect's setProductionSpeed(0.8)). This drives the real central tick,
 * the real material flow and the offline machine model
 * (MachineSimulationController's updateOfflineMachineMetrics, every two real
 * seconds) over the MillScene roster, with the real tracker mounted. The yard
 * docks a truck at once (an upper bound on shipping, as
 * UnifiedGameTick.playableJourney.test.ts does), and the player's presses are
 * the store calls the panels make: Accept next programme
 * (PlayableShift, gated on canAcceptNextProgramme) and a recovery challenge
 * (acknowledge, mitigate, finish recovery).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as ts from 'typescript';
import { renderHook } from '@testing-library/react';
import { SITE_LAYOUT } from '../constants/siteLayout';
import { MachineType, type MachineData } from '../types';
import { centralTick } from '../systems/CentralTickSystem';
import { resetUnifiedTickState, unifiedGameTick } from '../systems/UnifiedGameTick';
import { useAchievementTracker } from '../hooks/useAchievementTracker';
import { FULL_CAPACITY_LINE_RATE_PERCENT, useAchievementsStore } from './achievementsStore';
import { useProductionStore } from './productionStore';
import { useMaterialFlowStore } from './materialFlowStore';
import { useOperationsCampaignStore } from './operationsCampaignStore';
import { useGameSimulationStore } from './gameSimulationStore';
import { useTruckScheduleStore } from './truckScheduleStore';
import { useBreakdownStore } from './breakdownStore';
import { useQCLabStore } from './qcLabStore';
import { useUIStore } from './uiStore';
import { toSimulationMinutes } from '../simulation/simulationClock';
import { plantSecondsForRealSeconds, STANDARD_GAME_SPEED } from '../simulation/pace';
import { deriveOperationsPlay } from '../simulation/operationsPlay';
import { updateOfflineMachineMetrics } from '../components/machines/MachineSimulationController';
import { usePartnerProposalStore } from './partnerProposalStore';
import { answerPartnerProposal } from '../systems/partnerProposalRuntime';

vi.setConfig({ testTimeout: 600_000 });

// The roster is MillScene's own useMemo, executed from source, not a copied table.
const sceneFile = ts.createSourceFile(
  'MillScene.tsx',
  readFileSync('src/components/MillScene.tsx', 'utf8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX
);
const bodies: string[] = [];
const findRoster = (node: ts.Node) => {
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
};
findRoster(sceneFile);
const rosterJS = ts.transpileModule(`function buildRoster() ${bodies[0]}`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const makeRoster = new Function(
  'SITE_LAYOUT',
  'MachineType',
  `${rosterJS}; return buildRoster();`
) as (layout: typeof SITE_LAYOUT, types: typeof MachineType) => MachineData[];

const TICK_SECONDS = centralTick.getStats().tickInterval;
/** MachineSimulationController updates every 30 frames, at least two real seconds apart. */
const METRIC_UPDATE_TICKS = Math.round(2 / TICK_SECONDS);
/** One game minute at the standard pace. */
const TICKS_PER_GAME_MINUTE = Math.round(60 / (STANDARD_GAME_SPEED * TICK_SECONDS));
/** The tracker polls its aggregates every five real seconds. */
const POLL_MS = 5000;

const achievement = (id: string) => useAchievementsStore.getState().getAchievement(id);
/** A store's data, as a checkpoint captures it (workplaceReplayStore capturePlant). */
const data = <T extends object>(state: T): Partial<T> =>
  structuredClone(
    Object.fromEntries(Object.entries(state).filter(([, value]) => typeof value !== 'function'))
  ) as Partial<T>;
const unlockedIds = () =>
  useAchievementsStore
    .getState()
    .achievements.filter((entry) => entry.unlocked)
    .map((entry) => entry.id)
    .sort();

let tickCount = 0;
let receivingDwell = 0;
let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  expect(bodies).toHaveLength(1);
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
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
  });
  // What the boot effect in App.tsx does.
  useProductionStore.getState().setProductionSpeed(0.8);
  useAchievementsStore.getState().resetAchievements();
  useUIStore.setState({ alerts: [] });
  fetchSpy = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(() => Promise.reject(new Error('offline')));
  tickCount = 0;
  receivingDwell = 0;
});
afterEach(() => {
  fetchSpy.mockRestore();
  vi.useRealTimers();
});

/** One central tick; the offline machine model every two real seconds; a poll every five. */
function step() {
  const trucks = useTruckScheduleStore.getState();
  for (const dock of ['receiving', 'shipping'] as const) {
    const schedule = trucks.truckSchedule[dock];
    if (schedule.truckActive && !schedule.truckDocked) {
      trucks.setTruckDocked(dock, true);
      trucks.setTruckTransferReady(dock, true);
    }
  }
  const gameSpeed = useGameSimulationStore.getState().gameSpeed;
  unifiedGameTick({
    deltaSeconds: TICK_SECONDS,
    gameSpeed,
    gameTime: useGameSimulationStore.getState().gameTime,
    elapsedTime: tickCount * TICK_SECONDS,
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
  if (tickCount % METRIC_UPDATE_TICKS === 0)
    updateOfflineMachineMetrics(plantSecondsForRealSeconds(2, gameSpeed));
  vi.advanceTimersByTime(TICK_SECONDS * 1000);
}

/** The whole line's reading as the old rule took it: every machine running, the least load. */
function wholeLineLoad(): number | null {
  const machines = useProductionStore.getState().machines;
  if (machines.length === 0 || !machines.every((m) => m.status === 'running')) return null;
  return Math.floor(Math.min(...machines.map((m) => m.metrics?.load ?? 0)));
}

describe('Full Capacity in a default session', () => {
  it('reads the boot rate, stays locked at 80%, and is earned at 100% with every machine clear', () => {
    const hook = renderHook(() => useAchievementTracker());
    // Four hours at the boot rate. The old rule read the least-loaded unit
    // against 80 (90 before that): at 0.8 no unit's load passes 50 + 0.8 x 30.
    let bestWholeLine = -1;
    for (let i = 0; i < 240 * TICKS_PER_GAME_MINUTE; i++) {
      step();
      if (tickCount % METRIC_UPDATE_TICKS === 0)
        bestWholeLine = Math.max(bestWholeLine, wholeLineLoad() ?? -1);
    }
    process.stdout.write(`FULL_CAPACITY whole-line load best at 0.8: ${bestWholeLine}\n`);
    expect(bestWholeLine).toBeGreaterThan(0);
    expect(bestWholeLine).toBeLessThan(80);
    expect(achievement('full-capacity')?.progress).toBe(80);
    expect(achievement('full-capacity')?.unlocked).toBe(false);

    // Two presses of + (10 % each) put the line at its rated pace. A unit in
    // warning (wear) holds it back until serviced; the tracker test pins that.
    useProductionStore.getState().setProductionSpeed(1);
    for (let i = 0; i < 2 * TICKS_PER_GAME_MINUTE; i++) step();
    const warned = useProductionStore
      .getState()
      .machines.filter((m) => m.status !== 'running')
      .map((m) => m.id);
    if (warned.length > 0) expect(achievement('full-capacity')?.unlocked).toBe(false);

    // Servicing them (Maintain, performMaintenance) clears the warnings.
    for (const id of warned) useProductionStore.getState().performMaintenance(id);
    for (let i = 0; i < 2 * TICKS_PER_GAME_MINUTE; i++) step();
    expect(achievement('full-capacity')?.target).toBe(FULL_CAPACITY_LINE_RATE_PERCENT);
    expect(achievement('full-capacity')?.unlocked).toBe(true);
    hook.unmount();
  });
});

describe("the game's own milestones in a default session", () => {
  it('are earned by their events and never by a restore', () => {
    const hook = renderHook(() => useAchievementTracker());
    const early = {
      operations: data(useOperationsCampaignStore.getState()),
    };
    let programmesAccepted = 0;
    let challenge: 'none' | 'started' | 'done' = 'none';
    let onTimeSeen = false;
    let gradeASeen = false;
    for (let i = 0; i < 1440 * TICKS_PER_GAME_MINUTE; i++) {
      step();
      const campaign = useOperationsCampaignStore.getState();
      // Nothing is earned before its event.
      onTimeSeen ||= campaign.orders.some(
        (order) =>
          order.status === 'fulfilled' &&
          order.completedAtMinute !== null &&
          order.completedAtMinute <= order.dueAtMinute + 1e-6
      );
      gradeASeen ||= campaign.reports.some((report) => report.grade === 'A');
      if (!onTimeSeen) expect(achievement('first-on-time-delivery')?.unlocked).toBe(false);
      if (!gradeASeen) expect(achievement('first-a-shift')?.unlocked).toBe(false);
      if (programmesAccepted === 0) expect(achievement('first-programme')?.unlocked).toBe(false);
      if (challenge !== 'done') expect(achievement('first-challenge')?.unlocked).toBe(false);

      if (deriveOperationsPlay(campaign).canAcceptNextProgramme) {
        expect(campaign.acceptNextProgramme('operator')).toBe(true);
        programmesAccepted++;
        expect(achievement('first-programme')?.unlocked).toBe(true);
      }
      // Since wave 3d the partner offers the next programme early on a card
      // (PartnerProposalCards: answerPartnerProposal as the operator), and
      // takes it itself if the card is left. Only the player's press earns.
      const offer = usePartnerProposalStore
        .getState()
        .proposals.find((p) => p.kind === 'commitment' && p.status === 'open');
      if (offer && programmesAccepted === 0) {
        expect(answerPartnerProposal(offer.id, 'take', 'operator')).toBe(true);
        programmesAccepted++;
        expect(achievement('first-programme')?.unlocked).toBe(true);
      }
      if (challenge === 'none' && programmesAccepted > 0 && !campaign.activeChallenge) {
        if (campaign.startChallenge('power_recovery', 'operator')) {
          challenge = 'started';
          const run = useOperationsCampaignStore.getState().activeChallenge!;
          step();
          // Ten real seconds to notice it, then the player's three presses.
          for (let t = 0; t < Math.ceil(10 / TICK_SECONDS); t++) step();
          const store = useOperationsCampaignStore.getState();
          store.acknowledgeIncident(run.incidentId, 'operator');
          store.mitigateIncident(run.incidentId, 'operator');
          expect(store.finishChallengeRecovery('operator')).toBe(true);
          for (let t = 0; t < 400 && useOperationsCampaignStore.getState().activeChallenge; t++)
            step();
          expect(useOperationsCampaignStore.getState().challengeHistory.at(-1)?.status).toBe(
            'completed'
          );
          challenge = 'done';
          expect(achievement('first-challenge')?.unlocked).toBe(true);
        }
      }
    }
    expect(onTimeSeen).toBe(true);
    expect(gradeASeen).toBe(true);
    expect(challenge).toBe('done');
    const earned = unlockedIds();
    expect(earned).toEqual(
      expect.arrayContaining([
        'first-on-time-delivery',
        'first-a-shift',
        'first-programme',
        'first-challenge',
      ])
    );
    hook.unmount();

    // A session restored with all of this already true awards none of it.
    const late = { operations: data(useOperationsCampaignStore.getState()) };
    useAchievementsStore.getState().resetAchievements();
    useOperationsCampaignStore.setState(early.operations);
    const restored = renderHook(() => useAchievementTracker());
    useOperationsCampaignStore.setState(late.operations);
    for (const id of ['first-on-time-delivery', 'first-a-shift', 'first-programme'])
      expect(achievement(id)?.unlocked).toBe(false);
    // Nor does a checkpoint restored back to the session's start.
    useOperationsCampaignStore.setState(early.operations);
    expect(achievement('first-challenge')?.unlocked).toBe(false);
    expect(unlockedIds().filter((id) => id.startsWith('first-') && id !== 'first-bag')).toEqual([]);
    restored.unmount();
  });
});
