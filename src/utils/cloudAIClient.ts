/** Browser BYOK transport. Keys remain in this module's memory, never in Zustand persistence. */
export type CloudBackend = 'haiku' | 'luna';

export const CLOUD_MODELS: Record<CloudBackend, { id: string; label: string; provider: string }> = {
  haiku: { id: 'claude-haiku-5-5', label: 'Haiku 5.5 High', provider: 'Anthropic' },
  luna: { id: 'gpt-6-luna', label: 'Luna 6 High', provider: 'OpenAI' },
};

export interface CloudResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

const REQUEST_TIMEOUT_MS = 60000;
const MAX_PROMPT_CHARS = 24000;

function tokenCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error('Provider omitted usage data; check charges in your provider account.');
  }
  return value;
}

function errorForStatus(status: number): Error {
  if (status === 401 || status === 403)
    return new Error('API key or model access was rejected. Check your provider account.');
  if (status === 429) return new Error('Provider rate limit reached. Try again later.');
  return new Error(`Provider request failed (HTTP ${status}).`);
}

export class CloudAIClient {
  private keys: Partial<Record<CloudBackend, string>> = {};
  private epoch = 0;
  private controllers = new Set<AbortController>();

  hasKey(backend: CloudBackend): boolean {
    return Boolean(this.keys[backend]);
  }

  setKey(backend: CloudBackend, key: string): void {
    const trimmed = key.trim();
    if (!trimmed) throw new Error('Enter an API key.');
    this.invalidate();
    this.keys[backend] = trimmed;
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
    await this.request(backend, key.trim(), 'Reply with OK only.', 4096);
  }

  async generateContent(backend: CloudBackend, prompt: string): Promise<CloudResult> {
    const key = this.keys[backend];
    if (!key) throw new Error('Connect an API key for the selected model.');
    return this.request(backend, key, prompt, 4096);
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

    const epoch = this.epoch;
    const controller = new AbortController();
    this.controllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const isHaiku = backend === 'haiku';
    try {
      const response = await fetch(
        isHaiku ? 'https://api.anthropic.com/v1/messages' : 'https://api.openai.com/v1/responses',
        {
          method: 'POST',
          credentials: 'omit',
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
              : {
                  model: CLOUD_MODELS.luna.id,
                  reasoning: { effort: 'high' },
                  store: false,
                  max_output_tokens: maxTokens,
                  input: prompt,
                }
          ),
        }
      );
      if (epoch !== this.epoch || controller.signal.aborted)
        throw new Error('Request cancelled after configuration changed.');
      if (!response.ok) throw errorForStatus(response.status);
      const data: unknown = await response.json();
      if (epoch !== this.epoch || controller.signal.aborted)
        throw new Error('Request cancelled after configuration changed.');
      if (!data || typeof data !== 'object')
        throw new Error('Provider returned an invalid response.');
      const record = data as Record<string, unknown>;
      let text = '';
      if (isHaiku) {
        if (record.stop_reason !== 'end_turn' || !Array.isArray(record.content)) {
          throw new Error('Haiku did not complete a text response. Try again.');
        }
        text = record.content
          .filter(
            (block): block is { type: string; text: string } =>
              !!block &&
              typeof block === 'object' &&
              (block as Record<string, unknown>).type === 'text' &&
              typeof (block as Record<string, unknown>).text === 'string'
          )
          .map((block) => block.text)
          .join('');
      } else {
        if (record.status !== 'completed' || !Array.isArray(record.output)) {
          throw new Error('Luna did not complete a text response. Try again.');
        }
        text = record.output
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
      if (!text.trim()) throw new Error('Provider returned no text. Try again.');
      const usage =
        record.usage && typeof record.usage === 'object'
          ? (record.usage as Record<string, unknown>)
          : {};
      return {
        text,
        inputTokens: tokenCount(usage.input_tokens),
        outputTokens: tokenCount(usage.output_tokens),
      };
    } catch (error) {
      if (controller.signal.aborted && epoch === this.epoch)
        throw new Error('Provider request timed out. Try again.');
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
