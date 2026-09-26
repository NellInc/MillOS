import { afterEach, expect, it, vi } from 'vitest';
import { useLayoutEffect } from 'react';
import { cleanup, render } from '@testing-library/react';
import * as THREE from 'three';
import {
  GeneratedGeometrySurface,
  restoreGeometryOrigin,
  createGeneratedSurfaceMaterial,
} from './GeneratedGeometrySurface';
import { hasWorldSurface, ownsOnlyWorldSurface } from '../../utils/worldSurface';

const holder = vi.hoisted(() => ({ scene: null as THREE.Group | null }));
vi.mock('../../utils/dracoLoader', () => ({ useDracoGLTF: () => ({ scene: holder.scene }) }));
afterEach(cleanup);

it('keeps the static fallback finish and its live uniforms underneath an early atlas load', () => {
  const original = new THREE.MeshStandardMaterial({
    color: '#e0e0e0',
    roughness: 0.85,
    normalMap: new THREE.Texture(),
  });
  const live = createGeneratedSurfaceMaterial(original, new THREE.Texture(), true);
  expect(hasWorldSurface(original)).toBe(true);
  expect(hasWorldSurface(live)).toBe(true);
  expect(live.userData.millosWorldSurface).toBe(original.userData.millosWorldSurface);
  expect(ownsOnlyWorldSurface(live)).toBe(false);
  const shader = {
    uniforms: {} as Record<string, { value: unknown }>,
    vertexShader: '#include <uv_vertex>\n#include <project_vertex>',
    fragmentShader: '#include <normal_fragment_maps>',
  };
  live.onBeforeCompile(
    shader as unknown as Parameters<typeof live.onBeforeCompile>[0],
    {} as THREE.WebGLRenderer
  );
  expect(shader.uniforms.uSurfStrength).toBe(original.userData.millosWorldSurface.uSurfStrength);
  expect(shader.uniforms.millosAuthoredNormal.value).toBe(original.normalMap);
  live.normalMap?.dispose();
  live.dispose();
});

function fixture() {
  const original = new THREE.BoxGeometry(2, 3, 4);
  const generated = new THREE.BoxGeometry(2, 3, 4);
  generated.setAttribute(
    'color',
    new THREE.Float32BufferAttribute(new Float32Array(72).fill(0.5), 3)
  );
  const material = new THREE.MeshStandardMaterial({ normalMap: new THREE.Texture() });
  material.normalScale.setScalar(0.2);
  const mesh = new THREE.Mesh(generated, material);
  mesh.position.y = 1.5;
  const scene = new THREE.Group();
  scene.add(mesh);
  return { original, generated, material, scene };
}

it('uses the reviewed asset normal strength without changing the authored tread strength', () => {
  const f = fixture();
  f.material.normalScale.setScalar(2);
  holder.scene = f.scene;
  const original = new THREE.MeshStandardMaterial({ normalMap: new THREE.Texture() });
  original.normalScale.setScalar(0.85);
  const mesh = new THREE.Mesh(f.original, original);
  const view = render(
    <GeneratedGeometrySurface
      asset="truckTyreUnit"
      original={f.original}
      meshRef={{ current: mesh }}
    />
  );
  expect(mesh.material.normalScale.toArray()).toEqual([2, 2]);
  expect(original.normalScale.toArray()).toEqual([0.85, 0.85]);
  view.unmount();
  expect(mesh.material).toBe(original);
});

it('restores the original local origin while keeping the authored envelope and palette ownership', () => {
  const f = fixture();
  const result = restoreGeometryOrigin(f.scene, f.original);
  expect(result.geometry).not.toBe(f.generated);
  expect(result.geometry.boundingBox?.min.toArray()).toEqual([-1, -1.5, -2]);
  expect(result.geometry.boundingBox?.max.toArray()).toEqual([1, 1.5, 2]);
  expect(result.geometry.getAttribute('color')).toBeUndefined();
  expect(f.generated.getAttribute('color')).toBeDefined();
  expect(result.material).toBe(f.material);
  expect(f.scene.children[0].position.y).toBe(1.5);
});

it('rejects an incompatible shape or an inert treatment', () => {
  const f = fixture();
  f.scene.children[0].scale.x = 1.1;
  expect(() => restoreGeometryOrigin(f.scene, f.original)).toThrow('authored envelope');
  f.scene.children[0].scale.x = 1;
  f.material.normalMap = null;
  expect(() => restoreGeometryOrigin(f.scene, f.original)).toThrow('normal map');
});

it('isolates the new atlas while preserving the live mesh, analytic shader and authored maps', () => {
  const f = fixture();
  holder.scene = f.scene;
  const oldNormal = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({
    color: '#357935',
    roughness: 0.72,
    normalMap: oldNormal,
  });
  material.normalScale.set(0.3, 0.4);
  const shader = vi.fn();
  material.onBeforeCompile = shader;
  const mesh = new THREE.Mesh(f.original, material);
  const meshRef = { current: mesh };
  const view = render(
    <GeneratedGeometrySurface asset="stationCounter" original={f.original} meshRef={meshRef} />
  );
  expect(meshRef.current).toBe(mesh);
  const treated = mesh.material as THREE.MeshStandardMaterial;
  expect(treated).not.toBe(material);
  const compiled = {
    uniforms: {} as Record<string, { value: unknown }>,
    vertexShader: '#include <uv_vertex>',
    fragmentShader: '#include <normal_fragment_maps>',
  };
  treated.onBeforeCompile(
    compiled as unknown as Parameters<typeof treated.onBeforeCompile>[0],
    {} as THREE.WebGLRenderer
  );
  expect(shader).toHaveBeenCalledOnce();
  expect(compiled.uniforms.millosAuthoredNormal.value).toBe(oldNormal);
  expect(compiled.uniforms.millosAuthoredNormalScale.value).toBe(material.normalScale);
  expect(compiled.vertexShader).toContain('millosAuthoredNormalTransform * vec3(uv, 1.0)');
  expect(compiled.fragmentShader).toContain('millosAuthoredTbn * millosAuthoredN');
  expect(treated.color.getHexString()).toBe('357935');
  expect(treated.roughness).toBe(0.72);
  expect(treated.normalMap?.channel).toBe(1);
  expect(treated.normalMap?.source).toBe(f.material.normalMap?.source);
  expect(material.onBeforeCompile).toBe(shader);
  expect(material.color.getHexString()).toBe('357935');
  expect(material.roughness).toBe(0.72);
  expect(material.normalMap).toBe(oldNormal);
  expect(treated.normalScale.toArray()).toEqual([0.2, 0.2]);
  view.unmount();
  expect(mesh.material).toBe(material);
  expect(material.normalMap).toBe(oldNormal);
  expect(material.normalScale.toArray()).toEqual([0.3, 0.4]);
});

