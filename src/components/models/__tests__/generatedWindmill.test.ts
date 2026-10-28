/** Actual shipped precision-windmill contract. The raw frame, axis and bands
 * remain the runtime authority; straight authored parts must be fully rigid,
 * separated through every sail angle and bounded without renormalisation.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  SAIL_HUB_Y,
  SAIL_HUB_Z,
  computeSailWeights,
  sweptBounds,
  prepareWindmillModel,
} from '../GeneratedWindmill';

import { createWindmillCutawayGeometry, WINDMILL_SECTION_Z } from '../windmillCutaway';

const GLB = path.resolve(__dirname, '../../../../public/models/farm/windmill.glb');

const COMPONENT_TYPE = new Map<
  number,
  new (b: ArrayBufferLike, o: number, l: number) => ArrayLike<number>
>([
  [5120, Int8Array],
  [5121, Uint8Array],
  [5122, Int16Array],
  [5123, Uint16Array],
  [5125, Uint32Array],
  [5126, Float32Array],
]);
const COMPONENTS = new Map([
  ['SCALAR', 1],
  ['VEC2', 2],
  ['VEC3', 3],
  ['VEC4', 4],
]);

interface GltfJson {
  accessors: {
    bufferView: number;
    byteOffset?: number;
    componentType: number;
    count: number;
    type: string;
  }[];
  bufferViews: { byteOffset?: number; byteStride?: number }[];
  meshes: { primitives: { attributes: Record<string, number>; indices: number }[] }[];
}

/**
 * Minimal GLB reader. Deliberately not `GLTFLoader`: that needs a DOM, a
 * texture decoder and a network stack, none of which this assertion is about.
 */
function readGlb(file: string): { json: GltfJson; bin: Uint8Array } {
  const buffer = readFileSync(file);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let offset = 12;
  let json: GltfJson | null = null;
  let bin: Uint8Array | null = null;
  while (offset < buffer.byteLength) {
    const length = view.getUint32(offset, true);
    const kind = view.getUint32(offset + 4, true);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (kind === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(body)) as GltfJson;
    if (kind === 0x004e4942) bin = body;
    offset += 8 + length + ((4 - (length % 4)) % 4);
  }
  if (!json || !bin) throw new Error(`${file} is not a GLB with both a JSON and a BIN chunk`);
  return { json, bin };
}

function readAccessor(json: GltfJson, bin: Uint8Array, index: number): Float32Array {
  const accessor = json.accessors[index];
  const bufferView = json.bufferViews[accessor.bufferView];
  const Typed = COMPONENT_TYPE.get(accessor.componentType);
  const components = COMPONENTS.get(accessor.type);
  if (!Typed || !components)
    throw new Error(`unsupported accessor ${accessor.componentType}/${accessor.type}`);
  const base = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const stride = bufferView.byteStride ?? 0;
  const out = new Float32Array(accessor.count * components);
  const elementSize =
    components * (Typed as unknown as { BYTES_PER_ELEMENT: number }).BYTES_PER_ELEMENT;
  if (!stride || stride === elementSize) {
    const src = new Typed(bin.buffer, bin.byteOffset + base, accessor.count * components);
    for (let i = 0; i < out.length; i += 1) out[i] = src[i];
  } else {
    for (let i = 0; i < accessor.count; i += 1) {
      const src = new Typed(bin.buffer, bin.byteOffset + base + i * stride, components);
      for (let k = 0; k < components; k += 1) out[i * components + k] = src[k];
    }
  }
  return out;
}

