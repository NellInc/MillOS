import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  BANK_LINE,
  bankLineDelivered,
  bankLineIncident,
  bankLineIrradiance,
  installInteriorLighting,
  patchInteriorLightingBegin,
  patchInteriorLightingPars,
  roofSunOcclusion,
} from '../interiorLighting';
import {
  compactUnshadowedPunctualLoops,
  cullZeroPunctualContributions,
} from '../punctualLightCulling';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import { SIFTER_LAYOUT } from '../../constants/siteLayout';
import {
  REDUCED_ZONE_LIGHT_POSITIONS,
  ZONE_LIGHT_DISTANCE,
  ZONE_LIGHT_INTENSITY,
} from '../../components/environment/InteriorLightRig';

const originalBegin = THREE.ShaderChunk.lights_fragment_begin;
const originalPars = THREE.ShaderChunk.lights_pars_begin;
afterEach(() => {
  THREE.ShaderChunk.lights_fragment_begin = originalBegin;
  THREE.ShaderChunk.lights_pars_begin = originalPars;
});

const up = new THREE.Vector3(0, 1, 0);
const total = (point: THREE.Vector3, normal: THREE.Vector3) =>
  REDUCED_ZONE_LIGHT_POSITIONS.reduce(
    (sum, light) =>
      sum + bankLineIrradiance(new THREE.Vector3(...light), ZONE_LIGHT_INTENSITY, point, normal),
    0
  );

