import { defineMessages } from '../i18n';

/** Alerts raised when the saved physical shift cannot be restored or written. */
export const physicalSessionMessages = defineMessages({
  en: {
    saveNeedsAttention: 'Shift save needs attention',
    resetHint: '{reason} Settings > Simulation > Reset Simulation starts a fresh shift.',
    storageUnavailable:
      'Browser storage is unavailable. This shift is paused and cannot be saved in this browser.',
    restoreFailed:
      'The saved physical shift could not be restored. Its record is retained. The clock is paused and this tab will not overwrite it.',
    otherTabTitle: 'Autosave off in this tab',
    otherTabMessage:
      'The saved shift changed outside this tab. This tab keeps running but will not overwrite that record; reload to use it.',
    autosaveSkippedTitle: 'Autosave skipped',
    autosaveSkippedQuota:
      'Autosave skipped: browser storage is full. The shift continues and the last good save is kept.',
    autosaveSkippedMessage: 'Autosave skipped; the shift continues and the last good save is kept.',
    continuationFailed:
      'Scene continuation could not be restored. The saved record is retained and the clock is paused.',
    sceneWaitingTitle: 'Saved shift is waiting',
    sceneWaitingMessage:
      'Part of the scene did not load, so the saved shift cannot resume. The clock stays paused and the saved record is kept. Reload the page to try again; Settings > Simulation > Reset Simulation starts a fresh shift.',
    autosavePausedTitle: 'Autosave paused',
    autosavePausedMessage:
      'Part of the scene stopped running, so autosave is paused. The shift continues and the last good save is kept. Reload the page to resume saving.',
  },
  'pt-BR': {
    saveNeedsAttention: 'O salvamento do turno precisa de atenção',
    resetHint: '{reason} Configurações > Simulação > Reiniciar simulação inicia um turno novo.',
    storageUnavailable:
      'O armazenamento do navegador não está disponível. Este turno está pausado e não pode ser salvo neste navegador.',
    restoreFailed:
      'Não foi possível restaurar o turno físico salvo. O registro foi mantido. O relógio está pausado e esta aba não vai sobrescrevê-lo.',
    otherTabTitle: 'Salvamento automático desligado nesta aba',
    otherTabMessage:
      'O turno salvo foi alterado fora desta aba. Esta aba continua funcionando, mas não vai sobrescrever esse registro; recarregue a página para usá-lo.',
    autosaveSkippedTitle: 'Salvamento automático não realizado',
    autosaveSkippedQuota:
      'Salvamento automático não realizado: o armazenamento do navegador está cheio. O turno continua e o último salvamento válido é mantido.',
    autosaveSkippedMessage:
      'Salvamento automático não realizado; o turno continua e o último salvamento válido é mantido.',
    continuationFailed:
      'Não foi possível restaurar a continuação da cena. O registro salvo foi mantido e o relógio está pausado.',
    sceneWaitingTitle: 'O turno salvo está aguardando',
    sceneWaitingMessage:
      'Parte da cena não carregou, então o turno salvo não pode ser retomado. O relógio continua pausado e o registro salvo é mantido. Recarregue a página para tentar de novo; Configurações > Simulação > Reiniciar simulação inicia um turno novo.',
    autosavePausedTitle: 'Salvamento automático pausado',
    autosavePausedMessage:
      'Parte da cena parou de funcionar, então o salvamento automático está pausado. O turno continua e o último salvamento válido é mantido. Recarregue a página para voltar a salvar.',
  },
});
