import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { createShopDisplayGeometry, SHOP_DISPLAY_ITEM_GRID } from './GeneratedOfficeModel';
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

it('installs each real shop trade on a private material, keeping shared body and atlas custody', () => {
  const source = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
  const geometry = new THREE.BoxGeometry();
  source.add(new THREE.Mesh(geometry, material));
  holder.scene = source;
  const clones: THREE.Mesh[] = [];
  const original = source.clone.bind(source);
  vi.spyOn(source, 'clone').mockImplementation((recursive) => {
    const clone = original(recursive);
    clones.push(clone.children[0] as THREE.Mesh);
    return clone;
  });
  const view = render(<GeneratedBody asset="shop" shopTrade="bakery" fallback={null} />);
  const bakery = clones[0].material as THREE.MeshStandardMaterial;
  const dispose = vi.spyOn(bakery, 'dispose');
  view.rerender(<GeneratedBody asset="shop" shopTrade="general" fallback={null} />);
  expect(dispose).toHaveBeenCalledTimes(1);
  for (const mesh of clones) {
    const paint = mesh.material as THREE.MeshStandardMaterial;
    expect(paint).not.toBe(material);
    expect(paint.map).toBe(material.map);
    expect(mesh.geometry).toBe(geometry);
    expect(mesh.castShadow).toBe(true);
    expect(mesh.receiveShadow).toBe(true);
    expect(paint.color.getHex()).toBe(0xffffff);
    expect(paint.customProgramCacheKey()).toContain('millos-authored-shop-joinery-v4');
  }
  view.rerender(<GeneratedModel asset="church" shopTrade="bakery" />);
  expect((clones.at(-1)!.material as THREE.Material).customProgramCacheKey()).toBe(
    'millos-authored-village-windows-v6'
  );
  expect(material.customProgramCacheKey()).not.toContain('shop-joinery');
  view.unmount();
  geometry.dispose();
  material.map!.dispose();
  material.dispose();
});

async function deliveredShopGeometry() {
  const doc = await new NodeIO().readBinary(
    new Uint8Array(readFileSync('public/models/village/shop.glb'))
  );
  const primitive = doc.getRoot().listMeshes()[0].listPrimitives()[0];
  const geometry = new THREE.BufferGeometry();
  for (const [attribute, accessor, size] of [
    ['position', 'POSITION', 3],
    ['normal', 'NORMAL', 3],
    ['uv', 'TEXCOORD_0', 2],
  ] as const) {
    geometry.setAttribute(
      attribute,
      new THREE.BufferAttribute(
        new Float32Array(primitive.getAttribute(accessor)!.getArray()!),
        size
      )
    );
  }
  geometry.setIndex(Array.from(primitive.getIndices()!.getArray()!));
  return geometry;
}

