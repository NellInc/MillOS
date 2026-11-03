import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SCADAService } from '../SCADAService';
import type { ConnectionConfig } from '../types';
import { MILL_TAGS } from '../tagDatabase';

const BASE = 'https://scada-service.example.invalid/api';
const NEXT = 'https://next-scada-service.example.invalid/api';
const KEY = 'synthetic-service-credential';

describe('SCADAService real credential routing and replacement', () => {
  const services: SCADAService[] = [];
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Preserve real asynchronous IndexedDB setup, matching integration.test.ts.
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    fetchMock = vi.fn(
      async (_url: string, _options: RequestInit) =>
        ({
          ok: true,
          status: 200,
          json: async () => ({
            tags: MILL_TAGS.map((tag) => ({
              tagId: tag.id,
              value: tag.dataType === 'BOOL' ? false : tag.dataType === 'STRING' ? '' : 0,
              quality: 'GOOD',
              timestamp: Date.now(),
            })),
            serverTime: Date.now(),
          }),
        }) as unknown as Response
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(async () => {
    try {
      for (const service of services.splice(0)) await service.stop();
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  function create(connection: ConnectionConfig) {
    const service = new SCADAService({
      mode: 'live',
      connection,
      historyRetention: 60_000,
      historySampleRate: 100,
      alarmsEnabled: false,
    });
    services.push(service);
    return service;
  }

  it.each([
    { type: 'rest', apiKeyAuth: 'bearer', header: 'authorization', value: 'Bearer ' + KEY },
    { type: 'rest', apiKeyAuth: 'x-api-key', header: 'x-api-key', value: KEY },
    { type: 'opcua', apiKeyAuth: 'bearer', header: 'x-api-key', value: KEY },
    { type: 'modbus', apiKeyAuth: 'bearer', header: 'x-api-key', value: KEY },
  ] as const)(
    'routes $type through its real adapter with $header and no redirect',
    async ({ type, apiKeyAuth, header, value }) => {
      const connection: ConnectionConfig = {
        type,
        apiKey: KEY,
        apiKeyAuth,
        ...(type === 'rest' ? { baseUrl: BASE } : { proxyUrl: BASE }),
      };
      const service = create(connection);
      await service.start();

      expect(fetchMock).toHaveBeenCalled();
      expect(fetchMock.mock.calls.some(([url]) => url === BASE + '/health')).toBe(true);
      for (const [url, options] of fetchMock.mock.calls) {
        expect(url.startsWith(BASE + '/')).toBe(true);
        const headers = new Headers(options.headers);
        expect(headers.get(header)).toBe(value);
        expect(headers.has(header === 'authorization' ? 'x-api-key' : 'authorization')).toBe(false);
        expect(options.redirect).toBe('error');
      }
    }
  );

  it('replaces the active memory config and never merges an earlier key into a new destination', async () => {
    const service = create({ type: 'rest', baseUrl: BASE, apiKey: KEY, apiKeyAuth: 'bearer' });
    expect(service.getConnectionConfig().apiKey).toBe(KEY);

    await service.setConnectionConfig({ type: 'rest', baseUrl: NEXT, apiKeyAuth: 'x-api-key' });
    expect(service.getConnectionConfig()).toEqual({
      type: 'rest',
      baseUrl: NEXT,
      apiKeyAuth: 'x-api-key',
    });
    const reconstructed = new SCADAService();
    services.push(reconstructed);
    expect(reconstructed.getConnectionConfig()).toEqual({
      type: 'rest',
      baseUrl: NEXT,
      apiKeyAuth: 'x-api-key',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
