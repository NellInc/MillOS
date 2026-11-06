import React, { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  getStartupSnapshot,
  openPreparedStartup,
  resetStartupPreparation,
  subscribeStartup,
} from '../utils/startupReadiness';
import { FEATURE_FLAGS } from '../config/featureFlags';
import { importWithBoundedRetry } from '../utils/recoverableLazy';
import { useFocusTrap } from '../hooks/useFocusTrap';
import ErrorBoundary from './ErrorBoundary';
import { useGraphicsStore } from '../stores/graphicsStore';
import {
  selectInAppReducedMotion,
  useMotionPreferenceStore,
} from '../stores/motionPreferenceStore';
import { formatGrouped, useT } from '../i18n';
import { loadingScreenMessages } from './LoadingScreen.messages';
import { startupProgress, type StartupPhase } from '../utils/startupProgress';

const PHASE_LABEL = {
  download: 'phaseDownload',
  build: 'phaseBuild',
  shaders: 'phaseShaders',
  settle: 'phaseSettle',
} as const satisfies Record<StartupPhase, string>;
const PHASE_COUNT = {
  download: 'countFiles',
  build: 'countParts',
  shaders: 'countShaders',
  settle: 'countFrames',
} as const satisfies Record<StartupPhase, string>;

// Decorative DOM content must never invalidate the 3D preparation window.
// Working if a delayed or failed quote leaves scene task/error counts unchanged.
const DeferredLoadingQuote = lazy(() =>
  importWithBoundedRetry(() =>
    import('./knowledge/LoadingQuote').then((module) => ({ default: module.LoadingQuote }))
  )
);

interface LoadingScreenProps {
  minimumLoadTimeMs?: number;
  recoveryDelayMs?: number;
  /** How long a complete world must stay slow before Low is offered early. */
  slowWorldDelayMs?: number;
}

/** Nothing moving for this long, while the cover is up, is a stall. */
const STALL_MS = 90_000;

/**
 * Calls `onElapsed` once `delayMs` of visible time has passed. A hidden tab
 * renders nothing, so neither readiness nor slowness can be observed there.
 * Returns the cancel.
 */
