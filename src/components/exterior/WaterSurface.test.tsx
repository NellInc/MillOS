import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import * as THREE from 'three';
import {
  UnifiedWaterSurfaceMaterial,
  WaterAnimationManager,
  WATER_RIPPLE_DETAIL,
  WATER_SKY_RADIANCE,
} from '../FactoryExterior';
import {
  WATER_FRESNEL_EXPONENT,
  WATER_FRESNEL_EXPONENT_FLAT,
  WATER_PROFILES,
  WATER_VISUAL_TIME,
  waterFresnel,
  WATER_WIND,
  applyWaterRipples,
  applyFountainFoam,
  WATER_CLOUD_COVER,
  WATER_CLOUD_TONE,
  WATER_SKY_DETAIL,
  WATER_SKY_DETAIL_PROFILE,
  WATER_BANK_DETAIL,
  WATER_BANK_PROFILE,
  WATER_NATURAL_PROFILE,
  WATER_NIGHT_PROFILE,
  naturalWaterBody,
  stillWaterDeepBody,
  waterBankReflection,
  waterDeckCoord,
  waterMirroredCloudWeight,
  waterNightSheen,
} from '../../utils/waterAppearance';
import { CANAL_OUTLET } from './canalOutletGeometry';
import { WATER_CRAFT_GAIN } from '../../utils/waterOptics';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useGraphicsStore } from '../../stores/graphicsStore';

const driver = vi.hoisted(() => ({
  frame: null as (() => void) | null,
  cleanups: [] as Array<() => void>,
  reduced: false,
  scene: null as THREE.Scene | null,
  phase: { current: { time: 0, previous: null as number | null, reduced: false } },
}));

vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useMemo: (factory: () => unknown) => factory(),
  useRef: (value: unknown) => (value === null ? { current: null } : driver.phase),
  useEffect: (effect: () => void | (() => void)) => {
    const cleanup = effect();
    if (cleanup) driver.cleanups.push(cleanup);
  },
}));
vi.mock('@react-three/fiber', async (original) => ({
  ...(await original<typeof import('@react-three/fiber')>()),
  useThree: () => ({ scene: driver.scene }),
  useFrame: (frame: () => void) => {
    driver.frame = frame;
  },
}));
vi.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => driver.reduced }));
vi.mock('../../utils/critterAudio', () => ({ playCritterSound: vi.fn() }));

const originalState = useGameSimulationStore.getState();
const material = (radial = false) => {
  const element = UnifiedWaterSurfaceMaterial({ radial }) as ReactElement<{
    object: THREE.ShaderMaterial;
  }>;
  return element.props.object;
};
const brightness = (color: THREE.Color) => color.r + color.g + color.b;

beforeEach(() => {
  driver.phase.current = { time: 0, previous: null, reduced: false };
  driver.reduced = false;
  driver.scene = new THREE.Scene();
  WATER_SKY_RADIANCE.value = 1;
  WATER_VISUAL_TIME.value = 0;
  WATER_WIND.value = 0.2;
  useGameSimulationStore.setState({
    gameDay: 1,
    gameTime: 12,
    weather: 'clear',
    isTabVisible: true,
  });
});
afterEach(() => {
  for (const cleanup of driver.cleanups.splice(0)) cleanup();
  useGameSimulationStore.setState(originalState);
  WATER_SKY_RADIANCE.value = 1;
});

