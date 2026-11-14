import { defineMessages } from '../../../i18n';
import { charterTitle } from '../../../simulation/workplaceCampaign.messages';

/* Status values are machine-readable state; English renders them verbatim,
   pt-BR maps the known values and falls back to the raw value. */
const pick = (table: Record<string, string>, value: string) => table[value] ?? value;

const PT_DELIVERY_STATUS: Record<string, string> = {
  blocked: 'bloqueada',
  met: 'cumprida',
  shortfall: 'abaixo da meta',
  pending: 'pendente',
};
const PT_AGREEMENT_STATUS: Record<string, string> = {
  honoured: 'cumprido',
  incomplete: 'incompleto',
  pending: 'pendente',
};
const PT_CHALLENGE_STATUS: Record<string, string> = {
  active: 'ativo',
  completed: 'concluído',
  failed: 'não cumprido',
  abandoned: 'abandonado',
};
const PT_ROLE: Record<string, string> = {
  Packing: 'Ensaque',
  Quality: 'Qualidade',
  Maintenance: 'Manutenção',
  Coordinator: 'Coordenação',
};
const PT_SHIFT_OF: Record<string, string> = {
  morning: 'da manhã',
  afternoon: 'da tarde',
  night: 'da noite',
};

/* A part minute still counts as one: the run can complete until it runs out. */
type ChallengeProgressParams = {
  label: string;
  dispatchedKg: string;
  targetKg: string;
  minutes: string;
  count: number;
};

