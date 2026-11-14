import { defineMessages } from '../i18n';

// One vocabulary for every pace control (Shift pace select, Overview and
// mobile buttons, the P key). A pace speeds the whole plant with the clock, so
// no label needs a caveat about deadlines.
export const paceMessages = defineMessages({
  en: {
    pace0: 'Paused, inspect freely',
    pace15: 'Slow, 1/2x',
    pace30: 'Standard, 1x',
    pace60: 'Fast, 2x',
    pace120: 'Fastest, 4x',
    paceCustom: 'Current custom pace',
    paceTitle:
      'The pace runs the whole plant faster or slower: clock, deadlines, production, trucks and forklifts together.',
    heldBy_player: 'Paused. Press P or choose a pace to resume.',
    heldBy_shortcut: 'Paused with P. Press P again to resume.',
    heldBy_tour: 'Paused for the tour. It resumes when the tour closes.',
    heldBy_restore: 'Paused while your saved shift is restored.',
    heldBy_restoreFailed:
      'Paused: the saved shift could not be restored. Continue without it, or reset in Settings.',
    heldBy_workplace: 'Paused for a cooperative workplace step. Finish it in Autonomy to resume.',
    heldBy_handoff:
      "Held while the team decides the handoff experiment, so the adviser's forecast stays true. A pace you choose now starts when it resumes. To resume, cancel the experiment or finish its member review in Autonomy.",
    heldBy_layout: 'Paused for the layout planner. Run the mill from the planner to resume.',
    heldBy_scada:
      'Paused: live SCADA control stopped the workplace trial, so the simulation clock is held.',
    // The exits for the holds no feature releases (NOTICE_HOLDERS, D21).
    continueWithoutSave: 'Continue without the save',
    resumeClock: 'Resume the clock',
    heldBy_orientation: 'Paused while the device is upright. Turn it sideways to resume.',
  },
  'pt-BR': {
    pace0: 'Pausado, inspecione à vontade',
    pace15: 'Devagar, 1/2x',
    pace30: 'Padrão, 1x',
    pace60: 'Rápido, 2x',
    pace120: 'Mais rápido, 4x',
    paceCustom: 'Ritmo personalizado atual',
    paceTitle:
      'O ritmo acelera ou desacelera o moinho inteiro: relógio, prazos, produção, caminhões e empilhadeiras juntos.',
    heldBy_player: 'Pausado. Pressione P ou escolha um ritmo para continuar.',
    heldBy_shortcut: 'Pausado com P. Pressione P de novo para continuar.',
    heldBy_tour: 'Pausado para o tour. Continua quando o tour fechar.',
    heldBy_restore: 'Pausado enquanto o turno salvo é restaurado.',
    heldBy_restoreFailed:
      'Pausado: não foi possível restaurar o turno salvo. Continue sem ele ou reinicie em Configurações.',
    heldBy_workplace:
      'Pausado para uma etapa do trabalho cooperativo. Conclua-a em Autonomia para continuar.',
    heldBy_handoff:
      'Parado enquanto a equipe decide o experimento de passagem de turno, para que a previsão do conselheiro continue válida. O ritmo que você escolher agora começa quando o relógio voltar. Para continuar, cancele o experimento ou conclua a avaliação dos cooperados em Autonomia.',
    heldBy_layout:
      'Pausado para o planejador de layout. Coloque o moinho para rodar pelo planejador para continuar.',
    heldBy_scada:
      'Pausado: o controle SCADA ao vivo parou o teste do trabalho cooperativo, então o relógio da simulação fica parado.',
    continueWithoutSave: 'Continuar sem o salvamento',
    resumeClock: 'Retomar o relógio',
    heldBy_orientation: 'Pausado com o aparelho na vertical. Gire-o de lado para continuar.',
  },
});
