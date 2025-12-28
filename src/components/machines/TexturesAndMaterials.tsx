import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { PROCEDURAL_TEXTURES } from '../../utils/sharedMaterials';
import { textureCache } from './shared';

// Procedural texture generator for enhanced metal surfaces
export const useProceduralMetalTexture = (enabled: boolean, seed: number = 0) => {
  const texturesRef = useRef<{
    roughnessMap: THREE.CanvasTexture | null;
    normalMap: THREE.CanvasTexture | null;
  }>({
    roughnessMap: null,
    normalMap: null,
  });

  useEffect(() => {
    if (!enabled) {
      // Dispose existing textures if disabling
      if (texturesRef.current.roughnessMap) {
        texturesRef.current.roughnessMap.dispose();
        texturesRef.current.roughnessMap = null;
      }
      if (texturesRef.current.normalMap) {
        texturesRef.current.normalMap.dispose();
        texturesRef.current.normalMap = null;
      }
      texturesRef.current = { roughnessMap: null, normalMap: null };
      return;
    }

    // Check cache first - avoid regenerating identical textures for same seed
    const cacheKey = `metal-${seed}`;
    if (textureCache.has(cacheKey)) {
      texturesRef.current = textureCache.get(cacheKey)!;
      // Don't dispose cached textures on cleanup - they're shared
      return () => {};
    }

    const random = (s: number) => Math.abs(Math.sin(s * 12.9898 + 78.233) * 43758.5453) % 1;

    // Create roughness variation texture
    const roughnessCanvas = document.createElement('canvas');
    roughnessCanvas.width = roughnessCanvas.height = 256;
    const rCtx = roughnessCanvas.getContext('2d')!;

    rCtx.fillStyle = '#666';
    rCtx.fillRect(0, 0, 256, 256);

    // Weld lines
    rCtx.fillStyle = '#444';
    for (let y = 40; y < 256; y += 60) {
      rCtx.fillRect(0, y + (seed % 10), 256, 3);
    }

    // Scratches
    rCtx.strokeStyle = '#555';
    rCtx.lineWidth = 1;
    for (let i = 0; i < 30; i++) {
      rCtx.beginPath();
      rCtx.moveTo(random(seed + i) * 256, random(seed + i + 100) * 256);
      rCtx.lineTo(random(seed + i + 50) * 256, random(seed + i + 150) * 256);
      rCtx.stroke();
    }

    // Wear spots
    for (let i = 0; i < 15; i++) {
      const x = random(seed + i * 3) * 256;
      const y = random(seed + i * 3 + 1) * 256;
      const r = 5 + random(seed + i * 3 + 2) * 15;
      const gradient = rCtx.createRadialGradient(x, y, 0, x, y, r);
      gradient.addColorStop(
        0,
        `rgb(${100 + random(seed + i) * 40}, ${100 + random(seed + i) * 40}, ${100 + random(seed + i) * 40})`
      );
      gradient.addColorStop(1, 'rgba(102, 102, 102, 0)');
      rCtx.fillStyle = gradient;
      rCtx.beginPath();
      rCtx.arc(x, y, r, 0, Math.PI * 2);
      rCtx.fill();
    }

    const roughnessTexture = new THREE.CanvasTexture(roughnessCanvas);
    roughnessTexture.wrapS = roughnessTexture.wrapT = THREE.RepeatWrapping;
    roughnessTexture.repeat.set(1, 2);

    // Create enhanced normal map with industrial details
    const normalCanvas = document.createElement('canvas');
    const normalSize = 256;
    normalCanvas.width = normalCanvas.height = normalSize;
    const nCtx = normalCanvas.getContext('2d')!;

    // Base neutral normal (pointing up: R=128, G=128, B=255)
    nCtx.fillStyle = 'rgb(128, 128, 255)';
    nCtx.fillRect(0, 0, normalSize, normalSize);

    // Helper to draw normal-mapped features
    const drawNormalBump = (x: number, y: number, radius: number, height: number) => {
      const gradient = nCtx.createRadialGradient(x, y, 0, x, y, radius);
      // Center is raised (brighter green = pointing forward)
      const centerG = Math.min(255, 128 + height * 60);
      gradient.addColorStop(0, `rgb(128, ${centerG}, 255)`);
      gradient.addColorStop(0.7, 'rgb(128, 128, 255)');
      gradient.addColorStop(1, `rgb(128, ${Math.max(0, 128 - height * 30)}, 255)`);
      nCtx.fillStyle = gradient;
      nCtx.beginPath();
      nCtx.arc(x, y, radius, 0, Math.PI * 2);
      nCtx.fill();
    };

    // Add rivets in grid pattern
    const rivetSpacing = 48;
    const rivetRadius = 4;
    for (let row = 0; row < normalSize / rivetSpacing; row++) {
      for (let col = 0; col < normalSize / rivetSpacing; col++) {
        const x = 24 + col * rivetSpacing + (random(seed + row * 10 + col) - 0.5) * 4;
        const y = 24 + row * rivetSpacing + (random(seed + row * 10 + col + 50) - 0.5) * 4;
        drawNormalBump(x, y, rivetRadius, 1.5);
      }
    }

    // Panel seam lines (horizontal) - create edge lighting effect
    for (let y = 64; y < normalSize; y += 64) {
      // Top edge of seam (light from above)
      nCtx.fillStyle = 'rgb(128, 160, 255)';
      nCtx.fillRect(0, y - 2, normalSize, 2);
      // Bottom edge of seam (shadow)
      nCtx.fillStyle = 'rgb(128, 96, 255)';
      nCtx.fillRect(0, y, normalSize, 2);
    }

    // Panel seam lines (vertical)
    for (let x = 128; x < normalSize; x += 128) {
      // Left edge (light)
      nCtx.fillStyle = 'rgb(160, 128, 255)';
      nCtx.fillRect(x - 2, 0, 2, normalSize);
      // Right edge (shadow)
      nCtx.fillStyle = 'rgb(96, 128, 255)';
      nCtx.fillRect(x, 0, 2, normalSize);
    }

    // Scratches with directional normals
    for (let i = 0; i < 20; i++) {
      const x1 = random(seed + i * 7) * normalSize;
      const y1 = random(seed + i * 7 + 1) * normalSize;
      const angle = random(seed + i * 7 + 2) * Math.PI;
      const length = 20 + random(seed + i * 7 + 3) * 40;
      const x2 = x1 + Math.cos(angle) * length;
      const y2 = y1 + Math.sin(angle) * length;

      // Scratch creates a groove - perpendicular normal displacement
      const perpAngle = angle + Math.PI / 2;
      const normalX = Math.cos(perpAngle) * 30;
      const normalY = Math.sin(perpAngle) * 30;

      nCtx.strokeStyle = `rgb(${128 + normalX}, ${128 + normalY}, 240)`;
      nCtx.lineWidth = 1;
      nCtx.beginPath();
      nCtx.moveTo(x1, y1);
      nCtx.lineTo(x2, y2);
      nCtx.stroke();
    }

    // Dents (inverted bumps)
    for (let i = 0; i < 5; i++) {
      const x = random(seed + i * 11) * normalSize;
      const y = random(seed + i * 11 + 1) * normalSize;
      const radius = 8 + random(seed + i * 11 + 2) * 12;
      const gradient = nCtx.createRadialGradient(x, y, 0, x, y, radius);
      // Center is depressed (darker green)
      gradient.addColorStop(0, 'rgb(128, 80, 255)');
      gradient.addColorStop(0.6, 'rgb(128, 128, 255)');
      gradient.addColorStop(1, 'rgb(128, 150, 255)');
      nCtx.fillStyle = gradient;
      nCtx.beginPath();
      nCtx.arc(x, y, radius, 0, Math.PI * 2);
      nCtx.fill();
    }

    // Add subtle surface noise
    const imageData = nCtx.getImageData(0, 0, normalSize, normalSize);
    for (let i = 0; i < imageData.data.length; i += 4) {
      const noise = (random(seed + i) - 0.5) * 6;
      imageData.data[i] = Math.max(0, Math.min(255, imageData.data[i] + noise));
      imageData.data[i + 1] = Math.max(0, Math.min(255, imageData.data[i + 1] + noise));
    }
    nCtx.putImageData(imageData, 0, 0);

    const normalTexture = new THREE.CanvasTexture(normalCanvas);
    normalTexture.wrapS = normalTexture.wrapT = THREE.RepeatWrapping;

    texturesRef.current = { roughnessMap: roughnessTexture, normalMap: normalTexture };

    // Store in cache for future reuse
    textureCache.set(cacheKey, { roughnessMap: roughnessTexture, normalMap: normalTexture });

    // Cleanup function to dispose textures
    return () => {
      if (texturesRef.current.roughnessMap) {
        texturesRef.current.roughnessMap.dispose();
      }
      if (texturesRef.current.normalMap) {
        texturesRef.current.normalMap.dispose();
      }
    };
  }, [enabled, seed]);

  return texturesRef.current;
};

