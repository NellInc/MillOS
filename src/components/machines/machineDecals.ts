/**
 * Machine placards and hazard markings.
 *
 * A AAA industrial asset carries eight to fifteen readable surface events -
 * nameplates, hazard bands, lockout points, inspection stickers. The mill's
 * machines carried ZERO: the only text-like element anywhere on them was a flat
 * cyan quad standing in for an HMI screen. Nothing told the eye how big a
 * machine is, and without a size cue a 4.8 m roller mill reads as a toy block.
 *
 * ---------------------------------------------------------------------------
 * COST
 * ---------------------------------------------------------------------------
 * ONE extra draw call for the whole mill. Every placard on every machine is an
 * instance of a single `PlaneGeometry(1,1)` sharing one material and one atlas;
 * the cell each instance samples arrives as an `InstancedBufferAttribute` vec4
 * consumed by a small `onBeforeCompile` injection. Draw calls are the tight
 * constraint in this scene (1194 on the overview shot), so a per-decal mesh -
 * or a per-machine-class mesh - would have been the wrong shape.
 *
 * ---------------------------------------------------------------------------
 * PLACARD ORIENTATION
 * ---------------------------------------------------------------------------
 * All four machine classes present their instrument face to +Z with no
 * rotation, so a `PlaneGeometry` - whose front face is +Z - can be placed by
 * translation alone. The mill's side serial plate rotates to face -X and its
 * entire quad is ray-tested against the real inspection cover.
 * The silo body is a CYLINDER and is deliberately given only two
 * small placards; see `SILO_PLACARD_NOTE`.
 *
 * ---------------------------------------------------------------------------
 * ATLAS ORIENTATION
 * ---------------------------------------------------------------------------
 * `THREE.DataTexture` has `flipY = false`, and `PlaneGeometry` puts uv (0,0) at
 * the BOTTOM-left. So data row 0 is the bottom of the quad. The cell painters
 * below therefore treat v = 0 as DOWN, which is why the warning triangles point
 * towards v = 1.
 */

import * as THREE from 'three';
import { MachineData } from '../../types';
import { getMachineAssemblyScale, SILO_ACCESS_LAYOUT } from '../../constants/siteLayout';
import { POLYGON_OFFSET, SURFACE_LAYERS } from '../../constants/renderLayers';
import { MILL_LOAD_DIAL } from './machineFinishGeometry';
import {
  ATLAS_COLS,
  ATLAS_H,
  ATLAS_ROWS,
  ATLAS_W,
  CELL_PAD_PX,
  CELL_PX,
  DECAL_ATLAS_CELL_COUNT,
  DECAL_CELL,
  MACHINE_ID_CELLS,
  getMachineDecalAtlas,
  type DecalCell,
} from './machineDecalAtlas';

// The atlas (cells, painters, builder) lives in `machineDecalAtlas.ts` so the
// startup bake worker can build it; re-exported for existing importers.
export { DECAL_CELL, getMachineDecalAtlas };
export type { DecalCell };

// ===========================================================================
// GEOMETRY, ATTRIBUTE AND MATERIAL
// ===========================================================================

export const MACHINE_DECAL_GEOMETRY = new THREE.PlaneGeometry(1, 1);

/**
 * Constant, per the CLAUDE.md ban on non-deterministic cache keys. Bump the
 * suffix by hand if the injected GLSL changes.
 */
export const MACHINE_DECAL_CACHE_KEY = 'machineDecal_v2';

/**
 * The placards are LIT, not `MeshBasicMaterial`. A basic material ignores the
 * scene entirely, so every placard would glow at full brightness inside a
 * shadowed machine recess and read as a sticker floating in front of the mill.
 *
 * `alphaTest` without `transparent` keeps them in the OPAQUE pass: no sort
 * order to get wrong, no blending, and they still write depth. The quads sit
 * `SURFACE_LAYERS.machineDecal` (15 mm) proud of a body face and
 * `SURFACE_LAYERS.machineRecessedPanel` (10 mm) proud of the silo hatch cover,
 * and `POLYGON_OFFSET.moderate` covers the rest.
 *
 * Only the silo nameplate below composes that standoff arithmetically
 * (`SILO_SKIN_RADIUS + SURFACE_LAYERS.machineDecal`). The remaining `push()`
 * calls carry ABSOLUTE face coordinates with the standoff already folded in -
 * e.g. the sifter placards at z+3.12 are the z+3.105 service-panel face plus
 * 15 mm - so they cannot be rewritten in terms of the constant without also
 * naming every face position. Registered as `machine-face-decals` in
 * `src/constants/depthRegistry.ts`.
 */
