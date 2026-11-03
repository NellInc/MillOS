import { defineMessages } from '../../i18n';

export const safetyMetricsDisplayMessages = defineMessages({
  en: {
    cleanRecord: 'Clean record',
    justNow: 'just now',
    secondsAgo: '{count}s ago',
    minutesAgo: '{count}m ago',
    hoursAgo: '{count}h ago',
    title: 'Safety Stats',
    liveStatus: 'Blocked-route stops: {stops}',
    stops: 'Route stops',
    lastEvent: 'Last Event',
  },
  'pt-BR': {
    cleanRecord: 'Sem ocorrências',
    justNow: 'agora mesmo',
    secondsAgo: 'há {count}s',
    minutesAgo: 'há {count}min',
    hoursAgo: 'há {count}h',
    title: 'Estatísticas de segurança',
    liveStatus: 'Paradas por rota bloqueada: {stops}',
    stops: 'Paradas por rota',
    lastEvent: 'Último evento',
  },
});
