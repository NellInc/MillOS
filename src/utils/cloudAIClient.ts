/** Browser BYOK transport. Keys remain in this module's memory, never in Zustand persistence. */
import { spendBudget, type SpendBudget, type TokenRates } from './spendBudget';
import { formatFixed, translate } from '../i18n';
import { cloudAIClientMessages as messages } from './cloudAIClient.messages';

export type CloudBackend =
  | 'haiku'
  | 'luna'
  | 'sol'
  | 'gemini'
  | 'openrouter-haiku'
  | 'openrouter-luna'
  | 'openrouter-sol'
  | 'openrouter-gemini';

/** Direct backends need the local companion host; each has an OpenRouter twin. */
export const DIRECT_BACKENDS = ['haiku', 'luna', 'sol', 'gemini'] as const;
export type DirectBackend = (typeof DIRECT_BACKENDS)[number];

/** The request and response shape a backend speaks. */
type Wire = 'anthropic' | 'openai' | 'google' | 'openrouter';

export interface CloudModel extends TokenRates {
  id: string;
  label: string;
  provider: string;
  wire: Wire;
  /** Haiku 5.5 and Luna 6 are the recommended models; Haiku is the default. */
  recommended: boolean;
}

// Prices are list prices per million tokens (OpenRouter's catalogue, which
// passes the provider's price through), checked 2026-10-24. They feed the
// spend cap and OpenRouter's max_price, so a dearer model cannot be admitted
// at a cheaper model's estimate.
const HAIKU = { label: 'Haiku 5.5 High', inputPer1M: 0.1, outputPer1M: 0.5, recommended: true };
const LUNA = { label: 'Luna 6 High', inputPer1M: 0.1, outputPer1M: 0.5, recommended: true };
const SOL = { label: 'Sol 6.1 High', inputPer1M: 2, outputPer1M: 10, recommended: false };
const GEMINI = {
  label: 'Gemini 3.8 Flash',
  inputPer1M: 0.825,
  outputPer1M: 4.125,
  recommended: false,
};

export const CLOUD_MODELS: Record<CloudBackend, CloudModel> = {
  haiku: { ...HAIKU, id: 'claude-haiku-5-5', provider: 'Anthropic', wire: 'anthropic' },
  luna: { ...LUNA, id: 'gpt-6-luna', provider: 'OpenAI', wire: 'openai' },
  sol: { ...SOL, id: 'gpt-6.1-sol', provider: 'OpenAI', wire: 'openai' },
  gemini: { ...GEMINI, id: 'gemini-3.8-flash', provider: 'Google', wire: 'google' },
  'openrouter-haiku': {
    ...HAIKU,
    id: 'anthropic/claude-haiku-5.5',
    provider: 'OpenRouter',
    wire: 'openrouter',
  },
  'openrouter-luna': {
    ...LUNA,
    id: 'openai/gpt-6-luna',
    provider: 'OpenRouter',
    wire: 'openrouter',
  },
  'openrouter-sol': {
    ...SOL,
    id: 'openai/gpt-6.1-sol',
    provider: 'OpenRouter',
    wire: 'openrouter',
  },
  'openrouter-gemini': {
    ...GEMINI,
    id: 'google/gemini-3.8-flash',
    provider: 'OpenRouter',
    wire: 'openrouter',
  },
};

/** The OpenRouter twin a direct backend falls back to off the local companion host. */
export function openRouterTwin(backend: DirectBackend): CloudBackend {
  return `openrouter-${backend}`;
}

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
  return CLOUD_MODELS[backend].wire === 'openrouter';
}

function assertPublicProviderBoundary(backend: CloudBackend): void {
  if (!isOpenRouterBackend(backend) && !isLocalCompanionHost()) {
    throw new Error(translate(messages, 'directKeysLocalOnly'));
  }
}

function tokenCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(translate(messages, 'usageMissing'));
  }
  return value;
}

function errorForStatus(status: number): Error {
  if (status === 401 || status === 403) return new Error(translate(messages, 'keyRejected'));
  if (status === 402) return new Error(translate(messages, 'creditLimit'));
  if (status === 429) return new Error(translate(messages, 'rateLimit'));
  return new Error(translate(messages, 'requestFailed', { status: formatFixed(status, 0) }));
}

