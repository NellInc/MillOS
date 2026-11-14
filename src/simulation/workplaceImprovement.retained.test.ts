import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createWorkplace,
  displayEventDetail,
  restoreWorkplace,
  saveWorkplace,
  transitionWorkplace,
  type WorkplaceCommand,
} from './bilateralWorkplace';
import {
  HANDOFF_EPISODE_CHOICES,
  improvementCost,
  retainedImprovement,
} from './workplaceImprovement';
import type { WorkplaceState } from '../types/workplace';

const FIXTURES = join(__dirname, '__tests__/fixtures/workplace-saves');
const fixture = (name: string) => JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'));

function handoff() {
  let state = createWorkplace('game', 17);
  const run = (command: WorkplaceCommand) => {
    const result = transitionWorkplace(state, command);
    expect(result.changed, `${command.type}: ${result.reason}`).toBe(true);
    state = result.state;
  };
  /** One paid trial of whatever is proposed, decided with one verdict. */
  const cycle = (verdict: 'adopt' | 'stop') => {
    run({ type: 'acknowledgeImprovement', args: [] });
    for (const m of state.members) {
      run({ type: 'understand', args: [m.id] });
      run({ type: 'vote', args: [m.id, true] });
    }
    run({ type: 'activate', args: [state.revision] });
    while (state.phase === 'active') run({ type: 'tick', args: [10, 0, false] });
    run({ type: 'acknowledgeImprovementReview', args: [] });
    for (const m of state.members) run({ type: 'voteImprovementReview', args: [m.id, verdict] });
    run({ type: 'finishImprovementReview', args: [state.revision] });
  };
  return {
    run,
    cycle,
    get state() {
      return state;
    },
    set state(value: WorkplaceState) {
      state = value;
    },
  };
}

describe('5.9: an adopted arrangement outlives its cycle and its experiment', () => {
  it('is still in place, bought once, after the experiment closes and a new one begins', () => {
    const h = handoff();
    h.run({ type: 'beginImprovement', args: ['cooperative', h.state.revision] });
    h.run({ type: 'proposeImprovement', args: ['briefing', 'packing'] });
    h.cycle('adopt');
    h.run({ type: 'closeImprovement', args: [h.state.revision] });
    expect(h.state.phase).toBe('idle');
    // Across a reload too.
    h.state = restoreWorkplace(saveWorkplace(h.state));
    h.run({ type: 'beginImprovement', args: ['cooperative', h.state.revision] });
    h.run({ type: 'proposeImprovement', args: ['briefing', 'packing'] });
    expect(retainedImprovement(h.state)).toBe('briefing');
    expect(improvementCost(h.state)).toBe(0);
    h.run({ type: 'proposeImprovement', args: ['buffer', 'maintenance'] });
    expect(improvementCost(h.state)).toBe(32);
    // Running the briefing again costs nothing, and the save of that holds.
    h.run({ type: 'proposeImprovement', args: ['briefing', 'packing'] });
    const cash = h.state.finance.cash;
    h.cycle('stop');
    expect(h.state.finance.improvementSpend).toBe(0);
    expect(cash - h.state.finance.cash).toBeCloseTo(108, 6);
    const restored = restoreWorkplace(saveWorkplace(h.state));
    expect(restored.improvement?.verdict).toBe('stop');
    expect(restored.finance).toEqual(h.state.finance);
    // A later cycle that ran it ended otherwise: it is no longer in place.
    h.run({ type: 'closeImprovement', args: [h.state.revision] });
    h.run({ type: 'beginImprovement', args: ['cooperative', h.state.revision] });
    h.run({ type: 'proposeImprovement', args: ['briefing', 'packing'] });
    expect(improvementCost(h.state)).toBe(8);
  });
});

describe('5.9: handoff episode answers that do something', () => {
  it('offers only answers with an effect: run the trial, or defer it', () => {
    expect(HANDOFF_EPISODE_CHOICES.map((c) => c.id)).toEqual(['ordinary', 'defer']);
    const h = handoff();
    h.run({ type: 'beginImprovement', args: ['cooperative', h.state.revision] });
    h.run({ type: 'proposeImprovement', args: ['briefing', 'packing'] });
    h.run({ type: 'setImprovementEpisode', args: ['late-truck'] });
    for (const removed of ['smaller-delivery', 'decline'])
      expect(
        transitionWorkplace(h.state, {
          type: 'respondImprovementEpisode',
          args: ['packing', removed],
        } as WorkplaceCommand).changed
      ).toBe(false);
    // "Keep qualified ordinary work": the trial runs and is bought.
    h.run({ type: 'respondImprovementEpisode', args: ['packing', 'ordinary'] });
    h.cycle('stop');
    expect(h.state.finance.improvementSpend).toBe(8);
    expect(h.state.improvement?.stopped).toBe(false);
  });

  it('an old save that answered with a removed choice restores, labelled, and runs', () => {
    const saved = fixture('2026-11-13-pre-5b-handoff-episode-smaller-delivery.json');
    const state = restoreWorkplace(saved);
    expect(state.improvement?.episode).toEqual({
      id: 'late-truck',
      actorId: 'packing',
      choice: 'smaller-delivery',
    });
    // Its receipt, as recorded, still reads as words, not the stored id.
    const receipt = (saved as WorkplaceState).events.find(
      (e) => e.kind === 'improvement-episode-response'
    )!;
    expect(displayEventDetail(receipt.detail)).not.toMatch(/smaller-delivery/);
    const h = handoff();
    h.state = state;
    h.run({ type: 'resumeShift', args: [state.revision] });
    h.cycle('stop');
    expect(h.state.phase).toBe('review');
  });
});
