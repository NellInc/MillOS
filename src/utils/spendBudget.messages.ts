import { defineMessages } from '../i18n';

/** Errors the session cost cap raises; the AI settings surfaces show them. */
export const spendBudgetMessages = defineMessages({
  en: {
    capRange: 'Enter a cap between $0.01 and $1,000, or turn it off.',
    capReached: 'Session cost cap reached. No paid request was sent.',
  },
  'pt-BR': {
    capRange: 'Informe um teto entre US$ 0,01 e US$ 1.000, ou desative-o.',
    capReached: 'O teto de custo da sessão foi atingido. Nenhuma requisição paga foi enviada.',
  },
});
