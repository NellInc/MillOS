import { defineMessages } from '../i18n';

/** Errors the BYOK transport raises; the AI settings and command surfaces show them. */
export const cloudAIClientMessages = defineMessages({
  en: {
    directKeysLocalOnly:
      'Direct provider keys are available only on localhost. Use OpenRouter on the public site.',
    usageMissing: 'Provider omitted usage data; check charges in your provider account.',
    keyRejected: 'API key or model access was rejected. Check your provider account.',
    creditLimit: 'Provider credit or spending limit reached.',
    rateLimit: 'Provider rate limit reached. Try again later.',
    requestFailed: 'Provider request failed (HTTP {status}).',
    haikuIncomplete: 'Haiku did not complete a text response. Try again.',
    lunaIncomplete: 'Luna did not complete a text response. Try again.',
    openRouterIncomplete: 'OpenRouter did not complete a text response. Try again.',
    enterKey: 'Enter an API key.',
    connectKey: 'Connect an API key for the selected model.',
    cancelledAfterChange: 'Request cancelled after configuration changed.',
    billingUnverified:
      'OpenRouter billing is unverified. Check charges and reconnect a limited key.',
    invalidOpenRouterKey: 'Enter a valid OpenRouter API key.',
    capRequired: 'Set a session cost cap before connecting OpenRouter.',
    cannotVerifyLimit:
      'Cannot verify the OpenRouter key limit. Check your network or browser privacy settings.',
    limitHttpError: 'OpenRouter could not verify the key limit (HTTP {status}).',
    noVerifiableLimit: 'OpenRouter returned no verifiable key limit.',
    limitedKeyRequired:
      'Use a lifetime spend-limited OpenRouter inference key with BYOK usage included in its limit.',
    emptyRequest: 'The request is empty.',
    contextTooLarge: 'The plant context is too large.',
    invalidResponse: 'Provider returned an invalid response.',
    unverifiableCharge:
      'OpenRouter did not report a verifiable USD charge. Paid inference stopped.',
    noText: 'Provider returned no text. Try again.',
    timedOut: 'Provider request timed out. Check charges before retrying.',
    unreachable: 'Cannot reach the provider. Check your network or browser privacy settings.',
  },
  'pt-BR': {
    directKeysLocalOnly:
      'Chaves diretas de provedor só funcionam em localhost. No site público, use o OpenRouter.',
    usageMissing:
      'O provedor não informou os dados de uso; confira as cobranças na sua conta do provedor.',
    keyRejected:
      'A chave de API ou o acesso ao modelo foi recusado. Verifique sua conta do provedor.',
    creditLimit: 'O crédito ou o limite de gastos do provedor foi atingido.',
    rateLimit: 'O limite de requisições do provedor foi atingido. Tente novamente mais tarde.',
    requestFailed: 'A requisição ao provedor falhou (HTTP {status}).',
    haikuIncomplete: 'O Haiku não concluiu uma resposta em texto. Tente novamente.',
    lunaIncomplete: 'O Luna não concluiu uma resposta em texto. Tente novamente.',
    openRouterIncomplete: 'O OpenRouter não concluiu uma resposta em texto. Tente novamente.',
    enterKey: 'Informe uma chave de API.',
    connectKey: 'Conecte uma chave de API para o modelo selecionado.',
    cancelledAfterChange: 'Requisição cancelada porque a configuração mudou.',
    billingUnverified:
      'A cobrança do OpenRouter não foi verificada. Confira as cobranças e reconecte uma chave com limite.',
    invalidOpenRouterKey: 'Informe uma chave de API válida do OpenRouter.',
    capRequired: 'Defina um teto de custo da sessão antes de conectar o OpenRouter.',
    cannotVerifyLimit:
      'Não foi possível verificar o limite da chave do OpenRouter. Verifique sua rede ou as configurações de privacidade do navegador.',
    limitHttpError: 'O OpenRouter não conseguiu verificar o limite da chave (HTTP {status}).',
    noVerifiableLimit: 'O OpenRouter não retornou um limite de chave verificável.',
    limitedKeyRequired:
      'Use uma chave de inferência do OpenRouter com limite de gasto total, sem renovação periódica, e com o uso BYOK incluído nesse limite.',
    emptyRequest: 'A requisição está vazia.',
    contextTooLarge: 'O contexto do moinho é grande demais.',
    invalidResponse: 'O provedor retornou uma resposta inválida.',
    unverifiableCharge:
      'O OpenRouter não informou uma cobrança verificável em USD. A inferência paga foi interrompida.',
    noText: 'O provedor não retornou texto. Tente novamente.',
    timedOut: 'A requisição ao provedor expirou. Confira as cobranças antes de tentar de novo.',
    unreachable:
      'Não foi possível acessar o provedor. Verifique sua rede ou as configurações de privacidade do navegador.',
  },
});
