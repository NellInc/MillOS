import { defineMessages } from '../i18n';

export const emergencyOverlayMessages = defineMessages({
  en: {
    drillTitle: 'Egress verification drill',
    forkliftStopTitle: 'Forklift emergency stop',
    facilityStopTitle: 'Facility emergency stop',
    drillGuidance:
      'Drill in progress. Production and forklifts hold while each egress route is checked clear of stopped forklifts; it ends when every route is clear, or from the Safety panel.',
    forkliftStopGuidance: 'Every forklift is holding position; the mill keeps running.',
    facilityStopGuidance:
      'Everything is stopped. Find the cause, fix it, then clear the interlock from the Safety panel.',
    deliberateStopGuidance:
      'You stopped the facility. Clear the interlock from the Safety panel when you are ready to restart.',
    chronicleFireGuidance:
      'Everything is stopped by a duct fire. Answer its prompt in the Mill Chronicle to suppress or clean it.',
    chronicleFireCleaningGuidance:
      'Everything is stopped while the duct is cleaned. Production restarts when it is clean.',
    liveRegion: '{title}. {guidance}',
    releaseForkliftStop: 'Release forklift stop',
  },
  'pt-BR': {
    drillTitle: 'Simulado de verificação das rotas de saída',
    forkliftStopTitle: 'Parada de emergência das empilhadeiras',
    facilityStopTitle: 'Parada de emergência da unidade',
    drillGuidance:
      'Simulado em andamento. A produção e as empilhadeiras ficam paradas enquanto se verifica se cada rota de saída está livre de empilhadeiras paradas; o simulado termina quando todas as rotas estiverem livres ou quando for encerrado pelo painel de Segurança.',
    forkliftStopGuidance:
      'Todas as empilhadeiras estão paradas na posição; o moinho continua funcionando.',
    facilityStopGuidance:
      'Tudo está parado. Encontre a causa, corrija-a e depois libere o intertravamento pelo painel de Segurança.',
    deliberateStopGuidance:
      'Você parou a unidade. Libere o intertravamento pelo painel de Segurança quando estiver pronto para reiniciar.',
    chronicleFireGuidance:
      'Tudo está parado por um incêndio no duto. Responda ao aviso na Crônica do moinho para suprimir ou limpar o duto.',
    chronicleFireCleaningGuidance:
      'Tudo está parado enquanto o duto é limpo. A produção recomeça quando ele estiver limpo.',
    liveRegion: '{title}. {guidance}',
    releaseForkliftStop: 'Liberar parada das empilhadeiras',
  },
});
