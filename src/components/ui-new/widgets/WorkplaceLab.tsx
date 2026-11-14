import {
  WorkplaceParticipation,
  WorkplaceFairness,
  WorkplaceDemonstration,
  WorkplaceAutomaticDemo,
} from './WorkplaceParticipation';
import React, { useId, useRef, useState } from 'react';
import { WorkplaceStep, lookAtRefusingRole } from './WorkplaceStep';
import { workplaceStepMessages } from './WorkplaceStep.messages';
import { WorkplaceImprovementPanel } from './WorkplaceImprovementPanel';
import { workplaceMission } from '../../../simulation/workplaceImprovement';
import { WorkplacePressureChapter } from './WorkplacePressureChapter';
import { WorkplacePracticeProposal } from './WorkplaceNegotiation';
import {
  FollowOnNotice,
  WorkplaceCampaignArchive,
  WorkplaceLeaveSeason,
} from './WorkplaceCampaignArchive';
import { WorkplaceReplay, WorkplaceReplayGuide, WorkplaceReplayResume } from './WorkplaceReplay';
import {
  forecastWorkplacePlansNow,
  pendingFollowOn,
  planPlantEffect,
  useWorkplaceStore,
  useWorkplaceControls,
  workplaceReasonText,
} from '../../../stores/workplaceStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import {
  PRACTICES,
  WORKPLACE_PLANS,
  workplaceCapacity,
  workplaceAlternatives,
  workplaceReadiness,
  compareWorkplacePlans,
  compareManagementApproaches,
  exportWorkplace,
  displayEventDetail,
  workplaceActorName,
} from '../../../simulation/bilateralWorkplace';
import {
  CAMPAIGN_SHIFTS,
  WORKPLACE_CHECKS,
  requiredChecks,
  campaignTotals,
  campaignComplete,
  campaignOutcomes,
  campaignLearningReview,
  campaignStory,
  MANAGEMENT_APPROACHES,
  campaignPressure,
  campaignRelationship,
  pressureObjectionText,
  shiftResumable,
  campaignShiftPause,
  formatKg,
  missionDelivery,
  mondayHolds,
  seasonSobrasPool,
  sobrasSettlement,
} from '../../../simulation/workplaceCampaign';
import { executeAgentCommand } from '../../../agent/client/executeAgentCommand';
import { formatFixed, formatGrouped, getLocale, translate, useT } from '../../../i18n';
import { workplaceLabMessages as messages } from './WorkplaceLab.messages';
import { bilateralWorkplaceMessages } from '../../../simulation/bilateralWorkplace.messages';
import { workplaceImprovementPanelMessages as improvementMessages } from './WorkplaceImprovementPanel.messages';
import type {
  ObjectionKind,
  WorkplaceProfile,
  WorkplaceAnswer,
  SurplusDestination,
  WorkplaceMode,
  WorkplaceTransitionResult,
} from '../../../types/workplace';
import type { PlanForecast } from '../../../simulation/workplaceForecast';
import { STANDARD_GAME_SPEED } from '../../../simulation/pace';
import { customerDisplayName } from '../../../stores/customerNames';

/**
 * 5.1: everything that is not the next step (participation mode, the guide,
 * replay, exports, the tabs) sits behind one disclosure in a solo season.
 * Elsewhere (workshop, pilot, separate turns, a handoff) the tools are the
 * screen, as before.
 */
const ToolsDisclosure: React.FC<{ on: boolean; label: string; children: React.ReactNode }> = ({
  on,
  label,
  children,
}) =>
  on ? (
    <details className="border-t border-slate-700 pt-3">
      <summary className="min-h-11 cursor-pointer py-2 font-semibold text-cyan-100">
        {label}
      </summary>
      <div className="mt-3 space-y-4">{children}</div>
    </details>
  ) : (
    <>{children}</>
  );
// 44 px (min-h-11), the repo's touch size: at min-h-9 every lab control was 36 px.
const buttonClass =
  'min-h-11 rounded-md border border-cyan-300/25 px-2 py-1.5 text-xs font-medium text-cyan-100 hover:bg-cyan-900/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:opacity-50';
const inputClass =
  'min-h-11 w-full min-w-0 rounded-md border border-slate-600 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:opacity-50';
const sections = [
  'Handoff',
  'Shift',
  'Practices',
  'Agreement / Voices',
  'Review',
  'Experiment',
] as const;
const modes: { value: WorkplaceMode; labelKey: 'modeGame' | 'modeWorkshop' | 'modePilot' }[] = [
  { value: 'game', labelKey: 'modeGame' },
  { value: 'workshop', labelKey: 'modeWorkshop' },
  { value: 'pilot', labelKey: 'modePilot' },
];
/** Integers and authored decimals exactly as String(n) renders them in English. */
const formatPlain = (value: number) =>
  Number.isInteger(value)
    ? formatFixed(value, 0)
    : getLocale() === 'en'
      ? String(value)
      : formatGrouped(value, { maximumFractionDigits: 6 });
type LabMessageKey = {
  [K in keyof typeof messages.en]: (typeof messages.en)[K] extends string ? K : never;
}[keyof typeof messages.en];
/** A keyed transition result, a laboratory acknowledgement, or free text kept as written. */
type LabFeedback = string | WorkplaceTransitionResult | { labKey: LabMessageKey };
const kinds: ObjectionKind[] = ['rest', 'burden', 'privacy', 'authority'];
const destinations: SurplusDestination[] = ['members', 'reserve', 'community'];

