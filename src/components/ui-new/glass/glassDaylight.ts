import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import {
  createAtmosphereState,
  sampleAtmosphere,
  type AtmosphereWeather,
} from '../../../simulation/atmosphere';

/**
 * Drives `.millos-glass` (src/index.css) from the scene's own light.
 *
 * Glass over a live WebGL canvas cannot cheaply measure what is behind it:
 * sampling the canvas means `readPixels`, a GPU stall. The scene already knows
 * how bright it is, so the glass reads the same atmosphere sample the sky and
 * exterior use - daylight scaled by the weather's light multiplier, as
 * `FactoryExterior` does - and thickens its tint when the world behind it is
 * bright. The text stays light at every hour, so only the tint moves.
 *
 * The value is quantised and written to the root only when the step changes:
 * the store ticks far more often than the glass needs to, and every root
 * custom-property write is a style recalculation for everything that reads it.
 */
export const GLASS_DAYLIGHT_PROPERTY = '--millos-glass-daylight';
export const GLASS_DAYLIGHT_STEPS = 20;

const scratch = createAtmosphereState();

export function glassDaylight(day: number, hour: number, weather: AtmosphereWeather): number {
  const atmosphere = sampleAtmosphere(
    Number.isFinite(day) ? day : 0,
    Number.isFinite(hour) ? hour : 12,
    weather,
    scratch
  );
  const light = atmosphere.daylight * atmosphere.lightMultiplier;
  const clamped = Math.min(1, Math.max(0, Number.isFinite(light) ? light : 1));
  return Math.round(clamped * GLASS_DAYLIGHT_STEPS) / GLASS_DAYLIGHT_STEPS;
}

/** Subscribe the root's glass daylight to simulation time and weather. */
export function installGlassDaylight(root: HTMLElement = document.documentElement): () => void {
  let written: number | null = null;
  const apply = () => {
    const { gameDay, gameTime, weather } = useGameSimulationStore.getState();
    const value = glassDaylight(gameDay, gameTime, weather);
    if (value === written) return;
    written = value;
    root.style.setProperty(GLASS_DAYLIGHT_PROPERTY, String(value));
  };
  apply();
  const unsubscribe = useGameSimulationStore.subscribe((state, previous) => {
    if (
      state.gameTime === previous.gameTime &&
      state.gameDay === previous.gameDay &&
      state.weather === previous.weather
    )
      return;
    apply();
  });
  return () => {
    unsubscribe();
    root.style.removeProperty(GLASS_DAYLIGHT_PROPERTY);
  };
}
