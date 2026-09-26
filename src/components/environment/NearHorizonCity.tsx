import { GeneratedBoundary } from '../models/GeneratedModel';
import { GeneratedGeometrySurface } from '../models/GeneratedGeometrySurface';
import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { RENDER_ORDER } from '../../constants/renderLayers';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { getExteriorLampLevel } from '../exterior/ExteriorLighting';

export interface NearCityBuildingSpec {
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  readonly yaw: number;
  readonly tone: number;
  readonly roofStyle: number;
  readonly districtBand: number;
}

const deterministicNoise = (index: number, channel: number): number => {
  const value = Math.sin(index * 91.731 + channel * 37.117 + 8.913) * 43758.5453;
  return value - Math.floor(value);
};

/** A compact, world-anchored skyline that restores nearby parallax. */
export const buildNearCitySpecs = (count = 42): NearCityBuildingSpec[] =>
  Array.from({ length: count }, (_, index) => {
    const districtBand = index % 3;
    const buildingsInBand = Math.ceil(count / 3);
    const positionInBand = Math.floor(index / 3);
    const progress = buildingsInBand <= 1 ? 0.5 : positionInBand / (buildingsInBand - 1);
    const angle =
      THREE.MathUtils.lerp(-0.56, 0.16, progress) + (deterministicNoise(index, 6) - 0.5) * 0.045;
    // Keep the complete footprints beyond the river's east bank. The former
    // 184 m arc left building feet suspended over the channel and its culvert;
    // the town now sits at the foot of the foothills, which begin at
    // world.radius + 16, rather than inside their slope.
    // Working if rays through both terrain grids find level ground under every foot.
    const radius = 226 + districtBand * 12 + deterministicNoise(index, 0) * 6;
    const landmark = deterministicNoise(index, 1) > 0.93;
    const height =
      6.5 + deterministicNoise(index, 2) * 13 + districtBand * 1.25 + (landmark ? 6 : 0);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    return {
      x,
      z,
      width: 5.5 + deterministicNoise(index, 3) * 5.5,
      depth: 5 + deterministicNoise(index, 4) * 5.5,
      height,
      yaw: Math.atan2(-x, -z),
      tone: deterministicNoise(index, 5),
      roofStyle: Math.floor(deterministicNoise(index, 7) * 3),
      districtBand,
    };
  });

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const CITY_BODY_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#ffffff',
  emissive: '#222927',
  emissiveIntensity: 0.22,
  roughness: 0.88,
  metalness: 0.04,
  // setColorAt supplies instanceColor. UNIT_BOX has no vertex colour attribute;
  // enabling vertexColors additionally multiplies the authored palette by zero.
  vertexColors: false,
});
const CITY_ROOF_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#666d6c',
  roughness: 0.82,
  metalness: 0.08,
});
const CITY_WINDOW_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#647d88',
  emissive: '#ffca72',
  emissiveIntensity: 0,
  roughness: 0.36,
  metalness: 0.06,
});
const CITY_MECHANICAL_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#7a8483',
  roughness: 0.7,
  metalness: 0.18,
});
const CITY_STACK_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#58605f',
  roughness: 0.58,
  metalness: 0.28,
});
const CITY_BODY_COLOURS = [
  new THREE.Color('#9ba39e'),
  new THREE.Color('#aa9f91'),
  new THREE.Color('#8fa1a6'),
  new THREE.Color('#9e9690'),
  new THREE.Color('#a5aaa2'),
] as const;

interface WindowSpec {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly width: number;
  readonly yaw: number;
}

interface RooftopSpec {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly yaw: number;
}

