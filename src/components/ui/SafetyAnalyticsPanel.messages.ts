import { defineMessages } from '../../i18n';

export const safetyAnalyticsPanelMessages = defineMessages({
  en: {
    title: 'Safety Analytics',
    lastHour: 'Last Hour',
    thisSession: 'This Session',
    incidents: 'incidents',

    heatMap: 'Incident Heat Map',
    hotspotsRecorded: '{count} hotspots recorded',
    showHeatMap: 'Show incident heat map',
    on: 'ON',
    off: 'OFF',
    confirmClearLabel: 'Confirm clearing incident heat map (irreversible)',
    clearLabel: 'Clear incident heat map',
    confirmClearTitle: 'Click again to permanently clear all hotspot data',
    clearTitle: 'Permanently clear all recorded hotspots',
    confirm: 'Confirm?',
    clear: 'Clear',

    forkliftEfficiency: 'Forklift Efficiency',
    confirmResetLabel: 'Confirm resetting forklift efficiency metrics (irreversible)',
    resetLabel: 'Reset forklift efficiency metrics',
    confirmResetTitle: 'Click again to permanently reset all forklift metrics',
    resetTitle: 'Permanently reset all forklift efficiency metrics',
    reset: 'Reset',
    waitingForData: 'Waiting for data',
    forkliftName: (p: { id: string }) => p.id.replace('forklift-', 'Forklift '),
    moving: 'Moving: {seconds}s',
    stopped: 'Stopped: {seconds}s',

    downloadReport: 'Download Safety Report',
  },
  'pt-BR': {
    title: 'Análises de segurança',
    lastHour: 'Última hora',
    thisSession: 'Esta sessão',
    incidents: 'ocorrências',

    heatMap: 'Mapa de calor de ocorrências',
    hotspotsRecorded: '{count} pontos críticos registrados',
    showHeatMap: 'Mostrar o mapa de calor de ocorrências',
    on: 'LIGADO',
    off: 'DESLIGADO',
    confirmClearLabel: 'Confirmar a limpeza do mapa de calor de ocorrências (irreversível)',
    clearLabel: 'Limpar o mapa de calor de ocorrências',
    confirmClearTitle:
      'Clique de novo para apagar permanentemente todos os dados de pontos críticos',
    clearTitle: 'Apagar permanentemente todos os pontos críticos registrados',
    confirm: 'Confirmar?',
    clear: 'Limpar',

    forkliftEfficiency: 'Eficiência das empilhadeiras',
    confirmResetLabel:
      'Confirmar a redefinição das métricas de eficiência das empilhadeiras (irreversível)',
    resetLabel: 'Redefinir as métricas de eficiência das empilhadeiras',
    confirmResetTitle:
      'Clique de novo para redefinir permanentemente todas as métricas das empilhadeiras',
    resetTitle: 'Redefinir permanentemente todas as métricas de eficiência das empilhadeiras',
    reset: 'Redefinir',
    waitingForData: 'Aguardando dados',
    forkliftName: (p: { id: string }) => p.id.replace('forklift-', 'Empilhadeira '),
    moving: 'Em movimento: {seconds}s',
    stopped: 'Parada: {seconds}s',

    downloadReport: 'Baixar relatório de segurança',
  },
});
