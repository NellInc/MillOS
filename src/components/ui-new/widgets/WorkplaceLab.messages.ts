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

const PT_TASK: Record<string, string> = {
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
    decisionLabel: (p: { decision: string }) => p.decision,
    taskLabel: (p: { task: string }) => p.task,
    practiceLabel: (p: { practice: string }) => p.practice,

    // Feedback
    recorded: 'Recorded in this local scenario.',
    noChange: 'No change.',
    previewStatus: 'Preview: {status}.',
    executionStatus: 'Execution: {status}.',
    noExecutionReceipt: 'No execution receipt.',
    rehearsalAdvanced: 'Five modeled rehearsal minutes recorded. No plant movement or shipment.',
    rehearsalNoAdvance: 'No modeled time could advance.',
    exported: 'Synthetic scenario exported locally. No remote send.',
    freshExercise: 'Review retained. Choose a charter for the fresh exercise.',

    // Header
    labTitle: 'Workplace laboratory',
    introHandoff: 'Worker proposals, bounded trials and member review.',
    introImprovement:
      'The handoff experiment: member proposals, bounded trials and retained obligations.',
    introCampaign:
      'Living Cooperative: three shifts, shared obligations and challengeable decisions.',
    introFriday: 'Friday order: meet the shipment while protecting rest and agreed work.',
    syntheticNotice:
      'Synthetic roles only. No real worker data or independently authenticated ballots.',
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
    shiftIntro: 'Try a worker-led improvement, then decide what the next shift retains.',
    openHandoff: 'Open handoff controls',
    mode: 'Mode',
    scenarioSeed: 'Scenario seed',
    livingCooperative: 'Living Cooperative',
    livingIntro:
      'Three linked shifts: order pressure, a quality hold and retaliation pressure. Packing is your role. Each shift keeps its earned pay, recovery obligations and authored objections.',
    adoptionProfile: 'Adoption profile',
    profileToeDip: 'Coordinator-led: protected practice set',
    profileTeam: 'Team agreement: shared work and consent',
    profileCooperative: 'Member governance: cooperative and bounded execution',
    startCampaign: 'Start Living Cooperative campaign',
    campaignPaceNote:
      'Local game only. Starting selects Relaxed pace, 1/6 of Standard (30× simulated time, compared with Standard 180×). Profiles introduce practices incrementally; every profile retains basic protections.',
    startGame: 'Start playable shift at teaching pace (15×)',
    startWorkshop: 'Start manual workshop',
    preparePilot: 'Prepare pilot charter',
    gameNote:
      'Opt in to local simulation control. This standalone teaching pace runs at 1/12 of Standard (15× simulated time). Campaign Relaxed pace is 1/6 of Standard (30×).',
    otherNote:
      'No live plant control. Workshop inputs remain manual; pilot preparation permits charter design and export only.',
    shiftHeading: 'Shift {number} of 3: {title}',
    missionBriefing:
      '{customer} has {kg} kg remaining on the customer commitment. Quality declines extra duty; Packing and Maintenance may volunteer separately. Earn a fresh working agreement.',
    missionPrompt:
      'Keep the {kg} kg delivery target, or negotiate an {installment} kg installment with {deferred} kg deferred. The full customer commitment remains.',
    adviserRolePlay: 'Adviser role checks are authored role-play in this local scenario.',
    shiftThreeNote:
      'The adviser must correct its earlier recommendation and repair the pressure it created. Previous consent authorizes no new burden. Packing can refuse; each author can challenge and resolve their own objection.',
    negotiateInstallment: 'Negotiate an {kg} kg installment',
    negotiateInstallmentProtectPay: 'Negotiate an {kg} kg installment and protect pay',
    keepCommitment: 'Keep the {kg} kg commitment',
    recordedDecision: 'Recorded decision: {decision}.',
    pending: 'pending',
    inspectionComplete: 'Quality inspection complete.',
    inspectionUntil: 'Quality hold in progress until minute {minute}.',
    inspectionFrom:
      'Quality can begin inspection from minute 25. Line pacing pauses; actual batch certification still gates shipping.',
    reviewBeforeContinuing:
      'Review the shift, deliver owed recovery and resolve every authored objection before continuing.',
    pressureCard: 'Pressure card: {title}',
    challengeBelongs: 'The challenge belongs to {role}.',
    theAdviser: 'the adviser',
    tryDemand: 'Try the demand (blocked and challenged)',
    restateTerms: 'Restate protected terms',
    pressureNote:
      'Trying the demand pauses activation. Restating terms leaves any objection open until its raiser reviews it in Agreement / Voices. Both sides then renew understanding.',
    reviewChallenge: 'Review the challenge and remedy',
    missionCredit:
      '{customer}: {credited} / {target} kg qualified dispatch credit. Agreed deferral: {deferred} kg. Remaining full customer commitment: {remaining} kg.',
    fullDispatchedSuffix: ' Full customer commitment dispatched.',
    chooseResponse: 'Choose the response',
    targetLine:
      'Target {target} kg. Active plant capacity multiplier {capacity}×. Changing a plan clears the role agreement.',
    shiftThreeResponseNote:
      'A declined offer can lead to protected pacing, funded handoffs or a different current qualified volunteer. Negotiate a smaller installment above if needed; unfinished customer work remains open. An objection holds execution until its raiser reviews the remedy.',
    planTerms:
      'Plant capacity multiplier {capacity}×; protected rest {rest} min; optional cover {cover} min; cover compensation {compensation} credits/min; recovery {recovery} min; budget {budget} credits.',
    prohibitedReason: 'Prohibited: {reason}',
    reservations:
      'Wages reserved {reserve}; improvement {improvement}; maximum cover pay {maxPay} credits. Cash after these reservations {cash} credits.',
    volunteers:
      'Current consenting qualified volunteers: {list}. Cover lasts at most ten minutes, then pacing returns to 0.78×.',
    volunteerEntry: '{role} ({minutes} min retained extra duty)',
    none: 'none',
    aiWhy: 'AI: why this response?',
    operationalExplanation:
      'Operational explanation: {explanation} The active plant capacity multiplier is {capacity}×. The shipment target is {target} kg.',
    alternativesNote:
      "Alternatives: compare the four responses above. Boundaries: protected rest, individual optional-cover consent, budget and open objections constrain execution. This explanation reports the model's decision conditions; it does not expose hidden reasoning.",
    dispatchUncertain:
      'Dispatch remains uncertain until quality-qualified manifests arrive. Supply and logistics can constrain the result. Either party can raise an authority objection; each raiser retains remedy review.',
    challengeProposal: 'Challenge the proposal in Agreement / Voices',
    advanceRehearsal: 'Advance rehearsal by 5 minutes',
    endShift: 'End shift now and review',
    creditsNote:
      'Workplace credits are illustrative accounts, separate from the mill campaign finances.',

    // Practices
    alwaysActive:
      'Always active: safe stops, protected rest, voluntary extra work, earned pay and author-controlled objections. Switching modules never removes these protections.',
    chooseApproach: 'Choose a management approach',
    approachNote:
      'Change the allocation of decisions while keeping the current plan, money and workload. Revised terms require fresh agreement.',
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
    agreementIntro:
      'Policy votes and optional-cover consent are separate decisions. A majority cannot volunteer another role for extra work. Role controls below are local scenario inputs.',
    hearResponses: 'Hear simulated team responses',
    manualWorkshopNote:
      "Manual workshop: record each synthetic role's choices explicitly. No automatic votes.",
    pilotDenies: 'Pilot preparation denies live control and role-input changes.',
    adviserAgreement: 'Adviser working agreement',
    adviserAgreementText:
      "Preference sharing is optional and revocable. Extra duty requires each individual's consent. Refusal retains earned pay and owed recovery. Advice is challengeable; bounded execution stays within the approved agreement. Revised terms invalidate all understanding checks.",
    adviser: 'Adviser',
    adviserAck: 'Adviser acknowledgment: {status}.',
    ackRecorded: 'recorded for these terms',
    ackPending: 'pending three correct answers',
    turnsOwn: 'Every role acts in its own turn. ',
    simulatedOther: 'Simulated responses belong to the other synthetic roles. ',
    answerPacking:
      'Answer Packing and Adviser checks explicitly. Confirm Packing understanding, cast its policy vote and decide optional cover separately. The helper never fills these Packing decisions.',
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
    sharingNote:
      "Optional preference sharing is for this shift's planning only, expires after its limited scenario window, and can be revoked.",
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
    workshopRecordsNote: 'Records the local rehearsal only, with no live plant effects.',
    executionRequires:
      'Execution requires this explicit approval, the exact current revision and the installed agent runtime.',

    // Review
    actualOutcomes: 'Actual scenario outcomes',
    deliveryLine: 'Delivery: {status}, {delivered} of {target} kg for {customer}.',
    remainingCommitment: 'Remaining full customer commitment: {kg} kg.',
    agreementLine: 'Working agreement: {status}. Combined outcome: {outcome}.',
    complete: 'complete',
    unfinished: 'unfinished',
    agreedDeferral: 'Agreed deferral: {kg} kg.',
    accountsLine:
      'Illustrative workplace credits, separate from main mill revenue and pounds: closing cash {cash}; wages {wages}; compensation {compensation}; improvements {improvements}; allocations {allocations}.',
    cumulativeEvidence: 'Cumulative campaign evidence',
    totalsLine:
      '{shifts} shifts reviewed; refusals respected {refusals}; promises kept {promises}; repairs {repairs}; objections resolved {resolved} of {raised}.',
    memberTotals:
      '{role}: extra {extra} min; rest {rest} min; earned pay {pay} credits; compensation paid {compensation} credits; recovery delivered {recovery} min; owed {owed} min.',
    shiftHistory: 'Shift {number}: {title}, shipped {shipped}; decision {decision}.',
    shippedDuringShift: '{kg} kg during this shift; customer commitment progress is shown above',
    shippedOfTarget: '{kg} of {target} kg',
    relationshipRecord: 'Relationship record across shifts',
    relationshipIntro:
      'Public requests, challenges, repairs and delivered recovery. Private explanations stay out of this record. These receipts describe conduct; they do not measure trust or wellbeing.',
    relationshipShiftHeading: '{title} (shift {number})',
    olderSave: 'This older save has no relationship receipts for this shift.',
    noMoments: 'No relationship moments recorded yet.',
    eventMinute: 'Minute {minute},',
    retentionNote:
      'Each shift retains relationship receipts from a bounded 120-event log. Older events can be discarded. The local JSON export includes retained receipts.',
    learningReviewLabel: 'Cooperative learning review',
    learnTogether: 'Learn from this shift together',
    compareAnotherHandoff: 'Compare another handoff',
    deliverRecovery: 'Deliver modeled recovery (5 minutes)',
    outstandingRecovery:
      'Outstanding recovery is delivered through the normal simulation clock before another shift can start.',
    campaignCompleteMessage:
      'Living Cooperative campaign complete: delivery met and working agreement honoured.',
    campaignIncomplete:
      'Campaign review: delivery or working agreement remains incomplete. Earned pay, recovery obligations and the shift history remain recorded.',
    continueCampaign: 'Continue to next campaign shift',
    startNextGame: 'Start next playable shift at teaching pace (15×)',
    startNextWorkshop: 'Start next manual workshop',
    prepareNextPilot: 'Prepare next pilot draft',
    shippedOf: 'Shipped {shipped} of {target} kg.',
    reviewOpens: 'Review opens after the shift finishes.',
    relationshipEvidence: 'Relationship evidence',
    relationshipEvidenceLine:
      'Refusals respected: {refusals}. Promises kept: {promises}. Open objections: {open}. Current agreement confirmations: {confirmed}/{total}.',
    confirmationsExpire: 'Confirmations expire on review. No mood or trust score is inferred.',
    compareBurdens: 'Compare burdens, without ranking people',
    burdenLine:
      '{role}: delivered rest {rest} min, extra {extra} min, earned {earned}, paid compensation {compensation} credits; delivered recovery {recovery} min; recovery owed {owed} min.',
    memberGovernance: 'Member governance',
    chairLine: 'AI minds have a voice in objections, never member ballots. Chair: {chair}.',
    notElected: 'not elected',
    memberVoter: 'Member voter',
    chairCandidate: 'Chair candidate',
    recordChairBallot: 'Record chair ballot',
    noChairBallots: 'No chair ballots.',
    surplusHeading: 'Positive operating surplus: {surplus} credits',
    surplusDefinition:
      'Revenue less operating costs, earned wages, paid compensation, improvement spend and distributions. Initial capital is excluded.',
    surplusDestination: 'Surplus destination',
    retainSurplus:
      "Retain {amount} credits in closing cash for the next shift's wages and choices.",
    distributeSurplus:
      "Distribute {amount} credits equally: {perMember} per member. That cash leaves the next shift's budget.",
    allocateSurplus:
      "Allocate {amount} credits to the community. That cash leaves the next shift's budget.",
    ballotsRequired: 'Three member ballots are required. Earned obligations must be settled first.',
    surplusCharter: 'Shared surplus is part of the Member governance charter.',
    recordSurplusBallot: 'Record member surplus ballot',
    noSurplusBallots: 'No surplus ballots.',
    executeAllocation: 'Execute agreed allocation',
    allocationRecorded: 'Allocation recorded.',
    recordedEvidence: 'Recorded evidence',
    evidenceLine: 'Minute {minute}, {actor}: {detail}',

    // Experiment
    teachingForecasts: 'Teaching forecasts',
    samePressure: 'Same pressure, different management',
    compareCurrentPlan:
      'Compare the current physical plan ({plan}) under three decision structures. The same seed, supply, rest and capacity assumptions apply. Governance grants no production bonus. Every approach retains refusal, privacy and raiser-owned objections.',
    compareApproaches: 'Compare management approaches',
    matchedForecast: 'Matched forecast: {kg} kg; net {credits} illustrative credits.',
    charterSupports: 'This charter supports the selected plan.',
    activationBlockedEnable: 'Activation blocked: enable {practices} first.',
    activationBlockedBreach: 'Activation blocked: the plan breaches minimum protections.',
    forecastsSeparate:
      'These are illustrative forecasts, separate from actual customer dispatch and relationship receipts. Try an approach in Practices, then play the same pressure card.',
    standaloneExercise:
      'The teaching forecast uses the standalone 600 kg exercise, before episode holds or negotiations. Linked customer deliveries remain separate.',
    sameSeed: 'Same-seed comparison',
    experimentSeed: 'Experiment seed',
    compareAllPlans: 'Compare all plans with this seed',
    restartDiscussion: 'Restart discussion with this seed',
    restartClears: 'Restarting clears the current discussion and agreement.',
    illustrativeForecasts:
      'Illustrative model forecasts, not evidence of real efficacy. All arms use the same seed, including the prohibited rush counterfactual.',
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
    localDownload: 'Local download only. This demo cannot authorise a real workplace pilot.',
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
    rehearsalAdvanced:
      'Cinco minutos de ensaio modelado registrados. Nenhum movimento na planta nem expedição.',
    rehearsalNoAdvance: 'Não foi possível avançar o tempo modelado.',
    exported: 'Cenário sintético exportado localmente. Nada foi enviado.',
    freshExercise: 'Revisão mantida. Escolha um estatuto para o novo exercício.',

    labTitle: 'Laboratório do local de trabalho',
    introHandoff: 'Propostas dos trabalhadores, testes delimitados e avaliação dos cooperados.',
    introImprovement:
      'O experimento de passagem de turno: propostas dos cooperados, testes delimitados e obrigações mantidas.',
    introCampaign:
      'Cooperativa Viva: três turnos, obrigações compartilhadas e decisões contestáveis.',
    introFriday:
      'Pedido de sexta-feira: cumpra a expedição protegendo o descanso e o trabalho combinado.',
    syntheticNotice:
      'Somente funções sintéticas. Nenhum dado real de trabalhadores nem votos autenticados de forma independente.',
    sectionsLabel: 'Seções do local de trabalho',
    statusLine: '{mode}: {phase}, minuto {minute} de {duration}. Versão {revision}.',
    causalReceipt: 'Comprovante causal: {receipt}',

    understandingChecks: 'Verificações de entendimento: {role}',
    checkAria: '{role}: {prompt}',
    selectAnswer: 'Selecione uma resposta',
    matchesTerms: 'Confere com os termos atuais. ',
    needsAnotherLook: 'Vale olhar de novo. ',

    shiftIntro:
      'Experimente uma melhoria conduzida pelos trabalhadores e depois decida o que o próximo turno mantém.',
    openHandoff: 'Abrir controles de passagem de turno',
    mode: 'Modo',
    scenarioSeed: 'Semente do cenário',
    livingCooperative: 'Cooperativa Viva',
    livingIntro:
      'Três turnos encadeados: pressão de pedido, uma retenção de qualidade e pressão de retaliação. O ensaque é a sua função. Cada turno mantém a remuneração conquistada, as obrigações de recuperação e as objeções registradas.',
    adoptionProfile: 'Perfil de adoção',
    profileToeDip: 'Conduzido pela coordenação: conjunto protegido de práticas',
    profileTeam: 'Acordo da equipe: trabalho e consentimento compartilhados',
    profileCooperative: 'Governança dos cooperados: cooperativa e execução delimitada',
    startCampaign: 'Iniciar a campanha Cooperativa Viva',
    campaignPaceNote:
      'Somente jogo local. Ao iniciar, o ritmo Tranquilo é selecionado: 1/6 do Padrão (tempo simulado a 30×, contra 180× no Padrão). Os perfis introduzem práticas aos poucos; todo perfil mantém as proteções básicas.',
    startGame: 'Iniciar turno jogável em ritmo didático (15×)',
    startWorkshop: 'Iniciar oficina manual',
    preparePilot: 'Preparar estatuto do piloto',
    gameNote:
      'Adesão opcional ao controle da simulação local. Este ritmo didático avulso roda a 1/12 do Padrão (tempo simulado a 15×). O ritmo Tranquilo da campanha é 1/6 do Padrão (30×).',
    otherNote:
      'Sem controle da planta real. As entradas da oficina continuam manuais; a preparação do piloto permite apenas desenhar e exportar o estatuto.',
    shiftHeading: 'Turno {number} de 3: {title}',
    missionBriefing:
      '{customer} tem {kg} kg pendentes no compromisso com o cliente. A Qualidade recusa trabalho extra; Ensaque e Manutenção podem se oferecer separadamente. Conquiste um novo acordo de trabalho.',
    missionPrompt:
      'Mantenha a meta de entrega de {kg} kg ou negocie uma parcela de {installment} kg, adiando {deferred} kg. O compromisso integral com o cliente continua valendo.',
    adviserRolePlay:
      'As verificações da função de conselheiro são uma encenação roteirizada neste cenário local.',
    shiftThreeNote:
      'O conselheiro precisa corrigir a recomendação anterior e reparar a pressão que criou. Um consentimento anterior não autoriza nenhuma carga nova. O Ensaque pode recusar; cada autor pode contestar e resolver a própria objeção.',
    negotiateInstallment: 'Negociar uma parcela de {kg} kg',
    negotiateInstallmentProtectPay: 'Negociar uma parcela de {kg} kg e proteger a remuneração',
    keepCommitment: 'Manter o compromisso de {kg} kg',
    recordedDecision: 'Decisão registrada: {decision}.',
    pending: 'pendente',
    inspectionComplete: 'Inspeção de qualidade concluída.',
    inspectionUntil: 'Retenção de qualidade em andamento até o minuto {minute}.',
    inspectionFrom:
      'A Qualidade pode iniciar a inspeção a partir do minuto 25. O ritmo da linha fica pausado; a certificação real do lote continua condicionando a expedição.',
    reviewBeforeContinuing:
      'Revise o turno, entregue a recuperação devida e resolva cada objeção registrada antes de continuar.',
    pressureCard: 'Carta de pressão: {title}',
    challengeBelongs: 'Quem contesta: {role}.',
    theAdviser: 'o conselheiro',
    tryDemand: 'Tentar a exigência (bloqueada e contestada)',
    restateTerms: 'Reafirmar os termos protegidos',
    pressureNote:
      'Tentar a exigência pausa a ativação. Reafirmar os termos deixa qualquer objeção aberta até que quem a levantou a revise em Acordo / Vozes. Depois, os dois lados renovam o entendimento.',
    reviewChallenge: 'Revisar a contestação e a reparação',
    missionCredit:
      '{customer}: {credited} / {target} kg de crédito de expedição qualificada. Adiamento acordado: {deferred} kg. Compromisso integral pendente com o cliente: {remaining} kg.',
    fullDispatchedSuffix: ' Compromisso integral com o cliente expedido.',
    chooseResponse: 'Escolha a resposta',
    targetLine:
      'Meta de {target} kg. Multiplicador de capacidade ativa da planta {capacity}×. Mudar o plano apaga o acordo das funções.',
    shiftThreeResponseNote:
      'Uma oferta recusada pode levar a ritmo protegido, passagens de turno financiadas ou outro voluntário qualificado atual. Se precisar, negocie uma parcela menor acima; o trabalho inacabado para o cliente continua em aberto. Uma objeção suspende a execução até que quem a levantou revise a reparação.',
    planTerms:
      'Multiplicador de capacidade da planta {capacity}×; descanso protegido {rest} min; cobertura opcional {cover} min; compensação da cobertura {compensation} créditos/min; recuperação {recovery} min; orçamento {budget} créditos.',
    prohibitedReason: 'Proibido: {reason}',
    reservations:
      'Remuneração reservada {reserve}; melhoria {improvement}; pagamento máximo de cobertura {maxPay} créditos. Caixa após essas reservas {cash} créditos.',
    volunteers:
      'Voluntários qualificados que consentem no momento: {list}. A cobertura dura no máximo dez minutos e depois o ritmo volta a 0,78×.',
    volunteerEntry: '{role} ({minutes} min de trabalho extra mantido)',
    none: 'nenhum',
    aiWhy: 'IA: por que esta resposta?',
    operationalExplanation:
      'Explicação operacional: {explanation} O multiplicador de capacidade ativa da planta é {capacity}×. A meta de expedição é {target} kg.',
    alternativesNote:
      'Alternativas: compare as quatro respostas acima. Limites: descanso protegido, consentimento individual para cobertura opcional, orçamento e objeções abertas restringem a execução. Esta explicação informa as condições de decisão do modelo; ela não expõe raciocínio oculto.',
    dispatchUncertain:
      'A expedição continua incerta até chegarem romaneios aprovados pela qualidade. Abastecimento e logística podem limitar o resultado. Qualquer uma das partes pode levantar uma objeção de autoridade; quem a levanta mantém a revisão da reparação.',
    challengeProposal: 'Contestar a proposta em Acordo / Vozes',
    advanceRehearsal: 'Avançar o ensaio em 5 minutos',
    endShift: 'Encerrar o turno agora e revisar',
    creditsNote:
      'Os créditos do local de trabalho são contas ilustrativas, separadas das finanças da campanha do moinho.',

    alwaysActive:
      'Sempre ativos: paradas seguras, descanso protegido, trabalho extra voluntário, remuneração conquistada e objeções controladas por quem as registra. Trocar de módulo nunca remove essas proteções.',
    chooseApproach: 'Escolha uma abordagem de gestão',
    approachNote:
      'Mude a distribuição das decisões mantendo o plano, o dinheiro e a carga de trabalho atuais. Termos revisados exigem um novo acordo.',
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

    agreementIntro:
      'Votos sobre a política e consentimento para cobertura opcional são decisões separadas. Uma maioria não pode oferecer outra função como voluntária para trabalho extra. Os controles de função abaixo são entradas do cenário local.',
    hearResponses: 'Ouvir respostas simuladas da equipe',
    manualWorkshopNote:
      'Oficina manual: registre explicitamente as escolhas de cada função sintética. Sem votos automáticos.',
    pilotDenies:
      'A preparação do piloto não permite controle real nem mudanças nas entradas das funções.',
    adviserAgreement: 'Acordo de trabalho do conselheiro',
    adviserAgreementText:
      'Compartilhar preferências é opcional e revogável. Trabalho extra exige o consentimento de cada pessoa. A recusa mantém a remuneração conquistada e a recuperação devida. A recomendação pode ser contestada; a execução delimitada fica dentro do acordo aprovado. Termos revisados invalidam todas as verificações de entendimento.',
    adviser: 'Conselheiro',
    adviserAck: 'Confirmação do conselheiro: {status}.',
    ackRecorded: 'registrada para estes termos',
    ackPending: 'pendente de três respostas corretas',
    turnsOwn: 'Cada função age na sua própria vez. ',
    simulatedOther: 'As respostas simuladas pertencem às outras funções sintéticas. ',
    answerPacking:
      'Responda explicitamente às verificações do Ensaque e do Conselheiro. Confirme o entendimento do Ensaque, registre o voto dele sobre a política e decida a cobertura opcional separadamente. O assistente nunca preenche essas decisões do Ensaque.',
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
    sharingNote:
      'O compartilhamento opcional de preferências serve apenas ao planejamento deste turno, expira ao fim da janela limitada do cenário e pode ser revogado.',
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
    workshopRecordsNote: 'Registra apenas o ensaio local, sem efeitos na planta real.',
    executionRequires:
      'A execução exige esta aprovação explícita, a versão atual exata e o runtime do agente instalado.',

    actualOutcomes: 'Resultados observados do cenário',
    deliveryLine: 'Entrega: {status}, {delivered} de {target} kg para {customer}.',
    remainingCommitment: 'Compromisso integral pendente com o cliente: {kg} kg.',
    agreementLine: 'Acordo de trabalho: {status}. Resultado geral: {outcome}.',
    complete: 'concluído',
    unfinished: 'inacabado',
    agreedDeferral: 'Adiamento acordado: {kg} kg.',
    accountsLine:
      'Créditos ilustrativos do local de trabalho, separados da receita principal do moinho e dos valores em libras: caixa final {cash}; remuneração {wages}; compensação {compensation}; melhorias {improvements}; destinações {allocations}.',
    cumulativeEvidence: 'Evidências acumuladas da campanha',
    totalsLine:
      '{shifts} turnos revisados; recusas respeitadas {refusals}; promessas cumpridas {promises}; reparações {repairs}; objeções resolvidas {resolved} de {raised}.',
    memberTotals:
      '{role}: extra {extra} min; descanso {rest} min; remuneração conquistada {pay} créditos; compensação paga {compensation} créditos; recuperação entregue {recovery} min; devida {owed} min.',
    shiftHistory: 'Turno {number}: {title}, expedidos {shipped}; decisão {decision}.',
    shippedDuringShift:
      '{kg} kg durante este turno; o progresso do compromisso com o cliente aparece acima',
    shippedOfTarget: '{kg} de {target} kg',
    relationshipRecord: 'Registro da relação ao longo dos turnos',
    relationshipIntro:
      'Pedidos públicos, contestações, reparações e recuperação entregue. Explicações privadas ficam fora deste registro. Estes comprovantes descrevem condutas; eles não medem confiança nem bem-estar.',
    relationshipShiftHeading: '{title} (turno {number})',
    olderSave: 'Este jogo salvo antigo não tem comprovantes da relação para este turno.',
    noMoments: 'Nenhum momento da relação registrado ainda.',
    eventMinute: 'Minuto {minute},',
    retentionNote:
      'Cada turno mantém comprovantes da relação de um log limitado a 120 eventos. Eventos mais antigos podem ser descartados. A exportação JSON local inclui os comprovantes mantidos.',
    learningReviewLabel: 'Revisão de aprendizado da cooperativa',
    learnTogether: 'Aprender juntos com este turno',
    compareAnotherHandoff: 'Comparar outra passagem de turno',
    deliverRecovery: 'Entregar recuperação modelada (5 minutos)',
    outstandingRecovery:
      'A recuperação pendente é entregue pelo relógio normal da simulação antes que outro turno possa começar.',
    campaignCompleteMessage:
      'Campanha Cooperativa Viva concluída: entrega cumprida e acordo de trabalho respeitado.',
    campaignIncomplete:
      'Revisão da campanha: a entrega ou o acordo de trabalho continua incompleto. A remuneração conquistada, as obrigações de recuperação e o histórico do turno continuam registrados.',
    continueCampaign: 'Continuar para o próximo turno da campanha',
    startNextGame: 'Iniciar o próximo turno jogável em ritmo didático (15×)',
    startNextWorkshop: 'Iniciar a próxima oficina manual',
    prepareNextPilot: 'Preparar o próximo rascunho do piloto',
    shippedOf: 'Expedidos {shipped} de {target} kg.',
    reviewOpens: 'A revisão abre quando o turno terminar.',
    relationshipEvidence: 'Evidências da relação',
    relationshipEvidenceLine:
      'Recusas respeitadas: {refusals}. Promessas cumpridas: {promises}. Objeções abertas: {open}. Confirmações do acordo atual: {confirmed}/{total}.',
    confirmationsExpire:
      'As confirmações expiram na revisão. Nenhuma pontuação de humor ou confiança é inferida.',
    compareBurdens: 'Compare as cargas, sem classificar pessoas',
    burdenLine:
      '{role}: descanso entregue {rest} min, extra {extra} min, remuneração conquistada {earned}, compensação paga {compensation} créditos; recuperação entregue {recovery} min; recuperação devida {owed} min.',
    memberGovernance: 'Governança dos cooperados',
    chairLine:
      'Mentes de IA têm voz nas objeções, nunca nas votações dos cooperados. Coordenação: {chair}.',
    notElected: 'não eleita',
    memberVoter: 'Cooperado votante',
    chairCandidate: 'Candidato à coordenação',
    recordChairBallot: 'Registrar voto para a coordenação',
    noChairBallots: 'Nenhum voto para a coordenação.',
    surplusHeading: 'Sobras operacionais positivas: {surplus} créditos',
    surplusDefinition:
      'Receita menos custos operacionais, remuneração conquistada, compensação paga, gastos com melhorias e distribuições. O capital inicial fica de fora.',
    surplusDestination: 'Destino das sobras',
    retainSurplus:
      'Reter {amount} créditos no caixa final para a remuneração e as escolhas do próximo turno.',
    distributeSurplus:
      'Distribuir {amount} créditos igualmente: {perMember} por cooperado. Esse dinheiro sai do orçamento do próximo turno.',
    allocateSurplus:
      'Destinar {amount} créditos à comunidade. Esse dinheiro sai do orçamento do próximo turno.',
    ballotsRequired:
      'São necessários três votos dos cooperados. As obrigações já acumuladas precisam ser quitadas antes.',
    surplusCharter:
      'As sobras compartilhadas fazem parte do estatuto de Governança dos cooperados.',
    recordSurplusBallot: 'Registrar voto do cooperado sobre as sobras',
    noSurplusBallots: 'Nenhum voto sobre as sobras.',
    executeAllocation: 'Executar a destinação acordada',
    allocationRecorded: 'Destinação registrada.',
    recordedEvidence: 'Evidências registradas',
    evidenceLine: 'Minuto {minute}, {actor}: {detail}',

    teachingForecasts: 'Previsões didáticas',
    samePressure: 'Mesma pressão, gestão diferente',
    compareCurrentPlan:
      'Compare o plano físico atual ({plan}) sob três estruturas de decisão. Valem as mesmas premissas de semente, abastecimento, descanso e capacidade. A governança não concede bônus de produção. Toda abordagem mantém a recusa, a privacidade e as objeções que pertencem a quem as levanta.',
    compareApproaches: 'Comparar abordagens de gestão',
    matchedForecast: 'Previsão pareada: {kg} kg; líquido de {credits} créditos ilustrativos.',
    charterSupports: 'Este estatuto permite o plano selecionado.',
    activationBlockedEnable: 'Ativação bloqueada: ative {practices} primeiro.',
    activationBlockedBreach: 'Ativação bloqueada: o plano viola as proteções mínimas.',
    forecastsSeparate:
      'Estas são previsões ilustrativas, separadas da expedição real ao cliente e dos comprovantes da relação. Experimente uma abordagem em Práticas e depois jogue a mesma carta de pressão.',
    standaloneExercise:
      'A previsão didática usa o exercício avulso de 600 kg, antes das retenções ou negociações dos episódios. As entregas encadeadas ao cliente continuam separadas.',
    sameSeed: 'Comparação com a mesma semente',
    experimentSeed: 'Semente do experimento',
    compareAllPlans: 'Comparar todos os planos com esta semente',
    restartDiscussion: 'Reiniciar a discussão com esta semente',
    restartClears: 'Reiniciar apaga a discussão e o acordo atuais.',
    illustrativeForecasts:
      'Previsões ilustrativas do modelo, não evidência de eficácia real. Todos os braços usam a mesma semente, inclusive o contrafactual proibido de aceleração.',
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
    localDownload:
      'Somente download local. Esta demonstração não pode autorizar um piloto real no local de trabalho.',
  },
});
