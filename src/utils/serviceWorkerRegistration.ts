type ServiceWorkerCallback = (registration: ServiceWorkerRegistration) => void;

export interface ServiceWorkerConfig {
  onSuccess?: ServiceWorkerCallback;
  onUpdate?: ServiceWorkerCallback;
  onError?: (error: Error) => void;
}

export interface ServiceWorkerCacheEntry {
  entries: number;
  urls: string[];
  truncated?: boolean;
}

export type ServiceWorkerCacheStats = Record<string, ServiceWorkerCacheEntry>;

export interface ServiceWorkerBuildInfo {
  buildId: string;
  cacheVersion: string;
  scope: string;
  scopeKey: string;
  caches: ServiceWorkerCacheStats;
}

export interface BuildCacheDiagnostics {
  appBuildId: string;
  appCacheVersion: string;
  online: boolean;
  supported: boolean;
  controlled: boolean;
  controllerScriptUrl: string | null;
  registrationScope: string | null;
  updateWaiting: boolean;
  installing: boolean;
  worker: ServiceWorkerBuildInfo | null;
  cacheEntries: number;
}

export const APP_BUILD_ID =
  typeof __MILLOS_BUILD_ID__ === 'string' ? __MILLOS_BUILD_ID__ : 'development';
export const APP_CACHE_VERSION =
  typeof __MILLOS_CACHE_VERSION__ === 'string' ? __MILLOS_CACHE_VERSION__ : 'development';

function basePath(): string {
  const configured = import.meta.env?.BASE_URL || '/';
  return configured.endsWith('/') ? configured : `${configured}/`;
}

export function serviceWorkerScopeKey(scopePath = basePath()): string {
  const normalized = scopePath.startsWith('/') ? scopePath : `/${scopePath}`;
  const withTrailingSlash = normalized.endsWith('/') ? normalized : `${normalized}/`;
  if (withTrailingSlash === '/') return 'root';
  return withTrailingSlash.replace(/^\/|\/$/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
}

export function serviceWorkerCachePrefix(scopePath = basePath()): string {
  return `millos-${serviceWorkerScopeKey(scopePath)}-`;
}

export function isServiceWorkerSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
}

function emitStatusChange(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('millos:service-worker-status'));
  }
}

let registrationAttempt = 0;
let activeRegistrationAttempt = 0;
let invalidatedRegistrationAttempt = 0;
let releaseRegistrationListeners: (() => void) | null = null;

function replaceRegistrationListeners(
  registration: ServiceWorkerRegistration,
  container: ServiceWorkerContainer,
  config?: ServiceWorkerConfig
): void {
  releaseRegistrationListeners?.();

  const workerListeners = new Map<ServiceWorker, EventListener>();
  const stopTrackingWorker = (worker: ServiceWorker): void => {
    const listener = workerListeners.get(worker);
    if (!listener) return;
    worker.removeEventListener('statechange', listener);
    workerListeners.delete(worker);
  };

  const onUpdateFound = (): void => {
    const installingWorker = registration.installing;
    if (!installingWorker || workerListeners.has(installingWorker)) return;

    emitStatusChange();
    const onStateChange = (): void => {
      emitStatusChange();
      if (installingWorker.state === 'redundant') {
        stopTrackingWorker(installingWorker);
        return;
      }
      if (installingWorker.state !== 'installed') return;

      stopTrackingWorker(installingWorker);
      if (container.controller) {
        config?.onUpdate?.(registration);
      } else {
        config?.onSuccess?.(registration);
      }
    };
    workerListeners.set(installingWorker, onStateChange);
    installingWorker.addEventListener('statechange', onStateChange);
  };

  registration.addEventListener('updatefound', onUpdateFound);
  container.addEventListener('controllerchange', emitStatusChange);

  let released = false;
  const release = (): void => {
    if (released) return;
    released = true;
    registration.removeEventListener('updatefound', onUpdateFound);
    container.removeEventListener('controllerchange', emitStatusChange);
    for (const worker of workerListeners.keys()) {
      stopTrackingWorker(worker);
    }
    if (releaseRegistrationListeners === release) {
      releaseRegistrationListeners = null;
    }
  };
  releaseRegistrationListeners = release;
}

export async function registerServiceWorker(
  config?: ServiceWorkerConfig
): Promise<ServiceWorkerRegistration | null> {
  if (!isServiceWorkerSupported()) return null;

  const isDev = import.meta.env?.DEV;
  const forceEnable = import.meta.env?.VITE_ENABLE_SW === 'true';
  if (isDev && !forceEnable) return null;

  const attempt = ++registrationAttempt;
  try {
    const scope = basePath();
    const container = navigator.serviceWorker;
    const registration = await container.register(`${scope}sw.js`, {
      scope,
      updateViaCache: 'none',
    });

    // Promote the newest successful attempt, rather than only the newest
    // started attempt. A later concurrent failure must not permanently suppress
    // an earlier success, while a later success still replaces older callbacks.
    if (attempt > invalidatedRegistrationAttempt && attempt > activeRegistrationAttempt) {
      activeRegistrationAttempt = attempt;
      replaceRegistrationListeners(registration, container, config);
      emitStatusChange();
    }
    return registration;
  } catch (error) {
    config?.onError?.(error as Error);
    emitStatusChange();
    return null;
  }
}

