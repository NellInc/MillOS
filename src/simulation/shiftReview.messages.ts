import { defineMessages } from '../i18n';

export const shiftReviewMessages = defineMessages({
  en: {
    noCommitment: 'No customer commitments this shift.',
    dispatchReason: '{kg} kg dispatched; net contribution {margin} after recorded costs.',
    riskReason: (p: { count: number; countText: string }) =>
      p.count === 1
        ? `${p.countText} material or deadline risk carried into the next shift.`
        : `${p.countText} material or deadline risks carried into the next shift.`,
    qualityFailureReason:
      '{kg} kg failed the commitment quality threshold; quality failure caps the grade at F.',
    unsafeReason: 'Unresolved high-severity controls cap the grade at D: {titles}.',
  },
  'pt-BR': {
    noCommitment: 'Nenhum compromisso com clientes neste turno.',
    dispatchReason:
      '{kg} kg expedidos; contribuição líquida de {margin} após os custos registrados.',
    riskReason: (p: { count: number; countText: string }) =>
      p.count === 1
        ? `${p.countText} risco de material ou de prazo transferido para o próximo turno.`
        : `${p.countText} riscos de material ou de prazo transferidos para o próximo turno.`,
    qualityFailureReason:
      '{kg} kg não atingiram o limite de qualidade do compromisso; a falha de qualidade limita a nota a F.',
    unsafeReason: 'Controles de alta severidade não resolvidos limitam a nota a D: {titles}.',
  },
});
