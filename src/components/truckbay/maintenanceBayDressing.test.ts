import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import {
  MAINTENANCE_BAY_DRESSING,
  MAINTENANCE_BAY_SHELL,
  maintenanceBayDressing,
  type BayBox,
} from './maintenanceBayDressing';

/**
 * final5-med-12 rubric, axis 1: "the pump house (yard, centre) is a plain
 * box". It is the maintenance bay; the yard camera sees its +x eave wall, its
 * -z gable wall and its roof.
 */
const { boxes, pipes } = maintenanceBayDressing();
const s = MAINTENANCE_BAY_SHELL;
const lo = (b: BayBox, axis: number) => b.position[axis] - b.scale[axis] / 2;
const hi = (b: BayBox, axis: number) => b.position[axis] + b.scale[axis] / 2;

/** Bay-local to world: the bay stands at its anchor, turned about y. */
const toWorld = (x: number, z: number): [number, number] => {
  const { position, rotation } = SITE_LAYOUT.serviceYard.maintenanceGarage;
  const c = Math.cos(rotation);
  const n = Math.sin(rotation);
  return [position[0] + x * c + z * n, position[2] - x * n + z * c];
};

describe('maintenance bay dressing', () => {
  it('carries the roof out past both eave walls, with fascia, gutter and downpipes', () => {
    for (const side of [-1, 1]) {
      const reach = Math.max(
        ...boxes
          .filter((b) => Math.sign(b.position[0]) === side && b.position[1] > s.wallTop - 0.6)
          .map((b) => Math.abs(side > 0 ? hi(b, 0) : lo(b, 0)))
      );
      expect(reach - s.wallX).toBeGreaterThanOrEqual(0.7);
      expect(
        pipes.filter((p) => Math.sign(p.from[0]) === side && p.to[1] < 0.7).length
      ).toBeGreaterThanOrEqual(2);
    }
    // One fascia per eave, beyond the eave wall.
    expect(
      boxes.filter((b) => b.kind === 'trim' && Math.abs(b.position[0]) > s.eaveX)
    ).toHaveLength(2);
  });

  /**
   * final7 yard (rubric backlog 8, `pump_pair`): still a sharp-edged box. No
   * vertical corner and no gable roof edge carried a highlight, so the walls
   * met the sky and each other as two flat tones.
   */
  it('caps every vertical wall corner with a 45-degree flashing that catches its own light', () => {
    const { corner } = MAINTENANCE_BAY_DRESSING;
    const flashings = boxes.filter(
      (b) => b.kind === 'trim' && b.rotation && Math.abs(b.rotation[1] - Math.PI / 4) < 1e-9
    );
    expect(flashings).toHaveLength(4);
    for (const side of [-1, 1])
      for (const end of [-1, 1]) {
        const f = flashings.find(
          (b) => b.position[0] === side * s.wallX && b.position[2] === end * s.wallZ
        );
        expect(f).toBeDefined();
        // Its diagonal face stands proud of both walls it covers.
        expect((f!.scale[0] * Math.SQRT2) / 2).toBeGreaterThan(0.05);
        expect(f!.scale[0]).toBe(corner.size);
        // From the ground to under the eave, clear of the roof slab.
        expect(lo(f!, 1)).toBeLessThanOrEqual(0.01);
        expect(hi(f!, 1)).toBeLessThan(s.wallTop - 0.2);
        // About 30 full-res px a metre at the yard camera's 52 m: >= 6 px across.
        expect(f!.scale[0] * Math.SQRT2).toBeGreaterThanOrEqual(0.2);
      }
  });

  it('finishes both gable roof edges with a verge board along each slope', () => {
    const { verge } = MAINTENANCE_BAY_DRESSING;
    const boards = boxes.filter(
      (b) => b.kind === 'trim' && b.rotation && b.rotation[2] !== 0 && b.rotation[1] === 0
    );
    expect(boards).toHaveLength(4);
    const slope = Math.tan(s.roofSlope);
    const roofTop = (x: number) => s.eaveTop + slope * (s.eaveX - Math.abs(x));
    for (const b of boards) {
      // Hung on the gable end of the roof, just outside it.
      expect(Math.abs(b.position[2]) - b.scale[2] / 2).toBeGreaterThanOrEqual(s.roofZ - 1e-9);
      // Its top edge rides 1 cm over the roof plane, at the slope's pitch.
      const theta = b.rotation![2];
      const topX = b.position[0] - (b.scale[1] / 2) * Math.sin(theta);
      const top = b.position[1] + (b.scale[1] / 2) * Math.cos(theta);
      expect(top - roofTop(topX)).toBeCloseTo(0.01, 6);
      expect(Math.abs(b.rotation![2])).toBeCloseTo(s.roofSlope, 9);
      expect(b.scale[1]).toBe(verge.height);
      // From the ridge to the eave extension's end, short of the eave fascia.
      const reach = Math.abs(b.position[0]) + (b.scale[0] / 2) * Math.cos(s.roofSlope);
      expect(reach).toBeLessThan(s.eaveX + MAINTENANCE_BAY_DRESSING.eave.extension);
      expect(reach).toBeGreaterThan(s.eaveX + MAINTENANCE_BAY_DRESSING.eave.extension - 0.05);
    }
  });

  it('puts a louvred vent on the +x wall, clear of its window and door, under the eave', () => {
    const { louvre } = MAINTENANCE_BAY_DRESSING;
    const blades = boxes.filter((b) => b.rotation && b.rotation[2] !== 0 && b.kind === 'steel');
    expect(blades.length).toBeGreaterThanOrEqual(5);
    const top = louvre.y + louvre.height / 2;
    const bottom = louvre.y - louvre.height / 2;
    const near = louvre.z - louvre.width / 2;
    const far = louvre.z + louvre.width / 2;
    expect(top).toBeLessThan(s.wallTop - 0.3);
    expect(Math.abs(louvre.z) + louvre.width / 2).toBeLessThan(s.wallZ - 0.1);
    // The side window (z -2.8..0.6, y 2.45..3.95) and the door (z 1.05..3.35).
    const clear = (z0: number, z1: number, y0: number, y1: number) =>
      far < z0 || near > z1 || top < y0 || bottom > y1;
    expect(clear(-2.8, 0.6, 2.45, 3.95)).toBe(true);
    expect(clear(1.05, 3.35, 0, 2.7)).toBe(true);
    for (const b of blades) expect(lo(b, 0)).toBeGreaterThanOrEqual(s.wallX);
  });

  it('brings cables up from the ground into a junction box on the -z wall', () => {
    const { cable } = MAINTENANCE_BAY_DRESSING;
    const risers = pipes.filter((p) => p.from[1] <= 0.15 && Math.abs(p.from[0] - cable.x) < 0.3);
    expect(risers.length).toBeGreaterThanOrEqual(2);
    const box = boxes.find(
      (b) => b.kind === 'steel' && Math.abs(b.position[1] - cable.junction.y) < 1e-6
    )!;
    expect(box).toBeDefined();
    for (const p of risers) expect(p.to[1]).toBeGreaterThan(lo(box, 1));
    expect(hi(box, 2)).toBeLessThanOrEqual(-s.wallZ);
    // A gland passes into the wall.
    expect(pipes.some((p) => p.to[2] > -s.wallZ)).toBe(true);
  });

  it('dresses the walls the yard camera sees', () => {
    const camera = SITE_LAYOUT.cameras.yard.position;
    for (const [x, z, nx, nz] of [
      [s.wallX, MAINTENANCE_BAY_DRESSING.louvre.z, 1, 0],
      [MAINTENANCE_BAY_DRESSING.cable.x, -s.wallZ, 0, -1],
    ]) {
      const [wx, wz] = toWorld(x, z);
      const [ox, oz] = toWorld(0, 0);
      const [px, pz] = toWorld(nx, nz);
      const normal = [px - ox, pz - oz];
      const toCamera = [camera[0] - wx, camera[2] - wz];
      const len = Math.hypot(toCamera[0], toCamera[1]);
      expect((normal[0] * toCamera[0] + normal[1] * toCamera[1]) / len).toBeGreaterThan(0.3);
    }
  });

  it('is mounted outside the generated-model boundary, so it shows with the GLB', () => {
    const source = readFileSync('src/components/TruckBay.tsx', 'utf8');
    const bay = source.slice(source.indexOf('const MaintenanceBay: '));
    const body = bay.slice(0, bay.indexOf('\n);\n'));
    const boundaryEnd = body.indexOf('</GeneratedBoundary>');
    expect(boundaryEnd).toBeGreaterThan(0);
    expect(body.indexOf('<MaintenanceBayDressing />')).toBeGreaterThan(boundaryEnd);
  });
});
