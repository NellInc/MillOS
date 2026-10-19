import { defineMessages } from '../i18n';

/** Reasons the workplace store returns to the workplace panels. */
export const workplaceStoreMessages = defineMessages({
  en: {
    useCurrentTurn:
      'Hand over to this role and use its current turn. Facilitators cannot record participant decisions.',
    challengeCannotSpeak:
      'This authored challenge cannot speak for a participant. Hand over to the affected role to raise its own objection.',
    answerChecksFirst:
      'Answer the current mandate, refusal and optional-duty checks correctly before confirming understanding.',
    simulatedResponsesDisabled:
      'Separate turns require each role decision. Simulated responses are disabled.',
    endTurnBeforeSetup: 'End the participant turn before facilitator setup or settlement.',
    finishReplayBeforeObligations:
      'Finish or forget the matched replay before continuing workplace obligations.',
    chooseModeBeforeScenario:
      'Choose the interaction mode only before opening an untouched scenario.',
    chooseFictionalRole:
      'End the previous turn and choose a fictional role in an open scenario, outside replay.',
    knownAnswerRequired: 'Use a known answer in the current participant turn.',
    answerUnchanged: 'Answer unchanged.',
    roleDecisionsOnly: 'Participant dispatch accepts role decisions only.',
    readBeforeReload: 'Read the current workplace outside replay before rehearsing reload.',
    reloadRehearsed:
      'Local reload rehearsal completed. Future authority expired; earned pay and recovery remain in review.',
    endTurnBeforeArchive: 'End the participant turn before archiving.',
    reviewChanged: 'The review changed. Read its current outcome first.',
    finishReplayFirst: 'Finish or forget the matched replay first.',
    completeThreeShifts: 'Complete all three shifts before archiving a review.',
    settleBeforeArchive:
      'Deliver owed recovery and settle objections and reserved pay before archiving.',
    reviewNotValidated: 'This review could not be validated for the archive.',
    openCommitmentRequired:
      'Choose an open, quality-qualified customer commitment with no active recovery challenge.',
    safetyStopHolds:
      'The safety stop holds this agreement. No new work during an emergency or drill.',
    endTurnBeforeActivation: 'End the participant turn before facilitator activation.',
    materialSessionChanged:
      'The physical material session changed. Historical receipts cannot authorise a new agreement.',
    freshAdviceRequired:
      'Plant evidence or the intended pace changed. Hear a fresh adviser response, then confirm understanding and ballots again.',
    dispatchEvidenceRequired:
      'Current quality-qualified dispatch evidence is required before funding a trial.',
  },
  'pt-BR': {
    useCurrentTurn:
      'Passe para esta função e use a vez atual dela. Os facilitadores não podem registrar decisões dos participantes.',
    challengeCannotSpeak:
      'Este desafio roteirizado não pode falar por um participante. Passe a vez para a função afetada para que ela apresente a própria objeção.',
    answerChecksFirst:
      'Responda corretamente às verificações atuais de mandato, recusa e tarefa opcional antes de confirmar o entendimento.',
    simulatedResponsesDisabled:
      'Jogar cada um na sua vez exige a decisão de cada função. As respostas simuladas estão desativadas.',
    endTurnBeforeSetup:
      'Encerre a vez do participante antes da configuração ou do acerto final pelo facilitador.',
    finishReplayBeforeObligations:
      'Conclua ou descarte a reprodução pareada antes de continuar os compromissos do local de trabalho.',
    chooseModeBeforeScenario:
      'Escolha o modo de interação somente antes de abrir um cenário ainda não iniciado.',
    chooseFictionalRole:
      'Encerre a vez anterior e escolha uma função fictícia em um cenário aberto, fora da reprodução.',
    knownAnswerRequired: 'Use uma resposta conhecida na vez atual do participante.',
    answerUnchanged: 'Resposta inalterada.',
    roleDecisionsOnly: 'O envio pelo participante aceita somente decisões de função.',
    readBeforeReload:
      'Leia o local de trabalho atual fora da reprodução antes de ensaiar o recarregamento.',
    reloadRehearsed:
      'Ensaio de recarregamento local concluído. A autoridade futura expirou; a remuneração e o tempo de recuperação conquistados continuam em revisão.',
    endTurnBeforeArchive: 'Encerre a vez do participante antes de arquivar.',
    reviewChanged: 'A revisão mudou. Leia primeiro o resultado atual.',
    finishReplayFirst: 'Conclua ou descarte primeiro a reprodução pareada.',
    completeThreeShifts: 'Conclua os três turnos antes de arquivar uma revisão.',
    settleBeforeArchive:
      'Conceda o tempo de recuperação devido e resolva as objeções e a remuneração reservada antes de arquivar.',
    reviewNotValidated: 'Não foi possível validar esta revisão para o arquivo.',
    openCommitmentRequired:
      'Escolha um compromisso de cliente em aberto, qualificado pela qualidade e sem desafio de recuperação ativo.',
    safetyStopHolds:
      'A parada de segurança retém este acordo. Nenhum trabalho novo durante uma emergência ou simulado.',
    endTurnBeforeActivation: 'Encerre a vez do participante antes da ativação pelo facilitador.',
    materialSessionChanged:
      'A sessão física de material mudou. Comprovantes históricos não podem autorizar um novo acordo.',
    freshAdviceRequired:
      'A evidência da planta ou o ritmo pretendido mudou. Ouça uma nova resposta do conselheiro e depois confirme novamente o entendimento e os votos.',
    dispatchEvidenceRequired:
      'É necessária evidência atual de expedição qualificada pela qualidade antes de financiar um teste.',
  },
});
