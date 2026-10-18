import { defineMessages } from '../../../i18n';

const PT_PROFILE: Record<string, string> = {
  'toe-dip': 'liderado pela coordenação',
  team: 'acordo da equipe',
  cooperative: 'governança dos cooperados',
};
const PT_DELIVERY: Record<string, string> = {
  met: 'cumprida',
  blocked: 'bloqueada',
  shortfall: 'abaixo do compromisso',
  pending: 'pendente',
};
const PT_AGREEMENT: Record<string, string> = {
  honoured: 'honrado',
  incomplete: 'incompleto',
  pending: 'pendente',
};

interface ReviewSummaryParams {
  profile: string;
  seed: string;
  delivery: string;
  agreement: string;
}

/** Status ids stay verbatim in English, which is what the review always printed. */
export const workplaceCampaignArchiveMessages = defineMessages({
  en: {
    reviewSummary: (p: ReviewSummaryParams) =>
      `${p.profile}, seed ${p.seed}: delivery ${p.delivery}, agreement ${p.agreement}`,
    dispatched: 'Dispatched {delivered} / {target} kg. Full commitment remaining: {remaining} kg.',
    accounts:
      'Illustrative credits: closing cash {cash}; wages paid {wages}; compensation paid {compensation}.',
    memberLine:
      '{role}: extra duty {extra} min; rest {rest} min; recovery delivered {recovery} min; recovery owed {owed} min.',
    download: 'Download this redacted review',
    regionLabel: 'Completed workplace campaigns',
    freshHeading: 'Keep the review, try another charter',
    freshIntro:
      'Archive these three shifts before opening a fresh exercise. Earned pay, delivered recovery and shortfalls stay in the review. New terms need new role understanding, ballots and individual consent.',
    freshCredits:
      'Each exercise opens with 400 illustrative credits. Mill inventory, customer commitments and physical production continue unchanged.',
    archiveButton: 'Archive review and open a fresh exercise',
    blockedReplay: 'Finish or forget the matched replay first.',
    blockedObligations: 'Deliver owed recovery and settle open objections and reserved pay first.',
    retainedReviews: 'Retained campaign reviews ({count})',
    retainedNote:
      'The last six reviews stay on this browser, with private preferences redacted. Download any review you want to keep longer. A historical review cannot restart an agreement.',
  },
  'pt-BR': {
    reviewSummary: (p: ReviewSummaryParams) =>
      `${PT_PROFILE[p.profile] ?? p.profile}, semente ${p.seed}: entrega ${
        PT_DELIVERY[p.delivery] ?? p.delivery
      }, acordo ${PT_AGREEMENT[p.agreement] ?? p.agreement}`,
    dispatched: 'Expedido: {delivered} / {target} kg. Compromisso total restante: {remaining} kg.',
    accounts:
      'Créditos ilustrativos: caixa de fechamento {cash}; remuneração paga {wages}; compensação paga {compensation}.',
    memberLine:
      '{role}: serviço extra {extra} min; descanso {rest} min; recuperação concedida {recovery} min; recuperação devida {owed} min.',
    download: 'Baixar esta revisão com dados ocultados',
    regionLabel: 'Campanhas de trabalho concluídas',
    freshHeading: 'Guarde a revisão, experimente outro estatuto',
    freshIntro:
      'Arquive estes três turnos antes de abrir um novo exercício. A remuneração conquistada, a recuperação concedida e os déficits permanecem na revisão. Novos termos exigem novo entendimento das funções, novas votações e consentimento individual.',
    freshCredits:
      'Cada exercício começa com 400 créditos ilustrativos. O estoque do moinho, os compromissos com clientes e a produção física continuam inalterados.',
    archiveButton: 'Arquivar a revisão e abrir um novo exercício',
    blockedReplay: 'Primeiro conclua ou descarte a reprodução pareada.',
    blockedObligations:
      'Primeiro conceda a recuperação devida e resolva as objeções abertas e a remuneração reservada.',
    retainedReviews: 'Revisões de campanha guardadas ({count})',
    retainedNote:
      'As seis revisões mais recentes ficam neste navegador, com as preferências privadas ocultadas. Baixe qualquer revisão que quiser guardar por mais tempo. Uma revisão histórica não pode reiniciar um acordo.',
  },
});
