import { defineMessages } from '../../../i18n';
import { charterTitle } from '../../../simulation/workplaceCampaign.messages';

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
    // Logic values shown as labels. English returns the value itself, except
    // the approach, whose id is not a word: it reads by the setup form's title.
    sectionLabel: (p: { section: string }) => p.section,
    profileLabel: (p: { profile: string }) => charterTitle('en', p.profile),
    autonomyLabel: (p: Value) => p.value,
    governanceLabel: (p: Value) => p.value,
    aiAuthorityLabel: (p: Value) => p.value,

    // Feedback
    recordedLocally: 'Replay state kept until the page reloads.',
    forgotten: 'Replay checkpoint and reports forgotten.',
    noChange: 'No change.',
    reportDownloaded: 'Redacted run report downloaded locally.',

    // Replay
    title: 'Matched plant replay',
    pauseForCapture: 'Pause plant for capture',
    capturePaused: 'Capture paused plant',
    startGuided: 'Start guided plant replay',
    checkpointLine:
      'Checkpoint: {customer}, {remaining} kg remaining; source stock {source} kg. {stamp}; seed {seed}. Faults: {faults}.',
    none: 'none',
    faultLine: '{machine}: {type}',
    replayCharter: 'Replay {profile} charter',
    retainReview: 'Keep actual run review until reload',
    forget: 'Forget replay checkpoint and reports',
    noCheckpoint: 'No checkpoint yet.',
    unequalHorizons: 'Unequal horizons: elapsed time, agreement time or shifts differ.',
    discussEvidence: 'Discuss the actual replay evidence',
    learningReview: 'Replay learning review',

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
    workplaceCredits: 'Workplace credits',
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

    // Guide
    guideLabel: 'Guided replay',
    guideHeading: 'Guided replay: {section}',
    // One next-step line per guide card (D14).
    guideShift: 'Select a real plan below.',
    guidePractices: 'Use the actual practice controls below.',
    guideAgreement:
      'Resolve objections through their original author, then explicitly approve the agreement below.',
    guideReview: 'Finish owed recovery before retaining this run.',
    planLine: '{title}: {pacing}% pacing; {budget} credits; {rest} min protected rest.',
    planCover:
      ' Up to {cover} min voluntary cover at {rate} credits/min and {recovery} min recovery, then protected pacing resumes.',
    activeNote: 'The agreement is active.',
    nextSection: 'Next guide section',
    endGuide: 'End guide',

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
    profileLabel: (p: { profile: string }) => charterTitle('pt-BR', p.profile),
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

    recordedLocally: 'Estado da reprodução mantido até a página ser recarregada.',
    forgotten: 'Ponto de controle e relatórios da reprodução descartados.',
    noChange: 'Nenhuma alteração.',
    reportDownloaded: 'Relatório da execução com dados ocultados baixado localmente.',

    title: 'Reprodução pareada da planta',
    pauseForCapture: 'Pausar a planta para a captura',
    capturePaused: 'Capturar a planta pausada',
    startGuided: 'Iniciar a reprodução guiada da planta',
    checkpointLine:
      'Ponto de controle: {customer}, {remaining} kg pendentes; estoque de origem {source} kg. {stamp}; semente {seed}. Falhas: {faults}.',
    none: 'nenhuma',
    faultLine: '{machine}: {type}',
    replayCharter: 'Reproduzir estatuto: {profile}',
    retainReview: 'Manter a revisão da execução real até recarregar',
    forget: 'Descartar o ponto de controle e os relatórios da reprodução',
    noCheckpoint: 'Nenhum ponto de controle ainda.',
    unequalHorizons:
      'Horizontes desiguais: o tempo decorrido, o tempo de acordo ou os turnos diferem.',
    discussEvidence: 'Discutir as evidências reais da reprodução',
    learningReview: 'Revisão de aprendizado da reprodução',

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
    workplaceCredits: 'Créditos do local de trabalho',
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

    guideLabel: 'Reprodução guiada',
    guideHeading: 'Reprodução guiada: {section}',
    guideShift: 'Selecione um plano real abaixo.',
    guidePractices: 'Use os controles reais de práticas abaixo.',
    guideAgreement:
      'Resolva as objeções com o autor original e depois aprove explicitamente o acordo abaixo.',
    guideReview: 'Conclua a recuperação devida antes de guardar esta execução.',
    planLine: '{title}: ritmo de {pacing}%; {budget} créditos; {rest} min de descanso protegido.',
    planCover:
      ' Até {cover} min de cobertura voluntária a {rate} créditos/min e {recovery} min de recuperação; depois o ritmo protegido é retomado.',
    activeNote: 'O acordo está ativo.',
    nextSection: 'Próxima seção do guia',
    endGuide: 'Encerrar o guia',

    resume: 'Retomar a reprodução acordada no ritmo padrão (1x)',
  },
});
