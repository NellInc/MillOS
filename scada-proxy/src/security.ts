import { timingSafeEqual } from 'node:crypto';

export function safeKeyEqual(
  provided: string | undefined | null,
  expected: string | undefined
): boolean {
  if (!provided || !expected) return false;
  const providedBytes = Buffer.from(provided);
  const expectedBytes = Buffer.from(expected);
  return (
    providedBytes.length === expectedBytes.length && timingSafeEqual(providedBytes, expectedBytes)
  );
}

export function parseBoundedInteger(
  raw: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`Expected an integer from ${minimum} to ${maximum}, received "${raw}"`);
  }
  return parsed;
}

export function parseBooleanFlag(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw.trim() === '') return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new Error(`Expected "true" or "false", received "${raw}"`);
}

export function parseAllowedOrigins(raw: string | undefined, defaults: string[]): string[] {
  const values = [...defaults, ...(raw?.split(',') ?? [])]
    .map((origin) => origin.trim())
    .filter(Boolean);

  const unique = new Set<string>();
  for (const origin of values) {
    if (origin === '*') {
      throw new Error('ALLOWED_ORIGINS cannot contain * when credentialed requests are enabled');
    }
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error(`Invalid allowed origin: ${origin}`);
    }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) {
      throw new Error(`Allowed origin must be an exact HTTP(S) origin: ${origin}`);
    }
    unique.add(origin);
  }
  return [...unique];
}

export function isOriginAllowed(
  origin: string | undefined,
  allowedOrigins: readonly string[],
  requireOrigin: boolean
): boolean {
  if (!origin) return !requireOrigin;
  return allowedOrigins.includes(origin);
}

export function decodeWebSocketKeyProtocol(protocolHeader: string | undefined): string | null {
  const encoded = protocolHeader
    ?.split(',')
    .map((protocol) => protocol.trim())
    .find((protocol) => protocol.startsWith('millos-scada-key.'))
    ?.slice('millos-scada-key.'.length);
  if (!encoded) return null;

  try {
    const decoded = Buffer.from(encoded, 'base64url').toString('utf8');
    return decoded.length > 0 ? decoded : null;
  } catch {
    return null;
  }
}
