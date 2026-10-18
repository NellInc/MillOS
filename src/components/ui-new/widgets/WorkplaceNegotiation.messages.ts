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
    stageOfferDetail: '{title}. Earlier willingness grants no new duty.',
    stageChallenge: 'Challenge',
    challengePrevented: 'Boundary protected before any challenge; no objection was resolved.',
    challengeNotRaised: 'No challenge recorded. You can protect the boundary directly.',
    challengeStatus: 'Challenge status: {status}. Packing retains remedy review.',
    stageRevisedTerms: 'Revised terms',
    correctionDone: 'The adviser corrected reused consent. This receipt grants no new permission.',
    correctionPending:
      'Adviser correction still pending. Past agreement cannot supply today’s choices.',
    stageFreshDecisions: 'Fresh decisions',
    freshDecisionsDetail: 'Understanding {understanding}; policy {policy}; optional cover {cover}.',
    stagePhysicalWork: 'Physical work',
    physicalWorkDetail:
      'Dispatch {delivered} / {target} kg; {status}. Changed promises never create delivery.',
    stageRepayment: 'Repayment',
    repaymentDetail: '{paid} credits paid; recovery {delivered} min delivered, {owed} min owed.',
    sectionLabel: 'Thursday negotiation',
    heading: 'Your choices, this shift',
    labelUnderstanding: 'Understanding',
    labelPolicyVote: 'Policy vote',
    labelOptionalCover: 'Optional cover',
    termsOffered:
      'Packing has carried {extra} min of extra duty. This offer permits at most {cover} min, with {rate} credits/min and {recovery} min recovery. These are terms offered, separate from actual payment and recovery.',
    sequenceSummary: 'Offer, choices and receipts',
    sequenceLabel: 'Negotiation sequence',
    adviserProposal: 'Adviser proposal',
    dispatchUncertain:
      'Dispatch remains uncertain until quality-qualified manifests arrive. Supply, inspection and logistics can limit the result. You can challenge my authority in Agreement / Voices; I can raise the same boundary there.',
    shiftFinance:
      'This shift: wages paid {wages} credits; handoff spending {handoff} credits; compensation paid {compensation} credits. Closing cash {cash} credits. Full commitment remaining {remaining} kg.',
    reviewExperiment:
      "This charter's practices remain a valid experiment. Review the actual shortfall and obligations before deciding whether to extend them.",
    proposalLabel: 'Reversible practice proposal',
    proposalHeading: 'A small practice to try',
    proposalScope: '{scope} Keep understanding, the policy vote and optional duty separate.',
    planningOnly:
      'Planning draft only. Local approvals are unfilled; this download grants no live authority.',
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
    stageOfferDetail: '{title}. Uma disposição anterior não cria nenhum dever novo.',
    stageChallenge: 'Contestação',
    challengePrevented:
      'Limite protegido antes de qualquer contestação; nenhuma objeção foi resolvida.',
    challengeNotRaised: 'Nenhuma contestação registrada. Você pode proteger o limite diretamente.',
    challengeStatus: 'Situação da contestação: {status}. O Ensaque mantém a revisão da reparação.',
    stageRevisedTerms: 'Termos revisados',
    correctionDone:
      'O conselheiro corrigiu o consentimento reaproveitado. Este comprovante não concede nenhuma nova permissão.',
    correctionPending:
      'Correção do conselheiro ainda pendente. Um acordo passado não pode substituir as escolhas de hoje.',
    stageFreshDecisions: 'Novas decisões',
    freshDecisionsDetail:
      'Entendimento {understanding}; política {policy}; cobertura opcional {cover}.',
    stagePhysicalWork: 'Trabalho físico',
    physicalWorkDetail:
      'Expedição {delivered} / {target} kg; {status}. Promessas alteradas nunca geram entrega.',
    stageRepayment: 'Ressarcimento',
    repaymentDetail:
      '{paid} créditos pagos; recuperação: {delivered} min concedidos, {owed} min devidos.',
    sectionLabel: 'Negociação de quinta-feira',
    heading: 'Suas escolhas neste turno',
    labelUnderstanding: 'Entendimento',
    labelPolicyVote: 'Votação da política',
    labelOptionalCover: 'Cobertura opcional',
    termsOffered:
      'O Ensaque já assumiu {extra} min de trabalho extra. Esta oferta permite no máximo {cover} min, com {rate} créditos/min e {recovery} min de recuperação. Estes são os termos oferecidos, separados do pagamento e da recuperação efetivos.',
    sequenceSummary: 'Oferta, escolhas e comprovantes',
    sequenceLabel: 'Sequência da negociação',
    adviserProposal: 'Proposta do conselheiro',
    dispatchUncertain:
      'A expedição continua incerta até que cheguem romaneios aprovados pela qualidade. Abastecimento, inspeção e logística podem limitar o resultado. Você pode contestar minha autoridade em Acordo / Vozes; eu posso levantar o mesmo limite lá.',
    shiftFinance:
      'Neste turno: remuneração paga {wages} créditos; gastos da passagem de turno {handoff} créditos; compensação paga {compensation} créditos. Caixa de fechamento {cash} créditos. Compromisso total restante {remaining} kg.',
    reviewExperiment:
      'As práticas deste estatuto continuam sendo um experimento válido. Revise o déficit real e as obrigações antes de decidir se vai estendê-las.',
    proposalLabel: 'Proposta de prática reversível',
    proposalHeading: 'Uma pequena prática para experimentar',
    proposalScope:
      '{scope} Mantenha separados o entendimento, a votação da política e o trabalho opcional.',
    planningOnly:
      'Apenas rascunho de planejamento. As aprovações locais não estão preenchidas; este download não concede nenhuma autoridade efetiva.',
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
    wordBlocked: 'bloqueada',
    wordMet: 'cumprida',
    wordShortfall: 'abaixo do compromisso',
  },
});
