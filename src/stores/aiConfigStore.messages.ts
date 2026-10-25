import { defineMessages } from '../i18n';

export const aiConfigStoreMessages = defineMessages({
  en: {
    pricingOnDevice: 'On-device',
    pricingChatGPTPlan: 'ChatGPT plan',
    localCompanionUnavailable: 'Local companion unavailable',
    checkingWebGPU: 'Checking WebGPU compatibility...',
    webgpuUnavailable:
      'WebGPU is unavailable in this browser. Use a WebGPU-capable browser or a cloud BYOK model.',
    initializingDownload: 'Initializing model download...',
    localCoreOnline: 'Local neural core online',
    modelLoadFailed: 'The model could not be loaded. Try again or use a cloud BYOK model.',
    modelLostReloading: 'The GPU dropped the local model. Reloading it from this device.',
    modelLostAgain:
      'The GPU dropped the local model again. Load it again when the device has memory to spare.',
    connectionFailed: 'Connection failed.',
    /** Session cost in US dollars; amount is pre-formatted with formatFixed. */
    sessionCost: (p: { amount: string }) => `$${p.amount}`,
  },
  'pt-BR': {
    pricingOnDevice: 'No dispositivo',
    pricingChatGPTPlan: 'Plano ChatGPT',
    localCompanionUnavailable: 'App auxiliar local indisponível',
    checkingWebGPU: 'Verificando a compatibilidade com WebGPU...',
    webgpuUnavailable:
      'O WebGPU não está disponível neste navegador. Use um navegador compatível com WebGPU ou um modelo em nuvem BYOK.',
    initializingDownload: 'Iniciando o download do modelo...',
    localCoreOnline: 'Núcleo neural local on-line',
    modelLoadFailed:
      'Não foi possível carregar o modelo. Tente novamente ou use um modelo em nuvem BYOK.',
    modelLostReloading: 'A GPU descartou o modelo local. Recarregando-o deste dispositivo.',
    modelLostAgain:
      'A GPU descartou o modelo local de novo. Carregue-o novamente quando o dispositivo tiver memória livre.',
    connectionFailed: 'Falha na conexão.',
    sessionCost: (p: { amount: string }) => `US$ ${p.amount}`,
  },
});
