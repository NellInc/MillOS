import { defineMessages } from '../i18n';

export const fpsInstructionsMessages = defineMessages({
  en: {
    heading: 'First-Person Mode',
    captureFailed: 'Mouse capture unavailable. Click to retry or press V to leave.',
    clickToEnter: 'Click anywhere to enter first-person exploration mode',
    moveAround: 'Move around',
    moveDownUp: 'Move down / up',
    mouse: 'Mouse',
    lookAround: 'Look around',
    sprint: 'Sprint',
    exitFirstPerson: 'Exit first-person',
    forklift: 'Drive or leave a forklift',
    returnToOverview: 'Return to overview',
    pressEsc: 'Press ESC anytime to return to orbit camera',
  },
  'pt-BR': {
    heading: 'Modo em primeira pessoa',
    captureFailed:
      'Captura do mouse indisponível. Clique para tentar de novo ou pressione V para sair.',
    clickToEnter: 'Clique em qualquer lugar para entrar no modo de exploração em primeira pessoa',
    moveAround: 'Mover-se',
    moveDownUp: 'Descer / subir',
    mouse: 'Mouse',
    lookAround: 'Olhar ao redor',
    sprint: 'Correr',
    exitFirstPerson: 'Sair da visão em primeira pessoa',
    forklift: 'Dirigir ou descer da empilhadeira',
    returnToOverview: 'Voltar à visão geral',
    pressEsc: 'Pressione ESC a qualquer momento para voltar à câmera orbital',
  },
});

export const forkliftPromptMessages = defineMessages({
  en: {
    drive: 'Drive {tag}',
    leave: 'Step down',
    raiseForks: 'Raise forks',
    lowerForks: 'Lower forks',
  },
  'pt-BR': {
    drive: 'Dirigir {tag}',
    leave: 'Descer',
    raiseForks: 'Erguer garfos',
    lowerForks: 'Baixar garfos',
  },
});
