import { defineMessages } from '../../../i18n';

const PT_QUALITY: Record<string, string> = {
  low: 'baixa',
  medium: 'média',
  high: 'alta',
  ultra: 'ultra',
};

const PT_PA_CHANNELS: Record<string, string> = {
  safety: 'segurança',
  logistics: 'logística',
  flavor: 'ambientação',
  operational: 'operacional',
};

export const settingsPanelMessages = defineMessages({
  en: {
    simulationControl: 'Simulation Control',
    productionSpeed: 'Production Speed',
    percentValue: '{value} percent',

    audio: 'Audio',
    masterVolume: 'Master Volume',
    muteAudio: 'Mute audio',
    unmute: 'UNMUTE',
    mute: 'MUTE',
    music: 'Music',
    musicPlayback: 'Music playback',
    on: 'ON',
    off: 'OFF',
    machineSounds: 'Machine Sounds',
    paMode: 'PA mode',
    paFocused: 'Focused',
    paCharacterful: 'Characterful',
    paOff: 'Off',
    paModeHelp:
      'Focused keeps the PA terse. Characterful lets it talk. Safety messages come through regardless.',
    paCaptions: 'PA captions',
    paTranscriptSummary: 'PA transcript ({count})',
    searchPaTranscript: 'Search PA transcript',
    searchTranscript: 'Search transcript',
    paTranscript: 'PA transcript',
    transcriptEmpty: 'Nothing announced yet. The mill is either very new or very quiet.',
    transcriptNoMatches: 'No matches. Try a different search, or accept the silence.',
    // The channel is a store value; English shows it as stored.
    paChannel: (p: { channel: string }) => p.channel,
    clearTranscript: 'Clear transcript',

    knowledgeSystem: 'Knowledge System',
    replayGettingStarted: 'Replay getting started',
    philosophyTooltips: 'Philosophy Tooltips',
    loadingScreenQuotes: 'Loading Screen Quotes',
    aiReflections: 'AI Reflections',
    unlockNotifications: 'Unlock Notifications',
    knowledgeHelp: 'Controls the depth of bilateral alignment and economic democracy content.',

    graphics: 'Graphics',
    graphicsQuality: 'Graphics quality',
    // The preset id is rendered as its own label (uppercased by CSS).
    qualityName: (p: { quality: string }) => p.quality,
    qualityLabel: (p: { quality: string }) => `${p.quality} quality`,
    postProcessing: 'Post-Processing',
    lightShafts: 'Light Shafts',
    colourGrade: 'Colour Grade',
    ambientOcclusion: 'Ambient Occlusion',
    bloomGlow: 'Bloom Glow',
    vignette: 'Vignette',
    antiAliasing: 'Anti-Aliasing',
    depthOfField: 'Depth of Field',
    particlesEffects: 'Particles & Effects',
    dustParticles: 'Dust Particles',
    grainFlow: 'Grain Flow',
    sceneMachines: 'Scene & Machines',
    machineVibration: 'Machine Vibration',
    wireframeMode: 'Wireframe Mode',
    contactShadows: 'Contact Shadows',
    highResShadows: 'High-Res Shadows',
    floorPuddles: 'Floor Puddles',
    audioReactive: 'Audio Reactive',
    zoneMarkers: 'Zone Markers',
    resolutionScale: 'Resolution Scale',
    resolutionScaleLabel: 'Resolution scale',

    interfaceAccessibility: 'Interface accessibility',
    interfaceScale: 'Interface scale',
    interfaceScaleHelp:
      'Makes controls and text larger without reducing the 3D render resolution. Browser zoom and OS text size still work as expected.',
    reduceMotion: 'Reduce motion',
    reduceMotionSystem: 'Follow system',
    reduceMotionOn: 'On',
    reduceMotionHelp:
      'Follow system uses your device setting. On holds people and decorative loops still and cuts camera and panel animations; plant equipment keeps moving because its motion shows its state.',

    diagnosticReplay: 'Diagnostic replay',
    diagnosticReplayHelp:
      'The last ten minutes of the simulation are buffered — frames, commands, build ID and seed. No credentials or identity data leave the building.',
    frames: 'frames',
    commands: 'commands',
    enterReplay: 'Enter replay',
    exportJson: 'Export JSON',
    clearBuffer: 'Clear buffer',

    simulation: 'Simulation',
    resetToTen: 'Reset to 10 AM',
    resetSimulation: 'Reset Simulation',
    resetDayMessage:
      'Wind the clock back to 10 AM at the current pace. Weather, run window and emergency state reset. Customer orders and their deadlines keep their own clock, so an overdue order stays overdue; production totals, machine states and achievements carry on. For a fresh shift use Reset Simulation.',
    resetEverything: 'Reset Everything',
    resetFullMessage:
      'Wipe everything — saved progress, graphics settings, your saved AI preferences — and reload from scratch. Sound and language settings are kept. There is no undo.',
    resetFullMessageWithMotion:
      'Wipe everything — saved progress, graphics settings, your saved AI preferences — and reload from scratch. Sound, language and motion settings are kept. There is no undo.',

    toggleOn: 'On',
    toggleOff: 'Off',
  },
  'pt-BR': {
    simulationControl: 'Controle da simulação',
    productionSpeed: 'Velocidade de produção',
    percentValue: '{value} por cento',

    audio: 'Áudio',
    masterVolume: 'Volume geral',
    muteAudio: 'Silenciar áudio',
    unmute: 'ATIVAR SOM',
    mute: 'SILENCIAR',
    music: 'Música',
    musicPlayback: 'Reprodução de música',
    on: 'LIGADO',
    off: 'DESLIGADO',
    machineSounds: 'Sons das máquinas',
    paMode: 'Modo dos avisos',
    paFocused: 'Focado',
    paCharacterful: 'Com personalidade',
    paOff: 'Desligado',
    paModeHelp:
      'Focado mantém os avisos curtos. Com personalidade deixa o sistema de avisos conversar. Mensagens de segurança sempre são transmitidas.',
    paCaptions: 'Legendas dos avisos',
    paTranscriptSummary: 'Transcrição dos avisos ({count})',
    searchPaTranscript: 'Pesquisar na transcrição dos avisos',
    searchTranscript: 'Pesquisar na transcrição',
    paTranscript: 'Transcrição dos avisos',
    transcriptEmpty: 'Nenhum aviso ainda. O moinho é muito novo ou está muito quieto.',
    transcriptNoMatches: 'Nenhum resultado. Tente outra pesquisa ou aceite o silêncio.',
    paChannel: (p: { channel: string }) => PT_PA_CHANNELS[p.channel] ?? p.channel,
    clearTranscript: 'Limpar transcrição',

    knowledgeSystem: 'Sistema de conhecimento',
    replayGettingStarted: 'Rever os primeiros passos',
    philosophyTooltips: 'Dicas de filosofia',
    loadingScreenQuotes: 'Citações na tela de carregamento',
    aiReflections: 'Reflexões da IA',
    unlockNotifications: 'Notificações de desbloqueio',
    knowledgeHelp:
      'Controla a profundidade do conteúdo sobre alinhamento bilateral e democracia econômica.',

    graphics: 'Gráficos',
    graphicsQuality: 'Qualidade gráfica',
    qualityName: (p: { quality: string }) => PT_QUALITY[p.quality] ?? p.quality,
    qualityLabel: (p: { quality: string }) => `qualidade ${PT_QUALITY[p.quality] ?? p.quality}`,
    postProcessing: 'Pós-processamento',
    lightShafts: 'Feixes de luz',
    colourGrade: 'Correção de cor',
    ambientOcclusion: 'Oclusão ambiente',
    bloomGlow: 'Brilho (bloom)',
    vignette: 'Vinheta',
    antiAliasing: 'Antisserrilhamento',
    depthOfField: 'Profundidade de campo',
    particlesEffects: 'Partículas e efeitos',
    dustParticles: 'Partículas de poeira',
    grainFlow: 'Fluxo de grãos',
    sceneMachines: 'Cena e máquinas',
    machineVibration: 'Vibração das máquinas',
    wireframeMode: 'Modo aramado',
    contactShadows: 'Sombras de contato',
    highResShadows: 'Sombras em alta resolução',
    floorPuddles: 'Poças no piso',
    audioReactive: 'Reação ao áudio',
    zoneMarkers: 'Marcadores de zona',
    resolutionScale: 'Escala de resolução',
    resolutionScaleLabel: 'Escala de resolução',

    interfaceAccessibility: 'Acessibilidade da interface',
    interfaceScale: 'Escala da interface',
    interfaceScaleHelp:
      'Aumenta controles e textos sem reduzir a resolução da renderização 3D. O zoom do navegador e o tamanho de texto do sistema continuam funcionando normalmente.',
    reduceMotion: 'Reduzir movimento',
    reduceMotionSystem: 'Seguir o sistema',
    reduceMotionOn: 'Ligado',
    reduceMotionHelp:
      'Seguir o sistema usa a configuração do seu dispositivo. Ligado deixa pessoas e animações decorativas paradas e corta as animações de câmera e de painéis; os equipamentos da fábrica continuam se movendo porque o movimento mostra o estado deles.',

    diagnosticReplay: 'Reprodução de diagnóstico',
    diagnosticReplayHelp:
      'Os últimos dez minutos da simulação ficam em memória: quadros, comandos, ID do build e semente. Nenhuma credencial ou dado de identidade sai daqui.',
    frames: 'quadros',
    commands: 'comandos',
    enterReplay: 'Entrar na reprodução',
    exportJson: 'Exportar JSON',
    clearBuffer: 'Limpar memória',

    simulation: 'Simulação',
    resetToTen: 'Voltar para as 10h',
    resetSimulation: 'Reiniciar simulação',
    resetDayMessage:
      'Volta o relógio para as 10h, no ritmo atual. Clima, janela de operação e estado de emergência são redefinidos. Os pedidos dos clientes e seus prazos seguem o próprio relógio, então um pedido atrasado continua atrasado; totais de produção, estados das máquinas e conquistas continuam. Para um turno novo, use Reiniciar simulação.',
    resetEverything: 'Apagar tudo',
    resetFullMessage:
      'Apaga tudo (progresso salvo, configurações gráficas, suas preferências de IA salvas) e recarrega do zero. As configurações de som e idioma são mantidas. Não é possível desfazer.',
    resetFullMessageWithMotion:
      'Apaga tudo (progresso salvo, configurações gráficas, suas preferências de IA salvas) e recarrega do zero. As configurações de som, idioma e movimento são mantidas. Não é possível desfazer.',

    toggleOn: 'Ligado',
    toggleOff: 'Desligado',
  },
});
