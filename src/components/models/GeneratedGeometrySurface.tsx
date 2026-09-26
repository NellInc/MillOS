/** Tripo geometry/UVs on an existing mesh, retaining its ref, picking and animation. */
import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { ThreeElements } from '@react-three/fiber';
import { GeneratedBoundary } from './GeneratedModel';
import { useDracoGLTF } from '../../utils/dracoLoader';
import { GENERATED_ASSET_PATHS, type GeneratedAssetId } from '../../utils/modelLoader';
import { applyDeclinedWorldSurface, hasWorldSurface } from '../../utils/worldSurface';

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
  const key = (p: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number) =>
    [p.getX(i), p.getY(i), p.getZ(i)].map((v) => Math.round(v * 100000)).join(',');
  const triangleKey = (p: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number) =>
    [key(p, i), key(p, i + 1), key(p, i + 2)].sort().join(';');
  // Float32 atlas round-trips can cross a decimal hash boundary. Search adjacent
  // spatial cells, then verify actual distances and winding rather than rounding.
  source.computeBoundingBox();
  const tolerance = Math.max(1, source.boundingBox!.getSize(new THREE.Vector3()).length()) * 1e-6;
  const cells = new Map<string, Set<number>>();
  const cell = (p: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number) =>
    [p.getX(i), p.getY(i), p.getZ(i)].map((v) => Math.floor(v / tolerance));
  const close = (i: number, j: number) =>
    Math.hypot(b.getX(i) - a.getX(j), b.getY(i) - a.getY(j), b.getZ(i) - a.getZ(j)) <= tolerance;
  const triangles = new Map<string, number[]>();
  for (let i = 0; i < a.count; i += 3) {
    const k = triangleKey(a, i);
    const matches = triangles.get(k) ?? [];
    matches.push(i);
    triangles.set(k, matches);
    for (let corner = 0; corner < 3; corner++) {
      const c = cell(a, i + corner).join(',');
      const bucket = cells.get(c) ?? new Set<number>();
      bucket.add(i);
      cells.set(c, bucket);
    }
  }
  try {
    for (let i = 0; i < b.count; i += 3) {
      let matched = false;
      const candidates = new Set(triangles.get(triangleKey(b, i)) ?? []);
      const [x, y, z] = cell(b, i);
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
          for (let dz = -1; dz <= 1; dz++)
            for (const j of cells.get([x + dx, y + dy, z + dz].join(',')) ?? []) candidates.add(j);
      for (const j of candidates) {
        for (let shift = 0; shift < 3 && !matched; shift++) {
          if (![0, 1, 2].every((k) => close(i + k, j + ((k + shift) % 3)))) continue;
          for (let k = 0; k < 3; k++) {
            const index = j + ((k + shift) % 3);
            uvValues[(i + k) * 2] = uv?.getX(index) ?? 0;
            uvValues[(i + k) * 2 + 1] = uv?.getY(index) ?? 0;
          }
          matched = true;
        }
        if (matched) break;
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
  const geometry = meshes[0].geometry.clone().applyMatrix4(meshes[0].matrixWorld);
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
    return { geometry: restored, material };
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
  if (finishStaticSource) applyDeclinedWorldSurface(original);
  const live = original.clone();
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
}

export const GeneratedGeometrySurface: React.FC<GeneratedGeometrySurfaceProps> = ({
  asset,
  original,
  meshRef,
  fitEnvelope = false,
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
    // A material can also belong to untreated fittings. Never alter that shared
    // object, and explicitly retain callbacks which three's clone does not copy.
    const live = createGeneratedSurfaceMaterial(
      originalMaterial,
      prepared.material.normalMap!,
      false,
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
