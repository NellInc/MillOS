import { defineMessages } from '../../../i18n';
import { charterTitle } from '../../../simulation/workplaceCampaign.messages';

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

/* Why a follow-on order stopped earning, by its receipt evidence. */
const EN_EVIDENCE: Record<string, string> = {
  'quality-failed': 'a load failed its quality threshold',
  stale: 'its dispatch record no longer matches the plant, for example after a reset',
  missing: 'the order was cancelled or is no longer on the books',
};
const PT_EVIDENCE: Record<string, string> = {
  'quality-failed': 'uma carga não atingiu o limite de qualidade',
  stale: 'o registro de expedição não confere mais com a fábrica, por exemplo após um reinício',
  missing: 'o pedido foi cancelado ou não consta mais da carteira',
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
      `${charterTitle('en', p.profile)}, seed ${p.seed}: delivery ${p.delivery}, agreement ${p.agreement}`,
    dispatched: 'Dispatched {delivered} / {target} kg. Full commitment remaining: {remaining} kg.',
    accounts: 'Credits: closing cash {cash}; wages paid {wages}; compensation paid {compensation}.',
    memberLine:
      '{role}: extra duty {extra} min; rest {rest} min; recovery delivered {recovery} min; recovery owed {owed} min.',
    download: 'Download this redacted review',
    regionLabel: 'Completed workplace campaigns',
    freshHeading: 'Keep the review, try another charter',
    archiveButton: 'Archive review and open a fresh exercise',
    blockedReplay: 'Finish or forget the matched replay first.',
    blockedPaused:
      'A reload paused the final shift before its end. Resume it in Review, then finish or end it, before archiving.',
    blockedPausedSafety:
      'An emergency stop or drill paused the final shift before its end. Resume it in Review, then finish or end it, before archiving.',
    blockedPausedObjection:
      'An objection paused the final shift before its end. Resume it in Review, then finish or end it, before archiving.',
    blockedObligations: 'Deliver owed recovery and settle open objections and reserved pay first.',
    retainedReviews: 'Retained campaign reviews ({count})',
    leaveButton: 'Leave this season',
    leaveKept:
      'Leaving keeps what was earned: {kg} kg delivered to {customer}, {pay} credits in pay and cover, and {recovery} minutes of recovery delivered.',
    leaveWaitActive: 'Leaving waits until this shift is stopped or ends, so its pay settles first.',
    leaveWaitObligations: 'Leaving waits until nothing is owed. {reasons}',
    leftSeasons: 'Seasons left early ({count})',
    leftSummary: 'Left early at shift {shift} of 3, seed {seed}',
    followOnStopped: (p: { customer: string; evidence: string }) =>
      `Credit from ${p.customer} has stopped: ${EN_EVIDENCE[p.evidence] ?? EN_EVIDENCE.missing}.`,
    followOnReplacement: 'The next shift credits dispatch to {customer} in its place.',
    followOnNoReplacement:
      'No other open order can take its place yet. The next shift links one if the mill has one open by then; until then, further dispatch earns the cooperative nothing.',
    followOnLastShift: 'This is the season’s last shift, so nothing replaces it.',
  },
  'pt-BR': {
    reviewSummary: (p: ReviewSummaryParams) =>
      `${charterTitle('pt-BR', p.profile)}, semente ${p.seed}: entrega ${
        PT_DELIVERY[p.delivery] ?? p.delivery
      }, acordo ${PT_AGREEMENT[p.agreement] ?? p.agreement}`,
    dispatched: 'Expedido: {delivered} / {target} kg. Compromisso total restante: {remaining} kg.',
    accounts:
      'Créditos: caixa de fechamento {cash}; remuneração paga {wages}; compensação paga {compensation}.',
    memberLine:
      '{role}: serviço extra {extra} min; descanso {rest} min; recuperação concedida {recovery} min; recuperação devida {owed} min.',
    download: 'Baixar esta revisão com dados ocultados',
    regionLabel: 'Campanhas de trabalho concluídas',
    freshHeading: 'Guarde a revisão, experimente outro estatuto',
    archiveButton: 'Arquivar a revisão e abrir um novo exercício',
    blockedReplay: 'Primeiro conclua ou descarte a reprodução pareada.',
    blockedPaused:
      'Uma recarga pausou o turno final antes do fim. Retome-o em Revisão e depois conclua-o ou encerre-o antes de arquivar.',
    blockedPausedSafety:
      'Uma parada de emergência ou um simulado pausou o turno final antes do fim. Retome-o em Revisão e depois conclua-o ou encerre-o antes de arquivar.',
    blockedPausedObjection:
      'Uma objeção pausou o turno final antes do fim. Retome-o em Revisão e depois conclua-o ou encerre-o antes de arquivar.',
    blockedObligations:
      'Primeiro conceda a recuperação devida e resolva as objeções abertas e a remuneração reservada.',
    retainedReviews: 'Revisões de campanha guardadas ({count})',
    leaveButton: 'Sair desta temporada',
    leaveKept:
      'Sair mantém o que foi conquistado: {kg} kg entregues a {customer}, {pay} créditos de remuneração e cobertura e {recovery} minutos de recuperação concedida.',
    leaveWaitActive:
      'Para sair, espere este turno ser parado ou terminar, para que a remuneração seja acertada antes.',
    leaveWaitObligations: 'Para sair, nada pode estar devido. {reasons}',
    leftSeasons: 'Temporadas encerradas antes do fim ({count})',
    leftSummary: 'Encerrada antes do fim no turno {shift} de 3, semente {seed}',
    followOnStopped: (p: { customer: string; evidence: string }) =>
      `O crédito de ${p.customer} foi interrompido: ${PT_EVIDENCE[p.evidence] ?? PT_EVIDENCE.missing}.`,
    followOnReplacement: 'O próximo turno credita a expedição para {customer} no lugar dele.',
    followOnNoReplacement:
      'Ainda não há outro pedido aberto para substituí-lo. O próximo turno vincula um se o moinho tiver algum aberto até lá; até então, a expedição adicional não rende nada à cooperativa.',
    followOnLastShift: 'Este é o último turno da temporada, então nada o substitui.',
  },
});
