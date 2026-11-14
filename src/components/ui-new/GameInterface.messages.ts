import { defineMessages } from '../../i18n';

// Tour steps (D14): one line each, the thing to look at or do; the camera
// and the buttons carry the rest.
export const gameInterfaceMessages = defineMessages({
  en: {
    introGrainTitle: 'Follow the grain',
    introGrainContent:
      'Grain enters the silos, passes through milling and sifting, and leaves as packed flour.',
    introFlourTitle: "Protect the day's flour",
    introFlourContent: 'Keep packing on pace for the programme commitment.',
    introKeyboardHint: 'Press ? for controls.',
    introLookTitle: 'Look first, touch second',
    introLookContent: 'Select any machine for its status, buffers, and maintenance record.',
    productionFloor: 'Production floor',
    logisticsPlanning: 'Logistics planning',
    loadingLogisticsPlanning: 'Loading logistics planning…',
  },
  'pt-BR': {
    introGrainTitle: 'Siga o grão',
    introGrainContent:
      'O grão entra nos silos, passa pela moagem e pelo peneiramento e sai como farinha ensacada.',
    introFlourTitle: 'Proteja a farinha do dia',
    introFlourContent: 'Mantenha o ensaque no ritmo do compromisso do programa.',
    introKeyboardHint: 'Pressione ? para ver os controles.',
    introLookTitle: 'Primeiro observe, depois mexa',
    introLookContent:
      'Selecione qualquer máquina para ver o status, os estoques intermediários e o histórico de manutenção.',
    productionFloor: 'Área de produção',
    logisticsPlanning: 'Planejamento logístico',
    loadingLogisticsPlanning: 'Carregando o planejamento logístico…',
  },
});
