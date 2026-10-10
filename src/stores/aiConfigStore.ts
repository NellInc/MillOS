/**
 * AI Configuration Store for MillOS
 *
 * Manages AI mode settings, in-memory BYOK connection state, and usage tracking.
 *
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeJSONStorage } from './storage';
import { cloudAIClient, type CloudBackend } from '../utils/cloudAIClient';
import {
  webgpuClient,
  WebGPUClient,
  checkWebGPUAdapter,
  DEFAULT_WEBGPU_MODEL_ID,
} from '../utils/webgpuClient';
import { logger } from '../utils/logger';
import type { StrategicPriority } from '../types';

// `gemini` is the persisted legacy ID for strategic-only mode, not a provider.
export type AIMode = 'heuristic' | 'gemini' | 'hybrid';

/** Which LLM backend powers the strategic layer (orthogonal to AIMode). */
export type LLMBackend = CloudBackend | 'webgpu';

/** Lifecycle status of the local WebGPU neural core. */
export type WebGPUStatus =
  | 'idle'
  | 'checking'
  | 'unsupported'
  | 'loading'
  | 'compiling'
  | 'ready'
  | 'error';

// Standard direct-API rates for short text requests, checked 10 October 2026.
// Both selected models currently share this rate. Usage comes from provider
// responses, including reasoning tokens; provider invoices remain authoritative.
const STANDARD_COST_PER_1M = { input: 0.1, output: 0.5 };

/**
 * Per-1M-token standard pricing for the selected cloud model. This is an
 * estimate, not a provider invoice.
 */
export function getActiveCloudPricing(): { model: string; input: number; output: number } {
  const backend = useAIConfigStore.getState().llmBackend;
  const model =
    backend === 'haiku' ? 'claude-haiku-5-5' : backend === 'luna' ? 'gpt-6-luna' : 'On-device';
  return { model, ...STANDARD_COST_PER_1M };
}

// Strategic layer configuration
const DEFAULT_STRATEGIC_INTERVAL_MS = 45000; // 45 seconds

interface CostTracking {
  sessionCost: number; // Estimated strategic-request cost this session in USD; key tests excluded
  totalInputTokens: number; // Provider-reported input tokens
  totalOutputTokens: number; // Provider-reported output tokens, including reasoning
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
  insight?: string; // Key observation from the strategic model
  tradeoff?: string; // Trade-off explanation
  focusMachine?: string; // Machine ID to prioritize
  confidenceScores?: { overall: number; reasoning: string };
}

/** Optional detail the strategic layer attaches to a set of priorities. */
export interface StrategicPlanDetails {
  actionPlan?: string[];
  insight?: string;
  tradeoff?: string;
  focusMachine?: string;
}

interface AIConfigState {
  // Mode settings
  aiMode: AIMode;
  setAIMode: (mode: AIMode) => void;

  // API keys live only in cloudAIClient module memory. These flags drive UI.
  connectedProviders: Record<CloudBackend, boolean>;
  connectionEpoch: number;
  connectionError: string | null;

  // One strategic backend at a time, with on-device WebGPU preserved.
  llmBackend: LLMBackend;
  setLLMBackend: (backend: LLMBackend) => void;

  // Local WebGPU neural core state
  webgpuStatus: WebGPUStatus;
  webgpuProgress: number; // 0..1 download/compile progress
  webgpuMessage: string; // display status line
  webgpuError: string | null;
  webgpuModelReady: boolean; // engine loaded & serving inference
  webgpuModelId: string;
  webgpuAdapterWarning: string | null; // advisory OOM/perf warning from adapter probe
  /** Load the local model. `promote` (default true) mirrors cloud
   *  connect-time switch to Hybrid; the silent startup prewarm passes false so
   *  it never overrides a persisted aiMode. */
  loadWebGPUModel: (promote?: boolean) => Promise<boolean>;
  cancelWebGPUModelLoad: () => void;
  unloadWebGPUModel: () => Promise<void>;
  deleteWebGPUCache: () => Promise<void>;

  /** True when the active LLM backend is ready to serve strategic decisions. */
  isLLMReady: () => boolean;

