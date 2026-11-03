import { defineMessages } from '../i18n';

export const loadingScreenMessages = defineMessages({
  en: {
    ready: 'Ready',
    couldNotFinish: 'Loading could not finish',
    preparing: 'Preparing the complete scene',
    dialogLabel: 'Loading MillOS',
    heading: 'WARMING UP THE ROLLERS',
    progressLabel: 'Loading MillOS',
    slowAnimation: 'The scene is loaded, but animation is still slow on this device.',
    trucksPreparing: 'The scene is loaded, but the delivery trucks are still being prepared.',
    slowLoad: 'Loading is taking longer than usual. Low graphics can help on a slower device.',
    resourcesFailed: 'Some resources could not be loaded.',
    stalledLoad: 'Loading has not moved for a while.',
    reload: 'Reload',
    useLowGraphics: 'Use low graphics',
    openLoadedScene: 'Open loaded scene (slow)',
  },
  'pt-BR': {
    ready: 'Pronto',
    couldNotFinish: 'Não foi possível concluir o carregamento',
    preparing: 'Preparando a cena completa',
    dialogLabel: 'Carregando o MillOS',
    heading: 'AQUECENDO OS ROLOS',
    progressLabel: 'Carregando o MillOS',
    slowAnimation: 'A cena foi carregada, mas a animação ainda está lenta neste dispositivo.',
    trucksPreparing:
      'A cena foi carregada, mas os caminhões de entrega ainda estão sendo preparados.',
    slowLoad:
      'O carregamento está demorando mais do que o normal. A qualidade gráfica baixa pode ajudar em um dispositivo mais lento.',
    resourcesFailed: 'Alguns recursos não puderam ser carregados.',
    stalledLoad: 'O carregamento não avança há algum tempo.',
    reload: 'Recarregar',
    useLowGraphics: 'Usar qualidade gráfica baixa',
    openLoadedScene: 'Abrir a cena carregada (lenta)',
  },
});