function startVisibleTimer(delayMs: number, onElapsed: () => void): () => void {
  let remaining = delayMs;
  let armedAt = 0;
  let timer: number | undefined;
  const arm = (): void => {
    if (timer !== undefined || document.visibilityState === 'hidden') return;
    armedAt = performance.now();
    timer = window.setTimeout(onElapsed, remaining);
  };
  const disarm = (): void => {
    if (timer === undefined) return;
    window.clearTimeout(timer);
    timer = undefined;
    remaining = Math.max(0, remaining - (performance.now() - armedAt));
  };
  const onVisibility = (): void => {
    if (document.visibilityState === 'hidden') disarm();
    else arm();
  };
  arm();
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.clearTimeout(timer);
  };
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  minimumLoadTimeMs = 700,
  recoveryDelayMs = 30000,
  slowWorldDelayMs = 5000,
}) => {
  const t = useT(loadingScreenMessages);
  const startup = useSyncExternalStore(subscribeStartup, getStartupSnapshot);
  const quality = useGraphicsStore((state) => state.graphics.quality);
  const [showLoading, setShowLoading] = useState(true);
  const [minimumTimePassed, setMinimumTimePassed] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [osReducedMotion, setReducedMotion] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  );
  const inAppReducedMotion = useMotionPreferenceStore(selectInAppReducedMotion);
  const reducedMotion = osReducedMotion || inAppReducedMotion;
  const loadingRef = useRef<HTMLDivElement>(null);
  // Loading owns keyboard focus until readiness; Escape cannot skip preparation.
  // Working if Tab stays on the cover until an explicit recovery control is available.
  useFocusTrap(loadingRef as React.RefObject<HTMLElement>, showLoading, () =>
    loadingRef.current?.focus()
  );

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return;
    const handleChange = (): void => setReducedMotion(query.matches);
    query.addEventListener?.('change', handleChange);
    return () => query.removeEventListener?.('change', handleChange);
  }, []);

  useEffect(() => {
    const minimumTimer = window.setTimeout(() => setMinimumTimePassed(true), minimumLoadTimeMs);
    return () => window.clearTimeout(minimumTimer);
  }, [minimumLoadTimeMs]);

  // A hidden tab cannot become ready (nothing renders and the readiness probe
  // waits for visibility), so only visible time counts towards the slow-load
  // offer. On wall time a tab opened in the background came back offering Low,
  // a choice that is kept for every later visit.
  // Working if hidden time never brings the offer forward.
  useEffect(
    () => startVisibleTimer(recoveryDelayMs, () => setShowRecovery(true)),
    [recoveryDelayMs]
  );

  useEffect(() => {
    if (!(minimumTimePassed && (startup.ready || startup.opened))) return;
    setIsExiting(true);
    const hideTimer = window.setTimeout(() => setShowLoading(false), reducedMotion ? 0 : 220);
    return () => window.clearTimeout(hideTimer);
  }, [startup.ready, startup.opened, minimumTimePassed, reducedMotion]);

  // The bar is every kind of startup work, each by its own count
  // (startupProgress). Totals grow as later work is discovered, so the bar
  // shows the highest value reached this load and never runs back.
  // Working if aria-valuenow never decreases before readiness sets 100, and the
  // label names the work actually holding the cover.
  const progress = startupProgress(startup);
  const [progressFloor, setProgressFloor] = useState(0);
  if (progress.percent > progressFloor) setProgressFloor(progress.percent);
  const safeProgress = startup.ready ? 100 : Math.max(progressFloor, progress.percent);

  // `prepared` means every asset and task is done and the frame window is full
  // but still too slow: exactly what Low graphics fixes. Once that has held for
  // a few seconds, offer the way out then rather than at the 30 s timer. A
  // brief slow window that clears never starts the latch. Once set, it holds
  // for that resource revision: a >1 s hitch restarts the frame window
  // (`prepared` false) without a resource change, and the controls must not
  // flicker away on the slow device they were offered to. A real resource
  // change bumps the revision and releases it. Visible time only: a hidden tab
  // draws no frames, so `prepared` keeps its last value and wall time latched
  // a briefly slow world as slow behind the player's back.
  // Working if hidden time never confirms a slow world.
  const [slowWorldRevision, setSlowWorldRevision] = useState<number | null>(null);
  useEffect(() => {
    if (!startup.prepared || startup.ready) return;
    const revision = startup.revision;
    return startVisibleTimer(slowWorldDelayMs, () => setSlowWorldRevision(revision));
  }, [startup.prepared, startup.ready, startup.revision, slowWorldDelayMs]);
  const slowWorldConfirmed = !startup.ready && slowWorldRevision === startup.revision;

  // A stall, not a slow device: neither progress nor any resource has moved for
  // STALL_MS (an asset fetch with no timeout can hang). A slow device keeps no
  // routine reload prompt, but a stall at Low graphics had no control at all.
  // The wait restarts whenever either moves, and is not counted while hidden.
  // The timer records the point it stalled at; the stall shows while that point
  // is still current. No state is written when progress moves: this component
  // re-renders on every asset event, and a write per event chained renders.
  const progressKey = `${Math.floor(safeProgress)}:${startup.revision}`;
  const [stalledAt, setStalledAt] = useState<string | null>(null);
  useEffect(() => {
    if (startup.ready) return;
    let timer: number | undefined;
    const arm = () => {
      window.clearTimeout(timer);
      timer =
        document.visibilityState === 'hidden'
          ? undefined
          : window.setTimeout(() => setStalledAt(progressKey), STALL_MS);
    };
    arm();
    document.addEventListener('visibilitychange', arm);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', arm);
    };
  }, [progressKey, startup.ready]);
  const showStall = stalledAt === progressKey && !startup.ready && startup.errors === 0;
  // The startup error count only rises, and strict readiness needs it at zero,
  // so a known error is final for this page load: say so and offer the way out
  // at once instead of after the slow-load delay.
  // Working if errors > 0 shows 'Loading could not finish' and Reload
  // immediately, while an error-free slow load keeps the original status.
  const hasStartupError = startup.errors > 0;
  const recoveryVisible = showRecovery || hasStartupError || slowWorldConfirmed;
  // The live status names the phase only (a few announcements per load); the
  // count beside it is visual, so a screen reader is not read every file.
  const progressText = startup.ready
    ? t('ready')
    : hasStartupError
      ? t('couldNotFinish')
      : progress.phase
        ? t(PHASE_LABEL[progress.phase])
        : t('preparing');
  const progressCount =
    !startup.ready && !hasStartupError && progress.phase && progress.total > 0
      ? t(PHASE_COUNT[progress.phase], {
          done: formatGrouped(progress.done),
          total: formatGrouped(progress.total),
        })
      : null;

  return (
    <>
      {showLoading && (
        <div
          ref={loadingRef}
          role="dialog"
          aria-modal="true"
          aria-label={t('dialogLabel')}
          tabIndex={-1}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center px-6"
          style={{
            backgroundColor: '#081015',
            opacity: isExiting ? 0 : 1,
            transition: reducedMotion ? 'none' : 'opacity 220ms ease-out',
          }}
        >
          <img
            src={`${import.meta.env.BASE_URL}textures/signage/millos-mark-v1.webp`}
            alt=""
            aria-hidden="true"
            width={56}
            height={56}
            style={{ display: 'block', marginBottom: '14px' }}
          />

          <div
            style={{
              color: '#dbe6e2',
              fontFamily: "'Inter', sans-serif",
              fontSize: '17px',
              fontWeight: 650,
              letterSpacing: '0.08em',
              textAlign: 'center',
            }}
          >
            {t('heading')}
          </div>

          <div
            aria-live="polite"
            style={{
              color: '#9fb3ad',
              fontFamily: "'Inter', sans-serif",
              fontSize: '13px',
              marginTop: '8px',
              minHeight: '20px',
              textAlign: 'center',
            }}
          >
            {progressText}
            {progressCount && (
              <span aria-hidden="true" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {' · '}
                {progressCount}
              </span>
            )}
          </div>

          {FEATURE_FLAGS.KNOWLEDGE_LOADING_QUOTES_ENABLED && showRecovery && (
            <div style={{ marginTop: '22px', maxWidth: '420px', textAlign: 'center' }}>
              <ErrorBoundary fallback={null}>
                <Suspense fallback={null}>
                  <DeferredLoadingQuote rotationInterval={8000} />
                </Suspense>
              </ErrorBoundary>
            </div>
          )}

          {/* The progressbar role sits on the track alone: its children are
            presentational, which would hide the live text and recovery control. */}
          <div
            role="progressbar"
            aria-label={t('progressLabel')}
            aria-valuenow={Math.round(safeProgress)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuetext={progressText}
            style={{
              width: 'min(320px, 78vw)',
              height: '4px',
              background: '#1c2b2f',
              marginTop: '22px',
              borderRadius: '999px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: '100%',
                height: '100%',
                background: '#d99a3d',
                transform: `scaleX(${safeProgress / 100})`,
                transformOrigin: 'left center',
                transition: reducedMotion ? 'none' : 'transform 180ms ease-out',
              }}
            />
          </div>

          {recoveryVisible &&
            !startup.ready &&
            (startup.prepared ||
              slowWorldConfirmed ||
              hasStartupError ||
              quality !== 'low' ||
              showStall) && (
              <div className="mt-6 flex max-w-md flex-col items-center gap-3 text-center text-sm text-slate-300">
                {(startup.prepared || slowWorldConfirmed) && (
                  <p>{startup.deferredShaders ? t('trucksPreparing') : t('slowAnimation')}</p>
                )}
                {/* Say why a bare quality switch appeared on a slow load. */}
                {!startup.prepared &&
                  !slowWorldConfirmed &&
                  !hasStartupError &&
                  quality !== 'low' && <p>{t('slowLoad')}</p>}
                {hasStartupError && <p>{t('resourcesFailed')}</p>}
                {showStall && <p>{t('stalledLoad')}</p>}
                {/* Reload is the explicit recovery control the focus trap waits for.
                  The service worker serves what already arrived, so it retries
                  only what failed. Working if every error state has a control. */}
                {(hasStartupError || showStall) && (
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="min-h-11 rounded-md border border-slate-500 px-4 py-2 text-slate-100 transition-colors hover:border-amber-400 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
                  >
                    {t('reload')}
                  </button>
                )}
                {/* Lower graphics cannot clear an error, so it is offered only
                  for a slow load. A visitor's click is their choice and is kept,
                  so a slow device is not slowed again on its next visit. */}
                {quality !== 'low' && !hasStartupError && (
                  <button
                    type="button"
                    onClick={() => {
                      resetStartupPreparation();
                      useGraphicsStore.getState().setGraphicsQuality('low');
                      // This button goes with the choice, and focus with it to
                      // <body>, where Tab reached the controls under the cover.
                      // Working if focus stays on the cover after the click.
                      loadingRef.current?.focus();
                    }}
                    className="min-h-11 rounded-md border border-slate-500 px-4 py-2 text-slate-100 transition-colors hover:border-amber-400 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
                  >
                    {t('useLowGraphics')}
                  </button>
                )}
                {/* Latched like the text above: a hitch must not pull this from
                  under the cursor. `openPreparedStartup` re-checks the world. */}
                {(startup.prepared || slowWorldConfirmed) && startup.errors === 0 && (
                  <button
                    type="button"
                    onClick={openPreparedStartup}
                    className="min-h-11 rounded-md border border-slate-500 px-4 py-2 text-slate-100 transition-colors hover:border-amber-400 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
                  >
                    {t('openLoadedScene')}
                  </button>
                )}
              </div>
            )}
        </div>
      )}
    </>
  );
};

export default LoadingScreen;
