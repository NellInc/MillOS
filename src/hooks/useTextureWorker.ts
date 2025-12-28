/**
 * useTextureWorker - React hook for offloaded texture processing
 *
 * Uses a Web Worker to process textures without blocking the main thread.
 * Handles worker lifecycle automatically.
 *
 * Usage:
 *   const { decodeTexture, isProcessing } = useTextureWorker();
 *   const result = await decodeTexture('/textures/wood.jpg');
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type {
  TextureWorkerMessage,
  TextureWorkerResponse,
  DecodePayload,
  DecodeResult,
  AtlasPayload,
  AtlasResult,
} from '../workers/textureWorker';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
}

export function useTextureWorker() {
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const pendingRequests = useRef<Map<string, PendingRequest>>(new Map());
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize worker
  useEffect(() => {
    try {
      workerRef.current = new Worker(new URL('../workers/textureWorker.ts', import.meta.url), {
        type: 'module',
      });

      workerRef.current.onmessage = (e: MessageEvent<TextureWorkerResponse>) => {
        const { type, id, result, error: errorMsg } = e.data;
        const pending = pendingRequests.current.get(id);

        if (pending) {
          pendingRequests.current.delete(id);

          if (type === 'success') {
            pending.resolve(result);
          } else {
            pending.reject(new Error(errorMsg || 'Worker error'));
          }

          // Update processing state
          if (pendingRequests.current.size === 0) {
            setIsProcessing(false);
          }
        }
      };

      workerRef.current.onerror = (e) => {
        setError(e.message);
      };
    } catch {
      setError('Worker initialization failed');
    }

    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      pendingRequests.current.clear();
    };
  }, []);

  // Send message to worker and return promise
  const sendMessage = useCallback(
    <T>(type: TextureWorkerMessage['type'], payload: unknown): Promise<T> => {
      return new Promise((resolve, reject) => {
        if (!workerRef.current) {
          reject(new Error('Worker not initialized'));
          return;
        }

        const id = `req_${requestIdRef.current++}`;
        pendingRequests.current.set(id, {
          resolve: resolve as (value: unknown) => void,
          reject,
        });

        setIsProcessing(true);

        workerRef.current.postMessage({
          type,
          id,
          payload,
        } as TextureWorkerMessage);
      });
    },
    []
  );

  // Decode texture from URL
  const decodeTexture = useCallback(
    (url: string, maxSize?: number): Promise<DecodeResult> => {
      return sendMessage<DecodeResult>('decode', { url, maxSize } as DecodePayload);
    },
    [sendMessage]
  );

  // Calculate atlas packing
  const calculateAtlasPacking = useCallback(
    (
      textures: Array<{ id: string; width: number; height: number }>,
      maxSize: number = 2048,
      padding: number = 2
    ): Promise<AtlasResult> => {
      return sendMessage<AtlasResult>('packAtlas', {
        textures,
        maxSize,
        padding,
      } as AtlasPayload);
    },
    [sendMessage]
  );

  return {
    decodeTexture,
    calculateAtlasPacking,
    isProcessing,
    error,
    isAvailable: workerRef.current !== null,
  };
}

/**
 * Standalone texture worker manager (non-React)
 * For use outside React components
 */
export class TextureWorkerManager {
  private worker: Worker | null = null;
  private requestId = 0;
  private pendingRequests = new Map<string, PendingRequest>();

  async initialize(): Promise<void> {
    if (this.worker) return;

    this.worker = new Worker(new URL('../workers/textureWorker.ts', import.meta.url), {
      type: 'module',
    });

    this.worker.onmessage = (e: MessageEvent<TextureWorkerResponse>) => {
      const { type, id, result, error } = e.data;
      const pending = this.pendingRequests.get(id);

      if (pending) {
        this.pendingRequests.delete(id);
        if (type === 'success') {
          pending.resolve(result);
        } else {
          pending.reject(new Error(error || 'Worker error'));
        }
      }
    };
  }

  async decodeTexture(url: string, maxSize?: number): Promise<DecodeResult> {
    await this.initialize();
    return this.sendMessage<DecodeResult>('decode', { url, maxSize });
  }

  async calculateAtlasPacking(
    textures: Array<{ id: string; width: number; height: number }>,
    maxSize: number = 2048,
    padding: number = 2
  ): Promise<AtlasResult> {
    await this.initialize();
    return this.sendMessage<AtlasResult>('packAtlas', { textures, maxSize, padding });
  }

  private sendMessage<T>(type: TextureWorkerMessage['type'], payload: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error('Worker not initialized'));
        return;
      }

      const id = `req_${this.requestId++}`;
      this.pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
      });

      this.worker.postMessage({ type, id, payload });
    });
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.pendingRequests.clear();
  }
}

// Singleton for non-React usage
let sharedManager: TextureWorkerManager | null = null;

export function getTextureWorkerManager(): TextureWorkerManager {
  if (!sharedManager) {
    sharedManager = new TextureWorkerManager();
  }
  return sharedManager;
}
