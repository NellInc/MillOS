import { defineMessages, translate, type MessageParams } from '../i18n';

const catalog = defineMessages({
  en: {
    m0: 'Advise',
    m1: 'recommendations only',
    m2: 'Routine',
    m3: 'answers routine events, spending know-how where the recommended answer asks for it',
    m4: 'Forecasts',
    m5: 'also mitigates forecasts within 15% of the fund a shift, restores mitigated incidents, and pays to suppress a duct fire',
    m6: 'Plans',
    m7: 'also starts planned installs, keeping 3 shifts of upkeep',
  },
  'pt-BR': {
    m0: 'Recomendar',
    m1: 'somente recomendações',
    m2: 'Rotina',
    m3: 'responde a eventos rotineiros, gastando conhecimento prático quando a resposta recomendada o pede',
    m4: 'Previsões',
    m5: 'também mitiga previsões usando até 15% do fundo por turno, restabelece áreas afetadas após a mitigação e paga o combate a um incêndio no duto',
    m6: 'Planos',
    m7: 'também inicia instalações planejadas, reservando 3 turnos de manutenção',
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
