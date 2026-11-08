import { describe, expect, it } from 'vitest';
import {
  AMBER_MARKERS,
  CAB_DETAILS,
  CONSPICUITY_TAPE,
  RED_MARKERS,
  TRAILER_ACCENT_BANDS,
  TRAILER_CORNER_POSTS,
  TRAILER_DOOR_HARDWARE,
  TRAILER_DOOR_LEAVES,
  TRAILER_FRAME_DETAILS,
  TRAILER_IDENTITY_PANEL,
  TRAILER_LAMP_BEZELS,
  TRAILER_MUDFLAP_HANGERS,
  TRAILER_MUDFLAPS,
  TRAILER_REAR_DOOR,
  TRAILER_REAR_LAMPS,
  TRAILER_ROOF_CAP,
  TRAILER_SKIN_DETAILS,
  TRAILER_TOP_RAILS,
  TRAILER_UNDERFRAME,
  TRUCK_CAB_PARTS,
  TRUCK_CAB_SHELL,
  TRUCK_CAB_SIDE_GLASS,
  TRUCK_CAB_SIDE_PANELS,
  TRUCK_CAB_WINDOW_LINERS,
  TRUCK_CHASSIS_RAILS,
  TRUCK_CROSSMEMBER,
  TRUCK_GRILLE_BAR_PARTS,
  TRUCK_GRILLE_PLATE,
  TRUCK_GRILLE_POSTS,
  TRUCK_HEADLAMPS,
  type DetailInstance,
} from './OptimizedTruckBay';

/**
 * The yard trucks are built from scaled boxes, one mesh or instance per part,
 * so the scene's coplanar sweeps of single draw calls cannot see two parts
 * whose faces lie on one plane. Two faces facing the SAME way, flush (under
 * 1.5 mm, the bar `selfCoplanarFaces.test.ts` uses) and overlapping, fight for
 * depth: the 2026-11-07 sweep found the rear corner posts flush with the
 * under-frame, the headlamp lenses flush with the grille posts and the
 * crossmember flush with the chassis rails. Faces meeting back to back (one
 * box ending where the next begins) never show, and are not counted.
 *
 * Every axis-aligned part of the cab and trailer is listed below. Rounded
 * parts (`RoundedBoxGeometry`, radius 0.08 of a unit box) contribute only
 * their flat face centres; parts turned off the axes (bevels, deflectors, the
 * dash, the seat), lathed parts and the landing gear, whose matrices are
 * written per frame, are not listed.
 */

type Part = { name: string; min: number[]; max: number[]; rounded?: boolean };

const ROUND = 0.08;

const box = (name: string, d: DetailInstance, rounded = false): Part => ({
  name,
  min: d.position.map((p, k) => p - d.scale[k] / 2),
  max: d.position.map((p, k) => p + d.scale[k] / 2),
  rounded,
});

const boxes = (name: string, list: readonly DetailInstance[], rounded = false) =>
  list.map((d, i) => box(`${name}[${i}]`, d, rounded));

