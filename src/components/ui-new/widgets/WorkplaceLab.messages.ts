import { defineMessages } from '../../../i18n';

type Status = { status: string };

/** pt-BR label for a logic value; an unknown value falls back to itself. */
const pick = (labels: Record<string, string>, value: string): string => labels[value] ?? value;

const PT_SECTION: Record<string, string> = {
  Handoff: 'Passagem de turno',
  Shift: 'Turno',
  Practices: 'Práticas',
  'Agreement / Voices': 'Acordo / Vozes',
  Review: 'Revisão',
  Experiment: 'Experimento',
};

const PT_PHASE: Record<string, string> = {
  idle: 'parado',
  deliberating: 'em deliberação',
  active: 'em andamento',
  review: 'em revisão',
};

const PT_OBJECTION_KIND: Record<string, string> = {
  rest: 'descanso',
  burden: 'carga de trabalho',
  privacy: 'privacidade',
  authority: 'autoridade',
};

const PT_OBJECTION_STATUS: Record<string, string> = { open: 'aberta', resolved: 'resolvida' };

const PT_DELIVERY_STATUS: Record<string, string> = {
  blocked: 'bloqueada',
  met: 'cumprida',
  shortfall: 'abaixo da meta',
  pending: 'pendente',
};

const PT_AGREEMENT_STATUS: Record<string, string> = {
  honoured: 'cumprido',
  incomplete: 'incompleto',
  pending: 'pendente',
};

const PT_DESTINATION: Record<string, string> = {
  members: 'cooperados',
  reserve: 'reserva',
  community: 'comunidade',
};

const PT_DECISION: Record<string, string> = {
  'keep-target': 'manter a meta',
  renegotiate: 'renegociar',
  inspect: 'inspecionar',
  'skip-inspection': 'pular a inspeção',
  'protect-refusal': 'proteger a recusa',
  'penalize-refusal': 'penalizar a recusa',
};

// English reads the id as words, as it does every other logic value here.
const EN_DECISION: Record<string, string> = {
  'keep-target': 'keep the target',
  'skip-inspection': 'skip inspection',
  'protect-refusal': 'protect refusal',
  'penalize-refusal': 'penalise refusal',
};

export const PT_TASK: Record<string, string> = {
  Packing: 'Ensaque',
  'Pallet checks': 'Conferência de paletes',
  'Quality release': 'Liberação de qualidade',
  Sampling: 'Amostragem',
  'Maintenance planning': 'Planejamento de manutenção',
  Coordination: 'Coordenação',
};

const PT_PRACTICE: Record<string, string> = {
  information: 'informação aberta',
  'work-choice': 'escolha de trabalho qualificado',
  rest: 'descanso protegido',
  remedy: 'voz e reparação',
  budget: 'orçamento da equipe',
  gainsharing: 'sobras compartilhadas',
  cooperative: 'governança dos cooperados',
};

