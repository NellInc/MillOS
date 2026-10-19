import {
  WorkplaceParticipation,
  WorkplaceFairness,
  WorkplaceDemonstration,
  WorkplaceAutomaticDemo,
} from './WorkplaceParticipation';
import React, { useRef, useState } from 'react';
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
  pendingFollowOn,
  useWorkplaceStore,
  useWorkplaceControls,
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
  CAMPAIGN_PRESSURES,
  campaignRelationship,
} from '../../../simulation/workplaceCampaign';
import { executeAgentCommand } from '../../../agent/client/executeAgentCommand';
import { formatFixed, formatGrouped, getLocale, translate, useT } from '../../../i18n';
import { workplaceLabMessages as messages } from './WorkplaceLab.messages';
import { workplaceImprovementPanelMessages as improvementMessages } from './WorkplaceImprovementPanel.messages';
import type {
  ObjectionKind,
  WorkplaceProfile,
  WorkplaceAnswer,
  SurplusDestination,
  WorkplaceMode,
  WorkplaceTransitionResult,
} from '../../../types/workplace';

const buttonClass =
  'min-h-9 rounded-md border border-cyan-300/25 px-2 py-1.5 text-xs font-medium text-cyan-100 hover:bg-cyan-900/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:opacity-50';
const inputClass =
  'min-h-9 w-full min-w-0 rounded-md border border-slate-600 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:opacity-50';
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
const kinds: ObjectionKind[] = ['rest', 'burden', 'privacy', 'authority'];
const destinations: SurplusDestination[] = ['members', 'reserve', 'community'];

