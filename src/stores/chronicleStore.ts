/**
 * The Mill Chronicle store (docs/CHRONICLE.md).
 *
 * Wraps the pure engine in src/chronicle/engine.ts, persists it, and performs
 * the engine's commands on the stores that own them: incidents on the
 * operations campaign, crises on the game simulation, notes on Datalinks. The
 * central tick calls `observe()` once per tick; it is a no-op until a charter
 * is signed, so benchmarks and captures see the plant unchanged.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeJSONStorage } from './storage';
import { useOperationsCampaignStore, type ShiftCampaignReport } from './operationsCampaignStore';
import { useGameSimulationStore } from './gameSimulationStore';
import { OPERATOR_CONTROL_SOURCE, useQCLabStore } from './qcLabStore';
import { useMaterialFlowStore } from './materialFlowStore';
import { energyTariffPerKwh } from '../utils/energyCalculations';
import { useKnowledgeStore } from './knowledgeStore';
import { useWorkplaceStore } from './workplaceStore';
import { campaignOutcomes } from '../simulation/workplaceCampaign';
import type { WorkplaceState } from '../types/workplace';
import { EVENT_DECK } from '../chronicle/eventDeck';
import { chronicleEffect, NEUTRAL_EFFECT } from '../chronicle/effects';
import { newCharterSeed } from '../chronicle/rng';
import { initialStakeholders } from '../chronicle/stakeholders';
import { createGovernance, POLICY_LADDER_IDS } from '../chronicle/governance';
import { knowHowEarned } from '../chronicle/ledger';
import {
  acceptTraining,
  answerQuizQuestion,
  quizQuestionAttempted,
  cancelInstall,
  chooseEventOption,
  closeShift,
  cooperativeSeasonFact,
  createInitialState,
  effectInput,
  fireDidNotStart,
  forgetResolvedIncidents,
  hireContractor,
  depositReserve,
  markNoteRead,
  markNotesSeen,
  meetNeed,
  mitigateForecast,
  proposePolicy,
  noteIncidents,
  releaseHazards,
  resyncBaseline,
  type ShiftCloseEvidence,
  planImprovement,
  recordDelivery,
  recordOwnedIncident,
  recordQuizRound,
  releaseStrandedFire,
  resolveShortfall,
  restoreIncident,
  reverseInitiative,
  setAusterity,
  setBrief,
  setDelegation,
  setReserveAutofill,
  settleUnfinishedInstalls,
  signCharter,
  startInstall,
  suppressFire,
  tickMinute,
  treatCropDirectly,
  withdrawProposal,
  type ChronicleState,
  type Step,
} from '../chronicle/engine';
import { sanitizeTemper, stepTemperState, withTemperAnswer } from '../chronicle/temper';
import type {
  BriefId,
  Charter,
  ChronicleCommand,
  ChronicleEffect,
  CooperativeSeasonFact,
  CrewRoleId,
  CropAttributes,
  DelegationLevel,
  GovernanceState,
  PartyChangeRecord,
  PolicyLadder,
  PolicyRung,
  TemperOptionId,
} from '../chronicle/types';

export interface QuizRound {
  questionIds: string[];
  index: number;
  score: number;
  picked: number | null;
  finished: boolean;
  /** The pick earned know-how; null before a pick. */
  earned?: boolean | null;
  /** The question had its first attempt before this pick, so it could not earn. */
  repeat?: boolean;
}

/** A temper answer the Chronicle booked, keyed by its card. */
export interface TemperAnswerRecord {
  key: string;
  option: TemperOptionId;
  /** What it booked for drying; 0 for the standard temper. */
  drying: number;
}

/** Temper answers kept: one a shift, so a chronicle's last two days of cards. */
export const TEMPER_ANSWERS_KEPT = 8;

