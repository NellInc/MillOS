/**
 * THE SHIPPING WEIGHBRIDGE, north of the bus stop on the valley road.
 *
 * It was a 4 x 3 m box with a flat light-blue plane for a window and a grey
 * slab lying on the verge beside the carriageway, where no truck ever drove
 * (2026-11-07, Nell: "Weighbridge looks like shit"). It is now a pit-set steel
 * deck in the lane the shipping trucks use, and a raised office on a kerbed
 * island beside it.
 *
 * - THE DECK IS IN THE INBOUND LANE, INSIDE THE BARRIER. Arriving trucks
 *   keep right in the southbound lane (`SOUTH_ROAD_LANES.southbound`, x 22.5)
 *   all the way to their turn-in at z 87.5 (`truckController.ts`), so the deck
 *   is centred on that lane, between the checkpoint's inbound arm (z 113) and
 *   the turn-in: the arm is the barrier at the deck's entry, and the trucks
 *   come off the slowing run onto it at walking pace. 18 m x 3 m is the
 *   standard deck for an articulated truck: the rig is 16.8 m (tractor front
 *   overhang 5.05 m plus trailer rear overhang 11.76 m).
 * - NO BUS USES IT. The first placement ran from the stop line south to
 *   z 133.6, the ground the village shuttle crosses out of its stop and sweeps
 *   in its U-turn (`BUS_TURNAROUND`, body sweep down to z 116); the lead's
 *   review caught the shuttle standing on the deck. Inside the barrier only
 *   the shipping trucks drive. Their departure S-bend ends in the outbound
 *   lane, its body west of x 19, clear of the deck's west surround at x 20.65.
 * - IT IS FLUSH. The trucks have no ride height, so anything proud of the
 *   carriageway swallows their tyres (`truckController.test.ts` keeps them off
 *   the yard's 0.2 m scale for exactly that reason). Deck, joint, surround and
 *   paint are one partition of the ground plane, with no overlaps, on the
 *   carriageway's datum. The lane under it is TruckBay's approach road at
 *   `exteriorTop` (-1), over the terrain (+6) and the shuttle's turnaround
 *   (+3); a deck at -1 tied with that road and showed as tarmac in patches at
 *   close range, so it takes `carriagewayMarking` (-3), the bias of paint on a
 *   carriageway, and so it also wins over the yard's unbiased slab north of
 *   z 105. The centre line is at x 20, clear of it. The load-cell covers are
 *   overlay paint on it at `exteriorOverlay` (-4).
 * - THE OFFICE stands on a kerbed island east of the barrier, on the verge
 *   between the yard's edge props (bollards at x 28, lamp mast at (30, 105))
 *   and the railway road, its ticket window toward the deck and the lane, its
 *   approach sign facing the arriving trucks. The weight display stands at the
 *   deck's exit on the east side, facing the cab. `placementFootprints.test.ts`
 *   reads `WEIGHBRIDGE_OFFICE_ENVELOPE` and `WEIGHBRIDGE_ISLAND`.
 * - LIGHT: the window glass is clear over a dim, real interior (desk, monitor,
 *   chair, ceiling panel). At night the room and the door lamp come up on the
 *   exterior lamp clock (`EXTERIOR_LAMP_LEVEL`); no punctual light is added.
 *   The weight display is emitted light, so its digits are unlit text; every
 *   painted sign is lit paint (`surface="painted"`) and is never translated.
 *
 * Working if a shipping truck in the inbound lane rolls over the deck with its
 * tyres on it, the display reads its weight while it is on, and nothing on the
 * deck stands proud of the road.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { SOUTH_ROAD_LANES } from '../../constants/siteLayout';
import { EXTERIOR_LAYERS, POLYGON_OFFSET, RENDER_ORDER } from '../../constants/renderLayers';
import { PlotGeometry } from '../../utils/authoredPlotGeometry';
import { positionRegistry } from '../../utils/positionRegistry';
import { SceneText as Text } from '../shared/SceneText';
import {
  EXTERIOR_LAMP_LENS_MATERIAL,
  EXTERIOR_LAMP_LEVEL,
  ExteriorLampPool,
} from './ExteriorLighting';

type XZRect = { minX: number; maxX: number; minZ: number; maxZ: number };

/** The steel deck, world metres: entry (maxZ) 1.15 m past the inbound arm at z 113. */
export const WEIGHBRIDGE_DECK = {
  centreX: SOUTH_ROAD_LANES.southbound,
  halfWidth: 1.5,
  minZ: 93.5,
  maxZ: 111.5,
  /** Concrete pit surround, outside a 4 cm joint. */
  surround: 0.31,
  joint: 0.04,
} as const;

/** Office group origin, world metres. */
export const WEIGHBRIDGE_OFFICE_POSITION = [32, 0, 111] as const;

/** Office-local plan (x across, west negative; z along the road). */
const ISLAND = { minX: -3, maxX: 2.1, minZ: -4.6, maxZ: 4.7, top: 0.15 } as const;
const PLINTH = { minX: -1.7, maxX: 1.7, minZ: -2.05, maxZ: 2.05, top: 0.55 } as const;
const HUT = { halfX: 1.5, halfZ: 1.85, floor: 0.55, eaves: 3.05, wall: 0.12 } as const;
const ROOF = { halfX: 1.8, halfZ: 2.15, bottom: 3.05, top: 3.17 } as const;
const WEST_CANOPY = 0.6;
const FASCIA = 0.05;
const DOOR_CANOPY = 0.7;
const STEP_RUN = 0.4;
const DOOR = { minX: 0.45, maxX: 1.3, head: 2.65 } as const;

/**
 * The office's solid envelope in WORLD x/z: hut, plinth, roof, both canopies,
 * steps and the air-conditioning unit. The island it stands on is a 15 cm kerb.
 */
