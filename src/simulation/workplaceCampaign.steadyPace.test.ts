import { expect, it } from 'vitest';
import {
  createWorkplace,
  transitionWorkplace,
  workplaceCapacity,
  workplaceTickCapacity,
  WORKPLACE_PLANS,
  type WorkplaceCommand,
} from './bilateralWorkplace';
import { requiredChecks, WORKPLACE_CHECKS } from './workplaceCampaign';

// D4: cooperating is never the slow option. Outside a season the line runs at
// 1.0, so the steady plan runs it at 1.0, and no legal plan runs below it.
// Working if an active steady shift paces the plant exactly as no season does.
function activeShift(planId: 'steady' | 'resequence' | 'cover') {
  let state = createWorkplace();
  const run = (command: WorkplaceCommand) => {
    const result = transitionWorkplace(state, command);
    expect(result.changed, `${command.type}: ${result.reason}`).toBe(true);
    state = result.state;
  };
  run({ type: 'startCampaign', args: ['cooperative', 17] });
  run({ type: 'campaignDecision', args: ['keep-target', 'coordinator'] });
  if (planId !== 'steady') run({ type: 'selectPlan', args: [planId] });
  for (const actor of ['packing', 'mind']) {
    for (const id of requiredChecks(actor))
      run({
        type: 'answerCheck',
        args: [actor, id, WORKPLACE_CHECKS.find((q) => q.id === id)!.correct],
      });
    if (actor !== 'mind') run({ type: 'understand', args: [actor] });
  }
  run({ type: 'vote', args: ['packing', true] });
  if (planId === 'cover') run({ type: 'consentToCover', args: ['packing', true] });
  run({ type: 'simulateResponses', args: [] });
  run({ type: 'activate', args: [state.revision] });
  return state;
}

it('runs the line at 1.0 under the steady plan, as it runs with no season', () => {
  expect(workplaceCapacity(createWorkplace())).toBe(1);
  const steady = activeShift('steady');
  expect(steady.phase).toBe('active');
  expect(steady.planId).toBe('steady');
  expect(workplaceCapacity(steady)).toBe(1);
  expect(workplaceTickCapacity(steady, 30)).toBe(1);
});

it('runs no legal plan below the line rate with no season', () => {
  for (const plan of WORKPLACE_PLANS.filter((p) => !p.illegalReason))
    expect(plan.capacity, plan.id).toBeGreaterThanOrEqual(1);
  for (const planId of ['resequence', 'cover'] as const) {
    const shift = activeShift(planId);
    expect(workplaceCapacity(shift), planId).toBeGreaterThanOrEqual(1);
    // Cover runs out after its ten minutes and the shift falls back to steady.
    expect(workplaceTickCapacity(shift, 30), planId).toBeGreaterThanOrEqual(1);
  }
});
