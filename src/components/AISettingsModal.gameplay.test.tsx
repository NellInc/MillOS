import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AISettingsModal } from './AISettingsModal';
import { useAIConfigStore } from '../stores/aiConfigStore';
import { WebGPUClient, webgpuClient } from '../utils/webgpuClient';

describe('deleting the downloaded local model', () => {
  const original = useAIConfigStore.getState();

  beforeEach(() => {
    Object.defineProperty(navigator, 'gpu', { value: {}, configurable: true });
    useAIConfigStore.setState({
      llmBackend: 'webgpu',
      webgpuStatus: 'idle',
      webgpuModelReady: false,
      webgpuError: null,
    });
    vi.spyOn(webgpuClient, 'disconnect').mockResolvedValue();
    vi.spyOn(WebGPUClient, 'isModelCached').mockResolvedValue(true);
    vi.spyOn(WebGPUClient, 'getCacheStorageSize').mockResolvedValue(null);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    delete (navigator as unknown as { gpu?: unknown }).gpu;
    useAIConfigStore.setState({
      llmBackend: original.llmBackend,
      webgpuStatus: original.webgpuStatus,
      webgpuModelReady: original.webgpuModelReady,
      webgpuError: original.webgpuError,
    });
  });

  // A store that cannot be cleared (another tab holding it, a blocked
  // IndexedDB) was only logged: the button went back to "Delete downloaded
  // model", the copy stayed, and the player was told nothing.
  it('says so when the model could not be deleted', async () => {
    vi.spyOn(WebGPUClient, 'deleteModelCache').mockRejectedValue(new Error('blocked'));
    render(<AISettingsModal isOpen onClose={() => undefined} />);
    const button = await screen.findByTestId('delete-webgpu-model');
    await act(async () => {
      fireEvent.click(button);
    });
    expect(await screen.findByText(/could not be deleted/i)).toBeInTheDocument();
    expect(screen.getByTestId('delete-webgpu-model')).not.toBeDisabled();
  });

  it('says nothing more when it was deleted', async () => {
    vi.spyOn(WebGPUClient, 'deleteModelCache').mockResolvedValue();
    render(<AISettingsModal isOpen onClose={() => undefined} />);
    const button = await screen.findByTestId('delete-webgpu-model');
    await act(async () => {
      fireEvent.click(button);
    });
    expect(screen.queryByText(/could not be deleted/i)).not.toBeInTheDocument();
  });
});

// aiMode stays 'hybrid' after the local core unloads (or after switching to a
// cloud model with no key yet), and the engine then runs the rules layer alone.
// The status line still read "Hybrid Mode" beside a Command Center badge that
// said Heuristic.
describe('the current mode readout', () => {
  const original = useAIConfigStore.getState();
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    useAIConfigStore.setState({
      llmBackend: original.llmBackend,
      aiMode: original.aiMode,
      webgpuModelReady: original.webgpuModelReady,
    });
  });

  it('reads Heuristic while the selected strategic model is not ready', () => {
    vi.spyOn(WebGPUClient, 'isModelCached').mockResolvedValue(false);
    vi.spyOn(WebGPUClient, 'getCacheStorageSize').mockResolvedValue(null);
    useAIConfigStore.setState({ llmBackend: 'webgpu', aiMode: 'hybrid', webgpuModelReady: false });
    render(<AISettingsModal isOpen onClose={() => undefined} />);
    const status = screen.getByText('Current Mode:').parentElement as HTMLElement;
    expect(status).toHaveTextContent('Heuristic');
    expect(status).not.toHaveTextContent('Hybrid Mode');
  });

  it('reads Hybrid Mode once the model is ready', () => {
    vi.spyOn(WebGPUClient, 'isModelCached').mockResolvedValue(true);
    vi.spyOn(WebGPUClient, 'getCacheStorageSize').mockResolvedValue(null);
    useAIConfigStore.setState({ llmBackend: 'webgpu', aiMode: 'hybrid', webgpuModelReady: true });
    render(<AISettingsModal isOpen onClose={() => undefined} />);
    const status = screen.getByText('Current Mode:').parentElement as HTMLElement;
    expect(status).toHaveTextContent('Hybrid Mode');
  });
});

// A key that failed to connect put its reason on screen twice, as two alerts:
// once under the model status and again as the connection result.
describe('a key that fails to connect', () => {
  const original = useAIConfigStore.getState();
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    useAIConfigStore.setState({
      llmBackend: original.llmBackend,
      connectionError: null,
      connectionErrorCopy: null,
    });
  });

  it('gives its reason once', async () => {
    useAIConfigStore.setState({ llmBackend: 'openrouter-haiku', connectionError: null });
    render(<AISettingsModal isOpen onClose={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: /Enter OpenRouter API key/i }));
    fireEvent.change(screen.getByLabelText(/OpenRouter API key/i, { selector: 'input' }), {
      target: { value: 'not a key' },
    });
    fireEvent.click(screen.getByRole('checkbox'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Connect for session/i }));
    });
    const reasons = screen
      .getAllByRole('alert')
      .filter((node) => node.textContent?.includes('Enter a valid OpenRouter API key.'));
    expect(reasons).toHaveLength(1);
  });
});
