import { defineMessages } from '../../../i18n';

/*
 * Store enums (run window, weather, manifest kind, disposition, dock status,
 * material type) render as their raw value in English, exactly as before; the
 * CSS does the capitalising. pt-BR maps known values and passes unknown ones
 * through unchanged.
 */
const PT_RUN_WINDOW: Record<string, string> = {
  morning: 'manhã',
  afternoon: 'tarde',
  night: 'noite',
};
const PT_WEATHER: Record<string, string> = {
  clear: 'limpo',
  cloudy: 'nublado',
  rain: 'chuva',
  storm: 'tempestade',
};
const PT_MANIFEST_KIND: Record<string, string> = {
  receiving: 'recebimento',
  shipping: 'expedição',
};
const PT_DISPOSITION: Record<string, string> = {
  released: 'liberado',
  hold: 'retido',
  recalled: 'recolhido',
  shipped: 'expedido',
};
const PT_DOCK_STATUS: Record<string, string> = {
  clear: 'livre',
  arriving: 'chegando',
  loading: 'carregando',
  departing: 'saindo',
};
const PT_MATERIAL: Record<string, string> = {
  wheat_grain: 'grão de trigo',
  corn_grain: 'grão de milho',
  flour: 'farinha',
  bran: 'farelo',
  middlings: 'farelinho',
  semolina: 'semolina',
};