const panel = TRAILER_IDENTITY_PANEL;
const PARTS: Part[] = [
  // Trailer skin, as the authored rounded box it is (truck-trailer-unit.glb keeps its envelope).
  box('trailer skin', { position: [0, 2.45, -5.75], scale: [2.55, 4.25, 11.2] }, true),
  ...boxes('skin detail', TRAILER_SKIN_DETAILS),
  ...boxes('frame detail', TRAILER_FRAME_DETAILS),
  ...boxes('mudflap', TRAILER_MUDFLAPS, true),
  ...boxes('mudflap hanger', TRAILER_MUDFLAP_HANGERS),
  ...boxes('corner post', TRAILER_CORNER_POSTS),
  ...boxes('top rail', TRAILER_TOP_RAILS),
  ...boxes('lamp housing', TRAILER_LAMP_BEZELS),
  ...boxes('rear lamp', TRAILER_REAR_LAMPS),
  ...boxes(
    'conspicuity tape',
    CONSPICUITY_TAPE.map((strip) => strip.instance)
  ),
  ...boxes('amber marker', AMBER_MARKERS),
  ...boxes('red marker', RED_MARKERS),
  box('under-frame', TRAILER_UNDERFRAME),
  box('roof cap', TRAILER_ROOF_CAP),
  ...boxes('accent band', TRAILER_ACCENT_BANDS),
  ...[-1, 1].map((side) =>
    box(`identity panel ${side}`, {
      position: [side * panel.x, panel.y, panel.z],
      // A quarter turn about y swaps the box's x and z extents.
      scale: [panel.scale[2], panel.scale[1], panel.scale[0]],
    })
  ),
  ...boxes('door leaf', TRAILER_DOOR_LEAVES),
  ...TRAILER_DOOR_HARDWARE.map((part, i) => box(`${part.leaf} ${part.part}[${i}]`, part)),
  // Tractor.
  box('cab shell', TRUCK_CAB_SHELL, true),
  box('roof accent', TRUCK_CAB_PARTS.roofAccent, true),
  box('cab back wall', TRUCK_CAB_PARTS.backWall),
  ...boxes('cab pillar', TRUCK_CAB_PARTS.pillars),
  box('windscreen', TRUCK_CAB_PARTS.windscreen),
  box('windscreen bar', TRUCK_CAB_PARTS.windscreenBar),
  box('bumper', TRUCK_CAB_PARTS.bumper, true),
  ...boxes('mirror head', TRUCK_CAB_PARTS.mirrorHeads),
  ...boxes('tank strap', TRUCK_CAB_PARTS.tankStraps),
  ...[-1, 1].map((side) =>
    box(`side glass ${side}`, {
      position: [
        side * TRUCK_CAB_SIDE_GLASS.x,
        (TRUCK_CAB_SIDE_GLASS.y[0] + TRUCK_CAB_SIDE_GLASS.y[1]) / 2,
        (TRUCK_CAB_SIDE_GLASS.z[0] + TRUCK_CAB_SIDE_GLASS.z[1]) / 2,
      ],
      scale: [
        0.06,
        TRUCK_CAB_SIDE_GLASS.y[1] - TRUCK_CAB_SIDE_GLASS.y[0],
        TRUCK_CAB_SIDE_GLASS.z[1] - TRUCK_CAB_SIDE_GLASS.z[0],
      ],
    })
  ),
  ...boxes('cab side panel', TRUCK_CAB_SIDE_PANELS),
  ...boxes('window liner', TRUCK_CAB_WINDOW_LINERS),
  box('grille plate', TRUCK_GRILLE_PLATE),
  ...boxes('grille bar', TRUCK_GRILLE_BAR_PARTS),
  ...boxes('grille post', TRUCK_GRILLE_POSTS),
  ...boxes('headlamp', TRUCK_HEADLAMPS),
  ...boxes('cab detail', CAB_DETAILS),
  ...boxes('chassis rail', TRUCK_CHASSIS_RAILS),
  box('crossmember', TRUCK_CROSSMEMBER),
];

type Face = { part: string; axis: number; sign: -1 | 1; at: number; lo: number[]; hi: number[] };

function facesOf(part: Part): Face[] {
  const out: Face[] = [];
  for (let axis = 0; axis < 3; axis++) {
    const others = [0, 1, 2].filter((k) => k !== axis);
    // A rounded box's flat face stops `ROUND` of its unit size short of each edge.
    const inset = (k: number) => (part.rounded ? (part.max[k] - part.min[k]) * ROUND : 0);
    const lo = others.map((k) => part.min[k] + inset(k));
    const hi = others.map((k) => part.max[k] - inset(k));
    out.push({ part: part.name, axis, sign: -1, at: part.min[axis], lo, hi });
    out.push({ part: part.name, axis, sign: 1, at: part.max[axis], lo, hi });
  }
  return out;
}

const FLUSH = 0.0015;
const MIN_AREA = 1e-4;

describe('truck part faces', () => {
  it('lists every part with a real extent', () => {
    for (const part of PARTS)
      for (let k = 0; k < 3; k++)
        expect(part.max[k] - part.min[k], `${part.name} axis ${k}`).toBeGreaterThan(0);
  });

  it('puts no two parts on one plane facing the same way', () => {
    const faces = PARTS.flatMap(facesOf);
    const found: string[] = [];
    for (let i = 0; i < faces.length; i++)
      for (let j = i + 1; j < faces.length; j++) {
        const a = faces[i];
        const b = faces[j];
        if (a.part === b.part || a.axis !== b.axis || a.sign !== b.sign) continue;
        if (Math.abs(a.at - b.at) >= FLUSH) continue;
        const overlap = [0, 1].map((k) => Math.min(a.hi[k], b.hi[k]) - Math.max(a.lo[k], b.lo[k]));
        if (overlap[0] <= 0 || overlap[1] <= 0) continue;
        const area = overlap[0] * overlap[1];
        if (area < MIN_AREA) continue;
        found.push(
          `${a.part} / ${b.part}: ${'xyz'[a.axis]}${a.sign > 0 ? '+' : '-'} at ${a.at.toFixed(4)}, ${(area * 1e4).toFixed(0)} cm2`
        );
      }
    expect(found).toEqual([]);
  });
});

