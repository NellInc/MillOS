import React, { useMemo } from 'react';
import * as THREE from 'three';
import { MeshReflectorMaterial } from '@react-three/drei';
import { useGraphicsStore } from '../../stores/graphicsStore';
import { useModelTextures } from '../../utils/machineTextures';

interface ReflectiveFloorProps {
  width: number;
  depth: number;
}

export const ReflectiveFloor: React.FC<ReflectiveFloorProps> = ({ width, depth }) => {
  const quality = useGraphicsStore((state) => state.graphics.quality);

  // Load concrete textures for distortion and visual detail
  const concreteTextures = useModelTextures('concrete');

  // CRITICAL: Guard against NaN/undefined/zero dimensions which cause
  // "computeBoundingSphere(): Computed radius is NaN" errors in THREE.js
  // This can happen during quality switches or when props aren't yet set
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 120;
  const safeDepth = Number.isFinite(depth) && depth > 0 ? depth : 160;

  // Configure concrete texture tiling for floor dimensions
  useMemo(() => {
    const repeatX = Math.max(1, safeWidth / 10);
    const repeatY = Math.max(1, safeDepth / 10);

    if (concreteTextures.normal) {
      concreteTextures.normal.wrapS = concreteTextures.normal.wrapT = THREE.RepeatWrapping;
      concreteTextures.normal.repeat.set(repeatX, repeatY);
    }
  }, [concreteTextures.normal, safeWidth, safeDepth]);

  // Resolution based on quality
  const resolution = useMemo(() => {
    return quality === 'ultra' ? 1024 : 512;
  }, [quality]);

  // Blur based on quality
  const blur = useMemo(() => {
    return quality === 'ultra' ? [500, 100] : [400, 100];
  }, [quality]);

  // Mix contrast based on quality
  const mixContrast = useMemo(() => {
    return quality === 'ultra' ? 1 : 0.8;
  }, [quality]);

  // Create a key that changes when quality changes to force full remount
  // This prevents the dreaded "black screen" or shader errors when switching quality
  const key = `reflector-${quality}-${safeWidth}-${safeDepth}`;

  // MeshReflectorMaterial only enabled on high/ultra to reduce render overhead
  // and avoid FBO issues on lower quality settings
  const enableReflector = quality === 'high' || quality === 'ultra';

  if (!enableReflector) {
    return (
      <mesh key={key} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[safeWidth, safeDepth]} />
        <meshStandardMaterial color="#1e293b" roughness={0.5} metalness={0.3} />
      </mesh>
    );
  }

  return (
    <mesh key={key} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
      <planeGeometry args={[safeWidth, safeDepth]} />
      {/*
        MeshReflectorMaterial parameters tuned for polished concrete:
        - mirror: 0 (not a perfect mirror)
        - blur: High blur for rough concrete look
        - mixBlur: How much surface roughness affects blur
        - mixStrength: Strength of reflections (low for concrete)
        - depthScale: Fade out reflections at distance
      */}
      <MeshReflectorMaterial
        resolution={resolution}
        mirror={0}
        blur={blur as [number, number]}
        mixBlur={10}
        mixStrength={0.4} // Reduced from 1.5 - concrete should be matte, not slick
        mixContrast={mixContrast}
        depthScale={1}
        minDepthThreshold={0.4}
        maxDepthThreshold={1.4}
        depthToBlurRatioBias={0.25}
        distortion={concreteTextures.normal ? 0.5 : 1} // Reduced distortion when using normal map
        distortionMap={concreteTextures.normal} // Use concrete normal map for realistic surface variation
        reflectorOffset={0.2} // Fix z-fighting
        color="#1e293b" // Base dark slate color
        metalness={0.1} // Reduced from 0.4 - concrete is not metallic
        roughness={0.85} // Increased from 0.4 - concrete is rough
      />
    </mesh>
  );
};
