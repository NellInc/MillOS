import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  getStartupSnapshot,
  markStartupPrepared,
  markStartupReady,
  StartupFrameWindow,
} from '../utils/startupReadiness';
import { useGraphicsStore } from '../stores/graphicsStore';

/** Observe the previous rendered frame without taking over R3F/composer rendering. */
export function StartupReadiness(): null {
  const windowRef = useRef(new StartupFrameWindow());
  useFrame(({ gl }) => {
    const startup = getStartupSnapshot();
    if (startup.ready) return;
    const data = document.documentElement.dataset;
    const prerequisitesReady = (): boolean =>
      data.millosWorldReady === 'true' &&
      data.millosStaticBatchesPending === '0' &&
      getStartupSnapshot().pendingAssets === 0 &&
      getStartupSnapshot().pendingTasks === 0 &&
      document.visibilityState !== 'hidden' &&
      !gl.getContext().isContextLost();
    // Rendering new materials or uploading geometry/textures restarts sampling.
    const revision = (): string =>
      [
        getStartupSnapshot().revision,
        gl.info.programs?.length ?? 0,
        gl.info.memory.geometries,
        gl.info.memory.textures,
        useGraphicsStore.getState().graphics.quality,
        useGraphicsStore.getState().graphics.resolutionScale,
      ].join(':');
    const frameRevision = revision();
    const graphics = useGraphicsStore.getState().graphics;
    if (
      windowRef.current.sample({
        now: performance.now(),
        prerequisitesReady: prerequisitesReady(),
        revision: frameRevision,
      })
    ) {
      markStartupReady();
    } else {
      markStartupPrepared(
        windowRef.current.prepared,
        () =>
          prerequisitesReady() &&
          revision() === frameRevision &&
          useGraphicsStore.getState().graphics === graphics
      );
    }
  }, -999);
  return null;
}
