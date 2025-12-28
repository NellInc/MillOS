/**
 * Worker Portrait Utility
 *
 * Maps worker IDs to their portrait image paths.
 */

// Portrait paths by worker ID
export const WORKER_PORTRAITS: Record<string, string> = {
  w1: '/assets/workers/w1_marcus_chen.png',
  w2: '/assets/workers/w2_sarah_mitchell.png',
  w3: '/assets/workers/w3_james_rodriguez.png',
  w4: '/assets/workers/w4_emily_ronson.png',
  w5: '/assets/workers/w5_david_kim.png',
  w6: '/assets/workers/w6_lisa_thompson.png',
  w7: '/assets/workers/w7_robert_garcia.png',
  w8: '/assets/workers/w8_anna_kowalski.png',
  w9: '/assets/workers/w9_michael_brown.png',
  w10: '/assets/workers/w10_jennifer_lee.png',
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
  return WORKER_PORTRAITS[workerId] ?? '/assets/workers/default_avatar.png';
};
