import { defineMessages } from '../../../i18n';

export const processInspectionMessages = defineMessages({
  en: {
    inspect: 'Inspect',
    view: 'View inside',
    close: 'Close',
    back: 'Back',
    next: 'Next',
    finish: 'Finish',
    correct: 'Correct.',
    completed: 'Lesson completed',
  },
  'pt-BR': {
    inspect: 'Inspecionar',
    view: 'Ver por dentro',
    close: 'Fechar',
    back: 'Voltar',
    next: 'Avançar',
    finish: 'Concluir',
    correct: 'Correto.',
    completed: 'Lição concluída',
  },
});

/**
 * Each lesson asks what the cutaway in front of the player shows. Choice `a`
 * answers the first question and `b` the second; the card shows them in a
 * seeded order (processInspectionStore.inspectionChoiceOrder). Real-world facts
 * are sourced in stores/millingSources.ts (LESSON_SOURCES); lines that only
 * describe the drawing are checked against machineInspectionGeometry.ts.
 * Numbers arrive as parameters formatted for the active language.
 */
export const processInspectionLessons = {
  mill: defineMessages({
    en: {
      title0: 'Grain feed',
      text0: 'Grain falls from the feed between two rolls with fine ridges, flutes, along them.',
      question0: 'What job do fluted rolls like these do?',
      a0: 'Shear the grain open',
      b0: 'Grind middlings into flour',
      retry0: 'Ridged and smooth rolls do different jobs. Try again.',
      title1: 'Two speeds',
      text1:
        'Fluted rolls work the break passages, which shear the grain open; smooth rolls do the later reduction. The two rolls turn in opposite directions at different speeds: break rolls typically run at a differential of {breakLow} to {breakHigh} to 1, and this pair at {breakBest} to 1.',
      title2: 'The fast roll',
      text2:
        'Smooth reduction rolls run at a smaller differential, typically {reductionLow} to {reductionHigh} to 1.',
      question2: 'Which roll turns faster?',
      a2: 'The back roll',
      b2: 'The front roll, nearer you',
      retry2: 'Watch the heavier flute on each roll. Try again.',
      title3: 'To the sifter',
      text3:
        'The broken stock leaves below the rolls to be sifted. Each later break has finer flutes and a closer gap than the one before.',
    },
    'pt-BR': {
      title0: 'Entrada do grão',
      text0:
        'O grão cai da alimentação entre dois rolos com finas saliências, as estrias, ao longo deles.',
      question0: 'Que trabalho fazem rolos estriados como estes?',
      a0: 'Abrir o grão por cisalhamento',
      b0: 'Moer semolinas até virar farinha',
      retry0: 'Rolos estriados e lisos fazem trabalhos diferentes. Tente novamente.',
      title1: 'Duas velocidades',
      text1:
        'Rolos estriados fazem as passagens de quebra, que abrem o grão por cisalhamento; rolos lisos fazem a redução depois. Os dois rolos giram em sentidos opostos e a velocidades diferentes: os rolos de quebra costumam trabalhar com um diferencial de {breakLow} a {breakHigh} para 1, e este par a {breakBest} para 1.',
      title2: 'O rolo rápido',
      text2:
        'Os rolos lisos de redução trabalham com um diferencial menor, tipicamente de {reductionLow} a {reductionHigh} para 1.',
      question2: 'Qual rolo gira mais rápido?',
      a2: 'O rolo de trás',
      b2: 'O rolo da frente, mais perto de você',
      retry2: 'Observe a estria mais grossa de cada rolo. Tente novamente.',
      title3: 'Para o plansifter',
      text3:
        'O produto quebrado sai por baixo dos rolos para ser peneirado. Cada quebra seguinte tem estrias mais finas e os rolos mais próximos que a anterior.',
    },
  }),
  sifter: defineMessages({
    en: {
      title0: 'Sifter feed',
      text0:
        'Broken stock from the rolls enters above a stack of sieve decks and is sifted through successive screens, each finer than the last.',
      question0: 'What stays on top of a sieve deck?',
      a0: 'Pieces too big for its openings',
      b0: 'The finest flour',
      retry0: 'Think about what an opening lets through. Try again.',
      title1: 'Moving decks',
      text1:
        'The stack swings in a small circle while the stock travels across each screen, and fine stock falls through.',
      title2: 'Along the deck',
      text2: 'This is one deck of the stack, with its stream of stock.',
      question2: 'Where does this deck send what stays on top of its screen?',
      a2: 'Back up to the deck above',
      b2: 'Off the end of the deck, to the next passage',
      retry2: 'Follow the stream across the deck. Try again.',
      title3: 'Sifter outlets',
      text3:
        'What stays on a screen rides along the deck and off its end. Each stream leaves by its own outlet: the coarsest goes on to the next break rolls, and the finest is taken off as flour.',
    },
    'pt-BR': {
      title0: 'Entrada do plansifter',
      text0:
        'O produto quebrado que vem dos rolos entra acima de um conjunto de peneiras e passa por telas sucessivas, cada uma mais fina que a anterior.',
      question0: 'O que fica sobre uma peneira?',
      a0: 'Os pedaços grandes demais para as aberturas',
      b0: 'A farinha mais fina',
      retry0: 'Pense no que uma abertura deixa passar. Tente novamente.',
      title1: 'Peneiras em movimento',
      text1:
        'O conjunto descreve um pequeno círculo enquanto o produto percorre cada tela, e o produto fino a atravessa.',
      title2: 'Ao longo da peneira',
      text2: 'Esta é uma das peneiras do conjunto, com o seu fluxo de produto.',
      question2: 'Para onde esta peneira manda o que fica sobre a tela?',
      a2: 'De volta para a peneira de cima',
      b2: 'Para fora da ponta da peneira, rumo à passagem seguinte',
      retry2: 'Siga o fluxo ao longo da peneira. Tente novamente.',
      title3: 'Saídas do plansifter',
      text3:
        'O que fica sobre a tela segue pela peneira e sai pela ponta. Cada fluxo sai pela sua própria saída: o mais grosso segue para os próximos rolos de quebra, e o mais fino sai como farinha.',
    },
  }),
  packer: defineMessages({
    en: {
      title0: 'Buffer hopper',
      text0: 'Flour arrives above the filling station.',
      question0: 'What holds the flour before a sack is filled?',
      a0: 'The hopper above the gate',
      b0: 'The sack itself',
      retry0: 'Look above the gate. Try again.',
      title1: 'Hopper and spout',
      text1:
        'The flour waits in the hopper above the gate; each fill drops through the spout into a sack.',
      title2: 'Metering gate',
      text2: 'Below the hopper sits a gate.',
      question2: 'What does the gate do in each fill?',
      a2: 'It stays open the whole time',
      b2: 'It slides open, then shuts',
      retry2: 'Watch the gate below the hopper. Try again.',
      title3: 'Packer outlet',
      text3:
        'The gate slides open to let each fill go, then shuts. The spout bends forward to the sack at the filling station.',
    },
    'pt-BR': {
      title0: 'Tremonha intermediária',
      text0: 'A farinha chega acima da estação de enchimento.',
      question0: 'O que guarda a farinha antes de o saco ser enchido?',
      a0: 'A tremonha acima da comporta',
      b0: 'O próprio saco',
      retry0: 'Olhe acima da comporta. Tente novamente.',
      title1: 'Tremonha e bocal',
      text1:
        'A farinha aguarda na tremonha acima da comporta; cada carga cai pelo bocal dentro de um saco.',
      title2: 'Comporta dosadora',
      text2: 'Abaixo da tremonha fica uma comporta.',
      question2: 'O que a comporta faz a cada carga?',
      a2: 'Fica aberta o tempo todo',
      b2: 'Desliza para abrir e depois fecha',
      retry2: 'Observe a comporta abaixo da tremonha. Tente novamente.',
      title3: 'Saída da ensacadeira',
      text3:
        'A comporta desliza para abrir e liberar cada carga, e depois fecha. O bocal se curva para a frente até o saco na estação de enchimento.',
    },
  }),
  silo: defineMessages({
    en: {
      title0: 'Stored grain',
      text0:
        'The silo holds grain until the mill calls for it. The grain column in the cutaway follows the amount actually stored.',
      question0: 'How full is this silo now?',
      a0: 'About {right}% full',
      b0: 'About {wrong}% full',
      retry0: 'Look at the top of the grain column. Try again.',
      title1: 'Grain level',
      text1: 'The column rises and falls with the grain in store.',
      title2: 'Discharge',
      text2: 'This is the foot of the silo.',
      question2: 'Where does grain leave this silo?',
      a2: 'Over the top',
      b2: 'Through the cone at the bottom',
      retry2: 'Follow the grain down. Try again.',
      title3: 'Silo outlet',
      text3:
        'Grain leaves through the cone at the bottom. From the outlet, stored wheat goes on to cleaning and tempering before the first break.',
    },
    'pt-BR': {
      title0: 'Grão armazenado',
      text0:
        'O silo guarda o grão até o moinho pedir. A coluna de grão no corte acompanha a quantidade realmente armazenada.',
      question0: 'Quão cheio está este silo agora?',
      a0: 'Cerca de {right}% cheio',
      b0: 'Cerca de {wrong}% cheio',
      retry0: 'Olhe o topo da coluna de grão. Tente novamente.',
      title1: 'Nível do grão',
      text1: 'A coluna sobe e desce com o grão armazenado.',
      title2: 'Descarga',
      text2: 'Esta é a base do silo.',
      question2: 'Por onde o grão sai deste silo?',
      a2: 'Por cima',
      b2: 'Pelo cone na parte de baixo',
      retry2: 'Siga o grão para baixo. Tente novamente.',
      title3: 'Saída do silo',
      text3:
        'O grão sai pelo cone na parte de baixo. Da saída, o trigo armazenado segue para a limpeza e o condicionamento antes da primeira quebra.',
    },
  }),
  henhouse: defineMessages({
    en: {
      title0: 'Nests',
      text0: 'Nesting boxes provide a sheltered place for hens to lay eggs.',
      question0: 'What are the nesting boxes for?',
      a0: 'Laying eggs',
      b0: 'Grinding grain',
      retry0: 'The sheltered nests are places for hens to lay eggs. Try again.',
      title1: 'Feed and water',
      text1: 'Feed and fresh water support the hens each day.',
      title2: 'Perch and rest',
      text2: 'Perches give hens a raised place to rest.',
      question2: 'What is the perch for?',
      a2: 'Filling sacks',
      b2: 'Resting above the floor',
      retry2: 'The raised perch gives hens a resting place. Try again.',
      title3: 'Gentle collection',
      text3: 'Collect eggs gently from the nests, keeping movement calm around the hens.',
    },
    'pt-BR': {
      title0: 'Ninhos',
      text0: 'Os ninhos oferecem um lugar protegido para as galinhas botarem ovos.',
      question0: 'Para que servem os ninhos?',
      a0: 'Botar ovos',
      b0: 'Moer grão',
      retry0: 'Os ninhos protegidos são lugares para as galinhas botarem ovos. Tente novamente.',
      title1: 'Ração e água',
      text1: 'Ração e água fresca atendem às necessidades diárias das galinhas.',
      title2: 'Poleiro e descanso',
      text2: 'Os poleiros dão às galinhas um lugar elevado para descansar.',
      question2: 'Para que serve o poleiro?',
      a2: 'Encher sacos',
      b2: 'Descansar acima do chão',
      retry2: 'O poleiro elevado oferece um lugar de descanso. Tente novamente.',
      title3: 'Coleta cuidadosa',
      text3:
        'Recolha os ovos dos ninhos com cuidado, mantendo movimentos calmos perto das galinhas.',
    },
  }),
};
