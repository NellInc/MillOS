import { defineMessages, formatFixed } from '../i18n';

/** Raw figures, formatted by the message itself so a kept notice follows the language. */
type ServiceNoticeParams = { name: string; reduced?: number; wear?: number; efficiency: number };

export const productionStoreMessages = defineMessages({
  en: {
    observationThroughput: 'Production throughput',
    observationEfficiency: 'Process efficiency',
    observationQuality: 'Product quality',
    observationMachineStatus: '{machine} status',
    observationMachineTemperature: '{machine} temperature',
    observationMachineLoad: '{machine} load',
    assumptionTelemetryCurrent: 'Simulator telemetry is current at the captured time.',
    affectedSystemAutonomousControl: 'Autonomous production control',
    affectedEquipmentProductionSystem: 'Production system',
    alternativeMaintainAction: 'Maintain the current simulated operating state',
    alternativeMaintainTradeoff:
      'Avoids intervention while leaving the observed condition unchanged.',
    rejectedWithNote: 'Rejected: {note}',
    rejectedByControlLayer: 'Rejected by the control layer',
    maintenanceMachineNotFound: 'Machine not found',
    maintenanceRepairLockout:
      'Repair lockout: complete and verify the work order, then request restart.',
    maintenanceBelowMinimumWear:
      'Wear is {wear}%, below the {minimum}% service minimum: the machine still runs at full efficiency.',
    maintenanceCompleteTitle: 'Maintenance Complete',
    maintenanceCompleteWearMessage: (p: ServiceNoticeParams) =>
      `${p.name} maintained. Wear reduced by ${formatFixed(p.reduced ?? 0, 1, 'en')}%, now at ${formatFixed(p.wear ?? 0, 1, 'en')}%. Efficiency: ${formatFixed(p.efficiency, 0, 'en')}%`,
    maintenanceCompleteRestoredMessage: (p: ServiceNoticeParams) =>
      `${p.name} restored to service. Efficiency: ${formatFixed(p.efficiency, 0, 'en')}%`,
    maintenanceResultWearReduced: 'Wear reduced from {from}% to {to}%',
    maintenanceResultRestored: 'Restored to service',
    maintenanceRecordDate: 'Day {day}, {time}',
    maintenanceRecordRoutineUnit: 'Line maintenance',
    maintenanceRecordRestartNote: 'Repaired and restarted under the work order. {wear}.',
  },
  'pt-BR': {
    observationThroughput: 'Vazão de produção',
    observationEfficiency: 'Eficiência do processo',
    observationQuality: 'Qualidade do produto',
    observationMachineStatus: 'Estado de {machine}',
    observationMachineTemperature: 'Temperatura de {machine}',
    observationMachineLoad: 'Carga de {machine}',
    assumptionTelemetryCurrent: 'A telemetria do simulador está atualizada no momento da captura.',
    affectedSystemAutonomousControl: 'Controle autônomo da produção',
    affectedEquipmentProductionSystem: 'Sistema de produção',
    alternativeMaintainAction: 'Manter o estado operacional simulado atual',
    alternativeMaintainTradeoff: 'Evita a intervenção, mas deixa inalterada a condição observada.',
    rejectedWithNote: 'Rejeitada: {note}',
    rejectedByControlLayer: 'Rejeitada pela camada de controle',
    maintenanceMachineNotFound: 'Máquina não encontrada',
    maintenanceRepairLockout:
      'Bloqueio de reparo: conclua e verifique a ordem de serviço; depois, solicite a nova partida.',
    maintenanceBelowMinimumWear:
      'O desgaste está em {wear}%, abaixo do mínimo de {minimum}% para manutenção: a máquina ainda opera com eficiência total.',
    maintenanceCompleteTitle: 'Manutenção concluída',
    maintenanceCompleteWearMessage: (p: ServiceNoticeParams) =>
      `Manutenção feita em ${p.name}. Desgaste reduzido em ${formatFixed(p.reduced ?? 0, 1, 'pt-BR')}%, agora em ${formatFixed(p.wear ?? 0, 1, 'pt-BR')}%. Eficiência: ${formatFixed(p.efficiency, 0, 'pt-BR')}%`,
    maintenanceCompleteRestoredMessage: (p: ServiceNoticeParams) =>
      `${p.name} voltou a operar. Eficiência: ${formatFixed(p.efficiency, 0, 'pt-BR')}%`,
    maintenanceResultWearReduced: 'Desgaste reduzido de {from}% para {to}%',
    maintenanceResultRestored: 'De volta à operação',
    maintenanceRecordDate: 'Dia {day}, {time}',
    maintenanceRecordRoutineUnit: 'Manutenção de linha',
    maintenanceRecordRestartNote: 'Reparada e reiniciada pela ordem de serviço. {wear}.',
  },
});
