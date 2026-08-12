import { describe, expect, it } from 'vitest';
import { parseRuntimeMode } from '../runtimeMode';

describe('parseRuntimeMode', () => {
  it('keeps ordinary visits out of deterministic benchmark mode', () => {
    expect(parseRuntimeMode('')).toEqual({
      benchmark: false,
      benchmarkScene: 'overview',
      durationSeconds: 10,
      quality: 'medium',
      gameTime: 12,
      weather: 'clear',
      scadaEnabled: true,
      paMode: 'focused',
      motionCapture: false,
      artMode: false,
      operationalCapture: false,
    });
  });

  it('parses a named benchmark with fixed environmental inputs', () => {
    expect(
      parseRuntimeMode('?benchmark=shipping&duration=20&quality=high&time=18.5&weather=rain')
    ).toEqual({
      benchmark: true,
      benchmarkScene: 'shipping',
      durationSeconds: 20,
      quality: 'high',
      gameTime: 18.5,
      weather: 'rain',
      scadaEnabled: true,
      paMode: 'focused',
      motionCapture: false,
      artMode: false,
      operationalCapture: false,
    });
  });

  it('opts art-review captures back into full visual fidelity', () => {
    expect(parseRuntimeMode('?benchmark=overview&art=on').artMode).toBe(true);
    expect(parseRuntimeMode('?benchmark=overview&art=off').artMode).toBe(false);
    expect(parseRuntimeMode('?benchmark=overview').artMode).toBe(false);
    // Art fidelity is independent of benchmark mode so an ordinary visit can
    // reproduce exactly what a review screenshot showed.
    expect(parseRuntimeMode('?art=on').artMode).toBe(true);
  });

  it('enables operational UI capture only with a deterministic benchmark camera', () => {
    expect(parseRuntimeMode('?benchmark=overview&operations=on').operationalCapture).toBe(true);
    expect(parseRuntimeMode('?benchmark=overview&operations=off').operationalCapture).toBe(false);
    expect(parseRuntimeMode('?operations=on').operationalCapture).toBe(false);
  });

  it('clamps numeric inputs and rejects unsupported enum values', () => {
    expect(
      parseRuntimeMode('?benchmark=unknown&duration=500&quality=cinematic&time=-4&weather=snow')
    ).toMatchObject({
      benchmark: true,
      benchmarkScene: 'overview',
      durationSeconds: 300,
      quality: 'medium',
      gameTime: 0,
      weather: 'clear',
    });
  });

  it('allows an explicit scene parameter with benchmark=true', () => {
    expect(parseRuntimeMode('?benchmark=true&scene=yard').benchmarkScene).toBe('yard');
    expect(parseRuntimeMode('?benchmark=true&scene=water').benchmarkScene).toBe('water');
    expect(parseRuntimeMode('?benchmark=true&scene=forklift').benchmarkScene).toBe('forklift');
    expect(parseRuntimeMode('?benchmark=true&scene=personnel').benchmarkScene).toBe('personnel');
    expect(parseRuntimeMode('?benchmark=true&scene=personnel-close').benchmarkScene).toBe(
      'personnel-close'
    );
    expect(parseRuntimeMode('?benchmark=true&scene=personnel-feminine').benchmarkScene).toBe(
      'personnel-feminine'
    );
    expect(parseRuntimeMode('?benchmark=true&scene=village').benchmarkScene).toBe('village');
    expect(parseRuntimeMode('?benchmark=true&scene=farm').benchmarkScene).toBe('farm');
    expect(parseRuntimeMode('?benchmark=true&scene=garage').benchmarkScene).toBe('garage');
    expect(parseRuntimeMode('?benchmark=true&scene=sun').benchmarkScene).toBe('sun');
    expect(parseRuntimeMode('?benchmark=true&scene=moon').benchmarkScene).toBe('moon');
  });

  it('parses explicit SCADA isolation states without changing the default', () => {
    expect(parseRuntimeMode('?benchmark=overview&scada=off').scadaEnabled).toBe(false);
    expect(parseRuntimeMode('?benchmark=overview&scada=on').scadaEnabled).toBe(true);
    expect(parseRuntimeMode('?benchmark=overview&scada=unknown').scadaEnabled).toBe(true);
  });

  it('runs simulation only for an explicit benchmark motion capture', () => {
    expect(parseRuntimeMode('?benchmark=shipping&motion=on').motionCapture).toBe(true);
    expect(parseRuntimeMode('?benchmark=shipping').motionCapture).toBe(false);
    expect(parseRuntimeMode('?motion=on').motionCapture).toBe(false);
  });

  it('parses PA isolation without changing the focused default', () => {
    expect(parseRuntimeMode('?benchmark=shipping&pa=off').paMode).toBe('off');
    expect(parseRuntimeMode('?benchmark=shipping&pa=characterful').paMode).toBe('characterful');
    expect(parseRuntimeMode('?benchmark=shipping&pa=unknown').paMode).toBe('focused');
  });
});
