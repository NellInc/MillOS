import { defineMessages, translate, type MessageParams } from '../i18n';

const catalog = defineMessages({
  en: {
    m0: 'Ordinary harvest',
    m1: 'Bountiful harvest',
    m2: 'Hot, dry harvest',
    m3: 'Wet harvest',
    m4: 'Sprouted harvest',
  },
  'pt-BR': {
    m0: 'Colheita normal',
    m1: 'Colheita abundante',
    m2: 'Colheita quente e seca',
    m3: 'Colheita úmida',
    m4: 'Colheita com grãos germinados',
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
