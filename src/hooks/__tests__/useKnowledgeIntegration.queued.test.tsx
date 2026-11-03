import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useKnowledgeIntegration } from '../useKnowledgeIntegration';
import { useAINarrationStore, type NarrationEntry } from '../../stores/aiNarrationStore';

// GameInterface queues a delivered narration behind the tour, a sidebar or a
// safety state, and marks it shown only when the card mounts or is dismissed.
// Working if a one-time note still counts as unseen while it waits.
describe('queued narration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useAINarrationStore.setState({ enabled: true, shownNarrations: new Set() });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is not marked shown when it is only handed to the interface', () => {
    const delivered: NarrationEntry[] = [];
    const hook = renderHook(() =>
      useKnowledgeIntegration((narration) => {
        delivered.push(narration);
      })
    );
    act(() => {
      vi.advanceTimersByTime(1800);
    });
    expect(delivered.map((narration) => narration.id)).toEqual(['welcome-autonomous-mill']);
    // A reload now, with the tour still covering the card, must offer it again.
    expect(useAINarrationStore.getState().hasBeenShown('welcome-autonomous-mill')).toBe(false);
    hook.unmount();
  });
});
