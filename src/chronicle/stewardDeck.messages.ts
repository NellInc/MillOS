import { defineMessages } from '../i18n';

export const stewardDeckMessages = defineMessages({
  en: {
    'evt-standby-cover.title': 'Where the standby cover goes',
    'evt-standby-cover.text':
      'The district has one standby service firm, and its contract lets the mill name where its fitters wait during a breakdown: the intake and grain stores, the roller floor or the dispatch yard. Spread across all three, the fitters wait nowhere for long. The AI partner would put them on the roller floor.',
    'evt-standby-cover.choices.intake.label': 'Cover the intake and grain stores',
    'evt-standby-cover.choices.intake.effect.result':
      'The fitters base themselves at the intake, where the growers’ lorries tip.',
    'evt-standby-cover.choices.floor.label': 'Cover the roller floor',
    'evt-standby-cover.choices.floor.effect.result':
      'The fitters base themselves on the roller floor beside the switch room.',
    'evt-standby-cover.choices.yard.label': 'Cover the dispatch yard',
    'evt-standby-cover.choices.yard.effect.result':
      'The fitters base themselves in the dispatch yard, where the haulier loads.',
    'evt-standby-cover.choices.thin.label': 'Spread the cover across the site',
    'evt-standby-cover.choices.thin.effect.result':
      'The fitters move between all three areas and wait nowhere for long.',
    'evt-standby-cover.choices.partner.label': 'Leave it to the AI partner',
    'evt-standby-cover.choices.partner.effect.result':
      'The AI partner puts the standby cover on the roller floor.',
    'evt-court-short-weight.title': 'The short-weighted lots',
    'evt-court-short-weight.text':
      'The contract committee sits as arbitrator on the supply contracts this week, one case a shift. First: a hill farm delivered three lots short of their ticketed weight. Hail flattened the farm’s wheat in June and its account is behind. The contract allows termination and a claim for the shortfall.',
    'evt-court-short-weight.choices.terminate.label':
      'Terminate the contract and claim the shortfall',
    'evt-court-short-weight.choices.terminate.effect.result':
      'The contract is ended and the shortfall claimed. The hill farms take note.',
    'evt-court-short-weight.choices.dock.label': 'Dock the shortfall from the payment',
    'evt-court-short-weight.choices.dock.effect.result':
      'The shortfall comes off the next payment and the contract stands.',
    'evt-court-short-weight.choices.advance.label': 'Advance next year’s contract instead',
    'evt-court-short-weight.choices.advance.effect.result':
      'The farm gets next year’s contract early, against its seed bill.',
    'evt-court-short-weight.choices.partner.label': 'Hand the day to the AI partner',
    'evt-court-short-weight.choices.partner.effect.result':
      'The AI partner applies the contract as written and rules the remaining cases.',
    'evt-court-haulier.title': 'The abandoned run',
    'evt-court-haulier.text':
      'Next at arbitration: Valley Haulage abandoned an afternoon run halfway: its own depot was flooding and the lorries were needed to move stock to high ground. The contract treats an abandoned run as a breach. The haulier asks to keep the contract.',
    'evt-court-haulier.choices.terminate.label': 'Terminate the haulage contract',
    'evt-court-haulier.choices.terminate.effect.result':
      'The contract is ended. The haulier finishes the week and takes its lorries away.',
    'evt-court-haulier.choices.suspend.label': 'Put Valley Haulage on a crop year’s notice',
    'evt-court-haulier.choices.suspend.effect.result':
      'Valley Haulage keeps the contract on a crop year’s notice. The county sees the notice as fair.',
    'evt-court-haulier.choices.shelter.label':
      'Let Valley Haulage work from the mill yard while its depot dries',
    'evt-court-haulier.choices.shelter.effect.result':
      'Valley Haulage parks in the mill yard until its depot is dry.',
    'evt-court-haulier.choices.partner.label': 'Hand the rest of the day to the AI partner',
    'evt-court-haulier.choices.partner.effect.result':
      'The AI partner ends the haulage contract and rules the remaining cases.',
    'evt-court-granary.title': 'The old granary',
    'evt-court-granary.text':
      'Next at arbitration: the old granary across the lane is claimed twice. The previous manager promised it to Community Pasta Works for semolina storage; the village committee has used it for three years to keep its community bakery’s flour and wants that confirmed. The deeds are the mill’s.',
    'evt-court-granary.choices.pasta.label': 'Honour the promise to the pasta works',
    'evt-court-granary.choices.pasta.effect.result':
      'The pasta works takes the granary; the village bakery moves its flour out.',
    'evt-court-granary.choices.village.label': 'Confirm the village bakery',
    'evt-court-granary.choices.village.effect.result':
      'The village bakery keeps the granary. The pasta works is not pleased.',
    'evt-court-granary.choices.compensate.label':
      'Confirm the village and promise the pasta works compensation',
    'evt-court-granary.choices.compensate.effect.result':
      'The village keeps the granary and the pasta works accepts a promise of storage later.',
    'evt-court-granary.choices.keep.label': 'Keep the granary for the mill',
    'evt-court-granary.choices.keep.effect.result':
      'The mill lets the granary to a seed merchant and banks the rent.',
    'evt-court-granary.choices.partner.label': 'Hand the rest of the day to the AI partner',
    'evt-court-granary.choices.partner.effect.result':
      'The AI partner honours the old promise and rules the last case.',
    'evt-court-sacks.title': 'The short-counted bales',
    'evt-court-sacks.text':
      'Last at arbitration: the packing line suspects the paper-sack supplier of short-counting: the last three bales each came up a few sacks light. Nobody has counted a bale in front of the supplier. Their price is the best in the district.',
    'evt-court-sacks.choices.blacklist.label': 'Change supplier now',
    'evt-court-sacks.choices.blacklist.effect.modifier.label': 'New sack supplier',
    'evt-court-sacks.choices.blacklist.effect.result':
      'The supplier is dropped on suspicion. The county notes the mill acted without a count.',
    'evt-court-sacks.choices.audit.label': 'Pay for a counted delivery',
    'evt-court-sacks.choices.audit.effect.result':
      'Each bale is counted at the gate and comes up three sacks short. The supplier credits the account and fixes its counter.',
    'evt-court-sacks.choices.keep.label': 'Keep buying and say nothing',
    'evt-court-sacks.choices.keep.effect.result': 'The supplier stays and nothing is counted.',
    'evt-precedent.title': 'Another firm asks for the same terms',
    'evt-precedent.text':
      'The pest-control firm missed its visit because its van was flooded, and points out that Valley Haulage was allowed to work from the mill yard after abandoning a run. It asks for the same understanding.',
    'evt-precedent.choices.grant.label': 'Grant the same understanding',
    'evt-precedent.choices.grant.effect.modifier.label': 'Missed pest visit',
    'evt-precedent.choices.grant.effect.result':
      'The visit is rebooked for next week and the bran store waits.',
    'evt-precedent.choices.refuse.label': 'Hold this firm to its contract',
    'evt-precedent.choices.refuse.effect.result':
      'The firm sends a relief van the same day. The haulier hears the mill has two rules.',
    'evt-debt-pasta.title': 'The pasta works asks what was promised',
    'evt-debt-pasta.text':
      'Community Pasta Works writes to ask for the storage it was promised when the old granary went to the village bakery. The east bin would do. Its buyer copies the federation.',
    'evt-debt-pasta.choices.pay.label': 'Lease the pasta works the east bin as promised',
    'evt-debt-pasta.choices.pay.effect.result':
      'The east bin is cleaned out and leased to the pasta works.',
    'evt-debt-pasta.choices.refuse.label': 'Say the mill cannot spare it',
    'evt-debt-pasta.choices.refuse.effect.result':
      'The promise is broken. The pasta works says so to the federation.',
    'evt-sacks-short-again.title': 'The bales come up short again',
    'evt-sacks-short-again.text':
      'The packers count a bale by hand for the first time since arbitration day, and it is four sacks short. The supplier has been short-counting for weeks.',
    'evt-sacks-short-again.choices.claim.label': 'Count every bale and claim the shortfall',
    'evt-sacks-short-again.choices.claim.effect.result':
      'Every bale is counted at the gate and the shortfall is credited.',
    'evt-sacks-short-again.choices.let-go.label': 'Let it go',
    'evt-sacks-short-again.choices.let-go.effect.result':
      'The packers run short of sacks before the next delivery.',
    'evt-culvert-mason.title': 'The culvert mason',
    'evt-culvert-mason.text':
      'The stonemason who rebuilt the bridge at the ford looks at the culvert under the yard and says it would not carry a long storm. Rebuilding it now is cheap. Nothing else will change until the water comes.',
    'evt-culvert-mason.choices.works-crew.label': 'Have the drainage works crew rebuild it',
    'evt-culvert-mason.choices.works-crew.effect.result':
      'The crew that laid the drainage works rebuilds the culvert between jobs.',
    'evt-culvert-mason.choices.rebuild.label': 'Rebuild the culvert',
    'evt-culvert-mason.choices.rebuild.effect.result':
      'The culvert is rebuilt in dressed stone with twice the old bore.',
    'evt-culvert-mason.choices.decline.label': 'Leave the culvert as it is',
    'evt-culvert-mason.choices.decline.effect.result':
      'The mason is thanked and the culvert is left as it is.',
    'evt-switchgear-survey.title': 'The switchgear survey',
    'evt-switchgear-survey.text':
      'The electrical contractor offers to survey the roller-floor switchgear while the line is down for cleaning. They expect to find nothing urgent. A grid failure would find whatever they miss.',
    'evt-switchgear-survey.choices.survey.label': 'Commission the survey',
    'evt-switchgear-survey.choices.survey.effect.result':
      'The survey finds two loose busbar joints and a tired contactor, all put right.',
    'evt-switchgear-survey.choices.decline.label': 'Decline the survey',
    'evt-switchgear-survey.choices.decline.effect.result':
      'The survey is put off to the next shutdown.',
    'evt-quarry-stone.title': 'Stone for a flood wall',
    'evt-quarry-stone.text':
      'The quarry up the valley has dressed stone left over from the reservoir works, enough for a low flood wall round the grain stores. The stone is cheap. Hauling it needs twelve runs on the quarry road.',
    'evt-quarry-stone.choices.buy.label': 'Buy the stone',
    'evt-quarry-stone.choices.buy.effect.result':
      'The stone is bought and waits at the quarry for haulage.',
    'evt-quarry-stone.choices.decline.label': 'Leave the stone at the quarry',
    'evt-quarry-stone.choices.decline.effect.result': 'The stone goes to another buyer.',
    'evt-quarry-haul.title': 'Hauling the quarry stone',
    'evt-quarry-haul.text':
      'The stone for the flood wall is waiting at the quarry. Twelve runs on the quarry road will bring it down. A haulier that trusts the mill will make them between collections.',
    'evt-quarry-haul.choices.haulier.label': 'Ask Valley Haulage to make the runs',
    'evt-quarry-haul.choices.haulier.effect.result':
      'Valley Haulage brings the stone down between collections and the wall goes up.',
    'evt-quarry-haul.choices.hire.label': 'Hire quarry lorries',
    'evt-quarry-haul.choices.hire.effect.result':
      'Hired quarry lorries bring the stone down and the wall goes up.',
    'evt-quarry-haul.choices.leave.label': 'Leave the stone where it is',
    'evt-quarry-haul.choices.leave.effect.result': 'The stone stays at the quarry.',
    'evt-valley-meeting.title': 'The valley meeting',
    'evt-valley-meeting.text':
      'The village holds its annual meeting with the mill. The questions are about the harvest, the granary and the roads, and they are polite.',
    'evt-valley-meeting.echoes.0.because':
      'Because the mill’s food-standards approval is suspended',
    'evt-valley-meeting.echoes.0.text':
      'The village hall is full. The suspension is in the newspaper, and the meeting wants to know whether the flour in the school kitchens is safe.',
    'evt-valley-meeting.echoes.1.because':
      'Because the hail-struck farm’s contract was ended at arbitration',
    'evt-valley-meeting.echoes.1.text':
      'The hill growers have come down to the meeting. One of their farms was ruined by hail and then claimed against, and they want to know whether the mill stands with its growers.',
    'evt-valley-meeting.echoes.2.because':
      'Because the old granary was taken from the village bakery',
    'evt-valley-meeting.echoes.2.text':
      'The village committee speaks first. Its bakery has lost the old granary and is keeping flour in a barn, and it asks what the mill gives the village it stands in.',
    'evt-valley-meeting.echoes.3.because':
      'Because the standby cover was placed away from the intake',
    'evt-valley-meeting.echoes.3.text':
      'The growers ask about the storm season. The intake has no standby cover, and they want to know who will be there when the bins flood.',
    'evt-valley-meeting.choices.speak.label': 'Answer from the mill’s record',
    'evt-valley-meeting.choices.speak.effect.result':
      'The meeting hears the record read out and goes home satisfied.',
    'evt-valley-meeting.choices.principles.label': 'Speak to the Rochdale principles',
    'evt-valley-meeting.choices.principles.effect.result':
      'The meeting hears how a cooperative answers to its members, and agrees to meet again.',
    'evt-valley-meeting.choices.reserve.label': 'Open the reserve for a valley rebate',
    'evt-valley-meeting.choices.reserve.effect.result':
      'The mill pays a rebate from its reserve, and the meeting closes in good order.',
    'evt-valley-meeting.choices.close.label': 'Close the meeting',
    'evt-valley-meeting.choices.close.effect.result':
      'The meeting is closed with the questions unanswered.',
    'evt-valley-meeting.choices.close.variants.0.because':
      'Because Valley Haulage’s contract was ended at arbitration',
    'evt-valley-meeting.choices.close.variants.0.effect.result':
      'The meeting is closed unanswered, and the haulier’s drivers speak against the mill on the way out.',
    'evt-cleaning-log.title': 'A gap in the cleaning log',
    'evt-cleaning-log.text':
      'The night cleaning log for the sifting floor has a blank week: the cleaning was done, but the sheets were never signed. County Food Standards reads the log at every audit.',
    'evt-cleaning-log.choices.invoices.label': 'Ask the county to accept the contractor’s invoices',
    'evt-cleaning-log.choices.invoices.effect.result':
      'On the mill’s record, the county accepts the cleaning contractor’s invoices for the blank week.',
    'evt-cleaning-log.choices.report.label': 'Sign it as found and report the gap',
    'evt-cleaning-log.choices.report.effect.result':
      'The gap is reported with the contractor’s invoices attached. The county notes it.',
    'evt-cleaning-log.choices.reclean.label': 'Re-clean the floor and log it now',
    'evt-cleaning-log.choices.reclean.effect.modifier.label': 'Re-cleaning the sifting floor',
    'evt-cleaning-log.choices.reclean.effect.result':
      'The sifting floor is cleaned again and the log is complete from today.',
    'evt-cleaning-log.choices.backdate.label': 'Backdate the missing sheets',
    'evt-cleaning-log.choices.backdate.effect.result':
      'The auditor compares the sheet dates with the cleaning contractor’s invoices. The mill’s approval is suspended.',
    'evt-cleaning-log.choices.leave.label': 'Leave it for the audit',
    'evt-cleaning-log.choices.leave.effect.result':
      'The auditor finds the blank week and writes it up.',
    'evt-reinstatement-audit.title': 'The reinstatement audit',
    'evt-reinstatement-audit.text':
      'County Food Standards will reinstate the mill’s approval after a full audit: every record opened, every lot traced, every cleaning sheet checked against its invoice.',
    'evt-reinstatement-audit.choices.open.label': 'Open every record to the auditors',
    'evt-reinstatement-audit.choices.open.effect.result':
      'The audit runs for two days and the approval is reinstated.',
    'evt-reinstatement-audit.choices.wait.label': 'Ask for more time',
    'evt-reinstatement-audit.choices.wait.effect.result': 'The auditors agree to come back.',
    'evt-hire-sifter.title': 'A mobile sifter for hire',
    'evt-hire-sifter.text':
      'A plant-hire firm offers a mobile sifter for the busy weeks. Its large unit has twice the throughput and a coarser screen; its small unit is certified for flour and slower.',
    'evt-hire-sifter.choices.large.label': 'Hire the large unit',
    'evt-hire-sifter.choices.large.effect.modifier.label': 'Large mobile sifter',
    'evt-hire-sifter.choices.large.effect.result':
      'The large sifter arrives on a low-loader and the line runs faster and coarser.',
    'evt-hire-sifter.choices.small.label': 'Hire the certified unit',
    'evt-hire-sifter.choices.small.effect.modifier.label': 'Certified mobile sifter',
    'evt-hire-sifter.choices.small.effect.result':
      'The certified sifter is fitted and the line runs a little faster.',
    'evt-hire-sifter.choices.decline.label': 'Decline the hire',
    'evt-hire-sifter.choices.decline.effect.result': 'The plant-hire firm moves on.',
    'evt-premium-buyer.title': 'A city wholesaler’s premium',
    'evt-premium-buyer.text':
      'A city wholesaler offers a premium for first call on the mill’s strong white through the next crop year. Its buyers pay well and on time. Riverside Bakers’ Cooperative and County School Meals would wait behind it.',
    'evt-premium-buyer.choices.accept.label': 'Give the wholesaler first call',
    'evt-premium-buyer.choices.accept.effect.modifier.label': 'Wholesaler premium',
    'evt-premium-buyer.choices.accept.effect.result':
      'The wholesaler takes first call. The bakers and the school kitchens wait.',
    'evt-premium-buyer.choices.coop.label': 'Offer cooperative terms instead',
    'evt-premium-buyer.choices.coop.effect.modifier.label': 'Cooperative terms',
    'evt-premium-buyer.choices.coop.effect.result':
      'The wholesaler buys on the cooperative’s terms, behind the regular customers.',
    'evt-premium-buyer.choices.decline.label': 'Decline the premium',
    'evt-premium-buyer.choices.decline.effect.result': 'The wholesaler looks elsewhere.',
    'evt-second-haulier.title': 'A larger haulier calls',
    'evt-second-haulier.text':
      'A larger haulage firm offers to take the mill’s collections at a lower rate, with more lorries and less attention to any one customer. Valley Haulage hears about it the same day.',
    'evt-second-haulier.choices.switch.label': 'Move the collections to the larger firm',
    'evt-second-haulier.choices.switch.effect.modifier.label': 'Larger haulier',
    'evt-second-haulier.choices.switch.effect.result':
      'The larger firm takes the collections. Its lorries come when they come.',
    'evt-second-haulier.choices.share.label': 'Share the collections between them',
    'evt-second-haulier.choices.share.effect.result':
      'The collections are split between the two firms.',
    'evt-second-haulier.choices.stay.label': 'Stay with Valley Haulage',
    'evt-second-haulier.choices.stay.effect.result':
      'The mill stays with Valley Haulage, which notices.',
    'evt-long-night.title': 'The long night',
    'evt-long-night.text':
      'A storm front and a grid emergency arrive on the same night. The mill can put its own hands on one front. The other will have to hold on what was built for it.',
    'evt-long-night.choices.intake.label': 'Hold the intake and grain stores',
    'evt-long-night.choices.intake.effect.result':
      'The mill puts its own hands on the intake through the storm.',
    'evt-long-night.choices.floor.label': 'Hold the roller floor',
    'evt-long-night.choices.floor.effect.result':
      'The mill puts its own hands on the roller floor through the grid emergency.',
    'evt-long-night.choices.partner.label': 'Leave it to the AI partner',
    'evt-long-night.choices.partner.effect.result': 'The AI partner holds the roller floor.',
  },
  'pt-BR': {
    'evt-standby-cover.title': 'Onde fica a equipe de prontidão',
    'evt-standby-cover.text':
      'A região tem uma única empresa de manutenção de prontidão, e seu contrato permite ao moinho escolher onde os técnicos aguardam durante uma pane: na recepção e nos armazéns de grãos, no setor de moagem ou no pátio de expedição. Divididos entre os três, os técnicos não ficam muito tempo em lugar nenhum. O parceiro de IA os colocaria no setor de moagem.',
    'evt-standby-cover.choices.intake.label': 'Cobrir a recepção e os armazéns de grãos',
    'evt-standby-cover.choices.intake.effect.result':
      'Os técnicos ficam na recepção, onde os caminhões dos produtores descarregam.',
    'evt-standby-cover.choices.floor.label': 'Cobrir o setor de moagem',
    'evt-standby-cover.choices.floor.effect.result':
      'Os técnicos ficam no setor de moagem, ao lado da sala elétrica.',
    'evt-standby-cover.choices.yard.label': 'Cobrir o pátio de expedição',
    'evt-standby-cover.choices.yard.effect.result':
      'Os técnicos ficam no pátio de expedição, onde a transportadora carrega.',
    'evt-standby-cover.choices.thin.label': 'Distribuir a cobertura pela instalação',
    'evt-standby-cover.choices.thin.effect.result':
      'Os técnicos circulam entre as três áreas e não ficam muito tempo em lugar nenhum.',
    'evt-standby-cover.choices.partner.label': 'Deixar com o parceiro de IA',
    'evt-standby-cover.choices.partner.effect.result':
      'O parceiro de IA coloca a equipe de prontidão no setor de moagem.',
    'evt-court-short-weight.title': 'Os lotes abaixo do peso',
    'evt-court-short-weight.text':
      'O comitê de contratos atua como árbitro dos contratos de fornecimento nesta semana, um caso por turno. Primeiro: uma fazenda das colinas entregou três lotes abaixo do peso indicado nos comprovantes. O granizo derrubou seu trigo em junho e a conta está atrasada. O contrato permite a rescisão e a cobrança da diferença.',
    'evt-court-short-weight.choices.terminate.label': 'Rescindir o contrato e cobrar a diferença',
    'evt-court-short-weight.choices.terminate.effect.result':
      'O contrato é encerrado e a diferença é cobrada. As fazendas das colinas tomam nota.',
    'evt-court-short-weight.choices.dock.label': 'Descontar a diferença do pagamento',
    'evt-court-short-weight.choices.dock.effect.result':
      'A diferença é descontada do próximo pagamento e o contrato continua.',
    'evt-court-short-weight.choices.advance.label': 'Antecipar o contrato do próximo ano',
    'evt-court-short-weight.choices.advance.effect.result':
      'A fazenda recebe antecipadamente o contrato do próximo ano, para cobrir a conta das sementes.',
    'evt-court-short-weight.choices.partner.label': 'Entregar os casos do dia ao parceiro de IA',
    'evt-court-short-weight.choices.partner.effect.result':
      'O parceiro de IA aplica o contrato como está escrito e decide os casos restantes.',
    'evt-court-haulier.title': 'A viagem abandonada',
    'evt-court-haulier.text':
      'O próximo caso da arbitragem: Valley Haulage abandonou uma viagem da tarde no meio do caminho. Seu próprio depósito estava alagando e os caminhões eram necessários para levar o estoque a um local elevado. O contrato trata o abandono de uma viagem como descumprimento. A transportadora pede para manter o contrato.',
    'evt-court-haulier.choices.terminate.label': 'Rescindir o contrato de transporte',
    'evt-court-haulier.choices.terminate.effect.result':
      'O contrato é encerrado. A transportadora conclui a semana e retira seus caminhões.',
    'evt-court-haulier.choices.suspend.label':
      'Dar a Valley Haulage aviso de rescisão de uma safra',
    'evt-court-haulier.choices.suspend.effect.result':
      'Valley Haulage mantém o contrato com aviso de rescisão de uma safra. O condado considera o aviso justo.',
    'evt-court-haulier.choices.shelter.label':
      'Deixar Valley Haulage operar no pátio do moinho enquanto seu depósito seca',
    'evt-court-haulier.choices.shelter.effect.result':
      'Valley Haulage estaciona no pátio do moinho até seu depósito secar.',
    'evt-court-haulier.choices.partner.label': 'Entregar os casos restantes ao parceiro de IA',
    'evt-court-haulier.choices.partner.effect.result':
      'O parceiro de IA encerra o contrato de transporte e decide os casos restantes.',
    'evt-court-granary.title': 'O antigo celeiro',
    'evt-court-granary.text':
      'O próximo caso da arbitragem: há duas reivindicações sobre o antigo celeiro do outro lado da estrada. A gerência anterior o prometeu a Community Pasta Works para armazenar sêmola; o comitê da vila o usa há três anos para guardar a farinha de sua padaria comunitária e quer a confirmação desse uso. A escritura pertence ao moinho.',
    'evt-court-granary.choices.pasta.label': 'Honrar a promessa à fábrica de massas',
    'evt-court-granary.choices.pasta.effect.result':
      'A fábrica de massas fica com o celeiro; a padaria da vila retira sua farinha.',
    'evt-court-granary.choices.village.label': 'Confirmar o uso pela padaria da vila',
    'evt-court-granary.choices.village.effect.result':
      'A padaria da vila mantém o celeiro. A fábrica de massas não fica satisfeita.',
    'evt-court-granary.choices.compensate.label':
      'Confirmar o uso pela vila e prometer compensação à fábrica de massas',
    'evt-court-granary.choices.compensate.effect.result':
      'A vila mantém o celeiro e a fábrica de massas aceita a promessa de armazenamento mais adiante.',
    'evt-court-granary.choices.keep.label': 'Manter o celeiro para o moinho',
    'evt-court-granary.choices.keep.effect.result':
      'O moinho aluga o celeiro a um comerciante de sementes e guarda o aluguel.',
    'evt-court-granary.choices.partner.label': 'Entregar os casos restantes ao parceiro de IA',
    'evt-court-granary.choices.partner.effect.result':
      'O parceiro de IA honra a promessa antiga e decide o último caso.',
    'evt-court-sacks.title': 'Os fardos com sacos a menos',
    'evt-court-sacks.text':
      'O último caso da arbitragem: a linha de ensaque suspeita que o fornecedor de sacos de papel esteja entregando menos unidades. Nos últimos três fardos faltavam alguns sacos em cada um. Ninguém contou um fardo na presença do fornecedor. Seu preço é o melhor da região.',
    'evt-court-sacks.choices.blacklist.label': 'Trocar de fornecedor agora',
    'evt-court-sacks.choices.blacklist.effect.modifier.label': 'Novo fornecedor de sacos',
    'evt-court-sacks.choices.blacklist.effect.result':
      'O fornecedor é dispensado por suspeita. O condado registra que o moinho agiu sem fazer a contagem.',
    'evt-court-sacks.choices.audit.label': 'Pagar por uma entrega conferida',
    'evt-court-sacks.choices.audit.effect.result':
      'Cada fardo é contado na entrada e faltam três sacos em cada um. O fornecedor credita a conta e conserta seu contador.',
    'evt-court-sacks.choices.keep.label': 'Continuar comprando sem dizer nada',
    'evt-court-sacks.choices.keep.effect.result': 'O fornecedor continua e nada é contado.',
    'evt-precedent.title': 'Outra empresa pede o mesmo tratamento',
    'evt-precedent.text':
      'A empresa de controle de pragas faltou à visita porque sua van ficou alagada e lembra que Valley Haulage pôde trabalhar no pátio do moinho depois de abandonar uma viagem. Pede a mesma compreensão.',
    'evt-precedent.choices.grant.label': 'Conceder a mesma compreensão',
    'evt-precedent.choices.grant.effect.modifier.label': 'Visita de controle de pragas perdida',
    'evt-precedent.choices.grant.effect.result':
      'A visita é remarcada para a próxima semana e o depósito de farelo aguarda.',
    'evt-precedent.choices.refuse.label': 'Exigir que esta empresa cumpra o contrato',
    'evt-precedent.choices.refuse.effect.result':
      'A empresa envia uma van substituta no mesmo dia. A transportadora fica sabendo que o moinho usa dois critérios.',
    'evt-debt-pasta.title': 'A fábrica de massas cobra a promessa',
    'evt-debt-pasta.text':
      'Community Pasta Works escreve cobrando o espaço de armazenamento prometido quando o antigo celeiro ficou com a padaria da vila. O silo leste serviria. Seu comprador envia cópia à federação.',
    'evt-debt-pasta.choices.pay.label': 'Alugar o silo leste à fábrica de massas como prometido',
    'evt-debt-pasta.choices.pay.effect.result':
      'O silo leste é esvaziado, limpo e alugado à fábrica de massas.',
    'evt-debt-pasta.choices.refuse.label': 'Dizer que o moinho não pode cedê-lo',
    'evt-debt-pasta.choices.refuse.effect.result':
      'A promessa é quebrada. A fábrica de massas comunica isso à federação.',
    'evt-sacks-short-again.title': 'Voltam a faltar sacos nos fardos',
    'evt-sacks-short-again.text':
      'As ensacadeiras contam um fardo à mão pela primeira vez desde a arbitragem, e faltam quatro sacos. O fornecedor vem entregando sacos a menos há semanas.',
    'evt-sacks-short-again.choices.claim.label': 'Contar cada fardo e cobrar a diferença',
    'evt-sacks-short-again.choices.claim.effect.result':
      'Cada fardo é contado na entrada e a diferença é creditada.',
    'evt-sacks-short-again.choices.let-go.label': 'Deixar passar',
    'evt-sacks-short-again.choices.let-go.effect.result':
      'As ensacadeiras ficam sem sacos antes da próxima entrega.',
    'evt-culvert-mason.title': 'O pedreiro do bueiro',
    'evt-culvert-mason.text':
      'O pedreiro que reconstruiu a ponte no vau examina o bueiro sob o pátio e diz que ele não daria vazão a uma tempestade prolongada. Reconstruí-lo agora custa pouco. Nada mais mudará até a água chegar.',
    'evt-culvert-mason.choices.works-crew.label': 'Pedir à equipe de drenagem que o reconstrua',
    'evt-culvert-mason.choices.works-crew.effect.result':
      'A equipe que fez as obras de drenagem reconstrói o bueiro entre os serviços.',
    'evt-culvert-mason.choices.rebuild.label': 'Reconstruir o bueiro',
    'evt-culvert-mason.choices.rebuild.effect.result':
      'O bueiro é reconstruído em pedra lavrada, com o dobro da abertura anterior.',
    'evt-culvert-mason.choices.decline.label': 'Deixar o bueiro como está',
    'evt-culvert-mason.choices.decline.effect.result':
      'O pedreiro recebe os agradecimentos e o bueiro fica como está.',
    'evt-switchgear-survey.title': 'A inspeção dos equipamentos elétricos',
    'evt-switchgear-survey.text':
      'A empresa de instalações elétricas oferece uma inspeção dos equipamentos de manobra do setor de moagem enquanto a linha para para limpeza. Não esperam encontrar nada urgente. Uma falha da rede revelaria o que passasse despercebido.',
    'evt-switchgear-survey.choices.survey.label': 'Contratar a inspeção',
    'evt-switchgear-survey.choices.survey.effect.result':
      'A inspeção encontra duas conexões de barramento frouxas e um contator desgastado, todos corrigidos.',
    'evt-switchgear-survey.choices.decline.label': 'Recusar a inspeção',
    'evt-switchgear-survey.choices.decline.effect.result': 'A inspeção fica para a próxima parada.',
    'evt-quarry-stone.title': 'Pedra para um muro contra enchentes',
    'evt-quarry-stone.text':
      'A pedreira no alto do vale tem pedra lavrada que sobrou das obras do reservatório, suficiente para um muro baixo contra enchentes em volta dos armazéns de grãos. A pedra é barata. Transportá-la exige doze viagens pela estrada da pedreira.',
    'evt-quarry-stone.choices.buy.label': 'Comprar a pedra',
    'evt-quarry-stone.choices.buy.effect.result':
      'A pedra é comprada e aguarda transporte na pedreira.',
    'evt-quarry-stone.choices.decline.label': 'Deixar a pedra na pedreira',
    'evt-quarry-stone.choices.decline.effect.result': 'A pedra vai para outro comprador.',
    'evt-quarry-haul.title': 'O transporte da pedra da pedreira',
    'evt-quarry-haul.text':
      'A pedra para o muro contra enchentes aguarda na pedreira. Doze viagens pela estrada da pedreira a trarão para baixo. Uma transportadora que confie no moinho fará as viagens entre as coletas.',
    'evt-quarry-haul.choices.haulier.label': 'Pedir a Valley Haulage que faça as viagens',
    'evt-quarry-haul.choices.haulier.effect.result':
      'Valley Haulage traz a pedra entre as coletas e o muro é erguido.',
    'evt-quarry-haul.choices.hire.label': 'Contratar caminhões da pedreira',
    'evt-quarry-haul.choices.hire.effect.result':
      'Os caminhões contratados trazem a pedra e o muro é erguido.',
    'evt-quarry-haul.choices.leave.label': 'Deixar a pedra onde está',
    'evt-quarry-haul.choices.leave.effect.result': 'A pedra fica na pedreira.',
    'evt-valley-meeting.title': 'A reunião do vale',
    'evt-valley-meeting.text':
      'A vila realiza sua reunião anual com o moinho. As perguntas são sobre a colheita, o celeiro e as estradas, e são feitas com educação.',
    'evt-valley-meeting.echoes.0.because':
      'Porque a aprovação do moinho em segurança dos alimentos está suspensa',
    'evt-valley-meeting.echoes.0.text':
      'O salão da vila está cheio. A suspensão saiu no jornal, e os presentes querem saber se a farinha nas cozinhas das escolas é segura.',
    'evt-valley-meeting.echoes.1.because':
      'Porque o contrato da fazenda atingida pelo granizo foi encerrado na arbitragem',
    'evt-valley-meeting.echoes.1.text':
      'Os produtores das colinas vieram à reunião. Uma de suas fazendas foi arruinada pelo granizo e depois cobrada, e eles querem saber se o moinho está ao lado de seus produtores.',
    'evt-valley-meeting.echoes.2.because':
      'Porque o antigo celeiro foi retirado da padaria da vila',
    'evt-valley-meeting.echoes.2.text':
      'O comitê da vila fala primeiro. Sua padaria perdeu o antigo celeiro e está guardando farinha em um barracão; pergunta o que o moinho oferece à vila onde está instalado.',
    'evt-valley-meeting.echoes.3.because':
      'Porque a equipe de prontidão foi colocada longe da recepção',
    'evt-valley-meeting.echoes.3.text':
      'Os produtores perguntam sobre a temporada de tempestades. A recepção não tem cobertura de prontidão, e eles querem saber quem estará lá quando os silos alagarem.',
    'evt-valley-meeting.choices.speak.label': 'Responder com base no histórico do moinho',
    'evt-valley-meeting.choices.speak.effect.result':
      'Os presentes ouvem a leitura do histórico e voltam satisfeitos para casa.',
    'evt-valley-meeting.choices.principles.label': 'Falar dos princípios de Rochdale',
    'evt-valley-meeting.choices.principles.effect.result':
      'Os presentes ouvem como uma cooperativa responde aos seus cooperados e concordam em se reunir novamente.',
    'evt-valley-meeting.choices.reserve.label': 'Usar a reserva para um abatimento ao vale',
    'evt-valley-meeting.choices.reserve.effect.result':
      'O moinho paga um abatimento com sua reserva e a reunião termina em boa ordem.',
    'evt-valley-meeting.choices.close.label': 'Encerrar a reunião',
    'evt-valley-meeting.choices.close.effect.result':
      'A reunião é encerrada com as perguntas sem resposta.',
    'evt-valley-meeting.choices.close.variants.0.because':
      'Porque o contrato de Valley Haulage foi encerrado na arbitragem',
    'evt-valley-meeting.choices.close.variants.0.effect.result':
      'A reunião termina sem respostas, e os motoristas da transportadora falam contra o moinho na saída.',
    'evt-cleaning-log.title': 'Uma lacuna no registro de limpeza',
    'evt-cleaning-log.text':
      'O registro de limpeza noturna do setor de peneiramento tem uma semana em branco: a limpeza foi feita, mas as fichas nunca foram assinadas. County Food Standards lê o registro em toda auditoria.',
    'evt-cleaning-log.choices.invoices.label':
      'Pedir ao condado que aceite as notas da empresa de limpeza',
    'evt-cleaning-log.choices.invoices.effect.result':
      'Com base no histórico do moinho, o condado aceita as notas da empresa de limpeza para a semana em branco.',
    'evt-cleaning-log.choices.report.label': 'Registrar a situação encontrada e comunicar a lacuna',
    'evt-cleaning-log.choices.report.effect.result':
      'A lacuna é comunicada com as notas da empresa de limpeza anexadas. O condado registra a ocorrência.',
    'evt-cleaning-log.choices.reclean.label': 'Limpar o setor novamente e registrar agora',
    'evt-cleaning-log.choices.reclean.effect.modifier.label':
      'Nova limpeza do setor de peneiramento',
    'evt-cleaning-log.choices.reclean.effect.result':
      'O setor de peneiramento é limpo novamente e o registro fica completo a partir de hoje.',
    'evt-cleaning-log.choices.backdate.label': 'Colocar datas retroativas nas fichas ausentes',
    'evt-cleaning-log.choices.backdate.effect.result':
      'O auditor compara as datas das fichas com as notas da empresa de limpeza. A aprovação do moinho é suspensa.',
    'evt-cleaning-log.choices.leave.label': 'Deixar para a auditoria',
    'evt-cleaning-log.choices.leave.effect.result':
      'O auditor encontra a semana em branco e a registra no relatório.',
    'evt-reinstatement-audit.title': 'A auditoria de restabelecimento',
    'evt-reinstatement-audit.text':
      'County Food Standards restabelecerá a aprovação do moinho após uma auditoria completa: todos os registros abertos, todos os lotes rastreados e todas as fichas de limpeza conferidas com suas notas.',
    'evt-reinstatement-audit.choices.open.label': 'Abrir todos os registros aos auditores',
    'evt-reinstatement-audit.choices.open.effect.result':
      'A auditoria dura dois dias e a aprovação é restabelecida.',
    'evt-reinstatement-audit.choices.wait.label': 'Pedir mais tempo',
    'evt-reinstatement-audit.choices.wait.effect.result': 'Os auditores concordam em voltar.',
    'evt-hire-sifter.title': 'Um plansifter móvel para alugar',
    'evt-hire-sifter.text':
      'Uma locadora de equipamentos oferece um plansifter móvel para as semanas de maior movimento. A unidade grande tem o dobro da capacidade e uma peneira mais grossa; a pequena é certificada para farinha e mais lenta.',
    'evt-hire-sifter.choices.large.label': 'Alugar a unidade grande',
    'evt-hire-sifter.choices.large.effect.modifier.label': 'Plansifter móvel grande',
    'evt-hire-sifter.choices.large.effect.result':
      'O plansifter grande chega em um caminhão prancha e a linha opera mais rápido, com peneiramento mais grosso.',
    'evt-hire-sifter.choices.small.label': 'Alugar a unidade certificada',
    'evt-hire-sifter.choices.small.effect.modifier.label': 'Plansifter móvel certificado',
    'evt-hire-sifter.choices.small.effect.result':
      'O plansifter certificado é instalado e a linha opera um pouco mais rápido.',
    'evt-hire-sifter.choices.decline.label': 'Recusar o aluguel',
    'evt-hire-sifter.choices.decline.effect.result': 'A locadora de equipamentos segue adiante.',
    'evt-premium-buyer.title': 'Um preço extra do atacadista da cidade',
    'evt-premium-buyer.text':
      'Um atacadista da cidade oferece um preço extra pela prioridade sobre a farinha branca forte do moinho durante a próxima safra. Seus compradores pagam bem e em dia. Riverside Bakers’ Cooperative e County School Meals ficariam atrás dele.',
    'evt-premium-buyer.choices.accept.label': 'Dar prioridade ao atacadista',
    'evt-premium-buyer.choices.accept.effect.modifier.label': 'Preço extra do atacadista',
    'evt-premium-buyer.choices.accept.effect.result':
      'O atacadista recebe prioridade. Os padeiros e as cozinhas das escolas aguardam.',
    'evt-premium-buyer.choices.coop.label': 'Oferecer as condições da cooperativa',
    'evt-premium-buyer.choices.coop.effect.modifier.label': 'Condições da cooperativa',
    'evt-premium-buyer.choices.coop.effect.result':
      'O atacadista compra nas condições da cooperativa, atrás dos clientes regulares.',
    'evt-premium-buyer.choices.decline.label': 'Recusar o preço extra',
    'evt-premium-buyer.choices.decline.effect.result': 'O atacadista procura outro fornecedor.',
    'evt-second-haulier.title': 'Uma transportadora maior faz contato',
    'evt-second-haulier.text':
      'Uma transportadora maior oferece assumir as coletas do moinho por uma tarifa menor, com mais caminhões e menos atenção a cada cliente. Valley Haulage fica sabendo no mesmo dia.',
    'evt-second-haulier.choices.switch.label': 'Transferir as coletas para a empresa maior',
    'evt-second-haulier.choices.switch.effect.modifier.label': 'Transportadora maior',
    'evt-second-haulier.choices.switch.effect.result':
      'A empresa maior assume as coletas. Seus caminhões chegam quando podem.',
    'evt-second-haulier.choices.share.label': 'Dividir as coletas entre as duas',
    'evt-second-haulier.choices.share.effect.result':
      'As coletas são divididas entre as duas empresas.',
    'evt-second-haulier.choices.stay.label': 'Continuar com Valley Haulage',
    'evt-second-haulier.choices.stay.effect.result':
      'O moinho continua com Valley Haulage, que reconhece o gesto.',
    'evt-long-night.title': 'A longa noite',
    'evt-long-night.text':
      'Uma frente de tempestade e uma emergência na rede elétrica chegam na mesma noite. O moinho pode empregar sua própria equipe em uma frente. A outra terá de resistir com o que foi construído para ela.',
    'evt-long-night.choices.intake.label': 'Defender a recepção e os armazéns de grãos',
    'evt-long-night.choices.intake.effect.result':
      'O moinho emprega sua própria equipe na recepção durante a tempestade.',
    'evt-long-night.choices.floor.label': 'Defender o setor de moagem',
    'evt-long-night.choices.floor.effect.result':
      'O moinho emprega sua própria equipe no setor de moagem durante a emergência da rede.',
    'evt-long-night.choices.partner.label': 'Deixar com o parceiro de IA',
    'evt-long-night.choices.partner.effect.result': 'O parceiro de IA defende o setor de moagem.',
  },
});
