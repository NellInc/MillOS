import { defineMessages, formatFixed } from '../i18n';

type SmallMemory = { buffer: number; storage: number; model: string; vram: number };

/**
 * Adapter warnings, connection-test results and cache sizes shown in the AI
 * settings. maxBufferSize / maxStorageBuffer are WebGPU limit names and stay
 * as written; the prompts sent to the local model are not copy.
 */
export const webgpuClientMessages = defineMessages({
  en: {
    noAdapter: 'No WebGPU adapter available (GPU may be blocklisted or disabled).',
    // Raw numbers, formatted here, so a stored advisory rewords on a language switch.
    smallMemory: (p: SmallMemory) =>
      `This GPU reports a small memory budget (maxBufferSize ${formatFixed(p.buffer, 0)}MB, maxStorageBuffer ${formatFixed(p.storage, 0)}MB). ${p.model} needs about ${formatFixed(p.vram, 1)} GB and may fail to load or stutter the 3D scene. A smaller model or a cloud BYOK model may work better.`,
    probeFailed: 'WebGPU adapter probe failed.',
    modelNotLoaded: 'Model not loaded',
    modelVerified: 'Local model verified',
    responseReceived: 'Connected (response received)',
    noResponse: 'No response',
    unknownError: 'Unknown error',
    sizeGb: '{size} GB',
    sizeMb: '{size} MB',
  },
  'pt-BR': {
    noAdapter: 'Nenhum adaptador WebGPU disponível (a GPU pode estar bloqueada ou desativada).',
    smallMemory: (p: SmallMemory) =>
      `Esta GPU informa pouca memória disponível (maxBufferSize ${formatFixed(p.buffer, 0)} MB, maxStorageBuffer ${formatFixed(p.storage, 0)} MB). O ${p.model} precisa de cerca de ${formatFixed(p.vram, 1)} GB e pode não carregar ou deixar a cena 3D com engasgos. Um modelo menor ou um modelo BYOK na nuvem pode funcionar melhor.`,
    probeFailed: 'A verificação do adaptador WebGPU falhou.',
    modelNotLoaded: 'Modelo não carregado',
    modelVerified: 'Modelo local verificado',
    responseReceived: 'Conectado (resposta recebida)',
    noResponse: 'Sem resposta',
    unknownError: 'Erro desconhecido',
    sizeGb: '{size} GB',
    sizeMb: '{size} MB',
  },
});