export const WEIGHBRIDGE_OFFICE_ENVELOPE: XZRect = {
  minX: WEIGHBRIDGE_OFFICE_POSITION[0] - HUT.halfX - WEST_CANOPY - FASCIA,
  maxX: WEIGHBRIDGE_OFFICE_POSITION[0] + ROOF.halfX + FASCIA,
  minZ: WEIGHBRIDGE_OFFICE_POSITION[2] - ROOF.halfZ - FASCIA,
  maxZ: WEIGHBRIDGE_OFFICE_POSITION[2] + PLINTH.maxZ + 2 * STEP_RUN,
};

/** The kerbed island, world x/z. */
export const WEIGHBRIDGE_ISLAND: XZRect = {
  minX: WEIGHBRIDGE_OFFICE_POSITION[0] + ISLAND.minX,
  maxX: WEIGHBRIDGE_OFFICE_POSITION[0] + ISLAND.maxX,
  minZ: WEIGHBRIDGE_OFFICE_POSITION[2] + ISLAND.minZ,
  maxZ: WEIGHBRIDGE_OFFICE_POSITION[2] + ISLAND.maxZ,
};

/** Tare of the empty artic arriving to load; the tractor alone, while only it is on. */
const TARE_KG = 14_820;
const TRACTOR_KG = 7_460;

const C = {
  concrete: '#9b9a93',
  kerb: '#8b8a84',
  joint: '#1c1d1e',
  plate: '#6f7578',
  track: '#5d6163',
  seam: '#3d4244',
  yellow: '#d9b02a',
  black: '#1d1d1d',
  wall: '#d7d1c0',
  base: '#9a9586',
  trim: '#2f5149',
  roof: '#3b4446',
  frame: '#e9e8e2',
  door: '#2f5a53',
  vision: '#1f2b33',
  steel: '#7d8486',
  dark: '#2a2e30',
  desk: '#6b5a47',
  screen: '#15191c',
  signBoard: '#f2f0e8',
  bollard: '#e0b21f',
} as const;

// ---------------------------------------------------------------------------
// The deck: one flat partition of the ground plane, no overlapping faces.
// ---------------------------------------------------------------------------

class FlatBuilder {
  positions: number[] = [];
  colors: number[] = [];
  private colour = new THREE.Color();
  polygon(points: readonly (readonly [number, number])[], hex: string) {
    if (points.length < 3) return;
    this.colour.set(hex);
    // Fan from the first point; every polygon here is convex. Wound so the
    // face normal is +y (counter-clockwise seen from above in x/-z).
    for (let i = 1; i < points.length - 1; i++)
      for (const [x, z] of [points[0], points[i + 1], points[i]]) {
        this.positions.push(x, 0, z);
        this.colors.push(this.colour.r, this.colour.g, this.colour.b);
      }
  }
  rect(minX: number, maxX: number, minZ: number, maxZ: number, hex: string) {
    if (maxX - minX <= 1e-6 || maxZ - minZ <= 1e-6) return;
    this.polygon(
      [
        [minX, minZ],
        [maxX, minZ],
        [maxX, maxZ],
        [minX, maxZ],
      ],
      hex
    );
  }
  /** Ring between an outer and an inner rectangle, as four non-overlapping strips. */
  ring(outer: XZRect, inner: XZRect, hex: string) {
    this.rect(outer.minX, outer.maxX, outer.minZ, inner.minZ, hex);
    this.rect(outer.minX, outer.maxX, inner.maxZ, outer.maxZ, hex);
    this.rect(outer.minX, inner.minX, inner.minZ, inner.maxZ, hex);
    this.rect(inner.maxX, outer.maxX, inner.minZ, inner.maxZ, hex);
  }
  finish() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    const normals = new Float32Array(this.positions.length);
    for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }
}

