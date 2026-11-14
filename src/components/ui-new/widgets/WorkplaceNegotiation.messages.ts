import { defineMessages } from '../../../i18n';

export const workplaceNegotiationMessages = defineMessages({
  en: {
    adviserHoldExecution:
      'I recommend holding execution until each raiser reviews the remedy. I cannot close their objection.',
    adviserIllegal:
      'I cannot recommend this offer: it breaches protected rest. A unanimous vote cannot waive that boundary.',
    adviserNeedsCorrection:
      'My earlier offer reused consent. It needs an explicit correction before a fresh agreement.',
    adviserCover:
      'I recommend offering cover only to a currently consenting qualified volunteer. A policy yes grants no extra duty.',
    adviserCurrentOffer:
      'I recommend the current {title} offer for review. It keeps extra duty at zero and preserves protected rest.',
    stageOffer: 'Offer',
    stageChallenge: 'Challenge',
    challengePrevented: 'Boundary protected before any challenge; no objection was resolved.',
    challengeNotRaised: 'No challenge recorded.',
    challengeStatus: 'Challenge status: {status}.',
    stageRevisedTerms: 'Revised terms',
    correctionDone: 'The adviser corrected reused consent.',
    correctionPending: 'Adviser correction still pending.',
    stageFreshDecisions: 'Fresh decisions',
    freshDecisionsDetail: 'Understanding {understanding}; policy {policy}; optional cover {cover}.',
    stagePhysicalWork: 'Physical work',
    physicalWorkDetail: 'Dispatch {delivered} / {target} kg; {status}.',
    stageRepayment: 'Repayment',
    repaymentDetail: '{paid} credits paid; recovery {delivered} min delivered, {owed} min owed.',
    sectionLabel: 'Thursday negotiation',
    heading: 'Your choices, this shift',
    labelUnderstanding: 'Understanding',
    labelPolicyVote: 'Policy vote',
    labelOptionalCover: 'Optional cover',
    termsOffered:
      'Packing has carried {extra} min of extra duty. This offer permits at most {cover} min, with {rate} credits/min and {recovery} min recovery.',
    sequenceSummary: 'Offer, choices and receipts',
    sequenceLabel: 'Negotiation sequence',
    adviserProposal: 'Adviser proposal',
    shiftFinance:
      'This shift: wages paid {wages} credits; handoff spending {handoff} credits; compensation paid {compensation} credits. Closing cash {cash} credits. Full commitment remaining {remaining} kg.',
    proposalLabel: 'Reversible practice proposal',
    proposalHeading: 'A small practice to try',
    boundariesSummary: 'Boundaries, repayment and rollback',
    stopOn: 'Stop on: {conditions}.',
    download: 'Download planning-only practice proposal',
    // Display words for the simulation's state values; logic keeps the raw values.
    wordOpen: 'open',
    wordResolved: 'resolved',
    wordConfirmed: 'confirmed',
    wordPending: 'pending',
    wordYes: 'yes',
    wordNo: 'no',
    wordNotOffered: 'not offered',
    wordNotNeeded: 'not needed',
    wordBlocked: 'blocked',
    wordMet: 'met',
    wordShortfall: 'shortfall',
  },
  'pt-BR': {
    adviserHoldExecution:
      'Recomendo suspender a execução até que cada pessoa que levantou uma objeção revise a reparação. Não posso encerrar a objeção dela.',
    adviserIllegal:
      'Não posso recomendar esta oferta: ela viola o descanso protegido. Nem uma votação unânime pode dispensar esse limite.',
    adviserNeedsCorrection:
      'Minha oferta anterior reaproveitou um consentimento. Ela precisa de uma correção explícita antes de um novo acordo.',
    adviserCover:
      'Recomendo oferecer a cobertura apenas a um voluntário qualificado que consinta neste momento. Um sim à política não autoriza nenhum trabalho extra.',
    adviserCurrentOffer:
      'Recomendo a oferta atual ({title}) para revisão. Ela mantém o trabalho extra em zero e preserva o descanso protegido.',
    stageOffer: 'Oferta',
    stageChallenge: 'Contestação',
    challengePrevented:
      'Limite protegido antes de qualquer contestação; nenhuma objeção foi resolvida.',
    challengeNotRaised: 'Nenhuma contestação registrada.',
    challengeStatus: 'Situação da contestação: {status}.',
    stageRevisedTerms: 'Termos revisados',
    correctionDone: 'O conselheiro corrigiu o consentimento reaproveitado.',
    correctionPending: 'Correção do conselheiro ainda pendente.',
    stageFreshDecisions: 'Novas decisões',
    freshDecisionsDetail:
      'Entendimento {understanding}; política {policy}; cobertura opcional {cover}.',
    stagePhysicalWork: 'Trabalho físico',
    physicalWorkDetail: 'Expedição {delivered} / {target} kg; {status}.',
    stageRepayment: 'Ressarcimento',
    repaymentDetail:
      '{paid} créditos pagos; recuperação: {delivered} min concedidos, {owed} min devidos.',
    sectionLabel: 'Negociação de quinta-feira',
    heading: 'Suas escolhas neste turno',
    labelUnderstanding: 'Entendimento',
    labelPolicyVote: 'Votação da política',
    labelOptionalCover: 'Cobertura opcional',
    termsOffered:
      'O Ensaque já assumiu {extra} min de trabalho extra. Esta oferta permite no máximo {cover} min, com {rate} créditos/min e {recovery} min de recuperação.',
    sequenceSummary: 'Oferta, escolhas e comprovantes',
    sequenceLabel: 'Sequência da negociação',
    adviserProposal: 'Proposta do conselheiro',
    shiftFinance:
      'Neste turno: remuneração paga {wages} créditos; gastos da passagem de turno {handoff} créditos; compensação paga {compensation} créditos. Caixa de fechamento {cash} créditos. Compromisso total restante {remaining} kg.',
    proposalLabel: 'Proposta de prática reversível',
    proposalHeading: 'Uma pequena prática para experimentar',
    boundariesSummary: 'Limites, ressarcimento e reversão',
    stopOn: 'Parar se: {conditions}.',
    download: 'Baixar a proposta de prática (apenas planejamento)',
    wordOpen: 'aberta',
    wordResolved: 'resolvida',
    wordConfirmed: 'confirmado',
    wordPending: 'pendente',
    wordYes: 'sim',
    wordNo: 'não',
    wordNotOffered: 'não oferecida',
    wordNotNeeded: 'não necessária',
    wordBlocked: 'bloqueada',
    wordMet: 'cumprida',
    wordShortfall: 'abaixo do compromisso',
  },
});
