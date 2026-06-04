import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useFrame } from '@react-three/fiber';
import { TruckAnimState } from './useTruckPhysics';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { PROCEDURAL_TEXTURES } from '../../utils/sharedMaterials';
import { ExhaustSmoke } from './TruckAudio';
import {
  LicensePlate,
  HeadlightBeam,
  CBAntennaComponent,
  SunVisor,
  FifthWheelCoupling,
  AirTank,
  GladHands,
  DOTMarkerLights,
  ICCReflectiveTape,
  HazmatPlacard,
  MudflapWithLogo,
  GrainCoLogo,
  FlourExpressLogo,
} from './TruckParts';

/** Geometry constructor arguments - Box: [w,h,d], Cylinder: [rT,rB,h,seg?], Plane: [w,h] */
type GeometryArgs = readonly number[];

type GeometryConstructor =
  | typeof THREE.BoxGeometry
  | typeof THREE.CylinderGeometry
  | typeof THREE.PlaneGeometry;

// Helper to create transformed geometry
const createGeo = (
  GeometryClass: GeometryConstructor,
  args: GeometryArgs,
  pos: [number, number, number],
  rot?: [number, number, number],
  scale?: [number, number, number]
) => {
  const geo = new GeometryClass(...(args as [number, number, number]));
  if (scale) geo.scale(...scale);
  if (rot) geo.rotateX(rot[0]).rotateY(rot[1]).rotateZ(rot[2]);
  geo.translate(...pos);
  return geo;
};

// --- CAB GEOMETRIES ---
const useCabGeometries = () => {
  return useMemo(() => {
    // 1. Body Parts (Painted Color)
    const bodyGeos: THREE.BufferGeometry[] = [];
    bodyGeos.push(createGeo(THREE.BoxGeometry, [2.8, 2.4, 2.2], [0, 2, 0])); // Main
    bodyGeos.push(createGeo(THREE.BoxGeometry, [2.6, 1, 1.2], [0, 1.2, 1.5])); // Hood
    bodyGeos.push(createGeo(THREE.BoxGeometry, [2.6, 0.8, 1.8], [0, 3.5, -0.3])); // Roof Fairing

    // 2. Dark Metal Parts (Frame, Bumper, Grille, Tanks, Exhaust)
    const detailGeos: THREE.BufferGeometry[] = [];
    detailGeos.push(createGeo(THREE.BoxGeometry, [2.8, 0.4, 0.3], [0, 0.5, 2])); // Bumper
    detailGeos.push(createGeo(THREE.PlaneGeometry, [1.8, 0.8], [0, 1.2, 2.11])); // Grille
    // Exhausts
    detailGeos.push(createGeo(THREE.CylinderGeometry, [0.08, 0.1, 1.5, 12], [-1.2, 2.8, -0.8]));
    detailGeos.push(createGeo(THREE.CylinderGeometry, [0.08, 0.1, 1.5, 12], [1.2, 2.8, -0.8]));
    // Mirrors
    detailGeos.push(createGeo(THREE.BoxGeometry, [0.1, 0.4, 0.3], [-1.6, 2.2, 1]));
    detailGeos.push(createGeo(THREE.BoxGeometry, [0.1, 0.4, 0.3], [1.6, 2.2, 1]));
    // Tanks (Simplified)
    detailGeos.push(
      createGeo(
        THREE.CylinderGeometry,
        [0.35, 0.35, 1.2, 16],
        [-1.6, 0.8, -0.3],
        [0, 0, Math.PI / 2]
      )
    );
    detailGeos.push(
      createGeo(
        THREE.CylinderGeometry,
        [0.35, 0.35, 1.2, 16],
        [1.6, 0.8, -0.3],
        [0, 0, Math.PI / 2]
      )
    );
    detailGeos.push(
      createGeo(
        THREE.CylinderGeometry,
        [0.18, 0.18, 0.5, 12],
        [-1.6, 0.5, 0.5],
        [0, 0, Math.PI / 2]
      )
    ); // DEF
    detailGeos.push(
      createGeo(THREE.CylinderGeometry, [0.18, 0.18, 0.5, 12], [1.6, 0.5, 0.5], [0, 0, Math.PI / 2])
    ); // DEF

    // 3. Glass Parts (Windows)
    const glassGeos: THREE.BufferGeometry[] = [];
    glassGeos.push(createGeo(THREE.PlaneGeometry, [2.4, 1.4], [0, 2.6, 1.2], [0.3, 0, 0])); // Windshield
    glassGeos.push(
      createGeo(THREE.PlaneGeometry, [1.8, 1.2], [-1.41, 2.4, 0], [0, Math.PI / 2, 0])
    ); // Left
    glassGeos.push(createGeo(THREE.PlaneGeometry, [1.8, 1.2], [1.41, 2.4, 0], [0, Math.PI / 2, 0])); // Right

    // Merge
    const bodyGeo = BufferGeometryUtils.mergeGeometries(bodyGeos);
    const detailGeo = BufferGeometryUtils.mergeGeometries(detailGeos);
    const glassGeo = BufferGeometryUtils.mergeGeometries(glassGeos);

    return { bodyGeo, detailGeo, glassGeo };
  }, []);
};

