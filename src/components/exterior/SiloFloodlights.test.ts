import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  SILO_FLOOD,
  siloFloodFixtures,
  siloFloodPools,
  writeSiloFloodLight,
} from './SiloFloodlights';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import { getExteriorLampLevel } from './ExteriorLighting';
import {
  MACHINE_MATERIALS,
  SILO_FLOOD_COLOR,
  SILO_FLOOD_LIGHT,
  siloFloodHeadIrradiance,
  siloFloodIrradiance,
} from '../machines/machineSurfaces';

describe('silo battery floodlights', () => {
  it('stands two ground floods per bin on its open east and west sides', () => {
    const fixtures = siloFloodFixtures();
    expect(fixtures).toHaveLength(SITE_LAYOUT.machines.silos.length * 2);
    const radius = SITE_LAYOUT.machineDimensions.silo[0] / 2;
    for (const fixture of fixtures) {
      // Clear of every bin: the bins stand 1 m apart in Z, so only +-X is open.
      for (const {
        position: [x, , z],
      } of SITE_LAYOUT.machines.silos) {
        expect(Math.hypot(fixture.position[0] - x, fixture.position[2] - z)).toBeGreaterThan(
          radius + 0.4
        );
      }
      expect(Math.abs(fixture.aim[2])).toBe(0);
      expect(fixture.position[1]).toBe(0);
      // Outdoors, never inside the hall.
      expect(fixture.position[0]).toBeGreaterThan(SITE_LAYOUT.factory.bounds.maxX + 5);
    }
  });

  it('publishes the lens positions the heads are built at, and only at night', () => {
    const flood = writeSiloFloodLight(getExteriorLampLevel(22, 'clear')).clone();
    const radius = SITE_LAYOUT.machineDimensions.silo[0] / 2;
    const [x, , z] = SITE_LAYOUT.machines.silos[0].position;
    for (const fixture of siloFloodFixtures().filter((f) => f.position[2] === z)) {
      const lensX = fixture.position[0] + fixture.aim[0] * SILO_FLOOD.lensInset;
      expect(Math.abs(lensX - x)).toBeCloseTo(flood.y, 6);
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
        1,
        flood
      );
    const toward = (point: number[]) => {
      const d = head.map((h, i) => h - point[i]);
      const l = Math.hypot(...d);
      return d.map((v) => v / l);
    };
    const near = [binX + radius, 9, binZ + 1];
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
    expect(around(0)).toBeGreaterThan(around(30));
    expect(around(30)).toBeGreaterThan(around(60));
    // Facing the neighbouring bin, 1 m away: no head stands there.
    expect(around(90)).toBe(0);
    // The far side takes the other head, symmetrically.
    expect(around(180)).toBeCloseTo(around(0), 6);
  });

  it('lights every galvanised part of the battery through its own BRDF', () => {
    for (const name of ['silo', 'siloSkirt', 'siloRoof'] as const) {
      const shader = compile(MACHINE_MATERIALS[name]);
      expect(shader.uniforms.uMachineFlood, name).toBe(SILO_FLOOD_LIGHT);
      expect(shader.uniforms.uMachineFloodColor, name).toBe(SILO_FLOOD_COLOR);
      const fragment = shader.fragmentShader;
      expect(fragment.indexOf('RE_Direct( galvFlood'), name).toBeGreaterThan(
        fragment.indexOf('#include <lights_fragment_end>')
      );
    }
  });
});

describe('silo lane pools', () => {
  it('lights the paving either side of the battery, off the pad, behind each flood', () => {
    // The yard camera's lane beside the bins was flat navy at 22:00: the
    // floods lit the drums and nothing returned to the ground.
    const fixtures = siloFloodFixtures();
    const pools = siloFloodPools();
    expect(pools).toHaveLength(fixtures.length);
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
