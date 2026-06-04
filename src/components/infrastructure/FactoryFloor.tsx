import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useGraphicsStore } from '../../stores/graphicsStore';
import { ReflectiveFloor } from './ReflectiveFloor';
import { useModelTextures } from '../../utils/machineTextures';
import { FLOOR_LAYERS, POLYGON_OFFSET, RENDER_ORDER } from '../../constants/renderLayers';

// Sub-layer offsets for multi-layer effects (used within rotated groups)
// These are relative z-offsets that become y-offsets after rotation
const SUB_LAYER_OFFSETS = {
  base: 0,
  middle: 0.003,
  top: 0.006,
} as const;

import { generateConcrete, generateConcreteRoughness } from '../../textures/concrete';
import { generatePanelNormal } from '../../textures/normalGenerator';

interface FactoryFloorProps {
  floorSize: number; // Legacy: used as fallback
  floorWidth?: number; // X dimension (wider for truck bays)
  floorDepth?: number; // Z dimension
  showZones: boolean;
}

// Legacy alias for backward compatibility within this file
const FLOOR_LAYER_HEIGHTS = FLOOR_LAYERS;
const FLOOR_POLYGON_OFFSET = POLYGON_OFFSET.standard;

// Procedural concrete textures (generated once, cached)
const proceduralConcreteColor = generateConcrete(512, 64, true);
const proceduralConcreteRoughness = generateConcreteRoughness(512);
const proceduralConcreteNormal = generatePanelNormal(512, 8, 0.03);

// Hook to configure concrete textures for floor tiling
// Uses external textures on high/ultra, procedural on low/medium
const useConcreteFloorTextures = (width: number, depth: number) => {
  const concreteTextures = useModelTextures('concrete');
  const quality = useGraphicsStore((state) => state.graphics.quality);
  const useProceduralFallback = quality === 'low' || quality === 'medium';

  // Configure tiling for floor dimensions
  useMemo(() => {
    const repeatX = Math.max(1, width / 10);
    const repeatY = Math.max(1, depth / 10);

    // Configure external textures if available
    if (concreteTextures.color) {
      concreteTextures.color.wrapS = concreteTextures.color.wrapT = THREE.RepeatWrapping;
      concreteTextures.color.repeat.set(repeatX, repeatY);
    }
    if (concreteTextures.normal) {
      concreteTextures.normal.wrapS = concreteTextures.normal.wrapT = THREE.RepeatWrapping;
      concreteTextures.normal.repeat.set(repeatX, repeatY);
    }
    if (concreteTextures.roughness) {
      concreteTextures.roughness.wrapS = concreteTextures.roughness.wrapT = THREE.RepeatWrapping;
      concreteTextures.roughness.repeat.set(repeatX, repeatY);
    }
    if (concreteTextures.ao) {
      concreteTextures.ao.wrapS = concreteTextures.ao.wrapT = THREE.RepeatWrapping;
      concreteTextures.ao.repeat.set(repeatX, repeatY);
    }

    // Configure procedural textures
    proceduralConcreteColor.wrapS = proceduralConcreteColor.wrapT = THREE.RepeatWrapping;
    proceduralConcreteColor.repeat.set(repeatX, repeatY);
    proceduralConcreteRoughness.wrapS = proceduralConcreteRoughness.wrapT = THREE.RepeatWrapping;
    proceduralConcreteRoughness.repeat.set(repeatX, repeatY);
    proceduralConcreteNormal.wrapS = proceduralConcreteNormal.wrapT = THREE.RepeatWrapping;
    proceduralConcreteNormal.repeat.set(repeatX, repeatY);
  }, [concreteTextures, width, depth]);

  // Return procedural textures as fallback when external not available
  if (useProceduralFallback || !concreteTextures.color) {
    return {
      color: proceduralConcreteColor,
      normal: proceduralConcreteNormal,
      roughness: proceduralConcreteRoughness,
      ao: null,
    };
  }

  return concreteTextures;
};

