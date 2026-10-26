import { defineMessages } from '../../../i18n';

/** pt-BR label for a logic value; an unknown value falls back to itself. */
const pick = (labels: Record<string, string>, value: string): string => labels[value] ?? value;

type Value = { value: string };

interface DispatchParams {
  dispatched: string;
  remaining: string;
  target: string;
  deferred: string;
  shiftCount: number;
  shifts: string;
  elapsed: string;
  agreement: string;
}

interface ConservationParams {
  material: string;
  genealogy: string;
  manifestCount: number;
  manifests: string;
}

export const workplaceReplayMessages = defineMessages({
  en: {
    // Logic values shown as labels. English returns the value itself.
    sectionLabel: (p: { section: string }) => p.section,
    profileLabel: (p: { profile: string }) => p.profile,
    autonomyLabel: (p: Value) => p.value,
    governanceLabel: (p: Value) => p.value,
    aiAuthorityLabel: (p: Value) => p.value,

    // Feedback
    recordedLocally: 'Replay state recorded locally.',
    noChange: 'No change.',
    reportDownloaded: 'Redacted run report downloaded locally. Plant checkpoint stays in memory.',

    // Replay
    title: 'Matched plant replay',
    intro:
      'Pause the plant, capture the customer order and stock, choose a charter, agree fresh terms, play the actual plant, then retain the review and compare. Each charter starts from the same in-memory checkpoint. Rewinding replaces current local plant progress.',
    pauseForCapture: 'Pause plant for capture',
    capturePaused: 'Capture paused plant',
    startGuided: 'Start guided plant replay',
    captureRequires:
      'Capture requires a paused, safe local plant and an idle or untouched minute-zero discussion. External SCADA control, safety holds and owed recovery block rewind. Checkpoints disappear on reload and cannot be exported.',
    checkpointLine:
      'Checkpoint: {customer}, {remaining} kg remaining; source stock {source} kg. Day {day}, hour {hour}; seed {seed}. Faults: {faults}.',
    none: 'none',
    replayCharter: 'Replay {profile} charter',
    retainReview: 'Retain actual run review',
    forget: 'Forget replay checkpoint and reports',
    replayNote:
      'Replays remain paused for agreement and pause automatically at review. After an early stop, explicitly resume the plant clock to deliver owed recovery before retaining the review. An eligible review is retained before a new charter rewinds. Consent, votes and understanding never carry over.',
    noCheckpoint: 'No checkpoint yet. Capture a paused plant to compare actual runs.',
    unequalHorizons:
      'Unequal horizons: elapsed time, agreement time or shifts differ. Dispatch totals alone cannot establish a better charter.',
    discussEvidence: 'Discuss the actual replay evidence',
    learningReview: 'Replay learning review',
    hearRoles:
      'Hear Packing, Quality, Maintenance and Coordinator before choosing the next trial. Use the actual results and member receipts below; a shared starting point alone cannot establish a charter’s causal effect.',

    // Runs
    runLabel: '{profile} actual run',
    charterLine:
      'Closing charter: {autonomy} work choice; {governance} governance; {ai} AI authority. Practices: {practices}.',
    shiftPlans: 'Shift plans: {plans}.',
    shiftPlanItem: 'shift {number}, {title}',
    dispatchHeading: 'Actual dispatch and horizon',
    dispatchLine: (p: DispatchParams) =>
      `${p.dispatched} kg dispatched; ${p.remaining} kg full commitment remaining. Agreed target ${p.target} kg; deferred ${p.deferred} kg. ${p.shifts} ${p.shiftCount === 1 ? 'shift' : 'shifts'}; ${p.elapsed} elapsed minutes; ${p.agreement} agreement minutes.`,
    plantAccounts: 'Plant accounts, pounds sterling',
    revenueLine: 'Revenue £{revenue}; costs £{costs}.',
    workplaceCredits: 'Illustrative workplace credits',
    creditsLine: 'Wages {wages}; compensation {compensation}; improvements {improvements}.',
    conservationHeading: 'Conservation and genealogy',
    conservationLine: (p: ConservationParams) =>
      `Material error ${p.material} kg; genealogy error ${p.genealogy} kg; ${p.manifests} dispatch ${p.manifestCount === 1 ? 'manifest' : 'manifests'}.`,
    conductLine:
      'Refusals respected {refusals}; promises kept {promises}. Cumulative objections resolved {resolved} of {raised}. Current-shift open objections {open}.',
    burdensSummary: 'Member burdens and public receipts',
    memberLine:
      '{role}: extra {extra} min; rest {rest} min; recovery delivered {recovery} min, owed {owed} min; earned {earned}, compensation {compensation} credits; refusal {refusal}.',
    refusalRespected: 'respected',
    refusalNotRecorded: 'not recorded as respected',
    shiftNumber: 'Shift {number}',
    noReceipts: 'No public receipts retained for this shift.',
    eventLine: 'Minute {minute}, {actor}: {detail}',
    downloadReport: 'Download redacted replay report',
    closingNote:
      'Starting conditions match; frame-driven vehicle trajectories can differ between runs. Compare elapsed and agreement time alongside dispatch. These records describe local simulation conduct. No winner, trust or wellbeing score is inferred.',

    // Guide
    guideLabel: 'Guided replay',
    guideHeading: 'Guided replay: {section}',
    guideShift:
      'Start with protected rest, shared operating information and remedy. Keep the customer commitment or negotiate an installment: deferral leaves the full contract outstanding. Select a real plan below.',
    guidePractices:
      'Toe-dip starts with rest, information and remedy. Team adds shared decisions; cooperative adds member governance. Optional budget practice enables the shared handoff improvement. Use the actual practice controls below.',
    guideAgreement:
      'Each role answers its own understanding checks and casts its own vote. Optional cover needs separate revocable consent. Quality may refuse without explaining. Resolve objections through their original author, then explicitly approve the agreement below.',
    guideReview:
      'Check actual dispatch, protected rest, earned compensation and delivered recovery. Finish owed recovery before retaining this run. Return to Experiment to replay team or cooperative from the same checkpoint with fresh agreement.',
    planLine:
      '{title}: {pacing}% pacing; {budget} illustrative credits; {rest} min protected rest.',
    planCover:
      ' Up to {cover} min voluntary cover at {rate} credits/min and {recovery} min recovery, then protected pacing resumes.',
    activeNote:
      'The agreement is active. Use the plant clock controls to resume actual play; this guide never advances time or submits decisions.',
    nextSection: 'Next guide section',
    endGuide: 'End guide',
    optionalNavigation:
      'Optional navigation only. No votes, checks, consent or approval are supplied by the guide.',

    // Resume
    resume: 'Resume agreed replay at standard pace (1x)',
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
    profileLabel: (p: { profile: string }) =>
      pick(
        {
          'toe-dip': 'liderado pela coordenação',
          team: 'acordo da equipe',
          cooperative: 'governança dos cooperados',
        },
        p.profile
      ),
    autonomyLabel: (p: Value) =>
      pick({ directed: 'designada', individual: 'individual', team: 'pela equipe' }, p.value),
    governanceLabel: (p: Value) =>
      pick(
        {
          consultative: 'consultiva',
          'team-consent': 'por consentimento da equipe',
          'member-vote': 'por voto dos cooperados',
        },
        p.value
      ),
    aiAuthorityLabel: (p: Value) =>
      pick({ advice: 'somente recomendação', bounded: 'execução delimitada' }, p.value),

    recordedLocally: 'Estado da reprodução registrado localmente.',
    noChange: 'Nenhuma alteração.',
    reportDownloaded:
      'Relatório da execução com dados ocultados baixado localmente. O ponto de controle da planta continua na memória.',

    title: 'Reprodução pareada da planta',
    intro:
      'Pause a planta, capture o pedido do cliente e o estoque, escolha um estatuto, combine novos termos, jogue na planta real e depois guarde a revisão e compare. Cada estatuto parte do mesmo ponto de controle em memória. Voltar no tempo substitui o progresso local atual da planta.',
    pauseForCapture: 'Pausar a planta para a captura',
    capturePaused: 'Capturar a planta pausada',
    startGuided: 'Iniciar a reprodução guiada da planta',
    captureRequires:
      'A captura exige uma planta local pausada e segura e uma discussão ociosa ou ainda intocada no minuto zero. Controle SCADA externo, retenções de segurança e recuperação devida bloqueiam a volta no tempo. Os pontos de controle somem ao recarregar e não podem ser exportados.',
    checkpointLine:
      'Ponto de controle: {customer}, {remaining} kg pendentes; estoque de origem {source} kg. Dia {day}, hora {hour}; semente {seed}. Falhas: {faults}.',
    none: 'nenhuma',
    replayCharter: 'Reproduzir estatuto: {profile}',
    retainReview: 'Guardar a revisão da execução real',
    forget: 'Descartar o ponto de controle e os relatórios da reprodução',
    replayNote:
      'As reproduções ficam pausadas para o acordo e pausam automaticamente na revisão. Depois de uma parada antecipada, retome explicitamente o relógio da planta para conceder a recuperação devida antes de guardar a revisão. Uma revisão elegível é guardada antes que um novo estatuto volte no tempo. Consentimento, votos e entendimento nunca são transferidos.',
    noCheckpoint:
      'Nenhum ponto de controle ainda. Capture uma planta pausada para comparar execuções reais.',
    unequalHorizons:
      'Horizontes desiguais: o tempo decorrido, o tempo de acordo ou os turnos diferem. Os totais de expedição, sozinhos, não estabelecem um estatuto melhor.',
    discussEvidence: 'Discutir as evidências reais da reprodução',
    learningReview: 'Revisão de aprendizado da reprodução',
    hearRoles:
      'Ouça o Ensaque, a Qualidade, a Manutenção e a Coordenação antes de escolher o próximo teste. Use os resultados reais e os comprovantes dos cooperados abaixo; um ponto de partida comum, sozinho, não estabelece o efeito causal de um estatuto.',

    runLabel: 'Execução real: {profile}',
    charterLine:
      'Estatuto de encerramento: escolha do trabalho, {autonomy}; governança, {governance}; autoridade da IA, {ai}. Práticas: {practices}.',
    shiftPlans: 'Planos dos turnos: {plans}.',
    shiftPlanItem: 'turno {number}, {title}',
    dispatchHeading: 'Expedição real e horizonte',
    dispatchLine: (p: DispatchParams) =>
      `${p.dispatched} kg expedidos; ${p.remaining} kg pendentes do compromisso integral. Meta acordada ${p.target} kg; adiados ${p.deferred} kg. ${p.shifts} ${p.shiftCount === 1 ? 'turno' : 'turnos'}; ${p.elapsed} minutos decorridos; ${p.agreement} minutos de acordo.`,
    plantAccounts: 'Contas da planta, em libras esterlinas',
    revenueLine: 'Receita £{revenue}; custos £{costs}.',
    workplaceCredits: 'Créditos ilustrativos do local de trabalho',
    creditsLine: 'Remuneração {wages}; compensação {compensation}; melhorias {improvements}.',
    conservationHeading: 'Conservação e genealogia',
    conservationLine: (p: ConservationParams) =>
      `Erro de material ${p.material} kg; erro de genealogia ${p.genealogy} kg; ${p.manifests} ${p.manifestCount === 1 ? 'romaneio' : 'romaneios'} de expedição.`,
    conductLine:
      'Recusas respeitadas {refusals}; promessas cumpridas {promises}. Objeções acumuladas resolvidas {resolved} de {raised}. Objeções abertas no turno atual {open}.',
    burdensSummary: 'Cargas dos cooperados e comprovantes públicos',
    memberLine:
      '{role}: extra {extra} min; descanso {rest} min; recuperação concedida {recovery} min, devida {owed} min; ganhos {earned}, compensação {compensation} créditos; recusa {refusal}.',
    refusalRespected: 'respeitada',
    refusalNotRecorded: 'não registrada como respeitada',
    shiftNumber: 'Turno {number}',
    noReceipts: 'Nenhum comprovante público guardado para este turno.',
    eventLine: 'Minuto {minute}, {actor}: {detail}',
    downloadReport: 'Baixar o relatório da reprodução com dados ocultados',
    closingNote:
      'As condições de partida coincidem; as trajetórias dos veículos, que dependem dos quadros renderizados, podem diferir entre execuções. Compare o tempo decorrido e o tempo de acordo junto com a expedição. Estes registros descrevem condutas na simulação local. Nenhum vencedor nem pontuação de confiança ou bem-estar é inferido.',

    guideLabel: 'Reprodução guiada',
    guideHeading: 'Reprodução guiada: {section}',
    guideShift:
      'Comece com descanso protegido, informações operacionais compartilhadas e reparação. Mantenha o compromisso com o cliente ou negocie uma entrega parcelada: o adiamento deixa o contrato integral pendente. Selecione um plano real abaixo.',
    guidePractices:
      'O perfil liderado pela coordenação começa com descanso, informação e reparação. O perfil de acordo da equipe acrescenta decisões compartilhadas; o perfil cooperativo acrescenta a governança dos cooperados. A prática opcional de orçamento habilita a melhoria compartilhada da passagem de turno. Use os controles reais de práticas abaixo.',
    guideAgreement:
      'Cada função responde às próprias verificações de entendimento e dá o próprio voto. A cobertura opcional precisa de consentimento separado e revogável. A Qualidade pode recusar sem explicar. Resolva as objeções com o autor original e depois aprove explicitamente o acordo abaixo.',
    guideReview:
      'Confira a expedição real, o descanso protegido, a compensação conquistada e a recuperação concedida. Conclua a recuperação devida antes de guardar esta execução. Volte a Experimento para reproduzir o perfil de equipe ou o cooperativo a partir do mesmo ponto de controle, com um novo acordo.',
    planLine:
      '{title}: ritmo de {pacing}%; {budget} créditos ilustrativos; {rest} min de descanso protegido.',
    planCover:
      ' Até {cover} min de cobertura voluntária a {rate} créditos/min e {recovery} min de recuperação; depois o ritmo protegido é retomado.',
    activeNote:
      'O acordo está ativo. Use os controles do relógio da planta para retomar o jogo real; este guia nunca avança o tempo nem envia decisões.',
    nextSection: 'Próxima seção do guia',
    endGuide: 'Encerrar o guia',
    optionalNavigation:
      'Somente navegação opcional. O guia não fornece votos, verificações, consentimento nem aprovação.',

    resume: 'Retomar a reprodução acordada no ritmo padrão (1x)',
  },
});
