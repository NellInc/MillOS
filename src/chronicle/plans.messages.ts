import { defineMessages, translate, type MessageParams } from '../i18n';

const catalog = defineMessages({
  en: {
    m0: 'Village mill',
    m1: 'Cooperative mill',
    m2: 'District mill',
    m3: 'Regional mill',
    m4: 'Federated cooperative',
    m5: 'Grain moisture meters',
    m6: 'Spare-parts store',
    m7: 'Yard drainage works',
    m8: 'Members library',
    m9: 'Grain dryer',
    m10: 'Vibration monitoring',
    m11: 'Aspiration upgrade',
    m12: 'Standby generator',
    m13: 'Blending bins',
    m14: 'Plansifter retrofit',
    m15: 'Haulage agreement',
    m16: 'Wind turbine',
    m17: 'Roll regrinding shop',
    m18: 'Heat recovery',
    m19: 'Federated purchasing',
    m20: 'Solar canopy',
  },
  'pt-BR': {
    m0: 'Moinho da vila',
    m1: 'Moinho cooperativo',
    m2: 'Moinho distrital',
    m3: 'Moinho regional',
    m4: 'Cooperativa federada',
    m5: 'Medidores de umidade dos grãos',
    m6: 'Estoque de peças de reposição',
    m7: 'Drenagem do pátio',
    m8: 'Biblioteca dos cooperados',
    m9: 'Secador de grãos',
    m10: 'Monitoramento de vibração',
    m11: 'Modernização da aspiração',
    m12: 'Gerador de reserva',
    m13: 'Silos de mistura',
    m14: 'Modernização do plansifter',
    m15: 'Acordo de transporte',
    m16: 'Turbina eólica',
    m17: 'Oficina de retífica de rolos',
    m18: 'Recuperação de calor',
    m19: 'Compras federadas',
    m20: 'Cobertura solar',
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
