import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  BANK_LINE,
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
    const value = bankLineIrradiance(new THREE.Vector3(x, y, z), ZONE_LIGHT_INTENSITY, deck, down);
    expect(value).toBeGreaterThan(0);
    // A ceiling 4 m from a bare isotropic line would take several times the
    // floor's light; the down-facing optic keeps it to a modest glow.
    expect(value).toBeLessThan(ZONE_LIGHT_INTENSITY * BANK_LINE.uplight * 4.1);
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
      'millosBankIncident( pointLight, geometryPosition, geometryNormal, directLight );'
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
