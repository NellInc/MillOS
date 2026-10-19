import { defineMessages } from '../../../i18n';

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
    rehearsalNotice:
      'Shared-device synthetic rehearsal. Separate turns limit local role actions. They provide no identity authentication or proof of freedom from coercion. Real worker sessions need separate authentication and agreed safeguards.',
    interactionMode: 'Interaction mode',
    optionSolo: 'Solo role-play',
    optionSeparate: 'Facilitated separate turns',
    turnOnly:
      'Only {role} may record this turn’s role decisions. Changed terms end the turn. End this turn before facilitator activation or settlement.',
    mandateChecksLegend: 'Current mandate checks',
    mandateChecksStatus:
      'Mandate checks: {done} of {total} match the current agreement. Confirming understanding remains a separate choice.',
    turnCheckLabel: 'Turn check: {id}',
    selectAnswer: 'Select an answer',
    matchesTerms: 'Matches the current terms. ',
    needsAnotherLook: 'Needs another look. ',
    endTurn: 'End participant turn',
    handOver: 'Hand over to fictional role',
    beginTurn: 'Begin participant turn',
    handOverNote:
      'Hand the device over before beginning. The facilitator may prepare terms and explain facts, and cannot record role decisions.',

    // Season entry
    seasonSummary: 'Play a three-shift cooperative season',
    seasonIntro:
      'Friday: agree an urgent delivery. Monday: inspect under pressure. Thursday: renegotiate repeated burden. Cash, pay and workload carry forward; each shift needs fresh consent.',
    seasonRoute: 'Season adoption route',
    adoptionNote:
      'Keep this degree of adoption throughout; escalation is optional in a future exercise.',
    startSeason: 'Start season with current customer commitment',
    seasonRequires:
      'Requires an open, qualified customer commitment. Real dispatch earns delivery; a defensible shortfall is a valid ending.',

    // Fairness receipts
    fairnessSummary: 'Individual fairness receipts',
    fairnessIntro:
      'Illustrative credits and modeled minutes. Earned pay includes member distributions; extra-duty compensation is separate. Current reservations are earmarked funds, awaiting work.',
    fairnessLabel: 'Fairness: {role}',
    qualifiedTasks: 'Qualified tasks: {tasks}. Current task: {task}.',
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
    guideIntro:
      'About ten minutes of discussion, with plant time controlled separately. Evidence marks observed choices; a skipped optional choice stays available. The guide never makes decisions for you.',
    evidencePresent: 'Evidence present',
    availableToExplore: 'Available to explore',
    goTo: 'Go to {section}',
    downloadReceipt: 'Download public cooperative receipt',
    saveReload: 'Save and safely reload workplace',

    // Automatic demonstration
    autoLabel: 'Automatic fictional demonstration',
    autoRunning:
      'Automatic solo demonstration: fictional roles choose, refuse and revoke sharing. Real simulated plant departures earn delivery.',
    autoIdle:
      'The cooperative season runs autonomously by default. Take over whenever you want. Separate participant turns always stay manual.',
    autoManual:
      'You can let fictional solo roles demonstrate the season, or keep making the choices yourself.',
    skipGuide: 'Skip guide and run fictional demo',
    pauseDemo: 'Pause automatic demo',
    keepManual: 'Keep decisions manual',

    // Autoplay status
    demoRunningLabel: 'Fictional demo running',
    autonomousSeason: 'Autonomous cooperative season',
    autonomousSeasonDetail:
      "Fictional cooperative roles are making this season's decisions while the plant runs. Take over to make them yourself in the Bilateral Autonomy System (BAS) panel; the shift keeps running.",
    takeOver: 'Take over cooperative season',
    takeOverCompact: 'Cooperative season running: take over',
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
    rehearsalNotice:
      'Ensaio sintético em dispositivo compartilhado. Jogar cada um na sua vez limita as ações locais de cada função. Isso não autentica a identidade nem comprova a ausência de coerção. Sessões com trabalhadores reais exigem autenticação separada e salvaguardas acordadas.',
    interactionMode: 'Modo de interação',
    optionSolo: 'Encenação individual',
    optionSeparate: 'Cada um na sua vez, com facilitação',
    turnOnly:
      'Somente {role} pode registrar as decisões de função desta vez. Termos alterados encerram a vez. Encerre esta vez antes da ativação pelo facilitador ou do acerto final.',
    mandateChecksLegend: 'Verificações do mandato atual',
    mandateChecksStatus:
      'Verificações do mandato: {done} de {total} conferem com o acordo atual. Confirmar o entendimento continua sendo uma escolha separada.',
    turnCheckLabel: 'Verificação da vez: {id}',
    selectAnswer: 'Selecione uma resposta',
    matchesTerms: 'Confere com os termos atuais. ',
    needsAnotherLook: 'Precisa de outra revisão. ',
    endTurn: 'Encerrar a vez do participante',
    handOver: 'Passar para a função fictícia',
    beginTurn: 'Iniciar a vez do participante',
    handOverNote:
      'Passe o dispositivo antes de começar. O facilitador pode preparar os termos e explicar os fatos, mas não pode registrar decisões das funções.',

    seasonSummary: 'Jogue uma temporada cooperativa de três turnos',
    seasonIntro:
      'Sexta-feira: combine uma entrega urgente. Segunda-feira: inspecione sob pressão. Quinta-feira: renegocie a sobrecarga recorrente. Caixa, remuneração e carga de trabalho seguem adiante; cada turno precisa de um novo consentimento.',
    seasonRoute: 'Caminho de adoção da temporada',
    adoptionNote:
      'Mantenha esse grau de adoção do começo ao fim; a escalada é opcional em um exercício futuro.',
    startSeason: 'Iniciar a temporada com o compromisso atual com o cliente',
    seasonRequires:
      'Exige um compromisso com o cliente aberto e qualificado. A expedição real conta como entrega; um déficit justificável é um final válido.',

    fairnessSummary: 'Comprovantes individuais de equidade',
    fairnessIntro:
      'Créditos ilustrativos e minutos modelados. A remuneração conquistada inclui as distribuições aos cooperados; a compensação por trabalho extra é separada. As reservas atuais são fundos destinados, aguardando o trabalho.',
    fairnessLabel: 'Equidade: {role}',
    qualifiedTasks: 'Tarefas habilitadas: {tasks}. Tarefa atual: {task}.',
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
    guideIntro:
      'Cerca de dez minutos de conversa, com o tempo da planta controlado à parte. As evidências marcam escolhas observadas; uma escolha opcional pulada continua disponível. O guia nunca toma decisões por você.',
    evidencePresent: 'Evidência presente',
    availableToExplore: 'Disponível para explorar',
    goTo: 'Ir para {section}',
    downloadReceipt: 'Baixar o comprovante público da cooperativa',
    saveReload: 'Salvar e recarregar o local de trabalho com segurança',

    autoLabel: 'Demonstração automática fictícia',
    autoRunning:
      'Demonstração individual automática: funções fictícias escolhem, recusam e revogam o compartilhamento. Saídas reais da planta simulada contam como entrega.',
    autoIdle:
      'A temporada cooperativa roda de forma autônoma por padrão. Assuma quando quiser. A vez de cada participante é sempre manual.',
    autoManual:
      'Você pode deixar funções individuais fictícias demonstrarem a temporada ou continuar fazendo as escolhas você mesmo.',
    skipGuide: 'Pular o guia e rodar a demonstração fictícia',
    pauseDemo: 'Pausar a demonstração automática',
    keepManual: 'Manter as decisões manuais',

    demoRunningLabel: 'Demonstração fictícia em andamento',
    autonomousSeason: 'Temporada cooperativa autônoma',
    takeOver: 'Assumir a temporada cooperativa',
    autonomousSeasonDetail:
      'Funções cooperativas fictícias tomam as decisões desta temporada enquanto o moinho opera. Assuma para decidir você mesmo no painel Sistema de Autonomia Bilateral (BAS); o turno continua.',
    takeOverCompact: 'Temporada cooperativa em andamento: assumir',
  },
});
