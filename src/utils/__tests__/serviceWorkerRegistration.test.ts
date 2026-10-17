import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  activateWaitingServiceWorker,
  clearServiceWorkerCache,
  getBuildCacheDiagnostics,
  getServiceWorkerBuildInfo,
  getServiceWorkerCacheStats,
  registerServiceWorker,
  serviceWorkerCachePrefix,
  serviceWorkerScopeKey,
  unregisterServiceWorker,
} from '../serviceWorkerRegistration';

interface ServiceWorkerHarness {
  container: ServiceWorkerContainer;
  registration: ServiceWorkerRegistration;
  installing: ServiceWorker;
  unregister: ReturnType<typeof vi.fn>;
  containerRemoveListener: ReturnType<typeof vi.fn>;
  registrationRemoveListener: ReturnType<typeof vi.fn>;
}

const originalServiceWorkerDescriptor = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');

type WorkerMessageType = 'CLEAR_CACHE' | 'GET_BUILD_INFO';

interface PublicWorkerHarness {
  dispatchMessage: (type: WorkerMessageType) => Promise<unknown>;
  deleteCache: ReturnType<typeof vi.fn>;
  openCache: ReturnType<typeof vi.fn>;
  remainingCacheNames: () => string[];
}

function executePublicWorker(
  scope: string,
  initialCaches: ReadonlyMap<string, readonly string[]>
): PublicWorkerHarness {
  const cacheContents = new Map(
    [...initialCaches].map(([name, urls]) => [name, [...urls]] as const)
  );
  const listeners = new Map<string, (event: unknown) => void>();
  const deleteCache = vi.fn(async (name: string): Promise<boolean> => cacheContents.delete(name));
  const openCache = vi.fn(async (name: string) => ({
    keys: async () => (cacheContents.get(name) ?? []).map((url) => ({ url })),
  }));
  const cacheStorage = {
    keys: async (): Promise<string[]> => [...cacheContents.keys()],
    delete: deleteCache,
    open: openCache,
  };
  const workerGlobal = {
    registration: { scope },
    location: { origin: new URL(scope).origin },
    clients: { claim: vi.fn().mockResolvedValue(undefined) },
    skipWaiting: vi.fn().mockResolvedValue(undefined),
    addEventListener: (type: string, listener: (event: unknown) => void): void => {
      listeners.set(type, listener);
    },
  };
  const source = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8');
  runInNewContext(
    source,
    {
      URL,
      caches: cacheStorage,
      console: { warn: vi.fn() },
      self: workerGlobal,
    },
    { filename: 'public/sw.js' }
  );

  return {
    deleteCache,
    openCache,
    remainingCacheNames: () => [...cacheContents.keys()],
    dispatchMessage: async (type) => {
      const listener = listeners.get('message');
      if (!listener) throw new Error('The real worker did not install its message listener');

      const pending: Promise<unknown>[] = [];
      let reply: unknown;
      listener({
        data: { type },
        ports: [
          {
            postMessage: (value: unknown): void => {
              reply = value;
            },
          },
        ],
        waitUntil: (value: Promise<unknown>): void => {
          pending.push(Promise.resolve(value));
        },
      });
      await Promise.all(pending);
      return reply == null ? reply : JSON.parse(JSON.stringify(reply));
    },
  };
}