describe('interior fluorescent rows as line sources', () => {
  it('keeps the old under-fixture floor irradiance exactly at the row centre', () => {
    const [x, y, z] = REDUCED_ZONE_LIGHT_POSITIONS[1];
    const floor = new THREE.Vector3(x, SITE_LAYOUT.datum.interiorFloor, z);
    // The old point light: decay 0, three's smooth window at the 44 m cutoff.
    const oldPoint = ZONE_LIGHT_INTENSITY * (1 - (y / ZONE_LIGHT_DISTANCE) ** 4) ** 2;
    expect(
      bankLineIrradiance(new THREE.Vector3(x, y, z), ZONE_LIGHT_INTENSITY, floor, up)
    ).toBeCloseTo(oldPoint, 6);
  });

  it('lights the camera-facing west faces of all three plansifters alike', () => {
    // BLOCKER from the 19:00/22:00 captures: one isotropic source on the hall
    // centre-line lit only sifter C's west face, because it is the only one of
    // the three facing x = 0. A row of fittings lights every west face.
    const west = new THREE.Vector3(-1, 0, 0);
    const faces = SITE_LAYOUT.machines.sifters.map(({ position: [x, y, z] }) =>
      total(new THREE.Vector3(x - 3.25, y + SIFTER_LAYOUT.bodyCentreY, z + 1), west)
    );
    for (const value of faces) expect(value).toBeGreaterThan(ZONE_LIGHT_INTENSITY * 0.25);
    expect(Math.max(...faces) / Math.min(...faces)).toBeLessThan(1.6);
  });

  it('reaches nothing on the outdoor silo battery', () => {
    for (const {
      position: [x, , z],
    } of SITE_LAYOUT.machines.silos) {
      for (let y = 0; y <= 32; y += 4) {
        const wall = new THREE.Vector3(x - 6, y, z);
        expect(total(wall, new THREE.Vector3(-1, 0, 0))).toBe(0);
      }
    }
  });

  it('stays bounded next to the fittings, where the process pipes run', () => {
    let peak = 0;
    for (const light of REDUCED_ZONE_LIGHT_POSITIONS) {
      for (let dx = -40; dx <= 40; dx += 2) {
        for (let dy = -3; dy <= 3; dy += 0.5) {
          const point = new THREE.Vector3(light[0] + dx, light[1] + dy, light[2] + 0.4);
          for (const normal of [up, new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, -1)]) {
            peak = Math.max(
              peak,
              bankLineIrradiance(new THREE.Vector3(...light), ZONE_LIGHT_INTENSITY, point, normal)
            );
          }
        }
      }
    }
    expect(peak).toBeLessThan(ZONE_LIGHT_INTENSITY * 4.5);
  });

  it('sends only the uplight fraction to the roof deck', () => {
    const [x, y, z] = REDUCED_ZONE_LIGHT_POSITIONS[1];
    const deck = new THREE.Vector3(x, SITE_LAYOUT.factory.bounds.maxY - 0.2, z);
    const down = new THREE.Vector3(0, -1, 0);
    // Direct light only; the floor bounce is pinned separately below.
    const value = bankLineIrradiance(
      new THREE.Vector3(x, y, z),
      ZONE_LIGHT_INTENSITY,
      deck,
      down,
      44,
      false
    );
    expect(value).toBeGreaterThan(0);
    // A ceiling 4 m from a bare isotropic line would take several times the
    // floor's light; the down-facing optic keeps it to a modest glow.
    expect(value).toBeLessThan(ZONE_LIGHT_INTENSITY * BANK_LINE.uplight * 4.1);
  });

  it('lights the roof deck between and beyond the rows with the floor bounce', () => {
    // The 22:00 interior capture read the deck as black (luma 0.9 over the
    // dock end): the rows send it only their uplight, and nothing returned the
    // light the lit slab throws back up. A deck panel now receives the slab
    // beneath it, scaled by the slab's bounce.
    const down = new THREE.Vector3(0, -1, 0);
    const deckY = SITE_LAYOUT.factory.bounds.maxY - 0.4;
    const [, , rowZ] = REDUCED_ZONE_LIGHT_POSITIONS[1];
    const underRow = total(new THREE.Vector3(0, 0, rowZ), up);
    const deckAt = (x: number, z: number) => total(new THREE.Vector3(x, deckY, z), down);
    const directAt = (x: number, z: number) =>
      REDUCED_ZONE_LIGHT_POSITIONS.reduce(
        (sum, light) =>
          sum +
          bankLineIrradiance(
            new THREE.Vector3(...light),
            ZONE_LIGHT_INTENSITY,
            new THREE.Vector3(x, deckY, z),
            down,
            44,
            false
          ),
        0
      );
    // Over the row the bounce is a share of the slab's light, not all of it.
    const bounceOverRow = deckAt(0, rowZ) - directAt(0, rowZ);
    expect(bounceOverRow).toBeGreaterThan(underRow * BANK_LINE.floorBounce * 0.5);
    expect(bounceOverRow).toBeLessThan(underRow * BANK_LINE.floorBounce);
    // At the dock end, 22 m from the nearest row, it is no longer black.
    expect(deckAt(-10, 44)).toBeGreaterThan(underRow * 0.06);
    // A deck sees the whole slab, so its bounce varies less along the hall
    // than the slab's own light does.
    const zs = [-44, -30, -16, 0, 10, 22, 35, 44];
    const spread = (values: number[]) => Math.max(...values) / Math.min(...values);
    const deck = zs.map((z) => deckAt(0, z) - directAt(0, z));
    const slab = zs.map((z) => total(new THREE.Vector3(0, 0, z), up));
    expect(spread(deck)).toBeLessThan(spread(slab) * 0.6);
  });

  it('adds no bounce to up-facing or side-facing surfaces, or to the slab itself', () => {
    const [x, y, z] = REDUCED_ZONE_LIGHT_POSITIONS[1];
    const light = new THREE.Vector3(x, y, z);
    const direct = (point: THREE.Vector3, normal: THREE.Vector3) =>
      bankLineIrradiance(light, ZONE_LIGHT_INTENSITY, point, normal, 44, false);
    for (const [point, normal] of [
      [new THREE.Vector3(5, 0, z + 3), up],
      [new THREE.Vector3(-6, 4, z + 2), new THREE.Vector3(0, 0, -1)],
      [new THREE.Vector3(3, 0.2, z), new THREE.Vector3(0, -1, 0)],
    ] as const) {
      expect(bankLineIrradiance(light, ZONE_LIGHT_INTENSITY, point, normal)).toBe(
        direct(point, normal)
      );
    }
  });

  it('carries the bounce in the shader as well as in its mirror', () => {
    const pars = patchInteriorLightingPars(originalPars);
    expect(pars).toContain(BANK_LINE.floorBounce.toFixed(4));
    expect(pars).toMatch(/float bounce = /);
  });

  it('lets a panel bevel shade a face by N.L, never by clipping the row', () => {
    // The packers' painted steel read as ceramic tile and the plansifters as a
    // grid of glinting patches (final-med-12; gone with the banks switched to
    // the reference point lights in the same page load). The normal map's
    // bevels tilt the shading normal by ~0.3 across each panel edge. Integrated
    // against that normal, the row was clipped at a different place on every
    // bevel and the closest-point direction lay in the face's own plane, so a
    // flat west face took nothing and its upper bevels took everything.
    const delivered = (
      point: THREE.Vector3,
      geometric: THREE.Vector3,
      shading: THREE.Vector3
    ): number =>
      REDUCED_ZONE_LIGHT_POSITIONS.reduce(
        (sum, light) =>
          sum +
          bankLineDelivered(
            new THREE.Vector3(...light),
            ZONE_LIGHT_INTENSITY,
            point,
            geometric,
            shading
          ),
        0
      );
    const tilt = 0.3;
    const faces: Array<[THREE.Vector3, THREE.Vector3, THREE.Vector3[]]> = [];
    for (const { position } of SITE_LAYOUT.machines.sifters) {
      const point = new THREE.Vector3(
        position[0] - 3.25,
        position[1] + SIFTER_LAYOUT.bodyCentreY,
        position[2] + 1
      );
      faces.push([
        point,
        new THREE.Vector3(-1, 0, 0),
        [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)],
      ]);
    }
    for (const { position } of SITE_LAYOUT.machines.packers) {
      const [x, , z] = position;
      faces.push([
        new THREE.Vector3(x - 1.4, 2.5, z),
        new THREE.Vector3(-1, 0, 0),
        [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)],
      ]);
      faces.push([
        new THREE.Vector3(x, 2.5, z - 1.4),
        new THREE.Vector3(0, 0, -1),
        [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)],
      ]);
    }
    for (const [point, geometric, axes] of faces) {
      const received = total(point, geometric);
      expect(received).toBeGreaterThan(0);
      // A flat panel takes exactly the row's irradiance.
      expect(delivered(point, geometric, geometric)).toBeCloseTo(received, 3);
      // Sum of the rows' radiance: the most any change of shading normal can
      // move the delivered light per unit of normal change, under N.L.
      const radiance = REDUCED_ZONE_LIGHT_POSITIONS.reduce(
        (sum, light) =>
          sum +
          bankLineIncident(new THREE.Vector3(...light), ZONE_LIGHT_INTENSITY, point, geometric)
            .radiance,
        0
      );
      for (const axis of axes) {
        const plusNormal = geometric.clone().addScaledVector(axis, tilt).normalize();
        const minusNormal = geometric.clone().addScaledVector(axis, -tilt).normalize();
        const plus = delivered(point, geometric, plusNormal);
        const minus = delivered(point, geometric, minusNormal);
        // No step at a bevel: the light moves no faster than N.L allows...
        const step = plusNormal.distanceTo(geometric);
        expect(Math.abs(plus - received)).toBeLessThanOrEqual(radiance * step + 1e-6);
        expect(Math.abs(minus - received)).toBeLessThanOrEqual(radiance * step + 1e-6);
        // ...and a seam never averages darker than the panel either side of it
        // (N.L is linear until a facet turns past the light, where it clamps).
        expect((plus + minus) / 2 / received).toBeGreaterThan(0.95);
      }
    }
  });

  it('hands RE_Direct an incident that reproduces the irradiance on the geometric normal', () => {
    const deckY = SITE_LAYOUT.factory.bounds.maxY - 0.4;
    const cases: Array<[THREE.Vector3, THREE.Vector3]> = [
      [new THREE.Vector3(3, 0, 4), up],
      [new THREE.Vector3(-9, 3, -12), new THREE.Vector3(-1, 0, 0)],
      [new THREE.Vector3(12, 2, -20), new THREE.Vector3(0, 0, 1)],
      [new THREE.Vector3(0, deckY, 10), new THREE.Vector3(0, -1, 0)],
      [new THREE.Vector3(-20, 9, 6), new THREE.Vector3(0.6, -0.8, 0)],
    ];
    for (const light of REDUCED_ZONE_LIGHT_POSITIONS) {
      const source = new THREE.Vector3(...light);
      for (const [point, normal] of cases) {
        const incident = bankLineIncident(source, ZONE_LIGHT_INTENSITY, point, normal);
        expect(incident.radiance * Math.max(normal.dot(incident.direction), 0)).toBeCloseTo(
          bankLineIrradiance(source, ZONE_LIGHT_INTENSITY, point, normal),
          6
        );
      }
    }
  });

  it('is zero behind the receiving surface', () => {
    const [x, y, z] = REDUCED_ZONE_LIGHT_POSITIONS[0];
    const floor = new THREE.Vector3(x, 0, z);
    expect(
      bankLineIrradiance(
        new THREE.Vector3(x, y, z),
        ZONE_LIGHT_INTENSITY,
        floor,
        new THREE.Vector3(0, -1, 0)
      )
    ).toBe(0);
  });
});

