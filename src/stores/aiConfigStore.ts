/**
 * AI Configuration Store for MillOS
 *
 * Manages AI mode settings, Gemini API key, connection state,
 * and live cost tracking for Gemini API usage.
 *
 * BAS Integration (Dec 2024):
 * - Subscribes to basStore for five axes values
 * - AI behavior adapts based on autonomy, transparency, and tone axes
 * - Proactivity scales with autonomy level (lower = more proactive AI)
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeJSONStorage } from './storage';
import { geminiClient } from '../utils/geminiClient';
import { logger } from '../utils/logger';
import type { StrategicPriority } from '../types';
import type { FiveAxes, SuggestionMode } from '../types/bas';
import { useBASStore } from './basStore';

export type AIMode = 'heuristic' | 'gemini' | 'hybrid';

// Gemini Flash pricing (per 1M tokens, as of Dec 2024)
// https://ai.google.dev/pricing
const GEMINI_FLASH_INPUT_COST_PER_1M = 0.075; // $0.075 per 1M input tokens
const GEMINI_FLASH_OUTPUT_COST_PER_1M = 0.3; // $0.30 per 1M output tokens
const CHARS_PER_TOKEN = 4; // Conservative estimate

// Strategic layer configuration
const DEFAULT_STRATEGIC_INTERVAL_MS = 45000; // 45 seconds

interface CostTracking {
  sessionCost: number; // Total cost this session in USD
  totalInputTokens: number; // Estimated input tokens
  totalOutputTokens: number; // Estimated output tokens
  requestCount: number; // Number of API calls
  lastRequestCost: number; // Cost of most recent request
  sessionStartTime: number; // When this session started
}

interface StrategicState {
  priorities: StrategicPriority[]; // Structured strategic priorities
  legacyPriorities: string[]; // Legacy string priorities for backward compat
  lastDecisionTime: number | null; // Timestamp of last strategic decision
  isThinking: boolean; // Strategic layer actively reasoning
  actionPlan?: string[]; // 3-step action plan (immediate, short-term, prep)
  insight?: string; // Key observation from Gemini
  tradeoff?: string; // Trade-off explanation
  focusMachine?: string; // Machine ID to prioritize
  recommendWorker?: string; // Recommended worker for critical tasks
  confidenceScores?: { overall: number; reasoning: string };
}

/**
 * BAS-derived AI behavior settings
 * These are computed from BAS axis values
 */
interface BASAIBehavior {
  /** Proactivity level (0-100): Higher = AI is more proactive */
  proactivity: number;
  /** Transparency level (0-100): Higher = AI explains more */
  transparency: number;
  /** Tone warmth (0-100): Higher = warmer, more supportive tone */
  toneWarmth: number;
  /** Suggestion mode derived from autonomy axis */
  suggestionMode: SuggestionMode;
  /** Maximum suggestions per hour (scales with autonomy) */
  maxSuggestionsPerHour: number;
  /** Whether AI should defer to democratic decisions */
  deferToDemocracy: boolean;
}

interface AIConfigState {
  // Mode settings
  aiMode: AIMode;
  setAIMode: (mode: AIMode) => void;

  // Gemini connection
  geminiApiKey: string | null;
  isGeminiConnected: boolean;
  connectionError: string | null;

  // Strategic layer state
  strategic: StrategicState;
  strategicIntervalMs: number;
  setStrategicPriorities: (priorities: string[]) => void;
  setStrategicThinking: (thinking: boolean) => void;
  // Tactical layer state
  isTacticalThinking: boolean;
  setTacticalThinking: (thinking: boolean) => void;
  // System performance metrics (shared between background loop and UI)
  systemStatus: {
    cpu: number;
    memory: number;
    decisions: number;
    successRate: number;
  };
  updateSystemStatus: (status: Partial<AIConfigState['systemStatus']>) => void;
  // New structured priority management
  addStrategicPriority: (priority: Omit<StrategicPriority, 'id' | 'createdAt'>) => void;
  removeExpiredPriorities: () => void;
  getActiveWeight: (machineId: string) => number;

