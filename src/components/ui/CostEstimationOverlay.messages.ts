import { defineMessages } from '../../i18n';

const PT_AI_MODES: Record<string, string> = {
  heuristic: 'heurístico',
  gemini: 'gemini',
  hybrid: 'híbrido',
};

export const costEstimationOverlayMessages = defineMessages({
  en: {
    title: 'BYOK API Usage',
    connected: 'Connected',
    disconnected: 'Disconnected',
    aiMode: (p: { mode: string }) => p.mode,
    usd: '${amount}',
    durationHours: '{hours}h {minutes}m',
    durationMinutes: '{minutes}m',
    sessionCostLabel: 'Paid calls including key tests ({duration})',
    requests: 'Requests',
    lastCall: 'Last Call',
    inputTokens: 'Input Tokens',
    outputTokens: 'Output Tokens',
    noCap: 'No session cap',
    cap: 'Cap ${amount}',
    inFlight: ' · ${amount} in flight or uncertain',
    onDevice: 'On-device inference has no API charge.',
    chatgptNote: 'ChatGPT plan usage is separate from BYOK API billing and this dollar cap.',
    pricingNote:
      "{model}: direct-provider estimate ${input}/1M in, ${output}/1M out; OpenRouter reports account and any upstream BYOK costs. This tab's cap is an estimate, not a provider billing limit.",
  },
  'pt-BR': {
    title: 'Uso da API (BYOK)',
    connected: 'Conectado',
    disconnected: 'Desconectado',
    aiMode: (p: { mode: string }) => PT_AI_MODES[p.mode] ?? p.mode,
    usd: 'US$ {amount}',
    durationHours: '{hours}h {minutes}min',
    durationMinutes: '{minutes}min',
    sessionCostLabel: 'Chamadas pagas, incluindo testes de chave ({duration})',
    requests: 'Requisições',
    lastCall: 'Última chamada',
    inputTokens: 'Tokens de entrada',
    outputTokens: 'Tokens de saída',
    noCap: 'Sem limite na sessão',
    cap: 'Limite US$ {amount}',
    inFlight: ' · US$ {amount} em andamento ou incerto',
    onDevice: 'A inferência no dispositivo não tem cobrança de API.',
    chatgptNote:
      'O uso do plano do ChatGPT é separado da cobrança da API BYOK e deste limite em dólares.',
    pricingNote:
      '{model}: estimativa pelo preço direto do provedor, US$ {input}/1M de entrada, US$ {output}/1M de saída; o OpenRouter informa os custos da conta e eventuais custos BYOK do provedor de origem. O limite desta aba é uma estimativa, não um limite de cobrança do provedor.',
  },
});
