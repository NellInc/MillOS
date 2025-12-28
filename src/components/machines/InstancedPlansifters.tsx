import React, { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { MachineData } from '../../types';
import { useGraphicsStore } from '../../stores/graphicsStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useShallow } from 'zustand/react/shallow';
import { shouldRunThisFrame } from '../../utils/frameThrottle';
import {
  getPlansifterBoxGeometry,
  getPlansifterCylinderGeometry,
  isInstanceVisible,
  getCullDistanceSquared,
} from './MachineLOD';
import { useModelTextures } from '../../utils/machineTextures';
import { MemoizedStatusRing } from './StatusRing';
import { PROCEDURAL_TEXTURES, NORMAL_SCALES, INSTANCED_MACHINE_MATERIALS } from '../../utils/sharedMaterials';

// Reference shared materials (textures applied via hook)
const MATERIALS = {
  frame: INSTANCED_MACHINE_MATERIALS.sifterFrame,
  body: INSTANCED_MACHINE_MATERIALS.sifterBody,
  darkMetal: INSTANCED_MACHINE_MATERIALS.sifterDarkMetal,
  flywheel: INSTANCED_MACHINE_MATERIALS.sifterFlywheel,
  cable: INSTANCED_MACHINE_MATERIALS.sifterCable,
};

const SIFTER_SIZE = { width: 7, height: 7, depth: 7 };

interface InstancedPlansiftersProps {
  machines: MachineData[];
  onSelect: (machine: MachineData) => void;
}

export const InstancedPlansifters: React.FC<InstancedPlansiftersProps> = ({
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
  const textures = useModelTextures('plansifter');

  // Apply textures to materials (external or procedural fallback)
  useEffect(() => {
    const roughnessMap = textures.roughness || PROCEDURAL_TEXTURES.brushedMetal;
    const normalMap = textures.normal || PROCEDURAL_TEXTURES.panelNormal;

    // Body - cream sifter box
    MATERIALS.body.roughnessMap = roughnessMap;
    MATERIALS.body.normalMap = normalMap;
    MATERIALS.body.normalScale = NORMAL_SCALES.medium;
    MATERIALS.body.needsUpdate = true;

    // Frame - dark metal
    MATERIALS.frame.roughnessMap = roughnessMap;
    MATERIALS.frame.normalMap = normalMap;
    MATERIALS.frame.normalScale = NORMAL_SCALES.standard;
    MATERIALS.frame.needsUpdate = true;

    // Flywheel
    MATERIALS.flywheel.roughnessMap = textures.ao || PROCEDURAL_TEXTURES.brushedMetal;
    MATERIALS.flywheel.normalMap = normalMap;
    MATERIALS.flywheel.normalScale = NORMAL_SCALES.high;
    MATERIALS.flywheel.needsUpdate = true;
  }, [textures]);

  // Refs
  const frameRef = useRef<THREE.InstancedMesh>(null); // Static Ceiling Frame
  const bodyRef = useRef<THREE.InstancedMesh>(null); // Oscillating Sifter Body
  const flywheelRef = useRef<THREE.InstancedMesh>(null); // Rotating/Oscillating Flywheel
  const hangersRef = useRef<THREE.InstancedMesh>(null); // Hanger Rods (Attached to body for now)

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const count = machines.length;

  // Quality-based LOD geometries
  const geometries = useMemo(
    () => ({
      box: getPlansifterBoxGeometry(quality),
      cylinder: getPlansifterCylinderGeometry(quality),
    }),
    [quality]
  );

  // Determine if machines list has structurally changed
  const machinesSignature = useMemo(() => machines.map((m) => m.id).join(','), [machines]);

  // Initialize Static Parts (Frame)
  useEffect(() => {
    if (!frameRef.current) return;

    machines.forEach((machine, i) => {
      const { width: w, height: h, depth: d } = SIFTER_SIZE;
      const x = machine.position[0];
      const y = machine.position[1] + h / 2;
      const z = machine.position[2];

      // Ceiling Frame (Simple I-beam representation)
      dummy.position.set(x, y + h * 0.65, z);
      dummy.scale.set(w * 1.4, 0.2, d * 0.8);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      frameRef.current!.setMatrixAt(i, dummy.matrix);
    });

    frameRef.current.instanceMatrix.needsUpdate = true;
  }, [machinesSignature, dummy]);

  // Apply per-instance color variation (medium+ quality)
  useEffect(() => {
    if (!colorVariationEnabled || !bodyRef.current || !frameRef.current) return;

    const color = new THREE.Color();
    const baseBody = new THREE.Color('#f5f0e6'); // Match MATERIALS.body (cream)
    const baseFrame = new THREE.Color('#1f2937'); // Match MATERIALS.frame (dark)

    machines.forEach((machine, i) => {
      // Deterministic variation from machine ID
      const seed = machine.id.charCodeAt(machine.id.length - 1);
      const lightnessOffset = ((seed % 10) - 5) * 0.01;
      const saturationOffset = ((seed % 5) - 2) * 0.005;

      // Body (cream colored sifter box)
      const hslBody = { h: 0, s: 0, l: 0 };
      baseBody.getHSL(hslBody);
      color.setHSL(
        hslBody.h,
        Math.max(0, Math.min(1, hslBody.s + saturationOffset)),
        Math.max(0, Math.min(1, hslBody.l + lightnessOffset))
      );
      bodyRef.current!.setColorAt(i, color);

      // Frame (dark ceiling mount)
      const hslFrame = { h: 0, s: 0, l: 0 };
      baseFrame.getHSL(hslFrame);
      color.setHSL(
        hslFrame.h,
        Math.max(0, Math.min(1, hslFrame.s + saturationOffset)),
        Math.max(0, Math.min(1, hslFrame.l + lightnessOffset * 0.5))
      );
      frameRef.current!.setColorAt(i, color);
    });

    if (bodyRef.current.instanceColor) {
      bodyRef.current.instanceColor.needsUpdate = true;
    }
    if (frameRef.current.instanceColor) {
      frameRef.current.instanceColor.needsUpdate = true;
    }
  }, [machinesSignature, colorVariationEnabled]);

  // Pre-calculate cull distance squared
  const cullDistSq = useMemo(
    () => getCullDistanceSquared(machineLodDistance),
    [machineLodDistance]
  );

  // Animate Dynamic Parts with distance culling
  useFrame((state) => {
    if (!bodyRef.current || !flywheelRef.current || !hangersRef.current || !isTabVisible) return;
    if (!shouldRunThisFrame(quality === 'low' ? 4 : 2)) return;

    const time = state.clock.elapsedTime;
    const cam = state.camera.position;

    machines.forEach((machine, i) => {
      // Distance-based culling
      const isVisible = isInstanceVisible(cam.x, cam.y, cam.z, machine.position, cullDistSq);

      const { width: w, height: h, depth: d } = SIFTER_SIZE;

      if (!isVisible) {
        // Cull by setting scale to 0
        dummy.scale.set(0, 0, 0);
        dummy.updateMatrix();
        bodyRef.current!.setMatrixAt(i, dummy.matrix);

        // Cull hangers
        for (let j = 0; j < 4; j++) {
          hangersRef.current!.setMatrixAt(i * 4 + j, dummy.matrix);
        }

        // Cull flywheel
        if (quality !== 'low') {
          flywheelRef.current!.setMatrixAt(i, dummy.matrix);
        }
        return;
      }

      const isRunning = machine.status === 'running';
      const rpmFactor = 1;
      const vibIntensity = 1;

      // Oscillation Calculation
      let offsetX = 0;
      let offsetZ = 0;
      let rotX = 0;
      let rotZ = 0;

      if (isRunning) {
        const intensity = 0.04 + rpmFactor * 0.03;
        const speed = 12 + rpmFactor * 8;
        offsetX = Math.cos(time * speed) * intensity;
        offsetZ = Math.sin(time * speed) * intensity;
        rotX = Math.sin(time * speed * 0.5) * 0.003 * vibIntensity;
        rotZ = Math.cos(time * speed * 0.5) * 0.003 * vibIntensity;
      }

      const x = machine.position[0] + offsetX;
      const y = machine.position[1] + h / 2;
      const z = machine.position[2] + offsetZ;

      // 1. Sifter Body (Main Box)
      dummy.position.set(x, y, z);
      dummy.scale.set(w, h * 0.85, d * 0.9);
      dummy.rotation.set(rotX, 0, rotZ);
      dummy.updateMatrix();
      bodyRef.current!.setMatrixAt(i, dummy.matrix);

      // 2. Hanger Rods (4 per machine)
      const hangerOffset = w * 0.4;
      [1, -1].forEach((hx, hi) => {
        [1, -1].forEach((hz, zi) => {
          const hangerIdx = i * 4 + (hi * 2 + zi);
          dummy.position.set(x + hx * hangerOffset, y + h * 0.35, z + hz * hangerOffset);
          dummy.scale.set(0.05, h * 0.6, 0.05);
          dummy.rotation.set(rotX, 0, rotZ);
          dummy.updateMatrix();
          hangersRef.current!.setMatrixAt(hangerIdx, dummy.matrix);
        });
      });

      // 3. Flywheel (Rotating)
      if (quality !== 'low') {
        const flywheelSpeed = 10;
        const flyAngle = isRunning ? time * flywheelSpeed : 0;

        dummy.position.set(x, y - h * 0.15, z - d * 0.48);
        dummy.scale.set(h * 0.3, 0.15, h * 0.3);
        dummy.rotation.set(Math.PI / 2 + rotX, flyAngle, rotZ);
        dummy.updateMatrix();
        flywheelRef.current!.setMatrixAt(i, dummy.matrix);
      }
    });

    bodyRef.current.instanceMatrix.needsUpdate = true;
    hangersRef.current.instanceMatrix.needsUpdate = true;
    if (flywheelRef.current) flywheelRef.current.instanceMatrix.needsUpdate = true;
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
      {/* Ceiling Frame (Static) */}
      <instancedMesh
        ref={frameRef}
        args={[geometries.box, MATERIALS.frame, count]}
        castShadow
        receiveShadow
      />

      {/* Main Body (Oscillating) */}
      <instancedMesh
        ref={bodyRef}
        args={[geometries.box, MATERIALS.body, count]}
        onClick={(e) => handleClick(e, 1)}
        castShadow
        receiveShadow
      />

      {/* Hanger Rods (4 per machine) */}
      <instancedMesh ref={hangersRef} args={[geometries.cylinder, MATERIALS.cable, count * 4]} />

      {/* Flywheel (Only Medium+) */}
      {quality !== 'low' && (
        <instancedMesh ref={flywheelRef} args={[geometries.cylinder, MATERIALS.flywheel, count]} />
      )}

      {/* Status Rings at plansifter bases */}
      {quality !== 'low' &&
        machines.map((machine) => (
          <MemoizedStatusRing
            key={machine.id}
            status={machine.status as 'running' | 'idle' | 'warning' | 'critical'}
            radius={SIFTER_SIZE.width / 2}
            position={machine.position}
          />
        ))}
    </group>
  );
};
