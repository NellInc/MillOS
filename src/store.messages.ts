import { defineMessages } from './i18n';

export const storeMessages = defineMessages({
  en: {
    alarmBadQuality: '{tag}: source signal quality is BAD',
    alarmOn: 'on',
    alarmOff: 'off',
    alarmBool: '{tag}: {state}, expected {expected}',
    alarmAtOrBelow: 'at or below',
    alarmAtOrAbove: 'at or above',
    alarmThreshold: '{tag}: {value}{unit}, {direction} the {threshold}{unit} limit',
    scadaAlertTitle: 'SCADA: {type}',
    alarmTypeBadQuality: 'BAD QUALITY',
    alarmTypeRateOfChange: 'RATE OF CHANGE',
  },
  'pt-BR': {
    alarmBadQuality: '{tag}: a qualidade do sinal de origem é BAD',
    alarmOn: 'ligado',
    alarmOff: 'desligado',
    alarmBool: '{tag}: {state}, o esperado era {expected}',
    alarmAtOrBelow: 'igual ou abaixo do',
    alarmAtOrAbove: 'igual ou acima do',
    alarmThreshold: '{tag}: {value}{unit}, {direction} limite de {threshold}{unit}',
    scadaAlertTitle: 'SCADA: {type}',
    alarmTypeBadQuality: 'QUALIDADE RUIM',
    alarmTypeRateOfChange: 'TAXA DE VARIAÇÃO',
  },
});