export const MACHINE_DECAL_MATERIAL = new THREE.MeshStandardMaterial({
  name: 'machine-decal',
  map: getMachineDecalAtlas(),
  alphaTest: 0.35,
  roughness: 0.72,
  metalness: 0,
  polygonOffset: true,
  polygonOffsetFactor: POLYGON_OFFSET.moderate.factor,
  polygonOffsetUnits: POLYGON_OFFSET.moderate.units,
});

MACHINE_DECAL_MATERIAL.customProgramCacheKey = () => MACHINE_DECAL_CACHE_KEY;
MACHINE_DECAL_MATERIAL.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader
    .replace(
      '#include <common>',
      `#include <common>
attribute vec4 aDecalUvRect;
attribute float aDecalDialValue;
varying vec2 vDecalUv;
varying vec2 vDecalLocalUv;
varying float vDecalDialValue;`
    )
    .replace(
      '#include <uv_vertex>',
      `#include <uv_vertex>
vDecalUv = aDecalUvRect.xy + uv * aDecalUvRect.zw;
vDecalLocalUv = uv;
vDecalDialValue = aDecalDialValue;`
    );
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      `#include <common>
varying vec2 vDecalUv;
varying vec2 vDecalLocalUv;
varying float vDecalDialValue;`
    )
    .replace(
      '#include <map_fragment>',
      `#ifdef USE_MAP
  diffuseColor *= texture2D( map, vDecalUv );
#endif
if (vDecalDialValue > -1.5) {
  // Match the padded atlas painter's local coordinates.
  vec2 p = (vDecalLocalUv - vec2(0.5)) * ${CELL_PX / (CELL_PX - 2 * CELL_PAD_PX)};
  float ink;
  if (vDecalDialValue >= 0.0) {
    float angle = 3.926990817 - vDecalDialValue * 4.712388980;
    vec2 direction = vec2(cos(angle), sin(angle));
    float along = clamp(dot(p, direction), -0.045, 0.335);
    float distanceToNeedle = min(length(p - direction * along) - 0.009, length(p) - 0.032);
    float aa = max(fwidth(distanceToNeedle), 0.001);
    ink = 1.0 - smoothstep(-aa, aa, distanceToNeedle);
  } else {
    // Unavailable telemetry is a dash, never a fabricated zero reading.
    vec2 d = abs(p) - vec2(0.09, 0.012);
    float distanceToDash = max(d.x, d.y);
    float aa = max(fwidth(distanceToDash), 0.001);
    ink = 1.0 - smoothstep(-aa, aa, distanceToDash);
  }
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.012, 0.016, 0.011), ink);
}`
    );
};

// ===========================================================================
// PLACEMENT
// ===========================================================================

export interface MachineDecalPlacement {
  /** Owning casing, used to keep placards attached during operating motion. */
  readonly machineId: string;
  /** World position of the quad centre. */
  readonly position: readonly [number, number, number];
  /** World width and height of the quad, in metres. */
  readonly size: readonly [number, number];
  readonly cell: DecalCell;
  /** Zero for front placards; the mill's side serial plate faces -X. */
  readonly rotationY?: number;
}

export interface MachineDecalSubsets {
  readonly silos: readonly MachineData[];
  readonly mills: readonly MachineData[];
  readonly sifters: readonly MachineData[];
  readonly packers: readonly MachineData[];
}

/**
 * SILO_PLACARD_NOTE. The silo body is a cylinder of radius 2.25 m, so a flat
 * quad laid on the tangent plane floats at its edges by
 * `r - sqrt(r^2 - (w/2)^2)`. At the 0.6 m nameplate that is 20 mm, which reads
 * as a bolted-on plate; at anything approaching a metre it reads as a mistake.
 * Silos therefore get exactly two small placards, one of which sits on the FLAT
 * hatch cover. Nothing wide goes on the drum.
 */