export async function unregisterServiceWorker(): Promise<boolean> {
  const releaseListeners = releaseRegistrationListeners;
  // Claim the attempt number now, but only invalidate in-flight registrations
  // once the unregister has actually succeeded; a failed unregister must not
  // leave a concurrent successful register() without its listeners.
  const attempt = ++registrationAttempt;
  if (!isServiceWorkerSupported()) return false;
  try {
    const registration = await navigator.serviceWorker.getRegistration(basePath());
    if (!registration) {
      invalidatedRegistrationAttempt = Math.max(invalidatedRegistrationAttempt, attempt);
      releaseListeners?.();
      return true;
    }

    const unregistered = (await registration.unregister()) === true;
    if (unregistered) {
      invalidatedRegistrationAttempt = Math.max(invalidatedRegistrationAttempt, attempt);
      releaseListeners?.();
    }
    return unregistered;
  } catch {
    return false;
  }
}

export async function updateServiceWorker(): Promise<boolean> {
  if (!isServiceWorkerSupported()) return false;
  try {
    const registration = await navigator.serviceWorker.getRegistration(basePath());
    if (!registration) return false;
    await registration.update();
    emitStatusChange();
    return true;
  } catch {
    return false;
  }
}

export async function activateWaitingServiceWorker(): Promise<boolean> {
  if (!isServiceWorkerSupported()) return false;
  const container = navigator.serviceWorker;
  let registration: ServiceWorkerRegistration | undefined;
  try {
    registration = await container.getRegistration(basePath());
  } catch {
    return false;
  }
  const waiting = registration?.waiting;
  if (!waiting) return false;

  return new Promise((resolve) => {
    let settled = false;
    function onControllerChange(): void {
      finish(true);
    }
    function finish(result: boolean): void {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      container.removeEventListener('controllerchange', onControllerChange);
      resolve(result);
    }
    const timeout = window.setTimeout(() => finish(false), 5000);
    container.addEventListener('controllerchange', onControllerChange);
    try {
      waiting.postMessage({ type: 'SKIP_WAITING' });
    } catch {
      finish(false);
    }
  });
}

export const SERVICE_WORKER_UPDATE_WAITING_MESSAGE =
  'A new MillOS build is waiting; reload to activate it.';
export const SERVICE_WORKER_UPDATE_ACTIVE_MESSAGE =
  'A new MillOS build is now active; reload to use it.';

export interface ServiceWorkerUpdatePolicy {
  /** True once the scene has opened; a build update must never reload it. */
  isSessionActive: () => boolean;
  reload: () => void;
  warn: (message: string) => void;
}

/**
 * Register the worker and decide when a new build may reload the page.
 *
 * A new worker used to park in `waiting` until every tab closed, so a deploy
 * never reached open tabs; activating it and reloading fixed that, but did so
 * mid-session too. The rule now has three parts:
 * (a) an update found while the scene is open stays waiting, with a warning;
 * (b) a controller change never reloads a tab whose scene is open;
 * (c) at the next startup, before the scene opens, a waiting worker is
 *     activated and the page reloads once, so a build is never stranded.
 * Working if an open scene is never reloaded by a deploy, and the reload after
 * a deploy happens on the loader of the next startup instead.
 */
export async function registerServiceWorkerWithUpdatePolicy(
  policy: ServiceWorkerUpdatePolicy,
  config?: ServiceWorkerConfig
): Promise<ServiceWorkerRegistration | null> {
  if (!isServiceWorkerSupported()) return null;
  const container = navigator.serviceWorker;
  let hadController = false;
  try {
    hadController = Boolean(container.controller);
  } catch {
    hadController = false;
  }

  let reloading = false;
  const reloadOnce = (): void => {
    if (reloading) return;
    if (policy.isSessionActive()) {
      policy.warn(SERVICE_WORKER_UPDATE_ACTIVE_MESSAGE);
      return;
    }
    reloading = true;
    policy.reload();
  };
  container.addEventListener('controllerchange', () => {
    // First install claims the page without a build change; only a
    // replacement controller means the shell on screen is stale.
    if (hadController) reloadOnce();
  });

  let activating = false;
  const activateWaiting = (reloadWhenActivated: boolean): void => {
    if (activating || reloading) return;
    if (policy.isSessionActive()) {
      policy.warn(SERVICE_WORKER_UPDATE_WAITING_MESSAGE);
      return;
    }
    activating = true;
    void activateWaitingServiceWorker().then((activated) => {
      activating = false;
      if (!activated) policy.warn(SERVICE_WORKER_UPDATE_WAITING_MESSAGE);
      else if (reloadWhenActivated) reloadOnce();
    });
  };

  const registration = await registerServiceWorker({
    ...config,
    onUpdate: (updated) => {
      config?.onUpdate?.(updated);
      activateWaiting(true);
    },
  });
  // A build that finished installing in an earlier session. An uncontrolled
  // page already loaded its shell from the network, so only the controller
  // change (when there was a previous controller) reloads it.
  if (registration?.waiting) activateWaiting(false);
  return registration;
}

