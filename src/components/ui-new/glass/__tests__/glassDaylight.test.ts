import { afterEach, describe, expect, it } from 'vitest';
import { useGameSimulationStore } from '../../../../stores/gameSimulationStore';
import {
  GLASS_DAYLIGHT_PROPERTY,
  GLASS_DAYLIGHT_STEPS,
  glassDaylight,
  installGlassDaylight,
} from '../glassDaylight';

describe('glassDaylight', () => {
  it('is full at a clear noon and empty at midnight', () => {
    expect(glassDaylight(0, 12, 'clear')).toBe(1);
    expect(glassDaylight(0, 0, 'clear')).toBe(0);
  });

  it('dims with the weather, as the scene does', () => {
    const clear = glassDaylight(0, 12, 'clear');
    const storm = glassDaylight(0, 12, 'storm');
    expect(storm).toBeLessThan(clear);
    expect(storm).toBeGreaterThan(0);
  });

  it('only takes quantised values in 0-1', () => {
    for (let hour = 0; hour < 24; hour += 0.25) {
      const value = glassDaylight(3, hour, 'cloudy');
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
      expect(Number.isInteger(Math.round(value * GLASS_DAYLIGHT_STEPS * 1e6) / 1e6)).toBe(true);
    }
  });

  it('falls back to noon for a non-finite hour', () => {
    expect(glassDaylight(Number.NaN, Number.NaN, 'clear')).toBe(1);
  });
});

describe('installGlassDaylight', () => {
  const initial = useGameSimulationStore.getState();
  afterEach(() => {
    useGameSimulationStore.setState({
      gameTime: initial.gameTime,
      gameDay: initial.gameDay,
      weather: initial.weather,
    });
  });

  it('writes the root property, follows the clock, and clears on uninstall', () => {
    const root = document.createElement('div');
    useGameSimulationStore.setState({ gameTime: 12, weather: 'clear' });
    const uninstall = installGlassDaylight(root);
    expect(root.style.getPropertyValue(GLASS_DAYLIGHT_PROPERTY)).toBe('1');

    useGameSimulationStore.setState({ gameTime: 0 });
    expect(root.style.getPropertyValue(GLASS_DAYLIGHT_PROPERTY)).toBe('0');

    uninstall();
    expect(root.style.getPropertyValue(GLASS_DAYLIGHT_PROPERTY)).toBe('');
    useGameSimulationStore.setState({ gameTime: 12 });
    expect(root.style.getPropertyValue(GLASS_DAYLIGHT_PROPERTY)).toBe('');
  });
});