export const playableShiftMessages = defineMessages({
  en: {
    deliveryDeadline: 'Delivery deadline',
    shiftPace: 'Shift pace',
    guidedDelivery: 'Guided delivery',
    deliveryFulfilled: 'Delivery fulfilled',
    compactGuide: 'Compact delivery guide',
    closeGuide: 'Close guided delivery',
    fulfilledDispatched: '{customer}: {kg} kg dispatched.',
    currentOrder: 'Now: {customer}, {shipped} of {required} kg shipped. {due}.',
    programmeComplete: 'Programme complete, review your shift',
    reviewShiftProgramme: 'Review shift and next programme',
    receiptAndLearning: 'Delivery receipt and learning',
    expandGuide: 'Expand delivery guide',
    guide: 'Guide',
    inspectionStatus: 'Inspection: {inspection} · Delivery: {delivery}',
    inspectionRecorded: 'recorded',
    inspectionWaiting: 'waiting',
    kgDispatched: '{kg} kg dispatched',
    deliveryStatusFulfilled: 'fulfilled',
    reviewDeliveryQc: 'Review delivery and QC',
    openScada: 'Open SCADA',
    openChronicle: 'Open Mill Chronicle',
    openOverview: 'Open Overview',
    openOverviewQc: 'Open Overview and QC',
    inspectMill: 'Inspect a roller mill',
    firstDelivery: 'Your first delivery',
    deliveryFor: 'Delivery for {customer}',
    orderLine: '{customer}: {kg} kg {product}',
    awaitingOrder: 'Awaiting an order',
    truckLoad: 'Shipping truck load',
    truckLoadValue: '{loaded} / {capacity} kg',
    truckLoadValueText: '{loaded} of {capacity} kilograms on the truck',
    showMilling: 'Show milling line',
    showPacking: 'Show packing line',
    showShipping: 'Show shipping bay',
    skipGuide: 'Skip guided delivery',
    handoffAgreement: 'Handoff working agreement',
    trialReceipts: 'Current shift receipts: {kg} kg; retained earned pay {pay} credits.',
    trialRemaining: 'Full customer commitment remaining: {kg} kg.',
    linkedAgreement: 'Linked working agreement',
    deliveryOutcome: 'Delivery: {status}, {deliveredKg} / {targetKg} kg for {customer}.',
    deliveryStatus: (p: { status: string }) => p.status,
    agreedDeferral: 'Agreed deferral: {kg} kg.',
    remainingCommitment: 'Remaining full customer commitment: {kg} kg.',
    fullCommitmentDispatched: ' Full customer commitment dispatched.',
    followOnCredit:
      'The season now works {customer}: {kg} kg of its dispatch credited to the cooperative.',
    agreementOutcome: 'Working agreement: {status}. Combined outcome: {combined}.',
    agreementWhy: 'Why: {reason}',
    agreementPausedByReload:
      'Paused by a reload at minute {minute}: the shift carries on once everyone consents again, in Autonomy.',
    agreementPausedBySafety:
      'Paused by an emergency stop or drill at minute {minute}: the shift carries on once everyone consents again, in Autonomy.',
    agreementPausedByObjection:
      'Paused by an objection at minute {minute}, now resolved: the shift carries on once everyone consents again, in Autonomy.',
    agreementStatus: (p: { status: string }) => p.status,
    outcomeComplete: 'complete',
    outcomeUnfinished: 'unfinished',
    individualObligations: 'Individual obligations',
    role: (p: { role: string }) => p.role,
    memberCurrent: '{role}: current rest {rest} min; recovery owed {owed} min.',
    memberCumulative:
      '{role}, cumulative: extra duty {extra} min; rest {rest} min; recovery owed {owed} min.',
    accounts:
      'Workplace credits: closing cash {cash}; wages {wages}; compensation {compensation}; improvements {improvements}; allocations {allocations}.',
    reviewAgreement: 'Review working agreement',
    shiftCommitment: 'Your shift commitment',
    activeCommitment: 'Active customer commitment',
    chooseCustomer: 'Choose a customer',
    switchChallengeHint: 'Finish or abandon the challenge before switching customers.',
    switchReviewHint:
      'Finish the linked working agreement season and owed recovery before switching customers.',
    switchHandoffHint: 'Finish the handoff review and owed recovery before switching customers.',
    rushChoice:
      'Rush: {customer} pays {premium}% more for {kg} kg {product}. {due}. The controller runs it first, so it leaves on the first truck.',
    rushDeferRisk:
      ' Put a commitment for another product first and it waits for a later truck, past its due time, at double the usual late penalty.',
    rushChangeover:
      ' It is the only order on {grain}, so running it first changes the line over to it and back.',
    activeOrderProgress: '{customer}: {shippedKg} / {requiredKg} kg dispatched',
    programmeCompleteCurrent: 'Current programme complete',
    blocked: 'Blocked',
    attention: 'Attention',
    failureCosts: 'Failure costs',
    purchases: 'Bought this shift',
    proposalsHeading: "The partner's proposals",
    costLate: 'Late delivery: £{rate} per game hour',
    costMaintenance: 'Open work orders: £{rate} per game hour',
    costDemurrage: 'Truck held at the dock: £{rate} per game hour',
    costShiftTotal:
      'This shift so far: £{total} in late and quality penalties, repairs and dock waiting.',
    challengeProgress: 'Recovery challenge progress',
    challengeProgressLine: (p: ChallengeProgressParams) =>
      `${p.label}: ${p.dispatchedKg} / ${p.targetKg} kg, ${p.minutes} simulation ${
        p.count === 1 ? 'minute' : 'minutes'
      } left`,
    responseQueued: 'The response is queued.',
    awaitingUpdate: 'Awaiting simulation update',
    nextLine: 'Next: {label}',
    replayGuide: 'Replay guided delivery',
    lastChallenge: 'Last challenge: {status}.',
    challengeStatus: (p: { status: string }) => p.status,
    agreementProfile: 'Working agreement profile',
    profileToeDip: charterTitle('en', 'toe-dip'),
    profileTeam: charterTitle('en', 'team'),
    profileCooperative: charterTitle('en', 'cooperative'),
    // The season's length and pace are on the button (the caption was cut, D14).
    startCampaign: 'Start 3-shift cooperative season on this order (1x)',
    adjustChallenge: 'Adjust the challenge',
    challengeTerms: '{hours} h to recover · up to {kg} kg to dispatch',
    abandonChallenge: 'Abandon challenge',
    savedReports: 'Saved shift reports',
    shiftDebrief: 'Shift debrief',
    noReports: (p: { shift: string; time: string }) =>
      `The ${p.shift.charAt(0).toUpperCase()}${p.shift.slice(1)} report is saved when the shift closes at ${p.time}.`,
    readEarlierReports: (p: { count: number; countText: string }) =>
      `Read ${p.countText} earlier ${p.count === 1 ? 'report' : 'reports'}`,
    reportHeading: '{shift}: grade {grade}',
    reportHeadingUngraded: '{shift}: no customer commitments, no grade',
    reportHeadingNothingDue: '{shift}: nothing due yet, no grade',
    reportHeadingProvisionalNothingDue: '{shift} so far: nothing due yet',
    reportHeadingProvisional: '{shift} so far: provisional grade {grade}',
    reportHeadingProvisionalUngraded: '{shift} so far: no customer commitments yet',
    ordersHeading: 'Orders this shift',
    choicesHeading: 'Your decisions this shift',
    agentChoice: 'AI agent: {message}',
    noChoices: 'No choices were recorded this shift; the mill ran on its controllers.',
    narrationHeading: 'What the mill did',
    shiftLogHeading: 'Shift log',
    noDecisions: 'Nothing was logged in this saved window.',
    decisionsNotSaved: 'The log was not saved with this report.',
    carryForward: 'Carry forward: {risks}',
    acceptNextProgramme: 'Accept next delivery programme',
    acceptNextHint:
      'Finish current customer commitments, any challenge and the linked final review with recovery and objections resolved first.',
  },
  'pt-BR': {
    deliveryDeadline: 'Prazo de entrega',
    shiftPace: 'Ritmo do turno',
    guidedDelivery: 'Entrega guiada',
    deliveryFulfilled: 'Entrega concluída',
    compactGuide: 'Compactar o guia de entrega',
    closeGuide: 'Fechar a entrega guiada',
    fulfilledDispatched: '{customer}: {kg} kg expedidos.',
    currentOrder: 'Agora: {customer}, {shipped} de {required} kg expedidos. {due}.',
    programmeComplete: 'Programa concluído, revise seu turno',
    reviewShiftProgramme: 'Revisar o turno e o próximo programa',
    receiptAndLearning: 'Comprovante da entrega e aprendizado',
    expandGuide: 'Expandir o guia de entrega',
    guide: 'Guia',
    inspectionStatus: 'Inspeção: {inspection} · Entrega: {delivery}',
    inspectionRecorded: 'registrada',
    inspectionWaiting: 'aguardando',
    kgDispatched: '{kg} kg expedidos',
    deliveryStatusFulfilled: 'concluída',
    reviewDeliveryQc: 'Revisar entrega e CQ',
    openScada: 'Abrir SCADA',
    openChronicle: 'Abrir a Crônica do moinho',
    openOverview: 'Abrir a Visão geral',
    openOverviewQc: 'Abrir Visão geral e CQ',
    inspectMill: 'Inspecionar um moinho de rolos',
    firstDelivery: 'Sua primeira entrega',
    deliveryFor: 'Entrega para {customer}',
    orderLine: '{customer}: {kg} kg de {product}',
    awaitingOrder: 'Aguardando um pedido',
    truckLoad: 'Carga do caminhão de expedição',
    truckLoadValue: '{loaded} / {capacity} kg',
    truckLoadValueText: '{loaded} de {capacity} quilogramas no caminhão',
    showMilling: 'Ver a moagem',
    showPacking: 'Ver o ensaque',
    showShipping: 'Ver a expedição',
    skipGuide: 'Pular a entrega guiada',
    handoffAgreement: 'Acordo de trabalho da passagem de turno',
    trialReceipts:
      'Expedido no turno atual: {kg} kg; remuneração conquistada retida: {pay} créditos.',
    trialRemaining: 'Restante do compromisso total com o cliente: {kg} kg.',
    linkedAgreement: 'Acordo de trabalho vinculado',
    deliveryOutcome: 'Entrega: {status}, {deliveredKg} / {targetKg} kg para {customer}.',
    deliveryStatus: (p: { status: string }) => pick(PT_DELIVERY_STATUS, p.status),
    agreedDeferral: 'Adiamento acordado: {kg} kg.',
    remainingCommitment: 'Restante do compromisso total com o cliente: {kg} kg.',
    fullCommitmentDispatched: ' Compromisso total com o cliente expedido.',
    followOnCredit:
      'A temporada agora atende {customer}: {kg} kg da expedição creditados à cooperativa.',
    agreementOutcome: 'Acordo de trabalho: {status}. Resultado combinado: {combined}.',
    agreementWhy: 'Motivo: {reason}',
    agreementPausedByReload:
      'Pausado por uma recarga no minuto {minute}: o turno continua quando todos consentirem de novo, em Autonomia.',
    agreementPausedBySafety:
      'Pausado por uma parada de emergência ou um simulado no minuto {minute}: o turno continua quando todos consentirem de novo, em Autonomia.',
    agreementPausedByObjection:
      'Pausado por uma objeção no minuto {minute}, já resolvida: o turno continua quando todos consentirem de novo, em Autonomia.',
    agreementStatus: (p: { status: string }) => pick(PT_AGREEMENT_STATUS, p.status),
    outcomeComplete: 'concluído',
    outcomeUnfinished: 'não concluído',
    individualObligations: 'Obrigações individuais',
    role: (p: { role: string }) => pick(PT_ROLE, p.role),
    memberCurrent: '{role}: descanso atual {rest} min; recuperação devida {owed} min.',
    memberCumulative:
      '{role}, acumulado: trabalho extra {extra} min; descanso {rest} min; recuperação devida {owed} min.',
    accounts:
      'Créditos do local de trabalho: caixa final {cash}; remuneração {wages}; compensação {compensation}; melhorias {improvements}; destinações {allocations}.',
    reviewAgreement: 'Revisar o acordo de trabalho',
    shiftCommitment: 'Seu compromisso do turno',
    activeCommitment: 'Compromisso ativo com o cliente',
    chooseCustomer: 'Escolha um cliente',
    switchChallengeHint: 'Conclua ou abandone o desafio antes de trocar de cliente.',
    switchReviewHint:
      'Conclua a temporada do acordo de trabalho vinculado e a recuperação devida antes de trocar de cliente.',
    switchHandoffHint:
      'Conclua a revisão da passagem de turno e a recuperação devida antes de trocar de cliente.',
    rushChoice:
      'Urgente: {customer} paga {premium}% a mais por {kg} kg de {product}. {due}. O controlador o executa primeiro, então ele sai no primeiro caminhão.',
    rushDeferRisk:
      ' Se um compromisso de outro produto vier antes, ele espera um caminhão seguinte e passa do prazo, com o dobro da multa usual por atraso.',
    rushChangeover:
      ' É o único pedido de {grain}, então executá-lo primeiro troca a linha para ele e de volta.',
    activeOrderProgress: '{customer}: {shippedKg} / {requiredKg} kg expedidos',
    programmeCompleteCurrent: 'Programa atual concluído',
    blocked: 'Bloqueado',
    attention: 'Atenção',
    failureCosts: 'Custos das falhas',
    purchases: 'Comprado neste turno',
    proposalsHeading: 'Propostas do parceiro',
    costLate: 'Entrega atrasada: £{rate} por hora de jogo',
    costMaintenance: 'Ordens de serviço abertas: £{rate} por hora de jogo',
    costDemurrage: 'Caminhão retido na doca: £{rate} por hora de jogo',
    costShiftTotal:
      'Neste turno, até agora: £{total} em penalidades por atraso e por qualidade, reparos e espera na doca.',
    challengeProgress: 'Progresso do desafio de recuperação',
    challengeProgressLine: (p: ChallengeProgressParams) =>
      `${p.label}: ${p.dispatchedKg} / ${p.targetKg} kg, ${p.count === 1 ? 'falta' : 'faltam'} ${
        p.minutes
      } ${p.count === 1 ? 'minuto' : 'minutos'} de simulação`,
    responseQueued: 'A resposta está na fila.',
    awaitingUpdate: 'Aguardando atualização da simulação',
    nextLine: 'Próximo passo: {label}',
    replayGuide: 'Repetir a entrega guiada',
    lastChallenge: 'Último desafio: {status}.',
    challengeStatus: (p: { status: string }) => pick(PT_CHALLENGE_STATUS, p.status),
    agreementProfile: 'Perfil do acordo de trabalho',
    profileToeDip: charterTitle('pt-BR', 'toe-dip'),
    profileTeam: charterTitle('pt-BR', 'team'),
    profileCooperative: charterTitle('pt-BR', 'cooperative'),
    startCampaign: 'Iniciar temporada cooperativa de 3 turnos com este pedido (1x)',
    adjustChallenge: 'Ajustar o desafio',
    challengeTerms: '{hours} h para recuperar · até {kg} kg para expedir',
    abandonChallenge: 'Abandonar desafio',
    savedReports: 'Relatórios de turno salvos',
    shiftDebrief: 'Balanço do turno',
    noReports: (p: { shift: string; time: string }) =>
      `O relatório do turno ${PT_SHIFT_OF[p.shift] ?? p.shift} é salvo quando o turno fecha às ${p.time}.`,
    readEarlierReports: (p: { count: number; countText: string }) =>
      `Ler ${p.countText} ${p.count === 1 ? 'relatório anterior' : 'relatórios anteriores'}`,
    reportHeading: '{shift}: nota {grade}',
    reportHeadingUngraded: '{shift}: sem compromissos com clientes, sem nota',
    reportHeadingNothingDue: '{shift}: nada venceu ainda, sem nota',
    reportHeadingProvisionalNothingDue: '{shift} até agora: nada venceu ainda',
    reportHeadingProvisional: '{shift} até agora: nota provisória {grade}',
    reportHeadingProvisionalUngraded: '{shift} até agora: ainda sem compromissos com clientes',
    ordersHeading: 'Pedidos neste turno',
    choicesHeading: 'Suas decisões neste turno',
    agentChoice: 'Agente de IA: {message}',
    noChoices:
      'Nenhuma escolha foi registrada neste turno; o moinho funcionou com seus controladores.',
    narrationHeading: 'O que o moinho fez',
    shiftLogHeading: 'Registro do turno',
    noDecisions: 'Nada foi registrado nesta janela salva.',
    decisionsNotSaved: 'O registro não foi salvo com este relatório.',
    carryForward: 'Levar para o próximo turno: {risks}',
    acceptNextProgramme: 'Aceitar o próximo programa de entregas',
    acceptNextHint:
      'Primeiro conclua os compromissos atuais com clientes, qualquer desafio e a revisão final vinculada, com recuperação e objeções resolvidas.',
  },
});
