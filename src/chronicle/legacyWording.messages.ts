import { defineMessages } from '../i18n';

/**
 * Results an answer had in saves from before its effect changed, in both
 * languages (legacyWording.ts LEGACY_RESULTS). A saved record keeps what
 * happened then; these let it be shown and translated as it was.
 */
export const legacyWordingMessages = defineMessages({
  en: {
    // Before plan item 7.7 the hired dryer treated the wet year outright.
    wetIntakeDryer:
      'The dryer brings the intake down to storage moisture and the wet-year penalty lifts.',
  },
  'pt-BR': {
    wetIntakeDryer:
      'O secador leva a recepção à umidade de armazenagem, e a penalidade do ano úmido é suspensa.',
  },
});
