import { defineMessages, formatFixed, formatGrouped } from '../i18n';

/**
 * The partner's proposals: card copy, the bell's notices and the record's
 * lines. Card and record numbers arrive formatted by the caller; the bell's
 * notices are kept (and restored) with raw parameters, so they format here,
 * in each language. Machine designations are never translated.
 */
type ProgrammeBell = { number: number; kg: number };
type ServiceBell = { machine: string; minutes: number };
type MachineBell = { machine: string };
type NumberBell = { number: number };
type DispatchBell = { customer: string; minimum: number };
type CustomerBell = { customer: string };
type CommitmentBell = { number: number; kg: number; late: number };
type ForfeitBell = { customer: string; minimum: number; best: number };
/**
 * What the other answer would have cost, said by a "decide and tell me" bell:
 * its option, and its money, kilograms and minutes (any may be 0).
 */
type OtherBell = { other: string; money: number; kg: number; minutes: number };
/** A "decide and tell me" bell: what the partner did (`decided`, a bell key above) and the other answer's cost. */
type DecidedBell = OtherBell & { decided: string } & Record<string, string | number>;

/** The decided line in a language, by its own key; empty when this build has no such key. */
const decidedLine = (locale: 'en' | 'pt-BR', p: DecidedBell): string => {
  const line = (partnerProposalMessages[locale] as unknown as Record<string, unknown>)[p.decided];
  return typeof line === 'function' ? (line as (params: unknown) => string)(p) : '';
};

/** An asked bell: what is asked (`asked`, a bell key above) and its window in game minutes. */
type AskedBell = { asked: string; window: number } & Record<string, string | number>;

/**
 * How long the player has to answer an asked card, in game minutes, as one
 * sentence; empty without a window (a bell saved before it was carried).
 */
export const askWindow = (locale: 'en' | 'pt-BR', window: unknown): string => {
  if (typeof window !== 'number' || !Number.isFinite(window) || window <= 0) return '';
  const minutes = formatFixed(Math.ceil(window), 0, locale);
  return locale === 'en'
    ? ` You have ${minutes} min to answer.`
    : ` Você tem ${minutes} min para responder.`;
};

const askedLine = (locale: 'en' | 'pt-BR', p: AskedBell): string => {
  const line = (partnerProposalMessages[locale] as unknown as Record<string, unknown>)[p.asked];
  const asked = typeof line === 'function' ? (line as (params: unknown) => string)(p) : '';
  return `${asked}${askWindow(locale, p.window)}`.trim();
};

const OPTION_WORDS: Record<'en' | 'pt-BR', Record<string, string>> = {
  en: {
    accept: 'Accepting now',
    hold: 'Holding',
    service: 'Servicing now',
    quiet: 'Servicing at the quiet spell',
    'run-on': 'Running on',
    send: 'Sending now',
    take: 'Taking it now',
    wait: 'Waiting',
    forfeit: 'Forfeiting now',
    keep: 'Keeping it open',
  },
  'pt-BR': {
    accept: 'Aceitar agora',
    hold: 'Segurar',
    service: 'Fazer manutenção agora',
    quiet: 'Fazer manutenção na próxima pausa',
    'run-on': 'Seguir rodando',
    send: 'Despachar agora',
    take: 'Aceitar já',
    wait: 'Esperar',
    forfeit: 'Abrir mão agora',
    keep: 'Manter aberto',
  },
};
const otherCost = (locale: 'en' | 'pt-BR', p: OtherBell): string => {
  const parts: string[] = [];
  if (p.money > 0) parts.push(`£${formatGrouped(Math.round(p.money), undefined, locale)}`);
  if (p.kg > 0) parts.push(`${formatGrouped(Math.round(p.kg), undefined, locale)} kg`);
  if (p.minutes > 0)
    parts.push(locale === 'en' ? enTime(Math.round(p.minutes)) : ptTime(Math.round(p.minutes)));
  const word = OPTION_WORDS[locale][p.other] ?? p.other;
  if (locale === 'en')
    return parts.length > 0 ? `${word} would cost ${parts.join(' · ')}.` : `${word} costs nothing.`;
  return parts.length > 0 ? `${word} custaria ${parts.join(' · ')}.` : `${word} não custa nada.`;
};

const enTime = (minutes: number) =>
  minutes < 120
    ? `${formatFixed(minutes, 0, 'en')} min`
    : `${formatFixed(minutes / 60, 1, 'en')} h`;
const ptTime = (minutes: number) =>
  minutes < 120
    ? `${formatFixed(minutes, 0, 'pt-BR')} min`
    : `${formatFixed(minutes / 60, 1, 'pt-BR')} h`;

