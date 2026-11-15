import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  INDOOR_SKY,
  INDOOR_SKY_BANK_GAIN,
  INDOOR_SKY_DEFINE,
  bankDeckPass,
  indoorSkyDeckTop,
  indoorSkyVisibility,
  installInteriorLighting,
  patchIndoorSkyEnd,
} from '../interiorLighting';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import {
  ROOF_DECK_TOP,
  ROOF_HALF_CENTRE,
  ROOF_PITCH,
} from '../../components/infrastructure/OptimizedFactoryInfrastructure';
import {
  ZONE_LIGHT_INTENSITY,
  zoneWorkLightIntensity,
} from '../../components/environment/InteriorLightRig';
import {
  readIndoorSkyOcclusionReport,
  releaseIndoorSkyOcclusion,
  sweepIndoorSkyOcclusion,
} from '../../components/performance/IndoorSkyOcclusion';
import {
  DEFAULT_PERF_DEBUG,
  GRAPHICS_PRESETS,
  sanitizeGraphicsSettings,
  useGraphicsStore,
} from '../../stores/graphicsStore';

const bounds = SITE_LAYOUT.factory.bounds;
const originalEnd = THREE.ShaderChunk.lights_fragment_end;
const originalBegin = THREE.ShaderChunk.lights_fragment_begin;
const originalPars = THREE.ShaderChunk.lights_pars_begin;
afterEach(() => {
  THREE.ShaderChunk.lights_fragment_end = originalEnd;
  THREE.ShaderChunk.lights_fragment_begin = originalBegin;
  THREE.ShaderChunk.lights_pars_begin = originalPars;
  releaseIndoorSkyOcclusion();
});

