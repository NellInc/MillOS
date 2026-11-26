import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useMaterialFlowStore } from '../../stores/materialFlowStore';

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const ROLLER = new THREE.CylinderGeometry(1, 1, 1, 10);
const ROLLER_POSITIONS = [-13.5, -10.5, -7.5, -4.5, -1.5, 1.5, 4.5, 7.5, 10.5, 13.5];

const FRAME_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#394952',
  roughness: 0.45,
  metalness: 0.62,
});
const RAIL_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#71828b',
  roughness: 0.42,
  metalness: 0.58,
});
const ROLLER_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#aebbc0',
  roughness: 0.3,
  metalness: 0.76,
});
const BAG_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#d9ca9f',
  roughness: 0.94,
  metalness: 0,
});

interface BoxInstance {
  readonly position: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
  readonly rotationY?: number;
}

function StaticBoxes({
  instances,
  material,
}: {
  readonly instances: readonly BoxInstance[];
  readonly material: THREE.Material;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    if (!ref.current) return;
    const object = new THREE.Object3D();
    instances.forEach((instance, index) => {
      object.position.set(...instance.position);
      object.scale.set(...instance.scale);
      object.rotation.set(0, instance.rotationY ?? 0, 0);
      object.updateMatrix();
      ref.current?.setMatrixAt(index, object.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [instances]);

  return (
    <instancedMesh
      ref={ref}
      args={[UNIT_BOX, material, instances.length]}
      castShadow
      receiveShadow
    />
  );
}

function createBeltMaterial() {
  const material = new THREE.ShaderMaterial({
    name: 'MillOS Compact Conveyor Belt',
    uniforms: {
      uTime: { value: 0 },
      uSpeed: { value: 1 },
      uBase: { value: new THREE.Color('#172127') },
      uRidge: { value: new THREE.Color('#3c5965') },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uSpeed;
      uniform vec3 uBase;
      uniform vec3 uRidge;
      varying vec2 vUv;
      void main() {
        float stripe = smoothstep(0.72, 0.9, fract(vUv.x * 18.0 - uTime * uSpeed));
        float centre = 1.0 - smoothstep(0.02, 0.035, abs(vUv.y - 0.5));
        vec3 colour = mix(uBase, uRidge, stripe * 0.42);
        colour = mix(colour, vec3(0.16, 0.46, 0.63), centre * 0.34);
        gl_FragColor = vec4(colour, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  material.customProgramCacheKey = () => 'millos-compact-conveyor-v2';
  return material;
}

export function CompactConveyorSystem({ productionSpeed }: { readonly productionSpeed: number }) {
  const beltMaterial = useMemo(createBeltMaterial, []);
  const rollerRef = useRef<THREE.InstancedMesh>(null);
  const bagRef = useRef<THREE.InstancedMesh>(null);
  const objectRef = useRef(new THREE.Object3D());
  const lastRollerTimeRef = useRef(Number.NaN);
  const lastBagStateRef = useRef({ time: Number.NaN, count: -1 });
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);

  useEffect(() => () => beltMaterial.dispose(), [beltMaterial]);

  const frames = useMemo<readonly BoxInstance[]>(
    () => [
      { position: [0, 0.62, 24], scale: [55, 0.18, 2.6] },
      { position: [0, 0.62, 21], scale: [30, 0.18, 2.6] },
      { position: [0, 0.62, -1], scale: [38, 0.18, 2.6], rotationY: Math.PI / 2 },
    ],
    []
  );
  const rails = useMemo<readonly BoxInstance[]>(
    () => [
      { position: [0, 1.14, 22.62], scale: [55, 0.16, 0.12] },
      { position: [0, 1.14, 25.38], scale: [55, 0.16, 0.12] },
      { position: [0, 1.14, 19.62], scale: [30, 0.16, 0.12] },
      { position: [0, 1.14, 22.38], scale: [30, 0.16, 0.12] },
      { position: [-1.38, 1.14, -1], scale: [0.12, 0.16, 38] },
      { position: [1.38, 1.14, -1], scale: [0.12, 0.16, 38] },
    ],
    []
  );
  const legs = useMemo<readonly BoxInstance[]>(() => {
    const result: BoxInstance[] = [];
    [-24, -12, 0, 12, 24].forEach((x) => {
      result.push({ position: [x, 0.31, 22.75], scale: [0.22, 0.62, 0.22] });
      result.push({ position: [x, 0.31, 25.25], scale: [0.22, 0.62, 0.22] });
    });
    [-14, -7, 0, 7, 14].forEach((z) => {
      result.push({ position: [-1.25, 0.31, z - 1], scale: [0.22, 0.62, 0.22] });
      result.push({ position: [1.25, 0.31, z - 1], scale: [0.22, 0.62, 0.22] });
    });
    return result;
  }, []);

  useLayoutEffect(() => {
    if (!rollerRef.current) return;
    const object = objectRef.current;
    ROLLER_POSITIONS.forEach((x, index) => {
      object.position.set(x, 0.88, 21);
      object.scale.set(0.34, 2.34, 0.34);
      object.rotation.set(Math.PI / 2, 0, 0);
      object.updateMatrix();
      rollerRef.current?.setMatrixAt(index, object.matrix);
    });
    rollerRef.current.instanceMatrix.needsUpdate = true;
    rollerRef.current.computeBoundingSphere();

    if (!bagRef.current) return;
    for (let index = 0; index < 12; index += 1) {
      const onMainBelt = index < 7;
      const laneIndex = onMainBelt ? index : index - 7;
      const laneLength = onMainBelt ? 52 : 42.5;
      const progress = (laneIndex * (laneLength / (onMainBelt ? 7 : 5))) / laneLength;
      if (onMainBelt) {
        object.position.set(-26 + progress * 52, 1.38, 24);
      } else {
        object.position.set(0, 1.38, -18.5 + progress * 42.5);
      }
      object.scale.set(0.78, 0.66, 1.05);
      object.rotation.set(0, onMainBelt ? 0 : Math.PI / 2, 0);
      object.updateMatrix();
      bagRef.current.setMatrixAt(index, object.matrix);
    }
    bagRef.current.instanceMatrix.needsUpdate = true;
    bagRef.current.computeBoundingSphere();
  }, []);

  useFrame(({ camera }) => {
    if (!isTabVisible) return;
    const flowState = useMaterialFlowStore.getState();
    const simulationTime = flowState.simulationTime;
    const activeSpeed = Math.max(0, productionSpeed);
    beltMaterial.uniforms.uTime.value = simulationTime;
    beltMaterial.uniforms.uSpeed.value = activeSpeed > 0 ? 1.4 : 0;

    const rollerDistanceSquared =
      camera.position.x * camera.position.x +
      (camera.position.y - 0.88) * (camera.position.y - 0.88) +
      (camera.position.z - 21) * (camera.position.z - 21);
    if (
      rollerRef.current &&
      rollerDistanceSquared < 90 * 90 &&
      simulationTime !== lastRollerTimeRef.current
    ) {
      lastRollerTimeRef.current = simulationTime;
      const object = objectRef.current;
      ROLLER_POSITIONS.forEach((x, index) => {
        object.position.set(x, 0.88, 21);
        object.scale.set(0.34, 2.34, 0.34);
        object.rotation.set(Math.PI / 2, simulationTime * 3, 0);
        object.updateMatrix();
        rollerRef.current?.setMatrixAt(index, object.matrix);
      });
      rollerRef.current.instanceMatrix.needsUpdate = true;
    }

    if (!bagRef.current) return;
    const finishedGoodsKg = ['packer-0', 'packer-1', 'packer-2'].reduce((total, machineId) => {
      const buffer = flowState.machineBuffers.get(machineId);
      return (
        total + (buffer?.outputBuffer.reduce((sum, material) => sum + material.amount, 0) ?? 0)
      );
    }, 0);
    const activeBagCount = THREE.MathUtils.clamp(
      Math.ceil((finishedGoodsKg + flowState.currentPackerFlowRate * 2) / 25),
      0,
      12
    );
    bagRef.current.count = activeBagCount;
    if (
      simulationTime === lastBagStateRef.current.time &&
      activeBagCount === lastBagStateRef.current.count
    ) {
      return;
    }
    lastBagStateRef.current.time = simulationTime;
    lastBagStateRef.current.count = activeBagCount;
    if (activeBagCount <= 0) return;
    const object = objectRef.current;
    for (let index = 0; index < activeBagCount; index += 1) {
      const onMainBelt = index < 7;
      const laneIndex = onMainBelt ? index : index - 7;
      const laneLength = onMainBelt ? 52 : 42.5;
      const progress =
        ((simulationTime * (onMainBelt ? 2.2 : 1.65) +
          laneIndex * (laneLength / (onMainBelt ? 7 : 5))) %
          laneLength) /
        laneLength;
      if (onMainBelt) {
        object.position.set(-26 + progress * 52, 1.38, 24);
      } else {
        object.position.set(0, 1.38, -18.5 + progress * 42.5);
      }
      object.scale.set(0.78, 0.66, 1.05);
      object.rotation.set(0, onMainBelt ? 0 : Math.PI / 2, 0);
      object.updateMatrix();
      bagRef.current.setMatrixAt(index, object.matrix);
    }
    bagRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <group name="compact-conveyor-system" dispose={null}>
      <StaticBoxes instances={frames} material={FRAME_MATERIAL} />
      <StaticBoxes instances={rails} material={RAIL_MATERIAL} />
      <StaticBoxes instances={legs} material={FRAME_MATERIAL} />

      <mesh
        geometry={UNIT_BOX}
        material={beltMaterial}
        position={[0, 0.82, 24]}
        scale={[54.5, 0.12, 2.35]}
        receiveShadow
      />
      <mesh
        geometry={UNIT_BOX}
        material={beltMaterial}
        position={[0, 0.82, -1]}
        rotation={[0, Math.PI / 2, 0]}
        scale={[37.5, 0.12, 2.35]}
        receiveShadow
      />

      <instancedMesh
        ref={rollerRef}
        args={[ROLLER, ROLLER_MATERIAL, 10]}
        castShadow
        receiveShadow
      />
      <instancedMesh ref={bagRef} args={[UNIT_BOX, BAG_MATERIAL, 12]} castShadow />
    </group>
  );
}
