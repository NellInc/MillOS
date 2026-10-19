import { defineMessages } from '../../../i18n';

/*
 * Store ids (objection kinds, challenge kinds, verdicts, evidence states,
 * proposal ids) were always printed verbatim, so English returns them as-is
 * and pt-BR maps each known id to a word, falling back to the id.
 */
const PT_OBJECTION_KIND: Record<string, string> = {
  rest: 'descanso',
  burden: 'sobrecarga',
  privacy: 'privacidade',
  authority: 'autoridade',
};
const PT_CHALLENGE_KIND: Record<string, string> = {
  forecast: 'previsão',
  cost: 'custo',
  qualification: 'qualificação',
};
const PT_CHALLENGE_OBJECT: Record<string, string> = {
  forecast: 'a previsão',
  cost: 'o custo',
  qualification: 'a qualificação',
};
const PT_VERDICT: Record<string, string> = {
  adopt: 'adotar',
  amend: 'ajustar',
  stop: 'interromper',
};
const PT_EVIDENCE: Record<string, string> = {
  current: 'atual',
  stale: 'desatualizada',
  'quality-failed': 'reprovada na qualidade',
  missing: 'ausente',
};
const PT_PROPOSAL: Record<string, string> = {
  briefing: 'briefing',
  buffer: 'estoque intermediário',
};
const PT_BALLOT: Record<string, string> = {
  pending: 'pendente',
  approved: 'aprovado',
  declined: 'recusado',
};

const pt = (table: Record<string, string>, id: string) => table[id] ?? id;

interface ObjectionParams {
  role: string;
  statement: string;
  kind: string;
}
interface RemedyParams {
  role: string;
  kind: string;
}
interface CostLineParams {
  cost: string;
  briefingMinutes: string;
  capacity: string;
}
interface KindParams {
  kind: string;
}
interface ChallengeItemParams {
  role: string;
  kind: string;
  acknowledged: boolean;
}
interface BallotParams {
  status: 'pending' | 'approved' | 'declined';
}
interface ForecastReviewParams {
  speed: string;
  kg: string;
  within: boolean;
}
interface EvidenceParams {
  kg: string;
  evidence: string;
}
interface VerdictParams {
  verdict: string;
}
interface HistoryParams {
  cycle: string;
  proposal: string;
  verdict: string;
  kg: string;
  wages: string;
  spend: string;
  cash: string;
}

