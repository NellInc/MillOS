import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  SILO_FLOOD,
  getSiloFloodLevel,
  siloFloodFixtures,
  siloFloodPools,
  writeSiloFloodLight,
} from './SiloFloodlights';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import { getExteriorLampLevel } from './ExteriorLighting';
import {
  MACHINE_MATERIALS,
  SILO_FLOOD_COLOR,
  SILO_FLOOD_HEAD_ANGLES,
  SILO_FLOOD_LIGHT,
  siloFloodHeadIrradiance,
  siloFloodIrradiance,
} from '../machines/machineSurfaces';

describe('silo battery floodlights', () => {
  it('rings each bin with heads on every face that is not 1 m from its neighbour', () => {
    const fixtures = siloFloodFixtures();
    expect(fixtures).toHaveLength(
      SITE_LAYOUT.machines.silos.length * SILO_FLOOD_HEAD_ANGLES.length
    );
    // Nothing at 90 or 270 degrees: those faces look at the next bin, 1 m away.
    expect(SILO_FLOOD_HEAD_ANGLES.some((a) => a % 180 === 90)).toBe(false);
    const radius = SITE_LAYOUT.machineDimensions.silo[0] / 2;
    for (const fixture of fixtures) {
      expect(Math.hypot(fixture.aim[0], fixture.aim[2])).toBeCloseTo(1, 9);
      // Clear of every bin, the neighbours included.
      for (const {
        position: [x, , z],
      } of SITE_LAYOUT.machines.silos) {
        expect(Math.hypot(fixture.position[0] - x, fixture.position[2] - z)).toBeGreaterThan(
          radius + 0.4
        );
      }
      expect(fixture.position[1]).toBe(0);
      // Outdoors, never inside the hall.
      expect(fixture.position[0]).toBeGreaterThan(SITE_LAYOUT.factory.bounds.maxX + 5);
    }
  });

  it('publishes the lens positions the heads are built at, and only at night', () => {
    const flood = writeSiloFloodLight(getExteriorLampLevel(22, 'clear')).clone();
    const radius = SITE_LAYOUT.machineDimensions.silo[0] / 2;
    const [x, , z] = SITE_LAYOUT.machines.silos[0].position;
    const own = siloFloodFixtures().slice(0, SILO_FLOOD_HEAD_ANGLES.length);
    for (const fixture of own) {
      const lensX = fixture.position[0] + fixture.aim[0] * SILO_FLOOD.lensInset;
      const lensZ = fixture.position[2] + fixture.aim[2] * SILO_FLOOD.lensInset;
      expect(Math.hypot(lensX - x, lensZ - z)).toBeCloseTo(flood.y, 6);
    }
    expect(flood.z).toBe(SILO_FLOOD.headY);
    expect(flood.w).toBeCloseTo(flood.y - radius, 6);
    expect(flood.x).toBeGreaterThan(0.5);
    expect(writeSiloFloodLight(getExteriorLampLevel(12, 'clear')).x).toBe(0);
    expect(SILO_FLOOD_LIGHT.value.x).toBe(0);
  });
});

/** Run a material's injection over three's real standard shader source. */
function compile(material: THREE.Material) {
  const shader = {
    uniforms: THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms),
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.physical.fragmentShader,
  };
  material.onBeforeCompile(
    shader as unknown as THREE.WebGLProgramParametersWithUniforms,
    null as unknown as THREE.WebGLRenderer
  );
  return shader;
}

describe('silo floods follow the dark, not the lamp clock (final4-med-06, final4-med-rain)', () => {
  // The shared lamp clock is max(darkness, weather floor): fully on at 06:00
  // (solar elevation 0) and at 0.42 in daytime rain. That suits a lens or a
  // window; on the floods it painted night-time uplight stripes up every drum
  // at sunrise and at noon in the rain.
  it('is off at sunrise and in daylight rain or storm', () => {
    expect(getSiloFloodLevel(6)).toBe(0);
    expect(getSiloFloodLevel(12)).toBe(0);
    expect(getSiloFloodLevel(17.9)).toBe(0);
    expect(getSiloFloodLevel(6.5)).toBe(0);
  });

  it('is on through dusk and the night, and fades in rather than switching', () => {
    expect(getSiloFloodLevel(18.5)).toBeGreaterThanOrEqual(0.9);
    expect(getSiloFloodLevel(19)).toBe(1);
    expect(getSiloFloodLevel(22)).toBe(1);
    expect(getSiloFloodLevel(2)).toBe(1);
    expect(getSiloFloodLevel(5.5)).toBeGreaterThanOrEqual(0.9);
    let previous = 0;
    let step = 0;
    for (let hour = 18; hour <= 18.6; hour += 0.01) {
      const level = getSiloFloodLevel(hour);
      expect(level).toBeGreaterThanOrEqual(previous - 1e-9);
      step = Math.max(step, level - previous);
      previous = level;
    }
    expect(step).toBeLessThan(0.05);
    expect(getSiloFloodLevel(Number.NaN)).toBe(0);
  });
});

