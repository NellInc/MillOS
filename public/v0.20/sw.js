/**
 * MillOS Service Worker v2
 *
 * Provides offline caching for faster loads and offline support.
 *
 * Cache Strategy:
 * - Static assets (JS, CSS, fonts, images): Cache-first with network fallback
 * - Audio files: Cache-first (large files benefit most from caching)
 * - 3D models (GLB, GLTF, KTX2): Cache-first
 * - HDRI files: Cache-first
 * - API calls: Network-first with cache fallback
 * - HTML: Network-first (always get latest)
 *
 * Important: Only HTTP 200 responses are cached. Partial responses (206) from
 * range requests (common for audio/video seeking) cannot be stored in the Cache API.
 * This is by design - full resources are cached on initial load, and subsequent
 * range requests work normally but don't update the cache.
 */

// Cache version - bump this to invalidate all caches on deploy
const CACHE_VERSION = 'v2';
const STATIC_CACHE = `millos-static-${CACHE_VERSION}`;
const AUDIO_CACHE = `millos-audio-${CACHE_VERSION}`;
const MODEL_CACHE = `millos-models-${CACHE_VERSION}`;

// Assets to precache on install - critical for offline functionality
// Use relative paths (./) so they work at any base URL (/, /v0.20/, etc.)
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './hdri/warehouse.hdr',
  './fonts/MedievalSharp.ttf', // Village 3D text font
];

// File extensions by caching strategy
const CACHE_FIRST_EXTENSIONS = new Set([
  '.js', '.css',
  '.woff', '.woff2', '.ttf', '.otf',
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico',
]);

const AUDIO_EXTENSIONS = new Set(['.mp3', '.ogg', '.wav', '.m4a']);
const MODEL_EXTENSIONS = new Set(['.glb', '.gltf', '.bin', '.hdr', '.ktx2']);

/**
 * Get file extension from URL pathname
 */
function getExtension(url) {
  const pathname = new URL(url).pathname;
  const lastDot = pathname.lastIndexOf('.');
  return lastDot !== -1 ? pathname.substring(lastDot) : '';
}

/**
 * Get the appropriate cache name for a URL based on file type
 */
function getCacheName(url) {
  const ext = getExtension(url);
  if (AUDIO_EXTENSIONS.has(ext)) return AUDIO_CACHE;
  if (MODEL_EXTENSIONS.has(ext)) return MODEL_CACHE;
  return STATIC_CACHE;
}

/**
 * Determine if URL should use cache-first strategy
 */
function shouldCacheFirst(url) {
  const ext = getExtension(url);
  return CACHE_FIRST_EXTENSIONS.has(ext) ||
         AUDIO_EXTENSIONS.has(ext) ||
         MODEL_EXTENSIONS.has(ext);
}

/**
 * Check if a response is cacheable
 * Only cache complete (200) responses - partial (206) responses from range
 * requests are not supported by the Cache API
 */
function isCacheable(response) {
  return response.status === 200;
}

/**
 * Install event - precache essential assets
 */
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');

  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      console.log('[SW] Precaching essential assets:', PRECACHE_ASSETS);
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        // Log but don't fail - some assets may be unavailable during dev
        console.warn('[SW] Some assets failed to precache:', err);
      });
    })
  );

  // Immediately take control (don't wait for old SW to stop)
  self.skipWaiting();
});

/**
 * Activate event - clean up old caches
 */
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');

  const currentCaches = [STATIC_CACHE, AUDIO_CACHE, MODEL_CACHE];

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith('millos-') && !currentCaches.includes(name))
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    })
  );

  // Take control of all pages immediately
  self.clients.claim();
});

/**
 * Fetch event - route requests to appropriate caching strategy
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = request.url;

  // Skip non-GET requests (POST, PUT, DELETE, etc.)
  if (request.method !== 'GET') return;

  // Skip cross-origin requests (except allowlisted CDNs)
  const requestUrl = new URL(url);
  if (requestUrl.origin !== self.location.origin) {
    // Allow DRACO decoder from Google CDN
    if (!url.includes('gstatic.com/draco')) return;
  }

  // Skip development/tooling requests
  if (url.includes('sw.js') || url.includes('__vite') || url.includes('/@')) return;

  // Route to appropriate strategy
  if (shouldCacheFirst(url)) {
    event.respondWith(cacheFirst(request));
  } else {
    event.respondWith(networkFirst(request));
  }
});

/**
 * Cache-first strategy: Serve from cache, fall back to network
 * Best for static assets that rarely change
 */
async function cacheFirst(request) {
  const cacheName = getCacheName(request.url);

  try {
    // Check cache first
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    // Not in cache - fetch from network
    const networkResponse = await fetch(request);

    // Cache if it's a complete response (not partial/206)
    if (isCacheable(networkResponse)) {
      const cache = await caches.open(cacheName);
      // Don't await - cache in background
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.warn('[SW] Cache-first failed:', request.url, error.message);

    // Try stale cache as last resort
    const staleResponse = await caches.match(request);
    if (staleResponse) {
      console.log('[SW] Serving stale cache for:', request.url);
      return staleResponse;
    }

    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

/**
 * Network-first strategy: Fetch from network, fall back to cache
 * Best for HTML and dynamic content
 */
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);

    // Cache complete responses for offline fallback
    if (isCacheable(networkResponse)) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.warn('[SW] Network-first falling back to cache:', request.url);

    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    // For navigation, return cached index.html (SPA fallback)
    if (request.mode === 'navigate') {
      const indexResponse = await caches.match('/index.html');
      if (indexResponse) return indexResponse;
    }

    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

/**
 * Message handler - cache management commands from main thread
 */
self.addEventListener('message', (event) => {
  const { type } = event.data;

  if (type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys()
        .then((names) => Promise.all(
          names.filter((n) => n.startsWith('millos-')).map((n) => caches.delete(n))
        ))
        .then(() => event.ports[0]?.postMessage({ success: true }))
    );
  }

  if (type === 'GET_CACHE_SIZE') {
    event.waitUntil(getCacheStats().then((stats) => event.ports[0]?.postMessage(stats)));
  }
});

/**
 * Get cache statistics for debugging
 */
async function getCacheStats() {
  const stats = {};
  const names = await caches.keys();

  for (const name of names.filter((n) => n.startsWith('millos-'))) {
    const cache = await caches.open(name);
    const requests = await cache.keys();
    stats[name] = {
      entries: requests.length,
      urls: requests.map((r) => new URL(r.url).pathname),
    };
  }

  return stats;
}
