import {
  createJSONStorage,
  type PersistStorage,
  type StateStorage,
  type StorageValue,
} from 'zustand/middleware';
import { logger } from '../utils/logger';

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

function resolveLocalStorage(): StateStorage | undefined {
  try {
    // Reading window.localStorage itself throws in sandboxed iframes and some
    // blocked-storage/private contexts.
    const candidate =
      typeof window !== 'undefined'
        ? (window.localStorage as Partial<StateStorage> | undefined)
        : undefined;
    if (
      candidate &&
      typeof candidate.getItem === 'function' &&
      typeof candidate.setItem === 'function' &&
      typeof candidate.removeItem === 'function'
    ) {
      return candidate as StateStorage;
    }
  } catch {
    // Fall through to in-memory storage.
  }
  return undefined;
}

let warnedWriteFailure = false;

// Persisted stores write synchronously inside set(), including on the 2 Hz
// simulation tick, so a QuotaExceededError must never escape: it would abort
// the rest of the tick. Failures are logged once per session.
const createGuardedStorage = (base: StateStorage): StateStorage => ({
  getItem: (name) => {
    try {
      return base.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      return base.setItem(name, value);
    } catch (error) {
      if (!warnedWriteFailure) {
        warnedWriteFailure = true;
        logger.warn('[storage] Persisting state failed; continuing without saving.', error);
      }
    }
  },
  removeItem: (name) => {
    try {
      return base.removeItem(name);
    } catch {
      // Ignore: nothing to clean up if storage is unavailable.
    }
  },
});

export const safeJSONStorage: PersistStorage<unknown> = isTestEnvironment()
  ? createMemoryPersistStorage()
  : (createJSONStorage(() =>
      createGuardedStorage(resolveLocalStorage() ?? createMemoryStorage())
    ) ?? createMemoryPersistStorage());