// Generate hazard stripe texture for safety walkways
const useHazardStripeTexture = (type: 'walkway' | 'danger') => {
  const texture = useMemo(() => {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Transparent background
    ctx.clearRect(0, 0, size, size);

    const stripeWidth = 32;
    const stripeColor = type === 'danger' ? '#dc2626' : '#eab308';
    const darkColor = '#1e293b';

    // Draw diagonal hazard stripes along edges
    ctx.save();

    // Top edge stripes
    ctx.beginPath();
    ctx.rect(0, 0, size, stripeWidth * 1.5);
    ctx.clip();

    for (let i = -size; i < size * 2; i += stripeWidth * 2) {
      ctx.fillStyle = stripeColor;
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + stripeWidth, 0);
      ctx.lineTo(i + stripeWidth + stripeWidth * 1.5, stripeWidth * 1.5);
      ctx.lineTo(i + stripeWidth * 1.5, stripeWidth * 1.5);
      ctx.fill();

      ctx.fillStyle = darkColor;
      ctx.beginPath();
      ctx.moveTo(i + stripeWidth, 0);
      ctx.lineTo(i + stripeWidth * 2, 0);
      ctx.lineTo(i + stripeWidth * 2 + stripeWidth * 1.5, stripeWidth * 1.5);
      ctx.lineTo(i + stripeWidth + stripeWidth * 1.5, stripeWidth * 1.5);
      ctx.fill();
    }
    ctx.restore();

    // Bottom edge stripes
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, size - stripeWidth * 1.5, size, stripeWidth * 1.5);
    ctx.clip();

    for (let i = -size; i < size * 2; i += stripeWidth * 2) {
      ctx.fillStyle = stripeColor;
      ctx.beginPath();
      ctx.moveTo(i, size);
      ctx.lineTo(i + stripeWidth, size);
      ctx.lineTo(i + stripeWidth - stripeWidth * 1.5, size - stripeWidth * 1.5);
      ctx.lineTo(i - stripeWidth * 1.5, size - stripeWidth * 1.5);
      ctx.fill();

      ctx.fillStyle = darkColor;
      ctx.beginPath();
      ctx.moveTo(i + stripeWidth, size);
      ctx.lineTo(i + stripeWidth * 2, size);
      ctx.lineTo(i + stripeWidth * 2 - stripeWidth * 1.5, size - stripeWidth * 1.5);
      ctx.lineTo(i + stripeWidth - stripeWidth * 1.5, size - stripeWidth * 1.5);
      ctx.fill();
    }
    ctx.restore();

    // Center dashed line for walkways
    if (type === 'walkway') {
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 3;
      ctx.setLineDash([20, 15]);
      ctx.beginPath();
      ctx.moveTo(0, size / 2);
      ctx.lineTo(size, size / 2);
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;

    return texture;
  }, [type]);

  // Dispose owned base CanvasTexture on unmount / type change
  useEffect(() => () => texture.dispose(), [texture]);

  return texture;
};

// Safety zone component with proper industrial markings
const SafetyZone: React.FC<{
  position: [number, number, number];
  size: [number, number];
  type: 'walkway' | 'danger';
  rotation?: number;
}> = React.memo(({ position, size, type, rotation = 0 }) => {
  const texture = useHazardStripeTexture(type);

  // CRITICAL: Guard against NaN/invalid dimensions
  const safeWidth = Number.isFinite(size[0]) && size[0] > 0 ? size[0] : 1;
  const safeHeight = Number.isFinite(size[1]) && size[1] > 0 ? size[1] : 1;
  const innerWidth = Math.max(0.1, safeWidth - 0.6);
  const innerHeight = Math.max(0.1, safeHeight - 0.6);

  // Calculate texture repeat based on size for consistent stripe width
  const repeatX = safeWidth / 4;
  const repeatY = safeHeight / 4;

  const clonedTexture = useMemo(() => {
    const t = texture.clone();
    t.repeat.set(repeatX, repeatY);
    t.needsUpdate = true;
    return t;
  }, [texture, repeatX, repeatY]);

  // Dispose owned cloned CanvasTexture on unmount / re-clone
  useEffect(() => () => clonedTexture.dispose(), [clonedTexture]);

  return (
    <group
      position={position}
      rotation={[-Math.PI / 2, 0, rotation]}
      renderOrder={RENDER_ORDER.floorMarkings}
    >
      {/* Subtle inner fill - base layer */}
      <mesh position={[0, 0, SUB_LAYER_OFFSETS.base]}>
        <planeGeometry args={[innerWidth, innerHeight]} />
        <meshBasicMaterial
          color={type === 'danger' ? '#7f1d1d' : '#422006'}
          transparent
          opacity={0.15}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={FLOOR_POLYGON_OFFSET.factor}
          polygonOffsetUnits={FLOOR_POLYGON_OFFSET.units}
        />
      </mesh>

      {/* Hazard stripe border - top layer */}
      <mesh position={[0, 0, SUB_LAYER_OFFSETS.middle]}>
        <planeGeometry args={[safeWidth, safeHeight]} />
        <meshBasicMaterial
          map={clonedTexture}
          transparent
          opacity={0.85}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={FLOOR_POLYGON_OFFSET.factor}
          polygonOffsetUnits={FLOOR_POLYGON_OFFSET.units}
        />
      </mesh>
    </group>
  );
});

