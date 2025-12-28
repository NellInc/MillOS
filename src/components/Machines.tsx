import React, { useRef, useState, useEffect, useMemo, Suspense } from 'react';
import { useFrame } from '@react-three/fiber';
import { MachineData, MachineType, GrainQuality } from '../types';
import * as THREE from 'three';
import { Html, useGLTF, Text } from '@react-three/drei';
import { audioManager } from '../utils/audioManager';
import { useGraphicsStore } from '../stores/graphicsStore';
import { useShallow } from 'zustand/react/shallow';
import { getStatusColor } from '../utils/statusColors';
import { useSCADAMachineVisuals, useSCADAAlarmVisuals } from '../scada';
import { useModelAvailable, MODEL_PATHS } from '../utils/modelLoader';
import { getThrottleLevel, shouldRunThisFrame } from '../utils/frameThrottle';
import { MACHINE_MATERIALS, METAL_MATERIALS, PROCEDURAL_TEXTURES } from '../utils/sharedMaterials';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useBreakdownStore } from '../stores/breakdownStore';
import { useProductionStore } from '../stores/productionStore';
import { useWorkerMoodStore } from '../stores/workerMoodStore';
import { BreakdownEffects } from './breakdown/BreakdownEffects';
import { InstancedSilos } from './machines/InstancedSilos';
import { InstancedRollerMills } from './machines/InstancedRollerMills';
import { InstancedPlansifters } from './machines/InstancedPlansifters';
import { InstancedPackers } from './machines/InstancedPackers';
import { useBassLevel } from '../stores/audioAnalyzerStore';

// =============================================================================
// CENTRALIZED ANIMATION MANAGER
// =============================================================================

// Registries to track animated objects without React re-renders or prop drilling
interface RollerAnimationState {
  mesh: THREE.Mesh;
  rpm: number;
}
const rollerRegistry = new Map<string, RollerAnimationState>();

interface PanelAnimationState {
  status: 'running' | 'idle' | 'warning' | 'critical';
  ledMaterials: THREE.MeshStandardMaterial[];
  screenMaterial: THREE.MeshStandardMaterial;
}
const panelRegistry = new Map<string, PanelAnimationState>();

// Shader uniform value can be number, vector, color, texture, etc.
type ShaderUniformValue =
  | number
  | THREE.Vector2
  | THREE.Vector3
  | THREE.Vector4
  | THREE.Color
  | THREE.Texture
  | null;

interface ShaderAnimationState {
  uniforms: { [key: string]: { value: ShaderUniformValue } };
}
const shaderRegistry = new Map<string, ShaderAnimationState>();

export const registerRoller = (id: string, state: RollerAnimationState) => {
  rollerRegistry.set(id, state);
};
export const unregisterRoller = (id: string) => {
  rollerRegistry.delete(id);
};

export const registerPanel = (id: string, state: PanelAnimationState) => {
  panelRegistry.set(id, state);
};
export const unregisterPanel = (id: string) => {
  panelRegistry.delete(id);
};

export const registerShader = (id: string, state: ShaderAnimationState) => {
  shaderRegistry.set(id, state);
};
export const unregisterShader = (id: string) => {
  shaderRegistry.delete(id);
};

// Manager component to handle all animations in a single consolidated loop
const MachineAnimationManager: React.FC = () => {
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);
  const quality = useGraphicsStore((state) => state.graphics.quality);
  const enableAudioReactive = useGraphicsStore((state) => state.graphics.enableAudioReactive);
  const bassLevel = useBassLevel();

  useFrame((state, delta) => {
    // Skip if tab not visible or low quality (animations disabled on low)
    if (!isTabVisible || quality === 'low') return;

    // 1. Update Rollers (Throttle: Ultra=1, High=2, Medium=2)
    const rollerThrottle = quality === 'ultra' ? 1 : 2;
    if (rollerRegistry.size > 0 && shouldRunThisFrame(rollerThrottle)) {
      const adjustedDelta = delta * rollerThrottle;
      rollerRegistry.forEach((data) => {
        if (data.rpm > 0) {
          data.mesh.rotation.x += (data.rpm / 60) * Math.PI * 2 * adjustedDelta;
        }
      });
    }

    // 2. Update Panels (Throttle: 4 frames ~15fps is plenty for blinking)
    if (panelRegistry.size > 0 && shouldRunThisFrame(4)) {
      const time = state.clock.elapsedTime;

      // Calculate blink states once per frame
      const runningState = Math.floor(time * 2) % 4;
      const warningState = Math.sin(time * 6) > 0 ? 1 : 0;
      const criticalState = Math.sin(time * 10) > 0 ? 2 : 3;

      const ledColors = {
        running: ['#22c55e', '#22c55e', '#3b82f6', '#3b82f6'],
        idle: ['#64748b', '#64748b', '#64748b', '#64748b'],
        warning: ['#f59e0b', '#1e293b', '#f59e0b', '#1e293b'],
        critical: ['#ef4444', '#ef4444', '#1e293b', '#1e293b'],
      };

      panelRegistry.forEach((data) => {
        const status = data.status;
        const colors = ledColors[status];
        let idx = 0;

        // Update blink state index
        if (status === 'running') idx = runningState;
        else if (status === 'warning') idx = warningState;
        else if (status === 'critical') idx = criticalState;
        else idx = 0;

        // Update LEDs directly without React re-render
        data.ledMaterials.forEach((mat, i) => {
          const color = colors[(idx + i) % 4];
          const isOff = color === '#1e293b' || (status === 'idle' && color === '#64748b');
          mat.color.set(color);
          mat.emissive.set(color);
          // Base intensity with audio-reactive bass modulation when enabled
          const baseIntensity = isOff ? 0 : 0.8;
          const bassBoost = enableAudioReactive ? bassLevel * 0.7 : 0;
          mat.emissiveIntensity = baseIntensity + (isOff ? 0 : bassBoost);
        });

        // Update screen only if status changed (handled by parent prop update mostly, but good to strictly enforce)
        // Optimization: Screen color is static per status, no need to animate unless status changes
        // We handle status changes by re-registering in useEffect
      });
    }

    // 3. Update Shaders (Heat shimmer etc)
    const shaderThrottle = quality === 'ultra' ? 1 : 2;
    if (shaderRegistry.size > 0 && shouldRunThisFrame(shaderThrottle)) {
      const time = state.clock.elapsedTime;
      shaderRegistry.forEach((data) => {
        if (data.uniforms.time) {
          data.uniforms.time.value = time;
        }
      });
    }
  });

  return null;
};

// Grain quality color mapping
const QUALITY_COLORS: Record<GrainQuality, string> = {
  premium: '#22c55e', // Green
  standard: '#3b82f6', // Blue
  economy: '#f59e0b', // Amber
  mixed: '#8b5cf6', // Purple
};

const QUALITY_LABELS: Record<GrainQuality, string> = {
  premium: 'Premium',
  standard: 'Standard',
  economy: 'Economy',
  mixed: 'Mixed',
};

// Grain types for silos
const GRAIN_TYPES = ['Wheat', 'Corn', 'Barley', 'Oats', 'Rye'];

const UNIT_CYLINDER = new THREE.CylinderGeometry(1, 1, 1, 32);
const UNIT_CYLINDER_LOW = new THREE.CylinderGeometry(1, 1, 1, 16);

// Fill level indicator for silos
const SiloFillIndicator: React.FC<{
  fillLevel: number;
  quality: GrainQuality;
  grainType: string;
  radius: number;
  height: number;
}> = React.memo(({ fillLevel, quality, grainType, radius, height }) => {
  const fillHeight = (fillLevel / 100) * height * 0.85;
  const qualityColor = QUALITY_COLORS[quality];
  const graphicsQuality = useGraphicsStore((state) => state.graphics.quality);

  // Calculate scales
  const cylinderRadius = radius - 0.15;
  // Position calculation:
  // Base is at -height/2 + 0.5.
  // We want the visual center of the cylinder to be at base + fillHeight/2.
  // Original: position={[0, -height / 2 + fillHeight / 2 + 0.5, 0]} with height=fillHeight
  // New: Same position, but geometry is height 1, so we scale Y by fillHeight.
  const posY = -height / 2 + fillHeight / 2 + 0.5;

  return (
    <group>
      {/* Grain fill visualization */}
      <mesh
        position={[0, posY, 0]}
        scale={[cylinderRadius, fillHeight, cylinderRadius]}
        geometry={graphicsQuality === 'low' ? UNIT_CYLINDER_LOW : UNIT_CYLINDER}
      >
        {graphicsQuality === 'low' ? (
          <meshBasicMaterial
            color={
              quality === 'premium' ? '#f5d78e' : quality === 'economy' ? '#d4a574' : '#e8c872'
            }
            transparent
            opacity={0.7}
          />
        ) : (
          <meshStandardMaterial
            color={
              quality === 'premium' ? '#f5d78e' : quality === 'economy' ? '#d4a574' : '#e8c872'
            }
            roughness={0.9}
            transparent
            opacity={0.7}
          />
        )}
      </mesh>

      {/* Quality indicator ring at fill level - skip on low */}
      {graphicsQuality !== 'low' && (
        <mesh position={[0, -height / 2 + fillHeight + 0.5, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[radius - 0.1, 0.05, 8, 32]} />
          <meshStandardMaterial
            color={qualityColor}
            emissive={qualityColor}
            emissiveIntensity={0.5}
            toneMapped={false}
          />
        </mesh>
      )}

      {/* Fill level percentage display - skip on low */}
      {graphicsQuality !== 'low' && (
        <Html position={[radius + 0.8, 0, 0]} center distanceFactor={15}>
          <div className="bg-slate-900/90 backdrop-blur px-2 py-1 rounded-lg border border-slate-700 min-w-[70px]">
            <div className="text-xs font-mono text-white font-bold">{fillLevel.toFixed(0)}%</div>
            <div className="text-[9px] text-slate-400">{grainType}</div>
            <div className="flex items-center gap-1 mt-0.5">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: qualityColor }} />
              <span className="text-[8px]" style={{ color: qualityColor }}>
                {QUALITY_LABELS[quality]}
              </span>
            </div>
          </div>
        </Html>
      )}
    </group>
  );
});

// Module-level cache for procedural textures to avoid regenerating identical textures
const textureCache = new Map<
  string,
  { roughnessMap: THREE.CanvasTexture; normalMap: THREE.CanvasTexture }
>();

// Maintenance countdown timer display
const MaintenanceCountdown: React.FC<{
  hoursRemaining: number;
  position: [number, number, number];
}> = React.memo(({ hoursRemaining, position }) => {
  const graphics = useGraphicsStore((state) => state.graphics.quality);

  // Skip Html overlay on low graphics
  if (graphics === 'low') return null;

  const isUrgent = hoursRemaining < 24;
  const isCritical = hoursRemaining < 8;

  const color = isCritical ? '#ef4444' : isUrgent ? '#f59e0b' : '#22c55e';

  // Format hours to days/hours display
  const formatTime = (hours: number) => {
    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      const remainingHours = Math.floor(hours % 24);
      return `${days}d ${remainingHours}h`;
    }
    return `${Math.floor(hours)}h`;
  };

  return (
    <Html position={position} center distanceFactor={12}>
      <div
        className={`bg-slate-900/90 backdrop-blur px-2 py-1 rounded border ${
          isCritical
            ? 'border-red-500/50 animate-pulse'
            : isUrgent
              ? 'border-amber-500/50'
              : 'border-slate-700'
        }`}
      >
        <div className="text-[8px] text-slate-500 uppercase tracking-wider">Maintenance</div>
        <div className="text-xs font-mono font-bold flex items-center gap-1" style={{ color }}>
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          {formatTime(hoursRemaining)}
        </div>
      </div>
    </Html>
  );
});

