import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { applyDeclinedWorldSurface, ownsOnlyWorldSurface } from '../../utils/worldSurface';

type R3FObjectState = {
  eventCount?: number;
  handlers?: Record<string, unknown>;
};

type BatchCandidate = {
  mesh: THREE.Mesh;
  matrixWorld: THREE.Matrix4;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  geometrySignature: string;
  geometryAttributeSignature: string;
  materialSignature: string;
  batchMaterialSignature: string;
  mergeMaterialSignature: string;
  instanceColor: THREE.Color | null;
};

type StaticBatch = {
  mesh: THREE.Mesh;
  originals: Array<{ mesh: THREE.Mesh; parent: THREE.Object3D; visible: boolean }>;
  ownsGeometry: boolean;
  ownsMaterial: boolean;
};

export interface StaticMeshBatchProps {
  children: React.ReactNode;
  name: string;
  revision?: string | number | boolean;
  minimumInstances?: number;
  sampleMilliseconds?: number;
  /**
   * Optional finish applied to every material this batcher PRODUCES.
   *
   * The batcher owns draw calls and has no opinion about how a surface should
   * look, so the art direction is a callback: see
   * `utils/worldSurface.applyBatchWorldSurface`, which is what every call site
   * in `MillScene` passes.
   *
   * WHY THE OUTPUT AND NOT THE SOURCE. `isSupportedMaterial` rejects any
   * material carrying an own `onBeforeCompile` or `customProgramCacheKey`, so
   * attaching a shader finish to a source material silently evicts that mesh
   * from batching for good - `FactoryExterior.tsx` chose decal quads over an
   * injection for exactly this reason, and `FarmArea.tsx` says "Do NOT do this
   * to a building material". Injecting on the clone the batcher just made costs
   * no candidate, no merge group and no draw call.
   *
   * `target` is that clone; `source` is the group's representative, which still
   * carries the roughness and metalness the merge key agreed on. Return the name
   * of whatever was applied, or null, and it is tallied into
   * `userData.staticBatchStats.surfaceProfiles`.
   */
  surface?: (target: THREE.Material, source: THREE.Material) => string | null;
}

export type StaticBatchDiagnostics = {
  totalMeshes: number;
  candidates: number;
  optimizedOriginals: number;
  batches: number;
  instancedOriginals: number;
  instancedBatches: number;
  mergedOriginals: number;
  mergedMeshes: number;
  exclusions: Record<string, number>;
  materialTypes: Record<string, number>;
  /**
   * How many output materials each `surface` profile was applied to, plus
   * `untreated` for the ones the callback declined.
   *
   * Reported because "the treatment reached nothing" and "the treatment is
   * working" are indistinguishable in every other instrument this repo has:
   * `audit-scene-models.mjs` marks a mesh finished on the mere presence of an
   * injection. An empty object here means no call site passed `surface`.
   */
  surfaceProfiles: Record<string, number>;
};

const DYNAMIC_NAME_PATTERN = /forklift|shipping-truck|receiving-truck/i;
const MATRIX_EPSILON = 1e-5;
const MINIMUM_MERGE_MESHES = 4;
const MERGE_CELL_SIZE_METRES = 80;
// Keep enough authored neighbours together for colour-compatible merging. The
// earlier 120-mesh slices split repeated fences, trim, vegetation, and village
// details across unrelated tasks, leaving most candidates as individual draw
// calls. A 512-candidate slice preserves useful local repetition without the
// runtime regression observed when the collection task was widened further.
const MAX_BATCH_CANDIDATES_PER_TASK = 512;
const MAX_CANDIDATE_SCAN_PER_TASK = 96;
const pendingStaticBatches = new Set<symbol>();

const publishPendingStaticBatchCount = (): void => {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.millosStaticBatchesPending = String(pendingStaticBatches.size);
};

const beginStaticBatch = (): symbol => {
  const token = Symbol('static-batch');
  pendingStaticBatches.add(token);
  publishPendingStaticBatchCount();
  return token;
};

const finishStaticBatch = (token: symbol): void => {
  pendingStaticBatches.delete(token);
  publishPendingStaticBatchCount();
};

const rounded = (value: number): number => Math.round(value * 10000) / 10000;

const signatureObjectIds = new WeakMap<object, number>();
let nextSignatureObjectId = 1;

const signatureObjectIdentity = (value: object): number => {
  const existing = signatureObjectIds.get(value);
  if (existing !== undefined) return existing;
  const identity = nextSignatureObjectId;
  nextSignatureObjectId += 1;
  signatureObjectIds.set(value, identity);
  return identity;
};

const textureSignature = (texture: THREE.Texture | null): string => {
  if (!texture) return 'none';
  const image = texture.source?.data as { currentSrc?: string; src?: string } | undefined;
  const extendedTexture = texture as THREE.Texture & {
    compareFunction?: number | null;
    wrapR?: number;
  };
  return [
    texture.constructor.name,
    texture.source?.uuid ?? texture.uuid,
    image?.currentSrc ?? image?.src ?? 'no-url',
    texture.colorSpace,
    texture.mapping,
    texture.channel,
    texture.wrapS,
    texture.wrapT,
    extendedTexture.wrapR ?? 'none',
    texture.magFilter,
    texture.minFilter,
    texture.anisotropy,
    texture.format,
    texture.internalFormat ?? 'none',
    texture.type,
    texture.repeat.x,
    texture.repeat.y,
    texture.offset.x,
    texture.offset.y,
    texture.center.x,
    texture.center.y,
    texture.rotation,
    texture.matrixAutoUpdate,
    texture.matrix.elements.join(','),
    texture.generateMipmaps,
    texture.premultiplyAlpha,
    texture.flipY,
    texture.unpackAlignment,
    extendedTexture.compareFunction ?? 'none',
    texture.mipmaps.length,
    ...texture.mipmaps.map((mipmap) =>
      typeof mipmap === 'object' && mipmap !== null
        ? signatureObjectIdentity(mipmap)
        : String(mipmap)
    ),
  ].join(':');
};

