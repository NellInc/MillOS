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
import {
  webgpuClient,
  WebGPUClient,
  checkWebGPUAdapter,
  DEFAULT_WEBGPU_MODEL_ID,
} from '../utils/webgpuClient';
import { logger } from '../utils/logger';
import type { StrategicPriority } from '../types';
import type { FiveAxes, SuggestionMode } from '../types/bas';
import { useBASStore } from './basStore';

export type AIMode = 'heuristic' | 'gemini' | 'hybrid';

/** Which LLM backend powers the strategic layer (orthogonal to AIMode). */
export type LLMBackend = 'gemini' | 'webgpu';

/** Lifecycle status of the local WebGPU neural core. */
export type WebGPUStatus =
  | 'idle'
  | 'checking'
  | 'unsupported'
  | 'loading'
  | 'compiling'
  | 'ready'
  | 'error';

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

  // LLM backend selection (Gemini API vs local WebGPU neural core)
  llmBackend: LLMBackend;
  setLLMBackend: (backend: LLMBackend) => void;

  // Local WebGPU neural core state
  webgpuStatus: WebGPUStatus;
  webgpuProgress: number; // 0..1 download/compile progress
  webgpuMessage: string; // human-readable status line
  webgpuError: string | null;
  webgpuModelReady: boolean; // engine loaded & serving inference
  webgpuModelId: string;
  webgpuAdapterWarning: string | null; // advisory OOM/perf warning from adapter probe
  /** Load the local model. `promote` (default true) mirrors the Gemini
   *  connect-time switch to Hybrid; the silent startup prewarm passes false so
   *  it never overrides a returning operator's persisted aiMode. */
  loadWebGPUModel: (promote?: boolean) => Promise<boolean>;
  cancelWebGPUModelLoad: () => void;
  unloadWebGPUModel: () => Promise<void>;
  deleteWebGPUCache: () => Promise<void>;

  /** True when the active LLM backend is ready to serve strategic decisions. */
  isLLMReady: () => boolean;

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

