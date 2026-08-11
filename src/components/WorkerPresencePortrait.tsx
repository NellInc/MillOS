import { useState } from 'react';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { DEFAULT_AVATAR_DATA_URI, getWorkerPresenceAssets } from '../utils/workerPortraits';

interface WorkerPresencePortraitProps {
  workerId: string;
  workerName: string;
  className?: string;
}

interface FallbackState {
  sourceKey: string;
  stage: number;
}

export const WorkerPresencePortrait: React.FC<WorkerPresencePortraitProps> = ({
  workerId,
  workerName,
  className = '',
}) => {
  const prefersReducedMotion = useReducedMotion();
  const assets = getWorkerPresenceAssets(workerId);
  const preferredSource = prefersReducedMotion ? assets.rest : assets.animation;
  const sourceKey = `${workerId}:${prefersReducedMotion ? 'rest' : 'animation'}`;
  const [fallbackState, setFallbackState] = useState<FallbackState>({ sourceKey, stage: 0 });
  const activeStage = fallbackState.sourceKey === sourceKey ? fallbackState.stage : 0;
  const sources = [...new Set([preferredSource, assets.portrait, DEFAULT_AVATAR_DATA_URI])].filter(
    (source): source is string => Boolean(source)
  );
  const sourceIndex = Math.min(activeStage, sources.length - 1);
  const src = sources[sourceIndex];

  const sourceKind =
    src === preferredSource
      ? prefersReducedMotion
        ? 'rest'
        : 'animation'
      : src === DEFAULT_AVATAR_DATA_URI
        ? 'default'
        : 'portrait';

  const handleError = () => {
    if (sourceIndex < sources.length - 1) {
      setFallbackState({ sourceKey, stage: sourceIndex + 1 });
    }
  };

  return (
    <img
      key={`${sourceKey}:${src}`}
      src={src}
      alt=""
      aria-hidden="true"
      width={192}
      height={256}
      loading="lazy"
      decoding="async"
      draggable={false}
      data-testid="worker-presence-portrait"
      data-worker-id={workerId}
      data-worker-name={workerName}
      data-portrait-source={sourceKind}
      className={`h-full w-full select-none object-contain object-bottom ${className}`}
      onError={sourceIndex < sources.length - 1 ? handleError : undefined}
    />
  );
};