const vectorSignature = (value: THREE.Vector2 | THREE.Vector3 | null | undefined): string =>
  value ? value.toArray().map(rounded).join(',') : 'none';

const geometrySignature = (geometry: THREE.BufferGeometry): string => {
  const parameterizedGeometry = geometry as THREE.BufferGeometry & {
    parameters?: Record<string, unknown>;
  };
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  if (!geometry.boundingSphere) geometry.computeBoundingSphere();
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const sampleAttribute = (attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) => {
    const sample: number[] = [];
    const count = attribute.count;
    const indexes = [0, 1, 2, Math.max(0, count - 3), Math.max(0, count - 2), count - 1];
    indexes.forEach((index) => {
      if (index < 0 || index >= count) return;
      for (let component = 0; component < Math.min(attribute.itemSize, 3); component += 1) {
        sample.push(rounded(attribute.getComponent(index, component)));
      }
    });
    return sample.join(',');
  };
  return [
    geometry.type,
    JSON.stringify(parameterizedGeometry.parameters ?? {}),
    position?.count ?? 0,
    normal?.count ?? 0,
    geometry.index?.count ?? 0,
    vectorSignature(geometry.boundingBox?.min),
    vectorSignature(geometry.boundingBox?.max),
    rounded(geometry.boundingSphere?.radius ?? 0),
    position ? sampleAttribute(position) : '',
    normal ? sampleAttribute(normal) : '',
  ].join('|');
};

type MaterialSignatureOptions = { includeColor?: boolean; mergeCompatible?: boolean };

// R3F's enumerable ownership descriptor links back through the entire React
// scene. Signing it both separates visually identical materials by parent and
// recursively expands shared ownership paths. Only render state belongs here.
const MATERIAL_IDENTITY_KEYS = new Set([
  'id',
  'uuid',
  'name',
  'userData',
  'version',
  'type',
  '__r3f',
]);
const MERGE_QUANTIZED_KEYS = new Set(['roughness', 'metalness']);

const materialValueSignature = (
  key: string,
  value: unknown,
  options: MaterialSignatureOptions,
  ancestors: Set<object>
): string => {
  if (key === 'color' && options.includeColor === false) return 'vertex-color';
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (value instanceof THREE.Texture) return `texture:${textureSignature(value)}`;
  if (value instanceof THREE.Color) return `color:${value.r},${value.g},${value.b}`;
  if (typeof value === 'number') {
    return String(
      options.mergeCompatible && MERGE_QUANTIZED_KEYS.has(key) ? Math.round(value * 4) / 4 : value
    );
  }
  if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  if (typeof value === 'function') return `function:${signatureObjectIdentity(value)}`;
  if (typeof value === 'object') {
    if (ancestors.has(value)) return `cycle:${signatureObjectIdentity(value)}`;
    ancestors.add(value);
    try {
      if (Array.isArray(value)) {
        return `[${value
          .map((entry) => materialValueSignature(key, entry, options, ancestors))
          .join(',')}]`;
      }
      if ('toArray' in value && typeof value.toArray === 'function') {
        const array = value.toArray() as unknown[];
        return `[${array
          .map((entry) => materialValueSignature(key, entry, options, ancestors))
          .join(',')}]`;
      }
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) {
        return `object:${signatureObjectIdentity(value)}`;
      }
      return `{${Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(
          ([nestedKey, nestedValue]) =>
            `${nestedKey}:${materialValueSignature(nestedKey, nestedValue, options, ancestors)}`
        )
        .join(',')}}`;
    } finally {
      ancestors.delete(value);
    }
  }
  return String(value);
};

