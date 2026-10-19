import { defineMessages } from '../i18n';

const PT_WEATHER: Record<string, string> = {
  clear: 'céu limpo',
  cloudy: 'nublado',
  rain: 'chuva',
  storm: 'tempestade',
};

const PT_RUN_WINDOW: Record<string, string> = {
  morning: 'manhã',
  afternoon: 'tarde',
  night: 'noite',
};

const PT_DECISION_TYPE: Record<string, string> = {
  coordination: 'coordenação',
  optimization: 'otimização',
  prediction: 'previsão',
  maintenance: 'manutenção',
  safety: 'segurança',
};

const PT_PRIORITY: Record<string, string> = {
  low: 'baixa',
  medium: 'média',
  high: 'alta',
  critical: 'crítica',
};

const PT_DISPOSITION: Record<string, string> = {
  accepted: 'aceita',
  modified: 'modificada',
  rejected: 'rejeitada',
  deferred: 'adiada',
  automatic: 'automática',
};

/*
 * Enum values (weather, run window, decision type, priority, response) were
 * rendered raw and styled by CSS. English keeps the raw value; pt-BR maps the
 * known values and falls back to the raw value for anything new.
 */
export const aiCommandCenterMessages = defineMessages({
  en: {
    chatgptPlan: 'ChatGPT plan',
    modeLocal: 'Local',
    modeHybrid: 'Hybrid',
    modeHeuristic: 'Heuristic',
    title: 'AI Partner',
    reviewing: 'reviewing...',
    settingsLabel: 'AI settings, current mode: {mode}',
    settingsTitleLocal: 'Local AI Active: configure',
    settingsTitleCloud: '{label} AI Active: configure',
    settingsTitleHybrid: 'Hybrid Mode Active - Click to configure',
    settingsTitleHeuristic: 'Heuristic Mode - Click to configure AI backend',
    sessionCost: '{cost} est.',
    noApiCost: 'NO API COST',
    egressDrill: 'EGRESS DRILL IN PROGRESS',
    weather: (p: { value: string }) => p.value,
    runWindow: (p: { value: string }) => `${p.value} run window`,
    efficiency: 'Eff: {value}%',
    tabsLabel: 'AI Partner views',
    tabDecisions: 'Decisions ({count})',
    tabStrategic: 'Strategic',
    tabAdvisory: 'Advisory',
    newDecision: 'New AI decision: {action}',
    decisionType: (p: { value: string }) => p.value,
    priority: (p: { value: string }) => p.value,
    response: (p: { value: string }) => `Response: ${p.value}`,
    inspectEvidence: 'Inspect evidence',
    accept: 'Accept',
    defer: 'Defer',
    reject: 'Reject',
    showingDecisions: 'Showing 15 of {count} decisions',
    noRecommendations: 'No recommendations have been recorded.',
  },
  'pt-BR': {
    chatgptPlan: 'Plano ChatGPT',
    modeLocal: 'Local',
    modeHybrid: 'Híbrido',
    modeHeuristic: 'Heurístico',
    title: 'Parceiro de IA',
    reviewing: 'revisando...',
    settingsLabel: 'Configurações de IA, modo atual: {mode}',
    settingsTitleLocal: 'IA local ativa: configurar',
    settingsTitleCloud: 'IA {label} ativa: configurar',
    settingsTitleHybrid: 'Modo híbrido ativo - clique para configurar',
    settingsTitleHeuristic: 'Modo heurístico - clique para configurar o backend de IA',
    sessionCost: '{cost} estim.',
    noApiCost: 'SEM CUSTO DE API',
    egressDrill: 'VERIFICAÇÃO DAS ROTAS DE SAÍDA EM ANDAMENTO',
    weather: (p: { value: string }) => PT_WEATHER[p.value] ?? p.value,
    runWindow: (p: { value: string }) => `período: ${PT_RUN_WINDOW[p.value] ?? p.value}`,
    efficiency: 'Efic.: {value}%',
    tabsLabel: 'Visões do parceiro de IA',
    tabDecisions: 'Decisões ({count})',
    tabStrategic: 'Estratégia',
    tabAdvisory: 'Recomendações',
    newDecision: 'Nova decisão da IA: {action}',
    decisionType: (p: { value: string }) => PT_DECISION_TYPE[p.value] ?? p.value,
    priority: (p: { value: string }) => PT_PRIORITY[p.value] ?? p.value,
    response: (p: { value: string }) => `Resposta: ${PT_DISPOSITION[p.value] ?? p.value}`,
    inspectEvidence: 'Ver evidências',
    accept: 'Aceitar',
    defer: 'Adiar',
    reject: 'Rejeitar',
    showingDecisions: 'Mostrando 15 de {count} decisões',
    noRecommendations: 'Nenhuma recomendação foi registrada.',
  },
});
