import { defineMessages } from '../i18n';

export const workplaceAdviceMessages = defineMessages({
  en: {
    assumptionHorizon:
      '90 workplace minutes; physical seconds = 90 * 60 / selected resume game speed.',
    assumptionEngine:
      'Real material engine at 0.5 and 0.25 physical-second steps; bounds reflect time resolution, not statistical confidence.',
    assumptionFixed:
      'Fixed machinery, recipe, quality interlock and source dispositions. No arrivals, maintenance, dock movements or shipping are simulated.',
    assumptionPacing:
      'Whole-line pacing only; buffer arrangement adds no physical storage capacity.',
    assumptionDispatch:
      'Dispatch lower bound is zero: no departure is simulated. Conditional upper requires release, a compatible truck and available load capacity within the horizon.',
    missingOrder: 'Active order and recipe are unavailable.',
    missingExecution: 'Order execution facts are stale or mismatched.',
    missingSession: 'Mission and material session do not match.',
    missingControls:
      'Finite bounded production controls and a positive resume speed (9 to 3600x) are required.',
    missingClock: 'Material clock is invalid.',
    missingRelease: 'Direct quality release is unavailable.',
    missingLoad: 'Direct dispatch load is unavailable.',
    missingBuffers: 'Required machine buffers are missing.',
    invalidMachines: 'Machine capacity or conversion facts are invalid.',
    invalidConveyors: 'Conveyor facts are invalid.',
    invalidGenealogy: 'Source genealogy is missing, unknown or unbalanced.',
    conservationFailed: 'Engine genealogy conservation failed.',
    rolePacking: 'Packing',
    roleQuality: 'Quality',
    roleMaintenance: 'Maintenance',
    roleCoordinator: 'Coordinator',
    viewPackingFloor: 'View packing floor',
    viewQualityPoint: 'View quality observation point',
    viewMillingLine: 'View milling line',
    viewShippingDock: 'View shipping dock',
    stockFact: 'At capture: {released} kg released; {held} kg held or recalled.',
    stockUnavailable: 'Usable captured stock facts are unavailable.',
    packingQuestion:
      'Ask the coordinator which released bags could actually be collected. Packed stock alone proves no departure.',
    releaseFact: 'Dispatch release at capture: {state}.',
    releaseOpen: 'open',
    releaseHeld: 'held',
    releaseUnknown: 'unknown',
    releaseUnavailable: 'Usable captured release facts are unavailable.',
    qualityQuestionOpen:
      'Which batch and source checks support release, and what new evidence would require a hold? A view cannot certify a batch.',
    qualityQuestionHeld:
      'Which qualified batch or source check is needed before release can be reconsidered? A team vote cannot clear a hold.',
    machineFact: 'At capture: {processing}/{total} machines marked processing.',
    machineUnavailable: 'Usable captured machine facts are unavailable.',
    maintenanceQuestion:
      'Ask Packing where material waits, then check upstream buffers and supply. Processing flags alone do not establish material flow.',
    truckFact: 'Truck at capture: {status}; {loaded} kg loaded / {capacity} kg capacity.',
    truckAway: 'away',
    truckLoading: 'loading',
    truckHeld: 'held',
    truckReady: 'ready',
    truckDeparted: 'departed',
    collectionUnavailable: 'Usable captured collection facts are unavailable.',
    coordinatorQuestion:
      'Check material compatibility, free capacity and collection timing with Quality. A ready load still needs an actual departure receipt.',
    predictionHigher: 'Buffer range entirely above ordinary work',
    predictionOverlap: 'No clear separation between packing ranges',
    predictionLower: 'Buffer range entirely below ordinary work',
    predictionUnsure: 'We are unsure, keep the question open',
    evidenceHigher: 'The buffer’s entire modeled packing range is above ordinary work.',
    evidenceLower: 'The buffer’s entire modeled packing range is below ordinary work.',
    evidenceOverlap:
      'The modeled packing ranges overlap or meet within 0.01 kg. They do not establish a clear ordering.',
    evidenceUnavailable:
      'This rehearsal has insufficient matching evidence to compare the packing ranges.',
    reflectionUnavailable: 'Keep the prediction open until both alternatives have usable evidence.',
    reflectionUnsure: 'We left the prediction open. Use these ranges to discuss what to test next.',
    reflectionSupport: 'These modeled packing ranges support our prediction.',
    reflectionDiffer: 'These modeled packing ranges differ from our prediction.',
    questionUnavailable: 'Which missing fact needs checking before another rehearsal?',
    questionOverlap:
      'Which shared limit could keep extra pacing from adding packed stock? Check supply, machines and quality dispositions together.',
    questionDifference:
      'Which supply, machine or pacing assumption explains the difference, and what would we check before changing the working agreement?',
  },
  'pt-BR': {
    assumptionHorizon:
      '90 minutos de trabalho; segundos físicos = 90 * 60 / velocidade de jogo escolhida para a retomada.',
    assumptionEngine:
      'Motor de material real em passos de 0,5 e 0,25 segundo físico; os limites refletem a resolução temporal, não uma confiança estatística.',
    assumptionFixed:
      'Maquinário, receita, intertravamento de qualidade e disposições de origem fixos. Não se simulam chegadas, manutenção, movimentações na doca nem expedição.',
    assumptionPacing:
      'Apenas ritmo da linha inteira; o arranjo com estoque intermediário não acrescenta capacidade física de armazenagem.',
    assumptionDispatch:
      'O limite inferior de saída é zero: nenhuma saída é simulada. O limite superior condicional exige liberação, um caminhão compatível e capacidade de carga disponível dentro do horizonte.',
    missingOrder: 'O pedido ativo e a receita não estão disponíveis.',
    missingExecution: 'Os fatos de execução do pedido estão desatualizados ou não correspondem.',
    missingSession: 'A missão e a sessão de material não correspondem.',
    missingControls:
      'São necessários controles de produção finitos e dentro dos limites, e uma velocidade de retomada positiva (de 9x a 3.600x).',
    missingClock: 'O relógio de material é inválido.',
    missingRelease: 'A liberação direta de qualidade não está disponível.',
    missingLoad: 'A carga direta de expedição não está disponível.',
    missingBuffers: 'Faltam os estoques intermediários obrigatórios das máquinas.',
    invalidMachines: 'Os fatos de capacidade ou de conversão das máquinas são inválidos.',
    invalidConveyors: 'Os fatos dos transportadores são inválidos.',
    invalidGenealogy: 'A genealogia de origem está ausente, desconhecida ou desbalanceada.',
    conservationFailed: 'A conservação da genealogia no motor falhou.',
    rolePacking: 'Ensaque',
    roleQuality: 'Qualidade',
    roleMaintenance: 'Manutenção',
    roleCoordinator: 'Coordenação',
    viewPackingFloor: 'Ver o setor de ensaque',
    viewQualityPoint: 'Ver o ponto de observação da qualidade',
    viewMillingLine: 'Ver a linha de moagem',
    viewShippingDock: 'Ver a doca de expedição',
    stockFact: 'Na captura: {released} kg liberados; {held} kg retidos ou recolhidos.',
    stockUnavailable: 'Não há fatos de estoque capturados utilizáveis.',
    packingQuestion:
      'Pergunte à coordenação quais sacos liberados poderiam de fato ser coletados. Estoque ensacado, por si só, não comprova nenhuma saída.',
    releaseFact: 'Liberação para expedição na captura: {state}.',
    releaseOpen: 'aberta',
    releaseHeld: 'retida',
    releaseUnknown: 'desconhecida',
    releaseUnavailable: 'Não há fatos de liberação capturados utilizáveis.',
    qualityQuestionOpen:
      'Quais verificações de lote e de origem sustentam a liberação, e que nova evidência exigiria uma retenção? Uma visualização não pode certificar um lote.',
    qualityQuestionHeld:
      'Qual verificação qualificada de lote ou de origem é necessária antes de reconsiderar a liberação? Um voto da equipe não pode suspender uma retenção.',
    machineFact: 'Na captura: {processing}/{total} máquinas marcadas como processando.',
    machineUnavailable: 'Não há fatos de máquinas capturados utilizáveis.',
    maintenanceQuestion:
      'Pergunte ao Ensaque onde o material está esperando e depois verifique os estoques intermediários a montante e o abastecimento. Indicadores de processamento, por si sós, não comprovam fluxo de material.',
    truckFact:
      'Caminhão na captura: {status}; {loaded} kg carregados / {capacity} kg de capacidade.',
    truckAway: 'ausente',
    truckLoading: 'carregando',
    truckHeld: 'retido',
    truckReady: 'pronto',
    truckDeparted: 'saiu',
    collectionUnavailable: 'Não há fatos de coleta capturados utilizáveis.',
    coordinatorQuestion:
      'Verifique com a Qualidade a compatibilidade do material, a capacidade livre e o horário da coleta. Uma carga pronta ainda precisa de um comprovante de saída real.',
    predictionHigher: 'Faixa do estoque intermediário inteiramente acima do trabalho comum',
    predictionOverlap: 'Nenhuma separação clara entre as faixas de ensaque',
    predictionLower: 'Faixa do estoque intermediário inteiramente abaixo do trabalho comum',
    predictionUnsure: 'Não temos certeza; vamos manter a pergunta em aberto',
    evidenceHigher:
      'Toda a faixa de ensaque modelada do estoque intermediário fica acima do trabalho comum.',
    evidenceLower:
      'Toda a faixa de ensaque modelada do estoque intermediário fica abaixo do trabalho comum.',
    evidenceOverlap:
      'As faixas de ensaque modeladas se sobrepõem ou ficam a até 0,01 kg uma da outra. Elas não estabelecem uma ordem clara.',
    evidenceUnavailable:
      'Este ensaio não tem evidências pareadas suficientes para comparar as faixas de ensaque.',
    reflectionUnavailable:
      'Mantenham o palpite em aberto até que as duas alternativas tenham evidências utilizáveis.',
    reflectionUnsure:
      'Deixamos o palpite em aberto. Usem estas faixas para discutir o que testar em seguida.',
    reflectionSupport: 'Estas faixas de ensaque modeladas sustentam nosso palpite.',
    reflectionDiffer: 'Estas faixas de ensaque modeladas divergem do nosso palpite.',
    questionUnavailable: 'Qual fato ausente precisa ser verificado antes de outro ensaio?',
    questionOverlap:
      'Que limite comum poderia impedir que o ritmo extra acrescente estoque ensacado? Verifiquem juntos o abastecimento, as máquinas e as disposições de qualidade.',
    questionDifference:
      'Qual premissa de abastecimento, de máquina ou de ritmo explica a diferença, e o que verificaríamos antes de mudar o acordo de trabalho?',
  },
});
