import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  MOUNTAIN_RIDGE_SEGMENTS,
  MOUNTAIN_RIDGE_ROWS,
  FAR_MOUNTAIN_SPEC,
  createMountainRidgeGeometry,
  getSkyTwilightWeight,
  getSkyBlueHourWeight,
  getSkyAfterglowWeight,
  getSkyWarmHorizonWeight,
  applySkyAmbientPalette,
  celestialKeyDirection,
  getRidgeAerialWeight,
  blendSkyOvercast,
  overcastShadowRadius,
  OVERCAST_SKY,
  MOUNTAIN_RIDGE_GEOMETRIES,
  CELESTIAL_RADIUS,
  createRidgeMaterial,
  RIDGE_CANOPY_PROFILE,
  RIDGE_ALPINE_PROFILE,
  RIDGE_FIELD_PROFILE,
  getRidgeFieldDaylight,
  getRidgeFieldTone,
  getRidgeClearAir,
  getAnchoredRidgeAerial,
  RIDGE_ANCHORED_AERIAL,
  RIDGE_ANCHORED_AERIAL_SPAN,
  RIDGE_BEHIND_RANGE_SINK,
  getRidgeBehindRangeSink,
} from './OptimizedSkySystem';
import { LANDSCAPE_GROVE_TREES } from '../exterior/ExteriorVegetation';
import { sampleValleyGroundHeight } from '../terrain/splatMapGenerator';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import { CAMERA_DEPTH } from '../../constants/renderLayers';

import { sampleAtmosphere, sampleCelestial } from '../../simulation/atmosphere';

describe('rendered horizon ambient handoff', () => {
  it('keeps cloud afterglow bounded, continuous and absent at noon and deep night', () => {
    expect(getSkyAfterglowWeight(1, 0)).toBe(0);
    expect(getSkyAfterglowWeight(-1, 0)).toBe(0);
    expect(getSkyAfterglowWeight(-0.13, 0.93)).toBeGreaterThan(0.6);
    let previous = getSkyAfterglowWeight(
      sampleAtmosphere(1, 16, 'clear').solarElevation,
      sampleAtmosphere(1, 16, 'clear').twilight
    );
    for (let minute = 16 * 60 + 1; minute <= 21 * 60; minute++) {
      const a = sampleAtmosphere(1, minute / 60, 'clear'),
        value = getSkyAfterglowWeight(a.solarElevation, a.twilight);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(0.72);
      expect(Math.abs(value - previous)).toBeLessThan(0.025);
      previous = value;
    }
  });
  it('copies daylight, blue-hour, warm twilight and night without mutating the sky', () => {
    for (const hex of ['#a3cce2', '#7186ad', '#c09984', '#384a64']) {
      const horizon = new THREE.Color(hex);
      const original = horizon.clone();
      const ambient = new THREE.Color('#384a64');
      expect(applySkyAmbientPalette(ambient, horizon)).toBe(ambient);
      expect(ambient.equals(original)).toBe(true);
      expect(horizon.equals(original)).toBe(true);
    }
  });

  it('gives the ambient a daylight fill neutralised like the hemisphere, sky untouched', () => {
    // The ambient colour is also what the hemisphere sky and the IBL horizon
    // band read, so this one call decides the fill colour indoors and out.
    const horizon = new THREE.Color('#a3cce2');
    const noon = sampleAtmosphere(1, 12, 'clear').daylight;
    const ambient = applySkyAmbientPalette(new THREE.Color(), horizon, noon);
    expect(horizon.equals(new THREE.Color('#a3cce2'))).toBe(true);
    expect(ambient.b / ambient.r).toBeLessThan((horizon.b / horizon.r) * 0.75);
    expect(ambient.b).toBeGreaterThan(ambient.r);
  });

  it('retains twilight colour that a second day/night blend would erase', () => {
    const oldBlend = new THREE.Color('#384a64').lerp(new THREE.Color('#a3cce2'), 0.23);
    const renderedHorizon = new THREE.Color('#c09984');
    const ambient = applySkyAmbientPalette(new THREE.Color(), renderedHorizon);
    expect(ambient.equals(oldBlend)).toBe(false);
    expect(ambient.r / ambient.b).toBeGreaterThan(oldBlend.r / oldBlend.b);
  });
});

