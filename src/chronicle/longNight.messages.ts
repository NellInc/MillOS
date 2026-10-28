import { defineMessages, translate, type MessageParams } from '../i18n';

const catalog = defineMessages({
  en: {
    m0: 'The intake and grain stores',
    m1: 'the intake and grain stores',
    m2: 'them',
    m3: 'The roller floor',
    m4: 'the roller floor',
    m5: 'it',
    m6: '{plans} installed',
    m7: ' or ',
    m8: '{party} warm',
  },
  'pt-BR': {
    m0: 'O recebimento e os armazéns de grãos',
    m1: 'o recebimento e os armazéns de grãos',
    m2: 'eles',
    m3: 'O piso dos moinhos de rolos',
    m4: 'o piso dos moinhos de rolos',
    m5: 'ele',
    m6: '{plans}: instalado',
    m7: ' ou ',
    m8: '{party}: relação receptiva',
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
