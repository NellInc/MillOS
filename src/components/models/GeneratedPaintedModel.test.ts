import { expect, it } from 'vitest';
import * as THREE from 'three';
import { applyGeneratedPaint } from './GeneratedPaintedModel';

it('keeps paint colours in uniforms and shader cache keys stable across colour variants', () => {
  const red = new THREE.MeshStandardMaterial();
  const blue = new THREE.MeshStandardMaterial();
  applyGeneratedPaint(red, '#ff0000', 'ochre');
  applyGeneratedPaint(blue, '#0000ff', 'ochre');
  expect(red.customProgramCacheKey()).toBe(blue.customProgramCacheKey());
  const shader = { uniforms: {}, fragmentShader: '#include <map_fragment>' } as Parameters<
    typeof red.onBeforeCompile
  >[0];
  red.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  expect(shader.uniforms.millosPaintColor.value).toEqual(new THREE.Color('#ff0000'));
  expect(shader.fragmentShader).toContain('#include <map_fragment>');
  expect(shader.fragmentShader).toContain('diffuseColor.rgb = mix');
  red.dispose();
  blue.dispose();
});

it('isolates blue hatchback paint from neutral glazing and uses a distinct stable program', () => {
  const material = new THREE.MeshStandardMaterial();
  applyGeneratedPaint(material, '#ffcc00', 'blue');
  const shader = { uniforms: {}, fragmentShader: '#include <map_fragment>' } as Parameters<
    typeof material.onBeforeCompile
  >[0];
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  expect(shader.fragmentShader).toContain('smoothstep(0.35, 0.6');
  expect(shader.fragmentShader).toContain('paintSample.b - max(paintSample.r, paintSample.g)');
  expect(material.customProgramCacheKey()).toBe('millos-generated-paint-blue-v1');
  material.dispose();
});
