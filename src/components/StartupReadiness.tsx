import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  getStartupSnapshot,
  markStartupReady,
  StartupFrameWindow,
} from '../utils/startupReadiness';

/** Observe the previous rendered frame without taking over R3F/composer rendering. */
export function StartupReadiness(): null {
  const windowRef = useRef(new StartupFrameWindow());
  useFrame(({ gl }) => {
    const startup = getStartupSnapshot();
    if (startup.ready) return;
    const data = document.documentElement.dataset;
    const prerequisitesReady =
      data.millosWorldReady === 'true' &&
      data.millosStaticBatchesPending === '0' &&
      startup.pendingAssets === 0 &&
      startup.pendingTasks === 0 &&
      document.visibilityState !== 'hidden' &&
      !gl.getContext().isContextLost();
    // Rendering new materials or uploading geometry/textures restarts sampling.
    const revision = [
      startup.revision,
      gl.info.programs?.length ?? 0,
      gl.info.memory.geometries,
      gl.info.memory.textures,
    ].join(':');
    if (windowRef.current.sample({ now: performance.now(), prerequisitesReady, revision })) {
      markStartupReady();
    }
  }, -999);
  return null;
}
