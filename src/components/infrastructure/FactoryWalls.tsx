import React, { useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Instances, Instance } from '@react-three/drei';
import { SceneText as Text } from '../shared/SceneText';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useSafetyStore } from '../../stores/safetyStore';
import { useGraphicsStore } from '../../stores/graphicsStore';
import { PROCEDURAL_TEXTURES } from '../../utils/sharedMaterials';
import { POLYGON_OFFSET } from '../../constants/renderLayers';

interface FactoryWallsProps {
  floorWidth: number;
  floorDepth: number;
}

// === SHARED GEOMETRIES (module-level singletons for instancing) ===
const pillarGeometry = new THREE.CylinderGeometry(0.08, 0.08, 3, 12);
const benchLegGeometry = new THREE.BoxGeometry(0.1, 0.4, 0.4);
const tableLegGeometry = new THREE.BoxGeometry(0.08, 0.7, 0.08);
const vendingButtonGeometry = new THREE.CircleGeometry(0.03, 8);
const hourMarkerGeometry = new THREE.BoxGeometry(0.02, 0.06, 0.01);
const lockerHandleGeometry = new THREE.BoxGeometry(0.05, 0.15, 0.05);
const lockerSupportGeometry = new THREE.BoxGeometry(0.08, 0.35, 0.35);
const coatHookGeometry = new THREE.CylinderGeometry(0.02, 0.02, 0.15, 8);
const stallBackWallGeometry = new THREE.BoxGeometry(0.05, 2, 1.4);
const stallDividerGeometry = new THREE.BoxGeometry(1.5, 2, 0.05);
const toiletBaseGeometry = new THREE.BoxGeometry(0.5, 0.5, 0.6);
const toiletTankGeometry = new THREE.BoxGeometry(0.15, 0.5, 0.45);
const stallDoorGeometry = new THREE.BoxGeometry(0.05, 1.8, 0.8);
const doorHandleGeometry = new THREE.BoxGeometry(0.04, 0.12, 0.06);
const sinkBasinGeometry = new THREE.CylinderGeometry(0.25, 0.2, 0.15, 16);
const faucetVerticalGeometry = new THREE.BoxGeometry(0.08, 0.25, 0.08);
const faucetHorizontalGeometry = new THREE.BoxGeometry(0.2, 0.06, 0.06);

// === SHARED MATERIALS (module-level singletons for instancing) ===
const metalGrayMaterial = new THREE.MeshBasicMaterial({ color: '#64748b' });
const darkMetalMaterial = new THREE.MeshBasicMaterial({ color: '#1e293b' });
const whiteMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff' });
const lightGrayMaterial = new THREE.MeshBasicMaterial({ color: '#94a3b8' });
const vendingButtonMaterial = new THREE.MeshStandardMaterial({
  color: '#22c55e',
  emissive: '#22c55e',
  emissiveIntensity: 0.3,
});

// Personnel door with frame, signage, and push bar - 50% smaller, bottom at floor level
const PersonnelDoor: React.FC<{
  position: [number, number, number];
  rotation?: number;
  label?: string;
  isEmergencyExit?: boolean;
}> = React.memo(({ position, rotation = 0, label = 'ENTRANCE', isEmergencyExit = false }) => {
  // Door dimensions - 50% of original (frame was 3 tall, now 1.5)
  const frameHeight = 1.5;
  const frameWidth = 0.9;
  const doorHeight = 1.2;
  const doorWidth = 0.5;

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Door frame - structural surround - bottom at y=0 */}
      <mesh position={[0, frameHeight / 2, 0]} castShadow>
        <boxGeometry args={[frameWidth, frameHeight, 0.15]} />
        <meshBasicMaterial color="#374151" />
      </mesh>

      {/* Door recess */}
      <mesh position={[0, doorHeight / 2, 0.05]}>
        <boxGeometry args={[0.6, 1.3, 0.1]} />
        <meshBasicMaterial color="#1f2937" />
      </mesh>

      {/* Door panel - bottom at floor level */}
      <mesh position={[0, doorHeight / 2, 0.1]} castShadow>
        <boxGeometry args={[doorWidth, doorHeight, 0.04]} />
        <meshStandardMaterial
          color={isEmergencyExit ? '#dc2626' : '#475569'}
          roughness={0.5}
          metalness={0.3}
        />
      </mesh>

      {/* Door window (upper portion) */}
      <mesh position={[0, doorHeight * 0.75, 0.125]}>
        <boxGeometry args={[0.3, 0.4, 0.01]} />
        <meshBasicMaterial color="#1e3a5f" transparent opacity={0.7} />
      </mesh>

      {/* Push bar (crash bar for emergency exits) */}
      <mesh position={[0, doorHeight * 0.4, 0.14]}>
        <boxGeometry args={[0.35, 0.04, 0.03]} />
        <meshBasicMaterial color={isEmergencyExit ? '#fbbf24' : '#94a3b8'} />
      </mesh>

      {/* Door handle */}
      <mesh position={[0.18, doorHeight * 0.5, 0.14]}>
        <boxGeometry args={[0.04, 0.08, 0.03]} />
        <meshBasicMaterial color="#64748b" />
      </mesh>

      {/* Sign above door */}
      <mesh position={[0, frameHeight + 0.12, 0.08]}>
        <boxGeometry args={[0.7, 0.18, 0.025]} />
        <meshBasicMaterial color={isEmergencyExit ? '#dc2626' : '#1e40af'} />
      </mesh>
      <Text
        position={[0, frameHeight + 0.12, 0.1]}
        fontSize={0.08}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
      >
        {label}
      </Text>

      {/* Emergency exit light (if emergency exit) */}
      {isEmergencyExit && (
        <mesh position={[0, frameHeight + 0.25, 0.05]}>
          <boxGeometry args={[0.3, 0.1, 0.05]} />
          <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={0.5} />
        </mesh>
      )}

      {/* Floor mat - raised with depthWrite to prevent z-fighting */}
      <mesh position={[0, 0.06, 0.3]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.6, 0.4]} />
        <meshBasicMaterial
          color="#1f2937"
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET.standard.factor}
          polygonOffsetUnits={POLYGON_OFFSET.standard.units}
        />
      </mesh>

      {/* Threshold */}
      <mesh position={[0, 0.015, 0]}>
        <boxGeometry args={[0.6, 0.03, 0.15]} />
        <meshBasicMaterial color="#64748b" />
      </mesh>
    </group>
  );
});

