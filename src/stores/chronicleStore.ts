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
import { useQCLabStore } from './qcLabStore';
import { useKnowledgeStore } from './knowledgeStore';
import { EVENT_DECK } from '../chronicle/eventDeck';
import { chronicleEffect, NEUTRAL_EFFECT } from '../chronicle/effects';
import { newCharterSeed } from '../chronicle/rng';
import { initialStakeholders } from '../chronicle/stakeholders';
import { createGovernance, POLICY_LADDER_IDS } from '../chronicle/governance';
import { knowHowEarned } from '../chronicle/ledger';
import {
  acceptTraining,
  answerQuizQuestion,
  cancelInstall,
  chooseEventOption,
  closeShift,
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
import type {
  BriefId,
  Charter,
  ChronicleCommand,
  ChronicleEffect,
  CrewRoleId,
  CropAttributes,
  DelegationLevel,
  GovernanceState,
  PolicyLadder,
  PolicyRung,
} from '../chronicle/types';

export interface QuizRound {
  questionIds: string[];
  index: number;
  score: number;
  picked: number | null;
  finished: boolean;
}

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
 * must not hide a new pass or credit an old one.
 */
function qcTestKeys(): Array<{ id: string; passed: boolean }> {
  return useQCLabStore.getState().qcLab.testHistory.map((test) => ({
    id: `${test.id}@${new Date(test.timestamp).getTime()}`,
    passed: test.passed,
  }));
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
        set({
          quiz: { ...quiz, picked: optionIndex, score: quiz.score + (correct ? 1 : 0) },
          chronicle: answerQuizQuestion(get().chronicle, questionId, correct),
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
        set({ quiz: { ...quiz, index: quiz.index + 1, picked: null } });
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
        });
        apply(step);
        const latest = campaign.reports.at(-1);
        if (latest)
          set({ chronicle: { ...get().chronicle, lastReportEndedAt: latest.endedAtMinute } });
        // Instance ids restart with each charter: no deferral carries over.
        set({ deferredPrompts: [] });
        _wasPaused = false;
      },

      abandon: () => {
        // A fire's stop and owned incidents are released, never stranded.
        apply(releaseHazards(get().chronicle));
        const current = get().chronicle;
        set({
          quiz: null,
          deferredPrompts: [],
          chronicle: {
            ...createInitialState(),
            unlockedNotes: current.unlockedNotes,
            readNotes: current.readNotes,
            seenNotes: current.seenNotes,
            quizAnswered: current.quizAnswered,
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
        if (
          chronicle.status !== 'unsigned' &&
          (!isRecord(chronicle.charter) || typeof chronicle.charter.seed !== 'number')
        )
          return current;
        // Part two (docs/CHRONICLE.md, systems 16-24). A chronicle saved before
        // it has none of these: give it the organisations, a certifier and desks,
        // and pass over scheduled events whose shift has gone, so they do not
        // all arrive at the next close.
        if (!isRecord(chronicle.marks)) chronicle.marks = {};
        if (
          !isRecord(chronicle.certifier) ||
          typeof chronicle.certifier.score !== 'number' ||
          typeof chronicle.certifier.suspended !== 'boolean'
        )
          chronicle.certifier = base.certifier;
        if (
          !isRecord(chronicle.desks) ||
          !(['works', 'trade', 'council'] as const).every(
            (desk) =>
              isRecord(chronicle.desks[desk]) &&
              (['points', 'room', 'spent'] as const).every((key) =>
                Number.isFinite(chronicle.desks[desk][key])
              )
          )
        )
          chronicle.desks = base.desks;
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
        return {
          ...current,
          chronicle: chronicle.status === 'ended' ? settleUnfinishedInstalls(chronicle) : chronicle,
          deferredPrompts,
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
