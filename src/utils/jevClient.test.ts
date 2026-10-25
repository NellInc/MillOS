import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const local = vi.hoisted(() => ({
  isConnected: vi.fn(() => true),
  getModelId: vi.fn(() => 'Qwen3.5-4B-q4f16_1-MLC'),
  scoreNextToken: vi.fn(),
}));
vi.mock('./webgpuClient', () => ({ webgpuClient: local }));

import {
  advisoryProviders,
  JEV_ENDPOINT,
  LOCAL_QUEUE_TOKENS,
  JEV_MAX_TEXT_LENGTH,
  JEV_MODEL,
  JEV_QUEUE_DESCRIPTIONS,
  JEV_QUEUES,
  JEV_TIMEOUT_MS,
  HAIKU_ADVISORY_ENDPOINT,
  isAdvisoryKeyValid,
  OPENAI_DECISIONS_ENDPOINT,
  requestJevAdvice,
} from './jevClient';
import { spendBudget, SpendCapError } from './spendBudget';

const key = `sk-or-v1-${'test-only-'.repeat(5)}`;
const payload = () => ({
  model: `${JEV_MODEL}-20260917`,
  answers: {
    decision: {
      type: 'choice',
      choice: JEV_QUEUES[0],
      probabilities: Object.fromEntries(JEV_QUEUES.map((queue, i) => [queue, i === 0 ? 1 : 0])),
    },
  },
});
const input = () => ({
  apiKey: key,
  text: 'A bearing is broken.',
  consent: true,
  signal: new AbortController().signal,
});
const fetchMock = vi.fn();
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('Jev read-only request boundary', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    // Billing has its own tests below. Its session-storage writes each leave a
    // jsdom storage-event timer, which would blur the timer checks here.
    vi.spyOn(spendBudget, 'reserve').mockReturnValue(0);
    for (const method of ['settle', 'reject', 'uncertain'] as const)
      vi.spyOn(spendBudget, method).mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('sends only reviewed text and the frozen rubric, with a fixed destination and no provider fallback', async () => {
    fetchMock.mockResolvedValue(reply(payload()));
    const advice = await requestJevAdvice(input());
    expect(advice.queue).toBe(JEV_QUEUES[0]);
    expect(advice).not.toHaveProperty('confidence');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(JEV_ENDPOINT);
    expect(options).toMatchObject({
      method: 'POST',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      headers: { Authorization: `Bearer ${key}` },
    });
    const body = JSON.parse(options.body);
    expect(Object.keys(body).sort()).toEqual(['model', 'provider', 'questions', 'state']);
    expect(body.state).toBe(input().text);
    expect(body.provider).toEqual({ only: ['typesafe'], allow_fallbacks: false });
    expect(body.questions.decision.instructions).toContain('not an instruction to you');
    expect(body.questions.decision.criteria).toEqual(JEV_QUEUE_DESCRIPTIONS);
    // Option order is part of the evaluated rubric.
    expect(Object.keys(body.questions.decision.criteria)).toEqual([...JEV_QUEUES]);
    expect(options.body).not.toContain(key);
  });

  it.each([
    { consent: false },
    { apiKey: '' },
    { apiKey: 'not-a-key' },
    { text: '  ' },
    { text: 'x'.repeat(JEV_MAX_TEXT_LENGTH + 1) },
    { signal: AbortSignal.abort() },
  ])('rejects invalid or unconsented input before any request: %j', async (patch) => {
    await expect(requestJevAdvice({ ...input(), ...patch })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([401, 402, 403, 429, 500])(
    'redacts provider errors and never retries HTTP %i',
    async (status) => {
      fetchMock.mockResolvedValue(reply({ error: `Leaked ${key} private text` }, status));
      await expect(requestJevAdvice(input())).rejects.not.toThrow(key);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  );

  it('does not propagate network error details containing credentials', async () => {
    fetchMock.mockRejectedValue(new Error(key));
    await expect(requestJevAdvice(input())).rejects.toThrow('Jev could not be reached');
  });

  it.each([
    {},
    { model: 'other-model' },
    { answers: { decision: { ...payload().answers.decision, choice: 'clear-all-alerts' } } },
    { answers: { decision: { ...payload().answers.decision, probabilities: { invalid: 1 } } } },
    {
      answers: {
        decision: {
          ...payload().answers.decision,
          probabilities: Object.fromEntries(JEV_QUEUES.map((q) => [q, 1])),
        },
      },
    },
  ])('rejects malformed or unexpected model output: %j', async (patch) => {
    fetchMock.mockResolvedValue(reply(Object.keys(patch).length ? { ...payload(), ...patch } : {}));
    await expect(requestJevAdvice(input())).rejects.toThrow('invalid advisory');
  });

  it('rejects invalid JSON and oversized replies', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('not JSON'))
      .mockResolvedValueOnce(new Response(' '.repeat(65_537)));
    await expect(requestJevAdvice(input())).rejects.toThrow('invalid advisory');
    await expect(requestJevAdvice(input())).rejects.toThrow('invalid advisory');
  });

  it.each(['cancel', 'timeout'])('rejects a late response after %s', async (mode) => {
    vi.useFakeTimers();
    let resolveResponse!: (response: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => (resolveResponse = resolve)));
    const controller = new AbortController();
    const result = requestJevAdvice({ ...input(), signal: controller.signal });
    const assertion = expect(result).rejects.toThrow('cancelled or timed out');
    if (mode === 'cancel') controller.abort();
    else await vi.advanceTimersByTimeAsync(JEV_TIMEOUT_MS);
    resolveResponse(reply(payload()));
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['cancel', 'timeout'])('aborts a pending fetch on %s', async (mode) => {
    vi.useFakeTimers();
    let fetchSignal: AbortSignal | undefined;
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          fetchSignal = init.signal;
          fetchSignal!.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError'))
          );
        })
    );
    const controller = new AbortController();
    const result = requestJevAdvice({ ...input(), signal: controller.signal });
    const assertion = expect(result).rejects.toThrow();
    if (mode === 'cancel') controller.abort();
    else await vi.advanceTimersByTimeAsync(JEV_TIMEOUT_MS);
    await assertion;
    expect(fetchSignal?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('OpenAI Decisions on the same frozen rubric', () => {
  const openaiKey = `sk-proj-${'test-only-'.repeat(4)}`;
  const openaiPayload = (choice: string = JEV_QUEUES[2]) => ({
    model: 'gpt-6-luna',
    answers: [
      {
        type: 'choice',
        name: 'decision',
        choice,
        probabilities: JEV_QUEUES.map((value) => ({
          value,
          probability: value === choice ? 0.96 : 0.01,
        })),
        confidence: 0.96,
      },
    ],
    usage: { input_tokens: 179, output_tokens: 0 },
  });
  const openaiInput = () => ({ ...input(), apiKey: openaiKey, provider: 'openai' as const });

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('asks the same question with the same five queues and reads the listed probabilities', async () => {
    fetchMock.mockResolvedValue(reply(openaiPayload()));
    const advice = await requestJevAdvice(openaiInput());
    expect(advice.queue).toBe(JEV_QUEUES[2]);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(OPENAI_DECISIONS_ENDPOINT);
    expect(options).toMatchObject({
      credentials: 'omit',
      redirect: 'error',
      headers: { Authorization: `Bearer ${openaiKey}` },
    });
    const body = JSON.parse(options.body);
    expect(Object.keys(body).sort()).toEqual(['input', 'model', 'questions']);
    expect(body.model).toBe('gpt-6-luna');
    expect(body.input).toBe(input().text);
    expect(body.questions).toHaveLength(1);
    expect(body.questions[0].type).toBe('choice');
    // Luna keeps the base question: the injection guard cost it accuracy.
    expect(body.questions[0].instructions).toContain('CURRENT unresolved issue');
    expect(body.questions[0].instructions).not.toContain('not an instruction to you');
    expect(body.questions[0].choices).toEqual(
      JEV_QUEUES.map((queue) => ({ value: queue, description: JEV_QUEUE_DESCRIPTIONS[queue] }))
    );
  });

  it('rejects a refusal, a missing queue and a winner that is not the most probable', async () => {
    const refusal = { ...openaiPayload(), answers: [{ type: 'refusal', name: 'decision' }] };
    const short = openaiPayload();
    short.answers[0].probabilities.pop();
    const lopsided = openaiPayload();
    lopsided.answers[0].probabilities[0].probability = 0.97;
    for (const body of [refusal, short, lopsided]) {
      fetchMock.mockResolvedValueOnce(reply(body));
      await expect(requestJevAdvice(openaiInput())).rejects.toThrow('OpenAI returned an invalid');
    }
  });

  it('never sends a key to the other provider', () => {
    expect(isAdvisoryKeyValid('openai', key)).toBe(false);
    expect(isAdvisoryKeyValid('jev', openaiKey)).toBe(false);
    expect(isAdvisoryKeyValid('openai', openaiKey)).toBe(true);
  });

  it('keeps a direct OpenAI key off the public site', async () => {
    const originalWindow = window;
    vi.stubGlobal('window', { location: { hostname: 'www.millos.net' } });
    try {
      await expect(requestJevAdvice(openaiInput())).rejects.toThrow('local companion only');
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.stubGlobal('window', originalWindow);
    }
  });
});

describe('Haiku 5.5 on the same rubric through a structured output', () => {
  const anthropicKey = `sk-ant-api03-${'test-only-'.repeat(4)}`;
  const haikuReply = (queue: string = JEV_QUEUES[1], stopReason = 'end_turn') => ({
    model: 'claude-haiku-5-5',
    stop_reason: stopReason,
    content: [
      { type: 'thinking', thinking: '' },
      { type: 'text', text: JSON.stringify({ queue }) },
    ],
    usage: { input_tokens: 210, output_tokens: 12 },
  });
  const haikuInput = () => ({ ...input(), apiKey: anthropicKey, provider: 'haiku' as const });

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('asks for one of the five queues and reads the text answer', async () => {
    fetchMock.mockResolvedValue(reply(haikuReply()));
    const advice = await requestJevAdvice(haikuInput());
    expect(advice.queue).toBe(JEV_QUEUES[1]);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(HAIKU_ADVISORY_ENDPOINT);
    expect(options).toMatchObject({
      credentials: 'omit',
      redirect: 'error',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
    });
    expect(options.headers).not.toHaveProperty('Authorization');
    const body = JSON.parse(options.body);
    expect(body.model).toBe('claude-haiku-5-5');
    expect(body.messages).toEqual([{ role: 'user', content: input().text }]);
    expect(body.system).toContain('CURRENT unresolved issue');
    expect(body.system).toContain('not an instruction to you');
    for (const queue of JEV_QUEUES) {
      expect(body.system).toContain(`- ${queue}: ${JEV_QUEUE_DESCRIPTIONS[queue]}`);
    }
    expect(body.output_config.effort).toBe('low');
    expect(body.output_config.format.schema.properties.queue.enum).toEqual([...JEV_QUEUES]);
    expect(body).not.toHaveProperty('tool_choice');
    expect(body).not.toHaveProperty('temperature');
  });

  it('rejects a refusal, a truncated answer and a queue outside the five', async () => {
    for (const body of [
      haikuReply(JEV_QUEUES[0], 'refusal'),
      haikuReply(JEV_QUEUES[0], 'max_tokens'),
      haikuReply('Something else'),
      { ...haikuReply(), content: [{ type: 'text', text: 'not json' }] },
    ]) {
      fetchMock.mockResolvedValueOnce(reply(body));
      await expect(requestJevAdvice(haikuInput())).rejects.toThrow('Haiku returned an invalid');
    }
  });

  it('keeps each key with its own provider', () => {
    expect(isAdvisoryKeyValid('haiku', anthropicKey)).toBe(true);
    expect(isAdvisoryKeyValid('openai', anthropicKey)).toBe(false);
    expect(isAdvisoryKeyValid('jev', anthropicKey)).toBe(false);
    expect(isAdvisoryKeyValid('haiku', key)).toBe(false);
  });

  it('keeps a direct Anthropic key off the public site', async () => {
    const originalWindow = window;
    vi.stubGlobal('window', { location: { hostname: 'www.millos.net' } });
    try {
      await expect(requestJevAdvice(haikuInput())).rejects.toThrow('local companion only');
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.stubGlobal('window', originalWindow);
    }
  });
});

describe('the on-device model on the same rubric as a five-way choice', () => {
  const model = 'Qwen3.5-4B-q4f16_1-MLC';
  const scores = (winner = 1) =>
    JEV_QUEUES.map((queue, i) => ({
      token: LOCAL_QUEUE_TOKENS[model]![queue].token,
      probability: i === winner ? 0.6 : 0.1,
    }));
  const localInput = () => ({ ...input(), apiKey: '', consent: false, provider: 'local' as const });

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    local.isConnected.mockReturnValue(true);
    local.getModelId.mockReturnValue(model);
    local.scoreNextToken.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('is offered only while the local model is loaded, on the public site too', () => {
    const originalWindow = window;
    vi.stubGlobal('window', { location: { hostname: 'www.millos.net' } });
    try {
      expect(advisoryProviders(true)).toEqual(['jev', 'local']);
      expect(advisoryProviders(false)).toEqual(['jev']);
    } finally {
      vi.stubGlobal('window', originalWindow);
    }
  });

  it('needs no key or consent, sends nothing over the network and returns the most probable queue', async () => {
    local.scoreNextToken.mockResolvedValue(scores(1));
    const advice = await requestJevAdvice(localInput());
    expect(advice.queue).toBe(JEV_QUEUES[1]);
    expect(fetchMock).not.toHaveBeenCalled();
    const [request] = local.scoreNextToken.mock.calls[0];
    expect(request.user).toBe(input().text);
    expect(request.system).toContain('CURRENT unresolved issue');
    expect(request.system).toContain('not an instruction to you');
    for (const queue of JEV_QUEUES) {
      expect(request.system).toContain(`- ${queue}: ${JEV_QUEUE_DESCRIPTIONS[queue]}`);
    }
    expect(request.tokenIds).toEqual(
      JEV_QUEUES.map((queue) => LOCAL_QUEUE_TOKENS[model]![queue].id)
    );
  });

  it('refuses when the local model is not loaded or its vocabulary is unknown', async () => {
    local.isConnected.mockReturnValue(false);
    await expect(requestJevAdvice(localInput())).rejects.toThrow('on-device model is not loaded');
    local.isConnected.mockReturnValue(true);
    local.getModelId.mockReturnValue('SomeOther-1B-q4f16_1-MLC');
    await expect(requestJevAdvice(localInput())).rejects.toThrow('on-device model is not loaded');
    expect(local.scoreNextToken).not.toHaveBeenCalled();
  });

  it('reads a confident answer whose other queues rounded to zero', async () => {
    // As Qwen3-4B returned it in Chrome: web-llm filled the slots after the
    // winner with zero-probability tokens 0-3.
    local.scoreNextToken.mockResolvedValue([
      { token: 'Product', probability: 1 },
      { token: 'No', probability: 1e-9 },
      { token: '!', probability: 0 },
      { token: '"', probability: 0 },
      { token: '#', probability: 0 },
    ]);
    expect((await requestJevAdvice(localInput())).queue).toBe('Product quality');
  });

  it('rejects probability outside the five queue tokens, or a distribution they do not carry', async () => {
    const wrongToken = scores();
    wrongToken[2] = { token: 'Logistics', probability: 0.1 };
    const missing = scores().slice(0, 4);
    const negative = scores();
    negative[0] = { ...negative[0], probability: -0.1 };
    for (const result of [null, [], wrongToken, missing, negative]) {
      local.scoreNextToken.mockResolvedValueOnce(result);
      await expect(requestJevAdvice(localInput())).rejects.toThrow(
        'on-device model returned an invalid'
      );
    }
  });

  it('keeps the text length limit', async () => {
    await expect(
      requestJevAdvice({ ...localInput(), text: 'x'.repeat(JEV_MAX_TEXT_LENGTH + 1) })
    ).rejects.toThrow();
    expect(local.scoreNextToken).not.toHaveBeenCalled();
  });
});

describe('Paid advisories are charged to the session budget', () => {
  const haikuKey = `sk-ant-api03-${'test-only-'.repeat(4)}`;
  const before = () => ({ ...spendBudget.getSnapshot() });
  const delta = (start: ReturnType<typeof before>) => {
    const now = spendBudget.getSnapshot();
    return {
      spent: now.spentUsd - start.spentUsd,
      reserved: now.reservedUsd - start.reservedUsd,
      uncertain: now.uncertainUsd - start.uncertainUsd,
      requests: now.requestCount - start.requestCount,
      input: now.totalInputTokens - start.totalInputTokens,
      output: now.totalOutputTokens - start.totalOutputTokens,
    };
  };

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("charges Jev's reported cost and counts its tokens", async () => {
    const start = before();
    fetchMock.mockResolvedValue(
      reply({ ...payload(), usage: { input_tokens: 329, output_tokens: 64, cost: 0.000014 } })
    );
    await requestJevAdvice(input());
    const d = delta(start);
    expect(d.spent).toBeCloseTo(0.000014, 9);
    expect(d).toMatchObject({ reserved: 0, uncertain: 0, requests: 1, input: 329, output: 64 });
  });

  it("prices Haiku's tokens at Haiku's rates, cache tokens as input", async () => {
    const start = before();
    fetchMock.mockResolvedValue(
      reply({
        model: 'claude-haiku-5-5',
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: JSON.stringify({ queue: JEV_QUEUES[1] }) }],
        usage: { input_tokens: 200, cache_read_input_tokens: 10, output_tokens: 12 },
      })
    );
    await requestJevAdvice({ ...input(), apiKey: haikuKey, provider: 'haiku' });
    const d = delta(start);
    expect(d.spent).toBeCloseTo((210 * 0.1 + 12 * 0.5) / 1_000_000, 12);
    expect(d).toMatchObject({ reserved: 0, uncertain: 0, requests: 1, input: 210, output: 12 });
  });

  it('charges an answer that has usage even when the advice itself is unusable', async () => {
    const start = before();
    fetchMock.mockResolvedValue(
      reply({ model: 'nope', usage: { input_tokens: 100, output_tokens: 5, cost: 0.00001 } })
    );
    await expect(requestJevAdvice(input())).rejects.toThrow();
    expect(delta(start)).toMatchObject({ reserved: 0, uncertain: 0, requests: 1 });
  });

  it('releases the reservation when the provider refuses the request', async () => {
    const start = before();
    fetchMock.mockResolvedValue(reply({ error: 'no' }, 401));
    await expect(requestJevAdvice(input())).rejects.toThrow();
    expect(delta(start)).toMatchObject({ spent: 0, reserved: 0, uncertain: 0, requests: 0 });
  });

  it('keeps a request that may have been billed as possibly charged', async () => {
    for (const failure of [
      () => fetchMock.mockRejectedValue(new Error('network')),
      () => fetchMock.mockResolvedValue(reply(payload())),
    ]) {
      const start = before();
      failure();
      await requestJevAdvice(input()).catch(() => undefined);
      const d = delta(start);
      expect(d.spent).toBe(0);
      expect(d.reserved).toBeCloseTo(0, 12);
      expect(d.uncertain).toBeGreaterThan(0);
    }
  });

  it('sends nothing once the session cap is reached, and says so', async () => {
    vi.spyOn(spendBudget, 'reserve').mockImplementation(() => {
      throw new SpendCapError('Session cost cap reached. No paid request was sent.');
    });
    await expect(requestJevAdvice(input())).rejects.toThrow(/No paid request was sent/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never charges the on-device model', async () => {
    const reserve = vi.spyOn(spendBudget, 'reserve');
    local.scoreNextToken.mockResolvedValue(
      JEV_QUEUES.map((queue, i) => ({
        token: LOCAL_QUEUE_TOKENS['Qwen3.5-4B-q4f16_1-MLC']![queue].token,
        probability: i === 0 ? 1 : 0,
      }))
    );
    await requestJevAdvice({ ...input(), apiKey: '', consent: false, provider: 'local' });
    expect(reserve).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
