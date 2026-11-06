import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

// The store prewarms the local model 2.5 s after it is imported (a timer at
// module load). On a loaded machine that timer landed mid-test and replaced the
// pressed button with Cancel download, so these tests failed at random. Faked
// before the import and released before the first test, it never fires here.
vi.hoisted(() => {
  vi.useFakeTimers({ toFake: ['setTimeout'] });
});
beforeAll(() => {
  vi.useRealTimers();
});
import '@testing-library/jest-dom';
import { AISettingsModal } from './AISettingsModal';
import { useAIConfigStore } from '../stores/aiConfigStore';
import { WebGPUClient, webgpuClient } from '../utils/webgpuClient';

// A control that removes itself on its own click dropped focus to <body>. The
// modal's focus trap listens on the dialog element, so from <body> Escape no
// longer closed the dialog and Tab walked into the page behind it.
describe('AI settings controls that replace themselves', () => {
  const original = useAIConfigStore.getState();

  beforeEach(() => {
    Object.defineProperty(navigator, 'gpu', { value: {}, configurable: true });
    vi.spyOn(webgpuClient, 'cancelLoad').mockImplementation(() => undefined);
    vi.spyOn(WebGPUClient, 'isModelCached').mockResolvedValue(true);
    vi.spyOn(WebGPUClient, 'getCacheStorageSize').mockResolvedValue(null);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
    delete (navigator as unknown as { gpu?: unknown }).gpu;
    useAIConfigStore.setState({
      llmBackend: original.llmBackend,
      aiMode: original.aiMode,
      webgpuStatus: original.webgpuStatus,
      webgpuModelReady: original.webgpuModelReady,
      webgpuError: original.webgpuError,
      webgpuProgress: original.webgpuProgress,
      connectedProviders: original.connectedProviders,
      loadWebGPUModel: original.loadWebGPUModel,
      unloadWebGPUModel: original.unloadWebGPUModel,
      deleteWebGPUCache: original.deleteWebGPUCache,
    });
  });

  it('moves focus to the load button when a download is cancelled', async () => {
    useAIConfigStore.setState({
      llmBackend: 'webgpu',
      webgpuStatus: 'loading',
      webgpuProgress: 0.4,
      webgpuModelReady: false,
      webgpuError: null,
    });
    render(<AISettingsModal isOpen onClose={() => undefined} />);
    const cancel = screen.getByRole('button', { name: 'Cancel download' });
    cancel.focus();
    await act(async () => {
      fireEvent.click(cancel);
    });
    expect(useAIConfigStore.getState().webgpuStatus).toBe('idle');
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toHaveTextContent(/load model/i);
  });

  // Pass nine: Load, Unload, Delete, Enter key and Disconnect key each remove
  // the button pressed, and focus fell to <body>, outside the focus trap.
  describe('local model and key buttons that leave with their own press', () => {
    const dropped = () =>
      !document.activeElement ||
      document.activeElement === document.body ||
      !screen.getByRole('dialog').contains(document.activeElement);

    it('moves focus to Cancel download when Load starts the download', async () => {
      useAIConfigStore.setState({
        llmBackend: 'webgpu',
        webgpuStatus: 'idle',
        webgpuModelReady: false,
        webgpuError: null,
        loadWebGPUModel: async () => {
          useAIConfigStore.setState({ webgpuStatus: 'loading', webgpuProgress: 0.1 });
          return false;
        },
      });
      render(<AISettingsModal isOpen onClose={() => undefined} />);
      const load = await screen.findByRole('button', { name: /load model/i });
      load.focus();
      await act(async () => {
        fireEvent.click(load);
      });
      expect(dropped()).toBe(false);
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel download' }));
    });

    it('moves focus to Load after Unload', async () => {
      useAIConfigStore.setState({
        llmBackend: 'webgpu',
        webgpuStatus: 'ready',
        webgpuModelReady: true,
        webgpuError: null,
        unloadWebGPUModel: async () => {
          useAIConfigStore.setState({ webgpuStatus: 'idle', webgpuModelReady: false });
        },
      });
      render(<AISettingsModal isOpen onClose={() => undefined} />);
      const unload = screen.getByRole('button', { name: /unload model/i });
      unload.focus();
      await act(async () => {
        fireEvent.click(unload);
      });
      // The unload settles over a few renders (busy, then the model state).
      await waitFor(() => expect(dropped()).toBe(false));
      expect(document.activeElement).toHaveTextContent(/load model/i);
    });

    it('keeps focus in the panel after Delete', async () => {
      // Cached until the delete runs, however often the panel asks.
      let cached = true;
      vi.mocked(WebGPUClient.isModelCached).mockImplementation(async () => cached);
      useAIConfigStore.setState({
        llmBackend: 'webgpu',
        webgpuStatus: 'idle',
        webgpuModelReady: false,
        webgpuError: null,
        deleteWebGPUCache: async () => {
          cached = false;
          return true;
        },
      });
      render(<AISettingsModal isOpen onClose={() => undefined} />);
      const remove = await screen.findByTestId('delete-webgpu-model');
      remove.focus();
      await act(async () => {
        fireEvent.click(remove);
      });
      // The delete settles over a few renders (busy, then the cache check).
      await waitFor(() => expect(screen.queryByTestId('delete-webgpu-model')).toBeNull());
      await waitFor(() => expect(dropped()).toBe(false));
      expect(document.activeElement).toHaveTextContent(/download & load/i);
    });

    it('moves focus into the key field when it is opened', async () => {
      useAIConfigStore.setState({ llmBackend: 'haiku' });
      render(<AISettingsModal isOpen onClose={() => undefined} />);
      const open = screen.getByRole('button', { name: /enter .* key/i });
      open.focus();
      await act(async () => {
        fireEvent.click(open);
      });
      expect(document.activeElement).toBe(document.getElementById('cloud-api-key'));
    });

    it('moves focus to the key entry after Disconnect key', async () => {
      useAIConfigStore.setState({
        llmBackend: 'haiku',
        connectedProviders: { ...useAIConfigStore.getState().connectedProviders, haiku: true },
      });
      render(<AISettingsModal isOpen onClose={() => undefined} />);
      const disconnect = screen.getByRole('button', { name: /disconnect/i });
      disconnect.focus();
      await act(async () => {
        fireEvent.click(disconnect);
      });
      expect(dropped()).toBe(false);
      expect(document.activeElement).toHaveTextContent(/enter .* key/i);
    });
  });

  describe('the model-only confirmation', () => {
    beforeEach(() => {
      useAIConfigStore.setState({
        llmBackend: 'webgpu',
        aiMode: 'hybrid',
        webgpuStatus: 'ready',
        webgpuModelReady: true,
        webgpuError: null,
      });
    });

    const modes = () =>
      within(screen.getByRole('radiogroup', { name: 'AI Operating Mode' })).getAllByRole('radio');
    const open = () => {
      render(<AISettingsModal isOpen onClose={() => undefined} />);
      const modelOnly = modes()[2];
      modelOnly.focus();
      fireEvent.click(modelOnly);
      return modelOnly;
    };

    it('returns focus to the hybrid choice after Use Hybrid', async () => {
      open();
      const useHybrid = screen.getByRole('button', { name: 'Use Hybrid' });
      useHybrid.focus();
      await act(async () => {
        fireEvent.click(useHybrid);
      });
      expect(document.activeElement).toBe(modes()[1]);
    });

    it('returns focus to the model-only choice after Cancel', async () => {
      open();
      const cancel = screen.getByRole('button', { name: 'Cancel' });
      cancel.focus();
      await act(async () => {
        fireEvent.click(cancel);
      });
      expect(document.activeElement).toBe(modes()[2]);
    });

    it('moves focus to the model-only choice once it is chosen', async () => {
      open();
      const confirm = screen.getByRole('button', { name: 'Use Local Only' });
      confirm.focus();
      await act(async () => {
        fireEvent.click(confirm);
        await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
      });
      expect(useAIConfigStore.getState().aiMode).toBe('gemini');
      expect(document.activeElement).toBe(modes()[2]);
    });
  });
});
