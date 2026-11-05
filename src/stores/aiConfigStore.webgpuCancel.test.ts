import { describe, expect, it, vi } from 'vitest';

const probe = vi.hoisted(() => ({
  resolve: null as ((report: { supported: boolean; warning?: string }) => void) | null,
}));

vi.mock('../utils/webgpuClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/webgpuClient')>();
  return {
    ...actual,
    checkWebGPUAdapter: () =>
      new Promise((resolve) => {
        probe.resolve = resolve;
      }),
  };
});

import { useAIConfigStore } from './aiConfigStore';
import { webgpuClient } from '../utils/webgpuClient';

describe('cancelling the local model while the adapter is still being checked', () => {
  it('does not start the download once the probe answers', async () => {
    const load = vi.spyOn(webgpuClient, 'load').mockResolvedValue(true);
    vi.spyOn(webgpuClient, 'cancelLoad').mockImplementation(() => undefined);
    useAIConfigStore.setState({
      aiMode: 'heuristic',
      llmBackend: 'webgpu',
      webgpuModelReady: false,
      webgpuStatus: 'idle',
    });
    try {
      const pending = useAIConfigStore.getState().loadWebGPUModel();
      expect(useAIConfigStore.getState().webgpuStatus).toBe('checking');
      // The player cancels (or switches to a cloud backend) during the probe.
      useAIConfigStore.getState().cancelWebGPUModelLoad();
      probe.resolve?.({ supported: true });
      await expect(pending).resolves.toBe(false);

      expect(load).not.toHaveBeenCalled();
      expect(useAIConfigStore.getState()).toMatchObject({
        webgpuStatus: 'idle',
        webgpuModelReady: false,
        aiMode: 'heuristic',
      });
    } finally {
      vi.restoreAllMocks();
      useAIConfigStore.setState({ webgpuStatus: 'idle', webgpuModelReady: false });
    }
  });
});
