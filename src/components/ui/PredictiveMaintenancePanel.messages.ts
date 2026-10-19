import { defineMessages } from '../../i18n';

/**
 * Store enums render as their raw value in English (underscores spaced, and the
 * phase is capitalised by CSS), so the English messages reproduce that exactly.
 */
const PT_PART: Record<string, string> = {
  bearings: 'rolamentos',
  belts: 'correias',
  filters: 'filtros',
  motors: 'motores',
  sensors: 'sensores',
};

const PT_FAILURE: Record<string, string> = {
  mechanical: 'falha mecânica',
  electrical: 'falha elétrica',
  overheating: 'superaquecimento',
  vibration_failure: 'falha por vibração',
};

const PT_PHASE: Record<string, string> = {
  diagnosed: 'diagnosticada',
  awaiting_parts: 'aguardando peças',
  repairing: 'em reparo',
  verification: 'em verificação',
  ready_to_restart: 'pronta para reiniciar',
  restart_requested: 'reinício solicitado',
  returned_to_service: 'de volta à operação',
};

const PT_PRIORITY: Record<string, string> = {
  high: 'alta',
  medium: 'média',
  low: 'baixa',
};

const PT_TASK_TYPE: Record<string, string> = {
  preventive: 'Preventiva',
  predictive: 'Preditiva',
};

export const predictiveMaintenancePanelMessages = defineMessages({
  en: {
    title: 'Predictive Maintenance',

    partsInventory: 'Parts Inventory',
    low: 'LOW',
    partBearings: 'Bearings',
    partBelts: 'Belts',
    partFilters: 'Filters',
    partMotors: 'Motors',
    partSensors: 'Sensors',
    /** Lower-case part name as listed in work orders and tasks. */
    part: (p: { part: string }) => p.part,

    predictiveAlerts: 'Predictive Alerts',
    noPredictedFailures: 'No predicted failures',
    failureType: (p: { type: string }) => p.type.replaceAll('_', ' '),
    modelConfidence: 'model confidence',
    estimatedWindow: 'Estimated window: {window} game time',
    windowHours: '{hours} h',
    windowMinutes: '{minutes} min',
    alreadyScheduledFor: 'Maintenance already scheduled for {machine}',
    scheduleFor: 'Schedule maintenance for {machine}',
    scheduled: 'Scheduled',
    schedule: 'Schedule',
    acknowledgeFor: 'Acknowledge prediction for {machine}',
    acknowledge: 'Acknowledge',

    activeFaults: 'Active Faults',
    phase: (p: { phase: string }) => p.phase.replaceAll('_', ' '),
    service: 'Service:',
    serviceUnit: 'Autonomous service unit',
    downtime: 'Downtime:',
    parts: 'Parts: {parts}',
    awaitingStock: 'Awaiting stock: {parts}',
    repairProgress: 'Repair progress',
    dispatchServiceUnit: 'Dispatch service unit',
    completeRepair: 'Complete repair',
    verifyRepair: 'Verify repair',
    restartMachine: 'Restart machine',
    restartQueued: 'Controlled restart queued',

    scheduledMaintenance: 'Scheduled Maintenance',
    noScheduledMaintenance: 'No scheduled maintenance',
    taskType: (p: { type: string }) => p.type.charAt(0).toUpperCase() + p.type.slice(1),
    inspectionOnly: 'inspection only',
    priority: (p: { priority: string }) => p.priority,
    completeMaintenanceOn: 'Complete maintenance on {machine}',
    underRepairHint: 'Machine is under repair: complete the work order first',
    completeHint: 'Complete maintenance and consume listed parts',
    partsUnavailableHint: 'Required parts are unavailable',
    belowMinimumHint: 'Not needed yet: wear is below the {minimum}% service minimum',
    complete: 'Complete',
    maintenanceNotPerformed: 'Maintenance Not Performed',
  },
  'pt-BR': {
    title: 'Manutenção preditiva',

    partsInventory: 'Estoque de peças',
    low: 'BAIXO',
    partBearings: 'Rolamentos',
    partBelts: 'Correias',
    partFilters: 'Filtros',
    partMotors: 'Motores',
    partSensors: 'Sensores',
    part: (p: { part: string }) => PT_PART[p.part] ?? p.part,

    predictiveAlerts: 'Alertas preditivos',
    noPredictedFailures: 'Nenhuma falha prevista',
    failureType: (p: { type: string }) => PT_FAILURE[p.type] ?? p.type.replaceAll('_', ' '),
    modelConfidence: 'confiança do modelo',
    estimatedWindow: 'Janela estimada: {window} no tempo de jogo',
    windowHours: '{hours} h',
    windowMinutes: '{minutes} min',
    alreadyScheduledFor: 'Manutenção já agendada para {machine}',
    scheduleFor: 'Agendar manutenção para {machine}',
    scheduled: 'Agendada',
    schedule: 'Agendar',
    acknowledgeFor: 'Reconhecer a previsão de {machine}',
    acknowledge: 'Reconhecer',

    activeFaults: 'Falhas ativas',
    phase: (p: { phase: string }) => PT_PHASE[p.phase] ?? p.phase.replaceAll('_', ' '),
    service: 'Atendimento:',
    serviceUnit: 'Unidade de serviço autônoma',
    downtime: 'Tempo de parada:',
    parts: 'Peças: {parts}',
    awaitingStock: 'Aguardando estoque: {parts}',
    repairProgress: 'Progresso do reparo',
    dispatchServiceUnit: 'Enviar unidade de serviço',
    completeRepair: 'Concluir reparo',
    verifyRepair: 'Verificar reparo',
    restartMachine: 'Reiniciar máquina',
    restartQueued: 'Reinício controlado na fila',

    scheduledMaintenance: 'Manutenção agendada',
    noScheduledMaintenance: 'Nenhuma manutenção agendada',
    taskType: (p: { type: string }) =>
      PT_TASK_TYPE[p.type] ?? p.type.charAt(0).toUpperCase() + p.type.slice(1),
    inspectionOnly: 'somente inspeção',
    priority: (p: { priority: string }) => PT_PRIORITY[p.priority] ?? p.priority,
    completeMaintenanceOn: 'Concluir a manutenção de {machine}',
    underRepairHint: 'A máquina está em reparo: conclua primeiro a ordem de serviço',
    completeHint: 'Concluir a manutenção e consumir as peças listadas',
    partsUnavailableHint: 'As peças necessárias não estão disponíveis',
    belowMinimumHint: 'Ainda não é necessária: o desgaste está abaixo do mínimo de {minimum}%',
    complete: 'Concluir',
    maintenanceNotPerformed: 'Manutenção não realizada',
  },
});
