import { describe, expect, it } from 'vitest';
import { parseRuntimeMode, type BenchmarkScene } from '../runtimeMode';

// Record<BenchmarkScene, true> makes tsc reject a scene added to the type but
// not to this list, so every declared camera is round-tripped below.
const ALL_SCENES: Record<BenchmarkScene, true> = {
  overview: true,
  interior: true,
  silos: true,
  milling: true,
  sifting: true,
  packing: true,
  'process-floor': true,
  'tank-farm': true,
  'logistics-close': true,
  forklift: true,
  shipping: true,
  receiving: true,
  yard: true,
  water: true,
  village: true,
  farm: true,
  paddock: true,
  square: true,
  garage: true,
  markings: true,
  forecourt: true,
  carpark: true,
  river: true,
  tunnel: true,
  huts: true,
  offices: true,
  canal: true,
  lake: true,
  busstop: true,
  'road-tunnel': true,
  castle: true,
  kiosk: true,
  sun: true,
  moon: true,
};

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
    expect(parseRuntimeMode('?benchmark=true&scene=process-floor').benchmarkScene).toBe(
      'process-floor'
    );
    expect(parseRuntimeMode('?benchmark=true&scene=tank-farm').benchmarkScene).toBe('tank-farm');
    expect(parseRuntimeMode('?benchmark=true&scene=logistics-close').benchmarkScene).toBe(
      'logistics-close'
    );
    expect(parseRuntimeMode('?benchmark=true&scene=village').benchmarkScene).toBe('village');
    expect(parseRuntimeMode('?benchmark=true&scene=farm').benchmarkScene).toBe('farm');
    // An unknown scene silently becomes `overview`, so a close camera that is
    // declared in siteLayout but missing from BENCHMARK_SCENES would produce
    // confidently mis-framed evidence rather than an error.
    expect(parseRuntimeMode('?benchmark=true&scene=paddock').benchmarkScene).toBe('paddock');
    expect(parseRuntimeMode('?benchmark=true&scene=square').benchmarkScene).toBe('square');
    expect(parseRuntimeMode('?benchmark=true&scene=garage').benchmarkScene).toBe('garage');
    expect(parseRuntimeMode('?benchmark=true&scene=sun').benchmarkScene).toBe('sun');
    expect(parseRuntimeMode('?benchmark=true&scene=moon').benchmarkScene).toBe('moon');
  });

  it.each(Object.keys(ALL_SCENES))('round-trips the %s benchmark scene', (scene) => {
    expect(parseRuntimeMode(`?benchmark=${scene}`).benchmarkScene).toBe(scene);
  });

  it('reads benchmark on/off like every other boolean flag', () => {
    expect(parseRuntimeMode('?benchmark=off').benchmark).toBe(false);
    expect(parseRuntimeMode('?benchmark=0').benchmark).toBe(false);
    expect(parseRuntimeMode('?benchmark=false').benchmark).toBe(false);
    expect(parseRuntimeMode('?benchmark=on&scene=yard')).toMatchObject({
      benchmark: true,
      benchmarkScene: 'yard',
    });
  });

  it('defaults moon review captures to midnight while preserving explicit time', () => {
    expect(parseRuntimeMode('?benchmark=true&scene=moon').gameTime).toBe(0);
    expect(parseRuntimeMode('?benchmark=true&scene=moon&time=12').gameTime).toBe(12);
    expect(parseRuntimeMode('?scene=moon').gameTime).toBe(12);
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
