import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  JEV_ENDPOINT,
  JEV_MAX_TEXT_LENGTH,
  JEV_MODEL,
  JEV_QUEUES,
  JEV_TIMEOUT_MS,
  requestJevAdvice,
} from './jevClient';

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
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
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
    expect(body.questions.decision.criteria).toEqual(
      Object.fromEntries(JEV_QUEUES.map((queue) => [queue, null]))
    );
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