export const overviewPanelMessages = defineMessages({
  en: {
    paused: 'PAUSED',
    runWindow: 'Run window',
    runWindowValue: (p: { value: string }) => p.value,

    materialTraceability: 'Material Traceability',
    received: 'Received',
    shipped: 'Shipped',
    awaitingFirstTransfer: 'Awaiting first dock transfer',
    latestManifests: 'Latest material manifests',
    manifestKind: (p: { value: string }) => p.value,
    material: (p: { value: string }) => p.value.replaceAll('_', ' '),

    batchGenealogy: 'Batch genealogy and quality',
    lotSummary: '{lots} source lots, {batches} production batches',
    genealogyBalance: 'Genealogy {sign}{value} kg',
    firstBatch: 'Packing is building the first traceable batch.',
    batchListLabel: 'Held and investigated batches, then recent production',
    batchAvailable: '{material}, {kg} kg available',
    disposition: (p: { value: string }) => p.value,
    hideTrace: 'Hide trace',
    traceBatch: 'Trace batch',
    testBatch: 'Test batch',
    placeHold: 'Place hold',
    retestAndRelease: 'Retest and release',
    recallBatch: 'Recall batch',
    recallConfirm:
      'A recall cannot be undone. {kg} kg of {material} in this batch is written off as waste and never ships. Other released batches keep shipping.',
    confirmRecall: 'Confirm recall',
    cancelRecall: 'Cancel',
    writtenOff: '{kg} kg written off as waste',
    investigationActive: 'Investigation active',
    traceFor: 'Trace for {id}',
    upstreamProvenance: 'Upstream provenance',
    pathJoiner: ' to ',

    noteRetest: 'Conforming retest completed after corrective investigation',
    noteRoutineTest: 'Routine batch release test completed',
    noteRetestReleased: 'Conforming retest released the investigated scope',
    noteRecallInvestigation: 'Targeted batch recall investigation',
    noteRecalled: 'Affected batch recalled and isolated from dispatch',
    noteHold: 'Automated targeted quality hold initiated',

    productionSummary: 'Production Summary',
    throughput: 'Throughput',
    bagsPerHr: 'bags/hr',
    efficiency: 'Efficiency',
    uptime: 'Uptime',
    quality: 'Quality',
    dailyTarget: 'Daily Target',
    percentComplete: '{value}% complete',

    machineStatus: 'Machine Status',
    running: 'Running',
    warning: 'Warning',
    critical: 'Critical',
    idle: 'Idle',

    weather: 'Weather',
    weatherValue: (p: { value: string }) => p.value,
    siteMode: 'Site Mode',
    siteModeValue: 'Staffed · Autonomous logistics',

    safetyScore: 'Safety Score',
    nearMisses: 'Near Misses',
    safetyStops: 'Safety Stops',
    daysSafe: 'Days Safe',

    dockStatus: 'Dock Status',
    receiving: 'Receiving',
    shipping: 'Shipping',
    dockState: (p: { value: string }) => p.value,
    unloading: 'Unloading',
    nextTruck: 'Next truck in {minutes} min',
    eta: 'ETA: {minutes} min',

    planLogistics: 'Plan logistics',
    predictiveMaintenance: 'Predictive maintenance',
    loadingMaintenance: 'Loading maintenance panel...',
    totalBagsProduced: 'Total Bags Produced',

    quickActions: 'Quick Actions',
    achievements: 'Achievements',
    replayHistory: 'Replay History',
    replay: 'Replay',
    miniMap: 'Mini-map',
    screenshot: 'Screenshot',
    exportReport: 'Export Report',
    export: 'Export',
  },
  'pt-BR': {
    paused: 'PAUSADO',
    runWindow: 'Janela de operação',
    runWindowValue: (p: { value: string }) => PT_RUN_WINDOW[p.value] ?? p.value,

    materialTraceability: 'Rastreabilidade de materiais',
    received: 'Recebido',
    shipped: 'Expedido',
    awaitingFirstTransfer: 'Aguardando a primeira transferência na doca',
    latestManifests: 'Romaneios de material mais recentes',
    manifestKind: (p: { value: string }) => PT_MANIFEST_KIND[p.value] ?? p.value,
    material: (p: { value: string }) => PT_MATERIAL[p.value] ?? p.value.replaceAll('_', ' '),

    batchGenealogy: 'Genealogia e qualidade dos lotes',
    lotSummary: '{lots} lotes de origem, {batches} lotes de produção',
    genealogyBalance: 'Genealogia {sign}{value} kg',
    firstBatch: 'O ensaque está formando o primeiro lote rastreável.',
    batchListLabel: 'Lotes retidos e em investigação, depois a produção recente',
    batchAvailable: '{material}, {kg} kg disponíveis',
    disposition: (p: { value: string }) => PT_DISPOSITION[p.value] ?? p.value,
    hideTrace: 'Ocultar rastreio',
    traceBatch: 'Rastrear lote',
    testBatch: 'Testar lote',
    placeHold: 'Reter lote',
    retestAndRelease: 'Retestar e liberar',
    recallBatch: 'Recolher lote',
    recallConfirm:
      'O recolhimento não pode ser desfeito. {kg} kg de {material} deste lote são baixados como perda e nunca serão expedidos. Os outros lotes liberados continuam sendo expedidos.',
    confirmRecall: 'Confirmar recolhimento',
    cancelRecall: 'Cancelar',
    writtenOff: '{kg} kg baixados como perda',
    investigationActive: 'Investigação em andamento',
    traceFor: 'Rastreio de {id}',
    upstreamProvenance: 'Procedência a montante',
    pathJoiner: ' para ',

    noteRetest: 'Reteste conforme concluído após investigação corretiva',
    noteRoutineTest: 'Teste de rotina para liberação do lote concluído',
    noteRetestReleased: 'O reteste conforme liberou o escopo investigado',
    noteRecallInvestigation: 'Investigação para recolhimento direcionado do lote',
    noteRecalled: 'Lote afetado recolhido e isolado da expedição',
    noteHold: 'Retenção de qualidade direcionada iniciada automaticamente',

    productionSummary: 'Resumo da produção',
    throughput: 'Vazão',
    bagsPerHr: 'sacos/h',
    efficiency: 'Eficiência',
    uptime: 'Disponibilidade',
    quality: 'Qualidade',
    dailyTarget: 'Meta diária',
    percentComplete: '{value}% concluído',

    machineStatus: 'Status das máquinas',
    running: 'Ativas',
    warning: 'Em alerta',
    critical: 'Críticas',
    idle: 'Ociosas',

    weather: 'Clima',
    weatherValue: (p: { value: string }) => PT_WEATHER[p.value] ?? p.value,
    siteMode: 'Modo da unidade',
    siteModeValue: 'Com equipe · Logística autônoma',

    safetyScore: 'Índice de segurança',
    nearMisses: 'Quase acidentes',
    safetyStops: 'Paradas de segurança',
    daysSafe: 'Dias sem ocorrência',

    dockStatus: 'Status das docas',
    receiving: 'Recebimento',
    shipping: 'Expedição',
    dockState: (p: { value: string }) => PT_DOCK_STATUS[p.value] ?? p.value,
    unloading: 'Descarregando',
    nextTruck: 'Próximo caminhão em {minutes} min',
    eta: 'Previsão: {minutes} min',

    planLogistics: 'Planejar logística',
    predictiveMaintenance: 'Manutenção preditiva',
    loadingMaintenance: 'Carregando o painel de manutenção...',
    totalBagsProduced: 'Total de sacos produzidos',

    quickActions: 'Ações rápidas',
    achievements: 'Conquistas',
    replayHistory: 'Reproduzir o histórico',
    replay: 'Reproduzir',
    miniMap: 'Minimapa',
    screenshot: 'Capturar tela',
    exportReport: 'Exportar relatório',
    export: 'Exportar',
  },
});
