import { afterEach, describe, expect, it } from 'vitest';
import { createWorkplace, transitionWorkplace } from './bilateralWorkplace';
import { improvementLearningReview } from './workplaceImprovement';
import { workplaceAdviceMessages } from './workplaceAdvice.messages';
import { setLocale } from '../i18n';
import type { PackingAdvice } from '../types/workplaceAdvice';

afterEach(() => setLocale('en'));

// Frozen advice keeps the sentences it was captured with; the handoff review's
// learning list quotes its abstention beside FrozenPackingAdvice, which shows
// them in the language chosen now. Working if both read in that language.
describe('handoff learning review quotes an abstention in the current language (pass eleven)', () => {
  it('rewrites an abstention captured in English after a switch to Portuguese', () => {
    setLocale('en');
    let state = createWorkplace('game', 17);
    state = transitionWorkplace(state, {
      type: 'beginImprovement',
      args: ['cooperative', state.revision],
    }).state;
    state = transitionWorkplace(state, { type: 'stop', args: [] }).state;
    expect(state.phase).toBe('review');
    const reason = workplaceAdviceMessages.en.missingOrder;
    state.improvement!.advice = { reasonToAbstain: reason } as PackingAdvice;
    expect(improvementLearningReview(state)!.evidence.join(' ')).toContain(reason);
    setLocale('pt-BR');
    const evidence = improvementLearningReview(state)!.evidence.join(' ');
    expect(evidence).not.toContain(reason);
    expect(evidence).toContain(workplaceAdviceMessages['pt-BR'].missingOrder);
  });
});
