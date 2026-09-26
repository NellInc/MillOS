/**
 * MillOS version isolated service worker.
 *
 * Every deployment scope and build receives its own cache namespace. Navigation
 * uses a network first strategy, while immutable assets use cache first.
 */

const GENERATED_BUILD_ID = '__MILLOS_BUILD_ID__';
const GENERATED_CACHE_VERSION = '__MILLOS_CACHE_VERSION__';
const BUILD_ID = GENERATED_BUILD_ID.startsWith('__') ? 'development' : GENERATED_BUILD_ID;
const CACHE_VERSION = GENERATED_CACHE_VERSION.startsWith('__')
  ? 'development'
  : GENERATED_CACHE_VERSION;
const SCOPE_URL = new URL(self.registration.scope);
const SCOPE_PATH = SCOPE_URL.pathname.endsWith('/')
  ? SCOPE_URL.pathname
  : `${SCOPE_URL.pathname}/`;
const SCOPE_KEY =
  SCOPE_PATH === '/'
    ? 'root'
    : SCOPE_PATH.replace(/^\/|\/$/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
const CACHE_PREFIX = `millos-${SCOPE_KEY}-`;
const CACHE_NAMES = {
  shell: `${CACHE_PREFIX}shell-${CACHE_VERSION}`,
  world: `${CACHE_PREFIX}world-${CACHE_VERSION}`,
  optional: `${CACHE_PREFIX}optional-${CACHE_VERSION}`,
  archive: `${CACHE_PREFIX}archive-${CACHE_VERSION}`,
};
const CURRENT_CACHES = new Set(Object.values(CACHE_NAMES));
const LEGACY_ROOT_CACHES = new Set([
  'millos-static-v4',
  'millos-audio-v4',
  'millos-models-v4',
]);
const PRECACHE_URLS = [
  new URL('./', SCOPE_URL).href,
  new URL('index.html', SCOPE_URL).href,
];
const WORLD_EXTENSIONS = new Set(['.glb', '.gltf', '.bin', '.hdr', '.ktx2']);
const OPTIONAL_EXTENSIONS = new Set(['.mp3', '.ogg', '.wav', '.m4a']);
const OPTIONAL_CHUNK_PATTERN =
  /(rapier|recharts|charts?|postprocessing|web[._-]?llm|webgpu|scada)/i;
const HASHED_ASSET_PATTERN = /\/assets\/.+-[a-zA-Z0-9_-]{6,}\.[a-zA-Z0-9]+$/;
const ARCHIVE_PATH_PATTERN = /^\/v\d+\.\d+(?:\/|$)/;

function getExtension(url) {
  const pathname = new URL(url).pathname;
  const filename = pathname.substring(pathname.lastIndexOf('/') + 1);
  const lastDot = filename.lastIndexOf('.');
  return lastDot >= 0 ? filename.substring(lastDot).toLocaleLowerCase() : '';
}

function isCacheable(response) {
  return response.status === 200 && response.type !== 'error';
}

function isRequestWithinScope(requestUrl) {
  return requestUrl.pathname.startsWith(SCOPE_PATH);
}

function cacheNameFor(requestUrl) {
  const extension = getExtension(requestUrl.href);
  // Classify against the scope-relative path: a /v0.40/-scoped worker sees
  // /v0.40/ on every request, and only a root-scoped worker serves archives.
  const scopedPath = requestUrl.pathname.slice(SCOPE_PATH.length - 1);
  if (SCOPE_PATH === '/' && ARCHIVE_PATH_PATTERN.test(scopedPath)) return CACHE_NAMES.archive;
  if (WORLD_EXTENSIONS.has(extension) || /\/(?:models|textures|hdri|draco)\//i.test(scopedPath)) {
    return CACHE_NAMES.world;
  }
  if (OPTIONAL_EXTENSIONS.has(extension) || OPTIONAL_CHUNK_PATTERN.test(scopedPath)) {
    return CACHE_NAMES.optional;
  }
  return CACHE_NAMES.shell;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAMES.shell).then(async (cache) => {
      const results = await Promise.allSettled(
        PRECACHE_URLS.map((url) =>
          fetch(url, { cache: 'no-store' }).then((response) => {
            if (!isCacheable(response)) {
              throw new Error(`Precache failed with status ${response.status}`);
            }
            return cache.put(url, response);
          })
        )
      );
      const failures = results.filter((result) => result.status === 'rejected');
      if (failures.length > 0) {
        console.warn(`[SW] ${failures.length} shell resources were unavailable during install.`);
      }
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter(
              (name) =>
                (name.startsWith(CACHE_PREFIX) && !CURRENT_CACHES.has(name)) ||
                (SCOPE_PATH === '/' && LEGACY_ROOT_CACHES.has(name))
            )
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin || !isRequestWithinScope(requestUrl)) return;
  if (
    requestUrl.pathname.endsWith('/sw.js') ||
    requestUrl.pathname.includes('/__vite') ||
    requestUrl.pathname.includes('/@')
  ) {
    return;
  }

  // Let the browser stream ranged media requests directly.
  if (request.headers.has('range')) return;

  const extension = getExtension(request.url);
  if (request.mode === 'navigate' || extension === '.html' || extension === '.json') {
    event.respondWith(networkFirst(event, request, CACHE_NAMES.shell));
    return;
  }

  const cacheName = cacheNameFor(requestUrl);
  if (
    HASHED_ASSET_PATTERN.test(requestUrl.pathname) ||
    cacheName !== CACHE_NAMES.shell ||
    extension
  ) {
    event.respondWith(cacheFirst(event, request, cacheName));
  }
});