const SILO_SKIN_RADIUS = 2.25;

/**
 * Every offset below is relative to `machine.position` and was read off the
 * instance layout in `CompactMachines.tsx`, so each placard is checked against
 * the real bounds of the face it lands on:
 *
 *   mill   body front z+1.90 (x +/-2.40, y+0.35..5.05), base front z+2.20
 *          (x +/-2.60, y 0..0.64), recess front z+1.98 (x +/-1.825, y+1.47..4.17)
 *   sifter body front z+2.825, service panel front z+3.105
 *          (x -1.315..2.215, y+0.935..3.185), HMI screen x +/-0.41 y+1.95..2.45
 *   packer body front z+1.725, panel front z+1.81 (x +/-1.325, y+2.225..3.875),
 *          base front z+2.125 (x +/-2.25, y 0..0.56)
 *   silo   shared SILO_ACCESS_LAYOUT keeps the lower hatch and placards beside
 *          the ladder, tangent to the discharge enclosure.
 */
export function planMachineDecals(subsets: MachineDecalSubsets): MachineDecalPlacement[] {
  const placements: MachineDecalPlacement[] = [];

  const push = (
    machine: MachineData,
    dx: number,
    dy: number,
    dz: number,
    width: number,
    height: number,
    cell: DecalCell,
    rotationY = 0
  ) => {
    const [x, y, z] = machine.position;
    // Placards are installed with their machine, exactly as its trim is.
    const scale = getMachineAssemblyScale(machine);
    placements.push({
      machineId: machine.id,
      position: [x + dx * scale[0], y + dy * scale[1], z + dz * scale[2]],
      size: [width * scale[0], height * scale[1]],
      cell,
      rotationY,
    });
  };

  subsets.silos.forEach((machine) => {
    const angle = SILO_ACCESS_LAYOUT.hatchAngle;
    const place = (radius: number, height: number, width: number, sizeY: number, cell: DecalCell) =>
      push(
        machine,
        Math.sin(angle) * radius,
        height,
        Math.cos(angle) * radius,
        width,
        sizeY,
        cell,
        angle
      );
    place(
      SILO_SKIN_RADIUS + SURFACE_LAYERS.machineDecal,
      SILO_ACCESS_LAYOUT.nameplateY,
      0.45,
      0.14,
      MACHINE_ID_CELLS[machine.id] ?? DECAL_CELL.namePlate
    );
    // The caution plate follows the ground-level cover, clear of the ladder.
    place(
      SILO_ACCESS_LAYOUT.hatchRadius +
        SILO_ACCESS_LAYOUT.hatchSize[2] / 2 +
        SURFACE_LAYERS.machineDecal,
      SILO_ACCESS_LAYOUT.hatchCentreY,
      0.17,
      0.17,
      DECAL_CELL.cautionTriangle
    );
  });

  subsets.mills.forEach((machine) => {
    // The flat lower service strip keeps both placards off the cast shoulder.
    const identity = MACHINE_ID_CELLS[machine.id];
    push(
      machine,
      0,
      1.08,
      2.056,
      identity === undefined ? 0.9 : 1.25,
      0.3,
      identity ?? DECAL_CELL.namePlate
    );
    push(machine, 0, 0.3, 2.215, 2.8, 0.3, DECAL_CELL.hazardChevron);
    push(machine, 1.4, 1.08, 2.056, 0.25, 0.25, DECAL_CELL.electricalWarning);
    // Clear of the vents and cover bolts, on the real flat side inspection lid.
    // Working if the ray test finds a 16 mm plate-to-cover gap across its face.
    if (identity !== undefined)
      push(machine, -2.481, 3.0, 0.84, 1.12, 0.43, identity, -Math.PI / 2);
    push(
      machine,
      ...MILL_LOAD_DIAL.position,
      MILL_LOAD_DIAL.diameter,
      MILL_LOAD_DIAL.diameter,
      DECAL_CELL.motorLoadDial,
      -Math.PI / 2
    );
  });

  subsets.sifters.forEach((machine) => {
    push(
      machine,
      -0.78,
      2.85,
      3.12,
      0.82,
      0.26,
      MACHINE_ID_CELLS[machine.id] ?? DECAL_CELL.namePlate
    );
    push(machine, 0.82, 1.45, 3.12, 0.36, 0.36, DECAL_CELL.cautionTriangle);
    // On the body below the service panel (which starts at y+0.935) and above
    // the platform deck (which tops out at y+0.05).
    push(machine, 0, 0.62, 2.84, 4.2, 0.3, DECAL_CELL.hazardChevron);
  });

  subsets.packers.forEach((machine) => {
    push(
      machine,
      -0.62,
      3.52,
      1.825,
      0.78,
      0.26,
      MACHINE_ID_CELLS[machine.id] ?? DECAL_CELL.namePlate
    );
    push(machine, 0.86, 2.62, 1.825, 0.34, 0.34, DECAL_CELL.lockoutRoundel);
    // The filled sack travels across the middle of this band, which is exactly
    // what happens on a real bagging line.
    push(machine, 0, 0.3, 2.14, 3.2, 0.28, DECAL_CELL.hazardChevron);
  });

  return placements;
}