// --- TRAILER GEOMETRIES ---
const useTrailerGeometries = () => {
  return useMemo(() => {
    // 1. Body (White/Grey Box)
    const bodyGeos: THREE.BufferGeometry[] = [];
    bodyGeos.push(createGeo(THREE.BoxGeometry, [3.2, 3.8, 11], [0, 2.5, 0])); // Main Box
    // Roof Ribs
    [-4, -2, 0, 2, 4].forEach((z) => {
      bodyGeos.push(createGeo(THREE.BoxGeometry, [3.3, 0.1, 0.3], [0, 4.45, z]));
    });

    // 2. Undercarriage (Dark Metal)
    const underGeos: THREE.BufferGeometry[] = [];
    underGeos.push(createGeo(THREE.BoxGeometry, [2.8, 0.4, 10], [0, 0.6, 0])); // Chassis
    underGeos.push(createGeo(THREE.BoxGeometry, [2, 0.15, 0.05], [0, 0.8, -5.56])); // Rear Bumper Bar
    underGeos.push(createGeo(THREE.BoxGeometry, [3, 0.3, 0.15], [0, 0.4, -5.4])); // Rear Bumper
    // Axles
    underGeos.push(createGeo(THREE.BoxGeometry, [3.5, 0.25, 0.25], [0, 0.55, -3.25]));
    // Landing Gear
    underGeos.push(createGeo(THREE.BoxGeometry, [1.8, 0.1, 0.12], [0, 0.75, 4.5]));
    [
      [-0.8, 4.5],
      [0.8, 4.5],
    ].forEach(([x, z]) => {
      underGeos.push(createGeo(THREE.BoxGeometry, [0.12, 0.8, 0.15], [x, 0.4, z]));
    });

    // Merge
    const bodyGeo = BufferGeometryUtils.mergeGeometries(bodyGeos);
    const underGeo = BufferGeometryUtils.mergeGeometries(underGeos);

    return { bodyGeo, underGeo };
  }, []);
};

