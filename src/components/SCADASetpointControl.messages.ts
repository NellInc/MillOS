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
    currentReadingBand: '{tag} reads {reading}; alarms outside {low}–{high} {unit}',
    noReading: 'No reading yet',
    invalidNumber: 'Enter a number.',
    outOfRange: 'Enter a value from {low} to {high} {unit}.',
    disabledNotConnected: 'SCADA is not connected, so setpoints cannot be written.',
    disabledMode: (p: { mode: string }) =>
      `Setpoint writes are limited to the local simulation. This SCADA is in ${p.mode} mode.`,
    applied: 'Setpoint {reading} applied.',
    appliedFollows: 'Setpoint {reading} applied. {tag} moves toward it over a few seconds.',
    appliedRate:
      'Line rate now {rate}% on every mill. Per tonne: wear ×{wear}, energy ×{energy} against 100%.',
    appliedStopped: 'Line rate now 0%: the mills mill nothing.',
    refused: 'The write was refused; the setpoint is unchanged.',
    applying: 'Applying...',
  },
  'pt-BR': {
    legend: 'Setpoint do operador',
    inputLabel: 'Novo setpoint para {tag} ({unit})',
    apply: 'Aplicar',
    currentSetpoint: 'Setpoint atual {reading}',
    currentReading: '{tag}: leitura {reading}',
    currentReadingBand: '{tag}: leitura {reading}; alarme fora de {low}–{high} {unit}',
    noReading: 'Ainda sem leitura',
    invalidNumber: 'Digite um número.',
    outOfRange: 'Digite um valor de {low} a {high} {unit}.',
    disabledNotConnected: 'O SCADA não está conectado, então não é possível escrever setpoints.',
    disabledMode: (p: { mode: string }) =>
      `Escritas de setpoint são limitadas à simulação local. Este SCADA está em modo ${PT_SCADA_MODE[p.mode] ?? p.mode}.`,
    applied: 'Setpoint {reading} aplicado.',
    appliedFollows: 'Setpoint {reading} aplicado. {tag} segue até ele em alguns segundos.',
    appliedRate:
      'Ritmo da linha agora em {rate}% em todos os moinhos. Por tonelada: desgaste ×{wear}, energia ×{energy} em relação a 100%.',
    appliedStopped: 'Ritmo da linha agora em 0%: os moinhos não moem nada.',
    refused: 'A escrita foi recusada; o setpoint não mudou.',
    applying: 'Aplicando...',
  },
});