function installServiceWorkerHarness(options?: {
  controller?: ServiceWorker | null;
  waiting?: ServiceWorker | null;
}): ServiceWorkerHarness {
  const installingTarget = new EventTarget();
  const installing = Object.assign(installingTarget, {
    state: 'installing' as ServiceWorkerState,
    postMessage: vi.fn(),
    scriptURL: '/sw.js',
  }) as unknown as ServiceWorker;

  const registrationTarget = new EventTarget();
  const unregister = vi.fn().mockResolvedValue(true);
  const update = vi.fn().mockResolvedValue(undefined);
  Object.defineProperties(registrationTarget, {
    installing: { configurable: true, get: () => installing },
    waiting: { configurable: true, get: () => options?.waiting ?? null },
    scope: { configurable: true, value: 'http://localhost:3000/' },
    unregister: { configurable: true, value: unregister },
    update: { configurable: true, value: update },
  });
  const registration = registrationTarget as unknown as ServiceWorkerRegistration;

  const containerTarget = new EventTarget();
  Object.defineProperties(containerTarget, {
    controller: { configurable: true, get: () => options?.controller ?? null },
    register: {
      configurable: true,
      value: vi.fn().mockResolvedValue(registration),
    },
    getRegistration: {
      configurable: true,
      value: vi.fn().mockResolvedValue(registration),
    },
  });
  const container = containerTarget as unknown as ServiceWorkerContainer;
  const containerRemoveListener = vi.spyOn(container, 'removeEventListener');
  const registrationRemoveListener = vi.spyOn(registration, 'removeEventListener');

  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: container,
  });

  return {
    container,
    registration,
    installing,
    unregister,
    containerRemoveListener,
    registrationRemoveListener,
  };
}

class MockMessagePort {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  close = vi.fn();
}

class MockMessageChannel {
  static instances: MockMessageChannel[] = [];

  port1 = new MockMessagePort();
  port2 = new MockMessagePort();

  constructor() {
    MockMessageChannel.instances.push(this);
  }
}

beforeEach(() => {
  MockMessageChannel.instances = [];
  vi.stubEnv('VITE_ENABLE_SW', 'true');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  if (originalServiceWorkerDescriptor) {
    Object.defineProperty(navigator, 'serviceWorker', originalServiceWorkerDescriptor);
  } else {
    Reflect.deleteProperty(navigator, 'serviceWorker');
  }
});

describe('service worker scope isolation', () => {
  it('never intercepts OAuth callbacks or caches no-store navigation responses', async () => {
    const scope = 'http://127.0.0.1:3001/';
    const listeners = new Map<string, (event: unknown) => void>();
    const put = vi.fn().mockResolvedValue(undefined);
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response('private', { headers: { 'Cache-Control': 'no-store' } }));
    const workerGlobal = {
      registration: { scope },
      location: { origin: new URL(scope).origin },
      addEventListener: (type: string, listener: (event: unknown) => void): void => {
        listeners.set(type, listener);
      },
    };
    runInNewContext(readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8'), {
      URL,
      caches: { open: async () => ({ match: async () => null, put }) },
      fetch: fetcher,
      self: workerGlobal,
    });
    const listener = listeners.get('fetch');
    expect(listener).toBeDefined();
    const dispatch = async (url: string) => {
      let intercepted: Promise<Response> | undefined;
      const pending: Promise<unknown>[] = [];
      listener!({
        request: { url, method: 'GET', mode: 'navigate', headers: new Headers() },
        respondWith: (value: Promise<Response>) => {
          intercepted = value;
        },
        waitUntil: (value: Promise<unknown>) => {
          pending.push(value);
        },
      });
      if (intercepted) await intercepted;
      await Promise.all(pending);
      return Boolean(intercepted);
    };
    expect(await dispatch(`${scope}auth/callback?code=private&state=private`)).toBe(false);
    expect(await dispatch(`${scope}api/chatgpt/status`)).toBe(false);
    expect(await dispatch(`${scope}private`)).toBe(true);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(put).not.toHaveBeenCalled();
  });

  it('creates stable keys for root and version paths', () => {
    expect(serviceWorkerScopeKey('/')).toBe('root');
    expect(serviceWorkerScopeKey('/v0.30/')).toBe('v0.30');
    expect(serviceWorkerScopeKey('operator preview')).toBe('operator_preview');
  });

  it('does not share cache prefixes across deployment scopes', () => {
    expect(serviceWorkerCachePrefix('/')).toBe('millos-root-');
    expect(serviceWorkerCachePrefix('/v0.20/')).toBe('millos-v0.20-');
    expect(serviceWorkerCachePrefix('/')).not.toBe(serviceWorkerCachePrefix('/v0.20/'));
  });

  it('executes the real worker and isolates cache diagnostics and clearing to its scope', async () => {
    const scope = 'https://mill.example/v0.30/';
    const shellCache = 'millos-v0.30-shell-development';
    const worldCache = 'millos-v0.30-world-development';
    const foreignVersionCache = 'millos-v0.20-shell-development';
    const foreignRootCache = 'millos-root-shell-development';
    const harness = executePublicWorker(
      scope,
      new Map([
        [shellCache, [`${scope}index.html`, `${scope}assets/app-123456.js`]],
        [worldCache, [`${scope}models/mill.glb`]],
        [foreignVersionCache, ['https://mill.example/v0.20/index.html']],
        [foreignRootCache, ['https://mill.example/index.html']],
      ])
    );

    await expect(harness.dispatchMessage('GET_BUILD_INFO')).resolves.toEqual({
      buildId: 'development',
      cacheVersion: 'development',
      scope,
      scopeKey: 'v0.30',
      caches: {
        [shellCache]: {
          entries: 2,
          urls: ['/v0.30/index.html', '/v0.30/assets/app-123456.js'],
          truncated: false,
        },
        [worldCache]: {
          entries: 1,
          urls: ['/v0.30/models/mill.glb'],
          truncated: false,
        },
      },
    });
    expect(harness.openCache.mock.calls.map(([name]) => name)).toEqual(
      [shellCache, worldCache].sort()
    );

    await expect(harness.dispatchMessage('CLEAR_CACHE')).resolves.toEqual({ success: true });
    expect(harness.deleteCache.mock.calls.map(([name]) => name).sort()).toEqual(
      [shellCache, worldCache].sort()
    );
    expect(harness.remainingCacheNames().sort()).toEqual(
      [foreignRootCache, foreignVersionCache].sort()
    );
  });
});

