import { defineMessages } from '../i18n';

export const logisticsLayoutStoreMessages = defineMessages({
  en: {
    sessionRestoring: 'Wait for the saved shift to finish restoring.',
    safetyHold: 'Resolve the site safety hold first.',
    replayActive: 'Finish the replay experiment before changing logistics.',
    localControlOnly:
      'Logistics changes require local simulation control, never live or hybrid SCADA.',
    pauseFirst: 'Pause the mill before applying or undoing a layout.',
    layoutChanged: 'The live layout changed. Capture current again.',
    clearanceFailed:
      'The proposal fails the live clearance check. Capture current again and resolve its conflicts.',
    nothingToUndo: 'There is no applied layout to undo.',
  },
  'pt-BR': {
    sessionRestoring: 'Aguarde o turno salvo terminar de ser restaurado.',
    safetyHold: 'Resolva primeiro a retenção de segurança do local.',
    replayActive: 'Conclua o experimento de reprodução antes de alterar a logística.',
    localControlOnly:
      'Alterações na logística exigem controle local da simulação, nunca SCADA ao vivo ou híbrido.',
    pauseFirst: 'Pause o moinho antes de aplicar ou desfazer um layout.',
    layoutChanged: 'O layout em operação mudou. Capture o estado atual de novo.',
    clearanceFailed:
      'A proposta não passa na verificação de folga do layout em operação. Capture o estado atual de novo e resolva os conflitos.',
    nothingToUndo: 'Não há layout aplicado para desfazer.',
  },
});
