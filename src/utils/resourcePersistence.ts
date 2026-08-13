/**
 * Compatibility reader for the one persisted GPU setting still consumed by
 * the renderer. Earlier prototypes also stored resource-recreation metadata,
 * compression flags, and LOD settings under this module. Those APIs had no
 * runtime callers and could not recreate GPU resources, so they were removed.
 */

const SETTINGS_KEY = 'millos-gpu-settings';
const MEBIBYTE = 1024 * 1024;
const DEFAULT_MEMORY_BUDGET = 512 * MEBIBYTE;
const MIN_MEMORY_BUDGET = 64 * MEBIBYTE;
const MAX_MEMORY_BUDGET = 4 * 1024 * MEBIBYTE;

export interface GPUSettings {
  memoryBudget: number;
}

const defaultSettings = (): GPUSettings => ({ memoryBudget: DEFAULT_MEMORY_BUDGET });

/**
 * Read a legacy renderer memory budget without trusting arbitrary persisted
 * values. The application has no current writer for this key, but honouring a
 * sane historical value avoids silently changing existing installations.
 */
export function getGPUSettings(): GPUSettings {
  try {
    const serialized = localStorage.getItem(SETTINGS_KEY);
    if (!serialized) return defaultSettings();

    const parsed: unknown = JSON.parse(serialized);
    if (!parsed || typeof parsed !== 'object') return defaultSettings();

    const memoryBudget = (parsed as Record<string, unknown>).memoryBudget;
    if (
      typeof memoryBudget !== 'number' ||
      !Number.isFinite(memoryBudget) ||
      memoryBudget < MIN_MEMORY_BUDGET ||
      memoryBudget > MAX_MEMORY_BUDGET
    ) {
      return defaultSettings();
    }

    return { memoryBudget };
  } catch {
    return defaultSettings();
  }
}
