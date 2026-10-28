import { defineMessages, translate, type MessageParams } from '../i18n';

const catalog = defineMessages({
  en: {
    m0: 'Works',
    m1: 'Trade',
    m2: 'Council',
  },
  'pt-BR': {
    m0: 'Obras',
    m1: 'Comércio',
    m2: 'Conselho',
  },
});
const keys = new Map<string, keyof typeof catalog.en>(
  Object.entries(catalog.en).map(([key, value]) => [value, key as keyof typeof catalog.en])
);
/** Resolve authored copy when read; canonical definitions remain English. */
export function copy(text: string, params?: MessageParams): string {
  const key = keys.get(text);
  return key === undefined ? text : translate(catalog, key, params);
}
