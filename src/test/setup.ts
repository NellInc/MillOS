/**
 * Vitest Test Setup
 *
 * Global configuration for all tests.
 */

import { vi, afterEach, expect } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';

// Extend vitest's expect with jest-dom matchers
expect.extend(matchers);

function createMemoryStorage(): Storage {
  let store: Record<string, string> = {};

  return {
    get length() {
      return Object.keys(store).length;
    },
    clear: () => {
      store = {};
    },
    getItem: (key: string) => {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    key: (index: number) => {
      const keys = Object.keys(store);
      return keys[index] ?? null;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
  };
}

// Ensure `globalThis.localStorage/sessionStorage` exist for Zustand persist in tests.
const testLocalStorage =
  typeof window !== 'undefined' &&
  window.localStorage &&
  typeof window.localStorage.getItem === 'function' &&
  typeof window.localStorage.setItem === 'function'
    ? window.localStorage
    : createMemoryStorage();

const testSessionStorage =
  typeof window !== 'undefined' &&
  window.sessionStorage &&
  typeof window.sessionStorage.getItem === 'function' &&
  typeof window.sessionStorage.setItem === 'function'
    ? window.sessionStorage
    : createMemoryStorage();

Object.defineProperty(globalThis, 'localStorage', {
  value: testLocalStorage,
  writable: true,
});

Object.defineProperty(globalThis, 'sessionStorage', {
  value: testSessionStorage,
  writable: true,
});

// Mock window.indexedDB for history storage tests
// Create a proper mock that triggers callbacks asynchronously

function createMockObjectStore() {
  const store: Record<string, unknown> = {};
  return {
    put: vi.fn((_value: unknown, _key: string) => {
      store[_key] = _value;
      return { onsuccess: null, onerror: null };
    }),
    add: vi.fn((_value: unknown) => {
      const request = { onsuccess: null as (() => void) | null, onerror: null };
      setTimeout(() => request.onsuccess?.(), 0);
      return request;
    }),
    get: vi.fn((key: string) => {
      const request = {
        result: store[key],
        onsuccess: null as (() => void) | null,
        onerror: null,
      };
      setTimeout(() => request.onsuccess?.(), 0);
      return request;
    }),
    getAll: vi.fn(() => {
      const request = {
        result: Object.values(store),
        onsuccess: null as (() => void) | null,
        onerror: null,
      };
      setTimeout(() => request.onsuccess?.(), 0);
      return request;
    }),
    delete: vi.fn(),
    count: vi.fn(() => {
      const request = {
        result: Object.keys(store).length,
        onsuccess: null as (() => void) | null,
        onerror: null,
      };
      setTimeout(() => request.onsuccess?.(), 0);
      return request;
    }),
    clear: vi.fn(() => {
      const request = { onsuccess: null as (() => void) | null, onerror: null };
      setTimeout(() => request.onsuccess?.(), 0);
      return request;
    }),
    createIndex: vi.fn(),
    index: vi.fn(() => ({
      getAll: vi.fn(() => {
        const request = {
          result: [],
          onsuccess: null as (() => void) | null,
          onerror: null,
        };
        setTimeout(() => request.onsuccess?.(), 0);
        return request;
      }),
      openCursor: vi.fn(() => {
        const request = {
          result: null,
          onsuccess: null as (() => void) | null,
          onerror: null,
        };
        setTimeout(() => request.onsuccess?.(), 0);
        return request;
      }),
    })),
  };
}

function createMockTransaction() {
  const stores: Record<string, ReturnType<typeof createMockObjectStore>> = {
    tagHistory: createMockObjectStore(),
    alarmHistory: createMockObjectStore(),
  };

  return {
    objectStore: vi.fn((_name: string) => stores[_name] || createMockObjectStore()),
    oncomplete: null as (() => void) | null,
    onerror: null,
    abort: vi.fn(),
  };
}

function createMockDatabase() {
  return {
    objectStoreNames: {
      contains: vi.fn().mockReturnValue(false),
    },
    createObjectStore: vi.fn(() => createMockObjectStore()),
    transaction: vi.fn((_storeNames: string | string[], _mode?: string) => {
      const tx = createMockTransaction();
      // Trigger oncomplete asynchronously
      setTimeout(() => tx.oncomplete?.(), 0);
      return tx;
    }),
    close: vi.fn(),
  };
}

const mockIndexedDB = {
  open: vi.fn((_name: string, _version?: number) => {
    const mockDb = createMockDatabase();
    const request = {
      result: mockDb,
      error: null,
      onerror: null as ((event: unknown) => void) | null,
      onsuccess: null as ((event: unknown) => void) | null,
      onupgradeneeded: null as ((event: unknown) => void) | null,
    };

    // Trigger callbacks asynchronously like real IndexedDB
    setTimeout(() => {
      // Trigger onupgradeneeded if this is a new database
      if (request.onupgradeneeded) {
        request.onupgradeneeded({ target: request });
      }
      // Then trigger onsuccess
      if (request.onsuccess) {
        request.onsuccess({ target: request });
      }
    }, 0);

    return request;
  }),
  deleteDatabase: vi.fn(),
};

Object.defineProperty(global, 'indexedDB', {
  value: mockIndexedDB,
  writable: true,
});

// Mock IDBKeyRange for IndexedDB queries
const mockIDBKeyRange = {
  bound: vi.fn((lower: unknown, upper: unknown, lowerOpen?: boolean, upperOpen?: boolean) => ({
    lower,
    upper,
    lowerOpen: lowerOpen ?? false,
    upperOpen: upperOpen ?? false,
  })),
  only: vi.fn((value: unknown) => ({ lower: value, upper: value })),
  lowerBound: vi.fn((lower: unknown, open?: boolean) => ({ lower, lowerOpen: open ?? false })),
  upperBound: vi.fn((upper: unknown, open?: boolean) => ({ upper, upperOpen: open ?? false })),
};

Object.defineProperty(global, 'IDBKeyRange', {
  value: mockIDBKeyRange,
  writable: true,
});

// Mock performance.now() for consistent timing tests
if (typeof performance === 'undefined') {
  global.performance = {
    now: () => Date.now(),
    mark: vi.fn(),
    measure: vi.fn(),
    clearMarks: vi.fn(),
    clearMeasures: vi.fn(),
    getEntriesByName: vi.fn().mockReturnValue([]),
    getEntriesByType: vi.fn().mockReturnValue([]),
  } as unknown as Performance;
}

// Mock structuredClone if not available
if (typeof structuredClone === 'undefined') {
  global.structuredClone = <T>(obj: T): T => JSON.parse(JSON.stringify(obj));
}

// Suppress console.log in tests unless DEBUG is set
if (!process.env.DEBUG) {
  vi.spyOn(console, 'log').mockImplementation(() => {});

  const originalWarn = console.warn;
  const suppressedWarnings = [
    'Cannot write to read-only tag',
    'IndexedDB not available; running without persistence',
    'Multiple instances of Three.js being imported.',
  ];

  vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    const message = args.map(String).join(' ');
    if (suppressedWarnings.some((pattern) => message.includes(pattern))) {
      return;
    }
    originalWarn(...args);
  });
}

// Filter noisy Node warnings from Vitest workers (e.g., missing --localstorage-file path)
const originalEmitWarning = process.emitWarning.bind(process);
process.emitWarning = ((warning: any, ...args: any[]) => {
  const message = typeof warning === 'string' ? warning : warning?.message;
  if (typeof message === 'string' && message.includes('--localstorage-file')) {
    return;
  }
  return originalEmitWarning(warning as any, ...(args as [any]));
}) as typeof process.emitWarning;

// Clean up after each test
afterEach(() => {
  vi.clearAllMocks();
});
