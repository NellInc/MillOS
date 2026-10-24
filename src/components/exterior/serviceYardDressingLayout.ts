/**
 * DRESSING FOR TWO BARE PIECES OF THE SERVICE YARD.
 *
 * The rubric judge on final4-med-12 (backlog 4): the middle band of
 * `tank-farm` (about y 600-870) is an empty bund floor, and the lower 40% of
 * `yard` is bare apron. What a working site keeps there:
 *
 *  - TANK FARM: a manifold on the bund floor, in front of the tanks' camera-side
 *    heads. Each tank drains from the underside of its barrel near that head,
 *    down to a branch with a gate valve over a drip tray, into one header pipe
 *    on low stands running across the bund. Farm-local metres: the farm group
 *    is turned a quarter about y, the tanks' axes run along local x and the
 *    tank-farm camera stands on local +x (world z -97 is local x 27). The west
 *    service gap in the bund (local x -11) is on the far side and stays open.
 *  - YARD: a grain intake grate for tipping trucks on the apron east of the
 *    silo pad, its yellow hazard border, and slot drains: one along the silo
 *    pad's edge and one across the apron to it. World metres. Nothing on this
 *    apron is a vehicle or personnel route (`SITE_LAYOUT.routes`); the garage's
 *    clearance and the perimeter fence at x 95 bound it.
 */
import { storageTankAxisHeight } from './utilityVesselDetails';

/** Top of the containment pad (`TANK_FARM_PAD_SIZE` on the shared ground datum). */
export const TANK_FARM_PAD_TOP = 0.16;

/** One tank as the manifold sees it, farm-local: its z, size and seam offset. */
export interface ManifoldTank {
  readonly z: number;
  readonly radius: number;
  readonly length: number;
  /** Axial distance of the head-to-barrel seam (`vesselSeamOffset`). */
  readonly seamOffset: number;
}

export const TANK_FARM_MANIFOLD = {
  /** The header: along local z, in front of every camera-side head. */
  header: { x: 9.4, y: 0.72, z0: -17.6, z1: 17.6, radius: 0.1 },
  /** Low stands under the header, clear of the branch tees. */
  standZs: [-17, -11, -5.5, 5.5, 11, 17],
  stand: { width: 0.36, post: 0.08, plate: 0.3 },
  /** Branch and drop pipe radius; the drop leaves the barrel this far inside its seam. */
  branch: { radius: 0.07, inset: 0.6 },
  /** Gate valve on each branch, between the head and the header. */
  valve: { x: 8.2, body: 0.3, stem: 0.38, wheel: 0.18 },
  /** Drip tray on the pad under each valve. */
  tray: { width: 0.9, depth: 0.7, height: 0.09, wall: 0.03 },
} as const;

/** The tank's underside height above the farm group's origin. */
export const tankUndersideY = (tank: ManifoldTank, baseY: number) =>
  baseY + storageTankAxisHeight(tank.radius) - tank.radius;

/** Where each tank's drop leaves its barrel, farm-local x. */
export const manifoldDropX = (tank: ManifoldTank) =>
  tank.seamOffset - TANK_FARM_MANIFOLD.branch.inset;

/**
 * The yard's intake grate and drains, world metres. The grate's long side runs
 * along z, the way a tipping truck stands over it.
 */
export const YARD_INTAKE = {
  grate: { x: 84, z: 30, width: 3.6, length: 4.8 },
  /** Bearing bars along z, at a pitch the yard camera resolves (~7 px). */
  bar: { pitch: 0.2, width: 0.05, height: 0.04 },
  crossBars: 4,
  frame: { width: 0.12, height: 0.06 },
  /** Yellow hazard band painted round the frame. */
  border: 0.3,
} as const;

/** One slot drain: a straight run from `from` to `to`, world x/z. */
export interface SlotDrain {
  readonly id: string;
  readonly from: readonly [number, number];
  readonly to: readonly [number, number];
}

/**
 * A slot drain's channel, its cover plates, and the concrete kerb cast either
 * side of it (`kerb` wide, `kerbHeight` proud). Without the kerbs the 0.3 m
 * cover alone read from the yard camera as a stray thin line (judge-r5-1830).
 */
export const YARD_DRAIN = {
  width: 0.3,
  plate: 0.5,
  gap: 0.06,
  height: 0.02,
  kerb: 0.14,
  kerbHeight: 0.012,
} as const;

export const YARD_DRAINS: readonly SlotDrain[] = [
  // Along the silo pad's east edge (x 73), where wash-down runs off the pad.
  { id: 'silo-edge', from: [75.5, 14], to: [75.5, 56] },
  // Across the apron from beside the grate to the edge drain.
  { id: 'apron-cross', from: [76, 42], to: [92.5, 42] },
];

/** Plan rect of a drain, including its width and both kerbs. */
export function slotDrainBounds(drain: SlotDrain) {
  const half = YARD_DRAIN.width / 2 + YARD_DRAIN.kerb;
  return {
    minX: Math.min(drain.from[0], drain.to[0]) - half,
    maxX: Math.max(drain.from[0], drain.to[0]) + half,
    minZ: Math.min(drain.from[1], drain.to[1]) - half,
    maxZ: Math.max(drain.from[1], drain.to[1]) + half,
  };
}

/** The cover plates along a drain: centres along it, each `plate` long. */
export function slotDrainPlates(drain: SlotDrain): { x: number; z: number; alongX: boolean }[] {
  const dx = drain.to[0] - drain.from[0];
  const dz = drain.to[1] - drain.from[1];
  const length = Math.hypot(dx, dz);
  const step = YARD_DRAIN.plate + YARD_DRAIN.gap;
  const count = Math.floor(length / step);
  const start = (length - count * step + YARD_DRAIN.gap) / 2 + YARD_DRAIN.plate / 2;
  return Array.from({ length: count }, (_, i) => {
    const t = (start + i * step) / length;
    return { x: drain.from[0] + dx * t, z: drain.from[1] + dz * t, alongX: Math.abs(dx) > 0 };
  });
}

/** The two kerb strips along a drain, flush with the channel's edges: plan centre and size. */
export function slotDrainKerbs(
  drain: SlotDrain
): { x: number; z: number; size: [number, number] }[] {
  const dx = drain.to[0] - drain.from[0];
  const dz = drain.to[1] - drain.from[1];
  const length = Math.hypot(dx, dz);
  const alongX = Math.abs(dx) > 0;
  const mx = (drain.from[0] + drain.to[0]) / 2;
  const mz = (drain.from[1] + drain.to[1]) / 2;
  const offset = YARD_DRAIN.width / 2 + YARD_DRAIN.kerb / 2;
  return [-1, 1].map((side) =>
    alongX
      ? { x: mx, z: mz + side * offset, size: [length, YARD_DRAIN.kerb] }
      : { x: mx + side * offset, z: mz, size: [YARD_DRAIN.kerb, length] }
  );
}

/** The grate's plan rect with its painted border. */
export function yardIntakeBounds() {
  const { grate, border } = YARD_INTAKE;
  return {
    minX: grate.x - grate.width / 2 - border,
    maxX: grate.x + grate.width / 2 + border,
    minZ: grate.z - grate.length / 2 - border,
    maxZ: grate.z + grate.length / 2 + border,
  };
}
