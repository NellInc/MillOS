import { defineMessages } from '../i18n';

export const aiSettingsModalMessages = defineMessages({
  en: {
    // Visualization toggles
    toggleCascade: 'Cascade Visualization',
    toggleStrategic: 'Strategic Overlay',
    toggleTarget: 'Production Target',
    toggleEnergy: 'Energy Dashboard',
    toggleMultiObjective: 'Multi-Objective',
    toggleCost: 'API Cost Tracker',
    toggleVcl: 'VCL Context',
    overlaysHeading: 'AI Visualization Overlays',
    overlaysHint: 'Toggle overlays with keyboard shortcuts or buttons above',

    // Local WebGPU panel
    localCoreTitle: 'Local Neural Core',
    online: 'Online',
    modelInfo: 'Model: {model}',
    backendInfo: 'Backend: WebGPU',
    webgpuUnavailable:
      'WebGPU is unavailable in this browser. Use a WebGPU-capable browser (recent Chrome, Edge, or Safari 17+) or select a cloud BYOK model.',
    compilingShaders: 'Compiling shaders',
    downloadingWeights: 'Downloading weights',
    cancelDownload: 'Cancel download',
    tryAgain: 'Try again',
    loadModel: 'Load model',
    downloadAndLoad: 'Download & load model',
    unloadModel: 'Unload model (free GPU memory)',
    deleting: 'Deleting...',
    deleteModel: 'Delete downloaded model',
    lightsOutLabel: 'Lights-out: the on-device AI handles incidents',
    fastLaneLabel: 'Fast routing lane (+{size} GB GPU memory)',
    cachedInBrowser: 'Cached in this browser',
    cachedWithSize: 'Cached in this browser (~{size} used)',
    notDownloaded: 'Not downloaded yet',
    modelDownloadNote:
      'The model ({model}, ~{size} GB) downloads automatically when you select this backend, once, from the Hugging Face CDN, and is cached in your browser. After that all inference runs on your GPU and your simulation data never leaves your device — no API key, no cost. Use “Delete downloaded model” any time to remove it and free the space.',

    // ChatGPT panel
    modelCatalogUnavailable: 'Model catalog unavailable.',
    chatgptOperationFailed: 'ChatGPT operation failed.',
    chatgptTitle: 'ChatGPT plan login',
    chatgptIntroBefore: 'Available in the local MillOS companion. Run ',
    chatgptIntroAfter:
      ' and open its 127.0.0.1 address. Public-site ChatGPT plan access requires OpenAI approval. This plan route is separate from the dollar cap on BYOK calls.',
    connectedAs: 'Connected as {account}',
    chatgptAccountFallback: 'ChatGPT account',
    chatgptAccountLabel: 'ChatGPT account',
    planModelLabel: 'ChatGPT plan model',
    selectPlanModel: 'Select a plan model',
    signOutUnconfirmed:
      'Signed out locally; remote revocation was not confirmed. Disconnect MillOS in ChatGPT Settings.',
    signOutLocally: 'Sign out locally',
    addAccount: 'Add another ChatGPT account',
    reconnectAccount: 'Reconnect ChatGPT account',
    continueWithChatGPT: 'Continue with ChatGPT',

    // Key test / save results
    keyVerifiedOpenRouter:
      'OpenRouter key and spending limit verified. Model access is checked on first request.',
    keyVerified: 'Key and model access verified for this session.',
    connectionFailed: 'Connection failed.',
    connectedForSession: 'Connected for this page session.',

    // Dialog
    title: 'AI Settings',
    closeSettings: 'Close settings',
    backendLabel: 'AI Backend',
    chatgptPlan: 'ChatGPT plan',
    recommended: 'Recommended',
    localCompanion: 'Local companion',
    localWebGPU: 'Local (WebGPU)',
    onDeviceFree: 'On-device • free',
    localModelLabel: 'Local',

    // Cost cap
    invalidCostCap: 'Invalid cost cap.',
    costCapLabel: 'BYOK session cost cap (USD)',
    costCapPlaceholder: 'Off',
    apply: 'Apply',
    costUsage: (p: { used: string; pending: string }) =>
      `Used $${p.used}; in flight or uncertain $${p.pending}.`,
    noCap: ' No cap set.',
    capSet: (p: { cap: string }) => ` Cap: $${p.cap}.`,
    costNote:
      'OpenRouter needs a cap and a lifetime spend-limited inference key that includes BYOK usage. Its key check is free; direct-provider key tests on localhost are billable. This tab reserves an estimate before paid calls; charges can exceed it. OpenRouter reports its account charge and any upstream BYOK charge. Verify your provider bill.',

    // Current status
    currentMode: 'Current Mode:',
    localOnly: 'Local Only',
    modelOnly: '{model} Only',
    hybridMode: 'Hybrid Mode',
    heuristic: 'Heuristic',
    connectedStatus: 'Connected • {model} • key held in memory',
    localCoreOnline: 'Local neural core online • {model}',

    // Cloud key flow
    apiKeyLabel: '{provider} API Key',
    placeholderUpdate: 'Enter new key to update...',
    placeholderEnter: 'Enter your {provider} API key...',
    replaceKey: 'Replace {provider} API key',
    enterKey: 'Enter {provider} API key',
    getKeyFrom: 'Get your API key from',
    providerConsole: '{provider} Console',
    openRouterKeyAdvice:
      'Set a session cap above, then use a lifetime spend-limited OpenRouter inference key with BYOK usage included in its limit. MillOS checks that limit before every paid request.',
    openRouterConsent:
      'Send simulated plant telemetry to OpenRouter and its model provider. My account pays for strategic requests. The app cap is an estimate; my provider bill is authoritative.',
    keyMemoryNote:
      'Your key stays in this page’s memory and is sent directly to {provider} with plant telemetry. Reloading clears it. MillOS has no server-side key vault; page scripts and browser extensions can access a key while this page is open.',
    keyCheckFree: 'The key check is free; strategic requests are billable.',
    keyTestsBillable: 'Key tests and strategic requests are billable.',

    // Operating mode
    operatingMode: 'AI Operating Mode',
    fastRules: 'Fast rules',
    hybrid: 'Hybrid',
    bestOfBoth: 'Best of both',
    llmOnly: 'LLM only',
    modeHeuristicDesc: 'Fast rule-based decisions. No API cost.',
    modeLocalOnlyDesc:
      'Strategic decisions from the local model only (every 45s); the fast rules layer is paused.',
    modeModelOnlyDesc:
      'Strategic decisions from {model} only (every 45s); the fast rules layer is paused.',
    modeLocalHybridDesc: 'Tactical (heuristic 6s) + Strategic (local model 45s).',
    modeModelHybridDesc: 'Tactical (heuristic 6s) + Strategic ({model} 45s).',

    // LLM-only confirmation
    considerHybrid: 'Consider Hybrid Mode?',
    hybridExplanation:
      ' combines fast heuristic decisions (every 6s) with strategic insights (every 45s), giving you the best of both worlds.',
    llmOnlyExplanation:
      'runs only the strategic LLM layer and pauses the fast rules layer, so the plant responds to changes more slowly.',
    useHybrid: 'Use Hybrid',
    useLocalOnly: 'Use Local Only',
    useModelOnly: 'Use {model} Only',
    cancel: 'Cancel',

    // Footer actions
    disconnectKey: 'Disconnect Key',
    testConnection: 'Test Connection',
    connectForSession: 'Connect for Session',
  },
  'pt-BR': {
    toggleCascade: 'Visualização em cascata',
    toggleStrategic: 'Camada estratégica',
    toggleTarget: 'Meta de produção',
    toggleEnergy: 'Painel de energia',
    toggleMultiObjective: 'Multiobjetivo',
    toggleCost: 'Monitor de custos da API',
    toggleVcl: 'Contexto VCL',
    overlaysHeading: 'Camadas de visualização da IA',
    overlaysHint: 'Ative ou desative as camadas com os atalhos de teclado ou os botões acima',

    localCoreTitle: 'Núcleo neural local',
    online: 'On-line',
    modelInfo: 'Modelo: {model}',
    backendInfo: 'Backend: WebGPU',
    webgpuUnavailable:
      'O WebGPU não está disponível neste navegador. Use um navegador compatível com WebGPU (Chrome recente, Edge ou Safari 17+) ou selecione um modelo em nuvem BYOK.',
    compilingShaders: 'Compilando shaders',
    downloadingWeights: 'Baixando pesos',
    cancelDownload: 'Cancelar download',
    tryAgain: 'Tentar novamente',
    loadModel: 'Carregar modelo',
    downloadAndLoad: 'Baixar e carregar modelo',
    unloadModel: 'Descarregar modelo (liberar memória da GPU)',
    deleting: 'Excluindo...',
    deleteModel: 'Excluir modelo baixado',
    lightsOutLabel: 'Luzes apagadas: a IA no dispositivo trata as ocorrências',
    fastLaneLabel: 'Via rápida de encaminhamento (+{size} GB de memória da GPU)',
    cachedInBrowser: 'Em cache neste navegador',
    cachedWithSize: 'Em cache neste navegador (~{size} em uso)',
    notDownloaded: 'Ainda não baixado',
    modelDownloadNote:
      'O modelo ({model}, ~{size} GB) é baixado automaticamente uma única vez, da CDN do Hugging Face, quando você seleciona este backend, e fica armazenado no seu navegador. Depois disso, toda a inferência roda na sua GPU e os dados da sua simulação nunca saem do seu dispositivo — sem chave de API, sem custo. Use “Excluir modelo baixado” a qualquer momento para removê-lo e liberar o espaço.',

    modelCatalogUnavailable: 'Catálogo de modelos indisponível.',
    chatgptOperationFailed: 'A operação do ChatGPT falhou.',
    chatgptTitle: 'Login com o plano ChatGPT',
    chatgptIntroBefore: 'Disponível no app auxiliar local do MillOS. Execute ',
    chatgptIntroAfter:
      ' e abra o endereço 127.0.0.1 que ele indicar. O acesso pelo plano ChatGPT no site público depende de aprovação da OpenAI. Esta rota pelo plano é separada do limite em dólares das chamadas BYOK.',
    connectedAs: 'Conectado como {account}',
    chatgptAccountFallback: 'conta ChatGPT',
    chatgptAccountLabel: 'Conta ChatGPT',
    planModelLabel: 'Modelo do plano ChatGPT',
    selectPlanModel: 'Selecione um modelo do plano',
    signOutUnconfirmed:
      'Sessão encerrada localmente; a revogação remota não foi confirmada. Desconecte o MillOS nas Configurações do ChatGPT.',
    signOutLocally: 'Sair localmente',
    addAccount: 'Adicionar outra conta ChatGPT',
    reconnectAccount: 'Reconectar conta ChatGPT',
    continueWithChatGPT: 'Continuar com o ChatGPT',

    keyVerifiedOpenRouter:
      'Chave e limite de gastos da OpenRouter verificados. O acesso ao modelo é verificado na primeira solicitação.',
    keyVerified: 'Chave e acesso ao modelo verificados para esta sessão.',
    connectionFailed: 'Falha na conexão.',
    connectedForSession: 'Conectado nesta sessão da página.',

    title: 'Configurações de IA',
    closeSettings: 'Fechar configurações',
    backendLabel: 'Backend de IA',
    chatgptPlan: 'Plano ChatGPT',
    recommended: 'Recomendado',
    localCompanion: 'App auxiliar local',
    localWebGPU: 'Local (WebGPU)',
    onDeviceFree: 'No dispositivo • grátis',
    localModelLabel: 'Local',

    invalidCostCap: 'Limite de custo inválido.',
    costCapLabel: 'Limite de custo da sessão BYOK (USD)',
    costCapPlaceholder: 'Sem limite',
    apply: 'Aplicar',
    costUsage: (p: { used: string; pending: string }) =>
      `Usado: US$ ${p.used}; em andamento ou incerto: US$ ${p.pending}.`,
    noCap: ' Nenhum limite definido.',
    capSet: (p: { cap: string }) => ` Limite: US$ ${p.cap}.`,
    costNote:
      'A OpenRouter exige um limite e uma chave de inferência com limite de gastos vitalício que inclua o uso BYOK. A verificação dessa chave é gratuita; testes de chave feitos diretamente com o provedor no localhost são cobrados. Esta aba reserva uma estimativa antes das chamadas pagas; as cobranças podem ultrapassá-la. A OpenRouter informa a cobrança da sua conta e qualquer cobrança BYOK do provedor de origem. Confira a fatura do seu provedor.',

    currentMode: 'Modo atual:',
    localOnly: 'Somente local',
    modelOnly: 'Somente {model}',
    hybridMode: 'Modo híbrido',
    heuristic: 'Heurístico',
    connectedStatus: 'Conectado • {model} • chave mantida na memória',
    localCoreOnline: 'Núcleo neural local on-line • {model}',

    apiKeyLabel: 'Chave de API da {provider}',
    placeholderUpdate: 'Digite uma nova chave para atualizar...',
    placeholderEnter: 'Digite sua chave de API da {provider}...',
    replaceKey: 'Substituir chave de API da {provider}',
    enterKey: 'Inserir chave de API da {provider}',
    getKeyFrom: 'Obtenha sua chave de API no',
    providerConsole: 'Console da {provider}',
    openRouterKeyAdvice:
      'Defina um limite de sessão acima e depois use uma chave de inferência da OpenRouter com limite de gastos vitalício que inclua o uso BYOK. O MillOS verifica esse limite antes de cada solicitação paga.',
    openRouterConsent:
      'Enviar a telemetria simulada da planta para a OpenRouter e o provedor do modelo. Minha conta paga as solicitações estratégicas. O limite do app é uma estimativa; a fatura do meu provedor é a referência oficial.',
    keyMemoryNote:
      'Sua chave fica na memória desta página e é enviada diretamente à {provider} com a telemetria da planta. Recarregar a página a apaga. O MillOS não tem cofre de chaves no servidor; scripts da página e extensões do navegador podem acessar uma chave enquanto esta página estiver aberta.',
    keyCheckFree: 'A verificação da chave é gratuita; as solicitações estratégicas são cobradas.',
    keyTestsBillable: 'Testes de chave e solicitações estratégicas são cobrados.',

    operatingMode: 'Modo de operação da IA',
    fastRules: 'Regras rápidas',
    hybrid: 'Híbrido',
    bestOfBoth: 'O melhor dos dois',
    llmOnly: 'Somente LLM',
    modeHeuristicDesc: 'Decisões rápidas baseadas em regras. Sem custo de API.',
    modeLocalOnlyDesc:
      'Decisões estratégicas apenas do modelo local (a cada 45 s); a camada de regras rápidas fica pausada.',
    modeModelOnlyDesc:
      'Decisões estratégicas apenas do {model} (a cada 45 s); a camada de regras rápidas fica pausada.',
    modeLocalHybridDesc: 'Tático (heurístico 6 s) + Estratégico (modelo local 45 s).',
    modeModelHybridDesc: 'Tático (heurístico 6 s) + Estratégico ({model} 45 s).',

    considerHybrid: 'Considerar o modo híbrido?',
    hybridExplanation:
      ' combina decisões heurísticas rápidas (a cada 6 s) com análises estratégicas (a cada 45 s), oferecendo o melhor dos dois mundos.',
    llmOnlyExplanation:
      'executa apenas a camada estratégica de LLM e pausa a camada de regras rápidas, então a planta reage mais devagar às mudanças.',
    useHybrid: 'Usar híbrido',
    useLocalOnly: 'Usar somente local',
    useModelOnly: 'Usar somente {model}',
    cancel: 'Cancelar',

    disconnectKey: 'Desconectar chave',
    testConnection: 'Testar conexão',
    connectForSession: 'Conectar nesta sessão',
  },
});
