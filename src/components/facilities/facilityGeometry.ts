import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  ACCESSIBLE_WC,
  FACILITY_BLOCKS,
  FACILITY_CEILING,
  FACILITY_DECK_BOTTOM,
  FACILITY_DECK_TOP,
  FACILITY_DOOR_JAMB,
  FACILITY_DOOR_LEAF,
  FACILITY_DOORS,
  FACILITY_FLOOR_TOP,
  FACILITY_PARAPET_TOP,
  FACILITY_PLANTERS,
  FACILITY_ROOMS,
  FACILITY_SEATS,
  FACILITY_WALL,
  FACILITY_WALLS,
  FIRST_AID_ROOM,
  LOCKER_ROOM,
  MANAGER_OFFICE,
  MEETING_ROOM,
  STAFF_ROOM,
  TOILETS,
  doorLeafPlan,
  roomInterior,
  type FacilityDoor,
  type FacilityOpening,
  type FacilityRoom,
  type FacilityWallFinish,
  type FacilityWallLine,
  type PlanRect,
} from './facilityLayout';
import { FACILITY_FINISHES, atlasUv, type AtlasRegion } from './facilityTextures';

/**
 * Geometry for the staff facilities, built once from `facilityLayout.ts`.
 *
 * Every part is baked in world space and merged per material, so the whole of
 * both blocks is a few dozen draws however many mugs and binders it holds.
 * Plain parts share a handful of materials and carry their colour as a vertex
 * attribute; tiled finishes get world-metre UVs (see `facilityTextures.ts`).
 *
 * Three layers, for the quality tiers: `shell` (walls, roof, doors, glazing,
 * floors and ceilings) and `fittings` (furniture, sanitaryware, kitchenette)
 * at every tier; `dressing` (everything small enough to be sub-pixel from the
 * hall: mugs, binders, plants, photographs, hooks) from medium up.
 *
 * Faces that sit on one another are kept at least 3 mm apart (linings stand
 * 3 mm off the blockwork, prints 2-3 mm off their mounts), so no two faces of
 * one merged draw share a plane.
 */

export type FacilityMaterialKey =
  | 'paint'
  | 'satin'
  | 'metal'
  | 'fabric'
  | 'foliage'
  | 'blockwork'
  | 'oakBoards'
  | 'oak'
  | 'tile'
  | 'vinyl'
  | 'metro'
  | 'carpet'
  | 'ceilingGrid'
  | 'stipple'
  | 'rug'
  | 'print'
  | 'screen'
  | 'lamp'
  | 'glass'
  | 'obscured';

export type FacilityLayer = 'shell' | 'fittings' | 'dressing';

/** World-metre repeat of each tiled material (absent: UVs are left as authored). */
const TILE_METRES: Partial<Record<FacilityMaterialKey, number>> = {
  blockwork: FACILITY_FINISHES.blockwork.metres,
  oakBoards: FACILITY_FINISHES.oakBoards.metres,
  oak: FACILITY_FINISHES.oakVeneer.metres,
  tile: FACILITY_FINISHES.floorTile.metres,
  vinyl: FACILITY_FINISHES.safetyVinyl.metres,
  metro: FACILITY_FINISHES.metroTile.metres,
  carpet: FACILITY_FINISHES.carpet.metres,
  ceilingGrid: FACILITY_FINISHES.ceilingGrid.metres,
  stipple: FACILITY_FINISHES.paint.metres,
};

type V3 = readonly [number, number, number];
type Facing = '+x' | '-x' | '+y' | '-y' | '+z' | '-z';

const _color = new THREE.Color();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

class FacilityBuilder {
  readonly parts = new Map<string, THREE.BufferGeometry[]>();
  layer: FacilityLayer = 'shell';
  /**
   * How much of the rooms' own lamplight a part receives (the `glow` vertex
   * attribute; see `StaffFacilities`): 1 inside a room, 0 on the hall side,
   * more on a ceiling, which only ever sees light bounced off the floor.
   */
  glow = 1;

