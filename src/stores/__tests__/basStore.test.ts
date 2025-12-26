/**
 * BAS Store Tests
 *
 * Tests for the Bilateral Autonomy System store including:
 * - Axis value updates (0-100 bounds)
 * - Preset application
 * - Mode transitions
 * - Derived values (effective autonomy, suggestion mode, decision threshold)
 * - AI configuration
 * - Axis-to-flourishing impact calculations
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useBASStore } from '../basStore';
import { DEFAULT_AXES, BAS_PRESETS } from '../../types/bas';
import type { AxisKey, BASMode } from '../../types/bas';

describe('BASStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useBASStore.getState().resetToDefaults();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with transitional mode', () => {
      const { mode } = useBASStore.getState();
      expect(mode).toBe('transitional');
    });

    it('should initialize with default axes values', () => {
      const { axes } = useBASStore.getState();
      expect(axes.autonomyLevel).toBe(DEFAULT_AXES.autonomyLevel);
      expect(axes.decisionMode).toBe(DEFAULT_AXES.decisionMode);
      expect(axes.informationAccess).toBe(DEFAULT_AXES.informationAccess);
      expect(axes.evaluationDirection).toBe(DEFAULT_AXES.evaluationDirection);
      expect(axes.collectiveOrientation).toBe(DEFAULT_AXES.collectiveOrientation);
    });

    it('should initialize with axis configs containing current targets', () => {
      const { axisConfigs } = useBASStore.getState();
      expect(axisConfigs.autonomyLevel.currentTarget).toBe(60);
      expect(axisConfigs.decisionMode.currentTarget).toBe(50);
      expect(axisConfigs.informationAccess.currentTarget).toBe(80);
    });

    it('should initialize with education enabled', () => {
      const { educationEnabled, educationFocus } = useBASStore.getState();
      expect(educationEnabled).toBe(true);
      expect(educationFocus).toBe('bilateral');
    });

    it('should initialize without active scenario', () => {
      const { activeScenario, scenarioProgress } = useBASStore.getState();
      expect(activeScenario).toBeNull();
      expect(scenarioProgress).toBe(0);
    });
  });

  describe('Axis Value Updates', () => {
    it('should update axis value within bounds', () => {
      const { setAxis } = useBASStore.getState();

      setAxis('autonomyLevel', 75);

      const { axes } = useBASStore.getState();
      expect(axes.autonomyLevel).toBe(75);
    });

    it('should clamp axis value to minimum (0)', () => {
      const { setAxis } = useBASStore.getState();

      setAxis('autonomyLevel', -10);

      const { axes } = useBASStore.getState();
      expect(axes.autonomyLevel).toBe(0);
    });

    it('should clamp axis value to maximum (100)', () => {
      const { setAxis } = useBASStore.getState();

      setAxis('autonomyLevel', 150);

      const { axes } = useBASStore.getState();
      expect(axes.autonomyLevel).toBe(100);
    });

    it('should respect custom axis config bounds', () => {
      const { setAxisConfig, setAxis } = useBASStore.getState();

      // Set custom bounds
      setAxisConfig('autonomyLevel', { minAllowed: 20, maxAllowed: 80 });

      // Try to set below minimum
      setAxis('autonomyLevel', 10);
      expect(useBASStore.getState().axes.autonomyLevel).toBe(20);

      // Try to set above maximum
      setAxis('autonomyLevel', 90);
      expect(useBASStore.getState().axes.autonomyLevel).toBe(80);

      // Set within bounds
      setAxis('autonomyLevel', 50);
      expect(useBASStore.getState().axes.autonomyLevel).toBe(50);
    });

    it('should update all five axes independently', () => {
      const { setAxis } = useBASStore.getState();
      const axisKeys: AxisKey[] = [
        'autonomyLevel',
        'decisionMode',
        'informationAccess',
        'evaluationDirection',
        'collectiveOrientation',
      ];

      axisKeys.forEach((key, index) => {
        setAxis(key, (index + 1) * 20);
      });

      const { axes } = useBASStore.getState();
      expect(axes.autonomyLevel).toBe(20);
      expect(axes.decisionMode).toBe(40);
      expect(axes.informationAccess).toBe(60);
      expect(axes.evaluationDirection).toBe(80);
      expect(axes.collectiveOrientation).toBe(100);
    });

    it('should handle decimal values', () => {
      const { setAxis } = useBASStore.getState();

      setAxis('autonomyLevel', 50.5);

      const { axes } = useBASStore.getState();
      expect(axes.autonomyLevel).toBe(50.5);
    });
  });

  describe('Axis Configuration', () => {
    it('should update axis config partially', () => {
      const { setAxisConfig } = useBASStore.getState();

      setAxisConfig('autonomyLevel', { currentTarget: 70 });

      const { axisConfigs } = useBASStore.getState();
      expect(axisConfigs.autonomyLevel.currentTarget).toBe(70);
      expect(axisConfigs.autonomyLevel.minAllowed).toBe(0); // Unchanged
    });

    it('should set locked by vote status', () => {
      const { setAxisConfig } = useBASStore.getState();

      setAxisConfig('decisionMode', { lockedByVote: true });

      const { axisConfigs } = useBASStore.getState();
      expect(axisConfigs.decisionMode.lockedByVote).toBe(true);
    });

    it('should update actual measured value', () => {
      const { setAxisConfig } = useBASStore.getState();

      setAxisConfig('informationAccess', { actualMeasured: 72 });

      const { axisConfigs } = useBASStore.getState();
      expect(axisConfigs.informationAccess.actualMeasured).toBe(72);
    });
  });

  describe('Mode Management', () => {
    it('should change mode', () => {
      const { setMode } = useBASStore.getState();

      const modes: BASMode[] = ['traditional', 'transitional', 'democratic', 'educational'];

      modes.forEach((mode) => {
        setMode(mode);
        expect(useBASStore.getState().mode).toBe(mode);
      });
    });
  });

  describe('Preset Application', () => {
    it('should apply traditional preset', () => {
      const { applyPreset } = useBASStore.getState();

      applyPreset('traditional');

      const { axes, mode } = useBASStore.getState();
      expect(axes).toEqual(BAS_PRESETS.traditional.axes);
      expect(mode).toBe('traditional');
    });

    it('should apply balanced preset', () => {
      const { applyPreset } = useBASStore.getState();

      applyPreset('balanced');

      const { axes } = useBASStore.getState();
      expect(axes).toEqual(BAS_PRESETS.balanced.axes);
    });

    it('should apply democratic preset', () => {
      const { applyPreset } = useBASStore.getState();

      applyPreset('democratic');

      const { axes, mode } = useBASStore.getState();
      expect(axes).toEqual(BAS_PRESETS.democratic.axes);
      expect(mode).toBe('democratic');
    });

    it('should apply experimental preset', () => {
      const { applyPreset } = useBASStore.getState();

      applyPreset('experimental');

      const { axes, mode } = useBASStore.getState();
      expect(axes).toEqual(BAS_PRESETS.experimental.axes);
      expect(mode).toBe('democratic');
    });

    it('should detect current preset name', () => {
      const { applyPreset, getCurrentPresetName } = useBASStore.getState();

      applyPreset('democratic');

      const presetName = getCurrentPresetName();
      expect(presetName).toBe('democratic');
    });

    it('should return null when axes do not match any preset', () => {
      const { setAxis, getCurrentPresetName } = useBASStore.getState();

      // Set custom values that don't match any preset
      setAxis('autonomyLevel', 33);
      setAxis('decisionMode', 67);

      const presetName = getCurrentPresetName();
      expect(presetName).toBeNull();
    });

    it('should match preset within tolerance of 5', () => {
      const { applyPreset, setAxis, getCurrentPresetName } = useBASStore.getState();

      applyPreset('balanced');
      // Slightly adjust one axis within tolerance
      setAxis('autonomyLevel', 52); // balanced is 50, tolerance is 5

      const presetName = getCurrentPresetName();
      expect(presetName).toBe('balanced');
    });
  });

  describe('Derived Values', () => {
    describe('getEffectiveAutonomy', () => {
      it('should calculate weighted average of axes', () => {
        const { setAxis, getEffectiveAutonomy } = useBASStore.getState();

        // Set all axes to 100 for easy calculation
        setAxis('autonomyLevel', 100);
        setAxis('decisionMode', 100);
        setAxis('informationAccess', 100);
        setAxis('evaluationDirection', 100);
        setAxis('collectiveOrientation', 100);

        const effectiveAutonomy = getEffectiveAutonomy();
        // 100 * (0.3 + 0.25 + 0.15 + 0.15 + 0.15) = 100
        expect(effectiveAutonomy).toBe(100);
      });

      it('should weight autonomyLevel most heavily', () => {
        const { setAxis, getEffectiveAutonomy } = useBASStore.getState();

        // Set only autonomyLevel high
        setAxis('autonomyLevel', 100);
        setAxis('decisionMode', 0);
        setAxis('informationAccess', 0);
        setAxis('evaluationDirection', 0);
        setAxis('collectiveOrientation', 0);

        const effectiveAutonomy = getEffectiveAutonomy();
        expect(effectiveAutonomy).toBe(30); // 100 * 0.3
      });
    });

    describe('getSuggestionMode', () => {
      it('should return directive when autonomy < 25', () => {
        const { setAxis, getSuggestionMode } = useBASStore.getState();

        setAxis('autonomyLevel', 20);

        expect(getSuggestionMode()).toBe('directive');
      });

      it('should return suggestive when autonomy 25-50', () => {
        const { setAxis, getSuggestionMode } = useBASStore.getState();

        setAxis('autonomyLevel', 35);

        expect(getSuggestionMode()).toBe('suggestive');
      });

      it('should return available when autonomy 50-75', () => {
        const { setAxis, getSuggestionMode } = useBASStore.getState();

        setAxis('autonomyLevel', 60);

        expect(getSuggestionMode()).toBe('available');
      });

      it('should return silent when autonomy >= 75', () => {
        const { setAxis, getSuggestionMode } = useBASStore.getState();

        setAxis('autonomyLevel', 80);

        expect(getSuggestionMode()).toBe('silent');
      });

      it('should handle boundary values correctly', () => {
        const { setAxis, getSuggestionMode } = useBASStore.getState();

        setAxis('autonomyLevel', 25);
        expect(getSuggestionMode()).toBe('suggestive');

        setAxis('autonomyLevel', 50);
        expect(getSuggestionMode()).toBe('available');

        setAxis('autonomyLevel', 75);
        expect(getSuggestionMode()).toBe('silent');
      });
    });

    describe('getDecisionThreshold', () => {
      it('should return ai when decisionMode < 33', () => {
        const { setAxis, getDecisionThreshold } = useBASStore.getState();

        setAxis('decisionMode', 20);

        expect(getDecisionThreshold()).toBe('ai');
      });

      it('should return hybrid when decisionMode 33-66', () => {
        const { setAxis, getDecisionThreshold } = useBASStore.getState();

        setAxis('decisionMode', 50);

        expect(getDecisionThreshold()).toBe('hybrid');
      });

      it('should return democratic when decisionMode >= 66', () => {
        const { setAxis, getDecisionThreshold } = useBASStore.getState();

        setAxis('decisionMode', 70);

        expect(getDecisionThreshold()).toBe('democratic');
      });

      it('should handle boundary values correctly', () => {
        const { setAxis, getDecisionThreshold } = useBASStore.getState();

        setAxis('decisionMode', 33);
        expect(getDecisionThreshold()).toBe('hybrid');

        setAxis('decisionMode', 66);
        expect(getDecisionThreshold()).toBe('democratic');
      });
    });
  });

  describe('AI Configuration', () => {
    it('should initialize with default AI config', () => {
      const { aiConfig } = useBASStore.getState();

      expect(aiConfig.suggestionMode).toBe('suggestive');
      expect(aiConfig.suggestionFrequency).toBe('reactive');
      expect(aiConfig.languageStyle.useImperatives).toBe(false);
      expect(aiConfig.languageStyle.provideReasoning).toBe(true);
    });

    it('should update AI config partially', () => {
      const { updateAIConfig } = useBASStore.getState();

      updateAIConfig({ suggestionMode: 'directive' });

      const { aiConfig } = useBASStore.getState();
      expect(aiConfig.suggestionMode).toBe('directive');
      expect(aiConfig.suggestionFrequency).toBe('reactive'); // Unchanged
    });

    it('should update nested language style', () => {
      const { updateAIConfig } = useBASStore.getState();

      // The store performs deep merging, so we can pass partial nested objects
      updateAIConfig({
        languageStyle: { useImperatives: true, provideReasoning: true, acknowledgeUncertainty: true, offerAlternatives: true },
      });

      const { aiConfig } = useBASStore.getState();
      expect(aiConfig.languageStyle.useImperatives).toBe(true);
      expect(aiConfig.languageStyle.provideReasoning).toBe(true);
    });

    it('should update nested interaction rules', () => {
      const { updateAIConfig } = useBASStore.getState();

      // The store performs deep merging, so we can pass partial nested objects
      updateAIConfig({
        interactionRules: { maxSuggestionsPerHour: 5, quietPeriodAfterRejection: 300, respectDoNotDisturb: true },
      });

      const { aiConfig } = useBASStore.getState();
      expect(aiConfig.interactionRules.maxSuggestionsPerHour).toBe(5);
      expect(aiConfig.interactionRules.respectDoNotDisturb).toBe(true);
    });
  });

  describe('Education System', () => {
    it('should toggle education enabled', () => {
      const { setEducationEnabled } = useBASStore.getState();

      setEducationEnabled(false);
      expect(useBASStore.getState().educationEnabled).toBe(false);

      setEducationEnabled(true);
      expect(useBASStore.getState().educationEnabled).toBe(true);
    });

    it('should change education focus', () => {
      const { setEducationFocus } = useBASStore.getState();

      const focuses = ['none', 'semler', 'mondragon', 'wallace', 'bilateral', 'value', 'flourishing'] as const;

      focuses.forEach((focus) => {
        setEducationFocus(focus);
        expect(useBASStore.getState().educationFocus).toBe(focus);
      });
    });
  });

  describe('Scenario System', () => {
    it('should load scenario', () => {
      const { loadScenario } = useBASStore.getState();

      loadScenario('scenario-1');

      const { activeScenario, scenarioProgress } = useBASStore.getState();
      expect(activeScenario).toBe('scenario-1');
      expect(scenarioProgress).toBe(0);
    });

    it('should advance scenario progress', () => {
      const { loadScenario, advanceScenario } = useBASStore.getState();

      loadScenario('scenario-1');
      advanceScenario();
      advanceScenario();

      const { scenarioProgress } = useBASStore.getState();
      expect(scenarioProgress).toBe(2);
    });

    it('should exit scenario', () => {
      const { loadScenario, advanceScenario, exitScenario } = useBASStore.getState();

      loadScenario('scenario-1');
      advanceScenario();
      exitScenario();

      const { activeScenario, scenarioProgress } = useBASStore.getState();
      expect(activeScenario).toBeNull();
      expect(scenarioProgress).toBe(0);
    });
  });

  describe('Axis-to-Flourishing Impact', () => {
    it('should calculate flourishing impact from axes', () => {
      const { getAxisFlourishingImpact } = useBASStore.getState();

      const impact = getAxisFlourishingImpact();

      // Should have all six dimensions
      expect(impact).toHaveProperty('meaning');
      expect(impact).toHaveProperty('mastery');
      expect(impact).toHaveProperty('connection');
      expect(impact).toHaveProperty('joy');
      expect(impact).toHaveProperty('wholeness');
      expect(impact).toHaveProperty('agency');
    });

    it('should return positive impact when axes above 50', () => {
      const { setAxis, getAxisFlourishingImpact } = useBASStore.getState();

      // Set all axes high
      setAxis('autonomyLevel', 80);
      setAxis('decisionMode', 80);
      setAxis('informationAccess', 80);
      setAxis('evaluationDirection', 80);
      setAxis('collectiveOrientation', 80);

      const impact = getAxisFlourishingImpact();

      // All impacts should be positive when axes are above 50
      Object.values(impact).forEach((value) => {
        expect(value).toBeGreaterThan(0);
      });
    });

    it('should return negative impact when axes below 50', () => {
      const { setAxis, getAxisFlourishingImpact } = useBASStore.getState();

      // Set all axes low
      setAxis('autonomyLevel', 20);
      setAxis('decisionMode', 20);
      setAxis('informationAccess', 20);
      setAxis('evaluationDirection', 20);
      setAxis('collectiveOrientation', 20);

      const impact = getAxisFlourishingImpact();

      // All impacts should be negative when axes are below 50
      Object.values(impact).forEach((value) => {
        expect(value).toBeLessThan(0);
      });
    });

    it('should return neutral impact when axes at 50', () => {
      const { setAxis, getAxisFlourishingImpact } = useBASStore.getState();

      // Set all axes to neutral
      setAxis('autonomyLevel', 50);
      setAxis('decisionMode', 50);
      setAxis('informationAccess', 50);
      setAxis('evaluationDirection', 50);
      setAxis('collectiveOrientation', 50);

      const impact = getAxisFlourishingImpact();

      // All impacts should be zero (or very close) when axes are at 50
      Object.values(impact).forEach((value) => {
        expect(Math.abs(value)).toBeLessThan(0.01);
      });
    });

    it('should weight autonomy impact heavily on agency', () => {
      const { setAxis, getAxisFlourishingImpact } = useBASStore.getState();

      // Set only autonomy high, others neutral
      setAxis('autonomyLevel', 100);
      setAxis('decisionMode', 50);
      setAxis('informationAccess', 50);
      setAxis('evaluationDirection', 50);
      setAxis('collectiveOrientation', 50);

      const impact = getAxisFlourishingImpact();

      // Agency should have highest impact from autonomy axis
      expect(impact.agency).toBeGreaterThan(impact.meaning);
      expect(impact.agency).toBeGreaterThan(impact.mastery);
    });

    it('should weight collective orientation heavily on connection', () => {
      const { setAxis, getAxisFlourishingImpact } = useBASStore.getState();

      // Set only collective orientation high, others neutral
      setAxis('autonomyLevel', 50);
      setAxis('decisionMode', 50);
      setAxis('informationAccess', 50);
      setAxis('evaluationDirection', 50);
      setAxis('collectiveOrientation', 100);

      const impact = getAxisFlourishingImpact();

      // Connection should have highest impact from collective axis
      expect(impact.connection).toBeGreaterThan(impact.agency);
    });
  });

  describe('Reset to Defaults', () => {
    it('should reset all state to defaults', () => {
      const { setAxis, setMode, setEducationEnabled, loadScenario, resetToDefaults } = useBASStore.getState();

      // Modify state
      setAxis('autonomyLevel', 90);
      setMode('democratic');
      setEducationEnabled(false);
      loadScenario('test-scenario');

      // Reset
      resetToDefaults();

      const state = useBASStore.getState();
      expect(state.mode).toBe('transitional');
      expect(state.axes.autonomyLevel).toBe(DEFAULT_AXES.autonomyLevel);
      expect(state.educationEnabled).toBe(true);
      expect(state.activeScenario).toBeNull();
    });

    it('should reset AI config to defaults', () => {
      const { updateAIConfig, resetToDefaults } = useBASStore.getState();

      updateAIConfig({ suggestionMode: 'directive' });
      resetToDefaults();

      const { aiConfig } = useBASStore.getState();
      expect(aiConfig.suggestionMode).toBe('suggestive');
    });
  });

  describe('Performance', () => {
    it('should handle rapid axis updates efficiently', () => {
      const { setAxis } = useBASStore.getState();

      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        setAxis('autonomyLevel', i % 100);
      }
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(100); // Should complete in under 100ms
    });

    it('should handle rapid preset changes efficiently', () => {
      const { applyPreset } = useBASStore.getState();
      const presets = ['traditional', 'balanced', 'democratic', 'experimental'] as const;

      const start = performance.now();
      for (let i = 0; i < 100; i++) {
        applyPreset(presets[i % presets.length]);
      }
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(50); // Should complete in under 50ms
    });
  });
});
