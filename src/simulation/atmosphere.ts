import { toSimulationMinutes } from './simulationClock';

export type AtmosphereWeather = 'clear' | 'cloudy' | 'rain' | 'storm';

export interface AtmosphereState {
  readonly simulationMinutes: number;
  readonly solarAngle: number;
  readonly solarElevation: number;
  readonly daylight: number;
  readonly twilight: number;
  readonly cloudCoverage: number;
  readonly lightMultiplier: number;
  readonly wetness: number;
  /** Active precipitation rate. Unlike wetness, this is zero for damp overcast weather. */
  readonly precipitation: number;
  readonly wind: number;
  /**
   * `THREE.FogExp2` density, replacing the previous `fogNear` / `fogFar` pair.
   *
   * Linear fog ramps between two distances and then CLAMPS at 1.0, so with the
   * old clear-weather values (175 / 350) the site perimeter at radius 255 sat
   * on a fog factor of 0.46 and everything past 350 on a flat 1.0: the middle
   * distance converged to one blue-white wash and carried no depth at all.
   * Exponential-squared fog asymptotes instead - 0.23 at that same 255 - so
   * distant geometry keeps most of its own albedo and silhouettes separate.
   * The falloff shape, the height term and the far-plane guard live in
   * `shaders/atmosphericFog.ts`; this is only the weather's contribution.
   */
  readonly fogDensity: number;
}

