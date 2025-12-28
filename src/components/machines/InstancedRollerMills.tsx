import React, { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { MachineData } from '../../types';
import { useGraphicsStore } from '../../stores/graphicsStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useShallow } from 'zustand/react/shallow';
import { shouldRunThisFrame } from '../../utils/frameThrottle';
import {
  getMillBoxGeometry,
  getMillCylinderGeometry,
  isInstanceVisible,
  getCullDistanceSquared,
} from './MachineLOD';
import { useModelTextures } from '../../utils/machineTextures';
import { MemoizedStatusRing } from './StatusRing';
import { PROCEDURAL_TEXTURES } from '../../utils/sharedMaterials';

// Materials
const MATERIALS = {
  housingLower: new THREE.MeshStandardMaterial({
    color: '#2563eb',
    metalness: 0.6,
    roughness: 0.2,
  }),
  housingUpper: new THREE.MeshStandardMaterial({
    color: '#60a5fa',
    metalness: 0.5,
    roughness: 0.3,
  }),
  frame: new THREE.MeshStandardMaterial({ color: '#1e3a5f', metalness: 0.5, roughness: 0.4 }),
  motor: new THREE.MeshStandardMaterial({ color: '#334155', metalness: 0.6, roughness: 0.4 }),
  window: new THREE.MeshPhysicalMaterial({
    color: '#1e40af',
    metalness: 0.1,
    roughness: 0.1,
    transmission: 0.6,
    transparent: true,
    opacity: 0.4,
  }),
  roller: new THREE.MeshStandardMaterial({ color: '#94a3b8', metalness: 0.95, roughness: 0.15 }),
};

// Static geometry (plane doesn't need LOD)
const PLANE_GEOMETRY = new THREE.PlaneGeometry(1, 1);

const MILL_SIZE = { width: 3.5, height: 5, depth: 3.5 };

interface InstancedRollerMillsProps {
  machines: MachineData[];
  onSelect: (machine: MachineData) => void;
}

export const InstancedRollerMills: React.FC<InstancedRollerMillsProps> = ({
  machines,
  onSelect,
}) => {
  // Consolidated store subscription with useShallow to prevent unnecessary re-renders
  const { quality, colorVariationEnabled, machineLodDistance } = useGraphicsStore(
    useShallow((state) => ({
      quality: state.graphics.quality,
      colorVariationEnabled: state.graphics.enableMachineColorVariation,
      machineLodDistance: state.graphics.machineLodDistance,
    }))
  );
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);

  // Load textures (only on high/ultra)
  const textures = useModelTextures('roller_mill');

  // Apply textures to materials (external or procedural fallback)
  useEffect(() => {
    const roughnessMap = textures.roughness || PROCEDURAL_TEXTURES.brushedMetal;
    const normalMap = textures.normal || PROCEDURAL_TEXTURES.panelNormal;

    // Lower housing - blue painted metal
    MATERIALS.housingLower.roughnessMap = roughnessMap;
    MATERIALS.housingLower.normalMap = normalMap;
    MATERIALS.housingLower.normalScale = new THREE.Vector2(0.3, 0.3);
    MATERIALS.housingLower.needsUpdate = true;

    // Upper housing - lighter painted metal
    MATERIALS.housingUpper.roughnessMap = roughnessMap;
    MATERIALS.housingUpper.normalMap = normalMap;
    MATERIALS.housingUpper.normalScale = new THREE.Vector2(0.3, 0.3);
    MATERIALS.housingUpper.needsUpdate = true;

    // Motor - dark metal with brushed texture
    MATERIALS.motor.roughnessMap = textures.ao || PROCEDURAL_TEXTURES.brushedMetal;
    MATERIALS.motor.normalMap = normalMap;
    MATERIALS.motor.normalScale = new THREE.Vector2(0.2, 0.2);
    MATERIALS.motor.needsUpdate = true;

    // Rollers - polished steel
    MATERIALS.roller.roughnessMap = PROCEDURAL_TEXTURES.brushedMetal;
    MATERIALS.roller.needsUpdate = true;
  }, [textures]);

  // Refs
  const lowerHousingRef = useRef<THREE.InstancedMesh>(null);
  const upperHousingRef = useRef<THREE.InstancedMesh>(null);
  const frameRef = useRef<THREE.InstancedMesh>(null);
  const windowRef = useRef<THREE.InstancedMesh>(null);
  const rollersRef = useRef<THREE.InstancedMesh>(null); // 6 rollers per mill

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const count = machines.length;

  // Quality-based LOD geometries
  const geometries = useMemo(
    () => ({
      box: getMillBoxGeometry(quality),
      cylinder: getMillCylinderGeometry(quality),
    }),
    [quality]
  );

  // Determine if machines list has structurally changed
  const machinesSignature = useMemo(() => machines.map((m) => m.id).join(','), [machines]);

  // Initialize Static Parts
  useEffect(() => {
    if (
      !lowerHousingRef.current ||
      !upperHousingRef.current ||
      !frameRef.current ||
      !windowRef.current
    )
      return;

    machines.forEach((machine, i) => {
      const { width: w, height: h, depth: d } = MILL_SIZE;
      const x = machine.position[0];
      const y = machine.position[1] + h / 2; // Adjust for center pivot
      const z = machine.position[2];

      // 1. Lower Housing (Blue Box)
      dummy.position.set(x, y - h * 0.15, z);
      dummy.scale.set(w, h * 0.7, d);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      lowerHousingRef.current!.setMatrixAt(i, dummy.matrix);

      // 2. Upper Housing (Light Blue Box)
      dummy.position.set(x, y + h * 0.35, z);
      dummy.scale.set(w * 0.9, h * 0.3, d * 0.85);
      dummy.updateMatrix();
      upperHousingRef.current!.setMatrixAt(i, dummy.matrix);

      // 3. Frames & Motor (Simplified details)
      // Motor (Side)
      dummy.position.set(x - w * 0.5 - 0.4, y - h * 0.1, z);
      dummy.scale.set(0.5, 0.7, 0.5); // Cylinder scaled
      dummy.rotation.set(0, 0, Math.PI / 2);
      dummy.updateMatrix();
      frameRef.current!.setMatrixAt(i, dummy.matrix);

      // 4. Windows (3 per mill)
      [-0.25, 0, 0.25].forEach((yOffset, winIdx) => {
        dummy.position.set(x, y - h * 0.1 + yOffset * h, z + d * 0.55);
        dummy.scale.set(w * 0.45, h * 0.12, 1);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        windowRef.current!.setMatrixAt(i * 3 + winIdx, dummy.matrix);
      });
    });

    lowerHousingRef.current.instanceMatrix.needsUpdate = true;
    upperHousingRef.current.instanceMatrix.needsUpdate = true;
    frameRef.current.instanceMatrix.needsUpdate = true;
    windowRef.current.instanceMatrix.needsUpdate = true;
  }, [machinesSignature, dummy]);

  // Apply per-instance color variation (medium+ quality)
  useEffect(() => {
    if (!colorVariationEnabled || !lowerHousingRef.current || !upperHousingRef.current) return;

    const color = new THREE.Color();
    const baseLower = new THREE.Color('#2563eb'); // Match MATERIALS.housingLower
    const baseUpper = new THREE.Color('#60a5fa'); // Match MATERIALS.housingUpper

    machines.forEach((machine, i) => {
      // Deterministic variation from machine ID - subtle +/-5% lightness
      const seed = machine.id.charCodeAt(machine.id.length - 1);
      const lightnessOffset = ((seed % 10) - 5) * 0.01;
      const saturationOffset = ((seed % 5) - 2) * 0.005;

      // Lower housing
      const hslLower = { h: 0, s: 0, l: 0 };
      baseLower.getHSL(hslLower);
      color.setHSL(
        hslLower.h,
        Math.max(0, Math.min(1, hslLower.s + saturationOffset)),
        Math.max(0, Math.min(1, hslLower.l + lightnessOffset))
      );
      lowerHousingRef.current!.setColorAt(i, color);

      // Upper housing (slightly different offset for variety)
      const hslUpper = { h: 0, s: 0, l: 0 };
      baseUpper.getHSL(hslUpper);
      color.setHSL(
        hslUpper.h,
        Math.max(0, Math.min(1, hslUpper.s + saturationOffset * 0.8)),
        Math.max(0, Math.min(1, hslUpper.l + lightnessOffset * 0.8))
      );
      upperHousingRef.current!.setColorAt(i, color);
    });

    if (lowerHousingRef.current.instanceColor) {
      lowerHousingRef.current.instanceColor.needsUpdate = true;
    }
    if (upperHousingRef.current.instanceColor) {
      upperHousingRef.current.instanceColor.needsUpdate = true;
    }
  }, [machinesSignature, colorVariationEnabled]);

  // Pre-calculate cull distance squared
  const cullDistSq = useMemo(
    () => getCullDistanceSquared(machineLodDistance),
    [machineLodDistance]
  );

  // Animate Rollers with distance culling
  useFrame((state) => {
    if (!rollersRef.current || !isTabVisible) return;
    if (quality === 'low') return; // Skip rollers on low
    if (!shouldRunThisFrame(2)) return;

    const cam = state.camera.position;

    machines.forEach((machine, i) => {
      // Distance-based culling
      const isVisible = isInstanceVisible(cam.x, cam.y, cam.z, machine.position, cullDistSq);

      const { width: w, height: h, depth: d } = MILL_SIZE;
      const x = machine.position[0];
      const y = machine.position[1] + h / 2;
      const z = machine.position[2];

      // If culled, hide rollers
      if (!isVisible) {
        [-0.25, 0, 0.25].forEach((_, pairIdx) => {
          const pairBaseIndex = (i * 3 + pairIdx) * 2;
          dummy.scale.set(0, 0, 0);
          dummy.updateMatrix();
          rollersRef.current!.setMatrixAt(pairBaseIndex, dummy.matrix);
          rollersRef.current!.setMatrixAt(pairBaseIndex + 1, dummy.matrix);
        });
        return;
      }

      const isRunning = machine.status === 'running';
      const rpm = isRunning ? machine.metrics.rpm || 1000 : 0;

      // 3 pairs of rollers -> 6 rollers total
      [-0.25, 0, 0.25].forEach((yOffset, pairIdx) => {
        const pairBaseIndex = (i * 3 + pairIdx) * 2;

        // Top Roller
        const angle = state.clock.elapsedTime * (rpm / 60) * Math.PI * 2;
        dummy.position.set(x, y - h * 0.1 + yOffset * h + 0.08, z + d * 0.35);
        dummy.scale.set(0.18, w * 0.75, 0.18);
        dummy.rotation.set(angle, 0, Math.PI / 2);
        dummy.updateMatrix();
        rollersRef.current!.setMatrixAt(pairBaseIndex, dummy.matrix);

        // Bottom Roller (Counter-rotating)
        dummy.position.set(x, y - h * 0.1 + yOffset * h - 0.08, z + d * 0.35);
        dummy.scale.set(0.16, w * 0.75, 0.16);
        dummy.rotation.set(-angle, 0, Math.PI / 2);
        dummy.updateMatrix();
        rollersRef.current!.setMatrixAt(pairBaseIndex + 1, dummy.matrix);
      });
    });
    rollersRef.current.instanceMatrix.needsUpdate = true;
  });

  const handleClick = (e: any, divisor: number) => {
    e.stopPropagation();
    const instanceId = e.instanceId!;
    const machineIndex = Math.floor(instanceId / divisor);
    if (machines[machineIndex]) {
      onSelect(machines[machineIndex]);
    }
  };

  return (
    <group>
      {/* Lower Housing */}
      <instancedMesh
        ref={lowerHousingRef}
        args={[geometries.box, MATERIALS.housingLower, count]}
        onClick={(e) => handleClick(e, 1)}
        receiveShadow
        castShadow
      />

      {/* Upper Housing */}
      <instancedMesh
        ref={upperHousingRef}
        args={[geometries.box, MATERIALS.housingUpper, count]}
        onClick={(e) => handleClick(e, 1)}
        receiveShadow
        castShadow
      />

      {/* Frame/Motor */}
      <instancedMesh
        ref={frameRef}
        args={[geometries.cylinder, MATERIALS.motor, count]}
        onClick={(e) => handleClick(e, 1)}
      />

      {/* Windows (3 per mill) */}
      <instancedMesh ref={windowRef} args={[PLANE_GEOMETRY, MATERIALS.window, count * 3]} />

      {/* Rollers (6 per mill) - Only on Medium+ */}
      {quality !== 'low' && (
        <instancedMesh ref={rollersRef} args={[geometries.cylinder, MATERIALS.roller, count * 6]} />
      )}

      {/* Status Rings at mill bases */}
      {quality !== 'low' &&
        machines.map((machine) => (
          <MemoizedStatusRing
            key={machine.id}
            status={machine.status as 'running' | 'idle' | 'warning' | 'critical'}
            radius={MILL_SIZE.width / 2}
            position={machine.position}
          />
        ))}
    </group>
  );
};
