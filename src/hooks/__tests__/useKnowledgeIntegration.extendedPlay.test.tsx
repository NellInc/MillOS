import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useKnowledgeIntegration } from '../useKnowledgeIntegration';
import { useAINarrationStore, type NarrationEntry } from '../../stores/aiNarrationStore';

// The hour-long session note is the only narration gated on play time.
describe('extended-play narration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useAINarrationStore.setState({
      enabled: true,
      shownNarrations: new Set(['welcome-autonomous-mill']),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is delivered once the session has run for an hour', () => {
    const shown: NarrationEntry[] = [];
    const hook = renderHook(() =>
      useKnowledgeIntegration((narration) => {
        shown.push(narration);
      })
    );
    for (let minute = 0; minute < 61; minute++) {
      act(() => {
        vi.advanceTimersByTime(60000);
      });
    }
    expect(shown.map((narration) => narration.id)).toContain('extended-autonomous-session');
    hook.unmount();
  });
});