it('retains authored UVs independently of the Tripo atlas', () => {
  const f = fixture();
  const authored = f.original.toNonIndexed();
  const atlas = f.generated.getAttribute('uv');
  for (let i = 0; i < atlas.count; i++) atlas.setXY(i, 0.17, 0.83);
  const result = restoreGeometryOrigin(f.scene, f.original);
  expect(Array.from(result.geometry.getAttribute('uv').array)).toEqual(
    Array.from(authored.getAttribute('uv').array)
  );
  expect(result.geometry.getAttribute('uv1').getX(0)).toBeCloseTo(0.17);
  expect(result.geometry.getAttribute('uv1').getY(0)).toBeCloseTo(0.83);
});

it('tolerates Float32 atlas rounding across decimal hash boundaries', () => {
  const f = fixture();
  f.original.scale(0.98078525, 1, 1);
  f.generated.scale(0.98078525, 1, 1);
  const positions = f.generated.getAttribute('position');
  positions.setX(0, 0.98078495);
  expect(() => restoreGeometryOrigin(f.scene, f.original)).not.toThrow();
});

it('rejects changed topology even when the envelope still matches', () => {
  const f = fixture();
  const positions = f.generated.getAttribute('position');
  positions.setXYZ(0, 0.8, 1.2, 1.7);
  expect(() => restoreGeometryOrigin(f.scene, f.original)).toThrow('authored UV topology');
});

it('fits an explicit positive-axis box variant and still checks its topology', () => {
  const f = fixture();
  f.original.scale(0.3, 4, 27);
  expect(() => restoreGeometryOrigin(f.scene, f.original)).toThrow('envelope');
  const result = restoreGeometryOrigin(f.scene, f.original, true);
  expect(result.geometry.boundingBox!.getSize(new THREE.Vector3()).toArray()).toEqual(
    f.original.boundingBox!.getSize(new THREE.Vector3()).toArray()
  );
});

it('waits for the parent layout phase to install a mesh ref', () => {
  const f = fixture();
  holder.scene = f.scene;
  const material = new THREE.MeshStandardMaterial();
  const mesh = new THREE.Mesh(f.original, material);
  const meshRef: { current: THREE.Mesh | null } = { current: null };
  function Parent() {
    useLayoutEffect(() => {
      meshRef.current = mesh;
    }, []);
    return (
      <GeneratedGeometrySurface asset="stationCounter" original={f.original} meshRef={meshRef} />
    );
  }
  const view = render(<Parent />);
  expect(mesh.material).not.toBe(material);
  view.unmount();
  expect(mesh.material).toBe(material);
});

it('reattaches when a rig clone or an instance-count change replaces the referenced mesh', () => {
  const f = fixture();
  holder.scene = f.scene;
  const firstMaterial = new THREE.MeshStandardMaterial();
  const secondMaterial = new THREE.MeshStandardMaterial({ color: '#cab123' });
  const first = new THREE.Mesh(f.original, firstMaterial);
  const second = new THREE.Mesh(f.original, secondMaterial);
  const meshRef = { current: first };
  const element = () => (
    <GeneratedGeometrySurface asset="stationCounter" original={f.original} meshRef={meshRef} />
  );
  const view = render(element());
  expect(first.material).not.toBe(firstMaterial);
  meshRef.current = second;
  view.rerender(element());
  expect(first.material).toBe(firstMaterial);
  expect(first.geometry).toBe(f.original);
  expect(second.material).not.toBe(secondMaterial);
  expect(second.material.color.getHexString()).toBe('cab123');
  view.unmount();
  expect(second.material).toBe(secondMaterial);
  expect(second.geometry).toBe(f.original);
});

it('supports a genuinely untextured source mesh without inventing an authored UV map', () => {
  const f = fixture();
  f.original.deleteAttribute('uv');
  const result = restoreGeometryOrigin(f.scene, f.original);
  expect(f.original.getAttribute('uv')).toBeUndefined();
  expect(Array.from(result.geometry.getAttribute('uv').array).every((value) => value === 0)).toBe(
    true
  );
  expect(result.geometry.getAttribute('uv1').count).toBe(
    result.geometry.getAttribute('position').count
  );
});

it('repairs tiny exported box-envelope drift only when fitting is explicit', () => {
  const f = fixture();
  f.generated.scale(1.00001, 1.00001, 1.00001);
  expect(() => restoreGeometryOrigin(f.scene, f.original)).toThrow('authored UV topology');
  expect(() => restoreGeometryOrigin(f.scene, f.original, true)).not.toThrow();
});
