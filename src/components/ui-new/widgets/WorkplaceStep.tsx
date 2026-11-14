import { useId, useState } from 'react';
import {
  planPlantEffect,
  useWorkplaceControls,
  useWorkplaceStore,
  workplaceReasonText,
} from '../../../stores/workplaceStore';
import {
  AUTHORED_CALL_KEYS,
  WORKPLACE_PLANS,
  surplusOutcome,
} from '../../../simulation/bilateralWorkplace';
import { STANDARD_GAME_SPEED } from '../../../simulation/pace';
import { bilateralWorkplaceMessages } from '../../../simulation/bilateralWorkplace.messages';
import {
  CAMPAIGN_SHIFTS,
  MANAGEMENT_APPROACHES,
  WORKPLACE_CHECKS,
  campaignPressure,
  checksPassed,
  requiredChecks,
  seasonEnded,
  seasonSobrasPool,
  shiftResumable,
} from '../../../simulation/workplaceCampaign';
import { deriveWorkplaceGuidance } from './WorkplacePressureChapter';
import { CAMERA_PRESETS, useCameraStore } from '../../CameraController';
import { useUIStore } from '../../../stores/uiStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { formatFixed, translate, useT } from '../../../i18n';
import { workplaceStepMessages } from './WorkplaceStep.messages';
import { workplaceLabMessages } from './WorkplaceLab.messages';
import type {
  SurplusDestination,
  WorkplaceAnswer,
  WorkplaceProfile,
  WorkplaceState,
  WorkplaceTransitionResult,
} from '../../../types/workplace';

const button =
  'min-h-11 rounded-md border border-cyan-300/25 px-3 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-900/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:opacity-50';
const input =
  'min-h-11 w-full min-w-0 rounded-md border border-slate-600 bg-slate-950 px-2 py-2 text-sm text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:opacity-50';
const DESTINATIONS: SurplusDestination[] = ['members', 'reserve', 'community'];

/** Where the role that said no works, as a camera preset (communityLife roster). */
const REFUSAL_CAMERA: Record<string, string> = {
  quality: 'Packing', // mill-quality samples at the packers
  maintenance: 'Milling', // mill-engineer keeps rm-102
  coordinator: 'Milling', // mill-operator-west runs rm-101
};

/**
 * 5.3: after the others answer, the camera goes to the first role that said
 * no. Walk mode has no camera controller, so it is left first. Returns the
 * preset it chose, or null when no one refused.
 */
export function lookAtRefusingRole(): string | null {
  const events = useWorkplaceStore.getState().workplace.events;
  let first = events.length;
  while (first > 0 && events[first - 1].kind === 'authored-refusal') first -= 1;
  const preset = REFUSAL_CAMERA[events[first]?.actorId ?? ''];
  if (!preset) return null;
  if (useUIStore.getState().fpsMode) useUIStore.getState().setFpsMode(false);
  useCameraStore.getState().setPreset(CAMERA_PRESETS.findIndex((p) => p.name === preset));
  return preset;
}

/** A refusal, shown at the control it answers (role="alert", described-by). */
function Refusal({ id, result }: { id: string; result: WorkplaceTransitionResult | null }) {
  const text = result && result.reason ? workplaceReasonText(result) : null;
  if (!text) return null;
  return (
    <p id={id} role="alert" className="mt-1 break-words text-amber-100">
      {text}
    </p>
  );
}

/**
 * A control that answers its step is replaced by what it recorded, or
 * disables itself; a browser then drops focus to <body>, where Space is the
 * forklift emergency stop. The step's heading takes it instead.
 */
function keepStepFocus() {
  requestAnimationFrame(() => {
    const active = document.activeElement as HTMLButtonElement | null;
    if (active && active !== document.body && active.isConnected && !active.disabled) return;
    document.querySelector<HTMLElement>('[data-step-focus]')?.focus({ preventScroll: true });
  });
}

/** The adviser and the four roles, as rows of the role table. */
const ADVISER = 'mind';

/**
 * 5.1 and 5.2: the solo season one step at a time. A heading from
 * deriveWorkplaceGuidance, the next step, and only the controls that step
 * needs; the role table shows who has answered what. In a solo season the
 * player is Packing (D5): Packing's row is the only one with live controls,
 * and every other row shows what that member answered and, once it has, why.
 * Working if a first approval takes eight clicks or fewer and the panel opens
 * on under 150 words.
 */
