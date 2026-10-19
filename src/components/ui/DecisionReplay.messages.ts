import { defineMessages, upperFirst } from '../../i18n';

/** pt-BR names for AIDecision enum values; English shows the raw value, as before. */
export const PT_DECISION_TYPES: Record<string, string> = {
  coordination: 'coordenação',
  optimization: 'otimização',
  prediction: 'previsão',
  maintenance: 'manutenção',
  safety: 'segurança',
};

export const PT_DECISION_STATUSES: Record<string, string> = {
  pending: 'pendente',
  in_progress: 'em andamento',
  completed: 'concluída',
  superseded: 'substituída',
};

export const PT_DECISION_PRIORITIES: Record<string, string> = {
  low: 'baixa',
  medium: 'média',
  high: 'alta',
  critical: 'crítica',
};

const PT_DISPOSITIONS: Record<string, string> = {
  accepted: 'aceita',
  modified: 'modificada',
  rejected: 'rejeitada',
  deferred: 'adiada',
  automatic: 'automática',
};

const PT_SOURCES: Record<string, string> = {
  simulation: 'simulação',
  scada: 'SCADA',
  control: 'controle',
  schedule: 'programação',
  prediction: 'previsão',
};

const PT_QUALITIES: Record<string, string> = {
  good: 'boa',
  uncertain: 'incerta',
  stale: 'desatualizada',
  bad: 'ruim',
};

/* Keys of AIDecision.measuredOutcome.measurements (productionStore). */
const EN_MEASUREMENTS: Record<string, string> = {
  totalBagsProduced: 'total bags produced',
};
const PT_MEASUREMENTS: Record<string, string> = {
  throughput: 'vazão',
  efficiency: 'eficiência',
  uptime: 'disponibilidade',
  quality: 'qualidade',
  totalBagsProduced: 'sacos produzidos',
};
// An unknown camelCase key still reads as words: "someMetric" -> "some metric".
const spacedKey = (key: string): string => key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();

export const decisionReplayMessages = defineMessages({
  en: {
    dialogLabel: 'Decision replay',
    title: 'Decision Replay',
    close: 'Close',
    type: (p: { value: string }) => p.value,
    status: (p: { value: string }) => p.value,
    timestamp: 'Timestamp',
    confidence: 'Confidence',
    expectedImpact: 'Expected Impact',
    affectedMachine: 'Affected Machine',
    evidenceSnapshot: 'Evidence snapshot',
    observation: 'Observation',
    value: 'Value',
    sourceAndQuality: 'Source and quality',
    sourceQuality: (p: { source: string; quality: string }) => `${p.source}, ${p.quality}`,
    assumptions: 'Assumptions',
    alternativesConsidered: 'Alternatives considered',
    affectedSystems: 'Affected systems',
    affectedEquipment: 'Affected equipment',
    decisionResponse: 'Decision response',
    disposition: (p: { value: string }) => p.value,
    awaitingResponse: 'Awaiting a response. Accept, defer, or reject it from the decision card.',
    noControlResponse: 'No control response was recorded.',
    measuredOutcome: 'Measured outcome',
    noMeasuredResult: 'No measured result has been recorded for this simulated decision.',
    // English is capitalised by CSS, as before.
    measurementLabel: (p: { key: string }) => EN_MEASUREMENTS[p.key] ?? spacedKey(p.key),
    closeReplay: 'Close Replay',
    viewDetails: 'View details: {action}',
  },
  'pt-BR': {
    dialogLabel: 'Reprodução da decisão',
    title: 'Reprodução da decisão',
    close: 'Fechar',
    type: (p: { value: string }) => PT_DECISION_TYPES[p.value] ?? p.value,
    status: (p: { value: string }) => PT_DECISION_STATUSES[p.value] ?? p.value,
    timestamp: 'Horário',
    confidence: 'Confiança',
    expectedImpact: 'Impacto esperado',
    affectedMachine: 'Máquina afetada',
    evidenceSnapshot: 'Instantâneo das evidências',
    observation: 'Observação',
    value: 'Valor',
    sourceAndQuality: 'Fonte e qualidade',
    sourceQuality: (p: { source: string; quality: string }) =>
      `${PT_SOURCES[p.source] ?? p.source}, ${PT_QUALITIES[p.quality] ?? p.quality}`,
    assumptions: 'Premissas',
    alternativesConsidered: 'Alternativas consideradas',
    affectedSystems: 'Sistemas afetados',
    affectedEquipment: 'Equipamentos afetados',
    decisionResponse: 'Resposta à decisão',
    disposition: (p: { value: string }) => upperFirst(PT_DISPOSITIONS[p.value] ?? p.value),
    awaitingResponse:
      'Aguardando resposta. Aceite, adie ou rejeite a decisão no cartão de decisão.',
    noControlResponse: 'Nenhuma resposta de controle foi registrada.',
    measuredOutcome: 'Resultado medido',
    noMeasuredResult: 'Nenhum resultado medido foi registrado para esta decisão simulada.',
    measurementLabel: (p: { key: string }) =>
      upperFirst(PT_MEASUREMENTS[p.key] ?? spacedKey(p.key)),
    closeReplay: 'Fechar reprodução',
    viewDetails: 'Ver detalhes: {action}',
  },
});
