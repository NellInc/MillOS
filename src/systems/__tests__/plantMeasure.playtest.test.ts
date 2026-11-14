/**
 * Plant measurement (review instrument, not a gate; plan item 0.2). Runs the
 * real central tick and the real stores for ten whole shifts at the standard
 * pace, with no browser and no renderer, and writes what the plant made, sold
 * and spent per shift. Inert in the ordinary suite: it runs only when an
 * output path is given in MILLOS_PLANT_MEASURE_OUT.
 *
 * WHAT IS DRIVEN, AND FROM WHERE
 * - The central tick: `unifiedGameTick` every 0.5 s of real time (the
 *   CentralTickSystem interval), at pace 30 (`STANDARD_GAME_SPEED`).
 * - The machine roster: the real `machines` useMemo in MillScene.tsx, executed
 *   from source as UnifiedGameTick.playableJourney.test.ts does.
 * - Line rate 0.8: a fresh session boots at 80% (App.tsx:279-281). The
 *   playableJourney tests pin 1.0; this harness measures what a player gets.
 * - Three steps advance only inside components, so this file makes the same
 *   store calls those components make:
 *   1. Trucks. TruckBay's useFrame (TruckBay.tsx:3222-3240) calls tickTrucks,
 *      which per render frame advances each dock's controller through
 *      advanceTruckClock and stepTruckController (:3286-3332), consumes a
 *      ready arrival (:3337-3339), records a departure (:3340-3342) and writes
 *      docked, transfer-ready and lifecycle from its own predicates on the
 *      interpolated pose (:3344-3357, :3413-3414, :3459-3471). Controllers
 *      start as TruckBay builds them (:3054-3066). The predicates are executed
 *      from TruckBay's source, not copied. Render frames are 1/60 s, 30 per tick.
 *   2. Machine load, temperature, vibration and trips. MachineSimulationController's
 *      useFrame (MachineSimulationController.tsx:211-230) calls
 *      updateOfflineMachineMetrics with the plant seconds accumulated since its
 *      last call, once every two real seconds (every 30 frames, at least 2 s
 *      apart): here every 4 ticks. Load drives wear and site energy demand.
 *   3. Player presses. Accepting a programme mirrors PlayableShift.tsx's debrief
 *      button "Accept next delivery programme" (acceptNextProgramme('operator'),
 *      gated on its canNext, deriveOperationsPlay(...).canAcceptNextProgramme). Repairs mirror the three work-order buttons in
 *      PredictiveMaintenancePanel.tsx:412-470: Dispatch service unit when
 *      missingPartsForOrder is empty (:352-355, :415), Verify repair, Restart
 *      (with its recordOperatorAction). A press happens on the first tick its
 *      button would be enabled.
 *
 * MIRRORED COMPONENT LINES. Each is a store call this file makes because a
 * component, not the tick, makes it in the game. When any of these changes,
 * change the mirror here, or the measurement describes a different game.
 * - App.tsx:279-281: setProductionSpeed(0.8) at boot (the line-rate levers use
 *   the same call, as the slider does at SettingsPanel.tsx:257).
 * - MillScene.tsx: the `machines` useMemo roster (executed from source).
 * - MillScene.tsx:1015 mounts MachineSimulationController; its useFrame,
 *   MachineSimulationController.tsx:211-230, calls updateOfflineMachineMetrics
 *   every 30 frames at least 2 s apart.
 * - TruckBay.tsx:3054-3066 controller construction; :3222-3240 useFrame into
 *   tickTrucks; :3262-3263 shippingServiceComplete; :3286-3332 clock and
 *   controller steps; :3337-3342 consumeTruckArrival / recordTruckDeparture;
 *   :3344-3357 interpolated pose; :3413-3414, :3459-3471 docked, transfer-ready
 *   and lifecycle writes; :3549-3575 shipping before receiving. The three
 *   predicates (isTruckPhysicallyDocked, isTruckTransferReady,
 *   getTruckLifecycle) are executed from TruckBay's source.
 * - PlayableShift.tsx: canNext (deriveOperationsPlay(...).canAcceptNextProgramme)
 *   and the debrief's acceptNextProgramme('operator') button.
 * - PartnerProposalCards.tsx: each card button is answerPartnerProposal(id,
 *   option, 'operator'); each delegation toggle is setDelegation(kind, value).
 *   An arm that answers a kind sets it to "ask" first, as a player must
 *   (a kind's default follows the delegation rule, DELEGATION_EVIDENCE).
 * - PredictiveMaintenancePanel.tsx:352-355 unavailable parts, :412-470 the
 *   Dispatch service unit, Verify repair and Restart buttons (Restart also
 *   records recordOperatorAction).
 * - MachineInspector.tsx handleMaintenance: beginUnitService (systems/unitService.ts)
 *   then recordOperatorAction. The service takes the unit offline for its type's
 *   serviceMinutes on the game clock and one part at the start; the tick brings
 *   it back (stepUnitWork). No wall-clock delay is left to mirror (D7).
 * - The tick, not a component, takes in each grain delivery: the grain is
 *   bought (grainPrice.ts) and the parts the reorder rule has on order arrive
 *   (breakdownStore PARTS_REORDER_RULE). Nothing here mirrors it.
 * - The outage lever takes a unit down as the tick does for a fault that is not
 *   wear: UnifiedGameTick.ts:174-182 (updateMachineStatus critical, then
 *   triggerBreakdown), with the mill wear type from inferBreakdownType (:472-477).
 *
 * ARMS (identical starting state)
 * - a: every programme accepted when offered; every repair pressed when available.
 * - b: nothing accepted; the same repair presses. The guided three-order
 *      programme (18 t) is loaded at reset and needs no acceptance, so a and b
 *      are the same run until it is fulfilled.
 * - c: arm a with no input beyond acceptance (no repairs).
 *
 * LEVERS (MILLOS_PLANT_LEVERS_OUT; each is arm a with one thing changed)
 * - Outage: rm-102 (the only mill feeding sifter-b and packer-1) down for 60,
 *   120 and 240 game minutes, and rm-102 with rm-103 (the only feed of
 *   sifter-c and packer-2) down for 240, from the first tick at least an hour
 *   into shift 2 with an order open and the packers running. The player holds
 *   the service unit back so that hold plus the breakdown's own repair time
 *   equals the outage; the restart then services the mill (performMaintenance
 *   no longer services the mill: it returns just below its breakdown wear
 *   (productionStore repairedWear) with a wear prediction open.
 * - Line rate 0.6, 1.0, 1.2 for the whole run.
 * - Routine service: Maintain on every unit with an open wear prediction.
 *
 * SHIPMENT POLICIES (MILLOS_PLANT_SHIPMENT_OUT; plan item 3.0a)
 * - Arm a with routine service, under the shipment plan's default, 'fill' and
 *   'partial' policies (src/simulation/shipmentPlan.ts). The policy is passed
 *   as unifiedGameTick's second argument; the game's central tick passes
 *   only its context, so it runs DEFAULT_SHIPMENT_POLICY ('fill' since plan
 *   item 3.4; 'default' is the old rule, kept to be measured), and no save
 *   carries it.
 *
 * DISPATCH BY GRADE AND THE BENCH (MILLOS_PLANT_GRADE_OUT; plan items 3.2, 3.4)
 * - Every arm runs the lab's bench (stepLabBench in the tick) unless its
 *   policy sets labBench false, passed as unifiedGameTick's third argument
 *   (measurement only, like the shipment policy). A grade ledger reads every
 *   shipping manifest's orderLoads against the orders' minimums.
 *
 * WHAT THIS HARNESS DOES NOT MODEL
 * - Yard holds that need rendered positions: the dock forklift in its lane
 *   keeping the doors open (TruckBay.tsx:3326-3327), a manually driven
 *   forklift in a truck's path and the village bus on the south road
 *   (:3305-3320). Without them dispatch cadence here is an upper bound.
 * - Safety holds, drills, E-stops, clock holds and pauses (none are raised).
 * - Routine Maintain, Schedule / Complete of a predicted service, Restart
 *   unit, the line-rate slider and the + / - keys: no ARM presses them. The
 *   LEVERS below press Maintain (service) and set the line rate, one each.
 * - QC lab tests: only OverviewPanel.tsx:576-582 starts one, on a press. No
 *   arm presses it, so tests run and failed are 0 by construction.
 * - Incidents and recovery challenges: without a Chronicle charter only a
 *   self-started challenge raises one, and no arm starts one. No charter is signed.
 * - SCADA. Every graphics preset enables it (graphicsStore enableSCADA), and
 *   once its sync pushes values it sets scadaLive (store.ts:901-903), after
 *   which the useFrame above returns early (MachineSimulationController.tsx:213)
 *   and the SCADA adapter writes temperature and vibration; load still follows
 *   storeOwnedLoad. This harness runs the offline model throughout, so wear,
 *   trip and breakdown timing and energy demand may differ from a session
 *   with SCADA live. Shipped kg is bounded by orders and the yard, not by it.
 * - The workplace agreement, AI agents and the on-device AI: all left at
 *   their defaults.
 * - The Chronicle, except in an arm with `charter`: there a sandbox charter is
 *   signed before the first tick (chronicleStore sign) and the crop year is
 *   held at the arm's kind on every tick (test-side: the crop otherwise
 *   changes at shift 9). Sandbox draws no events or forecasts.
 * - Frame-rate variation: render frames are a fixed 1/60 s.
 * - Network: fetch is stubbed to reject, as playableJourney does.
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import * as ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import { MachineType, type MachineData } from '../../types';
import { centralTick } from '../CentralTickSystem';
import { resetUnifiedTickState, unifiedGameTick } from '../UnifiedGameTick';
import { DEFAULT_SHIPMENT_POLICY, type ShipmentPolicy } from '../../simulation/shipmentPlan';
import { minimumServiceWear, useProductionStore } from '../../stores/productionStore';
import { useMaterialFlowStore } from '../../stores/materialFlowStore';
import {
  recordOperatorAction,
  useOperationsCampaignStore,
  type ShiftCampaignReport,
} from '../../stores/operationsCampaignStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useTruckScheduleStore, type TruckLifecyclePhase } from '../../stores/truckScheduleStore';
import { missingPartsForOrder, useBreakdownStore } from '../../stores/breakdownStore';
import { beginUnitService } from '../unitService';
import { usePartnerProposalStore } from '../../stores/partnerProposalStore';
import {
  DELEGATION_EVIDENCE,
  priceOption,
  PROPOSAL_KIND_IDS,
  SERVICE_CARD,
  type CommitmentFacts,
  type PartnerProposal,
  type ProposalKind,
} from '../../simulation/partnerProposals';
import { DEFAULT_CHARTER } from '../../chronicle/charter';
import type { ImprovementId } from '../../chronicle/types';
import { answerPartnerProposal } from '../partnerProposalRuntime';
import { useQCLabStore } from '../../stores/qcLabStore';
import { useWorkplaceStore } from '../../stores/workplaceStore';
import { useChronicleStore } from '../../stores/chronicleStore';
import { useLogisticsLayoutStore } from '../../stores/logisticsLayoutStore';
import { useSafetyStore } from '../../stores/safetyStore';
import { useUIStore } from '../../stores/uiStore';
import { useAnnouncementsStore } from '../../stores/announcementsStore';
import { deriveOperationsPlay } from '../../simulation/operationsPlay';
import { getMachineOperationalState } from '../../simulation/machineMotion';
import { shiftMargin } from '../../simulation/shiftReview';
import { grainValueOnSite } from '../../simulation/grainPrice';
import { toSimulationMinutes } from '../../simulation/simulationClock';
import { plantSecondsForRealSeconds, STANDARD_GAME_SPEED } from '../../simulation/pace';
import { updateOfflineMachineMetrics } from '../../components/machines/MachineSimulationController';
import {
  createTruckController,
  getTruckControllerPose,
  interpolateTruckControllerState,
  stepTruckController,
  type TruckControllerState,
} from '../../components/truckbay/truckController';
import type { TruckAnimState } from '../../components/truckbay/useTruckPhysics';
import {
  advanceTruckClock,
  TRUCK_CONTROLLER_STEP_SECONDS,
} from '../../components/truckbay/truckClock';

vi.setConfig({ testTimeout: 3_600_000 });

const OUT = process.env.MILLOS_PLANT_MEASURE_OUT;
export const LINE_RATE = 0.8;
/** Ten by the plan; MILLOS_PLANT_MEASURE_SHIFTS shortens a smoke run. */
const WHOLE_SHIFTS = Number(process.env.MILLOS_PLANT_MEASURE_SHIFTS ?? 10);
const RENDER_FRAME_SECONDS = 1 / 60;
const TICK_SECONDS = centralTick.getStats().tickInterval;
const FRAMES_PER_TICK = Math.round(TICK_SECONDS / RENDER_FRAME_SECONDS);
/** MachineSimulationController updates every 30 frames, at least 2 s apart. */
const METRIC_UPDATE_TICKS = Math.round(2 / TICK_SECONDS);
/** TruckBay advances shipping, then receiving, each frame (TruckBay.tsx:3549-3575). */
const DOCKS = ['shipping', 'receiving'] as const;
type Dock = (typeof DOCKS)[number];

// ---------------------------------------------------------------------------
// Source-executed pieces of components (the roster and the dock predicates)
// ---------------------------------------------------------------------------