describe('mountain ridge geometry', () => {
  it('fits the whole site, backdrop and celestial silhouettes in the normal depth range', () => {
    let nearest = Infinity;
    let farthest = 0;
    for (const [ring, geometry] of MOUNTAIN_RIDGE_GEOMETRIES.entries()) {
      const positions = geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i),
          y = positions.getY(i),
          z = positions.getZ(i);
        if (ring === 0) nearest = Math.min(nearest, Math.hypot(x, z));
        else expect(Math.hypot(x, z)).toBeGreaterThan(SITE_LAYOUT.world.radius + 8);
        farthest = Math.max(farthest, Math.hypot(x, y, z));
      }
    }
    expect(nearest).toBeGreaterThan(SITE_LAYOUT.world.radius * 2 + 5);
    expect(farthest).toBeLessThan(CELESTIAL_RADIUS - 3);
    expect(CELESTIAL_RADIUS + 7.4 * (CELESTIAL_RADIUS / 345)).toBeLessThan(CAMERA_DEPTH.far);
  });

  it('keeps the backdrop behind grounded woodland from both overview sides', () => {
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const meshes = MOUNTAIN_RIDGE_GEOMETRIES.map((geometry) => new THREE.Mesh(geometry, material));
    const occluded: string[] = [];
    for (const camera of [SITE_LAYOUT.cameras.overview.position, [-80, 32, 118]] as const) {
      const eye = new THREE.Vector3(...camera);
      for (const [ring, mesh] of meshes.entries()) {
        mesh.position.set(ring === 0 ? camera[0] : 0, 0, ring === 0 ? camera[2] : 0);
        mesh.updateMatrixWorld();
      }
      for (const {
        position: [x, , z],
      } of LANDSCAPE_GROVE_TREES) {
        const foot = new THREE.Vector3(x, sampleValleyGroundHeight(x, z, 128) + 0.1, z);
        const distance = foot.distanceTo(eye);
        const ray = new THREE.Raycaster(eye, foot.sub(eye).normalize(), 0, distance - 0.01);
        if (ray.intersectObjects(meshes).length) occluded.push(`${camera[0]}: ${x}, ${z}`);
      }
    }
    material.dispose();
    expect(occluded).toEqual([]);
  });

  it('closes the sky gap below the remote ridge for a downward view', () => {
    // First reproduced from a raised village camera: a view angled below the
    // ridge foot passed under the open ribbon and showed sky. Stated
    // geometrically, since the camera-locked ring does not depend on the pose.
    const camera = new THREE.PerspectiveCamera(50, 1672 / 941, CAMERA_DEPTH.near, CAMERA_DEPTH.far);
    camera.position.set(0, 52, 0);
    camera.updateMatrixWorld();
    const ray = new THREE.Raycaster(
      camera.position.clone(),
      new THREE.Vector3(FAR_MOUNTAIN_SPEC.radius * 0.9, -60 - 52, 0).normalize()
    );
    const material = new THREE.MeshBasicMaterial();
    const open = createMountainRidgeGeometry({ ...FAR_MOUNTAIN_SPEC, baseClosureY: undefined });
    const closed = MOUNTAIN_RIDGE_GEOMETRIES[0];
    const meshes = [open, closed].map((geometry) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.updateMatrixWorld();
      return mesh;
    });
    expect(ray.intersectObject(meshes[0])).toHaveLength(0);
    const hits = ray.intersectObject(meshes[1]);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].distance).toBeLessThan(CAMERA_DEPTH.far);
    expect(closed.attributes.position.count).toBe(open.attributes.position.count);
    expect(closed.index!.count / 3).toBeLessThan(13_000);
    open.dispose();
    material.dispose();
  });

  it('gives the site-anchored foothills broad slopes rather than a narrow wall', () => {
    for (const geometry of MOUNTAIN_RIDGE_GEOMETRIES.slice(1)) {
      const positions = geometry.getAttribute('position');
      const rows = positions.count / (MOUNTAIN_RIDGE_SEGMENTS + 1);
      for (let column = 0; column < MOUNTAIN_RIDGE_SEGMENTS; column++) {
        const foot = column * rows;
        const peak = foot + MOUNTAIN_RIDGE_ROWS - 1;
        const run =
          Math.hypot(positions.getX(peak), positions.getZ(peak)) -
          Math.hypot(positions.getX(foot), positions.getZ(foot));
        expect(run).toBeGreaterThan(100);
        expect((positions.getY(peak) - positions.getY(foot)) / run).toBeLessThan(0.8);
      }
    }
  });

  it('keeps the nearest foothill summits subordinate to the grain elevator', () => {
    const positions = MOUNTAIN_RIDGE_GEOMETRIES[2].getAttribute('position');
    const rows = positions.count / (MOUNTAIN_RIDGE_SEGMENTS + 1);
    const summits = Array.from({ length: MOUNTAIN_RIDGE_SEGMENTS }, (_, index) =>
      positions.getY(index * rows + MOUNTAIN_RIDGE_ROWS - 1)
    );
    expect(Math.max(...summits)).toBeLessThan(40);
    expect(SITE_LAYOUT.bulkStorage.elevator.height).toBeGreaterThan(40);
  });

  it('creates a finite, closed slope with radial depth', () => {
    const geometry = createMountainRidgeGeometry({
      radius: 260,
      baseY: -16,
      minHeight: 20,
      maxHeight: 42,
      slopeDepth: 16,
      valleyFloor: 0.08,
      snowLine: 0.7,
      seed: 1.2,
      colors: ['#31483d', '#70817d', '#dce4e4'],
    });
    const positions = geometry.getAttribute('position');
    const rows = MOUNTAIN_RIDGE_ROWS;
    const finalSegmentOffset = MOUNTAIN_RIDGE_SEGMENTS * rows;

    for (let index = 0; index < positions.array.length; index += 1) {
      expect(Number.isFinite(positions.array[index])).toBe(true);
    }
    for (let row = 0; row < rows; row += 1) {
      expect(positions.getX(row)).toBeCloseTo(positions.getX(finalSegmentOffset + row), 5);
      expect(positions.getY(row)).toBeCloseTo(positions.getY(finalSegmentOffset + row), 5);
      expect(positions.getZ(row)).toBeCloseTo(positions.getZ(finalSegmentOffset + row), 5);
    }

    const baseRadius = Math.hypot(positions.getX(0), positions.getZ(0));
    const peakRadius = Math.hypot(positions.getX(rows - 1), positions.getZ(rows - 1));
    expect(peakRadius - baseRadius).toBeGreaterThan(12);
    expect(Number.isFinite(geometry.boundingSphere?.radius)).toBe(true);

    geometry.dispose();
  });

  it('carries true-albedo vertex colour and a normalised ridge height', () => {
    // THE DEFECT THIS GUARDS. The three palettes used to have aerial
    // perspective painted into them, which is why the far ring read as a flat
    // grey cut-out under any lighting. The material applies extinction per
    // channel at runtime now, so the geometry must ship albedo and a height
    // term and nothing else - double-applying haze is the failure mode.
    const geometry = createMountainRidgeGeometry({
      radius: 300,
      baseY: -17,
      minHeight: 4,
      maxHeight: 76,
      slopeDepth: 18,
      valleyFloor: 0.3,
      snowLine: 0.63,
      seed: 0.37,
      colors: ['#42574c', '#717a76', '#e9eff2'],
    });

    const heights = geometry.getAttribute('ridgeHeight');
    const positions = geometry.getAttribute('position');
    expect(heights.itemSize).toBe(1);
    expect(heights.count).toBe(positions.count);

    let minimum = Infinity;
    let maximum = -Infinity;
    for (let index = 0; index < heights.count; index += 1) {
      const value = heights.getX(index);
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
      if (value < minimum) minimum = value;
      if (value > maximum) maximum = value;
    }
    // Needs real spread or the valley-haze term does nothing.
    expect(maximum - minimum).toBeGreaterThan(0.4);

    // Normals must be meaningful: the material is lit now, and an unlit ring is
    // exactly the flat cut-out this work exists to remove.
    const normals = geometry.getAttribute('normal');
    expect(normals).toBeDefined();
    let nonVertical = 0;
    for (let index = 0; index < normals.count; index += 1) {
      const length = Math.hypot(normals.getX(index), normals.getY(index), normals.getZ(index));
      expect(length).toBeCloseTo(1, 3);
      if (Math.abs(normals.getY(index)) < 0.98) nonVertical += 1;
    }
    expect(nonVertical).toBeGreaterThan(normals.count * 0.5);

    geometry.dispose();
  });

  it('keeps the far occluder above the world seam without clipped tabletop summits', () => {
    const { baseY, minHeight, maxHeight, valleyFloor } = FAR_MOUNTAIN_SPEC;
    const geometry = createMountainRidgeGeometry(FAR_MOUNTAIN_SPEC);
    const positions = geometry.getAttribute('position');
    const summits = Array.from({ length: MOUNTAIN_RIDGE_SEGMENTS }, (_, index) =>
      positions.getY(index * MOUNTAIN_RIDGE_ROWS + MOUNTAIN_RIDGE_ROWS - 1)
    );
    const minimumOcclusion = baseY + minHeight + (maxHeight - minHeight) * valleyFloor;
    expect(Math.min(...summits)).toBeGreaterThanOrEqual(minimumOcclusion);
    expect(Math.min(...summits)).toBeGreaterThan(20);
    expect(Math.max(...summits)).toBeLessThan(baseY + maxHeight);
    expect(Math.max(...summits) - Math.min(...summits)).toBeGreaterThan(20);
    // The old clamp repeated exactly the same altitude across whole massifs.
    // Ignore the duplicated closing vertex, which is intentional.
    const flatEdges = summits.filter(
      (height, index) => Math.abs(height - summits[(index + 1) % summits.length]) < 0.0001
    );
    expect(flatEdges).toHaveLength(0);
    geometry.dispose();
  });

  it('keeps the remote valley low and broad enough to avoid a continuous cliff wall', () => {
    const positions = MOUNTAIN_RIDGE_GEOMETRIES[0].getAttribute('position');
    const summits = Array.from({ length: MOUNTAIN_RIDGE_SEGMENTS }, (_, i) =>
      positions.getY(i * MOUNTAIN_RIDGE_ROWS + MOUNTAIN_RIDGE_ROWS - 1)
    );
    expect(Math.min(...summits)).toBeLessThan(30);
    expect(FAR_MOUNTAIN_SPEC.slopeDepth).toBeGreaterThanOrEqual(50);
  });

  it('resolves the summit finely enough to hide facet chords', () => {
    // 192 segments put a facet edge every 1.875 degrees, plainly visible as
    // straight chords along a summit at a ring radius of 280-325.
    expect(MOUNTAIN_RIDGE_SEGMENTS).toBeGreaterThanOrEqual(384);
  });
});

describe('sky twilight colour', () => {
  const weightAt = (hour: number) => {
    const atmosphere = sampleAtmosphere(1, hour, 'clear');
    return getSkyTwilightWeight(atmosphere.solarElevation, atmosphere.twilight);
  };
  it('keeps a high afternoon sun in the blue-sky palette', () => {
    expect(weightAt(16)).toBeLessThan(0.01);
    expect(weightAt(8)).toBeLessThan(0.01);
  });
  it('retains warm dawn/dusk and removes the tint by midnight', () => {
    expect(weightAt(6)).toBeGreaterThan(0.6);
    expect(weightAt(18)).toBeGreaterThan(0.6);
    expect(weightAt(0)).toBeLessThan(0.001);
    expect(weightAt(12)).toBeLessThan(0.001);
  });

  it('makes post-sunset cloud fill blue while the warm horizon recedes', () => {
    const at = (hour: number) => sampleAtmosphere(1, hour, 'cloudy');
    const sunset = at(18),
      blueHour = at(18.55),
      midnight = at(0),
      noon = at(12);
    expect(getSkyBlueHourWeight(blueHour.solarElevation, blueHour.twilight)).toBeGreaterThan(0.5);
    expect(getSkyWarmHorizonWeight(blueHour.solarElevation, blueHour.twilight)).toBeLessThan(0.4);
    expect(getSkyWarmHorizonWeight(sunset.solarElevation, sunset.twilight)).toBeGreaterThan(0.6);
    for (const state of [midnight, noon]) {
      expect(getSkyBlueHourWeight(state.solarElevation, state.twilight)).toBe(0);
      expect(getSkyWarmHorizonWeight(state.solarElevation, state.twilight)).toBeLessThan(0.001);
    }
  });

  it('keeps solar palette transitions finite, bounded and symmetric at dawn', () => {
    let previousBlue = 0,
      previousWarm = 0;
    for (let hour = 0; hour <= 24; hour += 0.01) {
      const state = sampleAtmosphere(1, hour, 'clear');
      const blue = getSkyBlueHourWeight(state.solarElevation, state.twilight);
      const warm = getSkyWarmHorizonWeight(state.solarElevation, state.twilight);
      expect(blue).toBeGreaterThanOrEqual(0);
      expect(blue).toBeLessThanOrEqual(1);
      expect(warm).toBeGreaterThanOrEqual(0);
      expect(warm).toBeLessThanOrEqual(0.72);
      expect(Math.abs(blue - previousBlue)).toBeLessThan(0.03);
      expect(Math.abs(warm - previousWarm)).toBeLessThan(0.03);
      previousBlue = blue;
      previousWarm = warm;
    }
    const dawn = sampleAtmosphere(1, 5.45, 'clear');
    const dusk = sampleAtmosphere(1, 18.55, 'clear');
    expect(getSkyBlueHourWeight(dawn.solarElevation, dawn.twilight)).toBeCloseTo(
      getSkyBlueHourWeight(dusk.solarElevation, dusk.twilight),
      6
    );
  });
});

