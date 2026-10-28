import { defineMessages } from '../i18n';
import type { HistoryNote } from './types';

type Copy = Pick<HistoryNote, 'title' | 'brief' | 'article'>;

const portuguese: Record<string, Copy> = {
  'history-first-grain': {
    title: 'Os primeiros grãos',
    brief:
      'Antes de o Egito ter reis, agricultores do vale do Nilo cultivavam trigo emmer e cevada e os moíam à mão em mós de vaivém.',
    article:
      '## Emmer, cevada e a mó de vaivém\n\nAntes de o Egito ter reis, os agricultores do vale do Nilo já cultivavam dois cereais: o emmer, um trigo de grãos vestidos, e a cevada. O pão e a cerveja feitos com eles se tornaram a base da alimentação egípcia. Em Hierakonpolis, no período pré-dinástico, resíduos em grandes cubas de fermentação indicam o uso de emmer maltado e triturado, com uma proporção menor de cevada.\n\nO emmer dava trabalho. Suas cascas aderem ao grão, que precisava ser umedecido e pilado, seco, joeirado e peneirado antes mesmo de poder ser moído. A moagem era feita em uma mó de vaivém: uma pedra inferior plana sobre a qual se esfregava uma pedra menor, para a frente e para trás, sobre os grãos. Era um trabalho lento, feito de joelhos, e partículas das pedras acabavam no pão e desgastavam os dentes de quem o comia.\n\nSeu estatuto está assinado. Cada lote recebido, banco de rolos e plansifter deste moinho descende daquela pedra e daquela mão de mó. A tarefa continua a mesma: separar a farinha da casca, com limpeza e em quantidade.',
  },
  'history-grinding-statues': {
    title: 'A moagem esculpida em pedra',
    brief:
      'Tumbas do Reino Antigo guardavam pequenas figuras de calcário de servos moendo grãos, para que os mortos nunca ficassem sem pão.',
    article:
      '## Servos para a eternidade\n\nNo Reino Antigo, egípcios ricos colocavam pequenas estátuas de servos em suas tumbas. As figuras se ajoelhavam diante de mós, amassavam massa, cuidavam dos fornos e coavam cerveja. Tinham uma finalidade prática: cuidar da produção de alimentos para os mortos na outra vida, para que o dono da tumba nunca passasse fome.\n\nA moagem de grãos é uma das cenas mais comuns. O Metropolitan Museum of Art guarda uma figura de calcário pintado, Servant Grinding Grain, da segunda metade da Quinta Dinastia, provavelmente da região de Giza. Ela trabalha em uma mó de vaivém, com o mesmo movimento para a frente e para trás usado pelos primeiros agricultores do Nilo.\n\nNenhuma inscrição registra seu nome. As estátuas representam o trabalho que sustentava todos os grandes Estados da época: longas horas de moagem, por mulheres e homens, para transformar grãos em farinha, um punhado de cada vez.\n\nO Grande Programa terminou. Qualquer que tenha sido a medalha, a tonelagem do seu registro de expedição exigiria muito mais de uma vida inteira de alguém moendo de joelhos. Hoje os rolos fazem esse trabalho; as figuras nas tumbas lembram quem o fez primeiro.',
  },
  'history-old-kingdom-bakeries': {
    title: 'Pão para os construtores das pirâmides',
    brief:
      'Ao sul da Esfinge, arqueólogos encontraram as padarias que alimentavam os trabalhadores da era das pirâmides de Giza.',
    article:
      '## O Muro do Corvo\n\nCerca de 400 metros ao sul da Esfinge fica um assentamento conhecido pelo nome árabe Heit el-Ghurab, o Muro do Corvo, em referência a um enorme muro de pedra em sua extremidade norte. Escavado desde o fim dos anos 1980 pela Ancient Egypt Research Associates, sob a direção de Mark Lehner, ele data dos reinados de Khafre e Menkaure, na Quarta Dinastia. Ali viviam e se alimentavam pessoas que trabalhavam nos complexos das pirâmides.\n\nPadarias apareceram na escavação de 1991 da equipe, e outras foram identificadas desde então, muitas delas em grandes edifícios de caráter industrial. O pão era assado em formas cônicas de cerâmica chamadas bedja: as formas eram aquecidas, enchidas de massa e colocadas em valas rasas no chão, com brasas ao redor. Em alguns depósitos, fragmentos dessas formas constituem a maior parte da cerâmica.\n\nAlimentar tantos trabalhadores exigia planejar a moagem, o preparo do pão e as entregas como qualquer outra parte da obra.\n\nFaltam dois turnos para o Grande Programa. Nove turnos, vinte mil quilogramas e nenhum saco abaixo do padrão. Como os padeiros de Giza, você precisa entregar volume sem deixar a qualidade cair.',
  },
  'history-nilometer': {
    title: 'A leitura do rio',
    brief:
      'Os nilômetros do Egito mediam a altura da cheia do Nilo, que permitia prever a colheita e definir o imposto.',
    article:
      '## O nilômetro\n\nA colheita do Egito dependia da cheia anual do Nilo. Se fosse baixa demais, os campos ficavam sem água; se fosse alta demais, aldeias e diques eram arrastados. Para saber o que vinha pela frente, os egípcios construíram nilômetros: medidores graduados em côvados, na forma de uma coluna marcada, uma escadaria que descia até o rio ou um poço profundo alimentado por um canal.\n\nO nilômetro em escadaria da ilha de Elephantine, em Aswan, é o mais conhecido. Durante boa parte da história egípcia, Elephantine marcava a fronteira sul, sendo o primeiro lugar onde se podia medir a subida das águas. Na ilha de Roda, no Cairo, ainda existe um nilômetro construído em 861 d.C.\n\nAs leituras tinham uma segunda utilidade. Como a altura da cheia indicava o tamanho da colheita, ela servia para definir o imposto devido pelos agricultores. Uma previsão também era um orçamento, e uma cheia baixa significava um ano de escassez.\n\nSuas previsões e seus anos agrícolas funcionam da mesma forma. Uma previsão indica um perigo, uma probabilidade e um turno; um ano seco aparece nos lotes do recebimento. Como a leitura de um nilômetro, essas informações só têm valor se você agir antes que a falta chegue.',
  },
  'history-nomarchs': {
    title: 'Os governadores dos nomos',
    brief:
      'No fim do Reino Antigo, governadores provinciais tornaram seus cargos hereditários e o poder se afastou do rei.',
    article:
      '## Nomos e nomarcas\n\nO Egito antigo era dividido em províncias que os gregos mais tarde chamaram de nomos; o funcionário responsável por uma delas costuma ser chamado de nomarca, embora muitos estudiosos hoje prefiram a palavra mais simples, governador. Um governador administrava sua província em nome do rei.\n\nPerto do fim do Reino Antigo, o equilíbrio mudou. Os governos provinciais se tornaram hereditários: famílias os mantinham por gerações, construíam suas tumbas nas próprias províncias em vez de perto do rei, formavam suas próprias forças e enfrentavam rivais locais. Depois do longo reinado de Pepi II, na Sexta Dinastia, o Estado central se fragmentou em poderes regionais concorrentes, na época que os historiadores chamam de Primeiro Período Intermediário.\n\nHoje, os historiadores tendem a ver esse período como uma época de mudança, em vez de simples colapso. Mas a autoridade conquistada pelas províncias não foi fácil de recuperar.\n\nVocê delegou autoridade ao parceiro de IA. Diferentemente do cargo de um nomarca, essa autoridade mantém limites: toda iniciativa fica registrada com sua justificativa, e as reversíveis podem ser desfeitas.',
  },
  'history-domesday-mills': {
    title: 'Os moinhos de Domesday',
    brief:
      'O grande levantamento de William the Conqueror, em 1086, contou milhares de moinhos por toda a Inglaterra.',
    article:
      '## Um reino contado\n\nVinte anos depois da conquista normanda, William the Conqueror ordenou um levantamento das terras que governava. Seus resultados, concluídos em 1086 e mais tarde chamados de Domesday Book, registravam quem detinha cada domínio e quanto ele valia, incluindo prados, bosques, pesqueiros e moinhos.\n\nOs moinhos aparecem por toda parte. As contagens dos historiadores vão de cerca de cinco mil e seiscentos a mais de seis mil, e mesmo o menor número é considerado incompleto, porque o levantamento não abrange tudo. Quase todos eram moinhos de grãos movidos a água: os moinhos de vento ainda não haviam chegado à Inglaterra, e alguns locais talvez usassem animais. Cada moinho era registrado com seu valor, pois gerava renda para quem o detinha.\n\nDomesday era uma avaliação feita para que o rei soubesse o que cada propriedade devia.\n\nVocê acaba de fechar seu primeiro relatório de turno. É o seu pequeno Domesday: o que entrou, o que saiu, quanto cada linha rendeu e quanto custou. Leia-o como o registro que sustenta suas próximas decisões.',
  },
  'history-watermills': {
    title: 'Rodas na água',
    brief:
      'Um engenheiro romano descreveu o moinho de água com engrenagens e, perto de Arles, dezesseis rodas moíam grãos em uma única encosta.',
    article:
      '## Vitruvius e Barbegal\n\nO arquiteto e engenheiro romano Vitruvius, escrevendo no fim do século I a.C., fez a primeira descrição técnica de um moinho de água. Uma roda vertical girava em um eixo horizontal, movida pela corrente que passava por baixo dela. No eixo, uma roda dentada em forma de tambor se engrenava com uma roda horizontal maior, que fazia a mó girar. Os moinhos de água estavam entre as primeiras fontes de energia que dispensavam a força muscular de pessoas ou animais.\n\nEm Barbegal, perto de Arles, no sul da França, engenheiros romanos levaram a ideia à escala industrial. Um aqueduto alimentava dezesseis rodas de água dispostas em duas fileiras paralelas de oito, descendo uma encosta íngreme, cada uma acionando seu próprio moinho. O complexo data do século II d.C. e costuma ser chamado de primeira tentativa europeia de criar um conjunto de máquinas em escala industrial.\n\nA água forneceu energia aos moinhos por quase dois mil anos. Também era seu perigo mais antigo: um rio em cheia podia levar a roda, o canal e o edifício.\n\nUma chuva intensa cai sobre o local. A mesma água que antes movia as mós agora ameaça o pátio, a doca de recebimento e as entregas na estrada.',
  },
  'history-windmills': {
    title: 'O moinho de poste',
    brief:
      'Os primeiros moinhos de vento da Inglaterra, registrados desde a década de 1180, eram moinhos de poste, cujo corpo inteiro girava para enfrentar o vento.',
    article:
      '## De frente para o vento\n\nOs moinhos de vento chegaram à Inglaterra cerca de um século depois de Domesday. Os registros escritos começam na década de 1180; um dos primeiros, de 1185, trata de um moinho em Weedley, Yorkshire. Esses primeiros exemplares eram moinhos de poste.\n\nUm moinho de poste equilibra todo o seu corpo, com as velas, as engrenagens e as mós, sobre um único grande poste vertical. O vento no noroeste da Europa muda de direção com frequência, por isso o moleiro precisava virar o moinho inteiro para enfrentá-lo, empurrando uma longa haste traseira que chegava até o chão. Os primeiros postes eram fincados em montes de terra; mais tarde, os moinhos passaram a se apoiar em uma armação de madeira, muitas vezes abrigada por uma construção circular na base.\n\nO moinho de poste libertou a moagem das margens dos rios. Um moinho podia ficar em qualquer elevação exposta, onde houvesse grãos para moer e vento para movê-lo.\n\nVocê instalou uma turbina eólica. A escolha mais antiga do moinho continua a mesma: o vento é gratuito, mas sopra quando quer, e a unidade precisa estar pronta para aproveitá-lo e seguir funcionando sem ele.',
  },
  'history-millwrights': {
    title: 'Os construtores de moinhos',
    brief:
      'Construtores de moinhos faziam rodas, engrenagens e eixos à mão, e de seu ofício vieram os primeiros engenheiros.',
    article:
      '## Engenheiros antes do nome\n\nPor séculos, o construtor de moinhos projetava e construía o moinho inteiro: a roda de água ou as velas, as engrenagens, os eixos e as mós. Seu ofício costuma ser considerado o precursor da engenharia mecânica moderna, e dele vieram dois dos grandes engenheiros britânicos do século XVIII.\n\nJames Brindley tornou-se aprendiz de um construtor de moinhos aos dezessete anos e ganhou fama reparando e melhorando máquinas. O Duke of Bridgewater então o contratou para transportar carvão de suas minas em Worsley até Manchester. O Bridgewater Canal, aberto em 1761, fez de Brindley um dos principais engenheiros de canais de sua época.\n\nJohn Smeaton construía modelos em escala de rodas de água e moinhos de vento e media seu desempenho. Seu artigo sobre o tema ganhou a Copley Medal da Royal Society em 1759. Mais tarde, adotou o título de engenheiro civil para distinguir consultores civis de engenheiros militares, e costuma ser chamado de pai da engenharia civil.\n\nVocê contratou um prestador de serviços. Suas características são seu histórico: o que economiza, o que arrisca e em quanto tempo termina. Escolha como um dono de moinho escolhia seu construtor.',
  },
  'history-oliver-evans': {
    title: 'O moinho que funcionava sozinho',
    brief:
      'Na década de 1780, em Delaware, Oliver Evans construiu um moinho de farinha em que os grãos iam do recebimento ao barril quase sem trabalho manual.',
    article:
      '## Oliver Evans\n\nNa década de 1780, Oliver Evans decidiu eliminar o trabalho mais pesado do moinho de seus irmãos em Red Clay Creek, Delaware. Elevadores de canecas levavam os grãos ao topo do edifício. Transportadores helicoidais os conduziam adiante. Uma máquina que ele chamou de hopper boy, um ancinho que girava lentamente, espalhava o produto quente das mós para esfriar e secar antes da peneiração, tarefa antes feita com pás. A água movia toda a sequência, e os grãos passavam de um processo a outro sem serem carregados.\n\nEm 1790, Evans recebeu a terceira patente concedida sob a nova lei de patentes dos Estados Unidos. Em 1795, publicou The Young Mill-Wright and Miller’s Guide, que explicava em detalhes seu sistema e a prática da moagem. A obra teve quinze edições até 1860 e tornou-se o manual de referência dos moleiros americanos.\n\nA automação mudou o trabalho do moleiro, que passou do transporte de cargas à supervisão, regulagem e manutenção.\n\nSeu moinho agora é distrital. Os transportadores, elevadores e pontos de transferência que o fazem funcionar descendem do fluxo contínuo de Evans.',
  },
  'history-albion-mills': {
    title: 'O incêndio dos Albion Mills',
    brief:
      'O grande moinho de farinha a vapor de Londres, uma maravilha de sua época, foi destruído por um incêndio em 1791.',
    article:
      '## Vapor no Tâmisa\n\nOs Albion Mills ficavam na ponta sul da Blackfriars Bridge, em Southwark, Londres. Matthew Boulton os planejou a partir de 1783, John Rennie projetou as máquinas de moagem, e motores a vapor de Boulton e Watt acionavam vinte pares de mós. Concluídos em 1786, foram o primeiro moinho comercial de farinha movido a vapor da Grã-Bretanha e foram celebrados como uma maravilha industrial da época.\n\nNa madrugada de 2 de março de 1791, começou um incêndio. Em cerca de duas horas, o interior do edifício foi destruído. A causa nunca foi oficialmente estabelecida. Muitos suspeitaram de incêndio criminoso provocado por moleiros rivais ou trabalhadores que temiam a concorrência. A estrutura queimada permaneceu à beira do rio por anos antes de ser demolida.\n\nO incêndio mostrou o que significava concentrar a produção: quando um grande moinho queimava, toda a sua produção desaparecia de uma vez.\n\nHá um incêndio nos dutos de extração. O sistema de segurança parou a produção e as empilhadeiras. Ninguém está em perigo. Apague o fogo, limpe os dutos e depois investigue o que permitiu que ele começasse.',
  },
  'history-roller-milling': {
    title: 'Os rolos de Budapest',
    brief:
      'Na década de 1870, engenheiros de Budapest substituíram as mós por rolos de ferro fundido coquilhado e mudaram a moagem no mundo inteiro.',
    article:
      '## Moagem gradual na Hungria\n\nNo século XIX, Budapest tornou-se uma das grandes cidades moageiras do mundo. Os moleiros húngaros praticavam a moagem gradual: em vez de transformar o trigo em farinha em uma única passagem, quebravam-no aos poucos, peneirando e remoendo repetidamente para extrair a farinha mais branca.\n\nOs rolos se adequavam melhor ao método do que as mós. O moinho de rolos de Friedrich Wegmann usava rolos de porcelana, que eram frágeis. A fábrica Ganz, em Buda, já conhecida pelo ferro fundido coquilhado, passou a produzir rolos desse material: duros, resistentes ao desgaste e ranhurados para quebrar o grão. Sob András Mechwart, que dirigiu Ganz após a morte de seu fundador em 1867, a empresa comprou a patente de Wegmann, aperfeiçoou o projeto e vendeu moinhos de rolos pelo mundo durante a década de 1870 e depois dela.\n\nNas décadas seguintes, os moinhos de rolos passaram a substituir as mós nos grandes moinhos comerciais da Europa e da América do Norte.\n\nSeu moinho agora é regional. Seus bancos de rolos são herdeiros dos rolos de Budapest: a mesma redução gradual, os mesmos pares de cilindros de ferro, operados com uma precisão que Mechwart só podia almejar.',
  },
  'history-plansifter': {
    title: 'O plansifter',
    brief:
      'Carl Haggenmacher, moleiro de Budapest, patenteou o plansifter no fim da década de 1880: peneiras empilhadas em movimento circular horizontal.',
    article:
      '## Peneiras empilhadas\n\nA redução gradual criou um novo problema. Cada passagem pelos rolos precisava ser peneirada, e as máquinas de peneiração da época, cilindros giratórios revestidos de tecido, eram volumosas e consumiam muita energia.\n\nCarl Haggenmacher, nascido em Winterthur, na Suíça, em 1835, trabalhou como moleiro em Budapest e patenteou várias invenções para a moagem. A mais importante foi o plansifter, cuja patente original ele apresentou em 1887. Em vez de um cilindro giratório, o equipamento empilhava peneiras planas em uma caixa e as movia em um plano horizontal, de modo que o produto percorresse cada peneira e o material fino caísse para a seguinte.\n\nO plansifter fazia o mesmo trabalho em menos espaço e com menos energia, e seus descendentes continuam sendo as máquinas de peneiração habituais nos moinhos de farinha de hoje.\n\nVocê instalou uma modernização do plansifter. Os plansifters do seu andar superior seguem o projeto de Haggenmacher, aperfeiçoado ao longo de mais de um século: peneiras empilhadas, movimento giratório e uma separação que decide a qualidade de cada saco produzido abaixo.',
  },
  'history-washburn-a': {
    title: 'A explosão do Washburn A',
    brief:
      'Em 2 de maio de 1878, a poeira de farinha explodiu dentro do Washburn A Mill, em Minneapolis, matando dezoito trabalhadores.',
    article:
      '## Poeira é combustível\n\nO Washburn A Mill abriu em 1874 à beira do rio em Minneapolis e estava entre os maiores moinhos de farinha dos Estados Unidos. Na noite de 2 de maio de 1878, pouco depois da chegada da equipe noturna, uma série de explosões o destruiu. Todos os catorze homens que estavam dentro morreram, e o fogo se espalhou para os moinhos vizinhos Diamond e Humboldt, matando mais quatro. Dezoito trabalhadores morreram.\n\nNo inquérito, o gerente do moinho atribuiu a tragédia à combustão rápida da poeira de farinha, e dois professores da University of Minnesota depois confirmaram a hipótese em experimentos. Concluíram que duas mós funcionando sem grãos haviam produzido uma faísca que incendiou a poeira no ar.\n\nO desastre mudou o setor. O A Mill reconstruído de Washburn, já em funcionamento em 1880, tinha nova ventilação para impedir o acúmulo de poeira, e dispositivos que passaram a ser chamados de coletores de pó se espalharam por outros moinhos. As ruínas do moinho reconstruído hoje abrigam o Mill City Museum.\n\nA pressão do seu filtro de pó está subindo. Esse alarme existe por causa de 1878. Um filtro bloqueado representa poeira que deveria estar em um saco e está no ar.',
  },
  'history-grain-elevator': {
    title: 'O primeiro elevador de grãos',
    brief:
      'Em 1842, Joseph Dart e Robert Dunbar construíram um elevador de grãos a vapor em Buffalo, no estado de New York.',
    article:
      '## Grãos sem sacos\n\nNo início do século XIX, os grãos que chegavam a Buffalo em navios dos Grandes Lagos eram descarregados à mão, em barris e sacos. O comerciante Joseph Dart e o engenheiro Robert Dunbar decidiram mecanizar a transferência.\n\nUsando os elevadores de canecas de Oliver Evans como modelo, construíram um elevador a vapor em 1842. Sua perna marítima, um transportador de canecas baixado ao porão de um navio, recolhia os grãos a granel e os levava ao topo de uma torre, de onde podiam ser pesados, armazenados e carregados para seguir viagem. A construção começou em 1842, e o elevador entrou em serviço em 1843.\n\nFuncionou tão bem que outros copiaram a ideia ao longo do cais. No fim da década de 1840, Buffalo tinha dez elevadores. Em cerca de quinze anos, havia se tornado um dos maiores portos de grãos do mundo, e a movimentação a granel substituiu o saco.\n\nVocê recebeu sua primeira entrega. A moega, o elevador e o silo que ele abastece seguem a ideia de Dart e Dunbar: grãos soltos, sempre em movimento e pesados na entrada.',
  },
  'history-falling-number': {
    title: 'O número de queda',
    brief:
      'Um teste sueco do fim da década de 1950 cronometra a queda de um agitador para detectar danos por germinação nos grãos.',
    article:
      '## Cronometrando uma queda\n\nQuando chove sobre trigo maduro, os grãos podem começar a germinar na espiga. A germinação produz grandes quantidades de alfa-amilase, enzima que decompõe o amido. A farinha de grãos germinados produz massas pegajosas e pães de baixa qualidade, e até poucos grãos muito germinados podem afetar um lote inteiro.\n\nNo fim da década de 1950, Sven Hagberg e Harald Perten, do Swedish Institute for the Crafts and Industries, desenvolveram um teste simples. Grãos moídos e água são aquecidos em um tubo e agitados; depois, um agitador é solto para atravessar a suspensão. O tempo que ele leva para chegar ao fundo, em segundos, é o número de queda. Mais enzima significa uma suspensão menos viscosa, uma queda mais rápida e um número menor.\n\nUm número de queda baixo alerta para danos por germinação. O método tornou-se um padrão internacional e continua em uso no comércio de grãos e em moinhos de farinha do mundo inteiro.\n\nO número de queda é uma das leituras de CQ do seu laboratório, medido nos lotes em teste. Acompanhe-o sempre que a colheita tiver enfrentado tempo úmido, sobretudo em um ano agrícola com germinação: ele revela danos que você não consegue identificar só de olhar os grãos.',
  },
  'history-grain-moisture': {
    title: 'Manter os grãos secos',
    brief:
      'Os grãos só ficam armazenados com segurança quando secos, e os moleiros devolvem água a eles de propósito logo antes da moagem.',
    article:
      '## Umidade no armazenamento e nos rolos\n\nO grão está vivo, e o grão úmido continua ativo. Acima de aproximadamente quatorze a quatorze e meio por cento de umidade, o trigo armazenado corre risco de aquecimento, mofo e ácaros. Orientações do Reino Unido observam que o crescimento de mofo e a reprodução de ácaros cessam quando o ar ao redor do grão fica abaixo de sessenta e cinco por cento de umidade relativa, condição que grãos secos e mantidos frios conseguem sustentar. À mesma umidade, grãos mais frios ficam mais seguros; por isso, busca-se secar e resfriar a colheita rapidamente.\n\nAinda assim, os moleiros depois devolvem água aos grãos de propósito. Antes da moagem, o trigo é condicionado: umedecido e deixado em repouso para tornar o farelo mais resistente e o endosperma interno mais macio. O farelo resistente se separa do endosperma de forma limpa, em vez de se fragmentar na farinha.\n\nAssim, a umidade é controlada duas vezes: mantida baixa para o armazenamento e depois elevada a um nível preciso para os rolos.\n\nEste é um ano agrícola úmido. Os lotes chegam mais úmidos que de costume, e grãos úmidos sem condicionamento prejudicam a qualidade. O condicionamento ou um secador elimina a penalidade.',
  },
  'history-grain-drying': {
    title: 'Secagem por máquina',
    brief:
      'A colheitadeira combinada eliminou as semanas de secagem dos grãos no campo, que então precisaram ser secos por máquina.',
    article:
      '## Dos feixes ao secador\n\nDurante a maior parte da história, os cereais cortados secavam no campo. Os feixes eram agrupados em medas, com as espigas fora do chão, e ficavam ali por dias ou semanas antes do transporte e da debulha. Um verão chuvoso podia fazê-los germinar onde estavam.\n\nA colheitadeira combinada corta e debulha em uma única passagem, eliminando esse intervalo de secagem. Os grãos vão direto para o tanque, muitas vezes mais úmidos do que seria seguro armazenar. Por isso, a colheita combinada em climas úmidos exigiu secagem mecânica. Em 1928, Roland Dudley comprou uma das primeiras colheitadeiras combinadas do Reino Unido para sua propriedade em Linkenholt, Hampshire, e descobriu que ela colhia mais depressa do que os grãos podiam secar. Ele projetou um secador, construído por E. R. and F. Turner, de Ipswich, por volta de 1929, que está entre os primeiros secadores mecanizados de grãos da Grã-Bretanha. A secagem em escala industrial se tornou rotineira depois da Segunda Guerra Mundial.\n\nA colheita úmida ficou para trás. No mundo real, máquinas como a de Dudley explicam por que hoje um verão chuvoso resulta em uma conta de secagem, em vez de uma safra perdida.',
  },
  'history-wet-harvest-1879': {
    title: 'O verão chuvoso de 1879',
    brief:
      'Em 1879, a chuva arruinou a colheita britânica, enquanto o trigo americano barato mantinha os preços baixos e aprofundava uma longa depressão agrícola.',
    article:
      '## Uma colheita arruinada\n\nO fim da década de 1870 trouxe uma sequência de colheitas ruins à Grã-Bretanha, e a de 1879 foi a pior. Um relato descreve chuvas que começaram no início da primavera e persistiram até o fim de setembro. A cevada fracassou nos solos pesados, e o trigo escureceu e encolheu na espiga.\n\nAntes, uma colheita ruim teria elevado os preços e amenizado o prejuízo. Em 1879, isso não aconteceu. As pradarias americanas haviam sido abertas ao arado, e navios a vapor baratos levavam seu trigo através do Atlântico. As importações cobriram a falta, os preços continuaram baixos, e os agricultores britânicos perderam tanto a colheita quanto o preço que poderia compensá-la.\n\nOs anos chuvosos esconderam por algum tempo a causa mais profunda. A grande depressão da agricultura britânica, geralmente situada entre 1873 e 1896, foi impulsionada pela queda dos preços dos grãos, e a terra nunca voltou a dar os lucros de antes.\n\nFaltam dois turnos para o desafio Colheita Úmida. Lotes úmidos, qualidade a proteger e seis mil quilogramas para expedir. A pergunta é a mesma de 1879: o que fazer com uma safra que o tempo já danificou?',
  },
  'history-assize-of-bread': {
    title: 'A Assize of Bread and Ale',
    brief:
      'Uma lei inglesa do século XIII fixava o preço do pão e fazia seu peso subir ou cair conforme o preço do trigo.',
    article:
      '## Pesando o pão\n\nA Assize of Bread and Ale foi uma lei inglesa do século XIII que regulava o preço, o peso e a qualidade do pão e da cerveja vendidos nas cidades e aldeias. Ela costuma ser chamada de primeira lei inglesa a regular a produção e a venda de alimentos.\n\nSeu método era incomum. O preço do pão de um farthing permanecia igual, e o que mudava era o peso: quando o trigo encarecia, o pão ficava mais leve; quando o trigo estava barato, o cliente recebia mais pão pela moeda. Tribunais locais fiscalizavam a lei, multando padeiros e cervejeiros que entregassem menos que a medida devida. Acredita-se que padeiros receosos de vender um pão leve demais acrescentassem um pão à dúzia, provável origem da expressão inglesa "a baker’s dozen", a dúzia de padeiro.\n\nA lei durou séculos. Foi alterada pelos Bread Acts de 1822 e 1836 e finalmente revogada em 1863.\n\nFaltam dois turnos para o desafio Inspeção. Três fechamentos sem problemas seguidos: testes de CQ aprovados, nenhuma falha de qualidade e nada grave pendente. Os padeiros medievais respondiam ao tribunal local; você responde ao laboratório e ao registro.',
  },
  'history-sale-of-food-act': {
    title: 'Alúmen e o analista público',
    brief:
      'Padeiros vitorianos clareavam o pão com alúmen, e a Sale of Food and Drugs Act 1875 colocou analistas públicos na investigação.',
    article:
      '## Comprovar o que há no pão\n\nNa Grã-Bretanha vitoriana, a adulteração de alimentos era comum. Padeiros acrescentavam alúmen ao pão para deixá-lo mais branco. O alúmen em si não era um veneno, mas dificultava a digestão. O médico Arthur Hill Hassall, principal reformador da área, encontrou alúmen em boa parte do pão que examinou na década de 1850.\n\nAs leis anteriores contra a adulteração de alimentos haviam se mostrado fracas. A Sale of Food and Drugs Act 1875 as substituiu. Ela exigia que autoridades locais nomeassem analistas com conhecimento e habilidade para examinar alimentos e medicamentos vendidos em seus distritos e permitia que inspetores obtivessem amostras e as enviassem para análise. Vender alimentos misturados com ingredientes que os tornassem nocivos à saúde passou a ser uma infração.\n\nA lei de 1875 definiu o modelo da legislação alimentar britânica por décadas: um analista independente, uma amostra e um certificado no lugar da palavra do cliente.\n\nSeu desafio Inspeção terminou. O teste em que você acabou de passar, ou falhar, descende desse sistema.',
  },
  'history-chorleywood': {
    title: 'O processo Chorleywood',
    brief:
      'Em 1961, pesquisadores britânicos descobriram como produzir pão rapidamente com trigo de menor teor de proteína e mudaram o que os moleiros precisavam fornecer.',
    article:
      '## Misturar em vez de esperar\n\nO pão tradicional exige tempo. A massa descansa por horas para que a fermentação desenvolva o glúten que retém o gás. Em 1961, pesquisadores da British Baking Industries Research Association, em Chorleywood, encontraram um atalho: alguns minutos de mistura mecânica intensa em alta velocidade, com mais fermento, um pouco de gordura e um melhorador oxidante, hoje geralmente vitamina C.\n\nO processo de panificação Chorleywood reduziu drasticamente o tempo de produção e teve um segundo efeito importante para os moleiros. A fermentação longa reduz parte da força do glúten; o desenvolvimento mecânico reduz menos, permitindo aos padeiros fazer pão aceitável com trigo de menor teor de proteína. Na época, poucos trigos britânicos tinham força suficiente para um bom pão, e a alternativa eram grãos importados caros da América do Norte. Chorleywood permitiu aos moleiros incluir mais trigo nacional na mistura de moagem.\n\nO processo se espalhou depressa. Em 2009, cerca de oitenta por cento do pão produzido no Reino Unido o utilizava.\n\nFaltam dois turnos para a Corrida dos Padeiros: doze mil quilogramas em seis turnos. Padeiros industriais querem farinha consistente, entregue no prazo e em volume.',
  },
  'history-bread-rationing': {
    title: 'Pão racionado',
    brief:
      'O pão nunca foi racionado na Grã-Bretanha durante a Segunda Guerra Mundial, mas foi racionado de 1946 a 1948.',
    article:
      '## Racionamento em tempos de paz\n\nDurante toda a Segunda Guerra Mundial, o pão na Grã-Bretanha ficou fora do racionamento. O governo considerava que racioná-lo prejudicaria o moral e, em vez disso, estendeu os estoques: a farinha branca foi proibida, e a farinha passou a ser moída com taxa de extração de oitenta e cinco por cento, como National Flour, aproveitando mais de cada grão no pão.\n\nA paz piorou a situação. Com escassez mundial de trigo, necessidade de alimentos para a Europa ocupada e finanças britânicas pressionadas, o governo trabalhista de Clement Attlee introduziu o racionamento de pão em 21 de julho de 1946, cerca de um ano depois do fim da guerra. Pão e farinha permaneceram racionados por dois anos, até julho de 1948.\n\nO racionamento inverte a demanda de um moinho: a questão passa a ser como repartir com justiça uma quantidade insuficiente.\n\nA Corrida dos Padeiros terminou. Qualquer que tenha sido o resultado, pediram que você fornecesse mais. É o problema melhor de se ter.',
  },
  'history-three-day-week': {
    title: 'A semana de três dias',
    brief:
      'No início de 1974, a escassez de carvão limitou as empresas britânicas a três dias de eletricidade por semana.',
    article:
      '## Energia contada em dias\n\nNo inverno de 1973 para 1974, mobilizações de mineiros de carvão e ferroviários restringiram severamente o fornecimento de carvão às usinas elétricas britânicas. O governo conservador de Edward Heath respondeu racionando a eletricidade.\n\nA partir de 1º de janeiro de 1974, usuários comerciais ficaram limitados a três dias consecutivos específicos de eletricidade por semana, sem poder ampliar a jornada nesses dias. Serviços essenciais, como hospitais, foram isentos, e a televisão encerrava a transmissão no início da noite. Fábricas e moinhos precisavam planejar a produção conforme os dias em que podiam operar, reduzindo o volume e alongando cada pedido.\n\nAs restrições foram suspensas em 7 de março de 1974, depois que uma eleição geral mudou o governo.\n\nFaltam dois turnos para o Inverno da Rede: oito mil quilogramas para expedir, com custo de energia por quilograma de no máximo oito centésimos. Você não ficará limitado a três dias, mas cada quilowatt-hora agora tem um preço visível. Use as cargas pesadas quando elas compensarem seu custo.',
  },
  'history-tide-mills': {
    title: 'O moinho de maré',
    brief:
      'Moinhos de maré armazenavam água do mar em um reservatório na maré alta e a usavam para moer na vazante.',
    article:
      '## Energia em um reservatório\n\nUm moinho de maré funciona como uma bateria carregada pela Lua. Uma barragem com comporta fecha uma enseada sujeita às marés. Quando a maré sobe, a água enche o reservatório por uma comporta de sentido único, que se fecha quando a maré começa a baixar. Quando a maré externa está baixa o suficiente, o moleiro libera a água armazenada pela roda e mói até esvaziar o reservatório.\n\nOs horários eram definidos pelas marés, por isso a jornada do moleiro mudava com elas. Em troca, a energia era previsível com meses de antecedência, de uma forma que vento e chuva nunca foram.\n\nO Woodbridge Tide Mill, em Suffolk, mostra quanto a ideia durou. O primeiro registro de um moinho de maré no local data de 1170. Ele operou comercialmente até 1957, quando fechou como o último moinho de maré em operação comercial na Grã-Bretanha. Desde então, foi restaurado e aberto ao público, e seu reservatório original de sete acres hoje é uma marina.\n\nO Inverno da Rede terminou. A lição do moinho de maré permanece: energia que pode ser armazenada pode ser usada no momento de menor custo.',
  },
  'history-rochdale': {
    title: 'Os pioneiros de Rochdale',
    brief:
      'Em 1844, um grupo de trabalhadores de Rochdale abriu uma loja cooperativa cujas regras se tornaram modelo para cooperativas no mundo inteiro.',
    article:
      '## Toad Lane, 1844\n\nA Rochdale Society of Equitable Pioneers foi fundada em 1844 por trabalhadores da cidade industrial de Rochdale, em Lancashire, muitos deles tecelões. Em 21 de dezembro de 1844, abriram uma loja no número 31 de Toad Lane, com um pequeno estoque de manteiga, açúcar, farinha e aveia moída. A tradição conta vinte e oito fundadores, embora as atas da própria sociedade nunca apresentem esse número.\n\nOutras cooperativas já haviam surgido e fracassado. Os pioneiros ficaram conhecidos por produtos honestos, sem adulteração, e estiveram entre os primeiros a devolver sobras aos cooperados como dividendo proporcional ao que cada um havia comprado.\n\nAs regras que estabeleceram ficaram conhecidas como Princípios de Rochdale. A International Co-operative Alliance as adotou em 1937 e as revisou em 1966 e 1995, quando se tornaram os sete princípios cooperativistas usados hoje, começando pela adesão voluntária e aberta e incluindo um cooperado, um voto. A loja de Toad Lane hoje é o Rochdale Pioneers Museum.\n\nSeu moinho agora é cooperativo. Seu fundo se forma com contribuições reinvestidas, a mesma ideia em outro ofício.',
  },
  'history-mondragon': {
    title: 'Mondragon',
    brief:
      'A partir de uma única oficina fundada em 1956, a cidade basca de Mondragón desenvolveu uma federação de cooperativas de trabalhadores.',
    article:
      '## Uma federação de cooperativas\n\nEm 14 de abril de 1956, na cidade basca de Mondragón, o padre José María Arizmendiarrieta abençoou a pedra fundamental de uma pequena empresa industrial chamada Ulgor. Seu nome foi formado pelos sobrenomes dos cinco fundadores, jovens engenheiros e técnicos que haviam estudado na escola técnica criada por ele. Seu primeiro estatuto como cooperativa foi aprovado em 1959.\n\nNaquele mesmo ano, Arizmendiarrieta ajudou a fundar um banco cooperativo, Caja Laboral Popular. Com sua própria fonte de crédito, o movimento podia criar e apoiar novas cooperativas sem esperar por investidores externos. Oficinas, uma escola e o banco cresceram e formaram uma família de cooperativas que hoje constitui a Mondragon Corporation, uma federação de cooperativas de trabalhadores e um dos maiores grupos empresariais da Espanha.\n\nA federação permitiu que cada cooperativa mantivesse sua autonomia de governo enquanto compartilhava financiamento, pesquisa e formação com as demais.\n\nSeu moinho agora é uma cooperativa federada. Como Mondragon, mantém suas próprias decisões e compartilha uma força maior.',
  },
  'history-mill-electrification': {
    title: 'Dos eixos aos fios',
    brief:
      'Antes, os moinhos acionavam todas as máquinas a partir de um motor, por eixos e correias; a eletricidade mudou isso no início do século XX.',
    article:
      '## O eixo de transmissão\n\nDurante boa parte da era industrial, um moinho tinha uma única fonte de energia: uma roda de água, uma turbina ou um motor a vapor. Ela girava um eixo de transmissão, uma longa barra rotativa suspensa no teto, e correias de couro ou algodão ligavam as polias do eixo a cada máquina. Se o motor parasse, o moinho inteiro parava. A disposição seguia o eixo, o sistema era barulhento e perigoso, e seus mancais precisavam de lubrificação constante.\n\nEntre aproximadamente 1880 e 1930, as fábricas passaram da transmissão por eixos e correias aos motores elétricos. No início, um único motor grande muitas vezes apenas substituía a fonte anterior e continuava girando os velhos eixos. Depois, motores separados passaram a acionar grupos de máquinas e, por fim, máquinas individuais, de modo que cada uma pudesse partir, parar e ser reparada por conta própria.\n\nO acionamento elétrico tornou os moinhos mais limpos e flexíveis e os vinculou à rede elétrica. Uma oscilação no fornecimento agora atingia todas as máquinas ao mesmo tempo.\n\nA tensão está caindo. Os motores desaceleram, os bancos de rolos perdem velocidade e a produção cai até a tensão se recuperar. Uma queda de tensão é o antigo ponto único de falha do eixo de transmissão, transferido para fora do edifício.',
  },
  'history-scada': {
    title: 'Controle supervisório',
    brief:
      'Sistemas SCADA permitiam supervisionar instalações distantes a partir de uma sala; controladores locais faziam o controle direto.',
    article:
      '## Por que "supervisório"\n\nSCADA significa supervisory control and data acquisition, ou controle supervisório e aquisição de dados. Sistemas desse tipo surgiram em redes elétricas, dutos e instalações de abastecimento de água, onde equipamentos se espalhavam por quilômetros e alguém precisava acompanhá-los de um único lugar.\n\nAs primeiras conexões eram lentas e pouco confiáveis. Em sistemas de água e esgoto das décadas de 1960 e 1970, a ligação entre a sala de controle e uma estação remota era considerada frágil demais para controlar de fato o processo a partir do centro. Por isso, o controle permaneceu local, em unidades terminais remotas e depois em controladores lógicos programáveis, enquanto a sala central supervisionava: reunia leituras, exibia os dados, muitas vezes em um grande painel sinóptico, e enviava comandos ocasionais. Essa divisão permanece. Os controladores locais mantêm o processo seguro por conta própria; a camada supervisória enxerga o conjunto e decide.\n\nA rede de controle está degradada. Sua visão SCADA pode estar desatualizada ou incompleta, mas os controles locais das máquinas continuam funcionando. Confie nas leituras de campo, trate a tela com cautela e restabeleça a conexão antes de fazer grandes mudanças.',
  },
  'history-flour-sacks': {
    title: 'Vestidos de sacos de farinha',
    brief:
      'Nos anos 1930, moleiros americanos estampavam seus sacos de algodão, sabendo que as famílias os transformariam em roupas.',
    article:
      '## O saco como tecido\n\nFarinha, ração e açúcar já foram vendidos em sacos de algodão. Nas fazendas americanas dos anos 1920 e durante a Grande Depressão, famílias reaproveitavam o tecido em vestidos, camisas, aventais, cortinas e brinquedos. Os fabricantes perceberam e incentivaram a prática: estamparam os sacos com cores e desenhos que as mulheres quisessem costurar, de modo que uma cliente pudesse escolher a farinha por causa do tecido.\n\nNa década de 1930, as empresas tratavam os sacos como parte de sua divulgação. Em 1933, a Textile Bag Manufacturers Association publicou o livreto Sewing with Cotton Bags e, no fim daquela década, a maioria das empresas usava tinta solúvel em água ou etiquetas de papel para que o nome da marca saísse na lavagem. O National Museum of American History guarda um vestido de saco de ração feito para um Cotton Bag Sewing Contest de 1959.\n\nDepois da Segunda Guerra Mundial, sacos de papel mais baratos substituíram os de tecido, e a maior parte da produção de sacos de tecido para ração havia terminado no início da década de 1960.\n\nHá falta de embalagens. Quando faltam sacos, o ensaque para, por mais farinha que esteja pronta. A embalagem faz parte do produto.',
  },
  'history-ergot': {
    title: 'Ergot e o fogo de Santo Antão',
    brief:
      'Um fungo no centeio causou epidemias medievais de fogo de Santo Antão, e a limpeza dos grãos continua sendo a defesa.',
    article:
      '## O veneno na espiga\n\nO ergot é um fungo, Claviceps purpurea, que infecta o centeio e outros cereais. No lugar de alguns grãos, ele produz estruturas duras, de roxo-escuro a preto, que contêm alcaloides tóxicos quando ingeridos. A exposição prolongada causa ergotismo. Em uma forma, provoca convulsões; na outra, interrompe o suprimento de sangue aos membros, que entram em gangrena.\n\nNa Europa medieval, onde os pobres comiam muito pão de centeio, o ergotismo ocorria em epidemias. A forma gangrenosa era chamada de fogo sagrado ou fogo de Santo Antão, nome geralmente associado aos monges da Ordem de Santo Antão, que se dedicavam a tratar os doentes. Sua causa permaneceu desconhecida por séculos.\n\nA defesa são grãos limpos. Como muitas estruturas do ergot têm tamanho e formato semelhantes aos de um grão, parte delas escapa às peneiras; mesas densimétricas e selecionadoras por cor funcionam melhor. Mesmo assim, lotes muito infectados devem ficar fora do moinho.\n\nUm lote de fornecedor está contaminado. Retenha-o, rastreie por onde passou e impeça que chegue aos rolos.',
  },
  'history-corn-laws': {
    title: 'As Corn Laws',
    brief:
      'De 1815 a 1846, a lei britânica barrava grãos estrangeiros para sustentar os preços, até Robert Peel revogá-la.',
    article:
      '## Proteger o preço do pão\n\nNo inglês britânico, corn significa todos os cereais. Depois das Guerras Napoleônicas, o Parlamento aprovou a Importation Act 1815, que barrava cereais estrangeiros até o preço do trigo nacional alcançar oitenta xelins por quarter. Os proprietários de terras mantinham seus preços altos; famílias trabalhadoras pagavam mais pelo pão.\n\nA lei foi abrandada com uma escala móvel de tarifas em 1828, mas a oposição cresceu. A Anti-Corn Law League, fundada em 1838 e liderada por figuras como Richard Cobden e John Bright, fez campanha pelo livre comércio de grãos em todo o país. Quando uma doença arruinou a safra de batatas da Irlanda em 1845 e a fome se seguiu, a necessidade de alimentos importados baratos tornou-se urgente.\n\nEm 1846, o primeiro-ministro conservador Sir Robert Peel conseguiu aprovar a revogação no Parlamento com apoio dos Whigs, contra a maioria de seu próprio partido, que se dividiu. A Grã-Bretanha avançou em direção ao livre comércio e, nas décadas seguintes, grãos importados baratos se tornaram a norma.\n\nEste é um ano agrícola abundante. A fartura é bem-vinda, mas reduz o preço dos grãos para todos ao mesmo tempo. Os preços, como as colheitas, se formam em muitos lugares além dos seus campos.',
  },
  'history-long-view': {
    title: 'Olhando a longo prazo',
    brief:
      'Da mó de vaivém ao moinho cooperativo federado: o que mudou na moagem e o que permanece.',
    article:
      '## O que muda e o que permanece\n\nA história começou no chão de uma casa no vale do Nilo, com uma mó de vaivém e uma mão de mó. Desde então, quase tudo na moagem mudou. Rodas de água assumiram o trabalho dos braços, como descreveu Vitruvius; os responsáveis por Domesday contaram milhares de moinhos; Oliver Evans pôs os grãos em movimento pelo moinho sem transporte manual; os rolos de Budapest substituíram as mós; o vapor e depois a eletricidade substituíram o rio. A propriedade também mudou, dos moinhos avaliados como renda de um senhor em Domesday às cooperativas de Rochdale e Mondragon, pertencentes às pessoas que atendem.\n\nAlgumas coisas continuam iguais. Os grãos precisam ser mantidos secos e limpos. Poeira sempre é combustível. Um pão precisa ter o peso que declara e conter apenas o que deve. E um moinho depende da confiança de quem compra dele.\n\nSua crônica está completa. O moinho continua funcionando, e o registro que você manteve agora faz parte de sua história. O que você escolheu preservar importou tanto quanto o que mudou.',
  },
};

/** English stays in history.ts; every call reads copy for the active locale. */
export function historyMessages(row: HistoryNote) {
  const en = { title: row.title, brief: row.brief, article: row.article };
  return defineMessages({ en, 'pt-BR': portuguese[row.id] ?? en });
}
