import { defineMessages } from '../i18n';

/**
 * Errors the Jev advisory panel shows. The queue names and the rubric question
 * are part of the frozen evaluation sent to the model and stay in English.
 */
export const jevClientMessages = defineMessages({
  en: {
    invalidAdvisory: 'Jev returned an invalid advisory. No action was taken.',
    consentRequired: 'Consent is required before sending incident text.',
    invalidKey: 'Enter a valid OpenRouter API key.',
    textLength: 'Enter 1 to {max} characters of incident text.',
    cancelled: 'Request cancelled.',
    unreachable: 'Jev could not be reached. Check your connection and try again manually.',
    keyRejected: 'OpenRouter rejected the key or its permissions.',
    moreCredit: 'OpenRouter requires more credit for this request.',
    rateLimited: 'OpenRouter is rate limiting requests. Try again later.',
    unavailable: 'Jev is unavailable. Try again later.',
    cancelledOrTimedOut: 'Request cancelled or timed out.',
    invalidAdvisoryOpenAI: 'OpenAI returned an invalid advisory. No action was taken.',
    invalidKeyOpenAI: 'Enter a valid OpenAI API key.',
    unreachableOpenAI: 'OpenAI could not be reached. Check your connection and try again manually.',
    keyRejectedOpenAI: 'OpenAI rejected the key or its permissions.',
    moreCreditOpenAI: 'OpenAI requires more credit for this request.',
    rateLimitedOpenAI: 'OpenAI is rate limiting requests. Try again later.',
    unavailableOpenAI: 'OpenAI Decisions is unavailable. Try again later.',
    localOnlyOpenAI: 'OpenAI Decisions with your own key runs on the local companion only.',
    invalidAdvisoryAnthropic: 'Haiku returned an invalid advisory. No action was taken.',
    invalidKeyAnthropic: 'Enter a valid Anthropic API key.',
    unreachableAnthropic:
      'Anthropic could not be reached. Check your connection and try again manually.',
    keyRejectedAnthropic: 'Anthropic rejected the key or its permissions.',
    moreCreditAnthropic: 'Anthropic requires more credit for this request.',
    rateLimitedAnthropic: 'Anthropic is rate limiting requests. Try again later.',
    unavailableAnthropic: 'Haiku is unavailable. Try again later.',
    localOnlyAnthropic: 'Haiku with your own key runs on the local companion only.',
    unavailableLocal: 'The on-device model is not loaded.',
    invalidAdvisoryLocal: 'The on-device model returned an invalid advisory. No action was taken.',
  },
  'pt-BR': {
    invalidAdvisory: 'O Jev retornou uma recomendação inválida. Nenhuma ação foi tomada.',
    consentRequired: 'É preciso dar consentimento antes de enviar o texto da ocorrência.',
    invalidKey: 'Informe uma chave de API válida do OpenRouter.',
    textLength: 'Informe de 1 a {max} caracteres de texto da ocorrência.',
    cancelled: 'Requisição cancelada.',
    unreachable:
      'Não foi possível acessar o Jev. Verifique sua conexão e tente novamente manualmente.',
    keyRejected: 'O OpenRouter recusou a chave ou as permissões dela.',
    moreCredit: 'O OpenRouter exige mais crédito para esta requisição.',
    rateLimited: 'O OpenRouter está limitando as requisições. Tente novamente mais tarde.',
    unavailable: 'O Jev está indisponível. Tente novamente mais tarde.',
    cancelledOrTimedOut: 'Requisição cancelada ou expirada.',
    invalidAdvisoryOpenAI: 'A OpenAI retornou uma recomendação inválida. Nenhuma ação foi tomada.',
    invalidKeyOpenAI: 'Informe uma chave de API válida da OpenAI.',
    unreachableOpenAI:
      'Não foi possível acessar a OpenAI. Verifique sua conexão e tente novamente manualmente.',
    keyRejectedOpenAI: 'A OpenAI recusou a chave ou as permissões dela.',
    moreCreditOpenAI: 'A OpenAI exige mais crédito para esta requisição.',
    rateLimitedOpenAI: 'A OpenAI está limitando as requisições. Tente novamente mais tarde.',
    unavailableOpenAI: 'O OpenAI Decisions está indisponível. Tente novamente mais tarde.',
    localOnlyOpenAI:
      'O OpenAI Decisions com a sua própria chave funciona apenas no companheiro local.',
    invalidAdvisoryAnthropic:
      'O Haiku retornou uma recomendação inválida. Nenhuma ação foi tomada.',
    invalidKeyAnthropic: 'Informe uma chave de API válida da Anthropic.',
    unreachableAnthropic:
      'Não foi possível acessar a Anthropic. Verifique sua conexão e tente novamente manualmente.',
    keyRejectedAnthropic: 'A Anthropic recusou a chave ou as permissões dela.',
    moreCreditAnthropic: 'A Anthropic exige mais crédito para esta requisição.',
    rateLimitedAnthropic: 'A Anthropic está limitando as requisições. Tente novamente mais tarde.',
    unavailableAnthropic: 'O Haiku está indisponível. Tente novamente mais tarde.',
    localOnlyAnthropic: 'O Haiku com a sua própria chave funciona apenas no companheiro local.',
    unavailableLocal: 'O modelo no dispositivo não está carregado.',
    invalidAdvisoryLocal:
      'O modelo no dispositivo retornou uma recomendação inválida. Nenhuma ação foi tomada.',
  },
});