// Floor puddle with reflective surface
const FloorPuddle: React.FC<{
  position: [number, number, number];
  size: [number, number];
  seed: number;
}> = React.memo(({ position, size, seed }) => {
  const random = (s: number) => Math.abs(Math.sin(s * 12.9898 + 78.233) * 43758.5453) % 1;

  // Load water textures (high/ultra only)
  const waterTextures = useModelTextures('water');

  // Generate irregular puddle shape points
  const shape = useMemo(() => {
    const points: [number, number][] = [];
    const segments = 12;
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const radiusVariation = 0.7 + random(seed + i) * 0.6;
      const r = (size[0] / 2) * radiusVariation;
      points.push([Math.cos(angle) * r, Math.sin(angle) * r * (size[1] / size[0])]);
    }
    return points;
  }, [size, seed]);

  const shapeGeometry = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(shape[0][0], shape[0][1]);
    for (let i = 1; i < shape.length; i++) {
      const curr = shape[i];
      const next = shape[(i + 1) % shape.length];
      const cpX = curr[0];
      const cpY = curr[1];
      s.quadraticCurveTo(cpX, cpY, (curr[0] + next[0]) / 2, (curr[1] + next[1]) / 2);
    }
    s.closePath();
    return new THREE.ShapeGeometry(s);
  }, [shape]);

  // Dispose owned ShapeGeometry on unmount / regeneration (R3F does not
  // auto-dispose geometry passed via the geometry={} prop)
  useEffect(() => () => shapeGeometry.dispose(), [shapeGeometry]);

  return (
    <group
      position={position}
      rotation={[-Math.PI / 2, 0, random(seed) * Math.PI * 2]}
      renderOrder={RENDER_ORDER.floorEffects}
    >
      {/* Wet floor darkening - base layer */}
      <mesh position={[0, 0, SUB_LAYER_OFFSETS.base]} geometry={shapeGeometry}>
        <meshBasicMaterial color="#0f172a" transparent opacity={0.4} depthWrite={false} />
      </mesh>

      {/* Reflective water surface - middle layer */}
      <mesh position={[0, 0, SUB_LAYER_OFFSETS.middle]} geometry={shapeGeometry}>
        <meshStandardMaterial
          color="#1e3a5f"
          map={waterTextures.color}
          normalMap={waterTextures.normal}
          normalScale={waterTextures.normal ? new THREE.Vector2(0.3, 0.3) : undefined}
          roughnessMap={waterTextures.roughness}
          metalness={0.9}
          roughness={0.1}
          transparent
          opacity={0.6}
          envMapIntensity={2}
          depthWrite={false}
        />
      </mesh>

      {/* Subtle ripple highlight - top layer */}
      <mesh position={[0, 0, SUB_LAYER_OFFSETS.top]} geometry={shapeGeometry}>
        <meshBasicMaterial color="#60a5fa" transparent opacity={0.08} depthWrite={false} />
      </mesh>
    </group>
  );
});

