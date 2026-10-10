/** Browser BYOK transport. Keys remain in this module's memory, never in Zustand persistence. */
import { spendBudget, type SpendBudget } from './spendBudget';

export type CloudBackend = 'haiku' | 'luna' | 'openrouter-haiku' | 'openrouter-luna';

export const CLOUD_MODELS: Record<CloudBackend, { id: string; label: string; provider: string }> = {
  haiku: { id: 'claude-haiku-5-5', label: 'Haiku 5.5 High', provider: 'Anthropic' },
  luna: { id: 'gpt-6-luna', label: 'Luna 6 High', provider: 'OpenAI' },
  'openrouter-haiku': {
    id: 'anthropic/claude-haiku-5.5',
    label: 'Haiku 5.5 High',
    provider: 'OpenRouter',
  },
  'openrouter-luna': {
    id: 'openai/gpt-6-luna',
    label: 'Luna 6 High',
    provider: 'OpenRouter',
  },
};

export interface CloudResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

const REQUEST_TIMEOUT_MS = 60000;
const MAX_PROMPT_CHARS = 24000;
const OPENROUTER_KEY_URL = 'https://openrouter.ai/api/v1/key';

export function isLocalCompanionHost(): boolean {
  return (
    typeof window !== 'undefined' &&
    (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost')
  );
}

function isOpenRouterBackend(backend: CloudBackend): boolean {
  return backend === 'openrouter-haiku' || backend === 'openrouter-luna';
}

function assertPublicProviderBoundary(backend: CloudBackend): void {
  if (!isOpenRouterBackend(backend) && !isLocalCompanionHost()) {
    throw new Error(
      'Direct provider keys are available only on localhost. Use OpenRouter on the public site.'
    );
  }
}

function tokenCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error('Provider omitted usage data; check charges in your provider account.');
  }
  return value;
}

function errorForStatus(status: number): Error {
  if (status === 401 || status === 403)
    return new Error('API key or model access was rejected. Check your provider account.');
  if (status === 402) return new Error('Provider credit or spending limit reached.');
  if (status === 429) return new Error('Provider rate limit reached. Try again later.');
  return new Error(`Provider request failed (HTTP ${status}).`);
}

function textFromResponse(backend: CloudBackend, record: Record<string, unknown>): string {
  if (backend === 'haiku') {
    if (record.stop_reason !== 'end_turn' || !Array.isArray(record.content))
      throw new Error('Haiku did not complete a text response. Try again.');
    return record.content
      .filter(
        (block): block is { type: string; text: string } =>
          !!block &&
          typeof block === 'object' &&
          (block as Record<string, unknown>).type === 'text' &&
          typeof (block as Record<string, unknown>).text === 'string'
      )
      .map((block) => block.text)
      .join('');
  }
  if (backend === 'luna') {
    if (record.status !== 'completed' || !Array.isArray(record.output))
      throw new Error('Luna did not complete a text response. Try again.');
    return record.output
      .filter(
        (item): item is { type: string; content: unknown[] } =>
          !!item &&
          typeof item === 'object' &&
          (item as Record<string, unknown>).type === 'message' &&
          Array.isArray((item as Record<string, unknown>).content)
      )
      .flatMap((item) => item.content)
      .filter(
        (block): block is { type: string; text: string } =>
          !!block &&
          typeof block === 'object' &&
          (block as Record<string, unknown>).type === 'output_text' &&
          typeof (block as Record<string, unknown>).text === 'string'
      )
      .map((block) => block.text)
      .join('');
  }
  const choices = Array.isArray(record.choices) ? record.choices : [];
  const first = choices[0] as Record<string, unknown> | undefined;
  if (first?.finish_reason !== 'stop')
    throw new Error('OpenRouter did not complete a text response. Try again.');
  const message = first.message as Record<string, unknown> | undefined;
  return typeof message?.content === 'string' ? message.content : '';
}

export class CloudAIClient {
  constructor(private readonly budget: SpendBudget = spendBudget) {}
  private keys: Partial<Record<CloudBackend, string>> = {};
  private epoch = 0;
  private controllers = new Set<AbortController>();
  private openRouterQueue: Promise<void> = Promise.resolve();
  private openRouterBillingUnknown = false;

  hasKey(backend: CloudBackend): boolean {
    return Boolean(this.keys[backend]);
  }

