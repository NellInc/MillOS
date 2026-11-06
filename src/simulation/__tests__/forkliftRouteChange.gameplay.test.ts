import { describe, expect, it } from 'vitest';
import { planForkliftRouteChange } from '../forkliftRouteChange';

// A forklift the player is driving (or returning to its lane) sits at its
// manual position, which the route reconciler cannot place on a changed route,
// so the layout apply was refused with 'run to an unchanged leg, then pause':
// advice a driven or parked forklift can never follow. Working if a manual
// forklift takes the new route at once and rejoins it when handed back.
describe('a changed route while a forklift is under manual control', () => {
  const ambiguous = () => null;
  const placed = () => ({ routeDistance: 4 });

  it('is accepted while driven or returning, whatever the reconciler says', () => {
    expect(planForkliftRouteChange('driven', ambiguous)).toEqual({ kind: 'commit', motion: null });
    expect(planForkliftRouteChange('lane', ambiguous)).toEqual({ kind: 'commit', motion: null });
  });

  it('still refuses an ambiguous corner on autopilot, and keeps the placed motion', () => {
    expect(planForkliftRouteChange('none', ambiguous)).toEqual({ kind: 'refuse' });
    expect(planForkliftRouteChange('none', placed)).toEqual({
      kind: 'commit',
      motion: { routeDistance: 4 },
    });
  });
});
