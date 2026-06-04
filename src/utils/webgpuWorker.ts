/**
 * Web Worker host for the @mlc-ai/web-llm engine.
 *
 * Running the model download + compile + inference in a dedicated worker:
 *  - keeps the heavy WASM / WebGPU work OFF the main thread, so MillOS's React
 *    Three Fiber scene stays responsive while the local model loads and infers;
 *  - lets webgpuClient.cancelLoad() HARD-ABORT an in-flight download by calling
 *    worker.terminate() — which kills the worker's fetches immediately. The
 *    main-thread engine API exposes no load-time AbortSignal, so terminating the
 *    worker is the only way to truly stop a multi-GB download in progress.
 *
 * Vite bundles this as its own chunk (referenced via
 * `new Worker(new URL('./webgpuWorker.ts', import.meta.url), { type: 'module' })`
 * in webgpuClient.ts), so @mlc-ai/web-llm's ~5MB runtime lives in the worker
 * chunk, off the eager app bundle.
 */
import { WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm';

const handler = new WebWorkerMLCEngineHandler();

self.onmessage = (msg: MessageEvent): void => {
  handler.onmessage(msg);
};
