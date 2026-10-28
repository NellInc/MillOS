import { type ReactNode, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useDracoGLTF } from '../../utils/dracoLoader';
import { GENERATED_ASSET_PATHS } from '../../utils/modelLoader';
import {
  useProcessInspectionStore,
  type ProcessInspectionStage,
} from '../../stores/processInspectionStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useMaterialFlowStore } from '../../stores/materialFlowStore';
import { useGraphicsStore } from '../../stores/graphicsStore';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useCameraStore } from '../CameraController';
import { EXTERIOR_LAMP_LEVEL, EXTERIOR_LAMP_LENS_MATERIAL } from '../exterior/ExteriorLighting';
import { GeneratedBody, GeneratedBoundary } from './GeneratedModel';
import { CreatureBody, type CreatureRigHandle } from './RiggedCreatureModel';
import { taskLitMaterial, type WindmillTaskLight } from './WindmillInterior';
import {
  createHenhouseInterior,
  prepareHenhouseSection,
  sampleHenhouseTime,
  sampleHenhouseGrain,
} from './henhouseSection';

function HenhouseInterior({
  frame,
  stage,
}: {
  frame: THREE.Matrix4;
  stage: ProcessInspectionStage;
}) {
  const root = useRef<THREE.Group>(null);
  const floorHen = useRef<THREE.Group>(null),
    perchHen = useRef<THREE.Group>(null);
  const floorRig = useRef<CreatureRigHandle>(null),
    perchRig = useRef<CreatureRigHandle>(null);
  const grains = useRef<THREE.InstancedMesh>(null);
  const reducedMotion = useReducedMotion();
  const directLight = useGraphicsStore(
    (state) =>
      !state.graphics.perfDebug.disablePunctualLights &&
      !state.graphics.perfDebug.disableLightingPolish
  );
  const placement = useMemo(() => {
    const origin = new THREE.Vector3(),
      quaternion = new THREE.Quaternion(),
      size = new THREE.Vector3();
    frame.decompose(origin, quaternion, size);
    if (Math.max(Math.abs(size.x - size.y), Math.abs(size.x - size.z)) > 1e-5)
      throw new Error('Henhouse needs the retained uniform normalization');
    return {
      scale: size.x,
      matrix: new THREE.Matrix4().compose(origin, quaternion, new THREE.Vector3(1, 1, 1)),
    };
  }, [frame]);
  const light = useMemo<WindmillTaskLight>(
    () => ({
      position: { value: new THREE.Vector3() },
      color: { value: new THREE.Color('#ffdda8') },
      strength: { value: 0 },
      gain: { value: 1 },
    }),
    []
  );
  const geometry = useMemo(() => createHenhouseInterior(placement.scale), [placement.scale]);
  const materials = useMemo(
    () => ({
      wood: taskLitMaterial('#946d45', 'painted', light),
      straw: taskLitMaterial('#baa06a', 'fabric', light),
      egg: taskLitMaterial('#e0d2af', 'masonry', light),
      metal: taskLitMaterial('#696967', 'metal', light, 0.5),
      water: taskLitMaterial('#788b86', 'metal', light, 0.2),
    }),
    [light]
  );
  const kernel = useMemo(() => new THREE.SphereGeometry(0.005, 5, 3).scale(1, 0.65, 0.65), []);
  const scratch = useMemo(() => ({ point: new THREE.Vector3(), matrix: new THREE.Matrix4() }), []);
  const time = useRef({ source: useMaterialFlowStore.getState().simulationTime, admitted: 0 });
  useEffect(
    () => () => {
      Object.values(geometry).forEach((g) => g.dispose());
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
  useFrame(() => {
    const simulation = useGameSimulationStore.getState();
    const running = !reducedMotion && simulation.isTabVisible && simulation.gameSpeed > 0;
    const sourceTime = useMaterialFlowStore.getState().simulationTime;
    const t = sampleHenhouseTime(time.current, sourceTime, running);
    time.current.source = sourceTime;
    time.current.admitted = t;
    if (root.current) {
      light.position.value.set(-0.18, 0.095, -0.21).multiplyScalar(placement.scale);
      root.current.localToWorld(light.position.value);
      light.strength.value = directLight
        ? EXTERIOR_LAMP_LEVEL.value * (stage === 2 ? 0.8 : 2.5)
        : 0;
    }
    // Existing licensed rig, local illustrative residents only. No actor store writes.
    floorRig.current?.setGraze(0.12 + Math.sin(t * 0.7) * 0.035);
    floorRig.current?.setHeadShake(Math.sin(t * 0.32) * 0.045);
    perchRig.current?.setGraze(0.04 + Math.sin(t * 0.53 + 1) * 0.02);
    perchRig.current?.setHeadShake(Math.sin(t * 0.27 + 2) * 0.035);
    if (floorHen.current) floorHen.current.scale.y = 1 + Math.sin(t * 1.7) * 0.006;
    if (perchHen.current) perchHen.current.scale.y = 1 + Math.sin(t * 1.5 + 1) * 0.006;
    if (grains.current) {
      grains.current.visible = stage === 1;
      for (let i = 0; i < 12; i++) {
        sampleHenhouseGrain(t * 0.1 + i / 12, scratch.point).multiplyScalar(placement.scale);
        scratch.matrix.makeTranslation(scratch.point);
        grains.current.setMatrixAt(i, scratch.matrix);
      }
      grains.current.instanceMatrix.needsUpdate = true;
    }
  });
  const p = (x: number, y: number, z: number): THREE.Vector3Tuple => [
    x * placement.scale,
    y * placement.scale,
    z * placement.scale,
  ];
  return (
    <group
      ref={root}
      name="henhouse-interior"
      matrix={placement.matrix}
      matrixAutoUpdate={false}
      userData={{ noStaticBatch: true }}
      dispose={null}
    >
      {(['wood', 'straw', 'egg', 'metal', 'water'] as const).map((name) => (
        <mesh key={name} geometry={geometry[name]} material={materials[name]} receiveShadow />
      ))}
      <mesh geometry={geometry.lens} material={EXTERIOR_LAMP_LENS_MATERIAL} />
      <instancedMesh ref={grains} args={[kernel, materials.straw, 12]} frustumCulled={false} />
      <group ref={floorHen} position={p(-0.27, -0.274, 0.045)}>
        <CreatureBody ref={floorRig} creature="chicken" fallback={null} />
      </group>
      <group ref={perchHen} position={p(-0.19, -0.117, -0.045)} rotation={[0, 0.2, 0]}>
        <CreatureBody ref={perchRig} creature="chicken" fallback={null} />
      </group>
    </group>
  );
}

function LoadedHenhouse({ fallback }: { fallback: ReactNode }) {
  const { scene } = useDracoGLTF(GENERATED_ASSET_PATHS.coop);
  const root = useRef<THREE.Group>(null);
  const open = useProcessInspectionStore((state) => state.active?.id === 'henhouse');
  const stage = useProcessInspectionStore((state) => state.stage);
  const prepared = useMemo(() => (open ? prepareHenhouseSection(scene) : null), [scene, open]);
  useEffect(() => {
    let realMesh = false;
    scene.traverse((object) => {
      if ((object as THREE.Mesh).isMesh) realMesh = true;
    });
    if (realMesh)
      return useProcessInspectionStore
        .getState()
        .register({ id: 'henhouse', kind: 'henhouse', name: 'Henhouse' });
  }, [scene]);
  useEffect(() => () => prepared?.dispose(), [prepared]);
  useEffect(() => {
    if (!open || !prepared || !root.current) return;
    root.current.updateWorldMatrix(true, false);
    const frame = root.current.matrixWorld.clone().multiply(prepared.frame);
    const targets: THREE.Vector3Tuple[] = [
      [-0.25, -0.19, -0.17],
      [-0.22, -0.25, 0.15],
      [-0.19, -0.11, -0.045],
      [-0.25, -0.21, -0.17],
    ];
    const target = new THREE.Vector3(...targets[stage]).applyMatrix4(frame);
    const direction = new THREE.Vector3(0.16, 0.14, 1).transformDirection(frame);
    const eye = target.clone().addScaledVector(direction, 15.5);
    useCameraStore.getState().focusOn(eye.toArray(), target.toArray());
    useCameraStore.setState({ targetFov: stage === 1 ? 12 : 14 });
    const ownedTarget = useCameraStore.getState().targetPosition;
    return () => {
      const camera = useCameraStore.getState();
      if (camera.isAnimating && camera.targetPosition === ownedTarget) camera.cancelAnimation();
    };
  }, [open, prepared, stage]);
  return (
    <group ref={root} name="henhouse-inspection" userData={{ noStaticBatch: true }} dispose={null}>
      {prepared ? (
        <>
          <primitive object={prepared.model} />
          <HenhouseInterior frame={prepared.frame} stage={stage} />
        </>
      ) : (
        <GeneratedBody asset="coop" fallback={fallback} />
      )}
    </group>
  );
}

export function HenhouseInspection({ fallback }: { fallback: ReactNode }) {
  return (
    <GeneratedBoundary fallback={fallback}>
      <LoadedHenhouse fallback={fallback} />
    </GeneratedBoundary>
  );
}
