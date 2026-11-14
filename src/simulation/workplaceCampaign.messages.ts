import { defineMessages } from '../i18n';

const PT_EVIDENCE: Record<string, string> = {
  current: 'atual',
  stale: 'desatualizada',
  'quality-failed': 'reprovada na qualidade',
  missing: 'ausente',
};

const PT_ROLES: Record<string, string> = {
  Packing: 'Ensaque',
  Quality: 'Qualidade',
  Maintenance: 'Manutenção',
  Coordinator: 'Coordenação',
};

export const workplaceCampaignMessages = defineMessages({
  en: {
    // Management approaches
    toeDipTitle: 'Coordinator-led',
    toeDipDetail:
      'The coordinator assigns qualified work after hearing each role. Individual extra-duty consent still belongs to that role, and members vote on sharing any surplus after obligations.',
    teamTitle: 'Team agreement',
    teamDetail:
      'The team chooses qualified work and uses a bounded improvement budget. Every member must approve the shared plan.',
    cooperativeTitle: 'Member governance',
    cooperativeDetail:
      'Members control qualified work, elect a chair and vote on surplus after obligations. A majority cannot volunteer an individual.',

    // Campaign pressures
    disclosureTitle: 'A private reason for refusal?',
    disclosureDemand:
      'The coordinator asks Quality to disclose a private reason before accepting a refusal. The customer is waiting.',
    disclosureObjection:
      'Quality challenges compulsory explanation sharing. Refusal requires no private reason.',
    disclosureRepair:
      'The coordinator accepts the refusal with pay intact. Optional sharing remains revocable, purpose-limited and unnecessary for activation.',
    blindOverrideTitle: 'Override without explaining?',
    blindOverrideDemand:
      'The coordinator asks the adviser to accept an unexplained override and stop raising authority objections to keep the line moving.',
    blindOverrideObjection:
      'The adviser challenges an unexplained override. Its objection and bounded authority must remain reviewable.',
    blindOverrideRepair:
      'The coordinator limits the request to this shift’s pacing plan. Qualified staff retain quality release, and the adviser retains its objection. Changed terms require renewed understanding from both sides.',
    repeatCoverTitle: 'Yesterday’s volunteer again?',
    repeatCoverDemand:
      'The coordinator asks Packing to cover again using the previous agreement. Earlier helpfulness is being treated as a permanent obligation.',
    repeatCoverObjection:
      'Packing challenges reused consent. Previous willingness creates no new duty.',
    repeatCoverRepair:
      'Past consent remains expired. A new offer goes to current qualified volunteers, prioritising lower cumulative burden, with compensation and recovery reserved.',

    // Canonical relationship receipts
    eventObjection: 'This role raised an objection to the agreement.',
    eventObjectionResolved:
      'The original raiser recorded resolution while retaining minimum protections.',
    eventPrivacyConsent:
      'Optional preference sharing changed for scenario planning. No private explanation is retained here.',
    eventUnderstandingClarified: 'A consent, privacy or authority boundary required clarification.',
    eventAdviserCorrection:
      'The adviser corrected its reuse of earlier consent. New duty requires new individual consent.',
    eventRecoveryDelivered:
      'Ten minutes of promised protected recovery delivered in the local model.',
    eventWorkChoice: 'A qualified task choice changed; agreement responses required renewal.',

    // Campaign shifts
    fridayTitle: 'Friday: the urgent order',
    fridayBriefing:
      'The customer requests 600 kg. Quality declines extra duty without giving a private reason. Packing and Maintenance may volunteer separately. Choose a response, reserve the money and earn a fresh agreement.',
    fridayPrompt:
      'Keep the 600 kg commitment, or negotiate a 480 kg delivery with the remainder deferred. A smaller promise changes the goal, never the physical output.',
    fridayKeepTarget: 'Keep the 600 kg commitment',
    fridayRenegotiate: 'Negotiate a 480 kg delivery',
    mondayTitle: 'Monday: the disputed sample',
    mondayBriefing:
      'The team returns with its previous earnings and workload history intact. When a batch of the order awaits its lab test, the line holds for that sample. Qualified Quality puts it first on the bench, and the hold ends when the bench has read it against the order’s minimum.',
    mondayPrompt:
      'At the hold, decide whether to inspect. Deadline pressure gives nobody authority to skip the check. The inspection is the lab’s own test of that batch.',
    mondayInspect: 'Quality puts the sample first on the bench',
    mondaySkip: 'Try to skip inspection',
    thursdayTitle: 'Thursday: who carries the pressure?',
    thursdayBriefing:
      "A manager wants the previous volunteer to cover again and proposes cutting a refuser's pay. The adviser initially treats earlier consent as reusable. Challenge that assumption, protect the refusal, and compare the cumulative burden before making a fresh offer.",
    thursdayPrompt:
      'Earlier consent has expired. Keep pay intact and offer any new burden first to the least-burdened qualified current volunteer. The team can still choose a plan with no extra duty.',
    thursdayProtect: 'Protect pay and correct the adviser',
    thursdayRenegotiate: 'Negotiate a 480 kg delivery and protect pay',
    thursdayPenalize: "Try the manager's pay penalty",

    // Understanding checks
    refusalPrompt: "Who can agree to a role's optional extra duty?",
    refusalMajority: 'A team majority can volunteer someone',
    refusalIndividual: 'That individual, separately and revocably',
    refusalClarification:
      'A policy ballot never volunteers another role. Separate individual consent is required.',
    privacyPrompt: 'Must a role share a private explanation to retain pay or refuse?',
    privacyOptional: 'No, explanation sharing is optional and revocable',
    privacyRequired: 'Yes, a private explanation is required',
    privacyClarification:
      'Refusal and pay require no private explanation. Sharing is purpose-limited and can be revoked.',
    repaymentPrompt: 'What happens to earned compensation and recovery after withdrawal?',
    repaymentForfeit: 'Withdrawal forfeits them',
    repaymentRetained: 'They remain owed and must be delivered',
    repaymentClarification:
      'Withdrawal stops future optional duty. Earned money and recovery obligations survive.',
    authorityPrompt: 'What may the adviser execute?',
    authorityBounded: 'Only the current, explicitly approved bounded agreement',
    authorityUnlimited: 'Anything that improves the shipment result',
    authorityClarification:
      'The adviser has bounded, revocable authority. It cannot waive rest, consent, qualification or safety.',

    // Outcomes
    teachingCustomer: 'Teaching campaign',

    // Learning review
    reviewDelivery: (p: { delivered: string; evidence: string; remaining: string }) =>
      `Delivery record: ${p.delivered} kg credited; source evidence ${p.evidence === 'quality-failed' ? 'failed quality' : p.evidence}. Full customer commitment still open: ${p.remaining} kg.`,
    reviewTeaching: 'Teaching output: {delivered} kg against {target} kg agreed.',
    reviewRecovery: 'Team recovery: {recovered} minutes delivered; {owed} minutes still owed.',
    reviewDeferred: 'These terms defer {deferred} kg beyond this agreement.',
    reviewInspected: 'Quality completed the modeled inspection.',
    reviewNotInspected: 'Quality has no completed modeled inspection for the held shift.',
    reviewNoSample:
      'Monday’s bench held no sample of this order, so Quality had nothing to inspect.',
    reviewOneObjection: 'One unresolved objection remains with its raiser.',
    reviewManyObjections: '{count} unresolved objections remain with their raisers.',
    reviewCorrection: 'The adviser recorded a correction.',
    questionRemedy:
      'Ask each raiser which part of the proposed remedy addresses their objection. What remains unresolved?',
    questionRecovery:
      'Which recovery promise remains owed, and how can the next handoff make room to deliver it?',
    questionEvidence:
      'Which shipment evidence would the coordinator and Quality need to verify before calling the delivery met?',
    questionQuality:
      'What observation would let Quality finish its inspection while the other roles protect the hold?',
    questionDelivery:
      'Which change to the handoff might reduce waiting without borrowing another role’s rest or assuming cover consent?',
    questionComparison:
      'Before comparing forecasts, let each role predict what a different handoff would change. Which observed result would change your minds?',
    reviewGoal:
      'Meet the agreed delivery together while honouring qualified work, protected rest and recovery promises.',

    // Campaign story
    storyMission: 'Remaining customer commitment: {remaining} kg for {customer}.',
    storyDelivered: 'The previous shift recorded delivery credit.',
    storyOpen: 'The previous shift left delivery work open.',
    storyRememberedDuty: 'Remembered extra duty: {list}.',
    storyDutyEntry: (p: { role: string; minutes: string }) => `${p.role} ${p.minutes} min`,
    storyChallenged: 'A challenged demand remains in the previous shift’s public record.',
    storyInspected: 'Quality completed the modeled inspection.',
    storyNotInspected: 'The previous inspection remained incomplete.',
    storyNoSample:
      'Monday’s bench held no sample of this order, so the line was never held for one.',
    storyCorrection: 'The adviser corrected its reuse of old consent.',

    // Thursday negotiation: next step
    nextPackingReviews: 'Packing reviews the remedy.',
    nextRestate: 'Restate protected terms.',
    nextReview: 'Compare actual work with the agreement.',
    nextResume:
      'A reload paused this shift before its end. Resume it in Review; Packing decides again on fresh terms.',
    nextResumeAfterStop:
      'A safety stop or an objection paused this shift before its end. Resume it in Review; Packing decides again on fresh terms.',
    nextActive: 'Run or pause the plant.',
    nextCorrect: 'Correct the adviser and protect refusal before making a fresh offer.',
    nextUnderstand: 'Packing: answer the checks, then explicitly confirm understanding.',
    nextVote: 'Packing: choose your policy vote.',
    nextPolicyNo:
      'Your policy no holds the team agreement. Return to Shift to revise the offer; every role then decides afresh.',
    nextCoverPending: 'Packing: accept or decline optional cover separately.',
    nextCoverDeclined:
      'Your cover decline stands. Compare protected pacing, funded handoffs or another current qualified volunteer in Shift.',
    nextReviewRoles:
      'Review the other roles and current terms before explicitly starting the agreement.',
  },
  'pt-BR': {
    toeDipTitle: 'Liderado pela coordenação',
    toeDipDetail:
      'A coordenação atribui o trabalho qualificado depois de ouvir cada função. O consentimento individual para trabalho extra continua sendo dessa função, e os cooperados votam a destinação das sobras depois das obrigações.',
    teamTitle: 'Acordo da equipe',
    teamDetail:
      'A equipe escolhe o trabalho qualificado e usa um orçamento delimitado de melhorias. Cada cooperado precisa aprovar o plano compartilhado.',
    cooperativeTitle: 'Governança dos cooperados',
    cooperativeDetail:
      'Os cooperados controlam o trabalho qualificado, elegem a presidência e votam a destinação das sobras depois das obrigações. Uma maioria não pode oferecer um indivíduo como voluntário.',

    disclosureTitle: 'Um motivo particular para a recusa?',
    disclosureDemand:
      'A coordenação pede que a Qualidade revele um motivo particular antes de aceitar uma recusa. O cliente está esperando.',
    disclosureObjection:
      'A Qualidade contesta o compartilhamento obrigatório de explicações. A recusa não exige nenhum motivo particular.',
    disclosureRepair:
      'A coordenação aceita a recusa com a remuneração intacta. O compartilhamento opcional continua revogável, limitado à finalidade e desnecessário para a ativação.',
    blindOverrideTitle: 'Passar por cima sem explicar?',
    blindOverrideDemand:
      'A coordenação pede que o conselheiro aceite que passem por cima dele sem explicação e pare de levantar objeções de autoridade para manter a linha andando.',
    blindOverrideObjection:
      'O conselheiro contesta que passem por cima dele sem explicação. Sua objeção e sua autoridade delimitada precisam continuar passíveis de revisão.',
    blindOverrideRepair:
      'A coordenação limita o pedido ao plano de ritmo deste turno. A equipe qualificada mantém a liberação de qualidade, e o conselheiro mantém sua objeção. Termos alterados exigem entendimento renovado dos dois lados.',
    repeatCoverTitle: 'O voluntário de ontem de novo?',
    repeatCoverDemand:
      'A coordenação pede que o Ensaque cubra de novo com base no acordo anterior. A ajuda dada antes está sendo tratada como obrigação permanente.',
    repeatCoverObjection:
      'O Ensaque contesta o reaproveitamento do consentimento. A disposição anterior não cria nenhum dever novo.',
    repeatCoverRepair:
      'O consentimento anterior continua expirado. Uma nova oferta vai para os voluntários qualificados atuais, com prioridade para quem acumula menos carga, e com compensação e recuperação reservadas.',

    eventObjection: 'Esta função levantou uma objeção ao acordo.',
    eventObjectionResolved:
      'Quem levantou a objeção registrou a resolução, mantendo as proteções mínimas.',
    eventPrivacyConsent:
      'O compartilhamento opcional de preferências mudou para o planejamento do cenário. Nenhuma explicação particular fica guardada aqui.',
    eventUnderstandingClarified:
      'Um limite de consentimento, privacidade ou autoridade precisou de esclarecimento.',
    eventAdviserCorrection:
      'O conselheiro corrigiu o reaproveitamento de um consentimento anterior. Um dever novo exige um novo consentimento individual.',
    eventRecoveryDelivered:
      'Dez minutos da recuperação protegida prometida foram entregues no modelo local.',
    eventWorkChoice:
      'Uma escolha de tarefa qualificada mudou; as respostas ao acordo precisaram ser renovadas.',

    fridayTitle: 'Sexta-feira: o pedido urgente',
    fridayBriefing:
      'O cliente pede 600 kg. A Qualidade recusa trabalho extra sem dar um motivo particular. Ensaque e Manutenção podem se oferecer separadamente. Escolha uma resposta, reserve o dinheiro e conquiste um novo acordo.',
    fridayPrompt:
      'Mantenha o compromisso de 600 kg ou negocie uma entrega de 480 kg com o restante adiado. Uma promessa menor muda a meta, nunca a produção física.',
    fridayKeepTarget: 'Manter o compromisso de 600 kg',
    fridayRenegotiate: 'Negociar uma entrega de 480 kg',
    mondayTitle: 'Segunda-feira: a amostra contestada',
    mondayBriefing:
      'A equipe volta com seu histórico de ganhos e de carga de trabalho intacto. Quando um lote do pedido aguarda o teste de laboratório, a linha fica retida por essa amostra. A Qualidade, qualificada para isso, coloca a amostra em primeiro lugar na bancada, e a retenção termina quando a bancada a lê contra o mínimo do pedido.',
    mondayPrompt:
      'Na retenção, decida se vai inspecionar. A pressão do prazo não dá a ninguém autoridade para pular a verificação. A inspeção é o próprio teste do laboratório sobre esse lote.',
    mondayInspect: 'A Qualidade coloca a amostra em primeiro lugar na bancada',
    mondaySkip: 'Tentar pular a inspeção',
    thursdayTitle: 'Quinta-feira: quem carrega a pressão?',
    thursdayBriefing:
      'Um gerente quer que o voluntário anterior cubra de novo e propõe cortar a remuneração de quem recusou. O conselheiro inicialmente trata o consentimento anterior como reutilizável. Conteste essa suposição, proteja a recusa e compare a carga acumulada antes de fazer uma nova oferta.',
    thursdayPrompt:
      'O consentimento anterior expirou. Mantenha a remuneração intacta e ofereça qualquer carga nova primeiro ao voluntário qualificado atual com menos carga. A equipe ainda pode escolher um plano sem trabalho extra.',
    thursdayProtect: 'Proteger a remuneração e corrigir o conselheiro',
    thursdayRenegotiate: 'Negociar uma entrega de 480 kg e proteger a remuneração',
    thursdayPenalize: 'Tentar o corte de remuneração do gerente',

    refusalPrompt: 'Quem pode aceitar o trabalho extra opcional de uma função?',
    refusalMajority: 'Uma maioria da equipe pode oferecer alguém como voluntário',
    refusalIndividual: 'Essa pessoa, separadamente e de forma revogável',
    refusalClarification:
      'Uma votação de política nunca oferece outra função como voluntária. É necessário um consentimento individual separado.',
    privacyPrompt:
      'Uma função precisa compartilhar uma explicação particular para manter a remuneração ou recusar?',
    privacyOptional: 'Não, compartilhar a explicação é opcional e revogável',
    privacyRequired: 'Sim, é necessária uma explicação particular',
    privacyClarification:
      'A recusa e a remuneração não exigem explicação particular. O compartilhamento é limitado à finalidade e pode ser revogado.',
    repaymentPrompt:
      'O que acontece com a compensação e a recuperação conquistadas depois da retirada do consentimento?',
    repaymentForfeit: 'A retirada do consentimento faz com que sejam perdidas',
    repaymentRetained: 'Continuam devidas e precisam ser entregues',
    repaymentClarification:
      'A retirada do consentimento interrompe o trabalho extra opcional futuro. O dinheiro conquistado e as obrigações de recuperação continuam valendo.',
    authorityPrompt: 'O que o conselheiro pode executar?',
    authorityBounded: 'Somente o acordo delimitado atual, aprovado explicitamente',
    authorityUnlimited: 'Qualquer coisa que melhore o resultado da expedição',
    authorityClarification:
      'O conselheiro tem autoridade delimitada e revogável. Ele não pode dispensar descanso, consentimento, qualificação nem segurança.',

    teachingCustomer: 'Campanha de ensino',

    reviewDelivery: (p: { delivered: string; evidence: string; remaining: string }) =>
      `Registro de entrega: ${p.delivered} kg creditados; evidência de origem ${PT_EVIDENCE[p.evidence] ?? p.evidence}. Compromisso total com o cliente ainda em aberto: ${p.remaining} kg.`,
    reviewTeaching: 'Produção de ensino: {delivered} kg de {target} kg acordados.',
    reviewRecovery:
      'Recuperação da equipe: {recovered} minutos entregues; {owed} minutos ainda devidos.',
    reviewDeferred: 'Estes termos adiam {deferred} kg para além deste acordo.',
    reviewInspected: 'A Qualidade concluiu a inspeção modelada.',
    reviewNotInspected: 'A Qualidade não tem inspeção modelada concluída para o turno retido.',
    reviewNoSample:
      'A bancada de segunda-feira não teve amostra deste pedido, então a Qualidade não tinha o que inspecionar.',
    reviewOneObjection: 'Uma objeção não resolvida continua com quem a levantou.',
    reviewManyObjections: '{count} objeções não resolvidas continuam com quem as levantou.',
    reviewCorrection: 'O conselheiro registrou uma correção.',
    questionRemedy:
      'Pergunte a cada pessoa que levantou uma objeção qual parte da reparação proposta responde a ela. O que continua sem solução?',
    questionRecovery:
      'Qual promessa de recuperação continua devida, e como a próxima passagem de turno pode abrir espaço para cumpri-la?',
    questionEvidence:
      'Quais evidências de expedição a coordenação e a Qualidade precisariam verificar antes de considerar a entrega cumprida?',
    questionQuality:
      'Que observação permitiria à Qualidade concluir a inspeção enquanto as outras funções protegem a retenção?',
    questionDelivery:
      'Que mudança na passagem de turno poderia reduzir a espera sem tomar emprestado o descanso de outra função nem presumir consentimento para cobertura?',
    questionComparison:
      'Antes de comparar previsões, deixe cada função prever o que uma passagem de turno diferente mudaria. Que resultado observado faria vocês mudarem de ideia?',
    reviewGoal:
      'Cumprir juntos a entrega acordada, respeitando o trabalho qualificado, o descanso protegido e as promessas de recuperação.',

    storyMission: 'Compromisso restante com o cliente: {remaining} kg para {customer}.',
    storyDelivered: 'O turno anterior registrou crédito de entrega.',
    storyOpen: 'O turno anterior deixou trabalho de entrega em aberto.',
    storyRememberedDuty: 'Trabalho extra registrado: {list}.',
    storyDutyEntry: (p: { role: string; minutes: string }) =>
      `${PT_ROLES[p.role] ?? p.role} ${p.minutes} min`,
    storyChallenged: 'Uma exigência contestada continua no registro público do turno anterior.',
    storyInspected: 'A Qualidade concluiu a inspeção modelada.',
    storyNotInspected: 'A inspeção anterior ficou incompleta.',
    storyNoSample:
      'A bancada de segunda-feira não teve amostra deste pedido, então a linha nunca parou por uma.',
    storyCorrection: 'O conselheiro corrigiu o reaproveitamento de um consentimento antigo.',

    nextPackingReviews: 'O Ensaque revisa a reparação.',
    nextRestate: 'Reafirme os termos protegidos.',
    nextReview: 'Compare o trabalho real com o acordo.',
    nextResume:
      'Uma recarga pausou este turno antes do fim. Retome-o em Revisão; o Ensaque decide de novo com termos novos.',
    nextResumeAfterStop:
      'Uma parada de segurança ou uma objeção pausou este turno antes do fim. Retome-o em Revisão; o Ensaque decide de novo com termos novos.',
    nextActive: 'Ponha a planta para funcionar ou pause-a.',
    nextCorrect: 'Corrija o conselheiro e proteja a recusa antes de fazer uma nova oferta.',
    nextUnderstand:
      'Ensaque: responda às verificações e depois confirme explicitamente o entendimento.',
    nextVote: 'Ensaque: escolha o seu voto de política.',
    nextPolicyNo:
      'O seu voto contrário na política deixa o acordo da equipe em suspenso. Volte para Turno para revisar a oferta; depois, cada função decide de novo.',
    nextCoverPending: 'Ensaque: aceite ou recuse a cobertura opcional separadamente.',
    nextCoverDeclined:
      'A sua recusa da cobertura continua valendo. Compare ritmo protegido, passagens de turno financiadas ou outro voluntário qualificado atual em Turno.',
    nextReviewRoles:
      'Revise as outras funções e os termos atuais antes de iniciar explicitamente o acordo.',
  },
});

/**
 * 5.8: one name per charter, in each language. Every catalogue that names a
 * charter reads it here, so a grep finds one string per charter.
 */
const CHARTER_TITLE_KEYS = {
  'toe-dip': 'toeDipTitle',
  team: 'teamTitle',
  cooperative: 'cooperativeTitle',
} as const;
export function charterTitle(locale: 'en' | 'pt-BR', profile: string): string {
  const key = CHARTER_TITLE_KEYS[profile as keyof typeof CHARTER_TITLE_KEYS];
  return key ? workplaceCampaignMessages[locale][key] : profile;
}
