import { defineMessages } from '../i18n';

/* What held a grade back, as a noun phrase inside the headline. */
const EN_CAUSE: Record<string, string> = {
  quality: 'a quality failure',
  unsafe: 'an unresolved incident',
  late: 'a late delivery',
  risks: 'risks carried into the next shift',
  margin: 'costs above revenue',
  kg: 'too little dispatched for the time on commitments',
  no_dispatch: 'having no deliveries',
};
const PT_CAUSE: Record<string, string> = {
  quality: 'uma falha de qualidade',
  unsafe: 'uma ocorrência não resolvida',
  late: 'uma entrega atrasada',
  risks: 'o risco transferido para o próximo turno',
  margin: 'o custo acima da receita',
  kg: 'a pouca expedição para o tempo com compromissos',
  no_dispatch: 'a falta de entregas',
};
const PT_SHIFT: Record<string, string> = { morning: 'Manhã', afternoon: 'Tarde', night: 'Noite' };

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
    shiftName: (p: { shift: string }) => p.shift.charAt(0).toUpperCase() + p.shift.slice(1),
    durationHours: '{hours}h {minutes}m',
    durationMinutes: '{minutes}m',
    headlineGood: '{kg} kg shipped with a nonnegative contribution and carry-over risk in hand.',
    headlineHeldBack: (p: { kg: string; cause: string }) =>
      `${p.kg} kg shipped; ${EN_CAUSE[p.cause] ?? EN_CAUSE.risks} held the grade back.`,
    gapQuality: '{next} needs every load to meet the recipe quality target.',
    gapUnsafe: '{next} needs {titles} resolved before the shift closes.',
    gapLate: (p: { next: string; count: number; countText: string }) =>
      `${p.next} needs every delivery on time; ${p.countText} arrived late.`,
    gapRisks: (p: {
      next: string;
      allowed: number;
      allowedText: string;
      count: number;
      countText: string;
      labels: string;
    }) =>
      p.allowed === 0
        ? `${p.next} needs no open risks when the shift closes; you carried ${p.countText}: ${p.labels}.`
        : `${p.next} needs at most ${p.allowedText} open risk${p.allowed === 1 ? '' : 's'} when the shift closes; you carried ${p.countText}: ${p.labels}.`,
    gapMargin: '{next} needs a nonnegative net contribution; costs exceeded revenue by {amount}.',
    gapKg: '{next} needs {target} kg for {duration} on commitments; you were {short} kg short.',
    gapNoDispatch: '{next} needs at least one delivery against a commitment.',
    tryNoCommitment:
      'Try next: accept the next delivery programme in Overview, so the shift has a customer to serve.',
    tryQuality:
      'Try next: hold loading until QC releases the batch, and check the recipe quality target in Overview before a truck leaves.',
    tryUnsafe:
      'Try next: acknowledge and mitigate {titles} in Overview as soon as it is raised, then resolve it before the shift closes.',
    tryLate:
      'Try next: serve the earliest-due customer first; the line starts the next order while a truck loads, so keep the recipe feed stocked.',
    tryRisk: 'Try next: clear "{risk}" before the shift closes.',
    tryMargin:
      'Try next: keep an order running; an idle line, open work orders and a docked truck held at the bay still cost money.',
    tryKg:
      'Try next: keep the recipe feed stocked and a shipping truck loading, so finished goods leave while the order is open.',
    outcomeOnTime: '{customer}: {shipped} of {required} kg, delivered on time.',
    outcomeLate: '{customer}: {shipped} of {required} kg, delivered {duration} late.',
    outcomeOverdue: '{customer}: {shipped} of {required} kg so far, {duration} overdue.',
    outcomeOpen: '{customer}: {shipped} of {required} kg so far, due in {duration}.',
    outcomeQualityFailure: '{kg} kg failed quality.',
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
    shiftName: (p: { shift: string }) => PT_SHIFT[p.shift] ?? p.shift,
    durationHours: '{hours}h {minutes}min',
    durationMinutes: '{minutes}min',
    headlineGood:
      '{kg} kg expedidos com contribuição não negativa e risco transferido sob controle.',
    headlineHeldBack: (p: { kg: string; cause: string }) =>
      `${p.kg} kg expedidos; ${PT_CAUSE[p.cause] ?? PT_CAUSE.risks} impediu uma nota melhor.`,
    gapQuality: '{next} exige que toda carga atinja a meta de qualidade da receita.',
    gapUnsafe: '{next} exige resolver {titles} antes de o turno fechar.',
    gapLate: (p: { next: string; count: number; countText: string }) =>
      p.count === 1
        ? `${p.next} exige todas as entregas no prazo; ${p.countText} chegou atrasada.`
        : `${p.next} exige todas as entregas no prazo; ${p.countText} chegaram atrasadas.`,
    gapRisks: (p: {
      next: string;
      allowed: number;
      allowedText: string;
      count: number;
      countText: string;
      labels: string;
    }) =>
      p.allowed === 0
        ? `${p.next} exige nenhum risco aberto quando o turno fecha; você levou ${p.countText}: ${p.labels}.`
        : `${p.next} exige no máximo ${p.allowedText} ${p.allowed === 1 ? 'risco aberto' : 'riscos abertos'} quando o turno fecha; você levou ${p.countText}: ${p.labels}.`,
    gapMargin:
      '{next} exige contribuição líquida não negativa; os custos superaram a receita em {amount}.',
    gapKg: '{next} exige {target} kg em {duration} com compromissos; faltaram {short} kg.',
    gapNoDispatch: '{next} exige pelo menos uma entrega para um compromisso.',
    tryNoCommitment:
      'Tente a seguir: aceite o próximo programa de entregas na Visão geral, para que o turno tenha um cliente a atender.',
    tryQuality:
      'Tente a seguir: segure o carregamento até o CQ liberar o lote e confira a meta de qualidade da receita na Visão geral antes de o caminhão sair.',
    tryUnsafe:
      'Tente a seguir: reconheça e mitigue {titles} na Visão geral assim que surgir, e resolva antes de o turno fechar.',
    tryLate:
      'Tente a seguir: atenda primeiro o cliente com o prazo mais próximo; a linha começa o próximo pedido enquanto o caminhão carrega, então mantenha a alimentação da receita abastecida.',
    tryRisk: 'Tente a seguir: resolva "{risk}" antes de o turno fechar.',
    tryMargin:
      'Tente a seguir: mantenha um pedido em andamento; linha parada, ordens de serviço abertas e caminhão retido na doca continuam custando dinheiro.',
    tryKg:
      'Tente a seguir: mantenha a alimentação da receita abastecida e um caminhão de expedição carregando, para que os produtos acabados saiam enquanto o pedido está aberto.',
    outcomeOnTime: '{customer}: {shipped} de {required} kg, entregue no prazo.',
    outcomeLate: '{customer}: {shipped} de {required} kg, entregue com {duration} de atraso.',
    outcomeOverdue: '{customer}: {shipped} de {required} kg até agora, atrasado em {duration}.',
    outcomeOpen: '{customer}: {shipped} de {required} kg até agora, prazo em {duration}.',
    outcomeQualityFailure: '{kg} kg reprovados na qualidade.',
  },
});
