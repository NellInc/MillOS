import { defineMessages } from './i18n';

export const appMessages = defineMessages({
  en: {
    startupStatus: 'Bringing operations online',
    viewStoppedTitle: '3D view stopped',
    viewStoppedBody: 'The 3D view hit an unexpected problem. Reloading usually restores it.',
    reloadApplication: 'Reload Application',
    skipToMain: 'Skip to main content',
    skipToNavigation: 'Skip to navigation',
    keyboardNoteLabel: '3D visualization keyboard controls',
    keyboardNote:
      'The 3D factory visualization is interactive. Use W, A, S, D or the arrow keys to move, Q and E to move down and up, and Shift to move faster. Press V to toggle first-person view mode. Press 1-7 to switch camera presets. Keyboard movement pauses while an interface control has focus. Press Space to toggle the forklift emergency stop, and the question mark key for the full list of shortcuts.',
    operationsControls: 'Operations controls',
    mainLabel: '3D factory visualization',
    pageHeading: 'MillOS Industrial Factory Simulation',
  },
  'pt-BR': {
    startupStatus: 'Iniciando as operações',
    viewStoppedTitle: 'A visualização 3D parou',
    viewStoppedBody:
      'A visualização 3D encontrou um problema inesperado. Recarregar a página normalmente resolve.',
    reloadApplication: 'Recarregar aplicativo',
    skipToMain: 'Pular para o conteúdo principal',
    skipToNavigation: 'Pular para a navegação',
    keyboardNoteLabel: 'Controles de teclado da visualização 3D',
    keyboardNote:
      'A visualização 3D da fábrica é interativa. Use W, A, S, D ou as setas para se mover, Q e E para descer e subir, e Shift para se mover mais rápido. Pressione V para alternar a visão em primeira pessoa. Pressione 1-7 para trocar as posições predefinidas da câmera. O movimento pelo teclado pausa enquanto um controle da interface estiver em foco. Pressione Espaço para acionar ou liberar a parada de emergência das empilhadeiras e a tecla de ponto de interrogação para ver a lista completa de atalhos.',
    operationsControls: 'Painel de operações',
    mainLabel: 'Visualização 3D da fábrica',
    pageHeading: 'Simulação de fábrica industrial MillOS',
  },
});
