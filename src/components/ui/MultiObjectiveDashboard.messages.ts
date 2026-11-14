import { defineMessages } from '../../i18n';

export const multiObjectiveDashboardMessages = defineMessages({
  en: {
    regionLabel: 'Multi-objective dashboard',
    title: 'Multi-Objective',
    labelProduction: 'Production',
    labelQuality: 'Quality',
    labelEnergy: 'Energy',
    target: 'Target: {target} {unit}',
    orderMinimum: 'Order minimum: {minimum}',
    tariffPeak: 'Peak tariff £{rate}/kWh',
    tariffOffPeak: 'Off-peak tariff £{rate}/kWh',
    overdriveLine: 'Rate {rate}%: ×{factor} power above {threshold}%',
    onTarget: 'All objectives on target.',
    offTarget: 'Off target: {objectives}.',
  },
  'pt-BR': {
    regionLabel: 'Painel multiobjetivo',
    title: 'Multiobjetivo',
    labelProduction: 'Produção',
    labelQuality: 'Qualidade',
    labelEnergy: 'Energia',
    target: 'Meta: {target} {unit}',
    orderMinimum: 'Mínimo do pedido: {minimum}',
    tariffPeak: 'Tarifa de ponta £{rate}/kWh',
    tariffOffPeak: 'Tarifa fora de ponta £{rate}/kWh',
    overdriveLine: 'Ritmo {rate}%: ×{factor} de potência acima de {threshold}%',
    onTarget: 'Todos os objetivos na meta.',
    offTarget: 'Fora da meta: {objectives}.',
  },
});