describe('service worker lifecycle', () => {
  it('replaces stale registration listeners and releases the active listeners on unregister', async () => {
    const harness = installServiceWorkerHarness({ controller: {} as ServiceWorker });
    const firstUpdate = vi.fn();
    const secondUpdate = vi.fn();

    await registerServiceWorker({ onUpdate: firstUpdate });
    await registerServiceWorker({ onUpdate: secondUpdate });

    Object.assign(harness.installing, { state: 'installed' as ServiceWorkerState });
    harness.registration.dispatchEvent(new Event('updatefound'));
    harness.installing.dispatchEvent(new Event('statechange'));

    expect(firstUpdate).not.toHaveBeenCalled();
    expect(secondUpdate).toHaveBeenCalledOnce();
    expect(harness.containerRemoveListener).toHaveBeenCalledWith(
      'controllerchange',
      expect.any(Function)
    );
    expect(harness.registrationRemoveListener).toHaveBeenCalledWith(
      'updatefound',
      expect.any(Function)
    );

    expect(await unregisterServiceWorker()).toBe(true);
    const callsAfterUnregister = secondUpdate.mock.calls.length;
    harness.registration.dispatchEvent(new Event('updatefound'));
    harness.installing.dispatchEvent(new Event('statechange'));
    expect(secondUpdate).toHaveBeenCalledTimes(callsAfterUnregister);
  });

  it.each([
    {
      failure: 'returns false',
      configure: (unregister: ReturnType<typeof vi.fn>) => unregister.mockResolvedValue(false),
    },
    {
      failure: 'rejects',
      configure: (unregister: ReturnType<typeof vi.fn>) =>
        unregister.mockRejectedValue(new DOMException('Registration is busy', 'InvalidStateError')),
    },
  ])('retains active update listeners when unregister $failure', async ({ configure }) => {
    const harness = installServiceWorkerHarness({ controller: {} as ServiceWorker });
    const onUpdate = vi.fn();
    await registerServiceWorker({ onUpdate });
    configure(harness.unregister);

    await expect(unregisterServiceWorker()).resolves.toBe(false);

    Object.assign(harness.installing, { state: 'installed' as ServiceWorkerState });
    harness.registration.dispatchEvent(new Event('updatefound'));
    harness.installing.dispatchEvent(new Event('statechange'));
    expect(onUpdate).toHaveBeenCalledOnce();

    harness.unregister.mockResolvedValue(true);
    await unregisterServiceWorker();
  });

  it('releases active update listeners when no scoped registration remains', async () => {
    const harness = installServiceWorkerHarness({ controller: {} as ServiceWorker });
    const onUpdate = vi.fn();
    await registerServiceWorker({ onUpdate });
    Object.defineProperty(harness.container, 'getRegistration', {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined),
    });

    await expect(unregisterServiceWorker()).resolves.toBe(true);

    Object.assign(harness.installing, { state: 'installed' as ServiceWorkerState });
    harness.registration.dispatchEvent(new Event('updatefound'));
    harness.installing.dispatchEvent(new Event('statechange'));
    expect(onUpdate).not.toHaveBeenCalled();
    expect(harness.unregister).not.toHaveBeenCalled();
  });

  it('does not let an older successful unregister release a newer registration listener', async () => {
    const harness = installServiceWorkerHarness({ controller: {} as ServiceWorker });
    let resolveUnregister!: (result: boolean) => void;
    harness.unregister.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveUnregister = resolve;
      })
    );
    const firstUpdate = vi.fn();
    const secondUpdate = vi.fn();
    await registerServiceWorker({ onUpdate: firstUpdate });

    const unregistering = unregisterServiceWorker();
    await registerServiceWorker({ onUpdate: secondUpdate });
    resolveUnregister(true);
    await expect(unregistering).resolves.toBe(true);

    Object.assign(harness.installing, { state: 'installed' as ServiceWorkerState });
    harness.registration.dispatchEvent(new Event('updatefound'));
    harness.installing.dispatchEvent(new Event('statechange'));
    expect(firstUpdate).not.toHaveBeenCalled();
    expect(secondUpdate).toHaveBeenCalledOnce();

    harness.unregister.mockResolvedValue(true);
    await unregisterServiceWorker();
  });

  it('cleans up activation listeners when posting to the waiting worker throws', async () => {
    vi.useFakeTimers();
    const waiting = {
      postMessage: vi.fn(() => {
        throw new DOMException('Worker is no longer active', 'InvalidStateError');
      }),
    } as unknown as ServiceWorker;
    const harness = installServiceWorkerHarness({ waiting });

    await expect(activateWaitingServiceWorker()).resolves.toBe(false);

    expect(harness.containerRemoveListener).toHaveBeenCalledWith(
      'controllerchange',
      expect.any(Function)
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps the newest registration callbacks when concurrent registrations resolve out of order', async () => {
    const harness = installServiceWorkerHarness({ controller: {} as ServiceWorker });
    let resolveFirst!: (registration: ServiceWorkerRegistration) => void;
    let resolveSecond!: (registration: ServiceWorkerRegistration) => void;
    const firstRegistration = new Promise<ServiceWorkerRegistration>((resolve) => {
      resolveFirst = resolve;
    });
    const secondRegistration = new Promise<ServiceWorkerRegistration>((resolve) => {
      resolveSecond = resolve;
    });
    Object.defineProperty(harness.container, 'register', {
      configurable: true,
      value: vi.fn().mockReturnValueOnce(firstRegistration).mockReturnValueOnce(secondRegistration),
    });
    const firstUpdate = vi.fn();
    const secondUpdate = vi.fn();

    const firstResult = registerServiceWorker({ onUpdate: firstUpdate });
    const secondResult = registerServiceWorker({ onUpdate: secondUpdate });
    resolveSecond(harness.registration);
    await secondResult;
    resolveFirst(harness.registration);
    await firstResult;

    Object.assign(harness.installing, { state: 'installed' as ServiceWorkerState });
    harness.registration.dispatchEvent(new Event('updatefound'));
    harness.installing.dispatchEvent(new Event('statechange'));
    expect(firstUpdate).not.toHaveBeenCalled();
    expect(secondUpdate).toHaveBeenCalledOnce();

    expect(await unregisterServiceWorker()).toBe(true);
  });

  it('observes an earlier successful registration when a newer concurrent attempt fails', async () => {
    const harness = installServiceWorkerHarness({ controller: {} as ServiceWorker });
    let resolveFirst!: (registration: ServiceWorkerRegistration) => void;
    let rejectSecond!: (error: Error) => void;
    const firstRegistration = new Promise<ServiceWorkerRegistration>((resolve) => {
      resolveFirst = resolve;
    });
    const secondRegistration = new Promise<ServiceWorkerRegistration>((_resolve, reject) => {
      rejectSecond = reject;
    });
    Object.defineProperty(harness.container, 'register', {
      configurable: true,
      value: vi.fn().mockReturnValueOnce(firstRegistration).mockReturnValueOnce(secondRegistration),
    });
    const firstUpdate = vi.fn();
    const secondUpdate = vi.fn();
    const secondError = vi.fn();

    const firstResult = registerServiceWorker({ onUpdate: firstUpdate });
    const secondResult = registerServiceWorker({ onUpdate: secondUpdate, onError: secondError });
    rejectSecond(new Error('newer registration failed'));
    await expect(secondResult).resolves.toBeNull();
    resolveFirst(harness.registration);
    await expect(firstResult).resolves.toBe(harness.registration);

    Object.assign(harness.installing, { state: 'installed' as ServiceWorkerState });
    harness.registration.dispatchEvent(new Event('updatefound'));
    harness.installing.dispatchEvent(new Event('statechange'));
    expect(secondError).toHaveBeenCalledOnce();
    expect(firstUpdate).toHaveBeenCalledOnce();
    expect(secondUpdate).not.toHaveBeenCalled();

    expect(await unregisterServiceWorker()).toBe(true);
  });
});