describe('silo floods on the drum (final3-med-1830/22: hard line at the seam, black skirt)', () => {
  const radius = SITE_LAYOUT.machineDimensions.silo[0] / 2;
  const [binX, , binZ] = SITE_LAYOUT.machines.silos[2].position;
  const axis = [binX, binZ] as const;
  const night = () => writeSiloFloodLight(getExteriorLampLevel(22, 'clear')).clone();
  /** Up the line of wall facing the +X head. */
  const facing = (flood: THREE.Vector4, y: number) =>
    siloFloodIrradiance([binX + radius, y, binZ], [1, 0, 0], axis, flood);

  it('lights the skirt and the shaft continuously from the fixture to the eave', () => {
    const flood = night();
    const samples: number[] = [];
    for (let y = 0.4; y <= 30; y += 0.01) samples.push(facing(flood, y));
    const peak = Math.max(...samples);
    expect(peak).toBeGreaterThan(0);
    // The skirt (0-5 m) stood black under its own floods: now it carries them.
    expect(facing(flood, 2)).toBeGreaterThan(0.6 * peak);
    expect(facing(flood, 4.5)).toBeGreaterThan(0.5 * peak);
    // No step anywhere, including the skirt seam at 5 m and the old wash's
    // hard top: at most 2% of the peak between 1 cm samples.
    let step = 0;
    for (let i = 1; i < samples.length; i++)
      step = Math.max(step, Math.abs(samples[i] - samples[i - 1]));
    expect(step).toBeLessThan(0.02 * peak);
    // Falls away up the drum once past the head's rise, yet still reaches the eave.
    const top = samples.indexOf(peak);
    for (let i = top + 1; i < samples.length; i++)
      expect(samples[i]).toBeLessThanOrEqual(samples[i - 1] + 1e-9);
    expect(facing(flood, 29.5)).toBeGreaterThan(0.1 * peak);
    expect(facing(flood, 29.5)).toBeLessThan(0.4 * peak);
  });

  it('is a point source: inverse-square along a ray, cosine at the surface', () => {
    const flood = night();
    const head = [binX + flood.y, flood.z, binZ];
    const lit = (point: number[], normal: number[]) =>
      siloFloodHeadIrradiance(
        point as [number, number, number],
        normal as [number, number, number],
        axis,
        0,
        flood
      );
    const toward = (point: number[]) => {
      const d = head.map((h, i) => h - point[i]);
      const l = Math.hypot(...d);
      return d.map((v) => v / l);
    };
    // Low on the wall, so the face toward the head is not a down-facing ledge
    // (SILO_FLOOD_LEDGE), which takes no flood at all.
    const near = [binX + radius, 0.6, binZ + 1];
    const far = head.map((h, i) => h + 2 * (near[i] - h));
    const r2 = (p: number[]) => p.reduce((sum, v, i) => sum + (v - head[i]) ** 2, 0);
    expect(lit(far, toward(far)) * r2(far)).toBeCloseTo(lit(near, toward(near)) * r2(near), 6);
    // Tilting the receiving surface 60 degrees off the light halves it.
    const n = toward(near);
    const side = [n[2], 0, -n[0]].map((v) => v / Math.hypot(n[2], n[0]));
    const tilted = n.map((v, i) => v * 0.5 + side[i] * Math.sqrt(0.75));
    expect(lit(near, tilted)).toBeCloseTo(lit(near, n) * 0.5, 6);
  });

  it('does not blaze the down-facing ledges the near-vertical beam meets', () => {
    // The candela that carries the beam up a grazed wall is far steeper than a
    // real head's: a ring underside or the eave, square to it, took ~35x the
    // wall beside it. Nothing may take more than 1.5x the brightest wall.
    const flood = night();
    let wall = 0;
    for (let y = 0.4; y <= 30; y += 0.05) wall = Math.max(wall, facing(flood, y));
    const ringRadius = 6.08;
    for (const y of [10.4, 18.1, 25.8, 29.6]) {
      const ledge = siloFloodIrradiance([binX + ringRadius, y, binZ], [0, -1, 0], axis, flood);
      expect(ledge, `ledge at ${y} m`).toBeLessThanOrEqual(1.5 * wall);
    }
  });

  it('leaves the eave underside dark: the beam ends at the eave (final4-med-22 yard rim dashes)', () => {
    // The roof's 0.27 m overhang faces straight down at the heads. Square to a
    // near-vertical beam it took the ledge cap (6.8) between heads and 0.6
    // over each one, where its steeper ray left the beam: from the yard camera
    // a sub-pixel ring lit 1.4x the wall, broken into six dashes per bin.
    const flood = night();
    let wall = 0;
    for (let y = 0.4; y <= 30; y += 0.05) wall = Math.max(wall, facing(flood, y));
    for (let degrees = 0; degrees < 360; degrees += 1.5) {
      const a = THREE.MathUtils.degToRad(degrees);
      for (const r of [6.02, 6.15, 6.26]) {
        const underside = siloFloodIrradiance(
          [binX + r * Math.cos(a), 29.65, binZ + r * Math.sin(a)],
          [0, -1, 0],
          axis,
          flood
        );
        expect(underside, `${degrees} deg at r ${r}`).toBeLessThanOrEqual(0.1 * wall);
      }
    }
  });

  it('wraps round the drum only onto the faces a head can see', () => {
    const flood = night();
    const around = (degrees: number, y = 10) => {
      const a = THREE.MathUtils.degToRad(degrees);
      const normal = [Math.cos(a), 0, Math.sin(a)] as const;
      return siloFloodIrradiance(
        [binX + radius * normal[0], y, binZ + radius * normal[2]],
        normal,
        axis,
        flood
      );
    };
    // Two heads on +-X alone lit two thin stripes (a head 0.94 m off the wall
    // sees 30 degrees either side of its line) and left the face the silos
    // camera looks at dark. Every open face now takes light.
    for (let degrees = -60; degrees <= 60; degrees += 5) {
      expect(around(degrees), `${degrees} deg`).toBeGreaterThan(0.03 * around(0));
      expect(around(180 + degrees), `${180 + degrees} deg`).toBeGreaterThan(0.03 * around(0));
    }
    // Facing the neighbouring bins, 1 m away: no head stands there.
    expect(around(90)).toBe(0);
    expect(around(270)).toBe(0);
    // The ring is symmetric.
    expect(around(180)).toBeCloseTo(around(0), 6);
    expect(around(135)).toBeCloseTo(around(45), 6);
  });

  it('lights every galvanised part of the battery through its own BRDF', () => {
    for (const name of ['silo', 'siloSkirt', 'siloRoof', 'siloRing'] as const) {
      const shader = compile(MACHINE_MATERIALS[name]);
      expect(shader.uniforms.uMachineFlood, name).toBe(SILO_FLOOD_LIGHT);
      expect(shader.uniforms.uMachineFloodColor, name).toBe(SILO_FLOOD_COLOR);
      const fragment = shader.fragmentShader;
      // RE_Direct_Physical by name since round 8: RE_Direct is the skin's sheen wrapper.
      expect(fragment.indexOf('RE_Direct_Physical( galvFlood'), name).toBeGreaterThan(
        fragment.indexOf('#include <lights_fragment_end>')
      );
    }
  });
});

describe('silo lane pools', () => {
  it('lights the paving either side of the battery, off the pad, behind each flood', () => {
    // The yard camera's lane beside the bins was flat navy at 22:00: the
    // floods lit the drums and nothing returned to the ground.
    // One per east or west head; the diagonals stand on the pad between bins.
    const fixtures = siloFloodFixtures().filter((fixture) => fixture.aim[2] === 0);
    const pools = siloFloodPools();
    expect(pools).toHaveLength(SITE_LAYOUT.machines.silos.length * 2);
    const pad = SITE_LAYOUT.bulkStorage.siloPad;
    const padMinX = pad.position[0] - pad.size[0] / 2;
    const padMaxX = pad.position[0] + pad.size[0] / 2;
    pools.forEach((pool, index) => {
      const fixture = fixtures[index];
      expect(pool.radius).toBeGreaterThanOrEqual(5);
      // Off the pad, so the pool lies on the paving it lights.
      expect(pool.position[0] < padMinX || pool.position[0] > padMaxX).toBe(true);
      // Behind the head: on the far side from the bin it aims at.
      expect((pool.position[0] - fixture.position[0]) * fixture.aim[0]).toBeLessThan(0);
      expect(pool.position[2]).toBe(fixture.position[2]);
    });
  });
});
