import { defineMessages } from '../i18n';

export const aboutModalMessages = defineMessages({
  en: {
    title: 'About MillOS',
    close: 'Close about dialog',
    // D14: the one line About keeps, and the only disclaimer in the game.
    description:
      'MillOS is a simulation: its roles, ballots, credits and minutes are illustrative, and no real worker data is used.',
    music: 'Music',
    musicBy: 'Music by',
    soundtrackBy: 'Original MillOS soundtrack by Nell Watson',
    voice: 'Voice',
    voiceModelsBy: 'PA voice: Phonon 40M models by',
    voiceRuntimeBy: 'converted and run on this device by',
    modelCredits: '3D Model Credits',
    forklift: 'Forklift:',
    forkliftBy: 'by Mantas Stankaitis via',
    generatedModels: 'Scene, village and farm models generated for MillOS with Tripo3D',
    version: 'Version {version}',
  },
  'pt-BR': {
    title: 'Sobre o MillOS',
    close: 'Fechar a janela Sobre',
    description:
      'O MillOS é uma simulação: seus papéis, votações, créditos e minutos são ilustrativos, e nenhum dado real de trabalhador é usado.',
    music: 'Música',
    musicBy: 'Música de',
    soundtrackBy: 'Trilha sonora original do MillOS por Nell Watson',
    voice: 'Voz',
    voiceModelsBy: 'Voz dos avisos: modelos Phonon 40M da',
    voiceRuntimeBy: 'convertidos e executados neste dispositivo pelo',
    modelCredits: 'Créditos dos modelos 3D',
    forklift: 'Empilhadeira:',
    forkliftBy: 'de Mantas Stankaitis via',
    generatedModels: 'Modelos da cena, da vila e da fazenda gerados para o MillOS com o Tripo3D',
    version: 'Versão {version}',
  },
});
