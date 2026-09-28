import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import * as THREE from 'three';
import { UnifiedWaterSurfaceMaterial, WaterAnimationManager } from '../FactoryExterior';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';

const driver = vi.hoisted(() => ({
  frame: null as (() => void) | null,
  cleanups: [] as Array<() => void>,
  reduced: false,
  phase: { current: { time: 0, previous: null as number | null, reduced: false } },
}));

vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useMemo: (factory: () => unknown) => factory(),
  useRef: () => driver.phase,
  useEffect: (effect: () => void | (() => void)) => {
    const cleanup = effect();
    if (cleanup) driver.cleanups.push(cleanup);
  },
}));
vi.mock('@react-three/fiber', async (original) => ({
  ...(await original<typeof import('@react-three/fiber')>()),
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
});

describe('authored exterior water material and atmosphere driver', () => {
  it('keeps the real single-pass opaque, fogged material and bounded shoreline swell', () => {
    const water = material(true);
    expect(water.transparent).toBe(false);
    expect(water.depthWrite).toBe(true);
    expect(water.side).toBe(THREE.DoubleSide);
    expect(water.fog).toBe(true);
    expect(water.vertexShader).toContain(
      'displaced.z += vWave * 0.035 * windAmplitude * waveEnvelope'
    );
    expect(water.fragmentShader).toContain('gl_FragColor = vec4(colour, 1.0)');
    expect(water.fragmentShader).toContain('#include <fog_fragment>');
    expect(water.customProgramCacheKey()).toBe('millos-unified-water-v13');
    const dispose = vi.spyOn(water, 'dispose');
    for (const cleanup of driver.cleanups.splice(0)) cleanup();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('spreads lake ripple directions while retaining canal flow alignment', () => {
    const lake = material(true);
    const canal = material(false);
    const cross = (water: THREE.ShaderMaterial) =>
      water.uniforms.uRippleB.value.dot(water.uniforms.uRippleC.value);
    expect(cross(lake)).toBeLessThan(0);
    expect(cross(canal)).toBeGreaterThan(0.7);
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
  expect(ordinary.uniforms.uFalling.value).toBe(0);
  expect(sheet.uniforms.uFalling.value).toBe(1);
  expect(sheet.customProgramCacheKey()).toBe(ordinary.customProgramCacheKey());
  expect(sheet.fragmentShader).toContain('vWorldPosition.y * 12.0');
  WaterAnimationManager({});
  driver.frame?.();
  expect(sheet.uniforms.uTime.value).toBe(ordinary.uniforms.uTime.value);
});

it('uses both chain-rule terms for curved ripple reflections without adding texture samplers', () => {
  const water = material();
  expect(water.fragmentShader).toContain('gradientC * 1.15');
  expect(water.fragmentShader).toContain('gradientA * 0.48');
  expect(water.fragmentShader).not.toContain('sampler2D');
});
