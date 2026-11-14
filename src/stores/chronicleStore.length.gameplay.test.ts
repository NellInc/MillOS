/**
 * Saves keep their length (plan item 4.2): a short chronicle restores short; a
 * save from before lengths, or one whose length is not a known one, restores as
 * the full 63-shift chronicle.
 */
import { describe, expect, it, vi } from 'vitest';

async function freshPage(persisted: unknown) {
  vi.resetModules();
  const chronicle = await import('./chronicleStore');
  const store = chronicle.useChronicleStore;
  const merge = store.persist.getOptions().merge!;
  store.setState(merge(persisted, store.getState()) as ReturnType<typeof store.getState>);
  return store;
}

async function savedWith(length: unknown) {
  const store = await freshPage(null);
  const { DEFAULT_CHARTER } = await import('../chronicle/charter');
  store.getState().sign({ ...DEFAULT_CHARTER, length: 'short' }, 17);
  const saved = JSON.parse(JSON.stringify(store.getState().chronicle));
  if (length === undefined) delete saved.charter.length;
  else saved.charter.length = length;
  return { chronicle: saved, deferredPrompts: [] };
}

describe('a chronicle’s length across a reload', () => {
  it('signs a short chronicle and saves its length', async () => {
    const store = await freshPage(null);
    const { DEFAULT_CHARTER } = await import('../chronicle/charter');
    store.getState().sign({ ...DEFAULT_CHARTER, length: 'short' }, 17);
    expect(store.getState().chronicle.charter?.length).toBe('short');
    store.getState().sign({ ...DEFAULT_CHARTER, length: 'full' }, 18);
    expect(store.getState().chronicle.charter).not.toHaveProperty('length');
  });

  it('restores a short save as short', async () => {
    const store = await freshPage(await savedWith('short'));
    const { chronicleShifts } = await import('../chronicle/schedule');
    expect(store.getState().chronicle.charter?.length).toBe('short');
    expect(chronicleShifts(store.getState().chronicle.charter)).toBe(27);
  });

  it('restores a save from before lengths as the full chronicle', async () => {
    const store = await freshPage(await savedWith(undefined));
    const { chronicleShifts } = await import('../chronicle/schedule');
    expect(store.getState().chronicle.charter).not.toHaveProperty('length');
    expect(chronicleShifts(store.getState().chronicle.charter)).toBe(63);
  });

  it('keeps where an Inspection run broke, and drops a malformed record of it (item 4.5)', async () => {
    const saved = await savedWith('short');
    const [first, second, ...rest] = saved.chronicle.trials;
    saved.chronicle.trials = [
      { ...first, brokenAt: { shift: 9, causes: ['qc'] } },
      { ...second, brokenAt: { shift: 'nine', causes: ['qc'] } },
      ...rest,
    ];
    const store = await freshPage(saved);
    const trials = store.getState().chronicle.trials;
    expect(trials[0].brokenAt).toEqual({ shift: 9, causes: ['qc'] });
    expect(trials[1]).not.toHaveProperty('brokenAt');
  });

  it('drops a length it does not know', async () => {
    const store = await freshPage(await savedWith(40));
    expect(store.getState().chronicle.charter).not.toHaveProperty('length');
    expect(store.getState().chronicle.status).toBe('active');
  });
});
