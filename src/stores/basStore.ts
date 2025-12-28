/**
 * Bilateral Autonomy System (BAS) Store
 *
 * Core state management for the Five Axes of Democratic AI Management.
 * Implements the bilateral alignment philosophy where AI and humans are
 * genuine partners with mutual consideration.
 *
 * The five axes control:
 * 1. Autonomy Level - Task assignment (AI ↔ Self-Organized)
 * 2. Decision Mode - Who decides (AI ↔ Democracy)
 * 3. Information Access - Transparency level (Need-to-Know ↔ Full Open)
 * 4. Evaluation Direction - Who rates whom (AI Evaluates ↔ Workers Rate AI)
 * 5. Collective Orientation - Work focus (Individual ↔ Team-First)
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeJSONStorage } from './storage';
import type {
  FiveAxes,
  AxisKey,
  AxisConfig,
  BASMode,
  EducationFocus,
  SuggestionMode,
  DecisionThreshold,
  AIBehaviorConfig,
} from '../types/bas';
import { DEFAULT_AXES, DEFAULT_AXIS_CONFIG, BAS_PRESETS } from '../types/bas';

// =============================================================================
// STORE INTERFACE
// =============================================================================

interface BASState {
  // Core mode
  mode: BASMode;
  setMode: (mode: BASMode) => void;

  // The five axes (0-100 each)
  axes: FiveAxes;
  axisConfigs: Record<AxisKey, AxisConfig>;
  setAxis: (axis: AxisKey, value: number) => void;
  setAxisConfig: (axis: AxisKey, config: Partial<AxisConfig>) => void;

  // Derived from axes
  getEffectiveAutonomy: () => number;
  getSuggestionMode: () => SuggestionMode;
  getDecisionThreshold: () => DecisionThreshold;

  // AI behavior configuration
  aiConfig: AIBehaviorConfig;
  updateAIConfig: (config: Partial<AIBehaviorConfig>) => void;

  // Educational system
  educationEnabled: boolean;
  educationFocus: EducationFocus;
  setEducationEnabled: (enabled: boolean) => void;
  setEducationFocus: (focus: EducationFocus) => void;

  // Scenario system
  activeScenario: string | null;
  scenarioProgress: number;
  loadScenario: (scenarioId: string) => void;
  advanceScenario: () => void;
  exitScenario: () => void;

  // Presets
  applyPreset: (preset: keyof typeof BAS_PRESETS) => void;
  getCurrentPresetName: () => string | null;

  // Axis-to-flourishing mapping (used by flourishing calculations)
  getAxisFlourishingImpact: () => Record<string, number>;

  // Reset to defaults
  resetToDefaults: () => void;
}

// =============================================================================
// DEFAULT AI CONFIGURATION
// =============================================================================

const DEFAULT_AI_CONFIG: AIBehaviorConfig = {
  suggestionMode: 'suggestive',
  suggestionFrequency: 'reactive',
  languageStyle: {
    useImperatives: false,
    provideReasoning: true,
    acknowledgeUncertainty: true,
    offerAlternatives: true,
  },
  interactionRules: {
    maxSuggestionsPerHour: 10,
    quietPeriodAfterRejection: 5,
    respectDoNotDisturb: true,
  },
};

// =============================================================================
// AXIS-TO-FLOURISHING EFFECT WEIGHTS
// =============================================================================

/**
 * How BAS axis settings affect flourishing dimensions.
 * Each axis has weighted effects on the six flourishing dimensions.
 */
const AXIS_FLOURISHING_EFFECTS: Record<AxisKey, Record<string, number>> = {
  autonomyLevel: {
    agency: 0.4,
    meaning: 0.2,
    mastery: 0.15,
    joy: 0.1,
    wholeness: 0.1,
    connection: 0.05,
  },
  decisionMode: {
    agency: 0.35,
    connection: 0.25,
    meaning: 0.15,
    wholeness: 0.1,
    joy: 0.1,
    mastery: 0.05,
  },
  informationAccess: {
    meaning: 0.3,
    agency: 0.25,
    mastery: 0.2,
    connection: 0.1,
    joy: 0.1,
    wholeness: 0.05,
  },
  evaluationDirection: {
    agency: 0.35,
    wholeness: 0.25,
    meaning: 0.15,
    connection: 0.15,
    joy: 0.05,
    mastery: 0.05,
  },
  collectiveOrientation: {
    connection: 0.4,
    meaning: 0.2,
    joy: 0.15,
    wholeness: 0.1,
    mastery: 0.1,
    agency: 0.05,
  },
};

// =============================================================================
// STORE IMPLEMENTATION
// =============================================================================