// Procedural texture generator for enhanced metal surfaces
const useProceduralMetalTexture = (enabled: boolean, seed: number = 0) => {
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
const WeatheringLayer: React.FC<{
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
const WeldSeams: React.FC<{ radius: number; height: number; enabled: boolean }> = ({
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

// Heat shimmer effect for hot machines
const HeatShimmer: React.FC<{
  position: [number, number, number];
  temperature: number;
  size: [number, number, number];
}> = React.memo(({ position, temperature, size }) => {
  const graphicsQuality = useGraphicsStore.getState().graphics.quality;
  const isLowQuality = graphicsQuality === 'low';

  // Guard against NaN/invalid dimensions
  const safeW = Number.isFinite(size[0]) && size[0] > 0 ? size[0] : 1;
  const safeH = Number.isFinite(size[1]) && size[1] > 0 ? size[1] : 1;

  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  // const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);

  // Only show shimmer for temperatures above 45°C
  const intensity = Math.max(0, (temperature - 45) / 30); // 0-1 based on temp 45-75°C
  // const shimmerThrottle = useMemo(() => getThrottleLevel(graphicsQuality), [graphicsQuality]);

  // Create material ONCE
  useEffect(() => {
    const shaderMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        intensity: { value: intensity }, // Initial value
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform float intensity;
        varying vec2 vUv;

        void main() {
          float distort = sin(vUv.y * 20.0 + time * 3.0) * 0.02 * intensity;
          float alpha = (1.0 - vUv.y) * 0.08 * intensity;
          alpha *= sin(vUv.x * 3.14159);
          gl_FragColor = vec4(1.0, 0.95, 0.9, alpha);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    materialRef.current = shaderMaterial;

    // Register shader for updates immediately
    const id = `shimmer-${Math.random()}`;
    registerShader(id, { uniforms: shaderMaterial.uniforms });

    return () => {
      unregisterShader(id);
      shaderMaterial.dispose();
      materialRef.current = null;
    };
  }, []); // Run ONCE on mount

  // Update intensity uniform when it changes, WITHOUT recreating material
  useEffect(() => {
    if (materialRef.current) {
      materialRef.current.uniforms.intensity.value = intensity;
    }
  }, [intensity]);

  // Removed per-instance useFrame
  /*
  useFrame((state) => {
    if (!isTabVisible || isLowQuality) return;
    if (!shouldRunThisFrame(shimmerThrottle)) return;
    if (materialRef.current) {
      materialRef.current.uniforms.time.value = state.clock.elapsedTime;
    }
  });
  */

  if (intensity <= 0 || !materialRef.current || isLowQuality) return null;

  return (
    <mesh
      ref={meshRef}
      position={[position[0], position[1] + safeH + 1.5, position[2]]}
      material={materialRef.current}
    >
      <planeGeometry args={[safeW * 1.5, 4]} />
    </mesh>
  );
});

// Steam vent effect for hot machinery
const SteamVent: React.FC<{ position: [number, number, number]; intensity: number }> = React.memo(
  ({ position, intensity }) => {
    const graphicsQuality = useGraphicsStore.getState().graphics.quality;
    const isLowQuality = graphicsQuality === 'low';

    const particlesRef = useRef<THREE.Points>(null);
    const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);
    const count = 30;
    const ventThrottle = useMemo(
      () => Math.max(getThrottleLevel(graphicsQuality), 4),
      [graphicsQuality]
    );

    const positions = useMemo(() => {
      const pos = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        pos[i * 3] = (Math.random() - 0.5) * 0.3;
        pos[i * 3 + 1] = Math.random() * 2;
        pos[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
      }
      return pos;
    }, []);

    const velocities = useMemo(() => {
      return Array.from({ length: count }, () => ({
        speed: 0.5 + Math.random() * 1,
        drift: (Math.random() - 0.5) * 0.02,
      }));
    }, []);

    useFrame((_, delta) => {
      if (!isTabVisible || isLowQuality) return;
      // Throttle steam vent animation - looks fine at 15-20fps
      if (!shouldRunThisFrame(ventThrottle)) return;
      if (!particlesRef.current || intensity <= 0) return;
      const pos = particlesRef.current.geometry.attributes.position.array as Float32Array;

      // Compensate for skipped frames
      const adjustedDelta = delta * 2;
      for (let i = 0; i < count; i++) {
        pos[i * 3 + 1] += velocities[i].speed * adjustedDelta * intensity;
        pos[i * 3] += velocities[i].drift * 2;
        pos[i * 3 + 2] += velocities[i].drift * 2;

        if (pos[i * 3 + 1] > 2.5) {
          pos[i * 3 + 1] = 0;
          pos[i * 3] = (Math.random() - 0.5) * 0.3;
          pos[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
        }
      }
      particlesRef.current.geometry.attributes.position.needsUpdate = true;
    });

    if (intensity <= 0 || isLowQuality) return null;

    return (
      <points ref={particlesRef} position={position}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={count}
            array={positions}
            itemSize={3}
            args={[positions, 3]}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.15}
          color="#e2e8f0"
          transparent
          opacity={0.4 * intensity}
          sizeAttenuation
        />
      </points>
    );
  }
);

// Blinking control panel with LED indicators
const ControlPanel: React.FC<{
  position: [number, number, number];
  rotation?: THREE.Euler | [number, number, number];
  status: 'running' | 'idle' | 'warning' | 'critical';
  enabled: boolean;
}> = React.memo(({ position, rotation = [0, 0, 0], status, enabled }) => {
  // const blinkStateRef = useRef(0);
  // const [, forceUpdate] = useState(0);
  // const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);

  // Shared geometries - created once and reused
  const ledGeometry = useMemo(() => new THREE.CircleGeometry(0.02, 8), []);
  const buttonGeometry = useMemo(() => new THREE.CylinderGeometry(0.015, 0.015, 0.02, 8), []);

  // Removed per-instance useFrame and state-based blinking
  /*
  useFrame((state) => {
    ...
  });
  */

  const ledMaterials = useRef<THREE.MeshStandardMaterial[]>([]);
  const screenMaterial = useRef<THREE.MeshStandardMaterial>(null);

  // Initialize material refs array
  if (ledMaterials.current.length === 0) {
    ledMaterials.current = Array(4)
      .fill(null)
      .map(
        () =>
          new THREE.MeshStandardMaterial({
            color: '#1e293b',
            emissive: '#1e293b',
            emissiveIntensity: 0,
            toneMapped: false,
          })
      ); // Create unique materials for this panel instance
  }

  // Register with manager
  useEffect(() => {
    if (!enabled) return;
    const id = `panel-${Math.random()}`;

    // Ensure screen material is ready
    if (screenMaterial.current) {
      registerPanel(id, {
        status,
        ledMaterials: ledMaterials.current,
        screenMaterial: screenMaterial.current,
      });
    }

    return () => unregisterPanel(id);
  }, [enabled, status]); // Re-register when status changes to update manager's known status

  if (!enabled) return null;

  // const blinkState = blinkStateRef.current;

  if (!enabled) return null;

  // Pre-calculated static colors for screen (LEDs handled by manager)
  // const ledColors... removed
  // const colors... removed

  return (
    <group
      position={position}
      rotation={Array.isArray(rotation) ? (rotation as [number, number, number]) : rotation}
    >
      {/* Panel backing - using shared materials */}
      <mesh>
        <boxGeometry args={[0.4, 0.3, 0.05]} />
        <primitive object={MACHINE_MATERIALS.panelBody} attach="material" />
      </mesh>

      {/* Screen/display area */}
      <mesh position={[0, 0.02, 0.026]}>
        <planeGeometry args={[0.25, 0.12]} />
        <meshStandardMaterial
          ref={screenMaterial}
          color={status === 'critical' ? '#450a0a' : status === 'warning' ? '#451a03' : '#0f172a'}
          emissive={
            status === 'critical' ? '#ef4444' : status === 'warning' ? '#f59e0b' : '#3b82f6'
          }
          emissiveIntensity={0.3}
        />
      </mesh>

      {/* LED indicators */}
      {/* LED indicators - using unique materials controlled by manager */}
      {[
        [-0.12, -0.08],
        [-0.04, -0.08],
        [0.04, -0.08],
        [0.12, -0.08],
      ].map(([x, y], i) => (
        <mesh
          key={i}
          position={[x, y, 0.026]}
          geometry={ledGeometry}
          material={ledMaterials.current[i]}
        />
      ))}

      {/* Buttons */}
      {[
        [0.15, 0.08],
        [0.15, 0.0],
      ].map(([x, y], i) => (
        <mesh key={i} position={[x, y, 0.03]} geometry={buttonGeometry}>
          <meshStandardMaterial color={i === 0 ? '#22c55e' : '#ef4444'} roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
});

// Anisotropic metal surface (brushed metal effect for rollers)
const AnisotropicRoller: React.FC<{
  position: [number, number, number];
  radius: number;
  length: number;
  rotation?: [number, number, number];
  enabled: boolean;
  rpm?: number;
}> = ({ position, radius, length, rotation = [0, 0, Math.PI / 2], enabled, rpm = 0 }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  // const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);

  // Create anisotropic normal map
  const normalMap = useMemo(() => {
    if (!enabled) return null;

    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Base neutral normal
    ctx.fillStyle = 'rgb(128, 128, 255)';
    ctx.fillRect(0, 0, size, size);

    // Horizontal brushed lines (anisotropic direction)
    for (let y = 0; y < size; y += 2) {
      const intensity = 20 + Math.random() * 20;
      ctx.strokeStyle = `rgb(128, ${128 + intensity}, 255)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y + (Math.random() - 0.5) * 2);
      ctx.stroke();
    }

    // Add some scratches perpendicular to brush direction
    ctx.strokeStyle = 'rgb(150, 128, 240)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 10; i++) {
      ctx.beginPath();
      const x = Math.random() * size;
      ctx.moveTo(x, 0);
      ctx.lineTo(x + (Math.random() - 0.5) * 20, size);
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 1);
    return texture;
  }, [enabled]);

  // Animate rotation based on RPM
  // Register for centralized rotation update
  useEffect(() => {
    if (!meshRef.current || rpm <= 0) return;
    const id = `roller-${Math.random()}`;
    registerRoller(id, { mesh: meshRef.current, rpm });
    return () => unregisterRoller(id);
  }, [rpm]);

  /* Removed per-instance useFrame
  useFrame((_, delta) => {
    if (!isTabVisible) return;
    if (meshRef.current && rpm > 0) {
      meshRef.current.rotation.x += (rpm / 60) * Math.PI * 2 * delta;
    }
  });
  */

  return (
    <mesh ref={meshRef} position={position} rotation={rotation}>
      <cylinderGeometry args={[radius, radius, length, 32]} />
      <meshStandardMaterial
        color="#94a3b8"
        metalness={0.95}
        roughness={enabled ? 0.15 : 0.3}
        normalMap={normalMap}
        normalScale={enabled ? new THREE.Vector2(0.5, 0.1) : undefined}
      />
    </mesh>
  );
};

// Sparks effect for grinding/milling machinery
const Sparks: React.FC<{ position: [number, number, number]; active: boolean }> = React.memo(
  ({ position, active }) => {
    const graphicsQuality = useGraphicsStore.getState().graphics.quality;
    const isLowQuality = graphicsQuality === 'low';

    const particlesRef = useRef<THREE.Points>(null);
    const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);
    const count = 20;
    const nextSparkRef = useRef(0);
    const sparkThrottle = useMemo(
      () => Math.max(getThrottleLevel(graphicsQuality), 3),
      [graphicsQuality]
    );

    const positions = useMemo(() => new Float32Array(count * 3), []);
    const velocities = useMemo(
      () => Array.from({ length: count }, () => ({ x: 0, y: 0, z: 0, life: 0 })),
      []
    );

    useFrame((_state, delta) => {
      if (!isTabVisible || isLowQuality) return;
      // Throttle sparks animation - 20fps+ is sufficient
      if (!shouldRunThisFrame(sparkThrottle)) return;
      if (!particlesRef.current || !active) return;
      const pos = particlesRef.current.geometry.attributes.position.array as Float32Array;

      // Compensate for skipped frames
      const adjustedDelta = delta * 2;

      // Occasionally spawn new sparks
      nextSparkRef.current -= adjustedDelta;
      if (nextSparkRef.current <= 0 && Math.random() > 0.7) {
        const idx = Math.floor(Math.random() * count);
        pos[idx * 3] = 0;
        pos[idx * 3 + 1] = 0;
        pos[idx * 3 + 2] = 0;
        velocities[idx] = {
          x: (Math.random() - 0.5) * 3,
          y: Math.random() * 2 + 1,
          z: (Math.random() - 0.5) * 3,
          life: 1,
        };
        nextSparkRef.current = 0.05 + Math.random() * 0.1;
      }

      // Update spark positions
      for (let i = 0; i < count; i++) {
        if (velocities[i].life > 0) {
          pos[i * 3] += velocities[i].x * adjustedDelta;
          pos[i * 3 + 1] += velocities[i].y * adjustedDelta;
          pos[i * 3 + 2] += velocities[i].z * adjustedDelta;
          velocities[i].y -= 5 * adjustedDelta; // Gravity
          velocities[i].life -= adjustedDelta * 2;
        } else {
          pos[i * 3 + 1] = -100; // Hide dead sparks
        }
      }
      particlesRef.current.geometry.attributes.position.needsUpdate = true;
    });

    if (!active || isLowQuality) return null;

    return (
      <points ref={particlesRef} position={position}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={count}
            array={positions}
            itemSize={3}
            args={[positions, 3]}
          />
        </bufferGeometry>
        <pointsMaterial size={0.08} color="#fcd34d" transparent opacity={0.9} sizeAttenuation />
      </points>
    );
  }
);

// Rotating fan for machine ventilation
const RotatingFan: React.FC<{ position: [number, number, number]; speed: number; size?: number }> =
  React.memo(({ position, speed, size = 0.4 }) => {
    const fanRef = useRef<THREE.Group>(null);
    const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);
    const graphicsQuality = useGraphicsStore.getState().graphics.quality;
    const isLowQuality = graphicsQuality === 'low';
    const fanThrottle = useMemo(
      () => Math.max(getThrottleLevel(graphicsQuality), 3),
      [graphicsQuality]
    );

    // Shared geometry for all fan blades
    const bladeGeometry = useMemo(
      () => new THREE.BoxGeometry(size * 1.8, 0.02, size * 0.3),
      [size]
    );

    useFrame((_, delta) => {
      if (!isTabVisible || isLowQuality) return;
      if (!shouldRunThisFrame(fanThrottle)) return;
      if (fanRef.current && speed > 0) {
        fanRef.current.rotation.z += delta * speed * 0.5;
      }
    });

    return (
      <group position={position}>
        {/* Fan housing - using shared materials */}
        <mesh>
          <cylinderGeometry args={[size + 0.05, size + 0.05, 0.1, 16]} />
          <primitive object={MACHINE_MATERIALS.millBody} attach="material" />
        </mesh>
        {/* Rotating blades - using shared materials */}
        <group ref={fanRef} position={[0, 0.06, 0]}>
          {[0, 1, 2, 3].map((_: unknown, i: number) => (
            <mesh
              key={i}
              rotation={[0, 0, (i * Math.PI) / 2]}
              position={[0, 0, 0]}
              geometry={bladeGeometry}
            >
              <primitive object={MACHINE_MATERIALS.millDrum} attach="material" />
            </mesh>
          ))}
        </group>
      </group>
    );
  });

// Animated gauge with needle
const AnimatedGauge: React.FC<{
  position: [number, number, number];
  value: number;
  maxValue: number;
}> = React.memo(({ position, value, maxValue }) => {
  const needleRef = useRef<THREE.Mesh>(null);
  const targetAngle = useRef(0);
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);
  const graphicsQuality = useGraphicsStore.getState().graphics.quality;
  const isLowQuality = graphicsQuality === 'low';
  const gaugeThrottle = useMemo(
    () => Math.max(getThrottleLevel(graphicsQuality), 3),
    [graphicsQuality]
  );

  useFrame(() => {
    if (!isTabVisible || isLowQuality) return;
    // Throttle gauge animation - 15-20fps is sufficient for smooth needle movement
    if (!shouldRunThisFrame(gaugeThrottle)) return;
    if (!needleRef.current) return;
    // Map value to angle (-135 to +135 degrees)
    const normalizedValue = Math.min(value / maxValue, 1);
    targetAngle.current = (-0.75 + normalizedValue * 1.5) * Math.PI;
    // Increase lerp factor to compensate for lower framerate
    needleRef.current.rotation.z = THREE.MathUtils.lerp(
      needleRef.current.rotation.z,
      targetAngle.current,
      0.12
    );
  });

  return (
    <group position={position}>
      {/* Gauge face */}
      <mesh>
        <circleGeometry args={[0.12, 32]} />
        <meshBasicMaterial color="#1e293b" />
      </mesh>
      {/* Gauge markings */}
      <mesh position={[0, 0, 0.001]}>
        <ringGeometry args={[0.08, 0.1, 32, 1, -2.35, 4.7]} />
        <meshBasicMaterial color="#22c55e" />
      </mesh>
      {/* Warning zone */}
      <mesh position={[0, 0, 0.001]}>
        <ringGeometry args={[0.08, 0.1, 32, 1, 1.57, 0.78]} />
        <meshBasicMaterial color="#ef4444" />
      </mesh>
      {/* Needle */}
      <mesh ref={needleRef} position={[0, 0, 0.002]}>
        <boxGeometry args={[0.015, 0.08, 0.005]} />
        <meshBasicMaterial color="#f59e0b" />
      </mesh>
      {/* Center cap */}
      <mesh position={[0, 0, 0.003]}>
        <circleGeometry args={[0.02, 16]} />
        <meshStandardMaterial color="#374151" metalness={0.9} roughness={0.2} />
      </mesh>
    </group>
  );
});

// Alarm indicator that pulses when there are active alarms
const AlarmIndicator: React.FC<{
  position: [number, number, number];
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | null;
  pulseSpeed: number;
  hasUnacknowledged: boolean;
}> = React.memo(({ position, priority, pulseSpeed, hasUnacknowledged }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const graphics = useGraphicsStore((state) => state.graphics.quality);
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);
  const indicatorThrottle = useMemo(() => Math.max(getThrottleLevel(graphics), 3), [graphics]);

  const colors = {
    CRITICAL: '#ef4444',
    HIGH: '#f97316',
    MEDIUM: '#eab308',
    LOW: '#3b82f6',
  };

  const color = priority ? colors[priority] : '#3b82f6';

  useFrame((state) => {
    if (!isTabVisible) return;
    if (!shouldRunThisFrame(indicatorThrottle)) return;
    // Skip animation when not visible
    if (!meshRef.current || pulseSpeed === 0 || !priority || graphics === 'low') return;

    const t = state.clock.elapsedTime * pulseSpeed;
    const pulse = hasUnacknowledged ? Math.sin(t) * 0.5 + 0.5 : 0.3;

    // Pulse the emissive intensity
    const mat = meshRef.current.material as THREE.MeshStandardMaterial;
    mat.emissiveIntensity = 0.5 + pulse * 2;

    // Scale the glow
    if (glowRef.current) {
      const scale = 1 + pulse * 0.3;
      glowRef.current.scale.setScalar(scale);
    }
  });

  // Skip rendering on low graphics or no alarm
  if (graphics === 'low' || !priority) return null;

  return (
    <group position={position}>
      {/* Outer glow */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[0.35, 16, 16]} />
        <meshBasicMaterial color={color} transparent opacity={0.3} depthWrite={false} />
      </mesh>
      {/* Inner indicator */}
      <mesh ref={meshRef}>
        <octahedronGeometry args={[0.2]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={1}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
});

// SCADA value display overlay
const SCADAValueOverlay: React.FC<{
  position: [number, number, number];
  tagValues: {
    temperature?: number;
    vibration?: number;
    rpm?: number;
    current?: number;
    level?: number;
  };
  temperatureColor: string;
  vibrationColor: string;
}> = React.memo(({ position, tagValues, temperatureColor, vibrationColor }) => {
  const graphics = useGraphicsStore((state) => state.graphics.quality);

  // Skip on low/medium graphics
  if (graphics === 'low' || graphics === 'medium') return null;

  return (
    <Html position={position} center distanceFactor={15}>
      <div className="bg-slate-900/85 backdrop-blur px-2 py-1 rounded border border-slate-700/50 min-w-[80px] pointer-events-none">
        <div className="text-[8px] text-slate-500 uppercase tracking-wider mb-0.5">SCADA Live</div>
        <div className="space-y-0.5">
          {tagValues.temperature !== undefined && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9px] text-slate-400">Temp</span>
              <span className="text-[10px] font-mono font-bold" style={{ color: temperatureColor }}>
                {tagValues.temperature.toFixed(1)}C
              </span>
            </div>
          )}
          {tagValues.vibration !== undefined && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9px] text-slate-400">Vib</span>
              <span className="text-[10px] font-mono font-bold" style={{ color: vibrationColor }}>
                {tagValues.vibration.toFixed(2)} mm/s
              </span>
            </div>
          )}
          {tagValues.rpm !== undefined && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9px] text-slate-400">RPM</span>
              <span className="text-[10px] font-mono font-bold text-cyan-400">
                {Math.round(tagValues.rpm)}
              </span>
            </div>
          )}
          {tagValues.current !== undefined && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9px] text-slate-400">Curr</span>
              <span className="text-[10px] font-mono font-bold text-purple-400">
                {tagValues.current.toFixed(1)}A
              </span>
            </div>
          )}
        </div>
      </div>
    </Html>
  );
});

// === GLTF Machine Model Components ===

// GLTF Silo base model
const GLTFSiloBase: React.FC<{
  size: [number, number, number];
  matProps: { emissive: string; emissiveIntensity: number };
}> = React.memo(({ size, matProps }) => {
  const { scene } = useGLTF(MODEL_PATHS.silo);

  const clonedScene = useMemo(() => {
    const clone = scene.clone();
    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        // Apply emissive properties for hover/status effects
        const mesh = child as THREE.Mesh;
        if (mesh.material && 'emissive' in mesh.material) {
          const mat = mesh.material as THREE.MeshStandardMaterial;
          mat.emissive = new THREE.Color(matProps.emissive);
          mat.emissiveIntensity = matProps.emissiveIntensity;
        }
      }
    });
    return clone;
  }, [scene, matProps.emissive, matProps.emissiveIntensity]);

  // Scale to match the expected size (size[1] is height ~12, GLTF silo is ~9 units tall)
  const scale = size[1] / 9;

  return (
    <group position={[0, size[1] / 2, 0]}>
      <primitive object={clonedScene} scale={scale * 1.2} position={[0, -size[1] / 2, 0]} />
    </group>
  );
});

// Industrial cable with CatmullRomCurve3
const IndustrialCable: React.FC<{
  points: THREE.Vector3[];
  radius?: number;
  color?: string;
}> = React.memo(({ points, radius = 0.03, color = '#1e293b' }) => {
  const path = useMemo(() => new THREE.CatmullRomCurve3(points), [points]);
  const geometry = useMemo(
    () => new THREE.TubeGeometry(path, 20, radius, 8, false),
    [path, radius]
  );

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color={color} roughness={0.7} />
    </mesh>
  );
});

interface MachinesProps {
  machines: MachineData[];
  onSelect: (data: MachineData) => void;
}

// Animation state stored per-machine for centralized useFrame
interface MachineAnimationState {
  groupRef: THREE.Group | null;
  position: [number, number, number];
  rotation: number;
  type: MachineType;
  status: 'running' | 'idle' | 'warning' | 'critical';
  scadaRpmMultiplier: number;
  scadaVibrationIntensity: number;
  scadaFillLevel: number | undefined;
  metricsLoad: number;
  enableVibration: boolean;
}

const MachinesComponent: React.FC<MachinesProps> = ({ machines, onSelect }) => {
  // Filter machines for optimization
  const silos = useMemo(() => machines.filter((m) => m.type === MachineType.SILO), [machines]);
  const rollerMills = useMemo(
    () => machines.filter((m) => m.type === MachineType.ROLLER_MILL),
    [machines]
  );
  const plansifters = useMemo(
    () => machines.filter((m) => m.type === MachineType.PLANSIFTER),
    [machines]
  );
  const packers = useMemo(() => machines.filter((m) => m.type === MachineType.PACKER), [machines]);
  const otherMachines = useMemo(
    () =>
      machines.filter(
        (m) =>
          m.type !== MachineType.SILO &&
          m.type !== MachineType.ROLLER_MILL &&
          m.type !== MachineType.PLANSIFTER &&
          m.type !== MachineType.PACKER
      ),
    [machines]
  );
  // PERFORMANCE: Centralized animation state for all machines
  // This eliminates 17 separate useFrame hooks, reducing per-frame overhead
  const machineStatesRef = useRef<Map<string, MachineAnimationState>>(new Map());
  const frameCountRef = useRef(0);
  const audioRegisteredRef = useRef<Set<string>>(new Set());

  // Get global state for animation control
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);
  const quality = useGraphicsStore((state) => state.graphics.quality);
  const isLowQuality = quality === 'low';

  // Callback for MachineMesh to register its animation state
  const updateMachineState = React.useCallback(
    (id: string, state: MachineAnimationState | null) => {
      if (state === null) {
        machineStatesRef.current.delete(id);
        audioRegisteredRef.current.delete(id);
      } else {
        machineStatesRef.current.set(id, state);
      }
    },
    []
  );

  // CENTRALIZED useFrame - runs once per frame instead of 17 times
  useFrame((state) => {
    if (!isTabVisible) return;

    frameCountRef.current++;

    // On LOW quality, skip all animation - only handle audio registration
    if (isLowQuality) {
      // Only run audio logic every 30 frames (~0.5s at 60fps)
      if (frameCountRef.current % 30 === 0) {
        machineStatesRef.current.forEach((machineState, machineId) => {
          if (machineState.status === 'running') {
            // Register audio position if not already done
            if (!audioRegisteredRef.current.has(machineId)) {
              audioManager.registerSoundPosition(
                machineId,
                machineState.position[0],
                machineState.position[1] + 1, // Approximate center
                machineState.position[2]
              );
              audioRegisteredRef.current.add(machineId);
            }
            audioManager.updateMachineSpatialVolume(machineId);
          }
        });
      }
      // Reset positions once on first frame
      if (frameCountRef.current === 1) {
        machineStatesRef.current.forEach((machineState) => {
          if (machineState.groupRef) {
            machineState.groupRef.position.set(
              machineState.position[0],
              machineState.position[1],
              machineState.position[2]
            );
            machineState.groupRef.rotation.set(0, machineState.rotation, 0);
          }
        });
      }
      return; // Skip all animation on LOW quality
    }

    const time = state.clock.elapsedTime;

    // Iterate through all machines and apply animations
    machineStatesRef.current.forEach((machineState, machineId) => {
      const {
        groupRef,
        position,
        rotation,
        type,
        status,
        scadaRpmMultiplier,
        scadaVibrationIntensity,
        enableVibration,
      } = machineState;

      if (!groupRef) return;

      if (status === 'running' && enableVibration) {
        const rpmFactor = scadaRpmMultiplier;
        const vibIntensity = scadaVibrationIntensity;

        switch (type) {
          case MachineType.PLANSIFTER: {
            // Sifters have strong circular oscillation
            const intensity = (0.04 + rpmFactor * 0.03) * vibIntensity;
            const speed = 12 + rpmFactor * 8;
            groupRef.position.x = position[0] + Math.cos(time * speed) * intensity;
            groupRef.position.z = position[2] + Math.sin(time * speed) * intensity;
            groupRef.rotation.x = Math.sin(time * speed * 0.5) * 0.003 * vibIntensity;
            groupRef.rotation.z = Math.cos(time * speed * 0.5) * 0.003 * vibIntensity;
            break;
          }
          case MachineType.ROLLER_MILL: {
            // Mills have high-frequency vertical vibration
            const intensity = (0.005 + rpmFactor * 0.015) * vibIntensity;
            const speed = 30 + rpmFactor * 30;
            groupRef.position.y = position[1] + Math.sin(time * speed) * intensity;
            groupRef.position.x = position[0] + Math.sin(time * speed * 2.3) * intensity * 0.3;
            break;
          }
          case MachineType.PACKER: {
            // Packers have rhythmic mechanical motion
            const cycleTime = time * 3;
            const cycle = Math.sin(cycleTime) > 0.7 ? 1 : 0;
            groupRef.position.y = position[1] + cycle * 0.02 * vibIntensity;
            groupRef.position.x = position[0] + Math.sin(time * 15) * 0.003 * vibIntensity;
            break;
          }
          // Silo case removed as it's handled in InstancedSilos
        }
      } else if (!enableVibration) {
        // Reset position when vibration is disabled
        groupRef.position.set(position[0], position[1], position[2]);
        groupRef.rotation.set(0, rotation, 0);
      }

      // Register machine position for spatial audio (throttled)
      if (status === 'running' && frameCountRef.current % 10 === 0) {
        audioManager.registerSoundPosition(machineId, position[0], position[1] + 1, position[2]);
        audioManager.updateMachineSpatialVolume(machineId);
      }
    });
  });

  // Get active breakdowns for rendering effects
  const activeBreakdowns = useBreakdownStore((state) => state.activeBreakdowns);

  // Create a map of machine id to position for breakdown effects
  const machinePositionMap = useMemo(() => {
    const map = new Map<string, [number, number, number]>();
    machines.forEach((m) => {
      map.set(m.id, m.position);
    });
    return map;
  }, [machines]);

  return (
    <group>
      <MachineAnimationManager />

      <InstancedSilos machines={silos} onSelect={onSelect} />
      <InstancedRollerMills machines={rollerMills} onSelect={onSelect} />
      <InstancedPlansifters machines={plansifters} onSelect={onSelect} />
      <InstancedPackers machines={packers} onSelect={onSelect} />

      {otherMachines.map((m: MachineData) => (
        <MachineMesh key={m.id} data={m} onSelect={onSelect} onStateUpdate={updateMachineState} />
      ))}

      {/* Breakdown Effects - sparks, smoke, warning beacons for broken machines */}
      {activeBreakdowns.map((breakdown) => {
        const position = machinePositionMap.get(breakdown.machineId);
        if (!position) return null;
        return (
          <BreakdownEffects
            key={breakdown.id}
            machineId={breakdown.machineId}
            position={position}
          />
        );
      })}
    </group>
  );
};

interface MachineMeshProps {
  data: MachineData;
  onSelect: (data: MachineData) => void;
  onStateUpdate: (id: string, state: MachineAnimationState | null) => void;
}

const MachineMesh: React.FC<MachineMeshProps> = React.memo(({ data, onSelect, onStateUpdate }) => {
  const { type, position, rotation, status } = data;
  // Guard against NaN/invalid dimensions - critical for preventing PlaneGeometry NaN errors
  const size: [number, number, number] = [
    Number.isFinite(data.size[0]) && data.size[0] > 0 ? data.size[0] : 3,
    Number.isFinite(data.size[1]) && data.size[1] > 0 ? data.size[1] : 5,
    Number.isFinite(data.size[2]) && data.size[2] > 0 ? data.size[2] : 3,
  ];
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);

  // PERFORMANCE: Consolidated graphics store subscriptions to prevent unnecessary re-renders
  const {
    enableVibration,
    enableTextures,
    enableWeathering,
    enableControlPanels,
    enableAnisotropicReflections,
    quality,
  } = useGraphicsStore(
    useShallow((state) => ({
      enableVibration: state.graphics.enableMachineVibration,
      enableTextures: state.graphics.enableProceduralTextures,
      enableWeathering: state.graphics.enableWeathering,
      enableControlPanels: state.graphics.enableControlPanels,
      enableAnisotropicReflections: state.graphics.enableAnisotropicReflections,
      quality: state.graphics.quality,
    }))
  );
  // PERFORMANCE: Skip animated sub-components on LOW quality
  const isLowQuality = quality === 'low';

  // Check GLTF model availability
  const siloModelAvailable = useModelAvailable('silo');
  // Use GLTF models on medium+ graphics when available
  const useGLTFModels = quality !== 'low';

  // SCADA visual properties
  const scadaVisuals = useSCADAMachineVisuals(data.id, status);
  const scadaAlarms = useSCADAAlarmVisuals(data.id);

  // Use SCADA-derived status color, falling back to standard status color
  const statusColor = scadaVisuals.hasActiveAlarm
    ? scadaVisuals.statusColor
    : getStatusColor(status);

  // Generate unique seed for this machine's textures
  const textureSeed = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < data.id.length; i++) {
      hash = (hash << 5) - hash + data.id.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }, [data.id]);

  const { roughnessMap, normalMap } = useProceduralMetalTexture(enableTextures, textureSeed);

  // Shared geometries for repeated elements - created once and reused across maps
  const motorFinGeometry = useMemo(() => new THREE.CylinderGeometry(0.52, 0.52, 0.02, 16), []);
  const conveyorRollerGeometry = useMemo(
    () => new THREE.CylinderGeometry(0.04, 0.04, size[0] * 0.12, 12),
    [size]
  );
  const legCylinderGeometry = useMemo(() => new THREE.CylinderGeometry(0.15, 0.2, 4), []);

  // Machine-specific sounds based on type and status
  // Machine-specific sounds - Optimized to avoid thrashing
  const soundRef = useRef<string | null>(null);

  // Update sound parameters without stopping/starting
  useEffect(() => {
    if (status !== 'running') {
      if (soundRef.current) {
        audioManager.stopMachineSound(data.id);
        soundRef.current = null;
      }
      return;
    }

    // Start sound if not playing
    if (!soundRef.current) {
      soundRef.current = data.id;
      switch (type) {
        case MachineType.ROLLER_MILL:
          audioManager.playMillSound(data.id, data.metrics.rpm);
          break;
        case MachineType.PLANSIFTER:
          audioManager.playSifterSound(data.id, data.metrics.rpm);
          break;
        case MachineType.PACKER:
          audioManager.playPackerSound(data.id);
          break;
      }
    } else {
      // Just update parameters if already playing
      if (type === MachineType.ROLLER_MILL || type === MachineType.PLANSIFTER) {
        // Assuming audioManager handles parameter updates efficiently or ignores if no change
        // Ideally we'd have precise update methods, but re-calling play with same ID
        // usually acts as update or ignore in well-designed managers.
        // If not, we might need a specific update method.
        // For now, let's assume we shouldn't spam play.
        // Actually, let's rely on the manager's idempotency or add an update method if possible.
        // Checking audioManager.ts would be ideal, but for now preventing mount/unmount is key.
        // Better approach: Do nothing here if just RPM changes, rely on a separate effect/ref?
        // No, invalidating this effect on RPM change is what causes the stop/start loop.
        // We need to NOT depend on RPM in the start/stop effect.
      }
    }

    return () => {
      if (soundRef.current) {
        audioManager.stopMachineSound(data.id);
        soundRef.current = null;
      }
    };
  }, [data.id, type, status]); // REMOVED data.metrics.rpm dependency

  // Separate effect for RPM updates to avoid restarting sound
  useEffect(() => {
    if (
      status === 'running' &&
      (type === MachineType.ROLLER_MILL || type === MachineType.PLANSIFTER)
    ) {
      // Update pitch/rhythm based on RPM without restarting the sound
      const rpm = data.metrics.rpm ?? (type === MachineType.ROLLER_MILL ? 1400 : 200);
      audioManager.updateMachinePitch(data.id, rpm);
    }
  }, [data.id, status, type, data.metrics.rpm]);

  // PERFORMANCE: Register animation state with parent for centralized useFrame
  // This eliminates per-machine useFrame overhead - parent iterates once per frame
  useEffect(() => {
    // Register state with parent on mount and when relevant values change
    onStateUpdate(data.id, {
      groupRef: groupRef.current,
      position,
      rotation,
      type,
      status,
      scadaRpmMultiplier: scadaVisuals.rpmMultiplier,
      scadaVibrationIntensity: scadaVisuals.vibrationIntensity,
      scadaFillLevel: scadaVisuals.fillLevel ?? undefined,
      metricsLoad: data.metrics.load,
      enableVibration,
    });

    // Cleanup: unregister from parent on unmount
    return () => {
      onStateUpdate(data.id, null);
    };
  }, [
    data.id,
    position,
    rotation,
    type,
    status,
    scadaVisuals.rpmMultiplier,
    scadaVisuals.vibrationIntensity,
    scadaVisuals.fillLevel,
    data.metrics.load,
    enableVibration,
    onStateUpdate,
  ]);

  // matProps now incorporates SCADA temperature glow when hot
  const matProps = {
    emissive: hovered
      ? '#3b82f6'
      : scadaVisuals.temperatureGlow > 0
        ? scadaVisuals.temperatureColor
        : '#000000',
    emissiveIntensity: hovered ? 0.3 : scadaVisuals.temperatureGlow,
  };

  const renderGeometry = () => {
    switch (type) {
      case MachineType.SILO: {
        // Use SCADA fill level if available, otherwise fall back to data or generate
        const fillLevel =
          scadaVisuals.fillLevel ?? data.fillLevel ?? 50 + Math.sin(textureSeed) * 30;
        const grainQuality =
          data.grainQuality ??
          (['premium', 'standard', 'economy', 'mixed'] as const)[textureSeed % 4];
        const grainType = data.grainType ?? GRAIN_TYPES[textureSeed % GRAIN_TYPES.length];
        const maintenanceHours = data.maintenanceCountdown ?? 48 + (textureSeed % 200);
        const useSiloGLTF = useGLTFModels && siloModelAvailable === true;

        return (
          <group position={[0, size[1] / 2, 0]}>
            {/* Main silo body - GLTF or procedural */}
            {useSiloGLTF ? (
              <Suspense
                fallback={
                  <mesh castShadow receiveShadow>
                    <cylinderGeometry args={[size[0] / 2, size[0] / 2, size[1], 32]} />
                    <meshStandardMaterial
                      color="#cbd5e1"
                      metalness={0.7}
                      roughness={0.2}
                      {...matProps}
                    />
                  </mesh>
                }
              >
                <GLTFSiloBase size={size as [number, number, number]} matProps={matProps} />
              </Suspense>
            ) : (
              <mesh receiveShadow>
                <cylinderGeometry args={[size[0] / 2, size[0] / 2, size[1], 32]} />
                <meshStandardMaterial
                  color="#cbd5e1"
                  metalness={0.7}
                  roughness={0.2}
                  roughnessMap={roughnessMap}
                  normalMap={normalMap}
                  normalScale={normalMap ? new THREE.Vector2(0.3, 0.3) : undefined}
                  {...matProps}
                />
              </mesh>
            )}

            {/* Fill level visualization */}
            <SiloFillIndicator
              fillLevel={fillLevel}
              quality={grainQuality}
              grainType={grainType}
              radius={size[0] / 2}
              height={size[1]}
            />

            {/* Weld seams */}
            <WeldSeams radius={size[0] / 2} height={size[1]} enabled={enableTextures} />
            {/* Top cone */}
            <mesh position={[0, size[1] / 2 + 1, 0]}>
              <coneGeometry args={[size[0] / 2, 2, 32]} />
              <meshStandardMaterial color="#94a3b8" metalness={0.7} roughness={0.2} {...matProps} />
            </mesh>
            {/* Dust on top of cone */}
            {enableWeathering && (
              <mesh position={[0, size[1] / 2 + 2.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <circleGeometry args={[(size[0] / 2) * 0.6, 16]} />
                <meshStandardMaterial
                  color="#e8dcc8"
                  transparent
                  opacity={0.25}
                  roughness={1}
                  depthWrite={false}
                />
              </mesh>
            )}
            {/* Bottom cone (hopper) */}
            <mesh position={[0, -size[1] / 2 - 1, 0]}>
              <coneGeometry args={[size[0] / 2, 2, 32]} />
              <meshStandardMaterial color="#94a3b8" metalness={0.7} roughness={0.2} {...matProps} />
            </mesh>
            {/* Legs - using shared materials */}
            {[1, -1].map((x) =>
              [1, -1].map((z) => (
                <mesh
                  key={`${x}-${z}`}
                  position={[(x * size[0]) / 3, -size[1] / 2 - 3, (z * size[0]) / 3]}
                  geometry={legCylinderGeometry}
                >
                  <primitive object={MACHINE_MATERIALS.millBody} attach="material" />
                </mesh>
              ))
            )}
            {/* Access ladder with safety cage */}
            <group position={[size[0] / 2 + 0.2, 0, 0]}>
              {/* Main ladder rails */}
              <mesh position={[0, 0, -0.2]}>
                <boxGeometry args={[0.1, size[1], 0.05]} />
                <primitive object={METAL_MATERIALS.steelDark} attach="material" />
              </mesh>
              <mesh position={[0, 0, 0.2]}>
                <boxGeometry args={[0.1, size[1], 0.05]} />
                <primitive object={METAL_MATERIALS.steelDark} attach="material" />
              </mesh>

              {/* Safety Cage (Hoops and Rails) - starts 2.5m from bottom */}
              <group position={[0.4, 1.25, 0]}>
                {/* Vertical straps */}
                {[0, -0.3, 0.3].map((z, i) => (
                  <mesh key={`strap-${i}`} position={[0.4, size[1] / 2 - 1.25, z]}>
                    <boxGeometry args={[0.03, size[1] - 2.5, 0.03]} />
                    <meshStandardMaterial color="#94a3b8" />
                  </mesh>
                ))}
                {/* Hoops every 1.5 units */}
                {Array.from({ length: Math.floor((size[1] - 2.5) / 1.5) }).map((_, i) => (
                  <mesh
                    key={`hoop-${i}`}
                    position={[0, -size[1] / 2 + 2.5 + i * 1.5, 0]}
                    rotation={[Math.PI / 2, 0, 0]}
                  >
                    <torusGeometry args={[0.4, 0.02, 8, 16, Math.PI * 1.2]} />
                    <meshStandardMaterial color="#94a3b8" side={THREE.DoubleSide} />
                  </mesh>
                ))}
              </group>
            </group>

            {/* Maintenance countdown - skip on low graphics */}
            {quality !== 'low' && (
              <MaintenanceCountdown
                hoursRemaining={maintenanceHours}
                position={[-(size[0] / 2 + 1), size[1] / 2 - 1, 0]}
              />
            )}
          </group>
        );
      }

      case MachineType.ROLLER_MILL: {
        // Detailed industrial roller mill - Bühler-style grain processing machine
        // Guard against NaN/invalid dimensions
        const w = Number.isFinite(size[0]) && size[0] > 0 ? size[0] : 3.5;
        const h = Number.isFinite(size[1]) && size[1] > 0 ? size[1] : 5;
        const d = Number.isFinite(size[2]) && size[2] > 0 ? size[2] : 3.5;

        // Cable path for motor power
        const motorCablePoints = useMemo(
          () => [
            new THREE.Vector3(-w * 0.5 - 0.4, -h * 0.1, 0), // Motor
            new THREE.Vector3(-w * 0.5 - 0.4, -h * 0.4, 0), // Down
            new THREE.Vector3(-w * 0.3, -h * 0.45, 0), // In
            new THREE.Vector3(0, -h * 0.45, 0), // Center
          ],
          [w, h]
        );

        return (
          <group position={[0, size[1] / 2, 0]}>
            {/* === MAIN HOUSING === */}
            {/* Lower grinding chamber - heavy steel */}
            <mesh castShadow receiveShadow position={[0, -h * 0.15, 0]}>
              <boxGeometry args={[w, h * 0.7, d]} />
              <meshPhysicalMaterial
                color="#2563eb"
                metalness={0.6}
                roughness={0.2}
                roughnessMap={roughnessMap}
                clearcoat={1.0}
                clearcoatRoughness={0.1}
                {...matProps}
              />
            </mesh>

            {/* Machine Label */}
            <group position={[0, h * 0.25, d * 0.51]}>
              <mesh>
                <planeGeometry args={[w * 0.4, 0.15]} />
                <meshStandardMaterial color="#0f172a" />
              </mesh>
              <Text
                position={[0, 0, 0.01]}
                fontSize={0.08}
                color="#ffffff"
                anchorX="center"
                anchorY="middle"
              >
                {data.name.toUpperCase()}
              </Text>
            </group>

            {/* Power Cables */}
            <IndustrialCable points={motorCablePoints} radius={0.04} color="#1e293b" />

            {/* Upper feed section - lighter color */}
            <mesh receiveShadow position={[0, h * 0.35, 0]}>
              <boxGeometry args={[w * 0.9, h * 0.3, d * 0.85]} />
              <meshStandardMaterial color="#60a5fa" metalness={0.5} roughness={0.3} {...matProps} />
            </mesh>

            {/* === FEED HOPPER === */}
            <group position={[0, h * 0.55, 0]}>
              {/* Hopper walls - trapezoidal */}
              <mesh>
                <boxGeometry args={[w * 0.7, 0.08, d * 0.6]} />
                <meshStandardMaterial color="#94a3b8" metalness={0.7} roughness={0.2} />
              </mesh>
              {/* Hopper sides */}
              {[
                [-1, 0],
                [1, 0],
                [0, -1],
                [0, 1],
              ].map(([x, z], i) => (
                <mesh
                  key={i}
                  castShadow
                  position={[x * w * 0.35, 0.3, z * d * 0.3]}
                  rotation={[z ? (z > 0 ? -0.4 : 0.4) : 0, 0, x ? (x > 0 ? 0.4 : -0.4) : 0]}
                >
                  <boxGeometry args={[x ? 0.05 : w * 0.7, 0.6, z ? 0.05 : d * 0.6]} />
                  <meshStandardMaterial color="#cbd5e1" metalness={0.6} roughness={0.25} />
                </mesh>
              ))}
              {/* Feed gate adjustment wheel */}
              <mesh position={[w * 0.4, 0.2, 0]} rotation={[0, 0, Math.PI / 2]}>
                <torusGeometry args={[0.12, 0.02, 8, 16]} />
                <meshStandardMaterial color="#ef4444" metalness={0.6} roughness={0.4} />
              </mesh>
            </group>

            {/* === ROLLER COMPARTMENTS (3 pairs visible through windows) === */}
            {[-0.25, 0, 0.25].map((yOffset, pairIdx) => (
              <group key={pairIdx} position={[0, -h * 0.1 + yOffset * h, 0]}>
                {/* Roller pair housing */}
                <mesh position={[0, 0, d * 0.52]}>
                  <boxGeometry args={[w * 0.85, h * 0.22, 0.08]} />
                  <meshStandardMaterial color="#1e3a5f" metalness={0.5} roughness={0.4} />
                </mesh>
                {/* Viewing window frame */}
                <mesh position={[0, 0, d * 0.54]}>
                  <boxGeometry args={[w * 0.5, h * 0.15, 0.02]} />
                  <meshStandardMaterial color="#0f172a" metalness={0.7} roughness={0.2} />
                </mesh>
                {/* Glass window */}
                <mesh position={[0, 0, d * 0.55]}>
                  <planeGeometry args={[w * 0.45, h * 0.12]} />
                  <meshPhysicalMaterial
                    color="#1e40af"
                    metalness={0.1}
                    roughness={0.1}
                    transmission={0.6}
                    transparent
                    opacity={0.4}
                  />
                </mesh>
                {/* Actual rollers visible through window - PERFORMANCE: Skip on LOW quality */}
                {!isLowQuality && (
                  <>
                    <AnisotropicRoller
                      position={[0, 0.08, d * 0.35]}
                      radius={0.18}
                      length={w * 0.75}
                      enabled={enableAnisotropicReflections}
                      rpm={status === 'running' ? data.metrics.rpm * (0.6 + pairIdx * 0.15) : 0}
                    />
                    <AnisotropicRoller
                      position={[0, -0.08, d * 0.35]}
                      radius={0.16}
                      length={w * 0.75}
                      enabled={enableAnisotropicReflections}
                      rpm={status === 'running' ? -data.metrics.rpm * (0.6 + pairIdx * 0.15) : 0}
                    />
                  </>
                )}
              </group>
            ))}

            {/* === MOTOR HOUSING (side mount) === */}
            <group position={[-w * 0.5 - 0.4, -h * 0.1, 0]}>
              {/* Motor body - using shared materials */}
              <mesh rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.5, 0.5, 0.7, 16]} />
                <primitive object={MACHINE_MATERIALS.millBody} attach="material" />
              </mesh>
              {/* Motor fins (cooling) - using shared materials */}
              {Array.from({ length: 8 }).map((_, i) => (
                <mesh
                  key={i}
                  position={[-0.35 + i * 0.1, 0, 0]}
                  rotation={[0, 0, Math.PI / 2]}
                  geometry={motorFinGeometry}
                >
                  <primitive object={METAL_MATERIALS.paintedDarkGray} attach="material" />
                </mesh>
              ))}
              {/* Motor shaft - using shared materials */}
              <mesh position={[0.4, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.08, 0.08, 0.15, 12]} />
                <primitive object={MACHINE_MATERIALS.shaft} attach="material" />
              </mesh>
              {/* Belt guard cover */}
              <mesh position={[0.55, 0, 0]}>
                <boxGeometry args={[0.25, 0.8, 0.6]} />
                <meshStandardMaterial color="#fbbf24" metalness={0.3} roughness={0.5} />
              </mesh>
              {/* Warning stripes on belt guard */}
              {[-0.25, 0, 0.25].map((y, i) => (
                <mesh key={i} position={[0.68, y, 0]}>
                  <planeGeometry args={[0.01, 0.08]} />
                  <meshBasicMaterial color="#1f2937" />
                </mesh>
              ))}
              {/* Ventilation fan - PERFORMANCE: Skip on LOW/MEDIUM quality */}
              {(quality === 'high' || quality === 'ultra') && (
                <RotatingFan
                  position={[-0.4, 0, 0]}
                  speed={status === 'running' ? data.metrics.rpm / 80 : 0}
                  size={0.4}
                />
              )}
            </group>

            {/* === CONTROL PANEL === */}
            <group position={[w * 0.5 + 0.15, 0.2, 0]}>
              {/* Panel housing - using shared materials */}
              <mesh>
                <boxGeometry args={[0.2, 1.4, d * 0.7]} />
                <primitive object={MACHINE_MATERIALS.panelBody} attach="material" />
              </mesh>
              {/* Control panel face */}
              <ControlPanel
                position={[0.11, 0.3, 0]}
                rotation={[0, -Math.PI / 2, 0]}
                status={status}
                enabled={enableControlPanels}
              />
              {/* Gauges - PERFORMANCE: Skip on LOW quality */}
              {!isLowQuality && (
                <>
                  <AnimatedGauge
                    position={[0.11, 0.55, d * 0.2]}
                    value={scadaVisuals.tagValues.rpm ?? data.metrics.rpm}
                    maxValue={1600}
                  />
                  <AnimatedGauge
                    position={[0.11, 0.55, -d * 0.2]}
                    value={scadaVisuals.tagValues.temperature ?? data.metrics.temperature}
                    maxValue={80}
                  />
                </>
              )}
              {/* Roll gap adjustment handwheels */}
              {[-0.3, 0, 0.3].map((z, i) => (
                <group key={i} position={[0.12, -0.3, z]}>
                  <mesh rotation={[0, 0, Math.PI / 2]}>
                    <torusGeometry args={[0.08, 0.015, 8, 16]} />
                    <meshStandardMaterial color="#dc2626" metalness={0.5} roughness={0.4} />
                  </mesh>
                  <mesh rotation={[0, 0, Math.PI / 2]}>
                    <cylinderGeometry args={[0.02, 0.02, 0.04, 8]} />
                    <meshStandardMaterial color="#7f1d1d" metalness={0.6} roughness={0.3} />
                  </mesh>
                </group>
              ))}
            </group>

            {/* === DISCHARGE CHUTE === */}
            <group position={[0, -h * 0.55, d * 0.3]}>
              <mesh rotation={[0.25, 0, 0]}>
                <boxGeometry args={[w * 0.6, 0.08, 0.8]} />
                <meshStandardMaterial color="#94a3b8" metalness={0.7} roughness={0.2} />
              </mesh>
              {/* Chute sides */}
              {[-1, 1].map((x) => (
                <mesh key={x} position={[x * w * 0.3, 0, 0]} rotation={[0.25, 0, 0]}>
                  <boxGeometry args={[0.04, 0.15, 0.8]} />
                  <meshStandardMaterial color="#64748b" metalness={0.6} roughness={0.3} />
                </mesh>
              ))}
            </group>

            {/* === ASPIRATION/DUST PORTS === */}
            {[-1, 1].map((z) => (
              <group key={z} position={[0, h * 0.2, z * d * 0.52]}>
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.15, 0.12, 0.2, 12]} />
                  <meshStandardMaterial color="#6b7280" metalness={0.7} roughness={0.25} />
                </mesh>
                {/* Flange */}
                <mesh position={[0, 0, z * 0.1]} rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.18, 0.18, 0.03, 12]} />
                  <meshStandardMaterial color="#4b5563" metalness={0.8} roughness={0.2} />
                </mesh>
              </group>
            ))}

            {/* === SUPPORT FRAME === */}
            {[
              [-1, -1],
              [-1, 1],
              [1, -1],
              [1, 1],
            ].map(([x, z], i) => (
              <group key={i}>
                {/* Vertical legs */}
                <mesh position={[x * (w * 0.45), -h * 0.75, z * (d * 0.4)]}>
                  <boxGeometry args={[0.12, h * 0.5, 0.12]} />
                  <meshStandardMaterial color="#1e3a5f" metalness={0.6} roughness={0.35} />
                </mesh>
                {/* Foot pads */}
                <mesh position={[x * (w * 0.45), -h, z * (d * 0.4)]}>
                  <boxGeometry args={[0.2, 0.05, 0.2]} />
                  <meshStandardMaterial color="#374151" metalness={0.7} roughness={0.3} />
                </mesh>
              </group>
            ))}
            {/* Cross bracing */}
            <mesh position={[0, -h * 0.65, -d * 0.4]}>
              <boxGeometry args={[w * 0.9, 0.08, 0.06]} />
              <meshStandardMaterial color="#1e3a5f" metalness={0.6} roughness={0.35} />
            </mesh>
            <mesh position={[0, -h * 0.65, d * 0.4]}>
              <boxGeometry args={[w * 0.9, 0.08, 0.06]} />
              <meshStandardMaterial color="#1e3a5f" metalness={0.6} roughness={0.35} />
            </mesh>

            {/* === ACCESS DOORS === */}
            {[-1, 1].map((z) => (
              <group key={z} position={[0, -h * 0.15, z * d * 0.51]}>
                {/* Door panel */}
                <mesh>
                  <boxGeometry args={[w * 0.4, h * 0.35, 0.03]} />
                  <meshStandardMaterial color="#3b82f6" metalness={0.45} roughness={0.35} />
                </mesh>
                {/* Door handle */}
                <mesh position={[w * 0.15, 0, z * 0.03]}>
                  <boxGeometry args={[0.08, 0.15, 0.04]} />
                  <meshStandardMaterial color="#1f2937" metalness={0.8} roughness={0.2} />
                </mesh>
                {/* Hinges */}
                {[-0.12, 0.12].map((y, hi) => (
                  <mesh key={hi} position={[-w * 0.18, y, z * 0.02]}>
                    <cylinderGeometry args={[0.02, 0.02, 0.06, 8]} />
                    <meshStandardMaterial color="#374151" metalness={0.9} roughness={0.1} />
                  </mesh>
                ))}
              </group>
            ))}

            {/* Weathering layer */}
            <WeatheringLayer size={size as [number, number, number]} enabled={enableWeathering} />

            {/* Steam vents when hot */}
            {quality !== 'low' && status === 'running' && data.metrics.temperature > 50 && (
              <SteamVent
                position={[0, h * 0.6, 0]}
                intensity={(data.metrics.temperature - 50) / 25}
              />
            )}

            {/* Sparks from milling process at high RPM */}
            {quality !== 'low' && status === 'running' && data.metrics.rpm > 1400 && (
              <Sparks position={[0, -h * 0.4, d * 0.3]} active />
            )}
          </group>
        );
      }

      case MachineType.PLANSIFTER: {
        // Realistic industrial plansifter - dual-compartment square nest design
        // Based on Bühler MPAG / Imas Multiplexa industrial sifter architecture
        // Guard against NaN/invalid dimensions
        const sw = Number.isFinite(size[0]) && size[0] > 0 ? size[0] : 7;
        const sh = Number.isFinite(size[1]) && size[1] > 0 ? size[1] : 7;
        const sd = Number.isFinite(size[2]) && size[2] > 0 ? size[2] : 7;
        const compartmentWidth = sw * 0.42; // Width of each lateral sifting cabin
        const centralWidth = sw * 0.16; // Central drive chassis width

        return (
          <group position={[0, size[1] / 2, 0]}>
            {/* === CEILING MOUNTING FRAME === */}
            <group position={[0, sh * 0.65, 0]}>
              {/* Primary I-beam structure */}
              <mesh castShadow>
                <boxGeometry args={[sw * 1.4, 0.18, 0.12]} />
                <meshStandardMaterial color="#1f2937" metalness={0.85} roughness={0.2} />
              </mesh>
              {/* I-beam flanges */}
              {[-1, 1].map((y) => (
                <mesh key={y} position={[0, y * 0.08, 0]}>
                  <boxGeometry args={[sw * 1.4, 0.025, 0.2]} />
                  <meshStandardMaterial color="#1f2937" metalness={0.85} roughness={0.2} />
                </mesh>
              ))}
              {/* Cross bracing beams */}
              {[-1, 1].map((x) => (
                <mesh key={x} position={[x * sw * 0.55, 0, 0]}>
                  <boxGeometry args={[0.1, 0.15, sd * 0.9]} />
                  <meshStandardMaterial color="#374151" metalness={0.8} roughness={0.25} />
                </mesh>
              ))}
              {/* Diagonal bracing */}
              {[
                [-1, -1],
                [1, 1],
              ].map(([x, z], i) => (
                <mesh
                  key={i}
                  castShadow
                  position={[x * sw * 0.3, -0.15, z * sd * 0.25]}
                  rotation={[z * 0.4, 0, x * 0.3]}
                >
                  <boxGeometry args={[0.06, 0.35, 0.06]} />
                  <meshStandardMaterial color="#4b5563" metalness={0.7} roughness={0.3} />
                </mesh>
              ))}
            </group>

            {/* === CANE HANGERS (Flexible Suspension Rods) === */}
            {/* 8 hanging rods - 4 per sifting compartment */}
            {[
              [-0.38, -0.38],
              [-0.38, 0.38],
              [-0.18, -0.38],
              [-0.18, 0.38],
              [0.18, -0.38],
              [0.18, 0.38],
              [0.38, -0.38],
              [0.38, 0.38],
            ].map(([xRatio, zRatio], i) => (
              <group key={i} position={[xRatio * sw, sh * 0.35, zRatio * sd]}>
                {/* Upper clevis bracket on ceiling frame */}
                <mesh position={[0, sh * 0.3, 0]}>
                  <boxGeometry args={[0.08, 0.06, 0.08]} />
                  <meshStandardMaterial color="#374151" metalness={0.8} roughness={0.2} />
                </mesh>

                {/* Flexible cane rod (High fidelity cable) */}
                <IndustrialCable
                  points={[
                    new THREE.Vector3(0, sh * 0.3, 0),
                    new THREE.Vector3(0.01 * (i % 2 === 0 ? 1 : -1), 0, 0.01), // Slight imperfection
                    new THREE.Vector3(0, -sh * 0.28, 0),
                  ]}
                  radius={0.015}
                  color="#9ca3af"
                />

                {/* Lower clevis bracket on sifter body */}
                <mesh position={[0, -sh * 0.28, 0]}>
                  <boxGeometry args={[0.1, 0.08, 0.1]} />
                  <meshStandardMaterial color="#6b7280" metalness={0.75} roughness={0.25} />
                </mesh>
                {/* Clevis pin (visible bolt) */}
                <mesh position={[0, -sh * 0.28, 0]} rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.012, 0.012, 0.14, 8]} />
                  <meshStandardMaterial color="#1f2937" metalness={0.9} roughness={0.15} />
                </mesh>
              </group>
            ))}

            {/* === DUAL SIFTING COMPARTMENTS (Left & Right Cabins) === */}
            {[-1, 1].map((side) => (
              <group key={side} position={[side * (compartmentWidth / 2 + centralWidth / 2), 0, 0]}>
                {/* Main compartment body - cream/white painted steel */}
                <mesh castShadow receiveShadow>
                  <boxGeometry args={[compartmentWidth, sh * 0.85, sd * 0.92]} />
                  <meshPhysicalMaterial
                    color="#f5f0e6"
                    metalness={0.12}
                    roughness={0.25}
                    roughnessMap={roughnessMap}
                    clearcoat={0.6}
                    clearcoatRoughness={0.2}
                    {...matProps}
                  />
                </mesh>

                {/* Reinforced corner posts (aluminum extrusion profile) */}
                {[
                  [-1, -1],
                  [-1, 1],
                  [1, -1],
                  [1, 1],
                ].map(([cx, cz], ci) => (
                  <mesh
                    key={ci}
                    castShadow
                    position={[cx * (compartmentWidth / 2 - 0.04), 0, cz * (sd * 0.46 - 0.04)]}
                  >
                    <boxGeometry args={[0.1, sh * 0.86, 0.1]} />
                    <meshStandardMaterial color="#94a3b8" metalness={0.75} roughness={0.2} />
                  </mesh>
                ))}

                {/* === INDUSTRIAL FRONT PANEL WITH ACCESS HATCHES === */}
                {/* Horizontal reinforcement ribs across front face */}
                {[-0.25, 0, 0.25].map((yRatio, ri) => (
                  <mesh key={ri} position={[0, sh * yRatio, sd * 0.465]}>
                    <boxGeometry args={[compartmentWidth * 0.95, 0.04, 0.02]} />
                    <meshStandardMaterial color="#a8a29e" metalness={0.6} roughness={0.3} />
                  </mesh>
                ))}

                {/* Large access hatch - upper section */}
                <group position={[0, sh * 0.15, sd * 0.47]}>
                  {/* Hatch frame */}
                  <mesh>
                    <boxGeometry args={[compartmentWidth * 0.7, sh * 0.35, 0.03]} />
                    <meshStandardMaterial color="#d4d4d8" metalness={0.4} roughness={0.35} />
                  </mesh>
                  {/* Hatch recessed panel */}
                  <mesh position={[0, 0, 0.02]}>
                    <boxGeometry args={[compartmentWidth * 0.6, sh * 0.28, 0.015]} />
                    <meshStandardMaterial color="#e7e5e4" metalness={0.35} roughness={0.4} />
                  </mesh>
                  {/* Heavy-duty swing handle */}
                  <group position={[compartmentWidth * 0.25, 0, 0.04]}>
                    <mesh rotation={[0, 0, Math.PI / 2]}>
                      <cylinderGeometry args={[0.025, 0.025, 0.18, 8]} />
                      <meshStandardMaterial color="#52525b" metalness={0.8} roughness={0.2} />
                    </mesh>
                    {/* Handle mounts */}
                    {[-0.08, 0.08].map((y, hi) => (
                      <mesh key={hi} position={[0, y, -0.02]}>
                        <boxGeometry args={[0.05, 0.04, 0.04]} />
                        <meshStandardMaterial color="#3f3f46" metalness={0.75} roughness={0.25} />
                      </mesh>
                    ))}
                  </group>
                  {/* Gasket seal line */}
                  <mesh position={[0, 0, 0.016]}>
                    <boxGeometry args={[compartmentWidth * 0.65, sh * 0.32, 0.003]} />
                    <meshStandardMaterial color="#1c1917" metalness={0.1} roughness={0.8} />
                  </mesh>
                </group>

                {/* Lower access hatch - smaller */}
                <group position={[0, -sh * 0.22, sd * 0.47]}>
                  <mesh>
                    <boxGeometry args={[compartmentWidth * 0.55, sh * 0.2, 0.025]} />
                    <meshStandardMaterial color="#d4d4d8" metalness={0.4} roughness={0.35} />
                  </mesh>
                  {/* Quick-release latches (2) */}
                  {[-0.15, 0.15].map((xOff, li) => (
                    <group key={li} position={[compartmentWidth * xOff, sh * 0.06, 0.03]}>
                      <mesh>
                        <boxGeometry args={[0.06, 0.04, 0.025]} />
                        <meshStandardMaterial color="#71717a" metalness={0.75} roughness={0.2} />
                      </mesh>
                      <mesh position={[0, -0.025, 0.01]} rotation={[0.4, 0, 0]}>
                        <boxGeometry args={[0.035, 0.04, 0.01]} />
                        <meshStandardMaterial color="#52525b" metalness={0.8} roughness={0.15} />
                      </mesh>
                    </group>
                  ))}
                </group>

                {/* Ventilation grille - bottom */}
                <group position={[0, -sh * 0.38, sd * 0.465]}>
                  <mesh>
                    <boxGeometry args={[compartmentWidth * 0.4, sh * 0.08, 0.015]} />
                    <meshStandardMaterial color="#52525b" metalness={0.6} roughness={0.35} />
                  </mesh>
                  {/* Grille slats */}
                  {Array.from({ length: 5 }).map((_, gi) => (
                    <mesh key={gi} position={[compartmentWidth * (-0.15 + gi * 0.075), 0, 0.01]}>
                      <boxGeometry args={[0.02, sh * 0.06, 0.01]} />
                      <meshStandardMaterial color="#27272a" metalness={0.7} roughness={0.3} />
                    </mesh>
                  ))}
                </group>

                {/* Corner bolt clusters - industrial detail */}
                {[
                  [-1, 1],
                  [1, 1],
                  [-1, -1],
                  [1, -1],
                ].map(([cx, cy], bi) => (
                  <group
                    key={bi}
                    position={[cx * compartmentWidth * 0.4, cy * sh * 0.35, sd * 0.47]}
                  >
                    {[
                      [0.03, 0.03],
                      [-0.03, 0.03],
                      [0.03, -0.03],
                      [-0.03, -0.03],
                    ].map(([bx, by], si) => (
                      <mesh key={si} position={[bx, by, 0]}>
                        <cylinderGeometry args={[0.012, 0.012, 0.02, 6]} />
                        <meshStandardMaterial color="#3f3f46" metalness={0.85} roughness={0.15} />
                      </mesh>
                    ))}
                  </group>
                ))}

                {/* === SIDE ACCESS PANEL (hinged door with cam latches) === */}
                <group position={[side * (compartmentWidth / 2 + 0.02), -sh * 0.05, 0]}>
                  {/* Panel door */}
                  <mesh rotation={[0, side * 0.02, 0]}>
                    <boxGeometry args={[0.035, sh * 0.65, sd * 0.7]} />
                    <meshStandardMaterial color="#e7e5e4" metalness={0.2} roughness={0.3} />
                  </mesh>
                  {/* Panel frame trim */}
                  <mesh position={[side * 0.02, 0, 0]}>
                    <boxGeometry args={[0.02, sh * 0.68, sd * 0.73]} />
                    <meshStandardMaterial color="#a8a29e" metalness={0.5} roughness={0.35} />
                  </mesh>
                  {/* Cam latches (3 per door) */}
                  {[-0.2, 0, 0.2].map((yOff, li) => (
                    <group key={li} position={[side * 0.04, sh * yOff, sd * 0.32]}>
                      {/* Latch body */}
                      <mesh>
                        <boxGeometry args={[0.025, 0.08, 0.04]} />
                        <meshStandardMaterial color="#52525b" metalness={0.85} roughness={0.15} />
                      </mesh>
                      {/* Latch lever */}
                      <mesh position={[side * 0.02, 0.03, 0]} rotation={[0, 0, side * 0.3]}>
                        <boxGeometry args={[0.04, 0.025, 0.02]} />
                        <meshStandardMaterial color="#27272a" metalness={0.9} roughness={0.1} />
                      </mesh>
                    </group>
                  ))}
                  {/* Hinge pins (opposite side) */}
                  {[-0.25, 0.25].map((yOff, hi) => (
                    <mesh
                      key={hi}
                      position={[-side * (sd * 0.32), sh * yOff, -sd * 0.35]}
                      rotation={[Math.PI / 2, 0, 0]}
                    >
                      <cylinderGeometry args={[0.02, 0.02, 0.06, 8]} />
                      <meshStandardMaterial color="#3f3f46" metalness={0.8} roughness={0.2} />
                    </mesh>
                  ))}
                </group>

                {/* Inspection window on front */}
                <group position={[0, sh * 0.15, sd * 0.47]}>
                  <mesh>
                    <boxGeometry args={[compartmentWidth * 0.4, sh * 0.2, 0.025]} />
                    <meshStandardMaterial color="#71717a" metalness={0.6} roughness={0.3} />
                  </mesh>
                  <mesh position={[0, 0, 0.015]}>
                    <planeGeometry args={[compartmentWidth * 0.35, sh * 0.17]} />
                    <meshPhysicalMaterial
                      color="#fafafa"
                      metalness={0.05}
                      roughness={0.05}
                      transmission={0.75}
                      transparent
                      opacity={0.35}
                    />
                  </mesh>
                </group>

                {/* Product inlet (top of each compartment) */}
                <group position={[0, sh * 0.44, 0]}>
                  <mesh>
                    <cylinderGeometry args={[0.18, 0.15, 0.12, 12]} />
                    <meshStandardMaterial color="#6b7280" metalness={0.75} roughness={0.2} />
                  </mesh>
                  <mesh position={[0, 0.07, 0]}>
                    <cylinderGeometry args={[0.22, 0.22, 0.03, 12]} />
                    <meshStandardMaterial color="#52525b" metalness={0.8} roughness={0.15} />
                  </mesh>
                </group>

                {/* Outlet chutes (bottom - multiple fractions) */}
                {[-0.25, 0, 0.25].map((xOff, oi) => (
                  <group key={oi} position={[compartmentWidth * xOff, -sh * 0.45, sd * 0.2]}>
                    <mesh rotation={[0.35, 0, 0]}>
                      <boxGeometry args={[0.28, 0.06, 0.35]} />
                      <meshStandardMaterial
                        color={oi === 1 ? '#94a3b8' : '#78716c'}
                        metalness={0.7}
                        roughness={0.2}
                      />
                    </mesh>
                  </group>
                ))}
              </group>
            ))}

            {/* === CENTRAL DRIVE CHASSIS === */}
            <group position={[0, 0, 0]}>
              {/* Chassis body */}
              <mesh castShadow receiveShadow>
                <boxGeometry args={[centralWidth, sh * 0.75, sd * 0.85]} />
                <meshStandardMaterial color="#374151" metalness={0.65} roughness={0.3} />
              </mesh>

              {/* === LARGE ECCENTRIC FLYWHEEL (visible counterweight) === */}
              <group position={[0, -sh * 0.15, -sd * 0.48]}>
                {/* Flywheel */}
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[sh * 0.28, sh * 0.28, 0.12, 24]} />
                  <meshStandardMaterial color="#1f2937" metalness={0.85} roughness={0.15} />
                </mesh>
                {/* Flywheel rim detail */}
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                  <torusGeometry args={[sh * 0.26, 0.025, 8, 32]} />
                  <meshStandardMaterial color="#0f172a" metalness={0.9} roughness={0.1} />
                </mesh>
                {/* Counterweight (off-center mass) */}
                <mesh position={[sh * 0.12, 0, -0.03]} rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.08, 0.08, 0.15, 12]} />
                  <meshStandardMaterial color="#dc2626" metalness={0.6} roughness={0.3} />
                </mesh>
                {/* Hub */}
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.08, 0.08, 0.18, 12]} />
                  <meshStandardMaterial color="#52525b" metalness={0.8} roughness={0.2} />
                </mesh>
                {/* Spokes (6) */}
                {Array.from({ length: 6 }).map((_, si) => (
                  <mesh
                    key={si}
                    position={[
                      Math.cos((si * Math.PI) / 3) * sh * 0.13,
                      Math.sin((si * Math.PI) / 3) * sh * 0.13,
                      -0.03,
                    ]}
                    rotation={[Math.PI / 2, 0, (si * Math.PI) / 3]}
                  >
                    <boxGeometry args={[sh * 0.22, 0.04, 0.06]} />
                    <meshStandardMaterial color="#27272a" metalness={0.8} roughness={0.2} />
                  </mesh>
                ))}
              </group>

              {/* Drive motor */}
              <group position={[0, -sh * 0.15, -sd * 0.58]}>
                {/* Motor body */}
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.22, 0.22, 0.4, 16]} />
                  <meshStandardMaterial color="#1e3a5f" metalness={0.6} roughness={0.35} />
                </mesh>
                {/* Motor cooling fins */}
                {Array.from({ length: 8 }).map((_, fi) => (
                  <mesh
                    key={fi}
                    position={[0, 0, -0.1 - fi * 0.035]}
                    rotation={[Math.PI / 2, 0, 0]}
                  >
                    <cylinderGeometry args={[0.24, 0.24, 0.012, 16]} />
                    <meshStandardMaterial color="#1e3a5f" metalness={0.55} roughness={0.4} />
                  </mesh>
                ))}
                {/* Motor terminal box */}
                <mesh position={[0.18, 0.08, -0.15]}>
                  <boxGeometry args={[0.12, 0.1, 0.08]} />
                  <meshStandardMaterial color="#374151" metalness={0.5} roughness={0.4} />
                </mesh>
                {/* Motor mounting base */}
                <mesh position={[0, -0.15, -0.15]}>
                  <boxGeometry args={[0.35, 0.08, 0.5]} />
                  <meshStandardMaterial color="#27272a" metalness={0.7} roughness={0.3} />
                </mesh>
              </group>

              {/* V-belt guard (yellow safety) */}
              <mesh position={[0, -sh * 0.15, -sd * 0.52]}>
                <boxGeometry args={[0.35, sh * 0.35, 0.08]} />
                <meshStandardMaterial color="#eab308" metalness={0.3} roughness={0.45} />
              </mesh>
            </group>

            {/* === ASPIRATION SYSTEM (Dust Collection) === */}
            {/* Main aspiration duct on top */}
            <group position={[0, sh * 0.5, -sd * 0.3]}>
              <mesh rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.15, 0.15, sw * 0.8, 12]} />
                <meshStandardMaterial color="#64748b" metalness={0.7} roughness={0.25} />
              </mesh>
              {/* Vertical exhaust riser */}
              <mesh position={[0, 0.3, 0]}>
                <cylinderGeometry args={[0.12, 0.15, 0.5, 12]} />
                <meshStandardMaterial color="#64748b" metalness={0.7} roughness={0.25} />
              </mesh>
              {/* Branch connections to compartments */}
              {[-1, 1].map((side) => (
                <mesh
                  key={side}
                  castShadow
                  position={[side * sw * 0.25, -0.1, 0]}
                  rotation={[0, 0, side * 0.4]}
                >
                  <cylinderGeometry args={[0.08, 0.1, 0.25, 10]} />
                  <meshStandardMaterial color="#78716c" metalness={0.65} roughness={0.3} />
                </mesh>
              ))}
            </group>

            {/* Air inlet dampers (sides) */}
            {[-1, 1].map((side) => (
              <group
                key={side}
                position={[side * sw * 0.45, sh * 0.2, 0]}
                rotation={[0, (side * Math.PI) / 2, 0]}
              >
                <mesh>
                  <boxGeometry args={[0.3, 0.25, 0.06]} />
                  <meshStandardMaterial color="#52525b" metalness={0.6} roughness={0.35} />
                </mesh>
                {/* Damper louvers */}
                {[-0.08, 0, 0.08].map((y, li) => (
                  <mesh key={li} position={[0, y, 0.035]} rotation={[0.3, 0, 0]}>
                    <boxGeometry args={[0.25, 0.04, 0.015]} />
                    <meshStandardMaterial color="#71717a" metalness={0.7} roughness={0.25} />
                  </mesh>
                ))}
              </group>
            ))}

            {/* === CONTROL & MONITORING === */}
            {/* Main control panel - PERFORMANCE: Skip on LOW quality */}
            {!isLowQuality && (
              <ControlPanel
                position={[sw * 0.48, 0, sd * 0.35]}
                rotation={[0, -Math.PI / 2, 0]}
                status={status}
                enabled={enableControlPanels}
              />
            )}

            {/* Status indicator lights */}
            {[
              { pos: [-sw * 0.35, sh * 0.4, sd * 0.46], color: '#22c55e' },
              { pos: [sw * 0.35, sh * 0.4, sd * 0.46], color: '#22c55e' },
              { pos: [0, sh * 0.35, -sd * 0.44], color: '#3b82f6' },
            ].map((light, li) => (
              <mesh key={li} position={light.pos as [number, number, number]}>
                <sphereGeometry args={[0.06, 10, 10]} />
                <meshStandardMaterial
                  color={status === 'running' ? light.color : '#6b7280'}
                  emissive={status === 'running' ? light.color : '#000000'}
                  emissiveIntensity={status === 'running' ? 0.6 : 0}
                />
              </mesh>
            ))}

            {/* Vibration sensor (on chassis) */}
            <mesh position={[centralWidth * 0.6, -sh * 0.3, 0]}>
              <boxGeometry args={[0.08, 0.08, 0.08]} />
              <meshStandardMaterial color="#0ea5e9" metalness={0.5} roughness={0.4} />
            </mesh>

            {/* Temperature probe */}
            <mesh position={[-centralWidth * 0.6, sh * 0.1, sd * 0.4]} rotation={[0.5, 0, 0]}>
              <cylinderGeometry args={[0.02, 0.015, 0.15, 8]} />
              <meshStandardMaterial color="#71717a" metalness={0.8} roughness={0.2} />
            </mesh>

            {/* Weathering - flour dust accumulation */}
            <WeatheringLayer size={size as [number, number, number]} enabled={enableWeathering} />

            {/* Nameplate / ID tag */}
            <group position={[0, sh * 0.35, sd * 0.47]}>
              <mesh>
                <boxGeometry args={[0.4, 0.12, 0.01]} />
                <meshStandardMaterial color="#1f2937" metalness={0.7} roughness={0.3} />
              </mesh>
              <mesh position={[0, 0, 0.006]}>
                <planeGeometry args={[0.35, 0.08]} />
                <meshBasicMaterial color="#fafafa" />
              </mesh>
            </group>
          </group>
        );
      }

      case MachineType.PACKER: {
        // Detailed bag packer - flour/grain bagging machine
        const pw = size[0],
          ph = size[1],
          pd = size[2];
        return (
          <group position={[0, size[1] / 2, 0]}>
            {/* === MAIN FRAME === */}
            {/* Vertical frame posts */}
            {[
              [-1, -1],
              [-1, 1],
              [1, -1],
              [1, 1],
            ].map(([x, z], i) => (
              <mesh key={i} position={[x * pw * 0.45, 0, z * pd * 0.4]}>
                <boxGeometry args={[0.1, ph * 1.1, 0.1]} />
                <meshStandardMaterial color="#f97316" metalness={0.4} roughness={0.4} />
              </mesh>
            ))}
            {/* Top frame */}
            <mesh position={[0, ph * 0.55, 0]}>
              <boxGeometry args={[pw * 0.95, 0.08, pd * 0.85]} />
              <meshStandardMaterial color="#ea580c" metalness={0.45} roughness={0.35} />
            </mesh>

            {/* === WEIGHING HOPPER === */}
            <group position={[0, ph * 0.35, 0]}>
              {/* Hopper body - tapered */}
              <mesh>
                <boxGeometry args={[pw * 0.6, ph * 0.3, pd * 0.5]} />
                <meshStandardMaterial color="#94a3b8" metalness={0.7} roughness={0.2} />
              </mesh>
              {/* Hopper taper bottom */}
              <mesh position={[0, -ph * 0.2, 0]}>
                <boxGeometry args={[pw * 0.4, ph * 0.12, pd * 0.35]} />
                <meshStandardMaterial color="#64748b" metalness={0.6} roughness={0.25} />
              </mesh>
              {/* Load cells (visual) */}
              {[-1, 1].map((x) => (
                <mesh key={x} position={[x * pw * 0.25, ph * 0.18, 0]}>
                  <boxGeometry args={[0.15, 0.08, 0.15]} />
                  <meshStandardMaterial color="#22c55e" metalness={0.5} roughness={0.4} />
                </mesh>
              ))}
              {/* Weight display */}
              <group position={[pw * 0.35, 0, pd * 0.28]}>
                <mesh>
                  <boxGeometry args={[0.35, 0.2, 0.08]} />
                  <meshStandardMaterial color="#1e293b" metalness={0.6} roughness={0.3} />
                </mesh>
                <mesh position={[0, 0, 0.041]}>
                  <planeGeometry args={[0.3, 0.15]} />
                  <meshBasicMaterial color="#22c55e" />
                </mesh>
              </group>
            </group>

            {/* === FILLING SPOUT === */}
            <group position={[0, ph * 0.05, 0]}>
              {/* Spout tube */}
              <mesh>
                <cylinderGeometry args={[0.12, 0.18, ph * 0.35, 12]} />
                <meshStandardMaterial color="#6b7280" metalness={0.75} roughness={0.2} />
              </mesh>
              {/* Spout collar */}
              <mesh position={[0, -ph * 0.15, 0]}>
                <cylinderGeometry args={[0.22, 0.2, 0.08, 12]} />
                <meshStandardMaterial color="#374151" metalness={0.8} roughness={0.15} />
              </mesh>
              {/* Butterfly valve indicator */}
              <mesh position={[0.15, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.03, 0.03, 0.08, 8]} />
                <meshStandardMaterial color="#dc2626" metalness={0.5} roughness={0.4} />
              </mesh>
            </group>

            {/* === BAG CLAMP MECHANISM === */}
            <group position={[0, -ph * 0.2, 0]}>
              {/* Clamp arms */}
              {[-1, 1].map((x) => (
                <group key={x}>
                  <mesh position={[x * 0.3, 0, 0]}>
                    <boxGeometry args={[0.08, 0.25, pd * 0.4]} />
                    <meshStandardMaterial color="#374151" metalness={0.7} roughness={0.3} />
                  </mesh>
                  {/* Clamp pads */}
                  <mesh position={[x * 0.25, -0.05, 0]}>
                    <boxGeometry args={[0.06, 0.15, pd * 0.35]} />
                    <meshStandardMaterial color="#1f2937" roughness={0.8} />
                  </mesh>
                  {/* Pneumatic cylinders */}
                  <mesh position={[x * 0.4, 0.05, 0]} rotation={[0, 0, x * 0.3]}>
                    <cylinderGeometry args={[0.04, 0.04, 0.2, 8]} />
                    <meshStandardMaterial color="#6b7280" metalness={0.8} roughness={0.15} />
                  </mesh>
                </group>
              ))}
              {/* Bag shape indicator (when running) */}
              {status === 'running' && (
                <mesh position={[0, -0.25, 0]}>
                  <boxGeometry args={[0.5, 0.4, 0.3]} />
                  <meshStandardMaterial color="#fef3c7" roughness={0.7} transparent opacity={0.8} />
                </mesh>
              )}
            </group>

            {/* === CONVEYOR SYSTEM === */}
            <group position={[0, -ph * 0.48, pd * 0.5]}>
              {/* Conveyor frame */}
              <mesh>
                <boxGeometry args={[pw * 1.2, 0.08, pd * 0.8]} />
                <meshStandardMaterial color="#374151" metalness={0.6} roughness={0.35} />
              </mesh>
              {/* Rollers */}
              {Array.from({ length: 8 }).map((_, i) => (
                <mesh
                  key={i}
                  position={[-pw * 0.5 + i * (pw * 0.15), 0.06, 0]}
                  rotation={[0, 0, Math.PI / 2]}
                  geometry={conveyorRollerGeometry}
                >
                  <meshStandardMaterial color="#6b7280" metalness={0.8} roughness={0.15} />
                </mesh>
              ))}
              {/* Conveyor belt surface */}
              <mesh position={[0, 0.1, 0]}>
                <boxGeometry args={[pw * 1.1, 0.02, pd * 0.6]} />
                <meshStandardMaterial color="#1f2937" roughness={0.9} />
              </mesh>
              {/* Side guides */}
              {[-1, 1].map((z) => (
                <mesh key={z} position={[0, 0.15, z * pd * 0.35]}>
                  <boxGeometry args={[pw * 1.2, 0.1, 0.03]} />
                  <meshStandardMaterial color="#f97316" metalness={0.4} roughness={0.4} />
                </mesh>
              ))}
              {/* Filled bag (when running) */}
              {status === 'running' && (
                <mesh position={[pw * 0.4, 0.2, 0]}>
                  <boxGeometry args={[0.45, 0.25, 0.35]} />
                  <meshStandardMaterial color="#fef3c7" roughness={0.75} />
                </mesh>
              )}
            </group>

            {/* === CONTROL STATION === */}
            <group position={[-pw * 0.55, 0, 0]}>
              {/* Control cabinet */}
              <mesh>
                <boxGeometry args={[0.25, ph * 0.7, pd * 0.5]} />
                <meshStandardMaterial color="#1e293b" metalness={0.5} roughness={0.35} />
              </mesh>
              {/* Control panel face - PERFORMANCE: Skip on LOW quality */}
              {!isLowQuality && (
                <ControlPanel
                  position={[-0.13, ph * 0.15, 0]}
                  rotation={[0, Math.PI / 2, 0]}
                  status={status}
                  enabled={enableControlPanels}
                />
              )}
              {/* Emergency stop */}
              <group position={[-0.13, -ph * 0.15, pd * 0.15]}>
                <mesh>
                  <cylinderGeometry args={[0.06, 0.06, 0.03, 16]} />
                  <meshStandardMaterial color="#dc2626" metalness={0.4} roughness={0.5} />
                </mesh>
                <mesh position={[0, 0.025, 0]}>
                  <cylinderGeometry args={[0.045, 0.045, 0.02, 16]} />
                  <meshStandardMaterial color="#7f1d1d" metalness={0.5} roughness={0.4} />
                </mesh>
              </group>
              {/* Start button */}
              <mesh position={[-0.13, -ph * 0.15, -pd * 0.15]}>
                <cylinderGeometry args={[0.04, 0.04, 0.025, 12]} />
                <meshStandardMaterial
                  color="#22c55e"
                  emissive={status === 'running' ? '#22c55e' : '#000000'}
                  emissiveIntensity={status === 'running' ? 0.5 : 0}
                />
              </mesh>
            </group>

            {/* === SAFETY GUARDS === */}
            {/* Side guard panels */}
            {[-1, 1].map((z) => (
              <mesh key={z} position={[pw * 0.3, -ph * 0.1, z * pd * 0.45]}>
                <boxGeometry args={[pw * 0.5, ph * 0.6, 0.02]} />
                <meshStandardMaterial
                  color="#fbbf24"
                  metalness={0.3}
                  roughness={0.5}
                  transparent
                  opacity={0.9}
                />
              </mesh>
            ))}

            {/* Warning stripes on frame */}
            {[
              [-1, -1],
              [-1, 1],
              [1, -1],
              [1, 1],
            ].map(([x, z], i) => (
              <group key={i}>
                {[0, 1, 2].map((stripe) => (
                  <mesh
                    key={stripe}
                    position={[x * pw * 0.45, -ph * 0.3 + stripe * 0.15, z * pd * 0.41]}
                  >
                    <boxGeometry args={[0.11, 0.05, 0.01]} />
                    <meshBasicMaterial color={stripe % 2 === 0 ? '#1f2937' : '#fbbf24'} />
                  </mesh>
                ))}
              </group>
            ))}

            {/* Weathering */}
            <WeatheringLayer size={size as [number, number, number]} enabled={enableWeathering} />

            {/* Status beacon */}
            <mesh position={[pw * 0.4, ph * 0.6, pd * 0.3]}>
              <cylinderGeometry args={[0.06, 0.06, 0.1, 12]} />
              <meshStandardMaterial
                color={
                  status === 'running' ? '#22c55e' : status === 'warning' ? '#f59e0b' : '#6b7280'
                }
                emissive={
                  status === 'running' ? '#22c55e' : status === 'warning' ? '#f59e0b' : '#000000'
                }
                emissiveIntensity={status !== 'idle' ? 0.6 : 0}
              />
            </mesh>
          </group>
        );
      }

      default:
        return null;
    }
  };

  // PERFORMANCE: Simplified box representation for LOW quality
  // Reduces ~150 draw calls per machine down to ~5
  const renderSimplifiedGeometry = () => {
    // Simple colored box based on machine type
    const typeColors: Record<MachineType, string> = {
      [MachineType.SILO]: '#94a3b8',
      [MachineType.ROLLER_MILL]: '#64748b',
      [MachineType.PLANSIFTER]: '#78716c',
      [MachineType.PACKER]: '#475569',
      [MachineType.CONTROL_ROOM]: '#64748b',
    };
    const color = typeColors[type] || '#64748b';

    return (
      <mesh position={[0, size[1] / 2, 0]}>
        <boxGeometry args={[size[0], size[1], size[2]]} />
        <meshBasicMaterial color={color} />
      </mesh>
    );
  };

  return (
    <group
      ref={groupRef}
      position={position}
      rotation={[0, rotation, 0]}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = 'auto';
      }}
      onClick={(e) => {
        e.stopPropagation();
        audioManager.playClick();
        onSelect(data);
      }}
    >
      {/* PERFORMANCE: Use simplified box on LOW quality, full geometry on MEDIUM+ */}
      {isLowQuality ? renderSimplifiedGeometry() : renderGeometry()}

      {/* Heat shimmer effect for hot machines - uses SCADA temperature */}
      {/* PERFORMANCE: Disabled on LOW quality */}
      {!isLowQuality &&
        status === 'running' &&
        (type === MachineType.ROLLER_MILL || type === MachineType.PACKER) && (
          <HeatShimmer
            position={position as [number, number, number]}
            temperature={scadaVisuals.tagValues.temperature ?? data.metrics.temperature}
            size={size as [number, number, number]}
          />
        )}

      {/* Status light - uses SCADA-derived color */}
      {/* PERFORMANCE: Simplified on LOW quality */}
      {isLowQuality ? (
        <mesh position={[0, size[1] + 0.5, 0]}>
          <boxGeometry args={[0.5, 0.5, 0.5]} />
          <meshBasicMaterial color={statusColor} />
        </mesh>
      ) : (
        <>
          <mesh position={[0, size[1] + 1.5, 0]}>
            <sphereGeometry args={[0.3]} />
            <meshStandardMaterial
              color={statusColor}
              emissive={statusColor}
              emissiveIntensity={3}
              toneMapped={false}
            />
          </mesh>
          <mesh position={[0, size[1] + 0.75, 0]}>
            <cylinderGeometry args={[0.05, 0.05, 1.5]} />
            <meshStandardMaterial color="#374151" metalness={0.8} roughness={0.3} />
          </mesh>
        </>
      )}

      {/* SCADA Alarm Indicator - pulsing octahedron when alarms are active */}
      {/* PERFORMANCE: Disabled on LOW quality */}
      {!isLowQuality && scadaAlarms.highestPriority && (
        <AlarmIndicator
          position={[size[0] / 2 + 0.8, size[1] + 1.5, 0]}
          priority={scadaAlarms.highestPriority}
          pulseSpeed={scadaVisuals.alarmPulseSpeed}
          hasUnacknowledged={scadaAlarms.hasUnacknowledged}
        />
      )}

      {/* SCADA Live Values Overlay - shows on hover for high/ultra graphics */}
      {hovered && Object.keys(scadaVisuals.tagValues).length > 0 && (
        <SCADAValueOverlay
          position={[-(size[0] / 2 + 1.5), size[1] / 2, 0]}
          tagValues={scadaVisuals.tagValues}
          temperatureColor={scadaVisuals.temperatureColor}
          vibrationColor={scadaVisuals.vibrationColor}
        />
      )}

      {/* Hover tooltip - PERFORMANCE: Disabled on LOW quality (Html overlays are expensive) */}
      {!isLowQuality && hovered && (
        <Html position={[0, size[1] + 2.5, 0]} center distanceFactor={12}>
          <div className="bg-slate-900/95 backdrop-blur-xl border border-cyan-500/30 px-4 py-2 rounded-lg shadow-2xl pointer-events-none min-w-[180px]">
            <div className="font-bold text-white text-sm">{data.name}</div>
            <div className="text-xs text-cyan-400">{data.type.replace('_', ' ')}</div>
            <div className="flex items-center gap-1 mt-1">
              <span
                className="w-2 h-2 rounded-full animate-pulse"
                style={{ backgroundColor: statusColor }}
              ></span>
              <span className="text-xs text-slate-400 capitalize">
                {scadaVisuals.derivedStatus}
              </span>
            </div>
            {scadaAlarms.highestPriority && (
              <div className="flex items-center gap-1 mt-1">
                <span className="text-[10px] text-red-400">
                  {scadaAlarms.alarms.length} alarm{scadaAlarms.alarms.length > 1 ? 's' : ''} active
                </span>
              </div>
            )}
            <div className="text-[10px] text-slate-500 mt-1">Click to inspect</div>
          </div>
        </Html>
      )}
    </group>
  );
});

// Memoize Machines component to prevent re-renders when parent reflows
export const Machines = React.memo(MachinesComponent);

export const MachinesContainer: React.FC<{
  initialMachines: MachineData[];
  onSelect: (data: MachineData) => void;
}> = React.memo(({ initialMachines, onSelect }) => {
  const storeMachines = useProductionStore((state) => state.machines);
  // Use store machines if available (live updates), otherwise initial static machines
  const displayMachines = storeMachines.length > 0 ? storeMachines : initialMachines;

  return <Machines machines={displayMachines} onSelect={onSelect} />;
});

/**
 * MachineSimulationController - Handles physics simulation loop for machines.
 * Isolated from the main rendering tree to prevent re-renders of the scene.
 */
export const MachineSimulationController: React.FC = () => {
  const { storeMachines, batchUpdateMachineMetrics, updateMachineStatus, scadaLive } =
    useProductionStore(
      useShallow((state) => ({
        storeMachines: state.machines,
        batchUpdateMachineMetrics: state.batchUpdateMachineMetrics,
        updateMachineStatus: state.updateMachineStatus,
        scadaLive: state.scadaLive,
      }))
    );

  const lastUpdateRef = useRef(0);
  const frameCountRef = useRef(0);
  const productionSpeed = useProductionStore((state) => state.productionSpeed);

  // BILATERAL ALIGNMENT: Workforce productivity multiplier affects production output
  const workforceProductivity = useWorkerMoodStore((state) =>
    state.getWorkforceProductivityMultiplier()
  );

  // Simulate realistic machine metric changes over time
  // Throttled to check every 30 frames (~0.5s at 60fps) instead of every frame
  useFrame((state) => {
    // When SCADA is driving metrics, skip local simulation
    if (scadaLive) return;
    frameCountRef.current++;

    // Only check time every 30 frames to reduce overhead
    if (frameCountRef.current % 30 !== 0) return;

    const now = state.clock.elapsedTime;

    // Update every 2 seconds
    if (now - lastUpdateRef.current < 2) return;
    lastUpdateRef.current = now;

    // Only update if store has machines
    if (storeMachines.length === 0) return;

    // PHYSICS-BASED METRIC SIMULATION
    // Update ALL machines based on their actual state (not random selection)
    const metricUpdates: { machineId: string; metrics: Partial<MachineData['metrics']> }[] = [];

    for (const machine of storeMachines) {
      const isRunning = machine.status === 'running' || machine.status === 'warning';
      const isIdle = machine.status === 'idle';
      const isCritical = machine.status === 'critical';

      // Get base temps for machine type
      const baseTemp: Record<string, number> = {
        SILO: 20,
        ROLLER_MILL: 42,
        PLANSIFTER: 28,
        PACKER: 28,
        CONTROL_ROOM: 22,
      };
      const machineBaseTemp = baseTemp[machine.type.toString()] || 30;

      // LOAD: Responds to productionSpeed * workforce productivity multiplier
      // BILATERAL ALIGNMENT: High trust workers (1.15x) produce more, low trust (0.85x) drags
      let targetLoad = machine.metrics.load;
      if (isRunning) {
        // Running machines adjust load toward productionSpeed * 80 * workforce productivity
        const baseLoad = 50 + productionSpeed * 30; // 50-80% based on speed
        targetLoad = baseLoad * workforceProductivity; // Apply trust/initiative multiplier (0.85-1.20x)
      } else if (isIdle) {
        targetLoad = 0; // Idle = no load
      }
      const loadChange = (targetLoad - machine.metrics.load) * 0.1; // Smooth transition
      const newLoad = Math.max(0, Math.min(100, machine.metrics.load + loadChange));

      // TEMPERATURE: Correlates with load (high load = heat up, idle = cool down)
      let targetTemp = machineBaseTemp;
      if (isRunning) {
        // Temperature rises with load: base + up to 20°C at full load
        targetTemp = machineBaseTemp + (newLoad / 100) * 20;
      } else if (isIdle) {
        // Cooling down toward ambient
        targetTemp = 20;
      } else if (isCritical) {
        // Critical machines run hot
        targetTemp = machineBaseTemp + 40;
      }
      const tempChange = (targetTemp - machine.metrics.temperature) * 0.05; // Slow thermal change
      const newTemp = Math.max(15, Math.min(90, machine.metrics.temperature + tempChange));

      // VIBRATION: Correlates with RPM and machine status
      let targetVibration = 1.0;
      if (isRunning) {
        // Vibration based on RPM ratio and load
        const rpmRatio = machine.metrics.rpm / 1200; // Normalize to 1200 RPM base
        targetVibration = 1.0 + rpmRatio * 2 + newLoad / 100;
        // Warning machines vibrate more (something is wrong)
        if (machine.status === 'warning') targetVibration *= 1.5;
      } else if (isCritical) {
        targetVibration = 7; // Critical = high vibration
      } else {
        targetVibration = 0.2; // Idle = minimal vibration
      }
      const vibrationChange = (targetVibration - machine.metrics.vibration) * 0.1;
      const newVibration = Math.max(0, Math.min(10, machine.metrics.vibration + vibrationChange));

      // Collect metric updates for batch processing
      metricUpdates.push({
        machineId: machine.id,
        metrics: {
          temperature: Math.round(newTemp * 10) / 10,
          vibration: Math.round(newVibration * 100) / 100,
          load: Math.round(newLoad * 10) / 10,
        },
      });

      // STATUS CHANGES: Based on actual threshold crossings (deterministic)
      if (machine.status === 'running') {
        // Transition to warning if temp or vibration exceeds threshold
        if (newTemp > 70 || newVibration > 5) {
          updateMachineStatus(machine.id, 'warning');
        }
      } else if (machine.status === 'warning') {
        // Recovery when metrics return to safe levels
        if (newTemp < 55 && newVibration < 3.5) {
          updateMachineStatus(machine.id, 'running');
        }
        // Escalate to critical if thresholds exceeded significantly
        if (newTemp > 80 || newVibration > 8) {
          updateMachineStatus(machine.id, 'critical');
        }
      } else if (machine.status === 'critical') {
        // Only recover from critical if metrics are very low (machine cooled down)
        if (newTemp < 40 && newVibration < 2) {
          updateMachineStatus(machine.id, 'warning');
        }
      }
    }

    // Commit all metric updates in one batch to prevent render thrashing
    if (metricUpdates.length > 0) {
      batchUpdateMachineMetrics(metricUpdates);
    }
  });

  return null;
};
