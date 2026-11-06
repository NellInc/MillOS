import { describe, expect, it } from 'vitest';
import { workplaceCampaignMessages } from './workplaceCampaign.messages';

// Pass sixteen gave failed dispatch evidence words on three English surfaces;
// the season's own learning review still read "source evidence
// quality-failed" once a linked load failed quality.
// Working if no English evidence line prints the hyphenated id.
describe('the season learning review names failed evidence in words (pass eighteen)', () => {
  it('reads "failed quality" in English', () => {
    const line = workplaceCampaignMessages.en.reviewDelivery({
      delivered: '120',
      evidence: 'quality-failed',
      remaining: '4,680',
    });
    expect(line).not.toContain('quality-failed');
    expect(line).toMatch(/failed quality/);
  });
});
