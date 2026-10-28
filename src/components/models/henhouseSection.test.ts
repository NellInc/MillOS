import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  createHenhouseInterior,
  createHenhouseSection,
  prepareHenhouseSection,
  HENHOUSE_FLOOR_Y,
  sampleHenhouseTime,
  sampleHenhouseGrain,
} from './henhouseSection';

async function actualCoop() {
  const document = await new NodeIO().readBinary(
    new Uint8Array(readFileSync('public/models/farm/coop.glb'))
  );
  const node = document.getRoot().listNodes()[0];
  const primitive = node.getMesh()!.listPrimitives()[0];
  const geometry = new THREE.BufferGeometry();
  for (const [semantic, attribute] of [
    ['POSITION', 'position'],
    ['NORMAL', 'normal'],
    ['TEXCOORD_0', 'uv'],
  ]) {
    const source = primitive.getAttribute(semantic)!;
    geometry.setAttribute(
      attribute,
      new THREE.BufferAttribute(new Float32Array(source.getArray()!), source.getElementSize())
    );
  }
  geometry.setIndex(Array.from(primitive.getIndices()!.getArray()!));
  const scene = new THREE.Group();
  const map = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({ map });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = node.getName();
  mesh.matrix.fromArray(node.getMatrix());
  mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
  scene.add(mesh);
  scene.updateMatrixWorld(true);
  return { scene, mesh, geometry, material, map };
}
function fingerprint(geometry: THREE.BufferGeometry) {
  return createHash('sha256')
    .update(
      JSON.stringify(
        Object.fromEntries(
          Object.entries(geometry.attributes).map(([name, attribute]) => [
            name,
            Array.from(attribute.array),
          ])
        )
      )
    )
    .update(JSON.stringify(geometry.index ? Array.from(geometry.index.array) : []))
    .digest('hex');
}

describe('actual generated henhouse section', () => {
  it('retains source normalization and shared maps, owning only edited geometry and materials', async () => {
    const source = await actualCoop();
    const before = fingerprint(source.geometry);
    const disposeSource = vi.spyOn(source.geometry, 'dispose');
    const disposeMap = vi.spyOn(source.map, 'dispose');
    const prepared = prepareHenhouseSection(source.scene);
    const mesh = prepared.model.getObjectByName('CoopBody') as THREE.Mesh;
    expect(mesh.geometry).not.toBe(source.geometry);
    expect(mesh.material).not.toBe(source.material);
    expect((mesh.material as THREE.MeshStandardMaterial).map).toBe(source.map);
    expect(prepared.frame.equals(source.mesh.matrixWorld)).toBe(true);
    expect(mesh.position.equals(source.mesh.position)).toBe(true);
    expect(mesh.scale.x).toBeCloseTo(2.9998160117461627);
    const bounds = new THREE.Box3().setFromObject(prepared.model);
    expect(bounds.min.y).toBeCloseTo(0);
    expect(bounds.min.x).toBeCloseTo(-1.5);
    expect(bounds.max.x).toBeCloseTo(1.5);
    prepared.dispose();
    expect(fingerprint(source.geometry)).toBe(before);
    expect(disposeSource).not.toHaveBeenCalled();
    expect(disposeMap).not.toHaveBeenCalled();
  });
  it('cuts real upper architecture at raw Z zero while preserving every lower triangle', async () => {
    const { geometry } = await actualCoop();
    const section = createHenhouseSection(geometry);
    const p = section.getAttribute('position');
    let upperFront = 0;
    for (let i = 0; i < p.count; i++)
      if (p.getY(i) > HENHOUSE_FLOOR_Y + 1e-7 && p.getZ(i) > 1e-7) upperFront++;
    expect(upperFront).toBe(0);
    const key = (
      positions: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
      ids: number[]
    ) =>
      ids
        .map((id) => [positions.getX(id), positions.getY(id), positions.getZ(id)].join(','))
        .join(';');
    const output = new Set<string>();
    for (let i = 0; i < p.count; i += 3) output.add(key(p, [i, i + 1, i + 2]));
    const source = geometry.getAttribute('position');
    let preserved = 0;
    for (let i = 0; i < geometry.index!.count; i += 3) {
      const ids = [0, 1, 2].map((k) => geometry.index!.getX(i + k));
      if (ids.every((id) => source.getY(id) <= HENHOUSE_FLOOR_Y + 1e-7)) {
        expect(output.has(key(source, ids))).toBe(true);
        preserved++;
      }
    }
    expect(preserved).toBeGreaterThan(100);
    expect(p.count / 3).toBeLessThan(4416);
    expect(Number.isFinite(section.boundingSphere!.radius)).toBe(true);
    process.stdout.write(
      `Henhouse section: ${p.count / 3} triangles; ${preserved} original floor/support triangles preserved\n`
    );
    section.dispose();
  });
  it('interpolates crossing UVs and normalized normals', () => {
    const source = new THREE.BufferGeometry();
    source.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, -1, 2, 0, 1, 0, 2, -1], 3)
    );
    source.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
    source.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
    const result = createHenhouseSection(source);
    const p = result.getAttribute('position'),
      uv = result.getAttribute('uv'),
      normal = result.getAttribute('normal');
    const crossings = [];
    for (let i = 0; i < p.count; i++)
      if (p.getZ(i) === 0) crossings.push([p.getX(i), p.getY(i), uv.getX(i), uv.getY(i)]);
    expect(crossings).toContainEqual([1, 0, 0.5, 0]);
    expect(crossings).toContainEqual([1, 1, 0.5, 0.5]);
    for (let i = 0; i < normal.count; i++)
      expect(Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i))).toBeCloseTo(1);
    result.dispose();
    source.dispose();
  });
});

