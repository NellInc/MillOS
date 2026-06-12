import React, { useRef, useMemo, useState, useEffect } from 'react';
import * as THREE from 'three';
import { useAmbientAnimation } from './shared';
import { FLOOR_LAYERS, POLYGON_OFFSET, RENDER_ORDER } from '../../constants/renderLayers';

/** Dispose a manually-created GPU resource when its owner unmounts. */
function useDispose(resource: { dispose: () => void }): void {
  useEffect(() => () => resource.dispose(), [resource]);
}

// ==========================================
// WEAR & DAMAGE COMPONENTS
// Cobwebs, rust stains, puddles, water damage
// ==========================================

export const Cobweb: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
}> = ({ position, rotation = [0, 0, 0], scale = 1 }) => {
  const meshRef = useRef<THREE.Mesh>(null);

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
  useDispose(geometry);

  // Subtle swaying animation using centralized manager
  const animationId = useMemo(
    () => `cobweb-${position.join(',')}-${rotation.join(',')}`,
    [position, rotation]
  );

  useAmbientAnimation(animationId, (time) => {
    if (meshRef.current) {
      meshRef.current.rotation.z = Math.sin(time * 0.3) * 0.02;
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
  // Guard against NaN/invalid size
  const safeSize = Number.isFinite(size) && size > 0 ? size : 0.5;

  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    // Transparent background
    ctx.clearRect(0, 0, 128, 128);

    // Create irregular rust stain
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 60);
    gradient.addColorStop(0, 'rgba(139, 69, 19, 0.6)');
    gradient.addColorStop(0.3, 'rgba(160, 82, 45, 0.4)');
    gradient.addColorStop(0.6, 'rgba(205, 133, 63, 0.2)');
    gradient.addColorStop(1, 'rgba(205, 133, 63, 0)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    // Create irregular blob shape
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
  useDispose(texture);

  return (
    <mesh position={position} rotation={rotation} renderOrder={RENDER_ORDER.floorEffects}>
      <planeGeometry args={[safeSize, safeSize]} />
      <meshBasicMaterial
        map={texture}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        polygonOffset
        polygonOffsetFactor={POLYGON_OFFSET.standard.factor}
        polygonOffsetUnits={POLYGON_OFFSET.standard.units}
      />
    </mesh>
  );
};

// Oil puddle with reflections

export const OilPuddle: React.FC<{ position: [number, number, number]; size?: number }> = ({
  position,
  size = 1,
}) => {
  const meshRef = useRef<THREE.Mesh>(null);

  // Animate subtle iridescence using centralized manager
  const animationId = useMemo(() => `oil-puddle-${position.join(',')}`, [position]);

  useAmbientAnimation(animationId, (time) => {
    if (meshRef.current) {
      const mat = meshRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.1 + Math.sin(time * 0.5) * 0.05;
    }
  });

  const shape = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const vertices: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    // Create irregular puddle shape
    const points = 16;
    const baseRadius = size * 0.5;

    // Center vertex
    vertices.push(0, 0, 0);
    uvs.push(0.5, 0.5);

    for (let i = 0; i < points; i++) {
      const angle = (i / points) * Math.PI * 2;
      const r = baseRadius * (0.7 + Math.random() * 0.3);
      vertices.push(Math.cos(angle) * r, 0, Math.sin(angle) * r);
      uvs.push(0.5 + Math.cos(angle) * 0.5, 0.5 + Math.sin(angle) * 0.5);
    }

    // Create triangles
    for (let i = 0; i < points; i++) {
      indices.push(0, i + 1, ((i + 1) % points) + 1);
    }

    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    return geo;
  }, [size]);
  useDispose(shape);

  // Stable random rotation — inline Math.random() in JSX re-rolled every render
  const yRotation = useMemo(() => Math.random() * Math.PI * 2, []);

  return (
    <mesh
      ref={meshRef}
      position={position}
      rotation={[-Math.PI / 2, 0, yRotation]}
      geometry={shape}
      renderOrder={RENDER_ORDER.floorEffects}
    >
      <meshStandardMaterial
        color="#1a1a2e"
        metalness={0.9}
        roughness={0.1}
        transparent
        opacity={0.7}
        emissive="#3b82f6"
        emissiveIntensity={0.1}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={POLYGON_OFFSET.standard.factor}
        polygonOffsetUnits={POLYGON_OFFSET.standard.units}
      />
    </mesh>
  );
};

// Rain puddle for outdoor areas (clear water after rain)

export const RainPuddle: React.FC<{ position: [number, number, number]; size?: number }> = ({
  position,
  size = 1.5,
}) => {
  const meshRef = useRef<THREE.Mesh>(null);

  // Animate subtle surface ripple using centralized manager
  const animationId = useMemo(() => `rain-puddle-${position.join(',')}`, [position]);

  useAmbientAnimation(animationId, (time) => {
    if (meshRef.current) {
      const mat = meshRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.05 + Math.sin(time * 0.8) * 0.02;
    }
  });

  const shape = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const vertices: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    // Create irregular puddle shape
    const points = 20;
    const baseRadius = size * 0.5;

    // Center vertex
    vertices.push(0, 0, 0);
    uvs.push(0.5, 0.5);

    for (let i = 0; i < points; i++) {
      const angle = (i / points) * Math.PI * 2;
      const r = baseRadius * (0.6 + Math.random() * 0.4);
      vertices.push(Math.cos(angle) * r, 0, Math.sin(angle) * r);
      uvs.push(0.5 + Math.cos(angle) * 0.5, 0.5 + Math.sin(angle) * 0.5);
    }

    // Create triangles
    for (let i = 0; i < points; i++) {
      indices.push(0, i + 1, ((i + 1) % points) + 1);
    }

    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    return geo;
  }, [size]);
  useDispose(shape);

  // Stable random rotation — inline Math.random() in JSX re-rolled every render
  const yRotation = useMemo(() => Math.random() * Math.PI * 2, []);

  return (
    <mesh
      ref={meshRef}
      position={position}
      rotation={[-Math.PI / 2, 0, yRotation]}
      geometry={shape}
      renderOrder={RENDER_ORDER.floorEffects}
    >
      <meshStandardMaterial
        color="#1e3a5f"
        metalness={0.95}
        roughness={0.05}
        transparent
        opacity={0.4}
        emissive="#60a5fa"
        emissiveIntensity={0.05}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={POLYGON_OFFSET.standard.factor}
        polygonOffsetUnits={POLYGON_OFFSET.standard.units}
      />
    </mesh>
  );
};

