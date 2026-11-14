import { defineMessages } from '../../i18n';

/** The bell notice for a truck a forklift is holding (truckForkliftHold.ts). */
export const truckForkliftHoldMessages = defineMessages({
  en: {
    title: 'Truck waiting for {tag}',
    pathShipping: '{tag} is in the shipping truck’s path.',
    pathReceiving: '{tag} is in the receiving truck’s path.',
    laneShipping: '{tag} is in the shipping dock lane, so the truck cannot leave.',
    laneReceiving: '{tag} is in the receiving dock lane, so the truck cannot leave.',
  },
  'pt-BR': {
    title: 'Caminhão aguardando {tag}',
    pathShipping: '{tag} está no caminho do caminhão de expedição.',
    pathReceiving: '{tag} está no caminho do caminhão de recebimento.',
    laneShipping: '{tag} está na faixa da doca de expedição, e o caminhão não pode sair.',
    laneReceiving: '{tag} está na faixa da doca de recebimento, e o caminhão não pode sair.',
  },
});