// Break Room component - with instanced pillars, bench legs, table legs, and vending buttons
const BreakRoom: React.FC<{ position: [number, number, number] }> = React.memo(({ position }) => {
  const pillarsRef = useRef<THREE.InstancedMesh>(null);
  const benchLegsRef = useRef<THREE.InstancedMesh>(null);
  const tableLegsRef = useRef<THREE.InstancedMesh>(null);
  const vendingButtonsRef = useRef<THREE.InstancedMesh>(null);

  const pillarPositions = useMemo(
    () =>
      [
        [-2.7, 1.5, -2.2],
        [-2.7, 1.5, 2.2],
        [2.7, 1.5, -2.2],
        [2.7, 1.5, 2.2],
      ] as const,
    []
  );

  const benchLegPositions = useMemo(
    () =>
      [
        [-1.5, 0.2, 1.5],
        [1.5, 0.2, 1.5],
      ] as const,
    []
  );

  const tableLegPositions = useMemo(
    () =>
      [
        [-1, 0.35, -0.9],
        [-1, 0.35, -0.1],
        [1, 0.35, -0.9],
        [1, 0.35, -0.1],
      ] as const,
    []
  );

  const vendingButtonYPositions = useMemo(() => [0.6, 0.7, 0.8] as const, []);

  useEffect(() => {
    const matrix = new THREE.Matrix4();

    if (pillarsRef.current) {
      pillarPositions.forEach(([x, y, z], i) => {
        matrix.setPosition(x, y, z);
        pillarsRef.current!.setMatrixAt(i, matrix);
      });
      pillarsRef.current.instanceMatrix.needsUpdate = true;
    }

    if (benchLegsRef.current) {
      benchLegPositions.forEach(([x, y, z], i) => {
        matrix.setPosition(x, y, z);
        benchLegsRef.current!.setMatrixAt(i, matrix);
      });
      benchLegsRef.current.instanceMatrix.needsUpdate = true;
    }

    if (tableLegsRef.current) {
      tableLegPositions.forEach(([x, y, z], i) => {
        matrix.setPosition(x, y, z);
        tableLegsRef.current!.setMatrixAt(i, matrix);
      });
      tableLegsRef.current.instanceMatrix.needsUpdate = true;
    }

    if (vendingButtonsRef.current) {
      vendingButtonYPositions.forEach((y, i) => {
        matrix.setPosition(2.2, y, -1.19);
        vendingButtonsRef.current!.setMatrixAt(i, matrix);
      });
      vendingButtonsRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [pillarPositions, benchLegPositions, tableLegPositions, vendingButtonYPositions]);

  return (
    <group position={position}>
      {/* Floor/platform - raised with depthWrite to prevent z-fighting */}
      <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[6, 5]} />
        <meshBasicMaterial
          color="#22c55e"
          transparent
          opacity={0.15}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET.standard.factor}
          polygonOffsetUnits={POLYGON_OFFSET.standard.units}
        />
      </mesh>

      {/* Shelter roof */}
      <mesh position={[0, 3, 0]} castShadow receiveShadow>
        <boxGeometry args={[6, 0.15, 5]} />
        <meshBasicMaterial color="#334155" />
      </mesh>

      {/* Support pillars - INSTANCED (4 pillars -> 1 draw call) */}
      <instancedMesh ref={pillarsRef} args={[pillarGeometry, metalGrayMaterial, 4]} castShadow />

      {/* Bench top */}
      <mesh position={[0, 0.4, 1.5]} castShadow>
        <boxGeometry args={[4, 0.08, 0.5]} />
        <meshBasicMaterial color="#78350f" />
      </mesh>

      {/* Bench legs - INSTANCED (2 legs -> 1 draw call) */}
      <instancedMesh
        ref={benchLegsRef}
        args={[benchLegGeometry, metalGrayMaterial, 2]}
        castShadow
      />

      {/* Table top */}
      <mesh position={[0, 0.7, -0.5]} castShadow>
        <boxGeometry args={[2.5, 0.06, 1.2]} />
        <meshBasicMaterial color="#1e293b" />
      </mesh>

      {/* Table legs - INSTANCED (4 legs -> 1 draw call) */}
      <instancedMesh
        ref={tableLegsRef}
        args={[tableLegGeometry, darkMetalMaterial, 4]}
        castShadow
      />

      {/* Vending machine (simplified) */}
      <group position={[2.2, 0, -1.5]}>
        <mesh position={[0, 1, 0]} castShadow>
          <boxGeometry args={[0.8, 2, 0.6]} />
          <meshBasicMaterial color="#1e40af" />
        </mesh>
        {/* Screen - keep standard material for emissive */}
        <mesh position={[0, 1.2, 0.31]}>
          <planeGeometry args={[0.5, 0.4]} />
          <meshStandardMaterial color="#60a5fa" emissive="#60a5fa" emissiveIntensity={0.5} />
        </mesh>
      </group>

      {/* Vending buttons - INSTANCED (3 buttons -> 1 draw call) */}
      <instancedMesh
        ref={vendingButtonsRef}
        args={[vendingButtonGeometry, vendingButtonMaterial, 3]}
      />

      {/* Break room sign */}
      <group position={[0, 2.8, -2.3]}>
        <mesh>
          <boxGeometry args={[1.5, 0.4, 0.05]} />
          <meshBasicMaterial color="#22c55e" />
        </mesh>
      </group>

      {/* Wall clock */}
      <WallClock position={[-2.5, 2.2, -2.35]} />

      {/* Safety bulletin board with "Days Since Incident" */}
      <BulletinBoard position={[2.5, 1.8, -2.35]} />

      {/* Ambient light for break room */}
      <pointLight position={[0, 2.5, 0]} color="#fef3c7" intensity={0.5} distance={8} />
    </group>
  );
});

// Wall clock that syncs with game time - with instanced hour markers
// PERF FIX: Uses useFrame + refs instead of gameTime subscription to avoid re-renders
const WallClock: React.FC<{ position: [number, number, number] }> = React.memo(({ position }) => {
  const hourHandRef = useRef<THREE.Mesh>(null);
  const minuteHandRef = useRef<THREE.Mesh>(null);
  const hourMarkersRef = useRef<THREE.InstancedMesh>(null);

  const markerData = useMemo(() => {
    return Array.from({ length: 12 }).map((_, i) => {
      const angle = (i / 12) * Math.PI * 2;
      return {
        x: Math.sin(angle) * 0.28,
        y: Math.cos(angle) * 0.28,
        scaleY: i % 3 === 0 ? 1 : 0.5,
      };
    });
  }, []);

  useEffect(() => {
    if (!hourMarkersRef.current) return;
    const matrix = new THREE.Matrix4();

    markerData.forEach((marker, i) => {
      matrix.makeScale(1, marker.scaleY, 1);
      matrix.setPosition(marker.x, marker.y, 0.03);
      hourMarkersRef.current!.setMatrixAt(i, matrix);
    });
    hourMarkersRef.current.instanceMatrix.needsUpdate = true;
  }, [markerData]);

  // PERF FIX: Update hands via useFrame + getState() instead of subscription
  useFrame(() => {
    const gameTime = useGameSimulationStore.getState().gameTime;
    const hourAngle = (gameTime / 12) * Math.PI * 2 - Math.PI / 2;
    const minuteAngle = (((gameTime % 1) * 60) / 60) * Math.PI * 2 - Math.PI / 2;

    if (hourHandRef.current) {
      hourHandRef.current.position.x = Math.cos(hourAngle) * 0.1;
      hourHandRef.current.position.y = Math.sin(hourAngle) * 0.1;
      hourHandRef.current.rotation.z = -hourAngle;
    }
    if (minuteHandRef.current) {
      minuteHandRef.current.position.x = Math.cos(minuteAngle) * 0.12;
      minuteHandRef.current.position.y = Math.sin(minuteAngle) * 0.12;
      minuteHandRef.current.rotation.z = -minuteAngle;
    }
  });

  return (
    <group position={position}>
      {/* Clock face */}
      <mesh>
        <cylinderGeometry args={[0.35, 0.35, 0.05, 32]} />
        <meshBasicMaterial color="#f5f5f5" />
      </mesh>
      {/* Clock rim */}
      <mesh position={[0, 0, 0.03]}>
        <torusGeometry args={[0.35, 0.03, 8, 32]} />
        <meshBasicMaterial color="#1e293b" />
      </mesh>

      {/* Hour markers - INSTANCED (12 markers -> 1 draw call) */}
      <instancedMesh ref={hourMarkersRef} args={[hourMarkerGeometry, darkMetalMaterial, 12]} />

      {/* Hour hand */}
      <mesh ref={hourHandRef} position={[0, 0, 0.04]}>
        <boxGeometry args={[0.2, 0.025, 0.01]} />
        <meshBasicMaterial color="#1e293b" />
      </mesh>
      {/* Minute hand */}
      <mesh ref={minuteHandRef} position={[0, 0, 0.05]}>
        <boxGeometry args={[0.25, 0.015, 0.01]} />
        <meshBasicMaterial color="#374151" />
      </mesh>
      {/* Center cap */}
      <mesh position={[0, 0, 0.06]}>
        <cylinderGeometry args={[0.025, 0.025, 0.02, 16]} />
        <meshBasicMaterial color="#1e293b" />
      </mesh>
    </group>
  );
});

