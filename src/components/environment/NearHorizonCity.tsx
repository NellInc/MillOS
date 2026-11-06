import { GeneratedBoundary } from '../models/GeneratedModel';
import { GeneratedGeometrySurface } from '../models/GeneratedGeometrySurface';
import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { RENDER_ORDER } from '../../constants/renderLayers';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getExteriorLampLevel } from '../exterior/ExteriorLighting';
import { sampleAtmosphere } from '../../simulation/atmosphere';
import { sampleFoothillGroundHeight } from './foothillGround';
import {
  RIDGE_ALPINE_PROFILE,
  RIDGE_ANCHORED_AERIAL,
  RIDGE_ANCHORED_AERIAL_SPAN,
  getRidgeClearAir,
} from './OptimizedSkySystem';

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
  /** Foot of the walls: the highest ground under the footprint, so no hill is inside them. */
  readonly baseY: number;
  /** The lowest ground under the footprint, which the stone plinth reaches down to. */
  readonly footingY: number;
}

const deterministicNoise = (index: number, channel: number): number => {
  const value = Math.sin(index * 91.731 + channel * 37.117 + 8.913) * 43758.5453;
  return value - Math.floor(value);
};

/** A compact, world-anchored hill town on the eastern foothills. */
export const buildNearCitySpecs = (
  count = 42,
  groundAt: (x: number, z: number) => number = sampleFoothillGroundHeight
): NearCityBuildingSpec[] =>
  Array.from({ length: count }, (_, index) => {
    const districtBand = index % 3;
    const buildingsInBand = Math.ceil(count / 3);
    const positionInBand = Math.floor(index / 3);
    const progress = buildingsInBand <= 1 ? 0.5 : positionInBand / (buildingsInBand - 1);
    const angle =
      THREE.MathUtils.lerp(-0.56, 0.16, progress) + (deterministicNoise(index, 6) - 0.5) * 0.045;
    // Out on the eastern foothills, 350-384 m from the mill, well clear of the
    // river's east bank: the town reads as a hill town across the valley. Each
    // building stands on the hill surface under its lowest corner, so no
    // corner hangs in the air and the slope takes the uphill side.
    // Working if every footprint sample is at or above the base.
    const radius = 350 + districtBand * 14 + deterministicNoise(index, 0) * 6;
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
    const yaw = Math.atan2(-x, -z);
    // Seated at its lowest corner, the uphill side sank 1.3-4.4 m and the hill
    // cut across the ground floors. The walls start above the highest ground
    // under the footprint and a stone plinth takes the slope, as a hill town is
    // built. Working if no ground rises inside a wall and no plinth hangs in air.
    const ground = nearCityGroundSamples({ x, z, width, depth, yaw }).map(([px, pz]) =>
      groundAt(px, pz)
    );
    const baseY = Math.max(...ground);
    const footingY = Math.min(...ground);
    return {
      x,
      z,
      width,
      depth,
      // The plinth takes the slope, so the walls keep their authored height.
      height: height + districtBand * 1.25 + (landmark ? 6 : 0),
      yaw,
      tone: deterministicNoise(index, 5),
      roofStyle,
      districtBand,
      massing,
      // Terraces and slabs carry their ridge along the street; towers mostly
      // turn a gable or hip to the site.
      ridgeAxis: deterministicNoise(index, 19) < (massing === 0 ? 0.3 : 0.85) ? 1 : 0,
      baseY,
      footingY,
    };
  });

/** The four corners and centre of a building's footprint, in world x/z. */
export function nearCityFootprint(building: {
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly depth: number;
  readonly yaw: number;
}): Array<[number, number]> {
  const cos = Math.cos(building.yaw),
    sin = Math.sin(building.yaw);
  return [
    [-0.5, -0.5],
    [-0.5, 0.5],
    [0.5, -0.5],
    [0.5, 0.5],
    [0, 0],
  ].map(([u, v]) => [
    building.x + u * building.width * cos + v * building.depth * sin,
    building.z - u * building.width * sin + v * building.depth * cos,
  ]);
}

/**
 * A 5 x 5 grid over a building's footprint, edges and corners included, in
 * world x/z. The corners alone missed ground rising between them.
 */