describe('ridge weather extinction', () => {
  it('keeps ordered depth layers in clear and storm conditions', () => {
    for (const cloudCoverage of [0.2, 0.52, 0.74, 0.9]) {
      const weights = [0.1, 0.2, 0.32].map((aerial) => getRidgeAerialWeight(aerial, cloudCoverage));
      expect(weights[0]).toBeLessThan(weights[1]);
      expect(weights[1]).toBeLessThan(weights[2]);
      expect(weights[0]).toBeGreaterThanOrEqual(0.1);
      expect(weights[2]).toBeLessThan(1);
    }
    expect(getRidgeAerialWeight(0.32, 0.2)).toBe(0.32);
    expect(getRidgeAerialWeight(0.32, 0.9)).toBeGreaterThan(0.7);
  });

  it('thickens the air with distance in rain instead of walling off the near hills', () => {
    // Rain put 0.57 / 0.60 / 0.68 on near / mid / far: the foothills behind the
    // village went to the same flat blue as the range, aerial perspective lost.
    const [near, mid, far] = [0.1, 0.2, 0.32].map((aerial) => getRidgeAerialWeight(aerial, 0.74));
    expect(near).toBeLessThan(0.35);
    expect(mid - near).toBeGreaterThan(0.15);
    expect(far - mid).toBeGreaterThan(0.15);
  });
});

describe('overcast sky palette', () => {
  const chroma = (colour: THREE.Color) =>
    Math.max(colour.r, colour.g, colour.b) - Math.min(colour.r, colour.g, colour.b);

  it('leaves fair weather exactly unchanged', () => {
    const horizon = new THREE.Color('#a3cce2');
    const before = horizon.clone();
    blendSkyOvercast(horizon, 'horizon', 1, sampleAtmosphere(0, 12, 'clear').cloudCoverage);
    expect(horizon.equals(before)).toBe(true);
  });

  it('greys a rain sky rather than only dimming it', () => {
    const rain = sampleAtmosphere(0, 12, 'rain');
    const daylight = rain.daylight * rain.lightMultiplier;
    for (const band of Object.keys(OVERCAST_SKY) as (keyof typeof OVERCAST_SKY)[]) {
      const colour = new THREE.Color('#70aed8');
      const blue = chroma(colour);
      blendSkyOvercast(colour, band, daylight, rain.cloudCoverage);
      expect(chroma(colour), band).toBeLessThan(blue * 0.45);
    }
  });

  it("softens the sun shadow under a deck and leaves fair weather on three's default", () => {
    expect(overcastShadowRadius(sampleAtmosphere(0, 12, 'clear').cloudCoverage)).toBe(1);
    expect(overcastShadowRadius(sampleAtmosphere(0, 12, 'rain').cloudCoverage)).toBeGreaterThan(
      2.2
    );
  });

  it('keeps an overcast night dark', () => {
    const colour = new THREE.Color('#071426');
    blendSkyOvercast(colour, 'top', 0, sampleAtmosphere(0, 0, 'storm').cloudCoverage);
    expect(colour.r + colour.g + colour.b).toBeLessThan(0.05);
  });
});

describe('solid fixed foothills', () => {
  it('keeps every wooded slope advancing outward without folded, back-facing strips', () => {
    let minimumAdvance = Infinity;
    for (const geometry of MOUNTAIN_RIDGE_GEOMETRIES.slice(1)) {
      const positions = geometry.getAttribute('position');
      const rows = positions.count / (MOUNTAIN_RIDGE_SEGMENTS + 1);
      for (let column = 0; column < MOUNTAIN_RIDGE_SEGMENTS; column++) {
        for (let row = 1; row < rows; row++) {
          const i = column * rows + row;
          minimumAdvance = Math.min(
            minimumAdvance,
            Math.hypot(positions.getX(i), positions.getZ(i)) -
              Math.hypot(positions.getX(i - 1), positions.getZ(i - 1))
          );
        }
      }
    }
    expect(minimumAdvance).toBeGreaterThan(0);
  });

  it('returns wooded hills to ground behind the crest instead of ending as an open shelf', () => {
    for (const geometry of MOUNTAIN_RIDGE_GEOMETRIES.slice(1)) {
      const positions = geometry.getAttribute('position');
      const rows = positions.count / (MOUNTAIN_RIDGE_SEGMENTS + 1);
      for (let column = 0; column < MOUNTAIN_RIDGE_SEGMENTS; column++) {
        const foot = column * rows;
        const back = foot + rows - 1;
        expect(positions.getY(back)).toBeLessThanOrEqual(positions.getY(foot) + 0.001);
      }
    }
  });

  it('writes opaque terrain depth without a height-based alpha hole', () => {
    for (const anchored of [false, true]) {
      const material = createRidgeMaterial(0.08, 'test-ridge', anchored);
      expect(material.transparent).toBe(false);
      expect(material.depthWrite).toBe(true);
      expect(material.fragmentShader).toContain('gl_FragColor = vec4(lit, 1.0)');
      expect(material.fragmentShader).not.toContain('groundBlend');
      expect(material.fragmentShader).not.toContain('sampler');
      expect(material.customProgramCacheKey()).toBe('millos-ridge-aerial-geology-v26');
      material.dispose();
    }
  });

  it('covers the reproduced lake-camera sky wedge with grounded solid slopes', () => {
    const eye = new THREE.Vector3(138, 1.7, 102);
    const bearing = Math.atan2(123 - eye.z, 120 - eye.x) - THREE.MathUtils.degToRad(42.8);
    const elevation = THREE.MathUtils.degToRad(3.5);
    const ray = new THREE.Raycaster(
      eye,
      new THREE.Vector3(
        Math.cos(bearing) * Math.cos(elevation),
        Math.sin(elevation),
        Math.sin(bearing) * Math.cos(elevation)
      )
    );
    for (const geometry of MOUNTAIN_RIDGE_GEOMETRIES.slice(1)) {
      const material = createRidgeMaterial(0.08, 'test-fixed', true);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.updateMatrixWorld();
      const hit = ray.intersectObject(mesh)[0];
      expect(hit).toBeDefined();
      expect(hit.point.y).toBeLessThan(23);
      const positions = geometry.getAttribute('position');
      const rows = positions.count / (MOUNTAIN_RIDGE_SEGMENTS + 1);
      for (let column = 0; column < MOUNTAIN_RIDGE_SEGMENTS; column++) {
        const foot = column * rows;
        const x = positions.getX(foot),
          z = positions.getZ(foot);
        expect(positions.getY(foot)).toBeLessThan(sampleValleyGroundHeight(x, z, 128));
      }
      material.dispose();
    }
  });
});

it('isolates the default woodland finish per anchored material without touching the far range or shared surface controls', () => {
  const near = createRidgeMaterial(0.1, 'near', true),
    mid = createRidgeMaterial(0.2, 'mid', true),
    far = createRidgeMaterial(0.32, 'far');
  expect(near.uniforms.uWoodlandStrength.value).toBe(1);
  expect(mid.uniforms.uWoodlandStrength.value).toBe(1);
  expect(far.uniforms.uWoodlandStrength.value).toBe(0);
  expect(near.uniforms.uWoodlandStrength).not.toBe(mid.uniforms.uWoodlandStrength);
  expect(near.uniforms.uDetailStrength).toBe(mid.uniforms.uDetailStrength);
  expect(mid.uniforms.uSnowStrength).toBe(far.uniforms.uSnowStrength);
  const detail = near.uniforms.uDetailStrength.value,
    snow = far.uniforms.uSnowStrength.value,
    key = near.customProgramCacheKey();
  near.uniforms.uWoodlandStrength.value = 0;
  expect(mid.uniforms.uWoodlandStrength.value).toBe(1);
  expect(far.uniforms.uWoodlandStrength.value).toBe(0);
  expect(near.uniforms.uDetailStrength.value).toBe(detail);
  expect(far.uniforms.uSnowStrength.value).toBe(snow);
  expect(near.customProgramCacheKey()).toBe(key);
  for (const material of [near, mid, far]) material.dispose();
});