describe('build cache diagnostics failures', () => {
  it('returns partial diagnostics when scoped registration lookup rejects', async () => {
    const harness = installServiceWorkerHarness({ controller: null });
    Object.defineProperty(harness.container, 'getRegistration', {
      configurable: true,
      value: vi
        .fn()
        .mockRejectedValue(new DOMException('Service worker state unavailable', 'UnknownError')),
    });

    await expect(getBuildCacheDiagnostics()).resolves.toMatchObject({
      supported: true,
      controlled: false,
      controllerScriptUrl: null,
      registrationScope: null,
      updateWaiting: false,
      installing: false,
      worker: null,
      cacheEntries: 0,
    });
  });

  it('returns registration diagnostics when worker diagnostics rejects', async () => {
    const harness = installServiceWorkerHarness();
    Object.defineProperty(harness.container, 'controller', {
      configurable: true,
      get: () => {
        throw new DOMException('Controller state unavailable', 'InvalidStateError');
      },
    });

    await expect(getBuildCacheDiagnostics()).resolves.toMatchObject({
      supported: true,
      controlled: false,
      controllerScriptUrl: null,
      registrationScope: 'http://localhost:3000/',
      updateWaiting: false,
      installing: true,
      worker: null,
      cacheEntries: 0,
    });
  });
});

