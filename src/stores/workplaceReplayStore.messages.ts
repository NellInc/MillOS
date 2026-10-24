import { defineMessages } from '../i18n';

/** Reasons the matched plant replay returns to the Workplace Replay panel. */
export const workplaceReplayStoreMessages = defineMessages({
  en: {
    pauseFirst: 'Pause the simulation before capturing or rewinding.',
    safetyHold: 'Resolve the site safety hold first. Replay cannot clear emergency authority.',
    localControlOnly:
      'Replay is available only with local simulation control, never live or hybrid SCADA.',
    labTestRunning: 'Finish the current laboratory test before capturing or rewinding.',
    improvementActive:
      'Retain the handoff trial and its reviews. Replay cannot rewind an improvement cycle.',
    gameModeOnly: 'Choose Game mode for an operational replay.',
    recoveryOwed: 'Deliver all earned recovery before rewinding. Repayment cannot be erased.',
    seedRange: 'Choose a whole-number seed from 1 to {max}.',
    untouchedStart: 'Capture an untouched starting discussion. Complete and record this run first.',
    waitForScene: 'Wait for the complete local scene: {missing}.',
    openOrderRequired:
      'Select an open, quality-qualified customer order without a recovery challenge.',
    captureFirst: 'Capture a paused starting situation first.',
    knownCharter: 'Choose a known charter.',
    sceneChanged: 'The scene changed. Reloading or remounting invalidates an in-memory checkpoint.',
    materialSessionChanged:
      'The material session changed. Start a new experiment from an untouched discussion.',
    finishCurrentShift: 'Finish and record the current shift before starting another replay.',
    restorationFailed:
      'Restoration failed. The prior situation was restored; capture a fresh checkpoint.',
    rollbackFailed:
      'Restoration and rollback failed. The game remains paused; checkpoint disabled. Reload before another experiment. Reviewed receipts remain available.',
    startRunFirst: 'Start a checkpoint run before recording.',
    matchedEvidenceLocal:
      'Matched evidence requires local simulation control. Live or hybrid control cannot be recorded as a replay.',
    reviewBeforeRecording: 'Review the shift and deliver all earned recovery before recording.',
    evidenceChanged:
      'The linked order or material evidence changed. No matched run can be recorded.',
    finishAgreement: 'Finish the agreement and repay recovery before ending the experiment.',
    reportScope: 'Synthetic local game runs; actual ledger deltas, no real-worker efficacy claim.',
    reportLimits:
      'Starting conditions match. Frame-driven vehicle motion can differ between runs. Compare elapsed and agreement time; no winner or trust score is inferred. Raw checkpoints and consent are never exported.',
  },
  'pt-BR': {
    pauseFirst: 'Pause a simulação antes de capturar ou voltar no tempo.',
    safetyHold:
      'Resolva primeiro a retenção de segurança do local. A reprodução não pode anular a autoridade de emergência.',
    localControlOnly:
      'A reprodução só está disponível com controle local da simulação, nunca com SCADA ao vivo ou híbrido.',
    labTestRunning: 'Conclua o teste de laboratório atual antes de capturar ou voltar no tempo.',
    improvementActive:
      'Guarde o teste da passagem de turno e suas revisões. A reprodução não pode desfazer um ciclo de melhoria.',
    gameModeOnly: 'Escolha o modo Jogo para uma reprodução operacional.',
    recoveryOwed:
      'Conceda todo o tempo de recuperação devido antes de voltar no tempo. A devolução desse tempo não pode ser apagada.',
    seedRange: 'Escolha uma semente inteira de 1 a {max}.',
    untouchedStart:
      'Capture uma discussão inicial ainda intocada. Conclua e registre esta execução primeiro.',
    waitForScene: 'Aguarde a cena local completa: {missing}.',
    openOrderRequired:
      'Selecione um pedido de cliente em aberto, qualificado pela qualidade e sem desafio de recuperação.',
    captureFirst: 'Capture primeiro uma situação inicial pausada.',
    knownCharter: 'Escolha um estatuto conhecido.',
    sceneChanged:
      'A cena mudou. Recarregar ou remontar invalida um ponto de controle mantido na memória.',
    materialSessionChanged:
      'A sessão de material mudou. Comece um novo experimento a partir de uma discussão ainda intocada.',
    finishCurrentShift: 'Conclua e registre o turno atual antes de iniciar outra reprodução.',
    restorationFailed:
      'A restauração falhou. A situação anterior foi restaurada; capture um novo ponto de controle.',
    rollbackFailed:
      'A restauração e a reversão falharam. O jogo continua pausado; ponto de controle desativado. Recarregue antes de outro experimento. Os comprovantes revisados continuam disponíveis.',
    startRunFirst: 'Inicie uma execução a partir do ponto de controle antes de registrar.',
    matchedEvidenceLocal:
      'A evidência pareada exige controle local da simulação. O controle ao vivo ou híbrido não pode ser registrado como reprodução.',
    reviewBeforeRecording:
      'Revise o turno e conceda todo o tempo de recuperação devido antes de registrar.',
    evidenceChanged:
      'O pedido vinculado ou a evidência de material mudou. Nenhuma execução pareada pode ser registrada.',
    finishAgreement:
      'Conclua o acordo e conceda a recuperação devida antes de encerrar o experimento.',
    reportScope:
      'Execuções sintéticas e locais do jogo; variações reais do registro contábil, sem alegação de eficácia para trabalhadores reais.',
    reportLimits:
      'As condições iniciais são as mesmas. O movimento dos veículos depende dos quadros e pode variar entre execuções. Compare o tempo decorrido e o tempo de acordo; nenhum vencedor nem índice de confiança é inferido. Pontos de controle brutos e consentimentos nunca são exportados.',
  },
});
