import { defineMessages } from '../i18n';

export const alertSystemMessages = defineMessages({
  en: {
    maintenanceCompleteTitle: 'Maintenance Complete',
    maintenanceCompleteMessage: 'Roller Mill RM-103 back online',
    temperatureRisingTitle: 'Temperature Rising',
    temperatureRisingMessage: 'Plansifter B bearing temperature elevated',
    qualityCheckTitle: 'Quality Check',
    qualityCheckMessage: 'Hourly sample collection under way',
    targetMetTitle: 'Target Met',
    targetMetMessage: 'Daily production target reached',
    lowStockTitle: 'Low Stock',
    lowStockMessage: 'Packaging supplies below reorder point',
    conveyorCheckTitle: 'Conveyor Check',
    conveyorCheckMessage: 'Belt tension nominal',
    nearMissBlockedAisle: 'Forklift stopped for a blocked aisle - safety protocol activated',
    nearMissUnexpectedLoad: 'Unexpected load detected in forklift path - collision averted',
    nearMissProximity: 'Proximity alert - forklift yielded to crossing equipment',
    nearMissSafetySystem: 'Safety system engaged - near-miss avoided',
    nearMissTitle: 'Near-Miss Avoided',
    safetyLiveRegion: 'Safety alert: {title}. {message}',
    /** `type` is the alert's own type id ('critical' | 'warning'), read as-is in English. */
    typedLiveRegion: (p: { type: string; title: string; message: string }) =>
      `${p.type} alert: ${p.title}. ${p.message}`,
  },
  'pt-BR': {
    maintenanceCompleteTitle: 'Manutenção concluída',
    maintenanceCompleteMessage: 'Moinho de rolos RM-103 de volta à operação',
    temperatureRisingTitle: 'Temperatura subindo',
    temperatureRisingMessage: 'Temperatura do rolamento do Plansifter B elevada',
    qualityCheckTitle: 'Verificação de qualidade',
    qualityCheckMessage: 'Coleta da amostra horária em andamento',
    targetMetTitle: 'Meta atingida',
    targetMetMessage: 'Meta diária de produção alcançada',
    lowStockTitle: 'Estoque baixo',
    lowStockMessage: 'Material de embalagem abaixo do ponto de reposição',
    conveyorCheckTitle: 'Verificação do transportador',
    conveyorCheckMessage: 'Tensão da esteira normal',
    nearMissBlockedAisle:
      'Empilhadeira parou diante de um corredor bloqueado - protocolo de segurança acionado',
    nearMissUnexpectedLoad:
      'Carga inesperada detectada no caminho da empilhadeira - colisão evitada',
    nearMissProximity:
      'Alerta de proximidade - empilhadeira deu passagem a um equipamento que cruzava',
    nearMissSafetySystem: 'Sistema de segurança acionado - quase acidente evitado',
    nearMissTitle: 'Quase acidente evitado',
    safetyLiveRegion: 'Alerta de segurança: {title}. {message}',
    typedLiveRegion: (p: { type: string; title: string; message: string }) =>
      `${p.type === 'critical' ? 'Alerta crítico' : 'Alerta de atenção'}: ${p.title}. ${p.message}`,
  },
});