  setKey(backend: CloudBackend, key: string): void {
    assertPublicProviderBoundary(backend);
    const trimmed = key.trim();
    if (!trimmed) throw new Error('Enter an API key.');
    this.invalidate();
    this.keys[backend] = trimmed;
    if (isOpenRouterBackend(backend)) this.openRouterBillingUnknown = false;
  }

  clearKey(backend: CloudBackend): void {
    this.invalidate();
    delete this.keys[backend];
  }

  cancelRequests(): void {
    this.invalidate();
  }

  private invalidate(): void {
    this.epoch += 1;
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();
  }

  async testKey(backend: CloudBackend, key: string): Promise<void> {
    assertPublicProviderBoundary(backend);
    if (isOpenRouterBackend(backend)) {
      await this.verifyOpenRouterKey(key.trim());
      return;
    }
    await this.request(backend, key.trim(), 'Reply with OK only.', 4096);
  }

  async generateContent(backend: CloudBackend, prompt: string): Promise<CloudResult> {
    assertPublicProviderBoundary(backend);
    const key = this.keys[backend];
    if (!key) throw new Error('Connect an API key for the selected model.');
    if (!isOpenRouterBackend(backend)) return this.request(backend, key, prompt, 4096);

    // Match CABAL's one-paid-call-at-a-time browser session. The key limit can
    // change outside this tab, so recheck it inside the slot before each call.
    const epoch = this.epoch;
    const prior = this.openRouterQueue;
    let release: () => void = () => undefined;
    this.openRouterQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await prior;
    try {
      if (epoch !== this.epoch || this.keys[backend] !== key)
        throw new Error('Request cancelled after configuration changed.');
      if (this.openRouterBillingUnknown)
        throw new Error(
          'OpenRouter billing is unverified. Check charges and reconnect a limited key.'
        );
      await this.verifyOpenRouterKey(key);
      if (epoch !== this.epoch || this.keys[backend] !== key)
        throw new Error('Request cancelled after configuration changed.');
      return await this.request(backend, key, prompt, 4096);
    } finally {
      release();
    }
  }