  private push(
    key: FacilityMaterialKey,
    geometry: THREE.BufferGeometry,
    color: string,
    uv?: number[]
  ) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (geometry !== g) geometry.dispose();
    const count = g.getAttribute('position').count;
    _color.set(color);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = _color.r;
      colors[i * 3 + 1] = _color.g;
      colors[i * 3 + 2] = _color.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.setAttribute('glow', new THREE.BufferAttribute(new Float32Array(count).fill(this.glow), 1));
    const tile = TILE_METRES[key];
    if (tile) worldUv(g, tile);
    else if (uv) mapUvRect(g, uv);
    const id = `${this.layer}:${key}`;
    const list = this.parts.get(id) ?? [];
    list.push(g);
    this.parts.set(id, list);
  }

  /** Axis-aligned box from centre and size, optionally yawed about its centre. */
  box(key: FacilityMaterialKey, c: V3, s: V3, color = '#ffffff', yaw = 0, pitch = 0, roll = 0) {
    if (s[0] <= 0 || s[1] <= 0 || s[2] <= 0) return;
    const g = new THREE.BoxGeometry(s[0], s[1], s[2]);
    if (yaw || pitch || roll)
      g.applyMatrix4(_m.makeRotationFromEuler(_e.set(pitch, yaw, roll, 'YXZ')));
    g.translate(c[0], c[1], c[2]);
    this.push(key, g, color);
  }

  /** Box from min and max corners. */
  span(key: FacilityMaterialKey, min: V3, max: V3, color = '#ffffff') {
    this.box(
      key,
      [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
      [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
      color
    );
  }

  /** Upright cylinder (or cone frustum) standing on `base`. */
  cylinder(
    key: FacilityMaterialKey,
    base: V3,
    rTop: number,
    rBottom: number,
    height: number,
    color = '#ffffff',
    segments = 16,
    axis: 'y' | 'x' | 'z' = 'y'
  ) {
    const g = new THREE.CylinderGeometry(rTop, rBottom, height, segments);
    g.translate(0, height / 2, 0);
    if (axis === 'x') g.rotateZ(-Math.PI / 2);
    if (axis === 'z') g.rotateX(Math.PI / 2);
    g.translate(base[0], base[1], base[2]);
    this.push(key, g, color);
  }

  /** A soft lump (leaves, a cushion of soil): a low-poly sphere scaled to `r`. */
  blob(key: FacilityMaterialKey, c: V3, r: V3, color: string, detail = 1) {
    const g = new THREE.IcosahedronGeometry(1, detail);
    g.scale(r[0], r[1], r[2]);
    g.translate(c[0], c[1], c[2]);
    this.push(key, g, color);
  }

  /** Hemisphere dome (a hard hat), open side down. */
  dome(key: FacilityMaterialKey, c: V3, r: number, color: string) {
    const g = new THREE.SphereGeometry(r, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    g.translate(c[0], c[1], c[2]);
    this.push(key, g, color);
  }

  /** A flat quad facing `facing`, `w` across and `h` up (for +-y: `w` along x, `h` along z). */
  quad(
    key: FacilityMaterialKey,
    c: V3,
    w: number,
    h: number,
    facing: Facing,
    color = '#ffffff',
    region?: AtlasRegion | [number, number, number, number]
  ) {
    const g = new THREE.PlaneGeometry(w, h);
    switch (facing) {
      case '-z':
        g.rotateY(Math.PI);
        break;
      case '+x':
        g.rotateY(Math.PI / 2);
        break;
      case '-x':
        g.rotateY(-Math.PI / 2);
        break;
      case '+y':
        g.rotateX(-Math.PI / 2);
        break;
      case '-y':
        g.rotateX(Math.PI / 2);
        break;
    }
    g.translate(c[0], c[1], c[2]);
    const uv =
      region === undefined ? undefined : typeof region === 'string' ? atlasUv(region) : region;
    this.push(key, g, color, uv);
  }

  /** Run `fn` with geometry built about a local origin, then placed by `at` and `yaw`. */
  local(at: V3, yaw: number, fn: (b: FacilityBuilder) => void) {
    const inner = new FacilityBuilder();
    inner.layer = this.layer;
    inner.glow = this.glow;
    fn(inner);
    _m.compose(_p.set(at[0], at[1], at[2]), _q.setFromEuler(_e.set(0, yaw, 0)), _s.set(1, 1, 1));
    for (const [id, list] of inner.parts) {
      const mine = this.parts.get(id) ?? [];
      for (const g of list) {
        g.applyMatrix4(_m);
        // World UVs must follow the move; prints keep their authored rectangle.
        const key = id.split(':')[1] as FacilityMaterialKey;
        const tile = TILE_METRES[key];
        if (tile) worldUv(g, tile);
        mine.push(g);
      }
      this.parts.set(id, mine);
    }
  }
}

/** UVs from world position, per face axis: walls (z|x, y), floors (x, z). */
function worldUv(g: THREE.BufferGeometry, metres: number) {
  const pos = g.getAttribute('position');
  const nrm = g.getAttribute('normal');
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nrm.getX(i));
    const ay = Math.abs(nrm.getY(i));
    const az = Math.abs(nrm.getZ(i));
    let u: number;
    let v: number;
    if (ay >= ax && ay >= az) {
      u = pos.getX(i);
      v = pos.getZ(i);
    } else if (ax >= az) {
      u = pos.getZ(i);
      v = pos.getY(i);
    } else {
      u = pos.getX(i);
      v = pos.getY(i);
    }
    uv[i * 2] = u / metres;
    uv[i * 2 + 1] = v / metres;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/** Remap a 0-1 UV quad onto an atlas rectangle. */
function mapUvRect(g: THREE.BufferGeometry, [u0, v0, u1, v1]: number[]) {
  const uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i++)
    uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  uv.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// Palette (sRGB display hexes)
// ---------------------------------------------------------------------------

const C = {
  white: '#f7f5ef',
  porcelain: '#fbfbf9',
  partition: '#eeeae2',
  plinthBand: '#4e5c56',
  coping: '#8d9496',
  roof: '#596063',
  frame: '#2f3a3c',
  doorFrame: '#2f5d5a',
  steel: '#c7ccce',
  darkSteel: '#3a4245',
  navy: '#1f3e6e',
  red: '#c62828',
  oak: '#ffffff',
  sage: '#9fb39a',
  cream: '#f3e9d6',
  kitchen: '#7d9a83',
  signBoard: '#2f4a45',
  soil: '#3e2c20',
  terracotta: '#b8643f',
  leaf: '#4f7a3a',
  leafLight: '#6f9a4a',
  leafDark: '#3c5f2e',
};

interface WallFinishSpec {
  /** Bands from the floor up: [top, material, colour]. The last band runs to the ceiling. */
  readonly bands: readonly (readonly [number, FacilityMaterialKey, string])[];
  readonly skirting?: string;
  readonly dado?: number;
}

const WALL_FINISHES: Record<FacilityWallFinish, WallFinishSpec> = {
  staff: {
    bands: [
      [1.0, 'satin', C.sage],
      [FACILITY_CEILING, 'stipple', C.cream],
    ],
    skirting: '#f4efe4',
    dado: 1.0,
  },
  tiled: {
    bands: [
      [2.0, 'metro', '#ffffff'],
      [FACILITY_CEILING, 'stipple', '#f4f1ea'],
    ],
  },
  lockers: {
    bands: [
      [1.2, 'satin', '#a7bcc0'],
      [FACILITY_CEILING, 'stipple', '#e3eaeb'],
    ],
    skirting: '#5f7f86',
    dado: 1.2,
  },
  office: {
    bands: [[FACILITY_CEILING, 'stipple', '#dfe6d9']],
    skirting: '#f4efe4',
  },
  meeting: {
    bands: [[FACILITY_CEILING, 'stipple', '#f2ece1']],
    skirting: '#f4efe4',
  },
  clinic: {
    bands: [
      [1.2, 'satin', '#cfe3db'],
      [FACILITY_CEILING, 'stipple', '#f3f6f4'],
    ],
    skirting: '#5c8f7d',
    dado: 1.2,
  },
};

// ---------------------------------------------------------------------------
// Walls, openings and linings
// ---------------------------------------------------------------------------

const H = FACILITY_WALL / 2;

/** Pieces of [from, to] left after cutting the openings out (each with its opening, if any). */
function runPieces(
  from: number,
  to: number,
  openings: readonly FacilityOpening[]
): { a: number; b: number; opening?: FacilityOpening }[] {
  const sorted = [...openings]
    .filter((o) => o.to > from && o.from < to)
    .sort((p, q) => p.from - q.from);
  const out: { a: number; b: number; opening?: FacilityOpening }[] = [];
  let start = from;
  for (const o of sorted) {
    const a = Math.max(from, o.from);
    const b = Math.min(to, o.to);
    if (a > start) out.push({ a: start, b: a });
    out.push({ a, b, opening: o });
    start = b;
  }
  if (to > start) out.push({ a: start, b: to });
  return out;
}

/** Box of a wall-parallel slab: along [a, b], across [c0, c1] from the centre line, y [y0, y1]. */
function wallSlab(
  b: FacilityBuilder,
  wall: FacilityWallLine,
  key: FacilityMaterialKey,
  a0: number,
  a1: number,
  c0: number,
  c1: number,
  y0: number,
  y1: number,
  color: string
) {
  if (a1 - a0 < 1e-4 || y1 - y0 < 1e-4) return;
  const lo = Math.min(c0, c1);
  const hi = Math.max(c0, c1);
  if (wall.runs === 'x') b.span(key, [a0, y0, wall.at + lo], [a1, y1, wall.at + hi], color);
  else b.span(key, [wall.at + lo, y0, a0], [wall.at + hi, y1, a1], color);
}

function buildWalls(b: FacilityBuilder) {
  b.layer = 'shell';
  // The blockwork's room faces are all behind linings; what shows is the hall side.
  b.glow = 0;
  for (const wall of FACILITY_WALLS) {
    const top = wall.outer ? FACILITY_PARAPET_TOP : FACILITY_DECK_BOTTOM;
    const key: FacilityMaterialKey = wall.outer ? 'blockwork' : 'paint';
    const color = wall.outer ? '#ffffff' : C.partition;
    for (const piece of runPieces(wall.from, wall.to, wall.openings)) {
      const o = piece.opening;
      if (!o) {
        wallSlab(b, wall, key, piece.a, piece.b, -H, H, 0, top, color);
        continue;
      }
      if (o.sill > 0) wallSlab(b, wall, key, piece.a, piece.b, -H, H, 0, o.sill, color);
      wallSlab(b, wall, key, piece.a, piece.b, -H, H, o.head, top, color);
    }
    if (wall.outer) {
      // Coping along the parapet and a painted plinth band on both faces,
      // broken at each door.
      // Coping over the parapet; along x it oversails the corners.
      const reach = wall.runs === 'x' ? 0.03 : 0;
      wallSlab(
        b,
        wall,
        'metal',
        wall.from - reach,
        wall.to + reach,
        -H - 0.03,
        H + 0.03,
        top,
        top + 0.05,
        C.coping
      );
      // Plinth band on the hall face only, turning each corner, broken at each door.
      const turn = wall.runs === 'x' ? 0.012 : H + 0.012;
      const side = isHallSide(wall, 1) ? 1 : -1;
      for (const piece of runPieces(
        wall.from - turn,
        wall.to + turn,
        wall.openings.filter((o) => o.kind === 'door')
      )) {
        if (piece.opening) continue;
        wallSlab(
          b,
          wall,
          'satin',
          piece.a,
          piece.b,
          side * (H + 0.004),
          side * (H + 0.012),
          0,
          0.15,
          C.plinthBand
        );
      }
    }
    for (const o of wall.openings) {
      if (o.kind === 'door') buildDoor(b, wall, o as FacilityDoor);
      else buildWindow(b, wall, o);
    }
  }
}

function buildWindow(b: FacilityBuilder, wall: FacilityWallLine, o: FacilityOpening) {
  const f = 0.05;
  const depth = FACILITY_WALL + 0.035;
  b.layer = 'shell';
  // Frame round the opening (head, sill rail and jambs) and mullions under 1.3 m.
  wallSlab(b, wall, 'satin', o.from, o.to, -depth / 2, depth / 2, o.head - f, o.head, C.frame);
  wallSlab(b, wall, 'satin', o.from, o.to, -depth / 2, depth / 2, o.sill, o.sill + f, C.frame);
  wallSlab(
    b,
    wall,
    'satin',
    o.from,
    o.from + f,
    -depth / 2,
    depth / 2,
    o.sill + f,
    o.head - f,
    C.frame
  );
  wallSlab(
    b,
    wall,
    'satin',
    o.to - f,
    o.to,
    -depth / 2,
    depth / 2,
    o.sill + f,
    o.head - f,
    C.frame
  );
  const bays = Math.max(1, Math.round((o.to - o.from) / 1.3));
  const bay = (o.to - o.from) / bays;
  for (let i = 1; i < bays; i++) {
    const m = o.from + i * bay;
    wallSlab(b, wall, 'satin', m - 0.03, m + 0.03, -0.04, 0.04, o.sill + f, o.head - f, C.frame);
  }
  // Glass on the centre line, 3 mm clear of the frame faces it meets.
  wallSlab(
    b,
    wall,
    o.kind === 'obscured-window' ? 'obscured' : 'glass',
    o.from + f,
    o.to - f,
    -0.006,
    0.006,
    o.sill + f,
    o.head - f,
    '#ffffff'
  );
  // Sill boards: oak inside, a pressed-metal cill outside (outer walls only).
  if (o.sill > 0.3) {
    for (const side of [-1, 1] as const) {
      const outward = isHallSide(wall, side);
      b.glow = outward ? 0 : 1;
      wallSlab(
        b,
        wall,
        outward ? 'metal' : 'oak',
        o.from - 0.04,
        o.to + 0.04,
        side * (depth / 2),
        side * (depth / 2 + (outward ? 0.05 : 0.12)),
        o.sill - 0.03,
        o.sill + (outward ? 0 : 0.004),
        outward ? C.coping : C.oak
      );
    }
    b.glow = 0;
  }
}

/** True when `side` (+1/-1 along the wall normal) of an outer wall faces the hall. */
function isHallSide(wall: FacilityWallLine, side: 1 | -1): boolean {
  if (!wall.outer) return false;
  const block = FACILITY_BLOCKS.find((k) => k.id === wall.block)!;
  const centre = wall.runs === 'x' ? (block.minZ + block.maxZ) / 2 : (block.minX + block.maxX) / 2;
  return Math.sign(wall.at - centre) === side;
}

function buildDoor(b: FacilityBuilder, wall: FacilityWallLine, d: FacilityDoor) {
  const j = FACILITY_DOOR_JAMB;
  const depth = FACILITY_WALL + 0.035;
  b.layer = 'shell';
  // Contrasting frame: two jambs and the head (Approved Document M asks for it).
  wallSlab(b, wall, 'satin', d.from, d.from + j, -depth / 2, depth / 2, 0, d.head, C.doorFrame);
  wallSlab(b, wall, 'satin', d.to - j, d.to, -depth / 2, depth / 2, 0, d.head, C.doorFrame);
  wallSlab(
    b,
    wall,
    'satin',
    d.from,
    d.to,
    -depth / 2,
    depth / 2,
    d.head - j,
    d.head + 0.02,
    C.doorFrame
  );
  // Level threshold: a flush 12 mm plate across the opening, the room finish height.
  // It stops 3 mm short of each room's floor sheet so their tops never share a plane edge-on.
  wallSlab(
    b,
    wall,
    'metal',
    d.from + j,
    d.to - j,
    -H - 0.012,
    H + 0.012,
    0,
    FACILITY_FLOOR_TOP,
    '#9aa0a3'
  );
  // The leaf, open at a right angle.
  const leaf = doorLeafPlan({ ...d, wall });
  const top = d.head - 0.02;
  const glazed =
    d.room === 'staff-room' || d.room === 'manager-office' || d.room === 'meeting-room';
  // A leaf standing open into its room shares the room's light; one open into the hall does not.
  b.glow = wall.outer && d.swing > 0 ? 0 : 1;
  const along0 = wall.runs === 'x' ? leaf.minX : leaf.minZ;
  const along1 = wall.runs === 'x' ? leaf.maxX : leaf.maxZ;
  // Across the leaf's width, measured from the hinge.
  const across = (from: number, to: number): [number, number] =>
    d.swing > 0 ? [H + from, H + to] : [-H - to, -H - from];
  const leafSlab = (
    key: FacilityMaterialKey,
    w0: number,
    w1: number,
    y0: number,
    y1: number,
    color: string,
    proud = 0
  ) => {
    const [a, bb] = across(w0, w1);
    wallSlab(b, wall, key, along0 - proud, along1 + proud, a, bb, y0, y1, color);
  };
  if (glazed) {
    // Vision panel 150 mm wide, 500 mm from the lock edge, at seated and standing eye heights.
    const w = FACILITY_DOOR_LEAF.width;
    const p0 = w - 0.42;
    const p1 = w - 0.27;
    leafSlab('oak', 0, w, 0.02, 0.6, C.oak);
    leafSlab('oak', 0, w, 1.75, top, C.oak);
    leafSlab('oak', 0, p0, 0.6, 1.75, C.oak);
    leafSlab('oak', p1, w, 0.6, 1.75, C.oak);
    leafSlab('glass', p0, p1, 0.6, 1.75, '#ffffff');
  } else {
    leafSlab('oak', 0, FACILITY_DOOR_LEAF.width, 0.02, top, C.oak);
  }
  // Kick plates and lever handles on both faces.
  leafSlab('metal', 0.04, FACILITY_DOOR_LEAF.width - 0.04, 0.03, 0.25, '#c9ced0', 0.003);
  const lock = FACILITY_DOOR_LEAF.width - 0.07;
  leafSlab('metal', lock - 0.02, lock + 0.02, 0.95, 1.1, '#c9ced0', 0.008);
  leafSlab('metal', lock - 0.14, lock, 1.01, 1.03, '#c9ced0', 0.04);
  if (d.room === 'accessible-wc')
    // A horizontal pull rail across the leaf, in the rail colour.
    leafSlab('satin', 0.15, FACILITY_DOOR_LEAF.width - 0.2, 0.88, 0.92, C.navy, 0.04);
  b.glow = 0;
}

/** Room linings, skirting, dado rails, floors and ceilings. */
function buildRoomFinishes(b: FacilityBuilder) {
  b.layer = 'shell';
  b.glow = 1;
  for (const room of FACILITY_ROOMS) {
    const inner = roomInterior(room);
    const spec = WALL_FINISHES[room.walls];
    const floorKey: FacilityMaterialKey =
      room.floor === 'oak'
        ? 'oakBoards'
        : room.floor === 'tile'
          ? 'tile'
          : room.floor === 'carpet'
            ? 'carpet'
            : 'vinyl';
    const floorTint =
      room.id === 'accessible-wc'
        ? '#8fa6b2'
        : room.id === 'lockers'
          ? '#bccbc4'
          : room.id === 'first-aid'
            ? '#cfe2d9'
            : '#ffffff';
    b.span(
      floorKey,
      [inner.minX, 0, inner.minZ],
      [inner.maxX, FACILITY_FLOOR_TOP, inner.maxZ],
      floorTint
    );
    // A ceiling sees only light bounced off the floor and walls, so it takes more of the glow.
    b.glow = 2.2;
    b.span(
      room.gridCeiling ? 'ceilingGrid' : 'stipple',
      [inner.minX, FACILITY_CEILING, inner.minZ],
      [inner.maxX, FACILITY_CEILING + 0.02, inner.maxZ],
      '#fbfaf6'
    );
    b.glow = 1;
    for (const side of ['north', 'south', 'east', 'west'] as const)
      buildLining(b, room, inner, side, spec);
  }
}

function sideWall(
  room: FacilityRoom,
  side: 'north' | 'south' | 'east' | 'west'
): FacilityWallLine | undefined {
  const runs = side === 'north' || side === 'south' ? 'x' : 'z';
  const at =
    side === 'north'
      ? room.maxZ
      : side === 'south'
        ? room.minZ
        : side === 'east'
          ? room.maxX
          : room.minX;
  const [lo, hi] = runs === 'x' ? [room.minX, room.maxX] : [room.minZ, room.maxZ];
  return FACILITY_WALLS.find(
    (w) => w.runs === runs && Math.abs(w.at - at) < 1e-6 && w.from < hi - 1e-6 && w.to > lo + 1e-6
  );
}

function buildLining(
  b: FacilityBuilder,
  room: FacilityRoom,
  inner: PlanRect,
  side: 'north' | 'south' | 'east' | 'west',
  spec: WallFinishSpec
) {
  const wall = sideWall(room, side);
  if (!wall) return;
  // The lining sits on the room's side of the wall: -normal for north/east, +normal otherwise.
  const s = side === 'north' || side === 'east' ? -1 : 1;
  const c0 = s * (H + 0.003);
  const c1 = s * (H + 0.015);
  const alongX = side === 'north' || side === 'south';
  const from = alongX ? room.minX + H + 0.003 : inner.minZ;
  const to = alongX ? room.maxX - H - 0.003 : inner.maxZ;
  const pieces = runPieces(from, to, wall.openings);
  let y = FACILITY_FLOOR_TOP;
  for (const [top, key, color] of spec.bands) {
    for (const p of pieces) {
      const o = p.opening;
      if (!o) wallSlab(b, wall, key, p.a, p.b, c0, c1, y, top, color);
      else {
        wallSlab(b, wall, key, p.a, p.b, c0, c1, y, Math.min(top, o.sill), color);
        wallSlab(b, wall, key, p.a, p.b, c0, c1, Math.max(y, o.head), top, color);
      }
    }
    y = top;
  }
  const trim = (y0: number, y1: number, proud: number, key: FacilityMaterialKey, color: string) => {
    for (const p of pieces) {
      const o = p.opening;
      if (o && (o.kind === 'door' || (o.sill < y1 && o.head > y0))) continue;
      wallSlab(b, wall, key, p.a, p.b, c1, c1 + s * proud, y0, y1, color);
    }
  };
  if (spec.skirting) trim(FACILITY_FLOOR_TOP, 0.11, 0.012, 'satin', spec.skirting);
  if (spec.dado) trim(spec.dado - 0.025, spec.dado + 0.025, 0.02, 'oak', C.oak);
}

function buildRoofs(b: FacilityBuilder) {
  b.layer = 'shell';
  b.glow = 0;
  for (const block of FACILITY_BLOCKS) {
    b.span(
      'paint',
      [block.minX + H, FACILITY_DECK_BOTTOM, block.minZ + H],
      [block.maxX - H, FACILITY_DECK_TOP, block.maxZ - H],
      C.roof
    );
  }
  // Rooftop plant: the office's condenser and the welfare block's extract cowl.
  b.span(
    'satin',
    [22.0, FACILITY_DECK_TOP, -33.9],
    [23.0, FACILITY_DECK_TOP + 0.62, -33.5],
    '#d5d8d6'
  );
  b.cylinder(
    'satin',
    [22.5, FACILITY_DECK_TOP + 0.31, -33.497],
    0.24,
    0.24,
    0.005,
    '#3b4144',
    20,
    'z'
  );
  b.cylinder('metal', [-21.0, FACILITY_DECK_TOP, -30.2], 0.16, 0.16, 0.5, '#a9afb2');
  b.cylinder('metal', [-21.0, FACILITY_DECK_TOP + 0.5, -30.2], 0.02, 0.3, 0.14, '#a9afb2');
  b.cylinder('metal', [-13.2, FACILITY_DECK_TOP, -33.2], 0.11, 0.11, 0.38, '#a9afb2');
  b.cylinder('metal', [-13.2, FACILITY_DECK_TOP + 0.38, -33.2], 0.02, 0.2, 0.1, '#a9afb2');
}

// ---------------------------------------------------------------------------
// Small reusable pieces
// ---------------------------------------------------------------------------

/** A potted plant: terracotta pot, soil and a crown of leaf clumps. */
function plant(b: FacilityBuilder, at: V3, size: number, seed: number, tall = false) {
  const potR = 0.12 * size + 0.04;
  const potH = 0.22 * size + 0.06;
  b.cylinder('satin', at, potR, potR * 0.78, potH, C.terracotta, 14);
  b.cylinder(
    'satin',
    [at[0], at[1] + potH - 0.01, at[2]],
    potR + 0.012,
    potR + 0.012,
    0.03,
    '#a4583a',
    14
  );
  b.cylinder(
    'fabric',
    [at[0], at[1] + potH - 0.012, at[2]],
    potR * 0.95,
    potR * 0.95,
    0.008,
    C.soil,
    12
  );
  const crown = at[1] + potH + (tall ? 0.6 * size : 0.12 * size);
  if (tall)
    b.cylinder(
      'oak',
      [at[0], at[1] + potH, at[2]],
      0.012,
      0.018,
      crown - at[1] - potH,
      '#6a4a2e',
      6
    );
  const greens = [C.leaf, C.leafLight, C.leafDark];
  const n = tall ? 7 : 5;
  for (let i = 0; i < n; i++) {
    const a = seed * 2.3 + (i / n) * Math.PI * 2;
    const r = (tall ? 0.16 : 0.08) * size;
    const y = crown + (i % 3) * 0.07 * size + (tall ? 0.15 * size : 0);
    b.blob(
      'foliage',
      [at[0] + Math.cos(a) * r, y, at[2] + Math.sin(a) * r],
      [0.13 * size + 0.04, 0.1 * size + 0.03, 0.13 * size + 0.04],
      greens[(i + seed) % 3]
    );
  }
  b.blob(
    'foliage',
    [at[0], crown + (tall ? 0.32 * size : 0.12 * size), at[2]],
    [0.14 * size, 0.12 * size, 0.14 * size],
    C.leafLight
  );
}

/** A framed print on a wall: frame box, mount and the print itself 3 mm proud. */
function framedPrint(
  b: FacilityBuilder,
  c: V3,
  facing: Facing,
  w: number,
  h: number,
  region: AtlasRegion,
  frameColor = '#3a2f26'
) {
  const n = facingVector(facing);
  const d = 0.025;
  const centre: V3 = [c[0] + n[0] * (d / 2), c[1], c[2] + n[2] * (d / 2)];
  const size: V3 = n[0] !== 0 ? [d, h + 0.06, w + 0.06] : [w + 0.06, h + 0.06, d];
  b.box('satin', centre, size, frameColor);
  b.quad(
    'print',
    [c[0] + n[0] * (d + 0.003), c[1], c[2] + n[2] * (d + 0.003)],
    w,
    h,
    facing,
    '#ffffff',
    region
  );
}

function facingVector(f: Facing): V3 {
  return f === '+x'
    ? [1, 0, 0]
    : f === '-x'
      ? [-1, 0, 0]
      : f === '+z'
        ? [0, 0, 1]
        : f === '-z'
          ? [0, 0, -1]
          : f === '+y'
            ? [0, 1, 0]
            : [0, -1, 0];
}

/** A dining chair in its own frame: seat centre at the origin, facing +z. */
function diningChair(b: FacilityBuilder, shell: string) {
  for (const [x, z] of [
    [-0.18, -0.18],
    [0.18, -0.18],
    [-0.18, 0.18],
    [0.18, 0.18],
  ])
    b.cylinder('oak', [x, FACILITY_FLOOR_TOP, z], 0.016, 0.014, 0.44, C.oak, 8);
  b.box('satin', [0, 0.465, 0], [0.44, 0.04, 0.42], shell);
  b.box('satin', [0, 0.69, -0.2], [0.42, 0.3, 0.035], shell, 0, -0.12);
  b.box('fabric', [0, 0.492, 0.01], [0.38, 0.018, 0.36], '#e9dfcc');
}

/** A table: oak top on four legs, centred at the origin. */
function table(b: FacilityBuilder, halfX: number, halfZ: number, top: number) {
  b.box('oak', [0, top - 0.02, 0], [halfX * 2, 0.04, halfZ * 2], C.oak);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      b.box(
        'oak',
        [sx * (halfX - 0.07), (top - 0.04 + FACILITY_FLOOR_TOP) / 2, sz * (halfZ - 0.07)],
        [0.05, top - 0.04 - FACILITY_FLOOR_TOP, 0.05],
        C.oak
      );
  b.box('oak', [0, top - 0.07, halfZ - 0.07], [halfX * 2 - 0.2, 0.06, 0.02], C.oak);
  b.box('oak', [0, top - 0.07, -halfZ + 0.07], [halfX * 2 - 0.2, 0.06, 0.02], C.oak);
}

/** A ceiling pendant over `x, z`: cord, shade, and its glowing underside. */
function pendant(b: FacilityBuilder, x: number, z: number, drop: number, shade: string) {
  const bottom = FACILITY_CEILING - drop;
  b.cylinder('metal', [x, FACILITY_CEILING - 0.03, z], 0.05, 0.05, 0.03, '#2b2d30', 12);
  b.cylinder('metal', [x, bottom + 0.16, z], 0.004, 0.004, drop - 0.19, '#2b2d30', 4);
  b.cylinder('satin', [x, bottom, z], 0.05, 0.22, 0.16, shade, 20);
  b.quad('lamp', [x, bottom + 0.004, z], 0.36, 0.36, '-y', '#ffd9a0');
}

/** A flush ceiling panel light. */
function panelLight(b: FacilityBuilder, x: number, z: number, w = 0.58, d = 0.58) {
  b.box('satin', [x, FACILITY_CEILING - 0.006, z], [w + 0.04, 0.012, d + 0.04], '#f2f2f0');
  b.quad('lamp', [x, FACILITY_CEILING - 0.013, z], w, d, '-y', '#fff1d8');
}

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

const SEAT_SHELLS = ['#3f7f7a', '#d5a03a', '#d9725a', '#8fae8a', '#4f6d8c'];

function buildStaffRoom(b: FacilityBuilder) {
  b.glow = 1;
  const S = STAFF_ROOM;
  const i = S.interior;
  const F = FACILITY_FLOOR_TOP;
  b.layer = 'fittings';
  // Kitchenette base units with shaker doors, and the oak worktop round the sink.
  const c = S.counter;
  const units0 = S.loweredCounter.maxX;
  b.span('satin', [units0, F, c.minZ], [c.maxX, 0.1, c.maxZ - 0.06], '#2b2d30');
  b.span('satin', [units0, 0.1, c.minZ], [c.maxX, 0.86, c.maxZ - 0.02], '#e7e2d7');
  const doors = Math.round((c.maxX - units0) / 0.6);
  const dw = (c.maxX - units0) / doors;
  for (let k = 0; k < doors; k++) {
    const x0 = units0 + k * dw + 0.003;
    const x1 = units0 + (k + 1) * dw - 0.003;
    b.span('satin', [x0, 0.105, c.maxZ - 0.02], [x1, 0.855, c.maxZ - 0.002], C.kitchen);
    b.span(
      'satin',
      [x0 + 0.06, 0.17, c.maxZ - 0.002],
      [x1 - 0.06, 0.79, c.maxZ + 0.004],
      '#86a38c'
    );
    b.span(
      'metal',
      [x1 - 0.06, 0.62, c.maxZ + 0.004],
      [x1 - 0.045, 0.78, c.maxZ + 0.022],
      '#b08d57'
    );
  }
  const top = S.worktopTop;
  const sinkX0 = S.sinkCentreX - 0.25;
  const sinkX1 = S.sinkCentreX + 0.25;
  const sz0 = c.minZ + 0.1;
  const sz1 = c.maxZ - 0.1;
  const tz1 = c.maxZ + 0.02;
  b.span('oak', [units0, top - 0.04, c.minZ], [sinkX0, top, tz1], C.oak);
  b.span('oak', [sinkX1, top - 0.04, c.minZ], [c.maxX, top, tz1], C.oak);
  b.span('oak', [sinkX0, top - 0.04, c.minZ], [sinkX1, top, sz0], C.oak);
  b.span('oak', [sinkX0, top - 0.04, sz1], [sinkX1, top, tz1], C.oak);
  // The bowl: an open steel box.
  b.span('metal', [sinkX0, top - 0.2, sz0], [sinkX1, top - 0.19, sz1], '#b9bfc2');
  b.span('metal', [sinkX0, top - 0.19, sz0], [sinkX0 + 0.01, top - 0.003, sz1], '#c7ccce');
  b.span('metal', [sinkX1 - 0.01, top - 0.19, sz0], [sinkX1, top - 0.003, sz1], '#c7ccce');
  b.span(
    'metal',
    [sinkX0 + 0.01, top - 0.19, sz0],
    [sinkX1 - 0.01, top - 0.003, sz0 + 0.01],
    '#c7ccce'
  );
  b.span(
    'metal',
    [sinkX0 + 0.01, top - 0.19, sz1 - 0.01],
    [sinkX1 - 0.01, top - 0.003, sz1],
    '#c7ccce'
  );
  b.span(
    'metal',
    [sinkX1 + 0.02, top, c.minZ + 0.08],
    [sinkX1 + 0.42, top + 0.006, c.maxZ - 0.06],
    '#c7ccce'
  );
  // Lowered worktop with knee space below it, its apron rail at the front.
  const lw = S.loweredWorktopTop;
  b.span('oak', [c.minX, lw - 0.04, c.minZ], [units0, lw, tz1], C.oak);
  b.span('oak', [c.minX, lw - 0.1, tz1 - 0.03], [units0, lw - 0.04, tz1], C.oak);
  // Tiled splashback in sage-green metro, round the sink window.
  const back = c.minZ + 0.008;
  b.span('metro', [c.minX, top, c.minZ + 0.002], [-15.75, 1.45, back], '#a9cbbd');
  b.span('metro', [-15.75, top, c.minZ + 0.002], [-14.25, 1.2 - 0.03, back], '#a9cbbd');
  b.span('metro', [-14.25, top, c.minZ + 0.002], [c.maxX, 1.45, back], '#a9cbbd');
  b.span('metro', [c.minX, lw, c.minZ + 0.002], [units0, top, back], '#a9cbbd');
  // Wall cupboards either side of the window, with a warm strip light under them.
  for (const [x0, x1] of [
    [c.minX, -15.9],
    [-14.1, c.maxX],
  ]) {
    b.span('satin', [x0, 1.45, c.minZ], [x1, 2.15, c.minZ + 0.31], '#e7e2d7');
    const n = Math.max(1, Math.round((x1 - x0) / 0.5));
    const w = (x1 - x0) / n;
    for (let k = 0; k < n; k++) {
      b.span(
        'satin',
        [x0 + k * w + 0.003, 1.455, c.minZ + 0.31],
        [x0 + (k + 1) * w - 0.003, 2.145, c.minZ + 0.328],
        C.kitchen
      );
      b.span(
        'metal',
        [x0 + k * w + w / 2 - 0.008, 1.5, c.minZ + 0.328],
        [x0 + k * w + w / 2 + 0.008, 1.62, c.minZ + 0.345],
        '#b08d57'
      );
    }
    b.quad('lamp', [(x0 + x1) / 2, 1.444, c.minZ + 0.26], x1 - x0 - 0.1, 0.04, '-y', '#ffdca8');
  }
  // Retro fridge.
  const fr = S.fridge;
  b.span('satin', [fr.minX, F, fr.minZ], [fr.maxX, 1.8, fr.maxZ - 0.02], '#bfd8cc');
  b.span(
    'satin',
    [fr.minX + 0.005, 0.07, fr.maxZ - 0.02],
    [fr.maxX - 0.005, 1.2, fr.maxZ],
    '#c6ded2'
  );
  b.span(
    'satin',
    [fr.minX + 0.005, 1.215, fr.maxZ - 0.02],
    [fr.maxX - 0.005, 1.79, fr.maxZ],
    '#c6ded2'
  );
  b.span(
    'metal',
    [fr.maxX - 0.07, 0.95, fr.maxZ],
    [fr.maxX - 0.05, 1.15, fr.maxZ + 0.03],
    '#d7dbdd'
  );
  b.span(
    'metal',
    [fr.maxX - 0.07, 1.26, fr.maxZ],
    [fr.maxX - 0.05, 1.46, fr.maxZ + 0.03],
    '#d7dbdd'
  );
  // Tables and their chairs; each table end is left free for a wheelchair.
  for (const t of S.tables)
    b.local([t.x, 0, t.z], 0, (l) => table(l, S.tableHalf[0], S.tableHalf[1], 0.74));
  FACILITY_SEATS.filter((s) => s.room === 'staff-room' && s.kind === 'chair').forEach((s, k) =>
    b.local(s.position, s.rotation, (l) => diningChair(l, SEAT_SHELLS[k % SEAT_SHELLS.length]))
  );
  // The sofa corner.
  const so = S.sofa;
  b.span('fabric', [so.minX + 0.04, 0.1, so.minZ], [so.maxX, 0.42, so.maxZ], '#4f6d8c');
  for (const z of [
    [so.minZ + 0.14, (so.minZ + so.maxZ) / 2 - 0.005],
    [(so.minZ + so.maxZ) / 2 + 0.005, so.maxZ - 0.14],
  ])
    b.span('fabric', [so.minX + 0.03, 0.42, z[0]], [so.maxX - 0.2, 0.52, z[1]], '#5b7a99');
  b.span(
    'fabric',
    [so.maxX - 0.2, 0.42, so.minZ + 0.14],
    [so.maxX, 0.86, so.maxZ - 0.14],
    '#4f6d8c'
  );
  for (const z of [so.minZ, so.maxZ - 0.14])
    b.span('fabric', [so.minX + 0.04, 0.42, z], [so.maxX, 0.64, z + 0.14], '#486584');
  for (const z of [so.minZ + 0.05, so.maxZ - 0.05])
    for (const x of [so.minX + 0.09, so.maxX - 0.08])
      b.cylinder('oak', [x, F, z], 0.02, 0.015, 0.09, '#6a4a2e', 8);
  b.box('fabric', [so.maxX - 0.27, 0.66, so.minZ + 0.42], [0.12, 0.36, 0.36], '#d39a45', 0, 0, 0.3);
  b.box('fabric', [so.maxX - 0.27, 0.66, so.maxZ - 0.45], [0.12, 0.34, 0.34], '#b5573c', 0, 0, 0.3);
  // Armchair, angled at the coffee table.
  b.local([S.armchair.x, 0, S.armchair.z], (Math.PI * 3) / 4, (l) => {
    l.span('fabric', [-0.38, 0.1, -0.36], [0.38, 0.42, 0.38], '#c9963a');
    l.span('fabric', [-0.3, 0.42, -0.28], [0.3, 0.5, 0.32], '#d4a24a');
    l.span('fabric', [-0.38, 0.42, -0.4], [0.38, 0.86, -0.22], '#c9963a');
    l.span('fabric', [-0.38, 0.42, -0.22], [-0.28, 0.62, 0.38], '#bd8b33');
    l.span('fabric', [0.28, 0.42, -0.22], [0.38, 0.62, 0.38], '#bd8b33');
    for (const [x, z] of [
      [-0.32, -0.32],
      [0.32, -0.32],
      [-0.32, 0.32],
      [0.32, 0.32],
    ])
      l.cylinder('oak', [x, FACILITY_FLOOR_TOP, z], 0.02, 0.015, 0.09, '#6a4a2e', 8);
  });
  // Coffee table on the rug.
  b.local([S.coffeeTable.x, 0, S.coffeeTable.z], 0, (l) => table(l, 0.45, 0.27, 0.42));
  const rug = S.rug;
  b.quad(
    'rug',
    [rug.x, F + 0.004, rug.z],
    rug.halfX * 2,
    rug.halfZ * 2,
    '+y',
    '#ffffff',
    [0, 0, 1, 1]
  );
  // Notice board, photographs of the mill's history, clock.
  b.layer = 'dressing';
  b.box('oak', [i.minX + 0.015, 1.55, -32.8], [0.03, 1.06, 1.56], C.oak);
  b.quad('print', [i.minX + 0.033, 1.55, -32.8], 1.5, 1.0, '+x', '#ffffff', 'noticeBoard');
  framedPrint(b, [i.minX, 1.55, -31.15], '+x', 0.48, 0.36, 'photoWaterMill');
  framedPrint(b, [i.minX, 1.55, -30.25], '+x', 0.48, 0.36, 'photoWagons');
  framedPrint(b, [-15.72, 1.6, i.maxZ], '-z', 0.4, 0.3, 'photoRollerHall');
  b.cylinder('satin', [-13.35, 2.52, i.maxZ - 0.03], 0.17, 0.17, 0.03, '#2c3b35', 28, 'z');
  b.quad('print', [-13.35, 2.52, i.maxZ - 0.033], 0.3, 0.3, '-z', '#ffffff', 'clock');
  // Kitchen things: kettle, mugs, tea tins, microwave on the lowered top.
  b.cylinder('satin', [-13.7, top, -36.2], 0.085, 0.095, 0.2, '#e8dcc2', 18);
  b.cylinder('satin', [-13.7, top + 0.2, -36.2], 0.04, 0.07, 0.04, '#e8dcc2', 14);
  b.box('satin', [-13.6, top + 0.12, -36.2], [0.03, 0.14, 0.04], '#2b2d30');
  b.box('satin', [-13.82, top + 0.15, -36.2], [0.08, 0.025, 0.03], '#e8dcc2');
  ['#d9725a', '#3f7f7a', '#d5a03a'].forEach((col, k) => {
    const x = -13.2 + k * 0.11;
    b.cylinder('satin', [x, top, -36.05], 0.04, 0.038, 0.095, col, 14);
    b.box('satin', [x + 0.045, top + 0.05, -36.05], [0.015, 0.05, 0.012], col);
  });
  ['#2f5d8a', '#b5352b', '#e2b12f'].forEach((col, k) =>
    b.cylinder('satin', [-16.1 + k * 0.13, top, -36.38], 0.05, 0.05, 0.16 - k * 0.02, col, 14)
  );
  b.span('satin', [-17.17, lw, -36.47], [-16.62, lw + 0.3, -36.08], '#2f3335');
  b.span('glass', [-17.12, lw + 0.05, -36.08], [-16.8, lw + 0.26, -36.074], '#ffffff');
  b.span('satin', [-16.76, lw + 0.06, -36.08], [-16.66, lw + 0.25, -36.075], '#8a9194');
  // Tap.
  b.cylinder('metal', [S.sinkCentreX, top, -36.43], 0.018, 0.022, 0.26, '#d7dbdd', 10);
  b.cylinder('metal', [S.sinkCentreX, top + 0.24, -36.43], 0.012, 0.012, 0.18, '#d7dbdd', 8, 'z');
  // A shelf over the sink window with jars and a trailing plant.
  b.span('oak', [-15.95, 2.28, c.minZ], [-14.05, 2.31, c.minZ + 0.22], C.oak);
  ['#d7c9a6', '#c9b38a', '#e1d6bd'].forEach((col, k) =>
    b.cylinder('glass', [-15.6 + k * 0.22, 2.31, c.minZ + 0.11], 0.05, 0.05, 0.16, col, 12)
  );
  plant(b, [-14.35, 2.31, c.minZ + 0.11], 0.5, 3);
  // Fruit bowl and a jug of flowers on the tables.
  const [tn, ts] = [S.tables[1], S.tables[0]];
  b.cylinder('satin', [tn.x, 0.74, tn.z], 0.14, 0.08, 0.07, '#f1ebe0', 18);
  for (const [dx, dz, col] of [
    [0.04, 0.02, '#e88a2a'],
    [-0.05, 0.03, '#e88a2a'],
    [0.0, -0.05, '#9cbf3a'],
  ] as const)
    b.blob('satin', [tn.x + dx, 0.82, tn.z + dz], [0.04, 0.04, 0.04], col);
  b.cylinder('glass', [ts.x, 0.74, ts.z], 0.05, 0.06, 0.16, '#cfe3e8', 12);
  for (let k = 0; k < 6; k++) {
    const a = k * 1.1;
    b.blob(
      'foliage',
      [ts.x + Math.cos(a) * 0.06, 0.95 + (k % 2) * 0.04, ts.z + Math.sin(a) * 0.06],
      [0.03, 0.03, 0.03],
      ['#e8c33c', '#f4f0e6', '#d9725a'][k % 3]
    );
  }
  // Magazines and a mug on the coffee table.
  b.span('satin', [-12.7, 0.42, -31.0], [-12.42, 0.43, -30.8], '#2f5d8a');
  b.span('satin', [-12.66, 0.43, -30.98], [-12.4, 0.438, -30.79], '#e3b341');
  b.cylinder('satin', [-12.15, 0.42, -30.9], 0.04, 0.038, 0.09, '#f4efe4', 14);
  // Floor lamp by the sofa.
  b.cylinder('metal', [-11.05, F, -29.25], 0.14, 0.15, 0.025, '#2b2d30', 18);
  b.cylinder('metal', [-11.05, F, -29.25], 0.012, 0.012, 1.42, '#b08d57', 8);
  b.cylinder('lamp', [-11.05, 1.32, -29.25], 0.14, 0.2, 0.26, '#ffd9a0', 20);
  // Plants: a tall one in the south-east corner, small ones on the north sill.
  plant(b, [-11.05, F, -36.08], 1.2, 1, true);
  for (const [k, x] of [-14.9, -13.35, -11.8].entries())
    plant(b, [x, 0.904, i.maxZ - 0.06], 0.4, k + 5);
  // Recycling bins beside the fridge.
  b.span('satin', [-12.15, F, -36.48], [-11.82, 0.62, -36.12], '#3c7a46');
  b.span('satin', [-11.8, F, -36.48], [-11.47, 0.62, -36.12], '#2f5d8a');
  b.layer = 'shell';
  for (const t of S.tables) pendant(b, t.x, t.z, 0.6, '#3f6f68');
  panelLight(b, -12.3, -30.8, 0.9, 0.3);
  panelLight(b, -15.6, -35.4, 0.9, 0.3);
}

function buildLockers(b: FacilityBuilder) {
  b.glow = 1;
  const L = LOCKER_ROOM;
  const F = FACILITY_FLOOR_TOP;
  const doorColours = ['#7fa39a', '#5f8796', '#a9b9a3', '#d8c8a6'];
  b.layer = 'fittings';
  // Two-tier lockers, so the lower tier is at a seated reach.
  const bank = (r: PlanRect, facing: '+x' | '+z') => {
    const count = 8;
    const alongX = facing === '+z';
    const [a0, a1] = alongX ? [r.minX, r.maxX] : [r.minZ, r.maxZ];
    const w = (a1 - a0) / count;
    const front = alongX ? r.maxZ : r.maxX;
    b.span('satin', [r.minX, F, r.minZ], [r.maxX, 0.1, r.maxZ], '#2b2d30');
    b.span(
      'satin',
      [r.minX, 0.1, r.minZ],
      alongX ? [r.maxX, 1.85, r.maxZ - 0.02] : [r.maxX - 0.02, 1.85, r.maxZ],
      '#e6e2d6'
    );
    for (let k = 0; k < count; k++) {
      for (const [t, y0, y1] of [
        [0, 0.11, 0.97],
        [1, 0.99, 1.84],
      ] as const) {
        const col = doorColours[(k + t * 2) % doorColours.length];
        const p0 = a0 + k * w + 0.004;
        const p1 = a0 + (k + 1) * w - 0.004;
        if (alongX) {
          b.span('satin', [p0, y0, front - 0.02], [p1, y1, front - 0.002], col);
          b.layer = 'dressing';
          b.span(
            'satin',
            [p0 + 0.08, y1 - 0.12, front - 0.002],
            [p1 - 0.08, y1 - 0.06, front + 0.001],
            '#4b5457'
          );
          b.quad(
            'print',
            [(p0 + p1) / 2, y1 - 0.2, front + 0.002],
            0.07,
            0.07,
            '+z',
            '#ffffff',
            'lockerTag'
          );
          b.span(
            'metal',
            [p1 - 0.06, y0 + (y1 - y0) / 2 - 0.05, front - 0.002],
            [p1 - 0.04, y0 + (y1 - y0) / 2 + 0.05, front + 0.02],
            '#c7ccce'
          );
          b.layer = 'fittings';
        } else {
          b.span('satin', [front - 0.02, y0, p0], [front - 0.002, y1, p1], col);
          b.layer = 'dressing';
          b.span(
            'satin',
            [front - 0.002, y1 - 0.12, p0 + 0.08],
            [front + 0.001, y1 - 0.06, p1 - 0.08],
            '#4b5457'
          );
          b.quad(
            'print',
            [front + 0.002, y1 - 0.2, (p0 + p1) / 2],
            0.07,
            0.07,
            '+x',
            '#ffffff',
            'lockerTag'
          );
          b.span(
            'metal',
            [front - 0.002, y0 + (y1 - y0) / 2 - 0.05, p1 - 0.06],
            [front + 0.02, y0 + (y1 - y0) / 2 + 0.05, p1 - 0.04],
            '#c7ccce'
          );
          b.layer = 'fittings';
        }
      }
    }
    b.span('satin', [r.minX, 1.85, r.minZ], [r.maxX, 1.88, r.maxZ], '#d8d3c6');
  };
  bank(L.southBank, '+z');
  bank(L.westBank, '+x');
  // Slatted oak bench with a boot shelf.
  const be = L.bench;
  for (let k = 0; k < 3; k++) {
    const z0 = be.minZ + k * 0.135;
    b.span('oak', [be.minX, 0.41, z0], [be.maxX, 0.45, z0 + 0.12], C.oak);
  }
  for (const x of [be.minX + 0.15, be.maxX - 0.15]) {
    b.span('satin', [x - 0.02, F, be.minZ + 0.02], [x + 0.02, 0.41, be.minZ + 0.06], '#2b2d30');
    b.span('satin', [x - 0.02, F, be.maxZ - 0.06], [x + 0.02, 0.41, be.maxZ - 0.02], '#2b2d30');
  }
  b.span(
    'oak',
    [be.minX + 0.1, 0.12, be.minZ + 0.03],
    [be.maxX - 0.1, 0.14, be.maxZ - 0.03],
    C.oak
  );
  // Coat hooks on the north wall, hi-vis and hard hats on the shelf above.
  b.layer = 'dressing';
  const wallZ = L.interior.maxZ;
  const [hx0, hx1] = L.hookRailX;
  b.span('oak', [hx0, 1.6, wallZ - 0.02], [hx1, 1.7, wallZ], C.oak);
  b.span('oak', [hx0, 1.93, wallZ - 0.26], [hx1, 1.96, wallZ], C.oak);
  for (let k = 0; k < 8; k++) {
    const x = hx0 + 0.25 + k * 0.5;
    b.span('metal', [x - 0.01, 1.62, wallZ - 0.09], [x + 0.01, 1.66, wallZ - 0.02], '#c7ccce');
    if (k % 3 !== 1) {
      // A hi-vis vest on the hook, its reflective bands proud of it.
      b.span(
        'fabric',
        [x - 0.2, 0.98, wallZ - 0.1],
        [x + 0.2, 1.6, wallZ - 0.05],
        k % 2 ? '#e8d33a' : '#ec7a2a'
      );
      for (const y of [1.12, 1.3])
        b.span('satin', [x - 0.2, y, wallZ - 0.103], [x + 0.2, y + 0.04, wallZ - 0.1], '#cfd4d6');
    } else {
      b.span('fabric', [x - 0.23, 0.82, wallZ - 0.13], [x + 0.23, 1.6, wallZ - 0.04], '#2b3a52');
    }
    if (k % 2 === 0) b.dome('satin', [x, 1.96, wallZ - 0.13], 0.13, k % 4 ? '#f4f1ea' : '#e8d33a');
  }
  // Boots under the hooks.
  for (let k = 0; k < 5; k++) {
    const x = hx0 + 0.4 + k * 0.7;
    for (const dx of [-0.07, 0.07]) {
      b.span(
        'satin',
        [x + dx - 0.05, F, wallZ - 0.4],
        [x + dx + 0.05, 0.14, wallZ - 0.12],
        '#2a2522'
      );
      b.span(
        'satin',
        [x + dx - 0.05, 0.14, wallZ - 0.22],
        [x + dx + 0.05, 0.3, wallZ - 0.12],
        '#2a2522'
      );
    }
  }
  // Full-length mirror and a trailing plant on the lockers.
  const ex = L.interior.maxX;
  b.span('satin', [ex - 0.03, 0.45, -33.45], [ex, 1.95, -32.65], '#3a2f26');
  b.span('satin', [ex - 0.034, 0.5, -33.4], [ex - 0.03, 1.9, -32.7], '#b7c3c8');
  plant(b, [L.westBank.minX + 0.22, 1.88, -33.0], 0.5, 2);
  b.layer = 'shell';
  panelLight(b, -22.9, -34.0, 1.2, 0.25);
  panelLight(b, -19.6, -34.0, 1.2, 0.25);
}

function buildToilets(b: FacilityBuilder) {
  b.glow = 1;
  const T = TOILETS;
  const i = T.interior;
  const F = FACILITY_FLOOR_TOP;
  const panel = '#b4cfdc';
  b.layer = 'fittings';
  const xs = T.cubicleXs;
  const front = T.cubicleFrontZ;
  for (let k = 0; k < 3; k++) {
    const x0 = xs[k];
    const x1 = xs[k + 1];
    const xc = (x0 + x1) / 2;
    // Side panel on the east of each cubicle, raised 150 mm off the floor.
    b.span('satin', [x1 - 0.015, 0.15, i.minZ], [x1 + 0.015, 2.0, front], panel);
    // Front pilasters and an inward-standing door, ajar.
    b.span(
      'satin',
      [x0 + (k === 0 ? 0.0 : 0.015), 0.15, front - 0.015],
      [x0 + 0.18, 2.0, front + 0.015],
      panel
    );
    b.span('satin', [x1 - 0.14, 0.15, front - 0.015], [x1 - 0.015, 2.0, front + 0.015], panel);
    b.local([x0 + 0.18, 0, front], 1.2, (l) => {
      l.span('satin', [0, 0.15, -0.012], [0.66, 1.98, 0.012], panel);
      l.span('metal', [0.58, 0.95, 0.012], [0.62, 1.0, 0.03], '#c7ccce');
      l.span('satin', [0.58, 1.06, 0.012], [0.62, 1.1, 0.02], '#2f9e55');
    });
    for (const x of [x0 + 0.1, x1 - 0.08])
      b.span('metal', [x - 0.02, F, front - 0.03], [x + 0.02, 0.15, front + 0.03], '#c7ccce');
    // Pan and cistern.
    b.span('satin', [xc - 0.2, 0.42, i.minZ], [xc + 0.2, 0.8, i.minZ + 0.16], C.porcelain);
    b.span('metal', [xc - 0.05, 0.79, i.minZ + 0.06], [xc + 0.05, 0.802, i.minZ + 0.12], '#c7ccce');
    b.span('satin', [xc - 0.16, F, i.minZ + 0.16], [xc + 0.16, 0.38, i.minZ + 0.42], C.porcelain);
    b.cylinder('satin', [xc, F, i.minZ + 0.45], 0.16, 0.13, 0.38, C.porcelain, 18);
    b.cylinder('satin', [xc, 0.38, i.minZ + 0.42], 0.19, 0.19, 0.03, '#f2f2f0', 20);
    b.layer = 'dressing';
    b.span(
      'metal',
      [x1 - 0.035, 0.73, i.minZ + 0.53],
      [x1 - 0.015, 0.77, i.minZ + 0.57],
      '#c7ccce'
    );
    b.cylinder('satin', [x1 - 0.135, 0.75, i.minZ + 0.55], 0.055, 0.055, 0.1, '#ffffff', 14, 'x');
    b.layer = 'fittings';
  }
  b.span('metal', [xs[0], 1.99, front - 0.03], [xs[3], 2.03, front + 0.01], '#c7ccce');
  // Vanity with two vessel basins, a mirror over it, a hand dryer.
  const v = T.vanity;
  b.span('satin', [v.minX, 0.82, v.minZ], [v.maxX, 0.86, v.maxZ], '#e9e6df');
  b.span('satin', [v.minX, 0.25, v.minZ], [v.maxX, 0.82, v.minZ + 0.2], '#d8d3c6');
  for (const x of [v.minX + 0.42, v.maxX - 0.42]) {
    b.cylinder('satin', [x, 0.86, (v.minZ + v.maxZ) / 2], 0.2, 0.14, 0.12, C.porcelain, 22);
    b.cylinder('metal', [x, 0.86, v.minZ + 0.06], 0.014, 0.018, 0.24, '#d7dbdd', 10);
    b.cylinder('metal', [x, 1.08, v.minZ + 0.06], 0.01, 0.01, 0.12, '#d7dbdd', 8, 'z');
  }
  b.span(
    'satin',
    [v.minX + 0.04, 1.15, i.minZ + 0.003],
    [v.maxX - 0.04, 1.95, i.minZ + 0.008],
    '#b7c3c8'
  );
  b.span('satin', [i.maxX - 0.16, 1.0, -29.95], [i.maxX, 1.32, -29.65], '#f4f4f2');
  b.span('satin', [i.maxX - 0.13, 1.0, -29.92], [i.maxX - 0.11, 1.02, -29.68], '#2b2d30');
  b.layer = 'dressing';
  b.span(
    'satin',
    [v.minX + 0.05, 0.86, v.minZ + 0.04],
    [v.minX + 0.12, 1.0, v.minZ + 0.11],
    '#f4f4f2'
  );
  plant(b, [v.maxX - 0.08, 0.86, v.minZ + 0.12], 0.35, 4);
  b.layer = 'shell';
  b.cylinder('lamp', [-23.4, FACILITY_CEILING - 0.01, -29.3], 0.09, 0.09, 0.008, '#fff1d8', 18);
  b.cylinder('lamp', [-21.3, FACILITY_CEILING - 0.01, -30.4], 0.09, 0.09, 0.008, '#fff1d8', 18);
  b.span(
    'satin',
    [-24.0, FACILITY_CEILING - 0.01, -29.25],
    [-23.8, FACILITY_CEILING, -29.05],
    '#9aa0a3'
  );
}

function buildAccessibleWc(b: FacilityBuilder) {
  b.glow = 1;
  const A = ACCESSIBLE_WC;
  const i = A.interior;
  const F = FACILITY_FLOOR_TOP;
  const rail = (from: V3, to: V3) => {
    const len = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
    const axis =
      Math.abs(to[1] - from[1]) > 0.01 ? 'y' : Math.abs(to[0] - from[0]) > 0.01 ? 'x' : 'z';
    const base: V3 = [Math.min(from[0], to[0]), Math.min(from[1], to[1]), Math.min(from[2], to[2])];
    if (axis === 'y') b.cylinder('satin', base, 0.016, 0.016, len, C.navy, 10);
    else if (axis === 'x')
      b.cylinder('satin', [base[0], base[1], base[2]], 0.016, 0.016, len, C.navy, 10, 'x');
    else b.cylinder('satin', [base[0], base[1], base[2]], 0.016, 0.016, len, C.navy, 10, 'z');
  };
  b.layer = 'fittings';
  // Pan: 450 mm from the east wall, front 750 mm from the back wall, seat 480 mm.
  const px = A.panCentreX;
  const hw = A.panHalfWidth;
  b.span('satin', [px - 0.2, 0.48, i.minZ], [px + 0.2, 0.86, i.minZ + 0.18], C.porcelain);
  b.span(
    'satin',
    [px - 0.17, F, i.minZ + 0.18],
    [px + 0.17, 0.44, A.panFrontZ - 0.18],
    C.porcelain
  );
  b.cylinder('satin', [px, F, A.panFrontZ - 0.18], hw, 0.15, 0.43, C.porcelain, 20);
  b.cylinder('satin', [px, 0.445, A.panFrontZ - 0.2], hw + 0.01, hw + 0.01, 0.035, '#f2f2f0', 20);
  // Back rest and the flush lever on the transfer side.
  b.span('satin', [px - 0.18, 0.9, i.minZ], [px + 0.18, 1.1, i.minZ + 0.07], C.navy);
  b.span('metal', [px - 0.26, 0.78, i.minZ + 0.08], [px - 0.2, 0.8, i.minZ + 0.18], '#c7ccce');
  // Grab rails, in navy against white tile.
  const ex = i.maxX - 0.06;
  rail([ex, 0.68, i.minZ + 0.2], [ex, 0.68, A.panFrontZ + 0.15]);
  b.span('satin', [i.maxX - 0.06, 0.66, i.minZ + 0.2], [i.maxX, 0.7, i.minZ + 0.24], C.navy);
  b.span(
    'satin',
    [i.maxX - 0.06, 0.66, A.panFrontZ + 0.11],
    [i.maxX, 0.7, A.panFrontZ + 0.15],
    C.navy
  );
  rail([ex, 0.8, -30.62], [ex, 1.4, -30.62]);
  rail([ex, 0.8, -29.92], [ex, 1.4, -29.92]);
  // Drop-down rail on the transfer side, its hinge plate on the back wall.
  rail([A.dropRailX, 0.68, i.minZ + 0.08], [A.dropRailX, 0.68, A.panFrontZ + 0.05]);
  b.span(
    'satin',
    [A.dropRailX - 0.05, 0.6, i.minZ],
    [A.dropRailX + 0.05, 0.78, i.minZ + 0.08],
    C.navy
  );
  // Lowered basin, open below for knee space, with a lever mixer.
  const ba = A.basin;
  b.span(
    'satin',
    [ba.minX, A.basinRim - 0.14, ba.minZ],
    [ba.maxX, A.basinRim, ba.maxZ],
    C.porcelain
  );
  b.span(
    'satin',
    [ba.minX + 0.04, A.basinRim - 0.002, ba.minZ + 0.05],
    [ba.maxX - 0.08, A.basinRim + 0.001, ba.maxZ - 0.05],
    '#e6e9ea'
  );
  b.cylinder(
    'metal',
    [ba.maxX - 0.05, A.basinRim, (ba.minZ + ba.maxZ) / 2],
    0.015,
    0.018,
    0.16,
    '#d7dbdd',
    10
  );
  b.span(
    'metal',
    [ba.maxX - 0.2, A.basinRim + 0.15, (ba.minZ + ba.maxZ) / 2 - 0.01],
    [ba.maxX - 0.05, A.basinRim + 0.17, (ba.minZ + ba.maxZ) / 2 + 0.01],
    '#d7dbdd'
  );
  // Mirror low enough to use seated.
  b.span('satin', [i.maxX - 0.006, 0.9, -30.55], [i.maxX - 0.002, 1.9, -30.0], '#b7c3c8');
  // Emergency pull cord to the floor, two red bangles, pull switch at the ceiling.
  const cord = A.pullCord;
  b.span(
    'satin',
    [cord.x - 0.04, FACILITY_CEILING - 0.03, cord.z - 0.04],
    [cord.x + 0.04, FACILITY_CEILING, cord.z + 0.04],
    '#f4f4f2'
  );
  b.cylinder('satin', [cord.x, 0.06, cord.z], 0.004, 0.004, FACILITY_CEILING - 0.09, C.red, 6);
  for (const y of cord.bangles)
    b.cylinder('satin', [cord.x, y, cord.z], 0.028, 0.028, 0.014, C.red, 16);
  // Alarm reset beside the door and a door-closing rail on the north wall.
  b.span('satin', [-18.66, 1.0, i.maxZ - 0.02], [-18.56, 1.1, i.maxZ], C.red);
  rail([-18.85, 0.9, i.maxZ - 0.06], [-18.25, 0.9, i.maxZ - 0.06]);
  b.layer = 'dressing';
  // Soap, towels, coat hooks at two heights, a sanitary bin outside the turning circle.
  b.span('satin', [i.maxX - 0.08, 1.0, -29.75], [i.maxX, 1.16, -29.62], '#f4f4f2');
  b.span('satin', [i.maxX - 0.1, 0.9, -29.55], [i.maxX, 1.25, -29.25], '#f4f4f2');
  for (const y of [1.05, 1.4])
    b.span('metal', [i.minX, y, -30.9], [i.minX + 0.06, y + 0.02, -30.88], '#c7ccce');
  b.cylinder('satin', [i.minX + 0.16, F, i.minZ + 0.15], 0.11, 0.1, 0.4, '#d8d3c6', 14);
  b.layer = 'shell';
  b.cylinder('lamp', [-18.9, FACILITY_CEILING - 0.01, -29.9], 0.1, 0.1, 0.008, '#fff1d8', 18);
  // Outside: the alarm indicator lamp over the door (a red lens, lit only in use).
  b.glow = 0;
  b.span('satin', [-19.65, 2.3, -28.6 + H], [-19.35, 2.42, -28.6 + H + 0.05], '#f4f4f2');
  b.cylinder('satin', [-19.5, 2.36, -28.6 + H + 0.05], 0.045, 0.045, 0.04, '#a8211b', 16, 'z');
}

function buildManagerOffice(b: FacilityBuilder) {
  b.glow = 1;
  const M = MANAGER_OFFICE;
  const i = M.interior;
  const F = FACILITY_FLOOR_TOP;
  const d = M.desk;
  b.layer = 'fittings';
  // Desk: oak top on dark steel frames, a modesty panel to the window side, a drawer pedestal.
  b.span(
    'oak',
    [d.x - d.halfX, d.top - 0.035, d.z - d.halfZ],
    [d.x + d.halfX, d.top, d.z + d.halfZ],
    C.oak
  );
  for (const sx of [-1, 1]) {
    const x = d.x + sx * (d.halfX - 0.06);
    b.span(
      'satin',
      [x - 0.025, F, d.z - d.halfZ + 0.05],
      [x + 0.025, d.top - 0.035, d.z - d.halfZ + 0.1],
      C.darkSteel
    );
    b.span(
      'satin',
      [x - 0.025, F, d.z + d.halfZ - 0.1],
      [x + 0.025, d.top - 0.035, d.z + d.halfZ - 0.05],
      C.darkSteel
    );
    b.span(
      'satin',
      [x - 0.025, F, d.z - d.halfZ + 0.05],
      [x + 0.025, 0.06, d.z + d.halfZ - 0.05],
      C.darkSteel
    );
  }
  b.span(
    'satin',
    [d.x - d.halfX + 0.1, 0.3, d.z + d.halfZ - 0.06],
    [d.x + d.halfX - 0.1, d.top - 0.04, d.z + d.halfZ - 0.04],
    '#3f4a4c'
  );
  b.span('satin', [d.x + 0.25, 0.06, d.z - 0.3], [d.x + 0.7, d.top - 0.04, d.z + 0.3], '#d8d3c6');
  for (const y of [0.25, 0.45, 0.6])
    b.span('metal', [d.x + 0.4, y, d.z - 0.302], [d.x + 0.55, y + 0.015, d.z - 0.32], '#c7ccce');
  // Desk chair, facing the window.
  b.local([M.chair.x, 0, M.chair.z], 0, (l) => {
    for (let k = 0; k < 5; k++)
      l.box(
        'satin',
        [Math.sin((k / 5) * Math.PI * 2) * 0.17, 0.05, Math.cos((k / 5) * Math.PI * 2) * 0.17],
        [0.04, 0.03, 0.34],
        '#2b2d30',
        (k / 5) * Math.PI * 2
      );
    l.cylinder('metal', [0, 0.06, 0], 0.025, 0.025, 0.38, '#9aa0a3', 10);
    l.span('fabric', [-0.25, 0.44, -0.24], [0.25, 0.52, 0.24], '#3d4b56');
    l.span('fabric', [-0.23, 0.58, -0.3], [0.23, 1.08, -0.24], '#2f3a44');
    for (const sx of [-1, 1])
      l.span('satin', [sx * 0.27 - 0.025, 0.52, -0.15], [sx * 0.27 + 0.025, 0.68, 0.12], '#2b2d30');
  });
  // Visitor chairs between the desk and the window.
  FACILITY_SEATS.filter((s) => s.id.startsWith('manager-visitor')).forEach((s, k) =>
    b.local(s.position, s.rotation, (l) => diningChair(l, k ? '#3f7f7a' : '#4f6d8c'))
  );
  // Bookcases of binders on the south wall, a low credenza between them.
  for (const s of M.shelves) {
    const z0 = i.minZ;
    const z1 = i.minZ + M.shelfDepth;
    b.span('oak', [s.minX, F, z0], [s.minX + 0.02, 2.0, z1], C.oak);
    b.span('oak', [s.maxX - 0.02, F, z0], [s.maxX, 2.0, z1], C.oak);
    b.span('oak', [s.minX + 0.02, F, z0], [s.maxX - 0.02, 2.0, z0 + 0.012], '#e8d9bf');
    for (const y of [F, 0.42, 0.82, 1.22, 1.62, 1.98])
      b.span('oak', [s.minX + 0.02, y, z0 + 0.012], [s.maxX - 0.02, y + 0.02, z1], C.oak);
  }
  b.span('oak', [12.1, F, i.minZ], [14.2, 0.75, i.minZ + 0.45], C.oak);
  for (let k = 0; k < 3; k++)
    b.span(
      'oak',
      [12.12 + k * 0.693, 0.08, i.minZ + 0.45],
      [12.11 + (k + 1) * 0.693, 0.73, i.minZ + 0.462],
      '#d4b088'
    );
  // Filing cabinet.
  const fl = M.filing;
  b.span('satin', [fl.minX, F, fl.minZ], [fl.maxX, 1.32, fl.maxZ - 0.02], '#8a9a8e');
  for (let k = 0; k < 4; k++) {
    const y0 = 0.04 + k * 0.32;
    b.span(
      'satin',
      [fl.minX + 0.01, y0, fl.maxZ - 0.02],
      [fl.maxX - 0.01, y0 + 0.3, fl.maxZ],
      '#95a699'
    );
    b.span(
      'metal',
      [(fl.minX + fl.maxX) / 2 - 0.07, y0 + 0.22, fl.maxZ],
      [(fl.minX + fl.maxX) / 2 + 0.07, y0 + 0.24, fl.maxZ + 0.02],
      '#c7ccce'
    );
  }
  // Whiteboard with the week's production chart, on the east wall.
  const wb = M.whiteboard;
  const wx = i.maxX;
  b.span(
    'metal',
    [wx - 0.025, wb.bottom - 0.03, wb.minZ - 0.03],
    [wx, wb.top + 0.03, wb.maxZ + 0.03],
    '#b9bfc2'
  );
  b.quad(
    'print',
    [wx - 0.028, (wb.bottom + wb.top) / 2, (wb.minZ + wb.maxZ) / 2],
    wb.maxZ - wb.minZ,
    wb.top - wb.bottom,
    '-x',
    '#ffffff',
    'whiteboard'
  );
  b.span(
    'metal',
    [wx - 0.08, wb.bottom - 0.05, wb.minZ + 0.3],
    [wx - 0.025, wb.bottom - 0.03, wb.maxZ - 0.3],
    '#b9bfc2'
  );
  b.layer = 'dressing';
  for (const [k, col] of ['#2350a0', '#c83a32', '#2b8a4a', '#2b2d30'].entries())
    b.cylinder(
      'satin',
      [wx - 0.055, wb.bottom - 0.03, wb.minZ + 0.4 + k * 0.14],
      0.009,
      0.009,
      0.12,
      col,
      8,
      'z'
    );
  // Binders on every shelf.
  const binderColours = [
    '#1f3e6e',
    '#b5352b',
    '#2f7a4a',
    '#e2b12f',
    '#2b2d30',
    '#2f5d8a',
    '#7a4a8a',
  ];
  let n = 0;
  for (const s of M.shelves)
    for (const y of [F + 0.02, 0.44, 0.84, 1.24]) {
      let x = s.minX + 0.04;
      while (x < s.maxX - 0.1) {
        const w = 0.065;
        const h = 0.3 - (n % 4 === 3 ? 0.04 : 0);
        b.span(
          'satin',
          [x, y, i.minZ + 0.05],
          [x + w, y + h, i.minZ + 0.33],
          binderColours[n % binderColours.length]
        );
        b.quad(
          'print',
          [x + w / 2, y + h * 0.62, i.minZ + 0.333],
          0.045,
          0.06,
          '+z',
          '#ffffff',
          'binderLabel'
        );
        x += w + 0.006;
        n++;
        if (n % 9 === 0) x += 0.06;
      }
    }
  for (const s of M.shelves) {
    plant(b, [(s.minX + s.maxX) / 2, 1.64, i.minZ + 0.18], 0.45, 7);
    b.span(
      'satin',
      [s.minX + 0.05, 2.0, i.minZ + 0.03],
      [s.minX + 0.4, 2.2, i.minZ + 0.33],
      '#b4997a'
    );
  }
  // On the desk: monitor, keyboard, mouse, the coffee mug, papers, a lamp, a phone.
  const top = d.top;
  b.span('satin', [d.x - 0.1, top, d.z + 0.12], [d.x + 0.1, top + 0.012, d.z + 0.3], '#2b2d30');
  b.span(
    'satin',
    [d.x - 0.02, top + 0.012, d.z + 0.22],
    [d.x + 0.02, top + 0.22, d.z + 0.25],
    '#2b2d30'
  );
  b.span(
    'satin',
    [d.x - 0.31, top + 0.18, d.z + 0.2],
    [d.x + 0.31, top + 0.54, d.z + 0.235],
    '#1d2023'
  );
  b.quad('screen', [d.x, top + 0.36, d.z + 0.197], 0.58, 0.33, '-z', '#ffffff', 'monitor');
  b.span('satin', [d.x - 0.22, top, d.z - 0.22], [d.x + 0.22, top + 0.018, d.z - 0.08], '#3a3f43');
  b.span('satin', [d.x + 0.3, top, d.z - 0.18], [d.x + 0.36, top + 0.02, d.z - 0.1], '#3a3f43');
  b.cylinder('satin', [d.x + 0.5, top, d.z - 0.12], 0.045, 0.042, 0.1, '#f4efe4', 16);
  b.cylinder('satin', [d.x + 0.5, top + 0.03, d.z - 0.12], 0.046, 0.046, 0.02, '#2f5d5a', 16);
  b.cylinder('satin', [d.x + 0.5, top + 0.088, d.z - 0.12], 0.04, 0.04, 0.004, '#4a2c1a', 14);
  b.box('satin', [d.x + 0.553, top + 0.055, d.z - 0.12], [0.014, 0.055, 0.012], '#f4efe4');
  b.span('satin', [d.x - 0.72, top, d.z - 0.25], [d.x - 0.5, top + 0.03, d.z - 0.0], '#f8f6ef');
  b.span(
    'satin',
    [d.x - 0.7, top + 0.03, d.z - 0.23],
    [d.x - 0.49, top + 0.034, d.z + 0.01],
    '#fbf3c8'
  );
  b.cylinder('satin', [d.x - 0.7, top, d.z + 0.26], 0.07, 0.08, 0.02, '#2b2d30', 16);
  b.box('satin', [d.x - 0.7, top + 0.2, d.z + 0.2], [0.02, 0.4, 0.02], '#2b2d30', 0, -0.35);
  b.box('satin', [d.x - 0.7, top + 0.42, d.z + 0.02], [0.02, 0.02, 0.32], '#2b2d30', 0, 0.35);
  b.cylinder('satin', [d.x - 0.7, top + 0.32, d.z - 0.15], 0.03, 0.08, 0.1, '#2f5d5a', 14);
  b.quad('lamp', [d.x - 0.7, top + 0.322, d.z - 0.15], 0.12, 0.12, '-y', '#ffd9a0');
  b.span('satin', [d.x + 0.55, top, d.z + 0.1], [d.x + 0.75, top + 0.06, d.z + 0.3], '#2b2d30');
  plant(b, [d.x - 0.5, top, d.z + 0.28], 0.25, 8);
  framedPrint(b, [d.x + 0.35, top + 0.1, d.z + 0.3], '-z', 0.12, 0.09, 'photoSilos');
  // On the walls: a photograph of the roller hall and the mill plan over the credenza, a calendar.
  framedPrint(b, [12.62, 1.6, i.minZ], '+z', 0.56, 0.42, 'photoRollerHall');
  framedPrint(b, [13.68, 1.6, i.minZ], '+z', 0.56, 0.42, 'millPlan', '#2b2d30');
  b.quad('print', [i.minX + 0.004, 1.55, -29.5], 0.3, 0.3, '+x', '#ffffff', 'calendar');
  plant(b, [i.minX + 0.36, F, i.maxZ - 0.36], 1.15, 2, true);
  plant(b, [(fl.minX + fl.maxX) / 2, 1.32, (fl.minZ + fl.maxZ) / 2], 0.4, 6);
  b.cylinder('satin', [d.x + 0.5, F, d.z + 0.05], 0.13, 0.11, 0.3, '#5d6b72', 14);
  b.layer = 'shell';
  panelLight(b, 12.3, -31.3);
  panelLight(b, 14.7, -32.6);
}

function buildMeetingRoom(b: FacilityBuilder) {
  b.glow = 1;
  const M = MEETING_ROOM;
  const i = M.interior;
  const F = FACILITY_FLOOR_TOP;
  const t = M.table;
  b.layer = 'fittings';
  b.span(
    'oak',
    [t.x - t.halfX, t.top - 0.04, t.z - t.halfZ],
    [t.x + t.halfX, t.top, t.z + t.halfZ],
    C.oak
  );
  for (const sz of [-1, 1]) {
    const z = t.z + sz * (t.halfZ - 0.3);
    b.span('oak', [t.x - 0.04, F, z - 0.3], [t.x + 0.04, t.top - 0.04, z + 0.3], C.oak);
    b.span('oak', [t.x - 0.35, F, z - 0.04], [t.x + 0.35, 0.05, z + 0.04], C.oak);
  }
  FACILITY_SEATS.filter((s) => s.room === 'meeting-room').forEach((s, k) =>
    b.local(s.position, s.rotation, (l) =>
      diningChair(l, SEAT_SHELLS[(k + 2) % SEAT_SHELLS.length])
    )
  );
  const sb = M.sideboard;
  b.span('oak', [sb.minX, 0.06, sb.minZ], [sb.maxX, 0.8, sb.maxZ], C.oak);
  b.span(
    'satin',
    [sb.minX + 0.04, F, sb.minZ + 0.04],
    [sb.maxX - 0.04, 0.06, sb.maxZ - 0.04],
    '#2b2d30'
  );
  for (let k = 0; k < 4; k++)
    b.span(
      'oak',
      [sb.minX + 0.01 + k * 0.6, 0.09, sb.maxZ],
      [sb.minX + (k + 1) * 0.6 - 0.01, 0.77, sb.maxZ + 0.012],
      '#d4b088'
    );
  // Screen on the south wall over the sideboard.
  b.span('satin', [t.x - 0.68, 1.15, i.minZ], [t.x + 0.68, 1.93, i.minZ + 0.045], '#1d2023');
  b.quad('screen', [t.x, 1.54, i.minZ + 0.048], 1.3, 0.73, '+z', '#ffffff', 'tv');
  b.layer = 'dressing';
  framedPrint(b, [i.maxX, 1.55, -33.3], '-x', 0.48, 0.36, 'photoSilos');
  framedPrint(b, [i.maxX, 1.55, -32.3], '-x', 0.48, 0.36, 'photoWaterMill');
  framedPrint(b, [i.maxX, 1.55, -31.3], '-x', 0.48, 0.36, 'photoWagons');
  b.cylinder('satin', [i.minX + 0.03, 2.2, t.z], 0.15, 0.15, 0.03, '#2c3b35', 28, 'x');
  b.quad('print', [i.minX + 0.063, 2.2, t.z], 0.26, 0.26, '+x', '#ffffff', 'clock');
  b.cylinder('glass', [18.4, 0.8, sb.minZ + 0.22], 0.06, 0.07, 0.22, '#d9eef2', 14);
  for (let k = 0; k < 4; k++)
    b.cylinder('glass', [18.65 + k * 0.1, 0.8, sb.minZ + 0.25], 0.03, 0.028, 0.09, '#e6f2f4', 10);
  plant(b, [19.9, 0.8, sb.minZ + 0.22], 0.45, 9);
  plant(b, [i.minX + 0.3, F, i.minZ + 0.3], 1.0, 4, true);
  b.span('satin', [t.x - 0.2, t.top, t.z - 0.1], [t.x + 0.2, t.top + 0.012, t.z + 0.15], '#f8f6ef');
  b.cylinder('satin', [t.x + 0.15, t.top, t.z + 0.55], 0.06, 0.06, 0.03, '#2b2d30', 16);
  b.layer = 'shell';
  panelLight(b, 19.0, -32.6);
  panelLight(b, 19.0, -30.4);
}

function buildFirstAid(b: FacilityBuilder) {
  b.glow = 1;
  const R = FIRST_AID_ROOM;
  const i = R.interior;
  const F = FACILITY_FLOOR_TOP;
  b.layer = 'fittings';
  // Treatment couch, curtain rail and curtain drawn back.
  const c = R.couch;
  for (const x of [c.minX + 0.06, c.maxX - 0.06])
    for (const z of [c.minZ + 0.06, c.maxZ - 0.06])
      b.span('satin', [x - 0.02, F, z - 0.02], [x + 0.02, 0.5, z + 0.02], '#d8dcdc');
  b.span('satin', [c.minX, 0.5, c.minZ], [c.maxX, 0.54, c.maxZ], '#d8dcdc');
  b.span(
    'fabric',
    [c.minX + 0.02, 0.54, c.minZ + 0.02],
    [c.maxX - 0.02, 0.62, c.maxZ - 0.02],
    '#3d7f8c'
  );
  b.span(
    'fabric',
    [c.minX + 0.12, 0.62, c.maxZ - 0.38],
    [c.maxX - 0.12, 0.7, c.maxZ - 0.1],
    '#f4f4f2'
  );
  b.span(
    'satin',
    [c.minX + 0.06, 0.621, c.minZ + 0.1],
    [c.maxX - 0.06, 0.623, c.maxZ - 0.42],
    '#f8f8f6'
  );
  // Clinical sink unit with an elbow lever tap and dispensers.
  const s = R.sinkUnit;
  b.span('satin', [s.minX, F, s.minZ], [s.maxX, 0.86, s.maxZ], '#f2f2f0');
  b.span('satin', [s.minX, 0.86, s.minZ], [s.maxX, 0.9, s.maxZ + 0.02], '#e9e6df');
  b.span(
    'metal',
    [s.minX + 0.2, 0.75, s.minZ + 0.08],
    [s.maxX - 0.2, 0.902, s.maxZ - 0.08],
    '#c7ccce'
  );
  const tapX = (s.minX + s.maxX) / 2;
  b.cylinder('metal', [tapX, 0.9, s.minZ + 0.05], 0.016, 0.02, 0.26, '#d7dbdd', 10);
  b.cylinder('metal', [tapX, 1.14, s.minZ + 0.05], 0.012, 0.012, 0.16, '#d7dbdd', 8, 'z');
  b.box('metal', [tapX + 0.07, 1.0, s.minZ + 0.07], [0.16, 0.018, 0.018], '#d7dbdd', 0, 0, 0.5);
  b.span('satin', [s.minX + 0.05, 1.25, i.minZ], [s.minX + 0.3, 1.55, i.minZ + 0.1], '#f4f4f2');
  b.span('satin', [s.maxX - 0.25, 1.2, i.minZ], [s.maxX - 0.05, 1.42, i.minZ + 0.1], '#f4f4f2');
  b.local([R.chair.x, 0, R.chair.z], Math.PI / 2, (l) => diningChair(l, '#3d7f8c'));
  // First-aid cabinet on the west wall.
  b.span('satin', [i.minX, 1.2, -32.0], [i.minX + 0.16, 1.8, -31.2], '#f6f6f4');
  b.quad('print', [i.minX + 0.163, 1.5, -31.6], 0.3, 0.3, '+x', '#ffffff', 'signFirstAid');
  b.layer = 'dressing';
  b.quad('print', [i.minX + 0.004, 1.45, -33.4], 0.38, 0.57, '+x', '#ffffff', 'firstAidPoster');
  // Eyewash station and a yellow clinical-waste bin.
  b.span('satin', [i.minX, 1.15, -30.45], [i.minX + 0.1, 1.55, -30.05], '#2f9e55');
  for (const z of [-30.35, -30.15])
    b.cylinder('satin', [i.minX + 0.06, 1.2, z], 0.035, 0.035, 0.2, '#e6f2f4', 12);
  b.cylinder('satin', [23.15, F, i.minZ + 0.2], 0.14, 0.13, 0.42, '#e8c33c', 16);
  b.span(
    'fabric',
    [c.minX + 0.08, 0.62, c.minZ + 0.06],
    [c.maxX - 0.08, 0.68, c.minZ + 0.5],
    '#b03a2e'
  );
  plant(b, [i.minX + 0.3, F, i.maxZ - 0.45], 0.7, 6, true);
  framedPrint(b, [i.maxX, 1.45, (c.minZ + c.maxZ) / 2], '-x', 0.48, 0.36, 'photoWaterMill');
  b.layer = 'shell';
  panelLight(b, 23.2, -31.6);
}

/** On the hall side: door signs, pictograms, lamps over the doors, planters, the AED. */
function buildFrontage(b: FacilityBuilder) {
  b.glow = 0;
  const face = -28.6 + H;
  b.layer = 'fittings';
  const pictos: [number, AtlasRegion][] = [
    [-22.55, 'signToilets'],
    [-18.6, 'signAccessible'],
    [-17.45 + 0.02, 'signStaffRoom'],
    [23.0, 'signFirstAid'],
  ];
  for (const [x, region] of pictos) {
    b.span('satin', [x - 0.13, 1.42, face], [x + 0.13, 1.68, face + 0.012], '#f4f1ea');
    b.quad('print', [x, 1.55, face + 0.015], 0.22, 0.22, '+z', '#ffffff', region);
  }
  // Text boards over the doors (the lettering is drawn by StaffFacilities).
  for (const sign of FACILITY_SIGNS) {
    b.span(
      'satin',
      [sign.x - sign.width / 2, sign.y - 0.13, face],
      [sign.x + sign.width / 2, sign.y + 0.13, face + 0.025],
      C.signBoard
    );
    b.span(
      'metal',
      [sign.x - sign.width / 2 + 0.03, sign.y - 0.1, face + 0.025],
      [sign.x + sign.width / 2 - 0.03, sign.y - 0.095, face + 0.028],
      '#b08d57'
    );
  }
  // Bulkhead lamps over each outer door.
  for (const d of FACILITY_DOORS.filter((door) => door.wall.outer)) {
    const x = (d.from + d.to) / 2;
    b.span('satin', [x - 0.12, 2.62, face], [x + 0.12, 2.78, face + 0.08], '#2f3a3c');
    b.quad('lamp', [x, 2.7, face + 0.083], 0.18, 0.1, '+z', '#ffe1b0');
  }
  // AED cabinet between the meeting-room and first-aid doors, its sign above.
  b.span('satin', [21.2, 1.0, face], [21.6, 1.5, face + 0.14], '#2f9e55');
  b.span('glass', [21.24, 1.04, face + 0.14], [21.56, 1.46, face + 0.146], '#ffffff');
  b.span('satin', [21.28, 1.1, face + 0.03], [21.52, 1.38, face + 0.12], '#f2c94c');
  b.span('satin', [21.27, 1.62, face], [21.53, 1.88, face + 0.012], '#f4f1ea');
  b.quad('print', [21.4, 1.75, face + 0.015], 0.22, 0.22, '+z', '#ffffff', 'signAed');
  // Timber planters along the frontages, full of flowers.
  b.layer = 'fittings';
  for (const [k, p] of FACILITY_PLANTERS.entries()) {
    b.span('oak', [p.minX, 0, p.minZ], [p.maxX, 0.55, p.maxZ], C.oak);
    b.span(
      'fabric',
      [p.minX + 0.04, 0.5, p.minZ + 0.04],
      [p.maxX - 0.04, 0.53, p.maxZ - 0.04],
      C.soil
    );
    b.layer = 'dressing';
    const n = Math.round((p.maxX - p.minX) / 0.3);
    for (let j = 0; j < n; j++) {
      const x = p.minX + 0.15 + j * ((p.maxX - p.minX - 0.3) / Math.max(1, n - 1));
      const z = (p.minZ + p.maxZ) / 2 + (j % 2 ? 0.06 : -0.06);
      b.blob(
        'foliage',
        [x, 0.66, z],
        [0.17, 0.14, 0.15],
        [C.leaf, C.leafLight, C.leafDark][(j + k) % 3]
      );
      for (let f = 0; f < 3; f++) {
        const a = j * 1.7 + f * 2.1;
        b.blob(
          'foliage',
          [x + Math.cos(a) * 0.1, 0.77 + (f % 2) * 0.03, z + Math.sin(a) * 0.08],
          [0.035, 0.03, 0.035],
          ['#e86f8a', '#f4d35e', '#f4f0e6', '#b07cc6'][(j + f + k) % 4]
        );
      }
    }
    b.layer = 'fittings';
  }
}

/** Lettered boards over the doors, on the hall side (painted signage: never translated). */
export const FACILITY_SIGNS: readonly {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
}[] = [
  { id: 'toilets', text: 'TOILETS', x: -21.65, y: 2.36, width: 1.1 },
  { id: 'accessible-wc', text: 'ACCESSIBLE WC', x: -19.5, y: 2.6, width: 1.3 },
  { id: 'staff-room', text: 'STAFF ROOM', x: -16.6, y: 2.36, width: 1.25 },
  { id: 'manager-office', text: 'MILL MANAGER', x: 15.65, y: 2.36, width: 1.4 },
  { id: 'meeting-room', text: 'MEETING ROOM', x: 20.5, y: 2.36, width: 1.4 },
  { id: 'first-aid', text: 'FIRST AID', x: 22.3, y: 2.36, width: 1.1 },
];

/** The face the sign boards stand on, plus their depth (for the lettering). */
export const FACILITY_SIGN_FACE_Z = -28.6 + H + 0.026;

export interface FacilityGeometrySet {
  /** `${layer}:${material}` -> merged geometry. */
  readonly merged: ReadonlyMap<string, THREE.BufferGeometry>;
}

let cached: FacilityGeometrySet | null = null;

/** Build (once) and return the merged geometry for both blocks. */
export function getFacilityGeometry(): FacilityGeometrySet {
  if (cached) return cached;
  const b = new FacilityBuilder();
  buildWalls(b);
  buildRoomFinishes(b);
  buildRoofs(b);
  buildStaffRoom(b);
  buildLockers(b);
  buildToilets(b);
  buildAccessibleWc(b);
  buildManagerOffice(b);
  buildMeetingRoom(b);
  buildFirstAid(b);
  buildFrontage(b);
  const merged = new Map<string, THREE.BufferGeometry>();
  for (const [id, list] of b.parts) {
    const g = mergeGeometries(list, false);
    for (const part of list) part.dispose();
    if (!g) continue;
    g.computeBoundingBox();
    g.computeBoundingSphere();
    merged.set(id, g);
  }
  cached = { merged };
  return cached;
}

/** Raw parts before merging, for tests that need per-part boxes. */
export function buildFacilityParts(): Map<string, THREE.BufferGeometry[]> {
  const b = new FacilityBuilder();
  buildWalls(b);
  buildRoomFinishes(b);
  buildRoofs(b);
  buildStaffRoom(b);
  buildLockers(b);
  buildToilets(b);
  buildAccessibleWc(b);
  buildManagerOffice(b);
  buildMeetingRoom(b);
  buildFirstAid(b);
  buildFrontage(b);
  return b.parts;
}
