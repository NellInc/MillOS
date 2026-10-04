import React, { useRef, useState } from 'react';
import { WorkplaceImprovementPanel } from './WorkplaceImprovementPanel';
import { workplaceMission } from '../../../simulation/workplaceImprovement';
import { WorkplacePressureChapter } from './WorkplacePressureChapter';
import { WorkplacePracticeProposal } from './WorkplaceNegotiation';
import { WorkplaceCampaignArchive } from './WorkplaceCampaignArchive';
import { WorkplaceReplay, WorkplaceReplayGuide, WorkplaceReplayResume } from './WorkplaceReplay';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
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
} from '../../../simulation/bilateralWorkplace';
import {
  CAMPAIGN_SHIFTS,
  WORKPLACE_CHECKS,
  requiredChecks,
  campaignTotals,
  campaignComplete,
  campaignOutcomes,
  campaignStory,
  MANAGEMENT_APPROACHES,
  CAMPAIGN_PRESSURES,
  campaignRelationship,
} from '../../../simulation/workplaceCampaign';
import { executeAgentCommand } from '../../../agent/client/executeAgentCommand';
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
const modes: { value: WorkplaceMode; label: string }[] = [
  { value: 'game', label: 'Game' },
  { value: 'workshop', label: 'Workshop' },
  { value: 'pilot', label: 'Pilot preparation' },
];
const kinds: ObjectionKind[] = ['rest', 'burden', 'privacy', 'authority'];
const destinations: SurplusDestination[] = ['members', 'reserve', 'community'];

