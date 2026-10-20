import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  ENVIRONMENT_INTENSITY,
  HEMISPHERE_INTENSITY,
  hemisphereFillIntensity,
  daylightHemisphereGain,
  applyGroundBouncePalette,
  METALLIC_ENVMAP_THRESHOLD,
  SUN_DISC_GAIN,
  SUN_DISC_RADIANS,
  adoptEnvironmentMap,
  colorDistanceSquared,
  createEnvironmentSource,
  releaseEnvironmentMap,
  shouldAdoptEnvironmentMap,
  writeEnvironmentBands,
  neutraliseNightFill,
} from './SceneEnvironmentIBL';
import { sampleAtmosphere, sampleCelestial } from '../../simulation/atmosphere';

/** Sample the equirect the way `equirectUv` in three's shader chunk does. */
function sampleEquirect(texture: THREE.DataTexture, direction: THREE.Vector3): THREE.Color {
  const width = texture.image.width;
  const height = texture.image.height;
  const data = texture.image.data as Float32Array;
  const normalized = direction.clone().normalize();
  const u = Math.atan2(normalized.z, normalized.x) / (2 * Math.PI) + 0.5;
  const v = Math.asin(THREE.MathUtils.clamp(normalized.y, -1, 1)) / Math.PI + 0.5;
  const x = Math.min(width - 1, Math.max(0, Math.floor(u * width)));
  const y = Math.min(height - 1, Math.max(0, Math.floor(v * height)));
  const offset = (y * width + x) * 4;
  return new THREE.Color(data[offset], data[offset + 1], data[offset + 2]);
}

const luminance = (color: THREE.Color): number =>
  0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;

describe('createEnvironmentSource', () => {
  it('is a linear float equirect, which is what lets the sun disc exceed 1', () => {
    const texture = createEnvironmentSource();
    expect(texture.mapping).toBe(THREE.EquirectangularReflectionMapping);
    expect(texture.type).toBe(THREE.FloatType);
    // Bytes would clamp the disc to a flat white blob, and an sRGB tag would
    // decode the already-linear THREE.Color channels a second time.
    expect(texture.colorSpace).toBe(THREE.LinearSRGBColorSpace);
    expect(texture.image.data).toBeInstanceOf(Float32Array);
    texture.dispose();
  });
});

