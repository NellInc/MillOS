import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// A real save of the cooperative season written by the build served at
// www.millos.net before this one replaced it (v0.40-bb1932312f8a, commit
// bb193231 of 9 November), captured headless from the live site on 13 November:
// the automatic demo running, the third shift paused by the page closing at
// minute 70. Restored in this build's page, the Autonomy workspace says "A
// reload paused the final shift before its end" and offers "Resume from minute
// 70", as the live build does with the same save.
// Working if the season comes back where it stopped and can be resumed.
const raw = readFileSync(
  join(
    __dirname,
    '../simulation/__tests__/fixtures/workplace-saves/2026-11-09-bb193231-live-demo-minute-70.json'
  ),
  'utf8'
);

describe('a cooperative season saved by the live v0.40 build', () => {
  it('restores at minute 70 of the third shift, paused by the reload, and resumes', async () => {
    vi.resetModules();
    const { safeJSONStorage } = await import('./storage');
    const { useWorkplaceStore } = await import('./workplaceStore');
    const saved = JSON.parse(raw) as {
      version: number;
      state: { workplace: { revision: number; finance: { cash: number } } };
    };
    expect(saved.version).toBe(2);
    await safeJSONStorage.setItem('millos-workplace-laboratory', saved);
    await useWorkplaceStore.persist.rehydrate();
    const state = useWorkplaceStore.getState();
    expect(state.participationMode).toBe('solo');
    const workplace = state.workplace;
    expect(workplace.phase).toBe('review');
    expect(workplace.minute).toBe(70);
    expect(workplace.seed).toBe(3);
    expect(workplace.campaign?.shift).toBe(2);
    expect(workplace.campaign?.history).toHaveLength(2);
    expect(workplace.finance.cash).toBe(saved.state.workplace.finance.cash);
    expect(workplace.reviewReason).toMatch(/Reload safety/);
    expect(state.resumeShift(workplace.revision)).toMatchObject({ changed: true });
    expect(useWorkplaceStore.getState().workplace.phase).not.toBe('review');
  });
});
