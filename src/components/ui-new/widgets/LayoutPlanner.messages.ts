import { defineMessages, formatGrouped } from '../../../i18n';

type PlanParams = { plan: string };
type ZoomParams = { plan: string; zoomed: boolean };
type DockParams = { dock: string };
type WeightParams = { weight: string };
type IndexParams = { index: number };
type LockedWaypointParams = { index: number; x: number; z: number };
type AlternativesParams = { count: string; improved: boolean };
type TransportParams = { intake: number; pneumatic: number; finished: number; modeled: number };

const PT_PLAN: Record<string, string> = { current: 'atual', proposed: 'proposto' };
const PT_DOCK: Record<string, string> = { shipping: 'expedição', receiving: 'recebimento' };
const PT_WEIGHT: Record<string, string> = {
  travel: 'deslocamento',
  handling: 'manuseio',
  crossing: 'cruzamento',
};

const ptPlan = (plan: string): string => PT_PLAN[plan] ?? plan;
const ptDock = (dock: string): string => PT_DOCK[dock] ?? dock;
/** pt-BR rendering of a number the English copy prints with String(n). */
const ptNumber = (value: number): string =>
  formatGrouped(value, { maximumFractionDigits: 6, useGrouping: false }, 'pt-BR');

export const layoutPlannerMessages = defineMessages({
  en: {
    renderFailed: 'The drawing could not be rendered. Try SVG export.',
    pngUnavailable: 'PNG export is unavailable in this browser. Try SVG export.',
    pngFailed: 'PNG export failed. Try SVG export.',
    initialMessage: 'Edit a proposal or search for a lower-cost arrangement.',
    proposalUpdated: 'Proposal updated. The running mill is unchanged.',
    layoutCaptured: 'Current layout captured; the proposal has been reset.',
    millPausedMessage: 'Mill paused. Apply a clear proposal, then run production to measure it.',
    geometryRestored:
      'Previous geometry restored. Stock, shipments and vehicle progress are retained.',
    layoutApplied:
      'Layout applied to the mill. Run production, then return here to compare observed results.',
    applyFailed: 'The layout could not be applied.',
    comparing: 'Comparing bounded route and staging alternatives…',
    alternativesChecked: (p: AlternativesParams) =>
      `${p.count} alternatives checked. ${p.improved ? 'A lower-cost proposal is ready to compare.' : 'No lower-cost clearance-feasible alternative was found.'}`,
    searchFailed: 'The search could not finish. Check the proposal coordinates and try again.',
    downloadStarted: '{format} download started.',
    exportFailed: 'Export failed. Try SVG or JSON.',
    svgCurrentTitle: 'Current layout',
    svgProposedTitle: 'Proposed layout',
    title: 'Logistics planning',
    subtitle:
      'Plan, pause, apply and run the mill. Compare observed results and undo the applied geometry.',
    close: 'Close logistics planning',
    noMachines:
      'The scene has not registered its machines yet. Close this view and reopen it after the mill loads.',
    stale: 'The live process layout changed. Capture current again before exporting this proposal.',
    operateLabel: 'Operate planned layout',
    pauseMill: 'Pause mill',
    applyToMill: 'Apply to mill',
    undoApplied: 'Undo applied layout',
    runProduction: 'Run production',
    pausedNote: 'Mill paused. Apply changes while both clocks are stopped.',
    runningNote: 'Mill running. Pause before applying or undoing geometry.',
    layoutRevision: 'Layout revision {revision}.',
    loadingCapacity:
      'Dock loading capacity uses a geometry-based handling assumption: {rate} kg/s, calibrated to 400 kg/s for the authored layout. Vehicle travel and staging distance affect this capacity. Released stock, quality interlocks and truck capacity still limit each load. Planning weights never change gameplay.',
    findLowerCost: 'Find lower-cost layout',
    undo: 'Undo',
    editUndone: 'Proposal edit undone.',
    redo: 'Redo',
    editRestored: 'Proposal edit restored.',
    resetProposal: 'Reset proposal',
    captureAgain: 'Capture current again',
    planHeading: (p: PlanParams) => `${p.plan} layout`,
    zoomPlan: (p: ZoomParams) => `${p.zoomed ? 'Fit' : 'Enlarge'} ${p.plan} plan`,
    drawingRegion: (p: PlanParams) => `${p.plan} drawing, scroll to inspect enlarged details`,
    estimatedComparison: 'Estimated comparison',
    measure: 'Measure',
    current: 'Current',
    proposal: 'Proposal',
    vehicleTravel: 'Vehicle travel (m/hr)',
    stagingHandling: 'Staging handling (m/hr)',
    slowZoneVisits: 'Slow-zone visits/hr',
    weightedCost: 'Weighted cost (equivalent m/hr)',
    shippingCycle: 'Shipping cycle (s)',
    receivingCycle: 'Receiving cycle (s)',
    savingLower: '{pct}% lower weighted cost with the same assumptions.',
    savingHigher: '{pct}% higher weighted cost with the same assumptions.',
    travelEstimates:
      'Travel estimates use the rounded route, a conservative 1.8 m/s average and 13 seconds for loading/unloading. Staging handling uses rectilinear distance. Acceleration, traffic waits and production gains are outside this estimate.',
    proposalControls: 'Proposal controls',
    dockName: (p: DockParams) => p.dock,
    shippingStagingNote: 'Reserve all 50 pallet spaces.',
    receivingStagingNote: 'Position the two stacks of empty return pallets.',
    fixedNote: 'Process machines, elevated sifters and pipe endpoints remain fixed.',
    stagingX: (p: DockParams) => `${p.dock} staging X (m)`,
    stagingZ: (p: DockParams) => `${p.dock} staging Z (m)`,
    travelWaypoints: 'Travel waypoints',
    waypointNote:
      'Pickup, dropoff and approach legs are locked. Corners use the controller’s rounding model and may not tighten its existing turning envelope. Apply also checks each vehicle can keep its current pose and next action.',
    waypointX: (p: IndexParams) => `Waypoint ${p.index} X (m)`,
    waypointZ: (p: IndexParams) => `Waypoint ${p.index} Z (m)`,
    waypointLocked: (p: LockedWaypointParams) => `Waypoint ${p.index}: ${p.x}, ${p.z} m (locked)`,
    feasible: 'Proposal clears the modeled footprints and protected pedestrian approaches.',
    resolveConflicts: 'Resolve these clearance conflicts before applying or exporting:',
    sweptNote:
      'Swept checks use the controller’s 2.7 m corridor plus a 0.1 m sampling margin. Dock pedestrian approaches reserve 3 m. Vehicle crossings may still require a stop; this view makes no evacuation certification.',
    planningAssumptions: 'Planning assumptions',
    tripsPerHour: (p: DockParams) => `${p.dock} trips/hr`,
    weight: (p: WeightParams) => `${p.weight} weight`,
    slowZoneDelay: 'Slow-zone delay (s)',
    observedQueues: 'Observed material queues',
    liveQueues: 'Update queue telemetry every second',
    materialClock:
      'Material clock {clock} s; packing output {output} kg/s. Both drawings show this same observation, not forecast queues.',
    queueFlow: '{input} kg in / {output} kg out',
    queueUse: '{pct}% buffer use',
    transportNote: (p: TransportParams) =>
      `Transport timing follows service-route arc length. Assumed speeds: intake ${p.intake}, pneumatic ${p.pneumatic}, finished ${p.finished} m/s. ${p.modeled} connections use modeled paths; arrivals already in flight keep their timestamps.`,
    exportLabel: 'Export logistics proposal',
    saveJson: 'Save proposal JSON',
    exportFormat: 'Export {format}',
    filesNote:
      'Files download locally. DXF uses metre units and semantic layers; SVG and PNG include dimensions and a scale bar.',
    pending: 'Pending',
    clearanceConflict: 'Clearance conflict',
    observedHeading: 'Observed operating results',
    beforeSealed: 'Before is sealed when a layout is applied. After measures the subsequent run.',
    runBaseline: 'Run the current mill to collect a baseline, then apply a proposal.',
    observedNote:
      'Active seconds are admitted central-tick time; material seconds follow the production clock. Undo retains the completed after window. Reload and replay clear these comparisons.',
    beforeApply: 'Before apply',
    afterApply: 'After apply',
    currentRun: 'Current run',
    activeSeconds: 'Active seconds',
    materialSeconds: 'Material seconds',
    packedPerMinute: 'Packed kg / active minute',
    shippedPerMinute: 'Shipped kg / active minute',
    vehicleMetresPerMinute: 'Vehicle metres / active minute',
    completedUnloads: 'Completed vehicle unloads',
    controlsMatched:
      'Recorded operating controls match. Stock, traffic and truck timing can still affect results; this is an observed comparison.',
    controlsChanged:
      'Operating controls changed or measurement is pending. These windows do not establish a layout-only production gain.',
  },
  'pt-BR': {
    renderFailed: 'Não foi possível renderizar o desenho. Tente exportar em SVG.',
    pngUnavailable:
      'A exportação em PNG não está disponível neste navegador. Tente exportar em SVG.',
    pngFailed: 'A exportação em PNG falhou. Tente exportar em SVG.',
    initialMessage: 'Edite uma proposta ou procure um arranjo de menor custo.',
    proposalUpdated: 'Proposta atualizada. O moinho em operação não foi alterado.',
    layoutCaptured: 'Layout atual capturado; a proposta foi reiniciada.',
    millPausedMessage:
      'Moinho pausado. Aplique uma proposta sem conflitos de folga e depois rode a produção para medi-la.',
    geometryRestored:
      'Geometria anterior restaurada. Estoque, cargas expedidas e o progresso dos veículos foram mantidos.',
    layoutApplied:
      'Layout aplicado ao moinho. Rode a produção e depois volte aqui para comparar os resultados observados.',
    applyFailed: 'Não foi possível aplicar o layout.',
    comparing: 'Comparando alternativas limitadas de rota e de área de preparação…',
    alternativesChecked: (p: AlternativesParams) =>
      `${p.count} alternativas verificadas. ${p.improved ? 'Uma proposta de menor custo está pronta para comparação.' : 'Nenhuma alternativa de menor custo e com folga viável foi encontrada.'}`,
    searchFailed:
      'A busca não pôde ser concluída. Verifique as coordenadas da proposta e tente novamente.',
    downloadStarted: 'Download em {format} iniciado.',
    exportFailed: 'A exportação falhou. Tente SVG ou JSON.',
    svgCurrentTitle: 'Layout atual',
    svgProposedTitle: 'Layout proposto',
    title: 'Planejamento logístico',
    subtitle:
      'Planeje, pause, aplique e rode o moinho. Compare os resultados observados e desfaça a geometria aplicada.',
    close: 'Fechar o planejamento logístico',
    noMachines:
      'A cena ainda não registrou as máquinas. Feche esta tela e abra-a de novo depois que o moinho carregar.',
    stale:
      'O layout do processo em operação mudou. Capture o estado atual de novo antes de exportar esta proposta.',
    operateLabel: 'Operar o layout planejado',
    pauseMill: 'Pausar moinho',
    applyToMill: 'Aplicar ao moinho',
    undoApplied: 'Desfazer layout aplicado',
    runProduction: 'Rodar produção',
    pausedNote: 'Moinho pausado. Aplique as mudanças enquanto os dois relógios estão parados.',
    runningNote: 'Moinho em operação. Pause antes de aplicar ou desfazer a geometria.',
    layoutRevision: 'Revisão do layout {revision}.',
    loadingCapacity:
      'A capacidade de carregamento da doca usa uma premissa de manuseio baseada na geometria: {rate} kg/s, calibrada em 400 kg/s para o layout original. O deslocamento dos veículos e a distância da área de preparação afetam essa capacidade. O estoque liberado, os intertravamentos de qualidade e a capacidade do caminhão ainda limitam cada carga. Os pesos de planejamento nunca alteram a simulação.',
    findLowerCost: 'Encontrar layout de menor custo',
    undo: 'Desfazer',
    editUndone: 'Edição da proposta desfeita.',
    redo: 'Refazer',
    editRestored: 'Edição da proposta refeita.',
    resetProposal: 'Reiniciar proposta',
    captureAgain: 'Capturar estado atual de novo',
    planHeading: (p: PlanParams) => `layout ${ptPlan(p.plan)}`,
    zoomPlan: (p: ZoomParams) => `${p.zoomed ? 'Ajustar' : 'Ampliar'} desenho ${ptPlan(p.plan)}`,
    drawingRegion: (p: PlanParams) =>
      `Desenho do layout ${ptPlan(p.plan)}; role para inspecionar os detalhes ampliados`,
    estimatedComparison: 'Comparação estimada',
    measure: 'Medida',
    current: 'Atual',
    proposal: 'Proposta',
    vehicleTravel: 'Deslocamento dos veículos (m/h)',
    stagingHandling: 'Manuseio na área de preparação (m/h)',
    slowZoneVisits: 'Passagens por zona lenta/h',
    weightedCost: 'Custo ponderado (m/h equivalentes)',
    shippingCycle: 'Ciclo de expedição (s)',
    receivingCycle: 'Ciclo de recebimento (s)',
    savingLower: 'Custo ponderado {pct}% menor com as mesmas premissas.',
    savingHigher: 'Custo ponderado {pct}% maior com as mesmas premissas.',
    travelEstimates:
      'As estimativas de deslocamento usam a rota arredondada, uma média conservadora de 1,8 m/s e 13 segundos para carga/descarga. O manuseio na área de preparação usa distância retilínea. Aceleração, esperas no tráfego e ganhos de produção ficam fora desta estimativa.',
    proposalControls: 'Controles da proposta',
    dockName: (p: DockParams) => ptDock(p.dock),
    shippingStagingNote: 'Reserve todas as 50 posições de palete.',
    receivingStagingNote: 'Posicione as duas pilhas de paletes vazios de retorno.',
    fixedNote:
      'As máquinas de processo, os plansifters elevados e as extremidades das tubulações permanecem fixos.',
    stagingX: (p: DockParams) => `${ptDock(p.dock)}: área de preparação X (m)`,
    stagingZ: (p: DockParams) => `${ptDock(p.dock)}: área de preparação Z (m)`,
    travelWaypoints: 'Pontos de passagem do trajeto',
    waypointNote:
      'Os trechos de coleta, entrega e aproximação estão bloqueados. As curvas usam o modelo de arredondamento do controlador e não podem apertar o raio de giro existente. Ao aplicar, também se verifica se cada veículo consegue manter a posição atual e a próxima ação.',
    waypointX: (p: IndexParams) => `Ponto de passagem ${p.index} X (m)`,
    waypointZ: (p: IndexParams) => `Ponto de passagem ${p.index} Z (m)`,
    waypointLocked: (p: LockedWaypointParams) =>
      `Ponto de passagem ${p.index}: ${ptNumber(p.x)}; ${ptNumber(p.z)} m (bloqueado)`,
    feasible:
      'A proposta respeita as áreas ocupadas modeladas e os acessos protegidos de pedestres.',
    resolveConflicts: 'Resolva estes conflitos de folga antes de aplicar ou exportar:',
    sweptNote:
      'As verificações de varredura usam o corredor de 2,7 m do controlador mais uma margem de amostragem de 0,1 m. Os acessos de pedestres às docas reservam 3 m. Os cruzamentos de veículos ainda podem exigir uma parada; esta tela não certifica evacuação.',
    planningAssumptions: 'Premissas de planejamento',
    tripsPerHour: (p: DockParams) => `${ptDock(p.dock)}: viagens/h`,
    weight: (p: WeightParams) => `peso de ${PT_WEIGHT[p.weight] ?? p.weight}`,
    slowZoneDelay: 'Atraso na zona lenta (s)',
    observedQueues: 'Filas de material observadas',
    liveQueues: 'Atualizar a telemetria das filas a cada segundo',
    materialClock:
      'Relógio de material {clock} s; saída do ensaque {output} kg/s. Os dois desenhos mostram esta mesma observação, não filas previstas.',
    queueFlow: '{input} kg de entrada / {output} kg de saída',
    queueUse: '{pct}% do estoque intermediário em uso',
    transportNote: (p: TransportParams) =>
      `O tempo de transporte segue o comprimento do arco da rota de serviço. Velocidades assumidas: entrada ${ptNumber(p.intake)}, pneumático ${ptNumber(p.pneumatic)}, produto acabado ${ptNumber(p.finished)} m/s. ${ptNumber(p.modeled)} conexões usam trajetos modelados; as cargas já em trânsito mantêm seus horários de chegada.`,
    exportLabel: 'Exportar a proposta logística',
    saveJson: 'Salvar proposta em JSON',
    exportFormat: 'Exportar {format}',
    filesNote:
      'Os arquivos são baixados localmente. O DXF usa metros como unidade e camadas semânticas; SVG e PNG incluem cotas e uma barra de escala.',
    pending: 'Pendente',
    clearanceConflict: 'Conflito de folga',
    observedHeading: 'Resultados operacionais observados',
    beforeSealed:
      'O "antes" é fechado quando um layout é aplicado. O "depois" mede a operação seguinte.',
    runBaseline:
      'Rode o moinho atual para coletar uma linha de base e depois aplique uma proposta.',
    observedNote:
      'Os segundos ativos são o tempo de tick central admitido; os segundos de material seguem o relógio de produção. Desfazer mantém a janela "depois" já concluída. Recarregar e reproduzir apagam estas comparações.',
    beforeApply: 'Antes de aplicar',
    afterApply: 'Depois de aplicar',
    currentRun: 'Operação atual',
    activeSeconds: 'Segundos ativos',
    materialSeconds: 'Segundos de material',
    packedPerMinute: 'kg ensacados / minuto ativo',
    shippedPerMinute: 'kg expedidos / minuto ativo',
    vehicleMetresPerMinute: 'Metros de veículo / minuto ativo',
    completedUnloads: 'Descargas de veículos concluídas',
    controlsMatched:
      'Os controles operacionais registrados coincidem. Estoque, tráfego e horários dos caminhões ainda podem afetar os resultados; esta é uma comparação observada.',
    controlsChanged:
      'Os controles operacionais mudaram ou a medição está pendente. Estas janelas não comprovam um ganho de produção causado apenas pelo layout.',
  },
});
