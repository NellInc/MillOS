import { defineMessages } from '../i18n';

const capitalise = (value: string): string => `${value[0].toUpperCase()}${value.slice(1)}`;

const PT_SHIFT_LABELS: Record<string, string> = {
  morning: 'Manhã',
  afternoon: 'Tarde',
  night: 'Noite',
};

/* "Turno da manhã encerrado": the shift as it reads after "Turno". */
const PT_SHIFT_OF: Record<string, string> = {
  morning: 'da manhã',
  afternoon: 'da tarde',
  night: 'da noite',
};

const PT_MATERIALS: Record<string, string> = {
  flour: 'farinha liberada',
  semolina: 'semolina liberada',
};

/** Alerts, celebrations and dispatch hold reasons raised by the unified game tick. */
export const unifiedGameTickMessages = defineMessages({
  en: {
    supplierTraceabilityNote:
      'Supplier notification requires traceability review before dispatch release.',
    incidentAlert:
      '{description} The operations workspace records the response and residual controls.',
    shiftClosedTitle: (p: { shift: string; grade: string }) =>
      `${capitalise(p.shift)} shift closed: grade ${p.grade}`,
    shiftClosedUngradedTitle: (p: { shift: string }) =>
      `${capitalise(p.shift)} shift closed: no customer commitments`,
    shiftClosedMessage:
      'Its review is in Overview, under Shift debrief: which orders were on time, what held the grade back and what to try next.',
    dailyTargetReached: 'Daily target reached: {target} bags!',
    dailyTargetMilestone: 'Daily target {threshold}% complete',
    certificationExpired: 'Quality certification is expired.',
    unresolvedContamination: 'A contamination alert remains unresolved.',
    failedQualityTest: 'The latest laboratory result failed.',
    incidentDispatchIsolation: 'An active operational incident requires dispatch isolation.',
    qualityInterlockNotReleased: 'The quality interlock is not released.',
    departedWithoutLoad: 'Truck departed without a released load.',
    waitingForMaterial: (p: { material: string }) =>
      `Waiting for released ${p.material} at the packers.`,
    dispatchQualityHoldTitle: 'Dispatch Quality Hold',
    shippingAwaitingProductTitle: 'Shipping Awaiting Product',
    clearBeforeRelease:
      '{reason} Clear the condition before release. While the truck waits at the dock it costs £{rate} per game hour.',
    waitingForProduct: 'Waiting for released product at the packers.',
    shiftLabel: (p: { shift: string }) => capitalise(p.shift),
    breakdownTitle: 'Machine Breakdown',
    breakdownMessage:
      '{name} ({machineType}) has broken down due to excessive wear. Open Mill Overview, Maintenance: work order {workOrderId} needs service dispatched, the repair verified and a controlled restart. Each open work order costs £{rate} per game hour.',
  },
  'pt-BR': {
    supplierTraceabilityNote:
      'A notificação do fornecedor exige revisão de rastreabilidade antes da liberação para expedição.',
    incidentAlert:
      '{description} O espaço de trabalho de operações registra a resposta e os controles residuais.',
    shiftClosedTitle: (p: { shift: string; grade: string }) =>
      `Turno ${PT_SHIFT_OF[p.shift] ?? p.shift} encerrado: nota ${p.grade}`,
    shiftClosedUngradedTitle: (p: { shift: string }) =>
      `Turno ${PT_SHIFT_OF[p.shift] ?? p.shift} encerrado: sem compromissos com clientes`,
    shiftClosedMessage:
      'A revisão está na Visão geral, em Balanço do turno: quais pedidos chegaram no prazo, o que impediu uma nota melhor e o que tentar a seguir.',
    dailyTargetReached: 'Meta diária atingida: {target} sacos!',
    dailyTargetMilestone: 'Meta diária: {threshold}% concluída',
    certificationExpired: 'A certificação de qualidade está vencida.',
    unresolvedContamination: 'Um alerta de contaminação continua sem resolução.',
    failedQualityTest: 'O resultado de laboratório mais recente foi reprovado.',
    incidentDispatchIsolation: 'Uma ocorrência operacional ativa exige o isolamento da expedição.',
    qualityInterlockNotReleased: 'O intertravamento de qualidade não está liberado.',
    departedWithoutLoad: 'O caminhão saiu sem uma carga liberada.',
    waitingForMaterial: (p: { material: string }) =>
      `Aguardando ${PT_MATERIALS[p.material] ?? p.material} nas ensacadeiras.`,
    dispatchQualityHoldTitle: 'Retenção de qualidade na expedição',
    shippingAwaitingProductTitle: 'Expedição aguardando produto',
    clearBeforeRelease:
      '{reason} Resolva a condição antes da liberação. Enquanto o caminhão espera na doca, o custo é de £{rate} por hora de jogo.',
    waitingForProduct: 'Aguardando produto liberado nas ensacadeiras.',
    shiftLabel: (p: { shift: string }) => PT_SHIFT_LABELS[p.shift] ?? capitalise(p.shift),
    breakdownTitle: 'Pane de máquina',
    breakdownMessage:
      '{name} ({machineType}) entrou em pane por desgaste excessivo. Abra Visão geral do moinho, Manutenção: a ordem de serviço {workOrderId} precisa do envio da equipe, da verificação do reparo e de um reinício controlado. Cada ordem de serviço aberta custa £{rate} por hora de jogo.',
  },
});
