import { describe, expect, it } from 'vitest';
import {
  sanitizeGameSimulationState,
  sanitizeKnowledgeState,
  sanitizeUIState,
} from '../persistenceMigrations';

describe('persistence migrations', () => {
  it('loads a clean first run from absent or malformed roots', () => {
    expect(sanitizeUIState(null)).toEqual({});
    expect(sanitizeKnowledgeState(undefined)).toEqual({});
  });

  it('preserves supported UI choices and discards corrupt values', () => {
    expect(
      sanitizeUIState({
        hasSeenIntro: true,
        theme: 'dark',
        uiScale: 9,
        showFPSCounter: false,
        legendPosition: { x: 50, y: Number.NaN },
        fpsMode: 'yes',
      })
    ).toEqual({
      hasSeenIntro: true,
      theme: 'dark',
      uiScale: 1.5,
      showFPSCounter: false,
    });
  });

  it('filters autonomous Datalink collections', () => {
    expect(
      sanitizeKnowledgeState({
        unlockedEntries: ['a', 3, 'a'],
        readEntries: 'broken',
        showTooltips: false,
        showAINarration: 'yes',
      })
    ).toEqual({
      unlockedEntries: ['a'],
      showTooltips: false,
    });
  });

  it('preserves valid simulation values while excluding corrupt state and actions', () => {
    expect(
      sanitizeGameSimulationState({
        gameTime: 25.5,
        gameDay: 2.9,
        gameSpeed: 10800,
        weather: 'storm',
        currentShift: 'morning',
        setGameSpeed: 'corrupt action',
      })
    ).toEqual({
      gameTime: 1.5,
      gameDay: 2,
      // Clamped to the 4x pace ceiling of the one time model.
      gameSpeed: 120,
      weather: 'storm',
    });

    expect(
      sanitizeGameSimulationState({
        gameTime: Number.NaN,
        gameDay: -4,
        gameSpeed: Number.POSITIVE_INFINITY,
        weather: 'hail',
      })
    ).toEqual({ gameDay: 0 });
  });
});