describe('writeEnvironmentBands', () => {
  const top = new THREE.Color('#79bce6');
  const horizon = new THREE.Color('#b9dce7');
  const ground = new THREE.Color('#6f806c');

  it('places the zenith, horizon and nadir bands on the right latitudes', () => {
    const texture = createEnvironmentSource();
    const sun = new THREE.Vector3(0, -1, 0); // parked below, out of the way
    writeEnvironmentBands(texture, top, horizon, ground, sun, new THREE.Color(0, 0, 0));

    const zenith = sampleEquirect(texture, new THREE.Vector3(0, 1, 0));
    const level = sampleEquirect(texture, new THREE.Vector3(1, 0, 0));
    const nadir = sampleEquirect(texture, new THREE.Vector3(0.001, -1, 0));

    expect(colorDistanceSquared(zenith, top)).toBeLessThan(1e-4);
    expect(colorDistanceSquared(level, horizon)).toBeLessThan(1e-3);
    expect(colorDistanceSquared(nadir, ground)).toBeLessThan(1e-4);
    texture.dispose();
  });

  it('stamps a disc above the display ceiling at the sun, and nowhere else', () => {
    const texture = createEnvironmentSource();
    const sun = new THREE.Vector3(0.5, 0.7, -0.2).normalize();
    const disc = top.clone().multiplyScalar(SUN_DISC_GAIN);
    writeEnvironmentBands(texture, top, horizon, ground, sun, disc);

    const onSun = sampleEquirect(texture, sun);
    expect(luminance(onSun)).toBeGreaterThan(1);

    // Well outside the disc the band is untouched, so the environment does not
    // turn into one bright wash.
    const away = new THREE.Vector3(-0.5, 0.7, 0.2).normalize();
    const offSun = sampleEquirect(texture, away);
    expect(luminance(offSun)).toBeLessThan(1);
    expect(luminance(offSun)).toBeLessThan(luminance(onSun) / 3);
    texture.dispose();
  });

  it('keeps the disc small enough to read as a sun rather than a sky', () => {
    const sun = new THREE.Vector3(0, 0.6, 1).normalize();

    // Differenced against the same bands with no disc, because the bands
    // themselves span a wide range of values and a fixed brightness threshold
    // would just be counting the horizon.
    const baseline = createEnvironmentSource();
    writeEnvironmentBands(baseline, top, horizon, ground, sun, new THREE.Color(0, 0, 0));
    const lit = createEnvironmentSource();
    writeEnvironmentBands(
      lit,
      top,
      horizon,
      ground,
      sun,
      top.clone().multiplyScalar(SUN_DISC_GAIN)
    );

    const flat = baseline.image.data as Float32Array;
    const data = lit.image.data as Float32Array;
    let brightened = 0;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index] > flat[index] + 1e-4) brightened += 1;
    }
    const total = lit.image.width * lit.image.height;
    // A 6 degree cap is a fraction of a percent of the sphere. The equirect
    // grid rounds that up near the equator, but the covered FRACTION is a solid
    // angle and so stays put as the source resolution changes.
    expect(brightened).toBeGreaterThan(0);
    expect(brightened / total).toBeLessThan(0.05);
    expect(SUN_DISC_RADIANS).toBeLessThan(0.2);
    baseline.dispose();
    lit.dispose();
  });

  it('writes only finite, non-negative samples across a full simulated day', () => {
    const texture = createEnvironmentSource();
    const offenders: string[] = [];
    for (let hour = 0; hour < 24; hour += 1) {
      const celestial = sampleCelestial(sampleAtmosphere(0, hour, 'clear'));
      const sun = new THREE.Vector3().fromArray(celestial.sunDirection);
      writeEnvironmentBands(
        texture,
        top,
        horizon,
        ground,
        sun,
        top.clone().multiplyScalar(SUN_DISC_GAIN * (celestial.sunLightIntensity / 3.1))
      );
      const data = texture.image.data as Float32Array;
      for (let index = 0; index < data.length; index += 1) {
        if (!Number.isFinite(data[index]) || data[index] < 0) {
          offenders.push(`hour ${hour} index ${index} = ${data[index]}`);
          break;
        }
      }
    }
    expect(offenders).toEqual([]);
    texture.dispose();
  });
});

describe('fill budget', () => {
  it('keeps the environment on the fill side of the key/fill ratio', () => {
    // `getIBLIrradiance` returns PI * radiance * environmentIntensity. With a
    // daytime sky radiance around 0.35 linear that is roughly 0.33, which has
    // to stay small against the 3.10 key or the IBL undoes the whole point of
    // cutting the ambient term.
    const skyRadiance = 0.35;
    const iblIrradiance = Math.PI * skyRadiance * ENVIRONMENT_INTENSITY;
    const noon = sampleCelestial(sampleAtmosphere(0, 12, 'clear'));
    const fill = noon.ambientLightIntensity + HEMISPHERE_INTENSITY + iblIrradiance;

    expect(iblIrradiance).toBeLessThan(0.4);
    expect(noon.sunLightIntensity / fill).toBeGreaterThan(3.5);
  });

  it('keeps an ADOPTED metal inside the same budget', () => {
    // Extends the assertion above rather than replacing it. Materials at or
    // above METALLIC_ENVMAP_THRESHOLD take the environment at their own
    // envMapIntensity instead of ENVIRONMENT_INTENSITY, so the fill they can
    // contribute is `PI * radiance * envMapIntensity * (1 - metalness)` - the
    // diffuse colour a standard material derives from metalness is what makes
    // the threshold self-limiting. Worst case is a material sitting exactly on
    // the threshold at the physical intensity of 1.0.
    const skyRadiance = 0.35;
    const worstCase = Math.PI * skyRadiance * 1 * (1 - METALLIC_ENVMAP_THRESHOLD);
    const noon = sampleCelestial(sampleAtmosphere(0, 12, 'clear'));
    const fill = noon.ambientLightIntensity + HEMISPHERE_INTENSITY + worstCase;

    expect(noon.sunLightIntensity / fill).toBeGreaterThan(3.5);
    // And the threshold is not quietly loosened to a value that breaks it.
    expect(METALLIC_ENVMAP_THRESHOLD).toBeGreaterThanOrEqual(0.6);
  });
});