  // Strategic layer state
  strategic: StrategicState;
  strategicIntervalMs: number;
  /** Record a strategic plan. Every detail field is replaced, so a new plan
   *  clears whatever the previous one said. */
  setStrategicPriorities: (priorities: string[], details?: StrategicPlanDetails) => void;
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
  recordApiUsage: (inputTokens: number, outputTokens: number) => void;
  resetSessionCosts: () => void;
  getFormattedCost: () => string;
  trackAPICost: (cost: number, tokens: number) => void;

  // Actions
  setCloudApiKey: (backend: CloudBackend, key: string) => Promise<boolean>;
  clearCloudApiKey: (backend: CloudBackend) => void;

  // AI Visualization toggles (all default OFF)
  showCascadeVisualization: boolean;
  showProductionTarget: boolean;
  showStrategicOverlay: boolean;
  showVCLDebug: boolean;
  showEnergyDashboard: boolean;
  showMultiObjective: boolean;
  showCostOverlay: boolean;
  setShowCascadeVisualization: (show: boolean) => void;
  setShowProductionTarget: (show: boolean) => void;
  setShowStrategicOverlay: (show: boolean) => void;
  setShowVCLDebug: (show: boolean) => void;
  setShowEnergyDashboard: (show: boolean) => void;
  setShowMultiObjective: (show: boolean) => void;
  setShowCostOverlay: (show: boolean) => void;
}

// Transient (non-reactive, non-persisted) flag coordinating an in-flight model
// load with a cancellation request. Module-scoped so it survives across the
// loadWebGPUModel/cancelWebGPUModelLoad closures without polluting store state.
let webgpuCancelRequested = false;
let cloudKeyAttempt = 0;