export const partnerProposalMessages = defineMessages({
  en: {
    kindProgramme: 'Next programme',
    kindService: 'Unit service',
    kindDispatch: 'Truck at the dock',
    reasonDispatch: '{kg} kg of tested flour is under the {customer} minimum of {minimum}.',
    optionSend: 'Send now',
    reasonProgramme: 'Programme {number} is offered: {kg} kg for three customers.',
    reasonService: '{machine} is worn and will fail in about {time}.',
    reasonServiceAgain: 'A part has arrived. {machine} will fail in about {time}.',
    reasonServiceAfterStop: 'The stop has cleared. {machine} will fail in about {time}.',
    optionAccept: 'Accept now',
    optionHold: 'Hold',
    optionService: 'Service now',
    optionQuiet: 'Service at the quiet spell',
    optionRunOn: 'Run on',
    offline: '{time} offline',
    waitFor: 'starts in {time}',
    belowMinimums: 'below {minimums}',
    partnerChoice: "Partner's choice",
    timeLeft: '{minutes} min',
    minutes: '{minutes} min',
    hours: '{hours} h',
    money: '£{amount}',
    kg: '{kg} kg',
    part: '{count} × {part}',
    belowSpec: 'below spec',
    nothing: 'nothing',
    lateOne: '1 order late by {time}',
    lateMany: '{count} orders late by {time}',
    riskOne: '1 order at risk of lateness',
    riskMany: '{count} orders at risk of lateness',
    noneLate: 'none late',
    gradeAtBest: 'shift grade {grade} at best',
    heldNoPart: 'no spare part: waits for a parts delivery',
    truckDelay: '{chance}% chance the next grain truck is {time} late',
    net: 'net {amount}',
    delegationAsk: 'Ask me',
    delegationDecide: 'Decide and tell me',
    proposalsHeading: 'Proposals',
    bellProposalTitle: 'Partner proposal',
    bellDecidedTitle: 'Partner decided',
    bellProgrammeProposed: (p: ProgrammeBell) =>
      `Programme ${formatFixed(p.number, 0, 'en')} is offered: ${formatGrouped(p.kg, undefined, 'en')} kg. Partner: accept now.`,
    bellServiceProposed: (p: ServiceBell) =>
      `${p.machine} is worn and will fail in about ${enTime(p.minutes)}. Partner: service now.`,
    bellServiceProposedAgain: (p: ServiceBell) =>
      `A part has arrived. ${p.machine} will fail in about ${enTime(p.minutes)}. Partner: service now.`,
    bellServiceProposedAfterStop: (p: ServiceBell) =>
      `The stop has cleared. ${p.machine} will fail in about ${enTime(p.minutes)}. Partner: service now.`,
    bellProgrammeDecided: (p: NumberBell) =>
      `The partner accepted programme ${formatFixed(p.number, 0, 'en')}.`,
    bellServiceDecided: (p: MachineBell) => `The partner took ${p.machine} offline for service.`,
    bellProgrammeRefused: (p: NumberBell) =>
      `The partner could not accept programme ${formatFixed(p.number, 0, 'en')}.`,
    bellServiceRefused: (p: MachineBell) => `The partner could not service ${p.machine}.`,
    bellDispatchProposed: (p: DispatchBell) =>
      `Flour under the ${p.customer} minimum of ${formatFixed(p.minimum, 0, 'en')} is at the dock. Partner: send it to another order.`,
    bellDispatchDecided: (p: CustomerBell) =>
      `The partner sent the truck. ${p.customer} waits for the next one.`,
    kindCommitment: 'Next programme early',
    optionTake: 'Take it now',
    optionWait: 'Wait',
    reasonCommitment: 'Programme {number} can be taken now, beside the one running: {kg} kg.',
    subjectCommitment: 'programme {number} early',
    bellCommitmentProposed: (p: CommitmentBell) =>
      p.late > 0
        ? `Programme ${formatFixed(p.number, 0, 'en')} can be taken now: ${formatGrouped(p.kg, undefined, 'en')} kg, about ${enTime(Math.round(p.late))} late in all. Partner: wait.`
        : `Programme ${formatFixed(p.number, 0, 'en')} can be taken now: ${formatGrouped(p.kg, undefined, 'en')} kg, all on time. Partner: wait.`,
    bellCommitmentTaken: (p: NumberBell) =>
      `The partner took programme ${formatFixed(p.number, 0, 'en')} beside the one running.`,
    bellCommitmentWaited: (p: NumberBell) =>
      `The partner is waiting to take programme ${formatFixed(p.number, 0, 'en')} until the running one closes.`,
    bellCommitmentRefused: (p: NumberBell) =>
      `The partner could not take programme ${formatFixed(p.number, 0, 'en')} early.`,
    bellDecidedTold: (p: DecidedBell) => `${decidedLine('en', p)} ${otherCost('en', p)}`,
    bellAsked: (p: AskedBell) => askedLine('en', p),
    kindForfeit: 'Order the line cannot make',
    optionForfeit: 'Forfeit now',
    optionKeep: 'Keep it open',
    reasonForfeit:
      '{customer} is overdue, and the best the line can make is {best}, under its {minimum}.',
    subjectForfeit: 'the order for {customer}',
    bellForfeitProposed: (p: ForfeitBell) =>
      `The best the line can make is ${formatFixed(p.best, 1, 'en')}, under the ${p.customer} minimum of ${formatFixed(p.minimum, 0, 'en')}. Partner: forfeit the order now.`,
    bellForfeitDecided: (p: CustomerBell) =>
      `The partner forfeited the order for ${p.customer}, which the line cannot make.`,
    bellForfeitRefused: (p: CustomerBell) =>
      `The partner could not forfeit the order for ${p.customer}.`,
    subjectProgramme: 'programme {number}',
    subjectDispatch: 'the truck for {customer}',
    deciderPartner: 'The partner',
    deciderOperator: 'You',
    deciderAgent: 'An agent',
    recordLine:
      '{decider} chose {option} for {subject}: {chosenCost}. {other} would have cost {otherCost}.',
    recordOtherBetter: 'The other answer was better.',
    recordRefused: '{decider} chose {option} for {subject}, but it could not run.',
  },
  'pt-BR': {
    kindProgramme: 'Próximo programa',
    kindService: 'Manutenção da unidade',
    kindDispatch: 'Caminhão na doca',
    reasonDispatch: '{kg} kg de farinha testada estão abaixo do mínimo de {minimum} de {customer}.',
    optionSend: 'Despachar agora',
    reasonProgramme: 'Programa {number} oferecido: {kg} kg para três clientes.',
    reasonService: '{machine} está com desgaste e vai falhar em cerca de {time}.',
    reasonServiceAgain: 'Chegou uma peça. {machine} vai falhar em cerca de {time}.',
    reasonServiceAfterStop: 'A parada terminou. {machine} vai falhar em cerca de {time}.',
    optionAccept: 'Aceitar agora',
    optionHold: 'Segurar',
    optionService: 'Fazer manutenção agora',
    optionQuiet: 'Fazer manutenção na próxima pausa',
    optionRunOn: 'Seguir rodando',
    offline: '{time} fora de operação',
    waitFor: 'começa em {time}',
    belowMinimums: 'abaixo de {minimums}',
    partnerChoice: 'Escolha do parceiro',
    timeLeft: '{minutes} min',
    minutes: '{minutes} min',
    hours: '{hours} h',
    money: '£{amount}',
    kg: '{kg} kg',
    part: '{count} × {part}',
    belowSpec: 'abaixo da especificação',
    nothing: 'nada',
    lateOne: '1 pedido atrasado em {time}',
    lateMany: '{count} pedidos atrasados em {time}',
    riskOne: '1 pedido em risco de atraso',
    riskMany: '{count} pedidos em risco de atraso',
    noneLate: 'nenhum atrasado',
    gradeAtBest: 'nota do turno {grade} no máximo',
    heldNoPart: 'sem peça de reposição: aguarda uma entrega de peças',
    truckDelay: '{chance}% de chance de o próximo caminhão de grãos atrasar {time}',
    net: 'líquido {amount}',
    delegationAsk: 'Perguntar',
    delegationDecide: 'Decidir e avisar',
    proposalsHeading: 'Propostas',
    bellProposalTitle: 'Proposta do parceiro',
    bellDecidedTitle: 'O parceiro decidiu',
    bellProgrammeProposed: (p: ProgrammeBell) =>
      `Programa ${formatFixed(p.number, 0, 'pt-BR')} oferecido: ${formatGrouped(p.kg, undefined, 'pt-BR')} kg. Parceiro: aceitar agora.`,
    bellServiceProposed: (p: ServiceBell) =>
      `${p.machine} está com desgaste e vai falhar em cerca de ${ptTime(p.minutes)}. Parceiro: fazer manutenção agora.`,
    bellServiceProposedAgain: (p: ServiceBell) =>
      `Chegou uma peça. ${p.machine} vai falhar em cerca de ${ptTime(p.minutes)}. Parceiro: fazer manutenção agora.`,
    bellServiceProposedAfterStop: (p: ServiceBell) =>
      `A parada terminou. ${p.machine} vai falhar em cerca de ${ptTime(p.minutes)}. Parceiro: fazer manutenção agora.`,
    bellProgrammeDecided: (p: NumberBell) =>
      `O parceiro aceitou o programa ${formatFixed(p.number, 0, 'pt-BR')}.`,
    bellServiceDecided: (p: MachineBell) => `O parceiro parou ${p.machine} para manutenção.`,
    bellProgrammeRefused: (p: NumberBell) =>
      `O parceiro não conseguiu aceitar o programa ${formatFixed(p.number, 0, 'pt-BR')}.`,
    bellServiceRefused: (p: MachineBell) =>
      `O parceiro não conseguiu fazer a manutenção de ${p.machine}.`,
    bellDispatchProposed: (p: DispatchBell) =>
      `Há farinha abaixo do mínimo de ${formatFixed(p.minimum, 0, 'pt-BR')} de ${p.customer} na doca. Parceiro: enviá-la a outro pedido.`,
    bellDispatchDecided: (p: CustomerBell) =>
      `O parceiro despachou o caminhão. ${p.customer} espera o próximo.`,
    kindCommitment: 'Próximo programa antecipado',
    optionTake: 'Aceitar já',
    optionWait: 'Esperar',
    reasonCommitment: 'O programa {number} pode ser aceito já, junto ao que está rodando: {kg} kg.',
    subjectCommitment: 'o programa {number} antecipado',
    bellCommitmentProposed: (p: CommitmentBell) =>
      p.late > 0
        ? `O programa ${formatFixed(p.number, 0, 'pt-BR')} pode ser aceito já: ${formatGrouped(p.kg, undefined, 'pt-BR')} kg, cerca de ${ptTime(Math.round(p.late))} de atraso no total. Parceiro: esperar.`
        : `O programa ${formatFixed(p.number, 0, 'pt-BR')} pode ser aceito já: ${formatGrouped(p.kg, undefined, 'pt-BR')} kg, tudo no prazo. Parceiro: esperar.`,
    bellCommitmentTaken: (p: NumberBell) =>
      `O parceiro aceitou o programa ${formatFixed(p.number, 0, 'pt-BR')} junto ao que está rodando.`,
    bellCommitmentWaited: (p: NumberBell) =>
      `O parceiro vai esperar o programa atual fechar para aceitar o programa ${formatFixed(p.number, 0, 'pt-BR')}.`,
    bellCommitmentRefused: (p: NumberBell) =>
      `O parceiro não conseguiu antecipar o programa ${formatFixed(p.number, 0, 'pt-BR')}.`,
    bellDecidedTold: (p: DecidedBell) => `${decidedLine('pt-BR', p)} ${otherCost('pt-BR', p)}`,
    bellAsked: (p: AskedBell) => askedLine('pt-BR', p),
    kindForfeit: 'Pedido que a linha não consegue fazer',
    optionForfeit: 'Abrir mão agora',
    optionKeep: 'Manter aberto',
    reasonForfeit:
      'O pedido de {customer} está atrasado, e o melhor que a linha produz é {best}, abaixo do mínimo de {minimum}.',
    subjectForfeit: 'o pedido de {customer}',
    bellForfeitProposed: (p: ForfeitBell) =>
      `O melhor que a linha produz é ${formatFixed(p.best, 1, 'pt-BR')}, abaixo do mínimo de ${formatFixed(p.minimum, 0, 'pt-BR')} de ${p.customer}. Parceiro: abrir mão do pedido agora.`,
    bellForfeitDecided: (p: CustomerBell) =>
      `O parceiro abriu mão do pedido de ${p.customer}, que a linha não consegue fazer.`,
    bellForfeitRefused: (p: CustomerBell) =>
      `O parceiro não conseguiu abrir mão do pedido de ${p.customer}.`,
    subjectProgramme: 'o programa {number}',
    subjectDispatch: 'o caminhão de {customer}',
    deciderPartner: 'O parceiro',
    deciderOperator: 'Você',
    deciderAgent: 'Um agente',
    recordLine:
      '{decider} escolheu {option} para {subject}: {chosenCost}. {other} teria custado {otherCost}.',
    recordOtherBetter: 'A outra resposta era melhor.',
    recordRefused: '{decider} escolheu {option} para {subject}, mas não foi possível executar.',
  },
});
