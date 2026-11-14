import { defineMessages } from '../../i18n';

export const emergencyStopButtonMessages = defineMessages({
  en: {
    incidentDescription: 'Emergency stop activated - all forklifts halted',
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
