import { defineMessages } from '../i18n';

export const useSCADAMessages = defineMessages({
  en: {
    defaultControlSource: 'Autonomous control layer',
  },
  'pt-BR': {
    // Matches SCADAPanel's defaultControlIdentity so every acknowledgement
    // path records the same identity in a given language.
    defaultControlSource: 'Camada de controle autônomo',
  },
});
