import { defineMessages, formatFixed } from '../i18n';
import { PT_MACHINE_TYPES } from '../components/ui-new/sidebar/ContextSidebar.messages';

const capitalise = (value: string): string => `${value[0].toUpperCase()}${value.slice(1)}`;

const PT_SHIFT_LABELS: Record<string, string> = {
  morning: 'Manhã',
  afternoon: 'Tarde',
  night: 'Noite',
};

/* "Turno da manhã encerrado": the shift as it reads after "Turno". */
const PT_SHIFT_OF: Record<string, string> = {
  morning: 'da manhã',
  afternoon: 'da tarde',
  night: 'da noite',
};

// The 'semolina' stream is milled from corn: maize meal, fubá (D17; sources in
// src/stores/customerNames.messages.ts). The id stays 'semolina'.
const EN_MATERIALS: Record<string, string> = { semolina: 'cornmeal' };
const PT_MATERIALS: Record<string, string> = {
  flour: 'farinha liberada',
  semolina: 'fubá liberado',
};

type ShiftCaptionParams = { variant: string; shift: string; grade?: string };

// rate is the raw cost; each language formats it, so a kept notice re-words it.
type BreakdownParams = { name: string; machineType: string; workOrderId: string; rate: number };
/* The MachineType enum ('ROLLER_MILL') in words, as the machine inspector shows it. */
const machineTypeWords = (type: string): string => type.toLowerCase().replaceAll('_', ' ');