interface ChronicleStore {
  chronicle: ChronicleState;
  /** The current quiz round. Not persisted; survives tab switches. */
  quiz: QuizRound | null;
  /** Rounds started this session, so each deals a fresh order. Not persisted. */
  quizRound: number;
  /** A Chronicle dialog is on screen, so the emergency overlay's guidance stands aside. Not persisted. */
  dialogOpen: boolean;
  setDialogOpen: (open: boolean) => void;
  /**
   * Prompts the player chose to think over (event instance ids, 'fire',
   * 'shortfall-<shift>'); saved, so a reload does not reopen them unasked.
   */
  deferredPrompts: string[];
  setDeferredPrompts: (ids: string[]) => void;
  /**
   * The temper answers booked, by their card (`<charter seed>:<subject>`),
   * with what each booked for drying; saved with the Chronicle, which saves
   * at once while the plant saves every 5 s. A reload between the two saves
   * restores the plant from before an answer the Chronicle already holds, and
   * the card is answered again: `answerTemper` then books nothing twice
   * (review 2). The latest TEMPER_ANSWERS_KEPT are kept.
   */
  temperAnswers: TemperAnswerRecord[];
  /** The answer already booked for a temper card, or undefined. */
  temperAnswerFor: (key: string) => TemperAnswerRecord | undefined;
  startQuiz: (questionIds: string[]) => void;
  pickQuizAnswer: (optionIndex: number, correct: boolean) => void;
  nextQuizQuestion: () => void;
  sign: (choice: Omit<Charter, 'seed'>, seed?: number) => void;
  abandon: () => void;
  observe: (paused: boolean) => void;
  stampDelivery: () => CropAttributes | null;
  getEffect: (wheatRecipe: boolean) => ChronicleEffect;
  choose: (instanceId: string, choiceId: string) => void;
  mitigate: (forecastId: string) => void;
  restore: (incidentId: string) => void;
  plan: (improvementId: string) => void;
  install: (improvementId: string) => void;
  cancel: (improvementId: string) => void;
  hire: (contractorId: string) => void;
  reverse: (initiativeId: string) => void;
  answerShortfall: (choice: 'conserve' | 'forced') => void;
  setAusterity: (active: boolean) => void;
  treatCrop: () => void;
  /**
   * The temper card's answer (plan item 7.7): one shift's wheat tempered this
   * way, at the rolls after its rest. False without an active crop year.
   * `dryingCost` is the energy the answer books for drying; a trial's energy
   * goal reads the close's energy without it (`trialEnergyCost`). `dryingKwh`
   * is the drying's energy before the Chronicle's multiplier, so what a hired
   * dryer kept off the books is credited to the fund at the close.
   */
  answerTemper: (
    option: TemperOptionId,
    minute: number,
    dryingCost?: number,
    dryingKwh?: number,
    /** The card it answers (the proposal's subject): a second answer to it books nothing. */
    cardKey?: string
  ) => boolean;
  /** The temper at the rolls brought up to this campaign minute (the runtime, each tick). */
  stepTemper: (minute: number) => void;
  suppress: (method?: 'suppress' | 'by_hand') => void;
  setDelegation: (level: DelegationLevel) => void;
  acceptTraining: () => void;
  readNote: (noteId: string) => void;
  /** The Notes tab is open: clear its badge without reading anything. */
  seeNotes: () => void;
  answerQuiz: (questionId: string, correct: boolean) => void;
  finishQuiz: (score: number) => void;
  // Part three (docs/CHRONICLE.md, systems 25-32)
  propose: (ladder: PolicyLadder, rung: PolicyRung) => void;
  withdraw: () => void;
  meetNeed: (memberId: CrewRoleId) => void;
  setBrief: (brief: BriefId) => void;
  setReserveAutofill: (autofill: boolean) => void;
  depositReserve: () => void;
}

function execute(commands: readonly ChronicleCommand[]): void {
  for (const command of commands) {
    switch (command.type) {
      case 'raise_incident': {
        const incident = useOperationsCampaignStore.getState().triggerIncident(command.kind);
        if (incident) {
          useChronicleStore.setState((s) => ({
            chronicle: recordOwnedIncident(s.chronicle, incident.id, incident.kind),
          }));
        }
        break;
      }
      case 'resolve_incident':
        useOperationsCampaignStore.getState().resolveIncident(command.incidentId, command.actor);
        break;
      case 'clear_weather':
        if (useGameSimulationStore.getState().weather === 'storm')
          useGameSimulationStore.getState().setWeather('clear');
        break;
      case 'start_fire': {
        const game = useGameSimulationStore.getState();
        game.triggerCrisis('fire', 'high', { source: 'chronicle' });
        if (useGameSimulationStore.getState().crisisState.type !== 'fire') {
          // Another crisis or drill holds the interlock; the fire never started.
          useChronicleStore.setState((s) => ({ chronicle: fireDidNotStart(s.chronicle) }));
        }
        break;
      }
      case 'resolve_fire': {
        const game = useGameSimulationStore.getState();
        if (game.crisisState.type !== 'fire') break;
        if (game.emergencyDrillMode) {
          // A drill holds the interlock; try again shortly rather than leave
          // the fire's stop in place with nothing left to clear it.
          useChronicleStore.setState((s) => ({
            chronicle: {
              ...s.chronicle,
              fire: { active: true, suppressing: true, resolveAtMinute: nowMinute() + 5 },
            },
          }));
          break;
        }
        game.resolveCrisis();
        break;
      }
      case 'unlock_note':
        useKnowledgeStore.getState().unlockEntry(command.noteId);
        // One read record: a note already read in Datalinks (a farm lesson can
        // open one there first) is read here too, and counts once.
        if (useKnowledgeStore.getState().readEntries.has(command.noteId))
          useChronicleStore.getState().readNote(command.noteId);
        break;
    }
  }
}

function apply(step: Step): void {
  if (step.state !== useChronicleStore.getState().chronicle)
    useChronicleStore.setState({ chronicle: step.state });
  if (step.commands.length) execute(step.commands);
}

function nowMinute(): number {
  return useOperationsCampaignStore.getState().elapsedMinutes;
}

