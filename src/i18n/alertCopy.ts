/**
 * Keyed copy for bell notices, so a notice reads in the language active now
 * rather than the one it was filed in (the physical session also restores the
 * bell, so stored text would outlive a reload and a language switch).
 *
 * A producer registers its catalogue once, at module load, and files
 * `copy: { catalog, title, message, params }` beside the stored text. The bell
 * renders through alertText(); a notice without keys, an unknown catalogue or a
 * missing key keeps its stored text. Registration, not a central import list,
 * so no module has to import every producer's catalogue.
 */
import { translate } from './index';
import type { AlertData } from '../types';

type AnyCatalog = Parameters<typeof translate>[0];

const catalogs = new Map<string, AnyCatalog>();

/** Make a catalogue available to bell notices filed with `copy.catalog === id`. */
export function registerAlertCatalog(id: string, catalog: unknown): void {
  catalogs.set(id, catalog as AnyCatalog);
}

const word = (
  catalog: AnyCatalog,
  key: string,
  params: Record<string, string | number> | undefined,
  fallback: string
): string => {
  try {
    const text = (translate as (c: AnyCatalog, k: string, p?: unknown) => string)(
      catalog,
      key,
      params
    );
    // translate() answers a missing key with the key itself.
    return typeof text === 'string' && text.length > 0 && text !== key ? text : fallback;
  } catch {
    return fallback;
  }
};

/** A notice's title and message in the language active now. */
export function alertText(alert: Pick<AlertData, 'title' | 'message' | 'copy'>): {
  title: string;
  message: string;
} {
  const copy = alert.copy;
  const catalog = copy ? catalogs.get(copy.catalog) : undefined;
  if (!copy || !catalog) return { title: alert.title, message: alert.message };
  return {
    title: word(catalog, copy.title, copy.params, alert.title),
    message: word(catalog, copy.message, copy.params, alert.message),
  };
}

/** One keyed line: a PA caption, or any other single line filed with its key. */
export interface KeyedLine {
  catalog: string;
  key: string;
  params?: Record<string, string | number>;
}

/**
 * A keyed line in the language active now, from a catalogue registered with
 * registerAlertCatalog; the stored text when it has no keys or they no longer
 * resolve.
 */
export function keyedText(copy: KeyedLine | undefined, fallback: string): string {
  // A fallback that is the key itself was stored from a translate miss; it is
  // never shown as text.
  const safeFallback = copy && fallback.trim() === copy.key ? '' : fallback;
  const catalog = copy ? catalogs.get(copy.catalog) : undefined;
  if (!copy || !catalog) return safeFallback;
  return word(catalog, copy.key, copy.params, safeFallback);
}

/** A persisted keyed line, or undefined when the stored shape is not one. */
export function sanitizeKeyedLine(value: unknown): KeyedLine | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const entry = value as Record<string, unknown>;
  if (typeof entry.catalog !== 'string' || typeof entry.key !== 'string') return undefined;
  let params: Record<string, string | number> | undefined;
  if (entry.params && typeof entry.params === 'object') {
    params = {};
    for (const [name, param] of Object.entries(entry.params as Record<string, unknown>)) {
      if (typeof param === 'string' || (typeof param === 'number' && Number.isFinite(param))) {
        params[name] = param;
      }
    }
  }
  return { catalog: entry.catalog, key: entry.key, ...(params ? { params } : {}) };
}
