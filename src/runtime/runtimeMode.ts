import type { GraphicsQuality } from '../stores/graphicsStore';

export type BenchmarkScene =
  | 'overview'
  | 'interior'
  | 'silos'
  | 'milling'
  | 'sifting'
  | 'packing'
  | 'personnel'
  | 'personnel-close'
  | 'personnel-feminine'
  | 'forklift'
  | 'shipping'
  | 'receiving'
  | 'yard'
  | 'water'
  | 'village'
  | 'farm'
  | 'garage'
  | 'sun'
  | 'moon';

export type RuntimeWeather = 'clear' | 'cloudy' | 'rain' | 'storm';
export type RuntimePAMode = 'focused' | 'characterful' | 'off';

export interface RuntimeMode {
  benchmark: boolean;
  benchmarkScene: BenchmarkScene;
  durationSeconds: number;
  quality: GraphicsQuality;
  gameTime: number;
  weather: RuntimeWeather;
  scadaEnabled: boolean;
  paMode: RuntimePAMode;
  motionCapture: boolean;
  /**
   * Art-review capture. Benchmark mode deliberately suppresses non-deterministic
   * visual work so frame samples stay comparable, but that also means evidence
   * screenshots omit effects the shipping build renders. Art mode keeps the fixed
   * cameras and deterministic simulation while restoring full visual fidelity, so
   * a screenshot review judges the image players actually see.
   */
  artMode: boolean;
  /**
   * Show the shipping operational interface over a fixed benchmark camera.
   * This is deliberately restricted to benchmark mode so a public query string
   * cannot change ordinary gameplay presentation.
   */
  operationalCapture: boolean;
}

const BENCHMARK_SCENES: ReadonlySet<string> = new Set<BenchmarkScene>([
  'overview',
  'interior',
  'silos',
  'milling',
  'sifting',
  'packing',
  'personnel',
  'personnel-close',
  'personnel-feminine',
  'forklift',
  'shipping',
  'receiving',
  'yard',
  'water',
  'village',
  'farm',
  'garage',
  'sun',
  'moon',
]);

const GRAPHICS_QUALITIES: ReadonlySet<string> = new Set<GraphicsQuality>([
  'low',
  'medium',
  'high',
  'ultra',
]);

const WEATHER_VALUES: ReadonlySet<string> = new Set<RuntimeWeather>([
  'clear',
  'cloudy',
  'rain',
  'storm',
]);
const PA_MODE_VALUES: ReadonlySet<string> = new Set<RuntimePAMode>([
  'focused',
  'characterful',
  'off',
]);

function finiteNumber(value: string | null, fallback: number, min: number, max: number): number {
  if (value === null || value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function setValue<T extends string>(
  value: string | null,
  allowed: ReadonlySet<string>,
  fallback: T
): T {
  return value !== null && allowed.has(value) ? (value as T) : fallback;
}

function booleanValue(value: string | null, fallback: boolean): boolean {
  if (value === null || value.trim() === '') return fallback;
  if (value === '1' || value === 'true' || value === 'on') return true;
  if (value === '0' || value === 'false' || value === 'off') return false;
  return fallback;
}

export function parseRuntimeMode(search: string): RuntimeMode {
  const params = new URLSearchParams(search);
  const benchmarkValue = params.get('benchmark');
  const benchmark = benchmarkValue !== null && benchmarkValue !== '0' && benchmarkValue !== 'false';
  const requestedScene =
    benchmarkValue && benchmarkValue !== '1' && benchmarkValue !== 'true'
      ? benchmarkValue
      : params.get('scene');

  return {
    benchmark,
    benchmarkScene: setValue<BenchmarkScene>(requestedScene, BENCHMARK_SCENES, 'overview'),
    durationSeconds: finiteNumber(params.get('duration'), 10, 2, 300),
    quality: setValue<GraphicsQuality>(params.get('quality'), GRAPHICS_QUALITIES, 'medium'),
    gameTime: finiteNumber(params.get('time'), 12, 0, 24),
    weather: setValue<RuntimeWeather>(params.get('weather'), WEATHER_VALUES, 'clear'),
    scadaEnabled: booleanValue(params.get('scada'), true),
    paMode: setValue<RuntimePAMode>(params.get('pa'), PA_MODE_VALUES, 'focused'),
    motionCapture: benchmark && booleanValue(params.get('motion'), false),
    artMode: booleanValue(params.get('art'), false),
    operationalCapture: benchmark && booleanValue(params.get('operations'), false),
  };
}

let cachedSearch: string | null = null;
let cachedMode: RuntimeMode | null = null;

export function getRuntimeMode(): RuntimeMode {
  const search = typeof window === 'undefined' ? '' : window.location.search;
  if (cachedMode === null || cachedSearch !== search) {
    cachedSearch = search;
    cachedMode = parseRuntimeMode(search);
  }
  return cachedMode;
}

export function isBenchmarkRuntime(): boolean {
  return getRuntimeMode().benchmark;
}
