import { defineMessages } from '../i18n';

/** The plant-clock stamp on logged plant events (alerts, incidents, PA lines). */
export const timeFormattingMessages = defineMessages({
  en: {
    plantStamp: 'Day {day}, {time}',
  },
  'pt-BR': {
    plantStamp: 'Dia {day}, {time}',
  },
});
