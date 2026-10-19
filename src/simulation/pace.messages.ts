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
    heldBy_player: 'Paused. Choose a pace to resume.',
    heldBy_shortcut: 'Paused with P. Press P again to resume.',
    heldBy_tour: 'Paused for the tour. It resumes when the tour closes.',
    heldBy_restore: 'Paused while your saved shift is restored.',
    heldBy_restoreFailed:
      'Paused: the saved shift could not be restored. Choose a pace to continue, or reset in Settings.',
    heldBy_workplace:
      'Paused for a cooperative workplace step. Finish it in the Bilateral Autonomy System (BAS) panel, or choose a pace.',
    heldBy_layout: 'Paused for the layout planner. Run the mill from the planner to resume.',
    heldBy_scada: 'Paused: live SCADA control is active, so the simulation clock is held.',
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
    heldBy_player: 'Pausado. Escolha um ritmo para continuar.',
    heldBy_shortcut: 'Pausado com P. Pressione P de novo para continuar.',
    heldBy_tour: 'Pausado para o tour. Continua quando o tour fechar.',
    heldBy_restore: 'Pausado enquanto o turno salvo é restaurado.',
    heldBy_restoreFailed:
      'Pausado: não foi possível restaurar o turno salvo. Escolha um ritmo para continuar ou reinicie em Configurações.',
    heldBy_workplace:
      'Pausado para uma etapa do trabalho cooperativo. Conclua-a no painel Sistema de Autonomia Bilateral (BAS) ou escolha um ritmo.',
    heldBy_layout:
      'Pausado para o planejador de layout. Coloque o moinho para rodar pelo planejador para continuar.',
    heldBy_scada:
      'Pausado: o controle SCADA ao vivo está ativo, então o relógio da simulação fica parado.',
  },
});
