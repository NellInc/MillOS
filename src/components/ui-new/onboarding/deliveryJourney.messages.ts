import { defineMessages } from '../../../i18n';

const PT_GRAIN: Record<string, string> = {
  wheat_grain: 'grão de trigo',
  corn_grain: 'grão de milho',
};

export const deliveryJourneyMessages = defineMessages({
  en: {
    dueNow: 'Due now (simulated)',
    durationHours: '{hours}h {minutes}m',
    durationMinutes: '{minutes}m',
    overdueBy: 'Overdue by {duration} (simulated)',
    dueIn: 'Due in {duration} (simulated)',
    chooseTitle: 'Choose a delivery',
    chooseDetail: 'Choose an available customer in Your shift commitment in Overview.',
    qualityTarget: 'Recipe quality target: {minimum}/100.',
    fulfilledTitle: 'Delivery fulfilled',
    fulfilledDetail:
      '{kg} kg of {product} dispatched for {customer} in recorded manifests. Departed manifests credit this customer. Inspection is a separate milestone.',
    inspectTitle: 'Inspect the line',
    inspectDetail:
      'Select a silo, roller mill, plansifter or packer in the scene. Read its status and buffers before changing the line. Full output buffers can reveal a downstream bottleneck.',
    returnTitle: 'Return to your commitment',
    returnDetail:
      'A different order is active. Choose this customer in Your shift commitment in Overview to continue its live route.',
    checkTitle: 'Check {product}',
    qualityHoldDetail:
      '{qualityTarget} Review the QC batch hold in Overview. Test the affected batch and release conforming output before loading.',
    departureRule:
      'Only a departed manifest credits this customer; packed {product} alone does not.',
    packedRest:
      ' The rest of this order is already packed; the line rests until the next truck collects it.',
    packedRestNext:
      ' The rest of this order is already packed and waits for the next truck, so the line has moved on to the next commitment, for {customer}.',
    tripStatus:
      ' Truck {current} of {total} for this order (up to {capacity} kg each); {left} kg still to ship.',
    nextTruckOnWay: ' The next truck is on its way to the dock.',
    nextTruckDue: ' The next truck is due on site in {minutes} min (simulated).',
    readyToLoadTitle: 'Ready for the shipping truck',
    releasedWaiting: '{kg} kg of released {product} is waiting at shipping.',
    loadingTitle: 'Loading the shipping truck',
    readyToDepartTitle: 'Ready to depart',
    loadingDetail: 'Follow the pallets from the packing line to the docked truck.',
    readyToDepartDetail: 'The outbound load is ready. Watch its departure from the shipping bay.',
    departedTitle: 'Truck departed',
    departedDetail:
      '{lastKg} kg left the shipping bay. Customer receipt: {shippedKg} / {requiredKg} kg for {customer}.',
    grain: (p: { material: string }) => p.material.replace('_', ' '),
    qualityRule: '{qualityTarget} Conforming output must pass QC before loading.',
    prepareTitle: 'Prepare {product}',
    planningDetail:
      "Scheduled grain: {grain}. {quality} Resume the shift to refresh this customer's stock and line setpoint.",
    followTitle: 'Follow the grain',
    followDetail:
      'Source inventory: {sourceKg} kg of {grain}. Line setpoint: {setpoint}%. Released {product}: {releasedKg} kg. {quality} Open SCADA for live line telemetry, or select a machine to read its buffers.',
  },
  'pt-BR': {
    dueNow: 'Vence agora (tempo simulado)',
    durationHours: '{hours}h {minutes}min',
    durationMinutes: '{minutes}min',
    overdueBy: 'Atrasado em {duration} (tempo simulado)',
    dueIn: 'Vence em {duration} (tempo simulado)',
    chooseTitle: 'Escolha uma entrega',
    chooseDetail: 'Escolha um cliente disponível em Seu compromisso do turno, na Visão geral.',
    qualityTarget: 'Meta de qualidade da receita: {minimum}/100.',
    fulfilledTitle: 'Entrega concluída',
    fulfilledDetail:
      '{kg} kg de {product} expedidos para {customer} em romaneios registrados. Os romaneios com saída registrada são creditados a este cliente. A inspeção é uma etapa à parte.',
    inspectTitle: 'Inspecione a linha',
    inspectDetail:
      'Selecione um silo, moinho de rolos, plansifter ou ensacadeira na cena. Leia o status e os estoques intermediários antes de alterar a linha. Estoques intermediários de saída cheios podem revelar um gargalo mais adiante no fluxo.',
    returnTitle: 'Volte ao seu compromisso',
    returnDetail:
      'Outro pedido está ativo. Escolha este cliente em Seu compromisso do turno, na Visão geral, para continuar a rota ao vivo dele.',
    checkTitle: 'Verifique {product}',
    qualityHoldDetail:
      '{qualityTarget} Revise a retenção de lote do CQ na Visão geral. Teste o lote afetado e libere a produção conforme antes do carregamento.',
    departureRule:
      'Só um romaneio com saída registrada é creditado a este cliente; apenas ensacar {product} não basta.',
    packedRest:
      ' O restante deste pedido já está ensacado; a linha fica parada até o próximo caminhão buscá-lo.',
    packedRestNext:
      ' O restante deste pedido já está ensacado e aguarda o próximo caminhão, então a linha já passou ao próximo compromisso, para {customer}.',
    tripStatus:
      ' Caminhão {current} de {total} deste pedido (até {capacity} kg cada); faltam expedir {left} kg.',
    nextTruckOnWay: ' O próximo caminhão está a caminho da doca.',
    nextTruckDue: ' O próximo caminhão chega ao pátio em {minutes} min (tempo simulado).',
    readyToLoadTitle: 'Pronto para o caminhão de expedição',
    releasedWaiting: '{kg} kg liberados de {product} aguardam na expedição.',
    loadingTitle: 'Carregando o caminhão de expedição',
    readyToDepartTitle: 'Pronto para sair',
    loadingDetail: 'Acompanhe os paletes da linha de ensaque até o caminhão na doca.',
    readyToDepartDetail:
      'A carga de saída está pronta. Acompanhe a saída dela pela área de expedição.',
    departedTitle: 'Caminhão saiu',
    departedDetail:
      '{lastKg} kg saíram da área de expedição. Creditado ao cliente {customer}: {shippedKg} / {requiredKg} kg.',
    grain: (p: { material: string }) => PT_GRAIN[p.material] ?? p.material.replace('_', ' '),
    qualityRule:
      '{qualityTarget} A produção conforme precisa passar pelo CQ antes do carregamento.',
    prepareTitle: 'Prepare {product}',
    planningDetail:
      'Grão programado: {grain}. {quality} Retome o turno para atualizar o estoque deste cliente e o setpoint da linha.',
    followTitle: 'Acompanhe o grão',
    followDetail:
      'Estoque de origem: {sourceKg} kg de {grain}. Setpoint da linha: {setpoint}%. Estoque liberado de {product}: {releasedKg} kg. {quality} Abra o SCADA para ver a telemetria da linha ao vivo, ou selecione uma máquina para ler os estoques intermediários dela.',
  },
});