it('keeps every compact crown inside the actual neighboring-seed stencil with bounded overlap weights', () => {
  const { seedInset, radius, axis, amplitude } = RIDGE_CANOPY_PROFILE;
  expect(seedInset).toBeGreaterThan(0);
  expect(seedInset).toBeLessThan(0.5);
  expect(radius[0]).toBeGreaterThan(0);
  expect(axis[0]).toBeGreaterThan(0);
  expect(radius[1] * axis[1]).toBeLessThan(1 + seedInset);
  expect(amplitude[0]).toBeGreaterThan(0);
  expect(amplitude[1]).toBeLessThan(1);
});

describe('single sun/moon shadowed key', () => {
  it('rakes the sunrise key at about 7 degrees so long shadows reach the ground', () => {
    const dawn = sampleCelestial(sampleAtmosphere(0, 6, 'clear'));
    const key = celestialKeyDirection(
      new THREE.Vector3(),
      dawn.sunDirection,
      dawn.moonDirection,
      dawn.sunLightIntensity,
      dawn.moonLightIntensity
    );
    // At 4 degrees the slab took 7% of the key: no visible hall or silo shadow.
    expect(key.y).toBeGreaterThan(0.115);
    const noon = sampleCelestial(sampleAtmosphere(0, 12, 'clear'));
    expect(noon.sunDirection[1]).toBeCloseTo(1, 8);
  });

  it('retains noon sun and midnight moon directions with finite unit-length crossover', () => {
    for (let minute = 0; minute <= 1440; minute++) {
      const hour = minute / 60;
      const c = sampleCelestial(sampleAtmosphere(0, hour, 'clear'));
      const target = celestialKeyDirection(
        new THREE.Vector3(),
        c.sunDirection,
        c.moonDirection,
        c.sunLightIntensity,
        c.moonLightIntensity
      );
      expect(target.toArray().every(Number.isFinite)).toBe(true);
      expect(target.length()).toBeCloseTo(1, 10);
      expect(target.y).toBeGreaterThan(0);
      if (hour === 0 || hour === 12)
        expect(
          target.distanceTo(new THREE.Vector3(...(hour === 12 ? c.sunDirection : c.moonDirection)))
        ).toBeLessThan(1e-10);
    }
  });
});

it('retains explicit finite snow caps on the far range and snow-free rolling foothills', () => {
  for (const geometry of MOUNTAIN_RIDGE_GEOMETRIES) {
    const snow = geometry.getAttribute('ridgeSnow');
    expect(snow.count).toBe(geometry.getAttribute('position').count);
    for (let i = 0; i < snow.count; i++) {
      expect(snow.getX(i)).toBeGreaterThanOrEqual(0);
      expect(snow.getX(i)).toBeLessThanOrEqual(1);
    }
  }
  expect(
    Array.from(MOUNTAIN_RIDGE_GEOMETRIES[0].getAttribute('ridgeSnow').array).filter((x) => x > 0.2)
      .length
  ).toBeGreaterThan(100);
  for (const geometry of MOUNTAIN_RIDGE_GEOMETRIES.slice(1)) {
    expect(Array.from(geometry.getAttribute('ridgeSnow').array).every((x) => x === 0)).toBe(true);
  }

  // The previous altitude mask passed the count check above while the actual
  // village view showed tiny summit tips. Its high peaks need covered upper
  // shoulders as well. Keep the lower range and every foothill snow-free.
  const far = MOUNTAIN_RIDGE_GEOMETRIES[0];
  const positions = far.getAttribute('position');
  const snow = far.getAttribute('ridgeSnow');
  const previous = createMountainRidgeGeometry({ ...FAR_MOUNTAIN_SPEC, snowLine: 0.46 });
  try {
    for (const attribute of ['position', 'color', 'normal', 'ridgeHeight']) {
      expect(far.getAttribute(attribute).array).toEqual(previous.getAttribute(attribute).array);
    }
    expect(far.index?.array).toEqual(previous.index?.array);
    for (let i = 0; i < positions.count; i++) {
      if (positions.getY(i) <= 55) expect(snow.getX(i)).toBe(0);
    }
  } finally {
    previous.dispose();
  }
  const camera = SITE_LAYOUT.cameras.village;
  const bearing = new THREE.Vector3(...camera.target)
    .sub(new THREE.Vector3(...camera.position))
    .setY(0)
    .normalize();
  let reviewedPeaks = 0;
  for (let column = 0; column < MOUNTAIN_RIDGE_SEGMENTS; column++) {
    const crest = column * MOUNTAIN_RIDGE_ROWS + MOUNTAIN_RIDGE_ROWS - 1;
    const direction = new THREE.Vector3(
      positions.getX(crest),
      0,
      positions.getZ(crest)
    ).normalize();
    if (positions.getY(crest) <= 90 || direction.dot(bearing) < Math.cos(Math.PI / 6)) continue;
    reviewedPeaks++;
    expect(snow.getX(column * MOUNTAIN_RIDGE_ROWS + 13)).toBeGreaterThan(0.7);
  }
  expect(reviewedPeaks).toBeGreaterThan(0);
});

it('isolates the alpine finish to each far material, preserving shared snow/detail and finished woodland controls', () => {
  const far = createRidgeMaterial(0.32, 'alpine'),
    sibling = createRidgeMaterial(0.32, 'other-far'),
    near = createRidgeMaterial(0.1, 'wooded', true);
  expect(far.uniforms.uAlpineStrength.value).toBe(1);
  expect(sibling.uniforms.uAlpineStrength.value).toBe(1);
  expect(near.uniforms.uAlpineStrength.value).toBe(0);
  expect(far.uniforms.uAlpineStrength).not.toBe(sibling.uniforms.uAlpineStrength);
  const detail = far.uniforms.uDetailStrength.value,
    snow = far.uniforms.uSnowStrength.value,
    key = far.customProgramCacheKey();
  far.uniforms.uAlpineStrength.value = 0;
  expect(sibling.uniforms.uAlpineStrength.value).toBe(1);
  expect(near.uniforms.uWoodlandStrength.value).toBe(1);
  expect(far.uniforms.uDetailStrength.value).toBe(detail);
  expect(far.uniforms.uSnowStrength.value).toBe(snow);
  expect(far.customProgramCacheKey()).toBe(key);
  for (const m of [far, sibling, near]) m.dispose();
});

it('gives actual steep snowy faces a mineral substrate while retaining snow potential, summit caps and filtered metre relief', () => {
  const far = MOUNTAIN_RIDGE_GEOMETRIES[0],
    position = far.getAttribute('position'),
    normal = far.getAttribute('normal'),
    snow = far.getAttribute('ridgeSnow');
  let steepSnowy = 0;
  for (let i = 0; i < position.count; i++)
    if (
      position.getY(i) > 55 &&
      normal.getY(i) < Math.cos((55 * Math.PI) / 180) &&
      snow.getX(i) > 0.7
    )
      steepSnowy++;
  expect(steepSnowy).toBeGreaterThan(100);
  expect(RIDGE_ALPINE_PROFILE.steepSnow).toBeLessThan(0.2);
  expect(RIDGE_ALPINE_PROFILE.shoulderSnow).toBeGreaterThan(0.8);
  expect(RIDGE_ALPINE_PROFILE.reliefMetres / 10).toBeLessThan(0.06);
  expect(RIDGE_ALPINE_PROFILE.mineralShade[0]).toBeGreaterThan(0.5);
  expect(RIDGE_ALPINE_PROFILE.mineralShade[1]).toBeLessThan(1.3);
  const material = createRidgeMaterial(0.32, 'real-alpine');
  const branch = material.fragmentShader
    .split('} else if (uWorldAnchored < 0.5')[1]
    .split('} else {')[0];
  expect(branch).toContain('vec3 mineral = vRidgeColor * mix(');
  expect(branch).toContain('mix(lowSlope, mineral, max(rock, substrate))');
  expect(branch).toContain('smoothstep(0.35, 0.72, max(0.0, normal.y))');
  expect(branch).toContain('snowPotential * max(accumulation, summit)');
  expect(branch).toContain('max(length(dFdx(p)), length(dFdy(p)))');
  expect(branch).toContain('fineVisibility');
  expect(branch).toContain('(p.x + drift) * 0.065, p.y * 0.065');
  expect(branch).toContain('(veins - 0.5) * 0.08) * 0.40');
  expect(material.fragmentShader).toContain('smoothstep(0.0, 0.20, uSunDirection.y)');
  expect(material.fragmentShader).toContain(
    'mix(ndl, max(0.0, dot(normal, uSunDirection)), alpineSun)'
  );
  material.dispose();
});

