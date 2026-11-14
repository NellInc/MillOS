/**
 * The town hall ramp against Approved Document M Volume 2 (DOC_M_RAMP in
 * accessibilityLayout.ts quotes each clause and its page). The drawn ramp is
 * raycast as well as its constants read, and a wheelchair's width is pushed
 * along the step-free route through the real walking predicates.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  DOC_M_RAMP,
  TOWN_HALL_PORTICO,
  TOWN_HALL_RAMP,
  TOWN_HALL_RAMP_FINISH,
  TOWN_HALL_RAMP_KERBS,
  TOWN_HALL_RAMP_RAILS,
  TOWN_HALL_STEP_FREE_ROUTE,
  WHEELCHAIR,
  townHallBlocks,
  townHallRampHeight,
  townHallToWorld,
} from '../../constants/accessibilityLayout';
import { createTownHallRamp } from './AccessFittings';
import { sampleWalkingGroundHeight } from '../../utils/castleNavigation';
import { walkingObstacleAt } from '../../utils/walkingObstacles';
import { VILLAGE_PAVED_AREAS } from '../VillageArea';

const r = TOWN_HALL_RAMP;
const [f1, f2] = r.flights;
const ramp = createTownHallRamp();
const meshes = {
  landings: new THREE.Mesh(ramp.landings),
  flights: new THREE.Mesh(ramp.flights),
  kerbs: new THREE.Mesh(ramp.kerbs),
};
const ray = new THREE.Raycaster();
/** The top of a drawn part straight below (x, z), town hall frame, or null. */
function topAt(mesh: THREE.Mesh, x: number, z: number): number | null {
  ray.set(new THREE.Vector3(x, 5, z), new THREE.Vector3(0, -1, 0));
  return ray.intersectObject(mesh)[0]?.point.y ?? null;
}
/** The walking surface drawn below (x, z): a landing or a flight. */
function surfaceAt(x: number, z: number): number | null {
  const a = topAt(meshes.landings, x, z),
    b = topAt(meshes.flights, x, z);
  return a === null ? b : b === null ? a : Math.max(a, b);
}
/** A kerb drawn above the surface at (x, z). */
function kerbAt(x: number, z: number): boolean {
  const k = topAt(meshes.kerbs, x, z);
  return k !== null && k > (surfaceAt(x, z) ?? 0) + 0.05;
}
/** The plastered side wall's face; its plinth stands proud of it to x -6.065, 0.32 m high. */
const WALL_X = -6.0;
const PLINTH_X = -6.065;

/** Light reflectance value of an sRGB colour: relative luminance, 0-100. */
function lrv(hex: string): number {
  const [red, green, blue] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 100 * (0.2126 * red + 0.7152 * green + 0.0722 * blue);
}