export function nearCityGroundSamples(building: {
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly depth: number;
  readonly yaw: number;
}): Array<[number, number]> {
  const cos = Math.cos(building.yaw),
    sin = Math.sin(building.yaw);
  const samples: Array<[number, number]> = [];
  for (let i = 0; i <= 4; i++)
    for (let j = 0; j <= 4; j++) {
      const u = i / 4 - 0.5;
      const v = j / 4 - 0.5;
      samples.push([
        building.x + u * building.width * cos + v * building.depth * sin,
        building.z - u * building.width * sin + v * building.depth * cos,
      ]);
    }
  return samples;
}

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
// Dressed stone under each building, taking the slope (buildNearCitySpecs).
// '#857d70' was 0.23 linear, four times the pasture and woodland around it, so
// every plinth drew a pale rule along the hill under its building (receiving,
// runtime-triage-20261106). Weathered, earth-stained stone sits in the slope.
const CITY_PLINTH_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#6c6858',
  roughness: 0.95,
  metalness: 0,
});
/** Plinth margin beyond the walls, and how far it runs into the ground. */
const PLINTH_MARGIN = 0.35;
const PLINTH_BURY = 1;
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

// Street trees and garden groves among the lots and along the town's foot.
const CITY_TREE_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#ffffff',
  roughness: 1,
  metalness: 0,
});
const CITY_TREE_COLOURS = [
  new THREE.Color('#3c5532'),
  new THREE.Color('#465e36'),
  new THREE.Color('#34492f'),
  new THREE.Color('#4d5f3a'),
] as const;

/**
 * ATMOSPHERE FROM THE HILL THE TOWN STANDS ON.
 *
 * The town sat under the scene's FogExp2 (density 0.002 in clear air), about
 * 1 - exp(-(0.002 * 370)^2) = 0.42 of fog colour at 370 m. The foothill it is
 * built on is the anchored ridge shader, which ignores scene fog and takes
 * `RIDGE_ANCHORED_AERIAL` instead: 0.1 to 0.2 over 250-390 m, capped in clear
 * air at the far range's lower band (0.32 x 0.55 = 0.18). So every building
 * carried more than twice its own hillside's air and read as a pale paper strip
 * hovering over a darker, clearer hill (packing top centre, receiving top left,
 * runtime-triage-20261106). The town now takes the hill's own per-channel term
 * from the same shared uniforms, against the same colour (fog.color is lerped
 * to the ridge inscatter each frame), and its walls darken toward their foot so
 * they meet the slope instead of standing on a lit edge.
 * Working if, in one frame, a wall's haze matches the hill beside it.
 */
export const NEAR_CITY_AERIAL = {
  /** Albedo kept at the very foot of a wall or plinth (contact shade). */
  contactShade: 0.5,
  /** Metres above the instance's lowest face over which the shade recovers. */
  contactMetres: [0.6, 3.4],
} as const;
export const NEAR_CITY_AERIAL_CACHE_KEY = 'millos-near-city-aerial-v1';
const CITY_CLEAR_AIR = { value: 1 };
const nearCityClearAir = (weather: Parameters<typeof sampleAtmosphere>[2]): number =>
  getRidgeClearAir(sampleAtmosphere(0, 12, weather).cloudCoverage);