it('volumes the delivered five goods while preserving the building, anchors and cached buffers', async () => {
  const source = await deliveredShopGeometry();
  const originalPositions = Array.from(source.getAttribute('position').array);
  const originalNormals = Array.from(source.getAttribute('normal').array);
  const uv = source.getAttribute('uv');
  const p = source.getAttribute('position');
  const goods = new Map<number, number[]>();
  for (let i = 0; i < uv.count; i++) {
    if (uv.getX(i) > 0.75 && uv.getX(i) < 1 && uv.getY(i) > 0.25 && uv.getY(i) < 0.5) {
      const band = Math.floor((p.getX(i) + SHOP_DISPLAY_ITEM_GRID[0]) * SHOP_DISPLAY_ITEM_GRID[1]);
      goods.set(band, [...(goods.get(band) ?? []), i]);
    }
  }
  expect([...goods.keys()].sort()).toEqual([0, 1, 2, 3, 4]);
  expect([...goods.values()].map((vertices) => vertices.length)).toEqual([62, 62, 62, 62, 62]);
  const selected = new Set([...goods.values()].flat());
  for (const trade of ['bakery', 'butcher', 'general'] as const) {
    const variant = createShopDisplayGeometry(source, trade);
    const q = variant.getAttribute('position');
    const n = variant.getAttribute('normal');
    expect(variant).not.toBe(source);
    expect(q.array).not.toBe(p.array);
    expect(variant.index!.array).not.toBe(source.index!.array);
    expect(Array.from(variant.index!.array).slice(0, source.index!.count)).toEqual(
      Array.from(source.index!.array)
    );
    expect(Array.from(variant.getAttribute('uv').array).slice(0, uv.array.length)).toEqual(
      Array.from(uv.array)
    );
    if (trade !== 'general') {
      expect(q.count).toBe(p.count);
      expect(variant.index!.count).toBe(10380);
    }
    for (let i = 0; i < p.count; i++) {
      if (!selected.has(i)) {
        for (let axis = 0; axis < 3; axis++) {
          expect(q.getComponent(i, axis)).toBe(p.getComponent(i, axis));
          expect(n.getComponent(i, axis)).toBe(source.getAttribute('normal').getComponent(i, axis));
        }
      } else {
        expect(Math.hypot(n.getX(i), n.getY(i), n.getZ(i))).toBeCloseTo(1, 5);
        expect(
          Math.floor((q.getX(i) + SHOP_DISPLAY_ITEM_GRID[0]) * SHOP_DISPLAY_ITEM_GRID[1])
        ).toBe(Math.floor((p.getX(i) + SHOP_DISPLAY_ITEM_GRID[0]) * SHOP_DISPLAY_ITEM_GRID[1]));
      }
    }
    for (const [band, vertices] of goods) {
      const scale =
        trade === 'general'
          ? [0.58, 1.2, 8]
          : trade === 'butcher'
            ? [1, 0.9, 4]
            : band % 3 === 0
              ? [0.76, 1.38, 8]
              : band % 3 === 1
                ? [1, 1.12, 7]
                : [1.4, 0.8, 5];
      for (let axis = 0; axis < 3; axis++) {
        const before = vertices.map((i) => p.getComponent(i, axis));
        const after = vertices.map((i) => q.getComponent(i, axis));
        expect(Math.max(...after) - Math.min(...after)).toBeCloseTo(
          (Math.max(...before) - Math.min(...before)) * scale[axis],
          5
        );
        if (axis > 0) expect(Math.min(...after)).toBe(Math.min(...before));
      }
    }
    if (trade === 'bakery') {
      const silhouettes = [...goods.values()].map((vertices) =>
        [0, 1, 2]
          .map((axis) => {
            const values = vertices.map((i) => q.getComponent(i, axis));
            return (Math.max(...values) - Math.min(...values)).toFixed(4);
          })
          .join(',')
      );
      expect(new Set(silhouettes).size).toBe(3);
      for (const i of selected) {
        expect(q.getY(i)).toBeLessThan(1);
        expect(q.getZ(i)).toBeLessThan(2.53);
      }
    }
    if (trade === 'general') {
      const atlas = variant.getAttribute('uv');
      const extra = new Map<number, number[]>();
      let stems = 0;
      for (let i = p.count; i < q.count; i++) {
        expect(Math.hypot(n.getX(i), n.getY(i), n.getZ(i))).toBeCloseTo(1, 5);
        for (let a = 0; a < 3; a++) expect(Number.isFinite(q.getComponent(i, a))).toBe(true);
        if (atlas.getX(i) === 0.625 && atlas.getY(i) === 0.625) {
          stems++;
          continue;
        }
        expect(atlas.getX(i)).toBeGreaterThan(0.75);
        expect(atlas.getY(i)).toBeGreaterThan(0.25);
        expect(atlas.getY(i)).toBeLessThan(0.5);
        const band = Math.floor(
          (q.getX(i) + SHOP_DISPLAY_ITEM_GRID[0]) * SHOP_DISPLAY_ITEM_GRID[1]
        );
        extra.set(band, [...(extra.get(band) ?? []), i]);
        expect(q.getY(i)).toBeGreaterThanOrEqual(0.82475);
        expect(q.getY(i)).toBeLessThan(1.15);
        expect(q.getZ(i)).toBeGreaterThan(2.38);
        expect(q.getZ(i)).toBeLessThan(2.53);
      }
      expect([...extra.keys()].sort()).toEqual([0, 1, 2, 3, 4]);
      expect([...extra.values()].map((v) => v.length)).toEqual([124, 124, 124, 124, 124]);
      expect(stems).toBe(
        15 * new THREE.CylinderGeometry(0.0035, 0.005, 0.027, 4).getAttribute('position').count
      );
      expect(variant.index!.count).toBe(14700);
      expect(Math.max(...variant.index!.array)).toBeLessThan(q.count);
      // The green middle-layer fruit is a taller, tapered pear. The upper fruit stays round.
      const pear = extra
        .get(1)!
        .slice(0, 62)
        .map((i) => q.getY(i));
      expect(Math.max(...pear) - Math.min(...pear)).toBeCloseTo(0.119674 * 1.2 * 1.22, 5);
      expect(variant.groups).toEqual(source.groups);
    }
    expect(Number.isFinite(variant.boundingSphere!.radius)).toBe(true);
    variant.dispose();
  }
  expect(Array.from(p.array)).toEqual(originalPositions);
  expect(Array.from(source.getAttribute('normal').array)).toEqual(originalNormals);
  source.dispose();
});

