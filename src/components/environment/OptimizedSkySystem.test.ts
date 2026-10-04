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
  MOUNTAIN_RIDGE_GEOMETRIES,
  CELESTIAL_RADIUS,
  createRidgeMaterial,
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
      for (let column = 0; column < MOUNTAIN_RIDGE_SEGMENTS; column++) {
        const foot = column * MOUNTAIN_RIDGE_ROWS;
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
    const summits = Array.from({ length: MOUNTAIN_RIDGE_SEGMENTS }, (_, index) =>
      positions.getY(index * MOUNTAIN_RIDGE_ROWS + MOUNTAIN_RIDGE_ROWS - 1)
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
});

describe('solid fixed foothills', () => {
  it('writes opaque terrain depth without a height-based alpha hole', () => {
    for (const anchored of [false, true]) {
      const material = createRidgeMaterial(0.08, 'test-ridge', anchored);
      expect(material.transparent).toBe(false);
      expect(material.depthWrite).toBe(true);
      expect(material.fragmentShader).toContain('gl_FragColor = vec4(lit, 1.0)');
      expect(material.fragmentShader).not.toContain('groundBlend');
      expect(material.fragmentShader).not.toContain('sampler');
      expect(material.customProgramCacheKey()).toBe('millos-ridge-aerial-geology-v8');
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
      for (let column = 0; column < MOUNTAIN_RIDGE_SEGMENTS; column++) {
        const foot = column * MOUNTAIN_RIDGE_ROWS;
        const x = positions.getX(foot),
          z = positions.getZ(foot);
        expect(positions.getY(foot)).toBeLessThan(sampleValleyGroundHeight(x, z, 128));
      }
      material.dispose();
    }
  });
});

describe('single sun/moon shadowed key', () => {
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
  expect(
    Array.from(MOUNTAIN_RIDGE_GEOMETRIES[2].getAttribute('ridgeSnow').array).every((x) => x === 0)
  ).toBe(true);
});