// Weathering/dust layer for machines
export const WeatheringLayer: React.FC<{
  size: [number, number, number];
  yOffset?: number;
  enabled: boolean;
}> = ({ size, yOffset = 0, enabled }) => {
  if (!enabled) return null;

  // Guard against NaN/invalid dimensions
  const safeW = Number.isFinite(size[0]) && size[0] > 0 ? size[0] : 1;
  const safeH = Number.isFinite(size[1]) && size[1] > 0 ? size[1] : 1;
  const safeD = Number.isFinite(size[2]) && size[2] > 0 ? size[2] : 1;

  return (
    <group position={[0, yOffset, 0]}>
      <mesh position={[0, safeH / 2 + 0.003, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[safeW * 0.95, safeD * 0.95]} />
        <meshStandardMaterial
          color="#e8dcc8"
          transparent
          opacity={0.2}
          roughness={1}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0, -safeH / 2 + 0.15, safeD / 2 + 0.003]}>
        <planeGeometry args={[safeW, 0.3]} />
        <meshStandardMaterial
          color="#8b7355"
          transparent
          opacity={0.15}
          roughness={1}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
};

// Weld seams for silos
export const WeldSeams: React.FC<{ radius: number; height: number; enabled: boolean }> = ({
  radius,
  height,
  enabled,
}) => {
  if (!enabled) return null;
  const seamCount = Math.floor(height / 3);
  return (
    <group>
      {Array.from({ length: seamCount }).map((_, i) => (
        <mesh key={i} position={[0, -height / 2 + (i + 1) * (height / (seamCount + 1)), 0]}>
          <torusGeometry args={[radius + 0.02, 0.015, 8, 32]} />
          <meshStandardMaterial
            color="#94a3b8"
            metalness={0.8}
            roughness={0.3}
            normalMap={PROCEDURAL_TEXTURES.brushedMetal}
            normalScale={new THREE.Vector2(0.15, 0.15)}
          />
        </mesh>
      ))}
    </group>
  );
};
