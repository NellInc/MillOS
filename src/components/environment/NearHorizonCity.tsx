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
  /** 0 tower, 1 mid-rise slab, 2 terrace row. */
  readonly massing: number;
  /** Pitched roofs: 0 gable end to the site, 1 ridge along the facade. */
  readonly ridgeAxis: number;
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
    // A town is towers, mid-rise slabs and terraces. One tall gable-ended
    // tower repeated 27 of 42 times read as a single asset stamped along the
    // skyline (packing, final-med-12). The bands keep their order; only the
    // massing within each lot varies.
    // Working if the packing skyline mixes long eaves, gable ends and flat tops.
    const massingRoll = deterministicNoise(index, 18);
    const massing = massingRoll < 0.34 ? 0 : massingRoll < 0.68 ? 1 : 2;
    const shape = deterministicNoise(index, 3);
    const rise = deterministicNoise(index, 2);
    const [width, depth, height] =
      massing === 0
        ? [5.5 + shape * 3, 5.5 + deterministicNoise(index, 4) * 3, 12 + rise * 9]
        : massing === 1
          ? [12 + shape * 4, 7 + deterministicNoise(index, 4) * 3, 8.5 + rise * 5]
          : [13 + shape * 5, 6 + deterministicNoise(index, 4) * 2, 6.5 + rise * 3];
    const roofStyle =
      massing === 2
        ? Math.floor(deterministicNoise(index, 7) * 2)
        : Math.floor(deterministicNoise(index, 7) * 3);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    return {
      x,
      z,
      width,
      depth,
      height: height + districtBand * 1.25 + (landmark ? 6 : 0),
      yaw: Math.atan2(-x, -z),
      tone: deterministicNoise(index, 5),
      roofStyle,
      districtBand,
      massing,
      // Terraces and slabs carry their ridge along the street; towers mostly
      // turn a gable or hip to the site.
      ridgeAxis: deterministicNoise(index, 19) < (massing === 0 ? 0.3 : 0.85) ? 1 : 0,
    };
  });

/** Closed shared gable volume. The eaves sit just inside the actual wall top.
 * Working if the roof rays seal both slopes and ends without an extra light or texture.
 */
export function createNearCityPitchedRoof(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [-0.5, 0, -0.5, 0.5, 0, -0.5, 0, 1, -0.5, -0.5, 0, 0.5, 0.5, 0, 0.5, 0, 1, 0.5],
      3
    )
  );
  geometry.setIndex([0, 2, 1, 3, 4, 5, 0, 1, 3, 1, 4, 3, 0, 3, 2, 3, 5, 2, 1, 2, 4, 2, 5, 4]);
  const flat = geometry.toNonIndexed();
  geometry.dispose();
  flat.computeVertexNormals();
  flat.computeBoundingBox();
  flat.computeBoundingSphere();
  return flat;
}
/** Rise scales with the span the rafters actually cross. */
export const nearCityRoofRise = (building: NearCityBuildingSpec): number =>
  THREE.MathUtils.clamp(
    (building.ridgeAxis === 1 ? building.depth : building.width) *
      (building.roofStyle === 0 ? 0.32 : 0.2),
    1.5,
    3.6
  );

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_PITCHED_ROOF = createNearCityPitchedRoof();
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
const CITY_PITCHED_ROOF_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#ffffff',
  roughness: 0.9,
  metalness: 0.03,
});
// Slate, terracotta, brown tile and dark slate. Two greys read as one roof.
const CITY_PITCHED_ROOF_COLOURS = [
  new THREE.Color('#566875'),
  new THREE.Color('#8a5a43'),
  new THREE.Color('#796251'),
  new THREE.Color('#4b5258'),
] as const;
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
// Render greys plus brick, ochre and pale limewash, so neighbouring lots part.
const CITY_BODY_COLOURS = [
  new THREE.Color('#9ba39e'),
  new THREE.Color('#aa9f91'),
  new THREE.Color('#8fa1a6'),
  new THREE.Color('#9e9690'),
  new THREE.Color('#a5aaa2'),
  new THREE.Color('#a47c66'),
  new THREE.Color('#bba98a'),
  new THREE.Color('#c0bdb4'),
] as const;

export const nearCityBodyColour = (building: NearCityBuildingSpec): THREE.Color =>
  CITY_BODY_COLOURS[
    Math.floor(building.tone * CITY_BODY_COLOURS.length) % CITY_BODY_COLOURS.length
  ];

export const nearCityRoofColour = (building: NearCityBuildingSpec): THREE.Color =>
  CITY_PITCHED_ROOF_COLOURS[
    Math.floor(((building.tone * 7.31 + building.roofStyle * 0.37) % 1) * 4) % 4
  ];