it('releases owned display variants on trade changes and unmount, leaving cached GLB custody intact', async () => {
  const geometry = await deliveredShopGeometry();
  const source = new THREE.Group();
  const material = new THREE.MeshStandardMaterial();
  source.add(new THREE.Mesh(geometry, material));
  holder.scene = source;
  const cachedDispose = vi.spyOn(geometry, 'dispose');
  const clones: THREE.Mesh[] = [];
  const original = source.clone.bind(source);
  vi.spyOn(source, 'clone').mockImplementation((recursive) => {
    const clone = original(recursive);
    clones.push(clone.children[0] as THREE.Mesh);
    return clone;
  });
  const view = render(<GeneratedBody asset="shop" shopTrade="general" fallback={null} />);
  expect(clones[0].geometry).not.toBe(geometry);
  const firstDispose = vi.spyOn(clones[0].geometry, 'dispose');
  view.rerender(<GeneratedBody asset="shop" shopTrade="butcher" fallback={null} />);
  expect(firstDispose).toHaveBeenCalledOnce();
  expect(clones[1].geometry).not.toBe(clones[0].geometry);
  const secondDispose = vi.spyOn(clones[1].geometry, 'dispose');
  view.unmount();
  expect(secondDispose).toHaveBeenCalledOnce();
  expect(cachedDispose).not.toHaveBeenCalled();
  geometry.dispose();
  material.dispose();
});

it('keeps real loader-style interleaved produce attributes aligned in the owned expansion', async () => {
  const source = await deliveredShopGeometry();
  const count = source.getAttribute('position').count;
  const packed = new THREE.InterleavedBuffer(new Float32Array(count * 8), 8);
  for (let i = 0; i < count; i++) {
    let offset = 0;
    for (const name of ['position', 'normal', 'uv']) {
      const a = source.getAttribute(name);
      for (let c = 0; c < a.itemSize; c++) packed.array[i * 8 + offset++] = a.getComponent(i, c);
    }
  }
  source.setAttribute('position', new THREE.InterleavedBufferAttribute(packed, 3, 0));
  source.setAttribute('normal', new THREE.InterleavedBufferAttribute(packed, 3, 3));
  source.setAttribute('uv', new THREE.InterleavedBufferAttribute(packed, 2, 6));
  const before = packed.array.slice();
  const variant = createShopDisplayGeometry(source, 'general');
  try {
    const p = variant.getAttribute('position'),
      n = variant.getAttribute('normal'),
      u = variant.getAttribute('uv');
    expect(p.count).toBe(7074); // 6034 retained, 620 fruit vertices, 420 stalk vertices.
    expect(n.count).toBe(p.count);
    expect(u.count).toBe(p.count);
    expect(Array.from(p.array).every(Number.isFinite)).toBe(true);
    expect(Math.max(...variant.index!.array)).toBeLessThan(p.count);
    expect(packed.array).toEqual(before);
  } finally {
    variant.dispose();
    source.dispose();
  }
});