describe('local illustrative henhouse assembly', () => {
  it('bounds its six merged material draws and leaves the entrance clear', () => {
    const geometry = createHenhouseInterior(2.9998160117461627);
    let triangles = 0;
    for (const value of Object.values(geometry)) {
      triangles += value.getAttribute('position').count / 3;
      expect(Number.isFinite(value.boundingSphere!.radius)).toBe(true);
      expect(value.boundingBox!.max.x).toBeLessThan(0.083 * 3);
      value.dispose();
    }
    const wood = geometry.wood.getAttribute('position');
    let entranceObstructions = 0;
    for (let i = 0; i < wood.count; i++)
      if (wood.getX(i) / 3 > 0.05 && wood.getY(i) / 3 < 0.057 && Math.abs(wood.getZ(i) / 3) < 0.099)
        entranceObstructions++;
    expect(entranceObstructions).toBe(0);
    expect(Object.keys(geometry)).toHaveLength(6);
    expect(triangles + 240).toBeLessThan(4000);
    process.stdout.write(
      `Henhouse props: 7 draws, ${triangles + 240} triangles including 12 kernels; two existing 5929-triangle hens are separate\n`
    );
  });
  it('admits only advancing simulation time, holding pause, hidden tab and reduced motion without catch-up', () => {
    let state = { source: 100, admitted: 0 };
    const step = (source: number, running: boolean) => {
      state = { source, admitted: sampleHenhouseTime(state, source, running) };
      return state.admitted;
    };
    expect(step(101, true)).toBe(1);
    expect(step(102, false)).toBe(1);
    expect(step(110, false)).toBe(1);
    expect(step(200, false)).toBe(1);
    expect(step(201, true)).toBe(2);
    expect(step(201, true)).toBe(2);
    expect(step(0, true)).toBe(2);
    const out = new THREE.Vector3();
    const point = sampleHenhouseGrain(state.admitted, out).clone();
    expect(sampleHenhouseGrain(state.admitted, out)).toBe(out);
    expect(out.equals(point)).toBe(true);
    expect(out.x).toBeGreaterThanOrEqual(-0.3);
    expect(out.x).toBeLessThanOrEqual(-0.282);
  });
  it('uses the exact existing chicken derivative covered by account-owner-confirmed Tripo API rights', () => {
    const provenance = JSON.parse(
      readFileSync('assets/source/models/farm/PROVENANCE.json', 'utf8')
    );
    const chicken = provenance.sourcePacks.find(
      (asset: { name: string }) => asset.name === 'chicken'
    );
    const digest = createHash('sha256')
      .update(readFileSync('public/models/farm/chicken.glb'))
      .digest('hex');
    expect(digest).toBe(chicken.runtimeDerivative.sha256);
    expect(provenance.license).toBe('Tripo3D API-plan output');
    expect(provenance.licenceNote).toContain("account owner's confirmed API-plan rights");
  });
});