  // Cost tracking
  costTracking: CostTracking;
  recordApiUsage: (inputChars: number, outputChars: number) => void;
  resetSessionCosts: () => void;
  getFormattedCost: () => string;
  trackAPICost: (cost: number, tokens: number) => void;

  // Actions
  setGeminiApiKey: (key: string | null) => Promise<boolean>;
  testGeminiConnection: () => Promise<{ success: boolean; message: string }>;
  clearGeminiConfig: () => void;
  initializeFromStorage: () => void;

  // AI Visualization toggles (all default OFF)
  showCascadeVisualization: boolean;
  showProductionTarget: boolean;
  showStrategicOverlay: boolean;
  showVCLDebug: boolean;
  showEnergyDashboard: boolean;
  showMultiObjective: boolean;
  showCostOverlay: boolean;
  showShiftHandover: boolean;
  setShowCascadeVisualization: (show: boolean) => void;
  setShowProductionTarget: (show: boolean) => void;
  setShowStrategicOverlay: (show: boolean) => void;
  setShowVCLDebug: (show: boolean) => void;
  setShowEnergyDashboard: (show: boolean) => void;
  setShowMultiObjective: (show: boolean) => void;
  setShowCostOverlay: (show: boolean) => void;
  setShowShiftHandover: (show: boolean) => void;

  // Bilateral Alignment: Management Style
  // 0 = Strict (50% grant rate), 50 = Balanced (75%), 100 = Generous (95%)
  managementGenerosity: number;
  setManagementGenerosity: (value: number) => void;
  getGrantRate: () => number; // Calculated grant rate based on generosity

  // =============================================================================
  // BAS INTEGRATION: AI behavior derived from Five Axes
  // =============================================================================

  /** Current BAS axes (synced from basStore) */
  basAxes: FiveAxes;

  /** Update BAS axes (called by subscription) */
  syncBASAxes: (axes: FiveAxes) => void;

  /** Get computed AI behavior based on BAS axes */
  getBASAIBehavior: () => BASAIBehavior;

  /** Check if AI should be more passive based on autonomy level */
  shouldDeferToWorkers: () => boolean;

  /** Get proactive suggestion interval in ms (longer = less frequent) */
  getSuggestionIntervalMs: () => number;
}

/**
 * Calculate AI behavior from BAS axes
 */
function computeBASBehavior(axes: FiveAxes): BASAIBehavior {
  // Proactivity is INVERSE of autonomy - low autonomy means AI is more proactive
  const proactivity = 100 - axes.autonomyLevel;

  // Transparency directly maps from information access
  const transparency = axes.informationAccess;

  // Tone warmth derived from evaluation direction (worker-friendly = warmer)
  // and collective orientation (team focus = warmer)
  const toneWarmth = (axes.evaluationDirection + axes.collectiveOrientation) / 2;

  // Suggestion mode based on autonomy level
  let suggestionMode: SuggestionMode;
  if (axes.autonomyLevel < 25) {
    suggestionMode = 'directive';
  } else if (axes.autonomyLevel < 50) {
    suggestionMode = 'suggestive';
  } else if (axes.autonomyLevel < 75) {
    suggestionMode = 'available';
  } else {
    suggestionMode = 'silent';
  }

  // Max suggestions scale inversely with autonomy
  // Low autonomy (0) = 20/hour, High autonomy (100) = 2/hour
  const maxSuggestionsPerHour = Math.max(2, Math.round(20 - (axes.autonomyLevel / 100) * 18));

  // Defer to democracy when decision mode is > 66%
  const deferToDemocracy = axes.decisionMode > 66;

  return {
    proactivity,
    transparency,
    toneWarmth,
    suggestionMode,
    maxSuggestionsPerHour,
    deferToDemocracy,
  };
}

