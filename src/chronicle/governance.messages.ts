import { defineMessages } from '../i18n';
import type {
  BriefId,
  CrewRoleId,
  PolicyLadder,
  StandingConditionId,
  StakeholderId,
  Temperament,
} from './types';

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

/*
 * The tables below follow the same rule: the English is read from the
 * definition in governance.ts, so it cannot drift, and only the Portuguese is
 * written here. A `{n0}`, `{n1}` ... slot is the English text's first, second
 * ... number, in order, formatted for the reader (governance.test.ts pins the
 * slot count to the English).
 */

type RungCopy = { label: string; effectText: string };
type LadderCopy = { label: string; rungs: readonly [RungCopy, RungCopy, RungCopy] };

const portugueseLadders: Record<PolicyLadder, LadderCopy> = {
  maintenance: {
    label: 'Manutenção',
    rungs: [
      {
        label: 'Corretiva',
        effectText:
          'custo de manutenção x{n0}, desgaste x{n1}, sobrecarga da rede e acúmulo de pó +{n2} pontos',
      },
      { label: 'Preventiva', effectText: 'sem alteração' },
      {
        label: 'Preditiva',
        effectText:
          'custo de manutenção x{n0}, desgaste x{n1}, acúmulo de pó -{n2} pontos, sobrecarga da rede -{n3} pontos',
      },
    ],
  },
  intake: {
    label: 'Recebimento',
    rungs: [
      { label: 'Qualquer lote', effectText: 'produção x{n0}, qualidade -{n1}' },
      { label: 'Classificação na entrada', effectText: 'sem alteração' },
      {
        label: 'Só produtores contratados',
        effectText: 'produção x{n0}, qualidade +{n1}, produtores +{n2} a cada ano agrícola',
      },
    ],
  },
  stock: {
    label: 'Estoque',
    rungs: [
      { label: 'Enxuto', effectText: 'custo de manutenção x{n0}, obras na estrada +{n1} pontos' },
      { label: 'Estoque intermediário', effectText: 'sem alteração' },
      {
        label: 'Reserva estratégica',
        effectText:
          'custo de manutenção x{n0}, obras na estrada -{n1} pontos, frente de tempestade -{n2} pontos',
      },
    ],
  },
  orders: {
    label: 'Carteira de pedidos',
    rungs: [
      {
        label: 'Pedidos avulsos',
        effectText: 'reinvestimento +{n0}%, clientes -{n1} a cada ano agrícola',
      },
      { label: 'Mista', effectText: 'sem alteração' },
      {
        label: 'Contratos',
        effectText: 'reinvestimento -{n0}%, clientes +{n1} a cada ano agrícola',
      },
    ],
  },
};

export function ladderMessages(ladder: { id: PolicyLadder; label: string }) {
  const en = { label: ladder.label };
  const local = portugueseLadders[ladder.id];
  return defineMessages({ en, 'pt-BR': local ? { label: local.label } : en });
}

export function rungMessages(ladder: PolicyLadder, rung: number, definition: RungCopy) {
  const en = { label: definition.label, effectText: definition.effectText };
  return defineMessages({ en, 'pt-BR': portugueseLadders[ladder]?.rungs[rung] ?? en });
}

type ConditionCopy = { label: string; effectText: string; clearText: string };

const portugueseConditions: Record<StandingConditionId, ConditionCopy> = {
  'tired-machinery': {
    label: 'Maquinário desgastado',
    effectText: 'desgaste x{n0}',
    clearText: 'três melhorias instaladas',
  },
  'deferred-maintenance': {
    label: 'Manutenção adiada',
    effectText: 'a produção não pode passar de x{n0}',
    clearText: 'três turnos sem conservação de recursos',
  },
  'worn-rolls': {
    label: 'Superfícies dos rolos gastas',
    effectText: 'desgaste x{n0}, qualidade -{n1}',
    clearText:
      'a oficina de retífica de rolos instalada, ou quatro turnos fora da manutenção corretiva',
  },
  'thin-stocks': {
    label: 'Estoques baixos',
    effectText: 'a produção não pode passar de x{n0}',
    clearText: 'dois turnos com estoque intermediário ou reserva estratégica',
  },
  'behind-plan': {
    label: 'Aquém do plano',
    effectText: 'reinvestimento -{n0}%',
    clearText: 'cumprir a cota do próximo ano agrícola',
  },
  administration: {
    label: 'Sob o administrador da federação',
    effectText:
      'custo de manutenção x{n0}, políticas bloqueadas, o parceiro de IA age no nível Previsões ou acima',
    clearText: 'o administrador vai embora após quatro turnos',
  },
};

export function conditionMessages(condition: { id: StandingConditionId } & ConditionCopy) {
  const en = {
    label: condition.label,
    effectText: condition.effectText,
    clearText: condition.clearText,
  };
  return defineMessages({ en, 'pt-BR': portugueseConditions[condition.id] ?? en });
}

type TemperamentCopy = { label: string; rule: string };