// Animated safety signage with blinking lights

export const ScorchMark: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
  size?: number;
}> = ({ position, rotation = [0, 0, 0], size = 0.5 }) => {
  // Guard against NaN/invalid size
  const safeSize = Number.isFinite(size) && size > 0 ? size : 0.5;

  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, 128, 128);

    // Create irregular scorch pattern
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 55);
    gradient.addColorStop(0, 'rgba(20, 20, 20, 0.8)');
    gradient.addColorStop(0.3, 'rgba(40, 30, 20, 0.6)');
    gradient.addColorStop(0.6, 'rgba(60, 40, 20, 0.3)');
    gradient.addColorStop(1, 'rgba(80, 50, 30, 0)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      const r = 35 + Math.random() * 25;
      const x = 64 + Math.cos(angle) * r;
      const y = 64 + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();

    // Add some spark splatter
    for (let i = 0; i < 20; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 30 + Math.random() * 30;
      ctx.fillStyle = `rgba(30, 30, 30, ${0.3 + Math.random() * 0.3})`;
      ctx.beginPath();
      ctx.arc(
        64 + Math.cos(angle) * dist,
        64 + Math.sin(angle) * dist,
        2 + Math.random() * 4,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }, []);
  useDispose(texture);

  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[safeSize, safeSize]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
};

// ==========================================
// MORE PROPS
// ==========================================

// Oil drum / barrel

