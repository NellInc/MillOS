import { describe, expect, it } from 'vitest';
import * as gameFeatures from '../GameFeatures';
import * as game from './index';

// The quick-actions bar only rendered while uiStore.showGamificationBar was true,
// and nothing ever set it: not persisted, no control, no shortcut, no agent
// command. Its screenshot button was reachable only through it. The Overview
// panel's Quick Actions section is the live surface for the same controls.
describe('game feature exports', () => {
  it('no longer ships the unreachable quick-actions bar or its screenshot button', () => {
    expect(Object.keys(game)).not.toContain('GamificationBar');
    expect(Object.keys(game)).not.toContain('ScreenshotButton');
    expect(Object.keys(gameFeatures)).not.toContain('GamificationBar');
    expect(Object.keys(gameFeatures)).not.toContain('ScreenshotButton');
  });
});
