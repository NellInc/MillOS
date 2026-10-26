import { defineMessages } from '../i18n';

/**
 * Datalinks library copy. Each entry's places to observe it are one
 * newline-separated message, split by the store.
 */
export const knowledgeStoreMessages = defineMessages({
  en: {
    // Loading-screen principles
    quoteTraceEveryLot: 'Trace every lot, state change, alarm, and dispatch.',
    quoteSafeStop: 'A safe stop is part of production, not a failure of it.',
    quoteMotion: 'Motion should reveal process state before decoration.',
    quoteOneWorld: 'One world, one clock, one source of operational truth.',
    quoteAutonomyTrust: 'Autonomy earns trust through legible evidence.',
    quoteAlarmNeeds: 'Every alarm needs a condition, disposition, and recovery path.',
    quoteBoringMill: 'A well-run mill is boring. Boring is the goal.',
    quoteCheckMeasurement: 'Check the measurement, its context, and the action it supports.',
    quoteForklifts: 'If the forklifts are confused, so is the system.',
    authorControl: 'MillOS control principle',
    authorVisual: 'MillOS visual principle',
    authorArchitecture: 'MillOS architecture principle',
    authorAutonomy: 'MillOS autonomy principle',
    authorScada: 'MillOS SCADA principle',
    authorLogistics: 'MillOS logistics principle',
    // Library labels
    alwaysAvailable: 'Available in the autonomous operations library',
    categoryPrinciples: 'Operating Principles',
    categoryPioneers: 'World and Process Lineage',
    categorySystems: 'Control Systems',
    categoryCases: 'Operational Cases',
    // unified-digital-twin
    unifiedDigitalTwinTitle: 'Unified Digital Twin',
    unifiedDigitalTwinTooltip: 'Interior, yard, village, farm, and water share one simulation.',
    unifiedDigitalTwinBrief:
      'The factory and its surroundings share one coordinate system, one clock, and one weather state. There is no seam between inside and out.',
    unifiedDigitalTwinArticle: `## One Continuous Site\n\nMill floor, loading yard, village, farm, stream, and distant terrain are all part of one world. Moving the camera changes what you see, not what is being simulated.\n\nThis means trucks approach the same docks visible from inside. Water flows through the same culvert you can see from the road. Sun, moon, lamps, and process clocks all derive from a single time source. No seams, no duplicated state, no discontinuous lighting.\n\nIt also makes faults easier to find. Positioning, occlusion, route clearance, and depth-layer policies can all be measured in one coordinate system rather than translated between disconnected scenes.`,
    unifiedDigitalTwinSeeInAction: '3D world\nOverview workspace',
    // autonomous-material-flow
    autonomousMaterialFlowTitle: 'Autonomous Material Flow',
    autonomousMaterialFlowTooltip:
      'Source lots remain traceable through silos, mills, sifters, and packers.',
    autonomousMaterialFlowBrief:
      'Every bag of flour can trace its lineage back to the grain that arrived at the dock.',
    autonomousMaterialFlowArticle: `## Causal Material Flow\n\nGrain arrives as a receiving manifest and becomes a source lot. Every transformation — milling, sifting, packing — records what went in, what came out, which machine did it, and when. Dispatch can only load released material. No shortcuts.\n\nThe genealogy balance compares received, in-process, shipped, and lost mass. A discrepancy is a control defect, not a rounding error. Quality holds follow the affected batches rather than applying a blanket penalty to the whole line.\n\nThis gives the SCADA workspace evidence for every major action. A state can be reconstructed from its inputs, not inferred from a dashboard number.`,
    autonomousMaterialFlowSeeInAction: 'SCADA provenance\nBatch genealogy',
    // scada-alarm-lifecycle
    scadaAlarmLifecycleTitle: 'SCADA Alarm Lifecycle',
    scadaAlarmLifecycleTooltip: 'Alarms expose state, acknowledgement, disposition, and recovery.',
    scadaAlarmLifecycleBrief:
      'An alarm is not just a noise. It is a condition, a disposition, a piece of evidence, and a record of who did what about it.',
    scadaAlarmLifecycleArticle: `## Alarm State Is Evidence\n\nEvery alarm records the tag, the limit, the measured value, the priority, the time, and the literal condition. Acknowledging an alarm does not make the process condition go away. Return-to-normal does not excuse you from acknowledging it.\n\nShelving hides an alarm temporarily. Suppression is a deliberate, bounded control decision. Out-of-service means the signal cannot be trusted right now. Each of these requires a name and a reason, so the timeline stays honest.\n\nFlood monitoring counts occurrences over a rolling window. Event history is kept separate from the active alarm list — a cleared symptom should not vanish from operational memory.`,
    scadaAlarmLifecycleSeeInAction: 'SCADA alarms\nEvent history',
    // predictive-maintenance
    predictiveMaintenanceTitle: 'Predictive Maintenance Loop',
    predictiveMaintenanceTooltip:
      'Wear becomes diagnosis, parts demand, repair, verification, and restart.',
    predictiveMaintenanceBrief:
      'Fix things before they break. And when they do break, fix them properly — with parts, evidence, and a controlled restart.',
    predictiveMaintenanceArticle: `## From Signal to Return to Service\n\nTemperature, vibration, load, and wear can raise a predictive alert before anything actually breaks. When something does break, a work order opens with a diagnosed cause and the parts it needs. No parts, no repair — the system will not pretend.\n\nDispatch a service unit from the Predictive Maintenance panel to carry the order through repair and verification. The machine stays locked out until its controlled restart is confirmed, wear is reduced, and it reports ready.\n\nEvery phase transition is recorded. A progress bar cannot claim recovery while the production model still considers the machine critical.`,
    predictiveMaintenanceSeeInAction: 'Predictive maintenance\nSCADA maintenance provenance',
    // batch-quality
    batchQualityTitle: 'Batch Quality and Recall',
    batchQualityTooltip: 'Quality disposition follows exact batches and source lots.',
    batchQualityBrief:
      'Batch holds isolate affected material. Expired certification, unresolved contamination or a failed laboratory result can also block all dispatch.',
    batchQualityArticle: `## Bounded Quality Decisions\n\nA quality test names the batch, source lots, equipment, test type, measurements, and who ordered it. A batch hold stops dispatch of the suspect material while the rest of the line keeps running. A passing retest releases the investigated scope. A recall isolates only what needs isolating.\n\nCertification, unresolved contamination and the latest laboratory result are separate plant-wide dispatch checks. Releasing a batch does not clear those conditions. Resolve them through the QC controls before loading.\n\nThis is more informative than a single quality score that goes up or down. The score still works for trends, but the genealogy and disposition records carry the evidence you actually need to act.`,
    batchQualitySeeInAction: 'Overview batch genealogy\nSCADA quality provenance',
    // autonomous-logistics
    autonomousLogisticsTitle: 'Autonomous Logistics Choreography',
    autonomousLogisticsTooltip:
      'Forklifts, dock doors, trailers, and manifests move as one system.',
    autonomousLogisticsBrief:
      'Forklifts say where they are going and trucks follow a sequence. Nobody cuts in line.',
    autonomousLogisticsArticle: `## Legible Yard Motion\n\nEvery forklift publishes where it is, where it is heading, and when it intends to stop — which is more communication than most warehouse colleagues manage. Conflict prediction checks nearby vehicles and obstacles before anything moves.\n\nTrucks follow a strict choreography: approach, alignment, dock, loading, departure. Dock plates, doors, lamps, and manifests all agree with whichever phase is active. Decorative animation scales with graphics quality, but process-critical state changes remain visible regardless.`,
    autonomousLogisticsSeeInAction: 'Shipping yard\nForklift telemetry',
    // environment-cycle
    environmentCycleTitle: 'Environment and Celestial Cycle',
    environmentCycleTooltip: 'Sky, sun, moon, mountains, windows, lamps, and water share time.',
    environmentCycleBrief:
      'The sky, the lamps, the puddles, and the mountains all answer to the same clock and weather.',
    environmentCycleArticle: `## A Coherent Backdrop\n\nSky, haze, clouds, sun, moon, stars, mountains, window glow, yard lamps, and water all move together rather than on independent timers. When the sun sets, the whole world agrees about it.\n\nDistant ridges hold their silhouette without competing with the factory. The moon and stars arrive as daylight leaves. Weather modifies cloud cover, light contrast, and water character without replacing the world — rain makes it wetter, not different.\n\nStable shader cache keys and bounded per-frame updates keep the cycle continuous without recompilation or allocation churn.`,
    environmentCycleSeeInAction: 'Sky and mountains\nStream and culvert',
    // bottlenecks-and-buffers
    bottlenecksAndBuffersTitle: 'Bottlenecks and Buffers',
    bottlenecksAndBuffersTooltip: 'Watch where material waits before increasing the line speed.',
    bottlenecksAndBuffersBrief:
      'A faster mill helps only when the sifter, packer and loading dock can accept its output. Follow the queue to find the limiting stage.',
    bottlenecksAndBuffersArticle: `## Follow the Waiting Material\n\nStart with the active order in Overview. Its blocker and next action identify whether the line needs grain, processing, a quality disposition, loading or departure. The SCADA process workspace shows the material ledger and dispatch state.\n\nA buffer gives the next stage time to catch up. Full storage or a held batch can stop progress even when the machinery is healthy. Increasing speed before clearing that constraint adds work without completing the customer's delivery.\n\nChanging the recipe selects new grain at the silo valves. Grain and grist already inside the line finish under their original product type and traceability records. Let that work clear; a recipe change cannot turn existing flour into semolina.\n\nTry changing one control at a time. Watch the next stage and the released kilograms, then check whether the order's shipped mass actually increases. A moving conveyor alone is insufficient evidence of a completed order.`,
    bottlenecksAndBuffersSeeInAction: 'Overview commitment\nSCADA Process workspace',
    // resource-tradeoffs
    resourceTradeoffsTitle: 'Energy, Waste and Useful Output',
    resourceTradeoffsTooltip: 'Compare running costs with released and delivered kilograms.',
    resourceTradeoffsBrief:
      'Speed has a cost. Compare energy, waste and delay with the useful flour that reaches the customer.',
    resourceTradeoffsArticle: `## Make the Tradeoff Visible\n\nThe campaign accounts for energy, automation, waste, maintenance, dock delays and late deliveries. Revenue comes from credited customer shipments. The shift debrief puts these costs beside dispatched kilograms and open risks.\n\nA lower line setpoint can give constrained downstream equipment room to recover. Waiting also risks the order's due time. Compare both effects rather than treating maximum speed as the objective.\n\nUse a recovery challenge to observe a bounded power, packaging or control interruption. Read the response's consequence before choosing it. Quality and unresolved serious incidents limit the shift grade even when the financial margin is positive. These are simulator accounts, not a real mill's tariff or food-safety certificate.`,
    resourceTradeoffsSeeInAction: 'Overview recovery challenges\nShift debrief\nSCADA utilities',
    // community-commitments
    communityCommitmentsTitle: 'The Mill and Its Neighbours',
    communityCommitmentsTooltip: 'A completed cooperative order supplies the village bakery.',
    communityCommitmentsBrief:
      'The bakery needs a real flour delivery. Safe, traceable production is a promise to the people who use its output.',
    communityCommitmentsArticle: `## A Delivery Has a Destination\n\nThe Riverside Bakers' Cooperative order links the mill to the village bakery. Its display is stocked only after the campaign records a fulfilled flour order with shipment evidence. The display is a visual response to that delivery; it does not create another quantity of flour in the ledger.\n\nThe school-meals and pasta commitments have their own recipes, deadlines and shipments. Finishing one customer's order does not supply every shop in the world. Read the active customer and the remaining kilograms before changing the recipe.\n\nVillage residents retain ordinary walks, work and tea breaks. Mill tasks respond to equipment, maintenance and quality conditions. A safety stop holds personnel in their current positions while automated egress verification checks the site; it does not certify a worker evacuation.`,
    communityCommitmentsSeeInAction:
      'Overview customer orders\nVillage bakery\nSafety egress verification',
    // depth-and-material-policy
    depthAndMaterialPolicyTitle: 'Depth and Material Policy',
    depthAndMaterialPolicyTooltip:
      'Shared layers and explicit colour spaces prevent visual instability.',
    depthAndMaterialPolicyBrief:
      'Surfaces do not fight for the same pixel. Explicit depth and colour-space contracts keep them honest.',
    depthAndMaterialPolicyArticle: `## Stable Surfaces\n\nExterior ground surfaces share one elevation and use polygon offset to sort themselves. Floor markings disable depth writes. Decals use bounded offsets. Camera near and far planes preserve depth precision across the whole site.\n\nProcedural albedo textures declare sRGB colour space. Normal, roughness, metalness, and height maps stay linear. Getting this wrong makes cobblestones glow or gives metal the sheen of wet soap — neither is a good look.\n\nThese contracts prevent flicker, washed-out colour, mirror-smooth roughness failures, and the seams that appear when surfaces are separated by guesswork.`,
    depthAndMaterialPolicySeeInAction: 'Factory floor\nRoads and stream banks',
    // autonomous-evidence
    autonomousEvidenceTitle: 'Autonomous Evidence and Replay',
    autonomousEvidenceTooltip:
      'Every decision carries observations, assumptions, alternatives, and expected effect.',
    autonomousEvidenceBrief:
      'Autonomy is trustworthy when you can ask it why. Every decision carries its evidence.',
    autonomousEvidenceArticle: `## Legible Autonomy\n\nTrust requires transparency. Every autonomous decision captures its telemetry, timestamp, assumptions, alternatives, expected effect, and the equipment in scope. You can always ask why.\n\nThe replay ledger samples machine state, alerts, and vehicle positions without credentials or personal data. Commands are stored separately from frames, so a review can tell what happened from what requested it.\n\nConfidence comes with reasoning attached, not as an unexplained percentage. When evidence does not justify intervention, the system holds steady rather than guessing.`,
    autonomousEvidenceSeeInAction: 'AI Command Centre\nDecision replay',
  },
  'pt-BR': {
    // Loading-screen principles
    quoteTraceEveryLot: 'Rastreie cada lote, mudança de estado, alarme e expedição.',
    quoteSafeStop: 'Uma parada segura faz parte da produção, não é uma falha dela.',
    quoteMotion: 'O movimento deve mostrar o estado do processo antes de servir de decoração.',
    quoteOneWorld: 'Um mundo, um relógio, uma única fonte de verdade operacional.',
    quoteAutonomyTrust: 'A autonomia conquista confiança com evidências legíveis.',
    quoteAlarmNeeds:
      'Todo alarme precisa de uma condição, um tratamento e um caminho de recuperação.',
    quoteBoringMill: 'Um moinho bem operado é monótono. A monotonia é o objetivo.',
    quoteCheckMeasurement: 'Confira a medição, o contexto dela e a ação que ela sustenta.',
    quoteForklifts: 'Se as empilhadeiras estão confusas, o sistema também está.',
    authorControl: 'Princípio de controle do MillOS',
    authorVisual: 'Princípio visual do MillOS',
    authorArchitecture: 'Princípio de arquitetura do MillOS',
    authorAutonomy: 'Princípio de autonomia do MillOS',
    authorScada: 'Princípio SCADA do MillOS',
    authorLogistics: 'Princípio de logística do MillOS',
    // Library labels
    alwaysAvailable: 'Disponível na biblioteca de operações autônomas',
    categoryPrinciples: 'Princípios de operação',
    categoryPioneers: 'Linhagem do mundo e do processo',
    categorySystems: 'Sistemas de controle',
    categoryCases: 'Casos operacionais',
    // unified-digital-twin
    unifiedDigitalTwinTitle: 'Gêmeo digital unificado',
    unifiedDigitalTwinTooltip:
      'Interior, pátio, vila, fazenda e água compartilham uma única simulação.',
    unifiedDigitalTwinBrief:
      'A fábrica e seus arredores compartilham um único sistema de coordenadas, um único relógio e uma única condição climática. Não há emenda entre o lado de dentro e o de fora.',
    unifiedDigitalTwinArticle: `## Um local contínuo\n\nChão do moinho, pátio de carga, vila, fazenda, riacho e terreno distante fazem parte de um único mundo. Mover a câmera muda o que você vê, não o que está sendo simulado.\n\nIsso significa que os caminhões se aproximam das mesmas docas que você vê de dentro. A água corre pelo mesmo bueiro que você vê da estrada. Sol, lua, lâmpadas e relógios de processo derivam todos de uma única fonte de tempo. Sem emendas, sem estado duplicado, sem iluminação descontínua.\n\nIsso também facilita encontrar falhas. Posicionamento, oclusão, folga das rotas e políticas de camadas de profundidade podem ser medidos em um único sistema de coordenadas, em vez de convertidos entre cenas desconectadas.`,
    unifiedDigitalTwinSeeInAction: 'Mundo 3D\nEspaço de trabalho da Visão geral',
    // autonomous-material-flow
    autonomousMaterialFlowTitle: 'Fluxo autônomo de material',
    autonomousMaterialFlowTooltip:
      'Os lotes de origem continuam rastreáveis pelos silos, moinhos de rolos, plansifters e ensacadeiras.',
    autonomousMaterialFlowBrief:
      'Cada saco de farinha pode ter a origem rastreada até o grão que chegou à doca.',
    autonomousMaterialFlowArticle: `## Fluxo causal de material\n\nO grão chega como um romaneio de recebimento e se torna um lote de origem. Cada transformação — moagem, peneiramento, ensaque — registra o que entrou, o que saiu, qual máquina fez o trabalho e quando. A expedição só pode carregar material liberado. Sem atalhos.\n\nO balanço da genealogia compara a massa recebida, em processo, expedida e perdida. Uma discrepância é um defeito de controle, não um erro de arredondamento. As retenções de qualidade acompanham os lotes afetados, em vez de aplicar uma penalidade geral à linha inteira.\n\nIsso dá ao espaço de trabalho SCADA evidências para cada ação importante. Um estado pode ser reconstruído a partir das suas entradas, e não deduzido de um número no painel.`,
    autonomousMaterialFlowSeeInAction: 'Procedência no SCADA\nGenealogia dos lotes',
    // scada-alarm-lifecycle
    scadaAlarmLifecycleTitle: 'Ciclo de vida dos alarmes SCADA',
    scadaAlarmLifecycleTooltip:
      'Os alarmes mostram estado, reconhecimento, tratamento e recuperação.',
    scadaAlarmLifecycleBrief:
      'Um alarme não é só um barulho. É uma condição, um tratamento, uma evidência e um registro de quem fez o quê a respeito.',
    scadaAlarmLifecycleArticle: `## O estado do alarme é evidência\n\nCada alarme registra a tag, o limite, o valor medido, a prioridade, o horário e a condição literal. Reconhecer um alarme não faz a condição do processo desaparecer. O retorno ao normal não dispensa você de reconhecê-lo.\n\nColocar em espera oculta um alarme temporariamente. A supressão é uma decisão de controle deliberada e delimitada. Fora de serviço significa que, no momento, o sinal não é confiável. Cada uma dessas ações exige um nome e um motivo, para que a linha do tempo continue honesta.\n\nO monitoramento de avalanches de alarmes conta ocorrências em uma janela móvel. O histórico de eventos fica separado da lista de alarmes ativos — um sintoma resolvido não deve sumir da memória operacional.`,
    scadaAlarmLifecycleSeeInAction: 'Alarmes do SCADA\nHistórico de eventos',
    // predictive-maintenance
    predictiveMaintenanceTitle: 'Ciclo de manutenção preditiva',
    predictiveMaintenanceTooltip:
      'O desgaste vira diagnóstico, demanda de peças, reparo, verificação e religamento.',
    predictiveMaintenanceBrief:
      'Conserte as coisas antes que quebrem. E, quando quebrarem, conserte direito — com peças, evidências e um religamento controlado.',
    predictiveMaintenanceArticle: `## Do sinal ao retorno à operação\n\nTemperatura, vibração, carga e desgaste podem gerar um alerta preditivo antes que algo realmente quebre. Quando algo quebra, abre-se uma ordem de serviço com a causa diagnosticada e as peças necessárias. Sem peças, sem reparo — o sistema não vai fingir.\n\nDespache uma unidade de serviço pelo painel Manutenção preditiva para levar a ordem até o reparo e a verificação. A máquina fica bloqueada até que o religamento controlado seja confirmado, o desgaste seja reduzido e ela informe que está pronta.\n\nCada transição de fase fica registrada. Uma barra de progresso não pode alegar recuperação enquanto o modelo de produção ainda considera a máquina crítica.`,
    predictiveMaintenanceSeeInAction: 'Manutenção preditiva\nProcedência da manutenção no SCADA',
    // batch-quality
    batchQualityTitle: 'Qualidade de lotes e recolhimento',
    batchQualityTooltip:
      'A destinação de qualidade acompanha exatamente os lotes produzidos e os lotes de origem.',
    batchQualityBrief:
      'Retenções de lote isolam o material afetado. Certificação vencida, contaminação não resolvida ou resultado de laboratório reprovado também podem bloquear toda a expedição.',
    batchQualityArticle: `## Decisões de qualidade delimitadas\n\nUm teste de qualidade identifica o lote, os lotes de origem, o equipamento, o tipo de teste, as medições e quem o solicitou. Uma retenção de lote interrompe a expedição do material suspeito enquanto o restante da linha continua funcionando. Um reteste aprovado libera o escopo investigado. Um recolhimento isola apenas o que precisa ser isolado.\n\nA certificação, a contaminação não resolvida e o resultado de laboratório mais recente são verificações separadas de expedição para toda a planta. Liberar um lote não resolve essas condições. Resolva-as pelos controles do CQ antes do carregamento.\n\nIsso informa mais do que uma única nota de qualidade que sobe ou desce. A nota continua útil para tendências, mas os registros de genealogia e de destinação trazem as evidências de que você realmente precisa para agir.`,
    batchQualitySeeInAction:
      'Genealogia dos lotes na Visão geral\nProcedência da qualidade no SCADA',
    // autonomous-logistics
    autonomousLogisticsTitle: 'Coreografia logística autônoma',
    autonomousLogisticsTooltip:
      'Empilhadeiras, portas das docas, carretas e romaneios se movem como um único sistema.',
    autonomousLogisticsBrief:
      'As empilhadeiras avisam para onde vão e os caminhões seguem uma sequência. Ninguém fura a fila.',
    autonomousLogisticsArticle: `## Movimento legível no pátio\n\nCada empilhadeira informa onde está, para onde vai e quando pretende parar — o que é mais comunicação do que a maioria dos colegas de armazém consegue. A previsão de conflitos verifica veículos e obstáculos próximos antes que qualquer coisa se mova.\n\nOs caminhões seguem uma coreografia rigorosa: aproximação, alinhamento, docagem, carregamento, saída. Niveladoras de doca, portas, lâmpadas e romaneios concordam com a fase que estiver ativa. A animação decorativa acompanha a qualidade gráfica, mas as mudanças de estado críticas para o processo continuam visíveis em qualquer caso.`,
    autonomousLogisticsSeeInAction: 'Pátio de expedição\nTelemetria das empilhadeiras',
    // environment-cycle
    environmentCycleTitle: 'Ambiente e ciclo celeste',
    environmentCycleTooltip:
      'Céu, sol, lua, montanhas, janelas, lâmpadas e água seguem o mesmo relógio.',
    environmentCycleBrief:
      'O céu, as lâmpadas, as poças e as montanhas obedecem ao mesmo relógio e ao mesmo clima.',
    environmentCycleArticle: `## Um cenário coerente\n\nCéu, névoa, nuvens, sol, lua, estrelas, montanhas, brilho das janelas, lâmpadas do pátio e água se movem juntos, e não em temporizadores independentes. Quando o sol se põe, o mundo inteiro concorda.\n\nAs cristas distantes mantêm a silhueta sem competir com a fábrica. A lua e as estrelas chegam quando a luz do dia vai embora. O clima altera a cobertura de nuvens, o contraste da luz e o aspecto da água sem substituir o mundo — a chuva o deixa mais molhado, não diferente.\n\nChaves estáveis de cache de shaders e atualizações por quadro delimitadas mantêm o ciclo contínuo, sem recompilação nem excesso de alocações de memória.`,
    environmentCycleSeeInAction: 'Céu e montanhas\nRiacho e bueiro',
    // bottlenecks-and-buffers
    bottlenecksAndBuffersTitle: 'Gargalos e estoques intermediários',
    bottlenecksAndBuffersTooltip:
      'Observe onde o material fica esperando antes de aumentar a velocidade da linha.',
    bottlenecksAndBuffersBrief:
      'Um moinho mais rápido só ajuda quando o plansifter, a ensacadeira e a doca de carga conseguem receber o que ele produz. Siga a fila para encontrar a etapa limitante.',
    bottlenecksAndBuffersArticle: `## Siga o material que espera\n\nComece pelo pedido ativo na Visão geral. O bloqueio e a próxima ação dele indicam se a linha precisa de grão, de processamento, de uma destinação de qualidade, de carregamento ou de saída. O espaço de trabalho de processo do SCADA mostra o livro-razão de material e o estado da expedição.\n\nUm estoque intermediário dá à etapa seguinte tempo para alcançar o ritmo. Armazenamento cheio ou um lote retido podem parar o avanço mesmo quando o maquinário está saudável. Aumentar a velocidade antes de resolver essa restrição acrescenta trabalho sem concluir a entrega do cliente.\n\nMudar a receita seleciona novo grão nas válvulas dos silos. O grão e o produto em moagem que já estão dentro da linha terminam com o tipo de produto e os registros de rastreabilidade originais. Deixe esse trabalho escoar; uma mudança de receita não transforma farinha já produzida em semolina.\n\nTente mudar um controle de cada vez. Observe a etapa seguinte e os quilos liberados e depois verifique se a massa expedida do pedido realmente aumenta. Um transportador em movimento, sozinho, não é evidência suficiente de um pedido concluído.`,
    bottlenecksAndBuffersSeeInAction:
      'Compromisso na Visão geral\nEspaço de trabalho de Processo do SCADA',
    // resource-tradeoffs
    resourceTradeoffsTitle: 'Energia, desperdício e produção útil',
    resourceTradeoffsTooltip: 'Compare os custos de operação com os quilos liberados e entregues.',
    resourceTradeoffsBrief:
      'Velocidade tem custo. Compare energia, desperdício e atraso com a farinha útil que chega ao cliente.',
    resourceTradeoffsArticle: `## Deixe o custo-benefício visível\n\nA campanha contabiliza energia, automação, desperdício, manutenção, atrasos na doca e entregas atrasadas. A receita vem das expedições creditadas aos clientes. O balanço do turno coloca esses custos ao lado dos quilos expedidos e dos riscos em aberto.\n\nUm setpoint de linha mais baixo pode dar folga para o equipamento restrito a jusante se recuperar. Esperar também põe em risco o prazo do pedido. Compare os dois efeitos em vez de tratar a velocidade máxima como objetivo.\n\nUse um desafio de recuperação para observar uma interrupção delimitada de energia, embalagem ou controle. Leia a consequência de cada resposta antes de escolhê-la. A qualidade e ocorrências graves não resolvidas limitam a nota do turno mesmo quando a margem financeira é positiva. Estas são contas do simulador, não a tarifa de um moinho real nem um certificado de segurança de alimentos.`,
    resourceTradeoffsSeeInAction:
      'Desafios de recuperação na Visão geral\nBalanço do turno\nUtilidades no SCADA',
    // community-commitments
    communityCommitmentsTitle: 'O moinho e seus vizinhos',
    communityCommitmentsTooltip: 'Um pedido cooperativo concluído abastece a padaria da vila.',
    communityCommitmentsBrief:
      'A padaria precisa de uma entrega real de farinha. Uma produção segura e rastreável é uma promessa às pessoas que usam o que ela produz.',
    communityCommitmentsArticle: `## Uma entrega tem destino\n\nO pedido da Riverside Bakers' Cooperative liga o moinho à padaria da vila. A vitrine da padaria só é abastecida depois que a campanha registra um pedido de farinha atendido, com evidência de expedição. A vitrine é uma resposta visual a essa entrega; ela não cria mais nenhuma quantidade de farinha no livro-razão.\n\nOs compromissos de merenda escolar e de massas têm receitas, prazos e expedições próprios. Concluir o pedido de um cliente não abastece todas as lojas do mundo. Confira o cliente ativo e os quilos restantes antes de mudar a receita.\n\nOs moradores da vila mantêm as caminhadas, o trabalho e as pausas para o chá de sempre. As tarefas do moinho respondem às condições dos equipamentos, da manutenção e da qualidade. Uma parada de segurança mantém as pessoas nas posições em que estão enquanto a verificação automatizada das rotas de saída confere o local; ela não certifica uma evacuação de trabalhadores.`,
    communityCommitmentsSeeInAction:
      'Pedidos de clientes na Visão geral\nPadaria da vila\nVerificação das rotas de saída em Segurança',
    // depth-and-material-policy
    depthAndMaterialPolicyTitle: 'Política de profundidade e materiais',
    depthAndMaterialPolicyTooltip:
      'Camadas compartilhadas e espaços de cor explícitos evitam instabilidade visual.',
    depthAndMaterialPolicyBrief:
      'As superfícies não disputam o mesmo pixel. Contratos explícitos de profundidade e de espaço de cor as mantêm honestas.',
    depthAndMaterialPolicyArticle: `## Superfícies estáveis\n\nAs superfícies externas do chão compartilham uma única elevação e usam polygon offset para se ordenar. As marcações do piso desativam a escrita de profundidade. Os decalques usam deslocamentos delimitados. Os planos near e far da câmera preservam a precisão de profundidade em todo o local.\n\nAs texturas procedurais de albedo declaram o espaço de cor sRGB. Os mapas de normal, rugosidade, metalicidade e altura permanecem lineares. Errar nisso faz os paralelepípedos brilharem ou dá ao metal o brilho de sabão molhado — nenhum dos dois fica bonito.\n\nEsses contratos evitam cintilação, cores desbotadas, falhas de rugosidade espelhada e as emendas que aparecem quando as superfícies são separadas no chute.`,
    depthAndMaterialPolicySeeInAction: 'Chão de fábrica\nEstradas e margens do riacho',
    // autonomous-evidence
    autonomousEvidenceTitle: 'Evidências autônomas e reprodução',
    autonomousEvidenceTooltip:
      'Cada decisão traz observações, premissas, alternativas e o efeito esperado.',
    autonomousEvidenceBrief:
      'A autonomia é confiável quando você pode perguntar o porquê. Cada decisão traz suas evidências.',
    autonomousEvidenceArticle: `## Autonomia legível\n\nConfiança exige transparência. Cada decisão autônoma registra sua telemetria, o horário, as premissas, as alternativas, o efeito esperado e os equipamentos no escopo. Você sempre pode perguntar por quê.\n\nO registro de reprodução amostra o estado das máquinas, os alertas e as posições dos veículos sem credenciais nem dados pessoais. Os comandos ficam armazenados separados dos quadros, para que uma revisão consiga distinguir o que aconteceu daquilo que o solicitou.\n\nO nível de confiança vem acompanhado do raciocínio, e não como uma porcentagem sem explicação. Quando as evidências não justificam uma intervenção, o sistema se mantém estável em vez de adivinhar.`,
    autonomousEvidenceSeeInAction: 'Central de comando de IA\nReprodução da decisão',
  },
});
