import { useState } from 'react';
import {
  exportWorkplaceReplayReport,
  useWorkplaceReplayStore,
} from '../../../stores/workplaceReplayStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { PRACTICES, WORKPLACE_PLANS } from '../../../simulation/bilateralWorkplace';
import type { WorkplaceProfile } from '../../../types/workplace';

const buttonClass =
  'min-h-9 rounded-md border border-cyan-300/25 px-2 py-1.5 text-xs font-medium text-cyan-100 hover:bg-cyan-900/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:opacity-50';
const profiles: WorkplaceProfile[] = ['toe-dip', 'team', 'cooperative'];
export type WorkplaceSection =
  | 'Shift'
  | 'Practices'
  | 'Agreement / Voices'
  | 'Review'
  | 'Experiment';

export function WorkplaceReplay({
  seed,
  validSeed,
  navigate,
}: {
  seed: number;
  validSeed: boolean;
  navigate: (section: WorkplaceSection) => void;
}) {
  const replay = useWorkplaceReplayStore();
  const gameSpeed = useGameSimulationStore((state) => state.gameSpeed);
  const [feedback, setFeedback] = useState<string | null>(null);
  const report = (result: { changed: boolean; reason: string | null }) => {
    setFeedback(
      result.reason ?? (result.changed ? 'Replay state recorded locally.' : 'No change.')
    );
    return result.changed;
  };
  const begin = (profile: WorkplaceProfile) => {
    if (report(replay.begin(profile))) navigate('Shift');
  };
  const guide = () => {
    if (!validSeed) return;
    useGameSimulationStore.getState().setGameSpeed(0);
    if (!report(replay.capture(seed))) return;
    if (!report(useWorkplaceReplayStore.getState().begin('toe-dip'))) return;
    useWorkplaceReplayStore.getState().setGuided(true);
    navigate('Shift');
  };
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([exportWorkplaceReplayReport()], { type: 'application/json' })
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'millos-workplace-replay-report.json';
    link.click();
    URL.revokeObjectURL(url);
    setFeedback('Redacted run report downloaded locally. Plant checkpoint stays in memory.');
  };
  const horizons = new Set(replay.runs.map((run) => `${run.elapsedMinutes}:${run.shiftCount}`));
  return (
    <section
      aria-label="Matched plant replay"
      className="min-w-0 space-y-3 break-words border-b border-slate-700 pb-4"
    >
      <h4 className="font-semibold text-white">Matched plant replay</h4>
      <p>
        Pause the plant, capture the customer order and stock, choose a charter, agree fresh terms,
        play the actual plant, then retain the review and compare. Each charter starts from the same
        in-memory checkpoint. Rewinding replaces current local plant progress.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          className={buttonClass}
          disabled={gameSpeed === 0}
          onClick={() => useGameSimulationStore.getState().setGameSpeed(0)}
        >
          Pause plant for capture
        </button>
        <button
          className={buttonClass}
          disabled={!validSeed}
          onClick={() => report(replay.capture(seed))}
        >
          Capture paused plant
        </button>
        <button className={buttonClass} disabled={!validSeed} onClick={guide}>
          Start guided plant replay
        </button>
      </div>
      <p>
        Capture requires a paused, safe local plant and an idle or untouched minute-zero discussion.
        External SCADA control, safety holds and owed recovery block rewind. Checkpoints disappear
        on reload and cannot be exported.
      </p>
      {feedback && (
        <p role="status" className="break-words text-amber-100">
          {feedback}
        </p>
      )}
      {replay.checkpoint ? (
        <div className="space-y-2">
          <p className="tabular-nums">
            Checkpoint: {replay.checkpoint.customer}, {replay.checkpoint.remainingKg.toFixed(1)} kg
            remaining; source stock {replay.checkpoint.sourceKg.toFixed(1)} kg. Day{' '}
            {replay.checkpoint.gameDay}, hour {replay.checkpoint.gameTime.toFixed(2)}; seed{' '}
            {replay.checkpoint.seed}. Faults: {replay.checkpoint.faults.join(', ') || 'none'}.
          </p>
          <div className="flex flex-wrap gap-2">
            {profiles.map((profile) => (
              <button key={profile} className={buttonClass} onClick={() => begin(profile)}>
                Replay {profile} charter
              </button>
            ))}
            <button className={buttonClass} onClick={() => report(replay.record())}>
              Retain actual run review
            </button>
            <button className={buttonClass} onClick={() => report(replay.forget())}>
              Forget replay checkpoint and reports
            </button>
          </div>
          <p>
            Replays remain paused for agreement and pause automatically at review. After an early
            stop, explicitly resume the plant clock to deliver owed recovery before retaining the
            review. An eligible review is retained before a new charter rewinds. Consent, votes and
            understanding never carry over.
          </p>
        </div>
      ) : (
        <p>No checkpoint yet. Capture a paused plant to compare actual runs.</p>
      )}
      {horizons.size > 1 && (
        <p className="text-amber-100">
          Unequal horizons: elapsed time or shifts differ. Dispatch totals alone cannot establish a
          better charter.
        </p>
      )}
      {replay.runs.map((run) => (
        <article
          key={run.id}
          aria-label={`${run.profile} actual run`}
          className="min-w-0 space-y-2 border-t border-slate-700 pt-3"
        >
          <h5 className="font-semibold text-white">
            {run.profile}:{' '}
            {WORKPLACE_PLANS.find((plan) => plan.id === run.planId)?.title ?? run.planId}
          </h5>
          <p>
            Actual charter: {run.charter.workerAutonomy} work choice; {run.charter.governance}{' '}
            governance; {run.charter.aiAuthority} AI authority. Practices:{' '}
            {run.charter.practices
              .map((id) => PRACTICES.find((practice) => practice.id === id)?.title ?? id)
              .join(', ') || 'none'}
            .
          </p>
          <p>
            Shift plans:{' '}
            {run.shiftPlans
              .map(
                (shift) =>
                  `shift ${shift.shift + 1}, ${WORKPLACE_PLANS.find((plan) => plan.id === shift.planId)?.title ?? shift.planId}`
              )
              .join('; ')}
            .
          </p>
          <dl className="space-y-2 tabular-nums">
            <div>
              <dt className="font-medium text-slate-100">Actual dispatch and horizon</dt>
              <dd>
                {run.dispatchedKg.toFixed(1)} kg dispatched; {run.remainingKg.toFixed(1)} kg full
                commitment remaining. Agreed target {run.targetKg.toFixed(1)} kg; deferred{' '}
                {run.deferredKg.toFixed(1)} kg. {run.shiftCount}{' '}
                {run.shiftCount === 1 ? 'shift' : 'shifts'}; {run.elapsedMinutes.toFixed(1)} elapsed
                minutes; {run.agreementMinutes.toFixed(1)} agreement minutes.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-slate-100">Plant accounts, pounds sterling</dt>
              <dd>
                Revenue £{run.financial.plantRevenue.toFixed(2)}; costs £
                {run.financial.plantCosts.toFixed(2)}.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-slate-100">Illustrative workplace credits</dt>
              <dd>
                Wages {run.financial.workplaceWages.toFixed(2)}; compensation{' '}
                {run.financial.compensation.toFixed(2)}; improvements{' '}
                {run.financial.improvements.toFixed(2)}.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-slate-100">Conservation and genealogy</dt>
              <dd>
                Material error {run.materialErrorKg.toFixed(3)} kg; genealogy error{' '}
                {run.genealogyErrorKg.toFixed(3)} kg; {run.manifestIds.length} dispatch{' '}
                {run.manifestIds.length === 1 ? 'manifest' : 'manifests'}.
              </dd>
            </div>
          </dl>
          <p>
            Refusals respected {run.refusalsRespected}; promises kept {run.promisesKept}. Cumulative
            objections resolved {run.objectionsResolved} of {run.objectionsRaised}. Current-shift
            open objections {run.objections.filter((item) => item.status === 'open').length}.
          </p>
          <details>
            <summary className="cursor-pointer text-cyan-100">
              Member burdens and public receipts
            </summary>
            <div className="mt-2 space-y-2">
              {run.members.map((member) => (
                <p key={member.id} className="tabular-nums">
                  {member.role}: extra {member.extraMinutes.toFixed(1)} min; rest{' '}
                  {member.restMinutes.toFixed(1)} min; recovery delivered{' '}
                  {member.recoveryMinutes.toFixed(1)} min, owed{' '}
                  {member.recoveryOwedMinutes.toFixed(1)} min; earned {member.earnedPay.toFixed(2)},
                  compensation {member.compensationPaid.toFixed(2)} credits; refusal{' '}
                  {member.refusalRespected ? 'respected' : 'not recorded as respected'}.
                </p>
              ))}
              {run.receipts.map((receipt) => (
                <div key={receipt.shift}>
                  <p>Shift {receipt.shift + 1}</p>
                  {receipt.events === null ? (
                    <p>No public receipts retained for this shift.</p>
                  ) : (
                    <ol className="list-disc space-y-1 pl-4">
                      {receipt.events.map((event) => (
                        <li key={event.id} className="break-words">
                          Minute {event.minute.toFixed(1)}, {event.actorId}: {event.detail}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              ))}
            </div>
          </details>
        </article>
      ))}
      {replay.runs.length > 0 && (
        <button className={buttonClass} onClick={download}>
          Download redacted replay report
        </button>
      )}
      <p>
        Starting conditions match; frame-driven vehicle trajectories can differ between runs.
        Compare elapsed and agreement time alongside dispatch. These records describe local
        simulation conduct. No winner, trust or wellbeing score is inferred.
      </p>
    </section>
  );
}

export function WorkplaceReplayGuide({
  section,
  navigate,
}: {
  section: WorkplaceSection;
  navigate: (section: WorkplaceSection) => void;
}) {
  const guided = useWorkplaceReplayStore((state) => state.guided);
  const workplace = useWorkplaceStore((state) => state.workplace);
  if (!guided || section === 'Experiment') return null;
  const copy: Record<Exclude<WorkplaceSection, 'Experiment'>, string> = {
    Shift:
      'Start with protected rest, shared operating information and remedy. Keep the customer commitment or negotiate an installment: deferral leaves the full contract outstanding. Select a real plan below.',
    Practices:
      'Toe-dip starts with rest, information and remedy. Team adds shared decisions; cooperative adds member governance. Optional budget practice enables the shared handoff improvement. Use the actual practice controls below.',
    'Agreement / Voices':
      'Each role answers its own understanding checks and casts its own vote. Optional cover needs separate revocable consent. Quality may refuse without explaining. Resolve objections through their original author, then explicitly approve the agreement below.',
    Review:
      'Check actual dispatch, protected rest, earned compensation and delivered recovery. Finish owed recovery before retaining this run. Return to Experiment to replay team or cooperative from the same checkpoint with fresh agreement.',
  };
  return (
    <aside aria-label="Guided replay" className="space-y-2 border-y border-slate-700 py-3">
      <h4 className="font-semibold text-white">Guided replay: {section}</h4>
      <p>{copy[section]}</p>
      {section === 'Shift' && (
        <ul className="list-disc space-y-1 pl-4">
          {WORKPLACE_PLANS.filter((plan) => !plan.illegalReason).map((plan) => (
            <li key={plan.id}>
              {plan.title}: {(plan.capacity * 100).toFixed(0)}% pacing; {plan.budgetCost}{' '}
              illustrative credits; {plan.protectedRestMinutes} min protected rest.
              {plan.optionalCoverMinutes > 0 &&
                ` Up to ${plan.optionalCoverMinutes} min voluntary cover at ${plan.compensationPerMinute} credits/min and ${plan.recoveryMinutes} min recovery, then protected pacing resumes.`}
            </li>
          ))}
        </ul>
      )}
      {workplace.phase === 'active' && (
        <p>
          The agreement is active. Use the plant clock controls to resume actual play; this guide
          never advances time or submits decisions.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          className={buttonClass}
          onClick={() =>
            navigate(
              section === 'Shift'
                ? 'Practices'
                : section === 'Practices'
                  ? 'Agreement / Voices'
                  : section === 'Agreement / Voices'
                    ? 'Review'
                    : 'Experiment'
            )
          }
        >
          Next guide section
        </button>
        <button
          className={buttonClass}
          onClick={() => useWorkplaceReplayStore.getState().setGuided(false)}
        >
          End guide
        </button>
      </div>
      <p>
        Optional navigation only. No votes, checks, consent or approval are supplied by the guide.
      </p>
    </aside>
  );
}

export function WorkplaceReplayResume() {
  const activeRunId = useWorkplaceReplayStore((state) => state.activeRunId);
  const phase = useWorkplaceStore((state) => state.workplace.phase);
  const gameSpeed = useGameSimulationStore((state) => state.gameSpeed);
  if (!activeRunId || phase !== 'active' || gameSpeed !== 0) return null;
  return (
    <button
      className={buttonClass}
      onClick={() => {
        if (
          useWorkplaceReplayStore.getState().activeRunId &&
          useWorkplaceStore.getState().workplace.phase === 'active' &&
          useGameSimulationStore.getState().gameSpeed === 0
        ) {
          useGameSimulationStore.getState().setGameSpeed(30);
        }
      }}
    >
      Resume agreed replay at teaching pace (30×)
    </button>
  );
}