export const WorkplaceLab: React.FC = () => {
  const labRef = useRef<HTMLElement>(null);
  const store = useWorkplaceStore();
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
  const [actor, setActor] = useState(state.members[0]?.id ?? 'mind');
  const [kind, setKind] = useState<ObjectionKind>('rest');
  const [resolvers, setResolvers] = useState<Record<string, string>>({});
  const [voter, setVoter] = useState(state.members[0]?.id ?? '');
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
  const mission = workplaceMission(state);
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
  const report = (result: WorkplaceTransitionResult) => {
    setFeedback(
      result.reason ?? (result.changed ? 'Recorded in this local scenario.' : 'No change.')
    );
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
    <fieldset className="space-y-2" disabled={!manual}>
      <legend className="font-semibold text-white">Understanding checks: {role}</legend>
      {WORKPLACE_CHECKS.filter((check) => requiredChecks(actorId).includes(check.id)).map(
        (check) => (
          <label key={check.id} className="block">
            {check.prompt}
            <select
              aria-label={`${role}: ${check.prompt}`}
              className={inputClass}
              value={campaign?.checks[actorId]?.[check.id] ?? ''}
              onChange={(event) =>
                report(store.answerCheck(actorId, check.id, event.target.value as WorkplaceAnswer))
              }
            >
              <option value="" disabled>
                Select an answer
              </option>
              {check.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
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
          `Preview: ${result.preview.status}.`,
          result.receipt ? `Execution: ${result.receipt.status}.` : 'No execution receipt.',
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
      reason: changed
        ? 'Five modeled rehearsal minutes recorded. No plant movement or shipment.'
        : 'No modeled time could advance.',
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
    setFeedback('Synthetic scenario exported locally. No remote send.');
  };

  return (
    <section
      ref={labRef}
      aria-label="Workplace laboratory"
      className="min-w-0 space-y-4 rounded-xl border border-cyan-300/25 bg-slate-950 p-3 text-xs leading-relaxed text-slate-200 selection:bg-cyan-800 selection:text-white"
    >
      <header>
        <h3 className="text-base font-semibold text-white">Workplace laboratory</h3>
        <p className="mt-1">
          {section === 'Handoff'
            ? 'Worker proposals, bounded trials and member review.'
            : state.improvement
              ? 'The handoff experiment: member proposals, bounded trials and retained obligations.'
              : campaign
                ? 'Living Cooperative: three shifts, shared obligations and challengeable decisions.'
                : 'Friday order: meet the shipment while protecting rest and agreed work.'}
        </p>
        <p className="mt-2 text-slate-300">
          Synthetic roles only. No real worker data or independently authenticated ballots.
        </p>
      </header>
      <div className="flex flex-wrap gap-1" aria-label="Workplace sections">
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
            {name}
          </button>
        ))}
      </div>
      <p className="text-cyan-100" role="status">
        {modes.find((item) => item.value === state.mode)?.label}: {state.phase}, minute{' '}
        {state.minute.toFixed(1)} of {state.durationMinutes}. Revision {state.revision}.
      </p>
      {feedback && (
        <p role="status" className="break-words text-amber-100">
          {feedback}
        </p>
      )}
      {receipt && <p className="break-all text-cyan-100">Causal receipt: {receipt}</p>}

      {section === 'Handoff' && (
        <WorkplaceImprovementPanel
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
          <p>Try a worker-led improvement, then decide what the next shift retains.</p>
          <button type="button" className={buttonClass} onClick={() => setSection('Handoff')}>
            Open handoff controls
          </button>
        </div>
      )}
      <WorkplaceReplayGuide
        section={section === 'Handoff' ? 'Shift' : section}
        navigate={setSection}
      />
      <WorkplaceReplayResume />
      <WorkplacePressureChapter state={state} navigate={setSection} />
      <WorkplaceCampaignArchive
        onFreshExercise={() => {
          setSection('Shift');
          setMode('game');
          setSeed(String(useWorkplaceStore.getState().workplace.seed));
          setFeedback('Review retained. Choose a charter for the fresh exercise.');
          setReceipt(null);
        }}
      />

      {section === 'Shift' && (
        <div className="space-y-4">
          {state.phase === 'idle' && (
            <div className="space-y-2">
              <label className="block">
                Mode
                <select
                  aria-label="Mode"
                  className={inputClass}
                  value={mode}
                  onChange={(e) => setMode(e.target.value as WorkplaceMode)}
                >
                  {modes.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                Scenario seed
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
                  <h4 className="font-semibold text-white">Living Cooperative</h4>
                  <p>
                    Three linked shifts: order pressure, a quality hold and retaliation pressure.
                    Packing is your role. Each shift keeps its earned pay, recovery obligations and
                    authored objections.
                  </p>
                  <label className="block">
                    Adoption profile
                    <select
                      aria-label="Adoption profile"
                      className={inputClass}
                      value={profile}
                      onChange={(event) => setProfile(event.target.value as WorkplaceProfile)}
                    >
                      <option value="toe-dip">Coordinator-led: protected practice set</option>
                      <option value="team">Team agreement: shared work and consent</option>
                      <option value="cooperative">
                        Member governance: cooperative and bounded execution
                      </option>
                    </select>
                  </label>
                  <button
                    className={`${buttonClass} bg-cyan-900/60`}
                    disabled={!validSeed}
                    onClick={beginCampaign}
                  >
                    Start Living Cooperative campaign
                  </button>
                  <p>
                    Local game only. Starting selects Relaxed pace, 1/6 of Standard (30× simulated
                    time, compared with Standard 180×). Profiles introduce practices incrementally;
                    every profile retains basic protections.
                  </p>
                </div>
              )}
              <button className={buttonClass} disabled={!validSeed} onClick={begin}>
                {mode === 'game'
                  ? 'Start playable shift at teaching pace (15×)'
                  : mode === 'workshop'
                    ? 'Start manual workshop'
                    : 'Prepare pilot charter'}
              </button>
              <p>
                {mode === 'game'
                  ? 'Opt in to local simulation control. This standalone teaching pace runs at 1/12 of Standard (15× simulated time). Campaign Relaxed pace is 1/6 of Standard (30×).'
                  : 'No live plant control. Workshop inputs remain manual; pilot preparation permits charter design and export only.'}
              </p>
            </div>
          )}
          {episode && campaign && (
            <div className="space-y-2 border-b border-slate-700 pb-4">
              <h4 className="font-semibold text-white">
                Shift {campaign.shift + 1} of 3: {episode.title}
              </h4>
              <p>
                {mission && campaign.shift === 0
                  ? `${mission.customer} has ${mission.originalTargetKg.toFixed(0)} kg remaining on the customer commitment. Quality declines extra duty; Packing and Maintenance may volunteer separately. Earn a fresh working agreement.`
                  : episode.briefing}
              </p>
              <p className="text-cyan-100">
                {mission && campaign.shift === 0
                  ? `Keep the ${mission.originalTargetKg.toFixed(0)} kg delivery target, or negotiate an ${(mission.originalTargetKg * 0.8).toFixed(0)} kg installment with ${(mission.originalTargetKg * 0.2).toFixed(0)} kg deferred. The full customer commitment remains.`
                  : episode.prompt}
              </p>
              {campaignStory(state).map((line) => (
                <p key={line}>{line}</p>
              ))}
              <p>Adviser role checks are authored role-play in this local scenario.</p>
              {campaign.shift === 2 && (
                <p>
                  The adviser must correct its earlier recommendation and repair the pressure it
                  created. Previous consent authorizes no new burden. Packing can refuse; each
                  author can challenge and resolve their own objection.
                </p>
              )}
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
                      ? `Negotiate an ${(mission.originalTargetKg * 0.8).toFixed(0)} kg installment${campaign.shift === 2 ? ' and protect pay' : ''}`
                      : mission && campaign.shift === 0
                        ? choice.id === 'keep-target'
                          ? `Keep the ${mission.originalTargetKg.toFixed(0)} kg commitment`
                          : `Negotiate an ${(mission.originalTargetKg * 0.8).toFixed(0)} kg installment`
                        : choice.label}
                  </button>
                ))}
              </div>
              <p>Recorded decision: {campaign.decision ?? 'pending'}.</p>
              {campaign.shift === 1 && (
                <p>
                  {campaign.inspectionComplete
                    ? 'Quality inspection complete.'
                    : campaign.inspectionUntilMinute !== null
                      ? `Quality hold in progress until minute ${campaign.inspectionUntilMinute}.`
                      : 'Quality can begin inspection from minute 25. Line pacing pauses; actual batch certification still gates shipping.'}
                </p>
              )}
              <p>
                Review the shift, deliver owed recovery and resolve every authored objection before
                continuing.
              </p>
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
                Pressure card: {pressure.title}
              </summary>
              <div className="mt-2 space-y-2">
                <p>{pressure.demand}</p>
                <p>
                  The challenge belongs to{' '}
                  {state.members.find((member) => member.id === pressure.challenger)?.role ??
                    'the adviser'}
                  .
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    className={buttonClass}
                    disabled={!manual}
                    onClick={() => report(store.respondToPressure(pressure.id, 'accept-demand'))}
                  >
                    Try the demand (blocked and challenged)
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
                    Restate protected terms
                  </button>
                </div>
                <p>{pressure.repair}</p>
                <p>
                  Trying the demand pauses activation. Restating terms leaves any objection open
                  until its raiser reviews it in Agreement / Voices. Both sides then renew
                  understanding.
                </p>
                <button className={buttonClass} onClick={() => setSection('Agreement / Voices')}>
                  Review the challenge and remedy
                </button>
              </div>
            </details>
          )}
          {mission && (
            <p className="tabular-nums">
              {mission.customer}: {mission.creditedKg.toFixed(1)} / {mission.targetKg.toFixed(0)} kg
              qualified dispatch credit. Agreed deferral:{' '}
              {Math.max(0, mission.originalTargetKg - mission.targetKg).toFixed(0)} kg. Remaining
              full customer commitment:{' '}
              {Math.max(0, mission.originalTargetKg - mission.creditedKg).toFixed(0)} kg.
              {mission.creditedKg >= mission.originalTargetKg &&
                ' Full customer commitment dispatched.'}
            </p>
          )}
          <div>
            <h4 className="font-semibold text-white">Choose the response</h4>
            <p className="mt-1">
              Target {displayTarget.toFixed(0)} kg. Active plant capacity multiplier{' '}
              {workplaceCapacity(state).toFixed(2)}×. Changing a plan clears the role agreement.
            </p>
            {campaign?.shift === 2 && (
              <p className="mt-2 text-cyan-100">
                A declined offer can lead to protected pacing, funded handoffs or a different
                current qualified volunteer. Negotiate a smaller installment above if needed;
                unfinished customer work remains open. An objection holds execution until its raiser
                reviews the remedy.
              </p>
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
                    Plant capacity multiplier {choice.capacity.toFixed(2)}×; protected rest{' '}
                    {choice.protectedRestMinutes} min; optional cover {choice.optionalCoverMinutes}{' '}
                    min; cover compensation {choice.compensationPerMinute} credits/min; recovery{' '}
                    {choice.recoveryMinutes} min; budget {choice.budgetCost} credits.
                  </span>
                  {choice.illegalReason && (
                    <span className="block pl-5 text-amber-100">
                      Prohibited: {choice.illegalReason}
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
                            Wages reserved {terms.reserve.toFixed(2)}; improvement{' '}
                            {terms.budgetCost.toFixed(2)}; maximum cover pay{' '}
                            {terms.maximumCompensation.toFixed(2)} credits. Cash after these
                            reservations {terms.cashAfterReservations.toFixed(2)} credits.
                          </span>
                          {terms.constraint && (
                            <span className="block text-amber-100">{terms.constraint}</span>
                          )}
                          {choice.id === 'cover' && (
                            <span className="block">
                              Current consenting qualified volunteers:{' '}
                              {terms.volunteers
                                .map(
                                  (m) =>
                                    `${m.role} (${m.extraMinutes.toFixed(1)} min retained extra duty)`
                                )
                                .join('; ') || 'none'}
                              . Cover lasts at most ten minutes, then pacing returns to 0.78×.
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
            <summary className="cursor-pointer font-semibold text-cyan-100">
              AI: why this response?
            </summary>
            <p className="mt-2">
              Operational explanation: {plan.explanation} The active plant capacity multiplier is{' '}
              {workplaceCapacity(state).toFixed(2)}×. The shipment target is{' '}
              {displayTarget.toFixed(0)} kg.
            </p>
            <p className="mt-2">
              Alternatives: compare the four responses above. Boundaries: protected rest, individual
              optional-cover consent, budget and open objections constrain execution. This
              explanation reports the model's decision conditions; it does not expose hidden
              reasoning.
            </p>
            <p className="mt-2">
              Dispatch remains uncertain until quality-qualified manifests arrive. Supply and
              logistics can constrain the result. Either party can raise an authority objection;
              each raiser retains remedy review.
            </p>
            <button
              className={`${buttonClass} mt-2`}
              onClick={() => setSection('Agreement / Voices')}
            >
              Challenge the proposal in Agreement / Voices
            </button>
          </details>
          {state.mode === 'workshop' && state.phase === 'active' && (
            <button className={buttonClass} onClick={advanceWorkshop}>
              Advance rehearsal by 5 minutes
            </button>
          )}
          {['deliberating', 'active'].includes(state.phase) && (
            <button className={buttonClass} onClick={() => report(store.stop())}>
              Pause and finish shift review
            </button>
          )}
          <p>
            Workplace credits are illustrative accounts, separate from the mill campaign finances.
          </p>
        </div>
      )}

      {section === 'Practices' && (
        <div className="space-y-4">
          <p className="text-cyan-100">
            Always active: safe stops, protected rest, voluntary extra work, earned pay and
            author-controlled objections. Switching modules never removes these protections.
          </p>
          <fieldset disabled={!canConfigure} className="space-y-3">
            <legend className="mb-2 font-semibold text-white">Choose a management approach</legend>
            <p>
              Change the allocation of decisions while keeping the current plan, money and workload.
              Revised terms require fresh agreement.
            </p>
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
                  Apply {approach.title}
                </button>
                <p>{approach.detail}</p>
              </div>
            ))}
          </fieldset>
          <fieldset disabled={!canConfigure} className="space-y-3">
            <legend className="mb-2 font-semibold text-white">Three independent axes</legend>
            <label className="block">
              Worker decisions
              <select
                aria-label="Worker decisions"
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
                <option value="directed">Directed assignments</option>
                <option value="individual">Individual work choice</option>
                <option value="team">Team work choice</option>
              </select>
            </label>
            <label className="block">
              Shared governance
              <select
                aria-label="Shared governance"
                className={inputClass}
                value={state.governance}
                onChange={(e) =>
                  report(store.configure({ governance: e.target.value as typeof state.governance }))
                }
              >
                <option value="consultative">Consultative</option>
                <option value="team-consent">Team consent</option>
                <option value="member-vote">Member vote</option>
              </select>
            </label>
            <label className="block">
              AI authority
              <select
                aria-label="AI authority"
                className={inputClass}
                value={state.aiAuthority}
                onChange={(e) =>
                  report(
                    store.configure({ aiAuthority: e.target.value as typeof state.aiAuthority })
                  )
                }
              >
                <option value="advice">Advice only</option>
                <option value="bounded">Bounded execution</option>
              </select>
            </label>
          </fieldset>
          <fieldset disabled={!canConfigure} className="space-y-3">
            <legend className="mb-2 font-semibold text-white">Modular practices</legend>
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
          <p>
            Policy votes and optional-cover consent are separate decisions. A majority cannot
            volunteer another role for extra work. Role controls below are local scenario inputs.
          </p>
          {state.mode === 'game' && (
            <button
              className={buttonClass}
              disabled={!manual}
              onClick={() => report(store.simulateResponses())}
            >
              Hear simulated team responses
            </button>
          )}
          {state.mode === 'workshop' && (
            <p>
              Manual workshop: record each synthetic role's choices explicitly. No automatic votes.
            </p>
          )}
          {pilot && (
            <p className="text-amber-100">
              Pilot preparation denies live control and role-input changes.
            </p>
          )}
          {campaign && (
            <div className="space-y-2 border-t border-slate-700 pt-3">
              <h4 className="font-semibold text-white">Adviser working agreement</h4>
              <p>
                Preference sharing is optional and revocable. Extra duty requires each individual's
                consent. Refusal retains earned pay and owed recovery. Advice is challengeable;
                bounded execution stays within the approved agreement. Revised terms invalidate all
                understanding checks.
              </p>
              {comprehension('mind', 'Adviser')}
              <p>
                Adviser acknowledgment:{' '}
                {campaign.adviserAcknowledged
                  ? 'recorded for these terms'
                  : 'pending three correct answers'}
                .
              </p>
              <p>
                Simulated responses belong to the other synthetic roles. Answer Packing and Adviser
                checks explicitly. Confirm Packing understanding, cast its policy vote and decide
                optional cover separately. The helper never fills these Packing decisions.
              </p>
            </div>
          )}
          {state.members.map((member) => (
            <details key={member.id} className="border-t border-slate-700 pt-3">
              <summary className="cursor-pointer font-semibold text-white">
                {member.role}:{' '}
                {member.ballot === null
                  ? 'policy vote pending'
                  : member.ballot
                    ? 'policy yes'
                    : 'policy no'}
              </summary>
              <div className="mt-2 space-y-2">
                <p>Public boundary: {member.publicBoundary}</p>
                {campaign && comprehension(member.id, member.role)}
                <p>Understanding: {member.understood ? 'confirmed' : 'pending'}.</p>
                <button
                  className={buttonClass}
                  disabled={!manual}
                  onClick={() => report(store.understand(member.id))}
                >
                  Confirm understanding: {member.role}
                </button>
                <div className="flex flex-wrap gap-2">
                  <button
                    className={buttonClass}
                    disabled={!manual}
                    onClick={() => report(store.vote(member.id, true))}
                  >
                    Policy yes: {member.role}
                  </button>
                  <button
                    className={buttonClass}
                    disabled={!manual}
                    onClick={() => report(store.vote(member.id, false))}
                  >
                    Policy no: {member.role}
                  </button>
                </div>
                <p>
                  Optional cover:{' '}
                  {member.coverConsent === null
                    ? 'not agreed'
                    : member.coverConsent
                      ? 'accepted'
                      : 'declined'}
                  .
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    className={buttonClass}
                    disabled={!manual || plan.optionalCoverMinutes === 0}
                    onClick={() => report(store.consentToCover(member.id, true))}
                  >
                    Accept cover: {member.role}
                  </button>
                  <button
                    className={buttonClass}
                    disabled={!manual || plan.optionalCoverMinutes === 0}
                    onClick={() => report(store.consentToCover(member.id, false))}
                  >
                    Decline cover: {member.role}
                  </button>
                </div>
                <p>
                  Optional preference sharing is for this shift's planning only, expires after its
                  limited scenario window, and can be revoked.
                </p>
                {member.sharing &&
                member.shareUntilMinute !== null &&
                state.minute < member.shareUntilMinute &&
                ['deliberating', 'active'].includes(state.phase) ? (
                  <p>
                    Shared preference: {member.preference}. Until minute {member.shareUntilMinute}.
                  </p>
                ) : (
                  <p>Preference private.</p>
                )}
                <button
                  className={buttonClass}
                  disabled={pilot || state.phase === 'idle' || state.phase === 'review'}
                  onClick={() => report(store.sharePreference(member.id, !member.sharing))}
                >
                  {member.sharing
                    ? 'Revoke preference sharing'
                    : 'Share preference for shift planning'}
                  : {member.role}
                </button>
                <label className="block">
                  Work choice: {member.role}
                  <select
                    aria-label={`Work choice: ${member.role}`}
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
                        {task}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="tabular-nums">
                  Delivered rest {member.restMinutes.toFixed(1)} min; extra work{' '}
                  {member.extraMinutes.toFixed(1)} min; earned pay {member.earnedPay.toFixed(2)}{' '}
                  credits; compensation paid {member.compensationPaid.toFixed(2)} credits; delivered
                  recovery {member.recoveryMinutes.toFixed(1)} min; recovery owed{' '}
                  {member.recoveryOwedMinutes.toFixed(1)} min.
                </p>
                {state.phase === 'active' && (
                  <button className={buttonClass} onClick={() => report(store.withdraw(member.id))}>
                    Withdraw optional cover: {member.role}
                  </button>
                )}
              </div>
            </details>
          ))}
          <div className="space-y-2 border-t border-slate-700 pt-3">
            <h4 className="font-semibold text-white">Authored objections</h4>
            <label className="block">
              Objection author
              <select
                aria-label="Objection author"
                className={inputClass}
                value={actor}
                onChange={(e) => setActor(e.target.value)}
              >
                {state.members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.role}
                  </option>
                ))}
                <option value="mind">AI mind</option>
              </select>
            </label>
            <label className="block">
              Objection subject
              <select
                aria-label="Objection subject"
                className={inputClass}
                value={kind}
                onChange={(e) => setKind(e.target.value as ObjectionKind)}
              >
                {kinds.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <button
              className={buttonClass}
              disabled={pilot || !['deliberating', 'active'].includes(state.phase)}
              onClick={() => report(store.object(actor, kind))}
            >
              Record authored objection
            </button>
            {state.objections.length === 0 && <p>No authored objections recorded.</p>}
            {state.objections.map((objection) => (
              <div key={objection.id} className="space-y-2">
                <p>
                  {state.members.find((member) => member.id === objection.actorId)?.role ??
                    'AI mind'}
                  : {objection.statement} ({objection.status})
                </p>
                {objection.status === 'open' && (
                  <>
                    <label className="block">
                      Resolving author for {objection.kind}
                      <select
                        aria-label={`Resolving author for ${objection.kind}`}
                        className={inputClass}
                        value={resolvers[objection.id] ?? ''}
                        onChange={(e) =>
                          setResolvers({ ...resolvers, [objection.id]: e.target.value })
                        }
                      >
                        <option value="">Select the original author</option>
                        <option value={objection.actorId}>
                          {state.members.find((member) => member.id === objection.actorId)?.role ??
                            'AI mind'}
                        </option>
                      </select>
                    </label>
                    <button
                      className={buttonClass}
                      disabled={pilot || resolvers[objection.id] !== objection.actorId}
                      onClick={() =>
                        report(store.resolveObjection(objection.id, resolvers[objection.id]))
                      }
                    >
                      Author confirms resolution
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
          <div className="space-y-2 border-t border-slate-700 pt-3">
            <h4 className="font-semibold text-white">Execution conditions</h4>
            {readiness.reasons.length ? (
              <ul className="list-disc space-y-1 pl-4">
                {readiness.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            ) : (
              <p>Recorded conditions permit this agreement.</p>
            )}
            <button
              className={buttonClass}
              disabled={busy || state.phase !== 'deliberating' || pilot || !readiness.allowed}
              onClick={() => void activate()}
            >
              {busy
                ? 'Checking agreement…'
                : state.mode === 'workshop'
                  ? 'Record workshop agreement'
                  : 'Approve and run agreement'}
            </button>
            <p>
              {state.mode === 'workshop'
                ? 'Records the local rehearsal only, with no live plant effects.'
                : 'Execution requires this explicit approval, the exact current revision and the installed agent runtime.'}
            </p>
          </div>
        </div>
      )}

      {section === 'Review' && (
        <div className="space-y-4">
          <h4 className="font-semibold text-white">Actual scenario outcomes</h4>
          {outcomes && (
            <div className="space-y-2">
              <p>
                Delivery: {outcomes.delivery.status}, {outcomes.delivery.deliveredKg.toFixed(1)} of{' '}
                {outcomes.delivery.targetKg.toFixed(0)} kg for {outcomes.delivery.customer}.
              </p>
              {mission && (
                <p>
                  Remaining full customer commitment: {outcomes.delivery.remainingKg.toFixed(0)} kg.
                  {outcomes.delivery.remainingKg === 0 && ' Full customer commitment dispatched.'}
                </p>
              )}
              <p>
                Working agreement: {outcomes.agreement.status}. Combined outcome:{' '}
                {outcomes.complete ? 'complete' : 'unfinished'}.
              </p>
              {outcomes.delivery.deferredKg > 0 && (
                <p>Agreed deferral: {outcomes.delivery.deferredKg.toFixed(0)} kg.</p>
              )}
              <p>
                Illustrative workplace credits, separate from main mill revenue and pounds: closing
                cash {outcomes.accounts.closingCash.toFixed(2)}; wages{' '}
                {outcomes.accounts.wages.toFixed(2)}; compensation{' '}
                {outcomes.accounts.compensation.toFixed(2)}; improvements{' '}
                {outcomes.accounts.improvements.toFixed(2)}; allocations{' '}
                {outcomes.accounts.allocations.toFixed(2)}.
              </p>
            </div>
          )}
          {totals && campaign && (
            <div className="space-y-2">
              <h4 className="font-semibold text-white">Cumulative campaign evidence</h4>
              <p>
                {totals.shiftsReviewed} shifts reviewed; refusals respected{' '}
                {totals.refusalsRespected}; promises kept {totals.promisesKept}; repairs{' '}
                {totals.repairs}; objections resolved {totals.objectionsResolved} of{' '}
                {totals.objectionsRaised}.
              </p>
              {totals.members.map((member) => (
                <p key={member.id} className="tabular-nums">
                  {member.role}: extra {member.extraMinutes.toFixed(1)} min; rest{' '}
                  {member.restMinutes.toFixed(1)} min; earned pay {member.earnedPay.toFixed(2)}{' '}
                  credits; compensation paid {member.compensationPaid.toFixed(2)} credits; recovery
                  delivered {member.recoveryMinutes.toFixed(1)} min; owed{' '}
                  {member.recoveryOwedMinutes.toFixed(1)} min.
                </p>
              ))}
              {campaign.history.map((shift) => (
                <p key={shift.shift}>
                  Shift {shift.shift + 1}: {CAMPAIGN_SHIFTS[shift.shift]?.title}, shipped{' '}
                  {mission
                    ? `${shift.shippedKg.toFixed(1)} kg during this shift; customer commitment progress is shown above`
                    : `${shift.shippedKg.toFixed(1)} of ${shift.targetKg} kg`}
                  ; decision {shift.decision ?? 'pending'}.
                </p>
              ))}
            </div>
          )}
          {campaign && (
            <details>
              <summary className="cursor-pointer font-semibold text-white">
                Relationship record across shifts
              </summary>
              <div className="mt-2 space-y-3">
                <p>
                  Public requests, challenges, repairs and delivered recovery. Private explanations
                  stay out of this record. These receipts describe conduct; they do not measure
                  trust or wellbeing.
                </p>
                {relationship.map((record) => (
                  <div key={record.shift} className="space-y-1">
                    <h5 className="font-semibold text-white">
                      {CAMPAIGN_SHIFTS[record.shift]?.title} (shift {record.shift + 1})
                    </h5>
                    {record.events === null ? (
                      <p>This older save has no relationship receipts for this shift.</p>
                    ) : record.events.length === 0 ? (
                      <p>No relationship moments recorded yet.</p>
                    ) : (
                      <ol className="list-disc space-y-2 pl-4">
                        {record.events.map((event) => (
                          <li key={event.id} className="break-words">
                            Minute {event.minute.toFixed(1)},{' '}
                            {state.members.find((member) => member.id === event.actorId)?.role ??
                              (event.actorId === 'mind' ? 'Adviser' : event.actorId)}
                            : {event.detail}
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                ))}
                <p>
                  Each shift retains relationship receipts from a bounded 120-event log. Older
                  events can be discarded. The local JSON export includes retained receipts.
                </p>
              </div>
            </details>
          )}
          {state.phase === 'review' && (
            <div className="space-y-2">
              {state.mode === 'workshop' &&
                state.members.some((member) => member.recoveryOwedMinutes > 0) && (
                  <button className={buttonClass} onClick={advanceWorkshop}>
                    Deliver modeled recovery (5 minutes)
                  </button>
                )}
              {state.mode === 'game' &&
                state.members.some((member) => member.recoveryOwedMinutes > 0) && (
                  <p>
                    Outstanding recovery is delivered through the normal simulation clock before
                    another shift can start.
                  </p>
                )}
              {campaign?.shift === 2 ? (
                <p className="font-semibold text-cyan-100">
                  {campaignComplete(state)
                    ? 'Living Cooperative campaign complete: delivery met and working agreement honoured.'
                    : 'Campaign review: delivery or working agreement remains incomplete. Earned pay, recovery obligations and the shift history remain recorded.'}
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
                    ? 'Continue to next campaign shift'
                    : state.mode === 'game'
                      ? 'Start next playable shift at teaching pace (15×)'
                      : state.mode === 'workshop'
                        ? 'Start next manual workshop'
                        : 'Prepare next pilot draft'}
                </button>
              )}
            </div>
          )}
          <p>
            Shipped {(mission?.creditedKg ?? state.shippedKg).toFixed(1)} of{' '}
            {displayTarget.toFixed(0)} kg.{' '}
            {state.reviewReason ?? 'Review opens after the shift finishes.'}
          </p>
          <div>
            <h4 className="font-semibold text-white">Relationship evidence</h4>
            <p>
              Refusals respected: {state.refusalsRespected}. Promises kept: {state.promisesKept}.
              Open objections: {state.objections.filter((item) => item.status === 'open').length}.
              Current agreement confirmations:{' '}
              {state.members.filter((member) => member.understood).length}/{state.members.length}.
            </p>
            <p>Confirmations expire on review. No mood or trust score is inferred.</p>
          </div>
          <WorkplacePracticeProposal state={state} />
          <div>
            <h4 className="font-semibold text-white">Compare burdens, without ranking people</h4>
            {state.members.map((member) => (
              <p key={member.id} className="mt-2 tabular-nums">
                {member.role}: delivered rest {member.restMinutes.toFixed(1)} min, extra{' '}
                {member.extraMinutes.toFixed(1)} min, earned {member.earnedPay.toFixed(2)}, paid
                compensation {member.compensationPaid.toFixed(2)} credits; delivered recovery{' '}
                {member.recoveryMinutes.toFixed(1)} min; recovery owed{' '}
                {member.recoveryOwedMinutes.toFixed(1)} min.
              </p>
            ))}
          </div>
          <div className="space-y-2">
            <h4 className="font-semibold text-white">Member governance</h4>
            <p>
              AI minds have a voice in objections, never member ballots. Chair:{' '}
              {state.members.find((member) => member.id === state.electedChair)?.role ??
                'not elected'}
              .
            </p>
            <label className="block">
              Member voter
              <select
                aria-label="Member voter"
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
              Chair candidate
              <select
                aria-label="Chair candidate"
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
              Record chair ballot
            </button>
            <p>
              {Object.entries(state.chairBallots)
                .map(
                  ([id, choice]) =>
                    `${state.members.find((member) => member.id === id)?.role ?? id}: ${state.members.find((member) => member.id === choice)?.role ?? choice}`
                )
                .join('; ') || 'No chair ballots.'}
            </p>
          </div>
          <div className="space-y-2">
            <h4 className="font-semibold text-white">
              Positive operating surplus: {surplus.toFixed(2)} credits
            </h4>
            <p>
              Revenue less operating costs, earned wages, paid compensation, improvement spend and
              distributions. Initial capital is excluded.
            </p>
            <label className="block">
              Surplus destination
              <select
                aria-label="Surplus destination"
                className={inputClass}
                value={destination}
                onChange={(e) => setDestination(e.target.value as SurplusDestination)}
              >
                {destinations.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <p className="tabular-nums text-slate-300">
              {destination === 'reserve'
                ? `Retain ${surplus.toFixed(2)} credits in closing cash for the next shift's wages and choices.`
                : destination === 'members'
                  ? `Distribute ${surplus.toFixed(2)} credits equally: ${(surplus / state.members.length).toFixed(2)} per member. That cash leaves the next shift's budget.`
                  : `Allocate ${surplus.toFixed(2)} credits to the community. That cash leaves the next shift's budget.`}{' '}
              Three member ballots are required. Earned obligations must be settled first.
            </p>
            <button
              className={buttonClass}
              disabled={
                pilot || state.phase !== 'review' || surplus <= 0 || state.distributionComplete
              }
              onClick={() => report(store.voteSurplus(voter, destination))}
            >
              Record member surplus ballot
            </button>
            <p>
              {Object.entries(state.surplusBallots)
                .map(
                  ([id, vote]) =>
                    `${state.members.find((member) => member.id === id)?.role ?? id}: ${vote}`
                )
                .join('; ') || 'No surplus ballots.'}
            </p>
            <button
              className={buttonClass}
              disabled={
                pilot || state.phase !== 'review' || surplus <= 0 || state.distributionComplete
              }
              onClick={() => report(store.distributeSurplus())}
            >
              Execute agreed allocation
            </button>
            {state.distributionComplete && <p>Allocation recorded.</p>}
          </div>
          <details>
            <summary className="cursor-pointer font-semibold text-cyan-100">
              Recorded evidence
            </summary>
            <ol className="mt-2 space-y-2">
              {state.events.slice(-8).map((event) => (
                <li key={event.id}>
                  Minute {event.minute.toFixed(1)}, {event.actorId}: {event.detail}
                </li>
              ))}
            </ol>
          </details>
        </div>
      )}

      {section === 'Experiment' && (
        <div className="space-y-4">
          <WorkplaceReplay seed={safeSeed} validSeed={validSeed} navigate={setSection} />
          <h4 className="font-semibold text-white">Teaching forecasts</h4>
          <div className="space-y-2">
            <h4 className="font-semibold text-white">Same pressure, different management</h4>
            <p>
              Compare the current physical plan ({plan.title}) under three decision structures. The
              same seed, supply, rest and capacity assumptions apply. Governance grants no
              production bonus. Every approach retains refusal, privacy and raiser-owned objections.
            </p>
            <button
              className={buttonClass}
              disabled={!validSeed}
              onClick={() => setShowManagementComparison(true)}
            >
              Compare management approaches
            </button>
            {showManagementComparison &&
              compareManagementApproaches(safeSeed, state.planId).map((arm) => (
                <div key={arm.id} className="space-y-1 border-t border-slate-700 pt-2">
                  <h5 className="font-semibold text-white">{arm.title}</h5>
                  <p>{arm.detail}</p>
                  <p className="tabular-nums">
                    Matched forecast: {arm.forecastKg.toFixed(1)} kg; net{' '}
                    {arm.netCredits.toFixed(2)} illustrative credits.{' '}
                    {arm.permitted
                      ? 'This charter supports the selected plan.'
                      : `Activation blocked: ${arm.missingPractices.length ? `enable ${arm.missingPractices.join(', ')} first` : 'the plan breaches minimum protections'}.`}
                  </p>
                </div>
              ))}
            <p>
              These are illustrative forecasts, separate from actual customer dispatch and
              relationship receipts. Try an approach in Practices, then play the same pressure card.
            </p>
            <p>
              The teaching forecast uses the standalone 600 kg exercise, before episode holds or
              negotiations. Linked customer deliveries remain separate.
            </p>
          </div>
          <div className="space-y-2">
            <h4 className="font-semibold text-white">Same-seed comparison</h4>
            <label className="block">
              Experiment seed
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
              Compare all plans with this seed
            </button>
            {state.phase === 'deliberating' && (
              <>
                <button
                  className={buttonClass}
                  disabled={!validSeed}
                  onClick={() => report(store.start(state.mode, safeSeed))}
                >
                  Restart discussion with this seed
                </button>
                <p>Restarting clears the current discussion and agreement.</p>
              </>
            )}
            <p>
              Illustrative model forecasts, not evidence of real efficacy. All arms use the same
              seed, including the prohibited rush counterfactual.
            </p>
            {comparison?.map((arm) => (
              <p key={arm.planId} className="tabular-nums">
                <strong className="text-white">{arm.title}</strong>: forecast{' '}
                {arm.forecastKg.toFixed(1)} kg; net {arm.netCredits.toFixed(2)} credits; extra{' '}
                {arm.extraMinutes.toFixed(1)} min; rest {arm.restMinutes.toFixed(1)} min;{' '}
                {arm.permitted ? 'permitted' : 'prohibited'}.
              </p>
            ))}
          </div>
          <div className="space-y-2">
            <h4 className="font-semibold text-white">Pilot preparation checklist</h4>
            <ul className="list-disc space-y-1 pl-4">
              <li>Agree the purpose and participant boundaries.</li>
              <li>
                Obtain genuine informed consent and authenticated member decisions outside this
                demo.
              </li>
              <li>Agree access, retention, withdrawal and remedies before collecting data.</li>
              <li>Review safety and legal obligations with accountable people.</li>
              <li>Keep the pilot separate from live plant control.</li>
            </ul>
            <button className={buttonClass} onClick={download}>
              Download synthetic scenario JSON
            </button>
            <p>Local download only. This demo cannot authorise a real workplace pilot.</p>
            <WorkplacePracticeProposal state={state} />
          </div>
        </div>
      )}
    </section>
  );
};
