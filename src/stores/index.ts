/**
 * Domain-Specific Stores Index
 *
 * This file provides:
 * 1. Named exports for all individual stores
 * 2. Re-exports for backwards compatibility with the old unified store
 * 3. A combined useMillStore hook that provides access to all stores
 *
 * PERFORMANCE FIX (Dec 2024): useMillStore now uses useSyncExternalStore
 * to only re-render when the selected value changes, not on every store update.
 */

import { useSyncExternalStore, useRef, useCallback } from 'react';

// Import individual stores for local use in useMillStore
import { useGraphicsStore, GRAPHICS_PRESETS } from './graphicsStore';
import { useGameSimulationStore } from './gameSimulationStore';
import { useProductionStore } from './productionStore';
import { useSafetyStore } from './safetyStore';
import { useUIStore } from './uiStore';

// Re-export individual stores
export { useGraphicsStore, GRAPHICS_PRESETS };
export { useGameSimulationStore };
export { useProductionStore };
export { useSafetyStore };
export { useUIStore };
export {
  useOperationsCampaignStore,
  INCIDENT_DEFINITIONS,
  MILL_RECIPES,
} from './operationsCampaignStore';
export type {
  CampaignConstraint,
  CampaignLogEntry,
  CustomerOrder,
  IncidentKind,
  OperationalIncident,
  ShiftCampaignReport,
} from './operationsCampaignStore';

// Extend Window interface for store globals (dev mode only)
declare global {
  interface Window {
    useGraphicsStore?: typeof useGraphicsStore;
    useProductionStore?: typeof useProductionStore;
    useGameSimulationStore?: typeof useGameSimulationStore;
    useSafetyStore?: typeof useSafetyStore;
    useUIStore?: typeof useUIStore;
  }
}

// Expose stores to window for performance testing (dev mode only)
if (typeof window !== 'undefined' && import.meta.env?.DEV) {
  window.useGraphicsStore = useGraphicsStore;
  window.useProductionStore = useProductionStore;
  window.useGameSimulationStore = useGameSimulationStore;
  window.useSafetyStore = useSafetyStore;
  window.useUIStore = useUIStore;
}

// Re-export types
export type { GraphicsQuality, GraphicsSettings } from './graphicsStore';

// Cache combined state to avoid rebuilding it for every subscriber on every store update
let combinedStateCache: CombinedStoreState | null = null;

// PERFORMANCE FIX: Removed global store subscriptions that caused cascading invalidations
// Previously, ANY store update would trigger ALL subscribers to re-render
// Now cache is invalidated lazily only when getCombinedState() is called
const invalidateCombinedState = () => {
  combinedStateCache = null;
};

// Build the combined state from all stores, uncached.
function buildCombinedState(): CombinedStoreState {
  return {
    ...useGraphicsStore.getState(),
    ...useGameSimulationStore.getState(),
    ...useProductionStore.getState(),
    ...useSafetyStore.getState(),
    ...useUIStore.getState(),
  };
}

// Cached combined state for the useMillStore hook's getSnapshot path only.
// The cache is cleared by subscribeToAllStores when any store changes, so it
// is only valid while a hook subscription is mounted; imperative getState and
// subscribe read fresh state instead.
function getCombinedState(): CombinedStoreState {
  if (!combinedStateCache) {
    combinedStateCache = buildCombinedState();
  }
  return combinedStateCache;
}

// Subscribe to all stores and call listener on any change
function subscribeToAllStores(listener: () => void): () => void {
  const wrappedListener = () => {
    invalidateCombinedState();
    listener();
  };

  const unsubscribers = [
    useGraphicsStore.subscribe(wrappedListener),
    useGameSimulationStore.subscribe(wrappedListener),
    useProductionStore.subscribe(wrappedListener),
    useSafetyStore.subscribe(wrappedListener),
    useUIStore.subscribe(wrappedListener),
  ];
  return () => unsubscribers.forEach((unsub) => unsub());
}

// Shallow equality check for selector results
function shallowEqual<T>(a: T, b: T): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
    return false;
  }
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if ((a as Record<string, unknown>)[key] !== (b as Record<string, unknown>)[key]) {
      return false;
    }
  }
  return true;
}

/**
 * Combined store hook for components that need access to multiple stores
 * This maintains backwards compatibility while allowing gradual migration
 *
 * PERFORMANCE: Now uses useSyncExternalStore to only re-render when
 * the selected value actually changes. Previous implementation subscribed
 * to ALL stores unconditionally, causing massive re-render storms.
 *
 * NOTE: For new code, use individual stores directly:
 * - useProductionStore() for machines, flow, and metrics
 * - useUIStore() for UI state and alerts
 * - useGraphicsStore() for graphics settings
 * - useGameSimulationStore() for time, weather, and run windows
 * - useSafetyStore() for safety metrics and incidents
 * - useOperationsCampaignStore() for orders, incidents, and execution
 */
