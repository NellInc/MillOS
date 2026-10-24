import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  createDataFlowMaterial,
  createDataFlowGeometry,
  PROCESS_FLOW_SLEEVE_RADIUS,
  updateDataFlowUniforms,
  FLOW_TUBE_RADIUS,
  FLOW_DASH_PERIOD_METRES,
  advanceDataFlowClock,
} from './DataFlowLine';
import { lineMotionRate } from '../simulation/lineFlow';
import { STANDARD_GAME_SPEED } from '../simulation/pace';
import { PROCESS_FLOW_COLORS } from './ProductionFlowVisualization';
import {
  createSpoutTubeGeometry,
  createMachineSpoutRoute,
  SPOUT_PIPE_RADIUS,
} from './flow/spoutRoutes';
import { MachineType } from '../types';

describe('restrained process flow signals', () => {
  it('preserves three distinguishable process stages without borrowing alarm colours', () => {
    expect(new Set(Object.values(PROCESS_FLOW_COLORS)).size).toBe(3);
    for (const color of Object.values(PROCESS_FLOW_COLORS)) {
      const hsl = new THREE.Color(color).getHSL({ h: 0, s: 0, l: 0 });
      expect(hsl.s).toBeLessThan(0.65);
      expect(hsl.l).toBeGreaterThan(0.2);
    }
  });

  it('keeps the flow mesh thin, depth-tested and free of opaque trails', () => {
    const material = createDataFlowMaterial(PROCESS_FLOW_COLORS['silos-to-mills'], true);
    expect(FLOW_TUBE_RADIUS).toBeGreaterThanOrEqual(0.03);
    expect(FLOW_TUBE_RADIUS).toBeLessThan(0.04);
    expect(FLOW_DASH_PERIOD_METRES).toBe(3.5);
    expect(material.depthTest).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.blending).toBe(THREE.AdditiveBlending);
    expect(material.customProgramCacheKey()).toBe('millos-data-flow-line-v5');
    material.dispose();
  });

  it('fits its signal sleeve just outside the exact physical sweep, including every elbow', () => {
    const from = {
      id: 'mill',
      type: MachineType.ROLLER_MILL,
      position: [-15, 0, -6],
      size: [4, 4, 4],
    } as const;
    const to = {
      id: 'sifter',
      type: MachineType.PLANSIFTER,
      position: [-15, 9, 6],
      size: [4, 4, 4],
    } as const;
    const route = createMachineSpoutRoute(
      { ...from, position: [...from.position], size: [...from.size] },
      { ...to, position: [...to.position], size: [...to.size] },
      0
    )!;
    const signal = createDataFlowGeometry([0, 0, 0], [1, 1, 1], 24, route.curve);
    const pipe = createSpoutTubeGeometry(route.curve, 12);
    expect(signal.parameters.radius).toBe(PROCESS_FLOW_SLEEVE_RADIUS);
    expect(PROCESS_FLOW_SLEEVE_RADIUS * Math.cos(Math.PI / 12)).toBeGreaterThan(SPOUT_PIPE_RADIUS);
    expect(signal.attributes.position.count).toBe(pipe.attributes.position.count);
    const sampling = signal.parameters.path;
    const rings = signal.parameters.tubularSegments,
      stride = 13;
    const point = new THREE.Vector3(),
      normal = new THREE.Vector3();
    for (let ring = 0; ring <= rings; ring++) {
      const centre = sampling.getPointAt(ring / rings);
      for (let segment = 0; segment < stride; segment++) {
        const index = ring * stride + segment;
        point.fromBufferAttribute(signal.attributes.position, index);
        expect(point.distanceTo(centre)).toBeCloseTo(PROCESS_FLOW_SLEEVE_RADIUS, 5);
        point.fromBufferAttribute(pipe.attributes.position, index);
        normal.fromBufferAttribute(pipe.attributes.normal, index);
        point.addScaledVector(normal, PROCESS_FLOW_SLEEVE_RADIUS - SPOUT_PIPE_RADIUS);
        expect(
          point.distanceTo(
            new THREE.Vector3().fromBufferAttribute(signal.attributes.position, index)
          )
        ).toBeLessThan(0.00001);
      }
    }
    // Elbows receive extra rings, but dashes retain distance-based phase.
    const uv = signal.attributes.uv;
    let minStep = Infinity,
      maxStep = 0;
    for (let ring = 1; ring <= rings; ring++) {
      const phaseStep = uv.getX(ring * stride) - uv.getX((ring - 1) * stride);
      const distance = sampling
        .getPointAt(ring / rings)
        .distanceTo(sampling.getPointAt((ring - 1) / rings));
      minStep = Math.min(minStep, phaseStep);
      maxStep = Math.max(maxStep, phaseStep);
      expect(phaseStep).toBeGreaterThan(0);
      if (ring > 1) {
        const priorStep = uv.getX((ring - 1) * stride) - uv.getX((ring - 2) * stride);
        const priorDistance = sampling
          .getPointAt((ring - 1) / rings)
          .distanceTo(sampling.getPointAt((ring - 2) / rings));
        expect(phaseStep / distance).toBeCloseTo(priorStep / priorDistance, 5);
      }
    }
    expect(maxStep / minStep).toBeGreaterThan(10);
    expect(uv.getX(0)).toBe(0);
    expect(uv.getX(rings * stride)).toBe(1);
    signal.dispose();
    pipe.dispose();
  });

  it('retains the original thin arc for a point-to-point caller without a physical path', () => {
    const geometry = createDataFlowGeometry([0, 2, 0], [10, 2, 0], 24);
    expect(geometry.parameters.radius).toBe(FLOW_TUBE_RADIUS);
    expect(geometry.parameters.tubularSegments).toBe(24);
    expect(geometry.parameters.path.getPointAt(0).toArray()).toEqual([0, 2, 0]);
    expect(geometry.parameters.path.getPointAt(1).toArray()).toEqual([10, 2, 0]);
    geometry.dispose();
  });

  it('holds a dim stationary phase while a connection is paused or blocked, then resumes', () => {
    const material = createDataFlowMaterial(PROCESS_FLOW_COLORS['mills-to-sifters'], true);
    updateDataFlowUniforms(material, true, 12);
    expect(material.uniforms.time.value).toBe(12);
    expect(material.uniforms.flowActive.value).toBe(1);
    // Paused, the dashes stay where they stopped: no snap back to phase 0.
    updateDataFlowUniforms(material, false, 12);
    expect(material.uniforms.time.value).toBe(12);
    expect(material.uniforms.flowActive.value).toBe(0.3);
    updateDataFlowUniforms(material, true, 12.25);
    expect(material.uniforms.time.value).toBe(12.25);
    expect(material.uniforms.flowActive.value).toBe(1);
    material.dispose();
  });

  /**
   * r8 shell: the dashes were driven by `materialFlowStore.simulationTime`,
   * which advances only on the 0.5 s central tick, by 0.4 plant seconds at
   * standard pace. That is a 1.4 m jump twice a second and nothing between: two
   * frames 100 ms apart showed the same bands, so the flow read as stripes in
   * motion as well as in a still. The dash clock now advances every frame.
   */
  it('moves the dashes between simulation ticks, at the line pace, and holds them when stopped', () => {
    const frame = 1 / 60;
    const pace = lineMotionRate(0.8, STANDARD_GAME_SPEED, false);
    let clock = 0;
    const seen: number[] = [];
    // 100 ms of frames: well inside one 0.5 s simulation tick.
    for (let i = 0; i < 6; i++) {
      clock = advanceDataFlowClock(clock, frame, true, pace);
      seen.push(clock);
    }
    expect(new Set(seen).size).toBe(6);
    // 0.8 plant seconds per real second at standard pace: 2.8 m/s along the run.
    expect(clock).toBeCloseTo(0.1 * 0.8, 6);
    expect(clock * FLOW_DASH_PERIOD_METRES).toBeCloseTo(0.28, 6);
    // A step never crosses more than a few hundredths of a dash period.
    expect(advanceDataFlowClock(0, frame, true, pace)).toBeLessThan(0.02);
    // Blocked, paused, safety-held or a frame hitch: the phase holds or is clamped.
    expect(advanceDataFlowClock(5, frame, false, pace)).toBe(5);
    expect(advanceDataFlowClock(5, frame, true, lineMotionRate(0.8, 0, false))).toBe(5);
    expect(
      advanceDataFlowClock(5, frame, true, lineMotionRate(0.8, STANDARD_GAME_SPEED, true))
    ).toBe(5);
    expect(advanceDataFlowClock(5, 4, true, pace)).toBeLessThan(5 + 0.2 * pace);
  });

  it('draws each dash as a directional pulse, a hard head and a fading tail', () => {
    const material = createDataFlowMaterial(PROCESS_FLOW_COLORS['sifters-to-packers'], true);
    // A symmetric band with a flat top and two equal edges reads as a painted
    // stripe when the frame is frozen; a head-and-tail reads as travel.
    expect(material.fragmentShader).toContain('DATA_FLOW_PULSE');
    expect(material.customProgramCacheKey()).toBe('millos-data-flow-line-v5');
    material.dispose();
  });
});
