import { describe, expect, it, vi } from 'vitest';
import { useAIConfigStore } from './aiConfigStore';

describe('AI preferences migration', () => {
  it('removes a legacy Gemini key and falls back to heuristic on a cloud backend', () => {
    const migrate = useAIConfigStore.persist.getOptions().migrate;
    expect(migrate).toBeDefined();
    const result = migrate!(
      {
        aiMode: 'gemini',
        llmBackend: 'gemini',
        geminiApiKey: 'legacy-secret',
      },
      0
    );
    expect(result).toEqual({ aiMode: 'heuristic', llmBackend: 'haiku' });
    expect(JSON.stringify(result)).not.toContain('legacy-secret');
  });

  it('persists only safe preferences and keeps the selected WebGPU mode', () => {
    const options = useAIConfigStore.persist.getOptions();
    const local = options.migrate!(
      { aiMode: 'hybrid', llmBackend: 'webgpu', geminiApiKey: 'secret' },
      0
    );
    expect(local).toEqual({ aiMode: 'hybrid', llmBackend: 'webgpu' });
    useAIConfigStore.setState({ aiMode: 'gemini', llmBackend: 'luna' });
    const saved = options.partialize!(useAIConfigStore.getState());
    expect(saved).toEqual({ aiMode: 'heuristic', llmBackend: 'luna' });
    expect(JSON.stringify(saved)).not.toMatch(/secret|key|connectedProviders/);
  });

  it('migrates public direct-provider preferences to OpenRouter without credentials', () => {
    const originalWindow = window;
    vi.stubGlobal('window', { location: { hostname: 'www.millos.net' } });
    try {
      const migrate = useAIConfigStore.persist.getOptions().migrate!;
      expect(migrate({ llmBackend: 'haiku', aiMode: 'hybrid' }, 1)).toEqual({
        llmBackend: 'openrouter-haiku',
        aiMode: 'heuristic',
      });
      expect(migrate({ llmBackend: 'luna', aiMode: 'hybrid' }, 1)).toEqual({
        llmBackend: 'openrouter-luna',
        aiMode: 'heuristic',
      });
    } finally {
      vi.stubGlobal('window', originalWindow);
    }
  });

  it('rewrites a real version-zero persisted record without the legacy key', async () => {
    const originalStorage = useAIConfigStore.persist.getOptions().storage;
    let stored = {
      state: { aiMode: 'gemini', llmBackend: 'gemini', geminiApiKey: 'legacy-secret' },
      version: 0,
    } as { state: Record<string, unknown>; version: number };
    useAIConfigStore.persist.setOptions({
      storage: {
        getItem: () => stored,
        setItem: (_name, value) => {
          stored = value as typeof stored;
        },
        removeItem: () => {},
      },
    });
    try {
      await useAIConfigStore.persist.rehydrate();
      expect(stored.version).toBe(2);
      expect(stored.state).toEqual({ aiMode: 'heuristic', llmBackend: 'haiku' });
      expect(JSON.stringify(stored)).not.toContain('legacy-secret');
    } finally {
      useAIConfigStore.persist.setOptions({ storage: originalStorage });
    }
  });
});
