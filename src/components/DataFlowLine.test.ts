import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  createDataFlowMaterial,
  updateDataFlowUniforms,
  FLOW_TUBE_RADIUS,
  FLOW_DASH_PERIOD_METRES,
} from './DataFlowLine';
import { PROCESS_FLOW_COLORS } from './ProductionFlowVisualization';

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
    expect(material.customProgramCacheKey()).toBe('millos-data-flow-line-v4');
    material.dispose();
  });

  it('holds a dim stationary phase while a connection is paused or blocked, then resumes', () => {
    const material = createDataFlowMaterial(PROCESS_FLOW_COLORS['mills-to-sifters'], true);
    updateDataFlowUniforms(material, true, 12);
    expect(material.uniforms.time.value).toBe(12);
    expect(material.uniforms.flowActive.value).toBe(1);
    updateDataFlowUniforms(material, false, 13);
    expect(material.uniforms.time.value).toBe(0);
    expect(material.uniforms.flowActive.value).toBe(0.3);
    updateDataFlowUniforms(material, false, 24);
    expect(material.uniforms.time.value).toBe(0);
    updateDataFlowUniforms(material, true, 25);
    expect(material.uniforms.time.value).toBe(25);
    expect(material.uniforms.flowActive.value).toBe(1);
    material.dispose();
  });
});