/**
 * QC tests keyed by id and time: a replay rewind reuses ids, and a reused id
 * must not hide a new pass or credit an old one. The batch lets the chronicle
 * credit a batch once however often it was retested. Batch ids restart with
 * the plant's counters, so a batch is keyed by the plant run (the material
 * session id, which a saved session keeps) as the campaign's batch credit is.
 */
function qcTestKeys(): ShiftCloseEvidence['qcTests'] {
  const run = useMaterialFlowStore.getState().sessionId;
  return useQCLabStore.getState().qcLab.testHistory.map((test) => ({
    id: `${test.id}@${new Date(test.timestamp).getTime()}`,
    passed: test.passed,
    batchId: test.batchId ? `${run}:${test.batchId}` : test.batchId,
    // Only the player's own test earns in the Chronicle (close-out 3 of plan
    // item 7c): the bench's routine (fix-up d), and a test an agent or the
    // partner ran for the player, are the plant's work and earn nothing. A
    // test that names no source records the bench's.
    ...(test.controlSource === OPERATOR_CONTROL_SOURCE ? {} : { bench: true }),
  }));
}

/**
 * A finished season's id. The workplace keeps none of its own, and a seed alone
 * repeats (a season started from the shift card takes seed 1), so the id pairs
 * it with the revision the season was archived at, which only rises.
 */
const seasonId = (season: WorkplaceState) => `season-${season.seed}-${season.revision}`;

/**
 * Cooperative seasons the workplace has archived (item 5.10), as facts: the
 * engine records each once by its id. Read-only use of the workplace store.
 */
function cooperativeSeasons(): CooperativeSeasonFact[] {
  return useWorkplaceStore.getState().completedCampaigns.flatMap((season) => {
    if (!season.campaign) return [];
    const outcome = campaignOutcomes(season);
    return [
      {
        seasonId: seasonId(season),
        profile: season.campaign.profile,
        delivery: outcome.delivery.status as CooperativeSeasonFact['delivery'],
        agreement: outcome.agreement.status as CooperativeSeasonFact['agreement'],
        sobrasDestination: season.sobras?.destination ?? null,
      },
    ];
  });
}

/**
 * What a dry-first answer's drying would have booked without the Chronicle's
 * drying multiplier, less what it booked (review 2, finding 2): the plans' own
 * formula, `booked * (1 / m - 1)`, `m` the multiplier in force. At `m = 0` (a
 * hired dryer) nothing was booked, so the drying is priced from its energy at
 * the tariff of the answer's hour; an answer given across a tariff change is
 * priced at the later tariff.
 */
function dryingAvoided(chronicle: ChronicleState, booked: number, kwh: number | undefined): number {
  const m = chronicleEffect(effectInput(chronicle), true).dryingEnergyMultiplier;
  if (!(m < 1)) return 0;
  if (m > 0) return booked * (1 / m - 1);
  const energy = typeof kwh === 'number' && Number.isFinite(kwh) ? Math.max(0, kwh) : 0;
  const minuteOfDay = (useGameSimulationStore.getState().gameTime ?? 0) * 60;
  return energy * energyTariffPerKwh(minuteOfDay);
}

function evidenceFor(report: ShiftCampaignReport): ShiftCloseEvidence {
  const campaign = useOperationsCampaignStore.getState();
  return {
    report,
    orders: campaign.orders,
    incidents: campaign.incidents,
    challengeActive: campaign.activeChallenge !== null,
    challengeHistory: campaign.challengeHistory,
    qcTests: qcTestKeys(),
    cooperativeSeasons: cooperativeSeasons(),
  };
}

// Edge state for observe(): the end of a pause re-baselines once, and incident
// notes are checked only when the campaign's incident list changes.
let _wasPaused = false;
let _lastIncidents: unknown = null;

const CROP_KINDS = new Set(['typical', 'bountiful', 'wet', 'dry', 'sprouted']);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

// Memoised plant effect: the tick asks every 500 ms; the answer changes only
// when the chronicle state or the active recipe's grain does.
let _effectState: ChronicleState | null = null;
let _effectWheat = false;
let _effect: ChronicleEffect = NEUTRAL_EFFECT;

const PARTY_IDS = new Set<string>(initialStakeholders().map((party) => party.id));

function isPartyChangeRecord(value: unknown): value is PartyChangeRecord {
  if (!isRecord(value) || !isRecord(value.cause)) return false;
  if (!PARTY_IDS.has(String(value.party))) return false;
  if (!Number.isFinite(value.shift) || !Number.isFinite(value.delta)) return false;
  const cause = value.cause;
  if (cause.kind === 'quota') return typeof cause.met === 'boolean' && Number.isFinite(cause.year);
  return (
    (cause.kind === 'policy' || cause.kind === 'red-line') &&
    POLICY_LADDER_IDS.includes(cause.ladder as PolicyLadder) &&
    (cause.rung === 0 || cause.rung === 1 || cause.rung === 2)
  );
}