function textFromResponse(backend: CloudBackend, record: Record<string, unknown>): string {
  const wire = CLOUD_MODELS[backend].wire;
  if (wire === 'anthropic') {
    if (record.stop_reason !== 'end_turn' || !Array.isArray(record.content))
      throw new Error(translate(messages, 'haikuIncomplete'));
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
  if (wire === 'openai') {
    if (record.status !== 'completed' || !Array.isArray(record.output))
      throw new Error(translate(messages, backend === 'sol' ? 'solIncomplete' : 'lunaIncomplete'));
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
  if (wire === 'google') {
    const candidates = Array.isArray(record.candidates) ? record.candidates : [];
    const first = candidates[0] as Record<string, unknown> | undefined;
    const content = first?.content as Record<string, unknown> | undefined;
    if (first?.finishReason !== 'STOP' || !Array.isArray(content?.parts))
      throw new Error(translate(messages, 'geminiIncomplete'));
    return content.parts
      .filter(
        (part): part is { text: string } =>
          !!part &&
          typeof part === 'object' &&
          typeof (part as Record<string, unknown>).text === 'string' &&
          (part as Record<string, unknown>).thought !== true
      )
      .map((part) => part.text)
      .join('');
  }
  const choices = Array.isArray(record.choices) ? record.choices : [];
  const first = choices[0] as Record<string, unknown> | undefined;
  if (first?.finish_reason !== 'stop') throw new Error(translate(messages, 'openRouterIncomplete'));
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
    if (!trimmed) throw new Error(translate(messages, 'enterKey'));
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
    if (!key) throw new Error(translate(messages, 'connectKey'));
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
        throw new Error(translate(messages, 'cancelledAfterChange'));
      if (this.openRouterBillingUnknown) throw new Error(translate(messages, 'billingUnverified'));
      await this.verifyOpenRouterKey(key);
      if (epoch !== this.epoch || this.keys[backend] !== key)
        throw new Error(translate(messages, 'cancelledAfterChange'));
      return await this.request(backend, key, prompt, 4096);
    } finally {
      release();
    }
  }

  private async verifyOpenRouterKey(key: string): Promise<void> {
    if (!key || key.length > 512 || /\s/.test(key))
      throw new Error(translate(messages, 'invalidOpenRouterKey'));
    if (this.budget.getSnapshot().capUsd === null)
      throw new Error(translate(messages, 'capRequired'));
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
      throw new Error(translate(messages, 'cannotVerifyLimit'));
    }
    if (!response.ok)
      throw new Error(
        translate(messages, 'limitHttpError', { status: formatFixed(response.status, 0) })
      );
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error(translate(messages, 'noVerifiableLimit'));
    }
    const data = payload && typeof payload === 'object' && 'data' in payload ? payload.data : null;
    if (!data || typeof data !== 'object')
      throw new Error(translate(messages, 'noVerifiableLimit'));
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
      throw new Error(translate(messages, 'limitedKeyRequired'));
  }

  private async request(
    backend: CloudBackend,
    key: string,
    prompt: string,
    maxTokens: number
  ): Promise<CloudResult> {
    if (!key) throw new Error(translate(messages, 'enterKey'));
    if (!prompt.trim()) throw new Error(translate(messages, 'emptyRequest'));
    if (prompt.length > MAX_PROMPT_CHARS) throw new Error(translate(messages, 'contextTooLarge'));

    const model = CLOUD_MODELS[backend];
    const reservation = this.budget.reserve(prompt, maxTokens, model);
    const epoch = this.epoch;
    const controller = new AbortController();
    this.controllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const isHaiku = model.wire === 'anthropic';
    const isGoogle = model.wire === 'google';
    const isOpenRouter = model.wire === 'openrouter';
    let billingUnverified = true;
    try {
      const response = await fetch(
        isHaiku
          ? 'https://api.anthropic.com/v1/messages'
          : isGoogle
            ? `https://generativelanguage.googleapis.com/v1beta/models/${model.id}:generateContent`
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
            : isGoogle
              ? // A header, never the ?key= query string, keeps the key out of URLs.
                { 'content-type': 'application/json', 'x-goog-api-key': key }
              : { 'content-type': 'application/json', Authorization: `Bearer ${key}` },
          body: JSON.stringify(
            isHaiku
              ? {
                  model: model.id,
                  max_tokens: maxTokens,
                  thinking: { type: 'adaptive' },
                  output_config: { effort: 'high' },
                  messages: [{ role: 'user', content: prompt }],
                }
              : isGoogle
                ? {
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    generationConfig: {
                      maxOutputTokens: maxTokens,
                      thinkingConfig: { thinkingLevel: 'high' },
                    },
                  }
                : isOpenRouter
                  ? {
                      model: model.id,
                      messages: [{ role: 'user', content: prompt }],
                      max_completion_tokens: maxTokens,
                      reasoning: { effort: 'high' },
                      ...(model.id.startsWith('openai/')
                        ? { prompt_cache_options: { mode: 'explicit' } }
                        : {}),
                      provider: {
                        require_parameters: true,
                        max_price: { prompt: model.inputPer1M, completion: model.outputPer1M },
                      },
                    }
                  : {
                      model: model.id,
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
        // Google reports a bad key as 400 API_KEY_INVALID, not 401.
        if (isGoogle && response.status === 400) {
          const detail = await response.text().catch(() => '');
          if (detail.includes('API_KEY_INVALID')) throw errorForStatus(401);
        }
        throw errorForStatus(response.status);
      }
      const data: unknown = await response.json();
      if (!data || typeof data !== 'object')
        throw new Error(translate(messages, 'invalidResponse'));
      const record = data as Record<string, unknown>;
      const usage =
        record.usage && typeof record.usage === 'object'
          ? (record.usage as Record<string, unknown>)
          : {};
      // Gemini bills its thinking tokens as output, reported separately.
      const googleUsage =
        isGoogle && record.usageMetadata && typeof record.usageMetadata === 'object'
          ? (record.usageMetadata as Record<string, unknown>)
          : {};
      const inputTokens = tokenCount(
        isGoogle
          ? googleUsage.promptTokenCount
          : isOpenRouter
            ? usage.prompt_tokens
            : usage.input_tokens
      );
      const outputTokens = isGoogle
        ? tokenCount(googleUsage.candidatesTokenCount ?? 0) +
          tokenCount(googleUsage.thoughtsTokenCount ?? 0)
        : tokenCount(isOpenRouter ? usage.completion_tokens : usage.output_tokens);
      // OpenRouter's account charge and upstream BYOK inference charge are
      // separate fields. Count both when the provider reports both.
      const costDetails =
        usage.cost_details && typeof usage.cost_details === 'object'
          ? (usage.cost_details as Record<string, unknown>)
          : {};
      const upstreamCost = costDetails.upstream_inference_cost;
      const upstreamValid =
        (typeof upstreamCost === 'number' && Number.isFinite(upstreamCost) && upstreamCost >= 0) ||
        ((upstreamCost === undefined || upstreamCost === null) && usage.is_byok === false);
      if (
        isOpenRouter &&
        (!Number.isFinite(usage.cost) ||
          typeof usage.cost !== 'number' ||
          usage.cost < 0 ||
          !upstreamValid)
      )
        throw new Error(translate(messages, 'unverifiableCharge'));
      const openRouterCost = isOpenRouter
        ? (usage.cost as number) + (typeof upstreamCost === 'number' ? upstreamCost : 0)
        : undefined;
      this.budget.settle(reservation, {
        inputTokens,
        outputTokens,
        costUsd: openRouterCost,
      });
      billingUnverified = false;
      if (epoch !== this.epoch || controller.signal.aborted)
        throw new Error(translate(messages, 'cancelledAfterChange'));
      const text = textFromResponse(backend, record);
      if (!text.trim()) throw new Error(translate(messages, 'noText'));
      return { text, inputTokens, outputTokens };
    } catch (error) {
      if (billingUnverified) {
        this.budget.uncertain(reservation);
        if (isOpenRouter) this.openRouterBillingUnknown = true;
      }
      if (controller.signal.aborted && epoch === this.epoch)
        throw new Error(translate(messages, 'timedOut'));
      if (error instanceof TypeError) throw new Error(translate(messages, 'unreachable'));
      throw error;
    } finally {
      clearTimeout(timeout);
      this.controllers.delete(controller);
    }
  }
}

export const cloudAIClient = new CloudAIClient();
