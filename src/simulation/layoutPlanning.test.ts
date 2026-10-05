import { describe, expect, it } from 'vitest';
import { SITE_LAYOUT } from '../constants/siteLayout';
import { createMaterialFlowStore } from '../stores/materialFlowStore';
import { canonicalProcessMachines } from './materialTransport';
import {
  currentLogisticsLayout,
  DEFAULT_PLANNING_ASSUMPTIONS as assumptions,
  isEditableRoutePoint,
  minimumRoundedTurnRadius,
  optimizeLogisticsLayout,
  planningObstacles,
  roundedPlanningRoute,
  scoreLogisticsLayout,
  stagingBounds,
  type LayoutSnapshot,
} from './layoutPlanning';
import { layoutPlanDxf, layoutPlanSvg, layoutProposalJson } from './layoutPlanningExport';

describe('isolated logistics planning', () => {
  it('accepts the authored layout and improves its cost without changing fixed anchors', () => {
    const current = currentLogisticsLayout();
    const before = structuredClone(current);
    const obstacles = planningObstacles();
    const baseline = scoreLogisticsLayout(current, assumptions, obstacles);
    expect(baseline.violations).toEqual([]);
    const result = optimizeLogisticsLayout(current, assumptions, obstacles);
    const score = scoreLogisticsLayout(result.proposal, assumptions, obstacles);
    expect(result.improved).toBe(true);
    expect(result.evaluations).toBeLessThan(1500);
    expect(score.violations).toEqual([]);
    expect(score.weightedCost).toBeLessThan(baseline.weightedCost);
    expect(current).toEqual(before);
    for (const dock of ['shipping', 'receiving'] as const) {
      result.proposal.routes[dock].forEach((point, index) => {
        if (!isEditableRoutePoint(dock, index)) expect(point).toEqual(current.routes[dock][index]);
      });
      expect(minimumRoundedTurnRadius(dock, result.proposal.routes[dock])).toBeGreaterThanOrEqual(
        minimumRoundedTurnRadius(dock, current.routes[dock]) - 1e-6
      );
    }
    expect(SITE_LAYOUT.routes.forklifts.shipping.points).toEqual(before.routes.shipping);
  });

  it('reserves full asymmetric capacity and rejects fixed staging across protected access', () => {
    const plan = currentLogisticsLayout();
    expect(stagingBounds('shipping', plan.staging.shipping)).toEqual({
      minX: 15,
      maxX: 25.8,
      minZ: 54,
      maxZ: 71.75,
    });
    plan.staging.shipping = [0, 0, 73];
    expect(
      scoreLogisticsLayout(plan, assumptions).violations.some((v) =>
        v.includes('pedestrian access')
      )
    ).toBe(true);
    plan.staging.shipping = [29, 0, 73];
    expect(scoreLogisticsLayout(plan, assumptions).violations).toContain(
      'shipping: staging capacity leaves its apron.'
    );
  });

  it('checks the swept rounded path and the closed seam rather than only its vertices', () => {
    const plan = currentLogisticsLayout();
    const route = roundedPlanningRoute('receiving', plan.routes.receiving);
    const curvePoint = route.points[4];
    const onCurve = {
      id: 'rounded-corner-block',
      minX: curvePoint[0] - 0.02,
      maxX: curvePoint[0] + 0.02,
      minZ: curvePoint[2] - 0.02,
      maxZ: curvePoint[2] + 0.02,
      minY: 0,
      maxY: 2,
    };
    expect(scoreLogisticsLayout(plan, assumptions, [onCurve]).violations).toContain(
      'receiving: swept route meets rounded-corner-block.'
    );
    const first = route.points[0],
      last = route.points.at(-1)!;
    const midX = (first[0] + last[0]) / 2,
      midZ = (first[2] + last[2]) / 2;
    const seam = {
      id: 'seam-block',
      minX: midX - 0.02,
      maxX: midX + 0.02,
      minZ: midZ - 0.02,
      maxZ: midZ + 0.02,
      minY: 0,
      maxY: 2,
    };
    expect(scoreLogisticsLayout(plan, assumptions, [seam]).violations).toContain(
      'receiving: swept route meets seam-block.'
    );
  });

  it('rejects changed service poses, tight turns, nonfinite input and invalid assumptions', () => {
    expect(isEditableRoutePoint('shipping', 6)).toBe(false);
    const changedApproach = currentLogisticsLayout();
    changedApproach.routes.shipping[6][2] -= 2;
    expect(
      scoreLogisticsLayout(changedApproach, assumptions).violations.some((v) =>
        v.includes('poses must stay fixed')
      )
    ).toBe(true);
    const plan = currentLogisticsLayout();
    plan.routes.shipping[0][0] += 1;
    expect(
      scoreLogisticsLayout(plan, assumptions).violations.some((v) =>
        v.includes('poses must stay fixed')
      )
    ).toBe(true);
    const tight = currentLogisticsLayout();
    tight.routes.shipping[2] = [22.6, 0, 43];
    expect(scoreLogisticsLayout(tight, assumptions).violations).toContain(
      'shipping: proposed corners tighten the existing turning envelope.'
    );
    plan.routes.shipping[2][0] = NaN;
    expect(scoreLogisticsLayout(plan, assumptions).feasible).toBe(false);
    expect(
      scoreLogisticsLayout(currentLogisticsLayout(), { ...assumptions, crossingDelaySeconds: -1 })
        .feasible
    ).toBe(false);
  });

  it('keeps objective weights and observed queues separate from proposal production claims', () => {
    const plan = currentLogisticsLayout();
    const score = scoreLogisticsLayout(plan, {
      ...assumptions,
      weights: { travel: 0, handling: 1, crossing: 0 },
    });
    expect(score.weightedCost).toBe(score.handlingMetresPerHour);
    const flow = createMaterialFlowStore().getState();
    const snapshot: LayoutSnapshot = {
      capturedAt: '2026-10-04',
      simulationTime: 0,
      machines: canonicalProcessMachines(),
      segments: flow.network.segments,
      buffers: [...flow.machineBuffers.values()],
      obstacles: planningObstacles(),
      packerKgPerSecond: 0,
    };
    const svg = layoutPlanSvg(snapshot, plan, '<script>alert("x")</script>');
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
    expect(svg).toContain('80 m factory width');
    expect(svg).toContain('100 m factory depth');
    expect(svg).toContain('modeled paths');
    const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
    expect(parsed.querySelector('parsererror')).toBeNull();
    const dxf = layoutPlanDxf(snapshot, plan);
    expect(dxf).toContain('$INSUNITS\n70\n6');
    expect(dxf).toContain('PROCESS_MODELED');
    expect(dxf).toContain('PROTECTED_ACCESS');
    expect(dxf).toContain('STAGING_SHIPPING');
    expect(dxf.endsWith('0\nEOF\n')).toBe(true);
    const json = JSON.parse(layoutProposalJson(snapshot, plan, plan, assumptions));
    expect(json.units).toBe('metres');
    expect(json.transport).toHaveLength(flow.network.segments.length);
    expect(json.proposedScore).toEqual(json.currentScore);
  });
});
