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
    // The retired daily target's line (D11), kept so a saved transcript still reads.
    milestone100: "Well done, everyone! That's today's target made!",
    programmeDelivered: "Well done, everyone! The programme's delivered!",
    drillStarted: 'This is a drill. Equipment is stopping for an exit check.',
    drillComplete: "Drill's over. All exits are clear.",
    // A zone verified only on its alternative (a stopped forklift on its own
    // route) is not "clear"; the Safety record names which.
    drillCompleteRerouted: "Drill's over. One exit had to use another route.",
    drillCompleteReroutedMany: "Drill's over. Some exits had to use another route.",
    drillEndedEarly: 'Drill stopped early. The line waits for a restart.',
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
    // No adjective agrees with the name: R.M., Silo and Sifter are masculine,
    // Pack Line feminine (paMachineLines.test.ts).
    machineCriticalStill:
      '{machine} continua fora de operação. Precisamos de alguém lá, por favor!',
    machineCriticalUrgent: '{machine} ainda está fora de operação! Alguém lá agora mesmo!',
    machineRecovered: 'Boa notícia! {machine} voltou a funcionar.',
    milestone100: 'Parabéns, pessoal! Batemos a meta do dia!',
    programmeDelivered: 'Parabéns, pessoal! O programa foi entregue!',
    drillStarted: 'Atenção, isto é um simulado. Os equipamentos vão parar.',
    drillComplete: 'Simulado concluído. Todas as saídas estão livres.',
    drillCompleteRerouted: 'Simulado concluído. Uma saída precisou de outra rota.',
    drillCompleteReroutedMany: 'Simulado concluído. Algumas saídas precisaram de outra rota.',
    drillEndedEarly: 'Simulado encerrado antes da hora. A linha espera ser religada.',
    emergencyStopActivated: 'Parada de emergência. Está tudo parado.',
    facilityStopEngaged: 'Parada de emergência geral. Não religuem até liberar.',
    vehiclesSecure: 'Parada de emergência. Todos os veículos estão parados.',
    facilityStopCleared: 'Tudo liberado. As empilhadeiras podem voltar a andar.',
    facilityStopClearedForkliftsHeld: 'Tudo liberado, mas as empilhadeiras continuam paradas.',
    forkliftStop: 'Empilhadeiras paradas. O moinho continua funcionando.',
  },
});