  private async verifyOpenRouterKey(key: string): Promise<void> {
    if (!key || key.length > 512 || /\s/.test(key))
      throw new Error('Enter a valid OpenRouter API key.');
    if (this.budget.getSnapshot().capUsd === null)
      throw new Error('Set a session cost cap before connecting OpenRouter.');
    let response: Response;
    try {
      response = await fetch(OPENROUTER_KEY_URL, {
        method: 'GET',
        headers: { Authorization: `Bearer ${key}` },
        credentials: 'omit',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        redirect: 'error',
      });
    } catch {
      throw new Error(
        'Cannot verify the OpenRouter key limit. Check your network or browser privacy settings.'
      );
    }
    if (!response.ok)
      throw new Error(`OpenRouter could not verify the key limit (HTTP ${response.status}).`);
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error('OpenRouter returned no verifiable key limit.');
    }
    const data = payload && typeof payload === 'object' && 'data' in payload ? payload.data : null;
    if (!data || typeof data !== 'object')
      throw new Error('OpenRouter returned no verifiable key limit.');
    const details = data as Record<string, unknown>;
    if (
      typeof details.limit !== 'number' ||
      !Number.isFinite(details.limit) ||
      details.limit <= 0 ||
      typeof details.limit_remaining !== 'number' ||
      !Number.isFinite(details.limit_remaining) ||
      details.limit_remaining <= 0 ||
      details.limit_reset !== null ||
      details.include_byok_in_limit !== true ||
      details.is_management_key === true
    )
      throw new Error(
        'Use a lifetime spend-limited OpenRouter inference key with BYOK usage included in its limit.'
      );
  }

  private async request(
    backend: CloudBackend,
    key: string,
    prompt: string,
    maxTokens: number
  ): Promise<CloudResult> {
    if (!key) throw new Error('Enter an API key.');
    if (!prompt.trim()) throw new Error('The request is empty.');
    if (prompt.length > MAX_PROMPT_CHARS) throw new Error('The plant context is too large.');

    const reservation = this.budget.reserve(prompt, maxTokens);
    const epoch = this.epoch;
    const controller = new AbortController();
    this.controllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const isHaiku = backend === 'haiku';
    const isOpenRouter = isOpenRouterBackend(backend);
    let billingUnverified = true;
    try {
      const response = await fetch(
        isHaiku
          ? 'https://api.anthropic.com/v1/messages'
          : isOpenRouter
            ? 'https://openrouter.ai/api/v1/chat/completions'
            : 'https://api.openai.com/v1/responses',
        {
          method: 'POST',
          credentials: 'omit',
          cache: 'no-store',
          referrerPolicy: 'no-referrer',
          redirect: 'error',
          signal: controller.signal,
          headers: isHaiku
            ? {
                'content-type': 'application/json',
                'x-api-key': key,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true',
              }
            : { 'content-type': 'application/json', Authorization: `Bearer ${key}` },
          body: JSON.stringify(
            isHaiku
              ? {
                  model: CLOUD_MODELS.haiku.id,
                  max_tokens: maxTokens,
                  thinking: { type: 'adaptive' },
                  output_config: { effort: 'high' },
                  messages: [{ role: 'user', content: prompt }],
                }
              : isOpenRouter
                ? {
                    model: CLOUD_MODELS[backend].id,
                    messages: [{ role: 'user', content: prompt }],
                    max_completion_tokens: maxTokens,
                    reasoning: { effort: 'high' },
                    ...(backend === 'openrouter-luna'
                      ? { prompt_cache_options: { mode: 'explicit' } }
                      : {}),
                    provider: {
                      require_parameters: true,
                      max_price: { prompt: 0.1, completion: 0.5 },
                    },
                  }
                : {
                    model: CLOUD_MODELS.luna.id,
                    reasoning: { effort: 'high' },
                    store: false,
                    max_output_tokens: maxTokens,
                    prompt_cache_options: { mode: 'explicit' },
                    input: prompt,
                  }
          ),
        }
      );
      if (!response.ok) {
        // Provider validation, auth and rate-limit rejections are not generated
        // completions. Server errors and transport failures may have billed.
        if ([400, 401, 402, 403, 404, 422, 429].includes(response.status)) {
          this.budget.reject(reservation);
          billingUnverified = false;
        }
        throw errorForStatus(response.status);
      }
      const data: unknown = await response.json();
      if (!data || typeof data !== 'object')
        throw new Error('Provider returned an invalid response.');
      const record = data as Record<string, unknown>;
      const usage =
        record.usage && typeof record.usage === 'object'
          ? (record.usage as Record<string, unknown>)
          : {};
      const inputTokens = tokenCount(isOpenRouter ? usage.prompt_tokens : usage.input_tokens);
      const outputTokens = tokenCount(isOpenRouter ? usage.completion_tokens : usage.output_tokens);
      // OpenRouter's account charge and upstream BYOK inference charge are
      // separate fields. Count both when the provider reports both.
      const costDetails =
        usage.cost_details && typeof usage.cost_details === 'object'
          ? (usage.cost_details as Record<string, unknown>)
          : {};
      if (
        isOpenRouter &&
        (!Number.isFinite(usage.cost) ||
          typeof usage.cost !== 'number' ||
          usage.cost < 0 ||
          !Object.hasOwn(costDetails, 'upstream_inference_cost') ||
          (costDetails.upstream_inference_cost !== null &&
            (typeof costDetails.upstream_inference_cost !== 'number' ||
              !Number.isFinite(costDetails.upstream_inference_cost) ||
              costDetails.upstream_inference_cost < 0)))
      )
        throw new Error(
          'OpenRouter did not report a verifiable USD charge. Paid inference stopped.'
        );
      const openRouterCost = isOpenRouter
        ? (usage.cost as number) +
          (typeof costDetails.upstream_inference_cost === 'number'
            ? costDetails.upstream_inference_cost
            : 0)
        : undefined;
      this.budget.settle(reservation, {
        inputTokens,
        outputTokens,
        costUsd: openRouterCost,
      });
      billingUnverified = false;
      if (epoch !== this.epoch || controller.signal.aborted)
        throw new Error('Request cancelled after configuration changed.');
      const text = textFromResponse(backend, record);
      if (!text.trim()) throw new Error('Provider returned no text. Try again.');
      return { text, inputTokens, outputTokens };
    } catch (error) {
      if (billingUnverified) {
        this.budget.uncertain(reservation);
        if (isOpenRouter) this.openRouterBillingUnknown = true;
      }
      if (controller.signal.aborted && epoch === this.epoch)
        throw new Error('Provider request timed out. Check charges before retrying.');
      if (error instanceof TypeError)
        throw new Error(
          'Cannot reach the provider. Check your network or browser privacy settings.'
        );
      throw error;
    } finally {
      clearTimeout(timeout);
      this.controllers.delete(controller);
    }
  }
}

export const cloudAIClient = new CloudAIClient();
