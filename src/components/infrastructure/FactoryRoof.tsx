import React from 'react';
import * as THREE from 'three';
import { useGraphicsStore } from '../../stores/graphicsStore';
import { PROCEDURAL_TEXTURES } from '../../utils/sharedMaterials';

interface FactoryRoofProps {
  floorWidth?: number;
  floorDepth?: number;
}

export const FactoryRoof: React.FC<FactoryRoofProps> = ({
  floorWidth = 120,
  floorDepth: _floorDepth = 100,
}) => {
  const graphics = useGraphicsStore((state) => state.graphics);
  const isLowGraphics = graphics.quality === 'low';

  const roofHeight = 32;
  const roofWidth = floorWidth + 2;
  // Building walls are at z=±48 (96 total), roof should only slightly overhang
  // Reduced from floorDepth+2 (162) to ~104 to minimize dock overhang
  const buildingDepth = 96; // Matches wall positions at z=±48
  const overhangZ = 4; // Small overhang past walls (reduced from ~33)
  const roofLength = buildingDepth + overhangZ * 2;

  return (
    <group>
      {/* Flat roof slab */}
      <mesh position={[0, roofHeight, 0]} receiveShadow>
        <boxGeometry args={[roofWidth, 0.5, roofLength]} />
        <meshStandardMaterial
          color="#374151"
          metalness={0.3}
          roughness={0.8}
          normalMap={PROCEDURAL_TEXTURES.panelNormal}
          normalScale={new THREE.Vector2(0.15, 0.15)}
        />
      </mesh>

      {/* Roof edge trim */}
      <mesh position={[0, roofHeight + 0.4, roofLength / 2 + 0.3]}>
        <boxGeometry args={[roofWidth + 0.6, 0.8, 0.6]} />
        <meshStandardMaterial
          color="#1f2937"
          metalness={0.4}
          roughness={0.6}
          normalMap={PROCEDURAL_TEXTURES.brushedMetal}
          normalScale={new THREE.Vector2(0.1, 0.1)}
        />
      </mesh>
      <mesh position={[0, roofHeight + 0.4, -roofLength / 2 - 0.3]}>
        <boxGeometry args={[roofWidth + 0.6, 0.8, 0.6]} />
        <meshStandardMaterial
          color="#1f2937"
          metalness={0.4}
          roughness={0.6}
          normalMap={PROCEDURAL_TEXTURES.brushedMetal}
          normalScale={new THREE.Vector2(0.1, 0.1)}
        />
      </mesh>
      <mesh position={[roofWidth / 2 + 0.3, roofHeight + 0.4, 0]}>
        <boxGeometry args={[0.6, 0.8, roofLength]} />
        <meshStandardMaterial
          color="#1f2937"
          metalness={0.4}
          roughness={0.6}
          normalMap={PROCEDURAL_TEXTURES.brushedMetal}
          normalScale={new THREE.Vector2(0.1, 0.1)}
        />
      </mesh>
      <mesh position={[-roofWidth / 2 - 0.3, roofHeight + 0.4, 0]}>
        <boxGeometry args={[0.6, 0.8, roofLength]} />
        <meshStandardMaterial
          color="#1f2937"
          metalness={0.4}
          roughness={0.6}
          normalMap={PROCEDURAL_TEXTURES.brushedMetal}
          normalScale={new THREE.Vector2(0.1, 0.1)}
        />
      </mesh>

      {/* Simple skylights - 3x3 grid */}
      {!isLowGraphics &&
        [-30, 0, 30].map((x) =>
          [-25, 0, 25].map((z) => (
            <group key={`${x}-${z}`} position={[x, roofHeight + 0.3, z]}>
              <mesh>
                <boxGeometry args={[12, 0.2, 10]} />
                <meshStandardMaterial
                  color="#60a5fa"
                  transparent
                  opacity={0.4}
                  metalness={0.2}
                  roughness={0.1}
                />
              </mesh>
            </group>
          ))
        )}
    </group>
  );
};