/** Clip a convex polygon to the half plane a*x + b*z <= c (Sutherland-Hodgman). */
function clipHalfPlane(
  points: readonly (readonly [number, number])[],
  a: number,
  b: number,
  c: number
): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    const dp = a * p[0] + b * p[1] - c;
    const dq = a * q[0] + b * q[1] - c;
    if (dp <= 0) out.push([p[0], p[1]]);
    if (dp * dq < 0) {
      const t = dp / (dp - dq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}

/** 45-degree yellow and black hazard band filling a rectangle exactly. */
function hazardBand(builder: FlatBuilder, r: XZRect, stripe: number) {
  const box: [number, number][] = [
    [r.minX, r.minZ],
    [r.maxX, r.minZ],
    [r.maxX, r.maxZ],
    [r.minX, r.maxZ],
  ];
  // u = x + z, stripes are bands of u.
  const low = r.minX + r.minZ;
  const high = r.maxX + r.maxZ;
  const first = Math.floor(low / stripe);
  for (let k = first; k * stripe < high; k++) {
    const slab = clipHalfPlane(clipHalfPlane(box, -1, -1, -k * stripe), 1, 1, (k + 1) * stripe);
    builder.polygon(slab, k % 2 === 0 ? C.yellow : C.black);
  }
}

const shade = (hex: string, seed: number) => {
  const c = new THREE.Color(hex);
  const n = Math.sin(seed * 12.9898) * 43758.5453;
  const f = 0.94 + (n - Math.floor(n)) * 0.12;
  return `#${c.multiplyScalar(f).getHexString()}`;
};

export function createWeighbridgeDeckGeometry() {
  const d = WEIGHBRIDGE_DECK;
  const b = new FlatBuilder();
  const plate: XZRect = {
    minX: d.centreX - d.halfWidth,
    maxX: d.centreX + d.halfWidth,
    minZ: d.minZ,
    maxZ: d.maxZ,
  };
  const grow = (r: XZRect, by: number): XZRect => ({
    minX: r.minX - by,
    maxX: r.maxX + by,
    minZ: r.minZ - by,
    maxZ: r.maxZ + by,
  });
  const jointOuter = grow(plate, d.joint);
  b.ring(grow(jointOuter, d.surround), jointOuter, C.concrete);
  b.ring(jointOuter, plate, C.joint);

  // Hazard bands across both ends, a yellow line down both sides.
  const band = 0.5;
  const line = 0.08;
  hazardBand(b, { ...plate, maxZ: plate.minZ + band }, 0.3);
  hazardBand(b, { ...plate, minZ: plate.maxZ - band }, 0.3);
  const fieldMinZ = plate.minZ + band;
  const fieldMaxZ = plate.maxZ - band;
  b.rect(plate.minX, plate.minX + line, fieldMinZ, fieldMaxZ, C.yellow);
  b.rect(plate.maxX - line, plate.maxX, fieldMinZ, fieldMaxZ, C.yellow);

  // Three 5.67 m modules, each of 1.4 m plates either side of a centre seam,
  // with the two tyre tracks worn darker.
  const x0 = plate.minX + line;
  const x1 = plate.maxX - line;
  const cx = d.centreX;
  const seam = 0.03;
  const columns: [number, number, 'plate' | 'track' | 'seam'][] = [
    [x0, cx - 1.25, 'plate'],
    [cx - 1.25, cx - 0.65, 'track'],
    [cx - 0.65, cx - seam / 2, 'plate'],
    [cx - seam / 2, cx + seam / 2, 'seam'],
    [cx + seam / 2, cx + 0.65, 'plate'],
    [cx + 0.65, cx + 1.25, 'track'],
    [cx + 1.25, x1, 'plate'],
  ];
  const modules = 3;
  const moduleLength = (fieldMaxZ - fieldMinZ) / modules;
  const joint = 0.06;
  const platesPerModule = 4;
  let seed = 1;
  for (let m = 0; m < modules; m++) {
    const mz0 = fieldMinZ + m * moduleLength + (m > 0 ? joint / 2 : 0);
    const mz1 = fieldMinZ + (m + 1) * moduleLength - (m < modules - 1 ? joint / 2 : 0);
    if (m > 0) b.rect(x0, x1, mz0 - joint, mz0, C.seam);
    const plateLength = (mz1 - mz0) / platesPerModule;
    for (let p = 0; p < platesPerModule; p++) {
      const pz0 = mz0 + p * plateLength + (p > 0 ? seam / 2 : 0);
      const pz1 = mz0 + (p + 1) * plateLength - (p < platesPerModule - 1 ? seam / 2 : 0);
      if (p > 0) b.rect(x0, x1, pz0 - seam, pz0, C.seam);
      for (const [a, z, kind] of columns) {
        const hex = kind === 'seam' ? C.seam : shade(kind === 'track' ? C.track : C.plate, seed++);
        b.rect(a, z, pz0, pz1, hex);
      }
    }
  }
  const geometry = b.finish();
  geometry.name = 'weighbridge-deck';
  return geometry;
}

/** Bolted covers over the eight load cells, at each module end along both edges. */
export function createWeighbridgeCoverGeometry() {
  const d = WEIGHBRIDGE_DECK;
  const b = new FlatBuilder();
  const fieldMinZ = d.minZ + 0.5;
  const fieldMaxZ = d.maxZ - 0.5;
  const moduleLength = (fieldMaxZ - fieldMinZ) / 3;
  const ends = [fieldMinZ + 0.35, fieldMinZ + moduleLength, fieldMinZ + 2 * moduleLength];
  ends.push(fieldMaxZ - 0.35);
  for (const z of ends)
    for (const side of [-1, 1]) {
      const x = d.centreX + side * (d.halfWidth - 0.3);
      const outer: XZRect = { minX: x - 0.18, maxX: x + 0.18, minZ: z - 0.22, maxZ: z + 0.22 };
      const inner: XZRect = { minX: x - 0.13, maxX: x + 0.13, minZ: z - 0.17, maxZ: z + 0.17 };
      b.ring(outer, inner, C.dark);
      b.rect(inner.minX, inner.maxX, inner.minZ, inner.maxZ, C.steel);
    }
  const geometry = b.finish();
  geometry.name = 'weighbridge-load-cell-covers';
  return geometry;
}

const DECK_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#ffffff',
  vertexColors: true,
  roughness: 0.72,
  metalness: 0.18,
  polygonOffset: true,
  polygonOffsetFactor: POLYGON_OFFSET.carriagewayMarking.factor,
  polygonOffsetUnits: POLYGON_OFFSET.carriagewayMarking.units,
});
const COVER_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#ffffff',
  vertexColors: true,
  roughness: 0.6,
  metalness: 0.3,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: POLYGON_OFFSET.exteriorOverlay.factor,
  polygonOffsetUnits: POLYGON_OFFSET.exteriorOverlay.units,
});

// ---------------------------------------------------------------------------
// The office, its island, bollards, display and signs (office-local metres).
// ---------------------------------------------------------------------------

type P3 = [number, number, number];
const span = (a: number, b: number) => [Math.abs(b - a), (a + b) / 2] as const;
/** Box from min/max corners. */
function block(g: PlotGeometry, min: P3, max: P3, hex: string) {
  const [sx, cx] = span(min[0], max[0]);
  const [sy, cy] = span(min[1], max[1]);
  const [sz, cz] = span(min[2], max[2]);
  if (sx < 1e-6 || sy < 1e-6 || sz < 1e-6) return;
  g.box([sx, sy, sz], [cx, cy, cz], hex);
}

