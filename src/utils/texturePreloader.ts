/**
 * Texture Preloader
 *
 * Generates all procedural textures at startup to avoid runtime hitches.
 * Call once in App initialization.
 */

import { generateBrushedMetal } from '../textures/brushedMetal';
import { generatePaintedMetal } from '../textures/paintedMetal';
import { generateConcrete, generateConcreteRoughness } from '../textures/concrete';
import { generateGrainPattern } from '../textures/grain';
import { generateRustPattern } from '../textures/rust';
import { generateSafetyStripe } from '../textures/safetyStripe';
import { generateProceduralNormal, generatePanelNormal } from '../textures/normalGenerator';
import { logger } from './logger';

/**
 * Preload all generative textures at startup.
 * Returns a promise that resolves when all textures are generated.
 */
export const preloadGenerativeTextures = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    logger.info('[Textures] Generating procedural textures...');
    const startTime = performance.now();

    // Each task generates one texture variant (they auto-cache). Chunked across
    // idle callbacks so the 16 generations do not block the first interactive
    // frames after mount; output is identical, only timing changes.
    const tasks: Array<() => void> = [
      // Brushed metal variants
      () => generateBrushedMetal(256, 0.3, 'horizontal'),
      () => generateBrushedMetal(256, 0.4, 'vertical'),
      () => generateBrushedMetal(256, 0.3, 'diagonal'),
      // Painted metal variants
      () => generatePaintedMetal(256, 0.2, 8),
      () => generatePaintedMetal(256, 0.4, 6),
      // Concrete/floor
      () => generateConcrete(512, 64, true),
      () => generateConcrete(512, 128, false),
      () => generateConcreteRoughness(512),
      // Specialty textures
      () => generateGrainPattern(256, 0.4),
      () => generateRustPattern(256, 0.3, 'down'),
      () => generateSafetyStripe(256, 32),
      // Normal maps
      () => generateProceduralNormal(256, 1.0, 10),
      () => generateProceduralNormal(256, 0.5, 15),
      () => generateProceduralNormal(256, 0.5, 20),
      () => generatePanelNormal(256, 4, 0.02),
      () => generatePanelNormal(512, 8, 0.03),
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
      logger.info(`[Textures] Generated ${totalTasks} procedural textures in ${elapsed.toFixed(1)}ms`);
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
