/**
 * Service Worker Registration Utility
 *
 * Handles registering, updating, and communicating with the service worker.
 *
 * Usage:
 *   import { registerServiceWorker, unregisterServiceWorker } from './serviceWorkerRegistration';
 *
 *   // In your app initialization:
 *   registerServiceWorker();
 *
 *   // To force update:
 *   updateServiceWorker();
 *
 *   // To clear all caches:
 *   clearServiceWorkerCache();
 */

type ServiceWorkerCallback = (registration: ServiceWorkerRegistration) => void;

interface ServiceWorkerConfig {
  onSuccess?: ServiceWorkerCallback;
  onUpdate?: ServiceWorkerCallback;
  onError?: (error: Error) => void;
}

/**
 * Check if service workers are supported
 */
export function isServiceWorkerSupported(): boolean {
  return 'serviceWorker' in navigator;
}

/**
 * Register the service worker
 */
export async function registerServiceWorker(
  config?: ServiceWorkerConfig
): Promise<ServiceWorkerRegistration | null> {
  if (!isServiceWorkerSupported()) {
    return null;
  }

  // Only register in production or when explicitly enabled
  const isDev = import.meta.env?.DEV;
  const forceEnable = import.meta.env?.VITE_ENABLE_SW === 'true';

  if (isDev && !forceEnable) {
    return null;
  }

  try {
    // Determine SW path based on base URL
    const swUrl = `${import.meta.env?.BASE_URL || '/'}sw.js`;

    const registration = await navigator.serviceWorker.register(swUrl, {
      scope: import.meta.env?.BASE_URL || '/',
    });

    // Handle updates
    registration.onupdatefound = () => {
      const installingWorker = registration.installing;
      if (!installingWorker) return;

      installingWorker.onstatechange = () => {
        if (installingWorker.state === 'installed') {
          if (navigator.serviceWorker.controller) {
            // New service worker available
            config?.onUpdate?.(registration);
          } else {
            // First-time install
            config?.onSuccess?.(registration);
          }
        }
      };
    };

    return registration;
  } catch (error) {
    config?.onError?.(error as Error);
    return null;
  }
}

/**
 * Unregister all service workers
 */
export async function unregisterServiceWorker(): Promise<boolean> {
  if (!isServiceWorkerSupported()) {
    return false;
  }

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();

    for (const registration of registrations) {
      await registration.unregister();
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Force update the service worker
 */
export async function updateServiceWorker(): Promise<void> {
  if (!isServiceWorkerSupported()) {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration) {
      await registration.update();
    }
  } catch {
    // Update check failed - silently continue
  }
}

/**
 * Clear all service worker caches
 */
export async function clearServiceWorkerCache(): Promise<boolean> {
  const controller = navigator.serviceWorker?.controller;

  if (!isServiceWorkerSupported() || !controller) {
    // Fallback: clear caches directly
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.filter((name) => name.startsWith('millos-')).map((name) => caches.delete(name))
      );
      return true;
    }
    return false;
  }

  return new Promise((resolve) => {
    const messageChannel = new MessageChannel();

    messageChannel.port1.onmessage = (event) => {
      if (event.data?.success) {
        resolve(true);
      } else {
        resolve(false);
      }
    };

    controller.postMessage({ type: 'CLEAR_CACHE' }, [messageChannel.port2]);

    // Timeout after 5 seconds
    setTimeout(() => resolve(false), 5000);
  });
}

/**
 * Get cache statistics from the service worker
 */
export async function getServiceWorkerCacheStats(): Promise<Record<
  string,
  { entries: number; urls: string[] }
> | null> {
  if (!isServiceWorkerSupported()) {
    return null;
  }
  const controller = navigator.serviceWorker.controller;
  if (!controller) {
    return null;
  }

  return new Promise((resolve) => {
    const messageChannel = new MessageChannel();

    messageChannel.port1.onmessage = (event) => {
      resolve(event.data);
    };

    controller.postMessage({ type: 'GET_CACHE_SIZE' }, [messageChannel.port2]);

    // Timeout after 5 seconds
    setTimeout(() => resolve(null), 5000);
  });
}

/**
 * Check if the app is running from service worker cache (offline)
 */
export function isRunningOffline(): boolean {
  return !navigator.onLine;
}

/**
 * Add listener for online/offline status changes
 */
export function addConnectivityListener(callback: (online: boolean) => void): () => void {
  const handleOnline = () => callback(true);
  const handleOffline = () => callback(false);

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  // Return cleanup function
  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}
