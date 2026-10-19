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
import { useT } from '../i18n';
import { loadingScreenMessages } from './LoadingScreen.messages';

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
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  minimumLoadTimeMs = 700,
  recoveryDelayMs = 30000,
}) => {
  const t = useT(loadingScreenMessages);
  const startup = useSyncExternalStore(subscribeStartup, getStartupSnapshot);
  const quality = useGraphicsStore((state) => state.graphics.quality);
  const [showLoading, setShowLoading] = useState(true);
  const [minimumTimePassed, setMinimumTimePassed] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  );
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
    const recoveryTimer = window.setTimeout(() => setShowRecovery(true), recoveryDelayMs);
    return () => {
      window.clearTimeout(minimumTimer);
      window.clearTimeout(recoveryTimer);
    };
  }, [recoveryDelayMs, minimumLoadTimeMs]);

  useEffect(() => {
    if (!(minimumTimePassed && (startup.ready || startup.opened))) return;
    setIsExiting(true);
    const hideTimer = window.setTimeout(() => setShowLoading(false), reducedMotion ? 0 : 220);
    return () => window.clearTimeout(hideTimer);
  }, [startup.ready, startup.opened, minimumTimePassed, reducedMotion]);

  const safeProgress = startup.ready
    ? 100
    : Math.min(95, startup.totalAssets > 0 ? (startup.loadedAssets / startup.totalAssets) * 95 : 0);
  // The startup error count only rises, and strict readiness needs it at zero,
  // so a known error is final for this page load: say so and offer the way out
  // at once instead of after the slow-load delay.
  // Working if errors > 0 shows 'Loading could not finish' and Reload
  // immediately, while an error-free slow load keeps the original status.
  const hasStartupError = startup.errors > 0;
  const recoveryVisible = showRecovery || hasStartupError;
  const progressText = startup.ready
    ? t('ready')
    : hasStartupError
      ? t('couldNotFinish')
      : t('preparing');

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
            (startup.prepared || hasStartupError || quality !== 'low') && (
              <div className="mt-6 flex max-w-md flex-col items-center gap-3 text-center text-sm text-slate-300">
                {startup.prepared && <p>{t('slowAnimation')}</p>}
                {hasStartupError && <p>{t('resourcesFailed')}</p>}
                {/* Reload is the explicit recovery control the focus trap waits for.
                  The service worker serves what already arrived, so it retries
                  only what failed. Working if every error state has a control. */}
                {hasStartupError && (
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
                    }}
                    className="min-h-11 rounded-md border border-slate-500 px-4 py-2 text-slate-100 transition-colors hover:border-amber-400 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
                  >
                    {t('useLowGraphics')}
                  </button>
                )}
                {startup.prepared && startup.errors === 0 && (
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
