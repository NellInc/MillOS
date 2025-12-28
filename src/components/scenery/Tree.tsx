/**
 * Simple Tree Component
 *
 * Procedurally textured trees for village and farm areas.
 */

import React from 'react';
import { TREE_MATERIALS } from '../../utils/sharedMaterials';

// Tree types with different characteristics
export type TreeType = 'oak' | 'pine' | 'birch';

interface TreeProps {
  position: [number, number, number];
  type?: TreeType;
  scale?: number;
  rotation?: number;
}

/**
 * Oak Tree - Deciduous tree with round canopy
 */
export const OakTree: React.FC<TreeProps> = React.memo(({ position, scale = 1, rotation = 0 }) => {
  return (
    <group position={position} scale={scale} rotation={[0, rotation, 0]}>
      {/* Trunk */}
      <mesh position={[0, 1.2, 0]} castShadow>
        <cylinderGeometry args={[0.15, 0.25, 2.4, 8]} />
        <primitive object={TREE_MATERIALS.trunk} attach="material" />
      </mesh>

      {/* Main canopy (multiple spheres for organic look) */}
      <mesh position={[0, 3, 0]} castShadow>
        <sphereGeometry args={[1.2, 8, 6]} />
        <primitive object={TREE_MATERIALS.leaves} attach="material" />
      </mesh>
      <mesh position={[0.4, 2.6, 0.3]} castShadow>
        <sphereGeometry args={[0.8, 8, 6]} />
        <primitive object={TREE_MATERIALS.leaves} attach="material" />
      </mesh>
      <mesh position={[-0.5, 2.8, -0.2]} castShadow>
        <sphereGeometry args={[0.7, 8, 6]} />
        <primitive object={TREE_MATERIALS.leaves} attach="material" />
      </mesh>
    </group>
  );
});
OakTree.displayName = 'OakTree';

/**
 * Pine Tree - Coniferous tree with cone-shaped canopy
 */
export const PineTree: React.FC<TreeProps> = React.memo(({ position, scale = 1, rotation = 0 }) => {
  return (
    <group position={position} scale={scale} rotation={[0, rotation, 0]}>
      {/* Trunk */}
      <mesh position={[0, 1.5, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.2, 3, 8]} />
        <primitive object={TREE_MATERIALS.trunk} attach="material" />
      </mesh>

      {/* Cone-shaped canopy (stacked cones) */}
      <mesh position={[0, 2.5, 0]} castShadow>
        <coneGeometry args={[1.2, 1.5, 6]} />
        <primitive object={TREE_MATERIALS.pineNeedles} attach="material" />
      </mesh>
      <mesh position={[0, 3.5, 0]} castShadow>
        <coneGeometry args={[0.9, 1.2, 6]} />
        <primitive object={TREE_MATERIALS.pineNeedles} attach="material" />
      </mesh>
      <mesh position={[0, 4.3, 0]} castShadow>
        <coneGeometry args={[0.5, 0.8, 6]} />
        <primitive object={TREE_MATERIALS.pineNeedles} attach="material" />
      </mesh>
    </group>
  );
});
PineTree.displayName = 'PineTree';

/**
 * Birch Tree - White-barked deciduous tree
 */
export const BirchTree: React.FC<TreeProps> = React.memo(
  ({ position, scale = 1, rotation = 0 }) => {
    return (
      <group position={position} scale={scale} rotation={[0, rotation, 0]}>
        {/* White trunk */}
        <mesh position={[0, 1.5, 0]} castShadow>
          <cylinderGeometry args={[0.1, 0.15, 3, 8]} />
          <primitive object={TREE_MATERIALS.birchTrunk} attach="material" />
        </mesh>

        {/* Delicate canopy */}
        <mesh position={[0, 3.2, 0]} castShadow>
          <sphereGeometry args={[0.9, 8, 6]} />
          <meshStandardMaterial color="#3d6b35" roughness={0.8} />
        </mesh>
        <mesh position={[0.3, 2.8, 0.2]} castShadow>
          <sphereGeometry args={[0.5, 8, 6]} />
          <meshStandardMaterial color="#4a7a42" roughness={0.8} />
        </mesh>
      </group>
    );
  }
);
BirchTree.displayName = 'BirchTree';

/**
 * Generic Tree component that selects type
 */
export const Tree: React.FC<TreeProps> = React.memo(({ type = 'oak', ...props }) => {
  switch (type) {
    case 'pine':
      return <PineTree {...props} />;
    case 'birch':
      return <BirchTree {...props} />;
    default:
      return <OakTree {...props} />;
  }
});
Tree.displayName = 'Tree';

export default Tree;
