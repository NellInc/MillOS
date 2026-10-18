import { defineMessages } from '../../i18n';

/**
 * Words only. The VCP glyphs in the legend are protocol documentation and stay
 * in VCLDebugPanel.tsx; the encoded string itself is never translated.
 */
export const vclDebugPanelMessages = defineMessages({
  en: {
    // Example verbose text that VCL replaces. Its length drives the savings figures.
    verboseExample: `Current time: 14:30, autonomous run window B
Weather: clear
Production line status:
- Silos: 5 of 5 running at 65% average load
- Roller mills: 4 of 4 running at 78% average load
- Plansifters: 3 of 3 running at 71% average load
- Packers: 3 of 3 running at 82% average load
- Control network: online
Active critical alarms: none`,
    encodingError: 'Error encoding VCL',
    savedBadge: '{percent}% SAVED',
    subtitle: 'Compact emoji encoding for AI context',
    liveFactoryState: 'Live Factory State',
    chars: '{count} chars',
    howItWorks: 'How It Works',
    howItWorksBefore: 'This example compares compact and verbose formats, with a',
    howItWorksAfter: 'size reduction. Live strategic requests use structured telemetry.',
    hideComparison: 'Hide Comparison',
    showComparison: 'Show Comparison',
    traditionalText: 'Traditional Text',
    vcpEncoded: 'VCP Encoded',
    sameInformation: 'Same information, {percent}% fewer tokens',
    sizeReduction: 'Size Reduction',
    tokensSaved: 'Tokens Saved',
    example: 'Example',
    notLiveSavings: 'Not live savings',
    copied: 'Copied!',
    copyFailed: 'Copy failed',
    copy: 'Copy',
    emojiDictionary: 'Emoji Dictionary',
    timeEnvironment: 'Time & Environment',
    morning: 'Morning',
    afternoon: 'Afternoon',
    evening: 'Evening',
    night: 'Night',
    clear: 'Clear',
    cloudy: 'Cloudy',
    rain: 'Rain',
    storm: 'Storm',
    machinesStatus: 'Machines & Status',
    silo: 'Silo',
    mill: 'Mill',
    sifter: 'Sifter',
    packer: 'Packer',
    running: 'Running',
    idle: 'Idle',
    warning: 'Warning',
    critical: 'Critical',
    loadLevels: 'Load Levels',
    controlAlarms: 'Control & Alarms',
    control: 'Control',
    alarmsClear: 'Clear',
    criticalAlarmCount: 'Critical alarm count',
    format: 'Format: ',
    formatSpec: 'TIME|WINDOW|WEATHER | SILO→MILL→SIFTER→PACKER→CONTROL | ALARMS',
  },
  'pt-BR': {
    verboseExample: `Hora atual: 14:30, janela de operação autônoma B
Clima: céu limpo
Status da linha de produção:
- Silos: 5 de 5 operando com carga média de 65%
- Moinhos de rolos: 4 de 4 operando com carga média de 78%
- Plansifters: 3 de 3 operando com carga média de 71%
- Ensacadeiras: 3 de 3 operando com carga média de 82%
- Rede de controle: online
Alarmes críticos ativos: nenhum`,
    encodingError: 'Erro ao codificar o VCL',
    savedBadge: '{percent}% DE ECONOMIA',
    subtitle: 'Codificação compacta em emoji para o contexto da IA',
    liveFactoryState: 'Estado da fábrica ao vivo',
    chars: '{count} caracteres',
    howItWorks: 'Como funciona',
    howItWorksBefore: 'Este exemplo compara os formatos compacto e detalhado, com',
    howItWorksAfter:
      'de redução de tamanho. As solicitações estratégicas reais usam telemetria estruturada.',
    hideComparison: 'Ocultar comparação',
    showComparison: 'Mostrar comparação',
    traditionalText: 'Texto tradicional',
    vcpEncoded: 'Codificado em VCP',
    sameInformation: 'Mesma informação, {percent}% menos tokens',
    sizeReduction: 'Redução de tamanho',
    tokensSaved: 'Tokens economizados',
    example: 'Exemplo',
    notLiveSavings: 'Não é economia ao vivo',
    copied: 'Copiado!',
    copyFailed: 'Falha ao copiar',
    copy: 'Copiar',
    emojiDictionary: 'Dicionário de emojis',
    timeEnvironment: 'Hora e ambiente',
    morning: 'Manhã',
    afternoon: 'Tarde',
    evening: 'Fim de tarde',
    night: 'Noite',
    clear: 'Céu limpo',
    cloudy: 'Nublado',
    rain: 'Chuva',
    storm: 'Tempestade',
    machinesStatus: 'Máquinas e status',
    silo: 'Silo',
    mill: 'Moinho',
    sifter: 'Plansifter',
    packer: 'Ensacadeira',
    running: 'Em operação',
    idle: 'Ociosa',
    warning: 'Alerta',
    critical: 'Crítico',
    loadLevels: 'Níveis de carga',
    controlAlarms: 'Controle e alarmes',
    control: 'Controle',
    alarmsClear: 'Sem alarmes',
    criticalAlarmCount: 'Nº de alarmes críticos',
    format: 'Formato: ',
    formatSpec: 'HORA|JANELA|CLIMA | SILO→MOINHO→PLANSIFTER→ENSACADEIRA→CONTROLE | ALARMES',
  },
});
