import { describe, expect, it } from 'vitest';
import { workplaceLabMessages } from './WorkplaceLab.messages';
import { CAMPAIGN_SHIFTS } from '../../../simulation/workplaceCampaign';

// The Lab's "Recorded decision" line and its shift history printed the
// campaign decision by its raw machine id in English ("Recorded decision:
// keep-target.", "decision protect-refusal"), while Portuguese read words and
// the receipts beside them now open with the decision's label.
// Working if no English decision label is a hyphenated id.
describe('the Lab names campaign decisions in words, in English too', () => {
  const ids = [...new Set(CAMPAIGN_SHIFTS.flatMap((shift) => shift.choices.map((c) => c.id)))];
  it.each(ids)('%s', (decision) => {
    for (const locale of ['en', 'pt-BR'] as const) {
      const label = workplaceLabMessages[locale].decisionLabel({ decision });
      expect(label).not.toContain('-');
      expect(label).not.toBe(decision.includes('-') ? decision : '');
    }
  });
});