describe('generated windmill sail split', () => {
  const { json, bin } = readGlb(GLB);
  const primitive = json.meshes[0].primitives[0];
  const raw = readAccessor(json, bin, primitive.attributes.POSITION);
  const indices = readAccessor(json, bin, primitive.indices);
  const position = new THREE.BufferAttribute(raw, 3);
  const weights = computeSailWeights(position);
  const radius = (i: number) =>
    Math.hypot(position.getY(i) - SAIL_HUB_Y, position.getZ(i) - SAIL_HUB_Z);

  it('reads one mesh with one primitive, which is what the split assumes', () => {
    expect(json.meshes).toHaveLength(1);
    expect(json.meshes[0].primitives).toHaveLength(1);
    expect(position.count).toBeGreaterThan(1000);
  });

  it('keeps both the static architecture and complete rigid rotor substantial without topology-share assumptions', () => {
    expect(weights.filter((w) => w === 1).length).toBeGreaterThan(500);
    expect(weights.filter((w) => w === 0).length).toBeGreaterThan(500);
    expect([...weights].every((w) => w === 0 || w === 1)).toBe(true);
    expect(position.count).toBeLessThanOrEqual(6989);
    expect(indices.length / 3).toBeLessThanOrEqual(8384);
  });

  it('has no blended bridge in the precision bearing assembly', () => {
    expect([...weights].filter((w) => w > 0 && w < 1)).toHaveLength(0);
  });

  it('gives every actual triangle a uniform static or turning weight', () => {
    for (let t = 0; t < indices.length; t += 3) {
      const a = weights[indices[t]],
        b = weights[indices[t + 1]],
        c = weights[indices[t + 2]];
      expect([b, c]).toEqual([a, a]);
    }
  });

  it('leaves the tower plinth behind', () => {
    // The only mass beyond the blade disc is the plinth at r 0.585-0.600. If a
    // regeneration moved the blades out past it, this catches the wedge of
    // ground plate that would otherwise orbit the mill.
    const turningRadius = [...weights.keys()].filter((i) => weights[i] > 0.5).map(radius);
    expect(Math.max(...turningRadius)).toBeLessThan(0.56);
  });

  it('bounds the swept envelope, not the rest pose', () => {
    const swept = sweptBounds(position, weights);
    const rest = new THREE.Box3();
    const point = new THREE.Vector3();
    for (let i = 0; i < position.count; i += 1) {
      rest.expandByPoint(point.set(position.getX(i), position.getY(i), position.getZ(i)));
    }
    // A blade tip swung a quarter turn leaves the rest box, so the swept box
    // has to be strictly larger in both axes the sails turn in - and must still
    // contain the rest pose.
    expect(swept.max.y).toBeGreaterThan(rest.max.y);
    expect(swept.max.z).toBeGreaterThan(rest.max.z);
    expect(swept.containsBox(rest)).toBe(true);
    expect(Number.isFinite(swept.getBoundingSphere(new THREE.Sphere()).radius)).toBe(true);
  });
});

