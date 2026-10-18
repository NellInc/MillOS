import { defineMessages } from '../../../i18n';

interface DestinationParams {
  destination: string;
}

/** guide.destination is a tab id; English prints it verbatim. */
const PT_DESTINATION: Record<string, string> = {
  Shift: 'Turno',
  'Agreement / Voices': 'Acordo / Vozes',
  Review: 'Revisão',
};

interface ReceiptsParams {
  delivered: string;
  target: string;
  blocked: boolean;
}

export const workplaceCompanionMessages = defineMessages({
  en: {
    handoffShift: 'Handoff shift {cycle}',
    objectionNeedsRaiser: 'An objection needs its raiser',
    regionLabel: 'Working agreement companion',
    heading: 'Working agreement',
    revisionLine: '{name}, revision {revision}',
    adviserAbstained: 'The adviser abstained. Missing plant evidence remains visible in Handoff.',
    frozenBound:
      'Frozen conditional departure bound: 0 to {upper} kg. Actual receipts remain separate.',
    reviewPhase: 'Future authority has ended. Earned pay and recovery remain owed until delivered.',
    activePhase: 'Current bounded agreement is active. Refusal remains available.',
    readyForApproval: 'Current terms are ready for your explicit approval.',
    needsFreshAgreement: 'These terms still need a fresh agreement.',
    nextControls: (p: DestinationParams) => `Next: ${p.destination} controls.`,
    adviser: 'Adviser',
    openObjection: '{roles}: open objection. Only its raiser can confirm resolution.',
    currentCover: 'Current cover: {role}, {minutes} min remaining.',
    installmentReceipts: 'Agreed installment receipts: ',
    dispatchReceipts: 'Customer dispatch receipts: ',
    teachingOutput: 'Teaching output: ',
    receiptsValue: (p: ReceiptsParams) =>
      `${p.delivered} / ${p.target} kg${p.blocked ? '; evidence blocked' : ''}.`,
    agreedDeferral: 'Agreed deferral: ',
    deferralValue: '{kg} kg, still part of the full commitment.',
    handoffDispatch: 'This handoff shift’s dispatch: ',
    kgValue: '{kg} kg.',
    commitmentRemaining: 'Full customer commitment remaining: ',
    retainedCompensation: 'Retained compensation paid: ',
    compensationPaid: 'Compensation paid: ',
    creditsValue: '{amount} illustrative credits.',
    retainedRecovery: 'Retained recovery: ',
    recovery: 'Recovery: ',
    recoveryValue: '{recovered} min delivered; {owed} min owed.',
    openControls: 'Open agreement controls',
    viewPacking: 'View packing floor',
  },
  'pt-BR': {
    handoffShift: 'Turno {cycle} do experimento',
    objectionNeedsRaiser: 'Uma objeção precisa de quem a levantou',
    regionLabel: 'Assistente do acordo de trabalho',
    heading: 'Acordo de trabalho',
    revisionLine: '{name}, revisão {revision}',
    adviserAbstained:
      'O conselheiro se absteve. A evidência ausente da planta continua visível em Passagem de turno.',
    frozenBound:
      'Limite condicional de saída congelado: 0 a {upper} kg. Os comprovantes reais continuam separados.',
    reviewPhase:
      'A autoridade futura terminou. A remuneração conquistada e a recuperação continuam devidas até serem concedidas.',
    activePhase: 'O acordo limitado atual está ativo. A recusa continua disponível.',
    readyForApproval: 'Os termos atuais estão prontos para a sua aprovação explícita.',
    needsFreshAgreement: 'Estes termos ainda precisam de um novo acordo.',
    nextControls: (p: DestinationParams) =>
      `Próximo passo: controles de ${PT_DESTINATION[p.destination] ?? p.destination}.`,
    adviser: 'Conselheiro',
    openObjection: '{roles}: objeção aberta. Somente quem a levantou pode confirmar a resolução.',
    currentCover: 'Cobertura atual: {role}, {minutes} min restantes.',
    installmentReceipts: 'Comprovantes da parcela acordada: ',
    dispatchReceipts: 'Comprovantes de expedição ao cliente: ',
    teachingOutput: 'Produção didática: ',
    receiptsValue: (p: ReceiptsParams) =>
      `${p.delivered} / ${p.target} kg${p.blocked ? '; evidência bloqueada' : ''}.`,
    agreedDeferral: 'Adiamento acordado: ',
    deferralValue: '{kg} kg, ainda parte do compromisso total.',
    handoffDispatch: 'Expedição deste turno do experimento: ',
    kgValue: '{kg} kg.',
    commitmentRemaining: 'Compromisso total restante com o cliente: ',
    retainedCompensation: 'Compensação paga e mantida: ',
    compensationPaid: 'Compensação paga: ',
    creditsValue: '{amount} créditos ilustrativos.',
    retainedRecovery: 'Recuperação mantida: ',
    recovery: 'Recuperação: ',
    recoveryValue: '{recovered} min concedidos; {owed} min devidos.',
    openControls: 'Abrir os controles do acordo',
    viewPacking: 'Ver o setor de ensaque',
  },
});
