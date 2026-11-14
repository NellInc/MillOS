import { describe, expect, it } from 'vitest';
import { safetyConfigPanelMessages } from '../SafetyConfigPanel.messages';

// The panel carried four "Help" lines and a note on what the sliders drive
// (the speed-zone note once said the rate was not enforced, then that it was).
// D-012 cut them: each control is its label, its value and its slider.
// Working if neither language keeps a help line or the note
// (SafetyPanel.forkliftStop.gameplay.test.tsx renders the panel).
describe('Safety Config carries no help lines', () => {
  it('has no help line or enforcement note in either language', () => {
    for (const table of [safetyConfigPanelMessages.en, safetyConfigPanelMessages['pt-BR']]) {
      const keys = Object.keys(table);
      expect(keys.filter((key) => /Help$|Label$|Note$/.test(key))).toEqual([]);
    }
  });
});
