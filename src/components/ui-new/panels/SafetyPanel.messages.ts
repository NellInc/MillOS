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
    weatherClear: 'Clear',
    weatherCloudy: 'Cloudy',
    weatherRain: 'Rain',
    weatherStorm: 'Storm',
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
    drillDescription:
      'Halts production and grounds every forklift while the egress sensors verify themselves. Nothing moves until they agree.',
    endDrill: 'END DRILL',
    startDrill: 'START DRILL',
    clearEmergencyBeforeDrill: 'Clear the active emergency before starting a drill',
    releaseForkliftStop: 'RELEASE FORKLIFT STOP',

    resolveCrisisFirst: 'Resolve the active crisis before clearing its interlock',
    chronicleFireInterlock:
      'A Mill Chronicle duct fire holds this interlock; answer it in the Chronicle',
    endDrillFirst: 'End the active egress verification drill before using the emergency stop',
    crisisInterlockActive: 'CRISIS INTERLOCK ACTIVE',
    drillInterlockActive: 'DRILL INTERLOCK ACTIVE',
    clearEmergency: 'CLEAR EMERGENCY',
    triggerEmergencyStop: 'TRIGGER EMERGENCY STOP',

    environment: 'Environment',
    weatherConditionsLabel: 'Weather conditions',
    weatherConditions: 'Weather Conditions',
    setWeatherTo: 'Set weather to {label}',

    confirmTitle: 'Trigger facility emergency stop?',
    confirmMessage:
      'Everything stops — machines, forklifts, the lot. The alarm stays on until you clear the interlock from this panel.',
    confirmLabel: 'Trigger emergency stop',
  },
  'pt-BR': {
    loading: 'Carregando...',
    weatherClear: 'Limpo',
    weatherCloudy: 'Nublado',
    weatherRain: 'Chuva',
    weatherStorm: 'Tempestade',
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
    drillDescription:
      'Interrompe a produção e imobiliza todas as empilhadeiras enquanto os sensores das rotas de saída fazem a autoverificação. Nada se move até que todos confirmem.',
    endDrill: 'ENCERRAR SIMULADO',
    startDrill: 'INICIAR SIMULADO',
    clearEmergencyBeforeDrill: 'Encerre a emergência ativa antes de iniciar um simulado',
    releaseForkliftStop: 'LIBERAR PARADA DAS EMPILHADEIRAS',

    resolveCrisisFirst: 'Resolva a crise ativa antes de liberar o intertravamento',
    chronicleFireInterlock:
      'Um incêndio no duto da Crônica do moinho mantém este intertravamento; responda a ele na Crônica',
    endDrillFirst:
      'Encerre o simulado de verificação das rotas de saída em andamento antes de usar a parada de emergência',
    crisisInterlockActive: 'INTERTRAVAMENTO DE CRISE ATIVO',
    drillInterlockActive: 'INTERTRAVAMENTO DO SIMULADO ATIVO',
    clearEmergency: 'ENCERRAR EMERGÊNCIA',
    triggerEmergencyStop: 'ACIONAR PARADA DE EMERGÊNCIA',

    environment: 'Ambiente',
    weatherConditionsLabel: 'Condições climáticas',
    weatherConditions: 'Condições climáticas',
    setWeatherTo: 'Definir o clima como {label}',

    confirmTitle: 'Acionar a parada de emergência da unidade?',
    confirmMessage:
      'Tudo para — máquinas, empilhadeiras, tudo. O alarme continua ligado até você liberar o intertravamento neste painel.',
    confirmLabel: 'Acionar parada de emergência',
  },
});
