import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import * as THREE from 'three';
import { GeneratedBody, GeneratedBoundary, GeneratedModel } from './GeneratedModel';

const holder = vi.hoisted(() => ({ scene: null as THREE.Group | null }));
vi.mock('../../utils/dracoLoader', () => ({ useDracoGLTF: () => ({ scene: holder.scene }) }));
afterEach(cleanup);

it('retains shadow defaults while allowing authored no-reception meshes', () => {
  const source = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  source.add(mesh);
  holder.scene = source;
  const clones: THREE.Group[] = [];
  const original = source.clone.bind(source);
  vi.spyOn(source, 'clone').mockImplementation((recursive) => {
    const clone = original(recursive);
    clones.push(clone);
    return clone;
  });
  const view = render(<GeneratedModel asset="stationCounter" />);
  expect((clones[0].children[0] as THREE.Mesh).receiveShadow).toBe(true);
  view.rerender(<GeneratedModel asset="stationCounter" receiveShadow={false} />);
  expect((clones[1].children[0] as THREE.Mesh).receiveShadow).toBe(false);
  expect((clones[1].children[0] as THREE.Mesh).castShadow).toBe(true);
  expect((clones[1].children[0] as THREE.Mesh).geometry).toBe(mesh.geometry);
  expect(mesh.receiveShadow).toBe(false);
  view.unmount();
  render(<GeneratedBody asset="stationCounter" receiveShadow={false} fallback={null} />);
  expect((clones.at(-1)!.children[0] as THREE.Mesh).receiveShadow).toBe(false);
  mesh.geometry.dispose();
  (mesh.material as THREE.Material).dispose();
});

it('leaves unmatched geometry variants authored without loading the child', () => {
  const child = vi.fn(() => <span>Loaded</span>);
  const Child = child;
  const view = render(
    <GeneratedBoundary enabled={false} fallback={<span>Authored</span>}>
      <Child />
    </GeneratedBoundary>
  );
  expect(screen.getByText('Authored')).toBeInTheDocument();
  expect(child).not.toHaveBeenCalled();
  view.rerender(
    <GeneratedBoundary fallback={<span>Authored</span>}>
      <Child />
    </GeneratedBoundary>
  );
  expect(screen.getByText('Loaded')).toBeInTheDocument();
});

it('preserves mixed authored shadow flags and explicit per-instance overrides', () => {
  const source = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  mesh.userData = { authoredCastShadow: false, authoredReceiveShadow: true };
  source.add(mesh);
  holder.scene = source;
  let clone: THREE.Group;
  const original = source.clone.bind(source);
  vi.spyOn(source, 'clone').mockImplementation((recursive) => (clone = original(recursive)));
  const view = render(<GeneratedModel asset="stationCounter" />);
  expect((clone!.children[0] as THREE.Mesh).castShadow).toBe(false);
  expect((clone!.children[0] as THREE.Mesh).receiveShadow).toBe(true);
  view.rerender(
    <GeneratedBody asset="stationCounter" castShadow receiveShadow={false} fallback={null} />
  );
  expect((clone!.children[0] as THREE.Mesh).castShadow).toBe(true);
  expect((clone!.children[0] as THREE.Mesh).receiveShadow).toBe(false);
  expect(mesh.receiveShadow).toBe(false);
  mesh.geometry.dispose();
  (mesh.material as THREE.Material).dispose();
});

it('keeps an empty 3D fallback empty when an optional model fails', () => {
  const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const FailedModel = () => {
    throw new Error('Optional model unavailable');
  };
  try {
    const view = render(
      <GeneratedBoundary fallback={null}>
        <FailedModel />
      </GeneratedBoundary>
    );
    expect(view.container).toBeEmptyDOMElement();
    expect(screen.queryByText('Something went wrong')).toBeNull();
  } finally {
    errorLog.mockRestore();
  }
});