// --- WHEEL INSTANCES HOOK ---
// Updates an InstancedMesh with wheel positions and rotations
const useWheelInstances = (
  meshRef: React.RefObject<THREE.InstancedMesh | null>,
  wheelRotation: React.MutableRefObject<number>,
  positions: [number, number, number][],
  isSteering: boolean,
  steeringAngle?: number
) => {
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const isTabVisible = useGameSimulationStore((s) => s.isTabVisible);

  useFrame(() => {
    if (!meshRef.current || !isTabVisible) return;
    positions.forEach((pos, i) => {
      dummy.position.set(...pos);
      // Roll X, Steer Y (if applicable)
      const roll = wheelRotation.current;
      const steer = isSteering ? steeringAngle || 0 : 0;
      dummy.rotation.set(roll, steer, 0);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  });
};

// --- MERGED TRUCK MODEL ---
interface MergedTruckModelProps {
  color: string;
  company: string;
  plateNumber: string;
  wheelRotation: React.MutableRefObject<number>;
  throttle: React.MutableRefObject<number>;
  trailerAngle: React.MutableRefObject<number>;
  getTruckState: () => TruckAnimState;
}

export const MergedTruckModel: React.FC<MergedTruckModelProps> = ({
  color,
  company,
  plateNumber,
  wheelRotation,
  throttle,
  trailerAngle,
  getTruckState,
}) => {
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);
  const cabGeos = useCabGeometries();
  const trailerGeos = useTrailerGeometries();

  // Refs for dynamic parts (groups)
  const cabGroupRef = useRef<THREE.Group>(null);
  const trailerGroupRef = useRef<THREE.Group>(null);

  // Wheel instances refs
  const frontWheelsRef = useRef<THREE.InstancedMesh>(null);
  const rearWheelsRef = useRef<THREE.InstancedMesh>(null);
  const trailerWheelsRef = useRef<THREE.InstancedMesh>(null);

  // Pre-rotated wheel geometry (Cylinder is Y-up, we rotate to X-axis once here)
  const wheelGeo = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.55, 0.55, 0.35, 24);
    g.rotateZ(Math.PI / 2);
    return g;
  }, []);

  // Hook up wheel animations
  const steeringAngle = useRef(0);
  useFrame(() => {
    if (!isTabVisible) return;
    steeringAngle.current = getTruckState().steeringAngle;
  });

  useWheelInstances(
    frontWheelsRef,
    wheelRotation,
    [
      [-1.4, 0.55, 2.5],
      [1.4, 0.55, 2.5],
    ],
    true,
    steeringAngle.current
  );
  useWheelInstances(
    rearWheelsRef,
    wheelRotation,
    [
      [-1.3, 0.55, -2.5],
      [-1.55, 0.55, -2.5],
      [1.3, 0.55, -2.5],
      [1.55, 0.55, -2.5],
      [-1.3, 0.55, -4],
      [-1.55, 0.55, -4],
      [1.3, 0.55, -4],
      [1.55, 0.55, -4],
    ],
    false
  );
  useWheelInstances(
    trailerWheelsRef,
    wheelRotation,
    [
      [-1.3, 0.55, -2.5],
      [-1.55, 0.55, -2.5],
      [1.3, 0.55, -2.5],
      [1.55, 0.55, -2.5],
      [-1.3, 0.55, -4],
      [-1.55, 0.55, -4],
      [1.3, 0.55, -4],
      [1.55, 0.55, -4],
    ],
    false
  );

  useFrame(() => {
    if (!isTabVisible) return;
    const state = getTruckState();

    // Cab Physics (Group Transform)
    if (cabGroupRef.current) {
      cabGroupRef.current.rotation.set(state.cabPitch, 0, state.cabRoll);
    }

    // Trailer Physics
    if (trailerGroupRef.current) {
      trailerGroupRef.current.rotation.y = THREE.MathUtils.lerp(
        trailerGroupRef.current.rotation.y,
        trailerAngle.current,
        0.1
      );
    }
  });

  const isEngineRunning = getTruckState().phase !== 'docked' || throttle.current > 0.05;

  return (
    <group>
      {/* === CAB === */}
      <group ref={cabGroupRef} position={[0, 0, 2]}>
        <mesh geometry={cabGeos.bodyGeo}>
          <meshStandardMaterial
            color={color}
            metalness={0.4}
            roughness={0.6}
            normalMap={PROCEDURAL_TEXTURES.paintedMetalNormal}
            normalScale={new THREE.Vector2(0.12, 0.12)}
          />
        </mesh>
        <mesh geometry={cabGeos.detailGeo}>
          <meshStandardMaterial
            color="#374151"
            metalness={0.6}
            roughness={0.4}
            normalMap={PROCEDURAL_TEXTURES.brushedMetal}
            normalScale={new THREE.Vector2(0.15, 0.15)}
          />
        </mesh>
        <mesh geometry={cabGeos.glassGeo}>
          <meshStandardMaterial
            color="#1e3a5f"
            metalness={0.9}
            roughness={0.1}
            transparent
            opacity={0.8}
          />
        </mesh>

        {/* Instanced Wheels (Cab) */}
        <instancedMesh ref={frontWheelsRef} args={[wheelGeo, undefined, 2]} castShadow>
          <meshStandardMaterial
            color="#1f2937"
            roughness={0.7}
            normalMap={PROCEDURAL_TEXTURES.rubberNormal}
            normalScale={new THREE.Vector2(0.3, 0.3)}
          />
        </instancedMesh>
        <instancedMesh ref={rearWheelsRef} args={[wheelGeo, undefined, 8]} castShadow>
          <meshStandardMaterial
            color="#1f2937"
            roughness={0.7}
            normalMap={PROCEDURAL_TEXTURES.rubberNormal}
            normalScale={new THREE.Vector2(0.3, 0.3)}
          />
        </instancedMesh>

        {/* Dynamic Cab Parts */}
        <LicensePlate position={[0, 0.5, 2.16]} plateNumber={plateNumber} />
        <HeadlightBeam position={[-0.9, 1.4, 2.1]} rotation={[-0.1, 0, 0]} isOn={isEngineRunning} />
        <HeadlightBeam position={[0.9, 1.4, 2.1]} rotation={[-0.1, 0, 0]} isOn={isEngineRunning} />
        <ExhaustSmoke
          position={[-1.2, 3.6, -0.8]}
          throttle={throttle.current}
          isRunning={isEngineRunning}
        />
        <ExhaustSmoke
          position={[1.2, 3.6, -0.8]}
          throttle={throttle.current}
          isRunning={isEngineRunning}
        />
        <CBAntennaComponent position={[1, 4, -0.2]} />
        <SunVisor position={[0, 3.3, 1.4]} color={color} />

        {/* Cab Marker Lights (Simple Mesh) */}
        {[-1.1, -0.55, 0, 0.55, 1.1].map((x, i) => (
          <mesh key={i} position={[x, 3.95, 0.5]}>
            <boxGeometry args={[0.15, 0.08, 0.1]} />
            <meshStandardMaterial color="#f97316" emissive="#f97316" emissiveIntensity={0.4} />
          </mesh>
        ))}
      </group>

      {/* Fifth wheel coupling */}
      <FifthWheelCoupling position={[0, 1.1, 0]} />

      {/* === TRAILER === */}
      <group ref={trailerGroupRef} position={[0, 0, -5]}>
        <mesh geometry={trailerGeos.bodyGeo}>
          <meshStandardMaterial
            color="#e2e8f0"
            metalness={0.4}
            roughness={0.4}
            normalMap={PROCEDURAL_TEXTURES.panelNormal}
            normalScale={new THREE.Vector2(0.12, 0.12)}
          />
        </mesh>
        <mesh geometry={trailerGeos.underGeo}>
          <meshStandardMaterial
            color="#1f2937"
            roughness={0.8}
            normalMap={PROCEDURAL_TEXTURES.brushedMetal}
            normalScale={new THREE.Vector2(0.2, 0.2)}
          />
        </mesh>

        {/* Instanced Wheels (Trailer) */}
        <instancedMesh ref={trailerWheelsRef} args={[wheelGeo, undefined, 8]} castShadow>
          <meshStandardMaterial
            color="#1f2937"
            roughness={0.7}
            normalMap={PROCEDURAL_TEXTURES.rubberNormal}
            normalScale={new THREE.Vector2(0.3, 0.3)}
          />
        </instancedMesh>

        {/* Dynamic Trailer Parts */}
        <AirTank position={[-0.8, 0.25, 2]} />
        <AirTank position={[0.8, 0.25, 2]} />
        <AirTank position={[-0.8, 0.25, 0]} />
        <AirTank position={[0.8, 0.25, 0]} />
        <GladHands position={[0, 1.2, 5.3]} />
        <DOTMarkerLights side="left" />
        <DOTMarkerLights side="right" />
        <ICCReflectiveTape side="left" />
        <ICCReflectiveTape side="right" />
        <HazmatPlacard position={[0, 3.5, 5.51]} rotation={[0, 0, 0]} type="non-hazardous" />
        <HazmatPlacard position={[0, 3.5, -5.51]} rotation={[0, Math.PI, 0]} type="non-hazardous" />
        <HazmatPlacard
          position={[-1.61, 3.5, 0]}
          rotation={[0, -Math.PI / 2, 0]}
          type="non-hazardous"
        />
        <HazmatPlacard
          position={[1.61, 3.5, 0]}
          rotation={[0, Math.PI / 2, 0]}
          type="non-hazardous"
        />
        <MudflapWithLogo position={[-1.7, 0.35, -4.8]} company={company} />
        <MudflapWithLogo position={[1.7, 0.35, -4.8]} company={company} />
        <LicensePlate
          position={[0, 0.6, -5.58]}
          rotation={[0, Math.PI, 0]}
          plateNumber={plateNumber}
        />

        {company === 'GRAIN CO' ? (
          <>
            <GrainCoLogo side="right" />
            <GrainCoLogo side="left" />
          </>
        ) : (
          <>
            <FlourExpressLogo side="right" />
            <FlourExpressLogo side="left" />
          </>
        )}
      </group>
    </group>
  );
};
