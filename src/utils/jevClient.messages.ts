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
  },
});