export const NearHorizonCity: React.FC = () => {
  const buildings = useMemo(() => buildNearCitySpecs(), []);
  const windows = useMemo<WindowSpec[]>(() => {
    const result: WindowSpec[] = [];
    buildings.forEach((building, buildingIndex) => {
      const inwardX = -building.x / Math.hypot(building.x, building.z);
      const inwardZ = -building.z / Math.hypot(building.x, building.z);
      const columns = building.width > 7 ? 4 : 3;
      const floors = Math.max(2, Math.floor((building.height - 3) / 3.5));
      for (let floor = 0; floor < floors; floor += 1) {
        for (let column = 0; column < columns; column += 1) {
          if (deterministicNoise(buildingIndex * 31 + floor * 5 + column, 8) < 0.18) continue;
          const across = (column + 0.5) / columns - 0.5;
          const tangentX = -inwardZ;
          const tangentZ = inwardX;
          result.push({
            x:
              building.x +
              inwardX * (building.depth / 2 + 0.05) +
              tangentX * across * building.width * 0.76,
            y: 2.3 + floor * 3.5,
            z:
              building.z +
              inwardZ * (building.depth / 2 + 0.05) +
              tangentZ * across * building.width * 0.76,
            width: (building.width / columns) * 0.38,
            yaw: building.yaw,
          });
        }
      }
    });
    return result;
  }, [buildings]);
  const rooftopEquipment = useMemo<RooftopSpec[]>(
    () =>
      buildings
        .filter((building) => building.roofStyle !== 0)
        .map((building, index) => ({
          x: building.x,
          y: building.height + 0.34,
          z: building.z,
          width: building.width * (0.22 + deterministicNoise(index, 11) * 0.16),
          height: 0.65 + deterministicNoise(index, 12) * 0.55,
          depth: building.depth * (0.2 + deterministicNoise(index, 13) * 0.14),
          yaw: building.yaw,
        })),
    [buildings]
  );
  const stacks = useMemo<RooftopSpec[]>(
    () =>
      buildings
        .filter((building) => building.roofStyle === 2)
        .map((building, index) => {
          const radialLength = Math.hypot(building.x, building.z);
          const inwardX = -building.x / radialLength;
          const inwardZ = -building.z / radialLength;
          const tangentX = -inwardZ;
          const tangentZ = inwardX;
          const offset = building.width * (deterministicNoise(index, 14) - 0.5) * 0.45;
          const height = 1.8 + deterministicNoise(index, 15) * 2.1;
          return {
            x: building.x + tangentX * offset,
            y: building.height + height / 2,
            z: building.z + tangentZ * offset,
            width: 0.22 + deterministicNoise(index, 16) * 0.18,
            height,
            depth: 0.22 + deterministicNoise(index, 17) * 0.18,
            yaw: building.yaw,
          };
        }),
    [buildings]
  );
  const bodiesRef = useRef<THREE.InstancedMesh>(null);
  const roofsRef = useRef<THREE.InstancedMesh>(null);
  const windowsRef = useRef<THREE.InstancedMesh>(null);
  const equipmentRef = useRef<THREE.InstancedMesh>(null);
  const stacksRef = useRef<THREE.InstancedMesh>(null);
  const initialLightLevel = getExteriorLampLevel(
    useGameSimulationStore.getState().gameTime,
    useGameSimulationStore.getState().weather
  );
  const lightTargetRef = useRef(initialLightLevel);
  const lightLevelRef = useRef(initialLightLevel);

  useLayoutEffect(() => {
    const bodies = bodiesRef.current;
    const roofs = roofsRef.current;
    const windowMesh = windowsRef.current;
    const equipmentMesh = equipmentRef.current;
    const stackMesh = stacksRef.current;
    if (!bodies || !roofs || !windowMesh || !equipmentMesh || !stackMesh) return;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const euler = new THREE.Euler();

    buildings.forEach((building, index) => {
      position.set(building.x, building.height / 2 - 0.8, building.z);
      rotation.setFromEuler(euler.set(0, building.yaw, 0));
      scale.set(building.width, building.height, building.depth);
      bodies.setMatrixAt(index, matrix.compose(position, rotation, scale));
      bodies.setColorAt(
        index,
        CITY_BODY_COLOURS[
          Math.floor(building.tone * CITY_BODY_COLOURS.length) % CITY_BODY_COLOURS.length
        ]
      );

      position.set(building.x, building.height - 0.35, building.z);
      const roofInset = building.roofStyle === 0 ? 0.76 : 0.66;
      scale.set(building.width * roofInset, 0.7, building.depth * roofInset);
      roofs.setMatrixAt(index, matrix.compose(position, rotation, scale));
    });
    windows.forEach((window, index) => {
      position.set(window.x, window.y, window.z);
      rotation.setFromEuler(euler.set(0, window.yaw, 0));
      scale.set(window.width, 0.54, 0.09);
      windowMesh.setMatrixAt(index, matrix.compose(position, rotation, scale));
    });
    rooftopEquipment.forEach((equipment, index) => {
      position.set(equipment.x, equipment.y, equipment.z);
      rotation.setFromEuler(euler.set(0, equipment.yaw, 0));
      scale.set(equipment.width, equipment.height, equipment.depth);
      equipmentMesh.setMatrixAt(index, matrix.compose(position, rotation, scale));
    });
    stacks.forEach((stack, index) => {
      position.set(stack.x, stack.y, stack.z);
      rotation.setFromEuler(euler.set(0, stack.yaw, 0));
      scale.set(stack.width, stack.height, stack.depth);
      stackMesh.setMatrixAt(index, matrix.compose(position, rotation, scale));
    });
    bodies.instanceMatrix.needsUpdate = true;
    bodies.instanceColor!.needsUpdate = true;
    roofs.instanceMatrix.needsUpdate = true;
    windowMesh.instanceMatrix.needsUpdate = true;
    equipmentMesh.instanceMatrix.needsUpdate = true;
    stackMesh.instanceMatrix.needsUpdate = true;
    bodies.computeBoundingSphere();
    roofs.computeBoundingSphere();
    windowMesh.computeBoundingSphere();
    equipmentMesh.computeBoundingSphere();
    stackMesh.computeBoundingSphere();
  }, [buildings, rooftopEquipment, stacks, windows]);

  useEffect(
    () =>
      useGameSimulationStore.subscribe((state) => {
        lightTargetRef.current = getExteriorLampLevel(state.gameTime, state.weather);
      }),
    []
  );

  useFrame((_, delta) => {
    lightLevelRef.current = THREE.MathUtils.damp(
      lightLevelRef.current,
      lightTargetRef.current,
      3.2,
      Math.min(Math.max(delta, 0), 0.1)
    );
    CITY_WINDOW_MATERIAL.emissiveIntensity = lightLevelRef.current * 3.4;
  });

  return (
    <group name="near-horizon-city" dispose={null}>
      <instancedMesh
        ref={bodiesRef}
        name="near-city-buildings"
        args={[UNIT_BOX, CITY_BODY_MATERIAL, buildings.length]}
        renderOrder={RENDER_ORDER.cityNear}
      >
        <GeneratedBoundary fallback={null}>
          <GeneratedGeometrySurface
            fitEnvelope
            asset="cityMasonryUnit"
            original={UNIT_BOX}
            meshRef={bodiesRef}
          />
        </GeneratedBoundary>
      </instancedMesh>
      <instancedMesh
        ref={roofsRef}
        name="near-city-roofs"
        args={[UNIT_BOX, CITY_ROOF_MATERIAL, buildings.length]}
        renderOrder={RENDER_ORDER.cityNear + 1}
      >
        <GeneratedBoundary fallback={null}>
          <GeneratedGeometrySurface
            fitEnvelope
            asset="factorySteelUnit"
            original={UNIT_BOX}
            meshRef={roofsRef}
          />
        </GeneratedBoundary>
      </instancedMesh>
      <instancedMesh
        ref={windowsRef}
        name="near-city-windows"
        args={[UNIT_BOX, CITY_WINDOW_MATERIAL, windows.length]}
        renderOrder={RENDER_ORDER.cityNear + 2}
      />
      <instancedMesh
        ref={equipmentRef}
        name="near-city-rooftop-equipment"
        args={[UNIT_BOX, CITY_MECHANICAL_MATERIAL, rooftopEquipment.length]}
        renderOrder={RENDER_ORDER.cityNear + 1}
      >
        <GeneratedBoundary fallback={null}>
          <GeneratedGeometrySurface
            fitEnvelope
            asset="factorySteelUnit"
            original={UNIT_BOX}
            meshRef={equipmentRef}
          />
        </GeneratedBoundary>
      </instancedMesh>
      <instancedMesh
        ref={stacksRef}
        name="near-city-stacks"
        args={[UNIT_BOX, CITY_STACK_MATERIAL, stacks.length]}
        renderOrder={RENDER_ORDER.cityNear + 1}
      >
        <GeneratedBoundary fallback={null}>
          <GeneratedGeometrySurface
            fitEnvelope
            asset="factorySteelUnit"
            original={UNIT_BOX}
            meshRef={stacksRef}
          />
        </GeneratedBoundary>
      </instancedMesh>
    </group>
  );
};
