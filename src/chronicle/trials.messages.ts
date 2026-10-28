import { defineMessages, translate, type MessageParams } from '../i18n';

const catalog = defineMessages({
  en: {
    m0: 'The Wet Harvest',
    m1: 'The growers brought the harvest in wet. Dispatch 6,000 kg with no quality failure while the damp grain runs through the mill.',
    m2: 'Half the window has gone. The bakers are asking whether the flour will hold.',
    m3: 'The Inspection',
    m4: 'The county food-standards office will audit three consecutive shift closes: a passed QC test in each, no quality failure and no unresolved high-severity incident.',
    m5: 'The auditors are halfway through their file. Every shift close is being read.',
    m6: 'The Bakers’ Rush',
    m7: 'Every bakery in the valley wants flour at once. Dispatch 12,000 kg before the rush passes.',
    m8: 'Halfway through the rush. The bakeries are counting the sacks.',
    m9: 'Grid Winter',
    m10: 'Power is short across the region this winter. Dispatch 8,000 kg at an energy cost of no more than 0.08 per kg.',
    m11: 'Half the winter window has gone. The network operator is watching peak demand.',
    m12: 'The Great Programme',
    m13: 'The federation asks the mill to feed the whole valley through the months of works. Dispatch 20,000 kg with no quality failure.',
    m14: 'The programme is half done. The federation asks for a progress report.',
    m15: '{kg} kg failed its recipe quality threshold.',
    m16: '{done} of {total} consecutive clean shift closes.',
    m17: '{done} of {total} kg dispatched.',
    m18: 'Energy {actual} per kg against {target}.',
    m19: 'Average grade points {actual} against {target}.',
    m20: 'no quality failure',
    m21: 'energy at most {target} per kg',
    m22: 'average grade {grade} or better',
    m23: '{closes} clean shift closes in a row within {shifts} shifts',
    m24: 'dispatch {kg} kg in {shifts} shifts{conditions}',
  },
  'pt-BR': {
    m0: 'A colheita úmida',
    m1: 'Os produtores trouxeram a colheita úmida. Expeça 6.000 kg sem falha de qualidade enquanto os grãos úmidos passam pelo moinho.',
    m2: 'Metade do prazo já passou. Os padeiros perguntam se a farinha manterá a qualidade.',
    m3: 'A inspeção',
    m4: 'O órgão local de controle de alimentos auditará três fechamentos de turno consecutivos: um teste de CQ aprovado em cada um, nenhuma falha de qualidade e nenhuma ocorrência de alta gravidade sem solução.',
    m5: 'Os auditores chegaram à metade da análise. Cada fechamento de turno está sendo examinado.',
    m6: 'A corrida das padarias',
    m7: 'Todas as padarias do vale querem farinha ao mesmo tempo. Expeça 12.000 kg antes que a procura diminua.',
    m8: 'A corrida chegou à metade. As padarias estão contando os sacos.',
    m9: 'Inverno na rede elétrica',
    m10: 'Falta energia em toda a região neste inverno. Expeça 8.000 kg com custo de energia de até 0,08 por kg.',
    m11: 'Metade do prazo de inverno já passou. A operadora da rede está de olho na demanda de pico.',
    m12: 'O grande programa',
    m13: 'A federação pede que o moinho abasteça todo o vale durante os meses de obras. Expeça 20.000 kg sem falha de qualidade.',
    m14: 'O programa chegou à metade. A federação pede um relatório de progresso.',
    m15: '{kg} kg ficaram abaixo do limite de qualidade da receita.',
    m16: '{done} de {total} fechamentos de turno consecutivos sem falhas.',
    m17: '{done} de {total} kg expedidos.',
    m18: 'Energia: {actual} por kg para uma meta de {target}.',
    m19: 'Pontuação média da nota: {actual} para uma meta de {target}.',
    m20: 'sem falha de qualidade',
    m21: 'energia de até {target} por kg',
    m22: 'nota média {grade} ou melhor',
    m23: '{closes} fechamentos de turno seguidos sem falhas em até {shifts} turnos',
    m24: 'expedir {kg} kg em {shifts} turnos{conditions}',
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
