import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  ENVIRONMENT_INTENSITY,
  HEMISPHERE_INTENSITY,
  hemisphereFillIntensity,
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
  it('fades continuously and monotonically through twilight', () => {
    for (let n = 0; n < 100; n++) {
      const a = hemisphereFillIntensity(n / 100);
      const b = hemisphereFillIntensity((n + 1) / 100);
      expect(a).toBeGreaterThanOrEqual(b);
      expect(a - b).toBeLessThan(0.022);
    }
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
