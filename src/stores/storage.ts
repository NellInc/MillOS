import {
  createJSONStorage,
  type PersistStorage,
  type StateStorage,
  type StorageValue,
} from 'zustand/middleware';

// Provides a JSON storage implementation that falls back to in-memory storage
// when localStorage is unavailable (SSR/tests). Prevents persist() from throwing.
const createMemoryStorage = (): StateStorage => {
  const store = new Map<string, string>();
  return {
    getItem: (name) => store.get(name) ?? null,
    setItem: (name, value) => {
      store.set(name, value);
    },
    removeItem: (name) => {
      store.delete(name);
    },
  };
};

const createMemoryPersistStorage = (): PersistStorage<unknown> => {
  const store = new Map<string, StorageValue<unknown>>();
  return {
    getItem: (name) => store.get(name) ?? null,
    setItem: (name, value) => {
      store.set(name, value);
    },
    removeItem: (name) => {
      store.delete(name);
    },
  };
};

function isTestEnvironment(): boolean {
  return (
    typeof process !== 'undefined' &&
    (process.env?.NODE_ENV === 'test' || process.env?.VITEST === 'true')
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function mergePersistedValue<T>(currentValue: T, persistedValue: unknown): T {
  if (Array.isArray(currentValue)) {
    return (Array.isArray(persistedValue) ? persistedValue : currentValue) as T;
  }

  if (isRecord(currentValue)) {
    if (!isRecord(persistedValue)) return currentValue;
    const currentRecord = currentValue as Record<string, unknown>;
    const mergedRecord: Record<string, unknown> = { ...currentRecord };

    for (const key of Object.keys(currentRecord)) {
      if (!Object.hasOwn(persistedValue, key)) continue;
      mergedRecord[key] = mergePersistedValue(currentRecord[key], persistedValue[key]);
    }
    return mergedRecord as T;
  }

  if (typeof currentValue === 'number') {
    return (
      typeof persistedValue === 'number' && Number.isFinite(persistedValue)
        ? persistedValue
        : currentValue
    ) as T;
  }

  if (typeof currentValue === 'string' || typeof currentValue === 'boolean') {
    return (typeof persistedValue === typeof currentValue ? persistedValue : currentValue) as T;
  }

  if (currentValue === null && persistedValue === null) return persistedValue as T;
  return currentValue;
}

/**
 * Merge JSON-backed persisted state through the current store shape. Unknown
 * keys and wrong primitive types are ignored, missing nested keys retain their
 * current defaults, and action functions cannot be replaced by stored data.
 */
export function mergePersistedState<T extends object>(persisted: unknown, current: T): T {
  return mergePersistedValue(current, persisted);
}

export const safeJSONStorage: PersistStorage<unknown> = isTestEnvironment()
  ? createMemoryPersistStorage()
  : createJSONStorage(() => {
      if (typeof window !== 'undefined') {
        const candidate = window.localStorage as Partial<StateStorage> | undefined;
        if (
          candidate &&
          typeof candidate.getItem === 'function' &&
          typeof candidate.setItem === 'function' &&
          typeof candidate.removeItem === 'function'
        ) {
          return candidate as StateStorage;
        }
      }
      return createMemoryStorage();
    })!;
