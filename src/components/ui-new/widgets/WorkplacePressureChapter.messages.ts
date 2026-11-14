import { defineMessages } from '../../../i18n';

/** pt-BR label for a logic value; an unknown value falls back to itself. */
const pick = (labels: Record<string, string>, value: string): string => labels[value] ?? value;

type Status = { status: string };

export const workplacePressureChapterMessages = defineMessages({
  en: {
    // Logic values shown as labels. English returns the value itself.
    sectionLabel: (p: { section: string }) => p.section,
    objectionStatus: (p: Status) => p.status,
    deliveryStatus: (p: Status) => p.status,
    agreementStatus: (p: Status) => p.status,
    evidenceStatus: (p: Status) => (p.status === 'quality-failed' ? 'failed quality' : p.status),

    // Next beat (deriveWorkplaceGuidance)
    beatRestate: 'Restate the terms',
    beatRemedy: 'The raiser reviews the remedy',
    beatQualityReviews: 'Quality reviews the line',
    beatCompleteInspection: 'Complete protected inspection',
    beatAccount: 'Account for what was kept',
    beatRecovery: 'Complete owed recovery',
    beatNextShift: 'Prepare the next shift',
    beatArchive: 'Close the campaign',
    beatSettle: 'Settle remaining obligations',
    // D14: each next step is one sentence, the action; caveats are cut.
    nextRecovery: 'Resume the plant clock to deliver owed recovery.',
    nextWorkshopRecovery: 'Deliver modeled recovery in Review.',
    nextShift: 'Continue to the next campaign shift in Review.',
    nextArchive: 'Archive the review in Review to open a fresh exercise.',
    nextSettle:
      'Settle retained recovery, reserved pay and active cover in Review before archiving.',
    beatDeliver: 'Deliver the agreement',
    beatEarn: 'Earn a fresh agreement',
    nextRestate: 'Use Restate protected terms in Shift.',
    nextRemedy: 'In Agreement / Voices, select the resolving author.',
    nextInspect: 'Use Quality puts the sample first on the bench in Shift; the line is held.',
    nextInspectingSample:
      'The lab bench is testing Monday’s sample; the line holds until it has read it.',
    nextInspecting: 'Inspection is running until modeled minute {minute}.',
    nextReviewing: 'Review paid compensation, delivered recovery and customer delivery separately.',
    nextResumeAfterReload: 'A reload paused this shift before its end; resume it in Review.',
    nextResumeAfterSafety:
      'An emergency stop or drill paused this shift before its end; resume it in Review.',
    nextResumeAfterObjection: 'Its objection is resolved; resume this shift in Review.',
    nextRunning: 'Use the plant clock controls to run or pause real production.',
    nextRevised: 'Your no is recorded; compare revised offers in Shift.',
    nextReady: 'Current terms are ready; Approve and run agreement is in Agreement / Voices.',
    nextCampaign:
      'Choose the episode response and plan in Shift, then answer the current role checks and record understanding, ballots and any separate cover consent in Agreement / Voices.',
    nextPlan:
      'Choose the plan in Shift, then record understanding, ballots and any separate cover consent in Agreement / Voices.',

    // Governance rule
    ruleConsent: 'Every member must approve the shared plan.',
    ruleVote: 'A member majority approves the plan; it cannot volunteer an individual.',
    ruleConsult: 'The coordinator hears each role before assigning qualified work.',

    // Chapter
    regionLabel: 'Pressure chapter',
    headingThursday: 'Thursday: a fresh offer',
    headingPressure: 'A working agreement under pressure',
    willingnessExpired: 'Yesterday’s willingness has expired.',
    challengeLine: '{role} challenge: {status}. {receipt}',
    adviser: 'Adviser',
    protectedRecorded: 'Protected terms recorded.',
    noProtectedReceipt: 'No retained protected-terms receipt.',
    protectedWithoutChallenge: 'Protected terms recorded without a challenge.',
    noPressureResponse: 'No retained pressure response.',
    goToControls: 'Go to {destination} controls',
    detailsSummary: 'Terms, retained burden and delivery',
    offerLine:
      'Current offer: {plan}, revision {revision}. Adviser boundaries: {ack}. Role understanding {understood}/{members}; ballots recorded {ballots}/{members}. Separate cover consent: {cover}.',
    acknowledged: 'acknowledged',
    awaitingAnswers: 'awaiting current answers',
    none: 'none',
    openItem: 'Open: {statement}',
    memberLine:
      '{role}: retained extra duty {extra} min; compensation paid {paid} credits; recovery delivered {recovery} min; recovery owed {owed} min.',
    deliveryLine:
      'Delivery {status}: {delivered} / {target} kg. Agreement outcome: {agreement}. Wages paid: {wages} credits. Full customer commitment remaining: {remaining} kg.',
    dispatchEvidence: ' Dispatch evidence: {evidence}.',
  },
  'pt-BR': {
    sectionLabel: (p: { section: string }) =>
      pick(
        {
          Handoff: 'Passagem de turno',
          Shift: 'Turno',
          Practices: 'Práticas',
          'Agreement / Voices': 'Acordo / Vozes',
          Review: 'Revisão',
          Experiment: 'Experimento',
        },
        p.section
      ),
    objectionStatus: (p: Status) => pick({ open: 'aberta', resolved: 'resolvida' }, p.status),
    deliveryStatus: (p: Status) =>
      pick(
        {
          blocked: 'bloqueada',
          met: 'cumprida',
          shortfall: 'abaixo da meta',
          pending: 'pendente',
        },
        p.status
      ),
    agreementStatus: (p: Status) =>
      pick({ honoured: 'cumprido', incomplete: 'incompleto', pending: 'pendente' }, p.status),
    evidenceStatus: (p: Status) =>
      pick(
        {
          current: 'atual',
          stale: 'desatualizada',
          'quality-failed': 'reprovada na qualidade',
          missing: 'ausente',
        },
        p.status
      ),

    beatRestate: 'Reafirme os termos',
    beatRemedy: 'Quem levantou a objeção revisa a reparação',
    beatQualityReviews: 'A Qualidade revisa a linha',
    beatCompleteInspection: 'Conclua a inspeção protegida',
    beatAccount: 'Preste contas do que foi cumprido',
    beatRecovery: 'Cumpra o descanso compensatório devido',
    beatNextShift: 'Prepare o próximo turno',
    beatArchive: 'Encerre a campanha',
    beatSettle: 'Cumpra as obrigações pendentes',
    nextRecovery: 'Retome o relógio da fábrica para cumprir o descanso compensatório devido.',
    nextWorkshopRecovery: 'Cumpra o descanso compensatório modelado em Revisão.',
    nextShift: 'Avance para o próximo turno da campanha em Revisão.',
    nextArchive: 'Arquive a revisão em Revisão para abrir um novo exercício.',
    nextSettle:
      'Cumpra o descanso compensatório retido, o pagamento reservado e a cobertura ativa em Revisão antes de arquivar.',
    beatDeliver: 'Cumpra o acordo',
    beatEarn: 'Conquiste um novo acordo',
    nextRestate: 'Use “Reafirmar os termos protegidos” em Turno.',
    nextRemedy: 'Em Acordo / Vozes, selecione o autor da resolução.',
    nextInspect:
      'Use “A Qualidade coloca a amostra em primeiro lugar na bancada” em Turno; a linha fica retida.',
    nextInspectingSample:
      'A bancada do laboratório está testando a amostra de segunda-feira; a linha fica retida até lê-la.',
    nextInspecting: 'A inspeção está em andamento até o minuto modelado {minute}.',
    nextReviewing:
      'Revise separadamente a compensação paga, a recuperação concedida e a entrega ao cliente.',
    nextResumeAfterReload: 'Uma recarga pausou este turno antes do fim; retome-o em Revisão.',
    nextResumeAfterSafety:
      'Uma parada de emergência ou um simulado pausou este turno antes do fim; retome-o em Revisão.',
    nextResumeAfterObjection: 'A objeção foi resolvida; retome este turno em Revisão.',
    nextRunning: 'Use os controles do relógio da planta para rodar ou pausar a produção real.',
    nextRevised: 'Seu “não” foi registrado; compare as ofertas revisadas em Turno.',
    nextReady:
      'Os termos atuais estão prontos; “Aprovar e executar o acordo” fica em Acordo / Vozes.',
    nextCampaign:
      'Escolha a resposta ao episódio e o plano em Turno; depois responda às verificações atuais das funções e registre o entendimento, os votos e qualquer consentimento separado para cobertura em Acordo / Vozes.',
    nextPlan:
      'Escolha o plano em Turno; depois registre o entendimento, os votos e qualquer consentimento separado para cobertura em Acordo / Vozes.',

    ruleConsent: 'Todos os cooperados precisam aprovar o plano compartilhado.',
    ruleVote:
      'A maioria dos cooperados aprova o plano; ela não pode oferecer uma pessoa como voluntária.',
    ruleConsult: 'A coordenação ouve cada função antes de designar trabalho qualificado.',

    regionLabel: 'Capítulo de pressão',
    headingThursday: 'Quinta-feira: uma nova oferta',
    headingPressure: 'Um acordo de trabalho sob pressão',
    willingnessExpired: 'A disposição de ontem expirou.',
    challengeLine: 'Contestação de {role}: {status}. {receipt}',
    adviser: 'Conselheiro',
    protectedRecorded: 'Termos protegidos registrados.',
    noProtectedReceipt: 'Nenhum comprovante de termos protegidos registrado.',
    protectedWithoutChallenge: 'Termos protegidos registrados sem contestação.',
    noPressureResponse: 'Nenhuma resposta à pressão registrada.',
    goToControls: 'Ir para os controles de {destination}',
    detailsSummary: 'Termos, carga acumulada e entrega',
    offerLine:
      'Oferta atual: {plan}, revisão {revision}. Limites do conselheiro: {ack}. Entendimento das funções {understood}/{members}; votos registrados {ballots}/{members}. Consentimento separado para cobertura: {cover}.',
    acknowledged: 'reconhecidos',
    awaitingAnswers: 'aguardando as respostas atuais',
    none: 'nenhum',
    openItem: 'Aberta: {statement}',
    memberLine:
      '{role}: trabalho extra acumulado {extra} min; compensação paga {paid} créditos; recuperação concedida {recovery} min; recuperação devida {owed} min.',
    deliveryLine:
      'Entrega {status}: {delivered} / {target} kg. Resultado do acordo: {agreement}. Remuneração paga: {wages} créditos. Restante do compromisso total com o cliente: {remaining} kg.',
    dispatchEvidence: ' Evidência de expedição: {evidence}.',
  },
});
