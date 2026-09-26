import { describe, expect, it } from 'vitest';
import { sampleAtmosphere, sampleCelestial } from '../atmosphere';

describe('atmosphere sampling', () => {
  it('follows a coherent dawn, noon, dusk, and night solar path', () => {
    const dawn = sampleAtmosphere(0, 6, 'clear');
    const noon = sampleAtmosphere(0, 12, 'clear');
    const dusk = sampleAtmosphere(0, 18, 'clear');
    const night = sampleAtmosphere(0, 0, 'clear');

    expect(dawn.solarElevation).toBeCloseTo(0, 8);
    expect(noon.solarElevation).toBeCloseTo(1, 8);
    expect(dusk.solarElevation).toBeCloseTo(0, 8);
    expect(night.solarElevation).toBeCloseTo(-1, 8);
    expect(noon.daylight).toBe(1);
    expect(night.daylight).toBe(0);
    expect(dawn.twilight).toBeGreaterThan(noon.twilight);
    expect(dusk.twilight).toBeGreaterThan(noon.twilight);
  });

  it('shares a normalized site-oriented orbit across the complete day', () => {
    for (let hour = 0; hour < 24; hour += 0.5) {
      const state = sampleCelestial(sampleAtmosphere(0, hour, 'clear'));
      expect(Math.hypot(...state.sunDirection)).toBeCloseTo(1, 8);
      state.sunDirection.forEach((value, axis) => expect(state.moonDirection[axis]).toBe(-value));
    }
    const afternoon = sampleCelestial(sampleAtmosphere(0, 16, 'clear'));
    expect(afternoon.sunDirection[0]).toBeLessThan(-0.5);
    expect(afternoon.sunDirection[2]).toBeGreaterThan(0.5);
  });

  it('uses one weather event for cloud, light, precipitation, wetness, wind, and fog', () => {
    const clear = sampleAtmosphere(2, 12, 'clear');
    const cloudy = sampleAtmosphere(2, 12, 'cloudy');
    const rain = sampleAtmosphere(2, 12, 'rain');
    const storm = sampleAtmosphere(2, 12, 'storm');

    expect(storm.cloudCoverage).toBeGreaterThan(clear.cloudCoverage);
    expect(storm.lightMultiplier).toBeLessThan(clear.lightMultiplier);
    expect(storm.wetness).toBeGreaterThan(clear.wetness);
    expect(cloudy.wetness).toBeGreaterThan(0);
    expect(cloudy.precipitation).toBe(0);
    expect(rain.precipitation).toBeGreaterThan(cloudy.precipitation);
    expect(storm.precipitation).toBeGreaterThan(rain.precipitation);
    expect(storm.wind).toBeGreaterThan(clear.wind);
    // The ordering flips with the model: linear fog got THICKER by pulling its
    // near and far planes IN, exponential fog by raising density.
    expect(storm.fogDensity).toBeGreaterThan(clear.fogDensity);
    expect(storm.simulationMinutes).toBe(clear.simulationMinutes);
  });

  it('is deterministic for replay samples', () => {
    expect(sampleAtmosphere(5, 15.75, 'rain')).toEqual(sampleAtmosphere(5, 15.75, 'rain'));
  });

  it('keeps the sun and moon on opposite sides of one tilted orbit', () => {
    const dawn = sampleCelestial(sampleAtmosphere(0, 6, 'clear'));
    const noon = sampleCelestial(sampleAtmosphere(0, 12, 'clear'));
    const dusk = sampleCelestial(sampleAtmosphere(0, 18, 'clear'));

    for (const sample of [dawn, noon, dusk]) {
      expect(sample.sunDirection[0] + sample.moonDirection[0]).toBeCloseTo(0, 8);
      expect(sample.sunDirection[1] + sample.moonDirection[1]).toBeCloseTo(0, 8);
      expect(sample.sunDirection[2] + sample.moonDirection[2]).toBeCloseTo(0, 8);
      expect(Math.hypot(...sample.sunDirection)).toBeCloseTo(1, 8);
    }

    expect(dawn.sunDirection[0]).toBeGreaterThan(0);
    expect(dusk.sunDirection[0]).toBeLessThan(0);
    expect(noon.sunDirection[1]).toBeCloseTo(1, 8);
  });

  it('crossfades celestial bodies and lights through the complete day', () => {
    const noon = sampleCelestial(sampleAtmosphere(0, 12, 'clear'));
    const dusk = sampleCelestial(sampleAtmosphere(0, 18, 'clear'));
    const midnight = sampleCelestial(sampleAtmosphere(0, 0, 'clear'));

    expect(noon.sunOpacity).toBeGreaterThan(0.8);
    expect(noon.moonOpacity).toBe(0);
    expect(noon.starOpacity).toBe(0);
    expect(noon.sunLightIntensity).toBeCloseTo(3.1, 5);
    expect(noon.moonLightIntensity).toBe(0);

    expect(dusk.sunOpacity).toBeGreaterThan(0);
    expect(dusk.moonOpacity).toBeGreaterThan(0);
    expect(dusk.goldenHour).toBeGreaterThan(0.7);

    expect(midnight.sunOpacity).toBe(0);
    expect(midnight.moonOpacity).toBeGreaterThan(0.7);
    expect(midnight.starOpacity).toBeGreaterThan(0.7);
    expect(midnight.sunLightIntensity).toBe(0);
    expect(midnight.moonLightIntensity).toBeGreaterThan(0.2);
  });

  it('keys the sun well above the omnidirectional fill', () => {
    // THE CONTRACT THIS PINS IS A RATIO, NOT A BRIGHTNESS.
    //
    // These two terms used to be 1.84 and 0.76 - a fill/key ratio of 0.98,
    // which is flat lighting: no modelling, and no visible difference between
    // a frame with the shadow pass on and one with it off. A bare
    // `toBeGreaterThan(1.7)` goes green on any value at or above the old one,
    // so it would not have noticed the regression back.
    const noon = sampleCelestial(sampleAtmosphere(0, 12, 'clear'));
    const morning = sampleCelestial(sampleAtmosphere(0, 9, 'clear'));

    expect(noon.ambientLightIntensity).toBeCloseTo(0.22, 5);
    expect(noon.ambientLightIntensity / noon.sunLightIntensity).toBeLessThan(0.15);
    expect(morning.ambientLightIntensity / morning.sunLightIntensity).toBeLessThan(0.2);

    // Overcast weather compresses the ratio rather than inverting it: the key
    // still leads, so a storm reads as a dull day and not as a flat one.
    const storm = sampleCelestial(sampleAtmosphere(0, 12, 'storm'));
    expect(storm.sunLightIntensity).toBeGreaterThan(storm.ambientLightIntensity);
    expect(storm.sunLightIntensity).toBeLessThan(noon.sunLightIntensity);
  });

  it('keeps night fill low enough for the moon to read', () => {
    const midnight = sampleCelestial(sampleAtmosphere(0, 0, 'clear'));
    expect(midnight.ambientLightIntensity).toBeLessThan(0.12);
    expect(midnight.ambientLightIntensity).toBeGreaterThan(0);
    expect(midnight.moonLightIntensity).toBeGreaterThan(midnight.ambientLightIntensity);
  });

  it('veils celestial visuals with weather without revealing daytime stars', () => {
    const clearNoon = sampleCelestial(sampleAtmosphere(0, 12, 'clear'));
    const stormNoon = sampleCelestial(sampleAtmosphere(0, 12, 'storm'));
    const clearNight = sampleCelestial(sampleAtmosphere(0, 0, 'clear'));
    const stormNight = sampleCelestial(sampleAtmosphere(0, 0, 'storm'));

    expect(stormNoon.starOpacity).toBe(0);
    expect(stormNoon.sunOpacity).toBeLessThan(clearNoon.sunOpacity);
    expect(stormNight.starOpacity).toBeLessThan(clearNight.starOpacity);
    expect(stormNight.moonOpacity).toBeLessThan(clearNight.moonOpacity);
  });
});
