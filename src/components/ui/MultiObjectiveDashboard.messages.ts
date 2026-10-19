import { defineMessages } from '../../i18n';

export const multiObjectiveDashboardMessages = defineMessages({
  en: {
    regionLabel: 'Multi-objective dashboard',
    title: 'Multi-Objective',
    overallScore: 'Overall objective score ',
    labelProduction: 'Production',
    labelQuality: 'Quality',
    labelEnergy: 'Energy',
    labelCarbon: 'Carbon',
    target: 'Target: {target} {unit}',
    balanced: 'All objectives balanced optimally.',
    tradeOff: 'Trade-off detected. Some objectives need attention.',
  },
  'pt-BR': {
    regionLabel: 'Painel multiobjetivo',
    title: 'Multiobjetivo',
    overallScore: 'Pontuação geral dos objetivos ',
    labelProduction: 'Produção',
    labelQuality: 'Qualidade',
    labelEnergy: 'Energia',
    labelCarbon: 'Carbono',
    target: 'Meta: {target} {unit}',
    balanced: 'Todos os objetivos estão em equilíbrio ideal.',
    tradeOff: 'Conflito entre objetivos detectado. Alguns objetivos precisam de atenção.',
  },
});
