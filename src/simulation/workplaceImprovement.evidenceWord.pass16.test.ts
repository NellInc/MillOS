import { describe, expect, it } from 'vitest';
import { workplaceImprovementMessages } from './workplaceImprovement.messages';
import { workplaceImprovementPanelMessages } from '../components/ui-new/widgets/WorkplaceImprovementPanel.messages';
import { workplacePressureChapterMessages } from '../components/ui-new/widgets/WorkplacePressureChapter.messages';

// Linked dispatch evidence that failed quality printed its raw id in English
// on three surfaces ("Source evidence: quality-failed.", "4,800 kg;
// quality-failed evidence", "Dispatch evidence: quality-failed."), while the
// season archive and every Portuguese line read words.
// Working if no English evidence line prints the hyphenated id.
describe('failed dispatch evidence reads as words in English', () => {
  it('in the handoff learning review, the handoff panel and the pressure chapter', () => {
    const lines = [
      workplaceImprovementMessages.en.evidenceReceipts({
        credited: '1',
        owed: '2',
        evidence: 'quality-failed',
      }),
      workplaceImprovementPanelMessages.en.commitmentValue({
        kg: '1',
        evidence: 'quality-failed',
      }),
      workplacePressureChapterMessages.en.evidenceStatus({ status: 'quality-failed' }),
    ];
    for (const line of lines) {
      expect(line).not.toContain('quality-failed');
      expect(line).toMatch(/failed quality/);
    }
  });
});
