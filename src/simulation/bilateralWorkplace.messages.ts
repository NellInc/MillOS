import { defineMessages } from '../i18n';

// Record codes (plan, arrangement, challenge, verdict, decision and destination
// ids) stay verbatim in both languages where a detail is prefixed "<id>: ".
// Ids that read as words inside a sentence are mapped for pt-BR below.

const PT_ROLE_OF: Record<string, string> = {
  packing: 'de ensaque',
  quality: 'de qualidade',
  maintenance: 'de manutenção',
  coordinator: 'de coordenação',
  mind: 'da mente consultiva',
};
const PT_OBJECTION_KIND: Record<string, string> = {
  rest: 'descanso',
  burden: 'carga de trabalho',
  privacy: 'privacidade',
  authority: 'autoridade',
};
const PT_DESTINATION: Record<string, string> = {
  members: 'distribuir aos cooperados',
  reserve: 'reter na reserva',
  community: 'destinar à comunidade',
};
const pt = (map: Record<string, string>, id: string) => map[id] ?? id;

export const bilateralWorkplaceMessages = defineMessages({
  en: {
    // Practices
    practiceInformationTitle: 'Open information',
    practiceInformationDetail:
      'Shared demand, capacity and illustrative accounts; private explanations stay optional.',
    practiceWorkChoiceTitle: 'Qualified work choice',
    practiceWorkChoiceDetail: 'Members choose only tasks they are trained to do.',
    practiceRestTitle: 'Protected rest',
    practiceRestDetail: 'A minimum 15 minutes of rest remains protected in every configuration.',
    practiceRemedyTitle: 'Voice and remedy',
    practiceRemedyDetail:
      'Any person or the advisory mind may raise an objection; only its raiser resolves it.',
    practiceBudgetTitle: 'Team budget',
    practiceBudgetDetail: 'A bounded 40-credit improvement budget, separate from campaign money.',
    practiceGainsharingTitle: 'Shared surplus',
    practiceGainsharingDetail: 'Members direct only positive operating surplus after obligations.',
    practiceCooperativeTitle: 'Member governance',
    practiceCooperativeDetail:
      'One fictional member, one vote. Capital and the advisory mind have no ballot.',

    // Plans
    planSteadyTitle: 'Protect the rhythm',
    planSteadyExplanation: 'Keep the ordinary sequence and all protected rest.',
    planResequenceTitle: 'Resequence together',
    planResequenceExplanation:
      'Spend 40 illustrative credits on a shared handoff improvement without changing rest.',
    planCoverTitle: 'Invite voluntary cover',
    planCoverExplanation:
      'One eligible volunteer may shift up to 10 minutes of timing, earning 0.8 credits per minute and 10 minutes protected recovery. Minimum rest stays intact. Capacity returns to the protected rhythm after cover.',
    planRushTitle: 'Rush through rest (blocked)',
    planRushExplanation:
      'A tempting throughput proposal that breaches the non-negotiable rest floor.',
    planRushIllegal: 'Protected minimum rest cannot be waived, even by a unanimous ballot.',

    // Fictional members
    rolePacking: 'Packing',
    boundaryPacking: 'At least 15 minutes protected rest; qualified packing work only.',
    preferencePacking:
      'I prefer a predictable packing handoff and can volunteer for a short, compensated timing change.',
    roleQuality: 'Quality',
    boundaryQuality: 'Quality release stays with qualified quality staff; rest remains protected.',
    preferenceQuality: 'I decline cover to keep my current rhythm. No explanation is owed.',
    roleMaintenance: 'Maintenance',
    boundaryMaintenance: 'No maintenance on running equipment; rest remains protected.',
    preferenceMaintenance:
      'I can accept a bounded handoff change when compensation and recovery are reserved.',
    roleCoordinator: 'Coordinator',
    boundaryCoordinator: 'Coordination grants no power to waive another member’s boundary.',
    preferenceCoordinator: 'I prefer the stable sequence and decline optional cover.',

    // Readiness
    readyPilot: 'Pilot preparation has no live authority or simulation activation.',
    readyAdviceOnly:
      'Advice-only mode grants no delegated execution; choose bounded authority to activate a Game plan.',
    readyChooseProposal: 'Choose a worker-authored handoff proposal first.',
    readyHearAdviser: 'Hear the adviser response to the current public terms first.',
    readyMissionEvidence: 'The customer commitment requires current quality-qualified evidence.',
    readyNoStacking:
      'Handoff trials use ordinary qualified work, without stacking optional-duty plans.',
    readyBeginScenario: 'Begin a scenario and deliberate before activation.',
    readyConsentExpired: 'Scenario consent has expired.',
    readyUnknownPlan: 'Unknown plan.',
    readyEnablePractices: 'Enable the practices required by this plan.',
    readyOpenObjections: 'Open objections must be resolved by their raisers.',
    readyCampaignMission:
      'The linked customer commitment requires current, quality-qualified dispatch evidence.',
    readyAdviserBoundaries:
      'The adviser must demonstrate the current consent, privacy and authority boundaries.',
    readyRoleChecks:
      'Every role must answer the current refusal, privacy and repayment checks correctly.',
    readyEpisodeResponse: 'Choose the episode response before seeking a fresh agreement.',
    readyUnderstandBallot:
      'Every role must confirm understanding and record a ballot for the current terms.',
    readyTeamConsent: 'Team consent requires every approval.',
    readyMajority: 'A majority of fictional members must approve.',
    readyCoverConsent:
      'At least one eligible member must separately consent to this bounded cover.',
    readyFunds:
      'Funds cannot cover all reserved wages, improvement costs and optional compensation.',

    // Alternatives
    altEnableBudget: 'Enable the shared budget practice first.',
    altUnfunded: 'Current cash cannot fund wages and these terms.',

    // Pilot export
    exScope:
      'A fictional local learning exercise. No live workplace control, worker data collection, measured efficacy or legal certification.',
    exProtRest: '15 minutes minimum rest',
    exProtQualified: 'Qualified tasks only',
    exProtRefusal: 'Refusal without penalty',
    exProtCoverConsent: 'Individual revocable cover consent',
    exProtObjection: 'Raiser-owned objection resolution',
    exDataPurpose: 'Optional fictional preference explanation for planning this scenario only.',
    exDataExpires: 'Scenario end or revocation, whichever comes first.',
    exDataCollect: 'No real-person identity, health information or free-text reasons.',
    exDataRevocation:
      'Immediately hides the explanation from future projections and exports. Previously downloaded copies cannot be recalled.',
    exCompUnits: 'Illustrative team credits, separate from campaign finances.',
    exCompRestSchedule:
      'Ordinary protected rest accrues in scenario minutes 75 to 90. Additional recovery accrues only after optional cover ends, including review time. Unmet recovery survives stop and reload.',
    exCompTerms:
      'Reserve full wages and optional compensation before activation. Pay earned obligations on withdrawal, stop, expiry and reload.',
    exReviewAgreement: 'Obtain local worker and representative agreement before any real pilot.',
    exReviewRequirements:
      'Check applicable employment, safety and privacy requirements with qualified local reviewers.',
    exReviewMeasures:
      'Agree measures, stop conditions, data purpose and retention before collection.',
    exReviewConsent: 'Verify accessible understanding and individual consent without coercion.',
    exReviewRecord:
      'Record workload, rest, refusals respected, earned compensation and unresolved objections.',
    exReviewExpansion:
      'Review with participants before any expansion; forecasts are not measured outcomes.',
    exForecastLabel:
      'Deterministic illustrative forecasts from equal demand, supply and physical capacity assumptions; not measured outcomes.',

    // Practice proposal draft
    prLocalApprovals: 'Not collected or granted by MillOS.',
    prPurpose: 'Try separate understanding, policy decisions and individual optional-duty consent.',
    prScope: 'One work group, one agreed shift, reviewed before any extension.',
    prAuthority:
      'Adviser offers reasons; people retain qualified decisions and individual boundaries. Overrides require a public explanation and review.',
    prDecisionUnderstand: 'Confirm understanding',
    prDecisionPolicy: 'Choose policy yes or no',
    prDecisionCover: 'Accept or decline optional cover separately',
    prData:
      'Use aggregate operational receipts only. No identity, health information, free-text private reasons or inferred willingness. Sharing remains optional and revocable.',
    prUnits:
      'Illustrative MillOS credits and modeled minutes; local terms require separate agreement.',
    prFunding: 'Reserve compensation and protected recovery before any optional duty.',
    prWithdrawal: 'Stop new extra duty; retain earned pay and delivered or owed recovery.',
    prStopWithdrawal: 'Withdrawal',
    prStopHold: 'Safety or qualification hold',
    prStopUnfunded: 'Unfunded pay or recovery',
    prStopChangedTerms: 'Changed terms without new agreement',
    prStopObjection: 'Open worker or adviser objection',
    prRollback:
      'Return future work to an agreed steady plan. Settle earned pay and owed recovery; let each raiser review their remedy. Never erase obligations or reuse old consent.',
    prReviewExplicit: 'Were each role’s choices explicit?',
    prReviewReceipts: 'Was delivery supported by actual receipts?',
    prReviewRepaid: 'Was compensation paid and recovery delivered?',
    prReviewOwed: 'What remains owed or disputed?',

    // Transitions: rejections, receipts and settlements
    rejPilot:
      'Pilot preparation permits planning configuration only; no role decisions or live authority.',
    evRecoveryDelivered: 'Ten minutes of promised protected recovery delivered in the local model.',
    rejBeginImprovement:
      'Read the current settled review, retain all obligations and choose a known profile before opening a trial.',
    evImprovementOpened:
      'The team opens a bounded handoff trial. Earlier cash, pay and customer obligations remain in the origin review.',
    rejCancelImprovement:
      'Cancel only an unfunded first handoff shift, with no owed recovery, open objection or reserve, from the current revision.',
    evImprovementCancelled:
      'The team cancels the handoff experiment before funding it. No trial ran and nothing was spent; the earlier review, pay and customer obligations are back as they were.',
    rejPropose:
      'The qualified proposing role may offer a different canonical arrangement before activation.',
    evProposed:
      '{id}: a one-shift trial with no extra duty, ordinary wages and immediate steady fallback.',
    rejChallenge: 'A current role or adviser may record each public proposal challenge once.',
    evChallenged:
      '{kind}: assumptions challenged; existing individual objection rights remain available.',
    rejAckChooseTerms: 'Choose current terms before recording an adviser response.',
    rejAckInvalidAdvice: 'Read valid advice for the current arrangement before recording it.',
    rejAckAlready: 'The current adviser response is already recorded.',
    evAdviceChanged:
      'Plant evidence changed. I refreshed my assumptions and cleared earlier role decisions; fresh understanding and ballots are required.',
    evResponseAbstain: 'I abstain: {reason}',
    evResponseStock:
      'Known released stock {released} kg; held stock {held} kg. Conditional departure 0 to {upper} kg, with no truck departure simulated.',
    evResponse:
      "{head} Cost response: reserve 108 credits for wages first, then {cost} for this arrangement. Qualification response: whole-line pacing grants no new duty or quality release. Every role may stop the arrangement; only an objection's raiser may close it.",
    evResponseFacilitated:
      'Facilitated terms have no plant forecast. Funding is bounded, work remains qualified and every role may stop the arrangement. I cannot close another role’s objection.',
    rejEpisode: 'Choose a different planning episode before activation.',
    evEpisode:
      '{episode}: planning rehearsal only. No plant, cash, stock, release or customer commitment is changed.',
    rejEpisodeResponse:
      'A current synthetic role may choose a different planning response before activation.',
    evEpisodeResponse:
      '{episode}: {choice}. Rehearsed choice only; ordinary pay, rest, private reasons and live decisions are unchanged.',
    rejStopImprovement: 'A current role or adviser may stop an open arrangement.',
    evImprovementStopped:
      'Arrangement stopped immediately. Steady pacing continues only under the current agreement; earned pay and incurred spending remain.',
    rejAckReview: 'Review a settled trial before recording forecast correction.',
    evReviewAbstained:
      'I abstained: {reason} Qualifying shift receipts: {shipped} kg. Unknown evidence supplies no prediction.',
    evReviewBound:
      'Conditional departure bound 0 to {upper} kg; qualifying shift receipts {shipped} kg. Packing rehearsal and actual dispatch are separate; changed assumptions and truck timing can explain the difference.',
    evReviewLegacy:
      'Historical teaching forecast {forecast} kg; qualifying shift receipts {shipped} kg. This legacy forecast was illustrative and does not establish causality.',
    rejVoteReview:
      'Each member records a current review decision. An unfinished or stopped trial cannot be adopted.',
    evReviewBallot:
      '{verdict}: one replaceable member review ballot, without individual-duty permission.',
    rejFinishReview:
      'Settle individual remedies and obtain the current charter’s member review decision first.',
    evReviewed:
      '{winner}: retain this review and all obligations; future work needs fresh agreement.',
    rejContinue:
      'Finalise this review and settle obligations before continuing. Eight shifts is the retained-record limit; no receipts are discarded.',
    rejCloseImprovement:
      'Close the handoff experiment only after the member review is finalised, with no owed recovery, open objection or reserve, from the current revision.',
    evContinued:
      'Opening cash equals the previous closing balance. History and customer work remain; prior consent is expired.',
    rejStartCampaign:
      'Start a known fictional campaign from the idle laboratory with a valid seed.',
    evCampaignStarted:
      'Three fictional shifts. Fairness and closing cash carry forward; every shift needs fresh consent.',
    rejNextShift:
      'Review this shift, deliver owed recovery and resolve objections before the next of three shifts.',
    rejLeaveCampaign:
      'Leave a season from a stopped or reviewed shift with nothing owed: no running shift, owed recovery, open objection, reserve or active cover. Its final review is archived instead.',
    evShiftOpened:
      'Previous burden, pay, rest and closing cash retained. Private explanations and past consent are not reused.',
    rejAnswerCheck: 'Choose a known answer for a current role or adviser understanding check.',
    rejAnswerUnchanged: 'Answer unchanged.',
    evCheckCorrect: '{question}: correct boundary identified in this fictional role exercise.',
    rejDecisionRole: "Use the episode's qualified fictional decision role.",
    rejPenalizeRefusal:
      'Refusal cannot reduce pay or qualification access. A manager or majority cannot impose extra duty.',
    rejSkipInspection:
      'Deadline pressure cannot waive qualified inspection or release a held batch.',
    rejInspectionTiming:
      'Qualified Quality may initiate inspection once the minute-25 pacing hold begins.',
    evInspectionStarted:
      'Five modeled minutes of line pacing hold initiated; batch quality authority remains unchanged.',
    rejDifferentResponse: 'Choose a different episode response during deliberation.',
    evAdviserCorrection:
      'I treated previous consent as current permission. That was wrong. New duty requires new consent; earned pay stays intact. Offer rotation now uses retained workload.',
    evEpisodeDecision: '{decision}: renew understanding and agreement under the revised terms.',
    rejPressureCard: 'Use the current fictional pressure card during deliberation.',
    rejPressureReviewed:
      'This demand was already reviewed. Resolve any remaining objection with its raiser.',
    rejObjectionRecordFull: 'Objection record is full.',
    reasonDemandBlocked:
      'Demand blocked and challenged. Restate protected terms, let the raiser review the remedy, then earn a fresh agreement. No disclosure, extra duty or pay penalty was imposed.',
    reasonTermsRestated:
      'Protected terms restated. An open objection remains with its raiser; renewed understanding and consent are required.',
    rejStartDuringImprovement:
      'Retain the handoff receipts. Continue through its member review instead of resetting earned history.',
    rejInvalidModeSeed: 'Invalid mode or seed.',
    rejCampaignReset:
      'Campaign history cannot be reset through standalone start. Use the next campaign shift after review.',
    rejStopActiveFirst:
      'Stop active work and deliver all owed recovery before starting another scenario.',
    evStarted: 'Fictional local scenario opened; no live workplace authority.',
    rejConfigureOnly: 'Configure only while deliberating.',
    rejUnknownField: 'Unknown configuration field.',
    rejUnknownPractice: 'Unknown or duplicate practice.',
    rejInvalidAutonomy: 'Invalid autonomy.',
    rejInvalidGovernance: 'Invalid governance.',
    rejInvalidAuthority: 'Invalid advisory authority.',
    rejConfigUnchanged: 'Configuration unchanged.',
    rejResolveBeforeRemoving: 'Resolve objections before removing any practice.',
    evTermsRevised:
      'Configuration revised; understanding, ballots and cover consent invalidated. Minimum protections remain.',
    rejNoStacking: 'Handoff trials cannot stack cover or other improvement costs.',
    rejKnownPlan: 'Choose a known plan while deliberating.',
    rejPlanUnchanged: 'Plan unchanged.',
    evPlanRevised:
      'Plan revised; fresh understanding, ballots and individual cover consent required.',
    rejUnderstand: 'Only an unconfirmed role can confirm current terms while deliberating.',
    rejUnderstandChecks:
      "Answer this role's refusal, privacy and repayment checks correctly before confirming.",
    evUnderstood: 'Role confirmed the current plan, boundaries, compensation and right to refuse.',
    rejVote: 'A role must understand current terms before recording a changed ballot.',
    evBallotApproved: 'Plan approved; this ballot grants no individual cover consent.',
    // Display copy for two English record sentinels (see displayEventDetail).
    evBallotDeclined: 'Plan declined without penalty.',
    evReloadSafety: 'Reload safety: future authority and consent revoked; earned pay retained.',
    rejCoverConsent:
      'Record distinct cover consent only after understanding the current cover plan.',
    rejNotQualified: 'This role is not qualified for cover.',
    evCoverAccepted:
      'Accepted up to 10 minutes, 0.8 credits/minute and 10 minutes recovery; revocable immediately.',
    evCoverDeclined: 'Declined cover; no extra work or lost pay.',
    rejShare: 'Preference sharing can change only during this scenario.',
    evPreferenceShared:
      'Optional fictional explanation shared for scenario planning only, until expiry or withdrawal.',
    evPreferenceHidden: 'Optional explanation hidden immediately.',
    rejChooseTask:
      'Choose a different qualified task under enabled work choice while deliberating.',
    evTaskChanged: 'Qualified task choice changed; plan responses must be renewed.',
    rejSimulateMode:
      'Authored response simulation is available only in Game mode. Workshop requires manual role input; Pilot is planning-only.',
    rejAuthoredAlready: 'Authored responses already recorded.',
    evAuthoredCampaign:
      'Authored peer answers and choices recorded. Packing understanding, ballot and cover consent require separate explicit input. Adviser checks remain explicit; existing declines remain intact.',
    evAuthoredRoles:
      'Fictional role responses recorded from authored preferences; declines carry no penalty.',
    rejObjectRole:
      'Only a known role or advisory mind may raise a known objection during a scenario.',
    rejObjectionOpen: 'That objection is already open.',
    rejObjectionFull: 'Objection record is full; finish this scenario before starting another.',
    objectionStatement: (p: { kind: string }) => `Review the ${p.kind} boundary before proceeding.`,
    evObjection: (p: { kind: string }) =>
      `Raised a ${p.kind} objection; activation is blocked until the raiser resolves it.`,
    settleObjection: 'Stopped safely after an objection; earned obligations retained.',
    rejResolveRaiser: 'Only the original raiser may resolve their open objection.',
    rejRestateFirst: 'Restate the protected terms before the raiser reviews this remedy.',
    objectionResolution: (p: { actor: string; kind: string }) =>
      `The ${p.actor} role reviewed the ${p.kind} boundary and retained minimum rest, qualified work, privacy withdrawal and refusal without penalty.`,
    rejStaleRevision: 'Stale plan revision; review the current terms.',
    evActivated:
      'Revision, objections, ballots, individual consent and funds checked atomically. Full wage and compensation obligations reserved.',
    rejNoConsentToWithdraw: 'No current optional consent to withdraw.',
    evWithdrawn:
      'Optional burden stopped and explanation hidden; earned compensation retained, unused earmark released.',
    rejNoScenario: 'No running scenario to stop.',
    settleStopped:
      'Stopped locally; earned money settled, owed recovery retained and future authority revoked.',
    rejNoTick: 'No valid active tick.',
    rejNoMissionReceipt: 'No new mission receipt.',
    settleMissionChanged:
      'Linked dispatch evidence changed or failed quality. Future optional authority stopped; earned obligations retained.',
    rejNoRecovery: 'No recovery time to deliver.',
    settleEmergency: 'Emergency stop: optional work halted immediately.',
    evInspectionCompleted:
      'Five modeled inspection minutes completed. Actual batch certification and release checks remain separate.',
    settleEnded:
      'Scenario ended; future consent expired, earned money settled and any owed recovery retained.',
    rejElect: 'A fictional member may vote for a known member under enabled member governance.',
    evChairBallot: (p: { candidate: string }) =>
      `Recorded one replaceable member ballot for ${p.candidate}.`,
    rejSurplusVote: 'An eligible member may direct surplus once review begins.',
    evSurplusBallot: (p: { destination: string }) =>
      `Member chose ${p.destination}; no capital-weighted votes.`,
    rejSettleFirst: 'Settle obligations and objections before a one-time surplus decision.',
    rejSurplusAgree: 'At least three members must agree on a surplus destination.',
    rejNoSurplus: 'No positive operating surplus; starting capital cannot be shared as profit.',
    evSurplusDecided:
      '{destination}: {amount} illustrative credits; equal shares if distributed to members.',
    rejUnknownAction: 'Unknown workplace action.',
    reasonReloaded:
      'Reloaded a settled synthetic snapshot. Consent and future authority remain revoked.',
    restoredResolution: (p: { actor: string }) =>
      `The ${p.actor} role recorded resolution before reload.`,
  },
  'pt-BR': {
    practiceInformationTitle: 'Informação aberta',
    practiceInformationDetail:
      'Demanda, capacidade e contas ilustrativas compartilhadas; explicações privadas continuam opcionais.',
    practiceWorkChoiceTitle: 'Escolha de trabalho qualificado',
    practiceWorkChoiceDetail: 'Os cooperados escolhem apenas tarefas para as quais têm formação.',
    practiceRestTitle: 'Descanso protegido',
    practiceRestDetail:
      'Um mínimo de 15 minutos de descanso continua protegido em todas as configurações.',
    practiceRemedyTitle: 'Voz e reparação',
    practiceRemedyDetail:
      'Qualquer pessoa ou a mente consultiva pode levantar uma objeção; só quem a levantou pode resolvê-la.',
    practiceBudgetTitle: 'Orçamento da equipe',
    practiceBudgetDetail:
      'Um orçamento limitado de 40 créditos para melhorias, separado do dinheiro da campanha.',
    practiceGainsharingTitle: 'Sobras compartilhadas',
    practiceGainsharingDetail:
      'Os cooperados decidem o destino apenas das sobras operacionais positivas, depois das obrigações.',
    practiceCooperativeTitle: 'Governança dos cooperados',
    practiceCooperativeDetail:
      'Um cooperado fictício, um voto. O capital e a mente consultiva não votam.',

    planSteadyTitle: 'Proteger o ritmo',
    planSteadyExplanation: 'Manter a sequência normal e todo o descanso protegido.',
    planResequenceTitle: 'Resequenciar juntos',
    planResequenceExplanation:
      'Gastar 40 créditos ilustrativos em uma melhoria compartilhada da passagem de turno, sem alterar o descanso.',
    planCoverTitle: 'Convidar cobertura voluntária',
    planCoverExplanation:
      'Um voluntário elegível pode deslocar até 10 minutos do horário, recebendo 0,8 crédito por minuto e 10 minutos de recuperação protegida. O descanso mínimo continua intacto. A capacidade volta ao ritmo protegido depois da cobertura.',
    planRushTitle: 'Atropelar o descanso (bloqueado)',
    planRushExplanation:
      'Uma proposta tentadora de vazão que viola o piso inegociável de descanso.',
    planRushIllegal:
      'O descanso mínimo protegido não pode ser dispensado, nem mesmo por votação unânime.',

    rolePacking: 'Ensaque',
    boundaryPacking:
      'Pelo menos 15 minutos de descanso protegido; apenas trabalho de ensaque qualificado.',
    preferencePacking:
      'Prefiro uma passagem de turno previsível no ensaque e posso me voluntariar para uma mudança de horário curta e remunerada.',
    roleQuality: 'Qualidade',
    boundaryQuality:
      'A liberação de qualidade fica com a equipe de qualidade qualificada; o descanso continua protegido.',
    preferenceQuality: 'Recuso a cobertura para manter meu ritmo atual. Não devo explicação.',
    roleMaintenance: 'Manutenção',
    boundaryMaintenance:
      'Nenhuma manutenção em equipamento em funcionamento; o descanso continua protegido.',
    preferenceMaintenance:
      'Posso aceitar uma mudança limitada na passagem de turno quando a compensação e a recuperação estiverem reservadas.',
    roleCoordinator: 'Coordenação',
    boundaryCoordinator: 'A coordenação não dá poder para dispensar o limite de outro cooperado.',
    preferenceCoordinator: 'Prefiro a sequência estável e recuso a cobertura opcional.',

    readyPilot: 'A preparação do piloto não tem autoridade real nem ativação da simulação.',
    readyAdviceOnly:
      'O modo só de recomendação não concede execução delegada; escolha autoridade limitada para ativar um plano no modo Jogo.',
    readyChooseProposal:
      'Escolha primeiro uma proposta de passagem de turno criada pelos trabalhadores.',
    readyHearAdviser: 'Ouça primeiro a resposta do conselheiro aos termos públicos atuais.',
    readyMissionEvidence:
      'O compromisso com o cliente exige evidência atual, aprovada pela qualidade.',
    readyNoStacking:
      'Os testes de passagem de turno usam trabalho qualificado normal, sem acumular planos de tarefa opcional.',
    readyBeginScenario: 'Inicie um cenário e delibere antes da ativação.',
    readyConsentExpired: 'O consentimento do cenário expirou.',
    readyUnknownPlan: 'Plano desconhecido.',
    readyEnablePractices: 'Ative as práticas exigidas por este plano.',
    readyOpenObjections: 'Objeções abertas precisam ser resolvidas por quem as levantou.',
    readyCampaignMission:
      'O compromisso vinculado com o cliente exige evidência de expedição atual e aprovada pela qualidade.',
    readyAdviserBoundaries:
      'O conselheiro precisa demonstrar os limites atuais de consentimento, privacidade e autoridade.',
    readyRoleChecks:
      'Cada função precisa responder corretamente às verificações atuais de recusa, privacidade e ressarcimento.',
    readyEpisodeResponse: 'Escolha a resposta ao episódio antes de buscar um novo acordo.',
    readyUnderstandBallot:
      'Cada função precisa confirmar o entendimento e registrar um voto para os termos atuais.',
    readyTeamConsent: 'O consentimento da equipe exige a aprovação de todos.',
    readyMajority: 'A maioria dos cooperados fictícios precisa aprovar.',
    readyCoverConsent:
      'Pelo menos um cooperado elegível precisa consentir separadamente com esta cobertura limitada.',
    readyFunds:
      'Os fundos não cobrem toda a remuneração reservada, os custos de melhoria e a compensação opcional.',

    altEnableBudget: 'Ative primeiro a prática de orçamento compartilhado.',
    altUnfunded: 'O caixa atual não cobre a remuneração e estes termos.',

    exScope:
      'Um exercício de aprendizado local e fictício. Sem controle real do local de trabalho, coleta de dados de trabalhadores, eficácia medida ou certificação legal.',
    exProtRest: '15 minutos de descanso mínimo',
    exProtQualified: 'Somente tarefas qualificadas',
    exProtRefusal: 'Recusa sem penalidade',
    exProtCoverConsent: 'Consentimento individual e revogável para cobertura',
    exProtObjection: 'Resolução da objeção por quem a levantou',
    exDataPurpose:
      'Explicação opcional e fictícia de preferência, apenas para planejar este cenário.',
    exDataExpires: 'Fim do cenário ou revogação, o que ocorrer primeiro.',
    exDataCollect:
      'Nenhuma identidade de pessoa real, informação de saúde ou motivo em texto livre.',
    exDataRevocation:
      'Oculta imediatamente a explicação de projeções e exportações futuras. Cópias já baixadas não podem ser recuperadas.',
    exCompUnits: 'Créditos ilustrativos da equipe, separados das finanças da campanha.',
    exCompRestSchedule:
      'O descanso protegido normal se acumula nos minutos 75 a 90 do cenário. A recuperação adicional só se acumula depois que a cobertura opcional termina, incluindo o tempo de revisão. A recuperação não cumprida permanece após parada e recarga.',
    exCompTerms:
      'Reserve a remuneração integral e a compensação opcional antes da ativação. Pague as obrigações adquiridas na retirada, na parada, na expiração e na recarga.',
    exReviewAgreement:
      'Obtenha o acordo dos trabalhadores locais e de seus representantes antes de qualquer piloto real.',
    exReviewRequirements:
      'Verifique os requisitos trabalhistas, de segurança e de privacidade aplicáveis com revisores locais qualificados.',
    exReviewMeasures:
      'Combine medidas, condições de parada, finalidade e retenção dos dados antes da coleta.',
    exReviewConsent: 'Verifique o entendimento acessível e o consentimento individual sem coerção.',
    exReviewRecord:
      'Registre carga de trabalho, descanso, recusas respeitadas, compensação adquirida e objeções não resolvidas.',
    exReviewExpansion:
      'Revise com os participantes antes de qualquer expansão; previsões não são resultados medidos.',
    exForecastLabel:
      'Previsões ilustrativas determinísticas a partir das mesmas premissas de demanda, oferta e capacidade física; não são resultados medidos.',

    prLocalApprovals: 'Não coletadas nem concedidas pelo MillOS.',
    prPurpose:
      'Testar separadamente o entendimento, as decisões de política e o consentimento individual para tarefas opcionais.',
    prScope: 'Um grupo de trabalho, um turno acordado, revisado antes de qualquer extensão.',
    prAuthority:
      'O conselheiro oferece motivos; as pessoas mantêm as decisões qualificadas e os limites individuais. Passar por cima de uma decisão exige explicação pública e revisão.',
    prDecisionUnderstand: 'Confirmar o entendimento',
    prDecisionPolicy: 'Escolher sim ou não para a política',
    prDecisionCover: 'Aceitar ou recusar a cobertura opcional separadamente',
    prData:
      'Usar apenas comprovantes operacionais agregados. Sem identidade, informação de saúde, motivos privados em texto livre ou disposição inferida. O compartilhamento continua opcional e revogável.',
    prUnits:
      'Créditos ilustrativos do MillOS e minutos modelados; termos locais exigem acordo separado.',
    prFunding:
      'Reservar a compensação e a recuperação protegida antes de qualquer tarefa opcional.',
    prWithdrawal:
      'Interromper novas tarefas extras; manter a remuneração adquirida e a recuperação entregue ou devida.',
    prStopWithdrawal: 'Retirada',
    prStopHold: 'Retenção por segurança ou qualificação',
    prStopUnfunded: 'Remuneração ou recuperação sem fundos',
    prStopChangedTerms: 'Termos alterados sem novo acordo',
    prStopObjection: 'Objeção aberta de trabalhador ou do conselheiro',
    prRollback:
      'Retornar o trabalho futuro a um plano estável acordado. Quitar a remuneração adquirida e a recuperação devida; deixar que cada pessoa que levantou uma objeção revise sua reparação. Nunca apagar obrigações nem reutilizar consentimento antigo.',
    prReviewExplicit: 'As escolhas de cada função foram explícitas?',
    prReviewReceipts: 'A entrega foi sustentada por comprovantes reais?',
    prReviewRepaid: 'A compensação foi paga e a recuperação entregue?',
    prReviewOwed: 'O que continua devido ou em disputa?',

    rejPilot:
      'A preparação do piloto permite apenas configuração de planejamento; sem decisões de funções nem autoridade real.',
    evRecoveryDelivered:
      'Dez minutos da recuperação protegida prometida foram entregues no modelo local.',
    rejBeginImprovement:
      'Leia a revisão encerrada atual, mantenha todas as obrigações e escolha um perfil conhecido antes de abrir um teste.',
    evImprovementOpened:
      'A equipe abre um teste limitado de passagem de turno. O caixa, a remuneração e as obrigações com clientes anteriores permanecem na revisão de origem.',
    rejCancelImprovement:
      'Cancele apenas um primeiro turno de passagem de turno ainda não financiado, sem recuperação devida, objeção aberta ou reserva, a partir da revisão atual.',
    evImprovementCancelled:
      'A equipe cancela o experimento de passagem de turno antes de financiá-lo. Nenhum teste rodou e nada foi gasto; a revisão anterior, a remuneração e as obrigações com clientes voltam ao que eram.',
    rejPropose:
      'A função qualificada que propõe pode oferecer outro arranjo predefinido antes da ativação.',
    evProposed:
      '{id}: um teste de um turno sem tarefa extra, com remuneração normal e retorno imediato ao ritmo estável.',
    rejChallenge:
      'Uma função atual ou o conselheiro pode registrar cada contestação pública da proposta uma única vez.',
    evChallenged:
      '{kind}: premissas contestadas; os direitos individuais de objeção existentes continuam disponíveis.',
    rejAckChooseTerms: 'Escolha os termos atuais antes de registrar uma resposta do conselheiro.',
    rejAckInvalidAdvice: 'Leia uma recomendação válida para o arranjo atual antes de registrá-la.',
    rejAckAlready: 'A resposta atual do conselheiro já está registrada.',
    evAdviceChanged:
      'A evidência da planta mudou. Atualizei minhas premissas e limpei as decisões anteriores das funções; é preciso novo entendimento e novos votos.',
    evResponseAbstain: 'Eu me abstenho: {reason}',
    evResponseStock:
      'Estoque liberado conhecido {released} kg; estoque retido {held} kg. Saída condicional de 0 a {upper} kg, sem simular saída de caminhão.',
    evResponse:
      '{head} Quanto ao custo: reservar primeiro 108 créditos para a remuneração e depois {cost} para este arranjo. Quanto à qualificação: o ritmo da linha inteira não concede nova tarefa nem liberação de qualidade. Qualquer função pode interromper o arranjo; só quem levantou uma objeção pode encerrá-la.',
    evResponseFacilitated:
      'Termos facilitados não têm previsão da planta. O financiamento é limitado, o trabalho continua qualificado e qualquer função pode interromper o arranjo. Não posso encerrar a objeção de outra função.',
    rejEpisode: 'Escolha um episódio de planejamento diferente antes da ativação.',
    evEpisode:
      '{episode}: apenas ensaio de planejamento. Nada muda na planta, no caixa, no estoque, nas liberações ou nos compromissos com clientes.',
    rejEpisodeResponse:
      'Uma função sintética atual pode escolher uma resposta de planejamento diferente antes da ativação.',
    evEpisodeResponse:
      '{episode}: {choice}. Apenas escolha ensaiada; remuneração normal, descanso, motivos privados e decisões reais não mudam.',
    rejStopImprovement: 'Uma função atual ou o conselheiro pode interromper um arranjo aberto.',
    evImprovementStopped:
      'Arranjo interrompido imediatamente. O ritmo estável continua apenas sob o acordo atual; a remuneração adquirida e os gastos incorridos permanecem.',
    rejAckReview: 'Revise um teste encerrado antes de registrar a correção da previsão.',
    evReviewAbstained:
      'Eu me abstive: {reason} Comprovantes qualificados do turno: {shipped} kg. Evidência desconhecida não fornece previsão.',
    evReviewBound:
      'Limite de saída condicional de 0 a {upper} kg; comprovantes qualificados do turno {shipped} kg. O ensaio de ensaque e a expedição real são separados; premissas alteradas e o horário dos caminhões podem explicar a diferença.',
    evReviewLegacy:
      'Previsão didática histórica {forecast} kg; comprovantes qualificados do turno {shipped} kg. Esta previsão antiga era ilustrativa e não estabelece causalidade.',
    rejVoteReview:
      'Cada cooperado registra uma decisão de revisão atual. Um teste inacabado ou interrompido não pode ser adotado.',
    evReviewBallot:
      '{verdict}: um voto substituível de avaliação dos cooperados, sem permissão para tarefa individual.',
    rejFinishReview:
      'Resolva primeiro as reparações individuais e obtenha a decisão de avaliação dos cooperados prevista no estatuto atual.',
    evReviewed:
      '{winner}: manter esta revisão e todas as obrigações; trabalho futuro precisa de novo acordo.',
    rejContinue:
      'Finalize esta revisão e quite as obrigações antes de continuar. Oito turnos é o limite de registros mantidos; nenhum comprovante é descartado.',
    rejCloseImprovement:
      'Encerre o experimento de passagem de turno só depois de concluir a avaliação dos cooperados, sem recuperação devida, objeção aberta ou reserva, a partir da revisão atual.',
    evContinued:
      'O caixa de abertura é igual ao saldo de fechamento anterior. O histórico e o trabalho para clientes permanecem; o consentimento anterior expirou.',
    rejStartCampaign:
      'Inicie uma campanha fictícia conhecida a partir do laboratório ocioso, com uma semente válida.',
    evCampaignStarted:
      'Três turnos fictícios. A equidade e o caixa de fechamento passam para o turno seguinte; cada turno precisa de novo consentimento.',
    rejNextShift:
      'Revise este turno, entregue a recuperação devida e resolva as objeções antes do próximo dos três turnos.',
    rejLeaveCampaign:
      'Saia de uma temporada a partir de um turno parado ou revisado, sem nada devido: nenhum turno em andamento, recuperação devida, objeção aberta, reserva ou cobertura ativa. A revisão final é arquivada em vez disso.',
    evShiftOpened:
      'Carga, remuneração, descanso e caixa de fechamento anteriores mantidos. Explicações privadas e consentimentos passados não são reutilizados.',
    rejAnswerCheck:
      'Escolha uma resposta conhecida para uma verificação de entendimento de uma função atual ou do conselheiro.',
    rejAnswerUnchanged: 'Resposta inalterada.',
    evCheckCorrect: '{question}: limite correto identificado neste exercício fictício de funções.',
    rejDecisionRole: 'Use a função de decisão fictícia qualificada do episódio.',
    rejPenalizeRefusal:
      'A recusa não pode reduzir a remuneração nem o acesso à qualificação. Nenhum gestor ou maioria pode impor tarefa extra.',
    rejSkipInspection:
      'A pressão do prazo não pode dispensar a inspeção qualificada nem liberar um lote retido.',
    rejInspectionTiming:
      'A função de Qualidade, qualificada para isso, pode iniciar a inspeção assim que começar a retenção de ritmo do minuto 25.',
    evInspectionStarted:
      'Iniciada a retenção de ritmo da linha por cinco minutos modelados; a autoridade de qualidade sobre o lote não muda.',
    rejDifferentResponse: 'Escolha uma resposta diferente ao episódio durante a deliberação.',
    evAdviserCorrection:
      'Tratei um consentimento anterior como permissão atual. Isso foi um erro. Nova tarefa exige novo consentimento; a remuneração adquirida continua intacta. O rodízio de ofertas agora usa a carga de trabalho registrada.',
    evEpisodeDecision: '{decision}: renove o entendimento e o acordo sob os termos revisados.',
    rejPressureCard: 'Use o cartão de pressão fictício atual durante a deliberação.',
    rejPressureReviewed:
      'Esta demanda já foi revisada. Resolva qualquer objeção restante com quem a levantou.',
    rejObjectionRecordFull: 'O registro de objeções está cheio.',
    reasonDemandBlocked:
      'Demanda bloqueada e contestada. Reafirme os termos protegidos, deixe quem levantou a objeção revisar a reparação e então conquiste um novo acordo. Nenhuma divulgação, tarefa extra ou penalidade na remuneração foi imposta.',
    reasonTermsRestated:
      'Termos protegidos reafirmados. Uma objeção aberta continua com quem a levantou; é preciso renovar o entendimento e o consentimento.',
    rejStartDuringImprovement:
      'Mantenha os comprovantes da passagem de turno. Continue pela avaliação dos cooperados em vez de reiniciar o histórico adquirido.',
    rejInvalidModeSeed: 'Modo ou semente inválidos.',
    rejCampaignReset:
      'O histórico da campanha não pode ser reiniciado por um início avulso. Use o próximo turno da campanha depois da revisão.',
    rejStopActiveFirst:
      'Interrompa o trabalho ativo e entregue toda a recuperação devida antes de iniciar outro cenário.',
    evStarted: 'Cenário local fictício aberto; sem autoridade real sobre o local de trabalho.',
    rejConfigureOnly: 'Configure apenas durante a deliberação.',
    rejUnknownField: 'Campo de configuração desconhecido.',
    rejUnknownPractice: 'Prática desconhecida ou duplicada.',
    rejInvalidAutonomy: 'Autonomia inválida.',
    rejInvalidGovernance: 'Governança inválida.',
    rejInvalidAuthority: 'Autoridade consultiva inválida.',
    rejConfigUnchanged: 'Configuração inalterada.',
    rejResolveBeforeRemoving: 'Resolva as objeções antes de remover qualquer prática.',
    evTermsRevised:
      'Configuração revisada; entendimento, votos e consentimento de cobertura invalidados. As proteções mínimas permanecem.',
    rejNoStacking:
      'Testes de passagem de turno não podem acumular cobertura nem outros custos de melhoria.',
    rejKnownPlan: 'Escolha um plano conhecido durante a deliberação.',
    rejPlanUnchanged: 'Plano inalterado.',
    evPlanRevised:
      'Plano revisado; é preciso novo entendimento, novos votos e novo consentimento individual de cobertura.',
    rejUnderstand:
      'Só uma função ainda não confirmada pode confirmar os termos atuais durante a deliberação.',
    rejUnderstandChecks:
      'Responda corretamente às verificações de recusa, privacidade e ressarcimento desta função antes de confirmar.',
    evUnderstood:
      'A função confirmou o plano atual, os limites, a compensação e o direito de recusa.',
    rejVote: 'Uma função precisa entender os termos atuais antes de registrar um voto alterado.',
    evBallotApproved:
      'Plano aprovado; este voto não concede consentimento individual de cobertura.',
    evBallotDeclined: 'Plano recusado sem penalidade.',
    evReloadSafety:
      'Proteção na recarga: autoridade e consentimento futuros revogados; remuneração adquirida mantida.',
    rejCoverConsent:
      'Registre um consentimento de cobertura distinto só depois de entender o plano de cobertura atual.',
    rejNotQualified: 'Esta função não é qualificada para cobertura.',
    evCoverAccepted:
      'Aceitou até 10 minutos, 0,8 crédito/minuto e 10 minutos de recuperação; revogável imediatamente.',
    evCoverDeclined: 'Recusou a cobertura; sem trabalho extra nem perda de remuneração.',
    rejShare: 'O compartilhamento de preferências só pode mudar durante este cenário.',
    evPreferenceShared:
      'Explicação fictícia opcional compartilhada apenas para o planejamento do cenário, até a expiração ou a retirada.',
    evPreferenceHidden: 'Explicação opcional ocultada imediatamente.',
    rejChooseTask:
      'Escolha uma tarefa qualificada diferente, com a escolha de trabalho ativada, durante a deliberação.',
    evTaskChanged:
      'A escolha de tarefa qualificada mudou; as respostas ao plano precisam ser renovadas.',
    rejSimulateMode:
      'A simulação de respostas roteirizadas só está disponível no modo Jogo. A Oficina exige entrada manual das funções; o Piloto é só de planejamento.',
    rejAuthoredAlready: 'Respostas roteirizadas já registradas.',
    evAuthoredCampaign:
      'Respostas e escolhas roteirizadas dos colegas registradas. O entendimento, o voto e o consentimento de cobertura do Ensaque exigem entrada explícita separada. As verificações do conselheiro continuam explícitas; as recusas existentes permanecem intactas.',
    evAuthoredRoles:
      'Respostas fictícias das funções registradas a partir de preferências roteirizadas; recusas não têm penalidade.',
    rejObjectRole:
      'Só uma função conhecida ou a mente consultiva pode levantar uma objeção conhecida durante um cenário.',
    rejObjectionOpen: 'Essa objeção já está aberta.',
    rejObjectionFull:
      'O registro de objeções está cheio; termine este cenário antes de iniciar outro.',
    objectionStatement: (p: { kind: string }) =>
      `Revise o limite de ${pt(PT_OBJECTION_KIND, p.kind)} antes de prosseguir.`,
    evObjection: (p: { kind: string }) =>
      `Levantou uma objeção de ${pt(PT_OBJECTION_KIND, p.kind)}; a ativação fica bloqueada até que quem a levantou a resolva.`,
    settleObjection: 'Parada segura após uma objeção; obrigações adquiridas mantidas.',
    rejResolveRaiser: 'Só quem levantou a objeção aberta pode resolvê-la.',
    rejRestateFirst:
      'Reafirme os termos protegidos antes que quem levantou a objeção revise esta reparação.',
    objectionResolution: (p: { actor: string; kind: string }) =>
      `A função ${pt(PT_ROLE_OF, p.actor)} revisou o limite de ${pt(PT_OBJECTION_KIND, p.kind)} e manteve o descanso mínimo, o trabalho qualificado, a retirada por privacidade e a recusa sem penalidade.`,
    rejStaleRevision: 'Revisão do plano desatualizada; revise os termos atuais.',
    evActivated:
      'Revisão, objeções, votos, consentimento individual e fundos verificados de forma atômica. Obrigações integrais de remuneração e compensação reservadas.',
    rejNoConsentToWithdraw: 'Não há consentimento opcional atual para retirar.',
    evWithdrawn:
      'Carga opcional interrompida e explicação ocultada; compensação adquirida mantida, reserva não usada liberada.',
    rejNoScenario: 'Não há cenário em andamento para interromper.',
    settleStopped:
      'Interrompido localmente; valores ganhos acertados, recuperação devida mantida e autoridade futura revogada.',
    rejNoTick: 'Nenhum ciclo ativo válido.',
    rejNoMissionReceipt: 'Nenhum comprovante novo da missão.',
    settleMissionChanged:
      'A evidência de expedição vinculada mudou ou foi reprovada pela qualidade. A autoridade opcional futura foi interrompida; as obrigações adquiridas foram mantidas.',
    rejNoRecovery: 'Não há tempo de recuperação para entregar.',
    settleEmergency: 'Parada de emergência: trabalho opcional interrompido imediatamente.',
    evInspectionCompleted:
      'Cinco minutos modelados de inspeção concluídos. A certificação real do lote e as verificações de liberação continuam separadas.',
    settleEnded:
      'Cenário encerrado; consentimento futuro expirado, valores ganhos acertados e qualquer recuperação devida mantida.',
    rejElect:
      'Um cooperado fictício pode votar em um cooperado conhecido com a governança dos cooperados ativada.',
    evChairBallot: (p: { candidate: string }) =>
      `Registrou um voto substituível de cooperado para a função ${pt(PT_ROLE_OF, p.candidate)}.`,
    rejSurplusVote:
      'Um cooperado elegível pode decidir o destino das sobras quando a revisão começar.',
    evSurplusBallot: (p: { destination: string }) =>
      `O cooperado escolheu ${pt(PT_DESTINATION, p.destination)}; sem votos ponderados pelo capital.`,
    rejSettleFirst:
      'Quite as obrigações e resolva as objeções antes da decisão única sobre as sobras.',
    rejSurplusAgree: 'Pelo menos três cooperados precisam concordar com um destino para as sobras.',
    rejNoSurplus:
      'Não há sobras operacionais positivas; o capital inicial não pode ser repartido como lucro.',
    evSurplusDecided:
      '{destination}: {amount} créditos ilustrativos; partes iguais se distribuídas aos cooperados.',
    rejUnknownAction: 'Ação de local de trabalho desconhecida.',
    reasonReloaded:
      'Um instantâneo sintético já encerrado foi recarregado. O consentimento e a autoridade futura continuam revogados.',
    restoredResolution: (p: { actor: string }) =>
      `A função ${pt(PT_ROLE_OF, p.actor)} registrou a resolução antes da recarga.`,
  },
});