export const WorkplaceLab: React.FC = () => {
  const t = useT(messages);
  const tStep = useT(workplaceStepMessages);
  const startRefusalId = useId();
  // D14: why Continue is held, printed at it (was a paragraph above the review).
  const continueHeldId = useId();
  const [startRefusal, setStartRefusal] = useState<WorkplaceTransitionResult | null>(null);
  const labRef = useRef<HTMLElement>(null);
  const objectionTargets = useRef(new Map<string, HTMLDivElement>());
  const store = useWorkplaceControls();
  const state = store.workplace;
  // 5.1: a solo game season (or the idle game it starts from) shows the next
  // step only; the rest is behind the facilitator disclosure.
  const stepMode =
    store.participationMode === 'solo' &&
    state.mode === 'game' &&
    !state.improvement &&
    (!!state.campaign || state.phase === 'idle');
  // A season that has ended opens on its Review, where the season debrief
  // on the HUD sends the player. Working if "Read the season debrief" lands there.
  const [section, setSection] = useState<(typeof sections)[number]>(
    state.improvement
      ? 'Handoff'
      : state.phase === 'review' && state.campaign?.shift === 2 && !shiftResumable(state)
        ? 'Review'
        : 'Shift'
  );
  const sectionNavRef = useRef<HTMLDivElement>(null);
  // A control that unmounts itself (a section change from inside a section, a
  // guide that ends, a resume that hides) drops focus to <body>, where Space is
  // the forklift emergency stop. Focus lands on the open section's tab instead.
  // Working if Tab and Space continue from the laboratory after such a control.
  const keepFocus = () =>
    requestAnimationFrame(() => {
      const active = document.activeElement;
      // A control that disabled itself (approve, once the agreement runs) has
      // lost focus too: a browser moves it to <body>.
      if (active && active !== document.body && !(active as HTMLButtonElement).disabled) return;
      const tab = sectionNavRef.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
      // Behind a closed disclosure the tabs cannot take focus: the step can.
      if (tab && tab.closest('details:not([open])') === null) tab.focus({ preventScroll: true });
      else
        labRef.current
          ?.querySelector<HTMLElement>('[data-step-focus]')
          ?.focus({ preventScroll: true });
    });
  const navigateKeepingFocus = (name: (typeof sections)[number]) => {
    setSection(name);
    keepFocus();
  };
  const [mode, setMode] = useState<WorkplaceMode>(state.mode);
  const [profile, setProfile] = useState<WorkplaceProfile>('toe-dip');
  const [seed, setSeed] = useState(String(state.seed));
  // Kept keyed and resolved at render, so the status line reads in the language
  // chosen after it was set; only free text (agent receipts) stays as written.
  // Working if a refusal or "Recorded" follows a language switch.
  const [feedback, setFeedback] = useState<LabFeedback | null>(null);
  const feedbackText =
    feedback === null
      ? null
      : typeof feedback === 'string'
        ? feedback
        : 'labKey' in feedback
          ? t(feedback.labKey)
          : workplaceReasonText(feedback);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [selectedActor, setActor] = useState(state.members[0]?.id ?? 'mind');
  const actor =
    store.participationMode === 'separate-turns' ? (store.turn?.actorId ?? '') : selectedActor;
  const [kind, setKind] = useState<ObjectionKind>('rest');
  const [resolvers, setResolvers] = useState<Record<string, string>>({});
  const [selectedVoter, setVoter] = useState(state.members[0]?.id ?? '');
  const voter =
    store.participationMode === 'separate-turns' ? (store.turn?.actorId ?? '') : selectedVoter;
  const [candidate, setCandidate] = useState(state.members[0]?.id ?? '');
  const [destination, setDestination] = useState<SurplusDestination>('reserve');
  const [comparison, setComparison] = useState<ReturnType<typeof compareWorkplacePlans> | null>(
    null
  );
  const [showManagementComparison, setShowManagementComparison] = useState(false);
  // 5.6: kept from the press; six flow simulations are not run per render.
  const [plantForecast, setPlantForecast] = useState<PlanForecast[] | null>(null);
  const plan = WORKPLACE_PLANS.find((item) => item.id === state.planId)!;
  const readiness = workplaceReadiness(state);
  const alternatives = workplaceAlternatives(state);
  const campaign = state.campaign;
  const episode = campaign ? CAMPAIGN_SHIFTS[campaign.shift] : null;
  const pressure = campaign ? (campaignPressure(state) ?? null) : null;
  const relationship = campaign ? campaignRelationship(state) : [];
  const totals = campaign ? campaignTotals(state) : null;
  const outcomes = campaign ? campaignOutcomes(state) : null;
  const learningReview = campaignLearningReview(state);
  const mission = workplaceMission(state);
  // The order the next shift would link, re-read as orders move; "from the
  // next shift" is promised only when there is one and a next shift.
  const nextLinkCustomer = useOperationsCampaignStore(
    () => pendingFollowOn(state)?.customer ?? null
  );
  const displayTarget = mission?.targetKg ?? state.targetKg;
  const configuring = state.phase === 'idle' || state.phase === 'deliberating';
  const canConfigure = state.phase === 'deliberating';
  const pilot = state.mode === 'pilot';
  const manual = state.phase === 'deliberating' && !pilot;
  const safeSeed = Number(seed);
  const validSeed = Number.isSafeInteger(safeSeed) && safeSeed >= 1 && safeSeed <= 2147483647;
  // A held seed control says why, at the seed and on each control it holds.
  const seedErrorId = useId();
  const seedHeld = (place: 'setup' | 'experiment') =>
    validSeed ? undefined : `${seedErrorId}-${place}`;
  const seedError = (place: 'setup' | 'experiment') =>
    validSeed ? null : (
      <p id={`${seedErrorId}-${place}`} role="alert" className="text-amber-100">
        {t('seedInvalid', { max: formatGrouped(2147483647) })}
      </p>
    );
  // A held control says why, in the engine's own refusal (the words a press
  // would get back), shown only while it holds and named by aria-describedby.
  // Pilot holds every role decision (rejPilot); otherwise each control's own.
  const heldId = useId();
  type RefusalKey = keyof (typeof bilateralWorkplaceMessages)['en'] & `rej${string}`;
  const refusal = (key: RefusalKey | null): string | null =>
    key ? (translate as (c: unknown, k: string) => string)(bilateralWorkplaceMessages, key) : null;
  const heldBy = (name: string, reason: string | null) => ({
    describedBy: reason ? `${heldId}-${name}` : undefined,
    line: reason ? (
      <p id={`${heldId}-${name}`} className="text-amber-100">
        {reason}
      </p>
    ) : null,
  });
  const roleHold = (key: RefusalKey) => refusal(pilot ? 'rejPilot' : key);
  // The season's call: a solo season makes it at its role's own step; shifts
  // 0 and 2 take it while deliberating (Monday's hold has its own line).
  const choiceHeld = heldBy(
    'choice',
    !campaign
      ? null
      : store.participationMode === 'solo' && state.mode === 'game'
        ? refusal('rejDecisionRole')
        : campaign.shift !== 1 && !manual
          ? roleHold('rejDifferentResponse')
          : null
  );
  const pressureHeld = heldBy('pressure', manual ? null : roleHold('rejPressureCard'));
  // In the voices section a pilot hold names its one "pilot denies" line.
  const memberHeld = (name: string, held: boolean, key: RefusalKey) =>
    !held
      ? heldBy(name, null)
      : pilot
        ? { describedBy: `${heldId}-pilot`, line: null }
        : heldBy(name, refusal(key));
  // Cover consent: only under a plan with cover minutes, while deliberating.
  const coverHeld = (memberId: string) =>
    memberHeld(`cover-${memberId}`, !manual || plan.optionalCoverMinutes === 0, 'rejCoverConsent');
  const shareHeld = (memberId: string) =>
    memberHeld(
      `share-${memberId}`,
      pilot || state.phase === 'idle' || state.phase === 'review',
      'rejShare'
    );
  const objectHeld = heldBy(
    'object',
    pilot || !['deliberating', 'active'].includes(state.phase) ? roleHold('rejObjectRole') : null
  );
  const chairHeld = heldBy(
    'chair',
    pilot ||
      !state.practices.includes('cooperative') ||
      state.phase !== 'deliberating' ||
      state.governance !== 'member-vote'
      ? roleHold('rejElect')
      : null
  );
  // Resolving an objection: in a pilot, or on another role's separate turn,
  // the select cannot fix it, so the refusal says why. Shared, the select's
  // "choose the original author" names the step.
  const resolveHeld = (objectionId: string, authorId: string) =>
    heldBy(
      `resolve-${objectionId}`,
      pilot
        ? refusal('rejPilot')
        : store.participationMode === 'separate-turns' && actor !== authorId
          ? refusal('rejResolveRaiser')
          : null
    );
  const hearHeld = heldBy(
    'hear',
    !manual
      ? roleHold('rejSimulateMode')
      : store.participationMode === 'separate-turns'
        ? t('heldSeparateTurns')
        : null
  );
  // Restating the protected terms is also open in review while its objection is.
  const restateHeld =
    !manual &&
    !(
      state.phase === 'review' &&
      state.objections.some(
        (objection) => objection.status === 'open' && objection.statement === pressure?.objection
      )
    );
  // 5.5: the season's sobras, every shift together (settled: as settled).
  const surplus = seasonSobrasPool(state);
  // The engine accepts surplus ballots and allocation only under the
  // 'gainsharing' practice. Working if neither control is offered without it.
  const sharedSurplus = state.practices.includes('gainsharing');
  // The surplus controls: a charter without gainsharing, no surplus and a
  // finished allocation each have their own line; otherwise the phase holds.
  const surplusHeldBySurplus = !sharedSurplus
    ? `${heldId}-surplus-charter`
    : state.distributionComplete
      ? `${heldId}-surplus-done`
      : surplus <= 0
        ? `${heldId}-surplus-none`
        : null;
  const surplusPhaseHeld = heldBy(
    'surplus-phase',
    !surplusHeldBySurplus && (pilot || state.phase !== 'review') ? roleHold('rejSurplusVote') : null
  );
  const surplusHeld = surplusHeldBySurplus ?? surplusPhaseHeld.describedBy;
  const modeLabelKey = modes.find((item) => item.value === state.mode)?.labelKey;
  const freshExercise = () => {
    navigateKeepingFocus('Shift');
    setMode('game');
    setSeed(String(useWorkplaceStore.getState().workplace.seed));
    setFeedback({ labKey: 'freshExercise' });
    setReceipt(null);
  };
  const report = (result: WorkplaceTransitionResult) => {
    setFeedback(result.reason ? result : { labKey: result.changed ? 'recorded' : 'noChange' });
    setReceipt(null);
  };
  const begin = () => {
    if (!validSeed) return;
    const result = store.start(mode, safeSeed);
    report(result);
    // A start ends only the player's own pause (D-106, review 2).
    if (result.changed && mode === 'game') {
      useGameSimulationStore.getState().choosePace(15);
    }
    // Starting closes the idle form this control sits in.
    keepFocus();
  };
  const beginCampaign = () => {
    if (!validSeed || mode !== 'game' || state.phase !== 'idle') return;
    const result = store.startCampaign(profile, safeSeed);
    report(result);
    // A refusal (D4: not before the first delivery) shows at this button.
    setStartRefusal(result.changed ? null : result);
    if (result.changed) useGameSimulationStore.getState().choosePace(STANDARD_GAME_SPEED);
    keepFocus();
  };
  // A standalone exercise's only way back to the setup form (mode, seed,
  // season). It removes the Review control that ran it, so focus moves on.
  const returnToSetup = () => {
    const result = store.endExercise(state.revision);
    if (!result.changed) return report(result);
    navigateKeepingFocus('Shift');
    setMode('game');
    setSeed(String(useWorkplaceStore.getState().workplace.seed));
    setFeedback({ labKey: 'setupReturned' });
    setReceipt(null);
  };
  const nextShift = () => {
    const result = store.nextCampaignShift();
    report(result);
    if (result.changed) navigateKeepingFocus('Shift');
  };
  const comprehension = (actorId: string, role: string) => (
    <fieldset
      className="space-y-2"
      disabled={
        !manual || (store.participationMode === 'separate-turns' && store.turn?.actorId !== actorId)
      }
    >
      <legend className="font-semibold text-white">{t('understandingChecks', { role })}</legend>
      {WORKPLACE_CHECKS.filter((check) => requiredChecks(actorId).includes(check.id)).map(
        (check) => (
          <label key={check.id} className="block">
            {check.prompt}
            <select
              aria-label={t('checkAria', { role, prompt: check.prompt })}
              aria-invalid={
                campaign?.checks[actorId]?.[check.id]
                  ? campaign.checks[actorId][check.id] !== check.correct
                  : undefined
              }
              aria-describedby={
                campaign?.checks[actorId]?.[check.id]
                  ? `check-answer-${actorId}-${check.id}`
                  : undefined
              }
              className={inputClass}
              value={campaign?.checks[actorId]?.[check.id] ?? ''}
              onChange={(event) =>
                report(store.answerCheck(actorId, check.id, event.target.value as WorkplaceAnswer))
              }
            >
              <option value="" disabled>
                {t('selectAnswer')}
              </option>
              {check.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {campaign?.checks[actorId]?.[check.id] && (
              <span
                id={`check-answer-${actorId}-${check.id}`}
                aria-live="polite"
                className="mt-1 block whitespace-normal break-words text-slate-300"
              >
                {
                  check.options.find(
                    (option) => option.value === campaign.checks[actorId]?.[check.id]
                  )?.label
                }
                <span
                  className={`mt-1 block ${campaign.checks[actorId]?.[check.id] === check.correct ? 'text-cyan-100' : 'text-amber-100'}`}
                >
                  <strong>
                    {campaign.checks[actorId]?.[check.id] === check.correct
                      ? t('matchesTerms')
                      : t('needsAnotherLook')}
                  </strong>
                  {check.clarification}
                </span>
              </span>
            )}
          </label>
        )
      )}
    </fieldset>
  );
  /** Runs the approval; returns what it said, so a refusal can show at its button. */
  const activate = async (): Promise<string | null> => {
    if (busyRef.current) return null;
    if (state.mode === 'workshop') {
      report(store.activate(state.revision));
      return null;
    }
    busyRef.current = true;
    setBusy(true);
    setFeedback(null);
    setReceipt(null);
    try {
      const result = await executeAgentCommand(
        {
          capabilityId: 'workplace.activate-plan',
          targetUri: 'millos://simulation/local',
          parameters: { revision: state.revision },
          reason: `Run the ${plan.title} agreement at workplace revision ${state.revision}, with recorded role understanding, policy votes and separate optional-cover consent.`,
        },
        {
          approveIfRequired: true,
          approvalReason: `Explicit approval of the ${plan.title} workplace agreement at revision ${state.revision}.`,
        }
      );
      const problems = [...result.preview.problems, ...(result.receipt?.problems ?? [])];
      const said = [
        translate(messages, 'previewStatus', { status: result.preview.status }),
        result.receipt
          ? translate(messages, 'executionStatus', { status: result.receipt.status })
          : translate(messages, 'noExecutionReceipt'),
        ...result.preview.authority.reasons,
        ...problems.map((problem) => problem.message),
      ].join(' ');
      setFeedback(said);
      if (result.receipt) setReceipt(result.receipt.receiptId);
      return said;
    } catch (error) {
      const said = error instanceof Error ? error.message : String(error);
      setFeedback(said);
      return said;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const advanceWorkshop = () => {
    const before = useWorkplaceStore.getState().workplace;
    store.tick(5, 0, false);
    const changed = useWorkplaceStore.getState().workplace !== before;
    setFeedback({ labKey: changed ? 'rehearsalAdvanced' : 'rehearsalNoAdvance' });
    setReceipt(null);
    // The last step (shift end, recovery delivered) removes this control.
    keepFocus();
  };
  const replay = () => {
    const result = store.start(state.mode, state.seed);
    report(result);
    if (result.changed && state.mode === 'game') useGameSimulationStore.getState().choosePace(15);
    if (result.changed) navigateKeepingFocus('Shift');
  };
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(exportWorkplace(state), null, 2)], { type: 'application/json' })
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `millos-workplace-${state.seed}-r${state.revision}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setFeedback({ labKey: 'exported' });
  };

  return (
    <section
      ref={labRef}
      aria-label={t('labTitle')}
      className="min-w-0 space-y-4 rounded-xl border border-cyan-300/25 bg-slate-950 p-3 text-xs leading-relaxed text-slate-200 selection:bg-cyan-800 selection:text-white"
    >
      <header>
        <h3 className="text-base font-semibold text-white">{t('labTitle')}</h3>
      </header>
      {stepMode && (
        <>
          <WorkplaceStep activate={activate} busy={busy} />
          <WorkplaceCampaignArchive onFreshExercise={freshExercise} />
        </>
      )}
      <ToolsDisclosure on={stepMode} label={tStep('facilitatorTools')}>
        <WorkplaceParticipation report={report} />
        <WorkplaceAutomaticDemo profile={profile} />
        <WorkplaceDemonstration navigate={setSection} report={report} />
        <div ref={sectionNavRef} className="flex flex-wrap gap-1" aria-label={t('sectionsLabel')}>
          {sections.map((name) => (
            <button
              key={name}
              type="button"
              aria-pressed={section === name}
              className={`${buttonClass} ${section === name ? 'bg-cyan-900/50' : ''}`}
              onClick={() => {
                setSection(name);
                labRef.current?.scrollIntoView?.({ block: 'start', behavior: 'instant' });
              }}
            >
              {t('sectionLabel', { section: name })}
            </button>
          ))}
        </div>
        <p className="text-cyan-100" role="status">
          {t('statusLine', {
            mode: modeLabelKey ? t(modeLabelKey) : '',
            phase: t('phaseLabel', { phase: state.phase }),
            minute: formatFixed(state.minute, 1),
            duration: formatPlain(state.durationMinutes),
            revision: formatPlain(state.revision),
          })}
        </p>
        {feedbackText && (
          <p role="status" className="break-words text-amber-100">
            {feedbackText}
          </p>
        )}
        {receipt && <p className="break-all text-cyan-100">{t('causalReceipt', { receipt })}</p>}

        {section === 'Handoff' && (
          <WorkplaceImprovementPanel
            onSeasonStart={() => navigateKeepingFocus('Shift')}
            onReviewObjection={(id) => {
              setSection('Agreement / Voices');
              requestAnimationFrame(() => {
                const target = objectionTargets.current.get(id);
                target?.scrollIntoView?.({ block: 'start', behavior: 'instant' });
                target?.focus({ preventScroll: true });
              });
            }}
            profile={profile}
            setProfile={setProfile}
            mode={mode}
            setMode={setMode}
            activate={activate}
            busy={busy}
            report={report}
          />
        )}
        {section === 'Shift' && (
          <div className="space-y-2 border-b border-slate-700 pb-4">
            <button
              type="button"
              className={buttonClass}
              onClick={() => navigateKeepingFocus('Handoff')}
            >
              {t('openHandoff')}
            </button>
          </div>
        )}
        <WorkplaceReplayGuide
          section={section === 'Handoff' ? 'Shift' : section}
          navigate={navigateKeepingFocus}
          onClosed={keepFocus}
        />
        <WorkplaceReplayResume onResumed={keepFocus} />
        <WorkplacePressureChapter state={state} navigate={setSection} />
        {!stepMode && <WorkplaceCampaignArchive onFreshExercise={freshExercise} />}
        <WorkplaceLeaveSeason onLeft={freshExercise} />

        {section === 'Shift' && (
          <div className="space-y-4">
            {state.phase === 'idle' && (
              <div className="space-y-2">
                <label className="block">
                  {t('mode')}
                  <select
                    aria-label={t('mode')}
                    className={inputClass}
                    value={mode}
                    onChange={(e) => setMode(e.target.value as WorkplaceMode)}
                  >
                    {modes.map((item) => (
                      <option key={item.value} value={item.value}>
                        {t(item.labelKey)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  {t('scenarioSeed')}
                  <input
                    className={inputClass}
                    type="number"
                    min="1"
                    max="2147483647"
                    value={seed}
                    aria-invalid={!validSeed || undefined}
                    aria-describedby={seedHeld('setup')}
                    onChange={(e) => setSeed(e.target.value)}
                  />
                </label>
                {seedError('setup')}
                {mode === 'game' && !stepMode && (
                  <div className="space-y-2 border-b border-slate-700 pb-4">
                    <h4 className="font-semibold text-white">{t('livingCooperative')}</h4>
                    <label className="block">
                      {t('adoptionProfile')}
                      <select
                        aria-label={t('adoptionProfile')}
                        className={inputClass}
                        value={profile}
                        onChange={(event) => setProfile(event.target.value as WorkplaceProfile)}
                      >
                        {MANAGEMENT_APPROACHES.map((approach) => (
                          <option key={approach.id} value={approach.id}>
                            {approach.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className={`${buttonClass} bg-cyan-900/60`}
                      disabled={!validSeed}
                      aria-describedby={
                        startRefusal ? `${startRefusalId}-start` : seedHeld('setup')
                      }
                      onClick={beginCampaign}
                    >
                      {t('startCampaign')}
                    </button>
                    {startRefusal?.reason && (
                      <p
                        id={`${startRefusalId}-start`}
                        role="alert"
                        className="break-words text-amber-100"
                      >
                        {workplaceReasonText(startRefusal)}
                      </p>
                    )}
                  </div>
                )}
                <button
                  className={buttonClass}
                  disabled={!validSeed}
                  aria-describedby={seedHeld('setup')}
                  onClick={begin}
                >
                  {mode === 'game'
                    ? t('startGame')
                    : mode === 'workshop'
                      ? t('startWorkshop')
                      : t('preparePilot')}
                </button>
              </div>
            )}
            {episode && campaign && (
              <div className="space-y-2 border-b border-slate-700 pb-4">
                <h4 className="font-semibold text-white">
                  {t('shiftHeading', {
                    number: formatFixed(campaign.shift + 1, 0),
                    title: episode.title,
                  })}
                </h4>
                <p>
                  {mission && campaign.shift === 0
                    ? t('missionBriefing', {
                        customer: customerDisplayName(mission.customer),
                        kg: formatKg(mission.originalTargetKg),
                      })
                    : episode.briefing}
                </p>
                <p className="text-cyan-100">
                  {mission && campaign.shift === 0
                    ? t('missionPrompt', {
                        kg: formatKg(mission.originalTargetKg),
                        installment: formatKg(mission.originalTargetKg * 0.8),
                        deferred: formatKg(mission.originalTargetKg * 0.2),
                      })
                    : episode.prompt}
                </p>
                {campaignStory(state).map((line) => (
                  <p key={line}>{line}</p>
                ))}
                <div className="flex flex-wrap gap-2">
                  {episode.choices.map((choice) => (
                    <button
                      key={choice.id}
                      className={buttonClass}
                      aria-pressed={campaign.decision === choice.id}
                      disabled={
                        // 5b: in a solo season each call is its role's own.
                        (store.participationMode === 'solo' && state.mode === 'game') ||
                        (campaign.shift === 1
                          ? state.phase !== 'active' ||
                            !mondayHolds(state) ||
                            campaign.inspectionComplete ||
                            campaign.inspectionUntilMinute !== null
                          : !manual)
                      }
                      aria-describedby={
                        choiceHeld.describedBy ??
                        (campaign.shift === 1 ? `${heldId}-inspection` : undefined)
                      }
                      onClick={() => {
                        report(store.campaignDecision(choice.id, choice.actorId));
                        // The Monday inspection disables these controls once it
                        // starts, with the shift running; focus moves on.
                        keepFocus();
                      }}
                    >
                      {mission && campaign.shift !== 1 && choice.id === 'renegotiate'
                        ? t(
                            campaign.shift === 2
                              ? 'negotiateInstallmentProtectPay'
                              : 'negotiateInstallment',
                            { kg: formatKg(mission.originalTargetKg * 0.8) }
                          )
                        : mission && campaign.shift === 0
                          ? choice.id === 'keep-target'
                            ? t('keepCommitment', { kg: formatKg(mission.originalTargetKg) })
                            : t('negotiateInstallment', {
                                kg: formatKg(mission.originalTargetKg * 0.8),
                              })
                          : choice.label}
                    </button>
                  ))}
                </div>
                {choiceHeld.line}
                <p>
                  {t('recordedDecision', {
                    decision:
                      campaign.decision != null
                        ? t('decisionLabel', { decision: campaign.decision })
                        : t('pending'),
                  })}
                </p>
                {campaign.shift === 1 && (
                  <p id={`${heldId}-inspection`}>
                    {campaign.inspectionComplete
                      ? t('inspectionComplete')
                      : campaign.inspectionUntilMinute !== null
                        ? campaign.mondaySample
                          ? t('inspectionBench')
                          : t('inspectionUntil', {
                              minute: formatFixed(Math.ceil(campaign.inspectionUntilMinute), 0),
                            })
                        : t('inspectionFrom')}
                  </p>
                )}
              </div>
            )}
            {pressure && (
              <details
                open={
                  (campaign?.shift === 2 && state.phase === 'deliberating') ||
                  state.objections.some(
                    (item) => item.status === 'open' && item.statement === pressure.objection
                  )
                }
              >
                <summary className="cursor-pointer font-semibold text-white">
                  {t('pressureCard', { title: pressure.title })}
                </summary>
                <div className="mt-2 space-y-2">
                  <p>{pressure.demand}</p>
                  <p>
                    {t('challengeBelongs', {
                      role:
                        state.members.find((member) => member.id === pressure.challenger)?.role ??
                        t('theAdviser'),
                    })}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className={buttonClass}
                      disabled={!manual}
                      aria-describedby={pressureHeld.describedBy}
                      onClick={() => report(store.respondToPressure(pressure.id, 'accept-demand'))}
                    >
                      {t('tryDemand')}
                    </button>
                    <button
                      className={buttonClass}
                      disabled={restateHeld}
                      aria-describedby={restateHeld ? pressureHeld.describedBy : undefined}
                      onClick={() =>
                        report(store.respondToPressure(pressure.id, 'protect-boundary'))
                      }
                    >
                      {t('restateTerms')}
                    </button>
                  </div>
                  {pressureHeld.line}
                  <p>{pressure.repair}</p>
                  <button
                    className={buttonClass}
                    onClick={() => navigateKeepingFocus('Agreement / Voices')}
                  >
                    {t('reviewChallenge')}
                  </button>
                </div>
              </details>
            )}
            {mission && (
              <p className="tabular-nums">
                {t('missionCredit', {
                  customer: customerDisplayName(mission.customer),
                  credited: formatKg(mission.creditedKg, 1),
                  target: formatKg(missionDelivery(mission).targetKg),
                  deferred: formatKg(missionDelivery(mission).deferredKg),
                  remaining: formatKg(Math.max(0, mission.originalTargetKg - mission.creditedKg)),
                })}
                {mission.creditedKg >= mission.originalTargetKg && t('fullDispatchedSuffix')}
              </p>
            )}
            {campaign?.followOn ? (
              <>
                <p className="tabular-nums">
                  {t('followOnCredit', {
                    customer: customerDisplayName(campaign.followOn.customer),
                    credited: formatKg(campaign.followOn.creditedKg, 1),
                  })}
                </p>
                <FollowOnNotice state={state} />
              </>
            ) : (
              campaign?.mission &&
              campaign.mission.creditedKg + 1e-6 >= campaign.mission.originalTargetKg && (
                <p>
                  {nextLinkCustomer
                    ? t('followOnPending', { customer: customerDisplayName(nextLinkCustomer) })
                    : t(campaign.shift >= 2 ? 'followOnNoneLastShift' : 'followOnNone')}
                </p>
              )
            )}
            <div>
              <h4 className="font-semibold text-white">{t('chooseResponse')}</h4>
              <p className="mt-1">
                {t('targetLine', {
                  target: formatKg(displayTarget),
                  capacity: formatFixed(workplaceCapacity(state), 2),
                })}
              </p>
              <div className="mt-2 space-y-3">
                {WORKPLACE_PLANS.map((choice) => (
                  <label key={choice.id} className="block">
                    <span className="flex items-start gap-2">
                      <input
                        type="radio"
                        name="workplace-plan"
                        className="mt-1 accent-cyan-400"
                        checked={state.planId === choice.id}
                        disabled={!canConfigure}
                        onChange={() => report(store.selectPlan(choice.id))}
                      />
                      <span className="min-w-0">
                        <strong className="text-white">{choice.title}</strong>
                        <span className="block">{choice.explanation}</span>
                        {/* 5.4: what this plan does to the plant this shift. */}
                        {!choice.illegalReason &&
                          planPlantEffect(state, choice.id).map((line) => (
                            <span key={line} className="block text-cyan-100">
                              {line}
                            </span>
                          ))}
                      </span>
                    </span>
                    <span className="mt-1 block pl-5 text-slate-300">
                      {t('planTerms', {
                        capacity: formatFixed(choice.capacity, 2),
                        rest: formatPlain(choice.protectedRestMinutes),
                        cover: formatPlain(choice.optionalCoverMinutes),
                        compensation: formatPlain(choice.compensationPerMinute),
                        recovery: formatPlain(choice.recoveryMinutes),
                        budget: formatPlain(choice.budgetCost),
                      })}
                    </span>
                    {(() => {
                      // 5.9: what the Reserve Fund brought forward pays of this purchase.
                      const fromReserve =
                        alternatives.find((item) => item.id === choice.id)?.fromReserve ?? 0;
                      return fromReserve > 1e-8 ? (
                        <span className="block pl-5 tabular-nums text-cyan-100">
                          {t('fromReserve', { amount: formatFixed(fromReserve, 2) })}
                        </span>
                      ) : null;
                    })()}
                    {choice.illegalReason && (
                      <span className="block pl-5 text-amber-100">
                        {t('prohibitedReason', { reason: choice.illegalReason })}
                      </span>
                    )}
                    {campaign?.shift === 2 &&
                      !choice.illegalReason &&
                      manual &&
                      (() => {
                        const terms = alternatives.find((item) => item.id === choice.id)!;
                        return (
                          <span className="mt-1 block space-y-1 pl-5 text-xs leading-5 text-slate-300">
                            <span className="block tabular-nums">
                              {t('reservations', {
                                reserve: formatFixed(terms.reserve, 2),
                                improvement: formatFixed(terms.budgetCost, 2),
                                maxPay: formatFixed(terms.maximumCompensation, 2),
                                cash: formatFixed(terms.cashAfterReservations, 2),
                              })}
                            </span>
                            {terms.constraint && (
                              <span className="block text-amber-100">{terms.constraint}</span>
                            )}
                            {choice.id === 'cover' && (
                              <span className="block">
                                {t('volunteers', {
                                  list:
                                    terms.volunteers
                                      .map((m) =>
                                        t('volunteerEntry', {
                                          role: m.role,
                                          minutes: formatFixed(m.extraMinutes, 1),
                                        })
                                      )
                                      .join('; ') || t('none'),
                                })}
                              </span>
                            )}
                          </span>
                        );
                      })()}
                  </label>
                ))}
              </div>
            </div>
            <details>
              <summary className="cursor-pointer font-semibold text-cyan-100">{t('aiWhy')}</summary>
              <p className="mt-2">
                {t('operationalExplanation', {
                  explanation: plan.explanation,
                  capacity: formatFixed(workplaceCapacity(state), 2),
                  target: formatKg(displayTarget),
                })}
              </p>
              <button
                className={`${buttonClass} mt-2`}
                onClick={() => navigateKeepingFocus('Agreement / Voices')}
              >
                {t('challengeProposal')}
              </button>
            </details>
            {state.mode === 'workshop' && state.phase === 'active' && (
              <button className={buttonClass} onClick={advanceWorkshop}>
                {t('advanceRehearsal')}
              </button>
            )}
            {['deliberating', 'active'].includes(state.phase) && (
              // `stop` settles the shift into review and it cannot resume; the
              // plant clock controls own pausing. Working if the label says so.
              <button
                className={buttonClass}
                onClick={() => {
                  report(store.stop());
                  keepFocus();
                }}
              >
                {t('endShift')}
              </button>
            )}
          </div>
        )}

        {section === 'Practices' && (
          <div className="space-y-4">
            <fieldset disabled={!canConfigure} className="space-y-3">
              <legend className="mb-2 font-semibold text-white">{t('chooseApproach')}</legend>
              {MANAGEMENT_APPROACHES.map((approach) => (
                <div key={approach.id} className="space-y-1">
                  <button
                    className={buttonClass}
                    aria-pressed={
                      // Practices compare as a set, as the engine does.
                      JSON.stringify({
                        ...approach.settings,
                        practices: [...approach.settings.practices].sort(),
                      }) ===
                      JSON.stringify({
                        practices: [...state.practices].sort(),
                        workerAutonomy: state.workerAutonomy,
                        governance: state.governance,
                        aiAuthority: state.aiAuthority,
                      })
                    }
                    onClick={() => report(store.configure(approach.settings))}
                  >
                    {t('applyApproach', { title: approach.title })}
                  </button>
                  <p>{approach.detail}</p>
                </div>
              ))}
            </fieldset>
            <fieldset disabled={!canConfigure} className="space-y-3">
              <legend className="mb-2 font-semibold text-white">{t('threeAxes')}</legend>
              <label className="block">
                {t('workerDecisions')}
                <select
                  aria-label={t('workerDecisions')}
                  className={inputClass}
                  value={state.workerAutonomy}
                  onChange={(e) =>
                    report(
                      store.configure({
                        workerAutonomy: e.target.value as typeof state.workerAutonomy,
                      })
                    )
                  }
                >
                  <option value="directed">{t('directedAssignments')}</option>
                  {/* 5.9: "individual" and "team" did the same; one setting now. */}
                  <option value="team">{t('teamChoice')}</option>
                </select>
              </label>
              <label className="block">
                {t('sharedGovernance')}
                <select
                  aria-label={t('sharedGovernance')}
                  className={inputClass}
                  value={state.governance}
                  onChange={(e) =>
                    report(
                      store.configure({ governance: e.target.value as typeof state.governance })
                    )
                  }
                >
                  <option value="consultative">{t('consultative')}</option>
                  <option value="team-consent">{t('teamConsent')}</option>
                  <option value="member-vote">{t('memberVote')}</option>
                </select>
              </label>
              <label className="block">
                {t('aiAuthority')}
                <select
                  aria-label={t('aiAuthority')}
                  className={inputClass}
                  value={state.aiAuthority}
                  onChange={(e) =>
                    report(
                      store.configure({ aiAuthority: e.target.value as typeof state.aiAuthority })
                    )
                  }
                >
                  <option value="advice">{t('adviceOnly')}</option>
                  <option value="bounded">{t('boundedExecution')}</option>
                </select>
              </label>
            </fieldset>
            <fieldset disabled={!canConfigure} className="space-y-3">
              <legend className="mb-2 font-semibold text-white">{t('modularPractices')}</legend>
              {PRACTICES.map((practice) => (
                <label key={practice.id} className="flex items-start gap-2">
                  <input
                    className="mt-1 accent-cyan-400"
                    type="checkbox"
                    checked={state.practices.includes(practice.id)}
                    onChange={(e) =>
                      report(
                        store.configure({
                          practices: e.target.checked
                            ? [...state.practices, practice.id]
                            : state.practices.filter((id) => id !== practice.id),
                        })
                      )
                    }
                  />
                  <span>
                    <strong className="text-white">{practice.title}</strong>
                    <span className="block">{practice.detail}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          </div>
        )}

        {section === 'Agreement / Voices' && (
          <div className="space-y-4">
            {state.mode === 'game' && (
              <button
                className={buttonClass}
                disabled={!manual || store.participationMode === 'separate-turns'}
                aria-describedby={hearHeld.describedBy}
                onClick={() => {
                  const result = store.simulateResponses();
                  report(result);
                  // 5.3: the camera goes to the role that said no.
                  if (result.changed && result.reason) lookAtRefusingRole();
                }}
              >
                {t('hearResponses')}
              </button>
            )}
            {state.mode === 'game' && hearHeld.line}
            {pilot && (
              <p id={`${heldId}-pilot`} className="text-amber-100">
                {t('pilotDenies')}
              </p>
            )}
            {campaign && (
              <div className="space-y-2 border-t border-slate-700 pt-3">
                <h4 className="font-semibold text-white">{t('adviserAgreement')}</h4>
                <p>{t('adviserAgreementText')}</p>
                {comprehension('mind', t('adviser'))}
                <p>
                  {t('adviserAck', {
                    status: campaign.adviserAcknowledged ? t('ackRecorded') : t('ackPending'),
                  })}
                </p>
              </div>
            )}
            {state.members.map((member) => (
              <details key={member.id} className="border-t border-slate-700 pt-3">
                <summary className="cursor-pointer font-semibold text-white">
                  {member.role}:{' '}
                  {member.ballot === null
                    ? t('votePending')
                    : member.ballot
                      ? t('policyYesStatus')
                      : t('policyNoStatus')}
                </summary>
                <fieldset
                  disabled={
                    (store.participationMode === 'separate-turns' &&
                      store.turn?.actorId !== member.id) ||
                    // 5.3: in a solo season the player is Packing; the others
                    // answer for themselves (Hear responses).
                    (store.participationMode === 'solo' &&
                      !!campaign &&
                      state.mode === 'game' &&
                      member.id !== 'packing')
                  }
                  className="mt-2 space-y-2"
                >
                  <p>{t('publicBoundary', { boundary: member.publicBoundary })}</p>
                  {campaign && comprehension(member.id, member.role)}
                  <p>
                    {t('understanding', {
                      status: member.understood ? t('confirmed') : t('pending'),
                    })}
                  </p>
                  <button
                    className={buttonClass}
                    disabled={!manual}
                    aria-describedby={
                      memberHeld(`understand-${member.id}`, !manual, 'rejUnderstand').describedBy
                    }
                    onClick={() => report(store.understand(member.id))}
                  >
                    {t('confirmUnderstanding', { role: member.role })}
                  </button>
                  {memberHeld(`understand-${member.id}`, !manual, 'rejUnderstand').line}
                  <div className="flex flex-wrap gap-2">
                    <button
                      className={buttonClass}
                      disabled={!manual}
                      aria-describedby={
                        memberHeld(`vote-${member.id}`, !manual, 'rejVote').describedBy
                      }
                      onClick={() => report(store.vote(member.id, true))}
                    >
                      {t('policyYes', { role: member.role })}
                    </button>
                    <button
                      className={buttonClass}
                      disabled={!manual}
                      aria-describedby={
                        memberHeld(`vote-${member.id}`, !manual, 'rejVote').describedBy
                      }
                      onClick={() => report(store.vote(member.id, false))}
                    >
                      {t('policyNo', { role: member.role })}
                    </button>
                  </div>
                  {memberHeld(`vote-${member.id}`, !manual, 'rejVote').line}
                  <p>
                    {t('optionalCover', {
                      status:
                        member.coverConsent === null
                          ? t('notAgreed')
                          : member.coverConsent
                            ? t('accepted')
                            : t('declined'),
                    })}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className={buttonClass}
                      disabled={!manual || plan.optionalCoverMinutes === 0}
                      aria-describedby={coverHeld(member.id).describedBy}
                      onClick={() => report(store.consentToCover(member.id, true))}
                    >
                      {t('acceptCover', { role: member.role })}
                    </button>
                    <button
                      className={buttonClass}
                      disabled={!manual || plan.optionalCoverMinutes === 0}
                      aria-describedby={coverHeld(member.id).describedBy}
                      onClick={() => report(store.consentToCover(member.id, false))}
                    >
                      {t('declineCover', { role: member.role })}
                    </button>
                  </div>
                  {coverHeld(member.id).line}
                  {member.sharing &&
                  member.shareUntilMinute !== null &&
                  state.minute < member.shareUntilMinute &&
                  ['deliberating', 'active'].includes(state.phase) ? (
                    <p>
                      {t('sharedPreference', {
                        preference: member.preference,
                        minute: formatPlain(member.shareUntilMinute),
                      })}
                    </p>
                  ) : (
                    <p>{t('preferencePrivate')}</p>
                  )}
                  <button
                    className={buttonClass}
                    disabled={pilot || state.phase === 'idle' || state.phase === 'review'}
                    aria-describedby={shareHeld(member.id).describedBy}
                    onClick={() => report(store.sharePreference(member.id, !member.sharing))}
                  >
                    {member.sharing ? t('revokeSharing') : t('shareForPlanning')}: {member.role}
                  </button>
                  {shareHeld(member.id).line}
                  <label className="block">
                    {t('workChoice', { role: member.role })}
                    <select
                      aria-label={t('workChoice', { role: member.role })}
                      className={inputClass}
                      value={member.chosenTask}
                      disabled={
                        pilot ||
                        state.phase !== 'deliberating' ||
                        state.workerAutonomy === 'directed' ||
                        !state.practices.includes('work-choice')
                      }
                      onChange={(e) => report(store.chooseTask(member.id, e.target.value))}
                    >
                      {member.eligibleTasks.map((task) => (
                        <option key={task} value={task}>
                          {t('taskLabel', { task })}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="tabular-nums">
                    {t('memberTally', {
                      rest: formatFixed(member.restMinutes, 1),
                      extra: formatFixed(member.extraMinutes, 1),
                      pay: formatFixed(member.earnedPay, 2),
                      compensation: formatFixed(member.compensationPaid, 2),
                      recovery: formatFixed(member.recoveryMinutes, 1),
                      owed: formatFixed(member.recoveryOwedMinutes, 1),
                    })}
                  </p>
                  {state.phase === 'active' && (
                    <button
                      className={buttonClass}
                      onClick={() => report(store.withdraw(member.id))}
                    >
                      {t('withdrawCover', { role: member.role })}
                    </button>
                  )}
                </fieldset>
              </details>
            ))}
            <div className="space-y-2 border-t border-slate-700 pt-3">
              <h4 className="font-semibold text-white">{t('authoredObjections')}</h4>
              {state.improvement && (
                <button
                  type="button"
                  className={`${buttonClass} min-h-11`}
                  onClick={() => {
                    setSection('Handoff');
                    requestAnimationFrame(() => {
                      // The panel's aria-label is translated, so the hook follows it.
                      const target = labRef.current?.querySelector<HTMLElement>(
                        `[aria-label="${translate(improvementMessages, 'regionLabel')}"]`
                      );
                      target?.scrollIntoView?.({ block: 'start', behavior: 'instant' });
                      target?.focus({ preventScroll: true });
                    });
                  }}
                >
                  {t('returnToHandoff')}
                </button>
              )}
              <label className="block">
                {t('objectionAuthor')}
                <select
                  aria-label={t('objectionAuthor')}
                  className={inputClass}
                  value={actor}
                  onChange={(e) => setActor(e.target.value)}
                >
                  {state.members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.role}
                    </option>
                  ))}
                  <option value="mind">{t('aiMind')}</option>
                </select>
              </label>
              <label className="block">
                {t('objectionSubject')}
                <select
                  aria-label={t('objectionSubject')}
                  className={inputClass}
                  value={kind}
                  onChange={(e) => setKind(e.target.value as ObjectionKind)}
                >
                  {kinds.map((item) => (
                    <option key={item} value={item}>
                      {t('objectionKind', { kind: item })}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className={buttonClass}
                disabled={pilot || !['deliberating', 'active'].includes(state.phase)}
                aria-describedby={objectHeld.describedBy}
                onClick={() => {
                  report(store.object(actor, kind));
                  // An objection mid-shift stops it into review, disabling this
                  // control with focus on it; focus moves on (not to <body>).
                  keepFocus();
                }}
              >
                {t('recordObjection')}
              </button>
              {objectHeld.line}
              {state.objections.length === 0 && <p>{t('noObjections')}</p>}
              {state.objections.map((objection) => (
                <div
                  key={objection.id}
                  ref={(node) => {
                    if (node) objectionTargets.current.set(objection.id, node);
                    else objectionTargets.current.delete(objection.id);
                  }}
                  role="group"
                  aria-label={t('objectionRecord', {
                    role:
                      state.members.find((member) => member.id === objection.actorId)?.role ??
                      t('adviser'),
                    kind: t('objectionKind', { kind: objection.kind }),
                  })}
                  tabIndex={-1}
                  className="space-y-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
                >
                  <p>
                    {state.members.find((member) => member.id === objection.actorId)?.role ??
                      t('aiMind')}
                    : {pressureObjectionText(objection.statement)} (
                    {t('objectionStatus', { status: objection.status })})
                  </p>
                  {objection.status === 'open' && (
                    <>
                      <label className="block">
                        {t('resolvingAuthor', {
                          kind: t('objectionKind', { kind: objection.kind }),
                        })}
                        <select
                          aria-label={t('resolvingAuthor', {
                            kind: t('objectionKind', { kind: objection.kind }),
                          })}
                          className={inputClass}
                          value={
                            store.participationMode === 'separate-turns'
                              ? actor
                              : (resolvers[objection.id] ?? '')
                          }
                          onChange={(e) =>
                            setResolvers({ ...resolvers, [objection.id]: e.target.value })
                          }
                        >
                          <option value="">{t('selectOriginalAuthor')}</option>
                          <option value={objection.actorId}>
                            {state.members.find((member) => member.id === objection.actorId)
                              ?.role ?? t('aiMind')}
                          </option>
                        </select>
                      </label>
                      <button
                        className={buttonClass}
                        disabled={
                          pilot ||
                          (store.participationMode === 'separate-turns'
                            ? actor !== objection.actorId
                            : resolvers[objection.id] !== objection.actorId)
                        }
                        aria-describedby={resolveHeld(objection.id, objection.actorId).describedBy}
                        onClick={() => {
                          report(
                            store.resolveObjection(
                              objection.id,
                              store.participationMode === 'separate-turns'
                                ? actor
                                : resolvers[objection.id]
                            )
                          );
                          // Resolving removes this control; focus stays on the
                          // record it resolved, which now reads "resolved".
                          requestAnimationFrame(() => {
                            if (document.activeElement && document.activeElement !== document.body)
                              return;
                            objectionTargets.current
                              .get(objection.id)
                              ?.focus({ preventScroll: true });
                          });
                        }}
                      >
                        {t('authorConfirms')}
                      </button>
                      {resolveHeld(objection.id, objection.actorId).line}
                    </>
                  )}
                </div>
              ))}
            </div>
            <div className="space-y-2 border-t border-slate-700 pt-3">
              <h4 className="font-semibold text-white">{t('executionConditions')}</h4>
              {readiness.reasons.length ? (
                <ul id={`${heldId}-readiness`} className="list-disc space-y-1 pl-4">
                  {readiness.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              ) : (
                <p>{t('conditionsPermit')}</p>
              )}
              <button
                className={buttonClass}
                disabled={busy || state.phase !== 'deliberating' || pilot || !readiness.allowed}
                // Held, it is named by the conditions that hold it (listed above).
                aria-describedby={
                  !busy &&
                  readiness.reasons.length > 0 &&
                  (state.phase !== 'deliberating' || pilot || !readiness.allowed)
                    ? `${heldId}-readiness`
                    : undefined
                }
                // Checking, then running, disables this control; the handoff panel
                // reuses activate() with its own focus handling.
                onClick={() => void activate().then(keepFocus)}
              >
                {busy
                  ? t('checkingAgreement')
                  : state.mode === 'workshop'
                    ? t('recordWorkshopAgreement')
                    : t('approveAndRun')}
              </button>
            </div>
          </div>
        )}

        {section === 'Review' && <WorkplaceFairness />}
        {section === 'Review' && (
          <div className="space-y-4">
            <h4 className="font-semibold text-white">{t('actualOutcomes')}</h4>
            {outcomes && (
              <div className="space-y-2">
                <p>
                  {t('deliveryLine', {
                    status: t('deliveryStatus', { status: outcomes.delivery.status }),
                    delivered: formatKg(outcomes.delivery.deliveredKg, 1),
                    target: formatKg(outcomes.delivery.targetKg),
                    customer: customerDisplayName(outcomes.delivery.customer),
                  })}
                </p>
                {mission && (
                  <p>
                    {t('remainingCommitment', {
                      kg: formatKg(outcomes.delivery.remainingKg),
                    })}
                    {outcomes.delivery.remainingKg === 0 && t('fullDispatchedSuffix')}
                  </p>
                )}
                <p>
                  {t('agreementLine', {
                    status: t('agreementStatus', { status: outcomes.agreement.status }),
                    outcome: outcomes.complete ? t('complete') : t('unfinished'),
                  })}
                </p>
                {outcomes.delivery.deferredKg > 0 && (
                  <p>{t('agreedDeferral', { kg: formatKg(outcomes.delivery.deferredKg) })}</p>
                )}
                <p>
                  {t('accountsLine', {
                    cash: formatFixed(outcomes.accounts.closingCash, 2),
                    wages: formatFixed(outcomes.accounts.wages, 2),
                    compensation: formatFixed(outcomes.accounts.compensation, 2),
                    improvements: formatFixed(outcomes.accounts.improvements, 2),
                    allocations: formatFixed(outcomes.accounts.allocations, 2),
                  })}
                </p>
              </div>
            )}
            {totals && campaign && (
              <div className="space-y-2">
                <h4 className="font-semibold text-white">{t('cumulativeEvidence')}</h4>
                <p>
                  {t('totalsLine', {
                    shifts: formatPlain(totals.shiftsReviewed),
                    refusals: formatPlain(totals.refusalsRespected),
                    promises: formatPlain(totals.promisesKept),
                    repairs: formatPlain(totals.repairs),
                    resolved: formatPlain(totals.objectionsResolved),
                    raised: formatPlain(totals.objectionsRaised),
                  })}
                </p>
                {totals.members.map((member) => (
                  <p key={member.id} className="tabular-nums">
                    {t('memberTotals', {
                      role: member.role,
                      extra: formatFixed(member.extraMinutes, 1),
                      rest: formatFixed(member.restMinutes, 1),
                      pay: formatFixed(member.earnedPay, 2),
                      compensation: formatFixed(member.compensationPaid, 2),
                      recovery: formatFixed(member.recoveryMinutes, 1),
                      owed: formatFixed(member.recoveryOwedMinutes, 1),
                    })}
                  </p>
                ))}
                {campaign.history.map((shift) => (
                  <p key={shift.shift}>
                    {t('shiftHistory', {
                      number: formatFixed(shift.shift + 1, 0),
                      title: CAMPAIGN_SHIFTS[shift.shift]?.title ?? '',
                      shipped: mission
                        ? t('shippedDuringShift', { kg: formatKg(shift.shippedKg, 1) })
                        : t('shippedOfTarget', {
                            kg: formatKg(shift.shippedKg, 1),
                            target: formatKg(shift.targetKg),
                          }),
                      decision:
                        shift.decision != null
                          ? t('decisionLabel', { decision: shift.decision })
                          : t('pending'),
                    })}
                  </p>
                ))}
              </div>
            )}
            {campaign && (
              <details>
                <summary className="cursor-pointer font-semibold text-white">
                  {t('relationshipRecord')}
                </summary>
                <div className="mt-2 space-y-3">
                  {relationship.map((record) => (
                    <div key={record.shift} className="space-y-1">
                      <h5 className="font-semibold text-white">
                        {t('relationshipShiftHeading', {
                          title: CAMPAIGN_SHIFTS[record.shift]?.title ?? '',
                          number: formatFixed(record.shift + 1, 0),
                        })}
                      </h5>
                      {record.events === null ? (
                        <p>{t('olderSave')}</p>
                      ) : record.events.length === 0 ? (
                        <p>{t('noMoments')}</p>
                      ) : (
                        <ol className="list-disc space-y-2 pl-4">
                          {record.events.map((event) => (
                            <li key={event.id} className="break-words">
                              {t('eventMinute', { minute: formatFixed(event.minute, 1) })}{' '}
                              {state.members.find((member) => member.id === event.actorId)?.role ??
                                (event.actorId === 'mind' ? t('adviser') : event.actorId)}
                              : {displayEventDetail(event.detail)}
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            )}
            {learningReview && (
              <section aria-label={t('learningReviewLabel')} className="space-y-2">
                <h4 className="font-semibold text-white">{t('learnTogether')}</h4>
                <p>{learningReview.goal}</p>
                <ul className="list-disc space-y-1 pl-4">
                  {learningReview.evidence.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <p className="text-cyan-100">{learningReview.question}</p>
                <button
                  type="button"
                  className={buttonClass}
                  onClick={() => {
                    navigateKeepingFocus('Experiment');
                    labRef.current?.scrollIntoView?.({ block: 'start', behavior: 'instant' });
                  }}
                >
                  {t('compareAnotherHandoff')}
                </button>
              </section>
            )}
            {state.phase === 'review' && (
              <div className="space-y-2">
                {state.mode === 'workshop' &&
                  state.members.some((member) => member.recoveryOwedMinutes > 0) && (
                    <button className={buttonClass} onClick={advanceWorkshop}>
                      {t('deliverRecovery')}
                    </button>
                  )}
                {/* A handoff review continues or closes in Handoff; 'start' always
                  refuses it, so no fresh-shift control is offered there. */}
                {campaign?.shift === 2 ? (
                  <p className="font-semibold text-cyan-100">
                    {campaignComplete(state)
                      ? t('campaignCompleteMessage')
                      : t('campaignIncomplete')}
                  </p>
                ) : state.improvement || shiftResumable(state) ? null : (
                  // A shift a reload paused resumes below; continuing would close
                  // it short and the season could never be honoured.
                  (() => {
                    const held = state.members.some((member) => member.recoveryOwedMinutes > 0)
                      ? t('heldRecovery')
                      : campaign && state.objections.some((item) => item.status === 'open')
                        ? t('heldObjection')
                        : null;
                    return (
                      <>
                        <button
                          className={buttonClass}
                          disabled={held !== null}
                          aria-describedby={held ? continueHeldId : undefined}
                          onClick={campaign ? nextShift : replay}
                        >
                          {campaign
                            ? t('continueCampaign')
                            : state.mode === 'game'
                              ? t('startNextGame')
                              : state.mode === 'workshop'
                                ? t('startNextWorkshop')
                                : t('prepareNextPilot')}
                        </button>
                        {held && (
                          <p id={continueHeldId} className="text-amber-200">
                            {held}
                          </p>
                        )}
                      </>
                    );
                  })()
                )}
                {!campaign && !state.improvement && (
                  <button
                    className={buttonClass}
                    disabled={state.members.some((member) => member.recoveryOwedMinutes > 0)}
                    // The same hold as Continue, named by its line above.
                    aria-describedby={
                      state.members.some((member) => member.recoveryOwedMinutes > 0) &&
                      !shiftResumable(state)
                        ? continueHeldId
                        : undefined
                    }
                    onClick={returnToSetup}
                  >
                    {t('returnToSetup')}
                  </button>
                )}
              </div>
            )}
            <p>
              {t('shippedOf', {
                shipped: formatKg(mission?.creditedKg ?? state.shippedKg, 1),
                target: formatKg(mission ? missionDelivery(mission).targetKg : displayTarget),
              })}{' '}
              {state.reviewReason ? displayEventDetail(state.reviewReason) : t('reviewOpens')}
            </p>
            {/* A reload, a safety stop or a resolved objection expired every
              grant but did not end the shift: it resumes at the minute
              reached once everyone consents again. */}
            {shiftResumable(state) && (
              <div className="space-y-2">
                <p>
                  {t(
                    campaignShiftPause(state) === 'safety'
                      ? 'resumeAfterSafetyNote'
                      : campaignShiftPause(state) === 'objection'
                        ? 'resumeAfterObjectionNote'
                        : 'resumeAfterReloadNote',
                    { minute: formatFixed(state.minute, 0) }
                  )}
                </p>
                <button
                  className={buttonClass}
                  onClick={() => {
                    report(store.resumeShift(state.revision));
                    keepFocus();
                  }}
                >
                  {t('resumeShift')}
                </button>
              </div>
            )}
            <div>
              <h4 className="font-semibold text-white">{t('relationshipEvidence')}</h4>
              <p>
                {t('relationshipEvidenceLine', {
                  refusals: formatPlain(state.refusalsRespected),
                  promises: formatPlain(state.promisesKept),
                  open: formatFixed(
                    state.objections.filter((item) => item.status === 'open').length,
                    0
                  ),
                  confirmed: formatFixed(
                    state.members.filter((member) => member.understood).length,
                    0
                  ),
                  total: formatFixed(state.members.length, 0),
                })}
              </p>
            </div>
            <WorkplacePracticeProposal state={state} />
            <div>
              <h4 className="font-semibold text-white">{t('compareBurdens')}</h4>
              {state.members.map((member) => (
                <p key={member.id} className="mt-2 tabular-nums">
                  {t('burdenLine', {
                    role: member.role,
                    rest: formatFixed(member.restMinutes, 1),
                    extra: formatFixed(member.extraMinutes, 1),
                    earned: formatFixed(member.earnedPay, 2),
                    compensation: formatFixed(member.compensationPaid, 2),
                    recovery: formatFixed(member.recoveryMinutes, 1),
                    owed: formatFixed(member.recoveryOwedMinutes, 1),
                  })}
                </p>
              ))}
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-white">{t('memberGovernance')}</h4>
              <p>
                {t('chairLine', {
                  chair:
                    state.members.find((member) => member.id === state.electedChair)?.role ??
                    t('notElected'),
                })}
              </p>
              <label className="block">
                {t('memberVoter')}
                <select
                  aria-label={t('memberVoter')}
                  className={inputClass}
                  value={voter}
                  onChange={(e) => setVoter(e.target.value)}
                >
                  {state.members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.role}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                {t('chairCandidate')}
                <select
                  aria-label={t('chairCandidate')}
                  className={inputClass}
                  value={candidate}
                  onChange={(e) => setCandidate(e.target.value)}
                >
                  {state.members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.role}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className={buttonClass}
                disabled={
                  pilot ||
                  !state.practices.includes('cooperative') ||
                  state.phase !== 'deliberating' ||
                  state.governance !== 'member-vote'
                }
                aria-describedby={chairHeld.describedBy}
                onClick={() => report(store.elect(voter, candidate))}
              >
                {t('recordChairBallot')}
              </button>
              {chairHeld.line}
              <p>
                {Object.entries(state.chairBallots)
                  .map(
                    ([id, choice]) =>
                      `${state.members.find((member) => member.id === id)?.role ?? id}: ${state.members.find((member) => member.id === choice)?.role ?? choice}`
                  )
                  .join('; ') || t('noChairBallots')}
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-white">
                {t('surplusHeading', { surplus: formatFixed(surplus, 2) })}
              </h4>
              <label className="block">
                {t('surplusDestination')}
                <select
                  aria-label={t('surplusDestination')}
                  className={inputClass}
                  value={destination}
                  onChange={(e) => setDestination(e.target.value as SurplusDestination)}
                >
                  {destinations.map((item) => (
                    <option key={item} value={item}>
                      {t('destinationLabel', { destination: item })}
                    </option>
                  ))}
                </select>
              </label>
              {(() => {
                // The statutory funds first, then the destination: the pool
                // split by destination, never an amount per member (D-058).
                const split = state.sobras ?? sobrasSettlement(state, destination);
                const funds = {
                  amount: formatFixed(split.remainder, 2),
                  reserve: formatFixed(split.reserve, 2),
                  fates: formatFixed(split.fates, 2),
                };
                const shown = state.sobras ? state.sobras.destination : destination;
                return (
                  <p className="tabular-nums text-slate-300">
                    {shown === 'reserve'
                      ? t('retainSurplus', funds)
                      : shown === 'members'
                        ? t('distributeSurplus', funds)
                        : t('allocateSurplus', funds)}
                  </p>
                );
              })()}
              {!sharedSurplus && (
                <p id={`${heldId}-surplus-charter`} className="text-amber-100">
                  {t('surplusCharter')}
                </p>
              )}
              {sharedSurplus && surplus <= 1e-8 && !state.distributionComplete && (
                <p id={`${heldId}-surplus-none`} className="tabular-nums text-amber-100">
                  {t('noSurplusReason', {
                    revenue: formatFixed(state.finance.operatingRevenue, 2),
                    cost: formatFixed(state.finance.operatingCost, 2),
                    wages: formatFixed(state.finance.wagesPaid, 2),
                    cover: formatFixed(state.finance.compensationPaid, 2),
                    purchases: formatFixed(state.finance.improvementSpend, 2),
                  })}
                </p>
              )}
              <button
                className={buttonClass}
                disabled={
                  pilot ||
                  !sharedSurplus ||
                  state.phase !== 'review' ||
                  surplus <= 0 ||
                  state.distributionComplete
                }
                aria-describedby={surplusHeld}
                onClick={() => report(store.voteSurplus(voter, destination))}
              >
                {t('recordSurplusBallot')}
              </button>
              <p>
                {Object.entries(state.surplusBallots)
                  .map(
                    ([id, vote]) =>
                      `${state.members.find((member) => member.id === id)?.role ?? id}: ${t('destinationLabel', { destination: vote })}`
                  )
                  .join('; ') || t('noSurplusBallots')}
              </p>
              <button
                className={buttonClass}
                disabled={
                  pilot ||
                  !sharedSurplus ||
                  state.phase !== 'review' ||
                  surplus <= 0 ||
                  state.distributionComplete
                }
                aria-describedby={surplusHeld}
                onClick={() => {
                  report(store.distributeSurplus());
                  // A completed allocation disables this control; focus moves on.
                  keepFocus();
                }}
              >
                {t('executeAllocation')}
              </button>
              {surplusPhaseHeld.line}
              {state.distributionComplete && (
                <p id={`${heldId}-surplus-done`}>{t('allocationRecorded')}</p>
              )}
            </div>
            <details>
              <summary className="cursor-pointer font-semibold text-cyan-100">
                {t('recordedEvidence')}
              </summary>
              <ol className="mt-2 space-y-2">
                {state.events.slice(-8).map((event) => (
                  <li key={event.id}>
                    {t('evidenceLine', {
                      minute: formatFixed(event.minute, 1),
                      actor: workplaceActorName(event.actorId),
                      detail: displayEventDetail(event.detail),
                    })}
                  </li>
                ))}
              </ol>
            </details>
          </div>
        )}

        {section === 'Experiment' && (
          <div className="space-y-4">
            <WorkplaceReplay
              seed={safeSeed}
              validSeed={validSeed}
              navigate={navigateKeepingFocus}
            />
            <h4 className="font-semibold text-white">{t('teachingForecasts')}</h4>
            <div className="space-y-2">
              <h4 className="font-semibold text-white">{t('samePressure')}</h4>
              <button
                className={buttonClass}
                disabled={!validSeed}
                aria-describedby={seedHeld('experiment')}
                onClick={() => setShowManagementComparison(true)}
              >
                {t('compareApproaches')}
              </button>
              {showManagementComparison &&
                compareManagementApproaches(safeSeed, state.planId).map((arm) => (
                  <div key={arm.id} className="space-y-1 border-t border-slate-700 pt-2">
                    <h5 className="font-semibold text-white">{arm.title}</h5>
                    <p>{arm.detail}</p>
                    <p className="tabular-nums">
                      {t('matchedForecast', {
                        kg: formatFixed(arm.forecastKg, 1),
                        credits: formatFixed(arm.netCredits, 2),
                      })}{' '}
                      {arm.permitted
                        ? t('charterSupports')
                        : arm.missingPractices.length
                          ? t('activationBlockedEnable', {
                              practices: arm.missingPractices
                                .map((practice) => t('practiceLabel', { practice }))
                                .join(', '),
                            })
                          : t('activationBlockedBreach')}
                    </p>
                  </div>
                ))}
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-white">{t('sameSeed')}</h4>
              <label className="block">
                {t('experimentSeed')}
                <input
                  className={inputClass}
                  type="number"
                  min="1"
                  max="2147483647"
                  value={seed}
                  disabled={!configuring}
                  aria-invalid={!validSeed || undefined}
                  aria-describedby={seedHeld('experiment')}
                  onChange={(e) => {
                    setSeed(e.target.value);
                    setComparison(null);
                  }}
                />
              </label>
              {seedError('experiment')}
              <button
                className={buttonClass}
                disabled={!validSeed}
                aria-describedby={seedHeld('experiment')}
                onClick={() => setComparison(compareWorkplacePlans(safeSeed))}
              >
                {t('compareAllPlans')}
              </button>
              {/* The engine refuses a standalone restart inside a season or a
                handoff experiment, so it is offered only where it can work. */}
              {state.phase === 'deliberating' && !campaign && !state.improvement && (
                <>
                  <button
                    className={buttonClass}
                    disabled={!validSeed}
                    aria-describedby={seedHeld('experiment')}
                    onClick={() => report(store.start(state.mode, safeSeed))}
                  >
                    {t('restartDiscussion')}
                  </button>
                </>
              )}
              {state.mode === 'game' && campaign && !state.improvement && (
                <>
                  <button
                    className={buttonClass}
                    onClick={() => setPlantForecast(forecastWorkplacePlansNow(state))}
                  >
                    {t('forecastFromPlant')}
                  </button>
                  {plantForecast?.map((arm) => (
                    <p key={arm.planId} className="tabular-nums">
                      <strong className="text-white">
                        {WORKPLACE_PLANS.find((item) => item.id === arm.planId)?.title}
                      </strong>
                      {arm.packedLowKg === null ||
                      arm.packedHighKg === null ||
                      arm.shippedHighKg === null
                        ? t('forecastPlantAbstain', {
                            expected: formatKg(arm.expectedKg),
                            trucks: formatFixed(arm.departures, 0),
                          })
                        : t('forecastPlantLine', {
                            low: formatKg(arm.packedLowKg),
                            high: formatKg(arm.packedHighKg),
                            ship: formatKg(arm.shippedHighKg),
                            expected: formatKg(arm.expectedKg),
                            trucks: formatFixed(arm.departures, 0),
                          })}{' '}
                      {t(arm.changesDispatch ? 'forecastSequence' : 'forecastNoChange')}
                      {arm.seasonKg !== null &&
                        ` ${t('forecastSeason', { kg: formatKg(arm.seasonKg) })}`}
                      {arm.benchWaitMinutes > 0 &&
                        ` ${t('forecastBenchWait', { minutes: formatFixed(arm.benchWaitMinutes, 0) })}`}
                      {arm.serviceWaitMinutes > 0 &&
                        ` ${t('forecastServiceWait', { minutes: formatFixed(arm.serviceWaitMinutes, 0) })}`}
                    </p>
                  ))}
                </>
              )}
              {comparison?.map((arm) => (
                <p key={arm.planId} className="tabular-nums">
                  {/* Kept since the click: the title is read now, in the language chosen. */}
                  <strong className="text-white">
                    {WORKPLACE_PLANS.find((item) => item.id === arm.planId)?.title ?? arm.title}
                  </strong>
                  {t('armLine', {
                    kg: formatFixed(arm.forecastKg, 1),
                    credits: formatFixed(arm.netCredits, 2),
                    extra: formatFixed(arm.extraMinutes, 1),
                    rest: formatFixed(arm.restMinutes, 1),
                    verdict: arm.permitted ? t('permitted') : t('prohibited'),
                  })}
                </p>
              ))}
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-white">{t('pilotChecklist')}</h4>
              <ul className="list-disc space-y-1 pl-4">
                <li>{t('checklistPurpose')}</li>
                <li>{t('checklistConsent')}</li>
                <li>{t('checklistData')}</li>
                <li>{t('checklistSafety')}</li>
                <li>{t('checklistSeparate')}</li>
              </ul>
              <button className={buttonClass} onClick={download}>
                {t('downloadJson')}
              </button>
              <WorkplacePracticeProposal state={state} />
            </div>
          </div>
        )}
      </ToolsDisclosure>
    </section>
  );
};