describe('shouldAdoptEnvironmentMap', () => {
  it('takes metals and leaves dielectrics on the scene dampener', () => {
    // Real values from the repo: chrome, steel, painted metal, then the control
    // and vehicle materials that authored an envMapIntensity at metalness 0.
    expect(shouldAdoptEnvironmentMap(new THREE.MeshStandardMaterial({ metalness: 0.95 }))).toBe(
      true
    );
    expect(shouldAdoptEnvironmentMap(new THREE.MeshStandardMaterial({ metalness: 0.85 }))).toBe(
      true
    );
    expect(shouldAdoptEnvironmentMap(new THREE.MeshPhysicalMaterial({ metalness: 0.6 }))).toBe(
      true
    );

    // 0.5 is the repo's most common unauthored default, not a metal.
    expect(shouldAdoptEnvironmentMap(new THREE.MeshStandardMaterial({ metalness: 0.5 }))).toBe(
      false
    );
    expect(
      shouldAdoptEnvironmentMap(
        new THREE.MeshPhysicalMaterial({ metalness: 0, envMapIntensity: 2.4 })
      )
    ).toBe(false);
  });

  it('ignores materials with no metallic BRDF at all', () => {
    expect(shouldAdoptEnvironmentMap(new THREE.MeshBasicMaterial())).toBe(false);
    expect(shouldAdoptEnvironmentMap(new THREE.PointsMaterial())).toBe(false);
    expect(shouldAdoptEnvironmentMap(new THREE.MeshPhongMaterial())).toBe(false);
  });
});

describe('adoptEnvironmentMap / releaseEnvironmentMap', () => {
  const buildScene = () => {
    const root = new THREE.Group();
    const geometry = new THREE.BufferGeometry();
    const steel = new THREE.MeshStandardMaterial({ metalness: 0.85, envMapIntensity: 1.2 });
    const concrete = new THREE.MeshStandardMaterial({ metalness: 0.1 });
    const cloth = new THREE.MeshPhysicalMaterial({ metalness: 0, envMapIntensity: 1.8 });
    const chrome = new THREE.MeshStandardMaterial({ metalness: 0.95 });

    const nested = new THREE.Group();
    nested.add(new THREE.Mesh(geometry, chrome));
    root.add(new THREE.Mesh(geometry, steel));
    root.add(new THREE.Mesh(geometry, concrete));
    // Multi-material mesh: the visitor has to walk the array.
    root.add(new THREE.Mesh(geometry, [cloth, chrome]));
    root.add(nested);

    return { root, geometry, steel, concrete, cloth, chrome };
  };

  it('gives the environment only to metals, once', () => {
    const { root, geometry, steel, concrete, cloth, chrome } = buildScene();
    const texture = new THREE.Texture();

    // steel + chrome; chrome appears twice but is one material object.
    expect(adoptEnvironmentMap(root, texture)).toBe(2);
    expect(steel.envMap).toBe(texture);
    expect(chrome.envMap).toBe(texture);
    // Left alone, so the fill budget for everything non-metallic is untouched
    // and the dead envMapIntensity on dielectrics stays dead.
    expect(concrete.envMap).toBeNull();
    expect(cloth.envMap).toBeNull();

    // Idempotent: nothing to do on a second pass, which is what makes the
    // 500 ms re-walk for newly mounted materials cheap.
    expect(adoptEnvironmentMap(root, texture)).toBe(0);

    texture.dispose();
    geometry.dispose();
  });

  it('picks up materials that mount after the first pass', () => {
    const { root, geometry, chrome } = buildScene();
    const texture = new THREE.Texture();
    adoptEnvironmentMap(root, texture);

    const latecomer = new THREE.MeshStandardMaterial({ metalness: 0.8 });
    root.add(new THREE.Mesh(geometry, latecomer));

    expect(adoptEnvironmentMap(root, texture)).toBe(1);
    expect(latecomer.envMap).toBe(texture);
    expect(chrome.envMap).toBe(texture);

    texture.dispose();
    geometry.dispose();
  });

  it('releases by identity so nothing holds a disposed target', () => {
    const { root, geometry, steel, chrome } = buildScene();
    const texture = new THREE.Texture();
    const foreign = new THREE.Texture();
    adoptEnvironmentMap(root, texture);

    // A material someone else pointed elsewhere is not ours to clear, and a
    // metalness changed after adoption must still let go.
    const other = new THREE.MeshStandardMaterial({ metalness: 0.9 });
    other.envMap = foreign;
    root.add(new THREE.Mesh(geometry, other));
    steel.metalness = 0.1;

    expect(releaseEnvironmentMap(root, texture)).toBe(2);
    expect(steel.envMap).toBeNull();
    expect(chrome.envMap).toBeNull();
    expect(other.envMap).toBe(foreign);

    texture.dispose();
    foreign.dispose();
    geometry.dispose();
  });
});

