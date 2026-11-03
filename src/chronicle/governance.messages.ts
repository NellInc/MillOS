import { defineMessages } from '../i18n';
import type { BriefId } from './types';

type BriefCopy = { label: string; rule: string };

/** Portuguese for each brief; the English is BRIEFS' own label and rule. */
const portugueseBriefs: Record<BriefId, BriefCopy> = {
  conventional: {
    label: 'Convencional',
    rule: 'escolhe a resposta recomendada, mitiga qualquer previsão a partir de 40%, instala primeiro o plano mais barato',
  },
  standards: {
    label: 'Padrões em primeiro lugar',
    rule: 'favorece a reputação junto à certificadora e o histórico, mitiga a carga de pó a partir de 25%, instala primeiro os planos de qualidade e de pó',
  },
  thrift: {
    label: 'Economia',
    rule: 'guarda o máximo no fundo, mitiga só a partir de 55%, instala primeiro os planos que reduzem o custo de operação',
  },
  neighbour: {
    label: 'Boa vizinhança',
    rule: 'favorece os produtores, a vila e a transportadora, mitiga tempestades e obras na estrada a partir de 25%, instala primeiro os planos de drenagem e de transporte',
  },
};

/** One brief's copy, English from the definition itself so the two cannot drift. */
export function briefMessages(brief: { id: BriefId } & BriefCopy) {
  const en = { label: brief.label, rule: brief.rule };
  return defineMessages({ en, 'pt-BR': portugueseBriefs[brief.id] ?? en });
}
