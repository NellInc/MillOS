import { describe, expect, it, vi } from 'vitest';
import { isEngineGoneError, WebGPUClient } from './webgpuClient';

const MODEL = 'Qwen3.5-4B-q4f16_1-MLC';
const ANSWER = ['{"focus', 'Machine"', ': "rm-', '102"}'];
const SCORE = {
  choices: [{ logprobs: { content: [{ top_logprobs: [{ token: 'Equipment', logprob: 0 }] }] } }],
};

/**
 * A stand-in for web-llm 0.2.86's engine, as far as these paths use it: the
 * interrupt flag is reset when a request starts and checked before each token
 * after the first, and an interrupted stream still ends with an 'abort' chunk.
 */
function fakeEngine(onToken?: (index: number) => void) {
  const log: string[] = [];
  const prompts: Array<{ prompt: string; max_tokens: number }> = [];
  const chats: Array<{ model?: string; content: string }> = [];
  let interrupt = false;
  let releaseScore: () => void = () => undefined;
  const engine = {
    interruptGenerate: () => {
      interrupt = true;
      log.push('interrupt');
    },
    completions: {
      create: async ({ prompt, max_tokens }: { prompt: string; max_tokens: number }) => {
        prompts.push({ prompt, max_tokens });
        interrupt = false;
        // Continue from wherever the prompt's own text has got to.
        const sofar = prompt.slice(prompts[0].prompt.length);
        let start = 0;
        for (let acc = ''; acc !== sofar && start < ANSWER.length; start++) acc += ANSWER[start];
        log.push(`segment from ${start}`);
        return (async function* () {
          let produced = 0;
          for (let k = start; k < ANSWER.length; k++) {
            if (produced > 0 && interrupt) {
              yield { choices: [{ text: '', finish_reason: 'abort' }] };
              yield { choices: [], usage: { completion_tokens: produced } };
              return;
            }
            produced += 1;
            log.push(`token ${k}`);
            yield { choices: [{ text: ANSWER[k], finish_reason: null }] };
            onToken?.(k);
          }
          yield { choices: [{ text: '', finish_reason: 'stop' }] };
          yield { choices: [], usage: { completion_tokens: produced } };
        })();
      },
    },
    chat: {
      completions: {
        create: (request: {
          model?: string;
          max_tokens: number;
          messages: Array<{ content: string }>;
        }) => {
          chats.push({ model: request.model, content: request.messages.at(-1)?.content ?? '' });
          if (request.max_tokens === 1) {
            log.push('score');
            return new Promise((resolve) => {
              releaseScore = () => {
                log.push('score done');
                resolve(SCORE);
              };
            });
          }
          return Promise.resolve({
            choices: [{ message: { content: ANSWER.join('') }, finish_reason: 'stop' }],
          });
        },
      },
    },
  };
  return { engine, log, prompts, chats, releaseScore: () => releaseScore() };
}

function clientWith(engine: unknown, modelId = MODEL, fastLaneId: string | null = null) {
  const client = new WebGPUClient();
  Object.assign(client as unknown as Record<string, unknown>, { engine, modelId, fastLaneId });
  return client;
}

const score = (client: WebGPUClient) =>
  client.scoreNextToken({ system: 'Route it.', user: 'Bearing hot.', tokenIds: [56315] });