// Transient (non-reactive, non-persisted) flag coordinating an in-flight model
// load with a cancellation request. Module-scoped so it survives across the
// loadWebGPUModel/cancelWebGPUModelLoad closures without polluting store state.
let webgpuCancelRequested = false;

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

      // LLM backend selection — default to Gemini API (existing behavior).
      llmBackend: 'gemini',
      setLLMBackend: (backend: LLMBackend) => {
        set({ llmBackend: backend });
        logger.info(`[AIConfigStore] LLM backend set to: ${backend}`);
        // Auto-download/load the local model the moment the operator picks it
        // (idempotent — loadWebGPUModel() no-ops if already loading or ready).
        if (backend === 'webgpu') {
          void get().loadWebGPUModel();
        } else {
          // Switched to a cloud backend — free the local model's GPU memory so
          // it stops competing with the 3D scene. Weights stay browser-cached,
          // so switching back re-loads from cache (no re-download).
          const s = get();
          if (
            s.webgpuStatus === 'checking' ||
            s.webgpuStatus === 'loading' ||
            s.webgpuStatus === 'compiling'
          ) {
            s.cancelWebGPUModelLoad();
          } else if (s.webgpuModelReady) {
            void s.unloadWebGPUModel();
          }
        }
      },

      // Local WebGPU neural core — starts idle; the engine is memory-only and
      // must be (re)loaded each session even though weights are browser-cached.
      webgpuStatus: 'idle',
      webgpuProgress: 0,
      webgpuMessage: '',
      webgpuError: null,
      webgpuModelReady: false,
      webgpuModelId: DEFAULT_WEBGPU_MODEL_ID,
      webgpuAdapterWarning: null,

      loadWebGPUModel: async (promote: boolean = true): Promise<boolean> => {
        // Idempotent: skip if already online or a load is already in flight, so
        // the auto-triggers (backend select + startup prewarm) and a manual
        // click can't stack duplicate downloads.
        const current = get();
        if (current.webgpuModelReady) {
          return true;
        }
        if (
          current.webgpuStatus === 'checking' ||
          current.webgpuStatus === 'loading' ||
          current.webgpuStatus === 'compiling'
        ) {
          return false;
        }

        set({
          webgpuStatus: 'checking',
          webgpuError: null,
          webgpuProgress: 0,
          webgpuMessage: 'Checking WebGPU compatibility...',
        });

        const report = await checkWebGPUAdapter();
        if (!report.supported) {
          set({
            webgpuStatus: 'unsupported',
            webgpuModelReady: false,
            webgpuError:
              report.warning ??
              'WebGPU is unavailable in this browser. Use a WebGPU-capable browser or the Gemini API backend.',
          });
          logger.warn('[AIConfigStore] WebGPU unsupported:', report.warning);
          return false;
        }

        webgpuCancelRequested = false;
        set({
          webgpuAdapterWarning: report.warning ?? null,
          webgpuStatus: 'loading',
          webgpuProgress: 0,
          webgpuMessage: 'Initializing model download...',
        });

        const ok = await webgpuClient.load((p) => {
          if (webgpuCancelRequested) return; // stop reflecting progress once cancelled
          const lower = p.text.toLowerCase();
          const status: WebGPUStatus =
            lower.includes('compil') || lower.includes('shader') ? 'compiling' : 'loading';
          set({ webgpuStatus: status, webgpuProgress: p.progress, webgpuMessage: p.text });
        });

        // Cancellation wins over the load result (which resolves false on cancel).
        if (webgpuCancelRequested) {
          webgpuCancelRequested = false;
          set({
            webgpuStatus: 'idle',
            webgpuModelReady: false,
            webgpuProgress: 0,
            webgpuMessage: '',
            webgpuError: null,
          });
          return false;
        }

        if (ok) {
          set((state) => ({
            webgpuStatus: 'ready',
            webgpuModelReady: true,
            webgpuProgress: 1,
            webgpuMessage: 'Local neural core online',
            webgpuError: null,
            // Mirror the Gemini auto-switch: a fresh local core lights up the
            // strategic layer via Hybrid mode (keeps fast heuristic tactical).
            // Promote from BOTH heuristic and gemini — pure 'gemini' (LLM-only)
            // would leave tactical AND strategic gated off (a silent dead state),
            // so only an already-'hybrid' mode is left untouched. Skipped on the
            // silent startup prewarm (promote=false) to respect persisted aiMode.
            aiMode: promote && state.aiMode !== 'hybrid' ? 'hybrid' : state.aiMode,
          }));
          logger.info('[AIConfigStore] WebGPU model ready');
          return true;
        }

        set({
          webgpuStatus: 'error',
          webgpuModelReady: false,
          webgpuError: 'The model could not be loaded. Try again or use the Gemini API backend.',
        });
        return false;
      },

      cancelWebGPUModelLoad: (): void => {
        // Best-effort: web-llm cannot abort an in-flight fetch, so the current
        // request may still complete in the background, but the engine is freed
        // on completion and the UI returns to idle immediately.
        webgpuCancelRequested = true;
        webgpuClient.cancelLoad();
        set({
          webgpuStatus: 'idle',
          webgpuProgress: 0,
          webgpuMessage: '',
          webgpuError: null,
        });
        logger.info('[AIConfigStore] WebGPU model load cancelled');
      },

      unloadWebGPUModel: async (): Promise<void> => {
        await webgpuClient.disconnect();
        set({
          webgpuModelReady: false,
          webgpuStatus: 'idle',
          webgpuProgress: 0,
          webgpuMessage: '',
          webgpuError: null,
        });
        logger.info('[AIConfigStore] WebGPU model unloaded');
      },

      deleteWebGPUCache: async (): Promise<void> => {
        await webgpuClient.disconnect();
        try {
          await WebGPUClient.deleteModelCache(get().webgpuModelId);
        } catch (error) {
          logger.warn('[AIConfigStore] Failed to delete WebGPU model cache:', error);
        }
        set({
          webgpuModelReady: false,
          webgpuStatus: 'idle',
          webgpuProgress: 0,
          webgpuMessage: '',
          webgpuError: null,
        });
        logger.info('[AIConfigStore] WebGPU model cache deleted');
      },

      isLLMReady: (): boolean => {
        const state = get();
        return (
          (state.llmBackend === 'gemini' && state.isGeminiConnected) ||
          (state.llmBackend === 'webgpu' && state.webgpuModelReady)
        );
      },

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
        // Persist the chosen backend; webgpuModelReady is intentionally NOT
        // persisted (the engine is memory-only and must be reloaded each session).
        llmBackend: state.llmBackend,
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

  // Subscribe to future changes. basStore replaces the axes object on every
  // mutation (setAxis/applyPreset/resetToDefaults all spread into a fresh
  // object, never mutate in place), so an O(1) reference check is sufficient
  // and avoids a per-callback JSON.stringify on unrelated BAS mutations.
  basStoreUnsubscribe = useBASStore.subscribe((state, prevState) => {
    if (state.axes !== prevState.axes) {
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

  // Prewarm the local model if the operator left the backend on WebGPU.
  // Deferred so the heavy 3D scene boots first; idempotent + fire-and-forget.
  // After the one-time download the weights are browser-cached, so this is a
  // fast cache load on subsequent sessions (the "download automatically" path).
  setTimeout(() => {
    if (useAIConfigStore.getState().llmBackend === 'webgpu') {
      // promote=false: a silent reload must not override the persisted aiMode.
      void useAIConfigStore.getState().loadWebGPUModel(false);
    }
  }, 2500);
}
