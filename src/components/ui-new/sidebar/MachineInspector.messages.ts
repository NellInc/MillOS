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

// 'a, b and c' / 'a, b e c'.
const joinAnd = (items: readonly string[], and: string): string =>
  items.length < 2
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} ${and} ${items[items.length - 1]}`;

export const machineInspectorMessages = defineMessages({
  en: {
    criticalRestartGuidance:
      'Critical fault. Restart is locked until maintenance or a repair clears it.',
    repairGuidance:
      'Active repair work order. Use Mill Overview to dispatch service, complete and verify the repair, then request a controlled restart.',
    warningGuidance: "Something's off. Check the metrics and maintenance log.",
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
    wearThresholds:
      'Warning at {warning}%, breakdown at {breakdown}%. Efficiency {efficiency}%. Maintenance lowers wear; a restart does not.',
    maintenanceCost: (p: { part: string; count: string }) =>
      `Uses 1 spare part: ${p.part} (${p.count} in stock).`,
    maintenanceCostHeld: (p: { part: string; count: string; held: string }) =>
      `Uses 1 spare part: ${p.part} (${p.count} in stock, ${p.held} held for repairs).`,
    maintenanceTitle: (p: { part: string }) =>
      `Reduces machine wear (consumes 1 spare part: ${p.part})`,
    maintenanceCostBooked: (p: { parts: readonly string[]; counts: readonly string[] }) =>
      `Uses the booked service: ${p.parts.join(', ')} (${joinAnd(p.counts, 'and')} in stock).`,
    maintenanceBookedShort: (p: { parts: readonly string[] }) =>
      `The booked service waits for parts: ${p.parts.join(', ')}.`,
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
    noPartsHeldMessage:
      'Cannot perform maintenance on {name}: every part in stock is held for a repair. Wait for a parts delivery.',
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
      `${p.name} restarted, but wear is still ${formatFixed(p.wear, 1, 'en')}% (it warns from ${formatFixed(p.threshold, 0, 'en')}%). A restart does not reduce wear: use Perform Maintenance.`,
    machineRestartedIncidentTitle: 'Restarted, Still Warning',
    machineRestartedIncidentMessage:
      '{name} restarted, but an open incident keeps it in warning until the incident is mitigated. A restart does not clear it.',

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
    idleRestartGuidance:
      'Esta máquina está parada. Reiniciar unidade, em Inspecionar, a coloca de volta à operação.',
    facilityStopRestartGuidance:
      'A unidade está parada. Libere a parada antes de reiniciar uma máquina.',
    facilityStopMaintainGuidance:
      'A unidade está parada. Libere a parada antes de fazer manutenção em uma máquina.',

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
    wearThresholds:
      'Alerta em {warning}%, pane em {breakdown}%. Eficiência de {efficiency}%. A manutenção reduz o desgaste; o reinício, não.',
    maintenanceCost: (p: { part: string; count: string }) =>
      `Usa 1 peça de reposição: ${PT_PARTS[p.part] ?? p.part} (${p.count} em estoque).`,
    maintenanceCostHeld: (p: { part: string; count: string; held: string }) =>
      `Usa 1 peça de reposição: ${PT_PARTS[p.part] ?? p.part} (${p.count} em estoque, ${p.held} reservadas para reparos).`,
    maintenanceTitle: (p: { part: string }) =>
      `Reduz o desgaste da máquina (consome 1 peça de reposição: ${PT_PARTS[p.part] ?? p.part})`,
    maintenanceCostBooked: (p: { parts: readonly string[]; counts: readonly string[] }) =>
      `Usa o serviço agendado: ${p.parts.map((part) => PT_PARTS[part] ?? part).join(', ')} (${joinAnd(p.counts, 'e')} em estoque).`,
    maintenanceBookedShort: (p: { parts: readonly string[] }) =>
      `O serviço agendado aguarda peças: ${p.parts.map((part) => PT_PARTS[part] ?? part).join(', ')}.`,
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
    machineRestartedWornTitle: 'Reiniciada, ainda desgastada',
    machineRestartedWornMessage: (p: { name: string; wear: number; threshold: number }) =>
      `${p.name} reiniciou, mas o desgaste continua em ${formatFixed(p.wear, 1, 'pt-BR')}% (o alerta começa em ${formatFixed(p.threshold, 0, 'pt-BR')}%). Reiniciar não reduz o desgaste: use Fazer manutenção.`,
    machineRestartedIncidentTitle: 'Reiniciada, ainda em alerta',
    machineRestartedIncidentMessage:
      '{name} reiniciou, mas um incidente aberto a mantém em alerta até ser mitigado. Reiniciar não o resolve.',

    trendLabel: 'Tendência registrada da vazão de alimentação em {unit}',
    trendWaiting: 'Aguardando o histórico reunir dados suficientes para traçar uma linha.',
    trendCaption: 'Vazão de alimentação ({unit}), amostras registradas',
  },
});