describe('roof occlusion for the tier with no shadow map', () => {
  it('shades the covered hall and leaves the open site alone', () => {
    expect(roofSunOcclusion(0, 0.1, 0)).toBeLessThan(0.15);
    expect(roofSunOcclusion(-30, 3, 30)).toBeLessThan(0.15);
    expect(roofSunOcclusion(0, 0, 80)).toBe(1);
    expect(roofSunOcclusion(65, 10, 30)).toBe(1);
    expect(roofSunOcclusion(0, SITE_LAYOUT.factory.bounds.maxY + 0.5, 0)).toBe(1);
  });
});

describe('chunk installation', () => {
  it('applies roof occlusion to directional light only when there is no shadow map', () => {
    const begin = patchInteriorLightingBegin(originalBegin);
    const directional = begin.slice(begin.indexOf('#if ( NUM_DIR_LIGHTS > 0 )'));
    expect(directional).toMatch(
      /getDirectionalLightInfo\( directionalLight, directLight \);\s*#ifndef USE_SHADOWMAP\s*directLight\.color \*= millosRoofOcclusion\( geometryPosition \);\s*#endif/
    );
  });

  it('extends the single-line point incident macro after punctual compaction', () => {
    const compact = compactUnshadowedPunctualLoops(cullZeroPunctualContributions(originalBegin));
    const begin = patchInteriorLightingBegin(compact);
    const macro = begin
      .split('\n')
      .find((line) => line.trim().startsWith('#define MILLOS_POINT_INCIDENT()'));
    expect(macro).toContain(
      'millosBankIncident( pointLight, geometryPosition, nonPerturbedNormal, directLight );'
    );
    // Civic shadows re-split on the canonical call; it must still occur once.
    expect(
      begin.split('getPointLightInfo( pointLight, geometryPosition, directLight );')
    ).toHaveLength(2);
  });

  it('also patches the stock assembly when compaction is absent', () => {
    const begin = patchInteriorLightingBegin(originalBegin);
    expect(begin.split('millosBankIncident(')).toHaveLength(2);
    expect(patchInteriorLightingPars(originalPars)).toContain('void millosBankIncident(');
  });

  it('installs once', () => {
    installInteriorLighting();
    const begin = THREE.ShaderChunk.lights_fragment_begin;
    const pars = THREE.ShaderChunk.lights_pars_begin;
    installInteriorLighting();
    expect(THREE.ShaderChunk.lights_fragment_begin).toBe(begin);
    expect(THREE.ShaderChunk.lights_pars_begin).toBe(pars);
  });
});
