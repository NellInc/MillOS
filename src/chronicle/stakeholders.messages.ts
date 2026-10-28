import { defineMessages, translate, type MessageParams } from '../i18n';

const catalog = defineMessages({
  en: {
    m0: 'Growers’ cooperative',
    m1: 'the growers’ cooperative',
    m2: 'Valley Haulage',
    m3: 'Village committee',
    m4: 'the village committee',
    m5: 'Regional federation',
    m6: 'the regional federation',
    m7: 'crop treatment -25%',
    m8: 'crop treatment +25%',
    m9: 'road works -{points} points',
    m10: 'road works +{points} points',
    m11: 'storm front -{points} points',
    m12: 'reinvestment +{points}%',
  },
  'pt-BR': {
    m0: 'Cooperativa de produtores',
    m1: 'a cooperativa de produtores',
    m2: 'Valley Haulage',
    m3: 'Comitê da vila',
    m4: 'o comitê da vila',
    m5: 'Federação regional',
    m6: 'a federação regional',
    m7: 'tratamento da safra -25%',
    m8: 'tratamento da safra +25%',
    m9: 'obras na estrada -{points} pontos',
    m10: 'obras na estrada +{points} pontos',
    m11: 'frente de tempestade -{points} pontos',
    m12: 'reinvestimento +{points}%',
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
