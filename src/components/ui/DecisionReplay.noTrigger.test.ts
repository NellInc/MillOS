import { describe, expect, it } from 'vitest';
import * as decisionReplay from './DecisionReplay';
import * as uiBarrel from './index';

// The replay trigger wrapper lost its last caller (the decision cards open the
// replay themselves); an exported component nobody renders is dead weight that
// reads as a live entry point. Working if neither module offers it.
describe('DecisionReplay exports', () => {
  it('no longer exports the uncalled DecisionReplayTrigger', () => {
    expect(Object.keys(decisionReplay)).not.toContain('DecisionReplayTrigger');
    expect(Object.keys(uiBarrel)).not.toContain('DecisionReplayTrigger');
    expect(Object.keys(decisionReplay)).toContain('DecisionReplay');
  });
});
