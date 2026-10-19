import { defineMessages } from '../i18n';

const sentenceStart = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

export const operationsCampaignMessages = defineMessages({
  en: {
    // Recipes
    recipeStrongWhite: 'Strong white bread flour',
    recipeFineSemolina: 'Fine corn semolina',
    recipeCommunityFlour: 'Community all-purpose flour',

    // Incidents
    bearingOverheatTitle: 'Roller mill bearing overheat',
    bearingOverheatDescription: 'R.M. 101 bearing temperature is rising toward the trip point.',
    dustFilterPressureTitle: 'Dust filter differential pressure',
    dustFilterPressureDescription: 'Extraction resistance is increasing around the sifting floor.',
    powerSagTitle: 'Site power sag',
    powerSagDescription: 'Incoming voltage is unstable and motor protection is limiting load.',
    delayedTruckTitle: 'Delayed dispatch truck',
    delayedTruckDescription:
      'The scheduled collection is delayed, increasing finished goods pressure.',
    supplierContaminationTitle: 'Supplier contamination alert',
    supplierContaminationDescription:
      'A source lot notification requires an immediate hold and traceability review.',
    packagingShortageTitle: 'Packaging material shortage',
    packagingShortageDescription: 'Packer consumables are below the active order requirement.',
    severeRainTitle: 'Severe rain and drainage loading',
    severeRainDescription: 'Yard drainage and the stream are rising, slowing vehicle movements.',
    controlNetworkDegradedTitle: 'Control network degraded',
    controlNetworkDegradedDescription:
      'Redundant control links have fallen below the required availability threshold.',

    // Logbook sources
    sourceRecoveryChallenge: 'Recovery challenge',
    sourceOrderScheduler: 'Order scheduler',
    sourceAutonomousExecution: 'Autonomous execution',
    sourceIncidentController: 'Incident controller',
    sourceDispatchController: 'Dispatch controller',
    sourceProductionExecution: 'Production execution',
    sourceControlLayer: 'Control layer',

    // Logbook messages
    logChallengeAbandoned: 'Challenge abandoned; its incident controls remain active.',
    logProgrammeAccepted:
      'Accepted three 3,000 kg repeat commitments. Existing material and genealogy remain unchanged.',
    logProgrammeInitialized: 'Production programme initialized from equipment and inventory state.',
    logOrderActivated: '{customer}: {recipe} is now the active commitment.',
    logIncidentAcknowledged: '{title} acknowledged.',
    logIncidentMitigated: '{title} mitigated; residual effect halved.',
    logIncidentResolved: '{title} resolved and controls returned to normal.',
    logManifestAllocated:
      '{manifest} allocated {kg} kg of evidenced dispatch across active commitments.',

    // Execution stage messages
    execPlanning: 'Production route planned.',
    execPackedResting:
      'The rest of this order is already packed; the line rests until shipping collects it.',
    execPackedPrestaging:
      'The rest of this order is packed and waits for its truck, so the line has started the next commitment for {customer}.',
    execProcessing: 'Processing {material} for the active recipe.',
    materialWheatGrain: 'wheat grain',
    materialCornGrain: 'corn grain',
    materialScheduledGrain: 'scheduled grain',
    execQualityHold: 'Finished goods are held at the quality gate.',
    execReadyToLoad: 'Released finished goods are ready at the shipping bay.',
    execLoading: 'Shipping load is {loaded} of {capacity} kg.',
    execReadyToDispatch: 'The outbound load is ready for departure.',
    execDispatched: '{kg} kg left the shipping bay.',
    execAllFulfilled:
      'All commitments fulfilled. Accept the next production programme or review the completed period.',
    execFulfilled: 'Commitment fulfilled.',

    // Constraints
    constraintStorageLabel: 'Storage capacity',
    constraintStorageDetail: '{percent}% of material capacity is occupied.',
    constraintFeedLabel: 'Recipe feed unavailable',
    constraintFeedDetail: (p: { material: string }) =>
      `${sentenceStart(p.material)} inventory is empty.`,
    constraintOverdueLabel: 'Commitment overdue',
    constraintDueSoonLabel: 'Commitment due soon',
    constraintOverdueDetail: (p: { customer: string; minutes: string; count: number }) =>
      `${p.customer} is ${p.minutes} simulated minutes overdue.`,
    constraintDueSoonDetail: (p: { customer: string; minutes: string; count: number }) =>
      `${p.minutes} simulated minutes remain for ${p.customer}.`,
    constraintDispatchLabel: 'Dispatch isolated',
    constraintDispatchDetail:
      'An active incident requires the shipping quality gate to remain closed.',
    constraintMaintenanceLabel: 'Maintenance queue',
    constraintMaintenanceDetail: (p: { count: number; countText: string }) =>
      `${p.countText} autonomous work order${p.count === 1 ? '' : 's'} open.`,

    // Period grading
    gradeDispatchReason: '{kg} kg dispatched; net contribution {margin} after recorded costs.',
    gradeRiskReason: (p: { count: number; countText: string }) =>
      `${p.countText} material or deadline risks carried into the next period.`,
    gradeQualityFailureReason:
      '{kg} kg failed the commitment quality threshold; quality failure caps the grade at F.',
    gradeUnsafeReason: 'Unresolved high-severity controls cap the grade at D: {titles}.',
    reportSummaryGood:
      '{kg} kg shipped with nonnegative contribution and controlled carry-over risk.',
  },
  'pt-BR': {
    recipeStrongWhite: 'Farinha de trigo forte para pão',
    recipeFineSemolina: 'Semolina fina de milho',
    recipeCommunityFlour: 'Farinha comunitária multiuso',

    bearingOverheatTitle: 'Superaquecimento de rolamento no moinho de rolos',
    bearingOverheatDescription:
      'A temperatura do rolamento do R.M. 101 está subindo em direção ao ponto de desarme.',
    dustFilterPressureTitle: 'Pressão diferencial do filtro de pó',
    dustFilterPressureDescription:
      'A resistência da exaustão está aumentando no piso de peneiramento.',
    powerSagTitle: 'Queda de tensão na unidade',
    powerSagDescription:
      'A tensão de entrada está instável e a proteção dos motores está limitando a carga.',
    delayedTruckTitle: 'Caminhão de expedição atrasado',
    delayedTruckDescription:
      'A coleta programada está atrasada, aumentando a pressão sobre os produtos acabados.',
    supplierContaminationTitle: 'Alerta de contaminação do fornecedor',
    supplierContaminationDescription:
      'Uma notificação sobre um lote de origem exige retenção imediata e revisão de rastreabilidade.',
    packagingShortageTitle: 'Falta de material de embalagem',
    packagingShortageDescription:
      'Os insumos da ensacadeira estão abaixo do necessário para o pedido ativo.',
    severeRainTitle: 'Chuva forte e sobrecarga da drenagem',
    severeRainDescription:
      'A drenagem do pátio e o córrego estão subindo, o que desacelera a movimentação de veículos.',
    controlNetworkDegradedTitle: 'Rede de controle degradada',
    controlNetworkDegradedDescription:
      'Os links de controle redundantes caíram abaixo do limite de disponibilidade exigido.',

    sourceRecoveryChallenge: 'Desafio de recuperação',
    sourceOrderScheduler: 'Programador de pedidos',
    sourceAutonomousExecution: 'Execução autônoma',
    sourceIncidentController: 'Controlador de ocorrências',
    sourceDispatchController: 'Controlador de expedição',
    sourceProductionExecution: 'Execução da produção',
    sourceControlLayer: 'Camada de controle',

    logChallengeAbandoned: 'Desafio abandonado; os controles da ocorrência continuam ativos.',
    logProgrammeAccepted:
      'Foram aceitos três compromissos recorrentes de 3.000 kg. O material e a genealogia existentes permanecem inalterados.',
    logProgrammeInitialized:
      'Programa de produção inicializado a partir do estado dos equipamentos e do estoque.',
    logOrderActivated: '{customer}: {recipe} agora é o compromisso ativo.',
    logIncidentAcknowledged: 'Ocorrência reconhecida: {title}.',
    logIncidentMitigated: 'Ocorrência mitigada: {title}; efeito residual reduzido à metade.',
    logIncidentResolved: 'Ocorrência resolvida: {title}; controles de volta ao normal.',
    logManifestAllocated:
      '{manifest} alocou {kg} kg de expedição comprovada entre os compromissos ativos.',

    execPlanning: 'Rota de produção planejada.',
    execPackedResting:
      'O restante deste pedido já está ensacado; a linha aguarda até a expedição coletá-lo.',
    execPackedPrestaging:
      'O restante deste pedido está ensacado e aguarda o caminhão, então a linha já começou o próximo compromisso, para {customer}.',
    execProcessing: 'Processando {material} para a receita ativa.',
    materialWheatGrain: 'trigo em grão',
    materialCornGrain: 'milho em grão',
    materialScheduledGrain: 'o grão programado',
    execQualityHold: 'Os produtos acabados estão retidos na barreira de qualidade.',
    execReadyToLoad: 'Os produtos acabados liberados estão prontos na doca de expedição.',
    execLoading: 'A carga de expedição está em {loaded} de {capacity} kg.',
    execReadyToDispatch: 'A carga de saída está pronta para partir.',
    execDispatched: '{kg} kg saíram da doca de expedição.',
    execAllFulfilled:
      'Todos os compromissos foram cumpridos. Aceite o próximo programa de produção ou revise o período concluído.',
    execFulfilled: 'Compromisso cumprido.',

    constraintStorageLabel: 'Capacidade de armazenagem',
    constraintStorageDetail: '{percent}% da capacidade de material está ocupada.',
    constraintFeedLabel: 'Alimentação da receita indisponível',
    constraintFeedDetail: (p: { material: string }) => `O estoque de ${p.material} está vazio.`,
    constraintOverdueLabel: 'Compromisso atrasado',
    constraintDueSoonLabel: 'Compromisso com prazo próximo',
    constraintOverdueDetail: (p: { customer: string; minutes: string; count: number }) =>
      `Compromisso de ${p.customer} atrasado em ${p.minutes} ${p.count === 1 ? 'minuto simulado' : 'minutos simulados'}.`,
    constraintDueSoonDetail: (p: { customer: string; minutes: string; count: number }) =>
      p.count === 1
        ? `Resta ${p.minutes} minuto simulado para ${p.customer}.`
        : `Restam ${p.minutes} minutos simulados para ${p.customer}.`,
    constraintDispatchLabel: 'Expedição isolada',
    constraintDispatchDetail:
      'Uma ocorrência ativa exige que a barreira de qualidade da expedição permaneça fechada.',
    constraintMaintenanceLabel: 'Fila de manutenção',
    constraintMaintenanceDetail: (p: { count: number; countText: string }) =>
      p.count === 1
        ? `${p.countText} ordem de serviço autônoma aberta.`
        : `${p.countText} ordens de serviço autônomas abertas.`,

    gradeDispatchReason:
      '{kg} kg expedidos; contribuição líquida de {margin} após os custos registrados.',
    gradeRiskReason: (p: { count: number; countText: string }) =>
      p.count === 1
        ? `${p.countText} risco de material ou de prazo transferido para o próximo período.`
        : `${p.countText} riscos de material ou de prazo transferidos para o próximo período.`,
    gradeQualityFailureReason:
      '{kg} kg não atingiram o limite de qualidade do compromisso; a falha de qualidade limita a nota a F.',
    gradeUnsafeReason: 'Controles de alta severidade não resolvidos limitam a nota a D: {titles}.',
    reportSummaryGood:
      '{kg} kg expedidos com contribuição não negativa e risco transferido ao próximo período sob controle.',
  },
});