describe('night silhouette fill', () => {
  it('preserves daytime fill and caps the night lift', () => {
    expect(hemisphereFillIntensity(1)).toBe(HEMISPHERE_INTENSITY);
    expect(hemisphereFillIntensity(2)).toBe(HEMISPHERE_INTENSITY);
    expect(hemisphereFillIntensity(0)).toBeCloseTo(1.6);
    expect(hemisphereFillIntensity(-1)).toBeCloseTo(1.6);
  });
  it('keeps the twilight shoulder continuous and bounded', () => {
    for (let n = 0; n < 100; n++) {
      const a = hemisphereFillIntensity(n / 100);
      const b = hemisphereFillIntensity((n + 1) / 100);
      expect(a).toBeGreaterThanOrEqual(HEMISPHERE_INTENSITY);
      expect(a).toBeLessThan(2.9);
      expect(Math.abs(a - b)).toBeLessThan(0.065);
    }
  });
  it('supports civil-twilight shade without changing either endpoint', () => {
    const dusk = sampleAtmosphere(0, 18.5, 'clear').daylight;
    const previous = HEMISPHERE_INTENSITY + 1.38 * (1 - dusk * dusk * (3 - 2 * dusk));
    expect(hemisphereFillIntensity(dusk)).toBeGreaterThan(previous * 1.5);
    expect(hemisphereFillIntensity(dusk)).toBeLessThan(2.9);
    expect(hemisphereFillIntensity(sampleAtmosphere(0, 12, 'clear').daylight)).toBe(
      HEMISPHERE_INTENSITY
    );
    expect(hemisphereFillIntensity(sampleAtmosphere(0, 22, 'clear').daylight)).toBeCloseTo(1.6);
  });
});

