import { defineMessages } from '../../i18n';

/**
 * PA lines for problems and pertinent updates, spoken by the PA voice (D-025)
 * and shown word for word as the caption. Write each as a person on the plant
 * tannoy would say it: one short breath (about 50 characters in English), no
 * menu names, no colons, contractions where natural. The plant running as it
 * should is never announced (D-054). Safety lines keep their meaning (the
 * forklift stop does not stop the mill; a facility stop holds restart).
 */
export const sharedMessages = defineMessages({
  en: {
    // Urgency rises with the fault and with time left unresolved (D-061):
    // first notice, still unresolved at 3 minutes, then urgent at 6.
    machineWarning: 'Heads up! {machine} needs a look, please.',
    machineWarningStill: '{machine} still needs a look. Can someone get to it?',
    machineWarningUrgent: '{machine} needs someone now, please. Right away!',
    machineCritical: "Alarm on {machine}! It's stopped and safe.",
    machineCriticalStill: "{machine}'s still down. We need hands on it, please!",
    machineCriticalUrgent: '{machine} is still stopped! Someone to it right away!',
    machineRecovered: 'Good news! {machine} is back up and running.',
    milestone100: "Well done, everyone! That's today's target made!",
    drillStarted: 'This is a drill. Equipment is stopping for an exit check.',
    drillComplete: "Drill's over. All exits are clear.",
    drillEndedEarly: "Drill's been stopped early. We're back in production.",
    emergencyStopActivated: "Emergency stop. Everything's stopped.",
    facilityStopEngaged: "Site emergency stop. Don't restart until it's cleared.",
    vehiclesSecure: 'Emergency stop. All vehicles are stopped and held.',
    facilityStopCleared: 'All clear. Forklifts can move again.',
    facilityStopClearedForkliftsHeld: 'All clear, but the forklifts are still held.',
    forkliftStop: "Forklifts stopped. The mill's still running.",
  },
  'pt-BR': {
    machineWarning: 'Atenção! {machine} precisa de uma olhada, por favor.',
    machineWarningStill: '{machine} ainda precisa de atenção. Alguém pode ir lá?',
    machineWarningUrgent: '{machine} precisa de alguém agora, por favor. Já!',
    machineCritical: 'Alarme em {machine}! O equipamento parou com segurança.',
    machineCriticalStill: '{machine} continua parado. Precisamos de alguém lá, por favor!',
    machineCriticalUrgent: '{machine} ainda está parado! Alguém lá agora mesmo!',
    machineRecovered: 'Boa notícia! {machine} voltou a funcionar.',
    milestone100: 'Parabéns, pessoal! Batemos a meta do dia!',
    drillStarted: 'Atenção, isto é um simulado. Os equipamentos vão parar.',
    drillComplete: 'Simulado concluído. Todas as saídas estão livres.',
    drillEndedEarly: 'Simulado encerrado antes da hora. Voltamos a produzir.',
    emergencyStopActivated: 'Parada de emergência. Está tudo parado.',
    facilityStopEngaged: 'Parada de emergência geral. Não religuem até liberar.',
    vehiclesSecure: 'Parada de emergência. Todos os veículos estão parados.',
    facilityStopCleared: 'Tudo liberado. As empilhadeiras podem voltar a andar.',
    facilityStopClearedForkliftsHeld: 'Tudo liberado, mas as empilhadeiras continuam paradas.',
    forkliftStop: 'Empilhadeiras paradas. O moinho continua funcionando.',
  },
});
