import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useDracoGLTF } from '../../utils/dracoLoader';
import { GENERATED_ASSET_PATHS } from '../../utils/modelLoader';
import { AUTHORED_PROP_TRIM, AUTHORED_PROP_TRIM_MATERIALS } from './AuthoredPropTrim';
import { createFarmFenceRun } from './farmFenceGeometry';

/** Farm-local assembly; immutable loader geometry/materials remain shared and
 * only the derived run geometries are owned/disposed by this component.
 */
export const FarmFenceRun = React.memo<{ length: number }>(({ length }) => {
  const { scene } = useDracoGLTF(GENERATED_ASSET_PATHS.fence);
  const data = useMemo(() => {
    scene.updateMatrixWorld(true);
    const meshes: THREE.Mesh[] = [];
    scene.traverse((node) => {
      if ((node as THREE.Mesh).isMesh) meshes.push(node as THREE.Mesh);
    });
    if (meshes.length !== 1 || Array.isArray(meshes[0].material))
      throw new Error('Farm fence expects its single authored surface');
    const mesh = meshes[0];
    const source = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    try {
      return {
        ...createFarmFenceRun(source, AUTHORED_PROP_TRIM.fence, length),
        material: mesh.material,
        castShadow:
          typeof mesh.userData.authoredCastShadow === 'boolean'
            ? mesh.userData.authoredCastShadow
            : true,
        receiveShadow:
          typeof mesh.userData.authoredReceiveShadow === 'boolean'
            ? mesh.userData.authoredReceiveShadow
            : true,
      };
    } finally {
      source.dispose();
    }
  }, [scene, length]);
  useEffect(
    () => () => {
      data.body.dispose();
      data.trim.dispose();
    },
    [data]
  );
  return (
    <group dispose={null}>
      <mesh
        name="farm-fence-shared-post-body"
        geometry={data.body}
        material={data.material}
        castShadow={data.castShadow}
        receiveShadow={data.receiveShadow}
      />
      <mesh
        name="farm-fence-shared-post-hardware"
        geometry={data.trim}
        material={AUTHORED_PROP_TRIM_MATERIALS.fence}
        castShadow
        receiveShadow
      />
    </group>
  );
});
FarmFenceRun.displayName = 'FarmFenceRun';