// Safety bulletin board with days since incident counter
const BulletinBoard: React.FC<{ position: [number, number, number] }> = React.memo(
  ({ position }) => {
    const daysSinceIncident = useSafetyStore((state) => state.safetyMetrics.daysSinceIncident);

    return (
      <group position={position}>
        {/* Board frame */}
        <mesh>
          <boxGeometry args={[1.2, 1, 0.08]} />
          <meshBasicMaterial color="#78350f" />
        </mesh>
        {/* Cork board surface */}
        <mesh position={[0, 0, 0.045]}>
          <planeGeometry args={[1.1, 0.9]} />
          <meshBasicMaterial color="#d4a574" />
        </mesh>
        {/* "SAFETY FIRST" header */}
        <mesh position={[0, 0.35, 0.05]}>
          <planeGeometry args={[0.9, 0.15]} />
          <meshBasicMaterial color="#22c55e" />
        </mesh>
        {/* Days counter display */}
        <group position={[0, 0, 0.05]}>
          {/* Counter background */}
          <mesh position={[0, 0, 0.01]}>
            <planeGeometry args={[0.8, 0.35]} />
            <meshBasicMaterial color="#1e293b" />
          </mesh>
          {/* Number display (simplified as glowing segments) */}
          <mesh position={[0, 0, 0.02]}>
            <planeGeometry args={[0.6, 0.25]} />
            <meshStandardMaterial
              color="#22c55e"
              emissive="#22c55e"
              emissiveIntensity={daysSinceIncident > 100 ? 1 : 0.5}
            />
          </mesh>
        </group>
        {/* "Days Without Incident" label */}
        <mesh position={[0, -0.28, 0.05]}>
          <planeGeometry args={[0.9, 0.12]} />
          <meshBasicMaterial color="#475569" />
        </mesh>
        {/* Push pins */}
        {[
          [-0.48, 0.38],
          [0.48, 0.38],
          [-0.48, -0.38],
          [0.48, -0.38],
        ].map(([x, y], i) => (
          <mesh key={i} position={[x, y, 0.06]}>
            <sphereGeometry args={[0.025, 8, 8]} />
            <meshBasicMaterial color={['#ef4444', '#eab308', '#22c55e', '#3b82f6'][i]} />
          </mesh>
        ))}
      </group>
    );
  }
);

