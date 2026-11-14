import { defineMessages } from '../../../i18n';
import { PT_TASK } from './WorkplaceLab.messages';

/** pt-BR label for a logic value; an unknown value falls back to itself. */
const pick = (labels: Record<string, string>, value: string): string => labels[value] ?? value;

interface CountParams {
  count: number;
  formatted: string;
}

export const workplaceParticipationMessages = defineMessages({
  en: {
    // Logic values shown as labels. English returns the value itself.
    sectionLabel: (p: { section: string }) => p.section,
    objectionKind: (p: { kind: string }) => p.kind,

    // Decision ownership
    regionLabel: 'Decision ownership',
    ownershipPrefix: 'Decision ownership:',
    soloRolePlay: 'solo role-play',
    roleTurn: '{role} turn',
    facilitatorHandover: 'facilitator handover',
    adviser: 'Adviser',
    interactionMode: 'Interaction mode',
    optionSolo: 'Solo role-play',
    optionSeparate: 'Facilitated separate turns',
    turnOnly: 'Only {role} may record this turn’s role decisions.',
    mandateChecksLegend: 'Current mandate checks',
    mandateChecksStatus: 'Mandate checks: {done} of {total} match the current agreement.',
    turnCheckLabel: 'Turn check: {prompt}',
    selectAnswer: 'Select an answer',
    matchesTerms: 'Matches the current terms. ',
    needsAnotherLook: 'Needs another look. ',
    endTurn: 'End participant turn',
    handOver: 'Hand over to fictional role',
    beginTurn: 'Begin participant turn',

    // Season entry
    seasonSummary: 'Play a three-shift cooperative season',
    seasonRoute: 'Season adoption route',
    startSeason: 'Start season with current customer commitment',

    // Fairness receipts
    fairnessSummary: 'Individual fairness receipts',
    fairnessLabel: 'Fairness: {role}',
    qualifiedTasks: 'Qualified tasks: {tasks}. Current task: {task}.',
    // Task names are logic values (bilateralWorkplace); English shows them as-is.
    taskLabel: (p: { task: string }) => p.task,
    dutyLine:
      'Current optional duty: {duty}. {extra} extra minutes across {shifts} shifts; {earlier} earlier minutes.',
    dutyNoDecision: 'no decision',
    dutyVolunteered: 'volunteered',
    dutyDeclined: 'declined',
    payLine:
      'Earned pay and member distributions: {earned}. Compensation paid: {paid}. Wages reserved: {wages}. Compensation reserved: {reserved}.',
    restLine:
      'Rest delivered: {rest} min. Recovery delivered: {recovery} min. Recovery owed: {owed} min.',
    openObjections: (p: CountParams) => `${p.formatted} retained open objections.`,

    // Guided demonstration
    demoLabel: 'Guided bilateral demonstration',
    closeGuide: 'Close ten-minute guide',
    openGuide: 'Open ten-minute guide',
    evidencePresent: 'Evidence present',
    availableToExplore: 'Available to explore',
    goTo: 'Go to {section}',
    downloadReceipt: 'Download public cooperative receipt',
    saveReload: 'Save and safely reload workplace',

    // Automatic demonstration
    autoLabel: 'Automatic fictional demonstration',
    skipGuide: 'Let fictional roles decide',
    pauseDemo: 'Pause automatic demo',
    keepManual: 'Keep decisions manual',

    // Autoplay status
    demoRunningLabel: 'Fictional demo running',
    autonomousSeason: 'Autonomous cooperative season',
    takeOver: 'Take over cooperative season',
    takeOverCompact: 'Cooperative season running: take over',

    // Season debrief, after the season ends
    debriefLabel: 'Season debrief',
    debriefOpen: 'Read the season debrief',
    debriefDeliveryMet: (p: { customer: string; kg: string }) =>
      `${p.customer}: ${p.kg} kg delivered as agreed`,
    debriefDeliveryShort: (p: { customer: string; delivered: string; target: string }) =>
      `${p.customer}: ${p.delivered} of ${p.target} kg delivered`,
    debriefDeliveryBlocked: (p: { customer: string }) =>
      `${p.customer}: the delivery evidence is no longer current`,
    debriefAgreementHonoured: 'Working agreement honoured',
    debriefAgreementIncomplete: 'Working agreement not completed',
    // 5.5: the season's surplus, split by destination; no amount per member (D-058).
    debriefSobrasOpen: 'Season surplus to settle: {pool} credits',
    debriefSobras: 'Surplus {pool}: Reserve Fund {reserve}, Assistance Fund {fates}',
    debriefSobrasMembers: 'Returned to members by minutes worked: {amount}',
    debriefSobrasCommunity: 'To the community: {amount}',
    debriefSobrasReserve: 'Kept in the Reserve Fund: {amount}',
  },
  'pt-BR': {
    sectionLabel: (p: { section: string }) =>
      pick(
        {
          Handoff: 'Passagem de turno',
          Shift: 'Turno',
          Practices: 'Práticas',
          'Agreement / Voices': 'Acordo / Vozes',
          Review: 'Revisão',
          Experiment: 'Experimento',
        },
        p.section
      ),
    objectionKind: (p: { kind: string }) =>
      pick(
        {
          rest: 'descanso',
          burden: 'carga de trabalho',
          privacy: 'privacidade',
          authority: 'autoridade',
        },
        p.kind
      ),

    regionLabel: 'Responsabilidade pelas decisões',
    ownershipPrefix: 'Responsabilidade pelas decisões:',
    soloRolePlay: 'encenação individual',
    roleTurn: 'vez de {role}',
    facilitatorHandover: 'passagem pelo facilitador',
    adviser: 'Conselheiro',
    interactionMode: 'Modo de interação',
    optionSolo: 'Encenação individual',
    optionSeparate: 'Cada um na sua vez, com facilitação',
    turnOnly: 'Somente {role} pode registrar as decisões de função desta vez.',
    mandateChecksLegend: 'Verificações do mandato atual',
    mandateChecksStatus: 'Verificações do mandato: {done} de {total} conferem com o acordo atual.',
    turnCheckLabel: 'Verificação da vez: {prompt}',
    selectAnswer: 'Selecione uma resposta',
    matchesTerms: 'Confere com os termos atuais. ',
    needsAnotherLook: 'Precisa de outra revisão. ',
    endTurn: 'Encerrar a vez do participante',
    handOver: 'Passar para a função fictícia',
    beginTurn: 'Iniciar a vez do participante',

    seasonSummary: 'Jogue uma temporada cooperativa de três turnos',
    seasonRoute: 'Caminho de adoção da temporada',
    startSeason: 'Iniciar a temporada com o compromisso atual com o cliente',

    fairnessSummary: 'Comprovantes individuais de equidade',
    fairnessLabel: 'Equidade: {role}',
    qualifiedTasks: 'Tarefas habilitadas: {tasks}. Tarefa atual: {task}.',
    taskLabel: (p: { task: string }) => pick(PT_TASK, p.task),
    dutyLine:
      'Trabalho opcional atual: {duty}. {extra} minutos extras em {shifts} turnos; {earlier} minutos anteriores.',
    dutyNoDecision: 'sem decisão',
    dutyVolunteered: 'se ofereceu',
    dutyDeclined: 'recusou',
    payLine:
      'Remuneração conquistada e distribuições aos cooperados: {earned}. Compensação paga: {paid}. Remuneração reservada: {wages}. Compensação reservada: {reserved}.',
    restLine:
      'Descanso concedido: {rest} min. Recuperação concedida: {recovery} min. Recuperação devida: {owed} min.',
    openObjections: (p: CountParams) =>
      p.count === 1
        ? `${p.formatted} objeção aberta mantida.`
        : `${p.formatted} objeções abertas mantidas.`,

    demoLabel: 'Demonstração bilateral guiada',
    closeGuide: 'Fechar o guia de dez minutos',
    openGuide: 'Abrir o guia de dez minutos',
    evidencePresent: 'Evidência presente',
    availableToExplore: 'Disponível para explorar',
    goTo: 'Ir para {section}',
    downloadReceipt: 'Baixar o comprovante público da cooperativa',
    saveReload: 'Salvar e recarregar o local de trabalho com segurança',

    autoLabel: 'Demonstração automática fictícia',
    skipGuide: 'Deixar as funções fictícias decidirem',
    pauseDemo: 'Pausar a demonstração automática',
    keepManual: 'Manter as decisões manuais',

    demoRunningLabel: 'Demonstração fictícia em andamento',
    autonomousSeason: 'Temporada cooperativa autônoma',
    takeOver: 'Assumir a temporada cooperativa',
    takeOverCompact: 'Temporada cooperativa em andamento: assumir',

    debriefLabel: 'Balanço da temporada',
    debriefOpen: 'Ler o balanço da temporada',
    debriefDeliveryMet: (p: { customer: string; kg: string }) =>
      `${p.customer}: ${p.kg} kg entregues como acordado`,
    debriefDeliveryShort: (p: { customer: string; delivered: string; target: string }) =>
      `${p.customer}: ${p.delivered} de ${p.target} kg entregues`,
    debriefDeliveryBlocked: (p: { customer: string }) =>
      `${p.customer}: a evidência de entrega não está mais atual`,
    debriefAgreementHonoured: 'Acordo de trabalho cumprido',
    debriefAgreementIncomplete: 'Acordo de trabalho não concluído',
    debriefSobrasOpen: 'Sobras da temporada a decidir: {pool} créditos',
    debriefSobras: 'Sobras {pool}: Fundo de Reserva {reserve}, FATES {fates}',
    debriefSobrasMembers: 'Devolvidas aos cooperados pelos minutos trabalhados: {amount}',
    debriefSobrasCommunity: 'Destinadas à comunidade: {amount}',
    debriefSobrasReserve: 'Retidas no Fundo de Reserva: {amount}',
  },
});
