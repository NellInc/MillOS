import { defineMessages } from '../../i18n';

export const safetyMetricsDisplayMessages = defineMessages({
  en: {
    cleanRecord: 'Clean record',
    justNow: 'just now',
    secondsAgo: '{count}s ago',
    minutesAgo: '{count}m ago',
    hoursAgo: '{count}h ago',
    title: 'Safety Stats',
    liveStatus: 'Safety stops: {stops}, route conflicts: {conflicts}',
    stops: 'Stops',
    conflicts: 'Conflicts',
    lastEvent: 'Last Event',
  },
  'pt-BR': {
    cleanRecord: 'Sem ocorrências',
    justNow: 'agora mesmo',
    secondsAgo: 'há {count}s',
    minutesAgo: 'há {count}min',
    hoursAgo: 'há {count}h',
    title: 'Estatísticas de segurança',
    liveStatus: 'Paradas de segurança: {stops}, conflitos de rota: {conflicts}',
    stops: 'Paradas',
    conflicts: 'Conflitos',
    lastEvent: 'Último evento',
  },
});