it('finishes only the cloned castle paving material, retaining geometry, atlas, shadow flags and disposal', () => {
  const source = new THREE.Group(),
    geometry = new THREE.BoxGeometry();
  const material = new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
  source.add(new THREE.Mesh(geometry, material));
  holder.scene = source;
  const clones: THREE.Mesh[] = [],
    original = source.clone.bind(source);
  vi.spyOn(source, 'clone').mockImplementation((recursive) => {
    const clone = original(recursive);
    clones.push(clone.children[0] as THREE.Mesh);
    return clone;
  });
  const view = render(<GeneratedModel asset="castle" />);
  const castle = clones[0].material as THREE.Material;
  expect(castle.customProgramCacheKey()).toBe(
    'millos-castle-paving-v1:millos-authored-village-windows-v6'
  );
  const dispose = vi.spyOn(castle, 'dispose');
  view.rerender(<GeneratedModel asset="cottage" />);
  expect(dispose).toHaveBeenCalledTimes(1);
  expect((clones[1].material as THREE.Material).customProgramCacheKey()).toBe(
    'millos-authored-village-windows-v6'
  );
  for (const clone of clones) {
    expect(clone.geometry).toBe(geometry);
    expect((clone.material as THREE.MeshStandardMaterial).map).toBe(material.map);
    expect(clone.material).not.toBe(material);
    expect(clone.castShadow).toBe(true);
    expect(clone.receiveShadow).toBe(true);
  }
  expect(material.customProgramCacheKey()).not.toContain('castle-paving');
  view.unmount();
  geometry.dispose();
  material.map!.dispose();
  material.dispose();
});

it('owns market paint variants while retaining shared atlas, shadow flags and cleanup', () => {
  const geometry = new THREE.BoxGeometry();
  geometry.getAttribute('uv').setXY(0, 0.75, 0.42);
  const material = new THREE.MeshStandardMaterial({
    map: new THREE.Texture(),
    roughnessMap: new THREE.Texture(),
  });
  const source = new THREE.Group();
  source.add(new THREE.Mesh(geometry, material));
  holder.scene = source;
  let clone: THREE.Group;
  const original = source.clone.bind(source);
  vi.spyOn(source, 'clone').mockImplementation((recursive) => (clone = original(recursive)));
  const view = render(<GeneratedBody asset="marketstall" marketDressing={0} fallback={null} />);
  const painted = clone!.children[0] as THREE.Mesh;
  const paint = painted.material as THREE.MeshStandardMaterial;
  expect(painted.geometry).not.toBe(geometry);
  expect(paint).not.toBe(material);
  expect(paint.vertexColors).toBe(true);
  expect(paint.map).toBe(material.map);
  expect(paint.roughnessMap).toBe(material.roughnessMap);
  expect(painted.castShadow && painted.receiveShadow).toBe(true);
  const disposeGeometry = vi.spyOn(painted.geometry, 'dispose'),
    disposePaint = vi.spyOn(paint, 'dispose');
  const disposeAtlas = vi.spyOn(material.map!, 'dispose'),
    disposeSource = vi.spyOn(geometry, 'dispose');
  view.rerender(<GeneratedModel asset="marketstall" marketDressing={1} />);
  expect(disposeGeometry).toHaveBeenCalledTimes(1);
  expect(disposePaint).toHaveBeenCalledTimes(1);
  view.rerender(<GeneratedModel asset="marketstall" />);
  expect((clone!.children[0] as THREE.Mesh).geometry).toBe(geometry);
  expect((clone!.children[0] as THREE.Mesh).material).toBe(material);
  view.unmount();
  expect(disposeAtlas).not.toHaveBeenCalled();
  expect(disposeSource).not.toHaveBeenCalled();
  expect(geometry.hasAttribute('color')).toBe(false);
  expect(material.vertexColors).toBe(false);
  geometry.dispose();
  material.map!.dispose();
  material.roughnessMap!.dispose();
  material.dispose();
});