export function extractRoster() {
  const file = ts.createSourceFile(
    'MillScene.tsx',
    readFileSync('src/components/MillScene.tsx', 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const bodies: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(file) === 'machines' &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      node.initializer.expression.getText(file) === 'useMemo'
    ) {
      const factory = node.initializer.arguments[0];
      if (factory && ts.isArrowFunction(factory)) bodies.push(factory.body.getText(file));
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  if (bodies.length !== 1) throw new Error(`MillScene roster: found ${bodies.length} factories`);
  const js = ts.transpileModule(`function buildRoster() ${bodies[0]}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return new Function('SITE_LAYOUT', 'MachineType', `${js}; return buildRoster();`) as (
    layout: typeof SITE_LAYOUT,
    types: typeof MachineType
  ) => MachineData[];
}

export function extractDockPredicates() {
  const file = ts.createSourceFile(
    'TruckBay.tsx',
    readFileSync('src/components/TruckBay.tsx', 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const names = ['isTruckPhysicallyDocked', 'isTruckTransferReady', 'getTruckLifecycle'];
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && names.includes(node.name.getText(file)))
      found.push(`const ${node.getText(file)};`);
    ts.forEachChild(node, visit);
  };
  visit(file);
  if (found.length !== names.length)
    throw new Error(`TruckBay predicates: found ${found.length} of ${names.length}`);
  return new Function(
    ts.transpileModule(found.join('\n'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
    }).outputText + `;return {${names.join(',')}};`
  )() as {
    isTruckPhysicallyDocked: (pose: TruckAnimState) => boolean;
    isTruckTransferReady: (pose: TruckAnimState) => boolean;
    getTruckLifecycle: (pose: TruckAnimState) => TruckLifecyclePhase;
  };
}

// ---------------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------------

type Arm = 'a' | 'b' | 'c';

/** A player policy and the one floor lever it moves. */
export interface Policy {
  label: string;
  accepts: boolean;
  repairs: boolean;
  lineRate: number;
  /** Press Maintain on a unit whenever it carries an open wear prediction. */
  service: boolean;
  /** Units taken down mid-order in shift 2, held down for this many game minutes. */
  outage?: {
    machineIds: string[];
    minutes: number;
    /** Default mid-order (packers running); dispatch-wait: line idle, all owed packed. */
    placement?: 'mid-order' | 'dispatch-wait' | 'at-minute';
    /** With placement 'at-minute': game minutes since the start of the run. */
    atMinute?: number;
  };
  /** Test-side: every order accepted after the guided programme scaled in kg. */
  demandScale?: number;
  /** Test-side: every order accepted after the guided programme, its due window scaled. */
  dueScale?: number;
  /** Test-side: each packer's processingRate (kg per plant s at line rate 1; product: 25). */
  packerRate?: number;
  /**
   * Test-side: the shipment plan's policy (src/simulation/shipmentPlan.ts),
   * passed as unifiedGameTick's second argument. The game passes none and
   * runs the default; no save carries it.
   */
  shipment?: ShipmentPolicy;
  /**
   * How the player meets the partner's proposals (plan item 3.0). Absent, as
   * the arm's buttons did before proposals existed: every `service` proposal
   * answered "run on" unless the arm services, every `programme` proposal
   * "hold" unless it accepts. So every older arm measures the plant it
   * measured. 'leave': no answer, the partner's choice runs at the window's
   * close. 'run-on': `service` answered "run on", programmes left to the partner.
   * 'delegate': both kinds set to "decide and tell me" before the first tick.
   * 'service' / 'quiet': every `service` proposal answered "service now" or
   * "service at the quiet spell" (quiet answered "service now" where the card
   * does not offer it), programmes left to the partner (plan item 3.3).
   */
  proposals?: 'leave' | 'run-on' | 'delegate' | 'service' | 'quiet';
  /** Test-side: false runs the tick without the lab's bench (plan item 3.2). */
  labBench?: boolean;
  /** How the player answers `dispatch` proposals (plan item 3.4); absent, left to the partner. */
  dispatch?: 'hold' | 'send';
  /**
   * How the player answers `commitment` proposals, the next programme offered
   * early (plan item 3.7): 'eager' takes it as soon as offered; 'slack' takes
   * it only when its button prices no lateness (the dock has the room);
   * 'never' waits; 'priced' takes it exactly when the take button's price
   * (projectDock, plan wave 3d) shows no order made late, re-priced with the
   * arm's demand scale on the offer as the arm scales the orders taken.
   * Absent, left to the partner (its default waits).
   */
  commitment?: 'eager' | 'slack' | 'never' | 'priced';
  /** How the player answers ordinary `programme` proposals; absent, as `proposals` says. */
  programmeAnswer?: 'hold';
  /** How the player answers `forfeit` proposals (plan item 3.7); absent, left to the partner. */
  forfeitAnswer?: 'keep';
  /** A sandbox charter signed before the first tick, its crop year held at this kind. */
  charter?: 'wet' | 'sprouted' | 'typical' | 'dry';
  /** Test-side, with `charter`: these Chronicle plans installed before the first tick. */
  chroniclePlans?: string[];
  /**
   * How the player meets `temper` proposals (plan item 7.7); absent, left to
   * the partner. 'partner': its own choice, pressed on the first tick;
   * 'lapse': asked, never answered (the window runs out); 'skilled': dry
   * only while an open order the standard stamp misses still lacks flour
   * that meets it (skilledTemper).
   */
  temperAnswer?: 'standard' | 'dry-first' | 'partner' | 'lapse' | 'skilled';
  /**
   * Test-side, with `charter`: the crop year is held 'typical' for this many
   * whole shifts first, then at the charter's kind, as a chronicle's year
   * turns (plan item 3.1: the silos then hold sound grain to blend with).
   */
  cropTurn?: number;
  /** Measurement only: false runs the tick with the plant-wide crop penalty and no intake card. */
  intake?: boolean;
  /** How the player meets `intake` proposals (plan item 3.1); absent, left to the partner. */
  /** 'partner': the partner's own choice, pressed on the first tick (the window's cost apart). */
  intakeAnswer?: 'accept' | 'blend' | 'refuse' | 'partner';
  /** Measurement only: false raises no plant incident from an ignored wear warning. */
  plantIncidents?: boolean;
  /**
   * Test-side (plan item 3.5): one incident raised by the plant, on the first
   * tick from `fromShift` whole shifts on where `when` holds, answered
   * `answer` (absent, left to the partner).
   */
  incident?: {
    kind: 'delayed_truck' | 'dust_filter_pressure' | 'power_sag';
    when: 'due-soon' | 'slack' | 'worn' | 'fresh';
    fromShift: number;
    answer?: string;
  };
}

const ARM_POLICY: Record<Arm, Policy> = {
  a: { label: 'a', accepts: true, repairs: true, lineRate: LINE_RATE, service: false },
  b: { label: 'b', accepts: false, repairs: true, lineRate: LINE_RATE, service: false },
  c: { label: 'c', accepts: true, repairs: false, lineRate: LINE_RATE, service: false },
};

export interface ShiftRow {
  shift: number;
  shiftKey: string;
  partial: boolean;
  windowMinutes: number;
  gameMinutesTicked: number;
  milledKg: number;
  packedKg: number;
  shippedKg: number;
  dispatchedKgReported: number;
  ordersOnTime: number;
  ordersLate: number;
  ordersOverdueOpen: number;
  /** Orders forfeited in the window at their lateness bound (plan item 3.7). */
  ordersForfeited: number;
  programmesAccepted: number;
  revenue: number;
  energyCost: number;
  automationCost: number;
  wasteCost: number;
  maintenanceCost: number;
  demurrageCost: number;
  latePenalties: number;
  grainCost: number;
  partsCost: number;
  stockHeld: number;
  net: number;
  grade: string | null;
  qualityFailureKg: number;
  minProductQuality: number;
  breakdowns: number;
  minutesAnyMachineDown: number;
  machineDownMinutes: number;
  packerIdleMinutes: number;
  qcTests: number;
  qcFailed: number;
  repairPresses: number;
  breakdownMachines: string;
  servicePresses: number;
  servicePartsUsed: number;
  outageMinutes: number;
  /** Slack: game minutes in each state (see output.definitions). */
  idleNoOrder: number;
  idleOwedPacked: number;
  idleOwedUnpacked: number;
  runMillLimited: number;
  runSifterLimited: number;
  runPackerLimited: number;
  packerUtilisationRunning: number;
  stockWaitingForTruck: number;
  truckLoading: number;
  truckWaitingForMaterial: number;
  shippingDepartures: number;
  receivingDeliveries: number;
  minSiloKg: number;
  grainRefusedKg: number;
  noGrainMinutes: number;
  blockedUnitMinutes: number;
  dockScheduled: number;
  dockApproaching: number;
  dockDocked: number;
  dockServicing: number;
  dockDeparting: number;
}

export interface ArmResult {
  arm: string;
  pace: number;
  lineRate: number;
  rows: ShiftRow[];
  totals: Record<string, number>;
  end: {
    programmesAccepted: number;
    openOrders: number;
    machinesDown: string[];
    wear: Record<string, number>;
    parts: Record<string, number>;
    /** The least stock of each part seen on any tick of the run. */
    minParts: Record<string, number>;
    /** Parts taken from stock over the run (every fall in a part's count). */
    partsUsed: number;
    materialBalanceErrorKg: number;
    materialBalance: Record<string, number>;
    genealogyRecordsOverflowTicks: number;
    fetchCalls: number;
    outageStart: Record<string, unknown> | null;
    orders: {
      tracked: number;
      /** Per order: first tick seen (accepted), due and completion, in game minutes. */
      log: Record<string, { seen: number; due: number; completed: number | null }>;
      shortAtDue: number;
      shortAtDueKg: number;
      overdueOpenAtEnd: number;
      forfeited: number;
      tightestMarginMinutes: number | null;
      tightestOrder: string | null;
      fulfilled: number;
    };
    qualityFirstBelow: Record<string, number | null>;
    /** Packed kg per packer in 10-game-minute bins of campaign time. */
    packedByPacker10: Record<string, number[]>;
  };
}

const round = (value: number, digits = 1) => {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
};

/** Test-side: the charter arm's crop year, held (the Chronicle moves it at shift 9). */
function holdCrop(kind: NonNullable<Policy['charter']>) {
  const crop = useChronicleStore.getState().chronicle.crop;
  if (crop?.kind === kind && !crop.treated) return;
  useChronicleStore.setState((state) => ({
    chronicle: {
      ...state.chronicle,
      crop: { index: state.chronicle.crop?.index ?? 0, kind, treated: false },
    },
  }));
}

function resetPlant(makeRoster: ReturnType<typeof extractRoster>, pace: number, lineRate: number) {
  resetUnifiedTickState();
  useMaterialFlowStore.getState().resetMaterialFlow();
  useOperationsCampaignStore.getState().resetCampaign();
  useGameSimulationStore.getState().resetGameState();
  useTruckScheduleStore.getState().resetTruckSchedule();
  useBreakdownStore.getState().resetBreakdownStore();
  useQCLabStore.getState().resetQCLab();
  useWorkplaceStore.setState(useWorkplaceStore.getInitialState(), true);
  useChronicleStore.setState(useChronicleStore.getInitialState(), true);
  useLogisticsLayoutStore.setState(useLogisticsLayoutStore.getInitialState(), true);
  useSafetyStore.setState(useSafetyStore.getInitialState(), true);
  useUIStore.setState(useUIStore.getInitialState(), true);
  useAnnouncementsStore.setState(useAnnouncementsStore.getInitialState(), true);
  usePartnerProposalStore.getState().reset();
  useProductionStore.setState({
    ...useProductionStore.getInitialState(),
    machines: makeRoster(SITE_LAYOUT, MachineType),
  });
  // The line-rate control's call (App.tsx:280 at boot, SettingsPanel.tsx:257 on the slider).
  useProductionStore.getState().setProductionSpeed(lineRate);
  useGameSimulationStore.getState().setGameSpeed(pace);
}

/**
 * The player's answers to the partner's open proposals (Policy.proposals),
 * through the card's own call. Each open proposal is answered on the first
 * tick it is seen, as a press on the first tick a button is enabled.
 */
function answerProposals(policy: Policy): number {
  if (
    (policy.proposals === 'leave' || policy.proposals === 'delegate') &&
    !policy.commitment &&
    !policy.programmeAnswer &&
    !policy.forfeitAnswer &&
    !policy.dispatch &&
    !policy.intakeAnswer &&
    !policy.temperAnswer &&
    !policy.incident?.answer
  )
    return 0;
  let answers = 0;
  for (const proposal of usePartnerProposalStore.getState().proposals) {
    if (proposal.status !== 'open') continue;
    if (proposal.kind === 'temper') {
      const asked = policy.temperAnswer;
      const answer =
        asked === 'partner'
          ? proposal.defaultOptionId
          : asked === 'skilled'
            ? skilledTemper(proposal as PartnerProposal<'temper'>)
            : asked === 'lapse'
              ? null
              : (asked ?? null);
      if (answer && answerPartnerProposal(proposal.id, answer, 'operator')) answers++;
      continue;
    }
    if (proposal.kind === 'intake' || proposal.kind === 'incident') {
      const asked = proposal.kind === 'intake' ? policy.intakeAnswer : policy.incident?.answer;
      const wanted = asked === 'partner' ? proposal.defaultOptionId : asked;
      // Blend where the card offers it, else accept: the player's two buttons.
      const answer =
        wanted && proposal.options.some((option) => option.id === wanted)
          ? wanted
          : wanted === 'blend'
            ? 'accept'
            : null;
      if (answer && answerPartnerProposal(proposal.id, answer, 'operator')) answers++;
      continue;
    }
    if (proposal.kind === 'commitment') {
      const take = proposal.options.find((option) => option.id === 'take');
      const priced = () => {
        // The button's price on the offer the arm will take: its orders scaled
        // as scaleNewOrders scales them once taken.
        const facts = proposal.facts as CommitmentFacts;
        const scale = policy.demandScale ?? 1;
        const orders = facts.orders.map((order) => ({
          ...order,
          kg: Math.round(order.kg * scale),
        }));
        const price = priceOption('commitment', 'take', {
          ...facts,
          orders,
          committedKg: orders.reduce((sum, order) => sum + order.kg, 0),
        });
        return (price.lateOrders ?? 1) === 0 ? 'take' : 'wait';
      };
      const answer =
        policy.commitment === 'priced'
          ? priced()
          : policy.commitment === 'eager'
            ? 'take'
            : policy.commitment === 'slack'
              ? (take?.price.minutes ?? 0) <= 0.5
                ? 'take'
                : 'wait'
              : policy.commitment === 'never'
                ? 'wait'
                : null;
      if (answer && answerPartnerProposal(proposal.id, answer, 'operator')) answers++;
      continue;
    }
    if (proposal.kind === 'forfeit') {
      if (
        policy.forfeitAnswer &&
        answerPartnerProposal(proposal.id, policy.forfeitAnswer, 'operator')
      )
        answers++;
      continue;
    }
    if (proposal.kind === 'programme' && policy.programmeAnswer) {
      if (answerPartnerProposal(proposal.id, policy.programmeAnswer, 'operator')) answers++;
      continue;
    }
    const leaves = policy.proposals === 'leave' || policy.proposals === 'delegate';
    const answer =
      proposal.kind === 'dispatch'
        ? (policy.dispatch ?? null)
        : leaves
          ? null
          : proposal.kind === 'service'
            ? policy.proposals === 'service'
              ? 'service'
              : policy.proposals === 'quiet'
                ? proposal.options.some((option) => option.id === 'quiet')
                  ? 'quiet'
                  : 'service'
                : policy.service
                  ? null
                  : 'run-on'
            : policy.proposals === undefined && !policy.accepts
              ? 'hold'
              : null;
    if (answer && answerPartnerProposal(proposal.id, answer, 'operator')) answers++;
  }
  return answers;
}

/**
 * Test-side 'skilled' temper (plan item 7.7): read the card's own stamp for
 * the standard temper and the orders and stock, and dry only while an open
 * flour order that stamp misses still lacks released flour that meets it.
 */
function skilledTemper(proposal: PartnerProposal<'temper'>): string {
  const standard = proposal.options.find((option) => option.id === 'standard')?.price.quality ?? 0;
  const batches = useMaterialFlowStore.getState().productionBatches;
  const lacking = useOperationsCampaignStore.getState().orders.some((order) => {
    if (order.status === 'fulfilled' || order.status === 'cancelled') return false;
    const minimum = order.recipe.minimumQuality;
    if (order.recipe.finishedMaterial !== 'flour' || standard >= minimum - 1e-6) return false;
    const meeting = batches
      .filter(
        (batch) =>
          batch.materialType === 'flour' &&
          batch.disposition === 'released' &&
          (batch.qualityScore ?? 0) >= minimum - 1e-6
      )
      .reduce((sum, batch) => sum + Math.max(0, batch.availableKg), 0);
    return order.requiredKg - order.shippedKg > meeting + 1e-6;
  });
  return lacking ? 'dry-first' : 'standard';
}

/** The three work-order buttons (PredictiveMaintenancePanel.tsx:412-470), each pressed once enabled. */
function pressRepairs(holdDispatch: (breakdownId: string) => boolean = () => false): number {
  let presses = 0;
  const store = useBreakdownStore.getState();
  for (const breakdown of store.activeBreakdowns) {
    const live = useBreakdownStore.getState();
    const workOrder = live.workOrders.find((w) => w.id === breakdown.workOrderId);
    if (!workOrder) continue;
    if (
      (workOrder.phase === 'diagnosed' || workOrder.phase === 'awaiting_parts') &&
      !holdDispatch(breakdown.id) &&
      missingPartsForOrder(live.workOrders, live.partsInventory, workOrder).length === 0
    ) {
      if (live.startRepair(breakdown.id).started) presses++;
    } else if (workOrder.phase === 'verification') {
      if (live.verifyRepair(breakdown.id)) presses++;
    } else if (workOrder.phase === 'ready_to_restart') {
      if (live.requestMachineRestart(breakdown.id)) {
        recordOperatorAction({ kind: 'restart', machine: breakdown.machineName });
        presses++;
      }
    }
  }
  return presses;
}

/**
 * The Inspector's Maintain (MachineInspector.tsx handleMaintenance): refused
 * during a stop or an open fault; beginUnitService takes the unit offline for
 * its service minutes and one free part, and closes its predictions. Pressed
 * for every unit with an open wear prediction, on the first tick it is open.
 */
function pressMaintain(): number {
  let started = 0;
  const store = useBreakdownStore.getState();
  for (const alert of store.predictiveAlerts) {
    if (alert.acknowledged) continue;
    if (useBreakdownStore.getState().getBreakdownForMachine(alert.machineId)) continue;
    if (useGameSimulationStore.getState().emergencyActive) continue;
    const machine = useProductionStore.getState().machines.find((m) => m.id === alert.machineId);
    if (!machine || (machine.metrics.wear ?? 0) < minimumServiceWear(machine.type)) continue;
    if (!beginUnitService(alert.machineId).started) continue;
    recordOperatorAction({ kind: 'maintenance', machine: machine.name });
    started++;
  }
  return started;
}

/**
 * Where the slack is, one tick at a time, from what the stores can say.
 * Line idle (zero packer flow): no open order; every owed kg already packed
 * (the order book binds); or owed work still unpacked (filling, changeover,
 * starvation, a unit down). Line running: the stage whose processed kg came
 * nearest its rated capacity (processingRate x plant seconds x effective line
 * speed over running units) is the limiting one. Dock: released stock owed to
 * a customer with no truck at the door; a truck loading; a truck at the door
 * waiting for product.
 */
function classifySlack(
  acc: {
    idleNoOrder: number;
    idleOwedPacked: number;
    idleOwedUnpacked: number;
    runMillLimited: number;
    runSifterLimited: number;
    runPackerLimited: number;
    packerUtilisationSum: number;
    stockWaitingForTruck: number;
    truckLoading: number;
    truckWaitingForMaterial: number;
  },
  flow: ReturnType<typeof useMaterialFlowStore.getState>,
  processed: { roller_mill: number; plansifter: number; packer: number },
  gameMinutes: number,
  pace: number
) {
  const campaign = useOperationsCampaignStore.getState();
  const open = campaign.orders.filter((o) => o.status !== 'fulfilled' && o.status !== 'cancelled');
  const owed = { flour: 0, semolina: 0 };
  for (const o of open) owed[o.recipe.finishedMaterial] += Math.max(0, o.requiredKg - o.shippedKg);
  const packed = { flour: 0, semolina: 0 };
  const released = { flour: 0, semolina: 0 };
  for (const b of flow.productionBatches) {
    if (b.availableKg <= 0 || (b.materialType !== 'flour' && b.materialType !== 'semolina'))
      continue;
    packed[b.materialType] += b.availableKg;
    if (b.disposition === 'released') released[b.materialType] += b.availableKg;
  }
  const unpacked =
    Math.max(0, owed.flour - packed.flour) + Math.max(0, owed.semolina - packed.semolina);
  if (flow.currentPackerFlowRate === 0) {
    if (open.length === 0) acc.idleNoOrder += gameMinutes;
    else if (unpacked <= 1) acc.idleOwedPacked += gameMinutes;
    else acc.idleOwedUnpacked += gameMinutes;
  } else {
    const plantSeconds = plantSecondsForRealSeconds(TICK_SECONDS, pace);
    const speed =
      useProductionStore.getState().productionSpeed * campaign.getProductionMultiplier();
    const machines = useProductionStore.getState().machines;
    const capacity = { roller_mill: 0, plansifter: 0, packer: 0 };
    for (const m of machines) {
      if (m.status !== 'running' && m.status !== 'warning') continue;
      const buffer = flow.machineBuffers.get(m.id);
      if (!buffer || buffer.machineType === 'silo' || !buffer.isProcessing) continue;
      capacity[buffer.machineType] += buffer.processingRate * plantSeconds * speed;
    }
    const utilisation = (k: keyof typeof capacity) =>
      capacity[k] > 0 ? processed[k] / capacity[k] : processed[k] > 0 ? Infinity : 0;
    const u = {
      mills: utilisation('roller_mill'),
      sifters: utilisation('plansifter'),
      packers: utilisation('packer'),
    };
    acc.packerUtilisationSum += Math.min(1, u.packers) * gameMinutes;
    if (u.packers >= u.mills && u.packers >= u.sifters) acc.runPackerLimited += gameMinutes;
    else if (u.mills >= u.sifters) acc.runMillLimited += gameMinutes;
    else acc.runSifterLimited += gameMinutes;
  }
  const shipping = useTruckScheduleStore.getState().truckSchedule.shipping;
  const releasedOwed =
    Math.min(owed.flour, released.flour) + Math.min(owed.semolina, released.semolina);
  if (!shipping.transferReady) {
    if (releasedOwed > 1) acc.stockWaitingForTruck += gameMinutes;
  } else if (campaign.execution.dispatchLoad.status === 'loading') acc.truckLoading += gameMinutes;
  else if (campaign.execution.dispatchLoad.blockCode === 'waitingForMaterial')
    acc.truckWaitingForMaterial += gameMinutes;
}

/** Owed finished kg (open orders) not yet packed, over both products. */
function owedUnpackedKg(flow: ReturnType<typeof useMaterialFlowStore.getState>): number {
  const owed = { flour: 0, semolina: 0 };
  for (const o of useOperationsCampaignStore.getState().orders)
    if (o.status !== 'fulfilled' && o.status !== 'cancelled')
      owed[o.recipe.finishedMaterial] += Math.max(0, o.requiredKg - o.shippedKg);
  const packed = { flour: 0, semolina: 0 };
  for (const b of flow.productionBatches)
    if (b.availableKg > 0 && (b.materialType === 'flour' || b.materialType === 'semolina'))
      packed[b.materialType] += b.availableKg;
  return Math.max(0, owed.flour - packed.flour) + Math.max(0, owed.semolina - packed.semolina);
}

/**
 * Test-side demand and lead-time arms. Orders accepted after the guided
 * programme are scaled as soon as acceptNextProgramme returns, before any tick
 * reads them: requiredKg by `kg`, and the window from acceptance to due by
 * `due`. The execution's remainder follows its lead order. order-001 and the
 * guided programme are never touched. There is no product seam for this; the
 * store accepts the write as state.
 */
function scaleNewOrders(known: Set<string>, kg: number, due: number) {
  const state = useOperationsCampaignStore.getState();
  const fresh = new Set(state.orders.filter((o) => !known.has(o.id)).map((o) => o.id));
  fresh.forEach((id) => known.add(id));
  if ((kg === 1 && due === 1) || fresh.size === 0) return;
  const now = state.elapsedMinutes;
  const orders = state.orders.map((o) =>
    fresh.has(o.id)
      ? {
          ...o,
          requiredKg: Math.round(o.requiredKg * kg),
          dueAtMinute: now + (o.dueAtMinute - now) * due,
        }
      : o
  );
  const lead = orders.find((o) => o.id === state.execution.orderId);
  useOperationsCampaignStore.setState({
    orders,
    execution: { ...state.execution, remainingKg: lead?.requiredKg ?? state.execution.remainingKg },
  });
}

/** Receiving, buffers and the shipping dock's lifecycle, one tick at a time. */
function observeSupplyAndDock(
  acc: {
    minSiloKg: number;
    noGrainMinutes: number;
    blockedUnitMinutes: number;
    dockScheduled: number;
    dockApproaching: number;
    dockDocked: number;
    dockServicing: number;
    dockDeparting: number;
  },
  flow: ReturnType<typeof useMaterialFlowStore.getState>,
  gameMinutes: number
) {
  let silos = 0;
  const bySource = { wheat_grain: 0, corn_grain: 0 } as Record<string, number>;
  flow.machineBuffers.forEach((buffer) => {
    if (buffer.machineType !== 'silo') return;
    for (const m of buffer.outputBuffer) {
      silos += m.amount;
      bySource[m.type] = (bySource[m.type] ?? 0) + m.amount;
    }
  });
  acc.minSiloKg = Math.min(acc.minSiloKg, silos);
  const plan = useOperationsCampaignStore.getState().getActiveProductionPlan();
  if (plan && (bySource[plan.sourceMaterial] ?? 0) < 1) acc.noGrainMinutes += gameMinutes;
  const blocked = useProductionStore
    .getState()
    .machines.some(
      (m) => getMachineOperationalState(m.status, flow.machineBuffers.get(m.id), flow) === 'blocked'
    );
  if (blocked) acc.blockedUnitMinutes += gameMinutes;
  const phase = useTruckScheduleStore.getState().truckSchedule.shipping.lifecyclePhase;
  if (phase === 'scheduled') acc.dockScheduled += gameMinutes;
  else if (phase === 'approaching') acc.dockApproaching += gameMinutes;
  else if (phase === 'docked') acc.dockDocked += gameMinutes;
  else if (phase === 'servicing') acc.dockServicing += gameMinutes;
  else acc.dockDeparting += gameMinutes;
}

/**
 * Test-side situations for a plant incident (plan item 3.5): 'due-soon' an
 * order not yet shipped is due within an hour after the next truck arrives; 'slack' every open
 * order is due 300 or more minutes on; 'worn' the line stamps 97.9 or less
 * with a 95 order open; 'fresh' 99 or more with one open.
 */
function incidentSituation(when: NonNullable<Policy['incident']>['when']): boolean {
  const campaign = useOperationsCampaignStore.getState();
  const open = campaign.orders.filter((o) => o.status !== 'fulfilled' && o.status !== 'cancelled');
  if (open.length === 0) return false;
  const quality = useProductionStore.getState().metrics.quality;
  const strong = open.some((o) => o.recipe.minimumQuality >= 95);
  switch (when) {
    case 'due-soon': {
      // The next truck is not yet on its way, and an order it would carry is
      // due between its arrival and 45 minutes after: delayed, it is late.
      const shipping = useTruckScheduleStore.getState().truckSchedule.shipping;
      if (shipping.truckActive) return false;
      const arrives = shipping.nextArrivalMinutes;
      return open.some(
        (o) =>
          o.requiredKg - o.shippedKg > 1 &&
          o.dueAtMinute - campaign.elapsedMinutes > arrives &&
          o.dueAtMinute - campaign.elapsedMinutes < arrives + 60
      );
    }
    case 'slack':
      return open.every((o) => o.dueAtMinute - campaign.elapsedMinutes >= 300);
    case 'worn':
      return strong && quality <= 97.9;
    case 'fresh':
      return strong && quality >= 99;
  }
}

export function runPolicy(
  policy: Policy,
  pace: number,
  wholeShifts: number,
  makeRoster: ReturnType<typeof extractRoster>,
  predicates: ReturnType<typeof extractDockPredicates>,
  /** Called after every central tick, for ledgers kept by a describe block. */
  onTick?: () => void
): ArmResult {
  resetPlant(makeRoster, pace, policy.lineRate);
  // The card's delegation toggles (PartnerProposalCards setDelegation). An arm
  // that answers a kind asks for it, as a player must; the arms from before
  // the delegation rule were measured with every kind asking, and keep that.
  const proposalStore = usePartnerProposalStore.getState();
  if (policy.proposals === 'delegate')
    for (const kind of PROPOSAL_KIND_IDS) proposalStore.setDelegation(kind, 'decide');
  else if (policy.proposals === undefined)
    for (const kind of PROPOSAL_KIND_IDS) proposalStore.setDelegation(kind, 'ask');
  if (
    policy.proposals === 'run-on' ||
    policy.proposals === 'service' ||
    policy.proposals === 'quiet'
  )
    proposalStore.setDelegation('service', 'ask');
  if (policy.dispatch) proposalStore.setDelegation('dispatch', 'ask');
  if (policy.commitment) proposalStore.setDelegation('commitment', 'ask');
  if (policy.programmeAnswer) proposalStore.setDelegation('programme', 'ask');
  if (policy.forfeitAnswer) proposalStore.setDelegation('forfeit', 'ask');
  if (policy.intakeAnswer) proposalStore.setDelegation('intake', 'ask');
  if (policy.temperAnswer) proposalStore.setDelegation('temper', 'ask');
  if (policy.incident?.answer) proposalStore.setDelegation('incident', 'ask');
  const cropNow = (wholeShiftsDone: number) =>
    policy.charter && policy.cropTurn !== undefined && wholeShiftsDone < policy.cropTurn
      ? ('typical' as const)
      : policy.charter;
  if (policy.charter) {
    useChronicleStore.getState().sign({ ...DEFAULT_CHARTER, mode: 'sandbox' }, 21);
    holdCrop(cropNow(0)!);
    if (policy.chroniclePlans?.length)
      useChronicleStore.setState((state) => ({
        chronicle: {
          ...state.chronicle,
          improvements: policy.chroniclePlans!.map((id) => ({
            id: id as ImprovementId,
            phase: 'installed' as const,
            contractorId: null,
            startedShift: 0,
            completesShift: 0,
            paidFund: 0,
            effectScale: 1,
            initiatedBy: 'player' as const,
          })),
        },
      }));
  }
  let incidentRaisedAt: number | null = null;
  if (policy.packerRate !== undefined) {
    // The buffers are store state; the product sets 25 (materialFlowStore.ts:830).
    const buffers = new Map(useMaterialFlowStore.getState().machineBuffers);
    buffers.forEach((buffer, id) => {
      if (buffer.machineType === 'packer')
        buffers.set(id, { ...buffer, processingRate: policy.packerRate! });
    });
    useMaterialFlowStore.setState({ machineBuffers: buffers });
  }
  let fetchCalls = 0;
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
    fetchCalls++;
    return Promise.reject(new Error('Optional services unavailable for plant measurement'));
  });
  try {
    const { accepts, repairs } = policy;
    let totalMinutes = 0;
    let outageStart: Record<string, unknown> | null = null;
    let outageStartMinute: number | null = null;
    const outageBreakdowns = new Map<string, number>();
    const knownOrderIds = new Set(useOperationsCampaignStore.getState().orders.map((o) => o.id));
    const tracked = new Map<
      string,
      {
        due: number;
        required: number;
        shortfall: number | null;
        completed: number | null;
        seen: number;
        forfeited?: boolean;
      }
    >();
    const qualityFirstBelow: Record<string, number | null> = { '95': null, '92': null, '90': null };
    let lastReceivingReady = false;
    const packedByPacker10: Record<string, number[]> = {};
    const controllers: Record<Dock, TruckControllerState> = {
      receiving: createTruckController('receiving', true, 'entering'),
      shipping: createTruckController('shipping', true, 'entering'),
    };
    const previous: Record<Dock, TruckControllerState> = { ...controllers };
    const accumulators: Record<Dock, number> = { receiving: 0, shipping: 0 };
    let metricPlantSeconds = 0;
    let tickCount = 0;
    let overflowTicks = 0;
    const seenWorkOrders = new Set<string>();
    const rows: ShiftRow[] = [];
    let lastReportId: string | undefined;
    let programmesTotal = 0;
    let programmeCountAtLastRow = useOperationsCampaignStore.getState().programmeCount;
    const minParts: Record<string, number> = { ...useBreakdownStore.getState().partsInventory };
    let lastParts: Record<string, number> = { ...useBreakdownStore.getState().partsInventory };
    let partsUsed = 0;

    const fresh = () => ({
      gameMinutesTicked: 0,
      milledKg: 0,
      packedKg: 0,
      shippedKg: 0,
      breakdowns: 0,
      minutesAnyMachineDown: 0,
      machineDownMinutes: 0,
      packerIdleMinutes: 0,
      qcTests: 0,
      qcFailed: 0,
      minProductQuality: Infinity,
      programmesAccepted: 0,
      repairPresses: 0,
      breakdownMachines: [] as string[],
      servicePresses: 0,
      servicePartsUsed: 0,
      outageMinutes: 0,
      idleNoOrder: 0,
      idleOwedPacked: 0,
      idleOwedUnpacked: 0,
      runMillLimited: 0,
      runSifterLimited: 0,
      runPackerLimited: 0,
      packerUtilisationSum: 0,
      stockWaitingForTruck: 0,
      truckLoading: 0,
      truckWaitingForMaterial: 0,
      shippingDepartures: 0,
      receivingDeliveries: 0,
      minSiloKg: Infinity,
      grainRefusedKg: 0,
      noGrainMinutes: 0,
      blockedUnitMinutes: 0,
      dockScheduled: 0,
      dockApproaching: 0,
      dockDocked: 0,
      dockServicing: 0,
      dockDeparting: 0,
    });
    let acc = fresh();

    const maxTicks = Math.ceil(((4 + 8 * wholeShifts + 1) * 3600) / (pace * TICK_SECONDS));
    for (let tick = 0; tick < maxTicks && rows.length < wholeShifts + 1; tick++) {
      const departuresBefore = {
        shipping: useTruckScheduleStore.getState().truckSchedule.shipping.departureCount,
        receiving: useTruckScheduleStore.getState().truckSchedule.receiving.departureCount,
      };
      // --- Render frames between central ticks: the yard (TruckBay tickTrucks)
      // and the machine-metric controller's accumulation.
      for (let frame = 0; frame < FRAMES_PER_TICK; frame++) {
        const shippingServiceComplete =
          useOperationsCampaignStore.getState().execution.dispatchLoad.status === 'ready';
        const vehicleSpeedMultiplier = useOperationsCampaignStore
          .getState()
          .getIncidentEffect().vehicleSpeedMultiplier;
        for (const dock of DOCKS) {
          const scheduleBefore = useTruckScheduleStore.getState().truckSchedule[dock];
          let controller = controllers[dock];
          let previousController = previous[dock];
          const clock = advanceTruckClock(
            accumulators[dock],
            RENDER_FRAME_SECONDS,
            pace,
            controller.motion.speed
          );
          let departed = false;
          for (let step = 0; step < clock.steps; step++) {
            previousController = controller;
            const result = stepTruckController(controller, {
              deltaSeconds: TRUCK_CONTROLLER_STEP_SECONDS,
              arrivalReady: scheduleBefore.arrivalReady,
              safetyHold: false,
              serviceComplete: dock === 'receiving' || shippingServiceComplete,
              speedMultiplier: vehicleSpeedMultiplier,
            });
            controller = result.state;
            departed ||= result.departedThisStep;
          }
          controllers[dock] = controller;
          previous[dock] = previousController;
          accumulators[dock] = clock.accumulator;
          const schedule = useTruckScheduleStore.getState();
          if (scheduleBefore.arrivalReady && controller.active) schedule.consumeTruckArrival(dock);
          if (departed) {
            const game = useGameSimulationStore.getState();
            schedule.recordTruckDeparture(
              dock,
              toSimulationMinutes({ day: game.gameDay, hour: game.gameTime })
            );
          }
          const pose = getTruckControllerPose(
            interpolateTruckControllerState(previousController, controller, clock.alpha),
            false,
            false
          );
          const docked = predicates.isTruckPhysicallyDocked(pose);
          const transferReady = predicates.isTruckTransferReady(pose);
          const lifecycle = predicates.getTruckLifecycle(pose);
          const live = useTruckScheduleStore.getState();
          if (live.truckSchedule[dock].truckDocked !== docked) live.setTruckDocked(dock, docked);
          if (useTruckScheduleStore.getState().truckSchedule[dock].transferReady !== transferReady)
            live.setTruckTransferReady(dock, transferReady);
          if (useTruckScheduleStore.getState().truckSchedule[dock].lifecyclePhase !== lifecycle)
            live.setTruckLifecycle(dock, lifecycle);
        }
        metricPlantSeconds += plantSecondsForRealSeconds(RENDER_FRAME_SECONDS, pace);
      }
      if ((tick + 1) % METRIC_UPDATE_TICKS === 0) {
        updateOfflineMachineMetrics(metricPlantSeconds);
        metricPlantSeconds = 0;
      }

      // --- The central tick.
      const flowBefore = useMaterialFlowStore.getState();
      const sequenceBefore = flowBefore.processSequence;
      const shippedBefore = flowBefore.shippedKg;
      const qcBefore = useQCLabStore.getState().qcLab.testHistory.length;
      const receivedBefore = flowBefore.receivedKg;
      const receivingReady = useTruckScheduleStore.getState().truckSchedule.receiving.transferReady;
      const deliveryThisTick = receivingReady && !lastReceivingReady;
      lastReceivingReady = receivingReady;
      if (policy.charter) holdCrop(cropNow(Math.max(0, rows.length - 1))!);
      unifiedGameTick(
        {
          deltaSeconds: TICK_SECONDS,
          gameSpeed: pace,
          gameTime: useGameSimulationStore.getState().gameTime,
          elapsedTime: tickCount * TICK_SECONDS,
          tickCount: ++tickCount,
        },
        policy.shipment ?? DEFAULT_SHIPMENT_POLICY,
        {
          ...(policy.labBench === undefined ? {} : { labBench: policy.labBench }),
          ...(policy.intake === undefined ? {} : { intake: policy.intake }),
          ...(policy.plantIncidents === undefined ? {} : { plantIncidents: policy.plantIncidents }),
        }
      );
      onTick?.();
      const gameMinutes = (TICK_SECONDS * pace) / 60;

      // --- What the tick made.
      const flow = useMaterialFlowStore.getState();
      const newRecords = flow.processSequence - sequenceBefore;
      if (newRecords > flow.processGenealogy.length) overflowTicks++;
      const tickRecords = newRecords > 0 ? flow.processGenealogy.slice(-newRecords) : [];
      const processed = { roller_mill: 0, plansifter: 0, packer: 0 };
      for (const record of tickRecords) {
        const type = flow.machineBuffers.get(record.machineId)?.machineType;
        if (type && type !== 'silo') processed[type] += record.inputKg;
        if (type === 'roller_mill') acc.milledKg += record.inputKg;
        if (type === 'packer')
          for (const output of record.outputs)
            if (output.type === 'flour' || output.type === 'semolina') {
              acc.packedKg += output.amount;
              const bin = Math.floor(useOperationsCampaignStore.getState().elapsedMinutes / 10);
              const series = (packedByPacker10[record.machineId] ??= []);
              while (series.length <= bin) series.push(0);
              series[bin] += output.amount;
            }
      }
      acc.shippedKg += flow.shippedKg - shippedBefore;
      for (const [part, count] of Object.entries(useBreakdownStore.getState().partsInventory)) {
        minParts[part] = Math.min(minParts[part] ?? count, count);
        partsUsed += Math.max(0, (lastParts[part] ?? count) - count);
      }
      lastParts = { ...useBreakdownStore.getState().partsInventory };
      acc.minProductQuality = Math.min(
        acc.minProductQuality,
        useProductionStore.getState().metrics.quality
      );
      acc.gameMinutesTicked += gameMinutes;
      totalMinutes += gameMinutes;
      // Departures recorded in this tick's render frames (TruckBay's calls).
      const trucksNow = useTruckScheduleStore.getState().truckSchedule;
      acc.shippingDepartures += trucksNow.shipping.departureCount - departuresBefore.shipping;
      acc.receivingDeliveries += trucksNow.receiving.departureCount - departuresBefore.receiving;
      if (flow.currentPackerFlowRate === 0) acc.packerIdleMinutes += gameMinutes;
      classifySlack(acc, flow, processed, gameMinutes, pace);
      observeSupplyAndDock(acc, flow, gameMinutes);
      // The tick receives GRAIN_DELIVERY_KG on the receiving dock's transfer
      // edge (UnifiedGameTick.ts); what the emptiest silo had no room for is refused.
      if (deliveryThisTick)
        acc.grainRefusedKg += Math.max(0, 15000 - (flow.receivedKg - receivedBefore));
      const quality = useProductionStore.getState().metrics.quality;
      for (const key of Object.keys(qualityFirstBelow))
        if (qualityFirstBelow[key] === null && quality < Number(key))
          qualityFirstBelow[key] = round(totalMinutes, 2);
      {
        const campaign = useOperationsCampaignStore.getState();
        for (const o of campaign.orders) {
          const t = tracked.get(o.id);
          if (!t)
            tracked.set(o.id, {
              due: o.dueAtMinute,
              required: o.requiredKg,
              shortfall: null,
              seen: campaign.elapsedMinutes,
              completed: o.completedAtMinute ?? null,
            });
          else {
            t.due = o.dueAtMinute;
            t.required = o.requiredKg;
            t.completed = o.completedAtMinute ?? null;
            t.forfeited = o.forfeitedAtMinute !== undefined;
          }
          const tr = tracked.get(o.id)!;
          if (tr.shortfall === null && campaign.elapsedMinutes >= tr.due)
            tr.shortfall = Math.max(0, o.requiredKg - o.shippedKg);
        }
      }
      if (
        policy.outage &&
        useProductionStore
          .getState()
          .machines.some((m) => policy.outage!.machineIds.includes(m.id) && m.status === 'critical')
      )
        acc.outageMinutes += gameMinutes;
      const down = useProductionStore
        .getState()
        .machines.filter((m) => m.status === 'critical').length;
      if (down > 0) acc.minutesAnyMachineDown += gameMinutes;
      acc.machineDownMinutes += down * gameMinutes;
      for (const workOrder of useBreakdownStore.getState().workOrders)
        if (!seenWorkOrders.has(workOrder.id)) {
          seenWorkOrders.add(workOrder.id);
          acc.breakdowns++;
          acc.breakdownMachines.push(workOrder.machineId);
        }
      const tests = useQCLabStore.getState().qcLab.testHistory;
      acc.qcTests += Math.max(0, tests.length - qcBefore);
      acc.qcFailed += tests.slice(qcBefore).filter((t) => !t.passed).length;

      // --- A closed shift.
      const report: ShiftCampaignReport | undefined = useOperationsCampaignStore
        .getState()
        .reports.at(-1);
      if (report && report.id !== lastReportId) {
        lastReportId = report.id;
        const outcomes = report.orderOutcomes ?? [];
        const m = report.metrics;
        const windowMinutes = report.endedAtMinute - report.startedAtMinute;
        rows.push({
          shift: rows.length,
          shiftKey: report.shiftKey,
          partial: rows.length === 0,
          windowMinutes: round(windowMinutes, 2),
          gameMinutesTicked: round(acc.gameMinutesTicked, 2),
          milledKg: round(acc.milledKg),
          packedKg: round(acc.packedKg),
          shippedKg: round(acc.shippedKg),
          dispatchedKgReported: round(m.dispatchedKg),
          ordersOnTime: outcomes.filter(
            (o) =>
              o.completedAtMinute !== null &&
              o.completedAtMinute >= report.startedAtMinute &&
              o.completedAtMinute <= o.dueAtMinute
          ).length,
          ordersLate: outcomes.filter(
            (o) =>
              o.completedAtMinute !== null &&
              o.completedAtMinute >= report.startedAtMinute &&
              o.completedAtMinute > o.dueAtMinute
          ).length,
          ordersOverdueOpen: outcomes.filter(
            (o) =>
              o.completedAtMinute === null && !o.forfeit && o.dueAtMinute < report.endedAtMinute
          ).length,
          ordersForfeited: outcomes.filter((o) => !!o.forfeit).length,
          // Every acceptance, the arm's own presses and the partner's alike.
          programmesAccepted:
            useOperationsCampaignStore.getState().programmeCount - programmeCountAtLastRow,
          revenue: round(m.revenue, 2),
          energyCost: round(m.energyCost, 2),
          automationCost: round(m.automationCost, 2),
          wasteCost: round(m.wasteCost, 2),
          maintenanceCost: round(m.maintenanceCost, 2),
          demurrageCost: round(m.demurrageCost, 2),
          latePenalties: round(m.latePenalties, 2),
          grainCost: round(m.grainCost ?? 0, 2),
          partsCost: round(m.partsCost ?? 0, 2),
          stockHeld: round(m.stockHeld ?? 0, 2),
          net: round(shiftMargin(m), 2),
          grade: report.grade,
          qualityFailureKg: round(m.qualityFailureKg),
          minProductQuality: round(acc.minProductQuality),
          breakdowns: acc.breakdowns,
          minutesAnyMachineDown: round(acc.minutesAnyMachineDown, 2),
          machineDownMinutes: round(acc.machineDownMinutes, 2),
          packerIdleMinutes: round(acc.packerIdleMinutes, 2),
          qcTests: acc.qcTests,
          qcFailed: acc.qcFailed,
          repairPresses: acc.repairPresses,
          breakdownMachines: acc.breakdownMachines.join(' '),
          servicePresses: acc.servicePresses,
          servicePartsUsed: acc.servicePartsUsed,
          outageMinutes: round(acc.outageMinutes, 2),
          idleNoOrder: round(acc.idleNoOrder, 2),
          idleOwedPacked: round(acc.idleOwedPacked, 2),
          idleOwedUnpacked: round(acc.idleOwedUnpacked, 2),
          runMillLimited: round(acc.runMillLimited, 2),
          runSifterLimited: round(acc.runSifterLimited, 2),
          runPackerLimited: round(acc.runPackerLimited, 2),
          packerUtilisationRunning: round(
            acc.packerUtilisationSum /
              Math.max(1e-9, acc.runMillLimited + acc.runSifterLimited + acc.runPackerLimited),
            3
          ),
          stockWaitingForTruck: round(acc.stockWaitingForTruck, 2),
          truckLoading: round(acc.truckLoading, 2),
          truckWaitingForMaterial: round(acc.truckWaitingForMaterial, 2),
          shippingDepartures: acc.shippingDepartures,
          receivingDeliveries: acc.receivingDeliveries,
          minSiloKg: round(acc.minSiloKg),
          grainRefusedKg: round(acc.grainRefusedKg),
          noGrainMinutes: round(acc.noGrainMinutes, 2),
          blockedUnitMinutes: round(acc.blockedUnitMinutes, 2),
          dockScheduled: round(acc.dockScheduled, 2),
          dockApproaching: round(acc.dockApproaching, 2),
          dockDocked: round(acc.dockDocked, 2),
          dockServicing: round(acc.dockServicing, 2),
          dockDeparting: round(acc.dockDeparting, 2),
        });
        acc = fresh();
        programmeCountAtLastRow = useOperationsCampaignStore.getState().programmeCount;
      }

      // --- The player, between ticks.
      if (accepts) {
        const campaign = useOperationsCampaignStore.getState();
        if (
          deriveOperationsPlay(campaign).canAcceptNextProgramme &&
          campaign.acceptNextProgramme('operator')
        ) {
          acc.programmesAccepted++;
          programmesTotal++;
          scaleNewOrders(knownOrderIds, policy.demandScale ?? 1, policy.dueScale ?? 1);
        }
      }
      // A unit taken down mid-order in shift 2, the way the tick takes one down
      // for a fault that is not wear (UnifiedGameTick.ts:174-182): status
      // critical, then a breakdown with its work order. 'mechanical' is the type
      // a mill's own wear breakdown takes (inferBreakdownType, :472-477).
      const inWait = policy.outage?.placement === 'dispatch-wait';
      const atMinute = policy.outage?.placement === 'at-minute';
      if (
        policy.outage &&
        outageStartMinute === null &&
        (atMinute
          ? useOperationsCampaignStore.getState().elapsedMinutes >= (policy.outage.atMinute ?? 0)
          : inWait
            ? rows.length >= 2
            : rows.length === 2)
      ) {
        const campaign = useOperationsCampaignStore.getState();
        const active = campaign.orders.find((o) => o.id === campaign.activeOrderId);
        const packing = useMaterialFlowStore.getState().currentPackerFlowRate > 0;
        // Mid-order: an hour into shift 2, the first tick the packers are
        // running with an order open. Dispatch wait: from shift 2, the first
        // tick the line is idle with an order open and every owed kg packed.
        const midOrder =
          !!active &&
          active.status !== 'fulfilled' &&
          (atMinute ||
            (inWait
              ? !packing && owedUnpackedKg(useMaterialFlowStore.getState()) <= 1
              : acc.gameMinutesTicked >= 60 && packing));
        if (midOrder) {
          outageStartMinute = totalMinutes;
          outageStart = {
            gameDay: useGameSimulationStore.getState().gameDay,
            gameTime: round(useGameSimulationStore.getState().gameTime, 3),
            orderId: active.id,
            customer: active.customer,
            shippedKg: active.shippedKg,
            requiredKg: active.requiredKg,
            shift: rows.length,
            placement: policy.outage.placement ?? 'mid-order',
            campaignMinute: campaign.elapsedMinutes,
          };
          for (const id of policy.outage.machineIds) {
            const machine = useProductionStore.getState().machines.find((m) => m.id === id)!;
            useProductionStore.getState().updateMachineStatus(id, 'critical');
            // inferBreakdownType's choice for the unit (UnifiedGameTick.ts:472-477).
            const type =
              machine.type === MachineType.PLANSIFTER
                ? 'vibration_failure'
                : machine.type === MachineType.SILO
                  ? 'electrical'
                  : 'mechanical';
            const breakdown = useBreakdownStore.getState().triggerBreakdown(id, machine.name, type);
            if (breakdown) {
              // An outage shorter than the breakdown's own repair estimate
              // (30-59 min, breakdownStore triggerBreakdown) shortens that
              // estimate, so the service unit dispatched at once restores the
              // unit at the outage length.
              const minutes = policy.outage.minutes;
              if (minutes < breakdown.estimatedRepairTime)
                useBreakdownStore.setState((state) => ({
                  activeBreakdowns: state.activeBreakdowns.map((b) =>
                    b.id === breakdown.id ? { ...b, estimatedRepairTime: minutes } : b
                  ),
                }));
              outageBreakdowns.set(breakdown.id, Math.min(minutes, breakdown.estimatedRepairTime));
            }
          }
        }
      }
      // The player dispatches the service unit late enough that repair ends at
      // the outage length: down = wait + the breakdown's own repair minutes.
      const holdDispatch = (breakdownId: string) =>
        outageBreakdowns.has(breakdownId) &&
        totalMinutes <
          (outageStartMinute ?? 0) +
            policy.outage!.minutes -
            (outageBreakdowns.get(breakdownId) ?? 0);
      if (repairs) acc.repairPresses += pressRepairs(holdDispatch);
      if (policy.service) {
        const pressed = pressMaintain();
        acc.servicePresses += pressed;
        acc.servicePartsUsed += pressed;
      }
      answerProposals(policy);
      if (
        policy.incident &&
        incidentRaisedAt === null &&
        rows.length - 1 >= policy.incident.fromShift
      )
        if (incidentSituation(policy.incident.when)) {
          const raised = useOperationsCampaignStore
            .getState()
            .triggerIncident(policy.incident.kind, { origin: 'plant' });
          if (raised) incidentRaisedAt = useOperationsCampaignStore.getState().elapsedMinutes;
        }
      // Orders the partner accepted (a decided or expired card, or one taken
      // early) are scaled as the arm's own acceptance scales them.
      scaleNewOrders(knownOrderIds, policy.demandScale ?? 1, policy.dueScale ?? 1);
    }

    const whole = rows.filter((r) => !r.partial);
    const sum = (key: keyof ShiftRow) =>
      round(
        whole.reduce((s, r) => s + (typeof r[key] === 'number' ? (r[key] as number) : 0), 0),
        2
      );
    const machines = useProductionStore.getState().machines;
    return {
      arm: policy.label,
      pace,
      lineRate: policy.lineRate,
      rows,
      totals: {
        wholeShifts: whole.length,
        milledKg: sum('milledKg'),
        packedKg: sum('packedKg'),
        shippedKg: sum('shippedKg'),
        dispatchedKgReported: sum('dispatchedKgReported'),
        revenue: sum('revenue'),
        energyCost: sum('energyCost'),
        net: sum('net'),
        ordersOnTime: sum('ordersOnTime'),
        ordersLate: sum('ordersLate'),
        breakdowns: sum('breakdowns'),
        minutesAnyMachineDown: sum('minutesAnyMachineDown'),
        packerIdleMinutes: sum('packerIdleMinutes'),
        ordersOverdueOpen: sum('ordersOverdueOpen'),
        ordersForfeited: sum('ordersForfeited'),
        qualityFailureKg: sum('qualityFailureKg'),
        maintenanceCost: sum('maintenanceCost'),
        latePenalties: sum('latePenalties'),
        automationCost: sum('automationCost'),
        wasteCost: sum('wasteCost'),
        demurrageCost: sum('demurrageCost'),
        grainCost: sum('grainCost'),
        partsCost: sum('partsCost'),
        stockHeld: sum('stockHeld'),
        servicePartsUsed: sum('servicePartsUsed'),
        outageMinutes: sum('outageMinutes'),
        gradeA: whole.filter((r) => r.grade === 'A').length,
        grainRefusedKg: sum('grainRefusedKg'),
        noGrainMinutes: sum('noGrainMinutes'),
        blockedUnitMinutes: sum('blockedUnitMinutes'),
        minSiloKg: Math.min(...whole.map((r) => r.minSiloKg)),
        shippingDepartures: sum('shippingDepartures'),
        idleOwedPacked: sum('idleOwedPacked'),
        lineLimitedOpenOrder: round(
          sum('runMillLimited') +
            sum('runSifterLimited') +
            sum('runPackerLimited') +
            sum('idleOwedUnpacked'),
          2
        ),
        cumulativeMilledKg: round(
          rows.reduce((s, r) => s + r.milledKg, 0),
          1
        ),
        cumulativePackedKg: round(
          rows.reduce((s, r) => s + r.packedKg, 0),
          1
        ),
        cumulativeShippedKg: round(
          rows.reduce((s, r) => s + r.shippedKg, 0),
          1
        ),
      },
      end: {
        // Every acceptance in the run; `programmesTotal` counts the arm's own presses.
        programmesAccepted: Math.max(
          programmesTotal,
          useOperationsCampaignStore.getState().programmeCount
        ),
        openOrders: useOperationsCampaignStore
          .getState()
          .orders.filter((o) => o.status !== 'fulfilled' && o.status !== 'cancelled').length,
        machinesDown: machines.filter((m) => m.status === 'critical').map((m) => m.id),
        wear: Object.fromEntries(machines.map((m) => [m.id, m.metrics.wear ?? 0])),
        parts: { ...useBreakdownStore.getState().partsInventory },
        minParts: { ...minParts },
        partsUsed,
        materialBalanceErrorKg: useMaterialFlowStore.getState().getMaterialBalance().errorKg,
        materialBalance: Object.fromEntries(
          Object.entries(useMaterialFlowStore.getState().getMaterialBalance()).map(([k, v]) => [
            k,
            round(v, 1),
          ])
        ),
        genealogyRecordsOverflowTicks: overflowTicks,
        fetchCalls,
        outageStart,
        orders: (() => {
          const list = [...tracked.entries()].filter(([id]) => id !== undefined);
          const now = useOperationsCampaignStore.getState().elapsedMinutes;
          const margins = list
            .filter(([, t]) => t.completed !== null)
            .map(([id, t]) => ({ id, margin: t.due - (t.completed as number) }))
            .sort((x, y) => x.margin - y.margin);
          return {
            tracked: list.length,
            log: Object.fromEntries(
              list.map(([id, t]) => [id, { seen: t.seen, due: t.due, completed: t.completed }])
            ),
            shortAtDue: list.filter(([, t]) => (t.shortfall ?? 0) > 1e-6).length,
            shortAtDueKg: round(
              list.reduce((sum, [, t]) => sum + (t.shortfall ?? 0), 0),
              1
            ),
            overdueOpenAtEnd: list.filter(
              ([, t]) => t.completed === null && !t.forfeited && t.due < now
            ).length,
            forfeited: list.filter(([, t]) => t.forfeited).length,
            tightestMarginMinutes: margins[0] ? round(margins[0].margin, 2) : null,
            tightestOrder: margins[0]?.id ?? null,
            fulfilled: margins.length,
          };
        })(),
        qualityFirstBelow,
        packedByPacker10: Object.fromEntries(
          Object.entries(packedByPacker10).map(([id, series]) => [
            id,
            series.map((kg) => round(kg, 1)),
          ])
        ),
      },
    };
  } finally {
    fetchSpy.mockRestore();
  }
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function provenance() {
  const run = (cmd: string) => {
    try {
      return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      return null;
    }
  };
  return {
    head: run('git rev-parse HEAD'),
    modifiedFiles: run('git status --porcelain')?.split('\n').filter(Boolean) ?? null,
    measuredAt: new Date().toISOString(),
  };
}

function table(result: ArmResult): string {
  const header =
    'shift key                   min  milled   packed  shipped ontime late  revenue  energy      net grd qfail  bkdn down idle';
  const lines = result.rows.map((r) =>
    [
      String(r.shift).padStart(5),
      r.shiftKey.padEnd(20),
      String(Math.round(r.windowMinutes)).padStart(4),
      String(Math.round(r.milledKg)).padStart(7),
      String(Math.round(r.packedKg)).padStart(8),
      String(Math.round(r.shippedKg)).padStart(8),
      String(r.ordersOnTime).padStart(6),
      String(r.ordersLate).padStart(4),
      String(Math.round(r.revenue)).padStart(8),
      String(Math.round(r.energyCost)).padStart(7),
      String(Math.round(r.net)).padStart(8),
      String(r.grade ?? '-').padStart(3),
      String(Math.round(r.qualityFailureKg)).padStart(5),
      String(r.breakdowns).padStart(5),
      String(Math.round(r.minutesAnyMachineDown)).padStart(4),
      String(Math.round(r.packerIdleMinutes)).padStart(4),
    ].join(' ')
  );
  return [
    `arm ${result.arm} (pace ${result.pace}, line rate ${result.lineRate})`,
    header,
    ...lines,
  ].join('\n');
}

const output: Record<string, unknown> = {
  instrument: 'src/systems/__tests__/plantMeasure.playtest.test.ts',
  pace: STANDARD_GAME_SPEED,
  lineRate: LINE_RATE,
  tickSeconds: TICK_SECONDS,
  renderFrameSeconds: RENDER_FRAME_SECONDS,
  definitions: {
    milledKg: 'grain fed into the roller mills (process-genealogy inputKg on roller_mill units)',
    packedKg: 'flour and semolina leaving the packers (process-genealogy outputs on packer units)',
    shippedKg: 'materialFlowStore.shippedKg delta over the window (departed manifests)',
    dispatchedKgReported: 'the shift report metrics.dispatchedKg (campaign credit)',
    net: 'shiftMargin(report.metrics): revenue less every cost line',
    minutesAnyMachineDown: 'game minutes with at least one machine in critical status',
    machineDownMinutes: 'sum over machines of game minutes in critical status',
    packerIdleMinutes: 'game minutes with zero packer flow',
    qualityFailureKg:
      'the shift report metrics.qualityFailureKg (shipped below the recipe minimum)',
    minProductQuality: 'lowest productionStore metrics.quality stamped on a tick in the window',
    shift0: 'the 10:00-14:00 opening window, partial; the ten whole shifts follow it',
  },
};

function writeOut() {
  if (OUT) writeFileSync(OUT, JSON.stringify(output, null, 1));
}

describe.skipIf(!OUT)('plant measurement at the standard pace', () => {
  // Parsed on first use, so a skipped run reads no source.
  let parsed: [ReturnType<typeof extractRoster>, ReturnType<typeof extractDockPredicates>];
  const sources = () => (parsed ??= [extractRoster(), extractDockPredicates()]);
  const measure = (arm: Arm, pace: number, shifts: number) =>
    runPolicy(ARM_POLICY[arm], pace, shifts, ...sources());
  const arms: Partial<Record<Arm, ArmResult>> = {};

  it('runs arms a, b and c for ten whole shifts and writes what the plant did', () => {
    output.provenance = provenance();
    for (const arm of ['a', 'b', 'c'] as Arm[]) {
      arms[arm] = measure(arm, STANDARD_GAME_SPEED, WHOLE_SHIFTS);
      output.arms = arms;
      writeOut();
      process.stdout.write(`${table(arms[arm]!)}\n`);
    }
    for (const arm of ['a', 'b', 'c'] as Arm[]) {
      const result = arms[arm]!;
      expect(result.rows.filter((r) => !r.partial)).toHaveLength(WHOLE_SHIFTS);
      expect(Math.abs(result.end.materialBalanceErrorKg)).toBeLessThan(0.001);
      expect(result.end.genealogyRecordsOverflowTicks).toBe(0);
      // Cumulatively a mill cannot pack more than it milled or ship more than it packed.
      expect(result.totals.cumulativePackedKg).toBeLessThanOrEqual(
        result.totals.cumulativeMilledKg + 1
      );
      expect(result.totals.cumulativeShippedKg).toBeLessThanOrEqual(
        result.totals.cumulativePackedKg + 1
      );
    }
  });

  it('control: arm a run twice from identical state gives identical rows', () => {
    const again = measure('a', STANDARD_GAME_SPEED, WHOLE_SHIFTS);
    const first = arms.a ?? measure('a', STANDARD_GAME_SPEED, WHOLE_SHIFTS);
    const differing = first.rows.flatMap((row, i) =>
      (Object.keys(row) as (keyof ShiftRow)[])
        .filter((key) => row[key] !== again.rows[i]?.[key])
        .map((key) => ({ shift: i, key, first: row[key], second: again.rows[i]?.[key] }))
    );
    output.controlRepeat = { identical: differing.length === 0, differing };
    writeOut();
    expect(differing).toEqual([]);
    expect(again.rows).toEqual(first.rows);
  });

  it('control: one whole shift at pace 60 matches pace 30 in game-time totals', () => {
    const fast = measure('a', 60, 1);
    const standard = arms.a ?? measure('a', STANDARD_GAME_SPEED, WHOLE_SHIFTS);
    const [s30, f60] = [standard.rows[1], fast.rows[1]];
    const relative = (x: number, y: number) =>
      Math.max(Math.abs(x), Math.abs(y)) < 1e-9 ? 0 : Math.abs(x - y) / Math.max(Math.abs(x), 1);
    const compared = (
      [
        'windowMinutes',
        'gameMinutesTicked',
        'milledKg',
        'packedKg',
        'shippedKg',
        'revenue',
        'energyCost',
        'net',
      ] as const
    ).map((key) => ({
      key,
      pace30: s30[key],
      pace60: f60[key],
      difference: round((f60[key] as number) - (s30[key] as number), 2),
      relative: round(relative(f60[key] as number, s30[key] as number), 4),
    }));
    const cumulative = {
      pace30: {
        milledKg: round(standard.rows[0].milledKg + s30.milledKg),
        packedKg: round(standard.rows[0].packedKg + s30.packedKg),
        shippedKg: round(standard.rows[0].shippedKg + s30.shippedKg),
      },
      pace60: {
        milledKg: round(fast.rows[0].milledKg + f60.milledKg),
        packedKg: round(fast.rows[0].packedKg + f60.packedKg),
        shippedKg: round(fast.rows[0].shippedKg + f60.shippedKg),
      },
    };
    const tolerance = {
      windowMinutes: 'within one pace-60 tick (0.5 game minutes)',
      milledKg: 'within 2%',
      packedKg: 'within 2%',
      shippedKg: 'within one 5,000 kg truckload',
      energyCost: 'within 2%',
    };
    output.controlPace60 = {
      shift: s30.shiftKey,
      compared,
      cumulativeAtShiftEnd: cumulative,
      grades: { pace30: s30.grade, pace60: f60.grade },
      tolerance,
      fastRows: fast.rows,
    };
    writeOut();
    process.stdout.write(
      'pace-60 control (shift 1):\n' +
        compared
          .map((c) => `${c.key.padEnd(18)} 30x ${c.pace30}  60x ${c.pace60}  rel ${c.relative}`)
          .join('\n') +
        '\n'
    );
    expect(Math.abs(f60.windowMinutes - s30.windowMinutes)).toBeLessThanOrEqual(0.5);
    expect(relative(f60.milledKg, s30.milledKg)).toBeLessThanOrEqual(0.02);
    expect(relative(f60.packedKg, s30.packedKg)).toBeLessThanOrEqual(0.02);
    expect(Math.abs(f60.shippedKg - s30.shippedKg)).toBeLessThanOrEqual(5000);
    expect(relative(f60.energyCost, s30.energyCost)).toBeLessThanOrEqual(0.02);
  });
});

// ---------------------------------------------------------------------------
// Levers: which floor levers move shipped kg (MILLOS_PLANT_LEVERS_OUT)
// ---------------------------------------------------------------------------

const LEVERS_OUT = process.env.MILLOS_PLANT_LEVERS_OUT;

describe.skipIf(!LEVERS_OUT)('plant levers on arm a at the standard pace', () => {
  it('measures mill downtime, line rate and routine service against arm a', () => {
    const sources: [ReturnType<typeof extractRoster>, ReturnType<typeof extractDockPredicates>] = [
      extractRoster(),
      extractDockPredicates(),
    ];
    const base = ARM_POLICY.a;
    const policies: Policy[] = [
      { ...base, label: 'baseline a, line 0.8' },
      { ...base, label: 'rm-102 down 60', outage: { machineIds: ['rm-102'], minutes: 60 } },
      { ...base, label: 'rm-102 down 120', outage: { machineIds: ['rm-102'], minutes: 120 } },
      { ...base, label: 'rm-102 down 240', outage: { machineIds: ['rm-102'], minutes: 240 } },
      {
        ...base,
        label: 'rm-102+rm-103 down 240',
        outage: { machineIds: ['rm-102', 'rm-103'], minutes: 240 },
      },
      { ...base, label: 'line 0.6', lineRate: 0.6 },
      { ...base, label: 'line 1.0', lineRate: 1.0 },
      { ...base, label: 'line 1.2', lineRate: 1.2 },
      { ...base, label: 'service on prediction', service: true },
    ];
    const leverOutput: Record<string, unknown> = {
      instrument: output.instrument,
      pace: STANDARD_GAME_SPEED,
      definitions: {
        ...(output.definitions as Record<string, string>),
        idleNoOrder: 'packer flow zero, no open order',
        idleOwedPacked: 'packer flow zero, every owed kg already packed (the order book binds)',
        idleOwedUnpacked:
          'packer flow zero with owed kg unpacked (filling, changeover, starvation, a unit down)',
        runMillLimited:
          'packers running, mills nearest their rated capacity (processed / rate x plant s x speed)',
        runSifterLimited: 'packers running, sifters nearest their rated capacity',
        runPackerLimited: 'packers running, packers nearest their rated capacity',
        packerUtilisationRunning: 'mean packer processed / rated capacity while the line runs',
        stockWaitingForTruck: 'released packed stock owed to a customer, no truck at the door',
        truckLoading: 'shipping truck at the door, loading',
        truckWaitingForMaterial: 'shipping truck at the door, held waiting for product',
        outageMinutes: 'game minutes with a lever outage unit in critical status',
        servicePartsUsed: 'parts consumed by Maintain presses (one each)',
      },
      provenance: provenance(),
      levers: {} as Record<string, unknown>,
    };
    const results: ArmResult[] = [];
    for (const policy of policies) {
      const result = runPolicy(policy, STANDARD_GAME_SPEED, WHOLE_SHIFTS, ...sources);
      results.push(result);
      const baseline = results[0];
      const shiftDelta = result.rows.map((row, i) => ({
        shift: i,
        shippedKg: round(row.shippedKg - (baseline.rows[i]?.shippedKg ?? 0)),
        ordersOnTime: row.ordersOnTime - (baseline.rows[i]?.ordersOnTime ?? 0),
        ordersLate: row.ordersLate - (baseline.rows[i]?.ordersLate ?? 0),
        net: round(row.net - (baseline.rows[i]?.net ?? 0), 2),
        grade: `${baseline.rows[i]?.grade ?? '-'}>${row.grade ?? '-'}`,
      }));
      (leverOutput.levers as Record<string, unknown>)[policy.label] = {
        policy,
        result,
        againstBaseline: {
          shippedIdenticalEveryShift: result.rows.every(
            (row, i) => row.shippedKg === baseline.rows[i]?.shippedKg
          ),
          totalShippedDeltaKg: round(result.totals.shippedKg - baseline.totals.shippedKg),
          totalNetDelta: round(result.totals.net - baseline.totals.net, 2),
          shiftDelta,
        },
      };
      if (LEVERS_OUT) writeFileSync(LEVERS_OUT, JSON.stringify(leverOutput, null, 1));
      process.stdout.write(`${table(result)}\n`);
    }
    for (const result of results) {
      expect(result.rows.filter((r) => !r.partial)).toHaveLength(WHOLE_SHIFTS);
      expect(Math.abs(result.end.materialBalanceErrorKg)).toBeLessThan(0.001);
    }
    // Every outage lever actually took its units down.
    for (const result of results.slice(1, 5))
      expect(result.totals.outageMinutes).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Demand and lead time: what makes the line matter (MILLOS_PLANT_DEMAND_OUT)
// ---------------------------------------------------------------------------

const DEMAND_OUT = process.env.MILLOS_PLANT_DEMAND_OUT;

describe.skipIf(!DEMAND_OUT)('plant demand and lead-time arms at the standard pace', () => {
  it('runs four arms per demand and lead-time setting and checks the four proofs', () => {
    const sources: [ReturnType<typeof extractRoster>, ReturnType<typeof extractDockPredicates>] = [
      extractRoster(),
      extractDockPredicates(),
    ];
    const settings: Array<{
      name: string;
      demandScale: number;
      dueScale: number;
      lineRate?: number;
      packerRate?: number;
    }> = [
      { name: 'demand 1', demandScale: 1, dueScale: 1 },
      { name: 'demand 1.5', demandScale: 1.5, dueScale: 1 },
      { name: 'demand 2', demandScale: 2, dueScale: 1 },
      { name: 'demand 3', demandScale: 3, dueScale: 1 },
      { name: 'due 0.75', demandScale: 1, dueScale: 0.75 },
      { name: 'due 0.5', demandScale: 1, dueScale: 0.5 },
      // Packing capacity below the dock's: the line rate stands in for the
      // packer rate (packers are the rated bottleneck of the line), since
      // every stage scales with it and only packers limit while it runs.
      { name: 'demand 1, line 0.5', demandScale: 1, dueScale: 1, lineRate: 0.5 },
      { name: 'demand 1, line 0.4', demandScale: 1, dueScale: 1, lineRate: 0.4 },
      { name: 'demand 1, line 0.3', demandScale: 1, dueScale: 1, lineRate: 0.3 },
      { name: 'demand 1.5, line 0.5', demandScale: 1.5, dueScale: 1, lineRate: 0.5 },
      // The packers alone at line 0.5's packing capacity, every other stage as shipped.
      { name: 'demand 1, packer 15.625', demandScale: 1, dueScale: 1, packerRate: 15.625 },
    ].filter(
      (setting) =>
        !process.env.MILLOS_PLANT_DEMAND_ONLY ||
        process.env.MILLOS_PLANT_DEMAND_ONLY.split('|').includes(setting.name)
    );
    const demandOutput: Record<string, unknown> = {
      instrument: output.instrument,
      pace: STANDARD_GAME_SPEED,
      lineRate: LINE_RATE,
      provenance: provenance(),
      definitions: {
        armI: 'arm a (every programme accepted, repairs pressed) plus Maintain on every wear prediction',
        armII: 'arm i plus rm-102 down 240 game minutes mid-order in shift 2',
        armIII:
          'arm i plus rm-102 down 60 game minutes from the first dispatch wait in or after shift 2',
        armIV: 'arm a, no routine service',
        shortAtDue: 'orders with kg still unshipped at their due minute',
        tightestMarginMinutes: 'least (due - completed) game minutes over fulfilled orders',
        lineLimitedOpenOrder:
          'runMillLimited + runSifterLimited + runPackerLimited + idleOwedUnpacked (whole shifts)',
        idleOwedPacked: 'line idle with every owed kg packed: the dock or order book binds',
        grainRefusedKg: '15,000 kg per receiving transfer less what the emptiest silo took',
        noGrainMinutes: 'line plan source grain absent from the silos',
        blockedUnitMinutes: 'any mill, sifter or packer judged blocked (machineMotion)',
        qualityFirstBelow:
          'game minutes from the start until product quality first fell below 95/92/90',
      },
      settings: {} as Record<string, unknown>,
    };
    const all: ArmResult[] = [];
    for (const setting of settings) {
      const scaled = {
        demandScale: setting.demandScale,
        dueScale: setting.dueScale,
        lineRate: setting.lineRate ?? LINE_RATE,
        packerRate: setting.packerRate,
      };
      const serviced: Policy = { ...ARM_POLICY.a, ...scaled, service: true, label: '' };
      const policies: Policy[] = [
        { ...serviced, label: `${setting.name} / i serviced` },
        {
          ...serviced,
          label: `${setting.name} / ii mid-order outage 240`,
          outage: { machineIds: ['rm-102'], minutes: 240, placement: 'mid-order' },
        },
        {
          ...serviced,
          label: `${setting.name} / iii in-wait outage 60`,
          outage: { machineIds: ['rm-102'], minutes: 60, placement: 'dispatch-wait' },
        },
        { ...ARM_POLICY.a, ...scaled, label: `${setting.name} / iv no service` },
      ];
      const [i, ii, iii, iv] = policies.map((policy) => {
        const result = runPolicy(policy, STANDARD_GAME_SPEED, WHOLE_SHIFTS, ...sources);
        all.push(result);
        process.stdout.write(`${table(result)}\n`);
        return result;
      });
      const sameShipping = (x: ArmResult, y: ArmResult) =>
        x.rows.every((row, n) => row.shippedKg === y.rows[n]?.shippedKg) &&
        x.totals.ordersOnTime === y.totals.ordersOnTime &&
        x.totals.ordersLate === y.totals.ordersLate &&
        x.end.orders.shortAtDue === y.end.orders.shortAtDue;
      const proofs = {
        p1MidOrderOutageMovesDelivery:
          ii.totals.ordersOnTime !== i.totals.ordersOnTime ||
          ii.totals.shippedKg !== i.totals.shippedKg ||
          ii.end.orders.shortAtDue !== i.end.orders.shortAtDue,
        p2InWaitOutageMovesNothing: iii.end.outageStart !== null && sameShipping(iii, i),
        p3LineLimitsWhileOrderOpen: i.totals.lineLimitedOpenOrder > i.totals.idleOwedPacked,
        p4ServicedDeliversOnTime:
          i.totals.ordersLate === 0 &&
          i.end.orders.overdueOpenAtEnd === 0 &&
          i.end.orders.shortAtDue === 0,
        tightestMarginMinutes: i.end.orders.tightestMarginMinutes,
      };
      const summary = (r: ArmResult) => ({
        shippedKg: r.totals.shippedKg,
        ordersOnTime: r.totals.ordersOnTime,
        ordersLate: r.totals.ordersLate,
        overdueOpenAtEnd: r.end.orders.overdueOpenAtEnd,
        shortAtDue: r.end.orders.shortAtDue,
        shortAtDueKg: r.end.orders.shortAtDueKg,
        tightestMarginMinutes: r.end.orders.tightestMarginMinutes,
        net: r.totals.net,
        grades: r.rows
          .filter((row) => !row.partial)
          .map((row) => row.grade ?? '-')
          .join(''),
        lineLimitedOpenOrder: r.totals.lineLimitedOpenOrder,
        idleOwedPacked: r.totals.idleOwedPacked,
        shippingDepartures: r.totals.shippingDepartures,
        grainRefusedKg: r.totals.grainRefusedKg,
        noGrainMinutes: r.totals.noGrainMinutes,
        blockedUnitMinutes: r.totals.blockedUnitMinutes,
        minSiloKg: r.totals.minSiloKg,
        outageMinutes: r.totals.outageMinutes,
        outageStart: r.end.outageStart,
        qualityFirstBelow: r.end.qualityFirstBelow,
        programmesAccepted: r.end.programmesAccepted,
      });
      (demandOutput.settings as Record<string, unknown>)[setting.name] = {
        setting,
        proofs,
        arms: { i: summary(i), ii: summary(ii), iii: summary(iii), iv: summary(iv) },
        results: { i, ii, iii, iv },
      };
      if (DEMAND_OUT) writeFileSync(DEMAND_OUT, JSON.stringify(demandOutput, null, 1));
      process.stdout.write(`${setting.name} proofs ${JSON.stringify(proofs)}\n`);
    }
    for (const result of all) {
      expect(result.rows.filter((r) => !r.partial)).toHaveLength(WHOLE_SHIFTS);
      expect(Math.abs(result.end.materialBalanceErrorKg)).toBeLessThan(0.001);
    }
  });
});

// ---------------------------------------------------------------------------
// Packer and sifter outages: the units downstream of the buffers
// (MILLOS_PLANT_PACKER_OUT)
// ---------------------------------------------------------------------------

const PACKER_OUT = process.env.MILLOS_PLANT_PACKER_OUT;

describe.skipIf(!PACKER_OUT)('packer and sifter outages on arm i at the standard pace', () => {
  it('takes packers and a sifter down mid-order and in a dispatch wait', () => {
    const sources: [ReturnType<typeof extractRoster>, ReturnType<typeof extractDockPredicates>] = [
      extractRoster(),
      extractDockPredicates(),
    ];
    const armI: Policy = { ...ARM_POLICY.a, service: true, label: 'i serviced' };
    const baseline = runPolicy(armI, STANDARD_GAME_SPEED, WHOLE_SHIFTS, ...sources);
    const tightId = baseline.end.orders.tightestOrder!;
    const tight = baseline.end.orders.log[tightId];
    const tightMid = tight.seen + ((tight.completed ?? tight.due) - tight.seen) / 2;
    // packer-0 takes sifter-a, the line two mills feed (materialFlowStore.ts
    // addSegment rm-101/rm-104 -> sifter-a -> packer-0); every packer packs the
    // active order, its share set by rated capacity.
    const P = 'packer-0';
    const tightOutage = (minutes: number): Policy => ({
      ...armI,
      label: `${P} down ${minutes} mid tightest order`,
      outage: { machineIds: [P], minutes, placement: 'at-minute', atMinute: tightMid },
    });
    const midOutage = (ids: string[], minutes: number): Policy => ({
      ...armI,
      label: `${ids.join('+')} down ${minutes} mid-order shift 2`,
      outage: { machineIds: ids, minutes, placement: 'mid-order' },
    });
    const waitOutage = (minutes: number): Policy => ({
      ...armI,
      label: `${P} down ${minutes} in dispatch wait`,
      outage: { machineIds: [P], minutes, placement: 'dispatch-wait' },
    });
    const policies: Policy[] = [
      ...[30, 60, 120, 240].map(tightOutage),
      ...[30, 60, 120, 240].map((m) => midOutage([P], m)),
      ...[60, 240].map(waitOutage),
      ...[60, 240].map((m) => midOutage(['sifter-a'], m)),
      midOutage([P, 'packer-1'], 120),
    ];
    const window = (series: number[] | undefined, from: number, to: number) => {
      let kg = 0;
      for (let bin = Math.floor(from / 10); bin < Math.ceil(to / 10); bin++)
        kg += series?.[bin] ?? 0;
      return round(kg, 1);
    };
    const arms: Record<string, unknown> = {};
    const out: Record<string, unknown> = {
      instrument: output.instrument,
      pace: STANDARD_GAME_SPEED,
      lineRate: LINE_RATE,
      provenance: provenance(),
      tightestOrder: { id: tightId, ...tight, outageStartMinute: tightMid },
      baseline: {
        totals: baseline.totals,
        orders: baseline.end.orders,
        rows: baseline.rows,
        packedByPacker10: baseline.end.packedByPacker10,
      },
      arms,
    };
    for (const policy of policies) {
      const result = runPolicy(policy, STANDARD_GAME_SPEED, WHOLE_SHIFTS, ...sources);
      const start = Number(
        (result.end.outageStart as { campaignMinute?: number } | null)?.campaignMinute ?? NaN
      );
      const affected =
        policy.outage?.placement === 'at-minute'
          ? tightId
          : String((result.end.outageStart as { orderId?: string } | null)?.orderId ?? '');
      const before = baseline.end.orders.log[affected];
      const after = result.end.orders.log[affected];
      const end = start + (policy.outage?.minutes ?? 0);
      const pickup = Object.fromEntries(
        ['packer-0', 'packer-1', 'packer-2'].map((id) => [
          id,
          {
            baselineKg: window(baseline.end.packedByPacker10[id], start, end),
            outageKg: window(result.end.packedByPacker10[id], start, end),
          },
        ])
      );
      // Programme ids follow the logbook sequence, which a breakdown's log
      // lines advance, so orders are compared by (due, completed), not by id.
      const schedule = (r: ArmResult) =>
        Object.values(r.end.orders.log)
          .map((o) => [round(o.due, 2), o.completed === null ? null : round(o.completed, 2)])
          .sort((x, y) => (x[0] as number) - (y[0] as number));
      const baseSchedule = schedule(baseline);
      const armSchedule = schedule(result);
      const completionDiffs = armSchedule
        .map((o, n) => ({ due: o[0], baseline: baseSchedule[n]?.[1] ?? null, outage: o[1] }))
        .filter((_, n) => JSON.stringify(armSchedule[n]) !== JSON.stringify(baseSchedule[n]));
      const identical =
        result.rows.every((row, n) => row.shippedKg === baseline.rows[n]?.shippedKg) &&
        armSchedule.length === baseSchedule.length &&
        completionDiffs.length === 0;
      arms[policy.label] = {
        policy,
        outageStart: result.end.outageStart,
        outageMinutes: result.totals.outageMinutes,
        shippedKg: result.totals.shippedKg,
        shippedDeltaKg: round(result.totals.shippedKg - baseline.totals.shippedKg),
        ordersOnTime: result.totals.ordersOnTime,
        ordersLate: result.totals.ordersLate,
        shortAtDue: result.end.orders.shortAtDue,
        overdueOpenAtEnd: result.end.orders.overdueOpenAtEnd,
        net: result.totals.net,
        netDelta: round(result.totals.net - baseline.totals.net, 2),
        affectedOrder: affected,
        affectedBaseline: before,
        affectedOutage: after,
        completionDelayMinutes:
          before?.completed != null && after?.completed != null
            ? round(after.completed - before.completed, 2)
            : null,
        marginBaseline: before?.completed != null ? round(before.due - before.completed, 2) : null,
        marginOutage: after?.completed != null ? round(after.due - after.completed, 2) : null,
        tightestMarginRun: result.end.orders.tightestMarginMinutes,
        identicalToBaseline: identical,
        shiftShippedDeltaKg: result.rows.map((row, n) =>
          round(row.shippedKg - (baseline.rows[n]?.shippedKg ?? 0))
        ),
        completionDiffs,
        packedDuringOutage: pickup,
        grades: result.rows
          .filter((r) => !r.partial)
          .map((r) => r.grade ?? '-')
          .join(''),
      };
      if (PACKER_OUT) writeFileSync(PACKER_OUT, JSON.stringify(out, null, 1));
      process.stdout.write(
        `${policy.label}: ${JSON.stringify({
          d: (arms[policy.label] as { completionDelayMinutes: unknown }).completionDelayMinutes,
          late: result.totals.ordersLate,
          ship: result.totals.shippedKg,
          identical,
        })}\n`
      );
      expect(result.totals.outageMinutes).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Shipment policies: what the truck's load decision moves (MILLOS_PLANT_SHIPMENT_OUT)
// ---------------------------------------------------------------------------

const SHIPMENT_OUT = process.env.MILLOS_PLANT_SHIPMENT_OUT;

describe.skipIf(!SHIPMENT_OUT)('shipment policies on arm a with routine service', () => {
  it('runs the default, fill and partial truck policies and compares them', () => {
    const sources: [ReturnType<typeof extractRoster>, ReturnType<typeof extractDockPredicates>] = [
      extractRoster(),
      extractDockPredicates(),
    ];
    const base: Policy = { ...ARM_POLICY.a, service: true };
    const policies: Policy[] = [
      { ...base, label: 'default', shipment: 'default' },
      { ...base, label: 'fill', shipment: 'fill' },
      { ...base, label: 'partial', shipment: 'partial' },
    ];
    const shipmentOutput: Record<string, unknown> = {
      instrument: output.instrument,
      pace: STANDARD_GAME_SPEED,
      definitions: {
        ...(output.definitions as Record<string, string>),
        loadsPerShift: 'shipping departures over the whole shifts, per shift',
        averageLoadKg: 'shipped kg over shipping departures',
      },
      provenance: provenance(),
      policies: {} as Record<string, unknown>,
    };
    const results: ArmResult[] = [];
    for (const policy of policies) {
      const result = runPolicy(policy, STANDARD_GAME_SPEED, WHOLE_SHIFTS, ...sources);
      results.push(result);
      const baseline = results[0];
      const t = result.totals;
      const summary = {
        shippedKg: t.shippedKg,
        ordersOnTime: t.ordersOnTime,
        ordersLate: t.ordersLate,
        ordersOverdueOpen: t.ordersOverdueOpen,
        loadsPerShift: round(t.shippingDepartures / Math.max(1, t.wholeShifts), 2),
        averageLoadKg: round(t.shippedKg / Math.max(1, t.shippingDepartures), 1),
        net: t.net,
        gradeA: t.gradeA,
        grades: result.rows
          .filter((r) => !r.partial)
          .map((r) => r.grade ?? '-')
          .join(''),
      };
      (shipmentOutput.policies as Record<string, unknown>)[policy.label] = {
        policy,
        summary,
        result,
        againstDefault: {
          identicalRows: JSON.stringify(result.rows) === JSON.stringify(baseline.rows),
          shippedDeltaKg: round(t.shippedKg - baseline.totals.shippedKg),
          netDelta: round(t.net - baseline.totals.net, 2),
          shiftShippedDeltaKg: result.rows.map((row, i) =>
            round(row.shippedKg - (baseline.rows[i]?.shippedKg ?? 0))
          ),
        },
      };
      if (SHIPMENT_OUT) writeFileSync(SHIPMENT_OUT, JSON.stringify(shipmentOutput, null, 1));
      process.stdout.write(`${policy.label}: ${JSON.stringify(summary)}\n`);
    }
    for (const result of results) {
      expect(result.rows.filter((r) => !r.partial)).toHaveLength(WHOLE_SHIFTS);
      expect(Math.abs(result.end.materialBalanceErrorKg)).toBeLessThan(0.001);
    }
  });
});

// ---------------------------------------------------------------------------
// The partner's proposals (plan item 3.0; MILLOS_PLANT_PARTNER_OUT)
// ---------------------------------------------------------------------------

const PARTNER_OUT = process.env.MILLOS_PLANT_PARTNER_OUT;

describe.skipIf(!PARTNER_OUT)('the partner proposes, the player decides', () => {
  const partnerOutput: Record<string, unknown> = {
    instrument: output.instrument,
    pace: STANDARD_GAME_SPEED,
    lineRate: LINE_RATE,
    definitions: {
      p: 'no input at all: no button, no answer; every proposal runs the partner’s choice at its window',
      q: 'arm p, but the operator answers every service proposal "run on"',
      delegated:
        'arm p with both kinds on "decide and tell me": the partner decides as each is raised',
      proposals: 'every proposal of the run, its last version (the store keeps a short tail)',
    },
    arms: {} as Record<string, unknown>,
  };
  let parsed: [ReturnType<typeof extractRoster>, ReturnType<typeof extractDockPredicates>];
  const sources = () => (parsed ??= [extractRoster(), extractDockPredicates()]);
  const noInput: Policy = {
    label: 'p',
    accepts: false,
    repairs: false,
    lineRate: LINE_RATE,
    service: false,
    proposals: 'leave',
  };
  // Every proposal of a run, latest version by id: the store keeps a short tail.
  const ledger = new Map<string, PartnerProposal>();
  const run = (policy: Policy) => {
    ledger.clear();
    const stop = usePartnerProposalStore.subscribe((state) => {
      for (const proposal of state.proposals) ledger.set(proposal.id, proposal);
    });
    try {
      return runPolicy(policy, STANDARD_GAME_SPEED, WHOLE_SHIFTS, ...sources());
    } finally {
      stop();
    }
  };
  const record = (label: string, result: ArmResult) => {
    const proposals = [...ledger.values()];
    const resolved = proposals.filter((p) => p.status === 'resolved');
    const summary = {
      shippedKg: result.totals.shippedKg,
      ordersOnTime: result.totals.ordersOnTime,
      ordersLate: result.totals.ordersLate,
      shortAtDue: result.end.orders.shortAtDue,
      overdueOpenAtEnd: result.end.orders.overdueOpenAtEnd,
      grades: result.rows
        .filter((row) => !row.partial)
        .map((row) => row.grade ?? '-')
        .join(''),
      programmesAccepted: result.end.programmesAccepted,
      breakdowns: result.totals.breakdowns,
      machinesDownAtEnd: result.end.machinesDown,
      // Proposal record lines that reached a closed shift review: under
      // "Your decisions" (operator, agent) or the plant's narration (partner),
      // which keeps only its last eight lines.
      reviewLines: (() => {
        const reports = useOperationsCampaignStore.getState().reports;
        const isRecord = (line: string) => / chose .+ would have cost /.test(line);
        return {
          reports: reports.length,
          choices: reports.reduce(
            (n, r) => n + (r.choices ?? []).filter((c) => isRecord(c.message)).length,
            0
          ),
          narration: reports.reduce(
            (n, r) => n + (r.narration ?? []).filter((line) => isRecord(line)).length,
            0
          ),
          // The report's own field (plan 3.0 loose end, closed in 3.4).
          reportField: reports.reduce((n, r) => n + (r.proposals?.length ?? 0), 0),
          compared: [...ledger.values()].filter((p) => p.comparison).length,
          written: useOperationsCampaignStore
            .getState()
            .logbook.filter((entry) => entry.relatedId?.startsWith('proposal-')).length,
        };
      })(),
      proposals: {
        raised: proposals.length,
        byKind: Object.fromEntries(
          ['programme', 'service'].map((kind) => [
            kind,
            proposals.filter((p) => p.kind === kind).length,
          ])
        ),
        decidedBy: Object.fromEntries(
          ['partner', 'operator', 'agent'].map((by) => [
            by,
            resolved.filter((p) => p.resolution?.decidedBy === by).length,
          ])
        ),
        notRun: resolved.filter((p) => p.resolution && !p.resolution.ran).length,
        withdrawn: proposals.filter((p) => p.status === 'withdrawn').length,
        compared: resolved.filter((p) => p.comparison).length,
        otherWasBetter: resolved.filter(
          (p) => p.comparison?.bestOptionId && p.comparison.bestOptionId !== p.resolution?.optionId
        ).length,
      },
    };
    (partnerOutput.arms as Record<string, unknown>)[label] = {
      summary,
      result,
      proposals,
      recordLines: useOperationsCampaignStore
        .getState()
        .logbook.filter((entry) => entry.relatedId?.startsWith('proposal-'))
        .map((entry) => ({
          actor: entry.actor,
          minute: entry.simulationMinute,
          line: entry.message,
        })),
    };
    writeFileSync(PARTNER_OUT!, JSON.stringify(partnerOutput, null, 1));
    process.stdout.write(`${table(result)}\n${label} ${JSON.stringify(summary)}\n`);
    return summary;
  };

  it('arm p: with no input at all, every order ships on time in all ten shifts, graded A', () => {
    partnerOutput.provenance = provenance();
    const result = run(noInput);
    const summary = record('p', result);
    const whole = result.rows.filter((row) => !row.partial);
    expect(whole).toHaveLength(WHOLE_SHIFTS);
    expect(Math.abs(result.end.materialBalanceErrorKg)).toBeLessThan(0.001);
    expect(result.totals.ordersLate).toBe(0);
    expect(result.end.orders.shortAtDue).toBe(0);
    expect(result.end.orders.overdueOpenAtEnd).toBe(0);
    for (const row of whole) {
      expect(row.ordersOnTime, `shift ${row.shift}`).toBeGreaterThan(0);
      expect(row.grade, `shift ${row.shift}`).toBe('A');
    }
    expect(summary.proposals.decidedBy.partner).toBeGreaterThan(0);
    expect(summary.proposals.decidedBy.operator).toBe(0);
    // The ledger balances over the run (review 2): its lines are the cash
    // the plant took and paid out, the opening stock bought on day one
    // included, plus stock held; and stock held is the grain cost of what is
    // on site, valued as shipments take it out (grainValueOnSite). Before
    // the opening stock was booked, stock held ran short of it by its value.
    const e = useOperationsCampaignStore.getState().economics;
    const cash =
      e.revenue -
      e.energyCost -
      e.automationCost -
      e.wasteCost -
      e.maintenanceCost -
      e.demurrageCost -
      e.latePenalties -
      (e.grainCost ?? 0) -
      (e.partsCost ?? 0);
    const onSite = grainValueOnSite(useMaterialFlowStore.getState());
    const ledger = {
      cash: round(cash, 2),
      stockHeld: round(e.stockHeld ?? 0, 2),
      onSite,
      net: round(shiftMargin(e), 2),
      grainCost: round(e.grainCost ?? 0, 2),
    };
    process.stdout.write(`LEDGER ${JSON.stringify(ledger)}\n`);
    (partnerOutput as Record<string, unknown>).ledger = ledger;
    writeFileSync(PARTNER_OUT!, JSON.stringify(partnerOutput, null, 1));
    expect(ledger.net).toBeCloseTo(cash + (e.stockHeld ?? 0), 1);
    expect(e.stockHeld ?? 0).toBeGreaterThanOrEqual(0);
    expect(Math.abs((e.stockHeld ?? 0) - onSite)).toBeLessThan(0.01 * (e.grainCost ?? 0));
  });

  it('arm q: answering every service "run on" costs grade and net; its records state the cost and claim no verdict', () => {
    const result = run({ ...noInput, label: 'q', proposals: 'run-on' });
    const summary = record('q', result);
    const whole = result.rows.filter((row) => !row.partial);
    expect(whole).toHaveLength(WHOLE_SHIFTS);
    // Re-pinned for plan item 3.4: off-spec flour no longer ships to the 95
    // order, so no shift is F for a failing kilogram; what now costs the
    // grade is the 95 order left late while the line cannot make it.
    expect(whole.slice(-2).every((row) => row.grade !== 'A')).toBe(true);
    expect(whole.every((row) => row.qualityFailureKg === 0)).toBe(true);
    // Late, still overdue, or forfeited at its lateness bound (plan item 3.7).
    expect(
      result.totals.ordersLate + result.end.orders.overdueOpenAtEnd + result.end.orders.forfeited
    ).toBeGreaterThan(0);
    const runOn = [...ledger.values()].filter(
      (p) => p.kind === 'service' && p.resolution?.optionId === 'run-on' && p.comparison
    );
    expect(runOn.length).toBeGreaterThan(0);
    // Running on always costs the service's part on top of the failure's, so
    // the record says what each answer cost and names no better one (review
    // 2, finding 5); the arm's own totals against arm p are the measure.
    for (const proposal of runOn) {
      expect(proposal.comparison?.bestOptionId).toBeNull();
      const priced = (id: string) =>
        proposal.comparison!.prices.find((option) => option.id === id)!.price;
      expect(priced('run-on').currency).toBeGreaterThan(priced('service').currency);
    }
    const p = (partnerOutput.arms as Record<string, { summary: { shippedKg: number } }>).p;
    if (p) expect(result.totals.shippedKg).toBeLessThan(p.summary.shippedKg);
    // Judged by the partner's own rule (nothing late, then net), no other
    // record of this arm finds the other answer better (review 2, finding 1:
    // 15 early-programme records did, on net alone).
    expect(summary.proposals.otherWasBetter).toBe(0);
  });

  it('delegated: both kinds on "decide and tell me" deliver as arm p does', () => {
    const result = run({ ...noInput, label: 'delegated', proposals: 'delegate' });
    record('delegated', result);
    expect(result.totals.ordersLate).toBe(0);
    expect(result.rows.filter((row) => !row.partial).every((row) => row.grade === 'A')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Dispatch by grade and the bench (plan items 3.2, 3.4; MILLOS_PLANT_GRADE_OUT)
// ---------------------------------------------------------------------------

const GRADE_OUT = process.env.MILLOS_PLANT_GRADE_OUT;

/**
 * What left the dock for which order, read against each order's minimum: every
 * shipping manifest's orderLoads at the stamp its batch was packed at, and at
 * the end every order's credited batches. Batch stamps are remembered as seen,
 * since the shipped window drops old batches.
 */
function gradeLedger() {
  const stamps = new Map<string, number | undefined>();
  const minimum = new Map<string, number>();
  const seen = new Set<string>();
  const ledger = {
    manifests: 0,
    ungradedManifests: 0,
    /** kg loaded for an order below that order's minimum, by minimum. */
    underMinimumKg: {} as Record<string, number>,
    /** kg of flour stamped 92 to 95 loaded for a 92 order. */
    offSpecToCommunityKg: 0,
    /** kg of flour stamped 92 to 95 loaded for a 95 order. */
    offSpecToStrongWhiteKg: 0,
    /** Orders credited with a batch under their minimum (read at the end). */
    paidUnderMinimum: 0,
    /** Least stamp of a batch packed in the run. */
    lowestStamp: Infinity,
    benchTests: 0,
    benchMisses: 0,
    /**
     * Ticks on which the dispatch question's conditions held, one by one: a
     * truck docked for the active order's product; that order short of
     * tested in-spec flour; tested flour under its minimum that another open
     * order takes (plan item 3.4).
     */
    dispatchTicks: { docked: 0, activeShort: 0, offSpecTaken: 0 },
  };
  const observe = () => {
    {
      const campaign = useOperationsCampaignStore.getState();
      const load = campaign.execution.dispatchLoad;
      const active = campaign.orders.find((o) => o.id === campaign.activeOrderId);
      if (
        useTruckScheduleStore.getState().truckSchedule.shipping.transferReady &&
        active &&
        load.materialType === active.recipe.finishedMaterial
      ) {
        ledger.dispatchTicks.docked++;
        const batches = useMaterialFlowStore.getState().productionBatches;
        const tested = batches.filter(
          (b) =>
            b.materialType === active.recipe.finishedMaterial &&
            b.disposition === 'released' &&
            !b.awaitingTest &&
            b.availableKg > 0
        );
        const inSpec = tested
          .filter((b) => (b.qualityScore ?? 100) >= active.recipe.minimumQuality - 1e-6)
          .reduce((sum, b) => sum + b.availableKg, 0);
        if (inSpec < active.requiredKg - active.shippedKg - 1e-6) {
          ledger.dispatchTicks.activeShort++;
          const lower = campaign.orders.filter(
            (o) =>
              o.status !== 'fulfilled' &&
              o.status !== 'cancelled' &&
              o.id !== active.id &&
              o.recipe.finishedMaterial === active.recipe.finishedMaterial &&
              o.recipe.minimumQuality < active.recipe.minimumQuality
          );
          if (
            tested.some(
              (b) =>
                (b.qualityScore ?? 100) < active.recipe.minimumQuality - 1e-6 &&
                lower.some((o) => (b.qualityScore ?? 100) >= o.recipe.minimumQuality - 1e-6)
            )
          )
            ledger.dispatchTicks.offSpecTaken++;
        }
      }
    }
    for (const batch of useMaterialFlowStore.getState().productionBatches) {
      stamps.set(batch.id, batch.qualityScore);
      if (batch.qualityScore !== undefined)
        ledger.lowestStamp = Math.min(ledger.lowestStamp, batch.qualityScore);
    }
    for (const order of useOperationsCampaignStore.getState().orders)
      minimum.set(order.id, order.recipe.minimumQuality);
    for (const manifest of useMaterialFlowStore.getState().manifests) {
      if (manifest.kind !== 'shipping' || seen.has(manifest.id)) continue;
      seen.add(manifest.id);
      ledger.manifests++;
      if (!manifest.orderLoads) {
        ledger.ungradedManifests++;
        continue;
      }
      for (const load of manifest.orderLoads) {
        const stamp = stamps.get(load.batchId);
        const min = minimum.get(load.orderId);
        if (stamp === undefined || min === undefined) continue;
        if (stamp < min - 1e-6)
          ledger.underMinimumKg[String(min)] = (ledger.underMinimumKg[String(min)] ?? 0) + load.kg;
        // The plan's own tolerance: a stamp within 1e-6 of a minimum meets it.
        if (stamp >= 92 - 1e-6 && stamp < 95 - 1e-6) {
          if (min === 92) ledger.offSpecToCommunityKg += load.kg;
          if (min === 95) ledger.offSpecToStrongWhiteKg += load.kg;
        }
      }
    }
  };
  const close = () => {
    for (const order of useOperationsCampaignStore.getState().orders)
      for (const batchId of order.batchIds) {
        const stamp = stamps.get(batchId);
        if (stamp !== undefined && stamp < order.recipe.minimumQuality - 1e-6)
          ledger.paidUnderMinimum++;
      }
    const tests = useQCLabStore.getState().qcLab.testHistory;
    ledger.benchTests = tests.filter((t) => t.controlSource === 'Autonomous QC controller').length;
    ledger.benchMisses = tests.filter(
      (t) => t.controlSource === 'Autonomous QC controller' && !t.passed
    ).length;
    return {
      ...ledger,
      lowestStamp: Number.isFinite(ledger.lowestStamp) ? round(ledger.lowestStamp, 2) : null,
      offSpecToCommunityKg: round(ledger.offSpecToCommunityKg),
      offSpecToStrongWhiteKg: round(ledger.offSpecToStrongWhiteKg),
    };
  };
  return { observe, close };
}

describe.skipIf(!GRADE_OUT)('dispatch by grade and the bench', () => {
  const gradeOutput: Record<string, unknown> = {
    instrument: output.instrument,
    pace: STANDARD_GAME_SPEED,
    lineRate: LINE_RATE,
    definitions: {
      p: 'no input at all, with the bench (the game as shipped)',
      p0: 'arm p without the bench: fill and dispatch by grade only',
      q: 'arm p, every service proposal answered "run on"',
      c: 'every programme accepted, no repairs and no service (ARM_POLICY.c)',
      underMinimumKg: "kg loaded for an order below that order's minimum, by minimum",
      paidUnderMinimum: 'orders credited with a batch below their minimum (end of run)',
    },
    arms: {} as Record<string, unknown>,
  };
  let parsed: [ReturnType<typeof extractRoster>, ReturnType<typeof extractDockPredicates>];
  const sources = () => (parsed ??= [extractRoster(), extractDockPredicates()]);
  const noInput: Policy = {
    label: 'p',
    accepts: false,
    repairs: false,
    lineRate: LINE_RATE,
    service: false,
    proposals: 'leave',
  };
  const run = (policy: Policy) => {
    const ledger = gradeLedger();
    // Every dispatch proposal of the run, last version by id (the store keeps a tail).
    const dispatches = new Map<string, PartnerProposal>();
    const stop = usePartnerProposalStore.subscribe((state) => {
      for (const proposal of state.proposals)
        if (proposal.kind === 'dispatch') dispatches.set(proposal.id, proposal);
    });
    let result: ArmResult;
    try {
      result = runPolicy(policy, STANDARD_GAME_SPEED, WHOLE_SHIFTS, ...sources(), ledger.observe);
    } finally {
      stop();
    }
    const grade = ledger.close();
    const proposals = [...dispatches.values()];
    const compared = proposals.filter((p) => p.comparison);
    const dispatch = {
      raised: proposals.length,
      withdrawn: proposals.filter((p) => p.status === 'withdrawn').length,
      chosen: {
        send: proposals.filter((p) => p.resolution?.optionId === 'send').length,
        hold: proposals.filter((p) => p.resolution?.optionId === 'hold').length,
      },
      compared: compared.length,
      bestWasHold: compared.filter((p) => p.comparison?.bestOptionId === 'hold').length,
      bestWasSend: compared.filter((p) => p.comparison?.bestOptionId === 'send').length,
      tied: compared.filter((p) => p.comparison?.bestOptionId === null).length,
      otherWasBetter: compared.filter(
        (p) => p.comparison?.bestOptionId && p.comparison.bestOptionId !== p.resolution?.optionId
      ).length,
    };
    const summary = {
      shippedKg: result.totals.shippedKg,
      ordersOnTime: result.totals.ordersOnTime,
      ordersLate: result.totals.ordersLate,
      shortAtDue: result.end.orders.shortAtDue,
      overdueOpenAtEnd: result.end.orders.overdueOpenAtEnd,
      net: result.totals.net,
      grades: result.rows
        .filter((row) => !row.partial)
        .map((row) => row.grade ?? '-')
        .join(''),
      qualityFailureKg: result.totals.qualityFailureKg,
      latePenalties: result.totals.latePenalties,
      grade,
      dispatch,
    };
    (gradeOutput.arms as Record<string, unknown>)[policy.label] = { policy, summary, result };
    gradeOutput.provenance ??= provenance();
    writeFileSync(GRADE_OUT!, JSON.stringify(gradeOutput, null, 1));
    process.stdout.write(`${table(result)}\n${policy.label} ${JSON.stringify(summary)}\n`);
    return { result, summary };
  };

  it('arm p: with no input and the bench, every order ships on time, graded A throughout', () => {
    const { result, summary } = run(noInput);
    const whole = result.rows.filter((row) => !row.partial);
    expect(whole).toHaveLength(WHOLE_SHIFTS);
    expect(Math.abs(result.end.materialBalanceErrorKg)).toBeLessThan(0.001);
    expect(result.totals.ordersLate).toBe(0);
    expect(result.end.orders.shortAtDue).toBe(0);
    for (const row of whole) expect(row.grade, `shift ${row.shift}`).toBe('A');
    expect(summary.grade.paidUnderMinimum).toBe(0);
    expect(summary.grade.benchTests).toBeGreaterThan(0);
  });

  it("arm p0: the same without the bench (the bench's own effect is p against p0)", () => {
    const { result } = run({ ...noInput, label: 'p0', labBench: false });
    expect(result.totals.ordersLate).toBe(0);
  });

  it('arm q: run on, and no failing kilogram ships to the 95 order; the 92 order takes it', () => {
    const { summary } = run({ ...noInput, label: 'q', proposals: 'run-on' });
    expect(summary.grade.underMinimumKg).toEqual({});
    expect(summary.grade.offSpecToStrongWhiteKg).toBe(0);
    expect(summary.grade.paidUnderMinimum).toBe(0);
    expect(summary.qualityFailureKg).toBe(0);
    // Only meaningful once the line wears below 95.
    if ((summary.grade.lowestStamp ?? 100) < 95)
      expect(summary.grade.offSpecToCommunityKg).toBeGreaterThan(0);
  });

  // No hold arm: in arms q and c the dispatch question never arises (0
  // ticks, gradeLedger dispatchTicks.offSpecTaken). Flour under 95 appears
  // only once the line has worn, and by then the strong-white order is the
  // last one open in its programme: no lower-minimum order is open to take
  // it, and the next programme waits for that one. The truck's question is
  // exercised on the real tick in UnifiedGameTick.gradeRecovery.test.ts.
  it('arm c: accepted, never repaired or serviced: the same three proofs', () => {
    const { summary } = run({ ...ARM_POLICY.c, label: 'c' });
    expect(summary.grade.underMinimumKg).toEqual({});
    expect(summary.grade.paidUnderMinimum).toBe(0);
    expect(summary.qualityFailureKg).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// The maintenance window, the mill setting and grain's price (plan items 3.3,
// 3.6, 3.8; MILLOS_PLANT_MAINTENANCE_OUT)
// ---------------------------------------------------------------------------

const MAINTENANCE_OUT = process.env.MILLOS_PLANT_MAINTENANCE_OUT;

describe.skipIf(!MAINTENANCE_OUT)('the maintenance window, the mill setting, grain', () => {
  const out: Record<string, unknown> = {
    instrument: output.instrument,
    pace: STANDARD_GAME_SPEED,
    lineRate: LINE_RATE,
    definitions: {
      p: 'no input at all: the partner answers every proposal at its window (service now, accept)',
      'p-service / p-quiet / p-run-on':
        'arm p, every service proposal answered by the operator: service now, the quiet spell (service now where not offered), run on',
      'a-serviced': 'arm a (accept, repair) with Maintain pressed on every wear prediction',
      'a-two-mills-down':
        'arm a, rm-102 and rm-103 down 240 game minutes mid-order in shift 2, no Maintain',
      'a-never-service': 'arm a: repairs pressed, every service proposal answered run on',
      p0: 'arm p without the lab bench (labBench false): the comparisons below run on p0, so the bench (plan item 3.2, tuned in another lane) does not move them',
      sweep: 'arm p0 at line rate 0.6, 0.8, 1.0, 1.2, 1.6 and the slider maximum 2.0',
      netPerTonne: 'net over the ten whole shifts per tonne shipped',
      shares: 'each cost line over the ten whole shifts, as a share of revenue',
      grainShareOfRevenue: 'grain in what shipped (grain bought less stock held) over revenue',
    },
    arms: {} as Record<string, unknown>,
  };
  let parsed: [ReturnType<typeof extractRoster>, ReturnType<typeof extractDockPredicates>];
  const sources = () => (parsed ??= [extractRoster(), extractDockPredicates()]);
  const noInput: Policy = {
    label: 'p',
    accepts: false,
    repairs: false,
    lineRate: LINE_RATE,
    service: false,
    proposals: 'leave',
  };
  const noInput0: Policy = { ...noInput, labBench: false };
  const ledger = new Map<string, PartnerProposal>();
  const results: Record<string, ReturnType<typeof summarise>> = {};
  const summarise = (result: ArmResult) => {
    const t = result.totals;
    const whole = result.rows.filter((row) => !row.partial);
    const costs = {
      grain: t.grainCost - t.stockHeld,
      grainBought: t.grainCost,
      stockHeld: t.stockHeld,
      parts: t.partsCost,
      energy: t.energyCost,
      automation: t.automationCost,
      waste: t.wasteCost,
      maintenance: t.maintenanceCost,
      demurrage: t.demurrageCost,
      late: t.latePenalties,
    };
    const proposals = [...ledger.values()].filter((p) => p.kind === 'service');
    return {
      shippedKg: t.shippedKg,
      ordersOnTime: t.ordersOnTime,
      ordersLate: t.ordersLate,
      shortAtDue: result.end.orders.shortAtDue,
      overdueOpenAtEnd: result.end.orders.overdueOpenAtEnd,
      grades: whole.map((row) => row.grade ?? '-').join(''),
      revenue: t.revenue,
      net: t.net,
      netPerShift: round(t.net / Math.max(1, whole.length), 2),
      netPerTonne: round(t.net / Math.max(1e-9, t.shippedKg / 1000), 2),
      minShiftNet: Math.min(...whole.map((row) => row.net)),
      costs: Object.fromEntries(Object.entries(costs).map(([k, v]) => [k, round(v, 2)])),
      shares: Object.fromEntries(
        Object.entries(costs).map(([k, v]) => [k, round(v / Math.max(1e-9, t.revenue), 4)])
      ),
      grainShareOfRevenue: round((t.grainCost - t.stockHeld) / Math.max(1e-9, t.revenue), 4),
      minProductQuality: Math.min(...whole.map((row) => row.minProductQuality)),
      endQualityBelow95: result.end.qualityFirstBelow['95'],
      breakdowns: t.breakdowns,
      outageMinutes: t.outageMinutes,
      minParts: result.end.minParts,
      partsUsed: result.end.partsUsed,
      energyPerTonne: round(t.energyCost / Math.max(1e-9, t.shippedKg / 1000), 3),
      // Every service started took a part; parts used also counts repairs.
      serviceAnswers: Object.fromEntries(
        ['service', 'quiet', 'run-on'].map((id) => [
          id,
          proposals.filter((p) => p.resolution?.optionId === id).length,
        ])
      ),
      quietOffered: proposals.filter((p) => p.options.some((o) => o.id === 'quiet')).length,
      otherWasBetter: proposals.filter(
        (p) => p.comparison?.bestOptionId && p.comparison.bestOptionId !== p.resolution?.optionId
      ).length,
      bestByComparison: Object.fromEntries(
        ['service', 'quiet', 'run-on', 'tie'].map((id) => [
          id,
          proposals.filter((p) => p.comparison && (p.comparison.bestOptionId ?? 'tie') === id)
            .length,
        ])
      ),
    };
  };
  const run = (label: string, policy: Policy) => {
    ledger.clear();
    const stop = usePartnerProposalStore.subscribe((state) => {
      for (const proposal of state.proposals) ledger.set(proposal.id, proposal);
    });
    let result: ArmResult;
    try {
      result = runPolicy({ ...policy, label }, STANDARD_GAME_SPEED, WHOLE_SHIFTS, ...sources());
    } finally {
      stop();
    }
    const summary = summarise(result);
    results[label] = summary;
    (out.arms as Record<string, unknown>)[label] = { policy, summary, rows: result.rows };
    out.provenance ??= provenance();
    writeFileSync(MAINTENANCE_OUT!, JSON.stringify(out, null, 1));
    process.stdout.write(`${table(result)}\n${label} ${JSON.stringify(summary)}\n`);
    expect(result.rows.filter((row) => !row.partial)).toHaveLength(WHOLE_SHIFTS);
    expect(Math.abs(result.end.materialBalanceErrorKg)).toBeLessThan(0.001);
    return { result, summary };
  };

  it('arm p: no input delivers on time, graded A, never runs out of a part; grain is the largest cost and the net stays positive', () => {
    const { summary } = run('p', noInput);
    expect(summary.ordersLate).toBe(0);
    expect(summary.shortAtDue).toBe(0);
    expect(summary.overdueOpenAtEnd).toBe(0);
    expect(summary.grades).toBe('A'.repeat(WHOLE_SHIFTS));
    for (const count of Object.values(summary.minParts)) expect(count).toBeGreaterThan(0);
    const others = Object.entries(summary.costs).filter(
      ([k]) => !['grain', 'grainBought', 'stockHeld'].includes(k)
    );
    for (const [, cost] of others) expect(summary.costs.grain).toBeGreaterThan(cost);
    expect(summary.net).toBeGreaterThan(0);
    expect(summary.minShiftNet).toBeGreaterThan(0);
  });

  it('arm p0: the same, without the bench', () => {
    const { summary } = run('p0', noInput0);
    expect(summary.ordersLate).toBe(0);
    expect(summary.grades).toBe('A'.repeat(WHOLE_SHIFTS));
    for (const count of Object.values(summary.minParts)) expect(count).toBeGreaterThan(0);
    expect(summary.minShiftNet).toBeGreaterThan(0);
  });

  it('the three service answers, each given to every service proposal', () => {
    // The quiet spell is off on the card (partnerProposals SERVICE_CARD); it is
    // turned on here, for this arm only, to measure what it would do.
    for (const answer of ['service', 'quiet', 'run-on'] as const) {
      SERVICE_CARD.quietSpellOffered = answer === 'quiet';
      try {
        run(`p0-${answer}`, { ...noInput0, proposals: answer });
      } finally {
        SERVICE_CARD.quietSpellOffered = false;
      }
    }
  });

  it('breaking two mills for 240 minutes no longer beats servicing them, on grade or on net', () => {
    const serviced = run('a-serviced', { ...ARM_POLICY.a, service: true }).summary;
    const broken = run('a-two-mills-down', {
      ...ARM_POLICY.a,
      outage: { machineIds: ['rm-102', 'rm-103'], minutes: 240 },
    }).summary;
    const gradeRank = (grades: string) =>
      [...grades].reduce((sum, g) => sum + ('ABCDF'.indexOf(g) < 0 ? 5 : 'ABCDF'.indexOf(g)), 0);
    expect(broken.net).toBeLessThan(serviced.net);
    expect(gradeRank(broken.grades)).toBeGreaterThanOrEqual(gradeRank(serviced.grades));
    expect(broken.minProductQuality).toBeLessThanOrEqual(serviced.minProductQuality);
  });

  it('never servicing ends with quality under 95', () => {
    const { summary } = run('a-never-service', ARM_POLICY.a);
    expect(summary.endQualityBelow95).not.toBeNull();
  });

  it.skipIf(!process.env.MILLOS_PLANT_DEBUG_RATE)('debug: end state at one rate', () => {
    const rate = Number(process.env.MILLOS_PLANT_DEBUG_RATE);
    run(`debug-${rate}`, { ...noInput0, lineRate: rate });
    const machines = useProductionStore.getState().machines.map((m) => ({
      id: m.id,
      status: m.status,
      wear: m.metrics.wear,
      load: m.metrics.load,
    }));
    const schedule = useBreakdownStore.getState().maintenanceSchedule.filter((t) => !t.completed);
    const flow = useMaterialFlowStore.getState();
    const campaign = useOperationsCampaignStore.getState();
    process.stdout.write(
      `DEBUG ${JSON.stringify({
        machines,
        schedule,
        parts: useBreakdownStore.getState().partsInventory,
        workOrders: useBreakdownStore
          .getState()
          .workOrders.filter((w) => w.phase !== 'returned_to_service'),
        packerFlow: flow.currentPackerFlowRate,
        open: campaign.orders
          .filter((o) => o.status !== 'fulfilled')
          .map((o) => [o.id, o.status, o.requiredKg, o.shippedKg, o.recipe.minimumQuality]),
        stage: campaign.execution.stage,
        plan: campaign.getActiveProductionPlan(),
        quality: useProductionStore.getState().metrics.quality,
        batches: flow.productionBatches
          .filter((b) => b.availableKg > 0)
          .map((b) => [b.materialType, b.disposition, Math.round(b.availableKg), b.qualityScore]),
        silos: [...flow.machineBuffers.values()]
          .filter((b) => b.machineType === 'silo')
          .map((b) => b.outputBuffer.map((m) => [m.type, Math.round(m.amount)])),
        buffers: [...flow.machineBuffers.values()]
          .filter((b) => b.machineType !== 'silo')
          .map((b) => [
            b.machineId,
            b.isProcessing,
            Math.round(b.inputBuffer.reduce((s2, m) => s2 + m.amount, 0)),
            Math.round(b.outputBuffer.reduce((s2, m) => s2 + m.amount, 0)),
          ]),
        linePlan: campaign.getLineProductionPlan({ flour: 0, semolina: 0 }),
        millOutput: [...flow.machineBuffers.values()]
          .filter((b) => b.machineType !== 'silo')
          .map((b) => [
            b.machineId,
            b.inputBuffer.map((m) => [m.type, Math.round(m.amount)]),
            b.outputBuffer.map((m) => [m.type, Math.round(m.amount)]),
          ]),
        clock: useGameSimulationStore.getState().clockHolds,
        emergency: useGameSimulationStore.getState().emergencyActive,
      })}\n`
    );
  });

  it('the rate sweep has its best net per tonne inside the range', () => {
    // 1.6 is not asked for; it shows the curve short of 2.0, where the line
    // can jam on unsold semolina (reported, not this item's).
    const rates = [0.6, 0.8, 1.0, 1.2, 1.6, 2.0];
    const perTonne = rates.map(
      (rate) => run(`sweep-${rate}`, { ...noInput0, lineRate: rate }).summary.netPerTonne
    );
    out.sweep = Object.fromEntries(rates.map((rate, i) => [rate, perTonne[i]]));
    writeFileSync(MAINTENANCE_OUT!, JSON.stringify(out, null, 1));
    const best = perTonne.indexOf(Math.max(...perTonne));
    expect(best).toBeGreaterThan(0);
    expect(best).toBeLessThan(rates.length - 1);
  });
});

// ---------------------------------------------------------------------------
// Which kinds are asked, the early programme, and the way out (plan items 3.0,
// 3.7 and the delegation rule; MILLOS_PLANT_ASK_OUT)
// ---------------------------------------------------------------------------

const ASK_OUT = process.env.MILLOS_PLANT_ASK_OUT;

describe.skipIf(!ASK_OUT)('which kinds are asked, the early programme, the way out', () => {
  const askOutput: Record<string, unknown> = {
    instrument: output.instrument,
    pace: STANDARD_GAME_SPEED,
    lineRate: LINE_RATE,
    definitions: {
      p: 'no input at all: every kind at its default delegation (the rule), the partner decides',
      q: 'arm p, service on "ask" and every service answered "run on" (the line is never serviced)',
      'p-programme-hold': 'arm p, programme on "ask" and every programme answered "hold"',
      'q-dispatch-hold / -send': 'arm q, dispatch on "ask" and every dispatch answered hold / send',
      'commit-<policy> d<scale>':
        'arm p with commitment on "ask": eager takes the next programme as soon as offered, slack only when its button prices no lateness, never waits; orders after the guided programme scaled in kg by <scale>',
      'p-wet': 'arm p under a sandbox charter whose wet crop year holds wheat flour at 94.5',
      bestByOption: 'per kind, compared proposals by the answer the record ranked best (tie: none)',
      otherWasBetter: 'compared proposals whose best answer was not the one chosen',
      otherBetterByShift: 'otherWasBetter per whole shift, by the minute of the comparison',
    },
    arms: {} as Record<string, unknown>,
  };
  let parsed: [ReturnType<typeof extractRoster>, ReturnType<typeof extractDockPredicates>];
  const sources = () => (parsed ??= [extractRoster(), extractDockPredicates()]);
  const noInput: Policy = {
    label: 'p',
    accepts: false,
    repairs: false,
    lineRate: LINE_RATE,
    service: false,
    proposals: 'leave',
  };
  type Summary = ReturnType<typeof summarise>;
  const summaries: Record<string, Summary> = {};
  const seen = { benchPasses: new Set<string>(), batches: new Set<string>() };
  const summarise = (result: ArmResult, proposals: PartnerProposal[]) => {
    const whole = result.rows.filter((row) => !row.partial);
    const reports = useOperationsCampaignStore.getState().reports;
    const compared = proposals.filter((p) => p.status === 'resolved' && p.comparison);
    const byKind = Object.fromEntries(
      PROPOSAL_KIND_IDS.map((kind) => {
        const ofKind = proposals.filter((p) => p.kind === kind);
        const comparedOfKind = compared.filter((p) => p.kind === kind);
        const count = (pick: (p: PartnerProposal) => string) =>
          comparedOfKind.reduce<Record<string, number>>((acc, p) => {
            acc[pick(p)] = (acc[pick(p)] ?? 0) + 1;
            return acc;
          }, {});
        const defaultId = ofKind[0]?.defaultOptionId ?? null;
        return [
          kind,
          {
            raised: ofKind.length,
            compared: comparedOfKind.length,
            defaultOptionId: defaultId,
            chosenByOption: count((p) => p.resolution!.optionId),
            bestByOption: count((p) => p.comparison!.bestOptionId ?? 'tie'),
            otherWasBetter: comparedOfKind.filter(
              (p) =>
                p.comparison!.bestOptionId && p.comparison!.bestOptionId !== p.resolution!.optionId
            ).length,
            /** The record ranked an answer other than the partner's best. */
            nonDefaultBest: comparedOfKind.filter(
              (p) => p.comparison!.bestOptionId && p.comparison!.bestOptionId !== p.defaultOptionId
            ).length,
            /** The record ranked the partner's answer best. */
            defaultBest: comparedOfKind.filter(
              (p) => p.comparison!.bestOptionId === p.defaultOptionId
            ).length,
          },
        ];
      })
    ) as Record<
      ProposalKind,
      {
        raised: number;
        compared: number;
        defaultOptionId: string | null;
        chosenByOption: Record<string, number>;
        bestByOption: Record<string, number>;
        otherWasBetter: number;
        nonDefaultBest: number;
        defaultBest: number;
      }
    >;
    const otherBetter = compared.filter(
      (p) => p.comparison!.bestOptionId && p.comparison!.bestOptionId !== p.resolution!.optionId
    );
    const otherBetterByShift = reports
      .filter((report) => whole.some((row) => row.shiftKey === report.shiftKey))
      .map(
        (report) =>
          otherBetter.filter(
            (p) =>
              p.comparison!.atMinute > report.startedAtMinute &&
              p.comparison!.atMinute <= report.endedAtMinute
          ).length
      );
    return {
      shippedKg: result.totals.shippedKg,
      ordersOnTime: result.totals.ordersOnTime,
      ordersLate: result.totals.ordersLate,
      ordersForfeited: result.totals.ordersForfeited,
      overdueOpenAtEnd: result.end.orders.overdueOpenAtEnd,
      shortAtDue: result.end.orders.shortAtDue,
      net: result.totals.net,
      latePenalties: result.totals.latePenalties,
      grades: whole.map((row) => row.grade ?? '-').join(''),
      programmesAccepted: result.end.programmesAccepted,
      shippedByShift: whole.map((row) => row.shippedKg),
      programmesByShift: whole.map((row) => row.programmesAccepted),
      minParts: result.end.minParts,
      partsUsed: result.end.partsUsed,
      byKind,
      otherWasBetter: otherBetter.length,
      otherBetterByShift,
      // Under a charter: the Chronicle's know-how by source, the QC passes it
      // credited (once a batch), and the bench's own tests (item 5e).
      chronicle:
        useChronicleStore.getState().chronicle.status === 'active'
          ? {
              knowHow: { ...useChronicleStore.getState().chronicle.ledger.knowHow },
              customers: useChronicleStore
                .getState()
                .chronicle.customers.map((c) => ({ id: c.id, value: c.value })),
              benchPassesSeen: seen.benchPasses.size,
              batchesSeen: seen.batches.size,
              creditedQcBatches:
                useChronicleStore.getState().chronicle.creditedQcBatchIds?.length ?? null,
              benchTestsInRecord: useQCLabStore
                .getState()
                .qcLab.testHistory.filter((t) => t.controlSource === 'Autonomous QC controller')
                .length,
            }
          : null,
      /**
       * The early programme's record where its take button showed no order at
       * risk: how often each answer was judged better (the partner's choice).
       */
      commitmentNoRisk: compared
        .filter(
          (p) =>
            p.kind === 'commitment' &&
            (p.options.find((option) => option.id === 'take')?.price.lateOrders ?? 1) === 0
        )
        .reduce<Record<string, number>>((acc, p) => {
          const key = p.comparison!.bestOptionId ?? 'tie';
          acc[key] = (acc[key] ?? 0) + 1;
          return acc;
        }, {}),
      /** Mean net the take button credited per take (set by `run`). */
      creditedPerTake: null as number | null,
      forfeits: useOperationsCampaignStore
        .getState()
        .orders.filter((o) => o.forfeitedAtMinute !== undefined)
        .map((o) => ({
          id: o.id,
          minimum: o.recipe.minimumQuality,
          reason: o.forfeitReason,
          best: o.forfeitBestQuality ?? null,
          lateMinutes: round((o.forfeitedAtMinute ?? 0) - o.dueAtMinute, 1),
          shippedKg: round(o.shippedKg),
          fee: o.forfeitFee ?? 0,
        })),
    };
  };
  const run = (label: string, policy: Policy) => {
    const ledger = new Map<string, PartnerProposal>();
    const stop = usePartnerProposalStore.subscribe((state) => {
      for (const proposal of state.proposals) ledger.set(proposal.id, proposal);
    });
    let result: ArmResult;
    seen.benchPasses.clear();
    seen.batches.clear();
    // Every batch packed and every bench pass of the run (the stores keep tails).
    const observe = () => {
      for (const batch of useMaterialFlowStore.getState().productionBatches)
        seen.batches.add(batch.id);
      for (const test of useQCLabStore.getState().qcLab.testHistory)
        if (test.passed && test.controlSource === 'Autonomous QC controller')
          seen.benchPasses.add(`${test.id}@${new Date(test.timestamp).getTime()}`);
    };
    try {
      result = runPolicy(
        { ...policy, label },
        STANDARD_GAME_SPEED,
        WHOLE_SHIFTS,
        ...sources(),
        observe
      );
    } finally {
      stop();
    }
    const summary = summarise(result, [...ledger.values()]);
    // What the take button credited, per take the arm made: the price the arm
    // acted on (its offers scaled as it scales the orders it takes).
    const scale = policy.demandScale ?? 1;
    const credited = [...ledger.values()]
      .filter(
        (p) =>
          p.kind === 'commitment' && p.status === 'resolved' && p.resolution?.optionId === 'take'
      )
      .map((p) => {
        const facts = p.facts as CommitmentFacts;
        const orders = facts.orders.map((order) => ({
          ...order,
          kg: Math.round(order.kg * scale),
        }));
        return (
          priceOption('commitment', 'take', {
            ...facts,
            orders,
            committedKg: orders.reduce((sum, order) => sum + order.kg, 0),
          }).net ?? 0
        );
      });
    summary.creditedPerTake = credited.length
      ? round(credited.reduce((sum, net) => sum + net, 0) / credited.length, 0)
      : null;
    summaries[label] = summary;
    (askOutput.arms as Record<string, unknown>)[label] = { policy, summary, rows: result.rows };
    askOutput.provenance ??= provenance();
    writeFileSync(ASK_OUT!, JSON.stringify(askOutput, null, 1));
    process.stdout.write(`${table(result)}\n${label} ${JSON.stringify(summary)}\n`);
    expect(result.rows.filter((row) => !row.partial)).toHaveLength(WHOLE_SHIFTS);
    expect(Math.abs(result.end.materialBalanceErrorKg)).toBeLessThan(0.001);
    return { result, summary };
  };

  it('arm p: with no input every order ships on time, graded A, and no part runs out', () => {
    const { summary } = run('p', noInput);
    expect(summary.ordersLate).toBe(0);
    expect(summary.ordersForfeited).toBe(0);
    expect(summary.overdueOpenAtEnd).toBe(0);
    expect(summary.shortAtDue).toBe(0);
    expect(summary.grades).toBe('A'.repeat(WHOLE_SHIFTS));
    for (const count of Object.values(summary.minParts)) expect(count).toBeGreaterThan(0);
  });

  it("the answer that is not the partner's, kind by kind", () => {
    run('q', { ...noInput, proposals: 'run-on' });
    run('p-programme-hold', { ...noInput, programmeAnswer: 'hold' });
    run('q-dispatch-hold', { ...noInput, proposals: 'run-on', dispatch: 'hold' });
    run('q-dispatch-send', { ...noInput, proposals: 'run-on', dispatch: 'send' });
  });

  it('taking the next programme early: eager, on slack and never, at three demands', () => {
    for (const scale of [1, 1.5, 2])
      for (const commitment of ['eager', 'slack', 'never'] as const)
        run(`commit-${commitment} d${scale}`, { ...noInput, commitment, demandScale: scale });
  });

  it('the true price: taking early exactly when it prices no lateness, at three demands', () => {
    const table: Record<string, unknown>[] = [];
    for (const scale of [1, 1.5, 2])
      for (const commitment of ['never', 'priced', 'eager'] as const) {
        const label = `commit-${commitment} d${scale}`;
        const summary =
          summaries[label] ?? run(label, { ...noInput, commitment, demandScale: scale }).summary;
        table.push({
          demand: scale,
          arm: commitment,
          shippedT: round(summary.shippedKg / 1000, 1),
          onTime: summary.ordersOnTime,
          late: summary.ordersLate,
          forfeited: summary.ordersForfeited,
          net: Math.round(summary.net),
          takes: summary.byKind.commitment.chosenByOption.take ?? 0,
          takeBest: summary.byKind.commitment.bestByOption.take ?? 0,
          waitBest: summary.byKind.commitment.bestByOption.wait ?? 0,
          otherWasBetter: summary.byKind.commitment.otherWasBetter,
          compared: summary.byKind.commitment.compared,
          grades: summary.grades,
          creditedPerTake: summary.creditedPerTake,
          noRisk: summary.commitmentNoRisk,
          measuredPerTake:
            commitment === 'never' || !(summary.byKind.commitment.chosenByOption.take ?? 0)
              ? null
              : Math.round(
                  (summary.net - (summaries[`commit-never d${scale}`]?.net ?? summary.net)) /
                    (summary.byKind.commitment.chosenByOption.take ?? 1)
                ),
        });
      }
    askOutput.commitmentTable = table;
    writeFileSync(ASK_OUT!, JSON.stringify(askOutput, null, 1));
    process.stdout.write(`COMMITMENT ${JSON.stringify(table)}\n`);
    // At most two orders late in ten shifts beyond what the plant runs late
    // with no early take at all (at demand 2 never taking early runs late too).
    for (const scale of [1, 1.5, 2]) {
      const priced = summaries[`commit-priced d${scale}`];
      const never = summaries[`commit-never d${scale}`];
      expect(
        priced.ordersLate + priced.ordersForfeited - (never.ordersLate + never.ordersForfeited),
        `late at demand ${scale}`
      ).toBeLessThanOrEqual(2);
    }
    expect(summaries['commit-priced d1'].net).toBeGreaterThan(summaries['commit-never d1'].net);
  });

  // The dock model was fitted at the boot rate (0.8); the line's rate scales
  // it. Measured, not gated: the same arms at the slider's 1.0 and 1.2.
  it('the true price at line rates 1.0 and 1.2 (measured)', () => {
    const table: Record<string, unknown>[] = [];
    for (const lineRate of [1, 1.2])
      for (const commitment of ['never', 'priced'] as const) {
        const { summary } = run(`commit-${commitment} d1 rate${lineRate}`, {
          ...noInput,
          lineRate,
          commitment,
        });
        table.push({
          lineRate,
          arm: commitment,
          shippedT: round(summary.shippedKg / 1000, 1),
          onTime: summary.ordersOnTime,
          late: summary.ordersLate,
          forfeited: summary.ordersForfeited,
          net: Math.round(summary.net),
          takes: summary.byKind.commitment.chosenByOption.take ?? 0,
        });
      }
    askOutput.commitmentRates = table;
    writeFileSync(ASK_OUT!, JSON.stringify(askOutput, null, 1));
    process.stdout.write(`COMMITMENT-RATES ${JSON.stringify(table)}\n`);
  });

  it('a crop year the line cannot make 95 in: it keeps shipping, forfeits the 95 orders and takes work', () => {
    // Tempered as it comes (plan item 7.7): the partner would dry the wheat.
    const { summary } = run('p-wet', { ...noInput, charter: 'wet', temperAnswer: 'standard' });
    for (const kg of summary.shippedByShift) expect(kg).toBeGreaterThan(0);
    expect(summary.ordersForfeited).toBeGreaterThan(0);
    // Every 95 order is forfeited as one the line cannot make, at 94.5; any
    // other forfeit is an order that ran out of time.
    for (const forfeit of summary.forfeits)
      if (forfeit.minimum === 95) {
        expect(forfeit.reason).toBe('unreachable');
        expect(forfeit.best).toBeCloseTo(94.5, 5);
      } else expect(forfeit.reason).toBe('late');
    expect(summary.programmesAccepted).toBeGreaterThan(2);
    // Kept open to the bound instead, every 95 order runs its lateness out.
    run('p-wet-keep', {
      ...noInput,
      charter: 'wet',
      forfeitAnswer: 'keep',
      temperAnswer: 'standard',
    });
  });

  it('never serviced, without a charter, the plant keeps taking work to the last shift', () => {
    const q = summaries.q ?? run('q', { ...noInput, proposals: 'run-on' }).summary;
    expect(q.shippedByShift.at(-1)).toBeGreaterThan(0);
    expect(q.programmesByShift.slice(-3).some((n) => n > 0)).toBe(true);
  });

  it('the delegation rule holds against these arms (DELEGATION_EVIDENCE)', () => {
    const verdicts: Record<string, unknown> = {};
    for (const kind of PROPOSAL_KIND_IDS) {
      // Evidence labelled 'floor:' is an arm of plantFloor.playtest.test.ts, checked there.
      const fromHere = (label: string | null) => (label?.startsWith('floor:') ? null : label);
      const otherBetter = fromHere(DELEGATION_EVIDENCE[kind].otherBetter);
      const otherWorse = fromHere(DELEGATION_EVIDENCE[kind].otherWorse);
      const better = otherBetter ? summaries[otherBetter]?.byKind[kind] : null;
      const worse = otherWorse ? summaries[otherWorse]?.byKind[kind] : null;
      verdicts[kind] = {
        otherBetter,
        otherWorse,
        nonDefaultBestThere: better?.nonDefaultBest ?? null,
        defaultBestThere: worse?.defaultBest ?? null,
        everyArm: Object.fromEntries(
          Object.entries(summaries).map(([label, summary]) => [
            label,
            {
              compared: summary.byKind[kind].compared,
              nonDefaultBest: summary.byKind[kind].nonDefaultBest,
              defaultBest: summary.byKind[kind].defaultBest,
            },
          ])
        ),
      };
      if (otherBetter)
        expect(better?.nonDefaultBest ?? 0, `${kind} in ${otherBetter}`).toBeGreaterThan(0);
      if (otherWorse)
        expect(worse?.defaultBest ?? 0, `${kind} in ${otherWorse}`).toBeGreaterThan(0);
      // Evidence measured in plantFloor.playtest.test.ts is checked there, and
      // an incident is read per incident kind (INCIDENT_DELEGATION_EVIDENCE).
      const elsewhere =
        kind === 'incident' ||
        !!DELEGATION_EVIDENCE[kind].otherBetter?.startsWith('floor:') ||
        !!DELEGATION_EVIDENCE[kind].otherWorse?.startsWith('floor:');
      if (elsewhere) continue;
      // A null claim is a claim: no arm here found it (review 2, finding 5).
      for (const [label, summary] of Object.entries(summaries)) {
        if (!otherBetter)
          expect(summary.byKind[kind].nonDefaultBest, `${kind} other better in ${label}`).toBe(0);
        if (!otherWorse)
          expect(summary.byKind[kind].defaultBest, `${kind} other worse in ${label}`).toBe(0);
      }
      // A record fixed by arithmetic names no answer better in any arm; what
      // its other answer costs is read on the arm's totals.
      const armWorse = DELEGATION_EVIDENCE[kind].armWorse;
      if (armWorse) {
        for (const summary of Object.values(summaries))
          expect(summary.byKind[kind].bestByOption, `${kind}: no verdict`).toEqual(
            summary.byKind[kind].compared > 0 ? { tie: summary.byKind[kind].compared } : {}
          );
        const arm = summaries[armWorse.arm];
        const against = summaries[armWorse.against];
        expect(arm, armWorse.arm).toBeDefined();
        expect(against, armWorse.against).toBeDefined();
        expect(arm.net, `${kind}: ${armWorse.arm} against ${armWorse.against}`).toBeLessThan(
          against.net
        );
        expect(arm.ordersOnTime).toBeLessThanOrEqual(against.ordersOnTime);
        (verdicts[kind] as Record<string, unknown>).armWorse = {
          ...armWorse,
          net: [arm.net, against.net],
          onTime: [arm.ordersOnTime, against.ordersOnTime],
        };
      }
    }
    askOutput.rule = verdicts;
    writeFileSync(ASK_OUT!, JSON.stringify(askOutput, null, 1));
  });
});

// ---------------------------------------------------------------------------
// The early programme's price against what the dock then did (plan wave 3d;
// MILLOS_PLANT_COMMIT_DEBUG=<out.json>). A diagnostic, not a gate: every
// shipping departure (minute, product, kg, orders loaded) and, at every early
// take, the dock as the stores then stood and the price the button showed.
// ---------------------------------------------------------------------------

const COMMIT_DEBUG = process.env.MILLOS_PLANT_COMMIT_DEBUG;

describe.skipIf(!COMMIT_DEBUG)('the early programme against the dock (diagnostic)', () => {
  it('logs departures and every early take', () => {
    const roster = extractRoster();
    const predicates = extractDockPredicates();
    const scale = Number(process.env.MILLOS_PLANT_COMMIT_SCALE ?? 1);
    const commitment = (process.env.MILLOS_PLANT_COMMIT_POLICY ?? 'slack') as
      | 'eager'
      | 'slack'
      | 'never'
      | 'priced';
    const departures: Record<string, unknown>[] = [];
    const takes: Record<string, unknown>[] = [];
    const seenTakes = new Set<string>();
    const snapshots: Record<string, unknown>[] = [];
    let nextSnapshot = 0;
    let lastManifest = 0;
    const stock = () => {
      const out = { flour: { tested: 0, bench: 0 }, semolina: { tested: 0, bench: 0 } };
      for (const b of useMaterialFlowStore.getState().productionBatches)
        if (b.availableKg > 0 && b.disposition === 'released')
          out[b.materialType][b.awaitingTest ? 'bench' : 'tested'] += Math.round(b.availableKg);
      return out;
    };
    const onTick = () => {
      const flow = useMaterialFlowStore.getState();
      const campaign = useOperationsCampaignStore.getState();
      if (flow.manifestSequence !== lastManifest) {
        lastManifest = flow.manifestSequence;
        const m = flow.manifests.at(-1);
        if (m?.kind === 'shipping')
          departures.push({
            minute: round(campaign.elapsedMinutes, 1),
            kg: Math.round(m.actualKg),
            product: m.materials.map((x) => x.type).join('+'),
            orders: [...new Set((m.orderLoads ?? []).map((l) => l.orderId))].join(' '),
          });
      }
      if (campaign.elapsedMinutes >= nextSnapshot) {
        nextSnapshot += 20;
        const shipping = useTruckScheduleStore.getState().truckSchedule.shipping;
        const load = campaign.execution.dispatchLoad;
        snapshots.push({
          minute: round(campaign.elapsedMinutes, 1),
          phase: shipping.lifecyclePhase,
          active: shipping.truckActive,
          nextArrival: round(shipping.nextArrivalMinutes, 1),
          load: { status: load.status, kg: Math.round(load.loadedKg), product: load.materialType },
          line: campaign.getActiveProductionPlan()?.finishedMaterial ?? null,
          stock: stock(),
          open: campaign.orders
            .filter((o) => o.status !== 'fulfilled' && o.status !== 'cancelled')
            .map((o) => ({
              id: o.id,
              product: o.recipe.finishedMaterial,
              priority: o.priority,
              left: Math.round(o.requiredKg - o.shippedKg),
              due: round(o.dueAtMinute, 1),
              active: o.id === campaign.activeOrderId,
              rate: o.latePenaltyPerKgHour,
            })),
        });
      }
      for (const p of usePartnerProposalStore.getState().proposals) {
        if (p.kind !== 'commitment' || p.status !== 'resolved' || seenTakes.has(p.id)) continue;
        if (p.resolution?.optionId !== 'take') continue;
        seenTakes.add(p.id);
        const shipping = useTruckScheduleStore.getState().truckSchedule.shipping;
        takes.push({
          minute: round(campaign.elapsedMinutes, 1),
          priced: (p.facts as { lateMinutes: number }).lateMinutes,
          price: p.options.find((option) => option.id === 'take')?.price,
          raisedAt: p.raisedAtMinute,
          offer: (p.facts as { orders: unknown[] }).orders,
          truck: {
            docked: shipping.truckDocked,
            ready: shipping.transferReady,
            nextArrival: round(shipping.nextArrivalMinutes, 1),
            load: campaign.execution.dispatchLoad.status,
          },
          stock: stock(),
          open: campaign.orders
            .filter((o) => o.status !== 'fulfilled' && o.status !== 'cancelled')
            .map((o) => ({
              id: o.id,
              product: o.recipe.finishedMaterial,
              priority: o.priority,
              left: Math.round(o.requiredKg - o.shippedKg),
              due: round(o.dueAtMinute, 1),
              active: o.id === campaign.activeOrderId,
            })),
        });
      }
    };
    const result = runPolicy(
      {
        label: `debug-${commitment}-d${scale}`,
        accepts: false,
        repairs: false,
        lineRate: LINE_RATE,
        service: false,
        proposals: 'leave',
        commitment,
        demandScale: scale,
      },
      STANDARD_GAME_SPEED,
      WHOLE_SHIFTS,
      roster,
      predicates,
      onTick
    );
    writeFileSync(
      COMMIT_DEBUG!,
      JSON.stringify(
        {
          totals: result.totals,
          orders: result.end.orders.log,
          departures,
          takes,
          snapshots,
        },
        null,
        1
      )
    );
  });
});
