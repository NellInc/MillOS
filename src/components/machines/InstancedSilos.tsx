import React, { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame, ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { MachineData, GrainQuality } from '../../types';
import { useGraphicsStore } from '../../stores/graphicsStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useShallow } from 'zustand/react/shallow';
import { shouldRunThisFrame } from '../../utils/frameThrottle';
import {
  getSiloBodyGeometry,
  getSiloConeGeometry,
  getSiloLegGeometry,
  getSiloLadderGeometry,
  isInstanceVisible,
  getCullDistanceSquared,
} from './MachineLOD';
import { useModelTextures } from '../../utils/machineTextures';
import { MemoizedStatusRing } from './StatusRing';
import {
  PROCEDURAL_TEXTURES,
  NORMAL_SCALES,
  INSTANCED_MACHINE_MATERIALS,
} from '../../utils/sharedMaterials';

// Reference shared materials (textures applied via hook)
const MATERIALS = {
  body: INSTANCED_MACHINE_MATERIALS.siloBody,
  darkMetal: INSTANCED_MACHINE_MATERIALS.siloDarkMetal,
  fill: INSTANCED_MACHINE_MATERIALS.siloFill,
  fillLow: INSTANCED_MACHINE_MATERIALS.siloFillLow,
};

const SILO_SIZE = { width: 4.5, height: 16 };

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

// Maintenance countdown timer display (HTML Overlay)
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

// Fill level overlay (HTML part only)
const SiloOverlay: React.FC<{
  fillLevel: number;
  quality: GrainQuality;
  grainType: string;
  radius: number;
  position: [number, number, number];
}> = React.memo(({ fillLevel, quality, grainType, radius, position }) => {
  const qualityColor = QUALITY_COLORS[quality];
  const graphicsQuality = useGraphicsStore((state) => state.graphics.quality);

  if (graphicsQuality === 'low') return null;

  return (
    <Html
      position={[position[0] + radius + 0.8, position[1], position[2]]}
      center
      distanceFactor={15}
    >
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
  );
});

interface InstancedSilosProps {
  machines: MachineData[];
  onSelect: (machine: MachineData) => void;
}

export const InstancedSilos: React.FC<InstancedSilosProps> = ({ machines, onSelect }) => {
  // Consolidated store subscription with useShallow to prevent unnecessary re-renders
  const { quality, vibrationEnabled, colorVariationEnabled, machineLodDistance } = useGraphicsStore(
    useShallow((state) => ({
      quality: state.graphics.quality,
      vibrationEnabled: state.graphics.enableMachineVibration,
      colorVariationEnabled: state.graphics.enableMachineColorVariation,
      machineLodDistance: state.graphics.machineLodDistance,
    }))
  );
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);

  // Load textures (only on high/ultra)
  const textures = useModelTextures('silo');

  // Refs for InstancedMeshes
  const bodyRef = useRef<THREE.InstancedMesh>(null);
  const conesRef = useRef<THREE.InstancedMesh>(null); // Top and Bottom cones
  const legsRef = useRef<THREE.InstancedMesh>(null); // 4 legs per silo
  const fillRef = useRef<THREE.InstancedMesh>(null); // Grain fill level
  const ladderRef = useRef<THREE.InstancedMesh>(null); // Access ladder

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const count = machines.length;

  // Quality-based LOD geometries (fewer segments on lower settings)
  const geometries = useMemo(
    () => ({
      cylinder: getSiloBodyGeometry(quality),
      cone: getSiloConeGeometry(quality),
      leg: getSiloLegGeometry(quality),
      ladder: getSiloLadderGeometry(quality, SILO_SIZE.height),
    }),
    [quality]
  );

  // Apply textures to materials (external or procedural fallback)
  useEffect(() => {
    const roughnessMap = textures.roughness || PROCEDURAL_TEXTURES.brushedMetal;
    const normalMap = textures.normal || PROCEDURAL_TEXTURES.panelNormal;

    // Body - metallic silo surface
    MATERIALS.body.roughnessMap = roughnessMap;
    MATERIALS.body.normalMap = normalMap;
    MATERIALS.body.normalScale = NORMAL_SCALES.standard;
    MATERIALS.body.needsUpdate = true;

    // Dark metal (legs, ladder)
    MATERIALS.darkMetal.roughnessMap = textures.ao || PROCEDURAL_TEXTURES.brushedMetal;
    MATERIALS.darkMetal.normalMap = normalMap;
    MATERIALS.darkMetal.normalScale = NORMAL_SCALES.medium;
    MATERIALS.darkMetal.needsUpdate = true;
  }, [textures]);

  // Determine if machines list has structurally changed (added/removed/reordered)
  // This prevents running expensive matrix updates on every SCADA tick (which returns new array references)
  const machinesSignature = useMemo(() => machines.map((m) => m.id).join(','), [machines]);

  // Initialize static positions (Body, Cones, Legs, Ladders)
  useEffect(() => {
    if (!bodyRef.current || !conesRef.current || !legsRef.current || !ladderRef.current) return;

    machines.forEach((machine, i) => {
      // 1. Main Body Cylinder
      dummy.position.set(
        machine.position[0],
        machine.position[1] + SILO_SIZE.height / 2,
        machine.position[2]
      );
      dummy.scale.set(SILO_SIZE.width / 2, SILO_SIZE.height, SILO_SIZE.width / 2);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      bodyRef.current!.setMatrixAt(i, dummy.matrix);

      // 2. Cones (Top and Bottom)
      // Top Cone
      dummy.position.set(
        machine.position[0],
        machine.position[1] + SILO_SIZE.height + 1,
        machine.position[2]
      );
      dummy.scale.set(SILO_SIZE.width / 2, 2, SILO_SIZE.width / 2);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      conesRef.current!.setMatrixAt(i * 2, dummy.matrix);

      // Bottom Cone
      dummy.position.set(machine.position[0], machine.position[1] - 1, machine.position[2]);
      dummy.scale.set(SILO_SIZE.width / 2, 2, SILO_SIZE.width / 2);
      dummy.rotation.x = Math.PI; // Flip
      dummy.updateMatrix();
      conesRef.current!.setMatrixAt(i * 2 + 1, dummy.matrix);
      dummy.rotation.x = 0; // Reset

      // 3. Legs (4 per silo)
      const legDist = SILO_SIZE.width / 3;
      const legHeight = 4;
      [1, -1].forEach((x, xi) => {
        [1, -1].forEach((z, zi) => {
          const legIndex = i * 4 + (xi * 2 + zi);
          dummy.position.set(
            machine.position[0] + x * legDist,
            machine.position[1] - SILO_SIZE.height / 2 - 3 + 2, // Adjust Y to match bottom
            machine.position[2] + z * legDist
          );
          dummy.scale.set(1, legHeight, 1); // Geometry is unit height
          dummy.updateMatrix();
          legsRef.current!.setMatrixAt(legIndex, dummy.matrix);
        });
      });

      // 4. Access Ladder
      // Positioned on positive X side, offset by radius + padding
      const ladderOffset = SILO_SIZE.width / 2 + 0.35;
      dummy.position.set(
        machine.position[0] + ladderOffset,
        machine.position[1] + SILO_SIZE.height / 2,
        machine.position[2]
      );
      dummy.scale.set(1, 1, 1); // Geometry is already sized
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      ladderRef.current!.setMatrixAt(i, dummy.matrix);
    });

    bodyRef.current.instanceMatrix.needsUpdate = true;
    conesRef.current.instanceMatrix.needsUpdate = true;
    legsRef.current.instanceMatrix.needsUpdate = true;
    ladderRef.current.instanceMatrix.needsUpdate = true;
  }, [machinesSignature, dummy]); // Depend on ID signature, not raw machines array

  // Apply per-instance color variation (medium+ quality)
  useEffect(() => {
    if (!colorVariationEnabled || !bodyRef.current || !conesRef.current) return;

    const color = new THREE.Color();
    const baseColor = new THREE.Color('#cbd5e1'); // Match MATERIALS.body color

    machines.forEach((machine, i) => {
      const hsl = { h: 0, s: 0, l: 0 };
      baseColor.getHSL(hsl);

      // Deterministic variation from machine ID - subtle +/-5% lightness
      const seed = machine.id.charCodeAt(machine.id.length - 1);
      const lightnessOffset = ((seed % 10) - 5) * 0.01;
      const saturationOffset = ((seed % 5) - 2) * 0.005;

      color.setHSL(
        hsl.h,
        Math.max(0, Math.min(1, hsl.s + saturationOffset)),
        Math.max(0, Math.min(1, hsl.l + lightnessOffset))
      );

      // Apply to body
      bodyRef.current!.setColorAt(i, color);
      // Apply to both cones for this silo
      conesRef.current!.setColorAt(i * 2, color);
      conesRef.current!.setColorAt(i * 2 + 1, color);
    });

    if (bodyRef.current.instanceColor) {
      bodyRef.current.instanceColor.needsUpdate = true;
    }
    if (conesRef.current.instanceColor) {
      conesRef.current.instanceColor.needsUpdate = true;
    }
  }, [machinesSignature, colorVariationEnabled]);

  // Pre-calculate cull distance squared (avoid recalculating each frame)
  const cullDistSq = useMemo(
    () => getCullDistanceSquared(machineLodDistance),
    [machineLodDistance]
  );

  // Update dynamic parts (Fill Level, Vibration, Distance Culling)
  useFrame((state) => {
    if (!fillRef.current || !bodyRef.current || !isTabVisible) return;
    if (!shouldRunThisFrame(quality === 'low' ? 4 : 2)) return;

    const time = state.clock.elapsedTime;
    const cam = state.camera.position;

    machines.forEach((machine, i) => {
      // Distance-based culling: hide instances far from camera
      const isVisible = isInstanceVisible(cam.x, cam.y, cam.z, machine.position, cullDistSq);

      if (!isVisible) {
        // Cull this instance by setting scale to 0
        dummy.scale.set(0, 0, 0);
        dummy.updateMatrix();
        bodyRef.current!.setMatrixAt(i, dummy.matrix);
        fillRef.current!.setMatrixAt(i, dummy.matrix);
        // Also cull ladder
        if (ladderRef.current) {
          ladderRef.current.setMatrixAt(i, dummy.matrix);
        }
        return;
      }

      const fillLevel = machine.fillLevel ?? machine.metrics.load ?? 0;
      const height = SILO_SIZE.height;
      const fillHeight = (fillLevel / 100) * height * 0.85;
      const radius = SILO_SIZE.width / 2 - 0.15;

      // Vibration Logic
      let offsetX = 0;
      let offsetZ = 0;
      if (vibrationEnabled && machine.status === 'running' && fillLevel > 50) {
        // Silos rumble when full
        const intensity = 0.002 * (fillLevel / 100) * (machine.metrics.vibration || 1);
        offsetX = Math.sin(time * 5) * intensity;
        offsetZ = Math.cos(time * 4) * intensity;

        // Update BODY position if vibrating
        dummy.position.set(
          machine.position[0] + offsetX,
          machine.position[1] + SILO_SIZE.height / 2,
          machine.position[2] + offsetZ
        );
        dummy.scale.set(SILO_SIZE.width / 2, SILO_SIZE.height, SILO_SIZE.width / 2);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        bodyRef.current!.setMatrixAt(i, dummy.matrix);
      }

      // Update Ladder Position (sync with body vibration)
      if (ladderRef.current) {
        const ladderOffset = SILO_SIZE.width / 2 + 0.35;
        dummy.position.set(
          machine.position[0] + ladderOffset + offsetX,
          machine.position[1] + SILO_SIZE.height / 2,
          machine.position[2] + offsetZ
        );
        dummy.scale.set(1, 1, 1); // Fixed size
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        ladderRef.current.setMatrixAt(i, dummy.matrix);
      }

      // Update Fill Level Mesh
      const posY = machine.position[1] - height / 2 + fillHeight / 2 + 0.5;
      dummy.position.set(machine.position[0] + offsetX, posY, machine.position[2] + offsetZ);
      dummy.scale.set(radius, Math.max(0.01, fillHeight), radius);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      fillRef.current!.setMatrixAt(i, dummy.matrix);
    });

    fillRef.current.instanceMatrix.needsUpdate = true;
    if (vibrationEnabled) {
      bodyRef.current.instanceMatrix.needsUpdate = true;
      if (ladderRef.current) ladderRef.current.instanceMatrix.needsUpdate = true;
    }
    // Update ladder matrix if culling happened
    if (ladderRef.current) ladderRef.current.instanceMatrix.needsUpdate = true;
  });

  const handleClick = (e: ThreeEvent<MouseEvent>, multiplier: number) => {
    e.stopPropagation();
    const instanceId = e.instanceId!;
    const machineIndex = Math.floor(instanceId / multiplier);
    if (machines[machineIndex]) {
      onSelect(machines[machineIndex]);
    }
  };

  return (
    <group>
      {/* Main Body */}
      <instancedMesh
        ref={bodyRef}
        args={[geometries.cylinder, MATERIALS.body, count]}
        onClick={(e) => handleClick(e, 1)}
        receiveShadow
        castShadow
      />

      {/* Cones (2 per silo) */}
      <instancedMesh
        ref={conesRef}
        args={[geometries.cone, MATERIALS.body, count * 2]}
        onClick={(e) => handleClick(e, 2)}
        receiveShadow
        castShadow
      />

      {/* Legs (4 per silo) */}
      <instancedMesh
        ref={legsRef}
        args={[geometries.leg, MATERIALS.darkMetal, count * 4]}
        onClick={(e) => handleClick(e, 4)}
        castShadow
      />

      {/* Access Ladders */}
      <instancedMesh
        ref={ladderRef}
        args={[geometries.ladder, MATERIALS.darkMetal, count]}
        onClick={(e) => handleClick(e, 1)}
        castShadow
      />

      {/* Fill Level */}
      <instancedMesh
        ref={fillRef}
        args={[geometries.cylinder, quality === 'low' ? MATERIALS.fillLow : MATERIALS.fill, count]}
      />

      {/* HTML Overlays (Maintenance & Fill Info) */}
      {machines.map((machine) => (
        <group key={machine.id} position={machine.position}>
          {/* Status Ring at silo base */}
          {quality !== 'low' && (
            <MemoizedStatusRing
              status={machine.status as 'running' | 'idle' | 'warning' | 'critical'}
              radius={SILO_SIZE.width / 2}
              position={[0, 0, 0]}
            />
          )}
          {machine.maintenanceCountdown !== undefined && (
            <MaintenanceCountdown
              hoursRemaining={machine.maintenanceCountdown}
              position={[-(SILO_SIZE.width / 2 + 1), SILO_SIZE.height / 2 - 1, 0]}
            />
          )}
          <SiloOverlay
            fillLevel={machine.fillLevel ?? machine.metrics.load ?? 0}
            quality={machine.grainQuality || 'standard'}
            grainType={machine.grainType || 'Wheat'}
            radius={SILO_SIZE.width / 2}
            position={[0, 0, 0]}
          />
        </group>
      ))}
    </group>
  );
};