function applyNearCityAerial(material: THREE.MeshStandardMaterial, contact: boolean): void {
  const contactStrength = { value: contact ? 1 : 0 };
  const [run0, run1] = RIDGE_ANCHORED_AERIAL.run;
  const [d0, d1] = RIDGE_ANCHORED_AERIAL.distances;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uCityAerial = RIDGE_ANCHORED_AERIAL_SPAN;
    shader.uniforms.uCityClearAir = CITY_CLEAR_AIR;
    shader.uniforms.uCityContact = contactStrength;
    shader.vertexShader = `varying float vCityLift;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        // Metres above the instance's lowest face (unit box, y -0.5 to 0.5).
        vCityLift = (position.y + 0.5) * length(instanceMatrix[1].xyz);
      #else
        vCityLift = 1000.0;
      #endif`
    );
    shader.fragmentShader = `uniform vec3 uCityAerial;
      uniform float uCityClearAir;
      uniform float uCityContact;
      varying float vCityLift;\n${shader.fragmentShader}`
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        diffuseColor.rgb *= mix(1.0, mix(${NEAR_CITY_AERIAL.contactShade.toFixed(2)}, 1.0,
          smoothstep(${NEAR_CITY_AERIAL.contactMetres[0].toFixed(2)}, ${NEAR_CITY_AERIAL.contactMetres[1].toFixed(2)}, vCityLift)),
          uCityContact);`
      )
      .replace(
        '#include <fog_fragment>',
        `#ifdef USE_FOG
        // The anchored ridge's distance haze (OptimizedSkySystem ridge shader).
        // Radial view distance from atmosphericFog's varying, as the ridge's
        // vRidgeDistance is (three's vFogDepth is replaced there).
        float cityRun = clamp((length(vFogViewPosition) - ${d0.toFixed(1)}) / ${(d1 - d0).toFixed(1)},
          ${run0.toFixed(2)}, ${run1.toFixed(2)});
        float cityAerial = min(uCityAerial.z * mix(${RIDGE_ALPINE_PROFILE.lowBandAerial.toFixed(2)}, 1.0, 1.0 - uCityClearAir),
          max(0.0, mix(uCityAerial.x, uCityAerial.y, cityRun)));
        gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor,
          clamp(cityAerial * vec3(0.80, 1.00, 1.20), 0.0, 1.0));
        #endif`
      );
  };
  material.customProgramCacheKey = () => NEAR_CITY_AERIAL_CACHE_KEY;
}
applyNearCityAerial(CITY_BODY_MATERIAL, true);
applyNearCityAerial(CITY_PLINTH_MATERIAL, true);
applyNearCityAerial(CITY_ROOF_MATERIAL, false);
applyNearCityAerial(CITY_PITCHED_ROOF_MATERIAL, false);
applyNearCityAerial(CITY_WINDOW_MATERIAL, false);
applyNearCityAerial(CITY_MECHANICAL_MATERIAL, false);
applyNearCityAerial(CITY_STACK_MATERIAL, false);
applyNearCityAerial(CITY_TREE_MATERIAL, false);

/** A low-poly crown with shared vertices, so it shades round rather than faceted. */
function createNearCityTreeCrown(): THREE.BufferGeometry {
  const ico = new THREE.IcosahedronGeometry(1, 1);
  ico.deleteAttribute('uv');
  ico.deleteAttribute('normal');
  const crown = mergeVertices(ico, 1e-4);
  ico.dispose();
  crown.computeVertexNormals();
  crown.computeBoundingSphere();
  return crown;
}
const UNIT_TREE_CROWN = createNearCityTreeCrown();

export interface NearCityTreeSpec {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly radius: number;
  readonly height: number;
  readonly tone: number;
}

/**
 * Trees at the town's foot and in the gaps between lots. A row of walls meeting
 * a bare slope is what made the town read as a cut-out: the groves hide the
 * plinth line from the site, step the skyline between roofs, and put the hill's
 * own green in among the buildings. Each crown is seated on the lowest ground
 * under it, so none floats. Working if the town's foot is broken by trees.
 */
