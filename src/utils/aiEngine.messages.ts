import { defineMessages } from '../i18n';

/**
 * Decision cards written by the autonomous plant decision engine.
 *
 * aiEngine.ts classifies decisions by matching words in this copy (prevented
 * shutdowns, audio cues). Its patterns list the pt-BR words beside the English
 * ones, so keep "manutenção", "estado seguro" and "anomalia" in the pt-BR
 * maintenance, safety and prediction texts, and out of the others.
 */
export const aiEngineMessages = defineMessages({
  en: {
    coordinationAction: 'Allocate autonomous service route to {machine}',
    coordinationReasoning:
      'The route planner detected equipment demand at {machineId} with {load} percent load.',
    coordinationImpact: 'Keeps service traffic deterministic and clears shared aisles.',
    maintenanceAction: 'Queue condition-based maintenance for {machine}',
    maintenanceReasoning:
      'Telemetry reports {temperature} C, {vibration} mm/s vibration, and {wear} percent wear.',
    maintenanceImpact: 'Reduces breakdown risk while preserving the controlled production path.',
    safetyAction: 'Engage interlocked safe state around {machine}',
    safetyReasoning:
      'The autonomous safety layer detected a limit or test condition requiring isolation.',
    safetyImpact:
      'Stops hazardous motion, closes affected routes, and preserves diagnostic evidence.',
    predictionAction: 'Statistical anomaly detected on {machine}',
    predictionReasoning:
      'Trend analysis combines {temperature} C, {vibration} mm/s vibration, {load} percent load, and {wear} percent wear.',
    predictionImpact: 'Provides lead time for an automatic derate or maintenance queue entry.',
    optimizationAction: 'Balance process load through {machine}',
    optimizationReasoning:
      'The line is carrying {load} percent load at {efficiency} percent local efficiency.',
    optimizationImpact:
      'Smooths material flow, limits recirculation, and protects downstream capacity.',
    completedAutomatic: 'Completed by autonomous control layer',
    completedConfirmed: 'Completed after control confirmation',
    strategicReasoningFallback: 'Strategic analysis complete.',
    strategicAction: 'Strategic: {priority}',
    strategicAdditionalPriorities: 'Additional priorities: {priorities}',
    strategicRecorded: 'Strategic guidance recorded for the tactical controller.',
    chatgptRequestFailed: 'ChatGPT request failed.',
  },
  'pt-BR': {
    coordinationAction: 'Alocar rota de serviço autônoma para {machine}',
    coordinationReasoning:
      'O planejador de rotas detectou demanda de equipamento em {machineId} com {load}% de carga.',
    coordinationImpact:
      'Mantém o tráfego de serviço determinístico e libera os corredores compartilhados.',
    maintenanceAction: 'Programar manutenção baseada em condição para {machine}',
    maintenanceReasoning:
      'A telemetria indica {temperature} °C, vibração de {vibration} mm/s e {wear}% de desgaste.',
    maintenanceImpact: 'Reduz o risco de pane e preserva o caminho de produção controlado.',
    safetyAction: 'Acionar estado seguro intertravado em torno de {machine}',
    safetyReasoning:
      'A camada de segurança autônoma detectou uma condição de limite ou de teste que exige isolamento.',
    safetyImpact:
      'Interrompe movimentos perigosos, fecha as rotas afetadas e preserva as evidências de diagnóstico.',
    predictionAction: 'Anomalia estatística detectada em {machine}',
    predictionReasoning:
      'A análise de tendência combina {temperature} °C, vibração de {vibration} mm/s, {load}% de carga e {wear}% de desgaste.',
    predictionImpact:
      'Dá antecedência para uma redução automática de carga ou uma entrada na fila de manutenção.',
    optimizationAction: 'Equilibrar a carga do processo em {machine}',
    optimizationReasoning:
      'A linha opera com {load}% de carga e {efficiency}% de eficiência local.',
    optimizationImpact:
      'Suaviza o fluxo de material, limita a recirculação e protege a capacidade a jusante.',
    completedAutomatic: 'Concluída pela camada de controle autônoma',
    completedConfirmed: 'Concluída após confirmação do controle',
    strategicReasoningFallback: 'Análise estratégica concluída.',
    strategicAction: 'Estratégia: {priority}',
    strategicAdditionalPriorities: 'Prioridades adicionais: {priorities}',
    strategicRecorded: 'Orientação estratégica registrada para o controlador tático.',
    chatgptRequestFailed: 'A solicitação ao ChatGPT falhou.',
  },
});