it('carves broad peak-rooted basins inside the original envelope with exact skyline, topology and altitude-based snow', () => {
  const original = createMountainRidgeGeometry({ ...FAR_MOUNTAIN_SPEC, alpineReliefMetres: 0 }),
    sculpted = MOUNTAIN_RIDGE_GEOMETRIES[0],
    before = original.getAttribute('position'),
    after = sculpted.getAttribute('position'),
    snow = sculpted.getAttribute('ridgeSnow');
  try {
    expect(after.count).toBe(before.count);
    expect(sculpted.index!.array).toEqual(original.index!.array);
    for (const attribute of ['color', 'ridgeHeight'])
      expect(sculpted.getAttribute(attribute).array).toEqual(
        original.getAttribute(attribute).array
      );
    let changed = 0,
      greatestCarve = 0;
    for (let column = 0; column <= MOUNTAIN_RIDGE_SEGMENTS; column++) {
      const start = column * MOUNTAIN_RIDGE_ROWS;
      const oldRadii = Array.from({ length: MOUNTAIN_RIDGE_ROWS }, (_, row) =>
        Math.hypot(before.getX(start + row), before.getZ(start + row))
      );
      let previousHeight = -Infinity,
        previousRadius = -Infinity;
      for (let row = 0; row < MOUNTAIN_RIDGE_ROWS; row++) {
        const i = start + row,
          height = after.getY(i),
          carve = before.getY(i) - height;
        const radius = Math.hypot(after.getX(i), after.getZ(i));
        expect(radius).toBeGreaterThanOrEqual(Math.min(...oldRadii) - 0.0001);
        expect(radius).toBeLessThanOrEqual(Math.max(...oldRadii) + 0.0001);
        if (height >= 0) expect(radius).toBeGreaterThan(previousRadius);
        expect(carve).toBeGreaterThanOrEqual(0);
        expect(carve).toBeLessThanOrEqual(30.0001);
        if (row === 0 || row === MOUNTAIN_RIDGE_ROWS - 1) expect(height).toBe(before.getY(i));
        if (height >= 0) expect(height).toBeGreaterThan(previousHeight);
        if (row > 0) {
          const expectedSnow = THREE.MathUtils.clamp(
            (height -
              (FAR_MOUNTAIN_SPEC.baseY +
                FAR_MOUNTAIN_SPEC.maxHeight * FAR_MOUNTAIN_SPEC.snowLine)) /
              12 +
              0.5,
            0,
            1
          );
          expect(snow.getX(i)).toBeCloseTo(expectedSnow, 5);
        }
        if (height < 55) expect(snow.getX(i)).toBe(0);
        if (carve > 0.1) changed++;
        greatestCarve = Math.max(greatestCarve, carve);
        previousHeight = height;
        previousRadius = radius;
      }
    }
    expect(changed).toBeGreaterThan(500);
    expect(greatestCarve).toBeGreaterThan(12);
    expect(sculpted.getAttribute('normal').array).not.toEqual(
      original.getAttribute('normal').array
    );
    expect(sculpted.getAttribute('ridgeSnow').array).not.toEqual(
      original.getAttribute('ridgeSnow').array
    );
  } finally {
    original.dispose();
  }
});