describe('town hall ramp: Approved Document M Volume 2', () => {
  it("reads Table 1's limits as the document states them", () => {
    for (const [going, gradient] of [
      [2, 12],
      [4, 14],
      [5, 15],
      [9, 19],
      [10, 20],
    ])
      expect(DOC_M_RAMP.maxGradient(going)).toBeCloseTo(1 / gradient, 12);
  });

  it('keeps every flight within Table 1 and 1.26 c, as drawn', () => {
    expect(f1.fromY).toBe(r.landingY);
    expect(f2.toY).toBe(0);
    const x = (r.clearMinX + r.clearMaxX) / 2;
    for (const f of r.flights) {
      const going = Math.abs(f.fromZ - f.toZ),
        rise = Math.abs(f.fromY - f.toY);
      expect(going).toBeLessThanOrEqual(DOC_M_RAMP.maxGoing);
      expect(rise).toBeLessThanOrEqual(DOC_M_RAMP.maxFlightRise);
      expect(rise / going, `flight from z ${f.fromZ}`).toBeLessThanOrEqual(
        DOC_M_RAMP.maxGradient(going)
      );
      let previous: number | null = null;
      for (let z = f.fromZ - 0.05; z > f.toZ + 0.05; z -= 0.25) {
        const y = topAt(meshes.flights, x, z);
        expect(y, `flight surface at z ${z}`).not.toBeNull();
        expect(Math.abs(y! - townHallRampHeight(x, z)!)).toBeLessThan(1e-4);
        if (previous !== null)
          expect(Math.abs(y! - previous) / 0.25).toBeLessThanOrEqual(
            DOC_M_RAMP.maxGradient(going) + 1e-6
          );
        previous = y;
      }
    }
  });

  it('is at least 1.5 m wide between its kerbs and the wall or inner kerb (1.26 e), as drawn', () => {
    expect(r.clearMaxX - r.clearMinX).toBeGreaterThanOrEqual(DOC_M_RAMP.minSurfaceWidth);
    const centre = (r.clearMinX + r.clearMaxX) / 2;
    const clear = (x: number, z: number) => surfaceAt(x, z) !== null && !kerbAt(x, z);
    /** The last clear point from `start` along `step` (x or z), to 0.1 mm, stopping at `limit`. */
    const edge = (ok: (v: number) => boolean, start: number, step: number, limit: number) => {
      let v = start;
      while (ok(v + step) && Math.sign(step) * (limit - (v + step)) >= 0) v += step;
      let lo = v,
        hi = Math.sign(step) * (limit - (v + step)) < 0 ? limit : v + step;
      if (hi === limit && ok(limit)) return limit;
      for (let i = 0; i < 14; i++) {
        const mid = (lo + hi) / 2;
        if (ok(mid)) lo = mid;
        else hi = mid;
      }
      return lo;
    };
    for (let z = r.top.maxZ - r.kerb.width - 0.05; z > f2.toZ + 0.02; z -= 0.25) {
      const left = edge((x) => clear(x, z), centre, -0.01, -9);
      // Beside the hall the plinth face bounds the width; past it, the inner kerb.
      const right = edge((x) => clear(x, z), centre, 0.01, z >= r.wallEndZ ? PLINTH_X : WALL_X);
      expect(right - left, `width at z ${z.toFixed(2)}`).toBeGreaterThanOrEqual(
        DOC_M_RAMP.minSurfaceWidth
      );
    }
    // Past the east column on the apron: base front to the apron's kerb.
    const p = TOWN_HALL_PORTICO;
    for (let x = -p.columnX - p.columnRadius; x <= -p.columnX + p.columnRadius; x += 0.05) {
      const base = p.columnZ + Math.sqrt(Math.max(0, p.columnRadius ** 2 - (x + p.columnX) ** 2));
      const front = edge((z) => clear(x, z), Math.max(base, r.apron.minZ) + 0.002, 0.01, 9);
      expect(front - base, `apron depth at x ${x.toFixed(2)}`).toBeGreaterThanOrEqual(
        DOC_M_RAMP.minSurfaceWidth
      );
    }
  });

  it('has head and foot landings of 1.2 m, a 1.5 m mid landing, all level and clear (1.26 h, i, k)', () => {
    const head = r.top.maxZ - r.kerb.width - f1.fromZ;
    expect(head).toBeGreaterThanOrEqual(DOC_M_RAMP.minEndLanding);
    expect(r.midLanding.fromZ - r.midLanding.toZ).toBeGreaterThanOrEqual(
      DOC_M_RAMP.minIntermediateLanding - 1e-9
    );
    expect(f1.toZ).toBe(r.midLanding.fromZ);
    expect(f2.fromZ).toBe(r.midLanding.toZ);
    expect(f2.toZ - r.footLanding.toZ).toBeGreaterThanOrEqual(DOC_M_RAMP.minEndLanding);
    for (let x = r.clearMinX + 0.05; x < r.clearMaxX; x += 0.2) {
      for (let z = f1.fromZ + 0.05; z < r.top.maxZ - r.kerb.width; z += 0.2)
        expect(topAt(meshes.landings, x, z)).toBeCloseTo(r.landingY, 6);
      for (let z = r.midLanding.toZ + 0.05; z < r.midLanding.fromZ; z += 0.2)
        expect(topAt(meshes.landings, x, z)).toBeCloseTo(r.midLanding.y, 6);
      // The foot landing: on the ground, paved, and nothing stands on it.
      if (x < r.clearMinX + 0.1 || x > r.clearMaxX - 0.1) continue;
      for (let z = r.footLanding.toZ; z <= f2.toZ; z += 0.2) {
        const [wx, , wz] = townHallToWorld(x, 0, z);
        expect(walkingObstacleAt(wx, wz, 0)?.id ?? null, `foot landing ${x}, ${z}`).toBeNull();
        expect(townHallBlocks(wx, wz, 0, 0.01)).toBe(false);
        const vx = -x,
          vz = 20 - z;
        expect(
          VILLAGE_PAVED_AREAS.some(
            (a) => Math.abs(vx - a.x) <= a.halfX && Math.abs(vz - a.z) <= a.halfZ
          ),
          `paved at village ${vx.toFixed(2)}, ${vz.toFixed(2)}`
        ).toBe(true);
      }
    }
  });

  it('kerbs every open side 100 mm high, in finishes that contrast (1.26 f, m; 0.26)', () => {
    expect(r.kerb.height).toBeGreaterThanOrEqual(DOC_M_RAMP.minKerbHeight);
    for (const k of TOWN_HALL_RAMP_KERBS) {
      const cx = (k.minX + k.maxX) / 2;
      const along = k.maxZ - k.minZ > k.maxX - k.minX;
      for (let t = 0.02; t < 1; t += 0.04) {
        const x = along ? cx : k.minX + (k.maxX - k.minX) * t,
          z = along ? k.minZ + (k.maxZ - k.minZ) * t : (k.minZ + k.maxZ) / 2;
        const top = topAt(meshes.kerbs, x, z);
        expect(top, `kerb at ${x.toFixed(2)}, ${z.toFixed(2)}`).not.toBeNull();
        expect(top! - townHallRampHeight(x, z)!).toBeGreaterThanOrEqual(
          DOC_M_RAMP.minKerbHeight - 1e-6
        );
      }
    }
    // The open sides: the outer edge everywhere, the inner edge past the plinth.
    for (let z = r.top.maxZ - 0.05; z > f2.toZ; z -= 0.25) {
      expect(kerbAt(r.minX + 0.05, z), `outer kerb at z ${z.toFixed(2)}`).toBe(true);
      if (z < r.wallEndZ) expect(kerbAt(PLINTH_X + 0.05, z), `inner kerb at ${z}`).toBe(true);
    }
    const { landing, flight, kerb } = TOWN_HALL_RAMP_FINISH;
    for (const [a, b] of [
      [flight, landing],
      [kerb, landing],
      [kerb, flight],
    ])
      expect(Math.abs(lrv(a) - lrv(b)), `${a} against ${b}`).toBeGreaterThan(
        DOC_M_RAMP.minContrastLrv
      );
  });

  it('has a handrail on both sides that meets 1.37 a, d, h, i, j and l', () => {
    expect(r.railHeight).toBeGreaterThanOrEqual(DOC_M_RAMP.handrailHeight.min);
    expect(r.railHeight).toBeLessThanOrEqual(DOC_M_RAMP.handrailHeight.max);
    expect(2 * r.railRadius).toBeGreaterThanOrEqual(DOC_M_RAMP.handrailDiameter.min);
    expect(2 * r.railRadius).toBeLessThanOrEqual(DOC_M_RAMP.handrailDiameter.max);
    const along = (x: number) =>
      TOWN_HALL_RAMP_RAILS.find((l) => l.from[0] === x && l.to[0] === x && l.from[1] > l.to[1])!;
    const outer = along(r.outerRailX),
      inner = along(r.innerRailX);
    // Both run 300 mm past the foot; the inner one 300 mm onto the head landing,
    // the outer one on round the head landing and the apron to the portico.
    for (const rail of [outer, inner])
      expect(rail.to[1]).toBeLessThanOrEqual(f2.toZ - DOC_M_RAMP.handrailExtension + 1e-9);
    expect(inner.from[1]).toBeGreaterThanOrEqual(f1.fromZ + DOC_M_RAMP.handrailExtension - 1e-9);
    expect(outer.from[1]).toBeGreaterThan(f1.fromZ);
    // Into the surface width no more than 100 mm; never more than 50 mm beyond it.
    expect(r.clearMaxX - (r.innerRailX - r.railRadius)).toBeLessThanOrEqual(
      DOC_M_RAMP.handrailMaxIntrusion
    );
    expect(r.outerRailX + r.railRadius - r.clearMinX).toBeLessThanOrEqual(
      DOC_M_RAMP.handrailMaxIntrusion
    );
    expect(r.clearMinX - (r.outerRailX + r.railRadius)).toBeLessThanOrEqual(
      DOC_M_RAMP.handrailMaxOutside
    );
    // 50-75 mm off the plastered wall it runs beside.
    const gap = WALL_X - (r.innerRailX + r.railRadius);
    expect(gap).toBeGreaterThanOrEqual(DOC_M_RAMP.handrailWallClearance.min);
    expect(gap).toBeLessThanOrEqual(DOC_M_RAMP.handrailWallClearance.max);
  });

  it('takes a wheelchair from the street to the door with no step, inside the clear width', () => {
    const half = WHEELCHAIR.halfWidth;
    const inKerb = (x: number, z: number) =>
      TOWN_HALL_RAMP_KERBS.some((k) => x > k.minX && x < k.maxX && z > k.minZ && z < k.maxZ);
    type Rect = { minX: number; maxX: number; minZ: number; maxZ: number };
    const inRect = (x: number, z: number, a: Rect) =>
      x >= a.minX && x <= a.maxX && z >= a.minZ && z <= a.maxZ;
    const p = TOWN_HALL_PORTICO;
    /** Within the clear width of the ramp, its landings, the foot landing or the door's landing. */
    const inClear = (x: number, z: number) =>
      (x >= r.clearMinX && x <= r.clearMaxX && z >= r.footLanding.toZ - 0.6 && z <= f1.fromZ) ||
      ((inRect(x, z, r.top) || inRect(x, z, r.apron)) && !inKerb(x, z)) ||
      (Math.abs(x) <= p.landingHalfX && z >= p.wallZ && z <= p.nosingZ);
    const last = TOWN_HALL_STEP_FREE_ROUTE[TOWN_HALL_STEP_FREE_ROUTE.length - 1];
    const route = [[-10.5, 0, last[2]], ...[...TOWN_HALL_STEP_FREE_ROUTE].reverse()];
    const step = 0.05;
    let previous: number | null = null,
      lips = 0,
      samples = 0;
    for (let i = 1; i < route.length; i++) {
      const [ax, , az] = route[i - 1],
        [bx, , bz] = route[i];
      const length = Math.hypot(bx - ax, bz - az);
      const ux = (bx - ax) / length,
        uz = (bz - az) / length;
      for (let s = 0; s <= length + 1e-9; s += step) {
        const x = ax + ux * s,
          z = az + uz * s;
        const [wx, , wz] = townHallToWorld(x, 0, z);
        const y = sampleWalkingGroundHeight(wx, wz, 128);
        const at = `leg ${i} at ${x.toFixed(2)}, ${z.toFixed(2)}`;
        if (previous !== null && s > 0) {
          const rise = Math.abs(y - previous);
          // The street's paving lies on the -0.02 m ground datum, the foot at 0.
          const limit = step * DOC_M_RAMP.maxGradient(2) + 1e-6;
          if (rise > limit && rise <= limit + 0.0201 && Math.min(y, previous) < -0.01) lips++;
          else expect(rise, `step ${at}`).toBeLessThanOrEqual(limit);
        }
        previous = y;
        expect(walkingObstacleAt(wx, wz, half)?.id ?? null, at).toBeNull();
        expect(townHallBlocks(wx, wz, y, half), `rail or column ${at}`).toBe(false);
        // The chair's width, across its heading, on the ramp's clear surface.
        if (i > 1) {
          for (const side of [-1, 0, 1]) {
            const cx = x - uz * half * side,
              cz = z + ux * half * side;
            expect(inClear(cx, cz), `chair edge ${side} ${at}`).toBe(true);
          }
          samples++;
        }
      }
    }
    expect(lips).toBeLessThanOrEqual(1);
    expect(samples).toBeGreaterThan(400);
    expect(previous).toBeCloseTo(r.landingY, 6);
  });
});