describe('shared masonry and earth bounce', () => {
  it('warms grass-only daylight bounce while preserving energy and night colours', () => {
    const source = new THREE.Color('#6f806c');
    const original = source.clone();
    const luminance = (c: THREE.Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    for (const daylight of [0, 0.25, 0.5, 0.75, 1]) {
      const result = applyGroundBouncePalette(new THREE.Color(), source, daylight);
      expect(luminance(result)).toBeCloseTo(luminance(source), 12);
      if (daylight > 0) expect(result.r / result.g).toBeGreaterThan(source.r / source.g);
    }
    expect(source.equals(original)).toBe(true);
    expect(applyGroundBouncePalette(new THREE.Color(), source, 0).equals(source)).toBe(true);
  });
});

describe('daylight hemisphere energy', () => {
  it('keeps twilight, night and invalid samples exactly unchanged', () => {
    for (const daylight of [-100, 0, 0.25, 0.5, 0.85, NaN, Infinity, -Infinity]) {
      expect(daylightHemisphereGain(daylight)).toBe(1);
    }
    for (const hour of [0, 5.5, 6, 18, 18.25, 18.5, 22]) {
      expect(daylightHemisphereGain(sampleAtmosphere(0, hour, 'clear').daylight)).toBe(1);
    }
    expect(daylightHemisphereGain(100)).toBe(daylightHemisphereGain(1));
  });

  it('bounds clear-noon directional luminance by the existing hemisphere budget', () => {
    const sky = new THREE.Color('#a3cce2');
    const ground = applyGroundBouncePalette(new THREE.Color(), new THREE.Color('#6f806c'), 1);
    const gain = daylightHemisphereGain(sampleAtmosphere(0, 12, 'clear').daylight);
    const oldVertical = HEMISPHERE_INTENSITY * (luminance(sky) + luminance(ground)) * 0.5;
    sky.multiplyScalar(gain);
    ground.multiplyScalar(gain);
    expect(luminance(sky) * HEMISPHERE_INTENSITY).toBeCloseTo(HEMISPHERE_INTENSITY, 12);
    expect(luminance(ground)).toBeLessThan(luminance(sky));
    // Three's hemisphere equation is mix(ground, sky, normal.y * 0.5 + 0.5).
    for (let normalY = -1; normalY <= 1; normalY += 0.05) {
      const irradiance = ground.clone().lerp(sky, normalY * 0.5 + 0.5);
      expect(luminance(irradiance) * HEMISPHERE_INTENSITY).toBeLessThanOrEqual(
        HEMISPHERE_INTENSITY + 1e-12
      );
    }
    const newVertical = HEMISPHERE_INTENSITY * (luminance(sky) + luminance(ground)) * 0.5;
    expect(newVertical).toBeCloseTo(oldVertical * gain, 12);
    expect(newVertical).toBeLessThan(HEMISPHERE_INTENSITY);
    expect(gain).toBeGreaterThan(1.7);
    expect(gain).toBeLessThan(1.8);
  });

  it('preserves sky/ground chromaticity and relative storm attenuation', () => {
    const sky = new THREE.Color('#a3cce2');
    const ground = applyGroundBouncePalette(new THREE.Color(), new THREE.Color('#6f806c'), 1);
    const ratio = luminance(ground) / luminance(sky);
    const gain = daylightHemisphereGain(1);
    for (const weatherAttenuation of [1, 0.7, 0.4]) {
      const litSky = sky.clone().multiplyScalar(weatherAttenuation * gain);
      const litGround = ground.clone().multiplyScalar(weatherAttenuation * gain);
      expect(luminance(litSky)).toBeCloseTo(weatherAttenuation, 12);
      expect(luminance(litGround) / luminance(litSky)).toBeCloseTo(ratio, 12);
      for (const [source, lit] of [
        [sky, litSky],
        [ground, litGround],
      ]) {
        expect(lit.r / lit.g).toBeCloseTo(source.r / source.g, 12);
        expect(lit.b / lit.g).toBeCloseTo(source.b / source.g, 12);
      }
    }
  });

  it('enters full daylight monotonically with smooth, finite endpoints', () => {
    let previous = 1;
    for (let step = 0; step <= 100; step += 1) {
      const gain = daylightHemisphereGain(0.85 + (0.15 * step) / 100);
      expect(Number.isFinite(gain)).toBe(true);
      expect(gain).toBeGreaterThanOrEqual(previous);
      expect(gain).toBeLessThanOrEqual(daylightHemisphereGain(1));
      previous = gain;
    }
    const epsilon = 1e-5;
    expect((daylightHemisphereGain(0.85 + epsilon) - 1) / epsilon).toBeLessThan(0.002);
    expect(
      (daylightHemisphereGain(1) - daylightHemisphereGain(1 - epsilon)) / epsilon
    ).toBeLessThan(0.002);
  });
});

describe('night fill colour', () => {
  const chroma = (c: THREE.Color) => Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);

  it('leaves dawn, noon and dusk exactly unchanged', () => {
    for (const hour of [6, 12, 18]) {
      const colour = new THREE.Color('#e8a66d');
      const before = colour.clone();
      neutraliseNightFill(colour, sampleAtmosphere(0, hour, 'clear').daylight);
      expect(colour.equals(before), String(hour)).toBe(true);
    }
  });

  it('takes the saturated blue out of the 1.6 night lift while keeping its luminance', () => {
    // The night hemisphere (#384a64 at 1.6) is unoccluded, so it lit the hall's
    // steel deep blue under the work lights and drove the red channel of a blue
    // box in the yard to zero.
    const luminance = (c: THREE.Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    const night = new THREE.Color('#384a64');
    const before = night.clone();
    neutraliseNightFill(night, sampleAtmosphere(0, 22, 'clear').daylight);
    expect(chroma(night)).toBeLessThan(chroma(before) * 0.55);
    expect(night.b).toBeGreaterThan(night.r);
    expect(luminance(night)).toBeCloseTo(luminance(before), 6);
  });
});

describe('sunrise shadow contrast', () => {
  it('trims the twilight shoulder only while the sun is up', () => {
    const daylight = sampleAtmosphere(0, 6, 'clear').daylight;
    expect(hemisphereFillIntensity(daylight, 1)).toBeLessThan(
      hemisphereFillIntensity(daylight) * 0.8
    );
    expect(hemisphereFillIntensity(daylight, 0)).toBe(hemisphereFillIntensity(daylight));
    expect(hemisphereFillIntensity(1, 1)).toBe(HEMISPHERE_INTENSITY);
    expect(hemisphereFillIntensity(0, 0)).toBeCloseTo(1.6);
  });
});

describe('twilight fill colour', () => {
  const chroma = (c: THREE.Color) => Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
  const luminance = (c: THREE.Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

  it('greys the mauve horizon fill at 18:30 toward a warm neutral, keeping its luminance', async () => {
    // Measured live at 18:30: hemisphere sky #a5908f at 2.23 carried 56% of
    // the yard tarmac's light and tinted it violet (78.7, 59.7, 52.7).
    const { neutraliseTwilightFill } = await import('./SceneEnvironmentIBL');
    const fill = new THREE.Color('#a5908f');
    const before = fill.clone();
    neutraliseTwilightFill(fill, sampleAtmosphere(0, 18.5, 'clear').solarElevation);
    expect(chroma(fill)).toBeLessThan(chroma(before) * 0.5);
    expect(luminance(fill)).toBeCloseTo(luminance(before), 6);
    // Warm neutral: red at least green, green above blue.
    expect(fill.r).toBeGreaterThanOrEqual(fill.g);
    expect(fill.g).toBeGreaterThan(fill.b);
  });

  it('leaves noon and deep night exactly as they were', async () => {
    const { neutraliseTwilightFill } = await import('./SceneEnvironmentIBL');
    for (const hour of [12, 22]) {
      const fill = new THREE.Color('#a5908f');
      neutraliseTwilightFill(fill, sampleAtmosphere(0, hour, 'clear').solarElevation);
      expect(fill.getHexString()).toBe('a5908f');
    }
  });

  it('is applied to the hemisphere fill in the frame update', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync('src/components/environment/SceneEnvironmentIBL.tsx', 'utf8');
    expect(source).toMatch(
      /neutraliseTwilightFill\(hemisphere\.color, atmosphere\.solarElevation\)/
    );
  });
});
