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

interface ModelAvailabilityCacheEntry {
  available: boolean;
  expiresAt: number;
}

const MODEL_CHECK_TIMEOUT_MS = 5_000;
const MODEL_FAILURE_CACHE_MS = 30_000;

// Successful checks are stable for the current build. Failures expire so a
// transient network or service-worker error does not disable an optional model
// for the rest of the browser session.
const modelAvailability = new Map<string, ModelAvailabilityCacheEntry>();
const modelAvailabilityChecks = new Map<string, Promise<boolean>>();

/**
 * Check if a model file exists
 * Uses HEAD request and verifies Content-Type to avoid SPA fallback false positives
 */
export async function checkModelExists(
  path: string,
  timeoutMs = MODEL_CHECK_TIMEOUT_MS
): Promise<boolean> {
  const cached = modelAvailability.get(path);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.available;
  }
  if (cached) modelAvailability.delete(path);

  const activeCheck = modelAvailabilityChecks.get(path);
  if (activeCheck) return activeCheck;

  const check = (async (): Promise<boolean> => {
    const controller = new AbortController();
    const safeTimeoutMs =
      Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : MODEL_CHECK_TIMEOUT_MS;
    const timeoutId = globalThis.setTimeout(() => controller.abort(), safeTimeoutMs);

    try {
      const response = await fetch(path, { method: 'HEAD', signal: controller.signal });
      if (!response.ok) {
        modelAvailability.set(path, {
          available: false,
          expiresAt: Date.now() + MODEL_FAILURE_CACHE_MS,
        });
        return false;
      }

      // Check Content-Type - if HTML, it's a 404 fallback page
      const contentType = response.headers.get('Content-Type') || '';
      if (contentType.includes('text/html')) {
        modelAvailability.set(path, {
          available: false,
          expiresAt: Date.now() + MODEL_FAILURE_CACHE_MS,
        });
        return false;
      }

      // File exists and is not HTML - consider it valid
      modelAvailability.set(path, { available: true, expiresAt: Number.POSITIVE_INFINITY });
      return true;
    } catch {
      modelAvailability.set(path, {
        available: false,
        expiresAt: Date.now() + MODEL_FAILURE_CACHE_MS,
      });
      return false;
    } finally {
      globalThis.clearTimeout(timeoutId);
      modelAvailabilityChecks.delete(path);
    }
  })();

  modelAvailabilityChecks.set(path, check);
  return check;
}
