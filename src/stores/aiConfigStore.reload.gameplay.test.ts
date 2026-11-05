import { afterEach, describe, expect, it } from 'vitest';
import { useAIConfigStore } from './aiConfigStore';
import { fastLaneByDefault } from '../utils/webgpuClient';

// Lights-out was session-only and on by default, so a player who switched it
// off found the on-device AI acknowledging and mitigating their incidents again
// after a reload: the persisted WebGPU backend prewarms the model on its own.
// Working if switching it off survives a reload, and the default stays on.
describe('the on-device AI choices across a reload', () => {
  const originalStorage = useAIConfigStore.persist.getOptions().storage;
  afterEach(() => {
    useAIConfigStore.persist.setOptions({ storage: originalStorage });
    useAIConfigStore.setState({
      lightsOut: true,
      webgpuFastLane: fastLaneByDefault(),
      llmBackend: 'haiku',
      aiMode: 'heuristic',
    });
  });

  const memoryStorage = () => {
    const box: { stored: { state: Record<string, unknown>; version: number } | null } = {
      stored: null,
    };
    useAIConfigStore.persist.setOptions({
      storage: {
        getItem: () => box.stored,
        setItem: (_name, value) => {
          box.stored = value as typeof box.stored;
        },
        removeItem: () => {},
      },
    });
    return box;
  };

  it('comes back off after the player switched it off', async () => {
    let stored: { state: Record<string, unknown>; version: number } | null = null;
    useAIConfigStore.persist.setOptions({
      storage: {
        getItem: () => stored,
        setItem: (_name, value) => {
          stored = value as typeof stored;
        },
        removeItem: () => {},
      },
    });
    useAIConfigStore.setState({ llmBackend: 'webgpu', aiMode: 'hybrid' });
    useAIConfigStore.getState().setLightsOut(false);

    // A fresh page starts from the defaults and rehydrates what was saved.
    const saved = stored;
    useAIConfigStore.setState({ lightsOut: true });
    stored = saved;
    await useAIConfigStore.persist.rehydrate();
    expect(useAIConfigStore.getState().lightsOut).toBe(false);
  });

  // The fast lane loads a second copy of the model, on by default where the
  // browser reports 8 GB. A player who switched it off to free graphics memory
  // had it put back by every reload. Working if off stays off, while on is
  // never saved (a reload after a lost device falls back to the default).
  it('keeps the fast lane off on a device that defaults it on', async () => {
    const memory = Object.getOwnPropertyDescriptor(navigator, 'deviceMemory');
    Object.defineProperty(navigator, 'deviceMemory', { value: 8, configurable: true });
    try {
      expect(fastLaneByDefault()).toBe(true);
      useAIConfigStore.setState({ webgpuFastLane: true });
      const box = memoryStorage();
      await useAIConfigStore.getState().setWebGPUFastLane(false);
      const saved = box.stored;
      useAIConfigStore.setState({ webgpuFastLane: true });
      box.stored = saved;
      await useAIConfigStore.persist.rehydrate();
      expect(useAIConfigStore.getState().webgpuFastLane).toBe(false);

      await useAIConfigStore.getState().setWebGPUFastLane(true);
      expect(box.stored?.state).not.toHaveProperty('webgpuFastLane');
    } finally {
      if (memory) Object.defineProperty(navigator, 'deviceMemory', memory);
      else delete (navigator as { deviceMemory?: number }).deviceMemory;
    }
  });

  it('never saves the fast lane on, even against a device that defaults it off', async () => {
    const box = memoryStorage();
    expect(fastLaneByDefault()).toBe(false);
    await useAIConfigStore.getState().setWebGPUFastLane(true);
    expect(box.stored?.state).not.toHaveProperty('webgpuFastLane');
  });

  // The ChatGPT plan is signed in through the local companion, which keeps the
  // session across a reload; no key lives in page memory. Saving it as rules
  // only (the memory-only-key fallback) turned the player's Hybrid choice off
  // on every reload while the plan reconnected by itself 2.5 s later.
  // Working if the chosen mode survives a reload with the ChatGPT plan.
  it('keeps the chosen mode for the ChatGPT plan, whose sign-in survives a reload', () => {
    useAIConfigStore.setState({ llmBackend: 'chatgpt', aiMode: 'hybrid' });
    const saved = useAIConfigStore.persist.getOptions().partialize!(useAIConfigStore.getState());
    expect(saved).toEqual({ aiMode: 'hybrid', llmBackend: 'chatgpt' });
  });

  it('saves nothing extra while it is on, its default', () => {
    useAIConfigStore.setState({ lightsOut: true, llmBackend: 'luna', aiMode: 'heuristic' });
    const saved = useAIConfigStore.persist.getOptions().partialize!(useAIConfigStore.getState());
    expect(saved).toEqual({ aiMode: 'heuristic', llmBackend: 'luna' });
  });
});
