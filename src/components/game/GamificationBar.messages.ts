import { defineMessages, formatFixed } from '../../i18n';

export const gamificationBarMessages = defineMessages({
  en: {
    closeQuickActions: 'Close Quick Actions',
    achievements: 'Achievements',
    achievementsUnlocked: (p: { count: number }) =>
      `Achievements, ${formatFixed(p.count, 0, 'en')} unlocked`,
    exitReplay: 'Exit replay',
    replayHistory: 'Replay history',
    miniMap: 'Mini-map',
  },
  'pt-BR': {
    closeQuickActions: 'Fechar ações rápidas',
    achievements: 'Conquistas',
    achievementsUnlocked: (p: { count: number }) =>
      `Conquistas, ${formatFixed(p.count, 0, 'pt-BR')} ${
        p.count === 1 ? 'desbloqueada' : 'desbloqueadas'
      }`,
    exitReplay: 'Sair da reprodução',
    replayHistory: 'Reproduzir o histórico',
    miniMap: 'Minimapa',
  },
});
