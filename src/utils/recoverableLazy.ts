import { beginStartupTask } from './startupReadiness';
import { formatFixed, translate } from '../i18n';
import { recoverableLazyMessages } from './recoverableLazy.messages';
import {
  createContext,
  createElement,
  lazy,
  useContext,
  type ComponentProps,
  type ComponentType,
  type LazyExoticComponent,
} from 'react';

interface RecoverableLazyOptions {
  attempts?: number;
  attemptTimeoutMs?: number;
  retryDelayMs?: number;
}

const DEFAULT_OPTIONS = {
  attempts: 2,
  attemptTimeoutMs: 15_000,
  retryDelayMs: 400,
} as const;

const DEFAULT_RECOVERY_GENERATION = {};

/**
 * Error boundaries provide a stable generation object while their children
 * render. A manual boundary reset replaces it, which is the explicit signal
 * that a rejected React.lazy payload may be recreated.
 */
export const LazyRecoveryContext = createContext<object>(DEFAULT_RECOVERY_GENERATION);

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, delayMs));
}

const timeoutError = (ms: number) =>
  new Error(translate(recoverableLazyMessages, 'loadTimeout', { ms: formatFixed(ms, 0) }));

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof globalThis.setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = globalThis.setTimeout(() => reject(timeoutError(timeoutMs)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) globalThis.clearTimeout(timeoutId);
  }
}

/** Settles with the first attempt to fulfil; rejects once every attempt has rejected. */
function firstFulfilled<T>(attempts: readonly Promise<T>[]): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let rejected = 0;
    for (const attempt of attempts) {
      attempt.then(resolve, (error: unknown) => {
        rejected += 1;
        if (rejected === attempts.length) reject(error);
      });
    }
  });
}

export async function importWithBoundedRetry<T>(
  importer: () => Promise<T>,
  options: RecoverableLazyOptions = {}
): Promise<T> {
  const attempts = Math.max(1, Math.floor(options.attempts ?? DEFAULT_OPTIONS.attempts));
  const attemptTimeoutMs = Math.max(
    1,
    Math.floor(options.attemptTimeoutMs ?? DEFAULT_OPTIONS.attemptTimeoutMs)
  );
  const retryDelayMs = Math.max(
    0,
    Math.floor(options.retryDelayMs ?? DEFAULT_OPTIONS.retryDelayMs)
  );

  // A timeout cannot cancel a module fetch, and a browser shares one request
  // per URL, so a retry after a stall usually waits on that same request.
  // Every attempt therefore stays eligible: whichever lands first wins.
  // Working if a first request that arrives during the retry still resolves.
  const inFlight: Promise<T>[] = [];
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let current: Promise<T>;
    try {
      current = importer();
    } catch (error) {
      current = Promise.reject(error);
    }
    inFlight.push(current);
    try {
      return await withTimeout(firstFulfilled([...inFlight]), attemptTimeoutMs);
    } catch (error) {
      lastError = error;
      if (attempt < attempts && retryDelayMs > 0) await wait(retryDelayMs);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(translate(recoverableLazyMessages, 'loadFailed'));
}

export type PreloadableComponent<P> = ComponentType<P> & {
  /**
   * Start the chunk's import now. Settles (never rejects) once it lands or
   * fails; a failure is left for the render's own import to retry and report.
   */
  preload: () => Promise<void>;
};

// Match React.lazy's public generic contract. Component props are intentionally
// heterogeneous across optional panels, and React itself uses `any` here.
export function recoverableLazy<T extends ComponentType<any>>(
  importer: () => Promise<{ default: T }>,
  options?: RecoverableLazyOptions
): PreloadableComponent<ComponentProps<T>> {
  const payloadsByGeneration = new WeakMap<object, LazyExoticComponent<T>>();
  // One import shared by preload() and every recovery generation. A rejection
  // clears it, so a boundary reset (a new generation) really imports again.
  let loaded: { default: T } | null = null;
  let inFlight: Promise<{ default: T }> | null = null;
  const load = (): Promise<{ default: T }> => {
    inFlight ??= importWithBoundedRetry(importer, options).then(
      (module) => {
        loaded = module;
        return module;
      },
      (error: unknown) => {
        inFlight = null;
        throw error;
      }
    );
    return inFlight;
  };

  const RecoverableLazyComponent = (props: ComponentProps<T>) => {
    const recoveryGeneration = useContext(LazyRecoveryContext);
    let LazyComponent = payloadsByGeneration.get(recoveryGeneration);
    if (!LazyComponent) {
      LazyComponent = lazy(() => {
        // React.lazy subscribes with then() and reads the result before it
        // suspends, so a thenable that resolves synchronously renders a
        // preloaded module in this pass. A native promise would always
        // suspend, and a render that pauses on each lazy child in turn
        // fetched the authored site's chunks one after another.
        const module = loaded;
        if (module) {
          return { then: (resolve: (value: { default: T }) => void) => resolve(module) } as never;
        }
        const finish = beginStartupTask();
        return load().then(
          (value) => {
            finish();
            return value;
          },
          (error: unknown) => {
            finish(true);
            throw error;
          }
        );
      });
      payloadsByGeneration.set(recoveryGeneration, LazyComponent);
    }
    return createElement(LazyComponent, props);
  };

  RecoverableLazyComponent.preload = (): Promise<void> =>
    load().then(
      () => undefined,
      () => undefined
    );

  return RecoverableLazyComponent;
}
