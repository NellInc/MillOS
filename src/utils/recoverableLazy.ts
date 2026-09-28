import { beginStartupTask } from './startupReadiness';
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

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof globalThis.setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = globalThis.setTimeout(
          () => reject(new Error(`Optional feature load exceeded ${timeoutMs}ms`)),
          timeoutMs
        );
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) globalThis.clearTimeout(timeoutId);
  }
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

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await withTimeout(importer(), attemptTimeoutMs);
    } catch (error) {
      lastError = error;
      if (attempt < attempts && retryDelayMs > 0) await wait(retryDelayMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Optional feature failed to load');
}

// Match React.lazy's public generic contract. Component props are intentionally
// heterogeneous across optional panels, and React itself uses `any` here.
export function recoverableLazy<T extends ComponentType<any>>(
  importer: () => Promise<{ default: T }>,
  options?: RecoverableLazyOptions
): ComponentType<ComponentProps<T>> {
  const payloadsByGeneration = new WeakMap<object, LazyExoticComponent<T>>();

  const RecoverableLazyComponent = (props: ComponentProps<T>) => {
    const recoveryGeneration = useContext(LazyRecoveryContext);
    let LazyComponent = payloadsByGeneration.get(recoveryGeneration);
    if (!LazyComponent) {
      LazyComponent = lazy(async () => {
        const finish = beginStartupTask();
        try {
          const module = await importWithBoundedRetry(importer, options);
          finish();
          return module;
        } catch (error) {
          finish(true);
          throw error;
        }
      });
      payloadsByGeneration.set(recoveryGeneration, LazyComponent);
    }
    return createElement(LazyComponent, props);
  };

  return RecoverableLazyComponent;
}
