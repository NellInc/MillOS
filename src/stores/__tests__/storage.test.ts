import { beforeEach, describe, expect, it, vi } from 'vitest';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// suspendPersistence lasts for the rest of the page's life, so each test
// loads a fresh copy of the module.
const loadStorage = async () => {
  vi.resetModules();
  return import('../storage');
};

describe('safeJSONStorage persistence suspension', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('writes normally until suspended', async () => {
    const { safeJSONStorage } = await loadStorage();
    await safeJSONStorage.setItem('millos-test', { state: { n: 1 }, version: 0 });
    expect(await safeJSONStorage.getItem('millos-test')).toEqual({ state: { n: 1 }, version: 0 });
  });

  it('setItem after suspendPersistence writes nothing', async () => {
    const { safeJSONStorage, suspendPersistence } = await loadStorage();
    suspendPersistence();
    await safeJSONStorage.setItem('millos-test', { state: { n: 2 }, version: 0 });
    expect(await safeJSONStorage.getItem('millos-test')).toBeNull();
  });

  it('without suspension a store write after the clear resurrects the key (the reset race)', async () => {
    const { safeJSONStorage } = await loadStorage();
    const useStore = create<{ n: number; bump: () => void }>()(
      persist((set) => ({ n: 0, bump: () => set((s) => ({ n: s.n + 1 })) }), {
        name: 'millos-test-store',
        storage: safeJSONStorage,
      })
    );
    await safeJSONStorage.removeItem('millos-test-store');
    useStore.getState().bump();
    expect(await safeJSONStorage.getItem('millos-test-store')).not.toBeNull();
  });

  it('a cleared key is not resurrected by a persisted store write after suspension', async () => {
    const { safeJSONStorage, suspendPersistence } = await loadStorage();
    const useStore = create<{ n: number; bump: () => void }>()(
      persist((set) => ({ n: 0, bump: () => set((s) => ({ n: s.n + 1 })) }), {
        name: 'millos-test-store',
        storage: safeJSONStorage,
      })
    );
    useStore.getState().bump();
    expect(await safeJSONStorage.getItem('millos-test-store')).not.toBeNull();

    // The Reset Simulation order: suspend, clear, then any late tick write.
    suspendPersistence();
    await safeJSONStorage.removeItem('millos-test-store');
    useStore.getState().bump();

    expect(useStore.getState().n).toBe(2);
    expect(await safeJSONStorage.getItem('millos-test-store')).toBeNull();
  });
});
