import type { ModelId, Phonon } from 'phonon-webgpu';
import type { Locale } from '../i18n';
import { audioManager } from '../utils/audioManager';
import { logger } from '../utils/logger';
import { speakableText } from './paSpeechText';
import { DEFAULT_PA_VOICE } from './paVoiceCatalog';

/**
 * The PA's voice: Gradium's Phonon 40M models, run on the device by
 * blixt/phonon (WebGPU, else WebAssembly in a worker). The weights are CC BY-NC
 * 4.0, so MillOS may use them only while it is non-commercial
 * (docs/DECISIONS.md D-025); the credit is in the About dialog.
 *
 * One model per language, as Gradium's listeners preferred each one-language
 * model to the multilingual one. The first load downloads about 54 MB from
 * Hugging Face into the browser's Cache Storage ("phonon-webgpu"); MillOS's
 * service worker deletes only its own caches, so it survives deploys.
 * A line that arrives while its model is still loading is shown, not spoken.
 */
export const PA_VOICE_MODELS: Record<Locale, ModelId> = {
  en: 'phonon-40m-en',
  'pt-BR': 'phonon-40m-pt',
};

const RETRY_AFTER_FAILURE_MS = 60_000;

interface LoadedVoice {
  locale: Locale;
  tts: Phonon;
  /** The model's catalogue voices, by name. */
  voices: ReadonlySet<string>;
  /** The language's default, or the model's own when the catalogue lacks it. */
  fallback: string;
}

interface Loading {
  locale: Locale;
  promise: Promise<LoadedVoice | null>;
}

interface Speaking {
  controller: AbortController;
  stop?: () => void;
}

let loaded: LoadedVoice | null = null;
let loading: Loading | null = null;
let failedAt = Number.NEGATIVE_INFINITY;
let speaking: Speaking | null = null;

async function loadVoice(locale: Locale): Promise<LoadedVoice> {
  const { Phonon } = await import('phonon-webgpu');
  const tts = await Phonon.load({ model: PA_VOICE_MODELS[locale] });
  const voices = new Set(tts.voices.map((v) => v.name));
  const fallback = voices.has(DEFAULT_PA_VOICE[locale])
    ? DEFAULT_PA_VOICE[locale]
    : tts.defaultVoice;
  logger.info(`[PA voice] ${PA_VOICE_MODELS[locale]} ready on ${tts.backend.name}`);
  return { locale, tts, voices, fallback };
}

function release(entry: LoadedVoice): void {
  void entry.tts.close().catch(() => undefined);
}

/**
 * Loads the model for a language, closing another language's. Resolves true
 * once it can speak. A failed load waits a minute before it is tried again.
 */
export function preparePAVoice(locale: Locale): Promise<boolean> {
  if (loaded?.locale === locale) return Promise.resolve(true);
  if (loading?.locale === locale) return loading.promise.then(Boolean);
  if (performance.now() - failedAt < RETRY_AFTER_FAILURE_MS) return Promise.resolve(false);

  if (loaded) {
    stopPAVoice();
    release(loaded);
    loaded = null;
  }

  const attempt: Loading = {
    locale,
    promise: Promise.resolve().then(async () => {
      try {
        const entry = await loadVoice(locale);
        if (loading !== attempt) {
          // Superseded by another language or released while it loaded.
          release(entry);
          return null;
        }
        loading = null;
        loaded = entry;
        void entry.tts.lost.then(() => {
          if (loaded !== entry) return;
          loaded = null;
          logger.warn(
            '[PA voice] engine lost (GPU reset or worker stopped); reloading on next line'
          );
        });
        return entry;
      } catch (error) {
        if (loading === attempt) loading = null;
        failedAt = performance.now();
        logger.warn('[PA voice] model load failed; lines stay caption-only', error);
        return null;
      }
    }),
  };
  loading = attempt;
  return attempt.promise.then(Boolean);
}

/** Stops speech and frees the model (its GPU device or worker). */
export function releasePAVoice(): void {
  stopPAVoice();
  loading = null;
  if (loaded) release(loaded);
  loaded = null;
}

export function stopPAVoice(): void {
  const current = speaking;
  speaking = null;
  if (!current) return;
  current.controller.abort();
  current.stop?.();
}

/**
 * Speaks one PA line, stopping any line before it. Resolves with the audio's
 * length once it has started, or null when it will not sound: no model ready
 * for this language yet (one is then loaded for the next line), muted, or
 * stopped first. `voice` is a catalogue name (src/audio/paVoiceCatalog.ts);
 * one the model does not have reads in the language's default.
 */
/**
 * How fast a line is delivered: an alarm a touch quicker, a warning slightly,
 * everything else at the voice's own pace (D-061). Phonon's speed runs about
 * 0.77-1.3; past ~1.12 the 40M model starts to clip words.
 */
export function paDeliverySpeed(priority: number, type?: string): number {
  if (type === 'emergency' || priority >= 4) return 1.1;
  if (priority >= 3) return 1.05;
  return 1;
}

export async function speakPAVoice(
  text: string,
  locale: Locale,
  voice: string = DEFAULT_PA_VOICE[locale],
  speed = 1
): Promise<{ seconds: number; ended: Promise<void> } | null> {
  stopPAVoice();
  const entry = loaded;
  if (!entry || entry.locale !== locale) {
    void preparePAVoice(locale);
    return null;
  }

  const current: Speaking = { controller: new AbortController() };
  speaking = current;
  try {
    // The whole line, then one playback: at many times real time a sentence
    // is ready in tens of milliseconds, and one buffer cannot click between chunks.
    const speech = await entry.tts.speak(speakableText(text, locale), {
      voice: entry.voices.has(voice) ? voice : entry.fallback,
      speed,
      signal: current.controller.signal,
    });
    if (speaking !== current) return null;
    const playing = audioManager.playPAVoice?.(speech.audio, speech.sampleRate) ?? null;
    if (!playing) {
      speaking = null;
      return null;
    }
    current.stop = playing.stop;
    void playing.ended.then(() => {
      if (speaking === current) speaking = null;
    });
    return { seconds: playing.seconds, ended: playing.ended };
  } catch (error) {
    if (!current.controller.signal.aborted) logger.warn('[PA voice] speech failed', error);
    if (speaking === current) speaking = null;
    return null;
  }
}

/**
 * Speaks a sample in a voice the player is choosing. Unlike a PA line it waits
 * for the model, since the player asked to hear it.
 */
export async function previewPAVoice(
  text: string,
  locale: Locale,
  voice: string
): Promise<{ seconds: number; ended: Promise<void> } | null> {
  if (!(await preparePAVoice(locale))) return null;
  return speakPAVoice(text, locale, voice);
}
