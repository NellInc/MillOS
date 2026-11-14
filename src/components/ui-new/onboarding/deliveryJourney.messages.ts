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
    repairTitle: 'Repair {machine}',
    repairDetail:
      '{machine} has broken down and its part of the line has stopped. Open Mill Overview, Maintenance: dispatch service on work order {workOrderId}, complete and verify the repair, then request a controlled restart.',
    fulfilledDetail: '{kg} kg of {product} dispatched for {customer} in recorded manifests.',
    inspectTitle: 'Inspect the line',
    inspectDetail:
      'Select a silo, roller mill, plansifter or packer in the scene, or use Inspect a roller mill below.',
    returnTitle: 'Return to your commitment',
    returnDetail:
      'A different order is active. Choose this customer in Your shift commitment in Overview to continue its live route.',
    checkTitle: 'Check {product}',
    qualityHoldDetail:
      '{qualityTarget} {reason} Review the QC controls in Overview and resolve the release condition before loading.',
    qualityHoldUnknown: 'Dispatch quality release is unavailable.',
    packedRest:
      ' The rest of this order is already packed; the line rests until the next truck collects it.',
    packedRestNext:
      ' The rest of this order is already packed and waits for the next truck, so the line has moved on to the next commitment, for {customer}.',
    tripStatus: (p: { loads: number; loadsText: string; capacity: string; left: string }) =>
      ` At least ${p.loadsText} ${p.loads === 1 ? 'load' : 'loads'} needed (up to ${p.capacity} kg each); ${p.left} kg still to ship.`,
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
    prepareTitle: 'Prepare {product}',
    planningDetail:
      "Scheduled grain: {grain}. {quality} Resume the shift to refresh this customer's stock.",
    followTitle: 'Follow the grain',
    followDetail:
      'Source inventory: {sourceKg} kg of {grain}. Production speed: {speed}%. Released {product}: {releasedKg} kg. {quality}',
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
    repairTitle: 'Reparar {machine}',
    repairDetail:
      'A máquina {machine} entrou em pane e a parte dela na linha parou. Abra Visão geral do moinho, Manutenção: envie a equipe na ordem de serviço {workOrderId}, conclua e verifique o reparo e, depois, solicite um reinício controlado.',
    fulfilledDetail: '{kg} kg de {product} expedidos para {customer} em romaneios registrados.',
    inspectTitle: 'Inspecione a linha',
    inspectDetail:
      'Selecione um silo, moinho de rolos, plansifter ou ensacadeira na cena, ou use Inspecionar um moinho de rolos abaixo.',
    returnTitle: 'Volte ao seu compromisso',
    returnDetail:
      'Outro pedido está ativo. Escolha este cliente em Seu compromisso do turno, na Visão geral, para continuar a rota ao vivo dele.',
    checkTitle: 'Verifique {product}',
    qualityHoldDetail:
      '{qualityTarget} {reason} Revise os controles do CQ na Visão geral e resolva a condição de liberação antes do carregamento.',
    qualityHoldUnknown: 'A liberação de qualidade para expedição não está disponível.',
    packedRest:
      ' O restante deste pedido já está ensacado; a linha fica parada até o próximo caminhão buscá-lo.',
    packedRestNext:
      ' O restante deste pedido já está ensacado e aguarda o próximo caminhão, então a linha já passou ao próximo compromisso, para {customer}.',
    tripStatus: (p: { loads: number; loadsText: string; capacity: string; left: string }) =>
      ` ${p.loads === 1 ? 'É necessária pelo menos' : 'São necessárias pelo menos'} ${p.loadsText} ${p.loads === 1 ? 'carga' : 'cargas'} (até ${p.capacity} kg cada); faltam expedir ${p.left} kg.`,
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
    prepareTitle: 'Prepare {product}',
    planningDetail:
      'Grão programado: {grain}. {quality} Retome o turno para atualizar o estoque deste cliente.',
    followTitle: 'Acompanhe o grão',
    followDetail:
      'Estoque de origem: {sourceKg} kg de {grain}. Velocidade de produção: {speed}%. Estoque liberado de {product}: {releasedKg} kg. {quality}',
  },
});