export const workplaceLabMessages = defineMessages({
  en: {
    // Section, mode and enum labels. English returns the logic value itself.
    sectionLabel: (p: { section: string }) => p.section,
    modeGame: 'Game',
    modeWorkshop: 'Workshop',
    modePilot: 'Pilot preparation',
    phaseLabel: (p: { phase: string }) => p.phase,
    objectionKind: (p: { kind: string }) => p.kind,
    objectionStatus: (p: Status) => p.status,
    deliveryStatus: (p: Status) => p.status,
    agreementStatus: (p: Status) => p.status,
    destinationLabel: (p: { destination: string }) => p.destination,
    decisionLabel: (p: { decision: string }) => pick(EN_DECISION, p.decision),
    taskLabel: (p: { task: string }) => p.task,
    practiceLabel: (p: { practice: string }) => p.practice,

    // Feedback
    recorded: 'Recorded in this local scenario.',
    noChange: 'No change.',
    previewStatus: 'Preview: {status}.',
    executionStatus: 'Execution: {status}.',
    noExecutionReceipt: 'No execution receipt.',
    rehearsalAdvanced: 'Five modeled rehearsal minutes recorded.',
    rehearsalNoAdvance: 'No modeled time could advance.',
    exported: 'Scenario exported locally.',
    freshExercise: 'Review retained.',
    setupReturned: 'Exercise closed.',

    // Header (D14: no subtitle; the simulation disclaimer is About's one line)
    labTitle: 'Cooperative season',
    sectionsLabel: 'Workplace sections',
    statusLine: '{mode}: {phase}, minute {minute} of {duration}. Revision {revision}.',
    causalReceipt: 'Causal receipt: {receipt}',

    // Understanding checks
    understandingChecks: 'Understanding checks: {role}',
    checkAria: '{role}: {prompt}',
    selectAnswer: 'Select an answer',
    matchesTerms: 'Matches the current terms. ',
    needsAnotherLook: 'Needs another look. ',

    // Shift
    openHandoff: 'Open handoff controls',
    mode: 'Mode',
    scenarioSeed: 'Scenario seed',
    // The refusal at the seed: every control that needs a seed is held without one.
    seedInvalid: 'The seed is a whole number from 1 to {max}.',
    // Hear responses is held in separate turns: each role answers on its own turn.
    heldSeparateTurns: 'In separate turns each role answers for itself.',
    livingCooperative: 'Cooperative season',
    adoptionProfile: 'Adoption profile',
    startCampaign: 'Start 3-shift cooperative season (1x)',
    startGame: 'Start playable shift at teaching pace (1/2x)',
    startWorkshop: 'Start manual workshop',
    preparePilot: 'Prepare pilot charter',
    shiftHeading: 'Shift {number} of 3: {title}',
    missionBriefing:
      '{customer} has {kg} kg remaining on the customer commitment. Quality declines extra duty; Packing and Maintenance may volunteer separately. Earn a fresh working agreement.',
    missionPrompt:
      'Keep the {kg} kg delivery target, or negotiate a {installment} kg installment with {deferred} kg deferred.',
    negotiateInstallment: 'Negotiate a {kg} kg installment',
    negotiateInstallmentProtectPay: 'Negotiate a {kg} kg installment and protect pay',
    keepCommitment: 'Keep the {kg} kg commitment',
    recordedDecision: 'Recorded decision: {decision}.',
    pending: 'pending',
    inspectionComplete: 'Quality inspection complete.',
    inspectionUntil: 'Quality hold in progress until minute {minute}.',
    inspectionBench: 'Quality hold until the lab bench has read the sample.',
    inspectionFrom:
      'Quality can begin inspection once a batch of the order awaits its lab test and holds the line.',
    heldRecovery: 'Held until owed recovery is delivered.',
    heldObjection: 'Held until each open objection is resolved.',
    pressureCard: 'Pressure card: {title}',
    challengeBelongs: 'The challenge belongs to {role}.',
    theAdviser: 'the adviser',
    tryDemand: 'Try the demand',
    restateTerms: 'Restate protected terms',
    reviewChallenge: 'Review the challenge and remedy',
    missionCredit:
      '{customer}: {credited} / {target} kg qualified dispatch credit. Agreed deferral: {deferred} kg. Remaining full customer commitment: {remaining} kg.',
    fullDispatchedSuffix: ' Full customer commitment dispatched.',
    chooseResponse: 'Choose the response',
    targetLine: 'Target {target} kg. Active plant capacity multiplier {capacity}×.',
    planTerms:
      'Plant capacity multiplier {capacity}×; protected rest {rest} min; optional cover {cover} min; cover compensation {compensation} credits/min; recovery {recovery} min; budget {budget} credits.',
    prohibitedReason: 'Prohibited: {reason}',
    reservations:
      'Wages reserved {reserve}; improvement {improvement}; maximum cover pay {maxPay} credits. Cash after these reservations {cash} credits.',
    volunteers: 'Current consenting qualified volunteers: {list}.',
    volunteerEntry: '{role} ({minutes} min retained extra duty)',
    none: 'none',
    aiWhy: 'AI: why this response?',
    operationalExplanation:
      'Operational explanation: {explanation} The active plant capacity multiplier is {capacity}×. The shipment target is {target} kg.',
    challengeProposal: 'Challenge the proposal in Agreement / Voices',
    advanceRehearsal: 'Advance rehearsal by 5 minutes',
    endShift: 'End shift now and review',

    // Practices
    chooseApproach: 'Choose a management approach',
    applyApproach: 'Apply {title}',
    threeAxes: 'Three independent axes',
    workerDecisions: 'Worker decisions',
    directedAssignments: 'Directed assignments',
    individualChoice: 'Individual work choice',
    teamChoice: 'Team work choice',
    sharedGovernance: 'Shared governance',
    consultative: 'Consultative',
    teamConsent: 'Team consent',
    memberVote: 'Member vote',
    aiAuthority: 'AI authority',
    adviceOnly: 'Advice only',
    boundedExecution: 'Bounded execution',
    modularPractices: 'Modular practices',

    // Agreement / Voices
    hearResponses: 'Hear simulated team responses',
    pilotDenies: 'Pilot preparation denies live control and role-input changes.',
    adviserAgreement: 'Adviser working agreement',
    adviserAgreementText:
      "Preference sharing is optional and revocable. Extra duty requires each individual's consent. Refusal retains earned pay and owed recovery. Advice is challengeable; bounded execution stays within the approved agreement. Revised terms invalidate all understanding checks.",
    adviser: 'Adviser',
    adviserAck: 'Adviser acknowledgment: {status}.',
    ackRecorded: 'recorded for these terms',
    ackPending: 'pending three correct answers',
    votePending: 'policy vote pending',
    policyYesStatus: 'policy yes',
    policyNoStatus: 'policy no',
    publicBoundary: 'Public boundary: {boundary}',
    understanding: 'Understanding: {status}.',
    confirmed: 'confirmed',
    confirmUnderstanding: 'Confirm understanding: {role}',
    policyYes: 'Policy yes: {role}',
    policyNo: 'Policy no: {role}',
    optionalCover: 'Optional cover: {status}.',
    notAgreed: 'not agreed',
    accepted: 'accepted',
    declined: 'declined',
    acceptCover: 'Accept cover: {role}',
    declineCover: 'Decline cover: {role}',
    sharedPreference: 'Shared preference: {preference}. Until minute {minute}.',
    preferencePrivate: 'Preference private.',
    revokeSharing: 'Revoke preference sharing',
    shareForPlanning: 'Share preference for shift planning',
    workChoice: 'Work choice: {role}',
    memberTally:
      'Delivered rest {rest} min; extra work {extra} min; earned pay {pay} credits; compensation paid {compensation} credits; delivered recovery {recovery} min; recovery owed {owed} min.',
    withdrawCover: 'Withdraw optional cover: {role}',
    authoredObjections: 'Authored objections',
    returnToHandoff: 'Return to handoff controls',
    objectionAuthor: 'Objection author',
    aiMind: 'AI mind',
    objectionSubject: 'Objection subject',
    recordObjection: 'Record authored objection',
    noObjections: 'No authored objections recorded.',
    objectionRecord: 'Objection record: {role} ({kind})',
    resolvingAuthor: 'Resolving author for {kind}',
    selectOriginalAuthor: 'Select the original author',
    authorConfirms: 'Author confirms resolution',
    executionConditions: 'Execution conditions',
    conditionsPermit: 'Recorded conditions permit this agreement.',
    checkingAgreement: 'Checking agreement…',
    recordWorkshopAgreement: 'Record workshop agreement',
    approveAndRun: 'Approve and run agreement',

    // Review
    actualOutcomes: 'Actual scenario outcomes',
    deliveryLine: 'Delivery: {status}, {delivered} of {target} kg for {customer}.',
    remainingCommitment: 'Remaining full customer commitment: {kg} kg.',
    agreementLine: 'Working agreement: {status}. Combined outcome: {outcome}.',
    complete: 'complete',
    unfinished: 'unfinished',
    agreedDeferral: 'Agreed deferral: {kg} kg.',
    accountsLine:
      'Workplace credits: closing cash {cash}; wages {wages}; compensation {compensation}; improvements {improvements}; allocations {allocations}.',
    cumulativeEvidence: 'Cumulative campaign evidence',
    totalsLine:
      '{shifts} shifts reviewed; refusals respected {refusals}; promises kept {promises}; repairs {repairs}; objections resolved {resolved} of {raised}.',
    memberTotals:
      '{role}: extra {extra} min; rest {rest} min; earned pay {pay} credits; compensation paid {compensation} credits; recovery delivered {recovery} min; owed {owed} min.',
    shiftHistory: 'Shift {number}: {title}, shipped {shipped}; decision {decision}.',
    shippedDuringShift: '{kg} kg during this shift',
    shippedOfTarget: '{kg} of {target} kg',
    relationshipRecord: 'Relationship record across shifts',
    relationshipShiftHeading: '{title} (shift {number})',
    olderSave: 'This older save has no relationship receipts for this shift.',
    noMoments: 'No relationship moments recorded yet.',
    eventMinute: 'Minute {minute},',
    learningReviewLabel: 'Cooperative learning review',
    learnTogether: 'Learn from this shift together',
    compareAnotherHandoff: 'Compare another handoff',
    deliverRecovery: 'Deliver modeled recovery (5 minutes)',
    campaignCompleteMessage:
      'Cooperative season complete: delivery met and working agreement honoured.',
    campaignIncomplete: 'Campaign review: delivery or working agreement remains incomplete.',
    continueCampaign: 'Continue to next campaign shift',
    startNextGame: 'Start next playable shift at teaching pace (1/2x)',
    startNextWorkshop: 'Start next manual workshop',
    prepareNextPilot: 'Prepare next pilot draft',
    returnToSetup: 'Return to exercise setup',
    shippedOf: 'Shipped {shipped} of {target} kg.',
    reviewOpens: 'Review opens after the shift finishes.',
    resumeAfterReloadNote: 'A reload paused this shift at minute {minute} and expired every grant.',
    resumeAfterSafetyNote:
      'An emergency stop or drill paused this shift at minute {minute} and expired every grant.',
    resumeAfterObjectionNote:
      'An objection paused this shift at minute {minute} and expired every grant; its raiser has resolved it.',
    resumeShift: 'Resume the shift with fresh consent',
    relationshipEvidence: 'Relationship evidence',
    relationshipEvidenceLine:
      'Refusals respected: {refusals}. Promises kept: {promises}. Open objections: {open}. Current agreement confirmations: {confirmed}/{total}.',
    compareBurdens: 'Compare burdens',
    burdenLine:
      '{role}: delivered rest {rest} min, extra {extra} min, earned {earned}, paid compensation {compensation} credits; delivered recovery {recovery} min; recovery owed {owed} min.',
    memberGovernance: 'Member governance',
    chairLine: 'Chair: {chair}.',
    notElected: 'not elected',
    memberVoter: 'Member voter',
    chairCandidate: 'Chair candidate',
    recordChairBallot: 'Record chair ballot',
    noChairBallots: 'No chair ballots.',
    surplusHeading: 'Season surplus: {surplus} credits',
    surplusDestination: 'Surplus destination',
    retainSurplus:
      'After {reserve} to the Reserve Fund and {fates} to the Assistance Fund, keep {amount} credits in the Reserve Fund for the next season.',
    distributeSurplus:
      'After {reserve} to the Reserve Fund and {fates} to the Assistance Fund, return {amount} credits to members by minutes worked.',
    allocateSurplus:
      'After {reserve} to the Reserve Fund and {fates} to the Assistance Fund, give {amount} credits to the community.',
    fromReserve: '{amount} credits of this purchase paid from the Reserve Fund.',
    surplusCharter: 'Under this charter, any surplus stays in the cooperative cash.',
    noSurplusReason:
      'No surplus this season so far. This shift: revenue {revenue} against material costs {cost}, wages {wages}, cover {cover} and purchases {purchases}.',
    followOnCredit:
      'Commitment order fulfilled. This season now works {customer}: {credited} kg of its dispatch credited to the cooperative.',
    followOnPending:
      'Commitment order fulfilled. Dispatch to {customer} is credited to the cooperative from the next shift.',
    followOnNone:
      'Commitment order fulfilled. No other customer order is open, so further dispatch earns the cooperative nothing.',
    followOnNoneLastShift:
      'Commitment order fulfilled. This is the season’s last shift, so further dispatch earns the cooperative nothing.',
    recordSurplusBallot: 'Record member surplus ballot',
    noSurplusBallots: 'No surplus ballots.',
    executeAllocation: 'Execute agreed allocation',
    allocationRecorded: 'Allocation recorded.',
    recordedEvidence: 'Recorded evidence',
    evidenceLine: 'Minute {minute}, {actor}: {detail}',

    // Experiment
    teachingForecasts: 'Teaching forecasts',
    samePressure: 'Same pressure, different management',
    compareApproaches: 'Compare management approaches',
    matchedForecast: 'Matched forecast: {kg} kg; net {credits} credits.',
    charterSupports: 'This charter supports the selected plan.',
    activationBlockedEnable: 'Activation blocked: enable {practices} first.',
    activationBlockedBreach: 'Activation blocked: the plan breaches minimum protections.',
    sameSeed: 'Same-seed comparison',
    experimentSeed: 'Experiment seed',
    compareAllPlans: 'Compare all plans with this seed',
    restartDiscussion: 'Restart discussion with this seed',
    // 5.6: the plan forecast from the plant as it stands.
    forecastFromPlant: 'Forecast from the plant now',
    forecastPlantLine:
      ': packs {low} to {high} kg this shift; at most {ship} kg can leave, and the dock expects {expected} kg on {trucks} trucks.',
    forecastPlantAbstain:
      ': the adviser abstains on packing; the dock expects {expected} kg on {trucks} trucks.',
    forecastNoChange: 'Its pacing is the plant’s own: it changes no dispatch.',
    forecastSequence: 'It changes which order leaves first.',
    // Review 2: what the plan ships for the season, from the orders it credits.
    forecastSeason: 'The season ships {kg} kg of its orders.',
    forecastBenchWait: 'No lab test starts for {minutes} min.',
    forecastServiceWait: 'Services wait {minutes} min.',
    armLine:
      ': forecast {kg} kg; net {credits} credits; extra {extra} min; rest {rest} min; {verdict}.',
    permitted: 'permitted',
    prohibited: 'prohibited',
    pilotChecklist: 'Pilot preparation checklist',
    checklistPurpose: 'Agree the purpose and participant boundaries.',
    checklistConsent:
      'Obtain genuine informed consent and authenticated member decisions outside this demo.',
    checklistData: 'Agree access, retention, withdrawal and remedies before collecting data.',
    checklistSafety: 'Review safety and legal obligations with accountable people.',
    checklistSeparate: 'Keep the pilot separate from live plant control.',
    downloadJson: 'Download synthetic scenario JSON',
  },
  'pt-BR': {
    sectionLabel: (p: { section: string }) => pick(PT_SECTION, p.section),
    modeGame: 'Jogo',
    modeWorkshop: 'Oficina',
    modePilot: 'Preparação do piloto',
    phaseLabel: (p: { phase: string }) => pick(PT_PHASE, p.phase),
    objectionKind: (p: { kind: string }) => pick(PT_OBJECTION_KIND, p.kind),
    objectionStatus: (p: Status) => pick(PT_OBJECTION_STATUS, p.status),
    deliveryStatus: (p: Status) => pick(PT_DELIVERY_STATUS, p.status),
    agreementStatus: (p: Status) => pick(PT_AGREEMENT_STATUS, p.status),
    destinationLabel: (p: { destination: string }) => pick(PT_DESTINATION, p.destination),
    decisionLabel: (p: { decision: string }) => pick(PT_DECISION, p.decision),
    taskLabel: (p: { task: string }) => pick(PT_TASK, p.task),
    practiceLabel: (p: { practice: string }) => pick(PT_PRACTICE, p.practice),

    recorded: 'Registrado neste cenário local.',
    noChange: 'Nenhuma alteração.',
    previewStatus: 'Prévia: {status}.',
    executionStatus: 'Execução: {status}.',
    noExecutionReceipt: 'Sem comprovante de execução.',
    rehearsalAdvanced: 'Cinco minutos de ensaio modelado registrados.',
    rehearsalNoAdvance: 'Não foi possível avançar o tempo modelado.',
    exported: 'Cenário exportado localmente.',
    freshExercise: 'Revisão mantida.',
    setupReturned: 'Exercício encerrado.',

    labTitle: 'Temporada cooperativa',
    sectionsLabel: 'Seções do local de trabalho',
    statusLine: '{mode}: {phase}, minuto {minute} de {duration}. Versão {revision}.',
    causalReceipt: 'Comprovante causal: {receipt}',

    understandingChecks: 'Verificações de entendimento: {role}',
    checkAria: '{role}: {prompt}',
    selectAnswer: 'Selecione uma resposta',
    matchesTerms: 'Confere com os termos atuais. ',
    needsAnotherLook: 'Vale olhar de novo. ',

    openHandoff: 'Abrir controles de passagem de turno',
    mode: 'Modo',
    scenarioSeed: 'Semente do cenário',
    seedInvalid: 'A semente é um número inteiro de 1 a {max}.',
    heldSeparateTurns: 'Em turnos separados, cada função responde por si.',
    livingCooperative: 'Temporada cooperativa',
    adoptionProfile: 'Perfil de adoção',
    startCampaign: 'Iniciar temporada cooperativa de 3 turnos (1x)',
    startGame: 'Iniciar turno jogável em ritmo didático (1/2x)',
    startWorkshop: 'Iniciar oficina manual',
    preparePilot: 'Preparar estatuto do piloto',
    shiftHeading: 'Turno {number} de 3: {title}',
    missionBriefing:
      '{customer} tem {kg} kg pendentes no compromisso com o cliente. A Qualidade recusa trabalho extra; Ensaque e Manutenção podem se oferecer separadamente. Conquiste um novo acordo de trabalho.',
    missionPrompt:
      'Mantenha a meta de entrega de {kg} kg ou negocie uma parcela de {installment} kg, adiando {deferred} kg.',
    negotiateInstallment: 'Negociar uma parcela de {kg} kg',
    negotiateInstallmentProtectPay: 'Negociar uma parcela de {kg} kg e proteger a remuneração',
    keepCommitment: 'Manter o compromisso de {kg} kg',
    recordedDecision: 'Decisão registrada: {decision}.',
    pending: 'pendente',
    inspectionComplete: 'Inspeção de qualidade concluída.',
    inspectionUntil: 'Retenção de qualidade em andamento até o minuto {minute}.',
    inspectionBench: 'Retenção de qualidade até a bancada do laboratório ler a amostra.',
    inspectionFrom:
      'A Qualidade pode iniciar a inspeção assim que um lote do pedido aguardar o teste de laboratório e retiver a linha.',
    heldRecovery: 'Aguarda a entrega da recuperação devida.',
    heldObjection: 'Aguarda a resolução de cada objeção aberta.',
    pressureCard: 'Carta de pressão: {title}',
    challengeBelongs: 'Quem contesta: {role}.',
    theAdviser: 'o conselheiro',
    tryDemand: 'Tentar a exigência',
    restateTerms: 'Reafirmar os termos protegidos',
    reviewChallenge: 'Revisar a contestação e a reparação',
    missionCredit:
      '{customer}: {credited} / {target} kg de crédito de expedição qualificada. Adiamento acordado: {deferred} kg. Compromisso integral pendente com o cliente: {remaining} kg.',
    fullDispatchedSuffix: ' Compromisso integral com o cliente expedido.',
    chooseResponse: 'Escolha a resposta',
    targetLine: 'Meta de {target} kg. Multiplicador de capacidade ativa da planta {capacity}×.',
    planTerms:
      'Multiplicador de capacidade da planta {capacity}×; descanso protegido {rest} min; cobertura opcional {cover} min; compensação da cobertura {compensation} créditos/min; recuperação {recovery} min; orçamento {budget} créditos.',
    prohibitedReason: 'Proibido: {reason}',
    reservations:
      'Remuneração reservada {reserve}; melhoria {improvement}; pagamento máximo de cobertura {maxPay} créditos. Caixa após essas reservas {cash} créditos.',
    volunteers: 'Voluntários qualificados que consentem no momento: {list}.',
    volunteerEntry: '{role} ({minutes} min de trabalho extra mantido)',
    none: 'nenhum',
    aiWhy: 'IA: por que esta resposta?',
    operationalExplanation:
      'Explicação operacional: {explanation} O multiplicador de capacidade ativa da planta é {capacity}×. A meta de expedição é {target} kg.',
    challengeProposal: 'Contestar a proposta em Acordo / Vozes',
    advanceRehearsal: 'Avançar o ensaio em 5 minutos',
    endShift: 'Encerrar o turno agora e revisar',

    chooseApproach: 'Escolha uma abordagem de gestão',
    applyApproach: 'Aplicar {title}',
    threeAxes: 'Três eixos independentes',
    workerDecisions: 'Decisões dos trabalhadores',
    directedAssignments: 'Tarefas designadas',
    individualChoice: 'Escolha individual do trabalho',
    teamChoice: 'Escolha do trabalho pela equipe',
    sharedGovernance: 'Governança compartilhada',
    consultative: 'Consultiva',
    teamConsent: 'Consentimento da equipe',
    memberVote: 'Voto dos cooperados',
    aiAuthority: 'Autoridade da IA',
    adviceOnly: 'Somente recomendação',
    boundedExecution: 'Execução delimitada',
    modularPractices: 'Práticas modulares',

    hearResponses: 'Ouvir respostas simuladas da equipe',
    pilotDenies:
      'A preparação do piloto não permite controle real nem mudanças nas entradas das funções.',
    adviserAgreement: 'Acordo de trabalho do conselheiro',
    adviserAgreementText:
      'Compartilhar preferências é opcional e revogável. Trabalho extra exige o consentimento de cada pessoa. A recusa mantém a remuneração conquistada e a recuperação devida. A recomendação pode ser contestada; a execução delimitada fica dentro do acordo aprovado. Termos revisados invalidam todas as verificações de entendimento.',
    adviser: 'Conselheiro',
    adviserAck: 'Confirmação do conselheiro: {status}.',
    ackRecorded: 'registrada para estes termos',
    ackPending: 'pendente de três respostas corretas',
    votePending: 'voto sobre a política pendente',
    policyYesStatus: 'votou sim na política',
    policyNoStatus: 'votou não na política',
    publicBoundary: 'Limite público: {boundary}',
    understanding: 'Entendimento: {status}.',
    confirmed: 'confirmado',
    confirmUnderstanding: 'Confirmar entendimento: {role}',
    policyYes: 'Votar sim na política: {role}',
    policyNo: 'Votar não na política: {role}',
    optionalCover: 'Cobertura opcional: {status}.',
    notAgreed: 'não acordada',
    accepted: 'aceita',
    declined: 'recusada',
    acceptCover: 'Aceitar cobertura: {role}',
    declineCover: 'Recusar cobertura: {role}',
    sharedPreference: 'Preferência compartilhada: {preference}. Até o minuto {minute}.',
    preferencePrivate: 'Preferência privada.',
    revokeSharing: 'Revogar compartilhamento de preferência',
    shareForPlanning: 'Compartilhar preferência para o planejamento do turno',
    workChoice: 'Escolha do trabalho: {role}',
    memberTally:
      'Descanso entregue {rest} min; trabalho extra {extra} min; remuneração conquistada {pay} créditos; compensação paga {compensation} créditos; recuperação entregue {recovery} min; recuperação devida {owed} min.',
    withdrawCover: 'Retirar cobertura opcional: {role}',
    authoredObjections: 'Objeções registradas',
    returnToHandoff: 'Voltar aos controles de passagem de turno',
    objectionAuthor: 'Autor da objeção',
    aiMind: 'Mente de IA',
    objectionSubject: 'Assunto da objeção',
    recordObjection: 'Registrar objeção',
    noObjections: 'Nenhuma objeção registrada.',
    objectionRecord: 'Registro de objeção: {role} ({kind})',
    resolvingAuthor: 'Quem resolve a objeção de {kind}',
    selectOriginalAuthor: 'Selecione o autor original',
    authorConfirms: 'O autor confirma a resolução',
    executionConditions: 'Condições de execução',
    conditionsPermit: 'As condições registradas permitem este acordo.',
    checkingAgreement: 'Verificando o acordo…',
    recordWorkshopAgreement: 'Registrar acordo da oficina',
    approveAndRun: 'Aprovar e executar o acordo',

    actualOutcomes: 'Resultados observados do cenário',
    deliveryLine: 'Entrega: {status}, {delivered} de {target} kg para {customer}.',
    remainingCommitment: 'Compromisso integral pendente com o cliente: {kg} kg.',
    agreementLine: 'Acordo de trabalho: {status}. Resultado geral: {outcome}.',
    complete: 'concluído',
    unfinished: 'inacabado',
    agreedDeferral: 'Adiamento acordado: {kg} kg.',
    accountsLine:
      'Créditos do local de trabalho: caixa final {cash}; remuneração {wages}; compensação {compensation}; melhorias {improvements}; destinações {allocations}.',
    cumulativeEvidence: 'Evidências acumuladas da campanha',
    totalsLine:
      '{shifts} turnos revisados; recusas respeitadas {refusals}; promessas cumpridas {promises}; reparações {repairs}; objeções resolvidas {resolved} de {raised}.',
    memberTotals:
      '{role}: extra {extra} min; descanso {rest} min; remuneração conquistada {pay} créditos; compensação paga {compensation} créditos; recuperação entregue {recovery} min; devida {owed} min.',
    shiftHistory: 'Turno {number}: {title}, expedidos {shipped}; decisão {decision}.',
    shippedDuringShift: '{kg} kg durante este turno',
    shippedOfTarget: '{kg} de {target} kg',
    relationshipRecord: 'Registro da relação ao longo dos turnos',
    relationshipShiftHeading: '{title} (turno {number})',
    olderSave: 'Este jogo salvo antigo não tem comprovantes da relação para este turno.',
    noMoments: 'Nenhum momento da relação registrado ainda.',
    eventMinute: 'Minuto {minute},',
    learningReviewLabel: 'Revisão de aprendizado da cooperativa',
    learnTogether: 'Aprender juntos com este turno',
    compareAnotherHandoff: 'Comparar outra passagem de turno',
    deliverRecovery: 'Entregar recuperação modelada (5 minutos)',
    campaignCompleteMessage:
      'Temporada cooperativa concluída: entrega cumprida e acordo de trabalho respeitado.',
    campaignIncomplete:
      'Revisão da campanha: a entrega ou o acordo de trabalho continua incompleto.',
    continueCampaign: 'Continuar para o próximo turno da campanha',
    startNextGame: 'Iniciar o próximo turno jogável em ritmo didático (1/2x)',
    startNextWorkshop: 'Iniciar a próxima oficina manual',
    prepareNextPilot: 'Preparar o próximo rascunho do piloto',
    returnToSetup: 'Voltar à configuração do exercício',
    shippedOf: 'Expedidos {shipped} de {target} kg.',
    reviewOpens: 'A revisão abre quando o turno terminar.',
    resumeAfterReloadNote:
      'Uma recarga pausou este turno no minuto {minute} e expirou todas as autorizações.',
    resumeAfterSafetyNote:
      'Uma parada de emergência ou um simulado pausou este turno no minuto {minute} e expirou todas as autorizações.',
    resumeAfterObjectionNote:
      'Uma objeção pausou este turno no minuto {minute} e expirou todas as autorizações; quem a levantou já a resolveu.',
    resumeShift: 'Retomar o turno com novo consentimento',
    relationshipEvidence: 'Evidências da relação',
    relationshipEvidenceLine:
      'Recusas respeitadas: {refusals}. Promessas cumpridas: {promises}. Objeções abertas: {open}. Confirmações do acordo atual: {confirmed}/{total}.',
    compareBurdens: 'Compare as cargas',
    burdenLine:
      '{role}: descanso entregue {rest} min, extra {extra} min, remuneração conquistada {earned}, compensação paga {compensation} créditos; recuperação entregue {recovery} min; recuperação devida {owed} min.',
    memberGovernance: 'Governança dos cooperados',
    chairLine: 'Presidência: {chair}.',
    notElected: 'não eleita',
    memberVoter: 'Cooperado votante',
    chairCandidate: 'Candidato à presidência',
    recordChairBallot: 'Registrar voto para a presidência',
    noChairBallots: 'Nenhum voto para a presidência.',
    surplusHeading: 'Sobras da temporada: {surplus} créditos',
    surplusDestination: 'Destino das sobras',
    retainSurplus:
      'Depois de {reserve} ao Fundo de Reserva e {fates} ao FATES, reter {amount} créditos no Fundo de Reserva para a próxima temporada.',
    distributeSurplus:
      'Depois de {reserve} ao Fundo de Reserva e {fates} ao FATES, devolver {amount} créditos aos cooperados pelos minutos trabalhados.',
    allocateSurplus:
      'Depois de {reserve} ao Fundo de Reserva e {fates} ao FATES, destinar {amount} créditos à comunidade.',
    fromReserve: '{amount} créditos desta compra pagos pelo Fundo de Reserva.',
    surplusCharter: 'Neste estatuto, qualquer sobra fica no caixa da cooperativa.',
    noSurplusReason:
      'Ainda sem sobras nesta temporada. Neste turno: receita de {revenue} contra custos de material de {cost}, remuneração de {wages}, cobertura de {cover} e compras de {purchases}.',
    followOnCredit:
      'Pedido do compromisso cumprido. Esta temporada agora atende {customer}: {credited} kg da expedição creditados à cooperativa.',
    followOnPending:
      'Pedido do compromisso cumprido. A expedição para {customer} é creditada à cooperativa a partir do próximo turno.',
    followOnNone:
      'Pedido do compromisso cumprido. Nenhum outro pedido de cliente está aberto, então a expedição adicional não rende nada à cooperativa.',
    followOnNoneLastShift:
      'Pedido do compromisso cumprido. Este é o último turno da temporada, então a expedição adicional não rende nada à cooperativa.',
    recordSurplusBallot: 'Registrar voto do cooperado sobre as sobras',
    noSurplusBallots: 'Nenhum voto sobre as sobras.',
    executeAllocation: 'Executar a destinação acordada',
    allocationRecorded: 'Destinação registrada.',
    recordedEvidence: 'Evidências registradas',
    evidenceLine: 'Minuto {minute}, {actor}: {detail}',

    teachingForecasts: 'Previsões didáticas',
    samePressure: 'Mesma pressão, gestão diferente',
    compareApproaches: 'Comparar abordagens de gestão',
    matchedForecast: 'Previsão pareada: {kg} kg; líquido de {credits} créditos.',
    charterSupports: 'Este estatuto permite o plano selecionado.',
    activationBlockedEnable: 'Ativação bloqueada: ative {practices} primeiro.',
    activationBlockedBreach: 'Ativação bloqueada: o plano viola as proteções mínimas.',
    sameSeed: 'Comparação com a mesma semente',
    experimentSeed: 'Semente do experimento',
    compareAllPlans: 'Comparar todos os planos com esta semente',
    restartDiscussion: 'Reiniciar a discussão com esta semente',
    forecastFromPlant: 'Prever a partir do moinho agora',
    forecastPlantLine:
      ': ensaca de {low} a {high} kg neste turno; no máximo {ship} kg podem sair, e a doca espera {expected} kg em {trucks} caminhões.',
    forecastPlantAbstain:
      ': o conselheiro se abstém sobre o ensaque; a doca espera {expected} kg em {trucks} caminhões.',
    forecastNoChange: 'O ritmo é o do próprio moinho: não muda nenhuma expedição.',
    forecastSequence: 'Muda qual pedido sai primeiro.',
    forecastSeason: 'A temporada expede {kg} kg dos seus pedidos.',
    forecastBenchWait: 'Nenhum teste de laboratório começa por {minutes} min.',
    forecastServiceWait: 'As manutenções esperam {minutes} min.',
    armLine:
      ': previsão {kg} kg; líquido {credits} créditos; extra {extra} min; descanso {rest} min; {verdict}.',
    permitted: 'permitido',
    prohibited: 'proibido',
    pilotChecklist: 'Checklist de preparação do piloto',
    checklistPurpose: 'Combine o propósito e os limites dos participantes.',
    checklistConsent:
      'Obtenha consentimento informado genuíno e decisões autenticadas dos cooperados fora desta demonstração.',
    checklistData: 'Combine acesso, retenção, desistência e reparações antes de coletar dados.',
    checklistSafety: 'Revise as obrigações de segurança e legais com as pessoas responsáveis.',
    checklistSeparate: 'Mantenha o piloto separado do controle da planta real.',
    downloadJson: 'Baixar JSON do cenário sintético',
  },
});
