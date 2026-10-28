import { defineMessages, translate, type MessageParams } from '../i18n';

const catalog = defineMessages({
  en: {
    m0: 'Storm front',
    m1: 'The met office expects heavy rain over the valley. Yard drainage and the stream will be loaded.',
    m2: 'Grid strain',
    m3: 'The network operator warns of low reserve margins and voltage dips at peak.',
    m4: 'Dust load building',
    m5: 'Filter differential pressure is trending up on the sifting floor extraction.',
    m6: 'Road works',
    m7: 'The county has closed a lane on the haul road. Collections may run late.',
    m8: 'Clear the drains',
    m9: 'Book demand response',
    m10: 'Pulse-clean the filters',
    m11: 'Arrange a relief haulier',
  },
  'pt-BR': {
    m0: 'Frente de tempestade',
    m1: 'O serviço meteorológico prevê chuva forte sobre o vale. A drenagem do pátio e o córrego receberão um grande volume de água.',
    m2: 'Sobrecarga da rede',
    m3: 'A operadora da rede alerta para a baixa margem de reserva e quedas de tensão no horário de pico.',
    m4: 'Acúmulo de pó',
    m5: 'A pressão diferencial dos filtros está subindo na aspiração do piso de peneiramento.',
    m6: 'Obras na estrada',
    m7: 'A administração local fechou uma faixa da estrada de transporte. As coletas podem atrasar.',
    m8: 'Limpar os drenos',
    m9: 'Contratar resposta à demanda',
    m10: 'Limpar os filtros por pulsos',
    m11: 'Contratar transporte de apoio',
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
