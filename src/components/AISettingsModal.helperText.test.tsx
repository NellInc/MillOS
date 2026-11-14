import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AISettingsModal } from './AISettingsModal';
import { useAIConfigStore } from '../stores/aiConfigStore';
import { WebGPUClient, webgpuClient } from '../utils/webgpuClient';
import { setLocale } from '../i18n';

// D14 (D-012): AI Settings kept a hint under the overlay toggles, a paragraph
// under the download button, a caption under each mode, a description of the
// chosen mode and a tagline in the LLM-only confirmation. The download size
// is a cost, so it moves onto the button. Billing, consent and key-handling
// lines stay. Working if each mode radio is named by its label alone and the
// download button says how large the download is.
describe('AI Settings without helper text', () => {
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
    vi.spyOn(WebGPUClient, 'isModelCached').mockResolvedValue(false);
    vi.spyOn(WebGPUClient, 'getCacheStorageSize').mockResolvedValue(null);
  });
  afterEach(() => {
    cleanup();
    setLocale('en');
    vi.restoreAllMocks();
    delete (navigator as unknown as { gpu?: unknown }).gpu;
    useAIConfigStore.setState({
      llmBackend: original.llmBackend,
      webgpuStatus: original.webgpuStatus,
      webgpuModelReady: original.webgpuModelReady,
      webgpuError: original.webgpuError,
      aiMode: original.aiMode,
    });
  });

  it('names each mode by its label alone', () => {
    useAIConfigStore.setState({ aiMode: 'hybrid', webgpuModelReady: true });
    render(<AISettingsModal isOpen onClose={() => undefined} />);
    for (const cut of [
      /Toggle overlays with keyboard shortcuts/,
      /Best of both/,
      /Fast rules/,
      /LLM only/,
      /Tactical \(heuristic/,
      /Fast rule-based decisions/,
    ]) {
      expect(screen.queryByText(cut)).toBeNull();
    }
    const modes = within(screen.getByRole('radiogroup', { name: 'AI Operating Mode' }));
    expect(modes.getByRole('radio', { name: 'Heuristic' })).toBeInTheDocument();
    expect(modes.getByRole('radio', { name: 'Hybrid' })).toBeInTheDocument();
    expect(modes.getByRole('radio', { name: 'Local Only' })).toBeInTheDocument();
  });

  it('puts the download size on the download button, not under it', async () => {
    render(<AISettingsModal isOpen onClose={() => undefined} />);
    expect(screen.queryByText(/downloads automatically when you select this backend/)).toBeNull();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /^Download & load model \(~\d+\.\d GB\)$/ })
      ).toBeInTheDocument()
    );
  });

  it('does the same in Brazilian Portuguese', async () => {
    setLocale('pt-BR');
    render(<AISettingsModal isOpen onClose={() => undefined} />);
    expect(screen.queryByText(/O melhor dos dois/i)).toBeNull();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /^Baixar e carregar modelo \(~\d+,\d GB\)$/ })
      ).toBeInTheDocument()
    );
  });
});
