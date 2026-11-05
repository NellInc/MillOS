import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AISettingsModal } from './AISettingsModal';
import { useAIConfigStore } from '../stores/aiConfigStore';
import { WebGPUClient, webgpuClient } from '../utils/webgpuClient';
import { setLocale, translate } from '../i18n';
import { aiConfigStoreMessages } from '../stores/aiConfigStore.messages';
import { webgpuClientMessages } from '../utils/webgpuClient.messages';

// The store's 2.5 s prewarm timer must not start a load mid-test.
vi.hoisted(() => {
  vi.useFakeTimers({ toFake: ['setTimeout'] });
});
beforeAll(() => {
  vi.useRealTimers();
});

// The local model's error is kept as text, worded when it happened. A model
// that failed to load (or a browser with no adapter) left English in the AI
// settings after the player switched to Portuguese. Working if the error reads
// in the language chosen now, and an error the browser wrote is shown as is.
describe('the local model error follows the language', () => {
  const original = useAIConfigStore.getState();
  beforeEach(() => {
    setLocale('en');
    Object.defineProperty(navigator, 'gpu', { value: {}, configurable: true });
    vi.spyOn(webgpuClient, 'cancelLoad').mockImplementation(() => undefined);
    vi.spyOn(WebGPUClient, 'isModelCached').mockResolvedValue(false);
    vi.spyOn(WebGPUClient, 'getCacheStorageSize').mockResolvedValue(null);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    setLocale('en');
    delete (navigator as unknown as { gpu?: unknown }).gpu;
    useAIConfigStore.setState({
      llmBackend: original.llmBackend,
      webgpuStatus: original.webgpuStatus,
      webgpuError: original.webgpuError,
      webgpuModelReady: original.webgpuModelReady,
    });
  });

  it.each([
    ['a failed load', translate(aiConfigStoreMessages, 'modelLoadFailed'), 'error'],
    ['a dropped model', translate(aiConfigStoreMessages, 'modelLostAgain'), 'error'],
    ['a missing adapter', translate(webgpuClientMessages, 'noAdapter'), 'unsupported'],
  ] as const)('rewords %s after a switch to Portuguese', (_name, english, status) => {
    useAIConfigStore.setState({
      llmBackend: 'webgpu',
      webgpuStatus: status,
      webgpuModelReady: false,
      webgpuError: english,
    });
    setLocale('pt-BR');
    render(<AISettingsModal isOpen onClose={() => undefined} />);
    const alerts = screen.getAllByRole('alert').map((node) => node.textContent ?? '');
    expect(alerts.some((text) => text.includes(english))).toBe(false);
    expect(alerts.some((text) => /modelo|adaptador/i.test(text))).toBe(true);
  });

  it('shows an error the browser wrote as it was written', () => {
    useAIConfigStore.setState({
      llmBackend: 'webgpu',
      webgpuStatus: 'unsupported',
      webgpuModelReady: false,
      webgpuError: 'GPUAdapter request failed: blocked',
    });
    setLocale('pt-BR');
    render(<AISettingsModal isOpen onClose={() => undefined} />);
    const alerts = screen.getAllByRole('alert').map((node) => node.textContent ?? '');
    expect(alerts.some((text) => text.includes('GPUAdapter request failed: blocked'))).toBe(true);
  });
});

// The adapter's small-memory advisory and a rejected key were stored as text in
// the language active when filed, so the AI settings showed English after the
// player switched to Portuguese. Working if both read in the language chosen now.
describe('stored AI settings notices follow the language', () => {
  const original = useAIConfigStore.getState();
  beforeEach(() => {
    setLocale('en');
    vi.spyOn(WebGPUClient, 'isModelCached').mockResolvedValue(false);
    vi.spyOn(WebGPUClient, 'getCacheStorageSize').mockResolvedValue(null);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    setLocale('en');
    delete (navigator as unknown as { gpu?: unknown }).gpu;
    useAIConfigStore.setState({
      llmBackend: original.llmBackend,
      webgpuStatus: 'idle',
      webgpuError: null,
      webgpuModelReady: false,
      webgpuAdapterWarning: null,
      connectionError: null,
    });
  });

  it('rewords the small-memory advisory after a switch to Portuguese', async () => {
    Object.defineProperty(navigator, 'gpu', {
      value: {
        requestAdapter: async () => ({
          limits: { maxBufferSize: 256 * 1_048_576, maxStorageBufferBindingSize: 128 * 1_048_576 },
        }),
      },
      configurable: true,
    });
    vi.spyOn(webgpuClient, 'load').mockResolvedValue(false);
    useAIConfigStore.setState({ llmBackend: 'webgpu', webgpuStatus: 'idle' });
    await useAIConfigStore.getState().loadWebGPUModel(false);
    expect(useAIConfigStore.getState().webgpuAdapterWarning).toContain('small memory budget');
    setLocale('pt-BR');
    render(<AISettingsModal isOpen onClose={() => undefined} />);
    expect(screen.queryByText(/small memory budget/)).toBeNull();
    expect(screen.getByText(/Esta GPU informa pouca memória/)).toBeInTheDocument();
  });

  it('rewords a rejected key after a switch to Portuguese', async () => {
    useAIConfigStore.setState({ llmBackend: 'openrouter-haiku' });
    await useAIConfigStore.getState().setCloudApiKey('openrouter-haiku', 'not a key');
    expect(useAIConfigStore.getState().connectionError).toBe('Enter a valid OpenRouter API key.');
    setLocale('pt-BR');
    render(<AISettingsModal isOpen onClose={() => undefined} />);
    const alerts = screen.getAllByRole('alert').map((node) => node.textContent ?? '');
    expect(alerts.some((text) => text.includes('Enter a valid OpenRouter API key.'))).toBe(false);
    expect(
      alerts.some((text) => text.includes('Informe uma chave de API válida do OpenRouter.'))
    ).toBe(true);
  });
});

// The ChatGPT companion's status error was stored as text in the language active
// when it was filed. Working if it reads in the language chosen now.
describe('the ChatGPT companion error follows the language', () => {
  const original = useAIConfigStore.getState();
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    setLocale('en');
    useAIConfigStore.setState({
      llmBackend: original.llmBackend,
      chatgptError: null,
      chatgptStatus: null,
    });
  });

  it('rewords a stopped companion after a switch to Portuguese', async () => {
    expect(window.location.hostname).toBe('localhost');
    setLocale('en');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html></html>', { headers: { 'content-type': 'text/html' } }))
    );
    useAIConfigStore.setState({ llmBackend: 'chatgpt' });
    await useAIConfigStore.getState().refreshChatGPT();
    expect(useAIConfigStore.getState().chatgptError).toBe('ChatGPT local companion is not running');
    // The modal's own refresh on open never answers, so the stored error stays.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => undefined))
    );
    setLocale('pt-BR');
    render(<AISettingsModal isOpen onClose={() => undefined} />);
    const alerts = screen.getAllByRole('alert').map((node) => node.textContent ?? '');
    expect(alerts.some((text) => text.includes('ChatGPT local companion is not running'))).toBe(
      false
    );
    expect(alerts.some((text) => text.includes('não está em execução'))).toBe(true);
  });
});
