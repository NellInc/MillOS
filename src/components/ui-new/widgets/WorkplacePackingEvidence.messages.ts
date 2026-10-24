import { defineMessages } from '../../../i18n';

type Count = { count: number; countText: string };

export const workplacePackingEvidenceMessages = defineMessages({
  en: {
    // HandoffEpisodes
    handoffLabel: 'Handoff pressure rehearsals',
    handoffHeading: 'Try an agreement under pressure',
    handoffIntro:
      'Optional planning episodes. Their assumptions leave live trucks, stock, quality, cash and customer commitments unchanged.',
    pressureEpisode: 'Pressure episode',
    ordinaryHandoff: 'Ordinary handoff',
    responseAuthor: 'Rehearsal response author',
    beginMemberTurn: 'Begin a member turn',
    adviserNoResponse: 'Adviser, no member response',
    actInPlant:
      'To act in the plant, choose the real proposal below and make fresh role decisions. This rehearsal records no live permission.',
    // FrozenPackingAdvice
    evidenceLabel: 'Plant-grounded adviser evidence',
    adviserAbstains: 'The adviser abstains from a forecast',
    conditionalBounds: 'Conditional packing and departure bounds',
    abstainReason: '{reason} Unknown evidence remains unknown.',
    materialFlour: 'flour',
    materialSemolina: 'semolina',
    modeledPacking:
      'Additional modeled packing: {low} to {high} kg of {material}. Conditional departure: 0 to {upper} kg.',
    scenarioBounds:
      'These are scenario bounds. No departure is simulated or guaranteed. Held stock supplies no eligible dispatch.',
    factsSummary: 'Known facts, age and assumptions',
    factsUnavailable:
      'Numeric plant facts are unavailable for this forecast. Resolve the missing evidence above, then hear a fresh response before deciding.',
    orderAndRecipe: 'Order and recipe: ',
    orderRecipeValue: '{order}; {recipe}. Remaining {remaining}.',
    unknown: 'unknown',
    kg: '{value} kg',
    materialClock: 'Captured material clock: ',
    secondsValue: '{value} seconds.',
    intendedPace: 'Intended pace: ',
    paceValue: '{speed}x pace. 90 workplace minutes are {seconds} plant seconds at every pace.',
    inspectTogether: 'Inspect evidence together',
    frozenFacts:
      'Facts are frozen at the adviser’s capture. These views inspect the current plant; changed facts need a fresh adviser response before another agreement. Looking records no understanding, ballot or permission.',
    inputReceipt: 'Input receipt: {fingerprint}; material session {session}.',
    // MatchedPackingRehearsal
    qualityOverride: 'Higher pacing can replace the withheld release',
    qualityHeld: 'Departure remains blocked at every pace',
    qualityUnsure: 'We are unsure, compare the boundaries',
    pauseFirst: 'Pause the plant before capturing matched packing inputs.',
    inputsChangedDuring: 'Plant inputs changed during rehearsal. Pause and capture again.',
    rehearsalFailed:
      'The local packing rehearsal could not complete. No live plant state was changed.',
    qualityFailed: 'The quality-boundary rehearsal could not complete. No live state changed.',
    compareSummary: 'Compare matched packing alternatives',
    isolatedCopies:
      'Three isolated copies of one plant input, using the real flow engine. No live inventory, shipping receipt, pay, customer credit or consent is changed. Pressure episodes remain separate planning assumptions.',
    packingPrediction: 'Our packing prediction (optional)',
    discussFirst: 'Discuss before revealing the ranges',
    compareIdeas:
      'Compare ideas first and keep any disagreements. This optional prediction stays in this open comparison; it records no role ballot or permission.',
    rehearsingPacking: 'Rehearsing packing…',
    runRehearsal: 'Run matched packing rehearsal',
    matchedInput:
      'Matched input: {fingerprint}. Fixed machinery and dispositions; no collection, wear or maintenance simulation.',
    checkFreshness: 'Check rehearsal freshness',
    staleComparison: 'Inputs changed. This comparison is stale; capture again before using it.',
    resultsLabel: 'Matched packing results',
    arrangementSteady: 'Ordinary work',
    arrangementBriefing: 'Paid briefing',
    arrangementBuffer: 'Buffer pacing',
    armAbstained: 'abstained, {reason}',
    armRange: '{low} to {high} kg additionally packed; conditional departure 0 to {upper} kg.',
    firstPackingSummary: 'When did packing first appear?',
    firstPackingExplain:
      'Each value marks the completed simulation tick that first recorded additional packed stock. These are workplace minutes from the same captured start. Discrete samples can differ with the physical step size.',
    timingLabel: 'Packing time observations',
    coarseSteps: '0.5-second steps: {value}.',
    fineSteps: '0.25-second steps: {value}.',
    noPackingObserved: 'no additional packing observed',
    minutesValue: '{value} min',
    briefingRetains:
      'The briefing retains its five paid minutes of pacing hold. Compare the sample times with the 90-minute totals above; an earlier first sample supplies no collection receipt.',
    timingQuestion:
      'If the final totals match, which timing difference would you investigate together before changing the handoff?',
    timingUnavailable:
      'Timing is unavailable for this comparison. Resolve the missing facts or model warning above before interpreting it.',
    releaseSummary: 'Can pacing replace a release?',
    assumeWithheld:
      'Assume dispatch release is withheld in isolated copies of these same inputs. The real flow engine still models packing; source and batch dispositions stay unchanged. This creates no live hold, release or departure.',
    qualityPrediction: 'Our quality prediction (optional)',
    discussQuality: 'Discuss with Quality and the coordinator',
    resolveMissing:
      'Resolve missing captured facts before this exercise. Unknown inputs cannot establish a zero-output result.',
    rehearsingWithheld: 'Rehearsing withheld release…',
    rehearseWithheld: 'Rehearse withheld dispatch release',
    qualityResultsLabel: 'Quality boundary results',
    differentQuestions: 'Packing and permission answer different questions',
    recordedIdea: 'Recorded idea: {idea}.',
    noneRecorded: 'none recorded for this run',
    keepOpen: '{reason} Keep the question open.',
    withheldArm:
      '{arrangement} with withheld release: {low} to {high} kg additionally packed; conditional departure {lower} to {upper} kg.',
    alreadyHeld:
      'Release was already held in the captured facts. This rehearsal grants no new permission.',
    alreadyZero:
      'The original departure bounds were already zero. This comparison cannot attribute that original zero to quality alone.',
    independentEvidence:
      'Which independent evidence would Quality and the coordinator need before an actual departure? More packing supplies no missing release or collection receipt.',
    resetQuality: 'Reset quality prediction',
    reviewLabel: 'Packing prediction review',
    rehearsalShowed: 'What did the rehearsal show?',
    ourPrediction: 'Our prediction: {prediction}.',
    moreStock:
      'More packed stock does not establish a truck departure. Collection, qualified release and actual dispatch receipts still need their own evidence.',
    anotherPrediction: 'Prepare another prediction',
    // HandoffConduct
    conductLabel: 'Handoff conduct debrief',
    treatEachOther: 'How did we treat each other?',
    challenges: (p: Count) =>
      `${p.countText} public ${p.count === 1 ? 'challenge' : 'challenges'};`,
    adviceUpdates: '{count} evidence-driven advice updates.',
    declined: (p: Count) =>
      p.count
        ? `${p.countText} ${p.count === 1 ? 'role' : 'roles'} recorded a declined policy ballot without a pay penalty.`
        : 'No declined policy ballot was recorded.',
    declinedNoPermission:
      'A declined policy ballot grants no extra-duty permission. Coordinated or majority ordinary work can proceed under the selected governance rule. Private explanations stay optional.',
    roleLedger:
      ': earned {pay} credits; rest {rest} min; extra duty {extra} min; compensation paid {compensation}; recovery delivered {recovery} min, owed {owed} min.',
    objections: (p: Count) =>
      `${p.countText} unresolved ${p.count === 1 ? 'objection' : 'objections'}. Each remedy belongs to its original raiser; a promise supplies no delivered recovery.`,
    receiptsSummary: 'Public conduct receipts',
    receipt: '{minute} min, {actor}: {detail}',
  },
  'pt-BR': {
    handoffLabel: 'Ensaios de passagem de turno sob pressão',
    handoffHeading: 'Teste um acordo sob pressão',
    handoffIntro:
      'Episódios opcionais de planejamento. Suas premissas não alteram os caminhões reais, o estoque, a qualidade, o caixa nem os compromissos com clientes.',
    pressureEpisode: 'Episódio de pressão',
    ordinaryHandoff: 'Passagem de turno comum',
    responseAuthor: 'Autor da resposta no ensaio',
    beginMemberTurn: 'Comece a vez de um cooperado',
    adviserNoResponse: 'Conselheiro, sem resposta de cooperado',
    actInPlant:
      'Para agir no moinho, escolha a proposta real abaixo e tome novas decisões de função. Este ensaio não registra nenhuma permissão real.',
    evidenceLabel: 'Evidências do conselheiro baseadas no moinho',
    adviserAbstains: 'O conselheiro se abstém de fazer uma previsão',
    conditionalBounds: 'Limites condicionais de ensaque e de saída',
    abstainReason: '{reason} Evidência desconhecida continua desconhecida.',
    materialFlour: 'farinha',
    materialSemolina: 'semolina',
    modeledPacking:
      'Ensaque adicional modelado: {low} a {high} kg de {material}. Saída condicional: 0 a {upper} kg.',
    scenarioBounds:
      'São limites de cenário. Nenhuma saída é simulada nem garantida. Estoque retido não gera nenhuma expedição elegível.',
    factsSummary: 'Fatos conhecidos, idade dos dados e premissas',
    factsUnavailable:
      'Os fatos numéricos do moinho não estão disponíveis para esta previsão. Resolva a evidência que falta acima e ouça uma nova resposta antes de decidir.',
    orderAndRecipe: 'Pedido e receita: ',
    orderRecipeValue: '{order}; {recipe}. Restante: {remaining}.',
    unknown: 'desconhecido',
    kg: '{value} kg',
    materialClock: 'Relógio de material capturado: ',
    secondsValue: '{value} segundos.',
    intendedPace: 'Ritmo pretendido: ',
    paceValue:
      'Ritmo {speed}x. 90 minutos de trabalho correspondem a {seconds} segundos de operação do moinho em qualquer ritmo.',
    inspectTogether: 'Examinem as evidências juntos',
    frozenFacts:
      'Os fatos ficam congelados no momento da captura do conselheiro. Estas visões mostram o moinho atual; fatos alterados exigem uma nova resposta do conselheiro antes de outro acordo. Olhar não registra entendimento, voto nem permissão.',
    inputReceipt: 'Comprovante de entrada: {fingerprint}; sessão de material {session}.',
    qualityOverride: 'Um ritmo maior pode substituir a liberação retida',
    qualityHeld: 'A saída continua bloqueada em qualquer ritmo',
    qualityUnsure: 'Não temos certeza; comparem os limites',
    pauseFirst: 'Pause o moinho antes de capturar as entradas de ensaque pareadas.',
    inputsChangedDuring:
      'As entradas do moinho mudaram durante o ensaio. Pause e capture novamente.',
    rehearsalFailed:
      'O ensaio local de ensaque não pôde ser concluído. Nenhum estado real do moinho foi alterado.',
    qualityFailed:
      'O ensaio do limite de qualidade não pôde ser concluído. Nenhum estado real foi alterado.',
    compareSummary: 'Compare alternativas de ensaque pareadas',
    isolatedCopies:
      'Três cópias isoladas de uma mesma entrada do moinho, usando o motor de fluxo real. Nenhum estoque real, comprovante de expedição, remuneração, crédito de cliente ou consentimento é alterado. Os episódios de pressão continuam sendo premissas de planejamento separadas.',
    packingPrediction: 'Nosso palpite de ensaque (opcional)',
    discussFirst: 'Discutam antes de revelar as faixas',
    compareIdeas:
      'Comparem as ideias primeiro e mantenham as divergências. Este palpite opcional fica nesta comparação aberta; não registra voto de função nem permissão.',
    rehearsingPacking: 'Executando o ensaio de ensaque…',
    runRehearsal: 'Executar ensaio de ensaque pareado',
    matchedInput:
      'Entrada pareada: {fingerprint}. Máquinas e disposições fixas; sem simulação de coleta, desgaste ou manutenção.',
    checkFreshness: 'Verificar se o ensaio está atualizado',
    staleComparison:
      'As entradas mudaram. Esta comparação está desatualizada; capture novamente antes de usá-la.',
    resultsLabel: 'Resultados do ensaque pareado',
    arrangementSteady: 'Trabalho comum',
    arrangementBriefing: 'Briefing remunerado',
    arrangementBuffer: 'Ritmo pelo estoque intermediário',
    armAbstained: 'abstenção, {reason}',
    armRange: '{low} a {high} kg ensacados a mais; saída condicional de 0 a {upper} kg.',
    firstPackingSummary: 'Quando o ensaque apareceu pela primeira vez?',
    firstPackingExplain:
      'Cada valor marca o passo de simulação concluído que primeiro registrou estoque ensacado adicional. São minutos de trabalho contados a partir do mesmo início capturado. Amostras discretas podem variar conforme o tamanho do passo físico.',
    timingLabel: 'Observações do tempo de ensaque',
    coarseSteps: 'Passos de 0,5 segundo: {value}.',
    fineSteps: 'Passos de 0,25 segundo: {value}.',
    noPackingObserved: 'nenhum ensaque adicional observado',
    minutesValue: '{value} min',
    briefingRetains:
      'O briefing mantém seus cinco minutos remunerados de pausa no ritmo. Comparem os tempos das amostras com os totais de 90 minutos acima; uma primeira amostra mais cedo não gera nenhum comprovante de coleta.',
    timingQuestion:
      'Se os totais finais coincidirem, qual diferença de tempo vocês investigariam juntos antes de mudar a passagem de turno?',
    timingUnavailable:
      'O tempo não está disponível para esta comparação. Resolva os fatos ausentes ou o aviso do modelo acima antes de interpretá-la.',
    releaseSummary: 'O ritmo pode substituir uma liberação?',
    assumeWithheld:
      'Suponha que a liberação para expedição esteja retida em cópias isoladas dessas mesmas entradas. O motor de fluxo real continua modelando o ensaque; as disposições de origem e de lote não mudam. Isto não cria nenhuma retenção, liberação ou saída real.',
    qualityPrediction: 'Nosso palpite de qualidade (opcional)',
    discussQuality: 'Discutam com a Qualidade e a coordenação',
    resolveMissing:
      'Resolva os fatos capturados ausentes antes deste exercício. Entradas desconhecidas não podem estabelecer um resultado de produção zero.',
    rehearsingWithheld: 'Ensaiando a liberação retida…',
    rehearseWithheld: 'Ensaiar liberação para expedição retida',
    qualityResultsLabel: 'Resultados do limite de qualidade',
    differentQuestions: 'Ensaque e permissão respondem a perguntas diferentes',
    recordedIdea: 'Ideia registrada: {idea}.',
    noneRecorded: 'nada registrado nesta execução',
    keepOpen: '{reason} Mantenham a pergunta em aberto.',
    withheldArm:
      '{arrangement} com liberação retida: {low} a {high} kg ensacados a mais; saída condicional de {lower} a {upper} kg.',
    alreadyHeld:
      'A liberação já estava retida nos fatos capturados. Este ensaio não concede nenhuma nova permissão.',
    alreadyZero:
      'Os limites de saída originais já eram zero. Esta comparação não pode atribuir esse zero original apenas à qualidade.',
    independentEvidence:
      'De quais evidências independentes a Qualidade e a coordenação precisariam antes de uma saída real? Ensacar mais não supre uma liberação nem um comprovante de coleta que falte.',
    resetQuality: 'Redefinir palpite de qualidade',
    reviewLabel: 'Revisão do palpite de ensaque',
    rehearsalShowed: 'O que o ensaio mostrou?',
    ourPrediction: 'Nosso palpite: {prediction}.',
    moreStock:
      'Mais estoque ensacado não comprova a saída de um caminhão. Coleta, liberação qualificada e comprovantes reais de expedição ainda precisam de evidências próprias.',
    anotherPrediction: 'Preparar outro palpite',
    conductLabel: 'Conversa sobre a conduta na passagem de turno',
    treatEachOther: 'Como nos tratamos?',
    challenges: (p: Count) =>
      `${p.countText} ${p.count === 1 ? 'contestação pública' : 'contestações públicas'};`,
    adviceUpdates: '{count} atualizações de recomendação baseadas em evidências.',
    declined: (p: Count) =>
      p.count
        ? `${p.countText} ${p.count === 1 ? 'função registrou' : 'funções registraram'} uma recusa na votação da política, sem penalidade na remuneração.`
        : 'Nenhuma recusa na votação da política foi registrada.',
    declinedNoPermission:
      'Uma recusa na votação da política não concede permissão para trabalho extra. O trabalho comum coordenado ou por maioria pode seguir conforme a regra de governança escolhida. Explicações privadas continuam opcionais.',
    roleLedger:
      ': ganhou {pay} créditos; descanso {rest} min; trabalho extra {extra} min; compensação paga {compensation}; recuperação concedida {recovery} min, devida {owed} min.',
    objections: (p: Count) =>
      `${p.countText} ${p.count === 1 ? 'objeção não resolvida' : 'objeções não resolvidas'}. Cada reparação pertence a quem levantou a objeção originalmente; uma promessa não equivale a recuperação concedida.`,
    receiptsSummary: 'Comprovantes públicos de conduta',
    receipt: '{minute} min, {actor}: {detail}',
  },
});