describe('closed trailer doors', () => {
  const [left, right] = TRAILER_DOOR_LEAVES.map((d) => box('leaf', d));
  const outerFace = TRAILER_REAR_DOOR.z - TRAILER_REAR_DOOR.depth / 2;

  it('hang each leaf from the corner post, leaving no slot at the hinge edge', () => {
    // A 2 cm slot between leaf and post showed the shaded trailer end and
    // rasterised as a broken dotted line from the yard.
    const rearPosts = TRAILER_CORNER_POSTS.map((p) => box('post', p)).filter((p) => p.min[2] < -11);
    expect(rearPosts).toHaveLength(2);
    for (const post of rearPosts) {
      const inner = post.min[0] > 0 ? post.min[0] : -post.max[0];
      expect(inner).toBeCloseTo(TRAILER_REAR_DOOR.hingeX, 6);
      expect(post.min[2]).toBeLessThan(outerFace);
    }
    expect(right.max[0]).toBeCloseTo(TRAILER_REAR_DOOR.hingeX, 6);
    expect(left.min[0]).toBeCloseTo(-TRAILER_REAR_DOOR.hingeX, 6);
  });

  it('covers the centre slot with an astragal on the right leaf, top to bottom', () => {
    const astragals = TRAILER_DOOR_HARDWARE.filter((part) => part.part === 'astragal');
    expect(astragals).toHaveLength(1);
    expect(astragals[0].leaf).toBe('right');
    const strip = box('astragal', astragals[0]);
    // At least 1 cm onto each leaf across the slot.
    expect(strip.min[0]).toBeLessThanOrEqual(left.max[0] - 0.01 + 1e-9);
    expect(strip.max[0]).toBeGreaterThanOrEqual(right.min[0] + 0.01 - 1e-9);
    // From just above the under-frame (which covers the leaves below it) to the leaf top.
    const frameTop = TRAILER_UNDERFRAME.position[1] + TRAILER_UNDERFRAME.scale[1] / 2;
    expect(strip.min[1]).toBeGreaterThan(frameTop);
    expect(strip.min[1]).toBeLessThan(frameTop + 0.05);
    expect(strip.max[1]).toBeGreaterThan(right.max[1] - 0.05);
  });

  it('seats every piece of hardware on its own leaf, standing proud of it', () => {
    const guides = TRAILER_DOOR_HARDWARE.filter((part) => part.part === 'rod-guide').map((g) =>
      box('guide', g)
    );
    for (const part of TRAILER_DOOR_HARDWARE) {
      const b = box(part.part, part);
      const leaf = part.leaf === 'left' ? left : right;
      const name = `${part.leaf} ${part.part} at ${part.position.join(',')}`;
      if (part.part === 'lock-rod') {
        // A rod stands off the leaf in guides that wrap it on every side.
        const holding = guides.filter((g) =>
          [0, 2].every((k) => g.min[k] < b.min[k] - 0.005 && g.max[k] > b.max[k] + 0.005)
        );
        expect(holding.length, name).toBeGreaterThanOrEqual(3);
      } else if (part.part === 'handle') {
        // A handle is a lever on its rod: it crosses one.
        const rods = TRAILER_DOOR_HARDWARE.filter((r) => r.part === 'lock-rod').map((r) =>
          box('rod', r)
        );
        const crossed = rods.filter((r) =>
          [0, 1, 2].every((k) => r.min[k] < b.max[k] && r.max[k] > b.min[k])
        );
        expect(crossed, name).toHaveLength(1);
      } else {
        // Touching or sunk into the leaf face, never floating off it.
        expect(b.max[2], name).toBeGreaterThanOrEqual(outerFace - 1e-9);
      }
      expect(b.min[2], name).toBeLessThan(outerFace - 0.01);
      // Within its leaf's span, bar the astragal (which overlaps the other
      // leaf) and the hinges (which wrap onto the post).
      if (part.part !== 'astragal' && part.part !== 'hinge') {
        expect(b.min[0], name).toBeGreaterThanOrEqual(leaf.min[0]);
        expect(b.max[0], name).toBeLessThanOrEqual(leaf.max[0]);
      }
      expect(b.min[1], name).toBeGreaterThanOrEqual(leaf.min[1]);
      expect(b.max[1], name).toBeLessThanOrEqual(leaf.max[1]);
    }
  });
});
