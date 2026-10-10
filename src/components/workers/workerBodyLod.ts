import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const WORKER_BODY_LOD = {
  farDistance: 80,
  nearDistance: 70,
  sampleEveryFrames: 12,
} as const;

/**
 * Preserve the authored skin and every vertex at distance, combining opaque
 * body regions into vertex-coloured draws. Close views keep their individual
 * physical finishes. Feet remain separate because they do not cast shadows.
 * Working if distant people retain poses/role colours with at most two body
 * draws, and returning close restores all original materials and fittings.
 */
export function createWorkerBodyLod(model: THREE.Object3D) {
  model.updateMatrixWorld(true);
  const sources: THREE.SkinnedMesh[] = [];
  model.traverse((object) => {
    const mesh = object as THREE.SkinnedMesh;
    if (
      mesh.isSkinnedMesh &&
      mesh.visible &&
      !Array.isArray(mesh.material) &&
      mesh.material.visible
    )
      sources.push(mesh);
  });
  const anchor = sources[0];
  if (!anchor || sources.length < 3) return null;
  const compatible = sources.every((mesh) => {
    const material = mesh.material as THREE.MeshStandardMaterial;
    return (
      material.isMeshStandardMaterial &&
      !material.transparent &&
      material.opacity === 1 &&
      !material.map &&
      !material.emissiveMap &&
      material.emissive.equals(new THREE.Color(0)) &&
      material.side === (anchor.material as THREE.Material).side &&
      mesh.skeleton === anchor.skeleton &&
      mesh.bindMode === anchor.bindMode &&
      mesh.bindMatrix.equals(anchor.bindMatrix) &&
      mesh.bindMatrixInverse.equals(anchor.bindMatrixInverse) &&
      mesh.matrixWorld.equals(anchor.matrixWorld) &&
      Object.keys(mesh.geometry.morphAttributes).length === 0 &&
      ['position', 'normal', 'skinIndex', 'skinWeight'].every((key) =>
        mesh.geometry.hasAttribute(key)
      )
    );
  });
  // An unfamiliar export keeps the complete near renderer instead of guessing
  // skin correspondence, baking world transforms or losing mapped colours.
  if (!compatible) return null;
  const material = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    vertexColors: true,
    side: (anchor.material as THREE.Material).side,
    roughness: 0.75,
    metalness: 0,
    envMapIntensity: 1,
  });
  material.name = 'worker-distant-workwear';
  const meshes: THREE.SkinnedMesh[] = [];
  for (const castShadow of [true, false]) {
    const parts = sources.filter((mesh) => mesh.castShadow === castShadow);
    if (!parts.length) continue;
    const geometries = parts.map((mesh) => {
      const geometry = new THREE.BufferGeometry();
      for (const key of ['position', 'normal', 'skinIndex', 'skinWeight']) {
        const attribute = mesh.geometry.getAttribute(key);
        geometry.setAttribute(
          key,
          attribute instanceof THREE.InterleavedBufferAttribute
            ? attribute.clone({})
            : attribute.clone()
        );
      }
      if (mesh.geometry.index) geometry.setIndex(mesh.geometry.index.clone());
      const colour = (mesh.material as THREE.MeshStandardMaterial).color;
      const sourceColours = (mesh.material as THREE.MeshStandardMaterial).vertexColors
        ? mesh.geometry.getAttribute('color')
        : undefined;
      const count = mesh.geometry.getAttribute('position').count;
      const colours = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        colours[i * 3] = colour.r * (sourceColours?.getX(i) ?? 1);
        colours[i * 3 + 1] = colour.g * (sourceColours?.getY(i) ?? 1);
        colours[i * 3 + 2] = colour.b * (sourceColours?.getZ(i) ?? 1);
      }
      geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
      return geometry;
    });
    const geometry = mergeGeometries(geometries, false);
    geometries.forEach((part) => part.dispose());
    if (!geometry) {
      meshes.forEach((mesh) => mesh.geometry.dispose());
      material.dispose();
      return null;
    }
    const mesh = new THREE.SkinnedMesh(geometry, material);
    mesh.name = castShadow ? 'worker-distant-body' : 'worker-distant-feet';
    mesh.position.copy(anchor.position);
    mesh.quaternion.copy(anchor.quaternion);
    mesh.scale.copy(anchor.scale);
    mesh.bindMode = anchor.bindMode;
    // An explicit bind matrix prevents bind() recalculating inverses on the
    // skeleton shared with the near meshes and this person's animation rig.
    mesh.bind(anchor.skeleton, anchor.bindMatrix);
    mesh.bindMatrixInverse.copy(anchor.bindMatrixInverse);
    mesh.boundingSphere = anchor.boundingSphere?.clone() ?? null;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = anchor.receiveShadow;
    mesh.visible = false;
    meshes.push(mesh);
  }
  for (const mesh of meshes) anchor.parent?.add(mesh);
  let distant = false;
  let frame = 0;
  const position = new THREE.Vector3();
  const cameraPosition = new THREE.Vector3();
  return {
    sources,
    meshes,
    update(camera: THREE.Camera) {
      if (frame++ % WORKER_BODY_LOD.sampleEveryFrames !== 0) return;
      model.getWorldPosition(position);
      camera.getWorldPosition(cameraPosition);
      const zoom = (camera as THREE.PerspectiveCamera).zoom;
      const distance =
        position.distanceTo(cameraPosition) / (Number.isFinite(zoom) && zoom > 0 ? zoom : 1);
      const next =
        distance > (distant ? WORKER_BODY_LOD.nearDistance : WORKER_BODY_LOD.farDistance);
      if (next === distant) return;
      distant = next;
      sources.forEach((mesh) => {
        mesh.visible = !distant;
      });
      meshes.forEach((mesh) => {
        mesh.visible = distant;
      });
    },
    dispose() {
      meshes.forEach((mesh) => {
        mesh.removeFromParent();
        mesh.geometry.dispose();
      });
      material.dispose();
    },
  };
}
