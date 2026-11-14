import { defineMessages } from '../i18n';

export const fpsInstructionsMessages = defineMessages({
  en: {
    heading: 'First-Person Mode',
    captureFailed: 'Mouse capture unavailable. Click to retry or press V to leave.',
    clickToEnter: 'Click anywhere to enter first-person exploration mode',
    moveAround: 'Move around',
    jump: 'Jump',
    mouse: 'Mouse',
    lookAround: 'Look around',
    sprint: 'Sprint',
    exitFirstPerson: 'Exit first-person',
    forklift: 'Drive or leave a forklift, ring the school bell',
    forks: 'Raise and lower the forks',
    forkliftStop: 'Stop the forklifts',
    keyClick: 'Click',
    keySpace: 'Space',
    returnToOverview: 'Return to overview',
    pressEsc: 'Press ESC anytime to return to orbit camera',
  },
  'pt-BR': {
    heading: 'Modo em primeira pessoa',
    captureFailed:
      'Captura do mouse indisponível. Clique para tentar de novo ou pressione V para sair.',
    clickToEnter: 'Clique em qualquer lugar para entrar no modo de exploração em primeira pessoa',
    moveAround: 'Mover-se',
    jump: 'Pular',
    mouse: 'Mouse',
    lookAround: 'Olhar ao redor',
    sprint: 'Correr',
    exitFirstPerson: 'Sair da visão em primeira pessoa',
    forklift: 'Dirigir ou descer da empilhadeira, tocar o sino da escola',
    forks: 'Erguer e baixar os garfos',
    forkliftStop: 'Parar as empilhadeiras',
    keyClick: 'Clique',
    keySpace: 'Espaço',
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

/** Crosshair prompts for world targets (`utils/worldInteractables`), after E. */
export const interactPromptMessages = defineMessages({
  en: {
    ringBell: 'Ring the school bell',
    greet: 'Say hello',
    windmillLesson: 'Inside the windmill',
    henhouseInspection: 'Inspect the henhouse',
  },
  'pt-BR': {
    ringBell: 'Tocar o sino da escola',
    greet: 'Cumprimentar',
    windmillLesson: 'Dentro do moinho',
    henhouseInspection: 'Inspecionar o galinheiro',
  },
});