/** A saved governance object with its shape checked, or a fresh one for the save's charter. */
function restoreGovernance(chronicle: ChronicleState): GovernanceState {
  const fresh = createGovernance(chronicle.status === 'unsigned' ? null : chronicle.charter);
  const saved = (chronicle as { governance?: unknown }).governance;
  if (!isRecord(saved)) {
    fresh.tally = {
      ...fresh.tally,
      year: chronicle.crop?.index ?? 0,
      knowHowStart: knowHowEarned(chronicle.ledger),
    };
    return fresh;
  }
  const policies = isRecord(saved.policies) ? saved.policies : {};
  const rungOk = (value: unknown): value is 0 | 1 | 2 => value === 0 || value === 1 || value === 2;
  const merged: GovernanceState = {
    ...fresh,
    ...(saved as Partial<GovernanceState>),
    policies: Object.fromEntries(
      POLICY_LADDER_IDS.map((id) => [id, rungOk(policies[id]) ? policies[id] : 1])
    ) as GovernanceState['policies'],
    changedShift: {
      ...fresh.changedShift,
      ...(isRecord(saved.changedShift) ? saved.changedShift : {}),
    },
    streaks: { ...fresh.streaks, ...(isRecord(saved.streaks) ? saved.streaks : {}) },
    reserve: { ...fresh.reserve, ...(isRecord(saved.reserve) ? saved.reserve : {}) },
    tally: { ...fresh.tally, ...(isRecord(saved.tally) ? saved.tally : {}) },
  };
  for (const key of [
    'crew',
    'objections',
    'conditions',
    'countdowns',
    'brokenOff',
    'returns',
  ] as const)
    if (!Array.isArray(merged[key]))
      (merged as unknown as Record<string, unknown>)[key] = fresh[key];
  if (!Array.isArray(merged.tally.gradePoints)) merged.tally.gradePoints = [];
  // A tally saved without its start counts from what was already earned at load.
  if (!Number.isFinite(merged.tally.knowHowStart))
    merged.tally.knowHowStart = knowHowEarned(chronicle.ledger);
  if (merged.crew.length === 0) merged.crew = fresh.crew;
  // Changes outside rulings, for the Partners tab: absent before they were kept,
  // and an entry it could not render is dropped.
  if (Array.isArray(saved.partyChanges))
    merged.partyChanges = saved.partyChanges.filter(isPartyChangeRecord);
  else delete merged.partyChanges;
  if (!isRecord(merged.proposal)) merged.proposal = null;
  if (!isRecord(merged.administration)) merged.administration = null;
  if (!['conventional', 'standards', 'thrift', 'neighbour'].includes(String(merged.brief)))
    merged.brief = 'conventional';
  return merged;
}