const materialSignature = (
  material: THREE.Material,
  options: MaterialSignatureOptions = {}
): string =>
  [
    material.type,
    ...Object.entries(material)
      .filter(([key, value]) => !MATERIAL_IDENTITY_KEYS.has(key) && typeof value !== 'function')
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}:${materialValueSignature(key, value, options, new Set())}`),
  ].join('|');

const getInstanceColor = (material: THREE.Material): THREE.Color | null => {
  const colorMaterial = material as THREE.Material & { color?: THREE.Color };
  if (
    material.transparent ||
    material.opacity < 1 ||
    !colorMaterial.color ||
    !(colorMaterial.color instanceof THREE.Color)
  ) {
    return null;
  }
  return colorMaterial.color.clone();
};

const geometryAttributeSignature = (geometry: THREE.BufferGeometry): string =>
  Object.entries(geometry.attributes)
    .map(([name, attribute]) =>
      [
        name,
        attribute.itemSize,
        attribute.normalized,
        attribute.array.constructor.name,
        'gpuType' in attribute ? attribute.gpuType : '',
      ].join(':')
    )
    .sort()
    .join('|');

const attributesHaveEqualData = (
  left: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  right: THREE.BufferAttribute | THREE.InterleavedBufferAttribute
): boolean => {
  const leftInterleaved = left instanceof THREE.InterleavedBufferAttribute;
  const rightInterleaved = right instanceof THREE.InterleavedBufferAttribute;
  if (
    left.itemSize !== right.itemSize ||
    left.count !== right.count ||
    left.normalized !== right.normalized ||
    left.array.constructor !== right.array.constructor ||
    left.array.length !== right.array.length ||
    leftInterleaved !== rightInterleaved
  ) {
    return false;
  }
  if (leftInterleaved && rightInterleaved) {
    if (left.offset !== right.offset || left.data.stride !== right.data.stride) return false;
  }
  for (let index = 0; index < left.array.length; index += 1) {
    if (!Object.is(left.array[index], right.array[index])) return false;
  }
  return true;
};

const geometriesHaveEqualRenderData = (
  left: THREE.BufferGeometry,
  right: THREE.BufferGeometry
): boolean => {
  if (left === right) return true;
  const leftNames = Object.keys(left.attributes).sort();
  const rightNames = Object.keys(right.attributes).sort();
  if (leftNames.length !== rightNames.length) return false;
  for (let index = 0; index < leftNames.length; index += 1) {
    const name = leftNames[index];
    if (name !== rightNames[index]) return false;
    if (!attributesHaveEqualData(left.getAttribute(name), right.getAttribute(name))) return false;
  }
  if (Boolean(left.index) !== Boolean(right.index)) return false;
  if (left.index && right.index && !attributesHaveEqualData(left.index, right.index)) return false;
  if (
    left.drawRange.start !== right.drawRange.start ||
    left.drawRange.count !== right.drawRange.count ||
    left.groups.length !== right.groups.length
  ) {
    return false;
  }
  return left.groups.every((group, index) => {
    const other = right.groups[index];
    return (
      other !== undefined &&
      group.start === other.start &&
      group.count === other.count &&
      group.materialIndex === other.materialIndex
    );
  });
};

const geometryRenderDataFingerprint = (
  geometry: THREE.BufferGeometry,
  cache: WeakMap<THREE.BufferGeometry, string>
): string => {
  const cached = cache.get(geometry);
  if (cached !== undefined) return cached;

  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  const updateByte = (value: number): void => {
    first = Math.imul(first ^ value, 0x01000193);
    second = Math.imul(second ^ value, 0x85ebca6b);
  };
  const updateText = (value: unknown): void => {
    const text = String(value);
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      updateByte(code & 0xff);
      updateByte(code >>> 8);
    }
    updateByte(0xff);
  };
  const updateAttribute = (
    name: string,
    attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute
  ): void => {
    const interleaved = attribute instanceof THREE.InterleavedBufferAttribute;
    const array = attribute.array;
    updateText(name);
    updateText(attribute.itemSize);
    updateText(attribute.count);
    updateText(attribute.normalized);
    updateText(array.constructor.name);
    updateText('gpuType' in attribute ? attribute.gpuType : '');
    updateText(interleaved);
    if (interleaved) {
      updateText(attribute.offset);
      updateText(attribute.data.stride);
    }
    const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    for (const byte of bytes) updateByte(byte);
  };

  for (const [name, attribute] of Object.entries(geometry.attributes).sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    updateAttribute(name, attribute);
  }
  if (geometry.index) updateAttribute('index', geometry.index);
  else updateText('no-index');
  updateText(geometry.drawRange.start);
  updateText(geometry.drawRange.count);
  for (const group of geometry.groups) {
    updateText(group.start);
    updateText(group.count);
    updateText(group.materialIndex);
  }

  const fingerprint = `${first >>> 0}:${second >>> 0}`;
  cache.set(geometry, fingerprint);
  return fingerprint;
};

const partitionByGeometryData = (candidates: BatchCandidate[]): BatchCandidate[][] => {
  const fingerprintCache = new WeakMap<THREE.BufferGeometry, string>();
  const buckets = new Map<string, BatchCandidate[][]>();
  for (const candidate of candidates) {
    const fingerprint = geometryRenderDataFingerprint(candidate.geometry, fingerprintCache);
    const groups = buckets.get(fingerprint) ?? [];
    const existing = groups.find((group) =>
      geometriesHaveEqualRenderData(group[0].geometry, candidate.geometry)
    );
    if (existing) existing.push(candidate);
    else groups.push([candidate]);
    if (!buckets.has(fingerprint)) buckets.set(fingerprint, groups);
  }
  return [...buckets.values()].flat();
};

const createMergedGeometry = (
  group: BatchCandidate[],
  inverseRoot: THREE.Matrix4
): THREE.BufferGeometry | null => {
  const relativeMatrix = new THREE.Matrix4();
  const geometries: THREE.BufferGeometry[] = [];

  for (const candidate of group) {
    const source = candidate.mesh.geometry;
    const geometry = source.index ? source.toNonIndexed() : source.clone();
    relativeMatrix.multiplyMatrices(inverseRoot, candidate.mesh.matrixWorld);
    geometry.applyMatrix4(relativeMatrix);

    const position = geometry.getAttribute('position');
    if (!position || !candidate.instanceColor) {
      geometry.dispose();
      geometries.forEach((item) => item.dispose());
      return null;
    }

    const sourceColor = geometry.getAttribute('color');
    const colors = new Float32Array(position.count * 3);
    for (let index = 0; index < position.count; index += 1) {
      const offset = index * 3;
      colors[offset] = candidate.instanceColor.r * (sourceColor ? sourceColor.getX(index) : 1);
      colors[offset + 1] = candidate.instanceColor.g * (sourceColor ? sourceColor.getY(index) : 1);
      colors[offset + 2] = candidate.instanceColor.b * (sourceColor ? sourceColor.getZ(index) : 1);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometries.push(geometry);
  }

  const merged = mergeGeometries(geometries, false) ?? null;
  geometries.forEach((geometry) => geometry.dispose());
  return merged;
};

const hasInteractionHandlers = (object: THREE.Object3D): boolean => {
  const state = (object as THREE.Object3D & { __r3f?: R3FObjectState }).__r3f;
  return Boolean(
    state && ((state.eventCount ?? 0) > 0 || Object.keys(state.handlers ?? {}).length > 0)
  );
};

const hasExcludedAncestor = (mesh: THREE.Mesh, root: THREE.Group): boolean => {
  let object: THREE.Object3D | null = mesh;
  while (object && object !== root) {
    if (
      object.visible === false ||
      object.userData.noStaticBatch === true ||
      object.userData.dynamic === true ||
      DYNAMIC_NAME_PATTERN.test(object.name) ||
      hasInteractionHandlers(object)
    ) {
      return true;
    }
    object = object.parent;
  }
  return object !== root;
};

const countPotentialStaticMeshes = (root: THREE.Group): number => {
  let count = 0;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (object.visible) count += 1;
  });
  return count;
};

/**
 * Apply the analytic finish to a material this batcher will never reach.
 *
 * Tallied into the same `surfaceProfiles` record as the batch outputs, under a
 * `declined:` prefix, because "the sweep silently reached nothing" is the
 * failure worth being able to see - and it is exactly what happened to
 * `WORLD_SURFACE_PROFILES.vegetation` for two passes.
 *
 * TWO THINGS THIS SIGNATURE IS CARRYING, both found by a test rather than by
 * reading. The counts live on the COLLECTION, not on the module: a
 * module-level tally accumulates across every batch root and across every
 * re-run, so the diagnostics would climb forever and never describe one tree.
 * And the sweep is gated on the caller having asked for finishing at all -
 * mounting `StaticMeshBatch` without a `surface` prop says "batch this, do not
 * restyle it", and a sweep that finished the declined meshes anyway would
 * silently overrule that.
 */
const finishDeclined = (
  material: THREE.Material | THREE.Material[],
  collection: CandidateCollection
): void => {
  if (!collection.finishDeclined) return;
  const list = Array.isArray(material) ? material : [material];
  for (const entry of list) {
    const applied = applyDeclinedWorldSurface(entry);
    if (!applied) continue;
    const key = `declined:${applied}`;
    collection.declinedProfiles[key] = (collection.declinedProfiles[key] ?? 0) + 1;
  }
};

const isSupportedMaterial = (material: THREE.Material): boolean => {
  const supported =
    material instanceof THREE.MeshBasicMaterial ||
    material instanceof THREE.MeshLambertMaterial ||
    material instanceof THREE.MeshPhongMaterial ||
    material instanceof THREE.MeshStandardMaterial ||
    material instanceof THREE.MeshPhysicalMaterial;
  if (!supported) return false;
  if (material.clippingPlanes?.length) return false;
  // An own injection normally disqualifies a material: two different injected
  // programs cannot be merged, and there is no general way to tell one from
  // another. The world surface treatment is the one exception this batcher can
  // verify - every profile shares a single `customProgramCacheKey` and differs
  // only in uniform VALUES, and `ownsOnlyWorldSurface` proves the identity by
  // object reference rather than by name.
  //
  // Without the exemption, applying the finish to a mesh this batcher declined
  // to batch would evict that mesh from batching for ever, and the eviction
  // would only show up as a draw-call regression several passes later. That is
  // precisely the trap `FactoryExterior.tsx` records at its GRAVITY WEATHERING
  // block and `FarmArea.tsx` at the crop shader.
  //
  // ONLY, though. `composeWorldSurface` stacks the treatment on top of a host
  // injection - the wind sway - and merging re-applies the treatment to a clone
  // while `Material.copy()` silently drops the host. A composed material must
  // stay out, and every one of them is consumed by an `InstancedMesh` that this
  // function is never reached for anyway; this is the belt to that braces.
  if (
    Object.hasOwn(material, 'onBeforeCompile') ||
    Object.hasOwn(material, 'customProgramCacheKey')
  ) {
    return ownsOnlyWorldSurface(material);
  }
  return true;
};

type CandidateCollection = {
  candidates: BatchCandidate[];
  exclusions: Record<string, number>;
  materialTypes: Record<string, number>;
  totalMeshes: number;
  /** Whether the caller asked for a finish at all; see `finishDeclined`. */
  finishDeclined: boolean;
  declinedProfiles: Record<string, number>;
};

const createCandidateCollection = (finishDeclinedMeshes: boolean): CandidateCollection => ({
  candidates: [],
  exclusions: {},
  materialTypes: {},
  totalMeshes: 0,
  finishDeclined: finishDeclinedMeshes,
  declinedProfiles: {},
});

const inspectStaticBatchObject = (
  object: THREE.Object3D,
  root: THREE.Group,
  collection: CandidateCollection
): void => {
  if (!(object instanceof THREE.Mesh)) return;
  collection.totalMeshes += 1;
  const exclude = (reason: string): void => {
    collection.exclusions[reason] = (collection.exclusions[reason] ?? 0) + 1;
  };
  // FINISH WHAT WE DECLINE. These two exclusions are permanent - an
  // `InstancedMesh` and anything under a dynamic or interactive ancestor will
  // never be a batch candidate - so their materials reach the frame with
  // whatever finish their owning module gave them, which for hundreds of inline
  // JSX elements in `FactoryExterior` and `TruckBay` is none. Treating them
  // here costs no draw call (they are already outside every batch) and no
  // shader permutation (one shared cache key), and it is the only pass that can
  // reach them without editing several hundred call sites.
  //
  // `skinned` is deliberately NOT swept. The workers and forklift operators
  // carry hand-authored per-semantic profiles from their own modules, and the
  // nine generated creatures are a stated closure on aliasing-floor grounds -
  // see `models/RiggedCreatureModel.tsx`. A blanket sweep would silently
  // overturn both.
  if (object instanceof THREE.InstancedMesh) {
    finishDeclined(object.material, collection);
    return exclude('instanced');
  }
  if (object instanceof THREE.SkinnedMesh) return exclude('skinned');
  if (!object.visible) return exclude('hidden');
  if (!object.geometry) return exclude('missingGeometry');
  if (Object.keys(object.geometry.morphAttributes).length > 0) return exclude('morph');
  if (Array.isArray(object.material)) return exclude('materialArray');
  collection.materialTypes[object.material.type] =
    (collection.materialTypes[object.material.type] ?? 0) + 1;
  if (!isSupportedMaterial(object.material)) return exclude('unsupportedMaterial');
  if (hasExcludedAncestor(object, root)) {
    finishDeclined(object.material, collection);
    return exclude('dynamicOrInteractive');
  }
  const instanceColor = getInstanceColor(object.material);
  collection.candidates.push({
    mesh: object,
    matrixWorld: object.matrixWorld.clone(),
    geometry: object.geometry,
    material: object.material,
    geometrySignature: geometrySignature(object.geometry),
    geometryAttributeSignature: geometryAttributeSignature(object.geometry),
    materialSignature: materialSignature(object.material),
    batchMaterialSignature: materialSignature(object.material, {
      includeColor: !instanceColor,
    }),
    mergeMaterialSignature: materialSignature(object.material, {
      includeColor: false,
      mergeCompatible: true,
    }),
    instanceColor,
  });
};

const finalizeCandidateCollection = (
  root: THREE.Group,
  collection: CandidateCollection
): BatchCandidate[] => {
  root.userData.staticBatchStats = {
    totalMeshes: collection.totalMeshes,
    candidates: collection.candidates.length,
    optimizedOriginals: 0,
    batches: 0,
    instancedOriginals: 0,
    instancedBatches: 0,
    mergedOriginals: 0,
    mergedMeshes: 0,
    exclusions: collection.exclusions,
    materialTypes: collection.materialTypes,
    surfaceProfiles: { ...collection.declinedProfiles },
  } satisfies StaticBatchDiagnostics;
  return collection.candidates;
};

/**
 * Keep compatible candidates adjacent before bounded startup chunking. Lazy
 * module resolution can change scene-traversal order without changing the
 * authored world; slicing that incidental order allowed a compatible group to
 * straddle a 512-candidate boundary and made the final draw-call count vary.
 *
 * Spatial cell and render-state fields remain ahead of material affinity so
 * the existing culling and compatibility contracts are unchanged. Sorting a
 * copy also preserves the collection order used by diagnostics and callers.
 */
export const orderStaticBatchCandidatesForChunking = (
  root: THREE.Group,
  candidates: readonly BatchCandidate[]
): BatchCandidate[] => {
  const inverseRoot = root.matrixWorld.clone().invert();
  const relativeMatrix = new THREE.Matrix4();
  const relativePosition = new THREE.Vector3();
  const keyed = candidates.map((candidate) => {
    relativeMatrix.multiplyMatrices(inverseRoot, candidate.matrixWorld);
    relativePosition.setFromMatrixPosition(relativeMatrix);
    const cellX = Math.floor(relativePosition.x / MERGE_CELL_SIZE_METRES);
    const cellZ = Math.floor(relativePosition.z / MERGE_CELL_SIZE_METRES);
    const { mesh } = candidate;
    return {
      candidate,
      key: [
        cellX,
        cellZ,
        mesh.castShadow,
        mesh.receiveShadow,
        mesh.renderOrder,
        mesh.layers.mask,
        candidate.mergeMaterialSignature,
        candidate.geometryAttributeSignature,
        candidate.batchMaterialSignature,
        candidate.geometrySignature,
      ].join('||'),
    };
  });

  keyed.sort((left, right) => left.key.localeCompare(right.key));
  return keyed.map(({ candidate }) => candidate);
};

export const collectStaticBatchCandidates = (
  root: THREE.Group,
  finishDeclinedMeshes = false
): BatchCandidate[] => {
  root.updateWorldMatrix(true, true);
  const collection = createCandidateCollection(finishDeclinedMeshes);
  root.traverse((object) => inspectStaticBatchObject(object, root, collection));
  return finalizeCandidateCollection(root, collection);
};

const collectStaticBatchCandidatesIncrementally = (
  root: THREE.Group,
  schedule: (callback: () => void) => void,
  isCancelled: () => boolean,
  onComplete: (candidates: BatchCandidate[]) => void,
  finishDeclinedMeshes = false
): void => {
  root.updateWorldMatrix(true, true);
  const meshes: THREE.Mesh[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) meshes.push(object);
  });
  const collection = createCandidateCollection(finishDeclinedMeshes);

  const processSlice = (start: number): void => {
    if (isCancelled()) return;
    const end = Math.min(meshes.length, start + MAX_CANDIDATE_SCAN_PER_TASK);
    for (let index = start; index < end; index += 1) {
      const mesh = meshes[index];
      if (mesh) inspectStaticBatchObject(mesh, root, collection);
    }
    if (end < meshes.length) {
      schedule(() => processSlice(end));
      return;
    }
    onComplete(finalizeCandidateCollection(root, collection));
  };

  processSlice(0);
};

const matrixIsStable = (before: THREE.Matrix4, after: THREE.Matrix4): boolean =>
  before.elements.every(
    (value, index) => Math.abs(value - (after.elements[index] ?? value)) <= MATRIX_EPSILON
  );

export const createStaticMeshBatches = (
  root: THREE.Group,
  candidates: BatchCandidate[],
  name: string,
  minimumInstances: number,
  surface?: StaticMeshBatchProps['surface']
): StaticBatch[] => {
  root.updateWorldMatrix(true, true);
  const inverseRoot = root.matrixWorld.clone().invert();
  const relativeMatrix = new THREE.Matrix4();
  const relativePosition = new THREE.Vector3();
  const batches: StaticBatch[] = [];
  const optimizedOriginals = new Set<THREE.Mesh>();
  let instancedBatchCount = 0;
  let instancedOriginalCount = 0;
  let mergedOriginalCount = 0;
  let mergedMeshCount = 0;
  let batchIndex = 0;
  const surfaceProfileCounts: Record<string, number> = {};
  /**
   * Apply the caller's finish to one output material and tally the result.
   *
   * Both output paths route through here so the merged and instanced arms can
   * never diverge on which materials get treated - the instanced arm is easy to
   * forget precisely because it sometimes REUSES the representative's material
   * rather than cloning it, and treating that shared instance would reach back
   * into unbatched meshes. Guarded below at the call site.
   */
  const finishMaterial = (target: THREE.Material, source: THREE.Material): void => {
    if (!surface) return;
    const applied = surface(target, source) ?? 'untreated';
    surfaceProfileCounts[applied] = (surfaceProfileCounts[applied] ?? 0) + 1;
  };

  const stableCandidates = candidates.filter((candidate) => {
    const { mesh } = candidate;
    return Boolean(
      mesh.parent &&
      mesh.visible &&
      !hasExcludedAncestor(mesh, root) &&
      matrixIsStable(candidate.matrixWorld, mesh.matrixWorld) &&
      mesh.geometry === candidate.geometry &&
      mesh.material === candidate.material
    );
  });

  // Draw-call cost dominates this authored low-poly world. Merge compatible opaque
  // meshes first, within bounded spatial cells so frustum culling remains useful.
  const mergeGroups = new Map<string, BatchCandidate[]>();
  stableCandidates.forEach((candidate) => {
    const { mesh } = candidate;
    if (!candidate.instanceColor || !mesh.parent) return;

    relativeMatrix.multiplyMatrices(inverseRoot, mesh.matrixWorld);
    relativePosition.setFromMatrixPosition(relativeMatrix);
    const cellX = Math.floor(relativePosition.x / MERGE_CELL_SIZE_METRES);
    const cellZ = Math.floor(relativePosition.z / MERGE_CELL_SIZE_METRES);
    const key = [
      candidate.mergeMaterialSignature,
      candidate.geometryAttributeSignature,
      mesh.castShadow,
      mesh.receiveShadow,
      mesh.renderOrder,
      mesh.layers.mask,
      cellX,
      cellZ,
    ].join('||');
    const group = mergeGroups.get(key);
    if (group) group.push(candidate);
    else mergeGroups.set(key, [candidate]);
  });

  mergeGroups.forEach((group) => {
    const activeGroup = group.filter(
      (candidate) => candidate.mesh.parent && !optimizedOriginals.has(candidate.mesh)
    );
    if (activeGroup.length < MINIMUM_MERGE_MESHES) return;
    const representative = activeGroup[0]?.mesh;
    if (!representative || Array.isArray(representative.material)) return;
    const geometry = createMergedGeometry(activeGroup, inverseRoot);
    if (!geometry) return;

    const material = representative.material.clone() as THREE.Material & {
      color: THREE.Color;
      vertexColors: boolean;
    };
    material.color.set(0xffffff);
    material.vertexColors = true;
    material.needsUpdate = true;
    // The clone, never `representative.material` - the source has to stay free
    // of an own `onBeforeCompile` or `isSupportedMaterial` will stop treating it
    // as a candidate on the next pass. The source is passed in read-only, for
    // the roughness and metalness the merge key agreed on.
    finishMaterial(material, representative.material);

    const mergedMesh = new THREE.Mesh(geometry, material);
    mergedMesh.name = `static-merge:${name}:${batchIndex}`;
    mergedMesh.castShadow = representative.castShadow;
    mergedMesh.receiveShadow = representative.receiveShadow;
    mergedMesh.renderOrder = representative.renderOrder;
    mergedMesh.layers.mask = representative.layers.mask;
    mergedMesh.userData.staticBatch = true;

    const originals: StaticBatch['originals'] = [];
    activeGroup.forEach((candidate) => {
      const parent = candidate.mesh.parent;
      if (!parent) return;
      originals.push({ mesh: candidate.mesh, parent, visible: candidate.mesh.visible });
      parent.remove(candidate.mesh);
      optimizedOriginals.add(candidate.mesh);
    });
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    root.add(mergedMesh);
    batches.push({
      mesh: mergedMesh,
      originals,
      ownsGeometry: true,
      ownsMaterial: true,
    });
    mergedOriginalCount += originals.length;
    mergedMeshCount += 1;
    batchIndex += 1;
  });

  // Preserve exact small repeats as instances after the broader opaque merge.
  // Transparent meshes stay on this path because independent merge ordering is unsafe.
  const instanceGroups = new Map<string, BatchCandidate[]>();
  stableCandidates.forEach((candidate) => {
    const { mesh } = candidate;
    if (!mesh.parent || optimizedOriginals.has(mesh)) return;
    const key = [
      candidate.geometrySignature,
      candidate.geometryAttributeSignature,
      candidate.batchMaterialSignature,
      mesh.castShadow,
      mesh.receiveShadow,
      mesh.renderOrder,
      mesh.layers.mask,
    ].join('||');
    const group = instanceGroups.get(key);
    if (group) group.push(candidate);
    else instanceGroups.set(key, [candidate]);
  });

  instanceGroups.forEach((coarseGroup) => {
    partitionByGeometryData(coarseGroup).forEach((group) => {
      const activeGroup = group.filter(
        (candidate) => candidate.mesh.parent && !optimizedOriginals.has(candidate.mesh)
      );
      if (activeGroup.length < minimumInstances) return;
      const representative = activeGroup[0]?.mesh;
      if (!representative || Array.isArray(representative.material)) return;

      const usesInstanceColor = activeGroup.every((candidate) => candidate.instanceColor);
      const batchMaterial = usesInstanceColor
        ? (representative.material as THREE.Material).clone()
        : representative.material;
      if (usesInstanceColor) {
        const colorMaterial = batchMaterial as THREE.Material & {
          color: THREE.Color;
          vertexColors: boolean;
        };
        colorMaterial.color.set(0xffffff);
        // NOT `vertexColors = true`, which is what turned three shops, two
        // cottages, the whole truck yard and the dock openings black - 122 meshes
        // across the app, every one of them rendering with zero diffuse.
        //
        // `instanceColor` does not need it and is broken by it. three defines
        // `USE_INSTANCING_COLOR` from `object.instanceColor !== null` on its own
        // (`WebGLPrograms.js`), and that define alone declares the `vColor`
        // varying, initialises it to `vec3(1.0)` and multiplies it by
        // `instanceColor` - while the FRAGMENT side defines `USE_COLOR` from
        // `vertexColors || instancingColor || batchingColor`, so the tint still
        // reaches `diffuseColor`. Setting `vertexColors` additionally defines
        // `USE_COLOR` in the VERTEX shader, which inserts `vColor *= color`
        // against a `color` attribute the geometry does not have. An unbound
        // attribute reads as the WebGL generic default `(0, 0, 0, 1)`, so vColor
        // is multiplied by zero and the surface loses all of its diffuse.
        //
        // The merge path a hundred lines above may keep its `vertexColors = true`
        // precisely because `createMergedGeometry` writes a `color` attribute
        // into every geometry it builds. This path reuses the representative's
        // geometry untouched, so it has whatever the source had - and for every
        // generated GLB in this repo that is `[position, normal, uv]`.
        //
        // Left as the clone's inherited value rather than forced either way: a
        // source material that genuinely paints from a `color` attribute keeps
        // doing so, because its geometry supplies one.
        colorMaterial.needsUpdate = true;
        // Inside the `usesInstanceColor` branch on purpose. When it is false this
        // path REUSES `representative.material` rather than cloning it, and that
        // instance is shared with meshes this batch never touched and is not
        // disposed by `restoreBatches` (`ownsMaterial: usesInstanceColor`).
        // Treating it would attach an `onBeforeCompile` to a live source material,
        // which is the one thing that permanently evicts a mesh from batching.
        //
        // Nothing is lost by the guard: `getInstanceColor` returns null exactly
        // for transparent, sub-unit-opacity or colourless materials, and
        // `resolveBatchSurfaceProfile` declines all of those anyway.
        finishMaterial(batchMaterial, representative.material);
      }
      const instance = new THREE.InstancedMesh(
        representative.geometry,
        batchMaterial,
        activeGroup.length
      );
      instance.name = `static-batch:${name}:${batchIndex}`;
      instance.castShadow = representative.castShadow;
      instance.receiveShadow = representative.receiveShadow;
      instance.renderOrder = representative.renderOrder;
      instance.layers.mask = representative.layers.mask;
      instance.userData.staticBatch = true;

      const originals: StaticBatch['originals'] = [];
      activeGroup.forEach((candidate, index) => {
        relativeMatrix.multiplyMatrices(inverseRoot, candidate.mesh.matrixWorld);
        instance.setMatrixAt(index, relativeMatrix);
        if (usesInstanceColor && candidate.instanceColor) {
          instance.setColorAt(index, candidate.instanceColor);
        }
        const parent = candidate.mesh.parent;
        if (!parent) return;
        originals.push({ mesh: candidate.mesh, parent, visible: candidate.mesh.visible });
        parent.remove(candidate.mesh);
        optimizedOriginals.add(candidate.mesh);
      });
      instance.instanceMatrix.needsUpdate = true;
      if (instance.instanceColor) instance.instanceColor.needsUpdate = true;
      instance.computeBoundingBox();
      instance.computeBoundingSphere();
      root.add(instance);
      batches.push({
        mesh: instance,
        originals,
        ownsGeometry: false,
        ownsMaterial: usesInstanceColor,
      });
      instancedOriginalCount += originals.length;
      instancedBatchCount += 1;
      batchIndex += 1;
    });
  });

  // Everything the batcher looked at and left alone still has to be finished.
  //
  // A branch like `authored-factory-exterior` offers 2,094 candidates and
  // optimises most of them, but the remainder - groups under
  // `MINIMUM_MERGE_MESHES`, singletons, anything whose neighbours went to a
  // different 80 m cell - stays as individual meshes with their inline
  // `<meshStandardMaterial>` untouched. Those are hundreds of authored surfaces,
  // and finishing only the ones that happened to batch would leave the scene
  // half-treated in a pattern determined by spatial cell boundaries, which is
  // the least explicable seam possible.
  //
  // Safe because `isSupportedMaterial` now exempts this module's own injection:
  // a leftover treated on this pass is still a candidate on the next one.
  if (surface) {
    const finishedSources = new Set<THREE.Material>();
    stableCandidates.forEach((candidate) => {
      if (optimizedOriginals.has(candidate.mesh)) return;
      const material = candidate.mesh.material;
      if (Array.isArray(material) || finishedSources.has(material)) return;
      finishedSources.add(material);
      finishMaterial(material, material);
    });
  }

  const existingDiagnostics = root.userData.staticBatchStats as StaticBatchDiagnostics | undefined;
  if (existingDiagnostics) {
    // ACCUMULATED, not assigned. `StaticMeshBatch` slices its candidates into
    // 512-mesh chunks and calls this function once per chunk, while
    // `finalizeCandidateCollection` zeroes these fields once per collection
    // pass. Assigning made every counter here report the LAST CHUNK ONLY, so a
    // branch that batched 171 meshes across four chunks reported whatever the
    // fourth chunk happened to do. Nothing consumed them closely enough to
    // notice until `surfaceProfiles` needed to be trustworthy.
    existingDiagnostics.optimizedOriginals += batches.reduce(
      (total, batch) => total + batch.originals.length,
      0
    );
    existingDiagnostics.batches += batches.length;
    existingDiagnostics.instancedOriginals += instancedOriginalCount;
    existingDiagnostics.instancedBatches += instancedBatchCount;
    existingDiagnostics.mergedOriginals += mergedOriginalCount;
    existingDiagnostics.mergedMeshes += mergedMeshCount;
    Object.entries(surfaceProfileCounts).forEach(([profile, count]) => {
      existingDiagnostics.surfaceProfiles[profile] =
        (existingDiagnostics.surfaceProfiles[profile] ?? 0) + count;
    });
  }

  return batches;
};

const restoreBatches = (root: THREE.Group, batches: StaticBatch[]): void => {
  batches.forEach((batch) => {
    root.remove(batch.mesh);
    if (batch.ownsGeometry) batch.mesh.geometry.dispose();
    if (batch.ownsMaterial) {
      const materials = Array.isArray(batch.mesh.material)
        ? batch.mesh.material
        : [batch.mesh.material];
      materials.forEach((material) => material.dispose());
    }
    batch.originals.forEach(({ mesh, parent, visible }) => {
      mesh.visible = visible;
      parent.add(mesh);
    });
  });
};

export const StaticMeshBatch: React.FC<StaticMeshBatchProps> = ({
  children,
  name,
  revision = 0,
  minimumInstances = 2,
  sampleMilliseconds = 650,
  surface,
}) => {
  const rootRef = useRef<THREE.Group>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const pendingToken = beginStaticBatch();
    root.userData.staticBatchReady = false;
    let batchFinished = false;
    let cancelled = false;
    let pollTimer = 0;
    let sampleTimer = 0;
    const batchTimers: number[] = [];
    let previousCount = -1;
    let stablePolls = 0;
    const batches: StaticBatch[] = [];
    const markFinished = (): void => {
      if (batchFinished) return;
      batchFinished = true;
      root.userData.staticBatchReady = true;
      finishStaticBatch(pendingToken);
    };

    const poll = (): void => {
      if (cancelled) return;
      const candidateCount = countPotentialStaticMeshes(root);
      if (candidateCount > 0 && candidateCount === previousCount) stablePolls += 1;
      else stablePolls = 0;
      previousCount = candidateCount;

      if (stablePolls >= 2) {
        const schedule = (callback: () => void): void => {
          batchTimers.push(window.setTimeout(callback, 0));
        };
        collectStaticBatchCandidatesIncrementally(
          root,
          schedule,
          () => cancelled,
          (candidates) => {
            sampleTimer = window.setTimeout(() => {
              if (cancelled) return;
              const orderedCandidates = orderStaticBatchCandidatesForChunking(root, candidates);
              const candidateChunks: BatchCandidate[][] = [];
              for (
                let start = 0;
                start < orderedCandidates.length;
                start += MAX_BATCH_CANDIDATES_PER_TASK
              ) {
                candidateChunks.push(
                  orderedCandidates.slice(start, start + MAX_BATCH_CANDIDATES_PER_TASK)
                );
              }

              const processChunk = (index: number): void => {
                if (cancelled) return;
                if (index >= candidateChunks.length) {
                  markFinished();
                  return;
                }
                const chunk = candidateChunks[index];
                if (chunk) {
                  batches.push(
                    ...createStaticMeshBatches(
                      root,
                      chunk,
                      `${name}:${index}`,
                      minimumInstances,
                      surface
                    )
                  );
                }
                if (index + 1 < candidateChunks.length) {
                  schedule(() => processChunk(index + 1));
                } else {
                  markFinished();
                }
              };
              processChunk(0);
            }, sampleMilliseconds);
          },
          Boolean(surface)
        );
        return;
      }
      pollTimer = window.setTimeout(poll, 250);
    };

    pollTimer = window.setTimeout(poll, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(pollTimer);
      window.clearTimeout(sampleTimer);
      batchTimers.forEach((timer) => window.clearTimeout(timer));
      restoreBatches(root, batches);
      markFinished();
    };
  }, [minimumInstances, name, revision, sampleMilliseconds, surface]);

  return (
    <group ref={rootRef} name={name}>
      {children}
    </group>
  );
};
