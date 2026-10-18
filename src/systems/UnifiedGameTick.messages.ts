import { defineMessages } from '../i18n';

const capitalise = (value: string): string => `${value[0].toUpperCase()}${value.slice(1)}`;

const PT_SHIFT_LABELS: Record<string, string> = {
  morning: 'Manhã',
  afternoon: 'Tarde',
  night: 'Noite',
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
    dayCompleteTargetMet: 'Day complete: {bags} bags - target met!',
    dayComplete: 'Day complete: {bags} of {target} bags',
    dailyTargetReached: 'Daily target reached: {target} bags!',
    dailyTargetMilestone: 'Daily target {threshold}% complete',
    certificationExpired: 'Quality certification is expired.',
    unresolvedContamination: 'A contamination alert remains unresolved.',
    failedQualityTest: 'The latest laboratory result failed.',
    batchQualityHold: 'Available production batches remain on quality hold.',
    batchRecalled: 'Recalled production remains isolated from dispatch.',
    incidentDispatchIsolation: 'An active operational incident requires dispatch isolation.',
    qualityInterlockNotReleased: 'The quality interlock is not released.',
    departedWithoutLoad: 'Truck departed without a released load.',
    waitingForMaterial: (p: { material: string }) =>
      `Waiting for released ${p.material} at the packers.`,
    dispatchQualityHoldTitle: 'Dispatch Quality Hold',
    shippingAwaitingProductTitle: 'Shipping Awaiting Product',
    clearBeforeRelease: '{reason} Clear the condition before release.',
    waitingForProduct: 'Waiting for released product at the packers.',
    shiftLabel: (p: { shift: string }) => capitalise(p.shift),
    breakdownTitle: 'Machine Breakdown',
    breakdownMessage:
      '{name} ({machineType}) has broken down due to excessive wear. Work order {workOrderId} requires repair, verification, and controlled restart.',
  },
  'pt-BR': {
    supplierTraceabilityNote:
      'A notificação do fornecedor exige revisão de rastreabilidade antes da liberação para expedição.',
    incidentAlert:
      '{description} O espaço de trabalho de operações registra a resposta e os controles residuais.',
    dayCompleteTargetMet: 'Dia concluído: {bags} sacos - meta atingida!',
    dayComplete: 'Dia concluído: {bags} de {target} sacos',
    dailyTargetReached: 'Meta diária atingida: {target} sacos!',
    dailyTargetMilestone: 'Meta diária: {threshold}% concluída',
    certificationExpired: 'A certificação de qualidade está vencida.',
    unresolvedContamination: 'Um alerta de contaminação continua sem resolução.',
    failedQualityTest: 'O resultado de laboratório mais recente foi reprovado.',
    batchQualityHold: 'Os lotes de produção disponíveis continuam em retenção de qualidade.',
    batchRecalled: 'A produção recolhida continua isolada da expedição.',
    incidentDispatchIsolation: 'Uma ocorrência operacional ativa exige o isolamento da expedição.',
    qualityInterlockNotReleased: 'O intertravamento de qualidade não está liberado.',
    departedWithoutLoad: 'O caminhão saiu sem uma carga liberada.',
    waitingForMaterial: (p: { material: string }) =>
      `Aguardando ${PT_MATERIALS[p.material] ?? p.material} nas ensacadeiras.`,
    dispatchQualityHoldTitle: 'Retenção de qualidade na expedição',
    shippingAwaitingProductTitle: 'Expedição aguardando produto',
    clearBeforeRelease: '{reason} Resolva a condição antes da liberação.',
    waitingForProduct: 'Aguardando produto liberado nas ensacadeiras.',
    shiftLabel: (p: { shift: string }) => PT_SHIFT_LABELS[p.shift] ?? capitalise(p.shift),
    breakdownTitle: 'Pane de máquina',
    breakdownMessage:
      '{name} ({machineType}) entrou em pane por desgaste excessivo. A ordem de serviço {workOrderId} exige reparo, verificação e reinício controlado.',
  },
});
