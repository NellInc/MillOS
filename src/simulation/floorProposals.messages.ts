import { defineMessages, formatFixed } from '../i18n';
import { askWindow } from './partnerProposals.messages';

/**
 * Copy for the intake and incident proposals (plan items 3.1, 3.5): option
 * labels, the card's reason and subject, the lot's readings, and the bell.
 * Bell notices are kept with raw parameters and format here, per language.
 * Incident titles are the campaign's own (incidentText.ts): the runtime words
 * them from the kind kept on the bell, in the language active when it renders
 * (incidentRuntime.ts); `title` here is that worded title.
 */
type IntakeBell = { fallingNumber: number; moisture: number; option: string; window?: number };
type IncidentBell = { title: string; option: string; window?: number };
type DecidedIntakeBell = { option: string; fallingNumber: number };
type DecidedIncidentBell = { title: string; option: string };

const OPTIONS = {
  en: {
    // The card words 'accept' with the shared label; the bell uses this, the same words.
    accept: 'Accept now',
    blend: 'Blend',
    refuse: 'Refuse the lot',
    isolate: 'Isolate the mill',
    cover: 'Cover with the other mills',
    'run-on': 'Run on at pressure',
    'change-filter': 'Change the filter',
    shed: 'Shed load',
    ride: 'Ride through',
    wait: 'Wait for the truck',
    relief: 'Hire relief',
    'test-first': 'Test first',
    recall: 'Recall now',
    slow: 'Pack slower',
    reroute: 'Reroute packing',
    'slow-line': 'Slow the line',
    'keep-milling': 'Keep milling',
    manual: 'Manual control',
  },
  'pt-BR': {
    accept: 'Aceitar agora',
    blend: 'Misturar',
    refuse: 'Recusar o lote',
    isolate: 'Isolar o moinho',
    cover: 'Cobrir com os outros moinhos',
    'run-on': 'Seguir com a pressão alta',
    'change-filter': 'Trocar o filtro',
    shed: 'Cortar carga',
    ride: 'Atravessar a queda',
    wait: 'Esperar o caminhão',
    relief: 'Contratar substituto',
    'test-first': 'Testar primeiro',
    recall: 'Recolher agora',
    slow: 'Embalar mais devagar',
    reroute: 'Desviar a embalagem',
    'slow-line': 'Reduzir a linha',
    'keep-milling': 'Seguir moendo',
    manual: 'Controle manual',
  },
} as const;

export const FLOOR_OPTION_IDS = Object.keys(OPTIONS.en) as (keyof typeof OPTIONS.en)[];

export const floorProposalMessages = defineMessages({
  en: {
    ...OPTIONS.en,
    kindIntake: 'Grain intake',
    kindIncident: 'Incident',
    reasonIntake:
      'A wheat lot is at the intake: falling number {fallingNumber} s, moisture {moisture}%, protein {protein}%.',
    subjectIntake: 'the lot at the intake',
    siloReadings: 'Falling number {fallingNumber} s · moisture {moisture}%',
    bellIntakeProposed: (p: IntakeBell) =>
      `A wheat lot is at the intake: falling number ${formatFixed(p.fallingNumber, 0, 'en')} s, moisture ${formatFixed(p.moisture, 1, 'en')}%. Partner: ${OPTIONS.en[p.option as keyof typeof OPTIONS.en] ?? p.option}.${askWindow('en', p.window)}`,
    bellIncidentProposed: (p: IncidentBell) =>
      `${p.title}. Partner: ${OPTIONS.en[p.option as keyof typeof OPTIONS.en] ?? p.option}.${askWindow('en', p.window)}`,
    bellIntakeDecided: (p: DecidedIntakeBell) =>
      `Lot at falling number ${formatFixed(p.fallingNumber, 0, 'en')} s. The partner chose: ${OPTIONS.en[p.option as keyof typeof OPTIONS.en] ?? p.option}.`,
    bellIntakeRefused: (p: DecidedIntakeBell) =>
      `Lot at falling number ${formatFixed(p.fallingNumber, 0, 'en')} s. The partner's answer could not run: ${OPTIONS.en[p.option as keyof typeof OPTIONS.en] ?? p.option}.`,
    bellIncidentDecided: (p: DecidedIncidentBell) =>
      `${p.title}. The partner chose: ${OPTIONS.en[p.option as keyof typeof OPTIONS.en] ?? p.option}.`,
    bellRefused: (p: DecidedIncidentBell) =>
      `${p.title}. The partner's answer could not run: ${OPTIONS.en[p.option as keyof typeof OPTIONS.en] ?? p.option}.`,
  },
  'pt-BR': {
    ...OPTIONS['pt-BR'],
    kindIntake: 'Recebimento de grãos',
    kindIncident: 'Ocorrência',
    reasonIntake:
      'Um lote de trigo está no recebimento: número de queda {fallingNumber} s, umidade {moisture}%, proteína {protein}%.',
    subjectIntake: 'o lote no recebimento',
    siloReadings: 'Número de queda {fallingNumber} s · umidade {moisture}%',
    bellIntakeProposed: (p: IntakeBell) =>
      `Um lote de trigo está no recebimento: número de queda ${formatFixed(p.fallingNumber, 0, 'pt-BR')} s, umidade ${formatFixed(p.moisture, 1, 'pt-BR')}%. Parceiro: ${OPTIONS['pt-BR'][p.option as keyof typeof OPTIONS.en] ?? p.option}.${askWindow('pt-BR', p.window)}`,
    bellIncidentProposed: (p: IncidentBell) =>
      `${p.title}. Parceiro: ${OPTIONS['pt-BR'][p.option as keyof typeof OPTIONS.en] ?? p.option}.${askWindow('pt-BR', p.window)}`,
    bellIntakeDecided: (p: DecidedIntakeBell) =>
      `Lote com número de queda ${formatFixed(p.fallingNumber, 0, 'pt-BR')} s. O parceiro escolheu: ${OPTIONS['pt-BR'][p.option as keyof typeof OPTIONS.en] ?? p.option}.`,
    bellIntakeRefused: (p: DecidedIntakeBell) =>
      `Lote com número de queda ${formatFixed(p.fallingNumber, 0, 'pt-BR')} s. A resposta do parceiro não pôde ser executada: ${OPTIONS['pt-BR'][p.option as keyof typeof OPTIONS.en] ?? p.option}.`,
    bellIncidentDecided: (p: DecidedIncidentBell) =>
      `${p.title}. O parceiro escolheu: ${OPTIONS['pt-BR'][p.option as keyof typeof OPTIONS.en] ?? p.option}.`,
    bellRefused: (p: DecidedIncidentBell) =>
      `${p.title}. A resposta do parceiro não pôde ser executada: ${OPTIONS['pt-BR'][p.option as keyof typeof OPTIONS.en] ?? p.option}.`,
  },
});