// Worn footpath texture overlay
const WornFootpath: React.FC<{
  path: Array<[number, number, number]>;
  width?: number;
  height?: number;
}> = React.memo(({ path, width = 2, height = FLOOR_LAYER_HEIGHTS.wornPrimary }) => {
  const texture = useMemo(() => {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Transparent base
    ctx.clearRect(0, 0, size, size);

    // Worn/scuffed pattern
    ctx.fillStyle = 'rgba(50, 60, 70, 0.3)';

    // Random scuff marks
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const w = 5 + Math.random() * 15;
      const h = 2 + Math.random() * 5;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.random() * Math.PI);
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.restore();
    }

    // Footprint-like darker areas
    ctx.fillStyle = 'rgba(30, 40, 50, 0.2)';
    for (let i = 0; i < 15; i++) {
      const x = size / 4 + (Math.random() * size) / 2;
      const y = Math.random() * size;
      ctx.beginPath();
      ctx.ellipse(x, y, 8, 12, Math.random() * 0.3 - 0.15, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }, []);

  // Dispose owned base scuff CanvasTexture on unmount
  useEffect(() => () => texture.dispose(), [texture]);

  // Create path segments
  // CRITICAL: Filter out zero-length segments to prevent NaN in PlaneGeometry
  // "computeBoundingSphere(): Computed radius is NaN" errors
  const segments = useMemo(() => {
    const segs: Array<{
      position: [number, number, number];
      rotation: number;
      length: number;
    }> = [];

    const MIN_SEGMENT_LENGTH = 0.01; // Minimum length to prevent NaN geometry

    for (let i = 0; i < path.length - 1; i++) {
      const start = path[i];
      const end = path[i + 1];
      const dx = end[0] - start[0];
      const dz = end[2] - start[2];
      const length = Math.sqrt(dx * dx + dz * dz);

      // Skip segments that are too short (would cause NaN in geometry)
      if (!Number.isFinite(length) || length < MIN_SEGMENT_LENGTH) {
        continue;
      }

      const rotation = Math.atan2(dx, dz);

      segs.push({
        position: [(start[0] + end[0]) / 2, 0.015, (start[2] + end[2]) / 2],
        rotation,
        length,
      });
    }

    return segs;
  }, [path]);

  const clonedTexture = useMemo(() => {
    const t = texture.clone();
    t.repeat.set(1, 4);
    t.needsUpdate = true;
    return t;
  }, [texture]);

  // Dispose owned cloned scuff CanvasTexture on unmount / re-clone
  useEffect(() => () => clonedTexture.dispose(), [clonedTexture]);

  // Defensive guard for width prop
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 2;

  return (
    <group>
      {segments.map((seg, i) => {
        // Double-guard: ensure geometry dimensions are valid
        const safeLength = Number.isFinite(seg.length) && seg.length > 0 ? seg.length : 0.01;
        return (
          <mesh
            key={i}
            position={[seg.position[0], height, seg.position[2]]}
            rotation={[-Math.PI / 2, 0, seg.rotation]}
          >
            <planeGeometry args={[safeWidth, safeLength]} />
            <meshBasicMaterial
              map={clonedTexture}
              transparent
              opacity={0.5}
              depthWrite={false}
              polygonOffset
              polygonOffsetFactor={FLOOR_POLYGON_OFFSET.factor}
              polygonOffsetUnits={FLOOR_POLYGON_OFFSET.units}
            />
          </mesh>
        );
      })}
    </group>
  );
});

