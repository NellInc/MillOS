import { defineMessages } from '../i18n';

/**
 * Decision cards written by the autonomous plant decision engine.
 *
 * Each card's action and impact say what accepting it does in
 * applyDecisionEffects, and no more (review 10, F3). Prediction and
 * coordination cards change nothing when accepted, and say so.
 *
 * aiEngine.ts classifies decisions by matching words in this copy (prevented
 * shutdowns, audio cues). Its patterns list the pt-BR words beside the English
 * ones, so keep "manutenção", "estado seguro" and "anomalia" in the pt-BR
 * maintenance, safety and prediction texts, and out of the others.
 */
export const aiEngineMessages = defineMessages({
  en: {
    coordinationAction: 'Service route demand at {machine}',
    coordinationReasoning:
      'The route planner detected equipment demand at {machineId} with {load} percent load.',
    coordinationImpact: 'A notice only: accepting changes nothing on the plant.',
    maintenanceAction: 'Return {machine} to warning if it is critical',
    maintenanceReasoning:
      'Telemetry reports {temperature} C, {vibration} mm/s vibration, and {wear} percent wear.',
    maintenanceImpact:
      'Books no maintenance. A worn-out or broken-down unit stays stopped; in an emergency the return waits for the release.',
    safetyAction: 'Put {machine} in a safe state',
    safetyReasoning:
      'The autonomous safety layer detected a limit or test condition requiring isolation.',
    safetyImpact: 'Idles the unit if it is running; one already stopped stays as it is.',
    predictionAction: 'Statistical anomaly detected on {machine}',
    predictionReasoning:
      'Trend analysis combines {temperature} C, {vibration} mm/s vibration, {load} percent load, and {wear} percent wear.',
    predictionImpact: 'A notice only: accepting changes nothing on the plant.',
    optimizationAction: 'Lower the line rate by 2% for the load on {machine}',
    optimizationReasoning:
      'The line is carrying {load} percent load at {efficiency} percent local efficiency.',
    optimizationImpact: 'Lowers the whole line rate by 2%, never below 55%.',
    completedAutomatic: 'Completed by autonomous control layer',
    completedConfirmed: 'Completed after control confirmation',
    deferralReturned:
      'Deferred {hours} plant hour and back for a decision. It lapses if left another {lapse} plant hours.',
    deferralLapsed:
      'Deferred and not taken up within {hours} plant hours; superseded. A fresh card follows if the condition holds.',
    completedModified: 'Completed after operator modification',
    cardRetired: 'Withdrawn: cards of this kind changed nothing when accepted.',
    strategicReasoningFallback: 'Strategic analysis complete.',
    strategicAction: 'Strategic: {priority}',
    strategicAdditionalPriorities: 'Additional priorities: {priorities}',
    strategicRecorded: 'Strategic guidance recorded for the tactical controller.',
    chatgptRequestFailed: 'ChatGPT request failed.',
    // Agreed adjustments (aiAccommodation.ts, D-058). What a person asked for,
    // never a diagnosis; no number about anyone.
    accessAlertAction: 'Alarm sent as light and vibration as well as sound',
    accessAlertReasoningDrill:
      'The egress verification drill raised the alarm. As agreed with the shift supervisor, the east roller mill operator gets every alarm as light and vibration: every hall strobe and the lamp at their workpost are flashing, and their pager confirmed delivery.',
    accessAlertReasoningEmergency:
      'An emergency raised the alarm. As agreed with the shift supervisor, the east roller mill operator gets every alarm as light and vibration: every hall strobe and the lamp at their workpost are flashing, and their pager confirmed delivery.',
    accessAlertReasoningForklift:
      'The forklift emergency stop raised the alarm. As agreed with the shift supervisor, the east roller mill operator gets every alarm as light and vibration: every hall strobe and the lamp at their workpost are flashing, and their pager confirmed delivery.',
    accessAlertImpact:
      'Nobody has to hear the alarm to know it is sounding. Urgent PA lines are always captioned on screen, and the rest while captions are on, as they are by default.',
    accessEgressClearFront: 'Front Service Egress: step-free route and refuge point clear',
    accessEgressClearBack: 'Back Service Egress: step-free route and refuge point clear',
    accessEgressClearWest: 'West Service Egress: step-free route and refuge point clear',
    accessEgressClearEast: 'East Service Egress: step-free route and refuge point clear',
    accessEgressHeldFront: 'Front Service Egress: verification waits for a step-free route',
    accessEgressHeldBack: 'Back Service Egress: verification waits for a step-free route',
    accessEgressHeldWest: 'West Service Egress: verification waits for a step-free route',
    accessEgressHeldEast: 'East Service Egress: verification waits for a step-free route',
    accessEgressClearReasoning:
      'Checked before the zone was verified: its step-free route to the exit and its refuge point are clear of stopped vehicles, so a wheelchair user can leave the same way as everyone else.',
    accessEgressAltFront: 'Front Service Egress: verified on its step-free alternative',
    accessEgressAltBack: 'Back Service Egress: verified on its step-free alternative',
    accessEgressAltWest: 'West Service Egress: verified on its step-free alternative',
    accessEgressAltEast: 'East Service Egress: verified on its step-free alternative',
    accessEgressAlternativeReasoningWest:
      "A stopped forklift stands on this zone's own step-free route. It is verified on its agreed alternative, the west service door's step-free route, which is clear.",
    accessEgressAlternativeReasoningEast:
      "A stopped forklift stands on this zone's own step-free route. It is verified on its agreed alternative, the east service door's step-free route, which is clear.",
    accessEgressClearReasoningFront:
      'Checked before the zone was verified: its step-free route along the east walkway to the level door beside the shipping dock, and the refuge point outside that door, are clear of stopped vehicles. The dock deck is a metre up, so this door is the way out for everyone.',
    accessEgressClearReasoningBack:
      'Checked before the zone was verified: its step-free route along the east walkway to the level door beside the receiving dock, and the refuge point outside that door, are clear of stopped vehicles. The dock deck is a metre up, so this door is the way out for everyone.',
    accessEgressBlockedReasoning:
      "Stopped vehicles stand on this zone's step-free route and on its alternative. A zone is verified only with a step-free way out, so it stays unverified; personnel hold their safe positions, and END DRILL remains available.",
    accessEgressImpact:
      'Egress is verified for everyone who works here, not only for those who can use steps.',
    accessQuietAction: 'Moved the air-line purge from {from} to {to}',
    accessQuietReasoning:
      'The quiet room is booked from {from} to {to} by a packing operator who asked for it for their breaks. The purge is loud enough to carry into it, so it runs when the booking ends.',
    accessQuietImpact: 'The break stays quiet, and the purge still runs today.',
  },
  'pt-BR': {
    coordinationAction: 'Demanda de rota de serviço em {machine}',
    coordinationReasoning:
      'O planejador de rotas detectou demanda de equipamento em {machineId} com {load}% de carga.',
    coordinationImpact: 'Só um aviso: aceitar não muda nada na planta.',
    maintenanceAction: 'Voltar {machine} para alerta se estiver em estado crítico',
    maintenanceReasoning:
      'A telemetria indica {temperature} °C, vibração de {vibration} mm/s e {wear}% de desgaste.',
    maintenanceImpact:
      'Não programa manutenção. Uma unidade desgastada ou em pane continua parada; numa emergência, o retorno espera a liberação.',
    safetyAction: 'Colocar {machine} em estado seguro',
    safetyReasoning:
      'A camada de segurança autônoma detectou uma condição de limite ou de teste que exige isolamento.',
    safetyImpact: 'Para a unidade se estiver operando; uma já parada continua como está.',
    predictionAction: 'Anomalia estatística detectada em {machine}',
    predictionReasoning:
      'A análise de tendência combina {temperature} °C, vibração de {vibration} mm/s, {load}% de carga e {wear}% de desgaste.',
    predictionImpact: 'Só um aviso: aceitar não muda nada na planta.',
    optimizationAction: 'Reduzir a taxa da linha em 2% pela carga em {machine}',
    optimizationReasoning:
      'A linha opera com {load}% de carga e {efficiency}% de eficiência local.',
    optimizationImpact: 'Reduz a taxa de toda a linha em 2%, nunca abaixo de 55%.',
    completedAutomatic: 'Concluída pela camada de controle autônoma',
    completedConfirmed: 'Concluída após confirmação do controle',
    deferralReturned:
      'Adiada por {hours} hora de planta e de volta para decisão. Expira se ficar mais {lapse} horas de planta.',
    deferralLapsed:
      'Adiada e não retomada em {hours} horas de planta; substituída. Um novo cartão vem se a condição continuar.',
    completedModified: 'Concluída após modificação do operador',
    cardRetired: 'Retirado: cartões deste tipo não mudavam nada quando aceitos.',
    strategicReasoningFallback: 'Análise estratégica concluída.',
    strategicAction: 'Estratégia: {priority}',
    strategicAdditionalPriorities: 'Prioridades adicionais: {priorities}',
    strategicRecorded: 'Orientação estratégica registrada para o controlador tático.',
    chatgptRequestFailed: 'A solicitação ao ChatGPT falhou.',
    accessAlertAction: 'Alarme enviado também como luz e vibração, além do som',
    accessAlertReasoningDrill:
      'A verificação das rotas de saída acionou o alarme. Como combinado com a supervisão do turno, quem opera o moinho de rolos leste recebe todo alarme como luz e vibração: todos os sinalizadores visuais do galpão e a lâmpada do seu posto estão piscando, e o pager confirmou a entrega.',
    accessAlertReasoningEmergency:
      'Uma emergência acionou o alarme. Como combinado com a supervisão do turno, quem opera o moinho de rolos leste recebe todo alarme como luz e vibração: todos os sinalizadores visuais do galpão e a lâmpada do seu posto estão piscando, e o pager confirmou a entrega.',
    accessAlertReasoningForklift:
      'A parada de emergência das empilhadeiras acionou o alarme. Como combinado com a supervisão do turno, quem opera o moinho de rolos leste recebe todo alarme como luz e vibração: todos os sinalizadores visuais do galpão e a lâmpada do seu posto estão piscando, e o pager confirmou a entrega.',
    accessAlertImpact:
      'Ninguém precisa ouvir o alarme para saber que ele está tocando. Os avisos urgentes sempre aparecem legendados na tela, e os demais enquanto as legendas estiverem ligadas, como vêm por padrão.',
    accessEgressClearFront:
      'Rota de saída de serviço frontal: rota sem degraus e ponto de refúgio livres',
    accessEgressClearBack:
      'Rota de saída de serviço dos fundos: rota sem degraus e ponto de refúgio livres',
    accessEgressClearWest:
      'Rota de saída de serviço oeste: rota sem degraus e ponto de refúgio livres',
    accessEgressClearEast:
      'Rota de saída de serviço leste: rota sem degraus e ponto de refúgio livres',
    accessEgressHeldFront:
      'Rota de saída de serviço frontal: a verificação aguarda uma rota sem degraus',
    accessEgressHeldBack:
      'Rota de saída de serviço dos fundos: a verificação aguarda uma rota sem degraus',
    accessEgressHeldWest:
      'Rota de saída de serviço oeste: a verificação aguarda uma rota sem degraus',
    accessEgressHeldEast:
      'Rota de saída de serviço leste: a verificação aguarda uma rota sem degraus',
    accessEgressClearReasoning:
      'Conferido antes de a zona ser verificada: a rota sem degraus até a saída e o ponto de refúgio estão livres de veículos parados, então quem usa cadeira de rodas sai pelo mesmo caminho que todos.',
    accessEgressAltFront:
      'Rota de saída de serviço frontal: verificada pela alternativa sem degraus',
    accessEgressAltBack:
      'Rota de saída de serviço dos fundos: verificada pela alternativa sem degraus',
    accessEgressAltWest: 'Rota de saída de serviço oeste: verificada pela alternativa sem degraus',
    accessEgressAltEast: 'Rota de saída de serviço leste: verificada pela alternativa sem degraus',
    accessEgressAlternativeReasoningWest:
      'Uma empilhadeira parada está na rota sem degraus desta zona. Ela é verificada pela alternativa combinada, a rota sem degraus da porta de serviço oeste, que está livre.',
    accessEgressAlternativeReasoningEast:
      'Uma empilhadeira parada está na rota sem degraus desta zona. Ela é verificada pela alternativa combinada, a rota sem degraus da porta de serviço leste, que está livre.',
    accessEgressClearReasoningFront:
      'Conferido antes de a zona ser verificada: a rota sem degraus pela passarela leste até a porta nivelada ao lado da doca de expedição, e o ponto de refúgio do lado de fora dessa porta, estão livres de veículos parados. A plataforma da doca fica um metro acima, então esta porta é a saída de todos.',
    accessEgressClearReasoningBack:
      'Conferido antes de a zona ser verificada: a rota sem degraus pela passarela leste até a porta nivelada ao lado da doca de recebimento, e o ponto de refúgio do lado de fora dessa porta, estão livres de veículos parados. A plataforma da doca fica um metro acima, então esta porta é a saída de todos.',
    accessEgressBlockedReasoning:
      'Há veículos parados na rota sem degraus desta zona e na sua alternativa. Uma zona só é verificada com uma saída sem degraus, então ela segue sem verificação; as pessoas mantêm suas posições seguras, e ENCERRAR SIMULADO continua disponível.',
    accessEgressImpact:
      'As saídas ficam verificadas para todas as pessoas que trabalham aqui, não só para quem consegue usar escadas.',
    accessQuietAction: 'Purga da linha de ar movida de {from} para {to}',
    accessQuietReasoning:
      'A sala silenciosa está reservada de {from} a {to} por quem opera a embalagem e pediu a sala para os intervalos. A purga faz barulho suficiente para chegar lá dentro, então ela roda quando a reserva termina.',
    accessQuietImpact: 'O intervalo continua silencioso, e a purga ainda acontece hoje.',
  },
});
