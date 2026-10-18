import { defineMessages } from '../i18n';

/** Machine-type display names and facility-load period descriptions. */
export const energyCalculationsMessages = defineMessages({
  en: {
    typeSilo: 'Silo',
    typeRollerMill: 'Roller Mill',
    typePlansifter: 'Plansifter',
    typePacker: 'Packer',
    typeControlRoom: 'Control Room',
    lightingDay: 'Day (natural light)',
    lightingDawn: 'Dawn transition',
    lightingDusk: 'Dusk transition',
    lightingNight: 'Night (full artificial)',
    hvacAfternoon: 'Afternoon peak cooling',
    hvacMorning: 'Morning ramp-up',
    hvacEvening: 'Evening cool-down',
    hvacNight: 'Night maintenance',
    timeDescription: '{lighting} | {hvac}',
  },
  'pt-BR': {
    typeSilo: 'Silo',
    typeRollerMill: 'Moinho de rolos',
    typePlansifter: 'Plansifter',
    typePacker: 'Ensacadeira',
    typeControlRoom: 'Sala de controle',
    lightingDay: 'Dia (luz natural)',
    lightingDawn: 'Transição do amanhecer',
    lightingDusk: 'Transição do anoitecer',
    lightingNight: 'Noite (iluminação artificial total)',
    hvacAfternoon: 'Pico de refrigeração à tarde',
    hvacMorning: 'Aumento gradual pela manhã',
    hvacEvening: 'Redução gradual no início da noite',
    hvacNight: 'Manutenção noturna',
    timeDescription: '{lighting} | {hvac}',
  },
});
