import { defineMessages } from '../i18n';

/**
 * The alarm's literal condition, stored on the alarm when it is raised.
 * The alarm type (HI, HIHI, LO, LOLO) and the engineering unit are SCADA
 * codes and stay as they are in both languages.
 */
export const alarmManagerMessages = defineMessages({
  en: {
    sourceQualityBad: 'Source quality is BAD',
    thresholdCondition: '{type} threshold {threshold} {unit}',
  },
  'pt-BR': {
    sourceQualityBad: 'A qualidade da fonte é BAD',
    thresholdCondition: 'limite {type} {threshold} {unit}',
  },
});