describe('webgpuClient without the fast lane', () => {
  it('pauses an answer for a scoring call and continues from its own text', async () => {
    let client: WebGPUClient | null = null;
    let scored: ReturnType<typeof score> | null = null;
    const fake = fakeEngine((k) => {
      if (k === 0 && client) scored = score(client);
    });
    client = clientWith(fake.engine);

    const answer = client.generateContent('Plant telemetry.');
    // The answer stops after the token in flight and waits for the scoring call.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fake.prompts).toHaveLength(1);
    expect(fake.log).toEqual(['segment from 0', 'token 0', 'score', 'token 1', 'interrupt']);

    fake.releaseScore();
    expect(await scored).toEqual([{ token: 'Equipment', probability: 1 }]);
    expect(await answer).toBe(ANSWER.join(''));
    expect(fake.log.slice(5)).toEqual(['score done', 'segment from 2', 'token 2', 'token 3']);
    // Same template, the text so far appended, and only the tokens left.
    expect(fake.prompts[0].prompt).toContain('<|im_start|>user\nPlant telemetry.<|im_end|>');
    expect(fake.prompts[0].prompt.endsWith('<think>\n\n</think>\n\n')).toBe(true);
    expect(fake.prompts[1]).toEqual({
      prompt: fake.prompts[0].prompt + ANSWER[0] + ANSWER[1],
      max_tokens: 2046,
    });
    // The strategic answer never went through the chat API.
    expect(fake.chats.map((chat) => chat.content)).toEqual(['Bearing hot.']);
  });

  it('does not count a pause against the answer deadline', async () => {
    vi.useFakeTimers();
    try {
      let client: WebGPUClient | null = null;
      let scored: ReturnType<typeof score> | null = null;
      const fake = fakeEngine((k) => {
        if (k === 0 && client) scored = score(client);
      });
      client = clientWith(fake.engine);
      const answer = client.generateContent('Plant telemetry.');
      // The scoring call never answers; its own 120 s deadline ends the pause.
      await vi.advanceTimersByTimeAsync(130_000);
      expect(await scored).toBeNull();
      expect(await answer).toBe(ANSWER.join(''));
      expect(fake.prompts).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('answers in one segment when nothing is waiting', async () => {
    const fake = fakeEngine();
    const client = clientWith(fake.engine);
    expect(await client.generateContent('Plant telemetry.')).toBe(ANSWER.join(''));
    expect(fake.prompts).toHaveLength(1);
    expect(fake.log).not.toContain('interrupt');
  });

  it('keeps a dollar pattern in the prompt literal', async () => {
    const fake = fakeEngine();
    const client = clientWith(fake.engine);
    await client.generateContent("Energy costs $& and $' today.");
    expect(fake.prompts[0].prompt).toContain("user\nEnergy costs $& and $' today.<|im_end|>");
  });

  it('uses the chat API for a build without a known template', async () => {
    const fake = fakeEngine();
    const client = clientWith(fake.engine, 'Other-Model-q4f16_1-MLC');
    expect(await client.generateContent('Plant telemetry.')).toBe(ANSWER.join(''));
    expect(fake.prompts).toHaveLength(0);
    expect(fake.chats).toEqual([{ model: undefined, content: 'Plant telemetry.' }]);
  });
});

describe('webgpuClient with the fast lane', () => {
  it('keeps the chat API and never pauses for scoring', async () => {
    const fake = fakeEngine();
    const client = clientWith(fake.engine, MODEL, `${MODEL}-fast-lane`);
    const scored = score(client);
    expect(await client.generateContent('Plant telemetry.')).toBe(ANSWER.join(''));
    fake.releaseScore();
    await scored;
    expect(fake.prompts).toHaveLength(0);
    expect(fake.log).not.toContain('interrupt');
    expect(fake.chats.map((chat) => chat.model)).toEqual([`${MODEL}-fast-lane`, MODEL]);
  });
});

describe('webgpuClient after a lost WebGPU device', () => {
  const NOT_LOADED =
    'Model not loaded before trying to complete ChatCompletionRequest. Please ensure you have called MLCEngine.reload(model).';
  const failing = (message: string) => ({
    interruptGenerate: () => undefined,
    unload: async () => undefined,
    chat: { completions: { create: () => Promise.reject(new Error(message)) } },
  });

  it.each([
    ['answer', (client: WebGPUClient) => client.generateContent('Plant telemetry.')],
    ['scoring call', (client: WebGPUClient) => score(client)],
  ])('drops an engine whose model is gone and says so once (%s)', async (_name, call) => {
    // The fast lane keeps both calls on the chat API, which is what fails here.
    const client = clientWith(failing(NOT_LOADED), MODEL, `${MODEL}-fast-lane`);
    const lost = vi.fn();
    client.onEngineLost(lost);
    expect(await call(client)).toBeNull();
    expect(client.isConnected()).toBe(false);
    expect(client.hasFastLane()).toBe(false);
    expect(lost).toHaveBeenCalledTimes(1);
  });

  it('keeps the engine for any other failure', async () => {
    const client = clientWith(failing('Network hiccup'), MODEL, `${MODEL}-fast-lane`);
    const lost = vi.fn();
    client.onEngineLost(lost);
    expect(await client.generateContent('Plant telemetry.')).toBeNull();
    expect(client.isConnected()).toBe(true);
    expect(lost).not.toHaveBeenCalled();
  });

  it('recognises the device-lost wording too', () => {
    expect(
      isEngineGoneError(new Error('Device was lost. This can happen due to insufficient memory'))
    ).toBe(true);
    expect(
      isEngineGoneError('WorkerEngineModelNotLoadedError: engine is not loaded with a model.')
    ).toBe(true);
    expect(isEngineGoneError(new Error('Request timed out'))).toBe(false);
  });
});
