import { defineMessages } from '../i18n';

export const errorBoundaryMessages = defineMessages({
  en: {
    somethingWentWrong: 'Something went wrong',
    reload: 'Reload',
    featureUnavailableLabel: '{featureName} unavailable',
    featureUnavailable: '{featureName} is temporarily unavailable',
    featureLoadFailed: 'The optional feature could not be loaded.',
    retryFeature: 'Retry feature',
    closePanel: 'Close panel',
  },
  'pt-BR': {
    somethingWentWrong: 'Algo deu errado',
    reload: 'Recarregar',
    featureUnavailableLabel: '{featureName} indisponível',
    featureUnavailable: '{featureName} está temporariamente indisponível',
    featureLoadFailed: 'Não foi possível carregar o recurso opcional.',
    retryFeature: 'Tentar novamente',
    closePanel: 'Fechar painel',
  },
});