describe('authored exterior water material and atmosphere driver', () => {
  it('keeps the real single-pass opaque, fogged material and bounded shoreline swell', () => {
    const water = material(true);
    expect(water.transparent).toBe(false);
    expect(water.depthWrite).toBe(true);
    expect(water.side).toBe(THREE.DoubleSide);
    expect(water.fog).toBe(true);
    expect(water.vertexShader).toContain(
      'displaced.z += vWave * uWaveHeight * windAmplitude * waveEnvelope'
    );
    expect(water.fragmentShader).toContain('float surfaceAlpha = 1.0');
    expect(water.uniforms.uTransmission.value).toBe(0);
    expect(water.fragmentShader).toContain('#include <fog_fragment>');
    expect(water.customProgramCacheKey()).toBe('millos-unified-water-v33');
    const dispose = vi.spyOn(water, 'dispose');
    for (const cleanup of driver.cleanups.splice(0)) cleanup();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('counter-crosses the weaker ripples while keeping the main train along the flow', () => {
    const lake = material(true);
    const canal = material(false);
    const cross = (water: THREE.ShaderMaterial) =>
      water.uniforms.uRippleB.value.dot(water.uniforms.uRippleC.value);
    expect(cross(lake)).toBeLessThan(0);
    expect(cross(canal)).toBeLessThan(0);
    for (const water of [lake, canal]) {
      for (const name of ['uRippleA', 'uRippleB', 'uRippleC']) {
        expect(water.uniforms[name].value.length()).toBeCloseTo(1);
      }
    }
  });

  it('drives actual noon, midnight and storm uniforms without a daylight overcast glow', () => {
    const water = material();
    WaterAnimationManager({});
    driver.frame!();
    const noon = brightness(water.uniforms.uSkyZenith.value);
    expect(water.uniforms.uDaylight.value).toBeGreaterThan(0.9);
    useGameSimulationStore.setState({ gameTime: 0 });
    driver.frame!();
    expect(water.uniforms.uDaylight.value).toBe(0);
    const night = brightness(water.uniforms.uSkyZenith.value);
    expect(night).toBeLessThan(noon * 0.05);
    useGameSimulationStore.setState({ weather: 'storm' });
    driver.frame!();
    expect(brightness(water.uniforms.uSkyZenith.value)).toBeCloseTo(night);
    expect(water.uniforms.uPrecipitation.value).toBeGreaterThan(0);
    expect(water.uniforms.uWetness.value).toBeGreaterThan(0);
  });

  it('freezes and resumes the current phase while weather uniforms stay live', () => {
    const water = material();
    WaterAnimationManager({});
    driver.frame!();
    useGameSimulationStore.setState({ gameTime: 12.1 });
    driver.frame!();
    const moving = water.uniforms.uTime.value;
    driver.reduced = true;
    WaterAnimationManager({});
    useGameSimulationStore.setState({ gameTime: 14, weather: 'storm' });
    driver.frame!();
    expect(water.uniforms.uTime.value).toBe(moving);
    expect(water.uniforms.uPrecipitation.value).toBeGreaterThan(0);
    driver.reduced = false;
    WaterAnimationManager({});
    useGameSimulationStore.setState({ gameTime: 15 });
    driver.frame!();
    expect(water.uniforms.uTime.value).toBe(moving);
    useGameSimulationStore.setState({ gameTime: 15.1 });
    driver.frame!();
    expect(water.uniforms.uTime.value - moving).toBeCloseTo(6 * 0.38);
  });
});

it('keeps falling-water detail opt-in and on the existing animation clock', () => {
  const ordinary = material();
  const sheet = (
    UnifiedWaterSurfaceMaterial({ falling: true }) as ReactElement<{ object: THREE.ShaderMaterial }>
  ).props.object;
  expect(ordinary.uniforms.uFalling).toBeUndefined();
  expect(sheet.uniforms.uFalling).toBeUndefined();
  expect(sheet.customProgramCacheKey()).toBe(ordinary.customProgramCacheKey());
  expect(sheet.defines).toEqual({ MILLOS_FALLING_WATER: 1 });
  expect(ordinary.defines).toEqual({});
  expect(sheet.fragmentShader).toContain('vWorldPosition.y * 12.0');
  WaterAnimationManager({});
  driver.frame?.();
  expect(sheet.uniforms.uTime.value).toBe(ordinary.uniforms.uTime.value);
});

it('uses both chain-rule terms for curved ripple reflections without adding texture samplers', () => {
  const water = material();
  expect(water.fragmentShader).toContain('gradientC * bendC');
  expect(water.fragmentShader).toContain('gradientA * bendA');
  expect(water.defines.MILLOS_WEIR_IMPACT).toBeUndefined();
  expect(water.fragmentShader).toContain(
    '#ifdef MILLOS_WEIR_IMPACT\n        uniform sampler2D uSceneReflection'
  );
});

it('keeps sub-metre counter-crossed ripples bounded and filtered in the actual water material', () => {
  const water = material();
  expect(water.uniforms.uRippleFinish).toBeUndefined();
  expect(water.fragmentShader).not.toContain('uRippleFinish');
  expect(water.fragmentShader).not.toContain('uRefined');
  expect(water.uniforms.uRippleB.value.dot(water.uniforms.uRippleC.value)).toBeLessThan(0);
  for (const name of ['uRippleB', 'uRippleC']) {
    expect(water.uniforms[name].value.length()).toBeCloseTo(1);
  }
  const flow = water.uniforms.uFlowDirection.value as THREE.Vector2;
  expect(water.uniforms.uRippleA.value.dot(flow)).toBeGreaterThan(0.98);
  expect(water.fragmentShader).toContain('const float frequencyA = 7.30');
  expect(water.fragmentShader).toContain('const float frequencyB = 11.70');
  expect(water.fragmentShader).toContain('fwidth(phaseA), fwidth(phaseB), fwidth(phaseC)');
  expect(water.fragmentShader).toContain('rippleFilter.x * 0.0048');
  expect(water.fragmentShader).toContain('#ifdef MILLOS_FALLING_WATER');
  expect(Object.values(water.uniforms).some((u) => u.value?.isTexture)).toBe(false);
  expect((2 * Math.PI) / 7.3).toBeLessThan(1);
  expect((2 * Math.PI) / 11.7).toBeLessThan(0.6);
});

it('reuses the actual displayed sky colours while retaining the staged-load fallback', () => {
  const water = material();
  WaterAnimationManager({});
  driver.frame!();
  const legacyZenith = water.uniforms.uSkyZenith.value.clone();
  const sky = new THREE.ShaderMaterial({
    uniforms: {
      topColor: { value: new THREE.Color('#2f5ea0') },
      horizonColor: { value: new THREE.Color('#7186ad') },
    },
  });
  const dome = new THREE.Mesh(new THREE.BufferGeometry(), sky);
  dome.name = 'analytic-sky-dome';
  driver.scene!.add(dome);
  driver.frame!();
  water.uniforms.uSkyZenith.value
    .toArray()
    .forEach((channel: number, i: number) =>
      expect(channel).toBeCloseTo(sky.uniforms.topColor.value.toArray()[i], 12)
    );
  water.uniforms.uSkyHorizon.value
    .toArray()
    .forEach((channel: number, i: number) =>
      expect(channel).toBeCloseTo(sky.uniforms.horizonColor.value.toArray()[i], 12)
    );
  expect(water.uniforms.uSkyRadiance).toBe(WATER_SKY_RADIANCE);
  WATER_SKY_RADIANCE.value = 0;
  driver.frame!();
  expect(water.uniforms.uSkyZenith.value.equals(legacyZenith)).toBe(true);
  driver.scene!.remove(dome);
  sky.dispose();
  dome.geometry.dispose();
});

it('lights the body before reflection, with no second night attenuation in the finish arm', () => {
  const water = material();
  expect(water.fragmentShader.indexOf('depth) * bodyLight')).toBeLessThan(
    water.fragmentShader.indexOf('colour = mix(colour, reflectionColour * bankShade, reflectance)')
  );
  expect(water.fragmentShader).toContain('mix(illumination, 1.0, uSkyRadiance)');
  expect(water.fragmentShader).toContain('uReflection * bodyLight');
  // At midnight the water body remains subdued while sky radiance keeps its
  // authored value. The falling sheet is diffuse and keeps the original scale.
  const illumination = 0.08;
  const finalScale = (finish: number) => illumination * (1 - finish) + finish;
  expect(illumination * finalScale(0)).toBeCloseTo(0.0064);
  expect(illumination * finalScale(1)).toBe(illumination);
});

it('reflects the actual settled sky afterglow and its runtime isolation strength', () => {
  const water = material();
  const sky = new THREE.ShaderMaterial({
    uniforms: {
      uAfterglow: { value: 0.6 },
      uSkyAfterglowStrength: { value: 1 },
      uAfterglowColor: { value: new THREE.Color('#ff9858') },
    },
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 4, 4), sky);
  dome.name = 'analytic-sky-dome';
  driver.scene!.add(dome);
  WaterAnimationManager({});
  driver.frame!();
  expect(water.uniforms.uAfterglow.value).toBe(0.6);
  expect(water.uniforms.uAfterglowColour.value.equals(sky.uniforms.uAfterglowColor.value)).toBe(
    true
  );
  sky.uniforms.uSkyAfterglowStrength.value = 0;
  driver.frame!();
  expect(water.uniforms.uAfterglow.value).toBe(0);
  expect(water.fragmentShader).toContain('sunwardReflection');
  dome.geometry.dispose();
  sky.dispose();
});

it('delivers distinct calmness in the real material, with the canal quieter than the river', () => {
  const waters = Object.keys(WATER_PROFILES).map((kind) => {
    const key = kind as keyof typeof WATER_PROFILES;
    const water = (
      UnifiedWaterSurfaceMaterial({ kind: key }) as ReactElement<{ object: THREE.ShaderMaterial }>
    ).props.object;
    const profile = WATER_PROFILES[key];
    expect(water.uniforms.uFlowSpeed.value).toBe(profile.speed);
    expect(water.uniforms.uWaveHeight.value).toBe(profile.waveHeight);
    expect(water.uniforms.uRippleStrength.value).toBe(profile.rippleStrength);
    expect(water.uniforms.uRoughness.value).toBe(profile.roughness);
    expect(water.uniforms.uShoreFoam.value).toBe(profile.shoreFoam);
    return water;
  });
  for (const field of ['speed', 'waveHeight', 'rippleStrength'] as const) {
    expect(WATER_PROFILES.canal[field]).toBeLessThan(WATER_PROFILES.river[field]);
    expect(WATER_PROFILES.pond[field]).toBeLessThan(WATER_PROFILES.canal[field]);
    expect(WATER_PROFILES.lake[field]).toBeLessThan(WATER_PROFILES.river[field]);
  }
  expect(WATER_PROFILES.pond.waveHeight).toBeLessThanOrEqual(0.001);
  for (const key of ['canal', 'lake', 'pond'] as const)
    expect(WATER_PROFILES[key].shoreFoam).toBe(0);
  expect(waters[0].fragmentShader).toContain('0.02 + fresnel * 0.98');
  expect(waters[0].fragmentShader).toContain('length(fwidth(slope))');
});

it('keeps retained water and froth in the standard lit pipeline without new samplers or emission', () => {
  for (const apply of [applyWaterRipples, applyFountainFoam]) {
    const host = new THREE.MeshStandardMaterial({ transparent: true, depthWrite: false });
    apply(host);
    const shader = {
      uniforms: {},
      vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader,
    } as THREE.WebGLProgramParametersWithUniforms;
    host.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(shader.fragmentShader).toContain('#include <lights_fragment_begin>');
    // Reproduced in the native GPU compiler: GLSL uniforms and functions share a namespace.
    expect(shader.fragmentShader).not.toMatch(/uniform\s+\w+\s+millosWaterSlope\b/);
    expect(shader.fragmentShader).toContain('#include <fog_fragment>');
    expect(shader.fragmentShader).toContain('#include <tonemapping_fragment>');
    expect(host.transparent).toBe(true);
    expect(host.depthWrite).toBe(false);
    expect(host.metalness).toBe(0);
    expect(host.emissive.getHex()).toBe(0);
    expect(Object.values(shader.uniforms).some((u) => u.value?.isTexture)).toBe(false);
    const key = host.customProgramCacheKey();
    WATER_VISUAL_TIME.value += 1;
    expect(host.customProgramCacheKey()).toBe(key);
    host.dispose();
  }
});

it('shares the live weather and paused visual phase with the retained water', () => {
  material();
  WaterAnimationManager({});
  driver.frame!();
  expect(WATER_VISUAL_TIME.value).toBe(driver.phase.current.time);
  useGameSimulationStore.setState({ weather: 'storm' });
  driver.frame!();
  expect(WATER_WIND.value).toBeGreaterThan(0.2);
});

it('compiles shore foam only for water that actually carries it, preserving the weather field', () => {
  for (const kind of Object.keys(WATER_PROFILES) as Array<keyof typeof WATER_PROFILES>) {
    const water = (
      UnifiedWaterSurfaceMaterial({ kind }) as ReactElement<{ object: THREE.ShaderMaterial }>
    ).props.object;
    expect(water.defines).toEqual(kind === 'river' ? { MILLOS_SHORE_FOAM: 1 } : {});
    expect(water.fragmentShader).toContain('if (uPrecipitation > 0.0)');
    expect(water.fragmentShader).toContain('sin(rainDistance * 46.0 - uTime * 2.1)');
    expect(water.fragmentShader.indexOf('#ifdef MILLOS_SHORE_FOAM')).toBeLessThan(
      water.fragmentShader.indexOf('float foamBand')
    );
    // Falling and reflection branches share the existing final lighting/fog.
    expect(water.fragmentShader.indexOf('#ifdef MILLOS_FALLING_WATER')).toBeLessThan(
      water.fragmentShader.indexOf('vec2 waterCoord')
    );
  }
});

// water (700,590)-(1930,1070) and the village canal (1950,560)-(2560,1440),
// final-med-12: flat dark-centre gradients. Schlick's fifth power leaves 12% sky
// at a 20 degree view, the zenith-weighted sky made that sky the water's own
// blue, and a 0.009 slope moved neither. The mix toward the sky must be read
// at the angles a site camera actually sees water from.
it('weights the sky by a Fresnel that still reads at site-camera grazing angles', () => {
  expect(waterFresnel(1)).toBeCloseTo(0.02, 3);
  const steep = waterFresnel(Math.sin(THREE.MathUtils.degToRad(40)));
  const grazing = waterFresnel(Math.sin(THREE.MathUtils.degToRad(20)));
  expect(grazing).toBeGreaterThanOrEqual(0.25);
  expect(grazing).toBeGreaterThan(steep * 1.6);
  expect(waterFresnel(0)).toBeLessThanOrEqual(0.95);
  const water = material();
  expect(water.fragmentShader).toContain(
    `mix(${WATER_FRESNEL_EXPONENT_FLAT.toFixed(1)}, ${WATER_FRESNEL_EXPONENT.toFixed(1)}, uRippleDetail)`
  );
  expect(water.fragmentShader).toContain(
    'mix(uSkyHorizon, uSkyZenith, clamp(reflected.y, 0.0, 1.0))'
  );
});

// water, final-low-12 against base-low-12 (blind A/B): the Low pond lost its
// deep centre and read as a pale sheet. The cubic stands in for the metre-scale
// ripple's tilted normals; Low never draws that ripple, so at the water camera's
// ~23 degree view the unbroken cubic still put 23% sky over the whole body,
// against 8% before. A flat mirror keeps the physical fifth power.
it('keeps a deep-water read on Low, where no metre-scale ripple breaks the reflection', () => {
  const view = Math.sin(THREE.MathUtils.degToRad(23));
  expect(waterFresnel(view, 0)).toBeLessThanOrEqual(0.12);
  expect(waterFresnel(view, 1)).toBeCloseTo(waterFresnel(view), 6);
  expect(waterFresnel(view, 1)).toBeGreaterThan(waterFresnel(view, 0) * 2);
  expect(WATER_FRESNEL_EXPONENT_FLAT).toBe(5);
  const water = material();
  expect(water.fragmentShader).toContain(
    `mix(${WATER_FRESNEL_EXPONENT_FLAT.toFixed(1)}, ${WATER_FRESNEL_EXPONENT.toFixed(1)}, uRippleDetail)`
  );
  expect(water.customProgramCacheKey()).toBe('millos-unified-water-v33');
});

// final4-med-12 rubric: the pond is a saturated cyan and reflects nothing of
// its bank. Round 5 moved the body to olive and painted the far bank as a flat
// olive-green tone; final5-med-06, 18:30 and 22:00 water read a flat teal band
// along the far shore over a darker, muddier body. The body is now a muted
// blue-green (not cyan, not olive) and the bank is a soft darkening of the
// reflected sky that keeps its hue and clouds, with a ragged silhouette. Low
// keeps its body and sky exactly (uRippleDetail branch); each term has a zero
// control.
it('gives still water a natural body and a soft far-bank darkening on Medium only', () => {
  const lake = UnifiedWaterSurfaceMaterial({
    kind: 'lake',
    radial: true,
    bankRadii: [19, 14],
  }) as ReactElement<{ object: THREE.ShaderMaterial }>;
  const water = lake.props.object;
  expect(water.uniforms.uNaturalBody.value).toBe(WATER_NATURAL_PROFILE.weight);
  expect(water.uniforms.uBankDetail).toBe(WATER_BANK_DETAIL);
  expect(water.uniforms.uBankRadii.value.toArray()).toEqual([19, 14]);
  const shader = water.fragmentShader;
  expect(shader).toContain('if (uRippleDetail > 0.0 && uNaturalBody > 0.0)');
  expect(shader).toContain('if (uRippleDetail > 0.0 && uBankDetail > 0.0 && uBankRadii.x > 0.0)');
  expect(shader).toContain('float bankHit');
  // No constant bank colour replaces the sky: the band printed flat teal.
  expect(shader).not.toContain('mix(skyColour, bankTone');
  expect(shader).not.toContain('bankTone');
  expect(shader).toContain(`mix(1.0, ${WATER_BANK_PROFILE.shade.toFixed(2)}, bankHit)`);
  // The fixed damp margin takes the same natural shift as the body.
  expect(shader).toContain('margin = millosNaturalWater(margin)');
  // Rivers keep their authored body; an unbounded plane has no bank.
  const river = (
    UnifiedWaterSurfaceMaterial({ kind: 'river' }) as ReactElement<{
      object: THREE.ShaderMaterial;
    }>
  ).props.object;
  expect(river.uniforms.uNaturalBody.value).toBe(0);
  expect(river.uniforms.uBankRadii.value.x).toBe(0);
  // CPU mirror of the body shift: same luminance, much less saturation, and a
  // blue-green hue between round 5's olive (about 160) and the authored cyan
  // (about 200).
  const luma = (c: THREE.Color) => c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
  const spread = (c: THREE.Color) => Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
  const hue = (c: THREE.Color) => c.getHSL({ h: 0, s: 0, l: 0 }).h * 360;
  for (const hex of ['#153747', '#3f7f8c', '#173f4a', '#2d6670']) {
    const before = new THREE.Color(hex);
    const after = naturalWaterBody(before.clone(), WATER_NATURAL_PROFILE.weight);
    expect(luma(after)).toBeCloseTo(luma(before), 6);
    expect(spread(after)).toBeLessThan(spread(before) * 0.75);
    expect(hue(after)).toBeGreaterThan(172);
    expect(hue(after)).toBeLessThan(hue(before) - 5);
  }
  // The bank darkens the reflected sky without changing its hue.
  for (const sky of [new THREE.Color(0.4, 0.55, 0.8), new THREE.Color(0.6, 0.35, 0.3)]) {
    const banked = waterBankReflection(sky.clone(), 1);
    expect(banked.r / banked.b).toBeCloseTo(sky.r / sky.b, 6);
    expect(banked.g / banked.b).toBeCloseTo(sky.g / sky.b, 6);
    expect(luma(banked)).toBeCloseTo(luma(sky) * WATER_BANK_PROFILE.shade, 6);
    expect(waterBankReflection(sky.clone(), 0).equals(sky)).toBe(true);
  }
  // Soft and ragged: the ramp spans more than the bank's own height, and a
  // finer reed term breaks the line.
  const [rampStart, rampEnd] = WATER_BANK_PROFILE.ramp;
  expect(rampEnd - rampStart).toBeGreaterThan(1.2);
  expect(WATER_BANK_PROFILE.reedVariation).toBeGreaterThan(0.2);
  expect(shader).toContain(`shorePoint * ${WATER_BANK_PROFILE.reedScale.toFixed(1)}`);
  // From the water camera the reflected ray rises about 0.45 m per metre, so a
  // bank of bankMetres shows as a band of a couple of metres along the far shore.
  const camera = new THREE.Vector3(...SITE_LAYOUT.cameras.water.position);
  const target = new THREE.Vector3(...SITE_LAYOUT.cameras.water.target);
  const rise = (camera.y - target.y) / Math.hypot(camera.x - target.x, camera.z - target.z);
  expect(WATER_BANK_PROFILE.bankMetres / rise).toBeGreaterThan(1.5);
  expect(WATER_BANK_DETAIL.value).toBe(1);
  expect(water.customProgramCacheKey()).toBe('millos-unified-water-v33');
});

// final5-med-22 water: a near-black centre. Steep views reflect the zenith,
// which at night is nearly black, over a body lit at 14%. Still water now
// keeps a floor of the night horizon's glow, Medium only, from 19:00 on.
it('keeps a faint night-sky sheen on still water after dark', () => {
  const at = (daylight: number) => waterNightSheen(daylight);
  expect(at(1)).toBe(0);
  expect(at(0.5)).toBe(0);
  expect(at(0.233)).toBeLessThan(WATER_NIGHT_PROFILE.floor * 0.2);
  expect(at(0.046)).toBeGreaterThan(WATER_NIGHT_PROFILE.floor * 0.8);
  expect(at(0)).toBe(WATER_NIGHT_PROFILE.floor);
  expect(WATER_NIGHT_PROFILE.floor).toBeGreaterThan(0.08);
  expect(WATER_NIGHT_PROFILE.floor).toBeLessThan(0.3);
  const lake = (
    UnifiedWaterSurfaceMaterial({ kind: 'lake', radial: true }) as ReactElement<{
      object: THREE.ShaderMaterial;
    }>
  ).props.object;
  expect(lake.fragmentShader).toContain('float nightSheen');
  expect(lake.fragmentShader).toContain('reflectance = max(reflectance, nightSheen)');
});

// final5-med-12 village: the canal is a flat deep-blue gradient. Its body kept
// the authored teal-blue, it had no bank, and the mirrored cloud deck was a
// function of the reflected DIRECTION alone, which barely turns along a 12 m
// canal seen from 70-150 m: one uniform patch of deck. A finite-height deck
// also moves with the reflection point, so clouds pass along its 220 m. The
// canal takes the natural body and reflects its walls as straight banks.
it('gives the canal the natural body, wall reflection and a cloud deck that moves along it', () => {
  const canal = (
    UnifiedWaterSurfaceMaterial({
      kind: 'canal',
      crossOnly: true,
      bankRadii: [5.5, 110],
    }) as ReactElement<{ object: THREE.ShaderMaterial }>
  ).props.object;
  expect(canal.uniforms.uNaturalBody.value).toBe(WATER_NATURAL_PROFILE.weight);
  expect(canal.uniforms.uBankRadii.value.toArray()).toEqual([5.5, 110]);
  // Straight walls: a slab across U, not the inscribed ellipse.
  expect(canal.fragmentShader).toContain('if (uCrossOnly > 0.5)');
  const deckK = WATER_SKY_DETAIL_PROFILE.deckScale / WATER_SKY_DETAIL_PROFILE.deckHeightMetres;
  expect(canal.fragmentShader).toContain(`waterCoord * ${deckK.toFixed(4)}`);
  const ray = new THREE.Vector3(0.3, 0.45, -0.84).normalize();
  const near = waterDeckCoord(ray, -145, 40);
  const far = waterDeckCoord(ray, -145, -60);
  // 100 m along the canal crosses more than one deck cell...
  expect(near.distanceTo(far)).toBeGreaterThan(1.2);
  // ...while across the 40 m lake the pattern shifts by well under one.
  expect(waterDeckCoord(ray, 100, 120).distanceTo(waterDeckCoord(ray, 140, 120))).toBeLessThan(0.8);
  // A cloud deck a few hundred metres up.
  expect(WATER_SKY_DETAIL_PROFILE.deckHeightMetres).toBeGreaterThanOrEqual(150);
  expect(WATER_SKY_DETAIL_PROFILE.deckHeightMetres).toBeLessThanOrEqual(400);
});

it('adds a faint metre-scale ripple normal that freezes with the water clock and drops on Low', () => {
  const water = material();
  expect(water.uniforms.uRippleDetail).toBe(WATER_RIPPLE_DETAIL);
  expect(water.fragmentShader).toContain('if (uRippleDetail > 0.0)');
  expect(water.fragmentShader).toContain('uTime * uFlowSpeed');
  const previous = useGraphicsStore.getState().graphics.quality;
  WaterAnimationManager({});
  useGraphicsStore.setState((state) => ({ graphics: { ...state.graphics, quality: 'low' } }));
  driver.frame!();
  expect(WATER_RIPPLE_DETAIL.value).toBe(0);
  useGraphicsStore.setState((state) => ({ graphics: { ...state.graphics, quality: 'medium' } }));
  driver.frame!();
  expect(WATER_RIPPLE_DETAIL.value).toBe(1);
  useGraphicsStore.setState((state) => ({ graphics: { ...state.graphics, quality: previous } }));
  expect(water.customProgramCacheKey()).toBe(water.customProgramCacheKey());
});

// water, final3-med-12: the lake read as a plain gradient. From the water
// camera the sky weight is already ~23% (cubic Fresnel at a 23 degree view),
// but the only sky structure was a band keyed to the reflected DIRECTION,
// which turns through about half a period across the whole lake, and the
// metre ripple moved it by a few percent of that: one uniform sky over the
// body gradient. A reflected ray projected onto a cloud deck sweeps several
// noise cells across the same lake, so mirrored cloud and its ripple wobble
// resolve; gust patches add the lighter cat's-paw streaks.
it('mirrors a cloud deck and gust patches across the lake on Medium, exact on Low and when off', () => {
  const water = material(true);
  expect(water.uniforms.uSkyDetail).toBe(WATER_SKY_DETAIL);
  expect(water.uniforms.uCloudCover).toBe(WATER_CLOUD_COVER);
  expect(water.uniforms.uCloudTone).toBe(WATER_CLOUD_TONE);
  const shader = water.fragmentShader;
  expect(shader).toContain('if (uRippleDetail > 0.0 && uSkyDetail > 0.0)');
  // final4-med-12 water: the deck's max(reflected.y, 0.12) floor was a kink
  // in the mapping that printed as a hard diagonal edge on the mirrored cloud.
  // The mapping is now smooth, and the cloud ramp wide and its weight lower.
  expect(shader).not.toContain('max(reflected.y, 0.12)');
  expect(shader).toContain(
    `reflected.xz / (reflected.y + ${WATER_SKY_DETAIL_PROFILE.deckLift.toFixed(2)})`
  );
  const [cloudLow, cloudHigh] = WATER_SKY_DETAIL_PROFILE.cloud;
  expect(cloudHigh - cloudLow).toBeGreaterThanOrEqual(0.4);
  expect(WATER_SKY_DETAIL_PROFILE.cloudWeight).toBeLessThanOrEqual(0.4);
  expect(shader).toContain('fresnel * 0.98 + pawSky');
  // Deck cells swept between the lake's near and far shore on the camera's line.
  const camera = new THREE.Vector3(...SITE_LAYOUT.cameras.water.position);
  const lake = SITE_LAYOUT.exteriorFeatures.lake;
  const towardLake = new THREE.Vector2(lake.position[0] - camera.x, lake.position[2] - camera.z);
  const along = towardLake.clone().normalize();
  const deckCell = (offset: number) => {
    const point = new THREE.Vector2(lake.position[0], lake.position[2]).addScaledVector(
      along,
      offset
    );
    const reach = point.distanceTo(new THREE.Vector2(camera.x, camera.z));
    const ray = new THREE.Vector2(reach, camera.y - 0.15).normalize();
    return (
      (ray.x / (ray.y + WATER_SKY_DETAIL_PROFILE.deckLift)) * WATER_SKY_DETAIL_PROFILE.deckScale
    );
  };
  const halfDepth = lake.size[1] / 2;
  expect(deckCell(halfDepth) - deckCell(-halfDepth)).toBeGreaterThan(1.5);
  // The direction-only band's phase changes by under one period on the same line.
  const reflectedX = (offset: number) => {
    const point = new THREE.Vector2(lake.position[0], lake.position[2]).addScaledVector(
      along,
      offset
    );
    const ray = new THREE.Vector3(
      point.x - camera.x,
      camera.y - 0.15,
      point.y - camera.z
    ).normalize();
    return ray.x * 8 + ray.z * 5;
  };
  expect(Math.abs(reflectedX(halfDepth) - reflectedX(-halfDepth))).toBeLessThan(Math.PI * 2);
  // The frame driver hands the deck the displayed sky's cover and cloud colour.
  const sky = new THREE.ShaderMaterial({
    uniforms: {
      topColor: { value: new THREE.Color('#2f5ea0') },
      horizonColor: { value: new THREE.Color('#7186ad') },
      cloudAmount: { value: 0.61 },
      uCloudLit: { value: new THREE.Color('#d0d4d8') },
    },
  });
  const dome = new THREE.Mesh(new THREE.BufferGeometry(), sky);
  dome.name = 'analytic-sky-dome';
  driver.scene!.add(dome);
  WaterAnimationManager({});
  driver.frame!();
  expect(WATER_CLOUD_COVER.value).toBeCloseTo(0.61, 6);
  expect(WATER_CLOUD_TONE.value.getHexString()).toBe('d0d4d8');
  driver.scene!.remove(dome);
  sky.dispose();
  dome.geometry.dispose();
  expect(WATER_SKY_DETAIL.value).toBe(1);
  expect(water.customProgramCacheKey()).toBe('millos-unified-water-v33');
});

// final6-med-12 water: a white glare band along the lake's far bank and a dark
// smudge at its centre. Both are the mirrored cloud deck at the lake's own
// scale: at 0.38 of the sky colour, cloud-lit water beside the cloud-free
// centre measured 92 against 74 sRGB luma (round 5: 84 against 81), and next
// to the far shore, where Fresnel is highest, the deck printed near-white
// clouds through the bank's reflection. The bank now occludes the mirrored
// cloud as well as darkening the sky, and on a bounded radial surface (lake,
// ponds) the deck is half as strong. The canal crosses many deck cells along
// its 220 m and keeps its weight.
it('keeps mirrored cloud off the far bank and soft across a lake, the canal unchanged', () => {
  const make = (props: Parameters<typeof UnifiedWaterSurfaceMaterial>[0]) =>
    (UnifiedWaterSurfaceMaterial(props) as ReactElement<{ object: THREE.ShaderMaterial }>).props
      .object;
  const lake = make({ kind: 'lake', radial: true, bankRadii: [19, 14] });
  const shader = lake.fragmentShader;
  // The bank is resolved before the deck, and the deck takes it.
  expect(shader.indexOf('float bankHit')).toBeLessThan(shader.indexOf('float mirrored'));
  expect(shader).toContain('* (1.0 - bankHit)');
  const { cloudWeight, radialCloudWeight } = WATER_SKY_DETAIL_PROFILE;
  expect(shader).toContain(
    `mix(${cloudWeight.toFixed(2)}, ${radialCloudWeight.toFixed(2)}, uRadial)`
  );
  // CPU mirror: no cloud where the bank stands, half on a lake, full on the canal.
  expect(waterMirroredCloudWeight(1, true)).toBe(0);
  expect(waterMirroredCloudWeight(1, false)).toBe(0);
  expect(waterMirroredCloudWeight(0, false)).toBe(cloudWeight);
  expect(waterMirroredCloudWeight(0, true)).toBe(radialCloudWeight);
  expect(radialCloudWeight).toBeLessThanOrEqual(cloudWeight * 0.55);
  expect(radialCloudWeight).toBeGreaterThan(0.1);
  // The swing a full mirrored cloud adds to the noon sky reflection, as a
  // fraction of that reflection, stays small on the lake.
  const luma = (c: THREE.Color) => c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
  const sky = new THREE.Color('#a3cce2').lerp(new THREE.Color('#70aed8'), 0.45);
  const cloud = new THREE.Color('#f4f6f2');
  const swing = (weight: number) => (luma(sky.clone().lerp(cloud, weight)) - luma(sky)) / luma(sky);
  expect(swing(cloudWeight)).toBeGreaterThan(0.25);
  expect(swing(waterMirroredCloudWeight(0, true))).toBeLessThan(swing(cloudWeight) * 0.55);
  // Canal and river keep the deck's full weight (uRadial 0).
  expect(
    make({ kind: 'canal', crossOnly: true, bankRadii: [5.5, 110] }).uniforms.uRadial.value
  ).toBe(0);
  expect(lake.uniforms.uRadial.value).toBe(1);
  expect(lake.customProgramCacheKey()).toBe('millos-unified-water-v33');
});

// land7-med-12 water: with the glare softened, the lake centre still reads as a
// dark smudge, sRGB luma 74 against 88 beside it (round 5: 82 against 83). The
// deep body is #143b48, a sixth of the shallows' luminance, so the fully deep
// core sits apart from everything on the depth ramp around it. On Medium the
// still-water deep end is lifted toward the shallows by `deepLift`, at the
// body's own blue-green; Low and the river keep the authored deep exactly.
it('lifts the still-water deep body toward the shallows on Medium, keeping its hue', () => {
  const lake = (
    UnifiedWaterSurfaceMaterial({
      kind: 'lake',
      radial: true,
      bankRadii: [19, 14],
    }) as ReactElement<{
      object: THREE.ShaderMaterial;
    }>
  ).props.object;
  const shader = lake.fragmentShader;
  const { deepLift } = WATER_NATURAL_PROFILE;
  expect(shader).toContain(`deepBody = mix(uDeep, uShallow, ${deepLift.toFixed(2)})`);
  expect(shader).toContain('mix(uShallow, deepBody, depth) * bodyLight');
  // Gated on the Medium still-water branch, so Low and the river are unchanged.
  const gate = shader.lastIndexOf(
    'if (uRippleDetail > 0.0 && uNaturalBody > 0.0)',
    shader.indexOf('deepBody = mix(')
  );
  expect(gate).toBeGreaterThan(shader.indexOf('vec3 deepBody = uDeep;'));
  // CPU mirror on the lake's authored pair.
  const deep = new THREE.Color('#143b48');
  const shallow = new THREE.Color('#4a8790');
  const luma = (c: THREE.Color) => c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
  const hue = (c: THREE.Color) => c.getHSL({ h: 0, s: 0, l: 0 }).h * 360;
  const before = naturalWaterBody(deep.clone(), WATER_NATURAL_PROFILE.weight);
  const after = naturalWaterBody(
    stillWaterDeepBody(deep.clone(), shallow),
    WATER_NATURAL_PROFILE.weight
  );
  // A real lift (at least 1.8x the core's luminance), still well below the shallows.
  expect(luma(after)).toBeGreaterThan(luma(before) * 1.8);
  expect(luma(after)).toBeLessThan(luma(shallow) * 0.5);
  // Still blue-green: the hue stays inside the natural body's band.
  expect(hue(after)).toBeGreaterThan(172);
  expect(hue(after)).toBeLessThan(200);
  // It moves only toward the shallows' own hue, which the rim already shows.
  const rim = naturalWaterBody(shallow.clone(), WATER_NATURAL_PROFILE.weight);
  expect(hue(after)).toBeLessThan(hue(before));
  expect(hue(after)).toBeGreaterThan(hue(rim));
  expect(deepLift).toBeGreaterThan(0);
  expect(deepLift).toBeLessThanOrEqual(0.3);
  expect(lake.customProgramCacheKey()).toBe('millos-unified-water-v33');
});

it('opts only the receiving river into the shared weir landing and local hydraulic finish', () => {
  const make = (props: Parameters<typeof UnifiedWaterSurfaceMaterial>[0]) =>
    (UnifiedWaterSurfaceMaterial(props) as ReactElement<{ object: THREE.ShaderMaterial }>).props
      .object;
  const ordinary = make({ kind: 'river' });
  const sheet = make({ kind: 'river', falling: true });
  const receiving = make({ kind: 'river', weirImpact: true });
  expect(receiving.defines).toEqual({ MILLOS_SHORE_FOAM: 1, MILLOS_WEIR_IMPACT: 1 });
  expect(ordinary.defines).toEqual({ MILLOS_SHORE_FOAM: 1 });
  expect(sheet.defines).toEqual({ MILLOS_FALLING_WATER: 1 });
  expect(receiving.uniforms.uWeirImpact.value.toArray()).toEqual([
    CANAL_OUTLET.east - CANAL_OUTLET.width / 2,
    CANAL_OUTLET.north - 0.035,
    CANAL_OUTLET.width / 2,
    5,
  ]);
  expect(receiving.uniforms.uWeirFinish.value).toBe(1);
  expect(sheet.uniforms.uWeirFinish.value).toBe(1);
  expect(ordinary.uniforms.uWeirFinish.value).toBe(0);
  expect(Object.values(receiving.uniforms).some((u) => u.value?.isTexture)).toBe(false);
});

it('filters hydraulic detail and keeps it on the existing frozen clock and Low branch', () => {
  const receiving = (
    UnifiedWaterSurfaceMaterial({ kind: 'river', weirImpact: true }) as ReactElement<{
      object: THREE.ShaderMaterial;
    }>
  ).props.object;
  expect(receiving.fragmentShader).toContain('if (uRippleDetail > 0.0 && uWeirFinish > 0.0)');
  expect(receiving.fragmentShader).toContain('vec2 hydraulicFootprint = fwidth(waterCoord)');
  expect(receiving.fragmentShader).toContain('fwidth(filamentPhase)');
  expect(receiving.fragmentShader).toContain('weirFoamColour * bodyLight * uBodyTint');
  WaterAnimationManager({});
  driver.frame!();
  useGameSimulationStore.setState({ gameTime: 12.1 });
  driver.frame!();
  const moving = receiving.uniforms.uTime.value;
  driver.reduced = true;
  WaterAnimationManager({});
  useGameSimulationStore.setState({ gameTime: 13 });
  driver.frame!();
  expect(receiving.uniforms.uTime.value).toBe(moving);
  const graphics = useGraphicsStore.getState().graphics;
  try {
    useGraphicsStore.setState({ graphics: { ...graphics, quality: 'low' } });
    driver.frame!();
    expect(receiving.uniforms.uRippleDetail).toBe(WATER_RIPPLE_DETAIL);
    expect(receiving.uniforms.uRippleDetail.value).toBe(0);
    useGameSimulationStore.setState({ isTabVisible: false, gameTime: 15 });
    driver.frame!();
    expect(receiving.uniforms.uTime.value).toBe(moving);
  } finally {
    useGraphicsStore.setState({ graphics });
  }
});

describe('real supported-water transmission', () => {
  it('opts in only the actual bed/apron/film and restores opaque Low state', () => {
    const river = (
      UnifiedWaterSurfaceMaterial({
        kind: 'river',
        weirImpact: true,
        bedDepth: 2.02,
      }) as ReactElement<{ object: THREE.ShaderMaterial }>
    ).props.object;
    const canal = (
      UnifiedWaterSurfaceMaterial({ kind: 'canal' }) as ReactElement<{
        object: THREE.ShaderMaterial;
      }>
    ).props.object;
    const film = (
      UnifiedWaterSurfaceMaterial({ kind: 'river', falling: true }) as ReactElement<{
        object: THREE.ShaderMaterial;
      }>
    ).props.object;
    expect(river.uniforms.uBedDepth.value).toBe(2.02);
    expect(river.uniforms.uTransmission.value).toBe(1);
    expect(canal.uniforms.uTransmission.value).toBe(0);
    expect(film.uniforms.uTransmission.value).toBe(1);
    expect(film.uniforms.uWaterCraft).toBe(WATER_CRAFT_GAIN);
    expect(river.uniforms.uWaterCraft).toBe(WATER_CRAFT_GAIN);
    expect(film.fragmentShader).toContain('surfaceAlpha * filmCoverage');
    expect(film.fragmentShader).toContain('edgeSoftness = .025+drop*.085');
    const old = useGraphicsStore.getState().graphics;
    try {
      useGraphicsStore.setState({ graphics: { ...old, quality: 'medium' } });
      WaterAnimationManager({});
      driver.frame!();
      expect(river.transparent).toBe(true);
      expect(river.depthWrite).toBe(false);
      expect(river.forceSinglePass).toBe(true);
      expect(canal.transparent).toBe(false);
      useGraphicsStore.setState({ graphics: { ...old, quality: 'low' } });
      driver.frame!();
      expect(river.transparent).toBe(false);
      expect(river.depthWrite).toBe(true);
      expect(film.transparent).toBe(false);
    } finally {
      useGraphicsStore.setState({ graphics: old });
    }
  });
  it('uses actual depth UV and incident linear reflection only on the receiving river', () => {
    const river = (
      UnifiedWaterSurfaceMaterial({
        kind: 'river',
        weirImpact: true,
        bedDepth: 2.02,
      }) as ReactElement<{ object: THREE.ShaderMaterial }>
    ).props.object;
    expect(river.fragmentShader).toContain('actualDepth *= clamp(vUv.x*2.0,0.0,1.0)');
    expect(river.fragmentShader).toContain('exp(-uAbsorption * actualDepth');
    expect(river.fragmentShader).toContain('millosJunctionFroth');
    expect(river.fragmentShader).toContain('fwidth(world.x)');
    expect(river.uniforms.uSceneReflectionReady.value).toBe(0);
    expect(river.uniforms.uSceneReflection.value).toBeNull();
  });
});
