import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { MachineData } from '../../types';
import type { MachineOperationalState } from '../../simulation/machineMotion';
import { getMachineAssemblyScale } from '../../constants/siteLayout';
import { useProcessInspectionStore } from '../../stores/processInspectionStore';
import { useGraphicsStore } from '../../stores/graphicsStore';
import { useCameraStore } from '../CameraController';
import { taskLitMaterial, type WindmillTaskLight } from '../models/WindmillInterior';
import { EXTERIOR_LAMP_LEVEL } from '../exterior/ExteriorLighting';
import {
  createMachineInspectionGeometry,
  machineInspectionKind,
  sampleMachineInspectionGrain,
  machineInspectionLampPosition,
} from './machineInspectionGeometry';

/** Mutated by the incumbent assembly owner before this frame callback. */
export interface MachineInspectionPose {
  phase: number | null;
  offset: THREE.Vector3Tuple;
  state: MachineOperationalState;
  fill: number;
  cycle: number;
}

export function MachineInspectionInterior({
  machine,
  pose,
  onSelect,
}: {
  machine: MachineData;
  pose: RefObject<MachineInspectionPose>;
  onSelect: (machine: MachineData) => void;
}) {
  const stage = useProcessInspectionStore((s) => s.stage);
  const kind = machineInspectionKind(machine.type)!;
  const root = useRef<THREE.Group>(null),
    mechanism = useRef<THREE.Group>(null);
  const rollA = useRef<THREE.Mesh>(null),
    rollB = useRef<THREE.Mesh>(null),
    gate = useRef<THREE.Mesh>(null);
  const column = useRef<THREE.Mesh>(null),
    particles = useRef<THREE.InstancedMesh>(null);
  const scale = useMemo(() => getMachineAssemblyScale(machine), [machine]);
  const geometry = useMemo(() => createMachineInspectionGeometry(machine), [machine]);
  const direct = useGraphicsStore(
    (s) =>
      !s.graphics.perfDebug.disablePunctualLights && !s.graphics.perfDebug.disableLightingPolish
  );
  const light = useMemo<WindmillTaskLight>(
    () => ({
      position: { value: new THREE.Vector3() },
      color: { value: new THREE.Color('#ffdfa9') },
      strength: { value: 0 },
      gain: { value: 1 },
    }),
    []
  );
  const materials = useMemo(
    () => ({
      shell: taskLitMaterial(
        kind === 'mill' ? '#c8c5ad' : kind === 'sifter' ? '#c7ad7c' : '#a7b8b5',
        'painted',
        light
      ),
      lining: taskLitMaterial('#b2c2c0', 'metal', light, 0.28),
      metal: taskLitMaterial('#576967', 'metal', light, 0.55),
      brass: taskLitMaterial('#c19a5a', 'metal', light, 0.4),
      screens: taskLitMaterial('#8b9c9a', 'metal', light, 0.45),
      roller: taskLitMaterial('#8b9998', 'metal', light, 0.6),
      gate: taskLitMaterial('#acbabb', 'metal', light, 0.5),
      grain: taskLitMaterial('#caaa65', 'fabric', light),
    }),
    [kind, light]
  );
  const particleBounds = useMemo(
    () =>
      new THREE.Sphere(
        new THREE.Vector3(0, 3.1 * scale[1], 0.5 * scale[2]),
        4.6 * Math.max(...scale)
      ),
    [scale]
  );
  const kernel = useMemo(() => new THREE.SphereGeometry(0.026, 6, 4).scale(1.5, 0.7, 0.7), []);
  const scratch = useMemo(
    () => ({
      point: new THREE.Vector3(),
      scale: new THREE.Vector3(...scale),
      matrix: new THREE.Matrix4(),
    }),
    [scale]
  );
  useEffect(
    () => () => {
      Object.values(geometry).forEach((g) => g?.dispose());
    },
    [geometry]
  );
  useEffect(
    () => () => {
      Object.values(materials).forEach((m) => m.dispose());
      kernel.dispose();
    },
    [materials, kernel]
  );
  useEffect(() => {
    const targets: THREE.Vector3Tuple[] =
      kind === 'silo'
        ? [
            [0, 8.1, 0],
            [0, 8.5, 0],
            [0, 4, 0],
            [0, 1.4, 0],
          ]
        : kind === 'mill'
          ? [
              [0, 5.3, 0],
              [0, 2.6, 0],
              [0, 2.1, 0],
              [0, 0.9, 0],
            ]
          : kind === 'sifter'
            ? [
                [0, 5.7, 0],
                [0, 3.2, 0],
                [0, 2.5, 0],
                [0, 0.7, 0],
              ]
            : [
                [0, 5.5, 0],
                [0, 3.8, 0],
                [0, 2.75, 0],
                [0, 1.6 / scale[1], 1.9 / scale[2]],
              ];
    const target = new THREE.Vector3(...targets[stage])
      .multiply(new THREE.Vector3(...scale))
      .add(new THREE.Vector3(...machine.position));
    const size =
      kind === 'silo'
        ? Math.max(5.4 * scale[0], (stage === 0 ? 17.5 : 5.5) * scale[1])
        : kind === 'sifter'
          ? 3.9
          : 3;
    const distance = Math.max(15.5, size * 1.5);
    const eye = target
      .clone()
      .add(
        new THREE.Vector3(
          ...(kind === 'mill' && (stage === 1 || stage === 2)
            ? ([0.6, 1.7, 1] as const)
            : ([0.19, 0.14, 1] as const))
        )
          .normalize()
          .multiplyScalar(distance)
      );
    useCameraStore.getState().focusOn(eye.toArray(), target.toArray());
    useCameraStore.setState({
      targetFov: THREE.MathUtils.radToDeg(2 * Math.atan(size / (2 * distance))),
    });
    const owned = useCameraStore.getState().targetPosition;
    return () => {
      const camera = useCameraStore.getState();
      if (camera.isAnimating && camera.targetPosition === owned) camera.cancelAnimation();
    };
  }, [machine, kind, scale, stage]);
  useFrame(() => {
    const p = pose.current;
    if (!p || !root.current) return;
    const t = p.phase ?? 0;
    if (mechanism.current) mechanism.current.position.set(...p.offset);
    if (rollA.current) rollA.current.rotation.x = t * 4.5;
    if (rollB.current) rollB.current.rotation.x = -t * 4.5;
    if (gate.current) gate.current.position.x = p.cycle * 0.34 * scale[0];
    if (column.current) {
      column.current.visible = p.fill > 0;
      column.current.scale.y = p.fill * 11.9;
    }
    machineInspectionLampPosition(kind, stage, scale, p.fill, light.position.value);
    root.current.localToWorld(light.position.value);
    light.strength.value = direct ? 2 + EXTERIOR_LAMP_LEVEL.value * 12 : 0;
    root.current.userData.phase = p.phase;
    root.current.userData.state = p.state;
    root.current.userData.fill = p.fill;
    if (particles.current) {
      particles.current.visible = p.phase !== null && kind !== 'silo';
      for (let i = 0; i < 18; i++) {
        sampleMachineInspectionGrain(
          kind,
          stage,
          (((t * 0.15 + i / 18) % 1) + 1) % 1,
          scratch.point
        );
        scratch.point.multiply(scratch.scale);
        scratch.matrix.makeTranslation(scratch.point);
        particles.current.setMatrixAt(i, scratch.matrix);
      }
      particles.current.instanceMatrix.needsUpdate = true;
    }
  });
  const pick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (event.delta <= 4) onSelect(machine);
  };
  const at = (x: number, y: number, z: number): THREE.Vector3Tuple => [
    x * scale[0],
    y * scale[1],
    z * scale[2],
  ];
  return (
    <group
      ref={root}
      name={`machine-inspection-${machine.id}`}
      position={machine.position}
      userData={{ noStaticBatch: true, kind }}
      dispose={null}
      onClick={pick}
    >
      <group ref={mechanism}>
        {(['shell', 'lining', 'metal', 'brass', 'screens'] as const).map(
          (key) =>
            geometry[key] && (
              <mesh
                key={key}
                geometry={geometry[key]}
                material={materials[key]}
                receiveShadow
                castShadow
              />
            )
        )}
        {geometry.roller && (
          <>
            <mesh
              ref={rollA}
              geometry={geometry.roller}
              material={materials.roller}
              position={at(0, 2.28, -0.49)}
              castShadow
            />
            <mesh
              ref={rollB}
              geometry={geometry.roller}
              material={materials.roller}
              position={at(0, 2.28, 0.49)}
              castShadow
            />
          </>
        )}
        {geometry.gate && (
          <mesh ref={gate} geometry={geometry.gate} material={materials.gate} castShadow />
        )}
        {geometry.grain && (
          <mesh
            ref={column}
            geometry={geometry.grain}
            material={materials.grain}
            position={at(0, 2.55, 0)}
            receiveShadow
          />
        )}
        <instancedMesh
          ref={particles}
          args={[kernel, materials.grain, 18]}
          boundingSphere={particleBounds}
        />
      </group>
    </group>
  );
}
