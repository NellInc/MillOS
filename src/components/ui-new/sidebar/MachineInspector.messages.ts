import { defineMessages, formatFixed, upperFirst } from '../../../i18n';

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
    // The refusal's own words (beginUnitService 'fault'), at both held buttons.
    repairGuidance: 'Machine is under repair: complete the work order first.',
    openWorkOrder: 'Open the work order',
    // Kept (D14): the way out of an idle unit; Restart sits in a closed disclosure.
    idleRestartGuidance:
      'This unit is stopped. Restart Unit, under Inspect, returns it to service.',
    facilityStopRestartGuidance:
      'The facility is stopped. Clear the stop before restarting a unit.',
    facilityStopMaintainGuidance:
      'The facility is stopped. Clear the stop before servicing a unit.',

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
    partsAllHeld: 'Every spare part in stock is held for a repair; maintenance needs a free one.',
    wearAndService: 'Wear and service',
    wear: 'Wear',
    wearThresholds: 'Warning at {warning}%, breakdown at {breakdown}%. Efficiency {efficiency}%.',
    maintenanceCost: (p: { part: string; count: string }) =>
      `Uses 1 spare part: ${p.part} (${p.count} in stock), returned if a fault ends the service.`,
    maintenanceCostHeld: (p: { part: string; count: string; held: string }) =>
      `Uses 1 spare part: ${p.part} (${p.count} in stock, ${p.held} held for repairs), returned if a fault ends the service.`,
    maintenanceBelowMinimum:
      'Not needed yet: wear {wear}% is below the {minimum}% service minimum.',
    performingMaintenance: 'Performing Maintenance...',
    performMaintenance: 'Perform Maintenance',
    performMaintenanceOffline: (p: { part: string; minutes: string }) =>
      p.part
        ? `Perform Maintenance · 1 × ${p.part} · ${p.minutes} min offline`
        : `Perform Maintenance · ${p.minutes} min offline`,
    servicingMinutesLeft: 'Offline for service · {minutes} min left',
    servicePausedCrew: 'Service paused · Maintenance away, back at {time}',
    serviceAwaitingCrew: 'Service waits for Maintenance · back at {time}',
    restarting: 'Restarting...',
    restartUnit: 'Restart Unit',
    recentMaintenance: 'Recent Maintenance',
    noMaintenance: 'No maintenance on record.',
    serviceUnit: 'Service unit: {unit}',
    focusMachine: 'Focus machine',

    noPartsTitle: 'No Spare Parts',
    noPartsMessage:
      'Cannot perform maintenance on {name}: parts inventory is empty. Wait for a parts delivery.',
    noPartsHeldMessage:
      'Cannot perform maintenance on {name}: every part in stock is held for a repair. Wait for a parts delivery.',
    // No longer raised (a booked service costs one part, as Maintain does);
    // kept so a notice saved in the bell still reads.
    noBookedPartsMessage:
      'Cannot perform maintenance on {name}: its booked service needs parts that are not free in stock. Wait for a parts delivery.',
    maintenanceNotNeededTitle: 'Maintenance Not Needed',
    maintenanceNotNeededMessage: '{name}: {message}',
    machineRecoveredTitle: 'Machine Recovered',
    machineRestartedTitle: 'Machine Restarted',
    machineRecoveredMessage: '{name} has been restarted and metrics reset to healthy values.',
    machineRestartedMessage: '{name} has been successfully restarted.',
    machineRestartedWornTitle: 'Restarted, Still Worn',
    // Raw numbers, formatted here, so a notice kept in the bell reads them in
    // the language active when it is read.
    machineRestartedWornMessage: (p: { name: string; wear: number; threshold: number }) =>
      `${p.name} restarted, but wear is still ${formatFixed(p.wear, 1, 'en')}% (it warns from ${formatFixed(p.threshold, 0, 'en')}%).`,
    machineRestartedIncidentTitle: 'Restarted, Still Warning',
    machineRestartedIncidentMessage:
      '{name} restarted, but an open incident keeps it in warning until the incident is mitigated.',
    // Filed by the tick (unitService) when a fault ends a service under way.
    serviceEndedByFaultTitle: 'Service ended by a fault',
    serviceEndedByFaultMessage: (p: { name: string; part: string }) =>
      `${p.name} faulted during its service. Its spare part (${p.part}) went back to stock; the repair takes over.`,

    trendLabel: 'Recorded feed rate trend in {unit}',
    trendCaption: 'Feed rate ({unit})',
  },
  'pt-BR': {
    criticalRestartGuidance:
      'Falha crítica. O reinício fica bloqueado até que uma manutenção ou um reparo resolva a falha.',
    repairGuidance: 'A máquina está em reparo: conclua primeiro a ordem de serviço.',
    openWorkOrder: 'Abrir a ordem de serviço',
    idleRestartGuidance:
      'Esta máquina está parada. Reiniciar unidade, em Inspecionar, a coloca de volta à operação.',
    facilityStopRestartGuidance:
      'O moinho está parado. Libere a parada antes de reiniciar uma máquina.',
    facilityStopMaintainGuidance:
      'O moinho está parado. Libere a parada antes de fazer manutenção em uma máquina.',

    flowUnavailable: 'Fluxo indisponível',
    storageInventory: 'Estoque armazenado',
    waitingForMaterial: 'Aguardando material',
    waitingForOutputSpace: 'Aguardando espaço na saída',
    processingStopped: 'Processamento parado',
    materialReady: 'Material disponível',

    status: (p: { status: string }) => upperFirst(PT_STATUS[p.status] ?? p.status),
    statusLabel: (p: { status: string }) => `Status da máquina: ${PT_STATUS[p.status] ?? p.status}`,
    maintenanceType: (p: { type: string }) => upperFirst(PT_MAINTENANCE_TYPES[p.type] ?? p.type),

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
    partsAllHeld:
      'Todas as peças em estoque estão reservadas para reparos; a manutenção precisa de uma livre.',
    wearAndService: 'Desgaste e manutenção',
    wear: 'Desgaste',
    wearThresholds: 'Alerta em {warning}%, pane em {breakdown}%. Eficiência de {efficiency}%.',
    maintenanceCost: (p: { part: string; count: string }) =>
      `Usa 1 peça de reposição: ${PT_PARTS[p.part] ?? p.part} (${p.count} em estoque), devolvida se uma falha interromper a manutenção.`,
    maintenanceCostHeld: (p: { part: string; count: string; held: string }) =>
      `Usa 1 peça de reposição: ${PT_PARTS[p.part] ?? p.part} (${p.count} em estoque, ${p.held} reservadas para reparos), devolvida se uma falha interromper a manutenção.`,
    maintenanceBelowMinimum:
      'Ainda não é necessária: o desgaste de {wear}% está abaixo do mínimo de {minimum}% para manutenção.',
    performingMaintenance: 'Fazendo manutenção...',
    performMaintenance: 'Fazer manutenção',
    performMaintenanceOffline: (p: { part: string; minutes: string }) =>
      p.part
        ? `Fazer manutenção · 1 × ${PT_PARTS[p.part] ?? p.part} · ${p.minutes} min fora de operação`
        : `Fazer manutenção · ${p.minutes} min fora de operação`,
    servicingMinutesLeft: 'Fora de operação para manutenção · faltam {minutes} min',
    servicePausedCrew: 'Manutenção pausada · a equipe de Manutenção volta em {time}',
    serviceAwaitingCrew: 'Manutenção à espera da equipe · volta em {time}',
    restarting: 'Reiniciando...',
    restartUnit: 'Reiniciar unidade',
    recentMaintenance: 'Manutenções recentes',
    noMaintenance: 'Nenhuma manutenção registrada.',
    serviceUnit: 'Unidade de serviço: {unit}',
    focusMachine: 'Focar na máquina',

    noPartsTitle: 'Sem peças de reposição',
    noPartsMessage:
      'Não é possível fazer manutenção em {name}: o estoque de peças está vazio. Aguarde uma entrega de peças.',
    noPartsHeldMessage:
      'Não é possível fazer a manutenção de {name}: todas as peças em estoque estão reservadas para reparos. Aguarde uma entrega de peças.',
    noBookedPartsMessage:
      'Não é possível fazer a manutenção de {name}: o serviço agendado precisa de peças que não estão livres em estoque. Aguarde uma entrega de peças.',
    maintenanceNotNeededTitle: 'Manutenção desnecessária',
    maintenanceNotNeededMessage: '{name}: {message}',
    machineRecoveredTitle: 'Máquina recuperada',
    machineRestartedTitle: 'Máquina reiniciada',
    machineRecoveredMessage:
      '{name}: reinício concluído e métricas redefinidas para valores saudáveis.',
    machineRestartedMessage: '{name}: reinício concluído com sucesso.',
    machineRestartedWornTitle: 'Reinício concluído, desgaste ainda alto',
    machineRestartedWornMessage: (p: { name: string; wear: number; threshold: number }) =>
      `${p.name} reiniciou, mas o desgaste continua em ${formatFixed(p.wear, 1, 'pt-BR')}% (o alerta começa em ${formatFixed(p.threshold, 0, 'pt-BR')}%).`,
    machineRestartedIncidentTitle: 'Reinício concluído, ainda em alerta',
    machineRestartedIncidentMessage:
      '{name} reiniciou, mas uma ocorrência aberta mantém a máquina em alerta até ser mitigada.',
    serviceEndedByFaultTitle: 'Manutenção interrompida por uma falha',
    serviceEndedByFaultMessage: (p: { name: string; part: string }) =>
      `${p.name} falhou durante a manutenção. A peça de reposição (${PT_PARTS[p.part] ?? p.part}) voltou ao estoque; o reparo assume.`,

    trendLabel: 'Tendência registrada da vazão de alimentação em {unit}',
    trendCaption: 'Vazão de alimentação ({unit})',
  },
});
