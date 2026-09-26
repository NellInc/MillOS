/**
 * Texture Preloader
 *
 * Warms the procedural textures that live surfaces request lazily at mount, so
 * those mounts do not hitch. Call once in App initialization.
 */

import { getFlourSackMaps } from '../textures/grain';
import { generateProceduralNormal } from '../textures/normalGenerator';
import { logger } from './logger';

/**
 * Preload all generative textures at startup.
 * Returns a promise that resolves when all textures are generated.
 */
export const preloadGenerativeTextures = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    logger.info('[Textures] Generating procedural textures...');
    const startTime = performance.now();

    // Each task generates one texture variant (they auto-cache). Only keys a
    // live surface requests lazily at mount belong here: everything the shared
    // material modules build at import is already cached, and a variant nothing
    // samples is pure main-thread work. Chunked across idle callbacks so the
    // generations do not block the first interactive frames after mount.
    const tasks: Array<() => void> = [
      // Flour-sack cloth (albedo + normal + roughness) for the conveyor bags.
      // Requested through the shared preset helper so these cache keys are
      // byte-identical to the ones ConveyorSystem asks for at mount.
      () => getFlourSackMaps(),
      // Sheet-metal detail relief for the spouting runs, requested by
      // SpoutingSystem's route materials on medium and above (it clones this
      // and re-tiles it; the cached source is shared).
      () => generateProceduralNormal(256, 0.12, 16),
    ];

    const totalTasks = tasks.length;
    // Prefer requestIdleCallback to avoid blocking; fall back to setTimeout so
    // the chunk loop (and this Promise) still completes in non-browser/test envs.
    const scheduleIdle = (cb: () => void): void => {
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(cb, { timeout: 2000 });
      } else {
        setTimeout(cb, 0);
      }
    };

    let index = 0;
    const runChunk = (): void => {
      try {
        // Generate a small batch per idle slice to keep each slice short.
        const batchEnd = Math.min(index + 2, totalTasks);
        for (; index < batchEnd; index++) {
          tasks[index]();
        }
      } catch (error) {
        // Preserve the original synchronous executor's reject-on-throw behavior.
        reject(error instanceof Error ? error : new Error(String(error)));
        return;
      }

      if (index < totalTasks) {
        scheduleIdle(runChunk);
        return;
      }

      const elapsed = performance.now() - startTime;
      logger.info(
        `[Textures] Generated ${totalTasks} procedural textures in ${elapsed.toFixed(1)}ms`
      );
      resolve();
    };

    runChunk();
  });
};

/**
 * Check if textures have already been preloaded.
 * Can be used to avoid duplicate preload calls.
 */
let texturesPreloaded = false;

export const areTexturesPreloaded = (): boolean => texturesPreloaded;

export const preloadGenerativeTexturesOnce = async (): Promise<void> => {
  if (texturesPreloaded) {
    logger.debug('[Textures] Already preloaded, skipping');
    return;
  }

  await preloadGenerativeTextures();
  texturesPreloaded = true;
};
