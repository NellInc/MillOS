import type { GraphicsQuality } from '../stores/graphicsStore';

export type BenchmarkScene =
  | 'overview'
  | 'interior'
  | 'silos'
  | 'milling'
  | 'sifting'
  | 'packing'
  | 'process-floor'
  | 'tank-farm'
  | 'logistics-close'
  | 'forklift'
  | 'shipping'
  | 'receiving'
  | 'yard'
  | 'water'
  | 'village'
  | 'farm'
  | 'paddock'
  | 'square'
  | 'garage'
  | 'markings'
  | 'forecourt'
  | 'carpark'
  | 'river'
  | 'tunnel'
  | 'huts'
  | 'offices'
  | 'canal'
  | 'lake'
  | 'busstop'
  | 'road-tunnel'
  | 'castle'
  | 'kiosk'
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
  'process-floor',
  'tank-farm',
  'logistics-close',
  'forklift',
  'shipping',
  'receiving',
  'yard',
  'water',
  'village',
  'farm',
  // Close cameras on the generated farm and village assets; `village` and
  // `farm` frame the whole site and resolve them at a few pixels.
  'paddock',
  'square',
  'garage',
  // The ground safety markings. `test-results/pass6/painted-labels.mjs` puts the
  // six LIT ground labels at 38-197 m from the nearest camera that contains
  // them, and `pass6/label-contrast.mjs` found KEEP CLEAR parked behind a truck
  // in the one frame that does - so a marking whose whole job is to be legible
  // had never been looked at. Frustum containment is not visibility.
  'markings',
  // Review cameras for reported visual defects. A defect Nell can see and no
  // camera frames cannot be re-verified after the next edit, which is how the
  // same fault gets reported three times.
  'forecourt',
  'carpark',
  'river',
  // Sweep cameras (2026-09-02) for exterior features no benchmark camera had
  // ever framed: the tunnel portal, the Nissen huts, the office block, the
  // canal with its boat and lock, the lake with its picnic area, the bus stop,
  // and the kiosk cafe by the pond. See _contprompts/millos_visual_defect_sweep_2026-08-19.md.
  'tunnel',
  'huts',
  'offices',
  'canal',
  'lake',
  'busstop',
  // The truck road tunnels at each end of the valley, bored into the foothills.
  'road-tunnel',
  'castle',
  'kiosk',
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
  // Same vocabulary as every other flag: 0/false/off disable, 1/true/on enable
  // with `scene=`, and any other value names the scene to benchmark.
  const benchmark = benchmarkValue !== null && booleanValue(benchmarkValue, true);
  const requestedScene =
    benchmarkValue && benchmarkValue !== '1' && benchmarkValue !== 'true' && benchmarkValue !== 'on'
      ? benchmarkValue
      : params.get('scene');
  const benchmarkScene = setValue<BenchmarkScene>(requestedScene, BENCHMARK_SCENES, 'overview');
  // A moon review must default to a time when the moon is above the horizon.
  // An explicit time remains authoritative, including deliberate below-horizon
  // diagnostics, while every other route keeps the noon default.
  const defaultGameTime = benchmark && benchmarkScene === 'moon' ? 0 : 12;

  return {
    benchmark,
    benchmarkScene,
    durationSeconds: finiteNumber(params.get('duration'), 10, 2, 300),
    quality: setValue<GraphicsQuality>(params.get('quality'), GRAPHICS_QUALITIES, 'medium'),
    gameTime: finiteNumber(params.get('time'), defaultGameTime, 0, 24),
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