describe('service worker message resources', () => {
  it('degrades every direct message API when the controller getter throws', async () => {
    const harness = installServiceWorkerHarness();
    Object.defineProperty(harness.container, 'controller', {
      configurable: true,
      get: () => {
        throw new DOMException('Controller state unavailable', 'InvalidStateError');
      },
    });
    const prefix = serviceWorkerCachePrefix('/');
    const deleteCache = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('caches', {
      keys: vi.fn().mockResolvedValue([`${prefix}shell`, 'foreign-cache']),
      delete: deleteCache,
    });

    await expect(getServiceWorkerCacheStats()).resolves.toBeNull();
    await expect(getServiceWorkerBuildInfo()).resolves.toBeNull();
    await expect(clearServiceWorkerCache()).resolves.toBe(true);
    expect(deleteCache).toHaveBeenCalledOnce();
    expect(deleteCache).toHaveBeenCalledWith(`${prefix}shell`);
  });

  it('returns null and closes the reply port when message transfer throws', async () => {
    vi.useFakeTimers();
    const controller = {
      postMessage: vi.fn(() => {
        throw new DOMException('Transfer failed', 'DataCloneError');
      }),
    } as unknown as ServiceWorker;
    installServiceWorkerHarness({ controller });
    vi.stubGlobal('MessageChannel', MockMessageChannel);

    await expect(getServiceWorkerCacheStats()).resolves.toBeNull();

    const [{ port1 }] = MockMessageChannel.instances;
    expect(port1.close).toHaveBeenCalledOnce();
    expect(MockMessageChannel.instances[0].port2.close).toHaveBeenCalledOnce();
    expect(port1.onmessage).toBeNull();
    expect(port1.onmessageerror).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('settles an unresponsive request at the deadline and releases its handlers', async () => {
    vi.useFakeTimers();
    const controller = { postMessage: vi.fn() } as unknown as ServiceWorker;
    installServiceWorkerHarness({ controller });
    vi.stubGlobal('MessageChannel', MockMessageChannel);

    const result = getServiceWorkerCacheStats();
    await vi.advanceTimersByTimeAsync(5000);

    await expect(result).resolves.toBeNull();
    const [{ port1 }] = MockMessageChannel.instances;
    expect(port1.close).toHaveBeenCalledOnce();
    expect(port1.onmessage).toBeNull();
    expect(port1.onmessageerror).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('settles a message decoding error immediately and releases its timeout', async () => {
    vi.useFakeTimers();
    const controller = { postMessage: vi.fn() } as unknown as ServiceWorker;
    installServiceWorkerHarness({ controller });
    vi.stubGlobal('MessageChannel', MockMessageChannel);

    const result = getServiceWorkerCacheStats();
    const [{ port1 }] = MockMessageChannel.instances;
    port1.onmessageerror?.(new MessageEvent('messageerror'));

    await expect(result).resolves.toBeNull();
    expect(port1.close).toHaveBeenCalledOnce();
    expect(port1.onmessage).toBeNull();
    expect(port1.onmessageerror).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('direct cache fallback failures', () => {
  it('returns false when enumerating browser caches rejects', async () => {
    installServiceWorkerHarness({ controller: null });
    vi.stubGlobal('caches', {
      keys: vi.fn().mockRejectedValue(new DOMException('Storage unavailable', 'UnknownError')),
      delete: vi.fn(),
    });

    await expect(clearServiceWorkerCache()).resolves.toBe(false);
  });

  it('returns false without touching foreign scopes when a scoped cache deletion rejects', async () => {
    installServiceWorkerHarness({ controller: null });
    const prefix = serviceWorkerCachePrefix('/');
    const deleteCache = vi.fn((name: string) => {
      if (name === `${prefix}broken`) {
        return Promise.reject(new DOMException('Cache is locked', 'InvalidStateError'));
      }
      return Promise.resolve(true);
    });
    vi.stubGlobal('caches', {
      keys: vi.fn().mockResolvedValue([`${prefix}shell`, `${prefix}broken`, 'foreign-cache']),
      delete: deleteCache,
    });

    await expect(clearServiceWorkerCache()).resolves.toBe(false);
    expect(deleteCache).toHaveBeenCalledTimes(2);
    expect(deleteCache).not.toHaveBeenCalledWith('foreign-cache');
  });
});
