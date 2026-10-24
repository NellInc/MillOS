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
    evidenceStatus: (p: Status) => p.status,

    // Next beat (deriveWorkplaceGuidance)
    beatRestate: 'Restate the terms',
    beatRemedy: 'The raiser reviews the remedy',
    beatQualityReviews: 'Quality reviews the line',
    beatCompleteInspection: 'Complete protected inspection',
    beatAccount: 'Account for what was kept',
    beatDeliver: 'Deliver the agreement',
    beatEarn: 'Earn a fresh agreement',
    nextRestate: 'Use Restate protected terms in Shift. The challenge remains open afterwards.',
    nextRemedy:
      'In Agreement / Voices, select the resolving author. Only the raiser can confirm resolution.',
    nextInspect:
      'Use Quality initiates five-minute inspection in Shift. The line is held; deadline pressure grants no authority to skip the check.',
    nextInspecting:
      'Inspection is running until modeled minute {minute}. Resume the plant clock when ready to deliver the remaining inspection time. Actual batch certification remains separate.',
    nextReviewing:
      'Review paid compensation, delivered recovery and customer delivery separately. This shift cannot resume.',
    nextRunning:
      'Use the plant clock controls to run or pause real production. An objection during work stops this shift into review.',
    nextRevised:
      'Your no is recorded. Compare revised offers in Shift. Changing shared terms clears every role decision; each role then chooses afresh.',
    nextReady:
      'Current terms are ready. Use Approve and run agreement in Agreement / Voices only when you choose to proceed.',
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
    willingnessExpired:
      'Yesterday’s willingness has expired. Retained workload informs a new offer; it grants no new consent.',
    challengeLine: '{role} challenge: {status}. {receipt}',
    adviser: 'Adviser',
    protectedRecorded: 'Protected terms recorded.',
    noProtectedReceipt: 'No retained protected-terms receipt.',
    protectedWithoutChallenge:
      'Protected terms recorded without a challenge. Prevention does not claim an objection was resolved.',
    noPressureResponse:
      'No retained pressure response. The pressure card is optional; a protected plan can proceed without trying the demand.',
    repairBelongs:
      'Repair belongs to review. Resolving the objection cannot restart this same shift.',
    goToControls: 'Go to {destination} controls',
    detailsSummary: 'Terms, retained burden and delivery',
    stepRestate: 'Restate protected terms in Shift; restatement leaves the objection open.',
    stepRemedy: 'Let each raiser review the remedy in Agreement / Voices.',
    stepApprove:
      'Answer current role checks, record understanding and ballots, then explicitly approve the plan in Agreement / Voices. Cover consent is separate.',
    stepReview:
      'Use Review to compare paid obligations, actual recovery and delivery. Promises and agreed deferrals remain distinct from delivery.',
    extraDutyNote:
      'Extra duty always requires fresh individual consent; a no-extra-duty plan remains valid.',
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
    recoveryNote:
      'Owed recovery needs modeled clock time. Review preserves shortfalls, earned pay and prior shifts. Changing terms clears the current role agreement.',
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
    beatDeliver: 'Cumpra o acordo',
    beatEarn: 'Conquiste um novo acordo',
    nextRestate:
      'Use “Reafirmar os termos protegidos” em Turno. A contestação continua aberta depois.',
    nextRemedy:
      'Em Acordo / Vozes, selecione o autor da resolução. Somente quem levantou a objeção pode confirmar a resolução.',
    nextInspect:
      'Use “A Qualidade inicia a inspeção de cinco minutos” em Turno. A linha fica retida; a pressão do prazo não dá autoridade para pular a verificação.',
    nextInspecting:
      'A inspeção está em andamento até o minuto modelado {minute}. Retome o relógio da planta quando estiver pronto para cumprir o tempo restante de inspeção. A certificação real do lote continua separada.',
    nextReviewing:
      'Revise separadamente a compensação paga, a recuperação concedida e a entrega ao cliente. Este turno não pode ser retomado.',
    nextRunning:
      'Use os controles do relógio da planta para rodar ou pausar a produção real. Uma objeção durante o trabalho interrompe este turno e o leva à revisão.',
    nextRevised:
      'Seu “não” foi registrado. Compare as ofertas revisadas em Turno. Mudar os termos compartilhados apaga todas as decisões das funções; cada função então escolhe de novo.',
    nextReady:
      'Os termos atuais estão prontos. Use “Aprovar e executar o acordo” em Acordo / Vozes somente quando decidir seguir em frente.',
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
    willingnessExpired:
      'A disposição de ontem expirou. A carga de trabalho acumulada orienta uma nova oferta; ela não concede novo consentimento.',
    challengeLine: 'Contestação de {role}: {status}. {receipt}',
    adviser: 'Conselheiro',
    protectedRecorded: 'Termos protegidos registrados.',
    noProtectedReceipt: 'Nenhum comprovante de termos protegidos registrado.',
    protectedWithoutChallenge:
      'Termos protegidos registrados sem contestação. A prevenção não afirma que uma objeção foi resolvida.',
    noPressureResponse:
      'Nenhuma resposta à pressão registrada. A carta de pressão é opcional; um plano protegido pode seguir sem testar a exigência.',
    repairBelongs:
      'A reparação cabe à revisão. Resolver a objeção não pode reiniciar este mesmo turno.',
    goToControls: 'Ir para os controles de {destination}',
    detailsSummary: 'Termos, carga acumulada e entrega',
    stepRestate: 'Reafirme os termos protegidos em Turno; a reafirmação deixa a objeção aberta.',
    stepRemedy: 'Deixe cada pessoa que levantou uma objeção revisar a reparação em Acordo / Vozes.',
    stepApprove:
      'Responda às verificações atuais das funções, registre o entendimento e os votos e depois aprove explicitamente o plano em Acordo / Vozes. O consentimento para cobertura é separado.',
    stepReview:
      'Use Revisão para comparar obrigações pagas, recuperação real e entrega. Promessas e adiamentos acordados continuam distintos da entrega.',
    extraDutyNote:
      'Trabalho extra sempre exige novo consentimento individual; um plano sem trabalho extra continua válido.',
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
    recoveryNote:
      'A recuperação devida precisa de tempo de relógio modelado. A revisão preserva os déficits, a remuneração conquistada e os turnos anteriores. Mudar os termos apaga o acordo atual das funções.',
  },
});