// Locker Room component - with instanced handles, supports, and hooks
const LockerRoom: React.FC<{ position: [number, number, number] }> = React.memo(({ position }) => {
  const lockerHandlesRef = useRef<THREE.InstancedMesh>(null);
  const benchSupportsRef = useRef<THREE.InstancedMesh>(null);
  const coatHooksRef = useRef<THREE.InstancedMesh>(null);

  const lockerColors = useMemo(
    () => ['#3b82f6', '#22c55e', '#f97316', '#8b5cf6', '#ef4444', '#06b6d4'],
    []
  );

  const lockerXPositions = useMemo(() => [-3, -1.8, -0.6, 0.6, 1.8, 3] as const, []);

  const benchSupportPositions = useMemo(
    () =>
      [
        [-2.5, 0.175, -0.5],
        [2.5, 0.175, -0.5],
      ] as const,
    []
  );

  const coatHookZPositions = useMemo(() => [-1.2, -0.4, 0.4, 1.2] as const, []);

  useEffect(() => {
    const matrix = new THREE.Matrix4();

    if (lockerHandlesRef.current) {
      lockerXPositions.forEach((x, i) => {
        matrix.setPosition(x + 0.35, 1.2, -2.24);
        lockerHandlesRef.current!.setMatrixAt(i, matrix);
      });
      lockerHandlesRef.current.instanceMatrix.needsUpdate = true;
    }

    if (benchSupportsRef.current) {
      benchSupportPositions.forEach(([x, y, z], i) => {
        matrix.setPosition(x, y, z);
        benchSupportsRef.current!.setMatrixAt(i, matrix);
      });
      benchSupportsRef.current.instanceMatrix.needsUpdate = true;
    }

    if (coatHooksRef.current) {
      const rotation = new THREE.Euler(0, 0, Math.PI / 2);
      const quaternion = new THREE.Quaternion().setFromEuler(rotation);
      const scale = new THREE.Vector3(1, 1, 1);
      const pos = new THREE.Vector3();

      coatHookZPositions.forEach((z, i) => {
        pos.set(-3.9, 1.5, z);
        matrix.compose(pos, quaternion, scale);
        coatHooksRef.current!.setMatrixAt(i, matrix);
      });
      coatHooksRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [lockerXPositions, benchSupportPositions, coatHookZPositions]);

  return (
    <group position={position}>
      {/* Floor */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[8, 6]} />
        <meshBasicMaterial color="#374151" />
      </mesh>

      {/* Back wall */}
      <mesh position={[0, 1.5, -3]} receiveShadow castShadow>
        <boxGeometry args={[8, 3, 0.15]} />
        <meshBasicMaterial color="#475569" />
      </mesh>

      {/* Side walls */}
      <mesh position={[-4, 1.5, 0]} receiveShadow castShadow>
        <boxGeometry args={[0.15, 3, 6]} />
        <meshBasicMaterial color="#475569" />
      </mesh>
      <mesh position={[4, 1.5, 0]} receiveShadow castShadow>
        <boxGeometry args={[0.15, 3, 6]} />
        <meshBasicMaterial color="#475569" />
      </mesh>

      {/* Front wall with entrance gap */}
      <mesh position={[-2.5, 1.5, 3]} receiveShadow castShadow>
        <boxGeometry args={[3, 3, 0.15]} />
        <meshBasicMaterial color="#475569" />
      </mesh>
      <mesh position={[2.5, 1.5, 3]} receiveShadow castShadow>
        <boxGeometry args={[3, 3, 0.15]} />
        <meshBasicMaterial color="#475569" />
      </mesh>
      <mesh position={[0, 2.7, 3]} receiveShadow castShadow>
        <boxGeometry args={[2, 0.6, 0.15]} />
        <meshBasicMaterial color="#475569" />
      </mesh>

      {/* Lockers - row of 6 (bodies with unique colors) */}
      {lockerXPositions.map((x, i) => (
        <group key={i} position={[x, 0, -2.5]}>
          {/* Locker body */}
          <mesh position={[0, 1, 0]} castShadow>
            <boxGeometry args={[1, 2, 0.5]} />
            <meshBasicMaterial color={lockerColors[i]} />
          </mesh>
          {/* Ventilation slots */}
          <mesh position={[0, 0.3, 0.26]}>
            <planeGeometry args={[0.6, 0.15]} />
            <meshBasicMaterial color="#1e293b" />
          </mesh>
          <mesh position={[0, 1.7, 0.26]}>
            <planeGeometry args={[0.6, 0.15]} />
            <meshBasicMaterial color="#1e293b" />
          </mesh>
        </group>
      ))}

      {/* Locker handles - INSTANCED (6 handles -> 1 draw call) */}
      <instancedMesh ref={lockerHandlesRef} args={[lockerHandleGeometry, darkMetalMaterial, 6]} />

      {/* Bench top */}
      <mesh position={[0, 0.35, -0.5]} castShadow>
        <boxGeometry args={[6, 0.08, 0.4]} />
        <meshBasicMaterial color="#78350f" />
      </mesh>

      {/* Bench supports - INSTANCED (2 supports -> 1 draw call) */}
      <instancedMesh
        ref={benchSupportsRef}
        args={[lockerSupportGeometry, metalGrayMaterial, 2]}
        castShadow
      />

      {/* Coat hooks - INSTANCED (4 hooks -> 1 draw call) */}
      <instancedMesh ref={coatHooksRef} args={[coatHookGeometry, metalGrayMaterial, 4]} />

      {/* "LOCKER ROOM" sign above entrance */}
      <mesh position={[0, 2.85, 3.1]}>
        <boxGeometry args={[2, 0.35, 0.05]} />
        <meshBasicMaterial color="#3b82f6" />
      </mesh>

      {/* Overhead light */}
      <pointLight position={[0, 2.5, 0]} color="#fef3c7" intensity={0.4} distance={6} />
    </group>
  );
});

// Portable toilet (blue porta-potty)
const PortableToilet: React.FC<{ position: [number, number, number]; rotation?: number }> =
  React.memo(({ position, rotation = 0 }) => {
    return (
      <group position={position} rotation={[0, rotation, 0]}>
        {/* Main body */}
        <mesh position={[0, 1.1, 0]} castShadow>
          <boxGeometry args={[1.2, 2.2, 1.2]} />
          <meshBasicMaterial color="#1e40af" />
        </mesh>

        {/* Roof with slight overhang */}
        <mesh position={[0, 2.3, 0]} castShadow>
          <boxGeometry args={[1.3, 0.1, 1.3]} />
          <meshBasicMaterial color="#1e3a5f" />
        </mesh>

        {/* Vent pipe on roof */}
        <mesh position={[0.4, 2.5, 0]} castShadow>
          <cylinderGeometry args={[0.06, 0.06, 0.4, 8]} />
          <meshBasicMaterial color="#1f2937" />
        </mesh>

        {/* Door */}
        <mesh position={[0, 1, 0.61]} castShadow>
          <boxGeometry args={[0.8, 1.8, 0.02]} />
          <meshBasicMaterial color="#1e3a5f" />
        </mesh>

        {/* Door handle */}
        <mesh position={[0.3, 1, 0.63]}>
          <boxGeometry args={[0.08, 0.15, 0.04]} />
          <meshBasicMaterial color="#64748b" />
        </mesh>

        {/* Occupied indicator */}
        <mesh position={[0.3, 1.5, 0.62]}>
          <boxGeometry args={[0.15, 0.08, 0.02]} />
          <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={0.3} />
        </mesh>

        {/* Vents on sides */}
        {[-0.61, 0.61].map((x, i) => (
          <group
            key={i}
            position={[x, 1.8, 0]}
            rotation={[0, i === 0 ? -Math.PI / 2 : Math.PI / 2, 0]}
          >
            {[-0.15, 0, 0.15].map((y, j) => (
              <mesh key={j} position={[0, y, 0]}>
                <boxGeometry args={[0.4, 0.04, 0.02]} />
                <meshBasicMaterial color="#0f172a" />
              </mesh>
            ))}
          </group>
        ))}

        {/* Base/skid */}
        <mesh position={[0, 0.02, 0]}>
          <boxGeometry args={[1.25, 0.04, 1.25]} />
          <meshBasicMaterial color="#374151" />
        </mesh>
      </group>
    );
  });

// Indoor toilet block with corridor layout - with instanced stalls and sinks
const ToiletBlock: React.FC<{ position: [number, number, number] }> = React.memo(({ position }) => {
  const stallBackWallsRef = useRef<THREE.InstancedMesh>(null);
  const stallDividersRef = useRef<THREE.InstancedMesh>(null);
  const toiletBasesRef = useRef<THREE.InstancedMesh>(null);
  const toiletTanksRef = useRef<THREE.InstancedMesh>(null);
  const stallDoorsRef = useRef<THREE.InstancedMesh>(null);
  const stallDoorHandlesRef = useRef<THREE.InstancedMesh>(null);
  const sinkBasinsRef = useRef<THREE.InstancedMesh>(null);
  const faucetVerticalsRef = useRef<THREE.InstancedMesh>(null);
  const faucetHorizontalsRef = useRef<THREE.InstancedMesh>(null);

  const stallZPositions = useMemo(() => [-1.5, 0, 1.5] as const, []);
  const sinkZPositions = useMemo(() => [-1.2, 0, 1.2] as const, []);

  useEffect(() => {
    const matrix = new THREE.Matrix4();

    // Stall back walls (3)
    if (stallBackWallsRef.current) {
      stallZPositions.forEach((z, i) => {
        matrix.setPosition(-3.2, 1, z);
        stallBackWallsRef.current!.setMatrixAt(i, matrix);
      });
      stallBackWallsRef.current.instanceMatrix.needsUpdate = true;
    }

    // Stall dividers (3)
    if (stallDividersRef.current) {
      const dividerZPositions = [-2.25, -0.75, 0.75];
      dividerZPositions.forEach((z, i) => {
        matrix.setPosition(-2.5, 1, z);
        stallDividersRef.current!.setMatrixAt(i, matrix);
      });
      stallDividersRef.current.instanceMatrix.needsUpdate = true;
    }

    // Toilet bases (3)
    if (toiletBasesRef.current) {
      stallZPositions.forEach((z, i) => {
        matrix.setPosition(-2.9, 0.3, z);
        toiletBasesRef.current!.setMatrixAt(i, matrix);
      });
      toiletBasesRef.current.instanceMatrix.needsUpdate = true;
    }

    // Toilet tanks (3)
    if (toiletTanksRef.current) {
      stallZPositions.forEach((z, i) => {
        matrix.setPosition(-3.05, 0.6, z);
        toiletTanksRef.current!.setMatrixAt(i, matrix);
      });
      toiletTanksRef.current.instanceMatrix.needsUpdate = true;
    }

    // Stall doors (3)
    if (stallDoorsRef.current) {
      stallZPositions.forEach((z, i) => {
        matrix.setPosition(-1.95, 1, z);
        stallDoorsRef.current!.setMatrixAt(i, matrix);
      });
      stallDoorsRef.current.instanceMatrix.needsUpdate = true;
    }

    // Stall door handles (3)
    if (stallDoorHandlesRef.current) {
      stallZPositions.forEach((z, i) => {
        matrix.setPosition(-1.9, 1, z - 0.3);
        stallDoorHandlesRef.current!.setMatrixAt(i, matrix);
      });
      stallDoorHandlesRef.current.instanceMatrix.needsUpdate = true;
    }

    // Sink basins (3)
    if (sinkBasinsRef.current) {
      sinkZPositions.forEach((z, i) => {
        matrix.setPosition(3, 0.9, z);
        sinkBasinsRef.current!.setMatrixAt(i, matrix);
      });
      sinkBasinsRef.current.instanceMatrix.needsUpdate = true;
    }

    // Faucet verticals (3)
    if (faucetVerticalsRef.current) {
      sinkZPositions.forEach((z, i) => {
        matrix.setPosition(3.2, 1.05, z);
        faucetVerticalsRef.current!.setMatrixAt(i, matrix);
      });
      faucetVerticalsRef.current.instanceMatrix.needsUpdate = true;
    }

    // Faucet horizontals (3)
    if (faucetHorizontalsRef.current) {
      sinkZPositions.forEach((z, i) => {
        matrix.setPosition(3.1, 1.15, z);
        faucetHorizontalsRef.current!.setMatrixAt(i, matrix);
      });
      faucetHorizontalsRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [stallZPositions, sinkZPositions]);

  return (
    <group position={position}>
      {/* Floor */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[8, 5]} />
        <meshBasicMaterial color="#e2e8f0" />
      </mesh>

      {/* Back wall (north, -Z) */}
      <mesh position={[0, 1.5, -2.5]} receiveShadow castShadow>
        <boxGeometry args={[8, 3, 0.15]} />
        <meshBasicMaterial color="#f1f5f9" />
      </mesh>

      {/* Front wall (south, +Z) */}
      <mesh position={[-3, 1.5, 2.5]} receiveShadow castShadow>
        <boxGeometry args={[2, 3, 0.15]} />
        <meshBasicMaterial color="#f1f5f9" />
      </mesh>
      <mesh position={[3, 1.5, 2.5]} receiveShadow castShadow>
        <boxGeometry args={[2, 3, 0.15]} />
        <meshBasicMaterial color="#f1f5f9" />
      </mesh>
      <mesh position={[0, 2.7, 2.5]} receiveShadow castShadow>
        <boxGeometry args={[4, 0.6, 0.15]} />
        <meshBasicMaterial color="#f1f5f9" />
      </mesh>

      {/* West wall (-X) */}
      <mesh position={[-4, 1.5, 0]} receiveShadow castShadow>
        <boxGeometry args={[0.15, 3, 5]} />
        <meshBasicMaterial color="#f1f5f9" />
      </mesh>

      {/* East wall (+X) */}
      <mesh position={[4, 1.5, 0]} receiveShadow castShadow>
        <boxGeometry args={[0.15, 3, 5]} />
        <meshBasicMaterial color="#f1f5f9" />
      </mesh>

      {/* Restroom sign */}
      <mesh position={[0, 2.8, 2.6]}>
        <boxGeometry args={[1.5, 0.4, 0.05]} />
        <meshBasicMaterial color="#1e40af" />
      </mesh>

      {/* === TOILET STALLS - INSTANCED === */}
      <instancedMesh
        ref={stallBackWallsRef}
        args={[stallBackWallGeometry, lightGrayMaterial, 3]}
        castShadow
      />
      <instancedMesh
        ref={stallDividersRef}
        args={[stallDividerGeometry, lightGrayMaterial, 3]}
        castShadow
      />
      <instancedMesh ref={toiletBasesRef} args={[toiletBaseGeometry, whiteMaterial, 3]} />
      <instancedMesh ref={toiletTanksRef} args={[toiletTankGeometry, whiteMaterial, 3]} />
      <instancedMesh ref={stallDoorsRef} args={[stallDoorGeometry, metalGrayMaterial, 3]} />
      <instancedMesh ref={stallDoorHandlesRef} args={[doorHandleGeometry, darkMetalMaterial, 3]} />

      {/* === SINK AREA - INSTANCED === */}
      <mesh position={[3, 0.85, 0]} castShadow>
        <boxGeometry args={[0.8, 0.1, 4]} />
        <meshBasicMaterial color="#475569" />
      </mesh>

      <instancedMesh ref={sinkBasinsRef} args={[sinkBasinGeometry, whiteMaterial, 3]} />
      <instancedMesh
        ref={faucetVerticalsRef}
        args={[faucetVerticalGeometry, lightGrayMaterial, 3]}
      />
      <instancedMesh
        ref={faucetHorizontalsRef}
        args={[faucetHorizontalGeometry, lightGrayMaterial, 3]}
      />

      {/* Mirror */}
      <mesh position={[3.4, 1.6, 0]}>
        <boxGeometry args={[0.05, 1.2, 3.5]} />
        <meshStandardMaterial
          color="#93c5fd"
          roughness={0.1}
          metalness={0.6}
          transparent
          opacity={0.85}
        />
      </mesh>

      {/* Hand dryers */}
      <mesh position={[0, 1.3, 2.35]}>
        <boxGeometry args={[0.4, 0.35, 0.25]} />
        <meshBasicMaterial color="#e2e8f0" />
      </mesh>

      {/* Overhead light */}
      <pointLight position={[0, 2.8, 0]} color="#f8fafc" intensity={0.6} distance={8} />
    </group>
  );
});

// Manager's Office component - glass-fronted office overlooking factory floor
const ManagerOffice: React.FC<{ position: [number, number, number] }> = React.memo(
  ({ position }) => {
    return (
      <group position={position}>
        {/* Floor - carpet */}
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[8, 6]} />
          <meshBasicMaterial color="#1e3a5f" />
        </mesh>

        {/* Back wall */}
        <mesh position={[0, 1.5, -3]} receiveShadow castShadow>
          <boxGeometry args={[8, 3, 0.15]} />
          <meshBasicMaterial color="#f1f5f9" />
        </mesh>

        {/* Side walls */}
        <mesh position={[-4, 1.5, 0]} receiveShadow castShadow>
          <boxGeometry args={[0.15, 3, 6]} />
          <meshBasicMaterial color="#f1f5f9" />
        </mesh>
        <mesh position={[4, 1.5, 0]} receiveShadow castShadow>
          <boxGeometry args={[0.15, 3, 6]} />
          <meshBasicMaterial color="#f1f5f9" />
        </mesh>

        {/* Front wall - glass panels with door gap */}
        <mesh position={[-2.5, 1.5, 3]} receiveShadow castShadow>
          <boxGeometry args={[3, 3, 0.1]} />
          <meshBasicMaterial color="#60a5fa" transparent opacity={0.3} />
        </mesh>
        <mesh position={[2.5, 1.5, 3]} receiveShadow castShadow>
          <boxGeometry args={[3, 3, 0.1]} />
          <meshBasicMaterial color="#60a5fa" transparent opacity={0.3} />
        </mesh>
        <mesh position={[0, 2.7, 3]} receiveShadow castShadow>
          <boxGeometry args={[2, 0.6, 0.1]} />
          <meshBasicMaterial color="#60a5fa" transparent opacity={0.3} />
        </mesh>
        {/* Glass door frame */}
        <mesh position={[-1, 1.2, 3]}>
          <boxGeometry args={[0.08, 2.4, 0.12]} />
          <meshBasicMaterial color="#374151" />
        </mesh>
        <mesh position={[1, 1.2, 3]}>
          <boxGeometry args={[0.08, 2.4, 0.12]} />
          <meshBasicMaterial color="#374151" />
        </mesh>

        {/* Desk */}
        <group position={[0, 0, -1]}>
          {/* Desktop */}
          <mesh position={[0, 0.75, 0]} castShadow>
            <boxGeometry args={[2.5, 0.08, 1.2]} />
            <meshBasicMaterial color="#78350f" />
          </mesh>
          {/* Front panel */}
          <mesh position={[0, 0.37, 0.55]} castShadow>
            <boxGeometry args={[2.5, 0.7, 0.05]} />
            <meshBasicMaterial color="#78350f" />
          </mesh>
          {/* Desk legs */}
          {[
            [-1.15, -0.55],
            [1.15, -0.55],
            [-1.15, 0.5],
            [1.15, 0.5],
          ].map(([x, z], i) => (
            <mesh key={i} position={[x, 0.35, z]} castShadow>
              <boxGeometry args={[0.08, 0.7, 0.08]} />
              <meshBasicMaterial color="#64748b" />
            </mesh>
          ))}
          {/* Drawer unit */}
          <mesh position={[0.8, 0.35, 0]} castShadow>
            <boxGeometry args={[0.5, 0.65, 0.9]} />
            <meshBasicMaterial color="#78350f" />
          </mesh>
          {/* Drawer handles */}
          {[0.5, 0.25, 0].map((y, i) => (
            <mesh key={i} position={[0.8, y, 0.46]}>
              <boxGeometry args={[0.2, 0.03, 0.03]} />
              <meshBasicMaterial color="#94a3b8" />
            </mesh>
          ))}
        </group>

        {/* Computer monitor */}
        <group position={[0, 0.79, -1.3]}>
          {/* Screen */}
          <mesh position={[0, 0.25, 0]} castShadow>
            <boxGeometry args={[0.8, 0.5, 0.04]} />
            <meshBasicMaterial color="#1e293b" />
          </mesh>
          {/* Screen glow - keep standard for emissive */}
          <mesh position={[0, 0.25, 0.025]}>
            <planeGeometry args={[0.7, 0.4]} />
            <meshStandardMaterial color="#3b82f6" emissive="#3b82f6" emissiveIntensity={0.3} />
          </mesh>
          {/* Stand */}
          <mesh position={[0, 0, 0]}>
            <boxGeometry args={[0.15, 0.08, 0.15]} />
            <meshBasicMaterial color="#374151" />
          </mesh>
          {/* Base */}
          <mesh position={[0, -0.02, 0.05]}>
            <boxGeometry args={[0.3, 0.03, 0.25]} />
            <meshBasicMaterial color="#374151" />
          </mesh>
        </group>

        {/* Keyboard */}
        <mesh position={[0, 0.8, -0.7]}>
          <boxGeometry args={[0.5, 0.02, 0.18]} />
          <meshBasicMaterial color="#1e293b" />
        </mesh>

        {/* Mouse */}
        <mesh position={[0.4, 0.8, -0.7]}>
          <boxGeometry args={[0.08, 0.02, 0.12]} />
          <meshBasicMaterial color="#1e293b" />
        </mesh>

        {/* Office chair */}
        <group position={[0, 0, 0.2]}>
          {/* Seat */}
          <mesh position={[0, 0.45, 0]} castShadow>
            <boxGeometry args={[0.5, 0.1, 0.5]} />
            <meshBasicMaterial color="#1e293b" />
          </mesh>
          {/* Backrest */}
          <mesh position={[0, 0.8, 0.2]} castShadow>
            <boxGeometry args={[0.48, 0.6, 0.08]} />
            <meshBasicMaterial color="#1e293b" />
          </mesh>
          {/* Chair base */}
          <mesh position={[0, 0.2, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 0.4, 8]} />
            <meshBasicMaterial color="#64748b" />
          </mesh>
          {/* Chair wheel base */}
          <mesh position={[0, 0.03, 0]}>
            <cylinderGeometry args={[0.25, 0.25, 0.03, 5]} />
            <meshBasicMaterial color="#374151" />
          </mesh>
        </group>

        {/* Filing cabinet */}
        <group position={[-3, 0, -2]}>
          <mesh position={[0, 0.6, 0]} castShadow>
            <boxGeometry args={[0.5, 1.2, 0.6]} />
            <meshBasicMaterial color="#64748b" />
          </mesh>
          {/* Drawer fronts */}
          {[0.9, 0.5, 0.1].map((y, i) => (
            <group key={i}>
              <mesh position={[0, y, 0.31]}>
                <planeGeometry args={[0.45, 0.35]} />
                <meshBasicMaterial color="#475569" />
              </mesh>
              <mesh position={[0.15, y, 0.32]}>
                <boxGeometry args={[0.1, 0.03, 0.02]} />
                <meshBasicMaterial color="#94a3b8" />
              </mesh>
            </group>
          ))}
        </group>

        {/* Whiteboard on back wall */}
        <group position={[2, 1.5, -2.9]}>
          {/* Board frame */}
          <mesh>
            <boxGeometry args={[2, 1.2, 0.05]} />
            <meshBasicMaterial color="#374151" />
          </mesh>
          {/* White surface */}
          <mesh position={[0, 0, 0.03]}>
            <planeGeometry args={[1.9, 1.1]} />
            <meshBasicMaterial color="#f8fafc" />
          </mesh>
          {/* Marker tray */}
          <mesh position={[0, -0.65, 0.08]}>
            <boxGeometry args={[1.5, 0.08, 0.1]} />
            <meshBasicMaterial color="#64748b" />
          </mesh>
        </group>

        {/* Wall clock */}
        <group position={[-2, 2.2, -2.9]}>
          <mesh>
            <cylinderGeometry args={[0.25, 0.25, 0.05, 32]} />
            <meshBasicMaterial color="#1e293b" />
          </mesh>
          <mesh position={[0, 0, 0.03]} rotation={[Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.22, 32]} />
            <meshBasicMaterial color="#f8fafc" />
          </mesh>
        </group>

        {/* Potted plant in corner */}
        <group position={[3, 0, -2]}>
          {/* Pot */}
          <mesh position={[0, 0.2, 0]} castShadow>
            <cylinderGeometry args={[0.2, 0.15, 0.4, 16]} />
            <meshBasicMaterial color="#78350f" />
          </mesh>
          {/* Plant */}
          <mesh position={[0, 0.6, 0]}>
            <sphereGeometry args={[0.3, 8, 8]} />
            <meshBasicMaterial color="#15803d" />
          </mesh>
        </group>

        {/* "MANAGER'S OFFICE" sign - large and prominent above door */}
        <group position={[0, 3.2, 3.2]}>
          {/* Sign backing/frame - dark blue */}
          <mesh>
            <boxGeometry args={[3, 0.7, 0.1]} />
            <meshBasicMaterial color="#1e3a5f" />
          </mesh>
          {/* Sign face - dark blue background */}
          <mesh position={[0, 0, 0.06]}>
            <boxGeometry args={[2.8, 0.55, 0.02]} />
            <meshBasicMaterial color="#1e40af" />
          </mesh>
          {/* Text simulation - GOLD lettering */}
          <mesh position={[0, 0, 0.08]}>
            <boxGeometry args={[2.4, 0.22, 0.02]} />
            <meshStandardMaterial
              color="#d4af37"
              metalness={0.8}
              roughness={0.2}
              emissive="#b8860b"
              emissiveIntensity={0.15}
            />
          </mesh>
          {/* Mounting brackets */}
          <mesh position={[-1.4, 0, -0.1]}>
            <boxGeometry args={[0.15, 0.5, 0.25]} />
            <meshBasicMaterial color="#374151" />
          </mesh>
          <mesh position={[1.4, 0, -0.1]}>
            <boxGeometry args={[0.15, 0.5, 0.25]} />
            <meshBasicMaterial color="#374151" />
          </mesh>
        </group>

        {/* Door nameplate on glass door frame - gold on blue */}
        <group position={[0.7, 1.5, 3.15]}>
          <mesh>
            <boxGeometry args={[0.6, 0.2, 0.02]} />
            <meshBasicMaterial color="#1e3a5f" />
          </mesh>
          <mesh position={[0, 0, 0.015]}>
            <boxGeometry args={[0.5, 0.12, 0.01]} />
            <meshBasicMaterial color="#d4af37" />
          </mesh>
        </group>

        {/* Overhead lights */}
        <pointLight position={[0, 2.8, 0]} color="#f8fafc" intensity={0.5} distance={8} />
        <pointLight position={[-2, 2.8, -1]} color="#fef3c7" intensity={0.3} distance={5} />
      </group>
    );
  }
);

export const FactoryWalls: React.FC<FactoryWallsProps> = () => {
  const graphics = useGraphicsStore((state) => state.graphics);
  const isLowGraphics = graphics.quality === 'low';

  return (
    <group matrixAutoUpdate={false}>
      {/* Break Room Areas - INSTANCED for performance */}
      {!isLowGraphics && (
        <>
          <group rotation={[0, 0, 0]}>
            <BreakRoom position={[-50, 0, -20]} />
          </group>
          <group rotation={[0, 0, 0]}>
            <BreakRoom position={[50, 0, -20]} />
          </group>
        </>
      )}

      {/* Locker Room - INSTANCED for performance */}
      {!isLowGraphics && <LockerRoom position={[-50, 0, -35]} />}

      {/* Toilet Block - INSTANCED for performance */}
      {!isLowGraphics && <ToiletBlock position={[35, 0, 35]} />}

      {/* Manager's Office */}
      {!isLowGraphics && <ManagerOffice position={[-20, 0, 30]} />}

      {/* Personnel doors */}
      {!isLowGraphics && (
        <>
          <PersonnelDoor position={[-45, 0, 42]} rotation={0} label="ENTRANCE" />
          <PersonnelDoor position={[45, 0, 42]} rotation={0} label="ENTRANCE" />
          <PersonnelDoor position={[-45, 0, -45]} rotation={Math.PI} label="EXIT" isEmergencyExit />
          <PersonnelDoor position={[45, 0, -45]} rotation={Math.PI} label="EXIT" isEmergencyExit />
        </>
      )}

      {/* Portable toilets */}
      {!isLowGraphics && (
        <>
          <PortableToilet position={[-50, 0, 45]} rotation={Math.PI / 4} />
          <PortableToilet position={[50, 0, 45]} rotation={-Math.PI / 4} />
          <PortableToilet position={[-50, 0, -45]} rotation={Math.PI / 2} />
        </>
      )}

      {/* Catwalks - already using Instances from drei */}
      {!isLowGraphics && (
        <group position={[0, 6, 0]}>
          <mesh receiveShadow castShadow>
            <boxGeometry args={[100, 0.15, 3]} />
            <meshStandardMaterial
              color="#475569"
              metalness={0.8}
              roughness={0.3}
              transparent
              opacity={0.95}
              normalMap={PROCEDURAL_TEXTURES.brushedMetal}
              normalScale={new THREE.Vector2(0.15, 0.15)}
            />
          </mesh>
          <mesh position={[0, 0.6, 1.4]} castShadow>
            <boxGeometry args={[100, 0.05, 0.05]} />
            <meshStandardMaterial
              color="#94a3b8"
              metalness={0.9}
              roughness={0.2}
              normalMap={PROCEDURAL_TEXTURES.brushedMetal}
              normalScale={new THREE.Vector2(0.1, 0.1)}
            />
          </mesh>
          <mesh position={[0, 0.6, -1.4]} castShadow>
            <boxGeometry args={[100, 0.05, 0.05]} />
            <meshStandardMaterial
              color="#94a3b8"
              metalness={0.9}
              roughness={0.2}
              normalMap={PROCEDURAL_TEXTURES.brushedMetal}
              normalScale={new THREE.Vector2(0.1, 0.1)}
            />
          </mesh>
          <mesh position={[0, 0.3, 1.4]} castShadow>
            <boxGeometry args={[100, 0.05, 0.05]} />
            <meshStandardMaterial
              color="#94a3b8"
              metalness={0.9}
              roughness={0.2}
              normalMap={PROCEDURAL_TEXTURES.brushedMetal}
              normalScale={new THREE.Vector2(0.1, 0.1)}
            />
          </mesh>
          <mesh position={[0, 0.3, -1.4]} castShadow>
            <boxGeometry args={[100, 0.05, 0.05]} />
            <meshStandardMaterial
              color="#94a3b8"
              metalness={0.9}
              roughness={0.2}
              normalMap={PROCEDURAL_TEXTURES.brushedMetal}
              normalScale={new THREE.Vector2(0.1, 0.1)}
            />
          </mesh>
          <Instances limit={68}>
            <boxGeometry args={[0.05, 0.6, 0.05]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.9} roughness={0.2} />
            {Array.from({ length: 34 }).map((_, i) => (
              <React.Fragment key={i}>
                <Instance position={[-48 + i * 3, 0.3, 1.4]} castShadow />
                <Instance position={[-48 + i * 3, 0.3, -1.4]} castShadow />
              </React.Fragment>
            ))}
          </Instances>
          <mesh position={[0, 0.08, 0]}>
            <planeGeometry args={[100, 3]} />
            <meshStandardMaterial
              color="#334155"
              metalness={0.7}
              roughness={0.4}
              transparent
              opacity={0.3}
            />
          </mesh>
        </group>
      )}

      {/* Catwalk supports */}
      {!isLowGraphics && (
        <Instances limit={6}>
          <boxGeometry args={[0.3, 6, 0.3]} />
          <meshStandardMaterial color="#374151" metalness={0.8} roughness={0.3} />
          {[-40, -25, -10, 10, 25, 40].map((x, i) => (
            <Instance key={i} position={[x, 3, 0]} castShadow />
          ))}
        </Instances>
      )}

      {/* Stairs - left side */}
      {!isLowGraphics && (
        <group position={[-55.5, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
          <Instances limit={12}>
            <boxGeometry args={[1.5, 0.1, 0.5]} />
            <meshStandardMaterial color="#475569" metalness={0.7} roughness={0.3} />
            {Array.from({ length: 12 }).map((_, i) => (
              <Instance key={i} position={[0, (i + 1) * 0.5, i * 0.5]} castShadow />
            ))}
          </Instances>
          <Instances limit={24}>
            <boxGeometry args={[0.05, 1, 0.05]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.9} roughness={0.2} />
            {Array.from({ length: 12 }).map((_, i) => (
              <React.Fragment key={i}>
                <Instance position={[0.7, (i + 1) * 0.5 + 0.5, i * 0.5]} castShadow />
                <Instance position={[-0.7, (i + 1) * 0.5 + 0.5, i * 0.5]} castShadow />
              </React.Fragment>
            ))}
          </Instances>
          {Array.from({ length: 11 }).map((_, i) => (
            <group key={i}>
              <mesh
                position={[0.7, (i + 1.5) * 0.5 + 0.75, (i + 0.5) * 0.5]}
                rotation={[-Math.atan2(0.5, 0.5), 0, 0]}
                castShadow
              >
                <cylinderGeometry args={[0.025, 0.025, 0.71, 8]} />
                <meshStandardMaterial color="#94a3b8" metalness={0.9} roughness={0.2} />
              </mesh>
              <mesh
                position={[-0.7, (i + 1.5) * 0.5 + 0.75, (i + 0.5) * 0.5]}
                rotation={[-Math.atan2(0.5, 0.5), 0, 0]}
                castShadow
              >
                <cylinderGeometry args={[0.025, 0.025, 0.71, 8]} />
                <meshStandardMaterial color="#94a3b8" metalness={0.9} roughness={0.2} />
              </mesh>
            </group>
          ))}
        </group>
      )}

      {/* Stairs - right side */}
      {!isLowGraphics && (
        <group position={[55.5, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
          <Instances limit={12}>
            <boxGeometry args={[1.5, 0.1, 0.5]} />
            <meshStandardMaterial color="#475569" metalness={0.7} roughness={0.3} />
            {Array.from({ length: 12 }).map((_, i) => (
              <Instance key={i} position={[0, (i + 1) * 0.5, i * 0.5]} castShadow />
            ))}
          </Instances>
          <Instances limit={24}>
            <boxGeometry args={[0.05, 1, 0.05]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.9} roughness={0.2} />
            {Array.from({ length: 12 }).map((_, i) => (
              <React.Fragment key={i}>
                <Instance position={[0.7, (i + 1) * 0.5 + 0.5, i * 0.5]} castShadow />
                <Instance position={[-0.7, (i + 1) * 0.5 + 0.5, i * 0.5]} castShadow />
              </React.Fragment>
            ))}
          </Instances>
          {Array.from({ length: 11 }).map((_, i) => (
            <group key={i}>
              <mesh
                position={[0.7, (i + 1.5) * 0.5 + 0.75, (i + 0.5) * 0.5]}
                rotation={[-Math.atan2(0.5, 0.5), 0, 0]}
                castShadow
              >
                <cylinderGeometry args={[0.025, 0.025, 0.71, 8]} />
                <meshStandardMaterial color="#94a3b8" metalness={0.9} roughness={0.2} />
              </mesh>
              <mesh
                position={[-0.7, (i + 1.5) * 0.5 + 0.75, (i + 0.5) * 0.5]}
                rotation={[-Math.atan2(0.5, 0.5), 0, 0]}
                castShadow
              >
                <cylinderGeometry args={[0.025, 0.025, 0.71, 8]} />
                <meshStandardMaterial color="#94a3b8" metalness={0.9} roughness={0.2} />
              </mesh>
            </group>
          ))}
        </group>
      )}

      {/* Factory Signs */}
      {!isLowGraphics && (
        <>
          <group position={[-40, 4.5, 1.8]}>
            <mesh>
              <boxGeometry args={[2.5, 0.6, 0.08]} />
              <meshBasicMaterial color="#1e40af" />
            </mesh>
            <mesh position={[0, 0, 0.05]}>
              <planeGeometry args={[2.3, 0.45]} />
              <meshBasicMaterial color="#dbeafe" />
            </mesh>
          </group>

          <group position={[-10, 4.5, 1.8]}>
            <mesh>
              <boxGeometry args={[2.5, 0.6, 0.08]} />
              <meshBasicMaterial color="#15803d" />
            </mesh>
            <mesh position={[0, 0, 0.05]}>
              <planeGeometry args={[2.3, 0.45]} />
              <meshBasicMaterial color="#dcfce7" />
            </mesh>
          </group>

          <group position={[10, 4.5, 1.8]}>
            <mesh>
              <boxGeometry args={[2.5, 0.6, 0.08]} />
              <meshBasicMaterial color="#b45309" />
            </mesh>
            <mesh position={[0, 0, 0.05]}>
              <planeGeometry args={[2.3, 0.45]} />
              <meshBasicMaterial color="#fef3c7" />
            </mesh>
          </group>

          <group position={[40, 4.5, 1.8]}>
            <mesh>
              <boxGeometry args={[2.5, 0.6, 0.08]} />
              <meshBasicMaterial color="#7c3aed" />
            </mesh>
            <mesh position={[0, 0, 0.05]}>
              <planeGeometry args={[2.3, 0.45]} />
              <meshBasicMaterial color="#ede9fe" />
            </mesh>
          </group>

          <group position={[-42, 2.5, 40]} rotation={[0, Math.PI, 0]}>
            <mesh>
              <boxGeometry args={[1.8, 0.5, 0.05]} />
              <meshBasicMaterial color="#eab308" />
            </mesh>
            <mesh position={[0, 0, 0.03]}>
              <planeGeometry args={[1.6, 0.35]} />
              <meshBasicMaterial color="#1c1917" />
            </mesh>
          </group>

          <group position={[0, 2.5, -10]}>
            <mesh>
              <boxGeometry args={[2, 0.5, 0.05]} />
              <meshBasicMaterial color="#22c55e" />
            </mesh>
            <mesh position={[0, 0, 0.03]}>
              <planeGeometry args={[1.8, 0.35]} />
              <meshBasicMaterial color="#f0fdf4" />
            </mesh>
          </group>

          <group position={[15, 2.5, 8]} rotation={[0, -Math.PI / 4, 0]}>
            <mesh>
              <boxGeometry args={[2.2, 0.5, 0.05]} />
              <meshBasicMaterial color="#3b82f6" />
            </mesh>
            <mesh position={[0, 0, 0.03]}>
              <planeGeometry args={[2, 0.35]} />
              <meshBasicMaterial color="#eff6ff" />
            </mesh>
          </group>

          <group position={[-15, 2.5, -5]} rotation={[0, Math.PI / 6, 0]}>
            <mesh>
              <boxGeometry args={[2.4, 0.5, 0.05]} />
              <meshBasicMaterial color="#f97316" />
            </mesh>
            <mesh position={[0, 0, 0.03]}>
              <planeGeometry args={[2.2, 0.35]} />
              <meshBasicMaterial color="#fff7ed" />
            </mesh>
          </group>

          <group position={[0, 2.2, 42]} rotation={[0, Math.PI, 0]}>
            <mesh>
              <boxGeometry args={[2.5, 0.6, 0.05]} />
              <meshBasicMaterial color="#dc2626" />
            </mesh>
            <mesh position={[0, 0, 0.03]}>
              <planeGeometry args={[2.3, 0.45]} />
              <meshBasicMaterial color="#fef2f2" />
            </mesh>
          </group>

          <group position={[25, 3, 35]} rotation={[0, -Math.PI / 2, 0]}>
            <mesh>
              <boxGeometry args={[2.2, 0.5, 0.05]} />
              <meshBasicMaterial color="#1e293b" />
            </mesh>
            <mesh position={[0, 0, 0.03]}>
              <planeGeometry args={[2, 0.35]} />
              <meshBasicMaterial color="#f8fafc" />
            </mesh>
            <mesh position={[0.85, 0, 0.04]}>
              <boxGeometry args={[0.3, 0.15, 0.02]} />
              <meshBasicMaterial color="#22c55e" />
            </mesh>
          </group>

          <group position={[-35, 2.5, -35]} rotation={[0, Math.PI / 2, 0]}>
            <mesh>
              <boxGeometry args={[2.8, 0.5, 0.05]} />
              <meshBasicMaterial color="#dc2626" />
            </mesh>
            <mesh position={[0, 0, 0.03]}>
              <planeGeometry args={[2.6, 0.35]} />
              <meshBasicMaterial color="#fef2f2" />
            </mesh>
          </group>

          <group position={[40, 2.2, -20]} rotation={[0, -Math.PI / 3, 0]}>
            <mesh>
              <cylinderGeometry args={[0.35, 0.35, 0.05, 32]} />
              <meshBasicMaterial color="#dc2626" />
            </mesh>
            <mesh position={[0, 0, 0.03]} rotation={[Math.PI / 2, 0, 0]}>
              <circleGeometry args={[0.3, 32]} />
              <meshBasicMaterial color="#fef2f2" />
            </mesh>
            <mesh position={[0, 0, 0.04]} rotation={[0, 0, Math.PI / 4]}>
              <boxGeometry args={[0.5, 0.06, 0.02]} />
              <meshBasicMaterial color="#dc2626" />
            </mesh>
          </group>

          {[
            [-50, 2, 20],
            [50, 2, 20],
            [-50, 2, -20],
            [50, 2, -20],
          ].map((pos, i) => (
            <group key={i} position={pos as [number, number, number]}>
              <mesh>
                <boxGeometry args={[0.5, 0.6, 0.05]} />
                <meshBasicMaterial color="#dc2626" />
              </mesh>
              <mesh position={[0, 0, 0.03]}>
                <planeGeometry args={[0.4, 0.5]} />
                <meshBasicMaterial color="#fef2f2" />
              </mesh>
              <mesh position={[0, 0.05, 0.04]}>
                <boxGeometry args={[0.15, 0.3, 0.02]} />
                <meshBasicMaterial color="#dc2626" />
              </mesh>
            </group>
          ))}

          {[
            [-35, 2, 35],
            [35, 2, 35],
          ].map((pos, i) => (
            <group key={i} position={pos as [number, number, number]}>
              <mesh>
                <boxGeometry args={[0.6, 0.6, 0.05]} />
                <meshBasicMaterial color="#22c55e" />
              </mesh>
              <mesh position={[0, 0, 0.03]}>
                <boxGeometry args={[0.35, 0.12, 0.02]} />
                <meshBasicMaterial color="#f0fdf4" />
              </mesh>
              <mesh position={[0, 0, 0.03]}>
                <boxGeometry args={[0.12, 0.35, 0.02]} />
                <meshBasicMaterial color="#f0fdf4" />
              </mesh>
            </group>
          ))}

          <group position={[-48, 2.5, 47.5]}>
            <mesh>
              <boxGeometry args={[2, 0.6, 0.05]} />
              <meshBasicMaterial color="#22c55e" />
            </mesh>
            <mesh position={[0, 0, 0.03]}>
              <planeGeometry args={[1.8, 0.45]} />
              <meshBasicMaterial color="#f0fdf4" />
            </mesh>
            {[-0.4, 0, 0.4].map((x, i) => (
              <group key={i} position={[x, 0, 0.04]}>
                <mesh position={[0, 0.12, 0]}>
                  <sphereGeometry args={[0.06, 8, 8]} />
                  <meshBasicMaterial color="#15803d" />
                </mesh>
                <mesh position={[0, -0.02, 0]}>
                  <boxGeometry args={[0.08, 0.15, 0.02]} />
                  <meshBasicMaterial color="#15803d" />
                </mesh>
              </group>
            ))}
          </group>
        </>
      )}
    </group>
  );
};
