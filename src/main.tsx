import { Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';
import { registerServiceWorker } from './utils/serviceWorkerRegistration';
import { logger } from './utils/logger';

// Pre-warm Rapier WASM - starts loading immediately instead of blocking on first Physics render
// This runs in parallel with React initialization, reducing perceived startup time
import('@dimforge/rapier3d-compat').then((RAPIER) => {
  RAPIER.init().catch(() => {
    // Silently ignore - will be initialized again when Physics mounts
  });
});

// Suppress harmless warnings from third-party libraries
const originalWarn = console.warn;
console.warn = (...args: unknown[]): void => {
  const message = args[0];
  if (typeof message === 'string') {
    // Troika font warnings (drei's Text component) - don't affect rendering
    if (message.includes('unsupported GPOS table') || message.includes('unsupported GSUB table')) {
      return;
    }
    // Rapier WASM init deprecation (internal to @react-three/rapier, awaiting library fix)
    if (message.includes('deprecated parameters for the initialization')) {
      return;
    }
  }
  originalWarn.apply(console, args);
};

// Global async error logging. React's ErrorBoundary only catches render-phase
// errors; it does NOT see unhandled promise rejections (e.g. the Rapier prewarm
// above, dynamic imports, audio resume) or errors thrown outside the React tree.
// Without these listeners such failures are completely silent in the field.
window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent): void => {
  logger.error('[unhandledrejection]', event.reason);
});
window.addEventListener('error', (event: ErrorEvent): void => {
  logger.error('[window.error]', event.error ?? event.message);
});

// StrictMode disabled for 3D app - causes double-renders that tank performance in dev
// Production builds are unaffected (StrictMode only runs in development)
const RootComponent = App;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <Suspense fallback={null}>
      <RootComponent />
    </Suspense>
  </ErrorBoundary>
);

// Register service worker for offline caching (production only by default)
// Set VITE_ENABLE_SW=true in .env to enable during development
registerServiceWorker({
  onSuccess: () => {
    // Service worker installed successfully
  },
  onUpdate: () => {
    // New version available
  },
  onError: () => {
    // Service worker registration failed
  },
});