describe('procedural moon at display size', () => {
  it('keeps the maria and craters soft enough not to read as blotches', async () => {
    // At 18:30 the 70 px disc read as a face: dark maria at 0.72 of the way to
    // a lowland 0.44x the highland, and four craters weighted 0.28.
    const { readFileSync } = await import('node:fs');
    const source = readFileSync('src/components/environment/OptimizedSkySystem.tsx', 'utf8');
    const shader = source.slice(source.indexOf('const moonFragmentShader'));
    const vec = (name: string) =>
      shader
        .match(new RegExp(`vec3 ${name} = vec3\\(([^)]*)\\)`))![1]
        .split(',')
        .map(Number);
    const luminance = ([r, g, b]: number[]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const mariaMix = Number(shader.match(/mix\(highland, lowland, maria \* ([0-9.]+)\)/)![1]);
    const craterWeight = Number(shader.match(/craters \* ([0-9.]+);/)![1]);
    const darkest =
      luminance(vec('highland')) +
      (luminance(vec('lowland')) - luminance(vec('highland'))) * mariaMix;
    expect(darkest / luminance(vec('highland'))).toBeGreaterThan(0.72);
    expect(craterWeight).toBeLessThanOrEqual(0.14);
    expect(source).toContain("'millos-procedural-moon-v2'");
  });
});

// village (0,130)-(2560,640), final-med-12: the backdrop hill is one dark-green
// gradient. The woodland albedo spans 0.047-0.067 linear red, a 1.3x range that
// aerial haze flattens to nothing at 150-300 m. Gentle slopes are farmed in a
// mill's hinterland: hedged parcels of pasture and hay with field trees.
const linearLuminance = ([r, g, b]: readonly number[]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
it('parcels the gentle foothill slopes into hedged fields brighter than the woodland', () => {
  const { cell, hedgeMetres, pasture, hay, woodland } = RIDGE_FIELD_PROFILE;
  expect(cell[0]).toBeGreaterThanOrEqual(30);
  expect(cell[1]).toBeLessThanOrEqual(90);
  expect(hedgeMetres).toBeLessThan(Math.min(...cell) * 0.06);
  expect(linearLuminance(pasture)).toBeGreaterThan(linearLuminance(woodland) * 1.5);
  expect(linearLuminance(hay)).toBeGreaterThan(linearLuminance(pasture) * 1.1);
  const near = createRidgeMaterial(0.1, 'near', true);
  const branch = near.fragmentShader.slice(
    near.fragmentShader.indexOf('if (uWorldAnchored > 0.5 && uWoodlandStrength > 0.5)'),
    near.fragmentShader.indexOf('} else if (uWorldAnchored < 0.5 && uAlpineStrength > 0.5)')
  );
  expect(branch).toContain(`vec2(${cell[0].toFixed(1)}, ${cell[1].toFixed(1)})`);
  expect(branch).toContain('hedge');
  expect(branch).toContain('fwidth(edge)');
  expect(near.customProgramCacheKey()).toBe('millos-ridge-aerial-geology-v26');
  near.dispose();
});

// overview (0,290)-(780,450), final-med-12: the far range carried lit geology
// down to a dead-straight line at world y 56-59 and one flat blue-grey slab
// below it. The substrate switched from vegetation to mineral on vRidgeSnow's
// 0.05-0.30 ramp - 3 m of altitude at 12 m per unit - a fixed-height cut seen
// at constant distance on a camera-locked ring, with near-uniform vegetation
// albedo under it. The switch must be broken across many metres and the lower
// band must carry its own variation.
it('breaks the far range substrate across a wide noisy altitude band with varied lower slopes', () => {
  const { substrateRamp, substrateBreak, lowland, outcrop } = RIDGE_ALPINE_PROFILE;
  const metresPerSnowUnit = 12;
  const band = (substrateRamp[1] - substrateRamp[0] + substrateBreak) * metresPerSnowUnit;
  expect(band).toBeGreaterThanOrEqual(12);
  expect(substrateBreak / 2).toBeGreaterThan(substrateRamp[0]);
  expect(linearLuminance(lowland[1])).toBeGreaterThan(linearLuminance(lowland[0]) * 1.6);
  expect(outcrop[0]).toBeLessThan(outcrop[1]);
  const material = createRidgeMaterial(0.32, 'alpine-lowland');
  const branch = material.fragmentShader
    .split('} else if (uWorldAnchored < 0.5')[1]
    .split('} else {')[0];
  expect(branch).not.toContain('smoothstep(0.05, 0.30, vRidgeSnow)');
  // The visible line in the after-capture was the SNOW edge: a 3.6 m ramp on
  // the clamped vertex attribute at y 65-69. It needs the unclamped altitude
  // and a break of tens of metres, like a real snow line.
  expect(RIDGE_ALPINE_PROFILE.snowBreakMetres).toBeGreaterThanOrEqual(10);
  expect(material.uniforms.uSnowDatum.value).toBeCloseTo(
    FAR_MOUNTAIN_SPEC.baseY + FAR_MOUNTAIN_SPEC.maxHeight * FAR_MOUNTAIN_SPEC.snowLine,
    6
  );
  expect(branch).toContain('(p.y - uSnowDatum) / 12.0 + 0.5');
  expect(branch).toContain('snowAltitude + snowBreak');
  expect(branch).toContain('float outcrop =');
  expect(branch).toContain('float scrub =');
  material.dispose();
});

// village (0,120)-(2560,640), final-med-12: the patchwork stopped at hard
// horizontal seams against plain hill bands, and about 12 dark 40x15 px
// ellipses sat inside the fields. Each of the 17 terrace rows carries a
// near-constant slope, so a narrow normal.y gate (0.82-0.93) flipped along
// whole rows. The ellipses were the field trees: a flat 3.8 m disc of hedge
// tone on a slope seen at a grazing angle is a foreshortened hole, not a tree.
it('breaks the farmed/wooded edge across terrace rows and draws no isolated field discs', () => {
  const { slopeGate, edgeBreak, copse } = RIDGE_FIELD_PROFILE;
  expect(slopeGate[1] - slopeGate[0]).toBeGreaterThanOrEqual(0.15);
  expect(edgeBreak).toBeGreaterThanOrEqual(0.06);
  expect(copse[0]).toBeLessThan(copse[1]);
  expect('treeRadius' in RIDGE_FIELD_PROFILE).toBe(false);
  const near = createRidgeMaterial(0.1, 'near-fields', true);
  const branch = near.fragmentShader.slice(
    near.fragmentShader.indexOf('if (uWorldAnchored > 0.5 && uWoodlandStrength > 0.5)'),
    near.fragmentShader.indexOf('} else if (uWorldAnchored < 0.5 && uAlpineStrength > 0.5)')
  );
  expect(branch).not.toContain('smoothstep(0.82, 0.93, abs(normal.y))');
  expect(branch).toContain('abs(normal.y) + woodEdge');
  expect(branch).toContain('float copse =');
  expect(branch).not.toContain('treeDistance');
  // After the first pass (art3land-after-med12, village (0,300)-(1060,425)) the
  // ruled band was still there: every terrace row is gentler than normal.y
  // 0.88, so it was never the slope gate but a wholly wooded parcel, unhedged,
  // whose rotated grid edge lies near-horizontal on screen. Woods in a wooded
  // parcel now draw back from its boundary into ragged stands.
  expect(branch).not.toContain('* step(0.4, parcelUse)');
  expect(branch).toContain('float woods =');
  expect(near.customProgramCacheKey()).toBe('millos-ridge-aerial-geology-v26');
  near.dispose();
});

// overview (0,320)-(720,445), final-med-12: the far range's lower slopes stay
// one hazy blue-grey band. Two inputs were inert at that range: the lowland
// pair (1.6x luminance) survives the far ring's 0.32 aerial mix as about 1.1x,
// and the outcrops took `vRidgeColor`, whose low-row value ('#42574c' times the
// facet tint) is the vegetation's own green. The band needs albedo contrast
// that survives the haze and relief that turns faces to and from the sun.
it('gives the far lower slopes contrast that survives the aerial mix and real outcrop rock', () => {
  const { lowland, outcropAlbedo, spurMetres } = RIDGE_ALPINE_PROFILE;
  const inscatter = new THREE.Color('#b9dce7');
  const hazed = (albedo: readonly number[]) =>
    linearLuminance(albedo) * 0.68 +
    linearLuminance([inscatter.r, inscatter.g, inscatter.b]) * 0.32;
  expect(hazed(lowland[1]) / hazed(lowland[0])).toBeGreaterThan(1.22);
  const lowRow = new THREE.Color(FAR_MOUNTAIN_SPEC.colors[0]);
  expect(linearLuminance(outcropAlbedo)).toBeGreaterThan(
    linearLuminance([lowRow.r, lowRow.g, lowRow.b]) * 1.6
  );
  expect(spurMetres).toBeGreaterThanOrEqual(2);
  expect(spurMetres).toBeLessThanOrEqual(6);
  const material = createRidgeMaterial(0.32, 'alpine-spurs');
  const branch = material.fragmentShader
    .split('} else if (uWorldAnchored < 0.5')[1]
    .split('} else {')[0];
  expect(branch).toContain('float spur =');
  expect(branch).toContain(`mix(vegetation, ${glslVec3Literal(outcropAlbedo)}`);
  expect(branch).toContain('(spur - 0.5) *');
  // First pass (art3land-after-med12): the band's 25 px band-pass contrast
  // went 5.81 -> 5.87, i.e. nothing. The massifs' lower band is ROCK there
  // (vRidgeHeight carries 0.45 of the column profile, so rock is ~1 under the
  // big peaks) and the spurs were gated to vegetation. Spurs and couloirs cut
  // rock too: they must cover the whole band below the snow line.
  expect(branch).toContain('float lowBand =');
  // Second pass (art3land-after2-med12): 5.80 band-pass, still nothing. A probe
  // put the band at 540 m with lit radiance ~0.02-0.04 linear under a ~0.23
  // inscatter: a +/-28% multiply on a 0.05 albedo is ~1 level after the haze.
  // Only an albedo SPAN survives: pale scree ribs against dark forest runnels.
  expect(branch).toContain('float rib =');
  expect(branch).toContain('float runnel =');
  // Third pass (art3land-after3-med12): streaks arrived (column swing
  // 1.20 -> 1.73) but as soft vertical curtains that read as rain, not rock.
  // The 15 m veins break the 25 m spurs into crisper ribs and scree fans.
  expect(branch).toContain('float gully = spur * 0.6 + veins * 0.4;');
  expect(linearLuminance(RIDGE_ALPINE_PROFILE.ribAlbedo)).toBeGreaterThan(
    linearLuminance(lowland[0]) * 4
  );
  expect(branch).not.toContain('(1.0 - max(rock, substrate)))');
  expect(material.customProgramCacheKey()).toBe('millos-ridge-aerial-geology-v26');
  material.dispose();
});

function glslVec3Literal(value: readonly number[]): string {
  return `vec3(${value.map((v) => v.toFixed(3)).join(', ')})`;
}

// overview (0,320)-(720,440), art3land-after4-med12: the ribs, runnels and
// spurs reached the albedo but not the screen (column swing 1.20 -> 1.54). A
// probe put the band on the far ring at 540 m with uAerial 0.32 over a
// 0.03-0.05 lit radiance: the haze is ~90% of every pixel there. The far
// ring's aerial weight drops below the snow line only, on a wide ramp broken
// by the snow-line field, and stays full at the snow, the upper rock and the
// crest rows that make the horizon silhouette.
it('thins the far ring haze below the snow line only, keeping snow, upper rock and crest', () => {
  const { lowBandAerial, lowBandRamp, crestGuard } = RIDGE_ALPINE_PROFILE;
  expect(lowBandAerial).toBeGreaterThanOrEqual(0.4);
  expect(lowBandAerial).toBeLessThanOrEqual(0.75);
  // A ramp of at least 18 m (12 m per snow unit): no visible line.
  expect((lowBandRamp[1] - lowBandRamp[0]) * 12).toBeGreaterThanOrEqual(18);
  // Full haze before the snow even begins (its ramp starts at 0.35 units).
  expect(lowBandRamp[1]).toBeLessThanOrEqual(0);
  expect(crestGuard[0]).toBeLessThan(crestGuard[1]);
  const far = createRidgeMaterial(0.32, 'far-low-aerial');
  expect(far.uniforms.uRingRadius.value).toBeCloseTo(FAR_MOUNTAIN_SPEC.radius, 6);
  expect(far.uniforms.uSlopeDepth.value).toBeCloseTo(FAR_MOUNTAIN_SPEC.slopeDepth, 6);
  expect(far.uniforms.uLowAerialStrength.value).toBe(1);
  const shader = far.fragmentShader;
  expect(shader).toContain('float aerialScale = 1.0;');
  expect(shader).toContain('clamp(aerial * aerialScale * 0.80, 0.0, 1.0)');
  expect(shader).toContain('clamp(aerial * aerialScale * 1.20, 0.0, 1.0)');
  // Only the far (alpine) branch sets it: the foothills keep their haze.
  const alpine = shader.split('} else if (uWorldAnchored < 0.5')[1].split('} else {')[0];
  expect(alpine).toContain('aerialScale = mix(1.0,');
  expect(far.customProgramCacheKey()).toBe('millos-ridge-aerial-geology-v26');
  far.dispose();
});

// village, final3-med-19 against base-med-19 (the one scene the baseline won):
// large straight-edged red and purple facets across the dark hill. They are
// the hay and pasture parcels: the two differ mostly in red (0.122 / 0.080
// linear), and under the night key ('#39527a') and a warm twilight inscatter
// that red step survives as a hue step between cells while the hedges vanish.
// 18:30 shows the same, purple. Toward night the parcels keep one hue and a
// compressed luminance step; dawn (0.5 daylight) and rain noon keep full day.
it('draws the hill fields at one hue and a compressed tone toward night', () => {
  const { nightVariation, nightTone, fieldDaylight, fieldTone } = RIDGE_FIELD_PROFILE;
  expect(nightVariation).toBeGreaterThan(0);
  expect(nightVariation).toBeLessThanOrEqual(0.4);
  expect(fieldDaylight[0]).toBeLessThan(fieldDaylight[1]);
  expect(fieldTone[0]).toBeLessThan(fieldTone[1]);
  const daylightAt = (hour: number, weather: 'clear' | 'rain' = 'clear') =>
    sampleAtmosphere(1, hour, weather).daylight;
  const at = (hour: number, weather: 'clear' | 'rain' = 'clear') =>
    getRidgeFieldDaylight(daylightAt(hour, weather));
  const toneAt = (hour: number) => getRidgeFieldTone(daylightAt(hour));
  expect(at(12)).toBe(1);
  expect(at(6)).toBe(1);
  expect(at(12, 'rain')).toBe(1);
  // final4-med-1830 village lost to final3's patchwork: at 18:30 the hill had
  // already given up 70% of its hue and half its tonal step and went to one
  // near-black mass. Dusk keeps the fields' hue and full tone; the one-hue
  // night (which fixed the 19:00 red and purple facets) still holds by 19:00,
  // and the tonal step (patchwork and hedgerows) fades later than the hue.
  expect(at(18.5)).toBeGreaterThan(0.7);
  expect(toneAt(18.5)).toBe(1);
  expect(at(19)).toBe(0);
  // final5-med-19 village: half the tonal step kept at 19:00 brought the
  // hedgerow lines and parcel facets back as diagonal creases on the dark
  // hill. The step is gone by 19:00 (daylight 0.046), with margin both sides.
  expect(toneAt(19)).toBe(0);
  expect(RIDGE_FIELD_PROFILE.fieldTone[0]).toBeGreaterThan(daylightAt(19) + 0.01);
  expect(RIDGE_FIELD_PROFILE.fieldTone[1]).toBeLessThan(daylightAt(18.5) - 0.02);
  expect(at(22)).toBe(0);
  expect(toneAt(22)).toBe(0);
  // Compression keeps the palette's mean luminance: a darker night tone pulled
  // every parcel down 20-30% at dusk (final4 18:30 hill band 20% darker than
  // final3's).
  const lum = (c: readonly number[]) => c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
  const fieldMean = (lum(RIDGE_FIELD_PROFILE.hay) + lum(RIDGE_FIELD_PROFILE.pasture)) / 2;
  // Between the woods and the open fields, near the hill's area mean.
  expect(lum(nightTone)).toBeGreaterThan(fieldMean * 0.85);
  expect(lum(nightTone)).toBeLessThan(fieldMean);
  // Mirror of the shader's compression at full night: every parcel lands on
  // the night tone's hue, and the hay/pasture luminance step shrinks to
  // nightVariation of what it was.
  const night = (albedo: readonly number[]) => {
    const tone = lum(albedo) / lum(nightTone);
    return nightTone.map((mean) => mean + (mean * tone - mean) * nightVariation);
  };
  const [hay, pasture] = [night(RIDGE_FIELD_PROFILE.hay), night(RIDGE_FIELD_PROFILE.pasture)];
  expect(hay[0] / hay[1]).toBeCloseTo(pasture[0] / pasture[1], 6);
  expect(lum(hay) - lum(pasture)).toBeCloseTo(
    (lum(RIDGE_FIELD_PROFILE.hay) - lum(RIDGE_FIELD_PROFILE.pasture)) * nightVariation,
    9
  );
  const near = createRidgeMaterial(0.1, 'near-night', true);
  expect(near.uniforms.uFieldDaylight.value).toBe(1);
  expect(near.uniforms.uFieldTone.value).toBe(1);
  const branch = near.fragmentShader.slice(
    near.fragmentShader.indexOf('if (uWorldAnchored > 0.5 && uWoodlandStrength > 0.5)'),
    near.fragmentShader.indexOf('} else if (uWorldAnchored < 0.5 && uAlpineStrength > 0.5)')
  );
  expect(branch).toContain(`mix(${nightVariation.toFixed(2)}, 1.0, uFieldTone)`);
  expect(branch).toContain('mix(fieldMean * fieldTone, detailedAlbedo, uFieldDaylight)');
  near.dispose();
});

// village, final3-med-12 rubric and 18:30 judge: dark oval blotches on the
// fields, read as copses or cloud shadows (no cloud shadow is drawn on any
// terrain: they are the woods). At 150-450 m the 3.7 m crowns carried +/-11%
// albedo and 0.24 m of relief under the aerial mix, the outlines were a 40-50 m
// fbm threshold, and the canopy stopped on the field at full darkness.
it('draws woods as soft, coherent stands with a lighter fringe', () => {
  const {
    crownTone,
    crownReliefMetres,
    clump,
    clumpScale,
    clumpFootprint,
    rag,
    ragScale,
    standScale,
    woodsEdge,
    copse,
    strayFootprint,
    fringe,
    scrub,
    woodland,
  } = RIDGE_FIELD_PROFILE;
  // final4-med-06, low-12 and med-12 village ("noisy, blotchy", "hard
  // camouflage mottling"): at 0.5-1.5 m/px the 6 m and 2.4 m clump noise
  // resolved at +/-16%, the crowns swung 0.74-1.24, a 9 m rag wobbled every
  // outline and stray trees speckled the fringe. Clumps are now broad and
  // faint, crowns +/-12%, outlines wander slowly on wide ramps, stands are
  // larger, and strays only exist where single trees resolve. final5 low-12
  // and med-12 still read faintly as camouflage: crowns +/-9%, clumps +/-5%,
  // and stand edges and copse outlines ramp wider.
  expect(crownTone[1] / 2 / (crownTone[0] + crownTone[1] / 2)).toBeLessThanOrEqual(0.09);
  expect(crownReliefMetres).toBeGreaterThan(0.24);
  expect(clump).toBeLessThanOrEqual(0.05);
  expect(Math.max(...clumpScale)).toBeLessThanOrEqual(0.16);
  expect(clumpFootprint[0]).toBeLessThanOrEqual(1.0);
  expect(rag).toBeLessThanOrEqual(0.06);
  expect(ragScale).toBeLessThanOrEqual(0.06);
  expect(Math.max(...standScale)).toBeLessThanOrEqual(0.02);
  expect(woodsEdge[1] - woodsEdge[0]).toBeGreaterThanOrEqual(0.18);
  expect(copse[1] - copse[0]).toBeGreaterThanOrEqual(0.1);
  expect(strayFootprint[1]).toBeLessThanOrEqual(1.2);
  expect(fringe).toBeGreaterThan(0.03);
  expect(linearLuminance(scrub)).toBeGreaterThan(linearLuminance(woodland) * 1.3);
  const near = createRidgeMaterial(0.1, 'near-woods', true);
  const branch = near.fragmentShader.slice(
    near.fragmentShader.indexOf('if (uWorldAnchored > 0.5 && uWoodlandStrength > 0.5)'),
    near.fragmentShader.indexOf('} else if (uWorldAnchored < 0.5 && uAlpineStrength > 0.5)')
  );
  expect(branch).toContain('float clump =');
  expect(branch).toContain('float rag =');
  expect(branch).toContain('float fringe =');
  expect(branch).toContain('float strays =');
  expect(branch).toContain(`p.xz * ${ragScale.toFixed(3)}`);
  expect(branch).toContain(`p.xz * ${standScale[0].toFixed(3)}`);
  expect(branch).toContain(`p.xz * ${standScale[1].toFixed(3)}`);
  expect(branch).toContain(glslVec3Literal(scrub));
  expect(near.customProgramCacheKey()).toBe('millos-ridge-aerial-geology-v26');
  near.dispose();
});

// farm and village, final3-med-rain: a hard-edged pale arc cut across the
// mountains, which read translucent above it, with a dark ellipse floating at
// their base. Under rain cloud the far ring's lower band kept its clear-air
// thinning (0.766 x 0.55 = 0.42) while the mid foothills in front of it went
// to 0.53: nearer hills hazier than the range behind them - a fog band with an
// arced top - and near-ring hilltops at 0.28 standing dark on it. The far
// thinning now fades with the same cloudiness ramp, and the foothills take
// their haze from distance, so neither inversion can occur.
it('keeps rain haze ordered by distance from the near crest to the far lower slopes', () => {
  expect(getRidgeClearAir(0.2)).toBe(1);
  expect(getRidgeClearAir(0.9)).toBe(0);
  for (const cloudCoverage of [0.2, 0.52, 0.74, 0.9]) {
    const near = getRidgeAerialWeight(0.1, cloudCoverage);
    const mid = getRidgeAerialWeight(0.2, cloudCoverage);
    const far = getRidgeAerialWeight(0.32, cloudCoverage);
    const farLowBand =
      far * (1 + (RIDGE_ALPINE_PROFILE.lowBandAerial - 1) * getRidgeClearAir(cloudCoverage));
    // No foothill fragment, however far, is hazier than the range's lower
    // band under cloud; in clear air the farthest meet the range's own weight
    // at its distance (farm camera: a mid-ring crest at 631 m stood dark
    // above a far-ring valley at 572 m).
    const ceiling = getAnchoredRidgeAerial(1e6, near, mid, far);
    if (cloudCoverage > 0.5) expect(farLowBand).toBeGreaterThanOrEqual(ceiling - 1e-9);
    expect(getAnchoredRidgeAerial(545, near, mid, far)).toBeGreaterThan(far * 0.9);
    // The function is continuous and rises with distance.
    const [d0, d1] = RIDGE_ANCHORED_AERIAL.distances;
    expect(getAnchoredRidgeAerial(d0, near, mid)).toBeCloseTo(near, 9);
    expect(getAnchoredRidgeAerial(d1, near, mid)).toBeCloseTo(mid, 9);
    expect(getAnchoredRidgeAerial(d0 + 1, near, mid)).toBeGreaterThan(
      getAnchoredRidgeAerial(d0, near, mid)
    );
  }
  // Measured from the village camera (r4-land probe, columns x 600 and 1800):
  // the near crest at 265 / 351 m stands in front of the mid ring at 329 / 404 m.
  for (const [crest, behind] of [
    [265, 329],
    [351, 404],
  ]) {
    const step = getAnchoredRidgeAerial(behind, 0.1, 0.2) - getAnchoredRidgeAerial(crest, 0.1, 0.2);
    expect(step).toBeGreaterThan(0);
    expect(step).toBeLessThan(0.05);
  }
  // final4-med-12 farm, overview, water, shipping, tank-farm: from every camera
  // but the village the foothills stand 450-650 m off, where the run reached
  // the far ring's FULL weight (0.32) while the range's own lower slopes behind
  // them sit at 0.32 x lowBandAerial in clear air: the foothills hazed over the
  // mountains and read as one flat blue-grey backdrop band. In clear air no
  // foothill fragment is hazier than the far lower band; under cloud the band
  // thickens back to the far weight and the rain ordering above still holds.
  const clear = sampleAtmosphere(1, 12, 'clear').cloudCoverage;
  const clearAir = getRidgeClearAir(clear);
  expect(clearAir).toBe(1);
  const [nearClear, midClear, farClear] = [0.1, 0.2, 0.32].map((weight) =>
    getRidgeAerialWeight(weight, clear)
  );
  const farLowBandClear = farClear * RIDGE_ALPINE_PROFILE.lowBandAerial;
  for (const distance of [450, 545, 631, 900]) {
    expect(
      getAnchoredRidgeAerial(distance, nearClear, midClear, farClear, clearAir)
    ).toBeLessThanOrEqual(farLowBandClear + 1e-9);
  }
  // Under rain cloud the far lower band is the full far weight again.
  const rainCover = sampleAtmosphere(1, 12, 'rain').cloudCoverage;
  const rainFar = getRidgeAerialWeight(0.32, rainCover);
  expect(
    getAnchoredRidgeAerial(
      1e6,
      getRidgeAerialWeight(0.1, rainCover),
      getRidgeAerialWeight(0.2, rainCover),
      rainFar,
      getRidgeClearAir(rainCover)
    )
  ).toBeCloseTo(rainFar, 9);
  const far = createRidgeMaterial(0.32, 'far-rain');
  const near = createRidgeMaterial(0.1, 'near-rain', true);
  expect(near.fragmentShader).toContain(
    `min(uAnchoredAerial.z * mix(${RIDGE_ALPINE_PROFILE.lowBandAerial.toFixed(2)}, 1.0, 1.0 - uClearAir),`
  );
  expect(far.uniforms.uClearAir.value).toBe(1);
  expect(near.uniforms.uAnchoredAerial).toBe(RIDGE_ANCHORED_AERIAL_SPAN);
  expect(near.uniforms.uDistanceAerialStrength.value).toBe(1);
  const alpine = far.fragmentShader
    .split('} else if (uWorldAnchored < 0.5')[1]
    .split('} else {')[0];
  expect(alpine).toContain('uLowAerialStrength * uClearAir');
  far.dispose();
  near.dispose();
});

// final5-med-22 farm, x 300-475 y 160-180: a dark lens floating on the far
// range's low left shoulder (the round-3 rain judge saw the same). The far
// ring is centred on the camera; the fixed foothill rings are not, so from any
// camera off the site centre the far side of the mid ring stands 600-660 m out,
// BEHIND the far range's 573 m crest. Where that crest is low, the mid ring's
// back rows rose over it: hidden below by the far range, they floated above it
// as a separate dark band once round 5 thinned the foothills' haze. Anchored
// vertices behind the far crest now sink below the far foot.
it('keeps the fixed foothills from floating above the far range behind it', () => {
  const [far, mid, near] = MOUNTAIN_RIDGE_GEOMETRIES;
  const radius = FAR_MOUNTAIN_SPEC.radius;
  const crest = radius + FAR_MOUNTAIN_SPEC.slopeDepth;
  const bins = MOUNTAIN_RIDGE_SEGMENTS;
  const binOf = (x: number, z: number) =>
    Math.round(((Math.atan2(z, x) / (Math.PI * 2) + 1) % 1) * bins) % bins;
  const farPosition = far.getAttribute('position');
  const farHeights: Array<Array<[number, number]>> = Array.from({ length: bins }, () => []);
  for (let i = 0; i < farPosition.count; i++) {
    const x = farPosition.getX(i);
    const z = farPosition.getZ(i);
    farHeights[binOf(x, z)].push([Math.hypot(x, z), farPosition.getY(i)]);
  }
  expect(farHeights.every((column) => column.length > 0)).toBe(true);
  // Nothing in front of the far crest moves: those hills stand in front of
  // the range and read correctly.
  expect(getRidgeBehindRangeSink(crest + RIDGE_BEHIND_RANGE_SINK.ramp[0])).toBe(0);
  expect(getRidgeBehindRangeSink(radius)).toBe(0);
  expect(getRidgeBehindRangeSink(crest + RIDGE_BEHIND_RANGE_SINK.ramp[1])).toBe(1);
  let floating = 0;
  let unsunkFloating = 0;
  for (const pose of Object.values(SITE_LAYOUT.cameras) as Array<{ position?: number[] }>) {
    const camera = pose.position;
    if (!camera) continue;
    const skyline = farHeights.map((column) =>
      Math.max(...column.map(([r, h]) => Math.atan2(h - camera[1], r)))
    );
    for (const ring of [mid, near]) {
      const position = ring.getAttribute('position');
      for (let i = 0; i < position.count; i++) {
        const dx = position.getX(i) - camera[0];
        const dz = position.getZ(i) - camera[2];
        const distance = Math.hypot(dx, dz);
        if (distance <= crest) continue;
        const y = position.getY(i);
        const sunk = THREE.MathUtils.lerp(
          y,
          RIDGE_BEHIND_RANGE_SINK.floorY,
          getRidgeBehindRangeSink(distance)
        );
        const top = skyline[binOf(dx, dz)];
        if (Math.atan2(y - camera[1], distance) > top) unsunkFloating++;
        if (Math.atan2(sunk - camera[1], distance) > top) floating++;
      }
    }
  }
  // The geometry alone floats hundreds of vertices over the far range.
  expect(unsunkFloating).toBeGreaterThan(100);
  expect(floating).toBe(0);
  // The floor sits below the far foot, so a sunk vertex is always behind it.
  expect(RIDGE_BEHIND_RANGE_SINK.floorY).toBeLessThan(FAR_MOUNTAIN_SPEC.baseY);
  const material = createRidgeMaterial(0.2, 'mid-sink', true);
  expect(material.vertexShader).toContain('if (uWorldAnchored > 0.5)');
  expect(material.vertexShader).toContain('length(anchoredWorld.xz - cameraPosition.xz)');
  expect(material.vertexShader).toContain('uRingRadius + uSlopeDepth');
  material.dispose();
});
