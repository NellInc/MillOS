import { defineMessages, formatFixed } from '../../../i18n';

type CountParams = { count: number };
type DockStateParams = { status: string };

const PT_DOCK_STATUS: Record<string, string> = {
  arriving: 'chegando',
  loading: 'carregando',
  departing: 'saindo',
  clear: 'livre',
};

const ptDockStatus = (status: string): string => PT_DOCK_STATUS[status] ?? status;

export const autonomyPanelMessages = defineMessages({
  en: {
    plantStateTitle: 'Autonomous plant state',
    readinessIndex: 'readiness index',
    metricsLabel: 'Autonomy metrics',
    activeAssets: 'Active assets',
    activeAssetsDetail: (p: CountParams) =>
      `${p.count} ${p.count === 1 ? 'needs' : 'need'} diagnostic attention`,
    throughput: 'Throughput',
    throughputDetail: 'bags per simulated hour',
    programme: 'Programme',
    programmeDetail: '{shipped} of {committed} t shipped',
    safetyStops: 'Safety stops',
    safetyStopsDetail: (p: CountParams) =>
      `${p.count} blocked-route ${p.count === 1 ? 'stop' : 'stops'} recorded`,
    coordinationHeading: 'Closed-loop coordination',
    processControl: 'Process control',
    processAgree: 'Machine states and targets agree.',
    processHeld: (p: CountParams) =>
      `${p.count} ${p.count === 1 ? 'alarm is' : 'alarms are'} holding the plan back.`,
    vehicleOrchestration: 'Vehicle orchestration',
    forkliftsGrounded: 'The safety layer has grounded the forklifts.',
    forkliftsShare: 'Forklifts, docks, and crossings share reservations.',
    receivingSequence: 'Receiving sequence',
    receivingDockState: (p: DockStateParams) => `Receiving dock state: ${p.status}.`,
    shippingSequence: 'Shipping sequence',
    shippingDockState: (p: DockStateParams) => `Shipping dock state: ${p.status}.`,
  },
  'pt-BR': {
    plantStateTitle: 'Estado da planta autônoma',
    readinessIndex: 'índice de prontidão',
    metricsLabel: 'Métricas de autonomia',
    activeAssets: 'Ativos em operação',
    activeAssetsDetail: (p: CountParams) =>
      `${formatFixed(p.count, 0, 'pt-BR')} ${p.count === 1 ? 'precisa' : 'precisam'} de atenção de diagnóstico`,
    throughput: 'Vazão',
    throughputDetail: 'sacos por hora simulada',
    programme: 'Programa',
    programmeDetail: '{shipped} de {committed} t expedidas',
    safetyStops: 'Paradas de segurança',
    safetyStopsDetail: (p: CountParams) =>
      p.count === 1
        ? `${formatFixed(p.count, 0, 'pt-BR')} parada por rota bloqueada registrada`
        : `${formatFixed(p.count, 0, 'pt-BR')} paradas por rota bloqueada registradas`,
    coordinationHeading: 'Coordenação em malha fechada',
    processControl: 'Controle de processo',
    processAgree: 'Os estados das máquinas e as metas estão de acordo.',
    processHeld: (p: CountParams) =>
      p.count === 1
        ? `${formatFixed(p.count, 0, 'pt-BR')} alarme está travando o plano.`
        : `${formatFixed(p.count, 0, 'pt-BR')} alarmes estão travando o plano.`,
    vehicleOrchestration: 'Orquestração de veículos',
    forkliftsGrounded: 'A camada de segurança imobilizou as empilhadeiras.',
    forkliftsShare: 'Empilhadeiras, docas e cruzamentos compartilham reservas.',
    receivingSequence: 'Sequência de recebimento',
    receivingDockState: (p: DockStateParams) =>
      `Estado da doca de recebimento: ${ptDockStatus(p.status)}.`,
    shippingSequence: 'Sequência de expedição',
    shippingDockState: (p: DockStateParams) =>
      `Estado da doca de expedição: ${ptDockStatus(p.status)}.`,
  },
});