export const RoofLeakPuddle: React.FC<{ position: [number, number, number]; size?: number }> = ({
  position,
  size = 0.8,
}) => {
  const dropRef = useRef<THREE.Mesh>(null);
  const rippleRef = useRef<THREE.Mesh>(null);
  const [dropY, setDropY] = useState(3);

  // Roof leak drip animation using centralized manager
  const animationId = useMemo(() => `roof-leak-${position.join(',')}`, [position]);

  useAmbientAnimation(animationId, (_time, delta) => {
    // Falling drop
    setDropY((prev) => {
      const newY = prev - delta * 4;
      if (newY < 0) {
        return 3 + Math.random() * 2; // Reset with variation
      }
      return newY;
    });

    if (dropRef.current) {
      dropRef.current.position.y = dropY;
      dropRef.current.visible = dropY > 0.1;
    }

    // Ripple animation
    if (rippleRef.current && dropY < 0.5 && dropY > 0.1) {
      const scale = 1 + (0.5 - dropY) * 3;
      rippleRef.current.scale.set(scale, scale, 1);
      const mat = rippleRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.5 * (dropY / 0.5);
    }
  });

  return (
    <group position={position}>
      {/* Puddle on floor */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, FLOOR_LAYERS.puddle, 0]}
        renderOrder={RENDER_ORDER.floorEffects}
      >
        <circleGeometry args={[size * 0.5, 24]} />
        <meshStandardMaterial
          color="#60a5fa"
          transparent
          opacity={0.4}
          metalness={0.9}
          roughness={0.1}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET.subtle.factor}
          polygonOffsetUnits={POLYGON_OFFSET.subtle.units}
        />
      </mesh>
      {/* Ripple effect */}
      <mesh
        ref={rippleRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, FLOOR_LAYERS.puddle, 0]}
        renderOrder={RENDER_ORDER.floorEffects + 1}
      >
        <ringGeometry args={[0.02, 0.05, 16]} />
        <meshBasicMaterial
          color="#93c5fd"
          transparent
          opacity={0.3}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET.moderate.factor}
          polygonOffsetUnits={POLYGON_OFFSET.moderate.units}
        />
      </mesh>
      {/* Falling drop */}
      <mesh ref={dropRef} position={[0, 3, 0]}>
        <sphereGeometry args={[0.02, 8, 8]} />
        <meshStandardMaterial color="#60a5fa" transparent opacity={0.7} />
      </mesh>
    </group>
  );
};

// Condensation on windows

export const CeilingWaterStain: React.FC<{ position: [number, number, number]; size?: number }> = ({
  position,
  size = 1.5,
}) => {
  // Guard against NaN/invalid size
  const safeSize = Number.isFinite(size) && size > 0 ? size : 1.5;

  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, 128, 128);

    // Main stain
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 55);
    gradient.addColorStop(0, 'rgba(139, 119, 101, 0.5)');
    gradient.addColorStop(0.4, 'rgba(139, 119, 101, 0.3)');
    gradient.addColorStop(0.7, 'rgba(180, 160, 140, 0.2)');
    gradient.addColorStop(1, 'rgba(180, 160, 140, 0)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    // Irregular shape
    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * Math.PI * 2;
      const r = 40 + Math.random() * 20;
      const x = 64 + Math.cos(angle) * r;
      const y = 64 + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();

    // Ring marks from repeated wetting
    for (let ring = 0; ring < 3; ring++) {
      ctx.strokeStyle = `rgba(100, 80, 60, ${0.1 + ring * 0.05})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(64, 64, 25 + ring * 12, 0, Math.PI * 2);
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }, []);
  useDispose(texture);

  return (
    <mesh position={position} rotation={[Math.PI / 2, 0, 0]}>
      <planeGeometry args={[safeSize, safeSize]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} />
    </mesh>
  );
};

// ==========================================
// MORE WILDLIFE
// ==========================================

// Moths circling lights

export const WindowCondensation: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
}> = ({ position, rotation = [0, 0, 0] }) => {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, 128, 128);

    // Fog/condensation effect
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(200, 220, 240, 0.4)');
    gradient.addColorStop(0.5, 'rgba(200, 220, 240, 0.2)');
    gradient.addColorStop(1, 'rgba(200, 220, 240, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);

    // Water droplets
    for (let i = 0; i < 50; i++) {
      const x = Math.random() * 128;
      const y = Math.random() * 128;
      const r = 1 + Math.random() * 3;
      ctx.fillStyle = `rgba(150, 200, 255, ${0.3 + Math.random() * 0.3})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Drip streaks
    for (let i = 0; i < 5; i++) {
      const x = 20 + Math.random() * 88;
      ctx.strokeStyle = 'rgba(150, 200, 255, 0.3)';
      ctx.lineWidth = 1 + Math.random() * 2;
      ctx.beginPath();
      ctx.moveTo(x, 30 + Math.random() * 30);
      ctx.lineTo(x + (Math.random() - 0.5) * 10, 90 + Math.random() * 30);
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }, []);
  useDispose(texture);

  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[2, 1.5]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} />
    </mesh>
  );
};

// Water stain on ceiling
