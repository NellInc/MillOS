/** Read-only, explicitly requested incident classification. No stores or commands. */
import { formatFixed, translate } from '../i18n';
import { isLocalCompanionHost } from './cloudAIClient';
import { jevClientMessages as messages } from './jevClient.messages';

export const JEV_ENDPOINT = 'https://openrouter.ai/api/alpha/decisions';
export const JEV_MODEL = 'typesafe/jev-1.13';
/**
 * OpenAI's Decisions API answers the same frozen rubric with GPT-6 Luna. A
 * direct OpenAI key stays on the local companion host, as for the chat backends.
 */
export const OPENAI_DECISIONS_ENDPOINT = 'https://api.openai.com/v1/decisions';
export const OPENAI_DECISIONS_MODEL = 'gpt-6-luna';
export type AdvisoryProvider = 'jev' | 'openai';
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

/** An OpenRouter key is never sent to OpenAI, nor an OpenAI key to OpenRouter. */
export function isAdvisoryKeyValid(provider: AdvisoryProvider, key: string): boolean {
  const trimmed = key.trim();
  return provider === 'openai'
    ? /^sk-[A-Za-z0-9_-]{20,256}$/.test(trimmed) && !trimmed.startsWith('sk-or-')
    : isJevKeyValid(trimmed);
}

/** The OpenAI option exists only where a direct provider key may be used. */
export function advisoryProviders(): AdvisoryProvider[] {
  return isLocalCompanionHost() ? ['jev', 'openai'] : ['jev'];
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseAdvice(value: unknown): JevAdvice {
  const body = record(value);
  const answer = record(record(body.answers).decision);
  if (
    typeof body.model !== 'string' ||
    !/^typesafe\/jev-1\.13(?:-\d{8})?$/.test(body.model) ||
    answer.type !== 'choice'
  ) {
    throw new Error(translate(messages, 'invalidAdvisory'));
  }
  return adviceFrom(answer.choice, record(answer.probabilities), 'invalidAdvisory');
}

/** OpenAI lists choice probabilities as [{ value, probability }]; a refusal is not advice. */
function parseOpenAIAdvice(value: unknown): JevAdvice {
  const body = record(value);
  const answer = record(Array.isArray(body.answers) ? body.answers[0] : undefined);
  const listed = Array.isArray(answer.probabilities) ? answer.probabilities : [];
  if (
    typeof body.model !== 'string' ||
    !/^gpt-6-luna(?:-\d{4}-\d{2}-\d{2})?$/.test(body.model) ||
    answer.type !== 'choice' ||
    listed.length !== JEV_QUEUES.length
  ) {
    throw new Error(translate(messages, 'invalidAdvisoryOpenAI'));
  }
  const probabilities = Object.fromEntries(
    listed.map((entry) => [String(record(entry).value), record(entry).probability])
  );
  return adviceFrom(answer.choice, probabilities, 'invalidAdvisoryOpenAI');
}

function adviceFrom(
  choice: unknown,
  probabilities: Record<string, unknown>,
  invalid: 'invalidAdvisory' | 'invalidAdvisoryOpenAI'
): JevAdvice {
  const values = JEV_QUEUES.map((queue) => probabilities[queue]);
  if (
    !JEV_QUEUES.some((queue) => queue === choice) ||
    Object.keys(probabilities).length !== JEV_QUEUES.length ||
    !values.every((p) => typeof p === 'number' && Number.isFinite(p) && p >= 0 && p <= 1)
  ) {
    throw new Error(translate(messages, invalid));
  }
  const scores = values as number[];
  const queue = choice as JevAdvice['queue'];
  // The API rounds option probabilities. Scores are validated, never presented as safety confidence.
  if (
    Math.abs(scores.reduce((sum, p) => sum + p, 0) - 1) > 0.025000001 ||
    (probabilities[queue] as number) < Math.max(...scores)
  ) {
    throw new Error(translate(messages, invalid));
  }
  return { queue, receivedAt: Date.now() };
}

/** Credentials and notes are transient arguments, never persisted or logged. No retries/fallbacks. */
export async function requestJevAdvice({
  text,
  apiKey,
  consent,
  signal,
  provider = 'jev',
}: {
  text: string;
  apiKey: string;
  consent: boolean;
  signal: AbortSignal;
  provider?: AdvisoryProvider;
}): Promise<JevAdvice> {
  const openai = provider === 'openai';
  if (!consent) throw new Error(translate(messages, 'consentRequired'));
  if (openai && !isLocalCompanionHost()) throw new Error(translate(messages, 'openAILocalOnly'));
  if (!isAdvisoryKeyValid(provider, apiKey))
    throw new Error(translate(messages, openai ? 'invalidKeyOpenAI' : 'invalidKey'));
  if (!text.trim() || text.length > JEV_MAX_TEXT_LENGTH) {
    throw new Error(
      translate(messages, 'textLength', { max: formatFixed(JEV_MAX_TEXT_LENGTH, 0) })
    );
  }
  if (signal.aborted) throw new Error(translate(messages, 'cancelled'));
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(cancel, JEV_TIMEOUT_MS);
  try {
    let response: Response;
    try {
      response = await fetch(openai ? OPENAI_DECISIONS_ENDPOINT : JEV_ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey.trim()}`, 'Content-Type': 'application/json' },
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        redirect: 'error',
        cache: 'no-store',
        signal: controller.signal,
        body: JSON.stringify(
          openai
            ? {
                model: OPENAI_DECISIONS_MODEL,
                input: text.trim(),
                questions: [
                  {
                    type: 'choice',
                    name: 'decision',
                    instructions: QUESTION,
                    choices: JEV_QUEUES.map((queue) => ({ value: queue })),
                  },
                ],
              }
            : {
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
              }
        ),
      });
    } catch {
      throw new Error(translate(messages, openai ? 'unreachableOpenAI' : 'unreachable'));
    }
    if (!response.ok) {
      // Never display a provider error body: it may echo submitted text or credentials.
      const message =
        response.status === 401 || response.status === 403
          ? translate(messages, openai ? 'keyRejectedOpenAI' : 'keyRejected')
          : response.status === 402
            ? translate(messages, openai ? 'moreCreditOpenAI' : 'moreCredit')
            : response.status === 429
              ? translate(messages, openai ? 'rateLimitedOpenAI' : 'rateLimited')
              : translate(messages, openai ? 'unavailableOpenAI' : 'unavailable');
      throw new Error(message);
    }
    let body: unknown;
    try {
      const raw = await response.text();
      if (raw.length > 65_536) throw new Error();
      body = JSON.parse(raw);
    } catch {
      throw new Error(translate(messages, openai ? 'invalidAdvisoryOpenAI' : 'invalidAdvisory'));
    }
    if (controller.signal.aborted) throw new Error(translate(messages, 'cancelledOrTimedOut'));
    return openai ? parseOpenAIAdvice(body) : parseAdvice(body);
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', cancel);
  }
}