/** One wall plane with rectangular openings, built as solid strips around them. */
function wallWithOpenings(
  g: PlotGeometry,
  axis: 'x' | 'z',
  plane: [number, number],
  along: [number, number],
  openings: { a: number; b: number; sill: number; head: number }[],
  hex: string
) {
  const put = (a0: number, a1: number, y0: number, y1: number) => {
    if (axis === 'x') block(g, [plane[0], y0, a0], [plane[1], y1, a1], hex);
    else block(g, [a0, y0, plane[0]], [a1, y1, plane[1]], hex);
  };
  const sorted = [...openings].sort((p, q) => p.a - q.a);
  let cursor = along[0];
  for (const o of sorted) {
    put(cursor, o.a, HUT.floor, HUT.eaves);
    put(o.a, o.b, HUT.floor, o.sill);
    put(o.a, o.b, o.head, HUT.eaves);
    cursor = o.b;
  }
  put(cursor, along[1], HUT.floor, HUT.eaves);
}

/** uPVC frame, mullion and outside sill around an opening in a wall plane. */
function windowFrame(
  g: PlotGeometry,
  glass: THREE.BufferGeometry[],
  axis: 'x' | 'z',
  face: number,
  outward: 1 | -1,
  a: number,
  b: number,
  sill: number,
  head: number,
  mullions: number
) {
  const w = 0.06;
  const depth = 0.12;
  const at = (
    a0: number,
    a1: number,
    y0: number,
    y1: number,
    d0: number,
    d1: number,
    hex: string
  ) =>
    axis === 'x'
      ? block(g, [face + outward * d0, y0, a0], [face + outward * d1, y1, a1], hex)
      : block(g, [a0, y0, face + outward * d0], [a1, y1, face + outward * d1], hex);
  at(a, b, sill, sill + w, -depth, 0.02, C.frame);
  at(a, b, head - w, head, -depth, 0.02, C.frame);
  at(a, a + w, sill, head, -depth, 0.02, C.frame);
  at(b - w, b, sill, head, -depth, 0.02, C.frame);
  for (let i = 1; i <= mullions; i++) {
    const m = a + ((b - a) * i) / (mullions + 1);
    at(m - w / 2, m + w / 2, sill, head, -depth, 0.01, C.frame);
  }
  // Outside sill, proud of the wall and a little wider than the opening.
  at(a - 0.06, b + 0.06, sill - 0.06, sill, 0, 0.09, C.steel);
  // Glass at the middle of the frame depth.
  const pane = new THREE.PlaneGeometry(b - a - 2 * w, head - sill - 2 * w);
  if (axis === 'x') pane.rotateY(outward > 0 ? Math.PI / 2 : -Math.PI / 2);
  else if (outward < 0) pane.rotateY(Math.PI);
  const mid = face - outward * 0.05;
  if (axis === 'x') pane.translate(mid, (sill + head) / 2, (a + b) / 2);
  else pane.translate((a + b) / 2, (sill + head) / 2, mid);
  glass.push(pane);
}

function bollard(g: PlotGeometry, x: number, z: number, base: number) {
  const r = 0.085;
  const h = 1.05;
  g.add(new THREE.CylinderGeometry(r, r, h, 10).translate(x, base + h / 2, z), C.bollard);
  g.add(
    new THREE.CylinderGeometry(r + 0.004, r + 0.004, 0.08, 10).translate(x, base + 0.82, z),
    C.black
  );
  g.add(
    new THREE.CylinderGeometry(r + 0.004, r + 0.004, 0.06, 10).translate(x, base + 0.68, z),
    C.frame
  );
  g.add(
    new THREE.SphereGeometry(r, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2).translate(x, base + h, z),
    C.bollard
  );
}

/** Display post at the deck's exit, east kerb, in world x/z; turned toward the lane. */
const DISPLAY_WORLD = { x: 25.6, z: WEIGHBRIDGE_DECK.minZ - 1.1 } as const;
const DISPLAY = {
  x: DISPLAY_WORLD.x - WEIGHBRIDGE_OFFICE_POSITION[0],
  z: DISPLAY_WORLD.z - WEIGHBRIDGE_OFFICE_POSITION[2],
  yaw: -0.35,
  height: 2.75,
} as const;
/** Approach sign at the island's south end, facing the arriving cab. */
const APPROACH_SIGN = { x: -2.35, z: 4.2, yaw: -0.3, height: 1.85 } as const;

