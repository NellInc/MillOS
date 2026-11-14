import { defineMessages } from '../../../i18n';

/** Safety event stages render as their raw value in English; CSS uppercases them. */
const PT_STAGE: Record<string, string> = {
  active: 'ativo',
  acknowledged: 'reconhecido',
  cleared: 'normalizado',
};

export const safetyPanelMessages = defineMessages({
  en: {
    loading: 'Loading...',
    tabControls: 'Controls',
    tabAnalytics: 'Analytics',
    tabConfig: 'Config',

    featureSafetyMetrics: 'Safety metrics',
    featureSafetyAnalytics: 'Safety analytics',
    featureIncidentHistory: 'Incident history',
    featureSafetyConfiguration: 'Safety configuration',
    featureZoneCustomization: 'Zone customization',

    emergencyResponse: 'Emergency Response',
    simulatedSafetyEvent: 'Simulated safety event',
    safetyInterlock: 'Safety interlock',
    stage: (p: { value: string }) => p.value,
    acknowledgementNote: 'Acknowledged in the Safety workspace',
    acknowledgeEvent: 'Acknowledge event',
    safetyStateRecovered: 'Safety state recovered',
    cleared: 'Cleared',

    drillGroupLabel: 'Emergency egress verification drill',
    drillTitle: 'Egress verification drill',
    allZonesVerified: 'All zones verified',
    zonesVerified: '{verified}/{total} zones verified',
    endDrill: 'END DRILL',
    startDrill: 'START DRILL',
    clearEmergencyBeforeDrill: 'Clear the active emergency before starting a drill',
    drillJustEnded: 'The drill has just ended',
    releaseForkliftStop: 'RELEASE FORKLIFT STOP',
    stopForklifts: 'STOP FORKLIFTS',

    resolveCrisisFirst: 'Resolve the active crisis before clearing its interlock',
    chronicleFireInterlock:
      'A Mill Chronicle duct fire holds this interlock until the duct is clean',
    endDrillFirst: 'End the active egress verification drill before using the emergency stop',
    crisisInterlockActive: 'CRISIS INTERLOCK ACTIVE',
    drillInterlockActive: 'DRILL INTERLOCK ACTIVE',
    clearEmergency: 'CLEAR EMERGENCY',
    triggerEmergencyStop: 'TRIGGER EMERGENCY STOP',
    restartLine: 'RESTART LINE',

    drillRecordLabel: 'Drill record',
    drillRecordClear: (p: { zone: string; time: string }) =>
      p.time ? `${p.zone}: own route clear, ${p.time}` : `${p.zone}: own route clear`,
    drillRecordAlternative: (p: {
      zone: string;
      alternative: string;
      forklifts: string;
      time: string;
    }) =>
      `${p.zone}: verified by the ${p.alternative} route, ${p.forklifts || 'a forklift'} on its own` +
      (p.time ? `, ${p.time}` : ''),
    drillRecordBlocked: (p: { zone: string; forklifts: string }) =>
      `${p.zone}: not verified, ${p.forklifts || 'a forklift'} on both routes`,
    drillRecordUnverified: '{zone}: not verified',

    confirmTitle: 'Trigger facility emergency stop?',
    confirmMessage:
      'Everything stops — machines, forklifts, the lot. The alarm stays on until you clear the interlock from this panel.',
    confirmLabel: 'Trigger emergency stop',
    facilityStopIncident: 'Facility emergency stop triggered from the Safety panel',
  },
  'pt-BR': {
    loading: 'Carregando...',
    tabControls: 'Controles',
    tabAnalytics: 'Análises',
    tabConfig: 'Configuração',

    featureSafetyMetrics: 'Métricas de segurança',
    featureSafetyAnalytics: 'Análises de segurança',
    featureIncidentHistory: 'Histórico de ocorrências',
    featureSafetyConfiguration: 'Configuração de segurança',
    featureZoneCustomization: 'Personalização de zonas',

    emergencyResponse: 'Resposta a emergências',
    simulatedSafetyEvent: 'Evento de segurança simulado',
    safetyInterlock: 'Intertravamento de segurança',
    stage: (p: { value: string }) => PT_STAGE[p.value] ?? p.value,
    acknowledgementNote: 'Reconhecido no espaço de trabalho de Segurança',
    acknowledgeEvent: 'Reconhecer evento',
    safetyStateRecovered: 'Estado de segurança restabelecido',
    cleared: 'Normalizado',

    drillGroupLabel: 'Simulado de verificação das rotas de saída de emergência',
    drillTitle: 'Simulado de verificação das rotas de saída',
    allZonesVerified: 'Todas as zonas verificadas',
    zonesVerified: '{verified}/{total} zonas verificadas',
    endDrill: 'ENCERRAR SIMULADO',
    startDrill: 'INICIAR SIMULADO',
    clearEmergencyBeforeDrill: 'Encerre a emergência ativa antes de iniciar um simulado',
    drillJustEnded: 'O simulado acabou de terminar',
    releaseForkliftStop: 'LIBERAR PARADA DAS EMPILHADEIRAS',
    stopForklifts: 'PARAR EMPILHADEIRAS',

    resolveCrisisFirst: 'Resolva a crise ativa antes de liberar o intertravamento',
    chronicleFireInterlock:
      'Um incêndio no duto da Crônica do moinho mantém este intertravamento até o duto ficar limpo',
    endDrillFirst:
      'Encerre o simulado de verificação das rotas de saída em andamento antes de usar a parada de emergência',
    crisisInterlockActive: 'INTERTRAVAMENTO DE CRISE ATIVO',
    drillInterlockActive: 'INTERTRAVAMENTO DO SIMULADO ATIVO',
    clearEmergency: 'ENCERRAR EMERGÊNCIA',
    triggerEmergencyStop: 'ACIONAR PARADA DE EMERGÊNCIA',
    restartLine: 'REINICIAR LINHA',

    drillRecordLabel: 'Registro do simulado',
    drillRecordClear: (p: { zone: string; time: string }) =>
      p.time ? `${p.zone}: rota própria livre, ${p.time}` : `${p.zone}: rota própria livre`,
    drillRecordAlternative: (p: {
      zone: string;
      alternative: string;
      forklifts: string;
      time: string;
    }) =>
      `${p.zone}: verificada pela ${p.alternative}, ${p.forklifts || 'uma empilhadeira'} na rota própria` +
      (p.time ? `, ${p.time}` : ''),
    drillRecordBlocked: (p: { zone: string; forklifts: string }) =>
      `${p.zone}: não verificada, ${p.forklifts || 'uma empilhadeira'} nas duas rotas`,
    drillRecordUnverified: '{zone}: não verificada',

    confirmTitle: 'Acionar a parada de emergência da unidade?',
    confirmMessage:
      'Tudo para — máquinas, empilhadeiras, tudo. O alarme continua ligado até você liberar o intertravamento neste painel.',
    confirmLabel: 'Acionar parada de emergência',
    facilityStopIncident: 'Parada de emergência da unidade acionada pelo painel de Segurança',
  },
});
