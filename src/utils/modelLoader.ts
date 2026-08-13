/**
 * Model Loader Utility
 *
 * Canonical paths and availability checks for the authored runtime assets.
 * Provenance, licences, geometry contracts, and delivery requirements live in
 * public/models/asset-manifest.json.
 */

// Model paths configuration - use BASE_URL for correct path at any deployment location
const BASE = import.meta.env.BASE_URL;
export const WORKER_ASSET_PATHS = {
  compatibility: `${BASE}models/worker/worker.glb`,
  masculine: `${BASE}models/worker/worker-masculine.glb`,
  feminine: `${BASE}models/worker/worker-feminine.glb`,
  skin: `${BASE}models/worker/worker-skin.png`,
} as const;

export const MODEL_PATHS = {
  forklift: `${BASE}models/forklift/forklift.glb`,
  worker: WORKER_ASSET_PATHS.compatibility,
} as const;

// These two runtime assets are required by public/models/asset-manifest.json,
// validated before delivery, and copied into every Vite build. Treating them as
// optional would issue redundant HEAD requests before the real model download.
const BUNDLED_MODELS: ReadonlySet<string> = new Set(['forklift', 'worker']);

export function isBundledModel(modelType: string): boolean {
  return BUNDLED_MODELS.has(modelType);
}

// Track which models are available
const modelAvailability: Record<string, boolean | null> = {};
const modelAvailabilityChecks = new Map<string, Promise<boolean>>();

/**
 * Check if a model file exists
 * Uses HEAD request and verifies Content-Type to avoid SPA fallback false positives
 */
export async function checkModelExists(path: string): Promise<boolean> {
  if (modelAvailability[path] !== undefined && modelAvailability[path] !== null) {
    return modelAvailability[path] as boolean;
  }

  const activeCheck = modelAvailabilityChecks.get(path);
  if (activeCheck) return activeCheck;

  const check = (async (): Promise<boolean> => {
    try {
      const response = await fetch(path, { method: 'HEAD' });
      if (!response.ok) {
        modelAvailability[path] = false;
        return false;
      }

      // Check Content-Type - if HTML, it's a 404 fallback page
      const contentType = response.headers.get('Content-Type') || '';
      if (contentType.includes('text/html')) {
        modelAvailability[path] = false;
        return false;
      }

      // File exists and is not HTML - consider it valid
      modelAvailability[path] = true;
      return true;
    } catch {
      modelAvailability[path] = false;
      return false;
    } finally {
      modelAvailabilityChecks.delete(path);
    }
  })();

  modelAvailabilityChecks.set(path, check);
  return check;
}
