import { defineMessages } from '../i18n';

/**
 * Notices the on-device operator files when it handles a raised incident. Queue
 * names stay in English: they are the frozen rubric's options.
 */
export const onDeviceOperatorMessages = defineMessages({
  en: {
    noticeTitle: 'On-device AI · {queue}',
    handled: '{incident}: acknowledged and mitigated.',
    misrouted: '{incident}: acknowledged. Belongs with {expected}; left for you to mitigate.',
    heldBack: '{incident}: left raised.',
    unrouted: '{incident}: no route. Left raised.',
    refused: '{incident}: {problem}',
    commandReason: 'On-device AI routed this incident to {queue}.',
    paMessage: '{title}. {message}',
    stoodDown: '{incident}: left raised {problem}.',
    standDown_emergency: 'while the emergency stop is active',
    standDown_drill: 'during the egress verification drill',
    standDown_control: 'while control is not simulated',
    standDown_replay: 'during a replay',
  },
  'pt-BR': {
    noticeTitle: 'IA no dispositivo · {queue}',
    handled: '{incident}: reconhecida e mitigada.',
    misrouted: '{incident}: reconhecida. Pertence a {expected}; deixada para você mitigar.',
    heldBack: '{incident}: mantida em aberto.',
    unrouted: '{incident}: sem encaminhamento. Mantida em aberto.',
    refused: '{incident}: {problem}',
    commandReason: 'A IA no dispositivo encaminhou esta ocorrência para {queue}.',
    paMessage: '{title}. {message}',
    stoodDown: '{incident}: mantida em aberto {problem}.',
    standDown_emergency: 'enquanto a parada de emergência está ativa',
    standDown_drill: 'durante o simulado de verificação das rotas de saída',
    standDown_control: 'enquanto o controle não é simulado',
    standDown_replay: 'durante uma reprodução',
  },
});
