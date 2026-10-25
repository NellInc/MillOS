import { defineMessages } from '../../i18n';

/**
 * The on-device operator's session record. Queue names stay in English: they
 * are the frozen rubric's options.
 */
export const onDeviceOperatorRecordMessages = defineMessages({
  en: {
    heading: 'On-device AI record',
    summary: '{handled} handled · {left} left for you',
    minute: 'min {minute}',
    noRoute: 'No route',
    handled: 'Acknowledged and mitigated',
    misrouted: 'Acknowledged; belongs with {expected}',
    heldBack: 'Left raised',
    unrouted: 'Left raised',
    refused: 'Left raised',
    stoodDown: 'Held at a safety boundary',
    peopleHandled: 'No one called in.',
    peopleLeft: 'Left for you; no one asked.',
  },
  'pt-BR': {
    heading: 'Registro da IA no dispositivo',
    summary: '{handled} tratadas · {left} deixadas para você',
    minute: 'min {minute}',
    noRoute: 'Sem encaminhamento',
    handled: 'Reconhecida e mitigada',
    misrouted: 'Reconhecida; pertence a {expected}',
    heldBack: 'Mantida em aberto',
    unrouted: 'Mantida em aberto',
    refused: 'Mantida em aberto',
    stoodDown: 'Retida em um limite de segurança',
    peopleHandled: 'Ninguém foi chamado.',
    peopleLeft: 'Deixada para você; ninguém foi solicitado.',
  },
});
