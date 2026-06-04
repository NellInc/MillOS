import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { shouldRunThisFrame } from '../../utils/frameThrottle';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';

// Cobweb component for corners and rafters
export const Cobweb: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
}> = ({ position, rotation = [0, 0, 0], scale = 1 }) => {
  const meshRef = useRef<THREE.Mesh>(null);

  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);

  // Create cobweb geometry with radial lines
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const vertices: number[] = [];
    const center = [0, 0, 0];
    const radius = 1.5 * scale;
    const spokes = 8;
    const rings = 5;

    // Create radial spokes
    for (let i = 0; i < spokes; i++) {
      const angle = (i / spokes) * Math.PI * 2;
      vertices.push(center[0], center[1], center[2]);
      vertices.push(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius * 0.3, // Sag effect
        Math.sin(angle) * radius
      );
    }

    // Create concentric rings with sag
    for (let ring = 1; ring <= rings; ring++) {
      const ringRadius = (ring / rings) * radius;
      const sag = ring * 0.05;
      for (let i = 0; i < spokes; i++) {
        const angle1 = (i / spokes) * Math.PI * 2;
        const angle2 = ((i + 1) / spokes) * Math.PI * 2;
        vertices.push(
          Math.cos(angle1) * ringRadius,
          -sag + Math.sin(angle1 * 2) * 0.02,
          Math.sin(angle1) * ringRadius
        );
        vertices.push(
          Math.cos(angle2) * ringRadius,
          -sag + Math.sin(angle2 * 2) * 0.02,
          Math.sin(angle2) * ringRadius
        );
      }
    }

    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    return geo;
  }, [scale]);

  // Dispose the memoized geometry on unmount / regeneration to avoid GPU leaks
  useEffect(() => () => geometry.dispose(), [geometry]);

  // Subtle swaying animation
  useFrame((state) => {
    if (!isTabVisible) return;
    if (!shouldRunThisFrame(3)) return;
    if (meshRef.current) {
      meshRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.3) * 0.02;
    }
  });

  return (
    <lineSegments ref={meshRef} position={position} rotation={rotation} geometry={geometry}>
      <lineBasicMaterial color="#94a3b8" transparent opacity={0.3} />
    </lineSegments>
  );
};

// Rust stain component for equipment surfaces
export const RustStain: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
  size?: number;
}> = ({ position, rotation = [0, 0, 0], size = 0.5 }) => {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, 128, 128);

    // Create irregular rust stain
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 60);
    gradient.addColorStop(0, 'rgba(139, 69, 19, 0.6)');
    gradient.addColorStop(0.3, 'rgba(160, 82, 45, 0.4)');
    gradient.addColorStop(0.6, 'rgba(205, 133, 63, 0.2)');
    gradient.addColorStop(1, 'rgba(205, 133, 63, 0)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const r = 40 + Math.random() * 20;
      const x = 64 + Math.cos(angle) * r;
      const y = 64 + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();

    // Add drip streaks
    for (let i = 0; i < 3; i++) {
      const startX = 50 + Math.random() * 28;
      const startY = 70;
      const length = 20 + Math.random() * 30;

      const dripGradient = ctx.createLinearGradient(startX, startY, startX, startY + length);
      dripGradient.addColorStop(0, 'rgba(139, 69, 19, 0.4)');
      dripGradient.addColorStop(1, 'rgba(139, 69, 19, 0)');

      ctx.strokeStyle = dripGradient;
      ctx.lineWidth = 2 + Math.random() * 3;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(startX + (Math.random() - 0.5) * 10, startY + length);
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }, []);

  // Dispose the memoized canvas texture on unmount to avoid GPU leaks
  useEffect(() => () => texture.dispose(), [texture]);

  // Guard against NaN/invalid size for PlaneGeometry
  const safeSize = Number.isFinite(size) && size > 0.01 ? size : 0.5;

  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[safeSize, safeSize]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
};

// Dust bunny
export const DustBunny: React.FC<{ position: [number, number, number] }> = ({ position }) => {
  const bunnyRef = useRef<THREE.Mesh>(null);
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);

  // Stabilize the random radius so geometry is not recreated on every re-render
  const radius = useMemo(() => 0.03 + Math.random() * 0.02, []);

  // Very occasional drift
  useFrame((state) => {
    if (!isTabVisible) return;
    if (!shouldRunThisFrame(3)) return;
    if (!bunnyRef.current) return;
    if (Math.random() < 0.001) {
      bunnyRef.current.position.x += (Math.random() - 0.5) * 0.01;
      bunnyRef.current.position.z += (Math.random() - 0.5) * 0.01;
    }
    bunnyRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.1) * 0.1;
  });

  return (
    <mesh ref={bunnyRef} position={position}>
      <icosahedronGeometry args={[radius, 0]} />
      <meshStandardMaterial color="#9ca3af" roughness={1} transparent opacity={0.7} />
    </mesh>
  );
};