interface WindowSpec {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly width: number;
  readonly height: number;
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

/** Visible rooms on the town-facing facade and the exposed pitched-roof sides.
 * All panes share the existing instance draw and clock-dimmed window material.
 */
export function buildNearCityWindows(buildings: readonly NearCityBuildingSpec[]): WindowSpec[] {
  const result: WindowSpec[] = [];
  buildings.forEach((building, buildingIndex) => {
    // Every pane top stays 0.8 m under the eaves, which terraces now reach.
    const floors = Math.max(1, Math.floor((building.height - 3.56) / 3.5) + 1);
    const addFace = (yaw: number, span: number, reach: number, face: number) => {
      const normalX = Math.sin(yaw),
        normalZ = Math.cos(yaw);
      const columns =
        face === 0
          ? Math.max(3, Math.min(6, Math.floor(span / 2.7)))
          : Math.max(2, Math.floor((span - 1) / 2.5));
      const firstOnFace = result.length;
      for (let floor = 0; floor < floors; floor++) {
        for (let column = 0; column < columns; column++) {
          // A single-storey terrace end has two panes; never blank a whole face.
          const lastPane = floor === floors - 1 && column === columns - 1;
          if (
            deterministicNoise(buildingIndex * 31 + floor * 5 + column, 8 + face) < 0.18 &&
            !(lastPane && result.length === firstOnFace)
          )
            continue;
          const across = (column + 0.5) / columns - 0.5;
          result.push({
            x: building.x + normalX * (reach / 2 + 0.05) - normalZ * across * span * 0.76,
            y: 2.3 + floor * 3.5,
            z: building.z + normalZ * (reach / 2 + 0.05) + normalX * across * span * 0.76,
            width: Math.min(1.3, (span / columns) * 0.38),
            height: 0.9,
            yaw,
          });
        }
      }
    };
    addFace(building.yaw, building.width, building.depth, 0);
    if (building.roofStyle !== 2) {
      addFace(building.yaw - Math.PI / 2, building.depth, building.width, 1);
      addFace(building.yaw + Math.PI / 2, building.depth, building.width, 2);
    }
  });
  return result;
}

export const NearHorizonCity: React.FC = () => {
  const buildings = useMemo(() => buildNearCitySpecs(), []);
  const pitchedBuildings = useMemo(() => buildings.filter((b) => b.roofStyle !== 2), [buildings]);
  const flatBuildings = useMemo(() => buildings.filter((b) => b.roofStyle === 2), [buildings]);
  const windows = useMemo(() => buildNearCityWindows(buildings), [buildings]);
  const rooftopEquipment = useMemo<RooftopSpec[]>(
    () =>
      buildings
        .filter((building) => building.roofStyle === 2)
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
  const pitchedRoofsRef = useRef<THREE.InstancedMesh>(null);
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
    const pitchedRoofs = pitchedRoofsRef.current;
    const windowMesh = windowsRef.current;
    const equipmentMesh = equipmentRef.current;
    const stackMesh = stacksRef.current;
    if (!bodies || !roofs || !pitchedRoofs || !windowMesh || !equipmentMesh || !stackMesh) return;
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
      bodies.setColorAt(index, nearCityBodyColour(building));
    });
    flatBuildings.forEach((building, index) => {
      position.set(building.x, building.height - 0.35, building.z);
      rotation.setFromEuler(euler.set(0, building.yaw, 0));
      scale.set(building.width * 0.66, 0.7, building.depth * 0.66);
      roofs.setMatrixAt(index, matrix.compose(position, rotation, scale));
    });
    pitchedBuildings.forEach((building, index) => {
      position.set(building.x, building.height - 0.85, building.z);
      // The unit roof's ridge runs along local Z. A quarter turn lays it along
      // the facade, with the overhangs swapped to match.
      const along = building.ridgeAxis === 1;
      rotation.setFromEuler(euler.set(0, building.yaw + (along ? Math.PI / 2 : 0), 0));
      scale.set(
        (along ? building.depth : building.width) + 0.32,
        nearCityRoofRise(building),
        (along ? building.width : building.depth) + 0.3
      );
      pitchedRoofs.setMatrixAt(index, matrix.compose(position, rotation, scale));
      pitchedRoofs.setColorAt(index, nearCityRoofColour(building));
    });
    windows.forEach((window, index) => {
      position.set(window.x, window.y, window.z);
      rotation.setFromEuler(euler.set(0, window.yaw, 0));
      scale.set(window.width, window.height, 0.09);
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
    pitchedRoofs.instanceMatrix.needsUpdate = true;
    pitchedRoofs.instanceColor!.needsUpdate = true;
    windowMesh.instanceMatrix.needsUpdate = true;
    equipmentMesh.instanceMatrix.needsUpdate = true;
    stackMesh.instanceMatrix.needsUpdate = true;
    bodies.computeBoundingSphere();
    roofs.computeBoundingSphere();
    pitchedRoofs.computeBoundingSphere();
    windowMesh.computeBoundingSphere();
    equipmentMesh.computeBoundingSphere();
    stackMesh.computeBoundingSphere();
  }, [buildings, flatBuildings, pitchedBuildings, rooftopEquipment, stacks, windows]);

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
        args={[UNIT_BOX, CITY_ROOF_MATERIAL, flatBuildings.length]}
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
        ref={pitchedRoofsRef}
        name="near-city-pitched-roofs"
        args={[UNIT_PITCHED_ROOF, CITY_PITCHED_ROOF_MATERIAL, pitchedBuildings.length]}
        renderOrder={RENDER_ORDER.cityNear + 1}
      />
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