export function useMillStore<T>(selector: (state: CombinedStoreState) => T): T {
  // Cache the previous result to avoid unnecessary re-renders
  const cachedResultRef = useRef<T | undefined>(undefined);
  const selectorRef = useRef(selector);
  selectorRef.current = selector;

  // Create a stable getSnapshot that uses selector and shallow equality
  const getSnapshot = useCallback((): T => {
    const combinedState = getCombinedState();
    const newResult = selectorRef.current(combinedState);

    // Use shallow equality to prevent unnecessary re-renders
    if (cachedResultRef.current !== undefined && shallowEqual(cachedResultRef.current, newResult)) {
      return cachedResultRef.current;
    }

    cachedResultRef.current = newResult;
    return newResult;
  }, []);

  return useSyncExternalStore(subscribeToAllStores, getSnapshot, getSnapshot);
}

// Combined state type for backwards compatibility
export type CombinedStoreState = ReturnType<typeof useGraphicsStore.getState> &
  ReturnType<typeof useGameSimulationStore.getState> &
  ReturnType<typeof useProductionStore.getState> &
  ReturnType<typeof useSafetyStore.getState> &
  ReturnType<typeof useUIStore.getState>;

// Provide getState method for backwards compatibility
useMillStore.getState = (): CombinedStoreState => {
  // Always fresh: the combined-state cache is invalidated only by mounted hook
  // subscriptions, so reading it here could return a stale snapshot forever.
  return buildCombinedState();
};

/**
 * Provide subscribe method for backwards compatibility (primarily for SCADA sync)
 *
 * This implementation intelligently routes subscriptions to the appropriate store
 * based on which state properties are accessed in the selector.
 *
 * **IMPORTANT: Subscription Cleanup**
 *
 * This function creates 5 internal subscriptions (one per store). The returned
 * unsubscribe function MUST be called to prevent memory leaks.
 *
 * Example usage with manual cleanup:
 * ```typescript
 * // In a class or module:
 * const unsubscribe = useMillStore.subscribe(
 *   (state) => state.machines,
 *   (machines) => console.log('Machines changed:', machines)
 * );
 *
 * // On cleanup (e.g., component unmount, module unload):
 * unsubscribe();
 * ```
 *
 * Example usage in React (prefer individual store hooks instead):
 * ```typescript
 * useEffect(() => {
 *   const unsubscribe = useMillStore.subscribe(
 *     (state) => state.gameTime,
 *     (time) => externalSystem.updateTime(time)
 *   );
 *   return unsubscribe; // Cleanup on unmount
 * }, []);
 * ```
 *
 * **Performance Note**: For new code, prefer using individual store hooks
 * (useProductionStore, useGameSimulationStore, etc.) which provide automatic
 * cleanup and better performance through selective subscriptions.
 */
useMillStore.subscribe = <T>(
  selector: (state: CombinedStoreState) => T,
  callback: (value: T) => void,
  options?: { fireImmediately?: boolean }
) => {
  // Track the previous value to detect changes
  let previousValue = selector(buildCombinedState());

  // Create a wrapper callback that only fires when the selected value changes
  const wrappedCallback = () => {
    const newValue = selector(buildCombinedState());

    // PERFORMANCE FIX: Use shallow equality instead of expensive JSON.stringify
    // shallowEqual handles both primitives and objects efficiently
    const hasChanged = !shallowEqual(newValue, previousValue);

    if (hasChanged) {
      previousValue = newValue;
      callback(newValue);
    }
  };

  // Subscribe to all stores
  // Note: This is not optimal (subscribes to all stores), but maintains full backwards compatibility.
  // For new code, use the specific store subscriptions directly.
  const unsubscribers: Array<() => void> = [
    useGraphicsStore.subscribe(wrappedCallback),
    useGameSimulationStore.subscribe(wrappedCallback),
    useProductionStore.subscribe(wrappedCallback),
    useSafetyStore.subscribe(wrappedCallback),
    useUIStore.subscribe(wrappedCallback),
  ];

  // Fire immediately if requested
  if (options?.fireImmediately) {
    callback(previousValue);
  }

  // Return combined unsubscribe function
  // IMPORTANT: Callers MUST invoke this function to clean up all 5 subscriptions
  return () => {
    unsubscribers.forEach((unsub) => unsub());
  };
};
