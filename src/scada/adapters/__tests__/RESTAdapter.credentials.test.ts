import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RESTAdapter } from '../RESTAdapter';
import type { ConnectionConfig } from '../../types';

// Synthetic values only. Stage beside the existing RESTAdapter companion.
const URL = 'https://scada-credentials.test/health';
const KEY = 'synthetic-rest-key';
type RequestAdapter = {
  fetchWithAuth(url: string, options?: RequestInit): Promise<Response>;
};

describe('RESTAdapter credential transport contracts', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let adapter: RESTAdapter | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({}),
    } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);
    adapter = undefined;
  });

  afterEach(async () => {
    try {
      await adapter?.disconnect();
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  const request = (options: RequestInit = {}, config: Partial<ConnectionConfig> = {}) => {
    adapter = new RESTAdapter([], {
      type: 'rest',
      baseUrl: 'https://scada-credentials.test',
      pollInterval: 1_000,
      ...config,
    });
    // Exercise the real request helper; only the fetch transport is mocked.
    return (adapter as unknown as RequestAdapter).fetchWithAuth(URL, options);
  };

  const capturedOptions = (): RequestInit => {
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(URL);
    return fetchMock.mock.calls[0][1] as RequestInit;
  };

  const modes = [
    {
      label: 'default bearer',
      mode: undefined,
      expectedHeader: 'authorization',
      expectedValue: `Bearer ${KEY}`,
    },
    {
      label: 'explicit x-api-key',
      mode: 'x-api-key' as const,
      expectedHeader: 'x-api-key',
      expectedValue: KEY,
    },
  ];
  const configuredCases = modes.flatMap((mode) =>
    (['lowercase', 'mixed-case'] as const).map((casing) => ({ ...mode, casing }))
  );

  it.each(configuredCases)(
    '$label with $casing headers selects exactly one credential and rejects redirects',
    async ({ mode, expectedHeader, expectedValue, casing }) => {
      const headers: HeadersInit =
        casing === 'mixed-case'
          ? [
              ['aUtHoRiZaTiOn', 'Bearer synthetic-old-bearer'],
              ['X-aPi-KeY', 'synthetic-old-api-key'],
              ['Accept', 'application/json'],
            ]
          : [
              ['authorization', 'Bearer synthetic-old-bearer'],
              ['x-api-key', 'synthetic-old-api-key'],
              ['accept', 'application/json'],
            ];
      await request({ headers, redirect: 'follow' }, { apiKey: KEY, apiKeyAuth: mode });

      const options = capturedOptions();
      const actual = new Headers(options.headers);
      expect(actual.get(expectedHeader)).toBe(expectedValue);
      const credentialNames = [...actual.keys()].filter(
        (name) => name === 'authorization' || name === 'x-api-key'
      );
      expect(credentialNames).toEqual([expectedHeader]);
      expect(actual.get('accept')).toBe('application/json');
      expect(options.redirect).toBe('error');
    }
  );

  it.each([true, false])(
    'rejects an unsupported selector before transport, configured key present: %s',
    async (hasKey) => {
      await expect(
        request(
          {},
          {
            apiKey: hasKey ? KEY : undefined,
            apiKeyAuth: 'invalid-mode' as ConnectionConfig['apiKeyAuth'],
          }
        )
      ).rejects.toThrow('Unsupported REST authentication mode');
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it.each(['aUtHoRiZaTiOn', 'X-aPi-KeY'])(
    'ordinary %s headers also reject redirects without a configured key',
    async (header) => {
      const value =
        header.toLowerCase() === 'authorization'
          ? 'Bearer synthetic-header-token'
          : 'synthetic-header-api-key';
      await request({ headers: { [header]: value }, redirect: 'follow' });

      const options = capturedOptions();
      expect(new Headers(options.headers).get(header)).toBe(value);
      expect(options.redirect).toBe('error');
    }
  );

  it.each([undefined, 'follow', 'manual', 'error'] as const)(
    'preserves noncredential redirect policy %s',
    async (redirect) => {
      await request({ headers: { Accept: 'application/json' }, redirect });
      const options = capturedOptions();
      const headers = new Headers(options.headers);
      expect(headers.has('authorization')).toBe(false);
      expect(headers.has('x-api-key')).toBe(false);
      expect(options.redirect).toBe(redirect);
    }
  );
});