async function postMessageWithReply<T>(
  type: 'CLEAR_CACHE' | 'GET_CACHE_SIZE' | 'GET_BUILD_INFO'
): Promise<T | null> {
  if (!isServiceWorkerSupported()) return null;
  let controller: ServiceWorker | null;
  try {
    controller = navigator.serviceWorker.controller;
  } catch {
    return null;
  }
  if (!controller) return null;

  return new Promise((resolve) => {
    let messageChannel: MessageChannel;
    try {
      messageChannel = new MessageChannel();
    } catch {
      resolve(null);
      return;
    }

    let settled = false;
    function finish(value: T | null): void {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      messageChannel.port1.onmessage = null;
      messageChannel.port1.onmessageerror = null;
      messageChannel.port1.close();
      resolve(value);
    }
    const timeout = window.setTimeout(() => finish(null), 5000);
    messageChannel.port1.onmessage = (event: MessageEvent<T>) => finish(event.data);
    messageChannel.port1.onmessageerror = () => finish(null);
    try {
      controller.postMessage({ type }, [messageChannel.port2]);
    } catch {
      messageChannel.port2.close();
      finish(null);
    }
  });
}

async function clearDirectScopedCaches(): Promise<boolean> {
  if (typeof window === 'undefined' || !('caches' in window)) return false;
  try {
    const cacheStorage = window.caches;
    const prefix = serviceWorkerCachePrefix();
    const names = await cacheStorage.keys();
    const results = await Promise.allSettled(
      names.filter((name) => name.startsWith(prefix)).map((name) => cacheStorage.delete(name))
    );
    return results.every((result) => result.status === 'fulfilled' && result.value);
  } catch {
    return false;
  }
}

export async function clearServiceWorkerCache(): Promise<boolean> {
  const response = await postMessageWithReply<{ success?: boolean }>('CLEAR_CACHE');
  if (response) return response.success === true;
  return clearDirectScopedCaches();
}

export async function getServiceWorkerCacheStats(): Promise<ServiceWorkerCacheStats | null> {
  return postMessageWithReply<ServiceWorkerCacheStats>('GET_CACHE_SIZE');
}

export async function getServiceWorkerBuildInfo(): Promise<ServiceWorkerBuildInfo | null> {
  return postMessageWithReply<ServiceWorkerBuildInfo>('GET_BUILD_INFO');
}

export async function getBuildCacheDiagnostics(): Promise<BuildCacheDiagnostics> {
  const supported = isServiceWorkerSupported();
  let container: ServiceWorkerContainer | null = null;
  let registration: ServiceWorkerRegistration | undefined;
  let worker: ServiceWorkerBuildInfo | null = null;
  let controller: ServiceWorker | null = null;

  if (supported) {
    try {
      container = navigator.serviceWorker;
      registration = await container.getRegistration(basePath());
    } catch {
      registration = undefined;
    }

    try {
      worker = await getServiceWorkerBuildInfo();
    } catch {
      worker = null;
    }

    try {
      controller = container?.controller ?? null;
    } catch {
      controller = null;
    }
  }

  const cacheEntries = worker
    ? Object.values(worker.caches).reduce((total, cache) => total + cache.entries, 0)
    : 0;

  return {
    appBuildId: APP_BUILD_ID,
    appCacheVersion: APP_CACHE_VERSION,
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    supported,
    controlled: Boolean(controller),
    controllerScriptUrl: controller?.scriptURL ?? null,
    registrationScope: registration?.scope ?? null,
    updateWaiting: Boolean(registration?.waiting),
    installing: Boolean(registration?.installing),
    worker,
    cacheEntries,
  };
}

export function isRunningOffline(): boolean {
  return typeof navigator !== 'undefined' && !navigator.onLine;
}

export function addConnectivityListener(callback: (online: boolean) => void): () => void {
  const handleOnline = (): void => callback(true);
  const handleOffline = (): void => callback(false);
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}