export const WorkplaceLab: React.FC = () => {
  const t = useT(messages);
  const labRef = useRef<HTMLElement>(null);
  const objectionTargets = useRef(new Map<string, HTMLDivElement>());
  const store = useWorkplaceControls();
  const state = store.workplace;
  const [section, setSection] = useState<(typeof sections)[number]>(
    state.improvement ? 'Handoff' : 'Shift'
  );
  const [mode, setMode] = useState<WorkplaceMode>(state.mode);
  const [profile, setProfile] = useState<WorkplaceProfile>('toe-dip');
  const [seed, setSeed] = useState(String(state.seed));
  const [feedback, setFeedback] = useState<string | null>(null);
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
  const plan = WORKPLACE_PLANS.find((item) => item.id === state.planId)!;
  const readiness = workplaceReadiness(state);
  const alternatives = workplaceAlternatives(state);
  const campaign = state.campaign;
  const episode = campaign ? CAMPAIGN_SHIFTS[campaign.shift] : null;
  const pressure = campaign ? CAMPAIGN_PRESSURES[campaign.shift] : null;
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
  const surplus = Math.max(
    0,
    state.finance.operatingRevenue -
      state.finance.operatingCost -
      state.finance.wagesPaid -
      state.finance.compensationPaid -
      state.finance.improvementSpend -
      state.finance.distributed -
      state.finance.communityAllocation
  );
  // The engine accepts surplus ballots and allocation only under the
  // 'gainsharing' practice. Working if neither control is offered without it.
  const sharedSurplus = state.practices.includes('gainsharing');
  const modeLabelKey = modes.find((item) => item.value === state.mode)?.labelKey;
  const freshExercise = () => {
    setSection('Shift');
    setMode('game');
    setSeed(String(useWorkplaceStore.getState().workplace.seed));
    setFeedback(translate(messages, 'freshExercise'));
    setReceipt(null);
  };
  const report = (result: WorkplaceTransitionResult) => {
    setFeedback(result.reason ?? translate(messages, result.changed ? 'recorded' : 'noChange'));
    setReceipt(null);
  };
  const begin = () => {
    if (!validSeed) return;
    const result = store.start(mode, safeSeed);
    report(result);
    if (result.changed && mode === 'game') {
      useGameSimulationStore.getState().setGameSpeed(15);
    }
  };
  const beginCampaign = () => {
    if (!validSeed || mode !== 'game' || state.phase !== 'idle') return;
    const result = store.startCampaign(profile, safeSeed);
    report(result);
    if (result.changed) useGameSimulationStore.getState().setGameSpeed(30);
  };
  const nextShift = () => {
    const result = store.nextCampaignShift();
    report(result);
    if (result.changed) setSection('Shift');
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
  const activate = async () => {
    if (busyRef.current) return;
    if (state.mode === 'workshop') {
      report(store.activate(state.revision));
      return;
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
      setFeedback(
        [
          translate(messages, 'previewStatus', { status: result.preview.status }),
          result.receipt
            ? translate(messages, 'executionStatus', { status: result.receipt.status })
            : translate(messages, 'noExecutionReceipt'),
          ...result.preview.authority.reasons,
          ...problems.map((problem) => problem.message),
        ].join(' ')
      );
      if (result.receipt) setReceipt(result.receipt.receiptId);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : String(error));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const advanceWorkshop = () => {
    const before = useWorkplaceStore.getState().workplace;
    store.tick(5, 0, false);
    const changed = useWorkplaceStore.getState().workplace !== before;
    report({
      changed,
      reason: translate(messages, changed ? 'rehearsalAdvanced' : 'rehearsalNoAdvance'),
    });
  };
  const replay = () => {
    const result = store.start(state.mode, state.seed);
    report(result);
    if (result.changed && state.mode === 'game') useGameSimulationStore.getState().setGameSpeed(15);
    if (result.changed) setSection('Shift');
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
    setFeedback(translate(messages, 'exported'));
  };

  return (
    <section
      ref={labRef}
      aria-label={t('labTitle')}
      className="min-w-0 space-y-4 rounded-xl border border-cyan-300/25 bg-slate-950 p-3 text-xs leading-relaxed text-slate-200 selection:bg-cyan-800 selection:text-white"
    >
      <header>
        <h3 className="text-base font-semibold text-white">{t('labTitle')}</h3>
        <p className="mt-1">
          {section === 'Handoff'
            ? t('introHandoff')
            : state.improvement
              ? t('introImprovement')
              : campaign
                ? t('introCampaign')
                : t('introFriday')}
        </p>
        <p className="mt-2 text-slate-300">{t('syntheticNotice')}</p>
      </header>
      <WorkplaceParticipation report={report} />
      <WorkplaceAutomaticDemo profile={profile} />
      <WorkplaceDemonstration navigate={setSection} report={report} />
      <div className="flex flex-wrap gap-1" aria-label={t('sectionsLabel')}>
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
      {feedback && (
        <p role="status" className="break-words text-amber-100">
          {feedback}
        </p>
      )}
      {receipt && <p className="break-all text-cyan-100">{t('causalReceipt', { receipt })}</p>}

      {section === 'Handoff' && (
        <WorkplaceImprovementPanel
          onSeasonStart={() => setSection('Shift')}
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
          <p>{t('shiftIntro')}</p>
          <button type="button" className={buttonClass} onClick={() => setSection('Handoff')}>
            {t('openHandoff')}
          </button>
        </div>
      )}
      <WorkplaceReplayGuide
        section={section === 'Handoff' ? 'Shift' : section}
        navigate={setSection}
      />
      <WorkplaceReplayResume />
      <WorkplacePressureChapter state={state} navigate={setSection} />
      <WorkplaceCampaignArchive onFreshExercise={freshExercise} />
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
                  onChange={(e) => setSeed(e.target.value)}
                />
              </label>
              {mode === 'game' && (
                <div className="space-y-2 border-b border-slate-700 pb-4">
                  <h4 className="font-semibold text-white">{t('livingCooperative')}</h4>
                  <p>{t('livingIntro')}</p>
                  <label className="block">
                    {t('adoptionProfile')}
                    <select
                      aria-label={t('adoptionProfile')}
                      className={inputClass}
                      value={profile}
                      onChange={(event) => setProfile(event.target.value as WorkplaceProfile)}
                    >
                      <option value="toe-dip">{t('profileToeDip')}</option>
                      <option value="team">{t('profileTeam')}</option>
                      <option value="cooperative">{t('profileCooperative')}</option>
                    </select>
                  </label>
                  <button
                    className={`${buttonClass} bg-cyan-900/60`}
                    disabled={!validSeed}
                    onClick={beginCampaign}
                  >
                    {t('startCampaign')}
                  </button>
                  <p>{t('campaignPaceNote')}</p>
                </div>
              )}
              <button className={buttonClass} disabled={!validSeed} onClick={begin}>
                {mode === 'game'
                  ? t('startGame')
                  : mode === 'workshop'
                    ? t('startWorkshop')
                    : t('preparePilot')}
              </button>
              <p>{mode === 'game' ? t('gameNote') : t('otherNote')}</p>
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
                      customer: mission.customer,
                      kg: formatFixed(mission.originalTargetKg, 0),
                    })
                  : episode.briefing}
              </p>
              <p className="text-cyan-100">
                {mission && campaign.shift === 0
                  ? t('missionPrompt', {
                      kg: formatFixed(mission.originalTargetKg, 0),
                      installment: formatFixed(mission.originalTargetKg * 0.8, 0),
                      deferred: formatFixed(mission.originalTargetKg * 0.2, 0),
                    })
                  : episode.prompt}
              </p>
              {campaignStory(state).map((line) => (
                <p key={line}>{line}</p>
              ))}
              <p>{t('adviserRolePlay')}</p>
              {campaign.shift === 2 && <p>{t('shiftThreeNote')}</p>}
              <div className="flex flex-wrap gap-2">
                {episode.choices.map((choice) => (
                  <button
                    key={choice.id}
                    className={buttonClass}
                    aria-pressed={campaign.decision === choice.id}
                    disabled={
                      campaign.shift === 1
                        ? state.phase !== 'active' ||
                          state.minute < 25 ||
                          campaign.inspectionComplete ||
                          campaign.inspectionUntilMinute !== null
                        : !manual
                    }
                    onClick={() => report(store.campaignDecision(choice.id, choice.actorId))}
                  >
                    {mission && campaign.shift !== 1 && choice.id === 'renegotiate'
                      ? t(
                          campaign.shift === 2
                            ? 'negotiateInstallmentProtectPay'
                            : 'negotiateInstallment',
                          { kg: formatFixed(mission.originalTargetKg * 0.8, 0) }
                        )
                      : mission && campaign.shift === 0
                        ? choice.id === 'keep-target'
                          ? t('keepCommitment', { kg: formatFixed(mission.originalTargetKg, 0) })
                          : t('negotiateInstallment', {
                              kg: formatFixed(mission.originalTargetKg * 0.8, 0),
                            })
                        : choice.label}
                  </button>
                ))}
              </div>
              <p>
                {t('recordedDecision', {
                  decision:
                    campaign.decision != null
                      ? t('decisionLabel', { decision: campaign.decision })
                      : t('pending'),
                })}
              </p>
              {campaign.shift === 1 && (
                <p>
                  {campaign.inspectionComplete
                    ? t('inspectionComplete')
                    : campaign.inspectionUntilMinute !== null
                      ? t('inspectionUntil', {
                          minute: formatFixed(Math.ceil(campaign.inspectionUntilMinute), 0),
                        })
                      : t('inspectionFrom')}
                </p>
              )}
              <p>{t('reviewBeforeContinuing')}</p>
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
                    onClick={() => report(store.respondToPressure(pressure.id, 'accept-demand'))}
                  >
                    {t('tryDemand')}
                  </button>
                  <button
                    className={buttonClass}
                    disabled={
                      !manual &&
                      !(
                        state.phase === 'review' &&
                        state.objections.some(
                          (objection) =>
                            objection.status === 'open' &&
                            objection.statement === pressure.objection
                        )
                      )
                    }
                    onClick={() => report(store.respondToPressure(pressure.id, 'protect-boundary'))}
                  >
                    {t('restateTerms')}
                  </button>
                </div>
                <p>{pressure.repair}</p>
                <p>{t('pressureNote')}</p>
                <button className={buttonClass} onClick={() => setSection('Agreement / Voices')}>
                  {t('reviewChallenge')}
                </button>
              </div>
            </details>
          )}
          {mission && (
            <p className="tabular-nums">
              {t('missionCredit', {
                customer: mission.customer,
                credited: formatFixed(mission.creditedKg, 1),
                target: formatFixed(mission.targetKg, 0),
                deferred: formatFixed(Math.max(0, mission.originalTargetKg - mission.targetKg), 0),
                remaining: formatFixed(
                  Math.max(0, mission.originalTargetKg - mission.creditedKg),
                  0
                ),
              })}
              {mission.creditedKg >= mission.originalTargetKg && t('fullDispatchedSuffix')}
            </p>
          )}
          {campaign?.followOn ? (
            <>
              <p className="tabular-nums">
                {t('followOnCredit', {
                  customer: campaign.followOn.customer,
                  credited: formatFixed(campaign.followOn.creditedKg, 1),
                })}
              </p>
              <FollowOnNotice state={state} />
            </>
          ) : (
            campaign?.mission &&
            campaign.mission.creditedKg + 1e-6 >= campaign.mission.originalTargetKg && (
              <p>
                {nextLinkCustomer
                  ? t('followOnPending', { customer: nextLinkCustomer })
                  : t(campaign.shift >= 2 ? 'followOnNoneLastShift' : 'followOnNone')}
              </p>
            )
          )}
          <div>
            <h4 className="font-semibold text-white">{t('chooseResponse')}</h4>
            <p className="mt-1">
              {t('targetLine', {
                target: formatFixed(displayTarget, 0),
                capacity: formatFixed(workplaceCapacity(state), 2),
              })}
            </p>
            {campaign?.shift === 2 && (
              <p className="mt-2 text-cyan-100">{t('shiftThreeResponseNote')}</p>
            )}
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
                target: formatFixed(displayTarget, 0),
              })}
            </p>
            <p className="mt-2">{t('alternativesNote')}</p>
            <p className="mt-2">{t('dispatchUncertain')}</p>
            <button
              className={`${buttonClass} mt-2`}
              onClick={() => setSection('Agreement / Voices')}
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
            <button className={buttonClass} onClick={() => report(store.stop())}>
              {t('endShift')}
            </button>
          )}
          <p>{t('creditsNote')}</p>
        </div>
      )}

      {section === 'Practices' && (
        <div className="space-y-4">
          <p className="text-cyan-100">{t('alwaysActive')}</p>
          <fieldset disabled={!canConfigure} className="space-y-3">
            <legend className="mb-2 font-semibold text-white">{t('chooseApproach')}</legend>
            <p>{t('approachNote')}</p>
            {MANAGEMENT_APPROACHES.map((approach) => (
              <div key={approach.id} className="space-y-1">
                <button
                  className={buttonClass}
                  aria-pressed={
                    JSON.stringify(approach.settings) ===
                    JSON.stringify({
                      practices: state.practices,
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
                <option value="individual">{t('individualChoice')}</option>
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
                  report(store.configure({ governance: e.target.value as typeof state.governance }))
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
          <p>{t('agreementIntro')}</p>
          {state.mode === 'game' && (
            <button
              className={buttonClass}
              disabled={!manual || store.participationMode === 'separate-turns'}
              onClick={() => report(store.simulateResponses())}
            >
              {t('hearResponses')}
            </button>
          )}
          {state.mode === 'workshop' && <p>{t('manualWorkshopNote')}</p>}
          {pilot && <p className="text-amber-100">{t('pilotDenies')}</p>}
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
              <p>
                {store.participationMode === 'separate-turns' ? t('turnsOwn') : t('simulatedOther')}{' '}
                {t('answerPacking')}
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
                  store.participationMode === 'separate-turns' && store.turn?.actorId !== member.id
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
                  onClick={() => report(store.understand(member.id))}
                >
                  {t('confirmUnderstanding', { role: member.role })}
                </button>
                <div className="flex flex-wrap gap-2">
                  <button
                    className={buttonClass}
                    disabled={!manual}
                    onClick={() => report(store.vote(member.id, true))}
                  >
                    {t('policyYes', { role: member.role })}
                  </button>
                  <button
                    className={buttonClass}
                    disabled={!manual}
                    onClick={() => report(store.vote(member.id, false))}
                  >
                    {t('policyNo', { role: member.role })}
                  </button>
                </div>
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
                    onClick={() => report(store.consentToCover(member.id, true))}
                  >
                    {t('acceptCover', { role: member.role })}
                  </button>
                  <button
                    className={buttonClass}
                    disabled={!manual || plan.optionalCoverMinutes === 0}
                    onClick={() => report(store.consentToCover(member.id, false))}
                  >
                    {t('declineCover', { role: member.role })}
                  </button>
                </div>
                <p>{t('sharingNote')}</p>
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
                  onClick={() => report(store.sharePreference(member.id, !member.sharing))}
                >
                  {member.sharing ? t('revokeSharing') : t('shareForPlanning')}: {member.role}
                </button>
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
                  <button className={buttonClass} onClick={() => report(store.withdraw(member.id))}>
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
              onClick={() => report(store.object(actor, kind))}
            >
              {t('recordObjection')}
            </button>
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
                  : {objection.statement} ({t('objectionStatus', { status: objection.status })})
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
                          {state.members.find((member) => member.id === objection.actorId)?.role ??
                            t('aiMind')}
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
                      onClick={() =>
                        report(
                          store.resolveObjection(
                            objection.id,
                            store.participationMode === 'separate-turns'
                              ? actor
                              : resolvers[objection.id]
                          )
                        )
                      }
                    >
                      {t('authorConfirms')}
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
          <div className="space-y-2 border-t border-slate-700 pt-3">
            <h4 className="font-semibold text-white">{t('executionConditions')}</h4>
            {readiness.reasons.length ? (
              <ul className="list-disc space-y-1 pl-4">
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
              onClick={() => void activate()}
            >
              {busy
                ? t('checkingAgreement')
                : state.mode === 'workshop'
                  ? t('recordWorkshopAgreement')
                  : t('approveAndRun')}
            </button>
            <p>{state.mode === 'workshop' ? t('workshopRecordsNote') : t('executionRequires')}</p>
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
                  delivered: formatFixed(outcomes.delivery.deliveredKg, 1),
                  target: formatFixed(outcomes.delivery.targetKg, 0),
                  customer: outcomes.delivery.customer,
                })}
              </p>
              {mission && (
                <p>
                  {t('remainingCommitment', {
                    kg: formatFixed(outcomes.delivery.remainingKg, 0),
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
                <p>{t('agreedDeferral', { kg: formatFixed(outcomes.delivery.deferredKg, 0) })}</p>
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
                      ? t('shippedDuringShift', { kg: formatFixed(shift.shippedKg, 1) })
                      : t('shippedOfTarget', {
                          kg: formatFixed(shift.shippedKg, 1),
                          target: formatPlain(shift.targetKg),
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
                <p>{t('relationshipIntro')}</p>
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
                <p>{t('retentionNote')}</p>
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
                  setSection('Experiment');
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
              {state.mode === 'game' &&
                state.members.some((member) => member.recoveryOwedMinutes > 0) && (
                  <p>{t('outstandingRecovery')}</p>
                )}
              {campaign?.shift === 2 ? (
                <p className="font-semibold text-cyan-100">
                  {campaignComplete(state) ? t('campaignCompleteMessage') : t('campaignIncomplete')}
                </p>
              ) : (
                <button
                  className={buttonClass}
                  disabled={
                    state.members.some((member) => member.recoveryOwedMinutes > 0) ||
                    (!!campaign && state.objections.some((item) => item.status === 'open'))
                  }
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
              )}
            </div>
          )}
          <p>
            {t('shippedOf', {
              shipped: formatFixed(mission?.creditedKg ?? state.shippedKg, 1),
              target: formatFixed(displayTarget, 0),
            })}{' '}
            {state.reviewReason ?? t('reviewOpens')}
          </p>
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
            <p>{t('confirmationsExpire')}</p>
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
              onClick={() => report(store.elect(voter, candidate))}
            >
              {t('recordChairBallot')}
            </button>
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
            <p>{t('surplusDefinition')}</p>
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
            <p className="tabular-nums text-slate-300">
              {destination === 'reserve'
                ? t('retainSurplus', { amount: formatFixed(surplus, 2) })
                : destination === 'members'
                  ? t('distributeSurplus', {
                      amount: formatFixed(surplus, 2),
                      perMember: formatFixed(surplus / state.members.length, 2),
                    })
                  : t('allocateSurplus', { amount: formatFixed(surplus, 2) })}{' '}
              {t('ballotsRequired')}
            </p>
            {!sharedSurplus && <p className="text-amber-100">{t('surplusCharter')}</p>}
            {sharedSurplus && surplus <= 1e-8 && !state.distributionComplete && (
              <p className="tabular-nums text-amber-100">
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
              onClick={() => report(store.distributeSurplus())}
            >
              {t('executeAllocation')}
            </button>
            {state.distributionComplete && <p>{t('allocationRecorded')}</p>}
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
                    actor: event.actorId,
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
          <WorkplaceReplay seed={safeSeed} validSeed={validSeed} navigate={setSection} />
          <h4 className="font-semibold text-white">{t('teachingForecasts')}</h4>
          <div className="space-y-2">
            <h4 className="font-semibold text-white">{t('samePressure')}</h4>
            <p>{t('compareCurrentPlan', { plan: plan.title })}</p>
            <button
              className={buttonClass}
              disabled={!validSeed}
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
            <p>{t('forecastsSeparate')}</p>
            <p>{t('standaloneExercise')}</p>
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
                onChange={(e) => {
                  setSeed(e.target.value);
                  setComparison(null);
                }}
              />
            </label>
            <button
              className={buttonClass}
              disabled={!validSeed}
              onClick={() => setComparison(compareWorkplacePlans(safeSeed))}
            >
              {t('compareAllPlans')}
            </button>
            {state.phase === 'deliberating' && (
              <>
                <button
                  className={buttonClass}
                  disabled={!validSeed}
                  onClick={() => report(store.start(state.mode, safeSeed))}
                >
                  {t('restartDiscussion')}
                </button>
                <p>{t('restartClears')}</p>
              </>
            )}
            <p>{t('illustrativeForecasts')}</p>
            {comparison?.map((arm) => (
              <p key={arm.planId} className="tabular-nums">
                <strong className="text-white">{arm.title}</strong>
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
            <p>{t('localDownload')}</p>
            <WorkplacePracticeProposal state={state} />
          </div>
        </div>
      )}
    </section>
  );
};