/** Alerts, celebrations and dispatch hold reasons raised by the unified game tick. */
export const unifiedGameTickMessages = defineMessages({
  en: {
    supplierTraceabilityNote:
      'Supplier notification requires traceability review before dispatch release.',
    incidentAlert:
      '{description} The operations workspace records the response and residual controls.',
    shiftClosedTitle: (p: { shift: string; grade: string }) =>
      `${capitalise(p.shift)} shift closed: grade ${p.grade}`,
    shiftClosedUngradedTitle: (p: { shift: string }) =>
      `${capitalise(p.shift)} shift closed: no customer commitments`,
    shiftClosedUngradedIncidentTitle: (p: { shift: string }) =>
      `${capitalise(p.shift)} shift closed: no customer commitments, an incident still open`,
    shiftClosedNothingDueTitle: (p: { shift: string }) =>
      `${capitalise(p.shift)} shift closed: nothing due yet`,
    shiftClosedNothingDueIncidentTitle: (p: { shift: string }) =>
      `${capitalise(p.shift)} shift closed: nothing due yet, an incident still open`,
    shiftClosedMessage:
      'Its review is in Overview, under Shift debrief: which orders were on time, what held the grade back and what to try next.',
    // The PA caption, spoken word for word, as a person on the tannoy would say
    // it. The bell notice keeps the title and where the review is.
    shiftClosedCaption: (p: ShiftCaptionParams) =>
      `${capitalise(p.shift)} shift's done. ${
        p.variant === 'graded'
          ? `We earned ${/^[AEF]/.test(p.grade ?? '') ? 'an' : 'a'} ${p.grade ?? ''}.`
          : p.variant === 'incident' || p.variant === 'nothingDueIncident'
            ? 'An incident is still open.'
            : p.variant === 'nothingDue'
              ? 'No orders were due yet.'
              : 'We had no orders to fill.'
      }`,
    certificationExpired: 'Quality certification is expired.',
    unresolvedContamination: 'A contamination alert remains unresolved.',
    failedQualityTest: 'The latest laboratory result failed.',
    incidentDispatchIsolation: 'An active operational incident requires dispatch isolation.',
    qualityInterlockNotReleased: 'The quality interlock is not released.',
    departedWithoutLoad: 'Truck departed without a released load.',
    waitingForMaterial: (p: { material: string }) =>
      `Waiting for released ${EN_MATERIALS[p.material] ?? p.material} at the packers.`,
    dispatchQualityHoldTitle: 'Dispatch Quality Hold',
    shippingAwaitingProductTitle: 'Shipping Awaiting Product',
    shippingAwaitingProgrammeTitle: 'Shipping Waiting for a Programme',
    noCommitmentToShip:
      'No customer commitment is open, so packed stock stays in the warehouse for the next programme. Accept the next programme to load this truck.',
    clearBeforeRelease:
      '{reason} Clear the condition before release. While the truck waits at the dock it costs £{rate} per game hour.',
    waitingForProduct: 'Waiting for released product at the packers.',
    shiftLabel: (p: { shift: string }) => capitalise(p.shift),
    breakdownTitle: 'Machine Breakdown',
    breakdownMessage: (p: BreakdownParams) =>
      `${p.name} (${machineTypeWords(p.machineType)}) has broken down due to excessive wear. Open Mill Overview, Maintenance: work order ${p.workOrderId} needs service dispatched, the repair verified and a controlled restart. Each open work order costs £${formatFixed(p.rate, 2, 'en')} per game hour.`,
    wearWarningTitle: 'Wear warning',
    wearWarningMessage:
      '{name} has reached its wear warning and is losing efficiency. Schedule maintenance before it breaks down: Mill Overview, Maintenance and repairs.',
    orderForfeitedTitle: 'Order forfeited',
    orderForfeitedMessage: (p: { customer: string }) =>
      `The order for ${p.customer} ran out of time and is forfeited. Its penalty is booked and the next programme can be taken.`,
    orderForfeitedUnreachableMessage: (p: { customer: string; minimum: number; best: number }) =>
      `The order for ${p.customer} is forfeited: the best the line can make is ${formatFixed(p.best, 1, 'en')}, under its ${formatFixed(p.minimum, 0, 'en')}. Its penalty is booked and the next programme can be taken.`,
  },
  'pt-BR': {
    supplierTraceabilityNote:
      'A notificação do fornecedor exige revisão de rastreabilidade antes da liberação para expedição.',
    incidentAlert:
      '{description} O espaço de trabalho de operações registra a resposta e os controles residuais.',
    shiftClosedTitle: (p: { shift: string; grade: string }) =>
      `Turno ${PT_SHIFT_OF[p.shift] ?? p.shift} encerrado: nota ${p.grade}`,
    shiftClosedUngradedTitle: (p: { shift: string }) =>
      `Turno ${PT_SHIFT_OF[p.shift] ?? p.shift} encerrado: sem compromissos com clientes`,
    shiftClosedUngradedIncidentTitle: (p: { shift: string }) =>
      `Turno ${PT_SHIFT_OF[p.shift] ?? p.shift} encerrado: sem compromissos com clientes, ocorrência ainda aberta`,
    shiftClosedNothingDueTitle: (p: { shift: string }) =>
      `Turno ${PT_SHIFT_OF[p.shift] ?? p.shift} encerrado: nada venceu ainda`,
    shiftClosedNothingDueIncidentTitle: (p: { shift: string }) =>
      `Turno ${PT_SHIFT_OF[p.shift] ?? p.shift} encerrado: nada venceu ainda, ocorrência ainda aberta`,
    shiftClosedMessage:
      'A revisão está na Visão geral, em Balanço do turno: quais pedidos chegaram no prazo, o que impediu uma nota melhor e o que tentar a seguir.',
    shiftClosedCaption: (p: ShiftCaptionParams) =>
      `Fim do turno ${PT_SHIFT_OF[p.shift] ?? p.shift}. ${
        p.variant === 'graded'
          ? `Tiramos nota ${p.grade ?? ''}.`
          : p.variant === 'incident' || p.variant === 'nothingDueIncident'
            ? 'Ainda há uma ocorrência aberta.'
            : p.variant === 'nothingDue'
              ? 'Nenhum pedido venceu ainda.'
              : 'Não tínhamos pedidos para atender.'
      }`,
    certificationExpired: 'A certificação de qualidade está vencida.',
    unresolvedContamination: 'Um alerta de contaminação continua sem resolução.',
    failedQualityTest: 'O resultado de laboratório mais recente foi reprovado.',
    incidentDispatchIsolation: 'Uma ocorrência operacional ativa exige o isolamento da expedição.',
    qualityInterlockNotReleased: 'O intertravamento de qualidade não está liberado.',
    departedWithoutLoad: 'O caminhão saiu sem uma carga liberada.',
    waitingForMaterial: (p: { material: string }) =>
      `Aguardando ${PT_MATERIALS[p.material] ?? p.material} nas ensacadeiras.`,
    dispatchQualityHoldTitle: 'Retenção de qualidade na expedição',
    shippingAwaitingProductTitle: 'Expedição aguardando produto',
    shippingAwaitingProgrammeTitle: 'Expedição aguardando um programa',
    noCommitmentToShip:
      'Nenhum compromisso com cliente está aberto, então o estoque ensacado fica no armazém para o próximo programa. Aceite o próximo programa para carregar este caminhão.',
    clearBeforeRelease:
      '{reason} Resolva a condição antes da liberação. Enquanto o caminhão espera na doca, o custo é de £{rate} por hora de jogo.',
    waitingForProduct: 'Aguardando produto liberado nas ensacadeiras.',
    shiftLabel: (p: { shift: string }) => PT_SHIFT_LABELS[p.shift] ?? capitalise(p.shift),
    breakdownTitle: 'Pane de máquina',
    breakdownMessage: (p: BreakdownParams) =>
      `${p.name} (${PT_MACHINE_TYPES[p.machineType] ?? machineTypeWords(p.machineType)}) entrou em pane por desgaste excessivo. Abra Visão geral do moinho, Manutenção: a ordem de serviço ${p.workOrderId} precisa do envio da equipe, da verificação do reparo e de um reinício controlado. Cada ordem de serviço aberta custa £${formatFixed(p.rate, 2, 'pt-BR')} por hora de jogo.`,
    wearWarningTitle: 'Alerta de desgaste',
    wearWarningMessage:
      '{name} atingiu o alerta de desgaste e está perdendo eficiência. Agende a manutenção antes que entre em pane: Visão geral do moinho, Manutenção e reparos.',
    orderForfeitedTitle: 'Pedido perdido',
    orderForfeitedMessage: (p: { customer: string }) =>
      `O pedido de ${p.customer} ficou sem prazo e foi perdido. A multa foi lançada e o próximo programa pode ser aceito.`,
    orderForfeitedUnreachableMessage: (p: { customer: string; minimum: number; best: number }) =>
      `O pedido de ${p.customer} foi perdido: o melhor que a linha produz é ${formatFixed(p.best, 1, 'pt-BR')}, abaixo do mínimo de ${formatFixed(p.minimum, 0, 'pt-BR')}. A multa foi lançada e o próximo programa pode ser aceito.`,
  },
});