/**
 * Store a response without holding it back from the page. A rejected put
 * (for example QuotaExceededError) must not turn a good network response
 * into an offline error.
 */
function cacheInBackground(event, cache, request, networkResponse) {
  if (!isCacheable(networkResponse)) return;
  event.waitUntil(cache.put(request, networkResponse.clone()).catch(() => {}));
}

async function cacheFirst(event, request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);
  if (cachedResponse) return cachedResponse;

  let networkResponse;
  try {
    networkResponse = await fetch(request);
  } catch {
    return new Response('Offline', {
      status: 503,
      statusText: 'Service Unavailable',
    });
  }
  cacheInBackground(event, cache, request, networkResponse);
  return networkResponse;
}

async function networkFirst(event, request, cacheName) {
  const cache = await caches.open(cacheName);
  let networkResponse;
  try {
    networkResponse = await fetch(request, { cache: 'no-store' });
  } catch {
    const cachedResponse = await cache.match(request);
    if (cachedResponse) return cachedResponse;

    if (request.mode === 'navigate') {
      const indexResponse = await cache.match(new URL('index.html', SCOPE_URL).href);
      if (indexResponse) return indexResponse;
    }
    return new Response('Offline', {
      status: 503,
      statusText: 'Service Unavailable',
    });
  }
  cacheInBackground(event, cache, request, networkResponse);
  return networkResponse;
}

self.addEventListener('message', (event) => {
  if (!event.data || typeof event.data !== 'object') return;
  const { type } = event.data;

  if (type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting());
    return;
  }

  if (type === 'CLEAR_CACHE') {
    event.waitUntil(
      clearScopedCaches().then((success) => event.ports[0]?.postMessage({ success }))
    );
    return;
  }

  if (type === 'GET_CACHE_SIZE') {
    event.waitUntil(getCacheStats().then((stats) => event.ports[0]?.postMessage(stats)));
    return;
  }

  if (type === 'GET_BUILD_INFO') {
    event.waitUntil(
      getCacheStats().then((cachesForScope) =>
        event.ports[0]?.postMessage({
          buildId: BUILD_ID,
          cacheVersion: CACHE_VERSION,
          scope: SCOPE_URL.href,
          scopeKey: SCOPE_KEY,
          caches: cachesForScope,
        })
      )
    );
  }
});

async function clearScopedCaches() {
  const names = await caches.keys();
  const results = await Promise.all(
    names.filter((name) => name.startsWith(CACHE_PREFIX)).map((name) => caches.delete(name))
  );
  return results.every(Boolean);
}

async function getCacheStats() {
  const stats = {};
  const names = await caches.keys();
  for (const name of names.filter((candidate) => candidate.startsWith(CACHE_PREFIX)).sort()) {
    const cache = await caches.open(name);
    const requests = await cache.keys();
    stats[name] = {
      entries: requests.length,
      urls: requests.slice(0, 100).map((request) => new URL(request.url).pathname),
      truncated: requests.length > 100,
    };
  }
  return stats;
}
