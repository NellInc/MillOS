import { defineMessages } from '../i18n';

export const chatgptClientMessages = defineMessages({
  en: {
    companionNotRunning: 'ChatGPT local companion is not running',
    sessionExpired: 'ChatGPT session expired. Sign in again.',
    usageLimitReached: 'ChatGPT plan usage limit reached. Manage usage in ChatGPT Settings.',
    usageUnavailable:
      'ChatGPT plan usage is unavailable. Check your app access in ChatGPT Settings.',
    requestFailed: 'ChatGPT local companion request failed',
  },
  'pt-BR': {
    companionNotRunning: 'O app auxiliar local para o ChatGPT não está em execução',
    sessionExpired: 'A sessão do ChatGPT expirou. Entre novamente.',
    usageLimitReached:
      'O limite de uso do plano do ChatGPT foi atingido. Gerencie o uso nas Configurações do ChatGPT.',
    usageUnavailable:
      'O uso do plano do ChatGPT está indisponível. Verifique o acesso do app nas Configurações do ChatGPT.',
    requestFailed: 'A solicitação ao app auxiliar local para o ChatGPT falhou',
  },
});
