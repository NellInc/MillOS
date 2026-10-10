import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CloudAIClient } from './cloudAIClient';
import { SpendBudget, SpendCapError } from './spendBudget';

const haikuResponse = (text = '{"priorities":["Protect RM-101"]}') => ({
  stop_reason: 'end_turn',
  content: [
    { type: 'thinking', thinking: 'private' },
    { type: 'text', text },
  ],
  usage: { input_tokens: 120, output_tokens: 80 },
});

const lunaResponse = (text = '{"priorities":["Protect RM-101"]}') => ({
  status: 'completed',
  output: [
    { type: 'reasoning', summary: [] },
    { type: 'message', content: [{ type: 'output_text', text }] },
  ],
  usage: { input_tokens: 110, output_tokens: 75 },
});

function ok(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

const openRouterResponse = (cost = 0.00042) => ({
  choices: [{ finish_reason: 'stop', message: { content: '{"priorities":["Protect RM-101"]}' } }],
  usage: { prompt_tokens: 100, completion_tokens: 60, cost },
});

describe('CloudAIClient browser BYOK contract', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ['haiku', haikuResponse(), 'https://api.anthropic.com/v1/messages'],
    ['luna', lunaResponse(), 'https://api.openai.com/v1/responses'],
  ] as const)(
    'sends the selected %s model at high effort and reads only text',
    async (backend, body, endpoint) => {
      const fetchMock = vi.fn().mockResolvedValue(ok(body));
      vi.stubGlobal('fetch', fetchMock);
      const client = new CloudAIClient();
      client.setKey(backend, 'private-key');
      const result = await client.generateContent(backend, 'Plant telemetry');
      expect(result.text).toContain('Protect RM-101');
      expect(result.text).not.toContain('private');
      expect(result.inputTokens).toBe(backend === 'haiku' ? 120 : 110);
      expect(result.outputTokens).toBe(backend === 'haiku' ? 80 : 75);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(endpoint);
      expect(init.credentials).toBe('omit');
      const request = JSON.parse(init.body as string);
      expect(request.model).toBe(backend === 'haiku' ? 'claude-haiku-5-5' : 'gpt-6-luna');
      if (backend === 'haiku') {
        expect(request.output_config).toEqual({ effort: 'high' });
        expect(request.thinking).toEqual({ type: 'adaptive' });
        expect(init.headers).toMatchObject({
          'x-api-key': 'private-key',
          'anthropic-dangerous-direct-browser-access': 'true',
        });
      } else {
        expect(request.reasoning).toEqual({ effort: 'high' });
        expect(request.prompt_cache_options).toEqual({ mode: 'explicit' });
        expect(request.store).toBe(false);
        expect(init.headers).toMatchObject({ Authorization: 'Bearer private-key' });
      }
    }
  );

  it.each([
    ['haiku', { ...haikuResponse(), stop_reason: 'max_tokens' }],
    ['luna', { ...lunaResponse(), status: 'incomplete' }],
    ['haiku', { ...haikuResponse(), content: [{ type: 'thinking', thinking: 'only' }] }],
    ['luna', { ...lunaResponse(), output: [{ type: 'reasoning', summary: [] }] }],
  ] as const)('rejects incomplete or thinking-only %s results', async (backend, body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok(body)));
    const client = new CloudAIClient();
    client.setKey(backend, 'private-key');
    await expect(client.generateContent(backend, 'Plant telemetry')).rejects.toThrow();
  });

  it.each([401, 403, 429, 500])('maps HTTP %i without reflecting provider text', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private-key', { status })));
    const client = new CloudAIClient();
    client.setKey('luna', 'private-key');
    await expect(client.generateContent('luna', 'Plant telemetry')).rejects.not.toThrow(
      'private-key'
    );
  });

  it('invalidates an in-flight result after the key changes', async () => {
    let resolve!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(
        new Promise<Response>((r) => {
          resolve = r;
        })
      )
    );
    const client = new CloudAIClient();
    client.setKey('haiku', 'old-key');
    const stale = client.generateContent('haiku', 'Plant telemetry');
    client.setKey('haiku', 'new-key');
    resolve(ok(haikuResponse()));
    await expect(stale).rejects.toThrow(/cancelled/i);
  });

  it('rejects missing usage rather than displaying a false zero-cost estimate', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok({ ...lunaResponse(), usage: undefined })));
    const client = new CloudAIClient();
    client.setKey('luna', 'private-key');
    await expect(client.generateContent('luna', 'Plant telemetry')).rejects.toThrow(/usage data/);
  });

  it('reports network failure without retaining or reflecting the credential', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('private-key in internal error'))
    );
    const client = new CloudAIClient();
    client.setKey('haiku', 'private-key');
    await expect(client.generateContent('haiku', 'Plant telemetry')).rejects.toThrow(
      /Cannot reach/
    );
    client.clearKey('haiku');
    expect(client.hasKey('haiku')).toBe(false);
  });

  it.each([
    ['openrouter-haiku', 'anthropic/claude-haiku-5.5'],
    ['openrouter-luna', 'openai/gpt-6-luna'],
  ] as const)('routes %s with high reasoning and billed cost', async (backend, model) => {
    const fetchMock = vi.fn().mockResolvedValue(ok(openRouterResponse()));
    vi.stubGlobal('fetch', fetchMock);
    const budget = new SpendBudget();
    const client = new CloudAIClient(budget);
    client.setKey(backend, 'or-key');
    await client.generateContent(backend, 'Plant telemetry');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer or-key' });
    const payload = JSON.parse(init.body as string);
    expect(payload).toMatchObject({
      model,
      reasoning: { effort: 'high' },
      provider: { require_parameters: true, max_price: { prompt: 0.1, completion: 0.5 } },
      messages: [{ role: 'user', content: 'Plant telemetry' }],
    });
    if (backend === 'openrouter-luna') {
      expect(payload.prompt_cache_options).toEqual({ mode: 'explicit' });
    }
    expect(budget.getSnapshot().spentUsd).toBe(0.00042);
  });

  it('counts a billable key test, even before connecting a key', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok(haikuResponse())));
    const budget = new SpendBudget();
    const client = new CloudAIClient(budget);
    await client.testKey('haiku', 'candidate-key');
    expect(client.hasKey('haiku')).toBe(false);
    expect(budget.getSnapshot().requestCount).toBe(1);
  });

  it('counts OpenRouter account and upstream BYOK charges together', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        ok({
          ...openRouterResponse(0.00042),
          usage: {
            ...openRouterResponse(0.00042).usage,
            cost_details: { upstream_inference_cost: 0.00031 },
          },
        })
      )
    );
    const budget = new SpendBudget();
    const client = new CloudAIClient(budget);
    client.setKey('openrouter-haiku', 'or-key');
    await client.generateContent('openrouter-haiku', 'Plant telemetry');
    expect(budget.getSnapshot().spentUsd).toBeCloseTo(0.00073, 10);
  });

  it('blocks before fetch when the cap cannot reserve another request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok(lunaResponse()));
    vi.stubGlobal('fetch', fetchMock);
    const budget = new SpendBudget();
    budget.setCap(0.01);
    const holds = Array.from({ length: 4 }, () => budget.reserve('Plant telemetry', 4096));
    const client = new CloudAIClient(budget);
    client.setKey('luna', 'key');
    await expect(client.generateContent('luna', 'Plant telemetry')).rejects.toBeInstanceOf(
      SpendCapError
    );
    expect(fetchMock).not.toHaveBeenCalled();
    holds.forEach((id) => budget.reject(id));
  });

  it('accounts for incomplete responses and holds uncertain usage', async () => {
    const budget = new SpendBudget();
    const client = new CloudAIClient(budget);
    client.setKey('luna', 'key');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(ok({ ...lunaResponse(), status: 'incomplete' }))
    );
    await expect(client.generateContent('luna', 'Plant telemetry')).rejects.toThrow(/complete/);
    expect(budget.getSnapshot().requestCount).toBe(1);
    expect(budget.getSnapshot().spentUsd).toBeGreaterThan(0);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok({ ...lunaResponse(), usage: undefined })));
    await expect(client.generateContent('luna', 'Plant telemetry')).rejects.toThrow(/usage/);
    expect(budget.getSnapshot().uncertainUsd).toBeGreaterThan(0);
  });
});