export interface CelestialState {
  sunDirection: [number, number, number];
  moonDirection: [number, number, number];
  sunOpacity: number;
  moonOpacity: number;
  starOpacity: number;
  goldenHour: number;
  sunLightIntensity: number;
  moonLightIntensity: number;
  ambientLightIntensity: number;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const smoothstep = (edge0: number, edge1: number, value: number): number => {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

/**
 * The weather contribution, hoisted out of `sampleAtmosphere`.
 *
 * This table used to be an object literal *inside* the function, so every
 * single call built the whole thing - one outer object plus four nested ones -
 * and then read exactly one branch and threw the other four away. Five wasted
 * allocations per call, on a function four `useFrame` callbacks invoke every
 * frame. It is static data and never depended on the arguments; the only
 * reason it was inline was proximity to its use.
 */
const WEATHER_PROFILES = {
  clear: {
    cloudCoverage: 0.2,
    lightMultiplier: 1,
    wetness: 0,
    precipitation: 0,
    wind: 0.2,
    fogDensity: 0.002,
  },
  cloudy: {
    cloudCoverage: 0.52,
    lightMultiplier: 0.82,
    wetness: 0.08,
    precipitation: 0,
    wind: 0.36,
    fogDensity: 0.0027,
  },
  rain: {
    cloudCoverage: 0.74,
    lightMultiplier: 0.66,
    wetness: 0.82,
    precipitation: 0.62,
    wind: 0.58,
    fogDensity: 0.0039,
  },
  storm: {
    cloudCoverage: 0.9,
    lightMultiplier: 0.42,
    wetness: 1,
    precipitation: 1,
    wind: 0.92,
    fogDensity: 0.0054,
  },
} as const satisfies Record<
  AtmosphereWeather,
  Pick<
    AtmosphereState,
    'cloudCoverage' | 'lightMultiplier' | 'wetness' | 'precipitation' | 'wind' | 'fogDensity'
  >
>;

/**
 * Writable view of `AtmosphereState`, for reusable scratch buffers.
 * `AtmosphereState` itself stays fully `readonly` for consumers.
 */
export type MutableAtmosphereState = {
  -readonly [K in keyof AtmosphereState]: AtmosphereState[K];
};

/**
 * Allocate one atmosphere buffer, for callers that want to reuse it.
 * Mirrors `createCelestialState` below. Values are the clear-midnight zero
 * point and are fully overwritten by the first `sampleAtmosphere` call.
 */
export function createAtmosphereState(): MutableAtmosphereState {
  return {
    simulationMinutes: 0,
    solarAngle: 0,
    solarElevation: 0,
    daylight: 0,
    twilight: 0,
    cloudCoverage: WEATHER_PROFILES.clear.cloudCoverage,
    lightMultiplier: WEATHER_PROFILES.clear.lightMultiplier,
    wetness: WEATHER_PROFILES.clear.wetness,
    precipitation: WEATHER_PROFILES.clear.precipitation,
    wind: WEATHER_PROFILES.clear.wind,
    fogDensity: WEATHER_PROFILES.clear.fogDensity,
  };
}

/**
 * One deterministic atmosphere sample drives default sky, fog, light, water,
 * and weather-responsive materials. It only depends on simulation state.
 *
 * `target` follows the same opt-in convention as `sampleCelestial`: pass a
 * module-level scratch buffer from a `useFrame` callback to sample without
 * allocating, or omit it and get a fresh object.
 *
 * THE DEFAULT MUST STAY A FRESH OBJECT. Several callers hold more than one
 * sample alive at once and compare them against each other - see
 * `__tests__/atmosphere.test.ts`, which pins the dawn/noon/dusk/night solar
 * path by retaining four samples simultaneously, and asserts determinism with
 * `expect(sampleAtmosphere(...)).toEqual(sampleAtmosphere(...))`. Making a
 * shared buffer the default would collapse those four into one object and turn
 * the determinism assertion vacuously true - a silent loss of coverage, not a
 * visible failure. Reuse is per-call-site and opt-in for exactly that reason.
 */
export function sampleAtmosphere(
  day: number,
  hour: number,
  weather: AtmosphereWeather,
  target: MutableAtmosphereState = createAtmosphereState()
): AtmosphereState {
  const simulationMinutes = toSimulationMinutes({ day, hour });
  const normalizedHour = (simulationMinutes / 60) % 24;
  const solarAngle = ((normalizedHour - 6) / 24) * Math.PI * 2;
  const solarElevation = Math.sin(solarAngle);
  const daylight = smoothstep(-0.12, 0.28, solarElevation);
  const twilight =
    Math.exp(-Math.pow((normalizedHour - 6) / 1.8, 2)) +
    Math.exp(-Math.pow((normalizedHour - 18) / 1.8, 2));

  const profile = WEATHER_PROFILES[weather] ?? WEATHER_PROFILES.clear;

  target.simulationMinutes = simulationMinutes;
  target.solarAngle = solarAngle;
  target.solarElevation = solarElevation;
  target.daylight = daylight;
  target.twilight = twilight;
  target.cloudCoverage = profile.cloudCoverage;
  target.lightMultiplier = profile.lightMultiplier;
  target.wetness = profile.wetness;
  target.precipitation = profile.precipitation;
  target.wind = profile.wind;
  target.fogDensity = profile.fogDensity;
  return target;
}

/**
 * Derive every celestial visual and light from the same atmosphere sample.
 * The sun follows a tilted great-circle orbit, while the moon stays opposite
 * it to preserve the established twelve-hour day/night relationship.
 */
export function createCelestialState(): CelestialState {
  return {
    sunDirection: [0, 1, 0],
    moonDirection: [0, -1, 0],
    sunOpacity: 1,
    moonOpacity: 0,
    starOpacity: 0,
    goldenHour: 0,
    // Seeded at the clear-noon values `sampleCelestial` produces, so the very
    // first frame is already on the shipping key/fill ratio instead of easing
    // in from a flat one.
    sunLightIntensity: 3.1,
    moonLightIntensity: 0,
    ambientLightIntensity: 0.22,
  };
}

export function sampleCelestial(
  atmosphere: AtmosphereState,
  target: CelestialState = createCelestialState()
): CelestialState {
  const orbitX = Math.cos(atmosphere.solarAngle);
  const orbitY = atmosphere.solarElevation;
  const orbitZ = Math.cos(atmosphere.solarAngle) * 0.16;
  const inverseLength = 1 / Math.hypot(orbitX, orbitY, orbitZ);
  // Dawn enters from site east (+X); afternoon crosses the west and south
  // process glazing. Sky, water, IBL and shadows all use this common orbit.
  // Working if the afternoon key reaches -X and +Z and stays unit length.
  const azimuth = (50 * Math.PI) / 180;
  target.sunDirection[0] =
    (orbitX * Math.cos(azimuth) + orbitZ * Math.sin(azimuth)) * inverseLength;
  target.sunDirection[1] = orbitY * inverseLength;
  target.sunDirection[2] =
    (-orbitX * Math.sin(azimuth) + orbitZ * Math.cos(azimuth)) * inverseLength;
  target.moonDirection[0] = -target.sunDirection[0];
  target.moonDirection[1] = -target.sunDirection[1];
  target.moonDirection[2] = -target.sunDirection[2];

  const sunVisibility = smoothstep(-0.1, 0.04, atmosphere.solarElevation);
  const moonVisibility = 1 - smoothstep(-0.04, 0.18, atmosphere.solarElevation);
  const visualDaylight = clamp01(atmosphere.daylight * atmosphere.lightMultiplier);
  const clearSkyFactor = 1 - atmosphere.cloudCoverage * 0.82;
  const goldenHour =
    sunVisibility * (1 - smoothstep(0.08, 0.52, Math.max(0, atmosphere.solarElevation)));

  target.sunOpacity = sunVisibility * (1 - atmosphere.cloudCoverage * 0.42);
  target.moonOpacity = moonVisibility * (0.94 - atmosphere.cloudCoverage * 0.34);
  // Solar luminance, rather than weather-darkened world light, prevents
  // stars appearing at midday during a storm. Cloud cover still veils them.
  target.starOpacity = Math.pow(1 - atmosphere.daylight, 1.65) * 0.9 * clearSkyFactor;
  target.goldenHour = goldenHour;
  // KEY AND FILL ARE ONE DECISION, NOT TWO.
  //
  // These two lines used to read 1.84 and 0.76 at clear noon - a fill/key ratio
  // of 0.98, which is flat lighting: no modelling, no form, and no reason for a
  // shadow to exist even when the shadow pass is on. The sun is now the key at
  // 3.10 and the omnidirectional term is cut to 0.22, roughly 3.8:1 before the
  // hemisphere and the image-based environment are added, and about 4:1 after
  // (see `SceneEnvironmentIBL`, which contributes PI * radiance *
  // `scene.environmentIntensity` of diffuse irradiance to every standard
  // material). Anything that reads these numbers is reading a lighting ratio,
  // not an absolute brightness: `constants/colorGrade.ts` owns the exposure
  // that maps them to the display.
  target.sunLightIntensity = sunVisibility * (0.15 + visualDaylight * 2.95);
  target.moonLightIntensity = moonVisibility * (1 - atmosphere.daylight) * 0.28 * clearSkyFactor;
  target.ambientLightIntensity =
    0.06 + visualDaylight * 0.16 + moonVisibility * (1 - atmosphere.daylight) * 0.04;
  return target;
}
