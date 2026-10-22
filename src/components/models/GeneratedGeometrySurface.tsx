/** Tripo geometry/UVs on an existing mesh, retaining its ref, picking and animation. */
import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { ThreeElements } from '@react-three/fiber';
import { GeneratedBoundary } from './GeneratedModel';
import { useDracoGLTF } from '../../utils/dracoLoader';
import { GENERATED_ASSET_PATHS, type GeneratedAssetId } from '../../utils/modelLoader';
import {
  applyWorldSurface,
  hasWorldSurface,
  resolveSurfaceProfile,
} from '../../utils/worldSurface';

/** Keep procedural maps on authored UVs; the new normal atlas uses UV channel 1. */
function retainAuthoredUVs(geometry: THREE.BufferGeometry, original: THREE.BufferGeometry) {
  const atlas = geometry.getAttribute('uv');
  if (!atlas) throw new Error('Generated atlas UVs are required');
  const source = original.index ? original.toNonIndexed() : original;
  const target = geometry.index ? geometry.toNonIndexed() : geometry;
  const a = source.getAttribute('position');
  const b = target.getAttribute('position');
  const uv = source.getAttribute('uv');
  const uvValues = new Float32Array(b.count * 2);
  // Template strings, not `[...].map().join(',')`: the same text (ToString of
  // each integer, so -0 still reads "0") without three arrays per vertex.
  const key = (p: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number) =>
    `${Math.round(p.getX(i) * 100000)},${Math.round(p.getY(i) * 100000)},${Math.round(p.getZ(i) * 100000)}`;
  const triangleKey = (p: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number) =>
    [key(p, i), key(p, i + 1), key(p, i + 2)].sort().join(';');
  // Float32 atlas round-trips can cross a decimal hash boundary. Search adjacent
  // spatial cells, then verify actual distances and winding rather than rounding.
  source.computeBoundingBox();
  const tolerance = Math.max(1, source.boundingBox!.getSize(new THREE.Vector3()).length()) * 1e-6;
  const cell = (p: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number) =>
    [p.getX(i), p.getY(i), p.getZ(i)].map((v) => Math.floor(v / tolerance));
  const close = (i: number, j: number) =>
    Math.hypot(b.getX(i) - a.getX(j), b.getY(i) - a.getY(j), b.getZ(i) - a.getZ(j)) <= tolerance;
  const triangles = new Map<string, number[]>();
  for (let i = 0; i < a.count; i += 3) {
    const k = triangleKey(a, i);
    const matches = triangles.get(k);
    if (matches) matches.push(i);
    else triangles.set(k, [i]);
  }
  // The spatial cells only serve a triangle whose rounded key found no match,
  // so they are built on the first such triangle. Bucket order is ascending
  // source triangle either way, which is all the search below depends on.
  let cells: Map<string, Set<number>> | null = null;
  const spatialCells = () => {
    if (cells) return cells;
    cells = new Map<string, Set<number>>();
    for (let i = 0; i < a.count; i += 3)
      for (let corner = 0; corner < 3; corner++) {
        const c = cell(a, i + corner).join(',');
        const bucket = cells.get(c) ?? new Set<number>();
        bucket.add(i);
        cells.set(c, bucket);
      }
    return cells;
  };
  // First winding shift of source triangle `j` that lands on target triangle `i`.
  const assign = (i: number, j: number) => {
    for (let shift = 0; shift < 3; shift++) {
      if (
        !close(i, j + (shift % 3)) ||
        !close(i + 1, j + ((1 + shift) % 3)) ||
        !close(i + 2, j + ((2 + shift) % 3))
      )
        continue;
      for (let k = 0; k < 3; k++) {
        const index = j + ((k + shift) % 3);
        uvValues[(i + k) * 2] = uv?.getX(index) ?? 0;
        uvValues[(i + k) * 2 + 1] = uv?.getY(index) ?? 0;
      }
      return true;
    }
    return false;
  };
  try {
    for (let i = 0; i < b.count; i += 3) {
      // Candidates are visited in one fixed order and the first that matches
      // wins: rounded-key matches in source order, then any further triangle
      // from the 27 cells around the first corner. The key matches come first,
      // so when one of them matches, the cells cannot change the answer and
      // are not searched. That is the common case and most of the old cost.
      const exact = triangles.get(triangleKey(b, i)) ?? [];
      let matched = exact.some((j) => assign(i, j));
      if (!matched) {
        const near = spatialCells();
        const candidates = new Set(exact);
        const [x, y, z] = cell(b, i);
        for (let dx = -1; dx <= 1; dx++)
          for (let dy = -1; dy <= 1; dy++)
            for (let dz = -1; dz <= 1; dz++)
              for (const j of near.get([x + dx, y + dy, z + dz].join(',')) ?? []) candidates.add(j);
        // The key matches were tried above and failed; skipping them leaves
        // the remaining order unchanged.
        for (const j of exact) candidates.delete(j);
        for (const j of candidates) if ((matched = assign(i, j))) break;
      }
      if (!matched) throw new Error('Generated triangle no longer matches authored UV topology');
    }
    target.setAttribute('uv1', target.getAttribute('uv'));
    target.setAttribute('uv', new THREE.BufferAttribute(uvValues, 2));
    return target;
  } catch (error) {
    if (target !== geometry) target.dispose();
    throw error;
  } finally {
    if (source !== original) source.dispose();
  }
}