export const useBASStore = create<BASState>()(
  persist(
    (set, get) => ({
      // Mode
      mode: 'transitional',
      setMode: (mode) => set({ mode }),

      // Axes
      axes: { ...DEFAULT_AXES },
      axisConfigs: {
        autonomyLevel: { ...DEFAULT_AXIS_CONFIG, currentTarget: 60 },
        decisionMode: { ...DEFAULT_AXIS_CONFIG, currentTarget: 50 },
        informationAccess: { ...DEFAULT_AXIS_CONFIG, currentTarget: 80 },
        evaluationDirection: { ...DEFAULT_AXIS_CONFIG, currentTarget: 50 },
        collectiveOrientation: { ...DEFAULT_AXIS_CONFIG, currentTarget: 40 },
      },

      setAxis: (axis, value) => {
        const config = get().axisConfigs[axis];
        const clampedValue = Math.max(config.minAllowed, Math.min(config.maxAllowed, value));
        set((state) => ({
          axes: { ...state.axes, [axis]: clampedValue },
        }));
      },

      setAxisConfig: (axis, config) => {
        set((state) => ({
          axisConfigs: {
            ...state.axisConfigs,
            [axis]: { ...state.axisConfigs[axis], ...config },
          },
        }));
      },

      // Derived values
      getEffectiveAutonomy: () => {
        const { axes } = get();
        // Weighted average emphasizing autonomy and decision mode
        return (
          axes.autonomyLevel * 0.3 +
          axes.decisionMode * 0.25 +
          axes.informationAccess * 0.15 +
          axes.evaluationDirection * 0.15 +
          axes.collectiveOrientation * 0.15
        );
      },

      getSuggestionMode: (): SuggestionMode => {
        const autonomy = get().axes.autonomyLevel;
        if (autonomy < 25) return 'directive';
        if (autonomy < 50) return 'suggestive';
        if (autonomy < 75) return 'available';
        return 'silent';
      },

      getDecisionThreshold: (): DecisionThreshold => {
        const decision = get().axes.decisionMode;
        if (decision < 33) return 'ai';
        if (decision < 66) return 'hybrid';
        return 'democratic';
      },

      // AI Configuration
      aiConfig: { ...DEFAULT_AI_CONFIG },
      updateAIConfig: (config) => {
        set((state) => ({
          aiConfig: {
            ...state.aiConfig,
            ...config,
            languageStyle: {
              ...state.aiConfig.languageStyle,
              ...(config.languageStyle || {}),
            },
            interactionRules: {
              ...state.aiConfig.interactionRules,
              ...(config.interactionRules || {}),
            },
          },
        }));
      },

      // Education
      educationEnabled: true,
      educationFocus: 'bilateral',
      setEducationEnabled: (enabled) => set({ educationEnabled: enabled }),
      setEducationFocus: (focus) => set({ educationFocus: focus }),

      // Scenarios
      activeScenario: null,
      scenarioProgress: 0,
      loadScenario: (scenarioId) => set({ activeScenario: scenarioId, scenarioProgress: 0 }),
      advanceScenario: () => set((s) => ({ scenarioProgress: s.scenarioProgress + 1 })),
      exitScenario: () => set({ activeScenario: null, scenarioProgress: 0 }),

      // Presets
      applyPreset: (preset) => {
        const presetConfig = BAS_PRESETS[preset];
        if (presetConfig) {
          set({
            axes: { ...presetConfig.axes },
            mode:
              preset === 'traditional'
                ? 'traditional'
                : preset === 'democratic' || preset === 'experimental'
                  ? 'democratic'
                  : 'transitional',
          });
        }
      },

      getCurrentPresetName: () => {
        const { axes } = get();
        for (const [key, preset] of Object.entries(BAS_PRESETS)) {
          const isMatch = (Object.keys(preset.axes) as AxisKey[]).every(
            (axisKey) => Math.abs(axes[axisKey] - preset.axes[axisKey]) < 5
          );
          if (isMatch) return key;
        }
        return null;
      },

      // Axis-to-flourishing impact calculation
      getAxisFlourishingImpact: () => {
        const { axes } = get();
        const impact: Record<string, number> = {
          meaning: 0,
          mastery: 0,
          connection: 0,
          joy: 0,
          wholeness: 0,
          agency: 0,
        };

        for (const [axisKey, effects] of Object.entries(AXIS_FLOURISHING_EFFECTS)) {
          const axisValue = axes[axisKey as AxisKey] / 100; // Normalize to 0-1

          for (const [dimension, weight] of Object.entries(effects)) {
            // Effect scales with axis value
            // At 50% axis, effect is neutral
            // Below 50%, negative impact
            // Above 50%, positive impact
            const normalizedEffect = (axisValue - 0.5) * 2 * weight * 20; // -20 to +20
            impact[dimension] += normalizedEffect;
          }
        }

        return impact;
      },

      // Reset
      resetToDefaults: () => {
        set({
          mode: 'transitional',
          axes: { ...DEFAULT_AXES },
          axisConfigs: {
            autonomyLevel: { ...DEFAULT_AXIS_CONFIG, currentTarget: 60 },
            decisionMode: { ...DEFAULT_AXIS_CONFIG, currentTarget: 50 },
            informationAccess: { ...DEFAULT_AXIS_CONFIG, currentTarget: 80 },
            evaluationDirection: { ...DEFAULT_AXIS_CONFIG, currentTarget: 50 },
            collectiveOrientation: { ...DEFAULT_AXIS_CONFIG, currentTarget: 40 },
          },
          aiConfig: { ...DEFAULT_AI_CONFIG },
          educationEnabled: true,
          educationFocus: 'bilateral',
          activeScenario: null,
          scenarioProgress: 0,
        });
      },
    }),
    {
      name: 'millos-bas',
      storage: safeJSONStorage,
      partialize: (state) => ({
        mode: state.mode,
        axes: state.axes,
        axisConfigs: state.axisConfigs,
        educationEnabled: state.educationEnabled,
        educationFocus: state.educationFocus,
      }),
    }
  )
);
