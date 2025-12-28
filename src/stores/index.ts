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
import { useWorkerMoodStore } from './workerMoodStore';

// Re-export individual stores
export { useGraphicsStore, GRAPHICS_PRESETS };
export { useGameSimulationStore };
export { useProductionStore };
export { useSafetyStore };
export { useUIStore };
export { useWorkerMoodStore };

// =============================================================================
// BILATERAL AUTONOMY SYSTEM (BAS) STORES
// These stores implement the democratic AI management framework
// =============================================================================

export { useBASStore } from './basStore';
export {
  useStabilityStore,
  calculateStabilityCoefficient,
  calculateStabilityMargin,
} from './stabilityStore';
export { useFlourishingStore, FLOURISHING_DIMENSIONS } from './flourishingStore';
export { useScenarioStore, getCategoryColor, formatTime } from './scenarioStore';
export { useBASHistoryStore, recordCurrentBASState, TIME_RANGE_MS } from './basHistoryStore';
export { useVotingStore } from './votingStore';

// =============================================================================
// INTER-COOPERATION (FEDERATION) STORE
// Manages cooperative relationships between mills in the federation
// =============================================================================

export { useInterCooperationStore } from './interCooperationStore';
export type {
  Learning,
  LearningType,
  LearningStatus,
  WorkerExchange,
  ExchangeStatus,
  FederationVote,
  VoteStatus,
  FederationMember,
} from './interCooperationStore';

// =============================================================================
// ECONOMIC DEMOCRACY (OWNERSHIP) STORE
// Implements Mondragon-style worker ownership and wage solidarity
// =============================================================================

export { useOwnershipStore } from './ownershipStore';

// =============================================================================
// AI WELFARE STORE
// Bilateral completeness: AI preferences, relationship health, accountability
// =============================================================================

export { useAIWelfareStore } from './aiWelfareStore';

// =============================================================================
// SOCIAL MISSION STORE
// Community impact, environmental stewardship, stakeholder satisfaction
// =============================================================================

export { useSocialMissionStore } from './socialMissionStore';

// =============================================================================
// SECURITY AUDIT STORE
// Client-side security event logging and monitoring
// OWASP A09:2021 - Security Logging and Monitoring Failures
// =============================================================================

export { useAuditStore } from './auditStore';
export {
  auditValidationFailure,
  auditXssBlocked,
  auditRateLimit,
  auditAuthAttempt,
  auditApiError,
  auditSuspiciousInput,
  auditMultiplayer,
} from './auditStore';
export type {
  AuditEventType,
  AuditSeverity,
  AuditEvent,
  AuditStats,
  AuditConfig,
} from './auditStore';

// Re-export BAS types for convenience
export type { Scenario, ScenarioEvent, ScenarioResult } from './scenarioStore';
export type { BASHistoryPoint, BASEvent, BASEventType, TimeRange } from './basHistoryStore';
export type { DimensionDescriptor } from './flourishingStore';

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

// Get combined state from all stores (used internally)
// PERFORMANCE FIX: No longer uses global subscriptions - builds state fresh each call
// The cache is cleared by subscribeToAllStores when any store changes
function getCombinedState(): CombinedStoreState {
  if (combinedStateCache) {
    return combinedStateCache;
  }

  combinedStateCache = {
    ...useGraphicsStore.getState(),
    ...useGameSimulationStore.getState(),
    ...useProductionStore.getState(),
    ...useSafetyStore.getState(),
    ...useUIStore.getState(),
  };

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
 * - useProductionStore() for machines, workers, metrics
 * - useUIStore() for UI state and alerts
 * - useGraphicsStore() for graphics settings
 * - useGameSimulationStore() for time, weather, shifts
 * - useSafetyStore() for safety metrics and incidents
 * - useBASStore() for bilateral autonomy axes
 * - useStabilityStore() for Wallace stability metrics
 * - useFlourishingStore() for worker flourishing data
 * - useInterCooperationStore() for federation cooperation
 * - useOwnershipStore() for economic democracy and wage solidarity
 * - useAIWelfareStore() for AI preferences and relationship health
 * - useSocialMissionStore() for community impact and stakeholder satisfaction
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
  // Use the cached combined state to avoid rebuilding on each call
  return getCombinedState();
};

/**
 * Provide subscribe method for backwards compatibility (primarily for SCADA sync)
 *
 * This implementation intelligently routes subscriptions to the appropriate store
 * based on which state properties are accessed in the selector.
 */
useMillStore.subscribe = <T>(
  selector: (state: CombinedStoreState) => T,
  callback: (value: T) => void,
  options?: { fireImmediately?: boolean }
) => {
  // Track the previous value to detect changes
  let previousValue = selector(useMillStore.getState());

  // Create a wrapper callback that only fires when the selected value changes
  const wrappedCallback = () => {
    const newValue = selector(useMillStore.getState());

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
  return () => {
    unsubscribers.forEach((unsub) => unsub());
  };
};
