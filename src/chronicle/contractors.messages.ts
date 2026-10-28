import { defineMessages, translate, type MessageParams } from '../i18n';

const catalog = defineMessages({
  en: {
    m0: 'Thrifty',
    m1: 'Diligent',
    m2: 'Careful',
    m3: 'Expeditious',
    m4: 'Wasteful',
    m5: 'Neglectful',
    m6: 'Reckless',
    m7: 'Passive',
    m8: '{name}: install cost {sign}{magnitude}%',
    m9: '{name}: plan effect {sign}{magnitude}%',
    m10: '{name}: snag chance {sign}{magnitude}%',
    m11: '{name}: install time {sign}{magnitude}%',
  },
  'pt-BR': {
    m0: 'Econômica',
    m1: 'Diligente',
    m2: 'Cuidadosa',
    m3: 'Ágil',
    m4: 'Desperdiçadora',
    m5: 'Negligente',
    m6: 'Imprudente',
    m7: 'Lenta',
    m8: '{name}: custo de instalação {sign}{magnitude}%',
    m9: '{name}: efeito do plano {sign}{magnitude}%',
    m10: '{name}: chance de contratempo {sign}{magnitude}%',
    m11: '{name}: prazo de instalação {sign}{magnitude}%',
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