export function createWeighbridgeOfficeGeometry() {
  const g = new PlotGeometry();
  const glass: THREE.BufferGeometry[] = [];
  const { halfX, halfZ, floor, eaves, wall } = HUT;

  // Kerbed island; its road-facing kerbs painted in hazard blocks.
  block(g, [ISLAND.minX, 0, ISLAND.minZ], [ISLAND.maxX, ISLAND.top, ISLAND.maxZ], C.concrete);
  const kerb = 0.16;
  const kerbTop = ISLAND.top + 0.02;
  for (let z = ISLAND.minZ, i = 0; z < ISLAND.maxZ - 1e-6; z += 0.9, i++)
    block(
      g,
      [ISLAND.minX - 0.01, 0, z],
      [ISLAND.minX + kerb, kerbTop, Math.min(z + 0.9, ISLAND.maxZ)],
      i % 2 === 0 ? C.yellow : C.black
    );
  for (let x = ISLAND.minX + kerb, i = 0; x < ISLAND.maxX - 1e-6; x += 0.9, i++)
    for (const [z0, z1] of [
      [ISLAND.minZ - 0.01, ISLAND.minZ + kerb],
      [ISLAND.maxZ - kerb, ISLAND.maxZ + 0.01],
    ])
      block(
        g,
        [x, 0, z0],
        [Math.min(x + 0.9, ISLAND.maxX), kerbTop, z1],
        i % 2 === 0 ? C.black : C.yellow
      );
  block(
    g,
    [ISLAND.maxX - kerb, 0, ISLAND.minZ + kerb],
    [ISLAND.maxX + 0.01, kerbTop, ISLAND.maxZ - kerb],
    C.kerb
  );

  // Plinth, the hut raised clear of standing water and at a driver's eye.
  block(g, [PLINTH.minX, ISLAND.top, PLINTH.minZ], [PLINTH.maxX, PLINTH.top, PLINTH.maxZ], C.base);

  // Walls. West (to the deck): long ticket window. South (to arriving
  // traffic): window and door. North: a small window, so the room reads
  // through. East: solid, carrying the air conditioner.
  const westWindow = { a: -1.35, b: 1.05, sill: 1.5, head: 2.6 };
  const southWindow = { a: -1.2, b: 0.15, sill: 1.5, head: 2.6 };
  const northWindow = { a: -0.6, b: 0.6, sill: 1.6, head: 2.45 };
  const doorOpening = { a: DOOR.minX, b: DOOR.maxX, sill: floor, head: DOOR.head };
  wallWithOpenings(g, 'x', [-halfX, -halfX + wall], [-halfZ, halfZ], [westWindow], C.wall);
  wallWithOpenings(g, 'x', [halfX - wall, halfX], [-halfZ, halfZ], [], C.wall);
  wallWithOpenings(
    g,
    'z',
    [halfZ - wall, halfZ],
    [-halfX + wall, halfX - wall],
    [southWindow, doorOpening],
    C.wall
  );
  wallWithOpenings(
    g,
    'z',
    [-halfZ, -halfZ + wall],
    [-halfX + wall, halfX - wall],
    [northWindow],
    C.wall
  );
  // Base band and corner trims, the cabin's coated-steel edges.
  for (const [x0, x1, z0, z1] of [
    [-halfX - 0.015, halfX + 0.015, halfZ - 0.02, halfZ + 0.015],
    [-halfX - 0.015, halfX + 0.015, -halfZ - 0.015, -halfZ + 0.02],
    [-halfX - 0.015, -halfX + 0.02, -halfZ, halfZ],
    [halfX - 0.02, halfX + 0.015, -halfZ, halfZ],
  ]) {
    if (z1 > halfZ && x0 < DOOR.maxX) {
      // South base band stops at the door.
      block(g, [x0, floor, z0], [DOOR.minX, floor + 0.3, z1], C.trim);
      block(g, [DOOR.maxX, floor, z0], [x1, floor + 0.3, z1], C.trim);
    } else block(g, [x0, floor, z0], [x1, floor + 0.3, z1], C.trim);
  }
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      block(
        g,
        [sx * halfX - 0.05, floor, sz * halfZ - 0.05],
        [sx * halfX + 0.05, eaves, sz * halfZ + 0.05],
        C.trim
      );

  windowFrame(
    g,
    glass,
    'x',
    -halfX,
    -1,
    westWindow.a,
    westWindow.b,
    westWindow.sill,
    westWindow.head,
    2
  );
  windowFrame(
    g,
    glass,
    'z',
    halfZ,
    1,
    southWindow.a,
    southWindow.b,
    southWindow.sill,
    southWindow.head,
    1
  );
  windowFrame(
    g,
    glass,
    'z',
    -halfZ,
    -1,
    northWindow.a,
    northWindow.b,
    northWindow.sill,
    northWindow.head,
    0
  );

  // Door: frame, steel leaf set back in the opening, vision panel, handle, kick plate.
  const doorFace = halfZ;
  block(
    g,
    [DOOR.minX - 0.06, floor, doorFace - 0.12],
    [DOOR.minX, DOOR.head + 0.06, doorFace + 0.02],
    C.frame
  );
  block(
    g,
    [DOOR.maxX, floor, doorFace - 0.12],
    [DOOR.maxX + 0.06, DOOR.head + 0.06, doorFace + 0.02],
    C.frame
  );
  block(
    g,
    [DOOR.minX, DOOR.head, doorFace - 0.12],
    [DOOR.maxX, DOOR.head + 0.06, doorFace + 0.02],
    C.frame
  );
  block(g, [DOOR.minX, floor, doorFace - 0.1], [DOOR.maxX, DOOR.head, doorFace - 0.05], C.door);
  block(
    g,
    [DOOR.minX + 0.18, 1.75, doorFace - 0.05],
    [DOOR.maxX - 0.18, 2.35, doorFace - 0.04],
    C.vision
  );
  block(
    g,
    [DOOR.minX + 0.04, floor, doorFace - 0.05],
    [DOOR.maxX - 0.04, floor + 0.25, doorFace - 0.035],
    C.steel
  );
  block(
    g,
    [DOOR.maxX - 0.14, 1.5, doorFace - 0.05],
    [DOOR.maxX - 0.08, 1.56, doorFace + 0.03],
    C.steel
  );

  // Flat roof with a deep fascia, and the two canopies on brackets.
  block(g, [-ROOF.halfX, ROOF.bottom, -ROOF.halfZ], [ROOF.halfX, ROOF.top, ROOF.halfZ], C.roof);
  const fascia = FASCIA;
  const f0 = ROOF.bottom - 0.08;
  const f1 = ROOF.top + 0.1;
  block(
    g,
    [-ROOF.halfX - fascia, f0, -ROOF.halfZ - fascia],
    [ROOF.halfX + fascia, f1, -ROOF.halfZ],
    C.trim
  );
  block(
    g,
    [-ROOF.halfX - fascia, f0, ROOF.halfZ],
    [ROOF.halfX + fascia, f1, ROOF.halfZ + fascia],
    C.trim
  );
  block(g, [-ROOF.halfX - fascia, f0, -ROOF.halfZ], [-ROOF.halfX, f1, ROOF.halfZ], C.trim);
  block(g, [ROOF.halfX, f0, -ROOF.halfZ], [ROOF.halfX + fascia, f1, ROOF.halfZ], C.trim);
  const canopyY = westWindow.head + 0.17;
  block(
    g,
    [-halfX - WEST_CANOPY, canopyY, westWindow.a - 0.25],
    [-halfX, canopyY + 0.07, westWindow.b + 0.25],
    C.roof
  );
  block(
    g,
    [-halfX - WEST_CANOPY - FASCIA, canopyY - 0.06, westWindow.a - 0.25],
    [-halfX - WEST_CANOPY, canopyY + 0.1, westWindow.b + 0.25],
    C.trim
  );
  for (const z of [westWindow.a - 0.15, westWindow.b + 0.15])
    g.beam([-halfX, canopyY - 0.45, z], [-halfX - WEST_CANOPY + 0.05, canopyY, z], 0.04, C.steel);
  const doorCanopyY = DOOR.head + 0.2;
  block(
    g,
    [DOOR.minX - 0.3, doorCanopyY, halfZ],
    [Math.min(DOOR.maxX + 0.3, halfX + 0.05), doorCanopyY + 0.07, halfZ + DOOR_CANOPY],
    C.roof
  );
  block(
    g,
    [DOOR.minX - 0.3, doorCanopyY - 0.06, halfZ + DOOR_CANOPY],
    [Math.min(DOOR.maxX + 0.3, halfX + 0.05), doorCanopyY + 0.1, halfZ + DOOR_CANOPY + 0.03],
    C.trim
  );
  for (const x of [DOOR.minX - 0.2, DOOR.maxX + 0.12])
    g.beam(
      [x, doorCanopyY - 0.45, halfZ],
      [x, doorCanopyY, halfZ + DOOR_CANOPY - 0.05],
      0.04,
      C.steel
    );
  // Door lamp housing; its lens is the shared exterior lens (WeighbridgeLights).
  block(g, [0.78, DOOR.head + 0.02, halfZ], [0.98, DOOR.head + 0.15, halfZ + 0.12], C.dark);

  // Steps up to the door from the island, with a handrail on the open side.
  const rise = (PLINTH.top - ISLAND.top) / 3;
  const stepMinX = DOOR.minX - 0.15;
  const stepMaxX = DOOR.maxX + 0.15;
  block(
    g,
    [stepMinX, ISLAND.top, PLINTH.maxZ],
    [stepMaxX, ISLAND.top + 2 * rise, PLINTH.maxZ + STEP_RUN],
    C.concrete
  );
  block(
    g,
    [stepMinX, ISLAND.top, PLINTH.maxZ + STEP_RUN],
    [stepMaxX, ISLAND.top + rise, PLINTH.maxZ + 2 * STEP_RUN],
    C.concrete
  );
  for (const [z0, top] of [
    [PLINTH.maxZ - 0.04, PLINTH.top],
    [PLINTH.maxZ + STEP_RUN - 0.04, ISLAND.top + 2 * rise],
    [PLINTH.maxZ + 2 * STEP_RUN - 0.04, ISLAND.top + rise],
  ] as const)
    block(g, [stepMinX, top - 0.004, z0], [stepMaxX, top + 0.001, z0 + 0.04], C.yellow);
  const railX = stepMaxX + 0.04;
  const railTop = 0.95;
  const postsZ = [PLINTH.maxZ - 0.1, PLINTH.maxZ + 2 * STEP_RUN - 0.05];
  const baseAt = (z: number) => (z < PLINTH.maxZ ? PLINTH.top : ISLAND.top + rise);
  for (const z of postsZ)
    g.beam([railX, baseAt(z), z], [railX, baseAt(z) + railTop, z], 0.045, C.steel);
  g.beam(
    [railX, baseAt(postsZ[0]) + railTop, postsZ[0]],
    [railX, baseAt(postsZ[1]) + railTop, postsZ[1]],
    0.045,
    C.steel
  );

  // Air conditioner on the east wall.
  block(g, [halfX, 2.0, -0.9], [halfX + 0.3, 2.55, 0.1], C.frame);
  block(g, [halfX + 0.3, 2.08, -0.8], [halfX + 0.31, 2.47, 0.0], C.dark);
  g.beam([halfX + 0.1, 2.0, -0.4], [halfX + 0.1, floor, -0.4], 0.035, C.frame);

  // Interior seen through the glass: desk under the ticket window, monitor
  // and printer, chair, filing cabinet. The room's lining is WeighbridgeRoom.
  const inX = -halfX + wall;
  block(g, [inX, floor, -1.5], [inX + 0.62, floor + 0.76, 1.1], C.desk);
  block(g, [inX + 0.22, floor + 0.76, -0.55], [inX + 0.27, floor + 1.12, -0.05], C.screen);
  block(g, [inX + 0.27, floor + 0.76, -0.33], [inX + 0.4, floor + 0.8, -0.27], C.dark);
  block(g, [inX + 0.15, floor + 0.76, 0.35], [inX + 0.45, floor + 0.9, 0.75], C.frame);
  block(g, [inX + 0.85, floor + 0.42, -0.5], [inX + 1.3, floor + 0.5, -0.05], C.dark);
  block(g, [inX + 1.25, floor + 0.5, -0.5], [inX + 1.32, floor + 1.05, -0.05], C.dark);
  block(g, [inX + 1.0, floor, -0.32], [inX + 1.1, floor + 0.42, -0.22], C.steel);
  block(
    g,
    [halfX - wall - 0.5, floor, -halfZ + wall],
    [halfX - wall, floor + 1.3, -halfZ + wall + 0.65],
    C.steel
  );

  // Roof sign facing the deck and the lane, on two posts.
  const signX = -halfX - 0.1;
  for (const z of [-1.0, 0.8])
    g.beam([signX + 0.08, ROOF.top, z], [signX + 0.08, ROOF.top + 0.35, z], 0.06, C.dark);
  block(g, [signX, ROOF.top + 0.2, -1.55], [signX + 0.06, ROOF.top + 0.78, 1.35], C.trim);
  block(
    g,
    [signX - 0.005, ROOF.top + 0.24, -1.51],
    [signX + 0.005, ROOF.top + 0.74, 1.31],
    C.signBoard
  );

  // Bollards between the hard shoulder and the hut.
  for (const z of [-1.5, 0.2, 1.9, 3.6]) bollard(g, ISLAND.minX + 0.4, z, ISLAND.top);

  // Weight display on its post: housing, hood, and a dark LED face.
  {
    const post = new PlotGeometry();
    // It stands on the yard, off the island: a cast footing seats it.
    post.box([0.5, 0.12, 0.5], [0, 0.06, 0], C.concrete);
    post.beam([0, 0, 0], [0, DISPLAY.height + 0.45, 0], 0.11, C.steel);
    post.box([1.45, 0.62, 0.16], [0, DISPLAY.height + 0.3, 0.1], C.dark);
    post.box([1.55, 0.05, 0.3], [0, DISPLAY.height + 0.64, 0.14], C.dark);
    post.box([1.3, 0.48, 0.01], [0, DISPLAY.height + 0.3, 0.185], '#090a0b');
    post.box([1.3, 0.12, 0.01], [0, DISPLAY.height - 0.08, 0.1], C.signBoard);
    const merged = post.finish();
    // Already coloured per part, so it joins the body without a repaint.
    g.parts.push(merged.rotateY(DISPLAY.yaw).translate(DISPLAY.x, 0, DISPLAY.z));
  }
  // Approach sign: white panel, dark border, on two posts.
  {
    const sign = new PlotGeometry();
    for (const x of [-0.5, 0.5])
      sign.beam([x, ISLAND.top, 0], [x, APPROACH_SIGN.height + 0.45, 0], 0.07, C.steel);
    sign.box([1.4, 0.95, 0.05], [0, APPROACH_SIGN.height, 0.06], C.trim);
    sign.box([1.32, 0.87, 0.01], [0, APPROACH_SIGN.height, 0.09], C.signBoard);
    sign.box([1.32, 0.28, 0.012], [0, APPROACH_SIGN.height - 0.28, 0.09], '#c4231f');
    const merged = sign.finish();
    g.parts.push(merged.rotateY(APPROACH_SIGN.yaw).translate(APPROACH_SIGN.x, 0, APPROACH_SIGN.z));
  }

  const body = g.finish();
  body.name = 'weighbridge-office';
  const mergedGlass = new PlotGeometry();
  glass.forEach((p) => mergedGlass.add(p, '#ffffff'));
  const glassGeometry = mergedGlass.finish();
  glassGeometry.name = 'weighbridge-glazing';
  return { body, glass: glassGeometry };
}

