import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import * as THREE from 'three';
import { applyPondWater, NaturalDuckPond } from './NaturalDuckPond';

const driver = vi.hoisted(() => ({
  scene: null as THREE.Scene | null,
  memo: undefined as unknown,
  frame: null as ((state: unknown, delta: number) => void) | null,
  reduced: false,
  cleanup: null as (() => void) | null,
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useMemo: (factory: () => unknown) => driver.memo ?? (driver.memo = factory()),
  useEffect: (effect: () => () => void) => {
    driver.cleanup = effect();
  },
}));
vi.mock('@react-three/fiber', () => ({
  useFrame: (frame: typeof driver.frame) => {
    driver.frame = frame;
  },
}));
vi.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => driver.reduced }));
vi.mock('../../utils/dracoLoader', () => ({ useDracoGLTF: () => ({ scene: driver.scene }) }));
beforeEach(() => {
  driver.memo = undefined;
  driver.reduced = false;
  driver.cleanup = null;
});
afterEach(() => driver.cleanup?.());

describe('authored pond water finish', () => {
  it('changes only blue atlas texels, keeping reeds, mud and lily pads', () => {
    // Samples measured from the delivered albedo, including dark shoreline blue.
    const mask = (hex: string) => {
      const c = new THREE.Color(hex);
      return THREE.MathUtils.smoothstep(
        (c.b - Math.max(c.r, c.g)) / Math.max(0.001, c.b),
        0.22,
        0.48
      );
    };
    expect(mask('#1359b8')).toBe(1);
    expect(mask('#244ba8')).toBe(1);
    expect(mask('#9d5b41')).toBe(0);
    expect(mask('#b6ae97')).toBe(0);
    expect(mask('#3d5f9c')).toBe(1);
    expect(mask('#1e761b')).toBe(0);
    expect(mask('#805332')).toBe(0);
    expect(mask('#00d566')).toBe(0);
  });
  it('keeps the loaded atlas and standard day/night lighting without extra textures', () => {
    const map = new THREE.Texture();
    const material = new THREE.MeshStandardMaterial({ map });
    const time = { value: 0 };
    applyPondWater(material, time);
    const shader = {
      uniforms: {},
      vertexShader: '#include <begin_vertex>',
      fragmentShader: [
        'map_fragment',
        'roughnessmap_fragment',
        'metalnessmap_fragment',
        'normal_fragment_maps',
      ]
        .map((name) => `#include <${name}>`)
        .join('\n'),
    } as Parameters<typeof material.onBeforeCompile>[0];
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(shader.uniforms.pondTime).toBe(time);
    expect(material.map).toBe(map);
    expect(shader.fragmentShader).toContain('roughnessFactor, 0.24, pondWater');
    expect(shader.fragmentShader).toContain(
      'normal = normalize(mix(normal, pondNormal, pondWater))'
    );
    expect(shader.fragmentShader).not.toContain('sampler2D');
    expect(shader.fragmentShader).not.toContain('totalEmissiveRadiance');
    const key = material.customProgramCacheKey();
    time.value = 1;
    expect(material.customProgramCacheKey()).toBe(key);
    material.dispose();
    map.dispose();
  });
});

it('freezes and resumes pond ripples, while owning only the cloned material', () => {
  const geometry = new THREE.PlaneGeometry();
  const map = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({ map });
  const original = new THREE.Mesh(geometry, material);
  driver.scene = new THREE.Scene();
  driver.scene.add(original);
  const element = NaturalDuckPond() as ReactElement<{ object: THREE.Scene }>;
  const clone = element.props.object.children[0] as THREE.Mesh<
    THREE.BufferGeometry,
    THREE.MeshStandardMaterial
  >;
  expect(clone.geometry).toBe(geometry);
  expect(clone.material.map).toBe(map);
  expect(clone.material).not.toBe(material);
  const shader = {
    uniforms: {},
    vertexShader: '#include <begin_vertex>',
    fragmentShader: '',
  } as Parameters<typeof material.onBeforeCompile>[0];
  clone.material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  driver.frame!({}, 0.016);
  expect(shader.uniforms.pondTime.value).toBe(0.016);
  driver.reduced = true;
  NaturalDuckPond();
  driver.frame!({}, 2);
  expect(shader.uniforms.pondTime.value).toBe(0.016);
  driver.reduced = false;
  NaturalDuckPond();
  driver.frame!({}, 2);
  expect(shader.uniforms.pondTime.value).toBeCloseTo(0.116);
  const sharedDispose = vi.spyOn(material, 'dispose');
  const ownDispose = vi.spyOn(clone.material, 'dispose');
  driver.cleanup!();
  driver.cleanup = null;
  expect(ownDispose).toHaveBeenCalledOnce();
  expect(sharedDispose).not.toHaveBeenCalled();
  material.dispose();
  map.dispose();
  geometry.dispose();
});
