import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyDecisionEffects } from './aiEngine';
import { useProductionStore } from '../stores/productionStore';
import type { AIDecision } from '../types';

vi.mock('./onDeviceOperator', () => ({ initializeOnDeviceOperator: () => () => {} }));

// An accepted load-balancing card says it "lowers the line rate by 2% (never
// below 55%)". The player's line rate runs from 0% to 200% (Settings slider,
// +/- keys). The trim clamped its result to 55-135%, so accepting it at 200%
// cut the line to 135%, and at 30% raised it to 55%.
// Working if accepting only ever lowers the rate by 2%, and leaves a rate at
// or under 55% where it is.
const card = (id: string): AIDecision =>
  ({ id, type: 'optimization', status: 'pending', machineId: 'rm-101' }) as AIDecision;

const acceptAt = (speed: number, id: string): number => {
  useProductionStore.setState({ productionSpeed: speed, aiDecisions: [] });
  applyDecisionEffects(card(id), 'accepted');
  return useProductionStore.getState().productionSpeed;
};

describe('accepting a load-balancing card', () => {
  afterEach(() => {
    useProductionStore.setState({ productionSpeed: 1, aiDecisions: [] });
  });

  it('trims a fast line by 2%, not down to 135%', () => {
    expect(acceptAt(2, 'plant-optimization-fast')).toBeCloseTo(1.96, 6);
  });

  it('never raises a slow line', () => {
    expect(acceptAt(0.3, 'plant-optimization-slow')).toBeCloseTo(0.3, 6);
  });

  it('stops at 55%', () => {
    expect(acceptAt(0.56, 'plant-optimization-floor')).toBeCloseTo(0.55, 6);
    expect(acceptAt(1, 'plant-optimization-normal')).toBeCloseTo(0.98, 6);
  });
});