/** uv rect of one atlas cell: (u0, v0, du, dv). */
function cellRect(cell: DecalCell): readonly [number, number, number, number] {
  const col = cell % ATLAS_COLS;
  const row = Math.floor(cell / ATLAS_COLS);
  return [col / ATLAS_COLS, row / ATLAS_ROWS, 1 / ATLAS_COLS, 1 / ATLAS_ROWS];
}

/**
 * Size the `aDecalUvRect` attribute to the placement list and fill it.
 *
 * The attribute is rebuilt whenever the count changes rather than resized in
 * place: an `InstancedBufferAttribute` shorter than the mesh's instance count
 * is a GL error, and the machine roster is only rebuilt on a status change.
 */
export function writeDecalUvRects(
  geometry: THREE.BufferGeometry,
  placements: readonly MachineDecalPlacement[]
): void {
  const existing = geometry.getAttribute('aDecalUvRect') as
    | THREE.InstancedBufferAttribute
    | undefined;
  const attribute =
    existing && existing.count === placements.length
      ? existing
      : new THREE.InstancedBufferAttribute(new Float32Array(placements.length * 4), 4);

  placements.forEach((placement, index) => {
    const [u0, v0, du, dv] = cellRect(placement.cell);
    attribute.setXYZW(index, u0, v0, du, dv);
  });
  attribute.needsUpdate = true;
  if (attribute !== existing) geometry.setAttribute('aDecalUvRect', attribute);

  const values = geometry.getAttribute('aDecalDialValue');
  if (!values || values.count !== placements.length) {
    geometry.setAttribute(
      'aDecalDialValue',
      new THREE.InstancedBufferAttribute(new Float32Array(placements.length).fill(-2), 1)
    );
  }
}

/**
 * Read the current roster, not the scene's status-only snapshots. Invalid
 * telemetry is explicitly unavailable. Working if a load-only update moves
 * its own needle, keeps other placards unchanged and allocates no new attribute.
 */
export function writeDecalDialReadings(
  geometry: THREE.BufferGeometry,
  placements: readonly MachineDecalPlacement[],
  machines: readonly MachineData[]
): void {
  const attribute = geometry.getAttribute('aDecalDialValue') as THREE.InstancedBufferAttribute;
  let changed = false;
  placements.forEach((placement, index) => {
    let value = -2;
    if (placement.cell === DECAL_CELL.motorLoadDial) {
      const load = machines.find((machine) => machine.id === placement.machineId)?.metrics?.load;
      value =
        typeof load === 'number' && Number.isFinite(load) && load >= 0 && load <= 100
          ? Math.fround(load / 100)
          : -1;
    }
    if (attribute.getX(index) !== value) {
      attribute.setX(index, value);
      changed = true;
    }
  });
  if (changed) attribute.needsUpdate = true;
}

/** Exported for the invariant test. */
export const DECAL_ATLAS_SIZE = {
  width: ATLAS_W,
  height: ATLAS_H,
  cells: DECAL_ATLAS_CELL_COUNT,
  padPx: CELL_PAD_PX,
} as const;
