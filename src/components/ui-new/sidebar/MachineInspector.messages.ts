import { defineMessages } from '../../../i18n';

const PT_STATUS: Record<string, string> = {
  running: 'em operação',
  idle: 'em espera',
  warning: 'em alerta',
  critical: 'em estado crítico',
};

const PT_MAINTENANCE_TYPES: Record<string, string> = {
  preventive: 'preventiva',
  corrective: 'corretiva',
  emergency: 'emergencial',
};

const PT_PARTS: Record<string, string> = {
  filters: 'filtros',
  bearings: 'rolamentos',
  belts: 'correias',
  sensors: 'sensores',
  motors: 'motores',
};

export const machineInspectorMessages = defineMessages({
  en: {
    criticalRestartGuidance:
      'Critical fault. Restart is locked until maintenance or a repair clears it.',
    repairGuidance:
      'Active repair work order. Use Mill Overview to dispatch service, complete and verify the repair, then request a controlled restart.',
    warningGuidance: "Something's off. Check the metrics and maintenance log.",

    flowUnavailable: 'Flow unavailable',
    storageInventory: 'Storage inventory',
    waitingForMaterial: 'Waiting for material',
    waitingForOutputSpace: 'Waiting for output space',
    processingStopped: 'Processing stopped',
    materialReady: 'Material ready',

    // Status, maintenance type and part ids are store values shown as words.
    status: (p: { status: string }) => p.status,
    statusLabel: (p: { status: string }) => `Machine status: ${p.status}`,
    maintenanceType: (p: { type: string }) => p.type,

    feedRate: 'Feed rate',
    rpm: 'RPM',
    motorLoad: 'Motor load',
    temperature: 'Temperature',
    vibration: 'Vibration',
    inspect: 'Inspect',
    materialFlowEvidence: 'Material-flow evidence',
    inputBuffer: 'Input buffer',
    outputBuffer: 'Output buffer',

    hideLogs: 'Hide Maintenance Logs',
    viewLogs: 'View Maintenance Logs',
    outOfParts: 'Out of spare parts — maintenance needs one to proceed.',
    wearAndService: 'Wear and service',
    wear: 'Wear',
    wearThresholds:
      'Warning at {warning}%, breakdown at {breakdown}%. Efficiency {efficiency}%. Maintenance lowers wear; a restart does not.',
    maintenanceCost: (p: { part: string; count: string }) =>
      `Uses 1 spare part: ${p.part} (${p.count} in stock).`,
    maintenanceTitle: (p: { part: string }) =>
      `Reduces machine wear (consumes 1 spare part: ${p.part})`,
    maintenanceBelowMinimum:
      'Not needed yet: wear {wear}% is below the {minimum}% service minimum, so the unit runs at full efficiency.',
    performingMaintenance: 'Performing Maintenance...',
    performMaintenance: 'Perform Maintenance',
    restarting: 'Restarting...',
    restartUnit: 'Restart Unit',
    recentMaintenance: 'Recent Maintenance',
    noMaintenance: 'No maintenance on record. Either it is new, or it has been very lucky.',
    serviceUnit: 'Service unit: {unit}',
    focusMachine: 'Focus machine',

    noPartsTitle: 'No Spare Parts',
    noPartsMessage:
      'Cannot perform maintenance on {name}: parts inventory is empty. Wait for a parts delivery.',
    maintenanceNotNeededTitle: 'Maintenance Not Needed',
    maintenanceNotNeededMessage: '{name}: {message}',
    machineRecoveredTitle: 'Machine Recovered',
    machineRestartedTitle: 'Machine Restarted',
    machineRecoveredMessage: '{name} has been restarted and metrics reset to healthy values.',
    machineRestartedMessage: '{name} has been successfully restarted.',
    machineRestartedWornTitle: 'Restarted, Still Worn',
    machineRestartedWornMessage:
      '{name} restarted, but wear is still {wear}% (it warns from {threshold}%). A restart does not reduce wear: use Perform Maintenance.',

    trendLabel: 'Recorded feed rate trend in {unit}',
    trendWaiting: 'Waiting for the historian to collect enough to draw a line.',
    trendCaption: 'Feed rate ({unit}), recorded samples',
  },
  'pt-BR': {
    criticalRestartGuidance:
      'Falha crítica. O reinício fica bloqueado até que uma manutenção ou um reparo resolva a falha.',
    repairGuidance:
      'Ordem de serviço de reparo ativa. Use a Visão geral do moinho para enviar a equipe de manutenção, concluir e verificar o reparo e, depois, solicitar um reinício controlado.',
    warningGuidance: 'Algo não está certo. Confira as métricas e o registro de manutenção.',

    flowUnavailable: 'Fluxo indisponível',
    storageInventory: 'Estoque armazenado',
    waitingForMaterial: 'Aguardando material',
    waitingForOutputSpace: 'Aguardando espaço na saída',
    processingStopped: 'Processamento parado',
    materialReady: 'Material disponível',

    status: (p: { status: string }) => PT_STATUS[p.status] ?? p.status,
    statusLabel: (p: { status: string }) => `Status da máquina: ${PT_STATUS[p.status] ?? p.status}`,
    maintenanceType: (p: { type: string }) => PT_MAINTENANCE_TYPES[p.type] ?? p.type,

    feedRate: 'Vazão de alimentação',
    rpm: 'RPM',
    motorLoad: 'Carga do motor',
    temperature: 'Temperatura',
    vibration: 'Vibração',
    inspect: 'Inspecionar',
    materialFlowEvidence: 'Evidências do fluxo de material',
    inputBuffer: 'Estoque intermediário de entrada',
    outputBuffer: 'Estoque intermediário de saída',

    hideLogs: 'Ocultar registros de manutenção',
    viewLogs: 'Ver registros de manutenção',
    outOfParts: 'Sem peças de reposição: a manutenção precisa de uma para continuar.',
    wearAndService: 'Desgaste e manutenção',
    wear: 'Desgaste',
    wearThresholds:
      'Alerta em {warning}%, pane em {breakdown}%. Eficiência de {efficiency}%. A manutenção reduz o desgaste; o reinício, não.',
    maintenanceCost: (p: { part: string; count: string }) =>
      `Usa 1 peça de reposição: ${PT_PARTS[p.part] ?? p.part} (${p.count} em estoque).`,
    maintenanceTitle: (p: { part: string }) =>
      `Reduz o desgaste da máquina (consome 1 peça de reposição: ${PT_PARTS[p.part] ?? p.part})`,
    maintenanceBelowMinimum:
      'Ainda não é necessária: o desgaste de {wear}% está abaixo do mínimo de {minimum}% para manutenção, e a unidade opera com eficiência total.',
    performingMaintenance: 'Fazendo manutenção...',
    performMaintenance: 'Fazer manutenção',
    restarting: 'Reiniciando...',
    restartUnit: 'Reiniciar unidade',
    recentMaintenance: 'Manutenções recentes',
    noMaintenance: 'Nenhuma manutenção registrada. Ou a máquina é nova, ou tem tido muita sorte.',
    serviceUnit: 'Unidade de serviço: {unit}',
    focusMachine: 'Focar na máquina',

    noPartsTitle: 'Sem peças de reposição',
    noPartsMessage:
      'Não é possível fazer manutenção em {name}: o estoque de peças está vazio. Aguarde uma entrega de peças.',
    maintenanceNotNeededTitle: 'Manutenção desnecessária',
    maintenanceNotNeededMessage: '{name}: {message}',
    machineRecoveredTitle: 'Máquina recuperada',
    machineRestartedTitle: 'Máquina reiniciada',
    machineRecoveredMessage:
      '{name}: reinício concluído e métricas redefinidas para valores saudáveis.',
    machineRestartedMessage: '{name}: reinício concluído com sucesso.',
    machineRestartedWornTitle: 'Reiniciada, ainda desgastada',
    machineRestartedWornMessage:
      '{name} reiniciou, mas o desgaste continua em {wear}% (o alerta começa em {threshold}%). Reiniciar não reduz o desgaste: use Fazer manutenção.',

    trendLabel: 'Tendência registrada da vazão de alimentação em {unit}',
    trendWaiting: 'Aguardando o histórico reunir dados suficientes para traçar uma linha.',
    trendCaption: 'Vazão de alimentação ({unit}), amostras registradas',
  },
});