export const useChronicleStore = create<ChronicleStore>()(
  persist(
    (set, get) => ({
      chronicle: createInitialState(),
      quiz: null,
      quizRound: 0,
      dialogOpen: false,
      deferredPrompts: [],
      setDeferredPrompts: (ids) => set({ deferredPrompts: ids }),
      temperAnswers: [],
      temperAnswerFor: (cardKey) => {
        const key = `${get().chronicle.charter?.seed ?? 0}:${cardKey}`;
        return get().temperAnswers.find((answer) => answer.key === key);
      },
      setDialogOpen: (open) => {
        if (get().dialogOpen !== open) set({ dialogOpen: open });
      },

      startQuiz: (questionIds) =>
        set((state) => ({
          quiz: questionIds.length
            ? { questionIds, index: 0, score: 0, picked: null, finished: false }
            : null,
          quizRound: state.quizRound + 1,
        })),
      pickQuizAnswer: (optionIndex, correct) => {
        const quiz = get().quiz;
        const questionId = quiz?.questionIds[quiz.index];
        if (!quiz || quiz.finished || quiz.picked !== null || !questionId) return;
        const before = get().chronicle;
        const repeat = quizQuestionAttempted(before, questionId);
        const after = answerQuizQuestion(before, questionId, correct);
        set({
          quiz: {
            ...quiz,
            picked: optionIndex,
            score: quiz.score + (correct ? 1 : 0),
            earned: after.ledger !== before.ledger,
            repeat,
          },
          chronicle: after,
        });
      },
      nextQuizQuestion: () => {
        const quiz = get().quiz;
        if (!quiz || quiz.picked === null) return;
        if (quiz.index + 1 >= quiz.questionIds.length) {
          set({
            quiz: { ...quiz, finished: true },
            chronicle: recordQuizRound(get().chronicle, quiz.score),
          });
          return;
        }
        set({
          quiz: { ...quiz, index: quiz.index + 1, picked: null, earned: null, repeat: false },
        });
      },

      sign: (choice, seed) => {
        // Re-signing hands back anything the previous chronicle still holds.
        apply(releaseHazards(get().chronicle));
        const campaign = useOperationsCampaignStore.getState();
        const step = signCharter(get().chronicle, choice, seed ?? newCharterSeed(), {
          reportId: campaign.reports.at(-1)?.id ?? null,
          qcTestIds: qcTestKeys().map((test) => test.id),
          challengeIds: campaign.challengeHistory.map((run) => run.id),
          orders: campaign.orders,
          incidentIds: campaign.incidents.map((incident) => incident.id),
          seasonIds: cooperativeSeasons().map((season) => season.seasonId),
        });
        apply(step);
        const latest = campaign.reports.at(-1);
        if (latest)
          set({ chronicle: { ...get().chronicle, lastReportEndedAt: latest.endedAtMinute } });
        // Instance ids restart with each charter: no deferral carries over.
        // Nor does a temper answer of an earlier charter (review 2).
        set({ deferredPrompts: [], temperAnswers: [] });
        _wasPaused = false;
      },

      abandon: () => {
        // A fire's stop and owned incidents are released, never stranded.
        apply(releaseHazards(get().chronicle));
        const current = get().chronicle;
        set({
          quiz: null,
          deferredPrompts: [],
          temperAnswers: [],
          chronicle: {
            ...createInitialState(),
            unlockedNotes: current.unlockedNotes,
            readNotes: current.readNotes,
            seenNotes: current.seenNotes,
            quizAnswered: current.quizAnswered,
            quizAttempted: current.quizAttempted ?? [],
            quizBest: current.quizBest,
          },
        });
      },

      observe: (paused) => {
        const state = get().chronicle;
        if (state.status !== 'active') return;
        const campaign = useOperationsCampaignStore.getState();
        const latest = campaign.reports.at(-1);
        if (paused || _wasPaused) {
          // Replays and improvement trials own the clock: what happens in them
          // is not history. Re-baseline on each new report while paused, and
          // once more as the pause ends to absorb its tests and shipments.
          // A replay rewinds the plant without saving it, while the chronicle saves
          // at once: a baseline moved back mid-pause outlives a reload, which then
          // credits the restored report again. Only the pause's end moves it back.
          const ending = !paused;
          _wasPaused = paused;
          const forward =
            state.lastReportEndedAt === null ||
            (latest !== undefined && latest.endedAtMinute > state.lastReportEndedAt);
          if (latest && (ending || (latest.id !== state.lastReportId && forward)))
            set({ chronicle: resyncBaseline(get().chronicle, evidenceFor(latest)) });
          return;
        }
        // The fire stop is the plant's crisis. It is not persisted and a game reset
        // clears it; a chronicle fire without it would charge for a fire that is out.
        const crisis = useGameSimulationStore.getState().crisisState;
        if (state.fire.active && !(crisis.active && crisis.type === 'fire'))
          set({ chronicle: releaseStrandedFire(state) });
        const live = get().chronicle;
        const minute = tickMinute(live, campaign.elapsedMinutes);
        if (minute.state !== live || minute.commands.length) apply(minute);
        if (campaign.incidents !== _lastIncidents) {
          _lastIncidents = campaign.incidents;
          apply(noteIncidents(get().chronicle, campaign.incidents));
          const current = get().chronicle;
          if (current.ownedIncidents.length) {
            const pruned = forgetResolvedIncidents(current, campaign.incidents);
            if (pruned !== current) set({ chronicle: pruned });
          }
        }
        if (!latest || latest.id === get().chronicle.lastReportId) return;
        apply(closeShift(get().chronicle, evidenceFor(latest), EVENT_DECK));
        // A fire this close started is the delegated partner's to answer at once;
        // waiting for the next tick would open the fire dialog for one tick.
        const closed = get().chronicle;
        if (closed.fire.active && !closed.fire.suppressing) {
          const answered = tickMinute(closed, campaign.elapsedMinutes);
          if (answered.state !== closed || answered.commands.length) apply(answered);
        }
      },

      stampDelivery: () => {
        const result = recordDelivery(get().chronicle);
        if (result.state !== get().chronicle) set({ chronicle: result.state });
        if (result.commands.length) execute(result.commands);
        return result.crop;
      },

      getEffect: (wheatRecipe) => {
        const state = get().chronicle;
        if (state.status !== 'active') return NEUTRAL_EFFECT;
        if (state !== _effectState || wheatRecipe !== _effectWheat) {
          _effectState = state;
          _effectWheat = wheatRecipe;
          _effect = chronicleEffect(effectInput(state), wheatRecipe);
        }
        return _effect;
      },

      choose: (instanceId, choiceId) =>
        apply(chooseEventOption(get().chronicle, instanceId, choiceId, 'player', EVENT_DECK)),
      mitigate: (forecastId) => apply(mitigateForecast(get().chronicle, forecastId, 'player')),
      restore: (incidentId) => {
        const incident = useOperationsCampaignStore
          .getState()
          .incidents.find((candidate) => candidate.id === incidentId);
        if (!incident || incident.phase !== 'mitigated' || !incident.effectApplied) return;
        apply(restoreIncident(get().chronicle, incidentId, incident.kind, 'player'));
      },
      plan: (id) => apply(planImprovement(get().chronicle, id)),
      install: (id) => apply(startInstall(get().chronicle, id, 'player')),
      cancel: (id) => apply(cancelInstall(get().chronicle, id)),
      hire: (id) => apply(hireContractor(get().chronicle, id)),
      reverse: (id) => apply(reverseInitiative(get().chronicle, id)),
      answerShortfall: (choice) => apply(resolveShortfall(get().chronicle, choice)),
      setAusterity: (active) => set({ chronicle: setAusterity(get().chronicle, active) }),
      treatCrop: () => apply(treatCropDirectly(get().chronicle, EVENT_DECK)),
      answerTemper: (option, minute, dryingCost, dryingKwh, cardKey) => {
        const chronicle = get().chronicle;
        if (chronicle.status !== 'active' || !chronicle.crop || !Number.isFinite(minute))
          return false;
        // Answered already (a reload restored the plant from before it): the
        // first answer stands and nothing is booked twice.
        const key = cardKey ? `${chronicle.charter?.seed ?? 0}:${cardKey}` : null;
        if (key && get().temperAnswers.some((answer) => answer.key === key)) return true;
        const temper = withTemperAnswer(chronicle.crop.temper, option, minute);
        const finite = (value: number | undefined) =>
          typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
        const dried = option === 'dry-first' ? finite(dryingCost) : 0;
        const avoided = option === 'dry-first' ? dryingAvoided(chronicle, dried, dryingKwh) : 0;
        set({
          ...(key
            ? {
                temperAnswers: [...get().temperAnswers, { key, option, drying: dried }].slice(
                  -TEMPER_ANSWERS_KEPT
                ),
              }
            : {}),
          chronicle: {
            ...chronicle,
            crop: { ...chronicle.crop, temper },
            ...(dried > 0 ? { dryingSinceClose: (chronicle.dryingSinceClose ?? 0) + dried } : {}),
            ...(avoided > 0
              ? { dryingAvoidedSinceClose: (chronicle.dryingAvoidedSinceClose ?? 0) + avoided }
              : {}),
          },
        });
        return true;
      },
      stepTemper: (minute) => {
        const chronicle = get().chronicle;
        const temper = chronicle.crop?.temper;
        if (!temper || !chronicle.crop || !Number.isFinite(minute)) return;
        const next = stepTemperState(temper, minute);
        if (next !== temper)
          set({ chronicle: { ...chronicle, crop: { ...chronicle.crop, temper: next } } });
      },
      suppress: (method = 'suppress') =>
        apply(suppressFire(get().chronicle, nowMinute(), 'player', method)),
      setDelegation: (level) => apply(setDelegation(get().chronicle, level)),
      acceptTraining: () => set({ chronicle: acceptTraining(get().chronicle) }),
      readNote: (noteId) => set({ chronicle: markNoteRead(get().chronicle, noteId) }),
      seeNotes: () => {
        const next = markNotesSeen(get().chronicle);
        if (next !== get().chronicle) set({ chronicle: next });
      },
      answerQuiz: (questionId, correct) =>
        set({ chronicle: answerQuizQuestion(get().chronicle, questionId, correct) }),
      finishQuiz: (score) => set({ chronicle: recordQuizRound(get().chronicle, score) }),
      propose: (ladder, rung) => apply(proposePolicy(get().chronicle, ladder, rung)),
      withdraw: () => set({ chronicle: withdrawProposal(get().chronicle) }),
      meetNeed: (memberId) => apply(meetNeed(get().chronicle, memberId)),
      setBrief: (brief) => apply(setBrief(get().chronicle, brief)),
      setReserveAutofill: (autofill) =>
        set({ chronicle: setReserveAutofill(get().chronicle, autofill) }),
      depositReserve: () => set({ chronicle: depositReserve(get().chronicle) }),
    }),
    {
      name: 'millos-chronicle',
      storage: safeJSONStorage,
      version: 1,
      partialize: (state) => ({
        chronicle: state.chronicle,
        deferredPrompts: state.deferredPrompts,
        temperAnswers: state.temperAnswers,
      }),
      merge: (persisted, current) => {
        const restored = (persisted as { chronicle?: Partial<ChronicleState> } | null)?.chronicle;
        const savedDeferrals = (persisted as { deferredPrompts?: unknown } | null)?.deferredPrompts;
        const deferredPrompts = Array.isArray(savedDeferrals)
          ? savedDeferrals.filter((id): id is string => typeof id === 'string')
          : [];
        if (
          !restored ||
          typeof restored !== 'object' ||
          !['unsigned', 'active', 'ended'].includes(String(restored.status))
        )
          return current;
        const base = createInitialState();
        const chronicle = { ...base, ...restored } as ChronicleState;
        for (const key of Object.keys(base) as Array<keyof ChronicleState>) {
          if (Array.isArray(base[key]) && !Array.isArray(chronicle[key]))
            (chronicle as unknown as Record<string, unknown>)[key] = base[key];
        }
        // Batches whose pass has earned: a save from before they were kept has
        // none, and its first close rebuilds them from the tests it has seen.
        if (Array.isArray(restored.creditedQcBatchIds))
          chronicle.creditedQcBatchIds = restored.creditedQcBatchIds.filter(
            (id): id is string => typeof id === 'string'
          );
        else delete chronicle.creditedQcBatchIds;
        // Quiz first attempts (D19): absent before they were kept, when the
        // answered list stands for them; anything but an id is dropped.
        chronicle.quizAttempted = Array.isArray(restored.quizAttempted)
          ? restored.quizAttempted.filter((id): id is string => typeof id === 'string')
          : [];
        // Cooperative seasons in the record (item 5.10): absent before they were
        // kept, which is none; an entry without a season's shape is dropped.
        if (Array.isArray(restored.cooperativeSeasons))
          chronicle.cooperativeSeasons = restored.cooperativeSeasons.flatMap((value) => {
            const fact = cooperativeSeasonFact(value);
            const shift = (value as { shift?: unknown } | null)?.shift;
            return fact && typeof shift === 'number' && Number.isFinite(shift)
              ? [{ ...fact, shift }]
              : [];
          });
        else delete chronicle.cooperativeSeasons;
        if (Array.isArray(restored.seasonsBeforeCharter))
          chronicle.seasonsBeforeCharter = restored.seasonsBeforeCharter.filter(
            (id): id is string => typeof id === 'string'
          );
        else delete chronicle.seasonsBeforeCharter;
        // Forfeits the relationships have counted: absent before forfeits, which is none.
        if (Array.isArray(restored.orderForfeited))
          chronicle.orderForfeited = restored.orderForfeited.filter(
            (id): id is string => typeof id === 'string'
          );
        else delete chronicle.orderForfeited;
        // What each plan's avoided cost brought (item 4.3): absent before it was
        // kept, which is none; an entry without finite figures is dropped.
        if (isRecord(restored.planSavings)) {
          const savings: Record<string, { last: number; total: number }> = {};
          for (const [id, value] of Object.entries(restored.planSavings))
            if (isRecord(value) && Number.isFinite(value.last) && Number.isFinite(value.total))
              savings[id] = { last: Number(value.last), total: Number(value.total) };
          chronicle.planSavings = savings;
        } else delete chronicle.planSavings;
        // Drying booked since the last close (plan item 7.7): absent is none.
        if (
          typeof restored.dryingSinceClose === 'number' &&
          Number.isFinite(restored.dryingSinceClose) &&
          restored.dryingSinceClose > 0
        )
          chronicle.dryingSinceClose = restored.dryingSinceClose;
        else delete chronicle.dryingSinceClose;
        if (
          typeof restored.dryingAvoidedSinceClose === 'number' &&
          Number.isFinite(restored.dryingAvoidedSinceClose) &&
          restored.dryingAvoidedSinceClose > 0
        )
          chronicle.dryingAvoidedSinceClose = restored.dryingAvoidedSinceClose;
        else delete chronicle.dryingAvoidedSinceClose;
        const ledger: Record<string, unknown> = isRecord(restored.ledger) ? restored.ledger : {};
        chronicle.ledger = {
          ...base.ledger,
          ...ledger,
          fund: { ...base.ledger.fund, ...(isRecord(ledger.fund) ? ledger.fund : {}) },
          knowHow: { ...base.ledger.knowHow, ...(isRecord(ledger.knowHow) ? ledger.knowHow : {}) },
          // A save from before the close and the spending since it were kept apart has no
          // since-close tally, and its last-shift tally mixes the two: drop it rather than
          // show it as the close's. The next close writes a true one.
          lastShiftFund:
            isRecord(ledger.sinceCloseFund) && isRecord(ledger.lastShiftFund)
              ? ledger.lastShiftFund
              : {},
          lastShiftKnowHow:
            isRecord(ledger.sinceCloseFund) && isRecord(ledger.lastShiftKnowHow)
              ? ledger.lastShiftKnowHow
              : {},
          sinceCloseFund: isRecord(ledger.sinceCloseFund) ? ledger.sinceCloseFund : {},
          sinceCloseKnowHow: isRecord(ledger.sinceCloseKnowHow) ? ledger.sinceCloseKnowHow : {},
        };
        // Nested objects the tick reads every 500 ms must have their shape.
        if (!isRecord(chronicle.fire) || typeof chronicle.fire.active !== 'boolean')
          chronicle.fire = base.fire;
        if (!isRecord(chronicle.austerity) || typeof chronicle.austerity.active !== 'boolean')
          chronicle.austerity = base.austerity;
        if (
          chronicle.crop !== null &&
          (!isRecord(chronicle.crop) || !CROP_KINDS.has(String(chronicle.crop.kind)))
        )
          chronicle.crop = null;
        // The temper card's answers (plan item 7.7): absent before tempering,
        // which is the standard temper; dropped if this build cannot read them.
        if (chronicle.crop && 'temper' in chronicle.crop) {
          const { temper, ...crop } = chronicle.crop;
          const read = sanitizeTemper(temper);
          chronicle.crop = read ? { ...crop, temper: read } : crop;
        }
        if (
          chronicle.status !== 'unsigned' &&
          (!isRecord(chronicle.charter) || typeof chronicle.charter.seed !== 'number')
        )
          return current;
        // A short chronicle saves its length (item 4.2); absent, or anything else,
        // is the full 63-shift one, as every save from before lengths is.
        if (isRecord(chronicle.charter) && 'length' in chronicle.charter) {
          const { length, ...charter } = chronicle.charter;
          chronicle.charter = length === 'short' ? { ...charter, length } : charter;
        }
        // Where an Inspection run broke (item 4.5): absent before it, and dropped
        // if it has not the shape the failure notice reads.
        chronicle.trials = chronicle.trials.map((progress) => {
          const broken = (progress as { brokenAt?: unknown }).brokenAt;
          if (broken === undefined) return progress;
          const causes = isRecord(broken) && Array.isArray(broken.causes) ? broken.causes : null;
          if (
            isRecord(broken) &&
            Number.isFinite(broken.shift) &&
            causes?.every((cause) => cause === 'qc' || cause === 'quality' || cause === 'incident')
          )
            return progress;
          const rest = { ...progress };
          delete rest.brokenAt;
          return rest;
        });
        // Part two (docs/CHRONICLE.md, systems 16-24). A chronicle saved before
        // it has none of these: give it the organisations and a certifier, and
        // pass over scheduled events whose shift has gone, so they do not all
        // arrive at the next close.
        if (!isRecord(chronicle.marks)) chronicle.marks = {};
        if (
          !isRecord(chronicle.certifier) ||
          typeof chronicle.certifier.score !== 'number' ||
          typeof chronicle.certifier.suspended !== 'boolean'
        )
          chronicle.certifier = base.certifier;
        // Passes awaiting the certifier's review at the year's turn: absent before
        // it read the record periodically (item 4.9), and dropped if malformed.
        const review = (chronicle.certifier as { review?: unknown }).review;
        if (
          review !== undefined &&
          !(
            isRecord(review) &&
            Number.isFinite(review.batches) &&
            Number.isFinite(review.hundredths)
          )
        )
          chronicle.certifier = {
            score: chronicle.certifier.score,
            suspended: chronicle.certifier.suspended,
          };
        // The desks of attention were cut (D10); a save from before keeps its
        // `desks`, which nothing reads, so it is dropped rather than carried.
        delete (chronicle as { desks?: unknown }).desks;
        if (typeof chronicle.longNightTelegraphed !== 'boolean')
          chronicle.longNightTelegraphed = base.longNightTelegraphed;
        if (chronicle.status !== 'unsigned' && chronicle.stakeholders.length === 0)
          chronicle.stakeholders = initialStakeholders();
        // Part three (docs/CHRONICLE.md, systems 25-32). A chronicle saved before it
        // starts on the middle step of every ladder, with its own crew and an empty
        // reserve; its first return covers the shifts from loading to the year's turn.
        chronicle.governance = restoreGovernance(chronicle);
        if (chronicle.status !== 'unsigned' && !Array.isArray(restored.firedScheduled))
          chronicle.firedScheduled = EVENT_DECK.filter(
            (event) => event.scheduled && event.scheduled.shift <= chronicle.shift
          ).map((event) => event.id);
        chronicle.forecasts = chronicle.forecasts.map((forecast) => ({
          ...forecast,
          paidFund: typeof forecast.paidFund === 'number' ? forecast.paidFund : 0,
          // A chronicle saved after it ended, before the end settled its forecasts.
          ...(chronicle.status === 'ended' && forecast.status === 'pending'
            ? { status: 'passed' as const }
            : {}),
        }));
        // Nor does an ended chronicle still ask for upkeep.
        if (chronicle.status === 'ended') chronicle.upkeepShortfall = null;
        // Datalinks rebuilds its own unlocked set from this list on load.
        for (const noteId of chronicle.unlockedNotes)
          useKnowledgeStore.getState().unlockEntry(noteId);
        // Nor leaves an install a closing-shift snag stranded "installing".
        // The temper answers booked (absent before they were kept): an entry
        // without a key, an option and a drying figure is dropped.
        const savedAnswers = (persisted as { temperAnswers?: unknown } | null)?.temperAnswers;
        const temperAnswers = Array.isArray(savedAnswers)
          ? savedAnswers
              .filter(
                (answer): answer is TemperAnswerRecord =>
                  !!answer &&
                  typeof answer.key === 'string' &&
                  (answer.option === 'standard' || answer.option === 'dry-first') &&
                  typeof answer.drying === 'number' &&
                  Number.isFinite(answer.drying)
              )
              .slice(-TEMPER_ANSWERS_KEPT)
          : [];
        return {
          ...current,
          chronicle: chronicle.status === 'ended' ? settleUnfinishedInstalls(chronicle) : chronicle,
          deferredPrompts,
          temperAnswers,
        };
      },
    }
  )
);

// A history note read in Datalinks earns the same know-how as one read in the
// Chronicle workspace; markNoteRead ignores anything already counted.
useKnowledgeStore.subscribe((state, previous) => {
  if (state.readEntries === previous.readEntries) return;
  for (const id of state.readEntries) {
    if (!previous.readEntries.has(id)) useChronicleStore.getState().readNote(id);
  }
});