export const useAIConfigStore = create<AIConfigState>()(
  persist(
    (set, get) => ({
      // Default to heuristic mode
      aiMode: 'heuristic',
      setAIMode: (mode) => {
        set({ aiMode: mode });
        logger.info(`[AIConfigStore] AI mode set to: ${mode}`);
      },

      // Gemini state
      geminiApiKey: null,
      isGeminiConnected: false,
      connectionError: null,

      // Strategic layer state
      strategic: {
        priorities: [],
        legacyPriorities: [],
        lastDecisionTime: null,
        isThinking: false,
      },
      strategicIntervalMs: DEFAULT_STRATEGIC_INTERVAL_MS,

      setStrategicPriorities: (priorities: string[]) => {
        set((state) => ({
          strategic: {
            ...state.strategic,
            legacyPriorities: priorities,
            lastDecisionTime: Date.now(),
          },
        }));
      },

      setStrategicThinking: (isThinking: boolean) => {
        set((state) => ({
          strategic: {
            ...state.strategic,
            isThinking,
          },
        }));
      },

      // Tactical state
      isTacticalThinking: false,
      setTacticalThinking: (isThinking: boolean) => set({ isTacticalThinking: isThinking }),

      // System status
      systemStatus: {
        cpu: 15,
        memory: 35,
        decisions: 0,
        successRate: 0,
      },
      updateSystemStatus: (status) =>
        set((state) => ({
          systemStatus: { ...state.systemStatus, ...status },
        })),

      // Add a new structured strategic priority
      addStrategicPriority: (priority: Omit<StrategicPriority, 'id' | 'createdAt'>) => {
        const newPriority: StrategicPriority = {
          ...priority,
          id: `sp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          createdAt: Date.now(),
        };
        set((state) => ({
          strategic: {
            ...state.strategic,
            priorities: [...state.strategic.priorities, newPriority],
            lastDecisionTime: Date.now(),
          },
        }));
        logger.info(
          `[AIConfigStore] Added strategic priority: ${priority.priority} (weight: ${priority.weight})`
        );
      },

      // Remove expired priorities (called periodically by tactical layer)
      removeExpiredPriorities: () => {
        const now = Date.now();
        set((state) => {
          const activePriorities = state.strategic.priorities.filter((p) => p.expiresAt > now);
          if (activePriorities.length !== state.strategic.priorities.length) {
            logger.info(
              `[AIConfigStore] Removed ${state.strategic.priorities.length - activePriorities.length} expired priorities`
            );
          }
          return {
            strategic: {
              ...state.strategic,
              priorities: activePriorities,
            },
          };
        });
      },

      // Calculate total active weight for a machine (used by tactical scoring)
      getActiveWeight: (machineId: string): number => {
        const now = Date.now();
        const state = get();
        let totalWeight = 0;

        for (const p of state.strategic.priorities) {
          if (p.expiresAt <= now) continue; // Skip expired

          // Direct machine affinity match
          if (p.machineAffinities.includes(machineId)) {
            totalWeight += p.weight * 12; // 12/24/36/48/60 based on weight
          }

          // Fuzzy match for machine types (e.g., 'silo' matches 'silo-alpha')
          const machineType = machineId.split('-')[0].toLowerCase();
          if (p.machineAffinities.some((a) => a.toLowerCase().includes(machineType))) {
            totalWeight += p.weight * 6; // Lower bonus for type match
          }
        }

        return Math.min(totalWeight, 100); // Cap at 100
      },

      // AI Visualization toggles - all default OFF
      showCascadeVisualization: false,
      showProductionTarget: false,
      showStrategicOverlay: false,
      showVCLDebug: true,
      showEnergyDashboard: false,
      showMultiObjective: false,
      showCostOverlay: false,
      showShiftHandover: true,

      setShowCascadeVisualization: (show: boolean) => set({ showCascadeVisualization: show }),
      setShowProductionTarget: (show: boolean) => set({ showProductionTarget: show }),
      setShowStrategicOverlay: (show: boolean) => set({ showStrategicOverlay: show }),
      setShowVCLDebug: (show: boolean) => set({ showVCLDebug: show }),
      setShowEnergyDashboard: (show: boolean) => set({ showEnergyDashboard: show }),
      setShowMultiObjective: (show: boolean) => set({ showMultiObjective: show }),
      setShowCostOverlay: (show: boolean) => set({ showCostOverlay: show }),
      setShowShiftHandover: (show: boolean) => set({ showShiftHandover: show }),

      // Bilateral Alignment: Management Generosity (default: 75 = Kind/Balanced)
      managementGenerosity: 75,
      setManagementGenerosity: (value: number) => {
        const clamped = Math.max(0, Math.min(100, value));
        set({ managementGenerosity: clamped });
        logger.info(`[AIConfigStore] Management generosity set to: ${clamped}%`);
      },
      getGrantRate: () => {
        const generosity = get().managementGenerosity;
        // 0% generosity = 50% grant rate (strict but not cruel)
        // 50% generosity = 75% grant rate (balanced)
        // 100% generosity = 95% grant rate (very kind)
        return 0.5 + (generosity / 100) * 0.45;
      },

      // =============================================================================
      // BAS INTEGRATION
      // =============================================================================

      // Default BAS axes (will be synced from basStore)
      basAxes: {
        autonomyLevel: 60,
        decisionMode: 50,
        informationAccess: 80,
        evaluationDirection: 50,
        collectiveOrientation: 40,
      },

      syncBASAxes: (axes: FiveAxes) => {
        set({ basAxes: axes });
        logger.info(
          `[AIConfigStore] BAS axes synced - Autonomy: ${axes.autonomyLevel}%, Decision: ${axes.decisionMode}%`
        );
      },

      getBASAIBehavior: () => {
        return computeBASBehavior(get().basAxes);
      },

      shouldDeferToWorkers: () => {
        const axes = get().basAxes;
        // Defer when autonomy > 60% or decision mode > 50%
        return axes.autonomyLevel > 60 || axes.decisionMode > 50;
      },

      getSuggestionIntervalMs: () => {
        const behavior = get().getBASAIBehavior();
        // Base interval: 30 seconds
        // Low proactivity (high autonomy) = 5 minute intervals
        // High proactivity (low autonomy) = 15 second intervals
        const minInterval = 15000; // 15 seconds
        const maxInterval = 300000; // 5 minutes
        const proactivityFactor = behavior.proactivity / 100;
        // Higher proactivity = shorter interval
        return Math.round(maxInterval - proactivityFactor * (maxInterval - minInterval));
      },

      // Cost tracking - session state
      costTracking: {
        sessionCost: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        requestCount: 0,
        lastRequestCost: 0,
        sessionStartTime: Date.now(),
      },

      // Record API usage and calculate cost
      recordApiUsage: (inputChars: number, outputChars: number) => {
        const inputTokens = Math.ceil(inputChars / CHARS_PER_TOKEN);
        const outputTokens = Math.ceil(outputChars / CHARS_PER_TOKEN);

        // Calculate cost in USD
        const inputCost = (inputTokens / 1_000_000) * GEMINI_FLASH_INPUT_COST_PER_1M;
        const outputCost = (outputTokens / 1_000_000) * GEMINI_FLASH_OUTPUT_COST_PER_1M;
        const requestCost = inputCost + outputCost;

        set((state) => ({
          costTracking: {
            ...state.costTracking,
            sessionCost: state.costTracking.sessionCost + requestCost,
            totalInputTokens: state.costTracking.totalInputTokens + inputTokens,
            totalOutputTokens: state.costTracking.totalOutputTokens + outputTokens,
            requestCount: state.costTracking.requestCount + 1,
            lastRequestCost: requestCost,
          },
        }));

        logger.info(
          `[AIConfigStore] API usage: ${inputTokens} in / ${outputTokens} out tokens, cost: $${requestCost.toFixed(6)}`
        );
      },

      // Reset session costs
      resetSessionCosts: () => {
        set({
          costTracking: {
            sessionCost: 0,
            totalInputTokens: 0,
            totalOutputTokens: 0,
            requestCount: 0,
            lastRequestCost: 0,
            sessionStartTime: Date.now(),
          },
        });
        logger.info('[AIConfigStore] Session costs reset');
      },

      // Get formatted cost string
      getFormattedCost: () => {
        const { sessionCost, requestCount } = get().costTracking;
        if (requestCount === 0) return '$0.00';
        if (sessionCost < 0.01) return `$${sessionCost.toFixed(4)}`;
        return `$${sessionCost.toFixed(2)}`;
      },

      // Track API cost directly (for geminiApi.ts)
      trackAPICost: (cost: number, tokens: number) => {
        set((state) => ({
          costTracking: {
            ...state.costTracking,
            sessionCost: state.costTracking.sessionCost + cost,
            totalInputTokens: state.costTracking.totalInputTokens + Math.floor(tokens * 0.7),
            totalOutputTokens: state.costTracking.totalOutputTokens + Math.floor(tokens * 0.3),
            requestCount: state.costTracking.requestCount + 1,
            lastRequestCost: cost,
          },
        }));
        logger.info(`[AIConfigStore] API cost tracked: $${cost.toFixed(4)}, ${tokens} tokens`);
      },

      // Set and validate API key
      setGeminiApiKey: async (key) => {
        if (!key) {
          get().clearGeminiConfig();
          return false;
        }

        set({ connectionError: null });

        const success = geminiClient.initialize(key);
        if (!success) {
          set({
            connectionError: 'Failed to initialize Gemini client',
            isGeminiConnected: false,
          });
          return false;
        }

        // Test the connection
        const testResult = await geminiClient.testConnection();
        if (!testResult.success) {
          set({
            connectionError: testResult.message,
            isGeminiConnected: false,
          });
          geminiClient.disconnect();
          return false;
        }

        set({
          geminiApiKey: key,
          isGeminiConnected: true,
          aiMode: 'hybrid', // Auto-switch to Hybrid mode (heuristic + strategic) on connect
          connectionError: null,
        });

        logger.info('[AIConfigStore] Gemini API key set and validated');
        return true;
      },

      // Test connection without saving key
      testGeminiConnection: async () => {
        const key = get().geminiApiKey;
        if (!key) {
          return { success: false, message: 'No API key configured' };
        }

        return geminiClient.testConnection();
      },

      // Clear all Gemini config
      clearGeminiConfig: () => {
        geminiClient.disconnect();
        set({
          geminiApiKey: null,
          isGeminiConnected: false,
          aiMode: 'heuristic',
          connectionError: null,
        });
        logger.info('[AIConfigStore] Gemini config cleared');
      },

      // Re-initialize client from stored key (call on app startup)
      initializeFromStorage: () => {
        const key = get().geminiApiKey;
        if (key) {
          const success = geminiClient.initialize(key);
          if (success) {
            set({ isGeminiConnected: true });
            logger.info('[AIConfigStore] Gemini client re-initialized from storage');
          } else {
            set({ isGeminiConnected: false, aiMode: 'heuristic' });
          }
        }
      },
    }),
    {
      name: 'millos-ai-config',
      storage: safeJSONStorage,
      partialize: (state) => ({
        // Only persist these fields
        aiMode: state.aiMode,
        geminiApiKey: state.geminiApiKey,
        managementGenerosity: state.managementGenerosity,
      }),
    }
  )
);

// =============================================================================
// BAS SUBSCRIPTION SETUP
// Subscribe to basStore changes and sync axes to aiConfigStore
// =============================================================================

// Lazy import to avoid circular dependency
let basStoreSubscribed = false;
let basStoreUnsubscribe: (() => void) | null = null;

export function initBASSubscription(): void {
  if (basStoreSubscribed) return;

  // Initial sync
  const axes = useBASStore.getState().axes;
  useAIConfigStore.getState().syncBASAxes(axes);

  // Subscribe to future changes (track previous axes for comparison)
  let prevAxes = JSON.stringify(useBASStore.getState().axes);
  basStoreUnsubscribe = useBASStore.subscribe((state) => {
    const newAxes = JSON.stringify(state.axes);
    if (newAxes !== prevAxes) {
      prevAxes = newAxes;
      useAIConfigStore.getState().syncBASAxes(state.axes);
    }
  });

  basStoreSubscribed = true;
  logger.info('[AIConfigStore] BAS subscription initialized');
}

/** Cleanup function for testing and HMR - unsubscribes from BAS store */
export function cleanupAIConfigBASSubscription(): void {
  if (basStoreUnsubscribe) {
    basStoreUnsubscribe();
    basStoreUnsubscribe = null;
  }
  basStoreSubscribed = false;
}

// Initialize on module load (will run after rehydration)
if (typeof window !== 'undefined') {
  // Small delay to ensure rehydration completes
  setTimeout(() => {
    useAIConfigStore.getState().initializeFromStorage();
    // Initialize BAS subscription after stores are ready
    initBASSubscription();
  }, 100);
}
