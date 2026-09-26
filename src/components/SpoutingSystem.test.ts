import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createSpoutTubeGeometry, getSpoutRouteMaterials } from './SpoutingSystem';
import { SITE_LAYOUT, MILL_PROCESS_PORTS, SIFTER_LAYOUT } from '../constants/siteLayout';
import { MachineType, type MachineData } from '../types';
import { buildSpoutRoutes, SPOUT_PIPE_RADIUS } from './flow/spoutRoutes';
import { ORM_MEAN_ROUGHNESS, PIPE_MATERIALS } from '../utils/sharedMaterials';
import { generateMachinePanelNormal, generateProceduralNormal } from '../textures/normalGenerator';

describe('process spouting finishes', () => {
  it('keeps distinct paint and galvanised metal finishes at their intended final roughness', () => {
    const materials = getSpoutRouteMaterials();
    for (const [family, expected] of Object.entries({
      intake: 0.42,
      pneumatic: 0.38,
      finished: 0.32,
    })) {
      const material = materials[family as keyof typeof materials];
      expect(material.roughness * ORM_MEAN_ROUGHNESS).toBeCloseTo(expected, 5);
      expect(material.roughnessMap).toBeDefined();
      expect(material.roughness).toBeLessThanOrEqual(1);
      expect(material.metalness).toBe(family === 'pneumatic' ? 0 : 1);
      expect(material.map).toBeNull();
      expect(material.name).toBe(`process-spout-${family}`);
    }
  });

  it('shares one fine rolled-sheet normal without mutating the global pipe library', () => {
    const materials = getSpoutRouteMaterials();
    const normal = materials.intake.normalMap!;
    expect(normal).toBe(materials.pneumatic.normalMap);
    expect(normal).toBe(materials.finished.normalMap);
    expect(normal.colorSpace).toBe(THREE.NoColorSpace);
    expect(normal.repeat.toArray()).toEqual([6, 1]);
    expect(normal.source).toBe(generateProceduralNormal(256, 0.12, 16).source);
    expect(normal).not.toBe(generateProceduralNormal(256, 0.12, 16));
    expect(normal.source).not.toBe(generateMachinePanelNormal(256, 4, 6).source);
    expect(materials.intake).not.toBe(PIPE_MATERIALS.lightPipe);
    expect(materials.finished).not.toBe(PIPE_MATERIALS.lightPipe);
    expect(PIPE_MATERIALS.lightPipe.color.getHexString()).toBe('c5d0cf');
    expect(PIPE_MATERIALS.lightPipe.roughness).toBe(0.72);
    expect(PIPE_MATERIALS.whitePipe.color.getHexString()).toBe('dde2dc');
    expect(getSpoutRouteMaterials()).toBe(materials);
  });
});

const siteMachineGroups = [
  [SITE_LAYOUT.machines.silos, MachineType.SILO, SITE_LAYOUT.machineDimensions.silo],
  [
    SITE_LAYOUT.machines.rollerMills,
    MachineType.ROLLER_MILL,
    SITE_LAYOUT.machineDimensions.rollerMill,
  ],
  [SITE_LAYOUT.machines.sifters, MachineType.PLANSIFTER, SITE_LAYOUT.machineDimensions.sifter],
  [SITE_LAYOUT.machines.packers, MachineType.PACKER, SITE_LAYOUT.machineDimensions.packer],
] as const;
const siteMachines = siteMachineGroups.flatMap(([anchors, type, size]) =>
  anchors.map((anchor) => ({ ...anchor, position: [...anchor.position], type, size: [...size] }))
) as MachineData[];

