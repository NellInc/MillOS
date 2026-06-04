import React, { useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { MachineData, MachineType } from '../types';
import { audioManager } from '../utils/audioManager';
import { PIPE_MATERIALS } from '../utils/sharedMaterials';
import { shouldRunThisFrame } from '../utils/frameThrottle';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { POLYGON_OFFSET } from '../constants/renderLayers';

export const SpoutingSystem = React.memo<{
  machines: MachineData[];
  enableAudio?: boolean;
}>(({ machines, enableAudio = true }) => {
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);
  // Extract stable machine data to prevent unnecessary re-renders
  // Only recompute when machine IDs or positions actually change
  const machineKey = useMemo(() => {
    return machines
      .filter((m) =>
        [
          MachineType.SILO,
          MachineType.ROLLER_MILL,
          MachineType.PLANSIFTER,
          MachineType.PACKER,
        ].includes(m.type)
      )
      .map((m) => `${m.id}:${m.position.join(',')}:${m.size.join(',')}`)
      .join('|');
  }, [machines]);

  // Calculate spouting sound positions (midpoints of key pipe connections)
  const spoutPositions = useMemo(() => {
    const positions: { id: string; x: number; y: number; z: number }[] = [];
    const silos = machines.filter((m) => m.type === MachineType.SILO);
    const mills = machines.filter((m) => m.type === MachineType.ROLLER_MILL);
    const sifters = machines.filter((m) => m.type === MachineType.PLANSIFTER);

    // Add sound positions at key pipe junctions
    mills.forEach((mill, i) => {
      const silo = silos[i % silos.length];
      if (silo) {
        positions.push({
          id: `spout-silo-mill-${i}`,
          x: (silo.position[0] + mill.position[0]) / 2,
          y: 8,
          z: (silo.position[2] + mill.position[2]) / 2,
        });
      }
    });

    sifters.forEach((sifter, i) => {
      positions.push({
        id: `spout-sifter-${i}`,
        x: sifter.position[0],
        y: sifter.position[1],
        z: sifter.position[2],
      });
    });

    return positions;
  }, [machineKey]); // Use stable key instead of full machines array

  // Start spouting sounds on mount
  useEffect(() => {
    if (!enableAudio) return;
    spoutPositions.forEach((pos) => {
      audioManager.startSpoutingSound(pos.id, pos.x, pos.y, pos.z);
    });

    return () => {
      spoutPositions.forEach((pos) => {
        audioManager.stopSpoutingSound(pos.id);
      });
    };
  }, [enableAudio, spoutPositions]);

  // Update spatial audio volumes each frame
  useFrame(() => {
    if (!enableAudio) return;
    if (!isTabVisible) return;
    // Spatial volume is fine at ~30fps; throttle to reduce per-frame audio work
    if (!shouldRunThisFrame(2)) return;

    spoutPositions.forEach((pos) => {
      audioManager.updateSpoutingSpatialVolume(pos.id);
    });
  });

  const pipeData = useMemo(() => {
    const pipeElements: React.ReactNode[] = [];
    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.MeshStandardMaterial[] = [];
    const tubeRadius = 0.18;

    const silos = machines.filter((m) => m.type === MachineType.SILO);
    const mills = machines.filter((m) => m.type === MachineType.ROLLER_MILL);
    const sifters = machines.filter((m) => m.type === MachineType.PLANSIFTER);
    const packers = machines.filter((m) => m.type === MachineType.PACKER);

    const createConnection = (
      start: THREE.Vector3,
      end: THREE.Vector3,
      key: string,
      color: string = '#94a3b8'
    ) => {
      const mid1 = start.clone().lerp(end, 0.25);
      mid1.y = Math.max(start.y, end.y) + 5;
      const mid2 = start.clone().lerp(end, 0.75);
      mid2.y = Math.max(start.y, end.y) + 5;

      const curve = new THREE.CatmullRomCurve3([start, mid1, mid2, end]);
      const geometry = new THREE.TubeGeometry(curve, 32, tubeRadius, 12, false);
      const material = new THREE.MeshStandardMaterial({
        color,
        metalness: 0.85,
        roughness: 0.15,
      });

      // Generate Flanges (Industrial detail)
      const flangeElements: React.ReactNode[] = [];
      const length = curve.getLength();
      // Flange every 6 units
      const flangeCount = Math.floor(length / 6);

      if (flangeCount > 0) {
        // Flange outer radius slightly larger than tube, with small radial offset to prevent z-fighting
        const flangeOuterRadius = tubeRadius + 0.08; // Slightly larger gap from tube surface
        // Reuse geometry/material for this pipe's flanges
        const flangeGeo = new THREE.CylinderGeometry(
          flangeOuterRadius,
          flangeOuterRadius,
          0.12,
          12
        );
        const flangeMat = new THREE.MeshStandardMaterial({
          color: '#64748b',
          metalness: 0.9,
          roughness: 0.3,
          // Enable polygon offset to prevent z-fighting with tube surface
          polygonOffset: true,
          polygonOffsetFactor: POLYGON_OFFSET.exteriorBase.factor,
          polygonOffsetUnits: POLYGON_OFFSET.exteriorBase.units,
        });

        geometries.push(flangeGeo);
        materials.push(flangeMat);

        const dummy = new THREE.Object3D();

        for (let f = 1; f < flangeCount; f++) {
          const t = f / flangeCount;
          const pt = curve.getPointAt(t);
          const tan = curve.getTangentAt(t);

          dummy.position.copy(pt);
          dummy.lookAt(pt.clone().add(tan));
          dummy.rotateX(Math.PI / 2);

          flangeElements.push(
            <mesh
              key={`${key}-flange-${f}`}
              position={[pt.x, pt.y, pt.z]}
              quaternion={dummy.quaternion}
              geometry={flangeGeo}
              material={flangeMat}
              castShadow
            />
          );
        }
      }

      geometries.push(geometry);
      materials.push(material);

      return (
        <group key={key}>
          <mesh geometry={geometry} material={material} castShadow />
          {flangeElements}
        </group>
      );
    };

    // Silos to Mills (grain flow)
    mills.forEach((mill, i) => {
      const silo = silos[i % silos.length];
      if (!silo) return;
      const start = new THREE.Vector3(silo.position[0], 3, silo.position[2]);
      const end = new THREE.Vector3(
        mill.position[0],
        mill.position[1] + mill.size[1] + 1.5,
        mill.position[2]
      );
      pipeElements.push(createConnection(start, end, `pipe-s-m-${i}`, '#64748b'));
    });

    // Mills to Sifters (pneumatic lift)
    mills.forEach((mill, i) => {
      const sifter = sifters[i % sifters.length];
      if (!sifter) return;
      const start = new THREE.Vector3(
        mill.position[0],
        mill.position[1] + mill.size[1],
        mill.position[2]
      );
      // Use deterministic offset based on index instead of random (prevents pipes jumping on re-render)
      const offsetX = ((i % 3) - 1) * 1.5; // -1.5, 0, or 1.5 based on index
      const end = new THREE.Vector3(
        sifter.position[0] + offsetX,
        sifter.position[1] + sifter.size[1] / 2,
        sifter.position[2]
      );
      pipeElements.push(createConnection(start, end, `pipe-m-s-${i}`, '#cbd5e1'));
    });

    // Sifters to Packers
    packers.forEach((packer, i) => {
      const sifter = sifters[i % sifters.length];
      if (!sifter) return;
      const start = new THREE.Vector3(
        sifter.position[0],
        sifter.position[1] - 2,
        sifter.position[2]
      );
      const end = new THREE.Vector3(
        packer.position[0],
        packer.position[1] + packer.size[1] + 1,
        packer.position[2]
      );
      pipeElements.push(createConnection(start, end, `pipe-s-p-${i}`, '#e2e8f0'));
    });

    return { pipeElements, geometries, materials };
  }, [machineKey]); // Use stable key instead of full machines array

  // Dispose geometries and materials on unmount or when dependencies change
  useEffect(() => {
    return () => {
      pipeData.geometries.forEach((geometry) => geometry.dispose());
      pipeData.materials.forEach((material) => material.dispose());
    };
  }, [pipeData]);

  return (
    <group>
      {pipeData.pipeElements}
      {/* Pipe supports */}
      <PipeSupports />
    </group>
  );
});

// Pipe support positions (static, defined at module level)
const PIPE_SUPPORT_POSITIONS: [number, number, number][] = [
  [-15, 10, -12],
  [0, 10, -12],
  [15, 10, -12],
  [-10, 12, 0],
  [10, 12, 0],
  [-8, 10, 10],
  [8, 10, 10],
];

const PipeSupports: React.FC = React.memo(() => {
  return (
    <group>
      {PIPE_SUPPORT_POSITIONS.map((pos, i) => (
        <group key={i} position={pos}>
          {/* Vertical support - main structure gets shadows */}
          <mesh castShadow>
            <cylinderGeometry args={[0.1, 0.1, pos[1] * 2]} />
            <primitive object={PIPE_MATERIALS.supportGray} attach="material" />
          </mesh>
          {/* Cross beam - offset slightly on Y axis to prevent z-fighting with vertical support */}
          <mesh position={[0, 0.02, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.08, 0.08, 3]} />
            <primitive object={PIPE_MATERIALS.supportSlate} attach="material" />
          </mesh>
        </group>
      ))}
    </group>
  );
});
