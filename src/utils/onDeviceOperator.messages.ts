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
    stoodDown: '{incident}: left raised {problem}.',
    // The PA line, spoken word for word: the incident, then what happens next.
    paHandled: '{incident}. The AI has dealt with it.',
    paLeftForYou: '{incident}. The AI flagged it, but it needs you.',
    paOpen: "{incident}. It's still open and needs you.",
    paAfterStop: '{incident}. The AI will see to it after the stop.',
    paAfterDrill: '{incident}. The AI will see to it after the drill.',
    paStandingBy: '{incident}. The AI is standing by.',
    standDown_emergency: 'while the emergency stop is active',
    standDown_drill: 'during the egress verification drill',
    standDown_control: 'while control is not simulated',
    standDown_replay: 'during a replay',
    standDown_budget: 'because the on-device AI has used its command budget for this session',
  },
  'pt-BR': {
    noticeTitle: 'IA no dispositivo · {queue}',
    handled: '{incident}: reconhecida e mitigada.',
    misrouted: '{incident}: reconhecida. Pertence a {expected}; deixada para você mitigar.',
    heldBack: '{incident}: mantida em aberto.',
    unrouted: '{incident}: sem encaminhamento. Mantida em aberto.',
    refused: '{incident}: {problem}',
    commandReason: 'A IA no dispositivo encaminhou esta ocorrência para {queue}.',
    stoodDown: '{incident}: mantida em aberto {problem}.',
    paHandled: '{incident}. A IA já resolveu.',
    paLeftForYou: '{incident}. A IA registrou, mas precisa de você.',
    paOpen: '{incident}. Continua em aberto e precisa de você.',
    paAfterStop: '{incident}. A IA cuida disso depois da parada.',
    paAfterDrill: '{incident}. A IA cuida disso depois do simulado.',
    paStandingBy: '{incident}. A IA está aguardando.',
    standDown_emergency: 'enquanto a parada de emergência está ativa',
    standDown_drill: 'durante o simulado de verificação das rotas de saída',
    standDown_control: 'enquanto o controle não é simulado',
    standDown_replay: 'durante uma reprodução',
    standDown_budget: 'porque a IA no dispositivo esgotou seu limite de comandos desta sessão',
  },
});
