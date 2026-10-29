import { useEffect, useMemo } from 'react';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { useGraphicsStore } from '../../stores/graphicsStore';

export type MineralKind = 'fieldstone' | 'limestone';

/** Baked authoring detail only on the stone kit's real spherical UVs. The
 * metre-space finish on buildings, workers and shared unit boxes stays intact.
 * Working if detailed stone pixels gain grain while Low keeps its original material.
 */
export function createMineralFinish(base: THREE.MeshStandardMaterial, maps: THREE.Texture[]) {
  const material = base.clone();
  maps.forEach((map, i) => {
    map.colorSpace = i === 0 ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.anisotropy = 4;
    map.name = `millos-mineral-${i}`;
    map.needsUpdate = true;
  });
  [material.map, material.normalMap, material.roughnessMap] = maps;
  material.normalScale.set(0.12, 0.12);
  material.roughness = 1;
  material.name = 'material-maker-mineral-finish';
  return material;
}
function DetailedMineral({ base, kind }: { base: THREE.MeshStandardMaterial; kind: MineralKind }) {
  const maps = useTexture(
    ['albedo', 'normal', 'roughness'].map(
      (role) => `${import.meta.env.BASE_URL}textures/material-maker/${kind}-${role}.png`
    )
  );
  const material = useMemo(() => createMineralFinish(base, maps), [base, maps]);
  useEffect(() => () => material.dispose(), [material]);
  // Loader-cache textures are shared. Only this clone belongs to the component.
  return <primitive object={material} attach="material" dispose={null} />;
}
export function MineralFinish({
  base,
  kind,
}: {
  base: THREE.MeshStandardMaterial;
  kind: MineralKind;
}) {
  const detailed = useGraphicsStore((s) => s.graphics.quality !== 'low');
  return detailed ? (
    <DetailedMineral base={base} kind={kind} />
  ) : (
    <primitive object={base} attach="material" dispose={null} />
  );
}
