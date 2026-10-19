import { defineMessages } from '../../../i18n';

const PT_ALERT_TYPES: Record<string, string> = {
  critical: 'crítico',
  warning: 'alerta',
  safety: 'segurança',
  success: 'sucesso',
  info: 'informação',
};

export const statusHudMessages = defineMessages({
  en: {
    defaultWorkspace: 'Overview',
    bannerLabel: 'System status bar',
    repositionLabel:
      'Reposition status bar. Drag with the mouse, or use the arrow keys to move it; hold Shift for larger steps. Press Home to dock it.',
    metricsLabel: 'Live operational metrics',
    fpsLabel: '{fps} frames per second',
    fpsValue: '{fps} FPS',
    throughputLabel: 'Final packer throughput {value} bags per hour',
    throughputTitle: 'Measured from final-stage packer mass flow',
    production: 'Production',
    throughputValue: '{value} bags/h',
    lineIdleLabel: 'Line idle: the active order is packed and awaiting dispatch',
    lineIdleTitle:
      'The rest of this order is already packed. Milling resumes once it is dispatched.',
    lineIdleText: 'Line idle: order packed, awaiting dispatch',
    lineChangeoverLabel: 'Changing over: the line is starting the next order, for {customer}',
    lineChangeoverTitle:
      "The rest of this order is packed and waits for its truck. The line is filling with the next commitment's grain, so packing resumes shortly.",
    lineChangeoverText: 'Changing over to the next order',
    agreementPacingLabel: 'The cooperative agreement paces the line at {value}% of the plant rate',
    agreementPacingTitle:
      'The cooperative season runs to its agreed plan, which sets the line pace. The Bilateral Autonomy System (BAS) panel shows the plan and who chose it.',
    agreementPacingText: 'Agreement pacing {value}%',
    agreementBetweenLabel:
      'The cooperative agreement is between shifts, so it is not pacing the line',
    agreementBetweenText: 'Agreement between shifts',
    dailyTargetLabel: 'Daily target {produced} of {target} bags',
    targetValue: 'Target {produced} / {target}',
    runWindowLabel: '{shift} run window, simulation time {time}',
    shiftMorning: 'morning',
    shiftAfternoon: 'afternoon',
    shiftNight: 'night',
    safetyScoreLabel: 'Safety score: {score} percent',
    safetyScoreValue: '{score}% safety',
    scadaEnabledLabel: 'Simulated SCADA telemetry enabled',
    scadaDisabledLabel: 'SCADA telemetry disabled',
    scadaSimulated: 'SCADA SIMULATED',
    scadaDisabled: 'SCADA DISABLED',
    bellLabel: (p: { count: string; n: number }) => `Notifications (${p.count} unread)`,
    notifications: 'Notifications',
    closeNotifications: 'Close notifications',
    allClear: 'All clear.',
    // The dot is colour-only; this names the alert type for screen readers.
    alertType: (p: { type: string }) => p.type,
    acknowledge: 'Acknowledge',
    acknowledgeLabel: 'Acknowledge {title}',
    dismiss: 'Dismiss',
    dismissLabel: 'Dismiss {title}',
    markAllRead: 'Mark all as read',
  },
  'pt-BR': {
    defaultWorkspace: 'Visão geral',
    bannerLabel: 'Barra de status do sistema',
    repositionLabel:
      'Reposicionar a barra de status. Arraste com o mouse ou use as setas do teclado para movê-la; segure Shift para passos maiores. Pressione Home para devolvê-la à posição original.',
    metricsLabel: 'Métricas operacionais ao vivo',
    fpsLabel: '{fps} quadros por segundo',
    fpsValue: '{fps} FPS',
    throughputLabel: 'Vazão da ensacadeira final: {value} sacos por hora',
    throughputTitle: 'Medida a partir do fluxo de massa da ensacadeira final',
    production: 'Produção',
    throughputValue: '{value} sacos/h',
    lineIdleLabel: 'Linha ociosa: o pedido ativo está ensacado e aguardando expedição',
    lineIdleTitle:
      'O restante deste pedido já está ensacado. A moagem é retomada assim que ele for expedido.',
    lineIdleText: 'Linha ociosa: pedido ensacado, aguardando expedição',
    lineChangeoverLabel:
      'Troca de pedido: a linha está começando o próximo pedido, para {customer}',
    lineChangeoverTitle:
      'O restante deste pedido está ensacado e aguarda o caminhão. A linha está recebendo o grão do próximo compromisso, então o ensaque volta em breve.',
    lineChangeoverText: 'Trocando para o próximo pedido',
    agreementPacingLabel:
      'O acordo da cooperativa define o ritmo da linha em {value}% da taxa da planta',
    agreementPacingTitle:
      'A temporada cooperativa segue o plano acordado, que define o ritmo da linha. O painel Sistema de Autonomia Bilateral (BAS) mostra o plano e quem o escolheu.',
    agreementPacingText: 'Ritmo do acordo {value}%',
    agreementBetweenLabel:
      'O acordo da cooperativa está entre turnos, então não define o ritmo da linha',
    agreementBetweenText: 'Acordo entre turnos',
    dailyTargetLabel: 'Meta diária: {produced} de {target} sacos',
    targetValue: 'Meta {produced} / {target}',
    runWindowLabel: 'Janela de operação da {shift}, horário da simulação {time}',
    shiftMorning: 'manhã',
    shiftAfternoon: 'tarde',
    shiftNight: 'noite',
    safetyScoreLabel: 'Índice de segurança: {score} por cento',
    safetyScoreValue: '{score}% de segurança',
    scadaEnabledLabel: 'Telemetria SCADA simulada ativada',
    scadaDisabledLabel: 'Telemetria SCADA desativada',
    scadaSimulated: 'SCADA SIMULADO',
    scadaDisabled: 'SCADA DESATIVADO',
    bellLabel: (p: { count: string; n: number }) =>
      `Notificações (${p.count} ${p.n === 1 ? 'não lida' : 'não lidas'})`,
    notifications: 'Notificações',
    closeNotifications: 'Fechar notificações',
    allClear: 'Tudo em ordem.',
    alertType: (p: { type: string }) => PT_ALERT_TYPES[p.type] ?? p.type,
    acknowledge: 'Reconhecer',
    acknowledgeLabel: 'Reconhecer {title}',
    dismiss: 'Dispensar',
    dismissLabel: 'Dispensar {title}',
    markAllRead: 'Marcar todas como lidas',
  },
});
