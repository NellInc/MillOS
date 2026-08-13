import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanupAIConfigBASSubscription,
  migrateAIConfigPersistedState,
  useAIConfigStore,
} from '../aiConfigStore';

describe('AI configuration persistence', () => {
  afterEach(() => {
    cleanupAIConfigBASSubscription();
    useAIConfigStore.setState({
      aiMode: 'heuristic',
      geminiApiKey: null,
      isGeminiConnected: false,
      llmBackend: 'gemini',
    });
  });

  it('scrubs a version 0 Gemini key and returns its cloud mode to heuristic', () => {
    expect(
      migrateAIConfigPersistedState(
        {
          aiMode: 'hybrid',
          geminiApiKey: 'previously-persisted-secret',
          managementGenerosity: 73,
          llmBackend: 'gemini',
        },
        0
      )
    ).toEqual({
      aiMode: 'heuristic',
      managementGenerosity: 73,
      llmBackend: 'gemini',
    });
  });

  it('preserves a local WebGPU mode while removing a legacy cloud key', () => {
    expect(
      migrateAIConfigPersistedState(
        {
          aiMode: 'hybrid',
          geminiApiKey: 'stale-secret',
          llmBackend: 'webgpu',
        },
        0
      )
    ).toEqual({
      aiMode: 'hybrid',
      llmBackend: 'webgpu',
    });
  });

  it('recovers malformed persisted data without retaining it', () => {
    expect(migrateAIConfigPersistedState(null, 0)).toEqual({});
    expect(migrateAIConfigPersistedState(['geminiApiKey'], 0)).toEqual({});
  });

  it('never includes the live Gemini key in persisted preferences', () => {
    useAIConfigStore.setState({ geminiApiKey: 'session-secret', aiMode: 'hybrid' });
    const partialize = useAIConfigStore.persist.getOptions().partialize;

    expect(partialize).toBeTypeOf('function');
    const persisted = partialize?.(useAIConfigStore.getState()) as Record<string, unknown>;

    expect(persisted).toEqual(
      expect.objectContaining({
        aiMode: 'hybrid',
        managementGenerosity: expect.any(Number),
        llmBackend: 'gemini',
      })
    );
    expect(persisted).not.toHaveProperty('geminiApiKey');
  });
});
