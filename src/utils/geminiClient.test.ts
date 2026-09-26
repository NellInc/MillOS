import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  apiKeys: [] as string[],
  currentApiKey: '',
  getGenerativeModel: vi.fn(),
}));

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class MockGoogleGenerativeAI {
    constructor(apiKey: string) {
      sdk.apiKeys.push(apiKey);
      sdk.currentApiKey = apiKey;
    }

    getGenerativeModel(config: { model: string }) {
      return sdk.getGenerativeModel(config, sdk.currentApiKey);
    }
  },
}));

vi.mock('./logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  GEMINI_MAX_IN_FLIGHT_REQUESTS,
  GEMINI_MAX_RAW_PROMPT_CHARS,
  GEMINI_MODEL_CANDIDATES,
  GEMINI_REQUEST_TIMEOUT_MS,
  GeminiClient,
} from './geminiClient';

type GeminiResult = { response: { text: () => string } };

function result(text: string): GeminiResult {
  return { response: { text: () => text } };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function hasLoneSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return true;
      index++;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

describe('GeminiClient adversarial boundaries', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-20T12:00:00Z'));
    sdk.apiKeys.length = 0;
    sdk.currentApiKey = '';
    sdk.getGenerativeModel.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('prefers the current stable model and retains distinct fallbacks', () => {
    expect(GEMINI_MODEL_CANDIDATES[0]).toBe('gemini-3.6-flash');
    expect(GEMINI_MODEL_CANDIDATES).toContain('gemini-3.5-flash');
    expect(new Set(GEMINI_MODEL_CANDIDATES).size).toBe(GEMINI_MODEL_CANDIDATES.length);
  });

  it('rejects blank credentials and prompts without invoking the SDK', async () => {
    const generateContent = vi.fn().mockResolvedValue(result('unused'));
    sdk.getGenerativeModel.mockReturnValue({ generateContent });
    const client = new GeminiClient();

    expect(client.initialize('   ')).toBe(false);
    expect(sdk.apiKeys).toEqual([]);

    expect(client.initialize('valid-key')).toBe(true);
    await expect(client.generateContent('\n\t ')).resolves.toBeNull();
    expect(generateContent).not.toHaveBeenCalled();
    expect(client.getCircuitBreakerStatus().failures).toBe(0);
  });

  it('rejects raw prompts above the retained-input ceiling before provider admission', async () => {
    const generateContent = vi.fn().mockResolvedValue(result('must not run'));
    sdk.getGenerativeModel.mockReturnValue({ generateContent });
    const client = new GeminiClient();
    client.initialize('key');

    const oversizedPrompt = 'x'.repeat(GEMINI_MAX_RAW_PROMPT_CHARS + 1);
    await expect(client.generateContent(oversizedPrompt)).resolves.toBeNull();

    expect(generateContent).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('coalesces concurrent requests for the same prompt', async () => {
    const pending = deferred<GeminiResult>();
    const generateContent = vi.fn().mockReturnValue(pending.promise);
    sdk.getGenerativeModel.mockReturnValue({ generateContent });
    const client = new GeminiClient();
    client.initialize('key');

    const first = client.generateContent('same plant state');
    const second = client.generateContent('same plant state');

    expect(generateContent).toHaveBeenCalledTimes(1);
    pending.resolve(result('decision'));
    await expect(Promise.all([first, second])).resolves.toEqual(['decision', 'decision']);
  });

  it('bounds unique provider work, releases rejected slots, times out hung calls, and recovers', async () => {
    const providerCalls: Array<ReturnType<typeof deferred<GeminiResult>>> = [];
    const generateContent = vi.fn().mockImplementation(() => {
      const pending = deferred<GeminiResult>();
      providerCalls.push(pending);
      return pending.promise;
    });
    sdk.getGenerativeModel.mockReturnValue({ generateContent });
    const client = new GeminiClient();
    client.initialize('key');

    const admitted = Array.from({ length: GEMINI_MAX_IN_FLIGHT_REQUESTS }, (_, index) =>
      client.generateContent(`hung plant state ${index}`)
    );
    const coalesced = client.generateContent('hung plant state 0');
    const rejectedAtCapacity = client.generateContent('one request too many');

    expect(coalesced).toBe(admitted[0]);
    await expect(rejectedAtCapacity).resolves.toBeNull();
    expect(generateContent).toHaveBeenCalledTimes(GEMINI_MAX_IN_FLIGHT_REQUESTS);
    expect(generateContent.mock.calls[0][1]).toMatchObject({
      timeout: GEMINI_REQUEST_TIMEOUT_MS,
    });

    providerCalls[0].reject(new Error('provider rejected immediately'));
    await expect(admitted[0]).resolves.toBeNull();

    const replacement = client.generateContent('replacement after rejection');
    expect(generateContent).toHaveBeenCalledTimes(GEMINI_MAX_IN_FLIGHT_REQUESTS + 1);

    await vi.advanceTimersByTimeAsync(GEMINI_REQUEST_TIMEOUT_MS);
    await expect(Promise.all([...admitted.slice(1), replacement])).resolves.toEqual(
      Array(GEMINI_MAX_IN_FLIGHT_REQUESTS).fill(null)
    );
    expect(generateContent.mock.calls[0][1].signal.aborted).toBe(false);
    for (const [, requestOptions] of generateContent.mock.calls.slice(1)) {
      expect(requestOptions.signal.aborted).toBe(true);
    }
    expect(vi.getTimerCount()).toBe(0);

    providerCalls[1].resolve(result('late stale decision'));
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(30_000);
    generateContent.mockResolvedValue(result('recovered decision'));
    await expect(client.generateContent('hung plant state 1')).resolves.toBe('recovered decision');
  });

  it('does not skip a healthy fallback when concurrent requests reject the same retired model', async () => {
    const retiredCalls = [deferred<GeminiResult>(), deferred<GeminiResult>()];
    const retiredGenerate = vi
      .fn()
      .mockImplementationOnce(() => retiredCalls[0].promise)
      .mockImplementationOnce(() => retiredCalls[1].promise);
    const fallbackGenerate = vi.fn().mockResolvedValue(result('fallback decision'));
    const laterFallbackGenerate = vi.fn().mockResolvedValue(result('wrong fallback'));

    sdk.getGenerativeModel.mockImplementation(({ model }: { model: string }) => {
      if (model === GEMINI_MODEL_CANDIDATES[0]) return { generateContent: retiredGenerate };
      if (model === GEMINI_MODEL_CANDIDATES[1]) return { generateContent: fallbackGenerate };
      return { generateContent: laterFallbackGenerate };
    });

    const client = new GeminiClient();
    client.initialize('key');
    const first = client.generateContent('state A');
    const second = client.generateContent('state B');

    expect(retiredGenerate).toHaveBeenCalledTimes(2);
    retiredCalls[0].reject(new Error('404 model is not found'));
    retiredCalls[1].reject(new Error('404 model is not found'));

    await expect(Promise.all([first, second])).resolves.toEqual([
      'fallback decision',
      'fallback decision',
    ]);
    expect(client.getActiveModelId()).toBe(GEMINI_MODEL_CANDIDATES[1]);
    expect(laterFallbackGenerate).not.toHaveBeenCalled();
  });

  it('invalidates an outstanding response when credentials are replaced', async () => {
    const oldPending = deferred<GeminiResult>();
    const oldGenerate = vi.fn().mockReturnValue(oldPending.promise);
    const newGenerate = vi.fn().mockResolvedValue(result('new account decision'));
    sdk.getGenerativeModel.mockImplementation((_config: { model: string }, apiKey: string) => ({
      generateContent: apiKey === 'old-key' ? oldGenerate : newGenerate,
    }));

    const client = new GeminiClient();
    client.initialize('old-key');
    const staleRequest = client.generateContent('shared prompt');

    client.initialize('new-key');
    await expect(staleRequest).resolves.toBeNull();
    expect(oldGenerate.mock.calls[0][1].signal.aborted).toBe(true);
    await expect(client.generateContent('shared prompt')).resolves.toBe('new account decision');
    oldPending.resolve(result('old account decision'));

    await expect(client.generateContent('shared prompt')).resolves.toBe('new account decision');
    expect(oldGenerate).toHaveBeenCalledTimes(1);
    expect(newGenerate).toHaveBeenCalledTimes(1);
  });

  it('serves an exact cached response while open and resets at the breaker boundary', async () => {
    const generateContent = vi.fn().mockImplementation((prompt: string) => {
      if (prompt === 'cached') return Promise.resolve(result('cached decision'));
      if (prompt === 'after reset') return Promise.resolve(result('recovered'));
      return Promise.reject(new Error('network unavailable'));
    });
    sdk.getGenerativeModel.mockReturnValue({ generateContent });
    const client = new GeminiClient();
    client.initialize('key');

    await expect(client.generateContent('cached')).resolves.toBe('cached decision');
    await client.generateContent('failure 1');
    await client.generateContent('failure 2');
    await client.generateContent('failure 3');
    expect(client.getCircuitBreakerStatus().isOpen).toBe(true);

    await expect(client.generateContent('cached')).resolves.toBe('cached decision');
    expect(generateContent).toHaveBeenCalledTimes(4);

    vi.advanceTimersByTime(30_000);
    await expect(client.generateContent('after reset')).resolves.toBe('recovered');
    expect(client.getCircuitBreakerStatus()).toMatchObject({ failures: 0, isOpen: false });
  });

  it('counts whitespace-only model output as a failure instead of caching it', async () => {
    const generateContent = vi.fn().mockResolvedValue(result(' \n\t'));
    sdk.getGenerativeModel.mockReturnValue({ generateContent });
    const client = new GeminiClient();
    client.initialize('key');

    await expect(client.generateContent('attempt 1')).resolves.toBeNull();
    await expect(client.generateContent('attempt 2')).resolves.toBeNull();
    await expect(client.generateContent('attempt 3')).resolves.toBeNull();

    expect(client.getCircuitBreakerStatus()).toMatchObject({ failures: 3, isOpen: true });
    expect(generateContent).toHaveBeenCalledTimes(3);
  });

  it('half-opens through isConnected once the breaker cool-down elapses', async () => {
    // Callers gate on isConnected() before generateContent(); if only the
    // latter reset the breaker, an opened breaker could never close again.
    const generateContent = vi.fn().mockRejectedValue(new Error('network unavailable'));
    sdk.getGenerativeModel.mockReturnValue({ generateContent });
    const client = new GeminiClient();
    client.initialize('key');

    await client.generateContent('failure 1');
    await client.generateContent('failure 2');
    await client.generateContent('failure 3');
    expect(client.isConnected()).toBe(false);

    vi.advanceTimersByTime(29_999);
    expect(client.isConnected()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(client.isConnected()).toBe(true);
    expect(client.getCircuitBreakerStatus()).toMatchObject({ failures: 0, isOpen: false });
  });

  it('reports an empty connection response as a failed probe', async () => {
    const generateContent = vi.fn().mockResolvedValue(result(''));
    sdk.getGenerativeModel.mockReturnValue({ generateContent });
    const client = new GeminiClient();
    client.initialize('key');

    await expect(client.testConnection()).resolves.toEqual({
      success: false,
      message: 'Empty response from model',
    });
    expect(client.getCircuitBreakerStatus().failures).toBe(1);
  });

  it('settles and aborts a hung connection probe at the request deadline', async () => {
    const pending = deferred<GeminiResult>();
    const generateContent = vi.fn().mockReturnValue(pending.promise);
    sdk.getGenerativeModel.mockReturnValue({ generateContent });
    const client = new GeminiClient();
    client.initialize('key');

    const probe = client.testConnection();
    await vi.advanceTimersByTimeAsync(GEMINI_REQUEST_TIMEOUT_MS);

    await expect(probe).resolves.toEqual({
      success: false,
      message: `Request timed out after ${GEMINI_REQUEST_TIMEOUT_MS}ms`,
    });
    expect(generateContent.mock.calls[0][1]).toMatchObject({
      timeout: GEMINI_REQUEST_TIMEOUT_MS,
    });
    expect(generateContent.mock.calls[0][1].signal.aborted).toBe(true);
    expect(client.getCircuitBreakerStatus().failures).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('truncates oversized prompts without creating malformed UTF-16', async () => {
    const generateContent = vi.fn().mockResolvedValue(result('ok'));
    sdk.getGenerativeModel.mockReturnValue({ generateContent });
    const client = new GeminiClient();
    client.initialize('key');
    const prompt = `${'a'.repeat(14_399)}😀${'b'.repeat(12_000)}END`;

    await expect(client.generateContent(prompt)).resolves.toBe('ok');
    const submitted = generateContent.mock.calls[0][0] as string;
    expect(submitted.length).toBeLessThanOrEqual(24_000);
    expect(submitted).toContain('[... context truncated for token limits ...]');
    expect(submitted.endsWith('END')).toBe(true);
    expect(hasLoneSurrogate(submitted)).toBe(false);
  });
});
