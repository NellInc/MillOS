import { defineMessages, formatFixed } from '../i18n';
import { askWindow } from './partnerProposals.messages';

/**
 * Copy for the temper card (plan item 7.7): its two answers, the card's
 * reason and subject, and the bell. Bell notices keep raw parameters and
 * format here, per language.
 */
type TemperBell = { moisture: number; option: string; window?: number };

const OPTIONS = {
  en: { standard: 'Temper as it comes', 'dry-first': 'Dry first, then temper' },
  'pt-BR': {
    standard: 'Condicionar como vier',
    'dry-first': 'Secar antes de condicionar',
  },
} as const;

export const TEMPER_OPTION_LABEL_IDS = Object.keys(OPTIONS.en) as (keyof typeof OPTIONS.en)[];

export const temperProposalMessages = defineMessages({
  en: {
    ...OPTIONS.en,
    kindTemper: 'Tempering',
    reasonTemper: 'Wet wheat for the rolls: moisture {moisture}%.',
    subjectTemper: 'the shift’s wheat',
    bellTemperProposed: (p: TemperBell) =>
      `Wet wheat for the rolls, moisture ${formatFixed(p.moisture, 1, 'en')}%. Partner: ${OPTIONS.en[p.option as keyof typeof OPTIONS.en] ?? p.option}.${askWindow('en', p.window)}`,
    bellTemperDecided: (p: TemperBell) =>
      `Wet wheat, moisture ${formatFixed(p.moisture, 1, 'en')}%. The partner chose: ${OPTIONS.en[p.option as keyof typeof OPTIONS.en] ?? p.option}.`,
    bellTemperRefused: (p: TemperBell) =>
      `Wet wheat, moisture ${formatFixed(p.moisture, 1, 'en')}%. The partner's answer could not run: ${OPTIONS.en[p.option as keyof typeof OPTIONS.en] ?? p.option}.`,
  },
  'pt-BR': {
    ...OPTIONS['pt-BR'],
    kindTemper: 'Condicionamento',
    reasonTemper: 'Trigo úmido para os rolos: umidade {moisture}%.',
    subjectTemper: 'o trigo do turno',
    bellTemperProposed: (p: TemperBell) =>
      `Trigo úmido para os rolos, umidade ${formatFixed(p.moisture, 1, 'pt-BR')}%. Parceiro: ${OPTIONS['pt-BR'][p.option as keyof typeof OPTIONS.en] ?? p.option}.${askWindow('pt-BR', p.window)}`,
    bellTemperDecided: (p: TemperBell) =>
      `Trigo úmido, umidade ${formatFixed(p.moisture, 1, 'pt-BR')}%. O parceiro escolheu: ${OPTIONS['pt-BR'][p.option as keyof typeof OPTIONS.en] ?? p.option}.`,
    bellTemperRefused: (p: TemperBell) =>
      `Trigo úmido, umidade ${formatFixed(p.moisture, 1, 'pt-BR')}%. A resposta do parceiro não pôde ser executada: ${OPTIONS['pt-BR'][p.option as keyof typeof OPTIONS.en] ?? p.option}.`,
  },
});
