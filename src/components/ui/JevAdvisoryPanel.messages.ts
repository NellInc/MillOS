import { defineMessages } from '../../i18n';

export const jevAdvisoryPanelMessages = defineMessages({
  en: {
    noAdvisory: 'No advisory was returned.',
    regionLabel: 'Jev advisory',
    title: 'Jev incident routing',
    titleOpenAI: 'OpenAI Decisions incident routing',
    intro:
      'Get a suggested queue for incident text. Alerts, machine controls and your selected AI backend stay unchanged.',
    apiKeyLabel: 'Your OpenRouter API key',
    apiKeyLabelOpenAI: 'Your OpenAI API key',
    providerLabel: 'Decision model',
    providerJev: 'Jev 1.13 · OpenRouter',
    providerOpenAI: 'GPT-6 Luna · OpenAI Decisions',
    consentOpenAI:
      'Allow the text above to be sent to OpenAI when I select Send to OpenAI. Requests use my OpenAI balance.',
    sendOpenAI: 'Send to OpenAI',
    apiKeyHelp:
      'Kept in memory only while this Advisory view is open. Never saved to browser storage.',
    forgetKey: 'Forget key',
    incidentLabel: 'Incident text',
    characterCount: '{count}/{max} characters',
    reviewLatestAlert: 'Review latest alert',
    consent:
      'Allow the text above to be sent to OpenRouter and TypeSafe when I select Send to Jev. Requests use my OpenRouter balance.',
    requesting: 'Requesting advice...',
    send: 'Send to Jev',
    cancelRequest: 'Cancel request',
    sendNote:
      'Only this text is sent. No automatic requests or retries. Cancellation may still be billed.',
    resultHeading: 'Suggested queue for the submitted text',
    resultCaveat:
      'Review the underlying evidence. This suggestion cannot clear an incident or establish that the mill is safe.',
    resultExpiry: 'Expires after one minute or when the text changes.',
  },
  'pt-BR': {
    noAdvisory: 'Nenhuma recomendação foi retornada.',
    regionLabel: 'Recomendação do Jev',
    title: 'Encaminhamento de ocorrências do Jev',
    titleOpenAI: 'Encaminhamento de ocorrências pelo OpenAI Decisions',
    intro:
      'Receba uma fila sugerida para o texto de uma ocorrência. Os alertas, os controles das máquinas e o backend de IA selecionado não são alterados.',
    apiKeyLabel: 'Sua chave de API do OpenRouter',
    apiKeyLabelOpenAI: 'Sua chave de API da OpenAI',
    providerLabel: 'Modelo de decisão',
    providerJev: 'Jev 1.13 · OpenRouter',
    providerOpenAI: 'GPT-6 Luna · OpenAI Decisions',
    consentOpenAI:
      'Permito que o texto acima seja enviado à OpenAI quando eu selecionar Enviar à OpenAI. As requisições usam o meu saldo na OpenAI.',
    sendOpenAI: 'Enviar à OpenAI',
    apiKeyHelp:
      'Mantida apenas na memória enquanto a aba Recomendações estiver aberta. Nunca é salva no armazenamento do navegador.',
    forgetKey: 'Esquecer chave',
    incidentLabel: 'Texto da ocorrência',
    characterCount: '{count}/{max} caracteres',
    reviewLatestAlert: 'Revisar o alerta mais recente',
    consent:
      'Permito que o texto acima seja enviado ao OpenRouter e ao TypeSafe quando eu selecionar Enviar ao Jev. As requisições usam o meu saldo no OpenRouter.',
    requesting: 'Solicitando recomendação...',
    send: 'Enviar ao Jev',
    cancelRequest: 'Cancelar requisição',
    sendNote:
      'Somente este texto é enviado. Sem requisições ou novas tentativas automáticas. O cancelamento ainda pode ser cobrado.',
    resultHeading: 'Fila sugerida para o texto enviado',
    resultCaveat:
      'Revise as evidências de base. Esta sugestão não pode encerrar uma ocorrência nem confirmar que o moinho está seguro.',
    resultExpiry: 'Expira após um minuto ou quando o texto mudar.',
  },
});