const OFFICE_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#ffffff',
  vertexColors: true,
  roughness: 0.7,
  metalness: 0.08,
});
/** Clear float glass: low tint, low roughness, the room behind it shows. */
const GLASS_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#7f95a3',
  transparent: true,
  opacity: 0.42,
  roughness: 0.04,
  metalness: 0.5,
  depthWrite: false,
  side: THREE.DoubleSide,
});

/** The room's lining, drawn from inside (BackSide), lit by the lamp clock at night. */
function createRoomGeometry() {
  const inX = HUT.halfX - HUT.wall - 0.005;
  const inZ = HUT.halfZ - HUT.wall - 0.005;
  const h = HUT.eaves - HUT.floor - 0.02;
  const g = new THREE.BoxGeometry(inX * 2, h, inZ * 2).translate(0, HUT.floor + h / 2, 0);
  // Faces in BoxGeometry order: +x, -x, +y (ceiling), -y (floor), +z, -z.
  const faces = ['#8e8676', '#8e8676', '#a29d92', '#3d3a35', '#857d6c', '#8e8676'];
  const colors = new Float32Array(24 * 3);
  const c = new THREE.Color();
  faces.forEach((hex, face) => {
    c.set(hex);
    for (let v = 0; v < 4; v++) c.toArray(colors, (face * 4 + v) * 3);
  });
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.name = 'weighbridge-room';
  return g;
}

