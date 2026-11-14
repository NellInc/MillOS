import { defineMessages } from '../i18n';

/**
 * The driver's pick or drop at a station (forkliftDriveStore workOffer), and
 * why one was refused (workRefusal): the action's name on its button or
 * prompt, and the error line for a refused one.
 */
export const forkliftWorkMessages = defineMessages({
  en: {
    pickup: 'Pick up pallet',
    dropoff: 'Set down pallet',
    forksRaised: 'Lower the forks first',
    forksLow: 'Raise the forks to the deck first',
    tooFast: 'Slow to a creep first',
  },
  'pt-BR': {
    pickup: 'Pegar o palete',
    dropoff: 'Deixar o palete',
    forksRaised: 'Baixe os garfos primeiro',
    forksLow: 'Erga os garfos até a plataforma primeiro',
    tooFast: 'Reduza a velocidade ao mínimo primeiro',
  },
});