export function buildNearCityTrees(
  buildings: readonly NearCityBuildingSpec[],
  groundAt: (x: number, z: number) => number = sampleFoothillGroundHeight
): NearCityTreeSpec[] {
  const trees: NearCityTreeSpec[] = [];
  const place = (x: number, z: number, radius: number, height: number, tone: number) => {
    const ground = Math.min(
      groundAt(x, z),
      groundAt(x + radius * 0.7, z),
      groundAt(x - radius * 0.7, z),
      groundAt(x, z + radius * 0.7),
      groundAt(x, z - radius * 0.7)
    );
    // The crown's lower fifth is buried, so a slope never shows sky under it.
    trees.push({ x, y: ground + height * 0.8, z, radius, height, tone });
  };
  buildings.forEach((building, index) => {
    const radial = Math.hypot(building.x, building.z);
    const inwardX = -building.x / radial,
      inwardZ = -building.z / radial;
    const tangentX = -inwardZ,
      tangentZ = inwardX;
    // In front of the street: the front band always, the others where a gap opens.
    if (building.districtBand === 0 || deterministicNoise(index, 21) < 0.35) {
      const reach = building.depth / 2 + 3 + deterministicNoise(index, 22) * 3;
      const across = (deterministicNoise(index, 23) - 0.5) * building.width * 0.9;
      const radius = 2.4 + deterministicNoise(index, 24) * 1.6;
      place(
        building.x + inwardX * reach + tangentX * across,
        building.z + inwardZ * reach + tangentZ * across,
        radius,
        radius * (1.15 + deterministicNoise(index, 25) * 0.45),
        deterministicNoise(index, 26)
      );
    }
    // Between lots: a taller tree beside the building, rising over the eaves.
    if (deterministicNoise(index, 27) < 0.55) {
      const side = deterministicNoise(index, 28) < 0.5 ? -1 : 1;
      const offset = building.width / 2 + 2.2 + deterministicNoise(index, 29) * 1.5;
      const radius = 2.8 + deterministicNoise(index, 30) * 1.6;
      place(
        building.x + tangentX * offset * side + inwardX * building.depth * 0.25,
        building.z + tangentZ * offset * side + inwardZ * building.depth * 0.25,
        radius,
        radius * (1.6 + deterministicNoise(index, 31) * 0.6),
        deterministicNoise(index, 32)
      );
    }
  });
  return trees;
}

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
export function buildNearCityWindows(
  buildings: readonly NearCityBuildingSpec[],
  groundAt: (x: number, z: number) => number = sampleFoothillGroundHeight
): WindowSpec[] {
  const result: WindowSpec[] = [];
  // Floors count up from the lowest corner, so on a wall running up the slope
  // the lower panes near the uphill end were inside the hill: three wholly
  // buried and six cut through by the turf. A pane is placed only where its
  // sill clears the ground just outside the wall.
  // Working if every pane on the hill town shows its whole frame above grade.
  const SILL_CLEARANCE = 0.25;
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
          const across = (column + 0.5) / columns - 0.5;
          const pane = {
            x: building.x + normalX * (reach / 2 + 0.05) - normalZ * across * span * 0.76,
            y: building.baseY + 2.3 + floor * 3.5,
            z: building.z + normalZ * (reach / 2 + 0.05) + normalX * across * span * 0.76,
            width: Math.min(1.3, (span / columns) * 0.38),
            height: 0.9,
            yaw,
          };
          const outside = groundAt(pane.x + normalX * 0.6, pane.z + normalZ * 0.6);
          if (pane.y - pane.height / 2 < outside + SILL_CLEARANCE) continue;
          // A single-storey terrace end has two panes; never blank a whole face.
          const lastPane = floor === floors - 1 && column === columns - 1;
          if (
            deterministicNoise(buildingIndex * 31 + floor * 5 + column, 8 + face) < 0.18 &&
            !(lastPane && result.length === firstOnFace)
          )
            continue;
          result.push(pane);
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

/** Brick stacks rising through the ridge of about three in five pitched roofs. */
export function nearCityChimneys(buildings: readonly NearCityBuildingSpec[]): RooftopSpec[] {
  const result: RooftopSpec[] = [];
  buildings.forEach((building, index) => {
    if (building.roofStyle === 2 || deterministicNoise(index, 33) > 0.6) return;
    const along = building.ridgeAxis === 1;
    const ridgeYaw = building.yaw + (along ? Math.PI / 2 : 0);
    const ridgeLength = along ? building.width : building.depth;
    const offset = (deterministicNoise(index, 34) - 0.5) * ridgeLength * 0.6;
    const roofBase = building.baseY + building.height - 0.85;
    const rise = nearCityRoofRise(building);
    // From inside the roof volume to 1-1.8 m over the ridge.
    const bottom = roofBase + rise * 0.55;
    const top = roofBase + rise + 1 + deterministicNoise(index, 35) * 0.8;
    const size = 0.7 + deterministicNoise(index, 36) * 0.3;
    result.push({
      x: building.x + Math.sin(ridgeYaw) * offset,
      y: (bottom + top) / 2,
      z: building.z + Math.cos(ridgeYaw) * offset,
      width: size,
      height: top - bottom,
      depth: size * 0.8,
      yaw: building.yaw,
    });
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
          y: building.baseY + building.height + 0.34,
          z: building.z,
          width: building.width * (0.22 + deterministicNoise(index, 11) * 0.16),
          height: 0.65 + deterministicNoise(index, 12) * 0.55,
          depth: building.depth * (0.2 + deterministicNoise(index, 13) * 0.14),
          yaw: building.yaw,
        })),
    [buildings]
  );
  const trees = useMemo(() => buildNearCityTrees(buildings), [buildings]);
  const stacks = useMemo<RooftopSpec[]>(
    () => [
      ...buildings
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
            y: building.baseY + building.height + height / 2,
            z: building.z + tangentZ * offset,
            width: 0.22 + deterministicNoise(index, 16) * 0.18,
            height,
            depth: 0.22 + deterministicNoise(index, 17) * 0.18,
            yaw: building.yaw,
          };
        }),
      // Chimney stacks through the pitched roofs, so the roofline steps and
      // breaks instead of running as one clean run of ridges.
      ...nearCityChimneys(buildings),
    ],
    [buildings]
  );
  const bodiesRef = useRef<THREE.InstancedMesh>(null);
  const plinthsRef = useRef<THREE.InstancedMesh>(null);
  const roofsRef = useRef<THREE.InstancedMesh>(null);
  const pitchedRoofsRef = useRef<THREE.InstancedMesh>(null);
  const windowsRef = useRef<THREE.InstancedMesh>(null);
  const equipmentRef = useRef<THREE.InstancedMesh>(null);
  const stacksRef = useRef<THREE.InstancedMesh>(null);
  const treesRef = useRef<THREE.InstancedMesh>(null);
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
    const plinths = plinthsRef.current;
    const treeMesh = treesRef.current;
    if (
      !bodies ||
      !plinths ||
      !treeMesh ||
      !roofs ||
      !pitchedRoofs ||
      !windowMesh ||
      !equipmentMesh ||
      !stackMesh
    )
      return;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const euler = new THREE.Euler();

    buildings.forEach((building, index) => {
      position.set(building.x, building.baseY + building.height / 2 - 0.8, building.z);
      rotation.setFromEuler(euler.set(0, building.yaw, 0));
      scale.set(building.width, building.height, building.depth);
      bodies.setMatrixAt(index, matrix.compose(position, rotation, scale));
      bodies.setColorAt(index, nearCityBodyColour(building));
      // The plinth runs from below the lowest ground to just above the highest.
      const plinthBottom = building.footingY - PLINTH_BURY;
      const plinthTop = building.baseY + 0.15;
      position.set(building.x, (plinthBottom + plinthTop) / 2, building.z);
      scale.set(
        building.width + PLINTH_MARGIN * 2,
        plinthTop - plinthBottom,
        building.depth + PLINTH_MARGIN * 2
      );
      plinths.setMatrixAt(index, matrix.compose(position, rotation, scale));
    });
    flatBuildings.forEach((building, index) => {
      position.set(building.x, building.baseY + building.height - 0.35, building.z);
      rotation.setFromEuler(euler.set(0, building.yaw, 0));
      scale.set(building.width * 0.66, 0.7, building.depth * 0.66);
      roofs.setMatrixAt(index, matrix.compose(position, rotation, scale));
    });
    pitchedBuildings.forEach((building, index) => {
      position.set(building.x, building.baseY + building.height - 0.85, building.z);
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
    trees.forEach((tree, index) => {
      position.set(tree.x, tree.y, tree.z);
      rotation.setFromEuler(euler.set(0, tree.tone * Math.PI * 2, 0));
      scale.set(tree.radius, tree.height, tree.radius);
      treeMesh.setMatrixAt(index, matrix.compose(position, rotation, scale));
      treeMesh.setColorAt(
        index,
        CITY_TREE_COLOURS[
          Math.floor(tree.tone * CITY_TREE_COLOURS.length) % CITY_TREE_COLOURS.length
        ]
      );
    });
    treeMesh.instanceMatrix.needsUpdate = true;
    if (treeMesh.instanceColor) treeMesh.instanceColor.needsUpdate = true;
    treeMesh.computeBoundingSphere();
    bodies.instanceMatrix.needsUpdate = true;
    plinths.instanceMatrix.needsUpdate = true;
    plinths.computeBoundingSphere();
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
  }, [buildings, flatBuildings, pitchedBuildings, rooftopEquipment, stacks, trees, windows]);

  useEffect(() => {
    CITY_CLEAR_AIR.value = nearCityClearAir(useGameSimulationStore.getState().weather);
    return useGameSimulationStore.subscribe((state) => {
      lightTargetRef.current = getExteriorLampLevel(state.gameTime, state.weather);
      CITY_CLEAR_AIR.value = nearCityClearAir(state.weather);
    });
  }, []);

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
        ref={plinthsRef}
        name="near-city-plinths"
        args={[UNIT_BOX, CITY_PLINTH_MATERIAL, buildings.length]}
        renderOrder={RENDER_ORDER.cityNear}
      />
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
        ref={treesRef}
        name="near-city-trees"
        args={[UNIT_TREE_CROWN, CITY_TREE_MATERIAL, trees.length]}
        renderOrder={RENDER_ORDER.cityNear}
      />
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
