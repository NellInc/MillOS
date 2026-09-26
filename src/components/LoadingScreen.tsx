import React, { Suspense, useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { FEATURE_FLAGS } from '../config/featureFlags';
import { recoverableLazy } from '../utils/recoverableLazy';

const DeferredLoadingQuote = recoverableLazy(() =>
  import('./knowledge/LoadingQuote').then((module) => ({ default: module.LoadingQuote }))
);

interface LoadingScreenProps {
  minimumLoadTimeMs?: number;
  maximumLoadTimeMs?: number;
}

interface LoadingProgress {
  progress: number;
  active: boolean;
  loaded: number;
  total: number;
  item: string;
  errors: string[];
}

const EMPTY_PROGRESS: LoadingProgress = {
  progress: 0,
  active: false,
  loaded: 0,
  total: 0,
  item: '',
  errors: [],
};

/**
 * Track Three's default asset queue without importing the complete Drei package
 * into the critical startup path. The previous callbacks are preserved so a
 * host integration can observe the same queue independently.
 */
function useLoadingProgress(): LoadingProgress {
  const [state, setState] = useState<LoadingProgress>(EMPTY_PROGRESS);

  useEffect(() => {
    const manager = THREE.DefaultLoadingManager;
    const previous = {
      onStart: manager.onStart,
      onLoad: manager.onLoad,
      onProgress: manager.onProgress,
      onError: manager.onError,
    };

    const update = (url: string, loaded: number, total: number, active: boolean): void => {
      const progress = total > 0 ? (loaded / total) * 100 : 0;
      setState((current) => ({ ...current, progress, active, loaded, total, item: url }));
    };

    const onStart: THREE.LoadingManager['onStart'] = (url, loaded, total) => {
      previous.onStart?.(url, loaded, total);
      update(url, loaded, total, true);
    };
    const onLoad: THREE.LoadingManager['onLoad'] = () => {
      previous.onLoad?.();
      setState((current) => ({ ...current, progress: 100, active: false }));
    };
    const onProgress: THREE.LoadingManager['onProgress'] = (url, loaded, total) => {
      previous.onProgress?.(url, loaded, total);
      update(url, loaded, total, loaded < total);
    };
    const onError: THREE.LoadingManager['onError'] = (url) => {
      previous.onError?.(url);
      setState((current) =>
        current.errors.includes(url) ? current : { ...current, errors: [...current.errors, url] }
      );
    };

    manager.onStart = onStart;
    manager.onLoad = onLoad;
    manager.onProgress = onProgress;
    manager.onError = onError;

    return () => {
      if (manager.onStart === onStart) manager.onStart = previous.onStart;
      if (manager.onLoad === onLoad) manager.onLoad = previous.onLoad;
      if (manager.onProgress === onProgress) manager.onProgress = previous.onProgress;
      if (manager.onError === onError) manager.onError = previous.onError;
    };
  }, []);

  return state;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  minimumLoadTimeMs = 700,
  maximumLoadTimeMs = 8000,
}) => {
  const { progress, active, loaded, total, item, errors } = useLoadingProgress();
  const [showLoading, setShowLoading] = useState(true);
  const [minimumTimePassed, setMinimumTimePassed] = useState(false);
  const [firstFrameRendered, setFirstFrameRendered] = useState(
    () => typeof document !== 'undefined' && document.documentElement.dataset.sceneReady === 'true'
  );
  const [canContinue, setCanContinue] = useState(false);
  const [dismissRequested, setDismissRequested] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  );

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return;
    const handleChange = (): void => setReducedMotion(query.matches);
    query.addEventListener?.('change', handleChange);
    return () => query.removeEventListener?.('change', handleChange);
  }, []);

  useEffect(() => {
    const handleFirstFrame = (): void => setFirstFrameRendered(true);
    window.addEventListener('millos:first-frame', handleFirstFrame);
    const sceneReadyObserver = new MutationObserver(() => {
      if (document.documentElement.dataset.sceneReady === 'true') {
        handleFirstFrame();
      }
    });
    sceneReadyObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-scene-ready'],
    });
    if (document.documentElement.dataset.sceneReady === 'true') {
      handleFirstFrame();
    }
    return () => {
      sceneReadyObserver.disconnect();
      window.removeEventListener('millos:first-frame', handleFirstFrame);
    };
  }, []);

  useEffect(() => {
    const minimumTimer = window.setTimeout(() => setMinimumTimePassed(true), minimumLoadTimeMs);
    const continueTimer = window.setTimeout(
      () => setCanContinue(true),
      Math.min(4000, maximumLoadTimeMs)
    );
    const maximumTimer = window.setTimeout(() => {
      document.documentElement.dataset.loaderFallback = 'true';
      setDismissRequested(true);
    }, maximumLoadTimeMs);

    return () => {
      window.clearTimeout(minimumTimer);
      window.clearTimeout(continueTimer);
      window.clearTimeout(maximumTimer);
    };
  }, [maximumLoadTimeMs, minimumLoadTimeMs]);

  const assetQueueComplete = !active && total > 0 && loaded >= total;

  useEffect(() => {
    const sceneCanShow = minimumTimePassed && (firstFrameRendered || assetQueueComplete);
    if (!dismissRequested && !sceneCanShow) return;

    setIsExiting(true);
    const hideTimer = window.setTimeout(() => setShowLoading(false), reducedMotion ? 0 : 220);
    return () => window.clearTimeout(hideTimer);
  }, [assetQueueComplete, dismissRequested, firstFrameRendered, minimumTimePassed, reducedMotion]);

  const safeProgress = Number.isFinite(progress) ? Math.min(100, Math.max(0, progress)) : 0;
  const progressText = useMemo(() => {
    if (errors.length > 0) return 'A few optional assets were skipped — the mill runs without them';
    if (firstFrameRendered) return 'Ready when you are';
    if (active && total > 0) return `Loading scene assets, ${loaded} of ${total}`;
    if (item) return 'Assembling the machinery';
    return 'Firing up the mill';
  }, [active, errors.length, firstFrameRendered, item, loaded, total]);

  return (
    <>
      {showLoading && (
        <div
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center px-6"
          style={{
            backgroundColor: '#081015',
            opacity: isExiting ? 0 : 1,
            transition: reducedMotion ? 'none' : 'opacity 220ms ease-out',
          }}
        >
          <div aria-hidden="true" style={{ fontSize: '56px', marginBottom: '14px' }}>
            🏭
          </div>

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
            WARMING UP THE ROLLERS
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

          {FEATURE_FLAGS.KNOWLEDGE_LOADING_QUOTES_ENABLED && canContinue && (
            <div style={{ marginTop: '22px', maxWidth: '420px', textAlign: 'center' }}>
              <Suspense fallback={null}>
                <DeferredLoadingQuote rotationInterval={8000} />
              </Suspense>
            </div>
          )}

          {/* The progressbar role sits on the track alone: its children are
            presentational, which would hide the live text and Enter now. */}
          <div
            role="progressbar"
            aria-label="Loading MillOS"
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
                transform: `scaleX(${(firstFrameRendered ? 100 : safeProgress) / 100})`,
                transformOrigin: 'left center',
                transition: reducedMotion ? 'none' : 'transform 180ms ease-out',
              }}
            />
          </div>

          {canContinue && !firstFrameRendered && (
            <button
              type="button"
              onClick={() => setDismissRequested(true)}
              className="mt-6 rounded-md border border-slate-500 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-100 transition-colors hover:border-amber-400 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
            >
              Enter now
            </button>
          )}
        </div>
      )}
    </>
  );
};

export default LoadingScreen;
