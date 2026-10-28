import { defineMessages } from '../i18n';
import type { QuizQuestion } from './types';

type QuizCopy = {
  prompt: string;
  option0: string;
  option1: string;
  option2: string;
  option3: string;
};

const portuguese: Record<string, QuizCopy> = {
  'q-first-grain-1': {
    prompt:
      'Quais dois cereais os agricultores do vale do Nilo cultivavam para fazer pão e cerveja antes de o Egito ter reis?',
    option0: 'Centeio e aveia',
    option1: 'Emmer e cevada',
    option2: 'Espelta e painço',
    option3: 'Milho e arroz',
  },
  'q-first-grain-2': {
    prompt: 'Como os grãos eram moídos em uma mó de vaivém?',
    option0: 'Entre duas pedras redondas giradas por um burro',
    option1: 'Por uma roda de água sob o piso',
    option2: 'Em um pilão alto de madeira',
    option3: 'Esfregando uma pedra de mão para a frente e para trás sobre uma pedra inferior plana',
  },
  'q-grinding-statues-1': {
    prompt: 'De que material é feita a figura Servant Grinding Grain, do Metropolitan Museum?',
    option0: 'Calcário pintado',
    option1: 'Madeira de cedro',
    option2: 'Bronze',
    option3: 'Faiança vidrada',
  },
  'q-grinding-statues-2': {
    prompt: 'Por que figuras de servos eram colocadas nas tumbas do Reino Antigo?',
    option0: 'Para proteger a tumba de ladrões',
    option1: 'Para registrar os nomes dos construtores da tumba',
    option2: 'Para cuidar da produção de alimentos para os mortos na outra vida',
    option3: 'Para marcar os limites da propriedade do dono',
  },
  'q-old-kingdom-bakeries-1': {
    prompt: 'O que significa o nome árabe Heit el-Ghurab?',
    option0: 'Cidade do Pão',
    option1: 'Casa do Moleiro',
    option2: 'Muro do Corvo',
    option3: 'Portão da Esfinge',
  },
  'q-old-kingdom-bakeries-2': {
    prompt: 'No assentamento dos trabalhadores de Giza, o que eram bedja?',
    option0: 'Formas cônicas de cerâmica para assar pão',
    option1: 'Supervisores dos trabalhadores das padarias',
    option2: 'Mós de pedra para moer emmer',
    option3: 'Cestos de junco para transportar grãos',
  },
  'q-nilometer-1': {
    prompt: 'Além de prever a colheita, o que a altura da cheia do Nilo ajudava a definir?',
    option0: 'A data do ano-novo',
    option1: 'O imposto devido pelos agricultores',
    option2: 'O preço do papiro',
    option3: 'O tamanho do exército',
  },
  'q-nilometer-2': {
    prompt: 'Por que o nilômetro da ilha de Elephantine era especialmente importante?',
    option0: 'Era o único nilômetro construído em pedra',
    option1: 'Ficava ao lado do palácio real',
    option2: 'Media as marés do Mediterrâneo',
    option3:
      'Elephantine marcava a fronteira sul, permitindo medir ali primeiro a subida das águas',
  },
  'q-nomarchs-1': {
    prompt: 'No Egito antigo, o que era um nomo?',
    option0: 'Um cobrador de impostos do rei',
    option1: 'Uma província',
    option2: 'Uma unidade de medida de grãos',
    option3: 'Um celeiro de templo',
  },
  'q-nomarchs-2': {
    prompt: 'O que aconteceu com os governos provinciais perto do fim do Reino Antigo?',
    option0: 'Foram abolidos por Pepi II',
    option1: 'Foram entregues a mercenários estrangeiros',
    option2: 'Tornaram-se hereditários',
    option3: 'Passaram a ser vendidos em leilão todos os anos',
  },
  'q-domesday-mills-1': {
    prompt: 'Em que ano o levantamento Domesday foi concluído?',
    option0: '1086',
    option1: '1066',
    option2: '1166',
    option3: '1215',
  },
  'q-domesday-mills-2': {
    prompt: 'O que movia quase todos os moinhos registrados no Domesday Book?',
    option0: 'Vento',
    option1: 'Vapor',
    option2: 'Água',
    option3: 'Rodas movidas por pessoas caminhando',
  },
  'q-watermills-1': {
    prompt:
      'Quantas rodas de água moviam o complexo romano de moinhos de Barbegal, perto de Arles?',
    option0: 'Quatro',
    option1: 'Oito',
    option2: 'Doze',
    option3: 'Dezesseis',
  },
  'q-watermills-2': {
    prompt: 'No moinho de água de Vitruvius, como a energia da roda chegava à mó?',
    option0: 'Por uma correia de couro e uma polia',
    option1: 'Por uma roda dentada em forma de tambor engrenada com uma roda horizontal maior',
    option2: 'Por uma corrente de canecas',
    option3: 'A mó era fixada diretamente à roda',
  },
  'q-windmills-1': {
    prompt: 'Sobre o que um moinho de poste equilibra todo o seu corpo?',
    option0: 'Uma torre de pedra',
    option1: 'Uma plataforma flutuante',
    option2: 'Um único grande poste vertical',
    option3: 'Quatro rodas de ferro sobre trilhos',
  },
  'q-windmills-2': {
    prompt: 'Como o moleiro virava um moinho de poste para enfrentar o vento?',
    option0: 'Empurrando uma longa haste traseira',
    option1: 'Com uma junta de bois',
    option2: 'Com um pequeno motor a vapor',
    option3: 'Ele nunca se movia; só as velas giravam',
  },
  'q-millwrights-1': {
    prompt: 'Qual canal, aberto em 1761, deu fama a James Brindley?',
    option0: 'Grand Union Canal',
    option1: 'Bridgewater Canal',
    option2: 'Caledonian Canal',
    option3: 'Kennet and Avon Canal',
  },
  'q-millwrights-2': {
    prompt:
      'Que título John Smeaton adotou para distinguir consultores civis de engenheiros militares?',
    option0: 'Mestre construtor de moinhos',
    option1: 'Filósofo mecânico',
    option2: 'Agrimensor-geral',
    option3: 'Engenheiro civil',
  },
  'q-oliver-evans-1': {
    prompt: 'O que fazia o hopper boy de Oliver Evans?',
    option0: 'Pesava sacos na porta do moinho',
    option1: 'Espalhava o produto quente da moagem para esfriar e secar antes da peneiração',
    option2: 'Retirava grãos de barcaças fluviais',
    option3: 'Refazia as ranhuras das mós',
  },
  'q-oliver-evans-2': {
    prompt: 'Qual era o título do livro de Oliver Evans publicado em 1795?',
    option0: 'The Complete Miller',
    option1: 'The Art of Grinding',
    option2: 'The Young Mill-Wright and Miller’s Guide',
    option3: 'Principles of Mechanism',
  },
  'q-albion-mills-1': {
    prompt: 'O que acionava as mós dos Albion Mills, em Londres?',
    option0: 'Motores a vapor de Boulton e Watt',
    option1: 'Uma roda de maré no Tâmisa',
    option2: 'Velas de moinho de vento no telhado',
    option3: 'Cavalos caminhando em uma roda motriz',
  },
  'q-albion-mills-2': {
    prompt: 'Em que ano um incêndio destruiu o interior dos Albion Mills?',
    option0: '1786',
    option1: '1791',
    option2: '1809',
    option3: '1815',
  },
  'q-roller-milling-1': {
    prompt: 'Em qual cidade a moagem gradual húngara e os rolos de Ganz ganharam fama?',
    option0: 'Vienna',
    option1: 'Budapest',
    option2: 'Prague',
    option3: 'Minneapolis',
  },
  'q-roller-milling-2': {
    prompt: 'De que material a fábrica Ganz fez seus rolos, no lugar da porcelana de Wegmann?',
    option0: 'Granito',
    option1: 'Madeira dura',
    option2: 'Ferro fundido coquilhado',
    option3: 'Vidro',
  },
  'q-plansifter-1': {
    prompt: 'Qual moleiro de Budapest patenteou o plansifter?',
    option0: 'Carl Haggenmacher',
    option1: 'András Mechwart',
    option2: 'Friedrich Wegmann',
    option3: 'Oliver Evans',
  },
  'q-plansifter-2': {
    prompt: 'Como um plansifter movimenta sua pilha de peneiras planas?',
    option0: 'Gira as peneiras como um tambor',
    option1: 'Sacode as peneiras verticalmente',
    option2: 'Inclina as peneiras em uma rampa',
    option3: 'Move as peneiras em um plano horizontal',
  },
  'q-washburn-a-1': {
    prompt: 'O que explodiu dentro do Washburn A Mill em 2 de maio de 1878?',
    option0: 'Uma caldeira a vapor',
    option1: 'A iluminação a gás',
    option2: 'Pólvora armazenada',
    option3: 'Poeira de farinha',
  },
  'q-washburn-a-2': {
    prompt: 'Quais dispositivos se espalharam por outros moinhos depois do desastre do Washburn A?',
    option0: 'Sistemas de sprinklers',
    option1: 'Para-raios',
    option2: 'Coletores de pó',
    option3: 'Escadas de emergência',
  },
  'q-grain-elevator-1': {
    prompt: 'Em qual cidade Joseph Dart e Robert Dunbar construíram seu elevador de grãos a vapor?',
    option0: 'Chicago',
    option1: 'Buffalo',
    option2: 'Montreal',
    option3: 'New York City',
  },
  'q-grain-elevator-2': {
    prompt: 'O que era a perna marítima do elevador?',
    option0: 'Um transportador de canecas baixado ao porão do navio para retirar grãos a granel',
    option1: 'Um píer para rolar barris até a terra',
    option2: 'Um guindaste para içar sacos',
    option3: 'Uma barcaça de armazenamento flutuante',
  },
  'q-falling-number-1': {
    prompt: 'Para o que um número de queda baixo alerta?',
    option0: 'Proteína insuficiente',
    option1: 'Danos por insetos',
    option2: 'Excesso de farelo',
    option3: 'Danos por germinação',
  },
  'q-falling-number-2': {
    prompt:
      'Qual enzima que decompõe o amido é produzida em grande quantidade por grãos em germinação?',
    option0: 'Alfa-amilase',
    option1: 'Lipase',
    option2: 'Catalase',
    option3: 'Pepsina',
  },
  'q-grain-moisture-1': {
    prompt: 'O que o condicionamento faz com o trigo antes da moagem?',
    option0: 'Seca os grãos para impedir o mofo',
    option1: 'Torna o farelo mais resistente e o endosperma mais macio',
    option2: 'Clareia a farinha',
    option3: 'Mata gorgulhos com calor',
  },
  'q-grain-moisture-2': {
    prompt: 'Quais são os riscos de armazenar trigo úmido demais?',
    option0: 'Enferrujar o silo',
    option1: 'Congelar por completo',
    option2: 'Aquecimento, mofo e ácaros',
    option3: 'Perder a cor com a luz do sol',
  },
  'q-grain-drying-1': {
    prompt: 'Por que a colheitadeira combinada tornou necessária a secagem mecânica dos grãos?',
    option0: 'Ela molha os grãos ao cortar',
    option1: 'Ela corta e debulha em uma passagem, sem deixar tempo para os grãos secarem no campo',
    option2: 'Ela só consegue trabalhar na chuva',
    option3: 'Ela colhe grãos verdes de propósito',
  },
  'q-grain-drying-2': {
    prompt: 'Antes das colheitadeiras combinadas, o que eram as medas de secagem no campo?',
    option0: 'Depósitos de grãos em uma fazenda',
    option1: 'Pisos de madeira para debulha',
    option2: 'Fornos de secagem a carvão',
    option3: 'Feixes agrupados de pé para secar no campo',
  },
  'q-wet-harvest-1879-1': {
    prompt:
      'Por que os preços dos grãos continuaram baixos apesar da colheita britânica arruinada de 1879?',
    option0: 'O governo os fixou por lei',
    option1: 'Trigo americano barato, transportado por navios a vapor, cobriu a falta',
    option2: 'As pessoas pararam de comer pão',
    option3: 'Grãos armazenados de anos anteriores foram liberados',
  },
  'q-wet-harvest-1879-2': {
    prompt: 'Em que período costuma ser situada a grande depressão da agricultura britânica?',
    option0: 'De 1815 a 1846',
    option1: 'De 1846 a 1860',
    option2: 'De 1873 a 1896',
    option3: 'De 1914 a 1918',
  },
  'q-assize-of-bread-1': {
    prompt:
      'Pela Assize of Bread and Ale, o que acontecia com o pão de um farthing quando o trigo encarecia?',
    option0: 'Seu preço subia',
    option1: 'Ele ficava mais leve',
    option2: 'Ele precisava ser feito com cevada',
    option3: 'Sua venda era proibida',
  },
  'q-assize-of-bread-2': {
    prompt:
      'Qual expressão provavelmente surgiu de padeiros que se precaviam contra a venda de pães leves demais?',
    option0: 'A camada privilegiada (upper crust)',
    option1: 'O ganha-pão (bread and butter)',
    option2: 'Quem sustenta a família (breadwinner)',
    option3: 'A dúzia de padeiro (a baker’s dozen)',
  },
  'q-sale-of-food-act-1': {
    prompt: 'Por que padeiros vitorianos acrescentavam alúmen ao pão?',
    option0: 'Para fazê-lo crescer mais rápido',
    option1: 'Para deixá-lo mais branco',
    option2: 'Para impedir que ficasse velho',
    option3: 'Para adoçá-lo',
  },
  'q-sale-of-food-act-2': {
    prompt:
      'Pela Sale of Food and Drugs Act 1875, quem examinava as amostras obtidas pelos inspetores?',
    option0: 'Analistas nomeados pelas autoridades locais',
    option1: 'Magistrados locais',
    option2: 'Membros do Parlamento',
    option3: 'A corporação de ofício dos padeiros',
  },
  'q-chorleywood-1': {
    prompt: 'O que substituiu horas de fermentação no processo de panificação Chorleywood?',
    option0: 'Congelar a massa durante a noite',
    option1: 'Assar a uma temperatura muito mais alta',
    option2: 'Alguns minutos de mistura mecânica intensa em alta velocidade',
    option3: 'Um fermento natural',
  },
  'q-chorleywood-2': {
    prompt: 'O processo Chorleywood permitiu aos moleiros usar mais de qual trigo?',
    option0: 'Trigo britânico de menor teor de proteína, cultivado no próprio país',
    option1: 'Trigo duro da Itália',
    option2: 'Trigo emmer',
    option3: 'Somente trigo duro canadense importado',
  },
  'q-bread-rationing-1': {
    prompt: 'O pão foi racionado na Grã-Bretanha durante a Segunda Guerra Mundial?',
    option0: 'Sim, a partir de 1940',
    option1: 'Somente em Londres',
    option2: 'Somente para crianças',
    option3: 'Não; ele só foi racionado depois da guerra',
  },
  'q-bread-rationing-2': {
    prompt: 'Em que ano começou o racionamento de pão na Grã-Bretanha?',
    option0: '1939',
    option1: '1940',
    option2: '1946',
    option3: '1948',
  },
  'q-three-day-week-1': {
    prompt:
      'A partir de 1º de janeiro de 1974, usuários comerciais ficaram limitados a quantos dias consecutivos de eletricidade por semana?',
    option0: 'Dois',
    option1: 'Três',
    option2: 'Quatro',
    option3: 'Cinco',
  },
  'q-three-day-week-2': {
    prompt:
      'O que restringiu o fornecimento de carvão às usinas elétricas britânicas em 1973 e 1974?',
    option0: 'Uma proibição de importar carvão',
    option1: 'Inundações nas bacias carboníferas',
    option2: 'Um incêndio em um centro de controle da rede nacional',
    option3: 'Mobilizações de mineiros de carvão e ferroviários',
  },
  'q-tide-mills-1': {
    prompt: 'Quando um moinho de maré faz a moagem?',
    option0: 'Quando a maré sobe',
    option1: 'Somente na maré alta',
    option2:
      'Quando a maré externa está baixa o suficiente para liberar a água armazenada pela roda',
    option3: 'Somente durante tempestades',
  },
  'q-tide-mills-2': {
    prompt: 'O que aconteceu com o Woodbridge Tide Mill em 1957?',
    option0: 'Foi construído pela primeira vez',
    option1: 'Fechou como o último moinho de maré em operação comercial na Grã-Bretanha',
    option2: 'Foi destruído por um incêndio',
    option3: 'Foi convertido para funcionar a vapor',
  },
  'q-rochdale-1': {
    prompt: 'Em qual rua de Rochdale os pioneiros abriram sua loja em dezembro de 1844?',
    option0: 'Toad Lane',
    option1: 'Market Street',
    option2: 'Mill Row',
    option3: 'Church Street',
  },
  'q-rochdale-2': {
    prompt: 'Como os pioneiros de Rochdale devolviam as sobras aos cooperados?',
    option0: 'Em partes iguais para cada cooperado',
    option1: 'Somente aos fundadores',
    option2: 'Como dividendo proporcional ao que cada cooperado havia comprado',
    option3: 'Reduzindo o preço das cotas',
  },
  'q-mondragon-1': {
    prompt: 'Qual era o nome da empresa cuja pedra fundamental foi abençoada em Mondragón em 1956?',
    option0: 'Eroski',
    option1: 'Ulgor',
    option2: 'Orona',
    option3: 'Irizar',
  },
  'q-mondragon-2': {
    prompt: 'O que José María Arizmendiarrieta ajudou a fundar em 1959?',
    option0: 'Uma universidade em Madrid',
    option1: 'Um jornal nacional',
    option2: 'Uma federação sindical',
    option3: 'Um banco cooperativo, Caja Laboral Popular',
  },
  'q-mill-electrification-1': {
    prompt: 'O que fazia um eixo de transmissão em um moinho?',
    option0: 'Transportava grãos entre os andares',
    option1: 'Levava energia de um motor a todas as máquinas por correias e polias',
    option2: 'Drenava água do poço da roda',
    option3: 'Sustentava o telhado do moinho',
  },
  'q-mill-electrification-2': {
    prompt: 'No início da eletrificação, o que um único motor elétrico grande muitas vezes fazia?',
    option0: 'Iluminava o moinho à noite',
    option1: 'Acionava somente as peneiras',
    option2: 'Carregava baterias de armazenamento',
    option3: 'Substituía o motor anterior e continuava girando os antigos eixos de transmissão',
  },
  'q-scada-1': {
    prompt: 'O que significa a sigla SCADA?',
    option0:
      'Controle supervisório e aquisição de dados (supervisory control and data acquisition)',
    option1: 'Controle de sistema e análise de dados (system control and data analysis)',
    option2: 'Controle de segurança e alarme de poeira (safety control and dust alarm)',
    option3:
      'Expedição automatizada por computador supervisionado (supervised computer automated dispatch)',
  },
  'q-scada-2': {
    prompt: 'Nos primeiros sistemas SCADA, onde permanecia o controle direto do processo?',
    option0: 'Na sala de controle central',
    option1: 'Nos dispositivos locais, como unidades terminais remotas',
    option2: 'Com o fornecedor de eletricidade',
    option3: 'Com um único gerente da instalação',
  },
  'q-flour-sacks-1': {
    prompt: 'Por que fabricantes americanos estampavam sacos de algodão com desenhos coloridos?',
    option0: 'Para mostrar a classificação da farinha',
    option1: 'Para cumprir uma regra governamental de rotulagem',
    option2: 'Para esconder manchas de farinha',
    option3: 'Para que as famílias quisessem transformá-los em roupas e escolhessem aquele produto',
  },
  'q-flour-sacks-2': {
    prompt: 'O que substituiu os sacos de tecido depois da Segunda Guerra Mundial?',
    option0: 'Potes de plástico',
    option1: 'Barris de madeira',
    option2: 'Sacos de papel',
    option3: 'Latas',
  },
  'q-ergot-1': {
    prompt:
      'O consumo de qual cereal está mais associado às epidemias de ergotismo na Europa medieval?',
    option0: 'Arroz',
    option1: 'Centeio',
    option2: 'Milho',
    option3: 'Painço',
  },
  'q-ergot-2': {
    prompt: 'Como era chamada a forma gangrenosa do ergotismo na Idade Média?',
    option0: 'Fogo de Santo Antão',
    option1: 'Fogo de Santelmo',
    option2: 'Doença do suor',
    option3: 'Mal do rei',
  },
  'q-corn-laws-1': {
    prompt:
      'Pela Importation Act 1815, os cereais estrangeiros eram barrados até o trigo nacional atingir qual preço?',
    option0: 'Quarenta xelins por quarter',
    option1: 'Sessenta xelins por quarter',
    option2: 'Oitenta xelins por quarter',
    option3: 'Cem xelins por quarter',
  },
  'q-corn-laws-2': {
    prompt: 'Qual primeiro-ministro conseguiu aprovar a revogação das Corn Laws em 1846?',
    option0: 'William Pitt',
    option1: 'Benjamin Disraeli',
    option2: 'William Gladstone',
    option3: 'Sir Robert Peel',
  },
  'q-long-view-1': {
    prompt: 'No ensaio final, qual ferramenta inicia a história da moagem?',
    option0: 'A mó de vaivém',
    option1: 'O moinho de poste',
    option2: 'O moinho de rolos',
    option3: 'A roda de água',
  },
  'q-long-view-2': {
    prompt: 'Qual destas afirmações o ensaio final diz que continua válida?',
    option0: 'Os moinhos pertencem a senhores',
    option1: 'Os grãos precisam ser mantidos secos e limpos',
    option2: 'As mós são a melhor forma de moer',
    option3: 'Os rios são a única fonte de energia',
  },
};

/** English stays in quiz.ts; every call reads copy for the active locale. */
export function quizMessages(row: QuizQuestion) {
  const en = {
    prompt: row.prompt,
    option0: row.options[0],
    option1: row.options[1],
    option2: row.options[2],
    option3: row.options[3],
  };
  return defineMessages({ en, 'pt-BR': portuguese[row.id] ?? en });
}
