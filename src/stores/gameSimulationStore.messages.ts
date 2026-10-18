import { defineMessages } from '../i18n';

const PT_CRISIS_CAUSE: Record<string, string> = {
  fire: 'condição de incêndio',
  power_outage: 'condição de queda de energia',
  supply_emergency: 'condição de emergência de abastecimento',
  inspection: 'condição de inspeção',
  weather: 'condição climática',
};

export const gameSimulationStoreMessages = defineMessages({
  en: {
    egressFront: 'Front Service Egress',
    egressBack: 'Back Service Egress',
    egressWest: 'West Service Egress',
    egressEast: 'East Service Egress',
    facilityStopCause: 'Facility emergency stop command',
    interlockCause: '{machineId} interlock',
    facilityStopResponse: 'Production and mobile equipment placed in a fail-safe stop.',
    facilityStopRecovery: 'Awaiting explicit interlock clearance.',
    facilityStopCleared: 'Interlock cleared after state verification.',
    drillCause: 'Automated emergency egress verification',
    drillResponse: 'All equipment stopped while egress sensors run their verification sequence.',
    drillRecovery: 'Awaiting all service egress zones.',
    drillCleared: 'Automated egress verification closed.',
    crisisCause: (p: { type: string }) => `${p.type.replaceAll('_', ' ')} condition`,
    crisisInterlockedResponse: 'Fail-safe process stop applied.',
    crisisMonitoredResponse: 'Condition isolated for autonomous monitoring.',
    crisisRecovery: 'Awaiting verified recovery state.',
    crisisCleared: 'Recovery state verified and interlocks released.',
  },
  'pt-BR': {
    egressFront: 'Rota de saída de serviço frontal',
    egressBack: 'Rota de saída de serviço dos fundos',
    egressWest: 'Rota de saída de serviço oeste',
    egressEast: 'Rota de saída de serviço leste',
    facilityStopCause: 'Comando de parada de emergência da instalação',
    interlockCause: 'Intertravamento de {machineId}',
    facilityStopResponse: 'Produção e equipamentos móveis colocados em parada à prova de falhas.',
    facilityStopRecovery: 'Aguardando liberação explícita do intertravamento.',
    facilityStopCleared: 'Intertravamento liberado após a verificação do estado.',
    drillCause: 'Verificação automatizada das rotas de saída de emergência',
    drillResponse:
      'Todos os equipamentos parados enquanto os sensores das rotas de saída executam a sequência de verificação.',
    drillRecovery: 'Aguardando todas as zonas de saída de serviço.',
    drillCleared: 'Verificação automatizada das rotas de saída encerrada.',
    crisisCause: (p: { type: string }) =>
      PT_CRISIS_CAUSE[p.type] ?? `condição: ${p.type.replaceAll('_', ' ')}`,
    crisisInterlockedResponse: 'Parada de processo à prova de falhas aplicada.',
    crisisMonitoredResponse: 'Condição isolada para monitoramento autônomo.',
    crisisRecovery: 'Aguardando estado de recuperação verificado.',
    crisisCleared: 'Estado de recuperação verificado e intertravamentos liberados.',
  },
});