const DYNAMIC = { noStaticBatch: true } as const;

/** Room lining and ceiling panel, brightened by the lamp clock. */
const WeighbridgeRoom: React.FC = () => {
  const geometry = useMemo(createRoomGeometry, []);
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#ffffff',
        vertexColors: true,
        roughness: 0.9,
        side: THREE.BackSide,
        emissive: '#ffd9a0',
        emissiveIntensity: 0,
      }),
    []
  );
  const level = useRef(-1);
  useFrame(() => {
    const next = EXTERIOR_LAMP_LEVEL.value;
    if (next === level.current) return;
    level.current = next;
    material.emissiveIntensity = next * 0.32;
  });
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material]
  );
  return (
    <group userData={DYNAMIC}>
      <mesh name="weighbridge-room" geometry={geometry} material={material} receiveShadow />
      <mesh
        name="weighbridge-ceiling-panel"
        position={[0.1, HUT.eaves - 0.03, 0]}
        rotation={[Math.PI / 2, 0, 0]}
        material={EXTERIOR_LAMP_LENS_MATERIAL}
      >
        <planeGeometry args={[0.6, 1.2]} />
      </mesh>
      {/* Door lamp lens, under the housing in the static body. */}
      <mesh
        name="weighbridge-door-lamp"
        position={[0.88, DOOR.head + 0.015, HUT.halfZ + 0.06]}
        rotation={[Math.PI / 2, 0, 0]}
        material={EXTERIOR_LAMP_LENS_MATERIAL}
      >
        <planeGeometry args={[0.18, 0.1]} />
      </mesh>
      <group position={[0.88, ISLAND.top, PLINTH.maxZ + 0.55]}>
        <ExteriorLampPool radius={1.7} />
      </group>
    </group>
  );
};

