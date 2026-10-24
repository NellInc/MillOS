import { defineMessages } from '../../i18n';
import { PT_DECISION_PRIORITIES } from './DecisionReplay.messages';

export const decisionHistoryPanelMessages = defineMessages({
  en: {
    toggle: 'Toggle decision history',
    title: 'Decision History',
    empty: 'No decisions yet',
    priority: (p: { value: string }) => p.value,
    previousPage: 'Previous page',
    nextPage: 'Next page',
  },
  'pt-BR': {
    toggle: 'Mostrar ou ocultar o histórico de decisões',
    title: 'Histórico de decisões',
    empty: 'Nenhuma decisão ainda',
    priority: (p: { value: string }) => PT_DECISION_PRIORITIES[p.value] ?? p.value,
    previousPage: 'Página anterior',
    nextPage: 'Próxima página',
  },
});