export function WorkplaceStep({
  activate,
  busy,
}: {
  /** The lab's approval (the agent command path); resolves to what it said. */
  activate: () => Promise<string | null>;
  busy: boolean;
}) {
  const t = useT(workplaceStepMessages);
  const tLab = useT(workplaceLabMessages);
  const store = useWorkplaceControls();
  const state = store.workplace;
  const ids = useId();
  const [profile, setProfile] = useState<WorkplaceProfile>('toe-dip');
  // What the chair dropdown shows is what Cast sends (review 2).
  const [chairCandidate, setChairCandidate] = useState(
    () => state.chairBallots.packing ?? 'coordinator'
  );
  const [destination, setDestination] = useState<SurplusDestination>('members');
  // An approval that did not run says why at its own button.
  const [approveRefusal, setApproveRefusal] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<{ at: string; result: WorkplaceTransitionResult } | null>(
    null
  );
  const answer = (at: string, result: WorkplaceTransitionResult) => {
    setRefusal(result.reason && !result.changed ? { at, result } : null);
    keepStepFocus();
    return result;
  };
  const refusalAt = (at: string) => (refusal?.at === at ? refusal.result : null);
  const describedBy = (at: string) => (refusalAt(at) ? `${ids}-${at}` : undefined);

  const campaign = state.campaign;
  if (!campaign) {
    // Idle: the season starts here, on the open order (D4 refuses it before
    // the first delivery, and the refusal shows at this button).
    return (
      <section
        aria-label={t('stepLabel')}
        tabIndex={-1}
        data-step-focus
        className="space-y-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
      >
        <label className="block">
          {t('charter')}
          <select
            className={input}
            value={profile}
            onChange={(e) => setProfile(e.target.value as WorkplaceProfile)}
          >
            {MANAGEMENT_APPROACHES.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={`${button} bg-cyan-900/60`}
          aria-describedby={describedBy('start')}
          onClick={() => {
            const started = answer('start', store.startMission(profile, state.seed));
            // The season runs at standard pace (1x), as its label says. It
            // ends only the player's own pause (D-106): a feature's hold (the
            // tour, a restore, SCADA) stays in place.
            if (!started.changed) return;
            useGameSimulationStore.getState().choosePace(STANDARD_GAME_SPEED);
            // This control unmounts; the season's first step takes focus, not
            // <body> (where Space is the forklift emergency stop).
            requestAnimationFrame(() =>
              document.querySelector<HTMLElement>('[data-step-focus]')?.focus({
                preventScroll: true,
              })
            );
          }}
        >
          {tLab('startCampaign')}
        </button>
        <Refusal id={`${ids}-start`} result={refusalAt('start')} />
      </section>
    );
  }

  const guide = deriveWorkplaceGuidance(state);
  const deliberating = state.phase === 'deliberating';
  const reviewing = state.phase === 'review';
  const plan = WORKPLACE_PLANS.find((p) => p.id === state.planId)!;
  const packing = state.members.find((m) => m.id === 'packing')!;
  const pendingChecks = WORKPLACE_CHECKS.filter(
    (q) => requiredChecks('packing').includes(q.id) && campaign.checks.packing?.[q.id] !== q.correct
  );
  const callKey =
    campaign.decision && campaign.decision in AUTHORED_CALL_KEYS
      ? AUTHORED_CALL_KEYS[campaign.decision as keyof typeof AUTHORED_CALL_KEYS]
      : null;
  const pressure = campaignPressure(state);
  const finalReview = reviewing && campaign.shift === 2 && !shiftResumable(state);
  const pool = seasonSobrasPool(state);
  const sobrasOpen =
    finalReview &&
    seasonEnded(state) &&
    state.practices.includes('gainsharing') &&
    !state.distributionComplete &&
    pool > 1e-8;
  const chairOpen =
    deliberating && state.governance === 'member-vote' && state.practices.includes('cooperative');
  const recoveryOwed = state.members.some((m) => m.recoveryOwedMinutes > 0);
  // No instruction sentence under the heading (D-012): the step is its own
  // controls. Where no control of Packing's answers the step, the panel reads
  // out what is happening instead, a fact, not a hint (review 2).
  const statusKey = guide.termsNeeded
    ? null
    : guide.needsRemedy
      ? state.objections.some((o) => o.actorId === 'packing' && o.status === 'open')
        ? null
        : 'nextWaitRemedy'
      : state.phase === 'active'
        ? campaign.shift === 1 && campaign.decision === 'inspect' && !campaign.inspectionComplete
          ? 'nextInspecting'
          : 'nextRunning'
        : reviewing && !shiftResumable(state) && recoveryOwed
          ? 'nextRecovery'
          : null;
  // Review 2: how the surplus vote carries, once every member has voted.
  const carries = sobrasOpen ? surplusOutcome(state) : null;
  const roleName = (id: string) =>
    id === ADVISER ? t('adviser') : (state.members.find((m) => m.id === id)?.role ?? id);

  const votePacking = (approve: boolean) => {
    const voted = answer('table', store.vote('packing', approve));
    if (!voted.changed) return;
    // The others answer when Packing has: from their values, never the player's.
    const heard = store.simulateResponses();
    if (heard.changed && heard.reason) {
      setRefusal({ at: 'table', result: heard });
      lookAtRefusingRole();
    }
  };
  const hearAgain = () => {
    const heard = answer('table', store.simulateResponses());
    if (heard.changed && heard.reason) {
      setRefusal({ at: 'table', result: heard });
      lookAtRefusingRole();
    }
  };

  const cell = (text: string) => <td className="px-1 py-2 align-top">{text}</td>;
  const ballotText = (ballot: boolean | null) =>
    ballot === null ? t('notYet') : ballot ? t('yes') : t('no');
  const coverText = (consent: boolean | null) =>
    !plan.optionalCoverMinutes
      ? t('noCover')
      : consent === null
        ? t('notYet')
        : consent
          ? t('covers')
          : t('declines');
  const objectionsOf = (actorId: string) =>
    state.objections.filter((o) => o.actorId === actorId && o.status === 'open');
  const resolveControls = (actorId: string) =>
    objectionsOf(actorId).map((o) => {
      const kind = tLab('objectionKind', { kind: o.kind });
      return (
        <span key={o.id} className="mt-1 flex flex-wrap items-center gap-2">
          <span className="text-amber-100">{t('objectionOpen', { kind })}</span>
          <button
            type="button"
            className={button}
            aria-label={t('resolveAria', { kind, role: roleName(actorId) })}
            aria-describedby={describedBy('table')}
            // The raiser resolves its own: in solo play that is Packing's only.
            disabled={actorId !== 'packing'}
            onClick={() => answer('table', store.resolveObjection(o.id, 'packing'))}
          >
            {t('resolve')}
          </button>
        </span>
      );
    });

  const table = (
    <table aria-label={t('roleTable')} className="w-full table-fixed border-collapse text-left">
      <thead className="text-slate-400">
        <tr>
          <th scope="col" className="w-[34%] px-1 py-1 font-medium">
            {t('colRole')}
          </th>
          <th scope="col" className="px-1 py-1 font-medium">
            {t('colUnderstands')}
          </th>
          <th scope="col" className="px-1 py-1 font-medium">
            {t('colVote')}
          </th>
          <th scope="col" className="px-1 py-1 font-medium">
            {t('colCover')}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr className="border-t border-slate-700">
          <th scope="row" className="px-1 py-2 align-top font-semibold text-white">
            {t('you', { role: packing.role })}
            {resolveControls('packing')}
          </th>
          <td className="px-1 py-2 align-top">
            {packing.understood ? (
              t('yes')
            ) : deliberating && checksPassed(campaign, 'packing') ? (
              <button
                type="button"
                className={button}
                aria-label={t('understandsAria')}
                aria-describedby={describedBy('table')}
                onClick={() => answer('table', store.understand('packing'))}
              >
                {t('confirm')}
              </button>
            ) : (
              t('notYet')
            )}
          </td>
          <td className="px-1 py-2 align-top">
            {packing.ballot !== null || !deliberating || !packing.understood ? (
              ballotText(packing.ballot)
            ) : (
              <span className="flex flex-wrap gap-1">
                <button
                  type="button"
                  className={button}
                  aria-label={t('voteYesAria')}
                  aria-describedby={describedBy('table')}
                  onClick={() => votePacking(true)}
                >
                  {t('yes')}
                </button>
                <button
                  type="button"
                  className={button}
                  aria-label={t('voteNoAria')}
                  aria-describedby={describedBy('table')}
                  onClick={() => votePacking(false)}
                >
                  {t('no')}
                </button>
              </span>
            )}
          </td>
          <td className="px-1 py-2 align-top">
            {plan.optionalCoverMinutes &&
            deliberating &&
            packing.understood &&
            packing.coverConsent === null ? (
              <span className="flex flex-wrap gap-1">
                <button
                  type="button"
                  className={button}
                  aria-label={t('coverYesAria')}
                  onClick={() => answer('table', store.consentToCover('packing', true))}
                >
                  {t('yes')}
                </button>
                <button
                  type="button"
                  className={button}
                  aria-label={t('coverNoAria')}
                  onClick={() => answer('table', store.consentToCover('packing', false))}
                >
                  {t('no')}
                </button>
              </span>
            ) : (
              coverText(packing.coverConsent)
            )}
          </td>
        </tr>
        {state.members
          .filter((m) => m.id !== 'packing')
          .map((m) => (
            <tr key={m.id} className="border-t border-slate-700" data-role={m.id}>
              <th scope="row" className="px-1 py-2 align-top font-semibold text-white">
                {m.role}
                {resolveControls(m.id)}
              </th>
              {cell(m.understood ? t('yes') : t('notYet'))}
              {cell(ballotText(m.ballot))}
              {cell(coverText(m.coverConsent))}
            </tr>
          ))}
        <tr className="border-t border-slate-700" data-role={ADVISER}>
          <th scope="row" className="px-1 py-2 align-top font-semibold text-white">
            {t('adviser')}
            {resolveControls(ADVISER)}
          </th>
          {cell(campaign.adviserAcknowledged ? t('yes') : t('notYet'))}
          {cell(t('noBallot'))}
          {cell(t('noCover'))}
        </tr>
      </tbody>
    </table>
  );

  return (
    <section aria-label={t('stepLabel')} className="space-y-3">
      <h4 tabIndex={-1} data-step-focus className="text-sm font-semibold text-white">
        {guide.beat}
      </h4>
      {statusKey && <p role="status">{t(statusKey)}</p>}
      <p>
        {t('shiftLine', {
          number: formatFixed(campaign.shift + 1, 0),
          title: CAMPAIGN_SHIFTS[campaign.shift]?.title ?? '',
        })}
      </p>
      {callKey && (
        <p className="text-slate-300">{translate(bilateralWorkplaceMessages, callKey)}</p>
      )}
      {guide.termsNeeded && pressure && (
        <div>
          <button
            type="button"
            className={button}
            aria-describedby={describedBy('terms')}
            onClick={() =>
              answer('terms', store.respondToPressure(pressure.id, 'protect-boundary'))
            }
          >
            {t('restate', { pressure: pressure.title })}
          </button>
          <Refusal id={`${ids}-terms`} result={refusalAt('terms')} />
        </div>
      )}
      {deliberating && (
        <label className="block">
          {t('plan')}
          <select
            className={input}
            value={state.planId}
            onChange={(e) =>
              answer('table', store.selectPlan(e.target.value as WorkplaceState['planId']))
            }
          >
            {WORKPLACE_PLANS.filter((p) => !p.illegalReason).map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
          {plan.id !== 'steady' && (
            <span className="mt-1 block text-slate-300">{plan.explanation}</span>
          )}
          {/* 5.4: what this plan does to the plant this shift. */}
          {planPlantEffect(state).map((line) => (
            <span key={line} className="mt-1 block text-cyan-100">
              {line}
            </span>
          ))}
        </label>
      )}
      {deliberating &&
        pendingChecks.map((q) => (
          <label key={q.id} className="block">
            {q.prompt}
            <select
              className={input}
              aria-label={q.prompt}
              aria-describedby={describedBy(`check-${q.id}`)}
              value={campaign.checks.packing?.[q.id] ?? ''}
              onChange={(e) =>
                answer(
                  `check-${q.id}`,
                  store.answerCheck('packing', q.id, e.target.value as WorkplaceAnswer)
                )
              }
            >
              <option value="" disabled>
                {tLab('selectAnswer')}
              </option>
              {q.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {campaign.checks.packing?.[q.id] && (
              <span role="alert" className="mt-1 block text-amber-100">
                {q.clarification}
              </span>
            )}
            {/* Review 2: a refused answer says why, at its own question. */}
            <Refusal id={`${ids}-check-${q.id}`} result={refusalAt(`check-${q.id}`)} />
          </label>
        ))}
      {chairOpen && (
        <fieldset className="space-y-2">
          <legend className="font-semibold text-white">{t('chairHeading')}</legend>
          {state.members
            .filter((m) => m.id !== 'packing' && state.chairBallots[m.id])
            .map((m) => (
              <p key={m.id}>
                {t('ballotLine', { role: m.role, choice: roleName(state.chairBallots[m.id]) })}
              </p>
            ))}
          <label className="block">
            {t('chairBallot')}
            <select
              className={input}
              value={chairCandidate}
              onChange={(e) => setChairCandidate(e.target.value)}
            >
              {state.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.role}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={button}
            onClick={() => answer('chair', store.elect('packing', chairCandidate))}
          >
            {t('castChair')}
          </button>
          <p>
            {state.electedChair
              ? t('chairIs', { role: roleName(state.electedChair) })
              : t('noChair')}
          </p>
          <Refusal id={`${ids}-chair`} result={refusalAt('chair')} />
        </fieldset>
      )}
      {(deliberating || state.phase === 'active' || guide.needsRemedy) && table}
      {deliberating && (
        <div className="flex flex-wrap gap-2">
          {packing.ballot !== null &&
            state.members.some((m) => m.id !== 'packing' && m.ballot !== true) && (
              <button type="button" className={button} onClick={hearAgain}>
                {t('hearOthers')}
              </button>
            )}
          <button
            type="button"
            className={`${button} bg-cyan-900/60`}
            disabled={busy || !guide.readiness.allowed}
            aria-describedby={approveRefusal ? `${ids}-approve` : undefined}
            onClick={() =>
              void activate().then((said) => {
                const ran = useWorkplaceStore.getState().workplace.phase === 'active';
                setApproveRefusal(ran ? null : said);
                keepStepFocus();
              })
            }
          >
            {busy ? t('checking') : t('approve', { plan: plan.title })}
          </button>
        </div>
      )}
      {deliberating && approveRefusal && (
        <p id={`${ids}-approve`} role="alert" className="break-words text-amber-100">
          {approveRefusal}
        </p>
      )}
      {/* Wherever the table is, its refusals are too: a Resolve refused in review says why. */}
      {(deliberating || state.phase === 'active' || guide.needsRemedy) && (
        <Refusal id={`${ids}-table`} result={refusalAt('table')} />
      )}
      {reviewing && shiftResumable(state) && (
        <button
          type="button"
          className={button}
          onClick={() => answer('review', store.resumeShift(state.revision))}
        >
          {t('resume', { minute: formatFixed(state.minute, 0) })}
        </button>
      )}
      {reviewing && !shiftResumable(state) && campaign.shift < 2 && (
        <button
          type="button"
          className={button}
          aria-describedby={describedBy('review')}
          disabled={
            state.members.some((m) => m.recoveryOwedMinutes > 0) ||
            state.objections.some((o) => o.status === 'open')
          }
          onClick={() => answer('review', store.nextCampaignShift())}
        >
          {t('nextShift')}
        </button>
      )}
      {sobrasOpen && (
        <fieldset className="space-y-2">
          <legend className="font-semibold text-white">
            {t('sobrasHeading', { amount: formatFixed(pool, 2) })}
          </legend>
          {state.members
            .filter((m) => m.id !== 'packing' && state.surplusBallots[m.id])
            .map((m) => (
              <p key={m.id}>
                {t('ballotLine', {
                  role: m.role,
                  choice: t('destination', { destination: state.surplusBallots[m.id]! }),
                })}
              </p>
            ))}
          {/* Review 2: what carries, and on what basis, once every member has voted. */}
          {carries && (
            <p role="status" className="font-semibold text-white">
              {t(
                carries.basis === 'chair'
                  ? 'carriesChair'
                  : carries.basis === 'default'
                    ? 'carriesDefault'
                    : 'carriesMajority',
                { destination: t('destination', { destination: carries.destination }) }
              )}
            </p>
          )}
          <label className="block">
            {t('sobrasBallot')}
            <select
              className={input}
              value={destination}
              onChange={(e) => setDestination(e.target.value as SurplusDestination)}
            >
              {DESTINATIONS.map((d) => (
                <option key={d} value={d}>
                  {t('destination', { destination: d })}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={button}
              onClick={() => answer('review', store.voteSurplus('packing', destination))}
            >
              {t('castSobras')}
            </button>
            {/* Live until it settles, so a held share says why at its button. */}
            <button
              type="button"
              className={`${button} bg-cyan-900/60`}
              aria-describedby={describedBy('review')}
              onClick={() => answer('review', store.distributeSurplus())}
            >
              {t('settleSobras')}
            </button>
          </div>
        </fieldset>
      )}
      {finalReview && state.sobras && (
        <p>
          {t('sobrasSettled', {
            destination: t('destination', { destination: state.sobras.destination }),
          })}
        </p>
      )}
      {reviewing && <Refusal id={`${ids}-review`} result={refusalAt('review')} />}
    </section>
  );
}