/**
 * Restored geometry, kept per authored geometry so that a repeat of the same
 * attachment (every dock bay's shelter sides, the city's steel boxes, one per
 * forklift rig) copies the first result instead of re-running the topology
 * match. The result is a pure function of the inputs fingerprinted below, so
 * a copy is exactly what a fresh restore would build. Templates are never
 * handed out: each caller receives, and disposes, its own copy.
 */
const restoredTemplates = new WeakMap<
  THREE.BufferGeometry,
  { inputs: unknown[]; geometry: THREE.BufferGeometry }[]
>();

/** Identity and upload version of everything a restore reads from a geometry. */
function geometryInputs(geometry: THREE.BufferGeometry): unknown[] {
  const version = (attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) =>
    (attribute as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute
      ? (attribute as THREE.InterleavedBufferAttribute).data.version
      : (attribute as THREE.BufferAttribute).version;
  const inputs: unknown[] = [geometry, geometry.index, geometry.index?.version];
  for (const [name, attribute] of Object.entries(geometry.attributes))
    inputs.push(name, attribute, version(attribute));
  for (const [name, targets] of Object.entries(geometry.morphAttributes))
    inputs.push(name, ...targets.flatMap((target) => [target, version(target)]));
  inputs.push(geometry.groups.length);
  return inputs;
}

const sameInputs = (a: unknown[], b: unknown[]) =>
  a.length === b.length && a.every((value, i) => Object.is(value, b[i]));

/** A caller-owned copy; `userData` is shared exactly where a fresh restore shares it. */
function copyRestored(template: THREE.BufferGeometry, delivered: THREE.BufferGeometry) {
  const copy = template.clone();
  if (template.userData !== delivered.userData) copy.userData = { ...template.userData };
  return copy;
}

export function restoreGeometryOrigin(
  scene: THREE.Object3D,
  original: THREE.BufferGeometry,
  fitEnvelope = false
): { geometry: THREE.BufferGeometry; material: THREE.MeshStandardMaterial } {
  scene.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  scene.traverse((object) => {
    if ((object as THREE.Mesh).isMesh) meshes.push(object as THREE.Mesh);
  });
  if (meshes.length !== 1 || Array.isArray(meshes[0].material))
    throw new Error('A geometry attachment requires one rigid source mesh');
  const material = meshes[0].material as THREE.MeshStandardMaterial;
  if (!material.isMeshStandardMaterial || material.transparent || !material.normalMap)
    throw new Error('Expected an opaque standard surface with a normal map');
  const delivered = meshes[0].geometry;
  const inputs = [
    fitEnvelope,
    ...meshes[0].matrixWorld.elements,
    ...geometryInputs(delivered),
    ...geometryInputs(original),
  ];
  const templates = restoredTemplates.get(original) ?? [];
  const cached = templates.find((entry) => sameInputs(entry.inputs, inputs));
  if (cached) return { geometry: copyRestored(cached.geometry, delivered), material };
  // A built-in geometry rebuilt per instance (every `GeneratedBoxSurface`
  // makes its own BoxGeometry) misses by identity; its parameters name the
  // content, and a copy of what the restore reads proves it.
  const contentKey = parametersKey(original);
  const deliveredInputs = inputs.slice(0, inputs.length - geometryInputs(original).length);
  const sameContent = contentKey
    ? restoredByContent
        .get(contentKey)
        ?.find(
          (entry) =>
            sameInputs(entry.deliveredInputs, deliveredInputs) &&
            sameRestoreSource(entry.source, original)
        )
    : undefined;
  const template =
    sameContent?.geometry ?? buildRestoredGeometry(meshes[0], material, original, fitEnvelope);
  templates.push({ inputs, geometry: template });
  restoredTemplates.set(original, templates);
  if (contentKey && !sameContent) {
    const source = snapshotRestoreSource(original);
    if (source) {
      const entries = restoredByContent.get(contentKey) ?? [];
      entries.push({ deliveredInputs, source, geometry: template });
      restoredByContent.set(contentKey, entries);
    }
  }
  return { geometry: copyRestored(template, delivered), material };
}

/**
 * Everything of an authored geometry that a restore reads: its index and its
 * position and UV values (`retainAuthoredUVs` matches on positions and copies
 * UVs; the envelope is their bounding box).
 */
type Values = THREE.BufferAttribute['array'];

interface RestoreSource {
  index: Values | null;
  attributes: { name: string; itemSize: number; normalized: boolean; array: Values }[];
}

const restoredByContent = new Map<
  string,
  { deliveredInputs: unknown[]; source: RestoreSource; geometry: THREE.BufferGeometry }[]
>();

/** `BoxGeometry:{"width":1,...}` for three's parametric geometries, else null. */
function parametersKey(geometry: THREE.BufferGeometry): string | null {
  const parameters = (geometry as THREE.BufferGeometry & { parameters?: unknown }).parameters;
  if (!parameters || typeof parameters !== 'object') return null;
  if (Object.keys(geometry.morphAttributes).length > 0) return null;
  return `${geometry.type}:${JSON.stringify(parameters)}`;
}

const RESTORE_READS = ['position', 'uv'] as const;

/** The live arrays a restore would read, or null if any is interleaved. */
function restoreSourceView(geometry: THREE.BufferGeometry): RestoreSource | null {
  const attributes: RestoreSource['attributes'] = [];
  for (const name of RESTORE_READS) {
    const attribute = geometry.getAttribute(name);
    if (!attribute) continue;
    if ((attribute as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute) return null;
    const { itemSize, normalized, array } = attribute as THREE.BufferAttribute;
    attributes.push({ name, itemSize, normalized, array });
  }
  return { index: geometry.index?.array ?? null, attributes };
}

/** A private copy of those arrays, so later edits to the geometry cannot alter it. */
function snapshotRestoreSource(geometry: THREE.BufferGeometry): RestoreSource | null {
  const view = restoreSourceView(geometry);
  return (
    view && {
      index: view.index?.slice() ?? null,
      attributes: view.attributes.map((entry) => ({ ...entry, array: entry.array.slice() })),
    }
  );
}

const sameValues = (a: Values | null, b: Values | null) => {
  if (a === null || b === null) return a === b;
  if (a.length !== b.length || a.constructor !== b.constructor) return false;
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
  return true;
};

function sameRestoreSource(source: RestoreSource, geometry: THREE.BufferGeometry): boolean {
  const current = restoreSourceView(geometry);
  return (
    current !== null &&
    sameValues(source.index, current.index) &&
    source.attributes.length === current.attributes.length &&
    source.attributes.every((entry, i) => {
      const other = current.attributes[i];
      return (
        entry.name === other.name &&
        entry.itemSize === other.itemSize &&
        entry.normalized === other.normalized &&
        sameValues(entry.array, other.array)
      );
    })
  );
}

function buildRestoredGeometry(
  mesh: THREE.Mesh,
  material: THREE.MeshStandardMaterial,
  original: THREE.BufferGeometry,
  fitEnvelope: boolean
): THREE.BufferGeometry {
  const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
  geometry.computeBoundingBox();
  original.computeBoundingBox();
  const generatedBounds = geometry.boundingBox!;
  const originalBounds = original.boundingBox!;
  const generatedSize = generatedBounds.getSize(new THREE.Vector3());
  const originalSize = originalBounds.getSize(new THREE.Vector3());
  if (
    ![...generatedSize.toArray(), ...originalSize.toArray()].every(Number.isFinite) ||
    originalSize.length() === 0 ||
    (!fitEnvelope &&
      generatedSize.distanceTo(originalSize) > Math.max(1, originalSize.length()) * 0.0002)
  ) {
    geometry.dispose();
    throw new Error('Generated geometry no longer matches its authored envelope');
  }
  if (fitEnvelope) {
    const centre = generatedBounds.getCenter(new THREE.Vector3());
    const factors = originalSize.clone().divide(generatedSize);
    if (!factors.toArray().every((v) => Number.isFinite(v) && v > 0)) {
      geometry.dispose();
      throw new Error('Envelope fitting requires positive finite dimensions');
    }
    geometry.translate(-centre.x, -centre.y, -centre.z);
    geometry.scale(factors.x, factors.y, factors.z);
    geometry.translate(centre.x, centre.y, centre.z);
  }
  const offset = originalBounds
    .getCenter(new THREE.Vector3())
    .sub(generatedBounds.getCenter(new THREE.Vector3()));
  geometry.translate(offset.x, offset.y, offset.z);
  // The live material and instance colours still own the palette.
  geometry.deleteAttribute('color');
  try {
    const restored = retainAuthoredUVs(geometry, original);
    if (restored !== geometry) geometry.dispose();
    restored.computeBoundingBox();
    return restored;
  } catch (error) {
    geometry.dispose();
    throw new Error(`${material.name}: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
  }
}

/** Layer the new atlas with an existing normal map, preserving its UV transform.
 * Working if the old normal sampler and host shader survive beside the new atlas.
 */
export function createGeneratedSurfaceMaterial(
  original: THREE.MeshStandardMaterial,
  atlas: THREE.Texture,
  finishStaticSource = false,
  atlasNormalScale = 0.2
) {
  // Static fallbacks receive this finish from StaticMeshBatch. Install it before
  // layering so an immediately loaded atlas cannot bypass that same treatment.
  if (finishStaticSource) {
    // This flag explicitly requests the retained primitive finish, including its
    // authored normal layer. Working if an early atlas load keeps the same live
    // fallback uniforms while the automatic building sweep remains map-safe.
    const profile = resolveSurfaceProfile(original, true);
    if (profile) applyWorldSurface(original, profile);
  }
  const live = original.clone();
  // MeshStandardMaterial.copy resets `defines` to { STANDARD } and JSON-copies
  // userData. The host shader reads both: the silo skin's MACHINE_GALVANISED
  // block compiled out of this clone, and a uniform mirrored on userData came
  // back as a detached ghost. Keep the host's defines, and its uniform-shaped
  // userData entries by reference.
  if (original.defines) live.defines = { ...original.defines };
  for (const [key, entry] of Object.entries(original.userData)) {
    if (entry !== null && typeof entry === 'object' && 'value' in entry) live.userData[key] = entry;
  }
  if (Object.hasOwn(original, 'onBeforeCompile')) live.onBeforeCompile = original.onBeforeCompile;
  if (Object.hasOwn(original, 'customProgramCacheKey'))
    live.customProgramCacheKey = original.customProgramCacheKey;
  if (hasWorldSurface(original)) {
    // Material.copy serializes userData, losing the shared uniform identity.
    // This composed material must also stay out of the plain-world-surface merge.
    live.userData.millosWorldSurface = original.userData.millosWorldSurface;
    live.userData.millosWorldSurfaceComposed = true;
  }
  live.normalMap = atlas.clone();
  live.normalMap.channel = 1;
  live.normalScale.setScalar(atlasNormalScale);
  if (original.normalMap) {
    if (
      original.normalMap.channel !== 0 ||
      original.normalMapType !== THREE.TangentSpaceNormalMap
    ) {
      live.normalMap.dispose();
      live.dispose();
      throw new Error('Authored normal layer requires tangent-space UV channel zero');
    }
    const host = original.onBeforeCompile;
    const hostKey = original.customProgramCacheKey();
    const authored = original.normalMap;
    if (authored.matrixAutoUpdate) authored.updateMatrix();
    live.onBeforeCompile = (shader, renderer) => {
      host.call(live, shader, renderer);
      shader.uniforms.millosAuthoredNormal = { value: authored };
      shader.uniforms.millosAuthoredNormalTransform = { value: authored.matrix };
      shader.uniforms.millosAuthoredNormalScale = { value: original.normalScale };
      shader.vertexShader = `uniform mat3 millosAuthoredNormalTransform;
        varying vec2 vMillosAuthoredNormalUv;\n${shader.vertexShader}`.replace(
        '#include <uv_vertex>',
        '#include <uv_vertex>\nvMillosAuthoredNormalUv = (millosAuthoredNormalTransform * vec3(uv, 1.0)).xy;'
      );
      shader.fragmentShader = `uniform sampler2D millosAuthoredNormal;
        uniform vec2 millosAuthoredNormalScale;
        varying vec2 vMillosAuthoredNormalUv;
        mat3 millosAuthoredFrame(vec3 eye, vec3 n, vec2 uv) {
          vec3 q0 = dFdx(eye), q1 = dFdy(eye);
          vec2 st0 = dFdx(uv), st1 = dFdy(uv);
          vec3 q1p = cross(q1, n), q0p = cross(n, q0);
          vec3 t = q1p * st0.x + q0p * st1.x;
          vec3 b = q1p * st0.y + q0p * st1.y;
          float det = max(dot(t, t), dot(b, b));
          float scale = det == 0.0 ? 0.0 : inversesqrt(det);
          return mat3(t * scale, b * scale, n);
        }\n${shader.fragmentShader}`.replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        vec3 millosAuthoredN = texture2D(millosAuthoredNormal, vMillosAuthoredNormalUv).xyz * 2.0 - 1.0;
        millosAuthoredN.xy *= millosAuthoredNormalScale;
        mat3 millosAuthoredTbn = millosAuthoredFrame(-vViewPosition, normal, vMillosAuthoredNormalUv);
        #if defined(DOUBLE_SIDED) && !defined(FLAT_SHADED)
          millosAuthoredTbn[0] *= faceDirection;
          millosAuthoredTbn[1] *= faceDirection;
        #endif
        normal = normalize(millosAuthoredTbn * millosAuthoredN);
      `
      );
    };
    live.customProgramCacheKey = () => `${hostKey}_millos-tripo-authored-normal-v1`;
  }
  return live;
}

interface GeneratedGeometrySurfaceProps {
  asset: GeneratedAssetId;
  original: THREE.BufferGeometry;
  meshRef: React.RefObject<THREE.Mesh | null>;
  fitEnvelope?: boolean;
  /** Match GeneratedBoxSurface's static finish when replacing its fixed fittings. */
  finishStaticSource?: boolean;
}

export const GeneratedGeometrySurface: React.FC<GeneratedGeometrySurfaceProps> = ({
  asset,
  original,
  meshRef,
  fitEnvelope = false,
  finishStaticSource = false,
}) => {
  const { scene } = useDracoGLTF(GENERATED_ASSET_PATHS[asset]);
  const prepared = useMemo(
    () => restoreGeometryOrigin(scene, original, fitEnvelope),
    [scene, original, fitEnvelope]
  );
  const attachment = useRef<{
    mesh: THREE.Mesh;
    geometry: THREE.BufferGeometry;
    material: THREE.Material;
    cleanup: () => void;
  } | null>(null);
  useEffect(() => () => prepared.geometry.dispose(), [prepared]);
  useEffect(() => {
    const current = attachment.current;
    if (
      current?.mesh === meshRef.current &&
      current?.geometry === prepared.geometry &&
      current?.mesh.geometry === prepared.geometry &&
      current?.mesh.material === current?.material
    )
      return;
    current?.cleanup();
    attachment.current = null;
    const material = meshRef.current?.material;
    if (
      !material ||
      Array.isArray(material) ||
      !(material as THREE.MeshStandardMaterial).isMeshStandardMaterial
    )
      throw new Error('Generated surface requires the existing standard material');
    const originalMaterial = material as THREE.MeshStandardMaterial;
    // Clone the atlas layer so other material users retain their normal maps.
    // Fixed-box replacements explicitly request their existing static finish;
    // moving rigs keep the default and their owner's shader unchanged.
    const live = createGeneratedSurfaceMaterial(
      originalMaterial,
      prepared.material.normalMap!,
      finishStaticSource,
      prepared.material.normalScale.x
    );
    const normal = live.normalMap!;
    live.needsUpdate = true;
    const mesh = meshRef.current!;
    const originalGeometry = mesh.geometry;
    mesh.geometry = prepared.geometry;
    mesh.material = live;
    // Keep roughness, analytic shaders and runtime colours on the original material.
    // Working if the animated mesh survives and untreated shared-material users do not change.
    const cleanup = () => {
      if (mesh.material === live) mesh.material = originalMaterial;
      if (mesh.geometry === prepared.geometry) mesh.geometry = originalGeometry;
      live.dispose();
      normal.dispose();
    };
    attachment.current = { mesh, geometry: prepared.geometry, material: live, cleanup };
    // Parent commits can replace a rig clone or reconstruct an InstancedMesh.
    // Working if the new ref receives the atlas and the old mesh is restored,
    // while unchanged commits reuse their existing material and geometry.
  });
  useEffect(
    () => () => {
      attachment.current?.cleanup();
      attachment.current = null;
    },
    []
  );
  return null;
};

type GeneratedSurfaceMeshProps = Omit<ThreeElements['mesh'], 'geometry' | 'material' | 'ref'> & {
  asset: GeneratedAssetId;
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
  fitEnvelope?: boolean;
};

function LoadedSurfaceMesh({
  asset,
  geometry: original,
  material: originalMaterial,
  fitEnvelope = false,
  ...props
}: GeneratedSurfaceMeshProps) {
  const { scene } = useDracoGLTF(GENERATED_ASSET_PATHS[asset]);
  const prepared = useMemo(
    () => restoreGeometryOrigin(scene, original, fitEnvelope),
    [scene, original, fitEnvelope]
  );
  const material = useMemo(
    () =>
      createGeneratedSurfaceMaterial(
        originalMaterial,
        prepared.material.normalMap!,
        true,
        prepared.material.normalScale.x
      ),
    [prepared, originalMaterial]
  );
  useEffect(() => () => prepared.geometry.dispose(), [prepared]);
  useEffect(
    () => () => {
      material.normalMap?.dispose();
      material.dispose();
    },
    [material]
  );
  return <mesh {...props} geometry={prepared.geometry} material={material} />;
}

/** Static source geometry stays outside batching until its replacement loads.
 * Working if a delayed GLB cannot leave an extracted fallback as a ghost copy.
 */
export function GeneratedSurfaceMesh(props: GeneratedSurfaceMeshProps) {
  const { asset: _asset, fitEnvelope: _fitEnvelope, ...fallback } = props;
  return (
    <GeneratedBoundary
      fallback={<mesh {...fallback} userData={{ ...props.userData, noStaticBatch: true }} />}
    >
      <LoadedSurfaceMesh {...props} />
    </GeneratedBoundary>
  );
}

/** Variable-sized authored boxes share a reviewed material atlas. */
export function GeneratedBoxSurface({
  size,
  ...props
}: Omit<GeneratedSurfaceMeshProps, 'geometry' | 'fitEnvelope'> & {
  size: [number, number, number];
}) {
  const [width, height, depth] = size;
  const geometry = useMemo(
    () => new THREE.BoxGeometry(width, height, depth),
    [width, height, depth]
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <GeneratedSurfaceMesh {...props} geometry={geometry} fitEnvelope />;
}
