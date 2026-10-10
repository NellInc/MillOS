import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CloudAIClient } from './cloudAIClient';

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

describe('CloudAIClient browser BYOK contract', () => {
  beforeEach(() => vi.unstubAllGlobals());
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
});
