/**
 * Dressing for the maintenance bay in the service yard, in the bay's own frame
 * (`MaintenanceBay`: walls at x +/-6 and z +/-5, 6 m high; a two-slope roof
 * whose eaves run along x +/-6.22 at about y 5.8-6.1 and whose gables overhang
 * the z walls by 0.4 m). The bay is turned -pi/2, so its doors (+z) face the
 * silos and the yard camera sees the +x eave wall, the -z gable wall and the
 * roof. The rubric (final5-med-12, axis 1) read it as a plain box: there was
 * 0.22 m of eave, flush walls and nothing on them.
 *
 * - An eave extension carries the roof plane 0.55 m further out on both eave
 *   sides, finished with a fascia board, a gutter and two downpipes each.
 * - A louvred vent panel on the +x wall, clear of its window and door.
 * - A cable entry on the -z wall by the +x corner: two conduits up from a
 *   ground pad into a junction box, and a gland into the wall.
 * - Corner flashings and verge boards (final7 yard, rubric backlog 8: "still
 *   sharp-edged boxes"). A square trim strip turned 45 degrees down each
 *   vertical wall corner, so the corner reads as a bevel catching its own light
 *   between two flat walls, and a verge board along both slopes of each gable,
 *   matching the eave fascia, so the roof edge has a lit lip too.
 */

export type BayPartKind = 'roof' | 'trim' | 'steel' | 'dark' | 'concrete';

export interface BayBox {
  readonly kind: BayPartKind;
  readonly position: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
  /** Rotation about z (eave slope) or x (louvre blade), radians. */
  readonly rotation?: readonly [number, number, number];
}

export interface BayPipe {
  readonly from: readonly [number, number, number];
  readonly to: readonly [number, number, number];
  readonly radius: number;
}

/** The roof the GLB (and the fallback) carries, measured from its vertices. */
export const MAINTENANCE_BAY_SHELL = {
  wallX: 6,
  wallZ: 5,
  wallTop: 6,
  eaveX: 6.22,
  eaveTop: 6.08,
  roofSlope: 0.1,
  roofZ: 5.4,
} as const;

export const MAINTENANCE_BAY_DRESSING = {
  eave: { extension: 0.55, thickness: 0.12 },
  fascia: { thickness: 0.04, height: 0.24 },
  gutter: { width: 0.14, height: 0.11 },
  downpipe: { radius: 0.05, zs: [-5.15, 5.15] },
  louvre: { z: -3.9, y: 4.1, width: 1.1, height: 0.9, blades: 6, frame: 0.06 },
  cable: { x: 4.9, junction: { y: 2.5, width: 0.46, height: 0.56, depth: 0.2 } },
  /** Square corner flashing: side, and its top under the eave slab. */
  corner: { size: 0.16, top: 5.7 },
  /** Verge board on the gable roof edges: the fascia's section, standing 5 mm off the roof end. */
  verge: { height: 0.24, thickness: 0.04, standoff: 0.005 },
} as const;

