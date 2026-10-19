import { defineMessages } from '../i18n';

const PT_SCADA_MODE: Record<string, string> = {
  simulation: 'simulação',
  live: 'tempo real',
  hybrid: 'híbrido',
  disconnected: 'desconectado',
};

export const scadaSetpointMessages = defineMessages({
  en: {
    legend: 'Operator setpoint',
    inputLabel: 'New setpoint for {tag} ({unit})',
    apply: 'Apply',
    currentSetpoint: 'Setpoint now {reading}',
    currentReading: '{tag} reads {reading}',
    noReading: 'No reading yet',
    helperFollows:
      'Moves the simulated {tag} toward this value over a few seconds. It does not change throughput: the order plan sets the line rate.',
    helperAlarmBand: 'The reading alarms below {low} or above {high} {unit}.',
    helperNoFollower:
      'Changes this simulated setpoint value only. It does not change throughput: the order plan sets the line rate.',
    invalidNumber: 'Enter a number.',
    outOfRange: 'Enter a value from {low} to {high} {unit}.',
    disabledNotConnected: 'SCADA is not connected, so setpoints cannot be written.',
    disabledMode: (p: { mode: string }) =>
      `Setpoint writes are limited to the local simulation. This SCADA is in ${p.mode} mode.`,
    applied: 'Setpoint {reading} applied.',
    refused: 'The write was refused; the setpoint is unchanged.',
    applying: 'Applying...',
  },
  'pt-BR': {
    legend: 'Setpoint do operador',
    inputLabel: 'Novo setpoint para {tag} ({unit})',
    apply: 'Aplicar',
    currentSetpoint: 'Setpoint atual {reading}',
    currentReading: '{tag}: leitura {reading}',
    noReading: 'Ainda sem leitura',
    helperFollows:
      'Leva a leitura simulada de {tag} até este valor em alguns segundos. Não altera a produção: o plano de pedidos define o ritmo da linha.',
    helperAlarmBand: 'A leitura entra em alarme abaixo de {low} ou acima de {high} {unit}.',
    helperNoFollower:
      'Altera apenas este valor de setpoint simulado. Não altera a produção: o plano de pedidos define o ritmo da linha.',
    invalidNumber: 'Digite um número.',
    outOfRange: 'Digite um valor de {low} a {high} {unit}.',
    disabledNotConnected: 'O SCADA não está conectado, então não é possível escrever setpoints.',
    disabledMode: (p: { mode: string }) =>
      `Escritas de setpoint são limitadas à simulação local. Este SCADA está em modo ${PT_SCADA_MODE[p.mode] ?? p.mode}.`,
    applied: 'Setpoint {reading} aplicado.',
    refused: 'A escrita foi recusada; o setpoint não mudou.',
    applying: 'Aplicando...',
  },
});