export const FactoryFloor: React.FC<FactoryFloorProps> = React.memo(
  ({ floorSize, floorWidth, floorDepth, showZones }) => {
    const graphics = useGraphicsStore((state) => state.graphics);

    // Use new dimensions if provided, otherwise fall back to legacy square
    // CRITICAL: Guard against NaN/undefined/zero dimensions which cause
    // "computeBoundingSphere(): Computed radius is NaN" errors in THREE.js
    const rawWidth = floorWidth ?? floorSize;
    const rawDepth = floorDepth ?? floorSize;
    const actualWidth = Number.isFinite(rawWidth) && rawWidth > 0 ? rawWidth : 120;
    const actualDepth = Number.isFinite(rawDepth) && rawDepth > 0 ? rawDepth : 160;

    // Load concrete PBR textures (high/ultra only, returns null on low/medium)
    const concreteTextures = useConcreteFloorTextures(actualWidth, actualDepth);
    const graphicsQuality = graphics.quality;
    const isLowGraphics = graphicsQuality === 'low';

    // Feature flags from graphics settings
    const showPuddles = graphics.enableFloorPuddles;
    const showWornPaths = graphics.enableWornPaths;

    // Create optimized grid texture - single mesh instead of 58!
    const gridTexture = useMemo(() => {
      const size = 512;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;

      // Transparent background
      ctx.clearRect(0, 0, size, size);

      // Draw grid lines
      ctx.strokeStyle = 'rgba(51, 65, 85, 0.5)'; // #334155 with 50% opacity
      ctx.lineWidth = 1;

      // Vertical and horizontal lines every 5 units (scaled to texture)
      const gridSpacing = size / 5; // 5 lines per texture repeat
      for (let i = 0; i <= 5; i++) {
        const pos = i * gridSpacing;
        // Vertical
        ctx.beginPath();
        ctx.moveTo(pos, 0);
        ctx.lineTo(pos, size);
        ctx.stroke();
        // Horizontal
        ctx.beginPath();
        ctx.moveTo(0, pos);
        ctx.lineTo(size, pos);
        ctx.stroke();
      }

      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(actualWidth / 5, actualDepth / 5);
      return texture;
    }, [actualWidth, actualDepth]);

    // Dispose the grid CanvasTexture on unmount / dimension change to avoid
    // orphaning GPU textures, matching the other CanvasTextures in this file.
    useEffect(() => () => gridTexture.dispose(), [gridTexture]);

    return (
      <group matrixAutoUpdate={false}>
        {/* Main floor - standard material on low/medium, reflector on high/ultra */}
        {graphicsQuality === 'high' || graphicsQuality === 'ultra' ? (
          <ReflectiveFloor width={actualWidth} depth={actualDepth} />
        ) : (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow={false}>
            <planeGeometry args={[actualWidth, actualDepth]} />
            <meshStandardMaterial
              color={concreteTextures.color ? '#ffffff' : '#1e293b'}
              map={concreteTextures.color}
              normalMap={concreteTextures.normal}
              normalScale={concreteTextures.normal ? new THREE.Vector2(0.5, 0.5) : undefined}
              roughnessMap={concreteTextures.roughness}
              roughness={0.95}
              metalness={0.02}
              aoMap={concreteTextures.ao}
              aoMapIntensity={concreteTextures.ao ? 0.5 : 0}
            />
          </mesh>
        )}

        {/* Floor grid lines - OPTIMIZED: Single textured mesh replaces 58 individual meshes */}
        {/* RESTORED: Now shows on MEDIUM+ (!isLowGraphics) instead of HIGH+ only */}
        {/* Raised to y=0.045 to prevent z-fighting with SafetyZone stripes and worn paths */}
        {!isLowGraphics && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, FLOOR_LAYER_HEIGHTS.grid, 0]}>
            <planeGeometry args={[actualWidth, actualDepth]} />
            <meshBasicMaterial
              map={gridTexture}
              transparent
              depthWrite={false}
              polygonOffset
              polygonOffsetFactor={FLOOR_POLYGON_OFFSET.factor}
              polygonOffsetUnits={FLOOR_POLYGON_OFFSET.units}
            />
          </mesh>
        )}

        {/* Safety walkways with industrial hazard stripe markings */}
        {showZones && (
          <>
            {/* Main aisles (vertical) */}
            <SafetyZone
              position={[-10, FLOOR_LAYER_HEIGHTS.safetyMain, 0]}
              size={[3, actualDepth - 10]}
              type="walkway"
            />
            <SafetyZone
              position={[10, FLOOR_LAYER_HEIGHTS.safetyMain, 0]}
              size={[3, actualDepth - 10]}
              type="walkway"
            />

            {/* Cross aisles (horizontal) */}
            <SafetyZone
              position={[0, FLOOR_LAYER_HEIGHTS.safetyCross, 10]}
              size={[actualWidth - 20, 2.5]}
              type="walkway"
              rotation={Math.PI / 2}
            />
            <SafetyZone
              position={[0, FLOOR_LAYER_HEIGHTS.safetyCross, -10]}
              size={[actualWidth - 20, 2.5]}
              type="walkway"
              rotation={Math.PI / 2}
            />

            {/* Danger zones around machinery */}
            <SafetyZone
              position={[0, FLOOR_LAYER_HEIGHTS.safetyDanger, -20]}
              size={[60, 8]}
              type="danger"
              rotation={Math.PI / 2}
            />
          </>
        )}

        {/* Floor puddles - high/ultra graphics only */}
        {showPuddles && (
          <>
            {/* Near machinery areas */}
            <FloorPuddle
              position={[-20, FLOOR_LAYER_HEIGHTS.puddle, -15]}
              size={[2.5, 1.8]}
              seed={1}
            />
            <FloorPuddle
              position={[22, FLOOR_LAYER_HEIGHTS.puddle, -18]}
              size={[1.8, 2.2]}
              seed={2}
            />
            <FloorPuddle position={[-10, FLOOR_LAYER_HEIGHTS.puddle, -25]} size={[3, 2]} seed={3} />
            {/* Central factory */}
            <FloorPuddle position={[8, FLOOR_LAYER_HEIGHTS.puddle, 10]} size={[2, 1.5]} seed={4} />
            <FloorPuddle
              position={[-30, FLOOR_LAYER_HEIGHTS.puddle, 5]}
              size={[1.5, 1.2]}
              seed={5}
            />
            <FloorPuddle
              position={[35, FLOOR_LAYER_HEIGHTS.puddle, -5]}
              size={[2.2, 1.8]}
              seed={6}
            />
            {/* Near packing zone */}
            <FloorPuddle
              position={[-15, FLOOR_LAYER_HEIGHTS.puddle, 28]}
              size={[2, 1.8]}
              seed={7}
            />
            <FloorPuddle position={[18, FLOOR_LAYER_HEIGHTS.puddle, 32]} size={[1.6, 2]} seed={8} />
            {/* Near dock staging areas */}
            <FloorPuddle
              position={[-38, FLOOR_LAYER_HEIGHTS.puddle, 20]}
              size={[2.5, 2]}
              seed={9}
            />
            <FloorPuddle
              position={[40, FLOOR_LAYER_HEIGHTS.puddle, -20]}
              size={[2, 1.5]}
              seed={10}
            />
          </>
        )}

        {/* Worn footpaths - medium+ graphics */}
        {showWornPaths && (
          <>
            {/* Main aisle worn paths */}
            <WornFootpath
              path={[
                [-15, 0, -35],
                [-15, 0, 0],
                [-15, 0, 35],
              ]}
              width={2.5}
              height={FLOOR_LAYER_HEIGHTS.wornPrimary}
            />
            <WornFootpath
              path={[
                [15, 0, -35],
                [15, 0, 0],
                [15, 0, 35],
              ]}
              width={2.5}
              height={FLOOR_LAYER_HEIGHTS.wornPrimary}
            />
            {/* Cross aisle paths */}
            <WornFootpath
              path={[
                [-45, 0, 10],
                [0, 0, 10],
                [45, 0, 10],
              ]}
              width={1.8}
              height={FLOOR_LAYER_HEIGHTS.wornSecondary}
            />
            <WornFootpath
              path={[
                [-45, 0, -10],
                [0, 0, -10],
                [45, 0, -10],
              ]}
              width={1.8}
              height={FLOOR_LAYER_HEIGHTS.wornSecondary}
            />
            {/* Path to break rooms (inside factory) */}
            <WornFootpath
              path={[
                [15, 0, 20],
                [25, 0, 22],
                [35, 0, 25],
              ]}
              width={1.5}
              height={FLOOR_LAYER_HEIGHTS.wornPrimary}
            />
            <WornFootpath
              path={[
                [-15, 0, 20],
                [-25, 0, 22],
                [-35, 0, 25],
              ]}
              width={1.5}
              height={FLOOR_LAYER_HEIGHTS.wornPrimary}
            />
            {/* Path to locker room (inside factory) */}
            <WornFootpath
              path={[
                [-15, 0, 30],
                [-25, 0, 32],
                [-35, 0, 35],
              ]}
              width={1.8}
              height={FLOOR_LAYER_HEIGHTS.wornSecondary}
            />
            {/* Path to toilet block (inside factory) */}
            <WornFootpath
              path={[
                [15, 0, 30],
                [25, 0, 32],
                [35, 0, 35],
              ]}
              width={1.8}
              height={FLOOR_LAYER_HEIGHTS.wornSecondary}
            />
          </>
        )}
      </group>
    );
  }
);
