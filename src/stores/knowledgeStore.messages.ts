import { defineMessages } from '../i18n';

/**
 * Datalinks library copy. Each entry's places to observe it are one
 * newline-separated message, split by the store.
 */
export const knowledgeStoreMessages = defineMessages({
  en: {
    historyUnlock: 'Unlocked by an event in the Mill Chronicle',
    farmLessonUnlock: 'Unlocked by finishing the henhouse inspection on the farm',
    windmillNoteUnlock:
      'Unlocked by the farm windmill’s lesson, or by a wind turbine in the Mill Chronicle',
    // farm-henhouse: the henhouse inspection's own copy (ProcessInspectionCard.messages.ts).
    // Source, read 2026-11-13: Defra, Code of Practice for the Welfare of Laying Hens and
    // Pullets (2018), paras 130-131 (nests a separate, secluded space for laying), the Five
    // Freedoms and para 94 (fresh water, feed), 129 (perches for roosting), 42 (no sudden
    // movement near the birds). assets.publishing.service.gov.uk/media/5b69652be5274a1518c298db
    farmHenhouseTitle: 'The Henhouse',
    farmHenhouseTooltip: 'Nests, feed and water, perches, and gentle collection.',
    farmHenhouseBrief: 'What the farm henhouse gives its hens, and how the eggs are collected.',
    farmHenhouseArticle: `## The Henhouse\n\nNesting boxes provide a sheltered place for hens to lay eggs.\n\nFeed and fresh water support the hens each day.\n\nPerches give hens a raised place to rest.\n\nCollect eggs gently from the nests, keeping movement calm around the hens.`,
    farmHenhouseSeeInAction: 'Farm henhouse',
    // Loading-screen facts (D14): each worded as the milling article that
    // cites the same source, with its hedge; the source is in LOADING_FACTS.
    factExplosibleDust:
      'Flour is an explosible dust: in air at the right concentration and confined, it explodes violently when lit.',
    factStaticSpark:
      'The spark that lights a dust cloud can be as small as the static from pulling off a synthetic jumper.',
    factSecondaryBlast:
      'A weak first dust explosion can lift settled dust and set off very powerful secondary ones.',
    factExtraction:
      'About 70 to 75% of the grain becomes flour; the rest leaves largely as animal feed.',
    factTempering:
      'Tempering brings clean wheat to approximately 15% moisture, then rests it for 2 to 24 hours.',
    factRolls: 'Corrugated rolls break the wheat; smooth rolls reduce the middlings into flour.',
    factStreams:
      'Very white flours come from the early streams only; wholemeal blends every stream back together.',
    factFallingNumber:
      'A high falling number, for example above 300 seconds, means sound grain; a low one, for example below 250, sprouted wheat.',
    factIntake: 'UK mills test protein, the Hagberg Falling Number and moisture as wheat arrives.',
    // Library labels
    alwaysAvailable: 'Available in the autonomous operations library',
    historySeeInAction: 'Mill Chronicle',
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
    resourceTradeoffsSeeInAction:
      'Overview recovery challenges\nShift debrief\nEnergy dashboard line rate',
    // community-commitments
    communityCommitmentsTitle: 'The Mill and Its Neighbours',
    communityCommitmentsTooltip: 'A completed cooperative order supplies the village bakery.',
    communityCommitmentsBrief:
      'The bakery needs a real flour delivery. Safe, traceable production is a promise to the people who use its output.',
    communityCommitmentsArticle: `## A Delivery Has a Destination\n\nThe Riverside Bakers' Cooperative order links the mill to the village bakery. Its display is stocked only after the campaign records a fulfilled flour order with shipment evidence. The display is a visual response to that delivery; it does not create another quantity of flour in the ledger.\n\nThe school-meals and polenta commitments have their own recipes, deadlines and shipments. Finishing one customer's order does not supply every shop in the world. Read the active customer and the remaining kilograms before changing the recipe.\n\nVillage residents retain ordinary walks, work and tea breaks. Mill tasks respond to equipment, maintenance and quality conditions. A safety stop holds personnel in their current positions while automated egress verification checks the site; it does not certify a worker evacuation.`,
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
    // How a flour mill works. Sources for every fact: millingSources.ts.
    categoryMilling: 'How Flour Is Milled',
    // milling-cleaning-tempering
    millingCleaningTemperingTitle: 'Cleaning and Tempering',
    millingCleaningTemperingTooltip: 'Clean the wheat, then dampen and rest it before the rolls.',
    millingCleaningTemperingBrief:
      'Before milling, wheat is cleaned of metal, stones and other seeds, then tempered: water is added and the grain rests, so the bran toughens and the endosperm mellows.',
    millingCleaningTemperingArticle: `## Before the First Break\n\nWheat reaches the mill carrying things that must not reach the rolls. The cleaning house takes them out in stages: a magnetic separator removes iron and steel, screens remove stones and sticks, air currents lift off lighter impurities, disc separators remove barley, oats and other seeds, and a scourer rubs off what is left on the grain.\n\nThe clean wheat is then tempered, which millers also call conditioning. Water is added to bring its moisture to approximately 15%, and the grain stands for 2 to 24 hours so the water can work into the kernel. Soft wheats need less water and less time than hard wheats.\n\nTempering toughens the bran, so it comes away in large flakes instead of breaking up into the flour, and it softens the endosperm so it reduces more easily on the rolls.\n\n## At This Mill\n\nThis mill tempers every lot to approximately 15% from its intake reading and rests it for 2 hours, the shortest rest in that range. In a wet crop year the wheat comes in above the target, and once a shift the AI partner asks whether to dry it first. Dried wheat mills without the wet year's quality loss; the drying is paid for in energy, and the dried wheat reaches the rolls after its 2-hour rest.`,
    millingCleaningTemperingSeeInAction:
      'Silo cutaway\nSCADA Process workspace\nAI Partner, Decisions: Tempering (wet crop years)',
    // milling-break-reduction
    millingBreakReductionTitle: 'Break and Reduction',
    millingBreakReductionTooltip: 'Fluted rolls open the grain; smooth rolls grind it to flour.',
    millingBreakReductionBrief:
      'Fluted break rolls shear the grain open and part the endosperm from the bran. Smooth reduction rolls then grind that endosperm, step by step, into flour.',
    millingBreakReductionArticle: `## Two Kinds of Roll\n\nIn the break system, pairs of fluted (corrugated) rolls shear the grain open gradually, opening it rather than pulverising it. After each pair the stock is sifted: the finest is taken off as flour, and the coarsest goes on to the next break, whose flutes are finer and whose gap is closer.\n\nThe two rolls of a pair turn at different speeds, and the ratio of the fast roll's speed to the slow roll's is the differential. One maker's patent puts break rolls typically at {breakLow} to {breakHigh} to 1, names {breakBest} to 1 as the best ratio for its break rolls, and puts smooth rolls at {reductionLow} to {reductionHigh} to 1. The fluted pair in the roller mill cutaway runs at {breakBest} to 1.\n\nIn the reduction system, the purified middlings pass between smooth rolls, each pair set finer than the last, with flour sifted out after each one. Some particles pass through just one break and one reduction roll; those closer to the bran and germ pass through several. Raising the differential on smooth rolls raises starch damage, water absorption and milling energy, and the flour's ash and colour get worse.`,
    millingBreakReductionSeeInAction: 'Roller mill cutaway\nMilling floor',
    // milling-purifiers
    millingPurifiersTitle: 'Purifiers',
    millingPurifiersTooltip: 'Air and sieves take fine bran out of the middlings.',
    millingPurifiersBrief:
      'Between the break and reduction rolls, purifiers sift the middlings again while air currents draw off small, light bran, so cleaner endosperm goes on to be ground.',
    millingPurifiersArticle: `## Cleaning the Middlings\n\nThe break rolls leave a mix. Coarse pieces of endosperm, called middlings, come out with small flakes of bran among them, some still attached. Sifters and purifiers sort this stock by particle size and density.\n\nIn a purifier the middlings are sifted while air currents draw off the small, light bran particles. The purified middlings go on to the smooth reduction rolls.\n\nIt matters because the bran carries most of the ash. Bran left in the middlings is ground into the flour, where it shows as higher ash and a darker colour.`,
    millingPurifiersSeeInAction: 'Plansifter cutaway\nMilling floor',
    // milling-extraction-ash
    millingExtractionAshTitle: 'Extraction Rate and Ash',
    millingExtractionAshTooltip: 'How much flour the wheat gives, and how much bran came with it.',
    millingExtractionAshBrief:
      'Extraction is the share of the wheat that becomes flour. The miller wants as much as possible with as little bran as possible, and the ash test shows how much bran got in.',
    millingExtractionAshArticle: `## How Much Flour, and How Clean\n\nDuring milling, about 70 to 75% of the grain becomes flour. The other 25 to 30% leaves as by-products such as bran, shorts and germ, largely for animal feed.\n\nThe miller's aim is to take out as much endosperm as possible while keeping ash low. Ash is what remains when a sample is heated at 585 °C until its weight is stable, usually overnight: the minerals, which sit mostly in the bran. For example, a wheat might test at {wheatAsh}% ash and a flour at {flourAsh}%, usually expressed on a 14% moisture basis.\n\nSo ash shows how much bran got into the flour, and it darkens the flour. Very white flours come from the early streams only, brown flours take in most streams, and wholemeal blends every stream back together.`,
    millingExtractionAshSeeInAction: 'Overview batch genealogy\nSCADA quality provenance',
    // milling-baker-needs
    millingBakerNeedsTitle: 'What a Baker Needs from Flour',
    millingBakerNeedsTooltip: 'Protein, falling number and water absorption.',
    millingBakerNeedsBrief:
      'A baker buys flour to a specification: enough protein for the product, a falling number that shows sound grain, and a known water absorption.',
    millingBakerNeedsArticle: `## Protein, Falling Number and Water\n\nProtein: bread flour needs plenty, because the gluten it forms holds the gas bubbles and keeps the loaf risen. Cakes and biscuits need less. Higher protein usually needs more water and a longer mix.\n\nFalling number: a flour and water paste is heated in a boiling water bath, and the seconds a stirrer takes to fall through it are the reading. A high number (for example, above 300 seconds) means little enzyme activity and sound grain; a low one (for example, below 250 seconds) means a lot, the mark of sprouted wheat. Too much activity makes sticky dough and a poor texture, and the enzymes cannot be taken back out of the flour. UK mills test the Hagberg Falling Number as wheat arrives.\n\nWater absorption: the water a flour takes to reach a set dough consistency on the farinograph, given as a percentage. A weak-gluten flour absorbs less, and holds that consistency for less time, than a strong one.`,
    millingBakerNeedsSeeInAction: 'Overview customer orders\nSCADA quality provenance',
    // milling-dust-explosions
    millingDustExplosionsTitle: 'Dust Explosions',
    millingDustExplosionsTooltip: 'Flour dust in a cloud, confined and lit, explodes.',
    millingDustExplosionsBrief:
      'Flour dust burns. Raised into a cloud in a vessel or a room and lit, it explodes, and the blast can lift settled dust into stronger explosions after it.',
    millingDustExplosionsArticle: `## Why a Mill Keeps Itself Clean\n\nFlour is an explosible dust. Fine dust suspended in air at the right concentration, inside a vessel or a building, explodes violently when it is lit; in the open it can burn as a fireball. The spark can be as small as the static from pulling off a synthetic jumper.\n\nA dust explosion needs five things at once: fuel, an ignition source, oxygen, a dust cloud and confinement. A first explosion can lift the dust settled on floors and ledges into the air and light it, and a weak first blast can set off very powerful secondary ones. In the catastrophic incidents the Board studied, secondary explosions caused much of the damage and casualties. The US Chemical Safety Board quotes the NFPA's warning that more than 1/32 of an inch of dust over 5 percent of a room's surface is a significant explosion hazard.\n\nSo a mill seals its leaks, cleans with an earthed central vacuum rather than brushes or compressed air, keeps surfaces no hotter than 200 °C, earths its metalwork and the delivery tankers, and fits silos and bucket elevators with explosion relief. In the US, flour mills come under OSHA's 1987 Grain Handling Facilities Standard, which the Chemical Safety Board credits with reducing the number and severity of grain dust explosions.`,
    millingDustExplosionsSeeInAction: 'Safety panel\nPredictive maintenance',
  },
  'pt-BR': {
    historyUnlock: 'Desbloqueado por um evento na Crônica do Moinho',
    farmLessonUnlock: 'Desbloqueado ao concluir a inspeção do galinheiro na fazenda',
    windmillNoteUnlock:
      'Desbloqueado pela lição do moinho de vento da fazenda ou por uma turbina eólica na Crônica do Moinho',
    farmHenhouseTitle: 'O galinheiro',
    farmHenhouseTooltip: 'Ninhos, ração e água, poleiros e coleta cuidadosa.',
    farmHenhouseBrief:
      'O que o galinheiro da fazenda oferece às galinhas e como os ovos são recolhidos.',
    farmHenhouseArticle: `## O galinheiro\n\nOs ninhos oferecem um lugar protegido para as galinhas botarem ovos.\n\nRação e água fresca atendem às necessidades diárias das galinhas.\n\nOs poleiros dão às galinhas um lugar elevado para descansar.\n\nRecolha os ovos dos ninhos com cuidado, mantendo movimentos calmos perto das galinhas.`,
    farmHenhouseSeeInAction: 'Galinheiro da fazenda',
    // Fatos da tela de carregamento (D14), com as mesmas ressalvas dos artigos.
    factExplosibleDust:
      'A farinha é uma poeira explosiva: suspensa no ar na concentração certa e confinada, explode violentamente quando inflamada.',
    factStaticSpark:
      'A faísca que inflama uma nuvem de poeira pode ser tão pequena quanto a eletricidade estática de tirar uma blusa de fibra sintética.',
    factSecondaryBlast:
      'Uma primeira explosão de poeira fraca pode levantar a poeira assentada e desencadear explosões secundárias muito fortes.',
    factExtraction:
      'Cerca de 70 a 75% do grão vira farinha; o resto sai em grande parte como ração animal.',
    factTempering:
      'O condicionamento eleva a umidade do trigo limpo a aproximadamente 15% e o deixa descansar de 2 a 24 horas.',
    factRolls: 'Rolos estriados quebram o trigo; rolos lisos reduzem as semolinas a farinha.',
    factStreams:
      'As farinhas muito brancas vêm apenas dos primeiros fluxos; a integral reúne de novo todos eles.',
    factFallingNumber:
      'Um número de queda alto, por exemplo acima de 300 segundos, indica grão sadio; um baixo, por exemplo abaixo de 250, trigo germinado.',
    factIntake:
      'Os moinhos do Reino Unido medem proteína, o número de queda de Hagberg e umidade quando o trigo chega.',
    // Library labels
    alwaysAvailable: 'Disponível na biblioteca de operações autônomas',
    historySeeInAction: 'Crônica do moinho',
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
      'Desafios de recuperação na Visão geral\nBalanço do turno\nRitmo da linha no painel de energia',
    // community-commitments
    communityCommitmentsTitle: 'O moinho e seus vizinhos',
    communityCommitmentsTooltip: 'Um pedido cooperativo concluído abastece a padaria da vila.',
    communityCommitmentsBrief:
      'A padaria precisa de uma entrega real de farinha. Uma produção segura e rastreável é uma promessa às pessoas que usam o que ela produz.',
    communityCommitmentsArticle: `## Uma entrega tem destino\n\nO pedido da Riverside Bakers' Cooperative liga o moinho à padaria da vila. A vitrine da padaria só é abastecida depois que a campanha registra um pedido de farinha atendido, com evidência de expedição. A vitrine é uma resposta visual a essa entrega; ela não cria mais nenhuma quantidade de farinha no livro-razão.\n\nOs compromissos de merenda escolar e de polenta têm receitas, prazos e expedições próprios. Concluir o pedido de um cliente não abastece todas as lojas do mundo. Confira o cliente ativo e os quilos restantes antes de mudar a receita.\n\nOs moradores da vila mantêm as caminhadas, o trabalho e as pausas para o chá de sempre. As tarefas do moinho respondem às condições dos equipamentos, da manutenção e da qualidade. Uma parada de segurança mantém as pessoas nas posições em que estão enquanto a verificação automatizada das rotas de saída confere o local; ela não certifica uma evacuação de trabalhadores.`,
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
    categoryMilling: 'Como a farinha é moída',
    // milling-cleaning-tempering
    millingCleaningTemperingTitle: 'Limpeza e condicionamento',
    millingCleaningTemperingTooltip:
      'Limpe o trigo e depois umedeça-o e deixe-o descansar antes dos rolos.',
    millingCleaningTemperingBrief:
      'Antes da moagem, o trigo é limpo de metal, pedras e outras sementes e depois condicionado: recebe água e descansa, para que o farelo fique mais resistente e o endosperma, mais macio.',
    millingCleaningTemperingArticle: `## Antes da primeira quebra\n\nO trigo chega ao moinho trazendo coisas que não podem chegar aos rolos. A limpeza as retira por etapas: um separador magnético remove ferro e aço, peneiras removem pedras e gravetos, correntes de ar levam as impurezas mais leves, separadores de discos removem cevada, aveia e outras sementes, e uma despontadeira esfrega o que ainda resta no grão.\n\nDepois, o trigo limpo é condicionado. Adiciona-se água para elevar a umidade a aproximadamente 15%, e o grão descansa de 2 a 24 horas para que a água penetre no grão. Os trigos moles precisam de menos água e de menos tempo que os duros.\n\nO condicionamento torna o farelo mais resistente, de modo que ele se solta em flocos grandes em vez de se fragmentar na farinha, e amacia o endosperma, que então se reduz com mais facilidade nos rolos.\n\n## Neste moinho\n\nEste moinho condiciona cada lote a aproximadamente 15% a partir da leitura do recebimento e o deixa descansar por 2 horas, o descanso mais curto dessa faixa. Em um ano agrícola úmido, o trigo chega acima da meta, e uma vez por turno o parceiro de IA pergunta se deve secá-lo antes. O trigo seco é moído sem a perda de qualidade do ano úmido; a secagem é paga em energia, e o trigo seco chega aos rolos depois do descanso de 2 horas.`,
    millingCleaningTemperingSeeInAction:
      'Corte do silo\nEspaço de trabalho de Processo do SCADA\nParceiro de IA, Decisões: Condicionamento (anos agrícolas úmidos)',
    // milling-break-reduction
    millingBreakReductionTitle: 'Quebra e redução',
    millingBreakReductionTooltip:
      'Rolos estriados abrem o grão; rolos lisos o moem até virar farinha.',
    millingBreakReductionBrief:
      'Os rolos estriados de quebra cortam o grão e separam o endosperma do farelo. Depois, os rolos lisos de redução moem esse endosperma, etapa por etapa, até virar farinha.',
    millingBreakReductionArticle: `## Dois tipos de rolo\n\nNo sistema de quebra, pares de rolos estriados (corrugados) abrem o grão aos poucos por cisalhamento, em vez de pulverizá-lo. Depois de cada par, o produto é peneirado: o mais fino sai como farinha e o mais grosso segue para a quebra seguinte, de estrias mais finas e com a abertura entre os rolos mais fechada.\n\nOs dois rolos de um par giram a velocidades diferentes, e a razão entre a velocidade do rolo rápido e a do lento é o diferencial. A patente de um fabricante coloca os rolos de quebra tipicamente entre {breakLow} e {breakHigh} para 1, aponta {breakBest} para 1 como a melhor razão para seus rolos de quebra e coloca os rolos lisos entre {reductionLow} e {reductionHigh} para 1. O par estriado no corte do moinho de rolos gira a {breakBest} para 1.\n\nNo sistema de redução, as semolinas purificadas passam entre rolos lisos, cada par mais fechado que o anterior, e a farinha é peneirada depois de cada um. Algumas partículas passam por apenas um rolo de quebra e um de redução; as mais próximas do farelo e do gérmen passam por vários. Aumentar o diferencial nos rolos lisos aumenta o amido danificado, a absorção de água e a energia de moagem, e piora as cinzas e a cor da farinha.`,
    millingBreakReductionSeeInAction: 'Corte do moinho de rolos\nAndar de moagem',
    // milling-purifiers
    millingPurifiersTitle: 'Sassores (purificadores)',
    millingPurifiersTooltip: 'Ar e peneiras retiram o farelo fino das semolinas.',
    millingPurifiersBrief:
      'Entre os rolos de quebra e os de redução, os sassores peneiram de novo as semolinas enquanto correntes de ar levam o farelo pequeno e leve, e o endosperma mais limpo segue para ser moído.',
    millingPurifiersArticle: `## Limpando as semolinas\n\nOs rolos de quebra deixam uma mistura. Pedaços grossos de endosperma, chamados semolinas, saem com pequenos flocos de farelo no meio, alguns ainda presos a eles. Plansifters e sassores separam esse produto por tamanho de partícula e densidade.\n\nNo sassor, as semolinas são peneiradas enquanto correntes de ar levam as partículas pequenas e leves de farelo. As semolinas purificadas seguem para os rolos lisos de redução.\n\nIsso importa porque o farelo concentra a maior parte das cinzas. O farelo que fica nas semolinas é moído junto com a farinha, onde aparece como mais cinzas e uma cor mais escura.`,
    millingPurifiersSeeInAction: 'Corte do plansifter\nAndar de moagem',
    // milling-extraction-ash
    millingExtractionAshTitle: 'Taxa de extração e cinzas',
    millingExtractionAshTooltip: 'Quanta farinha o trigo rende e quanto farelo veio junto.',
    millingExtractionAshBrief:
      'A extração é a parte do trigo que vira farinha. O moleiro quer o máximo possível com o mínimo de farelo, e o teste de cinzas mostra quanto farelo entrou.',
    millingExtractionAshArticle: `## Quanta farinha, e quão limpa\n\nNa moagem, cerca de 70 a 75% do grão vira farinha. Os outros 25 a 30% saem como subprodutos, como farelo, farelinho e gérmen, em grande parte para ração animal.\n\nO objetivo do moleiro é extrair o máximo de endosperma possível mantendo as cinzas baixas. Cinzas são o que resta quando uma amostra é aquecida a 585 °C até o peso se estabilizar, normalmente durante a noite: os minerais, que ficam sobretudo no farelo. Por exemplo, um trigo pode ter {wheatAsh}% de cinzas e uma farinha, {flourAsh}%, normalmente expressos na base de 14% de umidade.\n\nAssim, as cinzas mostram quanto farelo foi parar na farinha, e escurecem a farinha. As farinhas muito brancas vêm apenas dos primeiros fluxos, as farinhas escuras usam a maior parte dos fluxos e a integral reúne de novo todos eles.`,
    millingExtractionAshSeeInAction:
      'Genealogia dos lotes na Visão geral\nProcedência da qualidade no SCADA',
    // milling-baker-needs
    millingBakerNeedsTitle: 'O que um padeiro precisa da farinha',
    millingBakerNeedsTooltip: 'Proteína, número de queda e absorção de água.',
    millingBakerNeedsBrief:
      'O padeiro compra farinha por especificação: proteína suficiente para o produto, um número de queda que mostre grão sadio e uma absorção de água conhecida.',
    millingBakerNeedsArticle: `## Proteína, número de queda e água\n\nProteína: a farinha para pão precisa de bastante, porque o glúten que ela forma retém as bolhas de gás e mantém o pão crescido. Bolos e biscoitos precisam de menos. Mais proteína normalmente exige mais água e uma mistura mais longa.\n\nNúmero de queda: uma pasta de farinha e água é aquecida em banho-maria fervente, e os segundos que um agitador leva para atravessá-la são a leitura. Um número alto (por exemplo, acima de 300 segundos) indica pouca atividade enzimática e grão sadio; um baixo (por exemplo, abaixo de 250 segundos) indica muita, o sinal de trigo germinado. Atividade demais deixa a massa pegajosa e a textura ruim, e as enzimas não podem ser retiradas da farinha. Os moinhos do Reino Unido medem o número de queda de Hagberg quando o trigo chega.\n\nAbsorção de água: a água de que uma farinha precisa para atingir uma consistência de massa definida no farinógrafo, em porcentagem. Uma farinha de glúten fraco absorve menos, e mantém essa consistência por menos tempo, que uma de glúten forte.`,
    millingBakerNeedsSeeInAction:
      'Pedidos de clientes na Visão geral\nProcedência da qualidade no SCADA',
    // milling-dust-explosions
    millingDustExplosionsTitle: 'Explosões de poeira',
    millingDustExplosionsTooltip: 'Poeira de farinha em nuvem, confinada e inflamada, explode.',
    millingDustExplosionsBrief:
      'A poeira de farinha queima. Levantada em nuvem dentro de um equipamento ou de uma sala e inflamada, ela explode, e a onda de choque pode levantar a poeira assentada em explosões mais fortes em seguida.',
    millingDustExplosionsArticle: `## Por que um moinho se mantém limpo\n\nA farinha é uma poeira explosiva. Poeira fina suspensa no ar na concentração certa, dentro de um equipamento ou de um prédio, explode violentamente quando inflamada; ao ar livre, pode queimar como uma bola de fogo. A faísca pode ser tão pequena quanto a eletricidade estática de tirar uma blusa de fibra sintética.\n\nUma explosão de poeira precisa de cinco coisas ao mesmo tempo: combustível, uma fonte de ignição, oxigênio, uma nuvem de poeira e confinamento. Uma primeira explosão pode levantar a poeira assentada no chão e nas saliências e inflamá-la, e uma primeira explosão fraca pode desencadear explosões secundárias muito fortes. Nos incidentes catastróficos estudados pelo Board, as explosões secundárias causaram grande parte dos danos e das vítimas. O US Chemical Safety Board cita o alerta da NFPA de que mais de 1/32 de polegada de poeira sobre 5 por cento da superfície de uma sala é um risco significativo de explosão.\n\nPor isso, um moinho veda seus vazamentos, limpa com um aspirador central aterrado em vez de vassouras ou ar comprimido, mantém as superfícies a no máximo 200 °C, aterra suas partes metálicas e os caminhões-tanque de entrega, e equipa silos e elevadores de canecas com alívio de explosão. Nos EUA, os moinhos de farinha seguem a norma de instalações de manuseio de grãos da OSHA, de 1987, à qual o Chemical Safety Board atribui a redução do número e da gravidade das explosões de poeira de grãos.`,
    millingDustExplosionsSeeInAction: 'Painel de segurança\nManutenção preditiva',
  },
});
