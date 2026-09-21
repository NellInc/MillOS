/** Read-only, explicitly requested incident classification. No stores or commands. */
export const JEV_ENDPOINT = 'https://openrouter.ai/api/alpha/decisions';
export const JEV_MODEL = 'typesafe/jev-1.13';
export const JEV_MAX_TEXT_LENGTH = 4000;
export const JEV_TIMEOUT_MS = 30_000;
export const JEV_RESULT_TTL_MS = 60_000;
export const JEV_QUEUES = [
  'Equipment maintenance',
  'Product quality',
  'Logistics coordination',
  'No current incident',
  'Insufficient evidence',
] as const;
// Same rubric as the frozen evaluation; changing it requires a new evaluation.
const QUESTION =
  'Which advisory incident queue best matches the CURRENT unresolved issue? Past or explicitly resolved issues do not count. If there is no current incident choose No current incident; if evidence cannot identify it choose Insufficient evidence.';

export interface JevAdvice {
  queue: (typeof JEV_QUEUES)[number];
  receivedAt: number;
}

export function isJevKeyValid(key: string): boolean {
  return /^sk-or-v1-[A-Za-z0-9_-]{32,160}$/.test(key.trim());
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseAdvice(value: unknown): JevAdvice {
  const body = record(value);
  const answer = record(record(body.answers).decision);
  const probabilities = record(answer.probabilities);
  const values = JEV_QUEUES.map((queue) => probabilities[queue]);
  if (
    typeof body.model !== 'string' ||
    !/^typesafe\/jev-1\.13(?:-\d{8})?$/.test(body.model) ||
    answer.type !== 'choice' ||
    !JEV_QUEUES.some((queue) => queue === answer.choice) ||
    Object.keys(probabilities).length !== JEV_QUEUES.length ||
    !values.every((p) => typeof p === 'number' && Number.isFinite(p) && p >= 0 && p <= 1)
  ) {
    throw new Error('Jev returned an invalid advisory. No action was taken.');
  }
  const scores = values as number[];
  const queue = answer.choice as JevAdvice['queue'];
  // The API rounds option probabilities. Scores are validated, never presented as safety confidence.
  if (
    Math.abs(scores.reduce((sum, p) => sum + p, 0) - 1) > 0.025000001 ||
    (probabilities[queue] as number) < Math.max(...scores)
  ) {
    throw new Error('Jev returned an invalid advisory. No action was taken.');
  }
  return { queue, receivedAt: Date.now() };
}

/** Credentials and notes are transient arguments, never persisted or logged. No retries/fallbacks. */
export async function requestJevAdvice({
  text,
  apiKey,
  consent,
  signal,
}: {
  text: string;
  apiKey: string;
  consent: boolean;
  signal: AbortSignal;
}): Promise<JevAdvice> {
  if (!consent) throw new Error('Consent is required before sending incident text.');
  if (!isJevKeyValid(apiKey)) throw new Error('Enter a valid OpenRouter API key.');
  if (!text.trim() || text.length > JEV_MAX_TEXT_LENGTH) {
    throw new Error(`Enter 1 to ${JEV_MAX_TEXT_LENGTH} characters of incident text.`);
  }
  if (signal.aborted) throw new Error('Request cancelled.');
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(cancel, JEV_TIMEOUT_MS);
  try {
    let response: Response;
    try {
      response = await fetch(JEV_ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey.trim()}`, 'Content-Type': 'application/json' },
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        redirect: 'error',
        cache: 'no-store',
        signal: controller.signal,
        body: JSON.stringify({
          model: JEV_MODEL,
          state: text.trim(),
          questions: {
            decision: {
              type: 'choice',
              instructions: QUESTION,
              criteria: Object.fromEntries(JEV_QUEUES.map((queue) => [queue, null])),
            },
          },
          provider: { only: ['typesafe'], allow_fallbacks: false },
        }),
      });
    } catch {
      throw new Error('Jev could not be reached. Check your connection and try again manually.');
    }
    if (!response.ok) {
      // Never display a provider error body: it may echo submitted text or credentials.
      const message =
        response.status === 401 || response.status === 403
          ? 'OpenRouter rejected the key or its permissions.'
          : response.status === 402
            ? 'OpenRouter requires more credit for this request.'
            : response.status === 429
              ? 'OpenRouter is rate limiting requests. Try again later.'
              : 'Jev is unavailable. Try again later.';
      throw new Error(message);
    }
    let body: unknown;
    try {
      const raw = await response.text();
      if (raw.length > 65_536) throw new Error();
      body = JSON.parse(raw);
    } catch {
      throw new Error('Jev returned an invalid advisory. No action was taken.');
    }
    if (controller.signal.aborted) throw new Error('Request cancelled or timed out.');
    return parseAdvice(body);
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', cancel);
  }
}