export const useAIConfigStore = create<AIConfigState>()(
  persist(
    (set, get) => ({
      // Default to heuristic mode
      aiMode: 'heuristic',
      setAIMode: (mode) => {
        set({ aiMode: mode });
        logger.info(`[AIConfigStore] AI mode set to: ${mode}`);
      },

      // Connected means validated during this page session; no key is persisted.
      connectedProviders: { haiku: false, luna: false },
      connectionEpoch: 0,
      connectionError: null,

      llmBackend: 'haiku',
      setLLMBackend: (backend: LLMBackend) => {
        cloudKeyAttempt += 1;
        cloudAIClient.cancelRequests();
        set((state) => ({
          llmBackend: backend,
          connectionEpoch: state.connectionEpoch + 1,
          connectionError: null,
        }));
        logger.info(`[AIConfigStore] LLM backend set to: ${backend}`);
        // Auto-download/load the local model the moment the controller selects it
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
              'WebGPU is unavailable in this browser. Use a WebGPU-capable browser or a cloud BYOK model.',
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
            // Mirror the cloud auto-switch: a fresh local core lights up the
            // strategic layer via Hybrid mode (keeps fast heuristic tactical).
            // Promote from both heuristic and the legacy strategic-only mode, which runs the
            // strategic layer with the fast rules layer paused, which is an
            // explicit opt-in the player can re-select, not a sensible default
            // for a freshly loaded core. Only an already-'hybrid' mode is left
            // untouched. Skipped on the silent startup prewarm (promote=false)
            // to respect the persisted aiMode.
            aiMode: promote && state.aiMode !== 'hybrid' ? 'hybrid' : state.aiMode,
          }));
          logger.info('[AIConfigStore] WebGPU model ready');
          return true;
        }

        set({
          webgpuStatus: 'error',
          webgpuModelReady: false,
          webgpuError: 'The model could not be loaded. Try again or use a cloud BYOK model.',
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
          (state.llmBackend !== 'webgpu' && state.connectedProviders[state.llmBackend]) ||
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

      setStrategicPriorities: (priorities: string[], details?: StrategicPlanDetails) => {
        set((state) => ({
          strategic: {
            ...state.strategic,
            legacyPriorities: priorities,
            // Assigned explicitly (not spread) so a plan that omits a field
            // clears the previous plan's value instead of inheriting it.
            actionPlan: details?.actionPlan,
            insight: details?.insight,
            tradeoff: details?.tradeoff,
            focusMachine: details?.focusMachine,
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

      // AI Visualization toggles. The production target now defaults CLOSED —
      // it starts collapsed to its small launcher pill (reopen via the pill or
      // the "T" shortcut). None of these are persisted (see partialize), so the
      // new default applies to existing players too without a persist-version bump.
      showCascadeVisualization: false,
      showProductionTarget: false,
      showStrategicOverlay: false,
      showVCLDebug: true,
      showEnergyDashboard: false,
      showMultiObjective: false,
      showCostOverlay: false,

      setShowCascadeVisualization: (show: boolean) => set({ showCascadeVisualization: show }),
      setShowProductionTarget: (show: boolean) => set({ showProductionTarget: show }),
      setShowStrategicOverlay: (show: boolean) => set({ showStrategicOverlay: show }),
      setShowVCLDebug: (show: boolean) => set({ showVCLDebug: show }),
      setShowEnergyDashboard: (show: boolean) => set({ showEnergyDashboard: show }),
      setShowMultiObjective: (show: boolean) => set({ showMultiObjective: show }),
      setShowCostOverlay: (show: boolean) => set({ showCostOverlay: show }),

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
      recordApiUsage: (inputTokens: number, outputTokens: number) => {
        const pricing = getActiveCloudPricing();
        const inputCost = (inputTokens / 1_000_000) * pricing.input;
        const outputCost = (outputTokens / 1_000_000) * pricing.output;
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

      // Legacy direct-cost hook, retained for callers that report a billed cost.
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

      setCloudApiKey: async (backend, key) => {
        const attempt = ++cloudKeyAttempt;
        set({ connectionError: null });
        try {
          await cloudAIClient.testKey(backend, key);
          if (attempt !== cloudKeyAttempt || get().llmBackend !== backend) return false;
          cloudAIClient.setKey(backend, key);
          set((state) => ({
            connectedProviders: { ...state.connectedProviders, [backend]: true },
            connectionEpoch: state.connectionEpoch + 1,
            aiMode: 'hybrid',
            connectionError: null,
          }));
          return true;
        } catch (error) {
          if (attempt === cloudKeyAttempt) {
            set({ connectionError: error instanceof Error ? error.message : 'Connection failed.' });
          }
          return false;
        }
      },
      clearCloudApiKey: (backend) => {
        cloudKeyAttempt += 1;
        cloudAIClient.clearKey(backend);
        set((state) => ({
          connectedProviders: { ...state.connectedProviders, [backend]: false },
          connectionEpoch: state.connectionEpoch + 1,
          aiMode: state.llmBackend === backend ? 'heuristic' : state.aiMode,
          connectionError: null,
        }));
      },
    }),
    {
      name: 'millos-ai-config',
      storage: safeJSONStorage,
      version: 1,
      migrate: (persistedState) => {
        // Version 0 stored the Google key in plaintext. Return a strict
        // whitelist so rehydration rewrites storage without that credential.
        const previous =
          persistedState && typeof persistedState === 'object'
            ? (persistedState as Record<string, unknown>)
            : {};
        const local = previous.llmBackend === 'webgpu';
        return {
          llmBackend: local ? 'webgpu' : 'haiku',
          aiMode:
            local && (previous.aiMode === 'gemini' || previous.aiMode === 'hybrid')
              ? previous.aiMode
              : 'heuristic',
        };
      },
      partialize: (state) => ({
        // Preferences only. No API credential, validation state, or session cost.
        // A cloud strategic-only mode cannot resume after the memory-only key
        // disappears on reload. Save a safe tactical fallback instead.
        aiMode: state.llmBackend === 'webgpu' ? state.aiMode : 'heuristic',
        // Persist the chosen backend; webgpuModelReady is intentionally NOT
        // persisted (the engine is memory-only and must be reloaded each session).
        llmBackend: state.llmBackend,
      }),
    }
  )
);

// Initialize on module load (will run after rehydration)
if (typeof window !== 'undefined') {
  // Prewarm the local model if WebGPU was the persisted backend.
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