describe('actual windmill section and cache ownership', () => {
  function sourceGeometry() {
    const { json, bin } = readGlb(GLB);
    const primitive = json.meshes[0].primitives[0];
    const geometry = new THREE.BufferGeometry();
    for (const [name, semantic, size] of [
      ['position', 'POSITION', 3],
      ['normal', 'NORMAL', 3],
      ['uv', 'TEXCOORD_0', 2],
    ] as const)
      geometry.setAttribute(
        name,
        new THREE.BufferAttribute(readAccessor(json, bin, primitive.attributes[semantic]), size)
      );
    geometry.setIndex(Array.from(readAccessor(json, bin, primitive.indices)));
    geometry.setAttribute(
      'aSailWeight',
      new THREE.BufferAttribute(
        computeSailWeights(geometry.getAttribute('position') as THREE.BufferAttribute),
        1
      )
    );
    return geometry;
  }
  it('clips crossing architecture with unit normals/UVs and retains every exact rotor triangle', () => {
    const source = sourceGeometry(),
      original = source.clone();
    const section = createWindmillCutawayGeometry(source);
    const plain = source.toNonIndexed();
    const rotor = (geometry: THREE.BufferGeometry) => {
      const weights = geometry.getAttribute('aSailWeight'),
        triangles: string[] = [];
      for (let i = 0; i < weights.count; i += 3)
        if (weights.getX(i) === 1)
          triangles.push(
            ['position', 'normal', 'uv']
              .flatMap((name) => {
                const attribute = geometry.getAttribute(name);
                return [i, i + 1, i + 2].flatMap((id) =>
                  Array.from({ length: attribute.itemSize }, (_, k) =>
                    attribute.getComponent(id, k)
                  )
                );
              })
              .join(',')
          );
      return triangles.sort();
    };
    expect(rotor(section)).toEqual(rotor(plain));
    expect(rotor(section).length).toBeGreaterThan(500);
    expect(source.index?.array).toEqual(original.index?.array);
    for (const name of Object.keys(source.attributes))
      expect(source.getAttribute(name).array).toEqual(original.getAttribute(name).array);
    const position = section.getAttribute('position'),
      normal = section.getAttribute('normal'),
      uv = section.getAttribute('uv'),
      weights = section.getAttribute('aSailWeight');
    let intersections = 0,
      bearing = 0;
    for (let i = 0; i < position.count; i++) {
      expect(Number.isFinite(uv.getX(i) + uv.getY(i))).toBe(true);
      if (weights.getX(i) === 1) continue;
      const isBearing =
        position.getX(i) > 0.166 &&
        Math.hypot(position.getY(i) - SAIL_HUB_Y, position.getZ(i) - SAIL_HUB_Z) < 0.028;
      if (isBearing) bearing++;
      else expect(position.getZ(i)).toBeLessThanOrEqual(WINDMILL_SECTION_Z + 1e-8);
      if (Math.abs(position.getZ(i) - WINDMILL_SECTION_Z) < 1e-8) {
        intersections++;
        expect(Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i))).toBeCloseTo(1, 5);
      }
    }
    expect(intersections).toBeGreaterThan(30);
    expect(bearing).toBeGreaterThan(50);
    for (let i = 0; i < position.count; i += 3) {
      if (weights.getX(i) === 1) continue;
      expect(
        [-0.438, 0.075, 0.065, 0.091].some((y) =>
          [i, i + 1, i + 2].every((id) => Math.abs(position.getY(id) - y) < 1e-6)
        ),
        JSON.stringify(
          [i, i + 1, i + 2].map((id) => [position.getX(id), position.getY(id), position.getZ(id)])
        )
      ).toBe(false);
    }
    const bounds = sweptBounds(position as THREE.BufferAttribute, weights.array as Float32Array);
    expect(bounds.getBoundingSphere(new THREE.Sphere()).radius).toBeGreaterThan(0.5);
    [source, original, plain, section].forEach((item) => item.dispose());
  });
  it('owns geometry/material/depth, shares only maps and one angle, and releases no cached resource', () => {
    const source = sourceGeometry(),
      map = new THREE.Texture(),
      material = new THREE.MeshStandardMaterial({ map });
    const mesh = new THREE.Mesh(source, material);
    mesh.position.set(0.00235, 3.40025, 0.00139);
    mesh.scale.setScalar(6.79571);
    const scene = new THREE.Group();
    scene.add(mesh);
    const cached = [source, material, map].map((item) => vi.spyOn(item, 'dispose'));
    const angle = { value: -0.4 },
      prepared = prepareWindmillModel(scene, angle),
      part = prepared.parts[0];
    expect(prepared.frame?.scale).toBe(6.79571);
    expect(prepared.frame?.origin).toEqual(mesh.position.toArray());
    expect(part.geometry).not.toBe(source);
    expect(part.material).not.toBe(material);
    expect((part.material as THREE.MeshStandardMaterial).map).toBe(map);
    const shaders = [part.material, part.depth].map((item) => {
      const shader = {
        vertexShader: '#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>',
        uniforms: {},
      };
      item.onBeforeCompile(
        shader as unknown as THREE.WebGLProgramParametersWithUniforms,
        {} as THREE.WebGLRenderer
      );
      return shader as { uniforms: Record<string, THREE.IUniform> };
    });
    expect(shaders[0].uniforms.uSailAngle).toBe(angle);
    expect(shaders[1].uniforms.uSailAngle).toBe(angle);
    const owned = [part.geometry, part.material, part.depth].map((item) =>
      vi.spyOn(item, 'dispose')
    );
    prepared.dispose();
    expect(owned.every((spy) => spy.mock.calls.length === 1)).toBe(true);
    expect(cached.every((spy) => spy.mock.calls.length === 0)).toBe(true);
    mesh.scale.y = 4;
    const incompatible = prepareWindmillModel(scene, angle);
    expect(incompatible.frame).toBeNull();
    incompatible.dispose();
    source.dispose();
    material.dispose();
    map.dispose();
  });
});