/** Neutral words, so an anonymous role is never given a gender. */
const portugueseTemperaments: Record<Temperament, TemperamentCopy> = {
  cautious: {
    label: 'Prudente',
    rule: 'vota contra levar ao extremo uma política que não lhe diga respeito',
  },
  eager: { label: 'Entusiasta', rule: 'vota a favor de uma mudança que não lhe diga respeito' },
  even: {
    label: 'Imparcial',
    rule: 'abstém-se na votação de uma mudança que não lhe diga respeito',
  },
};

export function temperamentMessages(id: Temperament, temperament: TemperamentCopy) {
  const en = { label: temperament.label, rule: temperament.rule };
  return defineMessages({ en, 'pt-BR': portugueseTemperaments[id] ?? en });
}

type CrewCopy = { role: string; value: string; need: string; concession: string };

/**
 * Keyed `role:profile`, the profile being the index in CREW_PROFILES. Needs
 * never open with a definite article, so "a necessidade de {need}" reads
 * without a contraction.
 */
const portugueseCrew: Record<`${CrewRoleId}:${0 | 1}`, CrewCopy> = {
  'head-miller:0': {
    role: 'Chefe de moagem',
    value: 'um moinho que funcione do mesmo jeito todos os dias',
    need: 'tempo para regular os rolos como se deve',
    concession: 'custear um turno semanal de regulagem dos rolos',
  },
  'head-miller:1': {
    role: 'Chefe de moagem',
    value: 'uma farinha em que os padeiros possam confiar',
    need: 'grão de procedência garantida',
    concession: 'pagar uma segunda análise no recebimento',
  },
  'roll-fitter:0': {
    role: 'Ajustador de rolos',
    value: 'fazer o serviço uma vez só, e bem feito',
    need: 'peças de reposição para consertar as coisas antes que quebrem',
    concession: 'montar uma prateleira de peças de reposição',
  },
  'roll-fitter:1': {
    role: 'Ajustador de rolos',
    value: 'máquinas que durem',
    need: 'peças na prateleira',
    concession: 'manter um estoque de peças de reposição',
  },
  'intake-grader:0': {
    role: 'Classificador de grãos',
    value: 'um trato justo com os produtores',
    need: 'um padrão de classificação que os produtores conheçam com antecedência',
    concession: 'publicar a tabela de classificação',
  },
  'intake-grader:1': {
    role: 'Classificador de grãos',
    value: 'a cooperativa dos produtores',
    need: 'contratos com que os produtores possam planejar uma safra inteira',
    concession: 'garantir o preço futuro dos produtores',
  },
  'lab:0': {
    role: 'Técnico de laboratório',
    value: 'resultados registrados',
    need: 'tempo para analisar cada lote',
    concession: 'montar uma segunda bancada no laboratório',
  },
  'lab:1': {
    role: 'Técnico de laboratório',
    value: 'registros em ordem',
    need: 'um histórico de manutenção registrado',
    concession: 'pagar um auxiliar para manter o registro de manutenção',
  },
  'packing:0': {
    role: 'Líder de ensaque',
    value: 'os pedidos dos clientes saindo no prazo',
    need: 'estoque ensacado para cobrir um caminhão atrasado',
    concession: 'alugar espaço extra para paletes',
  },
  'packing:1': {
    role: 'Líder de ensaque',
    value: 'turnos que possam ser planejados',
    need: 'uma escala de ensaque que se mantenha durante a semana',
    concession: 'fechar a escala de ensaque com uma semana de antecedência',
  },
  'yard:0': {
    role: 'Auxiliar de pátio',
    value: 'um pátio sempre em movimento',
    need: 'espaço para manobrar uma empilhadeira',
    concession: 'demarcar uma segunda faixa de manobra',
  },
  'yard:1': {
    role: 'Auxiliar de pátio',
    value: 'os pequenos compradores do vale',
    need: 'trabalho para os pequenos compradores do vale',
    concession: 'manter um balcão aberto para pequenos compradores',
  },
};

export function crewMessages(id: CrewRoleId, profile: 0 | 1, member: CrewCopy) {
  const en = {
    role: member.role,
    value: member.value,
    need: member.need,
    concession: member.concession,
  };
  return defineMessages({ en, 'pt-BR': portugueseCrew[`${id}:${profile}`] ?? en });
}

/** Keyed by `redLineKey`. */
const portugueseRedLines: Record<string, string> = {
  'growers:intake:0': 'comprar qualquer lote enfraquece o acordo de preços da cooperativa',
  'village:stock:0': 'a padaria da vila depende do estoque de inverno do moinho',
  'federation:orders:0':
    'os contratos da federação dependem do fornecimento contratado de seus membros',
};

export function redLineMessages(key: string, line: { party: StakeholderId; reason: string }) {
  const en = { reason: line.reason };
  const local = portugueseRedLines[key];
  return defineMessages({ en, 'pt-BR': local === undefined ? en : { reason: local } });
}