/** Every box and pipe of the dressing, in the bay's frame. */
export function maintenanceBayDressing(): { boxes: BayBox[]; pipes: BayPipe[] } {
  const s = MAINTENANCE_BAY_SHELL;
  const d = MAINTENANCE_BAY_DRESSING;
  const boxes: BayBox[] = [];
  const pipes: BayPipe[] = [];
  const slope = Math.tan(s.roofSlope);
  const roofLength = 2 * s.roofZ;

  for (const side of [-1, 1]) {
    // The eave extension: the roof plane continued, thinner than the roof slab.
    const run = d.eave.extension;
    const midX = s.eaveX + run / 2;
    const topAtMid = s.eaveTop - slope * (run / 2);
    boxes.push({
      kind: 'roof',
      position: [side * midX, topAtMid - (d.eave.thickness / 2) * Math.cos(s.roofSlope), 0],
      scale: [run / Math.cos(s.roofSlope) + 0.02, d.eave.thickness, roofLength],
      rotation: [0, 0, -side * s.roofSlope],
    });
    // Fascia board across the eave's end, and the gutter hung on it.
    const endX = s.eaveX + run;
    const endTop = s.eaveTop - slope * run;
    boxes.push({
      kind: 'trim',
      position: [side * (endX + d.fascia.thickness / 2), endTop + 0.01 - d.fascia.height / 2, 0],
      scale: [d.fascia.thickness, d.fascia.height, roofLength + 0.04],
    });
    const gutterX = endX + d.fascia.thickness + d.gutter.width / 2;
    const gutterY = endTop - d.fascia.height + d.gutter.height / 2 + 0.02;
    boxes.push({
      kind: 'steel',
      position: [side * gutterX, gutterY, 0],
      scale: [d.gutter.width, d.gutter.height, roofLength + 0.06],
    });
    // Downpipes from the gutter to the ground, standing off the wall.
    for (const z of d.downpipe.zs) {
      pipes.push({
        from: [side * gutterX, gutterY - d.gutter.height / 2, z],
        to: [side * gutterX, 0.6, z],
        radius: d.downpipe.radius,
      });
      // The shoe kicks back toward the wall's foot and out over the apron.
      pipes.push({
        from: [side * gutterX, 0.6, z],
        to: [side * (gutterX + 0.2), 0.08, z],
        radius: d.downpipe.radius,
      });
    }
  }

  // Corner flashings: one per vertical wall corner, turned 45 degrees about y
  // so a diagonal face caps the arris and two faces stand off the walls.
  const { corner, verge } = d;
  for (const x of [-s.wallX, s.wallX])
    for (const z of [-s.wallZ, s.wallZ])
      boxes.push({
        kind: 'trim',
        position: [x, corner.top / 2, z],
        scale: [corner.size, corner.top, corner.size],
        rotation: [0, Math.PI / 4, 0],
      });

  // Verge boards: both slopes of both gables, from just past the ridge to just
  // short of the eave fascia, their top edge 1 cm over the roof plane.
  const eaveEnd = s.eaveX + d.eave.extension;
  for (const side of [-1, 1]) {
    const theta = -side * s.roofSlope;
    const from = -0.05;
    const to = eaveEnd - 0.01;
    const midX = (from + to) / 2;
    const topY = s.eaveTop + slope * (s.eaveX - midX) + 0.01;
    // Centre = top-edge midpoint less half the board along its own up axis.
    const half = verge.height / 2;
    const centreX = side * (midX + half * Math.sin(theta) * side);
    const centreY = topY - half * Math.cos(theta);
    for (const end of [-1, 1])
      boxes.push({
        kind: 'trim',
        position: [centreX, centreY, end * (s.roofZ + verge.standoff + verge.thickness / 2)],
        scale: [(to - from) / Math.cos(s.roofSlope), verge.height, verge.thickness],
        rotation: [0, 0, theta],
      });
  }

  // Louvred vent panel on the +x wall: dark backing, frame, angled blades.
  const { louvre } = d;
  const face = s.wallX;
  boxes.push({
    kind: 'dark',
    position: [face + 0.015, louvre.y, louvre.z],
    scale: [0.03, louvre.height, louvre.width],
  });
  for (const edge of [-1, 1]) {
    boxes.push({
      kind: 'steel',
      position: [face + 0.04, louvre.y + (edge * (louvre.height - louvre.frame)) / 2, louvre.z],
      scale: [0.08, louvre.frame, louvre.width + louvre.frame],
    });
    boxes.push({
      kind: 'steel',
      position: [face + 0.04, louvre.y, louvre.z + (edge * (louvre.width - louvre.frame)) / 2],
      scale: [0.08, louvre.height - louvre.frame, louvre.frame],
    });
  }
  const inner = louvre.height - 2 * louvre.frame;
  for (let i = 0; i < louvre.blades; i += 1) {
    const y = louvre.y - inner / 2 + ((i + 0.5) * inner) / louvre.blades;
    boxes.push({
      kind: 'steel',
      position: [face + 0.05, y, louvre.z],
      scale: [0.09, 0.012, louvre.width - 2 * louvre.frame],
      // Blades tip down and outward, shedding rain.
      rotation: [0, 0, -0.65],
    });
  }

  // Cable entry on the -z wall: ground pad, two conduits, junction box, gland.
  const { cable } = d;
  const wall = -s.wallZ;
  const { junction } = cable;
  boxes.push({
    kind: 'concrete',
    position: [cable.x, 0.07, wall - 0.25],
    scale: [0.7, 0.14, 0.5],
  });
  for (const dx of [-0.12, 0.12])
    pipes.push({
      from: [cable.x + dx, 0.1, wall - 0.12],
      to: [cable.x + dx, junction.y - junction.height / 2 + 0.02, wall - 0.12],
      radius: 0.035,
    });
  boxes.push({
    kind: 'steel',
    position: [cable.x, junction.y, wall - junction.depth / 2 - 0.01],
    scale: [junction.width, junction.height, junction.depth],
  });
  pipes.push({
    from: [cable.x, junction.y + junction.height / 2 - 0.02, wall - 0.1],
    to: [cable.x, junction.y + junction.height / 2 + 0.45, wall - 0.1],
    radius: 0.03,
  });
  pipes.push({
    from: [cable.x, junction.y + junction.height / 2 + 0.45, wall - 0.1],
    to: [cable.x, junction.y + junction.height / 2 + 0.45, wall + 0.05],
    radius: 0.03,
  });
  return { boxes, pipes };
}
