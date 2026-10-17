import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import * as THREE from 'three';
import {
  UnifiedWaterSurfaceMaterial,
  WaterAnimationManager,
  WATER_SKY_RADIANCE,
} from '../FactoryExterior';
import {
  WATER_PROFILES,
  WATER_VISUAL_TIME,
  WATER_WIND,
  applyWaterRipples,
  applyFountainFoam,
} from '../../utils/waterAppearance';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';

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
    expect(water.fragmentShader).toContain('gl_FragColor = vec4(colour, 1.0)');
    expect(water.fragmentShader).toContain('#include <fog_fragment>');
    expect(water.customProgramCacheKey()).toBe('millos-unified-water-v20');
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
  expect(water.fragmentShader).not.toContain('sampler2D');
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
    water.fragmentShader.indexOf('colour = mix(colour, reflectionColour, reflectance)')
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
