/**
 * Worker Portrait Utility
 *
 * Maps worker IDs to their portrait image paths.
 */

// Portrait paths by worker ID
export const WORKER_PORTRAITS: Record<string, string> = {
  w1: '/assets/workers/w1_marcus_chen.webp',
  w2: '/assets/workers/w2_sarah_mitchell.webp',
  w3: '/assets/workers/w3_james_rodriguez.webp',
  w4: '/assets/workers/w4_emily_ronson.webp',
  w5: '/assets/workers/w5_david_kim.webp',
  w6: '/assets/workers/w6_lisa_thompson.webp',
  w7: '/assets/workers/w7_robert_garcia.webp',
  w8: '/assets/workers/w8_anna_kowalski.webp',
  w9: '/assets/workers/w9_michael_brown.webp',
  w10: '/assets/workers/w10_jennifer_lee.webp',
};

/**
 * Get the portrait path for a worker by ID
 * Returns undefined if no portrait exists
 */
export const getWorkerPortrait = (workerId: string): string | undefined => {
  return WORKER_PORTRAITS[workerId];
};

/**
 * Get the portrait path for a worker, with fallback to default avatar
 */
export const getWorkerPortraitOrDefault = (workerId: string): string => {
  return WORKER_PORTRAITS[workerId] ?? '/assets/workers/default_avatar.webp';
};
