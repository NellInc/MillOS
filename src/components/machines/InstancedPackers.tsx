import React, { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { MachineData } from '../../types';
import { useGraphicsStore } from '../../stores/graphicsStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useShallow } from 'zustand/react/shallow';
import { shouldRunThisFrame } from '../../utils/frameThrottle';
import {
  getPackerBoxGeometry,
  getPackerCylinderGeometry,
  isInstanceVisible,
  getCullDistanceSquared,
} from './MachineLOD';
import { useModelTextures } from '../../utils/machineTextures';
import { MemoizedStatusRing } from './StatusRing';
import { PROCEDURAL_TEXTURES, INSTANCED_MACHINE_MATERIALS } from '../../utils/sharedMaterials';

// Reference shared materials
const MATERIALS = {
  frame: INSTANCED_MACHINE_MATERIALS.packerFrame,
  hopper: INSTANCED_MACHINE_MATERIALS.packerHopper,
  spout: INSTANCED_MACHINE_MATERIALS.packerSpout,
  conveyor: INSTANCED_MACHINE_MATERIALS.packerConveyor,
  panel: INSTANCED_MACHINE_MATERIALS.packerPanel,
  safety: INSTANCED_MACHINE_MATERIALS.packerSafety,
  // Legacy fallback keeping inline for backwards compat
  _legacySafety: new THREE.MeshStandardMaterial({
    color: '#fbbf24',
    metalness: 0.3,
    roughness: 0.5,
    transparent: true,
    opacity: 0.9,
  }),
};

const PACKER_SIZE = { width: 4, height: 6, depth: 4 };

interface InstancedPackersProps {
  machines: MachineData[];
  onSelect: (machine: MachineData) => void;
}

export const InstancedPackers: React.FC<InstancedPackersProps> = ({ machines, onSelect }) => {
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
  const textures = useModelTextures('packer');

  // Apply textures to materials (external or procedural fallback)
  useEffect(() => {
    const roughnessMap = textures.roughness || PROCEDURAL_TEXTURES.brushedMetal;
    const normalMap = textures.normal || PROCEDURAL_TEXTURES.panelNormal;

    // Frame and hopper - brushed metal texture
    MATERIALS.frame.roughnessMap = roughnessMap;
    MATERIALS.frame.normalMap = normalMap;
    MATERIALS.frame.normalScale = new THREE.Vector2(0.3, 0.3);
    MATERIALS.frame.needsUpdate = true;
    MATERIALS.hopper.roughnessMap = roughnessMap;
    MATERIALS.hopper.normalMap = normalMap;
    MATERIALS.hopper.normalScale = new THREE.Vector2(0.3, 0.3);
    MATERIALS.hopper.needsUpdate = true;

    // Panel - control panel texture
    MATERIALS.panel.roughnessMap = textures.ao || PROCEDURAL_TEXTURES.brushedMetal;
    MATERIALS.panel.normalMap = normalMap;
    MATERIALS.panel.normalScale = new THREE.Vector2(0.15, 0.15);
    MATERIALS.panel.needsUpdate = true;

    // Spout and conveyor
    MATERIALS.spout.roughnessMap = roughnessMap;
    MATERIALS.spout.needsUpdate = true;
    MATERIALS.conveyor.normalMap = PROCEDURAL_TEXTURES.rubberNormal;
    MATERIALS.conveyor.normalScale = new THREE.Vector2(0.2, 0.2);
    MATERIALS.conveyor.needsUpdate = true;
  }, [textures]);

  // Refs
  const frameRef = useRef<THREE.InstancedMesh>(null);
  const hopperRef = useRef<THREE.InstancedMesh>(null);
  const spoutRef = useRef<THREE.InstancedMesh>(null);
  const conveyorRef = useRef<THREE.InstancedMesh>(null);
  const panelRef = useRef<THREE.InstancedMesh>(null);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const count = machines.length;

  // Quality-based LOD geometries
  const geometries = useMemo(
    () => ({
      box: getPackerBoxGeometry(quality),
      cylinder: getPackerCylinderGeometry(quality),
    }),
    [quality]
  );

  // Determine if machines list has structurally changed
  const machinesSignature = useMemo(() => machines.map((m) => m.id).join(','), [machines]);

  // Initialize Static Parts
  useEffect(() => {
    if (
      !frameRef.current ||
      !hopperRef.current ||
      !spoutRef.current ||
      !conveyorRef.current ||
      !panelRef.current
    )
      return;

    machines.forEach((machine, i) => {
      const { width: pw, height: ph, depth: pd } = PACKER_SIZE;
      const x = machine.position[0];
      const y = machine.position[1] + ph / 2;
      const z = machine.position[2];
      const rotY = machine.rotation; // Usually PI

      // Helper to set transform with machine rotation
      const setTransform = (
        ref: THREE.InstancedMesh,
        index: number,
        lx: number,
        ly: number,
        lz: number,
        sx: number,
        sy: number,
        sz: number,
        rx = 0,
        ry = 0,
        rz = 0
      ) => {
        // Rotate local position by machine rotation
        const cos = Math.cos(rotY);
        const sin = Math.sin(rotY);
        const wx = lx * cos - lz * sin;
        const wz = lx * sin + lz * cos;

        dummy.position.set(x + wx, y + ly, z + wz);
        dummy.scale.set(sx, sy, sz);
        dummy.rotation.set(rx, ry + rotY, rz);
        dummy.updateMatrix();
        ref.setMatrixAt(index, dummy.matrix);
      };

      // 1. Frame (Posts x4 + Top)
      // Posts
      [
        [-1, -1],
        [-1, 1],
        [1, -1],
        [1, 1],
      ].forEach(([dx, dz], idx) => {
        setTransform(
          frameRef.current!,
          i * 5 + idx,
          dx * pw * 0.45,
          0,
          dz * pd * 0.4,
          0.1,
          ph * 1.1,
          0.1
        );
      });
      // Top Frame
      setTransform(frameRef.current!, i * 5 + 4, 0, ph * 0.55, 0, pw * 0.95, 0.08, pd * 0.85);

      // 2. Hopper
      setTransform(hopperRef.current!, i, 0, ph * 0.35, 0, pw * 0.6, ph * 0.3, pd * 0.5);

      // 3. Spout
      setTransform(spoutRef.current!, i, 0, ph * 0.05, 0, 0.18, ph * 0.35, 0.18); // Cylinder scaled

      // 4. Conveyor
      setTransform(conveyorRef.current!, i, 0, -ph * 0.48, pd * 0.5, pw * 1.2, 0.08, pd * 0.8);

      // 5. Control Panel (Cabinet)
      setTransform(panelRef.current!, i, -pw * 0.55, 0, 0, 0.25, ph * 0.7, pd * 0.5);
    });

    frameRef.current.instanceMatrix.needsUpdate = true;
    hopperRef.current.instanceMatrix.needsUpdate = true;
    spoutRef.current.instanceMatrix.needsUpdate = true;
    conveyorRef.current.instanceMatrix.needsUpdate = true;
    panelRef.current.instanceMatrix.needsUpdate = true;
  }, [machinesSignature, dummy]);

  // Apply per-instance color variation (medium+ quality)
  useEffect(() => {
    if (!colorVariationEnabled || !frameRef.current || !hopperRef.current) return;

    const color = new THREE.Color();
    const baseFrame = new THREE.Color('#f97316'); // Match MATERIALS.frame (orange)
    const baseHopper = new THREE.Color('#94a3b8'); // Match MATERIALS.hopper

    machines.forEach((machine, i) => {
      // Deterministic variation from machine ID
      const seed = machine.id.charCodeAt(machine.id.length - 1);
      const lightnessOffset = ((seed % 10) - 5) * 0.01;
      const saturationOffset = ((seed % 5) - 2) * 0.005;

      // Frame (5 parts per packer - posts + top)
      const hslFrame = { h: 0, s: 0, l: 0 };
      baseFrame.getHSL(hslFrame);
      color.setHSL(
        hslFrame.h,
        Math.max(0, Math.min(1, hslFrame.s + saturationOffset)),
        Math.max(0, Math.min(1, hslFrame.l + lightnessOffset))
      );
      for (let j = 0; j < 5; j++) {
        frameRef.current!.setColorAt(i * 5 + j, color);
      }

      // Hopper
      const hslHopper = { h: 0, s: 0, l: 0 };
      baseHopper.getHSL(hslHopper);
      color.setHSL(
        hslHopper.h,
        Math.max(0, Math.min(1, hslHopper.s + saturationOffset)),
        Math.max(0, Math.min(1, hslHopper.l + lightnessOffset))
      );
      hopperRef.current!.setColorAt(i, color);
    });

    if (frameRef.current.instanceColor) {
      frameRef.current.instanceColor.needsUpdate = true;
    }
    if (hopperRef.current.instanceColor) {
      hopperRef.current.instanceColor.needsUpdate = true;
    }
  }, [machinesSignature, colorVariationEnabled]);

  // Pre-calculate cull distance squared
  const cullDistSq = useMemo(
    () => getCullDistanceSquared(machineLodDistance),
    [machineLodDistance]
  );

  // Animation (Simple vibration if needed, otherwise static)
  // Packers have rhythmic motion in original code - apply only to Spout.
  // Now includes distance-based culling.

  useFrame((state) => {
    if (!spoutRef.current || !isTabVisible) return;
    if (!shouldRunThisFrame(2) || quality === 'low') return;

    const time = state.clock.elapsedTime;
    const cam = state.camera.position;

    machines.forEach((machine, i) => {
      // Distance-based culling
      const isVisible = isInstanceVisible(cam.x, cam.y, cam.z, machine.position, cullDistSq);

      if (!isVisible) {
        // Cull spout by setting scale to 0
        dummy.scale.set(0, 0, 0);
        dummy.updateMatrix();
        spoutRef.current!.setMatrixAt(i, dummy.matrix);
        return;
      }

      if (machine.status !== 'running') return;

      const { height: ph } = PACKER_SIZE;
      const cycle = Math.sin(time * 15) * 0.05;

      // Re-calculate spout position with offset
      const x = machine.position[0];
      const y = machine.position[1] + ph / 2;
      const z = machine.position[2];

      dummy.position.set(x, y + ph * 0.05 + cycle, z);
      dummy.scale.set(0.18, ph * 0.35, 0.18);
      dummy.rotation.set(0, machine.rotation, 0);
      dummy.updateMatrix();
      spoutRef.current!.setMatrixAt(i, dummy.matrix);
    });
    spoutRef.current.instanceMatrix.needsUpdate = true;
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
      {/* Frame (5 parts) */}
      <instancedMesh
        ref={frameRef}
        args={[geometries.box, MATERIALS.frame, count * 5]}
        onClick={(e) => handleClick(e, 5)}
        castShadow
      />

      {/* Hopper */}
      <instancedMesh
        ref={hopperRef}
        args={[geometries.box, MATERIALS.hopper, count]}
        onClick={(e) => handleClick(e, 1)}
      />

      {/* Spout (Animated) */}
      <instancedMesh ref={spoutRef} args={[geometries.cylinder, MATERIALS.spout, count]} />

      {/* Conveyor */}
      <instancedMesh ref={conveyorRef} args={[geometries.box, MATERIALS.conveyor, count]} />

      {/* Control Panel */}
      <instancedMesh
        ref={panelRef}
        args={[geometries.box, MATERIALS.panel, count]}
        onClick={(e) => handleClick(e, 1)}
      />

      {/* Status Rings at packer bases */}
      {quality !== 'low' &&
        machines.map((machine) => (
          <MemoizedStatusRing
            key={machine.id}
            status={machine.status as 'running' | 'idle' | 'warning' | 'critical'}
            radius={PACKER_SIZE.width / 2}
            position={machine.position}
          />
        ))}
    </group>
  );
};
