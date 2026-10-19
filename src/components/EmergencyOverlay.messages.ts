import { defineMessages } from '../i18n';

export const emergencyOverlayMessages = defineMessages({
  en: {
    drillTitle: 'Simulated fire drill',
    forkliftStopTitle: 'Forklift emergency stop',
    facilityStopTitle: 'Facility emergency stop',
    drillGuidance:
      'Drill in progress. Production and forklifts hold while each service egress verifies itself; it ends once every egress checks in, or from the Safety panel.',
    forkliftStopGuidance:
      'Every forklift is holding position; the mill keeps running. Press Space or release it from the Safety panel.',
    facilityStopGuidance:
      'Everything is stopped. Find the cause, fix it, then clear the interlock from the Safety panel.',
  },
  'pt-BR': {
    drillTitle: 'Simulado de incêndio',
    forkliftStopTitle: 'Parada de emergência das empilhadeiras',
    facilityStopTitle: 'Parada de emergência da unidade',
    drillGuidance:
      'Simulado em andamento. A produção e as empilhadeiras ficam paradas enquanto cada rota de saída de serviço é verificada; o simulado termina quando todas as rotas de saída forem confirmadas ou quando for encerrado pelo painel de Segurança.',
    forkliftStopGuidance:
      'Todas as empilhadeiras estão paradas na posição; o moinho continua funcionando. Pressione Espaço ou libere a parada pelo painel de Segurança.',
    facilityStopGuidance:
      'Tudo está parado. Encontre a causa, corrija-a e depois libere o intertravamento pelo painel de Segurança.',
  },
});
