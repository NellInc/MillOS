import { defineMessages } from '../i18n';

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
    maintenanceNoWear: 'Machine has no wear to repair',
    maintenanceCompleteTitle: 'Maintenance Complete',
    maintenanceCompleteWearMessage:
      '{name} maintained. Wear reduced by {reduced}%, now at {wear}%. Efficiency: {efficiency}%',
    maintenanceCompleteRestoredMessage: '{name} restored to service. Efficiency: {efficiency}%',
    maintenanceResultWearReduced: 'Wear reduced from {from}% to {to}%',
    maintenanceResultRestored: 'Restored to service',
    breakdownTitle: 'Machine Breakdown',
    breakdownMessage:
      '{name} ({type}) has broken down due to excessive wear. Maintenance required.',
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
    maintenanceNoWear: 'A máquina não tem desgaste a reparar',
    maintenanceCompleteTitle: 'Manutenção concluída',
    maintenanceCompleteWearMessage:
      'Manutenção feita em {name}. Desgaste reduzido em {reduced}%, agora em {wear}%. Eficiência: {efficiency}%',
    maintenanceCompleteRestoredMessage: '{name} voltou a operar. Eficiência: {efficiency}%',
    maintenanceResultWearReduced: 'Desgaste reduzido de {from}% para {to}%',
    maintenanceResultRestored: 'De volta à operação',
    breakdownTitle: 'Pane de máquina',
    breakdownMessage:
      '{name} ({type}) entrou em pane por desgaste excessivo. Manutenção necessária.',
  },
});
