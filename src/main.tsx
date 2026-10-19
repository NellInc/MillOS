import { Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';
import { registerServiceWorkerWithUpdatePolicy } from './utils/serviceWorkerRegistration';
import { getStartupSnapshot } from './utils/startupReadiness';
import { logger } from './utils/logger';
import { isBenchmarkRuntime } from './runtime/runtimeMode';
import { installPhysicalSession } from './utils/physicalSession';

performance.mark('millos:bootstrap');

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

if (!isBenchmarkRuntime()) installPhysicalSession();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <Suspense fallback={null}>
      <RootComponent />
    </Suspense>
  </ErrorBoundary>
);

// A deterministic benchmark must never install or become controlled by the
// production service worker. Reusing a preview origin across fixed-camera
// captures can otherwise mix chunks from adjacent builds and invalidate both
// visual and performance evidence.
if (!isBenchmarkRuntime()) {
  // Register service worker for offline caching (production only by default).
  // Set VITE_ENABLE_SW=true in .env to enable during development.
  // A new worker used to park in `waiting` until every tab closed, so a deploy
  // never reached open tabs. A waiting build is now activated, with one
  // guarded reload, only before the scene opens: at this startup, or at the
  // next one if the update arrived mid-session. Working if a deploy never
  // reloads an open scene and still reaches the tab on its next load.
  void registerServiceWorkerWithUpdatePolicy({
    isSessionActive: () => {
      const startup = getStartupSnapshot();
      return startup.opened || startup.ready;
    },
    reload: () => window.location.reload(),
    warn: (message) => logger.warn(message),
  });
}