export const workplaceImprovementPanelMessages = defineMessages({
  en: {
    regionLabel: 'Handoff experiment',
    introHeading: 'The handoff experiment',
    introIdea: 'Try a member’s idea on the packing floor, then decide what stays.',
    introProtected: 'One 90-minute trial. Pay, qualified work and refusal stay protected.',
    modeLabel: 'Handoff mode',
    modeGame: 'Game',
    modeWorkshop: 'Workshop',
    modePilot: 'Pilot preparation',
    governanceLabel: 'Handoff governance',
    profileToeDip: 'Coordinator-led',
    profileTeam: 'Team agreement',
    profileCooperative: 'Member governance',
    openExperiment: 'Open the handoff experiment',
    openHoldNote:
      'Opening it holds the plant clock while the team decides, so the adviser forecast stays true. You can cancel it until the trial is funded.',
    holdHeading: 'Plant clock held for this decision',
    cancelExperiment: 'Cancel the handoff experiment',
    cancelNote:
      'Nothing is funded yet, so cancelling returns to the review you started from, with its pay, receipts and customer work unchanged, and the plant resumes at the pace above.',
    endToReviewNote:
      'This later shift keeps earlier trial pay, so it cannot be cancelled. Ending it moves to its member review; finalising that review releases the plant.',
    finaliseToReleaseNote: 'Finalising the member review below releases the plant.',
    seasonOpened: 'Season opened. Use Shift and Agreement / Voices for current decisions.',
    pilotPlanningOnly:
      'Pilot preparation remains planning-only. Use Game or Workshop for a local experiment.',
    shiftHeading: 'The handoff experiment, shift {cycle}',
    rolePlayNote:
      'Synthetic role-play. Everyone can challenge or stop an arrangement. No private reason, extra duty or lost pay is required.',
    remediesLabel: 'Handoff remedies',
    remediesHeading: 'Whose concern needs a remedy?',
    remediesNote:
      'Review each concern with its raiser. Opening a record changes no role, decision or permission. Only that raiser can confirm resolution.',
    adviser: 'Adviser',
    objectionLine: (p: ObjectionParams) => `${p.role}: ${p.statement} (${p.kind}, open)`,
    reviewRemedy: (p: RemedyParams) => `Review remedy: ${p.role} (${p.kind})`,
    whichIdea: 'Which idea should the team try?',
    selected: 'Selected for this trial.',
    costLine: (p: CostLineParams) =>
      `${p.cost} credits for a new arrangement; ${
        p.briefingMinutes ? `${p.briefingMinutes} paid minutes of pacing hold; ` : ''
      }${p.capacity}× modeled pace. An adopted arrangement has no repeat purchase.`,
    reserveLine:
      'Reserve 108 credits for wages first. This shift’s purchase: {cost} credits. Cash before reservations: {cash}.',
    hearAdviserHint:
      'Hear the adviser response to capture the current plant facts. Missing evidence will cause an explicit abstention.',
    workshopNoForecast: 'Facilitated workshop: no physical packing or departure forecast.',
    noCapacityBonus: 'Governance grants no capacity bonus.',
    challengeAuthor: 'Challenge author',
    beginTurn: 'Begin a participant turn',
    challengeSubject: 'Challenge subject',
    challengeKind: (p: KindParams) => p.kind,
    challengeProposal: 'Challenge this proposal',
    hearAdviser: 'Hear the adviser response',
    challengeItem: (p: ChallengeItemParams) =>
      `${p.role} challenged ${p.kind}; ${
        p.acknowledged
          ? 'response recorded, individual objection rights retained'
          : 'response pending'
      }.`,
    adviserResponse:
      'Adviser: “These are uncertain operational assumptions. Spending stays bounded, work stays qualified, and any role can return the line to steady pacing. I cannot waive a boundary or close someone else’s objection.”',
    roleDecisionsHeading: 'Fresh role decisions',
    roleDecisionsNote:
      'A policy ballot grants no optional-duty consent. Team agreement requires all approvals; member governance requires three; coordinator-led work hears every role before the coordinator decides.',
    policyBallot: (p: BallotParams) => `Policy ballot: ${p.status}.`,
    ordinaryPayUnchanged: ' Ordinary pay is unchanged.',
    confirmUnderstanding: 'Confirm handoff understanding: {role}',
    approveHandoff: 'Approve handoff: {role}',
    declineHandoff: 'Decline handoff: {role}',
    checkingAgreement: 'Checking current agreement…',
    recordWorkshop: 'Record handoff workshop agreement',
    approveAndRun: 'Approve and run handoff trial',
    arrangementStopped: 'Arrangement stopped: steady 0.78× pacing for the remaining agreed shift.',
    arrangementExpires: 'Arrangement expires at minute 90. {detail}',
    briefingInProgress: 'Paid briefing in progress; line pacing held.',
    watchLineDispatch: 'Watch the line and customer dispatch.',
    stoppingRole: 'Stopping role',
    stopArrangement: 'Stop arrangement and keep steady work',
    endShiftNow: 'End handoff shift now',
    advanceRehearsal: 'Advance handoff rehearsal by 5 minutes',
    watchPackingHandoff: 'Watch the packing handoff',
    actualDispatch: 'This shift’s actual dispatch: ',
    kgValue: '{kg} kg',
    workshopNoShipment: ' (workshop has no plant shipment)',
    commitmentRemaining: 'Full customer commitment remaining: ',
    commitmentValue: (p: EvidenceParams) => `${p.kg} kg; ${p.evidence} evidence`,
    paidThisShift: 'Paid this shift: ',
    paidValue: '{wages} credits; purchase {spend}; closing cash {cash}',
    retainedPay: 'Retained earned pay: ',
    retainedPayValue: '{wages} credits; compensation {compensation}',
    carryHeading: 'What should carry into the next shift?',
    learningLabel: 'Handoff learning review',
    learningHeading: 'What did this handoff teach us?',
    comparisonNote:
      'The optional comparison below uses current paused plant inputs. It does not replay this finished shift or record a review ballot. Fresh terms still need fresh role decisions.',
    hearForecastReview: 'Hear the adviser review its forecast',
    adviserQuoteOpen: 'Adviser: “',
    abstainedReview:
      'I had insufficient evidence to forecast. This outcome does not turn missing facts into a prior prediction.',
    forecastReview: (p: ForecastReviewParams) =>
      `I assumed fixed machinery, quality and ${p.speed}× clock pace. Actual dispatch ${p.kg} kg ${
        p.within ? 'fell within' : 'exceeded'
      } my conditional bound. Changed inputs or collection timing require a new explanation, never a retroactively edited forecast.`,
    teachingForecastReview:
      'That retained teaching forecast was illustrative. New game trials capture plant-grounded facts.',
    adviserQuoteClose: 'Customer work, earned pay and individual remedies remain intact.”',
    reviewDecision: '{role} review decision',
    chooseReviewDecision: 'Choose a review decision',
    verdictAdopt: 'Adopt, retain the purchase with fresh agreement',
    verdictAmend: 'Amend, try the alternative next shift',
    verdictStop: 'Stop, return to ordinary pacing',
    finaliseReview: 'Finalise handoff review',
    reviewRecorded: (p: VerdictParams) =>
      `Review recorded: ${p.verdict}. Every ending preserves the learning and earned obligations.`,
    completeGame:
      'This handoff experiment is complete. The plant runs normally again at the shift pace below; change it there if you like. Another handoff shift is optional.',
    completeWorkshop: 'This handoff experiment is complete. Another handoff shift is optional.',
    openNextShift: 'Open next handoff shift',
    earlierDecisions: 'Earlier decisions and retained receipts',
    originNote:
      'Origin closing cash: {cash} credits. Earlier earned pay and any campaign review remain retained; old consent supplies no current permission.',
    historyLine: (p: HistoryParams) =>
      `Shift ${p.cycle}: ${p.proposal}, ${p.verdict}; dispatched ${p.kg} kg, wages ${p.wages}, purchase ${p.spend}, closing cash ${p.cash}.`,
  },
  'pt-BR': {
    regionLabel: 'Experimento de passagem de turno',
    introHeading: 'O experimento de passagem de turno',
    introIdea: 'Teste a ideia de um cooperado no setor de ensaque e depois decida o que fica.',
    introProtected:
      'Um teste de 90 minutos. A remuneração, o trabalho qualificado e a recusa continuam protegidos.',
    modeLabel: 'Modo da passagem de turno',
    modeGame: 'Jogo',
    modeWorkshop: 'Oficina',
    modePilot: 'Preparação de piloto',
    governanceLabel: 'Governança da passagem de turno',
    profileToeDip: 'Liderado pela coordenação',
    profileTeam: 'Acordo da equipe',
    profileCooperative: 'Governança dos cooperados',
    openExperiment: 'Abrir o experimento de passagem de turno',
    openHoldNote:
      'Abrir o experimento para o relógio da planta enquanto a equipe decide, para que a previsão do conselheiro continue válida. Você pode cancelá-lo até o teste ser financiado.',
    holdHeading: 'Relógio da planta parado para esta decisão',
    cancelExperiment: 'Cancelar o experimento de passagem de turno',
    cancelNote:
      'Nada foi financiado ainda, então cancelar volta à revisão de onde você partiu, com a remuneração, os comprovantes e o trabalho para clientes inalterados, e a planta retoma no ritmo acima.',
    endToReviewNote:
      'Este turno posterior mantém a remuneração de testes anteriores, então não pode ser cancelado. Encerrá-lo leva à avaliação dos cooperados; concluir essa avaliação libera a planta.',
    finaliseToReleaseNote: 'Concluir a avaliação dos cooperados abaixo libera a planta.',
    seasonOpened: 'Temporada aberta. Use Turno e Acordo / Vozes para as decisões atuais.',
    pilotPlanningOnly:
      'A preparação de piloto continua apenas como planejamento. Use Jogo ou Oficina para um experimento local.',
    shiftHeading: 'O experimento de passagem de turno, turno {cycle}',
    rolePlayNote:
      'Encenação sintética. Todos podem contestar ou interromper um arranjo. Nenhum motivo privado, serviço extra ou perda de remuneração é exigido.',
    remediesLabel: 'Reparações da passagem de turno',
    remediesHeading: 'De quem é a preocupação que precisa de reparação?',
    remediesNote:
      'Revise cada preocupação com quem a levantou. Abrir um registro não altera nenhuma função, decisão ou permissão. Somente quem a levantou pode confirmar a resolução.',
    adviser: 'Conselheiro',
    objectionLine: (p: ObjectionParams) =>
      `${p.role}: ${p.statement} (${pt(PT_OBJECTION_KIND, p.kind)}, aberta)`,
    reviewRemedy: (p: RemedyParams) =>
      `Revisar reparação: ${p.role} (${pt(PT_OBJECTION_KIND, p.kind)})`,
    whichIdea: 'Qual ideia a equipe deve testar?',
    selected: 'Selecionada para este teste.',
    costLine: (p: CostLineParams) =>
      `${p.cost} créditos por um novo arranjo; ${
        p.briefingMinutes ? `${p.briefingMinutes} minutos pagos de ritmo em espera; ` : ''
      }${p.capacity}× do ritmo modelado. Um arranjo adotado não exige nova compra.`,
    reserveLine:
      'Reserve primeiro 108 créditos para a remuneração. Compra deste turno: {cost} créditos. Caixa antes das reservas: {cash}.',
    hearAdviserHint:
      'Ouça a resposta do conselheiro para registrar os fatos atuais da planta. A falta de evidência causará uma abstenção explícita.',
    workshopNoForecast: 'Oficina facilitada: sem ensaque físico nem previsão de saída.',
    noCapacityBonus: 'A governança não concede bônus de capacidade.',
    challengeAuthor: 'Autor da contestação',
    beginTurn: 'Inicie a vez de um participante',
    challengeSubject: 'Assunto da contestação',
    challengeKind: (p: KindParams) => pt(PT_CHALLENGE_KIND, p.kind),
    challengeProposal: 'Contestar esta proposta',
    hearAdviser: 'Ouvir a resposta do conselheiro',
    challengeItem: (p: ChallengeItemParams) =>
      `${p.role} contestou ${pt(PT_CHALLENGE_OBJECT, p.kind)}; ${
        p.acknowledged
          ? 'resposta registrada, direitos individuais de objeção mantidos'
          : 'resposta pendente'
      }.`,
    adviserResponse:
      'Conselheiro: “Estas são premissas operacionais incertas. Os gastos continuam limitados, o trabalho continua qualificado e qualquer função pode devolver a linha ao ritmo estável. Não posso dispensar um limite nem encerrar a objeção de outra pessoa.”',
    roleDecisionsHeading: 'Novas decisões das funções',
    roleDecisionsNote:
      'Uma votação de política não concede consentimento para serviço opcional. O acordo da equipe exige todas as aprovações; a governança dos cooperados exige três; no trabalho liderado pela coordenação, todas as funções são ouvidas antes que a coordenação decida.',
    policyBallot: (p: BallotParams) => `Voto de política: ${pt(PT_BALLOT, p.status)}.`,
    ordinaryPayUnchanged: ' A remuneração normal não muda.',
    confirmUnderstanding: 'Confirmar entendimento da passagem de turno: {role}',
    approveHandoff: 'Aprovar a passagem de turno: {role}',
    declineHandoff: 'Recusar a passagem de turno: {role}',
    checkingAgreement: 'Verificando o acordo atual…',
    recordWorkshop: 'Registrar o acordo da oficina de passagem de turno',
    approveAndRun: 'Aprovar e executar o teste de passagem de turno',
    arrangementStopped:
      'Arranjo interrompido: ritmo estável de 0,78× pelo restante do turno acordado.',
    arrangementExpires: 'O arranjo expira no minuto 90. {detail}',
    briefingInProgress: 'Briefing pago em andamento; ritmo da linha em espera.',
    watchLineDispatch: 'Acompanhe a linha e a expedição ao cliente.',
    stoppingRole: 'Função que interrompe',
    stopArrangement: 'Interromper o arranjo e manter o trabalho estável',
    endShiftNow: 'Encerrar agora este turno do experimento',
    advanceRehearsal: 'Avançar o ensaio de passagem de turno em 5 minutos',
    watchPackingHandoff: 'Acompanhar a passagem de turno no ensaque',
    actualDispatch: 'Expedição real deste turno: ',
    kgValue: '{kg} kg',
    workshopNoShipment: ' (a oficina não tem expedição da planta)',
    commitmentRemaining: 'Compromisso total restante com o cliente: ',
    commitmentValue: (p: EvidenceParams) =>
      `${p.kg} kg; evidência ${p.evidence ? pt(PT_EVIDENCE, p.evidence) : ''}`,
    paidThisShift: 'Pago neste turno: ',
    paidValue: '{wages} créditos; compra {spend}; caixa de fechamento {cash}',
    retainedPay: 'Remuneração conquistada mantida: ',
    retainedPayValue: '{wages} créditos; compensação {compensation}',
    carryHeading: 'O que deve seguir para o próximo turno?',
    learningLabel: 'Revisão de aprendizado da passagem de turno',
    learningHeading: 'O que esta passagem de turno nos ensinou?',
    comparisonNote:
      'A comparação opcional abaixo usa os dados atuais da planta, em pausa. Ela não reproduz este turno encerrado nem registra um voto de revisão. Novos termos ainda exigem novas decisões das funções.',
    hearForecastReview: 'Ouvir o conselheiro revisar a própria previsão',
    adviserQuoteOpen: 'Conselheiro: “',
    abstainedReview:
      'Eu não tinha evidência suficiente para prever. Este resultado não transforma fatos ausentes em uma previsão anterior.',
    forecastReview: (p: ForecastReviewParams) =>
      `Presumi maquinário, qualidade e ritmo de relógio de ${p.speed}× fixos. A expedição real de ${p.kg} kg ${
        p.within ? 'ficou dentro do' : 'excedeu o'
      } meu limite condicional. Mudanças nos dados ou no horário de coleta exigem uma nova explicação, nunca uma previsão editada retroativamente.`,
    teachingForecastReview:
      'Aquela previsão didática mantida era ilustrativa. Novos testes no jogo registram fatos baseados na planta.',
    adviserQuoteClose:
      'O trabalho para o cliente, a remuneração conquistada e as reparações individuais continuam intactos.”',
    reviewDecision: 'Decisão de revisão: {role}',
    chooseReviewDecision: 'Escolha uma decisão de revisão',
    verdictAdopt: 'Adotar, mantendo a compra com novo acordo',
    verdictAmend: 'Ajustar, testando a alternativa no próximo turno',
    verdictStop: 'Interromper, voltando ao ritmo normal',
    finaliseReview: 'Concluir a revisão da passagem de turno',
    reviewRecorded: (p: VerdictParams) =>
      `Revisão registrada: ${pt(PT_VERDICT, p.verdict)}. Todo desfecho preserva o aprendizado e as obrigações já devidas.`,
    completeGame:
      'Este experimento de passagem de turno está concluído. A planta volta a funcionar normalmente no ritmo do turno abaixo; mude-o ali se quiser. Outro turno do experimento é opcional.',
    completeWorkshop:
      'Este experimento de passagem de turno está concluído. Outro turno do experimento é opcional.',
    openNextShift: 'Abrir o próximo turno do experimento',
    earlierDecisions: 'Decisões anteriores e comprovantes mantidos',
    originNote:
      'Caixa de fechamento de origem: {cash} créditos. A remuneração conquistada anteriormente e qualquer revisão de campanha continuam mantidas; um consentimento antigo não concede permissão atual.',
    historyLine: (p: HistoryParams) =>
      `Turno ${p.cycle}: ${pt(PT_PROPOSAL, p.proposal)}, ${pt(PT_VERDICT, p.verdict)}; expedido ${p.kg} kg, remuneração ${p.wages}, compra ${p.spend}, caixa de fechamento ${p.cash}.`,
  },
});
