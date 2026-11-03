import { defineMessages } from '../i18n';

export const safetyStoreMessages = defineMessages({
  en: {
    zoneCentralArea: 'Central Area',
    zoneNorthLoading: 'North Loading',
    zoneSouthLoading: 'South Loading',
    zoneWestCorridor: 'West Corridor',
    zoneEastCorridor: 'East Corridor',
    zonePackingZone: 'Packing Zone',
    forkliftRouteBlocked: 'Forklift stopped for a blocked route',
    keyboardEmergencyStop: 'Emergency stop activated via keyboard (Spacebar)',
    facilityStop: 'Facility emergency stop triggered from the Safety panel',
  },
  'pt-BR': {
    zoneCentralArea: 'Área central',
    zoneNorthLoading: 'Carregamento norte',
    zoneSouthLoading: 'Carregamento sul',
    zoneWestCorridor: 'Corredor oeste',
    zoneEastCorridor: 'Corredor leste',
    zonePackingZone: 'Zona de ensaque',
    forkliftRouteBlocked: 'Empilhadeira parada por rota bloqueada',
    keyboardEmergencyStop: 'Parada de emergência acionada pelo teclado (barra de espaço)',
    facilityStop: 'Parada de emergência da unidade acionada pelo painel de Segurança',
  },
});