const onDeck = (x: number, z: number) =>
  Math.abs(x - WEIGHBRIDGE_DECK.centreX) < WEIGHBRIDGE_DECK.halfWidth + 0.3 &&
  z >= WEIGHBRIDGE_DECK.minZ - 0.2 &&
  z <= WEIGHBRIDGE_DECK.maxZ + 0.2;

/**
 * TruckBay registers the cab at the tractor's origin and the trailer at its
 * centre, 5.75 m back; the trailer's tandem axles are 4.3 m further back
 * along its heading.
 */
const TRAILER_AXLES_BEHIND_CENTRE = 4.3;

/** Weight on the deck from the live shipping truck: the tractor's axles, the trailer's, or both. */
export function weighbridgeReadingKg(
  cab: { x: number; z: number } | undefined,
  trailer: { x: number; z: number; dirX?: number; dirZ?: number } | undefined
): number {
  const tractorOn = cab ? onDeck(cab.x, cab.z) : false;
  const trailerOn = trailer
    ? onDeck(
        trailer.x - (trailer.dirX ?? 0) * TRAILER_AXLES_BEHIND_CENTRE,
        trailer.z - (trailer.dirZ ?? 0) * TRAILER_AXLES_BEHIND_CENTRE
      )
    : false;
  return (tractorOn ? TRACTOR_KG : 0) + (trailerOn ? TARE_KG - TRACTOR_KG : 0);
}

/** The readout follows the live shipping truck, changing state only when the reading does. */
const WeightReadout: React.FC = () => {
  const [kg, setKg] = useState(0);
  const shown = useRef(0);
  useFrame(() => {
    const next = weighbridgeReadingKg(
      positionRegistry.get('shipping-truck-cab'),
      positionRegistry.get('shipping-truck-trailer')
    );
    if (next !== shown.current) {
      shown.current = next;
      setKg(next);
    }
  });
  return (
    <group position={[DISPLAY.x, 0, DISPLAY.z]} rotation={[0, DISPLAY.yaw, 0]} userData={DYNAMIC}>
      <Text
        position={[0.12, DISPLAY.height + 0.3, 0.195]}
        fontSize={0.34}
        color="#ff4a26"
        anchorX="right"
        anchorY="middle"
        letterSpacing={0.06}
      >
        {String(kg)}
      </Text>
      <Text
        position={[0.2, DISPLAY.height + 0.26, 0.195]}
        fontSize={0.2}
        color="#ff4a26"
        anchorX="left"
        anchorY="middle"
      >
        kg
      </Text>
      <Text
        position={[0, DISPLAY.height - 0.08, 0.11]}
        fontSize={0.085}
        color="#1f3b35"
        anchorX="center"
        anchorY="middle"
        surface="painted"
      >
        WEIGHT
      </Text>
    </group>
  );
};

/** Deck, office and furniture at the shipping checkpoint. */
export const Weighbridge: React.FC = () => {
  const deck = useMemo(createWeighbridgeDeckGeometry, []);
  const covers = useMemo(createWeighbridgeCoverGeometry, []);
  const office = useMemo(createWeighbridgeOfficeGeometry, []);
  useEffect(
    () => () => {
      deck.dispose();
      covers.dispose();
      office.body.dispose();
      office.glass.dispose();
    },
    [deck, covers, office]
  );
  return (
    <group name="shipping-weighbridge">
      <mesh
        name="weighbridge-deck"
        position={[0, EXTERIOR_LAYERS.ground, 0]}
        geometry={deck}
        material={DECK_MATERIAL}
        receiveShadow
      />
      <mesh
        name="weighbridge-load-cell-covers"
        position={[0, EXTERIOR_LAYERS.groundOverlay, 0]}
        geometry={covers}
        material={COVER_MATERIAL}
        renderOrder={RENDER_ORDER.floorMarkings}
        receiveShadow
      />
      <group position={[...WEIGHBRIDGE_OFFICE_POSITION]}>
        <mesh
          name="weighbridge-office"
          geometry={office.body}
          material={OFFICE_MATERIAL}
          castShadow
          receiveShadow
        />
        <mesh name="weighbridge-glazing" geometry={office.glass} material={GLASS_MATERIAL} />
        <WeighbridgeRoom />
        <WeightReadout />
        {/* Painted signs: lit paint, never translated. */}
        <Text
          position={[-HUT.halfX - 0.11, ROOF.top + 0.49, -0.1]}
          rotation={[0, -Math.PI / 2, 0]}
          fontSize={0.34}
          color="#1f3b35"
          anchorX="center"
          anchorY="middle"
          letterSpacing={0.04}
          surface="painted"
        >
          WEIGHBRIDGE
        </Text>
        <group
          position={[APPROACH_SIGN.x, 0, APPROACH_SIGN.z]}
          rotation={[0, APPROACH_SIGN.yaw, 0]}
        >
          <Text
            position={[0, APPROACH_SIGN.height + 0.17, 0.1]}
            fontSize={0.17}
            color="#1f3b35"
            anchorX="center"
            anchorY="middle"
            surface="painted"
          >
            WEIGHBRIDGE
          </Text>
          <Text
            position={[0, APPROACH_SIGN.height - 0.04, 0.1]}
            fontSize={0.092}
            color="#1f3b35"
            anchorX="center"
            anchorY="middle"
            surface="painted"
          >
            ONE VEHICLE ON DECK
          </Text>
          <Text
            position={[0, APPROACH_SIGN.height - 0.28, 0.1]}
            fontSize={0.17}
            color="#ffffff"
            anchorX="center"
            anchorY="middle"
            surface="painted"
          >
            DEAD SLOW
          </Text>
        </group>
      </group>
    </group>
  );
};
