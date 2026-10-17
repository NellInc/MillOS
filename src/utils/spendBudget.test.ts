import { beforeEach, describe, expect, it } from 'vitest';
import { SpendBudget, SpendCapError } from './spendBudget';

describe('BYOK session budget', () => {
  beforeEach(() => sessionStorage.clear());

  it('reserves overlapping requests before dispatch and releases only known usage', () => {
    const budget = new SpendBudget();
    budget.setCap(0.01);
    const ids = Array.from({ length: 4 }, () => budget.reserve('Plant status', 4096));
    expect(() => budget.reserve('Plant status', 4096)).toThrow(SpendCapError);
    budget.settle(ids[0], { inputTokens: 100, outputTokens: 50 });
    expect(budget.getSnapshot().requestCount).toBe(1);
    expect(budget.getSnapshot().spentUsd).toBeCloseTo(0.000035);
    expect(() => budget.reserve('Plant status', 4096)).not.toThrow();
  });

  it('retains unknown dispatched charges across reload and does not offer a reset', () => {
    const budget = new SpendBudget();
    budget.setCap(0.01);
    const id = budget.reserve('Plant status', 4096);
    budget.uncertain(id);
    expect(budget.getSnapshot().uncertainUsd).toBeGreaterThan(0);
    const inFlight = budget.reserve('Plant status', 4096);
    expect(inFlight).toBeGreaterThan(0);
    const reloaded = new SpendBudget();
    expect(reloaded.getSnapshot().reservedUsd).toBe(0);
    expect(reloaded.getSnapshot().uncertainUsd).toBeCloseTo(
      budget.getSnapshot().uncertainUsd + budget.getSnapshot().reservedUsd
    );
  });
});
