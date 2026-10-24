import { defineMessages } from '../../i18n';

export const emergencyStopButtonMessages = defineMessages({
  en: {
    incidentDescription: 'Emergency stop activated - all forklifts halted',
    drillTitle: 'End the active egress verification drill before using the emergency stop',
    interlockTitle:
      'Clear the facility emergency interlock from the Safety panel to release the forklifts',
    drillLabel: 'Fire drill interlock active - emergency stop cannot be changed',
    interlockLabel:
      'Emergency interlock active - clear it from the Safety panel to release the forklifts',
    stopLabel: 'Emergency stop - halt all forklifts',
    drillButton: 'DRILL INTERLOCK ACTIVE',
    interlockButton: 'INTERLOCK ACTIVE',
    releaseButton: 'RELEASE E-STOP',
    stopButton: 'EMERGENCY STOP',
  },
  'pt-BR': {
    incidentDescription: 'Parada de emergência acionada - todas as empilhadeiras paradas',
    drillTitle:
      'Encerre o simulado de verificação das rotas de saída em andamento antes de usar a parada de emergência',
    interlockTitle:
      'Libere o intertravamento de emergência da instalação no painel de Segurança para destravar as empilhadeiras',
    drillLabel:
      'Intertravamento do simulado de evacuação ativo - a parada de emergência não pode ser alterada',
    interlockLabel:
      'Intertravamento de emergência ativo - libere-o no painel de Segurança para destravar as empilhadeiras',
    stopLabel: 'Parada de emergência - parar todas as empilhadeiras',
    drillButton: 'INTERTRAVAMENTO DO SIMULADO ATIVO',
    interlockButton: 'INTERTRAVAMENTO ATIVO',
    releaseButton: 'LIBERAR PARADA DE EMERGÊNCIA',
    stopButton: 'PARADA DE EMERGÊNCIA',
  },
});