describe('indoor sky visibility (D-063)', () => {
  it('reaches its floor in the middle of the hall', () => {
    expect(indoorSkyVisibility(0, 1, 0)).toBeCloseTo(INDOOR_SKY.floor, 10);
  });

  it('is exactly 1 on and beyond every wall plane, so no exterior face can change', () => {
    for (const x of [bounds.maxX, bounds.maxX + 0.31, bounds.maxX + 20]) {
      expect(indoorSkyVisibility(x, 3, 0)).toBe(1);
      expect(indoorSkyVisibility(-x, 3, 0)).toBe(1);
    }
    for (const z of [bounds.maxZ, bounds.maxZ + 0.31, bounds.maxZ + 30]) {
      expect(indoorSkyVisibility(0, 3, z)).toBe(1);
      expect(indoorSkyVisibility(0, 3, -z)).toBe(1);
    }
    // The inner face itself, inside the inset, is still fully sky-lit.
    expect(indoorSkyVisibility(bounds.maxX - INDOOR_SKY.inset, 3, 0)).toBe(1);
  });

  it('is exactly 1 on and above the pitched deck, eaves included', () => {
    expect(INDOOR_SKY.deckTop).toBe(ROOF_DECK_TOP);
    expect(INDOOR_SKY.deckHalfCentre).toBe(ROOF_HALF_CENTRE);
    expect(INDOOR_SKY.deckPitch).toBe(ROOF_PITCH);
    for (const x of [0, 10, 25, 35, 38.5]) {
      const top = indoorSkyDeckTop(x);
      // Rooftop plant and skylight kerbs stand on the top face.
      expect(indoorSkyVisibility(x, top, 0)).toBe(1);
      expect(indoorSkyVisibility(-x, top + 0.9, 20)).toBe(1);
    }
    // The eaves sit below the flat underside the sun's roof term uses.
    expect(indoorSkyDeckTop(bounds.maxX)).toBeLessThan(bounds.maxY);
  });

  it('counts the lower face of the deck as indoors', () => {
    const lowerFace = indoorSkyDeckTop(20) - 0.36;
    expect(indoorSkyVisibility(20, lowerFace, 0)).toBeLessThan(0.5);
  });

  it('rises monotonically from the middle to the glazed wall', () => {
    let previous = indoorSkyVisibility(0, 2, 0);
    for (let x = 1; x <= bounds.maxX; x += 1) {
      const value = indoorSkyVisibility(x, 2, 0);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });
});

describe('indoor sky chunk patch', () => {
  it('scales the indirect diffuse before three reads it, behind the define', () => {
    const patched = patchIndoorSkyEnd(originalEnd);
    const term = patched.indexOf('millosIndoorSkyVisibility( geometryPosition )');
    expect(term).toBeGreaterThanOrEqual(0);
    expect(term).toBeLessThan(patched.indexOf('RE_IndirectDiffuse( irradiance,'));
    expect(patched).toContain(
      `#if defined( ${INDOOR_SKY_DEFINE} ) && defined( RE_IndirectDiffuse )`
    );
    // Diffuse only: the sky's specular reflection is a separate experiment.
    expect(patched.slice(0, patched.indexOf('#endif'))).not.toMatch(/(^|[^A-Za-z])radiance \*=/m);
  });

  it('is idempotent and installed with the rest of the interior lighting', () => {
    expect(patchIndoorSkyEnd(patchIndoorSkyEnd(originalEnd))).toBe(patchIndoorSkyEnd(originalEnd));
    installInteriorLighting();
    expect(THREE.ShaderChunk.lights_fragment_end).toBe(patchIndoorSkyEnd(originalEnd));
    expect(THREE.ShaderChunk.lights_pars_begin).toContain('float millosIndoorSkyVisibility(');
  });

  it('refuses a light assembly it does not recognise', () => {
    expect(() => patchIndoorSkyEnd('void main() {}')).toThrow(/indoor sky/);
  });
});

describe('indoor sky banks', () => {
  it('hold one level around the clock while the experiment is on', () => {
    const level = ZONE_LIGHT_INTENSITY * INDOOR_SKY_BANK_GAIN;
    for (const daylight of [0, 0.5, 1, NaN]) {
      expect(zoneWorkLightIntensity(daylight, 'medium', false, true)).toBe(level);
    }
  });

  it('leave the reference banks and the default curve alone', () => {
    expect(zoneWorkLightIntensity(1, 'medium', true, true)).toBe(
      zoneWorkLightIntensity(1, 'medium', true, false)
    );
    expect(zoneWorkLightIntensity(1)).toBe(ZONE_LIGHT_INTENSITY);
  });
});

describe('IndoorSkyOcclusion tagging', () => {
  it('tags lit materials only and restores each one exactly', () => {
    const scene = new THREE.Scene();
    const standard = new THREE.MeshStandardMaterial();
    const lambert = new THREE.MeshLambertMaterial();
    const basic = new THREE.MeshBasicMaterial();
    const standardDefines = { ...standard.defines };
    const geometry = new THREE.BoxGeometry();
    scene.add(
      new THREE.Mesh(geometry, standard),
      new THREE.Mesh(geometry, [lambert, basic]),
      new THREE.Mesh(geometry, standard)
    );

    expect(sweepIndoorSkyOcclusion(scene)).toBe(2);
    expect(readIndoorSkyOcclusionReport().tagged).toBe(2);
    expect(standard.defines?.[INDOOR_SKY_DEFINE]).toBe('');
    expect((lambert as THREE.Material & { defines?: object }).defines).toEqual({
      [INDOOR_SKY_DEFINE]: '',
    });
    expect((basic as THREE.Material & { defines?: object }).defines).toBeUndefined();
    // A second sweep finds nothing new.
    expect(sweepIndoorSkyOcclusion(scene)).toBe(0);

    const versions = [standard.version, lambert.version];
    releaseIndoorSkyOcclusion();
    expect(standard.defines).toEqual(standardDefines);
    expect((lambert as THREE.Material & { defines?: object }).defines).toBeUndefined();
    expect(standard.version).toBeGreaterThan(versions[0]);
    expect(lambert.version).toBeGreaterThan(versions[1]);
    expect(readIndoorSkyOcclusionReport().tagged).toBe(0);
  });
});

describe('the experiment ships off (D-063)', () => {
  it('is off in the defaults, every tier, a fresh store and a save written before it existed', () => {
    expect(DEFAULT_PERF_DEBUG.enableIndoorSkyOcclusion).toBe(false);
    for (const preset of Object.values(GRAPHICS_PRESETS)) {
      expect(preset.perfDebug.enableIndoorSkyOcclusion).toBe(false);
    }
    expect(useGraphicsStore.getState().graphics.perfDebug.enableIndoorSkyOcclusion).toBe(false);
    const olderPerfDebug: Partial<typeof DEFAULT_PERF_DEBUG> = { ...DEFAULT_PERF_DEBUG };
    delete olderPerfDebug.enableIndoorSkyOcclusion;
    const restored = sanitizeGraphicsSettings({
      ...GRAPHICS_PRESETS.medium,
      perfDebug: olderPerfDebug,
    });
    expect(restored.perfDebug.enableIndoorSkyOcclusion).toBe(false);
  });

  it('leaves the banks on the default curve and tags nothing while off', () => {
    expect(zoneWorkLightIntensity(1, 'medium', false)).toBe(
      zoneWorkLightIntensity(1, 'medium', false, false)
    );
    expect(zoneWorkLightIntensity(1, 'medium', false)).not.toBe(
      ZONE_LIGHT_INTENSITY * INDOOR_SKY_BANK_GAIN
    );
    expect(readIndoorSkyOcclusionReport().tagged).toBe(0);
  });
});

describe('bank light stops at the roof deck', () => {
  it('reaches everything under the deck and nothing on it inside the hall', () => {
    for (const x of [0, 12, 30, 38]) {
      const top = indoorSkyDeckTop(x);
      expect(bankDeckPass(x, top, 10)).toBe(0);
      expect(bankDeckPass(x, top + 1.5, -20)).toBe(0);
      expect(bankDeckPass(x, top - 0.36, 10)).toBe(1);
      expect(bankDeckPass(x, 2, 10)).toBe(1);
    }
  });

  it('leaves light through the glazing onto the yard alone', () => {
    expect(bankDeckPass(bounds.maxX + 3, 30, 0)).toBe(1);
    expect(bankDeckPass(0, 30, bounds.maxZ + 3)).toBe(1);
  });
});