describe('shared service-rack routes', () => {
  it('preserves every real source and destination port and status-only cache identity', () => {
    const routes = buildSpoutRoutes(siteMachines);
    expect(routes).toHaveLength(11);
    const assertPort = (index: number, start: readonly number[], end: readonly number[]) => {
      expect(routes[index].curve.getPointAt(0).toArray()).toEqual(start);
      expect(
        routes[index].curve
          .getPointAt(1)
          .distanceTo(new THREE.Vector3(...(end as [number, number, number])))
      ).toBeLessThan(1e-8);
    };
    SITE_LAYOUT.machines.rollerMills.forEach((mill, index) => {
      const silo = SITE_LAYOUT.machines.silos[index % SITE_LAYOUT.machines.silos.length];
      const sifter = SITE_LAYOUT.machines.sifters[index % SITE_LAYOUT.machines.sifters.length];
      assertPort(
        index,
        [silo.position[0], 3, silo.position[2]],
        [mill.position[0], mill.position[1] + MILL_PROCESS_PORTS.intake[1], mill.position[2]]
      );
      assertPort(
        4 + index,
        [mill.position[0], mill.position[1] + MILL_PROCESS_PORTS.pneumatic[1], mill.position[2]],
        [
          sifter.position[0],
          sifter.position[1] + SIFTER_LAYOUT.inletCentreY + SIFTER_LAYOUT.inletHeight / 2,
          sifter.position[2],
        ]
      );
    });
    SITE_LAYOUT.machines.packers.forEach((packer, index) => {
      const sifter = SITE_LAYOUT.machines.sifters[index];
      assertPort(
        8 + index,
        [sifter.position[0], sifter.position[1] - 2, sifter.position[2]],
        [
          packer.position[0],
          packer.position[1] + SITE_LAYOUT.machineDimensions.packer[1] + 1,
          packer.position[2],
        ]
      );
    });
    expect(
      buildSpoutRoutes(
        siteMachines.map((machine) => ({
          ...machine,
          status: 'OFFLINE',
        })) as unknown as MachineData[]
      )
    ).toBe(routes);
  });

  it('contains the full grain-flow network in shared bounds, including bore jitter', () => {
    for (const route of buildSpoutRoutes(siteMachines)) {
      for (const point of route.curve.getPoints(40)) {
        for (const axis of ['x', 'y', 'z'] as const) {
          expect(point[axis] - SPOUT_PIPE_RADIUS).toBeGreaterThanOrEqual(
            route.bounds.min[axis] - 1e-8
          );
          expect(point[axis] + SPOUT_PIPE_RADIUS).toBeLessThanOrEqual(
            route.bounds.max[axis] + 1e-8
          );
        }
      }
    }
  });

  it('keeps bends tangent and wide enough for the physical bore', () => {
    for (const route of buildSpoutRoutes(siteMachines)) {
      expect(Number.isFinite(route.length)).toBe(true);
      for (const [index, curve] of route.curve.curves.entries()) {
        expect(
          curve instanceof THREE.LineCurve3 || curve instanceof THREE.QuadraticBezierCurve3
        ).toBe(true);
        if (curve instanceof THREE.QuadraticBezierCurve3) {
          // A quadratic quarter bend has minimum radius setback / sqrt(2).
          expect(
            Math.min(curve.v0.distanceTo(curve.v1), curve.v1.distanceTo(curve.v2)) / Math.SQRT2
          ).toBeGreaterThan(SPOUT_PIPE_RADIUS);
        }
        if (index > 0) {
          const previous = route.curve.curves[index - 1];
          expect(previous.getPoint(1).distanceTo(curve.getPoint(0))).toBeLessThan(1e-8);
          expect(previous.getTangent(1).dot(curve.getTangent(0))).toBeGreaterThan(0.999);
        }
      }
    }
  });

  it('sweeps the same grain-flow bore with bounded vertices across quality tiers', () => {
    for (const radial of [6, 8, 12]) {
      let triangles = 0;
      for (const route of buildSpoutRoutes(siteMachines)) {
        const geometry = createSpoutTubeGeometry(route.curve, radial);
        const positions = geometry.attributes.position,
          normals = geometry.attributes.normal;
        const centres: THREE.Vector3[] = [];
        let maximumNormalError = 0;
        for (let ring = 0; ring <= geometry.parameters.tubularSegments; ring++) {
          const centre = new THREE.Vector3();
          for (let segment = 0; segment < radial; segment++) {
            const index = ring * (radial + 1) + segment;
            centre.add(new THREE.Vector3().fromBufferAttribute(positions, index));
            maximumNormalError = Math.max(
              maximumNormalError,
              Math.abs(new THREE.Vector3().fromBufferAttribute(normals, index).length() - 1)
            );
          }
          centres.push(centre.divideScalar(radial));
        }
        expect(maximumNormalError).toBeLessThan(1e-6);
        expect(centres[0].distanceTo(route.curve.getPointAt(0))).toBeLessThan(1e-5);
        expect(centres[centres.length - 1].distanceTo(route.curve.getPointAt(1))).toBeLessThan(
          1e-5
        );
        const segments = centres
          .slice(1)
          .map((point, index) => new THREE.Line3(centres[index], point));
        const closest = new THREE.Vector3();
        let maximumError = 0;
        for (let sample = 0; sample <= 250; sample++) {
          const particle = route.curve.getPointAt(sample / 250);
          const distance = Math.min(
            ...segments.map((segment) =>
              segment.closestPointToPoint(particle, true, closest).distanceTo(particle)
            )
          );
          maximumError = Math.max(maximumError, distance);
        }
        expect(maximumError, route.family).toBeLessThan(SPOUT_PIPE_RADIUS * 0.1);
        triangles += geometry.index!.count / 3;
        geometry.dispose();
      }
      // The rejected uniform sweep was 41,256 triangles. Elbow-aware sampling
      // stays near the prior 8,448-triangle network while resolving each turn.
      expect(triangles).toBeLessThan(10_000);
    }
  });
});
